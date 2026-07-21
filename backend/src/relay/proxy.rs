//! Shared proxy utilities — user context, billing, logging.
//! All relay handlers reuse these to avoid code duplication.

use super::router;
use crate::error::{AppError, AppResult};
use crate::models::ApiToken;
use crate::models::Channel;
use crate::AppState;
use regex::Regex;
use std::sync::Arc;

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
    Ok(UserContext {
        user_group: g,
        level_id: l_id.to_string(),
        balance: b + gb + cl,
        discount: d,
        model_discounts: md,
        role: r,
    })
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
    let mut rule: crate::models::BillingRule = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM billing_rules WHERE id = ? AND is_active = 1"),
    )
    .bind(rule_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None)?;

    // 使用缓存时区计算并赋能运行时 applied_multiplier，但不改变实体内的单价，实现安全的后置计费
    let (default_site_tz, _) = super::get_cached_config(state).await;
    rule.applied_multiplier = rule.get_current_multiplier(&default_site_tz);

    Some(rule)
}

/// 按 model_id 查找活跃模型，可选传入 category 以区分同名但不同类型的模型。
/// category: Some("图片") / Some("视频") / Some("聊天") / None（不限类型）
pub async fn find_active_model_exact(
    state: &AppState,
    model_id: &str,
    category: Option<&str>,
    channel: Option<&crate::models::Channel>,
) -> Option<crate::models::Model> {
    // category 过滤条件（参数化绑定防止 SQL 注入）
    let cat_filter = if category.is_some() {
        " AND t.name = ?"
    } else {
        ""
    };

    // 1. 获取所有匹配的活跃模型候选（ORDER BY m.id 保证多候选时返回顺序确定性）
    let sql = format!(
        "SELECT m.*, t.name AS type_name FROM models m LEFT JOIN model_types t ON m.type_id = t.id WHERE m.model_id = ? AND m.is_active = 1{} ORDER BY m.id",
        cat_filter
    );
    let formatted_sql = state.db.format_query(&sql);
    let mut query = sqlx::query_as(&formatted_sql).bind(model_id);
    if let Some(cat) = category {
        query = query.bind(cat);
    }
    let mut candidates: Vec<crate::models::Model> =
        query.fetch_all(&state.db.pool).await.unwrap_or_default();

    if candidates.is_empty() && category.is_some() {
        let fallback_sql = "SELECT m.*, t.name AS type_name FROM models m LEFT JOIN model_types t ON m.type_id = t.id WHERE m.model_id = ? AND m.is_active = 1 ORDER BY m.id";
        candidates = sqlx::query_as(&state.db.format_query(fallback_sql))
            .bind(model_id)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default();
    }

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

/// 根据 mid 查找处于激活状态的模型数据
pub async fn find_active_model_by_mid(state: &AppState, mid: &str) -> Option<crate::models::Model> {
    let sql = "SELECT m.*, t.name AS type_name FROM models m LEFT JOIN model_types t ON m.type_id = t.id WHERE m.mid = ? AND m.is_active = 1 LIMIT 1";
    sqlx::query_as(&state.db.format_query(sql))
        .bind(mid)
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None)
}

// ── Access Check ────────────────────────────────────────────────

/// 根据 category 推断标准 endpoint 路径（用于错误日志记录）
pub fn category_endpoint(category: Option<&str>) -> &'static str {
    match category {
        Some("图片") => "/v1/images/generations",
        Some("视频") | Some("视频增强") => "/v1/video/generations",
        Some("音频") => "/v1/audio/speech",
        Some("向量") => "/v1/embeddings",
        Some("排序") => "/v1/rerank",
        _ => "/v1/chat/completions",
    }
}

/// 入口类型与模型真实类型是否互通（目前仅视频 ↔ 视频增强）
#[inline]
fn category_compatible(expected: &str, resolved: &str) -> bool {
    expected == resolved
        || (expected == "视频" && resolved == "视频增强")
        || (expected == "视频增强" && resolved == "视频")
}

/// 类型隔离失败文案：真实类型 + 实际入口（action_type 另记入口，见 check_access）
#[inline]
fn type_mismatch_message(model: &str, resolved_cat: &str, expected_cat: &str) -> String {
    format!(
        "模型 '{}' 为 '{}' 类型，不支持当前 '{}' 接口请求",
        model, resolved_cat, expected_cat
    )
}

/// 路径→类型兜底（仅鉴权中间件 / 历史日志补全等「业务模块尚未透传」场景）。
/// 业务失败日志应优先透传模块已知的 category，勿依赖本函数。
pub fn action_type_from_path(endpoint: &str) -> Option<&'static str> {
    let ep = endpoint
        .split('|')
        .next()
        .unwrap_or(endpoint)
        .to_ascii_lowercase();
    // 更具体的规则在前
    const RULES: &[(&str, &str)] = &[
        ("enhance-video", "视频增强"),
        ("erase-video", "视频增强"),
        ("contents/generations", "视频"),
        ("video-generation", "视频"),
        ("video-synthesis", "视频"),
        ("/videos/", "视频"),
        ("/video/", "视频"),
        ("multimodal-generation", "图片"),
        ("/images/", "图片"),
        ("/image/", "图片"),
        ("/audio/", "音频"),
        ("/tts", "音频"),
        ("/speech", "音频"),
        ("embedding", "向量"),
        ("rerank", "排序"),
        ("/chat/", "聊天"),
        ("/messages", "聊天"),
        ("/responses", "聊天"),
        ("v1beta/models", "聊天"),
    ];
    RULES.iter().find(|(k, _)| ep.contains(k)).map(|(_, v)| *v)
}

/// Token 模型权限校验（渠道选择 **之前** 调用，快速拦截未授权模型）。
/// `action_type`: 调用方已知类别（如 "图片"），失败落库时透传，保证日志 Tab 定位正确。
pub async fn check_model_permission(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    endpoint: &str,
    action_type: Option<&str>,
) -> AppResult<()> {
    if !token.is_model_allowed(model) {
        let msg = format!("Model {} not allowed for this token", model);
        record_error_log(
            state,
            &token.user_id,
            None,
            Some(token.id),
            model,
            403,
            endpoint,
            &msg,
            None,
            action_type,
        )
        .await;
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
) -> AppResult<(f64, Option<crate::models::Model>, String)> {
    check_access_with_model(state, token, model, ctx, category, channel, None).await
}

/// 支持透传预查模型实体的安全隔离扣费校验，规避 find_active_model_exact 内部的二次查表
pub async fn check_access_with_model(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    ctx: &UserContext,
    category: Option<&str>,
    channel: Option<&crate::models::Channel>,
    pre_fetched_model: Option<crate::models::Model>,
) -> AppResult<(f64, Option<crate::models::Model>, String)> {
    let db_model = if let Some(m) = pre_fetched_model {
        Some(m)
    } else {
        find_active_model_exact(state, model, category, channel).await
    };

    // 获取真实分类
    let resolved_cat = if let Some(ref m) = db_model {
        m.type_name
            .clone()
            .unwrap_or_else(|| category.unwrap_or("").to_string())
    } else {
        category.unwrap_or("").to_string()
    };

    let ep = category_endpoint(category);
    let ch_id = channel.map(|c| c.id);
    let up_url = channel.map(|c| c.base_url.as_str());

    // 类型安全隔离：action_type 记入口 expected（Tab=endpoint），文案带模型真实类型 resolved
    if let Some(expected_cat) = category {
        if db_model.is_some() && !category_compatible(expected_cat, &resolved_cat) {
            let msg = type_mismatch_message(model, &resolved_cat, expected_cat);
            record_error_log(
                state,
                &token.user_id,
                ch_id,
                Some(token.id),
                model,
                400,
                ep,
                &msg,
                up_url,
                Some(expected_cat),
            )
            .await;
            return Err(AppError::BadRequest(msg));
        }
    }

    let pre_deduction = db_model.as_ref().map(|m| m.pre_deduction).unwrap_or(0.0);

    // 管理员用户免除余额和预扣费检测，直接放行
    let is_admin = ctx.role == "admin";

    if is_admin {
        return Ok((pre_deduction, db_model, resolved_cat));
    }

    if pre_deduction > 0.0 {
        if ctx.balance < pre_deduction {
            let currency_unit = crate::api::settings::get_currency_settings(state)
                .await
                .currency_unit;
            let msg = format!("账户余额不足{}{}", pre_deduction, currency_unit);
            record_error_log(
                state,
                &token.user_id,
                ch_id,
                Some(token.id),
                model,
                403,
                ep,
                &msg,
                up_url,
                Some(&resolved_cat),
            )
            .await;
            return Err(AppError::Forbidden(msg));
        }
    } else {
        if token.quota_limit < 0.0 && ctx.balance <= 0.0 {
            let msg = "余额不足";
            record_error_log(
                state,
                &token.user_id,
                ch_id,
                Some(token.id),
                model,
                403,
                ep,
                &msg,
                up_url,
                Some(&resolved_cat),
            )
            .await;
            return Err(AppError::Forbidden(msg.into()));
        }
    }

    Ok((pre_deduction, db_model, resolved_cat))
}

// ── Channel Selection ───────────────────────────────────────────

pub async fn select_channel_for_model(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    user_group: &str,
    level_id: &str,
    endpoint: &str,
    exclude_aids: &[String],
    log_miss: bool,
    action_type: Option<&str>,
) -> AppResult<Channel> {
    select_channel_with_db(
        state,
        token,
        model,
        user_group,
        level_id,
        endpoint,
        None,
        exclude_aids,
        log_miss,
        action_type,
    )
    .await
}

/// 渠道选择（支持透传 Model 实体，提取其 mid 规避 select_channel 内部的查表动作）。
/// `log_miss`: 选渠失败时是否写入日志。failover 循环中若已有上游错误应传 false，终态为 No available channels 时传 true。
/// `action_type`: 调用方已知类别，选渠失败落库时透传。
pub async fn select_channel_with_db(
    state: &Arc<AppState>,
    token: &ApiToken,
    model: &str,
    user_group: &str,
    level_id: &str,
    endpoint: &str,
    db_model: Option<&crate::models::Model>,
    exclude_aids: &[String],
    log_miss: bool,
    action_type: Option<&str>,
) -> AppResult<Channel> {
    let mids = db_model.map(|m| vec![m.mid.clone()]);
    let (allow_ha, _) = super::ha::policy(state, token.high_availability).await;
    match router::select_channel(
        state,
        model,
        user_group,
        level_id,
        exclude_aids,
        mids.as_deref(),
        allow_ha,
    )
    .await
    {
        Ok(ch) => Ok(ch),
        Err(e) => {
            if log_miss {
                let msg = if let AppError::NotFound(ref m) = e {
                    m.clone()
                } else {
                    e.to_string()
                };
                record_error_log(
                    state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    model,
                    404,
                    endpoint,
                    &msg,
                    None,
                    action_type,
                )
                .await;
            }
            Err(e)
        }
    }
}

/// 触发高可用子渠道熔断冷却
pub fn trigger_ha_meltdown(
    state: &Arc<AppState>,
    group_aid: &str,
    status_code: u16,
    error_message: &str,
) {
    // 正常渠道（非 HA 子渠道）不具备全局熔断功能
    if !group_aid.starts_with("ha_group_") {
        return;
    }

    use std::sync::atomic::Ordering;
    use std::time::{Duration, Instant};

    // 检查报错信息是否命中不熔断白名单（子字符串包含匹配，不区分大小写）
    if !error_message.is_empty() {
        if let Ok(whitelist) = state.ha_meltdown_whitelist.read() {
            let err_lower = error_message.to_lowercase();
            for pattern in whitelist.iter() {
                if !pattern.is_empty() && err_lower.contains(pattern.as_str()) {
                    tracing::info!(
                        "[HA Whitelist] 子渠道 {} 错误信息命中不熔断白名单 (关键词: {}), 跳过熔断",
                        group_aid,
                        pattern
                    );
                    return;
                }
            }
        }
    }

    let cooldown = match status_code {
        429 => state.ha_cooldown_429.load(Ordering::Relaxed),
        401 | 402 => state.ha_cooldown_auth.load(Ordering::Relaxed),
        404 => state.ha_cooldown_404.load(Ordering::Relaxed),
        _ => state.ha_cooldown_network.load(Ordering::Relaxed),
    };

    if cooldown > 0 {
        let block_until = Instant::now() + Duration::from_secs(cooldown.max(0) as u64);
        state
            .failed_channels
            .insert(group_aid.to_string(), block_until);
        tracing::warn!(
            "[HA Failover] 子渠道 {} 发生错误(HTTP {}), 自动熔断冷却 {} 秒",
            group_aid,
            status_code,
            cooldown
        );
    }

    // 定期 + 超阈值时清理过期熔断，防止 DashMap 无限增长
    static CLEANUP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = CLEANUP_COUNTER.fetch_add(1, Ordering::Relaxed);
    if n % 32 == 0 || state.failed_channels.len() > 2048 {
        crate::relay::ha::scrub_failed_channels(state);
    }
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
    pub fn zero() -> Self {
        Self {
            gift: 0.0,
            balance: 0.0,
        }
    }
    pub fn total(&self) -> f64 {
        self.gift + self.balance
    }
}

/// 事务化预扣费：FOR UPDATE 锁行防并发，精确记录双钱包扣除比例
pub async fn pre_deduct(
    state: &Arc<AppState>,
    user_id: &str,
    amount: f64,
) -> Result<PreDeductSplit, sqlx::Error> {
    if amount <= 0.0 {
        return Ok(PreDeductSplit::zero());
    }
    let mut tx = state.db.pool.begin().await?;
    let (bal, gift, credit): (f64, f64, f64) = sqlx::query_as(&state.db.format_query(
        "SELECT balance, gift_balance, credit_limit FROM users WHERE id = ? FOR UPDATE",
    ))
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;

    if bal + gift + credit < amount {
        tx.rollback().await?;
        return Err(sqlx::Error::RowNotFound);
    }
    // 对齐精度（避免浮点运算产生 0.19999999999999996 之类的值）
    let gift_deducted = crate::money::round_money(amount.min(gift));
    let balance_deducted = crate::money::round_money(amount - gift_deducted);

    sqlx::query(&state.db.format_query(
        "UPDATE users SET balance = balance - ?, gift_balance = gift_balance - ? WHERE id = ?",
    ))
    .bind(balance_deducted)
    .bind(gift_deducted)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(PreDeductSplit {
        gift: gift_deducted,
        balance: balance_deducted,
    })
}

/// 预扣费；失败时写 403 日志并返回 AppError（admin / 金额≤0 跳过）
pub async fn pre_deduct_or_intercept(
    state: &Arc<AppState>,
    token: &ApiToken,
    channel: &crate::models::Channel,
    model: &str,
    pre_deduction: f64,
    ep: &str,
    start_time: std::time::Instant,
    is_stream: i32,
    request_content_str: &str,
    upstream_body_str: &str,
    ep_tag: Option<String>,
    pending_log_id: Option<i64>,
    db_model: Option<&crate::models::Model>,
    role: &str,
    category: Option<&str>,
) -> AppResult<f64> {
    if pre_deduction <= 0.0 || role == "admin" {
        return Ok(0.0);
    }
    match pre_deduct(state, &token.user_id, pre_deduction).await {
        Ok(split) => Ok(split.gift),
        Err(e) => {
            let err_msg = match e {
                sqlx::Error::RowNotFound => "余额不足".to_string(),
                _ => format!("预扣费失败: {:?}", e),
            };
            tracing::error!("Pre deduction failed for {}: {:?}", token.user_id, e);
            let latency_ms = start_time.elapsed().as_millis() as u32;
            record_and_bill_inner(BillRecord {
                state,
                token,
                channel,
                model,
                prompt_tokens: 0,
                completion_tokens: 0,
                cached_tokens: 0,
                cost: 0.0,
                pre_deducted: 0.0,
                pre_deduct_gift: 0.0,
                status_code: 403,
                endpoint: ep,
                error_msg: Some(&err_msg),
                latency_ms,
                is_stream,
                request_content: Some(request_content_str.to_string()),
                response_content: Some(err_msg.clone()),
                upstream_req_content: Some(upstream_body_str.to_string()),
                billing_detail: ep_tag,
                hint_category: category,
                pending_log_id,
                billing_model_hint: None,
                plugin_tag: None,
                db_model,
            })
            .await;
            Err(if matches!(e, sqlx::Error::RowNotFound) {
                AppError::Forbidden("余额不足".to_string())
            } else {
                AppError::Internal(err_msg)
            })
        }
    }
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

/// 预记录日志参数（命名字段，避免位置参数踩坑）
pub struct PendingLog<'a> {
    pub state: &'a Arc<AppState>,
    pub user_id: &'a str,
    pub token_id: i64,
    pub model: &'a str,
    pub endpoint: &'a str,
    pub is_stream: i32,
    pub request_content: Option<&'a str>,
    pub upstream_url: Option<&'a str>,
    pub channel: &'a crate::models::Channel,
    pub billing_model_hint: Option<&'a str>,
    pub plugin_tag: Option<&'a str>,
    pub category: Option<&'a str>,
    pub db_model: Option<&'a crate::models::Model>,
    pub forward_eid: Option<&'a str>,
    pub requested_log_id: Option<&'a str>,
}

/// 在上游请求发送前预记录一条"处理中"日志（status_code=0），返回 log_id。
/// 使用户能立即在日志页面看到请求记录，而不必等待上游响应。
/// 存入的信息包括：用户信息、渠道、模型、请求参数、端点、流式标志等。
/// 预记录阶段不存储 upstream_req_content（上游请求参数），因为此时请求尚未真正发送给上游，
/// 该字段在请求完成后由 record_and_bill_inner UPDATE 写入。
/// 预记录阶段即执行 URL 密钥脱敏、Base64 脱敏和上下文开关控制，与最终日志保持数据安全一致性。
pub async fn record_pending_log(p: PendingLog<'_>) -> Option<i64> {
    let PendingLog {
        state,
        user_id,
        token_id,
        model,
        endpoint,
        is_stream,
        request_content,
        upstream_url,
        channel,
        billing_model_hint,
        plugin_tag,
        category,
        db_model,
        forward_eid,
        requested_log_id,
    } = p;
    // 计费模型提示：插件（如快乐小马）解析后的实际模型，用于正确查询元信息
    let meta_model = billing_model_hint.unwrap_or(model);
    let (mut action_type, billing_pid, enable_log) =
        resolve_model_meta(state, meta_model, category, Some(channel), db_model).await;
    // 元信息未解析到类型时透传调用方 category（业务模块已知，无需再猜 endpoint）
    if action_type.is_empty() {
        if let Some(cat) = category.map(str::trim).filter(|c| !c.is_empty()) {
            action_type = cat.to_string();
        }
    }
    let log_id_prefix = if !action_type.is_empty() && action_type != "聊天" {
        "tsk_"
    } else {
        "log_"
    };
    let generated_log_id = requested_log_id.map(|s| s.to_string()).unwrap_or_else(|| {
        format!(
            "{}{}",
            log_id_prefix,
            ulid::Ulid::new().to_string().to_lowercase()
        )
    });
    let forward_eid: Option<String> = forward_eid.filter(|s| !s.is_empty()).map(|s| s.to_string());

    let channel_config_id = super::ha::resolve_log_config_id(state, channel).await;
    let masked_url: Option<String> =
        upstream_url.map(|u| super::forward::mask_key_in_string(u, &channel.api_key));

    let stored_req: Option<String> = if enable_log > 0 {
        request_content.map(sanitize_base64)
    } else {
        None
    };

    let sql = state.db.format_query(
        "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, \
         cached_tokens, cost, status_code, endpoint, error_message, latency_ms, \
         request_content, response_content, is_stream, upstream_url, \
         billing_detail, task_id, action_type, billing_pid, forward_eid, plugin_tag, channel_config_id) \
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0.0, 0, ?, NULL, 0, ?, NULL, ?, ?, \
                 '请求处理中', '', ?, ?, ?, ?, ?) RETURNING id"
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
        .bind(channel.id)
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
        .bind(channel_config_id)
        .fetch_one(&state.db.pool)
        .await;

    match res {
        Ok(id) => {
            tracing::info!(
                "[PendingLog] id={}, log_id={}, model={}, ep={}",
                id,
                generated_log_id,
                model,
                sys_ep
            );
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
        let mut rows = sqlx::query(&state.db.format_query(&sql))
            .bind(model_name)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default();

        if rows.is_empty() && hint_category.is_some() {
            let fallback_sql = format!(
                "{} WHERE m.model_id = ? AND m.is_active = 1 ORDER BY m.id",
                base_select
            );
            rows = sqlx::query(&state.db.format_query(&fallback_sql))
                .bind(model_name)
                .fetch_all(&state.db.pool)
                .await
                .unwrap_or_default();
        }

        if rows.is_empty() {
            // 模型未入库时仍保留调用方类别提示，避免失败日志 action_type 为空
            if let Some(cat) = hint_category.filter(|c| !c.is_empty()) {
                action_type = cat.to_string();
            }
            return (action_type, billing_pid, enable_log);
        }

        // 优先通过渠道精确匹配，确保 billing_pid 与计费路径一致
        // 渠道 models 字段可能是 mid 或 model_id 格式，两种均尝试匹配
        let target_row = if let Some(ch) = channel {
            let ch_models = ch.get_models();
            if !ch_models.is_empty() {
                rows.iter()
                    .position(|r| {
                        let mid: String = r.try_get("mid").unwrap_or_default();
                        ch_models.contains(&mid)
                    })
                    .or_else(|| {
                        rows.iter()
                            .position(|_| ch_models.contains(&model_name.to_string()))
                    })
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
        None => {
            if let Some(cat) = hint_category.filter(|c| !c.is_empty()) {
                action_type = cat.to_string();
            }
            return (action_type, billing_pid, enable_log);
        }
    };

    action_type = row.try_get("category_name").unwrap_or_default();
    if action_type.is_empty() {
        if let Some(cat) = hint_category.filter(|c| !c.is_empty()) {
            action_type = cat.to_string();
        }
    }
    billing_pid = row.try_get("billing_pid").unwrap_or(None);
    enable_log = row.try_get("enable_log_content").unwrap_or(0);

    tracing::info!(
        "[ModelMeta] model={}, category={}, billing_pid={}, enable_log={}, source={}",
        model_name,
        action_type,
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
    let db_error_msg = extract_error_message(error_msg);
    // 优先用调用方透传的类型；仅未透传时（鉴权中间件）才按路径兜底
    let resolved_type = action_type
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| action_type_from_path(endpoint).map(|s| s.to_string()))
        .unwrap_or_default();
    let sql = state.db.format_query(
        "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, is_stream, upstream_url, action_type, is_completed) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0.0, ?, ?, ?, 0, NULL, NULL, 0, ?, ?, 1)"
    );
    let cid = channel_id.unwrap_or(0);
    let tid = token_id.unwrap_or(0);
    let log_prefix = if !resolved_type.is_empty() && resolved_type != "聊天" {
        "tsk_"
    } else {
        "log_"
    };
    let error_log_id = format!(
        "{}{}",
        log_prefix,
        ulid::Ulid::new().to_string().to_lowercase()
    );

    let res = sqlx::query(&sql)
        .bind(&error_log_id)
        .bind(user_id)
        .bind(cid)
        .bind(tid)
        .bind(model)
        .bind(status_code as i32)
        .bind(endpoint)
        .bind(&db_error_msg)
        .bind(upstream_url.unwrap_or(""))
        .bind(&resolved_type)
        .execute(&state.db.pool)
        .await;

    if let Err(e) = res {
        tracing::error!("Failed to record error log: {:?}", e);
    }
}

/// 最终记账/更新日志参数
pub struct BillRecord<'a> {
    pub state: &'a Arc<AppState>,
    pub token: &'a ApiToken,
    pub channel: &'a crate::models::Channel,
    pub model: &'a str,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub cached_tokens: i32,
    pub cost: f64,
    pub pre_deducted: f64,
    pub pre_deduct_gift: f64,
    pub status_code: u16,
    pub endpoint: &'a str,
    pub error_msg: Option<&'a str>,
    pub latency_ms: u32,
    pub is_stream: i32,
    pub request_content: Option<String>,
    pub response_content: Option<String>,
    pub upstream_req_content: Option<String>,
    pub billing_detail: Option<String>,
    pub hint_category: Option<&'a str>,
    pub pending_log_id: Option<i64>,
    pub billing_model_hint: Option<&'a str>,
    pub plugin_tag: Option<&'a str>,
    pub db_model: Option<&'a crate::models::Model>,
}

/// 计费记录统一入口
/// 【一条日志原则】pending_log_id 有值时 UPDATE 预记录行，无值时 INSERT 新行
/// billing_model_hint: 插件解析后的实际模型（用于正确查询 billing_pid 等元信息），普通场景传 None
/// plugin_tag: 插件标记JSON（仅 INSERT 新行时使用，UPDATE 不覆盖预记录值）
/// db_model: 调用方已查询的 Model 记录，传入后 resolve_model_meta 走主键精确定位，避免重复查库
/// channel: 已水合渠道（含最终 base_url/api_key/yid），禁止再查空父行覆盖
pub async fn record_and_bill_inner(p: BillRecord<'_>) {
    let BillRecord {
        state,
        token,
        channel,
        model: model_name,
        prompt_tokens,
        completion_tokens,
        cached_tokens,
        cost,
        pre_deducted,
        pre_deduct_gift,
        status_code,
        endpoint,
        error_msg,
        latency_ms,
        is_stream,
        request_content,
        response_content,
        upstream_req_content,
        billing_detail,
        hint_category,
        pending_log_id,
        billing_model_hint,
        plugin_tag,
        db_model,
    } = p;
    // 实时 TPM 观测（与计费路径同点，零写库）
    let live_total_tokens =
        (prompt_tokens.max(0) as u64).saturating_add(completion_tokens.max(0) as u64);
    crate::middleware::live_metrics::record_tokens(&token.user_id, token.id, live_total_tokens);

    let extracted_error_msg = error_msg.map(|msg| extract_error_message(msg));
    let db_error_msg = extracted_error_msg.as_deref();
    let channel_id = channel.id;

    let meta_model = billing_model_hint.unwrap_or(model_name);
    let (category, billing_pid, enable_log) =
        resolve_model_meta(state, meta_model, hint_category, Some(channel), db_model).await;

    // HA: group_aid；物理: preset_id；内存 yid 补全 config_id
    let channel_config_id = super::ha::resolve_log_config_id(state, channel).await;

    let filter_content = |content: Option<String>, respect_log_flag: bool| -> Option<String> {
        let text = content?;
        if respect_log_flag && enable_log == 0 {
            return None;
        }
        Some(sanitize_base64(&text))
    };

    // ── 计费特征快照 ──
    let billing_features_json: Option<String> = {
        let mut feat = request_content
            .as_ref()
            .and_then(|rc| serde_json::from_str::<serde_json::Value>(rc).ok())
            .map(|json| crate::relay::usage_extractor::extract_request_features(&json));
        if let Some(upstream_feat) = upstream_req_content
            .as_ref()
            .and_then(|uc| serde_json::from_str::<serde_json::Value>(uc).ok())
            .map(|json| crate::relay::usage_extractor::extract_request_features(&json))
        {
            if let Some(ref mut f) = feat {
                f.merge(upstream_feat);
            } else {
                feat = Some(upstream_feat);
            }
        }
        if let Some(ref resp) = response_content {
            if let Ok(resp_json) = serde_json::from_str::<serde_json::Value>(resp) {
                let resp_feat = crate::relay::usage_extractor::extract_request_features(&resp_json);
                if let Some(ref mut f) = feat {
                    f.merge(resp_feat);
                } else {
                    feat = Some(resp_feat);
                }
            }
            let usage = crate::relay::usage_extractor::parse_usage(resp);
            if usage.web_search > 0 {
                feat.get_or_insert_with(Default::default).web_search = Some(usage.web_search);
            }
        }
        feat.and_then(|f| serde_json::to_string(&f).ok())
    };

    let req_content = filter_content(request_content, true);
    let upstream_req = filter_content(upstream_req_content, true);

    let resp_content = if enable_log == 0 {
        if category == "视频" || category == "图片" {
            filter_content(response_content, false)
        } else {
            if let Some(ref text) = response_content {
                let usage_json = crate::relay::usage_extractor::extract_usage_json_string(text);
                if usage_json.is_some() {
                    usage_json
                } else if category == "聊天" || category == "文本" {
                    Some("[]".to_string())
                } else {
                    filter_content(Some(text.clone()), false)
                }
            } else {
                None
            }
        }
    } else {
        filter_content(response_content, false)
    };

    // 直接复用已水合 Channel 的 base_url/api_key（含 HA 子配 / preset / volc 覆盖）
    let (system_endpoint, upstream_ep) = if endpoint.contains('|') {
        let parts: Vec<&str> = endpoint.splitn(2, '|').collect();
        (parts[0], parts[1])
    } else {
        (endpoint, endpoint)
    };

    let mut final_endpoint = upstream_ep.to_string();
    if !final_endpoint.starts_with("http") && !channel.base_url.is_empty() {
        final_endpoint = join_url(&channel.base_url, &final_endpoint);
    }
    if !channel.api_key.is_empty() {
        final_endpoint = super::forward::mask_key_in_string(&final_endpoint, &channel.api_key);
    }
    if !final_endpoint.starts_with("http") {
        if let Some(log_id) = pending_log_id {
            if let Ok(Some(prev)) = sqlx::query_scalar::<_, String>(
                &state
                    .db
                    .format_query("SELECT COALESCE(upstream_url, '') FROM logs WHERE id = ?"),
            )
            .bind(log_id)
            .fetch_optional(&state.db.pool)
            .await
            {
                if prev.starts_with("http") {
                    final_endpoint = prev;
                }
            }
        }
    }

    let res: Result<(), sqlx::Error> = async {
        let mut tx = state.db.pool.begin().await?;
        // 从响应体自动提取异步任务 ID（复用 response_formatter::extract_async_task_id 统一逻辑）
        // 提前解析提取，用于判断当前是否为异步任务预扣冻结阶段
        let task_id = resp_content.as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .map(|v| super::response_formatter::extract_async_task_id(&v))
            .unwrap_or_default();

        // 异步任务预扣冻结判定：任务 ID 非空且计费详情中包含“冻结”
        let is_freeze = !task_id.is_empty() && billing_detail.as_deref().map_or(false, |d| d.contains("冻结"));

        // 始终更新令牌最后使用时间
        sqlx::query(&state.db.format_query(
            "UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ))
        .bind(token.id)
        .execute(&mut *tx)
        .await?;

        if cost > 0.0 || pre_deducted > 0.0 {
            let (site_tz, _) = crate::relay::get_cached_config(state).await;
            let tz = crate::api::date_helper::resolve_user_timedisplay_name(
                &state.db,
                &token.user_id,
                &site_tz,
            )
            .await;
            // 令牌额度异步切流：内存 check_and_incr → MPSC 刷库；管道满则同步 fallback
            if cost > 0.0 {
                let _added = super::token_quota::consume_async_or_sync(
                    state,
                    &mut tx,
                    token,
                    cost,
                    &tz,
                )
                .await?;
            }

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
                // 渠道为共享资源：日/月 key 必须用站点时区，禁止用请求用户 timedisplay
                super::channel_quota::consume_channel(
                    &state.db, &mut tx, channel_id, cost, &site_tz,
                )
                .await?;
            }
            if let Some(cfg_id) = channel_config_id {
                if cfg_id > 0 {
                    super::channel_quota::consume_config(
                        &state.db, &mut tx, cfg_id as i64, cost, &site_tz,
                    )
                    .await?;
                }
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
            hint_category.unwrap_or("").to_string()
        };

        // 【一条日志原则】有 pending_log_id 时 UPDATE 预记录行，否则 INSERT 新行
        // 成功：写入本次成功子渠的 channel_id / channel_config_id（可覆盖先前失败快照）
        // 全失败：由 ha::reinstate_first_log / 仅首次落库 保证仍为子渠 1
        if let Some(log_id) = pending_log_id {
            sqlx::query(&state.db.format_query(
                "UPDATE logs SET channel_id = ?, model = ?, \
                 prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?, \
                 cost = ?, status_code = ?, endpoint = ?, error_message = ?, latency_ms = ?, \
                 request_content = ?, response_content = ?, post_response = ?, upstream_url = ?, \
                 upstream_req_content = ?, billing_detail = ?, \
                 task_id = CASE WHEN ? = '' OR ? IS NULL THEN task_id ELSE ? END, \
                 action_type = ?, billing_pid = ?, \
                 billing_features = ?, pre_deduct_gift = ?, is_completed = ?, \
                 channel_config_id = ? \
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
            .bind(db_error_msg)
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
            .bind(if is_freeze { 0i16 } else { 1i16 })  // is_completed: 冻结任务=0(待结算), 同步请求=1(已完成)
            .bind(channel_config_id)
            .bind(log_id)
            .execute(&mut *tx)
            .await?;
        } else {
            let fb_prefix = if !final_action_type.is_empty() && final_action_type != "聊天" { "tsk_" } else { "log_" };
            let fallback_log_id = format!("{}{}", fb_prefix, ulid::Ulid::new().to_string().to_lowercase());
            sqlx::query(&state.db.format_query(
                "INSERT INTO logs (log_id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cached_tokens, cost, status_code, endpoint, error_message, latency_ms, request_content, response_content, post_response, is_stream, upstream_url, upstream_req_content, billing_detail, task_id, action_type, billing_pid, forward_eid, billing_features, pre_deduct_gift, plugin_tag, is_completed, channel_config_id) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
            .bind(db_error_msg)
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
            .bind(if is_freeze { 0i16 } else { 1i16 })  // is_completed: 冻结任务=0(待结算), 同步请求=1(已完成)
            .bind(channel_config_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }
    .await;
    if let Err(e) = res {
        tracing::error!("Failed to record relay usage: {:?}", e);
    } else if cost > 0.0 {
        // 异步检查低余额提醒，不阻塞计费路径
        let state_notify = Arc::clone(state);
        let uid = token.user_id.clone();
        tokio::spawn(async move {
            crate::services::notification::check_and_notify_low_balance(&state_notify, &uid).await;
        });
    }
}

/// 清理孤儿预记录日志（status_code=0 且超过指定时间）
/// 定时调用，将超时日志标记为 408 并退还预扣费
pub async fn cleanup_orphan_pending_logs(state: &Arc<AppState>) {
    // 查找超过 30 分钟仍为"处理中"的孤儿日志
    // cost 字段存储的是预扣费总额（pre_deduction），pre_deduct_gift 是赠送钱包扣除部分
    let orphans: Vec<(i64, String, f64, f64)> = match sqlx::query_as(&state.db.format_query(
        "SELECT id, user_id, cost, pre_deduct_gift FROM logs \
             WHERE status_code = 0 AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'",
    ))
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

    tracing::info!(
        "[OrphanCleanup] 发现 {} 条孤儿日志，开始清理",
        orphans.len()
    );

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
             billing_detail = '孤儿日志清理，预扣费已退回', is_completed = 1 \
             WHERE id = ? AND status_code = 0",
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
            tracing::info!(
                "[OrphanCleanup] 日志 {} 已清理，退还用户 {} 系统钱包 {:.6} + 赠送钱包 {:.6}",
                log_id,
                user_id,
                balance_refund,
                pre_deduct_gift
            );
        } else {
            tracing::info!("[OrphanCleanup] 日志 {} 已清理（无预扣费）", log_id);
        }
    }
}

/// 服务启动时恢复上次中断遗留的"处理中"日志
/// 仅处理非异步冻结任务（异步任务由 task 模块后台轮询自动恢复，不重复调用上游）
pub async fn recover_interrupted_logs(state: &Arc<AppState>) {
    let orphans: Vec<(i64, String, f64, f64)> = match sqlx::query_as(&state.db.format_query(
        "SELECT id, user_id, cost, pre_deduct_gift FROM logs \
             WHERE status_code = 0 AND billing_detail NOT LIKE '%冻结%'",
    ))
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

    tracing::info!(
        "[StartupRecover] 发现 {} 条上次中断遗留的处理中日志",
        orphans.len()
    );

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
                 ELSE '服务升级中断' END, is_completed = 1 \
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
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?",
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
            tracing::info!(
                "[StartupRecover] 日志 {} 已恢复，退还用户 {} 预扣费 {} (gift: {})",
                log_id,
                user_id,
                cost,
                pre_deduct_gift
            );
        } else {
            tracing::info!(
                "[StartupRecover] 日志 {} 已标记为服务中断（无预扣费）",
                log_id
            );
        }
    }
}

/// 错误信息敏感词脱敏：URL 域名替换为 ***（保留协议和路径），密钥替换为 ***。
/// 仅用于普通用户端返回和日志展示，管理员端保留原始信息用于排查。
pub fn sanitize_error_message(msg: &str) -> String {
    // URL 域名脱敏：https://api.example.com/v1/... → https://***/v1/...
    let re_url = Regex::new(r"(https?://)([^/\s)\]},]+)").unwrap();
    let result = re_url.replace_all(msg, "${1}***").to_string();
    // API 密钥脱敏：sk-xxxx 等格式
    let re_key = Regex::new(r"\bsk-[a-zA-Z0-9]{8,}\b").unwrap();
    re_key.replace_all(&result, "***").to_string()
}

/// 上游失败对外错误：日志与客户端共用同一 HTTP 状态码（4xx/5xx 透出，其余按 502）
/// 对方舟/智算等 ErrorCode+ErrorMessage 扁平错误，统一转为 OpenAI error 再返回
pub fn upstream_fail(status: u16, raw_msg: &str) -> crate::error::AppError {
    let normalized = normalize_upstream_error_for_client(raw_msg);
    let msg = sanitize_error_message(&normalized);
    let status = if (400..600).contains(&status) {
        status
    } else {
        502
    };
    crate::error::AppError::UpstreamHttpError(status, msg)
}

/// 仅将 PascalCase ErrorCode 扁平错误转为 OpenAI 格式；其它厂商 JSON 保持原样透传
fn normalize_upstream_error_for_client(raw_msg: &str) -> String {
    let raw = raw_msg.find('{').map(|i| &raw_msg[i..]).unwrap_or(raw_msg);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        // 非空 ErrorCode 才转换，避免空串/null 误入
        if v.get("ErrorCode")
            .and_then(|c| c.as_str())
            .is_some_and(|c| !c.is_empty())
        {
            if let Some(formatted) = super::response_formatter::format_as_openai_error(&v) {
                return formatted;
            }
        }
    }
    raw_msg.to_string()
}

/// 上游错误文案：空 body 时补默认句，供日志与 `upstream_fail` 共用
#[inline]
pub fn upstream_error_text(status: u16, body: &str) -> String {
    if body.trim().is_empty() {
        format!("Upstream HTTP error {}", status)
    } else {
        body.to_string()
    }
}

/// 从可能为 JSON 格式的错误响应体中提取最核心的错误文本信息
pub fn extract_error_message(resp_body: &str) -> String {
    let raw = resp_body
        .find('{')
        .map(|i| &resp_body[i..])
        .unwrap_or(resp_body);
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(msg) = super::response_formatter::extract_error_message_from_value(&json) {
            return msg;
        }
    }
    resp_body.to_string()
}

/// 根据错误响应 JSON 推断业务 HTTP 状态码
/// 优先从结构化 error.code 精确识别；无 code 时从 message 文本关键词兜底
pub fn infer_error_status_code(body: &serde_json::Value) -> u16 {
    if let Some(code) = super::response_formatter::extract_error_code_from_value(body) {
        return classify_error_code(&code);
    }
    let msg = super::response_formatter::extract_error_message_from_value(body).unwrap_or_default();
    classify_error_text(&msg)
}

/// 纯文本/网络错误场景的快捷入口（无完整 JSON 结构时）
/// 自动尝试从文本中提取 JSON，再委托 infer_error_status_code 处理
pub fn infer_error_status_code_from_str(err: &str) -> u16 {
    let raw = err.find('{').map(|i| &err[i..]).unwrap_or(err);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        return infer_error_status_code(&v);
    }
    classify_error_text(err)
}

/// 按 error.code 字符串分类 HTTP 状态码（私有辅助）
/// 支持字符串语义码（"PolicyViolation" / "PERMISSION_ERROR"）和数字字符串（"429"）直接映射
fn classify_error_code(code: &str) -> u16 {
    // 数字形式（APIMart/即梦等直接返回 HTTP 状态码数字）→ 直接映射
    if let Ok(n) = code.parse::<u16>() {
        if n >= 400 {
            return n;
        }
    }
    let c = code.to_lowercase();
    // 403：内容安全 / 政策违规 / 权限不足（permission 须排在 auth 之前）
    if c.contains("sensitive")
        || c.contains("policy")
        || c.contains("violation")
        || c.contains("safety")
        || c.contains("copyright")
        || c.contains("block")
        || c.contains("moderation")
        || c.contains("censor")
        || c.contains("permission")
        || c.contains("forbidden")
        || c.contains("access_denied")
    {
        return 403;
    }
    // 鉴权/身份认证失败
    if c.contains("auth")
        || c.contains("unauthorized")
        || c.contains("invalid_key")
        || c.contains("credential")
        || c.contains("unauthenticated")
        || c.contains("revoked")
    {
        return 401;
    }
    // 限流/超额
    if c.contains("rate")
        || c.contains("limit")
        || c.contains("quota")
        || c.contains("throttl")
        || c.contains("exceeded")
    {
        return 429;
    }
    // 超时/不可用
    if c.contains("timeout")
        || c.contains("gateway")
        || c.contains("unavailable")
        || c.contains("overload")
    {
        return 504;
    }
    // 上游服务内部错误
    if c.contains("internal") || c.contains("server_error") || c.contains("service_error") {
        return 500;
    }
    // 有 code 但未命中以上分类 → 客户端类业务错误
    400
}

/// message 文本关键词分类 HTTP 状态码（无结构化 error.code 时的兜底，私有辅助）
fn classify_error_text(msg: &str) -> u16 {
    let m = msg.to_lowercase();
    // 内容安全/政策违规
    if m.contains("safety")
        || m.contains("censor")
        || m.contains("policy")
        || m.contains("violation")
        || m.contains("block")
        || m.contains("sensitive")
        || m.contains("moderation")
        || m.contains("content_filter")
        || m.contains("敏感")
        || m.contains("违规")
        || m.contains("安全")
        || m.contains("政策")
        || m.contains("审核")
    {
        return 403;
    }
    // 权限不足（须在 auth 之前： "not authorized" 含 auth 子串）
    if m.contains("permission")
        || m.contains("forbidden")
        || m.contains("not authorized")
        || m.contains("access denied")
        || m.contains("无权限")
        || m.contains("没有权限")
    {
        return 403;
    }
    // 鉴权/授权失败
    if m.contains("auth")
        || m.contains("unauthorized")
        || m.contains("api_key")
        || m.contains("credential")
        || m.contains("invalid_key")
        || m.contains("bad_key")
        || m.contains("revoked")
        || m.contains("unauthenticated")
        || m.contains("鉴权")
        || m.contains("密钥")
        || m.contains("授权")
    {
        return 401;
    }
    // 限流/超额/欠费
    if m.contains("limit")
        || m.contains("quota")
        || m.contains("exceeded")
        || m.contains("rate")
        || m.contains("insufficient")
        || m.contains("out of budget")
        || m.contains("payment")
        || m.contains("欠费")
        || m.contains("额度")
        || m.contains("限流")
        || m.contains("并发")
        || m.contains("超出")
        || m.contains("不足")
    {
        return 429;
    }
    // 超时/网关/连接中断
    if m.contains("timeout")
        || m.contains("gateway")
        || m.contains("connect")
        || m.contains("disconnect")
        || m.contains("abort")
        || m.contains("unreachable")
        || m.contains("超时")
        || m.contains("网关")
        || m.contains("中断")
    {
        return 504;
    }
    // 上游服务器内部故障
    if m.contains("internal")
        || m.contains("server")
        || m.contains("failed")
        || m.contains("error")
        || m.contains("bug")
        || m.contains("crash")
        || m.contains("故障")
        || m.contains("服务器错误")
        || m.contains("执行失败")
        || m.contains("异常")
    {
        return 500;
    }
    400
}

/// 并发获取所有视频 URL 的时长之和（8 秒全局超时兜底）
pub async fn sum_remote_videos_duration(client: &reqwest::Client, urls: &[String]) -> f64 {
    if urls.is_empty() {
        return 0.0;
    }
    let probe = async {
        let futs = urls.iter().map(|u| probe_video_duration(client, u));
        futures::future::join_all(futs).await.into_iter().sum()
    };
    tokio::time::timeout(std::time::Duration::from_secs(8), probe)
        .await
        .unwrap_or(0.0)
}

/// 局部辅助：流式获取指定 Range 的数据，一旦解析出时长立刻返回，支持 UA 伪装防拦截
async fn fetch_and_parse(
    client: &reqwest::Client,
    url: &str,
    range: &str,
) -> Option<(f64, Option<u64>, Vec<u8>)> {
    use futures::StreamExt;

    let resp = client.get(url)
        .header("Range", range)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(4))
        .send().await.ok()?;

    let status = resp.status().as_u16();
    if status != 200 && status != 206 {
        tracing::warn!(
            "[VideoDuration] HTTP 状态码非预期: {}, status={}",
            url,
            status
        );
        return None;
    }

    let total = resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|cr| cr.split('/').last()?.trim().parse::<u64>().ok());

    let mut buf = Vec::with_capacity(8192);
    let mut stream = resp.bytes_stream();
    while let Some(Ok(chunk)) = stream.next().await {
        buf.extend_from_slice(&chunk);
        if let Some(d) = parse_video_duration(&buf) {
            return Some((d, total, buf));
        }
        if buf.len() >= 32768 {
            break;
        }
    }
    Some((0.0, total, buf))
}

/// HTTP Range 流式探测单个远程 MP4 视频时长，解析出 duration 立即终止连接
async fn probe_video_duration(client: &reqwest::Client, url: &str) -> f64 {
    let start = std::time::Instant::now();

    // 1. 发起头部 Range 请求，拉取并流式解析前 32KB
    let (dur, total_size, head_buf) = match fetch_and_parse(client, url, "bytes=0-32767").await {
        Some(res) => res,
        None => {
            tracing::warn!("[VideoDuration] 头部请求异常: {}", url);
            return 0.0;
        }
    };

    if dur > 0.0 {
        tracing::info!(
            "[VideoDuration] 头部解析成功: {}, duration={}, 耗时={:?}",
            url,
            dur,
            start.elapsed()
        );
        return dur;
    }

    // 2. 如果头部未找到且知道总大小，发起第二个 Range 请求，拉取并流式解析尾部 32KB (处理非 faststart 视频)
    if let Some(total) = total_size {
        if total > 32768 {
            let range = format!("bytes={}-{}", total - 32768, total - 1);
            if let Some((tail_dur, _, _)) = fetch_and_parse(client, url, &range).await {
                if tail_dur > 0.0 {
                    tracing::info!(
                        "[VideoDuration] 尾部解析成功: {}, duration={}, 耗时={:?}",
                        url,
                        tail_dur,
                        start.elapsed()
                    );
                    return tail_dur;
                }
            }
        }
    }

    // 3. 兜底处理 (若全部步骤都没找到，则宣告失败)
    tracing::warn!(
        "[VideoDuration] 探测失败(非标准或元数据过大): {}, 大小={} 字节, 总长={:?}, 耗时={:?}",
        url,
        head_buf.len(),
        total_size,
        start.elapsed()
    );
    0.0
}

/// 通用视频时长解析入口，支持 MP4/MOV、WEBM/MKV、AVI、FLV
fn parse_video_duration(data: &[u8]) -> Option<f64> {
    parse_mp4_duration(data)
        .or_else(|| parse_webm_duration(data))
        .or_else(|| parse_avi_duration(data))
        .or_else(|| parse_flv_duration(data))
        .filter(|d| *d > 0.0 && d.is_finite() && *d < 86400.0)
}

/// 解析 MP4/MOV 提取视频时长（秒）
fn parse_mp4_duration(data: &[u8]) -> Option<f64> {
    let moov_pos = data.windows(4).position(|w| w == b"moov")?;
    let moov_body = &data[moov_pos + 4..];
    let mvhd_pos = moov_body.windows(4).position(|w| w == b"mvhd")?;
    let mvhd_body = &moov_body[mvhd_pos + 4..];
    let (ts_off, dur_off, dur_len) = if mvhd_body.first().copied()? == 0 {
        (12, 16, 4)
    } else {
        (20, 24, 8)
    };
    if mvhd_body.len() < dur_off + dur_len {
        return None;
    }
    let timescale = u32::from_be_bytes(mvhd_body[ts_off..ts_off + 4].try_into().ok()?) as f64;
    let duration = if dur_len == 4 {
        u32::from_be_bytes(mvhd_body[dur_off..dur_off + 4].try_into().ok()?) as f64
    } else {
        u64::from_be_bytes(mvhd_body[dur_off..dur_off + 8].try_into().ok()?) as f64
    };
    if timescale > 0.0 {
        Some(duration / timescale)
    } else {
        None
    }
}

/// 解析 WEBM/MKV (EBML 容器) 提取视频时长（秒）
fn parse_webm_duration(data: &[u8]) -> Option<f64> {
    data.windows(4)
        .position(|w| w == &[0x1A, 0x45, 0xDF, 0xA3])?;
    let info_pos = data
        .windows(4)
        .position(|w| w == &[0x15, 0x49, 0xA9, 0x66])?;
    let info_body = &data[info_pos + 4..];

    let ts_pos = info_body
        .windows(3)
        .position(|w| w == &[0x2A, 0xD7, 0xB1])?;
    let (timescale, _) = parse_ebml_vint(&info_body[ts_pos + 3..])?;

    let dur_pos = info_body.windows(2).position(|w| w == &[0x44, 0x89])?;
    let dur_body = &info_body[dur_pos + 2..];
    let (dur_size, dur_size_len) = parse_ebml_vint(dur_body)?;
    if dur_body.len() < dur_size_len + dur_size as usize {
        return None;
    }

    let val_bytes = &dur_body[dur_size_len..dur_size_len + dur_size as usize];
    let duration_ms = if dur_size == 4 {
        f32::from_be_bytes(val_bytes.try_into().ok()?) as f64
    } else if dur_size == 8 {
        f64::from_be_bytes(val_bytes.try_into().ok()?) as f64
    } else {
        return None;
    };

    if timescale > 0 {
        Some((duration_ms * timescale as f64) / 1_000_000_000.0)
    } else {
        Some(duration_ms / 1000.0)
    }
}

/// 解析 AVI (RIFF 容器) 提取视频时长（秒）
fn parse_avi_duration(data: &[u8]) -> Option<f64> {
    if data.len() < 12 || &data[0..4] != b"RIFF" || &data[8..12] != b"AVI " {
        return None;
    }
    let avih_pos = data.windows(4).position(|w| w == b"avih")?;
    let avih_body = &data[avih_pos + 8..];
    if avih_body.len() < 20 {
        return None;
    }
    let us_per_frame = u32::from_le_bytes(avih_body[0..4].try_into().ok()?) as f64;
    let total_frames = u32::from_le_bytes(avih_body[16..20].try_into().ok()?) as f64;
    if us_per_frame > 0.0 {
        Some((us_per_frame * total_frames) / 1_000_000.0)
    } else {
        None
    }
}

/// 解析 FLV (AMF 容器) 提取视频时长（秒）
fn parse_flv_duration(data: &[u8]) -> Option<f64> {
    if data.len() < 4 || &data[0..3] != b"FLV" {
        return None;
    }
    let dur_pos = data.windows(8).position(|w| w == b"duration")?;
    let val_type_pos = dur_pos + 8;
    if data.len() >= val_type_pos + 9 && data[val_type_pos] == 0x00 {
        let duration =
            f64::from_be_bytes(data[val_type_pos + 1..val_type_pos + 9].try_into().ok()?);
        if duration > 0.0 && duration.is_finite() {
            return Some(duration);
        }
    }
    None
}

/// 解析 EBML VINT (可变长度整数)
fn parse_ebml_vint(data: &[u8]) -> Option<(u64, usize)> {
    let first = *data.first()?;
    let zeros = first.leading_zeros() as usize;
    if zeros >= 8 {
        return None;
    }
    let len = zeros + 1;
    if data.len() < len {
        return None;
    }
    let mut val = (first & (0xFF >> len)) as u64;
    for i in 1..len {
        val = (val << 8) | data[i] as u64;
    }
    Some((val, len))
}

/// 高效精确：复用系统特征识别结构来提取输入视频 URL 列表
pub fn extract_request_video_urls(body: &serde_json::Value) -> Vec<String> {
    let mut urls = Vec::new();

    // 1. 顶层 videos 数组
    if let Some(arr) = body.get("videos").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(s) = item.as_str().filter(|s| !s.is_empty()) {
                urls.push(s.to_string());
            } else if let Some(u) = item
                .get("url")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                urls.push(u.to_string());
            } else if let Some(u) = item
                .get("video_url")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                urls.push(u.to_string());
            }
        }
    }

    // 2. 火山方舟 content[].video_url 结构
    if let Some(content) = body.get("content").and_then(|c| c.as_array()) {
        for item in content {
            if let Some(t) = item.get("type").and_then(|v| v.as_str()) {
                if t.contains("video") {
                    if let Some(video_obj) = item.get("video_url") {
                        if let Some(u) = video_obj.as_str().filter(|s| !s.is_empty()) {
                            urls.push(u.to_string());
                        } else if let Some(u) = video_obj
                            .get("url")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                        {
                            urls.push(u.to_string());
                        }
                    }
                }
            }
        }
    }

    urls.sort();
    urls.dedup();
    urls
}
