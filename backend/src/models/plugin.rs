use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Plugin {
    pub id: i64,
    pub name: String,
    pub title: String,
    pub description: Option<String>,
    pub is_enabled: i64,
    pub allowed_levels: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct PluginAsset {
    pub id: i64,
    pub user_id: String,
    pub asset_type: String,
    pub source: String,
    pub status: String,
    pub file_name: String,
    pub file_url: String,
    pub mime_type: Option<String>,
    pub size: Option<i64>,
    pub reject_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetAuditRequest {
    pub status: String,
    pub reject_reason: Option<String>,
}
