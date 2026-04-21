use axum::{
    extract::{State, ConnectInfo, Query},
    response::{IntoResponse, Response, Redirect},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{
    LoginRequest, LoginResponse, CreateUserRequest, User,
    SendCodeRequest, EmailRegisterRequest, ResetPasswordRequest,
    SendSmsCodeRequest, MobileRegisterRequest,
    AllSettings, RegistrationSettings,
};
use crate::error::{AppError, AppResult};
use crate::auth;
use crate::services::email::EmailService;
use chrono::{Utc, Duration};
use rand::Rng;

pub fn get_base_url_from_req(headers: &axum::http::HeaderMap, fallback: &str) -> String {
    std::env::var("PUBLIC_API_URL").ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers.get("origin").and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(|s| s.to_string())
        })
        .or_else(|| {
            let host = headers.get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let scheme = headers.get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(if host.contains("localhost") || host.contains("127.0.0.1") { "http" } else { "https" });
            Some(format!("{}://{}", scheme, host))
        })
        .unwrap_or_else(|| fallback.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// 用户登录 — 支持用户名/邮箱/手机号 + 密码（复用同一接口）
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Response {
    let result = (async {
        let (query_str, err_msg) = match request.login_type.as_deref() {
            Some("email") => ("SELECT * FROM users WHERE email = ?", "未找到该邮箱对应的账号"),
            Some("mobile") => ("SELECT * FROM users WHERE mobile = ?", "未找到该手机号对应的账号"),
            _ => ("SELECT * FROM users WHERE username = ?", "未找到此账号，请检查用户名"),
        };

        let user: User = sqlx::query_as(&state.db.format_query(query_str))
        .bind(&request.username)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::AuthFailed(err_msg.to_string()))?;

        if user.role != "user" {
            return Err(AppError::Forbidden("Only users can login from here".to_string()));
        }

        if !auth::verify_password(&request.password, &user.password_hash)? {
            return Err(AppError::AuthFailed("密码输入错误，请重新尝试".to_string()));
        }

        if user.is_active == 0 {
            return Err(AppError::Forbidden("Account disabled".to_string()));
        }

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

        Ok(Json(LoginResponse { token, user }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn admin_login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Response {
    let result = (async {
        let mut user: User = sqlx::query_as(
            &state.db.format_query("SELECT * FROM users WHERE username = ? OR email = ?")
        )
        .bind(&request.username)
        .bind(&request.username)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::AuthFailed("管理后台未查询到此账号".to_string()))?;

        if user.role != "admin" {
            return Err(AppError::Forbidden("Access denied: Not an administrator".to_string()));
        }

        if !auth::verify_password(&request.password, &user.password_hash)? {
            return Err(AppError::AuthFailed("管理员密码错误".to_string()));
        }

        if user.is_active == 0 {
            return Err(AppError::Forbidden("Account disabled".to_string()));
        }

        // Fetch permissions
        let permissions = if let Some(group_id) = user.admin_group_id {
            let row: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT permissions FROM admin_groups WHERE id = ?"))
                .bind(group_id as i32)
                .fetch_optional(&state.db.pool)
                .await?;
            
            row.and_then(|p| serde_json::from_str::<Vec<String>>(&p).ok())
               .unwrap_or_default()
        } else {
            vec![]
        };
        
        user.permissions = Some(permissions);

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

        Ok(Json(LoginResponse { token, user }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    headers: axum::http::HeaderMap,
    Json(request): Json<CreateUserRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_username_registration {
            return Err(AppError::Forbidden("Username registration is disabled".to_string()));
        }

        // IP 防刷检查
        let raw_ip = extract_client_ip(&headers, &addr);
        check_ip_rate_limit(&state, &settings.registration, &raw_ip).await?;

        let mut actual_email = request.email.clone();
        if actual_email.is_empty() {
            let random_suffix: String = (0..8).map(|_| rand::thread_rng().gen_range(0..10).to_string()).collect();
            actual_email = format!("u_{}@tokensbyte.local", random_suffix);
        }

        let exists: bool = sqlx::query_scalar(
            &state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ? OR email = ?)")
        )
        .bind(&request.username)
        .bind(&actual_email)
        .fetch_one(&state.db.pool)
        .await?;

        if exists {
            return Err(AppError::Forbidden("User already exists".to_string()));
        }

        let password_hash = auth::hash_password(&request.password)?;
        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;

        let mut tx = state.db.pool.begin().await?;

        let mut referred_by: Option<String> = None;
        if let Some(ref aff_code) = request.aff {
            let inviter_id: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE uid = ?"))
                .bind(aff_code)
                .fetch_optional(&mut *tx)
                .await?;
            referred_by = inviter_id;
        }

        let mut initial_balance = state.config.default_user_quota;
        let mut gift_amount = 0.0;
        let mut inviter_reward = 0.0;
        let mut marketing_override = false;
        let mut gift_remark = "注册赠送".to_string();

        if let Some(ref inv_id) = referred_by {
            let inviter_group: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT user_group FROM users WHERE id = ?"))
                .bind(inv_id)
                .fetch_optional(&mut *tx)
                .await?;
                
            if let Some(group) = inviter_group {
                use sqlx::Row;
                let level_row_opt = sqlx::query(&state.db.format_query("SELECT marketing_enabled, invite_reward_inviter, invite_reward_invitee, daily_invite_limit FROM user_levels WHERE group_key = ?"))
                    .bind(&group)
                    .fetch_optional(&mut *tx)
                    .await?;
                    
                if let Some(row) = level_row_opt {
                    let enabled: i64 = row.try_get::<i64, _>("marketing_enabled")
                        .unwrap_or_else(|_| row.try_get::<i32, _>("marketing_enabled").unwrap_or(0) as i64);
                        
                    if enabled == 1 {
                        marketing_override = true;
                        
                        let invitee_rew: f64 = row.try_get::<f64, _>("invite_reward_invitee").unwrap_or(0.0);
                        let inviter_rew: f64 = row.try_get::<f64, _>("invite_reward_inviter").unwrap_or(0.0);
                        let limit: i64 = row.try_get::<i64, _>("daily_invite_limit")
                            .unwrap_or_else(|_| row.try_get::<i32, _>("daily_invite_limit").unwrap_or(10) as i64);
                            
                        gift_amount = invitee_rew;
                        gift_remark = "走专属链接注册特权赠送".to_string();
                        
                        let mut can_reward = true;
                        if limit > 0 {
                            let today_prefix = chrono::Local::now().format("%Y-%m-%d").to_string();
                            let like_str = format!("{}%", today_prefix);
                            let today_count: i64 = sqlx::query_scalar(&state.db.format_query(
                                "SELECT COUNT(*) FROM users WHERE referred_by = ? AND created_at LIKE ?"
                            ))
                            .bind(inv_id)
                            .bind(&like_str)
                            .fetch_one(&mut *tx)
                            .await?;
                            
                            if today_count >= limit {
                                can_reward = false;
                                gift_amount = 0.0;
                            }
                        }
                        
                        if can_reward {
                            inviter_reward = inviter_rew;
                        }
                    }
                }
            }
        }

        if !marketing_override && settings.marketing.enable_registration_gift {
            gift_amount = calc_gift_amount(&settings.marketing);
        }
        
        if gift_amount > 0.0 {
            initial_balance += gift_amount;
        }

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active, referred_by, register_ip)
               VALUES (?, ?, ?, ?, ?, 'user', ?, 1, ?, ?)"#)
        )
        .bind(&user_id)
        .bind(&uid)
        .bind(&request.username)
        .bind(&actual_email)
        .bind(&password_hash)
        .bind(initial_balance)
        .bind(&referred_by)
        .bind(&raw_ip)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', ?)"))
                .bind(&user_id)
                .bind(gift_amount)
                .bind(&gift_remark)
                .execute(&mut *tx)
                .await?;
        }

        if inviter_reward > 0.0 {
            if let Some(ref inv_id) = referred_by {
                sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
                    .bind(inviter_reward)
                    .bind(inv_id)
                    .execute(&mut *tx)
                    .await?;
                    
                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'commission', '邀请成功奖励')"))
                    .bind(inv_id)
                    .bind(inviter_reward)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        tx.commit().await?;

        let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
            .bind(&user_id)
            .fetch_one(&state.db.pool)
            .await?;

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

        Ok(Json(LoginResponse { token, user }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

/// 发送邮箱验证码
pub async fn send_code(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SendCodeRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;

        // 邮箱防刷与白名单校验
        validate_email(&settings.registration, &request.email)?;
        
        if request.purpose == "register" && !settings.registration.enable_email_registration {
            return Err(AppError::Forbidden("Email registration is disabled".to_string()));
        }
        if request.purpose == "reset_password" && !settings.registration.enable_password_recovery {
            return Err(AppError::Forbidden("Password recovery is disabled".to_string()));
        }

        let code = generate_code();
        save_verification_code(&state, &request.email, "", &code, &request.purpose).await?;

        let email_service = EmailService::new(&settings.smtp);
        email_service.send_verification_code(&request.email, &code, &request.purpose).await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

/// 发送短信验证码
pub async fn send_sms_code(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SendSmsCodeRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        
        if request.purpose == "register" && !settings.registration.enable_mobile_registration {
            return Err(AppError::Forbidden("手机号注册未开启".to_string()));
        }

        let sms_settings = settings.sms.ok_or_else(|| AppError::BadRequest("短信通知未配置".to_string()))?;
        if sms_settings.secret_id.is_empty() {
            return Err(AppError::BadRequest("短信通知未配置".to_string()));
        }

        let code = generate_code();
        save_verification_code(&state, "", &request.mobile, &code, &request.purpose).await?;

        let sms_service = crate::services::sms::SmsService::new(&sms_settings);
        sms_service.send_verification_code(&request.mobile, &code).await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

/// 邮箱注册
pub async fn register_email(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    headers: axum::http::HeaderMap,
    Json(request): Json<EmailRegisterRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_email_registration {
            return Err(AppError::Forbidden("Email registration is disabled".to_string()));
        }

        // 邮箱校验
        validate_email(&settings.registration, &request.email)?;

        // IP 防刷
        let raw_ip = extract_client_ip(&headers, &addr);
        check_ip_rate_limit(&state, &settings.registration, &raw_ip).await?;

        verify_email_code(&state, &request.email, &request.code, "register").await?;

        let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)"))
            .bind(&request.email)
            .fetch_one(&state.db.pool)
            .await?;
        
        if exists {
            return Err(AppError::Conflict("User with this email already exists".to_string()));
        }

        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
        let username = generate_unique_username(&state, &request.email).await?;
        let password_hash = auth::hash_password(&request.password)?;

        let mut tx = state.db.pool.begin().await?;

        let mut referred_by: Option<String> = None;
        if let Some(ref aff_code) = request.aff {
            let inviter_id: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE uid = ?"))
                .bind(aff_code)
                .fetch_optional(&mut *tx)
                .await?;
            referred_by = inviter_id;
        }

        let mut initial_balance = state.config.default_user_quota;
        if settings.marketing.enable_registration_gift {
            let gift = calc_gift_amount(&settings.marketing);
            if gift > 0.0 {
                initial_balance += gift;
                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', '注册赠送')"))
                    .bind(&user_id)
                    .bind(gift)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active, referred_by, register_ip)
               VALUES (?, ?, ?, ?, ?, 'user', ?, 1, ?, ?)"#)
        )
        .bind(&user_id).bind(&uid).bind(&username).bind(&request.email)
        .bind(&password_hash).bind(initial_balance).bind(&referred_by).bind(&raw_ip)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
            .bind(&user_id)
            .fetch_one(&state.db.pool)
            .await?;

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

        Ok(Json(LoginResponse { token, user }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

/// 手机号注册
pub async fn register_mobile(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    headers: axum::http::HeaderMap,
    Json(request): Json<MobileRegisterRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_mobile_registration {
            return Err(AppError::Forbidden("手机号注册未开启".to_string()));
        }

        // IP 防刷
        let raw_ip = extract_client_ip(&headers, &addr);
        check_ip_rate_limit(&state, &settings.registration, &raw_ip).await?;

        // 验证短信验证码
        verify_sms_code(&state, &request.mobile, &request.code, "register").await?;

        let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE mobile = ?)"))
            .bind(&request.mobile)
            .fetch_one(&state.db.pool)
            .await?;
        if exists {
            return Err(AppError::Conflict("该手机号已注册".to_string()));
        }

        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
        let username = format!("m_{}", &request.mobile[request.mobile.len().saturating_sub(4)..]);
        // 确保用户名唯一
        let username = ensure_unique_username(&state, &username).await?;
        let password_hash = auth::hash_password(&request.password)?;
        let placeholder_email = format!("m_{}@tokensbyte.local", &uid);

        let mut tx = state.db.pool.begin().await?;

        let mut referred_by: Option<String> = None;
        if let Some(ref aff_code) = request.aff {
            let inviter_id: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE uid = ?"))
                .bind(aff_code)
                .fetch_optional(&mut *tx)
                .await?;
            referred_by = inviter_id;
        }

        let mut initial_balance = state.config.default_user_quota;
        if settings.marketing.enable_registration_gift {
            let gift = calc_gift_amount(&settings.marketing);
            if gift > 0.0 {
                initial_balance += gift;
                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', '注册赠送')"))
                    .bind(&user_id).bind(gift)
                    .execute(&mut *tx).await?;
            }
        }

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, mobile, password_hash, role, balance, is_active, referred_by, register_ip)
               VALUES (?, ?, ?, ?, ?, ?, 'user', ?, 1, ?, ?)"#)
        )
        .bind(&user_id).bind(&uid).bind(&username).bind(&placeholder_email)
        .bind(&request.mobile).bind(&password_hash).bind(initial_balance)
        .bind(&referred_by).bind(&raw_ip)
        .execute(&mut *tx).await?;

        tx.commit().await?;

        let user: User = sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
            .bind(&user_id).fetch_one(&state.db.pool).await?;

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;
        Ok(Json(LoginResponse { token, user }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ResetPasswordRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_password_recovery {
            return Err(AppError::Forbidden("Password recovery is disabled".to_string()));
        }

        let password_hash = auth::hash_password(&request.new_password)?;

        let result = if let Some(email) = &request.email {
            verify_email_code(&state, email, &request.code, "reset_password").await?;
            sqlx::query(&state.db.format_query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?"))
                .bind(&password_hash).bind(email)
                .execute(&state.db.pool).await?
        } else if let Some(mobile) = &request.mobile {
            verify_sms_code(&state, mobile, &request.code, "reset_password").await?;
            sqlx::query(&state.db.format_query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE mobile = ?"))
                .bind(&password_hash).bind(mobile)
                .execute(&state.db.pool).await?
        } else {
            return Err(AppError::BadRequest("Email or mobile is required".to_string()));
        };

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("User not found".to_string()));
        }

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

// ======================== OAuth 回调 ========================

#[derive(Debug, serde::Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

/// 微信 OAuth — 获取授权 URL 并重定向
pub async fn oauth_wechat(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权登录未配置".to_string()))?;
        if wechat.app_id.is_empty() {
            return Err(AppError::BadRequest("微信授权登录未配置".to_string()));
        }

        let req_base_url = get_base_url_from_req(&headers, &state.config.base_url);
        let base_url = format!("{}/api/v1/auth/oauth/wechat/callback", req_base_url);
        // bind_user_id 用于绑定场景
        let _bind_user_id = params.get("bind_user_id").cloned().unwrap_or_default();
        let state_val = format!("wechat_{}", uuid::Uuid::new_v4().simple());
        let url = crate::services::oauth::OAuthService::wechat_auth_url(
            &wechat.app_id, &base_url, &state_val,
        );
        Ok::<_, AppError>(url)
    }).await;

    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 微信 OAuth 回调 — 自动注册/登录
pub async fn oauth_wechat_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code 参数".to_string()))?;
        let settings = get_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;

        let info = crate::services::oauth::OAuthService::wechat_exchange(
            &wechat.app_id, &wechat.app_secret, &code
        ).await?;

        // 查找已绑定用户
        let existing: Option<User> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM users WHERE wechat_id = ?")
        ).bind(&info.openid).fetch_optional(&state.db.pool).await?;

        let user = if let Some(u) = existing {
            u
        } else {
            // 自动注册
            let user_id = uuid::Uuid::new_v4().to_string();
            let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
            let nickname = info.nickname.unwrap_or_else(|| format!("wx_{}", &info.openid[..8]));
            let username = ensure_unique_username(&state, &nickname).await?;
            let placeholder_email = format!("wx_{}@tokensbyte.local", &uid);
            let password_hash = auth::hash_password(&uuid::Uuid::new_v4().to_string())?;

            sqlx::query(
                &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, nickname, wechat_id, role, balance, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, 1)"#)
            )
            .bind(&user_id).bind(&uid).bind(&username).bind(&placeholder_email)
            .bind(&password_hash).bind(&nickname).bind(&info.openid)
            .bind(state.config.default_user_quota)
            .execute(&state.db.pool).await?;

            sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
                .bind(&user_id).fetch_one(&state.db.pool).await?
        };

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;
        // 重定向到前端，附带 token
        let redirect_url = format!("/login?token={}&type=wechat", token);
        Ok::<_, AppError>(redirect_url)
    }).await;

    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 谷歌 OAuth — 获取授权 URL 并重定向
pub async fn oauth_google(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权登录未配置".to_string()))?;
        if google.client_id.is_empty() {
            return Err(AppError::BadRequest("谷歌授权登录未配置".to_string()));
        }

        let req_base_url = get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/auth/oauth/google/callback", req_base_url);
        let state_val = format!("google_{}", uuid::Uuid::new_v4().simple());
        let url = crate::services::oauth::OAuthService::google_auth_url(
            &google.client_id, &redirect_uri, &state_val,
        );
        Ok::<_, AppError>(url)
    }).await;

    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

/// 谷歌 OAuth 回调 — 自动注册/登录
pub async fn oauth_google_callback(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code 参数".to_string()))?;
        let settings = get_all_settings(&state).await?;
        let google = settings.google_oauth.ok_or_else(|| AppError::BadRequest("谷歌授权未配置".to_string()))?;

        let req_base_url = get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/auth/oauth/google/callback", req_base_url);

        let info = crate::services::oauth::OAuthService::google_exchange(
            &google.client_id, &google.client_secret, &code, &redirect_uri,
        ).await?;

        // 查找已绑定用户
        let existing: Option<User> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM users WHERE google_id = ?")
        ).bind(&info.id).fetch_optional(&state.db.pool).await?;

        let user = if let Some(u) = existing {
            u
        } else {
            // 自动注册
            let user_id = uuid::Uuid::new_v4().to_string();
            let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
            let name = info.name.unwrap_or_else(|| format!("g_{}", &info.id[..8]));
            let username = ensure_unique_username(&state, &name).await?;
            let email = info.email.unwrap_or_else(|| format!("g_{}@tokensbyte.local", &uid));
            let password_hash = auth::hash_password(&uuid::Uuid::new_v4().to_string())?;

            // 检查邮箱是否已存在
            let email_exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)"))
                .bind(&email).fetch_one(&state.db.pool).await?;
            let actual_email = if email_exists { format!("g_{}@tokensbyte.local", &uid) } else { email };

            sqlx::query(
                &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, nickname, google_id, role, balance, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, 1)"#)
            )
            .bind(&user_id).bind(&uid).bind(&username).bind(&actual_email)
            .bind(&password_hash).bind(&name).bind(&info.id)
            .bind(state.config.default_user_quota)
            .execute(&state.db.pool).await?;

            sqlx::query_as(&state.db.format_query("SELECT * FROM users WHERE id = ?"))
                .bind(&user_id).fetch_one(&state.db.pool).await?
        };

        let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;
        let redirect_url = format!("/login?token={}&type=google", token);
        Ok::<_, AppError>(redirect_url)
    }).await;

    match result {
        Ok(url) => Redirect::temporary(&url).into_response(),
        Err(err) => err.into_response(),
    }
}

// ======================== 内部工具函数 ========================

async fn get_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    crate::api::settings::load_all_settings(state).await
}

/// 生成 6 位数字验证码
fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..6).map(|_| rng.gen_range(0..10).to_string()).collect()
}

/// 保存验证码到数据库
async fn save_verification_code(state: &Arc<AppState>, email: &str, phone: &str, code: &str, purpose: &str) -> AppResult<()> {
    let expires_at = (Utc::now() + Duration::minutes(10)).format("%Y-%m-%d %H:%M:%S").to_string();
    sqlx::query(
        &state.db.format_query("INSERT INTO verification_codes (email, phone, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?)")
    )
    .bind(email).bind(phone).bind(code).bind(purpose).bind(&expires_at)
    .execute(&state.db.pool).await?;
    Ok(())
}

/// 校验邮箱验证码（pub 版本供 user.rs 调用）
pub async fn verify_email_code_pub(state: &Arc<AppState>, email: &str, code: &str, purpose: &str) -> AppResult<()> {
    verify_email_code(state, email, code, purpose).await
}

/// 校验短信验证码（pub 版本供 user.rs 调用）
pub async fn verify_sms_code_pub(state: &Arc<AppState>, phone: &str, code: &str, purpose: &str) -> AppResult<()> {
    verify_sms_code(state, phone, code, purpose).await
}

/// 校验邮箱验证码
async fn verify_email_code(state: &Arc<AppState>, email: &str, code: &str, purpose: &str) -> AppResult<()> {
    let row: Option<(String,)> = sqlx::query_as(
        &state.db.format_query("SELECT expires_at FROM verification_codes WHERE email = ? AND code = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1")
    ).bind(email).bind(code).bind(purpose)
    .fetch_optional(&state.db.pool).await?;

    let (expires_at,) = row.ok_or_else(|| AppError::BadRequest("Invalid verification code".to_string()))?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if now > expires_at {
        return Err(AppError::BadRequest("Verification code expired".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM verification_codes WHERE email = ? AND code = ? AND purpose = ?"))
        .bind(email).bind(code).bind(purpose)
        .execute(&state.db.pool).await?;
    Ok(())
}

/// 校验短信验证码
async fn verify_sms_code(state: &Arc<AppState>, phone: &str, code: &str, purpose: &str) -> AppResult<()> {
    let row: Option<(String,)> = sqlx::query_as(
        &state.db.format_query("SELECT expires_at FROM verification_codes WHERE phone = ? AND code = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1")
    ).bind(phone).bind(code).bind(purpose)
    .fetch_optional(&state.db.pool).await?;

    let (expires_at,) = row.ok_or_else(|| AppError::BadRequest("短信验证码无效".to_string()))?;
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if now > expires_at {
        return Err(AppError::BadRequest("短信验证码已过期".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM verification_codes WHERE phone = ? AND code = ? AND purpose = ?"))
        .bind(phone).bind(code).bind(purpose)
        .execute(&state.db.pool).await?;
    Ok(())
}

/// 提取客户端 IP
fn extract_client_ip(headers: &axum::http::HeaderMap, addr: &std::net::SocketAddr) -> String {
    headers.get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()).map(|s| s.to_string()))
        .unwrap_or_else(|| addr.ip().to_string())
}

/// IP 注册防刷检查
async fn check_ip_rate_limit(state: &Arc<AppState>, reg: &RegistrationSettings, ip: &str) -> AppResult<()> {
    if !reg.ip_rate_limit_enabled {
        return Ok(());
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let like_str = format!("{}%", today);
    let count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM users WHERE register_ip = ? AND created_at LIKE ?"
    )).bind(ip).bind(&like_str).fetch_one(&state.db.pool).await?;

    if count >= reg.ip_daily_limit as i64 {
        return Err(AppError::Forbidden(format!("当日注册次数已达上限 ({})", reg.ip_daily_limit)));
    }
    Ok(())
}

/// 邮箱防刷 + 白名单校验
fn validate_email(reg: &RegistrationSettings, email: &str) -> AppResult<()> {
    let parts: Vec<&str> = email.splitn(2, '@').collect();
    if parts.len() != 2 {
        return Err(AppError::BadRequest("邮箱格式不正确".to_string()));
    }
    let (local, domain) = (parts[0], parts[1]);

    if reg.email_validation_strict {
        if local.len() > 25 {
            return Err(AppError::BadRequest("邮箱地址过长".to_string()));
        }
        if !local.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(AppError::BadRequest("邮箱地址仅允许数字、字母和下划线".to_string()));
        }
    }

    if reg.email_whitelist_enabled && !reg.email_whitelist.is_empty() {
        if !reg.email_whitelist.iter().any(|d| d.eq_ignore_ascii_case(domain)) {
            return Err(AppError::BadRequest(format!("不支持 @{} 域名的邮箱注册", domain)));
        }
    }
    Ok(())
}

/// 计算注册赠送金额
fn calc_gift_amount(marketing: &crate::models::MarketingSettings) -> f64 {
    if !marketing.enable_registration_gift {
        return 0.0;
    }
    if marketing.gift_mode == "random" {
        let min = marketing.min_amount as i64;
        let max = marketing.max_amount as i64;
        if max > min { rand::thread_rng().gen_range(min..=max) as f64 } else { min as f64 }
    } else {
        marketing.fixed_amount
    }
}

/// 从邮箱前缀生成唯一用户名
async fn generate_unique_username(state: &Arc<AppState>, email: &str) -> AppResult<String> {
    let base = email.split('@').next().unwrap_or("user").to_string();
    ensure_unique_username(state, &base).await
}

/// 确保用户名唯一（存在则追加随机后缀）
async fn ensure_unique_username(state: &Arc<AppState>, base: &str) -> AppResult<String> {
    let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)"))
        .bind(base).fetch_one(&state.db.pool).await?;
    if !exists {
        return Ok(base.to_string());
    }
    let suffix: String = (0..4).map(|_| rand::thread_rng().gen_range(0..10).to_string()).collect();
    Ok(format!("{}_{}", base, suffix))
}
