use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaskLog {
    pub id: i64,
    pub user_id: String,
    pub channel_id: Option<i64>,
    pub platform: String,
    pub action_type: String,
    pub task_id: String,
    pub status: String,
    pub progress: i32,
    pub submit_time: Option<String>,
    pub end_time: Option<String>,
    pub time_spent: Option<i32>,
    pub details: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct TaskLogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    pub channel_id: Option<i64>,
    pub task_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskLogListResponse {
    pub data: Vec<TaskLog>,
    pub total: i64,
}
