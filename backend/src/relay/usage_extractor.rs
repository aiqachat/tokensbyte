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

    // Other top-level parameters
    if let Some(res) = body.get("resolution").and_then(|r| r.as_str()) {
        resolution = Some(res.to_string());
    }
    if let Some(size) = body.get("size").and_then(|s| s.as_str()) {
        resolution = Some(size.to_string());
    }
    if let Some(dur) = body.get("duration").and_then(|d| d.as_f64()) {
        duration_seconds = Some(dur);
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
    let v: Value = match serde_json::from_str(response) {
        Ok(v) => v,
        Err(_) => return u,
    };
    
    // 1. OpenAI / Volcengine Chat / Image (Seedream)
    if let Some(usage) = v.get("usage") {
        u.prompt = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        u.completion = usage.get("completion_tokens")
            .or_else(|| usage.get("output_tokens"))
            .and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        u.total = usage.get("total_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    }
    
    // 2. Google Gemini
    if let Some(usage) = v.get("usageMetadata") {
        u.prompt = usage.get("promptTokenCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        u.completion = usage.get("candidatesTokenCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        u.total = usage.get("totalTokenCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    }
    
    // 3. Volcengine Video (final_result.usage)
    if let Some(fr) = v.get("final_result") {
        if let Some(usage) = fr.get("usage") {
             u.prompt = usage.get("prompt_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
             u.completion = usage.get("completion_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
             u.total = usage.get("total_tokens").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        }
    }
    
    if u.total == 0 {
        u.total = u.prompt + u.completion;
    }
    
    u
}
