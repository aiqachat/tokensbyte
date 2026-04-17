//! Relay: Native protocol passthrough for Google Gemini & Volcengine.
//! Provides direct-path endpoints that mirror the vendor's own API surface,
//! while still running through the gateway's auth / billing / logging pipeline.

use axum::{
    extract::{State, Extension, Path, Query, Request},
    middleware::Next,
    response::{Response, IntoResponse},
    Json,
};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::proxy;
use super::url_utils::join_url;

// ═══════════════════════════════════════════════════════════════
//  Middleware: Normalize Google auth formats → Authorization: Bearer
//  Supports:  Authorization: Bearer sk-xxx  (standard)
//             x-goog-api-key: sk-xxx        (Google header)
//             ?key=sk-xxx                    (Google query param)
// ═══════════════════════════════════════════════════════════════

pub async fn normalize_google_auth(mut request: Request, next: Next) -> Response {
    if request.headers().get("authorization").is_none() {
        // Try x-goog-api-key header
        if let Some(key) = request
            .headers()
            .get("x-goog-api-key")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert("authorization", val);
            }
        }
        // Try ?key= query parameter
        else if let Some(query) = request.uri().query() {
            for pair in query.split('&') {
                if let Some(key) = pair.strip_prefix("key=") {
                    if let Ok(val) = format!("Bearer {}", key).parse() {
                        request.headers_mut().insert("authorization", val);
                    }
                    break;
                }
            }
        }
    }
    next.run(request).await
}

// ═══════════════════════════════════════════════════════════════
//  Google Gemini Native:
//    POST /v1beta/models/{model}:generateContent
//    POST /v1beta/models/{model}:streamGenerateContent
// ═══════════════════════════════════════════════════════════════

pub async fn gemini_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(model_action): Path<String>,
    Query(query_params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = String::from_utf8_lossy(&body).to_string();
    // model_action = "gemini-2.0-flash:generateContent"
    let (model, action) = model_action
        .split_once(':')
        .ok_or_else(|| AppError::BadRequest("Invalid path: expected {model}:{action}".into()))?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    // Build upstream query: replace key with channel's real key, keep other params (e.g. alt=sse)
    let mut qs = format!("key={}", channel.api_key);
    for (k, v) in &query_params {
        if k != "key" {
            qs.push_str(&format!("&{}={}", k, v));
        }
    }
    let url = format!(
        "{}?{}",
        join_url(&channel.base_url, &format!("/v1beta/models/{}:{}", resolved_model, action)),
        qs
    );

    let resp = state.http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_vec())
        .send()
        .await?;

    let status = resp.status().as_u16();
    let endpoint = format!("/v1beta/models/{}:{}", model, action);

    let mut is_stream = if action.starts_with("streamGenerateContent") { 1 } else { 0 };
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&request_content_str) {
        if json["stream"].as_bool().unwrap_or(false) {
            is_stream = 1;
        }
    }

    if !resp.status().is_success() {
        let err = resp.text().await?;
        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status, &endpoint, Some(&err), latency_ms, is_stream, Some(request_content_str.clone()), None, Some(request_content_str.clone()), None).await;
        return Err(AppError::UpstreamError(err));
    }



    if action.starts_with("streamGenerateContent") || is_stream == 1 {
        Ok(crate::relay::stream::handle_native_stream(
            state, token.clone(), channel.clone(), model.to_string(), resp, ctx.discount,
            request_content_str.clone(), start_time, endpoint, Some(request_content_str), 0.0
        ).await.into_response())
    } else {
        let data = resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();

        // 提取 token 用量（Gemini usageMetadata / OpenAI usage）
        let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);

        // 查询模型与计费规则
        let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
            .bind(model).fetch_optional(&state.db.pool).await.unwrap_or(None);
        let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
            if let Some(rule_id) = m.billing_rule_id {
                sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                    .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
            } else { None }
        } else { None };

        let features = crate::relay::usage_extractor::extract_request_features(
            &serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}))
        );
        let (cost, detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, ctx.discount, &features);
        tracing::info!("[Gemini] model={}, prompt={}, completion={}, cost={:.6}", model, usage.prompt, usage.completion, cost);

        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill(&state, &token, channel.id, model, usage.prompt, usage.completion, cost, 200, &endpoint, None, latency_ms, is_stream, Some(request_content_str.clone()), Some(response_content_str), Some(request_content_str), Some(detail)).await;
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}

// ═══════════════════════════════════════════════════════════════
//  Volcengine Native:
//    POST /api/v3/contents/generations/tasks
//    GET  /api/v3/contents/generations/tasks/{task_id}
// ═══════════════════════════════════════════════════════════════

/// POST — Submit image/video generation task
pub async fn volcengine_submit(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str().unwrap_or("volcengine-gen");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = join_url(&channel.base_url, "/api/v3/contents/generations/tasks");
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);

    let resp = state.http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .json(&fwd)
        .send()
        .await?;

    let is_stream = if body["stream"].as_bool().unwrap_or(false) { 1 } else { 0 };

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status, "/v1/video/generations|/api/v3/contents/generations/tasks", Some(&err), latency_ms, is_stream, Some(request_content_str.clone()), None, Some(fwd.to_string()), None).await;
        return Err(AppError::UpstreamError(err));
    }

    // 预扣费逻辑（异步任务 POST 阶段）
    if pre_deduction > 0.0 {
        let _ = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await;
    }

    let data = resp.bytes().await?;
    let response_content_str = String::from_utf8_lossy(&data).to_string();
    let latency_ms = start_time.elapsed().as_millis() as u32;
    // 异步任务 POST 只记录，真正计费在 GET 轮询成功后执行
    proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, 0, 0, pre_deduction, pre_deduction, 200, "/v1/video/generations|/api/v3/contents/generations/tasks", None, latency_ms, is_stream, Some(request_content_str), Some(response_content_str), Some(fwd.to_string()), Some("异步任务预扣费冻结".to_string())).await;

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}

/// GET — Query task status
pub async fn volcengine_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("video-gen").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content FROM logs WHERE response_content LIKE ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;
    let log_row: Option<(i64, i64, String, String)> = sqlx::query_as(&log_query)
        .bind(format!("%{}%", task_id))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, _orig_content)) = log_row {
        db_log_id = Some(l_id);
        model_name = m_name;
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

    let url = join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id));

    let resp = state.http_client.get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .send().await?;

    if !resp.status().is_success() {
        let err = resp.text().await?;
        return Err(AppError::UpstreamError(err));
    }

    let data = resp.bytes().await?;
    let get_resp_str = String::from_utf8_lossy(&data).to_string();

    if let Some(log_id) = db_log_id {
        // 解析状态（兼容顶层 status 和 final_result.status）
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

                let features = crate::relay::usage_extractor::extract_request_features(&resp_json);
                let (cost, detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, ctx.discount, &features);

                let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
                let apply_balance = cost - pre_deduction;

                // 更新日志
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cost = ?, billing_detail = ? WHERE id = ?"
                )).bind(usage.prompt).bind(usage.completion).bind(cost).bind(detail).bind(log_id)
                .execute(&state.db.pool).await;

                // 余额结算
                if cost > 0.0 || pre_deduction > 0.0 {
                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(apply_balance).bind(apply_balance).bind(&token.user_id)
                    .execute(&state.db.pool).await;

                    let _ = sqlx::query(&state.db.format_query(
                        "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )).bind(apply_balance).bind(token.id)
                    .execute(&state.db.pool).await;

                    tracing::info!("[Volcengine Video Billing] task={}, model={}, tokens={}, cost={:.6}, pre_deducted={:.6}", 
                        task_id, model_name, usage.total, cost, pre_deduction);
                }
            }
        }
    }

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(get_resp_str))
        .unwrap())
}

// ═══════════════════════════════════════════════════════════════
//  Volcengine Native:
//    POST /api/v3/images/generations  (图片生成 OpenAI 兼容格式)
// ═══════════════════════════════════════════════════════════════

/// POST — 火山方舟图片生成（官方路径，body 保持 OpenAI 兼容格式）
pub async fn volcengine_images(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let start_time = std::time::Instant::now();
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let model = body["model"].as_str().unwrap_or("volcengine-image");
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, model, &ctx.user_group).await?;

    let url = join_url(&channel.base_url, "/api/v3/images/generations");
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);

    let resp = state.http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .json(&fwd)
        .send()
        .await?;

    let is_stream = if body["stream"].as_bool().unwrap_or(false) { 1 } else { 0 };

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err = resp.text().await?;
        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status,
            "/api/v3/images/generations", Some(&err), latency_ms, is_stream,
            Some(request_content_str.clone()), None, Some(fwd.to_string()), None).await;
        return Err(AppError::UpstreamError(err));
    }

    let cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    
    // 如果上游返回的是流，虽然我们缓冲返回了，也按请求标志记录
    let is_upstream_stream = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok()).map(|s| s.contains("text/event-stream")).unwrap_or(false);
    let final_is_stream = if is_stream == 1 || is_upstream_stream { 1 } else { 0 };

    let data = resp.bytes().await?;
    let response_content_str = String::from_utf8_lossy(&data).to_string();

    // 提取 token 用量
    let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);
    let features = crate::relay::usage_extractor::extract_request_features(&body);

    // 查询模型与计费规则
    let db_model: Option<crate::models::Model> = sqlx::query_as(&state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"))
        .bind(model).fetch_optional(&state.db.pool).await.unwrap_or(None);
    let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
        if let Some(rule_id) = m.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
        } else { None }
    } else { None };

    // 因为 pre_deduction 已经在前置 check_access 中获取过了
    if pre_deduction > 0.0 {
        let _ = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await;
    }

    let (cost, detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, ctx.discount, &features);
    tracing::info!("[Volcengine Image] model={}, prompt={}, completion={}, cost={:.6}", model, usage.prompt, usage.completion, cost);

    let latency_ms = start_time.elapsed().as_millis() as u32;
    proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, usage.prompt, usage.completion, cost, pre_deduction, 200,
        "/api/v3/images/generations", None, latency_ms, final_is_stream,
        Some(request_content_str), Some(response_content_str), Some(fwd.to_string()), Some(detail)).await;

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(data))
        .unwrap())
}
