use axum::{
    extract::{State, Extension, Path, Query},
    response::{IntoResponse, Response, Redirect},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{User, ProfileUpdateRequest, WalletStats, RechargeRecord, BindMobileRequest, BindEmailRequest, UnbindRequest};
use crate::error::{AppError, AppResult};
use crate::auth;

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<User>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user))
}

pub async fn update_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<ProfileUpdateRequest>,
) -> AppResult<Json<User>> {
    let mut user: User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    if let Some(nickname) = request.nickname { user.nickname = Some(nickname); }
    if let Some(email) = request.email { user.email = email; }
    if let Some(mobile) = request.mobile { user.mobile = Some(mobile); }
    if let Some(wechat_id) = request.wechat_id { user.wechat_id = Some(wechat_id); }
    
    if let Some(password) = request.password {
        if !password.is_empty() {
            user.password_hash = auth::hash_password(&password)?;
        }
    }

    sqlx::query(
        &state.db.format_query(r#"UPDATE users SET email = ?, password_hash = ?, nickname = ?, mobile = ?, 
           wechat_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
    )
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(user))
}

/// 绑定/换绑手机号
pub async fn bind_mobile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<BindMobileRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub).fetch_one(&state.db.pool).await?;

    // 换绑：验证原手机验证码
    if let Some(ref old_mobile) = user.mobile {
        if !old_mobile.is_empty() {
            let old_code = request.old_code.as_ref()
                .ok_or_else(|| AppError::BadRequest("换绑需验证原手机验证码".to_string()))?;
            crate::api::auth::verify_sms_code_pub(&state, old_mobile, old_code, "bind_mobile").await?;
        }
    }

    // 验证新手机验证码
    crate::api::auth::verify_sms_code_pub(&state, &request.mobile, &request.code, "bind_mobile").await?;

    // 检查手机号是否已被其他用户绑定
    let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE mobile = ? AND id != ?)"))
        .bind(&request.mobile).bind(&claims.sub).fetch_one(&state.db.pool).await?;
    if exists {
        return Err(AppError::Conflict("该手机号已被其他账号绑定".to_string()));
    }

    sqlx::query(&state.db.format_query("UPDATE users SET mobile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(&request.mobile).bind(&claims.sub).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({"success": true, "message": "手机号绑定成功"})))
}

/// 绑定/换绑邮箱
pub async fn bind_email(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<BindEmailRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub).fetch_one(&state.db.pool).await?;

    // 换绑：验证原邮箱验证码（排除占位邮箱）
    if !user.email.is_empty() && !user.email.ends_with("@tokensbyte.local") {
        let old_code = request.old_code.as_ref()
            .ok_or_else(|| AppError::BadRequest("换绑需验证原邮箱验证码".to_string()))?;
        crate::api::auth::verify_email_code_pub(&state, &user.email, old_code, "bind_email").await?;
    }

    // 验证新邮箱验证码
    crate::api::auth::verify_email_code_pub(&state, &request.email, &request.code, "bind_email").await?;

    // 检查邮箱是否已被其他用户使用
    let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ? AND id != ?)"))
        .bind(&request.email).bind(&claims.sub).fetch_one(&state.db.pool).await?;
    if exists {
        return Err(AppError::Conflict("该邮箱已被其他账号使用".to_string()));
    }

    sqlx::query(&state.db.format_query("UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(&request.email).bind(&claims.sub).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({"success": true, "message": "邮箱绑定成功"})))
}

/// 绑定/换绑微信 — 发起授权跳转
pub async fn bind_wechat(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> Response {
    let result = (async {
        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let redirect_uri = format!("{}/api/v1/user/bind/wechat/callback",
            state.config.base_url.trim_end_matches('/'));
        let state_val = format!("bind_wechat_{}", claims.sub);
        let url = crate::services::oauth::OAuthService::wechat_auth_url(&wechat.app_id, &redirect_uri, &state_val);
        Ok::<_, AppError>(url)
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 微信绑定回调
pub async fn bind_wechat_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<crate::api::auth::OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code".to_string()))?;
        let state_str = query.state.unwrap_or_default();
        let user_id = state_str.strip_prefix("bind_wechat_").unwrap_or("").to_string();
        if user_id.is_empty() {
            return Err(AppError::BadRequest("无效的 state 参数".to_string()));
        }

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let info = crate::services::oauth::OAuthService::wechat_exchange(&wechat.app_id, &wechat.app_secret, &code).await?;

        // 检查此微信是否已被其他用户绑定
        let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE wechat_id = ? AND id != ?)"))
            .bind(&info.openid).bind(&user_id).fetch_one(&state.db.pool).await?;
        if exists {
            return Err(AppError::Conflict("此微信已绑定其他账号".to_string()));
        }

        sqlx::query(&state.db.format_query("UPDATE users SET wechat_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
            .bind(&info.openid).bind(&user_id).execute(&state.db.pool).await?;

        Ok::<_, AppError>("/profile?bind=wechat&result=success".to_string())
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 绑定/换绑谷歌 — 发起授权跳转
pub async fn bind_google(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> Response {
    let result = (async {
        let settings = crate::api::settings::load_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback",
            state.config.base_url.trim_end_matches('/'));
        let state_val = format!("bind_google_{}", claims.sub);
        let url = crate::services::oauth::OAuthService::google_auth_url(&google.client_id, &redirect_uri, &state_val);
        Ok::<_, AppError>(url)
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 谷歌绑定回调
pub async fn bind_google_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<crate::api::auth::OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code".to_string()))?;
        let state_str = query.state.unwrap_or_default();
        let user_id = state_str.strip_prefix("bind_google_").unwrap_or("").to_string();
        if user_id.is_empty() {
            return Err(AppError::BadRequest("无效的 state 参数".to_string()));
        }

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback",
            state.config.base_url.trim_end_matches('/'));
        let info = crate::services::oauth::OAuthService::google_exchange(&google.client_id, &google.client_secret, &code, &redirect_uri).await?;

        let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE google_id = ? AND id != ?)"))
            .bind(&info.id).bind(&user_id).fetch_one(&state.db.pool).await?;
        if exists {
            return Err(AppError::Conflict("此谷歌账号已绑定其他用户".to_string()));
        }

        sqlx::query(&state.db.format_query("UPDATE users SET google_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
            .bind(&info.id).bind(&user_id).execute(&state.db.pool).await?;

        Ok::<_, AppError>("/profile?bind=google&result=success".to_string())
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 解绑第三方（需密码校验）
pub async fn unbind_third_party(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(bind_type): Path<String>,
    Json(request): Json<UnbindRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub).fetch_one(&state.db.pool).await?;

    // 密码校验
    if !auth::verify_password(&request.password, &user.password_hash)? {
        return Err(AppError::AuthFailed("密码错误".to_string()));
    }

    let (column, label) = match bind_type.as_str() {
        "wechat" => ("wechat_id", "微信"),
        "google" => ("google_id", "谷歌"),
        _ => return Err(AppError::BadRequest("不支持的解绑类型".to_string())),
    };

    let sql = format!("UPDATE users SET {} = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", column);
    sqlx::query(&state.db.format_query(&sql))
        .bind(&claims.sub).execute(&state.db.pool).await?;

    Ok(Json(serde_json::json!({"success": true, "message": format!("{}已解绑", label)})))
}

pub async fn get_wallet_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<WalletStats>> {
    let user_id = &claims.sub;
    
    let balance: f64 = sqlx::query_scalar(&state.db.format_query("SELECT balance FROM users WHERE id = ?"))
        .bind(user_id).fetch_one(&state.db.pool).await?;
        
    let stats: (f64, i64, i64) = sqlx::query_as(
        &state.db.format_query(r#"SELECT 
            COALESCE(SUM(cost), 0.0) as total_consumption,
            COUNT(*) as total_calls,
            COALESCE(SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END), 0) as success_calls
           FROM logs WHERE user_id = ?"#)
    ).bind(user_id).fetch_one(&state.db.pool).await?;

    let affiliate_stats: (f64, i64) = sqlx::query_as(
        &state.db.format_query(r#"SELECT 
            commission_balance,
            (SELECT COUNT(*) FROM users WHERE referred_by = ?) as total_referred
           FROM users WHERE id = ?"#)
    ).bind(user_id).bind(user_id).fetch_one(&state.db.pool).await?;

    Ok(Json(WalletStats {
        balance,
        total_consumption: stats.0,
        total_calls: stats.1,
        success_calls: stats.2,
        commission_balance: affiliate_stats.0,
        total_referred: affiliate_stats.1,
    }))
}

pub async fn transfer_commission(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = &claims.sub;
    let mut tx = state.db.pool.begin().await?;

    let commission_balance: f64 = sqlx::query_scalar(&state.db.format_query("SELECT commission_balance FROM users WHERE id = ?"))
        .bind(user_id).fetch_one(&mut *tx).await?;

    if commission_balance <= 0.0 {
        return Err(AppError::BadRequest("Commission balance is zero".to_string()));
    }

    sqlx::query(
        &state.db.format_query(r#"UPDATE users SET 
            balance = balance + ?, 
            commission_balance = 0.0, 
            updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"#)
    ).bind(commission_balance).bind(user_id).execute(&mut *tx).await?;

    sqlx::query(
        &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'transfer', ?)")
    ).bind(user_id).bind(commission_balance).bind("Commission Transfer")
    .execute(&mut *tx).await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "amount": commission_balance
    })))
}

pub async fn list_recharge_records(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<Vec<RechargeRecord>>> {
    let records: Vec<RechargeRecord> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC")
    ).bind(&claims.sub).fetch_all(&state.db.pool).await?;

    Ok(Json(records))
}
