use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Redemption {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub quota: f64,
    pub is_used: i32,
    pub used_at: Option<String>,
    pub used_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRedemptionRequest {
    pub name: String,
    pub count: i32,
    pub quota: f64,
}

#[derive(Debug, Deserialize)]
pub struct RedeemRequest {
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct RedemptionListResponse {
    pub data: Vec<Redemption>,
    pub total: i64,
}
