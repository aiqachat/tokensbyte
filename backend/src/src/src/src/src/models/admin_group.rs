use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AdminGroup {
    pub id: i64,
    pub name: String,
    pub permissions: Option<String>, // Stores JSON array as string
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAdminGroupRequest {
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAdminGroupRequest {
    pub name: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AdminGroupListResponse {
    pub data: Vec<AdminGroup>,
    pub total: i64,
}
