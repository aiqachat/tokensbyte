//! 响应格式化引擎 (Response Formatter)
//! 将各厂商上游返回格式归一化为 OpenAI 标准规范格式。
//! 仅对 OpenAI 兼容路由（/v1/images/generations、/v1/images/edits、/v1/video/generations、/v1/tasks/）生效。
//! 设计原则：采用递归扫描模式，确保无论上游结构如何变化，都能准确抓取 ID、状态和媒体 URL。

use regex::Regex;
use serde_json::{json, Value};

/// 统一格式化入口：对 OpenAI 兼容路由自动转换响应格式。
/// fallback_id: 当响应体解析不到 task_id 时的兜底 ID（轮询场景传入已知的 task_id）
pub async fn apply_format(
    _pool: &sqlx::PgPool,
    raw_path: &str,
    category: &str,
    raw_response: &str,
    is_async_submit: bool,
    fallback_id: Option<&str>,
) -> String {
    // 仅对 OpenAI 兼容路由（/v1/...）启用格式转换
    // 排除厂商原生路径（如阿里百炼 /api/v1/tasks/、火山 /api/v3/...）
    let is_openai_path = !raw_path.starts_with("/api/") && (
        raw_path == "/v1/images/generations"
        || raw_path == "/v1/images/edits"
        || raw_path == "/v1/video/generations"
        || raw_path.starts_with("/v1/video/generations/")
        || raw_path.starts_with("/v1/tasks/")
    );
    if !is_openai_path {
        return raw_response.to_string();
    }

    format_openai(category, raw_response, is_async_submit, fallback_id)
}

/// OpenAI 格式化核心逻辑
/// fallback_id: 当 find_id 返回空时的兜底 ID（如即梦轮询响应不含 task_id）
fn format_openai(category: &str, raw: &str, is_async_submit: bool, fallback_id: Option<&str>) -> String {
    let v: Value = serde_json::from_str(raw).unwrap_or(json!({}));

    // 上游已是 OpenAI 格式（有 created + data 数组且无 APIMart code 字段）→ 透传
    if v.get("created").is_some()
        && v.get("data").and_then(|d| d.as_array()).is_some()
        && v.get("code").is_none()
    {
        return raw.to_string();
    }

    // 异步提交
    if is_async_submit {
        let id = find_id(&v);
        // find_id 为空时使用调用方传入的 fallback_id 兜底
        let effective_id = if id.is_empty() { fallback_id.unwrap_or_default().to_string() } else { id };
        if !effective_id.is_empty() {
            return build_openai_submit(category, &v, &effective_id);
        }
    }

    // 含异步任务字段 → 轮询结果
    if has_task_fields(&v) {
        return build_openai_poll(category, &v, fallback_id);
    }

    // 同步结果：无异步任务字段且有媒体数据
    if !find_urls(&v).is_empty() {
        return build_openai_sync(category, &v, fallback_id);
    }

    // 其他情况（如错误响应）→ 原样透传，避免包装为假的 200 成功
    raw.to_string()
}

// ── ID 提取（公共方法，供 task.rs / image.rs / proxy.rs 复用） ──

/// 从任意厂商响应 JSON 中提取任务 ID（兼容 task_id / id / data.task_id 等多种路径）
/// 搜索路径覆盖：根节点、data 对象/数组、output、data.task.id、腾讯云 Response.TaskId
pub fn find_id(v: &Value) -> String {
    v.get("task_id")
        .or_else(|| v.get("id"))
        .or_else(|| v.pointer("/data/taskCode"))
        .or_else(|| v.pointer("/data/task_id"))
        .or_else(|| v.pointer("/data/id"))
        .or_else(|| v.pointer("/data/0/task_id"))
        .or_else(|| v.pointer("/data/0/id"))
        .or_else(|| v.pointer("/output/task_id"))
        .or_else(|| v.pointer("/data/task/id"))
        .or_else(|| v.pointer("/Response/TaskId"))
        .and_then(|val| {
            // 兼容字符串和数字类型的 task_id（如火山方舟返回数字 ID）
            val.as_str()
                .map(|s| s.to_string())
                .or_else(|| val.as_i64().map(|n| n.to_string()))
                .or_else(|| Some(val.to_string()))
        })
        .unwrap_or_default()
        .trim_matches('"')
        .to_string()
}

// ── 任务状态字段检测 ──
fn has_task_fields(v: &Value) -> bool {
    v.get("status").is_some()
        || v.get("task_status").is_some()
        || v.get("task_id").is_some()
        || v.pointer("/data/status").is_some()
        || v.pointer("/data/task_status").is_some()
        || v.pointer("/data/0/status").is_some()
        || v.pointer("/data/0/task_id").is_some()
        || v.pointer("/output/task_status").is_some()
        || v.pointer("/Response/TaskId").is_some()
}

// ── 状态归一化 ──
fn find_status(v: &Value) -> String {
    let raw = v
        .get("status")
        .and_then(|s| s.as_str())
        .or_else(|| v.get("task_status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/data/status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/data/task_status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/data/0/status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/data/task/status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/output/task_status").and_then(|s| s.as_str()))
        .or_else(|| v.pointer("/Response/Status").and_then(|s| s.as_str()))
        .unwrap_or("")
        .to_lowercase();

    match raw.as_str() {
        "completed" | "succeeded" | "succeed" | "success" | "finish" | "done" => "completed",
        "failed" | "canceled" | "cancelled" | "error" | "timeout" | "unknown" | "fail" | "abort" | "not_found" | "expired" => "failed",
        "processing" | "running" | "active" | "generating" | "waiting" | "in_queue" => "in_progress",
        "submitted" | "pending" | "queueing" => "pending",
        other => other,
    }
    .to_string()
}

/// URL 提取：优先从标准字段路径直接提取，递归扫描兜底（供 tos_persist 复用）
pub fn find_urls(v: &Value) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();

    // 1. OpenAI 标准: data[].url
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                push_unique(&mut urls, u);
            }
        }
    }

    // 2. 可灵: data.task_result.images/videos[].url 或 data.task.task_result.images/videos[].url
    for path in &["/data/task_result/images", "/data/task_result/videos", "/data/task/task_result/images", "/data/task/task_result/videos"] {
        if let Some(arr) = v.pointer(path).and_then(|a| a.as_array()) {
            for item in arr {
                if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                    push_unique(&mut urls, u);
                }
            }
        }
    }

    // 即梦AI: data.image_urls[] (字符串数组，非对象数组)
    if let Some(arr) = v.pointer("/data/image_urls").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(u) = item.as_str() {
                push_unique(&mut urls, u);
            }
        }
    }

    // 即梦AI: data.binary_data_base64[] (base64 数组，return_url=false 时返回，与 image_urls 互斥)
    if urls.is_empty() {
        if let Some(arr) = v.pointer("/data/binary_data_base64").and_then(|a| a.as_array()) {
            for item in arr {
                if let Some(b64) = item.as_str() {
                    push_unique(&mut urls, &format!("data:image/png;base64,{}", b64));
                }
            }
        }
    }

    // 即梦AI: data.video_url
    if let Some(u) = v.pointer("/data/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 3. 火山方舟: content.video_url / final_result.video_url / video_url
    for path in &["/content/video_url", "/final_result/video_url"] {
        if let Some(u) = v.pointer(path).and_then(|u| u.as_str()) {
            push_unique(&mut urls, u);
        }
    }
    if let Some(u) = v.get("video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 4. 阿里 DashScope: output.results[].url / output.video_url
    if let Some(arr) = v.pointer("/output/results").and_then(|a| a.as_array()) {
        for item in arr {
            let u = item.get("url").or_else(|| item.get("video_url")).and_then(|u| u.as_str());
            if let Some(u) = u { push_unique(&mut urls, u); }
        }
    }
    if let Some(u) = v.pointer("/output/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 4b. 阿里 DashScope chat 格式: output.choices[].message.content[].image
    if let Some(choices) = v.pointer("/output/choices").and_then(|c| c.as_array()) {
        for choice in choices {
            if let Some(parts) = choice.pointer("/message/content").and_then(|c| c.as_array()) {
                for part in parts {
                    if let Some(u) = part.get("image").and_then(|u| u.as_str()) {
                        push_unique(&mut urls, u);
                    }
                }
            }
        }
    }

    // 5. APIMart: data.result.images/videos[].url
    for path in &["/data/result/images", "/data/result/videos"] {
        if let Some(arr) = v.pointer(path).and_then(|a| a.as_array()) {
            for item in arr {
                if let Some(u) = item.get("url").and_then(|u| u.as_str()) {
                    push_unique(&mut urls, u);
                } else if let Some(arr_url) = item.get("url").and_then(|u| u.as_array()) {
                    for u in arr_url {
                        if let Some(s) = u.as_str() { push_unique(&mut urls, s); }
                    }
                }
            }
        }
    }

    // 5b. Bytefor: data.files[].fileUrl 或 data.files[].file_url
    if let Some(arr) = v.pointer("/data/files").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(u) = item.get("fileUrl").or_else(|| item.get("file_url")).and_then(|u| u.as_str()) {
                push_unique(&mut urls, u);
            }
        }
    }

    // 6. Gemini: candidates[].content.parts[].inlineData → data URI
    if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
        for cand in candidates {
            if let Some(parts) = cand.pointer("/content/parts").and_then(|p| p.as_array()) {
                for part in parts {
                    let inline = part.get("inlineData").or_else(|| part.get("inline_data"));
                    if let Some(inline) = inline {
                        if let Some(data) = inline.get("data").and_then(|d| d.as_str()) {
                            // TOS 替换后 data 值已是 URL，直接作为 URL 返回
                            if data.starts_with("http://") || data.starts_with("https://") {
                                push_unique(&mut urls, data);
                            } else {
                                let mime = inline.get("mimeType").or_else(|| inline.get("mime_type"))
                                    .and_then(|m| m.as_str()).unwrap_or("image/png");
                                push_unique(&mut urls, &format!("data:{};base64,{}", mime, data));
                            }
                        }
                    }
                    // 书虫格式/Gemini文本格式：text 中的 Markdown 图片 或嵌入的 HTTP URL
                    else if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        // 1. 匹配 Markdown 中的 base64 图片格式 ![...](data:image/...;base64,...)
                        let base64_re = Regex::new(r"data:([^;]+);base64,([a-zA-Z0-9+/=]+)").unwrap();
                        for cap in base64_re.captures_iter(text) {
                            push_unique(&mut urls, &format!("data:{};base64,{}", &cap[1], &cap[2]));
                        }
                        // 2. 匹配文本或 Markdown 中的 HTTP/HTTPS 链接（自动剔除右侧的括号或方括号）
                        let url_re = Regex::new(r"https?://[^\s)\]]+").unwrap();
                        for mat in url_re.find_iter(text) {
                            let url_str = mat.as_str();
                            let lower = url_str.to_lowercase();
                            let path_part = lower.split('?').next().unwrap_or(&lower);
                            let is_media = path_part.ends_with(".png")
                                || path_part.ends_with(".jpg")
                                || path_part.ends_with(".jpeg")
                                || path_part.ends_with(".webp")
                                || path_part.ends_with(".gif")
                                || path_part.ends_with(".mp4")
                                || path_part.ends_with(".mov")
                                || path_part.ends_with(".webm")
                                || lower.contains("/image")
                                || lower.contains("/video")
                                || lower.contains("x-oss-process")
                                || lower.contains("tos-cn-")
                                || lower.contains("volccdn.com")
                                || lower.contains("volces.com")
                                || lower.contains("klingai.com")
                                || lower.contains("aliyuncs.com");
                            if is_media {
                                push_unique(&mut urls, url_str);
                            }
                        }
                    }
                }
            }
        }
    }

    // 7. 递归扫描兜底（捕获非标准位置的媒体 URL）
    if urls.is_empty() {
        scan_value_for_urls(v, &mut urls);
    }

    urls
}

pub fn push_unique(urls: &mut Vec<String>, url: &str) {
    if !url.is_empty() && !urls.iter().any(|u| u == url) {
        urls.push(url.to_string());
    }
}

fn scan_value_for_urls(v: &Value, urls: &mut Vec<String>) {
    match v {
        Value::String(s) => {
            if (s.starts_with("http://") || s.starts_with("https://")) && !urls.iter().any(|u| u == s) {
                let lower = s.to_lowercase();
                // 截取 ? 前的路径部分，解决 OSS 签名 URL 带查询参数导致扩展名匹配失败
                let path_part = lower.split('?').next().unwrap_or(&lower);
                let is_media = path_part.ends_with(".png")
                    || path_part.ends_with(".jpg")
                    || path_part.ends_with(".jpeg")
                    || path_part.ends_with(".webp")
                    || path_part.ends_with(".gif")
                    || path_part.ends_with(".mp4")
                    || path_part.ends_with(".mov")
                    || path_part.ends_with(".webm")
                    || lower.contains("/image")
                    || lower.contains("/video")
                    || lower.contains("x-oss-process")
                    || lower.contains("tos-cn-")
                    || lower.contains("volccdn.com")
                    || lower.contains("volces.com")
                    || lower.contains("klingai.com")
                    || lower.contains("aliyuncs.com");
                if is_media {
                    urls.push(s.clone());
                }
            }
        }
        Value::Array(arr) => {
            for item in arr {
                scan_value_for_urls(item, urls);
            }
        }
        Value::Object(map) => {
            for (k, val) in map {
                // 排除请求输入相关字段，避免将用户提交的原始图片误识别为响应媒体
                if k == "request" || k == "input" || k == "task_input" || k == "original_input" || k == "task_data" { continue; }
                scan_value_for_urls(val, urls);
            }
        }
        _ => {}
    }
}

fn find_ts(v: &Value, keys: &[&str]) -> i64 {
    for key in keys {
        let val = v
            .get(*key)
            .or_else(|| v.pointer(&format!("/data/{}", key)))
            .or_else(|| v.pointer(&format!("/output/{}", key)));
        if let Some(t) = val {
            if let Some(n) = t.as_i64() {
                return n;
            }
            if let Some(s) = t.as_str() {
                if let Ok(n) = s.parse::<i64>() {
                    return n;
                }
            }
        }
    }
    0
}

fn to_json(v: &Value) -> String {
    serde_json::to_string(v).unwrap_or_default()
}

// ══════════════════════════════════════════════════════════════════════
// OpenAI 规范格式
// ══════════════════════════════════════════════════════════════════════

fn openai_object(category: &str) -> &'static str {
    match category {
        "视频" | "video" => "video.generation",
        _ => "image.generation",
    }
}

fn openai_status(v: &Value) -> String {
    let s = find_status(v);
    match s.as_str() {
        "completed" | "failed" | "pending" | "in_progress" => s,
        _ => "in_progress".to_string(),
    }
}

fn extract_usage(v: &Value) -> Value {
    if let Some(u) = v.get("usage").or_else(|| v.pointer("/data/usage")) {
        return u.clone();
    }
    if let Some(u) = v
        .get("usageMetadata")
        .or_else(|| v.pointer("/data/usageMetadata"))
    {
        let ct = u
            .get("candidatesTokenCount")
            .and_then(|t| t.as_i64())
            .unwrap_or(0);
        let pt = u
            .get("promptTokenCount")
            .and_then(|t| t.as_i64())
            .unwrap_or_else(|| {
                let total = u
                    .get("totalTokenCount")
                    .and_then(|t| t.as_i64())
                    .unwrap_or(0);
                (total - ct).max(0)
            });
        return json!({"prompt_tokens": pt, "completion_tokens": ct});
    }
    json!({"prompt_tokens": 0, "completion_tokens": 0})
}

/// 从上游扫描 revised_prompt
fn find_revised_prompt(v: &Value) -> Option<String> {
    v.get("revised_prompt")
        .and_then(|r| r.as_str())
        .or_else(|| v.pointer("/data/0/revised_prompt").and_then(|r| r.as_str()))
        .or_else(|| v.pointer("/output/revised_prompt").and_then(|r| r.as_str()))
        .map(|s| s.to_string())
        // DashScope chat 格式: output.choices[0].message.content 中的 text 条目
        .or_else(|| {
            v.pointer("/output/choices/0/message/content")
                .and_then(|c| c.as_array())
                .and_then(|parts| parts.iter().find_map(|p| p.get("text").and_then(|t| t.as_str())))
                .map(|s| s.to_string())
        })
}

// ── URL/Base64 → OpenAI data item 统一转换（build_openai_sync 和 build_openai_poll 共用）──
fn build_data_item(u: &str) -> Value {
    if u.starts_with("data:") {
        // data:image/png;base64,xxx → 拆分为 b64_json（纯 base64 时）或 url（TOS 替换后值为 URL 时）
        if let Some(pos) = u.find(",") {
            let payload = &u[pos + 1..];
            if payload.starts_with("http://") || payload.starts_with("https://") {
                json!({"url": payload})
            } else {
                json!({"b64_json": payload})
            }
        } else {
            json!({"url": u})
        }
    } else {
        json!({"url": u})
    }
}

// ── 同步完成 ──
fn build_openai_sync(_category: &str, v: &Value, fallback_id: Option<&str>) -> String {
    let now = chrono::Utc::now().timestamp();
    let created = v.get("created").and_then(|c| c.as_i64()).unwrap_or(now);
    let urls = find_urls(v);
    let revised = find_revised_prompt(v);

    let items: Vec<Value> = urls
        .iter()
        .map(|u| {
            let mut item = build_data_item(u);
            if let Some(ref rp) = revised {
                item["revised_prompt"] = json!(rp);
            }
            item
        })
        .collect();

    let mut resp = json!({"created": created, "data": items});
    if let Some(fid) = fallback_id {
        if !fid.is_empty() {
            resp["id"] = json!(fid);
        }
    }
    to_json(&resp)
}

// ── 异步提交 ──
fn build_openai_submit(category: &str, v: &Value, id: &str) -> String {
    let now = chrono::Utc::now().timestamp();
    let created = find_ts(v, &["created_at", "created", "submit_time"]);
    to_json(&json!({
        "id": id,
        "object": openai_object(category),
        "status": "pending",
        "created": if created > 0 { created } else { now }
    }))
}

// ── 异步轮询 ──
/// fallback_id: 当 find_id 解析不到 task_id 时的兜底 ID（如即梦轮询响应不含 task_id）
fn build_openai_poll(category: &str, v: &Value, fallback_id: Option<&str>) -> String {
    let status = openai_status(v);
    let id = find_id(v);
    // 即梦等厂商轮询响应不含 task_id，使用调用方已知的任务 ID 兜底
    let id = if id.is_empty() { fallback_id.unwrap_or_default().to_string() } else { id };
    let created = find_ts(v, &["created_at", "created", "submit_time"]);
    let now = chrono::Utc::now().timestamp();

    let mut resp = json!({
        "id": id,
        "object": openai_object(category),
        "status": status,
        "created": if created > 0 { created } else { now }
    });

    if status == "completed" {
        let urls = find_urls(v);
        if !urls.is_empty() {
            let revised = find_revised_prompt(v);
            let extra = scan_extra_metadata(v);
            let items: Vec<Value> = urls
                .iter()
                .map(|u| {
                    let mut item = build_data_item(u);
                    if let Some(ref rp) = revised {
                        item["revised_prompt"] = json!(rp);
                    }
                    // 注入厂商附加重要元数据（last_frame_url、cover_url）
                    for (k, ev) in &extra {
                        item[k] = ev.clone();
                    }
                    item
                })
                .collect();
            resp["data"] = json!(items);
        }
        resp["usage"] = extract_usage(v);
    }

    if status == "failed" {
        let msg = extract_error_message(v);
        resp["error"] = json!({"message": crate::relay::proxy::sanitize_error_message(&msg)});
    }

    to_json(&resp)
}

/// 从任意厂商响应 JSON 中提取错误消息（兼容可灵、APIMart、DashScope 等）
/// 供各 relay 模块复用，避免硬编码通用错误文本
pub fn extract_error_message(v: &Value) -> String {
    v.pointer("/data/task/task_status_msg")
        .or_else(|| v.pointer("/data/error/message"))
        .or_else(|| v.pointer("/data/errorMsg"))
        .or_else(|| v.get("message"))
        .or_else(|| v.pointer("/output/message"))
        .or_else(|| v.pointer("/error/message"))
        .or_else(|| v.pointer("/ResponseMetadata/Error/Message"))
        .and_then(|m| m.as_str())
        .unwrap_or("generation failed")
        .to_string()
}

/// 从上游响应中扫描厂商特有的重要附加字段
fn scan_extra_metadata(v: &Value) -> serde_json::Map<String, Value> {
    let mut meta = serde_json::Map::new();
    // last_frame_url: 火山方舟视频生成的尾帧图片
    let last_frame = v
        .pointer("/content/last_frame_url")
        .or_else(|| v.pointer("/content/0/last_frame_url"))
        .or_else(|| v.pointer("/data/task/task_result/videos/0/last_frame_url"))
        .or_else(|| v.pointer("/data/last_frame_url"))
        .or_else(|| v.get("last_frame_url"))
        .and_then(|u| u.as_str());
    if let Some(url) = last_frame {
        meta.insert("last_frame_url".to_string(), json!(url));
    }
    // cover_url / thumbnail_url: 封面图（可灵、火山等）
    let cover = v
        .pointer("/data/task/task_result/thumbnail_url")
        .or_else(|| v.pointer("/output/thumbnail_url"))
        .or_else(|| v.pointer("/data/task_result/videos/0/cover_url"))
        .or_else(|| v.get("cover_url"))
        .or_else(|| v.get("thumbnail_url"))
        .and_then(|u| u.as_str());
    if let Some(url) = cover {
        meta.insert("cover_url".to_string(), json!(url));
    }
    meta
}
