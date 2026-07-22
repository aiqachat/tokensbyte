/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AdminGroup {
    pub id: i64,
    pub name: String,
    pub permissions: Option<String>, // Stores JSON array as string
    pub description: Option<String>,
    #[sqlx(default)]
    pub sort_order: i32,
    #[sqlx(default)]
    pub user_count: Option<i64>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Deserialize)]
pub struct CreateAdminGroupRequest {
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAdminGroupRequest {
    pub name: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct AdminGroupListResponse {
    pub data: Vec<AdminGroup>,
    pub total: i64,
}
