//! 后台定时轮询器：自动检查未完成计费的异步视频/图片生成任务，
//! 每 2 分钟轮询一次上游获取最终结果，确保计费正确落地。

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
    // 条件：endpoint 是异步任务提交接口，prompt_tokens=0 表示尚未完成计费，
    //       且是最近 24 小时内的任务（避免无限重试过老的记录）
    let rows: Vec<(i64, String, i64, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, response_content, channel_id, model FROM logs \
             WHERE endpoint LIKE '%/api/v3/contents/generations/tasks%' \
             AND prompt_tokens = 0 AND completion_tokens = 0 \
             AND status_code = 200 \
             AND created_at > (NOW() - INTERVAL '24 hours')::text \
             ORDER BY id DESC LIMIT 50"
        )
    )
    .fetch_all(&state.db.pool)
    .await?;

    if rows.is_empty() { return Ok(()); }
    tracing::info!("[TaskPoller] 发现 {} 条待轮询任务", rows.len());

    for (log_id, resp_content, channel_id, model_name) in rows {
        // 从提交响应中提取 task_id
        let task_id = match extract_task_id(&resp_content) {
            Some(id) => id,
            None => continue, // 无法解析 task_id，跳过
        };

        // 获取对应渠道
        let channel: Option<crate::models::Channel> = sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE id = ?")
        ).bind(channel_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

        let channel = match channel {
            Some(mut ch) => {
                if let Some(pid) = ch.preset_id {
                    if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
                        &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
                    ).bind(pid).fetch_optional(&state.db.pool).await {
                        ch.base_url = preset.base_url;
                        ch.api_key = preset.api_key;
                    }
                }
                ch
            }
            None => continue,
        };

        let url = super::url_utils::join_url(
            &channel.base_url,
            &format!("/api/v3/contents/generations/tasks/{}", task_id),
        );

        let resp = match state.http_client.get(&url)
            .header("Authorization", format!("Bearer {}", channel.api_key))
            .send().await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("[TaskPoller] task={} 请求失败: {}", task_id, e);
                continue;
            }
        };

        if !resp.status().is_success() { continue; }

        let body = resp.text().await.unwrap_or_default();
        let resp_json: serde_json::Value = serde_json::from_str(&body).unwrap_or(serde_json::json!({}));
        let task_status = resp_json.get("status")
            .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
            .and_then(|s| s.as_str()).unwrap_or("");

        // 仅处理终态
        if task_status != "succeeded" && task_status != "failed" {
            continue;
        }

        // 更新日志响应内容
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
            .bind(&body).bind(log_id).execute(&state.db.pool).await;

        if task_status == "succeeded" {
            let usage = super::usage_extractor::parse_usage(&body);
            if usage.total > 0 {
                let db_model: Option<crate::models::Model> = sqlx::query_as(
                    &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
                ).bind(&model_name).fetch_optional(&state.db.pool).await.unwrap_or(None);

                let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
                    if let Some(rule_id) = m.billing_rule_id {
                        sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                            .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
                    } else { None }
                } else { None };

                // 获取用户折扣
                let user_id: Option<String> = sqlx::query_scalar(
                    &state.db.format_query("SELECT user_id FROM logs WHERE id = ?")
                ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

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

                let features = super::usage_extractor::extract_request_features(&resp_json);
                let (final_discount, discount_source) = super::proxy::resolve_discount(db_model.as_ref(), user_discount);
                let (cost, mut detail) = super::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, final_discount, &features);
                detail.push_str(&format!(" | {} | [后台自动轮询结算]", discount_source));

                let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
                let apply_balance = cost - pre_deduction;

                // 更新日志计费
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cost = ?, billing_detail = ? WHERE id = ?"
                )).bind(usage.prompt).bind(usage.completion).bind(cost).bind(&detail).bind(log_id)
                .execute(&state.db.pool).await;

                // 余额结算
                if let Some(ref uid) = user_id {
                    if cost > 0.0 || pre_deduction > 0.0 {
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(apply_balance).bind(apply_balance).bind(uid)
                        .execute(&state.db.pool).await;

                        tracing::info!("[TaskPoller] task={} 自动结算完成, model={}, tokens={}, cost={:.6}, pre_deducted={:.6}",
                            task_id, model_name, usage.total, cost, pre_deduction);
                    }
                }
            }
        } else {
            // 任务失败：退回预扣费
            let pre_deduction = {
                let db_model: Option<crate::models::Model> = sqlx::query_as(
                    &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
                ).bind(&model_name).fetch_optional(&state.db.pool).await.unwrap_or(None);
                db_model.map(|m| m.pre_deduction).unwrap_or(0.0)
            };

            if pre_deduction > 0.0 {
                if let Some(uid) = sqlx::query_scalar::<_, String>(
                    &state.db.format_query("SELECT user_id FROM logs WHERE id = ?")
                ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None) {
                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance + ?, used_quota = used_quota - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(pre_deduction).bind(pre_deduction).bind(&uid)
                    .execute(&state.db.pool).await;

                    tracing::info!("[TaskPoller] task={} 失败,退回预扣费 {:.6}", task_id, pre_deduction);
                }
            }

            // 标记为已处理（设置 prompt_tokens=-1 避免重复轮询）
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET prompt_tokens = -1, billing_detail = ? WHERE id = ?"
            )).bind("任务失败，预扣费已退回 | [后台自动轮询]").bind(log_id)
            .execute(&state.db.pool).await;
        }
    }

    Ok(())
}

/// 从提交响应 JSON 中提取 task_id
fn extract_task_id(response: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(response).ok()?;
    v.get("id").or_else(|| v.get("task_id"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
}
