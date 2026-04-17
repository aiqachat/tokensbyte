//! Shared proxy utilities — user context, billing, logging.
//! All relay handlers reuse these to avoid code duplication.

use std::sync::Arc;
use crate::AppState;
use crate::models::ApiToken;
use crate::error::{AppError, AppResult};
use regex::Regex;
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
    
    let db_rule: Option<crate::models::BillingRule> = if let Some(ref md) = m {
        if let Some(rule_id) = md.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None)
        } else { None }
    } else { None };

    match db_rule {
        Some(r) => r.fixed_rate * discount,
        None => 0.0,
    }
}

// ── Record Usage & Billing ──────────────────────────────────────

use super::url_utils::join_url;

pub async fn pre_deduct(state: &Arc<AppState>, user_id: &str, amount: f64) -> Result<(), sqlx::Error> {
    if amount > 0.0 {
        sqlx::query(&state.db.format_query("UPDATE users SET balance = balance - ? WHERE id = ?"))
            .bind(amount)
            .bind(user_id)
            .execute(&state.db.pool)
            .await?;
    }
    Ok(())
}

pub async fn record_and_bill(
    state: &Arc<AppState>, token: &ApiToken, channel_id: i64, model_name: &str,
    prompt_tokens: i32, completion_tokens: i32, cost: f64, status_code: u16,
    endpoint: &str, error_msg: Option<&str>, latency_ms: u32, is_stream: i32,
    request_content: Option<String>, response_content: Option<String>, upstream_req_content: Option<String>,
) {
    record_and_bill_with_prededuction(state, token, channel_id, model_name, prompt_tokens, completion_tokens, cost, 0.0, status_code, endpoint, error_msg, latency_ms, is_stream, request_content, response_content, upstream_req_content).await;
}

pub async fn record_and_bill_with_prededuction(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model_name: &str,
    prompt_tokens: i32,
    completion_tokens: i32,
    cost: f64,
    pre_deducted: f64, // 新增参数，已预扣的金额
    status_code: u16,
    endpoint: &str,
    error_msg: Option<&str>,
    latency_ms: u32,
    is_stream: i32,
    request_content: Option<String>,
    response_content: Option<String>,
    upstream_req_content: Option<String>,
) {
    let mut enable_log: i32 = 0;
    if let Ok(Some(m)) = sqlx::query_as::<_, crate::models::Model>(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
        .bind(model_name).fetch_optional(&state.db.pool).await 
    {
        enable_log = m.enable_log_content;
    }

    let filter_base64 = |content: Option<String>| -> Option<String> {
        let text = content?;
        if enable_log == 0 { return None; }
        // 1. 标准 data URI: data:image/jpeg;base64,...
        let re1 = Regex::new(r"data:image/[^;]+;base64,[A-Za-z0-9+/=\s]{100,}").unwrap();
        let text = re1.replace_all(&text, "\"base64图片\"").to_string();
        // 2. JSON 转义 data URI: data:image\\/jpeg;base64,...
        let re2 = Regex::new(r"data:image\\/[^;]+;base64,[A-Za-z0-9+/=\\s]{100,}").unwrap();
        let text = re2.replace_all(&text, "\"base64图片\"").to_string();
        // 3. 纯 base64 长串 (>200 字符的连续 base64)
        let re3 = Regex::new(r#""[A-Za-z0-9+/]{200,}={0,2}""#).unwrap();
        Some(re3.replace_all(&text, "\"base64图片\"").to_string())
    };

    let req_content = filter_base64(request_content);
    let resp_content = filter_base64(response_content);
    let upstream_req = filter_base64(upstream_req_content);

    let mut channel_info: Option<(String, String, String)> = None;
    if let Ok(Some(ch)) = sqlx::query_as::<_, crate::models::Channel>(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(channel_id)
        .fetch_optional(&state.db.pool)
        .await
    {
        let mut b = ch.base_url.clone();
        let mut k = ch.api_key.clone();
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
                .bind(pid)
                .fetch_optional(&state.db.pool)
                .await
            {
                b = preset.base_url;
                k = preset.api_key;
            }
        }
        channel_info = Some((b, k, ch.provider_type));
    }
        
    let (system_endpoint, upstream_ep) = if endpoint.contains('|') {
        let parts: Vec<&str> = endpoint.splitn(2, '|').collect();
        (parts[0], parts[1])
    } else {
        (endpoint, endpoint)
    };

    let mut final_endpoint = upstream_ep.to_string();
    if let Some((base, key, _provider)) = channel_info {
        if !final_endpoint.starts_with("http") {
             final_endpoint = join_url(&base, if final_endpoint.starts_with('/') { &final_endpoint[1..] } else { &final_endpoint });
        }
        // 通用密钥脱敏：只要 URL 中包含 api_key，统一脱敏
        final_endpoint = super::forward::mask_key_in_string(&final_endpoint, &key);
    }

    let res: Result<(), sqlx::Error> = async {
        let mut tx = state.db.pool.begin().await?;
        if cost > 0.0 || pre_deducted > 0.0 {
            sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(cost)
            .bind(token.id)
            .execute(&mut *tx)
            .await?;
            
            let apply_balance = cost - pre_deducted; // 正数表示还要扣，负数表示退款
            sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(apply_balance)
            .bind(cost)
            .bind(&token.user_id)
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query(&state.db.format_query(
            "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url, upstream_req_content) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ))
        .bind(&token.user_id)
        .bind(channel_id)
        .bind(token.id)
        .bind(model_name)
        .bind(prompt_tokens)
        .bind(completion_tokens)
        .bind(cost)
        .bind(status_code as i32)
        .bind(system_endpoint)
        .bind(error_msg)
        .bind(latency_ms as i32)
        .bind(req_content)
        .bind(resp_content)
        .bind(is_stream)
        .bind(&final_endpoint)
        .bind(upstream_req)
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
