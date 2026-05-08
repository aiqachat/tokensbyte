//! Relay: GET /v1/tasks/{task_id}?model=xxx
//! 通用异步任务轮询网关，支持视频、图片等带有 task_id 的模型轮询。

use axum::{extract::{State, Extension, Path, Query}, response::Response};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward};
use super::url_utils::join_url;

/// GET /v1/tasks/{task_id}?model=xxx — Query task status (Generic for images/videos)
pub async fn task_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 从日志中查找原始渠道信息
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content, COALESCE(request_content, ''), billing_detail, COALESCE(endpoint, ''), COALESCE(billing_features, '') FROM logs WHERE response_content LIKE ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;
    let mut original_request: Option<String> = None;
    let mut billing_features_str: Option<String> = None;
    let mut already_billed = false;
    let mut log_endpoint: Option<String> = None;
    // 转义 LIKE 通配符，防止 task_id 中含 % 或 _ 导致误匹配
    let escaped_id = task_id.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let log_row: Option<(i64, i64, String, String, String, Option<String>, String, String)> = sqlx::query_as(&log_query)
        .bind(format!("%{}%", escaped_id))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, _, req_content, b_detail, ep, bf_str)) = log_row {
        db_log_id = Some(l_id);
        if model_name.is_empty() {
            model_name = m_name;
        }
        if !ep.is_empty() {
            log_endpoint = Some(ep);
        }
        if let Some(ref detail) = b_detail {
            if !detail.is_empty() && !detail.contains("冻结") {
                already_billed = true;
            }
        }
        if !req_content.is_empty() { original_request = Some(req_content); }
        if !bf_str.is_empty() { billing_features_str = Some(bf_str); }
        if let Ok(Some(mut ch)) = sqlx::query_as::<_, crate::models::Channel>(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
            .bind(cid)
            .fetch_optional(&state.db.pool)
            .await
        {
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
            Some(ch)
        } else {
            None
        }
    } else {
        None
    };

    if model_name.is_empty() {
        return Err(AppError::BadRequest("Missing model parameter and cannot infer from task_id".to_string()));
    }

    let (channel, _) = if let Some(ch) = channel_opt {
        (ch, "".to_string())
    } else {
        proxy::select_channel_for_model(&state, &token, &model_name, &ctx.user_group, &ctx.level_id, "/v1/tasks/{task_id}").await?
    };

    // 查询模型类别以推断 forward rule
    let mut category = if let Some(ref ep) = log_endpoint {
        if ep.contains("/video/") || ep.contains("/videos/") || ep.contains("/v1/video") {
            "视频".to_string()
        } else if ep.contains("/image/") || ep.contains("/images/") || ep.contains("/v1/image") {
            "图片".to_string()
        } else {
            String::new()
        }
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

    let default_entry = match category.as_str() {
        "视频" => "/v1/video/generations",
        "图片" => "/v1/images/generations",
        _ => "/v1/tasks",
    };

    // 解析转发规则决定查询路径
    let resolved = match forward::resolve_forward_rule(&state, &model_name, &category, default_entry).await {
        Some(r) => r,
        None => forward::infer_forward_from_base_url(&channel.base_url, &category)
    };

    let url = if resolved.target_type == "volcengine" {
        join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id))
    } else if let Some(ref custom_path) = resolved.poll_path {
        let path = custom_path.replace("${task_id}", &task_id).replace("${model}", &model_name);
        join_url(&channel.base_url, &path)
    } else {
        // 从 upstream_path 派生轮询路径
        let path = resolved.upstream_path.replace("${model}", &model_name);
        join_url(&channel.base_url, &format!("{}/{}", path.trim_end_matches('/'), task_id))
    };

    tracing::info!("GET status url: {}, using channel id: {}", url, channel.id);

    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);
    let mut builder = state.http_client.get(&url);
    for (k, v) in auth_headers {
        builder = builder.header(k, v);
    }
    let resp = builder.send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
        return Err(AppError::UpstreamError(display_err));
    }

    let data = resp.bytes().await?;
    let get_resp_str = String::from_utf8_lossy(&data).to_string();

    if let Some(log_id) = db_log_id {
        // 解析响应获取任务状态：兼容根节点、data 节点、final_result 节点
        let resp_json: serde_json::Value = serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));
        let raw_status = resp_json.get("status")
            .or_else(|| resp_json.get("data").and_then(|d| d.get("status")))
            .or_else(|| resp_json.get("data").and_then(|d| d.get("task_status")))
            .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
            .or_else(|| resp_json.get("output").and_then(|o| o.get("task_status")))
            .and_then(|s| s.as_str()).unwrap_or("");
        
        let task_status_str = raw_status.to_lowercase();
        // 某些上游（如图片异步 API）用 "completed" 表示成功，可灵用 "succeed"，统一归一化
        let task_status = match task_status_str.as_str() {
            "completed" | "succeeded" | "succeed" | "success" => "succeeded",
            "failed" | "canceled" | "cancelled" | "unknown" => "failed",
            other => other,
        };

        // 更新日志响应内容
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
            .bind(&get_resp_str)
            .bind(log_id)
            .execute(&state.db.pool).await;

        // 任务完成时执行计费
        if task_status == "succeeded" && !already_billed {
            let usage = crate::relay::usage_extractor::parse_usage(&get_resp_str);
            let image_count = crate::relay::usage_extractor::count_response_images(&get_resp_str);

            let cat_hint = if category.is_empty() { None } else { Some(category.as_str()) };
            let db_model = proxy::find_active_model_exact(&state, &model_name, cat_hint, Some(&channel)).await;

            let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
                if let Some(rule_id) = m.billing_rule_id {
                    sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                        .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
                } else { None }
            } else { None };

            // 统一提取计费特征：优先从 billing_features 快照恢复（不依赖 request_content）
            let resp_features = crate::relay::usage_extractor::extract_request_features(&resp_json);
            let mut features = if let Some(ref bf_str) = billing_features_str {
                // 新数据：从 POST 阶段存储的计费特征快照反序列化
                let mut f = serde_json::from_str::<crate::relay::usage_extractor::ExtractedFeatures>(bf_str)
                    .unwrap_or_default();
                // 合并响应中可能携带的补充信息（如 DashScope 在终态响应中返回实际分辨率）
                if f.resolution.is_none() { f.resolution = resp_features.resolution; }
                if f.duration_seconds.is_none() { f.duration_seconds = resp_features.duration_seconds; }
                f
            } else {
                // 旧数据兜底：从响应 + request_content 重新提取
                let mut f = resp_features;
                if let Some(ref req_str) = original_request {
                    if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(req_str) {
                        let req_feat = crate::relay::usage_extractor::extract_request_features(&req_json);
                        if f.resolution.is_none() { f.resolution = req_feat.resolution; }
                        if f.duration_seconds.is_none() { f.duration_seconds = req_feat.duration_seconds; }
                        if req_feat.has_video { f.has_video = true; }
                        if req_feat.has_audio { f.has_audio = true; }
                        if f.service_tier.is_none() { f.service_tier = req_feat.service_tier; }
                        if f.mode.is_none() { f.mode = req_feat.mode; }
                        if f.sound.is_none() { f.sound = req_feat.sound; }
                    }
                }
                f
            };
            // 从可灵终态响应提取实际视频时长（覆盖请求中的预期值）
            if let Some(kling_dur) = crate::relay::usage_extractor::extract_kling_video_duration(&resp_json) {
                features.duration_seconds = Some(kling_dur);
            }
            // 视频 duration 兜底
            if category == "视频" && features.duration_seconds.is_none() {
                features.duration_seconds = Some(5.0);
            }
            if let Some(resp_count) = image_count {
                features.image_count = Some(resp_count);
            }

            let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount);
            let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, 0, final_discount, &features);
            detail.push_str(&format!(" | {}", discount_source));
            let resolved_model = channel.resolve_model(&model_name);
            if model_name != resolved_model {
                detail.push_str(&format!(" | 模型映射: {} ➞ {}", model_name, resolved_model));
            }

            // 获取原始预扣费金额（存储在 logs.cost 中）
            let pre_deduction: f64 = sqlx::query_scalar(&state.db.format_query("SELECT cost FROM logs WHERE id = ?"))
                .bind(log_id).fetch_one(&state.db.pool).await.unwrap_or(0.0);
            
            let apply_balance = cost - pre_deduction;

            match state.db.pool.begin().await {
                Ok(mut tx) => {
                    // 1. 更新日志（解除冻结状态）
                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?, cost = ?, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
                    )).bind(usage.prompt).bind(usage.completion).bind(0_i32).bind(cost).bind(detail).bind(log_id)
                    .execute(&mut *tx).await;

                    // 2. 余额与配额结算
                    if cost > 0.0 || pre_deduction > 0.0 {
                        // 更新用户余额（差额）与配额（实际消费）
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(apply_balance).bind(cost).bind(&token.user_id)
                        .execute(&mut *tx).await;

                        // 更新 Token 配额及使用时间
                        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET quota_used = quota_used + ?, last_used_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(cost).bind(&now_str).bind(token.id)
                        .execute(&mut *tx).await;

                        // 更新渠道配额
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE channels SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(cost).bind(channel.id)
                        .execute(&mut *tx).await;
                    }

                    let _ = tx.commit().await;

                    tracing::info!("[Task Success Billing] log_id={}, model={}, cost={:.6}, pre_deducted={:.6}, applied={:.6}, url={}", 
                        log_id, model_name, cost, pre_deduction, apply_balance, url);
                }
                Err(e) => {
                    tracing::error!("[Task Billing] 启动事务失败: {:?}", e);
                }
            }
        } else if task_status == "failed" && !already_billed {
            // 任务失败：退回预扣费并标记
            let pre_deduction: f64 = sqlx::query_scalar(&state.db.format_query("SELECT cost FROM logs WHERE id = ?"))
                .bind(log_id).fetch_one(&state.db.pool).await.unwrap_or(0.0);

            let detail = if pre_deduction > 0.0 { "任务失败，预扣费已退回" } else { "任务失败，该请求无冻结费用" };
            match state.db.pool.begin().await {
                Ok(mut tx) => {
                    if pre_deduction > 0.0 {
                        // 退回用户余额与配额
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE users SET balance = balance + ?, used_quota = used_quota - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(pre_deduction).bind(pre_deduction).bind(&token.user_id)
                        .execute(&mut *tx).await;

                        // 退回 Token 配额
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE api_tokens SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(pre_deduction).bind(token.id)
                        .execute(&mut *tx).await;

                        // 退回渠道配额 (修复遗漏)
                        let _ = sqlx::query(&state.db.format_query(
                            "UPDATE channels SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                        )).bind(pre_deduction).bind(channel.id)
                        .execute(&mut *tx).await;
                    }

                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE logs SET status_code = 400, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
                    )).bind(detail).bind(log_id)
                    .execute(&mut *tx).await;

                    let _ = tx.commit().await;
                    tracing::info!("[Task Failure Billing] log_id={} failed, refunded pre_deduction={:.6}, url={}", log_id, pre_deduction, url);
                }
                Err(e) => {
                    tracing::error!("[Task Failure Billing] 启动事务失败: {:?}", e);
                }
            }
        }
    }

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(get_resp_str))
        .unwrap())
}
