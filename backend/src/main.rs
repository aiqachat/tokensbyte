use std::sync::Arc;

mod api;
mod auth;
mod config;
mod db;
mod error;
mod middleware;
mod models;
mod providers;
mod relay;
mod services;

use config::AppConfig;
use db::Database;

pub struct DashboardCacheEntry {
    pub stats: models::DashboardStats,
    pub timestamp: std::time::Instant,
}

pub struct AppState {
    pub db: Database,
    pub config: AppConfig,
    pub http_client: reqwest::Client,
    pub rate_limiter: middleware::rate_limit::GlobalRateLimiter,
    pub icon_sync_progress: api::site_icons::SyncProgress,
    pub dashboard_cache: dashmap::DashMap<String, DashboardCacheEntry>,
    // 高可用熔断与配置缓存
    pub failed_channels: dashmap::DashMap<String, std::time::Instant>,
    pub ha_max_retries: std::sync::atomic::AtomicI64,
    pub ha_cooldown_429: std::sync::atomic::AtomicI64,
    pub ha_cooldown_network: std::sync::atomic::AtomicI64,
    pub ha_cooldown_auth: std::sync::atomic::AtomicI64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();
    
    let config_data = AppConfig::from_env();
    let database = Database::new(&config_data.database_url).await?;
    database.run_migrations().await?;
    
    database.seed_admin(&config_data).await?;

    // 同步 REGISTER_ENABLED 环境变量到数据库设置
    sync_registration_settings(&database, config_data.register_enabled).await?;
    
    let state = Arc::new(AppState {
        db: database,
        config: config_data.clone(),
        http_client: reqwest::Client::new(),
        rate_limiter: middleware::rate_limit::GlobalRateLimiter::new(),
        icon_sync_progress: api::site_icons::SyncProgress::new(),
        dashboard_cache: dashmap::DashMap::new(),
        failed_channels: dashmap::DashMap::new(),
        ha_max_retries: std::sync::atomic::AtomicI64::new(3),
        ha_cooldown_429: std::sync::atomic::AtomicI64::new(60),
        ha_cooldown_network: std::sync::atomic::AtomicI64::new(300),
        ha_cooldown_auth: std::sync::atomic::AtomicI64::new(1800),
    });

    // 启动时恢复：处理上次中断遗留的"处理中"日志，退还预扣费
    relay::proxy::recover_interrupted_logs(&state).await;

    // 异步加载高可用配置
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) = state_clone.load_ha_configs().await {
                tracing::error!("加载高可用插件配置失败: {}", e);
            }
        });
    }

    // 优雅关闭信号广播通道：所有后台任务监听此信号，收到后完成当前工作并退出
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    let mut bg_handles: Vec<tokio::task::JoinHandle<()>> = Vec::new();

    // 启动后台异步任务轮询器（每 2 分钟自动检查未结算的视频/图片生成任务）
    bg_handles.push(relay::task::start(state.clone(), shutdown_rx.clone()));

    // 启动孤儿日志清理定时任务（每 5 分钟检查 status_code=0 超过 30 分钟的日志）
    bg_handles.push({
        let state_clone = state.clone();
        let mut rx = shutdown_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {
                        relay::proxy::cleanup_orphan_pending_logs(&state_clone).await;
                    }
                    _ = rx.changed() => return,
                }
            }
        })
    });

    // TOS 渠道存储过期文件清理（每 10 分钟）
    bg_handles.push({
        let state_clone = state.clone();
        let mut rx = shutdown_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(600)) => {
                        relay::tos_persist::cleanup_expired_files(&state_clone).await;
                    }
                    _ = rx.changed() => return,
                }
            }
        })
    });

    // 使用日志大字段定期清理（每天凌晨 3:00 执行）
    bg_handles.push({
        let state_clone = state.clone();
        let mut rx = shutdown_rx.clone();
        tokio::spawn(async move {
            loop {
                let now = chrono::Local::now();
                let tomorrow_3am = (now + chrono::Duration::days(1))
                    .date_naive()
                    .and_hms_opt(3, 0, 0)
                    .unwrap();
                let tomorrow_3am = tomorrow_3am
                    .and_local_timezone(chrono::Local)
                    .single()
                    .unwrap_or_else(|| now + chrono::Duration::days(1));
                let wait = (tomorrow_3am - now).to_std().unwrap_or(std::time::Duration::from_secs(86400));
                tokio::select! {
                    _ = tokio::time::sleep(wait) => {
                        cleanup_log_content(&state_clone).await;
                    }
                    _ = rx.changed() => return,
                }
            }
        })
    });

    // 创作中心画布中断节点自动恢复（每 5 分钟）
    #[cfg(feature = "commercial_plugins")]
    bg_handles.push({
        let state_clone = state.clone();
        let mut rx = shutdown_rx.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {
                        api::playground::cleanup_stale_playground_nodes(&state_clone).await;
                    }
                    _ = rx.changed() => return,
                }
            }
        })
    });

    // 启动时检查站点图标文件完整性，缺失则自动恢复（一次性任务，无需关闭信号）
    {
        let state_clone = state.clone();
        tokio::spawn(async move {
            api::site_icons::auto_recover_on_startup(state_clone).await;
        });
    }

    let assets_dir = format!("{}/assets", config_data.data_dir);
    let portal_dir = format!("{}/portal", config_data.data_dir);
    // 确保 portal 目录存在
    std::fs::create_dir_all(&portal_dir).ok();
    let app = api::build_router(state.clone())
        .nest_service("/portal", tower_http::services::ServeDir::new(&portal_dir))
        .nest_service("/assets", tower_http::services::ServeDir::new(&assets_dir));

    let addr = format!("{}:{}", config_data.host, config_data.port);
    eprintln!("⚙️ Binding server to {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("🚀 TokensByte server running at http://{}", addr);
    eprintln!("✅ TokensByte server is now completely online at http://{} !", addr);

    // 优雅关闭：收到 SIGTERM/SIGINT 后停止接受新请求，等待进行中的请求和后台任务完成
    let shutdown_signal = async move {
        let ctrl_c = tokio::signal::ctrl_c();
        let mut sigterm = tokio::signal::unix::signal(
            tokio::signal::unix::SignalKind::terminate()
        ).expect("无法注册 SIGTERM 信号处理器");
        tokio::select! {
            _ = ctrl_c => {},
            _ = sigterm.recv() => {},
        }
        tracing::info!("⏳ 收到关闭信号，停止接受新请求，等待进行中的任务完成...");
        let _ = shutdown_tx.send(true);
    };

    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    // HTTP 服务已关闭，等待后台任务完成（包括正在轮询中的异步任务）
    tracing::info!("⏳ HTTP 连接已关闭，等待后台任务完成...");
    let wait_bg = async { for h in bg_handles { let _ = h.await; } };
    match tokio::time::timeout(std::time::Duration::from_secs(30), wait_bg).await {
        Ok(_) => tracing::info!("✅ 所有后台任务已完成，服务安全退出"),
        Err(_) => tracing::warn!("⚠️ 部分后台任务未在 30 秒内完成，强制退出"),
    }

    Ok(())

}

/// 清理超期日志的大字段内容（request_content / response_content / upstream_req_content）
/// 仅置 NULL，不删除日志记录，统计数据不受影响
async fn cleanup_log_content(state: &AppState) {
    // 读取 storage_settings 中的 log_retention_days
    let retention_days: i32 = match sqlx::query_scalar::<_, String>(
        &state.db.format_query("SELECT value FROM settings WHERE key = ?")
    )
    .bind("storage_settings")
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(Some(val)) => {
            serde_json::from_str::<models::StorageSettings>(&val)
                .map(|s| s.log_retention_days)
                .unwrap_or(30)
        }
        _ => 30,
    };

    if retention_days <= 0 {
        return;
    }

    // 分批清理，每批 10000 条，避免长事务锁表
    // 与孤儿日志清理保持一致的比较方式，使用占位符绑定天数参数，防止拼接。
    // 使用统一的占位符 ?，格式化时会自动转换为 PostgreSQL 的 $1，符合架构规范。
    let cleanup_sql = state.db.format_query(
        "UPDATE logs SET request_content = NULL, response_content = NULL, upstream_req_content = NULL, post_response = NULL \
         WHERE id IN (\
            SELECT id FROM logs \
            WHERE created_at::timestamptz < CURRENT_TIMESTAMP - (? * INTERVAL '1 day') \
              AND (request_content IS NOT NULL OR response_content IS NOT NULL OR upstream_req_content IS NOT NULL OR post_response IS NOT NULL) \
            LIMIT 10000\
         )"
    );

    loop {
        let result = sqlx::query(&cleanup_sql)
            .bind(retention_days as f64)
            .execute(&state.db.pool)
            .await;

        match result {
            Ok(r) => {
                let affected = r.rows_affected();
                if affected > 0 {
                    tracing::info!("🧹 日志清理: 已清理 {} 条超过 {} 天的日志详情", affected, retention_days);
                }
                // 本批不足 10000 条说明已全部清理完毕
                if affected < 10000 {
                    break;
                }
            }
            Err(e) => {
                tracing::error!("日志清理失败: {}", e);
                break;
            }
        }
    }
}

/// 将 REGISTER_ENABLED 环境变量同步到数据库的 registration_settings
async fn sync_registration_settings(db: &Database, register_enabled: bool) -> anyhow::Result<()> {
    use crate::api::settings::default_registration_settings;

    let existing: Option<String> = sqlx::query_scalar(&db.format_query("SELECT value FROM settings WHERE key = 'registration_settings'"))
        .fetch_optional(&db.pool)
        .await?;

    let settings = if let Some(val) = existing {
        // 已有设置时，仅根据 REGISTER_ENABLED 覆盖注册开关
        let mut settings: models::RegistrationSettings = serde_json::from_str(&val)
            .unwrap_or_else(|_| default_registration_settings());
        if register_enabled {
            settings.enable_username_registration = true;
            settings.enable_email_registration = true;
        } else {
            settings.enable_username_registration = false;
            settings.enable_email_registration = false;
        }
        settings
    } else {
        // 不存在时用默认值
        let mut s = default_registration_settings();
        s.enable_username_registration = register_enabled;
        s.enable_email_registration = register_enabled;
        s.enable_password_recovery = true;
        s
    };

    let val = serde_json::to_string(&settings).unwrap_or_default();
    sqlx::query(&db.format_query("INSERT INTO settings (key, value) VALUES ('registration_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"))
        .bind(val)
        .execute(&db.pool)
        .await?;

    tracing::info!(
        "📝 Registration settings synced: username={}, email={}, mobile={}, password_recovery={}",
        settings.enable_username_registration,
        settings.enable_email_registration,
        settings.enable_mobile_registration,
        settings.enable_password_recovery,
    );

    Ok(())
}

impl AppState {
    pub async fn load_ha_configs(&self) -> anyhow::Result<()> {
        let configs: Vec<(String, String)> = match sqlx::query_as(
            "SELECT config_key, config_value FROM plugin_configs WHERE plugin_name = 'high_availability_channel'"
        )
        .fetch_all(&self.db.pool)
        .await {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("获取高可用配置失败，使用默认配置: {}", e);
                return Ok(());
            }
        };

        for (key, val) in configs {
            if let Ok(parsed_val) = val.parse::<i64>() {
                match key.as_str() {
                    "ha_max_retries" => self.ha_max_retries.store(parsed_val, std::sync::atomic::Ordering::Relaxed),
                    "ha_cooldown_429" => self.ha_cooldown_429.store(parsed_val, std::sync::atomic::Ordering::Relaxed),
                    "ha_cooldown_network" => self.ha_cooldown_network.store(parsed_val, std::sync::atomic::Ordering::Relaxed),
                    "ha_cooldown_auth" => self.ha_cooldown_auth.store(parsed_val, std::sync::atomic::Ordering::Relaxed),
                    _ => {}
                }
            }
        }
        tracing::info!("高可用插件配置加载成功");
        Ok(())
    }
}
