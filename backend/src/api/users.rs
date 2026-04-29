use axum::{
    extract::{Path, State},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{User, CreateUserRequest, UpdateUserRequest, UserListResponse, RechargeRequest, LoginResponse};
use crate::error::{AppError, AppResult};
use crate::auth;
use sqlx::Any;

pub async fn list_users(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UserListResponse>> {
    let users: Vec<User> = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key ORDER BY u.created_at DESC"
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let total = users.len() as i64;
    Ok(Json(UserListResponse { data: users, total }))
}

pub async fn create_user(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateUserRequest>,
) -> AppResult<Json<User>> {
    let mut actual_email = request.email.clone();
    if actual_email.is_empty() {
        use rand::Rng;
        let random_suffix: String = (0..8).map(|_| rand::thread_rng().gen_range(0..10).to_string()).collect();
        actual_email = format!("u_{}@tokensbyte.local", random_suffix);
    }

    let exists: bool = sqlx::query_scalar(
        &state.db.format_query("SELECT EXISTS(SELECT 1 FROM users WHERE username = ? OR email = ?)")
    )
    .bind(&request.username)
    .bind(&actual_email)
    .fetch_one(&state.db.pool)
    .await?;

    if exists {
        return Err(AppError::Conflict("User already exists".to_string()));
    }

    let password_hash = auth::hash_password(&request.password)?;
    let user_id = uuid::Uuid::new_v4().to_string();
    let uid = state.db.generate_unique_uid().await.map_err(AppError::from)?;

    let role = request.role.as_deref().unwrap_or("user");
    let user_group = request.user_group.as_deref().unwrap_or(request.group.as_deref().unwrap_or("default"));
    let admin_group_id = request.admin_group_id;
    let referred_by = request.referred_by.clone().or(request.aff.clone());

    sqlx::query(
        &state.db.format_query(r#"INSERT INTO users (id, uid, username, email, password_hash, role, user_group, admin_group_id, balance, is_active, referred_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.0, 1, ?)"#)
    )
    .bind(&user_id)
    .bind(&uid)
    .bind(&request.username)
    .bind(&actual_email)
    .bind(&password_hash)
    .bind(role)
    .bind(user_group)
    .bind(admin_group_id)
    .bind(&referred_by)
    .execute(&state.db.pool)
    .await?;

    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&user_id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(user))
}

pub async fn update_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<UpdateUserRequest>,
) -> AppResult<Json<User>> {
    let mut user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let old_balance = user.balance;

    if let Some(username) = request.username { user.username = username; }
    if let Some(email) = request.email { user.email = email; }
    if let Some(password) = request.password { user.password_hash = auth::hash_password(&password)?; }
    if let Some(nickname) = request.nickname { user.nickname = Some(nickname); }
    if let Some(mobile) = request.mobile { user.mobile = Some(mobile); }
    if let Some(wechat_id) = request.wechat_id { user.wechat_id = Some(wechat_id); }
    if let Some(role) = request.role { user.role = role; }
    if let Some(balance) = request.balance { user.balance = balance; }
    if let Some(user_group) = request.user_group { user.user_group = user_group; }
    if let Some(is_active) = request.is_active { user.is_active = is_active; }
    if let Some(admin_remark) = request.admin_remark { user.admin_remark = Some(admin_remark); }
    if let Some(referred_by) = request.referred_by { 
        user.referred_by = if referred_by.trim().is_empty() { None } else { Some(referred_by) }; 
    }
    if let Some(referral_history) = request.referral_history {
        user.referral_history = Some(referral_history);
    }

    let mut tx = state.db.pool.begin().await?;

    sqlx::query(
        &state.db.format_query(r#"UPDATE users SET username = ?, email = ?, password_hash = ?, 
           nickname = ?, mobile = ?, wechat_id = ?,
           role = ?, balance = ?, user_group = ?, is_active = ?, admin_remark = ?, referred_by = ?, referral_history = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#)
    )
    .bind(&user.username)
    .bind(&user.email)
    .bind(&user.password_hash)
    .bind(&user.nickname)
    .bind(&user.mobile)
    .bind(&user.wechat_id)
    .bind(&user.role)
    .bind(user.balance)
    .bind(&user.user_group)
    .bind(user.is_active)
    .bind(&user.admin_remark)
    .bind(&user.referred_by)
    .bind(&user.referral_history)
    .bind(&id)
    .execute(&mut *tx)
    .await?;

    if user.balance > old_balance {
        let diff = user.balance - old_balance;
        sqlx::query(
            &state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'manual', ?)")
        )
        .bind(&id)
        .bind(diff)
        .bind("Administrator Adjustment")
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(Json(user))
}

pub async fn delete_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 防止管理员删除自己
    if claims.sub == id {
        return Err(AppError::BadRequest("不能删除当前登录的管理员账户".to_string()));
    }

    // 使用事务，按外键依赖顺序逐层清理关联数据
    let mut tx = state.db.pool.begin().await?;

    // 1. commissions 引用 recharge_records(id) 和 users(id)，必须最先删
    sqlx::query(&state.db.format_query("DELETE FROM commissions WHERE user_id = ? OR from_user_id = ?"))
        .bind(&id).bind(&id).execute(&mut *tx).await?;

    // 2. recharge_records 引用 users(id)
    sqlx::query(&state.db.format_query("DELETE FROM recharge_records WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 3. api_tokens 引用 users(id)
    sqlx::query(&state.db.format_query("DELETE FROM api_tokens WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 4. orders 引用 users(id)
    sqlx::query(&state.db.format_query("DELETE FROM orders WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 5. plugin_assets 引用 users(id)
    sqlx::query(&state.db.format_query("DELETE FROM plugin_assets WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 6. plugin_asset_groups 引用 users(id)
    sqlx::query(&state.db.format_query("DELETE FROM plugin_asset_groups WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 7. 无外键但需清理的业务数据
    sqlx::query(&state.db.format_query("DELETE FROM logs WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;
    sqlx::query(&state.db.format_query("DELETE FROM plugin_api_logs WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;
    // marketing 关联（无外键但需清理）
    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_leaders WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;
    sqlx::query(&state.db.format_query("DELETE FROM marketing_team_members WHERE user_id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    // 8. 最终删除用户主记录（playground_projects / playground_assets 已有 ON DELETE CASCADE）
    sqlx::query(&state.db.format_query("DELETE FROM users WHERE id = ?"))
        .bind(&id).execute(&mut *tx).await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({ "success": true })))
}
pub async fn recharge_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(request): Json<RechargeRequest>,
) -> AppResult<Json<User>> {
    let mut tx = state.db.pool.begin().await?;

    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let new_balance = user.balance + request.amount;
    let remark = request.remark.unwrap_or_else(|| "Administrator Adjustment".to_string());

    sqlx::query(&state.db.format_query("UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
        .bind(new_balance)
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    let recharge_id: i64 = sqlx::query_scalar::<Any, i64>(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'manual', ?) RETURNING id"))
        .bind(&id)
        .bind(request.amount)
        .bind(&remark)
        .fetch_one(&mut *tx)
        .await?;

    // Award commission if user has inviter
    if let Err(e) = crate::services::affiliate::award_commission(&state.db, &mut tx, &id, recharge_id, request.amount).await {
        tracing::error!("Failed to award commission for recharge {}: {}", recharge_id, e);
    }

    tx.commit().await?;

    let updated_user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(updated_user))
}

pub async fn impersonate_user(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> AppResult<Json<LoginResponse>> {
    let user: User = sqlx::query_as(&state.db.format_query(
        "SELECT u.*, ul.name as level_name FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(&id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    if user.role != "user" {
        return Err(AppError::Forbidden("Only normal users can be impersonated".to_string()));
    }

    if user.is_active == 0 {
        return Err(AppError::Forbidden("Account disabled".to_string()));
    }

    let token = auth::create_token(&user.id, &user.username, &user.role, &state.config.jwt_secret)?;

    Ok(Json(LoginResponse { token, user }))
}
