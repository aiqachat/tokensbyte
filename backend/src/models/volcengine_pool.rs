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
    pub quota_unit: String,      // tokens / requests / images（配额计量单位）
    pub daily_reset_hour: i32,   // 每日配额刷新时间(时) 0~23
    pub daily_reset_minute: i32, // 每日配额刷新时间(分) 0~59
    pub period_start: String,    // 时段配额开始时间 HH:MM
    pub period_end: String,      // 时段配额结束时间 HH:MM
    pub default_daily_quota: f64,  // 账号默认每日配额限额
    pub default_hourly_quota: f64, // 账号默认每小时配额限额
    pub default_period_quota: f64, // 账号默认时段配额限额
    pub is_active: i32,          // 1=启用, 0=禁用
    pub remark: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ── 卡池账号表 ──────────────────────────────────────────────────

/// 卡池内的单个火山引擎账号
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct VolcenginePoolAccount {
    pub id: i64,
    pub pool_id: i64,            // 所属卡池
    pub name: String,            // 账号备注名
    pub api_key: String,         // 火山引擎 API Key
    pub status: String,          // active / disabled / exhausted
    pub daily_quota: f64,        // 每日配额(0=不限)
    pub hourly_quota: f64,       // 每小时配额(0=不限)
    pub period_quota: f64,       // 时段配额(0=不限)
    pub daily_used: f64,         // 今日已用
    pub hourly_used: f64,        // 本小时已用
    pub period_used: f64,        // 当前时段已用
    pub last_daily_reset: String,
    pub last_hourly_reset: String,
    pub last_period_reset: String,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub priority: i32,           // 优先级(越大越优先, sequential 模式用)
    pub created_at: String,
    pub updated_at: String,
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
pub struct CreatePoolRequest {
    pub name: String,
    pub pool_type: Option<String>,
    pub strategy: Option<String>,
    pub quota_unit: Option<String>,
    pub daily_reset_hour: Option<i32>,
    pub daily_reset_minute: Option<i32>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub default_daily_quota: Option<f64>,
    pub default_hourly_quota: Option<f64>,
    pub default_period_quota: Option<f64>,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePoolRequest {
    pub name: Option<String>,
    pub pool_type: Option<String>,
    pub strategy: Option<String>,
    pub quota_unit: Option<String>,
    pub daily_reset_hour: Option<i32>,
    pub daily_reset_minute: Option<i32>,
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub default_daily_quota: Option<f64>,
    pub default_hourly_quota: Option<f64>,
    pub default_period_quota: Option<f64>,
    pub is_active: Option<i32>,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePoolAccountRequest {
    pub name: String,
    pub api_key: String,
    pub daily_quota: Option<f64>,
    pub hourly_quota: Option<f64>,
    pub period_quota: Option<f64>,
    pub priority: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePoolAccountRequest {
    pub name: Option<String>,
    pub api_key: Option<String>,
    pub status: Option<String>,
    pub daily_quota: Option<f64>,
    pub hourly_quota: Option<f64>,
    pub period_quota: Option<f64>,
    pub priority: Option<i32>,
}

/// API Key 脱敏后的账号信息（返回给前端）
#[derive(Debug, Serialize)]
pub struct PoolAccountSafe {
    pub id: i64,
    pub pool_id: i64,
    pub name: String,
    pub api_key_masked: String,
    pub status: String,
    pub daily_quota: f64,
    pub hourly_quota: f64,
    pub period_quota: f64,
    pub daily_used: f64,
    pub hourly_used: f64,
    pub period_used: f64,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub priority: i32,
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
        PoolAccountSafe {
            id: self.id,
            pool_id: self.pool_id,
            name: self.name.clone(),
            api_key_masked: masked,
            status: self.status.clone(),
            daily_quota: self.daily_quota,
            hourly_quota: self.hourly_quota,
            period_quota: self.period_quota,
            daily_used: self.daily_used,
            hourly_used: self.hourly_used,
            period_used: self.period_used,
            last_error: self.last_error.clone(),
            last_error_at: self.last_error_at.clone(),
            priority: self.priority,
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
        }
    }
}
