/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::{
    error::AppError,
    models::{CreateSiteIconReq, SiteIcon, SiteIconQuery, SiteIconSyncLog, UpdateSiteIconReq},
    time_system::DbTs,
    AppState,
};

/// 同步进度追踪器
#[derive(Debug, Clone)]
pub struct SyncProgress {
    inner: Arc<Mutex<SyncProgressInner>>,
}

#[derive(Debug)]
struct SyncProgressInner {
    running: bool,
    total: i64,
    current: i64,
    logs: Vec<String>,
    finished: bool,
    error: Option<String>,
}

impl SyncProgress {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(SyncProgressInner {
                running: false,
                total: 0,
                current: 0,
                logs: Vec::new(),
                finished: false,
                error: None,
            })),
        }
    }

    async fn start(&self, total: i64) {
        let mut inner = self.inner.lock().await;
        inner.running = true;
        inner.total = total;
        inner.current = 0;
        inner.logs = vec![format!("🚀 开始同步，共发现 {} 个图标目录", total)];
        inner.finished = false;
        inner.error = None;
    }

    async fn log(&self, msg: String) {
        let mut inner = self.inner.lock().await;
        inner.logs.push(msg);
        if inner.logs.len() > 500 {
            let start = inner.logs.len() - 500;
            inner.logs = inner.logs.split_off(start);
        }
    }

    async fn progress(&self, current: i64) {
        let mut inner = self.inner.lock().await;
        inner.current = current;
    }

    async fn finish(&self, msg: String) {
        let mut inner = self.inner.lock().await;
        inner.logs.push(msg);
        inner.finished = true;
        inner.running = false;
    }

    async fn fail(&self, err: String) {
        let mut inner = self.inner.lock().await;
        inner.logs.push(format!("❌ {}", err));
        inner.error = Some(err);
        inner.finished = true;
        inner.running = false;
    }

    async fn get_status(&self, since: usize) -> serde_json::Value {
        let inner = self.inner.lock().await;
        let new_logs: Vec<&String> = inner.logs.iter().skip(since).collect();
        json!({
            "running": inner.running,
            "total": inner.total,
            "current": inner.current,
            "finished": inner.finished,
            "error": inner.error,
            "logs": new_logs,
            "log_offset": inner.logs.len(),
        })
    }

    async fn is_running(&self) -> bool {
        let inner = self.inner.lock().await;
        inner.running
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_icons).post(create_icon))
        .route("/public", get(list_icons_public))
        .route("/sync", post(sync_from_github))
        .route("/sync-progress", get(get_sync_progress))
        .route("/sync-logs", get(list_sync_logs))
        .route("/{id}", put(update_icon).delete(delete_icon))
}

/// 列出/搜索图标 (管理员)
pub async fn list_icons(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SiteIconQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let size = params.size.unwrap_or(60).min(200);
    let offset = (page - 1) * size;

    let mut conditions = vec!["1=1".to_string()];
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref q) = params.q {
        if !q.is_empty() {
            conditions.push(format!(
                "(name ILIKE ${} OR title ILIKE ${})",
                binds.len() + 1,
                binds.len() + 2
            ));
            binds.push(format!("%{}%", q));
            binds.push(format!("%{}%", q));
        }
    }
    if let Some(ref cat) = params.category {
        if !cat.is_empty() {
            conditions.push(format!("category = ${}", binds.len() + 1));
            binds.push(cat.clone());
        }
    }
    if let Some(ref src) = params.source {
        if !src.is_empty() {
            conditions.push(format!("source = ${}", binds.len() + 1));
            binds.push(src.clone());
        }
    }

    let where_clause = conditions.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) FROM site_icons WHERE {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        count_query = count_query.bind(b);
    }
    let total: i64 = count_query.fetch_one(&state.db.pool).await?;

    let data_sql = format!(
        "SELECT * FROM site_icons WHERE {} ORDER BY source ASC, name ASC LIMIT ${} OFFSET ${}",
        where_clause,
        binds.len() + 1,
        binds.len() + 2
    );
    let mut data_query = sqlx::query_as::<_, SiteIcon>(&data_sql);
    for b in &binds {
        data_query = data_query.bind(b);
    }
    data_query = data_query.bind(size).bind(offset);
    let icons: Vec<SiteIcon> = data_query.fetch_all(&state.db.pool).await?;

    Ok(Json(json!({
        "success": true,
        "data": icons,
        "total": total,
        "page": page,
        "size": size
    })))
}

/// 公开搜索图标 (已登录用户)
pub async fn list_icons_public(
    State(state): State<Arc<AppState>>,
    Query(params): Query<SiteIconQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let page = params.page.unwrap_or(1).max(1);
    let size = params.size.unwrap_or(60).min(200);
    let offset = (page - 1) * size;

    let mut where_parts = vec!["is_active = 1".to_string()];
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref q) = params.q {
        if !q.is_empty() {
            where_parts.push(format!(
                "(name ILIKE ${} OR title ILIKE ${})",
                binds.len() + 1,
                binds.len() + 2
            ));
            binds.push(format!("%{}%", q));
            binds.push(format!("%{}%", q));
        }
    }
    if let Some(ref cat) = params.category {
        if !cat.is_empty() {
            where_parts.push(format!("category = ${}", binds.len() + 1));
            binds.push(cat.clone());
        }
    }

    let where_clause = where_parts.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) FROM site_icons WHERE {}", where_clause);
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);
    for b in &binds {
        cq = cq.bind(b);
    }
    let total: i64 = cq.fetch_one(&state.db.pool).await?;

    let data_sql = format!(
        "SELECT * FROM site_icons WHERE {} ORDER BY source ASC, name ASC LIMIT ${} OFFSET ${}",
        where_clause,
        binds.len() + 1,
        binds.len() + 2
    );
    let mut dq = sqlx::query_as::<_, SiteIcon>(&data_sql);
    for b in &binds {
        dq = dq.bind(b);
    }
    dq = dq.bind(size).bind(offset);
    let icons: Vec<SiteIcon> = dq.fetch_all(&state.db.pool).await?;

    Ok(Json(json!({
        "success": true,
        "data": icons,
        "total": total,
        "page": page,
        "size": size
    })))
}

/// 手动添加自定义 SVG 图标
pub async fn create_icon(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSiteIconReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.name.is_empty() || payload.svg_content.is_empty() {
        return Err(AppError::BadRequest("图标名称和 SVG 内容不能为空".into()));
    }

    let file_name = format!("{}.svg", payload.name.to_lowercase().replace(' ', "_"));
    let assets_dir = &state.config.assets_dir;
    let dir = format!("{}/icons/custom", assets_dir);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(format!("创建目录失败: {}", e)))?;
    let file_path = format!("icons/custom/{}", file_name);
    let full_path = format!("{}/{}", assets_dir, file_path);
    tokio::fs::write(&full_path, &payload.svg_content)
        .await
        .map_err(|e| AppError::Internal(format!("写入 SVG 文件失败: {}", e)))?;

    let title = payload.title.unwrap_or_else(|| payload.name.clone());
    let category = payload.category.unwrap_or_else(|| "自定义".to_string());
    let tags_json = serde_json::to_string(&payload.tags.unwrap_or_default()).unwrap_or("[]".into());
    let now = DbTs::now();

    let icon: SiteIcon = sqlx::query_as(
        "INSERT INTO site_icons (name, title, file_path, source, category, tags, is_active, created_at, updated_at) \
         VALUES ($1, $2, $3, 'custom', $4, $5, 1, $6, $7) \
         ON CONFLICT (name, source) DO UPDATE SET title = $2, file_path = $3, category = $4, tags = $5, updated_at = $7 \
         RETURNING *"
    )
    .bind(&payload.name)
    .bind(&title)
    .bind(&file_path)
    .bind(&category)
    .bind(&tags_json)
    .bind(&now)
    .bind(&now)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "图标添加成功",
        "data": icon
    })))
}

/// 更新图标
pub async fn update_icon(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateSiteIconReq>,
) -> Result<Json<serde_json::Value>, AppError> {
    let current: SiteIcon = sqlx::query_as("SELECT * FROM site_icons WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("图标不存在".into()))?;

    let name = payload.name.unwrap_or(current.name);
    let title = payload.title.unwrap_or(current.title);
    let category = payload.category.unwrap_or(current.category);
    let tags = payload
        .tags
        .map(|t| serde_json::to_string(&t).unwrap_or("[]".into()))
        .unwrap_or(current.tags);
    let is_active = payload.is_active.unwrap_or(current.is_active);
    let now = DbTs::now();

    let file_path = if let Some(ref svg) = payload.svg_content {
        let file_name = format!("{}.svg", name.to_lowercase().replace(' ', "_"));
        let sub_dir = if current.source == "custom" {
            "icons/custom"
        } else {
            "icons/lobe"
        };
        let assets_dir = &state.config.assets_dir;
        let dir = format!("{}/{}", assets_dir, sub_dir);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| AppError::Internal(format!("创建目录失败: {}", e)))?;
        let fp = format!("{}/{}", sub_dir, file_name);
        let full = format!("{}/{}", assets_dir, fp);
        tokio::fs::write(&full, svg)
            .await
            .map_err(|e| AppError::Internal(format!("写入 SVG 文件失败: {}", e)))?;
        fp
    } else {
        current.file_path
    };

    let updated: SiteIcon = sqlx::query_as(
        "UPDATE site_icons SET name = $1, title = $2, file_path = $3, category = $4, tags = $5, is_active = $6, updated_at = $7 WHERE id = $8 RETURNING *"
    )
    .bind(&name)
    .bind(&title)
    .bind(&file_path)
    .bind(&category)
    .bind(&tags)
    .bind(is_active)
    .bind(&now)
    .bind(id)
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(json!({
        "success": true,
        "message": "图标更新成功",
        "data": updated
    })))
}

/// 删除图标
pub async fn delete_icon(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let icon: Option<SiteIcon> = sqlx::query_as("SELECT * FROM site_icons WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?;

    if let Some(ref icon) = icon {
        let full = format!("{}/{}", state.config.assets_dir, icon.file_path);
        tokio::fs::remove_file(&full).await.ok();
    }

    sqlx::query("DELETE FROM site_icons WHERE id = $1")
        .bind(id)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(json!({
        "success": true,
        "message": "图标删除成功"
    })))
}

/// 查看同步日志
pub async fn list_sync_logs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    let logs: Vec<SiteIconSyncLog> =
        sqlx::query_as("SELECT * FROM site_icon_sync_logs ORDER BY id DESC LIMIT 50")
            .fetch_all(&state.db.pool)
            .await?;

    Ok(Json(json!({
        "success": true,
        "data": logs
    })))
}

/// 获取同步进度（前端轮询）
#[derive(serde::Deserialize)]
pub struct ProgressQuery {
    pub since: Option<usize>,
}

pub async fn get_sync_progress(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ProgressQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let since = params.since.unwrap_or(0);
    let status = state.icon_sync_progress.get_status(since).await;
    Ok(Json(json!({
        "success": true,
        "data": status
    })))
}

/// 启动异步同步任务（立即返回）
pub async fn sync_from_github(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 检查是否已有任务在运行
    if state.icon_sync_progress.is_running().await {
        return Err(AppError::BadRequest("同步任务正在进行中，请稍候".into()));
    }

    // spawn 后台任务
    let state_clone = state.clone();
    tokio::spawn(async move {
        if let Err(e) = do_sync(state_clone).await {
            tracing::error!("图标同步任务失败: {}", e);
        }
    });

    Ok(Json(json!({
        "success": true,
        "message": "同步任务已启动，请查看进度面板"
    })))
}

/// 实际同步逻辑（在后台线程执行）
async fn do_sync(state: Arc<AppState>) -> anyhow::Result<()> {
    let progress = &state.icon_sync_progress;
    let now = DbTs::now();

    // 1. 从 GitHub API 获取 src 目录列表
    progress
        .log("📡 正在请求 GitHub API 获取图标目录列表...".into())
        .await;

    let github_url = "https://api.github.com/repos/lobehub/lobe-icons/contents/src";
    let resp = match state
        .http_client
        .get(github_url)
        .header("User-Agent", "TokensByte-IconSync/1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("请求 GitHub API 失败: {}", e);
            progress.fail(msg.clone()).await;
            write_sync_log(&state, 0, 0, 0, "failed", Some(&msg), &now).await;
            return Ok(());
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let msg = format!(
            "GitHub API 返回 {}: {}",
            status,
            &body[..body.len().min(200)]
        );
        progress.fail(msg.clone()).await;
        write_sync_log(&state, 0, 0, 0, "failed", Some(&msg), &now).await;
        return Ok(());
    }

    let dirs: Vec<serde_json::Value> = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            let msg = format!("解析 GitHub API 响应失败: {}", e);
            progress.fail(msg.clone()).await;
            write_sync_log(&state, 0, 0, 0, "failed", Some(&msg), &now).await;
            return Ok(());
        }
    };

    let icon_names: Vec<(String, String)> = dirs
        .iter()
        .filter(|d| d["type"].as_str() == Some("dir"))
        .filter_map(|d| {
            let name = d["name"].as_str()?.to_string();
            Some((name.clone(), name))
        })
        .collect();

    let total_count = icon_names.len() as i64;
    progress.start(total_count).await;
    progress
        .log(format!(
            "✅ GitHub API 返回成功，发现 {} 个图标目录",
            total_count
        ))
        .await;

    // 2. 创建 icons/lobe 目录
    let assets_dir = &state.config.assets_dir;
    let dir = format!("{}/icons/lobe", assets_dir);
    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
        let msg = format!("创建图标目录失败: {}", e);
        progress.fail(msg.clone()).await;
        write_sync_log(&state, 0, 0, 0, "failed", Some(&msg), &now).await;
        return Ok(());
    }

    let mut total_synced = 0i64;
    let mut _total_new = 0i64;
    let mut total_skipped = 0i64;
    let mut errors: Vec<String> = Vec::new();

    // 3. 逐个下载 SVG
    for (idx, (original_name, _)) in icon_names.iter().enumerate() {
        let slug = original_name.to_lowercase();
        let cdn_color_url = format!(
            "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{}-color.svg",
            slug
        );
        let cdn_default_url = format!(
            "https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{}.svg",
            slug
        );

        progress.progress((idx + 1) as i64).await;
        progress
            .log(format!(
                "⬇️  [{}/{}] 正在下载: {} ...",
                idx + 1,
                total_count,
                original_name
            ))
            .await;

        let mut svg_content = String::new();
        let mut download_success = false;

        // Try color version first
        if let Ok(resp) = state
            .http_client
            .get(&cdn_color_url)
            .header("User-Agent", "TokensByte-IconSync/1.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    if text.contains("<svg") {
                        svg_content = text;
                        download_success = true;
                    }
                }
            }
        }

        // Fallback to default version if color version failed
        if !download_success {
            if let Ok(resp) = state
                .http_client
                .get(&cdn_default_url)
                .header("User-Agent", "TokensByte-IconSync/1.0")
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        if text.contains("<svg") {
                            svg_content = text;
                            download_success = true;
                        }
                    }
                } else {
                    total_skipped += 1;
                    progress
                        .log(format!(
                            "⏭️  [{}/{}] {} CDN 返回 {}，已跳过",
                            idx + 1,
                            total_count,
                            original_name,
                            resp.status()
                        ))
                        .await;
                    continue;
                }
            } else {
                let err_msg = format!("{}: 下载请求失败", original_name);
                progress.log(format!("⚠️  {}", err_msg)).await;
                errors.push(err_msg);
                continue;
            }
        }

        if !download_success {
            total_skipped += 1;
            progress
                .log(format!(
                    "⏭️  [{}/{}] {} 无效的 SVG，已跳过",
                    idx + 1,
                    total_count,
                    original_name
                ))
                .await;
            continue;
        }

        let file_name = format!("{}.svg", slug);
        let file_path = format!("icons/lobe/{}", file_name);
        let full_path = format!("{}/{}", assets_dir, file_path);

        if let Err(e) = tokio::fs::write(&full_path, &svg_content).await {
            let err_msg = format!("{}: 写入文件失败 {}", original_name, e);
            progress.log(format!("⚠️  {}", err_msg)).await;
            errors.push(err_msg);
            continue;
        }

        let result = sqlx::query(
            "INSERT INTO site_icons (name, title, file_path, source, category, tags, is_active, created_at, updated_at) \
             VALUES ($1, $2, $3, 'lobe-icons', 'AI品牌', '[]', 1, $4, $5) \
             ON CONFLICT (name, source) DO UPDATE SET title = $2, file_path = $3, updated_at = $5"
        )
        .bind(&slug)
        .bind(original_name)
        .bind(&file_path)
        .bind(&now)
        .bind(&now)
        .execute(&state.db.pool)
        .await;

        match result {
            Ok(_) => {
                total_synced += 1;
                _total_new += 1;
                progress
                    .log(format!(
                        "✅ [{}/{}] {} 同步成功",
                        idx + 1,
                        total_count,
                        original_name
                    ))
                    .await;
            }
            Err(e) => {
                let err_msg = format!("{}: 数据库写入失败 {}", original_name, e);
                progress.log(format!("⚠️  {}", err_msg)).await;
                errors.push(err_msg);
            }
        }
    }

    // 统计
    let existing_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM site_icons WHERE source = 'lobe-icons'")
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(0);

    let status_str = if errors.is_empty() {
        "success"
    } else {
        "partial"
    };
    let error_msg = if errors.is_empty() {
        None
    } else {
        Some(errors.join("; "))
    };

    let summary = format!(
        "🎉 同步完成！成功 {} 个，跳过 {} 个，失败 {} 个，库中共 {} 个图标",
        total_synced,
        total_skipped,
        errors.len(),
        existing_count
    );
    progress.finish(summary.clone()).await;

    write_sync_log(
        &state,
        total_synced,
        existing_count,
        total_synced,
        status_str,
        error_msg.as_deref(),
        &now,
    )
    .await;

    tracing::info!("{}", summary);
    Ok(())
}

/// 启动时自动检查图标文件完整性，缺失则自动恢复同步
pub async fn auto_recover_on_startup(state: Arc<AppState>) {
    // 检查插件是否已启用
    let enabled: Option<i64> =
        sqlx::query_scalar("SELECT is_enabled FROM plugins WHERE name = 'site_icons'")
            .fetch_optional(&state.db.pool)
            .await
            .ok()
            .flatten();

    if enabled != Some(1) {
        return; // 插件未启用，跳过
    }

    // 查询数据库中 lobe-icons 来源的图标数量
    let total: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM site_icons WHERE source = 'lobe-icons'")
            .fetch_one(&state.db.pool)
            .await
            .unwrap_or(0);

    if total == 0 {
        return; // 数据库中没有图标记录，无需检查
    }

    // 抽样检查前 20 个图标的文件是否存在
    let sample_paths: Vec<String> = sqlx::query_scalar(
        "SELECT file_path FROM site_icons WHERE source = 'lobe-icons' ORDER BY name ASC LIMIT 20",
    )
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let mut missing = 0;
    let assets_dir = &state.config.assets_dir;
    for fp in &sample_paths {
        let full = format!("{}/{}", assets_dir, fp);
        if tokio::fs::metadata(&full).await.is_err() {
            missing += 1;
        }
    }

    // 超过半数文件缺失，触发自动恢复同步
    if missing > sample_paths.len() / 2 {
        tracing::warn!(
            "🔄 站点图标文件缺失 ({}/{} 抽样缺失, 数据库共 {} 条)，自动触发恢复同步...",
            missing,
            sample_paths.len(),
            total
        );
        let state_clone = state.clone();
        tokio::spawn(async move {
            // 等待 5 秒让服务完全就绪
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            if let Err(e) = do_sync(state_clone).await {
                tracing::error!("图标自动恢复同步失败: {}", e);
            }
        });
    } else {
        tracing::info!(
            "✅ 站点图标文件完整性检查通过 ({} 条记录, {}/{} 抽样文件存在)",
            total,
            sample_paths.len() - missing,
            sample_paths.len()
        );
    }
}

/// 写入同步日志到数据库
async fn write_sync_log(
    state: &Arc<AppState>,
    total_synced: i64,
    total_new: i64,
    total_updated: i64,
    status: &str,
    error_message: Option<&str>,
    now: &DbTs,
) {
    sqlx::query(
        "INSERT INTO site_icon_sync_logs (total_synced, total_new, total_updated, status, error_message, created_at) \
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(total_synced)
    .bind(total_new)
    .bind(total_updated)
    .bind(status)
    .bind(error_message)
    .bind(now)
    .execute(&state.db.pool)
    .await
    .ok();
}
