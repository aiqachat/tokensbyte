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
//  Middleware: Normalize Volcengine auth formats → Authorization: Bearer
//  Supports:  Authorization: Bearer sk-xxx  (standard)
//             X-Api-Key: sk-xxx             (Volcengine TTS V3 header)
// ═══════════════════════════════════════════════════════════════

pub async fn normalize_volcengine_auth(mut request: Request, next: Next) -> Response {
    if request.headers().get("authorization").is_none() {
        if let Some(key) = request
            .headers()
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert("authorization", val);
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

    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, model, action).await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 2. 渠道选择
    let channel = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, action).await?;

    // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
    let (pre_deduction, db_model) = proxy::check_access(&state, &token, model, &ctx, None, Some(&channel)).await?;

    // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
    let (resolved_model, mapping_source) = super::router::resolve_model(&channel, model, db_model.as_ref());

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

    let endpoint = format!("/v1beta/models/{}:{}", model, action);
    let mut is_stream = if action.starts_with("streamGenerateContent") { 1 } else { 0 };
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&request_content_str) {
        if json["stream"].as_bool().unwrap_or(false) {
            is_stream = 1;
        }
    }

    // 【一条日志原则】请求前预记录日志
    let pending_log_id = proxy::record_pending_log(
        &state, &token.user_id, channel.id, token.id, model, &endpoint,
        is_stream, Some(&request_content_str),
        Some(&url), Some(&channel),
        None, None,
        None,
        db_model.as_ref(),
        None,
        None,
    ).await;

    let resp = match state.http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .body(body.to_vec())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let err_msg = e.to_string();
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let (s, t, ch_id, m, ep2, rc, em) = (state.clone(), token.clone(), channel.id, model.to_string(), endpoint.clone(), request_content_str.clone(), err_msg.clone());
            let dm = db_model.clone();
            tokio::spawn(async move { proxy::record_and_bill_inner(&s, &t, ch_id, &m, 0, 0, 0, 0.0, 0.0, 0.0, 502, &ep2, Some(&em), latency_ms, is_stream, Some(rc.clone()), None, Some(rc), None, None, pending_log_id, None, None, dm.as_ref()).await; });
            return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
        }
    };

    let status = resp.status().as_u16();

    if !resp.status().is_success() {
        let err = resp.text().await.unwrap_or_default();
        let latency_ms = start_time.elapsed().as_millis() as u32;
        // 【连接保护】计费放入独立 task
        let (s, t, ch_id, m, ep2, rc, er) = (state.clone(), token.clone(), channel.id, model.to_string(), endpoint.clone(), request_content_str.clone(), err.clone());
        let dm = db_model.clone();
        tokio::spawn(async move { proxy::record_and_bill_inner(&s, &t, ch_id, &m, 0, 0, 0, 0.0, 0.0, 0.0, status, &ep2, Some(&er), latency_ms, is_stream, Some(rc.clone()), None, Some(rc), None, None, pending_log_id, None, None, dm.as_ref()).await; });
        return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err)));
    }

    // 预扣费（管理员跳过）
    let pre_deduct_gift = if pre_deduction > 0.0 && ctx.role != "admin" {
        match proxy::pre_deduct(&state, &token.user_id, pre_deduction).await {
            Ok(split) => split.gift,
            Err(e) => {
                let err_msg = match e {
                    sqlx::Error::RowNotFound => "余额不足".to_string(),
                    _ => format!("预扣费失败: {:?}", e),
                };
                tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
                let latency_ms = start_time.elapsed().as_millis() as u32;
                proxy::record_and_bill_inner(
                    &state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0, 0.0, 403,
                    &endpoint, Some(&err_msg), latency_ms, is_stream,
                    Some(request_content_str.clone()), Some(err_msg.clone()), Some(request_content_str),
                    None, None, pending_log_id, None, None, db_model.as_ref()
                ).await;
                return Err(if matches!(e, sqlx::Error::RowNotFound) {
                    AppError::Forbidden("余额不足".to_string())
                } else {
                    AppError::Internal(err_msg)
                });
            }
        }
    } else { 0.0 };

    // 查询计费规则（复用 db_model，流式/非流式共用）
    let db_rule = proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

    if action.starts_with("streamGenerateContent") || is_stream == 1 {
        Ok(crate::relay::stream::handle_native_stream(
            state, token.clone(), channel.clone(), model.to_string(), resp, ctx.discount, ctx.model_discounts.clone(),
            request_content_str.clone(), start_time, endpoint.clone(), Some(request_content_str), pre_deduction,
            pre_deduct_gift,
            endpoint,
            None,
            pending_log_id,
            db_model,
            db_rule,
        ).await.into_response())
    } else {
        let data = resp.bytes().await?;
        let response_content_str = String::from_utf8_lossy(&data).to_string();

        // 提取 token 用量（Gemini usageMetadata / OpenAI usage）
        let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);

        let mut features = crate::relay::usage_extractor::extract_request_features(
            &serde_json::from_str::<serde_json::Value>(&request_content_str).unwrap_or(serde_json::json!({}))
        );
        // 用响应中的实际图片数量覆盖（Gemini 生图场景）
        if let Some(resp_count) = crate::relay::usage_extractor::count_response_images(&response_content_str) {
            features.image_count = Some(resp_count);
        }
        // 折扣策略: MIN(用户模型折扣, 全站折扣, 等级折扣), 受折扣限价约束
        let umd = db_model.as_ref().and_then(|m| crate::relay::proxy::parse_user_model_discount(&ctx.model_discounts, &m.mid));
        let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount, umd);
        features.cache_creation = if usage.cache_creation > 0 { Some(usage.cache_creation) } else { None };
        let is_ha_plugin_enabled = crate::api::plugins::is_plugin_enabled(&state, "high_availability_channel").await;
        let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), &usage, if is_ha_plugin_enabled { final_discount * channel.rate } else { final_discount }, &features);
        detail.push_str(&format!(" | {}", discount_source));
        if is_ha_plugin_enabled && channel.rate != 1.0 {
            detail.push_str(&format!(" | 渠道倍率: {}x", channel.rate));
        }
        if let Some(src) = mapping_source {
            detail.push_str(&format!(" | {}: {} ➞ {}", src, model, resolved_model));
        }
        tracing::info!("[Gemini] model={}, prompt={}, completion={}, cost={:.6}", model, usage.prompt, usage.completion, cost);

        let latency_ms = start_time.elapsed().as_millis() as u32;
        // 【连接保护】计费放入独立 task
        let rsc = response_content_str.clone();
        let (s, t, ch_id, m, ep2, rc) = (state.clone(), token.clone(), channel.id, model.to_string(), endpoint.clone(), request_content_str.clone());
        tokio::spawn(async move { proxy::record_and_bill_inner(&s, &t, ch_id, &m, usage.prompt, usage.completion, usage.cached, cost, pre_deduction, pre_deduct_gift, 200, &ep2, None, latency_ms, is_stream, Some(rc.clone()), Some(rsc), Some(rc), Some(detail), None, pending_log_id, None, None, db_model.as_ref()).await; });
        Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(data))
            .unwrap())
    }
}

// 素材代理 API 白名单（Delete 接口通过用户归属校验确保数据安全）
const ARK_ASSET_ACTIONS: &[&str] = &[
    "CreateAsset", "GetAsset", "UpdateAsset", "ListAssets",
    "CreateAssetGroup", "GetAssetGroup", "UpdateAssetGroup", "ListAssetGroups",
    "DeleteAsset", "DeleteAssetGroup",
];

pub async fn ark_asset_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Query(params): Query<HashMap<String, String>>,
    Json(mut body): Json<serde_json::Value>,
) -> AppResult<Response> {
    #[cfg(feature = "commercial_plugins")]
    {
        // 1. 获取 Action (兼容 Action/action 和 Version/version)
    let action = params.get("Action").or_else(|| params.get("action")).cloned().unwrap_or_default();
    let version = params.get("Version").or_else(|| params.get("version")).cloned().unwrap_or_else(|| "2024-01-01".to_string());

    // 通过 ns 参数指定插件命名空间，默认 asset_manager（国内版）
    let plugin_ns = params.get("ns").map(|s| s.as_str())
        .filter(|s| *s == "asset_manager" || *s == "asset_manager_intl")
        .unwrap_or("asset_manager");

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
        // 检查目标插件是否开启并授权当前用户等级
        let plugin_info: Option<(i64, String)> = sqlx::query_as(
            &state.db.format_query("SELECT is_enabled, allowed_levels FROM plugins WHERE name = ? AND is_enabled = 1")
        )
        .bind(plugin_ns)
        .fetch_optional(&state.db.pool)
        .await?;

        if plugin_info.is_none() {
            return Err(AppError::Forbidden(format!("素材资产管理插件({})未安装或未启用", plugin_ns)));
        }

        if let Some((_, ref allowed_levels)) = plugin_info {
            if allowed_levels != "all" {
                let allowed: Vec<&str> = allowed_levels.split(',').collect();
                let level_id_str = user.level_id.unwrap_or(0).to_string();
                if !allowed.contains(&user.user_group.as_str()) && !allowed.contains(&level_id_str.as_str()) {
                    return Err(AppError::Forbidden("您当前的用户等级无权使用素材资产管理功能".to_string()));
                }
            }
        }

        // 进一步检查该等级的 API 接口开放状态（默认开启）
        let api_enabled_key = format!("api_enabled_{}", user.user_group);
        let is_api_enabled = sqlx::query_scalar::<_, String>(
            &state.db.format_query("SELECT config_value FROM plugin_configs WHERE plugin_name = ? AND config_key = ?")
        )
        .bind(plugin_ns)
        .bind(&api_enabled_key)
        .fetch_optional(&state.db.pool)
        .await?
        .unwrap_or_else(|| "true".to_string()); // 默认是开启可调用的

        if is_api_enabled != "true" {
            return Err(AppError::Forbidden("您当前的用户等级未开启 API 接口访问权限".to_string()));
        }
    }

    // 4. 获取火山引擎配置（根据 plugin_ns 加载对应的凭证）
    let volc_config = crate::api::plugins::get_volc_config(&state, plugin_ns).await
        .ok_or_else(|| AppError::BadRequest(format!("系统未配置火山引擎素材管理凭证({})", plugin_ns)))?;

    // 强制设置 ProjectName 为系统配置项，覆盖用户可能传的值，确保资产数据在系统统一管理下
    if let Some(obj) = body.as_object_mut() {
        if !volc_config.project_name.is_empty() {
            obj.insert("ProjectName".to_string(), serde_json::Value::String(volc_config.project_name.clone()));
        } else {
            obj.insert("ProjectName".to_string(), serde_json::Value::String("default".to_string()));
        }
    }

    // 预提取请求体关键字段（body 将在转发时被消费，需提前保存）
    let body_id = body.get("Id").and_then(|v| v.as_str()).map(|s| s.to_string());
    let body_asset_type = body.get("AssetType").and_then(|v| v.as_str()).map(|s| s.to_lowercase());
    let body_url = body.get("URL").and_then(|v| v.as_str()).map(|s| s.to_string());
    let body_name = body.get("Name").and_then(|v| v.as_str()).map(|s| s.to_string());
    let body_desc = body.get("Description").and_then(|v| v.as_str()).map(|s| s.to_string());

    // 5. 用户归属校验：非 admin 用户操作特定素材/素材组时，须验证资源归属当前用户
    //    兼容历史数据：若本地无任何归属记录（早期 API 调用未记录），自动补录当前用户归属并放行
    if user.role != "admin" {
        match action.as_str() {
            "GetAsset" | "UpdateAsset" | "DeleteAsset" => {
                let id = body_id.as_deref()
                    .ok_or_else(|| AppError::BadRequest("缺少必需参数 Id".into()))?;
                let owned: i64 = sqlx::query_scalar(
                    &state.db.format_query("SELECT COUNT(*) FROM plugin_assets WHERE asset_id = ? AND user_id = ? AND plugin_ns = ?")
                )
                .bind(id).bind(&token.user_id).bind(plugin_ns)
                .fetch_one(&state.db.pool).await.unwrap_or(0);
                if owned == 0 {
                    // 检查是否有其他用户的归属记录
                    let any_exists: i64 = sqlx::query_scalar(
                        &state.db.format_query("SELECT COUNT(*) FROM plugin_assets WHERE asset_id = ? AND plugin_ns = ?")
                    )
                    .bind(id).bind(plugin_ns)
                    .fetch_one(&state.db.pool).await.unwrap_or(0);
                    if any_exists > 0 {
                        return Err(AppError::Forbidden("无权操作此素材，仅可操作自己创建的素材".into()));
                    }
                    // 历史数据无本地记录，自动补录当前用户归属
                    let _ = sqlx::query(&state.db.format_query(
                        "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category, plugin_ns) \
                         VALUES (?, 'unknown', 'api_proxy', 'approved', 'unknown', '', ?, 'API素材', ?)"
                    ))
                    .bind(&token.user_id).bind(id).bind(plugin_ns)
                    .execute(&state.db.pool).await;
                }
            }
            "GetAssetGroup" | "UpdateAssetGroup" | "DeleteAssetGroup" => {
                let id = body_id.as_deref()
                    .ok_or_else(|| AppError::BadRequest("缺少必需参数 Id".into()))?;
                let owned: i64 = sqlx::query_scalar(
                    &state.db.format_query("SELECT COUNT(*) FROM plugin_asset_groups WHERE group_id = ? AND user_id = ? AND plugin_ns = ?")
                )
                .bind(id).bind(&token.user_id).bind(plugin_ns)
                .fetch_one(&state.db.pool).await.unwrap_or(0);
                if owned == 0 {
                    let any_exists: i64 = sqlx::query_scalar(
                        &state.db.format_query("SELECT COUNT(*) FROM plugin_asset_groups WHERE group_id = ? AND plugin_ns = ?")
                    )
                    .bind(id).bind(plugin_ns)
                    .fetch_one(&state.db.pool).await.unwrap_or(0);
                    if any_exists > 0 {
                        return Err(AppError::Forbidden("无权操作此素材组，仅可操作自己创建的素材组".into()));
                    }
                    // 历史数据无本地记录，自动补录当前用户归属
                    let _ = sqlx::query(&state.db.format_query(
                        "INSERT INTO plugin_asset_groups (user_id, group_id, name, plugin_ns) VALUES (?, ?, '历史数据', ?)"
                    ))
                    .bind(&token.user_id).bind(id).bind(plugin_ns)
                    .execute(&state.db.pool).await;
                }
            }
            _ => {}
        }
    }

    let region = volc_config.region.clone();
    let client = crate::services::volcengine::VolcClient::new(volc_config)
        .with_logger(state.db.clone(), token.user_id.clone())
        .with_source("api_proxy")
        .with_plugin_name(plugin_ns);

    // 6. 转发请求并处理响应
    match client.call_api::<_, serde_json::Value>(
        "ark", &region, &action, &version, body
    ).await {
        Ok(res) => {
            let res_bytes = serde_json::to_vec(&res).unwrap_or_default();

            // 后置处理：Create 写入本地归属记录 / Delete 清理本地记录（异步不阻塞响应）
            match action.as_str() {
                "CreateAsset" => {
                    if let Some(aid) = res.pointer("/Result/Id").and_then(|v| v.as_str()) {
                        let s = state.clone();
                        let uid = token.user_id.clone();
                        let aid = aid.to_string();
                        let at = body_asset_type.unwrap_or_else(|| "image".to_string());
                        let url = body_url.unwrap_or_default();
                        let ns = plugin_ns.to_string();
                        tokio::spawn(async move {
                            let fname = url.rsplit('/').next().unwrap_or("unknown").to_string();
                            let _ = sqlx::query(&s.db.format_query(
                                "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category, plugin_ns) \
                                 VALUES (?, ?, 'api_proxy', 'approved', ?, ?, ?, 'API素材', ?)"
                            ))
                            .bind(&uid).bind(&at).bind(&fname).bind(&url).bind(&aid).bind(&ns)
                            .execute(&s.db.pool).await;
                        });
                    }
                }
                "CreateAssetGroup" => {
                    if let Some(gid) = res.pointer("/Result/Id").and_then(|v| v.as_str()) {
                        let s = state.clone();
                        let uid = token.user_id.clone();
                        let gid = gid.to_string();
                        let name = body_name.unwrap_or_else(|| "未命名".to_string());
                        let desc = body_desc;
                        let ns = plugin_ns.to_string();
                        tokio::spawn(async move {
                            let _ = sqlx::query(&s.db.format_query(
                                "INSERT INTO plugin_asset_groups (user_id, group_id, name, description, plugin_ns) VALUES (?, ?, ?, ?, ?)"
                            ))
                            .bind(&uid).bind(&gid).bind(&name).bind(&desc).bind(&ns)
                            .execute(&s.db.pool).await;
                        });
                    }
                }
                "DeleteAsset" => {
                    if let Some(ref id) = body_id {
                        let s = state.clone();
                        let id = id.clone();
                        let ns = plugin_ns.to_string();
                        tokio::spawn(async move {
                            let _ = sqlx::query(&s.db.format_query(
                                "DELETE FROM plugin_assets WHERE asset_id = ? AND plugin_ns = ? AND source = 'api_proxy'"
                            ))
                            .bind(&id).bind(&ns)
                            .execute(&s.db.pool).await;
                        });
                    }
                }
                "DeleteAssetGroup" => {
                    if let Some(ref id) = body_id {
                        let s = state.clone();
                        let id = id.clone();
                        let ns = plugin_ns.to_string();
                        tokio::spawn(async move {
                            let _ = sqlx::query(&s.db.format_query(
                                "DELETE FROM plugin_asset_groups WHERE group_id = ? AND plugin_ns = ?"
                            ))
                            .bind(&id).bind(&ns)
                            .execute(&s.db.pool).await;
                        });
                    }
                }
                _ => {}
            }

            Ok(Response::builder()
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(res_bytes))
                .unwrap())
        }
        Err(e) => {
            tracing::error!("[Ark Asset Proxy] {} Failed (ns={}): {}", action, plugin_ns, e);
            Err(AppError::UpstreamError(e.to_string()))
        }
    }
    }
    #[cfg(not(feature = "commercial_plugins"))]
    {
        let _ = state; let _ = token; let _ = params; let _ = body;
        Err(AppError::Forbidden("素材资产管理插件未安装".to_string()))
    }
}

// ═══════════════════════════════════════════════════════════════
//  Volcengine: DELETE /api/v3/contents/generations/tasks/{task_id}
//  取消/删除火山方舟视频生成任务（用户级鉴权隔离）
// ═══════════════════════════════════════════════════════════════

/// DELETE /api/v3/contents/generations/tasks/{task_id}
/// 通过 api_key_middleware 鉴权后，校验 task_id 归属当前用户，转发 DELETE 到上游火山方舟。
/// 若任务处于冻结状态（pending），成功取消后自动退还预扣费。
pub async fn volcengine_task_cancel(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
) -> AppResult<Response> {
    // 1. 从 logs 表查找任务记录，同时校验归属当前用户
    let log_row: Option<(i64, i64, Option<String>, String)> = sqlx::query_as(
        &state.db.format_query(
            "SELECT id, channel_id, billing_detail, COALESCE(endpoint, '') \
             FROM logs WHERE task_id = ? AND user_id = ? \
             ORDER BY id DESC LIMIT 1"
        )
    )
    .bind(&task_id)
    .bind(&token.user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (log_id, channel_id, billing_detail, endpoint) = match log_row {
        Some(r) => r,
        None => return Err(AppError::Forbidden("无权操作此任务或任务不存在".to_string())),
    };

    // 2. 校验是否为火山方舟视频任务（endpoint 含火山原生路径标识）
    if !endpoint.contains("contents/generations") {
        return Err(AppError::BadRequest("此任务不支持取消操作，仅火山方舟视频任务可取消".to_string()));
    }

    // 3. 获取渠道信息（含 preset 覆盖）
    let channel = {
        let mut ch: crate::models::Channel = sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE id = ?")
        ).bind(channel_id).fetch_optional(&state.db.pool).await?
            .ok_or_else(|| AppError::BadRequest("任务对应的渠道不存在或已被删除".to_string()))?;
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
                &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
            ).bind(pid).fetch_optional(&state.db.pool).await {
                ch.base_url = preset.base_url;
                ch.api_key = preset.api_key;
            }
        }
        ch
    };

    // 4. 构建上游 DELETE 请求
    let url = join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id));
    tracing::info!("[Volcengine Cancel] user={}, task_id={}, url={}", token.user_id, task_id, url);

    let resp = state.http_client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        tracing::warn!("[Volcengine Cancel] 上游返回错误 status={}, body={}", status, err_body);
        // 提取上游错误信息供用户查看
        let detail = serde_json::from_str::<serde_json::Value>(&err_body)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message").or(v.get("message"))
                    .and_then(|m| m.as_str()).map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("上游返回错误状态码: {}", status));
        return Err(AppError::UpstreamError(detail));
    }

    // 5. 取消成功后处理本地日志和退费
    let is_frozen = billing_detail.as_deref().map_or(false, |d| d.contains("冻结"));
    if is_frozen {
        // 任务仍在冻结（pending）状态，执行预扣费退还
        let log_data: Option<(f64, f64, Option<i64>, Option<i64>)> = sqlx::query_as(
            &state.db.format_query("SELECT cost, pre_deduct_gift, token_id, channel_id FROM logs WHERE id = ?")
        ).bind(log_id).fetch_optional(&state.db.pool).await.unwrap_or(None);

        let (pre_deduction, pre_deduct_gift, token_id_opt, channel_id_opt) = log_data.unwrap_or((0.0, 0.0, None, None));
        super::task::execute_refund_tx(
            &state, log_id, &token.user_id, token_id_opt, channel_id_opt,
            pre_deduction, pre_deduct_gift,
            "用户主动取消任务，预扣费已退回",
            499,
        ).await;
        tracing::info!("[Volcengine Cancel] 预扣费已退还 log_id={}, refunded={:.6}", log_id, pre_deduction);
    } else {
        // 任务已结算（succeeded/failed），仅更新日志标记
        let _ = sqlx::query(&state.db.format_query(
            "UPDATE logs SET error_message = '用户已删除此任务记录' WHERE id = ?"
        )).bind(log_id).execute(&state.db.pool).await;
    }

    Ok(Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(
            serde_json::json!({"message": "任务已取消"}).to_string()
        ))
        .unwrap())
}

// ═══════════════════════════════════════════════════════════════
//  Volcengine: GET /api/v3/contents/generations/tasks
//  查询火山方舟视频任务列表（用户级鉴权隔离）
// ═══════════════════════════════════════════════════════════════

/// GET /api/v3/contents/generations/tasks
/// 先从 logs 表查出当前用户近 7 天的火山方舟视频 task_id，
/// 作为 filter.task_ids 附加到上游请求中，确保严格的用户隔离。
pub async fn volcengine_task_list(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    // 1. 从 logs 表查出当前用户近 7 天的火山方舟视频 task_id
    // 使用 action_type = '视频' + upstream_url 含火山原生路径，严格限定火山方舟任务
    // 避免混入腾讯云等其他厂商的 task_id（它们的接口协议不同）
    let task_ids: Vec<String> = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT DISTINCT task_id FROM logs \
             WHERE user_id = ? AND task_id IS NOT NULL AND task_id != '' \
             AND action_type = '视频' AND upstream_url LIKE '%contents/generations%' \
             AND created_at::timestamptz > CURRENT_TIMESTAMP - INTERVAL '7 days' \
             ORDER BY task_id DESC LIMIT 500"
        )
    )
    .bind(&token.user_id)
    .fetch_all(&state.db.pool)
    .await?;

    if task_ids.is_empty() {
        // 无任务记录，直接返回空列表
        return Ok(Response::builder()
            .header("Content-Type", "application/json")
            .body(axum::body::Body::from(
                serde_json::json!({
                    "items": [],
                    "total": 0,
                    "page_num": 1,
                    "page_size": 20
                }).to_string()
            ))
            .unwrap());
    }

    // 2. 查找一个可用的火山方舟视频渠道（从最近的日志记录中获取）
    let channel_id: Option<i64> = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT channel_id FROM logs \
             WHERE user_id = ? AND task_id IS NOT NULL AND task_id != '' \
             AND action_type = '视频' AND upstream_url LIKE '%contents/generations%' \
             AND created_at::timestamptz > CURRENT_TIMESTAMP - INTERVAL '7 days' \
             ORDER BY id DESC LIMIT 1"
        )
    )
    .bind(&token.user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let cid = channel_id.ok_or_else(|| AppError::BadRequest("未找到可用的火山方舟视频渠道".to_string()))?;
    let channel = {
        let mut ch: crate::models::Channel = sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE id = ?")
        ).bind(cid).fetch_optional(&state.db.pool).await?
            .ok_or_else(|| AppError::BadRequest("渠道不存在或已被删除".to_string()))?;
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(
                &state.db.format_query("SELECT * FROM channel_configs WHERE id = ?")
            ).bind(pid).fetch_optional(&state.db.pool).await {
                ch.base_url = preset.base_url;
                ch.api_key = preset.api_key;
            }
        }
        ch
    };

    // 3. 构建上游请求 URL（附加用户的 task_ids 作为过滤条件）
    let mut query_parts: Vec<String> = Vec::new();

    // 用户传入的查询参数透传（排除 task_ids，由系统控制；参数值 URL 编码防注入）
    for (k, v) in &params {
        if k != "filter.task_ids" {
            query_parts.push(format!("{}={}", k, urlencoding::encode(v)));
        }
    }

    // 注入当前用户的 task_ids（确保只能查到自己的任务）
    for tid in &task_ids {
        query_parts.push(format!("filter.task_ids={}", tid));
    }

    let qs = query_parts.join("&");
    let url = format!("{}?{}", join_url(&channel.base_url, "/api/v3/contents/generations/tasks"), qs);
    tracing::info!("[Volcengine TaskList] user={}, task_count={}, url_len={}", token.user_id, task_ids.len(), url.len());

    // 4. 转发到上游
    let resp = state.http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(AppError::UpstreamError(format!("上游返回错误状态码: {} - {}", status, err_body)));
    }

    let body = resp.bytes().await.unwrap_or_default();
    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body))
        .unwrap())
}
