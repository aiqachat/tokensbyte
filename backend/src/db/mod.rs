pub mod migrations;

use sqlx::{Pool, Any, any::AnyPoolOptions};
use crate::config::AppConfig;
use crate::auth;

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: Pool<Any>,
    pub is_sqlite: bool,
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        // Automatically install drivers
        sqlx::any::install_default_drivers();

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

        let pool = AnyPoolOptions::new()
            .max_connections(20)
            .connect(database_url)
            .await?;

        let is_sqlite = database_url.starts_with("sqlite:");
        if is_sqlite {
            sqlx::query("PRAGMA journal_mode=WAL").execute(&pool).await?;
            sqlx::query("PRAGMA foreign_keys=ON").execute(&pool).await?;
        }

        Ok(Self { pool, is_sqlite })
    }

    pub async fn run_migrations(&self) -> anyhow::Result<()> {
        if self.is_sqlite {
            migrations::run_any(&self.pool).await
        } else {
            migrations::run_pg_any(&self.pool).await
        }
    }

    pub async fn generate_unique_uid(&self) -> anyhow::Result<String> {
        use rand::Rng;
        let mut prefix = 100;
        loop {
            // Try 10 times with the current prefix
            for _ in 0..10 {
                let suffix: u32 = {
                    let mut rng = rand::thread_rng();
                    rng.gen_range(0..10_000_000)
                };
                let uid = format!("{}{:07}", prefix, suffix);
                
                let count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE uid = ?")
                    .bind(&uid)
                    .fetch_one(&self.pool)
                    .await?;
                
                if count == 0 {
                    return Ok(uid);
                }
            }
            // If we're here, we had 10 collisions (highly unlikely) or the space is crowded
            prefix += 1;
        }
    }

    pub async fn seed_admin(&self, config: &AppConfig) -> anyhow::Result<()> {
        // Check if admin exists
        let exists_count: i32 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'admin'"
        )
        .fetch_one(&self.pool)
        .await?;

        if exists_count == 0 {
            let password_hash = auth::hash_password(&config.admin_password)?;
            let id = uuid::Uuid::new_v4().to_string();
            let uid = self.generate_unique_uid().await?;
            
            let now = chrono::Local::now().to_rfc3339();
            
            sqlx::query(
                r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, user_group, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'admin', 100.0, 'default', 1, ?, ?)"#
            )
            .bind(&id)
            .bind(&uid)
            .bind(&config.admin_username)
            .bind(format!("{}@tokensbyte.local", &config.admin_username))
            .bind(&password_hash)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;

            tracing::info!("Default admin user '{}' created with UID {}", config.admin_username, uid);
        }

        Ok(())
    }
}
