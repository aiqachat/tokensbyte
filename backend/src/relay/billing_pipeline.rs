//! Token 消耗事件 MPSC 管道：合并批量刷库 + 优雅停机 drain
//!
//! 事件携带**消费发生时刻**的 day/week/month key，刷库禁止用 Utc::now() 重算。
//! 合并键为 `token_id:day`，跨午夜批次不会串账。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::db::Database;

const CHANNEL_CAPACITY: usize = 8192;
const BATCH_MAX: usize = 256;
const FLUSH_INTERVAL: Duration = Duration::from_millis(200);
const DRAIN_IDLE_ROUNDS: u32 = 5;

#[derive(Debug, Clone)]
pub struct ConsumeEvent {
    pub token_id: i64,
    pub amount: f64,
    /// 消费发生时刻已锁定的周期键（禁止刷库时重算）
    pub day: String,
    pub week: String,
    pub month: String,
}

struct Aggregated {
    amount: f64,
    day: String,
    week: String,
    month: String,
}

/// 可 clone 的投递入口（放入 AppState）
#[derive(Clone)]
pub struct BillingIngress {
    tx: mpsc::Sender<ConsumeEvent>,
    closed: Arc<AtomicBool>,
}

impl BillingIngress {
    pub fn try_enqueue(&self, event: ConsumeEvent) -> bool {
        if self.closed.load(Ordering::Acquire) {
            return false;
        }
        self.tx.try_send(event).is_ok()
    }

    pub async fn enqueue(
        &self,
        event: ConsumeEvent,
    ) -> Result<(), mpsc::error::SendError<ConsumeEvent>> {
        if self.closed.load(Ordering::Acquire) {
            return Err(mpsc::error::SendError(event));
        }
        self.tx.send(event).await
    }
}

pub struct BillingPipelineHandle {
    ingress: BillingIngress,
    worker: JoinHandle<()>,
}

impl BillingPipelineHandle {
    pub fn start(db: Database, shutdown_rx: tokio::sync::watch::Receiver<bool>) -> Self {
        let (tx, rx) = mpsc::channel::<ConsumeEvent>(CHANNEL_CAPACITY);
        let closed = Arc::new(AtomicBool::new(false));
        let ingress = BillingIngress {
            tx,
            closed: closed.clone(),
        };
        let worker = tokio::spawn(run_worker(db, rx, shutdown_rx, closed));
        Self { ingress, worker }
    }

    pub fn ingress(&self) -> BillingIngress {
        self.ingress.clone()
    }

    /// 等待 Worker 完成 drain（应在 `shutdown_tx.send(true)` 之后调用）
    pub async fn join(self) {
        match tokio::time::timeout(Duration::from_secs(25), self.worker).await {
            Ok(Ok(())) => tracing::info!("[BillingPipeline] worker drained and exited"),
            Ok(Err(e)) => tracing::error!("[BillingPipeline] worker join error: {}", e),
            Err(_) => tracing::warn!("[BillingPipeline] drain timeout"),
        }
    }
}

async fn run_worker(
    db: Database,
    mut rx: mpsc::Receiver<ConsumeEvent>,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
    closed: Arc<AtomicBool>,
) {
    // key = "token_id:day"
    let mut buf: HashMap<String, Aggregated> = HashMap::new();
    let mut flush_tick = tokio::time::interval(FLUSH_INTERVAL);
    flush_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            biased;
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    closed.store(true, Ordering::Release);
                    drain_remaining(&db, &mut rx, &mut buf).await;
                    tracing::info!("[BillingPipeline] shutdown drain complete");
                    return;
                }
            }
            maybe = rx.recv() => {
                match maybe {
                    Some(ev) => {
                        merge(&mut buf, ev);
                        if buf.len() >= BATCH_MAX {
                            flush_batch(&db, &mut buf).await;
                        }
                    }
                    None => {
                        if !buf.is_empty() {
                            flush_batch(&db, &mut buf).await;
                        }
                        tracing::info!("[BillingPipeline] channel closed, worker exit");
                        return;
                    }
                }
            }
            _ = flush_tick.tick() => {
                if !buf.is_empty() {
                    flush_batch(&db, &mut buf).await;
                }
            }
        }
    }
}

async fn drain_remaining(
    db: &Database,
    rx: &mut mpsc::Receiver<ConsumeEvent>,
    buf: &mut HashMap<String, Aggregated>,
) {
    let mut idle = 0u32;
    while idle < DRAIN_IDLE_ROUNDS {
        match rx.try_recv() {
            Ok(ev) => {
                merge(buf, ev);
                idle = 0;
                if buf.len() >= BATCH_MAX {
                    flush_batch(db, buf).await;
                }
            }
            Err(mpsc::error::TryRecvError::Empty) => {
                idle += 1;
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            Err(mpsc::error::TryRecvError::Disconnected) => break,
        }
    }
    if !buf.is_empty() {
        flush_batch(db, buf).await;
    }
}

fn merge_key(token_id: i64, day: &str) -> String {
    format!("{}:{}", token_id, day)
}

fn merge(buf: &mut HashMap<String, Aggregated>, ev: ConsumeEvent) {
    if ev.amount <= 0.0 || ev.token_id <= 0 || ev.day.is_empty() {
        return;
    }
    let k = merge_key(ev.token_id, &ev.day);
    buf.entry(k)
        .and_modify(|a| {
            a.amount += ev.amount;
        })
        .or_insert(Aggregated {
            amount: ev.amount,
            day: ev.day,
            week: ev.week,
            month: ev.month,
        });
}

async fn flush_batch(db: &Database, buf: &mut HashMap<String, Aggregated>) {
    let batch: Vec<(String, Aggregated)> = buf.drain().collect();
    for (agg_key, agg) in batch {
        let token_id: i64 = agg_key
            .split_once(':')
            .and_then(|(id, _)| id.parse().ok())
            .unwrap_or(0);
        if token_id <= 0 {
            continue;
        }
        if let Err(e) = flush_one(db, token_id, &agg).await {
            tracing::error!(
                "[BillingPipeline] flush failed token_id={} day={} amount={:.6}: {}",
                token_id,
                agg.day,
                agg.amount,
                e
            );
        }
    }
}

async fn flush_one(db: &Database, token_id: i64, agg: &Aggregated) -> Result<(), sqlx::Error> {
    // 直接使用事件携带的 period keys，禁止 local_period_keys(now)
    let sql = db.format_query(
        "UPDATE api_tokens SET \
         quota_used = quota_used + ?, \
         daily_quota_used = CASE WHEN COALESCE(last_reset_day, '') <> ? THEN ? ELSE daily_quota_used + ? END, \
         weekly_quota_used = CASE WHEN COALESCE(last_reset_week, '') <> ? THEN ? ELSE weekly_quota_used + ? END, \
         monthly_quota_used = CASE WHEN COALESCE(last_reset_month, '') <> ? THEN ? ELSE monthly_quota_used + ? END, \
         last_reset_day = ?, \
         last_reset_week = ?, \
         last_reset_month = ?, \
         updated_at = CURRENT_TIMESTAMP \
         WHERE id = ?",
    );
    sqlx::query(&sql)
        .bind(agg.amount)
        .bind(&agg.day)
        .bind(agg.amount)
        .bind(agg.amount)
        .bind(&agg.week)
        .bind(agg.amount)
        .bind(agg.amount)
        .bind(&agg.month)
        .bind(agg.amount)
        .bind(agg.amount)
        .bind(&agg.day)
        .bind(&agg.week)
        .bind(&agg.month)
        .bind(token_id)
        .execute(&db.pool)
        .await?;
    Ok(())
}
