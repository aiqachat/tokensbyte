//! 统一转发规则解析器
//! 所有 relay 端点（聊天/图片/视频）共用此模块，根据模型绑定的转发规则
//! 自动决定：上游 URL 路径 / 请求体格式 / 鉴权方式。

use super::url_utils::join_url;
use crate::AppState;
use std::collections::HashMap;

// ── 解析后的转发配置 ──────────────────────────────────────────

/// 转发规则解析结果
#[derive(Debug, Clone)]
pub struct ResolvedForward {
    /// 目标协议类型: "openai", "volcengine", "volcengine_chat", "gemini", "gemini_image", "anthropic", "kling", "jimeng_image", "jimeng_video"
    pub target_type: String,
    /// 上游路径 e.g. "/api/v3/chat/completions"
    pub upstream_path: String,
    /// 鉴权方式: "bearer", "query_key", "x-api-key"
    pub auth_type: String,
    /// 是否启用素材 URL→素材ID 自动转换（火山方舟视频素材专用）
    pub asset_convert: bool,
    /// 素材转换使用的插件命名空间（默认 asset_manager，国际版可设为 asset_manager_intl）
    pub asset_convert_ns: String,
    /// 异步任务轮询路径 (可选)，如果规则里配置了则优先使用
    pub poll_path: Option<String>,
    /// 是否启用免审核策略
    pub asset_moderation: bool,
    /// 转发规则 EID（供日志记录，避免二次查库）
    pub eid: String,
    /// 关联的数据库模型唯一标识 (系统内持久不可变的唯一 mid，如 vve-sd/vve-pf 等)
    pub mid: Option<String>,
    /// 是否为级联转发模型（二阶段级联执行）
    pub is_cascade: bool,
    /// 是否将 content 字段提取为 prompt（针对火山视频某些上游通道特判兼容）
    pub content_to_prompt: bool,
    /// 级联分辨率倍率表（config_json.res_mul）；阶段二：有 usage 则乘入 token，否则乘费用；空表=1.0
    pub res_mul: HashMap<String, f64>,
}

impl Default for ResolvedForward {
    fn default() -> Self {
        Self {
            target_type: "openai".to_string(),
            upstream_path: String::new(),
            auth_type: "bearer".to_string(),
            asset_convert: false,
            asset_convert_ns: "asset_manager".to_string(),
            poll_path: None,
            asset_moderation: false,
            eid: String::new(),
            mid: None,
            is_cascade: false,
            content_to_prompt: false,
            res_mul: HashMap::new(),
        }
    }
}

/// 按目标分辨率查级联倍率；无表/无 key/非法值 → 1.0
pub fn lookup_res_mul(map: &HashMap<String, f64>, resolution: &str) -> f64 {
    let key = normalize_res_mul_key(resolution);
    map.get(&key).copied().filter(|&v| v > 0.0).unwrap_or(1.0)
}

fn scale_json_num_field(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    mult: f64,
) {
    let Some(v) = obj.get_mut(key) else { return };
    let Some(n) = v.as_i64() else { return };
    if n != 0 {
        *v = serde_json::json!(((n as f64) * mult).round() as i64);
    }
}

fn scale_usage_token_object(obj: &mut serde_json::Map<String, serde_json::Value>, mult: f64) {
    for key in [
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "input_tokens",
        "output_tokens",
        "image_tokens",
    ] {
        scale_json_num_field(obj, key, mult);
    }
}

/// 级联阶段二：放大响应中的 usage token（返回 / 落库 / 结算共用）
pub fn scale_usage_in_json(root: &mut serde_json::Value, mult: f64) {
    if (mult - 1.0).abs() <= 1e-9 {
        return;
    }
    for ptr in ["/usage", "/final_result/usage", "/data/usage"] {
        if let Some(serde_json::Value::Object(obj)) = root.pointer_mut(ptr) {
            scale_usage_token_object(obj, mult);
        }
    }
}

fn normalize_res_mul_key(resolution: &str) -> String {
    let s = resolution.trim().to_lowercase();
    match s.as_str() {
        "720" | "720p" => "720p".to_string(),
        "1080" | "1080p" => "1080p".to_string(),
        "2k" | "2kp" => "2k".to_string(),
        "4k" | "4kp" => "4k".to_string(),
        _ => s,
    }
}

fn parse_res_mul(config: &serde_json::Value) -> HashMap<String, f64> {
    let Some(obj) = config.get("res_mul").and_then(|v| v.as_object()) else {
        return HashMap::new();
    };
    obj.iter()
        .filter_map(|(k, v)| {
            let rate = v.as_f64().filter(|&r| r > 0.0)?;
            Some((normalize_res_mul_key(k), rate))
        })
        .collect()
}

// ── 转发规则解析 ──────────────────────────────────────────────

/// 根据模型 ID、请求类别、入口路径，从 DB 查找匹配的转发规则。
///
/// 逻辑：
/// 1. 查 models 表取 forward_rule_ids（JSON 数组如 [1,5,8]）
/// 2. 查 forward_rules 表，筛选 category 匹配且 is_active=1
/// 3. 如果有多条同类别规则，从 config_json.path_rewrite.old 匹配入口路径
/// 4. 找不到 → 返回 None，调用方按 OpenAI 格式透传
/// db_model: 调用方已查询的模型记录（如来自 check_access），避免重复查 models 表。
///           传 None 时内部自行查询。
pub async fn resolve_forward_rule(
    state: &AppState,
    model_id: &str,
    category: &str,
    request_path: &str,
    channel: Option<&crate::models::Channel>,
    db_model: Option<&crate::models::Model>,
) -> Option<ResolvedForward> {
    // 根据模型类别定义标准的 OpenAI 基准路径
    let openai_path = super::proxy::category_endpoint(Some(category));

    // 1. 复用调用方已查询的 Model，或自行查库
    let owned_model;
    let model = if let Some(m) = db_model {
        m
    } else {
        owned_model =
            super::proxy::find_active_model_exact(state, model_id, Some(category), channel).await;
        match owned_model.as_ref() {
            Some(m) => m,
            None => {
                tracing::debug!(
                    "[Forward] 模型 '{}' 在 models 表中未找到(或 is_active!=1), category={}",
                    model_id,
                    category
                );
                return None;
            }
        }
    };

    tracing::info!(
        "[Forward] 已获取模型数据: model_id = '{}', 真实 mid = '{}', category = '{}'",
        model_id,
        model.mid,
        category
    );

    let rule_ids_str = model.forward_rule_ids.as_deref().unwrap_or("[]");
    let rule_ids: Vec<i64> = serde_json::from_str(rule_ids_str).unwrap_or_default();

    // 2. 查所有关联的转发规则
    let mut rules: Vec<crate::models::ForwardRule> = Vec::new();
    if !rule_ids.is_empty() {
        tracing::info!(
            "[Forward] 模型 '{}' 绑定规则 IDs: {:?}, 类别: {}, 入口: {}",
            model_id,
            rule_ids,
            category,
            request_path
        );
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
            tracing::warn!(
                "[Forward] 规则 IDs {:?} 在 forward_rules 表中未找到(或 is_active!=1)",
                rule_ids
            );
        }
    } else {
        tracing::debug!(
            "[Forward] 模型 '{}' 未明确绑定规则，将尝试按渠道协议回退",
            model_id
        );
    }

    // 3. 按 category 筛选
    let category_matched: Vec<&crate::models::ForwardRule> =
        rules.iter().filter(|r| r.category == category).collect();

    let candidates = if category_matched.is_empty() {
        rules.iter().collect::<Vec<_>>()
    } else {
        category_matched
    };

    // 4. 按精确度打分匹配：当模型绑定了多条规则时，优先选择与请求路径最精确匹配的规则
    //    评分策略：
    //    3 分 — 请求路径精确匹配 path_rewrite.new（原生厂商路径命中）
    //    2 分 — OpenAI 请求 + 规则为纯透传(old==new)，即不做路径转换的 OpenAI 通道
    //    1 分 — OpenAI 请求 + 规则为转换型(old≠new)，即可接受 OpenAI 入口但会转换路径的厂商规则
    let mut best: Option<&crate::models::ForwardRule> = None;
    let mut best_score: u8 = 0;
    for rule in &candidates {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&rule.config_json) {
            let pr = config.get("path_rewrite");
            let old_path = pr
                .and_then(|v| v.get("old"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let new_path = pr
                .and_then(|v| v.get("new"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let old_clean = old_path.trim_start_matches('/');
            let new_clean = new_path.trim_start_matches('/');
            let req_clean = request_path.trim_start_matches('/');
            let openai_clean = openai_path.trim_start_matches('/');

            let is_openai_req = req_clean == openai_clean || req_clean.ends_with(openai_clean);
            let rule_supports_openai = old_clean.is_empty()
                || old_clean == openai_clean
                || openai_clean.ends_with(old_clean);

            // 原生路径精确命中 path_rewrite.new（如请求 /api/v3/images/generations 精确匹配火山规则的 new）
            let match_new =
                !new_clean.is_empty() && (req_clean == new_clean || req_clean.ends_with(new_clean));
            // 原生路径匹配 path_rewrite.old
            let match_old =
                !old_clean.is_empty() && (req_clean == old_clean || req_clean.ends_with(old_clean));

            let score = if !is_openai_req && match_new {
                // 非 OpenAI 请求路径精确命中厂商原生 new 路径
                3
            } else if !is_openai_req && match_old {
                // 非 OpenAI 请求路径匹配 old 路径
                3
            } else if is_openai_req && rule_supports_openai && old_clean == new_clean {
                // OpenAI 请求 + 规则为纯透传型（old == new，不做路径转换）
                2
            } else if is_openai_req && rule_supports_openai {
                // OpenAI 请求 + 规则为转换型（old ≠ new，会转发到厂商路径）
                1
            } else {
                0
            };

            if score > best_score {
                best_score = score;
                best = Some(rule);
                if score == 3 {
                    break;
                } // 最高分无需继续遍历
            }
        }
    }
    // 如果未找到与请求路径严格匹配的规则，则拒绝匹配（不再兜底回落到第一条规则）
    let rule = best?;

    // 5. 统一通过 parse_forward_config 解析 config_json → ResolvedForward
    //    新增字段只需修改 parse_forward_config，此处无需变动
    let config: serde_json::Value = serde_json::from_str(&rule.config_json).unwrap_or_default();
    let resolved = parse_forward_config(&config, &openai_path, &rule.eid, Some(model.mid.clone()));
    tracing::info!(
        "[Forward] 命中规则 '{}' (eid={}): target_type={}, upstream_path={}, auth_type={}, \
         asset_convert={}, asset_convert_ns={}, poll_path={:?}, asset_moderation={}, \
         is_cascade={}, content_to_prompt={}, 关联 mid = '{}'",
        rule.name,
        rule.eid,
        resolved.target_type,
        resolved.upstream_path,
        resolved.auth_type,
        resolved.asset_convert,
        resolved.asset_convert_ns,
        resolved.poll_path,
        resolved.asset_moderation,
        resolved.is_cascade,
        resolved.content_to_prompt,
        model.mid
    );
    Some(resolved)
}

/// 快速检查模型是否绑定了转发规则（不做路径匹配）。
/// 配合 resolve_forward_rule 使用：当 resolve 返回 None 时，
/// 若此函数返回 true 说明模型绑定了规则但入口路径不匹配，应拒绝请求。
pub async fn model_has_forward_rules(state: &AppState, model_id: &str) -> bool {
    let ids: Option<String> =
        sqlx::query_scalar(&state.db.format_query(
            "SELECT forward_rule_ids FROM models WHERE model_id = ? AND is_active = 1",
        ))
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

/// 根据渠道 base_url 修正已解析的 target_type。
/// 当转发规则返回默认的 "openai" 但实际渠道有特殊约束时，覆盖为精确的 target_type。
/// 例如 APIMart（api.apimart.ai）的 size 仅接受比例格式，需识别为 "apimart"。
pub fn refine_target_type(resolved: &mut ResolvedForward, base_url: &str) {
    if resolved.target_type == "openai" {
        let url_lower = base_url.to_lowercase();
        if url_lower.contains("apimart.ai") {
            resolved.target_type = "apimart".to_string();
        }
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
    // 即梦AI：端点固定拼接 域名+Action+Version
    if resolved.target_type.starts_with("jimeng_") {
        return format!(
            "{}/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31",
            base_url.trim_end_matches('/')
        );
    }

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
pub fn resolve_kling_dynamic_path(
    resolved: &mut ResolvedForward,
    upstream_body: &serde_json::Value,
) {
    if resolved.target_type != "kling" {
        return;
    }
    let path = &resolved.upstream_path;

    // Omni 端点由转发规则直接指定，不做动态调整
    if path.contains("omni-video") || path.contains("omni-image") {
        return;
    }

    // 视频动态路由：根据请求体内容判断实际端点
    if path.contains("text2video")
        || path.contains("image2video")
        || path.contains("multi-image2video")
    {
        if upstream_body
            .get("image_list")
            .and_then(|v| v.as_array())
            .map_or(false, |a| !a.is_empty())
        {
            resolved.upstream_path = "/v1/videos/multi-image2video".to_string();
        } else if upstream_body.get("image").is_some() || upstream_body.get("image_tail").is_some()
        {
            resolved.upstream_path = "/v1/videos/image2video".to_string();
        } else {
            resolved.upstream_path = "/v1/videos/text2video".to_string();
        }
        return;
    }

    // 图片动态路由
    if path.contains("images") {
        if upstream_body
            .get("subject_image_list")
            .and_then(|v| v.as_array())
            .map_or(false, |a| !a.is_empty())
        {
            resolved.upstream_path = "/v1/images/multi-image2image".to_string();
        }
        // 其他情况保持转发规则原始路径（如 /v1/images/generations）
    }
}

/// 辅助函数：解析图片数据，支持 Data URI 和纯 Base64，提取对应的二进制字节和 MIME 类型。
/// 优化点：零堆内存分配，使用 Rust 切片模式匹配（Slice Pattern Matching）实现超高性能魔数判定。
fn parse_image_data(trimmed_url: &str) -> Option<(Vec<u8>, &str)> {
    use base64::Engine;
    if trimmed_url.is_empty() {
        return None;
    }

    // 统一的 Base64 解码闭包，支持带填充与无填充
    let decode_b64 = |s: &str| {
        base64::engine::general_purpose::STANDARD
            .decode(s)
            .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(s))
    };

    // 1. 优先尝试解析 Data URI
    if let Some(rest) = trimmed_url.strip_prefix("data:") {
        if let Some((mime, b64_data)) = rest.split_once(";base64,") {
            if let Ok(bytes) = decode_b64(b64_data) {
                return Some((bytes, mime));
            }
        }
        return None;
    }

    // 2. 排除 URL/路径类型（Base64 字符集不含 '.' 或 ':'），随后尝试纯 Base64 解码
    if !trimmed_url.contains('.') && !trimmed_url.contains(':') {
        if let Ok(bytes) = decode_b64(trimmed_url) {
            if bytes.len() > 10 {
                // 利用 Rust 声明式切片模式匹配判定图片格式，编译器将生成极佳的汇编跳转
                let mime = match bytes.as_slice() {
                    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ..] => "image/png",
                    [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
                    [0x47, 0x49, 0x46, 0x38, ..] => "image/gif",
                    [b'R', b'I', b'F', b'F', _, _, _, _, b'W', b'E', b'B', b'P', ..] => {
                        "image/webp"
                    }
                    _ => "image/png",
                };
                return Some((bytes, mime));
            }
        }
    }

    None
}

/// 将已转换的图片 JSON body 构建为 reqwest::multipart::Form。
/// - images 数组中的每个元素 → 根据图片数量映射为 image 或 image[] part（支持 data URI/纯 base64/并发异步下载 URL 转换为二进制，若失败则回退直传）
/// - mask 字段 → mask part（支持 data URI/纯 base64/并发异步下载 URL 转换为二进制，若失败则回退直传）
/// - 其他字段 → text part（model、prompt、size 等）
///
/// 参考文档：https://developers.openai.com/api/reference/resources/images/methods/edit
pub async fn build_edits_multipart(
    client: Option<&reqwest::Client>,
    upstream_body: &serde_json::Value,
) -> reqwest::multipart::Form {
    let mut form = reqwest::multipart::Form::new();
    let obj = match upstream_body.as_object() {
        Some(o) => o,
        None => return form,
    };

    // 辅助闭包：快速提取某个 JSON 节点中的所有图片 URL/Base64（兼容单字符串、对象数组等多种格式，避免两处提取逻辑的重复书写）
    let get_urls =
        |v: &serde_json::Value| collect_image_urls(&serde_json::json!({ "t": v }), &["t"]);

    // 1. 函数式迭代提取所有图片及 mask URL 列表
    let all_urls: Vec<String> = obj
        .iter()
        .filter_map(|(k, v)| {
            if matches!(k.as_str(), "images" | "image" | "image_urls" | "image[]") {
                Some(get_urls(v))
            } else if k == "mask" {
                v.as_str()
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| vec![s.to_string()])
            } else {
                None
            }
        })
        .flatten()
        .collect();

    // 2. 并发下载并建立缓存映射
    let resolved = resolve_image_urls(client, &all_urls).await;
    use std::collections::HashMap;
    let url_to_data: HashMap<_, _> = all_urls
        .into_iter()
        .zip(resolved)
        .filter_map(|(url, opt)| opt.map(|d| (url.trim().to_string(), d)))
        .collect();

    // 3. 辅助闭包：构建二进制文件 Part（使用组合子扁平化解析逻辑）
    let add_file_part = |form_ref: reqwest::multipart::Form,
                         part_name: &str,
                         image_url: &str,
                         default_filename: &str|
     -> reqwest::multipart::Form {
        let trimmed = image_url.trim();
        if trimmed.is_empty() {
            return form_ref;
        }

        use base64::Engine;
        let resolved_bytes = url_to_data
            .get(trimmed)
            .and_then(|resolved_val| {
                let mime = resolved_val.get("mime_type")?.as_str()?;
                let b64 = resolved_val.get("data")?.as_str()?;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64)
                    .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(b64))
                    .ok()?;
                Some((bytes, mime.to_string()))
            })
            .or_else(|| parse_image_data(trimmed).map(|(b, m)| (b, m.to_string())));

        if let Some((bytes, mime)) = resolved_bytes {
            let ext = mime
                .split('/')
                .last()
                .unwrap_or("png")
                .split(';')
                .next()
                .unwrap_or("png")
                .trim();
            let filename = format!("{}.{}", default_filename, ext);

            // 打印二进制文件 Part 属性信息
            tracing::info!(
                "[Multipart File Part] key: {}, filename: {}, mime: {}, size: {} bytes",
                part_name,
                filename,
                mime,
                bytes.len()
            );

            let part = reqwest::multipart::Part::bytes(bytes)
                .file_name(filename)
                .mime_str(&mime)
                .unwrap_or_else(|_| reqwest::multipart::Part::bytes(Vec::new()));
            form_ref.part(part_name.to_string(), part)
        } else {
            // 打印文本类型的图片/链接 Part 信息
            tracing::info!(
                "[Multipart Text File Part] key: {}, value (URL): {}",
                part_name,
                trimmed
            );
            form_ref.text(part_name.to_string(), trimmed.to_string())
        }
    };

    // 4. 遍历组装表单项
    for (key, value) in obj {
        if matches!(key.as_str(), "images" | "image" | "image_urls" | "image[]") {
            // 兼容多种图片键名，提取对应的图片 URL 或 Base64 列表
            let urls = get_urls(value);
            // 单图使用 "image" 以保持对 dall-e-2 及单图场景的广泛兼容，多图使用 "image[]" 以契合多图模型规范
            let part_name = if urls.len() == 1 { "image" } else { "image[]" };
            for url in urls {
                form = add_file_part(form, part_name, &url, "image");
            }
        } else if key == "mask" {
            // mask 字段特殊处理，支持 base64 解码为二进制文件 Part，以便契合图片编辑的 mask 格式要求
            let mask_val = value.as_str().unwrap_or("");
            form = add_file_part(form, "mask", mask_val, "mask");
        } else {
            // 其他字段：序列化为文本 Part（支持字符串/数值/布尔等）
            let text_val = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Null => continue,
                other => other.to_string(),
            };

            // 打印普通文本 Part
            tracing::info!("[Multipart Text Part] key: {}, value: {}", key, text_val);

            form = form.text(key.clone(), text_val);
        }
    }

    form
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
pub async fn transform_request_body(
    resolved: &ResolvedForward,
    model: &str,
    body: &serde_json::Value,
    category: &str,
    // billing_rule: 模型关联的计费规则实体上下文，
    // 通过判断 billing_type 是否为 "tokens" 决定是否跳过视频/图片的 resolution/duration 注入；
    // 通过判断 billing_rule 是否为 "image_resolution" 决定图片是否启用分辨率自适应提取与兜底
    billing_rule: Option<&crate::models::BillingRule>,
    // http_client: 图片模型用于下载 HTTP 图片 URL 转 base64
    http_client: Option<&reqwest::Client>,
) -> serde_json::Value {
    let mut result = match resolved.target_type.as_str() {
        // 火山引擎 AI MediaKit 画质增强与字幕擦除：重构并生成符合火山官方 API 规范的请求体
        "volcengine_media_enhance" => {
            #[cfg(feature = "plugin_volcengine_enhance")]
            {
                let match_key = resolved.mid.as_deref().unwrap_or("");
                build_volcengine_media_enhance_body(match_key, body)
            }
            #[cfg(not(feature = "plugin_volcengine_enhance"))]
            {
                body.clone()
            }
        }

        // Bytefor 视频生成：将 OpenAI 兼容格式转换为 Bytefor 视频生成 API 格式
        "bytefor_video" => build_bytefor_video_body(model, body),

        // 可灵 AI 视频/图片：将 OpenAI 兼容格式转换为可灵官方 API 格式
        // 参考文档：https://klingai.com/document-api/apiReference
        "kling" => build_kling_body(model, body, category, &resolved.upstream_path),

        // 阿里百炼 DashScope 视频：OpenAI → input/parameters 格式
        // 参考文档：https://help.aliyun.com/zh/model-studio/text-to-video-api-reference
        "dashscope" => build_dashscope_video_body(model, body),

        // 火山方舟图片（/api/v3/images/generations）: 保持 OpenAI 兼容格式
        // 参考 Seedream 5.0 API: https://www.volcengine.com/docs/82379/1541523
        "volcengine_image" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);

            // 优化与精简：当 size 不存在时取 resolution 参数，若两者均不存在则兜底为 "2k" 并赋值给 size；处理完毕后删除 resolution 字段，防止冗余或非法参数传到火山上游
            if fwd.get("size").is_none() {
                let size_val = fwd
                    .get("resolution")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or("2k")
                    .to_string();
                fwd["size"] = serde_json::json!(size_val);
            }
            if let Some(obj) = fwd.as_object_mut() {
                obj.remove("resolution");
            }

            // 火山方舟 image 原生支持字符串和数组，用 collect_image_urls 统一收集
            let img_urls = collect_image_urls(body, &["image", "image_urls"]);
            if let Some(obj) = fwd.as_object_mut() {
                obj.remove("image");
                obj.remove("image_urls");
                match img_urls.len() {
                    0 => {}
                    1 => {
                        obj.insert("image".to_string(), serde_json::json!(&img_urls[0]));
                    }
                    _ => {
                        obj.insert("image".to_string(), serde_json::json!(img_urls));
                    }
                }
            }

            // n > 1 → 启用组图: sequential_image_generation = "auto"
            let n = body.get("n").and_then(|v| v.as_i64()).unwrap_or(1);
            if n > 1 {
                fwd["sequential_image_generation"] = serde_json::json!("auto");
                fwd["sequential_image_generation_options"] = serde_json::json!({
                    "max_images": n
                });
            }
            // n 已转换为官方参数，删除避免冗余传到上游
            if let Some(obj) = fwd.as_object_mut() {
                obj.remove("n");
            }
            // watermark 直接透传（火山方舟原生支持，默认 true）
            fwd
        }

        // 阿里百炼图像生成: prompt → input.prompt
        "dashscope_image" => build_dashscope_image_body(model, body),

        // 火山方舟视频（/api/v3/contents/generations/tasks）: prompt → content 格式
        // 参考火山引擎 Seedance 2.0 官方 API：https://www.volcengine.com/docs/82379/1520757
        "volcengine" => {
            let mut fwd = build_volcengine_content_body(model, body);
            // resolution 归一化为小写（火山 API 接受 720p/1080p/480p 等小写格式）
            if let Some(res) = fwd.get("resolution").and_then(|v| v.as_str()) {
                fwd["resolution"] = serde_json::json!(res.to_lowercase());
            } else {
                fwd["resolution"] = serde_json::json!("720p");
            }
            fwd
        }

        // 火山方舟聊天：保持 OpenAI 格式（火山完全兼容 OpenAI）
        "volcengine_chat" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            fwd
        }

        // Gemini 图片：prompt → contents 格式，支持图生图/多图生图
        // 参考 Google Gemini API: generationConfig.candidateCount / imageConfig
        // 图片 inline_data 格式: https://ai.google.dev/api/caching?hl=zh-cn#Blob
        "gemini_image" => {
            let prompt = body["prompt"].as_str().unwrap_or("Generate an image");

            let mut gen_config = serde_json::json!({
                "responseModalities": ["IMAGE"]
            });

            // n → candidateCount（生成数量）
            if let Some(n) = body.get("n").and_then(|v| v.as_i64()) {
                if n > 1 {
                    gen_config["candidateCount"] = serde_json::json!(n);
                }
            }

            // imageConfig 构建
            let mut img_cfg = serde_json::Map::new();
            let size_str = body.get("size").and_then(|v| v.as_str()).unwrap_or("");
            let size_is_ratio = size_str.contains(':');

            // 比例优先级：ratio > size(含':')
            let aspect_ratio = body.get("ratio").and_then(|v| v.as_str()).or_else(|| {
                if size_is_ratio {
                    Some(size_str)
                } else {
                    None
                }
            });
            if let Some(r) = aspect_ratio {
                img_cfg.insert("aspectRatio".to_string(), serde_json::json!(r));
            }

            // 分辨率优先级：resolution > size(不含':') > 兜底 "1k"
            let image_size = body
                .get("resolution")
                .and_then(|v| v.as_str())
                .or_else(|| {
                    if !size_is_ratio && !size_str.is_empty() {
                        Some(size_str)
                    } else {
                        None
                    }
                })
                .unwrap_or("1k");
            img_cfg.insert("imageSize".to_string(), serde_json::json!(image_size));

            gen_config["imageConfig"] = serde_json::Value::Object(img_cfg);

            // ── 图生图/多图生图：收集参考图转为 Gemini inline_data 格式 ──
            // resolve_image_urls 统一处理 data URI / 纯 base64 / HTTP URL，失败项跳过
            let all_urls = collect_image_urls(body, &["image", "image_urls"]);
            let resolved = resolve_image_urls(http_client, &all_urls).await;
            let mut image_parts: Vec<serde_json::Value> = resolved
                .into_iter()
                .flatten()
                .map(|v| serde_json::json!({"inline_data": v}))
                .collect();

            // 构建 contents：文本 prompt + 图片 inline_data（如有）
            let mut parts: Vec<serde_json::Value> = Vec::new();
            parts.push(serde_json::json!({"text": prompt}));
            parts.append(&mut image_parts);

            let mut result = serde_json::json!({
                "contents": [{"parts": parts, "role": "user"}],
                "generationConfig": gen_config
            });

            // Google Search 搜索增强工具
            let gs = body
                .get("google_search")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let gis = body
                .get("google_image_search")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if gs || gis {
                result["tools"] = serde_json::json!([{"google_search": {}}]);
            }

            result
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
                if let Some(t) = body.get("temperature") {
                    gen_config.insert("temperature".to_string(), t.clone());
                }
                if let Some(t) = body.get("top_p") {
                    gen_config.insert("topP".to_string(), t.clone());
                }
                if let Some(t) = body.get("max_tokens") {
                    gen_config.insert("maxOutputTokens".to_string(), t.clone());
                }
                if !gen_config.is_empty() {
                    result["generationConfig"] = serde_json::Value::Object(gen_config);
                }
            }

            if let Some(opts) = body.get("stream_options") {
                result["stream_options"] = opts.clone();
            }

            result
        }

        // Anthropic 聊天：OpenAI messages → Anthropic 格式
        // system 优先级：请求体顶层 system 参数 > messages 中 role=system 的内容
        "anthropic" => {
            let mut messages = Vec::new();
            let mut system_from_messages: Option<serde_json::Value> = None;

            if let Some(msgs) = body.get("messages").and_then(|m| m.as_array()) {
                for msg in msgs {
                    let role = msg["role"].as_str().unwrap_or("user");
                    if role == "system" {
                        // 仅在顶层 system 未提供时，才从 messages 中提取
                        if body.get("system").is_none() {
                            let content = &msg["content"];
                            system_from_messages = match content {
                                serde_json::Value::String(s) => Some(serde_json::json!(s)),
                                v if !v.is_null() => Some(v.clone()),
                                _ => None,
                            };
                        }
                    } else {
                        // user/assistant 消息：保留原始 content 结构（字符串或多模态数组）
                        messages.push(
                            serde_json::json!({"role": role, "content": msg["content"].clone()}),
                        );
                    }
                }
            }

            let mut result = serde_json::json!({
                "model": model,
                "messages": messages,
                "max_tokens": body.get("max_tokens").and_then(|v| v.as_i64()).unwrap_or(4096),
            });

            // system 参数：顶层优先（支持字符串和数组格式），其次 messages 中提取
            if let Some(sys) = body.get("system") {
                result["system"] = sys.clone();
            } else if let Some(sys) = system_from_messages {
                result["system"] = sys;
            }

            // 透传 Anthropic 原生参数
            for key in &[
                "temperature",
                "top_p",
                "top_k",
                "stream",
                "stop_sequences",
                "metadata",
                "tools",
                "tool_choice",
                "thinking",
                "reasoning_effort",
            ] {
                if let Some(v) = body.get(*key) {
                    result[*key] = v.clone();
                }
            }
            result
        }

        // 腾讯云 VOD AIGC：独立构建请求体，参数严格映射为腾讯云 PascalCase
        "tencent_vod_image" => build_tencent_vod_image_body(model, body),
        "tencent_vod_video" => build_tencent_vod_video_body(model, body),

        // 即梦AI（火山引擎 CV 视觉服务）：OpenAI → 即梦格式
        "jimeng_image" => build_jimeng_image_body(model, body),
        "jimeng_video" => build_jimeng_video_body(model, body),

        // GPT 官方图片：image/image_urls → GPT 官方 images 数组
        // 参考文档：https://developers.openai.com/api/reference/resources/images/methods/edit
        // edits 端点要求 images 数组，元素格式: { image_url: "data:...;base64,..." } 或 { image_url: "https://..." }
        "gpt" if category == "图片" => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            // 提取各种图片参数中的图片地址（自动去重），不下载转 base64，直接统一构建为 images 数组直传
            let all_urls = collect_image_urls(body, &["image", "image_urls", "images", "image[]"]);
            let entries: Vec<serde_json::Value> = all_urls
                .iter()
                .filter(|url| !url.is_empty())
                .map(|url| serde_json::json!({ "image_url": url }))
                .collect();
            if let Some(obj) = fwd.as_object_mut() {
                obj.remove("image");
                obj.remove("images");
                obj.remove("image_urls");
                obj.remove("image[]");
                if !entries.is_empty() {
                    obj.insert("images".to_string(), serde_json::json!(entries));
                }
            }
            fwd
        }

        // 火山方舟语音合成 TTS V3 SSE：OpenAI /v1/audio/speech → 火山 V3 SSE 格式
        // 官方请求体: { user, req_params: { text, speaker, audio_params: { format, sample_rate }, mix_speaker? } }
        // 参考文档：https://www.volcengine.com/docs/6561/1598757
        "volcengine_tts" => {
            // 官方格式优先：如果已包含 req_params，直接使用（透传原生参数）
            if body.get("req_params").is_some() {
                let mut fwd = body.clone();
                // 确保 user.uid 存在
                if fwd.get("user").is_none() {
                    fwd["user"] = serde_json::json!({ "uid": "tokensbyte" });
                }
                return fwd;
            }

            // OpenAI 格式转换：input/voice/response_format/speed → req_params
            let text = body.get("input").and_then(|v| v.as_str()).unwrap_or("");
            let speaker = body.get("voice").and_then(|v| v.as_str()).unwrap_or("");
            let format = body
                .get("response_format")
                .and_then(|v| v.as_str())
                .unwrap_or("mp3");
            let sample_rate = body
                .get("sample_rate")
                .and_then(|v| v.as_i64())
                .unwrap_or(24000);
            let speed = body
                .get("speed")
                .filter(|v| v.is_number())
                .cloned()
                .unwrap_or_else(|| serde_json::json!(0));

            let mut req_params = serde_json::json!({
                "text": text,
                "speaker": speaker,
                "audio_params": {
                    "format": format,
                    "sample_rate": sample_rate,
                    "speech_rate": speed
                }
            });
            // 透传混音配置（mix_speaker）
            if let Some(mix) = body.get("mix_speaker") {
                req_params["mix_speaker"] = mix.clone();
            }

            serde_json::json!({
                "user": { "uid": "tokensbyte" },
                "req_params": req_params
            })
        }

        _ => {
            let mut fwd = body.clone();
            fwd["model"] = serde_json::json!(model);
            fwd
        }
    };

    // 视频模型默认参数兜底（确保上游数据与计费一致）
    // 跳过条件：仅对标准的 OpenAI 兼容渠道注入，其他已定制渠道在各自构建函数中管理，无需在此注入以防报错
    let is_token_billing = billing_rule.as_ref().map(|r| r.billing_type.as_str()) == Some("tokens");
    if category == "视频"
        && !is_token_billing
        && matches!(resolved.target_type.as_str(), "openai" | "apimart")
    {
        if result.get("resolution").is_none() {
            result["resolution"] = serde_json::json!("720p");
        }
        if result.get("duration").is_none() {
            result["duration"] = serde_json::json!(5);
        }
    }

    // APIMart 渠道特判：当入参包含 size 且为 k 结尾，且包含 ratio 时，将 ratio 的值赋给 size 并删除 ratio
    if resolved.target_type == "apimart" {
        if let Some(size_val) = result.get("size").and_then(|v| v.as_str()) {
            let size_lower = size_val.trim().to_lowercase();
            if size_lower.ends_with('k') && result.get("ratio").is_some() {
                if let Some(ratio_val) = result.get("ratio").cloned() {
                    result["size"] = ratio_val;
                    if let Some(obj) = result.as_object_mut() {
                        obj.remove("ratio");
                    }
                }
            }
        }
    }

    // 统一后处理：web_search 联网搜索参数转换
    convert_web_search(&mut result, body, &resolved.target_type);

    // 统一后处理：对所有聊天模型的流式请求，设置 stream_options.include_usage = true
    // 确保流式聊天时能获取到 token 使用量进行计费
    if category == "聊天" {
        // 检查是否是流式请求
        let is_stream = body
            .get("stream")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if is_stream {
            // 明确白名单：对所有使用 OpenAI 格式的模型应用此设置
            // 注意：即使转发规则没有设置 target_type，第 151 行会默认设置为 "openai"
            let is_openai_format =
                matches!(resolved.target_type.as_str(), "openai" | "volcengine_chat");

            if is_openai_format {
                if let Some(obj) = result.as_object_mut() {
                    if let Some(options) = obj
                        .get_mut("stream_options")
                        .and_then(|v| v.as_object_mut())
                    {
                        // 如果已有 stream_options，确保 include_usage = true
                        options.insert("include_usage".to_string(), serde_json::json!(true));
                    } else {
                        // 否则，添加 stream_options
                        obj.insert(
                            "stream_options".to_string(),
                            serde_json::json!({ "include_usage": true }),
                        );
                    }
                }
            }
        }
    }

    if resolved.content_to_prompt {
        apply_content_to_prompt(&mut result);
    }

    result
}

/// 将 OpenAI 风格的 `web_search: true` 转换为目标平台的联网搜索参数。
/// 火山方舟统一使用 `tools: [{"type": "web_search"}]` 格式。
fn convert_web_search(
    result: &mut serde_json::Value,
    original: &serde_json::Value,
    target_type: &str,
) {
    if !original
        .get("web_search")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return;
    }
    match target_type {
        "volcengine" | "volcengine_image" => {
            result["tools"] = serde_json::json!([{"type": "web_search"}]);
            if let Some(obj) = result.as_object_mut() {
                obj.remove("web_search");
            }
        }
        "gemini" | "gemini_image" => {
            result["tools"] = serde_json::json!([{"google_search": {}}]);
            if let Some(obj) = result.as_object_mut() {
                obj.remove("web_search");
            }
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
        // 火山方舟语音合成 TTS V3：X-Api-Key 鉴权 + X-Api-Resource-Id 指定模型版本
        "volcengine_tts" => vec![("X-Api-Key".to_string(), api_key.to_string())],
        _ => {
            // 可灵 JWT 自动生成：api_key 格式为 "access_key:secret_key"
            if resolved.target_type == "kling" {
                if let Some(token) = generate_kling_jwt(api_key) {
                    vec![("Authorization".to_string(), format!("Bearer {}", token))]
                } else {
                    tracing::warn!(
                        "[Kling Auth] JWT 生成失败，将直接使用 api_key 作为 Bearer Token"
                    );
                    vec![("Authorization".to_string(), format!("Bearer {}", api_key))]
                }
            } else {
                vec![("Authorization".to_string(), format!("Bearer {}", api_key))]
            }
        }
    };
    // DashScope 异步视频任务需要 X-DashScope-Async: enable
    if resolved.target_type == "dashscope" {
        headers.push(("X-DashScope-Async".to_string(), "enable".to_string()));
    }
    headers
}

/// 统一为上游 POST 请求应用鉴权头并设置请求体。
/// 封装所有厂商的认证差异（Bearer/JWT/TC3-HMAC-SHA256/火山引擎 V4 等），
/// 调用方只需传入 builder，无需关心具体协议实现。
///
/// 签名类厂商（腾讯云/即梦）：内部用 .body() 发送已签名 body，确保签名一致。
/// 其他厂商：内部用 .json() 序列化 body。
pub fn apply_request_auth(
    mut builder: reqwest::RequestBuilder,
    resolved: &ResolvedForward,
    api_key: &str,
    upstream_body: &mut serde_json::Value,
    base_url: &str,
) -> reqwest::RequestBuilder {
    match resolved.target_type.as_str() {
        "tencent_vod_image" | "tencent_vod_video" => {
            let action = if resolved.target_type == "tencent_vod_image" {
                "CreateAigcImageTask"
            } else {
                "CreateAigcVideoTask"
            };
            let (ak, sk, sub_app_id) = parse_tencent_vod_key(api_key);
            upstream_body["SubAppId"] = serde_json::json!(sub_app_id);
            let signed_body = serde_json::to_string(upstream_body).unwrap_or_default();
            for (k, v) in build_tencent_vod_headers(ak, sk, action, &signed_body) {
                builder = builder.header(k, v);
            }
            builder.body(signed_body)
        }
        "jimeng_image" | "jimeng_video" => {
            let (ak, sk) = parse_jimeng_key(api_key);
            let signed_body = serde_json::to_string(upstream_body).unwrap_or_default();
            for (k, v) in
                build_jimeng_headers(ak, sk, "CVSync2AsyncSubmitTask", &signed_body, base_url)
            {
                builder = builder.header(k, v);
            }
            builder.body(signed_body)
        }
        _ => {
            let auth_headers = build_auth_headers(resolved, api_key);
            for (k, v) in &auth_headers {
                builder = builder.header(k, v);
            }
            builder.json(upstream_body)
        }
    }
}

/// 统一检测上游 POST 响应的 body 级错误（HTTP 200 但业务失败）。
/// 腾讯云/即梦等厂商 HTTP 状态码始终返回 200，错误信息在 body 中。
/// 返回 Some((错误响应JSON字符串, 转换后的response_content_str)) 表示有错误，None 表示正常。
///
/// 此函数在预扣费之前调用，避免"先扣费再退款"的冗余流程。
pub fn check_upstream_post_error(
    _target_type: &str,
    response_body: &str,
    category: &str,
    is_openai_compat: bool,
) -> (String, Option<String>) {
    let v: serde_json::Value = serde_json::from_str(response_body).unwrap_or_default();
    if super::response_formatter::is_upstream_error_response(&v) {
        if is_openai_compat {
            // OpenAI 兼容请求：通过 format_openai 把错误转换为标准 OpenAI 格式 JSON 返回
            let formatted =
                super::response_formatter::format_openai(category, response_body, true, None);
            (formatted.clone(), Some(formatted))
        } else {
            // 官方原生请求：报错格式原样返回不能转为 OpenAI，但仍需提供 Some(response_body) 触发拦截退费
            (response_body.to_string(), Some(response_body.to_string()))
        }
    } else {
        (response_body.to_string(), None)
    }
}

// ── 默认转发配置（无规则时的 OpenAI 透传）─────────────────────

/// 构建 ResolvedForward，仅需指定 target_type / upstream_path / auth_type，
/// 其余字段自动继承 Default 值（asset_convert=false, poll_path=None 等）。
/// 新增字段只需更新 Default impl，无需修改此函数。
pub fn make_forward(target_type: &str, upstream_path: &str, auth_type: &str) -> ResolvedForward {
    ResolvedForward {
        target_type: target_type.to_string(),
        upstream_path: upstream_path.to_string(),
        auth_type: auth_type.to_string(),
        ..Default::default()
    }
}

/// 获取默认的 OpenAI 格式转发配置
pub fn default_openai_forward(entry_path: &str) -> ResolvedForward {
    make_forward("openai", entry_path, "bearer")
}

/// 从转发规则的 config JSON 解析出 ResolvedForward。
///
/// 这是唯一需要随 ResolvedForward 字段新增而修改的解析入口。
/// 供 resolve_forward_rule() 与 test_channel 等场景共用，消除重复解析代码。
///
/// - `config`        : 已解析的规则配置 JSON（来自 forward_rules.config_json）
/// - `category_path` : 当前类别对应的 OpenAI 基准路径（如 "/v1/chat/completions"），
///                     用于 path_rewrite 的 old→new 路径替换
/// - `eid`           : 转发规则 EID（存入日志，避免二次查库）
/// - `mid`           : 关联模型的系统 mid（可选）
pub fn parse_forward_config(
    config: &serde_json::Value,
    category_path: &str,
    eid: &str,
    mid: Option<String>,
) -> ResolvedForward {
    // path_rewrite: 始终以 category_path 作为模板进行替换，
    // 保证不管真实入口是什么，向上游转发的 URL 都遵循规则配置
    let upstream_path = if let Some(pr) = config.get("path_rewrite") {
        let old = pr.get("old").and_then(|v| v.as_str()).unwrap_or("");
        let new = pr.get("new").and_then(|v| v.as_str()).unwrap_or("");
        if !old.is_empty() && category_path.contains(old) {
            category_path.replace(old, new)
        } else if !new.is_empty() {
            new.to_string()
        } else {
            category_path.to_string()
        }
    } else {
        category_path.to_string()
    };
    ResolvedForward {
        target_type: config
            .get("target_type")
            .and_then(|v| v.as_str())
            .unwrap_or("openai")
            .to_string(),
        upstream_path,
        // auth_type: 优先取 config 显式配置；缺失时默认 bearer（兼容 OpenAI 及第三方中转站）
        // 注意：target_type 描述请求/响应格式，auth_type 取决于上游鉴权方式，两者无必然关联
        auth_type: config
            .get("auth_type")
            .and_then(|v| v.as_str())
            .unwrap_or("bearer")
            .to_string(),
        asset_convert: config
            .get("asset_convert")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        asset_convert_ns: config
            .get("asset_convert_ns")
            .and_then(|v| v.as_str())
            .unwrap_or("asset_manager")
            .to_string(),
        poll_path: config
            .get("poll_path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        asset_moderation: config
            .get("moderation")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        eid: eid.to_string(),
        mid,
        is_cascade: config
            .get("is_cascade")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        content_to_prompt: config
            .get("content_to_prompt")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        res_mul: parse_res_mul(config),
    }
}

// ── 域名智能推断（无转发规则时的自动识别）─────────────────────

/// 根据 channel base_url 域名自动推断正确的转发配置。
/// 当模型未绑定转发规则时使用，避免把火山/Google/Anthropic 请求
/// 错误地按 OpenAI 路径透传。
pub fn infer_forward_from_base_url(
    base_url: &str,
    category: &str,
    db_model: Option<&crate::models::Model>,
) -> ResolvedForward {
    let url_lower = base_url.to_lowercase();

    // 阿里百炼 DashScope
    if url_lower.contains("dashscope") {
        return match category {
            "视频" => {
                let mut r = make_forward(
                    "dashscope",
                    "/api/v1/services/aigc/video-generation/video-synthesis",
                    "bearer",
                );
                r.poll_path = Some("/api/v1/tasks/${task_id}".to_string());
                r
            }
            "图片" => make_forward(
                "dashscope_image",
                "/api/v1/services/aigc/multimodal-generation/generation",
                "bearer",
            ),
            "向量" => make_forward("openai", "/compatible-mode/v1/embeddings", "bearer"),
            "排序" => make_forward("openai", "/compatible-api/v1/reranks", "bearer"),
            _ => default_openai_forward(match category {
                "聊天" => "/v1/chat/completions",
                "图片" => "/v1/images/generations",
                _ => "/v1/chat/completions",
            }),
        };
    }

    // 火山引擎 AI MediaKit 视频画质增强 (mediakit.cn-beijing.volces.com)
    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        if url_lower.contains("mediakit") {
            let mut r = make_forward(
                "volcengine_media_enhance",
                "/api/v1/tools/enhance-video",
                "bearer",
            );
            r.poll_path = Some("/api/v1/tasks/${task_id}".to_string());
            if let Some(m) = db_model {
                r.mid = Some(m.mid.clone());
                resolve_volcengine_media_enhance_path(&mut r, &m.model_id);
            }
            return r;
        }
    }

    // 火山豆包语音合成（openspeech.bytedance.com，独立域名）
    // 必须优先于通用 volcengine 匹配
    if url_lower.contains("openspeech.bytedance.com") {
        return make_forward(
            "volcengine_tts",
            "/api/v3/tts/unidirectional/sse",
            "volcengine_tts",
        );
    }

    // 即梦AI（火山引擎 CV 视觉服务）
    // 注意：visual.volcengineapi.com 包含 "volcengine" 子串，必须优先于火山方舟通用匹配
    if url_lower.contains("visual.volcengineapi.com") {
        return match category {
            "图片" => make_forward("jimeng_image", "/", "jimeng"),
            "视频" => make_forward("jimeng_video", "/", "jimeng"),
            _ => default_openai_forward("/v1/chat/completions"),
        };
    }

    if url_lower.contains("volces.com") || url_lower.contains("volcengine") {
        match category {
            "图片" => make_forward("volcengine_image", "/api/v3/images/generations", "bearer"),
            "视频" => make_forward("volcengine", "/api/v3/contents/generations/tasks", "bearer"),
            _ => make_forward("volcengine_chat", "/api/v3/chat/completions", "bearer"),
        }
    } else if url_lower.contains("googleapis.com") || url_lower.contains("generativelanguage") {
        let tt = if category == "图片" {
            "gemini_image"
        } else {
            "gemini"
        };
        make_forward(tt, "/v1beta/models/${model}:generateContent", "query_key")
    } else if url_lower.contains("anthropic.com") {
        make_forward("anthropic", "/v1/messages", "x-api-key")
    } else if url_lower.contains("klingai.com") {
        match category {
            "视频" => make_forward("kling", "/v1/videos/text2video", "bearer"),
            "图片" => make_forward("kling", "/v1/images/generations", "bearer"),
            _ => default_openai_forward("/v1/chat/completions"),
        }
    } else if url_lower.contains("tencentcloudapi.com") {
        match category {
            "图片" => make_forward("tencent_vod_image", "/", "tencent_vod"),
            "视频" => make_forward("tencent_vod_video", "/", "tencent_vod"),
            _ => default_openai_forward("/v1/chat/completions"),
        }
    } else {
        default_openai_forward(super::proxy::category_endpoint(Some(category)))
    }
}

// ── SSE 流式转换 ──────────────────────────────────────────────

/// 根据 target_type 转换 SSE 数据行为 OpenAI 格式
pub fn transform_sse_line(target_type: &str, line: &str, model: &str) -> Option<String> {
    if !line.starts_with("data: ") {
        return None;
    }
    let data = &line[6..];
    if data == "[DONE]" {
        return None;
    }

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

    // 文字内容 chunk（candidates[0].content.parts[0].text）
    let text_chunk = v
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .and_then(|text| serde_json::to_string(&create_openai_chunk(text, model)).ok());

    // usage chunk（usageMetadata 存在时才输出，含 prompt_tokens_details.cached_tokens）
    let usage_chunk = v.get("usageMetadata").and_then(|meta| {
        let prompt = meta
            .get("promptTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let total = meta
            .get("totalTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let completion = (total - prompt).max(0);
        let cached = meta
            .get("cachedContentTokenCount")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let mut usage = serde_json::json!({
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "total_tokens": total,
        });
        if cached > 0 {
            usage["prompt_tokens_details"] = serde_json::json!({"cached_tokens": cached});
        }
        serde_json::to_string(&serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "object": "chat.completion.chunk",
            "created": chrono::Utc::now().timestamp(),
            "model": model,
            "choices": [],
            "usage": usage
        }))
        .ok()
    });

    match (text_chunk, usage_chunk) {
        (Some(t), Some(u)) => Some(format!("{}\n\ndata: {}", t, u)),
        (Some(t), None) => Some(t),
        (None, Some(u)) => Some(u),
        (None, None) => None,
    }
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
                                if let Some(url) = item
                                    .get("image_url")
                                    .and_then(|v| v.get("url"))
                                    .and_then(|v| v.as_str())
                                {
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
        let prompt = body
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("Generate an image");
        let mut dash_content = Vec::new();

        // 支持顶层 image / image_urls 参数，确保图片先于文本内容
        for url in &collect_image_urls(body, &["image", "image_urls"]) {
            dash_content.push(serde_json::json!({ "image": url }));
        }

        dash_content.push(serde_json::json!({ "text": prompt }));

        input.insert(
            "messages".to_string(),
            serde_json::json!([
                {
                    "role": "user",
                    "content": dash_content
                }
            ]),
        );
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
        params.insert(
            "size".to_string(),
            serde_json::json!(size.replace("x", "*")),
        );
    }

    // style/quality/prompt_extend/watermark
    let passthrough = ["style", "quality", "prompt_extend", "watermark", "seed"];
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
// media.type：first_frame / reference_image / reference_video（r2v）/ video（videoedit 等）

/// DashScope parameters 内的合法参数白名单
const DASHSCOPE_PARAM_KEYS: &[&str] = &[
    "resolution",
    "ratio",
    "duration",
    "prompt_extend",
    "watermark",
    "seed",
];

/// OpenAI 转换路径专用：wan2.7-r2v 将 media.type=video → reference_video
fn remap_dashscope_r2v_media_types(model: &str, body: &mut serde_json::Value) {
    if !model.to_ascii_lowercase().contains("wan2.7-r2v") {
        return;
    }
    let Some(arr) = body
        .pointer_mut("/input/media")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for item in arr {
        if item.get("type").and_then(|t| t.as_str()) == Some("video") {
            item["type"] = serde_json::json!("reference_video");
        }
    }
}

/// 构建阿里百炼 DashScope 视频生成请求体
fn build_dashscope_video_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    // 已有 input：官方 DashScope 体直通，仅替换 model，不改用户参数
    if body.get("input").is_some() {
        let mut fwd = body.clone();
        fwd["model"] = serde_json::json!(model);
        return fwd;
    }

    // OpenAI 扁平参数 → input/parameters
    let prompt = body
        .get("prompt")
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
        .unwrap_or_else(|| "".to_string());

    let mut input = serde_json::json!({ "prompt": prompt });
    if let Some(np) = body.get("negative_prompt").and_then(|v| v.as_str()) {
        input["negative_prompt"] = serde_json::json!(np);
    }
    if let Some(au) = body.get("audio_url").and_then(|v| v.as_str()) {
        input["audio_url"] = serde_json::json!(au);
    }

    // media：已有数组视为用户自组官方字段透传；否则从 OpenAI 的 images/videos 组装
    let from_openai_media;
    if let Some(media) = body.get("media").filter(|v| v.is_array()) {
        input["media"] = media.clone();
        from_openai_media = false;
    } else {
        from_openai_media = true;
        let mut media = Vec::new();
        let arr_images = collect_media_values(body, &["images", "image_urls"]);
        if !arr_images.is_empty() {
            let defaults = infer_image_default_roles(arr_images.len());
            for (i, item) in arr_images.iter().enumerate() {
                let default_role = defaults.get(i).copied().unwrap_or("reference_image");
                let (url, role) = parse_media_item(item, default_role);
                if let Some(u) = url.filter(|u| !u.is_empty()) {
                    media.push(serde_json::json!({ "type": role, "url": u }));
                }
            }
        }
        let arr_videos = collect_media_values(body, &["videos"]);
        for item in &arr_videos {
            let (url, role) = parse_media_item(item, "video");
            if let Some(u) = url.filter(|u| !u.is_empty()) {
                media.push(serde_json::json!({ "type": role, "url": u }));
            }
        }
        if !media.is_empty() {
            input["media"] = serde_json::json!(media);
        }
    }

    let mut params = serde_json::Map::new();
    for key in DASHSCOPE_PARAM_KEYS {
        if let Some(v) = body.get(*key) {
            params.insert(key.to_string(), v.clone());
        }
    }
    // size → resolution；resolution 统一大写（DashScope 接受 720P/1080P）
    if !params.contains_key("resolution") {
        if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
            params.insert(
                "resolution".to_string(),
                serde_json::json!(size.to_uppercase()),
            );
        }
    } else if let Some(res) = params.get("resolution").and_then(|v| v.as_str()) {
        params.insert(
            "resolution".to_string(),
            serde_json::json!(res.to_uppercase()),
        );
    }
    params
        .entry("resolution".to_string())
        .or_insert(serde_json::json!("720P"));
    params
        .entry("duration".to_string())
        .or_insert(serde_json::json!(5));

    let mut result = serde_json::json!({ "model": model, "input": input });
    if !params.is_empty() {
        result["parameters"] = serde_json::Value::Object(params);
    }
    // 仅改 OpenAI images/videos 组装出的 media；官方 input / media 不改
    if from_openai_media {
        remap_dashscope_r2v_media_types(model, &mut result);
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
    "ratio",      // 宽高比，如 "16:9", "4:3"
    "resolution", // 分辨率，如 "480p", "720p", "1080p"
    // 视频控制
    "duration",     // 视频时长（秒），如 5, 10
    "camera_fixed", // 是否固定摄像头
    "seed",         // 随机种子
    // 音频/水印/末帧
    "generate_audio",    // 是否生成音频 (bool)
    "return_last_frame", // 是否返回末帧 (bool)
    "watermark",         // 是否添加水印 (bool)
    // 流式/回调
    "stream",                  // 是否流式返回
    "callback_url",            // 回调地址
    "service_tier",            // 服务等级（如 flex 离线减半）
    "execution_expires_after", // 任务超时失效时间 (秒)
    "draft",                   // 是否开启样片模式
    "tools",                   // 调用的工具
    "safety_identifier",       // 终端用户的唯一标识符
    "priority",                // 请求的执行优先级
    "frames",                  // 生成视频的帧数
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
        // 图片：collect_media_values 统一收集，parse_media_item 提取 (url, role)
        // 按数量智能推断 role：1 张 → first_frame，2 张 → first_frame + last_frame，3+ 张 → reference_image
        let arr_images = collect_media_values(body, &["images", "image_urls"]);
        if !arr_images.is_empty() {
            let defaults = infer_image_default_roles(arr_images.len());
            for (i, item) in arr_images.iter().enumerate() {
                let (url, role) =
                    parse_media_item(item, defaults.get(i).copied().unwrap_or("reference_image"));
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
        let arr_videos = collect_media_values(body, &["videos"]);
        if !arr_videos.is_empty() {
            for item in &arr_videos {
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
        let arr_audios = collect_media_values(body, &["audios"]);
        if !arr_audios.is_empty() {
            for item in &arr_audios {
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

    // ── 任务失效时间默认兜底 ──
    // 若用户未指定 execution_expires_after，则默认设为 1小时（3600 秒），防止队列任务长时间积压或一直处于排队中
    if result.get("execution_expires_after").is_none() {
        result["execution_expires_after"] = serde_json::json!(3600);
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
        let mime = meta
            .split(';')
            .next()
            .filter(|s| !s.is_empty())
            .unwrap_or("image/png");
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

/// 异步下载 HTTP 图片并转为 格式（base64）。
/// 最多尝试 2 次（含首次请求），避免网络抖动导致多图场景丢图。
async fn download_image_to_base64(
    client: &reqwest::Client,
    url: &str,
) -> Option<serde_json::Value> {
    // 拦截内网及非安全网段的 URL 下载，防御 SSRF 漏洞
    if !is_safe_url_async(url).await {
        tracing::warn!("[download_image] 拦截了不安全的网络地址下载: {}", url);
        return None;
    }

    for attempt in 0..2 {
        let resp = match client
            .get(url)
            .timeout(std::time::Duration::from_secs(100))
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                tracing::warn!(
                    "[download_image] HTTP {} for {} (attempt {})",
                    r.status(),
                    url,
                    attempt + 1
                );
                continue;
            }
            Err(e) => {
                tracing::warn!(
                    "[download_image] request failed for {} (attempt {}): {}",
                    url,
                    attempt + 1,
                    e
                );
                continue;
            }
        };
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/png")
            .to_string();
        let mime = content_type.split(';').next().unwrap_or("image/png").trim();
        match resp.bytes().await {
            Ok(bytes) => {
                use base64::Engine;
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Some(serde_json::json!({
                    "mime_type": mime,
                    "data": b64
                }));
            }
            Err(e) => {
                tracing::warn!(
                    "[download_image] read body failed for {} (attempt {}): {}",
                    url,
                    attempt + 1,
                    e
                );
                continue;
            }
        }
    }
    tracing::error!("[download_image] all attempts failed for {}", url);
    None
}

/// 异步高效率校验 URL 安全性，防范 SSRF 漏洞。
/// 如果 Host 是域名则并发异步解析 IP，并对所有 IP 范围做内网及私有网段的过滤。
pub(crate) async fn is_safe_url_async(url_str: &str) -> bool {
    let parsed = match reqwest::Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return false,
    };

    // 仅允许 HTTP 和 HTTPS 协议
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }

    let host_str = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };

    // 快速拦截本地/回环 Host
    let host_lower = host_str.to_lowercase();
    if host_lower == "localhost" || host_lower.ends_with(".local") || host_lower.ends_with(".lan") {
        return false;
    }

    // 校验 Host 对应的 IP 范围
    match parsed.host() {
        Some(url::Host::Ipv4(ip)) => !is_ipv4_private(ip),
        Some(url::Host::Ipv6(ip)) => !is_ipv6_private(ip),
        Some(url::Host::Domain(domain)) => {
            // 对域名进行异步解析，防止 DNS Rebinding 绕过
            let port = parsed
                .port()
                .unwrap_or(if scheme == "https" { 443 } else { 80 });
            let addr_str = format!("{}:{}", domain, port);
            let addrs_res = tokio::net::lookup_host(&addr_str).await;
            if let Ok(mut addrs) = addrs_res {
                while let Some(addr) = addrs.next() {
                    let ip = addr.ip();
                    if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
                        return false;
                    }
                    match ip {
                        std::net::IpAddr::V4(ipv4) => {
                            if is_ipv4_private(ipv4) {
                                return false;
                            }
                        }
                        std::net::IpAddr::V6(ipv6) => {
                            if is_ipv6_private(ipv6) {
                                return false;
                            }
                        }
                    }
                }
                true
            } else {
                false // 无法解析的域名
            }
        }
        None => false,
    }
}

/// 过滤局域网、私有 IP、本地链路和特殊用途的 IPv4 范围
fn is_ipv4_private(ip: std::net::Ipv4Addr) -> bool {
    ip.is_loopback()
        || ip.is_private()
        || ip.is_unspecified()
        || ip.is_link_local()
        || ip.octets()[0] == 0 // 本地网络
        || (ip.octets()[0] == 100 && (ip.octets()[1] & 0xc0) == 64) // CGNAT 100.64.0.0/10
}

/// 过滤本地、本地链路和特殊用途的 IPv6 范围
fn is_ipv6_private(ip: std::net::Ipv6Addr) -> bool {
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        // Unique Local Address (fc00::/7)
        || (ip.segments()[0] & 0xfe00) == 0xfc00
        // Link Local (fe80::/10)
        || (ip.segments()[0] & 0xffc0) == 0xfe80
}

/// 批量解析图片 URL 转 base64 data，支持 HTTP URL 和 data URI。
/// HTTP URL 并发下载且自动去重（相同 URL 只下载一次），data URI 同步解析。
/// 返回与输入等长的 Vec，每个位置对应原始 URL 的解析结果。
async fn resolve_image_urls(
    client: Option<&reqwest::Client>,
    urls: &[String],
) -> Vec<Option<serde_json::Value>> {
    use std::collections::HashMap;
    let mut results: Vec<Option<serde_json::Value>> = vec![None; urls.len()];
    let mut http_tasks: Vec<(usize, String)> = Vec::new();
    // data URI / 纯 base64 同步解析，HTTP URL 收集待并发下载
    for (i, url) in urls.iter().enumerate() {
        if url.starts_with("data:") || (url.len() > 100 && !url.starts_with("http")) {
            // data URI 或无前缀纯 base64 字符串：同步解析
            results[i] = parse_data_uri_to_inline_data(url);
        } else if url.starts_with("http") {
            http_tasks.push((i, url.clone()));
        }
    }
    // HTTP URL 去重后并发下载
    if let Some(client) = client {
        if !http_tasks.is_empty() {
            let mut unique: Vec<String> = Vec::new();
            let mut url_idx: HashMap<String, usize> = HashMap::new();
            for (_, url) in &http_tasks {
                url_idx.entry(url.clone()).or_insert_with(|| {
                    unique.push(url.clone());
                    unique.len() - 1
                });
            }
            let dl = futures::future::join_all(
                unique.iter().map(|u| download_image_to_base64(client, u)),
            )
            .await;
            for (i, url) in http_tasks {
                results[i] = dl[url_idx[&url]].clone();
            }
        }
    }
    results
}

// ── 辅助函数 ──────────────────────────────────────────────────

/// 从请求体中按字段优先级收集媒体对象数组（保留 role 等原始元数据）。
/// 每个字段兼容：字符串、纯字符串数组、对象数组。
/// 如果是字符串形式，会自动包装成包含该字符串的单个 JSON 串元素数组。
fn collect_media_values(body: &serde_json::Value, fields: &[&str]) -> Vec<serde_json::Value> {
    for field in fields {
        if let Some(val) = body.get(*field) {
            let mut list = Vec::new();
            if val.is_string() {
                list.push(val.clone());
            } else if let Some(arr) = val.as_array() {
                list.extend(arr.iter().cloned());
            }
            if !list.is_empty() {
                return list;
            }
        }
    }
    Vec::new()
}

/// 从请求体中按字段优先级收集图片/视频 URL（提取为纯 String 列表）。
/// 每个字段兼容字符串、纯字符串数组、{url: "..."} 对象数组三种格式。
/// 默认字段优先级: image → image_urls（图片模型通用），调用方可自定义。
fn collect_image_urls(body: &serde_json::Value, fields: &[&str]) -> Vec<String> {
    let elements = collect_media_values(body, fields);
    let mut urls = Vec::new();
    for item in elements {
        if let Some(s) = item.as_str().filter(|s| !s.is_empty()) {
            urls.push(s.to_string());
        } else if let Some(u) = item
            .get("image")
            .or_else(|| item.get("image_url"))
            .or_else(|| item.get("video_url"))
            .or_else(|| item.get("url"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            urls.push(u.to_string());
        }
    }
    urls
}

/// 判断请求体是否包含图片输入（检查 image/image_urls/images/image[] 字段）
pub fn has_image_inputs(body: &serde_json::Value) -> bool {
    !collect_image_urls(body, &["image", "image_urls", "images", "image[]"]).is_empty()
}

/// 从数组元素中提取 (url, role/type)。
/// 兼容三种输入格式：
///   - 纯字符串 `"https://..."` → 使用 default_role
///   - 对象 `{"url": "https://...", "role": "first_frame"}` → 优先 role
///   - 对象 `{"url": "https://...", "type": "first_frame"}` → type 回退
fn parse_media_item<'a>(
    item: &'a serde_json::Value,
    default_role: &'a str,
) -> (Option<&'a str>, &'a str) {
    match item {
        serde_json::Value::String(s) => (Some(s.as_str()), default_role),
        serde_json::Value::Object(obj) => {
            let url = obj
                .get("image")
                .or_else(|| obj.get("image_url"))
                .or_else(|| obj.get("video_url"))
                .or_else(|| obj.get("url"))
                .and_then(|v| v.as_str());
            let role = obj
                .get("role")
                .or_else(|| obj.get("type"))
                .and_then(|v| v.as_str())
                .unwrap_or(default_role);
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
    let fix_indices: Vec<usize> = arr
        .iter()
        .enumerate()
        .filter(|(_, item)| {
            if item.get("type").and_then(|v| v.as_str()) != Some("image_url") {
                return false;
            }
            // 在有多模态视频/音频参考的场景下，图片只能作为 reference_image
            // 无论它原本是不是 first_frame / last_frame，都必须强制覆盖
            true
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
    "model_name",
    "prompt",
    "negative_prompt",
    "duration",
    "mode",
    "sound",
    "aspect_ratio",
    "image",
    "image_tail",
    "image_list",
    "video_list",
    "type",
    "multi_shot",
    "multi_prompt",
    "callback_url",
    "external_task_id",
    "cfg_scale",
    "camera_control",
    "shot_type",
    "element_list",
    "voice_list",
];

/// 可灵图片接口透传参数白名单
const KLING_IMAGE_PASSTHROUGH_KEYS: &[&str] = &[
    "model_name",
    "prompt",
    "negative_prompt",
    "n",
    "aspect_ratio",
    "resolution",
    "image",
    "image_list",
    "element_list",
    "subject_image_list",
    "image_fidelity",
    "series_amount",
    "callback_url",
    "external_task_id",
    "image_reference",
    "result_type",
    "watermark_info",
];

fn is_kling_first_frame(role: &str) -> bool {
    role == "first_frame" || role == "first"
}

fn is_kling_end_frame(role: &str) -> bool {
    role == "last_frame" || role == "end_frame" || role == "last" || role == "tail"
}

fn build_kling_body(
    model: &str,
    body: &serde_json::Value,
    category: &str,
    upstream_path: &str,
) -> serde_json::Value {
    let is_omni = upstream_path.contains("omni-video") || upstream_path.contains("omni-image");
    let keys = if category == "图片" {
        &KLING_IMAGE_PASSTHROUGH_KEYS[..]
    } else {
        &KLING_VIDEO_PASSTHROUGH_KEYS[..]
    };

    let mut result = serde_json::Map::new();

    // model_name：优先使用请求体中已有的（官方原生调用），否则从 model 转换
    if let Some(mn) = body.get("model_name").and_then(|v| v.as_str()) {
        result.insert("model_name".to_string(), serde_json::json!(mn));
    } else {
        result.insert("model_name".to_string(), serde_json::json!(model));
    }

    // 白名单驱动透传（跳过 model_name，已处理）
    for &key in keys {
        if key == "model_name" {
            continue;
        }
        if let Some(val) = body.get(key) {
            result.insert(key.to_string(), val.clone());
        }
    }

    // 视频声音优先级：generate_audio（布尔）> sound（字符串）
    // generate_audio 是 OpenAI 兼容扩展参数，可灵官方使用 sound 字段
    if category == "视频" {
        if let Some(ga) = body.get("generate_audio") {
            let enabled = ga.as_bool().unwrap_or(false) || ga.as_str() == Some("true");
            result.insert(
                "sound".to_string(),
                serde_json::json!(if enabled { "on" } else { "off" }),
            );
        }
    }

    // 兼容 OpenAI 的 ratio -> aspect_ratio (可灵官方参数名为 aspect_ratio)
    if !result.contains_key("aspect_ratio") {
        if let Some(ratio) = body.get("ratio") {
            result.insert("aspect_ratio".to_string(), ratio.clone());
        }
    }

    // 视频 mode 默认从 resolution 映射（OpenAI 兼容：720p/480p->std，1080p->pro，4k->4k），未提供时兜底 std
    if category != "图片" && !result.contains_key("mode") {
        let mode_val = if let Some(res_str) = body.get("resolution").and_then(|v| v.as_str()) {
            let res_lower = res_str.to_ascii_lowercase();
            if res_lower == "1080p" {
                "pro"
            } else if res_lower == "4k" {
                "4k"
            } else {
                "std" // "720p", "480p" 映射为 std
            }
        } else {
            "std"
        };
        result.insert("mode".to_string(), serde_json::json!(mode_val));
    }

    // 视频：OpenAI 兼容 images / image_urls 数组 → 可灵官方 image / image_tail / image_list
    // 仅在未使用官方参数时生效，避免覆盖原生调用
    // omni-video：多图统一走 image_list[].image_url
    // 非 omni：含 role=reference_image → image_list[].image（多图参考），否则按数量分发首尾帧
    if category != "图片"
        && !result.contains_key("image")
        && !result.contains_key("image_tail")
        && !result.contains_key("image_list")
    {
        let images = collect_media_values(body, &["images", "image_urls"]);
        if !images.is_empty() {
            // 统一解析媒体数据并过滤空值，兼容 role 和 type
            let parsed_items: Vec<(String, String)> = images
                .iter()
                .filter_map(|item| {
                    let (url_opt, role) = parse_media_item(item, "");
                    url_opt
                        .filter(|u| !u.is_empty())
                        .map(|u| (u.to_string(), role.to_string()))
                })
                .collect();

            if !parsed_items.is_empty() {
                if is_omni {
                    // omni-video：全部走 image_list[].image_url
                    let is_len_two = parsed_items.len() == 2;
                    let is_simple_mode =
                        is_len_two && parsed_items.iter().all(|(_, role)| role.is_empty());

                    let list: Vec<serde_json::Value> = parsed_items
                        .into_iter()
                        .enumerate()
                        .map(|(idx, (url, role))| {
                            let mut obj = serde_json::Map::new();
                            obj.insert("image_url".to_string(), serde_json::json!(url));
                            if is_simple_mode {
                                if idx == 0 {
                                    obj.insert(
                                        "type".to_string(),
                                        serde_json::json!("first_frame"),
                                    );
                                } else {
                                    obj.insert("type".to_string(), serde_json::json!("end_frame"));
                                }
                            } else {
                                if is_kling_first_frame(&role) {
                                    obj.insert(
                                        "type".to_string(),
                                        serde_json::json!("first_frame"),
                                    );
                                } else if is_kling_end_frame(&role) {
                                    obj.insert("type".to_string(), serde_json::json!("end_frame"));
                                }
                            }
                            serde_json::Value::Object(obj)
                        })
                        .collect();

                    result.insert("image_list".to_string(), serde_json::Value::Array(list));
                } else {
                    // 非 omni：含 role=reference_image 或图片数大于 2 → 全部走 image_list[].image（多图参考）
                    // 否则 → 按数量分配到 image / image_tail 首尾帧
                    let has_ref_role = parsed_items
                        .iter()
                        .any(|(_, role)| role == "reference_image");

                    if has_ref_role || parsed_items.len() > 2 {
                        let list: Vec<serde_json::Value> = parsed_items
                            .iter()
                            .map(|(u, _)| serde_json::json!({ "image": u }))
                            .collect();
                        result.insert("image_list".to_string(), serde_json::Value::Array(list));
                    } else {
                        let mut first_img: Option<String> = None;
                        let mut tail_img: Option<String> = None;

                        // 1. 根据显式指定的 role / type 进行归类
                        for (url, role) in &parsed_items {
                            if is_kling_first_frame(role) {
                                first_img = Some(url.clone());
                            } else if is_kling_end_frame(role) {
                                tail_img = Some(url.clone());
                            }
                        }

                        // 2. 兜底填充（若未指定，首张为首帧，第二张为尾帧）
                        if first_img.is_none() && tail_img.is_none() {
                            first_img = Some(parsed_items[0].0.clone());
                            if parsed_items.len() >= 2 {
                                tail_img = Some(parsed_items[1].0.clone());
                            }
                        } else {
                            // 填充空缺位置
                            for (url, role) in &parsed_items {
                                if !is_kling_first_frame(role) && !is_kling_end_frame(role) {
                                    if first_img.is_none() {
                                        first_img = Some(url.clone());
                                    } else if tail_img.is_none() {
                                        tail_img = Some(url.clone());
                                    }
                                }
                            }
                        }

                        if let Some(fi) = first_img {
                            result.insert("image".to_string(), serde_json::json!(fi));
                        }
                        if let Some(ti) = tail_img {
                            result.insert("image_tail".to_string(), serde_json::json!(ti));
                        }
                    }
                }
            }
        }
    }

    // 视频：OpenAI 兼容 videos / video_urls 数组 → 可灵官方 video_list
    // 仅在未使用官方参数时生效，避免覆盖原生调用
    if category != "图片" && !result.contains_key("video_list") && is_omni {
        let videos = collect_media_values(body, &["videos"]);
        if !videos.is_empty() {
            let parsed_items: Vec<(String, String)> = videos
                .iter()
                .filter_map(|item| {
                    let (url_opt, role) = parse_media_item(item, "");
                    url_opt
                        .filter(|u| !u.is_empty())
                        .map(|u| (u.to_string(), role.to_string()))
                })
                .collect();

            if !parsed_items.is_empty() {
                // omni-video：使用 video_list 且结构包含 video_url
                let list: Vec<serde_json::Value> = parsed_items
                    .into_iter()
                    .map(|(url, role)| {
                        let mut obj = serde_json::Map::new();
                        obj.insert("video_url".to_string(), serde_json::json!(url));
                        if !role.is_empty() {
                            obj.insert("refer_type".to_string(), serde_json::json!(role));
                        } else {
                            obj.insert("refer_type".to_string(), serde_json::json!("base"));
                        }
                        serde_json::Value::Object(obj)
                    })
                    .collect();

                result.insert("video_list".to_string(), serde_json::Value::Array(list));
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

    // OpenAI 兼容：collect_image_urls 统一收集 image/image_urls
    // omni-image：多图 → image_list[].image
    // 非 omni：单图 → image，多图 → subject_image_list[].subject_image
    if category == "图片"
        && !result.contains_key("subject_image_list")
        && !result.contains_key("image_list")
    {
        let urls = collect_image_urls(body, &["image", "image_urls"]);
        result.remove("image");
        result.remove("image_urls");
        if is_omni {
            // omni-image：全部走 image_list[].image
            match urls.len() {
                0 => {}
                _ => {
                    let list: Vec<serde_json::Value> = urls
                        .iter()
                        .map(|u| serde_json::json!({ "image": u }))
                        .collect();
                    result.insert("image_list".to_string(), serde_json::json!(list));
                }
            }
        } else {
            // 非 omni：单图 → image，多图 → subject_image_list[].subject_image
            match urls.len() {
                0 => {}
                1 => {
                    result.insert("image".to_string(), serde_json::json!(&urls[0]));
                }
                _ => {
                    let list: Vec<serde_json::Value> = urls
                        .iter()
                        .map(|u| serde_json::json!({ "subject_image": u }))
                        .collect();
                    result.insert("subject_image_list".to_string(), serde_json::json!(list));
                }
            }
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
    if ak.is_empty() || sk.is_empty() {
        return None;
    }

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

// ── 腾讯云 VOD AIGC 签名及请求体构建 ─────────────────────────
//
// 密钥格式：{SecretId}:{SecretKey}:{SubAppId}
// 模型格式：{ModelName}@{ModelVersion}

use hmac::Mac;
use sha2::{Digest, Sha256};

/// TC3-HMAC-SHA256 签名生成器，必须在完整 body 序列化后调用
pub fn build_tencent_vod_headers(
    secret_id: &str,
    secret_key: &str,
    action: &str,
    body: &str,
) -> Vec<(reqwest::header::HeaderName, reqwest::header::HeaderValue)> {
    let service = "vod";
    let host = "vod.tencentcloudapi.com";
    let timestamp = chrono::Utc::now().timestamp();
    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();

    // CanonicalRequest
    let hashed_payload = format!("{:x}", Sha256::digest(body.as_bytes()));
    let canonical_request = format!(
        "POST\n/\n\ncontent-type:application/json\nhost:{}\n\ncontent-type;host\n{}",
        host, hashed_payload
    );

    // StringToSign
    let credential_scope = format!("{}/{}/tc3_request", date, service);
    let hashed_canonical = format!("{:x}", Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{}\n{}\n{}",
        timestamp, credential_scope, hashed_canonical
    );

    // Signature
    let secret_date = hmac_sha256(format!("TC3{}", secret_key).as_bytes(), date.as_bytes());
    let secret_service = hmac_sha256(&secret_date, service.as_bytes());
    let secret_signing = hmac_sha256(&secret_service, b"tc3_request");
    let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes()));

    let authorization = format!(
        "TC3-HMAC-SHA256 Credential={}/{}, SignedHeaders=content-type;host, Signature={}",
        secret_id, credential_scope, signature
    );

    vec![
        (
            reqwest::header::CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static("application/json"),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-action"),
            reqwest::header::HeaderValue::from_str(action).unwrap(),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-version"),
            reqwest::header::HeaderValue::from_static("2018-07-17"),
        ),
        (
            reqwest::header::HeaderName::from_static("x-tc-timestamp"),
            reqwest::header::HeaderValue::from_str(&timestamp.to_string()).unwrap(),
        ),
        (
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&authorization).unwrap(),
        ),
    ]
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(key).expect("HMAC key");
    mac.update(msg);
    mac.finalize().into_bytes().to_vec()
}

/// 解析三段式密钥 SecretId:SecretKey:SubAppId
pub fn parse_tencent_vod_key(api_key: &str) -> (&str, &str, u64) {
    let parts: Vec<&str> = api_key.splitn(3, ':').collect();
    if parts.len() >= 3 {
        (parts[0], parts[1], parts[2].parse().unwrap_or(0))
    } else {
        ("", "", 0)
    }
}

/// 拆分 ModelName@ModelVersion
fn split_model(model_str: &str) -> (&str, &str) {
    model_str.split_once('@').unwrap_or((model_str, ""))
}

// ── 图片请求体构建 ──────────────────────────────────────
// OpenAI snake_case → 腾讯云 PascalCase
// AigcImageOutputConfig 字段：Resolution, Ratio, Count, Format

pub fn build_tencent_vod_image_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let (model_name, model_version) = split_model(model_str);
    let mut tb = serde_json::json!({ "ModelName": model_name });
    if !model_version.is_empty() {
        tb["ModelVersion"] = serde_json::json!(model_version);
    }

    // Prompt / NegativePrompt
    if let Some(v) = body
        .get("prompt")
        .or_else(|| body.get("Prompt"))
        .and_then(|v| v.as_str())
    {
        tb["Prompt"] = serde_json::json!(v);
    }
    if let Some(v) = body
        .get("negative_prompt")
        .or_else(|| body.get("NegativePrompt"))
        .and_then(|v| v.as_str())
    {
        tb["NegativePrompt"] = serde_json::json!(v);
    }

    // FileInfos：透传或从 images/image_urls 构建 { Type: "Url", Url: "..." }
    if let Some(fi) = body.get("FileInfos") {
        tb["FileInfos"] = fi.clone();
    } else {
        let urls = collect_image_urls(body, &["image", "image_urls", "image_list"]);
        if !urls.is_empty() {
            let fi: Vec<_> = urls
                .iter()
                .map(|u| serde_json::json!({ "Type": "Url", "Url": u }))
                .collect();
            tb["FileInfos"] = serde_json::json!(fi);
        }
    }

    // OutputConfig
    if let Some(oc) = body.get("OutputConfig") {
        tb["OutputConfig"] = oc.clone();
    } else {
        let mut oc = serde_json::Map::new();
        // n -> Count
        if let Some(n) = body.get("n").and_then(|v| v.as_i64()) {
            oc.insert("OutputImageCount".into(), serde_json::json!(n));
        }
        // resolution -> Resolution（优先级最高）
        if let Some(r) = body.get("resolution").and_then(|v| v.as_str()) {
            oc.insert("Resolution".into(), serde_json::json!(r.to_uppercase()));
        }
        // ratio -> Ratio（优先级最高）
        if let Some(r) = body.get("ratio").and_then(|v| v.as_str()) {
            oc.insert("AspectRatio".into(), serde_json::json!(r));
        }
        // size -> 尝试提取 Ratio（仅当 ratio 未明确提供时）
        if !oc.contains_key("AspectRatio") {
            if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
                if let Some(ratio) = size_to_ratio(size) {
                    oc.insert("AspectRatio".into(), serde_json::json!(ratio));
                }
            }
        }
        // format -> OutputFormat
        if let Some(f) = body.get("response_format").and_then(|v| v.as_str()) {
            oc.insert("OutputFormat".into(), serde_json::json!(f));
        }
        // watermark -> LogoAdd
        if let Some(wm) = body.get("watermark") {
            let enabled = wm.as_bool().unwrap_or(false) || wm.as_str() == Some("true");
            oc.insert(
                "LogoAdd".into(),
                serde_json::json!(if enabled { "Enabled" } else { "Disabled" }),
            );
        }
        // Resolution 兜底：保证计费正常
        if !oc.contains_key("Resolution") {
            oc.insert("Resolution".into(), serde_json::json!("1K"));
        }
        tb["OutputConfig"] = serde_json::Value::Object(oc);
    }

    // seed -> Seed
    if let Some(s) = body.get("seed").or_else(|| body.get("Seed")) {
        tb["Seed"] = s.clone();
    }

    // 透传高级参数
    if let Some(v) = body.get("ExtInfo") {
        tb["ExtInfo"] = v.clone();
    }
    // prompt_extend -> EnhancePrompt（兼容布尔和字符串）
    if let Some(v) = body.get("EnhancePrompt").and_then(|v| v.as_str()) {
        tb["EnhancePrompt"] = serde_json::json!(v);
    } else if let Some(v) = body
        .get("prompt_extend")
        .or_else(|| body.get("enhance_prompt"))
    {
        let enabled = v.as_bool().unwrap_or(false)
            || v.as_str()
                .map_or(false, |s| s.eq_ignore_ascii_case("enabled") || s == "true");
        tb["EnhancePrompt"] = serde_json::json!(if enabled { "Enabled" } else { "Disabled" });
    }

    tb
}

// ── 视频请求体构建 ──────────────────────────────────────
// AigcVideoOutputConfig 字段：Duration, Resolution, AspectRatio
// FileInfos Usage: 有视频时图片=Reference；无视频≤2张图=FirstFrame,>2张=Reference

pub fn build_tencent_vod_video_body(
    model_str: &str,
    body: &serde_json::Value,
) -> serde_json::Value {
    let (model_name, model_version) = split_model(model_str);
    let mut tb = serde_json::json!({ "ModelName": model_name });
    if !model_version.is_empty() {
        tb["ModelVersion"] = serde_json::json!(model_version);
    }

    // Prompt / NegativePrompt
    if let Some(v) = body
        .get("prompt")
        .or_else(|| body.get("Prompt"))
        .and_then(|v| v.as_str())
    {
        tb["Prompt"] = serde_json::json!(v);
    }
    if let Some(v) = body
        .get("negative_prompt")
        .or_else(|| body.get("NegativePrompt"))
        .and_then(|v| v.as_str())
    {
        tb["NegativePrompt"] = serde_json::json!(v);
    }

    // FileInfos：透传官方格式 或 从 images/image_urls 智能构建（带 role→Usage 映射）
    if let Some(fi) = body.get("FileInfos") {
        tb["FileInfos"] = fi.clone();
    } else {
        // 收集视频参数：支持视频 url，videos，以及可灵官方的 video_list 字段
        let mut video_urls = Vec::new();
        for field in &["video_url", "videos", "video_list"] {
            video_urls.extend(collect_image_urls(body, &[*field]));
        }
        video_urls.dedup();
        let has_video = !video_urls.is_empty();

        let mut valid_items: Vec<(String, String)> = Vec::new();

        // 1. 提取可灵专属单图参数（首帧/尾帧）
        if let Some(u) = body
            .get("image")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            valid_items.push((u.to_string(), "first_frame".to_string()));
        }
        if let Some(u) = body
            .get("image_tail")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            valid_items.push((u.to_string(), "last_frame".to_string()));
        }

        // 2. 从列表参数（image_list, images, image_urls）中批量提取（兼容单字符串和数组格式）
        for field in &["image_list", "images", "image_urls"] {
            let arr = collect_media_values(body, &[*field]);
            for item in arr {
                let (url, role) = parse_media_item(&item, "");
                if let Some(u) = url.filter(|s| !s.is_empty()) {
                    let mapped_role = match role {
                        "first_frame" => "first_frame",
                        "end_frame" | "last_frame" => "last_frame",
                        _ => "reference_image",
                    };
                    if !valid_items.iter().any(|(ex_url, _)| ex_url == u) {
                        valid_items.push((u.to_string(), mapped_role.to_string()));
                    }
                }
            }
        }

        let mut fi_arr: Vec<serde_json::Value> = Vec::new();
        let mut last_frame_url = None;
        let count = valid_items.len();
        for (idx, (u, role)) in valid_items.into_iter().enumerate() {
            let usage = match role.as_str() {
                "first_frame" => "FirstFrame",
                "last_frame" => "LastFrame",
                "reference_image" => "Reference",
                _ => {
                    if has_video || count > 2 {
                        "Reference"
                    } else if count == 2 {
                        if idx == 0 {
                            "FirstFrame"
                        } else {
                            "LastFrame"
                        }
                    } else {
                        "FirstFrame"
                    }
                }
            };
            if usage == "LastFrame" {
                last_frame_url = Some(u);
            } else {
                fi_arr.push(serde_json::json!({ "Type": "Url", "Url": u, "Usage": usage }));
            }
        }

        // 视频参考输入
        for vu in &video_urls {
            fi_arr.push(serde_json::json!({ "Type": "Url", "Url": vu, "Category": "Video", "Usage": "Reference" }));
        }

        if !fi_arr.is_empty() {
            tb["FileInfos"] = serde_json::json!(fi_arr);
        }
        if let Some(url) = last_frame_url {
            tb["LastFrameUrl"] = serde_json::json!(url);
        }
    }

    // OutputConfig
    if let Some(oc) = body.get("OutputConfig") {
        tb["OutputConfig"] = oc.clone();
    } else {
        let mut oc = serde_json::Map::new();
        // resolution -> Resolution
        if let Some(r) = body.get("resolution").and_then(|v| v.as_str()) {
            oc.insert("Resolution".into(), serde_json::json!(r.to_uppercase()));
        } else if let Some(mode) = body.get("mode").and_then(|v| v.as_str()) {
            let res = match mode {
                "std" => "720P".to_string(),
                "pro" => "1080P".to_string(),
                other => other.to_uppercase(),
            };
            oc.insert("Resolution".into(), serde_json::json!(res));
        }
        // ratio / aspect_ratio -> AspectRatio
        if let Some(r) = body
            .get("aspect_ratio")
            .or_else(|| body.get("ratio"))
            .and_then(|v| v.as_str())
        {
            oc.insert("AspectRatio".into(), serde_json::json!(r));
        }
        // duration -> Duration
        if let Some(d) = body.get("duration") {
            if let Some(n) = d
                .as_f64()
                .or_else(|| d.as_str().and_then(|s| s.parse::<f64>().ok()))
            {
                oc.insert("Duration".into(), serde_json::json!(n));
            }
        }
        // OffPeak 错峰模式：优先腾讯云原生参数，其次 service_tier=flex 映射
        if let Some(op) = body.get("OffPeak").and_then(|v| v.as_str()) {
            oc.insert("OffPeak".into(), serde_json::json!(op));
        } else if body.get("service_tier").and_then(|v| v.as_str()) == Some("flex") {
            oc.insert("OffPeak".into(), serde_json::json!("Enabled"));
        }
        // watermark -> LogoAdd
        if let Some(wm) = body.get("watermark") {
            let enabled = wm.as_bool().unwrap_or(false) || wm.as_str() == Some("true");
            oc.insert(
                "LogoAdd".into(),
                serde_json::json!(if enabled { "Enabled" } else { "Disabled" }),
            );
        }
        // 声音优先级：generate_audio（布尔）> sound（字符串 on/off）→ AudioGeneration
        if let Some(ga) = body.get("generate_audio") {
            let enabled = ga.as_bool().unwrap_or(false) || ga.as_str() == Some("true");
            oc.insert(
                "AudioGeneration".into(),
                serde_json::json!(if enabled { "Enabled" } else { "Disabled" }),
            );
        } else if let Some(s) = body.get("sound").and_then(|v| v.as_str()) {
            let enabled = s.eq_ignore_ascii_case("on");
            oc.insert(
                "AudioGeneration".into(),
                serde_json::json!(if enabled { "Enabled" } else { "Disabled" }),
            );
        }
        // Resolution 兜底
        if !oc.contains_key("Resolution") {
            oc.insert("Resolution".into(), serde_json::json!("720P"));
        }
        oc.insert("InputComplianceCheck".into(), serde_json::json!("Disabled"));
        oc.insert(
            "OutputComplianceCheck".into(),
            serde_json::json!("Disabled"),
        );
        tb["OutputConfig"] = serde_json::Value::Object(oc);
    }

    // seed -> Seed
    if let Some(s) = body.get("seed").or_else(|| body.get("Seed")) {
        tb["Seed"] = s.clone();
    }

    // 透传高级参数
    if let Some(v) = body.get("SubjectInfo").or_else(|| body.get("subject_info")) {
        tb["SubjectInfo"] = v.clone();
    }
    if let Some(v) = body.get("ExtInfo") {
        tb["ExtInfo"] = v.clone();
    }
    // prompt_extend -> EnhancePrompt（兼容布尔和字符串）
    if let Some(v) = body.get("EnhancePrompt").and_then(|v| v.as_str()) {
        tb["EnhancePrompt"] = serde_json::json!(v);
    } else if let Some(v) = body
        .get("prompt_extend")
        .or_else(|| body.get("enhance_prompt"))
    {
        let enabled = v.as_bool().unwrap_or(false)
            || v.as_str()
                .map_or(false, |s| s.eq_ignore_ascii_case("enabled") || s == "true");
        tb["EnhancePrompt"] = serde_json::json!(if enabled { "Enabled" } else { "Disabled" });
    }

    tb
}

/// size ("1024x1024") -> Ratio ("1:1" / "16:9" / "9:16" / "3:4" / "4:3")
fn size_to_ratio(size: &str) -> Option<&str> {
    if size.contains(':') {
        return Some(size);
    }
    // 尝试解析并计算比例。如果解析失败（如 "auto"），则最后原样返回 size。
    let parse_and_calc = || -> Option<&str> {
        // 支持 x、*、× (Unicode乘号) 分隔符
        let (w, h) = size
            .split_once('x')
            .or_else(|| size.split_once('*'))
            .or_else(|| size.split_once('×'))?;
        let (width, height) = (w.parse::<u32>().ok()?, h.parse::<u32>().ok()?);
        if width == height {
            return Some("1:1");
        }
        // 计算宽高比，匹配最接近的标准比例
        let ratio = width as f64 / height as f64;
        Some(if ratio > 1.0 {
            // 横向：4:3 ≈ 1.333, 16:9 ≈ 1.778
            if ratio < 1.5 {
                "4:3"
            } else {
                "16:9"
            }
        } else {
            // 纵向：3:4 ≈ 0.75, 9:16 ≈ 0.5625
            if ratio > 0.65 {
                "3:4"
            } else {
                "9:16"
            }
        })
    };

    parse_and_calc().or(Some(size))
}

// ── 即梦AI（火山引擎 CV 视觉服务）────────────────────────────

/// 解析即梦两段式密钥 AccessKeyID:SecretAccessKey
pub fn parse_jimeng_key(api_key: &str) -> (&str, &str) {
    let parts: Vec<&str> = api_key.splitn(2, ':').collect();
    if parts.len() >= 2 {
        (parts[0], parts[1])
    } else {
        ("", "")
    }
}

/// 即梦AI签名鉴权头构建（火山引擎 CV 服务 Signature V4）
/// action: "CVSync2AsyncSubmitTask" 或 "CVSync2AsyncGetResult"
/// base_url: 渠道配置的上游地址，用于动态提取 host（如 https://visual.volcengineapi.com）
/// 仅返回签名相关 header（X-Date/X-Content-Sha256/Authorization），
/// Content-Type 和 Host 由调用方或 reqwest 自动设置，避免重复 header 导致签名不匹配
pub fn build_jimeng_headers(
    access_key: &str,
    secret_key: &str,
    action: &str,
    body: &str,
    base_url: &str,
) -> Vec<(String, String)> {
    #[cfg(not(feature = "commercial_plugins"))]
    {
        let _ = access_key;
        let _ = secret_key;
        let _ = action;
        let _ = body;
        let _ = base_url;
        tracing::warn!("即梦签名在开源版本（未装载商业插件）中未启用");
        vec![]
    }
    #[cfg(feature = "commercial_plugins")]
    {
        // 从 base_url 动态提取 host（与素材库 call_api 一致）
        // 简单字符串解析：去掉 scheme 后取到第一个 / 或结尾
        let host = base_url
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or("visual.volcengineapi.com");
        let query = format!("Action={}&Version=2022-08-31", action);
        let (auth, x_date, payload_hash) = crate::services::volcengine::volcengine_sign(
            access_key,
            secret_key,
            "POST",
            &host,
            "/",
            &query,
            "cv",
            "cn-north-1",
            body.as_bytes(),
        );
        // 调试日志：输出签名关键参数，便于排查 SignatureDoesNotMatch
        tracing::info!(
            "[Jimeng Sign] host={}, query={}, ak={}, body_len={}, payload_sha256={}, x_date={}",
            host,
            query,
            access_key,
            body.len(),
            payload_hash,
            x_date
        );
        // 仅返回签名相关 header（与素材库 call_api 一致，不设 Content-Type/Host）
        vec![
            ("X-Date".to_string(), x_date),
            ("X-Content-Sha256".to_string(), payload_hash),
            ("Authorization".to_string(), auth),
        ]
    }
}

/// 即梦图片请求体构建：OpenAI 格式 → 即梦 CV 格式
/// req_key 固定为渠道模型映射后的 model（无映射时即为渠道里选择的模型ID）
fn build_jimeng_image_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut fwd = body.clone();
    // req_key = 模型标识（由渠道模型映射决定）
    fwd["req_key"] = serde_json::json!(model);
    // 清理 OpenAI 特有字段（已转换为即梦原生参数）
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("model");
    }

    // OpenAI size → 即梦 width/height（仅当用户未直接传 width/height 时）
    if fwd.get("width").is_none() && fwd.get("height").is_none() {
        if let Some(size) = body.get("size").and_then(|v| v.as_str()) {
            if let Some((w, h)) = size
                .split_once('x')
                .or_else(|| size.split_once('X'))
                .or_else(|| size.split_once('×'))
                .or_else(|| size.split_once('*'))
            {
                if let (Ok(wv), Ok(hv)) = (w.parse::<i64>(), h.parse::<i64>()) {
                    fwd["width"] = serde_json::json!(wv);
                    fwd["height"] = serde_json::json!(hv);
                }
            }
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("size");
    }

    // OpenAI image/image_urls → 即梦 image_urls（优先级: image > image_urls）
    if fwd.get("image_urls").is_none() {
        let images = collect_image_urls(body, &["image", "image_urls"]);
        if !images.is_empty() {
            fwd["image_urls"] = serde_json::json!(images);
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("image");
    }

    // 清理 OpenAI 特有字段（return_url/logo_info 在轮询阶段的 req_json 中构建）
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("response_format");
        obj.remove("watermark");
    }

    fwd
}

/// 即梦视频请求体构建：OpenAI 格式 → 即梦 CV 格式
fn build_jimeng_video_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut fwd = body.clone();
    fwd["req_key"] = serde_json::json!(model);
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("model");
    }

    // OpenAI duration（秒）→ 即梦 frames（5秒=121帧, 10秒=241帧）
    if fwd.get("frames").is_none() {
        if let Some(dur) = body.get("duration").and_then(|v| v.as_f64()) {
            fwd["frames"] = serde_json::json!(if dur <= 5.0 { 121 } else { 241 });
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("duration");
    }

    // OpenAI ratio/aspect_ratio/size → 即梦 aspect_ratio
    if fwd.get("aspect_ratio").is_none() {
        let ratio = body
            .get("ratio")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("size").and_then(|v| v.as_str()));
        if let Some(r) = ratio {
            fwd["aspect_ratio"] = serde_json::json!(r);
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("ratio");
        // 仅清理 size（aspect_ratio 是即梦原生参数，保留）
        obj.remove("size");
    }

    // OpenAI images/image_urls → 判断数据类型：base64 用 binary_data_base64，URL 用 image_urls
    // 优先级: images > image_urls
    if fwd.get("binary_data_base64").is_none() && fwd.get("image_urls").is_none() {
        let images = collect_image_urls(body, &["images", "image_urls"]);
        if !images.is_empty() {
            // 判断第一个元素是否为 base64 数据
            let is_base64 = images[0].starts_with("data:") || !images[0].starts_with("http");
            if is_base64 {
                // 清理 data URI 前缀，即梦需要纯 base64 数据
                let cleaned: Vec<String> = images
                    .iter()
                    .map(|s| {
                        if let Some(pos) = s.find(",") {
                            s[pos + 1..].to_string()
                        } else {
                            s.clone()
                        }
                    })
                    .collect();
                fwd["binary_data_base64"] = serde_json::json!(cleaned);
            } else {
                fwd["image_urls"] = serde_json::json!(images);
            }
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("images");
    }

    if fwd.get("frames").is_none() {
        fwd["frames"] = serde_json::json!(121);
    }

    // 清理 OpenAI 特有字段（return_url/logo_info 在轮询阶段的 req_json 中构建）
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("response_format");
        obj.remove("watermark");
    }

    fwd
}

/// Bytefor 视频请求体构建：OpenAI 格式 → Bytefor 视频生成格式
fn build_bytefor_video_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut fwd = body.clone();

    // model 字段
    fwd["model"] = serde_json::json!(model);

    // duration 字段
    if let Some(dur_val) = body.get("duration") {
        if let Some(d_str) = dur_val.as_str() {
            let d_clean = d_str.to_lowercase();
            if d_clean.ends_with('s') {
                fwd["duration"] = serde_json::json!(d_clean);
            } else {
                fwd["duration"] = serde_json::json!(format!("{}s", d_clean));
            }
        } else if let Some(d_num) = dur_val.as_i64() {
            fwd["duration"] = serde_json::json!(format!("{}s", d_num));
        } else if let Some(d_f64) = dur_val.as_f64() {
            fwd["duration"] = serde_json::json!(format!("{}s", d_f64));
        }
    } else {
        fwd["duration"] = serde_json::json!("5s");
    }

    // aspectRatio 字段
    if fwd.get("aspectRatio").is_none() {
        let ratio = body
            .get("aspect_ratio")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("size").and_then(|v| v.as_str()));
        if let Some(r) = ratio {
            fwd["aspectRatio"] = serde_json::json!(r);
        } else {
            fwd["aspectRatio"] = serde_json::json!("16:9");
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("aspect_ratio");
        obj.remove("size");
    }

    // resolution 字段
    if fwd.get("resolution").is_none() {
        let res = if let Some(q) = body.get("quality").and_then(|v| v.as_str()) {
            let q_lower = q.to_lowercase();
            if q_lower == "hd" || q_lower == "high" {
                Some("1080P".to_string())
            } else if q_lower == "standard" || q_lower == "fast" {
                Some("720P".to_string())
            } else {
                None
            }
        } else {
            None
        };
        if let Some(r) = res {
            fwd["resolution"] = serde_json::json!(r);
        } else {
            fwd["resolution"] = serde_json::json!("720P");
        }
    } else {
        if let Some(res_str) = fwd["resolution"].as_str() {
            fwd["resolution"] = serde_json::json!(res_str.to_uppercase());
        }
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("quality");
    }

    // referenceMode 字段：优先取 fwd 已有值，fallback 取 body.reference_mode，统一归一化为中文
    let raw_rm = fwd
        .get("referenceMode")
        .and_then(|v| v.as_str())
        .or_else(|| body.get("reference_mode").and_then(|v| v.as_str()));
    if let Some(rm) = raw_rm {
        let final_rm = match rm {
            "all" | "全能" | "全能参考" => "全能参考",
            "subject" | "主体" | "主体参考" => "主体参考",
            other => other,
        };
        fwd["referenceMode"] = serde_json::json!(final_rm);
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("reference_mode");
    }

    // images 字段 (合并图片、视频、音频 URL)
    let mut images = Vec::new();
    images.extend(collect_image_urls(body, &["images", "image_urls"]));
    images.extend(collect_image_urls(body, &["videos"]));
    images.extend(collect_image_urls(body, &["audios"]));
    if !images.is_empty() {
        fwd["images"] = serde_json::json!(images);
    }
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("image_urls");
        obj.remove("videos");
        obj.remove("audios");
    }

    // 清理 OpenAI 特有且 Bytefor 不支持的参数
    if let Some(obj) = fwd.as_object_mut() {
        obj.remove("response_format");
        obj.remove("watermark");
        obj.remove("n");
    }

    fwd
}

// ── 火山引擎 AI MediaKit 插件辅助处理 ──

/// MediaKit：共用 `/enhance-video` 端点时的 tool_version（标准/专业）。
/// 极速(vve-ft)/大模型(vve-gt)走独立路径，不经此映射；字幕擦除同理。
pub fn volc_enhance_tool_version(mid: &str) -> Option<&'static str> {
    match mid {
        "vve-sd" => Some("standard"),
        "vve-pf" => Some("professional"),
        _ => None,
    }
}

#[cfg(feature = "plugin_volcengine_enhance")]
fn build_volcengine_media_enhance_body(model: &str, body: &serde_json::Value) -> serde_json::Value {
    let mut req = serde_json::Map::new();

    // 1. video_url：待处理的输入视频直链 URL (必填参数)
    if let Some(url) = body.get("video_url").and_then(|v| v.as_str()) {
        req.insert("video_url".to_string(), serde_json::json!(url));
    }

    // 2. 模式映射：标准版 / 专业版共用端点时带 tool_version
    if let Some(tv) = volc_enhance_tool_version(model) {
        req.insert("tool_version".to_string(), serde_json::json!(tv));
    }

    // 3. 透传画质增强的其它可选参数 (scene/resolution/fps 等)
    for key in &[
        "scene",
        "resolution",
        "fps",
        "bitrate_level",
        "callback_args",
        "callback_url",
        "client_token",
        "queue_id",
        "mode",
        "output_encode_mode",
        "erase_ratio_location",
    ] {
        if let Some(v) = body.get(*key) {
            req.insert(key.to_string(), v.clone());
        }
    }

    serde_json::Value::Object(req)
}

/// 根据模型的 mid（数据库唯一标识）重构火山引擎画质增强与字幕擦除的实际物理端点路径和轮询地址。
/// 解耦 model_id 频繁变更对网关路由的影响，始终以系统内不可变且唯一的 mid 进行路由映射绑定。
pub fn resolve_volcengine_media_enhance_path(resolved: &mut ResolvedForward, model: &str) {
    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        // 核心依据数据库中必定存在的系统唯一持久 mid 标识
        let mid = resolved.mid.as_deref().unwrap_or("");
        tracing::info!(
            "[VolcEnhance] 网关路径重写解析: mid = '{}', model_id = '{}'",
            mid,
            model
        );

        // vve-sd (标准版), vve-pf (专业版), vve-ft (快速版), vve-gt (生成式版), vvs-er (字幕擦除标准版), vvs-ep (字幕擦除专业版)
        let is_volc_enhance = matches!(
            mid,
            "vve-sd" | "vve-pf" | "vve-ft" | "vve-gt" | "vvs-er" | "vvs-ep"
        );
        if is_volc_enhance {
            let path = match mid {
                "vve-ft" => "/api/v1/tools/enhance-video-fast",
                "vve-gt" => "/api/v1/tools/enhance-video-generative",
                "vvs-ep" => "/api/v1/tools/erase-video-subtitle-pro",
                "vvs-er" => "/api/v1/tools/erase-video-subtitle",
                _ => "/api/v1/tools/enhance-video",
            };
            resolved.upstream_path = path.to_string();
            resolved.target_type = "volcengine_media_enhance".to_string();
            resolved.poll_path = Some("/api/v1/tasks/${task_id}".to_string());
        }
    }
    #[cfg(not(feature = "plugin_volcengine_enhance"))]
    {
        let _ = resolved;
        let _ = model;
    }
}

// ── 统一后处理 content_to_prompt 提取与覆盖辅助 ──

/// 对最终拼装的请求体进行 inplace 修改，当没有定义 prompt 且包含 content 时提取 content 文本字段赋值给 prompt
fn apply_content_to_prompt(result: &mut serde_json::Value) {
    if result.get("prompt").is_none() {
        if let Some(content) = result.get("content") {
            let text_opt = match content {
                serde_json::Value::String(s) => Some(s.clone()),
                serde_json::Value::Array(arr) => arr
                    .iter()
                    .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
                    .next()
                    .map(|t| t.to_string()),
                _ => None,
            };
            if let Some(text) = text_opt {
                result["prompt"] = serde_json::json!(text);
            }
        }
    }
}
