#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Model {
    pub id: i64,
    pub mid: String,        // 6位系统识别码，永久不变
    pub name: String,
    pub model_id: String,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub group_ratios: String, // {"default": 1.0, "vip": 0.8}
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: f64,
    pub is_active: i32,
    pub forward_rule_ids: Option<String>,
    pub enable_log_content: i32,
    #[sqlx(default)]
    pub site_discount: f64,         // 折扣限价倍率（开启时折扣不低于此值，1.0=原价）
    #[sqlx(default)]
    pub site_discount_enabled: i32, // 折扣限价开关（0=关，1=开，开启后取 MAX(限价, 等级折扣)）
    #[sqlx(default)]
    pub logo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    pub fixed_rate: f64,
    pub duration_rate: f64,
    pub billing_rule: String,
    pub pricing_tiers: String,
    pub extended_config: String,
    pub is_active: i32,
    pub is_system: i32,
    pub pid: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBillingRuleRequest {
    pub name: String,
    pub billing_type: String,
    pub prompt_rate: f64,
    pub completion_rate: f64,
    #[serde(default)]
    pub cached_rate: f64,
    pub fixed_rate: f64,
    pub duration_rate: f64,
    pub billing_rule: String,
    pub pricing_tiers: Option<serde_json::Value>,
    pub extended_config: Option<serde_json::Value>,
    #[serde(default = "default_active")]
    pub is_active: i32,
    pub pid: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBillingRuleRequest {
    pub name: Option<String>,
    pub billing_type: Option<String>,
    pub prompt_rate: Option<f64>,
    pub completion_rate: Option<f64>,
    pub cached_rate: Option<f64>,
    pub fixed_rate: Option<f64>,
    pub duration_rate: Option<f64>,
    pub billing_rule: Option<String>,
    pub pricing_tiers: Option<serde_json::Value>,
    pub extended_config: Option<serde_json::Value>,
    pub is_active: Option<i32>,
    pub pid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingTier {
    pub max_prompt_tokens: i32,
    pub max_completion_tokens: Option<i32>,
    pub prompt_rate: f64,
    pub completion_rate: f64,
    /// 缓存 Token 费率（/1M），属于输入的子集，#[serde(default)] 兼容旧数据
    #[serde(default)]
    pub cached_rate: f64,
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
    pub created_at: String,
    pub updated_at: String,
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
}

pub fn default_active() -> i32 { 1 }

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelProvider {
    pub id: i64,
    pub name: String,
    pub sort_order: i32,
    pub is_active: i32,
    #[serde(default)]
    pub is_system: i32,
    pub remark: Option<String>,
    #[sqlx(default)]
    pub logo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelType {
    pub id: i64,
    pub name: String,
    pub sort_order: i32,
    pub is_active: i32,
    #[serde(default)]
    pub is_system: i32,
    #[sqlx(default)]
    pub logo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ClassificationCount {
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub is_system: i32,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct ClassificationsResponse {
    pub providers: Vec<ClassificationCount>,
    pub types: Vec<ClassificationCount>,
}

impl Model {
    pub fn get_group_ratios(&self) -> std::collections::HashMap<String, f64> {
        serde_json::from_str(&self.group_ratios).unwrap_or_default()
    }

    pub fn get_multiplier_for_group(&self, group: &str) -> f64 {
        let ratios = self.get_group_ratios();
        *ratios.get(group).or_else(|| ratios.get("default")).unwrap_or(&1.0)
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateModelRequest {
    pub name: String,
    pub model_id: String,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub group_ratios: Option<serde_json::Value>,
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: Option<f64>,
    pub forward_rule_ids: Option<Vec<i64>>,
    pub is_active: Option<i32>,
    pub enable_log_content: Option<i32>,
    pub site_discount: Option<f64>,
    pub site_discount_enabled: Option<i32>,
    pub logo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub name: Option<String>,
    pub model_id: Option<String>,
    pub provider_id: Option<i64>,
    pub type_id: Option<i64>,
    pub group_ratios: Option<serde_json::Value>,
    pub billing_rule_id: Option<i64>,
    pub pre_deduction: Option<f64>,
    pub is_active: Option<i32>,
    pub forward_rule_ids: Option<Vec<i64>>,
    pub enable_log_content: Option<i32>,
    pub site_discount: Option<f64>,
    pub site_discount_enabled: Option<i32>,
    pub logo: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelListResponse {
    pub data: Vec<Model>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ClassificationRequest {
    pub name: String,
    pub sort_order: i32,
    pub is_active: i32,
    pub remark: Option<String>,
    pub logo: Option<String>,
}
