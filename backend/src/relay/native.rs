//! Relay: Native protocol passthrough for Google Gemini & Volcengine.
//! Provides direct-path endpoints that mirror the vendor's own API surface,
//! while still running through the gateway's auth / billing / logging pipeline.

use super::proxy;
use super::url_utils::join_url;
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use std::collections::HashMap;
#[cfg(feature = "commercial_plugins")]
use std::collections::HashSet;
use std::sync::Arc;

// ═══════════════════════════════════════════════════════════════
//  Google Gemini Native:
//    POST /v1beta/models/{model}:generateContent
//    POST /v1beta/models/{model}:streamGenerateContent
//  路径聊天/生图共用；入口类别由模型名 / body 推断（默认聊天）。
// ═══════════════════════════════════════════════════════════════

/// Gemini 原生入口类别：body 含 IMAGE/imageConfig，或模型名含 image → 图片；否则聊天。
fn gemini_native_entry_category(model: &str, body: Option<&serde_json::Value>) -> &'static str {
    if let Some(v) = body {
        let has_image_modality = v
            .pointer("/generationConfig/responseModalities")
            .and_then(|m| m.as_array())
            .is_some_and(|mods| {
                mods.iter()
                    .any(|m| m.as_str().is_some_and(|s| s.eq_ignore_ascii_case("IMAGE")))
            });
        if has_image_modality || v.pointer("/generationConfig/imageConfig").is_some() {
            return "图片";
        }
    }
    if model.to_ascii_lowercase().contains("image") {
        return "图片";
    }
    "聊天"
}

pub async fn gemini_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(model_action): Path<String>,
    Query(query_params): Query<HashMap<String, String>>,
    body: axum::body::Bytes,
) -> AppResult<Response> {
    let request_content_str = String::from_utf8_lossy(&body).to_string();
    // 单次解析，类别推断 / stream 判定 / 计费特征共用
    let body_json = serde_json::from_str::<serde_json::Value>(&request_content_str).ok();
    // model_action = "gemini-2.0-flash:generateContent"
    let (model, action) = model_action
        .split_once(':')
        .ok_or_else(|| AppError::BadRequest("Invalid path: expected {model}:{action}".into()))?;

    // access 前用入口推断；access 后日志/计费用 resolved_cat
    let entry_cat = gemini_native_entry_category(model, body_json.as_ref());
    let entry_ep = format!("/v1beta/models/{}:{}", model, action);

    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, model, &entry_ep, Some(entry_cat)).await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        let start_time = std::time::Instant::now();
        // 2. 渠道选择
        let channel = match proxy::select_channel_for_model(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            &entry_ep,
            &ha.exclude_aids,
            !ha.had_upstream,
            Some(entry_cat),
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                ha.on_select_err(e);
                break;
            }
        };

        // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
        let (pre_deduction, db_model, resolved_cat) =
            match proxy::check_access(&state, &token, model, &ctx, Some(entry_cat), Some(&channel))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break;
                }
            };

        // 模型表别名映射：渠道无映射时回落到 db_model.model_id_alias
        let (resolved_model, mapping_source) =
            super::router::resolve_model(&channel, model, db_model.as_ref());

        // Build upstream query: replace key with channel's real key, keep other params (e.g. alt=sse)
        let mut qs = format!("key={}", channel.api_key);
        for (k, v) in &query_params {
            if k != "key" {
                qs.push_str(&format!("&{}={}", k, v));
            }
        }
        let url = format!(
            "{}?{}",
            join_url(
                &channel.base_url,
                &format!("/v1beta/models/{}:{}", resolved_model, action)
            ),
            qs
        );
        tracing::info!(
            "[Native] model={}, url={}",
            model,
            super::forward::mask_key_in_string(&url, &channel.api_key)
        );

        // endpoint 格式: 系统入口路径|上游实际路径（映射后模型名），与 image/chat 端点保持一致
        let endpoint = format!(
            "/v1beta/models/{}:{}|/v1beta/models/{}:{}",
            model, action, resolved_model, action
        );
        let mut is_stream = if action.starts_with("streamGenerateContent") {
            1
        } else {
            0
        };
        if body_json
            .as_ref()
            .and_then(|j| j.get("stream"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            is_stream = 1;
        }

        // 【一条日志原则】请求前预记录日志（HA 重试复用同一条）
        if ha.pending_log_id.is_none() {
            ha.pending_log_id = proxy::record_pending_log(proxy::PendingLog {
                state: &state,
                user_id: &token.user_id,
                token_id: token.id,
                model: model,
                endpoint: &endpoint,
                is_stream: is_stream,
                request_content: Some(&request_content_str),
                upstream_url: Some(&url),
                channel: &channel,
                billing_model_hint: None,
                plugin_tag: None,
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: None,
                requested_log_id: None,
            })
            .await;
        }

        let resp = match state
            .http_client
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
                proxy::record_and_bill_inner(proxy::BillRecord {
                    state: &state,
                    token: &token,
                    channel: &channel,
                    model: model,
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    cached_tokens: 0,
                    cost: 0.0,
                    pre_deducted: 0.0,
                    pre_deduct_gift: 0.0,
                    status_code: 502,
                    endpoint: &endpoint,
                    error_msg: Some(&err_msg),
                    latency_ms: latency_ms,
                    is_stream: is_stream,
                    request_content: Some(request_content_str.clone()),
                    response_content: None,
                    upstream_req_content: Some(request_content_str.clone()),
                    billing_detail: None,
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: ha.pending_log_id,
                    billing_model_hint: None,
                    plugin_tag: None,
                    db_model: db_model.as_ref(),
                })
                .await;
                if ha
                    .on_spawn_result_err(
                        &state,
                        &channel,
                        proxy::upstream_fail(502, &err_msg),
                        Some(&url),
                    )
                    .await
                {
                    ha.bump();
                    continue;
                }
                break;
            }
        };

        let status = resp.status().as_u16();

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            let display_err = proxy::upstream_error_text(status, &err);
            let latency_ms = start_time.elapsed().as_millis() as u32;
            proxy::record_and_bill_inner(proxy::BillRecord {
                state: &state,
                token: &token,
                channel: &channel,
                model: model,
                prompt_tokens: 0,
                completion_tokens: 0,
                cached_tokens: 0,
                cost: 0.0,
                pre_deducted: 0.0,
                pre_deduct_gift: 0.0,
                status_code: status,
                endpoint: &endpoint,
                error_msg: Some(&display_err),
                latency_ms: latency_ms,
                is_stream: is_stream,
                request_content: Some(request_content_str.clone()),
                response_content: None,
                upstream_req_content: Some(request_content_str.clone()),
                billing_detail: None,
                hint_category: Some(resolved_cat.as_str()),
                pending_log_id: ha.pending_log_id,
                billing_model_hint: None,
                plugin_tag: None,
                db_model: db_model.as_ref(),
            })
            .await;
            if ha
                .on_spawn_result_err(
                    &state,
                    &channel,
                    proxy::upstream_fail(status, &display_err),
                    Some(&url),
                )
                .await
            {
                ha.bump();
                continue;
            }
            break;
        }

        // 预扣费（管理员跳过）
        let pre_deduct_gift = match proxy::pre_deduct_or_intercept(
            &state,
            &token,
            &channel,
            model,
            pre_deduction,
            &endpoint,
            start_time,
            is_stream,
            &request_content_str,
            &request_content_str,
            None,
            ha.pending_log_id,
            db_model.as_ref(),
            &ctx.role,
            Some(resolved_cat.as_str()),
        )
        .await
        {
            Ok(g) => g,
            Err(e) => {
                ha.on_access_err(e);
                break;
            }
        };

        // 查询计费规则（复用 db_model，流式/非流式共用）
        let mut db_rule =
            proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

        if action.starts_with("streamGenerateContent") || is_stream == 1 {
            return Ok(crate::relay::stream::handle_native_stream(
                state.clone(),
                token.clone(),
                channel.clone(),
                model.to_string(),
                resp,
                ctx.discount,
                ctx.model_discounts.clone(),
                request_content_str.clone(),
                start_time,
                endpoint.clone(),
                Some(request_content_str.clone()),
                pre_deduction,
                pre_deduct_gift,
                endpoint.clone(),
                None,
                ha.pending_log_id,
                db_model.clone(),
                db_rule,
                resolved_cat.clone(),
            )
            .await
            .into_response());
        } else {
            let data = resp.bytes().await?;
            let response_content_str = String::from_utf8_lossy(&data).to_string();

            // 提取 token 用量（Gemini usageMetadata / OpenAI usage）
            let usage = crate::relay::usage_extractor::parse_usage(&response_content_str);

            let empty = serde_json::json!({});
            let mut features = crate::relay::usage_extractor::extract_request_features(
                body_json.as_ref().unwrap_or(&empty),
            );
            // 用响应中的实际图片数量覆盖（Gemini 生图场景）
            if let Some(resp_count) =
                crate::relay::usage_extractor::count_response_images(&response_content_str)
            {
                features.image_count = Some(resp_count);
            }
            features.cache_creation = if usage.cache_creation > 0 {
                Some(usage.cache_creation)
            } else {
                None
            };
            let (cost, detail) = crate::relay::calculate_relay_cost(
                &state,
                db_model.as_ref(),
                db_rule.as_mut(),
                &channel,
                ctx.discount,
                &ctx.model_discounts,
                &usage,
                &features,
                mapping_source.as_deref(),
                &model,
                &resolved_model,
            )
            .await;
            tracing::info!(
                "[Gemini] model={}, prompt={}, completion={}, cost={:.6}",
                model,
                usage.prompt,
                usage.completion,
                cost
            );

            let latency_ms = start_time.elapsed().as_millis() as u32;
            // 【连接保护】计费放入独立 task（resolved_cat 随闭包移入，无额外 clone）
            let rsc = response_content_str.clone();
            let (s, t, ch, m, ep2, rc) = (
                state.clone(),
                token.clone(),
                channel.clone(),
                model.to_string(),
                endpoint.clone(),
                request_content_str.clone(),
            );
            let pending_log_id = ha.pending_log_id;
            tokio::spawn(async move {
                proxy::record_and_bill_inner(proxy::BillRecord {
                    state: &s,
                    token: &t,
                    channel: &ch,
                    model: &m,
                    prompt_tokens: usage.prompt,
                    completion_tokens: usage.completion,
                    cached_tokens: usage.cached,
                    cost: cost,
                    pre_deducted: pre_deduction,
                    pre_deduct_gift: pre_deduct_gift,
                    status_code: 200,
                    endpoint: &ep2,
                    error_msg: None,
                    latency_ms: latency_ms,
                    is_stream: is_stream,
                    request_content: Some(rc.clone()),
                    response_content: Some(rsc),
                    upstream_req_content: Some(rc),
                    billing_detail: Some(detail),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: pending_log_id,
                    billing_model_hint: None,
                    plugin_tag: None,
                    db_model: db_model.as_ref(),
                })
                .await;
            });
            return Ok(Response::builder()
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(data))
                .unwrap());
        }
    } // end while

    Err(ha.finish())
}

// 素材代理 API 白名单（单资源读写删做归属校验；列表按本地归属过滤，确保数据隔离）
const ARK_ASSET_ACTIONS: &[&str] = &[
    "CreateAsset",
    "GetAsset",
    "UpdateAsset",
    "ListAssets",
    "CreateAssetGroup",
    "GetAssetGroup",
    "UpdateAssetGroup",
    "ListAssetGroups",
    "DeleteAsset",
    "DeleteAssetGroup",
];

#[cfg(feature = "commercial_plugins")]
/// 加载当前用户在本插件命名空间下拥有的 Ark 资源 ID 集合
async fn load_owned_ark_ids(
    state: &AppState,
    table: &str,
    id_col: &str,
    user_id: &str,
    plugin_ns: &str,
) -> HashSet<String> {
    // table/id_col 仅来自内部常量，禁止外部输入
    let sql = state.db.format_query(&format!(
        "SELECT {id_col} FROM {table} WHERE user_id = ? AND plugin_ns = ? \
         AND {id_col} IS NOT NULL AND {id_col} != ''"
    ));
    let rows: Vec<(String,)> = sqlx::query_as(&sql)
        .bind(user_id)
        .bind(plugin_ns)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();
    rows.into_iter().map(|(id,)| id).collect()
}

#[cfg(feature = "commercial_plugins")]
/// 将 List 请求的 Filter.GroupIds 收窄为当前用户拥有的组（与已有 GroupIds 取交集）
fn narrow_list_filter_group_ids(body: &mut serde_json::Value, owned_groups: &HashSet<String>) {
    if owned_groups.is_empty() {
        return;
    }
    let Some(obj) = body.as_object_mut() else {
        return;
    };
    let filter = obj
        .entry("Filter".to_string())
        .or_insert_with(|| serde_json::json!({}));
    let Some(fobj) = filter.as_object_mut() else {
        return;
    };

    let narrowed: Vec<serde_json::Value> =
        if let Some(existing) = fobj.get("GroupIds").and_then(|v| v.as_array()) {
            existing
                .iter()
                .filter_map(|v| v.as_str())
                .filter(|id| owned_groups.contains(*id))
                .map(|s| serde_json::json!(s))
                .collect()
        } else {
            owned_groups.iter().map(|s| serde_json::json!(s)).collect()
        };
    fobj.insert("GroupIds".to_string(), serde_json::Value::Array(narrowed));
}

#[cfg(feature = "commercial_plugins")]
/// 过滤 Ark List 响应：仅保留 Id 属于 owned 的条目，并校正 TotalCount
fn filter_ark_list_result(res: &mut serde_json::Value, owned: &HashSet<String>, owned_total: i64) {
    let Some(result) = res.get_mut("Result") else {
        return;
    };
    for key in ["Items", "Assets", "AssetGroups"] {
        if let Some(arr) = result.get_mut(key).and_then(|v| v.as_array_mut()) {
            arr.retain(|item| {
                item.get("Id")
                    .and_then(|v| v.as_str())
                    .is_some_and(|id| owned.contains(id))
            });
            if let Some(obj) = result.as_object_mut() {
                obj.insert("TotalCount".to_string(), serde_json::json!(owned_total));
            }
            return;
        }
    }
}

#[cfg(feature = "commercial_plugins")]
/// 构造空的 List 成功响应（用户无本地归属时短路，避免泄露全量）
fn empty_ark_list_response(action: &str, version: &str, region: &str) -> Response {
    let body = serde_json::json!({
        "ResponseMetadata": {
            "Action": action,
            "Version": version,
            "Service": "ark",
            "Region": region,
        },
        "Result": {
            "Items": [],
            "TotalCount": 0,
        }
    });
    Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap()
}

#[cfg(feature = "commercial_plugins")]
/// 校验资源归属；无任何本地记录时补录当前用户（兼容历史 API 数据）
async fn ensure_ark_owned_or_claim(
    state: &AppState,
    kind: &str, // "asset" | "group"
    id: &str,
    user_id: &str,
    plugin_ns: &str,
) -> AppResult<()> {
    let (owned_sql, any_sql, claim_sql, forbidden_msg) = match kind {
        "asset" => (
            "SELECT COUNT(*) FROM plugin_assets WHERE asset_id = ? AND user_id = ? AND plugin_ns = ?",
            "SELECT COUNT(*) FROM plugin_assets WHERE asset_id = ? AND plugin_ns = ?",
            "INSERT INTO plugin_assets (user_id, asset_type, source, status, file_name, file_url, asset_id, category, plugin_ns) \
             VALUES (?, 'unknown', 'api_proxy', 'approved', 'unknown', '', ?, 'API素材', ?)",
            "无权操作此素材，仅可操作自己创建的素材",
        ),
        _ => (
            "SELECT COUNT(*) FROM plugin_asset_groups WHERE group_id = ? AND user_id = ? AND plugin_ns = ?",
            "SELECT COUNT(*) FROM plugin_asset_groups WHERE group_id = ? AND plugin_ns = ?",
            "INSERT INTO plugin_asset_groups (user_id, group_id, name, plugin_ns) VALUES (?, ?, '历史数据', ?)",
            "无权操作此素材组，仅可操作自己创建的素材组",
        ),
    };

    let owned: i64 = sqlx::query_scalar(&state.db.format_query(owned_sql))
        .bind(id)
        .bind(user_id)
        .bind(plugin_ns)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);
    if owned > 0 {
        return Ok(());
    }

    let any_exists: i64 = sqlx::query_scalar(&state.db.format_query(any_sql))
        .bind(id)
        .bind(plugin_ns)
        .fetch_one(&state.db.pool)
        .await
        .unwrap_or(0);
    if any_exists > 0 {
        return Err(AppError::Forbidden(forbidden_msg.into()));
    }

    let _ = sqlx::query(&state.db.format_query(claim_sql))
        .bind(user_id)
        .bind(id)
        .bind(plugin_ns)
        .execute(&state.db.pool)
        .await;
    Ok(())
}

pub async fn ark_asset_proxy(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Query(params): Query<HashMap<String, String>>,
    Json(mut body): Json<serde_json::Value>,
) -> AppResult<Response> {
    #[cfg(feature = "commercial_plugins")]
    {
        // 1. 获取 Action (兼容 Action/action 和 Version/version)
        let action = params
            .get("Action")
            .or_else(|| params.get("action"))
            .cloned()
            .unwrap_or_default();
        let version = params
            .get("Version")
            .or_else(|| params.get("version"))
            .cloned()
            .unwrap_or_else(|| "2024-01-01".to_string());

        // 通过 ns 参数指定插件命名空间，默认 asset_manager（国内版）
        let plugin_ns = params
            .get("ns")
            .map(|s| s.as_str())
            .filter(|s| *s == "asset_manager" || *s == "asset_manager_intl")
            .unwrap_or("asset_manager");

        // 2. 白名单检查
        if !ARK_ASSET_ACTIONS.contains(&action.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Unsupported Ark Asset Action: {}",
                action
            )));
        }

        // 3. 用户及插件等级权限检查
        let user: crate::models::User = sqlx::query_as(&state.db.format_query("SELECT u.*, ul.name as level_name, ul.id as level_id FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"))
        .bind(&token.user_id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::Unauthorized)?;

        if user.role != "admin" {
            // 检查目标插件是否开启并授权当前用户等级
            let plugin_info: Option<(i64, String)> = sqlx::query_as(&state.db.format_query(
                "SELECT is_enabled, allowed_levels FROM plugins WHERE name = ? AND is_enabled = 1",
            ))
            .bind(plugin_ns)
            .fetch_optional(&state.db.pool)
            .await?;

            if plugin_info.is_none() {
                return Err(AppError::Forbidden(format!(
                    "素材资产管理插件({})未安装或未启用",
                    plugin_ns
                )));
            }

            if let Some((_, ref allowed_levels)) = plugin_info {
                if allowed_levels != "all" {
                    let allowed: Vec<&str> = allowed_levels.split(',').collect();
                    let level_id_str = user.level_id.unwrap_or(0).to_string();
                    if !allowed.contains(&user.user_group.as_str())
                        && !allowed.contains(&level_id_str.as_str())
                    {
                        return Err(AppError::Forbidden(
                            "您当前的用户等级无权使用素材资产管理功能".to_string(),
                        ));
                    }
                }
            }

            // 进一步检查 API 接口开放状态（按等级 / 按用户）
            let configs = crate::api::plugins::load_plugin_configs_pub(&state, plugin_ns)
                .await
                .unwrap_or_default();
            if !crate::api::plugins::is_asset_api_enabled(
                &configs,
                &user.id,
                &user.user_group,
                user.level_id,
            ) {
                return Err(AppError::Forbidden(
                    "您当前无权使用素材 API 接口调用".to_string(),
                ));
            }
        }

        // 4. 获取火山引擎配置（根据 plugin_ns 加载对应的凭证）
        let volc_config = crate::api::plugins::get_volc_config(&state, plugin_ns)
            .await
            .ok_or_else(|| {
                AppError::BadRequest(format!("系统未配置火山引擎素材管理凭证({})", plugin_ns))
            })?;

        // 强制设置 ProjectName 为系统配置项，覆盖用户可能传的值，确保资产数据在系统统一管理下
        if let Some(obj) = body.as_object_mut() {
            if !volc_config.project_name.is_empty() {
                obj.insert(
                    "ProjectName".to_string(),
                    serde_json::Value::String(volc_config.project_name.clone()),
                );
            } else {
                obj.insert(
                    "ProjectName".to_string(),
                    serde_json::Value::String("default".to_string()),
                );
            }
        }

        // 预提取请求体关键字段（body 将在转发时被消费，需提前保存）
        let body_id = body
            .get("Id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let body_group_id = body
            .get("GroupId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let body_asset_type = body
            .get("AssetType")
            .and_then(|v| v.as_str())
            .map(|s| s.to_lowercase());
        let body_url = body
            .get("URL")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let body_name = body
            .get("Name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let body_desc = body
            .get("Description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // 5. 用户归属校验 + List 预过滤准备（admin 跳过隔离）
        let mut list_owned_ids: Option<HashSet<String>> = None;
        let mut list_owned_total: i64 = 0;
        if user.role != "admin" {
            match action.as_str() {
                "GetAsset" | "UpdateAsset" | "DeleteAsset" => {
                    let id = body_id
                        .as_deref()
                        .ok_or_else(|| AppError::BadRequest("缺少必需参数 Id".into()))?;
                    ensure_ark_owned_or_claim(&state, "asset", id, &token.user_id, plugin_ns)
                        .await?;
                }
                "GetAssetGroup" | "UpdateAssetGroup" | "DeleteAssetGroup" => {
                    let id = body_id
                        .as_deref()
                        .ok_or_else(|| AppError::BadRequest("缺少必需参数 Id".into()))?;
                    ensure_ark_owned_or_claim(&state, "group", id, &token.user_id, plugin_ns)
                        .await?;
                }
                "CreateAsset" => {
                    // 只能写入自己拥有的素材组
                    let gid = body_group_id
                        .as_deref()
                        .ok_or_else(|| AppError::BadRequest("缺少必需参数 GroupId".into()))?;
                    ensure_ark_owned_or_claim(&state, "group", gid, &token.user_id, plugin_ns)
                        .await?;
                }
                "ListAssets" => {
                    let owned_assets = load_owned_ark_ids(
                        &state,
                        "plugin_assets",
                        "asset_id",
                        &token.user_id,
                        plugin_ns,
                    )
                    .await;
                    if owned_assets.is_empty() {
                        return Ok(empty_ark_list_response(
                            &action,
                            &version,
                            &volc_config.region,
                        ));
                    }
                    let owned_groups = load_owned_ark_ids(
                        &state,
                        "plugin_asset_groups",
                        "group_id",
                        &token.user_id,
                        plugin_ns,
                    )
                    .await;
                    narrow_list_filter_group_ids(&mut body, &owned_groups);
                    list_owned_total = owned_assets.len() as i64;
                    list_owned_ids = Some(owned_assets);
                }
                "ListAssetGroups" => {
                    let owned_groups = load_owned_ark_ids(
                        &state,
                        "plugin_asset_groups",
                        "group_id",
                        &token.user_id,
                        plugin_ns,
                    )
                    .await;
                    if owned_groups.is_empty() {
                        return Ok(empty_ark_list_response(
                            &action,
                            &version,
                            &volc_config.region,
                        ));
                    }
                    list_owned_total = owned_groups.len() as i64;
                    list_owned_ids = Some(owned_groups);
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
        match client
            .call_api::<_, serde_json::Value>("ark", &region, &action, &version, body)
            .await
        {
            Ok(mut res) => {
                // List：按本地归属过滤，防止共享 ProjectName 下泄露他人素材
                if let Some(ref owned) = list_owned_ids {
                    filter_ark_list_result(&mut res, owned, list_owned_total);
                }

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
                            let uid = token.user_id.clone();
                            let ns = plugin_ns.to_string();
                            tokio::spawn(async move {
                                let _ = sqlx::query(&s.db.format_query(
                                "DELETE FROM plugin_assets WHERE asset_id = ? AND user_id = ? AND plugin_ns = ? AND source = 'api_proxy'"
                            ))
                            .bind(&id).bind(&uid).bind(&ns)
                            .execute(&s.db.pool).await;
                            });
                        }
                    }
                    "DeleteAssetGroup" => {
                        if let Some(ref id) = body_id {
                            let s = state.clone();
                            let id = id.clone();
                            let uid = token.user_id.clone();
                            let ns = plugin_ns.to_string();
                            tokio::spawn(async move {
                                let _ = sqlx::query(&s.db.format_query(
                                "DELETE FROM plugin_asset_groups WHERE group_id = ? AND user_id = ? AND plugin_ns = ?"
                            ))
                            .bind(&id).bind(&uid).bind(&ns)
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
                tracing::error!(
                    "[Ark Asset Proxy] {} Failed (ns={}): {}",
                    action,
                    plugin_ns,
                    e
                );
                Err(AppError::UpstreamError(e.to_string()))
            }
        }
    }
    #[cfg(not(feature = "commercial_plugins"))]
    {
        let _ = state;
        let _ = token;
        let _ = params;
        let _ = body;
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
    // 1. 从 logs 表查找任务记录，同时校验归属当前用户（含 channel_config_id 供 HA 子配还原）
    let log_row: Option<(i64, i64, Option<String>, String, Option<i32>)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT id, channel_id, billing_detail, COALESCE(endpoint, ''), channel_config_id \
             FROM logs WHERE task_id = ? AND user_id = ? \
             ORDER BY id DESC LIMIT 1",
        ))
        .bind(&task_id)
        .bind(&token.user_id)
        .fetch_optional(&state.db.pool)
        .await?;

    let (log_id, channel_id, billing_detail, endpoint, log_cfg_id) = match log_row {
        Some(r) => r,
        None => {
            return Err(AppError::Forbidden(
                "无权操作此任务或任务不存在".to_string(),
            ))
        }
    };

    // 2. 校验是否为火山方舟视频任务（endpoint 含火山原生路径标识）
    if !endpoint.contains("contents/generations") {
        return Err(AppError::BadRequest(
            "此任务不支持取消操作，仅火山方舟视频任务可取消".to_string(),
        ));
    }

    // 3. 与选渠/轮询同源水合（channel_config_id 还原 HA 子配）
    let channel = super::router::fetch_channel(&state, channel_id, log_cfg_id)
        .await
        .ok_or_else(|| AppError::BadRequest("任务对应的渠道不存在或已被删除".to_string()))?;

    // 4. 构建上游 DELETE 请求
    let url = join_url(
        &channel.base_url,
        &format!("/api/v3/contents/generations/tasks/{}", task_id),
    );
    tracing::info!(
        "[Volcengine Cancel] user={}, task_id={}, url={}",
        token.user_id,
        task_id,
        url
    );

    let resp = state
        .http_client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        tracing::warn!(
            "[Volcengine Cancel] 上游返回错误 status={}, body={}",
            status,
            err_body
        );
        // 提取上游错误信息供用户查看
        let detail = serde_json::from_str::<serde_json::Value>(&err_body)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .or(v.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| format!("上游返回错误状态码: {}", status));
        return Err(AppError::UpstreamError(detail));
    }

    // 5. 取消成功后处理本地日志和退费
    let is_frozen = billing_detail
        .as_deref()
        .map_or(false, |d| d.contains("冻结"));
    if is_frozen {
        // 任务仍在冻结（pending）状态，执行预扣费退还
        let log_data: Option<(f64, f64, Option<i64>, Option<i64>)> =
            sqlx::query_as(&state.db.format_query(
                "SELECT cost, pre_deduct_gift, token_id, channel_id FROM logs WHERE id = ?",
            ))
            .bind(log_id)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None);

        let (pre_deduction, pre_deduct_gift, token_id_opt, channel_id_opt) =
            log_data.unwrap_or((0.0, 0.0, None, None));
        super::task::execute_refund_tx(
            &state,
            log_id,
            &token.user_id,
            token_id_opt,
            channel_id_opt,
            pre_deduction,
            pre_deduct_gift,
            "用户主动取消任务，预扣费已退回",
            499,
        )
        .await;
        tracing::info!(
            "[Volcengine Cancel] 预扣费已退还 log_id={}, refunded={:.6}",
            log_id,
            pre_deduction
        );
    } else {
        // 任务已结算（succeeded/failed），仅更新日志标记
        let _ =
            sqlx::query(&state.db.format_query(
                "UPDATE logs SET error_message = '用户已删除此任务记录' WHERE id = ?",
            ))
            .bind(log_id)
            .execute(&state.db.pool)
            .await;
    }

    Ok(Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(
            serde_json::json!({"message": "任务已取消"}).to_string(),
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
    let task_ids: Vec<String> = sqlx::query_scalar(&state.db.format_query(
        "SELECT DISTINCT task_id FROM logs \
             WHERE user_id = ? AND task_id IS NOT NULL AND task_id != '' \
             AND action_type = '视频' AND upstream_url LIKE '%contents/generations%' \
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days' \
             ORDER BY task_id DESC LIMIT 500",
    ))
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
                })
                .to_string(),
            ))
            .unwrap());
    }

    // 2. 最近一条火山视频日志：channel_id + channel_config_id 还原 HA 子配
    let ch_row: Option<(i64, Option<i32>)> = sqlx::query_as(&state.db.format_query(
        "SELECT channel_id, channel_config_id FROM logs \
             WHERE user_id = ? AND task_id IS NOT NULL AND task_id != '' \
             AND action_type = '视频' AND upstream_url LIKE '%contents/generations%' \
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days' \
             ORDER BY id DESC LIMIT 1",
    ))
    .bind(&token.user_id)
    .fetch_optional(&state.db.pool)
    .await?;

    let (cid, log_cfg_id) =
        ch_row.ok_or_else(|| AppError::BadRequest("未找到可用的火山方舟视频渠道".to_string()))?;
    let channel = super::router::fetch_channel(&state, cid, log_cfg_id)
        .await
        .ok_or_else(|| AppError::BadRequest("渠道不存在或已被删除".to_string()))?;

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
    let url = format!(
        "{}?{}",
        join_url(&channel.base_url, "/api/v3/contents/generations/tasks"),
        qs
    );
    tracing::info!(
        "[Volcengine TaskList] user={}, task_count={}, url_len={}",
        token.user_id,
        task_ids.len(),
        url.len()
    );

    // 4. 转发到上游
    let resp = state
        .http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::UpstreamError(format!("请求上游失败: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(AppError::UpstreamError(format!(
            "上游返回错误状态码: {} - {}",
            status, err_body
        )));
    }

    let body = resp.bytes().await.unwrap_or_default();
    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body))
        .unwrap())
}
