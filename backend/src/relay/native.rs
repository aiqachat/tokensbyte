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
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, action).await?;

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


    // 预扣费
    if pre_deduction > 0.0 {
        if let Err(e) = proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
        }
    }

    if action.starts_with("streamGenerateContent") || is_stream == 1 {
        Ok(crate::relay::stream::handle_native_stream(
            state, token.clone(), channel.clone(), model.to_string(), resp, ctx.discount,
            request_content_str.clone(), start_time, endpoint, Some(request_content_str), pre_deduction
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

        let mut features = crate::relay::usage_extractor::extract_request_features(
            &serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}))
        );
        // 用响应中的实际图片数量覆盖（Gemini 生图场景）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&response_content_str) {
            features.image_count = Some(resp_count);
        }
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount);
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        let resolved_model = channel.resolve_model(model);
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        tracing::info!("[Gemini] model={}, prompt={}, completion={}, cost={:.6}", model, usage.prompt, usage.completion, cost);

        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, usage.prompt, usage.completion, cost, pre_deduction, 200, &endpoint, None, latency_ms, is_stream, Some(request_content_str.clone()), Some(response_content_str), Some(request_content_str), Some(detail)).await;
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
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, "/api/v3/contents/generations/tasks").await?;

    let url = join_url(&channel.base_url, "/api/v3/contents/generations/tasks");
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);
    // 视频模型默认分辨率 720p（确保上游数据与计费一致）
    if fwd.get("resolution").is_none() {
        fwd["resolution"] = serde_json::json!("720p");
    }

    // 素材转换：查询模型转发规则是否启用 asset_convert
    let mut asset_convert_log: Option<String> = None;
    let resolved = super::forward::resolve_forward_rule(&state, model, "视频", "/api/v3/contents/generations/tasks").await;
    if resolved.as_ref().map(|r| r.asset_convert).unwrap_or(false) {
        let convert_logs = super::asset_convert::convert_content_urls(&state, &token.user_id, &mut fwd).await;
        if !convert_logs.is_empty() {
            asset_convert_log = Some(format!("素材转换: {}", convert_logs.join(" | ")));
        }
    }

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
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0.0, status, "/api/v3/contents/generations/tasks", Some(&err), latency_ms, is_stream, Some(request_content_str.clone()), None, Some(fwd.to_string()), asset_convert_log.clone()).await;
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
    let billing_detail = if let Some(ref acl) = asset_convert_log {
        format!("异步任务预扣费冻结 | {}", acl)
    } else {
        "异步任务预扣费冻结".to_string()
    };
    proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, 0, 0, pre_deduction, pre_deduction, 200, "/api/v3/contents/generations/tasks", None, latency_ms, is_stream, Some(request_content_str), Some(response_content_str), Some(fwd.to_string()), Some(billing_detail)).await;

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
        proxy::select_channel_for_model(&state, &token, &model_name, &ctx.user_group, "/api/v3/contents/generations/tasks/{task_id}").await?
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
                let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount);
                let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, final_discount, &features);
                detail.push_str(&format!(" | {}", discount_source));
                let resolved_model = channel.resolve_model(&model_name);
                if model_name != resolved_model {
                    detail.push_str(&format!(" | 模型映射: {} ➞ {}", model_name, resolved_model));
                }

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
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, "/api/v3/images/generations").await?;

    let url = join_url(&channel.base_url, "/api/v3/images/generations");
    let mut fwd = body.clone();
    fwd["model"] = serde_json::json!(resolved_model);

    // n > 1 → 启用组图（与 forward.rs volcengine_image 分支逻辑一致）
    let n = body.get("n").and_then(|v| v.as_i64()).unwrap_or(1);
    if n > 1 {
        fwd["sequential_image_generation"] = serde_json::json!("auto");
        fwd["sequential_image_generation_options"] = serde_json::json!({
            "max_images": n
        });
    }
    // n 已转换为官方参数，删除避免冗余传到上游
    if let Some(obj) = fwd.as_object_mut() { obj.remove("n"); }

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

    let _cost = proxy::get_model_cost(&state, model, ctx.discount).await;
    
    // 如果上游返回的是流，虽然我们缓冲返回了，也按请求标志记录
    let is_upstream_stream = resp.headers().get("content-type")
        .and_then(|v| v.to_str().ok()).map(|s| s.contains("text/event-stream")).unwrap_or(false);
    let final_is_stream = if is_stream == 1 || is_upstream_stream { 1 } else { 0 };

    let data = resp.bytes().await?;
    let response_content_str = String::from_utf8_lossy(&data).to_string();

    // 提取 token 用量
    let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);
    let mut features = crate::relay::usage_extractor::extract_request_features(&body);
    // 用响应中的实际图片数量覆盖请求体的 n 值（按张计费的最终依据）
    if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&response_content_str) {
        features.image_count = Some(resp_count);
    }

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

    let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount);
    let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, final_discount, &features);
    detail.push_str(&format!(" | {}", discount_source));
    let resolved_model = channel.resolve_model(model);
    if model != resolved_model {
        detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
    }
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

// ═══════════════════════════════════════════════════════════════
//  Volcengine Ark Asset Management API Proxy
// ═══════════════════════════════════════════════════════════════

const ARK_ASSET_ACTIONS: &[&str] = &[
    "CreateAsset", "GetAsset", "UpdateAsset", "DeleteAsset", "ListAssets",
    "CreateAssetGroup", "GetAssetGroup", "UpdateAssetGroup", "DeleteAssetGroup", "ListAssetGroups",
];

pub async fn ark_asset_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Query(params): Query<HashMap<String, String>>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    // 1. 获取 Action (兼容 Action/action 和 Version/version)
    let action = params.get("Action").or_else(|| params.get("action")).cloned().unwrap_or_default();
    let version = params.get("Version").or_else(|| params.get("version")).cloned().unwrap_or_else(|| "2024-01-01".to_string());

    // 2. 白名单检查
    if !ARK_ASSET_ACTIONS.contains(&action.as_str()) {
        return Err(AppError::BadRequest(format!("Unsupported Ark Asset Action: {}", action)));
    }

    // 3. 用户及插件等级权限检查
    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&token.user_id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::Unauthorized)?;

    if user.role != "admin" {
        // 检查插件状态和允许的等级
        let plugin_info: Option<(i64, String)> = sqlx::query_as(
            &state.db.format_query("SELECT is_enabled, allowed_levels FROM plugins WHERE name = 'asset_manager'")
        )
        .fetch_optional(&state.db.pool)
        .await?;

        if let Some((is_enabled, allowed_levels)) = plugin_info {
            if is_enabled == 0 {
                return Err(AppError::Forbidden("素材资产管理功能未开启".to_string()));
            }
            if allowed_levels != "all" {
                let allowed: Vec<&str> = allowed_levels.split(',').collect();
                if !allowed.contains(&user.user_group.as_str()) {
                    return Err(AppError::Forbidden("您当前的用户等级无权使用素材资产管理功能".to_string()));
                }
            }
            
            // 进一步检查该等级的 API 接口开放状态（默认开启）
            let api_enabled_key = format!("api_enabled_{}", user.user_group);
            let is_api_enabled = sqlx::query_scalar::<_, String>(
                &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = 'asset_manager' AND config_key = ?")
            )
            .bind(&api_enabled_key)
            .fetch_optional(&state.db.pool)
            .await?
            .unwrap_or_else(|| "true".to_string()); // 默认是开启可调用的

            if is_api_enabled != "true" {
                return Err(AppError::Forbidden("您当前的用户等级未开启 API 接口访问权限".to_string()));
            }
        } else {
            return Err(AppError::Forbidden("素材资产管理插件未安装".to_string()));
        }
    }

    // 4. 获取火山引擎配置
    let volc_config = crate::api::plugins::get_volc_config(&state, "asset_manager").await
        .ok_or_else(|| AppError::BadRequest("系统未配置火山引擎素材管理凭证".to_string()))?;

    let client = crate::services::volcengine::VolcClient::new(volc_config)
        .with_logger(state.db.clone(), token.user_id.clone())
        .with_source("api_proxy");

    // 5. 转发请求，复用 call_api 解析为 serde_json::Value 直接获得完整原始响应 JSON
    match client.call_api::<_, serde_json::Value>(
        "ark", "cn-beijing", &action, &version, body
    ).await {
        Ok(res) => {
            let res_bytes = serde_json::to_vec(&res).unwrap_or_default();
            Ok(Response::builder()
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(res_bytes))
                .unwrap())
        }
        Err(e) => {
            // 返回上游错误信息
            tracing::error!("[Ark Asset Proxy] {} Failed: {}", action, e);
            Err(AppError::UpstreamError(e.to_string()))
        }
    }
}
