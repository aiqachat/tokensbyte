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
    let row: Option<(String, i64, String, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT response_content, channel_id, model, COALESCE(endpoint, '') FROM logs WHERE id = ?"
        )
    ).bind(log_id).fetch_optional(&state.db.pool).await?;

    let (resp_content, channel_id, model_name, endpoint) = match row {
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

    let mut category = if endpoint.contains("/video/") || endpoint.contains("/videos/") || endpoint.contains("/v1/video") {
        "视频".to_string()
    } else if endpoint.contains("/image/") || endpoint.contains("/images/") || endpoint.contains("/v1/image") {
        "图片".to_string()
    } else {
        String::new()
    };

    if category.is_empty() {
        category = sqlx::query_scalar(
            &state.db.format_query(
                "SELECT COALESCE(t.name, '') FROM models m \
                 LEFT JOIN model_types t ON m.type_id = t.id \
                 WHERE m.model_id = ? LIMIT 1"
            )
        ).bind(&model_name).fetch_optional(&state.db.pool).await
            .unwrap_or(None).unwrap_or_default();
    }

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
        // 从 upstream_path 派生轮询路径，避免硬编码与实际上游不一致
        let path = resolved.upstream_path.replace("${model}", &model_name);
        format!("{}/{}", path.trim_end_matches('/'), task_id)
    };
    let url = super::url_utils::join_url(&channel.base_url, &poll_path);

    let auth_headers = super::forward::build_auth_headers(&resolved, &channel.api_key);
    let mut builder = state.http_client.get(&url);
    for (k, v) in auth_headers {
        builder = builder.header(k, v);
    }
    
    let resp = match builder.send().await {
        Ok(r) => r,
        Err(e) => return Err(anyhow::anyhow!("请求渠道失败: {} (url: {})", e, url)),
    };

    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("渠道返回错误状态码: {} (url: {})", resp.status(), url));
    }

    let body = resp.text().await.unwrap_or_default();
    let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
    // 提取任务状态：兼容根节点、data 节点、final_result 节点、output.task_status（DashScope）
    let raw_status = resp_json.get("status")
        .or_else(|| resp_json.get("data").and_then(|d| d.get("status")))
        .or_else(|| resp_json.get("data").and_then(|d| d.get("task_status")))
        .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
        .or_else(|| resp_json.get("output").and_then(|o| o.get("task_status")))
        .and_then(|s| s.as_str()).unwrap_or("");
    // 将各种厂商返回的状态统一转化为全小写并归一化
    // DashScope 会返回 SUCCEEDED / FAILED / CANCELED / UNKNOWN
    // 可灵返回 succeed（不带 ed）
    let task_status_str = raw_status.to_lowercase();
    let task_status = match task_status_str.as_str() {
        "completed" | "succeeded" | "succeed" | "success" => "succeeded",
        "failed" | "canceled" | "cancelled" | "unknown" => "failed",
        _ => task_status_str.as_str(),
    };

    if task_status != "succeeded" && task_status != "failed" {
        return Ok(format!("当前状态: {}", if task_status.is_empty() { "pending" } else { task_status }));
    }

    // 更新日志响应内容为最终结果
    let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
        .bind(&body).bind(log_id).execute(&state.db.pool).await;

    if task_status == "succeeded" {
        settle_success(state, log_id, &model_name, &body, &resp_json, &url, &category, &channel).await;
        Ok("任务已成功落地并计费".to_string())
    } else {
        settle_failure(state, log_id, &model_name, &task_id, &url, &category).await;
        Ok("任务已失败，预扣费已退回".to_string())
    }
}

/// 任务成功：提取 token、计费、余额结算
async fn settle_success(state: &AppState, log_id: i64, model_name: &str, body: &str, resp_json: &serde_json::Value, poll_url: &str, category: &str, channel: &crate::models::Channel) {
    let usage = super::usage_extractor::parse_usage(body);

    let cat_hint = if category.is_empty() { None } else { Some(category) };
    let db_model = super::proxy::find_active_model_exact(state, model_name, cat_hint, Some(channel)).await;

    let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
        } else { None }
    } else { None };

    // 获取原始预扣费与关键关联 ID（用于结算和折扣查询）
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, user_id, token_id, channel_id FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, uid, token_id, channel_id) = match log_data {
        Some(d) => d,
        None => (0.0, 0.0, "".to_string(), None, None),
    };
    let user_id = if uid.is_empty() { None } else { Some(uid) };

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

    // 从原始请求补充计费特征：优先从 billing_features 快照恢复（1次查询替代原来的2次）
    let mut features = super::usage_extractor::extract_request_features(resp_json);
    if let Ok(Some(bf_str)) = sqlx::query_scalar::<_, String>(
        &state.db.format_query("SELECT COALESCE(billing_features, '') FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await {
        if !bf_str.is_empty() {
            if let Ok(saved_feat) = serde_json::from_str::<super::usage_extractor::ExtractedFeatures>(&bf_str) {
                // 新数据：直接使用 POST 阶段快照，仅合并响应中的补充信息
                if features.resolution.is_none() { features.resolution = saved_feat.resolution; }
                if features.duration_seconds.is_none() { features.duration_seconds = saved_feat.duration_seconds; }
                if features.mode.is_none() { features.mode = saved_feat.mode; }
                if features.sound.is_none() { features.sound = saved_feat.sound; }
                if saved_feat.has_image_ref { features.has_image_ref = true; }
                if saved_feat.has_video { features.has_video = true; }
                if saved_feat.has_audio { features.has_audio = true; }
                if features.service_tier.is_none() { features.service_tier = saved_feat.service_tier; }
            }
        } else {
            // 旧数据兜底：从 upstream_req_content + request_content 提取（2次额外 SQL 查询）
            if let Ok(Some(upstream_str)) = sqlx::query_scalar::<_, String>(
                &state.db.format_query("SELECT COALESCE(upstream_req_content, '') FROM logs WHERE id = ?")
            ).bind(log_id).fetch_optional(&state.db.pool).await {
                if !upstream_str.is_empty() {
                    if let Ok(upstream_json) = serde_json::from_str::<serde_json::Value>(&upstream_str) {
                        let upstream_feat = super::usage_extractor::extract_request_features(&upstream_json);
                        if features.duration_seconds.is_none() { features.duration_seconds = upstream_feat.duration_seconds; }
                        if features.resolution.is_none() { features.resolution = upstream_feat.resolution; }
                        if features.mode.is_none() { features.mode = upstream_feat.mode; }
                        if features.sound.is_none() { features.sound = upstream_feat.sound; }
                        if upstream_feat.has_image_ref { features.has_image_ref = true; }
                        if upstream_feat.has_video { features.has_video = true; }
                        if upstream_feat.has_audio { features.has_audio = true; }
                    }
                }
            }
            if let Ok(Some(req_str)) = sqlx::query_scalar::<_, String>(
                &state.db.format_query("SELECT COALESCE(request_content, '') FROM logs WHERE id = ?")
            ).bind(log_id).fetch_optional(&state.db.pool).await {
                if !req_str.is_empty() {
                    if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(&req_str) {
                        let req_feat = super::usage_extractor::extract_request_features(&req_json);
                        if features.resolution.is_none() { features.resolution = req_feat.resolution; }
                        if features.duration_seconds.is_none() { features.duration_seconds = req_feat.duration_seconds; }
                        if req_feat.has_video { features.has_video = true; }
                        if req_feat.has_audio { features.has_audio = true; }
                        if req_feat.has_image_ref { features.has_image_ref = true; }
                        if features.service_tier.is_none() { features.service_tier = req_feat.service_tier; }
                        if features.mode.is_none() { features.mode = req_feat.mode; }
                        if features.sound.is_none() { features.sound = req_feat.sound; }
                    }
                }
            }
        }
    }
    // 从可灵终态响应提取实际视频时长（覆盖请求体中的预期值）
    if let Some(kling_dur) = super::usage_extractor::extract_kling_video_duration(resp_json) {
        features.duration_seconds = Some(kling_dur);
    }
    // 视频模型 duration 兜底：确保按秒计费时不为 0
    if category == "视频" && features.duration_seconds.is_none() {
        features.duration_seconds = Some(5.0);
    }
    // 异步任务终态如果是图片，使用前面已提取的图片数量进行计费
    if let Some(resp_count) = image_count {
        features.image_count = Some(resp_count);
    }

    let (final_discount, discount_source) = super::proxy::resolve_discount(db_model.as_ref(), user_discount);
    let (cost, mut detail) = super::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, 0, final_discount, &features);
    detail.push_str(&format!(" | {} | [后台自动轮询结算]", discount_source));



    let apply_balance = cost - pre_deduction;

    match state.db.pool.begin().await {
        Ok(mut tx) => {
            // 1. 更新日志计费
            sqlx::query(&state.db.format_query(
                "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?, cost = ?, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
            )).bind(usage.prompt).bind(usage.completion).bind(0_i32).bind(cost).bind(&detail).bind(log_id)
            .execute(&mut *tx).await.ok();

            // 2. 余额结算（差额更新，修复双重计数）
            if let Some(ref final_uid) = user_id {
                if apply_balance > 0.0 {
                    // 补扣差额：先扣赠送，不足扣系统
                    sqlx::query(&state.db.format_query(
                        "UPDATE users SET \
                         balance = CASE WHEN gift_balance >= ? THEN balance ELSE balance - (? - gift_balance) END, \
                         gift_balance = CASE WHEN gift_balance >= ? THEN gift_balance - ? ELSE 0 END, \
                         used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(apply_balance).bind(apply_balance).bind(apply_balance).bind(apply_balance)
                    .bind(apply_balance).bind(final_uid)
                    .execute(&mut *tx).await.ok();
                } else if apply_balance < 0.0 {
                    // 退款：实际费用按先扣赠送原则分配，退还各钱包多扣部分
                    let refund = -apply_balance;
                    let gift_cost = cost.min(pre_deduct_gift);
                    let gift_refund = pre_deduct_gift - gift_cost;
                    let balance_refund = refund - gift_refund;
                    sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                         used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(balance_refund).bind(gift_refund)
                    .bind(apply_balance).bind(final_uid)
                    .execute(&mut *tx).await.ok();
                }

                if apply_balance != 0.0 {
                    // 令牌配额：差额更新
                    if let Some(tid) = token_id {
                        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET quota_used = quota_used + ?, last_used_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(apply_balance).bind(&now_str).bind(tid)
                        .execute(&mut *tx).await.ok();
                    }

                    // 渠道配额：差额更新
                    if let Some(cid) = channel_id {
                        sqlx::query(&state.db.format_query(
                            "UPDATE channels SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(apply_balance).bind(cid)
                        .execute(&mut *tx).await.ok();
                    }
                }
            }

            let _ = tx.commit().await;

            tracing::info!("[TaskPoller Success] log_id={}, model={}, tokens={}, cost={:.6}, applied={:.6}, url={}",
                log_id, model_name, usage.total, cost, apply_balance, poll_url);
        }
        Err(e) => {
            tracing::error!("[TaskPoller Success Billing] 启动事务失败: {:?}", e);
        }
    }
}

/// 任务失败：按预扣费钱包来源精准退还
async fn settle_failure(state: &AppState, log_id: i64, _model_name: &str, _task_id: &str, poll_url: &str, _category: &str) {
    // 获取原始预扣费、赠送钱包拆分与关键 ID
    let log_data: Option<(f64, f64, String, Option<i64>, Option<i64>)> = sqlx::query_as(
        &state.db.format_query("SELECT cost, pre_deduct_gift, user_id, token_id, channel_id FROM logs WHERE id = ?")
    ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

    let (pre_deduction, pre_deduct_gift, uid, token_id, channel_id) = match log_data {
        Some(d) => d,
        None => (0.0, 0.0, "".to_string(), None, None),
    };

    let detail = if pre_deduction > 0.0 {
        "任务失败，预扣费已退回 | [后台自动轮询]"
    } else {
        "任务失败，该请求无冻结费用 | [后台自动轮询]"
    };

    match state.db.pool.begin().await {
        Ok(mut tx) => {
            if pre_deduction > 0.0 {
                // 精准退还到对应钱包
                let balance_refund = pre_deduction - pre_deduct_gift;
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                     used_quota = used_quota - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )).bind(balance_refund).bind(pre_deduct_gift).bind(pre_deduction).bind(&uid)
                .execute(&mut *tx).await.ok();

                // 退回 Token 配额
                if let Some(tid) = token_id {
                    sqlx::query(&state.db.format_query(
                        "UPDATE api_tokens SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(pre_deduction).bind(tid)
                    .execute(&mut *tx).await.ok();
                }

                // 退回渠道配额
                if let Some(cid) = channel_id {
                    sqlx::query(&state.db.format_query(
                        "UPDATE channels SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(pre_deduction).bind(cid)
                    .execute(&mut *tx).await.ok();
                }
            }

            sqlx::query(&state.db.format_query(
                "UPDATE logs SET status_code = 400, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
            )).bind(detail).bind(log_id)
            .execute(&mut *tx).await.ok();

            let _ = tx.commit().await;
            tracing::info!("[TaskPoller Failure] log_id={} failed, refunded pre_deduction={:.6}, url={}", log_id, pre_deduction, poll_url);
        }
        Err(e) => {
            tracing::error!("[TaskPoller Failure Billing] 启动事务失败: {:?}", e);
        }
    }
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

    // 2. 尝试从 output 节点获取（DashScope 格式：{ output: { task_id: "..." } }）
    if let Some(output) = v.get("output") {
        if let Some(id) = output.get("task_id").or_else(|| output.get("id")).and_then(|id| id.as_str()) {
            return Some(id.to_string());
        }
    }

    // 3. 尝试从 data 节点获取 (支持对象或数组)
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
