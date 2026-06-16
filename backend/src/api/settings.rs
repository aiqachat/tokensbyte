use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use sqlx::postgres::PgPoolOptions;
use crate::AppState;
use crate::models::{
    SiteSettings, CurrencySettings, LoginSettings, RegistrationSettings,
    SMTPSettings, SmsSettings, MarketingSettings, DatabaseSettings,
    AllSettings, UpdateSettingsRequest, AgreementSettings, StorageSettings,
    PublicSettings, PublicRegistrationSettings, PublicMarketingSettings,
    PublicPaymentStatus,
    PaymentWechatSettings, PaymentAlipaySettings, PaymentStripeSettings, PaymentBonuspaySettings,
};
use crate::error::{AppError, AppResult};

// ════════════════════════════════════════════════════════════════════════════
// 【安全原则】公开接口绝不暴露隐私数据（密钥、密码、Secret、数据库信息等）。
// get_public_settings 仅返回前端 UI 渲染所需的最小安全数据集。
// get_settings 返回完整设置，仅限管理员访问（通过 admin_middleware 保护）。
// 此原则必须被所有开发者（包括 AI）严格遵守。
// ════════════════════════════════════════════════════════════════════════════

/// 公开接口 — 返回前端 UI 渲染所需的安全配置，不含任何密钥/密码
pub async fn get_public_settings(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<PublicSettings>> {
    let site = get_setting(&state, "site_settings", default_site_settings()).await?;
    let currency = get_setting(&state, "currency_settings", default_currency_settings()).await?;
    let login = get_setting(&state, "login_settings", default_login_settings()).await?;
    let registration: RegistrationSettings = get_setting(&state, "registration_settings", default_registration_settings()).await?;
    let marketing: MarketingSettings = get_setting(&state, "marketing_settings", default_marketing_settings()).await?;
    let agreement = get_setting(&state, "agreement_settings", default_agreement_settings()).await?;
    let menu_config = get_setting(&state, "menu_config_settings", default_menu_config_settings()).await?;

    // OAuth 仅提取 client_id / app_id，不暴露 secret
    let wechat_oauth_app_id = get_setting::<Option<crate::models::WechatOAuthSettings>>(&state, "wechat_oauth", None).await?
        .and_then(|w| if w.app_id.is_empty() { None } else { Some(w.app_id) });
    let google_oauth_client_id = get_setting::<Option<crate::models::GoogleOAuthSettings>>(&state, "google_oauth", None).await?
        .and_then(|g| if g.client_id.is_empty() { None } else { Some(g.client_id) });

    // 支付渠道仅提取 enabled 开关，不暴露任何密钥
    let wechat_enabled = get_setting::<Option<PaymentWechatSettings>>(&state, "payment_wechat", None).await?
        .map_or(false, |p| p.enabled);
    let alipay_enabled = get_setting::<Option<PaymentAlipaySettings>>(&state, "payment_alipay", None).await?
        .map_or(false, |p| p.enabled);
    let stripe_enabled = get_setting::<Option<PaymentStripeSettings>>(&state, "payment_stripe", None).await?
        .map_or(false, |p| p.enabled);
    let bonuspay_enabled = get_setting::<Option<PaymentBonuspaySettings>>(&state, "payment_bonuspay", None).await?
        .map_or(false, |p| p.enabled);

    Ok(Json(PublicSettings {
        site,
        currency,
        login,
        registration: PublicRegistrationSettings::from(&registration),
        marketing: PublicMarketingSettings::from(&marketing),
        payment: PublicPaymentStatus {
            wechat_enabled,
            alipay_enabled,
            stripe_enabled,
            bonuspay_enabled,
        },
        agreement,
        wechat_oauth_app_id,
        google_oauth_client_id,
        menu_config: Some(menu_config),
    }))
}

/// 管理员专属接口 — 返回完整设置（含所有密钥），需 admin_middleware 保护
pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<AllSettings>> {
    let mut all = load_all_settings(&state).await?;
    all.server_timezone = Some(iana_time_zone::get_timezone().unwrap_or_else(|_| chrono::Local::now().offset().to_string()));
    all.server_time = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    Ok(Json(all))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<AllSettings>> {
    let mut currency_or_site_changed = false;
    if let Some(v) = request.site {
        save_setting(&state, "site_settings", &v).await?;
        currency_or_site_changed = true;
    }
    if let Some(v) = request.currency {
        save_setting(&state, "currency_settings", &v).await?;
        currency_or_site_changed = true;
    }
    if let Some(v) = request.login { save_setting(&state, "login_settings", &v).await?; }
    if let Some(v) = request.registration { save_setting(&state, "registration_settings", &v).await?; }
    if let Some(v) = request.smtp { save_setting(&state, "smtp_settings", &v).await?; }
    if let Some(v) = request.sms { save_setting(&state, "sms_settings", &v).await?; }
    if let Some(v) = request.marketing { save_setting(&state, "marketing_settings", &v).await?; }
    if let Some(v) = request.database { save_setting(&state, "database_settings", &v).await?; }
    if let Some(v) = request.payment_wechat { save_setting(&state, "payment_wechat", &v).await?; }
    if let Some(v) = request.payment_alipay { save_setting(&state, "payment_alipay", &v).await?; }
    if let Some(v) = request.payment_stripe { save_setting(&state, "payment_stripe", &v).await?; }
    if let Some(v) = request.payment_bonuspay { save_setting(&state, "payment_bonuspay", &v).await?; }
    if let Some(v) = request.google_oauth { save_setting(&state, "google_oauth", &v).await?; }
    if let Some(v) = request.wechat_oauth { save_setting(&state, "wechat_oauth", &v).await?; }
    if let Some(v) = request.agreement { save_setting(&state, "agreement_settings", &v).await?; }
    if let Some(v) = request.storage { save_setting(&state, "storage_settings", &v).await?; }
    if let Some(v) = request.menu_config { save_setting(&state, "menu_config_settings", &v).await?; }

    if currency_or_site_changed {
        crate::api::plugins::notify_marketplace_data_changed(&state).await;
    }

    let mut all = load_all_settings(&state).await?;
    all.server_timezone = Some(iana_time_zone::get_timezone().unwrap_or_else(|_| chrono::Local::now().offset().to_string()));
    all.server_time = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
    Ok(Json(all))
}

/// 发送测试邮件
pub async fn test_email(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let to = body["to"].as_str()
        .ok_or_else(|| AppError::BadRequest("缺少收件邮箱 to".to_string()))?;
    let smtp = get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings()).await?;
    let svc = crate::services::email::EmailService::new(&smtp)?;
    svc.send_test_email(to).await?;
    Ok(Json(serde_json::json!({"success": true, "message": "测试邮件发送成功"})))
}

/// 发送测试短信
pub async fn test_sms(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let mobile = body["mobile"].as_str()
        .ok_or_else(|| AppError::BadRequest("缺少手机号 mobile".to_string()))?;
    let sms = get_setting::<SmsSettings>(&state, "sms_settings", default_sms_settings()).await?;
    if sms.secret_id.is_empty() || sms.secret_key.is_empty() {
        return Err(AppError::BadRequest("请先完善短信通知配置".to_string()));
    }
    let svc = crate::services::sms::SmsService::new(&sms);
    svc.send_verification_code(mobile, "666666").await?;
    Ok(Json(serde_json::json!({"success": true, "message": "测试短信发送成功"})))
}

pub async fn verify_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode { "require" } else { "disable" };
        let mut url = format!("postgres://{}", urlencoding::encode(&settings.username));
        if !settings.password.is_empty() {
            url.push_str(&format!(":{}", urlencoding::encode(&settings.password)));
        }
        url.push_str(&format!("@{}:{}/{}?sslmode={}", settings.host, settings.port, settings.database, ssl_mode));

        match PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(&url)
            .await
        {
            Ok(_) => Ok(Json(serde_json::json!({"success": true, "message": "连接成功"}))),
            Err(e) => Ok(Json(serde_json::json!({"success": false, "message": format!("连接失败: {}", e)}))),
        }
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "仅支持 PostgreSQL"})))
    }
}

pub async fn initialize_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode { "require" } else { "disable" };
        let mut url = format!("postgres://{}", urlencoding::encode(&settings.username));
        if !settings.password.is_empty() {
            url.push_str(&format!(":{}", urlencoding::encode(&settings.password)));
        }
        url.push_str(&format!("@{}:{}/{}?sslmode={}", settings.host, settings.port, settings.database, ssl_mode));

        match PgPoolOptions::new().max_connections(1).connect(&url).await {
            Ok(pool) => {
                if let Err(e) = crate::db::migrations::run_pg(&pool).await {
                    return Ok(Json(serde_json::json!({"success": false, "message": format!("数据库初始化失败: {}", e)})));
                }
                Ok(Json(serde_json::json!({"success": true, "message": "数据库初始化成功"})))
            },
            Err(e) => Ok(Json(serde_json::json!({"success": false, "message": format!("无法连接到数据库: {}", e)}))),
        }
    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "仅支持对 PostgreSQL 进行初始化"})))
    }
}

pub async fn backup_database(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    // 尝试寻找备份脚本的位置，适应不同的后台启动路径（backend 目录或项目根目录）
    let script_path = if std::path::Path::new("../backup_pgsql.sh").exists() {
        Some("../backup_pgsql.sh")
    } else if std::path::Path::new("backup_pgsql.sh").exists() {
        Some("backup_pgsql.sh")
    } else {
        None
    };
    
    // 如果存在用户的自定义备份脚本，优先执行脚本
    if let Some(path) = script_path {
        let output = std::process::Command::new("bash")
            .arg(path)
            .output();

        return match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // 提取脚本输出的最后几行作为关键信息返回，避免过长
                let msg = stdout.lines().rev().take(3).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
                Ok(Json(serde_json::json!({"success": true, "message": format!("备份成功:\n{}", msg)})))
            }
            Ok(out) => {
                let err_str = String::from_utf8_lossy(&out.stderr);
                Ok(Json(serde_json::json!({"success": false, "message": format!("备份脚本执行失败:\n{}", err_str)})))
            }
            Err(e) => {
                Ok(Json(serde_json::json!({"success": false, "message": format!("执行备份脚本异常: {}", e)})))
            }
        };
    }

    let db_url = &state.config.database_url;
    let now = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_name = format!("tb{}", now);
    
    // Ensure data directory exists
    if let Err(e) = std::fs::create_dir_all("data") {
        return Ok(Json(serde_json::json!({"success": false, "message": format!("无法创建备份目录: {}", e)})));
    }

    if db_url.starts_with("postgres:") || db_url.starts_with("postgresql:") {
        let output_path = format!("data/{}.sql", file_name);
        
        // 严谨校验与解析，防止命令行注入或参数劫持
        let parsed_url = match reqwest::Url::parse(db_url) {
            Ok(url) => url,
            Err(e) => return Ok(Json(serde_json::json!({"success": false, "message": format!("数据库连接地址格式错误: {}", e)}))),
        };

        let host = match parsed_url.host_str() {
            Some(h) => h,
            None => return Ok(Json(serde_json::json!({"success": false, "message": "数据库连接地址中缺少主机名"}))),
        };

        let port = parsed_url.port().unwrap_or(5432);
        let username = parsed_url.username();
        let database_name = parsed_url.path().trim_start_matches('/');
        if database_name.is_empty() {
            return Ok(Json(serde_json::json!({"success": false, "message": "数据库连接地址中缺少数据库名称"})));
        }

        // 对用户名和数据库名进行 URL 解码，防止特殊字符或空格 URL 编码导致鉴权/定位失败
        let decoded_username = urlencoding::decode(username)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| username.to_string());

        let decoded_database_name = urlencoding::decode(database_name)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| database_name.to_string());

        // 防御以 - 开头的参数注入
        if host.starts_with('-') || decoded_database_name.starts_with('-') || decoded_username.starts_with('-') {
            return Ok(Json(serde_json::json!({"success": false, "message": "不合法的连接参数，拒绝执行备份"})));
        }

        let mut cmd = std::process::Command::new("pg_dump");
        cmd.arg("-h").arg(host)
           .arg("-p").arg(port.to_string())
           .arg("-U").arg(&decoded_username)
           .arg("-d").arg(&decoded_database_name)
           .arg("-f").arg(&output_path);

        if let Some(password) = parsed_url.password() {
            // 对密码进行 URL 解码，防止密码中的特殊字符编码导致鉴权失败
            let decoded_password = urlencoding::decode(password)
                .map(|cow| cow.into_owned())
                .unwrap_or_else(|_| password.to_string());
            cmd.env("PGPASSWORD", decoded_password);
        }

        // Execute pg_dump
        let output = cmd.output();

        match output {
            Ok(out) if out.status.success() => {
                Ok(Json(serde_json::json!({"success": true, "message": format!("数据库备份成功，保存在 {}", output_path)})))
            }
            Ok(out) => {
                let err_str = String::from_utf8_lossy(&out.stderr);
                Ok(Json(serde_json::json!({"success": false, "message": format!("pg_dump 执行失败: {}", err_str)})))
            }
            Err(e) => {
                Ok(Json(serde_json::json!({"success": false, "message": format!("执行备份程序异常 (系统可能未安装 postgresql-client 命令行工具): {}", e)})))
            }
        }

    } else {
        Ok(Json(serde_json::json!({"success": false, "message": "不支持的数据库类型，暂无法备份"})))
    }
}

pub async fn test_storage_connection(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<StorageSettings>,
) -> AppResult<Json<serde_json::Value>> {
    let tos_config = crate::services::tos::TosConfig {
        access_key: settings.tos_access_key,
        secret_key: settings.tos_secret_key,
        endpoint: settings.tos_endpoint,
        region: settings.tos_region,
        bucket: settings.tos_bucket,
        path_prefix: settings.tos_path_prefix,
        custom_domain: settings.tos_custom_domain,
    };
    match crate::services::tos::test_connection(&tos_config).await {
        Ok(_) => Ok(Json(serde_json::json!({"success": true, "message": "连接成功，能正常访问指定的 Bucket"}))),
        Err(e) => Ok(Json(serde_json::json!({"success": false, "message": format!("测试失败: {}", e)}))),
    }
}

// ======================== 内部工具函数 ========================

/// 加载全部设置（统一入口）
pub async fn load_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    Ok(AllSettings {
        site: get_setting(state, "site_settings", default_site_settings()).await?,
        currency: get_setting(state, "currency_settings", default_currency_settings()).await?,
        login: get_setting(state, "login_settings", default_login_settings()).await?,
        registration: get_setting(state, "registration_settings", default_registration_settings()).await?,
        smtp: get_setting(state, "smtp_settings", default_smtp_settings()).await?,
        sms: get_setting(state, "sms_settings", None).await?,
        marketing: get_setting(state, "marketing_settings", default_marketing_settings()).await?,
        database: get_setting(state, "database_settings", default_database_settings()).await?,
        payment_wechat: get_setting(state, "payment_wechat", None).await?,
        payment_alipay: get_setting(state, "payment_alipay", None).await?,
        payment_stripe: get_setting(state, "payment_stripe", None).await?,
        payment_bonuspay: get_setting(state, "payment_bonuspay", None).await?,
        google_oauth: get_setting(state, "google_oauth", None).await?,
        wechat_oauth: get_setting(state, "wechat_oauth", None).await?,
        agreement: get_setting(state, "agreement_settings", default_agreement_settings()).await?,
        storage: get_setting(state, "storage_settings", None).await?,
        menu_config: Some(get_setting(state, "menu_config_settings", default_menu_config_settings()).await?),
        server_timezone: None,
        server_time: None,
    })
}

async fn get_setting<T: serde::de::DeserializeOwned + Clone>(state: &Arc<AppState>, key: &str, default: T) -> AppResult<T> {
    let val: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = ?"))
        .bind(key)
        .fetch_optional(&state.db.pool)
        .await?;
    if let Some(v) = val {
        Ok(serde_json::from_str(&v).unwrap_or(default))
    } else {
        Ok(default)
    }
}

async fn save_setting<T: serde::Serialize>(state: &Arc<AppState>, key: &str, value: &T) -> AppResult<()> {
    let val = serde_json::to_string(value).unwrap_or_default();
    sqlx::query(&state.db.format_query(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value"
    ))
    .bind(key)
    .bind(val)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

// ======================== 默认值函数 ========================

pub fn default_site_settings() -> SiteSettings {
    SiteSettings {
        name: "TokensByte".to_string(),
        title: "TokensByte - LLM API Gateway".to_string(),
        keywords: "LLM, API, Gateway, Rust".to_string(),
        description: "Next-gen LLM API Distribution & Management Platform".to_string(),
        favicon: String::new(),
        logo: String::new(),
        login_title: String::new(),
        login_subtitle: String::new(),
        enable_multilingual: true,
        supported_languages: vec!["zh".to_string(), "en".to_string()],
        default_language: "zh".to_string(),
        default_timezone: iana_time_zone::get_timezone().unwrap_or_else(|_| "Asia/Shanghai".to_string()),
        enable_theme_toggle: true,
        default_theme: "dark".to_string(),
        copyright: "© 2026 Tokensbyte. All rights reserved.".to_string(),
    }
}

pub fn default_currency_settings() -> CurrencySettings {
    CurrencySettings {
        default_currency: "CNY".to_string(),
        currency_symbol: "¥".to_string(),
        currency_unit: "元".to_string(),
        token_ratio: 1.0,
        auxiliary_currencies: vec![],
    }
}

pub fn default_login_settings() -> LoginSettings {
    LoginSettings {
        enable_username_login: true,
        enable_mobile_login: false,
        enable_email_login: false,
        enable_wechat_login: false,
        enable_google_login: false,
    }
}

pub fn default_registration_settings() -> RegistrationSettings {
    RegistrationSettings {
        enable_username_registration: false,
        enable_email_registration: false,
        enable_mobile_registration: false,
        enable_password_recovery: false,
        ip_rate_limit_enabled: false,
        ip_daily_limit: 6,
        email_validation_strict: false,
        email_whitelist_enabled: false,
        email_whitelist: vec![
            "qq.com".to_string(),
            "163.com".to_string(),
            "outlook.com".to_string(),
            "aliyun.com".to_string(),
            "foxmail.com".to_string(),
        ],
    }
}

pub fn default_smtp_settings() -> SMTPSettings {
    SMTPSettings {
        host: "smtp.example.com".to_string(),
        port: 465,
        username: "".to_string(),
        password: "".to_string(),
        from_address: "noreply@example.com".to_string(),
        from_name: "TokensByte".to_string(),
    }
}

pub fn default_sms_settings() -> SmsSettings {
    SmsSettings {
        secret_id: String::new(),
        secret_key: String::new(),
        sdk_app_id: String::new(),
        sign_name: String::new(),
        template_id: String::new(),
    }
}

pub fn default_marketing_settings() -> MarketingSettings {
    MarketingSettings {
        enable_registration_gift: false,
        gift_mode: "fixed".to_string(),
        fixed_amount: 0.0,
        min_amount: 0.0,
        max_amount: 0.0,
    }
}

pub fn default_database_settings() -> DatabaseSettings {
    DatabaseSettings {
        db_type: "postgres".to_string(),
        host: "localhost".to_string(),
        port: 5432,
        database: "postgres".to_string(),
        username: "postgres".to_string(),
        password: "postgres".to_string(),
        ssl_mode: false,
    }
}

pub fn default_agreement_settings() -> AgreementSettings {
    AgreementSettings {
        tos_mode: "link".to_string(),
        tos_mode_en: "link".to_string(),
        tos_content: "".to_string(),
        tos_content_en: "".to_string(),
        tos_link: "".to_string(),
        tos_link_en: "".to_string(),
        privacy_mode: "link".to_string(),
        privacy_mode_en: "link".to_string(),
        privacy_content: "".to_string(),
        privacy_content_en: "".to_string(),
        privacy_link: "".to_string(),
        privacy_link_en: "".to_string(),
    }
}

pub async fn system_about() -> AppResult<Json<serde_json::Value>> {
    // 优先动态调用 git log 获取最新提交记录（无论 debug/release 模式）
    let output = std::process::Command::new("git")
        .args([
            "log",
            "-10",
            "--format=%H\x1F%h\x1F%an\x1F%cd\x1F%s",
            "--date=format:%Y-%m-%d %H:%M:%S",
        ])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let raw = String::from_utf8_lossy(&out.stdout).to_string();
            let mut commits = vec![];
            for (i, line) in raw.lines().filter(|l| !l.trim().is_empty()).enumerate() {
                let parts: Vec<&str> = line.splitn(5, '\x1F').collect();
                let version = format!("v1.0.{}", 10usize.saturating_sub(i));
                let hash = parts.first().unwrap_or(&"").to_string();
                let short_hash = parts.get(1).unwrap_or(&"").to_string();
                let raw_author = parts.get(2).unwrap_or(&"").to_string();
                let author = if raw_author.chars().count() > 2 {
                    let chars: Vec<char> = raw_author.chars().collect();
                    format!("{}***{}", chars.first().unwrap_or(&'a'), chars.last().unwrap_or(&'z'))
                } else if raw_author.chars().count() == 2 {
                    let chars: Vec<char> = raw_author.chars().collect();
                    format!("{}*", chars.first().unwrap_or(&'a'))
                } else {
                    raw_author
                };
                let date = parts.get(3).unwrap_or(&"").to_string();
                let message = parts.get(4).unwrap_or(&"").replace("\n", " ");

                commits.push(serde_json::json!({
                    "index": i,
                    "is_current": i == 0,
                    "version": version,
                    "hash": hash,
                    "short_hash": short_hash,
                    "author": author,
                    "date": date,
                    "message": message
                }));
            }

            if !commits.is_empty() {
                let current = commits.first().cloned().unwrap_or(serde_json::json!({}));
                return Ok(Json(serde_json::json!({
                    "success": true,
                    "current": current,
                    "commits": commits,
                })));
            }
        }
    }

    // git 不可用时回退到编译期预生成的静态数据
    let static_commits_json = include_str!(concat!(env!("OUT_DIR"), "/git_commits.json"));

    let commits: Vec<serde_json::Value> = serde_json::from_str(static_commits_json).unwrap_or_else(|_| {
        vec![serde_json::json!({
            "index": 0,
            "is_current": true,
            "version": "unknown",
            "hash": "",
            "short_hash": "------",
            "author": "N/A",
            "date": "N/A",
            "message": "版本信息不可用",
        })]
    });

    let current = commits.first().cloned().unwrap_or(serde_json::json!({}));

    Ok(Json(serde_json::json!({
        "success": true,
        "current": current,
        "commits": commits,
    })))
}

pub fn default_menu_config_settings() -> crate::models::MenuConfigSettings {
    crate::models::MenuConfigSettings {
        items: vec![
            crate::models::MenuItemConfig {
                key: "/dashboard".to_string(),
                label_zh: "系统概览".to_string(),
                label_en: "Dashboard".to_string(),
                icon: "DashboardOutlined".to_string(),
                enabled: true,
                sort_order: 1,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/playground".to_string(),
                label_zh: "操场".to_string(),
                label_en: "Playground".to_string(),
                icon: "ExperimentOutlined".to_string(),
                enabled: true,
                sort_order: 2,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/relay-api".to_string(),
                label_zh: "中继接口".to_string(),
                label_en: "Relay API".to_string(),
                icon: "RocketOutlined".to_string(),
                enabled: true,
                sort_order: 3,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/tokens".to_string(),
                label_zh: "令牌管理".to_string(),
                label_en: "Tokens".to_string(),
                icon: "KeyOutlined".to_string(),
                enabled: true,
                sort_order: 4,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/logs".to_string(),
                label_zh: "调用日志".to_string(),
                label_en: "Logs".to_string(),
                icon: "HistoryOutlined".to_string(),
                enabled: true,
                sort_order: 5,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/task-logs".to_string(),
                label_zh: "任务日志".to_string(),
                label_en: "Task Logs".to_string(),
                icon: "ScheduleOutlined".to_string(),
                enabled: true,
                sort_order: 6,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/assets".to_string(),
                label_zh: "资产充值".to_string(),
                label_en: "Assets".to_string(),
                icon: "PictureOutlined".to_string(),
                enabled: true,
                sort_order: 7,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/assets-intl".to_string(),
                label_zh: "国际充值".to_string(),
                label_en: "Assets Intl".to_string(),
                icon: "FolderOpenOutlined".to_string(),
                enabled: true,
                sort_order: 8,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/advanced-marketing".to_string(),
                label_zh: "高级推广".to_string(),
                label_en: "Advanced Marketing".to_string(),
                icon: "TeamOutlined".to_string(),
                enabled: true,
                sort_order: 9,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/smart-router".to_string(),
                label_zh: "智能路由".to_string(),
                label_en: "Smart Router".to_string(),
                icon: "ApartmentOutlined".to_string(),
                enabled: true,
                sort_order: 10,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/wallet".to_string(),
                label_zh: "资产中心".to_string(),
                label_en: "Wallet".to_string(),
                icon: "WalletOutlined".to_string(),
                enabled: true,
                sort_order: 11,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/profile".to_string(),
                label_zh: "个人中心".to_string(),
                label_en: "Profile".to_string(),
                icon: "UserOutlined".to_string(),
                enabled: true,
                sort_order: 12,
                allowed_levels: "all".to_string(),
            },
        ],
    }
}

