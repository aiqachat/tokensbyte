/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use axum::{
    extract::{Extension, Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use std::sync::Arc;
use std::sync::LazyLock;

static CLAUDE_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/claude-chat.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static GPT_IMG_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/gpt-image.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static GOOGLE_IMG_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/google-image.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static VOLC_IMG_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/volc-image.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static KLING_IMG_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/kling-image.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static VOLC_VID_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/volc-video.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
static KLING_VID_ZH: LazyLock<String> = LazyLock::new(|| {
    format!(
        "{}\n\n{}",
        include_str!("default_docs/zh/kling-video.md"),
        include_str!("default_docs/zh/common-errors.md")
    )
});
use crate::{
    auth,
    error::{AppError, AppResult},
    time_system::DbTs,
    AppState,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, Pool, Postgres};

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct PluginDoc {
    pub id: i32,
    pub parent_id: Option<i32>,
    pub title: String,
    pub content: Option<String>,
    pub is_dir: i32,
    pub sort_order: i32,
    pub is_active: i32,
    pub created_at: DbTs,
    pub updated_at: DbTs,
    pub slug: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DocTreeNode {
    pub id: i32,
    pub parent_id: Option<i32>,
    pub title: String,
    pub is_dir: bool,
    pub sort_order: i32,
    pub is_active: bool,
    pub slug: Option<String>,
    pub children: Vec<DocTreeNode>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TranslationInput {
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocReq {
    pub parent_id: Option<i32>,
    pub title: String,
    pub content: Option<String>,
    pub is_dir: i32,
    pub sort_order: i32,
    pub is_active: i32,
    pub slug: Option<String>,
    pub translations: Option<std::collections::HashMap<String, TranslationInput>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDocReq {
    pub parent_id: Option<i32>,
    pub title: String,
    pub content: Option<String>,
    pub sort_order: i32,
    pub is_active: i32,
    pub slug: Option<String>,
    pub translations: Option<std::collections::HashMap<String, TranslationInput>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct DocTranslation {
    pub lang: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocDetailResp {
    pub id: i32,
    pub parent_id: Option<i32>,
    pub title: String,
    pub content: Option<String>,
    pub is_dir: i32,
    pub sort_order: i32,
    pub is_active: i32,
    pub created_at: String,
    pub updated_at: String,
    pub slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translations: Option<std::collections::HashMap<String, TranslationInput>>,
}

#[derive(Debug, Deserialize)]
pub struct DocQuery {
    pub lang: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TranslateReq {
    pub text: String,
    pub to_lang: String,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/docs", get(list_docs_admin).post(create_doc))
        .route(
            "/docs/{id}",
            get(get_doc_detail).put(update_doc).delete(delete_doc),
        )
        .route("/docs/import-default", post(import_default_docs))
        .route("/docs/translate", post(translate_content))
}

/// 管理员：获取完整的文档树形结构（包含禁用的）
async fn list_docs_admin(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    let docs: Vec<PluginDoc> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM plugin_docs ORDER BY sort_order ASC, id ASC"),
    )
    .fetch_all(&state.db.pool)
    .await?;

    let tree = build_tree(&docs, false);
    Ok(Json(json!({ "tree": tree })))
}

/// 公开接口：获取所有启用的文档树形结构（前台使用，无需管理员鉴权）
pub async fn list_docs_public(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DocQuery>,
) -> AppResult<Json<serde_json::Value>> {
    // 检查 docs_api 插件是否开启
    let is_enabled: i64 = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'docs_api'"),
    )
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or(0);

    if is_enabled == 0 {
        return Err(AppError::BadRequest(
            "站点文档插件已关闭，请联系管理员开启。".to_string(),
        ));
    }

    let lang = query.lang.filter(|l| !l.is_empty() && l != "zh");

    let docs: Vec<PluginDoc> = if let Some(ref l) = lang {
        sqlx::query_as(
            &state.db.format_query(
                "SELECT p.id, p.parent_id, p.is_dir, p.sort_order, p.is_active, p.slug, p.created_at, p.updated_at, \
                 COALESCE(NULLIF(i.title, ''), p.title) AS title, \
                 COALESCE(NULLIF(i.content, ''), p.content) AS content \
                 FROM plugin_docs p \
                 LEFT JOIN plugin_docs_intl i ON i.doc_id = p.id AND i.lang = ? \
                 WHERE p.is_active = 1 \
                 ORDER BY p.sort_order ASC, p.id ASC"
            )
        )
        .bind(l)
        .fetch_all(&state.db.pool)
        .await?
    } else {
        sqlx::query_as(&state.db.format_query(
            "SELECT * FROM plugin_docs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC",
        ))
        .fetch_all(&state.db.pool)
        .await?
    };

    let tree = build_tree(&docs, true);
    Ok(Json(json!({ "tree": tree })))
}

/// 获取指定文章的详情内容
pub async fn get_doc_detail(
    State(state): State<Arc<AppState>>,
    Query(query): Query<DocQuery>,
    Path(id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    let lang = query.lang.filter(|l| !l.is_empty() && l != "zh");

    let doc: Option<PluginDoc> = if let Some(ref l) = lang {
        sqlx::query_as(
            &state.db.format_query(
                "SELECT p.id, p.parent_id, p.is_dir, p.sort_order, p.is_active, p.slug, p.created_at, p.updated_at, \
                 COALESCE(NULLIF(i.title, ''), p.title) AS title, \
                 COALESCE(NULLIF(i.content, ''), p.content) AS content \
                 FROM plugin_docs p \
                 LEFT JOIN plugin_docs_intl i ON i.doc_id = p.id AND i.lang = ? \
                 WHERE p.id = ?"
            )
        )
        .bind(l)
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
    } else {
        sqlx::query_as(
            &state
                .db
                .format_query("SELECT * FROM plugin_docs WHERE id = ?"),
        )
        .bind(id)
        .fetch_optional(&state.db.pool)
        .await?
    };

    let doc = match doc {
        Some(d) => d,
        None => return Err(AppError::NotFound("文档未找到".to_string())),
    };

    // If lang is not specified, we also return translations (useful for admin page)
    let translations = if lang.is_none() {
        let trans_list: Vec<DocTranslation> =
            sqlx::query_as(&state.db.format_query(
                "SELECT lang, title, content FROM plugin_docs_intl WHERE doc_id = ?",
            ))
            .bind(id)
            .fetch_all(&state.db.pool)
            .await?;

        let mut map = std::collections::HashMap::new();
        for t in trans_list {
            map.insert(
                t.lang,
                TranslationInput {
                    title: t.title,
                    content: Some(t.content),
                },
            );
        }
        Some(map)
    } else {
        None
    };

    Ok(Json(json!({
        "doc": DocDetailResp {
            id: doc.id,
            parent_id: doc.parent_id,
            title: doc.title,
            content: doc.content,
            is_dir: doc.is_dir,
            sort_order: doc.sort_order,
            is_active: doc.is_active,
            created_at: doc.created_at.into_string(),
            updated_at: doc.updated_at.into_string(),
            slug: doc.slug,
            translations,
        }
    })))
}

/// 管理员：新建文档/分类
async fn create_doc(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<CreateDocReq>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    let mut tx = state.db.pool.begin().await?;

    let doc: PluginDoc = sqlx::query_as(
        &state.db.format_query(
            "INSERT INTO plugin_docs (parent_id, title, content, is_dir, sort_order, is_active, slug, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
             RETURNING *"
        )
    )
    .bind(payload.parent_id)
    .bind(&payload.title)
    .bind(payload.content.unwrap_or_default())
    .bind(payload.is_dir)
    .bind(payload.sort_order)
    .bind(payload.is_active)
    .bind(payload.slug.unwrap_or_default())
    .fetch_one(&mut *tx)
    .await?;

    if let Some(trans) = payload.translations {
        for (lang, info) in trans {
            sqlx::query(
                &state.db.format_query(
                    "INSERT INTO plugin_docs_intl (doc_id, lang, title, content, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
                     ON CONFLICT (doc_id, lang) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = EXCLUDED.updated_at"
                )
            )
            .bind(doc.id)
            .bind(&lang)
            .bind(&info.title)
            .bind(info.content.unwrap_or_default())
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(json!({ "doc": doc })))
}

/// 管理员：修改文档/分类
async fn update_doc(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<UpdateDocReq>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    // 检查父节点循环引用
    if let Some(pid) = payload.parent_id {
        if pid == id {
            return Err(AppError::BadRequest("父节点不能是自己".to_string()));
        }
    }

    let mut tx = state.db.pool.begin().await?;

    let updated: PluginDoc = sqlx::query_as(
        &state.db.format_query(
            "UPDATE plugin_docs SET parent_id = ?, title = ?, content = ?, sort_order = ?, is_active = ?, slug = ?, updated_at = CURRENT_TIMESTAMP \
             WHERE id = ? RETURNING *"
        )
    )
    .bind(payload.parent_id)
    .bind(&payload.title)
    .bind(payload.content.unwrap_or_default())
    .bind(payload.sort_order)
    .bind(payload.is_active)
    .bind(payload.slug.unwrap_or_default())
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    if let Some(trans) = payload.translations {
        for (lang, info) in trans {
            sqlx::query(
                &state.db.format_query(
                    "INSERT INTO plugin_docs_intl (doc_id, lang, title, content, created_at, updated_at) \
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) \
                     ON CONFLICT (doc_id, lang) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = EXCLUDED.updated_at"
                )
            )
            .bind(id)
            .bind(&lang)
            .bind(&info.title)
            .bind(info.content.unwrap_or_default())
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(Json(json!({ "doc": updated })))
}

/// 管理员：删除文档/分类 (级联删除)
async fn delete_doc(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i32>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    // PostgreSQL 支持级联外键关联或者我们在这里直接级联删除。
    // 我们的表结构 `REFERENCES plugin_docs(id) ON DELETE CASCADE` 可以实现自动级联删除。
    sqlx::query(
        &state
            .db
            .format_query("DELETE FROM plugin_docs WHERE id = ?"),
    )
    .bind(id)
    .execute(&state.db.pool)
    .await?;

    Ok(Json(json!({ "message": "deleted" })))
}

async fn translate_content(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<TranslateReq>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    if payload.text.trim().is_empty() {
        return Ok(Json(json!({ "translated": "" })));
    }

    // 寻找启用的物理 AI 通道（排除 HA 父组：其 base_url 常为空，翻译需可直连上游）
    let channel_id: Option<i64> = sqlx::query_scalar(&state.db.format_query(
        "SELECT id FROM channels WHERE status = 1 AND provider_type != 'high_availability_group' \
             ORDER BY sort_order DESC, priority DESC, id DESC LIMIT 1",
    ))
    .fetch_optional(&state.db.pool)
    .await?;

    let channel = match channel_id {
        Some(id) => crate::relay::router::fetch_channel(&state, id, None).await,
        None => None,
    }
    .ok_or_else(|| {
        AppError::BadRequest("没有找到启用的 AI 渠道进行翻译，请先配置渠道。".to_string())
    })?;

    let mut api_url = channel.base_url.trim().to_string();
    if !api_url.contains("/chat/completions") {
        if api_url.ends_with('/') {
            api_url = format!("{}v1/chat/completions", api_url);
        } else {
            api_url = format!("{}/v1/chat/completions", api_url);
        }
    }

    let models = channel.get_models();
    let model = models
        .first()
        .cloned()
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    let target_lang_name = match payload.to_lang.as_str() {
        "en" => "English",
        "ja" => "Japanese",
        "ko" => "Korean",
        "vi" => "Vietnamese",
        _ => &payload.to_lang,
    };

    let sys_prompt = "You are a professional software documentation translator. Translate the user's markdown content to the target language. IMPORTANT: You must preserve the original Markdown structure, code blocks, placeholders (like {{domain}} or urls), and HTML tags. Do NOT translate code blocks, inline code, or technical parameters/paths. Output ONLY the translated content, no introduction or explanations.";

    let user_content = format!(
        "Target Language: {}\n\nContent:\n{}",
        target_lang_name, payload.text
    );

    let chat_payload = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": sys_prompt
            },
            {
                "role": "user",
                "content": user_content
            }
        ],
        "temperature": 0.3
    });

    let resp = state
        .http_client
        .post(&api_url)
        .header("Authorization", format!("Bearer {}", channel.api_key))
        .json(&chat_payload)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("请求翻译渠道失败: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(AppError::BadRequest(format!(
            "翻译渠道响应错误 ({}): {}",
            status, err_text
        )));
    }

    #[derive(Debug, Deserialize)]
    struct ChoiceMessage {
        content: String,
    }
    #[derive(Debug, Deserialize)]
    struct Choice {
        message: ChoiceMessage,
    }
    #[derive(Debug, Deserialize)]
    struct ChatResponse {
        choices: Vec<Choice>,
    }

    let chat_resp: ChatResponse = resp
        .json()
        .await
        .map_err(|e| AppError::BadRequest(format!("解析翻译响应失败: {}", e)))?;

    let translated = chat_resp
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default();

    Ok(Json(json!({ "translated": translated })))
}

/// 管理员：重置并导入默认文档数据
async fn import_default_docs(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    check_admin(&state, &claims.sub).await?;

    seed_default_docs_direct(&state.db.pool).await?;

    Ok(Json(json!({ "message": "imported" })))
}

// ── 辅助函数 ──

async fn check_admin(state: &AppState, user_id: &str) -> AppResult<()> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(user_id)
            .fetch_one(&state.db.pool)
            .await?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn build_tree(docs: &[PluginDoc], active_only: bool) -> Vec<DocTreeNode> {
    let mut root_nodes: Vec<DocTreeNode> = Vec::new();
    let mut children_map: std::collections::HashMap<i32, Vec<DocTreeNode>> =
        std::collections::HashMap::new();

    // 第一次遍历：创建所有树形节点并存入哈希表
    for doc in docs {
        if active_only && doc.is_active == 0 {
            continue;
        }
        let node = DocTreeNode {
            id: doc.id,
            parent_id: doc.parent_id,
            title: doc.title.clone(),
            is_dir: doc.is_dir == 1,
            sort_order: doc.sort_order,
            is_active: doc.is_active == 1,
            slug: doc.slug.clone(),
            children: Vec::new(),
        };

        if let Some(pid) = doc.parent_id {
            children_map.entry(pid).or_default().push(node);
        } else {
            root_nodes.push(node);
        }
    }

    // 递归填充子节点
    fn fill_children(
        node: &mut DocTreeNode,
        map: &std::collections::HashMap<i32, Vec<DocTreeNode>>,
    ) {
        if let Some(child_list) = map.get(&node.id) {
            let mut list = child_list.clone();
            list.sort_by_key(|n| (n.sort_order, n.id));
            for mut child in list {
                fill_children(&mut child, map);
                node.children.push(child);
            }
        }
    }

    for node in &mut root_nodes {
        fill_children(node, &children_map);
    }

    root_nodes.sort_by_key(|n| (n.sort_order, n.id));
    root_nodes
}

// ── 种子数据初始化 ──

pub async fn seed_default_docs_direct(pool: &Pool<Postgres>) -> Result<(), sqlx::Error> {
    // 1. 清空旧的文档数据
    sqlx::query("TRUNCATE TABLE plugin_docs RESTART IDENTITY CASCADE")
        .execute(pool)
        .await?;

    let default_data = get_default_docs_data();

    for (cat_title, cat_slug, cat_order, articles) in default_data {
        // 插入目录
        let cat_id: i32 = sqlx::query_scalar(
            "INSERT INTO plugin_docs (parent_id, title, content, is_dir, sort_order, is_active, slug, created_at, updated_at) \
             VALUES (NULL, $1, '', 1, $2, 1, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id"
        )
        .bind(cat_title)
        .bind(cat_order)
        .bind(cat_slug)
        .fetch_one(pool)
        .await?;

        // 插入目录的翻译
        let cat_translations = crate::api::default_docs::get_category_translations(cat_slug);
        for (lang, trans_title) in cat_translations {
            sqlx::query(
                "INSERT INTO plugin_docs_intl (doc_id, lang, title, content, created_at, updated_at) \
                 VALUES ($1, $2, $3, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
            .bind(cat_id)
            .bind(lang)
            .bind(trans_title)
            .execute(pool)
            .await?;
        }

        // 插入属于该目录的文章
        for (art_title, art_slug, art_order, art_content) in articles {
            let art_id: i32 = sqlx::query_scalar(
                "INSERT INTO plugin_docs (parent_id, title, content, is_dir, sort_order, is_active, slug, created_at, updated_at) \
                 VALUES ($1, $2, $3, 0, $4, 1, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id"
            )
            .bind(cat_id)
            .bind(art_title)
            .bind(art_content)
            .bind(art_order)
            .bind(art_slug)
            .fetch_one(pool)
            .await?;

            // 插入文章的翻译
            let art_translations = crate::api::default_docs::get_article_translations(art_slug);
            for trans in art_translations {
                sqlx::query(
                    "INSERT INTO plugin_docs_intl (doc_id, lang, title, content, created_at, updated_at) \
                     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
                .bind(art_id)
                .bind(trans.lang)
                .bind(trans.title)
                .bind(trans.content)
                .execute(pool)
                .await?;
            }
        }
    }

    Ok(())
}

fn get_default_docs_data() -> Vec<(
    &'static str,
    &'static str,
    i32,
    Vec<(&'static str, &'static str, i32, &'static str)>,
)> {
    vec![
        (
            "1. 快速开始",
            "quickstart",
            10,
            vec![
                (
                    "快速开始与鉴权说明",
                    "auth-guide",
                    10,
                    "# 快速开始 与 接口鉴权说明\n\n欢迎使用统一 API 网关！本网关支持 OpenAI 协议与各家大模型厂商的原生协议，能够为您提供自动的渠道分发、协议转译和智能计费结算。\n\n### 1. 基础调用地址 (Base URL)\n统一的 API 基准请求地址为：\n```bash\nhttps://{{domain}}\n```\n如果您在本地进行调试或私有部署，可使用系统分配的对应端口地址。\n\n### 2. 安全鉴权方式\n网关在所有 API 接口中均提供了严格的权限检查，您可以通过以下任一方式在请求中附带您的「API 密钥 (Token)」：\n\n1. **标准 Authorization 请求头 (推荐)**\n   在 HTTP 请求头部中，添加标准 Bearer 令牌：\n   ```http\n   Authorization: Bearer sk-your_token_string_here\n   ```\n\n2. **Google 协议兼容请求头**\n   若您的客户端程序采用 Google 原生协议，可使用官方的 API Key 请求头：\n   ```http\n   X-Goog-Api-Key: sk-your_token_string_here\n   ```\n\n3. **URL 参数透传**\n   在部分仅支持 GET/POST 简单请求或受限的环境下，您也可以直接将密钥附在 URL 查询参数中：\n   ```bash\n   https://{{domain}}/v1/chat/completions?key=sk-your_token_string_here\n   ```\n\n> [!IMPORTANT]\n> API 密钥 (Token) 是您账户的消费凭证，请妥善保管，切勿在公开的客户端（如前端 HTML/JS）中明文硬编码密钥。建议通过后端服务转发或配置环境变量保存。"
                ),
                (
                    "开放端点一览表",
                    "endpoints",
                    20,
                    "# 开放端点一览表\n\n系统已对业界主流的大模型及媒体处理接口进行了全方位的网关封装，并为不同厂商的协议开辟了对应的转发路由。您可以使用您的统一 API 密钥，直接通过网关访问以下全部端点：\n\n### 1. OpenAI 协议路由\n| 端点名称 | 路径 (Path) | 请求方式 | 协议类型 |\n| :--- | :--- | :--- | :--- |\n| OpenAI 聊天对话 | `/v1/chat/completions` | `POST` | OpenAI 兼容 |\n| OpenAI 官方原生透传 | `/v1/responses` | `POST` | OpenAI 兼容 |\n| 图像生成 (Text2Image) | `/v1/images/generations` | `POST` | OpenAI 兼容 |\n| 图像编辑 (Image Edit) | `/v1/images/edits` | `POST` | OpenAI 兼容 |\n| 异步视频任务提交 | `/v1/video/generations` | `POST` | OpenAI 兼容 |\n| 异步视频任务状态查询 | `/v1/video/generations/{task_id}` | `GET` | OpenAI 兼容 |\n| 文本语音合成 (Text-to-Speech) | `/v1/audio/speech` | `POST` | OpenAI 兼容 |\n| 令牌可用额度查询 | `/v1/balance` | `GET` | 账户信息 |\n| 账户总余额查询 | `/v1/user/balance` | `GET` | 账户信息 |\n| 可用模型列表 | `/v1/models` | `GET` | 账户信息 |\n\n### 2. 火山方舟 (Volcengine) 路由\n| 端点名称 | 路径 (Path) | 请求方式 | 协议类型 |\n| :--- | :--- | :--- | :--- |\n| 聊天对话 (OpenAI 兼容) | `/api/v3/chat/completions` | `POST` | 火山方舟 |\n| 原生响应 (Responses) | `/api/v3/responses` | `POST` | 火山方舟 |\n| 图像生成 (Generations) | `/api/v3/images/generations` | `POST` | 火山方舟 |\n| 异步视频任务提交 | `/api/v3/contents/generations/tasks` | `POST` | 火山方舟 |\n| 异步视频任务查询 | `/api/v3/contents/generations/tasks/{task_id}` | `GET` | 火山方舟 |\n| 异步视频任务取消 | `/api/v3/contents/generations/tasks/{task_id}` | `DELETE` | 火山方舟 |\n| 语音合成 (SSE 文本流) | `/api/v3/tts/unidirectional/sse` | `POST` | 火山方舟 |\n| 语音合成 (Chunked 二进制) | `/api/v3/tts/unidirectional` | `POST` | 火山方舟 |\n| 视频画质增强 (标准/专业) | `/api/v1/tools/enhance-video` | `POST` | 火山 MediaKit |\n| 视频画质增强 (极速版) | `/api/v1/tools/enhance-video-fast` | `POST` | 火山 MediaKit |\n| 视频画质增强 (大模型版) | `/api/v1/tools/enhance-video-generative` | `POST` | 火山 MediaKit |\n| 视频字幕擦除 | `/api/v1/tools/erase-video-subtitle` | `POST` | 火山 MediaKit |\n| 媒体任务状态查询 | `/api/v1/tasks/{task_id}` | `GET` | 火山 MediaKit |\n\n### 3. 其他厂商原生路由\n| 厂商名称 | 端点名称 | 路径 (Path) | 请求方式 |\n| :--- | :--- | :--- | :--- |\n| 阿里百炼 | 万相视频生成 (提交) | `/api/v1/services/aigc/video-generation/video-synthesis` | `POST` |\n| 阿里百炼 | 万相生图任务 (提交) | `/api/v1/services/aigc/multimodal-generation/generation` | `POST` |\n| 阿里百炼 | 异步任务查询 (通用) | `/api/v1/tasks/{task_id}` | `GET` |\n| 阿里百炼 | 文本向量化 | `/compatible-mode/v1/embeddings` | `POST` |\n| 阿里百炼 | 文档重排序 (Rerank) | `/compatible-api/v1/reranks` | `POST` |\n| 可灵 AI | 文生视频 (Kling) | `/v1/videos/text2video` | `POST` |\n| 可灵 AI | 图生视频 (Kling) | `/v1/videos/image2video` | `POST` |\n| 可灵 AI | 任务状态查询 (视频/图片) | `/v1/videos/{endpoint}/{task_id}` | `GET` |\n| Google | Gemini 文本生成 | `/v1beta/models/{model}:generateContent` | `POST` |\n| Google | Gemini 流式文本生成 | `/v1beta/models/{model}:streamGenerateContent` | `POST` |\n| Anthropic | Claude 原生消息 | `/v1/messages` | `POST` |"
                )
            ]
        ),
        (
            "2. 常用调用示例",
            "examples",
            15,
            vec![
                (
                    "Claude / GPT / DeepSeek聊天对话",
                    "claude-chat",
                    10,
                    &*CLAUDE_ZH
                ),
                (
                    "gpt-image-2 图像生成",
                    "gpt-image",
                    20,
                    &*GPT_IMG_ZH
                ),
                (
                    "gemini-3.1 图像生成",
                    "google-image",
                    30,
                    &*GOOGLE_IMG_ZH
                ),
                (
                    "doubao-seedream 图像生成",
                    "volc-image",
                    40,
                    &*VOLC_IMG_ZH
                ),
                (
                    "Seedance 视频生成",
                    "volc-video",
                    50,
                    &*VOLC_VID_ZH
                ),
                (
                    "Kling-v3 图像生成",
                    "kling-image",
                    60,
                    &*KLING_IMG_ZH
                ),
                (
                    "Kling-v3 视频生成",
                    "kling-video",
                    70,
                    &*KLING_VID_ZH
                )
            ]
        ),
        (
            "3. OpenAI 兼容协议",
            "openai",
            30,
            vec![
                (
                    "聊天与响应 (Completions & Responses)",
                    "chat-completions",
                    10,
                    "# 聊天与响应接口\n\n网关提供的聊天接口完全向下兼容 OpenAI 官方规范。无论您实际调用的模型底层是属于 OpenAI 官方，还是由 Google、Anthropic、阿里、火山等其他厂商提供，网关都会在后台智能完成请求格式转译和响应格式的标准化归一。\n\n### 1. 聊天对话接口 (Chat Completions)\n* **路径**: `/v1/chat/completions`\n* **请求方式**: `POST`\n\n#### 核心请求参数说明\n| 参数名 | 类型 | 必填 | 说明 |\n| :--- | :--- | :--- | :--- |\n| `model` | `string` | 是 | 目标模型名称，例如 `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini-1.5-pro` |\n| `messages` | `array` | 是 | 历史对话消息数组，如 `[{\"role\": \"user\", \"content\": \"你好\"}]` |\n| `stream` | `boolean` | 否 | 是否以 SSE 事件流（流式逐字返回）方式返回（默认 `false`） |\n| `temperature` | `number` | 否 | 采样温度 (0~2)，数值越高随机性越强，建议 `0.7` ~ `1.0` |\n| `max_tokens` | `integer` | 否 | 模型最大生成 Token 数量限制 |\n| `tools` | `array` | 否 | 模型可调用的工具（Function Calling）列表 |\n\n#### 终端调用示例 (Curl)\n```bash\ncurl -X POST https://{{domain}}/v1/chat/completions \\\n  -H \"Authorization: Bearer sk-your_token\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\n    \"model\": \"gpt-4o\",\n    \"messages\": [\n      {\"role\": \"system\", \"content\": \"You are a helpful assistant.\"},\n      {\"role\": \"user\", \"content\": \"请解释什么是量子纠缠。\"}\n    ],\n    \"stream\": false\n  }'\n```\n\n### 2. 响应透明透传接口 (Responses)\n* **路径**: `/v1/responses`\n* **请求方式**: `POST`\n\n> [!NOTE]\n> 如果您希望跳过网关的自动参数校验与协议转译，直接向底层的 OpenAI 或火山方舟模型发送官方原生的完整 Request Payload，可以使用 `/v1/responses` 接口。网关将无损地将请求体透传至上游通道，同时依然保障全局计费、配额限制及使用日志审计等平台核心功能。\n\n#### 请求示例\n```json\n{\n  \"model\": \"gpt-4o\",\n  \"input\": [\n    {\"role\": \"user\", \"content\": \"透传请求内容\"}\n  ],\n  \"stream\": false\n} \n```"
                ),
                (
                    "图像生成与编辑 (Images)",
                    "images",
                    20,
                    r#"# 图像生成与编辑接口

网关生图接口完美兼容 OpenAI 标准生图规范。系统后台集成了 Dall-E-3、Gemini Imagen、火山方舟、腾讯混元、阿里万相、即梦 AI 等多方主流图像生成通道，并自动进行各厂商特有参数的对齐和解析。

### 1. 图像生成 (Image Generations)
* **路径**: `/v1/images/generations`
* **请求方式**: `POST`

#### 主要请求参数说明
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 是 | 图像生成模型名，如 `dall-e-3` (OpenAI), `wanx-v1` (阿里万相), `seedream-5.0-lite` (即梦) |
| `prompt` | `string` | 是 | 描述画面的文本提示词 |
| `n` | `integer` | 否 | 期望生成的图片张数（默认 `1`）。网关将自动转换为上游原生的对应参数 |
| `size` | `string` | 否 | 分辨率（例如 `1024x1024`）。与 `resolution` 二选一，系统会自动将尺寸传译为对应厂商支持的标准规格 |
| `resolution` | `string` | 否 | 分辨率选项。与 `size` 功能相同，通常用于国内通道或视频通用接口的分辨率设置，系统将自动对齐转换 |
| `response_format` | `string` | 否 | 响应返回的图像格式，支持 `url` (直接返回图片 URL 链接，默认) 或 `b64_json` (返回 Base64 编码的图像数据) |
| `watermark` | `boolean` | 否 | 是否在图片上添加水印（支持火山、阿里百炼等部分通道） |
| `web_search` | `boolean` | 否 | 是否启用联网搜索（OpenAI 兼容布尔开关，默认 `false`）；网关会为火山方舟 Seedream 等通道自动转换 |
| `ratio` | `string` | 否 | 宽高比选项（如 `16:9`, `3:4`，主要用于 Gemini 等支持比例的生图模型） |
| `image` | `string / array` | 否 | 图生图参考图 URL 或 URL 数组 (OpenAI 协议扩展，可传入网络图片链接，支持单张或多张) |
| `image_urls` | `array` | 否 | 图生图参考图 URL 数组。用于指定多个参考图时使用，必须为数组格式 |

#### Curl 生图调用示例 (文生图)
```bash
curl -X POST https://{{domain}}/v1/images/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "一只在太空中漂浮的宇航员猫，写实赛博朋克风格",
    "size": "1024x1024",
    "n": 1
  }'
```

#### 返回示例 (直接返回图片 URL)
```json
{
  "created": 1719441600,
  "data": [
    {
      "url": "https://example.com/output/img_abc123.png"
    }
  ]
}
```

### 2. 图像编辑与局部重绘 (Image Edits)
* **路径**: `/v1/images/edits`
* **请求方式**: `POST`

支持传入底图（Image）与遮罩蒙版（Mask），配合提示词进行特定区域的擦除、修改与局部重绘。网关同时兼容并支持两种数据格式，底层会自动对齐上游接口要求：

#### A. 极简 JSON 传参方式 (直接传网络图片 URL)
这是网关为简化开发额外扩展的特性。您不需要处理繁琐的 multipart 文件流上传，可以直接在 JSON Payload 中传入图片的网络 URL。
*调用示例：*
```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "image": "https://example.com/assets/base_image.png",
    "mask": "https://example.com/assets/mask_image.png",
    "prompt": "在遮罩涂抹的区域加上一顶红色针织帽，并保持与背景环境光影一致",
    "size": "1024x1024",
    "n": 1
  }'
```

#### B. OpenAI 标准 Form-Data 传参方式 (上传本地二进制文件)
完全兼容 OpenAI 官方原生规范，适用于客户端直接上传本地图片的场景。
*调用示例：*
```bash
curl -X POST https://{{domain}}/v1/images/edits \
  -H "Authorization: Bearer sk-your_token" \
  -F "model=gpt-image-2" \
  -F "image=@/path/to/base_image.png" \
  -F "mask=@/path/to/mask_image.png" \
  -F "prompt=在遮罩涂抹的区域加上一顶红色针织帽，并保持与背景环境光影一致" \
  -F "size=1024x1024" \
  -F "n=1"
```

### 3. 图生图 (Image-to-Image) 与多图参考生图
在标准的 OpenAI 生图规范中，网关额外扩展并对齐了图生图和多图参考生成的参数支持。您可以通过 `image` 或 `image_urls` 传入参考底图。网关会自动根据底层不同的图片引擎做如下映射（本接口中指定类型的 `role` 参数均可使用 `type` 参数完全等价替代）：

* **单图图生图**（仅传入 1 张图片）：
  网关会将其自动包装并转发到各个通道的单图生图参数中（例如可灵的 `image`、火山的 `image`、阿里的 `input.messages.image` 以及 Google Gemini 的多模态 `inline_data` 中）。
  *调用示例：*
  ```json
  {
    "model": "kling-v3-image",
    "prompt": "将这只猫的毛发颜色变成金黄色，写实风格",
    "image": "https://example.com/assets/cat.png"
  }
  ```

* **多图/主体参考生图**（传入多张图片）：
  网关会将其归拢并映射到相应的多图参考协议（例如可灵 Omni 的 `image_list`、普通模型的 `subject_image_list`（主体参考）以及阿里的多图 messages 元素）。
  *调用示例：*
  ```json
  {
    "model": "kling-v3-image",
    "prompt": "将图一中的角色融入到图二的赛博朋克街景中",
    "image_urls": [
      "https://example.com/character.png",
      "https://example.com/background.png"
    ]
  }
  ```

* **显式图片角色声明 (可选)**：
  如果您想精准指明图片用途，可将元素传入为带 `role` 或等价的 `type` 字段的对象：
  *调用示例：*
  ```json
  {
    "model": "kling-v3-image",
    "prompt": "参考图一人物重绘画面",
    "image_urls": [
      {
        "url": "https://example.com/character.png",
        "type": "reference_image"
      }
    ]
  }
  ```
"#
                ),
                (
                    "视频生成接口 (Video)",
                    "video",
                    30,
                    r#"# 视频生成接口

随着视频大模型在 AIGC 领域的爆发，网关在标准的 OpenAI 协议框架下扩展了 `/v1/video/generations` 接口，为火山方舟、百炼万相、可灵 Kling AI、即梦 AI、Bytefor 等主流视频生成引擎提供了开箱即用的统一调用路径。视频模型大部分属于异步计算模式，因此调用过程分为**提交任务**与**轮询查询结果**两步。

### 1. 提交视频任务
* **路径**: `/v1/video/generations`
* **请求方式**: `POST`

#### 核心参数说明
| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `model` | `string` | 是 | 视频生成模型名称，如 `doubao-seedance-2-0`, `kling-v3-omni`, `wanx-v1` |
| `prompt` | `string` | 是 | 描述视频 motion 与画面的提示词文本 |
| `negative_prompt` | `string` | 否 | 负向提示词，用于规避不需要的画面元素 |
| `images` / `image_urls` | `array` | 否 | 参考底图对象/链接数组（`image_urls` 与 `images` 效果完全相同）。支持 HTTP URL 或 Base64。单张通常作为首帧，双张支持指定首尾帧，三张及以上用于多图参考（可灵/火山等） |
| `videos` | `array` | 否 | 参考视频链接数组，用于视频生成视频或视频控制（如可灵 Omni 视频参考/Bytefor 视频参考） |
| `audios` | `array` | 否 | 参考音频链接数组，用于提供配乐或参考音频（如火山方舟/Bytefor等） |
| `resolution` | `string` | 否 | 目标分辨率（如 `1080p`, `720p`, `480p`），系统会自动将尺寸传译并适配到对应厂商支持的规格（如可灵 `1080p` 自动映射为 `pro` 模式，`720p` 映射为 `std` 模式） |
| `ratio` | `string` | 否 | 宽高比选项（如 `16:9`, `9:16`, `4:3`, `3:4`, `1:1`），系统将自适应转换为对应厂商参数 |
| `duration` | `integer` | 否 | 生成视频时长（秒），例如 `5` 或 `10`。在即梦 AI 中会自动转换为帧数 `121` 或 `241` |
| `generate_audio` | `boolean` | 否 | 是否同步生成匹配的视频背景音效/配音（默认 `false`） |
| `watermark` | `boolean` | 否 | 是否在生成的视频中添加水印（支持火山方舟、阿里百炼等部分通道） |
| `web_search` | `boolean` | 否 | 是否启用联网搜索（OpenAI 兼容布尔开关，默认 `false`）。网关会为火山方舟 Seedance 等通道自动转换 |
| `seed` | `integer` | 否 | 随机数种子（用于控制视频生成的确定性） |

#### 提交任务示例
```bash
curl -X POST https://{{domain}}/v1/video/generations \
  -H "Authorization: Bearer sk-your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-v3-omni",
    "prompt": "推开欧式古典大门，展现眼前的奇幻云海城堡，航拍视角，4k 级细节",
    "resolution": "1080p",
    "duration": 5
  }'
```

#### 提交响应 (获取 Task ID)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

### 2. 轮询获取任务结果
* **路径**: `/v1/video/generations/{task_id}` 或 `/v1/tasks/{task_id}`
* **请求方式**: `GET`

#### 查询响应示例 (生成成功)
```json
{
  "id": "video_task_abc123xyz789",
  "task_id": "video_task_abc123xyz789",
  "status": "completed",
  "data": [
    {
      "url": "https://example.com/output/generated_video.mp4"
    }
  ]
}
```

### 3. 多模态图片（images）指定图片类型说明
在进行「图生视频」或「多图参考视频」时，网关提供了极具弹性的 OpenAI 兼容多模态接口。您可以通过 `images`（或 `image_urls`）参数输入单张或多张图片，并支持以下两种方式来指定图片在视频生成中的角色（如首帧、尾帧、参考图）：

#### ① 智能数量推断模式（极简模式）
如果您只传入**纯图片 URL 字符串列表**，网关将根据您传入的图片数量，自动智能推断其类型：
* **仅传入 1 张图片**：系统自动将其识别为**视频首帧（First Frame / Start Frame）**。
* **正好传入 2 张图片**：第一张图自动识别为**视频首帧**，第二张图自动识别为**视频尾帧（Last Frame / End Frame）**。
* **传入 3 张及以上图片**：全部自动识别为**多图参考图（Reference Image）**。

*调用示例：*
```json
{
  "model": "kling-v3-omni",
  "prompt": "画面从第一张图平滑过渡到第二张图的古风场景",
  "images": [
    "https://example.com/first_frame.png",
    "https://example.com/end_frame.png"
  ]
}
```

#### ② 显式角色声明模式（高级模式）
如果您想精确控制图片的角色，或在只传入 1 张图片时将其指定为尾帧或参考图，可以将数组元素写为**带有 `role`（或 `type`）字段的对象**：
* **首帧指定**：`"role": "first_frame"` 或 `"role": "first"`
* **尾帧指定**：`"role": "last_frame"`, `"role": "end_frame"`, `"role": "last"` 或 `"role": "tail"`
* **参考图指定**：`"role": "reference_image"`

*调用示例：*
```json
{
  "model": "doubao-seedance-2-0",
  "prompt": "一只奔跑的哈士奇",
  "images": [
    {
      "url": "https://example.com/dog_reference.png",
      "role": "reference_image"
    }
  ]
}
```
通过该种方式，网关将自动针对不同上游服务商（如火山 Seedance 的 content role、可灵的 image_tail/image_list、腾讯云的 FileInfos Usage）完成对应原生参数格式的适配与转译。"#
                ),
                (
                    "语音合成 (Text-to-Speech)",
                    "text-to-speech",
                    40,
                    "# 语音合成接口 (Text-to-Speech)\n\n语音合成（TTS）能够将您输入的文本转化为自然、流畅的人类声音音频流，网关接口与 OpenAI `/v1/audio/speech` 规范保持高度一致，并支持火山方舟等高级语音模型的自动编解码转译。\n\n### 1. 语音合成接口\n* **路径**: `/v1/audio/speech`\n* **请求方式**: `POST`\n\n#### 请求参数说明\n| 参数名 | 类型 | 必填 | 说明 |\n| :--- | :--- | :--- | :--- |\n| `model` | `string` | 是 | 语音合成模型名，如 `tts-1` (OpenAI), `seed-tts-2.0` (火山语音大模型) |\n| `input` | `string` | 是 | 待合成的文本内容，长度上限通常由具体模型规格决定 |\n| `voice` | `string` | 是 | 音色标识，如火山方舟需传入 speaker ID（例如 `zh_female_vv_uranus_bigtts`） |\n| `response_format` | `string` | 否 | 音频流返回格式，可选：`mp3` (默认), `opus`, `aac`, `flac`, `wav`, `pcm` |\n| `speed` | `number` | 否 | 语速调节倍数（`0.25` ~ `4.0`，默认 `1.0`） |\n\n#### 调用示例\n```bash\ncurl -X POST https://{{domain}}/v1/audio/speech \\\n  -H \"Authorization: Bearer sk-your_token\" \\\n  -H \"Content-Type: application/json\" \\\n  -o output.mp3 \\\n  -d '{\n    \"model\": \"seed-tts-2.0\",\n    \"input\": \"您好，欢迎使用统一智能语音合成系统，请在下方输入您希望合成的文本内容。\",\n    \"voice\": \"zh_female_vv_uranus_bigtts\",\n    \"response_format\": \"mp3\"\n  }'\n```\n\n> [!NOTE]\n> 网关在此接口中会返回纯二进制的音频数据流（HTTP 二进制响应，Content-Type 为 `audio/mpeg` 或对应的音频格式类型）。对于火山 TTS V3，网关会自动将 SSE 事件流中的 Base64 编码数据合并解码并转为二进制流返回，极大地降低了前端开发解析的门槛。"
                ),
                (
                    "余额与可用模型查询 (Info)",
                    "balance-models",
                    50,
                    "# 余额与模型查询接口\n\n为了方便客户端在运行时获取账户状态和令牌的剩余额度，网关提供了以下查询类 API：\n\n### 1. 查询当前令牌配额 (Token Balance)\n* **路径**: `/v1/balance`\n* **请求方式**: `GET`\n* **鉴权**: 需在请求头带上对应令牌 `Authorization: Bearer sk-xxx`\n\n#### 响应字段\n```json\n{\n  \"remain_balance\": 985.42,\n  \"used_balance\": 14.58,\n  \"unlimited_quota\": false\n}\n```\n*注：当令牌被设定为无限配额时，`remain_balance` 将返回 `-1`，且 `unlimited_quota` 返回 `true`。*\n\n### 2. 查询所属用户总账户余额 (User Balance)\n* **路径**: `/v1/user/balance`\n* **请求方式**: `GET`\n\n获取当前令牌所属的用户账户全局总额度（而非单个令牌的子配额限制）。\n\n### 3. 获取可用模型列表 (Models List)\n* **路径**: `/v1/models`\n* **请求方式**: `GET`\n\n列出当前系统为您的账号/等级开放的全部活跃模型列表，方便客户端下拉菜单直接渲染。\n\n#### 响应示例\n```json\n{\n  \"object\": \"list\",\n  \"data\": [\n    {\n      \"id\": \"gpt-4o\",\n      \"object\": \"model\",\n      \"created\": 1719441600,\n      \"owned_by\": \"OpenAI\"\n    },\n    {\n      \"id\": \"claude-3-5-sonnet-20241022\",\n      \"object\": \"model\",\n      \"created\": 1719441600,\n      \"owned_by\": \"Anthropic\"\n    }\n  ]\n}\n```"
                )
            ]
        ),
        (
            "4. 火山方舟原生协议",
            "volcengine-ark",
            40,
            vec![
                (
                    "火山方舟原生 API 接入",
                    "volcengine-api",
                    10,
                    "# 火山方舟 (Volcengine) 原生接口说明\n\n若您原有的业务系统已经接入了火山引擎火山方舟平台（Volcengine Ark），无需将代码重构为 OpenAI 格式，网关同样开辟了与火山原生路径完全对应的转发路由。您只需在请求头中将 API Key 替换为本平台分配的统一 API 密钥即可。\n\n### 1. 原生聊天与对话 (Chat & Responses)\n* **对话端点**: `/api/v3/chat/completions`\n* **原生响应端点**: `/api/v3/responses`\n* **请求方式**: `POST`\n\n支持火山方舟原生 Request Payload 的完整透传。有关参数规范请参考 [火山方舟官方文档](https://www.volcengine.com/docs/82379/1298454)。\n\n### 2. 原生生图接口 (Image Generations)\n* **端点**: `/api/v3/images/generations`\n* **请求方式**: `POST`\n\n完美对齐方舟文生图接口，支持指定图片宽高比、提示词智能改写、水印等原生参数。\n\n### 3. 原生视频生成任务 (Video Studio)\n* **提交任务**: `/api/v3/contents/generations/tasks` (`POST`)\n* **任务状态查询**: `/api/v3/contents/generations/tasks/{task_id}` (`GET`)\n* **取消/删除任务**: `/api/v3/contents/generations/tasks/{task_id}` (`DELETE`)\n* **列出任务历史**: `/api/v3/contents/generations/tasks` (`GET`)\n\n### 4. 语音合成接口 (TTS)\n* **事件流模式 (SSE)**: `/api/v3/tts/unidirectional/sse` (`POST`)\n* **非流式 HTTP 模式**: `/api/v3/tts/unidirectional` (`POST`)\n\n请求头需采用火山原生的 `X-Api-Key: sk-your_token` 形式，模型可用 `X-Api-Resource-Id` 头指定或写在 `model` 请求体中。网关将返回火山标准的 JSON 数据（包含 Base64 编码的音频帧）。"
                ),
                (
                    "火山 MediaKit 媒体处理增强",
                    "volcengine-mediakit",
                    20,
                    include_str!("default_docs/zh/volcengine-mediakit.md")
                ),
                (
                    "火山素材库接口的接入和使用",
                    "volcengine-assets-guide",
                    30,
                    include_str!("default_docs/zh/volcengine-assets.md")
                )
            ]
        ),
        (
            "5. 阿里百炼与可灵协议",
            "ali-kling",
            50,
            vec![
                (
                    "阿里百炼 (DashScope) 原生接入",
                    "ali-dashscope",
                    10,
                    "# 阿里百炼 (DashScope) 原生接口说明\n\n网关全面兼容阿里云百炼（DashScope）大模型及图像、视频模型原生接口路由，支持完整的状态提取与计费审计。\n\n### 1. 万相视频生成 (Submit Video)\n* **路径**: `/api/v1/services/aigc/video-generation/video-synthesis`\n* **请求方式**: `POST`\n\n#### 请求示例\n```json\n{\n  \"model\": \"wanx-v1\",\n  \"input\": {\n    \"prompt\": \"一只金毛寻回犬在金色的秋天落叶中奔跑\"\n  },\n  \"parameters\": {\n    \"resolution\": \"1280*720\",\n    \"duration\": 5\n  }\n} \n```\n网关自动拦截并注入 `X-DashScope-Async: enable` 请求头，实现异步任务的自动托管提交。\n\n### 2. 万相图像生成 (Submit Image)\n* **路径**: `/api/v1/services/aigc/multimodal-generation/generation`\n* **请求方式**: `POST`\n\n格式类似于视频，支持直接透传 seed、size 等厂商特有控制参数。\n\n### 3. 异步任务状态查询\n* **路径**: `/api/v1/tasks/{task_id}`\n* **请求方式**: `GET`\n\n阿里万相视频、图片均采用百炼统一的异步任务 ID。您可使用原生 `task_id` 进行轮询，网关在状态变更为 `succeeded` 或 `failed` 后提取相应的使用量进行计费扣除。\n\n### 4. 文本向量化 (Embeddings) 与 Rerank\n* **向量化接口**: `/compatible-mode/v1/embeddings` (`POST`)\n  支持通义千问官方向量化模型（如 `text-embedding-v4`），按总 Token 数量计费。\n* **文档重排接口 (Rerank)**:\n  * 兼容路径（用于 qwen3-rerank 等）: `/compatible-api/v1/reranks`\n  * 原生路径（用于 gte-rerank-v2 等）: `/api/v1/services/rerank/text-rerank/text-rerank`"
                ),
                (
                    "可灵 AI (Kling) 原生接入",
                    "kling-ai",
                    20,
                    "# 可灵 AI (Kling) 原生协议说明\n\n可灵 AI 凭借极高水准的视频画质与运动控制获得了广泛使用。网关开辟了专门的 Kling 路由，全面对齐可灵官方 API。 \n\n### 1. 视频模型接口\n* **文生视频**: `/v1/videos/text2video` (`POST`)\n* **图生视频**: `/v1/videos/image2video` (`POST`)\n* **多图生视频**: `/v1/videos/multi-image2video` (`POST`)\n* **Omni 视频参考生视频**: `/v1/videos/omni-video` (`POST`)\n* **任务状态查询**: `/v1/videos/{endpoint}/{task_id}` (`GET`)\n\n*注：在查询接口中，`{endpoint}` 对应您提交任务时所用的服务类型（如 `text2video`、`image2video` 等）。*\n\n### 2. 图像模型接口\n* **标准文/图生图**: `/v1/images/generations` (`POST`)\n* **多图生图**: `/v1/images/multi-image2image` (`POST`)\n* **Omni 生图**: `/v1/images/omni-image` (`POST`)\n* **任务状态查询**: `/v1/images/{endpoint}/{task_id}` (`GET`)\n\n### 3. 可灵官方文档参考\n详细的请求载荷结构（例如 `camera_control` 镜头控制、`aspect_ratio` 比例控制、首尾帧图片等）请对照官方标准。您可以从这里跳转官方文档说明：\n* [可灵 OmniVideo 官方规范](https://klingai.com/document-api/apiReference/model/OmniVideo)\n* [可灵 OmniImage 官方规范](https://klingai.com/document-api/apiReference/model/OmniImage)"
                )
            ]
        ),
        (
            "6. Google 与 Anthropic 协议",
            "google-anthropic",
            60,
            vec![
                (
                    "Google Gemini 原生接入",
                    "google-gemini",
                    10,
                    "# Google Gemini 原生接口说明\n\n如果您使用 Google 官方 SDK，或希望跳过协议转换层以使用 Gemini 原生的 Multi-modal、System Instruction 或 JSON Mode，可直接调用网关的 Google 原生路由。\n\n### 1. 文本生成 (Non-stream)\n* **路径**: `/v1beta/models/{model}:generateContent`\n* **请求方式**: `POST`\n\n### 2. 流式生成 (Streaming)\n* **路径**: `/v1beta/models/{model}:streamGenerateContent`\n* **请求方式**: `POST`\n\n#### 核心请求载荷示例\n```json\n{\n  \"contents\": [\n    {\n      \"role\": \"user\",\n      \"parts\": [\n        {\n          \"text\": \"请扮演我的私人旅行助手，规划一份 3 天的京都赏樱路线。\"\n        }\n      ]\n    }\n  ],\n  \"systemInstruction\": {\n    \"parts\": [\n      {\n        \"text\": \"你是一个专业的旅行规划师，语气亲切幽默。\"\n      }\n    ]\n  },\n  \"generationConfig\": {\n    \"temperature\": 0.4,\n    \"maxOutputTokens\": 2000,\n    \"responseMimeType\": \"text/plain\"\n  }\n}\n```\n\n#### 鉴权方式（三选一）\n* 标准头: `Authorization: Bearer sk-your_token`\n* Google 头: `X-Goog-Api-Key: sk-your_token`\n* URL 尾部参数: `?key=sk-your_token`"
                ),
                (
                    "Anthropic Claude 原生接入",
                    "anthropic-claude",
                    20,
                    "# Anthropic Claude 原生接口说明\n\n网关支持 Anthropic 官方 Messages API 的直接调用，您可以直接发送原生 Payload 呼叫 Claude 系列模型（如 `claude-3-5-sonnet-20241022`）。\n\n### 1. 消息生成对话 (Messages API)\n* **请求路径**: `/v1/messages`\n* **请求方式**: `POST`\n\n#### 核心请求参数说明\n* **model** (string, 必填)\n  指定 Claude 模型名，如 `claude-3-5-sonnet-20241022`。\n* **messages** (array, 必填)\n  历史对话数据数组，结构如 `[{\"role\": \"user\", \"content\": \"你好\"}]`。\n* **max_tokens** (integer, 必填)\n  生成的最大 Token 限制。注意：Anthropic 官方协议要求此参数必须填写。\n* **system** (string, 可选)\n  系统提示词（System Prompt），用于设定模型的角色和行为。\n* **stream** (boolean, 可选)\n  是否以 SSE（Server-Sent Events）流式格式返回。可选值为 `true` 或 `false`。\n* **temperature** (number, 可选)\n  采样温度，介于 `0.0` 到 `1.0` 之间。\n\n#### 调用示例 (Curl)\n```bash\ncurl -X POST https://{{domain}}/v1/messages \\\n  -H \"x-api-key: sk-your_token\" \\\n  -H \"anthropic-version: 2023-06-01\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\n    \"model\": \"claude-3-5-sonnet-20241022\",\n    \"max_tokens\": 1024,\n    \"messages\": [\n      {\"role\": \"user\", \"content\": \"你好，请用一句话描述你自己的核心特征。\"}\n    ]\n  }'\n```\n\n### 2. 接口鉴权方式\n调用原生 Claude 接口时，网关支持以下两种鉴权请求头：\n1. **统一 Bearer Token 鉴权 (推荐)**:\n   ```http\n   Authorization: Bearer sk-your_token\n   ```\n2. **Anthropic 官方 API Key 键**:\n   ```http\n   x-api-key: sk-your_token\n   ```"
                )
            ]
        ),
        (
            "7. 错误码排查",
            "errors",
            70,
            vec![
                (
                    "网关常见错误码与排查",
                    "error-codes",
                    10,
                    "# 常见错误码与问题排查\n\n在使用 API 网关访问大模型服务时，如果请求发生异常，网关会通过相应的 HTTP 状态码（Status Code）以及符合 OpenAI 标准规范 of JSON 错误响应体返回给客户端。\n\n### 1. 统一错误响应格式\n当请求出错时，网关一律返回标准的 JSON 格式错误体：\n```json\n{\n  \"error\": {\n    \"message\": \"错误原因详细描述...\",\n    \"type\": \"invalid_request_error\",\n    \"code\": \"context_length_exceeded\",\n    \"param\": null\n  }\n}\n```\n\n### 2. 状态码与故障排查指南\n\n* **400 Bad Request (请求格式非法)**\n  * **可能诱因**: 请求载荷（Payload）不是合法的 JSON；缺少必填参数（如 `model` 或 `messages`）；参数类型不正确。\n  * **排查方法**: 检查发送 of HTTP 请求 Body，对齐厂商接口标准参数（如 `max_tokens` 等）排查字段拼写。\n\n* **401 Unauthorized (未授权/身份验证失败)**\n  * **可能诱因**: 请求头未附带 `Authorization` 或 Bearer Token 缺失；密钥（Token）无效或已被系统删除；Token 字符串有空格、换行或多余后缀。\n  * **排查方法**: 确认请求头格式为 `Authorization: Bearer sk-xxxxx`，并检查管理后台该令牌是否激活。\n\n* **403 Forbidden (无权限/额度受限)**\n  * **可能诱因**: 令牌可用配额（Quota）或用户可用余额已耗尽；当前令牌没有勾选调用当前请求模型的权限；令牌已被管理员或系统禁用。\n  * **排查方法**: 登录系统前台查看令牌余额；在令牌列表中检查“可用模型列表”是否包含当前请求的模型。\n\n* **404 Not Found (接口或路由不存在)**\n  * **可能诱因**: 请求 of URL 路径拼写错误；调用的模型未在后台配置任何有效的“上游渠道”；底层绑定的渠道节点全部被置为“禁用”状态。\n  * **排查方法**: 检查调用路径（如 `/v1/chat/completions`）；确认后台该模型已关联活跃渠道。\n\n* **429 Too Many Requests (触发限频/频控)**\n  * **可能诱因**: 触发了令牌 of 限频限制（RPM / TPM）；触发了底层渠道对应上游服务商 of 官方频控阈值。\n  * **排查方法**: 在代码端增加指数退避重试逻辑；确认令牌限频设置或联系管理员提升频控限制。\n\n* **500 Internal Error (网关内部异常)**\n  * **可能诱因**: 网关数据库连接断开或超时；平台内部发生未捕获 of 代码 Panic 异常。\n  * **排查方法**: 联系系统管理员，查看后端服务容器日志以定位异常原因。\n\n* **502 Bad Gateway (上游渠道服务不可用)**\n  * **可能诱因**: 上游官方端点（如 `api.openai.com`）连接超时或网络中断；上游官方账户欠费或模型被官方弃用。\n  * **排查方法**: 查阅返回 of JSON 响应体中 of `message` 细节，测试后台渠道可用性，排除渠道端网络或上游欠费问题。\n\n* **504 Gateway Timeout (网关响应超时)**\n  * **可能诱因**: 请求 of 模型生成耗时极长，导致 HTTP 连接超时。\n  * **排查方法**: 对于视频生成或画质超分等极度耗时 of 任务，使用异步接口（如 `/v1/video/generations`）提交，随后通过轮询任务状态接口获取结果。\n\n### 3. 智能健康度与重试机制\n1. **故障重试**: 当您的模型在通道 A 发生 502/网络连接超时等不可用情况时，网关若配置了多渠道，将自动切换至备用渠道 B 进行静默重试，整个过程对调用端完全透明。\n2. **日志审计**: 无论成功还是失败，您的每一次请求 of 耗时、扣费、IP、请求/响应 Payload 等，均会完整沉淀到您的使用日志中，帮助迅速追踪异常原因。"
                )
            ]
        ),
        (
            "8. 站点功能API",
            "site-api",
            80,
            vec![
                (
                    "站点 API 概述与认证方式",
                    "site-api-overview",
                    10,
                    "# 站点 API 概述与认证方式\n\n欢迎使用 TokensByte 平台站点功能 API。除了通过统一的 AI 路由调用各大模型厂商外，系统还向开发者开放了管理 API，用于集成或二次开发，以管理 API 令牌、查询使用日志、用户钱包及状态等。\n\n### 1. 接口基础地址 (Base URL)\n所有站点功能 API 的基准请求地址为：\n```bash\nhttps://{{domain}}/api/v1\n```\n*注：公共路由与登录接口同样位于 `/api/v1` 目录下。*\n\n### 2. 身份认证机制\n除公开或注册接口外，所有站点管理 API 均需要经过严格的 JSON Web Token (JWT) 身份校验。请按以下流程进行认证：\n\n#### 第一步：登录并获取临时 JWT 令牌\n* **请求路径**: `/api/v1/auth/login`\n* **请求方式**: `POST`\n* **请求体示例**:\n```json\n{\n  \"username\": \"您的用户名或邮箱\",\n  \"password\": \"您的登录密码\",\n  \"login_type\": \"username\"\n}\n```\n* `login_type` 为可选字段，可选值为 `\"username\"`、`\"email\"` 或 `\"mobile\"`。默认为 `\"username\"`。\n\n* **响应体示例**:\n```json\n{\n  \"token\": \"eyJhbGciOi...\",\n  \"user\": {\n    \"id\": \"1\",\n    \"username\": \"user1\",\n    \"role\": \"user\",\n    \"email\": \"user@example.com\",\n    \"is_active\": 1\n  }\n}\n```\n\n#### 第二步：在 HTTP 请求头部携带 JWT 令牌\n在后续所有需要鉴权的 API 请求中，于 HTTP 请求头部添加标准的 Authorization 令牌：\n```http\nAuthorization: Bearer 您的_JWT_token_字符串\n```\n\n> [!IMPORTANT]\n> 此 JWT 令牌具有一定的时效性，主要用于前端交互或短期集成。若您需要用于持续请求大模型，请使用 **API 令牌 (Token)** 管理接口来创建和使用长期静态 Key。"
                ),
                (
                    "用户与钱包 API",
                    "site-api-user",
                    20,
                    "# 用户与钱包 API\n\n您可以使用这些接口获取已登录用户的个人基本信息、查询钱包余额与消费统计、查看充值历史记录，或提取/划转推荐收益佣金。\n\n### 1. 获取个人资料 (Profile)\n* **路径**: `/api/v1/user/profile`\n* **请求方式**: `GET`\n* **响应体示例**:\n```json\n{\n  \"id\": \"1\",\n  \"username\": \"user1\",\n  \"email\": \"user@example.com\",\n  \"mobile\": \"13800000000\",\n  \"role\": \"user\",\n  \"user_group\": \"default\",\n  \"is_active\": 1,\n  \"created_at\": \"2026-06-01T12:00:00Z\"\n}\n```\n\n### 2. 获取钱包统计与余额 (Wallet)\n* **路径**: `/api/v1/user/wallet`\n* **请求方式**: `GET`\n* **响应体示例**:\n```json\n{\n  \"balance\": 500.00,\n  \"spent\": 24.50,\n  \"affiliate_commission\": 15.00,\n  \"user_level\": \"VIP 1\",\n  \"discount_rate\": 0.95\n}\n```\n\n### 3. 获取充值历史记录\n* **路径**: `/api/v1/user/recharge_records`\n* **请求方式**: `GET`\n* **响应体示例**:\n```json\n{\n  \"data\": [\n    {\n      \"id\": \"1001\",\n      \"amount\": 100.00,\n      \"method\": \"wechat\",\n      \"status\": \"success\",\n      \"created_at\": \"2026-06-15T09:30:00Z\"\n    }\n  ],\n  \"total\": 1\n}\n```\n\n### 4. 提取/划转佣金\n将推荐注册/消费产生的高额佣金收益，划转提取至您的账户余额用于消费。\n* **路径**: `/api/v1/user/affiliate/transfer`\n* **请求方式**: `POST`\n* **请求体示例**:\n```json\n{\n  \"amount\": 10.00\n}\n```\n* **响应体示例**:\n```json\n{\n  \"message\": \"Commission transferred successfully\",\n  \"new_balance\": 510.00,\n  \"remaining_commission\": 5.00\n}\n```"
                ),
                (
                    "令牌与使用日志 API",
                    "site-api-tokens-logs",
                    30,
                    "# 令牌与使用日志 API\n\n用于对您名下了 API 令牌（API Keys）进行增删改查，以及查询大模型调用日志或异步任务执行状态。\n\n### 1. 查询令牌列表\n* **路径**: `/api/v1/tokens`\n* **请求方式**: `GET`\n* **响应体示例**:\n```json\n{\n  \"data\": [\n    {\n      \"id\": 5,\n      \"name\": \"测试Key\",\n      \"kid\": \"usr123987\",\n      \"quota_limit\": 1000.0,\n      \"used_quota\": 5.23,\n      \"is_active\": 1,\n      \"created_at\": \"2026-06-20T10:00:00Z\"\n    }\n  ],\n  \"total\": 1\n}\n```\n\n### 2. 创建 API 令牌\n* **路径**: `/api/v1/tokens`\n* **请求方式**: `POST`\n* **请求体参数说明**:\n  * `name`: 令牌名称 (长度限24字内)\n  * `quota_limit`: 额度上限 (可选，为空表示无限)\n  * `allowed_models`: 允许调用的模型列表 (可选，`[\"gpt-4o\"]`)\n  * `allowed_ips`: 绑定的白名单 IP (可选，逗号分隔)\n  * `rps_limit` / `rpm_limit`: 每秒/每分钟请求限频 (可选)\n* **请求体示例**:\n```json\n{\n  \"name\": \"生图Key\",\n  \"quota_limit\": 500.0,\n  \"allowed_models\": [\"gpt-4o\", \"claude-3-5-sonnet-20241022\"],\n  \"allowed_ips\": \"192.168.1.1,10.0.0.1\",\n  \"rps_limit\": 10,\n  \"rpm_limit\": 100\n}\n```\n* **响应体示例**:\n```json\n{\n  \"id\": 6,\n  \"name\": \"生图Key\",\n  \"token_key\": \"sk-ProjX82...\",\n  \"quota_limit\": 500.0,\n  \"is_active\": 1\n}\n```\n*注：新令牌的完整明文 Key (`token_key`) 仅在创建成功时返回一次。*\n\n### 3. 查看令牌密钥明文 (Reveal)\n* **路径**: `/api/v1/tokens/{id}/reveal`\n* **请求方式**: `POST`\n* **响应体示例**:\n```json\n{\n  \"token_key\": \"sk-your_full_api_key_value_here\"\n}\n```\n\n### 4. 删除 API 令牌\n* **路径**: `/api/v1/tokens/{id}`\n* **请求方式**: `DELETE`\n\n### 5. 查询大模型使用日志\n* **路径**: `/api/v1/logs`\n* **请求方式**: `GET`\n* **常用 Query 参数**: `page`, `per_page`, `model`, `status` (`success`/`fail`), `start_date`, `end_date`\n* **响应体示例**:\n```json\n{\n  \"data\": [\n    {\n      \"log_id\": \"log_xyz123\",\n      \"model\": \"gpt-4o\",\n      \"prompt_tokens\": 15,\n      \"completion_tokens\": 20,\n      \"cost\": 0.0007,\n      \"status_code\": 200,\n      \"created_at\": \"2026-06-21T15:20:00Z\"\n    }\n  ],\n  \"total\": 1,\n  \"total_cost\": 0.0007,\n  \"success_count\": 1,\n  \"fail_count\": 0\n}\n```\n\n### 6. 查询异步任务日志 (视频/画质等)\n* **路径**: `/api/v1/task_logs`\n* **请求方式**: `GET`\n* **接口操作**: 支持调用 `POST /api/v1/task_logs/{log_id}/sync` 手动同步任务状态，或 `POST /api/v1/task_logs/{log_id}/cancel` 取消执行中的异步任务。"
                )
            ]
        )
    ]
}

/// 仅初始化火山素材库文档（供数据库迁移升级使用，避免全量 TRUNCATE 丢失自定义文档）
pub async fn seed_volcengine_assets_docs_only(
    pool: &sqlx::Pool<sqlx::Postgres>,
) -> Result<(), sqlx::Error> {
    let parent_id_opt: Option<i32> =
        sqlx::query_scalar("SELECT id FROM plugin_docs WHERE slug = 'volcengine-ark'")
            .fetch_optional(pool)
            .await?;

    let parent_id = match parent_id_opt {
        Some(id) => id,
        None => return Ok(()),
    };

    let art_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM plugin_docs WHERE slug = 'volcengine-assets-guide'",
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    if art_exists > 0 {
        return Ok(());
    }

    // 1. 插入文章
    let art_id: i32 = sqlx::query_scalar(
        "INSERT INTO plugin_docs (parent_id, title, content, is_dir, sort_order, is_active, slug, created_at, updated_at) \
         VALUES ($1, '关于火山素材库接口的接入和使用', $2, 0, 30, 1, 'volcengine-assets-guide', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id"
    )
    .bind(parent_id)
    .bind(include_str!("default_docs/zh/volcengine-assets.md"))
    .fetch_one(pool)
    .await?;

    // 2. 插入文章翻译
    let art_trans = vec![
        (
            "en",
            "Volcengine Material Library API Integration Guide",
            include_str!("default_docs/en/volcengine-assets.md"),
        ),
        (
            "ja",
            "Volcengine Ark 素材ライブラリ API 連携ガイド",
            include_str!("default_docs/ja/volcengine-assets.md"),
        ),
        (
            "ko",
            "Volcengine Ark Material Library API Integration Guide",
            include_str!("default_docs/ko/volcengine-assets.md"),
        ),
        (
            "vi",
            "Volcengine Ark Material Library API Integration Guide",
            include_str!("default_docs/vi/volcengine-assets.md"),
        ),
    ];
    for (lang, title, content) in art_trans {
        let _ = sqlx::query(
            "INSERT INTO plugin_docs_intl (doc_id, lang, title, content, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(art_id)
        .bind(lang)
        .bind(title)
        .bind(content)
        .execute(pool)
        .await?;
    }

    Ok(())
}
