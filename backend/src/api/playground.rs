use crate::{
    api::plugins::{get_tos_config, load_plugin_configs_pub},
    auth,
    error::{AppError, AppResult},
    services::tos,
    time_system::DbTs,
    AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use sha2::Digest;
use std::sync::Arc;

/// 素材数量统计时排除创作参考附件（references/ 目录）
const SQL_EXCLUDE_REFERENCE_ASSETS: &str =
    "AND COALESCE(tos_object_key, '') NOT LIKE '%/references/%'";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/init-storage", post(init_storage))
        .route("/projects", get(list_projects).post(create_project))
        .route(
            "/projects/{id}",
            get(get_project).put(update_project).delete(delete_project),
        )
        .route("/projects/{id}/save-canvas", post(save_canvas))
        .route("/assets/persist", post(persist_asset))
        .route("/assets/upload", post(upload_reference))
        .route("/assets/presign", post(presign_upload)) // 获取预签名 PUT URL（前端直传 TOS）
        .route("/assets/confirm", post(confirm_upload)) // 直传成功后登记数据库
        .route("/assets/{id}", delete(delete_asset))
        .route("/storage-stats", get(storage_stats))
        .route("/recover-by-log-id", get(recover_by_log_id))
        .route(
            "/model-configs",
            get(list_model_configs).post(save_model_config),
        )
        .route("/model-configs/{mid}", delete(delete_model_config))
}

// ========== 存储初始化 ==========

/// 用户首次进入体验中心时调用：检查 TOS 配置并创建用户根文件夹 p{uid}/
async fn init_storage(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 1. 检查 TOS 配置是否存在
    let tos_config = get_tos_config(&state, "playground").await.ok_or_else(|| {
        AppError::BadRequest(
            "系统存储未配置，请联系管理员正确配置火山引擎 TOS 对象存储后再使用创作中心。"
                .to_string(),
        )
    })?;

    // 2. 获取用户 UID
    let uid: String =
        sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;

    let user_folder = format!("p{}", uid);

    // 3. 尝试在 TOS 上创建用户根文件夹（通过上传一个 .keep 占位文件）
    let keep_key = tos_config.full_key(&format!("{}/.keep", user_folder));
    let keep_data = b"playground user root folder".to_vec();

    tos::upload_file(&tos_config, &keep_key, keep_data, "text/plain", None)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "创建用户存储目录失败，请确认系统存储配置正确: {}",
                e
            ))
        })?;

    Ok(Json(json!({
        "success": true,
        "user_folder": user_folder,
        "message": "存储初始化成功",
        // 提示运营者：前端直传功能需要在 TOS 控制台配置 Bucket CORS 规则
        "cors_required": true,
        "cors_hint": "若需使用本地文件/图片直传功能（少经服务器中转，节省带宽），请在火山引擎 TOS 控制台 → 对象存储 → Bucket 设置 → CORS 设置中添加以下规则：允许来源(AllowedOrigin)写入本站域名，允许方法(AllowedMethod)选择 PUT、GET、HEAD，允许请求头(AllowedHeader)填写 Content-Type、Content-Length，暴露请求头(ExposeHeader)填写 ETag。"
    })))
}

// ========== 项目 CRUD ==========

/// 获取当前用户的项目列表
async fn list_projects(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let projects: Vec<(
        i64,
        String,
        String,
        String,
        String,
        String,
        i64,
        DbTs,
        DbTs,
        i64,
        i32,
    )> = sqlx::query_as(
        &state.db.format_query(&format!(
            "SELECT id, uid, name, description, cover_url, canvas_data, is_deleted, created_at, updated_at, \
             (SELECT COUNT(*) FROM playground_assets WHERE project_id = playground_projects.id AND is_deleted = 0 \
              {}) as asset_count, \
             is_pinned \
             FROM playground_projects WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC",
            SQL_EXCLUDE_REFERENCE_ASSETS
        )),
    )
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let list: Vec<serde_json::Value> = projects
        .iter()
        .map(|p| {
            json!({
                "id": p.0,
                "uid": p.1,
                "name": p.2,
                "description": p.3,
                "cover_url": p.4,
                "canvas_data": p.5,
                "is_deleted": p.6,
                "created_at": p.7.as_str(),
                "updated_at": p.8.as_str(),
                "asset_count": p.9,
                "is_pinned": p.10,
            })
        })
        .collect();

    Ok(Json(json!({ "projects": list })))
}

/// 创建新项目
#[derive(Deserialize)]
struct CreateProjectRequest {
    name: Option<String>,
    description: Option<String>,
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<CreateProjectRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 获取用户 UID
    let uid: String =
        sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await?;

    // 获取用户在 Playground 体验中心的有效配额限制
    let (_, max_projects, _) = get_user_playground_quotas(&state, &claims.sub).await?;

    // 查询当前项目数
    let current_project_count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM playground_projects WHERE user_id = ? AND is_deleted = 0",
    ))
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    if current_project_count >= max_projects {
        return Err(AppError::BadRequest(format!(
            "已达到最大项目数量限制 ({} 个)，请先删除一些项目后再创建",
            max_projects
        )));
    }

    let name = payload.name.unwrap_or_else(|| "未命名项目".to_string());
    if name.chars().count() > 24 {
        return Err(AppError::BadRequest(
            "项目名称长度不能超过 24 个字".to_string(),
        ));
    }
    let desc = payload.description.unwrap_or_default();

    // 生成 project_id = UID尾部3位 + 5位随机数
    let uid_suffix = if uid.len() >= 3 {
        uid[uid.len() - 3..].to_string()
    } else {
        format!("{:0>3}", uid)
    };

    let mut new_id: i64 = 0;
    for i in 0..50 {
        let ts = chrono::Utc::now().timestamp_micros() as u64;
        // 增加些许伪随机扰动避免同一微秒重复
        let random_part = ((ts + i * 137) % 90000) + 10000;
        let id_str = format!("{}{}", uid_suffix, random_part);
        if let Ok(id_val) = id_str.parse::<i64>() {
            // 查询是否已存在（涵盖了已被软删除的旧项目）
            let exists: i64 = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT COUNT(*) FROM playground_projects WHERE id = ?"),
            )
            .bind(id_val)
            .fetch_one(&state.db.pool)
            .await?;

            if exists == 0 {
                new_id = id_val;
                break;
            }
        }
    }

    if new_id == 0 {
        return Err(AppError::Internal(
            "生成唯一项目ID失败，请稍后重试".to_string(),
        ));
    }

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO playground_projects (id, user_id, uid, name, description) VALUES (?, ?, ?, ?, ?)"
        )
    )
    .bind(new_id)
    .bind(&claims.sub)
    .bind(&uid)
    .bind(&name)
    .bind(&desc)
    .execute(&state.db.pool)
    .await?;

    // 在 TOS 上为该项目创建子文件夹 p{uid}/{project_id}/
    if let Some(tos_config) = get_tos_config(&state, "playground").await {
        let project_folder_key = tos_config.full_key(&format!("p{}/{:08}/.keep", uid, new_id));
        let _ = tos::upload_file(
            &tos_config,
            &project_folder_key,
            b"playground project folder".to_vec(),
            "text/plain",
            None,
        )
        .await;
    }

    Ok(Json(json!({
        "id": new_id,
        "uid": uid,
        "name": name,
        "description": desc,
        "message": "项目创建成功"
    })))
}

/// 获取单个项目详情（含资源列表）
async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let project: (
        i64,
        String,
        String,
        String,
        String,
        String,
        DbTs,
        DbTs,
        i32,
    ) = sqlx::query_as(&state.db.format_query(
        "SELECT id, uid, name, description, cover_url, canvas_data, created_at, updated_at, is_pinned \
             FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0",
    ))
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("项目不存在".to_string()))?;

    // 获取该项目的资源列表
    let assets: Vec<(
        i64,
        String,
        String,
        i64,
        String,
        String,
        String,
        String,
        String,
        String,
        f64,
        i64,
        i64,
        DbTs,
    )> = sqlx::query_as(&state.db.format_query(
        "SELECT id, asset_type, file_name, file_size, file_url, thumbnail_url, prompt, model_id, model_name, \
             canvas_node_data, duration_seconds, width, height, created_at \
             FROM playground_assets WHERE project_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY id DESC",
    ))
    .bind(id)
    .bind(&claims.sub)
    .fetch_all(&state.db.pool)
    .await?;

    let asset_list: Vec<serde_json::Value> = assets
        .iter()
        .map(|a| {
            json!({
                "id": a.0,
                "asset_type": a.1,
                "file_name": a.2,
                "file_size": a.3,
                "file_url": a.4,
                "thumbnail_url": a.5,
                "prompt": a.6,
                "model_id": a.7,
                "model_name": a.8,
                "canvas_node_data": a.9,
                "duration_seconds": a.10,
                "width": a.11,
                "height": a.12,
                "created_at": a.13.as_str(),
            })
        })
        .collect();

    Ok(Json(json!({
        "project": {
            "id": project.0,
            "uid": project.1,
            "name": project.2,
            "description": project.3,
            "cover_url": project.4,
            "canvas_data": project.5,
            "created_at": project.6.as_str(),
            "updated_at": project.7.as_str(),
            "is_pinned": project.8,
        },
        "assets": asset_list,
    })))
}

/// 更新项目
#[derive(Deserialize)]
struct UpdateProjectRequest {
    name: Option<String>,
    description: Option<String>,
    is_pinned: Option<i32>,
}

async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<UpdateProjectRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证归属
    let count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0",
    ))
    .bind(id)
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await?;

    if count == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    if let Some(name) = &payload.name {
        if name.chars().count() > 24 {
            return Err(AppError::BadRequest(
                "项目名称长度不能超过 24 个字".to_string(),
            ));
        }
        sqlx::query(&state.db.format_query(
            "UPDATE playground_projects SET name = ?, updated_at = NOW() WHERE id = ?",
        ))
        .bind(name)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    if let Some(desc) = &payload.description {
        sqlx::query(&state.db.format_query(
            "UPDATE playground_projects SET description = ?, updated_at = NOW() WHERE id = ?",
        ))
        .bind(desc)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    if let Some(is_pinned) = payload.is_pinned {
        sqlx::query(&state.db.format_query(
            "UPDATE playground_projects SET is_pinned = ?, updated_at = NOW() WHERE id = ?",
        ))
        .bind(is_pinned)
        .bind(id)
        .execute(&state.db.pool)
        .await?;
    }

    Ok(Json(json!({ "message": "项目更新成功" })))
}

/// 物理删除项目及关联资源
async fn delete_project(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 1. 物理删除项目
    let result = sqlx::query(
        &state
            .db
            .format_query("DELETE FROM playground_projects WHERE id = ? AND user_id = ?"),
    )
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    // 2. 物理删除项目下的所有资源
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM playground_assets WHERE project_id = ? AND user_id = ?"),
    )
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    // 3. 从 TOS 中清理项目文件夹下的所有文件（后台异步并行执行，不阻塞接口返回）
    if let Some(tos_config) = get_tos_config(&state, "playground").await {
        let uid: String =
            sqlx::query_scalar(&state.db.format_query("SELECT uid FROM users WHERE id = ?"))
                .bind(&claims.sub)
                .fetch_one(&state.db.pool)
                .await?;

        let project_id_copy = id;
        tokio::spawn(async move {
            let folder_prefix = format!("p{}/{:08}/", uid, project_id_copy);
            if let Ok((objects, _)) = tos::list_folder(&tos_config, &folder_prefix).await {
                // 并行删除所有文件
                let futs: Vec<_> = objects
                    .iter()
                    .map(|obj| tos::delete_file(&tos_config, &obj.key))
                    .collect();
                futures::future::join_all(futs).await;
            }
            let folder_key = tos_config.full_key(&format!("p{}/{:08}/.keep", uid, project_id_copy));
            let _ = tos::delete_file(&tos_config, &folder_key).await;
            tracing::info!("[Playground] 项目 {} TOS 文件夹清理完成", project_id_copy);
        });
    }

    Ok(Json(json!({ "message": "项目及资源已永久删除" })))
}

/// 保存画布状态
#[derive(Deserialize)]
struct SaveCanvasRequest {
    canvas_data: String,
}

async fn save_canvas(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SaveCanvasRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        &state.db.format_query("UPDATE playground_projects SET canvas_data = ?, updated_at = NOW() WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(&payload.canvas_data)
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("项目不存在".to_string()));
    }

    Ok(Json(json!({ "message": "画布状态已保存" })))
}

// ========== 资源持久化 ==========

/// 公共辅助：图片/视频资源入库后更新项目封面和修改时间（persist_asset / confirm_upload 共用）
async fn update_project_cover(
    state: &crate::AppState,
    project_id: i64,
    asset_type: &str,
    file_url: &str,
) -> AppResult<()> {
    if asset_type == "image" || asset_type == "video" {
        sqlx::query(&state.db.format_query(
            "UPDATE playground_projects SET cover_url = ?, updated_at = NOW() WHERE id = ?",
        ))
        .bind(file_url)
        .bind(project_id)
        .execute(&state.db.pool)
        .await?;
    }
    Ok(())
}

/// 公共辅助：将创作资源数据入库并更新项目封面（persist_asset / confirm_upload 共用）
async fn db_insert_asset(
    state: &crate::AppState,
    project_id: i64,
    user_id: &str,
    uid: &str,
    asset_type: &str,
    file_name: &str,
    file_size: i64,
    file_url: &str,
    tos_object_key: &str,
    prompt: &str,
    model_id: &str,
    model_name: &str,
    generation_params: Option<&serde_json::Value>,
    canvas_node_data: Option<&serde_json::Value>,
    file_hash: &str,
) -> AppResult<i64> {
    let gen_params_str = generation_params.map(|v| v.to_string()).unwrap_or_default();
    let node_data_str = canvas_node_data.map(|v| v.to_string()).unwrap_or_default();

    let asset_id: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "INSERT INTO playground_assets \
             (project_id, user_id, uid, asset_type, file_name, file_size, file_url, tos_object_key, \
              prompt, model_id, model_name, generation_params, canvas_node_data, file_hash) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
        )
    )
    .bind(project_id)
    .bind(user_id)
    .bind(uid)
    .bind(asset_type)
    .bind(file_name)
    .bind(file_size)
    .bind(file_url)
    .bind(tos_object_key)
    .bind(prompt)
    .bind(model_id)
    .bind(model_name)
    .bind(&gen_params_str)
    .bind(&node_data_str)
    .bind(file_hash)
    .fetch_one(&state.db.pool)
    .await?;

    update_project_cover(state, project_id, asset_type, file_url).await?;
    Ok(asset_id)
}

/// 公共辅助：验证项目归属并返回项目 uid
/// 返回 (project_id, uid)，不存在则返回 NotFound 错误
async fn verify_project_owner(
    state: &crate::AppState,
    project_id: i64,
    user_id: &str,
) -> AppResult<(i64, String)> {
    let project: Option<(i64, String)> = sqlx::query_as(&state.db.format_query(
        "SELECT id, uid FROM playground_projects WHERE id = ? AND user_id = ? AND is_deleted = 0",
    ))
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?;
    project.ok_or_else(|| AppError::NotFound("项目不存在".to_string()))
}

/// 公共辅助：检验用户存储配额
/// 对于 presign 场景，传入 `new_file_size` 进行预校验；不需要项目级素材数量检查时可传 None
async fn check_storage_quota(
    state: &crate::AppState,
    user_id: &str,
    project_id: Option<i64>,
    new_file_size: i64,
    check_asset_count: bool,
) -> AppResult<()> {
    let (quota_mb, _, max_assets) = get_user_playground_quotas(state, user_id).await?;

    if quota_mb == 0 {
        return Err(AppError::BadRequest(
            "您当前的用户等级无权使用创作中心存储功能".to_string(),
        ));
    }

    // 素材数量限制（仅按项目级校验；references/ 参考附件不计入画布素材上限）
    if check_asset_count {
        if let Some(pid) = project_id {
            let asset_count: i64 = sqlx::query_scalar(&state.db.format_query(&format!(
                "SELECT COUNT(*) FROM playground_assets \
                     WHERE project_id = ? AND user_id = ? AND is_deleted = 0 \
                     {}",
                SQL_EXCLUDE_REFERENCE_ASSETS
            )))
            .bind(pid)
            .bind(user_id)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(0);

            if asset_count >= max_assets {
                return Err(AppError::BadRequest(format!(
                    "该项目素材数量已达系统安全上限 ({}个)，请清理无用素材",
                    max_assets
                )));
            }
        }
    }

    // 总存储空间校验
    let total_size: i64 = sqlx::query_scalar(
        &state.db.format_query(
            "SELECT CAST(COALESCE(SUM(file_size), 0) AS BIGINT) FROM playground_assets WHERE user_id = ? AND is_deleted = 0"
        )
    )
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    if total_size + new_file_size > quota_mb * 1024 * 1024 {
        return Err(AppError::BadRequest(
            "您的创作中心存储空间配额已不足，请先清理部分历史素材或项目".to_string(),
        ));
    }

    Ok(())
}

#[derive(Deserialize)]
struct PersistAssetRequest {
    project_id: i64,
    asset_type: String,          // image | video | text
    source_url: Option<String>,  // 远程 URL（图片/视频的结果 URL）
    base64_data: Option<String>, // Base64 数据（部分模型直接返回 base64）
    prompt: Option<String>,
    model_id: Option<String>,
    model_name: Option<String>,
    generation_params: Option<serde_json::Value>,
    canvas_node_data: Option<serde_json::Value>,
}

/// 核心接口：持久化生成的资源到 TOS
/// - source_url 场景：后端下载远程文件再上传 TOS（远程 URL 存在跨域/权限限制，前端无法直接下载）
/// - base64_data 场景：作为回退路径保留，前端直传失败时仍可调用此接口
async fn persist_asset(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<PersistAssetRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证项目归属（复用公共辅助函数）
    let (project_id, uid) = verify_project_owner(&state, payload.project_id, &claims.sub).await?;

    // 获取 Playground 的 TOS 配置
    let tos_config = get_tos_config(&state, "playground")
        .await
        .ok_or_else(|| AppError::BadRequest("Playground 存储未配置，请联系管理员".to_string()))?;

    // 获取文件数据
    let (file_data, file_ext) = if let Some(ref b64) = payload.base64_data {
        // Base64 数据（回退路径：前端直传失败时使用）
        let data = base64_decode(b64)
            .map_err(|e| AppError::BadRequest(format!("Base64 解码失败: {}", e)))?;
        let ext = if payload.asset_type == "video" {
            "mp4"
        } else {
            "png"
        };
        (data, ext.to_string())
    } else if let Some(ref url) = payload.source_url {
        // 从远程 URL 下载（source_url 场景保留后端中转：远程 URL 跨域+权限限制，前端无法直接访问）
        let data = download_remote_file(&state.http_client, url)
            .await
            .map_err(|e| AppError::BadRequest(format!("下载远程文件失败: {}", e)))?;
        let ext = guess_extension(url, &payload.asset_type);
        (data, ext)
    } else {
        return Err(AppError::BadRequest(
            "必须提供 source_url 或 base64_data".to_string(),
        ));
    };

    let file_size = file_data.len() as i64;

    // 配额校验（复用公共辅助函数）
    check_storage_quota(&state, &claims.sub, Some(project_id), file_size, true).await?;

    // 计算文件内容哈希（用于去重和文件命名）
    let file_hash = format!("{:x}", sha2::Sha256::digest(&file_data));
    let hash_short = &file_hash[..8];

    // 幂等防重：基于文件内容哈希去重（相同文件内容才视为重复）
    // 防止网络重试、断线恢复等场景产生重复记录，同时允许相同 prompt 的不同生成结果正常保存
    let existing: Option<(i64, String, i64)> = sqlx::query_as(&state.db.format_query(
        "SELECT id, file_url, file_size FROM playground_assets \
             WHERE project_id = ? AND user_id = ? AND file_hash = ? AND is_deleted = 0 \
             LIMIT 1",
    ))
    .bind(project_id)
    .bind(&claims.sub)
    .bind(&file_hash)
    .fetch_optional(&state.db.pool)
    .await?;

    if let Some((existing_id, existing_url, existing_size)) = existing {
        return Ok(Json(json!({
            "id": existing_id,
            "file_url": existing_url,
            "file_size": existing_size,
            "deduplicated": true,
        })));
    }

    let prompt_str = payload.prompt.as_deref().unwrap_or("");
    let model_id_str = payload.model_id.as_deref().unwrap_or("");

    // 生成 TOS object key
    let timestamp = chrono::Utc::now().timestamp();
    let type_folder = match payload.asset_type.as_str() {
        "video" => "videos",
        "image" => "images",
        "audio" => "audio",
        _ => "files", // 与 presign_upload 保持一致
    };
    let file_name = format!("{}_{}.{}", timestamp, hash_short, file_ext);
    // 使用 p{uid}/{project_id}/{type_folder}/ 目录结构
    let relative_path = format!("p{}/{:08}/{}/{}", uid, project_id, type_folder, file_name);
    let object_key = tos_config.full_key(&relative_path);

    // 上传到 TOS
    let content_type = match payload.asset_type.as_str() {
        "video" => "video/mp4",
        "image" => {
            if file_ext == "png" {
                "image/png"
            } else {
                "image/jpeg"
            }
        }
        "audio" => "audio/mpeg",
        _ => "application/json",
    };

    let file_url = tos::upload_file(&tos_config, &object_key, file_data, content_type, None)
        .await
        .map_err(|e| AppError::Internal(format!("TOS 上传失败: {}", e)))?;

    // 写入数据库
    let asset_id = db_insert_asset(
        &state,
        project_id,
        &claims.sub,
        &uid,
        &payload.asset_type,
        &file_name,
        file_size,
        &file_url,
        &object_key,
        prompt_str,
        model_id_str,
        payload.model_name.as_deref().unwrap_or(""),
        payload.generation_params.as_ref(),
        payload.canvas_node_data.as_ref(),
        &file_hash,
    )
    .await?;

    Ok(Json(json!({
        "id": asset_id,
        "file_url": file_url,
        "tos_object_key": object_key,
        "file_name": file_name,
        "file_size": file_size,
    })))
}

// ========== 前端直传 TOS 预签名 URL ==========

#[derive(Deserialize)]
struct PresignUploadRequest {
    project_id: i64,
    asset_type: String, // image | video | audio
    file_ext: String,   // png | jpg | mp4 | mp3 等
    file_size: i64,     // 文件大小（字节），用于预校验配额
}

/// 获取预签名 PUT URL，供前端直接上传文件到 TOS，减少服务器带宽消耗
/// 安全防护：
///   - 有效期仅 300 秒（5 分钟），减少 URL 泄露窗口
///   - Object Key 包含用户 uid/project_id，泄露后也只能写入当前用户目录
///   - 配额预校验，超额无法获取预签名 URL
///   - 签名仅涵盖 host header，前端 PUT 时携带任意 Content-Type 均可正常上传
async fn presign_upload(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<PresignUploadRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 验证项目归属（复用公共辅助函数）
    let (project_id, uid) = verify_project_owner(&state, payload.project_id, &claims.sub).await?;

    // 配额预校验（复用公共辅助函数，含素材数量校验）
    check_storage_quota(
        &state,
        &claims.sub,
        Some(project_id),
        payload.file_size,
        true,
    )
    .await?;

    // 获取 TOS 配置
    let tos_config = get_tos_config(&state, "playground")
        .await
        .ok_or_else(|| AppError::BadRequest("Playground 存储未配置，请联系管理员".to_string()))?;

    // 生成唯一 Object Key：p{uid}/{project_id}/{type_folder}/{timestamp}_{nonce}.{ext}
    let now = chrono::Utc::now();
    let timestamp = now.timestamp();
    let nonce = (now.timestamp_subsec_nanos()) as u32;
    let type_folder = match payload.asset_type.as_str() {
        "video" => "videos",
        "image" => "images",
        "audio" => "audio",
        _ => "files",
    };
    let file_ext = payload.file_ext.trim_start_matches('.').to_lowercase();
    if file_ext.contains('/') || file_ext.contains('\\') || file_ext.contains("..") {
        return Err(AppError::BadRequest("非法的 file_ext 格式".to_string()));
    }
    let file_name = format!("{}_{:08x}.{}", timestamp, nonce, file_ext);
    let relative_path = format!("p{}/{:08}/{}/{}", uid, project_id, type_folder, file_name);
    let object_key = tos_config.full_key(&relative_path);

    // 构造前端可访问的文件 URL（通过 object_key 生成，与 upload_file 返回的 URL 一致）
    let file_url = tos_config.file_url(&object_key);

    let upload_url = tos::generate_presigned_put_url(&tos_config, &object_key, 300);

    Ok(Json(json!({
        "upload_url": upload_url,   // 前端直接 PUT 到此 URL 上传文件
        "object_key": object_key,   // confirm 时原样传回用于校验归属
        "file_url": file_url,       // TOS 文件访问地址（上传成功后有效）
        "file_name": file_name,
        "expires_in": 300,          // 预签名 URL 有效期（秒）
    })))
}

#[derive(Deserialize)]
struct ConfirmUploadRequest {
    project_id: i64,
    object_key: String, // presign 返回的 object_key，用于校验归属
    file_url: String,
    file_name: String,
    file_size: i64,
    asset_type: String,
    file_hash: Option<String>, // 文件内容 SHA-256 哈希（可选，用于幂等防重）
    prompt: Option<String>,
    model_id: Option<String>,
    model_name: Option<String>,
    generation_params: Option<serde_json::Value>,
    canvas_node_data: Option<serde_json::Value>,
}

/// 前端直传 TOS 成功后，回调此接口登记资源元数据到数据库
/// 安全校验：
///   - object_key 路径必须包含当前用户的 uid，防止越权写入他人目录
///   - 配额再次校验（防止并发绕过）
///   - 基于 file_hash 的幂等防重
async fn confirm_upload(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<ConfirmUploadRequest>,
) -> AppResult<Json<serde_json::Value>> {
    // 防路径穿越漏洞：校验 object_key 不能带有目录穿越字符
    if payload.object_key.contains("..") || payload.object_key.contains('\\') {
        return Err(AppError::BadRequest("非法的 object_key 格式".to_string()));
    }

    // 验证项目归属（复用公共辅助函数）
    let (project_id, uid) = verify_project_owner(&state, payload.project_id, &claims.sub).await?;

    // 安全校验：object_key 必须包含当前用户 uid，防止前端伪造他人路径
    let expected_prefix = format!("p{}/", uid);
    // 获取 TOS 路径前缀以便去除后再校验
    let tos_config = get_tos_config(&state, "playground")
        .await
        .ok_or_else(|| AppError::BadRequest("Playground 存储未配置，请联系管理员".to_string()))?;
    let key_without_prefix = if !tos_config.path_prefix.is_empty() {
        let prefix = tos_config.path_prefix.trim_end_matches('/');
        payload
            .object_key
            .strip_prefix(&format!("{}/", prefix))
            .unwrap_or(&payload.object_key)
    } else {
        &payload.object_key
    };
    if !key_without_prefix.starts_with(&expected_prefix) {
        return Err(AppError::BadRequest(
            "object_key 归属校验失败，操作被拒绝".to_string(),
        ));
    }

    // 配额再次校验（防止并发场景绕过 presign 阶段 的 预校验）
    // 注意：此处不检查素材数量限制（check_asset_count=false）
    // 原因：文件已完成上传到 TOS，若因数量限制拒绝登记，将产生孤儿文件（已占用用户配额却无法管理）
    if let Err(e) = check_storage_quota(
        &state,
        &claims.sub,
        Some(project_id),
        payload.file_size,
        false,
    )
    .await
    {
        // 由于空间配额超限被拒，将已成功直传到 TOS 桶的物理文件进行删除，防垃圾孤儿文件堆积
        let _ = tos::delete_file(&tos_config, &payload.object_key).await;
        return Err(e);
    }

    // 幂等防重1：基于 tos_object_key（防止 confirm 接口因网络抖动等原因被前端重复调用而产生死链或垃圾记录）
    if !payload.object_key.is_empty() {
        let existing: Option<(i64, String, i64)> = sqlx::query_as(&state.db.format_query(
            "SELECT id, file_url, file_size FROM playground_assets \
                 WHERE project_id = ? AND user_id = ? AND tos_object_key = ? AND is_deleted = 0 \
                 LIMIT 1",
        ))
        .bind(project_id)
        .bind(&claims.sub)
        .bind(&payload.object_key)
        .fetch_optional(&state.db.pool)
        .await?;

        if let Some((existing_id, existing_url, existing_size)) = existing {
            return Ok(Json(json!({
                "id": existing_id,
                "file_url": existing_url,
                "file_size": existing_size,
                "deduplicated": true,
            })));
        }
    }

    // 幂等防重2：基于 file_hash（若前端提供相同文件内容哈希，进行秒传去重）
    if let Some(ref hash) = payload.file_hash {
        if !hash.is_empty() {
            let existing: Option<(i64, String, i64)> = sqlx::query_as(&state.db.format_query(
                "SELECT id, file_url, file_size FROM playground_assets \
                     WHERE project_id = ? AND user_id = ? AND file_hash = ? AND is_deleted = 0 \
                     LIMIT 1",
            ))
            .bind(project_id)
            .bind(&claims.sub)
            .bind(hash)
            .fetch_optional(&state.db.pool)
            .await?;

            if let Some((existing_id, existing_url, existing_size)) = existing {
                return Ok(Json(json!({
                    "id": existing_id,
                    "file_url": existing_url,
                    "file_size": existing_size,
                    "deduplicated": true,
                })));
            }
        }
    }

    // 写入数据库
    let asset_id = db_insert_asset(
        &state,
        project_id,
        &claims.sub,
        &uid,
        &payload.asset_type,
        &payload.file_name,
        payload.file_size,
        &payload.file_url,
        &payload.object_key,
        payload.prompt.as_deref().unwrap_or(""),
        payload.model_id.as_deref().unwrap_or(""),
        payload.model_name.as_deref().unwrap_or(""),
        payload.generation_params.as_ref(),
        payload.canvas_node_data.as_ref(),
        payload.file_hash.as_deref().unwrap_or(""),
    )
    .await?;

    Ok(Json(json!({
        "id": asset_id,
        "file_url": payload.file_url,
        "file_name": payload.file_name,
        "file_size": payload.file_size,
    })))
}

/// 删除单个资源（物理删除 DB 记录 + TOS 文件）
async fn delete_asset(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    // 查询资源信息
    let asset: Option<(i64, String)> = sqlx::query_as(
        &state.db.format_query("SELECT id, tos_object_key FROM playground_assets WHERE id = ? AND user_id = ? AND is_deleted = 0")
    )
    .bind(id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let (_asset_id, tos_key) = asset.ok_or_else(|| AppError::NotFound("资源不存在".to_string()))?;

    // 物理删除 DB 记录（TOS 文件也是真删，保持一致）
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM playground_assets WHERE id = ? AND user_id = ?"),
    )
    .bind(id)
    .bind(&claims.sub)
    .execute(&state.db.pool)
    .await?;

    // 尝试从 TOS 删除（失败不影响返回）
    if !tos_key.is_empty() {
        if let Some(tos_config) = get_tos_config(&state, "playground").await {
            let _ = tos::delete_file(&tos_config, &tos_key).await;
        }
    }

    Ok(Json(json!({ "message": "资源已删除" })))
}

/// 获取用户存储用量统计
async fn storage_stats(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let (total_size, total_count): (i64, i64) = sqlx::query_as(&state.db.format_query(
        "SELECT CAST(COALESCE(SUM(file_size), 0) AS BIGINT), COUNT(*) \
             FROM playground_assets WHERE user_id = ? AND is_deleted = 0",
    ))
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or((0, 0));

    let project_count: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COUNT(*) FROM playground_projects WHERE user_id = ? AND is_deleted = 0",
    ))
    .bind(&claims.sub)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    // 获取用户在 Playground 体验中心的有效配额限制
    let (quota_mb, max_projects, max_assets) =
        get_user_playground_quotas(&state, &claims.sub).await?;

    Ok(Json(json!({
        "total_size_bytes": total_size,
        "total_size_mb": (total_size as f64) / 1024.0 / 1024.0,
        "total_count": total_count,
        "project_count": project_count,
        "quota_mb": quota_mb,
        "max_projects": max_projects,
        "max_assets": max_assets,
        "usage_percent": if quota_mb > 0 {
            ((total_size as f64) / (quota_mb as f64 * 1024.0 * 1024.0) * 100.0).min(100.0)
        } else {
            0.0
        },
    })))
}

// ========== 辅助函数 ==========

/// 获取用户在 Playground 体验中心的有效配额限制 (存储空间配额MB, 项目上限, 素材上限)
async fn get_user_playground_quotas(state: &AppState, user_id: &str) -> AppResult<(i64, i64, i64)> {
    // 1. 查询 Playground 插件的开放等级设置 (allowed_levels)
    let allowed_levels: String = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT allowed_levels FROM plugins WHERE name = ?"),
    )
    .bind("playground")
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or_else(|_| "all".to_string());

    // 2. 查询用户等级 ID
    let user_level_id: i64 = sqlx::query_scalar(&state.db.format_query(
        "SELECT COALESCE(ul.id, 0) FROM users u LEFT JOIN user_levels ul ON u.user_group = ul.group_key WHERE u.id = ?"
    ))
    .bind(user_id)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(1);

    // 3. 加载插件配置数据
    let configs = load_plugin_configs_pub(state, "playground")
        .await
        .unwrap_or_default();

    // 4. 解析全局默认值 (Fallback 降级底层值)
    let default_quota: i64 = configs
        .get("default_quota")
        .and_then(|v| v.parse().ok())
        .unwrap_or(100);
    let default_max_projects: i64 = configs
        .get("default_max_projects")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let default_max_assets: i64 = configs
        .get("default_max_assets")
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    // 5. 根据 allowed_levels 判断是否应用等级覆写值
    let (quota_mb, max_projects, max_assets) = if allowed_levels == "all" {
        // 对所有等级开放：强制应用全局默认配额
        (default_quota, default_max_projects, default_max_assets)
    } else {
        // 按等级单独设置：需要检查用户等级是否在被选中的等级列表中
        let allowed_list: Vec<&str> = allowed_levels.split(',').collect();
        let level_id_str = user_level_id.to_string();
        if allowed_list.contains(&level_id_str.as_str()) {
            // 用户等级在选中列表中，尝试取等级覆写值，取不到则回退到全局默认
            let quota = configs
                .get(&format!("quota_{}", user_level_id))
                .and_then(|v| v.parse().ok())
                .unwrap_or(default_quota);
            let max_p = configs
                .get(&format!("max_projects_{}", user_level_id))
                .and_then(|v| v.parse().ok())
                .unwrap_or(default_max_projects);
            let max_a = configs
                .get(&format!("max_assets_{}", user_level_id))
                .and_then(|v| v.parse().ok())
                .unwrap_or(default_max_assets);
            (quota, max_p, max_a)
        } else {
            // 未选中的等级直接不生效（无配额，保证安全隔离）
            (0, 0, 0)
        }
    };

    Ok((quota_mb, max_projects, max_assets))
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let data = crate::relay::forward::b64_data(input);
    base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| format!("Base64 解码失败: {}", e))
}

async fn download_remote_file(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    // 拦截内网及非安全网段的 URL 下载，防御 SSRF 漏洞
    if !crate::relay::forward::is_safe_url_async(url).await {
        return Err("拦截了不安全的网络地址下载".to_string());
    }

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取数据失败: {}", e))?;
    Ok(bytes.to_vec())
}

fn guess_extension(url: &str, asset_type: &str) -> String {
    // 尝试从 URL 推断扩展名
    let path = url.split('?').next().unwrap_or(url);
    if let Some(ext) = path.rsplit('.').next() {
        let ext_lower = ext.to_lowercase();
        if [
            "png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "mp3", "wav",
        ]
        .contains(&ext_lower.as_str())
        {
            return ext_lower;
        }
    }
    // 按类型回退
    match asset_type {
        "video" => "mp4".to_string(),
        "image" => "png".to_string(),
        "audio" => "mp3".to_string(),
        _ => "json".to_string(),
    }
}

async fn upload_reference(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    mut multipart: axum::extract::Multipart,
) -> AppResult<Json<serde_json::Value>> {
    let tos_config = get_tos_config(&state, "playground")
        .await
        .ok_or_else(|| AppError::BadRequest("Playground 存储未配置".to_string()))?;

    // 先解析 multipart 字段，再根据 project_id 做归属校验
    let mut file_data: Option<axum::body::Bytes> = None;
    let mut original_name = String::new();
    let mut content_type = String::new();
    let mut project_id: Option<i64> = None;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            original_name = field.file_name().unwrap_or("unknown").to_string();
            content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();
            file_data = Some(
                field
                    .bytes()
                    .await
                    .map_err(|_| AppError::BadRequest("读取文件失败".to_string()))?,
            );
        } else if name == "project_id" {
            project_id = field.text().await.ok().and_then(|v| v.parse().ok());
        }
    }

    let pid =
        project_id.ok_or_else(|| AppError::BadRequest("必须指定有效的 project_id".to_string()))?;

    // 验证项目归属并获取 uid
    let (_, uid) = verify_project_owner(&state, pid, &claims.sub).await?;

    let data = file_data.ok_or_else(|| AppError::BadRequest("未提供文件".to_string()))?;
    let file_size = data.len() as i64;

    // 配额校验（复用公共辅助函数，不含素材数量限制，参考图不强制计数，但关联项目空间校验）
    check_storage_quota(&state, &claims.sub, Some(pid), file_size, false).await?;

    let ext = std::path::Path::new(&original_name)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("bin");

    let timestamp = chrono::Utc::now().timestamp();
    let hash = &format!("{:x}", sha2::Sha256::digest(&data))[..8];

    let pid_str = format!("{:08}", pid);

    // 存放在 p{uid}/{project_id}/references/ 目录下
    let relative_path = format!(
        "p{}/{}/references/{}_{}.{}",
        uid, pid_str, timestamp, hash, ext
    );
    let object_key = tos_config.full_key(&relative_path);

    let file_url = tos::upload_file(&tos_config, &object_key, data.to_vec(), &content_type, None)
        .await
        .map_err(|e| AppError::Internal(format!("TOS 上传失败: {}", e)))?;

    // 自动将上传的参考素材入库记录，计入用户的创作中心存储容量统计中
    // 数据库字段备注说明：
    // - project_id: 关联的创作项目ID，用于按项目归类
    // - user_id: 上传文件的用户账号ID
    // - uid: 用户的 8 位系统识别UID
    // - asset_type: 资源媒体类型 (图片为 image，视频为 video，音频为 audio)
    // - file_name: 原始上传的素材文件名
    // - file_size: 文件的字节大小 (BIGINT)
    // - file_url: TOS 上传成功后的公网永久访问URL
    // - tos_object_key: 桶内的 Object Key 物理存储路径，用于之后物理清理
    let asset_type = if content_type.starts_with("video/") {
        "video"
    } else if content_type.starts_with("audio/") {
        "audio"
    } else {
        "image"
    };

    sqlx::query(
        &state.db.format_query(
            "INSERT INTO playground_assets (project_id, user_id, uid, asset_type, file_name, file_size, file_url, tos_object_key, is_deleted, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())"
        )
    )
    .bind(pid)
    .bind(&claims.sub)
    .bind(&uid)
    .bind(asset_type)
    .bind(&original_name)
    .bind(file_size)
    .bind(&file_url)
    .bind(&object_key)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "url": file_url,
        "object_key": object_key,
        "original_name": original_name,
    })))
}

/// 后台定时任务：自动恢复创作中心被中断的画布节点
/// 扫描 canvas_data 中 loading 状态的节点，从恢复缓存或日志获取结果，
/// 上传 TOS 持久化，更新 canvas_data。节点数据格式与前端 saveCanvasState 一致。
pub async fn cleanup_stale_playground_nodes(state: &crate::AppState) {
    // 查询包含 loading 节点的项目
    let projects: Vec<(i64, String, String, String)> = match sqlx::query_as(
        "SELECT id, user_id, uid, canvas_data FROM playground_projects \
         WHERE canvas_data LIKE '%\"status\":\"loading\"%' AND is_deleted = 0",
    )
    .fetch_all(&state.db.pool)
    .await
    {
        Ok(rows) => rows,
        Err(_) => return,
    };

    if projects.is_empty() {
        return;
    }

    let tos_config = match get_tos_config(state, "playground").await {
        Some(c) => c,
        None => return, // TOS 未配置则跳过
    };

    for (project_id, user_id, uid, canvas_data_str) in &projects {
        let mut canvas: serde_json::Value = match serde_json::from_str(canvas_data_str) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let nodes = match canvas.get_mut("nodes").and_then(|n| n.as_array_mut()) {
            Some(n) => n,
            None => continue,
        };

        let mut updated = false;

        for node in nodes.iter_mut() {
            if node.get("status").and_then(|s| s.as_str()) != Some("loading") {
                continue;
            }

            let task_data = match node.get("taskData") {
                Some(td) => td.clone(),
                None => continue,
            };

            // 有 task_id 的异步节点：通过 task_id 查日志判断是否已完成
            let task_id_str = task_data
                .get("task_id")
                .and_then(|t| t.as_str())
                .unwrap_or("");

            let created_at = match task_data.get("created_at").and_then(|c| c.as_str()) {
                Some(c) => c,
                None => continue,
            };
            let model_id = match task_data.get("model_id").and_then(|m| m.as_str()) {
                Some(m) => m,
                None => continue,
            };

            // 画布 JSON 时间按 timesystem UTC 解析（兼容 RFC3339 / 朴素字符串）
            let created_utc = match crate::time_system::db_ts::parse_flexible_ts(created_at) {
                Some(dt) => dt,
                None => {
                    tracing::warn!(
                        "[PlaygroundCleanup] 无法解析 created_at={}，跳过节点超时判定",
                        created_at
                    );
                    continue;
                }
            };
            let created_db = DbTs::from_utc(created_utc);
            let elapsed = chrono::Utc::now() - created_utc;
            if elapsed.num_seconds() < 120 {
                continue;
            }

            // 超时判断：有 task_id 的异步任务（视频等）允许更长时间，无 task_id 的同步任务 30 分钟超时
            let timeout_secs = if !task_id_str.is_empty() {
                2 * 3600
            } else {
                30 * 60
            };
            if elapsed.num_seconds() > timeout_secs {
                // 先查日志确认是否真的无结果
                let has_log: bool = if !task_id_str.is_empty() {
                    sqlx::query_scalar(
                            &state.db.format_query(
                                "SELECT EXISTS(SELECT 1 FROM logs WHERE task_id = ? AND user_id = ? AND status_code > 0)"
                            )
                        )
                    .bind(task_id_str)
                    .bind(user_id)
                    .fetch_one(&state.db.pool)
                    .await
                    .unwrap_or(false)
                } else {
                    sqlx::query_scalar(&state.db.format_query(
                        "SELECT EXISTS(SELECT 1 FROM logs \
                                 WHERE user_id = ? AND model = ? AND status_code > 0 \
                                 AND created_at >= ?::timestamptz)",
                    ))
                    .bind(user_id)
                    .bind(model_id)
                    .bind(&created_db)
                    .fetch_one(&state.db.pool)
                    .await
                    .unwrap_or(false)
                };

                if !has_log {
                    node["status"] = json!("error");
                    node["resultData"] = json!({"message": "生成任务超时，请重新生成"});
                    updated = true;
                    continue;
                }
            }

            // 查询对应日志：有 task_id 时精确匹配，无 task_id 时按 model+created_at 模糊匹配
            let log: Option<(i64, i32, Option<String>, Option<String>, Option<String>)> =
                if !task_id_str.is_empty() {
                    // 异步任务：通过 task_id 精确查询日志
                    sqlx::query_as(&state.db.format_query(
                        "SELECT id, status_code, response_content, endpoint, action_type \
                         FROM logs WHERE task_id = ? AND user_id = ? \
                         ORDER BY created_at DESC LIMIT 1",
                    ))
                    .bind(task_id_str)
                    .bind(user_id)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None)
                } else {
                    // 同步任务：按 model + created_at 时间窗口匹配
                    let created_after = DbTs::from_utc(created_utc - chrono::Duration::seconds(10));
                    sqlx::query_as(&state.db.format_query(
                        "SELECT id, status_code, response_content, endpoint, action_type \
                         FROM logs \
                         WHERE user_id = ? AND model = ? AND created_at >= ?::timestamptz \
                         ORDER BY created_at ASC LIMIT 1",
                    ))
                    .bind(user_id)
                    .bind(model_id)
                    .bind(&created_after)
                    .fetch_optional(&state.db.pool)
                    .await
                    .unwrap_or(None)
                };

            let Some((_log_id, status_code, response_content, db_endpoint, action_type)) = log
            else {
                continue; // 日志不存在，可能仍在处理
            };

            if status_code == 0 {
                continue;
            } // 仍在处理中

            if status_code >= 400 {
                node["status"] = json!("error");
                node["resultData"] = json!({"message": "生成失败"});
                updated = true;
                continue;
            }

            // 从日志获取响应内容（渠道 TOS 存储开启后日志中已是 TOS URL）
            let raw = response_content.unwrap_or_default();
            if raw.is_empty() {
                continue;
            }

            let is_video = action_type.as_deref() == Some("视频")
                || action_type.as_deref() == Some("视频增强");
            let category = if is_video { "视频" } else { "图片" };
            let raw_path = db_endpoint
                .as_deref()
                .and_then(|e| e.split('|').next())
                .unwrap_or("/v1/images/generations");
            let formatted = crate::relay::response_formatter::apply_format(
                &state.db.pool,
                raw_path,
                category,
                &raw,
                false,
                None,
            )
            .await;
            let result: serde_json::Value = match serde_json::from_str(&formatted) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // 提取图片 URL 或 base64
            let (source_url, b64_data) =
                if let Some(arr) = result.get("data").and_then(|d| d.as_array()) {
                    let first = arr.first();
                    let url = first
                        .and_then(|i| i.get("url"))
                        .and_then(|u| u.as_str())
                        .unwrap_or("");
                    let b64 = first
                        .and_then(|i| i.get("b64_json"))
                        .and_then(|b| b.as_str())
                        .unwrap_or("");
                    (url.to_string(), b64.to_string())
                } else {
                    continue; // 无有效数据
                };

            if source_url.is_empty() && b64_data.is_empty() {
                continue;
            }

            // 检查是否已持久化（幂等）
            let prompt = task_data
                .get("prompt")
                .and_then(|p| p.as_str())
                .unwrap_or("");
            let already_exists: bool = sqlx::query_scalar(
                &state.db.format_query(
                    "SELECT COUNT(*) > 0 FROM playground_assets \
                     WHERE project_id = ? AND user_id = ? AND model_id = ? AND prompt = ? AND is_deleted = 0"
                )
            )
            .bind(project_id)
            .bind(user_id)
            .bind(model_id)
            .bind(prompt)
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(false);

            if already_exists {
                // 已有记录，直接从 assets 获取 TOS URL 更新节点
                let asset_url: Option<String> = sqlx::query_scalar(
                    &state.db.format_query(
                        "SELECT file_url FROM playground_assets \
                         WHERE project_id = ? AND user_id = ? AND model_id = ? AND prompt = ? AND is_deleted = 0 \
                         ORDER BY created_at DESC LIMIT 1"
                    )
                )
                .bind(project_id)
                .bind(user_id)
                .bind(model_id)
                .bind(prompt)
                .fetch_optional(&state.db.pool)
                .await
                .unwrap_or(None);

                if let Some(url) = asset_url {
                    node["status"] = json!("completed");
                    node["resultData"] = json!({"data": [{"url": url}]});
                    updated = true;
                }
                continue;
            }

            // 获取文件数据并上传 TOS
            let (file_data, file_ext) = if !b64_data.is_empty() {
                match base64_decode(&b64_data) {
                    Ok(data) => (data, "png".to_string()),
                    Err(_) => continue,
                }
            } else if source_url.starts_with("http") {
                match download_remote_file(&state.http_client, &source_url).await {
                    Ok(data) => {
                        let ext =
                            guess_extension(&source_url, if is_video { "video" } else { "image" });
                        (data, ext)
                    }
                    Err(e) => {
                        tracing::warn!("[PlaygroundRecovery] 下载媒体文件失败: {}", e);
                        // URL 可访问但下载失败，直接使用源 URL 更新节点
                        node["status"] = json!("completed");
                        if is_video {
                            node["resultData"] = json!({"content": {"video_url": source_url}});
                        } else {
                            node["resultData"] = json!({"data": [{"url": source_url}]});
                        }
                        updated = true;
                        continue;
                    }
                }
            } else {
                continue;
            };

            let file_size = file_data.len() as i64;
            let timestamp = chrono::Utc::now().timestamp();
            let hash = &format!("{:x}", sha2::Sha256::digest(&file_data))[..8];
            let file_name = format!("{}_{}.{}", timestamp, hash, file_ext);
            let relative_path = if is_video {
                format!("p{}/{:08}/videos/{}", uid, project_id, file_name)
            } else {
                format!("p{}/{:08}/images/{}", uid, project_id, file_name)
            };
            let object_key = tos_config.full_key(&relative_path);

            let content_type = if is_video {
                "video/mp4"
            } else if file_ext == "png" {
                "image/png"
            } else {
                "image/jpeg"
            };
            let file_url =
                match tos::upload_file(&tos_config, &object_key, file_data, content_type, None)
                    .await
                {
                    Ok(url) => url,
                    Err(e) => {
                        tracing::warn!("[PlaygroundRecovery] TOS 上传失败: {}", e);
                        continue;
                    }
                };

            // 创建 playground_assets 记录
            let model_name = task_data
                .get("model_name")
                .and_then(|m| m.as_str())
                .unwrap_or("");
            let node_data_str = serde_json::to_string(
                &json!({"x": node.get("x"), "y": node.get("y"), "width": node.get("width"), "height": node.get("height")})
            ).unwrap_or_else(|_| "{}".to_string());

            let _ = sqlx::query(
                &state.db.format_query(
                    "INSERT INTO playground_assets \
                     (project_id, user_id, uid, asset_type, file_name, file_size, file_url, tos_object_key, \
                      prompt, model_id, model_name, generation_params, canvas_node_data) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)"
                )
            )
            .bind(project_id)
            .bind(user_id)
            .bind(uid)
            .bind(if is_video { "video" } else { "image" })
            .bind(&file_name)
            .bind(file_size)
            .bind(&file_url)
            .bind(&object_key)
            .bind(prompt)
            .bind(model_id)
            .bind(model_name)
            .bind(&node_data_str)
            .execute(&state.db.pool)
            .await;

            // 更新项目封面
            let _ = update_project_cover(
                &state,
                *project_id,
                if is_video { "video" } else { "image" },
                &file_url,
            )
            .await;

            // 更新节点状态（格式与前端 saveCanvasState 一致）
            node["status"] = json!("completed");
            if is_video {
                node["resultData"] = json!({"content": {"video_url": file_url}});
            } else {
                node["resultData"] = json!({"data": [{"url": file_url}]});
            }
            updated = true;

            tracing::info!(
                "[PlaygroundRecovery] 自动恢复节点: project={}, model={}",
                project_id,
                model_id
            );
        }

        if updated {
            let new_canvas = serde_json::to_string(&canvas).unwrap_or_default();
            let _ = sqlx::query(&state.db.format_query(
                "UPDATE playground_projects SET canvas_data = ?, updated_at = NOW() WHERE id = ?",
            ))
            .bind(&new_canvas)
            .bind(project_id)
            .execute(&state.db.pool)
            .await;
        }
    }
}

// ========== 模型属性参数配置锁 ==========

#[derive(Deserialize)]
struct SaveModelConfigRequest {
    model_mid: String,
    param_values: String,
    is_locked: i32,
}

async fn list_model_configs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let configs: Vec<(i64, String, String, String, i32, DbTs, DbTs)> =
        sqlx::query_as(&state.db.format_query(
            "SELECT id, user_id, model_mid, param_values, is_locked, created_at, updated_at \
             FROM user_model_configs WHERE user_id = ?",
        ))
        .bind(&claims.sub)
        .fetch_all(&state.db.pool)
        .await?;

    let list: Vec<serde_json::Value> = configs
        .iter()
        .map(|c| {
            json!({
                "id": c.0,
                "user_id": c.1,
                "model_mid": c.2,
                "param_values": c.3,
                "is_locked": c.4,
                "created_at": c.5.as_str(),
                "updated_at": c.6.as_str(),
            })
        })
        .collect();

    Ok(Json(json!({ "configs": list })))
}

async fn save_model_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SaveModelConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        &state.db.format_query(
            "INSERT INTO user_model_configs (user_id, model_mid, param_values, is_locked, updated_at) \
             VALUES (?, ?, ?, ?, NOW()) \
             ON CONFLICT (user_id, model_mid) \
             DO UPDATE SET param_values = EXCLUDED.param_values, is_locked = EXCLUDED.is_locked, updated_at = NOW()"
        )
    )
    .bind(&claims.sub)
    .bind(&payload.model_mid)
    .bind(&payload.param_values)
    .bind(payload.is_locked)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "success": true, "message": "配置保存成功" })))
}

async fn delete_model_config(
    State(state): State<Arc<AppState>>,
    Path(mid): Path<String>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        &state
            .db
            .format_query("DELETE FROM user_model_configs WHERE user_id = ? AND model_mid = ?"),
    )
    .bind(&claims.sub)
    .bind(&mid)
    .execute(&state.db.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("配置不存在".to_string()));
    }

    Ok(Json(json!({ "success": true, "message": "配置解锁成功" })))
}

#[derive(Deserialize)]
struct RecoverByLogIdQuery {
    log_id: String,
    endpoint: Option<String>,
}

async fn recover_by_log_id(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<RecoverByLogIdQuery>,
) -> AppResult<Json<serde_json::Value>> {
    let log: Option<(
        i64,
        i32,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = sqlx::query_as(&state.db.format_query(
        "SELECT id, status_code, response_content, error_message, endpoint, task_id, action_type \
             FROM logs \
             WHERE log_id = ? AND user_id = ? \
             LIMIT 1",
    ))
    .bind(&query.log_id)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    let Some((
        _log_id,
        status_code,
        response_content,
        error_message,
        db_endpoint,
        task_id,
        action_type,
    )) = log
    else {
        return Ok(Json(json!({
            "status": "processing",
            "message": "后端正在处理中，请稍后再试"
        })));
    };

    if status_code == 0 {
        return Ok(Json(json!({
            "status": "processing",
            "message": "后端正在处理中"
        })));
    }

    if status_code >= 400 || status_code < 200 {
        let raw_err = error_message.unwrap_or_else(|| "生成失败".to_string());
        let display_msg = serde_json::from_str::<serde_json::Value>(&raw_err)
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .and_then(|m| m.as_str().map(String::from))
                    .or_else(|| v.get("message").and_then(|m| m.as_str().map(String::from)))
                    .or_else(|| {
                        v.pointer("/error/msg")
                            .and_then(|m| m.as_str().map(String::from))
                    })
            })
            .unwrap_or(raw_err);
        return Ok(Json(json!({
            "status": "failed",
            "message": display_msg
        })));
    }

    let has_task_id = task_id.as_ref().map(|t| !t.is_empty()).unwrap_or(false);
    if has_task_id {
        return Ok(Json(json!({
            "status": "async",
            "task_id": task_id.unwrap(),
            "message": "异步任务已提交，正在轮询结果"
        })));
    }

    let raw_response = response_content.unwrap_or_default();
    if raw_response.is_empty() {
        return Ok(Json(json!({
            "status": "completed",
            "message": "已完成（响应内容为空）"
        })));
    }

    let raw_path = query
        .endpoint
        .as_deref()
        .or(db_endpoint.as_deref())
        .unwrap_or("/v1/images/generations");
    let clean_path = raw_path.split('|').next().unwrap_or(raw_path);
    let is_video =
        action_type.as_deref() == Some("视频") || action_type.as_deref() == Some("视频增强");
    let category = if is_video { "视频" } else { "图片" };

    let formatted = crate::relay::response_formatter::apply_format(
        &state.db.pool,
        clean_path,
        category,
        &raw_response,
        false,
        None,
    )
    .await;

    let result: serde_json::Value = serde_json::from_str(&formatted).unwrap_or(json!({}));

    let has_data = result
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter().any(|item| {
                item.get("url")
                    .and_then(|u| u.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || item.get("b64_json").is_some()
            })
        })
        .unwrap_or(false);

    if has_data {
        return Ok(Json(json!({
            "status": "completed",
            "result_data": result
        })));
    }

    let raw_json: serde_json::Value = serde_json::from_str(&raw_response).unwrap_or(json!({}));
    let has_raw_data = raw_json
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter().any(|item| {
                item.get("url")
                    .and_then(|u| u.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || item.get("b64_json").is_some()
            })
        })
        .unwrap_or(false);

    if has_raw_data {
        return Ok(Json(json!({
            "status": "completed",
            "result_data": raw_json
        })));
    }

    Ok(Json(json!({
        "status": "completed",
        "message": "已完成（详情请查看使用日志）"
    })))
}
