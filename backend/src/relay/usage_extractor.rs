use serde_json::Value;

#[derive(Debug, Clone)]
pub struct ExtractedFeatures {
    pub has_video: bool,
    pub has_audio: bool,
    pub duration_seconds: Option<f64>,
    pub resolution: Option<String>,
}

pub fn extract_request_features(body: &Value) -> ExtractedFeatures {
    let mut has_video = false;
    let mut has_audio = false;
    let mut duration_seconds = None;
    let mut resolution = None;

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

    ExtractedFeatures {
        has_video,
        has_audio,
        duration_seconds,
        resolution,
    }
}

pub struct UsageTokens {
    pub prompt: i32,
    pub completion: i32,
    pub total: i32,
}

pub fn parse_usage(response: &str) -> UsageTokens {
    let mut u = UsageTokens { prompt: 0, completion: 0, total: 0 };
    
    let mut extract_from_value = |v: &Value| -> bool {
        let mut found = false;
        // 1. OpenAI / Volcengine Chat / Image (Seedream)
        if let Some(usage) = v.get("usage") {
            u.prompt = usage.get("prompt_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            u.completion = usage.get("completion_tokens")
                .or_else(|| usage.get("output_tokens"))
                .and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            u.total = usage.get("total_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            found = true;
        }
        // 2. Google Gemini
        if let Some(usage) = v.get("usageMetadata") {
            u.prompt = usage.get("promptTokenCount").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            let total = usage.get("totalTokenCount").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
            u.total = total;
            u.completion = if total >= u.prompt { total - u.prompt } else { 0 };
            found = true;
        }
        // 3. Volcengine Video (final_result.usage)
        if let Some(fr) = v.get("final_result") {
            if let Some(usage) = fr.get("usage") {
                 u.prompt = usage.get("prompt_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                 u.completion = usage.get("completion_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
                 u.total = usage.get("total_tokens").and_then(|val| val.as_i64()).unwrap_or(0) as i32;
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
        if v.get("usage").is_some() || v.get("usageMetadata").is_some() || v.get("final_result").and_then(|fr| fr.get("usage")).is_some() {
            return Some(response.to_string());
        }
    } else {
        // SSE 模式下，寻找最后一条包含 usage 字段的 chunk
        let mut last_usage_chunk = None;
        for line in response.lines() {
            let line = line.trim();
            if line.is_empty() || line.ends_with("[DONE]") { continue; }

            let json_str = if line.starts_with("data: ") {
                &line[6..]
            } else {
                line
            };
            
            if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                if v.get("usage").is_some() || v.get("usageMetadata").is_some() {
                    last_usage_chunk = Some(v.to_string());
                }
            }
        }
        if last_usage_chunk.is_some() {
            return last_usage_chunk;
        }
    }
    None
}
