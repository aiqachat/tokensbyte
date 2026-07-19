/*
 🛡️ 数据库迁移与结构变更开发规范 (人类 & AI 协作指南)
为了确保热重启性能（logs表百万级以上数据时），所有的 DML (回填数据)
或高代价的 DDL 操作必须且只能通过一次性保护机制执行。

【新增表结构变更或一次性数据更新的规则】：
1. 严禁直接在已有的 once_migration! 块中直接修改或追加 SQL（因为老用户已运行过此 ID 将被跳过）。
2. 严禁直接修改存量的 CREATE TABLE 或 DDL 块。
3. 必须在 `pg_migration_blocks!` 宏的【最尾部】新增一个独立的
   `once_migration!(pool, "unique_migration_id_vX", "SQL...");` 块。
*/

// 开源版不再 noop 商业相关 SQL：库表/数据允许存在，插件中心由 is_plugin_compiled 过滤展示。
// 此前用 contains("plugin_config"|"playground"|...) 会误伤 HA / 创作中心 / 门户配置迁移。

/// 一次性迁移执行宏：通过 sys_migration_history 确保仅首次部署执行，后续重启自动跳过。
/// 任一句失败则**不**写入 history，下次启动可重试（避免半成功被永久跳过）。
macro_rules! once_migration {
    ($pool:expr, $id:literal, $( $stmt:expr ),+ $(,)?) => {{
        let _m_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = $1")
            .bind($id)
            .fetch_one($pool)
            .await
            .unwrap_or(0);
        if _m_done == 0 {
            let mut _m_ok = true;
            $(
                if _m_ok {
                    match sqlx::query($stmt).execute($pool).await {
                        Ok(_) => {},
                        Err(e) => {
                            _m_ok = false;
                            tracing::error!(
                                "❌ [Migration] ID: {} 失败，将不写入 history 以便重试. 语句: '{}' 错误: {:?}",
                                $id,
                                $stmt,
                                e
                            );
                        }
                    }
                }
            )+
            if _m_ok {
                let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ($1)")
                    .bind($id)
                    .execute($pool)
                    .await;
                tracing::info!("✅ [Migration] 一次性迁移完成: {}", $id);
            } else {
                tracing::error!("❌ [Migration] 一次性迁移中止（未标记完成）: {}", $id);
            }
        }
    }};
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
    // ── 初始化核心基础表（受一次性迁移保护） ──
    once_migration!(pool, "init_core_tables_v1",
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
        )"#,
        r#"CREATE TABLE IF NOT EXISTS recharge_records (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            amount DOUBLE PRECISION NOT NULL,
            recharge_type TEXT NOT NULL DEFAULT 'other',
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
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
        )"#,
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
        )"#,
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
        )"#,
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
        )"#,
        r#"CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        )"#,
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
        )"#,
        "DROP TABLE IF EXISTS task_logs",
        r#"CREATE TABLE IF NOT EXISTS plugin_api_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            plugin_name TEXT NOT NULL,
            api_endpoint TEXT NOT NULL,
            request_payload TEXT,
            response_payload TEXT,
            status_code INTEGER,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
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
        )"#,
        r#"CREATE TABLE IF NOT EXISTS verification_codes (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#
    );

    // Model Providers table
    // ── 初始化服务商与模型管理表（受一次性迁移保护） ──
    once_migration!(pool, "init_provider_tables_v1",
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
        )"#,
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
        )"#,
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
    );

    // Seed default user level
    once_migration!(pool, "seed_default_user_level_v1",
        r#"INSERT INTO user_levels (name, group_key, discount, description)
           VALUES ('默认用户', 'default', 1.0, '普通用户，无折扣')
           ON CONFLICT (group_key) DO NOTHING"#
    );

    // Admin Groups table
    // ── 初始化管理组、佣金表及核心字段扩展（受一次性迁移保护） ──
    once_migration!(pool, "backfill_channels_user_groups_v1",
        r#"CREATE TABLE IF NOT EXISTS admin_groups (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            permissions TEXT,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_group_id INTEGER",
        "ALTER TABLE admin_groups ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS commission_ratio DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_inviter DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS invite_reward_invitee DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS daily_invite_limit INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS marketing_enabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS is_default INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS max_token_count INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        r#"CREATE TABLE IF NOT EXISTS commissions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            from_user_id TEXT NOT NULL REFERENCES users(id),
            recharge_id INTEGER REFERENCES recharge_records(id),
            amount DOUBLE PRECISION NOT NULL,
            ratio DOUBLE PRECISION NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
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
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS user_groups TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS group_aid TEXT DEFAULT ''",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_created ON logs(user_id, created_at)"
    );

    // ── 初始化转发规则与计费规则系统结构（受一次性迁移保护） ──
    once_migration!(pool, "init_routing_billing_tables_v1",
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
        )"#,
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS default_features TEXT DEFAULT '[]'",
        "INSERT INTO model_types (name, sort_order, is_active, remark) SELECT '向量', 50, 1, '文本向量（Embedding）模型' WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '向量')",
        "INSERT INTO model_types (name, sort_order, is_active, remark) SELECT '排序', 60, 1, '文本排序（Rerank）模型' WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '排序')",
        "INSERT INTO model_types (name, sort_order, is_active, remark) SELECT '视频增强', 35, 1, '视频画质增强与字幕擦除处理模型' WHERE NOT EXISTS (SELECT 1 FROM model_types WHERE name = '视频增强')",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '聊天'",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS eid TEXT DEFAULT ''",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS forward_rule_ids TEXT",
        r#"INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system)
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
            ('火山方舟 语音合成 (TTS V3 Chunked)', 'volcengine', '将 OpenAI 格式语音合成请求（/v1/audio/speech）转换为火山方舟 TTS V3 HTTP Chunked 格式与 SSE 版本请求体和鉴权相同，仅传输协议不同（更轻量）', '{"mode":"transform","target_type":"volcengine_tts","path_rewrite":{"old":"/v1/audio/speech","new":"/api/v3/tts/unidirectional"},"auth_type":"volcengine_tts"}', '音频', 1),
            ('OpenAI 兼容原生通道 (语音)', 'openai', '标准的语音合成透传规则，直接转发到 /v1/audio/speech', '{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/audio/speech","new":"/v1/audio/speech"}}', '音频', 1),
            ('阿里百炼 DashScope 文本向量 (OpenAI兼容)', 'aliyun', '将文本向量请求转发到阿里百炼兼容接口', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/embeddings","new":"/compatible-mode/v1/embeddings"},"auth_type":"bearer"}', '向量', 1),
            ('阿里百炼 DashScope 排序 (兼容模式)', 'aliyun', '将排序请求转发到阿里百炼兼容接口，适用于 qwen3-rerank 等模型', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/rerank","new":"/compatible-api/v1/reranks"},"auth_type":"bearer"}', '排序', 1),
            ('阿里百炼 DashScope 排序 (原生)', 'aliyun', '将排序请求转发到阿里百炼原生 DashScope 接口，适用于 gte-rerank-v2 等模型', '{"mode":"passthrough","target_type":"openai","path_rewrite":{"old":"/v1/rerank","new":"/api/v1/services/rerank/text-rerank/text-rerank"},"auth_type":"bearer"}', '排序', 1),
            ('Bytefor 视频生成', 'bytefor', '将标准的视频生成请求适配到 Bytefor 视频生成 API', '{"target_type":"bytefor_video","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/generate"},"poll_path":"/api/v1/task/${task_id}","auth_type":"bearer"}', '视频', 1),
            ('火山方舟 级联视频生成', 'volcengine', '供视频生成级联画质增强调用的火山方舟专属转发规则', '{"mode":"transform","target_type":"volcengine","is_cascade":true,"res_mul":{"720p":2.15,"1080p":2.25,"2k":2.5,"4k":4.0},"path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}', '视频', 1)
        ) AS t(name, rule_type, description, config_json, category, is_system)
        WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = t.name)
        "#,
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
        )"#,
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS billing_rule_id INTEGER",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS pre_deduction DOUBLE PRECISION NOT NULL DEFAULT 0.0",
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
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS extended_config TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS pid TEXT DEFAULT ''",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS provider_id BIGINT REFERENCES model_providers(id)",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS type_id BIGINT REFERENCES model_types(id)",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS cached_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS claude_cache_creation_rate DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS claude_cache_read_rate DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'custom'",
        "UPDATE billing_rules SET name = '文本向量标准计费' WHERE name = '文本向量标准计费 (0.7/1M)'",
        "UPDATE billing_rules SET name = '排序模型多模态计费', billing_rule = 'multimodal', extended_config = '{\"image_prompt_rate\": 0.35}' WHERE name IN ('排序模型标准计费 (0.35/1M)', '排序模型标准计费')",
        r#"INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, is_system)
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
            ('排序模型多模态计费', 'tokens', 0.35, 0.0, 0.0, 0.0, 'multimodal', '{"image_prompt_rate": 0.35}', 1),
            ('火山级联画质增强默认计费', 'duration', 0.0, 0.0, 0.0, 0.0, 'volc_enhance_cascade', '{"price_table": {"fast|720p|no": 0.80, "fast|1080p|no": 1.80, "fast|2k|no": 3.20, "fast|4k|no": 7.20, "standard|720p|no": 1.00, "standard|1080p|no": 2.24, "standard|2k|no": 4.00, "standard|4k|no": 8.94, "pro|720p|no": 1.20, "pro|1080p|no": 2.70, "pro|2k|no": 4.80, "pro|4k|no": 10.70, "ai|720p|no": 1.40, "ai|1080p|no": 3.16, "fast|720p|yes": 0.84, "fast|1080p|yes": 1.88, "fast|2k|yes": 3.40, "fast|4k|yes": 7.40, "standard|720p|yes": 1.06, "standard|1080p|yes": 2.36, "standard|2k|yes": 4.30, "standard|4k|yes": 9.24, "pro|720p|yes": 1.28, "pro|1080p|yes": 2.86, "pro|2k|yes": 5.20, "pro|4k|yes": 11.10, "ai|720p|yes": 1.60, "ai|1080p|yes": 3.51}}', 1)
        ) AS t(name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, extended_config, is_system)
        WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = t.name)
        "#,
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS register_ip TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_remark TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Shanghai'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS task_id TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.task_id IS '异步任务ID，非空时表示异步任务，用于轮询状态跟踪'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS post_response TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.post_response IS '异步任务POST阶段提交响应结果'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.action_type IS '任务类型：聊天、图片、视频等，用于精准筛选和显示'",
        "CREATE INDEX IF NOT EXISTS idx_logs_action_type_created ON logs (action_type, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs (task_id)",
        "CREATE INDEX IF NOT EXISTS idx_logs_token_created ON logs (token_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_channel_created ON logs (channel_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_model_created ON logs (model, created_at DESC)",
        "ALTER TABLE user_levels ADD COLUMN IF NOT EXISTS allow_view_log_details INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN user_levels.allow_view_log_details IS '是否允许查看日志详情，1-允许，0-不允许'",
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
        )"#,
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS preset_id INTEGER",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS remark TEXT",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS yid TEXT DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS remark TEXT",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS remark TEXT",
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
        )"#,
        "ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS upstream_type TEXT NOT NULL DEFAULT 'other'",
        "ALTER TABLE upstreams ADD COLUMN IF NOT EXISTS config TEXT"
    );



    // Plugins table
    // ── 初始化插件管理系统表及种子数据（受一次性迁移保护） ──
    once_migration!(pool, "init_plugin_tables_v1",
        r#"CREATE TABLE IF NOT EXISTS plugins (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 0,
            allowed_levels TEXT NOT NULL DEFAULT 'all',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#,
        "ALTER TABLE plugins ADD COLUMN IF NOT EXISTS allowed_levels TEXT NOT NULL DEFAULT 'all'",
        r#"CREATE TABLE IF NOT EXISTS plugin_asset_groups (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            group_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            plugin_ns TEXT NOT NULL DEFAULT 'asset_manager',
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#,
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
        )"#,
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
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('asset_manager', '素材资产管理', '提供全站图片、视频大模型使用的素材上传与审核功能', 0)
           ON CONFLICT (name) DO NOTHING"#,
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('asset_manager_intl', '素材资产管理国际版', '提供全站图片、视频大模型使用的素材上传与审核功能（国际版）', 0)
           ON CONFLICT (name) DO NOTHING"#,
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('team_marketing', '团队营销管理', '提供营销团队的用户管理，支持推广团队创建与成员管理', 0)
           ON CONFLICT (name) DO NOTHING"#,
        r#"INSERT INTO plugins (name, title, description, is_enabled)
           VALUES ('playground', '模型创作中心', '提供直接的视频、图片、声音、聊天模型体验服务', 0)
           ON CONFLICT (name) DO NOTHING"#
    );

    // ── 初始化内置服务商与模型创作中心表（受一次性迁移保护） ──
    once_migration!(pool, "init_playground_tables_v1",
        "ALTER TABLE model_providers ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE model_types ADD COLUMN IF NOT EXISTS is_system INTEGER NOT NULL DEFAULT 0",
        "INSERT INTO model_providers (name, sort_order, is_system) VALUES ('火山引擎', 1, 1), ('谷歌', 2, 1), ('阿里云', 3, 1), ('腾讯云', 4, 1) ON CONFLICT(name) DO UPDATE SET is_system = 1",
        "INSERT INTO model_types (name, sort_order, is_system) VALUES ('视频', 1, 1), ('图片', 2, 1), ('音频', 3, 1), ('聊天', 4, 1), ('向量', 50, 1), ('排序', 60, 1), ('视频增强', 70, 1) ON CONFLICT(name) DO UPDATE SET is_system = 1",
        "UPDATE model_types SET default_features = '[\"输入-文字输入\",\"输入-语音输入\",\"输入-视频输入\",\"输出-文字输出\"]' WHERE name = '聊天' AND (default_features = '[]' OR default_features IS NULL)",
        "UPDATE model_types SET default_features = '[\"文生图\",\"图文生图\",\"图生图\"]' WHERE name = '图片' AND (default_features = '[]' OR default_features IS NULL)",
        "UPDATE model_types SET default_features = '[\"文生视频\",\"图生视频\",\"首尾帧生视频\",\"参考生视频\",\"视频生视频\"]' WHERE name = '视频' AND (default_features = '[]' OR default_features IS NULL)",
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
        r#"CREATE TABLE IF NOT EXISTS playground_projects (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            uid TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '未命名项目',
            description TEXT DEFAULT '',
            cover_url TEXT DEFAULT '',
            canvas_data TEXT DEFAULT '{}',
            is_deleted INTEGER NOT NULL DEFAULT 0,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_pg_projects_user ON playground_projects(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_projects_uid ON playground_projects(uid)",
        r#"CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
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
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_project ON playground_assets(project_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_user ON playground_assets(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_type ON playground_assets(asset_type)",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS kid TEXT DEFAULT ''"
    );

    // Marketing Teams table
    // ── 初始化推广团队主表（受一次性迁移保护） ──
    once_migration!(pool, "init_marketing_teams_v1",
        r#"CREATE TABLE IF NOT EXISTS marketing_teams (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            invite_code TEXT UNIQUE,
            max_members INTEGER NOT NULL DEFAULT 10,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )"#,
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS max_members INTEGER NOT NULL DEFAULT 10",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS members_can_set_level INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS leader_can_remove_members INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN marketing_teams.leader_can_remove_members IS '团队负责人是否可以移除自己的推广成员(0=否,1=是)'"
    );

    // Backfill: generate invite_code for existing teams that don't have one (受一次性迁移保护)
    #[cfg(feature = "commercial_plugins")]
    {
        let invite_code_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'backfill_team_invite_codes_v1'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);
        if invite_code_done == 0 {
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
            let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('backfill_team_invite_codes_v1')").execute(pool).await;
        }
    }

    // ── 初始化火山引擎卡池系统表及字段扩展（受一次性迁移保护） ──
    once_migration!(pool, "init_volcengine_pool_tables_v1",
        "ALTER TABLE plugins ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'user'",
        "COMMENT ON COLUMN plugins.category IS '插件分类: user=用户增强, system=系统增强'",
        "UPDATE plugins SET category = 'user' WHERE name IN ('asset_manager', 'asset_manager_intl', 'team_marketing', 'playground') AND category = ''",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('volcengine_pool', '火山引擎卡池系统', '管理多个火山引擎账号，实现智能调度、配额限制与故障自动隔离', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#,
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
        )"#,
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
        r#"CREATE TABLE IF NOT EXISTS volcengine_pool_accounts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'volcengine',
            base_url TEXT NOT NULL DEFAULT 'https://ark.cn-beijing.volces.com/api/v3',
            api_key TEXT NOT NULL,
            models TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'active',
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
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'volcengine'",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT 'https://ark.cn-beijing.volces.com/api/v3'",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS hourly_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_quota DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS hourly_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS last_daily_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS last_hourly_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS last_period_reset TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS last_error TEXT",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS last_error_at TEXT",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_reset_hour INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS daily_reset_minute INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_start TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS period_end TEXT NOT NULL DEFAULT ''",
        "COMMENT ON TABLE volcengine_pool_accounts IS '火山引擎独立账号表'",
        "COMMENT ON COLUMN volcengine_pool_accounts.base_url IS '请求地址'",
        "COMMENT ON COLUMN volcengine_pool_accounts.models IS '支持的模型列表，逗号分隔'",
        "COMMENT ON COLUMN volcengine_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽'",
        "COMMENT ON COLUMN volcengine_pool_accounts.daily_quota IS '每日配额上限(0=不限)'",
        "COMMENT ON COLUMN volcengine_pool_accounts.hourly_quota IS '每小时配额上限(0=不限)'",
        "COMMENT ON COLUMN volcengine_pool_accounts.period_quota IS '时段配额上限(0=不限)'",
        r#"CREATE TABLE IF NOT EXISTS volcengine_pool_account_mapping (
            pool_id INTEGER NOT NULL REFERENCES volcengine_pools(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES volcengine_pool_accounts(id) ON DELETE CASCADE,
            PRIMARY KEY (pool_id, account_id)
        )"#,
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
        )"#,
        "COMMENT ON TABLE volcengine_pool_logs IS '卡池调度使用日志'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS pool_id INTEGER",
        "COMMENT ON COLUMN channels.pool_id IS '关联的火山引擎卡池ID，为空表示不使用卡池'",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS allowed_level_ids TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN marketing_teams.allowed_level_ids IS '团队负责人被授权可分配的用户等级ID列表(JSON数组)'",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS allowed_member_level_ids TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN marketing_teams.allowed_member_level_ids IS '团队负责人被授权可分配给团队成员的用户等级ID列表(JSON数组)'"
    );

    // Marketing Team Leaders table (many-to-many)
    // ── 初始化推广团队关联表与公共配置表（受一次性迁移保护） ──
    once_migration!(pool, "init_marketing_team_relations_v1",
        r#"CREATE TABLE IF NOT EXISTS marketing_team_leaders (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(team_id, user_id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS marketing_team_members (
            id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(team_id, user_id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS plugin_configs (
            id SERIAL PRIMARY KEY,
            plugin_name TEXT NOT NULL,
            config_key TEXT NOT NULL,
            config_value TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            UNIQUE(plugin_name, config_key)
        )"#
    );

    // -- 多方式登录注册扩展 --
    // users 表新增 google_id（谷歌 OAuth 唯一标识）与微信登录字段，受一次性迁移保护
    once_migration!(pool, "user_oauth_fields_v1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_name TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_name TEXT",
        "ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''"
    );


    // 回填已有令牌的 kid（只处理 kid 为空的记录，受一次性迁移保护）
    {
        let kid_backfill_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'backfill_token_kids_v1'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);
        if kid_backfill_done == 0 {
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
            let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('backfill_token_kids_v1')").execute(pool).await;
        }
    }


    // ── 初始化 GPT-Image 卡池系统表及字段配置（受一次性迁移保护） ──
    once_migration!(pool, "init_gptimage_pool_tables_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('gptimage_pool', 'GPT-Image卡池系统', '管理多个GPT-Image来源账号，实现智能调度、配额限制与故障自动隔离', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#,
        r#"CREATE TABLE IF NOT EXISTS gptimage_pools (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            pool_type TEXT NOT NULL DEFAULT 'image',
            strategy TEXT NOT NULL DEFAULT 'random',
            is_active INTEGER NOT NULL DEFAULT 1,
            remark TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "COMMENT ON TABLE gptimage_pools IS 'GPT-Image卡池分组表'",
        "COMMENT ON COLUMN gptimage_pools.pool_type IS '卡池类型: image=图片, custom=自定义'",
        "COMMENT ON COLUMN gptimage_pools.strategy IS '调度策略: random=随机分布, sequential=顺序轮转'",
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
        )"#,
        "COMMENT ON TABLE gptimage_pool_accounts IS 'GPT-Image来源账号表'",
        "COMMENT ON COLUMN gptimage_pool_accounts.base_url IS '请求地址，如 https://api.openai.com'",
        "COMMENT ON COLUMN gptimage_pool_accounts.models IS '支持的模型列表，逗号分隔'",
        "COMMENT ON COLUMN gptimage_pool_accounts.quota_unit IS '配额计量单位: tokens=Token数, requests=请求次数, images=图片张数'",
        "COMMENT ON COLUMN gptimage_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽'",
        "COMMENT ON COLUMN gptimage_pool_accounts.daily_quota IS '每日配额上限(0=不限)'",
        "COMMENT ON COLUMN gptimage_pool_accounts.hourly_quota IS '每小时配额上限(0=不限)'",
        "COMMENT ON COLUMN gptimage_pool_accounts.period_quota IS '时段配额上限(0=不限)'",
        r#"CREATE TABLE IF NOT EXISTS gptimage_pool_account_mapping (
            pool_id INTEGER NOT NULL REFERENCES gptimage_pools(id) ON DELETE CASCADE,
            account_id INTEGER NOT NULL REFERENCES gptimage_pool_accounts(id) ON DELETE CASCADE,
            PRIMARY KEY (pool_id, account_id)
        )"#,
        "COMMENT ON TABLE gptimage_pool_account_mapping IS 'GPT-Image卡池与账号的多对多映射表'",
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
        )"#,
        "COMMENT ON TABLE gptimage_pool_logs IS 'GPT-Image卡池调度使用日志'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS gptimage_pool_id INTEGER",
        "COMMENT ON COLUMN channels.gptimage_pool_id IS '关联的GPT-Image卡池ID，为空表示不使用卡池'",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_name_key",
        "ALTER TABLE models DROP CONSTRAINT IF EXISTS models_model_id_key"
    );

    // ══════════════════════════════════════════════════════════════
    //  模型广场管理插件
    // ══════════════════════════════════════════════════════════════
    // ── 初始化站点图标库及流转计费日志扩展（受一次性迁移保护） ──
    once_migration!(pool, "init_site_icons_tables_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('model_marketplace', '模型广场管理', '管理模型广场的模型展示，控制哪些模型对用户可见并配置展示信息', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#,
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('site_icons', '站点icon图标库', '提供 AI/LLM 品牌 SVG 图标库，支持搜索选择和自定义上传，数据来源 lobehub/lobe-icons', 1, 'system_builtin')
           ON CONFLICT (name) DO NOTHING"#,
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
        )"#,
        "COMMENT ON TABLE site_icons IS '站点图标库，存储 SVG 图标元数据'",
        "COMMENT ON COLUMN site_icons.name IS '图标标识名（如 openai, claude）'",
        "COMMENT ON COLUMN site_icons.title IS '显示名称（如 OpenAI, Claude）'",
        "COMMENT ON COLUMN site_icons.file_path IS 'SVG 文件路径（相对于 data/assets/）'",
        "COMMENT ON COLUMN site_icons.source IS '图标来源: lobe-icons=从 GitHub 同步 / custom=手动上传'",
        "COMMENT ON COLUMN site_icons.category IS '分类: AI品牌 / 自定义'",
        "COMMENT ON COLUMN site_icons.tags IS '标签(JSON数组)'",
        r#"CREATE TABLE IF NOT EXISTS site_icon_sync_logs (
            id SERIAL PRIMARY KEY,
            total_synced INTEGER NOT NULL DEFAULT 0,
            total_new INTEGER NOT NULL DEFAULT 0,
            total_updated INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'success',
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
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
        "INSERT INTO model_providers (name, sort_order, is_system) VALUES ('可灵 AI', 4, 1) ON CONFLICT(name) DO UPDATE SET is_system = 1"
    );

    // ══════════════════════════════════════════════════════════════
    //  智能路由 (Router Flow) 插件
    // ══════════════════════════════════════════════════════════════
    // ── 初始化智能路由表及通道等级字段扩充（受一次性迁移保护） ──
    once_migration!(pool, "init_router_flow_tables_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('router_flow', '智能路由', '配置多个相同模型组成高可用路由组，支持价格优先、速度优先、稳定优先三种智能调度策略', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#,
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
        )"#,
        "COMMENT ON TABLE router_flow_groups IS '智能路由模型组表，用户创建的模型路由组'",
        "COMMENT ON COLUMN router_flow_groups.route_rule IS '路由策略: price=价格优先, speed=速度优先, stability=稳定优先'",
        "COMMENT ON COLUMN router_flow_groups.model_ids IS '绑定的模型 mid 列表(JSON数组)'",
        "CREATE INDEX IF NOT EXISTS idx_rf_groups_user ON router_flow_groups(user_id)",
        "ALTER TABLE router_flow_groups ADD COLUMN IF NOT EXISTS endpoint_id TEXT NOT NULL DEFAULT ''",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_rf_groups_endpoint ON router_flow_groups(endpoint_id) WHERE endpoint_id != ''",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS exclude_user_groups TEXT NOT NULL DEFAULT '[]'",
        "COMMENT ON COLUMN channels.exclude_user_groups IS '不支持的用户等级列表(JSON数组)，黑名单模式'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gift_balance DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS gift_used_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "COMMENT ON COLUMN users.gift_balance IS '赠送钱包余额，注册赠送/活动赠送等免费额度，消费时优先扣赠送余额'",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_used_at VARCHAR(30) DEFAULT NULL",
        "COMMENT ON COLUMN api_tokens.last_used_at IS '令牌最后使用时间'"
    );
    // ─── 统一将所有 INTEGER 列升级为 BIGINT，与 Rust 模型层 i64 对齐 ───
    once_migration!(pool, "upgrade_columns_to_bigint_v1",

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

    // recharge_records 新增 operator 字段（记录后台操作人员）和 wallet_type 字段（区分所属钱包），受一次性迁移保护
    once_migration!(pool, "recharge_records_wallet_fields_v1",
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS operator TEXT DEFAULT ''",
        "COMMENT ON COLUMN recharge_records.operator IS '操作人员用户名，后台手动操作时记录'",
        "ALTER TABLE recharge_records ADD COLUMN IF NOT EXISTS wallet_type TEXT NOT NULL DEFAULT 'system'",
        "COMMENT ON COLUMN recharge_records.wallet_type IS '所属钱包类型: system=系统钱包, gift=赠送钱包'"
    );



    // 迁移历史数据（受一次性迁移保护，仅执行一次，避免大表全扫描引起卡顿）
    // 1. 原 recharge_type='gift' 的记录归入赠送钱包
    // 2. 补充修复：registration（注册赠送）和 commission（邀请奖励）类型实际写入赠送钱包，
    //    但早期未正确设置 wallet_type，导致赠送钱包明细为空但余额不为零的数据不一致
    once_migration!(pool, "backfill_recharge_wallet_type_v1",
        "UPDATE recharge_records SET wallet_type = 'gift' WHERE recharge_type = 'gift' AND wallet_type = 'system'",
        "UPDATE recharge_records SET wallet_type = 'gift' WHERE recharge_type IN ('registration', 'commission') AND wallet_type = 'system'"
    );

    // ══════════════════════════════════════════════════════════════
    //  API服务商 (API Providers) 支持
    // ══════════════════════════════════════════════════════════════
    // ── 初始化API服务商与临时文件折扣锁定参数等表结构（受一次性迁移保护） ──
    once_migration!(pool, "init_api_providers_tables_v1",
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
        )"#,
        "COMMENT ON TABLE model_api_providers IS 'API服务商表（提供接口的服务商，区别于官方服务商）'",
        "ALTER TABLE models ADD COLUMN IF NOT EXISTS api_provider_id BIGINT REFERENCES model_api_providers(id)",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('site_portal', '站点门户', '提供站点内容的基本介绍，支持生成静态HTML页面用于SEO/GEO优化', 0, 'user')
           ON CONFLICT (name) DO NOTHING"#,
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS only_playground BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE api_tokens ALTER COLUMN only_playground TYPE BIGINT",
        "COMMENT ON COLUMN api_tokens.only_playground IS '是否仅限创作中心使用，1=是，0=否'",
        r#"CREATE TABLE IF NOT EXISTS tos_temp_files (
            id SERIAL PRIMARY KEY,
            object_key TEXT NOT NULL,
            channel_id INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'channel',
            expire_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_tos_temp_files_expire ON tos_temp_files (expire_at)",
        "ALTER TABLE tos_temp_files ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE tos_temp_files ALTER COLUMN channel_id TYPE BIGINT",
        "COMMENT ON TABLE tos_temp_files IS 'TOS临时文件过期追踪'",
        "COMMENT ON COLUMN tos_temp_files.object_key IS 'TOS对象键'",
        "COMMENT ON COLUMN tos_temp_files.channel_id IS '来源渠道ID'",
        "COMMENT ON COLUMN tos_temp_files.source IS '业务来源(channel=渠道存储)'",
        "COMMENT ON COLUMN tos_temp_files.expire_at IS '过期时间(ISO 8601)'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS model_discounts TEXT",
        "COMMENT ON COLUMN users.model_discounts IS '用户模型单独折扣(JSON: {mid: discount}), 优先于等级折扣, 受模型折扣限价约束'",
        r#"CREATE TABLE IF NOT EXISTS user_model_configs (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            model_mid TEXT NOT NULL,
            param_values TEXT NOT NULL DEFAULT '{}',
            is_locked INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text),
            UNIQUE(user_id, model_mid)
        )"#,
        "ALTER TABLE user_model_configs ALTER COLUMN id TYPE bigint",
        "CREATE INDEX IF NOT EXISTS idx_user_model_configs_user ON user_model_configs(user_id)",
        "COMMENT ON TABLE user_model_configs IS '用户在模型创作中心锁定的模型自定义参数配置'",
        "COMMENT ON COLUMN user_model_configs.user_id IS '用户ID'",
        "COMMENT ON COLUMN user_model_configs.model_mid IS '模型MID标识'",
        "COMMENT ON COLUMN user_model_configs.param_values IS '锁定的配置参数序列化JSON串'",
        "COMMENT ON COLUMN user_model_configs.is_locked IS '是否已锁定，1=是，0=否'",
        r#"CREATE TABLE IF NOT EXISTS happyhorse_logs (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            original_model TEXT NOT NULL,
            media_type TEXT NOT NULL,
            matched_model TEXT NOT NULL,
            status INTEGER NOT NULL,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            task_id TEXT,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_happyhorse_logs_created ON happyhorse_logs (created_at DESC)",
        "COMMENT ON TABLE happyhorse_logs IS '快乐小马智能路由转换日志表'",
        "COMMENT ON COLUMN happyhorse_logs.original_model IS '原始请求模型ID'",
        "COMMENT ON COLUMN happyhorse_logs.media_type IS '媒体类型(文生视频/图生视频/参考生视频/视频编辑)'",
        "COMMENT ON COLUMN happyhorse_logs.matched_model IS '路由分发的实际模型ID'",
        "ALTER TABLE happyhorse_logs ADD COLUMN IF NOT EXISTS log_id BIGINT",
        "COMMENT ON COLUMN happyhorse_logs.log_id IS '关联主日志表logs.id，用于JOIN获取完整请求/响应/计费信息'",
        "CREATE INDEX IF NOT EXISTS idx_happyhorse_logs_log_id ON happyhorse_logs (log_id)",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS request_payload",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS plugin_tag TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.plugin_tag IS '插件标记JSON，用于匹配规则展示和插件解耦'"
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

    // ── 初始化快乐小马智能路由系统配置及种子数据（受一次性迁移保护） ──
    once_migration!(pool, "init_happyhorse_router_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category)
           VALUES ('happyhorse_router', '快乐小马智能路由', '自动合并阿里云 DashScope happyhorse 的文生/图生/参考生/编辑视频 4 个模型，自动分发请求', 0, 'system')
           ON CONFLICT (name) DO NOTHING"#,
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
        )"#,
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
        r#"INSERT INTO happyhorse_configs (custom_model_name, custom_model_id, t2v_model, i2v_model, r2v_model, edit_model, routing_node, is_active)
           VALUES ('快乐小马智能路由', 'happyhorse-smart', 'happyhorse-1.0-t2v', 'happyhorse-1.0-i2v', 'happyhorse-1.0-r2v', 'happyhorse-1.0-video-edit', 'ephh-happyhorse', 1)
           ON CONFLICT (routing_node) DO NOTHING"#
    );

    // ── 初始化文件去重指纹与快乐小马微调及日志唯一标识字段（受一次性迁移保护） ──
    once_migration!(pool, "init_happyhorse_updates_v1",
        "ALTER TABLE playground_assets ADD COLUMN IF NOT EXISTS file_hash TEXT DEFAULT ''",
        "COMMENT ON COLUMN playground_assets.file_hash IS '文件内容SHA256哈希，用于幂等去重'",
        "CREATE INDEX IF NOT EXISTS idx_pg_assets_file_hash ON playground_assets(file_hash)",
        "ALTER TABLE plugin_assets ADD COLUMN IF NOT EXISTS meta_fingerprint VARCHAR(128)",
        "COMMENT ON COLUMN plugin_assets.meta_fingerprint IS 'HTTP HEAD元数据指纹(URL域名路径+Content-Length+ETag/Last-Modified的SHA-256)，用于大文件快速去重，避免下载完整文件'",
        "CREATE INDEX IF NOT EXISTS idx_plugin_assets_meta_fp ON plugin_assets (meta_fingerprint)",
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
        "ALTER TABLE happyhorse_logs ALTER COLUMN id TYPE BIGINT",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS status",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS latency_ms",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS error_message",
        "ALTER TABLE happyhorse_logs DROP COLUMN IF EXISTS task_id",
        "COMMENT ON TABLE happyhorse_logs IS '快乐小马智能路由转换日志表'",
        "UPDATE happyhorse_configs SET t2v_model = m.mid FROM models m WHERE happyhorse_configs.t2v_model = m.model_id AND happyhorse_configs.t2v_model != m.mid",
        "UPDATE happyhorse_configs SET i2v_model = m.mid FROM models m WHERE happyhorse_configs.i2v_model = m.model_id AND happyhorse_configs.i2v_model != m.mid",
        "UPDATE happyhorse_configs SET r2v_model = m.mid FROM models m WHERE happyhorse_configs.r2v_model = m.model_id AND happyhorse_configs.r2v_model != m.mid",
        "UPDATE happyhorse_configs SET edit_model = m.mid FROM models m WHERE happyhorse_configs.edit_model = m.model_id AND happyhorse_configs.edit_model != m.mid",
        "COMMENT ON COLUMN happyhorse_configs.t2v_model IS '绑定的文生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.i2v_model IS '绑定的图生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.r2v_model IS '绑定的参考生视频模型MID(不可变标识)'",
        "COMMENT ON COLUMN happyhorse_configs.edit_model IS '绑定的视频编辑模型MID(不可变标识)'",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS log_id TEXT",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_log_id ON logs (log_id)"
    );



    // 回填存量数据的 log_id（使用 前缀 + 时间戳hex + id hex 拼接，保证唯一且有序，仅执行一次避免大表全扫描卡顿）
    once_migration!(pool, "backfill_logs_log_id_v1",
        "UPDATE logs SET log_id = CASE \
            WHEN task_id IS NOT NULL AND task_id != '' \
                 AND action_type IS NOT NULL AND action_type NOT IN ('', '聊天') \
            THEN 'tsk_' || lpad(to_hex((EXTRACT(EPOCH FROM created_at::timestamp) * 1000)::bigint), 12, '0') || lpad(to_hex(id), 14, '0') \
            ELSE 'log_' || lpad(to_hex((EXTRACT(EPOCH FROM created_at::timestamp) * 1000)::bigint), 12, '0') || lpad(to_hex(id), 14, '0') \
        END \
        WHERE log_id IS NULL"
    );



    // 自动清洗历史失败日志的脏扣费数据（受一次性迁移保护）
    once_migration!(pool, "clean_dirty_logs_cost_20260609",
        "UPDATE logs SET cost = 0.0, pre_deduct_gift = 0.0 WHERE status_code < 200 OR status_code >= 400"
    );

    // 自动修复历史遗留的 users.used_quota 统计不准确问题（受一次性迁移保护）
    once_migration!(pool, "fix_used_quota_v2_20260609",
        "UPDATE users u SET \
         used_quota = COALESCE((SELECT SUM(cost) FROM logs l WHERE l.user_id = u.id), 0.0), \
         gift_used_quota = COALESCE((SELECT SUM(LEAST(cost, pre_deduct_gift)) FROM logs l WHERE l.user_id = u.id), 0.0) \
         WHERE u.used_quota > 0"
    );

    // 自动修复历史遗留的 users.balance 错误并进行真实余额校准（受一次性迁移保护）
    once_migration!(pool, "fix_users_balance_20260609",
        "UPDATE users u SET \
         balance = COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'system'), 0.0) - COALESCE((SELECT SUM(cost - pre_deduct_gift) FROM logs l WHERE l.user_id = u.id), 0.0), \
         gift_balance = GREATEST(COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'gift'), 0.0) - COALESCE((SELECT SUM(pre_deduct_gift) FROM logs l WHERE l.user_id = u.id), 0.0), 0.0) \
         WHERE EXISTS (SELECT 1 FROM logs WHERE user_id = u.id) OR EXISTS (SELECT 1 FROM recharge_records WHERE user_id = u.id)"
    );

    // 修复之前对于部分退款（cost < pre_deduct_gift）导致系统余额倒贴的漏洞并校准余额（受一次性迁移保护）
    once_migration!(pool, "fix_users_balance_v2_20260609",
        "UPDATE users u SET \
         balance = COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'system'), 0.0) - COALESCE((SELECT SUM(GREATEST(cost - pre_deduct_gift, 0.0)) FROM logs l WHERE l.user_id = u.id), 0.0), \
         gift_balance = GREATEST(COALESCE((SELECT SUM(amount) FROM recharge_records r WHERE r.user_id = u.id AND r.wallet_type = 'gift'), 0.0) - COALESCE((SELECT SUM(LEAST(cost, pre_deduct_gift)) FROM logs l WHERE l.user_id = u.id), 0.0), 0.0) \
         WHERE EXISTS (SELECT 1 FROM logs WHERE user_id = u.id) OR EXISTS (SELECT 1 FROM recharge_records WHERE user_id = u.id)"
    );

    // ── 营销、计费规则、渠道倍率与高可用令牌等扩展列定义，受一次性迁移保护 ──
    once_migration!(pool, "marketing_billing_channel_extensions_v1",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS members_can_set_pay BIGINT NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN marketing_teams.members_can_set_pay IS '团队成员是否可以设置推广用户的支付权限(0=否,1=是)'",
        "ALTER TABLE billing_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN billing_rules.sort_order IS '排序，数字越大越靠前'",
        "ALTER TABLE forward_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN forward_rules.sort_order IS '排序序号，数字越大越靠前'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN channels.rate IS '倍率'",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS rate DOUBLE PRECISION NOT NULL DEFAULT 1.0",
        "COMMENT ON COLUMN channel_configs.rate IS '倍率'",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS high_availability INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN api_tokens.high_availability IS '是否开启高可用密钥功能(0=禁用,1=启用)'"
    );

    // ── 初始化高可用密钥渠道、指纹与令牌维度限额结构及内置配置（受一次性迁移保护） ──
    once_migration!(pool, "init_high_availability_updates_v1",
        r#"INSERT INTO plugins (name, title, description, is_enabled, category, allowed_levels, created_at, updated_at)
           VALUES ('high_availability_channel', '高可用上游渠道系统插件', '启用后，支持管理后台配置高可用渠道组，支持多上游自动防灾切换与按子渠道倍率计费模式。', 1, 'system_builtin', 'all', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (name) DO NOTHING"#,
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES
           ('high_availability_channel', 'ha_max_retries', '3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('high_availability_channel', 'ha_cooldown_429', '60', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('high_availability_channel', 'ha_cooldown_network', '300', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('high_availability_channel', 'ha_cooldown_auth', '1800', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#,
        "UPDATE users SET username = SUBSTRING(username FROM 1 FOR 48) WHERE char_length(username) > 48",
        "UPDATE users SET nickname = SUBSTRING(nickname FROM 1 FOR 24) WHERE char_length(nickname) > 24",
        "ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(48)",
        "ALTER TABLE users ALTER COLUMN nickname TYPE VARCHAR(24)",
        "UPDATE api_tokens SET name = CASE WHEN SUBSTRING(REGEXP_REPLACE(name, '[^\\w ]|_', '', 'g') FROM 1 FOR 36) = '' THEN 'default' ELSE SUBSTRING(REGEXP_REPLACE(name, '[^\\w ]|_', '', 'g') FROM 1 FOR 36) END WHERE name !~ '^([^\\W_]| )+$' OR CHAR_LENGTH(name) > 36",
        "ALTER TABLE api_tokens DROP CONSTRAINT IF EXISTS chk_api_tokens_name",
        "ALTER TABLE api_tokens ADD CONSTRAINT chk_api_tokens_name CHECK (char_length(name) <= 36 AND name ~ '^([^\\W_]| )+$')",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS daily_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS daily_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS weekly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS weekly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS monthly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS monthly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_day TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_week TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS last_reset_month TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN channel_configs.priority IS '请求优先级'",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 1",
        "COMMENT ON COLUMN channel_configs.weight IS '请求权重'",
        "UPDATE plugins SET category = 'system_builtin', is_enabled = 1 WHERE name IN ('high_availability_channel', 'site_icons')"
    );

    // ── 火山引擎画质增强与字幕擦除插件条件编译迁移 ──
    #[cfg(feature = "plugin_volcengine_enhance")]
    {
        let volc_enhance_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'volcengine_enhance_init_v1'")
            .fetch_one(pool)
            .await
            .unwrap_or(0);
        if volc_enhance_done == 0 {
            tracing::info!("开始执行火山引擎画质增强与字幕擦除插件迁移与初始化...");
            // 1. 注册插件 (指定 category = 'system', 标识为系统增强插件，此处加上数据库字段意义的备注说明方便维护)
            let _ = sqlx::query(
                "INSERT INTO plugins (name, title, description, is_enabled, allowed_levels, category, created_at, updated_at) \
                 VALUES ('volcengine_enhance', '火山引擎 AI MediaKit 插件', \
                 '集成火山引擎 AI MediaKit，提供视频画质增强（标准版、专业版、极速版、大模型版）与字幕擦除（标准版、精细版）能力，支持按规格阶梯计费。', \
                 0, 'all', 'system', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
                 ON CONFLICT (name) DO UPDATE SET title = EXCLUDED.title"
            ).execute(pool).await;

            // 兼容处理：对于已经插入过的旧记录，更新插件的显示标题名称
            let _ = sqlx::query(
                "UPDATE plugins SET title = '火山引擎 AI MediaKit 插件' WHERE name = 'volcengine_enhance'"
            ).execute(pool).await;

            // 2. 批量拉取映射 ID，规避复杂嵌套子查询，确保服务商、API 提供商和模型类型都获取到
            let volc_provider_id: Option<i64> = sqlx::query_scalar(
                "SELECT id FROM model_providers WHERE name = '火山引擎' LIMIT 1"
            ).fetch_optional(pool).await.unwrap_or(None);

            let volc_api_provider_id: Option<i64> = sqlx::query_scalar(
                "SELECT id FROM model_api_providers WHERE name ILIKE '%火山%' OR name ILIKE '%volcengine%' LIMIT 1"
            ).fetch_optional(pool).await.unwrap_or(None);

            // 获取"视频增强"类型 ID（用于 6 个预置模型）
            let enhance_type_id: Option<i64> = sqlx::query_scalar(
                "SELECT id FROM model_types WHERE name = '视频增强' LIMIT 1"
            ).fetch_optional(pool).await.unwrap_or(None);

            // 注册 4 个细分版本的视频画质计费规则 (按秒换算)
            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频画质增强 (标准版)', 'duration', 0.0, 0.0, 0.0, 0.0125, 'video_quality', \
                 '[{\"resolution\":\"720p\",\"fps_range\":\"<=30\",\"rate\":0.0125,\"enabled\":true},{\"resolution\":\"720p\",\"fps_range\":\">30\",\"rate\":0.025,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\"<=30\",\"rate\":0.025,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\">30\",\"rate\":0.05,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\"<=30\",\"rate\":0.05,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\">30\",\"rate\":0.10,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\"<=30\",\"rate\":0.10,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\">30\",\"rate\":0.20,\"enabled\":true}]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (标准版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频画质增强 (专业版)', 'duration', 0.0, 0.0, 0.0, 0.125, 'video_quality', \
                 '[{\"resolution\":\"720p\",\"fps_range\":\"<=30\",\"rate\":0.125,\"enabled\":true},{\"resolution\":\"720p\",\"fps_range\":\">30\",\"rate\":0.25,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\"<=30\",\"rate\":0.25,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\">30\",\"rate\":0.50,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\"<=30\",\"rate\":0.50,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\">30\",\"rate\":1.00,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\"<=30\",\"rate\":1.00,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\">30\",\"rate\":2.00,\"enabled\":true}]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (专业版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频画质增强 (极速版)', 'duration', 0.0, 0.0, 0.0, 0.00333333, 'video_quality', \
                 '[{\"resolution\":\"720p\",\"fps_range\":\"<=30\",\"rate\":0.00333333,\"enabled\":true},{\"resolution\":\"720p\",\"fps_range\":\">30\",\"rate\":0.00666667,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\"<=30\",\"rate\":0.00666667,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\">30\",\"rate\":0.01333333,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\"<=30\",\"rate\":0.01333333,\"enabled\":true},{\"resolution\":\"2k\",\"fps_range\":\">30\",\"rate\":0.02666667,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\"<=30\",\"rate\":0.02666667,\"enabled\":true},{\"resolution\":\"4k\",\"fps_range\":\">30\",\"rate\":0.05333333,\"enabled\":true}]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (极速版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频画质增强 (大模型版)', 'duration', 0.0, 0.0, 0.0, 0.04166667, 'video_quality', \
                 '[{\"resolution\":\"720p\",\"fps_range\":\"<=30\",\"rate\":0.04166667,\"enabled\":true},{\"resolution\":\"720p\",\"fps_range\":\">30\",\"rate\":0.08333333,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\"<=30\",\"rate\":0.08333333,\"enabled\":true},{\"resolution\":\"1080p\",\"fps_range\":\">30\",\"rate\":0.16666667,\"enabled\":true}]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (大模型版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let rule_id_standard: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (标准版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_professional: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (专业版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_fast: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (极速版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_generative: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频画质增强 (大模型版)'").fetch_optional(pool).await.unwrap_or(None);

            // 注册 2 个细分版本的字幕擦除计费规则 (按秒换算)
            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频字幕擦除 (标准版)', 'duration', 0.0, 0.0, 0.0, 0.00666667, 'standard', \
                 '[]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频字幕擦除 (标准版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let _ = sqlx::query(
                "INSERT INTO billing_rules (name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_system, provider_id, type_id) \
                 SELECT '火山 MediaKit 视频字幕擦除 (精细版)', 'duration', 0.0, 0.0, 0.0, 0.01666667, 'standard', \
                 '[]', \
                 '{}', 1, $1, $2 \
                 WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE name = '火山 MediaKit 视频字幕擦除 (精细版)')"
            )
            .bind(volc_provider_id)
            .bind(enhance_type_id)
            .execute(pool).await;

            let rule_id_erase_standard: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频字幕擦除 (标准版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_erase_pro: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山 MediaKit 视频字幕擦除 (精细版)'").fetch_optional(pool).await.unwrap_or(None);

            // 3. 注册 4 个火山 MediaKit 内置转发规则，使用安全的 WHERE NOT EXISTS 语法防重，避开 ON CONFLICT 报错
            let preset_rules = vec![
                (
                    "火山 MediaKit 视频画质增强 (标准/专业版)",
                    "volcengine",
                    "火山画质增强标准版与专业版通用转发规则，自动进行路径和请求体参数转换，支持异步任务轮询。",
                    r#"{"mode":"transform","target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#
                ),
                (
                    "火山 MediaKit 视频画质增强 (极速版)",
                    "volcengine",
                    "火山画质增强极速版专用转发规则，自动转发至 enhance-video-fast，支持异步任务轮询。",
                    r#"{"mode":"transform","target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video-fast"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#
                ),
                (
                    "火山 MediaKit 视频画质增强 (大模型版)",
                    "volcengine",
                    "火山画质增强大模型版专用转发规则，自动转发至 enhance-video-generative，支持异步任务轮询。",
                    r#"{"mode":"transform","target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/enhance-video-generative"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#
                ),
                (
                    "火山 MediaKit 视频字幕擦除",
                    "volcengine",
                    "火山视频字幕擦除（标准/精细版）通用转发规则，自动转发至 erase-video-subtitle，支持异步任务轮询。",
                    r#"{"mode":"transform","target_type":"volcengine_media_enhance","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/tools/erase-video-subtitle"},"poll_path":"/api/v1/tasks/${task_id}","auth_type":"bearer"}"#
                )
            ];

            for (name, rtype, desc, config) in &preset_rules {
                let _ = sqlx::query(
                    "INSERT INTO forward_rules (name, rule_type, description, config_json, category, is_system) \
                     SELECT $1, $2, $3, $4, '视频', 1 \
                     WHERE NOT EXISTS (SELECT 1 FROM forward_rules WHERE name = $1)"
                )
                .bind(name).bind(rtype).bind(desc).bind(config)
                .execute(pool).await;
            }

            // 4. 获取刚注册好的内置规则 ID 映射
            let rule_id_sd_pf: Option<i64> = sqlx::query_scalar("SELECT id FROM forward_rules WHERE name = '火山 MediaKit 视频画质增强 (标准/专业版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_ft: Option<i64> = sqlx::query_scalar("SELECT id FROM forward_rules WHERE name = '火山 MediaKit 视频画质增强 (极速版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_gt: Option<i64> = sqlx::query_scalar("SELECT id FROM forward_rules WHERE name = '火山 MediaKit 视频画质增强 (大模型版)'").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_erase: Option<i64> = sqlx::query_scalar("SELECT id FROM forward_rules WHERE name = '火山 MediaKit 视频字幕擦除'").fetch_optional(pool).await.unwrap_or(None);

            // 5. 初始化 6 个画质增强预置模型，显式绑定 provider_id (火山引擎) 、默认转发规则 forward_rule_ids 以及默认计费规则 billing_rule_id
            let preset_models = vec![
                ("vve-sd", "火山画质增强-标准版", "volc_video_enhance_standard", rule_id_sd_pf, rule_id_standard),
                ("vve-pf", "火山画质增强-专业版", "volc_video_enhance_professional", rule_id_sd_pf, rule_id_professional),
                ("vve-ft", "火山画质增强-极速版", "volc_video_enhance_fast", rule_id_ft, rule_id_fast),
                ("vve-gt", "火山画质增强-大模型版", "volc_video_enhance_generative", rule_id_gt, rule_id_generative),
                ("vvs-er", "火山字幕擦除-标准版", "volc_video_subtitle_erase", rule_id_erase, rule_id_erase_standard),
                ("vvs-ep", "火山字幕擦除-精细版", "volc_video_subtitle_erase_pro", rule_id_erase, rule_id_erase_pro),
            ];

            for (mid, name, model_id, rule_id, billing_rule_id) in &preset_models {
                let rule_ids_json = rule_id.map(|id| format!("[{}]", id));
                let _ = sqlx::query(
                    "INSERT INTO models (mid, name, model_id, provider_id, api_provider_id, type_id, forward_rule_ids, billing_rule_id, is_active, \
                     remark, created_at, updated_at) \
                     SELECT $1, $2, $3, $4, $5, $6, $7, $8, 0, '火山引擎画质增强/字幕擦除插件预置模型，请勿删除', \
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP \
                     WHERE NOT EXISTS (SELECT 1 FROM models WHERE mid = $1)"
                )
                .bind(mid).bind(name).bind(model_id)
                .bind(volc_provider_id)
                .bind(volc_api_provider_id)
                .bind(enhance_type_id)
                .bind(rule_ids_json)
                .bind(billing_rule_id)
                .execute(pool).await;
            }

            // 5.5 初始化两个豆包级联画质增强模型种子数据，强制绑定到级联计费规则与转发规则
            let video_type_id: Option<i64> = sqlx::query_scalar("SELECT id FROM model_types WHERE name = '视频' LIMIT 1").fetch_optional(pool).await.unwrap_or(None);
            let rule_id_cascade_billing: Option<i64> = sqlx::query_scalar("SELECT id FROM billing_rules WHERE name = '火山级联画质增强默认计费' LIMIT 1").fetch_optional(pool).await.unwrap_or(None);

            let cascade_models = vec![
                ("dbs-sr", "豆包 Seedance 2.0 (画质增强级联)", "Doubao-seedance-2-0-sr", "doubao-seedance-2-0-260128", 30.0),
                ("dbs-fs", "豆包 Seedance 2.0 极速版 (画质增强级联)", "Doubao-seedance-2-0-fast-sr", "doubao-seedance-2-0-fast-260128", 30.0),
            ];

            for (mid, name, model_id, alias, pre_deduct) in &cascade_models {
                let _ = sqlx::query(
                    "INSERT INTO models (mid, name, model_id, model_id_alias, provider_id, api_provider_id, type_id, group_ratios, billing_rule_id, pre_deduction, is_active, remark, created_at, updated_at) \
                     SELECT $1, $2, $3, $4, $5, $6, $7, '{\"default\":1.0}', $8, $9, 0, '火山方舟级联画质增强模型，请勿删除', \
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP \
                     WHERE NOT EXISTS (SELECT 1 FROM models WHERE mid = $1)"
                )
                .bind(mid).bind(name).bind(model_id).bind(alias)
                .bind(volc_provider_id)
                .bind(volc_api_provider_id)
                .bind(video_type_id)
                .bind(rule_id_cascade_billing)
                .bind(pre_deduct)
                .execute(pool).await;
            }

            let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('volcengine_enhance_init_v1')").execute(pool).await;
            tracing::info!("火山引擎画质增强插件初始化完成");
        }
    }


    // 7. PostgreSQL 18.4 专用性能与稳定性优化：引入覆盖索引（Covering Indexes）加速大表查询与统计（受一次性迁移保护）
    once_migration!(pool, "pg18_performance_optimizations_v1",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_dashboard_covering ON logs (user_id, created_at DESC) INCLUDE (cost, prompt_tokens, completion_tokens, cached_tokens)",
        "CREATE INDEX IF NOT EXISTS idx_logs_admin_dashboard_covering ON logs (created_at DESC) INCLUDE (cost, prompt_tokens, completion_tokens, cached_tokens)"
    );

    // 8. 将 'playground' 插件的 title 从 '模型体验中心' 修改为 '模型创作中心'（受一次性迁移保护）
    once_migration!(pool, "rename_playground_title_to_creation_center_20260621",
        "UPDATE plugins SET title = '模型创作中心' WHERE name = 'playground'"
    );

    // 9. 将系统默认菜单配置中 '/playground' 的 label_zh 从 '体验中心' 或 '操场' 修改为 '创作中心'（受一次性迁移保护）
    once_migration!(pool, "update_menu_playground_label_to_creation_center_20260621",
        "UPDATE settings SET value = replace(\
            replace(\
                replace(\
                    replace(value, '\"label_zh\":\"体验中心\"', '\"label_zh\":\"创作中心\"'), \
                    '\"label_zh\": \"体验中心\"', '\"label_zh\": \"创作中心\"'\
                ), \
                '\"label_zh\":\"操场\"', '\"label_zh\":\"创作中心\"'\
            ), \
            '\"label_zh\": \"操场\"', '\"label_zh\": \"创作中心\"'\
        ) WHERE key = 'menu_config_settings'"
    );

    // ── DocsApi 站点 API 教程文档增强插件初始化 ──
    let docs_api_init_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'docs_api_init_v5'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if docs_api_init_done == 0 {
        // 1. 创建 plugin_docs 表
        let _ = sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS plugin_docs (
                id SERIAL PRIMARY KEY,
                parent_id INTEGER NULL REFERENCES plugin_docs(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                content TEXT DEFAULT '',
                is_dir INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                slug VARCHAR(255) DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (now()::text),
                updated_at TEXT NOT NULL DEFAULT (now()::text)
            )"#
        ).execute(pool).await;

        // 2. 提前创建 plugin_docs_intl 国际化表，保证种子数据 seed_default_docs_direct 可以顺利写入翻译数据
        let _ = sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS plugin_docs_intl (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER NOT NULL REFERENCES plugin_docs(id) ON DELETE CASCADE,
                lang VARCHAR(10) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (now()::text),
                updated_at TEXT NOT NULL DEFAULT (now()::text),
                UNIQUE(doc_id, lang)
            )"#
        ).execute(pool).await;

        // 3. 注册 docs_api 插件
        let _ = sqlx::query(
            "INSERT INTO plugins (name, title, description, is_enabled, allowed_levels, category, created_at, updated_at) \
             VALUES ('docs_api', 'DocsApi文档', '提供站点 API 教程的文档管理系统，支持多级目录大纲与 Markdown 内容手动编辑。', 1, 'all', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
             ON CONFLICT (name) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description"
        ).execute(pool).await;

        // 4. 写入初始数据
        if let Err(e) = crate::api::docs_api::seed_default_docs_direct(pool).await {
            tracing::error!("Failed to seed default docs: {:?}", e);
        }

        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('docs_api_init_v5')").execute(pool).await;
        tracing::info!("✅ DocsApi 文档插件初始化完成");
    }

    // ── DocsApi 插件新增 slug 字段（受一次性迁移保护） ──
    once_migration!(pool, "docs_api_add_slug_v1",
        "ALTER TABLE plugin_docs ADD COLUMN IF NOT EXISTS slug VARCHAR(255) DEFAULT ''"
    );

    // ── DocsApi 国际化翻译表初始化 ──
    let docs_api_intl_init_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'docs_api_intl_init_v1'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if docs_api_intl_init_done == 0 {
        let _ = sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS plugin_docs_intl (
                id SERIAL PRIMARY KEY,
                doc_id INTEGER NOT NULL REFERENCES plugin_docs(id) ON DELETE CASCADE,
                lang VARCHAR(10) NOT NULL,
                title VARCHAR(255) NOT NULL,
                content TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (now()::text),
                updated_at TEXT NOT NULL DEFAULT (now()::text),
                UNIQUE(doc_id, lang)
            )"#
        ).execute(pool).await;

        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('docs_api_intl_init_v1')").execute(pool).await;
        tracing::info!("✅ DocsApi 国际化翻译表初始化完成");
    }

    // ── 级联转发规则补充默认 res_mul（分辨率倍率，缺省 1.0 不影响现网计价）──
    once_migration!(pool, "cascade_res_mul_v1",
        r#"UPDATE forward_rules
           SET config_json = (COALESCE(config_json::jsonb, '{}'::jsonb) || '{"res_mul":{"720p":2.15,"1080p":2.25,"2k":2.5,"4k":4.0}}'::jsonb)::text
           WHERE name = '火山方舟 级联视频生成'
             AND (config_json::jsonb -> 'res_mul') IS NULL"#
    );

    // ── playground_projects 新增 is_pinned 字段（受一次性迁移保护） ──
    once_migration!(pool, "pg_projects_add_is_pinned_v1",
        "ALTER TABLE playground_projects ADD COLUMN IF NOT EXISTS is_pinned INTEGER NOT NULL DEFAULT 0"
    );

    // ── logs 表新增 is_completed 字段：标识任务是否已终结 ──
    // ── 初始化日志终结标记及条件索引（受一次性迁移保护） ──
    once_migration!(pool, "logs_add_is_completed_v1",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS is_completed SMALLINT NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN logs.is_completed IS '任务是否已终结(1=已完成,0=进行中或待结算)'",
        "UPDATE logs SET is_completed = 1 WHERE is_completed = 0 AND (billing_detail IS NULL OR billing_detail NOT LIKE '%冻结%')",
        "CREATE INDEX IF NOT EXISTS idx_logs_is_completed_pending ON logs (id DESC) WHERE is_completed = 0",
        "UPDATE logs SET is_completed = 1 WHERE is_completed = 0 AND (billing_detail LIKE '[测试渠道，不扣费]%' OR endpoint LIKE 'test|%')"
    );

    // ── DocsApi 火山素材库文档初始化 ──
    let insert_volcengine_assets_docs_done: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sys_migration_history WHERE id = 'insert_volcengine_assets_docs_v2'")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if insert_volcengine_assets_docs_done == 0 {
        // 1. 清理可能残留的旧一级目录 'volcengine-assets'
        let _ = sqlx::query("DELETE FROM plugin_docs WHERE slug = 'volcengine-assets'").execute(pool).await;
        // 2. 清理可能已插入的文章，防止唯一性约束报错
        let _ = sqlx::query("DELETE FROM plugin_docs WHERE slug = 'volcengine-assets-guide'").execute(pool).await;
        // 3. 调用将文章挂载到 'volcengine-ark' 目录下的方法
        crate::api::docs_api::seed_volcengine_assets_docs_only(pool).await?;
        let _ = sqlx::query("INSERT INTO sys_migration_history (id) VALUES ('insert_volcengine_assets_docs_v2')").execute(pool).await;
        tracing::info!("✅ DocsApi 火山素材库文档初始化成功");
    }

    // ── 统一合并的零散 DML 一次性回填 ──
    once_migration!(pool, "backfill_misc_data_v1",
        "UPDATE user_levels SET is_default = 1 WHERE group_key = 'default' AND NOT EXISTS (SELECT 1 FROM user_levels WHERE is_default = 1)",
        "UPDATE forward_rules SET category = '音频' WHERE category = '语音'",
        "UPDATE forward_rules SET rule_type = 'aliyun' WHERE name LIKE '%阿里百炼%' AND rule_type != 'aliyun'",
        "UPDATE forward_rules SET config_json = '{\"mode\":\"transform\",\"target_type\":\"anthropic\",\"path_rewrite\":{\"old\":\"/v1/chat/completions\",\"new\":\"/v1/messages\"},\"auth_type\":\"x-api-key\"}', description = '将 OpenAI 格式请求转换为 Anthropic Messages API 格式，接口 /v1/messages' WHERE name = 'Anthropic 原生转化' AND is_system = 1",
        "UPDATE forward_rules SET eid = '1' || floor(random() * 9000 + 1000)::text WHERE eid = '' OR eid IS NULL",
        "UPDATE billing_rules SET pid = '7' || floor(random() * 9000 + 1000)::text WHERE is_system = 1 AND (pid = '' OR pid IS NULL)",
        "UPDATE billing_rules SET pid = '6' || floor(random() * 9000 + 1000)::text WHERE is_system = 0 AND (pid = '' OR pid IS NULL)",
        "UPDATE channel_configs SET yid = '3' || floor(random() * 9000 + 1000)::text WHERE yid = '' OR yid IS NULL",
        "UPDATE model_types SET logo = 'sora' WHERE name = '视频' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'midjourney' WHERE name = '图片' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'suno' WHERE name = '音频' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'chatgpt' WHERE name = '聊天' AND (logo IS NULL OR logo = '')",
        "UPDATE model_types SET logo = 'volcengine', remark = '视频画质增强与字幕擦除处理模型', sort_order = 35 WHERE name = '视频增强' AND (logo IS NULL OR logo = '' OR remark IS NULL OR remark = '')"
    );

    // ── usage_daily_stats 每日使用统计落地表及 logs 高性能查询索引（受一次性迁移保护） ──
    once_migration!(pool, "add_usage_daily_stats_v1",
        r#"CREATE TABLE IF NOT EXISTS usage_daily_stats (
            id BIGSERIAL PRIMARY KEY,
            stat_date DATE NOT NULL,
            user_id TEXT NOT NULL,
            model TEXT NOT NULL,
            token_id BIGINT NOT NULL DEFAULT -1,
            channel_id BIGINT NOT NULL DEFAULT -1,
            action_type TEXT NOT NULL DEFAULT '',
            total_requests BIGINT NOT NULL DEFAULT 0,
            total_tokens BIGINT NOT NULL DEFAULT 0,
            total_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            total_pre_deduct_gift DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            success_count BIGINT NOT NULL DEFAULT 0,
            fail_count BIGINT NOT NULL DEFAULT 0,
            ext_json JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )"#,
        "COMMENT ON TABLE usage_daily_stats IS '使用量每日统计表 (Lambda 离线统计落地表)'",
        "COMMENT ON COLUMN usage_daily_stats.id IS '自增主键'",
        "COMMENT ON COLUMN usage_daily_stats.stat_date IS '统计日期 (YYYY-MM-DD)'",
        "COMMENT ON COLUMN usage_daily_stats.user_id IS '用户ID'",
        "COMMENT ON COLUMN usage_daily_stats.model IS '模型名称'",
        "COMMENT ON COLUMN usage_daily_stats.token_id IS '令牌ID (-1代表无令牌)'",
        "COMMENT ON COLUMN usage_daily_stats.channel_id IS '渠道ID (-1代表无渠道)'",
        "COMMENT ON COLUMN usage_daily_stats.action_type IS '动作类型(聊天,图片,视频等)'",
        "COMMENT ON COLUMN usage_daily_stats.total_requests IS '总请求数'",
        "COMMENT ON COLUMN usage_daily_stats.total_tokens IS '总消费 tokens 数量'",
        "COMMENT ON COLUMN usage_daily_stats.total_cost IS '总消费金额'",
        "COMMENT ON COLUMN usage_daily_stats.total_pre_deduct_gift IS '总消费赠送余额金额'",
        "COMMENT ON COLUMN usage_daily_stats.success_count IS '状态码 2xx 的成功请求数'",
        "COMMENT ON COLUMN usage_daily_stats.fail_count IS '状态码非 2xx 的失败请求数'",
        "COMMENT ON COLUMN usage_daily_stats.ext_json IS '扩展元数据 JSONB (供未来新指标无感扩展使用)'",
        "CREATE UNIQUE INDEX IF NOT EXISTS uidx_usage_daily_stats_dims ON usage_daily_stats (stat_date, user_id, model, token_id, channel_id, action_type)",
        "CREATE INDEX IF NOT EXISTS idx_usage_daily_stats_date_user ON usage_daily_stats (stat_date, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at_timestamptz ON logs (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_user_created_timestamptz ON logs (user_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_date_created_at ON logs ((SUBSTRING(created_at FROM 1 FOR 10)))",
        "CREATE INDEX IF NOT EXISTS idx_logs_stats_opt ON logs (user_id, created_at DESC) INCLUDE (cost, status_code, pre_deduct_gift)",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at_stats_opt ON logs (created_at DESC) INCLUDE (cost, status_code, pre_deduct_gift)"
    );

    once_migration!(pool, "add_ha_cooldown_404_v2",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('high_availability_channel', 'ha_cooldown_404', '3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) 
           DO UPDATE SET config_value = '3', updated_at = CURRENT_TIMESTAMP 
           WHERE plugin_configs.config_value = '10'"#
    );

    // ── 火山方舟视频监控插件：主账号、Endpoint绑定、视频任务、分账账单 ──
    once_migration!(pool, "add_volc_ark_monitor_v1",
        // 主账号凭证表（支持多火山账号）
        r#"CREATE TABLE IF NOT EXISTS ark_accounts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            volc_account_id TEXT NOT NULL DEFAULT '',
            access_key TEXT NOT NULL,
            secret_key TEXT NOT NULL,
            region TEXT NOT NULL DEFAULT 'cn-beijing',
            remark TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )"#,
        "COMMENT ON TABLE ark_accounts IS '火山方舟主账号凭证表（AK/SK）'",
        "COMMENT ON COLUMN ark_accounts.id IS '自增主键'",
        "COMMENT ON COLUMN ark_accounts.name IS '账号别名，全局唯一'",
        "COMMENT ON COLUMN ark_accounts.volc_account_id IS '火山官方账号ID (AccountId)'",
        "COMMENT ON COLUMN ark_accounts.access_key IS '火山引擎 AccessKey'",
        "COMMENT ON COLUMN ark_accounts.secret_key IS '火山引擎 SecretKey'",
        "COMMENT ON COLUMN ark_accounts.region IS 'API调用区域，默认cn-beijing'",
        "COMMENT ON COLUMN ark_accounts.remark IS '管理员备注'",
        // Endpoint与内部用户的绑定关系表
        r#"CREATE TABLE IF NOT EXISTS ark_endpoint_bindings (
            id SERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES ark_accounts(id) ON DELETE CASCADE,
            endpoint_id TEXT NOT NULL,
            user_uid TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            limit_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            used_quota DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            status INTEGER NOT NULL DEFAULT 1,
            remark TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, endpoint_id)
        )"#,
        "COMMENT ON TABLE ark_endpoint_bindings IS '火山方舟Endpoint与内部用户的绑定关系'",
        "COMMENT ON COLUMN ark_endpoint_bindings.id IS '自增主键'",
        "COMMENT ON COLUMN ark_endpoint_bindings.account_id IS '关联的主账号ID'",
        "COMMENT ON COLUMN ark_endpoint_bindings.endpoint_id IS '火山方舟接入点ID (ep-xxxx)'",
        "COMMENT ON COLUMN ark_endpoint_bindings.user_uid IS '关联的内部用户UID'",
        "COMMENT ON COLUMN ark_endpoint_bindings.api_key IS '绑定的火山方舟静态API Key'",
        "COMMENT ON COLUMN ark_endpoint_bindings.limit_quota IS '消费额度上限(元)，0=不限制'",
        "COMMENT ON COLUMN ark_endpoint_bindings.used_quota IS '已消费金额(元)，由分账账单同步更新'",
        "COMMENT ON COLUMN ark_endpoint_bindings.status IS '状态: 1=正常 0=已熔断停用'",
        "COMMENT ON COLUMN ark_endpoint_bindings.remark IS '管理员备注'",
        "CREATE INDEX IF NOT EXISTS idx_ark_bindings_user ON ark_endpoint_bindings(user_uid)",
        "CREATE INDEX IF NOT EXISTS idx_ark_bindings_endpoint ON ark_endpoint_bindings(endpoint_id)",
        // 视频任务缓存表（拉取自ListVideos）
        r#"CREATE TABLE IF NOT EXISTS ark_video_tasks (
            id BIGSERIAL PRIMARY KEY,
            account_id INTEGER NOT NULL,
            endpoint_id TEXT NOT NULL DEFAULT '',
            task_id TEXT NOT NULL UNIQUE,
            model TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            duration DOUBLE PRECISION,
            resolution TEXT NOT NULL DEFAULT '',
            created_time TEXT NOT NULL DEFAULT '',
            split_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_estimated BOOLEAN NOT NULL DEFAULT TRUE,
            total_tokens BIGINT NOT NULL DEFAULT 0,
            synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            raw_response JSONB NOT NULL DEFAULT '{}'
        )"#,
        "COMMENT ON TABLE ark_video_tasks IS '火山方舟视频任务缓存(来自ListVideos API)'",
        "COMMENT ON COLUMN ark_video_tasks.id IS '自增主键'",
        "COMMENT ON COLUMN ark_video_tasks.account_id IS '所属主账号ID'",
        "COMMENT ON COLUMN ark_video_tasks.endpoint_id IS '归属接入点ID'",
        "COMMENT ON COLUMN ark_video_tasks.task_id IS '火山视频任务唯一ID'",
        "COMMENT ON COLUMN ark_video_tasks.model IS '使用的底座模型名称'",
        "COMMENT ON COLUMN ark_video_tasks.status IS '任务状态(succeed/failed/running等)'",
        "COMMENT ON COLUMN ark_video_tasks.duration IS '视频时长(秒)'",
        "COMMENT ON COLUMN ark_video_tasks.resolution IS '视频分辨率'",
        "COMMENT ON COLUMN ark_video_tasks.created_time IS '火山侧创建时间'",
        "COMMENT ON COLUMN ark_video_tasks.split_amount IS '对应的分账账单消费金额(元)'",
        "COMMENT ON COLUMN ark_video_tasks.is_estimated IS '消费金额是否为估算值(true=估算, false=账单确认)'",
        "COMMENT ON COLUMN ark_video_tasks.total_tokens IS '视频生成消耗的总 token 数'",
        "COMMENT ON COLUMN ark_video_tasks.raw_response IS '火山方舟视频返回的所有原始响应JSON(大字段)'",
        "CREATE INDEX IF NOT EXISTS idx_ark_video_tasks_endpoint ON ark_video_tasks(endpoint_id)",
        "CREATE INDEX IF NOT EXISTS idx_ark_video_tasks_account ON ark_video_tasks(account_id)",
        // 废弃并清理原账单表
        "DROP TABLE IF EXISTS ark_split_bills CASCADE",
        // 注册插件记录
        r#"INSERT INTO plugins (name, title, description, is_enabled, category, created_at, updated_at)
           VALUES ('volcengine_ark_monitor', '火山方舟视频监控', '基于火山方舟接入点(Endpoint)的视频任务与分账账单精密监控及超额熔断控制', 0, 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (name) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category"#
    );

    // 新增用户信用额度限制和支付启用字段，修复最新代码与老版本数据库表结构不一致的问题
    once_migration!(pool, "add_user_credit_limit_and_pay_fields_v1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_limit DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS pay_enabled INTEGER NOT NULL DEFAULT 1"
    );

    once_migration!(pool, "add_channel_config_id_to_logs_v1",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS channel_config_id INTEGER"
    );

    once_migration!(pool, "add_yid_to_logs_v1",
        "ALTER TABLE logs ADD COLUMN IF NOT EXISTS yid TEXT DEFAULT ''",
        "COMMENT ON COLUMN logs.yid IS '上游渠道对应的内部标识(由服务商或底层平台侧生成)'"
    );

    // 子配快照统一用 channel_config_id；展示 YID 由 JOIN channel_configs 得到
    once_migration!(pool, "drop_logs_yid_v1",
        "ALTER TABLE logs DROP COLUMN IF EXISTS yid"
    );

    once_migration!(pool, "add_ha_meltdown_whitelist_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('high_availability_channel', 'ha_meltdown_whitelist', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    once_migration!(pool, "marketing_teams_view_logs_v1",
        "ALTER TABLE marketing_teams ADD COLUMN IF NOT EXISTS members_can_view_logs BIGINT NOT NULL DEFAULT 0",
        "COMMENT ON COLUMN marketing_teams.members_can_view_logs IS '团队成员是否可以查询关联用户的日志记录(0=否,1=是)'"
    );

    // ── 火山方舟视频任务表新增消费金额是否为估算值字段 ──
    once_migration!(pool, "add_ark_video_tasks_is_estimated_v1",
        "ALTER TABLE ark_video_tasks ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN NOT NULL DEFAULT TRUE",
        "COMMENT ON COLUMN ark_video_tasks.is_estimated IS '消费金额是否为估算值(true=估算, false=账单确认)'"
    );

    // ── 为历史遗留的缺失注释的数据库字段补齐备注 ──
    once_migration!(pool, "comment_missing_db_fields_v1",
        "COMMENT ON COLUMN users.credit_limit IS '用户信用额度限制(元)'",
        "COMMENT ON COLUMN users.pay_enabled IS '是否启用支付扣费与额度限制(0=禁用, 1=启用)'",
        "COMMENT ON COLUMN logs.channel_config_id IS '关联渠道配置表的ID'"
    );

    // ── 火山方舟视频监控插件增加调试日志启用默认配置 ──
    once_migration!(pool, "add_volc_ark_monitor_debug_log_config_v1",
        r#"INSERT INTO plugin_configs (plugin_name, config_key, config_value, created_at, updated_at)
           VALUES ('volcengine_ark_monitor', 'enable_debug_log', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (plugin_name, config_key) DO NOTHING"#
    );

    // ── 删除已废弃的智能路由插件 ──
    once_migration!(pool, "remove_router_flow_plugin_v1",
        "DELETE FROM plugins WHERE name = 'router_flow'"
    );

    // ── 删除已废弃的火山卡池和GPT卡池插件 ──
    once_migration!(pool, "remove_pools_plugins_v3",
        "DELETE FROM plugins WHERE name IN ('volcengine_pool', 'gptimage_pool')"
    );

    // ── 清理已移除插件残留表/字段（代码侧已无引用；须在全量节点升级到无卡池版本后执行）──
    // 覆盖：router_flow / volcengine_pool / gptimage_pool 的表、channels 孤儿列、plugin 配置与用户菜单死链
    once_migration!(pool, "drop_removed_plugin_schema_v1",
        // 子表/日志先于主表
        "DROP TABLE IF EXISTS volcengine_pool_logs CASCADE",
        "DROP TABLE IF EXISTS volcengine_pool_account_mapping CASCADE",
        "DROP TABLE IF EXISTS volcengine_pool_accounts CASCADE",
        "DROP TABLE IF EXISTS volcengine_pools CASCADE",
        "DROP TABLE IF EXISTS gptimage_pool_logs CASCADE",
        "DROP TABLE IF EXISTS gptimage_pool_account_mapping CASCADE",
        "DROP TABLE IF EXISTS gptimage_pool_accounts CASCADE",
        "DROP TABLE IF EXISTS gptimage_pools CASCADE",
        "DROP TABLE IF EXISTS router_flow_groups CASCADE",
        // channels 孤儿外联列（Channel 模型与 API 已不再读写）
        "ALTER TABLE channels DROP COLUMN IF EXISTS pool_id",
        "ALTER TABLE channels DROP COLUMN IF EXISTS gptimage_pool_id",
        // 插件元数据与配置残留（幂等）
        "DELETE FROM plugin_configs WHERE plugin_name IN ('router_flow', 'volcengine_pool', 'gptimage_pool')",
        "DELETE FROM plugins WHERE name IN ('router_flow', 'volcengine_pool', 'gptimage_pool')",
        // 用户菜单默认项中的已删页面 /smart-router（value 为 JSON 文本）
        r#"UPDATE settings SET value = (
              SELECT COALESCE(
                jsonb_set(
                  value::jsonb,
                  '{items}',
                  COALESCE((
                    SELECT jsonb_agg(elem)
                    FROM jsonb_array_elements(COALESCE(value::jsonb->'items', '[]'::jsonb)) elem
                    WHERE elem->>'key' IS DISTINCT FROM '/smart-router'
                  ), '[]'::jsonb)
                )::text,
                value
              )
            )
            WHERE key = 'menu_config_settings'
              AND value IS NOT NULL
              AND value <> ''
              AND value::jsonb->'items' @> '[{"key":"/smart-router"}]'::jsonb"#
    );

    // 令牌名称：允许字母/数字/空格/下划线/连字符（对齐前后端校验）
    once_migration!(pool, "fix_api_tokens_name_allow_underscore_v1",
        "ALTER TABLE api_tokens DROP CONSTRAINT IF EXISTS chk_api_tokens_name",
        "ALTER TABLE api_tokens DROP CONSTRAINT IF EXISTS api_tokens_name_check",
        "ALTER TABLE api_tokens ADD CONSTRAINT chk_api_tokens_name CHECK (char_length(name) <= 36 AND name ~ '^[[:alnum:]_[:space:]-]+$')"
    );

    // ── 增加用户通知订阅偏好设置字段 ──
    once_migration!(pool, "add_user_notification_preferences_v1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences TEXT",
        "COMMENT ON COLUMN users.notification_preferences IS '用户的通知订阅偏好(JSON格式)'"
    );

    // ── 渠道分组分类：可自定义分类，默认图片/视频/聊天 ──
    once_migration!(pool, "init_channel_categories_v1",
        r#"CREATE TABLE IF NOT EXISTS channel_categories (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            name_en TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_system INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (now()::text),
            updated_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES channel_categories(id)",
        "INSERT INTO channel_categories (name, name_en, sort_order, is_active, is_system) VALUES ('图片', 'Image', 30, 1, 1) ON CONFLICT (name) DO UPDATE SET is_system = 1",
        "INSERT INTO channel_categories (name, name_en, sort_order, is_active, is_system) VALUES ('视频', 'Video', 20, 1, 1) ON CONFLICT (name) DO UPDATE SET is_system = 1",
        "INSERT INTO channel_categories (name, name_en, sort_order, is_active, is_system) VALUES ('聊天', 'Chat', 10, 1, 1) ON CONFLICT (name) DO UPDATE SET is_system = 1"
    );

    // 若先前误用 TIMESTAMPTZ，统一改为 TEXT 以匹配 sqlx String 映射
    once_migration!(pool, "fix_channel_categories_timestamps_v1",
        r#"DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'channel_categories' AND column_name = 'created_at'
              AND data_type = 'timestamp with time zone'
          ) THEN
            ALTER TABLE channel_categories
              ALTER COLUMN created_at TYPE TEXT USING created_at::text,
              ALTER COLUMN updated_at TYPE TEXT USING updated_at::text;
          END IF;
        END $$"#
    );

    // ── 下线 API 教程「级联调用指南」（仅文档，不影响级联转发/计费功能）──
    once_migration!(pool, "remove_cascade_guide_docs_v1",
        "DELETE FROM plugin_docs WHERE slug = 'cascade-enhance'",
        "DELETE FROM plugin_docs WHERE slug = 'cascade-guide'"
    );

    // ── 兑换码：有效期 / 总次数 / 每用户次数 + 兑换记录表 ──
    once_migration!(pool, "redemptions_limits_expiry_v1",
        "ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS expires_at TEXT",
        "ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS per_user_limit INTEGER NOT NULL DEFAULT 1",
        "UPDATE redemptions SET used_count = 1 WHERE is_used = 1 AND used_count = 0",
        r#"CREATE TABLE IF NOT EXISTS redemption_logs (
            id BIGSERIAL PRIMARY KEY,
            redemption_id BIGINT NOT NULL REFERENCES redemptions(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            created_at TEXT NOT NULL DEFAULT (now()::text)
        )"#,
        "CREATE INDEX IF NOT EXISTS idx_redemption_logs_code_user ON redemption_logs (redemption_id, user_id)"
    );

    // ── 渠道分组 + 上游预设：日/月/总额度 ──
    once_migration!(pool, "channel_period_quota_v1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS daily_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS daily_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS monthly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS monthly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_reset_day TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_reset_month TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN channels.daily_quota_limit IS '日额度上限(-1=无限)'",
        "COMMENT ON COLUMN channels.monthly_quota_limit IS '月额度上限(-1=无限)'",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS daily_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS daily_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS monthly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS monthly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS last_reset_day TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS last_reset_month TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN channel_configs.quota_limit IS '总额度上限(-1=无限)'",
        "COMMENT ON COLUMN channel_configs.daily_quota_limit IS '日额度上限(-1=无限)'",
        "COMMENT ON COLUMN channel_configs.monthly_quota_limit IS '月额度上限(-1=无限)'"
    );

    // ── 渠道分组 + 上游预设：周额度（对齐令牌日/周/月）──
    once_migration!(pool, "channel_weekly_quota_v1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS weekly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS weekly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS last_reset_week TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN channels.weekly_quota_limit IS '周额度上限(-1=无限)'",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS weekly_quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS weekly_quota_used DOUBLE PRECISION NOT NULL DEFAULT 0",
        "ALTER TABLE channel_configs ADD COLUMN IF NOT EXISTS last_reset_week TEXT NOT NULL DEFAULT ''",
        "COMMENT ON COLUMN channel_configs.weekly_quota_limit IS '周额度上限(-1=无限)'"
    );

    // ── 全库时间列 TEXT → TIMESTAMPTZ（timesystem UTC，提升 logs 等范围查询可走索引）──
    // 部署注意：logs 大表 ALTER TYPE 会持有 ACCESS EXCLUSIVE 并重写表，请安排维护窗口。
    // 周期键 last_reset_* / last_daily_reset 等仍为 TEXT（日历键，非时间戳）。
    once_migration!(pool, "timestamptz_unify_v1",
        r#"CREATE OR REPLACE FUNCTION _tb_text_to_tstz(t TEXT) RETURNS TIMESTAMPTZ AS $fn$
        BEGIN
          IF t IS NULL OR btrim(t) = '' THEN
            RETURN NULL;
          END IF;
          BEGIN
            IF substring(t from 11) LIKE '%+%'
               OR substring(t from 11) LIKE '%-%'
               OR substring(t from 11) LIKE '%Z%'
               OR position('T' in t) > 0 THEN
              RETURN t::timestamptz;
            END IF;
            RETURN (t || '+00:00')::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            BEGIN
              RETURN (t || '+00:00')::timestamptz;
            EXCEPTION WHEN OTHERS THEN
              RETURN NULL;
            END;
          END;
        END;
        $fn$ LANGUAGE plpgsql IMMUTABLE"#,
        r#"DO $mig$
        DECLARE
          r RECORD;
          ddl TEXT;
          tbl_exists BOOLEAN;
          is_text BOOLEAN;
        BEGIN
          FOR r IN
            SELECT * FROM (VALUES
              ('logs', 'created_at', true),
              ('users', 'created_at', true),
              ('users', 'updated_at', true),
              ('api_tokens', 'created_at', true),
              ('api_tokens', 'updated_at', true),
              ('api_tokens', 'expires_at', false),
              ('api_tokens', 'last_used_at', false),
              ('channels', 'created_at', true),
              ('channels', 'updated_at', true),
              ('channel_configs', 'created_at', true),
              ('channel_configs', 'updated_at', true),
              ('channel_categories', 'created_at', true),
              ('channel_categories', 'updated_at', true),
              ('orders', 'created_at', true),
              ('orders', 'paid_at', false),
              ('redemptions', 'created_at', true),
              ('redemptions', 'updated_at', true),
              ('redemptions', 'used_at', false),
              ('redemptions', 'expires_at', false),
              ('redemption_logs', 'created_at', true),
              ('verification_codes', 'created_at', true),
              ('verification_codes', 'expires_at', true),
              ('user_levels', 'created_at', true),
              ('user_levels', 'updated_at', true),
              ('admin_groups', 'created_at', true),
              ('admin_groups', 'updated_at', true),
              ('announcements', 'created_at', true),
              ('announcements', 'updated_at', true),
              ('model_providers', 'created_at', true),
              ('model_providers', 'updated_at', true),
              ('model_types', 'created_at', true),
              ('model_types', 'updated_at', true),
              ('models', 'created_at', true),
              ('models', 'updated_at', true),
              ('model_api_providers', 'created_at', true),
              ('model_api_providers', 'updated_at', true),
              ('forward_rules', 'created_at', true),
              ('forward_rules', 'updated_at', true),
              ('billing_rules', 'created_at', true),
              ('billing_rules', 'updated_at', true),
              ('upstreams', 'created_at', true),
              ('upstreams', 'updated_at', true),
              ('plugins', 'created_at', true),
              ('plugins', 'updated_at', true),
              ('plugin_configs', 'created_at', true),
              ('plugin_configs', 'updated_at', true),
              ('plugin_asset_groups', 'created_at', true),
              ('plugin_asset_groups', 'updated_at', true),
              ('plugin_assets', 'created_at', true),
              ('plugin_assets', 'updated_at', true),
              ('plugin_docs', 'created_at', true),
              ('plugin_docs', 'updated_at', true),
              ('plugin_docs_intl', 'created_at', true),
              ('plugin_docs_intl', 'updated_at', true),
              ('plugin_api_logs', 'created_at', true),
              ('site_icons', 'created_at', true),
              ('site_icons', 'updated_at', true),
              ('site_icon_sync_logs', 'created_at', true),
              ('recharge_records', 'created_at', true),
              ('commissions', 'created_at', true),
              ('playground_projects', 'created_at', true),
              ('playground_projects', 'updated_at', true),
              ('playground_assets', 'created_at', true),
              ('user_model_configs', 'created_at', true),
              ('user_model_configs', 'updated_at', true),
              ('marketing_teams', 'created_at', true),
              ('marketing_teams', 'updated_at', true),
              ('marketing_team_leaders', 'created_at', true),
              ('marketing_team_members', 'created_at', true),
              ('router_flow_groups', 'created_at', true),
              ('router_flow_groups', 'updated_at', true),
              ('tos_temp_files', 'created_at', true),
              ('tos_temp_files', 'expire_at', true),
              ('volcengine_pools', 'created_at', true),
              ('volcengine_pools', 'updated_at', true),
              ('volcengine_pool_accounts', 'created_at', true),
              ('volcengine_pool_accounts', 'updated_at', true),
              ('volcengine_pool_accounts', 'last_error_at', false),
              ('volcengine_pool_logs', 'created_at', true),
              ('gptimage_pools', 'created_at', true),
              ('gptimage_pools', 'updated_at', true),
              ('gptimage_pool_accounts', 'created_at', true),
              ('gptimage_pool_accounts', 'updated_at', true),
              ('gptimage_pool_accounts', 'last_error_at', false),
              ('gptimage_pool_logs', 'created_at', true),
              ('happyhorse_configs', 'created_at', true),
              ('happyhorse_configs', 'updated_at', true),
              ('happyhorse_logs', 'created_at', true),
              ('sys_migration_history', 'executed_at', true)
            ) AS t(tbl, col, nn)
          LOOP
            SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = r.tbl
            ) INTO tbl_exists;
            IF NOT tbl_exists THEN
              CONTINUE;
            END IF;

            SELECT (c.data_type IN ('text', 'character varying'))
            INTO is_text
            FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col;

            IF NOT COALESCE(is_text, false) THEN
              CONTINUE;
            END IF;

            IF r.tbl = 'logs' AND r.col = 'created_at' THEN
              EXECUTE 'DROP INDEX IF EXISTS idx_logs_date_created_at';
            END IF;

            IF r.nn THEN
              ddl := format(
                'ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT, ALTER COLUMN %I TYPE TIMESTAMPTZ USING COALESCE(_tb_text_to_tstz(%I), NOW()), ALTER COLUMN %I SET DEFAULT NOW(), ALTER COLUMN %I SET NOT NULL',
                r.tbl, r.col, r.col, r.col, r.col, r.col
              );
            ELSE
              ddl := format(
                'ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT, ALTER COLUMN %I TYPE TIMESTAMPTZ USING _tb_text_to_tstz(%I)',
                r.tbl, r.col, r.col, r.col
              );
            END IF;
            EXECUTE ddl;
          END LOOP;
        END;
        $mig$"#,
        "DROP INDEX IF EXISTS idx_logs_date_created_at",
        "CREATE INDEX IF NOT EXISTS idx_logs_created_at_date ON logs ((timezone('UTC', created_at)::date))",
        "DROP FUNCTION IF EXISTS _tb_text_to_tstz(TEXT)"
    );

    // ── logs 冷归档表：热表瘦身，明细可查冷表；默认不自动归档（log_row_retention_days=0）──
    once_migration!(pool, "logs_archive_v1",
        r#"CREATE TABLE IF NOT EXISTS logs_archive (LIKE logs INCLUDING DEFAULTS)"#,
        r#"DO $pk$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'logs_archive_pkey'
          ) THEN
            ALTER TABLE logs_archive ADD CONSTRAINT logs_archive_pkey PRIMARY KEY (id);
          END IF;
        END
        $pk$"#,
        "ALTER TABLE logs_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "CREATE INDEX IF NOT EXISTS idx_logs_archive_created_at ON logs_archive (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_logs_archive_user_created ON logs_archive (user_id, created_at DESC)",
        "COMMENT ON TABLE logs_archive IS '使用日志冷归档：超期行从 logs 迁入，保留明细供审计；仪表盘统计走 usage_daily_stats'"
    );

    // 验证码防爆破：增加 attempts 计数列
    once_migration!(pool, "verification_codes_attempts_v1",
        "ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0"
    );

    tracing::info!("PostgreSQL AnyPool migrations completed successfully");
    Ok(())
    }};
}

pub async fn run_pg(pool: &sqlx::Pool<sqlx::Postgres>) -> anyhow::Result<()> {
    pg_migration_blocks!(pool)
}
