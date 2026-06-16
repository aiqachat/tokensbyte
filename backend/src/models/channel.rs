#![allow(dead_code)]
use serde::{Deserialize, Serialize};

fn default_rate() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Channel {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub models: String,       // JSON array string
    pub model_mapping: String, // JSON object string
    pub user_groups: String,   // JSON array of user level ids/keys
    pub exclude_user_groups: String, // JSON array of excluded user level ids/keys (blacklist)
    #[sqlx(default)]
    pub group_aid: Option<String>,
    #[sqlx(default)]
    pub preset_id: Option<i64>,
    #[sqlx(default)]
    pub pool_id: Option<i64>,    // 关联的卡池ID
    #[sqlx(default)]
    pub gptimage_pool_id: Option<i64>, // GPT-Image卡池ID
    pub sort_order: i32,
    pub priority: i32,
    pub weight: i32,
    pub status: i32,           // 1=active, 0=disabled, 2=testing
    pub balance: Option<f64>,
    pub max_rps: Option<i32>,
    pub quota_limit: f64,      // 渠道使用最大额度（上限），-1 即代表无限额
    pub quota_used: f64,       // 该渠道累计真实消耗金额
    pub config: String,        // JSON extras
    pub rate: f64,
    pub created_at: String,
    pub updated_at: String,
}

impl Channel {
    pub fn get_models(&self) -> Vec<String> {
        serde_json::from_str(&self.models).unwrap_or_default()
    }

    pub fn get_user_groups(&self) -> Vec<String> {
        serde_json::from_str(&self.user_groups).unwrap_or_default()
    }

    pub fn get_exclude_user_groups(&self) -> Vec<String> {
        serde_json::from_str(&self.exclude_user_groups).unwrap_or_default()
    }

    pub fn get_model_mapping(&self) -> std::collections::HashMap<String, String> {
        serde_json::from_str(&self.model_mapping).unwrap_or_default()
    }

    pub fn resolve_model(&self, model: &str) -> String {
        let mapping = self.get_model_mapping();
        
        // 1. Exact match
        if let Some(target) = mapping.get(model) {
            return target.clone();
        }

        // 2. Regex match (keys starting with '/')
        for (pattern, target) in &mapping {
            if pattern.starts_with('/') {
                let p = pattern.trim_matches('/');
                if let Ok(re) = regex::Regex::new(p) {
                    if re.is_match(model) {
                        return target.clone();
                    }
                }
            }
        }

        model.to_string()
    }

    /// 获取渠道的 TOS 存储配置：返回 Some(过期天数) 表示开启，None 表示未开启
    pub fn tos_storage(&self) -> Option<i32> {
        let cfg: serde_json::Value = serde_json::from_str(&self.config).ok()?;
        if !cfg.get("tos_storage_enabled")?.as_bool()? {
            return None;
        }
        Some(cfg.get("tos_storage_days").and_then(|d| d.as_i64()).unwrap_or(1) as i32)
    }

}

#[derive(Debug, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub provider_type: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub models: Vec<String>,
    pub model_mapping: Option<std::collections::HashMap<String, String>>,
    pub user_groups: Option<Vec<String>>,
    pub exclude_user_groups: Option<Vec<String>>,
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub pool_id: Option<i64>,
    pub gptimage_pool_id: Option<i64>,
    pub sort_order: Option<i32>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub max_rps: Option<i32>,
    pub quota_limit: Option<f64>,
    pub quota_used: Option<f64>,
    pub config: Option<serde_json::Value>,
    #[serde(default = "default_rate")]
    pub rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelRequest {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub models: Option<Vec<String>>,
    pub model_mapping: Option<std::collections::HashMap<String, String>>,
    pub user_groups: Option<Vec<String>>,
    pub exclude_user_groups: Option<Vec<String>>,
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub pool_id: Option<i64>,
    pub gptimage_pool_id: Option<i64>,
    pub sort_order: Option<i32>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub status: Option<i32>,
    pub max_rps: Option<i32>,
    pub quota_limit: Option<f64>,
    pub quota_used: Option<f64>,
    pub config: Option<serde_json::Value>,
    pub rate: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ChannelListResponse {
    pub data: Vec<ChannelSafe>,
    pub total: i64,
}

/// Channel without API key for safe serialization
#[derive(Debug, Serialize)]
pub struct ChannelSafe {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
    pub models: Vec<String>,
    pub model_mapping: std::collections::HashMap<String, String>,
    pub user_groups: Vec<String>,
    pub exclude_user_groups: Vec<String>,
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub pool_id: Option<i64>,
    pub gptimage_pool_id: Option<i64>,
    pub sort_order: i32,
    pub priority: i32,
    pub weight: i32,
    pub status: i32,
    pub balance: Option<f64>,
    pub max_rps: Option<i32>,
    pub quota_limit: f64,      // 渠道额度上限
    pub quota_used: f64,       // 当前消耗总计
    pub rate: f64,
    pub created_at: String,
    pub updated_at: String,
    pub config: serde_json::Value,
}

impl ChannelSafe {
    /// 根据用户角色构建安全的响应数据
    /// - 管理员：返回原文密钥，前端通过 Input.Password 眼睛图标控制显隐
    /// - 非管理员：返回脱敏密钥，保证数据安全
    pub fn from_with_role(ch: Channel, is_admin: bool) -> Self {
        let models = ch.get_models();
        let model_mapping = ch.get_model_mapping();
        let user_groups = ch.get_user_groups();
        let exclude_user_groups = ch.get_exclude_user_groups();
        let key = if is_admin {
            ch.api_key.clone()
        } else {
            mask_secret(&ch.api_key)
        };
        Self {
            id: ch.id,
            name: ch.name,
            provider_type: ch.provider_type,
            base_url: ch.base_url,
            api_key: key,
            models,
            model_mapping,
            user_groups,
            exclude_user_groups,
            group_aid: ch.group_aid,
            preset_id: ch.preset_id,
            pool_id: ch.pool_id,
            gptimage_pool_id: ch.gptimage_pool_id,
            sort_order: ch.sort_order,
            priority: ch.priority,
            weight: ch.weight,
            status: ch.status,
            balance: ch.balance,
            max_rps: ch.max_rps,
            quota_limit: ch.quota_limit,
            quota_used: ch.quota_used,
            rate: ch.rate,
            created_at: ch.created_at,
            updated_at: ch.updated_at,
            config: serde_json::from_str(&ch.config).unwrap_or(serde_json::json!({})),
        }
    }
}

/// 脱敏工具：保留前4后4字符，中间用 ****** 替代；短于8字符则全部隐藏
pub fn mask_secret(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() > 8 {
        let prefix: String = chars[..4].iter().collect();
        let suffix: String = chars[chars.len()-4..].iter().collect();
        format!("{}******{}", prefix, suffix)
    } else if !s.is_empty() {
        "******".to_string()
    } else {
        String::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestChannelRequest {
    pub model: Option<String>,
    pub forward_rule_id: Option<i64>,
}

