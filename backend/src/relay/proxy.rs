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
    pub level_id: String,
    pub balance: f64,
    pub discount: f64,
}

pub async fn get_user_context(state: &Arc<AppState>, user_id: &str) -> AppResult<UserContext> {
    let (g, l_id, b, gb, d): (String, i64, f64, f64, f64) = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, COALESCE(ul.id, 0), u.balance, u.gift_balance, COALESCE(ul.discount, 1.0) \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(UserContext { user_group: g, level_id: l_id.to_string(), balance: b + gb, discount: d })
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

// ── Model Lookup (支持同名模型按类型区分) ────────────────────────

/// 按 model_id 查找活跃模型，可选传入 category 以区分同名但不同类型的模型。
/// category: Some("图片") / Some("视频") / Some("聊天") / None（不限类型）
pub async fn find_active_model(state: &AppState, model_id: &str, category: Option<&str>) -> Option<crate::models::Model> {
    if let Some(cat) = category {
        let result: Option<crate::models::Model> = sqlx::query_as(
            &state.db.format_query(
                "SELECT m.* FROM models m LEFT JOIN model_types t ON m.type_id = t.id WHERE m.model_id = ? AND m.is_active = 1 AND t.name = ? LIMIT 1"
            ),
        )
        .bind(model_id)
        .bind(cat)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);
        // 如果指定类型未命中，回退到不限类型（兼容未配置 type 的旧模型）
        if result.is_some() { return result; }
    }
    sqlx::query_as(
        &state.db.format_query("SELECT * FROM models WHERE model_id = ? AND is_active = 1 LIMIT 1"),
    )
    .bind(model_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None)
}

// ── Access Check ────────────────────────────────────────────────

pub async fn check_access(state: &Arc<AppState>, token: &ApiToken, model: &str, balance: f64, category: Option<&str>) -> AppResult<f64> {
    if !token.is_model_allowed(model) {
        let msg = format!("Model {} not allowed for this token", model);
        record_error_log(state, &token.user_id, None, model, 403, "/v1/chat/completions", &msg, None).await;
        return Err(AppError::Forbidden(msg));
    }

    let db_model = find_active_model(state, model, category).await;
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
    state: &Arc<AppState>, token: &ApiToken, model: &str, user_group: &str, level_id: &str, endpoint: &str,
) -> AppResult<(Channel, String)> {
    match router::select_channel(state, model, user_group, level_id).await {
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

// ── Record Usage & Billing ──────────────────────────────────────

use super::url_utils::join_url;

pub async fn pre_deduct(state: &Arc<AppState>, user_id: &str, amount: f64) -> Result<(), sqlx::Error> {
    if amount > 0.0 {
        sqlx::query(&state.db.format_query(
            "UPDATE users SET 
             balance = CASE WHEN gift_balance >= ? THEN balance ELSE balance - (? - gift_balance) END,
             gift_balance = CASE WHEN gift_balance >= ? THEN gift_balance - ? ELSE 0 END 
             WHERE id = ?"
        ))
            .bind(amount).bind(amount).bind(amount).bind(amount)
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
    record_and_bill_inner(state, token, channel_id, model_name, prompt_tokens, completion_tokens, cached_tokens, cost, 0.0, status_code, endpoint, error_msg, latency_ms, is_stream, request_content, response_content, upstream_req_content, billing_detail, None).await;
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
    record_and_bill_inner(state, token, channel_id, model_name, prompt_tokens, completion_tokens, cached_tokens, cost, pre_deducted, status_code, endpoint, error_msg, latency_ms, is_stream, request_content, response_content, upstream_req_content, billing_detail, None).await;
}

/// 带 category 参数的计费记录入口（同名模型按类型精准匹配）
pub async fn record_and_bill_with_category(
    state: &Arc<AppState>, token: &ApiToken, channel_id: i64, model_name: &str,
    prompt_tokens: i32, completion_tokens: i32, cached_tokens: i32, cost: f64, pre_deducted: f64,
    status_code: u16, endpoint: &str, error_msg: Option<&str>, latency_ms: u32, is_stream: i32,
    request_content: Option<String>, response_content: Option<String>, upstream_req_content: Option<String>,
    billing_detail: Option<String>, category: Option<&str>,
) {
    record_and_bill_inner(state, token, channel_id, model_name, prompt_tokens, completion_tokens, cached_tokens, cost, pre_deducted, status_code, endpoint, error_msg, latency_ms, is_stream, request_content, response_content, upstream_req_content, billing_detail, category).await;
}

async fn record_and_bill_inner(
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
    hint_category: Option<&str>,
) {
    let mut enable_log: i32 = 0;
    let mut category = String::new();
    let mut billing_pid: Option<String> = None;
    let mut forward_eid: Option<String> = None;
    
    // 查询模型同时关联 model_types 获取 category（支持同名模型按类型区分）
    let cat_filter = if let Some(cat) = hint_category {
        format!(" AND t.name = '{}'", cat)
    } else {
        String::new()
    };
    let sql = format!(
        "SELECT m.enable_log_content, m.forward_rule_ids, t.name as category_name, b.pid as billing_pid \
         FROM models m \
         LEFT JOIN model_types t ON m.type_id = t.id \
         LEFT JOIN billing_rules b ON m.billing_rule_id = b.id \
         WHERE m.model_id = ? AND m.is_active = 1{} LIMIT 1",
        cat_filter
    );
    let mut forward_rule_ids_str: Option<String> = None;
    if let Ok(Some(row)) = sqlx::query(&state.db.format_query(&sql))
    .bind(model_name)
    .fetch_optional(&state.db.pool)
    .await 
    {
        use sqlx::Row;
        enable_log = row.try_get("enable_log_content").unwrap_or(0);
        category = row.try_get("category_name").unwrap_or_default();
        billing_pid = row.try_get("billing_pid").unwrap_or(None);
        forward_rule_ids_str = row.try_get("forward_rule_ids").unwrap_or(None);
    }

    if let Some(ids_str) = forward_rule_ids_str {
        if let Ok(ids) = serde_json::from_str::<Vec<i64>>(&ids_str) {
            if let Some(first_id) = ids.first() {
                forward_eid = sqlx::query_scalar(&state.db.format_query("SELECT eid FROM forward_rules WHERE id = ?"))
                    .bind(first_id)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None);
            }
        }
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
        let now_str = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        // 始终更新令牌最后使用时间
        sqlx::query(&state.db.format_query(
            "UPDATE api_tokens SET last_used_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ))
        .bind(&now_str)
        .bind(token.id)
        .execute(&mut *tx)
        .await?;

        if cost > 0.0 || pre_deducted > 0.0 {
            sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET quota_used = quota_used + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ))
            .bind(cost)
            .bind(token.id)
            .execute(&mut *tx)
            .await?;
            
            let apply_balance = cost - pre_deducted; // 正数表示还要扣，负数表示退款
            if apply_balance > 0.0 {
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET 
                     balance = CASE WHEN gift_balance >= ? THEN balance ELSE balance - (? - gift_balance) END,
                     gift_used_quota = gift_used_quota + CASE WHEN gift_balance >= ? THEN ? ELSE gift_balance END,
                     gift_balance = CASE WHEN gift_balance >= ? THEN gift_balance - ? ELSE 0 END,
                     used_quota = used_quota + ?, 
                     updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?",
                ))
                .bind(apply_balance).bind(apply_balance).bind(apply_balance).bind(apply_balance)
                .bind(apply_balance).bind(apply_balance).bind(cost).bind(&token.user_id)
                .execute(&mut *tx)
                .await?;
            } else if apply_balance < 0.0 {
                // 如果是退款（pre_deducted 过多），统一退回到主余额
                let refund = -apply_balance;
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET balance = balance + ?, used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ))
                .bind(refund)
                .bind(cost) // cost happens to be actual cost, so used_quota increases by cost. But pre_deducted was taken. Wait, if we pre_deducted 10, actual cost 2, apply_balance is -8, refund is 8. used_quota increases by 2. This is correct.
                .bind(&token.user_id)
                .execute(&mut *tx)
                .await?;
            } else {
                // apply_balance == 0
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET used_quota = used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ))
                .bind(cost)
                .bind(&token.user_id)
                .execute(&mut *tx)
                .await?;
            }
            
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
        // 从响应体自动提取异步任务 ID（兼容各厂商格式）
        let task_id = resp_content.as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .and_then(|v| {
                // 辅助：从 Value 提取字符串（兼容字符串和数字类型的 task_id）
                let extract = |val: &serde_json::Value| -> Option<String> {
                    val.as_str().map(|s| s.to_string())
                        .or_else(|| val.as_i64().map(|n| n.to_string()))
                };
                // 1. 根节点 task_id
                v.get("task_id").and_then(extract)
                // 2. data.task_id（data 为对象）
                .or_else(|| v.get("data").and_then(|d| d.get("task_id")).and_then(extract))
                // 3. data[0].task_id（data 为数组，如火山方舟图片）
                .or_else(|| v.get("data").and_then(|d| d.as_array()).and_then(|a| a.first()).and_then(|item| item.get("task_id")).and_then(extract))
                // 4. output.task_id（阿里百炼）
                .or_else(|| v.get("output").and_then(|o| o.get("task_id")).and_then(extract))
                // 5. 根节点 id（火山方舟异步），排除聊天同步响应
                .or_else(|| {
                    if v.get("choices").is_none() && v.get("candidates").is_none() {
                        v.get("id").and_then(extract)
                    } else { None }
                })
            })
            .unwrap_or_default();

        let final_action_type = if !category.is_empty() {
            category.clone()
        } else {
            hint_category.unwrap_or_default().to_string()
        };

        sqlx::query(&state.db.format_query(
            "INSERT INTO logs (user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url, upstream_req_content, billing_detail, task_id, action_type, billing_pid, forward_eid) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
        .bind(&task_id)
        .bind(&final_action_type)
        .bind(&billing_pid)
        .bind(&forward_eid)
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
