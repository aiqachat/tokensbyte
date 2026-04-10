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
    tracing_subscriber::fmt::init();
    
    let config_data = AppConfig::from_env();
    let database = Database::new(&config_data.database_url).await?;
    database.run_migrations().await?;
    database.seed_admin(&config_data).await?;

    
    let state = Arc::new(AppState {
        db: database,
        config: config_data.clone(),
        http_client: reqwest::Client::new(),
        rate_limiter: middleware::rate_limit::GlobalRateLimiter::new(),
    });

    let app = api::build_router(state.clone());

    let addr = format!("{}:{}", config_data.host, config_data.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("🚀 TokensByte server running at http://{}", addr);
    axum::serve(listener, app).await?;

    Ok(())
}
