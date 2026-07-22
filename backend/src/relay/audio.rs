/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! Relay: POST /v1/audio/speech
//! 语音合成（TTS）端点，支持 OpenAI 兼容格式和火山 TTS V3 SSE 协议。
//! 遵循与 video.rs 一致的 7 步流水线模式。

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

// ── Content-Type 映射 ──────────────────────────────────────────

/// 根据音频格式返回对应的 MIME Content-Type
fn audio_content_type(format: &str) -> &'static str {
    match format {
        "mp3" => "audio/mpeg",
        "opus" | "ogg_opus" => "audio/ogg",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "pcm" => "audio/pcm",
        _ => "audio/mpeg",
    }
}

// ── 火山 TTS V3 SSE 响应结构 ───────────────────────────────────

/// 火山 TTS V3 SSE 事件 JSON 结构
#[derive(serde::Deserialize)]
struct VolcTtsEvent {
    /// 状态码: 0 或 3000 表示成功，其他为错误
    code: i32,
    /// 状态消息
    #[serde(default)]
    message: String,
    /// Base64 编码的音频数据片段
    #[serde(default)]
    data: Option<String>,
    /// 用量信息（最后一个事件包含）
    #[serde(default)]
    usage: Option<VolcTtsUsage>,
}

/// 火山 TTS 用量
#[derive(serde::Deserialize)]
struct VolcTtsUsage {
    /// 文本字数
    #[serde(default)]
    text_words: Option<i32>,
}

// ── 主处理函数 ──────────────────────────────────────────────────

/// POST /v1/audio/speech — 语音合成
pub async fn audio_speech(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    OriginalUri(uri): OriginalUri,
    headers: axum::http::HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Response> {
    let raw_path = uri.path();
    let entry_path = raw_path.to_string();
    // 判断是否为官方原生路由（/api/v3/tts/...），影响模型提取和响应格式
    let is_native_route = raw_path.starts_with("/api/");
    let request_content_str = serde_json::to_string(&body).unwrap_or_default();

    // 官方原生路由优先从 header 提取模型ID（X-Api-Resource-Id），兜底 body.model
    let model = if is_native_route {
        headers
            .get("x-api-resource-id")
            .and_then(|v| v.to_str().ok())
            .or_else(|| body["model"].as_str())
    } else {
        body["model"].as_str()
    }
    .ok_or_else(|| AppError::BadRequest("Missing required parameter: model".to_string()))?;

    // ── 1. Token 模型权限校验（渠道选择前快速拦截） ──
    proxy::check_model_permission(&state, &token, model, &entry_path, Some("音频")).await?;

    // ── 2. 用户上下文 ──
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // ── 3. 渠道选择 + HA failover ──
    let mut ha = crate::relay::ha::HaAttempt::begin(&state, token.high_availability).await;

    while ha.cont() {
        let start_time = std::time::Instant::now();
        let channel = match proxy::select_channel_for_model(
            &state,
            &token,
            model,
            &ctx.user_group,
            &ctx.level_id,
            &entry_path,
            &ha.exclude_aids,
            !ha.had_upstream,
            Some("音频"),
        )
        .await
        {
            Ok(c) => c,
            Err(e) => {
                ha.on_select_err(e);
                break;
            }
        };

        // ── 4. 预扣费检查（category = "音频"） ──
        let (pre_deduction, db_model, resolved_cat) =
            match proxy::check_access(&state, &token, model, &ctx, Some("音频"), Some(&channel))
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    ha.on_access_err(e);
                    break;
                }
            };

        // ── 5. 转发规则解析（category = "音频"） ──
        let mut resolved = match forward::resolve_forward_rule(
            &state,
            model,
            &resolved_cat,
            &entry_path,
            Some(&channel),
            db_model.as_ref(),
        )
        .await
        {
            Some(r) => r,
            None => {
                if forward::model_has_forward_rules(&state, model).await {
                    return Err(AppError::BadRequest(format!(
                        "模型 '{}' 不支持当前接口，请检查模型对应的转发规则",
                        model
                    )));
                }
                forward::infer_forward_from_base_url(
                    &channel.base_url,
                    &resolved_cat,
                    db_model.as_ref(),
                )
            }
        };
        // 根据渠道 base_url 修正 target_type
        forward::refine_target_type(&mut resolved, &channel.base_url);

        // 模型映射：渠道内部映射 + 模型表别名映射
        let (final_resolved_model, mapping_source) =
            router::resolve_model(&channel, model, db_model.as_ref());

        // 查询计费规则（供计费阶段使用）
        let mut db_rule =
            proxy::get_model_billing_rule(&state, model, Some(&channel), db_model.as_ref()).await;

        // ── 6. 请求体转换 ──
        let mut upstream_body: serde_json::Value = forward::transform_request_body(
            &resolved,
            &final_resolved_model,
            &body,
            &resolved_cat,
            db_rule.as_ref(),
            Some(&state.http_client),
        )
        .await;

        let url = forward::build_upstream_url(
            &channel.base_url,
            &resolved,
            &final_resolved_model,
            &channel.api_key,
        );

        // 提取请求文本字符数（OpenAI input / 火山 req_params.text / 旧版 request.text）
        let request_text_chars: i32 = body
            .get("input")
            .and_then(|v| v.as_str())
            .or_else(|| {
                body.get("req_params")
                    .and_then(|r| r.get("text"))
                    .and_then(|v| v.as_str())
            })
            .or_else(|| {
                body.get("request")
                    .and_then(|r| r.get("text"))
                    .and_then(|v| v.as_str())
            })
            .map(|s| s.chars().count() as i32)
            .unwrap_or(0);

        // 提取音频格式（OpenAI response_format / 火山 req_params.audio_params.format）
        let response_format = body
            .get("response_format")
            .and_then(|v| v.as_str())
            .or_else(|| {
                body.get("req_params")
                    .and_then(|r| r.get("audio_params"))
                    .and_then(|a| a.get("format"))
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("mp3")
            .to_string();

        // 【一条日志原则】请求前预记录日志
        let ep = format!(
            "{}|{}",
            raw_path,
            resolved
                .upstream_path
                .replace("${model}", &final_resolved_model)
        );

        tracing::info!(
            "[Audio] model={}, target_type={}, url={}, text_chars={}",
            model,
            resolved.target_type,
            url,
            request_text_chars
        );

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
                billing_model_hint: None,
                plugin_tag: None,
                category: Some(resolved_cat.as_str()),
                db_model: db_model.as_ref(),
                forward_eid: Some(&resolved.eid),
                requested_log_id: None,
            })
            .await;
        }

        // ── 7. 上游请求 → 响应处理 → 计费结算 ──
        // 【连接保护】将上游请求+预扣费+日志记录放入独立 task，客户端断开后仍能完成
        let model = model.to_string();
        let is_sse = raw_path.ends_with("/sse");
        let pending_log_id = ha.pending_log_id;
        let (result_tx, result_rx) = tokio::sync::oneshot::channel::<Result<Response, AppError>>();
        let state_c = state.clone();
        let token_c = token.clone();
        let channel_c = channel.clone();
        let model_c = model.clone();
        let request_content_str_c = request_content_str.clone();
        let response_format_c = response_format.clone();
        let ctx_role_c = ctx.role.clone();
        let ctx_model_discounts_c = ctx.model_discounts.clone();
        let url_c = url.clone();

        tokio::spawn(async move {
            let state = state_c;
            let token = token_c;
            let channel = channel_c;
            let model = model_c;
            let request_content_str = request_content_str_c;
            let response_format = response_format_c;
            let ctx_role = ctx_role_c;
            let ctx_model_discounts = ctx_model_discounts_c;
            let url = url_c;
            let result: Result<Response, AppError> = async {
                // 业务正常，执行预扣费（管理员跳过）
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
                    db_model.as_ref(),
                    &ctx_role,
                    Some(resolved_cat.as_str()),
                )
                .await?;

                // 构建并发送上游请求（统一鉴权 + 设置请求体）
                let builder = state
                    .http_client
                    .post(&url)
                    .header("Content-Type", "application/json");
                let mut builder = forward::apply_request_auth(
                    builder,
                    &resolved,
                    &channel.api_key,
                    &mut upstream_body,
                    &channel.base_url,
                );
                // volcengine_tts 额外注入：模型版本标识、请求ID（文档必填）、用量返回 header
                if resolved.target_type == "volcengine_tts" {
                    builder = builder
                        .header("X-Api-Resource-Id", &final_resolved_model)
                        .header("X-Api-Request-Id", ulid::Ulid::new().to_string())
                        .header("X-Control-Require-Usage-Tokens-Return", "*");
                }
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
                            pre_deducted: pre_deduction,
                            pre_deduct_gift: pre_deduct_gift,
                            status_code: 502,
                            endpoint: &ep,
                            error_msg: Some(&err_msg),
                            latency_ms: latency_ms,
                            is_stream: 0,
                            request_content: Some(request_content_str.clone()),
                            response_content: Some(err_msg.clone()),
                            upstream_req_content: Some(upstream_body.to_string()),
                            billing_detail: None,
                            hint_category: Some(resolved_cat.as_str()),
                            pending_log_id: pending_log_id,
                            billing_model_hint: None,
                            plugin_tag: None,
                            db_model: db_model.as_ref(),
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
                        pre_deducted: pre_deduction,
                        pre_deduct_gift: pre_deduct_gift,
                        status_code: status,
                        endpoint: &ep,
                        error_msg: Some(&display_err),
                        latency_ms: latency_ms,
                        is_stream: 0,
                        request_content: Some(request_content_str.clone()),
                        response_content: Some(err),
                        upstream_req_content: Some(upstream_body.to_string()),
                        billing_detail: None,
                        hint_category: Some(resolved_cat.as_str()),
                        pending_log_id: pending_log_id,
                        billing_model_hint: None,
                        plugin_tag: None,
                        db_model: db_model.as_ref(),
                    })
                    .await;
                    return Err(proxy::upstream_fail(status, &display_err));
                }

                // 根据 target_type 和路由类型分发响应处理
                let (resp_body, text_characters, resp_summary) =
                    if resolved.target_type == "volcengine_tts" {
                        // 在所有权被 raw_response 消耗前提取 Content-Type
                        let default_ct = if is_sse {
                            "text/event-stream"
                        } else {
                            audio_content_type(&response_format)
                        };
                        let upstream_ct = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or(default_ct)
                            .to_string();

                        let raw_response = resp.text().await.unwrap_or_default();

                        // 检查并记录火山 TTS 的业务错误（原生路由退费并透传 200，兼容路由退费并返回 502）
                        if let Some(err_json) = detect_volcengine_tts_error(&raw_response) {
                            let latency_ms = start_time.elapsed().as_millis() as u32;
                            if is_native_route {
                                record_volcengine_tts_error(
                                    &state,
                                    &token,
                                    &channel,
                                    &model,
                                    pre_deduction,
                                    pre_deduct_gift,
                                    &ep,
                                    &err_json,
                                    latency_ms,
                                    &request_content_str,
                                    &raw_response,
                                    &upstream_body.to_string(),
                                    pending_log_id,
                                    db_model.as_ref(),
                                )
                                .await;

                                let body = Response::builder()
                                    .header("Content-Type", &upstream_ct)
                                    .body(axum::body::Body::from(raw_response))
                                    .unwrap();
                                return Ok(body);
                            } else {
                                let display_err = if let Ok(event) =
                                    serde_json::from_str::<VolcTtsEvent>(&err_json)
                                {
                                    format!(
                                        "火山 TTS 错误: code={}, message={}",
                                        event.code, event.message
                                    )
                                } else {
                                    err_json.clone()
                                };
                                record_volcengine_tts_error(
                                    &state,
                                    &token,
                                    &channel,
                                    &model,
                                    pre_deduction,
                                    pre_deduct_gift,
                                    &ep,
                                    &display_err,
                                    latency_ms,
                                    &request_content_str,
                                    &raw_response,
                                    &upstream_body.to_string(),
                                    pending_log_id,
                                    db_model.as_ref(),
                                )
                                .await;
                                return Err(proxy::upstream_fail(status, &display_err));
                            }
                        }

                        if is_native_route {
                            // 官方原生路由：透传上游 SSE/Chunked 响应原文，同时提取 usage.text_words 用于计费
                            let chars = extract_volcengine_tts_usage(&raw_response)
                                .unwrap_or(request_text_chars);
                            let mode_str = if is_sse { "SSE" } else { "Chunked" };
                            let summary = format!(
                                "{} 透传 {} bytes, {}字符",
                                mode_str,
                                raw_response.len(),
                                chars
                            );
                            let body = Response::builder()
                                .header("Content-Type", &upstream_ct)
                                .body(axum::body::Body::from(raw_response.clone()))
                                .unwrap();
                            (body, chars, summary)
                        } else {
                            // OpenAI 兼容路由：解析 SSE 事件流 → Base64 解码 → 返回二进制音频流
                            match consume_volcengine_tts_sse(&raw_response, request_text_chars) {
                                Ok((bytes, chars)) => {
                                    let summary =
                                        format!("音频数据 {} bytes, {}字符", bytes.len(), chars);
                                    let content_type = audio_content_type(&response_format);
                                    let body = Response::builder()
                                        .header("Content-Type", content_type)
                                        .body(axum::body::Body::from(bytes))
                                        .unwrap();
                                    (body, chars, summary)
                                }
                                Err(err_msg) => {
                                    // SSE 事件级错误（HTTP 200 但业务失败，如 Invalid X-Api-Key）
                                    let latency_ms = start_time.elapsed().as_millis() as u32;
                                    record_volcengine_tts_error(
                                        &state,
                                        &token,
                                        &channel,
                                        &model,
                                        pre_deduction,
                                        pre_deduct_gift,
                                        &ep,
                                        &err_msg,
                                        latency_ms,
                                        &request_content_str,
                                        &raw_response,
                                        &upstream_body.to_string(),
                                        pending_log_id,
                                        db_model.as_ref(),
                                    )
                                    .await;
                                    return Err(proxy::upstream_fail(502, &err_msg));
                                }
                            }
                        }
                    } else {
                        // 其他 target_type（如 openai）：直接透传上游二进制音频流
                        let upstream_ct = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or(audio_content_type(&response_format))
                            .to_string();
                        let bytes = resp.bytes().await.unwrap_or_default();
                        let summary = format!("音频数据 {} bytes", bytes.len());
                        let body = Response::builder()
                            .header("Content-Type", upstream_ct)
                            .body(axum::body::Body::from(bytes))
                            .unwrap();
                        (body, request_text_chars, summary)
                    };

                // ── 计费结算 ──
                let latency_ms = start_time.elapsed().as_millis() as u32;

                // 构建 features，将文本字符数填入 text_characters
                let mut features = crate::relay::usage_extractor::ExtractedFeatures::default();
                features.text_characters = Some(text_characters);

                // 将 text_characters 记入 completion_tokens 字段（复用现有的 token 计量字段）
                let usage_tokens = crate::relay::usage_extractor::UsageTokens {
                    prompt: 0,
                    completion: text_characters,
                    total: text_characters,
                    cached: 0,
                    cache_creation: 0,
                    audio_tokens: 0,
                    audio_cached_tokens: 0,
                    image_tokens: 0,
                    web_search: 0,
                };

                let (cost, mut billing_detail) = crate::relay::calculate_relay_cost(
                    &state,
                    db_model.as_ref(),
                    db_rule.as_mut(),
                    &channel,
                    ctx.discount,
                    &ctx_model_discounts,
                    &usage_tokens,
                    &features,
                    mapping_source,
                    &model,
                    &final_resolved_model,
                )
                .await;
                // 补充语音合成描述
                billing_detail = format!("语音合成 {}字符 | {}", text_characters, billing_detail);

                proxy::record_and_bill_inner(proxy::BillRecord {
                    state: &state,
                    token: &token,
                    channel: &channel,
                    model: &model,
                    prompt_tokens: 0,
                    completion_tokens: text_characters,
                    cached_tokens: 0,
                    cost: cost,
                    pre_deducted: pre_deduction,
                    pre_deduct_gift: pre_deduct_gift,
                    status_code: 200,
                    endpoint: &ep,
                    error_msg: None,
                    latency_ms: latency_ms,
                    is_stream: 0,
                    request_content: Some(request_content_str),
                    response_content: Some(resp_summary),
                    upstream_req_content: Some(upstream_body.to_string()),
                    billing_detail: Some(billing_detail),
                    hint_category: Some(resolved_cat.as_str()),
                    pending_log_id: pending_log_id,
                    billing_model_hint: None,
                    plugin_tag: None,
                    db_model: db_model.as_ref(),
                })
                .await;

                Ok(resp_body)
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
    } // end while

    Err(ha.finish())
}

// ── 火山 TTS V3 响应解析 ───────────────────────────────────

/// 从火山 TTS V3 SSE 响应文本中提取 usage.text_words（最后一个事件包含）。
/// 轻量级函数：仅解析 JSON 事件提取用量，不解码音频数据。
/// 返回 None 表示上游未返回用量。
fn extract_volcengine_tts_usage(body_text: &str) -> Option<i32> {
    let mut text_words: Option<i32> = None;
    for line in body_text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let json_str = if line.starts_with("data: ") {
            &line[6..]
        } else if line.starts_with("data:") {
            &line[5..]
        } else {
            line
        };
        if let Ok(event) = serde_json::from_str::<VolcTtsEvent>(json_str) {
            if let Some(ref usage) = event.usage {
                if let Some(tw) = usage.text_words {
                    text_words = Some(tw);
                }
            }
        }
    }
    text_words
}

/// 解析火山 TTS V3 SSE 响应文本，解码 Base64 音频片段并拼接。
/// 返回 Ok((完整音频字节, 文本字符数)) 或 Err(错误描述)。
/// 调用方负责读取原始响应文本，以便在错误时用于日志记录。
fn consume_volcengine_tts_sse(
    body_text: &str,
    fallback_chars: i32,
) -> Result<(Vec<u8>, i32), String> {
    use base64::Engine;

    let mut audio_buf: Vec<u8> = Vec::new();
    let mut text_words: Option<i32> = None;

    for line in body_text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // 兼容 "data: {...}" 前缀和纯 JSON 行
        let json_str = if line.starts_with("data: ") {
            &line[6..]
        } else if line.starts_with("data:") {
            &line[5..]
        } else {
            line
        };

        let event: VolcTtsEvent = match serde_json::from_str(json_str) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // 兼容多种成功/完成码：0=数据块成功, 3000=文档标注成功, 20000000=流结束确认
        if event.code != 0 && event.code != 3000 && event.code != 20000000 {
            return Err(format!(
                "火山 TTS 错误: code={}, message={}",
                event.code, event.message
            ));
        }

        // 解码 Base64 音频数据片段并拼接
        if let Some(ref b64_data) = event.data {
            if !b64_data.is_empty() {
                if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64_data) {
                    audio_buf.extend_from_slice(&decoded);
                }
            }
        }

        // 提取用量（最后一个事件包含 usage.text_words）
        if let Some(ref usage) = event.usage {
            if let Some(tw) = usage.text_words {
                text_words = Some(tw);
            }
        }
    }

    if audio_buf.is_empty() {
        return Err("火山 TTS 未返回音频数据".to_string());
    }

    // 优先使用上游返回的 text_words，否则回落到请求文本字符数
    let final_chars = text_words.unwrap_or(fallback_chars);
    Ok((audio_buf, final_chars))
}

/// 检查火山 TTS V3 SSE 或 Chunked 响应体文本中是否包含错误事件。
/// 如果包含，返回代表错误的原始 JSON 字符串（原生响应结构）。
fn detect_volcengine_tts_error(body_text: &str) -> Option<String> {
    for line in body_text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let json_str = if line.starts_with("data: ") {
            &line[6..]
        } else if line.starts_with("data:") {
            &line[5..]
        } else {
            line
        };

        if let Ok(event) = serde_json::from_str::<VolcTtsEvent>(json_str) {
            // 兼容多种成功/完成码：0=数据块成功, 3000=文档标注成功, 20000000=流结束确认
            if event.code != 0 && event.code != 3000 && event.code != 20000000 {
                return Some(json_str.to_string());
            }
        }
    }
    None
}

/// 记录火山 TTS 错误日志（502）并执行退费结算
async fn record_volcengine_tts_error(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &crate::models::Channel,
    model: &str,
    pre_deduction: f64,
    pre_deduct_gift: f64,
    ep: &str,
    err_msg: &str,
    latency_ms: u32,
    request_content_str: &str,
    raw_response: &str,
    upstream_body_str: &str,
    pending_log_id: Option<i64>,
    db_model: Option<&crate::models::Model>,
) {
    let status_code = proxy::infer_error_status_code_from_str(err_msg);
    proxy::record_and_bill_inner(proxy::BillRecord {
        state: state,
        token: token,
        channel: channel,
        model: model,
        prompt_tokens: 0,
        completion_tokens: 0,
        cached_tokens: 0,
        cost: 0.0,
        pre_deducted: pre_deduction,
        pre_deduct_gift: pre_deduct_gift,
        status_code: status_code,
        endpoint: ep,
        error_msg: Some(err_msg),
        latency_ms: latency_ms,
        is_stream: 0,
        request_content: Some(request_content_str.to_string()),
        response_content: Some(raw_response.to_string()),
        upstream_req_content: Some(upstream_body_str.to_string()),
        billing_detail: None,
        hint_category: Some(
            db_model
                .and_then(|m| m.type_name.as_deref())
                .unwrap_or("音频"),
        ),
        pending_log_id: pending_log_id,
        billing_model_hint: None,
        plugin_tag: None,
        db_model: db_model,
    })
    .await;
}
