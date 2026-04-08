pub mod migrations;

use sqlx::{Pool, Sqlite, sqlite::SqlitePoolOptions};
use crate::config::AppConfig;
use crate::auth;

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        // Ensure data directory exists for SQLite
        if database_url.starts_with("sqlite:") {
            let path = database_url
                .trim_start_matches("sqlite:")
                .split('?')
                .next()
                .unwrap_or("./data/tokensbyte.db");
            if let Some(parent) = std::path::Path::new(path).parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(20)
            .connect(database_url)
            .await?;

        // Enable WAL mode for better concurrent performance
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&pool)
            .await?;
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&pool)
            .await?;

        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> anyhow::Result<()> {
        migrations::run(&self.pool).await
    }

    pub async fn seed_admin(&self, config: &AppConfig) -> anyhow::Result<()> {
        // Check if admin exists
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')"
        )
        .fetch_one(&self.pool)
        .await?;

        if !exists {
            let password_hash = auth::hash_password(&config.admin_password)?;
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                r#"INSERT INTO users (id, username, email, password_hash, role, balance, user_group, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'admin', 100.0, 'default', 1, datetime('now'), datetime('now'))"#
            )

            .bind(&id)
            .bind(&config.admin_username)
            .bind(format!("{}@tokensbyte.local", &config.admin_username))
            .bind(&password_hash)
            .execute(&self.pool)
            .await?;

            tracing::info!("Default admin user '{}' created", config.admin_username);
        }

        Ok(())
    }
}
