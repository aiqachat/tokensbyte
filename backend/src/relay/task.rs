//! Relay: GET /v1/tasks/{task_id}?model=xxx
//! 通用异步任务轮询网关，支持视频、图片等带有 task_id 的模型轮询。

use axum::{extract::{State, Extension, Path, Query}, response::Response};
use std::sync::Arc;
use std::collections::HashMap;
use crate::{AppState, error::{AppError, AppResult}};
use crate::models::ApiToken;
use super::{proxy, forward};
use super::url_utils::join_url;

/// GET /v1/tasks/{task_id}?model=xxx — Query task status (Generic for images/videos)
pub async fn task_status(
    State(state): State<Arc<AppState>>,
    Extension(token): Extension<ApiToken>,
    Path(task_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    let mut model_name = params.get("model").map(|s| s.as_str()).unwrap_or("").to_string();
    let ctx = proxy::get_user_context(&state, &token.user_id).await?;

    // 从日志中查找原始渠道信息
    let log_query = state.db.format_query("SELECT id, channel_id, model, response_content, COALESCE(request_content, ''), billing_detail FROM logs WHERE response_content LIKE ? ORDER BY id DESC LIMIT 1");
    let mut db_log_id: Option<i64> = None;
    let mut original_request: Option<String> = None;
    let mut already_billed = false;
    // 转义 LIKE 通配符，防止 task_id 中含 % 或 _ 导致误匹配
    let escaped_id = task_id.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let log_row: Option<(i64, i64, String, String, String, Option<String>)> = sqlx::query_as(&log_query)
        .bind(format!("%{}%", escaped_id))
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

    let channel_opt: Option<crate::models::Channel> = if let Some((l_id, cid, m_name, _, req_content, b_detail)) = log_row {
        db_log_id = Some(l_id);
        if model_name.is_empty() {
            model_name = m_name;
        }
        if let Some(ref detail) = b_detail {
            if !detail.is_empty() && !detail.contains("冻结") {
                already_billed = true;
            }
        }
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

    if model_name.is_empty() {
        return Err(AppError::BadRequest("Missing model parameter and cannot infer from task_id".to_string()));
    }

    let (channel, _) = if let Some(ch) = channel_opt {
        (ch, "".to_string())
    } else {
        proxy::select_channel_for_model(&state, &token, &model_name, &ctx.user_group, "/v1/tasks/{task_id}").await?
    };

    // 查询模型类别以推断 forward rule
    let category: String = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT COALESCE(t.name, '') FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             WHERE m.model_id = ? LIMIT 1"
        )
    ).bind(&model_name).fetch_optional(&state.db.pool).await
        .unwrap_or(None).unwrap_or_default();

    let default_entry = match category.as_str() {
        "视频" => "/v1/video/generations",
        "图片" => "/v1/images/generations",
        _ => "/v1/tasks",
    };

    // 解析转发规则决定查询路径
    let resolved = forward::resolve_forward_rule(&state, &model_name, &category, default_entry)
        .await;

    let url = if let Some(ref r) = resolved {
        if r.target_type == "volcengine" {
            join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id))
        } else if let Some(ref custom_path) = r.poll_path {
            let path = custom_path.replace("${task_id}", &task_id).replace("${model}", &model_name);
            join_url(&channel.base_url, &path)
        } else {
            // 从 upstream_path 派生轮询路径
            let path = r.upstream_path.replace("${model}", &model_name);
            join_url(&channel.base_url, &format!("{}/{}", path.trim_end_matches('/'), task_id))
        }
    } else {
        // 无转发规则时按类别回落
        match category.as_str() {
            "视频" => join_url(&channel.base_url, &format!("/v1/video/generations/{}", task_id)),
            _ => join_url(&channel.base_url, &format!("/v1/tasks/{}", task_id)),
        }
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
        // 解析响应获取任务状态：兼容根节点、data 节点、final_result 节点
        let resp_json: serde_json::Value = serde_json::from_str(&get_resp_str).unwrap_or(serde_json::json!({}));
        let raw_status = resp_json.get("status")
            .or_else(|| resp_json.get("data").and_then(|d| d.get("status")))
            .or_else(|| resp_json.get("final_result").and_then(|fr| fr.get("status")))
            .and_then(|s| s.as_str()).unwrap_or("");
        // 某些上游（如图片异步 API）用 "completed" 表示成功，统一归一化
        let task_status = match raw_status {
            "completed" | "succeeded" => "succeeded",
            "failed" => "failed",
            other => other,
        };

        // 更新日志响应内容
        let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
            .bind(&get_resp_str)
            .bind(log_id)
            .execute(&state.db.pool).await;

        // 任务完成时执行计费
        if task_status == "succeeded" && !already_billed {
            let usage = crate::relay::usage_extractor::parse_usage(&get_resp_str);
            let image_count = crate::relay::usage_extractor::count_response_images(&get_resp_str);

            let db_model: Option<crate::models::Model> = sqlx::query_as(
                &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
            ).bind(&model_name).fetch_optional(&state.db.pool).await.unwrap_or(None);

            let db_rule: Option<crate::models::BillingRule> = if let Some(ref m) = db_model {
                if let Some(rule_id) = m.billing_rule_id {
                    sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                        .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
                } else { None }
            } else { None };

            // 统一提取计费特征，交由 compute_cost 引擎根据模型绑定的计费规则决定如何计费
            let mut features = crate::relay::usage_extractor::extract_request_features(&resp_json);
            if let Some(ref req_str) = original_request {
                if let Ok(req_json) = serde_json::from_str::<serde_json::Value>(req_str) {
                    let req_feat = crate::relay::usage_extractor::extract_request_features(&req_json);
                    if features.resolution.is_none() { features.resolution = req_feat.resolution; }
                    if features.duration_seconds.is_none() { features.duration_seconds = req_feat.duration_seconds; }
                    if req_feat.has_video { features.has_video = true; }
                    if req_feat.has_audio { features.has_audio = true; }
                    if features.service_tier.is_none() { features.service_tier = req_feat.service_tier; }
                }
            }
            // 视频 duration 兜底
            if category == "视频" && features.duration_seconds.is_none() {
                features.duration_seconds = Some(5.0);
            }
            if let Some(resp_count) = image_count {
                features.image_count = Some(resp_count);
            }

            let (final_discount, discount_source) = crate::relay::proxy::resolve_discount(db_model.as_ref(), ctx.discount);
            let (cost, mut detail) = crate::relay::compute_cost(db_model.as_ref(), db_rule.as_ref(), usage.prompt, usage.completion, usage.cached, final_discount, &features);
            detail.push_str(&format!(" | {}", discount_source));
            let resolved_model = channel.resolve_model(&model_name);
            if model_name != resolved_model {
                detail.push_str(&format!(" | 模型映射: {} ➞ {}", model_name, resolved_model));
            }

            let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);
            let apply_balance = cost - pre_deduction;

            // 更新日志（无论 cost 是否为 0，都要写入计费明细以解除冻结状态）
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?, cost = ?, billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
            )).bind(usage.prompt).bind(usage.completion).bind(usage.cached).bind(cost).bind(detail).bind(log_id)
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

                tracing::info!("[Task Status Billing] task={}, model={}, tokens={}, cost={:.6}, pre_deducted={:.6}", 
                    task_id, model_name, usage.total, cost, pre_deduction);
            }
        } else if task_status == "failed" && !already_billed {
            let pre_deduction = sqlx::query_scalar::<_, f64>(&state.db.format_query("SELECT pre_deduction FROM models WHERE model_id = ? AND is_active = 1"))
                .bind(&model_name).fetch_optional(&state.db.pool).await.unwrap_or(None).unwrap_or(0.0);

            if pre_deduction > 0.0 {
                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE users SET balance = balance + ?, used_quota = used_quota - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )).bind(pre_deduction).bind(pre_deduction).bind(&token.user_id)
                .execute(&state.db.pool).await;

                let _ = sqlx::query(&state.db.format_query(
                    "UPDATE api_tokens SET quota_used = quota_used - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                )).bind(pre_deduction).bind(token.id)
                .execute(&state.db.pool).await;
            }

            let detail = if pre_deduction > 0.0 { "任务失败，预扣费已退回" } else { "任务失败，该模型无预扣费" };
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE logs SET billing_detail = ?, latency_ms = CAST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at::timestamptz)) * 1000 AS INTEGER) WHERE id = ?"
            )).bind(detail).bind(log_id)
            .execute(&state.db.pool).await;

            tracing::info!("[Task Status Billing] task={} failed, model={}, refunded pre_deduction={:.6}", task_id, model_name, pre_deduction);
        }
    }

    Ok(Response::builder()
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(get_resp_str))
        .unwrap())
}
