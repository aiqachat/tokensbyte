//! 火山方舟视频素材 URL→素材ID 自动转换模块
//!
//! 当转发规则启用 `asset_convert: true` 时，在请求发送到上游前，
//! 扫描 content 数组中的 image_url/video_url/audio_url，
//! 将网络 URL 或 base64 数据通过 CreateAsset API 注册并替换为 `asset://<ASSET_ID>` 格式。
//!
//! 去重策略：基于资源内容的 SHA-256 哈希精确去重，同一内容仅创建一条记录。

use crate::AppState;
use sha2::{Sha256, Digest};
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
/// - http/https URL：下载资源 → SHA-256 哈希去重 → CreateAsset
/// - data:base64：解码 → SHA-256 哈希去重 → TOS 临时上传 → CreateAsset → 删除临时文件
/// - 已是 asset:// 前缀的跳过
/// - 转换失败时静默跳过，保持原始值不变
pub async fn convert_content_urls(
    state: &AppState,
    user_id: &str,
    body: &mut serde_json::Value,
) {
    // 加载 volcengine 审核配置（素材资产管理插件）
    let mut volc_config = match crate::api::plugins::get_volc_config(state, "asset_manager").await {
        Some(vc) => vc,
        None => {
            tracing::debug!("[AssetConvert] 素材资产管理插件未配置审核凭证，跳过素材转换");
            return;
        }
    };

    // 获取 content 数组（可变引用）
    let content_arr = match body.get_mut("content").and_then(|c| c.as_array_mut()) {
        Some(arr) => arr,
        None => return,
    };

    let client = crate::services::volcengine::VolcClient::new(volc_config.clone())
        .with_logger(state.db.clone(), user_id.to_string());

    // 确保有可用的 Group ID，如果没有则尝试自动创建并保存
    if !ensure_group_id(state, &client, &mut volc_config).await {
        return;
    }

    // 预加载 TOS 配置（base64 场景需要）
    let tos_config = crate::api::plugins::get_tos_config(state, "asset_manager").await;

    for item in content_arr.iter_mut() {
        let item_type = match item.get("type").and_then(|t| t.as_str()) {
            Some(t) => t.to_string(),
            None => continue,
        };

        // 匹配 URL 类型
        let (url_key, asset_type) = match URL_TYPE_MAP.iter().find(|(t, _, _)| *t == item_type) {
            Some((_, uk, at)) => (*uk, *at),
            None => continue,
        };

        // 提取 URL 值
        let url_val = match item.get(url_key).and_then(|u| u.get("url")).and_then(|u| u.as_str()) {
            Some(u) => u.to_string(),
            None => continue,
        };

        // 跳过已转换的 asset:// 引用
        if url_val.starts_with("asset://") {
            continue;
        }

        // 根据 URL 类型分发处理
        let asset_id = if url_val.starts_with("http://") || url_val.starts_with("https://") {
            convert_url_resource(state, &client, &volc_config, user_id, &url_val, asset_type).await
        } else if url_val.starts_with("data:") {
            convert_base64_resource(state, &client, &volc_config, &tos_config, user_id, &url_val, asset_type).await
        } else {
            // 其他未知格式，跳过
            continue;
        };

        // 替换 URL 为 asset://<ASSET_ID> 格式
        if let Some(aid) = asset_id {
            let asset_ref = format!("asset://{}", aid);
            if let Some(url_obj) = item.get_mut(url_key).and_then(|u| u.as_object_mut()) {
                url_obj.insert("url".to_string(), serde_json::json!(asset_ref));
            }
        }
    }
}

/// 处理网络 URL 资源：下载 → SHA-256 哈希 → 去重查询 → CreateAsset
async fn convert_url_resource(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &crate::services::volcengine::VolcConfig,
    user_id: &str,
    url: &str,
    asset_type: &str,
) -> Option<String> {
    // 下载资源并计算内容哈希
    let content_hash = match fetch_content_hash(&state.http_client, url).await {
        Some(h) => h,
        None => {
            tracing::warn!("[AssetConvert] 无法下载资源计算哈希，回退 URL 去重: {}", url);
            // 回退：使用 URL 字符串去重（兼容网络异常场景）
            return convert_with_url_fallback(state, client, volc_config, user_id, url, asset_type).await;
        }
    };

    // 基于内容哈希精确去重
    if let Some(aid) = query_by_hash(state, &content_hash).await {
        tracing::info!("[AssetConvert] 哈希命中，复用素材: hash={:.16}... -> {}", content_hash, aid);
        return Some(aid);
    }

    // 调用 CreateAsset API 注册新素材
    match create_asset(client, volc_config, url, asset_type).await {
        Some(aid) => {
            insert_asset_record(state, user_id, asset_type, url, &aid, &content_hash).await;
            tracing::info!("[AssetConvert] 新素材注册成功: hash={:.16}... -> {}", content_hash, aid);
            Some(aid)
        }
        None => {
            tracing::warn!("[AssetConvert] 素材注册失败，保持原始 URL: {}", url);
            None
        }
    }
}

/// 处理 base64 数据：解码 → SHA-256 哈希 → 去重 → TOS 临时上传 → CreateAsset → 删除临时文件
async fn convert_base64_resource(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &crate::services::volcengine::VolcConfig,
    tos_config: &Option<crate::services::tos::TosConfig>,
    user_id: &str,
    data_uri: &str,
    asset_type: &str,
) -> Option<String> {
    // 解码 base64 数据
    let (bytes, ext) = match decode_base64_data(data_uri) {
        Some(result) => result,
        None => {
            tracing::warn!("[AssetConvert] base64 数据解码失败，跳过");
            return None;
        }
    };

    // 计算内容哈希
    let content_hash = hex::encode(Sha256::digest(&bytes));

    // 基于内容哈希精确去重
    if let Some(aid) = query_by_hash(state, &content_hash).await {
        tracing::info!("[AssetConvert] base64 哈希命中，复用素材: hash={:.16}... -> {}", content_hash, aid);
        return Some(aid);
    }

    // 需要 TOS 配置来上传临时文件
    let tos_cfg = match tos_config {
        Some(cfg) => cfg,
        None => {
            tracing::warn!("[AssetConvert] base64 转换需要 TOS 配置，但未配置存储，跳过");
            return None;
        }
    };

    // 上传到 TOS 临时路径
    let tmp_filename = format!("{}.{}", &content_hash[..16], ext);
    let tmp_object_key = tos_cfg.full_key(&format!("_tmp_asset_convert/{}", tmp_filename));

    let tmp_url = match crate::services::tos::upload_file(
        tos_cfg, &tmp_object_key, bytes, &format!("{}/{}", asset_type.to_lowercase(), ext), None,
    ).await {
        Ok(url) => url,
        Err(e) => {
            tracing::error!("[AssetConvert] base64 临时文件上传 TOS 失败: {}", e);
            return None;
        }
    };

    tracing::info!("[AssetConvert] base64 临时文件已上传: {}", tmp_url);

    // 调用 CreateAsset API
    let result = match create_asset(client, volc_config, &tmp_url, asset_type).await {
        Some(aid) => {
            let fname = format!("base64_{}.{}", &content_hash[..8], ext);
            insert_asset_record(state, user_id, asset_type, &tmp_url, &aid, &content_hash).await;
            tracing::info!("[AssetConvert] base64 素材注册成功: {} -> {}", fname, aid);
            Some(aid)
        }
        None => {
            tracing::warn!("[AssetConvert] base64 素材注册失败");
            None
        }
    };

    // 异步删除 TOS 临时文件，不阻塞主流程
    let tos_cfg_clone = tos_cfg.clone();
    let tmp_key_clone = tmp_object_key.clone();
    tokio::spawn(async move {
        // 延迟 3 秒再删除，给 CreateAsset API 足够时间拉取文件
        tokio::time::sleep(Duration::from_secs(3)).await;
        match crate::services::tos::delete_file(&tos_cfg_clone, &tmp_key_clone).await {
            Ok(_) => tracing::info!("[AssetConvert] TOS 临时文件已清理: {}", tmp_key_clone),
            Err(e) => tracing::warn!("[AssetConvert] TOS 临时文件清理失败(非致命): {} - {}", tmp_key_clone, e),
        }
    });

    result
}

// ========== 内部工具函数 ==========

/// 下载 URL 资源并计算 SHA-256 内容哈希（不保留字节，节省内存）
async fn fetch_content_hash(http_client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = http_client
        .get(url)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let bytes = resp.bytes().await.ok()?;
    Some(hex::encode(Sha256::digest(&bytes)))
}

/// 解码 base64 data URI，返回 (原始字节, 文件扩展名)
fn decode_base64_data(data_uri: &str) -> Option<(Vec<u8>, String)> {
    // 查找 base64 数据起始位置
    let comma_pos = data_uri.find(',')?;
    let header = &data_uri[..comma_pos];
    let b64_data = &data_uri[comma_pos + 1..];

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

/// 基于 content_hash 查询已有的素材 ID
async fn query_by_hash(state: &AppState, content_hash: &str) -> Option<String> {
    sqlx::query_as::<_, (String,)>(
        &state.db.format_query(
            "SELECT asset_id FROM plugin_assets WHERE content_hash = ? AND source = 'relay_convert' AND asset_id IS NOT NULL LIMIT 1"
        )
    )
    .bind(content_hash)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|row| row.0)
}

/// 回退方案：当无法下载资源计算哈希时，使用 URL 字符串去重（兼容性保底）
async fn convert_with_url_fallback(
    state: &AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &crate::services::volcengine::VolcConfig,
    user_id: &str,
    url: &str,
    asset_type: &str,
) -> Option<String> {
    // 使用 URL 字符串去重
    let existing: Option<String> = sqlx::query_as::<_, (String,)>(
        &state.db.format_query(
            "SELECT asset_id FROM plugin_assets WHERE file_url = ? AND source = 'relay_convert' AND asset_id IS NOT NULL LIMIT 1"
        )
    )
    .bind(url)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .map(|row| row.0);

    if let Some(aid) = existing {
        tracing::info!("[AssetConvert] URL 回退去重命中: {} -> {}", url, aid);
        return Some(aid);
    }

    match create_asset(client, volc_config, url, asset_type).await {
        Some(aid) => {
            // 回退模式下 content_hash 留空
            insert_asset_record_raw(state, user_id, asset_type, url, &aid, None).await;
            tracing::info!("[AssetConvert] 回退模式注册成功: {} -> {}", url, aid);
            Some(aid)
        }
        None => {
            tracing::warn!("[AssetConvert] 素材注册失败，保持原始 URL: {}", url);
            None
        }
    }
}

/// 写入 plugin_assets 数据库记录（含 content_hash）
async fn insert_asset_record(
    state: &AppState,
    user_id: &str,
    asset_type: &str,
    file_url: &str,
    asset_id: &str,
    content_hash: &str,
) {
    insert_asset_record_raw(state, user_id, asset_type, file_url, asset_id, Some(content_hash)).await;
}

/// 写入 plugin_assets 数据库记录
async fn insert_asset_record_raw(
    state: &AppState,
    user_id: &str,
    asset_type: &str,
    file_url: &str,
    asset_id: &str,
    content_hash: Option<&str>,
) {
    let at_lower = asset_type.to_lowercase();
    let fname = file_url.rsplit('/').next().unwrap_or("unknown").to_string();
    let _ = sqlx::query(
        &state.db.format_query(
            "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category, content_hash) \
             VALUES (?, ?, 'relay_convert', 'approved', ?, ?, ?, '转换素材', ?)"
        )
    )
    .bind(user_id)
    .bind(&at_lower)
    .bind(&fname)
    .bind(file_url)
    .bind(asset_id)
    .bind(content_hash)
    .execute(&state.db.pool)
    .await;
}

/// 调用 CreateAsset API 注册素材
async fn create_asset(
    client: &crate::services::volcengine::VolcClient,
    volc_config: &crate::services::volcengine::VolcConfig,
    url: &str,
    asset_type: &str,
) -> Option<String> {
    let group_id = volc_config.group_id.clone().unwrap_or_default();

    let req = crate::services::volcengine::CreateAssetRequest {
        group_id,
        url: url.to_string(),
        asset_type: asset_type.to_string(),
        name: None,
        project_name: Some(volc_config.project_name.clone()),
    };

    match client.call_api::<_, crate::services::volcengine::CreateAssetResponse>(
        "ark", "cn-beijing", "CreateAsset", "2024-01-01", req
    ).await {
        Ok(res) => Some(res.id),
        Err(e) => {
            tracing::error!("[AssetConvert] CreateAsset 调用失败: {}", e);
            None
        }
    }
}

/// 自动保证 Group ID 存在，未设置时调用 API 自动生成并持久化
async fn ensure_group_id(
    state: &crate::AppState,
    client: &crate::services::volcengine::VolcClient,
    volc_config: &mut crate::services::volcengine::VolcConfig,
) -> bool {
    // 如果已经有非空的 ID 则直接通过
    if volc_config.group_id.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        return true;
    }

    // 调用 API 默认生成一个
    let req = crate::services::volcengine::CreateAssetGroupRequest {
        name: "tokensbyte_auto_generated_group".to_string(),
        description: "由 Tokensbyte 系统自动生成的转换素材专用群组".to_string(),
        group_type: Some("AIGC".to_string()),
        project_name: Some(volc_config.project_name.clone()),
    };

    match client.call_api::<_, crate::services::volcengine::CreateAssetGroupResponse>(
        "ark", "cn-beijing", "CreateAssetGroup", "2024-01-01", req
    ).await {
        Ok(res) => {
            let new_sg_id = res.id;
            tracing::info!("[AssetConvert] 成功自动生成 Ark 素材组 ID: {}", new_sg_id);
            volc_config.group_id = Some(new_sg_id.clone());

            // 存入数据库
            let update_res = sqlx::query(
                &state.db.format_query("UPDATE plugin_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE plugin_name = 'asset_manager' AND config_key = 'volc_group_id'")
            )
            .bind(&new_sg_id)
            .execute(&state.db.pool)
            .await;

            if let Ok(r) = update_res {
                if r.rows_affected() == 0 {
                    let _ = sqlx::query(
                        &state.db.format_query("INSERT INTO plugin_configs (plugin_name, config_key, config_value) VALUES ('asset_manager', 'volc_group_id', ?)")
                    )
                    .bind(&new_sg_id)
                    .execute(&state.db.pool)
                    .await;
                }
            }
            true
        }
        Err(e) => {
            tracing::error!("[AssetConvert] 自动生成 Ark 素材组失败，未满足必需属性，拦截执行: {}", e);
            false
        }
    }
}
