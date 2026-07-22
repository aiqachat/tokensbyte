/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::Row;
use std::sync::Arc;

use crate::error::AppResult;
use crate::models::{BillingRule, CreateBillingRuleRequest, UpdateBillingRuleRequest};
use crate::AppState;

pub async fn list_rules(State(state): State<Arc<AppState>>) -> AppResult<Json<Vec<BillingRule>>> {
    let rules = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;
    Ok(Json(rules))
}

pub async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(mut req): Json<CreateBillingRuleRequest>,
) -> AppResult<Json<BillingRule>> {
    req.name = req.name.trim().to_string();

    if req.name.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "规则名称不能为空".to_string(),
        ));
    }

    let pricing_tiers_str = serde_json::to_string(&req.pricing_tiers.unwrap_or_default())
        .unwrap_or_else(|_| "[]".to_string());
    let extended_config_str = serde_json::to_string(&req.extended_config.unwrap_or_default())
        .unwrap_or_else(|_| "{}".to_string());

    let exists: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT id FROM billing_rules WHERE name = ?"),
    )
    .bind(&req.name)
    .fetch_optional(&state.db.pool)
    .await?;

    if exists.is_some() {
        return Err(crate::error::AppError::Conflict(
            "该费用规则名称已存在".to_string(),
        ));
    }

    let mut pid_val = req.pid.as_ref().map(|s| s.trim()).unwrap_or("").to_string();
    if pid_val.is_empty() {
        use rand::Rng;
        loop {
            let temp_pid = format!("6{:04}", rand::thread_rng().gen_range(0..10000));
            let exists: Option<i64> = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT id FROM billing_rules WHERE pid = ?"),
            )
            .bind(&temp_pid)
            .fetch_optional(&state.db.pool)
            .await?;
            if exists.is_none() {
                pid_val = temp_pid;
                break;
            }
        }
    } else {
        if pid_val.len() != 5 || !pid_val.chars().all(|c| c.is_ascii_digit()) {
            return Err(crate::error::AppError::BadRequest(
                "计费规则 PID 必须是 5 位数字字符串".to_string(),
            ));
        }
        if !pid_val.starts_with('6') {
            return Err(crate::error::AppError::BadRequest(
                "手动添加的计费规则 PID 必须是以 6 开头".to_string(),
            ));
        }
        let exists: Option<i64> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT id FROM billing_rules WHERE pid = ?"),
        )
        .bind(&pid_val)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict(
                "计费规则 PID 已存在".to_string(),
            ));
        }
    }

    let id_i64 = sqlx::query(
        &state.db.format_query(r#"INSERT INTO billing_rules 
            (name, billing_type, prompt_rate, completion_rate, cached_rate, claude_cache_creation_rate, claude_cache_read_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_active, pid, provider_id, type_id, pricing_type, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"#)
    )
    .bind(&req.name)
    .bind(&req.billing_type)
    .bind(req.prompt_rate)
    .bind(req.completion_rate)
    .bind(req.cached_rate)
    .bind(req.claude_cache_creation_rate)
    .bind(req.claude_cache_read_rate)
    .bind(req.fixed_rate)
    .bind(req.duration_rate)
    .bind(&req.billing_rule)
    .bind(&pricing_tiers_str)
    .bind(&extended_config_str)
    .bind(req.is_active)
    .bind(&pid_val)
    .bind(req.provider_id)
    .bind(req.type_id)
    .bind(&req.pricing_type)
    .bind(req.sort_order.unwrap_or(0))
    .fetch_one(&state.db.pool)
    .await?
    .get::<i64, _>("id");

    let rule = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE id = ?"),
    )
    .bind(id_i64)
    .fetch_one(&state.db.pool)
    .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(rule))
}

pub async fn update_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(mut req): Json<UpdateBillingRuleRequest>,
) -> AppResult<Json<BillingRule>> {
    if let Some(name) = &mut req.name {
        *name = name.trim().to_string();
        if name.is_empty() {
            return Err(crate::error::AppError::BadRequest(
                "规则名称不能为空".to_string(),
            ));
        }
        let exists: Option<i64> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT id FROM billing_rules WHERE name = ? AND id != ?"),
        )
        .bind(&*name)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict(
                "规则名称已经被占用".to_string(),
            ));
        }
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET name = ? WHERE id = ?"),
        )
        .bind(&*name)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    if let Some(val) = &req.billing_type {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET billing_type = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.prompt_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET prompt_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.completion_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET completion_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.cached_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET cached_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.claude_cache_creation_rate {
        sqlx::query(
            &state.db.format_query(
                "UPDATE billing_rules SET claude_cache_creation_rate = ? WHERE id = ?",
            ),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.claude_cache_read_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET claude_cache_read_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.fixed_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET fixed_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.duration_rate {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET duration_rate = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = &req.billing_rule {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET billing_rule = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = &req.pricing_tiers {
        let str_val = serde_json::to_string(val).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET pricing_tiers = ? WHERE id = ?"),
        )
        .bind(&str_val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = &req.extended_config {
        let str_val = serde_json::to_string(val).unwrap_or_else(|_| "{}".to_string());
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET extended_config = ? WHERE id = ?"),
        )
        .bind(&str_val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(active) = req.is_active {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET is_active = ? WHERE id = ?"),
        )
        .bind(active)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(pid) = &req.pid {
        let trimmed_pid = pid.trim().to_string();
        if trimmed_pid.is_empty() {
            return Err(crate::error::AppError::BadRequest(
                "计费规则 PID 不能为空".to_string(),
            ));
        }
        if trimmed_pid.len() != 5 || !trimmed_pid.chars().all(|c| c.is_ascii_digit()) {
            return Err(crate::error::AppError::BadRequest(
                "计费规则 PID 必须是 5 位数字字符串".to_string(),
            ));
        }
        let is_system: i32 = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT is_system FROM billing_rules WHERE id = ?"),
        )
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;
        if is_system == 1 {
            if !trimmed_pid.starts_with('7') {
                return Err(crate::error::AppError::BadRequest(
                    "系统计费规则 PID 必须是以 7 开头".to_string(),
                ));
            }
        } else {
            if !trimmed_pid.starts_with('6') {
                return Err(crate::error::AppError::BadRequest(
                    "手动添加的计费规则 PID 必须是以 6 开头".to_string(),
                ));
            }
        }
        let exists: Option<i64> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT id FROM billing_rules WHERE pid = ? AND id != ?"),
        )
        .bind(&trimmed_pid)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;
        if exists.is_some() {
            return Err(crate::error::AppError::Conflict(
                "计费规则 PID 已存在".to_string(),
            ));
        }
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET pid = ? WHERE id = ?"),
        )
        .bind(trimmed_pid)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(provider_id) = req.provider_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET provider_id = ? WHERE id = ?"),
        )
        .bind(provider_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(type_id) = req.type_id {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET type_id = ? WHERE id = ?"),
        )
        .bind(type_id)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(pricing_type) = &req.pricing_type {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET pricing_type = ? WHERE id = ?"),
        )
        .bind(pricing_type)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }
    if let Some(val) = req.sort_order {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE billing_rules SET sort_order = ? WHERE id = ?"),
        )
        .bind(val)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    sqlx::query(
        &state
            .db
            .format_query("UPDATE billing_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    let rule = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(rule))
}

pub async fn delete_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let rule: Option<BillingRule> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    if let Some(r) = rule {
        if r.is_system == 1 {
            return Err(crate::error::AppError::Forbidden(
                "系统内置计费规则不允许删除".to_string(),
            ));
        }
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM billing_rules WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;
    sqlx::query(
        &state
            .db
            .format_query("UPDATE models SET billing_rule_id = NULL WHERE billing_rule_id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub struct BillingRuleDefault {
    pub billing_type: &'static str,
    pub prompt_rate: f64,
    pub completion_rate: f64,
    pub cached_rate: f64,
    pub claude_cache_creation_rate: f64,
    pub claude_cache_read_rate: f64,
    pub fixed_rate: f64,
    pub duration_rate: f64,
    pub billing_rule: &'static str,
    pub pricing_tiers: &'static str,
    pub extended_config: &'static str,
}

fn get_default_by_name(name: &str) -> Option<BillingRuleDefault> {
    match name {
        "标准1M万字计费 (1)" => Some(BillingRuleDefault {
            billing_type: "tokens",
            prompt_rate: 1.0,
            completion_rate: 2.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0,
            billing_rule: "standard",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        "单次请求扣费 (0.1)" => Some(BillingRuleDefault {
            billing_type: "requests",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.1,
            duration_rate: 0.0,
            billing_rule: "standard",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        "Seedance2.0官方计费" => Some(BillingRuleDefault {
            billing_type: "tokens",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0,
            billing_rule: "seedance2.0",
            pricing_tiers: "[]",
            extended_config: r#"{"resolution_rates":{"1080p":{"with_video":31,"without_video":51},"480p":{"with_video":28,"without_video":46},"720p":{"with_video":28,"without_video":46}}}"#,
        }),
        "Seedance2.0Fast官方计费" => Some(BillingRuleDefault {
            billing_type: "tokens",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0,
            billing_rule: "seedance2.0",
            pricing_tiers: "[]",
            extended_config: r#"{"resolution_rates":{"480p":{"with_video":22,"without_video":37},"720p":{"with_video":22,"without_video":37}}}"#,
        }),
        "可灵视频官方计费" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.10,
            billing_rule: "kling_video",
            pricing_tiers: "[]",
            extended_config: r#"{"mode_multipliers":{"std":1.0,"pro":1.33,"4k":2.0},"sound_multipliers":{"off":1.0,"on":1.5}}"#,
        }),
        "可灵V3-Omni视频计费" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.60,
            billing_rule: "kling_video",
            pricing_tiers: "[]",
            extended_config: r#"{"price_table":{"std|off|no":0.6,"std|on|no":0.8,"std|off|yes":0.9,"pro|off|no":0.8,"pro|on|no":1.0,"pro|off|yes":1.2,"4k|off|no":3.0,"4k|on|no":3.0,"4k|off|yes":3.0},"enable_mode":true,"enable_sound":true,"enable_video_ref":true}"#,
        }),
        "可灵Video-O1视频计费" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.60,
            billing_rule: "kling_video",
            pricing_tiers: "[]",
            extended_config: r#"{"price_table":{"std|off|no":0.6,"std|off|yes":0.9,"pro|off|no":0.8,"pro|off|yes":1.2},"enable_mode":true,"enable_sound":false,"enable_video_ref":true}"#,
        }),
        "可灵V3视频计费" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.60,
            billing_rule: "kling_video",
            pricing_tiers: "[]",
            extended_config: r#"{"price_table":{"std|off|no":0.6,"std|on|no":0.9,"pro|off|no":0.8,"pro|on|no":1.2,"4k|off|no":3.0,"4k|on|no":3.0},"enable_mode":true,"enable_sound":true,"enable_video_ref":false}"#,
        }),
        "语音合成按字符计费 (2.8元/万字符)" => Some(BillingRuleDefault {
            billing_type: "requests",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 2.8,
            duration_rate: 0.0,
            billing_rule: "characters",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        "文本向量标准计费" => Some(BillingRuleDefault {
            billing_type: "tokens",
            prompt_rate: 0.7,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0,
            billing_rule: "standard",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        "排序模型多模态计费" => Some(BillingRuleDefault {
            billing_type: "tokens",
            prompt_rate: 0.35,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0,
            billing_rule: "multimodal",
            pricing_tiers: "[]",
            extended_config: r#"{"image_prompt_rate": 0.35}"#,
        }),
        "火山 MediaKit 官方视频超分计费" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.20,
            billing_rule: "video_quality",
            pricing_tiers: r#"[{"resolution":"720p","fps_range":"<=30","rate":0.10,"enabled":true},{"resolution":"720p","fps_range":">30","rate":0.15,"enabled":true},{"resolution":"1080p","fps_range":"<=30","rate":0.20,"enabled":true},{"resolution":"1080p","fps_range":">30","rate":0.30,"enabled":true},{"resolution":"4k","fps_range":"<=30","rate":0.50,"enabled":true},{"resolution":"4k","fps_range":">30","rate":0.80,"enabled":true}]"#,
            extended_config: "{}",
        }),
        "火山 MediaKit 视频画质增强 (标准版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.0125,
            billing_rule: "video_quality",
            pricing_tiers: r#"[{"resolution":"720p","fps_range":"<=30","rate":0.0125,"enabled":true},{"resolution":"720p","fps_range":">30","rate":0.025,"enabled":true},{"resolution":"1080p","fps_range":"<=30","rate":0.025,"enabled":true},{"resolution":"1080p","fps_range":">30","rate":0.05,"enabled":true},{"resolution":"2k","fps_range":"<=30","rate":0.05,"enabled":true},{"resolution":"2k","fps_range":">30","rate":0.10,"enabled":true},{"resolution":"4k","fps_range":"<=30","rate":0.10,"enabled":true},{"resolution":"4k","fps_range":">30","rate":0.20,"enabled":true}]"#,
            extended_config: "{}",
        }),
        "火山 MediaKit 视频画质增强 (专业版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.125,
            billing_rule: "video_quality",
            pricing_tiers: r#"[{"resolution":"720p","fps_range":"<=30","rate":0.125,"enabled":true},{"resolution":"720p","fps_range":">30","rate":0.25,"enabled":true},{"resolution":"1080p","fps_range":"<=30","rate":0.25,"enabled":true},{"resolution":"1080p","fps_range":">30","rate":0.50,"enabled":true},{"resolution":"2k","fps_range":"<=30","rate":0.50,"enabled":true},{"resolution":"2k","fps_range":">30","rate":1.00,"enabled":true},{"resolution":"4k","fps_range":"<=30","rate":1.00,"enabled":true},{"resolution":"4k","fps_range":">30","rate":2.00,"enabled":true}]"#,
            extended_config: "{}",
        }),
        "火山 MediaKit 视频画质增强 (极速版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.00333333,
            billing_rule: "video_quality",
            pricing_tiers: r#"[{"resolution":"720p","fps_range":"<=30","rate":0.00333333,"enabled":true},{"resolution":"720p","fps_range":">30","rate":0.00666667,"enabled":true},{"resolution":"1080p","fps_range":"<=30","rate":0.00666667,"enabled":true},{"resolution":"1080p","fps_range":">30","rate":0.01333333,"enabled":true},{"resolution":"2k","fps_range":"<=30","rate":0.01333333,"enabled":true},{"resolution":"2k","fps_range":">30","rate":0.02666667,"enabled":true},{"resolution":"4k","fps_range":"<=30","rate":0.02666667,"enabled":true},{"resolution":"4k","fps_range":">30","rate":0.05333333,"enabled":true}]"#,
            extended_config: "{}",
        }),
        "火山 MediaKit 视频画质增强 (大模型版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.04166667,
            billing_rule: "video_quality",
            pricing_tiers: r#"[{"resolution":"720p","fps_range":"<=30","rate":0.04166667,"enabled":true},{"resolution":"720p","fps_range":">30","rate":0.08333333,"enabled":true},{"resolution":"1080p","fps_range":"<=30","rate":0.08333333,"enabled":true},{"resolution":"1080p","fps_range":">30","rate":0.16666667,"enabled":true}]"#,
            extended_config: "{}",
        }),
        "火山 MediaKit 视频字幕擦除 (标准版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.00666667,
            billing_rule: "standard",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        "火山 MediaKit 视频字幕擦除 (精细版)" => Some(BillingRuleDefault {
            billing_type: "duration",
            prompt_rate: 0.0,
            completion_rate: 0.0,
            cached_rate: 0.0,
            claude_cache_creation_rate: 0.0,
            claude_cache_read_rate: 0.0,
            fixed_rate: 0.0,
            duration_rate: 0.01666667,
            billing_rule: "standard",
            pricing_tiers: "[]",
            extended_config: "{}",
        }),
        _ => None,
    }
}

pub async fn restore_default_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<BillingRule>> {
    let current: Option<(String, i32)> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT name, is_system FROM billing_rules WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (name, is_system) = match current {
        Some(c) => c,
        None => {
            return Err(crate::error::AppError::NotFound(
                "计费规则不存在".to_string(),
            ))
        }
    };

    if is_system != 1 {
        return Err(crate::error::AppError::BadRequest(
            "仅系统计费规则支持恢复默认".to_string(),
        ));
    }

    let default_val = match get_default_by_name(&name) {
        Some(d) => d,
        None => {
            return Err(crate::error::AppError::BadRequest(
                "未找到该系统计费规则的默认配置数据".to_string(),
            ))
        }
    };

    sqlx::query(&state.db.format_query(
        "UPDATE billing_rules SET \
         billing_type = ?, \
         prompt_rate = ?, \
         completion_rate = ?, \
         cached_rate = ?, \
         claude_cache_creation_rate = ?, \
         claude_cache_read_rate = ?, \
         fixed_rate = ?, \
         duration_rate = ?, \
         billing_rule = ?, \
         pricing_tiers = ?, \
         extended_config = ?, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?",
    ))
    .bind(default_val.billing_type)
    .bind(default_val.prompt_rate)
    .bind(default_val.completion_rate)
    .bind(default_val.cached_rate)
    .bind(default_val.claude_cache_creation_rate)
    .bind(default_val.claude_cache_read_rate)
    .bind(default_val.fixed_rate)
    .bind(default_val.duration_rate)
    .bind(default_val.billing_rule)
    .bind(default_val.pricing_tiers)
    .bind(default_val.extended_config)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    let rule = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(rule))
}
