/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::error::{AppError, AppResult};
use crate::models::{
    AgreementSettings, AllSettings, CurrencySettings, DatabaseSettings, GoogleOAuthSettings,
    LoginSettings, MarketingSettings, PaymentAlipaySettings, PaymentAllinpaySettings,
    PaymentBonuspaySettings, PaymentHyperbcSettings, PaymentStripeSettings, PaymentWechatSettings,
    PublicMarketingSettings, PublicNotificationSettings, PublicPaymentStatus,
    PublicRegistrationSettings, PublicSettings, RegistrationSettings, SMTPSettings, SiteSettings,
    SmsSettings, StorageSettings, UpdateSettingsRequest, WechatOAuthSettings,
};
use crate::AppState;
use axum::{extract::State, Json};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

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
    let registration: RegistrationSettings = get_setting(
        &state,
        "registration_settings",
        default_registration_settings(),
    )
    .await?;
    let marketing: MarketingSettings =
        get_setting(&state, "marketing_settings", default_marketing_settings()).await?;
    let agreement = get_setting(&state, "agreement_settings", default_agreement_settings()).await?;
    let menu_config = get_setting(
        &state,
        "menu_config_settings",
        default_menu_config_settings(),
    )
    .await?;
    let notification: crate::models::NotificationSettings =
        get_setting(&state, "notification_settings", Default::default()).await?;

    // OAuth 仅提取 client_id / app_id，不暴露 secret
    let wechat_oauth_app_id =
        get_setting::<Option<crate::models::WechatOAuthSettings>>(&state, "wechat_oauth", None)
            .await?
            .and_then(|w| {
                if w.app_id.is_empty() {
                    None
                } else {
                    Some(w.app_id)
                }
            });
    let google_oauth_client_id =
        get_setting::<Option<crate::models::GoogleOAuthSettings>>(&state, "google_oauth", None)
            .await?
            .and_then(|g| {
                if g.client_id.is_empty() {
                    None
                } else {
                    Some(g.client_id)
                }
            });

    // 支付渠道仅提取 enabled 开关，不暴露 any 密钥
    let wechat_enabled =
        get_setting::<Option<PaymentWechatSettings>>(&state, "payment_wechat", None)
            .await?
            .map_or(false, |p| p.enabled);
    let alipay_enabled =
        get_setting::<Option<PaymentAlipaySettings>>(&state, "payment_alipay", None)
            .await?
            .map_or(false, |p| p.enabled);
    let stripe_enabled =
        get_setting::<Option<PaymentStripeSettings>>(&state, "payment_stripe", None)
            .await?
            .map_or(false, |p| p.enabled);
    let bonuspay_enabled =
        get_setting::<Option<PaymentBonuspaySettings>>(&state, "payment_bonuspay", None)
            .await?
            .map_or(false, |p| p.enabled);
    let hyperbc_enabled =
        get_setting::<Option<PaymentHyperbcSettings>>(&state, "payment_hyperbc", None)
            .await?
            .map_or(false, |p| p.enabled);
    let allinpay_enabled =
        get_setting::<Option<PaymentAllinpaySettings>>(&state, "payment_allinpay", None)
            .await?
            .map_or(false, |p| p.enabled);

    Ok(Json(PublicSettings {
        is_open_source: cfg!(not(feature = "commercial_plugins")),
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
            hyperbc_enabled,
            allinpay_enabled,
        },
        agreement,
        wechat_oauth_app_id,
        google_oauth_client_id,
        menu_config: Some(menu_config),
        notification: PublicNotificationSettings::from(&notification),
    }))
}

/// 管理员专属接口 — 返回完整设置（含所有密钥），需 admin_middleware 保护
pub async fn get_settings(State(state): State<Arc<AppState>>) -> AppResult<Json<AllSettings>> {
    let mut all = load_all_settings(&state).await?;
    // timesystem 固定 UTC；server_time 为 UTC 朴素字符串，前端按 timedisplay 渲染
    all.server_timezone = Some(crate::time_system::TIMESYSTEM_TZ.to_string());
    all.server_time = Some(crate::time_system::utc_naive_string());
    Ok(Json(all))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<AllSettings>> {
    let mut currency_or_site_changed = false;
    if let Some(v) = request.site {
        merge_and_save_setting(&state, "site_settings", &v, default_site_settings()).await?;
        currency_or_site_changed = true;
    }
    if let Some(v) = request.currency {
        merge_and_save_setting(&state, "currency_settings", &v, default_currency_settings())
            .await?;
        currency_or_site_changed = true;
    }
    if let Some(v) = request.login {
        merge_and_save_setting(&state, "login_settings", &v, default_login_settings()).await?;
    }
    if let Some(v) = request.registration {
        merge_and_save_setting(
            &state,
            "registration_settings",
            &v,
            default_registration_settings(),
        )
        .await?;
    }
    if let Some(v) = request.smtp {
        merge_and_save_setting(&state, "smtp_settings", &v, default_smtp_settings()).await?;
    }
    if let Some(v) = request.sms {
        merge_and_save_setting(&state, "sms_settings", &v, default_sms_settings()).await?;
    }
    if let Some(v) = request.marketing {
        merge_and_save_setting(
            &state,
            "marketing_settings",
            &v,
            default_marketing_settings(),
        )
        .await?;
    }
    if let Some(ref v_json) = request.database {
        let final_db_settings = merge_and_save_setting::<DatabaseSettings>(
            &state,
            "database_settings",
            v_json,
            default_database_settings(),
        )
        .await?;
        let v = &final_db_settings;
        // 1. 拼接新数据库的连接字符串
        let ssl_mode = if v.ssl_mode { "require" } else { "disable" };
        let mut url = format!("postgres://{}", urlencoding::encode(&v.username));
        if !v.password.is_empty() {
            url.push_str(&format!(":{}", urlencoding::encode(&v.password)));
        }
        url.push_str(&format!(
            "@{}:{}/{}?sslmode={}",
            v.host, v.port, v.database, ssl_mode
        ));

        // 2. 测试新数据库是否能正常连接
        let pool = match PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(&url)
            .await
        {
            Ok(p) => p,
            Err(e) => {
                return Err(AppError::BadRequest(format!(
                    "无法连接到新数据库，配置未保存: {}",
                    e
                )))
            }
        };

        // 3. 在新数据库上执行迁移，创建表结构
        if let Err(e) = crate::db::migrations::run_pg(&pool).await {
            return Err(AppError::BadRequest(format!(
                "新数据库初始化迁移失败: {}",
                e
            )));
        }


        // 5. 复制系统设置表记录（从当前数据库同步拷贝至新数据库）
        if let Ok(current_settings) =
            sqlx::query_as::<_, (String, String)>("SELECT key, value FROM settings")
                .fetch_all(&state.db.pool)
                .await
        {
            for (key, val) in current_settings {
                let key_exists: i64 =
                    sqlx::query_scalar("SELECT COUNT(*) FROM settings WHERE key = $1")
                        .bind(&key)
                        .fetch_one(&pool)
                        .await
                        .unwrap_or(0);
                if key_exists == 0 || key == "database_settings" {
                    let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
                        .bind(&key)
                        .bind(&val)
                        .execute(&pool)
                        .await;
                }
            }
        }

        // 也专门将新配置保存到新库的 database_settings 中
        let val = serde_json::to_string(v).unwrap_or_default();
        let _ = sqlx::query("INSERT INTO settings (key, value) VALUES ('database_settings', $1) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(&val)
            .execute(&pool)
            .await;

        // 6. 写入持久化配置文件 `data/.database_url`
        let db_url_file = format!("{}/.database_url", state.config.data_dir);
        if let Err(e) = std::fs::write(&db_url_file, &url) {
            return Err(AppError::Internal(format!("写入数据库配置文件失败: {}", e)));
        }

        // 7. 延时重启服务，使新连接生效
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            tracing::info!("🔄 数据库设置已变更，服务正在重启以应用新连接...");
            std::process::exit(0);
        });
    }
    if let Some(v) = request.payment_wechat {
        merge_and_save_setting::<PaymentWechatSettings>(
            &state,
            "payment_wechat",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.payment_alipay {
        merge_and_save_setting::<PaymentAlipaySettings>(
            &state,
            "payment_alipay",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.payment_stripe {
        merge_and_save_setting::<PaymentStripeSettings>(
            &state,
            "payment_stripe",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.payment_bonuspay {
        merge_and_save_setting::<PaymentBonuspaySettings>(
            &state,
            "payment_bonuspay",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.payment_hyperbc {
        merge_and_save_setting::<PaymentHyperbcSettings>(
            &state,
            "payment_hyperbc",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.payment_allinpay {
        merge_and_save_setting::<PaymentAllinpaySettings>(
            &state,
            "payment_allinpay",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.google_oauth {
        merge_and_save_setting::<GoogleOAuthSettings>(
            &state,
            "google_oauth",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.wechat_oauth {
        merge_and_save_setting::<WechatOAuthSettings>(
            &state,
            "wechat_oauth",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.agreement {
        merge_and_save_setting(
            &state,
            "agreement_settings",
            &v,
            default_agreement_settings(),
        )
        .await?;
    }
    if let Some(v) = request.storage {
        merge_and_save_setting::<StorageSettings>(
            &state,
            "storage_settings",
            &v,
            Default::default(),
        )
        .await?;
    }
    if let Some(v) = request.menu_config {
        merge_and_save_setting(
            &state,
            "menu_config_settings",
            &v,
            default_menu_config_settings(),
        )
        .await?;
    }
    if let Some(v) = request.notification {
        merge_and_save_setting(
            &state,
            "notification_settings",
            &v,
            crate::models::NotificationSettings::default(),
        )
        .await?;
    }

    if currency_or_site_changed {
        crate::api::plugins::notify_marketplace_data_changed(&state).await;
    }

    let mut all = load_all_settings(&state).await?;
    // timesystem 固定 UTC；server_time 为 UTC 朴素字符串，前端按 timedisplay 渲染
    all.server_timezone = Some(crate::time_system::TIMESYSTEM_TZ.to_string());
    all.server_time = Some(crate::time_system::utc_naive_string());
    Ok(Json(all))
}

/// 发送测试邮件
pub async fn test_email(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let to = body["to"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("缺少收件邮箱 to".to_string()))?;
    let smtp =
        get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings()).await?;
    let svc = crate::services::email::EmailService::new(&smtp)?;
    svc.send_test_email(to).await?;
    Ok(Json(
        serde_json::json!({"success": true, "message": "测试邮件发送成功"}),
    ))
}

/// 发送测试短信
pub async fn test_sms(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let mobile = body["mobile"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("缺少手机号 mobile".to_string()))?;
    let sms = get_setting::<SmsSettings>(&state, "sms_settings", default_sms_settings()).await?;
    if sms.secret_id.is_empty() || sms.secret_key.is_empty() {
        return Err(AppError::BadRequest("请先完善短信通知配置".to_string()));
    }
    let svc = crate::services::sms::SmsService::new(&sms);
    svc.send_verification_code(mobile, "666666").await?;
    Ok(Json(
        serde_json::json!({"success": true, "message": "测试短信发送成功"}),
    ))
}

/// 测试发送余额不足提醒（邮件 / 短信）
/// body: { channel: "email"|"sms", to?: email, mobile?: phone, balance?: "88.0000", threshold?: "100.0000",
///         subject?: "...", html?: "..." }  — subject/html 可传草稿内容做预览发送，不传则用已保存配置
pub async fn test_low_balance_notification(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let channel = body["channel"]
        .as_str()
        .unwrap_or("email")
        .to_ascii_lowercase();
    let balance = body["balance"].as_str().unwrap_or("88.0000").to_string();
    let threshold = body["threshold"].as_str().unwrap_or("100.0000").to_string();

    let notif = get_setting::<crate::models::NotificationSettings>(
        &state,
        "notification_settings",
        crate::models::NotificationSettings::default(),
    )
    .await?;

    match channel.as_str() {
        "email" => {
            let to = body["to"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("缺少收件邮箱 to".to_string()))?;
            let smtp =
                get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings())
                    .await?;
            if smtp.host.trim().is_empty() || smtp.from_address.trim().is_empty() {
                return Err(AppError::BadRequest(
                    "请先在「邮件通知」中完善 SMTP 配置".to_string(),
                ));
            }
            let subject_tpl = body["subject"]
                .as_str()
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| {
                    if notif.low_balance_email_subject.trim().is_empty() {
                        crate::models::default_low_balance_email_subject()
                    } else {
                        notif.low_balance_email_subject.clone()
                    }
                });
            let html_tpl = body["html"]
                .as_str()
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| {
                    if notif.low_balance_email_html.trim().is_empty() {
                        crate::models::default_low_balance_email_html()
                    } else {
                        notif.low_balance_email_html.clone()
                    }
                });
            let svc = crate::services::email::EmailService::new(&smtp)?;
            svc.send_low_balance_alert(to, &balance, &threshold, &subject_tpl, &html_tpl)
                .await?;
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "余额提醒测试邮件已发送"
            })))
        }
        "sms" => {
            let mobile = body["mobile"]
                .as_str()
                .ok_or_else(|| AppError::BadRequest("缺少手机号 mobile".to_string()))?;
            let sms =
                get_setting::<SmsSettings>(&state, "sms_settings", default_sms_settings()).await?;
            if sms.secret_id.is_empty() || sms.secret_key.is_empty() {
                return Err(AppError::BadRequest(
                    "请先在「短信通知」中完善短信配置".to_string(),
                ));
            }
            if sms.balance_template_id.trim().is_empty() {
                return Err(AppError::BadRequest(
                    "请先在「短信通知」中配置余额提醒模板 ID".to_string(),
                ));
            }
            let svc = crate::services::sms::SmsService::new(&sms);
            svc.send_with_template(
                mobile,
                &sms.balance_template_id,
                &[balance.clone(), threshold.clone()],
            )
            .await?;
            Ok(Json(serde_json::json!({
                "success": true,
                "message": "余额提醒测试短信已发送"
            })))
        }
        _ => Err(AppError::BadRequest(
            "channel 仅支持 email 或 sms".to_string(),
        )),
    }
}

pub async fn verify_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode {
            "require"
        } else {
            "disable"
        };
        let mut url = format!("postgres://{}", urlencoding::encode(&settings.username));
        if !settings.password.is_empty() {
            url.push_str(&format!(":{}", urlencoding::encode(&settings.password)));
        }
        url.push_str(&format!(
            "@{}:{}/{}?sslmode={}",
            settings.host, settings.port, settings.database, ssl_mode
        ));

        match PgPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(&url)
            .await
        {
            Ok(_) => Ok(Json(
                serde_json::json!({"success": true, "message": "连接成功"}),
            )),
            Err(e) => Ok(Json(
                serde_json::json!({"success": false, "message": format!("连接失败: {}", e)}),
            )),
        }
    } else {
        Ok(Json(
            serde_json::json!({"success": false, "message": "仅支持 PostgreSQL"}),
        ))
    }
}

pub async fn initialize_database(
    State(_state): State<Arc<AppState>>,
    Json(settings): Json<DatabaseSettings>,
) -> AppResult<Json<serde_json::Value>> {
    if settings.db_type == "postgres" {
        let ssl_mode = if settings.ssl_mode {
            "require"
        } else {
            "disable"
        };
        let mut url = format!("postgres://{}", urlencoding::encode(&settings.username));
        if !settings.password.is_empty() {
            url.push_str(&format!(":{}", urlencoding::encode(&settings.password)));
        }
        url.push_str(&format!(
            "@{}:{}/{}?sslmode={}",
            settings.host, settings.port, settings.database, ssl_mode
        ));

        match PgPoolOptions::new().max_connections(1).connect(&url).await {
            Ok(pool) => {
                if let Err(e) = crate::db::migrations::run_pg(&pool).await {
                    return Ok(Json(
                        serde_json::json!({"success": false, "message": format!("数据库初始化失败: {}", e)}),
                    ));
                }
                Ok(Json(
                    serde_json::json!({"success": true, "message": "数据库初始化成功"}),
                ))
            }
            Err(e) => Ok(Json(
                serde_json::json!({"success": false, "message": format!("无法连接到数据库: {}", e)}),
            )),
        }
    } else {
        Ok(Json(
            serde_json::json!({"success": false, "message": "仅支持对 PostgreSQL 进行初始化"}),
        ))
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
        let output = std::process::Command::new("bash").arg(path).output();

        return match output {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                // 提取脚本输出的最后几行作为关键信息返回，避免过长
                let msg = stdout
                    .lines()
                    .rev()
                    .take(3)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join("\n");
                Ok(Json(
                    serde_json::json!({"success": true, "message": format!("备份成功:\n{}", msg)}),
                ))
            }
            Ok(out) => {
                let err_str = String::from_utf8_lossy(&out.stderr);
                Ok(Json(
                    serde_json::json!({"success": false, "message": format!("备份脚本执行失败:\n{}", err_str)}),
                ))
            }
            Err(e) => Ok(Json(
                serde_json::json!({"success": false, "message": format!("执行备份脚本异常: {}", e)}),
            )),
        };
    }

    let db_url = &state.config.database_url;
    let now = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_name = format!("tb{}", now);

    // Ensure data directory exists
    if let Err(e) = std::fs::create_dir_all("data") {
        return Ok(Json(
            serde_json::json!({"success": false, "message": format!("无法创建备份目录: {}", e)}),
        ));
    }

    if db_url.starts_with("postgres:") || db_url.starts_with("postgresql:") {
        let output_path = format!("data/{}.sql", file_name);

        // 严谨校验与解析，防止命令行注入或参数劫持
        let parsed_url = match reqwest::Url::parse(db_url) {
            Ok(url) => url,
            Err(e) => {
                return Ok(Json(
                    serde_json::json!({"success": false, "message": format!("数据库连接地址格式错误: {}", e)}),
                ))
            }
        };

        let host = match parsed_url.host_str() {
            Some(h) => h,
            None => {
                return Ok(Json(
                    serde_json::json!({"success": false, "message": "数据库连接地址中缺少主机名"}),
                ))
            }
        };

        let port = parsed_url.port().unwrap_or(5432);
        let username = parsed_url.username();
        let database_name = parsed_url.path().trim_start_matches('/');
        if database_name.is_empty() {
            return Ok(Json(
                serde_json::json!({"success": false, "message": "数据库连接地址中缺少数据库名称"}),
            ));
        }

        // 对用户名和数据库名进行 URL 解码，防止特殊字符或空格 URL 编码导致鉴权/定位失败
        let decoded_username = urlencoding::decode(username)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| username.to_string());

        let decoded_database_name = urlencoding::decode(database_name)
            .map(|cow| cow.into_owned())
            .unwrap_or_else(|_| database_name.to_string());

        // 防御以 - 开头的参数注入
        if host.starts_with('-')
            || decoded_database_name.starts_with('-')
            || decoded_username.starts_with('-')
        {
            return Ok(Json(
                serde_json::json!({"success": false, "message": "不合法的连接参数，拒绝执行备份"}),
            ));
        }

        let mut cmd = std::process::Command::new("pg_dump");
        cmd.arg("-h")
            .arg(host)
            .arg("-p")
            .arg(port.to_string())
            .arg("-U")
            .arg(&decoded_username)
            .arg("-d")
            .arg(&decoded_database_name)
            .arg("-f")
            .arg(&output_path);

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
            Ok(out) if out.status.success() => Ok(Json(
                serde_json::json!({"success": true, "message": format!("数据库备份成功，保存在 {}", output_path)}),
            )),
            Ok(out) => {
                let err_str = String::from_utf8_lossy(&out.stderr);
                Ok(Json(
                    serde_json::json!({"success": false, "message": format!("pg_dump 执行失败: {}", err_str)}),
                ))
            }
            Err(e) => Ok(Json(
                serde_json::json!({"success": false, "message": format!("执行备份程序异常 (系统可能未安装 postgresql-client 命令行工具): {}", e)}),
            )),
        }
    } else {
        Ok(Json(
            serde_json::json!({"success": false, "message": "不支持的数据库类型，暂无法备份"}),
        ))
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
        Ok(_) => Ok(Json(
            serde_json::json!({"success": true, "message": "连接成功，能正常访问指定的 Bucket"}),
        )),
        Err(e) => Ok(Json(
            serde_json::json!({"success": false, "message": format!("测试失败: {}", e)}),
        )),
    }
}

// ======================== 内部工具函数 ========================

/// 加载全部设置（统一入口）
pub async fn load_all_settings(state: &Arc<AppState>) -> AppResult<AllSettings> {
    Ok(AllSettings {
        site: get_setting(state, "site_settings", default_site_settings()).await?,
        currency: get_setting(state, "currency_settings", default_currency_settings()).await?,
        login: get_setting(state, "login_settings", default_login_settings()).await?,
        registration: get_setting(
            state,
            "registration_settings",
            default_registration_settings(),
        )
        .await?,
        smtp: get_setting(state, "smtp_settings", default_smtp_settings()).await?,
        sms: get_setting(state, "sms_settings", None).await?,
        marketing: get_setting(state, "marketing_settings", default_marketing_settings()).await?,
        database: get_setting(state, "database_settings", default_database_settings()).await?,
        payment_wechat: get_setting(state, "payment_wechat", None).await?,
        payment_alipay: get_setting(state, "payment_alipay", None).await?,
        payment_stripe: get_setting(state, "payment_stripe", None).await?,
        payment_bonuspay: get_setting(state, "payment_bonuspay", None).await?,
        payment_hyperbc: get_setting(state, "payment_hyperbc", None).await?,
        payment_allinpay: get_setting(state, "payment_allinpay", None).await?,
        google_oauth: get_setting(state, "google_oauth", None).await?,
        wechat_oauth: get_setting(state, "wechat_oauth", None).await?,
        agreement: get_setting(state, "agreement_settings", default_agreement_settings()).await?,
        storage: get_setting(state, "storage_settings", None).await?,
        menu_config: Some(
            get_setting(
                state,
                "menu_config_settings",
                default_menu_config_settings(),
            )
            .await?,
        ),
        notification: get_setting(state, "notification_settings", Default::default()).await?,
        server_timezone: None,
        server_time: None,
    })
}

async fn get_setting<T: serde::de::DeserializeOwned + Clone>(
    state: &Arc<AppState>,
    key: &str,
    default: T,
) -> AppResult<T> {
    let val: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = ?"),
    )
    .bind(key)
    .fetch_optional(&state.db.pool)
    .await?;
    if let Some(v) = val {
        Ok(serde_json::from_str(&v).unwrap_or(default))
    } else {
        Ok(default)
    }
}

async fn save_setting<T: serde::Serialize>(
    state: &Arc<AppState>,
    key: &str,
    value: &T,
) -> AppResult<()> {
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

fn merge_json(old: &mut serde_json::Value, new: &serde_json::Value) {
    if let (Some(old_obj), Some(new_obj)) = (old.as_object_mut(), new.as_object()) {
        for (k, v) in new_obj {
            if v.is_object() {
                if !old_obj.contains_key(k) {
                    old_obj.insert(k.clone(), serde_json::json!({}));
                }
                merge_json(old_obj.get_mut(k).unwrap(), v);
            } else {
                old_obj.insert(k.clone(), v.clone());
            }
        }
    } else {
        *old = new.clone();
    }
}

async fn merge_and_save_setting<T: serde::de::DeserializeOwned + serde::Serialize + Clone>(
    state: &Arc<AppState>,
    key: &str,
    new_val_json: &serde_json::Value,
    default_val: T,
) -> AppResult<T> {
    let mut current_json = if let Ok(Some(v)) = sqlx::query_scalar::<_, String>(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = ?"),
    )
    .bind(key)
    .fetch_optional(&state.db.pool)
    .await
    {
        serde_json::from_str(&v).unwrap_or_else(|_| serde_json::to_value(&default_val).unwrap())
    } else {
        serde_json::to_value(&default_val).unwrap()
    };

    merge_json(&mut current_json, new_val_json);

    let final_struct: T = serde_json::from_value(current_json)
        .map_err(|e| AppError::BadRequest(format!("配置合并后数据格式错误: {}", e)))?;
    save_setting(state, key, &final_struct).await?;
    Ok(final_struct)
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
        default_timezone: iana_time_zone::get_timezone()
            .unwrap_or_else(|_| "Asia/Shanghai".to_string()),
        show_timezone: true,
        enable_theme_toggle: true,
        default_theme: "dark".to_string(),
        copyright: "© 2026 Tokensbyte. All rights reserved.".to_string(),
        admin_path: "admin1688".to_string(),
        login_style: "split".to_string(),
        login_quote: String::new(),
    }
}

pub fn default_currency_settings() -> CurrencySettings {
    CurrencySettings {
        default_currency: "CNY".to_string(),
        currency_symbol: "¥".to_string(),
        currency_unit: "元".to_string(),
        token_ratio: 1.0,
        auxiliary_currencies: vec![],
        quick_amounts: vec![20.0, 50.0, 100.0, 500.0, 1000.0, 5000.0],
        min_recharge_amount: 5.0,
    }
}

pub async fn get_currency_settings(state: &crate::AppState) -> CurrencySettings {
    sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'currency_settings'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
    .and_then(|v: String| serde_json::from_str::<CurrencySettings>(&v).ok())
    .unwrap_or_else(default_currency_settings)
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
        enable_username_registration: true,
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
        balance_template_id: String::new(),
    }
}

pub fn default_marketing_settings() -> MarketingSettings {
    MarketingSettings {
        enable_registration_gift: false,
        enable_redemption: false,
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
        tos_enabled: false,
        privacy_enabled: false,
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
                    format!(
                        "{}***{}",
                        chars.first().unwrap_or(&'a'),
                        chars.last().unwrap_or(&'z')
                    )
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
                    "is_open_source": cfg!(not(feature = "commercial_plugins")),
                })));
            }
        }
    }

    // git 不可用时回退到编译期预生成的静态数据
    let static_commits_json = include_str!(concat!(env!("OUT_DIR"), "/git_commits.json"));

    let commits: Vec<serde_json::Value> =
        serde_json::from_str(static_commits_json).unwrap_or_else(|_| {
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
        "is_open_source": cfg!(not(feature = "commercial_plugins")),
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
                label_zh: "创作中心".to_string(),
                label_en: "Playground".to_string(),
                icon: "ExperimentOutlined".to_string(),
                enabled: true,
                sort_order: 2,
                allowed_levels: "all".to_string(),
            },
            crate::models::MenuItemConfig {
                key: "/docs".to_string(),
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

#[derive(Debug, sqlx::FromRow)]
pub struct LogRepairItem {
    pub id: i64,
    pub log_id: Option<String>,
    pub user_id: String,
    pub channel_id: Option<i64>,
    pub token_id: Option<i64>,
    pub channel_config_id: Option<i32>,
    pub cost: f64,
    pub pre_deduct_gift: f64,
    pub response_content: String,
}

struct UserRefundDetail {
    balance_refund: f64,
    gift_refund: f64,
}

struct TokenRefundDetail {
    cost_refund: f64,
    user_id: String,
}

struct ChannelRefundDetail {
    cost_refund: f64,
}

struct ConfigRefundDetail {
    cost_refund: f64,
}

struct LogUpdateDetail {
    id: i64,
    error_msg: String,
    billing_detail: String,
}

#[derive(serde::Serialize)]
struct LogRepairDetail {
    pub id: i64,
    pub log_id: Option<String>,
    pub user_id: String,
    pub refund_balance: f64,
    pub refund_gift: f64,
    pub error_message: String,
}

/// 管理员专属接口 — 一键扫描并退款历史 200 状态码但上游实质报错的图片/视频请求日志
pub async fn repair_failed_logs(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    use std::collections::{HashMap, HashSet};

    // 1. 查询所有可能出问题的历史记录（status_code = 200 且 cost > 0.0，且 response_content 不为空，且计费明细含“冻结”）
    // 精确查询包含主键 id 以实现高速行锁定位，排除潜在反序列化字段类型差异
    let rows: Vec<LogRepairItem> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, log_id, user_id, channel_id, token_id, channel_config_id, cost, pre_deduct_gift, response_content \
             FROM logs \
             WHERE status_code = 200 AND cost > 0.0 AND is_completed = 1 AND response_content IS NOT NULL AND billing_detail LIKE '%冻结%' \
             ORDER BY created_at DESC LIMIT 5000"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    let mut potential_log_ids = Vec::new();
    let mut candidates = Vec::new();

    for row in rows {
        // 解析 response_content
        let resp_json: serde_json::Value = match serde_json::from_str(&row.response_content) {
            Ok(j) => j,
            Err(_) => continue,
        };

        // 精准判定是否是上游业务报错
        if crate::relay::response_formatter::is_upstream_error_response(&resp_json) {
            potential_log_ids.push(row.id);
            candidates.push((row, resp_json));
        }
    }

    if potential_log_ids.is_empty() {
        return Ok(Json(serde_json::json!({
            "success": true,
            "repaired_count": 0,
            "refunded_balance": 0.0,
            "refunded_gift_balance": 0.0,
        })));
    }

    // 启动大事务，确保本次数据订正操作的绝对完整性
    let mut tx = state.db.pool.begin().await?;

    // 【第一步】行级排他锁，锁住选中的这一批 logs 记录，进行防并发、防二次重复退款的校验
    let locked_logs: Vec<(i64, f64, i32)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT id, cost, status_code FROM logs WHERE id = ANY(?) FOR UPDATE"),
    )
    .bind(&potential_log_ids)
    .fetch_all(&mut *tx)
    .await?;

    // 筛选出尚未被其他事务订正过的有效日志集合 (status_code == 200)
    let valid_log_ids: HashSet<i64> = locked_logs
        .into_iter()
        .filter(|(_, cost, status_code)| *status_code == 200 && *cost > 0.0)
        .map(|(id, _, _)| id)
        .collect();

    // 【第二步】进行多大表数据退款及用额回滚的合并聚合
    let mut final_user_refunds: HashMap<String, UserRefundDetail> = HashMap::new();
    let mut final_token_refunds: HashMap<i64, TokenRefundDetail> = HashMap::new();
    let mut final_channel_refunds: HashMap<i64, ChannelRefundDetail> = HashMap::new();
    let mut final_config_refunds: HashMap<i64, ConfigRefundDetail> = HashMap::new();
    let mut final_log_updates: Vec<LogUpdateDetail> = Vec::new();
    let mut details = Vec::new();

    let mut repaired_count = 0;
    let mut total_refund_balance = 0.0;
    let mut total_refund_gift = 0.0;

    for (row, resp_json) in candidates {
        if !valid_log_ids.contains(&row.id) {
            continue;
        }

        let error_msg = crate::relay::response_formatter::extract_error_message(&resp_json);
        let billing_detail = format!("历史数据自动订正退款，原始错误: {}", error_msg);
        let balance_refund = row.cost - row.pre_deduct_gift;
        let gift_refund = row.pre_deduct_gift;

        // 聚合用户退款
        let user_entry =
            final_user_refunds
                .entry(row.user_id.clone())
                .or_insert(UserRefundDetail {
                    balance_refund: 0.0,
                    gift_refund: 0.0,
                });
        user_entry.balance_refund += balance_refund;
        user_entry.gift_refund += gift_refund;

        // 聚合令牌额度回滚
        if let Some(token_id) = row.token_id {
            let token_entry = final_token_refunds
                .entry(token_id)
                .or_insert(TokenRefundDetail {
                    cost_refund: 0.0,
                    user_id: row.user_id.clone(),
                });
            token_entry.cost_refund += row.cost;
        }

        // 聚合渠道额度回滚
        if let Some(channel_id) = row.channel_id {
            let channel_entry = final_channel_refunds
                .entry(channel_id)
                .or_insert(ChannelRefundDetail { cost_refund: 0.0 });
            channel_entry.cost_refund += row.cost;
        }

        // 聚合上游预设额度回滚（与主退款路径 refund_config 对齐）
        if let Some(cfg_id) = row.channel_config_id {
            if cfg_id > 0 {
                let config_entry = final_config_refunds
                    .entry(cfg_id as i64)
                    .or_insert(ConfigRefundDetail { cost_refund: 0.0 });
                config_entry.cost_refund += row.cost;
            }
        }

        final_log_updates.push(LogUpdateDetail {
            id: row.id,
            error_msg: error_msg.clone(),
            billing_detail,
        });

        details.push(LogRepairDetail {
            id: row.id,
            log_id: row.log_id.clone(),
            user_id: row.user_id.clone(),
            refund_balance: balance_refund,
            refund_gift: gift_refund,
            error_message: error_msg,
        });

        repaired_count += 1;
        total_refund_balance += balance_refund;
        total_refund_gift += gift_refund;
    }

    // 若锁校验后发现已无可订正的日志（代表全是重复请求），则立刻安全回滚并放行
    if repaired_count == 0 {
        let _ = tx.rollback().await;
        return Ok(Json(serde_json::json!({
            "success": true,
            "repaired_count": 0,
            "refunded_balance": 0.0,
            "refunded_gift_balance": 0.0,
        })));
    }

    // 【第三步】按 user_id 排序后，直接依次合并更新用户钱包与用额用量（利用 UPDATE 隐式行锁防并发死锁）
    let mut sorted_user_ids: Vec<String> = final_user_refunds.keys().cloned().collect();
    sorted_user_ids.sort();

    for user_id in sorted_user_ids {
        if let Some(refund) = final_user_refunds.get(&user_id) {
            sqlx::query(&state.db.format_query(
                "UPDATE users SET \
                       balance = balance + ?, \
                       gift_balance = gift_balance + ?, \
                       used_quota = used_quota - ?, \
                       gift_used_quota = gift_used_quota - ?, \
                       updated_at = CURRENT_TIMESTAMP \
                     WHERE id = ?",
            ))
            .bind(refund.balance_refund)
            .bind(refund.gift_refund)
            .bind(refund.balance_refund)
            .bind(refund.gift_refund)
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    let (site_tz, _) = crate::relay::get_cached_config(&state).await;

    // 【第四步】按 token_id 排序后合并退回令牌额度（总额 + 当期日/周/月；按令牌所属用户 timedisplay）
    let mut sorted_token_ids: Vec<i64> = final_token_refunds.keys().cloned().collect();
    sorted_token_ids.sort();

    for token_id in sorted_token_ids {
        if let Some(refund) = final_token_refunds.get(&token_id) {
            let user_td = crate::api::date_helper::resolve_user_timedisplay_name(
                &state.db,
                &refund.user_id,
                &site_tz,
            )
            .await;
            crate::relay::token_quota::refund(
                &state.db,
                &mut tx,
                token_id,
                refund.cost_refund,
                &user_td,
            )
            .await?;
            state
                .quota_memory
                .apply_refund_ensured(&state.db, token_id, &user_td, refund.cost_refund)
                .await;
        }
    }

    // 【第五步】按 channel_id 排序后，直接依次合并更新渠道已用额度（利用 UPDATE 隐式行锁防死锁）
    let mut sorted_channel_ids: Vec<i64> = final_channel_refunds.keys().cloned().collect();
    sorted_channel_ids.sort();
    for channel_id in sorted_channel_ids {
        if let Some(refund) = final_channel_refunds.get(&channel_id) {
            crate::relay::channel_quota::refund_channel(
                &state.db,
                &mut tx,
                channel_id,
                refund.cost_refund,
                &site_tz,
            )
            .await?;
        }
    }

    // 【第五步 b】按 channel_config_id 排序后退回上游预设额度（与 execute_refund_tx 对齐）
    let mut sorted_config_ids: Vec<i64> = final_config_refunds.keys().cloned().collect();
    sorted_config_ids.sort();
    for config_id in sorted_config_ids {
        if let Some(refund) = final_config_refunds.get(&config_id) {
            crate::relay::channel_quota::refund_config(
                &state.db,
                &mut tx,
                config_id,
                refund.cost_refund,
                &site_tz,
            )
            .await?;
        }
    }

    // 【第六步】逐一更新对应日志的费用（清零）、状态（400 失败）及订正说明
    for update in final_log_updates {
        sqlx::query(
            &state.db.format_query(
                "UPDATE logs SET cost = 0.0, pre_deduct_gift = 0.0, status_code = 400, error_message = ?, billing_detail = ? WHERE id = ?"
            )
        )
        .bind(&update.error_msg)
        .bind(&update.billing_detail)
        .bind(update.id)
        .execute(&mut *tx)
        .await?;
    }

    // 提交全局事务
    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "repaired_count": repaired_count,
        "refunded_balance": total_refund_balance,
        "refunded_gift_balance": total_refund_gift,
        "details": details,
    })))
}
