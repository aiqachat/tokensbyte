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
    let user: User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
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
    let mut user: User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
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
            if let Some(old_password) = request.old_password {
                if !auth::verify_password(&old_password, &user.password_hash).unwrap_or(false) {
                    return Err(AppError::BadRequest("原密码不正确".to_string()));
                }
            } else {
                return Err(AppError::BadRequest("修改密码需要验证原密码".to_string()));
            }
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
    headers: axum::http::HeaderMap,
    Extension(claims): Extension<auth::Claims>,
) -> Response {
    let result = (async {
        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let req_base_url = crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/wechat/callback", req_base_url);
        let state_val = format!("bind_wechat_{}", claims.sub);
        let url = crate::services::oauth::OAuthService::wechat_auth_url(&wechat.app_id, &redirect_uri, &state_val);
        Ok::<_, AppError>(url)
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 微信绑定回调 — 统一处理验证旧微信 / 绑定新微信两种场景
/// state 前缀决定行为：
///   verify_wechat_{user_id} → 验证扫码微信是否为当前绑定的微信
///   bind_wechat_{user_id}   → 将扫码微信绑定到当前账户
pub async fn bind_wechat_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<crate::api::auth::OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code".to_string()))?;
        let state_str = query.state.unwrap_or_default();

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let info = crate::services::oauth::OAuthService::wechat_exchange(&wechat.app_id, &wechat.app_secret, &code).await?;

        let wechat_identifier = info.unionid.as_deref().unwrap_or(&info.openid);
        let fallback_identifier = &info.openid;

        // ── 验证旧微信身份（换绑第一步） ───────────────────────
        if let Some(user_id) = state_str.strip_prefix("verify_wechat_") {
            if user_id.is_empty() {
                return Err(AppError::BadRequest("无效的 state 参数".to_string()));
            }
            let current_wechat: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT wechat_id FROM users WHERE id = ?")
            ).bind(user_id).fetch_optional(&state.db.pool).await?.flatten();

            if current_wechat.as_deref() != Some(wechat_identifier) && current_wechat.as_deref() != Some(fallback_identifier) {
                return Ok("/profile?wechat_action=verify_failed".to_string());
            }
            return Ok("/profile?wechat_action=verified".to_string());
        }

        // ── 绑定新微信（首次绑定 / 换绑第二步） ─────────────────
        if let Some(user_id) = state_str.strip_prefix("bind_wechat_") {
            if user_id.is_empty() {
                return Err(AppError::BadRequest("无效的 state 参数".to_string()));
            }
            // 检查此微信是否已被其他用户绑定（校验 unionid 和 openid）
            let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE (wechat_id = ? OR wechat_id = ?) AND id != ?)"))
                .bind(wechat_identifier).bind(fallback_identifier).bind(user_id).fetch_one(&state.db.pool).await?;
            if exists {
                return Ok("/profile?wechat_action=bindconflict".to_string());
            }
            sqlx::query(&state.db.format_query("UPDATE users SET wechat_id = ?, wechat_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(wechat_identifier).bind(&info.nickname).bind(user_id).execute(&state.db.pool).await?;
            return Ok("/profile?wechat_action=bindok".to_string());
        }

        Err(AppError::BadRequest("无效的 state 参数".to_string()))
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 绑定/换绑谷歌 — 发起授权跳转
pub async fn bind_google(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let result = (async {
        let settings = crate::api::settings::load_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let req_base_url = crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback", req_base_url);
        
        // 解析 action 以确定验证流程 (verify / bind)
        let action = query.get("action").map(|s| s.as_str()).unwrap_or("bind");
        let prefix = if action == "verify" { "verify_google_" } else { "bind_google_" };
        let state_val = format!("{}{}", prefix, claims.sub);
        
        let url = crate::services::oauth::OAuthService::google_auth_url(&google.client_id, &redirect_uri, &state_val);
        Ok::<_, AppError>(url)
    }).await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 谷歌绑定回调 — 统一处理验证旧谷歌 / 绑定新谷歌两种场景
pub async fn bind_google_callback(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<crate::api::auth::OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code".to_string()))?;
        let state_str = query.state.unwrap_or_default();

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let req_base_url = crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback", req_base_url);
        let info = crate::services::oauth::OAuthService::google_exchange(&google.client_id, &google.client_secret, &code, &redirect_uri).await?;

        let google_display_name = info.name.clone().or_else(|| info.email.clone());

        // ── 验证旧谷歌身份（换绑第一步） ───────────────────────
        if let Some(user_id) = state_str.strip_prefix("verify_google_") {
            if user_id.is_empty() {
                return Err(AppError::BadRequest("无效的 state 参数".to_string()));
            }
            let current_google: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT google_id FROM users WHERE id = ?")
            ).bind(user_id).fetch_optional(&state.db.pool).await?.flatten();

            if current_google.as_deref() != Some(&info.id) {
                return Ok("/profile?google_action=verify_failed".to_string());
            }
            return Ok("/profile?google_action=verified".to_string());
        }

        // ── 绑定新谷歌（首次绑定 / 换绑第二步） ─────────────────
        if let Some(user_id) = state_str.strip_prefix("bind_google_") {
            if user_id.is_empty() {
                return Err(AppError::BadRequest("无效的 state 参数".to_string()));
            }
            let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE google_id = ? AND id != ?)"))
                .bind(&info.id).bind(user_id).fetch_one(&state.db.pool).await?;
            if exists {
                return Ok("/profile?google_action=bindconflict".to_string());
            }

            sqlx::query(&state.db.format_query("UPDATE users SET google_id = ?, google_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(&info.id).bind(&google_display_name).bind(user_id).execute(&state.db.pool).await?;

            return Ok("/profile?google_action=bindok".to_string());
        }

        Err(AppError::BadRequest("无效的 state 参数".to_string()))
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

    // 查询该用户等级的推广配置
    let level_marketing: Option<(i64, f64, f64, f64)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT COALESCE(ul.marketing_enabled, 0), COALESCE(ul.commission_ratio, 0), COALESCE(ul.invite_reward_inviter, 0), COALESCE(ul.invite_reward_invitee, 0) FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (marketing_enabled, commission_ratio, invite_reward_inviter, invite_reward_invitee) = match level_marketing {
        Some((m, c, ri, re)) => (m == 1, c, ri, re),
        None => (false, 0.0, 0.0, 0.0),
    };

    Ok(Json(WalletStats {
        balance,
        total_consumption: stats.0,
        total_calls: stats.1,
        success_calls: stats.2,
        commission_balance: affiliate_stats.0,
        total_referred: affiliate_stats.1,
        marketing_enabled,
        commission_ratio,
        invite_reward_inviter,
        invite_reward_invitee,
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
