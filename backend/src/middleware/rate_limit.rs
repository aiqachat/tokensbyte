use std::sync::Arc;
use dashmap::DashMap;
use governor::{Quota, RateLimiter, state::InMemoryState, state::NotKeyed};
use std::num::NonZeroU32;

pub struct GlobalRateLimiter {
    // Key: TokenID, Value: Limiter (RPS)
    token_rps_limits: DashMap<i64, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
    // Key: TokenID, Value: Limiter (RPM)
    token_rpm_limits: DashMap<i64, Arc<RateLimiter<NotKeyed, InMemoryState, governor::clock::DefaultClock>>>,
}

impl GlobalRateLimiter {
    pub fn new() -> Self {
        Self {
            token_rps_limits: DashMap::new(),
            token_rpm_limits: DashMap::new(),
        }
    }

    pub fn check_rps(&self, token_id: i64, rps: i32) -> bool {
        if rps <= 0 {
            return true;
        }

        let limiter = self.token_rps_limits.entry(token_id).or_insert_with(|| {
            let quota = Quota::per_second(NonZeroU32::new(rps as u32).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });

        limiter.check().is_ok()
    }

    pub fn check_rpm(&self, token_id: i64, rpm: i32) -> bool {
        if rpm <= 0 {
            return true;
        }

        let limiter = self.token_rpm_limits.entry(token_id).or_insert_with(|| {
            let quota = Quota::per_minute(NonZeroU32::new(rpm as u32).unwrap());
            Arc::new(RateLimiter::direct(quota))
        });

        limiter.check().is_ok()
    }
}
