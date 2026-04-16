use std::sync::Arc;

mod api;
mod auth;
mod config;
mod db;
mod error;
mod middleware;
mod models;
mod providers;
mod relay;
mod services;

use config::AppConfig;
use db::Database;

pub struct AppState {
    pub db: Database,
    pub config: AppConfig,
    pub http_client: reqwest::Client,
    pub rate_limiter: middleware::rate_limit::GlobalRateLimiter,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();
    
    let config_data = AppConfig::from_env();
    let database = Database::new(&config_data.database_url).await?;
    database.run_migrations().await?;
    database.seed_admin(&config_data).await?;

    // 同步 REGISTER_ENABLED 环境变量到数据库设置
    sync_registration_settings(&database, config_data.register_enabled).await?;

    
    let state = Arc::new(AppState {
        db: database,
        config: config_data.clone(),
        http_client: reqwest::Client::new(),
        rate_limiter: middleware::rate_limit::GlobalRateLimiter::new(),
    });

    let app = api::build_router(state.clone())
        .nest_service("/assets", tower_http::services::ServeDir::new("data/assets"));

    let addr = format!("{}:{}", config_data.host, config_data.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("🚀 TokensByte server running at http://{}", addr);
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}

/// 将 REGISTER_ENABLED 环境变量同步到数据库的 registration_settings
async fn sync_registration_settings(db: &Database, register_enabled: bool) -> anyhow::Result<()> {
    use sqlx::Row;
    
    // 检查是否已存在 registration_settings
    let existing: Option<String> = sqlx::query_scalar(&db.format_query("SELECT value FROM settings WHERE key = 'registration_settings'"))
        .fetch_optional(&db.pool)
        .await?;
    
    let settings = if let Some(val) = existing {
        // 已存在，更新注册开关
        let mut settings: models::RegistrationSettings = serde_json::from_str(&val)
            .unwrap_or_else(|_| models::RegistrationSettings {
                enable_username_registration: false,
                enable_email_registration: false,
                enable_password_recovery: false,
            });
        
        // 根据 REGISTER_ENABLED 设置注册方式
        if register_enabled {
            settings.enable_username_registration = true;
            settings.enable_email_registration = true;
        } else {
            settings.enable_username_registration = false;
            settings.enable_email_registration = false;
        }
        
        settings
    } else {
        // 不存在，创建新设置
        models::RegistrationSettings {
            enable_username_registration: register_enabled,
            enable_email_registration: register_enabled,
            enable_password_recovery: true,
        }
    };
    
    // 保存到数据库
    let val = serde_json::to_string(&settings).unwrap_or_default();
    sqlx::query(&db.format_query("INSERT INTO settings (key, value) VALUES ('registration_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
        .bind(val)
        .execute(&db.pool)
        .await?;
    
    tracing::info!(
        "📝 Registration settings synced: username={}, email={}, password_recovery={}",
        settings.enable_username_registration,
        settings.enable_email_registration,
        settings.enable_password_recovery
    );
    
    Ok(())
}
