#[cfg(not(feature = "commercial_plugins"))]
mod sqlx {
    pub use ::sqlx::{Pool, Postgres, query_scalar, query_as, Error, FromRow};
    pub use ::sqlx::postgres::{PgQueryResult, PgRow};

    pub fn query(sql: &str) -> ::sqlx::query::Query<'_, Postgres, ::sqlx::postgres::PgArguments> {
        let sql_lower = sql.to_lowercase();
        let is_commercial = sql_lower.contains("volcengine_pool") || 
                            sql_lower.contains("gptimage_pool") || 
                            sql_lower.contains("marketing_team") || 
                            sql_lower.contains("plugin_asset") || 
                            sql_lower.contains("plugin_config") || 
                            sql_lower.contains("plugin_api_log") ||
                            sql_lower.contains("asset_manager") ||
                            sql_lower.contains("team_marketing") ||
                            sql_lower.contains("playground") ||
                            sql_lower.contains("model_marketplace");
        let is_site_icons = sql_lower.contains("site_icons");
        let should_ignore = is_commercial && !is_site_icons;
        
        if should_ignore {
            ::sqlx::query("SELECT 1")
        } else {
            ::sqlx::query(sql)
        }
    }
}

macro_rules! exec_ignore {
    ($pool:expr, $( $q:expr ),+ $(,)?) => {
        $( sqlx::query($q).execute($pool).await.ok(); )+
    };
}

macro_rules! pg_migration_blocks {
    ($pool:expr) => {{
        let pool = $pool;

        // 确保一次性迁移历史记录表存在，以便于安全执行列重命名等一次性变更
        let history_table_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'sys_migration_history'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);

        if history_table_exists == 0 {
            sqlx::query("CREATE TABLE sys_migration_history (id TEXT PRIMARY KEY, executed_at TEXT NOT NULL DEFAULT (now()::text))").execute(pool).await.ok();
        }

    // Users table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL UNIQUE,
            username VARCHAR(48) NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            nickname VARCHAR(24),
            mobile TEXT,
            wechat_id TEXT,
            role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            balance DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            user_group TEXT NOT NULL DEFAULT 'default',
            used_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            referred_by TEXT, commission_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0, admin_group_id INTEGER,
            register_ip TEXT DEFAULT '',
            admin_remark TEXT DEFAULT '',
            referral_history TEXT DEFAULT '',
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
            name TEXT NOT NULL DEFAULT 'default' CHECK (char_length(name) <= 36 AND name ~ '^([^\W_]| )+$'),
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
            daily_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0,
            daily_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            weekly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0,
            weekly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            monthly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0,
            monthly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            last_reset_day TEXT NOT NULL DEFAULT '',
            last_reset_week TEXT NOT NULL DEFAULT '',
            last_reset_month TEXT NOT NULL DEFAULT '',

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
            cached_tokens INTEGER NOT NULL DEFAULT 0,
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
            billing_pid TEXT DEFAULT '',
            forward_eid TEXT DEFAULT '',
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


    // 清理废弃的 task_logs 表（任务日志现在直接基于 logs 表视图查询）
    sqlx::query("DROP TABLE IF EXISTS task_logs")
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
            max_token_count INTEGER NOT NULL DEFAULT 10,
            sort_order INTEGER NOT NULL DEFAULT 0,
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
            default_features TEXT DEFAULT '[]',
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
            name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            original_id TEXT NOT NULL DEFAULT '',
            provider_id INTEGER REFERENCES model_providers(id),
            type_id INTEGER REFERENCES model_types(id),
            group_ratios TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            description TEXT,
            feature_attributes TEXT DEFAULT '[]',
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
            sort_order INTEGER NOT NULL DEFAULT 0,
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
        
    // Add sort_order to admin_groups
    sqlx::query("ALTER TABLE admin_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await?;
        
    // Fix missing column in user_levels if table was already created
    exec_ignore!(pool,
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_inviter DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_invitee DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS daily_invite_limit INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS marketing_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS is_default INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS max_token_count INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "UPDATE user_levels SET is_default = 1 WHERE group_key = 'default' AND NOT EXISTS (SELECT 1 FROM user_levels WHERE is_default = 1)",
    );

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
    exec_ignore!(pool,
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS remark TEXT",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS feature_attributes TEXT DEFAULT '[]'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS enable_log_content INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_stream INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS request_content TEXT",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS response_content TEXT",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_url TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_req_content TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_detail TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_pid TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS forward_eid TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS upstream_req_content TEXT",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_groups TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS group_aid TEXT DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_created ON logs(user_id, created_at)",
    );

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
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
            eid TEXT DEFAULT '',
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    exec_ignore!(pool,
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS default_features TEXT DEFAULT '[]'"
    );

    // 内置模型类型种子数据：向量（Embedding）和排序（Rerank）
    exec_ignore!(pool,
        "INSERT INTO model_types (name, sort_order, is_active, remark) SELECT '向量', 50, 1, '文本向量（Embedding）模型' WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '向量')",
        "INSERT INTO model_types (name, sort_order, is_active, remark) SELECT '排序', 60, 1, '文本排序（Rerank）模型' WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '排序')",
    );

    exec_ignore!(pool,
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '聊天'",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS eid TEXT DEFAULT ''",
    );


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
            ('Anthropic 原生转化', 'anthropic', '将 OpenAI 格式请求转换为 Anthropic Messages API 格式，接口 /v1/messages', '{"mode":"transform","target_type":"anthropic","path_rewrite":{"old":"/v1/chat/completions","new":"/v1/messages"},"auth_type":"x-api-key"}', '聊天', 1),
            ('Google Gemini 原生生图', 'gemini', '将标准的生图请求适配到 Gemini contents 接口', '{"mode":"transform","target_type":"gemini_image","path_rewrite":{"old":"/v1/images/generations","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}', '图片', 1),
            ('Google Gemini 格式转换 (聊天)', 'gemini', '将标准请求转换并适配到 Gemini contents', '{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}', '聊天', 1),
            ('火山方舟 视频生成', 'volcengine', '将标准的视频生成请求适配到火山方舟 tasks 接口', '{"mode":"transform","target_type":"volcengine","path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1),
            ('火山方舟 聊天', 'volcengine', '将标准的聊天请求转发到火山方舟官方 Chat 接口，body 保持 OpenAI 兼容格式', '{"mode":"transform","target_type":"volcengine_chat","path_rewrite":{"old":"/v1/chat/completions","new":"/api/v3/chat/completions"},"auth_type":"bearer"}', '聊天', 1),
            ('火山方舟 图片生成', 'volcengine', '将标准的图片生成请求转发到火山方舟官方 images 接口，body 保持 OpenAI 兼容格式', '{"mode":"transform","target_type":"volcengine_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v3/images/generations"},"auth_type":"bearer"}', '图片', 1),
            ('火山方舟 视频素材转换', 'volcengine', '在火山方舟视频生成基础上，自动将 content 中的网络 URL 通过 CreateAsset API 转换为素材 ID（asset://前缀），需配置素材资产管理插件的审核凭证', '{"mode":"transform","target_type":"volcengine","asset_convert":true,"path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1),
            ('火山方舟 视频素材转换(国际版)', 'volcengine', '在火山方舟视频生成基础上，自动将 content 中的网络 URL 通过 CreateAsset API 转换为素材 ID（asset://前缀），需配置国际版素材资产管理插件的审核凭证', '{"mode":"transform","target_type":"volcengine","asset_convert":true,"asset_convert_ns":"asset_manager_intl","path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1),
            ('火山方舟 视频素材免审核转换(国际版)', 'volcengine', '在火山方舟视频生成基础上，自动将 content 中的网络 URL 通过 CreateAsset API 转换为素材 ID（asset://前缀），且向火山方舟申请免审核，需配置国际版素材资产管理插件的审核凭证', '{"mode":"transform","target_type":"volcengine","asset_convert":true,"asset_convert_ns":"asset_manager_intl","moderation":true,"path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1),
            ('mart-图片', 'mart', '自定义mart图片通道', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"},"poll_path":"/v1/tasks/${task_id}"}', '图片', 1),
            ('mart-视频', 'mart', '自定义mart视频通道', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/videos/generations","new":"/v1/videos/generations"},"poll_path":"/v1/tasks/${task_id}"}', '视频', 1),
            ('阿里百炼 DashScope 视频生成', 'aliyun', '将标准视频生成请求（/v1/video/generations）转换为阿里百炼 DashScope 格式，支持文生视频/图生视频/参考生视频/视频编辑，异步任务自动注入 X-DashScope-Async Header', '{"mode":"transform","target_type":"dashscope","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/services/aigc/video-generation/video-synthesis"},"auth_type":"bearer","poll_path":"/api/v1/tasks/${task_id}"}', '视频', 1),
            ('阿里百炼 DashScope 图片生成', 'aliyun', '将标准图片生成请求（/v1/images/generations）转换为阿里百炼 DashScope 格式', '{"mode":"transform","target_type":"dashscope_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v1/services/aigc/multimodal-generation/generation"},"auth_type":"bearer"}', '图片', 1),
            ('阿里百炼 DashScope 聊天 (OpenAI兼容)', 'aliyun', '将标准聊天请求转发到阿里百炼兼容接口', '{"mode":"transform","target_type":"openai","path_rewrite":{"old":"/v1/chat/completions","new":"/compatible-mode/v1/chat/completions"},"auth_type":"bearer"}', '聊天', 1),
            ('阿里百炼 DashScope 聊天 (Anthropic兼容)', 'aliyun', '将请求转换为 Anthropic 格式并转发到阿里百炼兼容接口', '{"mode":"transform","target_type":"anthropic","path_rewrite":{"old":"/v1/messages","new":"/apps/anthropic/v1/messages"},"auth_type":"x-api-key"}', '聊天', 1),
            ('可灵 视频生成 (文/图/多图)', 'kling', '将标准视频生成请求转发到可灵官方 API，系统根据请求体自动分发到 text2video/image2video/multi-image2video', '{"mode":"transform","target_type":"kling","path_rewrite":{"old":"/v1/video/generations","new":"/v1/videos/text2video"},"auth_type":"bearer"}', '视频', 1),
            ('可灵 Omni 视频 (kling-v3-omni/video-o1)', 'kling', '将视频生成请求转发到可灵 Omni 视频端点', '{"mode":"transform","target_type":"kling","path_rewrite":{"old":"/v1/video/generations","new":"/v1/videos/omni-video"},"auth_type":"bearer"}', '视频', 1),
            ('可灵 图片生成', 'kling', '将标准图片生成请求转发到可灵官方 API，含多图参考自动分发', '{"mode":"transform","target_type":"kling","path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"},"auth_type":"bearer"}', '图片', 1),
            ('可灵 Omni 图片 (kling-v3-omni/image-o1)', 'kling', '将图片生成请求转发到可灵 Omni 图片端点', '{"mode":"transform","target_type":"kling","path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/omni-image"},"auth_type":"bearer"}', '图片', 1),
            ('腾讯云 VOD AIGC 生图', 'tencent_vod', '将标准图片生成请求转换为腾讯云点播 AIGC CreateAigcImageTask 接口。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"mode":"transform","target_type":"tencent_vod_image","path_rewrite":{"old":"/v1/images/generations","new":"/"},"poll_path":"/v1/tasks/${task_id}","auth_type":"tencent_vod"}', '图片', 1),
            ('腾讯云 VOD AIGC 生图 (同步轮询)', 'tencent_vod', '同步版：无 poll_path，OpenAI 兼容请求将自动同步轮询至终态后返回结果。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"mode":"transform","target_type":"tencent_vod_image","path_rewrite":{"old":"/v1/images/generations","new":"/"},"auth_type":"tencent_vod"}', '图片', 1),
            ('腾讯云 VOD AIGC 生视频', 'tencent_vod', '将标准视频生成请求转换为腾讯云点播 AIGC CreateAigcVideoTask 接口。密钥格式：SecretId:SecretKey:SubAppId，模型格式：ModelName@ModelVersion', '{"mode":"transform","target_type":"tencent_vod_video","path_rewrite":{"old":"/v1/video/generations","new":"/"},"auth_type":"tencent_vod"}', '视频', 1),
            ('即梦AI 图片生成', 'jimeng', '将标准图片生成请求转换为即梦AI（火山引擎 CV 视觉服务）格式。密钥格式：AccessKeyID:SecretAccessKey，模型映射为 req_key（如 high_aes_general_v30l_tta）', '{"mode":"transform","target_type":"jimeng_image","path_rewrite":{"old":"/v1/images/generations","new":"/"},"auth_type":"jimeng"}', '图片', 1),
            ('即梦AI 视频生成', 'jimeng', '将标准视频生成请求转换为即梦AI（火山引擎 CV 视觉服务）格式。密钥格式：AccessKeyID:SecretAccessKey，模型映射为 req_key（如 dreamina_ic_generate_video_v2）', '{"mode":"transform","target_type":"jimeng_video","path_rewrite":{"old":"/v1/video/generations","new":"/"},"auth_type":"jimeng"}', '视频', 1),
            ('GPT 官方图片生成', 'gpt', '将图片生成请求转发到 GPT 官方 API，自动根据请求体内容分发到 generations（文生图）或 edits（图生图/多图生图）端点', '{"mode":"transform","target_type":"gpt","path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"},"auth_type":"bearer"}', '图片', 1),
            ('火山方舟 语音合成 (TTS V3)', 'volcengine', '将 OpenAI 格式语音合成请求（/v1/audio/speech）转换为火山方舟 TTS V3 SSE 格式。渠道地址: openspeech.bytedance.com，密钥为 X-Api-Key，模型ID通过 X-Api-Resource-Id 传递', '{"mode":"transform","target_type":"volcengine_tts","path_rewrite":{"old":"/v1/audio/speech","new":"/api/v3/tts/unidirectional/sse"},"auth_type":"volcengine_tts"}', '音频', 1),
            ('火山方舟 语音合成 (TTS V3 Chunked)', 'volcengine', '将 OpenAI 格式语音合成请求（/v1/audio/speech）转换为火山方舟 TTS V3 HTTP Chunked 格式。与 SSE 版本请求体和鉴权相同，仅传输协议不同（更轻量）', '{"mode":"transform","target_type":"volcengine_tts","path_rewrite":{"old":"/v1/audio/speech","new":"/api/v3/tts/unidirectional"},"auth_type":"volcengine_tts"}', '音频', 1),
            ('OpenAI 兼容原生通道 (语音)', 'openai', '标准的语音合成透传规则，直接转发到 /v1/audio/speech', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/audio/speech","new":"/v1/audio/speech"}}', '音频', 1),
            ('阿里百炼 DashScope 文本向量 (OpenAI兼容)', 'aliyun', '将文本向量请求转发到阿里百炼兼容接口', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/embeddings","new":"/compatible-mode/v1/embeddings"},"auth_type":"bearer"}', '向量', 1),
            ('阿里百炼 DashScope 排序 (兼容模式)', 'aliyun', '将排序请求转发到阿里百炼兼容接口，适用于 qwen3-rerank 等模型', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/rerank","new":"/compatible-api/v1/reranks"},"auth_type":"bearer"}', '排序', 1),
            ('阿里百炼 DashScope 排序 (原生)', 'aliyun', '将排序请求转发到阿里百炼原生 DashScope 接口，适用于 gte-rerank-v2 等模型', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/rerank","new":"/api/v1/services/rerank/text-rerank/text-rerank"},"auth_type":"bearer"}', '排序', 1),
            ('Bytefor 视频生成', 'bytefor', '将标准的视频生成请求适配到 Bytefor 视频生成 API', '{"target_type":"bytefor_video","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/generate"},"poll_path":"/api/v1/task/${task_id}","auth_type":"bearer"}', '视频', 1)
        ) AS t(name, rule_type, description, config_json, category, is_system)
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = t.name)
    "#).execute(pool).await.unwrap_or_else(|e| { tracing::warn!("Seed forward_rules insert error (may be OK if already seeded): {}", e); Default::default() });

    // 修正：统一将转发规则中旧的 category='语音' 更新为 '音频'，保持与 model_types 表一致
    exec_ignore!(pool, "UPDATE forward_rules SET category = '音频' WHERE category = '语音'");

    // Billing Rules table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS billing_rules (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            billing_type TEXT NOT NULL,
            prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            cached_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            billing_rule TEXT NOT NULL DEFAULT 'standard',
            pricing_tiers TEXT NOT NULL DEFAULT '[]',
            extended_config TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            upstream_type TEXT NOT NULL DEFAULT 'other',
            config TEXT,
            pid TEXT DEFAULT '',
            provider_id BIGINT REFERENCES model_providers(id),
            type_id BIGINT REFERENCES model_types(id),
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
    exec_ignore!(pool,
        "ALTER TABLE models DROP COLUMN IF EXISTS billing_type",
        "ALTER TABLE models DROP COLUMN IF EXISTS prompt_rate",
        "ALTER TABLE models DROP COLUMN IF EXISTS completion_rate",
        "ALTER TABLE models DROP COLUMN IF EXISTS fixed_rate",
        "ALTER TABLE models DROP COLUMN IF EXISTS duration_rate",
        "ALTER TABLE models DROP COLUMN IF EXISTS billing_rule",
        "ALTER TABLE models DROP COLUMN IF EXISTS billing_unit",
        "ALTER TABLE models DROP COLUMN IF EXISTS pricing_tiers",
        "ALTER TABLE models DROP COLUMN IF EXISTS config",
        "ALTER TABLE models DROP COLUMN IF EXISTS upstream_type",
        "ALTER TABLE forward_rules DROP COLUMN IF EXISTS remark",
        "ALTER TABLE forward_rules DROP COLUMN IF EXISTS upstream_type",
        "ALTER TABLE forward_rules DROP COLUMN IF EXISTS config",
        "ALTER TABLE model_providers DROP COLUMN IF EXISTS upstream_type",
        "ALTER TABLE model_providers DROP COLUMN IF EXISTS config",
        "ALTER TABLE model_types DROP COLUMN IF EXISTS upstream_type",
        "ALTER TABLE model_types DROP COLUMN IF EXISTS config",
        "ALTER TABLE billing_rules DROP COLUMN IF EXISTS upstream_type",
        "ALTER TABLE billing_rules DROP COLUMN IF EXISTS config",
        "ALTER TABLE billing_rules DROP COLUMN IF EXISTS remark",
    );
    
    sqlx::query("ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS extended_config TEXT NOT NULL DEFAULT '{}'")
        .execute(pool)
        .await?;

    // 升级 Anthropic 内置转发规则：补充 path_rewrite 和 auth_type，移除冗余的 header_mapping/body_transform
    exec_ignore!(pool,
        "UPDATE forward_rules SET config_json = '{\"mode\":\"transform\",\"target_type\":\"anthropic\",\"path_rewrite\":{\"old\":\"/v1/chat/completions\",\"new\":\"/v1/messages\"},\"auth_type\":\"x-api-key\"}', description = '将 OpenAI 格式请求转换为 Anthropic Messages API 格式，接口 /v1/messages' WHERE name = 'Anthropic 原生转化' AND is_system = 1",
    );

    // 统一阿里百炼系列转发规则的 rule_type 为 aliyun（仅影响后台 UI 展示分类，不影响转发逻辑）
    exec_ignore!(pool,
        "UPDATE forward_rules SET rule_type = 'aliyun' WHERE name LIKE '%阿里百炼%' AND rule_type != 'aliyun'",
    );

    exec_ignore!(pool,
        "UPDATE forward_rules SET eid = '1' || floor(random() * 9000 + 1000)::text WHERE eid = '' OR eid IS NULL",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS pid TEXT DEFAULT ''",
        "UPDATE billing_rules SET pid = '6' || floor(random() * 9000 + 1000)::text WHERE pid = '' OR pid IS NULL",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS yid TEXT DEFAULT ''",
        "UPDATE channel_configs SET yid = '3' || floor(random() * 9000 + 1000)::text WHERE yid = '' OR yid IS NULL",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS provider_id BIGINT REFERENCES model_providers(id)",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS type_id BIGINT REFERENCES model_types(id)",
        "ALTER TABLE billing_rules ALTER COLUMN provider_id TYPE BIGINT",
        "ALTER TABLE billing_rules ALTER COLUMN type_id TYPE BIGINT",
    );

    sqlx::query("ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await?;

    exec_ignore!(pool,
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS cached_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "COMMENT ON COLUMN billing_rules.cached_rate IS '缓存费率'",
    );

    exec_ignore!(pool,
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS claude_cache_creation_rate DOUBLE PRECISION NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN billing_rules.claude_cache_creation_rate IS 'Claude缓存创建费率(/1M)，0=关闭'",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS claude_cache_read_rate DOUBLE PRECISION NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN billing_rules.claude_cache_read_rate IS 'Claude缓存读取费率(/1M)，0=关闭时回落到cached_rate'",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'custom'",
    );

    // 兼容老库升级：重命名老的文本向量和排序模型计费规则，防止 Seed 块执行时插入重复规则
    sqlx::query(r#"
        UPDATE billing_rules 
        SET name = '文本向量标准计费'
        WHERE name = '文本向量标准计费 (0.7/1M)'
    "#)
    .execute(pool)
    .await
    .unwrap_or_default();

    sqlx::query(r#"
        UPDATE billing_rules 
        SET name = '排序模型多模态计费', 
            billing_rule = 'multimodal', 
            extended_config = '{"image_prompt_rate": 0.35}' 
        WHERE name IN ('排序模型标准计费 (0.35/1M)', '排序模型标准计费')
    "#)
    .execute(pool)
    .await
    .unwrap_or_default();

    // Seed Billing Rules
    // 聚合所有计费规则并插入，使用 WHERE NOT EXISTS 确保无重复，同时也避免多次查询 bcount
    sqlx::query(r#"
        INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, is_system)
        SELECT t.name, t.billing_type, t.prompt_rate, t.completion_rate, t.fixed_rate, t.duration_rate, t.billing_rule, t.extended_config, t.is_system
        FROM (VALUES 
            ('标准1M万字计费 (1)', 'tokens', 1.0, 2.0, 0.0, 0.0, 'standard', '{}', 1),
            ('单次请求扣费 (0.1)', 'requests', 0.0, 0.0, 0.1, 0.0, 'standard', '{}', 1),
            ('Seedance2.0官方计费', 'tokens', 0.0, 0.0, 0.0, 0.0, 'seedance2.0', '{"resolution_rates":{"1080p":{"with_video":31,"without_video":51},"480p":{"with_video":28,"without_video":46},"720p":{"with_video":28,"without_video":46}}}', 1),
            ('Seedance2.0Fast官方计费', 'tokens', 0.0, 0.0, 0.0, 0.0, 'seedance2.0', '{"resolution_rates":{"480p":{"with_video":22,"without_video":37},"720p":{"with_video":22,"without_video":37}}}', 1),
            ('可灵视频官方计费', 'duration', 0.0, 0.0, 0.0, 0.10, 'kling_video', '{"mode_multipliers":{"std":1.0,"pro":1.33,"4k":2.0},"sound_multipliers":{"off":1.0,"on":1.5}}', 1),
            ('可灵V3-Omni视频计费', 'duration', 0.0, 0.0, 0.0, 0.60, 'kling_video', '{"price_table":{"std|off|no":0.6,"std|on|no":0.8,"std|off|yes":0.9,"pro|off|no":0.8,"pro|on|no":1.0,"pro|off|yes":1.2,"4k|off|no":3.0,"4k|on|no":3.0,"4k|off|yes":3.0},"enable_mode":true,"enable_sound":true,"enable_video_ref":true}', 1),
            ('可灵Video-O1视频计费', 'duration', 0.0, 0.0, 0.0, 0.60, 'kling_video', '{"price_table":{"std|off|no":0.6,"std|off|yes":0.9,"pro|off|no":0.8,"pro|off|yes":1.2},"enable_mode":true,"enable_sound":false,"enable_video_ref":true}', 1),
            ('可灵V3视频计费', 'duration', 0.0, 0.0, 0.0, 0.60, 'kling_video', '{"price_table":{"std|off|no":0.6,"std|on|no":0.9,"pro|off|no":0.8,"pro|on|no":1.2,"4k|off|no":3.0,"4k|on|no":3.0},"enable_mode":true,"enable_sound":true,"enable_video_ref":false}', 1),
            ('语音合成按字符计费 (2.8元/万字符)', 'requests', 0.0, 0.0, 2.8, 0.0, 'characters', '{}', 1),
            ('文本向量标准计费', 'tokens', 0.7, 0.0, 0.0, 0.0, 'standard', '{}', 1),
            ('排序模型多模态计费', 'tokens', 0.35, 0.0, 0.0, 0.0, 'multimodal', '{"image_prompt_rate": 0.35}', 1)
        ) AS t(name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, is_system)
        WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = t.name)
    "#).execute(pool).await.unwrap_or_else(|e| { tracing::warn!("Seed billing_rules insert error: {}", e); Default::default() });

    // 回填所有可能因为 Seed 或其他原因缺少 pid 的计费规则的 PID 值（6 开头的 5 位随机数）
    sqlx::query("UPDATE billing_rules SET pid = '6' || floor(random() * 9000 + 1000)::text WHERE pid = '' OR pid IS NULL")
        .execute(pool)
        .await
        .unwrap_or_default();

    exec_ignore!(pool,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_remark TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Shanghai'",
    );

    // 计费明细日志扩展
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_detail TEXT DEFAULT ''")
        .execute(pool)
        .await?;
    exec_ignore!(pool,
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_pid TEXT DEFAULT ''",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS forward_eid TEXT DEFAULT ''",
    );

    // 异步任务 ID（非空时表示异步任务，用于轮询状态跟踪）
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS task_id TEXT DEFAULT ''")
        .execute(pool)
        .await?;
    // 为 task_id 添加备注
    exec_ignore!(pool,
        "COMMENT ON COLUMN logs.task_id IS '异步任务ID，非空时表示异步任务，用于轮询状态跟踪'",
    );

    // 异步任务POST阶段提交响应结果
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS post_response TEXT DEFAULT ''")
        .execute(pool)
        .await?;
    exec_ignore!(pool,
        "COMMENT ON COLUMN logs.post_response IS '异步任务POST阶段提交响应结果'",
    );

    // 任务类型（聊天、图片、视频等），用于精准筛选，避免基于 endpoint 的路径猜测
    sqlx::query("ALTER TABLE logs ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT ''")
        .execute(pool)
        .await?;
    exec_ignore!(pool,
        "COMMENT ON COLUMN logs.action_type IS '任务类型：聊天、图片、视频等，用于精准筛选和显示'",
        "UPDATE logs SET action_type = '聊天' WHERE action_type = '' AND (endpoint LIKE '%chat/completions%' OR endpoint LIKE '%generateContent%')",
        "UPDATE logs SET action_type = '图片' WHERE action_type = '' AND endpoint LIKE '%images/%'",
        "UPDATE logs SET action_type = '视频' WHERE action_type = '' AND (endpoint LIKE '%video/%' OR endpoint LIKE '%videos/%' OR endpoint LIKE '%contents/generations%')",
        "UPDATE logs SET action_type = '其它' WHERE action_type = ''",
    );

    // user_levels 表新增 allow_view_log_details 控制日志详情查看权限
    sqlx::query("ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS allow_view_log_details INTEGER NOT NULL DEFAULT 1")
        .execute(pool)
        .await?;
    exec_ignore!(pool,
        "COMMENT ON COLUMN user_levels.allow_view_log_details IS '是否允许查看日志详情，1-允许，0-不允许'",
    );

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS channel_configs (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            remark TEXT,
            yid TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS preset_id INTEGER",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS remark TEXT",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS yid TEXT DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS remark TEXT",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS remark TEXT",
    );

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

    exec_ignore!(pool,
        "ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS upstream_type TEXT NOT NULL DEFAULT 'other'",
        "ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS config TEXT",
    );

    
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
    exec_ignore!(pool,
        "ALTER TABLE plugins ADD COLUMN IF NOT EXISTS allowed_levels TEXT NOT NULL DEFAULT 'all'",
    );

    // Plugin Asset Groups table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS plugin_asset_groups (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            group_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            plugin_ns TEXT NOT NULL DEFAULT 'asset_manager',
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
            plugin_ns TEXT NOT NULL DEFAULT 'asset_manager',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Migrate existing plugin_assets
    exec_ignore!(pool,
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '未分类'",
        "COMMENT ON COLUMN plugin_assets.category IS '素材分类'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS asset_id TEXT",
        "COMMENT ON COLUMN plugin_assets.asset_id IS '火山方舟素材ID（如 asset://...）'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN plugin_assets.sort_order IS '排序权重，数字越大越靠前'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS remark TEXT",
        "COMMENT ON COLUMN plugin_assets.remark IS '管理员内部备注'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS group_id TEXT",
        "COMMENT ON COLUMN plugin_assets.group_id IS '素材绑定的组合ID'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS content_hash TEXT",
        "COMMENT ON COLUMN plugin_assets.content_hash IS '资源内容 SHA-256 哈希值，用于精确去重'",
        "CREATE INDEX IF NOT EXISTS idx_plugin_assets_content_hash ON plugin_assets(content_hash)",
        "ALTER TABLE plugin_api_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'page'",
        "COMMENT ON COLUMN plugin_api_logs.source IS '日志来源: api_proxy=对外接口 / page=页面操作 / relay_convert=转发规则替换素材'",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS plugin_ns TEXT NOT NULL DEFAULT 'asset_manager'",
        "ALTER TABLE plugin_asset_groups ADD COLUMN IF NOT EXISTS plugin_ns TEXT NOT NULL DEFAULT 'asset_manager'",
        "CREATE INDEX IF NOT EXISTS idx_plugin_assets_asset_id_ns ON plugin_assets(asset_id, plugin_ns)",
        "CREATE INDEX IF NOT EXISTS idx_plugin_assets_source_ns ON plugin_assets(source, plugin_ns)",
    );

    // Seed Asset Manager plugin
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('asset_manager', '素材资产管理', '提供全站图片、视频大模型使用的素材上传与审核功能', 0)
           ON CONFLICT (name) DO NOTHING"#
    )
    .execute(pool)
    .await?;

    // Seed Asset Manager International plugin
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('asset_manager_intl', '素材资产管理国际版', '提供全站图片、视频大模型使用的素材上传与审核功能（国际版）', 0)
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
            invite_code TEXT UNIQUE,
            max_members INTEGER NOT NULL DEFAULT 10,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#
    )
    .execute(pool)
    .await?;

    // Migration: add invite_code and max_members columns for existing deployments
    exec_ignore!(pool,
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS max_members INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS members_can_set_level INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS leader_can_remove_members INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN marketing_teams.leader_can_remove_members IS '团队负责人是否可以移除自己的推广成员(0=否,1=是)'",
    );

    // Backfill: generate invite_code for existing teams that don't have one
    #[cfg(feature = "commercial_plugins")]
    {
        let teams_without_code: Vec<i64> = sqlx::query_scalar(
            "SELECT id FROM marketing_teams WHERE invite_code IS NULL OR invite_code = ''"
        ).fetch_all(&*pool).await.unwrap_or_default();
        for tid in teams_without_code {
            let code: String = (0..8).map(|_| {
                let idx = rand::random::<u8>() % 36;
                if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
            }).collect();
            sqlx::query("UPDATE marketing_teams SET invite_code = $1 WHERE id = $2")
                .bind(&code).bind(tid)
                .execute(&*pool).await.ok();
        }
    }

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
    exec_ignore!(pool,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_name TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_name TEXT",
        "ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
    );

    // 内置服务商: 火山引擎、谷歌、阿里云、腾讯云
    sqlx::query(
        "INSERT INTO model_providers (name, sort_order, is_system)
         VALUES ('火山引擎', 1, 1), ('谷歌', 2, 1), ('阿里云', 3, 1), ('腾讯云', 4, 1)
         ON CONFLICT(name) DO UPDATE SET is_system = 1"
    ).execute(pool).await?;

    // 内置类型: 视频、图片、音频、聊天、向量、排序
    sqlx::query(
        "INSERT INTO model_types (name, sort_order, is_system)
         VALUES ('视频', 1, 1), ('图片', 2, 1), ('音频', 3, 1), ('聊天', 4, 1), ('向量', 50, 1), ('排序', 60, 1)
         ON CONFLICT(name) DO UPDATE SET is_system = 1"
    ).execute(pool).await?;

    // 设置 model_types 默认的 feature_attributes
    exec_ignore!(pool,
        "UPDATE model_types SET default_features = '[\"输入-文字输入\",\"输入-语音输入\",\"输入-视频输入\",\"输出-文字输出\"]' WHERE name = '聊天' AND (default_features = '[]' OR default_features IS NULL)",
        "UPDATE model_types SET default_features = '[\"文生图\",\"图文生图\",\"图生图\"]' WHERE name = '图片' AND (default_features = '[]' OR default_features IS NULL)",
        "UPDATE model_types SET default_features = '[\"文生视频\",\"图生视频\",\"首尾帧生视频\",\"参考生视频\",\"视频生视频\"]' WHERE name = '视频' AND (default_features = '[]' OR default_features IS NULL)"
    );

    // 为 models 表增加 mid 列（系统识别码，6位数字）
    exec_ignore!(pool,
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS mid TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS original_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS site_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS site_discount_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS global_discount DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN models.global_discount IS '全站折扣倍率，开启后与等级折扣/用户折扣取最小值'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS global_discount_enabled INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN models.global_discount_enabled IS '全站折扣开关（0=关，1=开）'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS model_id_alias TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN models.model_id_alias IS '模型ID别名映射值，非空时上游请求使用此ID替代model_id（渠道映射优先级更高）'",
    );

    // Playground Projects table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS playground_projects (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            uid TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '未命名项目',
            description TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            canvas_data TEXT DEFAULT '{}',
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    exec_ignore!(pool,
        "CREATE INDEX IF NOT EXISTS idx_pg_projects_user ON playground_projects(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_projects_uid ON playground_projects(uid)",
    );

    // Announcements table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    // Playground Assets table
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS playground_assets (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES playground_projects(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            uid TEXT NOT NULL,
            asset_type TEXT NOT NULL,
            file_name TEXT DEFAULT '',
            file_size BIGINT DEFAULT 0,
            file_url TEXT NOT NULL,
            tos_object_key TEXT DEFAULT '',
            thumbnail_url TEXT DEFAULT '',
            prompt TEXT DEFAULT '',
            model_id TEXT DEFAULT '',
            model_name TEXT DEFAULT '',
            generation_params TEXT DEFAULT '{}',
            canvas_node_data TEXT DEFAULT '{}',
            duration_seconds DOUBLE PRECISION DEFAULT 0,
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    )
    .execute(pool)
    .await?;

    exec_ignore!(pool,
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_project ON playground_assets(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_user ON playground_assets(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_type ON playground_assets(asset_type)",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS kid TEXT DEFAULT ''",
    );

    // 回填已有令牌的 kid（只处理 kid 为空的记录）
    {
        #[derive(sqlx::FromRow)]
        struct TokenUid { token_id: i64, uid: String }
        let rows: Vec<TokenUid> = sqlx::query_as(
            "SELECT t.id as token_id, u.uid FROM api_tokens t JOIN users u ON t.user_id = u.id WHERE t.kid IS NULL OR t.kid = ''"
        ).fetch_all(&*pool).await.unwrap_or_default();
        for row in rows {
            let uid_suffix: String = row.uid.chars().rev().take(3).collect::<String>().chars().rev().collect();
            let random_part: String = (0..3).map(|_| (b'0' + rand::random::<u8>() % 10) as char).collect();
            let kid = format!("{}{}", uid_suffix, random_part);
            sqlx::query("UPDATE api_tokens SET kid = $1 WHERE id = $2")
                .bind(&kid).bind(row.token_id)
                .execute(&*pool).await.ok();
        }
    }

    // ── 火山引擎卡池系统 Migration ──────────────────────────────────

    // plugins 表新增 category 列：区分用户增强插件和系统增强插件
    exec_ignore!(pool,
        "ALTER TABLE plugins ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'user'",
        "COMMENT ON COLUMN plugins.category IS '插件分类: user=用户增强, system=系统增强'",
        "UPDATE plugins SET category = 'user' WHERE name IN ('asset_manager', 'asset_manager_intl', 'team_marketing', 'playground') AND category = ''",
    );

    // 种子：火山引擎卡池系统插件
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('volcengine_pool', '火山引擎卡池系统', '管理多个火山引擎账号，实现智能调度、配额限制与故障自动隔离', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // 卡池主表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS volcengine_pools (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            pool_type TEXT NOT NULL DEFAULT 'chat',
            strategy TEXT NOT NULL DEFAULT 'random',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            model_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE volcengine_pools IS '火山引擎卡池分组表'",
        "COMMENT ON COLUMN volcengine_pools.pool_type IS '卡池类型: chat=聊天, image=图片, video=视频, custom=自定义'",
        "COMMENT ON COLUMN volcengine_pools.strategy IS '调度策略: random=随机分布, sequential=顺序轮转'",
        "ALTER TABLE volcengine_pools ADD COLUMN IF NOT EXISTS model_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS quota_unit",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS daily_reset_hour",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS daily_reset_minute",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS period_start",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS period_end",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS default_daily_quota",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS default_hourly_quota",
        "ALTER TABLE volcengine_pools DROP COLUMN IF EXISTS default_period_quota",
    );

    // 卡池账号表（独立资源池）
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS volcengine_pool_accounts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL DEFAULT 'https://ark.cn-beijing.volces.com/api/v3',
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            quota_unit TEXT NOT NULL DEFAULT 'tokens',
            daily_reset_hour INTEGER NOT NULL DEFAULT 0,
            daily_reset_minute INTEGER NOT NULL DEFAULT 0,
            period_start TEXT NOT NULL DEFAULT '',
            period_end TEXT NOT NULL DEFAULT '',
            daily_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            hourly_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            period_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            daily_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            hourly_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            period_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            last_daily_reset TEXT NOT NULL DEFAULT '',
            last_hourly_reset TEXT NOT NULL DEFAULT '',
            last_period_reset TEXT NOT NULL DEFAULT '',
            last_error TEXT,
            last_error_at TEXT,
            priority INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "ALTER TABLE volcengine_pool_accounts DROP COLUMN IF EXISTS pool_id",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT 'https://ark.cn-beijing.volces.com/api/v3'",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS models TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS access_key TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS secret_key TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS quota_unit TEXT NOT NULL DEFAULT 'tokens'",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_reset_hour INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_reset_minute INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_start TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_end TEXT NOT NULL DEFAULT ''",
        "COMMENT ON TABLE volcengine_pool_accounts IS '火山引擎独立账号表'",
        "COMMENT ON COLUMN volcengine_pool_accounts.base_url IS '请求地址'",
        "COMMENT ON COLUMN volcengine_pool_accounts.models IS '支持的模型列表，逗号分隔'",
        "COMMENT ON COLUMN volcengine_pool_accounts.quota_unit IS '配额计量单位: tokens=Token数, requests=请求次数, images=图片张数'",
        "COMMENT ON COLUMN volcengine_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽'",
        "COMMENT ON COLUMN volcengine_pool_accounts.daily_quota IS '每日配额上限(0=不限)'",
        "COMMENT ON COLUMN volcengine_pool_accounts.hourly_quota IS '每小时配额上限(0=不限)'",
        "COMMENT ON COLUMN volcengine_pool_accounts.period_quota IS '时段配额上限(0=不限)'",
    );

    // 卡池-账号多对多映射表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS volcengine_pool_account_mapping (
            pool_id INTEGER NOT NULL REFERENCES volcengine_pools(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES volcengine_pool_accounts(id) ON DELETE CASCADE,
            PRIMARY KEY (pool_id, account_id)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS quota_unit TEXT NOT NULL DEFAULT 'tokens'",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS daily_reset_hour INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS daily_reset_minute INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS period_start TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS period_end TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS daily_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS hourly_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS period_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS daily_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS hourly_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS period_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS last_daily_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS last_hourly_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS last_period_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_account_mapping ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON TABLE volcengine_pool_account_mapping IS '卡池与账号的多对多映射表'",
    );

    // 卡池调度日志表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS volcengine_pool_logs (
            id SERIAL PRIMARY KEY,
            pool_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            account_name TEXT NOT NULL DEFAULT '',
            model_id TEXT NOT NULL DEFAULT '',
            channel_id INTEGER NOT NULL DEFAULT 0,
            usage_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            quota_unit TEXT NOT NULL DEFAULT 'tokens',
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE volcengine_pool_logs IS '卡池调度使用日志'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS pool_id INTEGER",
        "COMMENT ON COLUMN channels.pool_id IS '关联的火山引擎卡池ID，为空表示不使用卡池'",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS allowed_level_ids TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN marketing_teams.allowed_level_ids IS '团队负责人被授权可分配的用户等级ID列表(JSON数组)'",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS allowed_member_level_ids TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN marketing_teams.allowed_member_level_ids IS '团队负责人被授权可分配给团队成员的用户等级ID列表(JSON数组)'",
    );

    // ══════════════════════════════════════════════════════════════
    //  GPT-Image 卡池系统
    // ══════════════════════════════════════════════════════════════

    // 种子：GPT-Image 卡池系统插件
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('gptimage_pool', 'GPT-Image卡池系统', '管理多个GPT-Image来源账号，实现智能调度、配额限制与故障自动隔离', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // GPT-Image 卡池主表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS gptimage_pools (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            pool_type TEXT NOT NULL DEFAULT 'image',
            strategy TEXT NOT NULL DEFAULT 'random',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE gptimage_pools IS 'GPT-Image卡池分组表'",
        "COMMENT ON COLUMN gptimage_pools.pool_type IS '卡池类型: image=图片, custom=自定义'",
        "COMMENT ON COLUMN gptimage_pools.strategy IS '调度策略: random=随机分布, sequential=顺序轮转'",
    );

    // GPT-Image 卡池账号表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS gptimage_pool_accounts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL DEFAULT '',
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            quota_unit TEXT NOT NULL DEFAULT 'images',
            daily_reset_hour INTEGER NOT NULL DEFAULT 0,
            daily_reset_minute INTEGER NOT NULL DEFAULT 0,
            period_start TEXT NOT NULL DEFAULT '',
            period_end TEXT NOT NULL DEFAULT '',
            daily_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            hourly_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            period_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
            daily_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            hourly_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            period_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            last_daily_reset TEXT NOT NULL DEFAULT '',
            last_hourly_reset TEXT NOT NULL DEFAULT '',
            last_period_reset TEXT NOT NULL DEFAULT '',
            last_error TEXT,
            last_error_at TEXT,
            priority INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE gptimage_pool_accounts IS 'GPT-Image来源账号表'",
        "COMMENT ON COLUMN gptimage_pool_accounts.base_url IS '请求地址，如 https://api.openai.com'",
        "COMMENT ON COLUMN gptimage_pool_accounts.models IS '支持的模型列表，逗号分隔'",
        "COMMENT ON COLUMN gptimage_pool_accounts.quota_unit IS '配额计量单位: tokens=Token数, requests=请求次数, images=图片张数'",
        "COMMENT ON COLUMN gptimage_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽'",
        "COMMENT ON COLUMN gptimage_pool_accounts.daily_quota IS '每日配额上限(0=不限)'",
        "COMMENT ON COLUMN gptimage_pool_accounts.hourly_quota IS '每小时配额上限(0=不限)'",
        "COMMENT ON COLUMN gptimage_pool_accounts.period_quota IS '时段配额上限(0=不限)'",
    );

    // GPT-Image 卡池-账号多对多映射表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS gptimage_pool_account_mapping (
            pool_id INTEGER NOT NULL REFERENCES gptimage_pools(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES gptimage_pool_accounts(id) ON DELETE CASCADE,
            PRIMARY KEY (pool_id, account_id)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "COMMENT ON TABLE gptimage_pool_account_mapping IS 'GPT-Image卡池与账号的多对多映射表'",
    );

    // GPT-Image 卡池调度日志表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS gptimage_pool_logs (
            id SERIAL PRIMARY KEY,
            pool_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            account_name TEXT NOT NULL DEFAULT '',
            model_id TEXT NOT NULL DEFAULT '',
            channel_id INTEGER NOT NULL DEFAULT 0,
            usage_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            quota_unit TEXT NOT NULL DEFAULT 'images',
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "COMMENT ON TABLE gptimage_pool_logs IS 'GPT-Image卡池调度使用日志'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS gptimage_pool_id INTEGER",
        "COMMENT ON COLUMN channels.gptimage_pool_id IS '关联的GPT-Image卡池ID，为空表示不使用卡池'",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_name_key",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_id_key",
    );

    // ══════════════════════════════════════════════════════════════
    //  模型广场管理插件
    // ══════════════════════════════════════════════════════════════
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('model_marketplace', '模型广场管理', '管理模型广场的模型展示，控制哪些模型对用户可见并配置展示信息', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // ══════════════════════════════════════════════════════════════
    //  站点 Icon 图标库插件
    // ══════════════════════════════════════════════════════════════

    // 种子：站点 Icon 图标库系统插件
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('site_icons', '站点icon图标库', '提供 AI/LLM 品牌 SVG 图标库，支持搜索选择和自定义上传，数据来源 lobehub/lobe-icons', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // 站点图标主表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS site_icons (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'lobe-icons',
            category TEXT NOT NULL DEFAULT 'AI品牌',
            tags TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text),
            UNIQUE(name, source)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE site_icons IS '站点图标库，存储 SVG 图标元数据'",
        "COMMENT ON COLUMN site_icons.name IS '图标标识名（如 openai, claude）'",
        "COMMENT ON COLUMN site_icons.title IS '显示名称（如 OpenAI, Claude）'",
        "COMMENT ON COLUMN site_icons.file_path IS 'SVG 文件路径（相对于 data/assets/）'",
        "COMMENT ON COLUMN site_icons.source IS '图标来源: lobe-icons=从 GitHub 同步 / custom=手动上传'",
        "COMMENT ON COLUMN site_icons.category IS '分类: AI品牌 / 自定义'",
        "COMMENT ON COLUMN site_icons.tags IS '标签(JSON数组)'",
    );

    // 同步日志表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS site_icon_sync_logs (
            id SERIAL PRIMARY KEY,
            total_synced INTEGER NOT NULL DEFAULT 0,
            total_new INTEGER NOT NULL DEFAULT 0,
            total_updated INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE site_icon_sync_logs IS '站点图标同步日志'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS logo TEXT",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS logo TEXT",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS logo TEXT",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN logs.cached_tokens IS '缓存命中的Token数量(属于输入的子集)'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS billing_features TEXT",
        "COMMENT ON COLUMN logs.billing_features IS 'POST阶段提取的计费特征快照(JSON)，独立于enable_log开关，确保异步任务结算时始终有完整计费参数'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS pre_deduct_gift DOUBLE PRECISION NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN logs.pre_deduct_gift IS '预扣费中从赠送余额扣除的金额，用于退款时精准归还到对应钱包'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS remark TEXT",
        "COMMENT ON COLUMN users.remark IS '推广用户备注'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_history TEXT DEFAULT ''",
        "COMMENT ON COLUMN users.referral_history IS '关联流转记录'",
        "INSERT INTO model_providers (name, sort_order, is_system) VALUES ('可灵 AI', 4, 1) ON CONFLICT(name) DO UPDATE SET is_system = 1",
        "UPDATE model_types SET logo = 'sora' WHERE name = '视频' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'midjourney' WHERE name = '图片' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'suno' WHERE name = '音频' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'chatgpt' WHERE name = '聊天' AND (logo IS NULL OR logo = '')",
    );

    // ══════════════════════════════════════════════════════════════
    //  智能路由 (Router Flow) 插件
    // ══════════════════════════════════════════════════════════════
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('router_flow', '智能路由', '配置多个相同模型组成高可用路由组，支持价格优先、速度优先、稳定优先三种智能调度策略', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // 智能路由组表
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS router_flow_groups (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            route_rule TEXT NOT NULL DEFAULT 'price',
            model_ids TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE router_flow_groups IS '智能路由模型组表，用户创建的模型路由组'",
        "COMMENT ON COLUMN router_flow_groups.route_rule IS '路由策略: price=价格优先, speed=速度优先, stability=稳定优先'",
        "COMMENT ON COLUMN router_flow_groups.model_ids IS '绑定的模型 mid 列表(JSON数组)'",
        "CREATE INDEX IF NOT EXISTS idx_rf_groups_user ON router_flow_groups(user_id)",
        "ALTER TABLE router_flow_groups ADD COLUMN IF NOT EXISTS endpoint_id TEXT NOT NULL DEFAULT ''",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_rf_groups_endpoint ON router_flow_groups(endpoint_id) WHERE endpoint_id != ''",
    );

    // ─── channels 表增加 exclude_user_groups 字段（不支持的用户等级，黑名单模式） ───
    exec_ignore!(pool,
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS exclude_user_groups TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN channels.exclude_user_groups IS '不支持的用户等级列表(JSON数组)，黑名单模式'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gift_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gift_used_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "COMMENT ON COLUMN users.gift_balance IS '赠送钱包余额，注册赠送/活动赠送等免费额度，消费时优先扣赠送余额'",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_used_at VARCHAR(30) DEFAULT NULL",
        "COMMENT ON COLUMN api_tokens.last_used_at IS '令牌最后使用时间'",
    );
    // ─── 统一将所有 INTEGER 列升级为 BIGINT，与 Rust 模型层 i64 对齐 ───
    exec_ignore!(pool,

        // ── user_levels ──
        "ALTER TABLE user_levels ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE user_levels ALTER COLUMN daily_invite_limit TYPE BIGINT",
        "ALTER TABLE user_levels ALTER COLUMN marketing_enabled TYPE BIGINT",
        "ALTER TABLE user_levels ALTER COLUMN is_default TYPE BIGINT",
        "ALTER TABLE user_levels ALTER COLUMN max_token_count TYPE BIGINT",
        // ── users ──
        "ALTER TABLE users ALTER COLUMN is_active TYPE BIGINT",
        "ALTER TABLE users ALTER COLUMN admin_group_id TYPE BIGINT",
        // ── api_tokens ──
        "ALTER TABLE api_tokens ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE api_tokens ALTER COLUMN is_active TYPE BIGINT",
        // ── channels ──
        "ALTER TABLE channels ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE channels ALTER COLUMN preset_id TYPE BIGINT",
        "ALTER TABLE channels ALTER COLUMN pool_id TYPE BIGINT",
        "ALTER TABLE channels ALTER COLUMN gptimage_pool_id TYPE BIGINT",
        // ── logs ──
        "ALTER TABLE logs ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE logs ALTER COLUMN channel_id TYPE BIGINT",
        "ALTER TABLE logs ALTER COLUMN token_id TYPE BIGINT",
        // ── channel_configs ──
        "ALTER TABLE channel_configs ALTER COLUMN id TYPE BIGINT",
        // ── admin_groups ──
        "ALTER TABLE admin_groups ALTER COLUMN id TYPE BIGINT",
        // ── plugins ──
        "ALTER TABLE plugins ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE plugins ALTER COLUMN is_enabled TYPE BIGINT",
        "ALTER TABLE plugins ALTER COLUMN sort_order TYPE BIGINT",
        // ── site_icons ──
        "ALTER TABLE site_icons ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE site_icons ALTER COLUMN is_active TYPE BIGINT",
        // ── site_icon_sync_logs ──
        "ALTER TABLE site_icon_sync_logs ALTER COLUMN total_synced TYPE BIGINT",
        "ALTER TABLE site_icon_sync_logs ALTER COLUMN total_new TYPE BIGINT",
        "ALTER TABLE site_icon_sync_logs ALTER COLUMN total_updated TYPE BIGINT",
        // ── redemptions（原误写为 redemption_codes，已修正） ──
        "ALTER TABLE redemptions ALTER COLUMN id TYPE BIGINT",
        // ── models ──
        "ALTER TABLE models ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE models ALTER COLUMN provider_id TYPE BIGINT",
        "ALTER TABLE models ALTER COLUMN type_id TYPE BIGINT",
        "ALTER TABLE models ALTER COLUMN billing_rule_id TYPE BIGINT",
        // ── model_providers ──
        "ALTER TABLE model_providers ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT ''",
        // ── model_types ──
        "ALTER TABLE model_types ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT ''",
        // ── forward_rules ──
        "ALTER TABLE forward_rules ALTER COLUMN id TYPE BIGINT",
        // ── billing_rules ──
        "ALTER TABLE billing_rules ALTER COLUMN id TYPE BIGINT",
        // ── recharge_records ──
        "ALTER TABLE recharge_records ALTER COLUMN id TYPE BIGINT",
        // ── orders ──
        "ALTER TABLE orders ALTER COLUMN id TYPE BIGINT",
        // ── upstreams ──
        "ALTER TABLE upstreams ALTER COLUMN id TYPE BIGINT",
        // ── announcements ──
        "ALTER TABLE announcements ALTER COLUMN id TYPE BIGINT",
        // ── verification_codes ──
        "ALTER TABLE verification_codes ALTER COLUMN id TYPE BIGINT",
        // ── volcengine_pools（主表） ──
        "ALTER TABLE volcengine_pools ALTER COLUMN id TYPE BIGINT",
        // ── volcengine_pool_accounts ──
        "ALTER TABLE volcengine_pool_accounts ALTER COLUMN id TYPE BIGINT",
        // ── volcengine_pool_account_mapping ──
        "ALTER TABLE volcengine_pool_account_mapping ALTER COLUMN pool_id TYPE BIGINT",
        "ALTER TABLE volcengine_pool_account_mapping ALTER COLUMN account_id TYPE BIGINT",
        // ── volcengine_pool_logs ──
        "ALTER TABLE volcengine_pool_logs ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE volcengine_pool_logs ALTER COLUMN pool_id TYPE BIGINT",
        "ALTER TABLE volcengine_pool_logs ALTER COLUMN account_id TYPE BIGINT",
        "ALTER TABLE volcengine_pool_logs ALTER COLUMN channel_id TYPE BIGINT",
        // ── gptimage_pools（主表） ──
        "ALTER TABLE gptimage_pools ALTER COLUMN id TYPE BIGINT",
        // ── gptimage_pool_accounts ──
        "ALTER TABLE gptimage_pool_accounts ALTER COLUMN id TYPE BIGINT",
        // ── gptimage_pool_account_mapping ──
        "ALTER TABLE gptimage_pool_account_mapping ALTER COLUMN pool_id TYPE BIGINT",
        "ALTER TABLE gptimage_pool_account_mapping ALTER COLUMN account_id TYPE BIGINT",
        // ── gptimage_pool_logs ──
        "ALTER TABLE gptimage_pool_logs ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE gptimage_pool_logs ALTER COLUMN pool_id TYPE BIGINT",
        "ALTER TABLE gptimage_pool_logs ALTER COLUMN account_id TYPE BIGINT",
        "ALTER TABLE gptimage_pool_logs ALTER COLUMN channel_id TYPE BIGINT",
        // ── playground_projects（体验中心项目） ──
        "ALTER TABLE playground_projects ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE playground_projects ALTER COLUMN is_deleted TYPE BIGINT",
        // ── playground_assets（体验中心资源） ──
        "ALTER TABLE playground_assets ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE playground_assets ALTER COLUMN project_id TYPE BIGINT",
        "ALTER TABLE playground_assets ALTER COLUMN width TYPE BIGINT",
        "ALTER TABLE playground_assets ALTER COLUMN height TYPE BIGINT",
        "ALTER TABLE playground_assets ALTER COLUMN is_deleted TYPE BIGINT",
        // ── plugin_api_logs ──
        "ALTER TABLE plugin_api_logs ALTER COLUMN id TYPE BIGINT",
        // ── plugin_configs ──
        "ALTER TABLE plugin_configs ALTER COLUMN id TYPE BIGINT",
        // ── plugin_asset_groups ──
        "ALTER TABLE plugin_asset_groups ALTER COLUMN id TYPE BIGINT",
        // ── plugin_assets ──
        "ALTER TABLE plugin_assets ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE plugin_assets ALTER COLUMN size TYPE BIGINT",
        "ALTER TABLE plugin_assets ALTER COLUMN sort_order TYPE BIGINT",
        // ── marketing_teams ──
        "ALTER TABLE marketing_teams ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE marketing_teams ALTER COLUMN max_members TYPE BIGINT",
        "ALTER TABLE marketing_teams ALTER COLUMN members_can_set_level TYPE BIGINT",
        "ALTER TABLE marketing_teams ALTER COLUMN leader_can_remove_members TYPE BIGINT",
        // ── marketing_team_leaders ──
        "ALTER TABLE marketing_team_leaders ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE marketing_team_leaders ALTER COLUMN team_id TYPE BIGINT",
        // ── marketing_team_members ──
        "ALTER TABLE marketing_team_members ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE marketing_team_members ALTER COLUMN team_id TYPE BIGINT",
        // ── site_icon_sync_logs ──
        "ALTER TABLE site_icon_sync_logs ALTER COLUMN id TYPE BIGINT",
        // ── router_flow_groups ──
        "ALTER TABLE router_flow_groups ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE router_flow_groups ALTER COLUMN is_active TYPE BIGINT",
    
    );

    // recharge_records 新增 operator 字段（记录后台操作人员）和 wallet_type 字段（区分所属钱包）
    exec_ignore!(pool,
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS operator TEXT DEFAULT ''",
        "COMMENT ON COLUMN recharge_records.operator IS '操作人员用户名，后台手动操作时记录'",
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS wallet_type TEXT NOT NULL DEFAULT 'system'",
        "COMMENT ON COLUMN recharge_records.wallet_type IS '所属钱包类型: system=系统钱包, gift=赠送钱包'",
        // 迁移历史数据：原 recharge_type='gift' 的记录归入赠送钱包
        "UPDATE recharge_records SET wallet_type = 'gift' WHERE recharge_type = 'gift' AND wallet_type = 'system'",
        // 补充修复：registration（注册赠送）和 commission（邀请奖励）类型实际写入赠送钱包，
        // 但早期未正确设置 wallet_type，导致赠送钱包明细为空但余额不为零的数据不一致
        "UPDATE recharge_records SET wallet_type = 'gift' WHERE recharge_type IN ('registration', 'commission') AND wallet_type = 'system'",
    );

    // ══════════════════════════════════════════════════════════════
    //  API服务商 (API Providers) 支持
    // ══════════════════════════════════════════════════════════════
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS model_api_providers (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            name_en TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_system INTEGER NOT NULL DEFAULT 0,
            remark TEXT,
            logo TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "COMMENT ON TABLE model_api_providers IS 'API服务商表（提供接口的服务商，区别于官方服务商）'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS api_provider_id BIGINT REFERENCES model_api_providers(id)",
    );

    // ══════════════════════════════════════════════════════════════
    //  站点门户 (Site Portal) 插件
    // ══════════════════════════════════════════════════════════════
    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('site_portal', '站点门户', '提供站点内容的基本介绍，支持生成静态HTML页面用于SEO/GEO优化', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // ─── api_tokens 表增加 only_playground 字段（仅限创作中心使用，1=是，0=否） ───
    exec_ignore!(pool,
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS only_playground BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE api_tokens ALTER COLUMN only_playground TYPE BIGINT",
        "COMMENT ON COLUMN api_tokens.only_playground IS '是否仅限创作中心使用，1=是，0=否'",
    );

    // ─── TOS 临时文件过期追踪表（渠道级资源存储 → 自动清理） ───
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS tos_temp_files (
            id SERIAL PRIMARY KEY,
            object_key TEXT NOT NULL,
            channel_id INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'channel',
            expire_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "CREATE INDEX IF NOT EXISTS idx_tos_temp_files_expire ON tos_temp_files (expire_at)",
        "ALTER TABLE tos_temp_files ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE tos_temp_files ALTER COLUMN channel_id TYPE BIGINT",
        "COMMENT ON TABLE tos_temp_files IS 'TOS临时文件过期追踪'",
        "COMMENT ON COLUMN tos_temp_files.object_key IS 'TOS对象键'",
        "COMMENT ON COLUMN tos_temp_files.channel_id IS '来源渠道ID'",
        "COMMENT ON COLUMN tos_temp_files.source IS '业务来源(channel=渠道存储)'",
        "COMMENT ON COLUMN tos_temp_files.expire_at IS '过期时间(ISO 8601)'",
    );

    // ── 用户模型单独折扣字段 ──
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS model_discounts TEXT")
        .execute(pool).await.ok();
    // 字段备注
    sqlx::query("COMMENT ON COLUMN users.model_discounts IS '用户模型单独折扣(JSON: {mid: discount}), 优先于等级折扣, 受模型折扣限价约束'")
        .execute(pool).await.ok();

    // ─── user_model_configs 体验中心模型属性参数配置锁 ───
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS user_model_configs (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            model_mid TEXT NOT NULL,
            param_values TEXT NOT NULL DEFAULT '{}',
            is_locked INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text),
            UNIQUE(user_id, model_mid)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "ALTER TABLE user_model_configs ALTER COLUMN id TYPE bigint",
        "CREATE INDEX IF NOT EXISTS idx_user_model_configs_user ON user_model_configs(user_id)",
        "COMMENT ON TABLE user_model_configs IS '用户在体验中心锁定的模型自定义参数配置'",
        "COMMENT ON COLUMN user_model_configs.user_id IS '用户ID'",
        "COMMENT ON COLUMN user_model_configs.model_mid IS '模型MID标识'",
        "COMMENT ON COLUMN user_model_configs.param_values IS '锁定的配置参数序列化JSON串'",
        "COMMENT ON COLUMN user_model_configs.is_locked IS '是否已锁定，1=是，0=否'",
    );

    // ─── happyhorse_logs 快乐小马智能路由日志表与插件注册 ───
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS happyhorse_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            original_model TEXT NOT NULL,
            media_type TEXT NOT NULL,
            matched_model TEXT NOT NULL,
            request_payload TEXT,
            status INTEGER NOT NULL,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            task_id TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;
    exec_ignore!(pool,
        "CREATE INDEX IF NOT EXISTS idx_happyhorse_logs_created ON happyhorse_logs (created_at DESC)",
        "COMMENT ON TABLE happyhorse_logs IS '快乐小马智能路由转换日志表'",
        "COMMENT ON COLUMN happyhorse_logs.user_id IS '用户ID'",
        "COMMENT ON COLUMN happyhorse_logs.original_model IS '原始请求模型ID'",
        "COMMENT ON COLUMN happyhorse_logs.media_type IS '媒体类型(文生视频/图生视频/参考生视频/视频编辑)'",
        "COMMENT ON COLUMN happyhorse_logs.matched_model IS '路由分发的实际模型ID'",
        "COMMENT ON COLUMN happyhorse_logs.status IS '分发提交状态(200=成功, 其他=失败)'",
        "COMMENT ON COLUMN happyhorse_logs.latency_ms IS '分发请求耗时(ms)'",
        "COMMENT ON COLUMN happyhorse_logs.error_message IS '分发失败时的错误详情'",
        "COMMENT ON COLUMN happyhorse_logs.task_id IS '上游返回的异步任务ID'",
        "ALTER TABLE happyhorse_logs ADD COLUMN IF NOT EXISTS log_id BIGINT",
        "COMMENT ON COLUMN happyhorse_logs.log_id IS '关联主日志表logs.id，用于JOIN获取完整请求/响应/计费信息'",
        "CREATE INDEX IF NOT EXISTS idx_happyhorse_logs_log_id ON happyhorse_logs (log_id)",
        // 清理冗余字段：request_payload 已通过 log_id JOIN 主日志表获取，无需重复存储
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS request_payload",
    );
    // 主日志表：插件标记字段（可扩展兼容其他插件）
    exec_ignore!(pool,
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS plugin_tag TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.plugin_tag IS '插件标记JSON，用于匹配规则展示和插件解耦'",
    );
    // happyhorse_logs: user_id → user_uid（存储短标识，提高效率和可读性）
    // 注意：新功能表存储用户标识统一使用 uid（users.uid）而非 user_id（users.id）
    // 使用 sys_migration_history 一次性机制包裹，并优先检查列是否存在，避免重复运行报错
    let rename_user_id_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'happyhorse_logs_rename_user_id_to_user_uid'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if rename_user_id_done == 0 {
        let col_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'happyhorse_logs' AND column_name = 'user_id'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);
        if col_exists > 0 {
            let _ = sqlx::query("ALTER TABLE happyhorse_logs RENAME COLUMN user_id TO user_uid").execute(pool).await;
            let _ = sqlx::query("UPDATE happyhorse_logs SET user_uid = COALESCE((SELECT u.uid FROM users u WHERE u.id = happyhorse_logs.user_uid), user_uid)").execute(pool).await;
            let _ = sqlx::query("COMMENT ON COLUMN happyhorse_logs.user_uid IS '用户短标识(users.uid)'").execute(pool).await;
        }
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('happyhorse_logs_rename_user_id_to_user_uid')").execute(pool).await;
    }

    sqlx::query(
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('happyhorse_router', '快乐小马智能路由', '自动合并阿里云 DashScope happyhorse 的文生/图生/参考生/编辑视频 4 个模型，自动分发请求', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#
    ).execute(pool).await?;

    // ─── happyhorse_configs 快乐小马智能路由多版本配置表 ───
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS happyhorse_configs (
            id SERIAL PRIMARY KEY,
            custom_model_name TEXT NOT NULL,
            custom_model_id TEXT NOT NULL,
            t2v_model TEXT NOT NULL,
            i2v_model TEXT NOT NULL,
            r2v_model TEXT NOT NULL,
            edit_model TEXT NOT NULL,
            routing_node TEXT NOT NULL UNIQUE,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    ).execute(pool).await?;

    exec_ignore!(pool,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_happyhorse_configs_custom_id ON happyhorse_configs (custom_model_id)",
        "COMMENT ON TABLE happyhorse_configs IS '快乐小马智能路由配置表'",
        "COMMENT ON COLUMN happyhorse_configs.custom_model_name IS '自定义模型名称'",
        "COMMENT ON COLUMN happyhorse_configs.custom_model_id IS '自定义模型ID(用户在API中请求的模型)'",
        "COMMENT ON COLUMN happyhorse_configs.t2v_model IS '绑定的文生视频模型ID'",
        "COMMENT ON COLUMN happyhorse_configs.i2v_model IS '绑定的图生视频模型ID'",
        "COMMENT ON COLUMN happyhorse_configs.r2v_model IS '绑定的参考生视频模型ID'",
        "COMMENT ON COLUMN happyhorse_configs.edit_model IS '绑定的视频编辑模型ID'",
        "COMMENT ON COLUMN happyhorse_configs.routing_node IS '生成的智能推理路由节点ID'",
        "COMMENT ON COLUMN happyhorse_configs.is_active IS '是否启用，1=启用，0=禁用'",
    );

    let hh_config_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM happyhorse_configs")
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    if hh_config_count == 0 {
        sqlx::query(
            r#"INSERT INTO happyhorse_configs (custom_model_name, custom_model_id, t2v_model, i2v_model, r2v_model, edit_model, routing_node, is_active)
               VALUES ('快乐小马智能路由', 'happyhorse-smart', 'happyhorse-1.0-t2v', 'happyhorse-1.0-i2v', 'happyhorse-1.0-r2v', 'happyhorse-1.0-video-edit', 'ephh-happyhorse', 1)"#
        ).execute(pool).await.ok();
    }

    // ── playground_assets 增加 file_hash 列（基于文件内容哈希的精确去重） ──
    exec_ignore!(pool,
        "ALTER TABLE playground_assets ADD COLUMN IF NOT EXISTS file_hash TEXT DEFAULT ''",
        "COMMENT ON COLUMN playground_assets.file_hash IS '文件内容SHA256哈希，用于幂等去重'",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_file_hash ON playground_assets(file_hash)",
    );

    // ── plugin_assets 增加 meta_fingerprint 列（HTTP HEAD 元数据指纹快速去重） ──
    exec_ignore!(pool,
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS meta_fingerprint VARCHAR(128)",
        "COMMENT ON COLUMN plugin_assets.meta_fingerprint IS 'HTTP HEAD元数据指纹(URL域名路径+Content-Length+ETag/Last-Modified的SHA-256)，用于大文件快速去重，避免下载完整文件'",
        "CREATE INDEX IF NOT EXISTS idx_plugin_assets_meta_fp ON plugin_assets (meta_fingerprint)",
    );

    // ── user_level_logs：记录用户等级变更历史 ──
    exec_ignore!(pool,
        r#"CREATE TABLE IF NOT EXISTS user_level_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            old_level TEXT NOT NULL DEFAULT '',
            old_level_name TEXT NOT NULL DEFAULT '',
            new_level TEXT NOT NULL DEFAULT '',
            new_level_name TEXT NOT NULL DEFAULT '',
            operator TEXT NOT NULL DEFAULT '',
            operator_id TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'admin',
            remark TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )"#,
        "COMMENT ON TABLE user_level_logs IS '用户等级变更历史日志'",
        "COMMENT ON COLUMN user_level_logs.source IS '变更来源: admin=管理员手动, marketing=推广负责人, system=系统自动'",
        "CREATE INDEX IF NOT EXISTS idx_user_level_logs_user_id ON user_level_logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_level_logs_created_at ON user_level_logs(created_at DESC)",
    );


    // ── 信控额度字段 ──
    exec_ignore!(pool,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_limit DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "COMMENT ON COLUMN users.credit_limit IS '信控额度：管理员设置的信用额度，不增加实际余额但增加可用余额'",
    );

    // ── 用户支付开关 ──
    exec_ignore!(pool,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_enabled INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN users.pay_enabled IS '是否允许在线支付：1-允许，0-禁止'",
    );

    // ── happyhorse_logs / happyhorse_configs 列升级为 BIGINT（与 Rust 模型层 i64 对齐） ──
    exec_ignore!(pool,
        "ALTER TABLE happyhorse_logs ALTER COLUMN id TYPE BIGINT",
    );

    // ── happyhorse_logs 去除冗余字段，加表备注 ──
    exec_ignore!(pool,
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS status",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS latency_ms",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS error_message",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS task_id",
        "COMMENT ON TABLE happyhorse_logs IS '快乐小马智能路由转换日志表'",
    );

    // ── happyhorse_configs 子模型关联：model_id → mid（不可变标识） ──
    exec_ignore!(pool,
        // 将已有数据中存储的 model_id 值批量转换为 models 表对应的 mid
        "UPDATE happyhorse_configs SET t2v_model = m.mid FROM models m WHERE happyhorse_configs.t2v_model = m.model_id AND happyhorse_configs.t2v_model != m.mid",
        "UPDATE happyhorse_configs SET i2v_model = m.mid FROM models m WHERE happyhorse_configs.i2v_model = m.model_id AND happyhorse_configs.i2v_model != m.mid",
        "UPDATE happyhorse_configs SET r2v_model = m.mid FROM models m WHERE happyhorse_configs.r2v_model = m.model_id AND happyhorse_configs.r2v_model != m.mid",
        "UPDATE happyhorse_configs SET edit_model = m.mid FROM models m WHERE happyhorse_configs.edit_model = m.model_id AND happyhorse_configs.edit_model != m.mid",
        // 更新字段备注
        "COMMENT ON COLUMN happyhorse_configs.t2v_model IS '绑定的文生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.i2v_model IS '绑定的图生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.r2v_model IS '绑定的参考生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.edit_model IS '绑定的视频编辑模型MID(不可变标识)'"
    );

    // ── logs 表新增 log_id 列（带前缀的 ULID，方便用户/管理员通过 ID 查询定位日志） ──
    exec_ignore!(pool,
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS log_id TEXT",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_log_id ON logs (log_id)",
    );

    // 回填存量数据的 log_id（使用 前缀 + 时间戳hex + id hex 拼接，保证唯一且有序）
    exec_ignore!(pool,
        "UPDATE logs SET log_id = CASE \
            WHEN task_id IS NOT NULL AND task_id != '' \
                 AND action_type IS NOT NULL AND action_type NOT IN ('', '聊天') \
            THEN 'tsk_' || lpad(to_hex((EXTRACT(EPOCH FROM created_at::timestamp) * 1000)::bigint), 12, '0') || lpad(to_hex(id), 14, '0') \
            ELSE 'log_' || lpad(to_hex((EXTRACT(EPOCH FROM created_at::timestamp) * 1000)::bigint), 12, '0') || lpad(to_hex(id), 14, '0') \
        END \
        WHERE log_id IS NULL",
    );



    let dirty_logs_repair_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'clean_dirty_logs_cost_20260609'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if dirty_logs_repair_done == 0 {
        tracing::info!("开始清洗历史失败日志的脏扣费数据...");
        let _ = sqlx::query("UPDATE logs SET cost = 0.0, pre_deduct_gift = 0.0 WHERE status_code < 200 OR status_code >= 400")
            .execute(pool).await;
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('clean_dirty_logs_cost_20260609')").execute(pool).await;
        tracing::info!("历史失败日志假扣费清洗完成！");
    }

    let quota_repair_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'fix_used_quota_v2_20260609'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if quota_repair_done == 0 {
        tracing::info!("开始执行全量用户历史消费数据(used_quota)自动校准(严谨版)...");
        // 自动修复历史遗留的 users.used_quota 统计不准确问题
        let _ = sqlx::query(
            "UPDATE users u SET \
             used_quota = COALESCE((SELECT SUM(cost) FROM logs l WHERE l.user_id = u.id), 0.0), \
             gift_used_quota = COALESCE((SELECT SUM(LEAST(cost, pre_deduct_gift)) FROM logs l WHERE l.user_id = u.id), 0.0) \
             WHERE u.used_quota > 0"
        ).execute(pool).await;
        
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('fix_used_quota_v2_20260609')").execute(pool).await;
        tracing::info!("全量用户历史消费数据校准完成！");
    }

    let balance_repair_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'fix_users_balance_20260609'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if balance_repair_done == 0 {
        tracing::info!("开始执行全量用户真实余额(balance/gift_balance)强制核对与校准...");
        // 自动修复历史遗留的 users.balance 错误
        let _ = sqlx::query(
            "UPDATE users u SET \
             balance = COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'system'), 0.0) - COALESCE((SELECT SUM(cost - pre_deduct_gift) FROM logs l WHERE l.user_id = u.id), 0.0), \
             gift_balance = GREATEST(COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'gift'), 0.0) - COALESCE((SELECT SUM(pre_deduct_gift) FROM logs l WHERE l.user_id = u.id), 0.0), 0.0) \
             WHERE EXISTS (SELECT 1 FROM logs WHERE user_id = u.id) OR EXISTS (SELECT 1 FROM recharge_records WHERE user_id = u.id)"
        ).execute(pool).await;
        
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('fix_users_balance_20260609')").execute(pool).await;
        tracing::info!("全量用户真实余额校准完成！");
    }

    let balance_repair_v2_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'fix_users_balance_v2_20260609'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if balance_repair_v2_done == 0 {
        tracing::info!("开始执行全量用户真实余额(balance/gift_balance)强制核对与校准(V2严谨版)...");
        // 修复之前对于部分退款（cost < pre_deduct_gift）导致系统余额倒贴的漏洞
        let _ = sqlx::query(
            "UPDATE users u SET \
             balance = COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'system'), 0.0) - COALESCE((SELECT SUM(GREATEST(cost - pre_deduct_gift, 0.0)) FROM logs l WHERE l.user_id = u.id), 0.0), \
             gift_balance = GREATEST(COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'gift'), 0.0) - COALESCE((SELECT SUM(LEAST(cost, pre_deduct_gift)) FROM logs l WHERE l.user_id = u.id), 0.0), 0.0) \
             WHERE EXISTS (SELECT 1 FROM logs WHERE user_id = u.id) OR EXISTS (SELECT 1 FROM recharge_records WHERE user_id = u.id)"
        ).execute(pool).await;
        
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('fix_users_balance_v2_20260609')").execute(pool).await;
        tracing::info!("全量用户真实余额校准(V2)完成！");
    }

    // ── marketing_teams 增加 members_can_set_pay 字段 ──
    exec_ignore!(pool,
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS members_can_set_pay BIGINT NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN marketing_teams.members_can_set_pay IS '团队成员是否可以设置推广用户的支付权限(0=否,1=是)'",
    );

    // ── billing_rules 增加 sort_order 字段 ──
    exec_ignore!(pool,
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN billing_rules.sort_order IS '排序，数字越大越靠前'",
    );

    // ── forward_rules 增加 sort_order 字段 ──
    exec_ignore!(pool,
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN forward_rules.sort_order IS '排序序号，数字越大越靠前'",
    );

    // ── channels / channel_configs 增加 rate 字段 ──
    exec_ignore!(pool,
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN channels.rate IS '倍率'",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN channel_configs.rate IS '倍率'",
    );

    // ── api_tokens 增加 high_availability 字段 ──
    exec_ignore!(pool,
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS high_availability INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN api_tokens.high_availability IS '是否开启高可用密钥功能(0=禁用,1=启用)'",
    );

    // ── 注册 high_availability_channel 插件 ──
    let _ = sqlx::query(
        "INSERT INTO plugins (name, title, description, is_enabled, allowed_levels, created_at, updated_at) \
         VALUES ('high_availability_channel', '高可用上游渠道系统插件', '启用后，支持管理后台配置高可用渠道组，支持多上游自动防灾切换与按子渠道倍率计费模式。', 1, 'all', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
         ON CONFLICT (name) DO NOTHING"
    ).execute(pool).await;

    // ── 初始化插件动态配置参数至 plugin_configs ──
    let _ = sqlx::query(
        "INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at) \
         VALUES \
         ('high_availability_channel', 'ha_max_retries', '3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), \
         ('high_availability_channel', 'ha_cooldown_429', '60', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), \
         ('high_availability_channel', 'ha_cooldown_network', '300', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), \
         ('high_availability_channel', 'ha_cooldown_auth', '1800', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
         ON CONFLICT (plugin_name, config_key) DO NOTHING"
    ).execute(pool).await;

    // ── 限制用户名和昵称在数据库底层的长度 ──
    exec_ignore!(pool,
        "UPDATE users SET username = SUBSTRING(username FROM 1 FOR 48) WHERE char_length(username) > 48",
        "UPDATE users SET nickname = SUBSTRING(nickname FROM 1 FOR 24) WHERE char_length(nickname) > 24",
        "ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(48)",
        "ALTER TABLE users ALTER COLUMN nickname TYPE VARCHAR(24)",
    );

    // ── 限制令牌名称在数据库底层的长度和格式 ──
    exec_ignore!(pool,
        "UPDATE api_tokens SET name = CASE WHEN SUBSTRING(REGEXP_REPLACE(name, '[^\\w ]|_', '', 'g') FROM 1 FOR 36) = '' THEN 'default' ELSE SUBSTRING(REGEXP_REPLACE(name, '[^\\w ]|_', '', 'g') FROM 1 FOR 36) END WHERE name !~ '^([^\\W_]| )+$' OR CHAR_LENGTH(name) > 36",
        "ALTER TABLE api_tokens DROP CONSTRAINT IF EXISTS chk_api_tokens_name",
        "ALTER TABLE api_tokens ADD CONSTRAINT chk_api_tokens_name CHECK (char_length(name) <= 36 AND name ~ '^([^\\W_]| )+$')",
    );

    // ── 增加令牌日、周、月限额字段 ──
    exec_ignore!(pool,
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS daily_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS daily_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS weekly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS weekly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS monthly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS monthly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_day TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_week TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_month TEXT NOT NULL DEFAULT ''",
    );

    tracing::info!("PostgreSQL AnyPool migrations completed successfully");
    Ok(())
    }};
}



pub async fn run_pg(pool: &sqlx::Pool<sqlx::Postgres>) -> anyhow::Result<()> {
    pg_migration_blocks!(pool)
}
