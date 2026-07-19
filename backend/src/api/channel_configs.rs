use crate::error::AppError;
use crate::models::{
    ChannelConfig, ChannelConfigListResponse, ChannelConfigSafe, CreateChannelConfigRequest,
    UpdateChannelConfigRequest,
};
use crate::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use rand::Rng;
use std::sync::Arc;

pub async fn list_channel_configs(
    State(state): State<Arc<AppState>>,
    claims: Option<axum::Extension<crate::auth::Claims>>,
) -> Result<Json<ChannelConfigListResponse>, AppError> {
    let is_admin = claims.as_ref().map_or(false, |c| c.0.role == "admin");

    let configs: Vec<ChannelConfig> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM channel_configs ORDER BY sort_order DESC, id DESC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let total: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM channel_configs"),
    )
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(ChannelConfigListResponse {
        data: configs
            .into_iter()
            .map(|c| ChannelConfigSafe::from_with_role(c, is_admin))
            .collect(),
        total,
    }))
}

pub async fn create_channel_config(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateChannelConfigRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let yid = {
        let mut rng = rand::thread_rng();
        format!("3{}", rng.gen_range(1000..=9999))
    };

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO channel_configs (name, provider_type, base_url, api_key, remark, yid, sort_order, rate, priority, weight, quota_limit, daily_quota_limit, weekly_quota_limit, monthly_quota_limit) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
    )
    .bind(&req.name)
    .bind(&req.provider_type)
    .bind(&req.base_url)
    .bind(&req.api_key)
    .bind(&req.remark)
    .bind(&yid)
    .bind(&req.sort_order)
    .bind(&req.rate)
    .bind(&req.priority)
    .bind(&req.weight)
    .bind(req.quota_limit.unwrap_or(-1.0))
    .bind(req.daily_quota_limit.unwrap_or(-1.0))
    .bind(req.weekly_quota_limit.unwrap_or(-1.0))
    .bind(req.monthly_quota_limit.unwrap_or(-1.0))
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn update_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateChannelConfigRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut config: ChannelConfig = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM channel_configs WHERE id = ?"),
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel Config not found".to_string()))?;

    if let Some(name) = req.name {
        config.name = name;
    }
    if let Some(pt) = req.provider_type {
        config.provider_type = pt;
    }
    if let Some(bu) = req.base_url {
        config.base_url = bu;
    }
    if let Some(key) = req.api_key {
        // 【防护】含脱敏标记的值不覆盖原始密钥
        if !key.contains("******") {
            config.api_key = key;
        }
    }
    if let Some(rem) = req.remark {
        config.remark = Some(rem);
    }
    if let Some(so) = req.sort_order {
        config.sort_order = so;
    }
    if let Some(r) = req.rate {
        config.rate = r;
    }
    if let Some(p) = req.priority {
        config.priority = p;
    }
    if let Some(w) = req.weight {
        config.weight = w;
    }
    if let Some(q) = req.quota_limit {
        config.quota_limit = q;
    }
    if let Some(d) = req.daily_quota_limit {
        config.daily_quota_limit = d;
    }
    if let Some(w) = req.weekly_quota_limit {
        config.weekly_quota_limit = w;
    }
    if let Some(m) = req.monthly_quota_limit {
        config.monthly_quota_limit = m;
    }

    sqlx::query(
        &state.db.format_query(
            "UPDATE channel_configs SET name = ?, provider_type = ?, base_url = ?, api_key = ?, remark = ?, \
             sort_order = ?, rate = ?, priority = ?, weight = ?, quota_limit = ?, daily_quota_limit = ?, weekly_quota_limit = ?, monthly_quota_limit = ? \
             WHERE id = ?"
        )
    )
    .bind(&config.name)
    .bind(&config.provider_type)
    .bind(&config.base_url)
    .bind(&config.api_key)
    .bind(&config.remark)
    .bind(&config.sort_order)
    .bind(config.rate)
    .bind(config.priority)
    .bind(config.weight)
    .bind(config.quota_limit)
    .bind(config.daily_quota_limit)
    .bind(config.weekly_quota_limit)
    .bind(config.monthly_quota_limit)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    // 上游渠道配置变更后清除关联的 HA 子渠道熔断记录
    // HA 子渠道的熔断 key 格式为 ha_group_{group_id}_config_{config_id}
    let config_suffix = format!("_config_{}", id);
    state
        .failed_channels
        .retain(|k, _| !k.ends_with(&config_suffix));

    // 如果该 config 被某个渠道作为 preset_id 引用，也清除那些渠道的熔断记录
    if let Ok(referring_channels) = sqlx::query_as::<_, (Option<String>,)>(
        &state
            .db
            .format_query("SELECT group_aid FROM channels WHERE preset_id = ?"),
    )
    .bind(id)
    .fetch_all(&state.db.pool)
    .await
    {
        for (group_aid,) in referring_channels {
            if let Some(aid) = group_aid {
                state.failed_channels.remove(&aid);
            }
        }
    }

    tracing::info!(
        "[ChannelConfig Update] 上游渠道配置 {} 已更新，已清除关联的熔断记录",
        id
    );

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn delete_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Optionally check if channels depend on this config
    let count: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT COUNT(*) FROM channels WHERE preset_id = ?"),
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    // We can allow deletion and let channels keep their last fallback base_url/api_key,
    // or set preset_id to NULL upon deletion
    if count > 0 {
        sqlx::query(
            &state
                .db
                .format_query("UPDATE channels SET preset_id = NULL WHERE preset_id = ?"),
        )
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM channel_configs WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

/// 手动清零上游预设已用额度（总/日/月）
pub async fn reset_quota(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(&state.db.format_query(
        &crate::models::channel_quota::reset_quota_sql("channel_configs"),
    ))
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("上游渠道配置不存在".into()));
    }

    tracing::info!(
        "[ChannelConfig Quota Reset] 管理员手动清零上游预设 {} 的已用额度",
        id
    );
    Ok(Json(serde_json::json!({ "success": true })))
}
