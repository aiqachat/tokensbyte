use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use sqlx::postgres::PgPoolOptions;
use crate::AppState;
use crate::models::{
    SiteSettings, CurrencySettings, LoginSettings, RegistrationSettings,
    SMTPSettings, SmsSettings, MarketingSettings, DatabaseSettings,
    GoogleOAuthSettings, WechatOAuthSettings, AllSettings, UpdateSettingsRequest,
};
use crate::error::{AppError, AppResult};

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<AllSettings>> {
    let all = load_all_settings(&state).await?;
    Ok(Json(all))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<AllSettings>> {
    if let Some(v) = request.site { save_setting(&state, "site_settings", &v).await?; }
    if let Some(v) = request.currency { save_setting(&state, "currency_settings", &v).await?; }
    if let Some(v) = request.login { save_setting(&state, "login_settings", &v).await?; }
    if let Some(v) = request.registration { save_setting(&state, "registration_settings", &v).await?; }
    if let Some(v) = request.smtp { save_setting(&state, "smtp_settings", &v).await?; }
    if let Some(v) = request.sms { save_setting(&state, "sms_settings", &v).await?; }
    if let Some(v) = request.marketing { save_setting(&state, "marketing_settings", &v).await?; }
    if let Some(v) = request.database { save_setting(&state, "database_settings", &v).await?; }
    if let Some(v) = request.payment_wechat { save_setting(&state, "payment_wechat", &v).await?; }
    if let Some(v) = request.payment_alipay { save_setting(&state, "payment_alipay", &v).await?; }
    if let Some(v) = request.google_oauth { save_setting(&state, "google_oauth", &v).await?; }
    if let Some(v) = request.wechat_oauth { save_setting(&state, "wechat_oauth", &v).await?; }

    let all = load_all_settings(&state).await?;
    Ok(Json(all))
}

/// 发送测试邮件
pub async fn test_email(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let to = body["to"].as_str()
        .ok_or_else(|| AppError::BadRequest("缺少收件邮箱 to".to_string()))?;
    let smtp = get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings()).await?;
    let svc = crate::services::email::EmailService::new(&smtp);
    svc.send_test_email(to).await?;
    Ok(Json(serde_json::json!({"success": true, "message": "测试邮件发送成功"})))
}

/// 发送测试短信
pub async fn test_sms(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let mobile = body["mobile"].as_str()
        .ok_or_else(|| AppError::BadRequest("缺少手机号 mobile".to_string()))?;
    let sms = get_setting::<SmsSettings>(&state, "sms_settings", default_sms_settings()).await?;
    if sms.secret_id.is_empty() || sms.secret_key.is_empty() {
        return Err(AppError::BadRequest("请先完善短信通知配置".to_string()));
    }
    let svc = crate::services::sms::SmsService::new(&sms);
    svc.send_verification_code(mobile, "666666").await?;
    Ok(Json(serde_json::json!({"success": true, "message": "测试短信发送成功"})))
}

pub async fn verify_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode { "require" } else { "disable" };
        let url = format!(
            "postgres://{}:{}@{}:{}/{}?sslmode={}",
            settings.username, settings.password, settings.host, settings.port, settings.database, ssl_mode
        );
        match PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(&url)
            .await
        {
            Ok(_) => Ok(Json(serde_json::json!({"success": true, "message": "连接成功"}))),
            Err(e) => Ok(Json(serde_json::json!({"success": false, "message": format!("连接失败: {}", e)}))),
        }
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "仅支持 PostgreSQL"})))
    }
}

pub async fn initialize_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode { "require" } else { "disable" };
        let url = format!(
            "postgres://{}:{}@{}:{}/{}?sslmode={}",
            settings.username, settings.password, settings.host, settings.port, settings.database, ssl_mode
        );
        match PgPoolOptions::new().max_connections(1).connect(&url).await {
            Ok(pool) => {
                if let Err(e) = crate::db::migrations::run_pg(&pool).await {
                    return Ok(Json(serde_json::json!({"success": false, "message": format!("数据库初始化失败: {}", e)})));
                }
                Ok(Json(serde_json::json!({"success": true, "message": "数据库初始化成功"})))
            },
            Err(e) => Ok(Json(serde_json::json!({"success": false, "message": format!("无法连接到数据库: {}", e)}))),
        }
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "仅支持对 PostgreSQL 进行初始化"})))
    }
}

pub async fn backup_database(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let db_url = &state.config.database_url;
    if db_url.starts_with("postgres:") || db_url.starts_with("postgresql:") {
        Ok(Json(serde_json::json!({"success": true, "message": "PostgreSQL 备份应使用 pg_dump 工具进行，系统已记录备份请求（演示版）"})))
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "不支持的数据库类型，无法备份"})))
    }
}

// ======================== 内部工具函数 ========================

/// 加载全部设置（统一入口）
pub async fn load_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    Ok(AllSettings {
        site: get_setting(state, "site_settings", default_site_settings()).await?,
        currency: get_setting(state, "currency_settings", default_currency_settings()).await?,
        login: get_setting(state, "login_settings", default_login_settings()).await?,
        registration: get_setting(state, "registration_settings", default_registration_settings()).await?,
        smtp: get_setting(state, "smtp_settings", default_smtp_settings()).await?,
        sms: get_setting(state, "sms_settings", None).await?,
        marketing: get_setting(state, "marketing_settings", default_marketing_settings()).await?,
        database: get_setting(state, "database_settings", default_database_settings()).await?,
        payment_wechat: get_setting(state, "payment_wechat", None).await?,
        payment_alipay: get_setting(state, "payment_alipay", None).await?,
        google_oauth: get_setting(state, "google_oauth", None).await?,
        wechat_oauth: get_setting(state, "wechat_oauth", None).await?,
    })
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

async fn save_setting<T: serde::Serialize>(state: &Arc<AppState>, key: &str, value: &T) -> AppResult<()> {
    let val = serde_json::to_string(value).unwrap_or_default();
    sqlx::query(&state.db.format_query(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"
    ))
    .bind(key)
    .bind(val)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

// ======================== 默认值函数 ========================

pub fn default_site_settings() -> SiteSettings {
    SiteSettings {
        name: "TokensByte".to_string(),
        title: "TokensByte - LLM API Gateway".to_string(),
        keywords: "LLM, API, Gateway, Rust".to_string(),
        description: "Next-gen LLM API Distribution & Management Platform".to_string(),
        favicon: String::new(),
        logo: String::new(),
        login_title: String::new(),
        login_subtitle: String::new(),
        enable_multilingual: true,
    }
}

pub fn default_currency_settings() -> CurrencySettings {
    CurrencySettings {
        default_currency: "CNY".to_string(),
        currency_symbol: "¥".to_string(),
        currency_unit: "元".to_string(),
        token_ratio: 1.0,
    }
}

pub fn default_login_settings() -> LoginSettings {
    LoginSettings {
        enable_username_login: true,
        enable_mobile_login: false,
        enable_email_login: false,
        enable_wechat_login: false,
        enable_google_login: false,
    }
}

pub fn default_registration_settings() -> RegistrationSettings {
    RegistrationSettings {
        enable_username_registration: false,
        enable_email_registration: false,
        enable_mobile_registration: false,
        enable_password_recovery: false,
        ip_rate_limit_enabled: false,
        ip_daily_limit: 6,
        email_validation_strict: false,
        email_whitelist_enabled: false,
        email_whitelist: vec![
            "qq.com".to_string(),
            "163.com".to_string(),
            "outlook.com".to_string(),
            "aliyun.com".to_string(),
            "foxmail.com".to_string(),
        ],
    }
}

pub fn default_smtp_settings() -> SMTPSettings {
    SMTPSettings {
        host: "smtp.example.com".to_string(),
        port: 465,
        username: "".to_string(),
        password: "".to_string(),
        from_address: "noreply@example.com".to_string(),
        from_name: "TokensByte".to_string(),
    }
}

pub fn default_sms_settings() -> SmsSettings {
    SmsSettings {
        secret_id: String::new(),
        secret_key: String::new(),
        sdk_app_id: String::new(),
        sign_name: String::new(),
        template_id: String::new(),
    }
}

pub fn default_marketing_settings() -> MarketingSettings {
    MarketingSettings {
        enable_registration_gift: false,
        gift_mode: "fixed".to_string(),
        fixed_amount: 0.0,
        min_amount: 0.0,
        max_amount: 0.0,
    }
}

pub fn default_database_settings() -> DatabaseSettings {
    DatabaseSettings {
        db_type: "postgres".to_string(),
        host: "localhost".to_string(),
        port: 5432,
        database: "postgres".to_string(),
        username: "postgres".to_string(),
        password: "postgres".to_string(),
        ssl_mode: false,
    }
}
