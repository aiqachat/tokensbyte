#[cfg(feature = "commercial_plugins")]
pub mod asset_convert;
pub mod billing_pipeline;
pub mod channel_quota;
pub mod forward;
pub mod ha;
pub mod image;
pub mod native;
pub mod proxy;
pub mod quota_memory;
pub mod router;
pub mod stream;
pub mod task;
pub mod token_quota;
pub mod url_utils;
pub mod usage_extractor;
pub mod usage_stats;
pub mod video;

#[cfg(not(feature = "commercial_plugins"))]
pub mod asset_convert {
    use crate::AppState;
    pub async fn convert_content_urls(
        _state: &AppState,
        _user_id: &str,
        _plugin_ns: &str,
        _body: &mut serde_json::Value,
        _moderation: bool,
    ) -> (Vec<String>, Vec<String>) {
        (Vec::new(), Vec::new())
    }
}
pub mod audio;
pub mod balance;
pub mod chat;
pub mod generic;
pub mod model_list;
pub mod response_formatter;
pub mod tos_persist;

use std::sync::OnceLock;
use std::sync::RwLock;
use std::time::{Duration, Instant};

struct ConfigCache {
    pub timezone: String,
    pub ha_channel_enabled: bool,
    pub last_update: Instant,
}

static CONFIG_CACHE: OnceLock<RwLock<Option<ConfigCache>>> = OnceLock::new();

fn get_config_cache() -> &'static RwLock<Option<ConfigCache>> {
    CONFIG_CACHE.get_or_init(|| RwLock::new(None))
}

/// 高可用配置与时区缓存（单槽 + 60s TTL，体积固定，过期后下次读覆盖写入，无增长风险）
pub async fn get_cached_config(state: &crate::AppState) -> (String, bool) {
    let cache_lock = get_config_cache();
    let now = Instant::now();

    if let Ok(guard) = cache_lock.read() {
        if let Some(ref cache) = *guard {
            if now.duration_since(cache.last_update) < Duration::from_secs(60) {
                return (cache.timezone.clone(), cache.ha_channel_enabled);
            }
        }
    }

    // 缓存失效，查库加载
    let site_settings_val: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'site_settings'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    let tz = site_settings_val
        .and_then(|v| serde_json::from_str::<crate::models::SiteSettings>(&v).ok())
        .map(|s| s.default_timezone)
        .unwrap_or_else(|| "Asia/Shanghai".to_string());

    let ha_enabled: Option<i64> =
        sqlx::query_scalar(&state.db.format_query(
            "SELECT is_enabled FROM plugins WHERE name = 'high_availability_channel'",
        ))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let ha = ha_enabled.unwrap_or(0) == 1;

    if let Ok(mut guard) = cache_lock.write() {
        *guard = Some(ConfigCache {
            timezone: tz.clone(),
            ha_channel_enabled: ha,
            last_update: now,
        });
    }

    (tz, ha)
}

/// 底座费用 × res_mul；倍率为 1 时原样返回（无 token 时的时长等计费兜底）
pub fn scale_cost_by_res_mul(
    cost: f64,
    detail: String,
    map: &std::collections::HashMap<String, f64>,
    resolution: &str,
) -> (f64, String) {
    let mult = forward::lookup_res_mul(map, resolution);
    if (mult - 1.0).abs() <= 1e-9 {
        return (cost, detail);
    }
    let factor = format!(" * {:.2}倍(级联res_mul:{})", mult, resolution);
    let detail = match detail.find(" | ") {
        Some(idx) => format!("{}{}{}", &detail[..idx], factor, &detail[idx..]),
        None => format!("{}{}", detail, factor),
    };
    (cost * mult, detail)
}

/// 计算最终的消费金额和计费详情文本（包含后置时间段倍率折算，解耦高可用插件并提炼冗余逻辑）
pub async fn calculate_relay_cost(
    state: &crate::AppState,
    db_model: Option<&crate::models::Model>,
    db_rule: Option<&mut crate::models::BillingRule>,
    channel: &crate::models::Channel,
    user_discount: f64,
    user_model_discounts: &Option<String>,
    usage: &usage_extractor::UsageTokens,
    features: &usage_extractor::ExtractedFeatures,
    mapping_source: Option<&str>,
    model_name: &str,
    resolved_model: &str,
) -> (f64, String) {
    let (timezone, is_ha_enabled) = get_cached_config(state).await;

    let umd = db_model
        .and_then(|m| crate::relay::proxy::parse_user_model_discount(user_model_discounts, &m.mid));
    let (final_discount, discount_source) =
        crate::relay::proxy::resolve_discount(db_model, user_discount, umd);

    let applied_discount = if is_ha_enabled {
        final_discount * channel.rate
    } else {
        final_discount
    };

    let (mut cost, mut detail) = compute_cost(
        db_model,
        db_rule.as_deref(),
        usage,
        applied_discount,
        features,
    );

    // 将折扣名字直接融合进 {:.2}倍率 描述中
    let discount_target = format!("{:.2}倍率", applied_discount);
    let discount_replace = format!("{:.2}倍率({})", applied_discount, discount_source);
    detail = detail.replace(&discount_target, &discount_replace);

    // 后置时间段倍率折算（保留原单价，在结算最终价格后应用时间倍率）
    if let Some(rule) = db_rule {
        let time_multiplier = rule.get_current_multiplier(&timezone);
        if (time_multiplier - 1.0).abs() > 0.00001 {
            if !rule.is_multiplier_applied {
                cost *= time_multiplier;
                rule.is_multiplier_applied = true; // 状态更新防重复计算
            }
            detail = format!("{} * {:.2}倍(时段倍率)", detail, time_multiplier);
        }
    }
    if is_ha_enabled && channel.rate != 1.0 {
        detail = format!("{} * {:.2}倍(渠道倍率)", detail, channel.rate);
    }
    if let Some(src) = mapping_source {
        detail.push_str(&format!(" | {}: {} ➞ {}", src, model_name, resolved_model));
    }

    (cost, detail)
}

/// 统一计费逻辑
pub fn compute_cost(
    _db_model: Option<&crate::models::Model>,
    db_rule: Option<&crate::models::BillingRule>,
    usage: &usage_extractor::UsageTokens,
    discount: f64,
    features: &usage_extractor::ExtractedFeatures,
) -> (f64, String) {
    // 从 UsageTokens 解构所需字段（简化后续计算代码）
    let prompt_tokens = usage.prompt;
    let completion_tokens = usage.completion;
    let cached_tokens = usage.cached;
    let audio_tokens = usage.audio_tokens;
    let audio_cached_tokens = usage.audio_cached_tokens;
    let rule = match db_rule {
        Some(r) => r,
        None => {
            // 没有配置计费规则，走默认基础计费 1M 万字 = 1美金 等价
            let total = prompt_tokens + completion_tokens;
            let cost = (total as f64 / 1_000_000.0) * discount;
            return (
                cost,
                format!(
                    "无规则默认计费: {}总Tokens * 1/1M * {:.2}倍率",
                    total, discount
                ),
            );
        }
    };

    let apply_web_search = |token_cost_raw: f64, token_detail_raw: String| -> (f64, String) {
        let web_search_count = features.web_search.unwrap_or(0) as f64;
        let web_search_rate =
            if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                ext.get("web_search_rate")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
            } else {
                0.0
            };
        if web_search_count > 0.0 && web_search_rate > 0.0 {
            let ws_cost_raw = web_search_count * web_search_rate / 1000.0;
            let cost = (token_cost_raw + ws_cost_raw) * discount;
            let detail = format!(
                "[ {} + 联网搜索: {}次*{}元/千次 ] * {:.2}倍率",
                token_detail_raw, web_search_count, web_search_rate, discount
            );
            (cost, detail)
        } else {
            let cost = token_cost_raw * discount;
            let detail = format!("{} * {:.2}倍率", token_detail_raw, discount);
            (cost, detail)
        }
    };

    // 供解析分辨率费率使用的辅助结构体
    #[derive(serde::Deserialize)]
    struct ResolutionTier {
        pub resolution: String,
        pub rate: f64,
        #[serde(default = "crate::relay::default_tier_enabled")]
        pub enabled: bool,
        /// 图片：有图（图生图）倍率，仅 image_resolution 使用
        #[serde(default)]
        pub image_ref_multiplier: Option<f64>,
    }

    /// 供视频画质（分辨率及帧率阶梯）计费使用的辅助结构体
    #[derive(serde::Deserialize)]
    struct VideoQualityTier {
        pub resolution: String,
        pub fps_range: String,
        pub rate: f64,
        #[serde(default = "crate::relay::default_tier_enabled")]
        pub enabled: bool,
    }

    /// 供按分辨率像素计费使用的辅助结构体
    #[derive(serde::Deserialize)]
    struct SizeTier {
        pub size: String,
        #[serde(default)]
        pub rate: f64,
        #[serde(default = "crate::relay::default_tier_enabled")]
        pub enabled: bool,
        /// 有图（图生图）倍率
        #[serde(default)]
        pub image_ref_multiplier: Option<f64>,
        /// 是否启用画质独立定价
        #[serde(default)]
        pub quality_pricing: bool,
        /// 低画质单价（quality_pricing 开启时生效）
        #[serde(default)]
        pub rate_low: Option<f64>,
        /// 中画质单价（quality_pricing 开启时生效）
        #[serde(default)]
        pub rate_medium: Option<f64>,
        /// 高画质单价（quality_pricing 开启时生效）
        #[serde(default)]
        pub rate_high: Option<f64>,
    }

    match rule.billing_type.as_str() {
        "requests" => {
            let mut rate = rule.fixed_rate;
            let mut count = 1.0;
            let mut detail_desc = "固定按次计费".to_string();

            if rule.billing_rule == "per_image" {
                // 按张计费：严格使用从响应提取的实际图片数量；无有效图则不计费（由上层判失败）
                count = match features.image_count {
                    Some(c) if c > 0 => c as f64,
                    _ => {
                        tracing::warn!(
                            "[Billing] per_image 规则未获取到有效图片数量，按 0 张不计费"
                        );
                        0.0
                    }
                };
                detail_desc = "按张返回计费".to_string();

                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    // 提示词扩写倍率
                    if features.prompt_extend {
                        if let Some(m) =
                            ext.get("prompt_extend_multiplier").and_then(|v| v.as_f64())
                        {
                            rate *= m;
                            detail_desc.push_str(&format!(" [提示词扩写 x{}]", m));
                        }
                    }
                    // 有图倍率（区分文生图/图生图）
                    if features.has_image_ref {
                        if let Some(m) = ext.get("image_ref_multiplier").and_then(|v| v.as_f64()) {
                            rate *= m;
                            detail_desc.push_str(&format!(" [图生图 x{}]", m));
                        }
                    }
                }
            } else if rule.billing_rule == "image_resolution" {
                count = features.image_count.map(|c| c.max(1) as f64).unwrap_or(1.0);
                detail_desc = format!("分辨率匹配计费(默认单价: {})", rate);
                let res = features.resolution.as_deref().unwrap_or("1k");
                if let Ok(tiers) = serde_json::from_str::<Vec<ResolutionTier>>(&rule.pricing_tiers)
                {
                    let mut matched = false;
                    let mut max_rate: Option<f64> = None;
                    let mut max_res = String::new();
                    for tier in &tiers {
                        if !tier.enabled {
                            continue;
                        }
                        if max_rate.map_or(true, |mr| tier.rate > mr) {
                            max_rate = Some(tier.rate);
                            max_res = tier.resolution.clone();
                        }
                        if tier.resolution.eq_ignore_ascii_case(res) {
                            rate = tier.rate;
                            detail_desc = format!("命中分辨率阶梯 {} 单价: {:.6}", res, rate);
                            if features.has_image_ref {
                                if let Some(m) = tier.image_ref_multiplier.filter(|&m| m != 1.0) {
                                    rate *= m;
                                    detail_desc.push_str(&format!(" [图生图 x{}]", m));
                                }
                            }
                            matched = true;
                            break;
                        }
                    }
                    if !matched {
                        if let Some(mr) = max_rate {
                            rate = mr;
                            detail_desc = format!(
                                "分辨率{}未命中,兜底最高阶梯({} 单价:{:.6})",
                                res, max_res, mr
                            );
                        }
                    }
                }

                // 提示词扩写倍率（全局，非 per-tier）
                if features.prompt_extend {
                    if let Ok(ext) =
                        serde_json::from_str::<serde_json::Value>(&rule.extended_config)
                    {
                        if let Some(m) =
                            ext.get("prompt_extend_multiplier").and_then(|v| v.as_f64())
                        {
                            rate *= m;
                            detail_desc.push_str(&format!(" [提示词扩写 x{}]", m));
                        }
                    }
                }
            } else if rule.billing_rule == "image_size_pixel" {
                // 按分辨率像素计费：匹配 size 参数（如 1024x1024），支持画质独立定价
                count = features.image_count.map(|c| c.max(1) as f64).unwrap_or(1.0);
                detail_desc = format!("分辨率像素匹配计费(默认单价: {})", rate);
                let raw_size = features.size.as_deref().unwrap_or("");
                let normalized = normalize_pixel_size(raw_size);

                /// 从匹配到的档位中提取最终费率：画质独立定价时按 quality 选取，否则使用 rate
                fn resolve_tier_rate(tier: &SizeTier, quality: &Option<String>) -> (f64, String) {
                    if tier.quality_pricing {
                        let q = quality.as_deref().unwrap_or("medium");
                        let r = match q {
                            "low" => tier.rate_low.unwrap_or(0.0),
                            "high" => tier.rate_high.unwrap_or(0.0),
                            _ => tier.rate_medium.unwrap_or(0.0), // medium 或未知画质默认取中画质
                        };
                        (r, format!("画质:{}", q))
                    } else {
                        (tier.rate, String::new())
                    }
                }

                /// 取所有启用档位中的最高费率（用于未匹配时兜底）
                fn max_tier_rate(
                    tiers: &[SizeTier],
                    quality: &Option<String>,
                ) -> Option<(f64, String)> {
                    tiers
                        .iter()
                        .filter(|t| t.enabled)
                        .map(|t| {
                            let (r, _) = resolve_tier_rate(t, quality);
                            (r, t.size.clone())
                        })
                        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
                }

                if !normalized.is_empty() {
                    if let Ok(tiers) = serde_json::from_str::<Vec<SizeTier>>(&rule.pricing_tiers) {
                        let mut matched = false;
                        for tier in &tiers {
                            if !tier.enabled {
                                continue;
                            }
                            if normalize_pixel_size(&tier.size) == normalized {
                                let (r, q_desc) = resolve_tier_rate(tier, &features.quality);
                                rate = r;
                                detail_desc = if q_desc.is_empty() {
                                    format!("命中分辨率像素 {} 单价: {:.6}", normalized, rate)
                                } else {
                                    format!(
                                        "命中分辨率像素 {} {} 单价: {:.6}",
                                        normalized, q_desc, rate
                                    )
                                };
                                if features.has_image_ref {
                                    if let Some(m) = tier.image_ref_multiplier.filter(|&m| m != 1.0)
                                    {
                                        rate *= m;
                                        detail_desc.push_str(&format!(" [图生图 x{}]", m));
                                    }
                                }
                                matched = true;
                                break;
                            }
                        }
                        if !matched {
                            if let Some((mr, ms)) = max_tier_rate(&tiers, &features.quality) {
                                rate = mr;
                                detail_desc = format!(
                                    "分辨率像素{}未命中,兜底最高阶梯({} 单价:{:.6})",
                                    normalized, ms, mr
                                );
                            }
                        }
                    }
                } else {
                    // size 不是有效像素格式，兜底最高价
                    if let Ok(tiers) = serde_json::from_str::<Vec<SizeTier>>(&rule.pricing_tiers) {
                        if let Some((mr, ms)) = max_tier_rate(&tiers, &features.quality) {
                            rate = mr;
                            detail_desc = format!(
                                "size({})无法解析,兜底最高阶梯({} 单价:{:.6})",
                                raw_size, ms, mr
                            );
                        }
                    }
                }
                // 提示词扩写倍率
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if features.prompt_extend {
                        if let Some(m) =
                            ext.get("prompt_extend_multiplier").and_then(|v| v.as_f64())
                        {
                            rate *= m;
                            detail_desc.push_str(&format!(" [提示词扩写 x{}]", m));
                        }
                    }
                }
            } else if rule.billing_rule == "vidu_image" {
                // 腾讯云 Vidu 图片精确查表：属性×分辨率 → 元/张
                count = features.image_count.map(|c| c.max(1) as f64).unwrap_or(1.0);
                detail_desc = format!("Vidu图片查表(默认单价: {})", rate);
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    let res = features.resolution.as_deref().unwrap_or("1k");
                    let ref_count = features.image_ref_count.unwrap_or(0);
                    let attr = if !features.has_image_ref {
                        "text"
                    } else if ref_count <= 1 {
                        "img2img"
                    } else if ref_count <= 3 {
                        "ref_1_3"
                    } else {
                        "ref_4_7"
                    };
                    let table_key = format!("{}|{}", attr, res);
                    if let Some(tr) = lookup_price_table(&ext, &table_key) {
                        rate = tr;
                        detail_desc = format!(
                            "Vidu图片查表({} 单价:{})",
                            translate_billing_key(&table_key),
                            rate
                        );
                    } else {
                        // 未命中：兜底使用 price_table 中同属性的最高价
                        if let Some(pt) = ext.get("price_table").and_then(|p| p.as_object()) {
                            let prefix = format!("{}|", attr);
                            let max_price = pt
                                .iter()
                                .filter(|(k, _)| {
                                    k.to_lowercase().starts_with(&prefix.to_lowercase())
                                })
                                .filter_map(|(k, v)| v.as_f64().map(|p| (k.clone(), p)))
                                .max_by(|a, b| {
                                    a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)
                                });
                            if let Some((mk, mp)) = max_price {
                                rate = mp;
                                detail_desc = format!(
                                    "Vidu图片{}未命中,兜底最高价({} 单价:{})",
                                    translate_billing_key(&table_key),
                                    translate_billing_key(&mk),
                                    mp
                                );
                            }
                        }
                    }
                }
            } else if rule.billing_rule == "characters" {
                // 按字符数计费（语音合成等）：text_characters / 10000 * fixed_rate * discount
                // fixed_rate 单位：元/万字符（如 2.8 表示 2.8元/万字符）
                let chars = features.text_characters.unwrap_or(0) as f64;
                count = chars / 10000.0;
                detail_desc = format!("按字符计费({}字符)", chars as i32);
            } else if rule.billing_rule == "volc_seedream_pro" {
                // 火山 Seedream Pro 计费逻辑：
                // 1. 输入图：prompt_rate 存储单张价格，超 1 张计费（首张免费）
                // 2. 输出图：通过 pricing_tiers 数组定义总像素（万像素）不同阶梯的单张价格

                // 1) 输入图费：
                let input_images = features.image_ref_count.unwrap_or(0);
                let billable_inputs = (input_images - 1).max(0);
                let input_rate = rule.prompt_rate;
                let input_cost = billable_inputs as f64 * input_rate;

                // 2) 输出图费：
                let image_count = features.image_count.map(|c| c.max(1) as f64).unwrap_or(1.0);
                let raw_size = features.size.as_deref().unwrap_or("1024x1024");

                // 解析宽和高计算总像素（万像素）
                let mut total_pixels_wan = 104.8576; // 默认 1024 * 1024 / 10000.0
                if let Some((w, h)) = raw_size.split_once('x').and_then(|(ws, hs)| {
                    let w = ws.trim().parse::<f64>().ok()?;
                    let h = hs.trim().parse::<f64>().ok()?;
                    Some((w, h))
                }) {
                    total_pixels_wan = (w * h) / 10000.0;
                }

                // 定义阶梯结构
                #[derive(serde::Deserialize)]
                struct VolcSeedreamTier {
                    pub max_pixels_wan: f64,
                    pub rate: f64,
                    #[serde(default = "crate::relay::default_tier_enabled")]
                    pub enabled: bool,
                }

                let mut output_rate = rule.fixed_rate; // 默认费率兜底
                let mut match_desc = "默认输出单价".to_string();

                if let Ok(tiers) =
                    serde_json::from_str::<Vec<VolcSeedreamTier>>(&rule.pricing_tiers)
                {
                    let mut matched = false;
                    let mut matched_tier: Option<&VolcSeedreamTier> = None;

                    // 升序排列
                    let mut sorted_tiers = tiers;
                    sorted_tiers.sort_by(|a, b| {
                        a.max_pixels_wan
                            .partial_cmp(&b.max_pixels_wan)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    });

                    for tier in &sorted_tiers {
                        if !tier.enabled {
                            continue;
                        }
                        if total_pixels_wan <= tier.max_pixels_wan {
                            matched_tier = Some(tier);
                            matched = true;
                            break;
                        }
                    }

                    if !matched {
                        matched_tier = sorted_tiers.iter().filter(|t| t.enabled).last();
                    }

                    if let Some(tier) = matched_tier {
                        output_rate = tier.rate;
                        match_desc = format!(
                            "命中阶梯(<= {:.0}万像素 单价: {:.6})",
                            tier.max_pixels_wan, tier.rate
                        );
                    }
                }

                let output_cost = image_count * output_rate;
                let total_cost = (input_cost + output_cost) * discount;

                let detail = format!(
                    "火山SeedreamPro计费 -> (输入图: {}张[扣除首张首免]*{}元/张 + 输出图: {}张*[总像素: {:.2}万, {}])*{:.2}倍率",
                    billable_inputs, input_rate, image_count, total_pixels_wan, match_desc, discount
                );
                return (total_cost, detail);
            }
            let cost = count * rate * discount;
            (
                cost,
                format!(
                    "{} -> ({}量 * {:.6}单价 * {:.2}倍率)",
                    detail_desc, count, rate, discount
                ),
            )
        }
        "duration" => {
            let dur = features.duration_seconds.unwrap_or(0.0);
            let mut rate = rule.duration_rate;
            let mut detail_desc = "固定按秒时长计费".to_string();

            if rule.billing_rule == "video_resolution" {
                detail_desc = format!("视频分辨率阶梯找寻(默认单价: {})", rate);
                if let Some(res) = &features.resolution {
                    if let Ok(tiers) =
                        serde_json::from_str::<Vec<ResolutionTier>>(&rule.pricing_tiers)
                    {
                        let mut matched = false;
                        let mut max_rate: Option<f64> = None;
                        let mut max_res = String::new();
                        for tier in &tiers {
                            if !tier.enabled {
                                continue;
                            }
                            if max_rate.map_or(true, |mr| tier.rate > mr) {
                                max_rate = Some(tier.rate);
                                max_res = tier.resolution.clone();
                            }
                            if tier.resolution.eq_ignore_ascii_case(res) {
                                rate = tier.rate;
                                detail_desc = format!("命中视频分辨率 {} 单价: {}", res, rate);
                                matched = true;
                                break;
                            }
                        }
                        if !matched {
                            if let Some(mr) = max_rate {
                                rate = mr;
                                detail_desc = format!(
                                    "视频分辨率{}未命中，兆底最高阶梯({} 单价:{})",
                                    res, max_res, mr
                                );
                            }
                        }
                    }
                }
            } else if rule.billing_rule == "video_quality" {
                detail_desc = format!("视频画质阶梯找寻(默认单价: {})", rate);
                if let Some(res) = &features.resolution {
                    if let Ok(tiers) =
                        serde_json::from_str::<Vec<VideoQualityTier>>(&rule.pricing_tiers)
                    {
                        let fps_val = features.fps.unwrap_or(30.0);
                        let is_high_fps = fps_val > 30.0;

                        let mut target_res = "unknown";
                        let mut short_side: Option<i32> = None;
                        let res_normalized = res.to_lowercase().replace("*", "x");

                        if res_normalized.contains("720p") || res_normalized == "720" {
                            target_res = "720p";
                            short_side = Some(720);
                        } else if res_normalized.contains("1080p") || res_normalized == "1080" {
                            target_res = "1080p";
                            short_side = Some(1080);
                        } else if res_normalized.contains("2k") {
                            target_res = "2k";
                            short_side = Some(1440);
                        } else if res_normalized.contains("4k") {
                            target_res = "4k";
                            short_side = Some(2160);
                        } else {
                            let parts: Vec<&str> = res_normalized.split('x').collect();
                            let mut side: Option<i32> = None;
                            if parts.len() == 2 {
                                if let (Ok(w), Ok(h)) = (
                                    parts[0].trim().parse::<i32>(),
                                    parts[1].trim().parse::<i32>(),
                                ) {
                                    side = Some(std::cmp::min(w, h));
                                }
                            }
                            if side.is_none() {
                                let num_str: String = res_normalized
                                    .chars()
                                    .filter(|c| c.is_ascii_digit())
                                    .collect();
                                if let Ok(num) = num_str.parse::<i32>() {
                                    if num > 100 {
                                        side = Some(num);
                                    }
                                }
                            }

                            if let Some(s) = side {
                                short_side = Some(s);
                                target_res = if s <= 720 {
                                    "720p"
                                } else if s <= 1080 {
                                    "1080p"
                                } else if s <= 1440 {
                                    "2k"
                                } else {
                                    "4k"
                                };
                            }
                        }

                        let mut matched = false;
                        let mut max_rate: Option<f64> = None;
                        let mut max_tier_desc = String::new();

                        for tier in &tiers {
                            if !tier.enabled {
                                continue;
                            }
                            if max_rate.map_or(true, |mr| tier.rate > mr) {
                                max_rate = Some(tier.rate);
                                max_tier_desc = format!("{} {}", tier.resolution, tier.fps_range);
                            }

                            let res_match = tier.resolution.eq_ignore_ascii_case(target_res);
                            let fps_match = if is_high_fps {
                                tier.fps_range.contains(">30") || tier.fps_range.contains("> 30")
                            } else {
                                tier.fps_range.contains("<30")
                                    || tier.fps_range.contains("<=30")
                                    || tier.fps_range.contains("<= 30")
                            };

                            if res_match && fps_match {
                                rate = tier.rate;
                                if let Some(side) = short_side {
                                    detail_desc = format!(
                                        "命中视频画质阶梯 [{}] [帧率: {}] (解析短边: {}) 单价: {}",
                                        target_res, tier.fps_range, side, rate
                                    );
                                } else {
                                    detail_desc = format!(
                                        "命中视频画质阶梯 [{}] [帧率: {}] 单价: {}",
                                        target_res, tier.fps_range, rate
                                    );
                                }
                                matched = true;
                                break;
                            }
                        }

                        if !matched {
                            if let Some(mr) = max_rate {
                                rate = mr;
                                if let Some(side) = short_side {
                                    detail_desc = format!("视频画质阶梯未命中 [{}] (解析短边: {}, 帧率: {})，兜底最高阶梯({} 单价:{})", target_res, side, fps_val, max_tier_desc, mr);
                                } else {
                                    detail_desc = format!("视频画质阶梯未命中 [{}] (帧率: {})，兜底最高阶梯({} 单价:{})", target_res, fps_val, max_tier_desc, mr);
                                }
                            }
                        }
                    }
                }
            } else if rule.billing_rule == "kling_video" {
                // 可灵视频按秒计费：price_table 精确查表优先，倍率乘法兜底
                detail_desc = format!("可灵视频按秒计费(基准: {})", rate);
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    let mapped_mode;
                    let mut raw_mode = "std";
                    if let Some(ref m) = features.mode {
                        raw_mode = m;
                    } else if let Some(ref res) = features.resolution {
                        let res_lower = res.to_lowercase();
                        if res_lower == "720p" {
                            mapped_mode = "std".to_string();
                        } else if res_lower == "1080p" {
                            mapped_mode = "pro".to_string();
                        } else {
                            mapped_mode = res_lower;
                        }
                        raw_mode = &mapped_mode;
                    }

                    let raw_sound = features.sound.as_deref().unwrap_or("off");
                    let raw_video = if features.has_video { "yes" } else { "no" };

                    // 维度开关：关闭时锁定为默认值，不参与差异化计费
                    let final_mode = if ext
                        .get("enable_mode")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true)
                    {
                        raw_mode
                    } else {
                        "std"
                    };
                    let final_sound = if ext
                        .get("enable_sound")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true)
                    {
                        raw_sound
                    } else {
                        "off"
                    };
                    let final_video = if ext
                        .get("enable_video_ref")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        raw_video
                    } else {
                        "no"
                    };

                    // 优先：精确查表（price_table）
                    let table_key = format!("{}|{}|{}", final_mode, final_sound, final_video);
                    let table_rate = lookup_price_table(&ext, &table_key);

                    if let Some(tr) = table_rate {
                        rate = tr;
                        detail_desc = format!(
                            "可灵视频查表({} 单价:{})",
                            translate_billing_key(&table_key),
                            rate
                        );
                    } else {
                        // 兜底：倍率乘法（兼容旧版规则）
                        let mode_mult = ext
                            .get("mode_multipliers")
                            .and_then(|m| m.get(final_mode))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(1.0);
                        let sound_mult = ext
                            .get("sound_multipliers")
                            .and_then(|m| m.get(final_sound))
                            .and_then(|v| v.as_f64())
                            .unwrap_or(1.0);
                        rate *= mode_mult * sound_mult;
                        detail_desc = format!(
                            "可灵视频倍率(mode:{}x{} sound:{}x{} 单价:{})",
                            final_mode, mode_mult, final_sound, sound_mult, rate
                        );
                    }
                }
            } else if rule.billing_rule == "vidu_video" {
                // 腾讯云 Vidu 视频精确查表：属性×分辨率 → 元/秒
                detail_desc = format!("Vidu视频查表(基准: {})", rate);
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    let res = features.resolution.as_deref().unwrap_or("720p");
                    let attr = if features.has_image_ref {
                        "image"
                    } else if features.has_video {
                        "ref"
                    } else {
                        "text"
                    };
                    let table_key = format!("{}|{}", attr, res);
                    if let Some(tr) = lookup_price_table(&ext, &table_key) {
                        rate = tr;
                        detail_desc = format!(
                            "Vidu视频查表({} 单价:{})",
                            translate_billing_key(&table_key),
                            rate
                        );
                    } else {
                        // 未命中：兜底使用 price_table 中同属性的最高价
                        if let Some(pt) = ext.get("price_table").and_then(|p| p.as_object()) {
                            let prefix = format!("{}|", attr);
                            let max_price = pt
                                .iter()
                                .filter(|(k, _)| {
                                    k.to_lowercase().starts_with(&prefix.to_lowercase())
                                })
                                .filter_map(|(k, v)| v.as_f64().map(|p| (k.clone(), p)))
                                .max_by(|a, b| {
                                    a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)
                                });
                            if let Some((mk, mp)) = max_price {
                                rate = mp;
                                detail_desc = format!(
                                    "Vidu视频{}未命中,兜底最高价({} 单价:{})",
                                    translate_billing_key(&table_key),
                                    translate_billing_key(&mk),
                                    mp
                                );
                            }
                        }
                    }
                    // 错峰模式：优先检查请求体的 OutputConfig.OffPeak，其次 service_tier=flex
                    let is_offpeak = features.service_tier.as_deref() == Some("flex");
                    if is_offpeak {
                        let offpeak_discount = ext
                            .get("offpeak_discount")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.5);
                        rate *= offpeak_discount;
                        detail_desc.push_str(&format!(" [错峰 x{}]", offpeak_discount));
                    }
                }
            } else if rule.billing_rule == "volc_enhance_cascade" {
                // 级联画质增强查表：version(fast|standard，由模型 Id 是否含 fast 推导)×分辨率×是否有视频输入
                detail_desc = format!("火山级联画质增强查表(基准: {})", rate);
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    let raw_version = features.version.as_deref().unwrap_or("standard");
                    // 与级联 cascade.resolution / 阶段二目标缺省一致
                    let raw_res = features.resolution.as_deref().unwrap_or("720p");
                    let raw_video = if features.has_video { "yes" } else { "no" };

                    let table_key = format!("{}|{}|{}", raw_version, raw_res, raw_video);
                    if let Some(tr) = lookup_price_table(&ext, &table_key) {
                        rate = tr;
                        detail_desc = format!(
                            "火山级联画质增强查表({} 单价:{})",
                            translate_billing_key(&table_key),
                            rate
                        );
                    } else {
                        // 未命中：兜底使用 price_table 中同属性版本的最高价
                        if let Some(pt) = ext.get("price_table").and_then(|p| p.as_object()) {
                            let prefix = format!("{}|", raw_version);
                            let max_price = pt
                                .iter()
                                .filter(|(k, _)| {
                                    k.to_lowercase().starts_with(&prefix.to_lowercase())
                                })
                                .filter_map(|(k, v)| v.as_f64().map(|p| (k.clone(), p)))
                                .max_by(|a, b| {
                                    a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)
                                });
                            if let Some((mk, mp)) = max_price {
                                rate = mp;
                                detail_desc = format!(
                                    "火山级联画质增强{}未命中,兜底最高价({} 单价:{})",
                                    translate_billing_key(&table_key),
                                    translate_billing_key(&mk),
                                    mp
                                );
                            }
                        }
                    }
                }
            }

            let cost = dur * rate * discount;
            (
                cost,
                format!(
                    "{} -> ({:.2}秒 * {}单价 * {:.2}倍率)",
                    detail_desc, dur, rate, discount
                ),
            )
        }
        _ => {
            // tokens 计费
            let mut p_rate = rule.prompt_rate;
            let mut c_rate = rule.completion_rate;
            let mut is_overridden = false;
            let mut detail_desc = "标准 Tokens 计费".to_string();

            if rule.billing_rule == "seedance2.0" {
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if let Some(rates) = ext.get("resolution_rates") {
                        let res_key = features
                            .resolution
                            .as_deref()
                            .unwrap_or("720p")
                            .to_lowercase();
                        let tier = rates.get(&res_key).or_else(|| rates.get("720p"));
                        let (rate_field, video_label) = if features.has_video {
                            ("with_video", "含视频")
                        } else {
                            ("without_video", "无视频")
                        };
                        if let Some(rate) = tier
                            .and_then(|t| t.get(rate_field))
                            .and_then(|v| v.as_f64())
                        {
                            p_rate = rate;
                            c_rate = rate;
                            is_overridden = true;
                            detail_desc = format!(
                                "Seedance2.0({}|{}|基本单价:{})",
                                res_key, video_label, rate
                            );
                        }
                    }
                }
            } else if rule.billing_rule == "seedance1.5pro" {
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    let mut rate = None;
                    let mut desc = String::new();
                    if features.has_audio {
                        if let Some(ar) = ext.get("audio_rate").and_then(|v| v.as_f64()) {
                            rate = Some(ar);
                            desc = format!("Seedance1.5Pro(含语音单价:{})", ar);
                        }
                    } else {
                        if let Some(br) = ext.get("base_rate").and_then(|v| v.as_f64()) {
                            rate = Some(br);
                            desc = format!("Seedance1.5Pro(无语音单价:{})", br);
                        }
                    }
                    if let Some(mut r) = rate {
                        if features.service_tier.as_deref() == Some("flex") {
                            let discount = ext
                                .get("offline_discount")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.5);
                            r *= discount;
                            desc.push_str(" [离线推理]");
                        }
                        p_rate = r;
                        c_rate = r;
                        is_overridden = true;
                        detail_desc = desc;
                    }
                }
            } else if rule.billing_rule == "seedance1.0" {
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if features.service_tier.as_deref() == Some("flex") {
                        if let Some(off_rate) = ext.get("offline_rate").and_then(|v| v.as_f64()) {
                            p_rate = off_rate;
                            c_rate = off_rate;
                            is_overridden = true;
                            detail_desc = format!("Seedance1.0(离线推理单价:{})", off_rate);
                        }
                    } else {
                        if let Some(on_rate) = ext.get("online_rate").and_then(|v| v.as_f64()) {
                            p_rate = on_rate;
                            c_rate = on_rate;
                            is_overridden = true;
                            detail_desc = format!("Seedance1.0(在线推理单价:{})", on_rate);
                        }
                    }
                }
            }

            let mut is_cached_rate_set = false;
            let mut cached_r = rule.cached_rate;
            if cached_r > 0.0 {
                is_cached_rate_set = true;
            }

            if !is_overridden && rule.billing_rule == "tiered" {
                let mut tiers: Vec<crate::models::PricingTier> =
                    serde_json::from_str(&rule.pricing_tiers).unwrap_or_default();
                // 确保按照 prompt 升序
                tiers.sort_by(|a, b| {
                    a.max_prompt_tokens
                        .partial_cmp(&b.max_prompt_tokens)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                let mut matched = false;

                // 核心修复：前端录入的界限单位是千 (K)，需要将真实消耗转换成千再比较
                let p_k = prompt_tokens as f64 / 1000.0;
                let c_k = completion_tokens as f64 / 1000.0;

                for tier in &tiers {
                    // prompt 和 completion 同时满足才命中该阶梯
                    let prompt_ok = p_k <= tier.max_prompt_tokens;
                    let completion_ok = match tier.max_completion_tokens {
                        Some(mc) => c_k <= mc,
                        None => true,
                    };
                    if prompt_ok && completion_ok {
                        p_rate = tier.prompt_rate;
                        c_rate = tier.completion_rate;
                        // 提取阶梯独立的缓存费率
                        if tier.cached_rate > 0.0 {
                            cached_r = tier.cached_rate;
                            is_cached_rate_set = true;
                        } else {
                            // 阶梯未设置缓存费率时，不继承全局规则的缓存费率
                            is_cached_rate_set = false;
                        }
                        detail_desc = match tier.max_completion_tokens {
                            Some(mc) => {
                                format!("阶梯计费(命中<={}K_P|<={}K_C)", tier.max_prompt_tokens, mc)
                            }
                            None => format!("阶梯计费(命中<={}K_P)", tier.max_prompt_tokens),
                        };
                        matched = true;
                        break;
                    }
                }
                // 所有阶梯均不匹配（请求超出最大阶梯），兜底取最高阶梯费率
                if !matched {
                    if let Some(last) = tiers.last() {
                        p_rate = last.prompt_rate;
                        c_rate = last.completion_rate;
                        if last.cached_rate > 0.0 {
                            cached_r = last.cached_rate;
                            is_cached_rate_set = true;
                        } else {
                            is_cached_rate_set = false;
                        }
                        detail_desc = format!(
                            "阶梯计费(超出上限,按最高档{}K_P/{}K_C费率)",
                            last.max_prompt_tokens,
                            last.max_completion_tokens
                                .map(|c| c.to_string())
                                .unwrap_or("-".to_string())
                        );
                    }
                }
            } else if !is_overridden && rule.billing_rule == "doubao_chat" {
                // 豆包聊天阶梯计费：分离音频/非音频独立计价，对齐官方公式
                let mut tiers: Vec<crate::models::PricingTier> =
                    serde_json::from_str(&rule.pricing_tiers).unwrap_or_default();
                tiers.sort_by(|a, b| {
                    a.max_prompt_tokens
                        .partial_cmp(&b.max_prompt_tokens)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                let p_k = prompt_tokens as f64 / 1000.0;
                let c_k = completion_tokens as f64 / 1000.0;

                let matched_tier = tiers
                    .iter()
                    .find(|t| {
                        p_k <= t.max_prompt_tokens
                            && t.max_completion_tokens.map_or(true, |mc| c_k <= mc)
                    })
                    .or(tiers.last());

                if let Some(tier) = matched_tier {
                    let is_fast = features.service_tier.as_deref() == Some("fast");
                    let tier_desc = match tier.max_completion_tokens {
                        Some(mc) => format!("<={}K_P|<={}K_C", tier.max_prompt_tokens, mc),
                        None => format!("<={}K_P", tier.max_prompt_tokens),
                    };

                    // 分离音频/非音频 token（缓存是 prompt 子集，需拆分）
                    // 注：audio_tokens 在豆包语境下指"非缓存的音频输入 token"，audio_cached_tokens 是"已缓存的音频 token"
                    let eff_prompt = (prompt_tokens - cached_tokens).max(0);
                    let non_audio_prompt = (eff_prompt - audio_tokens).max(0);
                    let non_audio_cached = (cached_tokens - audio_cached_tokens).max(0);

                    // 选取费率组：service_tier=fast → 低延迟（未设置降级常规），否则常规
                    let (pr, cr, cache_r, audio_pr, audio_cache_r) = if is_fast {
                        (
                            if tier.fast_prompt_rate > 0.0 {
                                tier.fast_prompt_rate
                            } else {
                                tier.prompt_rate
                            },
                            if tier.fast_completion_rate > 0.0 {
                                tier.fast_completion_rate
                            } else {
                                tier.completion_rate
                            },
                            if tier.fast_cached_rate > 0.0 {
                                tier.fast_cached_rate
                            } else {
                                tier.cached_rate
                            },
                            if tier.fast_audio_prompt_rate > 0.0 {
                                tier.fast_audio_prompt_rate
                            } else {
                                tier.audio_prompt_rate
                            },
                            if tier.fast_audio_cached_rate > 0.0 {
                                tier.fast_audio_cached_rate
                            } else {
                                tier.audio_cached_rate
                            },
                        )
                    } else {
                        (
                            tier.prompt_rate,
                            tier.completion_rate,
                            tier.cached_rate,
                            tier.audio_prompt_rate,
                            tier.audio_cached_rate,
                        )
                    };

                    let cost_raw = (non_audio_prompt as f64 * pr
                        + audio_tokens as f64 * audio_pr
                        + non_audio_cached as f64 * cache_r
                        + audio_cached_tokens as f64 * audio_cache_r
                        + completion_tokens as f64 * cr)
                        / 1_000_000.0;

                    let mode_label = if is_fast { "低延迟" } else { "常规" };
                    let d_raw = format!("豆包阶梯[{}]({}) -> ({}非音P*{} + {}音P*{} + {}非音C*{} + {}音C*{} + {}Out*{})/1M",
                        mode_label, tier_desc,
                        non_audio_prompt, pr, audio_tokens, audio_pr,
                        non_audio_cached, cache_r, audio_cached_tokens, audio_cache_r,
                        completion_tokens, cr);
                    let (cost, d) = apply_web_search(cost_raw, d_raw);
                    return (cost, d);
                }
            } else if !is_overridden && rule.billing_rule == "multimodal" {
                // 多模态 tokens 分类计价：文本输入使用已配置的输入单价，图片输入使用 image_prompt_rate，无需输出单价
                let mut img_prompt_rate = rule.prompt_rate;
                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if let Some(r) = ext.get("image_prompt_rate").and_then(|v| v.as_f64()) {
                        img_prompt_rate = r;
                    }
                }

                // 计算公式：文本输入 + 图片输入
                let cost_raw = (prompt_tokens as f64 * p_rate
                    + usage.image_tokens as f64 * img_prompt_rate)
                    / 1_000_000.0;

                let d_raw = format!(
                    "多模态计费 -> ({}文本P*{} + {}图片P*{})/1M",
                    prompt_tokens, p_rate, usage.image_tokens, img_prompt_rate
                );
                let (cost, d) = apply_web_search(cost_raw, d_raw);
                return (cost, d);
            } else if !is_overridden && rule.billing_rule == "gpt_billing" {
                // GPT 官方计费逻辑：对输入文本、输入图片、输出图片、输入文本缓存、输入图片缓存等分别计费，每一项可开启关闭，开启即使用
                let mut cost_raw = 0.0;
                let mut detail_parts = Vec::new();

                if let Ok(ext) = serde_json::from_str::<serde_json::Value>(&rule.extended_config) {
                    if let Some(gpt_config) = ext.get("gpt_config") {
                        // 推导各项 tokens 消耗
                        let total_input = prompt_tokens;
                        let img_input = usage.image_tokens;
                        let text_input = (total_input - img_input).max(0);
                        let total_cached = cached_tokens;

                        // 根据请求特征是否包含图片直接区分文本缓存和图片缓存
                        let (img_cached, text_cached) = if total_cached > 0 {
                            if features.has_image_ref {
                                (total_cached, 0)
                            } else {
                                (0, total_cached)
                            }
                        } else {
                            (0, 0)
                        };

                        let non_cached_text = (text_input - text_cached).max(0);
                        let non_cached_image = (img_input - img_cached).max(0);
                        let img_output = completion_tokens; // 直接复用 completion

                        // 循环遍历计费项，减少冗余代码
                        let items = [
                            ("input_text", "文本输入", non_cached_text),
                            ("input_image", "图片输入", non_cached_image),
                            ("cached_input_text", "文本缓存", text_cached),
                            ("cached_input_image", "图片缓存", img_cached),
                            ("output_image", "图片输出", img_output),
                        ];

                        for &(key, label, tokens) in &items {
                            let enabled = gpt_config
                                .pointer(&format!("/{}/enabled", key))
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            if enabled {
                                let rate = gpt_config
                                    .pointer(&format!("/{}/rate", key))
                                    .and_then(|v| v.as_f64())
                                    .unwrap_or(0.0);
                                cost_raw += tokens as f64 * rate;
                                detail_parts.push(format!("{}:{}*{}", label, tokens, rate));
                            }
                        }
                        cost_raw /= 1_000_000.0;
                    }
                }

                let d_raw = if detail_parts.is_empty() {
                    "GPT官方计费(未启用任何计费项)".to_string()
                } else {
                    format!("GPT官方计费 -> ({})/1M", detail_parts.join(" + "))
                };

                let cost = cost_raw * discount;
                let detail = format!("{} * {:.2}倍率", d_raw, discount);
                return (cost, detail);
            }

            // 兜底防线：若有多模态图片输入，但在非多模态分类规则下结算，
            // 则文本与图片在常规规则下统一合并按输入费率 p_rate 收费，将图片 token 累加回 prompt_tokens
            let prompt_tokens = if usage.image_tokens > 0 {
                prompt_tokens + usage.image_tokens
            } else {
                prompt_tokens
            };

            // 补充兜底的 flex 离线折扣检查（当使用 standard / tiered 或者其他策略不匹配导致回退时）
            // 确保不与其他已经自带离线的策略(如已被拦截处理过的描述中包含了"离线")产生重复折扣
            // 注意：火山的 Seedance 2.0/2.0 fast 已不支持 flex 离线降级
            if features.service_tier.as_deref() == Some("flex")
                && !detail_desc.contains("离线")
                && rule.billing_rule != "seedance2.0"
            {
                let off_discount = if let Ok(ext) =
                    serde_json::from_str::<serde_json::Value>(&rule.extended_config)
                {
                    ext.get("offline_discount")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.5)
                } else {
                    0.5
                };
                p_rate *= off_discount;
                c_rate *= off_discount;
                if is_cached_rate_set {
                    cached_r *= off_discount;
                }
                detail_desc = format!("{} [叠加Flex离线折扣: {}倍]", detail_desc, off_discount);
            }

            // Claude 语义判定：有缓存创建 token，或配置了 Claude 读取费率且有缓存读取 token
            let is_claude = features.cache_creation.filter(|&n| n > 0).is_some()
                || (rule.claude_cache_read_rate > 0.0 && cached_tokens > 0);

            // 区分 OpenAI 兼容格式与 Claude 原生格式
            // OpenAI 兼容格式特点：总输入 (prompt_tokens) 已包含缓存。原生格式特点：输入不含缓存。
            // 使用简明安全的特征判断：在多数带有 total_tokens 的规范中，total_tokens 会等于 prompt_tokens + completion_tokens。
            let is_openai_format =
                usage.total > 0 && usage.total == prompt_tokens + completion_tokens;
            let cc = features.cache_creation.unwrap_or(0);

            // 拆分逻辑：
            // Claude: 原生 prompt 不含缓存 token，不做拆分；OpenAI 格式则包含，需拆分。
            // 增加安全守卫条件：仅当 prompt_tokens 确实大于或等于缓存 tokens 之和时才进行拆分，避免原生格式发生误扣
            let effective_prompt = if is_claude {
                if is_openai_format && prompt_tokens >= cc + cached_tokens {
                    (prompt_tokens - cc - cached_tokens).max(0)
                } else {
                    prompt_tokens
                }
            } else if cached_tokens > 0 && prompt_tokens >= cached_tokens {
                (prompt_tokens - cached_tokens).max(0)
            } else {
                prompt_tokens
            };

            let (cost, detail_str) = if is_claude {
                // Claude 路径：创建/读取独立计价
                let cc_rate = rule.claude_cache_creation_rate;
                let cr_rate = if rule.claude_cache_read_rate > 0.0 {
                    rule.claude_cache_read_rate
                } else if is_cached_rate_set {
                    cached_r
                } else {
                    p_rate
                };
                let base = effective_prompt as f64 * p_rate + completion_tokens as f64 * c_rate;
                let creation = if cc > 0 && cc_rate > 0.0 {
                    cc as f64 * cc_rate
                } else {
                    0.0
                };
                let read = if cached_tokens > 0 {
                    cached_tokens as f64 * cr_rate
                } else {
                    0.0
                };
                let cost_raw = (base + creation + read) / 1_000_000.0;
                let d = format!(
                    "{} -> ({}P*{} + {}C*{} + {}创建@{} + {}读取@{})/1M",
                    detail_desc,
                    effective_prompt,
                    p_rate,
                    completion_tokens,
                    c_rate,
                    cc,
                    cc_rate,
                    cached_tokens,
                    cr_rate
                );
                (cost_raw, d)
            } else if cached_tokens > 0 && is_cached_rate_set {
                // OpenAI 路径：有独立缓存费率，prompt 拆分为 (effective_prompt + cached)
                let cost_raw = (effective_prompt as f64 * p_rate
                    + completion_tokens as f64 * c_rate
                    + cached_tokens as f64 * cached_r)
                    / 1_000_000.0;
                let d = format!(
                    "{} -> ({:.0}P*{} + {:.0}C*{} + {:.0}Cache*{})/1M",
                    detail_desc,
                    effective_prompt,
                    p_rate,
                    completion_tokens,
                    c_rate,
                    cached_tokens,
                    cached_r
                );
                (cost_raw, d)
            } else if cached_tokens > 0 {
                // OpenAI 路径：无独立缓存费率，缓存按 p_rate 计价
                let cost_raw = (prompt_tokens as f64 * p_rate + completion_tokens as f64 * c_rate)
                    / 1_000_000.0;
                let d = format!(
                    "{} -> ({:.0}P*{} + {:.0}C*{})/1M [含{:.0}缓存(输入内)]",
                    detail_desc, prompt_tokens, p_rate, completion_tokens, c_rate, cached_tokens
                );
                (cost_raw, d)
            } else {
                let cost_raw = (prompt_tokens as f64 * p_rate + completion_tokens as f64 * c_rate)
                    / 1_000_000.0;
                let d = format!(
                    "{} -> ({:.0}P*{} + {:.0}C*{})/1M",
                    detail_desc, prompt_tokens, p_rate, completion_tokens, c_rate
                );
                (cost_raw, d)
            };
            let (cost, d) = apply_web_search(cost, detail_str);
            (cost, d)
        }
    }
}

/// price_table 查表辅助：精确匹配优先，fallback 大小写不敏感遍历
/// - 被 price_table_disabled 标记的 key 视为未配置（返回 None），防止 0 值覆盖默认费率
/// - 大小写不敏感 fallback 兼容 features.resolution 统一转小写后与后台 key 不一致的情况
fn lookup_price_table(ext: &serde_json::Value, table_key: &str) -> Option<f64> {
    // 检查 disabled 列表（大小写不敏感）
    if let Some(disabled) = ext.get("price_table_disabled").and_then(|v| v.as_array()) {
        let lower_key = table_key.to_lowercase();
        if disabled
            .iter()
            .any(|k| k.as_str().map_or(false, |s| s.to_lowercase() == lower_key))
        {
            return None;
        }
    }
    let pt = ext.get("price_table")?;
    // 精确匹配
    if let Some(v) = pt.get(table_key).and_then(|v| v.as_f64()) {
        return Some(v);
    }
    // 大小写不敏感 fallback
    let lower_key = table_key.to_lowercase();
    pt.as_object()?
        .iter()
        .find(|(k, _)| k.to_lowercase() == lower_key)
        .and_then(|(_, v)| v.as_f64())
}

/// 将 price_table 中用 | 拼接的多维度 key 翻译成友好中文格式显示
pub fn translate_billing_key(key: &str) -> String {
    let parts: Vec<String> = key
        .split('|')
        .map(|part| {
            let part_trimmed = part.trim().to_lowercase();
            match part_trimmed.as_str() {
                "std" => "标准".to_string(),
                "pro" => "专业".to_string(),
                "fast" => "极速".to_string(),
                "standard" => "标准".to_string(),
                "ai" => "大模型".to_string(),
                "text" => "文生".to_string(),
                "image" => "图生".to_string(),
                "ref" => "视频参考".to_string(),
                "on" => "有声".to_string(),
                "off" => "无声".to_string(),
                "yes" => "含视频".to_string(),
                "no" => "无视频".to_string(),
                "img2img" => "图生图".to_string(),
                "ref_1_3" => "1-3张参考".to_string(),
                "ref_4_7" => "4-7张参考".to_string(),
                other => other.to_string(),
            }
        })
        .collect();
    parts.join("|")
}

/// 阶梯 enabled 缺省视为启用（与前端 Switch / RateDisplay 语义一致）
pub(crate) fn default_tier_enabled() -> bool {
    true
}

/// 将 size 参数统一为像素分辨率格式（小写 x 分隔）
/// 支持：1024x1024、1024*1024、1024×1024、1024X1024、2:3
/// K 等级映射：1k→1024x1024、2k→2048x2048、3k→3072x3072、4k→4096x4096
fn normalize_pixel_size(size: &str) -> String {
    let s = size.trim().to_lowercase();
    // K 等级映射
    if let Some(k) = s.strip_suffix('k') {
        if let Ok(n) = k.parse::<u32>() {
            let px = n * 1024;
            return format!("{}x{}", px, px);
        }
    }
    // 像素格式：支持 x、*、×（Unicode 乘号）、:（比例）分隔
    let normalized = s
        .replace('*', "x")
        .replace('\u{00d7}', "x")
        .replace(':', "x");
    let parts: Vec<&str> = normalized.split('x').collect();
    if parts.len() == 2 {
        if parts[0].trim().parse::<u32>().is_ok() && parts[1].trim().parse::<u32>().is_ok() {
            return format!("{}x{}", parts[0].trim(), parts[1].trim());
        }
    }
    String::new()
}
