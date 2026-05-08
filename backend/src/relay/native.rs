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
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance, None).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, action).await?;

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
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0, 0.0, status, &endpoint, Some(&err), latency_ms, is_stream, Some(request_content_str.clone()), None, Some(request_content_str.clone()), None).await;
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
            request_content_str.clone(), start_time, endpoint.clone(), Some(request_content_str), pre_deduction,
            endpoint
        ).await.into_response())
    } else {
        let data = resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();

        // 提取 token 用量（Gemini usageMetadata / OpenAI usage）
        let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);

        // 查询模型与计费规则
        let db_model = proxy::find_active_model_exact(&state, model, None, Some(&channel)).await;
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
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, usage.cached, final_discount, &features);
        detail.push_str(&format!(" | {}", discount_source));
        let resolved_model = channel.resolve_model(model);
        if model != resolved_model {
            detail.push_str(&format!(" | 模型映射: {} ➞ {}", model, resolved_model));
        }
        tracing::info!("[Gemini] model={}, prompt={}, completion={}, cost={:.6}", model, usage.prompt, usage.completion, cost);

        let latency_ms = start_time.elapsed().as_millis() as u32;
        proxy::record_and_bill_with_prededuction(&state, &token, channel.id, model, usage.prompt, usage.completion, usage.cached, cost, pre_deduction, 200, &endpoint, None, latency_ms, is_stream, Some(request_content_str.clone()), Some(response_content_str), Some(request_content_str), Some(detail)).await;
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}

// DeleteAsset、DeleteAssetGroup删除接口暂不对外访问，防止恶意删除了素材中心页面上传的目录组和文件
const ARK_ASSET_ACTIONS: &[&str] = &[
    "CreateAsset", "GetAsset", "UpdateAsset", "ListAssets",
    "CreateAssetGroup", "GetAssetGroup", "UpdateAssetGroup", "ListAssetGroups",
];

pub async fn ark_asset_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Query(params): Query<HashMap<String, String>>,
    Json(mut body): Json<serde_json::Value>,
) -> AppResult<Response> {
    // 1. 获取 Action (兼容 Action/action 和 Version/version)
    let action = params.get("Action").or_else(|| params.get("action")).cloned().unwrap_or_default();
    let version = params.get("Version").or_else(|| params.get("version")).cloned().unwrap_or_else(|| "2024-01-01".to_string());

    // 2. 白名单检查
    if !ARK_ASSET_ACTIONS.contains(&action.as_str()) {
        return Err(AppError::BadRequest(format!("Unsupported Ark Asset Action: {}", action)));
    }

    // 3. 用户及插件等级权限检查
    let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
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
                let level_id_str = user.level_id.unwrap_or(0).to_string();
                if !allowed.contains(&user.user_group.as_str()) && !allowed.contains(&level_id_str.as_str()) {
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

    // 强制设置 ProjectName 为系统配置项，覆盖用户可能传的值，确保资产数据在系统统一管理下
    if let Some(obj) = body.as_object_mut() {
        if !volc_config.project_name.is_empty() {
            obj.insert("ProjectName".to_string(), serde_json::Value::String(volc_config.project_name.clone()));
        } else {
            obj.insert("ProjectName".to_string(), serde_json::Value::String("default".to_string()));
        }
    }

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
