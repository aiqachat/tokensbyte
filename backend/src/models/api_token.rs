#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiToken {
    pub id: i64,
    pub user_id: String,
    pub token_key: String,
    #[sqlx(default)]
    pub kid: Option<String>,
    pub name: String,
    pub quota_limit: f64,   // -1 = unlimited
    pub quota_used: f64,
    pub allowed_models: String,  // JSON array
    pub allowed_ips: String,
    pub rps_limit: i32,
    pub rpm_limit: i32,
    pub expires_at: Option<String>,

    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
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
}

#[derive(Debug, Serialize)]
pub struct TokenListResponse {
    pub data: Vec<ApiToken>,
    pub total: i64,
}
