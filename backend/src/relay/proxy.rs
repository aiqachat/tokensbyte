//! Shared proxy utilities — user context, billing, logging.
//! All relay handlers reuse these to avoid code duplication.

use std::sync::Arc;
use crate::AppState;
use crate::models::ApiToken;
use crate::error::{AppError, AppResult};
use super::router;
use crate::models::Channel;

// ── User Context ────────────────────────────────────────────────

pub struct UserContext {
    pub user_group: String,
    pub balance: f64,
    pub discount: f64,
}

pub async fn get_user_context(state: &Arc<AppState>, user_id: &str) -> AppResult<UserContext> {
    let (g, b, d): (String, f64, f64) = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, u.balance, COALESCE(ul.discount, 1.0) \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(UserContext { user_group: g, balance: b, discount: d })
}

// ── Access Check ────────────────────────────────────────────────

pub fn check_access(token: &ApiToken, model: &str, balance: f64) -> AppResult<()> {
    if !token.is_model_allowed(model) {
        return Err(AppError::Forbidden(format!("Model {} not allowed for this token", model)));
    }
    if token.quota_limit < 0.0 && balance <= 0.0 {
        return Err(AppError::Forbidden("Insufficient user balance".into()));
    }
    Ok(())
}

// ── Channel Selection ───────────────────────────────────────────

pub async fn select_channel_for_model(
    state: &Arc<AppState>, model: &str, user_group: &str,
) -> AppResult<(Channel, String)> {
    let ch = router::select_channel(state, model, user_group).await?;
    let resolved = ch.resolve_model(model);
    Ok((ch, resolved))
}

// ── Cost Lookup ─────────────────────────────────────────────────

pub async fn get_model_cost(state: &Arc<AppState>, model: &str, discount: f64) -> f64 {
    let m: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);
    match m {
        Some(m) => m.fixed_rate * discount,
        None => 0.0,
    }
}

// ── Record Usage & Billing ──────────────────────────────────────

pub async fn record_and_bill(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model: &str,
    cost: f64,
    status_code: u16,
    endpoint: &str,
    error_msg: Option<&str>,
) {
    let res: Result<(), sqlx::Error> = async {
        let mut tx = state.db.pool.begin().await?;
        if cost > 0.0 {
            sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(cost)
            .bind(token.id)
            .execute(&mut *tx)
            .await?;
            sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(cost)
            .bind(cost)
            .bind(&token.user_id)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query(&state.db.format_query(
            "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, status_code, endpoint, error_message) \
             VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)",
        ))
        .bind(&token.user_id)
        .bind(channel_id)
        .bind(token.id)
        .bind(model)
        .bind(cost)
        .bind(status_code as i32)
        .bind(endpoint)
        .bind(error_msg)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
    .await;
    if let Err(e) = res {
        tracing::error!("Failed to record relay usage: {:?}", e);
    }
}
