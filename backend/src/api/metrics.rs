/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Dashboard 实时吞吐 API（QPS / RPM / TPM / Task）

use crate::auth;
use crate::error::AppResult;
use crate::middleware::live_metrics::{snapshot_global, snapshot_user, MetricsSnapshot};
use axum::{extract::Extension, Json};

#[derive(Debug, serde::Serialize)]
pub struct LiveMetricsResponse {
    /// 展示用指标：admin=全局，user=本人所有 Key 汇总
    pub metrics: MetricsSnapshot,
    /// 数据范围：global | self
    pub scope: &'static str,
    pub ts: u64,
}

fn now_sec() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// GET /api/v1/metrics/live
pub async fn get_live_metrics(
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<LiveMetricsResponse>> {
    let is_admin = claims.role == "admin";
    let (metrics, scope) = if is_admin {
        (snapshot_global(), "global")
    } else {
        (snapshot_user(&claims.sub), "self")
    };

    Ok(Json(LiveMetricsResponse {
        metrics,
        scope,
        ts: now_sec(),
    }))
}
