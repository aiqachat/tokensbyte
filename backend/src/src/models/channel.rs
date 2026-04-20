#![allow(dead_code)]
use serde::{Deserialize, Serialize};

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
    #[sqlx(default)]
    pub group_aid: Option<String>,
    #[sqlx(default)]
    pub preset_id: Option<i64>,
    pub priority: i32,
    pub weight: i32,
    pub status: i32,           // 1=active, 0=disabled, 2=testing
    pub balance: Option<f64>,
    pub max_rps: Option<i32>,
    pub config: String,        // JSON extras
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
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub max_rps: Option<i32>,
    pub config: Option<serde_json::Value>,
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
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub priority: Option<i32>,
    pub weight: Option<i32>,
    pub status: Option<i32>,
    pub max_rps: Option<i32>,
    pub config: Option<serde_json::Value>,
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
    pub group_aid: Option<String>,
    pub preset_id: Option<i64>,
    pub priority: i32,
    pub weight: i32,
    pub status: i32,
    pub balance: Option<f64>,
    pub max_rps: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<Channel> for ChannelSafe {
    fn from(ch: Channel) -> Self {
        let models = ch.get_models();
        let model_mapping = ch.get_model_mapping();
        let user_groups = ch.get_user_groups();
        Self {
            id: ch.id,
            name: ch.name,
            provider_type: ch.provider_type,
            base_url: ch.base_url,
            api_key: ch.api_key,
            models,
            model_mapping,
            user_groups,
            group_aid: ch.group_aid,
            preset_id: ch.preset_id,
            priority: ch.priority,
            weight: ch.weight,
            status: ch.status,
            balance: ch.balance,
            max_rps: ch.max_rps,
            created_at: ch.created_at,
            updated_at: ch.updated_at,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestChannelRequest {
    pub model: Option<String>,
    pub forward_rule_id: Option<i32>,
}

