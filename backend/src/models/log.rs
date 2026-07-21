#![allow(dead_code)]
use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

fn is_false(v: &bool) -> bool {
    !*v
}

fn is_zero_i32(v: &i32) -> bool {
    *v == 0
}

fn is_zero_f64(v: &f64) -> bool {
    *v == 0.0
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequestLog {
    pub id: i64,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_id: Option<String>,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_id: Option<i64>,
    pub model: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    /// 缓存命中的 Token 数量（属于输入的子集）
    #[sqlx(default)]
    pub cached_tokens: i32,
    pub cost: f64,
    pub latency_ms: i32,
    pub status_code: i32,
    pub endpoint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_url: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_group_aid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub yid: Option<String>, // 读路径由 JOIN channel_configs.yid 填充，非 logs 列
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_provider_type: Option<String>,
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
    pub upstream_req_content: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_stream: Option<i32>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_name: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_kid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_nickname: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_group: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_level_name: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_uid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    /// 列表通常为 None；全文走 detail
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_detail: Option<String>,
    /// 列表轻量标记（不传 billing_detail 全文）
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_false")]
    pub billing_refunded: bool,
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_false")]
    pub billing_failed: bool,
    /// 列表用量数字（SQL 从 billing_detail 抽出）
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub billing_cache_creation: i32,
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub billing_cache_read: i32,
    #[sqlx(default)]
    #[serde(default, skip_serializing_if = "is_zero_f64")]
    pub billing_web_search: f64,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_pid: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forward_eid: Option<String>,
    /// POST 阶段提取的计费特征快照 (JSON)，独立于 enable_log 开关
    #[sqlx(default)]
    #[serde(skip_serializing)]
    pub billing_features: Option<String>,
    /// 预扣费中从赠送余额扣除的金额，用于退款时精准归还
    #[sqlx(default)]
    pub pre_deduct_gift: f64,
    /// 插件标记JSON，如快乐小马的路由信息
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_tag: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_type: Option<String>,
    /// 任务是否已终结(1=已完成,0=进行中或待结算)
    #[sqlx(default)]
    pub is_completed: i16,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_config_id: Option<i32>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_channel_name: Option<String>,
    #[sqlx(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    pub created_at: DbTs,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub user_id: Option<String>,
    pub model: Option<String>,
    pub channel_id: Option<i64>,
    pub channel_group_aid: Option<String>,
    pub token_id: Option<i64>,
    pub status: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub uid: Option<String>,
    pub router_ep: Option<String>,
    pub action_type: Option<String>,
    pub log_id: Option<String>,
    pub token_kid: Option<String>,
    pub task_id: Option<String>,
    pub search_keyword: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LogListResponse {
    pub data: Vec<RequestLog>,
    pub total: i64,
    pub allow_details: bool,
    /// 筛选范围内的汇总统计
    pub total_cost: f64,
    pub success_count: i64,
    pub fail_count: i64,
    pub total_system_cost: Option<f64>,
    pub total_gift_cost: Option<f64>,
}

/// 日志详情大字段（列表不返回，展开时按需拉取）
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LogDetailContent {
    pub id: i64,
    pub request_content: Option<String>,
    pub response_content: Option<String>,
    pub post_response: Option<String>,
    pub upstream_req_content: Option<String>,
    pub billing_detail: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DashboardStats {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub total_users: i64,
    pub total_channels: i64,
    pub total_api_tokens: i64,
    pub today_requests: i64,
    pub today_tokens: i64,
    pub today_cost: f64,
    pub today_active_tokens: i64,
    pub yesterday_requests: i64,
    pub yesterday_tokens: i64,
    pub yesterday_cost: f64,
    pub yesterday_active_tokens: i64,
    pub recent_logs: Vec<RequestLog>,
    pub model_stats: Vec<ModelStat>,
    #[serde(default)]
    pub daily_trends: Vec<DashboardDailyTrend>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelStat {
    pub model: String,
    pub count: i64,
    pub total_tokens: Option<i64>,
    pub total_cost: Option<f64>,
    pub last_three_days: Vec<DashboardModelDailyStatInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DashboardModelDailyStatInfo {
    pub date: String,
    pub count: i64,
    pub total_cost: f64,
}

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct DashboardDailyTrend {
    pub date: String,
    pub requests: i64,
    pub cost: f64,
}
