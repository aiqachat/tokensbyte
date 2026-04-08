use sqlx::{Pool, Sqlite};

pub async fn run(pool: &Pool<Sqlite>) -> anyhow::Result<()> {
    // Users table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            balance REAL NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Channels table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '[]',
            model_mapping TEXT NOT NULL DEFAULT '{}',
            priority INTEGER NOT NULL DEFAULT 0,
            weight INTEGER NOT NULL DEFAULT 1,
            status INTEGER NOT NULL DEFAULT 1,
            balance REAL,
            max_rps INTEGER DEFAULT 0,
            config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // API Tokens table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS api_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id),
            token_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'default',
            quota_limit REAL NOT NULL DEFAULT -1,
            quota_used REAL NOT NULL DEFAULT 0,
            allowed_models TEXT NOT NULL DEFAULT '[]',
            allowed_ips TEXT NOT NULL DEFAULT '',
            expires_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Logs table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            channel_id INTEGER,
            token_id INTEGER,
            model TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0.0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            status_code INTEGER NOT NULL DEFAULT 200,
            endpoint TEXT NOT NULL DEFAULT '',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Redemption codes table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS redemption_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            amount REAL NOT NULL DEFAULT 0.0,
            used_by TEXT REFERENCES users(id),
            used_at TEXT,
            expires_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // System settings table (key-value store)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        )"#
    )
    .execute(pool)
    .await?;

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tokens_key ON api_tokens(token_key)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tokens_user ON api_tokens(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status)")
        .execute(pool)
        .await?;

    tracing::info!("Database migrations completed successfully");
    Ok(())
}
