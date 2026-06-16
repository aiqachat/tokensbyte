//! 快乐小马智能路由管理 API
//!
//! 提供插件配置的管理（自定义模型名称、自定义模型 ID、4 个实际子模型的关联映射、以及动态生成 ephh-XXXXXX 路由节点），
//! 以及查看请求分发日志的接口。

use axum::{
    extract::{State, Extension, Query, Path},
    routing::{get, put},
    Json, Router,
};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::{
    error::{AppResult, AppError},
    AppState,
    auth,
};

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/configs", get(list_configs).post(create_config))
        .route("/configs/{id}", put(update_config).delete(delete_config))
        .route("/config", get(get_config).post(save_config)) // Keep legacy fallback
        .route("/logs", get(list_logs))
}

// ── 管理员权限检查 ─────────────────────────────────────────────

async fn require_admin(state: &Arc<AppState>, claims: &auth::Claims) -> AppResult<()> {
    let role: String = sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
        .bind(&claims.sub)
        .fetch_one(&state.db.pool)
        .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

// ── 数据库模型与请求结构 ────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HappyHorseConfig {
    pub id: i32,
    pub custom_model_name: String,
    pub custom_model_id: String,
    pub t2v_model: String,
    pub i2v_model: String,
    pub r2v_model: String,
    pub edit_model: String,
    pub routing_node: String,
    pub is_active: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct HappyHorseLog {
    pub id: i64,
    pub user_uid: String,
    pub original_model: String,
    pub media_type: String,
    pub matched_model: String,
    pub status: i32,
    pub latency_ms: i32,
    pub error_message: Option<String>,
    pub task_id: Option<String>,
    #[sqlx(default)]
    pub log_id: Option<i64>,
    pub created_at: String,
    // 关联主日志表字段（LEFT JOIN 获取，无关联时为 null）
    #[sqlx(default)]
    pub log_request_content: Option<String>,
    #[sqlx(default)]
    pub log_upstream_req_content: Option<String>,
    #[sqlx(default)]
    pub log_response_content: Option<String>,
    #[sqlx(default)]
    pub log_billing_detail: Option<String>,
    #[sqlx(default)]
    pub log_billing_pid: Option<String>,
    #[sqlx(default)]
    pub log_forward_eid: Option<String>,
    /// 用户昵称（LEFT JOIN users 表获取）
    #[sqlx(default)]
    pub user_nickname: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateConfigRequest {
    pub custom_model_name: String,
    pub custom_model_id: String,
    pub t2v_model: String,
    pub i2v_model: String,
    pub r2v_model: String,
    pub edit_model: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateConfigRequest {
    pub custom_model_name: String,
    pub custom_model_id: String,
    pub t2v_model: String,
    pub i2v_model: String,
    pub r2v_model: String,
    pub edit_model: String,
    pub is_active: i32,
}

// For legacy endpoint compatibility
#[derive(Debug, Deserialize)]
pub struct SaveConfigRequest {
    pub custom_model_name: String,
    pub custom_model_id: String,
    pub t2v_model: String,
    pub i2v_model: String,
    pub r2v_model: String,
    pub edit_model: String,
    pub routing_node: String,
}

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub original_model: Option<String>,
    pub matched_model: Option<String>,
    pub status: Option<i32>,
    pub user_uid: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

// ── 智能路由节点 ID 自动生成 ─────────────────────────────────────

async fn generate_unique_routing_node(state: &AppState) -> AppResult<String> {
    loop {
        let node = {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let suffix: String = (0..6).map(|_| {
                let val = rng.gen_range(0..16);
                format!("{:x}", val)
            }).collect();
            format!("ephh-{}", suffix)
        }; // rng goes out of scope here before the await point to keep future Send
        let count: i64 = sqlx::query_scalar(
            &state.db.format_query("SELECT COUNT(*) FROM happyhorse_configs WHERE routing_node = ?")
        )
        .bind(&node)
        .fetch_one(&state.db.pool)
        .await?;
        if count == 0 {
            return Ok(node);
        }
    }
}

// ── CRUD API 处理器 ───────────────────────────────────────────

/// 获取所有路由配置列表以及可用系统模型
async fn list_configs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let configs: Vec<HappyHorseConfig> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM happyhorse_configs ORDER BY id DESC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    // 获取系统内所有活跃模型列表
    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct SimpleModel {
        mid: String,
        name: String,
        model_id: String,
    }
    let available_models: Vec<SimpleModel> = sqlx::query_as(
        &state.db.format_query("SELECT mid, name, model_id FROM models WHERE is_active = 1 ORDER BY name ASC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "configs": configs,
        "available_models": available_models,
    })))
}

/// 创建一条新的智能路由配置
async fn create_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<CreateConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    // 检查自定义模型 ID 是否重复
    let count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM happyhorse_configs WHERE custom_model_id = ?")
    )
    .bind(&req.custom_model_id)
    .fetch_one(&state.db.pool)
    .await?;
    if count > 0 {
        return Err(AppError::BadRequest("该自定义模型 ID 已存在，请换一个".to_string()));
    }

    let routing_node = generate_unique_routing_node(&state).await?;

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO happyhorse_configs (custom_model_name, custom_model_id, t2v_model, i2v_model, r2v_model, edit_model, routing_node, is_active) \
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
        )
    )
    .bind(&req.custom_model_name)
    .bind(&req.custom_model_id)
    .bind(&req.t2v_model)
    .bind(&req.i2v_model)
    .bind(&req.r2v_model)
    .bind(&req.edit_model)
    .bind(&routing_node)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "success": true, "message": "配置已成功创建", "routing_node": routing_node })))
}

/// 修改已有配置（名称、ID、子模型映射、是否启用）
async fn update_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<UpdateConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    // 检查修改后的自定义模型 ID 是否与其他配置冲突
    let count: i64 = sqlx::query_scalar(
        &state.db.format_query("SELECT COUNT(*) FROM happyhorse_configs WHERE custom_model_id = ? AND id != ?")
    )
    .bind(&req.custom_model_id)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;
    if count > 0 {
        return Err(AppError::BadRequest("该自定义模型 ID 已被其他配置使用".to_string()));
    }

    sqlx::query(
        &state.db.format_query(
            "UPDATE happyhorse_configs SET custom_model_name = ?, custom_model_id = ?, t2v_model = ?, i2v_model = ?, r2v_model = ?, edit_model = ?, is_active = ?, updated_at = (now()::text) \
             WHERE id = ?"
        )
    )
    .bind(&req.custom_model_name)
    .bind(&req.custom_model_id)
    .bind(&req.t2v_model)
    .bind(&req.i2v_model)
    .bind(&req.r2v_model)
    .bind(&req.edit_model)
    .bind(req.is_active)
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "success": true, "message": "配置已成功更新" })))
}

/// 删除指定配置
async fn delete_config(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    sqlx::query(
        &state.db.format_query("DELETE FROM happyhorse_configs WHERE id = ?")
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "success": true, "message": "配置已成功删除" })))
}

/// 兼容老接口：获取最新的路由配置（前端旧逻辑调用）
async fn get_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let latest_config: Option<HappyHorseConfig> = sqlx::query_as(
        &state.db.format_query("SELECT * FROM happyhorse_configs ORDER BY id DESC LIMIT 1")
    )
    .fetch_optional(&state.db.pool)
    .await?;

    let config = match latest_config {
        Some(c) => serde_json::to_value(c).unwrap_or(serde_json::json!({})),
        None => {
            serde_json::json!({
                "custom_model_name": "快乐小马智能路由",
                "custom_model_id": "happyhorse-smart",
                "t2v_model": "",
                "i2v_model": "",
                "r2v_model": "",
                "edit_model": "",
                "routing_node": "ephh-happyhorse",
                "is_active": 1,
            })
        }
    };

    #[derive(Debug, Serialize, sqlx::FromRow)]
    struct SimpleModel {
        mid: String,
        name: String,
        model_id: String,
    }
    let available_models: Vec<SimpleModel> = sqlx::query_as(
        &state.db.format_query("SELECT mid, name, model_id FROM models WHERE is_active = 1 ORDER BY name ASC")
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "config": config,
        "available_models": available_models,
    })))
}

/// 兼容老接口：保存最新的路由配置
async fn save_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(req): Json<SaveConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let latest_id: Option<i32> = sqlx::query_scalar(
        &state.db.format_query("SELECT id FROM happyhorse_configs ORDER BY id DESC LIMIT 1")
    )
    .fetch_optional(&state.db.pool)
    .await?;

    if let Some(id) = latest_id {
        sqlx::query(
            &state.db.format_query(
                "UPDATE happyhorse_configs SET custom_model_name = ?, custom_model_id = ?, t2v_model = ?, i2v_model = ?, r2v_model = ?, edit_model = ?, updated_at = (now()::text) \
                 WHERE id = ?"
            )
        )
        .bind(&req.custom_model_name)
        .bind(&req.custom_model_id)
        .bind(&req.t2v_model)
        .bind(&req.i2v_model)
        .bind(&req.r2v_model)
        .bind(&req.edit_model)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    } else {
        sqlx::query(
            &state.db.format_query(
                "INSERT INTO happyhorse_configs (custom_model_name, custom_model_id, t2v_model, i2v_model, r2v_model, edit_model, routing_node, is_active) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
            )
        )
        .bind(&req.custom_model_name)
        .bind(&req.custom_model_id)
        .bind(&req.t2v_model)
        .bind(&req.i2v_model)
        .bind(&req.r2v_model)
        .bind(&req.edit_model)
        .bind(&req.routing_node)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({ "success": true, "message": "配置已成功保存" })))
}

/// 查询路由分发日志
async fn list_logs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<LogsQuery>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    let mut conditions = Vec::new();
    let mut bind_values: Vec<serde_json::Value> = Vec::new();

    if let Some(ref orig) = query.original_model {
        if !orig.trim().is_empty() {
            conditions.push("h.original_model = ?".to_string());
            bind_values.push(json!(orig));
        }
    }
    if let Some(ref mat) = query.matched_model {
        if !mat.trim().is_empty() {
            conditions.push("h.matched_model = ?".to_string());
            bind_values.push(json!(mat));
        }
    }
    if let Some(status) = query.status {
        conditions.push("COALESCE(l.status_code, 200) = ?".to_string());
        bind_values.push(json!(status));
    }
    if let Some(ref uid) = query.user_uid {
        if !uid.trim().is_empty() {
            conditions.push("h.user_uid ILIKE ?".to_string());
            bind_values.push(json!(format!("%{}%", uid.trim())));
        }
    }
    if let Some(ref start) = query.start_date {
        if !start.trim().is_empty() {
            conditions.push("h.created_at >= ?".to_string());
            bind_values.push(json!(start));
        }
    }
    if let Some(ref end) = query.end_date {
        if !end.trim().is_empty() {
            conditions.push("h.created_at <= ?".to_string());
            bind_values.push(json!(end));
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // 统计总数（包含 LEFT JOIN 保证 where 别名存在）
    let count_sql = format!(
        "SELECT COUNT(*) FROM happyhorse_logs h LEFT JOIN logs l ON h.log_id = l.id {}",
        where_clause
    );
    let count_sql_formatted = state.db.format_query(&count_sql);
    let mut count_q = sqlx::query_scalar::<_, i64>(&count_sql_formatted);
    for v in &bind_values {
        if let Some(s) = v.as_str() {
            count_q = count_q.bind(s);
        } else if let Some(i) = v.as_i64() {
            count_q = count_q.bind(i as i32);
        }
    }
    let total: i64 = count_q.fetch_one(&state.db.pool).await.unwrap_or(0);

    // 查询详细日志数据（LEFT JOIN 主日志表获取完整请求/响应/计费信息，LEFT JOIN users 获取昵称）
    let data_sql = format!(
        "SELECT h.id, h.user_uid, h.original_model, h.media_type, h.matched_model, \
         COALESCE(l.status_code, 200) AS status, \
         COALESCE(l.latency_ms, 0) AS latency_ms, \
         l.error_message AS error_message, \
         l.task_id AS task_id, \
         h.log_id, h.created_at, \
         l.request_content AS log_request_content, \
         l.upstream_req_content AS log_upstream_req_content, \
         l.response_content AS log_response_content, \
         l.billing_detail AS log_billing_detail, \
         l.billing_pid AS log_billing_pid, \
         l.forward_eid AS log_forward_eid, \
         u.nickname AS user_nickname \
         FROM happyhorse_logs h LEFT JOIN logs l ON h.log_id = l.id \
         LEFT JOIN users u ON u.uid = h.user_uid \
         {} ORDER BY h.id DESC LIMIT {} OFFSET {}",
        where_clause, page_size, offset
    );
    let data_sql_fmt = state.db.format_query(&data_sql);
    let mut data_q = sqlx::query_as::<_, HappyHorseLog>(&data_sql_fmt);
    for v in &bind_values {
        if let Some(s) = v.as_str() { data_q = data_q.bind(s); }
        else if let Some(i) = v.as_i64() { data_q = data_q.bind(i as i32); }
    }
    let logs: Vec<HappyHorseLog> = match data_q.fetch_all(&state.db.pool).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("[小马] 日志查询失败: {:?}", e);
            vec![]
        }
    };

    Ok(Json(json!({
        "logs": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}

// ── 插件解耦公共接口（供 relay 层调用，移除插件时删除此模块即可） ──────

/// 智能路由拦截结果
#[derive(Debug, Clone)]
pub struct InterceptResult {
    pub actual_model: String,
    pub media_type: String,
    pub routing_node: String,
    pub custom_model_id: String,
}

/// 根据用户原始请求体推断媒体类型并返回对应的实际模型，即获取模型生成场景类型
/// 检测优先级（从最明确到最宽泛）:
///   1.media数组(DashScope) → 2.images/image_urls(含role) → 3.videos/audios →
///   4.可灵原生(image/image_tail/image_list/video_list等) →
///   5.content数组(火山方舟,含role) → 6.腾讯云FileInfos → 7.默认文生
fn match_media_model(
    body: &serde_json::Value,
    t2v: &str, i2v: &str, r2v: &str, edit: &str,
) -> (String, String) {
    // 1. media 数组（DashScope 格式：body.media 或 body.input.media）
    let media = body["media"].as_array()
        .or_else(|| body["input"]["media"].as_array());
    if let Some(arr) = media {
        for item in arr {
            if let Some(t) = item["type"].as_str() {
                match t {
                    "video" => return (edit.to_string(), "视频编辑".to_string()),
                    "reference_image" => return (r2v.to_string(), "参考生视频".to_string()),
                    "first_frame" | "last_frame" => return (i2v.to_string(), "图生视频".to_string()),
                    _ => {}
                }
            }
        }
    }

    // 2. videos / audios 数组
    if let Some(arr) = body["videos"].as_array() {
        if !arr.is_empty() {
            return (edit.to_string(), "视频编辑".to_string());
        }
    }
    if let Some(arr) = body["audios"].as_array() {
        if !arr.is_empty() {
            return (r2v.to_string(), "参考生视频".to_string());
        }
    }

    // 3. images / image_urls 数组（OpenAI 兼容格式，含 role 精确识别）
    //    元素可为纯 URL 字符串或 {url, role} 对象
    //    优先级: role=reference_image → 参考生 > 纯URL数量>2 → 参考生 > 默认图生
    let image_arr = body["images"].as_array()
        .or_else(|| body["image_urls"].as_array());
    if let Some(arr) = image_arr {
        if !arr.is_empty() {
            // 检查是否有带 role 的对象元素（精确模式）
            let has_ref = arr.iter().any(|item|
                item["role"].as_str() == Some("reference_image")
            );
            if has_ref {
                return (r2v.to_string(), "参考生视频".to_string());
            }
            // 纯 URL 字符串超过 2 条视为多图参考场景
            let url_count = arr.iter().filter(|item| item.is_string()).count();
            if url_count > 2 {
                return (r2v.to_string(), "参考生视频".to_string());
            }
            return (i2v.to_string(), "图生视频".to_string());
        }
    }

    // 4. content 数组（火山方舟格式：content[].type + role 精确识别）
    if let Some(arr) = body["content"].as_array() {
        let mut has_image = false;
        let mut has_ref_role = false;
        for item in arr {
            match item["type"].as_str() {
                Some("video_url" | "video") => return (edit.to_string(), "视频编辑".to_string()),
                Some("audio_url") => return (r2v.to_string(), "参考生视频".to_string()),
                Some("image_url" | "image") => {
                    has_image = true;
                    if item["role"].as_str() == Some("reference_image") {
                        has_ref_role = true;
                    }
                }
                _ => {}
            }
        }
        if has_image {
            return if has_ref_role {
                (r2v.to_string(), "参考生视频".to_string())
            } else {
                (i2v.to_string(), "图生视频".to_string())
            };
        }
    }

    // 5. 可灵原生字段（image/image_tail/image_list/video_list/subject_image_list）
    if body.get("video_list").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty())
        || body["video"].is_string() || body["video_url"].is_string()
        || body["input"]["video"].is_string()
    {
        return (edit.to_string(), "视频编辑".to_string());
    }
    if body.get("image_list").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty())
        || body.get("subject_image_list").and_then(|v| v.as_array()).map_or(false, |a| !a.is_empty())
    {
        return (r2v.to_string(), "参考生视频".to_string());
    }
    if body["image"].is_string() || body["image_tail"].is_string()
        || body["input"]["image"].is_string()
    {
        return (i2v.to_string(), "图生视频".to_string());
    }

    // 6. 腾讯云 FileInfos（PascalCase 格式）
    if let Some(arr) = body["FileInfos"].as_array() {
        for item in arr {
            match item["Usage"].as_str().or_else(|| item["Category"].as_str()) {
                Some("Video") => return (edit.to_string(), "视频编辑".to_string()),
                Some("Reference") => return (r2v.to_string(), "参考生视频".to_string()),
                Some("FirstFrame") => return (i2v.to_string(), "图生视频".to_string()),
                _ => {}
            }
        }
    }

    // 7. 默认文生视频
    (t2v.to_string(), "文生视频".to_string())
}

/// 尝试拦截：检查插件启用状态 + 模型匹配 + 媒体类型识别
pub async fn try_intercept(
    pool: &sqlx::PgPool,
    model: &str,
    body: &serde_json::Value,
) -> Option<InterceptResult> {
    let enabled: Option<i64> = sqlx::query_scalar(
        "SELECT is_enabled FROM plugins WHERE name = 'happyhorse_router'"
    ).fetch_optional(pool).await.unwrap_or(None);
    if enabled != Some(1) {
        tracing::info!("[小马] 插件未启用，跳过拦截 model={}", model);
        return None;
    }

    #[derive(sqlx::FromRow)]
    struct Cfg { custom_model_id: String, t2v_model: String, i2v_model: String, r2v_model: String, edit_model: String, routing_node: String }
    let cfg: Option<Cfg> = sqlx::query_as(
        "SELECT custom_model_id, t2v_model, i2v_model, r2v_model, edit_model, routing_node FROM happyhorse_configs WHERE is_active = 1 AND custom_model_id = $1"
    ).bind(model).fetch_optional(pool).await.unwrap_or(None);
    let cfg = match cfg {
        Some(c) => c,
        None => {
            tracing::info!("[小马] 模型未匹配智能路由配置 model={}", model);
            return None;
        }
    };

    // 配置中 t2v/i2v/r2v/edit 存储的是 mid（不可变），需批量反查当前 model_id（单条 SQL）
    #[derive(sqlx::FromRow)]
    struct MidMap { mid: String, model_id: String }
    let rows: Vec<MidMap> = sqlx::query_as(
        "SELECT mid, model_id FROM models WHERE mid IN ($1, $2, $3, $4) AND is_active = 1"
    ).bind(&cfg.t2v_model).bind(&cfg.i2v_model).bind(&cfg.r2v_model).bind(&cfg.edit_model)
     .fetch_all(pool).await.unwrap_or_default();
    // mid → model_id 映射表
    let resolve = |mid: &str| -> String {
        rows.iter().find(|r| r.mid == mid).map(|r| r.model_id.clone()).unwrap_or_else(|| {
            tracing::warn!("[小马] mid={} 未找到活跃模型，回退使用原始值", mid);
            mid.to_string()
        })
    };
    let t2v = resolve(&cfg.t2v_model);
    let i2v = resolve(&cfg.i2v_model);
    let r2v = resolve(&cfg.r2v_model);
    let edit = resolve(&cfg.edit_model);

    let (actual_model, media_type) = match_media_model(body, &t2v, &i2v, &r2v, &edit);
    tracing::info!(
        "[小马] 拦截成功: {} → {} (类型={}, 节点={})",
        cfg.custom_model_id, actual_model, media_type, cfg.routing_node
    );
    Some(InterceptResult { actual_model, media_type, routing_node: cfg.routing_node, custom_model_id: cfg.custom_model_id })
}

/// 记录智能路由分发日志
/// log_id: 关联主日志表 id，通过 JOIN 获取完整请求/响应数据，避免重复存储
pub async fn log_request(
    pool: &sqlx::PgPool, user_id: &str, custom_model_id: &str, media_type: &str,
    matched_model: &str, log_id: Option<i64>,
) {
    tracing::info!(
        "[小马] 写入日志: {} → {} (类型={}, log_id={:?})",
        custom_model_id, matched_model, media_type, log_id
    );
    // 使用子查询将 users.id 转为短标识 uid，无匹配时回落存储原始 user_id
    let res = sqlx::query(
        "INSERT INTO happyhorse_logs (user_uid, original_model, media_type, matched_model, log_id) \
         VALUES (COALESCE((SELECT uid FROM users WHERE id = $1), $1), $2, $3, $4, $5)"
    ).bind(user_id).bind(custom_model_id).bind(media_type).bind(matched_model)
     .bind(log_id)
     .execute(pool).await;
    if let Err(e) = res {
        tracing::error!("[小马] 日志写入失败: {:?}", e);
    }
}

/// 构建插件标记 JSON 字符串（存入 logs.plugin_tag）
pub fn build_plugin_tag(r: &InterceptResult) -> String {
    serde_json::json!({
        "name": "happyhorse",
        "title": "快乐小马",
        "custom_model": r.custom_model_id,
        "actual_model": r.actual_model,
        "media_type": r.media_type
    }).to_string()
}
