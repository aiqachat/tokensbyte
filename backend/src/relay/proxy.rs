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
    /// 用户模型单独折扣(JSON: {"mid": discount})，优先于等级折扣
    pub model_discounts: Option<String>,
    pub role: String,
}

pub async fn get_user_context(state: &Arc<AppState>, user_id: &str) -> AppResult<UserContext> {
    // 查询用户信息、等级折扣、模型单独折扣（用于计费时优先匹配用户模型折扣）、角色
    let (g, l_id, b, gb, cl, d, md, r): (String, i64, f64, f64, f64, f64, Option<String>, String) = sqlx::query_as(
        &state.db.format_query(
            "SELECT u.user_group, COALESCE(ul.id, 0), u.balance, u.gift_balance, u.credit_limit, COALESCE(ul.discount, 1.0), u.model_discounts, u.role \
             FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key \
             WHERE u.id = ?"
        )
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await?;
    Ok(UserContext { user_group: g, level_id: l_id.to_string(), balance: b + gb + cl, discount: d, model_discounts: md, role: r })
}

/// 统一折扣策略（MIN + MAX 两步）：
/// 1. 取所有已启用折扣来源的最小值：MIN(用户模型单独折扣, 全站折扣, 用户等级折扣)
/// 2. 折扣限价约束：MAX(最低折扣, 模型限价)，保证折扣不低于限价
pub fn resolve_discount(
    db_model: Option<&crate::models::Model>,
    level_discount: f64,
    user_model_discount: Option<f64>,
) -> (f64, &'static str) {
    // 第一步：取所有已启用折扣来源的最小值
    let mut min_discount = level_discount;
    let mut source = "等级折扣";

    if let Some(umd) = user_model_discount {
        if umd < min_discount {
            min_discount = umd;
            source = "用户模型折扣";
        }
    }

    if let Some(m) = db_model {
        if m.global_discount_enabled == 1 && m.global_discount < min_discount {
            min_discount = m.global_discount;
            source = "全站折扣";
        }
    }

    // 第二步：折扣限价约束 MAX(最低折扣, 模型限价)
    if let Some(m) = db_model {
        if m.site_discount_enabled == 1 && min_discount < m.site_discount {
            return (m.site_discount, "折扣限价");
        }
    }

    (min_discount, source)
}

/// 从用户 model_discounts JSON 中提取指定模型(mid)的单独折扣
pub fn parse_user_model_discount(model_discounts: &Option<String>, mid: &str) -> Option<f64> {
    let json_str = model_discounts.as_ref()?;
    let map: std::collections::HashMap<String, f64> = serde_json::from_str(json_str).ok()?;
    map.get(mid).copied()
}

// ── Model Lookup (支持同名模型按类型区分) ────────────────────────

/// 轻量查询模型关联的计费规则详情结构体（完整 BillingRule 实体）。
pub async fn get_model_billing_rule(
    state: &AppState,
    model_id: &str,
    channel: Option<&crate::models::Channel>,
    db_model: Option<&crate::models::Model>,
) -> Option<crate::models::BillingRule> {
    let rule_id = if let Some(m) = db_model {
        m.billing_rule_id?
    } else {
        let model = find_active_model_exact(state, model_id, None, channel).await?;
        model.billing_rule_id?
    };
    sqlx::query_as(
        &state.db.format_query(
            "SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"
        )
    )
    .bind(rule_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None)
}

/// 按 model_id 查找活跃模型，可选传入 category 以区分同名但不同类型的模型。
/// category: Some("图片") / Some("视频") / Some("聊天") / None（不限类型）
pub async fn find_active_model_exact(
    state: &AppState, 
    model_id: &str, 
    category: Option<&str>, 
    channel: Option<&crate::models::Channel>
) -> Option<crate::models::Model> {
    let cat_filter = if let Some(cat) = category {
        format!(" AND t.name = '{}'", cat)
    } else {
        String::new()
    };

    // 1. 获取所有匹配的活跃模型候选（ORDER BY m.id 保证多候选时返回顺序确定性）
    let sql = format!(
        "SELECT m.* FROM models m LEFT JOIN model_types t ON m.type_id = t.id WHERE m.model_id = ? AND m.is_active = 1{} ORDER BY m.id",
        cat_filter
    );
    let candidates: Vec<crate::models::Model> = sqlx::query_as(&state.db.format_query(&sql))
        .bind(model_id)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();

    if candidates.is_empty() {
        return None;
    }

    // 2. 如果提供了渠道，且存在多个候选模型，尝试精确匹配渠道包含的 mid
    if let Some(ch) = channel {
        let ch_models = ch.get_models(); // 可能是 mid 数组，也可能是旧版的 model_id 数组
        if !ch_models.is_empty() {
            // 优先匹配 mid（精确锁定唯一模型记录及其关联计费规则）
            if let Some(exact) = candidates.iter().find(|m| ch_models.contains(&m.mid)) {
                return Some(exact.clone());
            }
            // 兜底匹配 model_id
            if let Some(exact) = candidates.iter().find(|m| ch_models.contains(&m.model_id)) {
                return Some(exact.clone());
            }
        }
    }

    // 3. 默认返回第一个（ORDER BY m.id 保证确定性）
    Some(candidates.into_iter().next().unwrap())
}

// ── Access Check ────────────────────────────────────────────────

/// 根据 category 推断标准 endpoint 路径（用于错误日志记录）
pub fn category_endpoint(category: Option<&str>) -> &'static str {
    match category {
        Some("图片") => "/v1/images/generations",
        Some("视频") => "/v1/video/generations",
        Some("音频") => "/v1/audio/speech",
        Some("向量") => "/v1/embeddings",
        Some("排序") => "/v1/rerank",
        _ => "/v1/chat/completions",
    }
}

/// Token 模型权限校验（渠道选择 **之前** 调用，快速拦截未授权模型）。
/// 返回 Ok(()) 表示放行，Err 表示拒绝。
pub async fn check_model_permission(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    endpoint: &str,
) -> AppResult<()> {
    if !token.is_model_allowed(model) {
        let msg = format!("Model {} not allowed for this token", model);
        record_error_log(state, &token.user_id, None, Some(token.id), model, 403, endpoint, &msg, None, None).await;
        return Err(AppError::Forbidden(msg));
    }
    Ok(())
}

/// 类型安全隔离 + 预扣费余额检查。
/// 调用方需在渠道选择 **之前** 自行执行 `check_model_permission()` 权限拦截，
/// 本函数只负责模型类别校验和预扣费，channel 用于精确匹配同名模型的预扣费金额。
/// 返回 `(pre_deduction, db_model)`：pre_deduction 为预扣费金额，db_model 为已查询的模型记录，
/// 调用方可将 db_model 传递给下游函数（如 resolve_forward_rule / record_pending_log）复用，避免重复查库。
pub async fn check_access(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    ctx: &UserContext,
    category: Option<&str>,
    channel: Option<&crate::models::Channel>,
) -> AppResult<(f64, Option<crate::models::Model>)> {
    let ep = category_endpoint(category);
    let ch_id = channel.map(|c| c.id);
    let up_url = channel.map(|c| c.base_url.as_str());

    let db_model = find_active_model_exact(state, model, category, channel).await;

    // 类型安全隔离：若指定了 category，但在当前类别下查不到，且该模型在活跃模型表里有配置，则说明其属于其他类型，直接拦截
    if db_model.is_none() && category.is_some() {
        let exists: Option<(i64,)> = sqlx::query_as(&state.db.format_query(
            "SELECT id FROM models WHERE model_id = ? AND is_active = 1 LIMIT 1"
        ))
        .bind(model)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

        if exists.is_some() {
            let cat = category.unwrap();
            let msg = format!("模型 '{}' 不支持当前 '{}' 接口请求", model, cat);
            record_error_log(state, &token.user_id, ch_id, Some(token.id), model, 400, ep, &msg, up_url, category).await;
            return Err(AppError::BadRequest(msg));
        }
    }

    let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);

    // 管理员用户免除余额和预扣费检测，直接放行
    let is_admin = ctx.role == "admin";

    if is_admin {
        return Ok((pre_deduction, db_model));
    }

    if pre_deduction > 0.0 {
        if ctx.balance < pre_deduction {
            let currency_unit = {
                let setting_val: Option<String> = sqlx::query_scalar(
                    &state.db.format_query("SELECT value FROM settings WHERE key = 'currency_settings'")
                )
                .fetch_optional(&state.db.pool)
                .await
                .ok()
                .flatten();

                setting_val
                    .and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok())
                    .and_then(|json| json.get("currency_unit").and_then(|u| u.as_str().map(|s| s.to_string())))
                    .unwrap_or_else(|| "元".to_string())
            };
            let msg = format!("账户余额不足{}{}", pre_deduction, currency_unit);
            record_error_log(state, &token.user_id, ch_id, Some(token.id), model, 403, ep, &msg, up_url, category).await;
            return Err(AppError::Forbidden(msg));
        }
    } else {
        if token.quota_limit < 0.0 && ctx.balance <= 0.0 {
            let msg = "余额不足";
            record_error_log(state, &token.user_id, ch_id, Some(token.id), model, 403, ep, &msg, up_url, category).await;
            return Err(AppError::Forbidden(msg.into()));
        }
    }

    Ok((pre_deduction, db_model))
}

// ── Channel Selection ───────────────────────────────────────────

pub async fn select_channel_for_model_with_exclude(
    state: &Arc<AppState>, token: &ApiToken, model: &str, user_group: &str, level_id: &str, endpoint: &str, exclude_aids: &[String],
) -> AppResult<Channel> {
    match router::select_channel(state, model, user_group, level_id, exclude_aids).await {
        Ok(ch) => Ok(ch),
        Err(e) => {
            let msg = if let AppError::NotFound(ref m) = e { m.clone() } else { e.to_string() };
            record_error_log(state, &token.user_id, None, Some(token.id), model, 404, endpoint, &msg, None, None).await;
            Err(e)
        }
    }
}

pub async fn select_channel_for_model(
    state: &Arc<AppState>, token: &ApiToken, model: &str, user_group: &str, level_id: &str, endpoint: &str,
) -> AppResult<Channel> {
    select_channel_for_model_with_exclude(state, token, model, user_group, level_id, endpoint, &[]).await
}

// ── Record Usage & Billing ──────────────────────────────────────

use super::url_utils::join_url;

/// 预扣费钱包拆分记录
#[allow(dead_code)]
pub struct PreDeductSplit {
    pub gift: f64,    // 从赠送余额扣除的金额
    pub balance: f64, // 从系统余额扣除的金额
}

#[allow(dead_code)]
impl PreDeductSplit {
    pub fn zero() -> Self { Self { gift: 0.0, balance: 0.0 } }
    pub fn total(&self) -> f64 { self.gift + self.balance }
}

/// 事务化预扣费：FOR UPDATE 锁行防并发，精确记录双钱包扣除比例
pub async fn pre_deduct(state: &Arc<AppState>, user_id: &str, amount: f64) -> Result<PreDeductSplit, sqlx::Error> {
    if amount <= 0.0 {
        return Ok(PreDeductSplit::zero());
    }
    let mut tx = state.db.pool.begin().await?;
    let (bal, gift, credit): (f64, f64, f64) = sqlx::query_as(
        &state.db.format_query("SELECT balance, gift_balance, credit_limit FROM users WHERE id = ? FOR UPDATE")
    ).bind(user_id).fetch_one(&mut *tx).await?;

    if bal + gift + credit < amount {
        tx.rollback().await?;
        return Err(sqlx::Error::RowNotFound);
    }
    // 对齐精度（避免浮点运算产生 0.19999999999999996 之类的值）
    let gift_deducted = (amount.min(gift) * 1_000_000.0).round() / 1_000_000.0;
    let balance_deducted = ((amount - gift_deducted) * 1_000_000.0).round() / 1_000_000.0;

    sqlx::query(&state.db.format_query(
        "UPDATE users SET balance = balance - ?, gift_balance = gift_balance - ? WHERE id = ?"
    )).bind(balance_deducted).bind(gift_deducted).bind(user_id)
    .execute(&mut *tx).await?;
    tx.commit().await?;

    Ok(PreDeductSplit { gift: gift_deducted, balance: balance_deducted })
}


// ── 预记录日志（请求前写入） ────────────────────────────────────
//
// 【一条日志原则】每个模型请求全生命周期只产生一条日志记录：
//   1. 请求发送前：调用 record_pending_log 插入 status_code=0 的"处理中"日志
//   2. 请求完成后：调用 record_and_bill* 系列函数时传入 pending_log_id，
//      通过 UPDATE 更新该日志行的最终状态、响应、计费等信息
//   3. 其他开发者/AI 在新增模型请求端点时必须遵循此原则，不得额外 INSERT 日志
//

/// Base64 数据脱敏：将请求/响应内容中的 base64 长串替换为占位符，减少日志体积。
/// 供预记录和最终记录共用，保证数据处理一致性。
pub fn sanitize_base64(text: &str) -> String {
    // 规则 1: data URI 格式 (data:image/png;base64,...)
    let re_data_uri = Regex::new(r"data:[^;]+;base64,[A-Za-z0-9+/=]{100,}").unwrap();
    let text = re_data_uri.replace_all(text, "base64数据").to_string();
    // 规则 2: 纯 base64 长串 (无 data: 前缀，如 b64_json / inline_data 字段)
    let re_raw_b64 = Regex::new(r#""[A-Za-z0-9+/]{200,}={0,2}""#).unwrap();
    re_raw_b64.replace_all(&text, "\"base64数据\"").to_string()
}

/// 在上游请求发送前预记录一条"处理中"日志（status_code=0），返回 log_id。
/// 使用户能立即在日志页面看到请求记录，而不必等待上游响应。
/// 存入的信息包括：用户信息、渠道、模型、请求参数、端点、流式标志等。
/// 预记录阶段不存储 upstream_req_content（上游请求参数），因为此时请求尚未真正发送给上游，
/// 该字段在请求完成后由 record_and_bill_inner UPDATE 写入。
/// 预记录阶段即执行 URL 密钥脱敏、Base64 脱敏和上下文开关控制，与最终日志保持数据安全一致性。
pub async fn record_pending_log(
    state: &Arc<AppState>,
    user_id: &str,
    channel_id: i64,
    token_id: i64,
    model: &str,
    endpoint: &str,
    is_stream: i32,
    request_content: Option<&str>,
    upstream_url: Option<&str>,
    channel: Option<&crate::models::Channel>,
    billing_model_hint: Option<&str>,
    plugin_tag: Option<&str>,
    category: Option<&str>,
    db_model: Option<&crate::models::Model>,
    forward_eid: Option<&str>,
    requested_log_id: Option<&str>,
) -> Option<i64> {
    // 计费模型提示：插件（如快乐小马）解析后的实际模型，用于正确查询元信息
    let meta_model = billing_model_hint.unwrap_or(model);
    let (action_type, billing_pid, enable_log) = resolve_model_meta(state, meta_model, category, channel, db_model).await;
    // 根据 action_type 生成带前缀的 log_id (ULID)
    let log_id_prefix = if !action_type.is_empty() && action_type != "聊天" {
        "tsk_"
    } else {
        "log_"
    };
    let generated_log_id = requested_log_id.map(|s| s.to_string()).unwrap_or_else(|| {
        format!("{}{}", log_id_prefix, ulid::Ulid::new().to_string().to_lowercase())
    });
    // forward_eid: 优先使用调用方从 resolve_forward_rule 解析到的 eid，避免二次查库
    let forward_eid: Option<String> = forward_eid
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // URL 密钥脱敏：与最终日志（record_and_bill_inner）保持一致
    let masked_url: Option<String> = upstream_url.map(|u| {
        if let Some(ch) = channel {
            super::forward::mask_key_in_string(u, &ch.api_key)
        } else {
            u.to_string()
        }
    });

    // 上下文开关 + Base64 脱敏：与最终日志 filter_content 行为完全一致
    let stored_req: Option<String> = if enable_log > 0 {
        request_content.map(sanitize_base64)
    } else { None };

    let sql = state.db.format_query(
        "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, \
         cached_tokens, cost, status_code, endpoint, error_message, latency_ms, \
         request_content, response_content, is_stream, upstream_url, \
         billing_detail, task_id, action_type, billing_pid, forward_eid, plugin_tag) \
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0.0, 0, ?, NULL, 0, ?, NULL, ?, ?, \
                 '请求处理中', '', ?, ?, ?, ?) RETURNING id"
    );

    let (sys_ep, _upstream_ep) = if endpoint.contains('|') {
        let parts: Vec<&str> = endpoint.splitn(2, '|').collect();
        (parts[0], parts[1])
    } else {
        (endpoint, endpoint)
    };

    let res = sqlx::query_scalar::<_, i64>(&sql)
        .bind(&generated_log_id)
        .bind(user_id)
        .bind(channel_id)
        .bind(token_id)
        .bind(model)
        .bind(sys_ep)
        .bind(stored_req.as_deref())
        .bind(is_stream)
        .bind(masked_url.as_deref())
        .bind(&action_type)
        .bind(&billing_pid)
        .bind(&forward_eid)
        .bind(plugin_tag.unwrap_or(""))
        .fetch_one(&state.db.pool)
        .await;

    match res {
        Ok(id) => {
            tracing::info!("[PendingLog] id={}, log_id={}, model={}, ep={}", id, generated_log_id, model, sys_ep);
            Some(id)
        }
        Err(e) => {
            tracing::error!("[PendingLog] 预记录失败: {:?}", e);
            None
        }
    }
}

/// 从 models 表解析模型元信息（action_type / billing_pid / enable_log_content）
/// 供预记录和最终记录复用，避免代码重复。
/// channel: 可选渠道信息，用于同 model_id 多条记录时精确匹配渠道绑定的 mid，
///          确保 billing_pid 与实际计费规则一致。
/// db_model: 调用方已查询的 Model 记录（主键定位，极快且无歧义）。传 None 时按 model_id 查询。
/// forward_eid 不在此函数查询——各端点在 resolve_forward_rule 时已获取，直接透传给 record_pending_log。
async fn resolve_model_meta(
    state: &AppState,
    model_name: &str,
    hint_category: Option<&str>,
    channel: Option<&crate::models::Channel>,
    db_model: Option<&crate::models::Model>,
) -> (String, Option<String>, i32) {
    let mut action_type = String::new();
    let mut billing_pid: Option<String> = None;
    let mut enable_log: i32 = 0;

    // 统一 JOIN 查询，根据是否有 db_model 选择最优 WHERE 条件
    use sqlx::Row;
    let base_select = "SELECT m.mid, m.enable_log_content, \
         t.name as category_name, b.pid as billing_pid \
         FROM models m \
         LEFT JOIN model_types t ON m.type_id = t.id \
         LEFT JOIN billing_rules b ON m.billing_rule_id = b.id";

    let row = if let Some(m) = db_model {
        // 主键精确定位（一次查询、一行结果、无歧义）
        let sql = format!("{} WHERE m.id = ?", base_select);
        sqlx::query(&state.db.format_query(&sql))
            .bind(m.id)
            .fetch_optional(&state.db.pool)
            .await
            .unwrap_or(None)
    } else {
        // 按 model_id 查询 + 类别过滤 + 渠道精确匹配
        let cat_filter = if let Some(cat) = hint_category {
            format!(" AND t.name = '{}'", cat)
        } else {
            String::new()
        };
        let sql = format!(
            "{} WHERE m.model_id = ? AND m.is_active = 1{} ORDER BY m.id",
            base_select, cat_filter
        );
        let rows = sqlx::query(&state.db.format_query(&sql))
            .bind(model_name)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default();

        if rows.is_empty() {
            return (action_type, billing_pid, enable_log);
        }

        // 优先通过渠道精确匹配，确保 billing_pid 与计费路径一致
        // 渠道 models 字段可能是 mid 或 model_id 格式，两种均尝试匹配
        let target_row = if let Some(ch) = channel {
            let ch_models = ch.get_models();
            if !ch_models.is_empty() {
                rows.iter().position(|r| {
                    let mid: String = r.try_get("mid").unwrap_or_default();
                    ch_models.contains(&mid)
                })
                .or_else(|| rows.iter().position(|_| ch_models.contains(&model_name.to_string())))
            } else {
                None
            }
        } else {
            None
        };
        let idx = target_row.unwrap_or(0);
        Some(rows.into_iter().nth(idx).unwrap())
    };

    let row = match row {
        Some(r) => r,
        None => return (action_type, billing_pid, enable_log),
    };

    action_type = row.try_get("category_name").unwrap_or_default();
    billing_pid = row.try_get("billing_pid").unwrap_or(None);
    enable_log = row.try_get("enable_log_content").unwrap_or(0);

    tracing::info!(
        "[ModelMeta] model={}, category={}, billing_pid={}, enable_log={}, source={}",
        model_name, action_type,
        billing_pid.as_deref().unwrap_or("-"),
        enable_log,
        if db_model.is_some() { "pk" } else { "query" }
    );

    (action_type, billing_pid, enable_log)
}

pub async fn record_error_log(
    state: &Arc<AppState>,
    user_id: &str,
    channel_id: Option<i64>,
    token_id: Option<i64>,
    model: &str,
    status_code: u16,
    endpoint: &str,
    error_msg: &str,
    upstream_url: Option<&str>,
    action_type: Option<&str>,
) {
    let sql = state.db.format_query(
        "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url, action_type) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0.0, ?, ?, ?, 0, NULL, NULL, 0, ?, ?)"
    );
    let cid = channel_id.unwrap_or(0);
    let tid = token_id.unwrap_or(0);
    let error_log_id = format!("log_{}", ulid::Ulid::new().to_string().to_lowercase());
    
    let res = sqlx::query(&sql)
        .bind(&error_log_id)
        .bind(user_id)
        .bind(cid)
        .bind(tid)
        .bind(model)
        .bind(status_code as i32)
        .bind(endpoint)
        .bind(error_msg)
        .bind(upstream_url.unwrap_or(""))
        .bind(action_type.unwrap_or(""))
        .execute(&state.db.pool)
        .await;

    if let Err(e) = res {
        tracing::error!("Failed to record error log: {:?}", e);
    }
}

/// 计费记录统一入口
/// 【一条日志原则】pending_log_id 有值时 UPDATE 预记录行，无值时 INSERT 新行
/// billing_model_hint: 插件解析后的实际模型（用于正确查询 billing_pid 等元信息），普通场景传 None
/// plugin_tag: 插件标记JSON（仅 INSERT 新行时使用，UPDATE 不覆盖预记录值）
/// db_model: 调用方已查询的 Model 记录，传入后 resolve_model_meta 走主键精确定位，避免重复查库
pub async fn record_and_bill_inner(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel_id: i64,
    model_name: &str,
    prompt_tokens: i32,
    completion_tokens: i32,
    cached_tokens: i32,
    cost: f64,
    pre_deducted: f64,
    pre_deduct_gift: f64,
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
    pending_log_id: Option<i64>,
    billing_model_hint: Option<&str>,
    plugin_tag: Option<&str>,
    db_model: Option<&crate::models::Model>,
) {
    // 查询渠道信息（后续 channel_info 构建和 resolve_model_meta 共用，避免重复查库）
    let channel_obj: Option<crate::models::Channel> = if channel_id > 0 {
        sqlx::query_as(
            &state.db.format_query("SELECT * FROM channels WHERE id = ?")
        ).bind(channel_id).fetch_optional(&state.db.pool).await.unwrap_or(None)
    } else { None };
    // 计费模型提示：插件（如快乐小马）解析后的实际模型，用于正确查询 billing_pid 等元信息
    let meta_model = billing_model_hint.unwrap_or(model_name);
    let (category, billing_pid, enable_log) = resolve_model_meta(state, meta_model, hint_category, channel_obj.as_ref(), db_model).await;

    let filter_content = |content: Option<String>, respect_log_flag: bool| -> Option<String> {
        let text = content?;
        if respect_log_flag && enable_log == 0 { return None; }
        Some(sanitize_base64(&text))
    };

    // ── 计费特征快照 ──
    // 在 filter_content 过滤之前，从原始 request_content 提取计费特征并序列化为 JSON。
    // 该快照独立于 enable_log 开关，确保异步任务 GET 轮询结算时始终有完整的计费参数。
    // 同时合并 upstream_req_content 的特征（转发规则可能修改了 duration/resolution 等参数）。
    let billing_features_json: Option<String> = {
        let mut feat = request_content.as_ref()
            .and_then(|rc| serde_json::from_str::<serde_json::Value>(rc).ok())
            .map(|json| crate::relay::usage_extractor::extract_request_features(&json));
        // 合并 upstream_req_content 的特征（如 asset_convert 后修改的参数）
        if let Some(upstream_feat) = upstream_req_content.as_ref()
            .and_then(|uc| serde_json::from_str::<serde_json::Value>(uc).ok())
            .map(|json| crate::relay::usage_extractor::extract_request_features(&json))
        {
            if let Some(ref mut f) = feat {
                if f.duration_seconds.is_none() { f.duration_seconds = upstream_feat.duration_seconds; }
                if f.resolution.is_none() { f.resolution = upstream_feat.resolution; }
                if f.mode.is_none() { f.mode = upstream_feat.mode; }
                if f.sound.is_none() { f.sound = upstream_feat.sound; }
                if upstream_feat.has_video { f.has_video = true; }
                if upstream_feat.has_audio { f.has_audio = true; }
                if upstream_feat.has_image_ref { f.has_image_ref = true; }
            } else {
                feat = Some(upstream_feat);
            }
        }
        feat.and_then(|f| serde_json::to_string(&f).ok())
    };

    // request_content / upstream_req_content 恢复尊重 enable_log 开关（计费不再依赖它们）
    let req_content = filter_content(request_content, true);
    let upstream_req = filter_content(upstream_req_content, true);
    
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

    // 复用上方已查询的 channel_obj，避免重复查库
    let mut channel_info: Option<(String, String, String)> = None;
    if let Some(ch) = &channel_obj {
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
        channel_info = Some((b, k, ch.provider_type.clone()));

        // ── 火山引擎卡池统计集成 ──
        #[cfg(feature = "commercial_plugins")]
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
        
        // 从响应体自动提取异步任务 ID（复用 response_formatter::find_id 统一逻辑）
        // 提前解析提取，用于判断当前是否为异步任务预扣冻结阶段
        let task_id = resp_content.as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .map(|v| {
                let id = super::response_formatter::find_id(&v);
                // 聊天响应（含 choices/candidates）的 id 字段是会话 ID，不是异步任务 ID
                // 仅当匹配到的是通用 id（而非明确的 task_id）时排除
                if !id.is_empty()
                    && (v.get("choices").is_some() || v.get("candidates").is_some())
                {
                    String::new()
                } else {
                    id
                }
            })
            .unwrap_or_default();

        // 异步任务预扣冻结判定：任务 ID 非空且计费详情中包含“冻结”
        let is_freeze = !task_id.is_empty() && billing_detail.as_deref().map_or(false, |d| d.contains("冻结"));

        // 始终更新令牌最后使用时间
        sqlx::query(&state.db.format_query(
            "UPDATE api_tokens SET last_used_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ))
        .bind(&now_str)
        .bind(token.id)
        .execute(&mut *tx)
        .await?;

        if cost > 0.0 || pre_deducted > 0.0 {
            let now_t = chrono::Local::now();
            let now_day = now_t.format("%Y-%m-%d").to_string();
            let now_week = now_t.format("%Y-%U").to_string();
            let now_month = now_t.format("%Y-%m").to_string();

            sqlx::query(&state.db.format_query(
                "UPDATE api_tokens SET \
                 quota_used = quota_used + ?, \
                 daily_quota_used = CASE WHEN last_reset_day <> ? THEN ? ELSE daily_quota_used + ? END, \
                 weekly_quota_used = CASE WHEN last_reset_week <> ? THEN ? ELSE weekly_quota_used + ? END, \
                 monthly_quota_used = CASE WHEN last_reset_month <> ? THEN ? ELSE monthly_quota_used + ? END, \
                 last_reset_day = ?, \
                 last_reset_week = ?, \
                 last_reset_month = ?, \
                 updated_at = CURRENT_TIMESTAMP \
                 WHERE id = ?",
            ))
            .bind(cost)
            .bind(&now_day).bind(cost).bind(cost)
            .bind(&now_week).bind(cost).bind(cost)
            .bind(&now_month).bind(cost).bind(cost)
            .bind(&now_day)
            .bind(&now_week)
            .bind(&now_month)
            .bind(token.id)
            .execute(&mut *tx)
            .await?;
            
            let apply_balance = cost - pre_deducted; // 正数表示还要扣，负数表示退款
            if apply_balance > 0.0 {
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET 
                     balance = CASE WHEN gift_balance >= ? THEN balance ELSE balance - (? - gift_balance) END,
                     gift_used_quota = gift_used_quota + ? + CASE WHEN gift_balance >= ? THEN ? ELSE gift_balance END,
                     gift_balance = CASE WHEN gift_balance >= ? THEN gift_balance - ? ELSE 0 END,
                     used_quota = used_quota + ?, 
                     updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?",
                ))
                .bind(apply_balance).bind(apply_balance)
                .bind(pre_deduct_gift).bind(apply_balance).bind(apply_balance)
                .bind(apply_balance).bind(apply_balance).bind(cost).bind(&token.user_id)
                .execute(&mut *tx)
                .await?;
            } else if apply_balance < 0.0 {
                // 退款：实际费用按先扣赠送原则分配，退还各钱包多扣部分
                let refund = -apply_balance;
                let gift_cost = cost.min(pre_deduct_gift); // 赠送钱包应承担的最终费用
                let gift_refund = pre_deduct_gift - gift_cost; // 退还赠送钱包的多扣部分
                let balance_refund = refund - gift_refund; // 剩余退还系统钱包
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, used_quota = used_quota + ?, gift_used_quota = gift_used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ))
                .bind(balance_refund)
                .bind(gift_refund)
                .bind(cost)
                .bind(gift_cost)
                .bind(&token.user_id)
                .execute(&mut *tx)
                .await?;
            } else {
                // apply_balance == 0
                // 异步任务预扣冻结阶段暂不累加已用配额，在终态结算时再由 execute_settlement_tx 累加
                let (add_used, add_gift) = if is_freeze {
                    (0.0, 0.0)
                } else {
                    (cost, cost.min(pre_deduct_gift))
                };
                sqlx::query(&state.db.format_query(
                    "UPDATE users SET used_quota = used_quota + ?, gift_used_quota = gift_used_quota + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ))
                .bind(add_used)
                .bind(add_gift)
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

        let db_post_response = if is_freeze {
            resp_content.clone()
        } else {
            None
        };

        let final_action_type = if !category.is_empty() {
            category.clone()
        } else {
            hint_category.unwrap_or_default().to_string()
        };

        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行，否则 INSERT 新行
        if let Some(log_id) = pending_log_id {
            sqlx::query(&state.db.format_query(
                "UPDATE logs SET channel_id = ?, model = ?, \
                 prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?, \
                 cost = ?, status_code = ?, endpoint = ?, error_message = ?, latency_ms = ?, \
                 request_content = ?, response_content = ?, post_response = ?, upstream_url = ?, \
                 upstream_req_content = ?, billing_detail = ?, \
                 task_id = CASE WHEN ? = '' OR ? IS NULL THEN task_id ELSE ? END, \
                 action_type = ?, billing_pid = ?, \
                 billing_features = ?, pre_deduct_gift = ? \
                 WHERE id = ?",
            ))
            .bind(channel_id)
            .bind(model_name)
            .bind(prompt_tokens)
            .bind(completion_tokens)
            .bind(cached_tokens)
            .bind(cost)
            .bind(status_code as i32)
            .bind(system_endpoint)
            .bind(error_msg)
            .bind(latency_ms as i32)
            .bind(&req_content)
            .bind(&resp_content)
            .bind(&db_post_response)
            .bind(&final_endpoint)
            .bind(&upstream_req)
            .bind(&billing_detail)
            .bind(&task_id).bind(&task_id).bind(&task_id)
            .bind(&final_action_type)
            .bind(&billing_pid)
            .bind(&billing_features_json)
            .bind(pre_deduct_gift)
            .bind(log_id)
            .execute(&mut *tx)
            .await?;
        } else {
            let fb_prefix = if !final_action_type.is_empty() && final_action_type != "聊天" { "tsk_" } else { "log_" };
            let fallback_log_id = format!("{}{}", fb_prefix, ulid::Ulid::new().to_string().to_lowercase());
            sqlx::query(&state.db.format_query(
                "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, post_response, is_stream, upstream_url, upstream_req_content, billing_detail, task_id, action_type, billing_pid, forward_eid, billing_features, pre_deduct_gift, plugin_tag) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ))
            .bind(&fallback_log_id)
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
            .bind(&req_content)
            .bind(&resp_content)
            .bind(&db_post_response)
            .bind(is_stream)
            .bind(&final_endpoint)
            .bind(&upstream_req)
            .bind(&billing_detail)
            .bind(&task_id)
            .bind(&final_action_type)
            .bind(&billing_pid)
            .bind::<Option<String>>(None)  // forward_eid: 预记录阶段已写入，无预记录时留空
            .bind(&billing_features_json)
            .bind(pre_deduct_gift)
            .bind(plugin_tag.unwrap_or(""))
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
    .await;
    if let Err(e) = res {
        tracing::error!("Failed to record relay usage: {:?}", e);
    }
}

/// 清理孤儿预记录日志（status_code=0 且超过指定时间）
/// 定时调用，将超时日志标记为 408 并退还预扣费
pub async fn cleanup_orphan_pending_logs(state: &Arc<AppState>) {
    // 查找超过 30 分钟仍为"处理中"的孤儿日志
    // cost 字段存储的是预扣费总额（pre_deduction），pre_deduct_gift 是赠送钱包扣除部分
    let orphans: Vec<(i64, String, f64, f64)> = match sqlx::query_as(
        &state.db.format_query(
            "SELECT id, user_id, cost, pre_deduct_gift FROM logs \
             WHERE status_code = 0 AND created_at::timestamptz < CURRENT_TIMESTAMP - INTERVAL '30 minutes'"
        )
    )
    .fetch_all(&state.db.pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("[OrphanCleanup] 查询孤儿日志失败: {:?}", e);
            return;
        }
    };

    if orphans.is_empty() {
        return;
    }

    tracing::info!("[OrphanCleanup] 发现 {} 条孤儿日志，开始清理", orphans.len());

    for (log_id, user_id, cost, pre_deduct_gift) in &orphans {
        let mut tx = match state.db.pool.begin().await {
            Ok(tx) => tx,
            Err(e) => {
                tracing::error!("[OrphanCleanup] 启动事务失败: {:?}", e);
                continue;
            }
        };

        // 更新日志状态为 408（请求超时），CAS 防并发
        let update_res = sqlx::query(&state.db.format_query(
            "UPDATE logs SET status_code = 408, cost = 0.0, pre_deduct_gift = 0.0, \
             error_message = '请求处理超时或连接中断', \
             billing_detail = '孤儿日志清理，预扣费已退回' \
             WHERE id = ? AND status_code = 0"
        ))
        .bind(log_id)
        .execute(&mut *tx)
        .await;

        let affected = match update_res {
            Ok(r) => r.rows_affected(),
            Err(e) => {
                tracing::error!("[OrphanCleanup] 更新日志 {} 失败: {:?}", log_id, e);
                let _ = tx.rollback().await;
                continue;
            }
        };
        if affected == 0 {
            let _ = tx.rollback().await;
            continue;
        }

        // 退还预扣费（如有）：同时退还系统钱包和赠送钱包
        if *cost > 0.0 || *pre_deduct_gift > 0.0 {
            let balance_refund = *cost - *pre_deduct_gift;
            if let Err(e) = sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ))
            .bind(balance_refund)
            .bind(pre_deduct_gift)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            {
                tracing::error!("[OrphanCleanup] 退还用户 {} 预扣费失败: {:?}", user_id, e);
                let _ = tx.rollback().await;
                continue;
            }
        }

        if let Err(e) = tx.commit().await {
            tracing::error!("[OrphanCleanup] 提交事务失败: {:?}", e);
        } else if *cost > 0.0 || *pre_deduct_gift > 0.0 {
            let balance_refund = *cost - *pre_deduct_gift;
            tracing::info!("[OrphanCleanup] 日志 {} 已清理，退还用户 {} 系统钱包 {:.6} + 赠送钱包 {:.6}", log_id, user_id, balance_refund, pre_deduct_gift);
        } else {
            tracing::info!("[OrphanCleanup] 日志 {} 已清理（无预扣费）", log_id);
        }
    }
}

/// 服务启动时恢复上次中断遗留的"处理中"日志
/// 仅处理非异步冻结任务（异步任务由 task 模块后台轮询自动恢复，不重复调用上游）
pub async fn recover_interrupted_logs(state: &Arc<AppState>) {
    let orphans: Vec<(i64, String, f64, f64)> = match sqlx::query_as(
        &state.db.format_query(
            "SELECT id, user_id, cost, pre_deduct_gift FROM logs \
             WHERE status_code = 0 AND billing_detail NOT LIKE '%冻结%'"
        )
    )
    .fetch_all(&state.db.pool)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("[StartupRecover] 查询中断日志失败: {:?}", e);
            return;
        }
    };

    if orphans.is_empty() {
        return;
    }

    tracing::info!("[StartupRecover] 发现 {} 条上次中断遗留的处理中日志", orphans.len());

    for (log_id, user_id, cost, pre_deduct_gift) in &orphans {
        let mut tx = match state.db.pool.begin().await {
            Ok(tx) => tx,
            Err(e) => {
                tracing::error!("[StartupRecover] 启动事务失败: {:?}", e);
                continue;
            }
        };

        // CAS: 仅更新仍为 status_code=0 的日志，防止与其他清理逻辑并发
        let result = sqlx::query(&state.db.format_query(
            "UPDATE logs SET status_code = 503, cost = CASE WHEN ? > 0 THEN 0.0 ELSE cost END, pre_deduct_gift = CASE WHEN ? > 0 THEN 0.0 ELSE pre_deduct_gift END, \
             error_message = '服务升级重启，请求被中断', \
             billing_detail = CASE WHEN ? > 0 THEN '服务升级中断，预扣费已退回' \
                 ELSE '服务升级中断' END \
             WHERE id = ? AND status_code = 0"
        ))
        .bind(cost)
        .bind(pre_deduct_gift)
        .bind(cost)
        .bind(log_id)
        .execute(&mut *tx)
        .await;

        let affected = result.as_ref().map(|r| r.rows_affected()).unwrap_or(0);
        if affected == 0 {
            let _ = tx.rollback().await;
            continue;
        }

        // 退还预扣费（如有）：同时退还系统余额和赠送余额
        if *cost > 0.0 || *pre_deduct_gift > 0.0 {
            let balance_refund = *cost - *pre_deduct_gift;
            if let Err(e) = sqlx::query(&state.db.format_query(
                "UPDATE users SET balance = balance + ?, gift_balance = gift_balance + ?, \
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ))
            .bind(balance_refund)
            .bind(pre_deduct_gift)
            .bind(user_id)
            .execute(&mut *tx)
            .await
            {
                tracing::error!("[StartupRecover] 退还用户 {} 预扣费失败: {:?}", user_id, e);
                let _ = tx.rollback().await;
                continue;
            }
        }

        if let Err(e) = tx.commit().await {
            tracing::error!("[StartupRecover] 提交事务失败: {:?}", e);
        } else if *cost > 0.0 || *pre_deduct_gift > 0.0 {
            tracing::info!("[StartupRecover] 日志 {} 已恢复，退还用户 {} 预扣费 {} (gift: {})",
                log_id, user_id, cost, pre_deduct_gift);
        } else {
            tracing::info!("[StartupRecover] 日志 {} 已标记为服务中断（无预扣费）", log_id);
        }
    }
}

/// 错误信息敏感词脱敏：URL 域名替换为 ***（保留协议和路径），密钥替换为 ***。
/// 仅用于普通用户端返回和日志展示，管理员端保留原始信息用于排查。
pub fn sanitize_error_message(msg: &str) -> String {
    // URL 域名脱敏：https://api.example.com/v1/... → https://***​/v1/...
    let re_url = Regex::new(r"(https?://)([^/\s)\]},]+)").unwrap();
    let result = re_url.replace_all(msg, "${1}***").to_string();
    // API 密钥脱敏：sk-xxxx 等格式
    let re_key = Regex::new(r"\bsk-[a-zA-Z0-9]{8,}\b").unwrap();
    re_key.replace_all(&result, "***").to_string()
}

/// 从可能为 JSON 格式的错误响应体中提取最核心的错误文本信息
pub fn extract_error_message(resp_body: &str) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(resp_body) {
        if let Some(msg) = json.pointer("/error/message").or(json.get("message")).and_then(|v| v.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = json.pointer("/Response/Error/Message").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = json.pointer("/ResponseMetadata/Error/Message").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
    }
    resp_body.to_string()
}

/// 根据错误文本（支持中英文），智能推断业务错误状态码
pub fn infer_error_status_code(err_msg: &str) -> u16 {
    let err_msg_lower = err_msg.to_lowercase();
    // 1. 内容安全/敏感词/违规过滤/政策屏蔽
    if err_msg_lower.contains("safety") 
        || err_msg_lower.contains("censor") 
        || err_msg_lower.contains("policy") 
        || err_msg_lower.contains("violation")
        || err_msg_lower.contains("block")
        || err_msg_lower.contains("sensitive")
        || err_msg_lower.contains("moderation")
        || err_msg_lower.contains("content_filter")
        || err_msg_lower.contains("敏感")
        || err_msg_lower.contains("违规")
        || err_msg_lower.contains("安全")
        || err_msg_lower.contains("政策")
        || err_msg_lower.contains("审核")
    {
        return 403;
    }
    // 2. 鉴权失败/无效 Key/密钥被封/授权失效
    if err_msg_lower.contains("auth") 
        || err_msg_lower.contains("unauthorized") 
        || err_msg_lower.contains("api_key") 
        || err_msg_lower.contains("credential")
        || err_msg_lower.contains("invalid_key")
        || err_msg_lower.contains("bad_key")
        || err_msg_lower.contains("token")
        || err_msg_lower.contains("revoked")
        || err_msg_lower.contains("unauthenticated")
        || err_msg_lower.contains("鉴权")
        || err_msg_lower.contains("密钥")
        || err_msg_lower.contains("授权")
    {
        return 401;
    }
    // 3. 限流/超出额度/欠费不足
    if err_msg_lower.contains("limit") 
        || err_msg_lower.contains("quota") 
        || err_msg_lower.contains("exceeded") 
        || err_msg_lower.contains("rate")
        || err_msg_lower.contains("insufficient")
        || err_msg_lower.contains("out of budget")
        || err_msg_lower.contains("payment")
        || err_msg_lower.contains("欠费")
        || err_msg_lower.contains("额度")
        || err_msg_lower.contains("限流")
        || err_msg_lower.contains("并发")
        || err_msg_lower.contains("超出")
        || err_msg_lower.contains("不足")
    {
        return 429;
    }
    // 4. 超时/网关/连接中断/上游无响应
    if err_msg_lower.contains("timeout") 
        || err_msg_lower.contains("gateway") 
        || err_msg_lower.contains("connect") 
        || err_msg_lower.contains("disconnect")
        || err_msg_lower.contains("abort")
        || err_msg_lower.contains("unreachable")
        || err_msg_lower.contains("超时")
        || err_msg_lower.contains("网关")
        || err_msg_lower.contains("中断")
    {
        return 504;
    }
    // 5. 上游服务器内部故障/执行渲染错误
    if err_msg_lower.contains("internal") 
        || err_msg_lower.contains("server") 
        || err_msg_lower.contains("failed") 
        || err_msg_lower.contains("error")
        || err_msg_lower.contains("bug")
        || err_msg_lower.contains("crash")
        || err_msg_lower.contains("故障")
        || err_msg_lower.contains("服务器错误")
        || err_msg_lower.contains("执行失败")
        || err_msg_lower.contains("异常")
    {
        return 500;
    }
    // 6. 默认回落到 400
    400
}
