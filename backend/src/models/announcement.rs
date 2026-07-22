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
pub struct Announcement {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub is_pinned: i32,
    pub is_active: i32,
    pub created_at: DbTs,
    pub updated_at: DbTs,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnouncementReq {
    pub title: String,
    pub content: String,
    pub is_pinned: i32,
    pub is_active: i32,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAnnouncementReq {
    pub title: Option<String>,
    pub content: Option<String>,
    pub is_pinned: Option<i32>,
    pub is_active: Option<i32>,
}
