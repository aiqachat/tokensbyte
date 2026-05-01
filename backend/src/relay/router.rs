#![allow(dead_code)]
use std::sync::Arc;
use crate::AppState;
use crate::models::Channel;
use crate::error::{AppError, AppResult};
use rand::Rng;

/// Select the best channel for a given model based on priority and load balancing
pub async fn select_channel(state: &Arc<AppState>, model: &str, user_group: &str, level_id: &str) -> AppResult<Channel> {
    // 1. 查找请求 model_id 对应的所有 mid（渠道现在按 mid 存储模型列表）
    let mids: Vec<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT mid FROM models WHERE model_id = ? AND is_active = 1")
    )
    .bind(model)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    // 2. 构建匹配条件：匹配 mid 列表中的任意值，同时兼容旧格式（直接存 model_id 的渠道）
    let mut model_conditions = vec![format!("models LIKE '%\"{}\"%'", model)]; // 兼容旧 model_id 格式
    for mid in &mids {
        model_conditions.push(format!("models LIKE '%\"{}\"%'", mid));
    }
    let model_clause = format!("(({}) OR models = '[]')", model_conditions.join(" OR "));

    let sql = format!(
        r#"SELECT * FROM channels 
           WHERE status = 1 
           AND (quota_limit < 0 OR quota_used < quota_limit)
           AND {}
           AND (user_groups LIKE ? OR user_groups LIKE ? OR user_groups = '[]')
           ORDER BY priority DESC"#,
        model_clause
    );

    let channels: Vec<Channel> = sqlx::query_as(&state.db.format_query(&sql))
    .bind(format!("%\"{}\"%" , user_group))
    .bind(format!("%\"{}\"%" , level_id))
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

    let mut ch = if total_weight <= 0 {
        top_tier_channels[0].clone()
    } else {
        let mut rng = rand::rngs::OsRng;
        let random_value = rng.gen_range(0..total_weight);
        let mut current_sum = 0;
        let mut selected = &top_tier_channels[0];
        for channel in &top_tier_channels {
            current_sum += channel.weight;
            if random_value < current_sum {
                selected = channel;
                break;
            }
        }
        selected.clone()
    };

    // 4. Resolve preset (channel config template)
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

// 5. 卡池集成：如果渠道绑定了卡池，从卡池中选择可用账号替换 API Key 和 Base URL
    if let Some(pool_id) = ch.pool_id {
        if let Some(account) = crate::services::volcengine_pool::select_account(state, pool_id, model).await {
            tracing::info!(
                "[Relay] 渠道 '{}' (id={}) 使用卡池账号 '{}' (id={}) 的 Base URL 和 API Key",
                ch.name, ch.id, account.name, account.id
            );
            ch.api_key = account.api_key;
            ch.base_url = account.base_url;
            // 将卡池账号 ID 存入 config 供后续计费回写使用
            if let Ok(mut config_val) = serde_json::from_str::<serde_json::Value>(&ch.config) {
                config_val["_pool_account_id"] = serde_json::json!(account.id);
                config_val["_pool_account_name"] = serde_json::json!(account.name);
                config_val["_pool_id"] = serde_json::json!(pool_id);
                ch.config = serde_json::to_string(&config_val).unwrap_or(ch.config);
            } else {
                ch.config = serde_json::json!({
                    "_pool_account_id": account.id,
                    "_pool_account_name": account.name,
                    "_pool_id": pool_id,
                }).to_string();
            }
        } else {
            tracing::warn!(
                "[Relay] 渠道 '{}' (id={}) 绑定了卡池 (pool_id={}) 但无可用账号",
                ch.name, ch.id, pool_id
            );
        }
    }

    Ok(ch)
}


/// Helper to resolve model name based on global or channel-specific mapping
pub fn resolve_model(channel: &Channel, requested_model: &str) -> String {
    channel.resolve_model(requested_model)
}
