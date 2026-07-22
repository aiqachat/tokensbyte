/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 纯内存限额拦截器（DashMap）+ 重启后懒加载 hydration
//!
//! Key = `token_id:local_day`。跨本地日换新 key。
//! DashMap miss 时禁止直接置 0：先查 `api_tokens` 已落库用量再灌入。
//! 热路径 `check_and_incr_quota` 占用内存额度后，由 BillingPipeline 异步刷库。

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use dashmap::DashMap;

use crate::db::Database;
use crate::time_system::{local_period_keys, PeriodKeys};

/// f64 用量 ↔ 微单位整数，便于 AtomicU64 无锁累加（精度与 money::MONEY_SCALE 一致：1e-6）
fn to_micros(v: f64) -> u64 {
    if v <= 0.0 {
        0
    } else {
        (v * crate::money::MONEY_SCALE).round() as u64
    }
}

fn from_micros(v: u64) -> f64 {
    v as f64 / crate::money::MONEY_SCALE
}

fn limit_opt(limit: f64) -> Option<f64> {
    if limit < 0.0 {
        None
    } else {
        Some(limit)
    }
}

#[derive(Debug)]
struct QuotaSlot {
    #[allow(dead_code)]
    day: String,
    #[allow(dead_code)]
    week: String,
    #[allow(dead_code)]
    month: String,
    daily_used: AtomicU64,
    weekly_used: AtomicU64,
    monthly_used: AtomicU64,
    total_used: AtomicU64,
    daily_limit: Option<f64>,
    weekly_limit: Option<f64>,
    monthly_limit: Option<f64>,
    total_limit: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct QuotaLimits {
    pub daily_quota_limit: f64,
    pub weekly_quota_limit: f64,
    pub monthly_quota_limit: f64,
    pub quota_limit: f64,
    pub quota_used: f64,
    pub weekly_quota_used: f64,
    pub monthly_quota_used: f64,
    pub last_reset_week: Option<String>,
    pub last_reset_month: Option<String>,
}

#[derive(Debug, Clone)]
pub struct IncrResult {
    pub amount: f64,
    /// 消费发生时刻锁定的周期键（刷库禁止重算）
    pub day: String,
    pub week: String,
    pub month: String,
}

#[derive(Debug, thiserror::Error)]
pub enum QuotaMemoryError {
    #[error("今日额度已耗尽")]
    DailyExhausted,
    #[error("本周额度已耗尽")]
    WeeklyExhausted,
    #[error("本月额度已耗尽")]
    MonthlyExhausted,
    #[error("总额度已耗尽")]
    TotalExhausted,
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
}

#[derive(Clone, Default)]
pub struct MemoryQuotaGuard {
    slots: Arc<DashMap<String, QuotaSlot>>,
}

impl MemoryQuotaGuard {
    pub fn new() -> Self {
        Self {
            slots: Arc::new(DashMap::new()),
        }
    }

    fn slot_key(token_id: i64, local_day: &str) -> String {
        format!("{}:{}", token_id, local_day)
    }

    /// 热路径：校验并累加（日/周/月/总）。miss 时 DB hydration。
    /// 返回金额与**消费时刻**锁定的 period keys，供异步刷库使用。
    pub async fn check_and_incr_quota(
        &self,
        db: &Database,
        token_id: i64,
        amount: f64,
        timedisplay: &str,
        limits: &QuotaLimits,
    ) -> Result<IncrResult, QuotaMemoryError> {
        if amount <= 0.0 || token_id <= 0 {
            return Ok(IncrResult {
                amount: 0.0,
                day: String::new(),
                week: String::new(),
                month: String::new(),
            });
        }

        let keys = local_period_keys(timedisplay);
        let key = Self::slot_key(token_id, &keys.day);
        if !self.slots.contains_key(&key) {
            self.hydrate_slot(db, token_id, &keys, limits).await?;
        }

        let add = to_micros(amount);
        let entry = self
            .slots
            .get(&key)
            .ok_or(QuotaMemoryError::DailyExhausted)?;

        loop {
            let d = entry.daily_used.load(Ordering::Relaxed);
            let w = entry.weekly_used.load(Ordering::Relaxed);
            let m = entry.monthly_used.load(Ordering::Relaxed);
            let t = entry.total_used.load(Ordering::Relaxed);

            if let Some(lim) = entry.total_limit {
                if from_micros(t) >= lim {
                    return Err(QuotaMemoryError::TotalExhausted);
                }
            }
            if let Some(lim) = entry.daily_limit {
                if from_micros(d) >= lim {
                    return Err(QuotaMemoryError::DailyExhausted);
                }
            }
            if let Some(lim) = entry.weekly_limit {
                if from_micros(w) >= lim {
                    return Err(QuotaMemoryError::WeeklyExhausted);
                }
            }
            if let Some(lim) = entry.monthly_limit {
                if from_micros(m) >= lim {
                    return Err(QuotaMemoryError::MonthlyExhausted);
                }
            }

            // 与历史 token_quota 一致：未耗尽时允许最后一笔整额累加（可略超）
            if entry
                .daily_used
                .compare_exchange_weak(
                    d,
                    d.saturating_add(add),
                    Ordering::SeqCst,
                    Ordering::Relaxed,
                )
                .is_err()
            {
                continue;
            }
            entry.weekly_used.fetch_add(add, Ordering::SeqCst);
            entry.monthly_used.fetch_add(add, Ordering::SeqCst);
            entry.total_used.fetch_add(add, Ordering::SeqCst);
            return Ok(IncrResult {
                amount,
                day: keys.day.clone(),
                week: keys.week.clone(),
                month: keys.month.clone(),
            });
        }
    }

    /// 只读校验（中间件）：hydration 后检查四档限额，不占用额度。
    pub async fn check_quota(
        &self,
        db: &Database,
        token_id: i64,
        timedisplay: &str,
        limits: &QuotaLimits,
    ) -> Result<(), QuotaMemoryError> {
        let keys = local_period_keys(timedisplay);
        let key = Self::slot_key(token_id, &keys.day);
        if !self.slots.contains_key(&key) {
            self.hydrate_slot(db, token_id, &keys, limits).await?;
        }

        let slot = self
            .slots
            .get(&key)
            .ok_or(QuotaMemoryError::DailyExhausted)?;
        Self::assert_under_limit(&slot)?;
        Ok(())
    }

    fn assert_under_limit(slot: &QuotaSlot) -> Result<(), QuotaMemoryError> {
        if let Some(lim) = slot.total_limit {
            if from_micros(slot.total_used.load(Ordering::Relaxed)) >= lim {
                return Err(QuotaMemoryError::TotalExhausted);
            }
        }
        if let Some(lim) = slot.daily_limit {
            if from_micros(slot.daily_used.load(Ordering::Relaxed)) >= lim {
                return Err(QuotaMemoryError::DailyExhausted);
            }
        }
        if let Some(lim) = slot.weekly_limit {
            if from_micros(slot.weekly_used.load(Ordering::Relaxed)) >= lim {
                return Err(QuotaMemoryError::WeeklyExhausted);
            }
        }
        if let Some(lim) = slot.monthly_limit {
            if from_micros(slot.monthly_used.load(Ordering::Relaxed)) >= lim {
                return Err(QuotaMemoryError::MonthlyExhausted);
            }
        }
        Ok(())
    }

    /// 旁路累加（同步落库成功后、或外部已确认写入时）
    pub fn apply_incr(&self, token_id: i64, local_day: &str, amount: f64) {
        if amount <= 0.0 {
            return;
        }
        let key = Self::slot_key(token_id, local_day);
        if let Some(slot) = self.slots.get(&key) {
            let add = to_micros(amount);
            slot.daily_used.fetch_add(add, Ordering::SeqCst);
            slot.weekly_used.fetch_add(add, Ordering::SeqCst);
            slot.monthly_used.fetch_add(add, Ordering::SeqCst);
            slot.total_used.fetch_add(add, Ordering::SeqCst);
        }
    }

    pub fn apply_refund(&self, token_id: i64, local_day: &str, amount: f64) {
        if amount <= 0.0 {
            return;
        }
        let key = Self::slot_key(token_id, local_day);
        if let Some(slot) = self.slots.get(&key) {
            let sub = to_micros(amount);
            Self::saturating_sub(&slot.daily_used, sub);
            Self::saturating_sub(&slot.weekly_used, sub);
            Self::saturating_sub(&slot.monthly_used, sub);
            Self::saturating_sub(&slot.total_used, sub);
        } else {
            tracing::warn!(
                "[QuotaMemory] apply_refund miss token_id={} day={} amount={:.6}（未 hydrate，已跳过）",
                token_id,
                local_day,
                amount
            );
        }
    }

    /// 清零/重置后丢弃该令牌全部日 slot，下次请求从 DB 重新 hydrate。
    pub fn invalidate_token(&self, token_id: i64) {
        if token_id <= 0 {
            return;
        }
        let prefix = format!("{token_id}:");
        self.slots.retain(|k, _| !k.starts_with(&prefix));
    }

    /// 退款前确保 slot 存在（miss 则 hydrate），避免静默丢弃。
    pub async fn apply_refund_ensured(
        &self,
        db: &Database,
        token_id: i64,
        timedisplay: &str,
        amount: f64,
    ) {
        if amount <= 0.0 || token_id <= 0 {
            return;
        }
        let keys = local_period_keys(timedisplay);
        let key = Self::slot_key(token_id, &keys.day);
        if !self.slots.contains_key(&key) {
            let limits = QuotaLimits {
                daily_quota_limit: -1.0,
                weekly_quota_limit: -1.0,
                monthly_quota_limit: -1.0,
                quota_limit: -1.0,
                quota_used: 0.0,
                weekly_quota_used: 0.0,
                monthly_quota_used: 0.0,
                last_reset_week: None,
                last_reset_month: None,
            };
            if let Err(e) = self.hydrate_slot(db, token_id, &keys, &limits).await {
                tracing::warn!(
                    "[QuotaMemory] apply_refund_ensured hydrate 失败 token_id={}: {}",
                    token_id,
                    e
                );
                return;
            }
        }
        self.apply_refund(token_id, &keys.day, amount);
    }

    fn saturating_sub(atom: &AtomicU64, sub: u64) {
        loop {
            let cur = atom.load(Ordering::Relaxed);
            let next = cur.saturating_sub(sub);
            if atom
                .compare_exchange_weak(cur, next, Ordering::SeqCst, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
    }

    async fn hydrate_slot(
        &self,
        db: &Database,
        token_id: i64,
        keys: &PeriodKeys,
        limits: &QuotaLimits,
    ) -> Result<(), QuotaMemoryError> {
        #[derive(sqlx::FromRow)]
        struct Row {
            quota_limit: f64,
            quota_used: f64,
            daily_quota_limit: f64,
            daily_quota_used: f64,
            weekly_quota_limit: f64,
            weekly_quota_used: f64,
            monthly_quota_limit: f64,
            monthly_quota_used: f64,
            last_reset_day: Option<String>,
            last_reset_week: Option<String>,
            last_reset_month: Option<String>,
        }

        let row: Option<Row> = sqlx::query_as(&db.format_query(
            "SELECT quota_limit, quota_used, \
             daily_quota_limit, daily_quota_used, \
             weekly_quota_limit, weekly_quota_used, \
             monthly_quota_limit, monthly_quota_used, \
             last_reset_day, last_reset_week, last_reset_month \
             FROM api_tokens WHERE id = ?",
        ))
        .bind(token_id)
        .fetch_optional(&db.pool)
        .await?;

        let slot = match row {
            Some(r) => {
                let daily = if r.last_reset_day.as_deref() == Some(keys.day.as_str()) {
                    r.daily_quota_used.max(0.0)
                } else {
                    0.0
                };
                let weekly = if r.last_reset_week.as_deref() == Some(keys.week.as_str()) {
                    r.weekly_quota_used.max(0.0)
                } else {
                    0.0
                };
                let monthly = if r.last_reset_month.as_deref() == Some(keys.month.as_str()) {
                    r.monthly_quota_used.max(0.0)
                } else {
                    0.0
                };
                QuotaSlot {
                    day: keys.day.clone(),
                    week: keys.week.clone(),
                    month: keys.month.clone(),
                    daily_used: AtomicU64::new(to_micros(daily)),
                    weekly_used: AtomicU64::new(to_micros(weekly)),
                    monthly_used: AtomicU64::new(to_micros(monthly)),
                    total_used: AtomicU64::new(to_micros(r.quota_used.max(0.0))),
                    daily_limit: limit_opt(r.daily_quota_limit),
                    weekly_limit: limit_opt(r.weekly_quota_limit),
                    monthly_limit: limit_opt(r.monthly_quota_limit),
                    total_limit: limit_opt(r.quota_limit),
                }
            }
            None => QuotaSlot {
                day: keys.day.clone(),
                week: keys.week.clone(),
                month: keys.month.clone(),
                daily_used: AtomicU64::new(0),
                weekly_used: AtomicU64::new(0),
                monthly_used: AtomicU64::new(0),
                total_used: AtomicU64::new(to_micros(limits.quota_used.max(0.0))),
                daily_limit: limit_opt(limits.daily_quota_limit),
                weekly_limit: limit_opt(limits.weekly_quota_limit),
                monthly_limit: limit_opt(limits.monthly_quota_limit),
                total_limit: limit_opt(limits.quota_limit),
            },
        };

        let map_key = Self::slot_key(token_id, &keys.day);
        self.slots.entry(map_key).or_insert(slot);

        tracing::debug!(
            "[QuotaMemory] hydrated token_id={} day={}",
            token_id,
            keys.day
        );
        Ok(())
    }
}

/// 从 ApiToken 构造限额快照（周/月重置键用于 hydration 回退）
pub fn limits_from_token(token: &crate::models::ApiToken) -> QuotaLimits {
    QuotaLimits {
        daily_quota_limit: token.daily_quota_limit,
        weekly_quota_limit: token.weekly_quota_limit,
        monthly_quota_limit: token.monthly_quota_limit,
        quota_limit: token.quota_limit,
        quota_used: token.quota_used,
        weekly_quota_used: token.weekly_quota_used,
        monthly_quota_used: token.monthly_quota_used,
        last_reset_week: token.last_reset_week.clone(),
        last_reset_month: token.last_reset_month.clone(),
    }
}
