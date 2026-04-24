//! 后台定时轮询器：自动检查未完成计费的异步任务（视频/图片等），
//! 每 2 分钟轮询一次上游获取最终结果，确保计费正确落地。
//!
//! 判断依据：billing_detail 含"冻结" + response_content 可提取 task_id，
//! 不依赖 endpoint 硬编码，天然兼容所有异步任务入口。

use std::sync::Arc;
use crate::AppState;

/// 启动后台轮询定时任务
pub fn start(state: Arc<AppState>) {
    tokio::spawn(async move {
        // 启动后等待 30 秒再开始第一次轮询，让系统初始化完毕
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(120));
        loop {
            interval.tick().await;
            if let Err(e) = poll_pending_tasks(&state).await {
                tracing::error!("[TaskPoller] 轮询异常: {}", e);
            }
        }
    });
}

/// 查询所有未结算的异步任务日志并逐条轮询上游
async fn poll_pending_tasks(state: &Arc<AppState>) -> anyhow::Result<()> {
    // 通用条件：billing_detail 含"冻结"即为待结算异步任务
    // 不硬编码 endpoint，自动覆盖视频、图片等所有异步场景
    let rows: Vec<(i64, String, i64, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, response_content, channel_id, model FROM logs \
             WHERE billing_detail LIKE '%冻结%' \
             AND status_code = 200 \
             AND created_at > (NOW() - INTERVAL '24 hours')::text \
             ORDER BY id DESC LIMIT 50"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    if rows.is_empty() { return Ok(()); }
    tracing::info!("[TaskPoller] 发现 {} 条待轮询任务", rows.len());

    for (log_id, resp_content, _, _) in rows {
        // 提取 task_id，无法提取则跳过
        let _ = match extract_task_id(&resp_content) {
            Some(id) => id,
            None => continue,
        };

        if let Err(e) = sync_single_task(state, log_id).await {
            tracing::warn!("[TaskPoller] log_id={} 自动轮询失败: {}", log_id, e);
        }
    }

    Ok(())
}

/// 执行单条任务的同步轮询（支持手动或定时调用）
pub async fn sync_single_task(state: &Arc<AppState>, log_id: i64) -> anyhow::Result<String> {
    let row: Option<(String, i64, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT response_content, channel_id, model FROM logs WHERE id = ?"
        )
    ).bind(log_id).fetch_optional(&state.db.pool).await?;

    let (resp_content, channel_id, model_name) = match row {
        Some(r) => r,
        None => return Err(anyhow::anyhow!("任务记录不存在")),
    };

    let task_id = match extract_task_id(&resp_content) {
        Some(id) => id,
        None => return Err(anyhow::anyhow!("该记录无法提取 task_id，可能不是异步任务")),
    };

    let channel = match fetch_channel(state, channel_id).await {
        Some(ch) => ch,
        None => return Err(anyhow::anyhow!("渠道不存在或已被删除")),
    };

    let category: String = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT COALESCE(t.name, '') FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             WHERE m.model_id = ? LIMIT 1"
        )
    ).bind(&model_name).fetch_optional(&state.db.pool).await
        .unwrap_or(None).unwrap_or_default();

    let entry_path = match category.as_str() {
        "视频" => "/v1/video/generations",
        "图片" => "/v1/images/generations",
        _ => "/v1/tasks",
    };
    let resolved = super::forward::resolve_forward_rule(state, &model_name, &category, entry_path)
        .await
        .unwrap_or_else(|| super::forward::infer_forward_from_base_url(&channel.base_url, &category));

    let poll_path = if resolved.target_type == "volcengine" {
        format!("/api/v3/contents/generations/tasks/{}", task_id)
    } else if let Some(ref custom_path) = resolved.poll_path {
        // 优先使用规则里配置的 poll_path
        custom_path.replace("${task_id}", &task_id).replace("${model}", &model_name)
    } else {
        match category.as_str() {
            "视频" => format!("/v1/video/generations/{}", task_id),
            _ => format!("/v1/tasks/{}", task_id),
        }
    };
    let url = super::url_utils::join_url(&channel.base_url, &poll_path);

    let resp = match state.http_client.get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .send().await
    {
        Ok(r) => r,
        Err(e) => return Err(anyhow::anyhow!("请求渠道失败: {}", e)),
    };

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("渠道返回错误状态码: {}", resp.status()));
    }

    let body = resp.text().await.unwrap_or_default();
    let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    // 提取任务状态：兼容根节点、data 节点、final_result 节点
    let raw_status = resp_json.get("status")
        .or_else(|| resp_json.get("data").and_then(|d| d.get("status")))
        .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
        .and_then(|s| s.as_str()).unwrap_or("");
    // 某些上游（如图片异步 API）用 "completed" 表示成功，统一归一化
    let task_status = match raw_status {
        "completed" | "succeeded" => "succeeded",
        "failed" => "failed",
        other => other,
    };

    if task_status != "succeeded" && task_status != "failed" {
        return Ok(format!("当前状态: {}", if task_status.is_empty() { "pending" } else { task_status }));
    }

    // 更新日志响应内容为最终结果
    let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
        .bind(&body).bind(log_id).execute(&state.db.pool).await;

    if task_status == "succeeded" {
        settle_success(state, log_id, &model_name, &body, &resp_json).await;
        Ok("任务已成功落地并计费".to_string())
    } else {
        settle_failure(state, log_id, &model_name, &task_id).await;
        Ok("任务已失败，预扣费已退回".to_string())
    }
}

/// 任务成功：提取 token、计费、余额结算
async fn settle_success(state: &AppState, log_id: i64, model_name: &str, body: &str, resp_json: &serde_json::Value) {
    let usage = super::usage_extractor::parse_usage(body);

    let db_model: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    ).bind(model_name).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
        } else { None }
    } else { None };

    let (user_id, token_id) = match sqlx::query_as::<_, (String, i64)>(
        &state.db.format_query("SELECT user_id, token_id FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None) {
        Some((uid, tid)) => (Some(uid), Some(tid)),
        None => (None, None),
    };

    // 提取图片数量（供 compute_cost 中按张计费规则使用）
    let image_count = super::usage_extractor::count_response_images(body);

    // 获取用户折扣
    let user_discount: f64 = if let Some(ref uid) = user_id {
        let group: String = sqlx::query_scalar(
            &state.db.format_query("SELECT user_group FROM users WHERE id = ?")
        ).bind(uid).fetch_optional(&state.db.pool).await.unwrap_or(None).unwrap_or_default();
        if group.is_empty() { 1.0 } else {
            sqlx::query_scalar::<_, f64>(
                &state.db.format_query("SELECT discount FROM user_levels WHERE group_key = ?")
            ).bind(&group).fetch_optional(&state.db.pool).await.unwrap_or(None).unwrap_or(1.0)
        }
    } else { 1.0 };

    // 从原始请求补充计费特征（分辨率、视频输入等 GET 响应通常不含这些字段）
    let mut features = super::usage_extractor::extract_request_features(resp_json);
    if let Ok(Some(req_str)) = sqlx::query_scalar::<_, String>(
        &state.db.format_query("SELECT COALESCE(request_content, '') FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await {
        if !req_str.is_empty() {
            if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(&req_str) {
                let req_feat = super::usage_extractor::extract_request_features(&req_json);
                if features.resolution.is_none() { features.resolution = req_feat.resolution; }
                if req_feat.has_video { features.has_video = true; }
                if req_feat.has_audio { features.has_audio = true; }
            }
        }
    }
    // 异步任务终态如果是图片，使用前面已提取的图片数量进行计费
    if let Some(resp_count) = image_count {
        features.image_count = Some(resp_count);
    }

    let (final_discount, discount_source) = super::proxy::resolve_discount(db_model.as_ref(), user_discount);
    let (cost, mut detail) = super::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, final_discount, &features);
    detail.push_str(&format!(" | {} | [后台自动轮询结算]", discount_source));

    let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
    let apply_balance = cost - pre_deduction;

    // 更新日志计费
    let _ = sqlx::query(&state.db.format_query(
        "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cost = ?, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
    )).bind(usage.prompt).bind(usage.completion).bind(cost).bind(&detail).bind(log_id)
    .execute(&state.db.pool).await;

    // 余额结算
    if let Some(uid) = user_id {
        if cost > 0.0 || pre_deduction > 0.0 {
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )).bind(apply_balance).bind(apply_balance).bind(&uid)
            .execute(&state.db.pool).await;

            if let Some(tid) = token_id {
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )).bind(apply_balance).bind(tid)
                .execute(&state.db.pool).await;
            }

            tracing::info!("[TaskPoller] 自动结算完成, model={}, tokens={}, cost={:.6}, pre_deducted={:.6}",
                model_name, usage.total, cost, pre_deduction);
        }
    }
}

/// 任务失败：退回预扣费并标记
async fn settle_failure(state: &AppState, log_id: i64, model_name: &str, task_id: &str) {
    let pre_deduction = {
        let db_model: Option<crate::models::Model> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
        ).bind(model_name).fetch_optional(&state.db.pool).await.unwrap_or(None);
        db_model.map(|m| m.pre_deduction).unwrap_or(0.0)
    };

    if pre_deduction > 0.0 {
        if let Some((uid, tid)) = sqlx::query_as::<_, (String, i64)>(
            &state.db.format_query("SELECT user_id, token_id FROM logs WHERE id = ?")
        ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None) {
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance + ?, used_quota = used_quota - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )).bind(pre_deduction).bind(pre_deduction).bind(&uid)
            .execute(&state.db.pool).await;

            let _ = sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            )).bind(pre_deduction).bind(tid)
            .execute(&state.db.pool).await;
        }
    }

    let detail = if pre_deduction > 0.0 {
        "任务失败，预扣费已退回 | [后台自动轮询]"
    } else {
        "任务失败，该模型无预扣费 | [后台自动轮询]"
    };

    let _ = sqlx::query(&state.db.format_query(
        "UPDATE logs SET billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
    )).bind(detail).bind(log_id)
    .execute(&state.db.pool).await;

    tracing::info!("[TaskPoller] task={} 任务失败已处理, model={}, 退回预扣费={:.6}", task_id, model_name, pre_deduction);
}

/// 获取渠道信息（含 preset 覆盖）
async fn fetch_channel(state: &AppState, channel_id: i64) -> Option<crate::models::Channel> {
    let mut ch: crate::models::Channel = sqlx::query_as(
        &state.db.format_query("SELECT * FROM channels WHERE id = ?")
    ).bind(channel_id).fetch_optional(&state.db.pool).await.ok()??;

    if let Some(pid) = ch.preset_id {
        if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
            &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
        ).bind(pid).fetch_optional(&state.db.pool).await {
            ch.base_url = preset.base_url;
            ch.api_key = preset.api_key;
        }
    }
    Some(ch)
}

/// 从提交响应 JSON 中提取 task_id
fn extract_task_id(response: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(response).ok()?;
    
    // 1. 尝试从根节点获取
    if let Some(id) = v.get("task_id").or_else(|| v.get("id")).and_then(|id| id.as_str()) {
        return Some(id.to_string());
    }

    // 2. 尝试从 data 节点获取 (支持对象或数组)
    if let Some(data) = v.get("data") {
        if let Some(id) = data.get("task_id").or_else(|| data.get("id")).and_then(|id| id.as_str()) {
            return Some(id.to_string());
        }
        if let Some(arr) = data.as_array() {
            if let Some(first) = arr.first() {
                if let Some(id) = first.get("task_id").or_else(|| first.get("id")).and_then(|id| id.as_str()) {
                    return Some(id.to_string());
                }
            }
        }
    }
    
    None
}
