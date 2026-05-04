use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{
    ChannelConfig, ChannelConfigListResponse,
    CreateChannelConfigRequest, UpdateChannelConfigRequest
};
use crate::error::AppError;
use rand::Rng;

pub async fn list_channel_configs(
    State(state): State<Arc<AppState>>
) -> Result<Json<ChannelConfigListResponse>, AppError> {
    let configs: Vec<ChannelConfig> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM channel_configs ORDER BY id DESC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    let total: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM channel_configs")
    )
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(ChannelConfigListResponse {
        data: configs.into_iter().map(|c| c.into()).collect(),
        total,
    }))
}

pub async fn create_channel_config(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateChannelConfigRequest>
) -> Result<Json<serde_json::Value>, AppError> {
    let yid = {
        let mut rng = rand::thread_rng();
        format!("3{}", rng.gen_range(1000..=9999))
    };

    sqlx::query(
        &state.db.format_query("INSERT INTO channel_configs (name, provider_type, base_url, api_key, remark, yid) VALUES (?, ?, ?, ?, ?, ?)")
    )
    .bind(&req.name)
    .bind(&req.provider_type)
    .bind(&req.base_url)
    .bind(&req.api_key)
    .bind(&req.remark)
    .bind(&yid)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn update_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateChannelConfigRequest>
) -> Result<Json<serde_json::Value>, AppError> {
    let mut config: ChannelConfig = sqlx::query_as(
        &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
    )
    .bind(id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Channel Config not found".to_string()))?;

    if let Some(name) = req.name { config.name = name; }
    if let Some(pt) = req.provider_type { config.provider_type = pt; }
    if let Some(bu) = req.base_url { config.base_url = bu; }
    if let Some(key) = req.api_key { 
        if !key.is_empty() {
            config.api_key = key; 
        }
    }
    if let Some(rem) = req.remark { config.remark = Some(rem); }

    sqlx::query(
        &state.db.format_query("UPDATE channel_configs SET name = ?, provider_type = ?, base_url = ?, api_key = ?, remark = ? WHERE id = ?")
    )
    .bind(&config.name)
    .bind(&config.provider_type)
    .bind(&config.base_url)
    .bind(&config.api_key)
    .bind(&config.remark)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}

pub async fn delete_channel_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>
) -> Result<Json<serde_json::Value>, AppError> {
    // Optionally check if channels depend on this config
    let count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM channels WHERE preset_id = ?")
    )
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    // We can allow deletion and let channels keep their last fallback base_url/api_key, 
    // or set preset_id to NULL upon deletion
    if count > 0 {
        sqlx::query(
            &state.db.format_query("UPDATE channels SET preset_id = NULL WHERE preset_id = ?")
        )
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    sqlx::query(
        &state.db.format_query("DELETE FROM channel_configs WHERE id = ?")
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({"success": true})))
}


