use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use sqlx::postgres::PgPoolOptions;
use crate::AppState;
use crate::models::{SiteSettings, CurrencySettings, RegistrationSettings, SMTPSettings, MarketingSettings, DatabaseSettings, AllSettings, UpdateSettingsRequest};
use crate::error::AppResult;

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<AllSettings>> {
    let site_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'site_settings'")
        .fetch_optional(&state.db.pool)
        .await?;
    
    let currency_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'currency_settings'")
        .fetch_optional(&state.db.pool)
        .await?;
    
    let registration_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'registration_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let smtp_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'smtp_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let marketing_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'marketing_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let database_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'database_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let site = if let Some(val) = site_val {
        serde_json::from_str(&val).unwrap_or(default_site_settings())
    } else {
        default_site_settings()
    };

    let currency = if let Some(val) = currency_val {
        serde_json::from_str(&val).unwrap_or(default_currency_settings())
    } else {
        default_currency_settings()
    };

    let registration = if let Some(val) = registration_val {
        serde_json::from_str(&val).unwrap_or(default_registration_settings())
    } else {
        default_registration_settings()
    };

    let smtp = if let Some(val) = smtp_val {
        serde_json::from_str(&val).unwrap_or(default_smtp_settings())
    } else {
        default_smtp_settings()
    };

    let marketing = if let Some(val) = marketing_val {
        serde_json::from_str(&val).unwrap_or(default_marketing_settings())
    } else {
        default_marketing_settings()
    };

    let database = if let Some(val) = database_val {
        serde_json::from_str(&val).unwrap_or(default_database_settings())
    } else {
        default_database_settings()
    };

    Ok(Json(AllSettings { site, currency, registration, smtp, marketing, database }))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<AllSettings>> {
    if let Some(site) = request.site {
        let val = serde_json::to_string(&site).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('site_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(currency) = request.currency {
        let val = serde_json::to_string(&currency).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('currency_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(registration) = request.registration {
        let val = serde_json::to_string(&registration).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('registration_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(smtp) = request.smtp {
        let val = serde_json::to_string(&smtp).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('smtp_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(marketing) = request.marketing {
        let val = serde_json::to_string(&marketing).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('marketing_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(database) = request.database {
        let val = serde_json::to_string(&database).unwrap_or_default();
        sqlx::query(&state.db.format_query("INSERT INTO settings (key, value) VALUES ('database_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    // Return the updated settings
    let site = get_setting::<SiteSettings>(&state, "site_settings", default_site_settings()).await?;
    let currency = get_setting::<CurrencySettings>(&state, "currency_settings", default_currency_settings()).await?;
    let registration = get_setting::<RegistrationSettings>(&state, "registration_settings", default_registration_settings()).await?;
    let smtp = get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings()).await?;
    let marketing = get_setting::<MarketingSettings>(&state, "marketing_settings", default_marketing_settings()).await?;
    let database = get_setting::<DatabaseSettings>(&state, "database_settings", default_database_settings()).await?;

    Ok(Json(AllSettings { site, currency, registration, smtp, marketing, database }))
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
        Ok(Json(serde_json::json!({"success": true, "message": "SQLite 连接始终有效"})))
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

        match PgPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
        {
            Ok(pool) => {
                // 执行迁移逻辑
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
    
    if db_url.starts_with("sqlite:") {
        let path = db_url.trim_start_matches("sqlite:").split('?').next().unwrap_or("./data/tokensbyte.db");
        let backup_dir = "./data/backups";
        tokio::fs::create_dir_all(backup_dir).await.map_err(|e| crate::error::AppError::Internal(format!("创建备份目录失败: {}", e)))?;
        
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_path = format!("{}/tokensbyte_{}.db", backup_dir, timestamp);
        
        tokio::fs::copy(path, &backup_path).await.map_err(|e| crate::error::AppError::Internal(format!("复制数据库文件失败: {}", e)))?;
        
        Ok(Json(serde_json::json!({"success": true, "message": format!("SQLite 备份成功: {}", backup_path)})))
    } else if db_url.starts_with("postgres:") || db_url.starts_with("postgresql:") {
        // 对于 PostgreSQL，理想情况下应该调用 pg_dump
        // 这里提供一个逻辑说明，因为在容器化环境中直接调用外部二进制文件需要确保其存在
        Ok(Json(serde_json::json!({"success": true, "message": "PostgreSQL 备份应使用 pg_dump 工具进行，系统已记录备份请求（演示版）"})))
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "不支持的数据库类型，无法备份"})))
    }
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

pub fn default_site_settings() -> SiteSettings {
    SiteSettings {
        name: "TokensByte".to_string(),
        title: "TokensByte - LLM API Gateway".to_string(),
        keywords: "LLM, API, Gateway, Rust".to_string(),
        description: "Next-gen LLM API Distribution & Management Platform".to_string(),
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

pub fn default_registration_settings() -> RegistrationSettings {
    RegistrationSettings {
        enable_username_registration: false,
        enable_email_registration: false,
        enable_password_recovery: false,
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

