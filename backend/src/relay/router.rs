#![allow(dead_code)]
use std::sync::Arc;
use crate::AppState;
use crate::models::Channel;
use crate::error::{AppError, AppResult};
use rand::Rng;

/// Select the best channel for a given model based on priority and load balancing
pub async fn select_channel(state: &Arc<AppState>, model: &str, user_group: &str, level_id: &str, exclude_aids: &[String]) -> AppResult<Channel> {
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

    let exclude_clause = if exclude_aids.is_empty() {
        String::new()
    } else {
        let aids_str = exclude_aids.iter().map(|aid| format!("'{}'", aid.replace("'", "''"))).collect::<Vec<String>>().join(",");
        format!("AND group_aid NOT IN ({})", aids_str)
    };

    let sql = format!(
        r#"SELECT * FROM channels 
           WHERE status = 1 
           AND (quota_limit < 0 OR quota_used < quota_limit)
           AND {}
           {}
           AND (user_groups LIKE ? OR user_groups LIKE ? OR user_groups = '[]')
           ORDER BY priority DESC"#,
        model_clause,
        exclude_clause
    );

    let channels: Vec<Channel> = sqlx::query_as(&state.db.format_query(&sql))
    .bind(format!("%\"{}\"%" , user_group))
    .bind(format!("%\"{}\"%" , level_id))
    .fetch_all(&state.db.pool)
    .await?;

    // 过滤掉内存熔断期内且未到期的渠道，以及 exclude_user_groups（黑名单）包含当前等级的渠道
    let now = std::time::Instant::now();
    let channels: Vec<Channel> = channels.into_iter().filter(|c| {
        let excludes = c.get_exclude_user_groups();
        if !excludes.is_empty() && (excludes.contains(&user_group.to_string()) || excludes.contains(&level_id.to_string())) {
            return false;
        }
        if let Some(ref aid) = c.group_aid {
            if let Some(blocked_until) = state.failed_channels.get(aid) {
                if blocked_until.value() > &now {
                    return false; // 仍在熔断期，排除
                }
            }
        }
        true
    }).collect();

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

    // ── 如果命中的是“高可用虚拟渠道组”，执行子渠道的二次加权负载路由 ──
    if ch.provider_type == "high_availability_group" {
        let sub_channel_aids: Vec<String> = serde_json::from_str::<serde_json::Value>(&ch.config)
            .ok()
            .and_then(|v| v.get("sub_channels").cloned())
            .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
            .unwrap_or_default();

        if sub_channel_aids.is_empty() {
            return Err(AppError::NotFound(format!("高可用虚拟渠道组 '{}' 配置异常，未绑定任何上游子渠道", ch.name)));
        }

        // 批量拉取活跃的子渠道配置
        let mut sub_channels: Vec<Channel> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE group_aid = ANY(?) AND status = 1")
        )
        .bind(&sub_channel_aids)
        .fetch_all(&state.db.pool)
        .await?;

        // 过滤子渠道：排除 exclude_aids 与内存熔断
        sub_channels = sub_channels.into_iter().filter(|sub_c| {
            let aid = sub_c.group_aid.as_deref().unwrap_or("");
            if aid.is_empty() {
                return false;
            }
            if exclude_aids.contains(&aid.to_string()) {
                return false;
            }
            if let Some(blocked_until) = state.failed_channels.get(aid) {
                if blocked_until.value() > &now {
                    return false;
                }
            }
            true
        }).collect();

        if sub_channels.is_empty() {
            return Err(AppError::NotFound(format!("该渠道分组 '{}' 下目前无可用的活跃上游子渠道", ch.name)));
        }

        // 对物理子渠道按优先级重新排序并加权选择
        sub_channels.sort_by(|a, b| b.priority.cmp(&a.priority));
        let highest_sub_priority = sub_channels[0].priority;
        let top_subs: Vec<Channel> = sub_channels.into_iter()
            .take_while(|c| c.priority == highest_sub_priority)
            .collect();

        let mut total_sub_weight = 0;
        for sub in &top_subs {
            total_sub_weight += sub.weight;
        }

        ch = if total_sub_weight <= 0 {
            top_subs[0].clone()
        } else {
            let mut rng = rand::rngs::OsRng;
            let random_val = rng.gen_range(0..total_sub_weight);
            let mut current_sub_sum = 0;
            let mut selected_sub = &top_subs[0];
            for sub in &top_subs {
                current_sub_sum += sub.weight;
                if random_val < current_sub_sum {
                    selected_sub = sub;
                    break;
                }
            }
            selected_sub.clone()
        };
    }

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
        #[cfg(feature = "commercial_plugins")]
        {
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
        #[cfg(not(feature = "commercial_plugins"))]
        {
            let _ = pool_id;
            let _ = model;
        }
    }

    Ok(ch)
}

/// 解析最终上游请求使用的模型名称（全站映射唯一入口）
/// 优先级：渠道映射（最高）> 模型表别名 > 原始 model_id（兜底）
/// 返回 (映射后的模型名, 映射来源标签) — 来源为 None 时表示无映射
pub fn resolve_model(channel: &Channel, requested_model: &str, db_model: Option<&crate::models::Model>) -> (String, Option<&'static str>) {
    let resolved = channel.resolve_model(requested_model);
    // 渠道有映射则直接返回（最高优先级）
    if resolved != requested_model {
        return (resolved, Some("渠道映射"));
    }
    // 渠道无映射，检查模型表别名（次级优先级）
    if let Some(m) = db_model {
        if !m.model_id_alias.is_empty() {
            return (m.model_id_alias.clone(), Some("模型映射"));
        }
    }
    // 兜底：返回原始 model_id
    (resolved, None)
}
