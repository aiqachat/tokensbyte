/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay: POST /v1/video/generations
//! OpenAI-compatible video generation task endpoint with forward-rule-driven protocol adaptation.

use super::cascade::{
    cascade_check_resolution, cascade_clamp_base_resolution, cascade_enhance_from_model,
};
use super::{forward, proxy, router};
use crate::models::ApiToken;
use crate::{
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, OriginalUri, State},
    response::Response,
    Json,
};
use std::sync::Arc;

/// 快乐小马插件 stub（feature 关闭时使用，确保条件编译分支仍能通过类型检查）
#[cfg(not(feature = "plugin_happyhorse"))]
#[derive(Debug, Clone)]
struct HappyHorseStub {
    pub actual_model: String,
    pub media_type: String,
    pub routing_node: String,
    pub custom_model_id: String,
}

/// POST /v1/video/generations — Submit a video generation task

pub async fn video_generations(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    headers: axum::http::HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let mut body = body;
    let start_time = std::time::Instant::now();
    let raw_path = uri.path();
    // 归一化
    // - /v1/videos/text2video|image2video|multi-image2video|omni-video → /v1/video/generations
    let entry_path = if raw_path.starts_with("/v1/videos/") {
        // 可灵原生视频路径归一化（匹配转发规则的 path_rewrite.old）
        "/v1/video/generations".to_string()
    } else {
        raw_path.to_string()
    };
    let mut request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let x_log_id = headers
        .get("x-log-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let mut model_opt = body["model"]
        .as_str()
        .or_else(|| body["model_name"].as_str())
        .map(|s| s.to_string());
    let mut category = "视频";
    let mut db_model_from_mid = None;

    // 当直接访问媒体增强工具接口时，自动从路径 and 参数中推导并反查对应的激活模型 ID
    if model_opt.is_none() {
        let mid = if raw_path.contains("/tools/enhance-video-fast") {
            Some("vve-ft")
        } else if raw_path.contains("/tools/enhance-video-generative") {
            Some("vve-gt")
        } else if raw_path.contains("/tools/erase-video-subtitle-pro") {
            Some("vvs-ep")
        } else if raw_path.contains("/tools/erase-video-subtitle") {
            Some("vvs-er")
        } else if raw_path.contains("/tools/enhance-video") {
            if body["tool_version"].as_str() == Some("professional") {
                Some("vve-pf")
            } else {
                Some("vve-sd")
            }
        } else {
            None
        };

        if let Some(m) = mid {
            // 通过固定不可变的 mid 反查数据库，获取用户自定义修改后当前处于激活状态的模型
            if let Some(model_data) = proxy::find_active_model_by_mid(&state, m).await {
                model_opt = Some(model_data.model_id.clone());
                db_model_from_mid = Some(model_data);
                category = "视频增强";
            } else {
                return Err(AppError::NotFound(format!(
                    "预置画质增强模型 (mid: {}) 未在系统启用或未激活",
                    m
                )));
            }
        }
    }

    let model_str = model_opt
        .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;
    let model = model_str.as_str();

    // Plugin: happyhorse_router 智能路由拦截（条件编译，移除 feature 后自动禁用）
    #[cfg(feature = "plugin_happyhorse")]
    let hh_intercept =
        crate::api::happyhorse_router::try_intercept(&state.db.pool, model, &body).await;
    #[cfg(not(feature = "plugin_happyhorse"))]
    let hh_intercept: Option<HappyHorseStub> = None;

    // billing_model: 用于预扣费和计费查询的模型（普通=model，小马=actual_model）
    // 日志和原始请求始终使用第1个模型 model
    let billing_model = hh_intercept
        .as_ref()
        .map_or(model, |r| r.actual_model.as_str());

    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, billing_model, &entry_path, Some(category))
        .await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        // 2. 渠道选择（智能路由用 routing_node，普通用原始 model）
        let channel_model_query = hh_intercept
            .as_ref()
            .map_or(model, |r| r.routing_node.as_str());
        let channel = match proxy::select_channel_with_db(
            &state,
            &token,
            channel_model_query,
            &ctx.user_group,
            &ctx.level_id,
            &entry_path,
            db_model_from_mid.as_ref(),
            &ha.exclude_aids,
            !ha.had_upstream,
            Some(category),
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
        let (pre_deduction, db_model, resolved_cat) = match proxy::check_access_with_model(
            &state,
            &token,
            billing_model,
            &ctx,
            Some(category),
            Some(&channel),
            db_model_from_mid.clone(),
        )
        .await
        {
            Ok(v) => v,
            Err(e) => {
                ha.on_access_err(e);
                break;
            }
        };

        // 转发规则（复用 db_model 避免重查 models 表）
        let mut resolved = match forward::resolve_forward_rule(
            &state,
            billing_model,
            &resolved_cat,
            &entry_path,
            Some(&channel),
            db_model.as_ref(),
        )
        .await
        {
            Some(r) => r,
            None => {
                if forward::model_has_forward_rules(&state, billing_model).await {
                    return Err(AppError::BadRequest(format!(
                        "模型 '{}' 不支持当前接口，请检查模型对应的转发规则",
                        billing_model
                    )));
                }
                forward::infer_forward_from_base_url(
                    &channel.base_url,
                    &resolved_cat,
                    db_model.as_ref(),
                )
            }
        };
        // 根据渠道 base_url 修正 target_type（如 APIMart 需从 "openai" 覆盖为 "apimart"）
        forward::refine_target_type(&mut resolved, &channel.base_url);

        // 模型映射：渠道内部映射 + 模型表别名映射
        let resolved_model_query = hh_intercept
            .as_ref()
            .map_or(channel_model_query, |r| r.actual_model.as_str());
        let (final_resolved_model, mapping_source) =
            router::resolve_model(&channel, resolved_model_query, db_model.as_ref());

        // 查询模型计费规则（复用 db_model 避免重查 models 表）
        let db_rule =
            proxy::get_model_billing_rule(&state, billing_model, Some(&channel), db_model.as_ref())
                .await;
        let mut upstream_body: serde_json::Value = forward::transform_request_body(
            &resolved,
            &final_resolved_model,
            &body,
            &resolved_cat,
            db_rule.as_ref(),
            Some(&state.http_client),
        )
        .await;

        // 级联超分：档位仅由模型 Id 推导（含 fast→极速，否则标准）；忽略请求体 version
        let mut cascade_tag_json = None;
        if resolved.is_cascade {
            let (cascade_version, volc_mid) = cascade_enhance_from_model(billing_model);

            // 目标分辨率单一来源：请求体 → 上游体 → 720p（与 cascade 标签 / 计费缺省一致）
            let target_res = if let Some(v) = body.get("resolution") {
                v.as_str()
                    .ok_or_else(|| AppError::BadRequest(format!("此模型不支持的分辨率: {}", v)))?
            } else {
                upstream_body
                    .get("resolution")
                    .and_then(|r| r.as_str())
                    .unwrap_or("720p")
            };
            cascade_check_resolution(db_rule.as_ref(), cascade_version, target_res)?;
            let target_key = target_res.trim().to_ascii_lowercase();
            // 规范化写入请求快照，供计费/阶段二与 cascade 标签同源
            body["resolution"] = serde_json::json!(target_key);

            // 阶段一座底截断；目标写入 cascade 标签
            let base_res = cascade_clamp_base_resolution(&target_key);
            upstream_body["resolution"] = serde_json::json!(base_res);
            tracing::info!(
                "[Cascade] 模型: {}, 增强: {}({}), 目标: {}, 底座: {}",
                billing_model,
                cascade_version,
                volc_mid,
                target_key,
                base_res
            );

            let volc_db_model = proxy::find_active_model_by_mid(&state, volc_mid)
                .await
                .ok_or_else(|| {
                    AppError::NotFound(format!(
                        "预置画质增强模型 (mid: {}) 未在系统启用或未激活",
                        volc_mid
                    ))
                })?;
            let volc_model_id = volc_db_model.model_id.as_str();

            let volc_channel = match proxy::select_channel_with_db(
                &state,
                &token,
                volc_model_id,
                &ctx.user_group,
                &ctx.level_id,
                &entry_path,
                Some(&volc_db_model),
                &[],
                true,
                Some("视频增强"),
            )
            .await
            {
                Ok(ch) => ch,
                Err(e) => {
                    tracing::warn!(
                        "[Cascade S2 Error] 级联画质增强专属渠道获取失败! 匹配参数 - model_id: '{}', user_group: '{}', level_id: '{}', mids: {:?}, 详细报错: {:?}",
                        volc_model_id, ctx.user_group, ctx.level_id, Some(vec![volc_db_model.mid.clone()]), e
                    );
                    return Err(e);
                }
            };

            let enhance_resolved = forward::resolve_forward_rule(
                &state,
                volc_model_id,
                "视频增强",
                &entry_path,
                Some(&volc_channel),
                Some(&volc_db_model),
            )
            .await
            .unwrap_or_else(|| {
                forward::infer_forward_from_base_url(
                    &volc_channel.base_url,
                    "视频增强",
                    Some(&volc_db_model),
                )
            });
            let (volc_final_model, _) =
                router::resolve_model(&volc_channel, volc_model_id, Some(&volc_db_model));

            // cascade 标签供阶段二取 mid/渠道；version 只写入 body 供计费快照（task 侧不读 cascade.version）
            let mut cascade_val = serde_json::json!({
                "mid": volc_mid,
                "resolution": target_key,
                "final_model": volc_final_model,
                "base_url": volc_channel.base_url,
                "api_key": volc_channel.api_key,
                "ch_id": volc_channel.id,
                "ch_name": volc_channel.name,
                "rate": volc_channel.rate,
                "auth_type": enhance_resolved.auth_type,
                "upstream_path": enhance_resolved.upstream_path,
                "target_type": enhance_resolved.target_type,
                "poll_path": enhance_resolved.poll_path,
            });

            // 仅 volc_enhance_cascade 预探测时长写入 input_duration，供阶段二结算
            if db_rule
                .as_ref()
                .is_some_and(|r| r.billing_rule == "volc_enhance_cascade")
            {
                let video_urls = proxy::extract_request_video_urls(&body);
                if !video_urls.is_empty() {
                    let dur =
                        proxy::sum_remote_videos_duration(&state.http_client, &video_urls).await;
                    if dur <= 0.0 {
                        return Err(AppError::BadRequest(
                            "无法探测输入视频的时长，请确保视频能正常公开访问，且为合法的视频格式"
                                .to_string(),
                        ));
                    }
                    cascade_val["input_duration"] = serde_json::json!(dur);
                }
            }

            cascade_tag_json = Some(cascade_val);
            body["version"] = serde_json::json!(cascade_version);
            request_content_str = serde_json::to_string(&body).unwrap_or_default();
        }

        // 可灵动态路径：根据请求体内容调整实际端点（text2video/image2video/multi-image2video）
        forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);

        let url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &final_resolved_model,
            &channel.api_key,
        );

        // 【一条日志原则】请求前预记录日志（model 记录用户请求的第1个模型 ID）
        let ep = format!(
            "{}|{}",
            raw_path,
            resolved
                .upstream_path
                .replace("${model}", &final_resolved_model)
        );

        // plugin_tag 构建（解耦在插件内，火山引擎插件使用 mid 标识）
        let plugin_tag: Option<String> = {
            let mut tag_json = serde_json::json!({});
            #[cfg(feature = "plugin_happyhorse")]
            if let Some(ref hh) = hh_intercept {
                tag_json =
                    serde_json::from_str(&crate::api::happyhorse_router::build_plugin_tag(hh))
                        .unwrap_or(serde_json::json!({}));
            }
            #[cfg(feature = "plugin_volcengine_enhance")]
            if tag_json.as_object().map_or(true, |o| o.is_empty())
                && resolved.target_type == "volcengine_media_enhance"
            {
                if let Some(ref m) = resolved.mid {
                    tag_json = serde_json::json!(m);
                }
            }
            // 级联模型：直接合并已获取到的级联配置
            if let Some(cascade_val) = cascade_tag_json {
                tag_json["cascade"] = cascade_val;
            }
            let s = tag_json.to_string();
            if s == "{}" || s == "null" {
                None
            } else {
                Some(s)
            }
        };

        if ha.pending_log_id.is_none() {
            ha.pending_log_id = proxy::record_pending_log(proxy::PendingLog {
                state: &state,
                user_id: &token.user_id,
                token_id: token.id,
                model: model,
                endpoint: &ep,
                is_stream: 0,
                request_content: Some(&request_content_str),
                upstream_url: Some(&url),
                channel: &channel,
                billing_model_hint: Some(billing_model),
                plugin_tag: plugin_tag.as_deref(),
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: Some(&resolved.eid),
                requested_log_id: x_log_id.as_deref(),
            })
            .await;
        }

        // 素材转换：仅当转发规则启用 asset_convert 时，将 content 中的网络 URL 转换为素材 ID
        let mut asset_convert_log: Option<String> = None;
        if resolved.asset_convert {
            let (convert_logs, convert_errors) = super::asset_convert::convert_content_urls(
                &state,
                &token.user_id,
                &resolved.asset_convert_ns,
                &mut upstream_body,
                resolved.asset_moderation,
            )
            .await;
            if !convert_logs.is_empty() {
                asset_convert_log = Some(format!("素材转换: {}", convert_logs.join(" | ")));
            }
            // 素材转换失败时直接拦截，不再继续调用上游接口
            if !convert_errors.is_empty() {
                let full_err = convert_errors.join("; ");
                let user_msg = convert_errors
                    .iter()
                    .map(|e| proxy::extract_error_message(e))
                    .collect::<Vec<_>>()
                    .join("; ");
                let latency_ms = start_time.elapsed().as_millis() as u32;
                let status_code = proxy::infer_error_status_code_from_str(&full_err);
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
                    status_code: status_code,
                    endpoint: &ep,
                    error_msg: Some(&full_err),
                    latency_ms: latency_ms,
                    is_stream: 0,
                    request_content: Some(request_content_str.clone()),
                    response_content: None,
                    upstream_req_content: None,
                    billing_detail: asset_convert_log.clone(),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: ha.pending_log_id,
                    billing_model_hint: Some(billing_model),
                    plugin_tag: None,
                    db_model: db_model.as_ref(),
                })
                .await;
                return Err(AppError::BadRequest(format!("素材转换失败: {}", user_msg)));
            }
        }

        // 【连接保护】将上游请求+预扣费+日志记录放入独立 task，客户端断开后仍能完成
        let model = model.to_string();
        let billing_model = billing_model.to_string();
        let pending_log_id = ha.pending_log_id;
        let raw_path = raw_path.to_string();
        let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();

        let dm = db_model.clone();
        let resolved = resolved.clone();
        let channel_c = channel.clone();
        let request_content_str = request_content_str.clone();
        let resolved_cat = resolved_cat.clone();
        let mapping_detail: Option<String> = mapping_source.map(|src| {
            format!(
                "{}: {} ➞ {}",
                src, resolved_model_query, final_resolved_model
            )
        });

        let state_c = state.clone();
        let token_c = token.clone();
        let ctx_role_c = ctx.role.clone();
        let ep_c = ep.clone();
        let upstream_body_c = upstream_body.clone();
        let asset_convert_log_c = asset_convert_log.clone();
        let url_c = url.clone();

        tokio::spawn(async move {
            let state = state_c;
            let token = token_c;
            let channel = channel_c;
            let ctx_role = ctx_role_c;
            let ep = ep_c;
            let mut upstream_body = upstream_body_c;
            let asset_convert_log = asset_convert_log_c;
            let url = url_c;

            let result: Result<Response, AppError> = async {
                let builder = state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json");
                let builder = forward::apply_request_auth(
                    builder,
                    &resolved,
                    &channel.api_key,
                    &mut upstream_body,
                    &channel.base_url,
                );
                let resp = match builder.send().await {
                    Ok(resp) => resp,
                    Err(e) => {
                        let err_msg = e.to_string();
                        let latency_ms = start_time.elapsed().as_millis() as u32;
                        proxy::record_and_bill_inner(proxy::BillRecord {
                            state: &state,
                            token: &token,
                            channel: &channel,
                            model: &model,
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            cached_tokens: 0,
                            cost: 0.0,
                            pre_deducted: 0.0,
                            pre_deduct_gift: 0.0,
                            status_code: 502,
                            endpoint: &ep,
                            error_msg: Some(&err_msg),
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(err_msg.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: asset_convert_log.clone(),
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: Some(&billing_model),
                            plugin_tag: None,
                            db_model: dm.as_ref(),
                        })
                        .await;
                        return Err(proxy::upstream_fail(502, &err_msg));
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
                        model: &model,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        cached_tokens: 0,
                        cost: 0.0,
                        pre_deducted: 0.0,
                        pre_deduct_gift: 0.0,
                        status_code: status,
                        endpoint: &ep,
                        error_msg: Some(&display_err),
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(request_content_str.clone()),
                        response_content: Some(err),
                        upstream_req_content: Some(upstream_body.to_string()),
                        billing_detail: asset_convert_log.clone(),
                        hint_category: Some(resolved_cat.as_str()),
                        pending_log_id: pending_log_id,
                        billing_model_hint: Some(&billing_model),
                        plugin_tag: None,
                        db_model: dm.as_ref(),
                    })
                    .await;
                    return Err(proxy::upstream_fail(status, &display_err));
                }

                let data = resp.bytes().await.unwrap_or_default();
                let mut response_content_str = String::from_utf8_lossy(&data).to_string();
                let (converted, post_err) = forward::check_upstream_post_error(
                    &resolved.target_type,
                    &response_content_str,
                    resolved_cat.as_str(),
                    crate::relay::response_formatter::is_openai_compatible_path(&raw_path),
                );
                response_content_str = converted;
                if let Some(err_response) = post_err {
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    let err_text = proxy::extract_error_message(&response_content_str);
                    let err_status = proxy::infer_error_status_code_from_str(&response_content_str);
                    proxy::record_and_bill_inner(proxy::BillRecord {
                        state: &state,
                        token: &token,
                        channel: &channel,
                        model: &model,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        cached_tokens: 0,
                        cost: 0.0,
                        pre_deducted: 0.0,
                        pre_deduct_gift: 0.0,
                        status_code: err_status,
                        endpoint: &ep,
                        error_msg: Some(&err_text),
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(request_content_str),
                        response_content: Some(response_content_str),
                        upstream_req_content: Some(upstream_body.to_string()),
                        billing_detail: Some("请求失败".to_string()),
                        hint_category: Some(resolved_cat.as_str()),
                        pending_log_id: pending_log_id,
                        billing_model_hint: Some(&billing_model),
                        plugin_tag: None,
                        db_model: dm.as_ref(),
                    })
                    .await;
                    return Err(proxy::upstream_fail(err_status, &err_response));
                }

                let pre_deduct_gift = proxy::pre_deduct_or_intercept(
                    &state,
                    &token,
                    &channel,
                    &model,
                    pre_deduction,
                    &ep,
                    start_time,
                    0,
                    &request_content_str,
                    &upstream_body.to_string(),
                    None,
                    pending_log_id,
                    dm.as_ref(),
                    &ctx_role,
                    Some(resolved_cat.as_str()),
                )
                .await?;

                let latency_ms = start_time.elapsed().as_millis() as u32;
                let mut billing_detail = match (&asset_convert_log, pre_deduction > 0.0) {
                    (Some(acl), true) => format!("异步任务预扣费冻结 | {}", acl),
                    (None, true) => "异步任务预扣费冻结".to_string(),
                    (Some(acl), false) => format!("异步任务处理中(冻结) | {}", acl),
                    (None, false) => "异步任务处理中(冻结)".to_string(),
                };
                if let Some(ref md) = mapping_detail {
                    billing_detail.push_str(&format!(" | {}", md));
                }
                proxy::record_and_bill_inner(proxy::BillRecord {
                    state: &state,
                    token: &token,
                    channel: &channel,
                    model: &model,
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    cached_tokens: 0,
                    cost: pre_deduction,
                    pre_deducted: pre_deduction,
                    pre_deduct_gift: pre_deduct_gift,
                    status_code: 200,
                    endpoint: &ep,
                    error_msg: None,
                    latency_ms: latency_ms,
                    is_stream: 0,
                    request_content: Some(request_content_str),
                    response_content: Some(response_content_str.clone()),
                    upstream_req_content: Some(upstream_body.to_string()),
                    billing_detail: Some(billing_detail),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: pending_log_id,
                    billing_model_hint: Some(&billing_model),
                    plugin_tag: None,
                    db_model: dm.as_ref(),
                })
                .await;

                let final_response_str = crate::relay::response_formatter::apply_format(
                    &state.db.pool,
                    &raw_path,
                    &resolved_cat,
                    &response_content_str,
                    true,
                    None,
                )
                .await;

                Ok(Response::builder()
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(final_response_str))
                    .unwrap())
            }
            .await;
            let _ = result_tx.send(result);
        });

        match result_rx.await {
            Ok(result) => match result {
                Ok(resp) => return Ok(resp),
                Err(e) => {
                    if ha
                        .on_spawn_result_err(&state, &channel, e, Some(&url))
                        .await
                    {
                        ha.bump();
                        continue;
                    }
                    break;
                }
            },
            Err(_) => {
                ha.last_err = AppError::Internal("请求处理任务异常终止".into());
                break;
            }
        }
    }

    Err(ha.finish())
}

// 级联相关业务已统一移至 cascade.rs 模块中
