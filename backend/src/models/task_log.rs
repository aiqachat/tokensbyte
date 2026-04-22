use serde::{Deserialize, Serialize};

/// 任务日志 — 直接映射 logs 表 JOIN channels/users 的结果集
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaskLog {
    pub id: i64,
    pub user_id: String,
    pub channel_id: Option<i64>,
    pub model: String,
    pub endpoint: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    #[sqlx(default)]
    pub error_message: Option<String>,
    #[sqlx(default)]
    pub request_content: Option<String>,
    #[sqlx(default)]
    pub response_content: Option<String>,
    #[sqlx(default)]
    pub billing_detail: Option<String>,
    #[sqlx(default)]
    pub channel_name: Option<String>,
    #[sqlx(default)]
    pub channel_group_aid: Option<String>,
    #[sqlx(default)]
    pub user_nickname: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TaskLogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    /// 类型筛选: chat / image / video
    pub action_type: Option<String>,
    pub model: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskLogListResponse {
    pub data: Vec<TaskLog>,
    pub total: i64,
}
