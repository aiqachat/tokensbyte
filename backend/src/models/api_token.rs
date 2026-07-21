#![allow(dead_code)]
use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

/// 令牌周期额度键：按 **timedisplay**（用户/站点显示时区）计算自然日/周/月。
/// 底层时钟仍为 UTC（timesystem）；切勿传入进程 Local。
pub fn quota_period_keys(tz_name: &str) -> (String, String, String) {
    let keys = crate::time_system::local_period_keys(tz_name);
    (keys.day, keys.week, keys.month)
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiToken {
    pub id: i64,
    pub user_id: String,
    pub token_key: String,
    #[sqlx(default)]
    pub kid: Option<String>,
    pub name: String,
    pub quota_limit: f64, // -1 = unlimited
    pub quota_used: f64,
    pub allowed_models: String, // JSON array
    pub allowed_ips: String,
    pub rps_limit: i32,
    pub rpm_limit: i32,
    pub expires_at: Option<DbTs>,

    pub is_active: i64,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    #[sqlx(default)]
    pub last_used_at: Option<DbTs>,
    #[sqlx(default)]
    pub only_playground: i64,
    #[sqlx(default)]
    pub high_availability: i32,
    #[sqlx(default)]
    pub daily_quota_limit: f64,
    #[sqlx(default)]
    pub daily_quota_used: f64,
    #[sqlx(default)]
    pub weekly_quota_limit: f64,
    #[sqlx(default)]
    pub weekly_quota_used: f64,
    #[sqlx(default)]
    pub monthly_quota_limit: f64,
    #[sqlx(default)]
    pub monthly_quota_used: f64,
    #[sqlx(default)]
    pub last_reset_day: Option<String>,
    #[sqlx(default)]
    pub last_reset_week: Option<String>,
    #[sqlx(default)]
    pub last_reset_month: Option<String>,
    /// 当前日周期有效已用（非 DB 列，列表/详情由后端填充）
    #[sqlx(default)]
    #[serde(default)]
    pub current_daily_quota_used: Option<f64>,
    #[sqlx(default)]
    #[serde(default)]
    pub current_weekly_quota_used: Option<f64>,
    #[sqlx(default)]
    #[serde(default)]
    pub current_monthly_quota_used: Option<f64>,
}

impl ApiToken {
    pub fn get_allowed_models(&self) -> Vec<String> {
        serde_json::from_str(&self.allowed_models).unwrap_or_default()
    }

    pub fn is_model_allowed(&self, model: &str) -> bool {
        let models = self.get_allowed_models();
        if models.is_empty() {
            return true; // Empty = all models allowed
        }
        models.iter().any(|m| m == model)
    }

    pub fn is_expired(&self) -> bool {
        if let Some(ref expires) = self.expires_at {
            if let Ok(exp) = chrono::NaiveDateTime::parse_from_str(expires, "%Y-%m-%d %H:%M:%S") {
                return exp < chrono::Utc::now().naive_utc();
            }
        }
        false
    }

    pub fn has_quota(&self) -> bool {
        if self.quota_limit < 0.0 {
            return true; // Unlimited
        }
        self.quota_used < self.quota_limit
    }

    pub fn effective_daily_used(&self, now_day: &str) -> f64 {
        if self.last_reset_day.as_deref().unwrap_or("") != now_day {
            0.0
        } else {
            self.daily_quota_used
        }
    }

    pub fn effective_weekly_used(&self, now_week: &str) -> f64 {
        if self.last_reset_week.as_deref().unwrap_or("") != now_week {
            0.0
        } else {
            self.weekly_quota_used
        }
    }

    pub fn effective_monthly_used(&self, now_month: &str) -> f64 {
        if self.last_reset_month.as_deref().unwrap_or("") != now_month {
            0.0
        } else {
            self.monthly_quota_used
        }
    }

    pub fn fill_current_period_usage(&mut self, now_day: &str, now_week: &str, now_month: &str) {
        self.current_daily_quota_used = Some(self.effective_daily_used(now_day));
        self.current_weekly_quota_used = Some(self.effective_weekly_used(now_week));
        self.current_monthly_quota_used = Some(self.effective_monthly_used(now_month));
    }

    pub fn check_quota_limits(
        &self,
        now_day: &str,
        now_week: &str,
        now_month: &str,
    ) -> Result<(), String> {
        if self.quota_limit >= 0.0 && self.quota_used >= self.quota_limit {
            return Err("总额度已耗尽".to_string());
        }
        if self.daily_quota_limit >= 0.0 {
            let used = self.effective_daily_used(now_day);
            if used >= self.daily_quota_limit {
                return Err("今日额度已耗尽".to_string());
            }
        }
        if self.weekly_quota_limit >= 0.0 {
            let used = self.effective_weekly_used(now_week);
            if used >= self.weekly_quota_limit {
                return Err("本周额度已耗尽".to_string());
            }
        }
        if self.monthly_quota_limit >= 0.0 {
            let used = self.effective_monthly_used(now_month);
            if used >= self.monthly_quota_limit {
                return Err("本月额度已耗尽".to_string());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateTokenRequest {
    pub name: Option<String>,
    pub quota_limit: Option<f64>,
    pub allowed_models: Option<Vec<String>>,
    pub allowed_ips: Option<String>,
    pub rps_limit: Option<i32>,
    pub rpm_limit: Option<i32>,
    pub expires_at: Option<String>,
    pub only_playground: Option<i64>,
    pub high_availability: Option<i32>,
    pub daily_quota_limit: Option<f64>,
    pub weekly_quota_limit: Option<f64>,
    pub monthly_quota_limit: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTokenRequest {
    pub name: Option<String>,
    pub quota_limit: Option<f64>,
    pub allowed_models: Option<Vec<String>>,
    pub allowed_ips: Option<String>,
    pub rps_limit: Option<i32>,
    pub rpm_limit: Option<i32>,
    pub expires_at: Option<String>,
    pub is_active: Option<i64>,
    pub only_playground: Option<i64>,
    pub high_availability: Option<i32>,
    pub daily_quota_limit: Option<f64>,
    pub weekly_quota_limit: Option<f64>,
    pub monthly_quota_limit: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct TokenListResponse {
    pub data: Vec<ApiToken>,
    pub total: i64,
}
