use axum::{
    extract::{Query, State, Extension},
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::auth;
use crate::models::{TaskLog, TaskLogQuery, TaskLogListResponse};
use crate::error::AppResult;

pub async fn list_task_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<TaskLogQuery>,
) -> AppResult<Json<TaskLogListResponse>> {
    let page = query.page.unwrap_or(1);
    let per_page = query.per_page.unwrap_or(20);
    let offset = (page - 1) * per_page;

    let mut sql = "SELECT * FROM task_logs WHERE 1=1".to_string();
    let mut binds: Vec<String> = Vec::new();

    if claims.role != "admin" {
        sql.push_str(" AND user_id = ?");
        binds.push(claims.sub.clone());
    } else if let Some(ref user_id) = query.user_id {
        sql.push_str(" AND user_id = ?");
        binds.push(user_id.clone());
    }

    if let Some(channel_id) = query.channel_id {
        sql.push_str(" AND channel_id = ?");
        binds.push(channel_id.to_string());
    }

    if let Some(ref task_id) = query.task_id {
        sql.push_str(" AND task_id LIKE ?");
        binds.push(format!("%{}%", task_id));
    }

    let count_sql = sql.replace("SELECT *", "SELECT COUNT(*)");
    let count_query_str = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_query_str);
    for val in &binds {
        count_q = count_q.bind(val);
    }
    let total = count_q.fetch_one(&state.db.pool).await?;

    sql.push_str(&format!(" ORDER BY created_at DESC LIMIT {} OFFSET {}", per_page, offset));
    let logs_query_str = state.db.format_query(&sql);
    let mut logs_q = sqlx::query_as::<_, TaskLog>(&logs_query_str);
    for val in &binds {
        logs_q = logs_q.bind(val);
    }
    let logs = logs_q.fetch_all(&state.db.pool).await?;

    Ok(Json(TaskLogListResponse { data: logs, total }))
}

#[axum::debug_handler]
pub async fn generate_mock_task_log(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let (channel_id, status, progress, time_spent, task_id) = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        
        let channel_id: i64 = rng.gen_range(1..=20);
        let statuses = ["成功", "进行中", "失败"];
        let status = statuses[rng.gen_range(0..statuses.len())].to_string();
        let progress: i32 = if status == "成功" { 100 } else if status == "失败" { rng.gen_range(10..90) } else { rng.gen_range(10..99) };
        let time_spent: i32 = rng.gen_range(50..300);
        let task_id = format!("cgt-20260411{:06}-{:x}", rng.gen_range(0..999999), rng.gen_range(0..99999));
        
        (channel_id, status, progress, time_spent, task_id)
    };

    let user_id = &claims.sub;
    let platform = "豆包视频";
    let action_type = "图生视频";
    
    let now = chrono::Local::now();
    let end_time = now.format("%Y-%m-%d %H:%M:%S").to_string();
    let submit_time = (now - chrono::Duration::seconds(time_spent as i64)).format("%Y-%m-%d %H:%M:%S").to_string();
    
    let details = r#"{"preview": "https://example.com/preview.mp4", "download": "https://example.com/download.mp4"}"#;

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO task_logs (user_id, channel_id, platform, action_type, task_id, status, progress, submit_time, end_time, time_spent, details) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
    )
    .bind(user_id)
    .bind(channel_id)
    .bind(platform)
    .bind(action_type)
    .bind(task_id)
    .bind(status)
    .bind(progress)
    .bind(submit_time)
    .bind(end_time)
    .bind(time_spent)
    .bind(details)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({ "success": true, "message": "Mock task generated" })))
}
