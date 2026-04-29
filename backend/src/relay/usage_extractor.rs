use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ExtractedFeatures {
    pub has_video: bool,
    pub has_audio: bool,
    pub duration_seconds: Option<f64>,
    pub resolution: Option<String>,
    /// 图片数量（用于按张计费）：请求阶段取 n，响应阶段取实际返回数量
    pub image_count: Option<i32>,
    /// 服务等级（用于离线推理等特定计费，如 flex）
    pub service_tier: Option<String>,
    /// 提示词扩写（DashScope 等图片模型，可能影响计费）
    pub prompt_extend: bool,
}

pub fn extract_request_features(body: &Value) -> ExtractedFeatures {
    let mut has_video = false;
    let mut has_audio = false;
    let mut duration_seconds = None;
    let mut resolution = None;
    let mut prompt_extend = false;

    // Check service tier (支持火山等在根或者parameters内)
    let service_tier = body.get("service_tier")
        .or_else(|| body.get("parameters").and_then(|p| p.get("service_tier")))
        .and_then(|v| v.as_str().map(|s| s.to_string()));

    // Check OpenAI modalities: ["audio", ...]
    if let Some(mods) = body.get("modalities").and_then(|m| m.as_array()) {
        for m in mods {
            if m.as_str() == Some("audio") {
                has_audio = true;
            }
        }
    }

    // Volcengine generate_audio flag
    if let Some(b) = body.get("generate_audio").and_then(|v| v.as_bool()) {
        if b { has_audio = true; }
    }

    // Check "content" array for Volcengine/OpenAI multimodal requests
    if let Some(msgs) = body.get("messages").and_then(|m| m.as_array()) {
        for msg in msgs {
            if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
                for item in content {
                    if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                        if t == "video_url" || t == "video" || t.contains("video") { has_video = true; }
                        if t == "audio_url" || t.contains("audio") { has_audio = true; }
                    }
                }
            }
        }
    }

    // 顶层 videos 数组（OpenAI 风格扁平请求格式，如视频生成）
    if body.get("videos").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty()) {
        has_video = true;
    }

    // 顶层 content 数组（火山方舟格式）
    if let Some(content) = body.get("content").and_then(|c| c.as_array()) {
        for item in content {
            if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                if t.contains("video") { has_video = true; }
                if t.contains("audio") { has_audio = true; }
            }
        }
    }

    // Top-level or final_result nested parameters (兼容视频 GET 两种响应格式)
    let sources = [body as &Value, body.get("final_result").unwrap_or(body)];
    for src in &sources {
        if resolution.is_none() {
            if let Some(res) = src.get("resolution").and_then(|r| r.as_str()) {
                resolution = Some(res.to_string());
            }
        }
        if resolution.is_none() {
            if let Some(size) = src.get("size").and_then(|s| s.as_str()) {
                resolution = Some(size.to_string());
            }
        }
        if duration_seconds.is_none() {
            if let Some(dur) = src.get("duration").and_then(|d| d.as_f64()) {
                duration_seconds = Some(dur);
            }
        }
    }

    // DashScope 格式：从 parameters 内提取 resolution/duration
    if let Some(params) = body.get("parameters") {
        if resolution.is_none() {
            if let Some(res) = params.get("resolution").and_then(|r| r.as_str()) {
                resolution = Some(res.to_string());
            }
        }
        if duration_seconds.is_none() {
            if let Some(dur) = params.get("duration").and_then(|d| d.as_f64()) {
                duration_seconds = Some(dur);
            }
        }
        if params.get("prompt_extend").and_then(|v| v.as_bool()).unwrap_or(false) {
            prompt_extend = true;
        }
    }

    // 根节点的 prompt_extend (OpenAI 兼容扩展)
    if body.get("prompt_extend").and_then(|v| v.as_bool()).unwrap_or(false) {
        prompt_extend = true;
    }

    // DashScope 格式：从 usage 中提取 duration 和 SR（异步任务结果响应）
    // 注意：usage 代表真实的后台消耗，必须无条件覆盖从 input 或 parameters 提取的可能不精确的值
    if let Some(usage) = body.get("usage") {
        if let Some(dur) = usage.get("duration").and_then(|d| d.as_f64()) {
            duration_seconds = Some(dur);
        }
        
        // SR 可能是纯数字（如 720）或字符串（如 "720P"）
        if let Some(sr) = usage.get("SR") {
            if let Some(n) = sr.as_i64() {
                resolution = Some(format!("{}p", n));
            } else if let Some(s) = sr.as_str() {
                resolution = Some(s.to_string());
            }
        }
    }

    // DashScope 格式：从 input.media / input.image_url 检测视频/图片输入
    if let Some(input) = body.get("input") {
        if let Some(media) = input.get("media").and_then(|m| m.as_array()) {
            for item in media {
                if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                    if t == "video" { has_video = true; }
                }
            }
        }
    }

    // 分辨率统一转小写，确保与后台计费阶梯匹配一致
    // 阿里返回大写 "720P" → "720p"；纯数字 "720" → "720p"
    if let Some(ref mut res) = resolution {
        *res = res.to_lowercase().replace("*", "x"); // 统一使用 x 分隔符匹配计费阶梯
        // 纯数字字符串自动加 p 后缀
        if res.chars().all(|c| c.is_ascii_digit()) {
            res.push('p');
        }
    }

    // 图片生成数量: 从请求体的 n 参数提取（用于预扣费阶段）
    let image_count = body.get("n")
        .and_then(|v| v.as_i64())
        .map(|v| v.max(1) as i32);

    ExtractedFeatures {
        has_video,
        has_audio,
        duration_seconds,
        resolution,
        image_count,
        service_tier,
        prompt_extend,
    }
}

/// 从接口响应中提取实际返回的图片数量。
/// 支持 OpenAI/火山方舟 `data` 数组、Google Gemini `candidates.content.parts` 中的图片，
/// 以及 SSE 流式缓冲后的文本（逐行解析 `data: {...}` 提取图片数组）。
/// 返回 None 表示响应中无法识别图片数组（非图片类接口）。
pub fn count_response_images(response: &str) -> Option<i32> {
    // 尝试整体 JSON 解析（非流式响应）
    if let Ok(v) = serde_json::from_str::<Value>(response) {
        if let Some(count) = count_images_from_value(&v) {
            return Some(count);
        }
    }

    // SSE 流式缓冲回落：逐行解析 data: {...} 中的图片数量
    let mut accumulated_from_arrays = 0i32;
    let mut usage_total: Option<i32> = None;

    for line in response.lines() {
        let line = line.trim();
        if line.is_empty() || line.ends_with("[DONE]") { continue; }
        let json_str = if line.starts_with("data: ") {
            &line[6..]
        } else {
            line
        };
        
        if let Ok(v) = serde_json::from_str::<Value>(json_str) {
            // 优先检查流中是否包含官方明确的总计数量字段（如火山方舟/阿里百炼）
            if let Some(usage) = v.get("usage") {
                if let Some(c) = usage.get("generated_images").and_then(|c| c.as_i64()) {
                    usage_total = Some(c as i32);
                } else if let Some(c) = usage.get("image_count").and_then(|c| c.as_i64()) {
                    usage_total = Some(c as i32);
                }
            }
            
            // 累加数组中的实体数
            if let Some(count) = count_images_from_arrays(&v) {
                accumulated_from_arrays += count;
            }
        }
    }
    
    // 如果流式数据中包含 usage 统计总数，则优先使用该总数（通常流的最后一条包含准确总计）
    if usage_total.is_some() {
        return usage_total;
    }
    
    if accumulated_from_arrays > 0 { Some(accumulated_from_arrays) } else { None }
}

/// 从单个 JSON Value 中提取图片数量
fn count_images_from_value(v: &Value) -> Option<i32> {
    // 首先尝试从官方明确的 usage 字段获取总数
    if let Some(usage) = v.get("usage") {
        if let Some(c) = usage.get("generated_images").and_then(|c| c.as_i64()) {
            return Some(c as i32);
        } else if let Some(c) = usage.get("image_count").and_then(|c| c.as_i64()) {
            return Some(c as i32);
        }
    }
    count_images_from_arrays(v)
}

/// 内部辅助函数：深度遍历各种嵌套的 data/results 数组结构提取数量
fn count_images_from_arrays(v: &Value) -> Option<i32> {
    let mut total_count = 0i32;

    // 1. 处理标准的 OpenAI / 火山方舟格式: { "data": [{"url": "..."}, ...] }
    // 兼容逻辑：如果 url 本身是数组（某些渠道会把 4 宫格塞在一个 url 数组里），则按数组长度计费
    if let Some(data) = v.get("data").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(url) = item.get("url") {
                if let Some(arr) = url.as_array() {
                    total_count += arr.len() as i32;
                } else {
                    total_count += 1;
                }
            } else if item.is_object() {
                // 如果 data 数组里的项没有 url 字段但它是对象，也算 1 张（兜底同步成功）
                total_count += 1;
            }
        }
    }

    // 2. 针对异步任务终态结果深度解析 (兼容用户提供的 data.result.images 结构)
    if total_count == 0 {
        let images_node = v.get("data").and_then(|d| d.get("result")).and_then(|r| r.get("images"))
            .or_else(|| v.get("result").and_then(|r| r.get("images")))
            .or_else(|| v.get("images")); // 各种厂商可能的嵌套结构兜底
            
        if let Some(images) = images_node.and_then(|i| i.as_array()) {
            for img in images {
                if let Some(url) = img.get("url") {
                    if let Some(arr) = url.as_array() {
                        total_count += arr.len() as i32;
                    } else {
                        total_count += 1;
                    }
                } else {
                    total_count += 1;
                }
            }
        }
    }

    // 3. Google Gemini: candidates[].content.parts[] 中含 inline_data 的图片
    if total_count == 0 {
        if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
            for candidate in candidates {
                if let Some(parts) = candidate
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if part.get("inline_data").is_some() || part.get("inlineData").is_some() {
                            total_count += 1;
                        }
                    }
                }
            }
        }
    }

    // 4. DashScope 格式 (output.results 数组)
    if total_count == 0 {
        if let Some(output) = v.get("output") {
            if let Some(results) = output.get("results").and_then(|r| r.as_array()) {
                total_count = results.len() as i32;
            }
        }
    }

    if total_count > 0 { Some(total_count) } else { None }
}

pub struct UsageTokens {
    pub prompt: i32,
    pub completion: i32,
    pub total: i32,
    /// 缓存命中的 Token 数量（属于 prompt 的子集）
    pub cached: i32,
}

pub fn parse_usage(response: &str) -> UsageTokens {
    let mut u = UsageTokens { prompt: 0, completion: 0, total: 0, cached: 0 };
    
    let mut extract_from_value = |v: &Value| -> bool {
        let mut found = false;
        // 1. OpenAI / Volcengine Chat / Image (Seedream)
        if let Some(usage) = v.get("usage") {
            u.prompt = usage.get("prompt_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            u.completion = usage.get("completion_tokens")
                .or_else(|| usage.get("output_tokens"))
                .and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            
            // DashScope 额外字段兼容：image_count -> completion
            if let Some(count) = usage.get("image_count").and_then(|v| v.as_i64()) {
                u.completion = count as i32;
            }

            u.total = usage.get("total_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            // OpenAI cached_tokens: usage.prompt_tokens_details.cached_tokens
            u.cached = usage.get("prompt_tokens_details")
                .and_then(|d| d.get("cached_tokens"))
                .and_then(|val| val.as_i64())
                .unwrap_or(0) as i32;
            found = true;
        }
        // 2. Google Gemini
        if let Some(usage) = v.get("usageMetadata") {
            u.prompt = usage.get("promptTokenCount").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            let total = usage.get("totalTokenCount").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            u.total = total;
            u.completion = if total >= u.prompt { total - u.prompt } else { 0 };
            // Gemini cached: usageMetadata.cachedContentTokenCount
            u.cached = usage.get("cachedContentTokenCount").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            found = true;
        }
        // 3. Volcengine Video (final_result.usage)
        if let Some(fr) = v.get("final_result") {
            if let Some(usage) = fr.get("usage") {
                 u.prompt = usage.get("prompt_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                 u.completion = usage.get("completion_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                 u.total = usage.get("total_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                 u.cached = usage.get("prompt_tokens_details")
                     .and_then(|d| d.get("cached_tokens"))
                     .and_then(|val| val.as_i64())
                     .unwrap_or(0) as i32;
                 found = true;
            }
        }
        // 4. 包裹格式: { code, data: { usage: {...} } }
        if !found {
            if let Some(usage) = v.get("data").and_then(|d| d.get("usage")) {
                u.prompt = usage.get("prompt_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                u.completion = usage.get("completion_tokens")
                    .or_else(|| usage.get("output_tokens"))
                    .and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                u.total = usage.get("total_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                u.cached = usage.get("prompt_tokens_details")
                    .and_then(|d| d.get("cached_tokens"))
                    .and_then(|val| val.as_i64())
                    .unwrap_or(0) as i32;
                found = true;
            }
        }
        found
    };

    if let Ok(v) = serde_json::from_str::<Value>(response) {
        extract_from_value(&v);
    } else {
        // SSE流的情况下按行解析（兼容有无 data: 前缀的情况）
        for line in response.lines() {
            let line = line.trim();
            if line.is_empty() || line.ends_with("[DONE]") { continue; }
            
            let json_str = if line.starts_with("data: ") {
                &line[6..]
            } else {
                line
            };
            
            if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                extract_from_value(&v);
            }
        }
    }
    
    if u.total == 0 {
        u.total = u.prompt + u.completion;
    }
    
    u
}

pub fn extract_usage_json_string(response: &str) -> Option<String> {
    if let Ok(v) = serde_json::from_str::<Value>(response) {
        // 仅提取 usage 节点，不返回完整响应体（避免存入 choices 等大量聊天内容）
        if let Some(usage) = v.get("usage") {
            return Some(serde_json::json!({ "usage": usage }).to_string());
        }
        if let Some(usage) = v.get("usageMetadata") {
            return Some(serde_json::json!({ "usageMetadata": usage }).to_string());
        }
        if let Some(usage) = v.get("final_result").and_then(|fr| fr.get("usage")) {
            return Some(serde_json::json!({ "final_result": { "usage": usage } }).to_string());
        }
        // 包裹格式: { code, data: { usage: {...} } }
        if let Some(usage) = v.get("data").and_then(|d| d.get("usage")) {
            return Some(serde_json::json!({ "usage": usage }).to_string());
        }
    } else {
        // SSE 模式下，寻找最后一条包含 usage 字段的 chunk，仅提取 usage 部分
        let mut last_usage_json = None;
        for line in response.lines() {
            let line = line.trim();
            if line.is_empty() || line.ends_with("[DONE]") { continue; }

            let json_str = if line.starts_with("data: ") {
                &line[6..]
            } else {
                line
            };
            
            if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                if let Some(usage) = v.get("usage") {
                    last_usage_json = Some(serde_json::json!({ "usage": usage }).to_string());
                } else if let Some(usage) = v.get("usageMetadata") {
                    last_usage_json = Some(serde_json::json!({ "usageMetadata": usage }).to_string());
                }
            }
        }
        if last_usage_json.is_some() {
            return last_usage_json;
        }
    }
    None
}
