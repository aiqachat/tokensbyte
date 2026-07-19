use crate::auth;
use crate::error::{AppError, AppResult};
use crate::models::{
    AllSettings, CreateUserRequest, EmailRegisterRequest, LoginRequest, LoginResponse,
    MobileRegisterRequest, RegistrationSettings, ResetPasswordRequest, SendCodeRequest,
    SendSmsCodeRequest, User,
};
use crate::services::email::EmailService;
use crate::time_system::DbTs;
use crate::AppState;
use axum::{
    extract::{ConnectInfo, Query, State},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;
use std::sync::Arc;

/// 验证码最大错误尝试次数（超过即作废）
const MAX_CODE_ATTEMPTS: i32 = 3;
/// 验证码有效期（分钟）
const CODE_EXPIRY_MINUTES: i64 = 5;
/// OAuth state 有效期（秒）
const OAUTH_STATE_TTL_SECS: i64 = 600;

/// 常量时间字符串比较，避免时序旁路
fn ct_eq_str(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.as_bytes()
        .iter()
        .zip(b.as_bytes().iter())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}

/// 指定 timedisplay 下「今日」UTC 半开区间，供 TIMESTAMPTZ 列范围查询。
fn today_bounds_db_ts(timedisplay: &str) -> (DbTs, DbTs) {
    let day = crate::time_system::local_day_bounds_utc(Utc::now(), timedisplay);
    (DbTs::from_utc(day.start_utc), DbTs::from_utc(day.end_utc))
}

fn site_timedisplay(settings: &crate::models::AllSettings) -> &str {
    let t = settings.site.default_timezone.trim();
    if t.is_empty() {
        crate::time_system::DEFAULT_TIMEDISPLAY
    } else {
        t
    }
}

pub fn get_base_url_from_req(headers: &axum::http::HeaderMap, fallback: &str) -> String {
    std::env::var("PUBLIC_API_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            headers
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(|s| s.to_string())
        })
        .or_else(|| {
            let host = headers
                .get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let scheme = headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(
                    if host.contains("localhost") || host.contains("127.0.0.1") {
                        "http"
                    } else {
                        "https"
                    },
                );
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
            Some("email") => ("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.email = ?", "未找到该邮箱对应的账号"),
            Some("mobile") => ("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.mobile = ?", "未找到该手机号对应的账号"),
            _ => ("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.username = ?", "未找到此账号，请检查用户名"),
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

        // 如果是bcrypt哈希，自动升级为Argon2
        if user.password_hash.starts_with("$2y$") || user.password_hash.starts_with("$2b$") {
            let new_hash = auth::hash_password(&request.password)?;
            sqlx::query(&state.db.format_query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(&new_hash)
                .bind(&user.id)
                .execute(&state.db.pool)
                .await?;
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
            &state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id, ul.allow_view_log_details FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.username = ? OR u.email = ?")
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

        // 如果是bcrypt哈希，自动升级为Argon2
        if user.password_hash.starts_with("$2y$") || user.password_hash.starts_with("$2b$") {
            let new_hash = auth::hash_password(&request.password)?;
            sqlx::query(&state.db.format_query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
                .bind(&new_hash)
                .bind(&user.id)
                .execute(&state.db.pool)
                .await?;
        }

        // Fetch permissions
        let permissions = if let Some(group_id) = user.admin_group_id {
            let row: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT permissions FROM admin_groups WHERE id = ?"))
                .bind(group_id)
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

        // 用户名合规校验
        validate_username(&request.username, true)?;

        // 公开用户名注册不得写入未验证邮箱，否则可被用于邮箱找回接管
        let random_suffix: String = (0..8)
            .map(|_| rand::thread_rng().gen_range(0..10).to_string())
            .collect();
        let actual_email = format!("u_{}@tokensbyte.local", random_suffix);

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

        let initial_balance = state.config.default_user_quota;
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
                        .unwrap_or_else(|_| row.try_get::<i64, _>("marketing_enabled").unwrap_or(0) as i64);

                    if enabled == 1 {
                        marketing_override = true;

                        let invitee_rew: f64 = row.try_get::<f64, _>("invite_reward_invitee").unwrap_or(0.0);
                        let inviter_rew: f64 = row.try_get::<f64, _>("invite_reward_inviter").unwrap_or(0.0);
                        let limit: i64 = row.try_get::<i64, _>("daily_invite_limit")
                            .unwrap_or_else(|_| row.try_get::<i64, _>("daily_invite_limit").unwrap_or(10) as i64);

                        gift_amount = invitee_rew;
                        gift_remark = "走专属链接注册特权赠送".to_string();

                        let mut can_reward = true;
                        if limit > 0 {
                            let (day_start, day_end) = today_bounds_db_ts(site_timedisplay(&settings));
                            let today_count: i64 = sqlx::query_scalar(&state.db.format_query(
                                "SELECT COUNT(*) FROM users WHERE referred_by = ? AND created_at >= ?::timestamptz AND created_at < ?::timestamptz"
                            ))
                            .bind(inv_id)
                            .bind(&day_start)
                            .bind(&day_end)
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

        // 查询默认注册等级
        let default_group: String = sqlx::query_scalar(&state.db.format_query(
            "SELECT group_key FROM user_levels WHERE is_default = 1 LIMIT 1"
        ))
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| "default".to_string());

        let referral_history = if let Some(ref inviter_id) = referred_by {
            let now = crate::time_system::utc_naive_string();
            let display_name = state.db.get_user_display_name(inviter_id).await;
            Some(format!("[{}] 通过 {} 邀请注册\n", now, display_name))
        } else {
            None
        };

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, gift_balance, is_active, referred_by, register_ip, user_group, referral_history)
               VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 1, ?, ?, ?, ?)"#)
        )
        .bind(&user_id)
        .bind(&uid)
        .bind(&request.username)
        .bind(&actual_email)
        .bind(&password_hash)
        .bind(initial_balance)
        .bind(gift_amount)
        .bind(&referred_by)
        .bind(&raw_ip)
        .bind(&default_group)
        .bind(&referral_history)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'gift', ?, 'gift')"))
                .bind(&user_id)
                .bind(gift_amount)
                .bind(&gift_remark)
                .execute(&mut *tx)
                .await?;
        }

        if inviter_reward > 0.0 {
            if let Some(ref inv_id) = referred_by {
                sqlx::query(&state.db.format_query("UPDATE users SET gift_balance = gift_balance + ? WHERE id = ?"))
                    .bind(inviter_reward)
                    .bind(inv_id)
                    .execute(&mut *tx)
                    .await?;

                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'commission', '邀请成功奖励', 'gift')"))
                    .bind(inv_id)
                    .bind(inviter_reward)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        tx.commit().await?;

        // 团队邀请码：注册后自动加入团队
        if let Some(ref team_code) = request.team {
            if !team_code.trim().is_empty() {
                #[cfg(feature = "commercial_plugins")]
                let _ = crate::api::team_marketing::add_user_to_team_by_invite_code(&state, &user_id, team_code.trim()).await;
            }
        }

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
        let purpose = request.purpose.as_str();
        validate_code_purpose(purpose, CodeChannel::Email)?;

        // 邮箱防刷与白名单校验
        validate_email(&settings.registration, &request.email)?;
        if is_placeholder_email(&request.email) {
            return Err(AppError::BadRequest("无效的邮箱地址".to_string()));
        }

        if purpose == "register" && !settings.registration.enable_email_registration {
            return Err(AppError::Forbidden(
                "Email registration is disabled".to_string(),
            ));
        }
        if purpose == "reset_password" {
            if !settings.registration.enable_password_recovery {
                return Err(AppError::Forbidden(
                    "Password recovery is disabled".to_string(),
                ));
            }
            // 仅向已真实绑定该邮箱的账号发送找回验证码，禁止任意邮箱刷码/接管未绑定账号
            if !email_is_bound_for_recovery(&state, &request.email).await? {
                return Err(AppError::BadRequest(
                    "该邮箱未绑定账号，无法找回密码".to_string(),
                ));
            }
        }

        check_code_send_cooldown(&state, &request.email, "", purpose).await?;

        let code = generate_code();
        save_verification_code(&state, &request.email, "", &code, purpose).await?;

        let email_service = EmailService::new(&settings.smtp)?;
        email_service
            .send_verification_code(&request.email, &code, purpose)
            .await?;

        Ok(Json(serde_json::json!({ "success": true })))
    })
    .await;

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
        let purpose = request.purpose.as_str();
        validate_code_purpose(purpose, CodeChannel::Sms)?;

        if request.mobile.trim().is_empty() {
            return Err(AppError::BadRequest("手机号不能为空".to_string()));
        }

        if purpose == "register" && !settings.registration.enable_mobile_registration {
            return Err(AppError::Forbidden("手机号注册未开启".to_string()));
        }
        if purpose == "reset_password" {
            if !settings.registration.enable_password_recovery {
                return Err(AppError::Forbidden(
                    "Password recovery is disabled".to_string(),
                ));
            }
            if !mobile_is_bound_for_recovery(&state, &request.mobile).await? {
                return Err(AppError::BadRequest(
                    "该手机号未绑定账号，无法找回密码".to_string(),
                ));
            }
        }

        let sms_settings = settings
            .sms
            .ok_or_else(|| AppError::BadRequest("短信通知未配置".to_string()))?;
        if sms_settings.secret_id.is_empty() {
            return Err(AppError::BadRequest("短信通知未配置".to_string()));
        }

        check_code_send_cooldown(&state, "", &request.mobile, purpose).await?;

        let code = generate_code();
        save_verification_code(&state, "", &request.mobile, &code, purpose).await?;

        let sms_service = crate::services::sms::SmsService::new(&sms_settings);
        sms_service
            .send_verification_code(&request.mobile, &code)
            .await?;

        Ok(Json(serde_json::json!({ "success": true })))
    })
    .await;

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

        let initial_balance = state.config.default_user_quota;
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
                        .unwrap_or_else(|_| row.try_get::<i64, _>("marketing_enabled").unwrap_or(0) as i64);

                    if enabled == 1 {
                        marketing_override = true;

                        let invitee_rew: f64 = row.try_get::<f64, _>("invite_reward_invitee").unwrap_or(0.0);
                        let inviter_rew: f64 = row.try_get::<f64, _>("invite_reward_inviter").unwrap_or(0.0);
                        let limit: i64 = row.try_get::<i64, _>("daily_invite_limit")
                            .unwrap_or_else(|_| row.try_get::<i64, _>("daily_invite_limit").unwrap_or(10) as i64);

                        gift_amount = invitee_rew;
                        gift_remark = "走专属链接注册特权赠送".to_string();

                        let mut can_reward = true;
                        if limit > 0 {
                            let (day_start, day_end) = today_bounds_db_ts(site_timedisplay(&settings));
                            let today_count: i64 = sqlx::query_scalar(&state.db.format_query(
                                "SELECT COUNT(*) FROM users WHERE referred_by = ? AND created_at >= ?::timestamptz AND created_at < ?::timestamptz"
                            ))
                            .bind(inv_id)
                            .bind(&day_start)
                            .bind(&day_end)
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

        // 查询默认注册等级
        let default_group: String = sqlx::query_scalar(&state.db.format_query(
            "SELECT group_key FROM user_levels WHERE is_default = 1 LIMIT 1"
        ))
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| "default".to_string());

        let referral_history = if let Some(ref inviter_id) = referred_by {
            let now = crate::time_system::utc_naive_string();
            let display_name = state.db.get_user_display_name(inviter_id).await;
            Some(format!("[{}] 通过 {} 邀请注册\n", now, display_name))
        } else {
            None
        };

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, gift_balance, is_active, referred_by, register_ip, user_group, referral_history)
               VALUES (?, ?, ?, ?, ?, 'user', ?, ?, 1, ?, ?, ?, ?)"#)
        )
        .bind(&user_id).bind(&uid).bind(&username).bind(&request.email)
        .bind(&password_hash).bind(initial_balance).bind(gift_amount).bind(&referred_by).bind(&raw_ip)
        .bind(&default_group).bind(&referral_history)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'gift', ?, 'gift')"))
                .bind(&user_id)
                .bind(gift_amount)
                .bind(&gift_remark)
                .execute(&mut *tx)
                .await?;
        }

        if inviter_reward > 0.0 {
            if let Some(ref inv_id) = referred_by {
                sqlx::query(&state.db.format_query("UPDATE users SET gift_balance = gift_balance + ? WHERE id = ?"))
                    .bind(inviter_reward)
                    .bind(inv_id)
                    .execute(&mut *tx)
                    .await?;

                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'commission', '邀请成功奖励', 'gift')"))
                    .bind(inv_id)
                    .bind(inviter_reward)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        tx.commit().await?;

        // 团队邀请码：注册后自动加入团队
        if let Some(ref team_code) = request.team {
            if !team_code.trim().is_empty() {
                #[cfg(feature = "commercial_plugins")]
                let _ = crate::api::team_marketing::add_user_to_team_by_invite_code(&state, &user_id, team_code.trim()).await;
            }
        }

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

        // IP 防刷检查（手机号注册因为有真实的短信验证码验证，不受 IP 次数限制）
        let raw_ip = extract_client_ip(&headers, &addr);
        // check_ip_rate_limit(&state, &settings.registration, &raw_ip).await?;

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
        let base_username = format!("m_{}", &request.mobile[request.mobile.len().saturating_sub(4)..]);
        // 确保用户名唯一
        let username = ensure_unique_username(&state, &base_username).await?;
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

        let initial_balance = state.config.default_user_quota;
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
                        .unwrap_or_else(|_| row.try_get::<i64, _>("marketing_enabled").unwrap_or(0) as i64);

                    if enabled == 1 {
                        marketing_override = true;

                        let invitee_rew: f64 = row.try_get::<f64, _>("invite_reward_invitee").unwrap_or(0.0);
                        let inviter_rew: f64 = row.try_get::<f64, _>("invite_reward_inviter").unwrap_or(0.0);
                        let limit: i64 = row.try_get::<i64, _>("daily_invite_limit")
                            .unwrap_or_else(|_| row.try_get::<i64, _>("daily_invite_limit").unwrap_or(10) as i64);

                        gift_amount = invitee_rew;
                        gift_remark = "走专属链接注册特权赠送".to_string();

                        let mut can_reward = true;
                        if limit > 0 {
                            let (day_start, day_end) = today_bounds_db_ts(site_timedisplay(&settings));
                            let today_count: i64 = sqlx::query_scalar(&state.db.format_query(
                                "SELECT COUNT(*) FROM users WHERE referred_by = ? AND created_at >= ?::timestamptz AND created_at < ?::timestamptz"
                            ))
                            .bind(inv_id)
                            .bind(&day_start)
                            .bind(&day_end)
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

        // 查询默认注册等级
        let default_group: String = sqlx::query_scalar(&state.db.format_query(
            "SELECT group_key FROM user_levels WHERE is_default = 1 LIMIT 1"
        ))
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or_else(|| "default".to_string());

        let referral_history = if let Some(ref inviter_id) = referred_by {
            let now = crate::time_system::utc_naive_string();
            let display_name = state.db.get_user_display_name(inviter_id).await;
            Some(format!("[{}] 通过 {} 邀请注册\n", now, display_name))
        } else {
            None
        };

        sqlx::query(
            &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, mobile, password_hash, role, balance, gift_balance, is_active, referred_by, register_ip, user_group, referral_history)
               VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, 1, ?, ?, ?, ?)"#)
        )
        .bind(&user_id).bind(&uid).bind(&username).bind(&placeholder_email)
        .bind(&request.mobile).bind(&password_hash).bind(initial_balance).bind(gift_amount)
        .bind(&referred_by).bind(&raw_ip)
        .bind(&default_group).bind(&referral_history)
        .execute(&mut *tx).await?;

        if gift_amount > 0.0 {
            sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'gift', ?, 'gift')"))
                .bind(&user_id).bind(gift_amount).bind(&gift_remark)
                .execute(&mut *tx).await?;
        }

        if inviter_reward > 0.0 {
            if let Some(ref inv_id) = referred_by {
                sqlx::query(&state.db.format_query("UPDATE users SET gift_balance = gift_balance + ? WHERE id = ?"))
                    .bind(inviter_reward)
                    .bind(inv_id)
                    .execute(&mut *tx)
                    .await?;

                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'commission', '邀请成功奖励', 'gift')"))
                    .bind(inv_id)
                    .bind(inviter_reward)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        tx.commit().await?;

        // 团队邀请码：注册后自动加入团队
        if let Some(ref team_code) = request.team {
            if !team_code.trim().is_empty() {
                #[cfg(feature = "commercial_plugins")]
                let _ = crate::api::team_marketing::add_user_to_team_by_invite_code(&state, &user_id, team_code.trim()).await;
            }
        }

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

        if request.new_password.chars().count() < 6 {
            return Err(AppError::BadRequest(
                "密码长度至少为 6 位".to_string(),
            ));
        }

        let password_hash = auth::hash_password(&request.new_password)?;

        let result = if let Some(email) = &request.email {
            if is_placeholder_email(email) {
                return Err(AppError::BadRequest(
                    "该邮箱未绑定账号，无法找回密码".to_string(),
                ));
            }
            // 先确认唯一真实绑定，再验码，避免对未绑定邮箱消耗/校验验证码后误更新
            let user_id = resolve_unique_bound_email_user(&state, email).await?;
            verify_email_code(&state, email, &request.code, "reset_password").await?;
            sqlx::query(&state.db.format_query(
                "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND email = ?",
            ))
            .bind(&password_hash)
            .bind(&user_id)
            .bind(email)
            .execute(&state.db.pool)
            .await?
        } else if let Some(mobile) = &request.mobile {
            if mobile.trim().is_empty() {
                return Err(AppError::BadRequest(
                    "该手机号未绑定账号，无法找回密码".to_string(),
                ));
            }
            let user_id = resolve_unique_bound_mobile_user(&state, mobile).await?;
            verify_sms_code(&state, mobile, &request.code, "reset_password").await?;
            sqlx::query(&state.db.format_query(
                "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND mobile = ?",
            ))
            .bind(&password_hash)
            .bind(&user_id)
            .bind(mobile)
            .execute(&state.db.pool)
            .await?
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

/// 微信 OAuth — 获取授权 URL 并重定向（兼容旧流程）
pub async fn oauth_wechat(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        let wechat = settings
            .wechat_oauth
            .ok_or_else(|| AppError::BadRequest("微信授权登录未配置".to_string()))?;
        if wechat.app_id.is_empty() {
            return Err(AppError::BadRequest("微信授权登录未配置".to_string()));
        }
        let req_base_url = get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/auth/oauth/wechat/callback", req_base_url);
        let state_val = generate_oauth_state(&state.config.jwt_secret, "wechat");
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

/// 微信 OAuth 回调 — 自动注册/登录
pub async fn oauth_wechat_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code 参数".to_string()))?;
        // CSRF 防护：校验 state 参数的 HMAC 签名和时间窗口
        let state_param = query.state.as_deref().unwrap_or("");
        if !verify_oauth_state(&state.config.jwt_secret, "wechat", state_param) {
            return Err(AppError::BadRequest("OAuth state 验证失败，请重新发起授权".to_string()));
        }
        let settings = get_all_settings(&state).await?;
        let wechat = settings.wechat_oauth.ok_or_else(|| AppError::BadRequest("微信授权未配置".to_string()))?;

        let info = crate::services::oauth::OAuthService::wechat_exchange(
            &wechat.app_id, &wechat.app_secret, &code
        ).await?;

        let wechat_identifier = info.unionid.as_deref().unwrap_or(&info.openid);
        let fallback_identifier = &info.openid;

        // 查找已绑定用户（双重校验 unionid 或 openid）
        let existing: Option<User> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM users WHERE wechat_id = ? OR wechat_id = ?")
        ).bind(wechat_identifier).bind(fallback_identifier).fetch_optional(&state.db.pool).await?;

        let user = if let Some(u) = existing {
            // 更新三方昵称和最新标识
            sqlx::query(&state.db.format_query("UPDATE users SET wechat_id = ?, wechat_name = ? WHERE id = ?"))
                .bind(wechat_identifier).bind(&info.nickname).bind(&u.id).execute(&state.db.pool).await?;
            u
        } else {
            // 自动注册
            let user_id = uuid::Uuid::new_v4().to_string();
            let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
            let nickname = info.nickname.as_deref().unwrap_or_else(|| &info.openid[..8]);
            let rand_str: String = (0..8)
                .map(|_| {
                    let idx = rand::thread_rng().gen_range(0..36);
                    if idx < 10 {
                        (b'0' + idx) as char
                    } else {
                        (b'a' + (idx - 10)) as char
                    }
                })
                .collect();
            let base_username = format!("wx_{}", rand_str);
            let username = ensure_unique_username(&state, &base_username).await?;
            let placeholder_email = format!("wx_{}@tokensbyte.local", &uid);
            let password_hash = auth::hash_password(&uuid::Uuid::new_v4().to_string())?;

            // 查询默认注册等级
            let default_group: String = sqlx::query_scalar(&state.db.format_query(
                "SELECT group_key FROM user_levels WHERE is_default = 1 LIMIT 1"
            ))
            .fetch_optional(&state.db.pool)
            .await?
            .unwrap_or_else(|| "default".to_string());

            let initial_balance = state.config.default_user_quota;
            let mut gift_amount = 0.0;
            if settings.marketing.enable_registration_gift {
                gift_amount = calc_gift_amount(&settings.marketing);
            }

            sqlx::query(
                &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, nickname, wechat_id, wechat_name, role, balance, gift_balance, is_active, user_group)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, 1, ?)"#)
            )
            .bind(&user_id).bind(&uid).bind(&username).bind(&placeholder_email)
            .bind(&password_hash).bind(nickname).bind(wechat_identifier).bind(&info.nickname)
            .bind(initial_balance).bind(gift_amount)
            .bind(&default_group)
            .execute(&state.db.pool).await?;

            if gift_amount > 0.0 {
                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'gift', '注册赠送', 'gift')"))
                    .bind(&user_id).bind(gift_amount)
                    .execute(&state.db.pool).await?;
            }

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
        let google = settings
            .google_oauth
            .ok_or_else(|| AppError::BadRequest("谷歌授权登录未配置".to_string()))?;
        if google.client_id.is_empty() {
            return Err(AppError::BadRequest("谷歌授权登录未配置".to_string()));
        }

        let req_base_url = get_base_url_from_req(&headers, &state.config.base_url);
        let redirect_uri = format!("{}/api/v1/auth/oauth/google/callback", req_base_url);
        let state_val = generate_oauth_state(&state.config.jwt_secret, "google");
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

/// 谷歌 OAuth 回调 — 自动注册/登录
pub async fn oauth_google_callback(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let result = (async {
        let code = query.code.ok_or_else(|| AppError::BadRequest("缺少 code 参数".to_string()))?;
        // CSRF 防护：校验 state 参数的 HMAC 签名和时间窗口
        let state_param = query.state.as_deref().unwrap_or("");
        if !verify_oauth_state(&state.config.jwt_secret, "google", state_param) {
            return Err(AppError::BadRequest("OAuth state 验证失败，请重新发起授权".to_string()));
        }
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

        let google_display_name = info.name.clone().or_else(|| info.email.clone());

        let user = if let Some(u) = existing {
            sqlx::query(&state.db.format_query("UPDATE users SET google_name = ? WHERE id = ?"))
                .bind(&google_display_name).bind(&u.id).execute(&state.db.pool).await?;
            u
        } else {
            // 自动注册
            let user_id = uuid::Uuid::new_v4().to_string();
            let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
            let name_val = info.name.as_deref().unwrap_or_else(|| &info.id[..8]);
            let username = ensure_unique_username(&state, name_val).await?;
            let email = info.email.unwrap_or_else(|| format!("g_{}@tokensbyte.local", &uid));
            let password_hash = auth::hash_password(&uuid::Uuid::new_v4().to_string())?;

            // 检查邮箱是否已存在
            let email_exists: bool = sqlx::query_scalar(&state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)"))
                .bind(&email).fetch_one(&state.db.pool).await?;
            let actual_email = if email_exists { format!("g_{}@tokensbyte.local", &uid) } else { email };

            // 查询默认注册等级
            let default_group: String = sqlx::query_scalar(&state.db.format_query(
                "SELECT group_key FROM user_levels WHERE is_default = 1 LIMIT 1"
            ))
            .fetch_optional(&state.db.pool)
            .await?
            .unwrap_or_else(|| "default".to_string());

            let initial_balance = state.config.default_user_quota;
            let mut gift_amount = 0.0;
            if settings.marketing.enable_registration_gift {
                gift_amount = calc_gift_amount(&settings.marketing);
            }

            sqlx::query(
                &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, nickname, google_id, google_name, role, balance, gift_balance, is_active, user_group)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, 1, ?)"#)
            )
            .bind(&user_id).bind(&uid).bind(&username).bind(&actual_email)
            .bind(&password_hash).bind(name_val).bind(&info.id).bind(&google_display_name)
            .bind(initial_balance).bind(gift_amount)
            .bind(&default_group)
            .execute(&state.db.pool).await?;

            if gift_amount > 0.0 {
                sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark, wallet_type) VALUES (?, ?, 'gift', '注册赠送', 'gift')"))
                    .bind(&user_id).bind(gift_amount)
                    .execute(&state.db.pool).await?;
            }

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

/// 用户名合规校验：仅限英文字母和数字，至少6个字符，并且包含敏感词过滤
pub(crate) fn validate_username(username: &str, is_register: bool) -> AppResult<()> {
    let name = username.trim();

    if name.len() < 5 {
        return Err(AppError::BadRequest(
            "用户名长度不能少于 5 个字符".to_string(),
        ));
    }
    if name.len() > 48 {
        return Err(AppError::BadRequest(
            "正确输入用户名限制为 48 字".to_string(),
        ));
    }

    // 只允许英文字母、数字和下划线，禁止中文、特殊字符（防止数据库注入及特殊符号）
    for c in name.chars() {
        if !c.is_ascii_alphanumeric() && c != '_' {
            return Err(AppError::BadRequest(
                "用户名只能包含英文字母、数字和下划线，不能使用特殊字符或其他语言".to_string(),
            ));
        }
    }

    if is_register {
        // 包含即拒绝的敏感词/保留字（模糊匹配）
        const CONTAINS_RESERVED: &[&str] = &[
            "admin",
            "root",
            "system",
            "superadmin",
            "moderator",
            "support",
            "official",
            "anonymous",
            "tokensbyte",
            "security",
            "noreply",
            "select",
            "update",
            "delete",
            "insert",
            "drop",
            "database",
        ];

        // 精确匹配的保留字（较短的词，防止模糊匹配误伤正常单词）
        const EXACT_RESERVED: &[&str] = &[
            "sys",
            "super",
            "master",
            "operator",
            "mod",
            "staff",
            "help",
            "service",
            "test",
            "tester",
            "testing",
            "demo",
            "guest",
            "nobody",
            "null",
            "undefined",
            "api",
            "www",
            "mail",
            "ftp",
            "smtp",
            "pop",
            "imap",
            "dns",
            "ns",
            "server",
            "db",
            "mysql",
            "postgres",
            "redis",
            "mongo",
            "nginx",
            "apache",
            "proxy",
            "bot",
            "robot",
            "crawler",
            "spider",
            "info",
            "ceo",
            "cto",
            "cfo",
            "coo",
            "token",
        ];

        let lower = name.to_lowercase();

        for &word in CONTAINS_RESERVED {
            if lower.contains(word) {
                return Err(AppError::BadRequest(
                    "此用户名已被保留，无法使用".to_string(),
                ));
            }
        }

        for &word in EXACT_RESERVED {
            if lower == word {
                return Err(AppError::BadRequest(
                    "此用户名已被保留，无法使用".to_string(),
                ));
            }
        }
    }

    Ok(())
}

/// 生成 6 位数字验证码
fn generate_code() -> String {
    let mut rng = rand::thread_rng();
    (0..6).map(|_| rng.gen_range(0..10).to_string()).collect()
}

#[derive(Clone, Copy)]
enum CodeChannel {
    Email,
    Sms,
}

/// 占位邮箱（用户名/手机/OAuth 注册产生），不可用于找回密码
pub(crate) fn is_placeholder_email(email: &str) -> bool {
    let email = email.trim();
    email.is_empty() || email.to_ascii_lowercase().ends_with("@tokensbyte.local")
}

fn validate_code_purpose(purpose: &str, channel: CodeChannel) -> AppResult<()> {
    let allowed = match channel {
        CodeChannel::Email => matches!(purpose, "register" | "reset_password" | "bind_email"),
        CodeChannel::Sms => matches!(purpose, "register" | "reset_password" | "bind_mobile"),
    };
    if !allowed {
        return Err(AppError::BadRequest("无效的验证码用途".to_string()));
    }
    Ok(())
}

async fn check_code_send_cooldown(
    state: &Arc<AppState>,
    email: &str,
    phone: &str,
    purpose: &str,
) -> AppResult<()> {
    let since = DbTs::from_utc(Utc::now() - Duration::seconds(60));
    let count: i64 = if !email.is_empty() {
        sqlx::query_scalar(&state.db.format_query(
            "SELECT COUNT(*) FROM verification_codes WHERE email = ? AND purpose = ? AND created_at >= ?::timestamptz",
        ))
        .bind(email)
        .bind(purpose)
        .bind(&since)
        .fetch_one(&state.db.pool)
        .await?
    } else {
        sqlx::query_scalar(&state.db.format_query(
            "SELECT COUNT(*) FROM verification_codes WHERE phone = ? AND purpose = ? AND created_at >= ?::timestamptz",
        ))
        .bind(phone)
        .bind(purpose)
        .bind(&since)
        .fetch_one(&state.db.pool)
        .await?
    };
    if count > 0 {
        return Err(AppError::BadRequest(
            "验证码发送过于频繁，请稍后再试".to_string(),
        ));
    }
    Ok(())
}

async fn email_is_bound_for_recovery(state: &Arc<AppState>, email: &str) -> AppResult<bool> {
    if is_placeholder_email(email) {
        return Ok(false);
    }
    let count: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM users WHERE email = ? AND email NOT LIKE ?"),
    )
    .bind(email)
    .bind("%@tokensbyte.local")
    .fetch_one(&state.db.pool)
    .await?;
    Ok(count == 1)
}

async fn mobile_is_bound_for_recovery(state: &Arc<AppState>, mobile: &str) -> AppResult<bool> {
    if mobile.trim().is_empty() {
        return Ok(false);
    }
    let count: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM users WHERE mobile = ?"),
    )
    .bind(mobile)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(count == 1)
}

async fn resolve_unique_bound_email_user(state: &Arc<AppState>, email: &str) -> AppResult<String> {
    if is_placeholder_email(email) {
        return Err(AppError::BadRequest(
            "该邮箱未绑定账号，无法找回密码".to_string(),
        ));
    }
    let ids: Vec<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM users WHERE email = ? AND email NOT LIKE ?"),
    )
    .bind(email)
    .bind("%@tokensbyte.local")
    .fetch_all(&state.db.pool)
    .await?;
    match ids.len() {
        1 => Ok(ids[0].clone()),
        0 => Err(AppError::BadRequest(
            "该邮箱未绑定账号，无法找回密码".to_string(),
        )),
        _ => Err(AppError::BadRequest(
            "该邮箱绑定异常，请联系管理员处理".to_string(),
        )),
    }
}

async fn resolve_unique_bound_mobile_user(
    state: &Arc<AppState>,
    mobile: &str,
) -> AppResult<String> {
    if mobile.trim().is_empty() {
        return Err(AppError::BadRequest(
            "该手机号未绑定账号，无法找回密码".to_string(),
        ));
    }
    let ids: Vec<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM users WHERE mobile = ?"),
    )
    .bind(mobile)
    .fetch_all(&state.db.pool)
    .await?;
    match ids.len() {
        1 => Ok(ids[0].clone()),
        0 => Err(AppError::BadRequest(
            "该手机号未绑定账号，无法找回密码".to_string(),
        )),
        _ => Err(AppError::BadRequest(
            "该手机号绑定异常，请联系管理员处理".to_string(),
        )),
    }
}

/// 保存验证码到数据库（先清理同目标同用途旧码，有效期 5 分钟）
async fn save_verification_code(
    state: &Arc<AppState>,
    email: &str,
    phone: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    if !email.is_empty() {
        sqlx::query(
            &state
                .db
                .format_query("DELETE FROM verification_codes WHERE email = ? AND purpose = ?"),
        )
        .bind(email)
        .bind(purpose)
        .execute(&state.db.pool)
        .await?;
    } else if !phone.is_empty() {
        sqlx::query(
            &state
                .db
                .format_query("DELETE FROM verification_codes WHERE phone = ? AND purpose = ?"),
        )
        .bind(phone)
        .bind(purpose)
        .execute(&state.db.pool)
        .await?;
    }

    let expires_at = DbTs::from_utc(Utc::now() + Duration::minutes(CODE_EXPIRY_MINUTES));
    sqlx::query(
        &state.db.format_query(
            "INSERT INTO verification_codes (email, phone, code, purpose, expires_at, attempts) VALUES (?, ?, ?, ?, ?, 0)",
        ),
    )
    .bind(email)
    .bind(phone)
    .bind(code)
    .bind(purpose)
    .bind(&expires_at)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

/// 校验邮箱验证码（pub 版本供 user.rs 调用）
pub async fn verify_email_code_pub(
    state: &Arc<AppState>,
    email: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    verify_email_code(state, email, code, purpose).await
}

/// 校验短信验证码（pub 版本供 user.rs 调用）
pub async fn verify_sms_code_pub(
    state: &Arc<AppState>,
    phone: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    verify_sms_code(state, phone, code, purpose).await
}

/// 校验邮箱验证码（失败累计 attempts，超过上限立即失效）
async fn verify_email_code(
    state: &Arc<AppState>,
    email: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    let row: Option<(i64, String, i32)> = sqlx::query_as(&state.db.format_query(
        "SELECT id, code, COALESCE(attempts, 0) FROM verification_codes \
             WHERE email = ? AND purpose = ? AND expires_at > NOW() \
             ORDER BY created_at DESC LIMIT 1",
    ))
    .bind(email)
    .bind(purpose)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((id, stored_code, attempts)) = row else {
        let exists: Option<(i64,)> = sqlx::query_as(&state.db.format_query(
            "SELECT 1 FROM verification_codes WHERE email = ? AND purpose = ? LIMIT 1",
        ))
        .bind(email)
        .bind(purpose)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Err(AppError::BadRequest(
                "Verification code expired".to_string(),
            ));
        }
        return Err(AppError::BadRequest(
            "Invalid verification code".to_string(),
        ));
    };

    if attempts >= MAX_CODE_ATTEMPTS {
        sqlx::query(
            &state
                .db
                .format_query("DELETE FROM verification_codes WHERE id = ?"),
        )
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        return Err(AppError::BadRequest(
            "Verification code attempts exceeded, please request a new one".to_string(),
        ));
    }

    if !ct_eq_str(&stored_code, code) {
        let new_attempts = attempts + 1;
        if new_attempts >= MAX_CODE_ATTEMPTS {
            sqlx::query(
                &state
                    .db
                    .format_query("DELETE FROM verification_codes WHERE id = ?"),
            )
            .bind(id)
            .execute(&state.db.pool)
            .await?;
            return Err(AppError::BadRequest(
                "Verification code attempts exceeded, please request a new one".to_string(),
            ));
        }
        sqlx::query(
            &state
                .db
                .format_query("UPDATE verification_codes SET attempts = ? WHERE id = ?"),
        )
        .bind(new_attempts)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        return Err(AppError::BadRequest(
            "Invalid verification code".to_string(),
        ));
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM verification_codes WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

/// 校验短信验证码（失败累计 attempts，超过上限立即失效）
async fn verify_sms_code(
    state: &Arc<AppState>,
    phone: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    let row: Option<(i64, String, i32)> = sqlx::query_as(&state.db.format_query(
        "SELECT id, code, COALESCE(attempts, 0) FROM verification_codes \
             WHERE phone = ? AND purpose = ? AND expires_at > NOW() \
             ORDER BY created_at DESC LIMIT 1",
    ))
    .bind(phone)
    .bind(purpose)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((id, stored_code, attempts)) = row else {
        let exists: Option<(i64,)> = sqlx::query_as(&state.db.format_query(
            "SELECT 1 FROM verification_codes WHERE phone = ? AND purpose = ? LIMIT 1",
        ))
        .bind(phone)
        .bind(purpose)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Err(AppError::BadRequest("短信验证码已过期".to_string()));
        }
        return Err(AppError::BadRequest("短信验证码无效".to_string()));
    };

    if attempts >= MAX_CODE_ATTEMPTS {
        sqlx::query(
            &state
                .db
                .format_query("DELETE FROM verification_codes WHERE id = ?"),
        )
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        return Err(AppError::BadRequest(
            "验证码尝试次数过多，请重新获取".to_string(),
        ));
    }

    if !ct_eq_str(&stored_code, code) {
        let new_attempts = attempts + 1;
        if new_attempts >= MAX_CODE_ATTEMPTS {
            sqlx::query(
                &state
                    .db
                    .format_query("DELETE FROM verification_codes WHERE id = ?"),
            )
            .bind(id)
            .execute(&state.db.pool)
            .await?;
            return Err(AppError::BadRequest(
                "验证码尝试次数过多，请重新获取".to_string(),
            ));
        }
        sqlx::query(
            &state
                .db
                .format_query("UPDATE verification_codes SET attempts = ? WHERE id = ?"),
        )
        .bind(new_attempts)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
        return Err(AppError::BadRequest("短信验证码无效".to_string()));
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM verification_codes WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

/// 提取客户端 IP
fn extract_client_ip(headers: &axum::http::HeaderMap, addr: &std::net::SocketAddr) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("").trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| addr.ip().to_string())
}

/// IP 注册防刷检查
async fn check_ip_rate_limit(
    state: &Arc<AppState>,
    reg: &RegistrationSettings,
    ip: &str,
) -> AppResult<()> {
    if !reg.ip_rate_limit_enabled {
        return Ok(());
    }
    let settings = crate::api::settings::load_all_settings(state).await?;
    let (day_start, day_end) = today_bounds_db_ts(site_timedisplay(&settings));
    let count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM users WHERE register_ip = ? AND created_at >= ?::timestamptz AND created_at < ?::timestamptz",
    ))
    .bind(ip)
    .bind(&day_start)
    .bind(&day_end)
    .fetch_one(&state.db.pool)
    .await?;

    if count >= reg.ip_daily_limit as i64 {
        return Err(AppError::Forbidden(format!(
            "当日注册次数已达上限 ({})",
            reg.ip_daily_limit
        )));
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
            return Err(AppError::BadRequest(
                "邮箱地址仅允许数字、字母和下划线".to_string(),
            ));
        }
    }

    if reg.email_whitelist_enabled && !reg.email_whitelist.is_empty() {
        if !reg
            .email_whitelist
            .iter()
            .any(|d| d.eq_ignore_ascii_case(domain))
        {
            return Err(AppError::BadRequest(format!(
                "不支持 @{} 域名的邮箱注册",
                domain
            )));
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
        if max > min {
            rand::thread_rng().gen_range(min..=max) as f64
        } else {
            min as f64
        }
    } else {
        marketing.fixed_amount
    }
}

/// 从邮箱前缀生成唯一用户名
async fn generate_unique_username(state: &Arc<AppState>, email: &str) -> AppResult<String> {
    let mut base = email.split('@').next().unwrap_or("user").to_string();
    // 过滤掉非字母数字和下划线的字符，确保合规
    base.retain(|c| c.is_ascii_alphanumeric() || c == '_');
    if base.is_empty() {
        base = "user".to_string();
    }
    if base.len() > 40 {
        base.truncate(40);
    }
    // 保证至少5位
    while base.len() < 5 {
        base.push_str(&rand::thread_rng().gen_range(0..10).to_string());
    }
    ensure_unique_username(state, &base).await
}

/// 确保用户名唯一（存在则追加随机后缀）
async fn ensure_unique_username(state: &Arc<AppState>, base: &str) -> AppResult<String> {
    let base_truncated: String = base.chars().take(40).collect();
    let mut current = base_truncated.clone();
    loop {
        let exists: bool = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)"),
        )
        .bind(&current)
        .fetch_one(&state.db.pool)
        .await?;
        if !exists {
            return Ok(current);
        }
        let suffix: String = (0..4)
            .map(|_| rand::thread_rng().gen_range(0..10).to_string())
            .collect();
        // 恢复下划线拼接
        current = format!("{}_{}", base_truncated, suffix);
    }
}

/// 生成 OAuth CSRF 防伪 state（HMAC 签名方案，无需额外存储）
/// 格式: {provider}_{unix_timestamp}_{hmac_hex16}
pub(crate) fn generate_oauth_state(secret: &str, provider: &str) -> String {
    let ts = Utc::now().timestamp();
    let payload = format!("oauth:{}:{}", provider, ts);
    type HmacSha256 = Hmac<Sha256>;
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC key length is always valid");
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    format!("{}_{}_{}", provider, ts, &sig[..16])
}

/// 校验登录 OAuth state 的 HMAC 签名和时间窗口（仅接受服务端签发格式）
pub(crate) fn verify_oauth_state(secret: &str, expected_provider: &str, state: &str) -> bool {
    let parts: Vec<&str> = state.splitn(3, '_').collect();
    if parts.len() != 3 {
        return false;
    }
    let (provider, ts_str, sig) = (parts[0], parts[1], parts[2]);
    if provider != expected_provider || sig.len() != 16 {
        return false;
    }
    let Ok(ts) = ts_str.parse::<i64>() else {
        return false;
    };
    let now = Utc::now().timestamp();
    if (now - ts).abs() > OAUTH_STATE_TTL_SECS {
        return false;
    }
    let payload = format!("oauth:{}:{}", provider, ts);
    type HmacSha256 = Hmac<Sha256>;
    let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(payload.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());
    ct_eq_str(sig, &expected_sig[..16])
}

/// 生成绑定/验证场景的 OAuth state
/// 格式: {action}_{provider}_{user_id}_{ts}_{hmac16}
/// 例: bind_wechat_<uuid>_1710000000_abcdef0123456789
pub(crate) fn generate_oauth_bind_state(
    secret: &str,
    action: &str,
    provider: &str,
    user_id: &str,
) -> String {
    let ts = Utc::now().timestamp();
    let payload = format!("oauth:{}:{}:{}:{}", action, provider, user_id, ts);
    type HmacSha256 = Hmac<Sha256>;
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC key length is always valid");
    mac.update(payload.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());
    format!("{}_{}_{}_{}_{}", action, provider, user_id, ts, &sig[..16])
}

/// 校验绑定/验证 OAuth state，成功返回 (action, provider, user_id)
pub(crate) fn verify_oauth_bind_state(
    secret: &str,
    state: &str,
) -> Option<(String, String, String)> {
    for action in ["bind", "verify"] {
        for provider in ["wechat", "google"] {
            let prefix = format!("{}_{}_", action, provider);
            let Some(rest) = state.strip_prefix(&prefix) else {
                continue;
            };
            // rest = {user_id}_{ts}_{sig}；user_id 为 UUID（无下划线）
            let parts: Vec<&str> = rest.splitn(3, '_').collect();
            if parts.len() != 3 {
                continue;
            }
            let (user_id, ts_str, sig) = (parts[0], parts[1], parts[2]);
            if user_id.is_empty() || sig.len() != 16 {
                continue;
            }
            let Ok(ts) = ts_str.parse::<i64>() else {
                continue;
            };
            let now = Utc::now().timestamp();
            if (now - ts).abs() > OAUTH_STATE_TTL_SECS {
                continue;
            }
            let payload = format!("oauth:{}:{}:{}:{}", action, provider, user_id, ts);
            type HmacSha256 = Hmac<Sha256>;
            let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) else {
                continue;
            };
            mac.update(payload.as_bytes());
            let expected_sig = hex::encode(mac.finalize().into_bytes());
            if ct_eq_str(sig, &expected_sig[..16]) {
                return Some((
                    action.to_string(),
                    provider.to_string(),
                    user_id.to_string(),
                ));
            }
        }
    }
    None
}

/// 公开接口：为前端扫码登录签发 HMAC OAuth state（禁止前端自造）
pub async fn oauth_state(
    State(state): State<Arc<AppState>>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = params.get("provider").map(|s| s.as_str()).unwrap_or("");
    if provider != "wechat" && provider != "google" {
        return Err(AppError::BadRequest(
            "provider 仅支持 wechat 或 google".to_string(),
        ));
    }
    let state_val = generate_oauth_state(&state.config.jwt_secret, provider);
    Ok(Json(serde_json::json!({ "state": state_val })))
}

#[cfg(test)]
mod tests {
    use super::{
        ct_eq_str, generate_oauth_bind_state, generate_oauth_state, is_placeholder_email,
        validate_code_purpose, verify_oauth_bind_state, verify_oauth_state, CodeChannel,
    };

    #[test]
    fn placeholder_email_detection() {
        assert!(is_placeholder_email(""));
        assert!(is_placeholder_email("u_123@tokensbyte.local"));
        assert!(is_placeholder_email("WX_abc@TokensByte.Local"));
        assert!(!is_placeholder_email("user@example.com"));
        assert!(!is_placeholder_email("someone@gmail.com"));
    }

    #[test]
    fn code_purpose_whitelist() {
        assert!(validate_code_purpose("register", CodeChannel::Email).is_ok());
        assert!(validate_code_purpose("reset_password", CodeChannel::Email).is_ok());
        assert!(validate_code_purpose("bind_email", CodeChannel::Email).is_ok());
        assert!(validate_code_purpose("bind_mobile", CodeChannel::Email).is_err());
        assert!(validate_code_purpose("hack", CodeChannel::Email).is_err());

        assert!(validate_code_purpose("register", CodeChannel::Sms).is_ok());
        assert!(validate_code_purpose("reset_password", CodeChannel::Sms).is_ok());
        assert!(validate_code_purpose("bind_mobile", CodeChannel::Sms).is_ok());
        assert!(validate_code_purpose("bind_email", CodeChannel::Sms).is_err());
    }

    #[test]
    fn oauth_state_hmac_roundtrip() {
        let secret = "test-jwt-secret-for-oauth";
        let state = generate_oauth_state(secret, "wechat");
        assert!(verify_oauth_state(secret, "wechat", &state));
        assert!(!verify_oauth_state(secret, "google", &state));
        assert!(!verify_oauth_state(secret, "wechat", "wechat_aaaaa"));
        assert!(!verify_oauth_state(secret, "wechat", "wechat_uy6kqz1d7lm"));
        assert!(!verify_oauth_state(
            secret,
            "wechat",
            "wechat_9999999999_deadbeefdeadbeef"
        ));
    }

    #[test]
    fn oauth_bind_state_hmac_roundtrip() {
        let secret = "test-jwt-secret-for-oauth";
        let uid = "550e8400-e29b-41d4-a716-446655440000";
        let state = generate_oauth_bind_state(secret, "bind", "wechat", uid);
        let parsed = verify_oauth_bind_state(secret, &state).expect("valid bind state");
        assert_eq!(parsed.0, "bind");
        assert_eq!(parsed.1, "wechat");
        assert_eq!(parsed.2, uid);

        // 伪造：仅前缀+user_id，无 HMAC
        assert!(verify_oauth_bind_state(secret, &format!("bind_wechat_{}", uid)).is_none());
        assert!(verify_oauth_bind_state(secret, "wechat_aaaaa").is_none());
    }

    #[test]
    fn ct_eq_str_works() {
        assert!(ct_eq_str("abc", "abc"));
        assert!(!ct_eq_str("abc", "abd"));
        assert!(!ct_eq_str("abc", "ab"));
    }
}
