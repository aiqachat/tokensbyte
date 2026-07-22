/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::time_system::DbTs;
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
    #[sqlx(default)]
    pub category: String, // user=用户增强插件, system=系统增强插件, system_builtin=系统内置
    pub created_at: DbTs,
    pub updated_at: DbTs,
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
    pub category: Option<String>,
    pub asset_id: Option<String>,
    pub remark: Option<String>,
    pub sort_order: Option<i64>,
    pub group_id: Option<String>,
    pub content_hash: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetAuditRequest {
    pub status: String,
    pub reject_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct PluginAssetGroup {
    pub id: i64,
    pub user_id: String,
    pub group_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}
