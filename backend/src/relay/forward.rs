//! 统一转发规则解析器
//! 所有 relay 端点（聊天/图片/视频）共用此模块，根据模型绑定的转发规则
//! 自动决定：上游 URL 路径 / 请求体格式 / 鉴权方式。

use crate::AppState;
use super::url_utils::join_url;

// ── 解析后的转发配置 ──────────────────────────────────────────

/// 转发规则解析结果
#[derive(Debug, Clone)]
pub struct ResolvedForward {
    /// 目标协议类型: "openai", "volcengine", "volcengine_chat", "gemini", "gemini_image", "anthropic", "kling"
    pub target_type: String,
    /// 上游路径 e.g. "/api/v3/chat/completions"
    pub upstream_path: String,
    /// 鉴权方式: "bearer", "query_key", "x-api-key"
    pub auth_type: String,
    /// 是否启用素材 URL→素材ID 自动转换（火山方舟视频素材专用）
    pub asset_convert: bool,
    /// 异步任务轮询路径 (可选)，如果规则里配置了则优先使用
    pub poll_path: Option<String>,
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
    request_path: &str,
) -> Option<ResolvedForward> {
    // 根据模型类别定义标准的 OpenAI 基准路径
    let openai_path = match category {
        "图片" => "/v1/images/generations",
        "视频" => "/v1/video/generations",
        _ => "/v1/chat/completions",
    };

    // 1. 查模型获取 forward_rule_ids（支持同名模型按类型区分）
    let model = match super::proxy::find_active_model(state, model_id, Some(category)).await {
        Some(m) => m,
        None => {
            tracing::debug!("[Forward] 模型 '{}' 在 models 表中未找到(或 is_active!=1), category={}", model_id, category);
            return None;
        }
    };


    let rule_ids_str = model.forward_rule_ids.as_deref().unwrap_or("[]");
    let rule_ids: Vec<i64> = serde_json::from_str(rule_ids_str).unwrap_or_default();

    // 2. 查所有关联的转发规则
    let mut rules: Vec<crate::models::ForwardRule> = Vec::new();
    if !rule_ids.is_empty() {
        tracing::info!("[Forward] 模型 '{}' 绑定规则 IDs: {:?}, 类别: {}, 入口: {}", model_id, rule_ids, category, request_path);
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
        rules = q.fetch_all(&state.db.pool).await.unwrap_or_default();
        if rules.is_empty() {
            tracing::warn!("[Forward] 规则 IDs {:?} 在 forward_rules 表中未找到(或 is_active!=1)", rule_ids);
        }
    } else {
        tracing::debug!("[Forward] 模型 '{}' 未明确绑定规则，将尝试按渠道协议回退", model_id);
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

    // 4. 严格匹配：兼容 OpenAI 默认路径与厂商官方原生路径
    let mut best: Option<&crate::models::ForwardRule> = None;
    for rule in &candidates {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&rule.config_json) {
            let pr = config.get("path_rewrite");
            let old_path = pr.and_then(|v| v.get("old")).and_then(|v| v.as_str()).unwrap_or("");
            let new_path = pr.and_then(|v| v.get("new")).and_then(|v| v.as_str()).unwrap_or("");
            
            let old_clean = old_path.trim_start_matches('/');
            let new_clean = new_path.trim_start_matches('/');
            let req_clean = request_path.trim_start_matches('/');
            let openai_clean = openai_path.trim_start_matches('/');

            // 1. 如果用户是通过标准 OpenAI 接口发起请求，验证规则是否兼容该接口
            let is_openai_req = req_clean == openai_clean || req_clean.ends_with(openai_clean);
            let rule_supports_openai = old_clean.is_empty() || old_clean == openai_clean || openai_clean.ends_with(old_clean);

            // 2. 如果用户是通过厂商官方接口 (原生路径) 发起请求，依次验证 path_rewrite.new 和 path_rewrite.old
            let match_new = !new_clean.is_empty() && (req_clean == new_clean || req_clean.ends_with(new_clean));
            let match_old = !old_clean.is_empty() && (req_clean == old_clean || req_clean.ends_with(old_clean));

            if (is_openai_req && rule_supports_openai) || match_new || match_old {
                best = Some(rule);
                break;
            }
        }
    }
    // 如果未找到与请求路径严格匹配的规则，则拒绝匹配（不再兜底回落到第一条规则）
    let rule = best?;

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
        
        // 始终以基准 openai_path 作为模板进行替换，保证不管真实入口是什么，
        // 向上游转发的 URL 都是遵循规则替换后的绝对地址
        if !old.is_empty() && openai_path.contains(old) {
            openai_path.replace(old, new)
        } else if !new.is_empty() {
            new.to_string()
        } else {
            openai_path.to_string()
        }
    } else {
        openai_path.to_string()
    };

    let auth_type = config
        .get("auth_type")
        .and_then(|v| v.as_str())
        .unwrap_or("bearer")
        .to_string();

    let asset_convert = config
        .get("asset_convert")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let poll_path = config
        .get("poll_path")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    tracing::info!("[Forward] 命中规则 '{}': target_type={}, upstream_path={}, auth_type={}, asset_convert={}, poll_path={:?}", 
        rule.name, target_type, upstream_path, auth_type, asset_convert, poll_path);

    Some(ResolvedForward {
        target_type,
        upstream_path,
        auth_type,
        asset_convert,
        poll_path,
    })
}

/// 快速检查模型是否绑定了转发规则（不做路径匹配）。
/// 配合 resolve_forward_rule 使用：当 resolve 返回 None 时，
/// 若此函数返回 true 说明模型绑定了规则但入口路径不匹配，应拒绝请求。
pub async fn model_has_forward_rules(state: &AppState, model_id: &str) -> bool {
    let ids: Option<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT forward_rule_ids FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    match ids {
        Some(s) => {
            let arr: Vec<i64> = serde_json::from_str(&s).unwrap_or_default();
            !arr.is_empty()
        }
        None => false,
    }
}

// ── URL 构建 ──────────────────────────────────────────────────

/// 构建上游完整 URL，支持 ${model} 变量替换。
/// 可灵模型会根据已转换的请求体动态调整路径。
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

/// 可灵动态路径解析：根据已转换的上游请求体内容动态调整端点路径。
/// Omni 端点不受影响（由转发规则直接指定），仅对标准视频/图片端点进行自动分发。
pub fn resolve_kling_dynamic_path(resolved: &mut ResolvedForward, upstream_body: &serde_json::Value) {
    if resolved.target_type != "kling" { return; }
    let path = &resolved.upstream_path;

    // Omni 端点由转发规则直接指定，不做动态调整
    if path.contains("omni-video") || path.contains("omni-image") {
        return;
    }

    // 视频动态路由：根据请求体内容判断实际端点
    if path.contains("text2video") || path.contains("image2video") || path.contains("multi-image2video") {
        if upstream_body.get("image_list").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty()) {
            resolved.upstream_path = "/v1/videos/multi-image2video".to_string();
        } else if upstream_body.get("image").is_some() || upstream_body.get("image_tail").is_some() {
            resolved.upstream_path = "/v1/videos/image2video".to_string();
        } else {
            resolved.upstream_path = "/v1/videos/text2video".to_string();
        }
        return;
    }

    // 图片动态路由
    if path.contains("images") {
        if upstream_body.get("subject_image_list").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty()) {
            resolved.upstream_path = "/v1/images/multi-image2image".to_string();
        }
        // 其他情况保持转发规则原始路径（如 /v1/images/generations）
    }
}

// ── 请求体转换 ─────────────────────────────────────────────────

/// 将 OpenAI 格式请求体转换为目标上游格式。
///
/// 数据驱动映射：
/// - dashscope（视频）: prompt → input.prompt + parameters 格式
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
        // 可灵 AI 视频/图片：将 OpenAI 兼容格式转换为可灵官方 API 格式
        // 参考文档：https://klingai.com/document-api/apiReference
        "kling" => {
            build_kling_body(model, body, category)
        }

        // 阿里百炼 DashScope 视频：OpenAI → input/parameters 格式
        // 参考文档：https://help.aliyun.com/zh/model-studio/text-to-video-api-reference
        "dashscope" if category == "视频" => {
            build_dashscope_video_body(model, body)
        }

        // 火山方舟图片（/api/v3/images/generations）: 保持 OpenAI 兼容格式
        // 参考 Seedream 5.0 API: https://www.volcengine.com/docs/82379/1541523
        "volcengine_image" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);

            // n > 1 → 启用组图: sequential_image_generation = "auto"
            let n = body.get("n").and_then(|v| v.as_i64()).unwrap_or(1);
            if n > 1 {
                fwd["sequential_image_generation"] = serde_json::json!("auto");
                fwd["sequential_image_generation_options"] = serde_json::json!({
                    "max_images": n
                });
            }
            // n 已转换为官方参数，删除避免冗余传到上游
            if let Some(obj) = fwd.as_object_mut() { obj.remove("n"); }
            // watermark 直接透传（火山方舟原生支持，默认 true）
            fwd
        }

        // 阿里百炼图像生成: prompt → input.prompt
        "dashscope_image" if category == "图片" => {
            build_dashscope_image_body(model, body)
        }

        // 火山方舟图片/视频（/api/v3/contents/generations/tasks）: prompt → content 格式
        // 参考火山引擎 Seedance 2.0 官方 API：https://www.volcengine.com/docs/82379/1520757
        "volcengine" if category == "图片" || category == "视频" => {
            let mut fwd = build_volcengine_content_body(model, body);
            if category == "视频" && fwd.get("resolution").is_none() {
                fwd["resolution"] = serde_json::json!("720p");
            }
            fwd
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
                        if let Some(options) = obj.get_mut("stream_options").and_then(|v| v.as_object_mut()) {
                            options.insert("include_usage".to_string(), serde_json::json!(true));
                        } else {
                            obj.insert(
                                "stream_options".to_string(), 
                                serde_json::json!({ "include_usage": true })
                            );
                        }
                    }
                }
            }
            
            fwd
        }

        // Gemini 图片：prompt → contents 格式，支持图生图/多图生图
        // 参考 Google Gemini API: generationConfig.candidateCount / imageConfig
        // 图片 inline_data 格式: https://ai.google.dev/api/caching?hl=zh-cn#Blob
        "gemini_image" => {
            let prompt = body["prompt"]
                .as_str()
                .unwrap_or("Generate an image");

            let mut gen_config = serde_json::json!({
                "responseModalities": ["IMAGE"]
            });

            // n → candidateCount（生成数量）
            if let Some(n) = body.get("n").and_then(|v| v.as_i64()) {
                if n > 1 {
                    gen_config["candidateCount"] = serde_json::json!(n);
                }
            }

            // imageConfig 构建：imageSize 优先级 size → resolution → 兜底 "1k"
            let mut img_cfg = serde_json::Map::new();
            let image_size = body.get("size").and_then(|v| v.as_str())
                .or_else(|| body.get("resolution").and_then(|v| v.as_str()))
                .unwrap_or("1k");
            img_cfg.insert("imageSize".to_string(), serde_json::json!(image_size));
            if let Some(r) = body.get("ratio").and_then(|v| v.as_str()) {
                img_cfg.insert("aspectRatio".to_string(), serde_json::json!(r));
            }
            gen_config["imageConfig"] = serde_json::Value::Object(img_cfg);

            // ── 图生图/多图生图：提取图片转为 Gemini inline_data 格式 ──
            // 支持来源：image（字符串或数组）、image_urls（数组）
            // 数据格式：data:image/png;base64,... → {mime_type, data}
            let mut image_parts: Vec<serde_json::Value> = Vec::new();

            // 来源 1: image 字段（字符串或数组）
            if let Some(img_val) = body.get("image") {
                if let Some(url) = img_val.as_str() {
                    if let Some(v) = parse_data_uri_to_inline_data(url) {
                        image_parts.push(serde_json::json!({"inline_data": v}));
                    }
                } else if let Some(arr) = img_val.as_array() {
                    for item in arr {
                        if let Some(url) = item.as_str() {
                            if let Some(v) = parse_data_uri_to_inline_data(url) {
                                image_parts.push(serde_json::json!({"inline_data": v}));
                            }
                        }
                    }
                }
            }
            // 来源 2: image_urls（仅当 image 字段不存在时）
            if body.get("image").is_none() {
                if let Some(arr) = body.get("image_urls").and_then(|v| v.as_array()) {
                    for item in arr {
                        if let Some(url) = item.as_str() {
                            if let Some(v) = parse_data_uri_to_inline_data(url) {
                                image_parts.push(serde_json::json!({"inline_data": v}));
                            }
                        }
                    }
                }
            }

            // 构建 contents：文本 prompt + 图片 inline_data（如有）
            let mut parts: Vec<serde_json::Value> = Vec::new();
            parts.push(serde_json::json!({"text": prompt}));
            parts.append(&mut image_parts);

            serde_json::json!({
                "contents": [{"parts": parts}],
                "generationConfig": gen_config
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
            // 透传 generationConfig 和 stream_options（允许对象或null值）
            if let Some(gc) = body.get("generationConfig") {
                result["generationConfig"] = gc.clone();
            } else {
                let mut gen_config = serde_json::Map::new();
                if let Some(t) = body.get("temperature") { gen_config.insert("temperature".to_string(), t.clone()); }
                if let Some(t) = body.get("top_p") { gen_config.insert("topP".to_string(), t.clone()); }
                if let Some(t) = body.get("max_tokens") { gen_config.insert("maxOutputTokens".to_string(), t.clone()); }
                if !gen_config.is_empty() {
                    result["generationConfig"] = serde_json::Value::Object(gen_config);
                }
            }

            if let Some(opts) = body.get("stream_options") {
                result["stream_options"] = opts.clone();
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

    // 视频模型默认参数兜底（确保上游数据与计费一致）
    // 可灵已在 build_kling_body 中处理自身默认值，此处跳过
    if category == "视频" && resolved.target_type != "kling" {
        if resolved.target_type == "dashscope" {
            // DashScope 的 resolution/duration 在 parameters 内部
            if result.get("parameters").is_none() {
                result["parameters"] = serde_json::json!({});
            }
            if let Some(params) = result.get_mut("parameters").and_then(|p| p.as_object_mut()) {
                if !params.contains_key("resolution") {
                    params.insert("resolution".to_string(), serde_json::json!("720P"));
                }
                if !params.contains_key("duration") {
                    params.insert("duration".to_string(), serde_json::json!(5));
                }
            }
        } else {
            if result.get("resolution").is_none() {
                result["resolution"] = serde_json::json!("720p");
            }
            if result.get("duration").is_none() {
                result["duration"] = serde_json::json!(5);
            }
        }
    }

    // 图片模型 resolution 兜底（确保分辨率计费正常）
    // 排除已有自身分辨率管理的厂商：火山方舟、阿里、谷歌
    if category == "图片" && !matches!(resolved.target_type.as_str(),
        "volcengine" | "volcengine_image" | "dashscope_image" | "gemini_image"
    ) {
        let res_missing = match result.get("resolution").and_then(|v| v.as_str()) {
            None => true,
            Some(s) => s.is_empty(),
        };
        if res_missing {
            result["resolution"] = serde_json::json!("1k");
        }
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
        "gemini" | "gemini_image" => {
            result["tools"] = serde_json::json!([{"google_search": {}}]);
            if let Some(obj) = result.as_object_mut() { obj.remove("web_search"); }
        }
        _ => {}
    }
}

// ── 鉴权 Header 构建 ──────────────────────────────────────────

/// 根据 auth_type 构建请求 Headers
pub fn build_auth_headers(resolved: &ResolvedForward, api_key: &str) -> Vec<(String, String)> {
    let mut headers = match resolved.auth_type.as_str() {
        "x-api-key" => vec![
            ("x-api-key".to_string(), api_key.to_string()),
            ("anthropic-version".to_string(), "2023-06-01".to_string()),
        ],
        "query_key" => vec![], // key 已在 URL 中
        _ => {
            // 可灵 JWT 自动生成：api_key 格式为 "access_key:secret_key"
            if resolved.target_type == "kling" {
                if let Some(token) = generate_kling_jwt(api_key) {
                    vec![("Authorization".to_string(), format!("Bearer {}", token))]
                } else {
                    tracing::warn!("[Kling Auth] JWT 生成失败，将直接使用 api_key 作为 Bearer Token");
                    vec![("Authorization".to_string(), format!("Bearer {}", api_key))]
                }
            } else {
                vec![("Authorization".to_string(), format!("Bearer {}", api_key))]
            }
        }
    };
    // DashScope 异步视频任务需要 X-DashScope-Async: enable
    if resolved.target_type == "dashscope" || resolved.target_type == "dashscope_image" {
        // 注：DashScope 图片目前主要是同步，但加上这个头通常不影响
        // 如果明确是同步接口且阿里要求不能带此头，则在此根据路径或 target_type 进一步区分
        if resolved.target_type == "dashscope" {
            headers.push(("X-DashScope-Async".to_string(), "enable".to_string()));
        }
    }
    headers
}

// ── 默认转发配置（无规则时的 OpenAI 透传）─────────────────────

/// 获取默认的 OpenAI 格式转发配置
pub fn default_openai_forward(entry_path: &str) -> ResolvedForward {
    ResolvedForward {
        target_type: "openai".to_string(),
        upstream_path: entry_path.to_string(),
        auth_type: "bearer".to_string(),
        asset_convert: false,
        poll_path: None,
    }
}

// ── 域名智能推断（无转发规则时的自动识别）─────────────────────

/// 根据 channel base_url 域名自动推断正确的转发配置。
/// 当模型未绑定转发规则时使用，避免把火山/Google/Anthropic 请求
/// 错误地按 OpenAI 路径透传。
pub fn infer_forward_from_base_url(base_url: &str, category: &str) -> ResolvedForward {
    let url_lower = base_url.to_lowercase();

    // 阿里百炼 DashScope
    if url_lower.contains("dashscope") {
        return match category {
            "视频" => ResolvedForward {
                target_type: "dashscope".to_string(),
                upstream_path: "/api/v1/services/aigc/video-generation/video-synthesis".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: Some("/api/v1/tasks/${task_id}".to_string()),
            },
            "图片" => ResolvedForward {
                target_type: "dashscope_image".to_string(),
                upstream_path: "/api/v1/services/aigc/multimodal-generation/generation".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            _ => default_openai_forward(match category {
                "聊天" => "/v1/chat/completions",
                "图片" => "/v1/images/generations",
                _ => "/v1/chat/completions",
            }),
        };
    }

    if url_lower.contains("volces.com") || url_lower.contains("volcengine") {
        match category {
            "图片" => ResolvedForward {
                target_type: "volcengine_image".to_string(),
                upstream_path: "/api/v3/images/generations".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            "视频" => ResolvedForward {
                target_type: "volcengine".to_string(),
                upstream_path: "/api/v3/contents/generations/tasks".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            _ => ResolvedForward {
                target_type: "volcengine_chat".to_string(),
                upstream_path: "/api/v3/chat/completions".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
        }
    } else if url_lower.contains("googleapis.com") || url_lower.contains("generativelanguage") {
        match category {
            "图片" => ResolvedForward {
                target_type: "gemini_image".to_string(),
                upstream_path: "/v1beta/models/${model}:generateContent".to_string(),
                auth_type: "query_key".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            _ => ResolvedForward {
                target_type: "gemini".to_string(),
                upstream_path: "/v1beta/models/${model}:generateContent".to_string(),
                auth_type: "query_key".to_string(),
                asset_convert: false,
                poll_path: None,
            },
        }
    } else if url_lower.contains("anthropic.com") {
        ResolvedForward {
            target_type: "anthropic".to_string(),
            upstream_path: "/v1/messages".to_string(),
            auth_type: "x-api-key".to_string(),
            asset_convert: false,
            poll_path: None,
        }
    } else if url_lower.contains("klingai.com") {
        match category {
            "视频" => ResolvedForward {
                target_type: "kling".to_string(),
                upstream_path: "/v1/videos/text2video".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            "图片" => ResolvedForward {
                target_type: "kling".to_string(),
                upstream_path: "/v1/images/generations".to_string(),
                auth_type: "bearer".to_string(),
                asset_convert: false,
                poll_path: None,
            },
            _ => default_openai_forward("/v1/chat/completions"),
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


// ── 阿里百炼 DashScope 图像请求体构建器 ─────────────────────────
//
// 将 OpenAI 风格的参数转换为 DashScope /api/v1/services/aigc/text2image/image-synthesis 格式。
// 参考文档：https://help.aliyun.com/zh/model-studio/user-guide/wanx-v2-text-to-image-api-reference

fn build_dashscope_image_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    // ── 直通模式 ──
    if body.get("input").is_some() {
        let mut fwd = body.clone();
        fwd["model"] = serde_json::json!(model);
        return fwd;
    }

    // ── 转换模式 ──
    let mut input = serde_json::Map::new();

    // 优先处理 messages (支持多模态及万相 2.7/千问 2.0 格式)
    if let Some(msgs) = body.get("messages").and_then(|m| m.as_array()) {
        let mut dashscope_msgs = Vec::new();
        for msg in msgs {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let mut dash_content = Vec::new();
            
            if let Some(content) = msg.get("content") {
                if let Some(text) = content.as_str() {
                    dash_content.push(serde_json::json!({ "text": text }));
                } else if let Some(arr) = content.as_array() {
                    for item in arr {
                        if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                            if t == "text" {
                                if let Some(txt) = item.get("text").and_then(|v| v.as_str()) {
                                    dash_content.push(serde_json::json!({ "text": txt }));
                                }
                            } else if t == "image_url" {
                                if let Some(url) = item.get("image_url").and_then(|v| v.get("url")).and_then(|v| v.as_str()) {
                                    dash_content.push(serde_json::json!({ "image": url }));
                                }
                            }
                        } else if let Some(_url) = item.get("image").and_then(|v| v.as_str()) {
                            // 兼容阿里原生传入的 {"image": "..."}
                            dash_content.push(item.clone());
                        } else if let Some(_txt) = item.get("text").and_then(|v| v.as_str()) {
                            dash_content.push(item.clone());
                        }
                    }
                }
            }
            dashscope_msgs.push(serde_json::json!({
                "role": role,
                "content": dash_content
            }));
        }
        input.insert("messages".to_string(), serde_json::json!(dashscope_msgs));
    } else {
        // 强制包装为 messages 结构，不使用快捷 prompt 字段
        let prompt = body.get("prompt").and_then(|v| v.as_str()).unwrap_or("Generate an image");
        let mut dash_content = Vec::new();
        
        // 支持顶层 image / image_urls 参数 (OpenAI 扩展支持，兼容字符串或数组)
        // 确保图片先于文本内容
        if let Some(img_val) = body.get("image") {
            if let Some(url) = img_val.as_str() {
                dash_content.push(serde_json::json!({ "image": url }));
            } else if let Some(arr) = img_val.as_array() {
                for item in arr {
                    if let Some(url) = item.as_str() {
                        dash_content.push(serde_json::json!({ "image": url }));
                    }
                }
            }
        }
        // image_urls 数组补充（仅当 image 未提供时生效，避免重复注入）
        if body.get("image").is_none() {
            if let Some(arr) = body.get("image_urls").and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(url) = item.as_str() {
                        dash_content.push(serde_json::json!({ "image": url }));
                    }
                }
            }
        }
        
        dash_content.push(serde_json::json!({ "text": prompt }));

        input.insert("messages".to_string(), serde_json::json!([
            {
                "role": "user",
                "content": dash_content
            }
        ]));
    }

    let mut params = serde_json::Map::new();
    
    // negative_prompt 移入 parameters
    if let Some(np) = body.get("negative_prompt").and_then(|v| v.as_str()) {
        params.insert("negative_prompt".to_string(), serde_json::json!(np));
    }
    
    // n -> n
    if let Some(n) = body.get("n").and_then(|v| v.as_i64()) {
        params.insert("n".to_string(), serde_json::json!(n));
    }

    // size -> size (1024x1024 -> 1024*1024)
    if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
        params.insert("size".to_string(), serde_json::json!(size.replace("x", "*")));
    }

    // style/quality/prompt_extend
    let passthrough = ["style", "quality", "prompt_extend", "seed"];
    for &key in &passthrough {
        if let Some(val) = body.get(key) {
            params.insert(key.to_string(), val.clone());
        }
    }

    serde_json::json!({
        "model": model,
        "input": input,
        "parameters": params
    })
}

// ── 阿里百炼 DashScope 视频请求体构建器 ─────────────────────────
//
// 将 OpenAI 风格的扁平参数转换为 DashScope /api/v1/services/aigc/video-generation/video-synthesis 格式。
// 参考文档：https://help.aliyun.com/zh/model-studio/text-to-video-api-reference
//
// DashScope 请求格式：
//   { "model": "...", "input": { "prompt": "...", "media": [...] }, "parameters": { "resolution": "720P", ... } }
// 其中 media 数组元素 type 区分：first_frame（图生视频首帧）、reference_image（参考图）、video（视频编辑）

/// DashScope parameters 内的合法参数白名单
const DASHSCOPE_PARAM_KEYS: &[&str] = &[
    "resolution", "ratio", "duration", "prompt_extend", "watermark", "seed",
];

/// 构建阿里百炼 DashScope 视频生成请求体
fn build_dashscope_video_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    // ── 直通模式：body 中已有 input 对象 → 原样使用，仅替换 model ──
    if body.get("input").is_some() {
        let mut fwd = body.clone();
        fwd["model"] = serde_json::json!(model);
        return fwd;
    }

    // ── 转换模式：从 OpenAI 风格提取参数 ──
    // prompt: 优先取 body.prompt，其次从 messages[-1].content 提取
    let prompt = body.get("prompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            body.get("messages")
                .and_then(|m| m.as_array())
                .and_then(|arr| arr.last())
                .and_then(|msg| msg.get("content"))
                .and_then(|c| c.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Generate a video".to_string());

    let mut input = serde_json::json!({ "prompt": prompt });

    // negative_prompt 透传
    if let Some(np) = body.get("negative_prompt").and_then(|v| v.as_str()) {
        input["negative_prompt"] = serde_json::json!(np);
    }

    // audio_url 透传
    if let Some(au) = body.get("audio_url").and_then(|v| v.as_str()) {
        input["audio_url"] = serde_json::json!(au);
    }

    // ── media 数组构建 ──
    // 支持两种传入方式：
    //   1) body.media 已是 DashScope 格式数组 → 直接透传
    //   2) body.images / image_urls / body.videos → 自动构建 media
    if let Some(media) = body.get("media").filter(|v| v.is_array()) {
        input["media"] = media.clone();
    } else {
        let mut media = Vec::new();

        // images 数组（优先）：按数量智能推断 type
        //   1 张 → first_frame，2 张 → first_frame + last_frame，3+ 张 → reference_image
        if let Some(arr) = body.get("images").and_then(|v| v.as_array()) {
            let defaults = infer_image_default_roles(arr.len());
            for (i, item) in arr.iter().enumerate() {
                let default_type = defaults.get(i).copied().unwrap_or("reference_image");
                match item {
                    serde_json::Value::String(url) => {
                        media.push(serde_json::json!({ "type": default_type, "url": url }));
                    }
                    serde_json::Value::Object(obj) => {
                        let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        let t = obj.get("type").and_then(|v| v.as_str())
                            .or_else(|| obj.get("role").and_then(|v| v.as_str()))
                            .unwrap_or(default_type);
                        if !url.is_empty() {
                            media.push(serde_json::json!({ "type": t, "url": url }));
                        }
                    }
                    _ => {}
                }
            }
        }

        // image_urls 数组（回退）：仅当 images 未提供时生效
        if media.is_empty() {
            if let Some(arr) = body.get("image_urls").and_then(|v| v.as_array()) {
                let defaults = infer_image_default_roles(arr.len());
                for (i, item) in arr.iter().enumerate() {
                    if let Some(url) = item.as_str() {
                        let role = defaults.get(i).copied().unwrap_or("reference_image");
                        media.push(serde_json::json!({ "type": role, "url": url }));
                    }
                }
            }
        }

        // videos 数组 → type: "video"
        if let Some(arr) = body.get("videos").and_then(|v| v.as_array()) {
            for item in arr {
                match item {
                    serde_json::Value::String(url) => {
                        media.push(serde_json::json!({ "type": "video", "url": url }));
                    }
                    serde_json::Value::Object(obj) => {
                        let url = obj.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        let t = obj.get("type").and_then(|v| v.as_str()).unwrap_or("video");
                        if !url.is_empty() {
                            media.push(serde_json::json!({ "type": t, "url": url }));
                        }
                    }
                    _ => {}
                }
            }
        }

        if !media.is_empty() {
            input["media"] = serde_json::json!(media);
        }
    }

    // ── parameters 构建 ──
    let mut params = serde_json::Map::new();
    for key in DASHSCOPE_PARAM_KEYS {
        if let Some(v) = body.get(*key) {
            params.insert(key.to_string(), v.clone());
        }
    }
    // size → resolution 映射（兼容 OpenAI 的 size 字段）
    // DashScope API 接受大写的 720P 和 1080P，如果用户传小写，需转成大写
    if !params.contains_key("resolution") {
        if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
            params.insert("resolution".to_string(), serde_json::json!(size.to_uppercase()));
        }
    } else if let Some(res) = params.get("resolution").and_then(|v| v.as_str()) {
        params.insert("resolution".to_string(), serde_json::json!(res.to_uppercase()));
    }

    let mut result = serde_json::json!({
        "model": model,
        "input": input,
    });
    if !params.is_empty() {
        result["parameters"] = serde_json::Value::Object(params);
    }
    result
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
    // 视频控制
    "duration",          // 视频时长（秒），如 5, 10
    "camera_fixed",      // 是否固定摄像头
    "seed",              // 随机种子
    // 音频/水印/末帧
    "generate_audio",    // 是否生成音频 (bool)
    "return_last_frame", // 是否返回末帧 (bool)
    "watermark",         // 是否添加水印 (bool)
    // 流式/回调
    "stream",            // 是否流式返回
    "callback_url",      // 回调地址
    "service_tier",      // 服务等级（如 flex 离线减半）
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
        // 合并 images 和 image_urls 两个来源（image_urls 仅在 images 未提供时使用）
        let image_arr = body.get("images").and_then(|v| v.as_array())
            .or_else(|| body.get("image_urls").and_then(|v| v.as_array()));
        if let Some(arr) = image_arr {
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

    // ── 后处理：多模态视频请求中，为缺失 role 的 image_url 自动补充 role ──
    // 火山方舟 API 要求：当 content 中同时包含 video_url 或 audio_url 时，
    // 所有 image_url 元素必须携带 role 字段（如 reference_image），否则提交任务会被拒绝。
    let content = ensure_image_roles_for_multimodal(content);

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

// ── Gemini 图片格式转换工具 ─────────────────────────────────────

/// 解析 data URI 为 Gemini inline_data 格式 {mime_type, data}。
/// 支持 `data:image/png;base64,xxxx` 和纯 base64 字符串（默认 image/png）。
fn parse_data_uri_to_inline_data(input: &str) -> Option<serde_json::Value> {
    if input.starts_with("data:") {
        // data:image/png;base64,xxxx
        let rest = input.strip_prefix("data:")?;
        let (meta, data) = rest.split_once(',')?;
        let mime = meta.split(';').next().unwrap_or("image/png");
        Some(serde_json::json!({
            "mime_type": mime,
            "data": data
        }))
    } else if input.len() > 100 && !input.starts_with("http") {
        // 无前缀纯 base64 → 默认 image/png
        Some(serde_json::json!({
            "mime_type": "image/png",
            "data": input
        }))
    } else {
        None // HTTP URL 需要异步下载，同步函数不处理
    }
}

/// 异步下载 HTTP 图片并转为 Gemini inline_data 格式。
async fn download_image_to_inline_data(
    client: &reqwest::Client,
    url: &str,
) -> Option<serde_json::Value> {
    let resp = client.get(url)
        .timeout(std::time::Duration::from_secs(15))
        .send().await.ok()?;
    if !resp.status().is_success() { return None; }
    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let mime = content_type.split(';').next().unwrap_or("image/png").trim();
    let bytes = resp.bytes().await.ok()?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(serde_json::json!({
        "mime_type": mime,
        "data": b64
    }))
}

/// 在转发前异步处理 Gemini 图片请求中的 HTTP URL。
/// transform_request_body 是同步函数无法下载远程图片，此函数作为异步后处理步骤：
/// 遍历已构建的 upstream_body.contents[].parts，找到 HTTP URL 的文本 part，
/// 下载后替换为 inline_data 格式。同时使用内存级 URL 去重缓存避免重复下载。
pub async fn resolve_gemini_http_images(
    client: &reqwest::Client,
    original_body: &serde_json::Value,
    upstream_body: &mut serde_json::Value,
) {
    // 收集所有需要下载的 HTTP URL（来自 image / image_urls）
    let mut http_urls: Vec<String> = Vec::new();
    if let Some(img_val) = original_body.get("image") {
        if let Some(url) = img_val.as_str() {
            if url.starts_with("http") { http_urls.push(url.to_string()); }
        } else if let Some(arr) = img_val.as_array() {
            for item in arr {
                if let Some(url) = item.as_str() {
                    if url.starts_with("http") { http_urls.push(url.to_string()); }
                }
            }
        }
    }
    if original_body.get("image").is_none() {
        if let Some(arr) = original_body.get("image_urls").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(url) = item.as_str() {
                    if url.starts_with("http") { http_urls.push(url.to_string()); }
                }
            }
        }
    }

    if http_urls.is_empty() { return; }

    // URL 去重（内存级缓存，避免相同 URL 重复下载）
    let mut cache: std::collections::HashMap<String, serde_json::Value> = std::collections::HashMap::new();
    let mut unique_urls: Vec<String> = Vec::new();
    for url in &http_urls {
        if !cache.contains_key(url) && !unique_urls.contains(url) {
            unique_urls.push(url.clone());
        }
    }
    for url in &unique_urls {
        if let Some(data) = download_image_to_inline_data(client, url).await {
            cache.insert(url.clone(), data);
        }
    }

    if cache.is_empty() { return; }

    // 将下载结果注入到 upstream_body 的 contents[0].parts 中
    if let Some(contents) = upstream_body.get_mut("contents").and_then(|c| c.as_array_mut()) {
        if let Some(first_content) = contents.first_mut() {
            if let Some(parts) = first_content.get_mut("parts").and_then(|p| p.as_array_mut()) {
                // 追加所有下载成功的 inline_data（按原始 URL 顺序）
                for url in &http_urls {
                    if let Some(data) = cache.get(url) {
                        parts.push(serde_json::json!({"inline_data": data}));
                    }
                }
            }
        }
    }
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

/// 火山方舟多模态视频生成 role 修正。
/// 当 content 数组中同时包含 video_url 或 audio_url（参考媒体）时，
/// 火山 API 明确禁止 first_frame / last_frame 与参考媒体混用，
/// 所有 image_url 的 role 必须统一为 reference_image。
/// 此函数会：
///   1. 为缺失 role 的 image_url 补充 role = "reference_image"
///   2. 将错误的 first_frame / last_frame 纠正为 reference_image
fn ensure_image_roles_for_multimodal(content: serde_json::Value) -> serde_json::Value {
    let arr = match content.as_array() {
        Some(a) => a,
        None => return content,
    };

    // 检测是否包含 video/audio 参考媒体
    let has_video_or_audio = arr.iter().any(|item| {
        let t = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        t == "video_url" || t == "audio_url"
    });
    if !has_video_or_audio {
        return content;
    }

    // 收集需要修正 role 的 image_url 索引：
    // - 缺失 role
    // - role 为 first_frame / last_frame（与参考媒体冲突）
    let fix_indices: Vec<usize> = arr.iter().enumerate()
        .filter(|(_, item)| {
            if item.get("type").and_then(|v| v.as_str()) != Some("image_url") {
                return false;
            }
            match item.get("role").and_then(|v| v.as_str()) {
                None | Some("") => true,
                _ => false, // 已有明确 role，不修改
            }
        })
        .map(|(i, _)| i)
        .collect();

    if fix_indices.is_empty() {
        return content;
    }

    let mut patched = arr.clone();
    for &idx in &fix_indices {
        patched[idx]["role"] = serde_json::json!("reference_image");
    }

    serde_json::json!(patched)
}

// ── 通用密钥脱敏 ──────────────────────────────────────────────

/// 对字符串中的 API 密钥进行脱敏处理
pub fn mask_key_in_string(text: &str, api_key: &str) -> String {
    if api_key.is_empty() || !text.contains(api_key) {
        return text.to_string();
    }
    let masked = {
        let cc = api_key.chars().count();
        if cc > 8 {
            let p: String = api_key.chars().take(4).collect();
            let s: String = api_key.chars().skip(cc - 4).collect();
            format!("{}******{}", p, s)
        } else {
            "******".to_string()
        }
    };
    text.replace(api_key, &masked)
}

// ── 可灵 AI 请求体构建器 ──────────────────────────────────────
//
// 将 OpenAI 兼容格式转换为可灵官方 API 格式。
// - model → model_name（可灵官方字段名）
// - 白名单驱动参数透传，扩展时追加一行即可
// - 直通模式：body 已含 model_name → 原样透传，仅补充默认值
// 参考文档：https://klingai.com/document-api/apiReference

/// 可灵视频接口透传参数白名单
const KLING_VIDEO_PASSTHROUGH_KEYS: &[&str] = &[
    "model_name", "prompt", "negative_prompt", "duration", "mode", "sound",
    "aspect_ratio", "image", "image_tail", "image_list", "video_list",
    "type", "multi_shot", "multi_prompt", "callback_url", "external_task_id",
    "cfg_scale", "camera_control",
];

/// 可灵图片接口透传参数白名单
const KLING_IMAGE_PASSTHROUGH_KEYS: &[&str] = &[
    "model_name", "prompt", "negative_prompt", "n", "aspect_ratio", "resolution",
    "image", "image_list", "element_list", "subject_image_list", "image_fidelity",
    "series_amount", "callback_url", "external_task_id", "image_reference",
];

fn build_kling_body(model: &str, body: &serde_json::Value, category: &str) -> serde_json::Value {
    let keys = if category == "图片" { &KLING_IMAGE_PASSTHROUGH_KEYS[..] } else { &KLING_VIDEO_PASSTHROUGH_KEYS[..] };

    let mut result = serde_json::Map::new();

    // model_name：优先使用请求体中已有的（官方原生调用），否则从 model 转换
    if let Some(mn) = body.get("model_name").and_then(|v| v.as_str()) {
        result.insert("model_name".to_string(), serde_json::json!(mn));
    } else {
        result.insert("model_name".to_string(), serde_json::json!(model));
    }

    // 白名单驱动透传（跳过 model_name，已处理）
    for &key in keys {
        if key == "model_name" { continue; }
        if let Some(val) = body.get(key) {
            result.insert(key.to_string(), val.clone());
        }
    }

    // 视频 mode 默认兜底 std
    if category != "图片" && !result.contains_key("mode") {
        result.insert("mode".to_string(), serde_json::json!("std"));
    }

    // 视频：OpenAI 兼容 images / image_urls 数组 → 可灵官方 image / image_tail / image_list
    // 仅在未使用官方参数时生效，避免覆盖原生调用
    // 精确模式：元素含 role 字段（如 reference_image）时，保留结构走 multi-image2video
    // 简单模式：纯 URL 按数量自动分发（1-2 张 → image2video，3+ 张 → multi-image2video）
    if category != "图片"
        && !result.contains_key("image")
        && !result.contains_key("image_tail")
        && !result.contains_key("image_list")
    {
        // 合并 images 和 image_urls 两个来源（image_urls 仅在 images 未提供时使用）
        let images = body.get("images").and_then(|v| v.as_array())
            .or_else(|| body.get("image_urls").and_then(|v| v.as_array()));
        if let Some(images) = images {
            let use_multi = images.iter().any(|item|
                item.get("role").and_then(|r| r.as_str()) == Some("reference_image")
            );

            if use_multi {
                // 精确模式：保留 role 结构，全部走 image_list → multi-image2video
                let list: Vec<serde_json::Value> = images.iter().filter_map(|item| {
                    let url = item.get("url").and_then(|u| u.as_str())?;
                    if url.is_empty() { return None; }
                    let mut obj = serde_json::json!({"url": url});
                    if let Some(role) = item.get("role").and_then(|r| r.as_str()) {
                        obj["role"] = serde_json::json!(role);
                    }
                    Some(obj)
                }).collect();
                if !list.is_empty() {
                    result.insert("image_list".to_string(), serde_json::Value::Array(list));
                }
            } else {
                // 简单模式：纯 URL 按数量分发
                let urls: Vec<String> = images.iter().filter_map(|item| {
                    item.as_str().map(|s| s.to_string())
                        .or_else(|| item.get("url").and_then(|u| u.as_str()).map(|s| s.to_string()))
                }).filter(|s| !s.is_empty()).collect();

                if urls.len() > 2 {
                    let list: Vec<serde_json::Value> = urls.iter().map(|u| serde_json::json!(u)).collect();
                    result.insert("image_list".to_string(), serde_json::Value::Array(list));
                } else if !urls.is_empty() {
                    result.insert("image".to_string(), serde_json::json!(urls[0]));
                    if urls.len() == 2 {
                        result.insert("image_tail".to_string(), serde_json::json!(urls[1]));
                    }
                }
            }
        }
    }

    // 图片 resolution：优先可灵官方 resolution → OpenAI size → 兜底 1k
    if category == "图片" && !result.contains_key("resolution") {
        let fallback = body.get("size").and_then(|v| v.as_str()).unwrap_or("1k");
        result.insert("resolution".to_string(), serde_json::json!(fallback));
    }

    // 图片 aspect_ratio：优先可灵官方 aspect_ratio → OpenAI ratio
    if category == "图片" && !result.contains_key("aspect_ratio") {
        if let Some(ratio) = body.get("ratio").and_then(|v| v.as_str()) {
            result.insert("aspect_ratio".to_string(), serde_json::json!(ratio));
        }
    }

    // OpenAI 兼容：image / image_urls 字段归一化
    // 可灵图片图生图要求 image 为 URL 字符串，但 OpenAI 兼容格式可能传入数组
    // 如 [{"url": "https://..."}, ...] → 取首元素的 url 作为可灵 image 参数
    if category == "图片" {
        // image_urls → image 归一化（仅当 image 未提供时）
        if !result.contains_key("image") {
            if let Some(first_url) = body.get("image_urls").and_then(|v| v.as_array()).and_then(|a| a.first()).and_then(|u| u.as_str()) {
                result.insert("image".to_string(), serde_json::json!(first_url));
            }
        }
        if let Some(img_val) = result.get("image").cloned() {
            if let Some(arr) = img_val.as_array() {
                if let Some(first) = arr.first() {
                    let url_str = first.get("url").and_then(|u| u.as_str())
                        .or_else(|| first.as_str())
                        .unwrap_or("");
                    if !url_str.is_empty() {
                        result.insert("image".to_string(), serde_json::json!(url_str));
                    } else {
                        result.remove("image");
                    }
                } else {
                    result.remove("image"); // 空数组移除
                }
            }
            // 已是字符串则无需处理，直接透传
        }
    }

    serde_json::Value::Object(result)
}

// ── 可灵 JWT 自动生成 ──────────────────────────────────────────
//
// 渠道 api_key 格式："{access_key}:{secret_key}"
// 使用 HS256 算法生成 30 分钟有效期的 JWT Token。
// 如果 api_key 不含 ":" 分隔符，视为已生成的 Token 直接返回。

fn generate_kling_jwt(api_key: &str) -> Option<String> {
    // 不含 ":" 时视为已生成的 JWT 或普通 Bearer Token，直接使用
    let (ak, sk) = api_key.split_once(':')?;
    if ak.is_empty() || sk.is_empty() { return None; }

    let now = chrono::Utc::now().timestamp() as usize;
    let claims = serde_json::json!({
        "iss": ak,
        "exp": now + 1800,
        "nbf": now - 5
    });

    let header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
    let key = jsonwebtoken::EncodingKey::from_secret(sk.as_bytes());

    jsonwebtoken::encode(&header, &claims, &key).ok()
}
