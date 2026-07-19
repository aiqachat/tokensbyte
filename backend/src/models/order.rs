use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct Order {
    pub id: i64,
    pub out_trade_no: String,
    pub user_id: String,
    pub payment_method: String,
    pub amount: f64,
    pub status: String, // pending, paid, closed
    pub trade_no: Option<String>,
    pub created_at: DbTs,
    pub paid_at: Option<DbTs>,
}
