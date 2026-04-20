use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserLevel {
    pub id: i64,
    pub name: String,
    pub group_key: String,
    pub discount: f64,
    #[sqlx(default)]
    pub commission_ratio: f64,
    #[sqlx(default)]
    pub invite_reward_inviter: f64,
    #[sqlx(default)]
    pub invite_reward_invitee: f64,
    #[sqlx(default)]
    pub daily_invite_limit: i64,
    #[sqlx(default)]
    pub marketing_enabled: i64,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserLevelRequest {
    pub name: String,
    pub group_key: String,
    pub discount: f64,
    pub commission_ratio: Option<f64>,
    pub invite_reward_inviter: Option<f64>,
    pub invite_reward_invitee: Option<f64>,
    pub daily_invite_limit: Option<i64>,
    pub marketing_enabled: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserLevelRequest {
    pub name: Option<String>,
    pub group_key: Option<String>,
    pub discount: Option<f64>,
    pub commission_ratio: Option<f64>,
    pub invite_reward_inviter: Option<f64>,
    pub invite_reward_invitee: Option<f64>,
    pub daily_invite_limit: Option<i64>,
    pub marketing_enabled: Option<i64>,
    pub description: Option<String>,
}



#[derive(Debug, Serialize)]
pub struct UserLevelListResponse {
    pub data: Vec<UserLevel>,
    pub total: i64,
}
