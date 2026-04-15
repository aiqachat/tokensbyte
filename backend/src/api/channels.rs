use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{Channel, CreateChannelRequest, UpdateChannelRequest, ChannelSafe, ChannelListResponse};
use crate::error::{AppError, AppResult};
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

    let sql = r#"INSERT INTO channels (name, provider_type, base_url, api_key, models, model_mapping, user_groups, group_aid, preset_id, priority, weight, status, max_rps, config)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING id"#;

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
           model_mapping = ?, user_groups = ?, preset_id = ?, priority = ?, weight = ?, status = ?, max_rps = ?, config = ?, group_aid = ?, updated_at = CURRENT_TIMESTAMP
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

    if let Some(pid) = channel.preset_id {
        let preset: Option<crate::models::ChannelConfig> = sqlx::query_as(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
            .bind(pid)
            .fetch_optional(&state.db.pool).await?;
        if let Some(p) = preset {
            channel.base_url = p.base_url;
            channel.api_key = p.api_key;
        }
    }

    let provider = crate::providers::get_provider(&channel.provider_type);
    
    // Construct a minimal request to test the provider
    let test_model = req.model.unwrap_or_else(|| {
        let models = channel.get_models();
        if !models.is_empty() {
            models[0].clone()
        } else {
            "gpt-3.5-turbo".to_string()
        }
    });

    let start = std::time::Instant::now();
    let mut is_image_request = false;
    let mut is_video_request = false;

    // Generate accurate Mock cURL and Endpoint
    let mut endpoint = match channel.provider_type.as_str() {
        "anthropic" => join_url(&channel.base_url, "/v1/messages"),
        _ => join_url(&channel.base_url, "/v1/chat/completions"),
    };

    // Forward Rule Path Override
    let mut rule_is_stream = false;
    let mut rule_target_type: Option<String> = None;
    if let Some(fid) = req.forward_rule_id {
        let rule: Option<crate::models::ForwardRule> = sqlx::query_as(&state.db.format_query("SELECT * FROM forward_rules WHERE id = ?"))
            .bind(fid)
            .fetch_optional(&state.db.pool)
            .await?;
        if let Some(r) = rule {
            if r.name.contains("流式") || r.name.to_lowercase().contains("stream") {
                rule_is_stream = true;
            }
            if r.category == "图片" {
                is_image_request = true;
            } else if r.category == "视频" {
                is_video_request = true;
            }
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&r.config_json) {
                if let Some(path_rw) = config.get("path_rewrite") {
                    if let Some(old) = path_rw.get("old").and_then(|v| v.as_str()) {
                        if let Some(new) = path_rw.get("new").and_then(|v| v.as_str()) {
                            if endpoint.contains(old) {
                                endpoint = endpoint.replace(old, new);
                            } else {
                                endpoint = join_url(&channel.base_url, new);
                            }
                            endpoint = endpoint.replace("${model}", &test_model);
                        }
                    }
                }
                if let Some(tt) = config.get("target_type").and_then(|v| v.as_str()) {
                    rule_target_type = Some(tt.to_string());
                }
            }
        }
    }

    let request_data = if is_image_request {
         if rule_target_type.as_deref() == Some("gemini_image") || rule_target_type.as_deref() == Some("gemini") || (channel.provider_type == "google" && req.forward_rule_id.is_none()) {
            serde_json::json!({
                "contents": [{
                    "parts": [{"text": "Draw a picture of a cute white cat. 请画一只可爱的白色小猫。"}]
                }],
                "generationConfig": {
                    "imageConfig": {
                        "aspectRatio": "1:1",
                        "imageSize": "1K"
                    }
                }
            })
         } else if rule_target_type.as_deref() == Some("volcengine") {
            endpoint = join_url(&channel.base_url, "/api/v3/contents/generations/tasks");
            serde_json::json!({
                "model": test_model.clone(),
                "content": [{"type": "text", "text": "Draw a picture of a cute white cat. 请画一只可爱的白色小猫。"}],
                "ratio": "1:1",
                "watermark": false
            })
         } else {
             serde_json::json!({
                 "model": test_model.clone(),
                 "prompt": "Draw a picture of a cute white cat. 请画一只可爱的白色小猫。",
                 "n": 1
             })
         }
    } else if is_video_request {
         if rule_target_type.as_deref() == Some("volcengine") {
            endpoint = join_url(&channel.base_url, "/api/v3/contents/generations/tasks");
            serde_json::json!({
                "model": test_model.clone(),
                "content": [{"type": "text", "text": "A short video of a cute white cat walking"}],
                "ratio": "16:9",
                "duration": 5,
                "watermark": false
            })
         } else {
            serde_json::json!({
                "model": test_model.clone(),
                "prompt": "A short video of a cute white cat walking"
            })
         }
    } else {
         if rule_target_type.as_deref() == Some("gemini") {
             serde_json::json!({
                "contents": [{
                    "role": "user",
                    "parts": [{"text": "hi"}]
                }],
                "generationConfig": {
                    "maxOutputTokens": 5,
                    "temperature": 0.0
                }
             })
         } else {
             let mut st = false;
             if endpoint.contains("stream") || rule_is_stream { st = true; }
             serde_json::json!({
                "model": test_model.clone(),
                "messages": [{
                    "role": "user",
                    "content": "hi"
                }],
                "stream": st,
                "temperature": 0.0,
                "max_tokens": 5
            })
         }
    };

    let mut masked_key = channel.api_key.clone();
    if masked_key.len() > 8 {
        masked_key.replace_range(4..masked_key.len()-4, "******");
    } else {
        masked_key = "******".to_string();
    }
    let mut curl_cmd = format!("curl -X POST '{}' \\\n", endpoint);
    curl_cmd.push_str("  -H 'Content-Type: application/json' \\\n");
    if channel.provider_type == "anthropic" {
        curl_cmd.push_str(&format!("  -H 'x-api-key: {}' \\\n", masked_key));
        curl_cmd.push_str("  -H 'anthropic-version: 2023-06-01' \\\n");
    } else if channel.provider_type == "google" && (endpoint.contains("v1beta") || endpoint.contains("v1alpha") || endpoint.contains("generateContent") || endpoint.contains("predict")) {
        curl_cmd.push_str(&format!("  -H 'x-goog-api-key: {}' \\\n", masked_key));
    } else {
        curl_cmd.push_str(&format!("  -H 'Authorization: Bearer {}' \\\n", masked_key));
    }
    let request_json = serde_json::to_string(&request_data).unwrap_or_default();
    curl_cmd.push_str(&format!("  -d '{}'", request_json.replace("'", "\\'")));

    // Dispatch using manual override if forward rule exists, otherwise fallback to provider
    let response_res = if req.forward_rule_id.is_some() {
        let mut builder = state.http_client.post(&endpoint).header("Content-Type", "application/json");
        if channel.provider_type == "anthropic" {
            builder = builder.header("x-api-key", &channel.api_key).header("anthropic-version", "2023-06-01");
        } else if channel.provider_type == "google" && (endpoint.contains("v1beta") || endpoint.contains("v1alpha") || endpoint.contains("generateContent") || endpoint.contains("predict")) {
            builder = builder.header("x-goog-api-key", &channel.api_key);
        } else {
            builder = builder.header("Authorization", format!("Bearer {}", channel.api_key));
        }
        match builder.json(&request_data).send().await {
            Ok(r) => {
                let status = r.status();
                if status.is_success() {
                    let text = r.text().await.unwrap_or_default();
                    if text.starts_with("data: ") || text.contains("\"candidates\"") {
                        // Attempt strict JSON, otherwise fallback to mock usage to prevent error
                        match serde_json::from_str::<serde_json::Value>(&text) {
                            Ok(v) => Ok(v),
                            Err(_) => Ok(serde_json::json!({"status": "stream_success", "raw": text.chars().take(200).collect::<String>()}))
                        }
                    } else {
                        match serde_json::from_str::<serde_json::Value>(&text) {
                            Ok(v) => Ok(v),
                            Err(_) => Ok(serde_json::json!({"status": "success", "raw": text}))
                        }
                    }
                } else {
                    // 保留完整上游错误响应体，便于前端展示诊断
                    let status_val = status.as_u16();
                    let err_body = r.text().await.unwrap_or_default();
                    let upstream_json = serde_json::from_str::<serde_json::Value>(&err_body)
                        .unwrap_or_else(|_| serde_json::json!({"raw_error": err_body}));
                    Ok(serde_json::json!({
                        "_upstream_status": status_val,
                        "_upstream_error": upstream_json
                    }))
                }
            },
            Err(e) => Ok(serde_json::json!({
                "_upstream_status": 0,
                "_upstream_error": {"connection_error": e.to_string()}
            }))
        }
    } else {
        let chat_req_obj = crate::providers::ChatRequest {
            model: test_model.clone(),
            messages: vec![crate::providers::Message {
                role: "user".to_string(),
                content: Some(serde_json::json!("hi")),
                name: None, tool_calls: None, tool_call_id: None, extra: serde_json::Map::new(),
            }],
            stream: Some(false), temperature: Some(0.0), max_tokens: Some(5),
            top_p: None, stop: None, presence_penalty: None, frequency_penalty: None, n: None, user: None, extra: serde_json::Map::new(),
        };
        provider.chat_completions(&state.http_client, &channel, &chat_req_obj).await
            .map(|resp| serde_json::to_value(&resp).unwrap_or_default())
    };

    // 火山方舟视频异步任务：POST 创建后自动轮询 GET 查询结果
    let response_res = if is_video_request && rule_target_type.as_deref() == Some("volcengine") {
        match response_res {
            Ok(create_resp) if create_resp.get("_upstream_error").is_none() => {
                if let Some(task_id) = create_resp.get("id").and_then(|v| v.as_str()) {
                    let poll_url = join_url(&channel.base_url, &format!("/api/v3/contents/generations/tasks/{}", task_id));
                    let mut poll_result = serde_json::json!({"status": "polling_timeout"});
                    for _ in 0..90 {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        match state.http_client.get(&poll_url)
                            .header("Authorization", format!("Bearer {}", channel.api_key))
                            .send().await
                        {
                            Ok(pr) => {
                                let body = pr.text().await.unwrap_or_default();
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                                    let task_status_str = v.get("status").and_then(|s| s.as_str()).unwrap_or("").to_string();
                                    poll_result = v;
                                    if task_status_str == "succeeded" || task_status_str == "failed" {
                                        break;
                                    }
                                }
                            },
                            Err(e) => {
                                poll_result = serde_json::json!({"poll_error": e.to_string()});
                                break;
                            }
                        }
                    }
                    Ok(serde_json::json!({
                        "create_task_response": create_resp,
                        "task_id": task_id,
                        "final_result": poll_result
                    }))
                } else {
                    Ok(create_resp)
                }
            },
            other => other,
        }
    } else {
        response_res
    };

    // Inject usage logs for debugging
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
        Err(e) => {
            status_code = 500;
            err_msg = Some(e.to_string());
        }
    }

    let mut masked_endpoint = endpoint.clone();
    if !channel.api_key.is_empty() && masked_endpoint.contains(&channel.api_key) {
        masked_endpoint = masked_endpoint.replace(&channel.api_key, &masked_key);
    }

    let user_id_str = match &options_claims {
        Some(axum::Extension(c)) => c.sub.clone(),
        None => "0".to_string(),
    };

    let _ = sqlx::query(&state.db.format_query("INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, latency_ms, status_code, endpoint, error_message, upstream_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"))
        .bind(user_id_str)
        .bind(id)
        .bind(0)
        .bind(&test_model)
        .bind(p_tokens)
        .bind(c_tokens)
        .bind(0.0) // No real user cost for an admin test
        .bind(latency_ms)
        .bind(status_code)
        .bind(&endpoint)
        .bind(err_msg)
        .bind(&masked_endpoint)
        .execute(&state.db.pool)
        .await;

    match response_res {
        Ok(response_value) => {
            let is_upstream_err = response_value.get("_upstream_error").is_some();
            if is_upstream_err {
                let upstream_status = response_value.get("_upstream_status").and_then(|s| s.as_i64()).unwrap_or(0);
                Ok(Json(serde_json::json!({
                    "success": false,
                    "err_msg": format!("上游返回 HTTP {}", upstream_status),
                    "latency": latency_ms,
                    "channel_id": id,
                    "curl_command": curl_cmd,
                    "request_data": request_data,
                    "response_data": response_value,
                })))
            } else {
                Ok(Json(serde_json::json!({
                    "success": true,
                    "latency": latency_ms,
                    "channel_id": id,
                    "curl_command": curl_cmd,
                    "request_data": request_data,
                    "response_data": response_value,
                })))
            }
        },
        Err(e) => {
            let err_str = e.to_string();
            Ok(Json(serde_json::json!({
                "success": false,
                "err_msg": err_str.clone(),
                "latency": latency_ms,
                "channel_id": id,
                "curl_command": curl_cmd,
                "request_data": request_data,
                "response_data": { "error": err_str },
            })))
        }
    }
}

