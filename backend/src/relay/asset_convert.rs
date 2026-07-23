/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 火山方舟视频素材 URL→素材ID 自动转换模块
//!
//! 当转发规则启用 `asset_convert: true` 时，在请求发送到上游前，
//! 扫描 content 数组中的 image_url/video_url/audio_url，
//! 将网络 URL 或 base64 数据通过 CreateAsset API 注册并替换为 `asset://<ASSET_ID>` 格式。
//!
//! 去重策略：
//! - URL 资源：HTTP HEAD 元数据指纹秒级去重（不下载文件）；HEAD 不可用时降级 URL 字符串匹配
//! - base64 数据：内存 SHA-256 内容哈希去重（零额外 IO）

use crate::AppState;
use sha2::{Digest, Sha256};
use std::time::Duration;

/// content 元素中需要扫描转换的 URL 类型映射
/// (content.type 值, 内部 URL 对象 key, 火山方舟 AssetType)
const URL_TYPE_MAP: &[(&str, &str, &str)] = &[
    ("image_url", "image_url", "Image"),
    ("video_url", "video_url", "Video"),
    ("audio_url", "audio_url", "Audio"),
];

/// base64 data URI 前缀与文件扩展名的映射
const BASE64_MIME_EXT: &[(&str, &str)] = &[
    ("data:image/png", "png"),
    ("data:image/jpeg", "jpg"),
    ("data:image/jpg", "jpg"),
    ("data:image/gif", "gif"),
    ("data:image/webp", "webp"),
    ("data:image/bmp", "bmp"),
    ("data:video/mp4", "mp4"),
    ("data:video/webm", "webm"),
    ("data:video/mov", "mov"),
    ("data:audio/mp3", "mp3"),
    ("data:audio/wav", "wav"),
    ("data:audio/mpeg", "mp3"),
    ("data:audio/ogg", "ogg"),
];

/// 扫描 upstream_body 的 content 数组，将网络 URL / base64 数据转换为火山方舟素材 ID。
///
/// - http/https URL：HEAD 元数据指纹去重 → URL 去重 → CreateAsset（不下载文件）
/// - data:base64：解码 → SHA-256 哈希去重 → TOS 临时上传 → CreateAsset → 删除临时文件
/// - 已是 asset:// 前缀的跳过
/// - 转换失败时记录失败原因，由调用方决定是否拦截
/// 返回值: (转换日志, 失败原因列表)
pub async fn convert_content_urls(
    state: &AppState,
    user_id: &str,
    plugin_ns: &str,
    body: &mut serde_json::Value,
    moderation: bool,
) -> (Vec<String>, Vec<String>) {
    let mut logs: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    // 检查对应的素材资产管理插件是否启用
    let plugin_enabled: bool = sqlx::query_scalar::<_, i64>(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = ?"),
    )
    .bind(plugin_ns)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|v| v == 1)
    .unwrap_or(false);

    if !plugin_enabled {
        tracing::debug!(
            "[AssetConvert] 素材资产管理插件({}) 未启用，跳过素材转换",
            plugin_ns
        );
        logs.push(format!("素材转换跳过: 插件({})未启用", plugin_ns));
        return (logs, errors);
    }

    // 加载 volcengine 审核配置（素材资产管理插件）
    let mut volc_config = match crate::api::plugins::get_volc_config(state, plugin_ns).await {
        Some(vc) => vc,
        None => {
            tracing::debug!(
                "[AssetConvert] 素材资产管理插件({}) 未配置审核凭证，跳过素材转换",
                plugin_ns
            );
            logs.push("素材转换跳过: 未配置审核凭证".to_string());
            return (logs, errors);
        }
    };

    // 获取 content 数组（可变引用）
    let content_arr = match body.get_mut("content").and_then(|c| c.as_array_mut()) {
        Some(arr) => arr,
        None => return (logs, errors),
    };

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), user_id.to_string())
        .with_source("relay_convert")
        .with_plugin_name(plugin_ns);

    // 确保有可用的 Group ID，如果没有则尝试自动创建并保存
    if !ensure_group_id(state, &client, &mut volc_config, plugin_ns).await {
        logs.push("素材转换失败: 无法获取或创建素材组ID".to_string());
        errors.push("素材转换失败: 无法获取或创建素材组ID".to_string());
        return (logs, errors);
    }

    // 预加载 TOS 配置（base64 场景需要）
    let tos_config = crate::api::plugins::get_tos_config(state, plugin_ns).await;

    // 收集需要转换的素材任务：(索引, url_key, asset_type, url_val, url_short)
    let mut tasks: Vec<(usize, String, String, String, String)> = Vec::new();
    for (idx, item) in content_arr.iter().enumerate() {
        let item_type = match item.get("type").and_then(|t| t.as_str()) {
            Some(t) => t.to_string(),
            None => continue,
        };
        let (url_key, asset_type) = match URL_TYPE_MAP.iter().find(|(t, _, _)| *t == item_type) {
            Some((_, uk, at)) => (uk.to_string(), at.to_string()),
            None => continue,
        };
        let url_val = match item
            .get(&url_key)
            .and_then(|u| u.get("url"))
            .and_then(|u| u.as_str())
        {
            Some(u) => u.to_string(),
            None => continue,
        };
        if url_val.starts_with("asset://") {
            continue;
        }
        let url_short = if url_val.starts_with("data:") {
            "base64数据".to_string()
        } else if url_val.len() > 80 {
            // 按字符边界安全截断，避免中文等多字节字符导致 panic
            let truncate_pos = url_val
                .char_indices()
                .nth(80)
                .map(|(i, _)| i)
                .unwrap_or(url_val.len());
            format!("{}...", &url_val[..truncate_pos])
        } else {
            url_val.clone()
        };
        tasks.push((idx, url_key, asset_type, url_val, url_short));
    }

    if tasks.is_empty() {
        return (logs, errors);
    }

    // 并发处理所有素材转换任务，大幅缩短多资源场景总耗时
    let mut futures = Vec::new();
    for (idx, url_key, asset_type, url_val, url_short) in tasks {
        let state_clone = state;
        let client_clone = client.clone();
        let mut volc_config_clone = volc_config.clone();
        let tos_config_clone = tos_config.clone();
        let user_id_owned = user_id.to_string();
        let plugin_ns_owned = plugin_ns.to_string();

        let fut = async move {
            // 返回 (asset_id, cached) — cached=true 表示复用了已有素材，未重新提交火山方舟
            let asset_result: Result<(String, bool), String> =
                if url_val.starts_with("http://") || url_val.starts_with("https://") {
                    convert_url_resource(
                        state_clone,
                        &client_clone,
                        &mut volc_config_clone,
                        &user_id_owned,
                        &plugin_ns_owned,
                        &url_val,
                        &asset_type,
                        moderation,
                    )
                    .await
                } else if url_val.starts_with("data:") {
                    convert_base64_resource(
                        state_clone,
                        &client_clone,
                        &mut volc_config_clone,
                        &tos_config_clone,
                        &user_id_owned,
                        &plugin_ns_owned,
                        &url_val,
                        &asset_type,
                        moderation,
                    )
                    .await
                } else {
                    Err("不支持的格式".to_string())
                };
            (idx, url_key, asset_type, url_short, asset_result)
        };
        futures.push(fut);
    }

    // 收集并发结果
    let results = futures::future::join_all(futures).await;
    for (idx, url_key, asset_type, url_short, asset_result) in results {
        match asset_result {
            Ok((aid, cached)) => {
                let asset_ref = format!("asset://{}", aid);
                if let Some(url_obj) = content_arr
                    .get_mut(idx)
                    .and_then(|item| item.get_mut(&url_key))
                    .and_then(|u| u.as_object_mut())
                {
                    url_obj.insert("url".to_string(), serde_json::json!(asset_ref));
                }
                let cache_tag = if cached { " [命中缓存]" } else { "" };
                logs.push(format!(
                    "[{}] {} ✓ {}{}",
                    asset_type, url_short, asset_ref, cache_tag
                ));
            }
            Err(reason) => {
                // 提取火山引擎错误中的 Message 字段用于日志摘要，完整错误由 errors 传递
                let brief = reason
                    .find('{')
                    .and_then(|i| serde_json::from_str::<serde_json::Value>(&reason[i..]).ok())
                    .and_then(|j| {
                        j.pointer("/ResponseMetadata/Error/Message")
                            .or_else(|| j.pointer("/Error/Message"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .unwrap_or_else(|| reason.clone());
                logs.push(format!(
                    "[{}] {} ✗ 转换失败: {}",
                    asset_type, url_short, brief
                ));
                errors.push(reason);
            }
        }
    }
    (logs, errors)
}

/// 处理网络 URL 资源：HEAD 元数据指纹去重 → URL 去重 → 直接 CreateAsset（不下载文件）
/// 返回 (asset_id, cached) — cached=true 表示复用了已有素材
async fn convert_url_resource(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
    user_id: &str,
    plugin_ns: &str,
    url: &str,
    asset_type: &str,
    moderation: bool,
) -> Result<(String, bool), String> {
    // L1: HTTP HEAD 元数据指纹快速去重（<1s，不下载文件）
    let meta_fp = fetch_meta_fingerprint(&state.http_client, url).await;
    if let Some(ref fp) = meta_fp {
        if let Some(aid) = query_by_fingerprint(state, fp, plugin_ns).await {
            tracing::info!(
                "[AssetConvert] 元数据指纹命中，复用素材: fp={:.16}... -> {}",
                fp,
                aid
            );
            return Ok((aid, true));
        }
        // 指纹有效但未命中 → 内容可能已变化（同 URL 覆盖上传），跳过 L2 URL 兜底
        let url_short = if url.len() > 80 {
            let pos = url
                .char_indices()
                .nth(80)
                .map(|(i, _)| i)
                .unwrap_or(url.len());
            format!("{}...", &url[..pos])
        } else {
            url.to_string()
        };
        tracing::info!(
            "[AssetConvert] 元数据指纹未命中(内容可能已变化)，将重新注册素材: {}",
            url_short
        );
    } else {
        // L2: HEAD 失败/无有效标识字段时降级 URL 字符串去重（兼容历史数据）
        if let Some(aid) = query_by_url(state, url, plugin_ns).await {
            tracing::info!(
                "[AssetConvert] URL 匹配命中(HEAD 不可用)，复用素材: -> {}",
                aid
            );
            return Ok((aid, true));
        }
    }

    // 未命中任何去重层，直接提交 URL 给火山方舟 CreateAsset（由火山方舟自行下载处理）
    match create_asset(
        state,
        client,
        volc_config,
        plugin_ns,
        url,
        asset_type,
        moderation,
    )
    .await
    {
        Ok(aid) => {
            let fp_ref = meta_fp.as_deref();
            insert_asset_record_raw(
                state, user_id, asset_type, url, &aid, None, fp_ref, plugin_ns,
            )
            .await;
            tracing::info!("[AssetConvert] 新素材注册成功: {} -> {}", url, aid);
            Ok((aid, false))
        }
        Err(reason) => {
            tracing::warn!("[AssetConvert] 素材注册失败: {} - URL: {}", reason, url);
            Err(reason)
        }
    }
}

/// 处理 base64 数据：解码 → SHA-256 哈希 → 去重 → TOS 临时上传 → CreateAsset → 删除临时文件
/// 返回 (asset_id, cached) — cached=true 表示复用了已有素材
async fn convert_base64_resource(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
    tos_config: &Option<crate::services::tos::TosConfig>,
    user_id: &str,
    plugin_ns: &str,
    data_uri: &str,
    asset_type: &str,
    moderation: bool,
) -> Result<(String, bool), String> {
    let (bytes, ext) =
        decode_base64_data(data_uri).ok_or_else(|| "base64 数据解码失败".to_string())?;

    let content_hash = hex::encode(Sha256::digest(&bytes));

    if let Some(aid) = query_by_hash(state, &content_hash, plugin_ns).await {
        tracing::info!(
            "[AssetConvert] base64 哈希命中，复用素材: hash={:.16}... -> {}",
            content_hash,
            aid
        );
        return Ok((aid, true));
    }

    let tos_cfg = tos_config
        .as_ref()
        .ok_or_else(|| "base64 转换需要 TOS 配置，但未配置存储".to_string())?;

    let tmp_filename = format!("{}.{}", &content_hash[..16], ext);
    let tmp_object_key = tos_cfg.full_key(&format!("_tmp_asset_convert/{}", tmp_filename));

    let tmp_url = crate::services::tos::upload_file(
        tos_cfg,
        &tmp_object_key,
        bytes,
        &format!("{}/{}", asset_type.to_lowercase(), ext),
        None,
    )
    .await
    .map_err(|e| format!("TOS 临时文件上传失败: {}", e))?;

    tracing::info!("[AssetConvert] base64 临时文件已上传: {}", tmp_url);

    let result = match create_asset(
        state,
        client,
        volc_config,
        plugin_ns,
        &tmp_url,
        asset_type,
        moderation,
    )
    .await
    {
        Ok(aid) => {
            insert_asset_record_raw(
                state,
                user_id,
                asset_type,
                &tmp_url,
                &aid,
                Some(&content_hash),
                None,
                plugin_ns,
            )
            .await;
            tracing::info!(
                "[AssetConvert] base64 素材注册成功: base64_{}.{} -> {}",
                &content_hash[..8],
                ext,
                aid
            );
            Ok((aid, false))
        }
        Err(reason) => Err(reason),
    };

    // 异步删除 TOS 临时文件，不阻塞主流程
    let tos_cfg_clone = tos_cfg.clone();
    let tmp_key_clone = tmp_object_key.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        match crate::services::tos::delete_file(&tos_cfg_clone, &tmp_key_clone).await {
            Ok(_) => tracing::info!("[AssetConvert] TOS 临时文件已清理: {}", tmp_key_clone),
            Err(e) => tracing::warn!(
                "[AssetConvert] TOS 临时文件清理失败(非致命): {} - {}",
                tmp_key_clone,
                e
            ),
        }
    });

    result
}

// ========== 内部工具函数 ==========

/// 发送 HTTP HEAD 请求获取资源元数据指纹，用于快速去重（不下载文件内容）。
/// 指纹 = SHA-256(URL域名+路径 | Content-Length | ETag | Last-Modified)
/// 不含 query/fragment，避免 CDN 签名 URL 每次不同导致无法去重。
/// 超时 5 秒，失败返回 None（调用方降级到 URL 字符串匹配）。
async fn fetch_meta_fingerprint(http_client: &reqwest::Client, url: &str) -> Option<String> {
    let url_short = if url.len() > 80 {
        let pos = url
            .char_indices()
            .nth(80)
            .map(|(i, _)| i)
            .unwrap_or(url.len());
        format!("{}...", &url[..pos])
    } else {
        url.to_string()
    };

    let resp = match http_client
        .head(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(
                "[AssetConvert] HEAD 请求失败，降级 URL 去重: {} - {}",
                url_short,
                e
            );
            return None;
        }
    };

    if !resp.status().is_success() {
        tracing::warn!(
            "[AssetConvert] HEAD 状态码异常({}), 降级 URL 去重: {}",
            resp.status(),
            url_short
        );
        return None;
    }

    let headers = resp.headers();
    let content_length = headers
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let etag = headers
        .get("etag")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let last_modified = headers
        .get("last-modified")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // 至少需要一个有效的标识字段，否则指纹不可靠
    if content_length.is_empty() && etag.is_empty() && last_modified.is_empty() {
        tracing::info!("[AssetConvert] HEAD 无有效标识字段(Content-Length/ETag/Last-Modified), 降级 URL 去重: {}", url_short);
        return None;
    }

    tracing::info!(
        "[AssetConvert] HEAD 元数据: Content-Length={}, ETag={}, Last-Modified={} | {}",
        if content_length.is_empty() {
            "-"
        } else {
            content_length
        },
        if etag.is_empty() { "-" } else { etag },
        if last_modified.is_empty() {
            "-"
        } else {
            last_modified
        },
        url_short
    );

    // 提取 URL 域名+路径（不含 query/fragment，避免签名 URL 每次不同）
    let url_base = url
        .split('?')
        .next()
        .unwrap_or(url)
        .split('#')
        .next()
        .unwrap_or(url);

    let mut hasher = Sha256::new();
    hasher.update(url_base.as_bytes());
    hasher.update(b"|");
    hasher.update(content_length.as_bytes());
    hasher.update(b"|");
    hasher.update(etag.as_bytes());
    hasher.update(b"|");
    hasher.update(last_modified.as_bytes());

    Some(hex::encode(hasher.finalize()))
}

/// 基于 meta_fingerprint 查询已有的素材 ID
async fn query_by_fingerprint(
    state: &AppState,
    fingerprint: &str,
    plugin_ns: &str,
) -> Option<String> {
    query_by_fingerprint_with_source(state, fingerprint, plugin_ns, "relay_convert").await
}

async fn query_by_fingerprint_with_source(
    state: &AppState,
    fingerprint: &str,
    plugin_ns: &str,
    source: &str,
) -> Option<String> {
    sqlx::query_as::<_, (String,)>(
        &state.db.format_query(
            "SELECT asset_id FROM plugin_assets WHERE meta_fingerprint = ? AND source = ? AND asset_id IS NOT NULL AND plugin_ns = ? LIMIT 1"
        )
    )
    .bind(fingerprint)
    .bind(source)
    .bind(plugin_ns)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|row| row.0)
}

/// 基于 file_url 查询已有的素材 ID（兜底去重，兼容历史数据）
async fn query_by_url(state: &AppState, url: &str, plugin_ns: &str) -> Option<String> {
    query_by_url_with_source(state, url, plugin_ns, "relay_convert").await
}

async fn query_by_url_with_source(
    state: &AppState,
    url: &str,
    plugin_ns: &str,
    source: &str,
) -> Option<String> {
    sqlx::query_as::<_, (String,)>(
        &state.db.format_query(
            "SELECT asset_id FROM plugin_assets WHERE file_url = ? AND source = ? AND asset_id IS NOT NULL AND plugin_ns = ? LIMIT 1"
        )
    )
    .bind(url)
    .bind(source)
    .bind(plugin_ns)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|row| row.0)
}

/// 解码 base64 data URI，返回 (原始字节, 文件扩展名)
fn decode_base64_data(data_uri: &str) -> Option<(Vec<u8>, String)> {
    let comma_pos = data_uri.find(',')?;
    let header = &data_uri[..comma_pos];
    let b64_data = super::forward::b64_data(data_uri);

    // 根据 MIME 类型推断扩展名
    let ext = BASE64_MIME_EXT
        .iter()
        .find(|(prefix, _)| header.starts_with(prefix))
        .map(|(_, e)| e.to_string())
        .unwrap_or_else(|| "bin".to_string());

    // 解码 base64
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data.trim())
        .ok()?;

    if bytes.is_empty() {
        return None;
    }

    Some((bytes, ext))
}

/// 基于 content_hash 查询已有的素材 ID（仅 base64 流程使用）
async fn query_by_hash(state: &AppState, content_hash: &str, plugin_ns: &str) -> Option<String> {
    query_by_hash_with_source(state, content_hash, plugin_ns, "relay_convert").await
}

async fn query_by_hash_with_source(
    state: &AppState,
    content_hash: &str,
    plugin_ns: &str,
    source: &str,
) -> Option<String> {
    sqlx::query_as::<_, (String,)>(
        &state.db.format_query(
            "SELECT asset_id FROM plugin_assets WHERE content_hash = ? AND source = ? AND asset_id IS NOT NULL AND plugin_ns = ? LIMIT 1"
        )
    )
    .bind(content_hash)
    .bind(source)
    .bind(plugin_ns)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|row| row.0)
}

/// 写入 plugin_assets 数据库记录（content_hash 和 meta_fingerprint 均可选）
async fn insert_asset_record_raw(
    state: &AppState,
    user_id: &str,
    asset_type: &str,
    file_url: &str,
    asset_id: &str,
    content_hash: Option<&str>,
    meta_fingerprint: Option<&str>,
    plugin_ns: &str,
) {
    insert_asset_record_with_source(
        state,
        user_id,
        asset_type,
        file_url,
        asset_id,
        content_hash,
        meta_fingerprint,
        plugin_ns,
        "relay_convert",
    )
    .await;
}

#[allow(clippy::too_many_arguments)]
async fn insert_asset_record_with_source(
    state: &AppState,
    user_id: &str,
    asset_type: &str,
    file_url: &str,
    asset_id: &str,
    content_hash: Option<&str>,
    meta_fingerprint: Option<&str>,
    plugin_ns: &str,
    source: &str,
) {
    let at_lower = asset_type.to_lowercase();
    let fname = file_url.rsplit('/').next().unwrap_or("unknown").to_string();
    let _ = sqlx::query(
        &state.db.format_query(
            "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category, content_hash, meta_fingerprint, plugin_ns) \
             VALUES (?, ?, ?, 'approved', ?, ?, ?, '转换素材', ?, ?, ?)"
        )
    )
    .bind(user_id)
    .bind(&at_lower)
    .bind(source)
    .bind(&fname)
    .bind(file_url)
    .bind(asset_id)
    .bind(content_hash)
    .bind(meta_fingerprint)
    .bind(plugin_ns)
    .execute(&state.db.pool)
    .await;
}

/// 调用 CreateAsset API 注册素材，并轮询等待素材处理完成（Active 状态）
/// 视频资源处理时间较长，自动根据素材类型调整超时（Image: 30s, Video/Audio: 60s）
async fn create_asset(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
    plugin_ns: &str,
    url: &str,
    asset_type: &str,
    moderation: bool,
) -> Result<String, String> {
    let group_id = volc_config.group_id.clone().unwrap_or_default();

    let asset_mod = if moderation {
        Some(crate::services::volcengine::AssetModerationConfig {
            strategy: "Skip".to_string(),
        })
    } else {
        None
    };

    let mut req = crate::services::volcengine::CreateAssetRequest {
        group_id: group_id.clone(),
        url: url.to_string(),
        asset_type: asset_type.to_string(),
        name: None,
        project_name: Some(volc_config.project_name.clone()),
        moderation: asset_mod.clone(),
    };

    let mut asset_id_res = client
        .call_api::<_, crate::services::volcengine::CreateAssetResponse>(
            "ark",
            &volc_config.region,
            "CreateAsset",
            "2024-01-01",
            crate::services::volcengine::CreateAssetRequest {
                group_id: req.group_id.clone(),
                url: req.url.clone(),
                asset_type: req.asset_type.clone(),
                name: req.name.clone(),
                project_name: req.project_name.clone(),
                moderation: req.moderation.clone(),
            },
        )
        .await;

    // 错误处理：如果是无效的素材组（比如换了 Access Key），尝试重新生成一次
    if let Err(e) = &asset_id_res {
        let e_lower = e.to_string().to_lowercase();
        // 启发式判断：如果错误提示与 group、权限有关，则尝试重置 GroupID
        // 避免因为单纯的图片 URL 无效或网络超时导致滥建素材组
        if e_lower.contains("group") || e_lower.contains("auth") {
            tracing::warn!("[AssetConvert] CreateAsset 失败，可能由于 AccessKey 变更导致原 GroupID 无效，准备重试。原错误: {}", e);

            // 防止高并发下产生多个冗余 Group，先从数据库重新拉取一次最新配置，判断是否已被其他并发请求刷新
            if let Some(latest_cfg) = crate::api::plugins::get_volc_config(state, plugin_ns).await {
                if latest_cfg.group_id.is_some() && latest_cfg.group_id != Some(group_id.clone()) {
                    tracing::info!(
                        "[AssetConvert] 发现其他并发请求已更新素材组 ID，直接复用: {:?}",
                        latest_cfg.group_id
                    );
                    volc_config.group_id = latest_cfg.group_id;
                } else {
                    // 数据库里的配置未变，说明确实需要当前请求去申请一个新的
                    volc_config.group_id = None;
                    ensure_group_id(state, client, volc_config, plugin_ns).await;
                }
            } else {
                volc_config.group_id = None;
                ensure_group_id(state, client, volc_config, plugin_ns).await;
            }

            req.group_id = volc_config.group_id.clone().unwrap_or_default();
            asset_id_res = client
                .call_api::<_, crate::services::volcengine::CreateAssetResponse>(
                    "ark",
                    &volc_config.region,
                    "CreateAsset",
                    "2024-01-01",
                    req,
                )
                .await;
        }
    }

    let asset_id = asset_id_res.map_err(|e| format!("素材转换失败: {}", e))?.id;

    // 视频/音频资源处理时间较长，动态调整轮询超时
    // Image: 60s, Audio: 120s, Video: 180s（视频文件体积大，火山端处理更耗时）
    let max_wait_secs: u64 = match asset_type {
        "Image" => 60,
        "Audio" => 120,
        _ => 180,
    };
    const POLL_INTERVAL_SECS: u64 = 3;
    let max_attempts = max_wait_secs / POLL_INTERVAL_SECS;
    let mut last_poll_error: Option<String> = None;

    for attempt in 0..max_attempts {
        tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;

        let get_req = crate::services::volcengine::GetAssetRequest {
            id: asset_id.clone(),
            project_name: Some(volc_config.project_name.clone()),
        };

        match client
            .call_api::<_, crate::services::volcengine::GetAssetResponse>(
                "ark",
                &volc_config.region,
                "GetAsset",
                "2024-01-01",
                get_req,
            )
            .await
        {
            Ok(res) => match res.status.as_str() {
                "Active" => {
                    tracing::info!(
                        "[AssetConvert] 素材就绪: {} (等待 {}s)",
                        asset_id,
                        (attempt + 1) * POLL_INTERVAL_SECS
                    );
                    return Ok(asset_id);
                }
                "Failed" => {
                    let reason = if let Some(ref err) = res.error {
                        if !err.message.is_empty() {
                            err.message.clone()
                        } else if !err.code.is_empty() {
                            err.code.clone()
                        } else {
                            "审核未通过".to_string()
                        }
                    } else {
                        let fail_code = res.fail_code.as_deref().unwrap_or("");
                        let fail_reason = res.fail_reason.as_deref().unwrap_or("");
                        match (fail_code.is_empty(), fail_reason.is_empty()) {
                            (false, false) => format!("[{}] {}", fail_code, fail_reason),
                            (false, true) => format!("[{}]", fail_code),
                            (true, false) => fail_reason.to_string(),
                            (true, true) => "审核未通过".to_string(),
                        }
                    };
                    tracing::error!("[AssetConvert] 素材处理失败: {} - {}", asset_id, reason);
                    return Err(format!("素材处理失败({}): {}", asset_id, reason));
                }
                status => {
                    tracing::debug!(
                        "[AssetConvert] 素材处理中: {} status={} (第{}/{}次)",
                        asset_id,
                        status,
                        attempt + 1,
                        max_attempts
                    );
                }
            },
            Err(e) => {
                let err_str = e.to_string();
                tracing::warn!(
                    "[AssetConvert] GetAsset 查询失败: {} - {}",
                    asset_id,
                    err_str
                );
                last_poll_error = Some(err_str);
            }
        }
    }

    // 超时时包含最后一次轮询错误原因，便于用户排查
    let timeout_msg = if let Some(ref poll_err) = last_poll_error {
        format!(
            "素材处理超时({}s): {}, 错误: {}",
            max_wait_secs, asset_id, poll_err
        )
    } else {
        format!("素材处理超时({}s): {}", max_wait_secs, asset_id)
    };
    Err(timeout_msg)
}

/// 自动保证 Group ID 存在，未设置时调用 API 自动生成并持久化
async fn ensure_group_id(
    state: &crate::AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
    plugin_ns: &str,
) -> bool {
    // 如果已经有非空的 ID 则直接通过
    if volc_config
        .group_id
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return true;
    }

    // 调用 API 默认生成一个
    let req = crate::services::volcengine::CreateAssetGroupRequest {
        name: "tokensbyte_auto_generated_group".to_string(),
        description: "由 Tokensbyte 系统自动生成的转换素材专用群组".to_string(),
        group_type: Some("AIGC".to_string()),
        project_name: Some(volc_config.project_name.clone()),
    };

    match client
        .call_api::<_, crate::services::volcengine::CreateAssetGroupResponse>(
            "ark",
            &volc_config.region,
            "CreateAssetGroup",
            "2024-01-01",
            req,
        )
        .await
    {
        Ok(res) => {
            let new_sg_id = res.id;
            tracing::info!("[AssetConvert] 成功自动生成 Ark 素材组 ID: {}", new_sg_id);
            volc_config.group_id = Some(new_sg_id.clone());

            // 存入数据库
            let update_res = sqlx::query(
                &state.db.format_query("UPDATE plugin_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE plugin_name = ? AND config_key = 'volc_group_id'")
            )
            .bind(&new_sg_id)
            .bind(plugin_ns)
            .execute(&state.db.pool)
            .await;

            if let Ok(r) = update_res {
                if r.rows_affected() == 0 {
                    let _ = sqlx::query(
                        &state.db.format_query("INSERT INTO plugin_configs (plugin_name, config_key, config_value) VALUES (?, 'volc_group_id', ?)")
                    )
                    .bind(plugin_ns)
                    .bind(&new_sg_id)
                    .execute(&state.db.pool)
                    .await;
                }
            }
            true
        }
        Err(e) => {
            tracing::error!(
                "[AssetConvert] 自动生成 Ark 素材组失败，未满足必需属性，拦截执行: {}",
                e
            );
            false
        }
    }
}

const UPSTREAM_SOURCE: &str = "upstream_relay_convert";
const UPSTREAM_PLUGIN: &str = "upstream_asset_relay";

/// 上游渠道素材转换：扫描 content[]，经绑定渠道 Bearer CreateAsset → asset://
/// 与 convert_content_urls 正交；插件未启用时 soft-skip（errors 空）。
pub async fn convert_content_urls_via_upstream(
    state: &AppState,
    user_id: &str,
    binding_id: i64,
    body: &mut serde_json::Value,
) -> (Vec<String>, Vec<String>) {
    let mut logs: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    let plugin_enabled: bool = sqlx::query_scalar::<_, i64>(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = ?"),
    )
    .bind(UPSTREAM_PLUGIN)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|v| v == 1)
    .unwrap_or(false);

    if !plugin_enabled {
        tracing::debug!("[UpstreamAsset] 插件未启用，跳过素材转换");
        logs.push("上游素材转换跳过: 插件未启用".to_string());
        return (logs, errors);
    }

    #[derive(sqlx::FromRow)]
    struct BindingRow {
        is_active: i32,
        asset_base_path: String,
        group_id: Option<String>,
        channel_config_id: i64,
        base_url: String,
        api_key: String,
    }

    let row: Option<BindingRow> = sqlx::query_as(&state.db.format_query(
        "SELECT b.is_active, b.asset_base_path, b.group_id, b.channel_config_id, \
                    c.base_url, c.api_key \
             FROM upstream_asset_bindings b \
             JOIN channel_configs c ON c.id = b.channel_config_id \
             WHERE b.id = ?",
    ))
    .bind(binding_id)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten();

    let Some(mut row) = row else {
        errors.push(format!(
            "上游素材转换失败: 绑定#{} 不存在或上游渠道配置已删除",
            binding_id
        ));
        return (logs, errors);
    };
    if row.is_active != 1 {
        logs.push(format!("上游素材转换跳过: 绑定#{} 已停用", binding_id));
        return (logs, errors);
    }
    if row.base_url.trim().is_empty() || row.api_key.trim().is_empty() {
        errors.push(format!(
            "上游素材转换失败: 上游渠道配置#{} 缺少 base_url 或 api_key",
            row.channel_config_id
        ));
        return (logs, errors);
    }

    let content_arr = match body.get_mut("content").and_then(|c| c.as_array_mut()) {
        Some(arr) => arr,
        None => return (logs, errors),
    };

    let plugin_ns = format!("uar:{}", binding_id);
    let endpoint = crate::services::upstream_asset_client::build_asset_endpoint(
        &row.base_url,
        &row.asset_base_path,
    );
    let api_key = row.api_key.clone();
    let call_ctx = crate::services::upstream_asset_client::UpstreamCallCtx {
        http: &state.http_client,
        db: &state.db,
        user_id,
        plugin_name: &plugin_ns,
        endpoint_base: &endpoint,
        api_key: &api_key,
    };

    // 确保 GroupId
    if row
        .group_id
        .as_ref()
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        match ensure_upstream_group_id(state, &call_ctx, binding_id).await {
            Ok(gid) => row.group_id = Some(gid),
            Err(e) => {
                errors.push(e);
                return (logs, errors);
            }
        }
    }

    let mut tasks: Vec<(usize, String, String, String, String)> = Vec::new();
    for (idx, item) in content_arr.iter().enumerate() {
        let item_type = match item.get("type").and_then(|t| t.as_str()) {
            Some(t) => t,
            None => continue,
        };
        let (url_key, asset_type) = match URL_TYPE_MAP.iter().find(|(t, _, _)| *t == item_type) {
            Some((_, uk, at)) => (*uk, *at),
            None => continue,
        };
        let url_val = match item
            .get(url_key)
            .and_then(|u| u.get("url"))
            .and_then(|u| u.as_str())
        {
            Some(u) => u.to_string(),
            None => continue,
        };
        if url_val.starts_with("asset://") {
            continue;
        }
        let url_short = if url_val.starts_with("data:") {
            "base64数据".to_string()
        } else if url_val.len() > 80 {
            let pos = url_val
                .char_indices()
                .nth(80)
                .map(|(i, _)| i)
                .unwrap_or(url_val.len());
            format!("{}...", &url_val[..pos])
        } else {
            url_val.clone()
        };
        tasks.push((
            idx,
            url_key.to_string(),
            asset_type.to_string(),
            url_val,
            url_short,
        ));
    }

    if tasks.is_empty() {
        return (logs, errors);
    }

    let group_id = row.group_id.clone().unwrap_or_default();
    for (idx, url_key, asset_type, url_val, url_short) in tasks {
        if url_val.starts_with("data:") {
            let msg = format!(
                "[{}] {} ✗ 上游素材转换不支持 base64，请使用 http(s) URL",
                asset_type, url_short
            );
            logs.push(msg.clone());
            errors.push(msg);
            continue;
        }
        if !(url_val.starts_with("http://") || url_val.starts_with("https://")) {
            let msg = format!("[{}] {} ✗ 不支持的格式", asset_type, url_short);
            logs.push(msg.clone());
            errors.push(msg);
            continue;
        }

        match convert_url_via_upstream(state, &call_ctx, &group_id, &url_val, &asset_type).await {
            Ok((aid, cached)) => {
                let asset_ref = format!("asset://{}", aid);
                if let Some(url_obj) = content_arr
                    .get_mut(idx)
                    .and_then(|item| item.get_mut(&url_key))
                    .and_then(|u| u.as_object_mut())
                {
                    url_obj.insert("url".to_string(), serde_json::Value::String(asset_ref));
                }
                let tag = if cached { " [命中缓存]" } else { "" };
                logs.push(format!(
                    "[{}] {} ✓ asset://{}{}",
                    asset_type, url_short, aid, tag
                ));
            }
            Err(reason) => {
                logs.push(format!("[{}] {} ✗ {}", asset_type, url_short, reason));
                errors.push(reason);
            }
        }
    }

    (logs, errors)
}

async fn ensure_upstream_group_id(
    state: &AppState,
    ctx: &crate::services::upstream_asset_client::UpstreamCallCtx<'_>,
    binding_id: i64,
) -> Result<String, String> {
    let body = serde_json::json!({
        "Name": "tokensbyte_upstream_auto_group",
        "Description": "由上游素材中转自动创建的素材组",
        "GroupType": "AIGC"
    });
    let res =
        crate::services::upstream_asset_client::call_action_logged(ctx, "CreateAssetGroup", &body)
            .await
            .map_err(|e| format!("创建上游素材组失败: {}", e))?;

    let gid = crate::services::upstream_asset_client::extract_result_field(&res, "Id")
        .ok_or_else(|| "创建上游素材组失败: 响应缺少 Id".to_string())?
        .to_string();

    let _ = sqlx::query(
        &state.db.format_query(
            "UPDATE upstream_asset_bindings SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ),
    )
    .bind(&gid)
    .bind(binding_id)
    .execute(&state.db.pool)
    .await;

    tracing::info!(
        "[UpstreamAsset] 自动创建素材组并回写绑定#{}: {}",
        binding_id,
        gid
    );
    Ok(gid)
}

async fn convert_url_via_upstream(
    state: &AppState,
    ctx: &crate::services::upstream_asset_client::UpstreamCallCtx<'_>,
    group_id: &str,
    url: &str,
    asset_type: &str,
) -> Result<(String, bool), String> {
    let meta_fp = fetch_meta_fingerprint(ctx.http, url).await;
    if let Some(ref fp) = meta_fp {
        if let Some(aid) =
            query_by_fingerprint_with_source(state, fp, ctx.plugin_name, UPSTREAM_SOURCE).await
        {
            return Ok((aid, true));
        }
    } else if let Some(aid) =
        query_by_url_with_source(state, url, ctx.plugin_name, UPSTREAM_SOURCE).await
    {
        return Ok((aid, true));
    }

    let mut body = serde_json::json!({
        "URL": url,
        "AssetType": asset_type,
        "GroupId": group_id,
    });
    if let Some(obj) = body.as_object_mut() {
        if group_id.trim().is_empty() {
            obj.remove("GroupId");
        }
    }

    let create_res =
        crate::services::upstream_asset_client::call_action_logged(ctx, "CreateAsset", &body)
            .await
            .map_err(|e| format!("素材注册失败: {}", e))?;

    let asset_id = crate::services::upstream_asset_client::extract_result_field(&create_res, "Id")
        .ok_or_else(|| "素材注册失败: 响应缺少 Id".to_string())?
        .to_string();

    poll_upstream_asset_active(ctx, &asset_id, asset_type).await?;

    insert_asset_record_with_source(
        state,
        ctx.user_id,
        asset_type,
        url,
        &asset_id,
        None,
        meta_fp.as_deref(),
        ctx.plugin_name,
        UPSTREAM_SOURCE,
    )
    .await;

    Ok((asset_id, false))
}

async fn poll_upstream_asset_active(
    ctx: &crate::services::upstream_asset_client::UpstreamCallCtx<'_>,
    asset_id: &str,
    asset_type: &str,
) -> Result<(), String> {
    let max_wait_secs: u64 = match asset_type {
        "Image" => 60,
        "Audio" => 120,
        _ => 180,
    };
    const POLL_INTERVAL_SECS: u64 = 3;
    let max_attempts = max_wait_secs / POLL_INTERVAL_SECS;
    let mut last_err: Option<String> = None;

    for attempt in 0..max_attempts {
        tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECS)).await;
        let body = serde_json::json!({ "Id": asset_id });
        match crate::services::upstream_asset_client::call_action_logged(ctx, "GetAsset", &body)
            .await
        {
            Ok(res) => {
                let status =
                    crate::services::upstream_asset_client::extract_result_field(&res, "Status")
                        .unwrap_or("");
                if status.eq_ignore_ascii_case("Active") {
                    tracing::info!(
                        "[UpstreamAsset] 素材就绪: {} ({}s)",
                        asset_id,
                        (attempt + 1) * POLL_INTERVAL_SECS
                    );
                    return Ok(());
                }
                if status.eq_ignore_ascii_case("Failed") {
                    let reason = crate::services::upstream_asset_client::extract_result_field(
                        &res,
                        "FailReason",
                    )
                    .or_else(|| {
                        res.pointer("/Result/Error/Message")
                            .and_then(|v| v.as_str())
                    })
                    .unwrap_or("审核未通过");
                    return Err(format!("素材处理失败({}): {}", asset_id, reason));
                }
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }
    }

    Err(if let Some(e) = last_err {
        format!(
            "素材处理超时({}s): {}, 错误: {}",
            max_wait_secs, asset_id, e
        )
    } else {
        format!("素材处理超时({}s): {}", max_wait_secs, asset_id)
    })
}
