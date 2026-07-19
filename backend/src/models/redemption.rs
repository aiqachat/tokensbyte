use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Redemption {
    pub id: i64,
    pub name: String,
    pub code: String,
    pub quota: f64,
    pub is_used: i32,
    pub used_at: Option<DbTs>,
    pub used_by: Option<String>,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    /// 过期时间（NULL/空 = 长期有效）
    #[sqlx(default)]
    pub expires_at: Option<DbTs>,
    /// 单兑换码可兑换次数，-1 = 不限（兼容历史 0 = 不限）
    #[sqlx(default)]
    pub max_uses: i32,
    /// 已兑换次数（按单个兑换码累计）
    #[sqlx(default)]
    pub used_count: i32,
    /// 单兑换码单用户可兑换次数，-1 = 不限（兼容历史 0 = 不限）
    #[sqlx(default)]
    pub per_user_limit: i32,
}

#[derive(Debug, Deserialize)]
pub struct CreateRedemptionRequest {
    pub name: String,
    pub count: i32,
    pub quota: f64,
    /// 是否长期有效（true 时忽略 expires_at）
    #[serde(default = "default_true")]
    pub permanent: bool,
    /// 过期时间 ISO 字符串（permanent=false 时必填）
    #[serde(default)]
    pub expires_at: Option<String>,
    /// 是否允许多次兑换（false 时强制 max_uses=1, per_user_limit=1）
    #[serde(default)]
    pub allow_multiple: bool,
    /// 单兑换码兑换次数上限，-1 = 不限（仅 allow_multiple=true 时生效；每个码独立）
    #[serde(default = "default_unlimited")]
    pub max_uses: i32,
    /// 单兑换码单用户兑换次数上限，-1 = 不限（仅 allow_multiple=true 时生效）
    #[serde(default = "default_unlimited")]
    pub per_user_limit: i32,
}

fn default_true() -> bool {
    true
}

fn default_unlimited() -> i32 {
    -1
}

#[derive(Debug, Deserialize)]
pub struct RedeemRequest {
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct RedemptionListResponse {
    pub data: Vec<Redemption>,
    pub total: i64,
}
