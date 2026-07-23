/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

fn is_false(v: &bool) -> bool {
    !*v
}

/// 任务日志 — 直接映射 logs 表 JOIN channels/users 的结果集
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaskLog {
    pub id: i64,
    #[sqlx(default)]
    pub log_id: Option<String>,
    pub user_id: String,
    pub channel_id: Option<i64>,
    pub model: String,
    pub endpoint: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    #[sqlx(default)]
    pub cached_tokens: i32,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    #[sqlx(default)]
    pub error_message: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_content: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_content: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_response: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_detail: Option<String>,
    /// 列表结算标记（不传 billing_detail 全文）
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_false")]
    pub billing_failed: bool,
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_false")]
    pub billing_frozen: bool,
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_false")]
    pub billing_present: bool,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_group_aid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_provider_type: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_nickname: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_uid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_type: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub yid: Option<String>, // JOIN channel_configs.yid，非 logs 列
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_pid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forward_eid: Option<String>,
    /// 列表直接返回产物媒体地址，供预览；不受 allow_view_log_details 限制
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preview_urls: Vec<String>,
    pub created_at: DbTs,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TaskLogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    /// 类型筛选: chat / image / video
    pub action_type: Option<String>,
    pub model: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub log_id: Option<String>,
    pub task_id: Option<String>,
    pub search_keyword: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskLogListResponse {
    pub data: Vec<TaskLog>,
    pub total: i64,
    pub allow_details: bool,
}
