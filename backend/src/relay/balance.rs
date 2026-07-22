/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay: GET /v1/balance, /v1/user/balance
//! 余额查询接口，通过 API Key (Bearer Token) 鉴权。

use crate::models::ApiToken;
use crate::{error::AppResult, AppState};
use axum::{
    extract::{Extension, State},
    Json,
};
use std::sync::Arc;

/// GET /v1/balance — 查询当前令牌（API Key）的余额
pub async fn token_balance(
    State(_state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
) -> AppResult<Json<serde_json::Value>> {
    let unlimited = token.quota_limit < 0.0;
    let remain = if unlimited {
        -1.0
    } else {
        crate::money::round_money((token.quota_limit - token.quota_used).max(0.0))
    };
    Ok(Json(serde_json::json!({
        "success": true,
        "remain_balance": remain,
        "used_balance": crate::money::round_money(token.quota_used),
        "unlimited_quota": unlimited
    })))
}

/// GET /v1/user/balance — 查询令牌所属用户的账户余额
pub async fn user_balance(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
) -> AppResult<Json<serde_json::Value>> {
    let row: Option<(f64, f64, f64, f64)> = sqlx::query_as(&state.db.format_query(
        "SELECT balance, gift_balance, credit_limit, used_quota FROM users WHERE id = ?",
    ))
    .bind(&token.user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (balance, gift_balance, credit_limit, used_quota) = row.unwrap_or((0.0, 0.0, 0.0, 0.0));

    Ok(Json(serde_json::json!({
        "success": true,
        "remain_balance": crate::money::round_money(balance + gift_balance + credit_limit),
        "used_balance": crate::money::round_money(used_quota),
        "unlimited_quota": false
    })))
}
