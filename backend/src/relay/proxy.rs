//! Shared proxy utilities — user context, billing, logging.
//! All relay handlers reuse these to avoid code duplication.

use std::sync::Arc;
use crate::AppState;
use crate::models::ApiToken;
use crate::error::{AppError, AppResult};
use regex::Regex;
use super::router;
use crate::models::Channel;

// ── User Context ────────────────────────────────────────────────

pub struct UserContext {
    pub user_group: String,
    pub balance: f64,
    pub discount: f64,
}

pub async fn get_user_context(state: &Arc<AppState>, user_id: &str) -> AppResult<UserContext> {
    let (g, b, d): (String, f64, f64) = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, u.balance, COALESCE(ul.discount, 1.0) \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(UserContext { user_group: g, balance: b, discount: d })
}

/// 统一折扣优先级：模型全站折扣（启用时）> 用户等级折扣
pub fn resolve_discount(db_model: Option<&crate::models::Model>, level_discount: f64) -> (f64, &'static str) {
    if let Some(m) = db_model {
        if m.site_discount_enabled == 1 {
            return (m.site_discount, "模型全站折扣");
        }
    }
    (level_discount, "等级折扣")
}

// ── Access Check ────────────────────────────────────────────────

pub async fn check_access(state: &Arc<AppState>, token: &ApiToken, model: &str, balance: f64) -> AppResult<f64> {
    if !token.is_model_allowed(model) {
        let msg = format!("Model {} not allowed for this token", model);
        record_error_log(state, &token.user_id, None, model, 403, "/v1/chat/completions", &msg, None).await;
        return Err(AppError::Forbidden(msg));
    }

    let db_model: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1")
    )
    .bind(model)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    let pre_deduction = db_model.map(|m| m.pre_deduction).unwrap_or(0.0);

    if pre_deduction > 0.0 {
        if balance < pre_deduction {
            let msg = format!("Insufficient user balance for pre-deduction: need {}", pre_deduction);
            record_error_log(state, &token.user_id, None, model, 403, "/v1/chat/completions", &msg, None).await;
            return Err(AppError::Forbidden(msg));
        }
    } else {
        if token.quota_limit < 0.0 && balance <= 0.0 {
            let msg = "Insufficient user balance";
            record_error_log(state, &token.user_id, None, model, 403, "/v1/chat/completions", &msg, None).await;
            return Err(AppError::Forbidden(msg.into()));
        }
    }

    Ok(pre_deduction)
}

// ── Channel Selection ───────────────────────────────────────────

pub async fn select_channel_for_model(
    state: &Arc<AppState>, token: &ApiToken, model: &str, user_group: &str, endpoint: &str,
) -> AppResult<(Channel, String)> {
    match router::select_channel(state, model, user_group).await {
        Ok(ch) => {
            let resolved = ch.resolve_model(model);
            Ok((ch, resolved))
        },
        Err(e) => {
            let msg = if let AppError::NotFound(ref m) = e { m.clone() } else { e.to_string() };
            record_error_log(state, &token.user_id, None, model, 404, endpoint, &msg, None).await;
            Err(e)
        }
    }
}

// ── Cost Lookup ─────────────────────────────────────────────────

pub async fn get_model_cost(state: &Arc<AppState>, model: &str, discount: f64) -> f64 {
    let m: Option<crate::models::Model> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1"),
    )
    .bind(model)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);
    
    let db_rule: Option<crate::models::BillingRule> = if let Some(ref md) = m {
        if let Some(rule_id) = md.billing_rule_id {
            sqlx::query_as(&state.db.format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"))
                .bind(rule_id)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None)
        } else { None }
    } else { None };

    match db_rule {
        Some(r) => r.fixed_rate * discount,
        None => 0.0,
    }
}

// ── Record Usage & Billing ──────────────────────────────────────

use super::url_utils::join_url;

pub async fn pre_deduct(state: &Arc<AppState>, user_id: &str, amount: f64) -> Result<(), sqlx::Error> {
    if amount > 0.0 {
        sqlx::query(&state.db.format_query("UPDATE users SET balance = balance - ? WHERE id = ?"))
            .bind(amount)
            .bind(user_id)
            .execute(&state.db.pool)
            .await?;
    }
    Ok(())
}


pub async fn record_error_log(
    state: &Arc<AppState>,
    user_id: &str,
    channel_id: Option<i64>,
    model: &str,
    status_code: u16,
    endpoint: &str,
    error_msg: &str,
    upstream_url: Option<&str>,
) {
    let sql = state.db.format_query(
        "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url) VALUES (?, ?, 0, ?, 0, 0, 0, 0.0, ?, ?, ?, 0, NULL, NULL, 0, ?)"
    );
    let cid = channel_id.unwrap_or(0);
    
    let res = sqlx::query(&sql)
        .bind(user_id)
        .bind(cid)
        .bind(model)
        .bind(status_code as i32)
        .bind(endpoint)
        .bind(error_msg)
        .bind(upstream_url.unwrap_or(""))
        .execute(&state.db.pool)
        .await;

    if let Err(e) = res {
        tracing::error!("Failed to record error log: {:?}", e);
    }
}

pub async fn record_and_bill(
    state: &Arc<AppState>, token: &ApiToken, channel_id: i64, model_name: &str,
    prompt_tokens: i32, completion_tokens: i32, cached_tokens: i32, cost: f64, status_code: u16,
    endpoint: &str, error_msg: Option<&str>, latency_ms: u32, is_stream: i32,
    request_content: Option<String>, response_content: Option<String>, upstream_req_content: Option<String>,
    billing_detail: Option<String>,
) {
    record_and_bill_with_prededuction(state, token, channel_id, model_name, prompt_tokens, completion_tokens, cached_tokens, cost, 0.0, status_code, endpoint, error_msg, latency_ms, is_stream, request_content, response_content, upstream_req_content, billing_detail).await;
}

pub async fn record_and_bill_with_prededuction(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model_name: &str,
    prompt_tokens: i32,
    completion_tokens: i32,
    cached_tokens: i32,
    cost: f64,
    pre_deducted: f64,
    status_code: u16,
    endpoint: &str,
    error_msg: Option<&str>,
    latency_ms: u32,
    is_stream: i32,
    request_content: Option<String>,
    response_content: Option<String>,
    upstream_req_content: Option<String>,
    billing_detail: Option<String>,
) {
    let mut enable_log: i32 = 0;
    let mut category = String::new();
    
    // 查询模型同时关联 model_types 获取 category
    if let Ok(Some(row)) = sqlx::query(
        &state.db.format_query("SELECT m.enable_log_content, t.name as category_name 
         FROM models m 
         LEFT JOIN model_types t ON m.type_id = t.id 
         WHERE m.model_id = ? AND m.is_active = 1 
         LIMIT 1")
    )
    .bind(model_name)
    .fetch_optional(&state.db.pool)
    .await 
    {
        use sqlx::Row;
        enable_log = row.try_get("enable_log_content").unwrap_or(0);
        category = row.try_get("category_name").unwrap_or_default();
    }

    let filter_content = |content: Option<String>, respect_log_flag: bool| -> Option<String> {
        let text = content?;
        if respect_log_flag && enable_log == 0 { return None; }
        // 1. 标准 data URI (兼容各类 data:协议 长尾内容)
        let re1 = Regex::new(r"data:[^;]+;base64,[A-Za-z0-9+/=\s]{100,}").unwrap();
        let text = re1.replace_all(&text, "\"base64数据\"").to_string();
        // 2. JSON 转义 data URI (兼容反斜杠)
        let re2 = Regex::new(r"data:[^;]+;base64,[A-Za-z0-9+/=\\s]{100,}").unwrap();
        let text = re2.replace_all(&text, "\"base64数据\"").to_string();
        // 3. 纯 base64 长串 (>200 字符的连续 base64)
        let re3 = Regex::new(r#""[A-Za-z0-9+/]{200,}={0,2}""#).unwrap();
        Some(re3.replace_all(&text, "\"base64数据\"").to_string())
    };

    let req_content = filter_content(request_content, true);       // 受上下文记录开关控制
    let upstream_req = filter_content(upstream_req_content, true); // 受上下文记录开关控制
    
    // 灵活处理 response_content 的存储
    let resp_content = if enable_log == 0 {
        if category == "视频" || category == "图片" {
            // 视频和图片模型：结果始终保留（需要提取生成的资源URL等）
            filter_content(response_content, false)
        } else {
            if let Some(ref text) = response_content {
                let usage_json = crate::relay::usage_extractor::extract_usage_json_string(text);
                if usage_json.is_some() {
                    // 只要成功提取出 token 的 usage JSON，则为节省日志空间仅存 usage
                    usage_json
                } else if category == "聊天" || category == "文本" {
                    // 纯文本语言模型：如果既没查到usage又关闭了上下文，避免存入大文本影响性能，做极简化占位
                    Some("[]".to_string())
                } else {
                    // 语音及未来新增的其他异构模型类型：
                    // 如果没有找到 usage 数据提取格式，基于严谨性，兜底保留经过 Base64 等脱敏后的完整请求包！
                    filter_content(Some(text.clone()), false)
                }
            } else {
                None
            }
        }
    } else {
        // 如果开启了上下文，始终保存处理后的内容
        filter_content(response_content, false)
    };

    let mut channel_info: Option<(String, String, String)> = None;
    if let Ok(Some(ch)) = sqlx::query_as::<_, crate::models::Channel>(&state.db.format_query("SELECT * FROM channels WHERE id = ?"))
        .bind(channel_id)
        .fetch_optional(&state.db.pool)
        .await
    {
        let mut b = ch.base_url.clone();
        let mut k = ch.api_key.clone();
        if let Some(pid) = ch.preset_id {
            if let Ok(Some(preset)) = sqlx::query_as::<_, crate::models::ChannelConfig>(&state.db.format_query("SELECT * FROM channel_configs WHERE id = ?"))
                .bind(pid)
                .fetch_optional(&state.db.pool)
                .await
            {
                b = preset.base_url;
                k = preset.api_key;
            }
        }
        channel_info = Some((b, k, ch.provider_type));

        // ── 火山引擎卡池统计集成 ──
        if let Ok(config_val) = serde_json::from_str::<serde_json::Value>(&ch.config) {
            if let (Some(acc_id), Some(p_id)) = (config_val["_pool_account_id"].as_i64(), config_val["_pool_id"].as_i64()) {
                let acc_name = config_val["_pool_account_name"].as_str().unwrap_or("Unknown").to_string();
                let state_pool = state.clone();
                let model_pool = model_name.to_string();
                let cid_pool = channel_id;
                let p_tokens = prompt_tokens;
                let c_tokens = completion_tokens;
                let ca_tokens = cached_tokens;
                let s_code = status_code;
                let err_msg_pool = error_msg.map(|s| s.to_string());
                
                tokio::spawn(async move {
                    // 获取配额单位
                    let mapping: Option<(String,)> = sqlx::query_as(&state_pool.db.format_query(
                        "SELECT quota_unit FROM volcengine_pool_account_mapping WHERE pool_id = ? AND account_id = ?"
                    ))
                    .bind(p_id)
                    .bind(acc_id)
                    .fetch_optional(&state_pool.db.pool)
                    .await
                    .unwrap_or(None);
                    
                    if let Some((unit,)) = mapping {
                        let usage_amount = match unit.as_str() {
                            "tokens" => (p_tokens + c_tokens + ca_tokens) as f64,
                            "requests" => 1.0,
                            "images" => 1.0, // 简化处理，生图场景默认为 1
                            _ => (p_tokens + c_tokens + ca_tokens) as f64,
                        };
                        
                        if s_code == 200 {
                            crate::services::volcengine_pool::record_usage(
                                &state_pool, p_id, acc_id, &acc_name, &model_pool, cid_pool, usage_amount, &unit
                            ).await;
                        } else {
                            let err = err_msg_pool.unwrap_or_else(|| format!("HTTP {}", s_code));
                            crate::services::volcengine_pool::mark_failed(
                                &state_pool, p_id, acc_id, &acc_name, &model_pool, cid_pool, &err
                            ).await;
                        }
                    }
                });
            }
        }
    }
        
    let (system_endpoint, upstream_ep) = if endpoint.contains('|') {
        let parts: Vec<&str> = endpoint.splitn(2, '|').collect();
        (parts[0], parts[1])
    } else {
        (endpoint, endpoint)
    };

    let mut final_endpoint = upstream_ep.to_string();
    if let Some((base, key, _provider)) = channel_info {
        if !final_endpoint.starts_with("http") {
             final_endpoint = join_url(&base, if final_endpoint.starts_with('/') { &final_endpoint[1..] } else { &final_endpoint });
        }
        // 通用密钥脱敏：只要 URL 中包含 api_key，统一脱敏
        final_endpoint = super::forward::mask_key_in_string(&final_endpoint, &key);
    }



    let res: Result<(), sqlx::Error> = async {
        let mut tx = state.db.pool.begin().await?;
        if cost > 0.0 || pre_deducted > 0.0 {
            sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(cost)
            .bind(token.id)
            .execute(&mut *tx)
            .await?;
            
            let apply_balance = cost - pre_deducted; // 正数表示还要扣，负数表示退款
            sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance - ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(apply_balance)
            .bind(cost)
            .bind(&token.user_id)
            .execute(&mut *tx)
            .await?;
            
            if channel_id > 0 {
                sqlx::query(&state.db.format_query(
                    "UPDATE channels SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ))
                .bind(cost)
                .bind(channel_id)
                .execute(&mut *tx)
                .await?;
            }
        }
        sqlx::query(&state.db.format_query(
            "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url, upstream_req_content, billing_detail) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ))
        .bind(&token.user_id)
        .bind(channel_id)
        .bind(token.id)
        .bind(model_name)
        .bind(prompt_tokens)
        .bind(completion_tokens)
        .bind(cached_tokens)
        .bind(cost)
        .bind(status_code as i32)
        .bind(system_endpoint)
        .bind(error_msg)
        .bind(latency_ms as i32)
        .bind(req_content)
        .bind(resp_content)
        .bind(is_stream)
        .bind(&final_endpoint)
        .bind(upstream_req)
        .bind(billing_detail)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
    .await;
    if let Err(e) = res {
        tracing::error!("Failed to record relay usage: {:?}", e);
    }
}
