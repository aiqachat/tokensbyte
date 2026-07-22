/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

#![allow(dead_code)]
use crate::time_system::DbTs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum VerificationPurpose {
    Register,
    ResetPassword,
    BindMobile,
    BindEmail,
}

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::FromRow)]
pub struct VerificationCode {
    pub id: i64,
    pub email: String,
    /// 手机号（短信验证码时使用）
    pub phone: String,
    pub code: String,
    pub purpose: String,
    pub expires_at: DbTs,
    pub created_at: DbTs,
}
