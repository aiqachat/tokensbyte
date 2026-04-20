use axum::{
    extract::{State, ConnectInfo},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{
    LoginRequest, LoginResponse, CreateUserRequest, User, 
    SendCodeRequest, EmailRegisterRequest, ResetPasswordRequest,
    AllSettings, SiteSettings, CurrencySettings, RegistrationSettings, SMTPSettings
};
use crate::error::{AppError, AppResult};
use crate::auth;
use crate::services::email::EmailService;
use chrono::{Utc, Duration};
use rand::Rng;

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Response {
    let result = (async {
        let user: User = sqlx::query_as(
            &state.db.format_query("SELECT * FROM users WHERE username = ? OR email = ?")
        )
        .bind(&request.username)
        .bind(&request.username)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::AuthFailed("没有此用户，请核对您的账号".to_string()))?;

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
            // Super Admin - permissions handled by frontend logic bypassing (user.admin_group_id == null)
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
            gift_amount = if settings.marketing.gift_mode == "random" {
                let min = settings.marketing.min_amount as i64;
                let max = settings.marketing.max_amount as i64;
                if max > min {
                    rand::thread_rng().gen_range(min..=max) as f64
                } else {
                    min as f64
                }
            } else {
                settings.marketing.fixed_amount
            };
        }
        
        if gift_amount > 0.0 {
            initial_balance += gift_amount;
        }

        let raw_ip = headers.get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
            .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()).map(|s| s.to_string()))
            .unwrap_or_else(|| addr.ip().to_string());

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

pub async fn send_code(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SendCodeRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        
        if request.purpose == "register" && !settings.registration.enable_email_registration {
            return Err(AppError::Forbidden("Email registration is disabled".to_string()));
        }
        if request.purpose == "reset_password" && !settings.registration.enable_password_recovery {
            return Err(AppError::Forbidden("Password recovery is disabled".to_string()));
        }

        let code: String = {
            let mut rng = rand::thread_rng();
            (0..6).map(|_| rng.gen_range(0..10).to_string()).collect()
        };
        let expires_at = (Utc::now() + Duration::minutes(10)).format("%Y-%m-%d %H:%M:%S").to_string();

        sqlx::query(
            &state.db.format_query("INSERT INTO verification_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)")
        )
        .bind(&request.email)
        .bind(&code)
        .bind(&request.purpose)
        .bind(&expires_at)
        .execute(&state.db.pool)
        .await?;

        let email_service = EmailService::new(&settings.smtp);
        email_service.send_verification_code(&request.email, &code, &request.purpose).await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}


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

        verify_code(&state, &request.email, &request.code, "register").await?;

        let exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)"))
            .bind(&request.email)
            .fetch_one(&state.db.pool)
            .await?;
        
        if exists {
            return Err(AppError::Conflict("User with this email already exists".to_string()));
        }

        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
        let mut username = request.email.split('@').next().unwrap_or("user").to_string();
        
        let username_exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)"))
            .bind(&username)
            .fetch_one(&state.db.pool)
            .await?;
        
        if username_exists {
            let suffix: String = (0..4).map(|_| rand::thread_rng().gen_range(0..10).to_string()).collect();
            username = format!("{}_{}", username, suffix);
        }

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
        let mut gift_amount = 0.0;

        if settings.marketing.enable_registration_gift {
            gift_amount = if settings.marketing.gift_mode == "random" {
                let min = settings.marketing.min_amount as i64;
                let max = settings.marketing.max_amount as i64;
                if max > min {
                    rand::thread_rng().gen_range(min..=max) as f64
                } else {
                    min as f64
                }
            } else {
                settings.marketing.fixed_amount
            };
            if gift_amount > 0.0 {
                initial_balance += gift_amount;
            }
        }

        let raw_ip = headers.get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
            .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()).map(|s| s.to_string()))
            .unwrap_or_else(|| addr.ip().to_string());

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active, referred_by, register_ip)
               VALUES (?, ?, ?, ?, ?, 'user', ?, 1, ?, ?)"#)
        )
        .bind(&user_id)
        .bind(&uid)
        .bind(&username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(initial_balance)
        .bind(&referred_by)
        .bind(&raw_ip)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', '注册赠送')"))
                .bind(&user_id)
                .bind(gift_amount)
                .execute(&mut *tx)
                .await?;
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

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ResetPasswordRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_password_recovery {
            return Err(AppError::Forbidden("Password recovery is disabled".to_string()));
        }

        verify_code(&state, &request.email, &request.code, "reset_password").await?;

        let password_hash = auth::hash_password(&request.new_password)?;
        let result = sqlx::query(&state.db.format_query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?"))
            .bind(&password_hash)
            .bind(&request.email)
            .execute(&state.db.pool)
            .await?;

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

async fn get_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    use crate::api::settings::{default_site_settings, default_currency_settings, default_registration_settings, default_smtp_settings, default_marketing_settings};
    
    let site = get_setting::<SiteSettings>(state, "site_settings", default_site_settings()).await?;
    let currency = get_setting::<CurrencySettings>(state, "currency_settings", default_currency_settings()).await?;
    let registration = get_setting::<RegistrationSettings>(state, "registration_settings", default_registration_settings()).await?;
    let smtp = get_setting::<SMTPSettings>(state, "smtp_settings", default_smtp_settings()).await?;
    let marketing = get_setting::<crate::models::MarketingSettings>(state, "marketing_settings", default_marketing_settings()).await?;

    use crate::api::settings::default_database_settings;
    let database = get_setting::<crate::models::DatabaseSettings>(state, "database_settings", default_database_settings()).await?;
    let payment_wechat = get_setting::<Option<crate::models::PaymentWechatSettings>>(state, "payment_wechat", None).await?;
    let payment_alipay = get_setting::<Option<crate::models::PaymentAlipaySettings>>(state, "payment_alipay", None).await?;

    Ok(AllSettings { site, currency, registration, smtp, marketing, database, payment_wechat, payment_alipay })
}

async fn get_setting<T: serde::de::DeserializeOwned + Clone>(state: &Arc<AppState>, key: &str, default: T) -> AppResult<T> {
    let val: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = ?"))
        .bind(key)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if let Some(v) = val {
        Ok(serde_json::from_str(&v).unwrap_or(default))
    } else {
        Ok(default)
    }
}

async fn verify_code(state: &Arc<AppState>, email: &str, code: &str, purpose: &str) -> AppResult<()> {
    let row: Option<(String,)> = sqlx::query_as(&state.db.format_query("SELECT expires_at FROM verification_codes WHERE email = ? AND code = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1"))
        .bind(email)
        .bind(code)
        .bind(purpose)
        .fetch_optional(&state.db.pool)
        .await?;

    let (expires_at,) = row.ok_or_else(|| AppError::BadRequest("Invalid verification code".to_string()))?;
    
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if now > expires_at {
        return Err(AppError::BadRequest("Verification code expired".to_string()));
    }

    sqlx::query(&state.db.format_query("DELETE FROM verification_codes WHERE email = ? AND code = ? AND purpose = ?"))
        .bind(email)
        .bind(code)
        .bind(purpose)
        .execute(&state.db.pool)
        .await?;

    Ok(())
}
