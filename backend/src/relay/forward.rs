//! 统一转发规则解析器
//! 所有 relay 端点（聊天/图片/视频）共用此模块，根据模型绑定的转发规则
//! 自动决定：上游 URL 路径 / 请求体格式 / 鉴权方式。

use crate::AppState;
use super::url_utils::join_url;

// ── 解析后的转发配置 ──────────────────────────────────────────

/// 转发规则解析结果
#[derive(Debug, Clone)]
pub struct ResolvedForward {
    /// 目标协议类型: "openai", "volcengine", "volcengine_chat", "gemini", "gemini_image", "anthropic"
    pub target_type: String,
    /// 上游路径 e.g. "/api/v3/chat/completions"
    pub upstream_path: String,
    /// 鉴权方式: "bearer", "query_key", "x-api-key"
    pub auth_type: String,
}

// ── 转发规则解析 ──────────────────────────────────────────────

/// 根据模型 ID、请求类别、入口路径，从 DB 查找匹配的转发规则。
///
/// 逻辑：
/// 1. 查 models 表取 forward_rule_ids（JSON 数组如 [1,5,8]）
/// 2. 查 forward_rules 表，筛选 category 匹配且 is_active=1
/// 3. 如果有多条同类别规则，从 config_json.path_rewrite.old 匹配入口路径
/// 4. 找不到 → 返回 None，调用方按 OpenAI 格式透传
pub async fn resolve_forward_rule(
    state: &AppState,
    model_id: &str,
    category: &str,
    entry_path: &str,
) -> Option<ResolvedForward> {
    // 1. 查模型获取 forward_rule_ids
    let model_result = sqlx::query_as::<_, crate::models::Model>(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model_id)
    .fetch_optional(&state.db.pool)
    .await;

    let model = match model_result {
        Ok(Some(m)) => m,
        Ok(None) => {
            tracing::debug!("[Forward] 模型 '{}' 在 models 表中未找到(或 is_active!=1)", model_id);
            return None;
        }
        Err(e) => {
            tracing::warn!("[Forward] 查询 models 表失败: {}", e);
            return None;
        }
    };

    let rule_ids_str = model.forward_rule_ids.as_deref().unwrap_or("[]");
    let rule_ids: Vec<i64> = serde_json::from_str(rule_ids_str).unwrap_or_default();
    if rule_ids.is_empty() {
        tracing::debug!("[Forward] 模型 '{}' 未绑定转发规则 (forward_rule_ids={})", model_id, rule_ids_str);
        return None;
    }

    tracing::info!("[Forward] 模型 '{}' 绑定规则 IDs: {:?}, 类别: {}, 入口: {}", model_id, rule_ids, category, entry_path);

    // 2. 查所有关联的转发规则
    let placeholders: Vec<String> = rule_ids.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "SELECT * FROM forward_rules WHERE id IN ({}) AND is_active = 1",
        placeholders.join(",")
    );
    let formatted = state.db.format_query(&query_str);
    let mut q = sqlx::query_as::<_, crate::models::ForwardRule>(&formatted);
    for id in &rule_ids {
        q = q.bind(id);
    }
    let rules: Vec<crate::models::ForwardRule> = q
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();

    if rules.is_empty() {
        tracing::warn!("[Forward] 规则 IDs {:?} 在 forward_rules 表中未找到(或 is_active!=1)", rule_ids);
        return None;
    }

    // 3. 按 category 筛选
    let category_matched: Vec<&crate::models::ForwardRule> = rules
        .iter()
        .filter(|r| r.category == category)
        .collect();

    let candidates = if category_matched.is_empty() {
        rules.iter().collect::<Vec<_>>()
    } else {
        category_matched
    };

    // 4. 智能匹配：从 config_json.path_rewrite.old 匹配入口路径
    let mut best: Option<&crate::models::ForwardRule> = None;
    for rule in &candidates {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&rule.config_json) {
            if let Some(old_path) = config
                .get("path_rewrite")
                .and_then(|pr| pr.get("old"))
                .and_then(|v| v.as_str())
            {
                let old_path_clean = old_path.trim_start_matches('/');
                let entry_path_clean = entry_path.trim_start_matches('/');
                if old_path_clean == entry_path_clean || entry_path_clean.ends_with(old_path_clean) {
                    best = Some(rule);
                    break;
                }
            }
        }
    }
    let rule = best.unwrap_or(candidates.first()?);

    // 5. 解析 config_json
    let config: serde_json::Value =
        serde_json::from_str(&rule.config_json).unwrap_or_default();

    let target_type = config
        .get("target_type")
        .and_then(|v| v.as_str())
        .unwrap_or("openai")
        .to_string();

    let upstream_path = if let Some(pr) = config.get("path_rewrite") {
        let old = pr.get("old").and_then(|v| v.as_str()).unwrap_or("");
        let new = pr.get("new").and_then(|v| v.as_str()).unwrap_or("");
        
        if !old.is_empty() && entry_path.contains(old) {
            entry_path.replace(old, new)
        } else if !new.is_empty() {
            new.to_string()
        } else {
            entry_path.to_string()
        }
    } else {
        entry_path.to_string()
    };

    let auth_type = config
        .get("auth_type")
        .and_then(|v| v.as_str())
        .unwrap_or("bearer")
        .to_string();

    tracing::info!("[Forward] 命中规则 '{}': target_type={}, upstream_path={}, auth_type={}", rule.name, target_type, upstream_path, auth_type);

    Some(ResolvedForward {
        target_type,
        upstream_path,
        auth_type,
    })
}

// ── URL 构建 ──────────────────────────────────────────────────

/// 构建上游完整 URL，支持 ${model} 变量替换
pub fn build_upstream_url(
    base_url: &str,
    resolved: &ResolvedForward,
    model: &str,
    api_key: &str,
) -> String {
    let path = resolved.upstream_path.replace("${model}", model);

    if resolved.auth_type == "query_key" {
        // Gemini 风格: URL 中带 key 参数
        format!("{}?key={}", join_url(base_url, &path), api_key)
    } else {
        join_url(base_url, &path)
    }
}

// ── 请求体转换 ─────────────────────────────────────────────────

/// 将 OpenAI 格式请求体转换为目标上游格式。
///
/// 数据驱动映射：
/// - volcengine（图片/视频）: prompt → content[{type:"text",text:...}]
/// - volcengine_chat / volcengine（聊天）: 保持 OpenAI 格式（火山兼容）
/// - gemini / gemini_image: messages/prompt → contents[{parts:[{text:...}]}]
/// - anthropic: messages → Anthropic Messages 格式
/// - openai / 其他: 直接透传
pub fn transform_request_body(
    resolved: &ResolvedForward,
    model: &str,
    body: &serde_json::Value,
    category: &str,
) -> serde_json::Value {
    let mut result = match resolved.target_type.as_str() {
        // 火山方舟图片（/api/v3/images/generations）: 保持 OpenAI 兼容格式，仅替换 model
        "volcengine_image" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            fwd
        }

        // 火山方舟图片/视频（/api/v3/contents/generations/tasks）: prompt → content 格式
        // 参考火山引擎 Seedance 2.0 官方 API：https://www.volcengine.com/docs/82379/1520757
        "volcengine" if category == "图片" || category == "视频" => {
            build_volcengine_content_body(model, body)
        }

        // 火山方舟聊天：保持 OpenAI 格式（火山完全兼容 OpenAI）
        "volcengine_chat" | "volcengine" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            
            // 优化火山引擎流式返回：如果 stream 为 true，设置 stream_options.include_usage = true
            // 以便在流模式下也能获取到 tokens 使用量进行计费
            if let Some(stream_val) = fwd.get("stream") {
                if stream_val.as_bool().unwrap_or(false) {
                    if let Some(obj) = fwd.as_object_mut() {
                        obj.insert(
                            "stream_options".to_string(), 
                            serde_json::json!({ "include_usage": true })
                        );
                    }
                }
            }
            
            fwd
        }

        // Gemini 图片：prompt → contents 格式
        "gemini_image" => {
            let prompt = body["prompt"]
                .as_str()
                .unwrap_or("Generate an image");
            serde_json::json!({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
            })
        }

        // Gemini 聊天：messages → contents 格式
        "gemini" => {
            let mut contents = Vec::new();
            let mut system_instruction: Option<serde_json::Value> = None;

            if let Some(messages) = body.get("messages").and_then(|m| m.as_array()) {
                for msg in messages {
                    let role = msg["role"].as_str().unwrap_or("user");
                    let text = match &msg["content"] {
                        serde_json::Value::String(s) => s.clone(),
                        v if !v.is_null() => v.to_string(),
                        _ => continue,
                    };
                    if role == "system" {
                        system_instruction = Some(serde_json::json!({
                            "parts": [{"text": text}]
                        }));
                    } else {
                        let gemini_role = if role == "assistant" { "model" } else { "user" };
                        contents.push(serde_json::json!({
                            "role": gemini_role,
                            "parts": [{"text": text}]
                        }));
                    }
                }
            }

            let mut result = serde_json::json!({"contents": contents});
            if let Some(si) = system_instruction {
                result["systemInstruction"] = si;
            }
            // 透传 generationConfig 参数
            let mut gen_config = serde_json::Map::new();
            if let Some(t) = body.get("temperature") { gen_config.insert("temperature".to_string(), t.clone()); }
            if let Some(t) = body.get("top_p") { gen_config.insert("topP".to_string(), t.clone()); }
            if let Some(t) = body.get("max_tokens") { gen_config.insert("maxOutputTokens".to_string(), t.clone()); }
            if !gen_config.is_empty() {
                result["generationConfig"] = serde_json::Value::Object(gen_config);
            }
            result
        }

        // Anthropic 聊天：messages → Anthropic 格式
        "anthropic" => {
            let mut system_msg: Option<String> = None;
            let mut messages = Vec::new();

            if let Some(msgs) = body.get("messages").and_then(|m| m.as_array()) {
                for msg in msgs {
                    let role = msg["role"].as_str().unwrap_or("user");
                    let text = match &msg["content"] {
                        serde_json::Value::String(s) => s.clone(),
                        v if !v.is_null() => v.to_string(),
                        _ => continue,
                    };
                    if role == "system" {
                        system_msg = Some(text);
                    } else {
                        messages.push(serde_json::json!({"role": role, "content": text}));
                    }
                }
            }

            let mut result = serde_json::json!({
                "model": model,
                "messages": messages,
                "max_tokens": body.get("max_tokens").and_then(|v| v.as_i64()).unwrap_or(4096),
            });
            if let Some(sys) = system_msg {
                result["system"] = serde_json::json!(sys);
            }
            if let Some(t) = body.get("temperature") { result["temperature"] = t.clone(); }
            if let Some(t) = body.get("top_p") { result["top_p"] = t.clone(); }
            if let Some(s) = body.get("stream") { result["stream"] = s.clone(); }
            result
        }

        _ => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            fwd
        }
    };

    // 视频模型默认分辨率 720p（确保上游数据与计费一致）
    if category == "视频" && result.get("resolution").is_none() {
        result["resolution"] = serde_json::json!("720p");
    }

    // 统一后处理：web_search 联网搜索参数转换
    convert_web_search(&mut result, body, &resolved.target_type);
    result
}

/// 将 OpenAI 风格的 `web_search: true` 转换为目标平台的联网搜索参数。
/// 火山方舟统一使用 `tools: [{"type": "web_search"}]` 格式。
fn convert_web_search(result: &mut serde_json::Value, original: &serde_json::Value, target_type: &str) {
    if !original.get("web_search").and_then(|v| v.as_bool()).unwrap_or(false) { return; }
    match target_type {
        "volcengine" | "volcengine_chat" | "volcengine_image" => {
            result["tools"] = serde_json::json!([{"type": "web_search"}]);
            if let Some(obj) = result.as_object_mut() { obj.remove("web_search"); }
        }
        _ => {}
    }
}

// ── 鉴权 Header 构建 ──────────────────────────────────────────

/// 根据 auth_type 构建请求 Headers
pub fn build_auth_headers(resolved: &ResolvedForward, api_key: &str) -> Vec<(String, String)> {
    match resolved.auth_type.as_str() {
        "x-api-key" => vec![
            ("x-api-key".to_string(), api_key.to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ],
        "query_key" => vec![], // key 已在 URL 中
        _ => vec![(
            "Authorization".to_string(),
            format!("Bearer {}", api_key),
        )],
    }
}

// ── 默认转发配置（无规则时的 OpenAI 透传）─────────────────────

/// 获取默认的 OpenAI 格式转发配置
pub fn default_openai_forward(entry_path: &str) -> ResolvedForward {
    ResolvedForward {
        target_type: "openai".to_string(),
        upstream_path: entry_path.to_string(),
        auth_type: "bearer".to_string(),
    }
}

// ── 域名智能推断（无转发规则时的自动识别）─────────────────────

/// 根据 channel base_url 域名自动推断正确的转发配置。
/// 当模型未绑定转发规则时使用，避免把火山/Google/Anthropic 请求
/// 错误地按 OpenAI 路径透传。
pub fn infer_forward_from_base_url(base_url: &str, category: &str) -> ResolvedForward {
    let url_lower = base_url.to_lowercase();

    if url_lower.contains("volces.com") || url_lower.contains("volcengine") {
        match category {
            "图片" => ResolvedForward {
                target_type: "volcengine_image".to_string(),
                upstream_path: "/api/v3/images/generations".to_string(),
                auth_type: "bearer".to_string(),
            },
            "视频" => ResolvedForward {
                target_type: "volcengine".to_string(),
                upstream_path: "/api/v3/contents/generations/tasks".to_string(),
                auth_type: "bearer".to_string(),
            },
            _ => ResolvedForward {
                target_type: "volcengine_chat".to_string(),
                upstream_path: "/api/v3/chat/completions".to_string(),
                auth_type: "bearer".to_string(),
            },
        }
    } else if url_lower.contains("googleapis.com") || url_lower.contains("generativelanguage") {
        match category {
            "图片" => ResolvedForward {
                target_type: "gemini_image".to_string(),
                upstream_path: "/v1beta/models/${model}:generateContent".to_string(),
                auth_type: "query_key".to_string(),
            },
            _ => ResolvedForward {
                target_type: "gemini".to_string(),
                upstream_path: "/v1beta/models/${model}:generateContent".to_string(),
                auth_type: "query_key".to_string(),
            },
        }
    } else if url_lower.contains("anthropic.com") {
        ResolvedForward {
            target_type: "anthropic".to_string(),
            upstream_path: "/v1/messages".to_string(),
            auth_type: "x-api-key".to_string(),
        }
    } else {
        default_openai_forward(match category {
            "图片" => "/v1/images/generations",
            "视频" => "/v1/video/generations",
            _ => "/v1/chat/completions",
        })
    }
}

// ── SSE 流式转换 ──────────────────────────────────────────────

/// 根据 target_type 转换 SSE 数据行为 OpenAI 格式
pub fn transform_sse_line(target_type: &str, line: &str, model: &str) -> Option<String> {
    if !line.starts_with("data: ") { return None; }
    let data = &line[6..];
    if data == "[DONE]" { return None; }

    match target_type {
        "anthropic" => transform_anthropic_sse(data, model),
        "gemini" => transform_gemini_sse(data, model),
        _ => Some(data.to_string()), // OpenAI 兼容直接透传
    }
}

fn transform_anthropic_sse(data: &str, model: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    let event_type = v.get("type")?.as_str()?;
    if event_type == "content_block_delta" {
        let text = v.get("delta")?.get("text")?.as_str()?;
        return serde_json::to_string(&create_openai_chunk(text, model)).ok();
    }
    None
}

fn transform_gemini_sse(data: &str, model: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    let text = v.get("candidates")?
        .get(0)?
        .get("content")?
        .get("parts")?
        .get(0)?
        .get("text")?
        .as_str()?;
    serde_json::to_string(&create_openai_chunk(text, model)).ok()
}

fn create_openai_chunk(text: &str, model: &str) -> serde_json::Value {
    serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "object": "chat.completion.chunk",
        "created": chrono::Utc::now().timestamp(),
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {"role": "assistant", "content": text},
            "finish_reason": null
        }]
    })
}

// ── 火山方舟视频/图片请求体构建器 ──────────────────────────────
//
// 将 OpenAI 风格的扁平参数转换为火山方舟 /api/v3/contents/generations/tasks 所需的结构化格式。
// 参考文档：https://www.volcengine.com/docs/82379/1520757
//
// 设计原则（三级兼容）：
//   Level 3 — body 中已有 content 数组 → 原样直通，仅替换 model
//   Level 2 — images/videos/audios 元素为 {url, role} 对象 → 复用 role
//   Level 1 — images/videos/audios 元素为纯 URL 字符串 → 按数量智能推断 role
//
// 控制参数（resolution, duration, watermark 等）→ 顶层 key 数据驱动直通
// 新增参数只需在 PASSTHROUGH_KEYS 中追加，零侵入式扩展

/// 火山方舟视频/图片接口的「控制参数白名单」
/// 在用户请求体中出现即原样透传到火山上游请求体，扩展时追加一行即可。
const VOLCENGINE_CONTENT_PASSTHROUGH_KEYS: &[&str] = &[
    // 画面控制
    "ratio",             // 宽高比，如 "16:9", "4:3"
    "resolution",        // 分辨率，如 "480p", "720p", "1080p"
    "n",                 // 生成数量
    "size",              // 尺寸
    // 视频控制
    "duration",          // 视频时长（秒），如 5, 10
    "fps",               // 帧率
    "seed",              // 随机种子
    // 音频/水印/末帧
    "generate_audio",    // 是否生成音频 (bool)
    "return_last_frame", // 是否返回末帧 (bool)
    "watermark",         // 是否添加水印 (bool)
    // 流式/回调
    "stream",            // 是否流式返回
    "callback_url",      // 回调地址
];

/// 构建火山方舟 /api/v3/contents/generations/tasks 请求体。
///
/// 支持三种输入格式，系统自动识别：
///
/// **简单模式** — images/videos/audios 为纯 URL 字符串数组：
/// ```json
/// {"model": "...", "prompt": "...", "images": ["url1"], "resolution": "720p"}
/// ```
///
/// **高级模式** — 带 role 的结构化对象数组：
/// ```json
/// {"model": "...", "prompt": "...", "images": [{"url": "url1", "role": "first_frame"}]}
/// ```
///
/// **直通模式** — 直接传入火山官方 content 数组：
/// ```json
/// {"model": "...", "content": [{"type": "text", "text": "..."}, ...]}
/// ```
fn build_volcengine_content_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    // ── Level 3：直通模式 ──
    // body 中已包含 content 数组，原样使用，仅替换 model 并合并控制参数
    let content = if let Some(c) = body.get("content").filter(|v| v.is_array()) {
        c.clone()
    } else {
        // ── Level 1 & 2：从 prompt + images/videos/audios 构建 content ──
        let mut parts: Vec<serde_json::Value> = Vec::new();

        // 文本 prompt
        let prompt = body["prompt"].as_str().unwrap_or("Generate content");
        parts.push(serde_json::json!({"type": "text", "text": prompt}));

        // 图片：按数量智能推断默认 role
        //   1 张 → first_frame（首帧）
        //   2 张 → first_frame + last_frame（首尾帧）
        //   3+ 张 → 全部 reference_image（参考图）
        if let Some(arr) = body.get("images").and_then(|v| v.as_array()) {
            let defaults = infer_image_default_roles(arr.len());
            for (i, item) in arr.iter().enumerate() {
                let (url, role) = parse_media_item(item, defaults.get(i).copied().unwrap_or("reference_image"));
                if let Some(u) = url {
                    let mut entry = serde_json::json!({
                        "type": "image_url",
                        "image_url": {"url": u}
                    });
                    entry["role"] = serde_json::json!(role);
                    parts.push(entry);
                }
            }
        }

        // 视频：默认 role = reference_video
        if let Some(arr) = body.get("videos").and_then(|v| v.as_array()) {
            for item in arr {
                let (url, role) = parse_media_item(item, "reference_video");
                if let Some(u) = url {
                    let mut entry = serde_json::json!({
                        "type": "video_url",
                        "video_url": {"url": u}
                    });
                    entry["role"] = serde_json::json!(role);
                    parts.push(entry);
                }
            }
        }

        // 音频：默认 role = reference_audio
        if let Some(arr) = body.get("audios").and_then(|v| v.as_array()) {
            for item in arr {
                let (url, role) = parse_media_item(item, "reference_audio");
                if let Some(u) = url {
                    let mut entry = serde_json::json!({
                        "type": "audio_url",
                        "audio_url": {"url": u}
                    });
                    entry["role"] = serde_json::json!(role);
                    parts.push(entry);
                }
            }
        }

        serde_json::json!(parts)
    };

    // ── 组装请求体 ──
    let mut result = serde_json::json!({
        "model": model,
        "content": content,
    });

    // ── 数据驱动直通：遍历白名单，存在即透传 ──
    for key in VOLCENGINE_CONTENT_PASSTHROUGH_KEYS {
        if let Some(v) = body.get(*key) {
            result[*key] = v.clone();
        }
    }

    result
}

// ── 辅助函数 ──────────────────────────────────────────────────

/// 从数组元素中提取 (url, role)。
/// 兼容两种输入格式：
///   - 纯字符串 `"https://..."` → 使用 default_role
///   - 对象 `{"url": "https://...", "role": "first_frame"}` → 优先使用用户指定的 role
fn parse_media_item<'a>(item: &'a serde_json::Value, default_role: &'a str) -> (Option<&'a str>, &'a str) {
    match item {
        // Level 1：纯字符串 URL
        serde_json::Value::String(s) => (Some(s.as_str()), default_role),
        // Level 2：结构化对象 {url, role?}
        serde_json::Value::Object(obj) => {
            let url = obj.get("url").and_then(|v| v.as_str());
            let role = obj.get("role").and_then(|v| v.as_str()).unwrap_or(default_role);
            (url, role)
        }
        _ => (None, default_role),
    }
}

/// 根据 images 数组长度推断默认 role 列表：
///   1 张 → ["first_frame"]
///   2 张 → ["first_frame", "last_frame"]（首尾帧）
///   3+ 张 → 全部 "reference_image"（多模态参考）
fn infer_image_default_roles(count: usize) -> Vec<&'static str> {
    match count {
        1 => vec!["first_frame"],
        2 => vec!["first_frame", "last_frame"],
        _ => vec!["reference_image"; count],
    }
}

// ── 通用密钥脱敏 ──────────────────────────────────────────────

/// 对字符串中的 API 密钥进行脱敏处理
pub fn mask_key_in_string(text: &str, api_key: &str) -> String {
    if api_key.is_empty() || !text.contains(api_key) {
        return text.to_string();
    }
    let masked = if api_key.len() > 8 {
        format!("{}******{}", &api_key[..4], &api_key[api_key.len()-4..])
    } else {
        "******".to_string()
    };
    text.replace(api_key, &masked)
}
