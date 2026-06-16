//! Relay: POST /v1/video/generations
//! OpenAI-compatible video generation task endpoint with forward-rule-driven protocol adaptation.

use axum::{extract::{State, Extension, OriginalUri}, response::Response, Json};
use std::sync::Arc;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward, router};

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
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();
    let x_log_id = headers.get("x-log-id").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let model = body["model"].as_str()
        .or_else(|| body["model_name"].as_str())
        .ok_or_else(|| AppError::BadRequest(
            "Missing required parameter: model".to_string()
        ))?;

    // Plugin: happyhorse_router 智能路由拦截（条件编译，移除 feature 后自动禁用）
    #[cfg(feature = "plugin_happyhorse")]
    let hh_intercept = crate::api::happyhorse_router::try_intercept(
        &state.db.pool, model, &body,
    ).await;
    #[cfg(not(feature = "plugin_happyhorse"))]
    let hh_intercept: Option<HappyHorseStub> = None;

    // billing_model: 用于预扣费和计费查询的模型（普通=model，小马=actual_model）
    // 日志和原始请求始终使用第1个模型 model
    let billing_model = hh_intercept.as_ref().map_or(model, |r| r.actual_model.as_str());

    // 1. Token 模型权限校验（渠道选择前快速拦截）
    proxy::check_model_permission(&state, &token, billing_model, &entry_path).await?;

    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 2. 渠道选择（智能路由用 routing_node，普通用原始 model）
    let channel_model_query = hh_intercept.as_ref().map_or(model, |r| r.routing_node.as_str());
    let channel = proxy::select_channel_for_model(&state, &token, channel_model_query, &ctx.user_group, &ctx.level_id, &entry_path).await?;

    // 3. 预扣费检查（带 channel 精确匹配同名模型的预扣费金额，同时获取 Model 供下游复用）
    let (pre_deduction, db_model) = proxy::check_access(&state, &token, billing_model, &ctx, Some("视频"), Some(&channel)).await?;

    // 转发规则（复用 db_model 避免重查 models 表）
    let mut resolved = match forward::resolve_forward_rule(&state, billing_model, "视频", &entry_path, Some(&channel), db_model.as_ref()).await {
        Some(r) => r,
        None => {
            if forward::model_has_forward_rules(&state, billing_model).await {
                return Err(AppError::BadRequest(format!(
                    "模型 '{}' 不支持当前接口，请检查模型对应的转发规则", billing_model
                )));
            }
            forward::infer_forward_from_base_url(&channel.base_url, "视频")
        }
    };
    // 根据渠道 base_url 修正 target_type（如 APIMart 需从 "openai" 覆盖为 "apimart"）
    forward::refine_target_type(&mut resolved, &channel.base_url);

    // 模型映射：渠道内部映射 + 模型表别名映射
    let resolved_model_query = hh_intercept.as_ref().map_or(channel_model_query, |r| r.actual_model.as_str());
    let (final_resolved_model, mapping_source) = router::resolve_model(&channel, resolved_model_query, db_model.as_ref());

    // 查询模型计费规则（复用 db_model 避免重查 models 表）
    let db_rule = proxy::get_model_billing_rule(&state, billing_model, Some(&channel), db_model.as_ref()).await;
    let mut upstream_body: serde_json::Value = forward::transform_request_body(&resolved, &final_resolved_model, &body, "视频", db_rule.as_ref(), Some(&state.http_client)).await;
    // 可灵动态路径：根据请求体内容调整实际端点（text2video/image2video/multi-image2video）
    forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);
    let url = forward::build_upstream_url(&channel.base_url, &resolved, &final_resolved_model, &channel.api_key);

    // 【一条日志原则】请求前预记录日志（model 记录用户请求的第1个模型 ID）
    let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &final_resolved_model));
    // plugin_tag 构建（解耦在插件内）
    #[cfg(feature = "plugin_happyhorse")]
    let plugin_tag: Option<String> = hh_intercept.as_ref().map(crate::api::happyhorse_router::build_plugin_tag);
    #[cfg(not(feature = "plugin_happyhorse"))]
    let plugin_tag: Option<String> = None;

    let pending_log_id = proxy::record_pending_log(
        &state, &token.user_id, channel.id, token.id, model, &ep,
        0, Some(&request_content_str),
        Some(&url), Some(&channel),
        Some(billing_model), plugin_tag.as_deref(),
        Some("视频"),
        db_model.as_ref(),
        Some(&resolved.eid),
        x_log_id.as_deref(),
    ).await;

    // 素材转换：仅当转发规则启用 asset_convert 时，将 content 中的网络 URL 转换为素材 ID
    let mut asset_convert_log: Option<String> = None;
    if resolved.asset_convert {
        let (convert_logs, convert_errors) = super::asset_convert::convert_content_urls(&state, &token.user_id, &resolved.asset_convert_ns, &mut upstream_body, resolved.asset_moderation).await;
        if !convert_logs.is_empty() {
            asset_convert_log = Some(format!("素材转换: {}", convert_logs.join(" | ")));
        }
        // 素材转换失败时直接拦截，不再继续调用上游接口
        if !convert_errors.is_empty() {
            let full_err = convert_errors.join("; ");
            // 提取火山引擎错误中的 Message 字段作为用户可读信息，去重后拼接（避免相同原因重复展示）
            let mut user_msgs: Vec<String> = convert_errors.iter()
                .filter_map(|e| {
                    // 尝试从错误字符串中提取 JSON 部分的 ResponseMetadata/Error/Message
                    e.find('{').and_then(|i| serde_json::from_str::<serde_json::Value>(&e[i..]).ok())
                        .and_then(|j| j.pointer("/ResponseMetadata/Error/Message")
                            .or_else(|| j.pointer("/Error/Message"))
                            .and_then(|v| v.as_str()).map(|s| s.to_string()))
                })
                .collect();
            user_msgs.dedup();
            let user_msg = if user_msgs.is_empty() { "素材转换失败".to_string() } else { user_msgs.join("; ") };
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let status_code = proxy::infer_error_status_code(&full_err);
            proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0, 0.0, status_code,
                &ep, Some(&full_err), latency_ms, 0,
                Some(request_content_str.clone()), None, None, asset_convert_log.clone(), Some("视频"), pending_log_id,
                Some(billing_model), None, db_model.as_ref()).await;
            
            // Plugin: happyhorse_router 日志
            #[cfg(feature = "plugin_happyhorse")]
            if let Some(ref r) = hh_intercept {
                crate::api::happyhorse_router::log_request(
                    &state.db.pool, &token.user_id, &r.custom_model_id,
                    &r.media_type, &r.actual_model, pending_log_id,
                ).await;
            }

            return Err(AppError::BadRequest(format!("素材转换失败: {}", user_msg)));
        }
    }

    // 【连接保护】将上游请求+预扣费+日志记录放入独立 task，客户端断开后仍能完成
    let model = model.to_string();
    let billing_model = billing_model.to_string();
    let raw_path = raw_path.to_string();
    let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();
    
    let hh_intercept_clone = hh_intercept.clone();
    let dm = db_model.clone();
    // 映射日志：在 spawn 前构建（final_resolved_model 不进 spawn）
    let mapping_detail: Option<String> = mapping_source.map(|src| format!("{}: {} ➞ {}", src, resolved_model_query, final_resolved_model));

    tokio::spawn(async move {
        let result: Result<Response, AppError> = async {
            tracing::info!("[Video] model={}, target_type={}, url={}", model, resolved.target_type, url);

            // 构建并发送上游请求（统一鉴权 + 设置请求体）
            let builder = state.http_client.post(&url)
                .header("Content-Type", "application/json");
            let builder = forward::apply_request_auth(builder, &resolved, &channel.api_key, &mut upstream_body, &channel.base_url);
            let resp = match builder.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let err_msg = e.to_string();
                    let latency_ms = start_time.elapsed().as_millis() as u32;
                    proxy::record_and_bill_inner(
                        &state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, 502,
                        &ep, Some(&err_msg), latency_ms, 0,
                        Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                        asset_convert_log.clone(), Some("视频"), pending_log_id,
                        Some(&billing_model), None, dm.as_ref()
                    ).await;
                    // Plugin: happyhorse_router 日志
                    #[cfg(feature = "plugin_happyhorse")]
                    if let Some(ref r) = hh_intercept_clone {
                        crate::api::happyhorse_router::log_request(
                            &state.db.pool, &token.user_id, &r.custom_model_id,
                            &r.media_type, &r.actual_model, pending_log_id,
                        ).await;
                    }
                    return Err(AppError::UpstreamError(proxy::sanitize_error_message(&err_msg)));
                }
            };

            let status = resp.status().as_u16();
            if !resp.status().is_success() {
                let err = resp.text().await.unwrap_or_default();
                let display_err = if err.trim().is_empty() { format!("Upstream HTTP error {}", status) } else { err.clone() };
                let latency_ms = start_time.elapsed().as_millis() as u32;
                proxy::record_and_bill_inner(&state, &token, channel.id, &model, 0, 0, 0, 0.0, 0.0, 0.0, status,
                    &ep, Some(&display_err), latency_ms, 0,
                    Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()), asset_convert_log.clone(), Some("视频"), pending_log_id,
                    Some(&billing_model), None, dm.as_ref()).await;
                
                // Plugin: happyhorse_router 日志
                #[cfg(feature = "plugin_happyhorse")]
                if let Some(ref r) = hh_intercept_clone {
                    crate::api::happyhorse_router::log_request(
                        &state.db.pool, &token.user_id, &r.custom_model_id,
                        &r.media_type, &r.actual_model, pending_log_id,
                    ).await;
                }

                tracing::info!("video post提交失败  {}", display_err);
                return Err(AppError::UpstreamError(proxy::sanitize_error_message(&display_err)));
            }

            let data = resp.bytes().await.unwrap_or_default();
            let model = &model;
            let mut response_content_str = String::from_utf8_lossy(&data).to_string();

            // 上游 body 级错误检测（腾讯云/即梦等 HTTP 200 但业务失败，在预扣费之前拦截）
            let (converted, post_err) = forward::check_upstream_post_error(
                &resolved.target_type, &response_content_str,
                "video.generation"
            );
            response_content_str = converted;
            if let Some(err_response) = post_err {
                let latency_ms = start_time.elapsed().as_millis() as u32;
                let err_text = proxy::extract_error_message(&response_content_str);
                let err_status = proxy::infer_error_status_code(&err_text);
                proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, 0.0, 0.0,
                    0.0, err_status, &ep, None, latency_ms, 0,
                    Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()),
                    Some("请求失败".to_string()), Some("视频"), pending_log_id, Some(&billing_model), None, dm.as_ref()).await;

                // Plugin: happyhorse_router 日志
                #[cfg(feature = "plugin_happyhorse")]
                if let Some(ref r) = hh_intercept_clone {
                    crate::api::happyhorse_router::log_request(
                        &state.db.pool, &token.user_id, &r.custom_model_id,
                        &r.media_type, &r.actual_model, pending_log_id,
                    ).await;
                }

                return Ok(Response::builder().status(400)
                    .header("Content-Type", "application/json")
                    .body(axum::body::Body::from(err_response)).unwrap());
            }

            // 业务正常，执行预扣费（管理员跳过）
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
                            &ep, Some(&err_msg), latency_ms, 0,
                            Some(request_content_str.clone()), Some(err_msg.clone()), Some(upstream_body.to_string()),
                            None, Some("视频"), pending_log_id, Some(&billing_model), None, dm.as_ref()
                        ).await;
                        // Plugin: happyhorse_router 日志
                        #[cfg(feature = "plugin_happyhorse")]
                        if let Some(ref r) = hh_intercept_clone {
                            crate::api::happyhorse_router::log_request(
                                &state.db.pool, &token.user_id, &r.custom_model_id,
                                &r.media_type, &r.actual_model, pending_log_id,
                            ).await;
                        }
                        return Err(if matches!(e, sqlx::Error::RowNotFound) {
                            AppError::Forbidden("余额不足".to_string())
                        } else {
                            AppError::Internal(err_msg)
                        });
                    }
                }
            } else { 0.0 };

            // 视频是异步任务：POST 只记录日志（cost=预扣费），真正结算在 GET 轮询成功后执行
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
            proxy::record_and_bill_inner(&state, &token, channel.id, model, 0, 0, 0, pre_deduction, pre_deduction,
                pre_deduct_gift, 200,
                &ep, None, latency_ms, 0,
                Some(request_content_str), Some(response_content_str.clone()), Some(upstream_body.to_string()), Some(billing_detail), Some("视频"), pending_log_id,
                Some(&billing_model), None, dm.as_ref()).await;

            // Plugin: happyhorse_router 日志
            #[cfg(feature = "plugin_happyhorse")]
            if let Some(ref r) = hh_intercept_clone {
                crate::api::happyhorse_router::log_request(
                    &state.db.pool, &token.user_id, &r.custom_model_id,
                    &r.media_type, &r.actual_model, pending_log_id,
                ).await;
            }

            // 腾讯云已提前转换为 OpenAI 格式，其他厂商走 apply_format 统一转换
            let final_response_str = if resolved.target_type == "tencent_vod_video" {
                response_content_str
            } else {
                crate::relay::response_formatter::apply_format(
                    &state.db.pool, &raw_path, "视频", &response_content_str, true, None
                ).await
            };

            Ok(Response::builder()
                .header("Content-Type", "application/json")
                .body(axum::body::Body::from(final_response_str))
                .unwrap())

        }.await;
        let _ = result_tx.send(result);
    });

    // 等待 spawned task 结果；若 handler 被 drop（客户端断开），task 继续运行
    match result_rx.await {
        Ok(result) => result,
        Err(_) => Err(AppError::Internal("请求处理任务异常终止".into())),
    }
}
