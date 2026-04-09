use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Model {
    pub id: i64,
    pub name: String,
    pub model_id: String,
    pub provider_id: Option<i32>,
    pub type_id: Option<i32>,
    pub billing_type: String, // tokens, requests, duration
    pub prompt_rate: f64,     // Price per 1k tokens
    pub completion_rate: f64, // Price per 1k tokens
    pub fixed_rate: f64,      // Price per request
    pub duration_rate: f64,   // Price per second
    pub group_ratios: String, // JSON object string: {"default": 1.0, "vip": 0.8}
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelProvider {
    pub id: i32,
    pub name: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelType {
    pub id: i32,
    pub name: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ClassificationCount {
    pub id: Option<i32>,
    pub name: String,
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
    pub provider_id: Option<i32>,
    pub type_id: Option<i32>,
    pub billing_type: String,
    #[serde(default)]
    pub prompt_rate: f64,
    #[serde(default)]
    pub completion_rate: f64,
    #[serde(default)]
    pub fixed_rate: f64,
    #[serde(default)]
    pub duration_rate: f64,
    #[serde(default)]
    pub group_ratios: Option<std::collections::HashMap<String, f64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateModelRequest {
    pub name: Option<String>,
    pub model_id: Option<String>,
    pub provider_id: Option<i32>,
    pub type_id: Option<i32>,
    pub billing_type: Option<String>,
    pub prompt_rate: Option<f64>,
    pub completion_rate: Option<f64>,
    pub fixed_rate: Option<f64>,
    pub duration_rate: Option<f64>,
    pub group_ratios: Option<std::collections::HashMap<String, f64>>,
    pub is_active: Option<bool>,
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
    pub is_active: bool,
}
