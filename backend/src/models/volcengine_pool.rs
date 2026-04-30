#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ── 卡池主表 ────────────────────────────────────────────────────

/// 火山引擎卡池配置
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolcenginePool {
    pub id: i64,
    pub name: String,            // 卡池名称
    pub pool_type: String,       // chat / image / video / custom
    pub strategy: String,        // random / sequential（调度策略）
    pub is_active: i32,          // 1=启用, 0=禁用
    pub remark: Option<String>,
    pub model_id: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── 卡池账号表 ──────────────────────────────────────────────────

/// 卡池内的单个火山引擎账号
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolcenginePoolAccount {
    pub id: i64,
    pub name: String,            // 账号备注名
    pub base_url: String,        // 请求地址
    pub api_key: String,         // 火山引擎 API Key
    pub account_id: String,      // 账号 ID (可选)
    pub access_key: String,      // Access Key (可选)
    pub secret_key: String,      // Secret Key (可选)
    pub models: String,          // 支持的模型列表
    pub status: String,          // active / disabled / exhausted
    pub quota_unit: String,      // tokens / requests / images
    pub daily_reset_hour: i32,
    pub daily_reset_minute: i32,
    pub period_start: String,
    pub period_end: String,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── 映射表结构体 ──────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolcenginePoolAccountMapping {
    pub pool_id: i64,
    pub account_id: i64,
    pub status: String,
    pub quota_unit: String,
    pub daily_reset_hour: i32,
    pub daily_reset_minute: i32,
    pub period_start: String,
    pub period_end: String,
    pub daily_quota: f64,
    pub hourly_quota: f64,
    pub period_quota: f64,
    pub daily_used: f64,
    pub hourly_used: f64,
    pub period_used: f64,
    pub last_daily_reset: String,
    pub last_hourly_reset: String,
    pub last_period_reset: String,
    pub priority: i32,
}

// ── 调度日志表 ──────────────────────────────────────────────────

/// 卡池调度使用日志
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolcenginePoolLog {
    pub id: i64,
    pub pool_id: i64,
    pub account_id: i64,
    pub account_name: String,
    pub model_id: String,
    pub channel_id: i64,
    pub usage_amount: f64,
    pub quota_unit: String,
    pub status: String,          // success / failed
    pub error_message: Option<String>,
    pub created_at: String,
}

// ── 请求/响应结构体 ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct PoolAccountConfig {
    pub account_id: i64,
    pub status: Option<String>,
    pub quota_unit: Option<String>,
    pub daily_reset_hour: Option<i32>,
    pub daily_reset_minute: Option<i32>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub daily_quota: Option<f64>,
    pub hourly_quota: Option<f64>,
    pub period_quota: Option<f64>,
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePoolRequest {
    pub name: String,
    pub pool_type: Option<String>,
    pub strategy: Option<String>,
    pub remark: Option<String>,
    pub model_id: Option<String>,
    pub account_ids: Option<Vec<i64>>, // 绑定的账号ID列表
    pub accounts: Option<Vec<PoolAccountConfig>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePoolRequest {
    pub name: Option<String>,
    pub pool_type: Option<String>,
    pub strategy: Option<String>,
    pub is_active: Option<i32>,
    pub remark: Option<String>,
    pub model_id: Option<String>,
    pub account_ids: Option<Vec<i64>>, // 更新绑定的账号ID列表
    pub accounts: Option<Vec<PoolAccountConfig>>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePoolAccountRequest {
    pub name: String,
    pub base_url: Option<String>,
    pub api_key: String,
    pub account_id: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub models: Option<String>,
    pub quota_unit: Option<String>,
    pub daily_reset_hour: Option<i32>,
    pub daily_reset_minute: Option<i32>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePoolAccountRequest {
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub account_id: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub models: Option<String>,
    pub status: Option<String>,
    pub quota_unit: Option<String>,
    pub daily_reset_hour: Option<i32>,
    pub daily_reset_minute: Option<i32>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
}

/// API Key 脱敏后的账号信息（返回给前端）
#[derive(Debug, Serialize)]
pub struct PoolAccountSafe {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub api_key_masked: String,
    pub account_id: String,
    pub access_key: String,
    pub secret_key_masked: String,
    pub models: String,
    pub status: String,
    pub quota_unit: String,
    pub daily_reset_hour: i32,
    pub daily_reset_minute: i32,
    pub period_start: String,
    pub period_end: String,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl VolcenginePoolAccount {
    /// 将 API Key 脱敏后返回安全版本
    pub fn to_safe(&self) -> PoolAccountSafe {
        let masked = {
            let cc = self.api_key.chars().count();
            if cc > 8 {
                let prefix: String = self.api_key.chars().take(4).collect();
                let suffix: String = self.api_key.chars().skip(cc - 4).collect();
                format!("{}******{}", prefix, suffix)
            } else {
                "******".to_string()
            }
        };
        let secret_masked = {
            let cc = self.secret_key.chars().count();
            if cc > 8 {
                let prefix: String = self.secret_key.chars().take(4).collect();
                let suffix: String = self.secret_key.chars().skip(cc - 4).collect();
                format!("{}******{}", prefix, suffix)
            } else if cc > 0 {
                "******".to_string()
            } else {
                "".to_string()
            }
        };

        PoolAccountSafe {
            id: self.id,
            name: self.name.clone(),
            base_url: self.base_url.clone(),
            api_key_masked: masked,
            account_id: self.account_id.clone(),
            access_key: self.access_key.clone(),
            secret_key_masked: secret_masked,
            models: self.models.clone(),
            status: self.status.clone(),
            quota_unit: self.quota_unit.clone(),
            daily_reset_hour: self.daily_reset_hour,
            daily_reset_minute: self.daily_reset_minute,
            period_start: self.period_start.clone(),
            period_end: self.period_end.clone(),
            last_error: self.last_error.clone(),
            last_error_at: self.last_error_at.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}
