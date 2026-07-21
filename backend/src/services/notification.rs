//! 用户通知订阅：低余额邮件/短信提醒
//! 尊重 users.notification_preferences 与站点 notification_settings

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppResult;
use crate::services::email::EmailService;
use crate::services::sms::SmsService;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserNotificationPrefs {
    #[serde(default = "default_true")]
    pub web_notification: bool,
    #[serde(default)]
    pub email_notification: bool,
    #[serde(default)]
    pub push_notification: bool,
    #[serde(default)]
    pub sms_notification: bool,
    #[serde(default = "default_threshold")]
    pub low_balance_threshold: f64,
    /// 勿扰：开启后屏蔽全部通道
    #[serde(default)]
    pub do_not_disturb: bool,
    /// 兼容旧字段 mute_preference: "none" | "all"
    #[serde(default)]
    pub mute_preference: Option<String>,
    /// 本轮低余额提醒是否已发送（余额回升后清零，避免重复轰炸）
    #[serde(default)]
    pub low_balance_alert_active: bool,
}

fn default_true() -> bool {
    true
}
fn default_threshold() -> f64 {
    100.0
}

impl Default for UserNotificationPrefs {
    fn default() -> Self {
        Self {
            web_notification: true,
            email_notification: false,
            push_notification: false,
            sms_notification: false,
            low_balance_threshold: 100.0,
            do_not_disturb: false,
            mute_preference: None,
            low_balance_alert_active: false,
        }
    }
}

impl UserNotificationPrefs {
    pub fn from_json(raw: Option<&str>) -> Self {
        let mut prefs = raw
            .and_then(|s| serde_json::from_str::<UserNotificationPrefs>(s).ok())
            .unwrap_or_default();
        if !prefs.do_not_disturb {
            if let Some(ref m) = prefs.mute_preference {
                if m == "all" {
                    prefs.do_not_disturb = true;
                }
            }
        }
        prefs
    }

    pub fn is_muted(&self) -> bool {
        self.do_not_disturb
    }
}

/// 计费后异步检查：余额低于阈值时按用户偏好发送提醒
pub async fn check_and_notify_low_balance(state: &Arc<AppState>, user_id: &str) {
    if let Err(e) = check_and_notify_low_balance_inner(state, user_id).await {
        tracing::warn!("[LowBalanceNotify] user={} err={}", user_id, e);
    }
}

async fn check_and_notify_low_balance_inner(state: &Arc<AppState>, user_id: &str) -> AppResult<()> {
    let row: Option<(f64, f64, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT balance, gift_balance, email, mobile, notification_preferences FROM users WHERE id = ?",
        ),
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((balance, gift_balance, email, mobile, prefs_raw)) = row else {
        return Ok(());
    };

    let settings = crate::api::settings::load_all_settings(state).await?;
    let site_notif = &settings.notification;
    if !site_notif.site_notification_enabled {
        return Ok(());
    }

    let mut prefs = UserNotificationPrefs::from_json(prefs_raw.as_deref());
    // 用户未自定义阈值时，用站点默认
    if prefs_raw.is_none() {
        prefs.low_balance_threshold = site_notif.low_balance_threshold;
    }

    let total = balance + gift_balance;
    let threshold = if prefs.low_balance_threshold > 0.0 {
        prefs.low_balance_threshold
    } else {
        site_notif.low_balance_threshold
    };

    // 余额已回升：清除提醒标记，便于下次跌破再提醒
    if total >= threshold {
        if prefs.low_balance_alert_active {
            prefs.low_balance_alert_active = false;
            save_prefs(state, user_id, &prefs).await?;
        }
        return Ok(());
    }

    // 仍低于阈值但本轮已提醒过
    if prefs.low_balance_alert_active {
        return Ok(());
    }

    // 管理端关闭勿扰能力时，忽略用户勿扰偏好
    if prefs.is_muted() && site_notif.do_not_disturb_enabled {
        return Ok(());
    }

    let want_email = site_notif.email_balance_notification && prefs.email_notification;
    let want_sms = site_notif.sms_balance_notification && prefs.sms_notification;

    if !want_email && !want_sms {
        return Ok(());
    }

    let balance_str = crate::money::format_money(total);
    let threshold_str = crate::money::format_money(threshold);
    let mut sent_any = false;

    if want_email {
        if let Some(ref to) = email {
            if !to.is_empty() && !to.ends_with("@tokensbyte.local") {
                match EmailService::new(&settings.smtp) {
                    Ok(svc) => {
                        let subject_tpl = if site_notif.low_balance_email_subject.trim().is_empty()
                        {
                            crate::models::default_low_balance_email_subject()
                        } else {
                            site_notif.low_balance_email_subject.clone()
                        };
                        let html_tpl = if site_notif.low_balance_email_html.trim().is_empty() {
                            crate::models::default_low_balance_email_html()
                        } else {
                            site_notif.low_balance_email_html.clone()
                        };
                        if let Err(e) = svc
                            .send_low_balance_alert(
                                to,
                                &balance_str,
                                &threshold_str,
                                &subject_tpl,
                                &html_tpl,
                            )
                            .await
                        {
                            tracing::warn!(
                                "[LowBalanceNotify] email failed user={}: {}",
                                user_id,
                                e
                            );
                        } else {
                            sent_any = true;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("[LowBalanceNotify] smtp init failed: {}", e);
                    }
                }
            }
        }
    }

    if want_sms {
        if let Some(ref phone) = mobile {
            if !phone.is_empty() {
                if let Some(ref sms_settings) = settings.sms {
                    if !sms_settings.balance_template_id.trim().is_empty() {
                        let svc = SmsService::new(sms_settings);
                        if let Err(e) = svc
                            .send_with_template(
                                phone,
                                &sms_settings.balance_template_id,
                                &[balance_str.clone(), threshold_str.clone()],
                            )
                            .await
                        {
                            tracing::warn!("[LowBalanceNotify] sms failed user={}: {}", user_id, e);
                        } else {
                            sent_any = true;
                        }
                    } else {
                        tracing::debug!(
                            "[LowBalanceNotify] sms skipped: balance_template_id not configured"
                        );
                    }
                }
            }
        }
    }

    if sent_any {
        prefs.low_balance_alert_active = true;
        // 持久化时去掉 mute_preference 旧字段干扰，保留 do_not_disturb
        prefs.mute_preference = None;
        save_prefs(state, user_id, &prefs).await?;
    }

    Ok(())
}

async fn save_prefs(
    state: &Arc<AppState>,
    user_id: &str,
    prefs: &UserNotificationPrefs,
) -> AppResult<()> {
    let json = serde_json::to_string(prefs).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(&state.db.format_query(
        "UPDATE users SET notification_preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(json)
    .bind(user_id)
    .execute(&state.db.pool)
    .await?;
    Ok(())
}

/// 合并用户提交的偏好 JSON，保留服务端内部字段（如 low_balance_alert_active）
pub fn merge_user_prefs_json(existing: Option<&str>, incoming: &str) -> String {
    let mut base: Value = existing
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| Value::Object(Default::default()));
    let Ok(new_val) = serde_json::from_str::<Value>(incoming) else {
        return incoming.to_string();
    };
    if let (Some(base_obj), Some(new_obj)) = (base.as_object_mut(), new_val.as_object()) {
        for (k, v) in new_obj {
            // 用户端不覆盖内部状态字段
            if k == "low_balance_alert_active" {
                continue;
            }
            base_obj.insert(k.clone(), v.clone());
        }
        // 新开关 do_not_disturb 优先；若只传了 mute_preference 也归一化
        if let Some(dnd) = base_obj.get("do_not_disturb").and_then(|v| v.as_bool()) {
            if dnd {
                base_obj.insert("mute_preference".into(), Value::String("all".into()));
            } else {
                base_obj.insert("mute_preference".into(), Value::String("none".into()));
            }
        } else if let Some(m) = base_obj.get("mute_preference").and_then(|v| v.as_str()) {
            base_obj.insert("do_not_disturb".into(), Value::Bool(m == "all"));
        }
    } else {
        base = new_val;
    }
    serde_json::to_string(&base).unwrap_or_else(|_| incoming.to_string())
}
