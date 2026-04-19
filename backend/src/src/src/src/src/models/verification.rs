#![allow(dead_code)]
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum VerificationPurpose {
    Register,
    ResetPassword,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct VerificationCode {
    pub id: i64,
    pub email: String,
    pub code: String,
    pub purpose: String, // Stored as string in SQLite for simplicity
    pub expires_at: String,
    pub created_at: String,
}
