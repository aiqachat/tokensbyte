use crate::error::AppResult;
use crate::AppState;
use axum::{
    extract::{Query, State},
    Json,
};
use std::sync::Arc;

#[derive(serde::Deserialize)]
pub struct StatsSyncQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

/// 超级管理员手动触发使用数据统计与校准的 API
pub async fn trigger_stats_sync(
    State(state): State<Arc<AppState>>,
    Query(query): Query<StatsSyncQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let state_clone = state.clone();
    let start_date = query.start_date.clone();
    let end_date = query.end_date.clone();

    // 采用 tokio::spawn 异步执行后台静默校准与回填，保障超管操作完全不会被页面阻塞
    tokio::spawn(async move {
        if let Err(e) =
            crate::relay::usage_stats::manual_sync_usage_stats(&state_clone, start_date, end_date)
                .await
        {
            tracing::error!("❌ [AdminManualSync] 手动触发同步失败: {:?}", e);
        }
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "使用统计数据同步与校准任务已在后台异步启动"
    })))
}
