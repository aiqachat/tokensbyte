//! Relay: POST /v1/video/generations & GET /v1/video/generations/{task_id}
//! OpenAI-compatible video generation task endpoints with forward-rule-driven protocol adaptation.

use axum::{extract::{State, Extension, Path, Query, OriginalUri}, response::Response, Json};
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
    OriginalUri(uri): OriginalUri,
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
    let model = body["model"].as_str()
        .or_else(|| body["model_name"].as_str())
        .ok_or_else(|| AppError::BadRequest(
            "Missing required parameter: model".to_string()
        ))?;
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;
    let pre_deduction = proxy::check_access(&state, &token, model, ctx.balance, Some("视频")).await?;
    let (channel, resolved_model) = proxy::select_channel_for_model(&state, &token, model, &ctx.user_group, &ctx.level_id, &entry_path).await?;

    // 解析转发规则
    let mut resolved = match forward::resolve_forward_rule(&state, model, "视频", &entry_path).await {
        Some(r) => r,
        None => {
            if forward::model_has_forward_rules(&state, model).await {
                return Err(AppError::BadRequest(format!(
                    "模型 '{}' 不支持当前接口，请检查模型对应的转发规则", model
                )));
            }
            forward::infer_forward_from_base_url(&channel.base_url, "视频")
        }
    };

    let mut upstream_body = forward::transform_request_body(&resolved, &resolved_model, &body, "视频");
    // 可灵动态路径：根据请求体内容调整实际端点（text2video/image2video/multi-image2video）
    forward::resolve_kling_dynamic_path(&mut resolved, &upstream_body);
    let url = forward::build_upstream_url(&channel.base_url, &resolved, &resolved_model, &channel.api_key);
    let auth_headers = forward::build_auth_headers(&resolved, &channel.api_key);

    // 素材转换：当规则启用 asset_convert 时，将 content 中的网络 URL 转换为素材 ID
    let mut asset_convert_log: Option<String> = None;
    let is_asset_convert_req = body.get("asset_convert").and_then(|v| v.as_bool()).unwrap_or(false);
    if resolved.asset_convert || is_asset_convert_req {
        let (convert_logs, convert_errors) = super::asset_convert::convert_content_urls(&state, &token.user_id, &mut upstream_body).await;
        if !convert_logs.is_empty() {
            asset_convert_log = Some(format!("素材转换: {}", convert_logs.join(" | ")));
        }
        // 素材转换失败时直接拦截，不再继续调用上游接口
        if !convert_errors.is_empty() {
            let full_err = convert_errors.join("; ");
            // 提取火山引擎错误中的 Message 字段作为用户可读信息
            let user_msg = convert_errors.iter()
                .filter_map(|e| e.find('{').and_then(|i| serde_json::from_str::<serde_json::Value>(&e[i..]).ok())
                    .and_then(|j| j.pointer("/ResponseMetadata/Error/Message").or_else(|| j.pointer("/Error/Message"))
                        .and_then(|v| v.as_str()).map(|s| s.to_string())))
                .next()
                .unwrap_or_else(|| full_err.clone());
            let latency_ms = start_time.elapsed().as_millis() as u32;
            let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));
            proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0, 0.0, 400,
                &ep, Some(&full_err), latency_ms, 0,
                Some(request_content_str.clone()), None, Some(upstream_body.to_string()), asset_convert_log.clone()).await;
            return Err(AppError::BadRequest(format!("素材转换失败: {}", user_msg)));
        }
    }

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
        let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));
        proxy::record_and_bill(&state, &token, channel.id, model, 0, 0, 0, 0.0, status,
            &ep, Some(&display_err), latency_ms, 0,
            Some(request_content_str.clone()), Some(err), Some(upstream_body.to_string()), asset_convert_log.clone()).await;
        return Err(AppError::UpstreamError(display_err));
    }

    let db_model = proxy::find_active_model_exact(&state, model, Some("视频"), Some(&channel)).await;

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
    let ep = format!("{}|{}", raw_path, resolved.upstream_path.replace("${model}", &resolved_model));
    let billing_detail = if pre_deduction > 0.0 {
        if let Some(ref acl) = asset_convert_log {
            format!("异步任务预扣费冻结 | {}", acl)
        } else {
            "异步任务预扣费冻结".to_string()
        }
    } else {
        if let Some(ref acl) = asset_convert_log {
            format!("异步任务处理中(冻结) | {}", acl)
        } else {
            "异步任务处理中(冻结)".to_string()
        }
    };
    proxy::record_and_bill_with_category(&state, &token, channel.id, model, 0, 0, 0, pre_deduction, pre_deduction, 200,
        &ep, None, latency_ms, 0,
        Some(request_content_str), Some(response_content_str), Some(upstream_body.to_string()), Some(billing_detail), Some("视频")).await;

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
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 从日志中查找原始渠道信息
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content, COALESCE(request_content, ''), billing_detail, COALESCE(billing_features, '') FROM logs WHERE response_content LIKE ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;
    let mut original_request: Option<String> = None;
    let mut billing_features_str: Option<String> = None;
    let mut already_billed = false;
    let log_row: Option<(i64, i64, String, String, String, Option<String>, String)> = sqlx::query_as(&log_query)
        .bind(format!("%{}%", task_id))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, _, req_content, b_detail, bf_str)) = log_row {
        db_log_id = Some(l_id);
        model_name = m_name;
        if let Some(detail) = b_detail {
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

    // 模型名不可为空：查询参数和日志均无法确定模型时，直接拦截
    if model_name.is_empty() {
        return Err(AppError::BadRequest(
            "Missing model parameter and cannot infer from task_id".to_string()
        ));
    }

    let (channel, _) = if let Some(ch) = channel_opt {
        (ch, "".to_string())
    } else {
        proxy::select_channel_for_model(&state, &token, &model_name, &ctx.user_group, &ctx.level_id, "/v1/video/generations/{task_id}").await?
    };

    // 解析转发规则决定查询路径
    let resolved = match forward::resolve_forward_rule(&state, &model_name, "视频", "/v1/video/generations").await {
        Some(r) => r,
        None => forward::infer_forward_from_base_url(&channel.base_url, "视频")
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
        // 解析响应获取任务状态：兼容根节点、data 节点、final_result 节点、output.task_status（DashScope）
        let resp_json: serde_json::Value = serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));
        let raw_status = resp_json.get("status")
            .or_else(|| resp_json.get("data").and_then(|d| d.get("status")))
            .or_else(|| resp_json.get("data").and_then(|d| d.get("task_status")))
            .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
            .or_else(|| resp_json.get("output").and_then(|o| o.get("task_status")))
            .and_then(|s| s.as_str()).unwrap_or("");
        let task_status_str = raw_status.to_lowercase();
        let task_status = match task_status_str.as_str() {
            "completed" | "succeeded" | "succeed" | "success" => "succeeded",
            "failed" | "canceled" | "cancelled" | "unknown" => "failed",
            _ => task_status_str.as_str(),
        };

        // 更新日志响应内容
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
            .bind(&get_resp_str)
            .bind(log_id)
            .execute(&state.db.pool).await;

        // 任务完成时执行计费（统一交由 compute_cost 引擎处理）
        if task_status == "succeeded" && !already_billed {
            let usage = crate::relay::usage_extractor::parse_usage(&get_resp_str);
            let image_count = crate::relay::usage_extractor::count_response_images(&get_resp_str);

            let db_model = proxy::find_active_model_exact(&state, &model_name, Some("视频"), Some(&channel)).await;

            let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
                if let Some(rule_id) = m.billing_rule_id {
                    sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                        .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
                } else { None }
            } else { None };

            // 统一提取计费特征：优先从 billing_features 快照恢复（不依赖 request_content）
            let resp_features = crate::relay::usage_extractor::extract_request_features(&resp_json);
            let mut features = if let Some(ref bf_str) = billing_features_str {
                let mut f = serde_json::from_str::<crate::relay::usage_extractor::ExtractedFeatures>(bf_str)
                    .unwrap_or_default();
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
            if features.duration_seconds.is_none() {
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
                    // 1. 更新日志（无论 cost 是否为 0，都要写入计费明细以解除冻结状态）
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

                    tracing::info!("[Video Success Billing] log_id={}, model={}, cost={:.6}, pre_deducted={:.6}, applied={:.6}, url={}", 
                        log_id, model_name, cost, pre_deduction, apply_balance, url);
                }
                Err(e) => {
                    tracing::error!("[Video Billing] 启动事务失败: {:?}", e);
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
                    tracing::info!("[Video Failure Billing] log_id={} failed, refunded pre_deduction={:.6}, url={}", log_id, pre_deduction, url);
                }
                Err(e) => {
                    tracing::error!("[Video Failure Billing] 启动事务失败: {:?}", e);
                }
            }
        }
    }

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(get_resp_str))
        .unwrap())
}
