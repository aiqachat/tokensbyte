use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub uid: String,
    pub username: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub nickname: Option<String>,
    pub mobile: Option<String>,
    pub wechat_id: Option<String>,
    pub role: String,
    pub balance: f64,
    pub user_group: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub group: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub email: Option<String>,
    pub password: Option<String>,
    pub nickname: Option<String>,
    pub mobile: Option<String>,
    pub wechat_id: Option<String>,
    pub role: Option<String>,
    pub balance: Option<f64>,
    pub user_group: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ProfileUpdateRequest {
    pub nickname: Option<String>,
    pub password: Option<String>,
    pub email: Option<String>,
    pub mobile: Option<String>,
    pub wechat_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RechargeRecord {
    pub id: i64,
    pub user_id: String,
    pub amount: f64,
    pub recharge_type: String,
    pub remark: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RechargeRequest {
    pub amount: f64,
    pub remark: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WalletStats {
    pub balance: f64,
    pub total_consumption: f64,
    pub total_calls: i64,
    pub success_calls: i64,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Serialize)]
pub struct UserListResponse {
    pub data: Vec<User>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct SendCodeRequest {
    pub email: String,
    pub purpose: String, // register, reset_password
}

#[derive(Debug, Deserialize)]
pub struct EmailRegisterRequest {
    pub email: String,
    pub code: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub email: String,
    pub code: String,
    pub new_password: String,
}
