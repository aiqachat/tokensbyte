//! 响应格式化引擎 (Response Formatter)
//! 将各厂商上游返回格式归一化为 OpenAI 标准规范格式。
//! 仅对 OpenAI 兼容路由（/v1/images/generations、/v1/images/edits、/v1/video/generations、/v1/tasks/）生效。
//! 设计原则：采用递归扫描模式，确保无论上游结构如何变化，都能准确抓取 ID、状态和媒体 URL。

use regex::Regex;
use serde_json::{json, Value};

/// 判定请求路径是否属于标准的 OpenAI 兼容 API 路径（排除如 /api/ 厂商原生接口）
pub fn is_openai_compatible_path(raw_path: &str) -> bool {
    !raw_path.starts_with("/api/")
        && (raw_path == "/v1/images/generations"
            || raw_path == "/v1/images/edits"
            || raw_path == "/v1/video/generations"
            || raw_path.starts_with("/v1/video/generations/")
            || raw_path.starts_with("/v1/tasks/"))
}

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
    if !is_openai_compatible_path(raw_path) {
        return raw_response.to_string();
    }

    format_openai(category, raw_response, is_async_submit, fallback_id)
}

/// OpenAI 格式化核心逻辑
/// fallback_id: 当 find_id 返回空时的兜底 ID（如即梦轮询响应不含 task_id）
pub fn format_openai(
    category: &str,
    raw: &str,
    is_async_submit: bool,
    fallback_id: Option<&str>,
) -> String {
    let v: Value = match serde_json::from_str(raw) {
        Ok(val) => val,
        Err(_) => return raw.to_string(),
    };

    // 严谨修复与极简重构：检测并捕获上游业务级 API 错误，统一转换为标准 OpenAI 错误格式返回（保障同步、异步和流式计费的安全退款）
    if is_upstream_error_response(&v) {
        // 已是 OpenAI error 格式 → 原样透传；其余厂商错误（含 ErrorCode/ErrorMessage）→ 统一转换
        return format_as_openai_error(&v).unwrap_or_else(|| raw.to_string());
    }

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
        let effective_id = if id.is_empty() {
            fallback_id.unwrap_or_default().to_string()
        } else {
            id
        };
        if !effective_id.is_empty() {
            return build_openai_submit(category, &v, &effective_id);
        }
    }

    // 含异步任务字段 → 轮询结果
    if has_task_fields(&v) {
        return build_openai_poll(category, &v, fallback_id);
    }

    // 同步结果：无异步任务字段且有媒体数据
    let urls = find_urls(&v);
    if !urls.is_empty() {
        return build_openai_sync(category, &v, urls, fallback_id);
    }

    // 其他情况（如错误响应）→ 原样透传，避免包装为假的 200 成功
    raw.to_string()
}

// ── ID 提取（公共方法，供 task.rs / image.rs / proxy.rs 复用） ──

/// 从任意厂商响应 JSON 中提取任务 ID（兼容 task_id / id / data.task_id 等多种路径）
/// 搜索路径覆盖：根节点、data 对象/数组、output、data.task.id、腾讯云 Response.TaskId
pub fn find_id(v: &Value) -> String {
    let mut id = v
        .get("task_id")
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
        .to_string();

    if id.is_empty() {
        if let Some(resp) = v.get("Response") {
            if let Some(task_type) = resp.get("TaskType").and_then(|t| t.as_str()) {
                if let Some(task) = resp.get(task_type) {
                    if let Some(val) = task.get("TaskId").and_then(|val| val.as_str()) {
                        id = val.to_string();
                    }
                }
            }
        }
    }

    id
}

/// 统一提取异步任务 ID。自动过滤聊天响应（包含 choices / candidates 字段）的干扰性通用会话 ID。
pub fn extract_async_task_id(v: &Value) -> String {
    let id = find_id(v);
    // 聊天响应的 id 字段是会话 ID，不是异步任务 ID
    if !id.is_empty() && (v.get("choices").is_some() || v.get("candidates").is_some()) {
        String::new()
    } else {
        id
    }
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
        || v.pointer("/Response/Status").is_some()
}

/// 从任意厂商响应 JSON 中提取原始状态字，并自动应用特定平台的校验（如腾讯云 ErrCode、即梦 code）
pub fn extract_raw_status(v: &Value) -> String {
    // 腾讯云 DescribeTaskDetail 特殊处理：Status="FINISH" 时校验任务节点的 ErrCode，非 0 视为 FAILED
    if let Some(resp) = v.get("Response") {
        if let Some(status) = resp.get("Status").and_then(|s| s.as_str()) {
            if status.eq_ignore_ascii_case("FINISH") {
                const TASK_KEYS: &[&str] =
                    &["AigcVideoTask", "AigcImageTask", "SceneAigcImageTask"];
                let mut err_code = 0i64;
                let mut found_err_code = false;
                for key in TASK_KEYS {
                    if let Some(task) = resp.get(*key) {
                        if let Some(val) = task.get("ErrCode").and_then(|val| val.as_i64()) {
                            err_code = val;
                            found_err_code = true;
                            break;
                        }
                    }
                }
                if !found_err_code {
                    if let Some(task_type) = resp.get("TaskType").and_then(|t| t.as_str()) {
                        if let Some(task) = resp.get(task_type) {
                            if let Some(val) = task.get("ErrCode").and_then(|val| val.as_i64()) {
                                err_code = val;
                                found_err_code = true;
                            }
                        }
                    }
                }
                if found_err_code && err_code != 0 {
                    return "FAILED".to_string();
                }
            }
            return status.to_string();
        }
    }

    // 即梦AI特殊处理：data.status="done" 时需检查外层 code。10000 为成功，否则失败。
    if let Some(status) = v.pointer("/data/status").and_then(|s| s.as_str()) {
        if status == "done" {
            let code = v.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            return if code == 10000 {
                "done".to_string()
            } else {
                "FAILED".to_string()
            };
        }
    }

    v.get("status")
        .or_else(|| v.get("task_status"))
        .or_else(|| v.pointer("/data/status"))
        .or_else(|| v.pointer("/data/task_status"))
        .or_else(|| v.pointer("/data/0/status"))
        .or_else(|| v.pointer("/data/task/status"))
        .or_else(|| v.pointer("/final_result/status"))
        .or_else(|| v.pointer("/output/task_status"))
        .or_else(|| v.pointer("/Response/Status"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string()
}

/// 将任意厂商的状态字符串统一归一化为标准的异步任务状态
pub fn parse_raw_status_to_standard(raw: &str) -> &'static str {
    match raw.to_lowercase().trim() {
        "completed" | "succeeded" | "succeed" | "success" | "finish" | "done" => "completed",
        "failed" | "canceled" | "cancelled" | "error" | "timeout" | "unknown" | "fail"
        | "abort" | "not_found" | "expired" => "failed",
        "processing" | "running" | "active" | "generating" | "waiting" | "in_queue" => {
            "in_progress"
        }
        "submitted" | "pending" | "queueing" => "pending",
        _ => "unknown",
    }
}

// ── 状态归一化 ──
fn find_status(v: &Value) -> String {
    let raw = extract_raw_status(v);
    parse_raw_status_to_standard(&raw).to_string()
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
    for path in &[
        "/data/task_result/images",
        "/data/task_result/videos",
        "/data/task/task_result/images",
        "/data/task/task_result/videos",
    ] {
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
        if let Some(arr) = v
            .pointer("/data/binary_data_base64")
            .and_then(|a| a.as_array())
        {
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
    // 火山引擎 AI MediaKit 画质增强与字幕擦除：从响应中提取生成的视频地址 (/result/video_url)
    if let Some(u) = v.pointer("/result/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 4. 阿里 DashScope: output.results[].url / output.video_url
    if let Some(arr) = v.pointer("/output/results").and_then(|a| a.as_array()) {
        for item in arr {
            let u = item
                .get("url")
                .or_else(|| item.get("video_url"))
                .and_then(|u| u.as_str());
            if let Some(u) = u {
                push_unique(&mut urls, u);
            }
        }
    }
    if let Some(u) = v.pointer("/output/video_url").and_then(|u| u.as_str()) {
        push_unique(&mut urls, u);
    }

    // 4b. 阿里 DashScope chat 格式: output.choices[].message.content[].image
    if let Some(choices) = v.pointer("/output/choices").and_then(|c| c.as_array()) {
        for choice in choices {
            if let Some(parts) = choice
                .pointer("/message/content")
                .and_then(|c| c.as_array())
            {
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
                        if let Some(s) = u.as_str() {
                            push_unique(&mut urls, s);
                        }
                    }
                }
            }
        }
    }

    // 5b. Bytefor: data.files[].fileUrl 或 data.files[].file_url
    if let Some(arr) = v.pointer("/data/files").and_then(|a| a.as_array()) {
        for item in arr {
            if let Some(u) = item
                .get("fileUrl")
                .or_else(|| item.get("file_url"))
                .and_then(|u| u.as_str())
            {
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
                                let mime = inline
                                    .get("mimeType")
                                    .or_else(|| inline.get("mime_type"))
                                    .and_then(|m| m.as_str())
                                    .unwrap_or("image/png");
                                push_unique(&mut urls, &format!("data:{};base64,{}", mime, data));
                            }
                        }
                    }
                    // 书虫格式/Gemini文本格式：text 中的 Markdown 图片 或嵌入的 HTTP URL
                    else if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                        // 1. 匹配 Markdown 中的 base64 图片格式 ![...](data:image/...;base64,...)
                        let base64_re =
                            Regex::new(r"data:([^;]+);base64,([a-zA-Z0-9+/=]+)").unwrap();
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

    // 6b. 腾讯云 VOD / 混元 AIGC: Response.{TaskType}.Output.FileInfos[].FileUrl / Url
    if let Some(resp) = v.get("Response") {
        const TASK_KEYS: &[&str] = &["AigcVideoTask", "AigcImageTask", "SceneAigcImageTask"];
        for key in TASK_KEYS {
            if let Some(task) = resp.get(*key) {
                if let Some(arr) = task.pointer("/Output/FileInfos").and_then(|a| a.as_array()) {
                    for item in arr {
                        if let Some(u) = item
                            .get("FileUrl")
                            .or_else(|| item.get("Url"))
                            .and_then(|u| u.as_str())
                        {
                            push_unique(&mut urls, u);
                        }
                    }
                }
            }
        }
        if let Some(task_type) = resp.get("TaskType").and_then(|t| t.as_str()) {
            if let Some(task) = resp.get(task_type) {
                if let Some(arr) = task.pointer("/Output/FileInfos").and_then(|a| a.as_array()) {
                    for item in arr {
                        if let Some(u) = item
                            .get("FileUrl")
                            .or_else(|| item.get("Url"))
                            .and_then(|u| u.as_str())
                        {
                            push_unique(&mut urls, u);
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
            if (s.starts_with("http://") || s.starts_with("https://"))
                && !urls.iter().any(|u| u == s)
            {
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
                if k == "request"
                    || k == "input"
                    || k == "task_input"
                    || k == "original_input"
                    || k == "task_data"
                {
                    continue;
                }
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
    if category.contains("视频") || category == "video" {
        "video.generation"
    } else {
        "image.generation"
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

// ── URL/Base64 → OpenAI data item 统一转换（build_openai_sync 和 build_openai_poll 共用）──
fn build_data_item(u: &str) -> Value {
    if u.starts_with("data:") {
        // data:image/png;base64,xxx → b64_json；TOS 替换后 payload 为 http → url
        let payload = crate::relay::forward::b64_data(u);
        if payload == u.trim() {
            json!({"url": u})
        } else if payload.starts_with("http://") || payload.starts_with("https://") {
            json!({"url": payload})
        } else {
            json!({"b64_json": payload})
        }
    } else {
        json!({"url": u})
    }
}

// ── 同步完成 ──
fn build_openai_sync(
    _category: &str,
    v: &Value,
    urls: Vec<String>,
    fallback_id: Option<&str>,
) -> String {
    let now = chrono::Utc::now().timestamp();
    let created = v.get("created").and_then(|c| c.as_i64()).unwrap_or(now);

    let items: Vec<Value> = urls.iter().map(|u| build_data_item(u)).collect();

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
    let id = if id.is_empty() {
        fallback_id.unwrap_or_default().to_string()
    } else {
        id
    };
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
            let extra = scan_extra_metadata(v);
            let items: Vec<Value> = urls
                .iter()
                .map(|u| {
                    let mut item = build_data_item(u);
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

/// 统一从 Value 中提取最核心的错误文本信息（集合了所有的已知厂商指针路径）
pub fn extract_error_message_from_value(v: &Value) -> Option<String> {
    v.pointer("/data/error/message")
        .or_else(|| v.pointer("/data/error"))
        .or_else(|| v.pointer("/error/message"))
        .or_else(|| v.pointer("/error"))
        .or_else(|| v.pointer("/data/task/task_status_msg"))
        .or_else(|| v.pointer("/data/errorMsg"))
        .or_else(|| v.get("message"))
        .or_else(|| v.pointer("/output/message"))
        .or_else(|| v.pointer("/Response/Error/Message"))
        .or_else(|| v.pointer("/ResponseMetadata/Error/Message"))
        // 方舟/智算等扁平错误：{"ErrorCode":"...","ErrorMessage":"..."}
        .or_else(|| v.get("ErrorMessage"))
        // 腾讯云任务级：优先 Response.{TaskType}.Message，无 TaskType 时回退已知 Aigc* 节点
        .or_else(|| tencent_task_message(v))
        .and_then(|val| {
            if val.is_object() {
                val.get("message")
                    .or_else(|| val.get("msg"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| Some(val.to_string()))
            } else {
                val.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| Some(val.to_string()))
            }
        })
}

/// 腾讯云 VOD/混元任务节点 Message：TaskType 动态路径优先，硬编码键兜底
fn tencent_task_message(v: &Value) -> Option<&Value> {
    let resp = v.get("Response")?;
    let task = resp
        .get("TaskType")
        .and_then(|t| t.as_str())
        .and_then(|tt| resp.get(tt))
        .or_else(|| {
            ["AigcVideoTask", "AigcImageTask"]
                .iter()
                .find_map(|k| resp.get(*k))
        })?;
    let msg = task.get("Message")?;
    match msg.as_str() {
        Some(s) if !s.is_empty() => Some(msg),
        _ => None,
    }
}

/// 从任意厂商响应 JSON 中提取错误消息（兼容可灵、APIMart、DashScope 等）
/// 供各 relay 模块复用，避免硬编码通用错误文本
pub fn extract_error_message(v: &Value) -> String {
    extract_error_message_from_value(v).unwrap_or_else(|| "generation failed".to_string())
}

/// 从响应 JSON 中提取结构化错误分类码，供 HTTP 状态码推断和错误格式化使用
/// 优先精确路径（error.code / data.error.code / 腾讯云 / 即梦火山网关 / ErrorCode），兜底根节点 code
/// 接受字符串（如 "PolicyViolation" / "PERMISSION_ERROR"）和数字（如 429），统一转为字符串返回
/// 注：仅在已确认为错误响应时调用，根节点 code 不会出现成功值（10000/200/0）
pub fn extract_error_code_from_value(v: &Value) -> Option<String> {
    v.pointer("/error/code")
        .or_else(|| v.pointer("/data/error/code"))
        .or_else(|| v.pointer("/Response/Error/Code"))
        .or_else(|| v.pointer("/ResponseMetadata/Error/Code"))
        // 方舟/智算等扁平错误：{"ErrorCode":"PERMISSION_ERROR","ErrorMessage":"..."}
        .or_else(|| v.get("ErrorCode"))
        .or_else(|| v.get("code")) // APIMart/即梦根节点数字或字符串 code
        .and_then(|c| {
            c.as_str()
                .map(|s| s.to_string())
                .or_else(|| c.as_i64().map(|n| n.to_string()))
        })
}

/// 从上游响应中扫描厂商特有的重要附加字段
fn scan_extra_metadata(v: &Value) -> serde_json::Map<String, Value> {
    let mut meta = serde_json::Map::new();
    // last_frame_url: 火山方舟视频生成的尾帧图片
    let last_frame = v
        .pointer("/content/last_frame_url")
        .or_else(|| v.get("last_frame_url"))
        .and_then(|u| u.as_str());
    if let Some(url) = last_frame {
        meta.insert("last_frame_url".to_string(), json!(url));
    }
    // cover_url / thumbnail_url: 封面图（可灵、火山等）
    let cover = v
        .pointer("/data/task_result/videos/0/cover_url")
        .or_else(|| v.pointer("/output/thumbnail_url"))
        .or_else(|| v.get("cover_url"))
        .or_else(|| v.get("thumbnail_url"))
        .and_then(|u| u.as_str());
    if let Some(url) = cover {
        meta.insert("cover_url".to_string(), json!(url));
    }
    meta
}

/// 辅助函数：判断响应体是否是上游业务报错状态（聚合所有已知厂商的报错标识，如腾讯云、即梦、火山MediaKit、Bytefor等）
pub fn is_upstream_error_response(v: &Value) -> bool {
    // 1. 腾讯云 API 级别错误
    if v.pointer("/Response/Error").is_some() {
        return true;
    }
    // 2. 即梦/火山网关错误
    if v.pointer("/ResponseMetadata/Error").is_some() {
        return true;
    }
    // 3. 方舟/智算等扁平错误：{"ErrorCode":"PERMISSION_ERROR","ErrorMessage":"..."}
    //    仅认非空 PascalCase ErrorCode，避免与业务成功体中的小写 code/message 混淆
    if v.get("ErrorCode")
        .and_then(|c| c.as_str())
        .is_some_and(|c| !c.is_empty())
    {
        return true;
    }
    // 4. 含有 error 节点（且 error 节点内含有 message/msg 或 code，或者 error 本身是字符串）
    if let Some(err) = v.get("error") {
        if err.is_string()
            || err.get("message").is_some()
            || err.get("msg").is_some()
            || err.get("code").is_some()
        {
            return true;
        }
    }
    if let Some(err) = v.pointer("/data/error") {
        if err.is_string()
            || err.get("message").is_some()
            || err.get("msg").is_some()
            || err.get("code").is_some()
        {
            return true;
        }
    }
    // 5. 常见的 code 错误指示（排除 0 和 200, 10000 等正常成功值）
    if let Some(code_val) = v.get("code") {
        if let Some(code) = code_val.as_i64() {
            if code != 0 && code != 200 && code != 10000 {
                return true;
            }
        } else if let Some(code_str) = code_val.as_str() {
            if code_str != "0"
                && code_str != "200"
                && code_str != "10000"
                && code_str != "success"
                && code_str != "ok"
            {
                return true;
            }
        }
    }
    // 6. 火山 MediaKit success 字段指示
    if let Some(success) = v.get("success").and_then(|s| s.as_bool()) {
        if !success {
            return true;
        }
    }
    false
}

/// 将已识别的上游业务错误 Value 转为标准 OpenAI error JSON 字符串。
/// 若已是 OpenAI error 格式（含 error.message）则返回 None，由调用方原样透传。
pub fn format_as_openai_error(v: &Value) -> Option<String> {
    if v.pointer("/error/message").is_some() || !is_upstream_error_response(v) {
        return None;
    }
    let msg = extract_error_message(v);
    let code = extract_error_code_from_value(v).unwrap_or_else(|| "upstream_error".to_string());
    // 仅对 permission 类给出 OpenAI 标准 type；其余保持既有 upstream_error，避免改变旧行为
    let err_type = if code.to_lowercase().contains("permission") {
        "permission_error"
    } else {
        "upstream_error"
    };
    Some(to_json(&json!({
        "error": {
            "message": crate::relay::proxy::sanitize_error_message(&msg),
            "type": err_type,
            "code": code
        }
    })))
}
