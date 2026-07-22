/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

pub mod migrations;

use crate::auth;
use crate::config::AppConfig;
use crate::time_system::DbTs;
use sqlx::{postgres::PgPoolOptions, Pool, Postgres};

#[derive(Debug, Clone)]
pub struct Database {
    pub pool: Pool<Postgres>,
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let mut attempts = 0;
        let max_attempts = 15;
        eprintln!(
            "⏳ Attempting database connection (attempt {})...",
            attempts
        );
        let mut actual_url = database_url.to_string();
        if actual_url.starts_with("postgres://") && !actual_url.contains("sslmode=") {
            actual_url = format!("{}?sslmode=disable", actual_url);
        }

        let pool = loop {
            attempts += 1;
            match PgPoolOptions::new()
                .max_connections(20)
                .acquire_timeout(std::time::Duration::from_secs(5))
                .after_connect(|conn, _meta| {
                    Box::pin(async move {
                        // timesystem：每个连接强制 UTC，与进程 TZ=UTC 对齐
                        sqlx::query("SET TIME ZONE 'UTC'")
                            .execute(&mut *conn)
                            .await?;
                        Ok(())
                    })
                })
                .connect(&actual_url)
                .await
            {
                Ok(pool) => break pool,
                Err(e) => {
                    eprintln!("⚠️ Database connection error: {:?}", e);
                    if attempts >= max_attempts {
                        tracing::error!(
                            "❌ Failed to connect to database after {} attempts: {}",
                            max_attempts,
                            e
                        );
                        return Err(anyhow::anyhow!(
                            "Database connection failed after {} attempts: {}",
                            max_attempts,
                            e
                        ));
                    }
                    let delay = std::cmp::min(attempts * 2, 10);
                    tracing::warn!(
                        "⏳ Database connection attempt {}/{} failed: {}. Retrying in {}s...",
                        attempts,
                        max_attempts,
                        e,
                        delay
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay as u64)).await;
                }
            }
        };

        eprintln!("✅ Database connection established (TIME ZONE=UTC).");
        Ok(Self { pool })
    }

    pub async fn run_migrations(&self) -> anyhow::Result<()> {
        eprintln!("🚀 Starting database migrations...");
        migrations::run_pg(&self.pool).await?;
        eprintln!("✅ Database migrations completed.");
        Ok(())
    }

    pub fn format_query(&self, sql: &str) -> String {
        // Convert SQLite-specific functions and keywords to PostgreSQL
        let mut sql_new = sql.replace("date('now')", "CURRENT_DATE");
        sql_new = sql_new.replace("datetime('now')", "CURRENT_TIMESTAMP");
        sql_new = sql_new.replace(" LIKE ", " ILIKE "); // Case-insensitive matching

        // Convert ? to $1, $2, ... for PostgreSQL
        let mut result = String::with_capacity(sql_new.len() + 10);
        let mut count = 1;

        for c in sql_new.chars() {
            if c == '?' {
                result.push_str(&format!("${}", count));
                count += 1;
            } else {
                result.push(c);
            }
        }
        result
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

                let count: i64 = sqlx::query_scalar(
                    &self.format_query("SELECT COUNT(*) FROM users WHERE uid = ?"),
                )
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

    pub async fn get_user_display_name(&self, id_or_val: &str) -> String {
        if id_or_val.is_empty() || id_or_val == "无" {
            return "无".to_string();
        }
        let row: Option<(String, Option<String>, String)> = sqlx::query_as(&self.format_query(
            "SELECT uid, nickname, username FROM users WHERE id = ? OR uid = ? OR username = ? LIMIT 1"
        ))
        .bind(id_or_val)
        .bind(id_or_val)
        .bind(id_or_val)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten();

        if let Some((uid, nickname, username)) = row {
            if let Some(nick) = nickname {
                if !nick.is_empty() {
                    return format!("{} ({})", uid, nick);
                }
            }
            format!("{} ({})", uid, username)
        } else {
            id_or_val.to_string()
        }
    }

    pub async fn seed_admin(&self, config: &AppConfig) -> anyhow::Result<()> {
        // Check if admin exists
        let exists_count: i64 = sqlx::query_scalar(
            &self.format_query("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
        )
        .fetch_one(&self.pool)
        .await?;

        if exists_count == 0 {
            let password_hash = auth::hash_password(&config.admin_password)?;
            let id = uuid::Uuid::new_v4().to_string();
            let uid = self.generate_unique_uid().await?;

            let now = DbTs::now();

            sqlx::query(
                &self.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, balance, user_group, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, 'admin', 100.0, 'default', 1, ?, ?)"#)
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

            tracing::info!(
                "Default admin user '{}' created with UID {}",
                config.admin_username,
                uid
            );
        }

        Ok(())
    }
}
