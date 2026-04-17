//! Relay: POST /v1/video/generations & GET /v1/video/generations/{task_id}
//! OpenAI-compatible video generation task endpoints with forward-rule-driven protocol adaptation.

use axum::{extract::{State, Extension, Path, Query}, response::Response, Json};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward};
use super::url_utils::join_url;

/// POST /v1/video/generations — Submit a video generation task
pub async fn video_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str().unwrap_or("video-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    // 解析转发规则
    let resolved = forward::resolve_forward_rule(&state, model, "视频", "/v1/video/generations")
        .await
        .unwrap_or_else(|| forward::infer_forward_from_base_url(&channel.base_url, "视频"));

    let upstream_body = forward::transform_request_body(&resolved, &resolved_model, &body, "视频");
    let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

    tracing::info!("[Video] model={}, target_type={}, url={}", model, resolved.target_type, url);

    // 构建并发送上游请求
    let mut builder = state.http_client.post(&url)
        .header("Content-Type", "application/json");
    for (k, v) in &auth_headers {
        builder = builder.header(k, v);
    }
    let resp = builder.json(&upstream_body).send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
        let latency_ms = start_time.elapsed().as_millis() as u32;
        let ep = format!("/v1/video/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status,
            &ep, Some(&display_err), latency_ms, 0,
            Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()), None).await;
        return Err(AppError::UpstreamError(display_err));
    }

    let db_model: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    let _db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None)
        } else { None }
    } else { None };

    // 预扣费逻辑
    if pre_deduction > 0.0 {
        if let Err(e) = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
        }
    }

    let data = resp.bytes().await?;
    let response_content_str = String::from_utf8_lossy(&data).to_string();

    // 视频是异步任务：POST 只记录日志（cost=预扣费），不执行多余结算预扣费
    // 真正的 token 和差值结算在 GET 轮询成功后执行
    let latency_ms = start_time.elapsed().as_millis() as u32;
    let ep = format!("/v1/video/generations|{}", resolved.upstream_path.replace("${model}", &resolved_model));
    proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, 0, 0, pre_deduction, pre_deduction, 200,
        &ep, None, latency_ms, 0,
        Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()), Some("异步任务预扣费冻结".to_string())).await;

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}

/// GET /v1/video/generations/{task_id}?model=xxx — Query task status
pub async fn video_generations_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("video-gen").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 从日志中查找原始渠道信息
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content, COALESCE(request_content, '') FROM logs WHERE response_content LIKE ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;
    let mut original_request: Option<String> = None;
    let log_row: Option<(i64, i64, String, String, String)> = sqlx::query_as(&log_query)
        .bind(format!("%{}%", task_id))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, _, req_content)) = log_row {
        db_log_id = Some(l_id);
        model_name = m_name;
        if !req_content.is_empty() { original_request = Some(req_content); }
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

    let (channel, _) = if let Some(ch) = channel_opt {
        (ch, "".to_string())
    } else {
        proxy::select_channel_for_model(&state, &model_name, &ctx.user_group).await?
    };

    // 解析转发规则决定查询路径
    let resolved = forward::resolve_forward_rule(&state, &model_name, "视频", "/v1/video/generations")
        .await;

    let url = if let Some(ref r) = resolved {
        if r.target_type == "volcengine" {
            join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id))
        } else {
            join_url(&channel.base_url, &format!("/v1/video/generations/{}", task_id))
        }
    } else {
        join_url(&channel.base_url, &format!("/v1/video/generations/{}", task_id))
    };

    tracing::info!("GET status url: {}, using channel id: {}", url, channel.id);

    let resp = state.http_client.get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
        return Err(AppError::UpstreamError(display_err));
    }

    let data = resp.bytes().await?;
    let get_resp_str = String::from_utf8_lossy(&data).to_string();

    if let Some(log_id) = db_log_id {
        // 解析响应获取任务状态（兼容两种格式：顶层 status 或 final_result.status）
        let resp_json: serde_json::Value = serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));
        let task_status = resp_json.get("status")
            .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
            .and_then(|s| s.as_str()).unwrap_or("");

        // 更新日志响应内容
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
            .bind(&get_resp_str)
            .bind(log_id)
            .execute(&state.db.pool).await;

        // 任务完成时提取 token 用量并执行计费
        if task_status == "succeeded" {
            let usage = crate::relay::usage_extractor::parse_usage(&get_resp_str);
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

                let mut features = crate::relay::usage_extractor::extract_request_features(&resp_json);
                // 从原始请求补充分辨率和视频输入信息（GET 响应通常不含这些字段）
                if let Some(ref req_str) = original_request {
                    if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(req_str) {
                        let req_feat = crate::relay::usage_extractor::extract_request_features(&req_json);
                        if features.resolution.is_none() { features.resolution = req_feat.resolution; }
                        if req_feat.has_video { features.has_video = true; }
                    }
                }
                let (cost, detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, ctx.discount, &features);

                // 获取预扣费金额
                let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
                // apply_balance = 实际费用 - 已预扣金额（正数=补扣，负数=退款）
                let apply_balance = cost - pre_deduction;

                // 更新日志中的 token 和费用以及计费明细
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cost = ?, billing_detail = ? WHERE id = ?"
                ))
                .bind(usage.prompt).bind(usage.completion).bind(cost).bind(detail).bind(log_id)
                .execute(&state.db.pool).await;

                // 从用户余额结算（补扣或退款）
                if cost > 0.0 || pre_deduction > 0.0 {
                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    ))
                    .bind(apply_balance).bind(apply_balance).bind(&token.user_id)
                    .execute(&state.db.pool).await;

                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    ))
                    .bind(apply_balance).bind(token.id)
                    .execute(&state.db.pool).await;

                    tracing::info!("[Video Billing] task={}, model={}, tokens={}, cost={:.6}, pre_deducted={:.6}, applied={:.6}", 
                        task_id, model_name, usage.total, cost, pre_deduction, apply_balance);
                }
            }
        }
    }

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(get_resp_str))
        .unwrap())
}
