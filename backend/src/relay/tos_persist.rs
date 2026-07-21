//! 渠道级 TOS 资源持久化模块
//! 将响应中的 base64/URL 媒体资源上传到 TOS，返回替换后的响应字符串。
//! 兼容 OpenAI 标准格式和各厂商原生格式（可灵、火山方舟、阿里百炼、Gemini 等）。
//! 供 image.rs、video.rs、task.rs 共同调用。

use crate::services::tos::{self, TosConfig};
use crate::time_system::DbTs;
use crate::AppState;
use sha2::Digest;

/// 从系统存储设置加载 TosConfig（供所有需要系统级 TOS 的模块复用）
pub async fn load_system_tos_config(state: &AppState) -> Option<TosConfig> {
    let val: String = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'storage_settings'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .ok()??;

    let s: crate::models::StorageSettings = serde_json::from_str(&val).ok()?;
    if s.tos_access_key.is_empty() || s.tos_endpoint.is_empty() || s.tos_bucket.is_empty() {
        return None;
    }
    Some(TosConfig {
        access_key: s.tos_access_key,
        secret_key: s.tos_secret_key,
        endpoint: s.tos_endpoint,
        region: s.tos_region,
        bucket: s.tos_bucket,
        path_prefix: s.tos_path_prefix,
        custom_domain: s.tos_custom_domain,
    })
}

/// 将响应中的媒体 URL 和 base64 上传到 TOS 并替换为 TOS URL。
/// - b64_json 模式：不存 TOS，直接返回原始响应
/// - 非 b64_json / 无 response_format：base64 和 URL 均存 TOS 返回 URL
/// 兼容 OpenAI 标准格式和各厂商原生格式。
pub async fn persist_response_resources(
    state: &AppState,
    response_str: &str,
    channel_id: i64,
    storage_days: i32,
    response_format: Option<&str>,
    fallback_type: Option<&str>,
) -> String {
    // b64_json 模式：不存 TOS，由调用方在 apply_format 后做 URL→base64 转换
    if response_format == Some("b64_json") {
        return response_str.to_string();
    }

    let tos_config = match load_system_tos_config(state).await {
        Some(c) => c,
        None => {
            tracing::warn!("[TosPersist] 系统存储设置未配置，跳过渠道 TOS 存储");
            return response_str.to_string();
        }
    };

    let mut root: serde_json::Value = match serde_json::from_str(response_str) {
        Ok(v) => v,
        Err(_) => return response_str.to_string(),
    };

    let mut changed = false;

    // 策略一：OpenAI 标准格式（data[].url / b64_json）
    if let Some(items) = root.get_mut("data").and_then(|d| d.as_array_mut()) {
        for item in items.iter_mut() {
            if persist_openai_item(
                state,
                &tos_config,
                item,
                channel_id,
                storage_days,
                fallback_type,
            )
            .await
            {
                changed = true;
            }
        }
    }

    // 策略二：非 OpenAI 格式 — 复用 response_formatter::find_urls 提取各厂商媒体 URL 和 base64
    if !changed {
        let urls = super::response_formatter::find_urls(&root);
        if !urls.is_empty() {
            // 构建 原始URL → TOS URL 映射表
            let mut url_map: std::collections::HashMap<String, String> =
                std::collections::HashMap::new();
            for found in &urls {
                if found.starts_with("data:") {
                    // Gemini base64：解码上传 TOS
                    let raw_b64 = super::forward::b64_data(found);
                    let file_data = match base64_decode(found) {
                        Ok(d) => d,
                        Err(_) => continue,
                    };
                    let ext = detect_image_ext(&file_data);
                    if let Some(tos_url) = upload_and_record(
                        state,
                        &tos_config,
                        &file_data,
                        &ext,
                        channel_id,
                        storage_days,
                        Some("base64_data"),
                    )
                    .await
                    {
                        url_map.insert(raw_b64.to_string(), tos_url);
                    }
                } else if found.starts_with("http://") || found.starts_with("https://") {
                    if tos_config.extract_object_key(found).is_some() {
                        continue;
                    }
                    let (file_data, ext) = match download_url(&state.http_client, found).await {
                        Ok(data) => (data, guess_ext(found, fallback_type.unwrap_or("image"))),
                        Err(e) => {
                            tracing::warn!("[TosPersist] 下载失败 url={}: {}", found, e);
                            continue;
                        }
                    };
                    if let Some(tos_url) = upload_and_record(
                        state,
                        &tos_config,
                        &file_data,
                        &ext,
                        channel_id,
                        storage_days,
                        Some(found),
                    )
                    .await
                    {
                        url_map.insert(found.clone(), tos_url);
                    }
                }
            }
            if !url_map.is_empty() {
                // 基于 JSON 结构精确替换，避免全局字符串替换导致输入字段中的 URL 被污染
                replace_urls_in_json(&mut root, &url_map);
                changed = true;
            }
        }
    }

    if changed {
        serde_json::to_string(&root).unwrap_or_else(|_| response_str.to_string())
    } else {
        response_str.to_string()
    }
}

/// 双向响应格式对齐：根据用户 response_format 规格将 data[].url 转换为 b64_json，或反向将 b64_json 转换为 Data URL
pub async fn align_response_format(
    state: &AppState,
    response_str: &str,
    response_format: Option<&str>,
) -> String {
    let mut root: serde_json::Value = match serde_json::from_str(response_str) {
        Ok(v) => v,
        Err(_) => return response_str.to_string(),
    };
    let mut changed = false;
    let is_b64_json = response_format == Some("b64_json");

    if let Some(items) = root.get_mut("data").and_then(|d| d.as_array_mut()) {
        for item in items.iter_mut() {
            let b64 = item
                .get("b64_json")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let url = item
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if is_b64_json {
                if b64.is_empty() && !url.is_empty() {
                    if url == "base64数据" {
                        continue;
                    }
                    let data = match download_url(&state.http_client, &url).await {
                        Ok(d) => d,
                        Err(e) => {
                            tracing::warn!("[TosPersist] url 转换为 base64 失败: {}", e);
                            continue;
                        }
                    };
                    use base64::Engine;
                    item["b64_json"] =
                        serde_json::json!(base64::engine::general_purpose::STANDARD.encode(&data));
                    item.as_object_mut().map(|obj| obj.remove("url"));
                    changed = true;
                }
            } else {
                if url.is_empty() && !b64.is_empty() {
                    if b64 == "base64数据" {
                        continue;
                    }
                    let data_url = if b64.starts_with("data:") {
                        b64
                    } else {
                        let ext = match base64_decode(&b64) {
                            Ok(data) => detect_image_ext(&data),
                            Err(_) => "png".to_string(),
                        };
                        let mime = if ext == "jpg" || ext == "jpeg" {
                            "image/jpeg".to_string()
                        } else {
                            format!("image/{}", ext)
                        };
                        format!("data:{};base64,{}", mime, b64)
                    };
                    item["url"] = serde_json::json!(data_url);
                    item.as_object_mut().map(|obj| obj.remove("b64_json"));
                    changed = true;
                }
            }
        }
    }

    if changed {
        serde_json::to_string(&root).unwrap_or_else(|_| response_str.to_string())
    } else {
        response_str.to_string()
    }
}

/// 将 OpenAI data[] item 的 base64/URL 资源上传到 TOS，替换为 TOS URL
async fn persist_openai_item(
    state: &AppState,
    tos_config: &TosConfig,
    item: &mut serde_json::Value,
    channel_id: i64,
    storage_days: i32,
    fallback_type: Option<&str>,
) -> bool {
    let b64 = item
        .get("b64_json")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let url = item
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if b64.is_empty() && url.is_empty() {
        return false;
    }
    if b64 == "base64数据" {
        return false;
    }
    if !url.is_empty() && tos_config.extract_object_key(&url).is_some() {
        return false;
    }

    let (file_data, ext) = if !b64.is_empty() {
        match base64_decode(&b64) {
            Ok(data) => {
                let ext = detect_image_ext(&data);
                (data, ext)
            }
            Err(e) => {
                tracing::warn!("[TosPersist] base64 解码失败: {}", e);
                return false;
            }
        }
    } else if url.starts_with("data:") {
        match base64_decode(&url) {
            Ok(data) => {
                let ext = detect_image_ext(&data);
                (data, ext)
            }
            Err(e) => {
                tracing::warn!("[TosPersist] url base64 解码失败: {}", e);
                return false;
            }
        }
    } else {
        match download_url(&state.http_client, &url).await {
            Ok(data) => (data, guess_ext(&url, fallback_type.unwrap_or("image"))),
            Err(e) => {
                tracing::warn!("[TosPersist] 下载失败 url={}: {}", url, e);
                return false;
            }
        }
    };

    // 记录原始来源用于日志输出
    let source = if !url.is_empty() {
        url.as_str()
    } else {
        "base64_data"
    };
    let tos_url = match upload_and_record(
        state,
        tos_config,
        &file_data,
        &ext,
        channel_id,
        storage_days,
        Some(source),
    )
    .await
    {
        Some(url) => url,
        None => return false,
    };

    item.as_object_mut().map(|obj| obj.remove("b64_json"));
    item["url"] = serde_json::json!(tos_url);
    true
}

/// 上传文件到 TOS 并记录过期追踪，返回 TOS URL
/// source_url: 原始资源地址，用于日志输出追溯（base64 来源传 "base64_data"）
async fn upload_and_record(
    state: &AppState,
    tos_config: &TosConfig,
    file_data: &[u8],
    ext: &str,
    channel_id: i64,
    storage_days: i32,
    source_url: Option<&str>,
) -> Option<String> {
    let hash = &format!("{:x}", sha2::Sha256::digest(file_data))[..8];
    let timestamp = chrono::Utc::now().timestamp();
    let filename = format!("{}_{}.{}", timestamp, hash, ext);
    let relative_path = format!("_channel_cache/{}/{}", channel_id, filename);
    let object_key = tos_config.full_key(&relative_path);
    let content_type = ext_to_mime(ext);

    let tos_url = match tos::upload_file(
        tos_config,
        &object_key,
        file_data.to_vec(),
        content_type,
        None,
    )
    .await
    {
        Ok(url) => url,
        Err(e) => {
            tracing::warn!("[TosPersist] TOS 上传失败 key={}: {}", object_key, e);
            return None;
        }
    };

    if storage_days > 0 {
        let expire_at =
            DbTs::from_utc(chrono::Utc::now() + chrono::Duration::days(storage_days as i64));
        let _ = sqlx::query(
            "INSERT INTO tos_temp_files (object_key, channel_id, source, expire_at) VALUES ($1, $2, 'channel', $3)"
        )
        .bind(&object_key)
        .bind(channel_id)
        .bind(&expire_at)
        .execute(&state.db.pool)
        .await;
    }

    // 输出完整映射：原始地址 => TOS 地址，方便开发者追溯
    tracing::info!(
        "[TosPersist] {} => {}",
        source_url.unwrap_or("unknown"),
        tos_url
    );
    Some(tos_url)
}

fn ext_to_mime(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

/// 清理过期的 TOS 临时文件（循环批处理，每批 100 条，直到全部清完）
pub async fn cleanup_expired_files(state: &AppState) {
    let tos_config = match load_system_tos_config(state).await {
        Some(c) => c,
        None => {
            tracing::debug!("[TosCleanup] 系统存储设置未配置，跳过过期文件清理");
            return;
        }
    };

    let mut total_cleaned: u64 = 0;
    let mut total_failed: u64 = 0;

    loop {
        let rows: Vec<(i64, String)> = match sqlx::query_as(
            "SELECT id, object_key FROM tos_temp_files WHERE expire_at <= NOW() LIMIT 100",
        )
        .fetch_all(&state.db.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("[TosCleanup] 查询过期文件失败: {}", e);
                return;
            }
        };

        if rows.is_empty() {
            break;
        }

        let batch_size = rows.len();
        for (id, object_key) in &rows {
            if let Err(e) = tos::delete_file(&tos_config, object_key).await {
                let err_lower = e.to_lowercase();
                let is_not_found = err_lower.contains("404")
                    || err_lower.contains("nosuchkey")
                    || err_lower.contains("not found")
                    || err_lower.contains("no such key");
                if !is_not_found {
                    tracing::warn!("[TosCleanup] TOS 删除失败 key={}: {}", object_key, e);
                    total_failed += 1;
                    continue;
                }
                // 对象已不存在（404），视为已清理，继续删除数据库记录
                tracing::debug!(
                    "[TosCleanup] TOS 对象已不存在 key={}，清理数据库记录",
                    object_key
                );
            }
            let _ = sqlx::query("DELETE FROM tos_temp_files WHERE id = $1")
                .bind(id)
                .execute(&state.db.pool)
                .await;
            total_cleaned += 1;
        }

        // 本批不足 100 条说明已全部处理完毕
        if batch_size < 100 {
            break;
        }
    }

    if total_cleaned > 0 || total_failed > 0 {
        tracing::info!(
            "[TosCleanup] 过期文件清理完成: 成功={}, 失败={}",
            total_cleaned,
            total_failed
        );
    }
}

/// 基于 JSON 结构精确替换 URL 值（替代全局字符串替换，防止输入字段中的 URL 被污染）。
/// 跳过 input/request/task_input/original_input 等请求输入相关字段。
fn replace_urls_in_json(
    v: &mut serde_json::Value,
    url_map: &std::collections::HashMap<String, String>,
) {
    match v {
        serde_json::Value::String(s) => {
            // 精确匹配：整个字符串值是映射中的 key
            if let Some(tos_url) = url_map.get(s.as_str()) {
                *s = tos_url.clone();
            } else if s.starts_with("data:") {
                // 精确匹配：纯 base64 部分匹配 url_map，避免前缀残留
                let raw_b64 = super::forward::b64_data(s);
                if raw_b64 != s.trim() {
                    if let Some(tos_url) = url_map.get(raw_b64) {
                        *s = tos_url.clone();
                    }
                }
            } else {
                // 子串替换：字符串中嵌入了映射中的 key（如 base64 内容、Markdown 文本）
                let mut replaced = s.clone();
                // 长度降序排序替换，先替换长键，防止先替换短子串造成前缀等信息残留
                let mut sorted_keys: Vec<&String> = url_map.keys().collect();
                sorted_keys.sort_by_key(|k| std::cmp::Reverse(k.len()));
                for old in sorted_keys {
                    if let Some(new) = url_map.get(old) {
                        if replaced.contains(old.as_str()) {
                            replaced = replaced.replace(old.as_str(), new);
                        }
                    }
                }
                // 书虫格式清理：替换后 ![...](data:...;base64,TOS_URL) → TOS_URL
                if replaced.contains("data:") && replaced.contains(";base64,http") {
                    let re_md =
                        regex::Regex::new(r"!\[.*?\]\(data:[^;]+;base64,(https?://[^\)]+)\)")
                            .unwrap();
                    replaced = re_md.replace_all(&replaced, "$1").to_string();
                }
                if replaced != *s {
                    *s = replaced;
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                replace_urls_in_json(item, url_map);
            }
        }
        serde_json::Value::Object(map) => {
            for (k, val) in map.iter_mut() {
                // 跳过请求输入相关字段，避免将用户原始图片替换为 TOS 地址
                if k == "request" || k == "input" || k == "task_input" || k == "original_input" {
                    continue;
                }
                replace_urls_in_json(val, url_map);
            }
        }
        _ => {}
    }
}

// ── 辅助函数 ──────────────────────────────────────────────────

/// 下载远程文件
async fn download_url(http_client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = http_client
        .get(url)
        .timeout(std::time::Duration::from_secs(200))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("读取失败: {}", e))
}

/// Base64 解码（支持 data:xxx;base64, 前缀）
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let data = super::forward::b64_data(input);
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Base64 解码失败: {}", e))
}

/// 从文件头字节检测图片格式
fn detect_image_ext(data: &[u8]) -> String {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "png".to_string()
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg".to_string()
    } else if data.starts_with(b"RIFF") && data.len() > 12 && &data[8..12] == b"WEBP" {
        "webp".to_string()
    } else if data.starts_with(b"GIF8") {
        "gif".to_string()
    } else {
        "png".to_string()
    }
}

/// 从 URL 推断文件扩展名
fn guess_ext(url: &str, fallback_type: &str) -> String {
    let path = url.split('?').next().unwrap_or(url);
    if let Some(ext) = path.rsplit('.').next() {
        let ext = ext.to_lowercase();
        if ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"].contains(&ext.as_str()) {
            return ext;
        }
    }
    match fallback_type {
        "video" => "mp4".to_string(),
        _ => "png".to_string(),
    }
}
