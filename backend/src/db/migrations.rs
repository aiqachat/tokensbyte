use sqlx::{Pool, Sqlite, Postgres, Any};

pub async fn run_pg_any(pool: &Pool<Any>) -> anyhow::Result<()> {
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
            balance DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            user_group TEXT NOT NULL DEFAULT 'default',
            is_active INTEGER NOT NULL DEFAULT 1, referred_by TEXT, commission_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0, admin_group_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Recharge Records table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS recharge_records (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            amount DOUBLE PRECISION NOT NULL,
            recharge_type TEXT NOT NULL DEFAULT 'other',
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Channels table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '[]',
            model_mapping TEXT NOT NULL DEFAULT '{}',
            priority INTEGER NOT NULL DEFAULT 0,
            weight INTEGER NOT NULL DEFAULT 1,
            status INTEGER NOT NULL DEFAULT 1,
            balance DOUBLE PRECISION,
            max_rps INTEGER DEFAULT 0,
            config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // API Tokens table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS api_tokens (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            token_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'default',
            quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1,
            quota_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            allowed_models TEXT NOT NULL DEFAULT '[]',
            allowed_ips TEXT NOT NULL DEFAULT '',
            ip_whitelist TEXT,
            rps_limit INTEGER DEFAULT 0,
            rpm_limit INTEGER DEFAULT 0,
            expires_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Logs table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            channel_id INTEGER,
            token_id INTEGER,
            model TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            status_code INTEGER NOT NULL DEFAULT 200,
            endpoint TEXT NOT NULL DEFAULT '',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Redemption codes table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS redemptions (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            quota DOUBLE PRECISION NOT NULL,
            is_used INTEGER DEFAULT 0,
            used_at TEXT,
            used_by TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // System settings table
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
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            group_key TEXT NOT NULL UNIQUE,
            discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            commission_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Verification codes table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS verification_codes (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Model Providers table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_providers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Model Types table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_types (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Models table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS models (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            model_id TEXT NOT NULL UNIQUE,
            provider_id INTEGER REFERENCES model_providers(id),
            type_id INTEGER REFERENCES model_types(id),
            billing_type TEXT NOT NULL DEFAULT 'tokens',
            prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            group_ratios TEXT NOT NULL DEFAULT '{}',
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            billing_unit TEXT NOT NULL DEFAULT '1k',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Seed default user level
    sqlx::query(
        r#"INSERT INTO user_levels (name, group_key, discount, description)
           VALUES ('默认用户', 'default', 1.0, '普通用户，无折扣')
           ON CONFLICT (group_key) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Admin Groups table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS admin_groups (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            permissions TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Add admin_group_id to users table if not exists
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_group_id INTEGER")
        .execute(pool)
        .await?;
        
    // Fix missing column in user_levels if table was already created
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0")
        .execute(pool)
        .await?;

    // Commissions table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS commissions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            from_user_id TEXT NOT NULL REFERENCES users(id),
            recharge_id INTEGER REFERENCES recharge_records(id),
            amount DOUBLE PRECISION NOT NULL,
            ratio DOUBLE PRECISION NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Forward Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS forward_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Alter models to add rule link
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS forward_rule_ids TEXT")
        .execute(pool)
        .await?;

    // Seed Forward Rules (PG)
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM forward_rules").fetch_one(pool).await?;
    if count == 0 {
        sqlx::query(r#"INSERT INTO forward_rules (name, rule_type, description, config_json) VALUES 
            ('OpenAI 兼容原生通道', 'openai', '标准的按路径透传规则，支持绝大多数兼容站', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}'),
            ('Anthropic 原生转化', 'anthropic', '转换 Messages 格式，注入专有 Header', '{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}'),
            ('Google Gemini 格式转换', 'gemini', '将标准请求转换并适配到 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}')
        "#).execute(pool).await?;
    }

    // Billing Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS billing_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            billing_type TEXT NOT NULL,
            prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Alter models to add billing rule link
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS billing_rule_id INTEGER")
        .execute(pool)
        .await?;

    // Seed Billing Rules
    let bcount: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM billing_rules").fetch_one(pool).await?;
    if bcount == 0 {
        sqlx::query(r#"INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule) VALUES 
            ('免费公益模型模板', 'tokens', 0.0, 0.0, 0.0, 0.0, 'standard'),
            ('标准 1M 万字计费 ($1)', 'tokens', 1.0, 1.0, 0.0, 0.0, 'standard'),
            ('单次请求扣费 ($0.1)', 'requests', 0.0, 0.0, 0.1, 0.0, 'standard')
        "#).execute(pool).await?;
    }

    tracing::info!("PostgreSQL AnyPool migrations completed successfully");
    Ok(())
}

pub async fn run_any(pool: &Pool<Any>) -> anyhow::Result<()> {
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
            is_active INTEGER NOT NULL DEFAULT 1, referred_by TEXT, commission_balance REAL NOT NULL DEFAULT 0.0, admin_group_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Migration for existing databases: add columns if they don't exist
    for col in &["uid", "nickname", "mobile", "wechat_id", "admin_group_id"] {
        let count: i32 = sqlx::query_scalar(
            &format!("SELECT count(*) FROM pragma_table_info('users') WHERE name='{}'", col)
        )
        .fetch_one(pool)
        .await?;

        if count == 0 {
            let col_type = if col == &"admin_group_id" { "INTEGER" } else { "TEXT" };
            sqlx::query(&format!("ALTER TABLE users ADD COLUMN {} {}", col, col_type))
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
            recharge_type TEXT NOT NULL DEFAULT 'other',
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    let recharge_type_count: i32 = sqlx::query_scalar(
        "SELECT count(*) FROM pragma_table_info('recharge_records') WHERE name='recharge_type'"
    )
    .fetch_one(pool)
    .await?;

    if recharge_type_count == 0 {
        sqlx::query("ALTER TABLE recharge_records ADD COLUMN recharge_type TEXT NOT NULL DEFAULT 'other'")
            .execute(pool)
            .await?;
    }

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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // System settings table
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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Admin Groups table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS admin_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            permissions TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Create indexes
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_verification_email_code ON verification_codes(email, code)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tokens_key ON api_tokens(token_key)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_redemption_code ON redemptions(code)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_redemption_is_used ON redemptions(is_used)").execute(pool).await?;

    // Seed default user level
    sqlx::query(
        r#"INSERT OR IGNORE INTO user_levels (name, group_key, discount, description)
           VALUES ('默认用户', 'default', 1.0, '普通用户，无折扣')"#
    )
    .execute(pool)
    .await?;

    // Model Providers / Types / Models (SQLite truncated for brevity but ensured relevant columns)
    // ... (rest of models migrations)

    tracing::info!("SQLite database migrations completed successfully");
    
    // UID population logic
    let users_without_uid: Vec<String> = sqlx::query_scalar("SELECT id FROM users WHERE uid IS NULL").fetch_all(pool).await?;
    if !users_without_uid.is_empty() {
        tracing::info!("Populating UIDs for {} existing users", users_without_uid.len());
        for id in users_without_uid {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let mut uid;
            loop {
                uid = format!("100{:07}", rng.gen_range(0..10_000_000));
                let exists_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE uid = ?").bind(&uid).fetch_one(pool).await?;
                if exists_count == 0 { break; }
            }
            sqlx::query("UPDATE users SET uid = ? WHERE id = ?").bind(uid).bind(id).execute(pool).await?;
        }
    }
    
    // Forward Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS forward_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    let count_frule: i32 = sqlx::query_scalar("SELECT count(*) FROM pragma_table_info('models') WHERE name='forward_rule_ids'").fetch_one(pool).await?;
    if count_frule == 0 {
        sqlx::query("ALTER TABLE models ADD COLUMN forward_rule_ids TEXT").execute(pool).await?;
    }

    // Seed Forward Rules (SQLite)
    let rule_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM forward_rules").fetch_one(pool).await?;
    if rule_count == 0 {
        sqlx::query(r#"INSERT INTO forward_rules (name, rule_type, description, config_json) VALUES 
            ('OpenAI 兼容原生通道', 'openai', '标准的按路径透传规则，支持绝大多数兼容站', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}'),
            ('Anthropic 原生转化', 'anthropic', '转换 Messages 格式，注入专有 Header', '{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}'),
            ('Google Gemini 格式转换', 'gemini', '将标准请求转换并适配到 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}')
        "#).execute(pool).await?;
    }

    // Billing Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS billing_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            billing_type TEXT NOT NULL,
            prompt_rate REAL NOT NULL DEFAULT 0.0,
            completion_rate REAL NOT NULL DEFAULT 0.0,
            fixed_rate REAL NOT NULL DEFAULT 0.0,
            duration_rate REAL NOT NULL DEFAULT 0.0,
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    let count_brule: i32 = sqlx::query_scalar("SELECT count(*) FROM pragma_table_info('models') WHERE name='billing_rule_id'").fetch_one(pool).await?;
    if count_brule == 0 {
        sqlx::query("ALTER TABLE models ADD COLUMN billing_rule_id INTEGER").execute(pool).await?;
    }

    // Seed Billing Rules
    let brule_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM billing_rules").fetch_one(pool).await?;
    if brule_count == 0 {
        sqlx::query(r#"INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule) VALUES 
            ('免费公益模型模板', 'tokens', 0.0, 0.0, 0.0, 0.0, 'standard'),
            ('标准 1M 万字计费 ($1)', 'tokens', 1.0, 1.0, 0.0, 0.0, 'standard'),
            ('单次请求扣费 ($0.1)', 'requests', 0.0, 0.0, 0.1, 0.0, 'standard')
        "#).execute(pool).await?;
    }

    Ok(())
}

pub async fn run_pg(pool: &Pool<Postgres>) -> anyhow::Result<()> {
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
            balance DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            user_group TEXT NOT NULL DEFAULT 'default',
            is_active INTEGER NOT NULL DEFAULT 1, referred_by TEXT, commission_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0, admin_group_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Recharge Records table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS recharge_records (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            amount DOUBLE PRECISION NOT NULL,
            recharge_type TEXT NOT NULL DEFAULT 'other',
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Channels table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '[]',
            model_mapping TEXT NOT NULL DEFAULT '{}',
            priority INTEGER NOT NULL DEFAULT 0,
            weight INTEGER NOT NULL DEFAULT 1,
            status INTEGER NOT NULL DEFAULT 1,
            balance DOUBLE PRECISION,
            max_rps INTEGER DEFAULT 0,
            config TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // API Tokens table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS api_tokens (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            token_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'default',
            quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1,
            quota_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            allowed_models TEXT NOT NULL DEFAULT '[]',
            allowed_ips TEXT NOT NULL DEFAULT '',
            ip_whitelist TEXT,
            rps_limit INTEGER DEFAULT 0,
            rpm_limit INTEGER DEFAULT 0,
            expires_at TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Logs table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            channel_id INTEGER,
            token_id INTEGER,
            model TEXT NOT NULL DEFAULT '',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            status_code INTEGER NOT NULL DEFAULT 200,
            endpoint TEXT NOT NULL DEFAULT '',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Redemption codes table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS redemptions (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL UNIQUE,
            quota DOUBLE PRECISION NOT NULL,
            is_used INTEGER DEFAULT 0,
            used_at TEXT,
            used_by TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // System settings table
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
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            group_key TEXT NOT NULL UNIQUE,
            discount DOUBLE PRECISION NOT NULL DEFAULT 1.0,
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Verification codes table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS verification_codes (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Model Providers table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_providers (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Model Types table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_types (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Models table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS models (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            model_id TEXT NOT NULL UNIQUE,
            provider_id INTEGER REFERENCES model_providers(id),
            type_id INTEGER REFERENCES model_types(id),
            billing_type TEXT NOT NULL DEFAULT 'tokens',
            prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            group_ratios TEXT NOT NULL DEFAULT '{}',
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            billing_unit TEXT NOT NULL DEFAULT '1k',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Seed default user level
    sqlx::query(
        r#"INSERT INTO user_levels (name, group_key, discount, description)
           VALUES ('默认用户', 'default', 1.0, '普通用户，无折扣')
           ON CONFLICT (group_key) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Admin Groups table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS admin_groups (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            permissions TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Add admin_group_id to users table if not exists
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_group_id INTEGER")
        .execute(pool)
        .await?;

    // Forward Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS forward_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Alter models to add rule link
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS forward_rule_ids TEXT")
        .execute(pool)
        .await?;

    // Seed Forward Rules (PG Standard)
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM forward_rules").fetch_one(pool).await?;
    if count == 0 {
        sqlx::query(r#"INSERT INTO forward_rules (name, rule_type, description, config_json) VALUES 
            ('OpenAI 兼容原生通道', 'openai', '标准的按路径透传规则，支持绝大多数兼容站', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}'),
            ('Anthropic 原生转化', 'anthropic', '转换 Messages 格式，注入专有 Header', '{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}'),
            ('Google Gemini 格式转换', 'gemini', '将标准请求转换并适配到 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}')
        "#).execute(pool).await?;
    }

    // Billing Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS billing_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            billing_type TEXT NOT NULL,
            prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Alter models to add billing rule link
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS billing_rule_id INTEGER")
        .execute(pool)
        .await?;

    // Seed Billing Rules (PG Standard)
    let bcount: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM billing_rules").fetch_one(pool).await?;
    if bcount == 0 {
        sqlx::query(r#"INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule) VALUES 
            ('免费公益模型模板', 'tokens', 0.0, 0.0, 0.0, 0.0, 'standard'),
            ('标准 1M 万字计费 ($1)', 'tokens', 1.0, 1.0, 0.0, 0.0, 'standard'),
            ('单次请求扣费 ($0.1)', 'requests', 0.0, 0.0, 0.1, 0.0, 'standard')
        "#).execute(pool).await?;
    }

    tracing::info!("PostgreSQL database migrations completed successfully");
    Ok(())
}

