/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! timesystem / timedisplay 解耦层
//!
//! - **timesystem**：全局固定 UTC+0，所有落库时间与进程运行时基准。
//! - **timedisplay**：用户/管理端显示与计费自然日边界（套餐到期、日限额、统计聚合）。

pub mod core;
pub mod db_ts;
pub mod period;

pub use core::{
    enforce_process_utc, parse_timedisplay, resolve_timedisplay, utc_naive_string,
    DEFAULT_TIMEDISPLAY, TIMESYSTEM_TZ,
};
pub use db_ts::DbTs;
pub use period::{local_day_bounds_utc, local_period_keys, PeriodKeys};
