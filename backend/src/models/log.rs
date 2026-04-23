#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: i64,
    pub user_id: String,
    pub channel_id: Option<i64>,
    pub token_id: Option<i64>,
    pub model: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    pub endpoint: String,
    pub error_message: Option<String>,
    #[sqlx(default)]
    pub upstream_url: Option<String>,
    #[sqlx(default)]
    pub channel_group_aid: Option<String>,
    #[sqlx(default)]
    pub request_content: Option<String>,
    #[sqlx(default)]
    pub response_content: Option<String>,
    #[sqlx(default)]
    pub upstream_req_content: Option<String>,
    #[sqlx(default)]
    pub is_stream: Option<i32>,
    #[sqlx(default)]
    pub token_name: Option<String>,
    #[sqlx(default)]
    pub token_kid: Option<String>,
    #[sqlx(default)]
    pub user_nickname: Option<String>,
    #[sqlx(default)]
    pub user_group: Option<String>,
    #[sqlx(default)]
    pub user_uid: Option<String>,
    #[sqlx(default)]
    pub channel_name: Option<String>,
    #[sqlx(default)]
    pub billing_detail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    pub model: Option<String>,
    pub channel_id: Option<i64>,
    pub token_id: Option<i64>,
    pub status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LogListResponse {
    pub data: Vec<RequestLog>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub total_users: i64,
    pub total_channels: i64,
    pub active_tokens: i64,
    pub today_requests: i64,
    pub today_cost: f64,
    pub recent_logs: Vec<RequestLog>,
    pub model_stats: Vec<ModelStat>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ModelStat {
    pub model: String,
    pub count: i64,
    #[sqlx(default)]
    pub total_tokens: Option<i64>,
    #[sqlx(default)]
    pub total_cost: Option<f64>,
}
