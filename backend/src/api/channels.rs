use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelSafe, ChannelListResponse};
use crate::error::AppResult;


pub async fn list_channels(
    State(state): State<Arc<AppState>>,
    claims: Option<axum::Extension<crate::auth::Claims>>,
) -> AppResult<Json<ChannelListResponse>> {
    let is_admin = claims.as_ref().map_or(false, |c| c.0.role == "admin");

    let channels: Vec<Channel> = sqlx::query_as(&state.db.format_query("SELECT * FROM channels ORDER BY status DESC, sort_order DESC, priority DESC, id DESC"))
        .fetch_all(&state.db.pool)
        .await?;

    let safe_channels: Vec<ChannelSafe> = channels.into_iter().map(|ch| ChannelSafe::from_with_role(ch, is_admin)).collect();
    let total = safe_channels.len() as i64;

    Ok(Json(ChannelListResponse { data: safe_channels, total }))
}

pub async fn create_channel(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateChannelRequest>,
) -> AppResult<Json<ChannelSafe>> {
    let models_json = serde_json::to_string(&request.models).unwrap_or_else(|_| "[]".to_string());
    let mapping_json = serde_json::to_string(&request.model_mapping.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let config_json = serde_json::to_string(&request.config.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let groups_json = serde_json::to_string(&request.user_groups.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    let exclude_groups_json = serde_json::to_string(&request.exclude_user_groups.unwrap_or_default()).unwrap_or_else(|_| "[]".to_string());
    
    // Auto-generate unique 4-digit group_aid
    let mut group_aid_val = String::new();
    use rand::Rng;
    for _ in 0..10 {
        let aid: u32 = rand::thread_rng().gen_range(1000..10000);
        let aid_str = aid.to_string();
        let exists: i64 = sqlx::query_scalar(&state.db.format_query("SELECT COUNT(*) FROM channels WHERE group_aid = ?"))
            .bind(&aid_str)
            .fetch_one(&state.db.pool)
            .await?;
        if exists == 0 {
            group_aid_val = aid_str;
            break;
        }
    }
    if group_aid_val.is_empty() {
        group_aid_val = rand::thread_rng().gen_range(1000..10000).to_string(); // fallback
    }

    let sql = r#"INSERT INTO channels (name, provider_type, base_url, api_key, models, model_mapping, user_groups, exclude_user_groups, group_aid, preset_id, pool_id, gptimage_pool_id, sort_order, priority, weight, status, max_rps, quota_limit, quota_used, config, rate)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?) RETURNING id"#;

    let id: i64 = sqlx::query_scalar::<_, i64>(&state.db.format_query(sql))
        .bind(&request.name)
        .bind(&request.provider_type)
        .bind(&request.base_url)
        .bind(&request.api_key)
        .bind(&models_json)
        .bind(&mapping_json)
        .bind(&groups_json)
        .bind(&exclude_groups_json)
        .bind(&group_aid_val)
        .bind(request.preset_id)
        .bind(request.pool_id)
        .bind(request.gptimage_pool_id)
        .bind(request.sort_order.unwrap_or(0))
        .bind(request.priority.unwrap_or(0))
        .bind(request.weight.unwrap_or(1))
        .bind(request.max_rps.unwrap_or(0))
        .bind(request.quota_limit.unwrap_or(-1.0))
        .bind(request.quota_used.unwrap_or(0.0))
        .bind(&config_json)
        .bind(request.rate)
        .fetch_one(&state.db.pool)
        .await?;

    let channel: Channel = sqlx::query_as(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(ChannelSafe::from_with_role(channel, true)))
}

pub async fn update_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateChannelRequest>,
) -> AppResult<Json<ChannelSafe>> {
    // Current channel for partial updates
    let mut channel: Channel = sqlx::query_as(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    if let Some(name) = request.name { channel.name = name; }
    if let Some(provider_type) = request.provider_type { channel.provider_type = provider_type; }
    if let Some(base_url) = request.base_url { channel.base_url = base_url; }
    if let Some(api_key) = request.api_key {
        // 【防护】空值或含脱敏标记的值不覆盖原始密钥
        if !api_key.is_empty() && !api_key.contains("******") {
            channel.api_key = api_key;
        }
    }
    if let Some(models) = request.models { channel.models = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(mapping) = request.model_mapping { channel.model_mapping = serde_json::to_string(&mapping).unwrap_or_else(|_| "{}".to_string()); }
    if let Some(user_groups) = request.user_groups { channel.user_groups = serde_json::to_string(&user_groups).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(exclude_user_groups) = request.exclude_user_groups { channel.exclude_user_groups = serde_json::to_string(&exclude_user_groups).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(group_aid) = request.group_aid { channel.group_aid = Some(group_aid); }
    if let Some(sort_order) = request.sort_order { channel.sort_order = sort_order; }
    if let Some(priority) = request.priority { channel.priority = priority; }
    if let Some(weight) = request.weight { channel.weight = weight; }
    if let Some(status) = request.status { channel.status = status; }
    if let Some(max_rps) = request.max_rps { channel.max_rps = Some(max_rps); }
    if let Some(quota_limit) = request.quota_limit { channel.quota_limit = quota_limit; }
    if let Some(quota_used) = request.quota_used { channel.quota_used = quota_used; }
    if let Some(config) = request.config { channel.config = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string()); }
    if let Some(rate) = request.rate { channel.rate = rate; }

    if let Some(pool_id) = request.pool_id {
        channel.pool_id = Some(pool_id);
        channel.preset_id = None;
        channel.gptimage_pool_id = None;
    } else if let Some(gptimage_pool_id) = request.gptimage_pool_id {
        channel.gptimage_pool_id = Some(gptimage_pool_id);
        channel.preset_id = None;
        channel.pool_id = None;
    } else if let Some(preset_id) = request.preset_id {
        channel.preset_id = Some(preset_id);
        channel.pool_id = None;
        channel.gptimage_pool_id = None;
    }

    let mut group_aid_val = channel.group_aid.clone().unwrap_or_default();
    if group_aid_val.is_empty() {
        use rand::Rng;
        for _ in 0..10 {
            let aid: u32 = rand::thread_rng().gen_range(1000..10000);
            let aid_str = aid.to_string();
            let exists: i64 = sqlx::query_scalar(&state.db.format_query("SELECT COUNT(*) FROM channels WHERE group_aid = ?"))
                .bind(&aid_str)
                .fetch_one(&state.db.pool)
                .await?;
            if exists == 0 {
                group_aid_val = aid_str;
                break;
            }
        }
        if group_aid_val.is_empty() {
            group_aid_val = rand::thread_rng().gen_range(1000..10000).to_string(); // fallback
        }
    }

    sqlx::query(
        &state.db.format_query(r#"UPDATE channels SET name = ?, provider_type = ?, base_url = ?, api_key = ?, models = ?, 
           model_mapping = ?, user_groups = ?, exclude_user_groups = ?, preset_id = ?, pool_id = ?, gptimage_pool_id = ?, sort_order = ?, priority = ?, weight = ?, status = ?, max_rps = ?, quota_limit = ?, quota_used = ?, config = ?, group_aid = ?, rate = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
    )
    .bind(&channel.name)
    .bind(&channel.provider_type)
    .bind(&channel.base_url)
    .bind(&channel.api_key)
    .bind(&channel.models)
    .bind(&channel.model_mapping)
    .bind(&channel.user_groups)
    .bind(&channel.exclude_user_groups)
    .bind(channel.preset_id)
    .bind(channel.pool_id)
    .bind(channel.gptimage_pool_id)
    .bind(channel.sort_order)
    .bind(channel.priority)
    .bind(channel.weight)
    .bind(channel.status)
    .bind(channel.max_rps)
    .bind(channel.quota_limit)
    .bind(channel.quota_used)
    .bind(&channel.config)
    .bind(&group_aid_val)
    .bind(channel.rate)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    if !group_aid_val.is_empty() {
        sqlx::query(&state.db.format_query("UPDATE channels SET sort_order = ? WHERE group_aid = ? AND id != ?"))
            .bind(channel.sort_order)
            .bind(&group_aid_val)
            .bind(id)
            .execute(&state.db.pool)
            .await
            .ok();
    }

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(ChannelSafe::from_with_role(channel, true)))
}

pub async fn delete_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(&state.db.format_query("DELETE FROM channels WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    crate::api::plugins::notify_marketplace_data_changed(&state).await;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub async fn test_channel(
    State(state): State<Arc<AppState>>,
    options_claims: Option<axum::Extension<crate::auth::Claims>>,
    Path(id): Path<i64>,
    Json(req): Json<crate::models::TestChannelRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let mut channel: Channel = sqlx::query_as(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    if channel.quota_limit >= 0.0 && channel.quota_used >= channel.quota_limit {
        return Err(crate::error::AppError::Forbidden("该渠道可用额度已耗尽，处于熔断状态，测试请求被拦截".to_string()));
    }

    if let Some(pid) = channel.preset_id {
        let preset: Option<crate::models::ChannelConfig> = sqlx::query_as(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
            .bind(pid)
            .fetch_optional(&state.db.pool).await?;
        if let Some(p) = preset {
            channel.base_url = p.base_url;
            channel.api_key = p.api_key;
        }
    }

    let test_model = if let Some(m) = req.model {
        m
    } else {
        let model_mids = channel.get_models();
        if !model_mids.is_empty() {
            // models 存储的是 mid，需要反查 model_id
            let mid = &model_mids[0];
            let model_id: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT model_id FROM models WHERE mid = ?"))
                .bind(mid)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None);
            model_id.unwrap_or_else(|| mid.clone())
        } else {
            "gpt-3.5-turbo".to_string()
        }
    };

    // 计算映射后的上游模型 ID
    let (resolved_model, _) = crate::relay::router::resolve_model(&channel, &test_model, None);

    // ── 处理卡池逻辑 ──
    #[cfg(feature = "commercial_plugins")]
    if let Some(pool_id) = channel.pool_id {
        if let Some(account) = crate::services::volcengine_pool::select_account(&state, pool_id, &test_model).await {
            channel.api_key = account.api_key;
            channel.base_url = account.base_url;
        } else {
            return Err(crate::error::AppError::BadRequest("该渠道绑定了火山卡池，但当前无可用的卡池账号用于测试".to_string()));
        }
    }

    let start = std::time::Instant::now();

    // ── 获取该测试模型关联的计费规则（复用 relay 模块已有的模型查找逻辑） ──
    let db_model = crate::relay::proxy::find_active_model_exact(&state, &test_model, None, Some(&channel)).await;
    let db_rule: Option<crate::models::BillingRule> = match db_model.as_ref().and_then(|m| m.billing_rule_id) {
        Some(rule_id) => sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
            .bind(rule_id).fetch_optional(&state.db.pool).await.unwrap_or(None),
        None => None,
    };

    // ── 解析转发规则 ──
    let mut resolved: Option<crate::relay::forward::ResolvedForward> = None;
    let mut category = "聊天".to_string();
    let mut rule_is_stream = false;
    let mut db_forward_rule: Option<crate::models::ForwardRule> = None;

    if let Some(fid) = req.forward_rule_id {
        let rule: Option<crate::models::ForwardRule> = sqlx::query_as(&state.db.format_query("SELECT * FROM forward_rules WHERE id = ?"))
            .bind(fid)
            .fetch_optional(&state.db.pool).await?;
        if let Some(r) = rule {
            category = r.category.clone();
            if r.name.contains("流式") || r.name.to_lowercase().contains("stream") {
                rule_is_stream = true;
            }
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&r.config_json) {
                let target_type = config.get("target_type").and_then(|v| v.as_str()).unwrap_or("openai").to_string();
                let upstream_path = config.get("path_rewrite")
                    .and_then(|pr| pr.get("new"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("/v1/chat/completions")
                    .to_string();
                let auth_type = config.get("auth_type").and_then(|v| v.as_str()).unwrap_or("bearer").to_string();
                resolved = Some(crate::relay::forward::ResolvedForward { target_type, upstream_path, auth_type, asset_convert: false, asset_convert_ns: "asset_manager".to_string(), poll_path: None, asset_moderation: false, eid: r.eid.clone() });
            }
            db_forward_rule = Some(r);
        }
    }

    let fwd = resolved.unwrap_or_else(|| crate::relay::forward::default_openai_forward("/v1/chat/completions"));
    let is_image = category == "图片";
    let is_video = category == "视频";

    // ── 构建测试请求体（入参依然使用原本的模型 ID：test_model） ──
    let openai_body = if is_image {
        serde_json::json!({"model": test_model, "prompt": "Draw a picture of a cute white cat. 请画一只可爱的白色小猫。", "n": 1})
    } else if is_video {
        serde_json::json!({"model": test_model, "prompt": "A short video of a cute white cat walking"})
    } else {
        let st = rule_is_stream || fwd.upstream_path.contains("stream");
        serde_json::json!({"model": test_model, "messages": [{"role": "user", "content": "hi"}], "stream": st, "max_tokens": 5})
    };

    let mut request_data: serde_json::Value = crate::relay::forward::transform_request_body(&fwd, &resolved_model, &openai_body, &category, None, None).await;

    // ── 构建 URL ──
    let endpoint = crate::relay::forward::build_upstream_url(&channel.base_url, &fwd, &resolved_model, &channel.api_key);

    // ── 发送请求（统一鉴权 + 设置请求体：覆盖所有厂商包括腾讯云 TC3 签名）──
    let builder = state.http_client.post(&endpoint).header("Content-Type", "application/json");
    let builder = crate::relay::forward::apply_request_auth(builder, &fwd, &channel.api_key, &mut request_data, &channel.base_url);

    // ── 生成 cURL 命令（在 apply_request_auth 之后，确保 body 包含可能注入的 SubAppId 等字段）──
    let masked_endpoint = crate::relay::forward::mask_key_in_string(&endpoint, &channel.api_key);
    let auth_headers_for_curl = crate::relay::forward::build_auth_headers(&fwd, &channel.api_key);
    let mut curl_cmd = format!("curl -X POST '{}' \\\n", masked_endpoint);
    curl_cmd.push_str("  -H 'Content-Type: application/json' \\\n");
    for (k, v) in &auth_headers_for_curl {
        let masked_v = crate::relay::forward::mask_key_in_string(v, &channel.api_key);
        curl_cmd.push_str(&format!("  -H '{}: {}' \\\n", k, masked_v));
    }
    let request_json = serde_json::to_string(&request_data).unwrap_or_default();
    curl_cmd.push_str(&format!("  -d '{}'", request_json.replace("'", "\\'")));

    let raw_response_text;
    let response_res: Result<serde_json::Value, crate::error::AppError> = match builder.send().await {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let text = r.text().await.unwrap_or_default();
                raw_response_text = text.clone();
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(v) => Ok(v),
                    Err(_) => Ok(serde_json::json!({"status": "success", "raw": text.chars().take(500).collect::<String>()}))
                }
            } else {
                let status_val = status.as_u16();
                let err_body = r.text().await.unwrap_or_default();
                raw_response_text = err_body.clone();
                let upstream_json = serde_json::from_str::<serde_json::Value>(&err_body)
                    .unwrap_or_else(|_| serde_json::json!({"raw_error": err_body}));
                Ok(serde_json::json!({"_upstream_status": status_val, "_upstream_error": upstream_json}))
            }
        },
        Err(e) => {
            raw_response_text = format!("{{\"connection_error\":\"{}\"}}", e.to_string().replace('"', "\\\""));
            Ok(serde_json::json!({"_upstream_status": 0, "_upstream_error": {"connection_error": e.to_string()}}))
        }
    };

    // ── 响应格式转换（与 relay 保持一致，确保 task_id 可被正确提取）──
    let response_content_for_log = if fwd.target_type.starts_with("tencent_vod") {
        let object_type = if is_image { "image.generation" } else { "video.generation" };
        let (converted, _) = crate::relay::task::convert_tencent_post_response(&raw_response_text, object_type);
        converted
    } else {
        raw_response_text
    };

    // ── 记录日志（字段与 relay 模块对齐，确保后续功能正常读取）──
    let latency_ms = start.elapsed().as_millis() as i32;
    let mut status_code = 200;
    let mut p_tokens = 0;
    let mut c_tokens = 0;
    let mut err_msg: Option<String> = None;

    match &response_res {
        Ok(v) => {
            if v.get("_upstream_error").is_some() {
                status_code = v.get("_upstream_status").and_then(|s| s.as_i64()).unwrap_or(502) as i32;
                err_msg = Some(serde_json::to_string(&v["_upstream_error"]).unwrap_or_default());
            } else if let Some(usage) = v.get("usage") {
                p_tokens = usage.get("prompt_tokens").and_then(|t| t.as_i64()).unwrap_or(0) as i32;
                c_tokens = usage.get("completion_tokens").and_then(|t| t.as_i64()).unwrap_or(0) as i32;
            }
        },
        Err(e) => { status_code = 500; err_msg = Some(e.to_string()); }
    }

    let user_id_str = match &options_claims {
        Some(axum::Extension(c)) => c.sub.clone(),
        None => "0".to_string(),
    };

    // endpoint 格式与 relay 一致: "入口|上游路径"，便于正确推断类别
    let ep = format!("test|{}", fwd.upstream_path.replace("${model}", &resolved_model));
    let openai_body_str = serde_json::to_string(&openai_body).unwrap_or_default();
    let task_id = crate::relay::task::extract_task_id(&response_content_for_log).unwrap_or_default();

    // ── 预先计算渠道测试的计费明细依据（但不扣费） ──
    let preview_usage = crate::relay::usage_extractor::UsageTokens { prompt: p_tokens, completion: c_tokens, total: 0, cached: 0, cache_creation: 0, audio_tokens: 0, audio_cached_tokens: 0, image_tokens: 0 };
    let (_, calc_detail) = crate::relay::compute_cost(
        db_model.as_ref(), db_rule.as_ref(), &preview_usage, 1.0,
        &crate::relay::usage_extractor::ExtractedFeatures::default(),
    );
    let billing_detail = format!("[测试渠道，不扣费] {}", calc_detail);
    let billing_pid = db_rule.as_ref().map(|r| r.pid.clone());
    let forward_eid = db_forward_rule.as_ref().map(|r| r.eid.clone());

    // ── 存入日志前对内容进行 base64 脱敏（复用 relay 模块统一脱敏逻辑） ──
    let sanitized_req = crate::relay::proxy::sanitize_base64(&openai_body_str);
    let sanitized_resp = crate::relay::proxy::sanitize_base64(&response_content_for_log);
    let sanitized_upstream_req = crate::relay::proxy::sanitize_base64(&request_json);

    // INSERT 返回 log_id，供轮询完成后更新终态结果
    let log_id = sqlx::query_scalar::<_, i64>(&state.db.format_query(
        "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, \
         cost, latency_ms, status_code, endpoint, error_message, upstream_url, \
         request_content, response_content, upstream_req_content, billing_detail, action_type, task_id, \
         billing_pid, forward_eid) \
         VALUES (?, ?, 0, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
    ))
        .bind(&user_id_str).bind(id).bind(&test_model)
        .bind(p_tokens).bind(c_tokens).bind(latency_ms)
        .bind(status_code).bind(&ep).bind(&err_msg).bind(&masked_endpoint)
        .bind(&sanitized_req).bind(&sanitized_resp)
        .bind(&sanitized_upstream_req).bind(&billing_detail).bind(&category).bind(&task_id)
        .bind(billing_pid).bind(forward_eid)
        .fetch_optional(&state.db.pool).await.unwrap_or(None);

    // ── 异步任务自动轮询（统一支持所有厂商：火山/腾讯云/DashScope/可灵等）──
    let mut response_res = response_res;
    if !task_id.is_empty() && (is_image || is_video) && status_code == 200 {
        if let Some((final_body, _final_status)) = crate::relay::task::poll_task_result(
            &state.http_client, &channel, &fwd, &task_id, &resolved_model, &category, 90, None,
        ).await {
            // 更新日志响应内容为终态结果（同样脱敏 base64）
            if let Some(lid) = log_id {
                let sanitized_final = crate::relay::proxy::sanitize_base64(&final_body);
                let _ = sqlx::query(&state.db.format_query("UPDATE logs SET response_content = ? WHERE id = ?"))
                    .bind(&sanitized_final).bind(lid)
                    .execute(&state.db.pool).await;
            }
            // 更新前端展示的响应数据为终态结果
            response_res = match serde_json::from_str::<serde_json::Value>(&final_body) {
                Ok(v) => Ok(v),
                Err(_) => Ok(serde_json::json!({"raw": final_body.chars().take(500).collect::<String>()}))
            };
        }
    }

    // ── 返回结果 ──
    match response_res {
        Ok(response_value) => {
            let is_upstream_err = response_value.get("_upstream_error").is_some();
            if is_upstream_err {
                let upstream_status = response_value.get("_upstream_status").and_then(|s| s.as_i64()).unwrap_or(0);
                Ok(Json(serde_json::json!({
                    "success": false, "err_msg": format!("上游返回 HTTP {}", upstream_status),
                    "latency": latency_ms, "channel_id": id, "curl_command": curl_cmd,
                    "request_data": request_data, "response_data": response_value,
                })))
            } else {
                Ok(Json(serde_json::json!({
                    "success": true, "latency": latency_ms, "channel_id": id,
                    "curl_command": curl_cmd, "request_data": request_data, "response_data": response_value,
                })))
            }
        },
        Err(e) => {
            let err_str = e.to_string();
            Ok(Json(serde_json::json!({
                "success": false, "err_msg": err_str.clone(), "latency": latency_ms,
                "channel_id": id, "curl_command": curl_cmd, "request_data": request_data,
                "response_data": { "error": err_str },
            })))
        }
    }
}
