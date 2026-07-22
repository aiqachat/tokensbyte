/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

fn default_rate() -> f64 {
    1.0
}

fn default_weight() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelConfig {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub remark: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    #[sqlx(default)]
    pub yid: String,
    #[sqlx(default)]
    pub sort_order: i32,
    pub rate: f64,
    #[sqlx(default)]
    pub priority: i32,
    #[sqlx(default)]
    pub weight: i32,
    #[sqlx(default)]
    pub quota_limit: f64,
    #[sqlx(default)]
    pub quota_used: f64,
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
    pub last_reset_day: String,
    #[sqlx(default)]
    pub last_reset_week: String,
    #[sqlx(default)]
    pub last_reset_month: String,
}

impl ChannelConfig {
    pub fn has_available_quota(&self, now_day: &str, now_week: &str, now_month: &str) -> bool {
        crate::models::channel_quota::has_available_quota(
            self.quota_limit,
            self.quota_used,
            self.daily_quota_limit,
            self.daily_quota_used,
            &self.last_reset_day,
            now_day,
            self.weekly_quota_limit,
            self.weekly_quota_used,
            &self.last_reset_week,
            now_week,
            self.monthly_quota_limit,
            self.monthly_quota_used,
            &self.last_reset_month,
            now_month,
        )
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateChannelConfigRequest {
    pub name: String,
    #[serde(default)]
    pub provider_type: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    pub remark: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default = "default_rate")]
    pub rate: f64,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_weight")]
    pub weight: i32,
    pub quota_limit: Option<f64>,
    pub daily_quota_limit: Option<f64>,
    pub weekly_quota_limit: Option<f64>,
    pub monthly_quota_limit: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelConfigRequest {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub remark: Option<String>,
    pub sort_order: Option<i32>,
    pub rate: Option<f64>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub quota_limit: Option<f64>,
    pub daily_quota_limit: Option<f64>,
    pub weekly_quota_limit: Option<f64>,
    pub monthly_quota_limit: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ChannelConfigListResponse {
    pub data: Vec<ChannelConfigSafe>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct ChannelConfigSafe {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
    pub has_api_key: bool,
    pub remark: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub yid: String,
    pub sort_order: i32,
    pub rate: f64,
    pub priority: i32,
    pub weight: i32,
    pub quota_limit: f64,
    pub quota_used: f64,
    pub daily_quota_limit: f64,
    pub daily_quota_used: f64,
    pub weekly_quota_limit: f64,
    pub weekly_quota_used: f64,
    pub monthly_quota_limit: f64,
    pub monthly_quota_used: f64,
    pub last_reset_day: String,
    pub last_reset_week: String,
    pub last_reset_month: String,
}

impl ChannelConfigSafe {
    /// 根据用户角色构建安全的响应数据
    /// - 管理员：返回原文密钥，前端通过 Input.Password 眼睛图标控制显隐
    /// - 非管理员：返回脱敏密钥，保证数据安全
    pub fn from_with_role(c: ChannelConfig, is_admin: bool) -> Self {
        let key = if is_admin {
            c.api_key.clone()
        } else {
            crate::models::channel::mask_secret(&c.api_key)
        };
        ChannelConfigSafe {
            id: c.id,
            name: c.name,
            provider_type: c.provider_type,
            base_url: c.base_url,
            has_api_key: !c.api_key.is_empty(),
            api_key: key,
            remark: c.remark,
            created_at: c.created_at.into_string(),
            updated_at: c.updated_at.into_string(),
            yid: c.yid,
            sort_order: c.sort_order,
            rate: c.rate,
            priority: c.priority,
            weight: c.weight,
            quota_limit: c.quota_limit,
            quota_used: c.quota_used,
            daily_quota_limit: c.daily_quota_limit,
            daily_quota_used: c.daily_quota_used,
            weekly_quota_limit: c.weekly_quota_limit,
            weekly_quota_used: c.weekly_quota_used,
            monthly_quota_limit: c.monthly_quota_limit,
            monthly_quota_used: c.monthly_quota_used,
            last_reset_day: c.last_reset_day,
            last_reset_week: c.last_reset_week,
            last_reset_month: c.last_reset_month,
        }
    }
}
