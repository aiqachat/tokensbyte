use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Announcement {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub is_pinned: i32,
    pub is_active: i32,
    pub created_at: String,
    pub updated_at: String,
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
