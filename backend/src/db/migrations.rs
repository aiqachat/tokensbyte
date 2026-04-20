use sqlx::{Pool, Any};

macro_rules! pg_migration_blocks {
    ($pool:expr) => {{
        let pool = $pool;

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
            used_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT, referred_by TEXT, commission_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0, admin_group_id INTEGER,
            register_ip TEXT DEFAULT '',
            admin_remark TEXT DEFAULT '',
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
            quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1,
            quota_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            config TEXT NOT NULL DEFAULT '{}',
            user_groups TEXT NOT NULL DEFAULT '[]',
            group_aid TEXT DEFAULT '',
            preset_id INTEGER,
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
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
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
            upstream_url TEXT DEFAULT '',
            request_content TEXT,
            response_content TEXT,
            upstream_req_content TEXT,
            is_stream INTEGER NOT NULL DEFAULT 0,
            billing_detail TEXT DEFAULT '',
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

    // Orders table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            out_trade_no TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL REFERENCES users(id),
            payment_method TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            trade_no TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            paid_at TEXT
        )"#
    )
    .execute(pool)
    .await?;


    // Task Logs table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS task_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            channel_id INTEGER,
            platform TEXT NOT NULL,
            action_type TEXT NOT NULL,
            task_id TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            submit_time TEXT,
            end_time TEXT,
            time_spent INTEGER,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Plugin API Logs table (PG)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugin_api_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            plugin_name TEXT NOT NULL,
            api_endpoint TEXT NOT NULL,
            request_payload TEXT,
            response_payload TEXT,
            status_code INTEGER,
            created_at TEXT NOT NULL DEFAULT (now()::text)
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
            invite_reward_inviter DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            invite_reward_invitee DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            daily_invite_limit INTEGER NOT NULL DEFAULT 10,
            marketing_enabled INTEGER NOT NULL DEFAULT 0,
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
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
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
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
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
            group_ratios TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
            enable_log_content INTEGER NOT NULL DEFAULT 0,
            forward_rule_ids TEXT,
            billing_rule_id INTEGER,
            pre_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.0,
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
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0").execute(pool).await.ok();
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_inviter DOUBLE PRECISION NOT NULL DEFAULT 0.0").execute(pool).await.ok();
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_invitee DOUBLE PRECISION NOT NULL DEFAULT 0.0").execute(pool).await.ok();
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS daily_invite_limit INTEGER NOT NULL DEFAULT 10").execute(pool).await.ok();
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS marketing_enabled INTEGER NOT NULL DEFAULT 0").execute(pool).await.ok();

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

    // Add new columns to existing models/logs tables
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS enable_log_content INTEGER NOT NULL DEFAULT 0")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_stream INTEGER NOT NULL DEFAULT 0")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS request_content TEXT")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS response_content TEXT")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_url TEXT DEFAULT ''")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_req_content TEXT")
        .execute(pool).await.ok();

    // Safe fallback for existing postgres deployments
    sqlx::query("ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_groups TEXT NOT NULL DEFAULT '[]'")
        .execute(pool)
        .await
        .ok();
    sqlx::query("ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1")
        .execute(pool).await.ok();
    sqlx::query("ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_used DOUBLE PRECISION NOT NULL DEFAULT 0")
        .execute(pool).await.ok();

    // Forward Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS forward_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            rule_type TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '聊天',
            config_json TEXT NOT NULL DEFAULT '{}',
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_system INTEGER NOT NULL DEFAULT 0,
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    sqlx::query("ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '聊天'")
        .execute(pool)
        .await
        .ok();
    sqlx::query("ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0")
        .execute(pool).await.ok();

    // Alter models to add rule link
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS forward_rule_ids TEXT")
        .execute(pool)
        .await?;

    // Seed Forward Rules (PG) - 聚合插入，避免大量重复代码并标识系统内置类型
    sqlx::query(r#"
        INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system)
        SELECT t.name, t.rule_type, t.description, t.config_json, t.category, t.is_system
        FROM (VALUES
            ('OpenAI 兼容原生通道 (聊天)', 'openai', '标准的按路径聊天透传规则', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}', '聊天', 1),
            ('OpenAI 兼容原生通道 (图片)', 'openai', '供图片生成调用的原生通道', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"}}', '图片', 1),
            ('OpenAI 兼容原生通道 (视频)', 'openai', '供视频生成调用的原生通道', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/video/generations","new":"/v1/video/generations"}}', '视频', 1),
            ('Anthropic 原生转化', 'anthropic', '转换 Messages 格式，注入专有 Header', '{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}', '聊天', 1),
            ('Google Gemini 原生生图', 'gemini', '将标准的生图请求适配到 Gemini contents 接口', '{"mode":"transform","target_type":"gemini_image","path_rewrite":{"old":"/v1/images/generations","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}', '图片', 1),
            ('Google Gemini 格式转换 (聊天)', 'gemini', '将标准请求转换并适配到 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}', '聊天', 1),
            ('Google Gemini 流式转换 (聊天)', 'gemini', '将标准请求转换为支持流式输出的 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:streamGenerateContent?alt=sse"},"auth_type":"query_key"}', '聊天', 1),
            ('火山方舟 视频生成', 'volcengine', '将标准的视频生成请求适配到火山方舟 tasks 接口', '{"mode":"transform","target_type":"volcengine","path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1),
            ('火山方舟 聊天', 'volcengine', '将标准的聊天请求转发到火山方舟官方 Chat 接口，body 保持 OpenAI 兼容格式', '{"mode":"transform","target_type":"volcengine_chat","path_rewrite":{"old":"/v1/chat/completions","new":"/api/v3/chat/completions"},"auth_type":"bearer"}', '聊天', 1),
            ('火山方舟 图片生成', 'volcengine', '将标准的图片生成请求转发到火山方舟官方 images 接口，body 保持 OpenAI 兼容格式', '{"mode":"transform","target_type":"volcengine_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v3/images/generations"},"auth_type":"bearer"}', '图片', 1)
        ) AS t(name, rule_type, description, config_json, category, is_system)
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = t.name)
    "#).execute(pool).await.ok();

    // 更新老数据
    sqlx::query("UPDATE forward_rules SET is_system = 1 WHERE name IN ('OpenAI 兼容原生通道 (聊天)', 'OpenAI 兼容原生通道 (图片)', 'OpenAI 兼容原生通道 (视频)', 'Anthropic 原生转化', 'Google Gemini 原生生图', 'Google Gemini 格式转换 (聊天)', 'Google Gemini 流式转换 (聊天)', '火山方舟 视频生成', '火山方舟 聊天', '火山方舟 图片生成')")
        .execute(pool).await.ok();

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
            extended_config TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Alter models to add billing rule link and pre_deduction
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS billing_rule_id INTEGER")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE models ADD COLUMN IF NOT EXISTS pre_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.0")
        .execute(pool)
        .await?;
    
    // Clean up unused legacy billing fields from models table (PostgreSQL specific)
    let drop_fields = vec![
        "billing_type", "prompt_rate", "completion_rate", "fixed_rate", 
        "duration_rate", "billing_rule", "billing_unit", "pricing_tiers"
    ];
    for field in drop_fields {
        let q = format!("ALTER TABLE models DROP COLUMN IF EXISTS {}", field);
        sqlx::query(&q).execute(pool).await.ok();
    }
    
    sqlx::query("ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS extended_config TEXT NOT NULL DEFAULT '{}'")
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

    let _ = sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT DEFAULT ''").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_remark TEXT DEFAULT ''").execute(pool).await;

    // 计费明细日志扩展
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_detail TEXT DEFAULT ''")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS channel_configs (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;
    let _ = sqlx::query("ALTER TABLE channels ADD COLUMN IF NOT EXISTS preset_id INTEGER").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS remark TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS remark TEXT").execute(pool).await;

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS upstreams (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            config TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    let _ = sqlx::query("ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS upstream_type TEXT NOT NULL DEFAULT 'other'").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS config TEXT").execute(pool).await;

    
    // Plugins table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugins (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 0,
            allowed_levels TEXT NOT NULL DEFAULT 'all',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Upgrade: add allowed_levels for existing deployments
    let _ = sqlx::query("ALTER TABLE plugins ADD COLUMN IF NOT EXISTS allowed_levels TEXT NOT NULL DEFAULT 'all'")
        .execute(pool).await;

    // Plugin Asset Groups table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugin_asset_groups (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            group_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Plugin Assets table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugin_assets (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            asset_type TEXT NOT NULL,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            mime_type TEXT,
            size INTEGER,
            reject_reason TEXT,
            category TEXT DEFAULT '未分类',
            asset_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            remark TEXT,
            group_id TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Migrate existing plugin_assets
    sqlx::query("ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '未分类'").execute(pool).await.ok();
    sqlx::query("ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS asset_id TEXT").execute(pool).await.ok();
    sqlx::query("ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0").execute(pool).await.ok();
    sqlx::query("ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS remark TEXT").execute(pool).await.ok();
    sqlx::query("ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS group_id TEXT").execute(pool).await.ok();

    // Seed Asset Manager plugin
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('asset_manager', '素材资产管理', '提供全站图片、视频大模型使用的素材上传与审核功能', 0)
           ON CONFLICT (name) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Seed Team Marketing plugin
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('team_marketing', '团队营销管理', '提供营销团队的用户管理，支持推广团队创建与成员管理', 0)
           ON CONFLICT (name) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Seed Playground plugin
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('playground', '模型体验中心', '提供直接的视频、图片、声音、聊天模型体验服务', 0)
           ON CONFLICT (name) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Marketing Teams table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS marketing_teams (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Marketing Team Leaders table (many-to-many)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS marketing_team_leaders (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(team_id, user_id)
        )"#
    )
    .execute(pool)
    .await?;

    // Marketing Team Members table (many-to-many)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS marketing_team_members (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(team_id, user_id)
        )"#
    )
    .execute(pool)
    .await?;

    // Plugin Configs table (for TOS storage, etc.)
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugin_configs (
            id SERIAL PRIMARY KEY,
            plugin_name TEXT NOT NULL,
            config_key TEXT NOT NULL,
            config_value TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(plugin_name, config_key)
        )"#
    )
    .execute(pool)
    .await?;

    // -- 多方式登录注册扩展 --
    // users 表新增 google_id（谷歌 OAuth 唯一标识）
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT")
        .execute(pool).await.ok();

    // verification_codes 表新增 phone 字段（短信验证码使用）
    sqlx::query("ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''")
        .execute(pool).await.ok();

    tracing::info!("PostgreSQL AnyPool migrations completed successfully");
    Ok(())
    }};
}

pub async fn run_pg_any(pool: &sqlx::Pool<sqlx::Any>) -> anyhow::Result<()> {
    pg_migration_blocks!(pool)
}
pub async fn run_any(pool: &Pool<Any>) -> anyhow::Result<()> {
    // SQLite blocks fully deprecated. Route any remaining any_pool setups to pg layout
    pg_migration_blocks!(pool)
}

pub async fn run_pg(pool: &sqlx::Pool<sqlx::Postgres>) -> anyhow::Result<()> {
    pg_migration_blocks!(pool)
}
