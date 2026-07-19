use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ExtractedFeatures {
    pub has_video: bool,
    pub has_audio: bool,
    /// 请求是否包含参考图（用于区分文生图/图生图计费，如可灵）
    pub has_image_ref: bool,
    pub duration_seconds: Option<f64>,
    pub resolution: Option<String>,
    /// 图片数量（用于按张计费）：请求阶段取 n，响应阶段取实际返回数量
    pub image_count: Option<i32>,
    /// 服务等级（用于离线推理等特定计费，如 flex）
    pub service_tier: Option<String>,
    /// 提示词扩写（DashScope 等图片模型，可能影响计费）
    pub prompt_extend: bool,
    /// 可灵视频生成模式（std/pro/4k），影响计费倍率，默认 std
    pub mode: Option<String>,
    /// 可灵视频有声/无声（on/off），影响计费倍率，默认 off
    pub sound: Option<String>,
    /// Claude 缓存创建 Token 数（来自 usage 提取，合并 5m+1h）
    pub cache_creation: Option<i32>,
    /// 参考图数量（用于腾讯云 Vidu 图片计费区分 ref_1_3 / ref_4_7）
    pub image_ref_count: Option<i32>,
    /// 原始 size 参数（如 "1024x1024"），用于按分辨率像素计费
    pub size: Option<String>,
    /// 画质等级（如 "low"、"medium"、"high"），用于画质倍率计费
    pub quality: Option<String>,
    /// 文本字符数（语音合成按万字符计费）
    pub text_characters: Option<i32>,
    /// 视频帧率（用于画质计费等按分辨率+帧率计费场景）
    pub fps: Option<f64>,
    /// 级联画质增强计费档位（fast|standard，由级联模型 Id 推导），与可灵 mode 解耦
    pub version: Option<String>,
    /// 联网搜索次数（Responses API 联网搜索计费）
    pub web_search: Option<i32>,
}

pub fn extract_request_features(body: &Value) -> ExtractedFeatures {
    let mut has_video = false;
    let mut has_audio = false;
    let mut duration_seconds = None;
    let mut resolution = None;
    let mut prompt_extend = false;

    // Check service tier (支持火山等在根或者parameters内)
    // 腾讯云 OutputConfig.OffPeak=Enabled 映射为 flex
    let service_tier = body
        .get("service_tier")
        .or_else(|| body.get("parameters").and_then(|p| p.get("service_tier")))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .or_else(|| {
            body.get("OutputConfig")
                .and_then(|oc| oc.get("OffPeak"))
                .and_then(|v| v.as_str())
                .filter(|s| s.eq_ignore_ascii_case("Enabled"))
                .map(|_| "flex".to_string())
        });

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
        if b {
            has_audio = true;
        }
    }

    // Check "content" array for Volcengine/OpenAI multimodal requests (chat 接口)
    if let Some(msgs) = body.get("messages").and_then(|m| m.as_array()) {
        for msg in msgs {
            if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
                for item in content {
                    if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                        if t == "video_url" || t == "video" || t.contains("video") {
                            has_video = true;
                        }
                        if t == "input_audio" || t == "audio_url" || t.contains("audio") {
                            has_audio = true;
                        }
                    }
                }
            }
        }
    }

    // 顶层 videos 数组（OpenAI 风格扁平请求格式，如视频生成）
    if body
        .get("videos")
        .and_then(|v| v.as_array())
        .map_or(false, |a| !a.is_empty())
    {
        has_video = true;
    }

    // 顶层 content 数组（火山方舟格式）
    if let Some(content) = body.get("content").and_then(|c| c.as_array()) {
        for item in content {
            if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                if t.contains("video") {
                    has_video = true;
                }
                if t.contains("audio") {
                    has_audio = true;
                }
            }
        }
    }

    // OpenAI Responses API / 火山方舟 response 接口: input[].content[].type 检测音频输入
    if let Some(input_arr) = body.get("input").and_then(|i| i.as_array()) {
        for item in input_arr {
            if let Some(content) = item.get("content").and_then(|c| c.as_array()) {
                for ci in content {
                    if let Some(t) = ci.get("type").and_then(|v| v.as_str()) {
                        if t == "input_audio" || t.contains("audio") {
                            has_audio = true;
                        }
                    }
                }
            }
        }
    }

    // Top-level or final_result nested parameters (兼容视频 GET 两种响应格式)
    let sources = [body as &Value, body.get("final_result").unwrap_or(body)];
    for src in &sources {
        if resolution.is_none() {
            if let Some(res) = src
                .get("resolution")
                .and_then(|r| r.as_str())
                .filter(|s| !s.is_empty())
            {
                resolution = Some(res.to_string());
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
            if let Some(res) = params
                .get("resolution")
                .and_then(|r| r.as_str())
                .filter(|s| !s.is_empty())
            {
                resolution = Some(res.to_string());
            }
        }
        if duration_seconds.is_none() {
            if let Some(dur) = params.get("duration").and_then(|d| d.as_f64()) {
                duration_seconds = Some(dur);
            }
        }
        if params
            .get("prompt_extend")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            prompt_extend = true;
        }
    }

    // 根节点的 prompt_extend (OpenAI 兼容扩展)
    if body
        .get("prompt_extend")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        prompt_extend = true;
    }

    // 视频参数：mode（生成模式）和 sound（有声/无声）
    let mode = body
        .get("mode")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase());
    // 声音优先级：generate_audio（火山方舟布尔开关）> sound（可灵字符串参数）
    let sound = if let Some(ga) = body.get("generate_audio") {
        // generate_audio 优先级最高：布尔值或字符串 "true"/"false" → 覆盖 sound
        let enabled = ga.as_bool().unwrap_or(false) || ga.as_str() == Some("true");
        Some(if enabled {
            "on".to_string()
        } else {
            "off".to_string()
        })
    } else {
        body.get("sound")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase())
    };

    // 检测参考图（用于区分文生图/图生图计费）
    // 支持可灵（image/image_list/subject_image_list/image_reference）、OpenAI 兼容格式（image_urls）及腾讯云（FileInfos）
    let has_image_ref = body.get("image").map_or(false, |v| {
        v.as_str().map_or(false, |s| !s.is_empty())
            || v.is_object()
            || v.as_array().map_or(false, |a| !a.is_empty())
    }) || body
        .get("image_urls")
        .and_then(|v| v.as_array())
        .map_or(false, |a| !a.is_empty())
        || body
            .get("image_list")
            .and_then(|v| v.as_array())
            .map_or(false, |a| !a.is_empty())
        || body
            .get("subject_image_list")
            .and_then(|v| v.as_array())
            .map_or(false, |a| !a.is_empty())
        || body.get("image_reference").map_or(false, |v| !v.is_null())
        || body
            .get("LastFrameUrl")
            .map_or(false, |v| v.as_str().map_or(false, |s| !s.is_empty()))
        || body
            .get("FileInfos")
            .and_then(|v| v.as_array())
            .map_or(false, |a| {
                a.iter().any(|item| {
                    let usage = item.get("Usage").and_then(|u| u.as_str()).unwrap_or("");
                    usage.eq_ignore_ascii_case("FirstFrame")
                        || usage.eq_ignore_ascii_case("LastFrame")
                        || usage.eq_ignore_ascii_case("Reference")
                })
            });

    // 参考图数量（用于腾讯云 Vidu 图片计费维度区分）
    let image_ref_count: Option<i32> = {
        // image 可能是字符串（1张）或数组
        let from_image = body
            .get("image")
            .map(|v| {
                if v.as_str().filter(|s| !s.is_empty()).is_some() {
                    1
                } else if let Some(a) = v.as_array() {
                    a.len() as i32
                } else {
                    0
                }
            })
            .unwrap_or(0);
        let mut count = if from_image > 0 {
            from_image
        } else {
            body.get("images")
                .or(body.get("image_urls"))
                .or(body.get("image_list"))
                .and_then(|v| v.as_array())
                .map(|a| a.len() as i32)
                .unwrap_or(0)
        };
        if count == 0 {
            let mut file_infos_count = body
                .get("FileInfos")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter(|item| {
                            let usage = item.get("Usage").and_then(|u| u.as_str()).unwrap_or("");
                            usage.eq_ignore_ascii_case("FirstFrame")
                                || usage.eq_ignore_ascii_case("LastFrame")
                                || usage.eq_ignore_ascii_case("Reference")
                        })
                        .count() as i32
                })
                .unwrap_or(0);

            if body
                .get("LastFrameUrl")
                .map_or(false, |v| v.as_str().map_or(false, |s| !s.is_empty()))
            {
                file_infos_count += 1;
            }
            count = file_infos_count;
        }
        if count > 0 {
            Some(count)
        } else {
            None
        }
    };

    // DashScope 格式：从 usage 中提取 duration 和 SR（异步任务结果响应）
    // 注意：usage 代表真实的后台消耗，必须无条件覆盖从 input 或 parameters 提取的可能不精确的值
    let mut input_images = None;
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

        // 提取火山图像新模型的 input_images 特征
        if let Some(ii) = usage.get("input_images").and_then(|v| v.as_i64()) {
            input_images = Some(ii as i32);
        }
    }

    // 备用提取：如果根节点或 parameters 里面有 input_images 也可以作为备用提取
    if input_images.is_none() {
        if let Some(ii) = body.get("input_images").and_then(|v| v.as_i64()) {
            input_images = Some(ii as i32);
        } else if let Some(ii) = body
            .get("parameters")
            .and_then(|p| p.get("input_images"))
            .and_then(|v| v.as_i64())
        {
            input_images = Some(ii as i32);
        }
    }

    // DashScope 格式：从 input.media / input.image_url 检测视频/图片输入
    if let Some(input) = body.get("input") {
        if let Some(media) = input.get("media").and_then(|m| m.as_array()) {
            for item in media {
                if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                    if t == "video" {
                        has_video = true;
                    }
                }
            }
        }
    }

    // 腾讯云 OutputConfig.Resolution 提取（PascalCase 参数）
    if resolution.is_none() {
        if let Some(res) = body
            .get("OutputConfig")
            .and_then(|oc| oc.get("Resolution"))
            .and_then(|r| r.as_str())
        {
            resolution = Some(res.to_string());
        }
    }
    // 腾讯云 OutputConfig.Duration 提取
    if duration_seconds.is_none() {
        if let Some(dur) = body
            .get("OutputConfig")
            .and_then(|oc| oc.get("Duration"))
            .and_then(|d| d.as_f64())
        {
            duration_seconds = Some(dur);
        }
    }
    // 兼容即梦等火山引擎视频生成：从真实上游出参中的 frames 精准换算为时长
    if duration_seconds.is_none() {
        if let Some(frames) = body
            .get("frames")
            .and_then(|f| f.as_f64().or_else(|| f.as_i64().map(|i| i as f64)))
        {
            if frames > 0.0 {
                let dur = if (frames - 121.0).abs() < 1e-3 {
                    5.0
                } else if (frames - 241.0).abs() < 1e-3 {
                    10.0
                } else {
                    (frames - 1.0) / 24.0
                };
                duration_seconds = Some(dur);
            }
        }
    }
    // 腾讯云 FileInfos 中包含 Category=Video 且 Usage 是 Reference 的项视为视频输入
    if let Some(fi_arr) = body.get("FileInfos").and_then(|v| v.as_array()) {
        for fi in fi_arr {
            let category = fi.get("Category").and_then(|c| c.as_str());
            let usage = fi.get("Usage").and_then(|u| u.as_str()).unwrap_or("");
            if category == Some("Video") && usage.eq_ignore_ascii_case("Reference") {
                has_video = true;
                break;
            }
        }
    }

    // 分辨率统一转小写，确保与后台计费阶梯匹配一致
    // 阿里返回大写 "720P" → "720p"；腾讯云 "1K" → "1k"；纯数字 "720" → "720p"
    if let Some(ref mut res) = resolution {
        *res = res.to_lowercase().replace("*", "x"); // 统一使用 x 分隔符匹配计费阶梯
                                                     // 纯数字字符串自动加 p 后缀
        if res.chars().all(|c| c.is_ascii_digit()) {
            res.push('p');
        }
    }

    // 图片 size 参数提取（用于按分辨率像素计费）
    // 兼容普通格式以及火山/OpenAI data[0].size 结构
    let size = body
        .get("size")
        .and_then(|v| v.as_str())
        .or_else(|| {
            body.get("data")
                .and_then(|d| d.as_array())
                .and_then(|arr| arr.first())
                .and_then(|item| item.get("size"))
                .and_then(|s| s.as_str())
        })
        .map(|s| s.to_string());

    // 画质等级提取（用于画质倍率计费）
    let quality = body
        .get("quality")
        .and_then(|v| v.as_str())
        .or_else(|| {
            body.get("parameters")
                .and_then(|p| p.get("quality"))
                .and_then(|v| v.as_str())
        })
        .map(|s| s.to_lowercase());

    // 语音合成文本字符数提取：OpenAI input / 火山 req_params.text / 火山旧版 request.text
    let text_characters = body
        .get("input")
        .and_then(|v| v.as_str())
        .or_else(|| {
            body.get("req_params")
                .and_then(|r| r.get("text"))
                .and_then(|v| v.as_str())
        })
        .or_else(|| {
            body.get("request")
                .and_then(|r| r.get("text"))
                .and_then(|v| v.as_str())
        })
        .map(|s| s.chars().count() as i32);

    // 图片生成数量: 从请求体的 n 参数 或腾讯云 OutputConfig.OutputImageCount 提取
    let image_count = body
        .get("n")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            body.get("OutputConfig")
                .and_then(|oc| oc.get("OutputImageCount"))
                .and_then(|v| v.as_i64())
        })
        .map(|v| v.max(1) as i32);

    // 帧率提取：从请求体直接提取 fps 帧率值，用于火山引擎画质增强视频生成等计费场景
    let fps = body.get("fps").and_then(|v| v.as_f64());

    // 级联画质增强版本：从请求体提取（由 video.rs 级联流程注入到 upstream_body）
    let version = body
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase());

    // 严谨修复：若 resolution 依然是 None，且 size 存在，则自适应从 size 中解析出分辨率等级作为兜底（例如将 "2048x1152" 转换为 "2k"），确保同步/流式计费和异步结算保持完全一致的精度
    let mut resolution = resolution;
    if resolution.is_none() {
        if let Some(ref s) = size {
            resolution = parse_pixel_resolution(s);
        }
    }

    // 火山特征规范化：将 input_images 赋值给 image_ref_count
    let mut image_ref_count = image_ref_count;
    let mut has_image_ref = has_image_ref;
    if let Some(ii) = input_images {
        image_ref_count = Some(ii);
        if ii > 0 {
            has_image_ref = true;
        }
    }

    ExtractedFeatures {
        has_video,
        has_audio,
        has_image_ref,
        duration_seconds,
        resolution,
        image_count,
        service_tier,
        prompt_extend,
        mode,
        sound,
        cache_creation: None,
        image_ref_count,
        size,
        quality,
        text_characters,
        fps,
        version,
        web_search: None,
    }
}

impl ExtractedFeatures {
    /// 严谨合并另外一个特征结构体中的字段（用于出参特征与入参特征融合，保障计费一致性）
    pub fn merge(&mut self, other: ExtractedFeatures) {
        if other.duration_seconds.is_some() {
            self.duration_seconds = other.duration_seconds;
        }
        if self.resolution.is_none() {
            self.resolution = other.resolution;
        }
        if self.mode.is_none() {
            self.mode = other.mode;
        }
        if self.sound.is_none() {
            self.sound = other.sound;
        }
        if self.version.is_none() {
            self.version = other.version;
        }
        if other.has_video {
            self.has_video = true;
        }
        if other.has_audio {
            self.has_audio = true;
        }
        if other.has_image_ref {
            self.has_image_ref = true;
        }
        if other.web_search.is_some() {
            self.web_search = other.web_search;
        }
        if other.image_ref_count.is_some() {
            self.image_ref_count = other.image_ref_count;
        }
        if other.size.is_some() {
            self.size = other.size;
        }
        if other.image_count.is_some() {
            self.image_count = other.image_count;
        }
    }
}

impl Default for ExtractedFeatures {
    fn default() -> Self {
        Self {
            has_video: false,
            has_audio: false,
            has_image_ref: false,
            duration_seconds: None,
            resolution: None,
            image_count: None,
            service_tier: None,
            prompt_extend: false,
            mode: None,
            sound: None,
            cache_creation: None,
            image_ref_count: None,
            size: None,
            quality: None,
            text_characters: None,
            fps: None,
            version: None,
            web_search: None,
        }
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
        if line.is_empty() || line.ends_with("[DONE]") {
            continue;
        }
        let json_str = if line.starts_with("data: ") {
            &line[6..]
        } else if line.starts_with("data:") {
            &line[5..]
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

    if accumulated_from_arrays > 0 {
        Some(accumulated_from_arrays)
    } else {
        None
    }
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

    #[inline]
    fn non_empty_str(v: &Value, key: &str) -> bool {
        v.get(key)
            .and_then(|x| x.as_str())
            .is_some_and(|s| !s.is_empty())
    }
    #[inline]
    fn count_url_val(url: &Value) -> i32 {
        if let Some(arr) = url.as_array() {
            arr.iter()
                .filter(|u| u.as_str().is_some_and(|s| !s.is_empty()))
                .count() as i32
        } else if url.as_str().is_some_and(|s| !s.is_empty()) {
            1
        } else {
            0
        }
    }
    #[inline]
    fn has_media(item: &Value) -> bool {
        non_empty_str(item, "b64_json")
            || non_empty_str(item, "image")
            || non_empty_str(item, "url")
    }

    // 1. OpenAI / 火山方舟: { "data": [{"url"|"b64_json"|"image": "..."}, ...] }
    if let Some(data) = v.get("data").and_then(|d| d.as_array()) {
        for item in data {
            let from_url = item.get("url").map(count_url_val).unwrap_or(0);
            if from_url > 0 {
                total_count += from_url;
            } else if non_empty_str(item, "b64_json") || non_empty_str(item, "image") {
                total_count += 1;
            }
        }
    }

    // 2. 异步终态: data.result.images / data.task_result.images / result.images / images
    if total_count == 0 {
        let images_node = v
            .get("data")
            .and_then(|d| d.get("result"))
            .and_then(|r| r.get("images"))
            .or_else(|| {
                v.get("data")
                    .and_then(|d| d.get("task_result"))
                    .and_then(|r| r.get("images"))
            })
            .or_else(|| v.get("result").and_then(|r| r.get("images")))
            .or_else(|| v.get("task_result").and_then(|r| r.get("images")))
            .or_else(|| v.get("images"));
        if let Some(images) = images_node.and_then(|i| i.as_array()) {
            for img in images {
                if let Some(url) = img.get("url") {
                    total_count += count_url_val(url);
                } else if non_empty_str(img, "b64_json") || non_empty_str(img, "image") {
                    total_count += 1;
                }
            }
        }
    }

    // 3. Google Gemini: candidates[].content.parts[]
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
                        } else if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            let md = text.matches("](data:").count() as i32;
                            if md > 0 {
                                total_count += md;
                            } else {
                                for word in text.split_whitespace() {
                                    if word.starts_with("http://") || word.starts_with("https://") {
                                        total_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. DashScope: output.results[]（须含有效媒体字段）
    if total_count == 0 {
        if let Some(results) = v.pointer("/output/results").and_then(|r| r.as_array()) {
            total_count = results.iter().filter(|item| has_media(item)).count() as i32;
        }
    }

    // 5. 即梦: data.image_urls[] / data.binary_data_base64[]
    if total_count == 0 {
        if let Some(arr) = v.pointer("/data/image_urls").and_then(|a| a.as_array()) {
            total_count = arr
                .iter()
                .filter(|item| item.as_str().is_some_and(|s| !s.is_empty()))
                .count() as i32;
        }
    }
    if total_count == 0 {
        if let Some(arr) = v
            .pointer("/data/binary_data_base64")
            .and_then(|a| a.as_array())
        {
            total_count = arr
                .iter()
                .filter(|item| item.as_str().is_some_and(|s| !s.is_empty()))
                .count() as i32;
        }
    }

    if total_count > 0 {
        Some(total_count)
    } else {
        None
    }
}

pub struct UsageTokens {
    pub prompt: i32,
    pub completion: i32,
    pub total: i32,
    /// 缓存命中的 Token 数量（属于 prompt 的子集）
    pub cached: i32,
    /// Claude 缓存创建 Token 数量（5m+1h 合并，不属于 prompt 子集）
    pub cache_creation: i32,
    /// 音频输入 Token 数量（属于 prompt 的子集，用于豆包聊天分离计价）
    pub audio_tokens: i32,
    /// 音频缓存命中 Token 数量（属于 cached 的子集）
    pub audio_cached_tokens: i32,
    /// 图片输入 Token 数量（用于多模态 tokens 分类计价）
    pub image_tokens: i32,
    /// 联网搜索次数
    pub web_search: i32,
}

/// 从 usage JSON 对象提取 token 字段，取大值写入 UsageTokens（初始 0 时等同赋值，
/// SSE 多事件场景防止后续缺失字段覆盖已提取值，如 Anthropic message_start 提供
/// input_tokens、message_delta 提供 output_tokens）
fn apply_usage_max(u: &mut UsageTokens, usage: &Value) {
    // 独立提取两组字段名后取较大值，避免上游同时返回 prompt_tokens=0 和 input_tokens>0
    // 时 or_else 回退链不触发导致漏取（如 gpt-image-2 上游返回 prompt_tokens:0 + input_tokens:1136）
    let p_std = usage
        .get("prompt_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let p_alt = usage
        .get("input_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let img_tokens = usage
        .get("image_tokens")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            usage
                .get("prompt_tokens_details")
                .and_then(|d| d.get("image_tokens"))
                .and_then(|v| v.as_i64())
        })
        .or_else(|| {
            usage
                .get("input_tokens_details")
                .and_then(|d| d.get("image_tokens"))
                .and_then(|v| v.as_i64())
        })
        .unwrap_or(0) as i32;
    let p = p_std.max(p_alt);

    let c_std = usage
        .get("completion_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let c_alt = usage
        .get("output_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let c = c_std.max(c_alt);
    if p > u.prompt {
        u.prompt = p;
    }
    if c > u.completion {
        u.completion = c;
    }
    if img_tokens > u.image_tokens {
        u.image_tokens = img_tokens;
    }
    let t = usage
        .get("total_tokens")
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    if t > u.total {
        u.total = t;
    }
    // 独立提取两组详情中的缓存 token 后取较大值，避免 prompt_tokens_details 存在但不含
    // cached_tokens 时 or_else 不回退到 input_tokens_details 的问题（与 prompt/input 同理）
    let cached_std = usage
        .get("prompt_tokens_details")
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let cached_alt = usage
        .get("input_tokens_details")
        .and_then(|d| d.get("cached_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let cached = cached_std.max(cached_alt);
    if cached > u.cached {
        u.cached = cached;
    }
    // 提取音频输入 token（兼容 prompt_tokens_details / input_tokens_details 两种命名）
    let audio_std = usage
        .get("prompt_tokens_details")
        .and_then(|d| d.get("audio_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let audio_alt = usage
        .get("input_tokens_details")
        .and_then(|d| d.get("audio_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let audio = audio_std.max(audio_alt);
    if audio > u.audio_tokens {
        u.audio_tokens = audio;
    }
    // 提取音频缓存命中 token
    let audio_cached_std = usage
        .get("prompt_tokens_details")
        .and_then(|d| d.get("audio_cached_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let audio_cached_alt = usage
        .get("input_tokens_details")
        .and_then(|d| d.get("audio_cached_tokens"))
        .and_then(|val| val.as_i64())
        .unwrap_or(0) as i32;
    let audio_cached = audio_cached_std.max(audio_cached_alt);
    if audio_cached > u.audio_cached_tokens {
        u.audio_cached_tokens = audio_cached;
    }
    // Claude 缓存创建（APImart: 5m+1h 合并，兜底: Claude 原生 cache_creation_input_tokens）
    let cc_5m = usage
        .get("claude_cache_creation_5_m_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let cc_1h = usage
        .get("claude_cache_creation_1_h_tokens")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let cc = if cc_5m + cc_1h > 0 {
        (cc_5m + cc_1h) as i32
    } else {
        usage
            .get("cache_creation_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32
    };
    if cc > u.cache_creation {
        u.cache_creation = cc;
    }
    // Claude 缓存读取兜底（Claude 原生 cache_read_input_tokens）
    if u.cached == 0 {
        u.cached = usage
            .get("cache_read_input_tokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;
    }
    // 联网搜索次数提取（Responses API 等）
    let ws = usage
        .get("tool_usage")
        .and_then(|t| t.get("web_search"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    if ws > u.web_search {
        u.web_search = ws;
    }
}

pub fn parse_usage(response: &str) -> UsageTokens {
    let mut u = UsageTokens {
        prompt: 0,
        completion: 0,
        total: 0,
        cached: 0,
        cache_creation: 0,
        audio_tokens: 0,
        audio_cached_tokens: 0,
        image_tokens: 0,
        web_search: 0,
    };

    let mut extract_from_value = |v: &Value| -> bool {
        let mut found = false;
        // 1. OpenAI / Volcengine / Anthropic（根级 usage）
        if let Some(usage) = v.get("usage") {
            apply_usage_max(&mut u, usage);
            found = true;
        }
        // 1b. Anthropic message_start：usage 嵌套在 message 对象内
        if let Some(usage) = v.get("message").and_then(|m| m.get("usage")) {
            apply_usage_max(&mut u, usage);
            found = true;
        }
        // 1c. Responses API (response.completed)：usage 嵌套在 response 对象内
        if let Some(usage) = v.get("response").and_then(|r| r.get("usage")) {
            apply_usage_max(&mut u, usage);
            found = true;
        }
        // 2. Google Gemini
        if let Some(usage) = v.get("usageMetadata") {
            u.prompt = usage
                .get("promptTokenCount")
                .and_then(|val| val.as_i64())
                .unwrap_or(0) as i32;
            let total = usage
                .get("totalTokenCount")
                .and_then(|val| val.as_i64())
                .unwrap_or(0) as i32;
            u.total = total;
            u.completion = if total >= u.prompt {
                total - u.prompt
            } else {
                0
            };
            u.cached = usage
                .get("cachedContentTokenCount")
                .and_then(|val| val.as_i64())
                .unwrap_or(0) as i32;
            found = true;
        }
        // 3. Volcengine Video (final_result.usage)
        if let Some(fr) = v.get("final_result") {
            if let Some(usage) = fr.get("usage") {
                apply_usage_max(&mut u, usage);
                found = true;
            }
        }
        // 4. 包裹格式: { code, data: { usage: {...} } }
        if !found {
            if let Some(usage) = v.get("data").and_then(|d| d.get("usage")) {
                apply_usage_max(&mut u, usage);
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
            if line.is_empty() || line.ends_with("[DONE]") {
                continue;
            }

            let json_str = if line.starts_with("data: ") {
                &line[6..]
            } else if line.starts_with("data:") {
                &line[5..]
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
        // Responses API: response.usage
        if let Some(usage) = v.get("response").and_then(|r| r.get("usage")) {
            return Some(serde_json::json!({ "usage": usage }).to_string());
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
            if line.is_empty() || line.ends_with("[DONE]") {
                continue;
            }

            let json_str = if line.starts_with("data: ") {
                &line[6..]
            } else if line.starts_with("data:") {
                &line[5..]
            } else {
                line
            };

            if let Ok(v) = serde_json::from_str::<Value>(json_str) {
                if let Some(usage) = v.get("usage") {
                    last_usage_json = Some(serde_json::json!({ "usage": usage }).to_string());
                } else if let Some(usage) = v.get("response").and_then(|r| r.get("usage")) {
                    last_usage_json = Some(serde_json::json!({ "usage": usage }).to_string());
                } else if let Some(usage) = v.get("usageMetadata") {
                    last_usage_json =
                        Some(serde_json::json!({ "usageMetadata": usage }).to_string());
                }
            }
        }
        if last_usage_json.is_some() {
            return last_usage_json;
        }
    }
    None
}

/// 从可灵视频终态响应中提取实际生成时长（秒）。
/// 路径: data.task_result.videos[0].duration（字符串，如 "5.1"）
pub fn extract_kling_video_duration(resp: &Value) -> Option<f64> {
    resp.get("data")
        .and_then(|d| d.get("task_result"))
        .and_then(|r| r.get("videos"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| {
            v.get("duration").and_then(|d| {
                d.as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .or_else(|| d.as_f64())
            })
        })
}

/// 从腾讯云 VOD DescribeTaskDetail 终态响应中提取实际视频时长（秒）。
/// 路径: Response.AigcVideoTask.Output.FileInfos[0].Duration
pub fn extract_tencent_vod_video_duration(resp: &Value) -> Option<f64> {
    let response = resp.get("Response")?;
    let task = response.get("AigcVideoTask")?;
    // 1. Output.FileInfos[0].MetaData.Duration — 部分模型可能在输出中返回
    if let Some(d) = task
        .pointer("/Output/FileInfos/0/MetaData/Duration")
        .and_then(parse_duration_value)
    {
        return Some(d);
    }
    None
}
/// 解析 Duration 值（支持整数、浮点数、字符串格式）
fn parse_duration_value(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_i64().map(|i| i as f64))
        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
}

/// 从像素尺寸字符串识别分辨率等级（从 forward.rs 移入本特征提取模块）。
/// 支持像素格式（如 "1024x1024"、"2048×1536"）和已有的等级格式（如 "1k"、"2k"、"4k"）。
/// 按最小边长严格判定区间（图片质量由短边决定）：
///   - ≤1024  → "1k"（标准，如 512x512, 1024x1024, 2048x1024）
///   - ≤2048  → "2k"（高清，如 2048x1536, 2048x2048）
///   - >2048  → "4k"（超高清，如 3840x2160, 4096x2304）
/// 比例格式（如 "1:1"）和无法解析的输入返回 None。
pub fn parse_pixel_resolution(size: &str) -> Option<String> {
    let s = size.trim().to_lowercase();
    // 已经是分辨率等级格式，直接返回其小写
    if s.ends_with('k') {
        return Some(s);
    }
    // 比例格式（含 ':'）不属于像素分辨率，返回 None
    if s.contains(':') {
        return None;
    }
    // 解析像素尺寸：支持 x、*、× (Unicode 乘号) 分隔符
    let (w_str, h_str) = s
        .split_once('x')
        .or_else(|| s.split_once('*'))
        .or_else(|| s.split_once('×'))?;
    let w = w_str.trim().parse::<u32>().ok()?;
    let h = h_str.trim().parse::<u32>().ok()?;
    let min_edge = w.min(h);
    // 按最小边长判定分辨率等级区间
    Some(if min_edge <= 1024 {
        "1k".to_string()
    } else if min_edge <= 2048 {
        "2k".to_string()
    } else {
        "4k".to_string() // >2048 统一归为 4k
    })
}
