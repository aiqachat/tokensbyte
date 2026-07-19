use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{ApiToken, CreateTokenRequest, TokenListResponse, UpdateTokenRequest};
use crate::time_system::DbTs;
use crate::AppState;
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use std::sync::Arc;

fn normalize_token_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("令牌名称不能为空".to_string()));
    }
    if trimmed.chars().count() > 24 {
        return Err(AppError::BadRequest(
            "令牌名称长度不能超过 24 个字符".to_string(),
        ));
    }
    use std::sync::OnceLock;
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    let re = RE.get_or_init(|| regex::Regex::new(r"^[\p{L}\p{N}\s_-]+$").unwrap());
    if !re.is_match(trimmed) {
        return Err(AppError::BadRequest("不支持标点符号".to_string()));
    }
    Ok(trimmed.to_string())
}

/// kid = 用户 UID 后 3 位 + 3 位随机数字
fn make_token_kid(user_uid: &str) -> String {
    let uid_suffix: String = user_uid
        .chars()
        .rev()
        .take(3)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let random_part: String = (0..3)
        .map(|_| (b'0' + rand::random::<u8>() % 10) as char)
        .collect();
    format!("{}{}", uid_suffix, random_part)
}

async fn enrich_token_period_usage(state: &AppState, tokens: &mut [ApiToken]) {
    if tokens.is_empty() {
        return;
    }
    let (site_tz, _) = crate::relay::get_cached_config(state).await;
    let mut user_td_cache: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for token in tokens.iter() {
        if user_td_cache.contains_key(&token.user_id) {
            continue;
        }
        let td = crate::api::date_helper::resolve_user_timedisplay_name(
            &state.db,
            &token.user_id,
            &site_tz,
        )
        .await;
        user_td_cache.insert(token.user_id.clone(), td);
    }
    for token in tokens.iter_mut() {
        let tz = user_td_cache
            .get(&token.user_id)
            .map(|s| s.as_str())
            .unwrap_or(site_tz.as_str());
        let (now_day, now_week, now_month) = crate::models::quota_period_keys(tz);
        token.fill_current_period_usage(&now_day, &now_week, &now_month);
    }
}

pub async fn list_tokens(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<TokenListResponse>> {
    let mut tokens: Vec<ApiToken> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC"),
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    enrich_token_period_usage(&state, &mut tokens).await;
    let total = tokens.len() as i64;
    Ok(Json(TokenListResponse {
        data: tokens,
        total,
    }))
}

pub async fn list_all_tokens(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<TokenListResponse>> {
    let mut tokens: Vec<ApiToken> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens ORDER BY created_at DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    enrich_token_period_usage(&state, &mut tokens).await;
    let total = tokens.len() as i64;
    Ok(Json(TokenListResponse {
        data: tokens,
        total,
    }))
}

pub async fn create_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<CreateTokenRequest>,
) -> AppResult<Json<ApiToken>> {
    let name_val = normalize_token_name(request.name.as_deref().unwrap_or("default"))?;

    let current_count: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?"),
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    let max_token_count: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT COALESCE(ul.max_token_count, 10) FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
        )
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .unwrap_or(10);

    if current_count >= max_token_count {
        return Err(AppError::BadRequest(format!(
            "已达到当前等级允许的最大密钥数量限制 ({})",
            max_token_count
        )));
    }

    let token_key = auth::generate_api_key();
    let models_json = serde_json::to_string(&request.allowed_models.unwrap_or_default())
        .unwrap_or_else(|_| "[]".to_string());

    let user_uid: String =
        sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or_else(|_| "000".to_string());
    let kid = make_token_kid(&user_uid);

    let sql = r#"INSERT INTO api_tokens (user_id, token_key, kid, name, quota_limit, allowed_models, allowed_ips, expires_at, is_active, only_playground, high_availability, daily_quota_limit, weekly_quota_limit, monthly_quota_limit, rps_limit, rpm_limit)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"#;

    let sql_pg = format!("{} RETURNING id", sql);
    let expires_at = request.expires_at.as_deref().map(DbTs::from);
    let last_id: i64 = sqlx::query_scalar::<_, i64>(&state.db.format_query(&sql_pg))
        .bind(&claims.sub)
        .bind(&token_key)
        .bind(&kid)
        .bind(&name_val)
        .bind(request.quota_limit.unwrap_or(-1.0))
        .bind(&models_json)
        .bind(request.allowed_ips.unwrap_or_default())
        .bind(&expires_at)
        .bind(request.only_playground.unwrap_or(0))
        .bind(request.high_availability.unwrap_or(1))
        .bind(request.daily_quota_limit.unwrap_or(-1.0))
        .bind(request.weekly_quota_limit.unwrap_or(-1.0))
        .bind(request.monthly_quota_limit.unwrap_or(-1.0))
        .bind(request.rps_limit.unwrap_or(0))
        .bind(request.rpm_limit.unwrap_or(0))
        .fetch_one(&state.db.pool)
        .await?;

    let mut token: ApiToken = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE id = ?"),
    )
    .bind(last_id)
    .fetch_one(&state.db.pool)
    .await?;

    enrich_token_period_usage(&state, std::slice::from_mut(&mut token)).await;
    Ok(Json(token))
}

pub async fn update_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateTokenRequest>,
) -> AppResult<Json<ApiToken>> {
    // Verify ownership or admin
    let mut token: ApiToken = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token.user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden(
            "Unauthorized access to token".to_string(),
        ));
    }

    if let Some(name) = request.name {
        token.name = normalize_token_name(&name)?;
    }
    if let Some(quota_limit) = request.quota_limit {
        token.quota_limit = quota_limit;
    }
    if let Some(models) = request.allowed_models {
        token.allowed_models = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string());
    }
    if let Some(ips) = request.allowed_ips {
        token.allowed_ips = ips;
    }
    if let Some(expires) = request.expires_at {
        token.expires_at = Some(DbTs::from(expires));
    }
    if let Some(active) = request.is_active {
        token.is_active = active;
    }
    if let Some(only_playground) = request.only_playground {
        token.only_playground = only_playground;
    }
    if let Some(high_availability) = request.high_availability {
        token.high_availability = high_availability;
    }
    if let Some(daily) = request.daily_quota_limit {
        token.daily_quota_limit = daily;
    }
    if let Some(weekly) = request.weekly_quota_limit {
        token.weekly_quota_limit = weekly;
    }
    if let Some(monthly) = request.monthly_quota_limit {
        token.monthly_quota_limit = monthly;
    }
    if let Some(rps) = request.rps_limit {
        token.rps_limit = rps;
    }
    if let Some(rpm) = request.rpm_limit {
        token.rpm_limit = rpm;
    }

    if token.kid.as_deref().unwrap_or("").is_empty() {
        let user_uid: String =
            sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
                .bind(&token.user_id)
                .fetch_one(&state.db.pool)
                .await
                .unwrap_or_else(|_| "000".to_string());
        token.kid = Some(make_token_kid(&user_uid));
    }

    sqlx::query(&state.db.format_query(
        r#"UPDATE api_tokens SET name = ?, quota_limit = ?, allowed_models = ?, allowed_ips = ?, 
           expires_at = ?, is_active = ?, kid = ?, only_playground = ?, high_availability = ?, 
           daily_quota_limit = ?, weekly_quota_limit = ?, monthly_quota_limit = ?, 
           rps_limit = ?, rpm_limit = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
    ))
    .bind(&token.name)
    .bind(token.quota_limit)
    .bind(&token.allowed_models)
    .bind(&token.allowed_ips)
    .bind(&token.expires_at)
    .bind(token.is_active)
    .bind(&token.kid)
    .bind(token.only_playground)
    .bind(token.high_availability)
    .bind(token.daily_quota_limit)
    .bind(token.weekly_quota_limit)
    .bind(token.monthly_quota_limit)
    .bind(token.rps_limit)
    .bind(token.rpm_limit)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    enrich_token_period_usage(&state, std::slice::from_mut(&mut token)).await;
    Ok(Json(token))
}

pub async fn delete_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    // Check ownership
    let token_user_id: String = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT user_id FROM api_tokens WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token_user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Unauthorized access".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM api_tokens WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

#[derive(serde::Deserialize)]
pub struct RevealTokenRequest {
    pub password: String,
}

/// 验证用户密码后返回完整的 token_key
pub async fn reveal_token(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
    Json(request): Json<RevealTokenRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 查找 token 并验证所有权
    let token: ApiToken = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token.user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden(
            "Unauthorized access to token".to_string(),
        ));
    }

    // 验证用户密码
    let password_hash: String = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT password_hash FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    if !auth::verify_password(&request.password, &password_hash)? {
        return Err(AppError::AuthFailed("密码错误".to_string()));
    }

    Ok(Json(serde_json::json!({
        "token_key": token.token_key
    })))
}

/// 清空令牌已用额度（总额度 + 日/周/月周期用量），不影响额度上限与钱包余额
pub async fn reset_token_usage(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<ApiToken>> {
    let token: ApiToken = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Token not found".to_string()))?;

    if token.user_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden(
            "Unauthorized access to token".to_string(),
        ));
    }

    sqlx::query(&state.db.format_query(
        r#"UPDATE api_tokens SET
               quota_used = 0,
               daily_quota_used = 0,
               weekly_quota_used = 0,
               monthly_quota_used = 0,
               last_reset_day = '',
               last_reset_week = '',
               last_reset_month = '',
               updated_at = CURRENT_TIMESTAMP
               WHERE id = ?"#,
    ))
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    // DB 已清零：丢弃内存限额 slot，避免清零后仍按旧用量拦截
    state.quota_memory.invalidate_token(id);

    let mut updated: ApiToken = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    enrich_token_period_usage(&state, std::slice::from_mut(&mut updated)).await;
    Ok(Json(updated))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_usage_fields_are_zeroed_in_check() {
        // 模拟清空后：周期 last_reset 为空时，check_quota_limits 应按 0 用量放行
        let token = ApiToken {
            id: 1,
            user_id: "u1".into(),
            token_key: "sk-test".into(),
            kid: Some("123456".into()),
            name: "t".into(),
            quota_limit: 10.0,
            quota_used: 0.0,
            allowed_models: "[]".into(),
            allowed_ips: String::new(),
            rps_limit: 0,
            rpm_limit: 0,
            expires_at: None,
            is_active: 1,
            created_at: DbTs::default(),
            updated_at: DbTs::default(),
            last_used_at: None,
            only_playground: 0,
            high_availability: 0,
            daily_quota_limit: 1.0,
            daily_quota_used: 0.0,
            weekly_quota_limit: 5.0,
            weekly_quota_used: 0.0,
            monthly_quota_limit: 20.0,
            monthly_quota_used: 0.0,
            last_reset_day: None,
            last_reset_week: None,
            last_reset_month: None,
            current_daily_quota_used: None,
            current_weekly_quota_used: None,
            current_monthly_quota_used: None,
        };
        assert!(token
            .check_quota_limits("2026-07-17", "2026-28", "2026-07")
            .is_ok());
    }
}
