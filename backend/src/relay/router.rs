#![allow(dead_code)]
use std::sync::Arc;
use crate::AppState;
use crate::models::Channel;
use crate::error::{AppError, AppResult};
use rand::Rng;

/// Select the best channel for a given model based on priority and load balancing
pub async fn select_channel(state: &Arc<AppState>, model: &str, user_group: &str) -> AppResult<Channel> {
    // 1. Fetch available channels that support this model and user group
    // Filter by priority (desc) first.
    let channels: Vec<Channel> = sqlx::query_as(
        &state.db.format_query(r#"SELECT * FROM channels 
           WHERE status = 1 
           AND (quota_limit < 0 OR quota_used < quota_limit)
           AND (models LIKE ? OR models = '[]')
           AND (user_groups LIKE ? OR user_groups = '[]')
           ORDER BY priority DESC"#)
    )
    .bind(format!("%{:?}%", model))
    .bind(format!("%\"{}\"%", user_group))
    .fetch_all(&state.db.pool)
    .await?;

    if channels.is_empty() {
        return Err(AppError::NotFound(format!("No available channels found for model {}", model)));
    }

    // 2. Group by highest priority
    let highest_priority = channels[0].priority;
    let top_tier_channels: Vec<Channel> = channels.into_iter()
        .take_while(|c| c.priority == highest_priority)
        .collect();

    // 3. Random Weighted Selection within the top priority tier
    let mut total_weight = 0;
    for channel in &top_tier_channels {
        total_weight += channel.weight;
    }

    if total_weight <= 0 {
        let mut ch = top_tier_channels[0].clone();
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
                .bind(pid)
                .fetch_optional(&state.db.pool)
                .await 
            {
                ch.base_url = preset.base_url;
                ch.api_key = preset.api_key;
            }
        }
        return Ok(ch);
    }

    let mut rng = rand::rngs::OsRng;
    let random_value = rng.gen_range(0..total_weight);
    
    let mut current_sum = 0;
    for channel in &top_tier_channels {
        current_sum += channel.weight;
        if random_value < current_sum {
            let mut ch = channel.clone();
            if let Some(pid) = ch.preset_id {
                if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
                    .bind(pid)
                    .fetch_optional(&state.db.pool)
                    .await 
                {
                    ch.base_url = preset.base_url;
                    ch.api_key = preset.api_key;
                }
            }
            return Ok(ch);
        }
    }

    let mut ch = top_tier_channels[0].clone();
    if let Some(pid) = ch.preset_id {
        if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
            .bind(pid)
            .fetch_optional(&state.db.pool)
            .await 
        {
            ch.base_url = preset.base_url;
            ch.api_key = preset.api_key;
        }
    }
    Ok(ch)
}


/// Helper to resolve model name based on global or channel-specific mapping
pub fn resolve_model(channel: &Channel, requested_model: &str) -> String {
    channel.resolve_model(requested_model)
}
