#![allow(dead_code)]
use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Model {
    pub id: i64,
    pub mid: String, // 6位系统识别码，永久不变
    pub name: String,
    pub model_id: String,
    #[sqlx(default)]
    pub original_id: String,
    #[sqlx(default)]
    pub model_id_alias: String, // 模型ID别名映射值，非空时上游请求使用此ID替代model_id
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub api_provider_id: Option<i64>,
    pub group_ratios: String, // {"default": 1.0, "vip": 0.8}
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: f64,
    pub is_active: i32,
    pub forward_rule_ids: Option<String>,
    pub enable_log_content: i32,
    #[sqlx(default)]
    pub site_discount: f64, // 折扣限价倍率（开启时折扣不低于此值，1.0=原价）
    #[sqlx(default)]
    pub site_discount_enabled: i32, // 折扣限价开关（0=关，1=开）
    #[sqlx(default)]
    pub global_discount: f64, // 全站折扣倍率
    #[sqlx(default)]
    pub global_discount_enabled: i32, // 全站折扣开关（0=关，1=开）
    #[sqlx(default)]
    pub logo: Option<String>,
    #[sqlx(default)]
    pub remark: Option<String>,
    #[sqlx(default)]
    pub description: Option<String>,
    #[sqlx(default)]
    pub feature_attributes: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    #[sqlx(default)]
    pub type_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BillingRule {
    pub id: i64,
    pub name: String,
    pub billing_type: String,
    pub prompt_rate: f64,
    pub completion_rate: f64,
    #[sqlx(default)]
    pub cached_rate: f64,
    #[sqlx(default)]
    pub claude_cache_creation_rate: f64,
    #[sqlx(default)]
    pub claude_cache_read_rate: f64,
    pub fixed_rate: f64,
    pub duration_rate: f64,
    pub billing_rule: String,
    pub pricing_tiers: String,
    pub extended_config: String,
    #[sqlx(default)]
    pub provider_id: Option<i64>,
    #[sqlx(default)]
    pub type_id: Option<i64>,
    pub is_active: i32,
    pub is_system: i32,
    pub pid: String,
    #[sqlx(default)]
    pub pricing_type: String,
    #[sqlx(default)]
    pub sort_order: i32,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    #[sqlx(default)]
    #[serde(default = "default_applied_multiplier")]
    pub applied_multiplier: f64,
    #[sqlx(default)]
    #[serde(skip)]
    pub is_multiplier_applied: bool,
}

fn default_applied_multiplier() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeMultiplier {
    pub start: String,
    pub end: String,
    pub multiplier: f64,
}

impl BillingRule {
    pub fn get_current_multiplier(&self, default_tz: &str) -> f64 {
        if self.extended_config.is_empty() || self.extended_config == "{}" {
            return 1.0;
        }

        let config: serde_json::Value = match serde_json::from_str(&self.extended_config) {
            Ok(v) => v,
            Err(_) => return 1.0,
        };

        let multipliers_val = match config.get("time_multipliers") {
            Some(v) => v,
            None => return 1.0,
        };

        let multipliers: Vec<TimeMultiplier> = match serde_json::from_value(multipliers_val.clone())
        {
            Ok(v) => v,
            Err(_) => return 1.0,
        };

        if multipliers.is_empty() {
            return 1.0;
        }

        let tz: chrono_tz::Tz = default_tz.parse().unwrap_or(chrono_tz::Asia::Shanghai);
        let local_now = chrono::Utc::now().with_timezone(&tz);
        let current_time = local_now.time();

        for item in multipliers {
            let start = chrono::NaiveTime::parse_from_str(&item.start, "%H:%M");
            let end = chrono::NaiveTime::parse_from_str(&item.end, "%H:%M");
            if let (Ok(start_t), Ok(end_t)) = (start, end) {
                let matched = if start_t > end_t {
                    current_time >= start_t || current_time < end_t
                } else {
                    current_time >= start_t && current_time < end_t
                };
                if matched {
                    return item.multiplier;
                }
            }
        }

        1.0
    }

    pub fn apply_time_multiplier(&mut self, default_tz: &str) -> f64 {
        if self.is_multiplier_applied {
            return self.applied_multiplier;
        }
        let multiplier = self.get_current_multiplier(default_tz);
        self.applied_multiplier = multiplier;
        self.is_multiplier_applied = true;
        if (multiplier - 1.0).abs() > 0.00001 {
            self.prompt_rate *= multiplier;
            self.completion_rate *= multiplier;
            self.cached_rate *= multiplier;
            self.claude_cache_creation_rate *= multiplier;
            self.claude_cache_read_rate *= multiplier;
            self.fixed_rate *= multiplier;
            self.duration_rate *= multiplier;
        }
        multiplier
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateBillingRuleRequest {
    pub name: String,
    pub billing_type: String,
    pub prompt_rate: f64,
    pub completion_rate: f64,
    #[serde(default)]
    pub cached_rate: f64,
    #[serde(default)]
    pub claude_cache_creation_rate: f64,
    #[serde(default)]
    pub claude_cache_read_rate: f64,
    pub fixed_rate: f64,
    pub duration_rate: f64,
    pub billing_rule: String,
    pub pricing_tiers: Option<serde_json::Value>,
    pub extended_config: Option<serde_json::Value>,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    #[serde(default = "default_active")]
    pub is_active: i32,
    pub pid: Option<String>,
    #[serde(default = "default_pricing_type")]
    pub pricing_type: String,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBillingRuleRequest {
    pub name: Option<String>,
    pub billing_type: Option<String>,
    pub prompt_rate: Option<f64>,
    pub completion_rate: Option<f64>,
    pub cached_rate: Option<f64>,
    pub claude_cache_creation_rate: Option<f64>,
    pub claude_cache_read_rate: Option<f64>,
    pub fixed_rate: Option<f64>,
    pub duration_rate: Option<f64>,
    pub billing_rule: Option<String>,
    pub pricing_tiers: Option<serde_json::Value>,
    pub extended_config: Option<serde_json::Value>,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub is_active: Option<i32>,
    pub pid: Option<String>,
    pub pricing_type: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingTier {
    pub max_prompt_tokens: f64,
    pub max_completion_tokens: Option<f64>,
    // ---- 常规费率 ----
    pub prompt_rate: f64,
    pub completion_rate: f64,
    /// 缓存命中(非音频)费率(/1M)，#[serde(default)] 兼容旧数据
    #[serde(default)]
    pub cached_rate: f64,
    /// 输入(音频)费率(/1M)，豆包聊天分离计价
    #[serde(default)]
    pub audio_prompt_rate: f64,
    /// 缓存命中(音频)费率(/1M)
    #[serde(default)]
    pub audio_cached_rate: f64,
    // ---- 低延迟费率 (service_tier=fast) ----
    /// 低延迟·输入(非音频)费率(/1M)
    #[serde(default)]
    pub fast_prompt_rate: f64,
    /// 低延迟·输出费率(/1M)
    #[serde(default)]
    pub fast_completion_rate: f64,
    /// 低延迟·缓存命中(非音频)费率(/1M)
    #[serde(default)]
    pub fast_cached_rate: f64,
    /// 低延迟·输入(音频)费率(/1M)
    #[serde(default)]
    pub fast_audio_prompt_rate: f64,
    /// 低延迟·缓存命中(音频)费率(/1M)
    #[serde(default)]
    pub fast_audio_cached_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ForwardRule {
    pub id: i64,
    pub name: String,
    pub rule_type: String,
    pub category: String,
    pub config_json: String,
    pub description: Option<String>,
    pub is_active: i32,
    pub is_system: i32, // 1 for built-in, 0 for custom
    pub eid: String,
    #[sqlx(default)]
    pub sort_order: i32,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Deserialize)]
pub struct CreateRuleRequest {
    pub name: String,
    pub rule_type: String,
    pub category: Option<String>,
    pub config_json: Option<String>,
    pub description: Option<String>,
    #[serde(default = "default_active")]
    pub is_active: i32,
    pub eid: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub rule_type: Option<String>,
    pub category: Option<String>,
    pub config_json: Option<String>,
    pub description: Option<String>,
    pub is_active: Option<i32>,
    pub eid: Option<String>,
    pub sort_order: Option<i32>,
}

pub fn default_active() -> i32 {
    1
}

pub fn default_pricing_type() -> String {
    "custom".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelProvider {
    pub id: i64,
    pub name: String,
    #[sqlx(default)]
    pub name_en: String,
    pub sort_order: i32,
    pub is_active: i32,
    #[serde(default)]
    pub is_system: i32,
    pub remark: Option<String>,
    #[sqlx(default)]
    pub logo: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelType {
    pub id: i64,
    pub name: String,
    #[sqlx(default)]
    pub name_en: String,
    pub sort_order: i32,
    pub is_active: i32,
    #[serde(default)]
    pub is_system: i32,
    #[sqlx(default)]
    pub logo: Option<String>,
    #[sqlx(default)]
    pub default_features: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ClassificationCount {
    pub id: Option<i64>,
    pub name: String,
    #[sqlx(default)]
    pub name_en: String,
    #[serde(default)]
    pub is_system: i32,
    #[sqlx(default)]
    pub logo: Option<String>,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct ClassificationsResponse {
    pub providers: Vec<ClassificationCount>,
    pub api_providers: Vec<ClassificationCount>,
    pub types: Vec<ClassificationCount>,
}

impl Model {
    pub fn get_group_ratios(&self) -> std::collections::HashMap<String, f64> {
        serde_json::from_str(&self.group_ratios).unwrap_or_default()
    }

    pub fn get_multiplier_for_group(&self, group: &str) -> f64 {
        let ratios = self.get_group_ratios();
        *ratios
            .get(group)
            .or_else(|| ratios.get("default"))
            .unwrap_or(&1.0)
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateModelRequest {
    pub name: String,
    pub model_id: String,
    pub original_id: Option<String>,
    pub model_id_alias: Option<String>,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub api_provider_id: Option<i64>,
    pub group_ratios: Option<serde_json::Value>,
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: Option<f64>,
    pub forward_rule_ids: Option<Vec<i64>>,
    pub is_active: Option<i32>,
    pub enable_log_content: Option<i32>,
    pub site_discount: Option<f64>,
    pub site_discount_enabled: Option<i32>,
    pub global_discount: Option<f64>,
    pub global_discount_enabled: Option<i32>,
    pub logo: Option<String>,
    pub remark: Option<String>,
    pub description: Option<String>,
    pub feature_attributes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub name: Option<String>,
    pub model_id: Option<String>,
    pub original_id: Option<String>,
    pub model_id_alias: Option<String>,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub api_provider_id: Option<i64>,
    pub group_ratios: Option<serde_json::Value>,
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: Option<f64>,
    pub is_active: Option<i32>,
    pub forward_rule_ids: Option<Vec<i64>>,
    pub enable_log_content: Option<i32>,
    pub site_discount: Option<f64>,
    pub site_discount_enabled: Option<i32>,
    pub global_discount: Option<f64>,
    pub global_discount_enabled: Option<i32>,
    pub logo: Option<String>,
    pub remark: Option<String>,
    pub description: Option<String>,
    pub feature_attributes: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelListResponse {
    pub data: Vec<Model>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ClassificationRequest {
    pub name: String,
    pub name_en: Option<String>,
    pub sort_order: i32,
    pub is_active: i32,
    pub remark: Option<String>,
    pub logo: Option<String>,
}
