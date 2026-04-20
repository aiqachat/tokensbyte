use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelSafe, ChannelListResponse};
use crate::error::AppResult;
use crate::relay::url_utils::join_url;

pub async fn list_channels(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<ChannelListResponse>> {
    let channels: Vec<Channel> = sqlx::query_as(&state.db.format_query("SELECT * FROM channels ORDER BY priority DESC"))
        .fetch_all(&state.db.pool)
        .await?;

    let safe_channels: Vec<ChannelSafe> = channels.into_iter().map(ChannelSafe::from).collect();
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

    let sql = r#"INSERT INTO channels (name, provider_type, base_url, api_key, models, model_mapping, user_groups, group_aid, preset_id, priority, weight, status, max_rps, quota_limit, quota_used, config)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) RETURNING id"#;

    let id: i64 = sqlx::query_scalar::<_, i64>(&state.db.format_query(sql))
        .bind(&request.name)
        .bind(&request.provider_type)
        .bind(&request.base_url)
        .bind(&request.api_key)
        .bind(&models_json)
        .bind(&mapping_json)
        .bind(&groups_json)
        .bind(&group_aid_val)
        .bind(request.preset_id)
        .bind(request.priority.unwrap_or(0))
        .bind(request.weight.unwrap_or(1))
        .bind(request.max_rps.unwrap_or(0))
        .bind(request.quota_limit.unwrap_or(-1.0))
        .bind(request.quota_used.unwrap_or(0.0))
        .bind(&config_json)
        .fetch_one(&state.db.pool)
        .await?;

    let channel: Channel = sqlx::query_as(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(id)
        .fetch_one(&state.db.pool)
        .await?;

    Ok(Json(ChannelSafe::from(channel)))
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
    if let Some(api_key) = request.api_key { channel.api_key = api_key; }
    if let Some(models) = request.models { channel.models = serde_json::to_string(&models).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(mapping) = request.model_mapping { channel.model_mapping = serde_json::to_string(&mapping).unwrap_or_else(|_| "{}".to_string()); }
    if let Some(user_groups) = request.user_groups { channel.user_groups = serde_json::to_string(&user_groups).unwrap_or_else(|_| "[]".to_string()); }
    if let Some(group_aid) = request.group_aid { channel.group_aid = Some(group_aid); }
    if let Some(preset_id) = request.preset_id { channel.preset_id = Some(preset_id); }
    if let Some(priority) = request.priority { channel.priority = priority; }
    if let Some(weight) = request.weight { channel.weight = weight; }
    if let Some(status) = request.status { channel.status = status; }
    if let Some(max_rps) = request.max_rps { channel.max_rps = Some(max_rps); }
    if let Some(quota_limit) = request.quota_limit { channel.quota_limit = quota_limit; }
    if let Some(quota_used) = request.quota_used { channel.quota_used = quota_used; }
    if let Some(config) = request.config { channel.config = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string()); }

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
           model_mapping = ?, user_groups = ?, preset_id = ?, priority = ?, weight = ?, status = ?, max_rps = ?, quota_limit = ?, quota_used = ?, config = ?, group_aid = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
    )
    .bind(&channel.name)
    .bind(&channel.provider_type)
    .bind(&channel.base_url)
    .bind(&channel.api_key)
    .bind(&channel.models)
    .bind(&channel.model_mapping)
    .bind(&channel.user_groups)
    .bind(channel.preset_id)
    .bind(channel.priority)
    .bind(channel.weight)
    .bind(channel.status)
    .bind(channel.max_rps)
    .bind(channel.quota_limit)
    .bind(channel.quota_used)
    .bind(&channel.config)
    .bind(&group_aid_val)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(ChannelSafe::from(channel)))
}

pub async fn delete_channel(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(&state.db.format_query("DELETE FROM channels WHERE id = ?"))
        .bind(id)
        .execute(&state.db.pool)
        .await?;

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

    let test_model = req.model.unwrap_or_else(|| {
        let models = channel.get_models();
        if !models.is_empty() { models[0].clone() } else { "gpt-3.5-turbo".to_string() }
    });

    let start = std::time::Instant::now();

    // ── 解析转发规则 ──
    let mut resolved: Option<crate::relay::forward::ResolvedForward> = None;
    let mut category = "聊天".to_string();
    let mut rule_is_stream = false;

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
                resolved = Some(crate::relay::forward::ResolvedForward { target_type, upstream_path, auth_type });
            }
        }
    }

    let fwd = resolved.unwrap_or_else(|| crate::relay::forward::default_openai_forward("/v1/chat/completions"));
    let is_image = category == "图片";
    let is_video = category == "视频";

    // ── 构建测试请求体 ──
    let openai_body = if is_image {
        serde_json::json!({"model": test_model, "prompt": "Draw a picture of a cute white cat. 请画一只可爱的白色小猫。", "n": 1})
    } else if is_video {
        serde_json::json!({"model": test_model, "prompt": "A short video of a cute white cat walking"})
    } else {
        let st = rule_is_stream || fwd.upstream_path.contains("stream");
        serde_json::json!({"model": test_model, "messages": [{"role": "user", "content": "hi"}], "stream": st, "temperature": 0.0, "max_tokens": 5})
    };

    let request_data = crate::relay::forward::transform_request_body(&fwd, &test_model, &openai_body, &category);

    // ── 构建 URL 和鉴权 ──
    let endpoint = crate::relay::forward::build_upstream_url(&channel.base_url, &fwd, &test_model, &channel.api_key);
    let auth_headers = crate::relay::forward::build_auth_headers(&fwd, &channel.api_key);

    // ── 生成 cURL 命令 ──
    let masked_endpoint = crate::relay::forward::mask_key_in_string(&endpoint, &channel.api_key);
    let _masked_key = if channel.api_key.len() > 8 {
        format!("{}******{}", &channel.api_key[..4], &channel.api_key[channel.api_key.len()-4..])
    } else { "******".to_string() };

    let mut curl_cmd = format!("curl -X POST '{}' \\\n", masked_endpoint);
    curl_cmd.push_str("  -H 'Content-Type: application/json' \\\n");
    for (k, v) in &auth_headers {
        let masked_v = crate::relay::forward::mask_key_in_string(v, &channel.api_key);
        curl_cmd.push_str(&format!("  -H '{}: {}' \\\n", k, masked_v));
    }
    let request_json = serde_json::to_string(&request_data).unwrap_or_default();
    curl_cmd.push_str(&format!("  -d '{}'", request_json.replace("'", "\\'")));

    // ── 发送请求 ──
    let mut builder = state.http_client.post(&endpoint).header("Content-Type", "application/json");
    for (k, v) in &auth_headers {
        builder = builder.header(k, v);
    }

    let response_res: Result<serde_json::Value, crate::error::AppError> = match builder.json(&request_data).send().await {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                let text = r.text().await.unwrap_or_default();
                match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(v) => Ok(v),
                    Err(_) => Ok(serde_json::json!({"status": "success", "raw": text.chars().take(500).collect::<String>()}))
                }
            } else {
                let status_val = status.as_u16();
                let err_body = r.text().await.unwrap_or_default();
                let upstream_json = serde_json::from_str::<serde_json::Value>(&err_body)
                    .unwrap_or_else(|_| serde_json::json!({"raw_error": err_body}));
                Ok(serde_json::json!({"_upstream_status": status_val, "_upstream_error": upstream_json}))
            }
        },
        Err(e) => Ok(serde_json::json!({"_upstream_status": 0, "_upstream_error": {"connection_error": e.to_string()}}))
    };

    // ── 火山视频异步任务轮询 ──
    let response_res = if is_video && fwd.target_type == "volcengine" {
        match response_res {
            Ok(create_resp) if create_resp.get("_upstream_error").is_none() => {
                let task_id_opt = create_resp.get("id").and_then(|v| v.as_str())
                    .or_else(|| create_resp.get("data").and_then(|d| d.get("task_id")).and_then(|v| v.as_str()));
                if let Some(task_id) = task_id_opt {
                    let poll_url = join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id));
                    tracing::info!("[Channel Test] 视频任务已提交 task_id={}, 开始轮询: {}", task_id, poll_url);
                    let mut poll_result = serde_json::json!({"status": "polling_timeout"});
                    for attempt in 0..90 {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        match state.http_client.get(&poll_url)
                            .header("Authorization", format!("Bearer {}", channel.api_key))
                            .send().await
                        {
                            Ok(pr) => {
                                let body = pr.text().await.unwrap_or_default();
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                                    let task_status_str = v.get("status").and_then(|s| s.as_str())
                                        .or_else(|| v.get("data").and_then(|d| d.get("status")).and_then(|s| s.as_str()))
                                        .unwrap_or("").to_string();
                                    tracing::info!("[Channel Test] 轮询第 {} 次, status={}", attempt + 1, task_status_str);
                                    poll_result = v;
                                    match task_status_str.as_str() {
                                        "succeeded" | "success" | "failed" | "error" => break,
                                        _ => {}
                                    }
                                }
                            },
                            Err(e) => {
                                tracing::error!("[Channel Test] 轮询请求失败: {}", e);
                                poll_result = serde_json::json!({"poll_error": e.to_string()});
                                break;
                            }
                        }
                    }
                    Ok(serde_json::json!({"create_task_response": create_resp, "task_id": task_id, "final_result": poll_result}))
                } else {
                    tracing::warn!("[Channel Test] 无法从响应中提取 task_id，跳过轮询。响应体: {:?}", create_resp);
                    Ok(create_resp)
                }
            },
            other => other,
        }
    } else {
        response_res
    };

    // ── 记录日志 ──
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

    let _ = sqlx::query(&state.db.format_query("INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, latency_ms, status_code, endpoint, error_message, upstream_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"))
        .bind(user_id_str).bind(id).bind(0).bind(&test_model)
        .bind(p_tokens).bind(c_tokens).bind(0.0).bind(latency_ms)
        .bind(status_code).bind(&endpoint).bind(err_msg).bind(&masked_endpoint)
        .execute(&state.db.pool).await;

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
