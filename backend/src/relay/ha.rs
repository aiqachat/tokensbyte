//! 高可用（HA）failover 策略：单一入口，供各 relay 端点复用。
//! 语义：仅当「插件启用 AND 令牌 high_availability≠0」时可选 HA 组并做子渠切换。
//!
//! 终态对齐规则：
//! - **全部上游失败**：客户端错误 + 日志的 status/error/`channel_config_id` 保留「第一次」失败（子渠 1）
//! - **某次成功**：日志 channel_id / `channel_config_id` / 上游 URL 使用**成功那一次**的子渠
//!   （首次即成功 → 子渠 1；先失败后成功 → 成功子渠）
//! - 展示用 YID：读路径 JOIN `channel_configs`，日志表不落 `yid` 列

use crate::error::AppError;
use crate::models::Channel;
use crate::AppState;
use std::sync::Arc;
use std::time::Instant;

/// 一次解析：`(failover_on, max_attempts)`，供各入口开环前调用。
pub async fn policy(state: &AppState, token_ha: i32) -> (bool, usize) {
    let (_, plugin_on) = super::get_cached_config(state).await;
    let on = failover_enabled(plugin_on, token_ha);
    (on, max_attempts(state, on))
}

/// 插件 + 令牌共同决定是否允许 HA 选渠与 failover
#[inline]
pub fn failover_enabled(plugin_on: bool, token_ha: i32) -> bool {
    plugin_on && token_ha != 0
}

/// 最大上游尝试次数：关 HA=1；开 HA=`ha_max_retries`（至少 1）
#[inline]
pub fn max_attempts(state: &AppState, failover_on: bool) -> usize {
    if failover_on {
        state
            .ha_max_retries
            .load(std::sync::atomic::Ordering::Relaxed)
            .max(1) as usize
    } else {
        1
    }
}

/// 运行时 HA 子渠 / 整组键（`ha_group_{id}` 或 `ha_group_{id}_config_{sub}`）
#[inline]
pub fn is_ha_aid(aid: &str) -> bool {
    aid.starts_with("ha_group_")
}

/// 从运行时 `group_aid`（`ha_group_{id}_config_{sub}`）解析子渠 `channel_configs.id`
#[inline]
pub fn config_id_from_aid(aid: Option<&str>) -> Option<i32> {
    let aid = aid?;
    if !is_ha_aid(aid) || !aid.contains("_config_") {
        return None;
    }
    aid.rfind("_config_")
        .and_then(|pos| aid[pos + "_config_".len()..].parse().ok())
}

/// 第一次上游失败快照（仅存活于当前请求栈内，请求结束即释放，无进程级常驻）
#[derive(Debug, Clone)]
pub struct FirstUpstreamFail {
    pub status: u16,
    pub message: String,
    pub channel_id: i64,
    /// 运行时即可解析的子渠 config id（HA aid / preset_id），reinstate 零查库
    pub channel_config_id: Option<i32>,
    /// 首次失败时的上游 URL（脱敏后），全失败 reinstate 与子配对齐
    pub upstream_url: Option<String>,
}

/// 运行时解析 channel_config_id：HA 子渠 aid 优先，否则渠道绑定的 preset_id（无 DB）
#[inline]
pub fn resolve_config_id(channel: &Channel) -> Option<i32> {
    config_id_from_aid(channel.group_aid.as_deref()).or_else(|| channel.preset_id.map(|p| p as i32))
}

/// 落库用子配 id：`resolve_config_id` 优先，否则用内存 `Channel.yid` 反查（预记录/结算共用）
pub async fn resolve_log_config_id(state: &AppState, channel: &Channel) -> Option<i32> {
    match resolve_config_id(channel) {
        Some(id) => Some(id),
        None => config_id_from_yid(state, channel.yid.as_deref()).await,
    }
}

/// 从 AppError 取出状态码与对外/落库文案
#[inline]
pub fn status_msg(err: &AppError) -> (u16, String) {
    match err {
        AppError::UpstreamHttpError(s, m) => (*s, m.clone()),
        AppError::UpstreamError(m) => (502, m.clone()),
        other => (other.http_status(), other.to_string()),
    }
}

/// 仅首次写入；后续子渠失败不覆盖
#[inline]
pub fn remember_first(
    slot: &mut Option<FirstUpstreamFail>,
    channel: &Channel,
    status: u16,
    message: impl Into<String>,
    upstream_url: Option<String>,
) -> bool {
    if slot.is_some() {
        return false;
    }
    *slot = Some(FirstUpstreamFail {
        status,
        message: message.into(),
        channel_id: channel.id,
        channel_config_id: resolve_config_id(channel),
        upstream_url,
    });
    true
}

/// 终态对外错误：有首次快照则用之
#[inline]
pub fn finish_err(first: Option<FirstUpstreamFail>, fallback: AppError) -> AppError {
    match first {
        Some(f) => super::proxy::upstream_fail(f.status, &f.message),
        None => fallback,
    }
}

/// 按配置表 YID 反查 channel_configs.id（记账补全 config_id；空 yid → None）
pub async fn config_id_from_yid(state: &AppState, yid: Option<&str>) -> Option<i32> {
    let y = yid.map(str::trim).filter(|s| !s.is_empty())?;
    sqlx::query_scalar::<_, i32>(
        &state
            .db
            .format_query("SELECT id FROM channel_configs WHERE yid = ? LIMIT 1"),
    )
    .bind(y)
    .fetch_optional(&state.db.pool)
    .await
    .ok()
    .flatten()
}

/// spawn 路径后续失败会覆盖日志：立刻还原为第一次的 status / error / 子配（用请求内快照，无额外查库）
pub async fn reinstate_first_log(
    state: &Arc<AppState>,
    pending_log_id: Option<i64>,
    first: &FirstUpstreamFail,
) {
    let Some(log_id) = pending_log_id else { return };
    let err_msg = super::proxy::extract_error_message(&first.message);
    if let Err(e) = sqlx::query(&state.db.format_query(
        "UPDATE logs SET channel_id = ?, status_code = ?, error_message = ?, \
         channel_config_id = ?, upstream_url = COALESCE(?, upstream_url) WHERE id = ?",
    ))
    .bind(first.channel_id)
    .bind(first.status as i32)
    .bind(&err_msg)
    .bind(first.channel_config_id)
    .bind(&first.upstream_url)
    .bind(log_id)
    .execute(&state.db.pool)
    .await
    {
        tracing::warn!(
            "[HA] reinstate first-fail log id={} failed: {:?}",
            log_id,
            e
        );
    }
}

/// 记录首次快照、熔断当前子渠、非首次则还原日志；返回是否应 continue
async fn on_attempt_fail(
    state: &Arc<AppState>,
    failover_on: bool,
    channel: &Channel,
    err: &AppError,
    first_fail: &mut Option<FirstUpstreamFail>,
    exclude_aids: &mut Vec<String>,
    pending_log_id: Option<i64>,
    upstream_url: Option<String>,
) -> bool {
    let (status, msg) = status_msg(err);
    let is_first = remember_first(first_fail, channel, status, msg.clone(), upstream_url);
    let failing_over = try_failover(
        state,
        failover_on,
        channel.group_aid.as_deref(),
        status,
        &msg,
        exclude_aids,
    );
    if !is_first {
        if let Some(ref f) = first_fail {
            reinstate_first_log(state, pending_log_id, f).await;
        }
    }
    failing_over
}

/// spawn / responses 外环失败统一入口：更新 had_upstream / 仅首次写入 last_err，返回是否 failover continue
pub async fn on_spawn_attempt_fail(
    state: &Arc<AppState>,
    failover_on: bool,
    channel: &Channel,
    err: AppError,
    first_fail: &mut Option<FirstUpstreamFail>,
    exclude_aids: &mut Vec<String>,
    pending_log_id: Option<i64>,
    last_err: &mut AppError,
    had_upstream: &mut bool,
    upstream_url: Option<&str>,
) -> bool {
    *had_upstream = true;
    let was_first = first_fail.is_none();
    let url = upstream_url.map(|u| super::forward::mask_key_in_string(u, &channel.api_key));
    let failing_over = on_attempt_fail(
        state,
        failover_on,
        channel,
        &err,
        first_fail,
        exclude_aids,
        pending_log_id,
        url,
    )
    .await;
    if was_first {
        *last_err = err;
    }
    failing_over
}

/// HA 外环状态：各端点共用，避免 exclude/attempt/first_fail 等字段散落复制。
/// 端点只负责「选渠 → 业务尝试」；失败续试走 [`HaAttempt::on_spawn_fail`] / [`on_spawn_attempt_fail`]。
pub struct HaAttempt {
    pub exclude_aids: Vec<String>,
    pub attempt: usize,
    pub max_attempts: usize,
    pub failover_on: bool,
    pub first_fail: Option<FirstUpstreamFail>,
    pub pending_log_id: Option<i64>,
    pub had_upstream: bool,
    pub last_err: AppError,
}

impl HaAttempt {
    /// 开环：解析 HA 策略，初始化排除列表与终态错误占位
    pub async fn begin(state: &AppState, token_ha: i32) -> Self {
        let (failover_on, max_attempts) = policy(state, token_ha).await;
        Self {
            exclude_aids: vec![],
            attempt: 0,
            max_attempts,
            failover_on,
            first_fail: None,
            pending_log_id: None,
            had_upstream: false,
            last_err: AppError::UpstreamError("No available models".into()),
        }
    }

    /// 多模型外环（如 chat）换模型时：清 attempt/排除/had_upstream，保留 pending 与首次失败快照
    pub fn reset_attempts(&mut self) {
        self.exclude_aids.clear();
        self.attempt = 0;
        self.had_upstream = false;
    }

    #[inline]
    pub fn cont(&self) -> bool {
        self.attempt < self.max_attempts
    }

    /// 选渠失败：尚无上游交互时用选渠错误作为对外文案
    pub fn on_select_err(&mut self, e: AppError) {
        if !self.had_upstream {
            self.last_err = e;
        }
    }

    /// 权限/余额等不可 failover 错误
    pub fn on_access_err(&mut self, e: AppError) {
        self.last_err = e;
    }

    /// spawn 外环失败：业务侧（余额/鉴权等）不可 reinstate/failover；上游失败走 on_spawn_fail。
    /// 返回 true → `bump(); continue`；false → `break`。
    pub async fn on_spawn_result_err(
        &mut self,
        state: &Arc<AppState>,
        channel: &Channel,
        err: AppError,
        upstream_url: Option<&str>,
    ) -> bool {
        if is_access_side_err(&err) {
            self.on_access_err(err);
            return false;
        }
        self.on_spawn_fail(state, channel, err, upstream_url).await
    }

    /// spawn / 同步上游失败统一入口；返回 true 时应 `bump(); continue`
    pub async fn on_spawn_fail(
        &mut self,
        state: &Arc<AppState>,
        channel: &Channel,
        err: AppError,
        upstream_url: Option<&str>,
    ) -> bool {
        on_spawn_attempt_fail(
            state,
            self.failover_on,
            channel,
            err,
            &mut self.first_fail,
            &mut self.exclude_aids,
            self.pending_log_id,
            &mut self.last_err,
            &mut self.had_upstream,
            upstream_url,
        )
        .await
    }

    #[inline]
    pub fn bump(&mut self) {
        self.attempt += 1;
    }

    /// 环结束：优先返回首次上游失败
    pub fn finish(self) -> AppError {
        finish_err(self.first_fail, self.last_err)
    }
}

/// 业务侧错误（余额不足/鉴权等）：禁止 HA failover，也禁止 reinstate 覆盖已写入的 403 日志。
/// 与插件「不熔断白名单」(`ha_meltdown_whitelist`) 正交：白名单只跳过冷却写入，不改变本函数判定。
#[inline]
pub fn is_access_side_err(err: &AppError) -> bool {
    match err {
        AppError::Forbidden(_)
        | AppError::BadRequest(_)
        | AppError::Unauthorized
        | AppError::AuthFailed(_) => true,
        AppError::Internal(m) if m.contains("预扣费") => true,
        _ => false,
    }
}

/// 熔断表软上限：过期清理后仍超限则整表清空（熔断可过期，优先防止内存膨胀）
const FAILED_CHANNELS_SOFT_CAP: usize = 4096;

/// 是否仍在熔断窗口内；已过期则立即移除该键（读路径惰性回收，无进程级泄漏）
#[inline]
pub fn is_melted_down(state: &AppState, aid: &str) -> bool {
    let Some(entry) = state.failed_channels.get(aid) else {
        return false;
    };
    if *entry.value() > Instant::now() {
        true
    } else {
        drop(entry);
        state.failed_channels.remove(aid);
        false
    }
}

/// 批量清除过期熔断；超软上限则整清，避免极端堆积
pub fn scrub_failed_channels(state: &AppState) {
    let now = Instant::now();
    state.failed_channels.retain(|_, until| *until > now);
    let n = state.failed_channels.len();
    if n > FAILED_CHANNELS_SOFT_CAP {
        tracing::warn!(
            "[HA] failed_channels len={} exceeds soft cap {}, clearing",
            n,
            FAILED_CHANNELS_SOFT_CAP
        );
        state.failed_channels.clear();
    }
}

/// 上游失败后是否应 failover：仅 HA 子渠且策略开启。
/// 400/403/422 为客户端/业务错误，不切换（防误伤）。
/// 命中「不熔断白名单」时仍会 exclude 并切换，仅跳过冷却写入（见 `trigger_ha_meltdown`）。
/// 返回 true 时已写入 exclude（并可能熔断），调用方应 `attempt += 1; continue`。
pub fn try_failover(
    state: &Arc<AppState>,
    failover_on: bool,
    group_aid: Option<&str>,
    status: u16,
    err_msg: &str,
    exclude_aids: &mut Vec<String>,
) -> bool {
    if !failover_on || matches!(status, 400 | 403 | 422) {
        return false;
    }
    let Some(aid) = group_aid.filter(|a| is_ha_aid(a)) else {
        return false;
    };
    super::proxy::trigger_ha_meltdown(state, aid, status, err_msg);
    if !exclude_aids.iter().any(|a| a == aid) {
        exclude_aids.push(aid.to_string());
    }
    true
}
