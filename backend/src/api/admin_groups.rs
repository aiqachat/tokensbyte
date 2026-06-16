use axum::{
    extract::{State, Path},
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{
    AdminGroup, CreateAdminGroupRequest, UpdateAdminGroupRequest, AdminGroupListResponse
};
use crate::error::{AppError, AppResult};

pub async fn list_admin_groups(
    State(state): State<Arc<AppState>>,
) -> Response {
    let result: AppResult<Json<AdminGroupListResponse>> = (async {
        let groups: Vec<AdminGroup> = sqlx::query_as(&state.db.format_query("SELECT * FROM admin_groups ORDER BY sort_order DESC, id DESC"))
            .fetch_all(&state.db.pool)
            .await?;
        
        let total: i64 = sqlx::query_scalar(&state.db.format_query("SELECT COUNT(*) FROM admin_groups"))
            .fetch_one(&state.db.pool)
            .await?;

        Ok(Json(AdminGroupListResponse { data: groups, total }))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn create_admin_group(
    State(state): State<Arc<AppState>>,
    Json(request): Json<CreateAdminGroupRequest>,
) -> Response {
    let result: AppResult<Json<serde_json::Value>> = (async {
        let permissions_json = serde_json::to_string(&request.permissions.unwrap_or_default())?;
        
        sqlx::query(
            &state.db.format_query("INSERT INTO admin_groups (name, permissions, description, sort_order) VALUES (?, ?, ?, ?)")
        )
        .bind(&request.name)
        .bind(permissions_json)
        .bind(&request.description)
        .bind(request.sort_order.unwrap_or(0))
        .execute(&state.db.pool)
        .await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn update_admin_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(request): Json<UpdateAdminGroupRequest>,
) -> Response {
    let result: AppResult<Json<serde_json::Value>> = (async {
        let mut tx = state.db.pool.begin().await?;

        if let Some(name) = request.name {
            sqlx::query(&state.db.format_query("UPDATE admin_groups SET name = ? WHERE id = ?"))
                .bind(name)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }

        if let Some(permissions) = request.permissions {
            let p_json = serde_json::to_string(&permissions)?;
            sqlx::query(&state.db.format_query("UPDATE admin_groups SET permissions = ? WHERE id = ?"))
                .bind(p_json)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }

        if let Some(description) = request.description {
            sqlx::query(&state.db.format_query("UPDATE admin_groups SET description = ? WHERE id = ?"))
                .bind(description)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }

        if let Some(sort_order) = request.sort_order {
            sqlx::query(&state.db.format_query("UPDATE admin_groups SET sort_order = ? WHERE id = ?"))
                .bind(sort_order)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query(&state.db.format_query("UPDATE admin_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"))
            .bind(id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}

pub async fn delete_admin_group(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Response {
    let result: AppResult<Json<serde_json::Value>> = (async {
        // Check if any users are using this group
        let count: i64 = sqlx::query_scalar(&state.db.format_query("SELECT COUNT(*) FROM users WHERE admin_group_id = ?"))
            .bind(id)
            .fetch_one(&state.db.pool)
            .await?;
        
        if count > 0 {
            return Err(AppError::BadRequest("Cannot delete group that is in use by users".to_string()));
        }

        sqlx::query(&state.db.format_query("DELETE FROM admin_groups WHERE id = ?"))
            .bind(id)
            .execute(&state.db.pool)
            .await?;

        Ok(Json(serde_json::json!({ "success": true })))
    }).await;

    match result {
        Ok(json) => json.into_response(),
        Err(err) => err.into_response(),
    }
}
