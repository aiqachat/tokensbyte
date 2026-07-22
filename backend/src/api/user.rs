/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{
    BindEmailRequest, BindMobileRequest, ProfileUpdateRequest, RechargeRecord, UnbindRequest, User,
    WalletStats,
};
use crate::AppState;
use axum::{
    extract::{Extension, Path, Query, State},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use std::sync::Arc;

pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<User>> {
    let mut user: User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&claims.sub)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    // Hide placeholder email from user-facing response
    if user.email.ends_with("@tokensbyte.local") {
        user.email = String::new();
    }

    // 加载管理员权限
    if let Some(group_id) = user.admin_group_id {
        let permissions_row: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT permissions FROM admin_groups WHERE id = ?"),
        )
        .bind(group_id)
        .fetch_optional(&state.db.pool)
        .await?;
        user.permissions = Some(
            permissions_row
                .and_then(|p| serde_json::from_str::<Vec<String>>(&p).ok())
                .unwrap_or_default(),
        );
    }

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

    if let Some(ref nickname) = request.nickname {
        if nickname.chars().count() > 24 {
            return Err(AppError::BadRequest(
                "昵称长度最多不能超过 24 个字符".to_string(),
            ));
        }
        user.nickname = Some(nickname.clone());
    }
    // 邮箱/手机/微信不得通过资料接口直接改写，必须走验证码绑定接口，防止未验证绑定被找回密码利用
    if request.email.is_some() || request.mobile.is_some() || request.wechat_id.is_some() {
        return Err(AppError::BadRequest(
            "请通过安全绑定流程修改邮箱、手机号或微信".to_string(),
        ));
    }
    if let Some(timezone) = request.timezone {
        user.timezone = Some(timezone);
    }
    if let Some(prefs) = request.notification_preferences {
        let merged = crate::services::notification::merge_user_prefs_json(
            user.notification_preferences.as_deref(),
            &prefs,
        );
        user.notification_preferences = Some(merged);
    }

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

    sqlx::query(&state.db.format_query(
        r#"UPDATE users SET email = ?, password_hash = ?, nickname = ?, mobile = ?, 
           wechat_id = ?, timezone = ?, notification_preferences = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
    ))
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.timezone)
    .bind(&user.notification_preferences)
    .bind(&user.id)
    .execute(&state.db.pool)
    .await?;

    // 加载管理员权限
    if let Some(group_id) = user.admin_group_id {
        let permissions_row: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT permissions FROM admin_groups WHERE id = ?"),
        )
        .bind(group_id)
        .fetch_optional(&state.db.pool)
        .await?;
        user.permissions = Some(
            permissions_row
                .and_then(|p| serde_json::from_str::<Vec<String>>(&p).ok())
                .unwrap_or_default(),
        );
    }

    Ok(Json(user))
}

/// 绑定/换绑手机号
pub async fn bind_mobile(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<BindMobileRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;

    // 换绑：验证原手机验证码
    if let Some(ref old_mobile) = user.mobile {
        if !old_mobile.is_empty() {
            let old_code = request
                .old_code
                .as_ref()
                .ok_or_else(|| AppError::BadRequest("换绑需验证原手机验证码".to_string()))?;
            crate::api::auth::verify_sms_code_pub(&state, old_mobile, old_code, "bind_mobile")
                .await?;
        }
    }

    // 验证新手机验证码
    crate::api::auth::verify_sms_code_pub(&state, &request.mobile, &request.code, "bind_mobile")
        .await?;

    // 检查手机号是否已被其他用户绑定
    let exists: bool = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT EXISTS(SELECT 1 FROM users WHERE mobile = ? AND id != ?)"),
    )
    .bind(&request.mobile)
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;
    if exists {
        return Err(AppError::Conflict("该手机号已被其他账号绑定".to_string()));
    }

    sqlx::query(
        &state.db.format_query(
            "UPDATE users SET mobile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ),
    )
    .bind(&request.mobile)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(
        serde_json::json!({"success": true, "message": "手机号绑定成功"}),
    ))
}

/// 绑定/换绑邮箱
pub async fn bind_email(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<BindEmailRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;

    // 换绑：验证原邮箱验证码（排除占位邮箱）
    if !user.email.is_empty() && !user.email.ends_with("@tokensbyte.local") {
        let old_code = request
            .old_code
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("换绑需验证原邮箱验证码".to_string()))?;
        crate::api::auth::verify_email_code_pub(&state, &user.email, old_code, "bind_email")
            .await?;
    }

    // 验证新邮箱验证码
    crate::api::auth::verify_email_code_pub(&state, &request.email, &request.code, "bind_email")
        .await?;

    // 检查邮箱是否已被其他用户使用
    let exists: bool = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ? AND id != ?)"),
    )
    .bind(&request.email)
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;
    if exists {
        return Err(AppError::Conflict("该邮箱已被其他账号使用".to_string()));
    }

    sqlx::query(
        &state.db.format_query(
            "UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        ),
    )
    .bind(&request.email)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(
        serde_json::json!({"success": true, "message": "邮箱绑定成功"}),
    ))
}

/// 绑定/换绑微信 — 发起授权跳转
pub async fn bind_wechat(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Extension(claims): Extension<auth::Claims>,
) -> Response {
    let result = (async {
        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings
            .wechat_oauth
            .ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let req_base_url =
            crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/wechat/callback", req_base_url);
        let state_val = crate::api::auth::generate_oauth_bind_state(
            &state.config.jwt_secret,
            "bind",
            "wechat",
            &claims.sub,
        );
        let url = crate::services::oauth::OAuthService::wechat_auth_url(
            &wechat.app_id,
            &redirect_uri,
            &state_val,
        );
        Ok::<_, AppError>(url)
    })
    .await;
    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 为前端扫码绑定签发 HMAC state（需登录）
pub async fn bind_oauth_state(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<std::collections::HashMap<String, String>>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = query.get("provider").map(|s| s.as_str()).unwrap_or("");
    let action = query.get("action").map(|s| s.as_str()).unwrap_or("bind");
    if provider != "wechat" && provider != "google" {
        return Err(AppError::BadRequest(
            "provider 仅支持 wechat 或 google".to_string(),
        ));
    }
    if action != "bind" && action != "verify" {
        return Err(AppError::BadRequest(
            "action 仅支持 bind 或 verify".to_string(),
        ));
    }
    let state_val = crate::api::auth::generate_oauth_bind_state(
        &state.config.jwt_secret,
        action,
        provider,
        &claims.sub,
    );
    Ok(Json(serde_json::json!({ "state": state_val })))
}

/// 微信绑定回调 — 统一处理验证旧微信 / 绑定新微信两种场景
/// state 必须为服务端 HMAC 签发：verify_wechat_{uid}_{ts}_{sig} / bind_wechat_{uid}_{ts}_{sig}
pub async fn bind_wechat_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<crate::api::auth::OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code".to_string()))?;
        let state_str = query.state.unwrap_or_default();
        let (action, provider, user_id) = crate::api::auth::verify_oauth_bind_state(
            &state.config.jwt_secret,
            &state_str,
        )
        .ok_or_else(|| AppError::BadRequest("OAuth state 验证失败，请重新发起授权".to_string()))?;
        if provider != "wechat" {
            return Err(AppError::BadRequest("无效的 state 参数".to_string()));
        }

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;
        let info = crate::services::oauth::OAuthService::wechat_exchange(&wechat.app_id, &wechat.app_secret, &code).await?;

        let wechat_identifier = info.unionid.as_deref().unwrap_or(&info.openid);
        let fallback_identifier = &info.openid;

        // ── 验证旧微信身份（换绑第一步） ───────────────────────
        if action == "verify" {
            let current_wechat: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT wechat_id FROM users WHERE id = ?")
            ).bind(&user_id).fetch_optional(&state.db.pool).await?.flatten();

            if current_wechat.as_deref() != Some(wechat_identifier) && current_wechat.as_deref() != Some(fallback_identifier) {
                return Ok("/profile?wechat_action=verify_failed".to_string());
            }
            return Ok("/profile?wechat_action=verified".to_string());
        }

        // ── 绑定新微信（首次绑定 / 换绑第二步） ─────────────────
        if action == "bind" {
            let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE (wechat_id = ? OR wechat_id = ?) AND id != ?)"))
                .bind(wechat_identifier).bind(fallback_identifier).bind(&user_id).fetch_one(&state.db.pool).await?;
            if exists {
                return Ok("/profile?wechat_action=bindconflict".to_string());
            }
            sqlx::query(&state.db.format_query("UPDATE users SET wechat_id = ?, wechat_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(wechat_identifier).bind(&info.nickname).bind(&user_id).execute(&state.db.pool).await?;
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
        let google = settings
            .google_oauth
            .ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let req_base_url =
            crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback", req_base_url);

        let action = query.get("action").map(|s| s.as_str()).unwrap_or("bind");
        let action = if action == "verify" { "verify" } else { "bind" };
        let state_val = crate::api::auth::generate_oauth_bind_state(
            &state.config.jwt_secret,
            action,
            "google",
            &claims.sub,
        );

        let url = crate::services::oauth::OAuthService::google_auth_url(
            &google.client_id,
            &redirect_uri,
            &state_val,
        );
        Ok::<_, AppError>(url)
    })
    .await;
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
        let (action, provider, user_id) = crate::api::auth::verify_oauth_bind_state(
            &state.config.jwt_secret,
            &state_str,
        )
        .ok_or_else(|| AppError::BadRequest("OAuth state 验证失败，请重新发起授权".to_string()))?;
        if provider != "google" {
            return Err(AppError::BadRequest("无效的 state 参数".to_string()));
        }

        let settings = crate::api::settings::load_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;
        let req_base_url = crate::api::auth::get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/user/bind/google/callback", req_base_url);
        let info = crate::services::oauth::OAuthService::google_exchange(&google.client_id, &google.client_secret, &code, &redirect_uri).await?;

        let google_display_name = info.name.clone().or_else(|| info.email.clone());

        if action == "verify" {
            let current_google: Option<String> = sqlx::query_scalar(
                &state.db.format_query("SELECT google_id FROM users WHERE id = ?")
            ).bind(&user_id).fetch_optional(&state.db.pool).await?.flatten();

            if current_google.as_deref() != Some(&info.id) {
                return Ok("/profile?google_action=verify_failed".to_string());
            }
            return Ok("/profile?google_action=verified".to_string());
        }

        if action == "bind" {
            let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE google_id = ? AND id != ?)"))
                .bind(&info.id).bind(&user_id).fetch_one(&state.db.pool).await?;
            if exists {
                return Ok("/profile?google_action=bindconflict".to_string());
            }

            sqlx::query(&state.db.format_query("UPDATE users SET google_id = ?, google_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(&info.id).bind(&google_display_name).bind(&user_id).execute(&state.db.pool).await?;

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
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;

    // 密码校验
    if !auth::verify_password(&request.password, &user.password_hash)? {
        return Err(AppError::AuthFailed("密码错误".to_string()));
    }

    match bind_type.as_str() {
        "wechat" => {
            sqlx::query(&state.db.format_query(
                "UPDATE users SET wechat_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(&claims.sub)
            .execute(&state.db.pool)
            .await?;
            Ok(Json(
                serde_json::json!({"success": true, "message": "微信已解绑"}),
            ))
        }
        "google" => {
            sqlx::query(&state.db.format_query(
                "UPDATE users SET google_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(&claims.sub)
            .execute(&state.db.pool)
            .await?;
            Ok(Json(
                serde_json::json!({"success": true, "message": "谷歌已解绑"}),
            ))
        }
        _ => Err(AppError::BadRequest("不支持的解绑类型".to_string())),
    }
}

pub async fn get_wallet_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<WalletStats>> {
    let user_id = &claims.sub;

    let (balance, gift_balance, credit_limit, pay_enabled): (f64, f64, f64, i32) =
        sqlx::query_as(&state.db.format_query(
            "SELECT balance, gift_balance, credit_limit, pay_enabled FROM users WHERE id = ?",
        ))
        .bind(user_id)
        .fetch_one(&state.db.pool)
        .await?;

    let (site_tz, _) = crate::relay::get_cached_config(&state).await;
    let timedisplay =
        crate::api::date_helper::resolve_user_timedisplay_name(&state.db, user_id, &site_tz).await;
    let tz: chrono_tz::Tz = timedisplay.parse().unwrap_or(chrono_tz::Asia::Shanghai);
    let bounds = crate::api::date_helper::get_timezone_time_bounds(tz);
    let today_date = bounds.today;
    let today_start_ts = bounds.today_start_ts;
    let history_end = today_date - chrono::Duration::days(1);

    let hist_stats: (Option<f64>, Option<i64>, Option<i64>) = sqlx::query_as(
        &state.db.format_query("SELECT SUM(total_cost), CAST(SUM(total_requests) AS BIGINT), CAST(SUM(success_count) AS BIGINT) FROM usage_daily_stats WHERE user_id = ? AND stat_date <= ?")
    )
    .bind(user_id)
    .bind(history_end)
    .fetch_one(&state.db.pool)
    .await?;

    let today_stats: (Option<f64>, Option<i64>, Option<i64>) = sqlx::query_as(
        &state.db.format_query("SELECT SUM(cost), COUNT(*), SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) FROM logs WHERE user_id = ? AND created_at >= ?::timestamptz")
    )
    .bind(user_id)
    .bind(&today_start_ts)
    .fetch_one(&state.db.pool)
    .await?;

    let total_consumption = hist_stats.0.unwrap_or(0.0) + today_stats.0.unwrap_or(0.0);
    let total_calls = hist_stats.1.unwrap_or(0) + today_stats.1.unwrap_or(0);
    let success_calls = hist_stats.2.unwrap_or(0) + today_stats.2.unwrap_or(0);

    let stats = (total_consumption, total_calls, success_calls);

    let affiliate_stats: (f64, i64) = sqlx::query_as(&state.db.format_query(
        r#"SELECT 
            commission_balance,
            (SELECT COUNT(*) FROM users WHERE referred_by = ?) as total_referred
           FROM users WHERE id = ?"#,
    ))
    .bind(user_id)
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;

    // 查询该用户等级的推广配置
    let level_marketing: Option<(i64, f64, f64, f64)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT COALESCE(ul.marketing_enabled, 0), COALESCE(ul.commission_ratio, 0), COALESCE(ul.invite_reward_inviter, 0), COALESCE(ul.invite_reward_invitee, 0) FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (marketing_enabled, commission_ratio, invite_reward_inviter, invite_reward_invitee) =
        match level_marketing {
            Some((m, c, ri, re)) => (m == 1, c, ri, re),
            None => (false, 0.0, 0.0, 0.0),
        };

    Ok(Json(WalletStats {
        balance,
        gift_balance,
        credit_limit,
        total_consumption: stats.0,
        total_calls: stats.1,
        success_calls: stats.2,
        commission_balance: affiliate_stats.0,
        total_referred: affiliate_stats.1,
        marketing_enabled,
        commission_ratio,
        invite_reward_inviter,
        invite_reward_invitee,
        pay_enabled: pay_enabled == 1,
    }))
}

pub async fn transfer_commission(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id = &claims.sub;
    let mut tx = state.db.pool.begin().await?;

    let commission_balance: f64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT commission_balance FROM users WHERE id = ?"),
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    if commission_balance <= 0.0 {
        return Err(AppError::BadRequest(
            "Commission balance is zero".to_string(),
        ));
    }

    sqlx::query(&state.db.format_query(
        r#"UPDATE users SET 
            balance = balance + ?, 
            commission_balance = 0.0, 
            updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"#,
    ))
    .bind(commission_balance)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

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
    let records: Vec<RechargeRecord> =
        sqlx::query_as(&state.db.format_query(
            "SELECT * FROM recharge_records WHERE user_id = ? ORDER BY created_at DESC",
        ))
        .bind(&claims.sub)
        .fetch_all(&state.db.pool)
        .await?;

    Ok(Json(records))
}
