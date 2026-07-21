use crate::auth;
use crate::models::{CreateRedemptionRequest, RedeemRequest, Redemption, RedemptionListResponse};
use crate::AppState;
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use std::sync::Arc;

use crate::error::{AppError, AppResult};

use rand::{distributions::Alphanumeric, Rng};

/// Admin: List all redemption codes
pub async fn list_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<RedemptionListResponse>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    let redemptions: Vec<Redemption> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM redemptions ORDER BY id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let total = redemptions.len() as i64;
    Ok(Json(RedemptionListResponse {
        data: redemptions,
        total,
    }))
}

/// Admin: Bulk generate redemption codes
pub async fn generate_redemptions(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<CreateRedemptionRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    if request.count <= 0 || request.count > 1000 {
        return Err(AppError::BadRequest(
            "Count must be between 1 and 1000".to_string(),
        ));
    }
    if request.quota <= 0.0 {
        return Err(AppError::BadRequest("额度必须大于 0".to_string()));
    }

    let (tz_name, _) = crate::relay::get_cached_config(&state).await;
    let expires_at = if request.permanent {
        None
    } else {
        let Some(ref exp) = request.expires_at else {
            return Err(AppError::BadRequest(
                "请设置有效期，或选择长期有效".to_string(),
            ));
        };
        Some(normalize_expiry_date(exp, &tz_name)?)
    };

    let (max_uses, per_user_limit) = if request.allow_multiple {
        if request.max_uses < -1 || request.per_user_limit < -1 {
            return Err(AppError::BadRequest(
                "兑换次数无效（-1 表示不限制）".to_string(),
            ));
        }
        // 约定 -1 = 不限；兼容前端/历史传入的 0，统一落库为 -1
        (
            if request.max_uses == 0 {
                -1
            } else {
                request.max_uses
            },
            if request.per_user_limit == 0 {
                -1
            } else {
                request.per_user_limit
            },
        )
    } else {
        (1, 1)
    };

    let mut codes = Vec::new();
    let mut tx = state.db.pool.begin().await?;

    for _ in 0..request.count {
        // 8 位大写字母+数字，便于复制使用；冲突时重试
        let mut code = String::new();
        for attempt in 0..16 {
            code = rand::thread_rng()
                .sample_iter(&Alphanumeric)
                .take(8)
                .map(|c| (c as char).to_ascii_uppercase())
                .collect();
            let exists: Option<i64> = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT id FROM redemptions WHERE code = ? LIMIT 1"),
            )
            .bind(&code)
            .fetch_optional(&mut *tx)
            .await?;
            if exists.is_none() {
                break;
            }
            if attempt == 15 {
                return Err(AppError::BadRequest("生成兑换码失败，请重试".to_string()));
            }
        }

        sqlx::query(&state.db.format_query(
            "INSERT INTO redemptions (name, code, quota, expires_at, max_uses, used_count, per_user_limit, is_used) \
             VALUES (?, ?, ?, ?, ?, 0, ?, 0)"
        ))
        .bind(&request.name)
        .bind(&code)
        .bind(request.quota)
        .bind(&expires_at)
        .bind(max_uses)
        .bind(per_user_limit)
        .execute(&mut *tx)
        .await?;

        codes.push(code);
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "count": request.count,
        "codes": codes
    })))
}

/// Admin: Delete a redemption code
pub async fn delete_redemption(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    if claims.role != "admin" {
        return Err(AppError::Forbidden("Admin only".to_string()));
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM redemptions WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// 将有效期规范为 `YYYY-MM-DD`（按站点时区取日历日），便于前后端一致判定。
fn normalize_expiry_date(raw: &str, tz_name: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "请设置有效期，或选择长期有效".to_string(),
        ));
    }
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Asia::Shanghai);

    if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        return Ok(d.format("%Y-%m-%d").to_string());
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        return Ok(ndt.date().format("%Y-%m-%d").to_string());
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%dT%H:%M:%S") {
        return Ok(ndt.date().format("%Y-%m-%d").to_string());
    }
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(trimmed) {
        return Ok(dt
            .with_timezone(&tz)
            .date_naive()
            .format("%Y-%m-%d")
            .to_string());
    }
    Err(AppError::BadRequest("有效期格式不正确".to_string()))
}

/// 过期判定：无时区字符串按站点默认时区墙钟解释；纯日期则该日结束（次日 00:00）前仍有效。
fn is_expired(expires_at: Option<&str>, tz_name: &str) -> bool {
    let Some(exp) = expires_at.map(str::trim).filter(|s| !s.is_empty()) else {
        return false; // 长期有效
    };
    let tz: chrono_tz::Tz = tz_name.parse().unwrap_or(chrono_tz::Asia::Shanghai);
    let now = chrono::Utc::now().with_timezone(&tz);

    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(exp) {
        return dt.with_timezone(&tz) < now;
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            return local < now;
        }
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%dT%H:%M:%S") {
        if let Some(local) = ndt.and_local_timezone(tz).latest() {
            return local < now;
        }
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
        // 日期当天结束仍有效：站点时区下「过期日 + 1 天 00:00」起算过期
        if let Some(next) = d.succ_opt() {
            if let Some(end) = next
                .and_hms_opt(0, 0, 0)
                .and_then(|ndt| ndt.and_local_timezone(tz).latest())
            {
                return now >= end;
            }
        }
    }
    false
}

/// User: Redeem a code to balance
pub async fn redeem_code(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(request): Json<RedeemRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let settings = crate::api::settings::load_all_settings(&state).await?;
    if !settings.marketing.enable_redemption {
        return Err(AppError::Forbidden("兑换功能未开启".to_string()));
    }

    let code = request.code.trim().to_ascii_uppercase();
    if code.is_empty() {
        return Err(AppError::BadRequest("请输入兑换码".to_string()));
    }

    let user_id = claims.sub;

    // Start transaction to ensure atomicity
    let mut tx = state.db.pool.begin().await?;

    let existing: Option<Redemption> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM redemptions WHERE code = ? LIMIT 1 FOR UPDATE"),
    )
    .bind(&code)
    .fetch_optional(&mut *tx)
    .await?;

    let redemption = match existing {
        None => {
            return Err(AppError::BadRequest("兑换码无效，请检查后重试".to_string()));
        }
        Some(r) => r,
    };

    let tz_name = {
        let t = settings.site.default_timezone.trim();
        if t.is_empty() {
            "Asia/Shanghai".to_string()
        } else {
            t.to_string()
        }
    };
    if is_expired(redemption.expires_at.as_deref(), &tz_name) {
        return Err(AppError::BadRequest("兑换码已过期".to_string()));
    }

    // 单兑换码次数：<=0（-1 约定 / 历史 0）表示不限；兼容旧单次码 is_used
    let max_uses = redemption.max_uses;
    if max_uses > 0 && redemption.used_count >= max_uses {
        return Err(AppError::BadRequest("该兑换码兑换次数已用完".to_string()));
    }
    if max_uses == 1 && redemption.is_used != 0 && redemption.used_count == 0 {
        // 旧数据兜底
        return Err(AppError::BadRequest("该兑换码已被使用".to_string()));
    }

    // 单兑换码单用户限制：<=0（-1 约定 / 历史 0）表示不限
    let per_user_limit = redemption.per_user_limit;
    if per_user_limit > 0 {
        let user_used: i64 = sqlx::query_scalar(&state.db.format_query(
            "SELECT COUNT(*) FROM redemption_logs WHERE redemption_id = ? AND user_id = ?",
        ))
        .bind(redemption.id)
        .bind(&user_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0);

        // 兼容旧单次码：无 logs 时用 used_by 判断
        let legacy_used = redemption.used_by.as_deref() == Some(user_id.as_str())
            && user_used == 0
            && redemption.is_used != 0
            && max_uses == 1;

        if legacy_used || user_used >= per_user_limit as i64 {
            return Err(AppError::BadRequest(
                "您已达到该兑换码的兑换次数上限".to_string(),
            ));
        }
    }

    // 入账
    sqlx::query(&state.db.format_query(
        "UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ))
    .bind(redemption.quota)
    .bind(&user_id)
    .execute(&mut *tx)
    .await?;

    // 写兑换日志
    sqlx::query(&state.db.format_query(
        "INSERT INTO redemption_logs (redemption_id, user_id, amount) VALUES (?, ?, ?)",
    ))
    .bind(redemption.id)
    .bind(&user_id)
    .bind(redemption.quota)
    .execute(&mut *tx)
    .await?;

    let new_count = redemption.used_count + 1;
    let exhausted = max_uses > 0 && new_count >= max_uses;

    sqlx::query(&state.db.format_query(
        "UPDATE redemptions SET \
         used_count = ?, \
         is_used = CASE WHEN ? THEN 1 ELSE is_used END, \
         used_at = CURRENT_TIMESTAMP, \
         used_by = ?, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?",
    ))
    .bind(new_count)
    .bind(exhausted)
    .bind(&user_id)
    .bind(redemption.id)
    .execute(&mut *tx)
    .await?;

    // 充值记录
    let recharge_id: i64 = sqlx::query_scalar::<_, i64>(
        &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'redemption', ?) RETURNING id")
    )
    .bind(&user_id)
    .bind(redemption.quota)
    .bind(format!("兑换码: {}", redemption.name))
    .fetch_one(&mut *tx)
    .await?;

    if let Err(e) = crate::services::affiliate::award_commission(
        &state.db,
        &mut tx,
        &user_id,
        recharge_id,
        redemption.quota,
    )
    .await
    {
        tracing::error!(
            "Failed to award commission for redemption {}: {}",
            recharge_id,
            e
        );
    }

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "quota_added": redemption.quota
    })))
}
