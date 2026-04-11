use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub encryption_key: String,
    pub admin_username: String,
    pub admin_password: String,
    pub default_user_quota: f64,
    pub register_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct DatabaseSettings {
    db_type: String,
    host: String,
    port: u16,
    database: String,
    username: String,
    password: String,
    #[serde(default)]
    ssl_mode: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let mut database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://tokensapi:tokensapi@localhost:5432/tokensapi".to_string());

        // Try reading from data/database.json
        if let Ok(config_str) = fs::read_to_string("./data/database.json") {
            if let Ok(settings) = serde_json::from_str::<DatabaseSettings>(&config_str) {
                if settings.db_type == "postgres" {
                    let ssl_mode = if settings.ssl_mode { "require" } else { "disable" };
                    database_url = format!(
                        "postgres://{}:{}@{}:{}/{}?sslmode={}",
                        settings.username, settings.password, settings.host, settings.port, settings.database, ssl_mode
                    );
                } else if settings.db_type == "sqlite" {
                    database_url = format!("sqlite:./data/{}", settings.database);
                }
            }
        }

        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .expect("PORT must be a number"),
            database_url,
            jwt_secret: std::env::var("JWT_SECRET")
                .unwrap_or_else(|_| "tokensbyte-default-secret-change-me".to_string()),
            encryption_key: std::env::var("ENCRYPTION_KEY")
                .unwrap_or_else(|_| "0123456789abcdef0123456789abcdef".to_string()),
            admin_username: std::env::var("ADMIN_USERNAME")
                .unwrap_or_else(|_| "admin".to_string()),
            admin_password: std::env::var("ADMIN_PASSWORD")
                .unwrap_or_else(|_| "123456".to_string()),
            default_user_quota: std::env::var("DEFAULT_USER_QUOTA")
                .unwrap_or_else(|_| "0".to_string())
                .parse()
                .unwrap_or(0.0),
            register_enabled: std::env::var("REGISTER_ENABLED")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
        }
    }
}
