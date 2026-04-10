use axum::{
    extract::State,
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
use chrono::{DateTime, Utc, Duration};
use rand::Rng;

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(request): Json<LoginRequest>,
) -> Response {
    let result = (async {
        // 1. Fetch user from database
        let user: User = sqlx::query_as(
            "SELECT * FROM users WHERE username = ? OR email = ?"
        )
        .bind(&request.username)
        .bind(&request.username)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or(AppError::Unauthorized)?;

        // 2. Verify password
        if !auth::verify_password(&request.password, &user.password_hash)? {
            return Err(AppError::Unauthorized);
        }

        if !user.is_active {
            return Err(AppError::Forbidden("Account disabled".to_string()));
        }

        // 3. Create JWT token
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
    Json(request): Json<CreateUserRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_username_registration {
            return Err(AppError::Forbidden("Username registration is disabled".to_string()));
        }

        // 1. Check if user already exists
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? OR email = ?)"
        )
        .bind(&request.username)
        .bind(&request.email)
        .fetch_one(&state.db.pool)
        .await?;

        if exists {
            return Err(AppError::Conflict("User already exists".to_string()));
        }

        // 2. Hash password and insert
        let password_hash = auth::hash_password(&request.password)?;
        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;

        let mut tx = state.db.pool.begin().await?;

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

        sqlx::query(
            r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active)
               VALUES (?, ?, ?, ?, ?, 'user', ?, 1)"#
        )
        .bind(&user_id)
        .bind(&uid)
        .bind(&request.username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(initial_balance)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', '注册赠送')")
                .bind(&user_id)
                .bind(gift_amount)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;

        // 3. Auto-login after registration
        let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
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

        // Generate 6-digit code
        let mut rng = rand::thread_rng();
        let code: String = (0..6).map(|_| rng.gen_range(0..10).to_string()).collect();
        
        let expires_at = (Utc::now() + Duration::minutes(10)).format("%Y-%m-%d %H:%M:%S").to_string();

        // Save to database
        sqlx::query(
            "INSERT INTO verification_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)"
        )
        .bind(&request.email)
        .bind(&code)
        .bind(&request.purpose)
        .bind(&expires_at)
        .execute(&state.db.pool)
        .await?;

        // Send email
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
    Json(request): Json<EmailRegisterRequest>,
) -> Response {
    let result = (async {
        let settings = get_all_settings(&state).await?;
        if !settings.registration.enable_email_registration {
            return Err(AppError::Forbidden("Email registration is disabled".to_string()));
        }

        // 1. Verify code
        verify_code(&state, &request.email, &request.code, "register").await?;

        // 2. Check if user exists
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)")
            .bind(&request.email)
            .fetch_one(&state.db.pool)
            .await?;
        
        if exists {
            return Err(AppError::Conflict("User with this email already exists".to_string()));
        }

        // 3. Create user
        let user_id = uuid::Uuid::new_v4().to_string();
        let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;
        let mut username = request.email.split('@').next().unwrap_or("user").to_string();
        
        // Check if username already exists
        let username_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)")
            .bind(&username)
            .fetch_one(&state.db.pool)
            .await?;
        
        if username_exists {
            // Append small random suffix if collision
            let suffix: String = (0..4).map(|_| rand::thread_rng().gen_range(0..10).to_string()).collect();
            username = format!("{}_{}", username, suffix);
        }

        let password_hash = auth::hash_password(&request.password)?;

        let mut tx = state.db.pool.begin().await?;

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

        sqlx::query(
            r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, is_active)
               VALUES (?, ?, ?, ?, ?, 'user', ?, 1)"#
        )
        .bind(&user_id)
        .bind(&uid)
        .bind(&username)
        .bind(&request.email)
        .bind(&password_hash)
        .bind(initial_balance)
        .execute(&mut *tx)
        .await?;

        if gift_amount > 0.0 {
            sqlx::query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'registration', '注册赠送')")
                .bind(&user_id)
                .bind(gift_amount)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;

        let user: User = sqlx::query_as("SELECT * FROM users WHERE id = ?")
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

        // 1. Verify code
        verify_code(&state, &request.email, &request.code, "reset_password").await?;

        // 2. Update password
        let password_hash = auth::hash_password(&request.new_password)?;
        let result = sqlx::query("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?")
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

// Helpers
async fn get_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    use crate::api::settings::{default_site_settings, default_currency_settings, default_registration_settings, default_smtp_settings, default_marketing_settings};
    
    let site = get_setting::<SiteSettings>(state, "site_settings", default_site_settings()).await?;
    let currency = get_setting::<CurrencySettings>(state, "currency_settings", default_currency_settings()).await?;
    let registration = get_setting::<RegistrationSettings>(state, "registration_settings", default_registration_settings()).await?;
    let smtp = get_setting::<SMTPSettings>(state, "smtp_settings", default_smtp_settings()).await?;
    let marketing = get_setting::<crate::models::MarketingSettings>(state, "marketing_settings", default_marketing_settings()).await?;

    Ok(AllSettings { site, currency, registration, smtp, marketing })
}

async fn get_setting<T: serde::de::DeserializeOwned + Clone>(state: &Arc<AppState>, key: &str, default: T) -> AppResult<T> {
    let val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
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
    let row: Option<(String,)> = sqlx::query_as("SELECT expires_at FROM verification_codes WHERE email = ? AND code = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1")
        .bind(email)
        .bind(code)
        .bind(purpose)
        .fetch_optional(&state.db.pool)
        .await?;

    let (expires_at,) = row.ok_or_else(|| AppError::BadRequest("Invalid verification code".to_string()))?;
    
    // Simple string comparison for SQLite datetime
    let now = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if now > expires_at {
        return Err(AppError::BadRequest("Verification code expired".to_string()));
    }

    // Delete used code
    sqlx::query("DELETE FROM verification_codes WHERE email = ? AND code = ? AND purpose = ?")
        .bind(email)
        .bind(code)
        .bind(purpose)
        .execute(&state.db.pool)
        .await?;

    Ok(())
}
