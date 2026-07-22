/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 实时吞吐观测：QPS / RPM / TPM / Task（仅观测，不限流）
//!
//! - 全局：`static` + `AtomicU64`（热路径无 Mutex）
//! - 用户：按 api_token_id 分槽 `DashMap`，读路径 + `Ordering::Relaxed` 自增
//! - Task：`GlobalTaskGuard` / `UserTaskGuard` RAII，防泄漏
//! - 冷用户：后台定时清理（默认 TTL 1h）

use dashmap::DashMap;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const WINDOW_SECS: usize = 60;
/// 用户槽空闲超过该秒数则剔除
pub const USER_IDLE_TTL_SECS: i64 = 3600;
/// 清理扫描间隔
pub const CLEANUP_INTERVAL_SECS: u64 = 300;
const ATOMIC: Ordering = Ordering::Relaxed;

// ═══════════════════════════════════════════
// 快照与全局指标
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
pub struct MetricsSnapshot {
    pub qps: u64,
    pub rpm: u64,
    pub tpm: u64,
    pub task: u64,
}

/// 全局实时指标（进程级单例）
pub struct GlobalMetrics {
    req_buckets: [AtomicU64; WINDOW_SECS],
    tok_buckets: [AtomicU64; WINDOW_SECS],
    epoch_sec: AtomicU64,
    inflight: AtomicU64,
}

impl GlobalMetrics {
    fn new() -> Self {
        Self {
            req_buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            tok_buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            epoch_sec: AtomicU64::new(0),
            inflight: AtomicU64::new(0),
        }
    }

    #[inline]
    fn now_sec() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    /// 跨秒时清零过期桶（CAS，无锁）
    #[inline]
    fn roll_to(&self, now: u64) {
        let prev = self.epoch_sec.load(ATOMIC);
        if now == prev {
            return;
        }
        if self
            .epoch_sec
            .compare_exchange(prev, now, ATOMIC, ATOMIC)
            .is_ok()
        {
            let gap = (now - prev).min(WINDOW_SECS as u64);
            for i in 1..=gap {
                let sec = now.wrapping_sub(i);
                let idx = (sec as usize) % WINDOW_SECS;
                self.req_buckets[idx].store(0, ATOMIC);
                self.tok_buckets[idx].store(0, ATOMIC);
            }
        }
    }

    #[inline]
    pub fn on_request(&self) {
        let now = Self::now_sec();
        self.roll_to(now);
        let idx = (now as usize) % WINDOW_SECS;
        self.req_buckets[idx].fetch_add(1, ATOMIC);
    }

    #[inline]
    pub fn on_tokens(&self, n: u64) {
        if n == 0 {
            return;
        }
        let now = Self::now_sec();
        self.roll_to(now);
        let idx = (now as usize) % WINDOW_SECS;
        self.tok_buckets[idx].fetch_add(n, ATOMIC);
    }

    #[inline]
    pub fn task_guard(&self) -> GlobalTaskGuard {
        self.inflight.fetch_add(1, ATOMIC);
        GlobalTaskGuard
    }

    #[inline]
    pub fn snapshot(&self) -> MetricsSnapshot {
        let now = Self::now_sec();
        self.roll_to(now);
        MetricsSnapshot {
            qps: self.req_buckets[(now as usize) % WINDOW_SECS].load(ATOMIC),
            rpm: self.req_buckets.iter().map(|b| b.load(ATOMIC)).sum(),
            tpm: self.tok_buckets.iter().map(|b| b.load(ATOMIC)).sum(),
            task: self.inflight.load(ATOMIC),
        }
    }
}

/// 进程级全局指标
pub static GLOBAL_METRICS: LazyLock<GlobalMetrics> = LazyLock::new(GlobalMetrics::new);

/// 全局并发 Task RAII
pub struct GlobalTaskGuard;

impl Drop for GlobalTaskGuard {
    fn drop(&mut self) {
        GLOBAL_METRICS.inflight.fetch_sub(1, ATOMIC);
    }
}

// ═══════════════════════════════════════════
// 用户（按 api_token_id）指标
// ═══════════════════════════════════════════

/// 单个 API Token 的实时指标
pub struct UserMetrics {
    /// 所属用户（创建后只读，供清理时维护索引）
    user_id: String,
    req_buckets: [AtomicU64; WINDOW_SECS],
    tok_buckets: [AtomicU64; WINDOW_SECS],
    epoch_sec: AtomicU64,
    inflight: AtomicU64,
    /// 最后活跃 Unix 秒
    pub last_active_at: AtomicI64,
}

impl UserMetrics {
    fn new(user_id: impl Into<String>) -> Self {
        Self {
            user_id: user_id.into(),
            req_buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            tok_buckets: std::array::from_fn(|_| AtomicU64::new(0)),
            epoch_sec: AtomicU64::new(0),
            inflight: AtomicU64::new(0),
            last_active_at: AtomicI64::new(GlobalMetrics::now_sec() as i64),
        }
    }

    #[inline]
    fn touch(&self) {
        self.last_active_at
            .store(GlobalMetrics::now_sec() as i64, ATOMIC);
    }

    #[inline]
    fn roll_to(&self, now: u64) {
        let prev = self.epoch_sec.load(ATOMIC);
        if now == prev {
            return;
        }
        if self
            .epoch_sec
            .compare_exchange(prev, now, ATOMIC, ATOMIC)
            .is_ok()
        {
            let gap = (now - prev).min(WINDOW_SECS as u64);
            for i in 1..=gap {
                let sec = now.wrapping_sub(i);
                let idx = (sec as usize) % WINDOW_SECS;
                self.req_buckets[idx].store(0, ATOMIC);
                self.tok_buckets[idx].store(0, ATOMIC);
            }
        }
    }

    #[inline]
    pub fn on_request(&self) {
        self.touch();
        let now = GlobalMetrics::now_sec();
        self.roll_to(now);
        self.req_buckets[(now as usize) % WINDOW_SECS].fetch_add(1, ATOMIC);
    }

    #[inline]
    pub fn on_tokens(&self, n: u64) {
        if n == 0 {
            return;
        }
        self.touch();
        let now = GlobalMetrics::now_sec();
        self.roll_to(now);
        self.tok_buckets[(now as usize) % WINDOW_SECS].fetch_add(n, ATOMIC);
    }

    #[inline]
    pub fn task_guard(self: &Arc<Self>) -> UserTaskGuard {
        self.inflight.fetch_add(1, ATOMIC);
        self.touch();
        UserTaskGuard {
            metrics: Arc::clone(self),
        }
    }

    #[inline]
    pub fn snapshot(&self) -> MetricsSnapshot {
        let now = GlobalMetrics::now_sec();
        self.roll_to(now);
        MetricsSnapshot {
            qps: self.req_buckets[(now as usize) % WINDOW_SECS].load(ATOMIC),
            rpm: self.req_buckets.iter().map(|b| b.load(ATOMIC)).sum(),
            tpm: self.tok_buckets.iter().map(|b| b.load(ATOMIC)).sum(),
            task: self.inflight.load(ATOMIC),
        }
    }
}

/// 用户并发 Task RAII（持有 Arc，槽被清理后仍可安全 Drop）
pub struct UserTaskGuard {
    metrics: Arc<UserMetrics>,
}

impl Drop for UserTaskGuard {
    fn drop(&mut self) {
        self.metrics.inflight.fetch_sub(1, ATOMIC);
    }
}

/// api_token_id → UserMetrics
pub static USER_METRICS: LazyLock<DashMap<String, Arc<UserMetrics>>> = LazyLock::new(DashMap::new);

/// user_id → 该用户下活跃的 api_token_id 集合（用于看板汇总）
static USER_TOKEN_INDEX: LazyLock<DashMap<String, DashMap<String, ()>>> =
    LazyLock::new(DashMap::new);

fn token_key(token_id: i64) -> String {
    token_id.to_string()
}

/// 获取或创建用户槽；快路径只拿 DashMap 读守卫
fn get_or_create_user(user_id: &str, token_id: i64) -> Arc<UserMetrics> {
    let key = token_key(token_id);
    if let Some(entry) = USER_METRICS.get(&key) {
        return entry.clone();
    }
    let metrics = USER_METRICS
        .entry(key.clone())
        .or_insert_with(|| Arc::new(UserMetrics::new(user_id)))
        .clone();
    USER_TOKEN_INDEX
        .entry(user_id.to_string())
        .or_default()
        .insert(key, ());
    metrics
}

/// 请求进入：全局 + 该 token 的 QPS/RPM +1，并返回双 Guard
pub fn begin_request(user_id: &str, token_id: i64) -> (GlobalTaskGuard, UserTaskGuard) {
    GLOBAL_METRICS.on_request();
    let global = GLOBAL_METRICS.task_guard();
    let user = get_or_create_user(user_id, token_id);
    user.on_request();
    let user_guard = user.task_guard();
    (global, user_guard)
}

/// 结算 Token：全局 + 该 token 的 TPM
pub fn record_tokens(user_id: &str, token_id: i64, total_tokens: u64) {
    if total_tokens == 0 {
        return;
    }
    GLOBAL_METRICS.on_tokens(total_tokens);
    get_or_create_user(user_id, token_id).on_tokens(total_tokens);
}

/// 汇总某用户下所有 api_key（token）的实时指标
pub fn snapshot_user(user_id: &str) -> MetricsSnapshot {
    let Some(index) = USER_TOKEN_INDEX.get(user_id) else {
        return MetricsSnapshot::default();
    };
    let mut snap = MetricsSnapshot::default();
    for item in index.iter() {
        if let Some(m) = USER_METRICS.get(item.key()) {
            let s = m.snapshot();
            snap.qps = snap.qps.saturating_add(s.qps);
            snap.rpm = snap.rpm.saturating_add(s.rpm);
            snap.tpm = snap.tpm.saturating_add(s.tpm);
            snap.task = snap.task.saturating_add(s.task);
        }
    }
    snap
}

pub fn snapshot_global() -> MetricsSnapshot {
    GLOBAL_METRICS.snapshot()
}

/// 剔除空闲用户槽，防止 DashMap 无限膨胀
pub fn cleanup_inactive_users(idle_ttl_secs: i64) {
    let now = GlobalMetrics::now_sec() as i64;
    let mut stale_keys: Vec<(String, String)> = Vec::new();

    for entry in USER_METRICS.iter() {
        let busy = entry.inflight.load(ATOMIC) > 0;
        let last = entry.last_active_at.load(ATOMIC);
        if !busy && (now - last) >= idle_ttl_secs {
            stale_keys.push((entry.key().clone(), entry.user_id.clone()));
        }
    }

    for (token_id, user_id) in stale_keys {
        USER_METRICS.remove(&token_id);
        if let Some(index) = USER_TOKEN_INDEX.get(&user_id) {
            index.remove(&token_id);
            let empty = index.is_empty();
            drop(index);
            if empty {
                USER_TOKEN_INDEX.remove(&user_id);
            }
        }
    }
}

/// 后台清理任务
pub async fn run_cleanup_loop(mut shutdown: tokio::sync::watch::Receiver<bool>) {
    let mut interval = tokio::time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    interval.tick().await;
    loop {
        tokio::select! {
            _ = interval.tick() => {
                cleanup_inactive_users(USER_IDLE_TTL_SECS);
            }
            _ = shutdown.changed() => {
                tracing::info!("[LiveMetrics] 冷用户清理任务已退出");
                return;
            }
        }
    }
}

/// 挂到 Response.extensions，流式响应结束前保持 Task 计数。
/// `http::Extensions` 要求 `Clone`，故用 Arc 共享；最后一副本 Drop 时才真正 -1。
#[derive(Clone)]
pub struct LiveMetricsTaskGuards {
    _inner: Arc<LiveMetricsTaskGuardsInner>,
}

struct LiveMetricsTaskGuardsInner {
    _global: GlobalTaskGuard,
    _user: UserTaskGuard,
}

impl LiveMetricsTaskGuards {
    pub fn new(global: GlobalTaskGuard, user: UserTaskGuard) -> Self {
        Self {
            _inner: Arc::new(LiveMetricsTaskGuardsInner {
                _global: global,
                _user: user,
            }),
        }
    }
}
