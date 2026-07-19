use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Upstream {
    pub id: i64,
    pub name: String,
    pub upstream_type: String,
    pub sort_order: i32,
    pub is_active: i32,
    pub remark: Option<String>,
    pub config: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Deserialize)]
pub struct UpstreamRequest {
    pub name: String,
    pub upstream_type: String,
    pub sort_order: i32,
    pub is_active: i32,
    pub remark: Option<String>,
    pub config: Option<String>,
}
