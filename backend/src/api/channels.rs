use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelSafe, ChannelListResponse};
use crate::error::{AppError, AppResult};

pub async fn list_channels(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<ChannelListResponse>> {
    let channels: Vec<Channel> = sqlx::query_as("SELECT * FROM channels ORDER BY priority DESC")
        .fetch_all(&state.db.pool)
        .await?;

    let safe_channels: Vec<ChannelSafe> = channels.into_iter().map(ChannelSafe::from).collect();
    let total = safe_channels.len() as i64;

    Ok(Json(ChannelListResponse { data: safe_channels, total }))
}

pub async fn create_channel(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateChannelRequest>,
) -> AppResult<Json<ChannelSafe>> {
    let models_json = serde_json::to_string(&request.models).unwrap_or_else(|_| "[]".to_string());
    let mapping_json = serde_json::to_string(&request.model_mapping.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let config_json = serde_json::to_string(&request.config.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());

    sqlx::query(
        r#"INSERT INTO channels (name, provider_type, base_url, api_key, models, model_mapping, priority, weight, status, max_rps, config)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"#
    )
    .bind(&request.name)
    .bind(&request.provider_type)
    .bind(&request.base_url)
    .bind(&request.api_key)
    .bind(&models_json)
    .bind(&mapping_json)
    .bind(request.priority.unwrap_or(0))
    .bind(request.weight.unwrap_or(1))
    .bind(request.max_rps.unwrap_or(0))
    .bind(&config_json)
    .execute(&state.db.pool)
    .await?;

    let channel: Channel = sqlx::query_as("SELECT * FROM channels ORDER BY id DESC LIMIT 1")
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(ChannelSafe::from(channel)))
}

pub async fn update_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateChannelRequest>,
) -> AppResult<Json<ChannelSafe>> {
    // Current channel for partial updates
    let mut channel: Channel = sqlx::query_as("SELECT * FROM channels WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    if let Some(name) = request.name { channel.name = name; }
    if let Some(provider_type) = request.provider_type { channel.provider_type = provider_type; }
    if let Some(base_url) = request.base_url { channel.base_url = base_url; }
    if let Some(api_key) = request.api_key { channel.api_key = api_key; }
    if let Some(models) = request.models { channel.models = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(mapping) = request.model_mapping { channel.model_mapping = serde_json::to_string(&mapping).unwrap_or_else(|_| "{}".to_string()); }
    if let Some(priority) = request.priority { channel.priority = priority; }
    if let Some(weight) = request.weight { channel.weight = weight; }
    if let Some(status) = request.status { channel.status = status; }
    if let Some(max_rps) = request.max_rps { channel.max_rps = Some(max_rps); }
    if let Some(config) = request.config { channel.config = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string()); }

    sqlx::query(
        r#"UPDATE channels SET name = ?, provider_type = ?, base_url = ?, api_key = ?, models = ?, 
           model_mapping = ?, priority = ?, weight = ?, status = ?, max_rps = ?, config = ?, updated_at = datetime('now')
           WHERE id = ?"#
    )
    .bind(&channel.name)
    .bind(&channel.provider_type)
    .bind(&channel.base_url)
    .bind(&channel.api_key)
    .bind(&channel.models)
    .bind(&channel.model_mapping)
    .bind(channel.priority)
    .bind(channel.weight)
    .bind(channel.status)
    .bind(channel.max_rps)
    .bind(&channel.config)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(ChannelSafe::from(channel)))
}

pub async fn delete_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM channels WHERE id = ?")
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn test_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let channel: Channel = sqlx::query_as("SELECT * FROM channels WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    let provider = crate::providers::get_provider(&channel.provider_type);
    
    // Perform a lightweight test (e.g., list models if possible, or just a mock req)
    // For now, we'll try to call models list if it's OpenAI, or just return success if reachability is assumed.
    // Real implementation: send a minimal completion request.
    
    let start = std::time::Instant::now();
    let success = match channel.provider_type.as_str() {
        "openai" | "anthropic" | "google" => {
            // Mocking a successful reachability for now in Phase 2 skeleton
            true
        }
        _ => true,
    };
    let latency = start.elapsed().as_millis();

    Ok(Json(serde_json::json!({
        "success": success,
        "latency": latency,
        "channel_id": id
    })))
}

