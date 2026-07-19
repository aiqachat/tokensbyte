use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct SiteIcon {
    pub id: i64,
    pub name: String,
    pub title: String,
    pub file_path: String, // 相对路径，如 icons/openai.svg
    pub source: String,    // lobe-icons / custom
    pub category: String,  // AI品牌 / 自定义
    pub tags: String,      // JSON 数组
    pub is_active: i64,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct SiteIconSyncLog {
    pub id: i64,
    pub total_synced: i64,
    pub total_new: i64,
    pub total_updated: i64,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: DbTs,
}

#[derive(Debug, Deserialize)]
pub struct CreateSiteIconReq {
    pub name: String,
    pub title: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub svg_content: String, // 前端传 SVG 字符串，后端写文件
}

#[derive(Debug, Deserialize)]
pub struct UpdateSiteIconReq {
    pub name: Option<String>,
    pub title: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_active: Option<i64>,
    pub svg_content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SiteIconQuery {
    pub q: Option<String>,
    pub category: Option<String>,
    pub source: Option<String>,
    pub page: Option<i64>,
    pub size: Option<i64>,
}
