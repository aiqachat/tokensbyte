use sqlx::{Pool, Sqlite};

pub async fn run(pool: &Pool<Sqlite>) -> anyhow::Result<()> {
    // Users table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            nickname TEXT,
            mobile TEXT,
            wechat_id TEXT,
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            balance REAL NOT NULL DEFAULT 0.0,
            user_group TEXT NOT NULL DEFAULT 'default',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Migration for existing databases: add columns if they don't exist
    for col in &["uid", "nickname", "mobile", "wechat_id"] {
        let count: i32 = sqlx::query_scalar(
            &format!("SELECT count(*) FROM pragma_table_info('users') WHERE name='{}'", col)
        )
        .fetch_one(pool)
        .await?;

        if count == 0 {
            sqlx::query(&format!("ALTER TABLE users ADD COLUMN {}", col))
                .execute(pool)
                .await?;
        }
    }

    // Recharge Records table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS recharge_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id),
            amount REAL NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
            ip_whitelist TEXT,
            rps_limit INTEGER DEFAULT 0,
            rpm_limit INTEGER DEFAULT 0,
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
        r#"CREATE TABLE IF NOT EXISTS redemptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            quota REAL NOT NULL,
            is_used INTEGER DEFAULT 0,
            used_at TEXT,
            used_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    // User levels table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS user_levels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            group_key TEXT NOT NULL UNIQUE,
            discount REAL NOT NULL DEFAULT 1.0,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Seed default user level if not exists
    sqlx::query(
        r#"INSERT OR IGNORE INTO user_levels (name, group_key, discount, description)
           VALUES ('默认用户', 'default', 1.0, '普通用户，无折扣')"#
    )
    .execute(pool)
    .await?;

    // Model Providers table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Create unique index for provider name (for existing installations)
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_model_providers_name ON model_providers(name)")
        .execute(pool)
        .await?;

    // Model Types table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Create unique index for type name (for existing installations)
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_model_types_name ON model_types(name)")
        .execute(pool)
        .await?;

    // Models table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            model_id TEXT NOT NULL UNIQUE,
            provider_id INTEGER REFERENCES model_providers(id),
            type_id INTEGER REFERENCES model_types(id),
            billing_type TEXT NOT NULL DEFAULT 'tokens', -- tokens, requests, duration
            prompt_rate REAL NOT NULL DEFAULT 0.0,
            completion_rate REAL NOT NULL DEFAULT 0.0,
            fixed_rate REAL NOT NULL DEFAULT 0.0,
            duration_rate REAL NOT NULL DEFAULT 0.0,
            group_ratios TEXT NOT NULL DEFAULT '{}', -- JSON object for group discounts
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )"#
    )
    .execute(pool)
    .await?;

    // Add columns to models table if they don't exist
    for col in &["provider_id", "type_id"] {
        let count: i32 = sqlx::query_scalar(
            &format!("SELECT count(*) FROM pragma_table_info('models') WHERE name='{}'", col)
        )
        .fetch_one(pool)
        .await?;

        if count == 0 {
            sqlx::query(&format!("ALTER TABLE models ADD COLUMN {}", col))
                .execute(pool)
                .await?;
        }
    }


    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tokens_key ON api_tokens(token_key)")
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
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_redemption_code ON redemptions(code)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_redemption_is_used ON redemptions(is_used)")
        .execute(pool)
        .await?;


    tracing::info!("Database migrations completed successfully");
    
    // Check for users without UID and populate them
    let users_without_uid: Vec<String> = sqlx::query_scalar("SELECT id FROM users WHERE uid IS NULL")
        .fetch_all(pool)
        .await?;
    
    if !users_without_uid.is_empty() {
        tracing::info!("Populating UIDs for {} existing users", users_without_uid.len());
        // We can't use the Database::generate_unique_uid here easily without a Database struct
        // but we can implement a simple version here or just use a random one and ignore collisions for now
        // Or better, let's just use a simple loop.
        for id in users_without_uid {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let mut uid;
            loop {
                uid = format!("100{:07}", rng.gen_range(0..10_000_000));
                let exists_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE uid = ?")
                    .bind(&uid)
                    .fetch_one(pool)
                    .await?;
                if exists_count == 0 { break; }
            }
            sqlx::query("UPDATE users SET uid = ? WHERE id = ?")
                .bind(uid)
                .bind(id)
                .execute(pool)
                .await?;
        }
    }
    
    Ok(())
}
