use crate::{
    auth,
    error::{AppError, AppResult},
    AppState,
};
use axum::{
    extract::{Extension, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

/// 管理端路由（需认证）
pub fn admin_router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/portal-config",
            get(get_portal_config).post(save_portal_config),
        )
        .route("/generate", post(generate_static))
        .route("/generate-status", get(get_generate_status))
        .route("/preview", get(preview_portal))
}

/// 公开 API 路由（无需认证，供门户前端 JS 调用）
pub fn public_api_router() -> Router<Arc<AppState>> {
    Router::new().route("/models", get(get_portal_models))
}

/// 门户页面路由（公开，无需认证，直接渲染 HTML）
pub fn portal_pages_router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(page_home))
        .route("/models", get(page_models))
        .route("/model/{mid}", get(page_model_detail))
        .route("/contact", get(page_contact))
        .route("/about", get(page_about))
}

// ─── 公开页面渲染 ───

async fn render_public_page(
    state: &AppState,
    page: &str,
    current_mid: Option<String>,
) -> Result<axum::response::Html<String>, AppError> {
    // 检查插件是否启用
    let enabled: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'site_portal'"),
    )
    .fetch_optional(&state.db.pool)
    .await?;
    if enabled != Some(1) {
        return Ok(axum::response::Html(
            "<html><body style='background:#09090b;color:#fafafa;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh'><h1>门户未启用</h1></body></html>".to_string()
        ));
    }

    let configs = load_configs(state).await?;
    let mut portal_data = build_portal_data(state, &configs).await?;
    portal_data.insert("current_page", &page);
    if let Some(mid) = current_mid {
        portal_data.insert("current_mid", &mid);
    }

    let mut tera = tera::Tera::default();
    register_templates(&mut tera);

    let html = render_page(&tera, page, &portal_data)?;
    Ok(axum::response::Html(html))
}

async fn page_home(
    State(state): State<Arc<AppState>>,
) -> Result<axum::response::Html<String>, AppError> {
    // 检查插件是否启用
    let enabled: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'site_portal'"),
    )
    .fetch_optional(&state.db.pool)
    .await?;
    if enabled != Some(1) {
        return Ok(axum::response::Html(
            "<html><body style='background:#09090b;color:#fafafa;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh'><h1>门户未启用</h1></body></html>".to_string()
        ));
    }

    // 检查自定义主页配置
    let configs = load_configs(&state).await?;
    let custom_hp: serde_json::Value = configs
        .get("custom_homepage")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({ "enabled": false, "html": "" }));
    let hp_enabled = custom_hp["enabled"].as_bool().unwrap_or(false);
    let hp_html = custom_hp["html"].as_str().unwrap_or("");

    if hp_enabled && !hp_html.is_empty() {
        return Ok(axum::response::Html(hp_html.to_string()));
    }

    render_public_page(&state, "home", None).await
}
async fn page_models(
    State(state): State<Arc<AppState>>,
) -> Result<axum::response::Html<String>, AppError> {
    render_public_page(&state, "models", None).await
}
async fn page_model_detail(
    State(state): State<Arc<AppState>>,
    axum::extract::Path(mid): axum::extract::Path<String>,
) -> Result<axum::response::Html<String>, AppError> {
    render_public_page(&state, "model_detail", Some(mid)).await
}
async fn page_contact(
    State(state): State<Arc<AppState>>,
) -> Result<axum::response::Html<String>, AppError> {
    render_public_page(&state, "contact", None).await
}
async fn page_about(
    State(state): State<Arc<AppState>>,
) -> Result<axum::response::Html<String>, AppError> {
    render_public_page(&state, "about", None).await
}

// ─── 辅助 ───

async fn require_admin(state: &AppState, claims: &auth::Claims) -> Result<(), AppError> {
    let role: String =
        sqlx::query_scalar(&state.db.format_query("SELECT role FROM users WHERE id = ?"))
            .bind(&claims.sub)
            .fetch_one(&state.db.pool)
            .await
            .map_err(|_| AppError::Unauthorized)?;
    if role != "admin" {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

async fn load_configs(
    state: &AppState,
) -> Result<std::collections::HashMap<String, String>, sqlx::Error> {
    crate::api::plugins::load_plugin_configs_pub(state, "site_portal").await
}

async fn upsert(state: &AppState, key: &str, value: &str) -> Result<(), sqlx::Error> {
    let result = sqlx::query(
        &state.db.format_query("UPDATE plugin_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE plugin_name = 'site_portal' AND config_key = ?")
    ).bind(value).bind(key).execute(&state.db.pool).await?;
    if result.rows_affected() == 0 {
        sqlx::query(
            &state.db.format_query("INSERT INTO plugin_configs (plugin_name, config_key, config_value) VALUES ('site_portal', ?, ?)")
        ).bind(key).bind(value).execute(&state.db.pool).await?;
    }
    Ok(())
}

// ─── 获取门户配置 ───

async fn get_portal_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;
    let configs = load_configs(&state).await?;

    Ok(Json(json!({
        "nav_config": configs.get("nav_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "logo_url": "",
            "logo_text": "TokensByte",
            "logo_link": "/home",
            "items": [
                {"label": "首页|Home", "path": "/home", "enabled": true, "key": "home", "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-home\" style=\"margin-right:4px;opacity:0.8\"><path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>"},
                {"label": "模型数据|Models", "path": "/home/models", "enabled": true, "key": "models", "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-database\" style=\"margin-right:4px;opacity:0.8\"><ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5V19A9 3 0 0 0 21 19V5\"/><path d=\"M3 12A9 3 0 0 0 21 12\"/></svg>"},
                {"label": "联系我们|Contact Us", "path": "/home/contact", "enabled": true, "key": "contact", "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-message-square\" style=\"margin-right:4px;opacity:0.8\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/></svg>"},
                {"label": "关于我们|About Us", "path": "/home/about", "enabled": true, "key": "about", "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-book-open\" style=\"margin-right:4px;opacity:0.8\"><path d=\"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\"/><path d=\"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z\"/></svg>"}
            ],
            "cta_text": "登录",
            "cta_link": "/login",
            "register_text": "免费注册",
            "register_link": "/register"
        })),
        "home_config": configs.get("home_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "hero_title": "一个接口，调用全球数百个 AI 模型",
            "hero_subtitle": "OpenAI 兼容格式，极速接入 GPT-4o、Claude、DeepSeek、Gemini 等主流模型。按量付费，零门槛开始。",
            "hero_bg_image": "",
            "hero_cta_text": "免费开始使用",
            "hero_cta_link": "/register",
            "features": [
                {
                    "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22v-5\"/><path d=\"M9 8V2\"/><path d=\"M15 8V2\"/><path d=\"M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z\"/></svg>",
                    "title": "一键极速接入",
                    "description": "OpenAI 兼容 API 格式，只需修改 Base URL 和 Key，即可无缝替换至数百个主流模型，零代码成本迁移。"
                },
                {
                    "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/></svg>",
                    "title": "全球模型全面覆盖",
                    "description": "聚合 OpenAI、Anthropic、Google Gemini、DeepSeek、字节跳动火山引擎等数十家顶级服务商的模型矩阵。"
                },
                {
                    "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4z\"/></svg>",
                    "title": "智能分流与高可用",
                    "description": "全球边缘节点路由，支持在主渠道高负载或故障时自动无感容灾重试，首字耗时降至毫秒级。"
                },
                {
                    "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/></svg>",
                    "title": "极致安全数据脱敏",
                    "description": "支持 IP 白名单防刷保护，端到端高强度加密传输，异步任务与计费明细日志支持 Base64 数据隐私脱敏。"
                }
            ],
            "api_base_url": "",
            "cta_title": "准备好开始构建了吗？",
            "cta_description": "只需 3 分钟即可获取您的 API 密钥并开始创新。基础 URL：https://api.artsapi.com/api，零成本平滑迁移。",
            "cta_primary_btn_text": "开始对话",
            "cta_primary_btn_link": "https://api.artsapi.com",
            "cta_secondary_btn_text": "阅读文档",
            "cta_secondary_btn_link": "https://docs.artsapi.com"
        })),
        "columns_config": configs.get("columns_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "models": { "title": "模型数据", "path": "models", "enabled": true },
            "contact": {
                "title": "联系我们",
                "path": "contact",
                "enabled": true,
                "content": {
                    "items": [
                        {
                            "icon": "<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM12.0606 11.6829L5.64722 6.2377L4.35278 7.7623L12.0731 14.3171L19.6544 7.75616L18.3456 6.24384L12.0606 11.6829Z'/></svg>",
                            "title": "邮箱",
                            "value": "bubyday@qq.com"
                        },
                        {
                            "icon": "<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M21 16.42V19.9561C21 20.4811 20.5941 20.9167 20.0705 20.9537C19.6331 20.9846 19.2763 21 19 21C10.1634 21 3 13.8366 3 5C3 4.72371 3.01545 4.36687 3.04635 3.9295C3.08337 3.40588 3.51894 3 4.04386 3H7.5801C7.83678 3 8.05176 3.19442 8.07753 3.4498C8.10067 3.67907 8.12218 3.86314 8.14207 4.00202C8.34435 5.41472 8.75753 6.75936 9.3487 8.00303C9.44359 8.20265 9.38171 8.44159 9.20185 8.57006L7.04355 10.1118C8.35752 13.1811 10.8189 15.6425 13.8882 16.9565L15.4271 14.8019C15.5572 14.6199 15.799 14.5573 16.001 14.6532C17.2446 15.2439 18.5891 15.6566 20.0016 15.8584C20.1396 15.8782 20.3225 15.8995 20.5502 15.9225C20.8056 15.9483 21 16.1633 21 16.42Z'/></svg>",
                            "title": "电话",
                            "value": "1388888888"
                        },
                        {
                            "icon": "<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M18.364 17.364L12 23.7279L5.63604 17.364C2.12132 13.8492 2.12132 8.15076 5.63604 4.63604C9.15076 1.12132 14.8492 1.12132 18.364 4.63604C21.8787 8.15076 21.8787 13.8492 18.364 17.364ZM12 15C14.2091 15 16 13.2091 16 11C16 8.79086 14.2091 7 12 7C9.79086 7 8 8.79086 8 11C8 13.2091 9.79086 15 12 15ZM12 13C10.8954 13 10 12.1046 10 11C10 9.89543 10.8954 9 12 9C13.1046 9 14 9.89543 14 11C14 12.1046 13.1046 13 12 13Z'/></svg>",
                            "title": "地址",
                            "value": "深圳市南山区"
                        }
                    ],
                    "social_links": []
                }
            },
            "about":   { "title": "关于我们", "path": "about", "enabled": true, "content": "" }
        })),
        "footer_config": configs.get("footer_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "copyright": "",
            "icp_number": "",
            "description": "OpenAI 兼容格式，极速接入主流模型。按量付费，零门槛开始。",
            "links": []
        })),
        "custom_scripts": configs.get("custom_scripts").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "customer_service": "",
            "analytics": ""
        })),
        "seo_config": configs.get("seo_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "meta_title": "",
            "meta_description": "",
            "meta_keywords": ""
        })),
        "style_config": configs.get("style_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "current_style": "classic"
        })),
        "static_gen_config": configs.get("static_gen_config").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "manual_mode": false
        })),
        "generate_log": configs.get("generate_log").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!([])),
        "custom_homepage": configs.get("custom_homepage").and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok()).unwrap_or(json!({
            "enabled": false,
            "html": ""
        })),
    })))
}

// ─── 保存门户配置 ───

#[derive(Deserialize)]
struct SavePortalRequest {
    section: String,
    data: serde_json::Value,
}

async fn save_portal_config(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<SavePortalRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let key = match payload.section.as_str() {
        "nav" => "nav_config",
        "home" => "home_config",
        "columns" => "columns_config",
        "footer" => "footer_config",
        "scripts" => "custom_scripts",
        "seo" => "seo_config",
        "style" => "style_config",
        "static_gen" => "static_gen_config",
        "custom_homepage" => "custom_homepage",
        _ => {
            return Err(AppError::BadRequest(format!(
                "未知配置区域: {}",
                payload.section
            )))
        }
    };

    let value = serde_json::to_string(&payload.data).unwrap_or_default();
    upsert(&state, key, &value).await?;

    // 自动在后台进行静态生成
    let configs = load_configs(&state).await?;
    let static_gen_cfg: serde_json::Value = configs
        .get("static_gen_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({ "manual_mode": false }));
    let manual_mode = static_gen_cfg["manual_mode"].as_bool().unwrap_or(false);

    if !manual_mode {
        let state_clone = state.clone();
        tokio::spawn(async move {
            if let Err(e) = run_all_static_generation(&state_clone).await {
                eprintln!("自动静态生成失败: {:?}", e);
            }
        });
    }

    Ok(Json(json!({ "message": "配置已保存" })))
}

// ─── 静态 HTML 生成 ───

#[derive(Deserialize)]
struct GenerateRequest {
    scope: String,
    columns: Option<Vec<String>>,
}

async fn generate_static(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Json(payload): Json<GenerateRequest>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;

    let configs = load_configs(&state).await?;
    let mut portal_data = build_portal_data(&state, &configs).await?;
    let portal_dir = &state.config.portal_dir;

    // 读取栏目路径配置
    let columns_cfg: serde_json::Value = configs
        .get("columns_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({}));
    let models_path = columns_cfg["models"]["path"].as_str().unwrap_or("models");
    let contact_path = columns_cfg["contact"]["path"].as_str().unwrap_or("contact");
    let about_path = columns_cfg["about"]["path"].as_str().unwrap_or("about");

    // 确保目录存在
    tokio::fs::create_dir_all(&portal_dir).await.ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, models_path))
        .await
        .ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, contact_path))
        .await
        .ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, about_path))
        .await
        .ok();

    let mut tera = tera::Tera::default();
    register_templates(&mut tera);

    let mut generated = Vec::new();
    let mut generated_paths: Vec<serde_json::Value> = Vec::new();

    let should_gen = |page: &str| -> bool {
        payload.scope == "all"
            || payload.scope == page
            || (payload.scope == "columns"
                && payload
                    .columns
                    .as_ref()
                    .map(|c| c.contains(&page.to_string()))
                    .unwrap_or(false))
    };

    if should_gen("home") {
        // 检查自定义主页
        let custom_hp: serde_json::Value = configs
            .get("custom_homepage")
            .and_then(|v| serde_json::from_str(v).ok())
            .unwrap_or(json!({ "enabled": false, "html": "" }));
        let hp_enabled = custom_hp["enabled"].as_bool().unwrap_or(false);
        let hp_html = custom_hp["html"].as_str().unwrap_or("");

        if hp_enabled && !hp_html.is_empty() {
            tokio::fs::write(format!("{}/index.html", portal_dir), hp_html)
                .await
                .ok();
        } else {
            portal_data.insert("current_page", &"home");
            let html = render_page(&tera, "home", &portal_data)?;
            tokio::fs::write(format!("{}/index.html", portal_dir), &html)
                .await
                .ok();
        }
        generated.push("首页");
        generated_paths.push(json!({ "label": "首页", "path": "/portal/" }));
    }

    if should_gen("models") {
        portal_data.insert("current_page", &"models");
        let html = render_page(&tera, "models", &portal_data)?;
        tokio::fs::write(format!("{}/{}/index.html", portal_dir, models_path), &html)
            .await
            .ok();
        generated.push("模型数据");
        generated_paths
            .push(json!({ "label": "模型数据", "path": format!("/portal/{}/", models_path) }));

        // 生成所有模型的详情页
        let models = portal_data.get("models").cloned().unwrap_or(json!([]));
        if let Some(models_arr) = models.as_array() {
            for m in models_arr {
                if let Some(model_id) = m.get("model_id").and_then(|v| v.as_str()) {
                    let original_id = m.get("original_id").and_then(|v| v.as_str()).unwrap_or("");
                    let target_id = if !original_id.is_empty() {
                        original_id
                    } else {
                        model_id
                    };
                    let model_dir = format!("{}/model/{}", portal_dir, target_id);
                    tokio::fs::create_dir_all(&model_dir).await.ok();
                    let mut single_portal_data = portal_data.clone();
                    single_portal_data.insert("current_mid", &target_id);
                    let html = render_page(&tera, "model_detail", &single_portal_data)?;
                    tokio::fs::write(format!("{}/index.html", model_dir), &html)
                        .await
                        .ok();
                }
            }
        }
    }

    if should_gen("contact") {
        portal_data.insert("current_page", &"contact");
        let html = render_page(&tera, "contact", &portal_data)?;
        tokio::fs::write(format!("{}/{}/index.html", portal_dir, contact_path), &html)
            .await
            .ok();
        generated.push("联系我们");
        generated_paths
            .push(json!({ "label": "联系我们", "path": format!("/portal/{}/", contact_path) }));
    }

    if should_gen("about") {
        portal_data.insert("current_page", &"about");
        let html = render_page(&tera, "about", &portal_data)?;
        tokio::fs::write(format!("{}/{}/index.html", portal_dir, about_path), &html)
            .await
            .ok();
        generated.push("关于我们");
        generated_paths
            .push(json!({ "label": "关于我们", "path": format!("/portal/{}/", about_path) }));
    }

    // 记录日志
    let log_entry = json!({
        "time": chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "scope": payload.scope,
        "pages": generated,
    });
    let mut logs: Vec<serde_json::Value> = configs
        .get("generate_log")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or_default();
    logs.insert(0, log_entry);
    if logs.len() > 20 {
        logs.truncate(20);
    }
    upsert(
        &state,
        "generate_log",
        &serde_json::to_string(&logs).unwrap_or_default(),
    )
    .await
    .ok();

    Ok(Json(json!({
        "message": format!("已生成 {} 个页面", generated.len()),
        "generated": generated,
        "generated_paths": generated_paths
    })))
}

async fn get_generate_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &claims).await?;
    let configs = load_configs(&state).await?;
    let logs: Vec<serde_json::Value> = configs
        .get("generate_log")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or_default();

    let portal_dir = &state.config.portal_dir;
    let check = |p: &str| std::path::Path::new(&format!("{}/{}", portal_dir, p)).exists();

    Ok(Json(json!({
        "logs": logs,
        "files": {
            "home": check("index.html"),
            "models": check("models/index.html"),
            "contact": check("contact/index.html"),
            "about": check("about/index.html"),
        }
    })))
}

// ─── 实时预览（管理端，需认证） ───

#[derive(Deserialize)]
struct PreviewQuery {
    page: Option<String>,
}

async fn preview_portal(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<auth::Claims>,
    Query(query): Query<PreviewQuery>,
) -> AppResult<axum::response::Html<String>> {
    require_admin(&state, &claims).await?;

    let configs = load_configs(&state).await?;
    let mut portal_data = build_portal_data(&state, &configs).await?;

    let page = query.page.as_deref().unwrap_or("home");
    portal_data.insert("current_page", &page);

    let mut tera = tera::Tera::default();
    register_templates(&mut tera);

    let html = render_page(&tera, page, &portal_data)?;

    Ok(axum::response::Html(html))
}

// ─── 公开 API：获取模型数据 ───

async fn get_portal_models(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<serde_json::Value>> {
    let enabled: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'site_portal'"),
    )
    .fetch_optional(&state.db.pool)
    .await?;
    if enabled != Some(1) {
        return Err(AppError::BadRequest("门户未启用".to_string()));
    }

    #[derive(sqlx::FromRow, serde::Serialize, Clone)]
    struct PortalModel {
        id: i64,
        model_id: String,
        #[sqlx(default)]
        original_id: String,
        model_name: String,
        mid: String,
        #[sqlx(rename = "type_name")]
        model_type: Option<String>,
        #[sqlx(rename = "provider_name")]
        provider: Option<String>,
        logo: Option<String>,
        #[sqlx(default)]
        sort_order: i64,
    }

    let is_mp_enabled: bool = sqlx::query_scalar::<_, i64>(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'model_marketplace'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None)
        == Some(1);

    let mp_configs = if is_mp_enabled {
        crate::api::plugins::load_plugin_configs_pub(&state, "model_marketplace")
            .await
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    let display_mode = mp_configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";

    // 优化：如果为白名单模式且没有配置任何开启的模型，直接返回空，避免浪费数据库查询
    let has_enabled_models = is_blacklist
        || mp_configs.iter().any(|(k, v)| {
            k.starts_with("mp_model_id_")
                && serde_json::from_str::<serde_json::Value>(v)
                    .map(|json| json.get("enabled").and_then(|e| e.as_bool()) == Some(true))
                    .unwrap_or(false)
        });
    if !has_enabled_models {
        return Ok(Json(json!({ "models": [] })));
    }

    let models: Vec<PortalModel> = sqlx::query_as(&state.db.format_query(
        "SELECT m.id, m.model_id, m.original_id, m.name AS model_name, m.mid, \
             t.name AS type_name, p.name AS provider_name, m.logo \
             FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             LEFT JOIN model_providers p ON m.provider_id = p.id \
             WHERE m.is_active = 1 \
             ORDER BY p.sort_order ASC, t.sort_order ASC, m.name ASC",
    ))
    .fetch_all(&state.db.pool)
    .await?;

    let mut filtered_models = Vec::new();
    for mut m in models {
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = mp_configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        let default_enabled = is_blacklist;
        let is_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(default_enabled);
        if !is_enabled {
            continue;
        }

        let sort_order = model_conf
            .get("sort_order")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        m.sort_order = sort_order;
        filtered_models.push(m);
    }

    filtered_models.sort_by(|a, b| b.sort_order.cmp(&a.sort_order));

    Ok(Json(json!({ "models": filtered_models })))
}

// ═══════════════════════════════════════════
//  模板渲染核心
// ═══════════════════════════════════════════

async fn build_portal_data(
    state: &AppState,
    configs: &std::collections::HashMap<String, String>,
) -> Result<tera::Context, AppError> {
    let mut ctx = tera::Context::new();

    let site_settings_val: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'site_settings'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or_default();
    let site_settings = site_settings_val
        .and_then(|v| serde_json::from_str::<crate::models::settings::SiteSettings>(&v).ok())
        .unwrap_or_else(|| crate::api::settings::default_site_settings());

    let nav_config_val: serde_json::Value = configs.get("nav_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({
            "logo_url":"","logo_text":"TokensByte",
            "logo_link":"/home",
            "items":[
                {"label":"首页|Home","path":"/home","enabled":true,"key":"home","icon":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-home\" style=\"margin-right:4px;opacity:0.8\"><path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>"},
                {"label":"模型数据|Models","path":"/home/models","enabled":true,"key":"models","icon":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-database\" style=\"margin-right:4px;opacity:0.8\"><ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5V19A9 3 0 0 0 21 19V5\"/><path d=\"M3 12A9 3 0 0 0 21 12\"/></svg>"},
                {"label":"联系我们|Contact Us","path":"/home/contact","enabled":true,"key":"contact","icon":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-message-square\" style=\"margin-right:4px;opacity:0.8\"><path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/></svg>"},
                {"label":"关于我们|About Us","path":"/home/about","enabled":true,"key":"about","icon":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-book-open\" style=\"margin-right:4px;opacity:0.8\"><path d=\"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\"/><path d=\"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z\"/></svg>"}
            ],
            "cta_text":"登录","cta_link":"/login","register_text":"免费注册","register_link":"/register"
        }));

    let mut nav = nav_config_val;
    if let Some(nav_map) = nav.as_object_mut() {
        let logo_empty = nav_map
            .get("logo_url")
            .and_then(|v| v.as_str())
            .map(|s| s.is_empty())
            .unwrap_or(true);
        if logo_empty && !site_settings.logo.is_empty() {
            nav_map.insert("logo_url".to_string(), json!(site_settings.logo));
        }
    }
    let home: serde_json::Value = configs.get("home_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"hero_title":"一个接口，调用全球数百个 AI 模型","hero_subtitle":"OpenAI 兼容格式，极速接入主流模型。按量付费，零门槛开始。","features":[
            {
                "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22v-5\"/><path d=\"M9 8V2\"/><path d=\"M15 8V2\"/><path d=\"M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z\"/></svg>",
                "title": "一键极速接入",
                "description": "OpenAI 兼容 API 格式，只需修改 Base URL 和 Key，即可无缝替换至数百个主流模型，零代码成本迁移。"
            },
            {
                "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/></svg>",
                "title": "全球模型全面覆盖",
                "description": "聚合 OpenAI、Anthropic、Google Gemini、DeepSeek、字节跳动火山引擎等数十家顶级服务商的模型矩阵。"
            },
            {
                "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4z\"/></svg>",
                "title": "智能分流与高可用",
                "description": "全球边缘节点路由，支持在主渠道高负载或故障时自动无感容灾重试，首字耗时降至毫秒级。"
            },
            {
                "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/></svg>",
                "title": "极致安全数据脱敏",
                "description": "支持 IP 白名单防刷保护，端到端高强度加密传输，异步任务与计费明细日志支持 Base64 数据隐私脱敏。"
            }
        ],"api_base_url":"","cta_title":"准备好开始构建了吗？","cta_description":"只需 3 分钟即可获取您的 API 密钥并开始创新。基础 URL：https://api.artsapi.com/api，零成本平滑迁移。","cta_primary_btn_text":"开始对话","cta_primary_btn_link":"https://api.artsapi.com","cta_secondary_btn_text":"阅读文档","cta_secondary_btn_link":"https://docs.artsapi.com"}));
    let columns: serde_json::Value = configs.get("columns_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"models":{"title":"模型数据","path":"models","enabled":true},"contact":{"title":"联系我们","path":"contact","enabled":true,"content":{"items":[{"icon":"<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM12.0606 11.6829L5.64722 6.2377L4.35278 7.7623L12.0731 14.3171L19.6544 7.75616L18.3456 6.24384L12.0606 11.6829Z'/></svg>","title":"邮箱","value":"bubyday@qq.com"},{"icon":"<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M21 16.42V19.9561C21 20.4811 20.5941 20.9167 20.0705 20.9537C19.6331 20.9846 19.2763 21 19 21C10.1634 21 3 13.8366 3 5C3 4.72371 3.01545 4.36687 3.04635 3.9295C3.08337 3.40588 3.51894 3 4.04386 3H7.5801C7.83678 3 8.05176 3.19442 8.07753 3.4498C8.10067 3.67907 8.12218 3.86314 8.14207 4.00202C8.34435 5.41472 8.75753 6.75936 9.3487 8.00303C9.44359 8.20265 9.38171 8.44159 9.20185 8.57006L7.04355 10.1118C8.35752 13.1811 10.8189 15.6425 13.8882 16.9565L15.4271 14.8019C15.5572 14.6199 15.799 14.5573 16.001 14.6532C17.2446 15.2439 18.5891 15.6566 20.0016 15.8584C20.1396 15.8782 20.3225 15.8995 20.5502 15.9225C20.8056 15.9483 21 16.1633 21 16.42Z'/></svg>","title":"电话","value":"1388888888"},{"icon":"<svg viewBox='0 0 24 24' fill='currentColor' xmlns='http://www.w3.org/2000/svg'><path d='M18.364 17.364L12 23.7279L5.63604 17.364C2.12132 13.8492 2.12132 8.15076 5.63604 4.63604C9.15076 1.12132 14.8492 1.12132 18.364 4.63604C21.8787 8.15076 21.8787 13.8492 18.364 17.364ZM12 15C14.2091 15 16 13.2091 16 11C16 8.79086 14.2091 7 12 7C9.79086 7 8 8.79086 8 11C8 13.2091 9.79086 15 12 15ZM12 13C10.8954 13 10 12.1046 10 11C10 9.89543 10.8954 9 12 9C13.1046 9 14 9.89543 14 11C14 12.1046 13.1046 13 12 13Z'/></svg>","title":"地址","value":"深圳市南山区"}],"social_links":[]}},"about":{"title":"关于我们","path":"about","enabled":true,"content":""}}));
    let footer: serde_json::Value = configs.get("footer_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"copyright":"","icp_number":"","description":"OpenAI 兼容格式，极速接入主流模型。按量付费，零门槛开始。","links":[]}));
    let scripts: serde_json::Value = configs
        .get("custom_scripts")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"customer_service":"","analytics":""}));
    let seo: serde_json::Value = configs
        .get("seo_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"meta_title":"","meta_description":"","meta_keywords":""}));
    let style: serde_json::Value = configs
        .get("style_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({"current_style": "classic"}));

    #[derive(sqlx::FromRow, serde::Serialize, Clone)]
    struct SimpleModel {
        id: i64,
        model_name: String,
        mid: String,
        model_id: String,
        #[sqlx(default)]
        original_id: String,
        #[sqlx(rename = "type_name")]
        model_type: Option<String>,
        #[sqlx(rename = "provider_name")]
        provider: Option<String>,
        logo: Option<String>,
        type_logo: Option<String>,
        provider_logo: Option<String>,
        description: Option<String>,
        billing: Option<sqlx::types::Json<serde_json::Value>>,
        #[sqlx(default)]
        sort_order: i64,
        #[sqlx(default)]
        global_discount: f64,
        #[sqlx(default)]
        global_discount_enabled: i32,
    }
    let is_mp_enabled: bool = sqlx::query_scalar::<_, i64>(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'model_marketplace'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None)
        == Some(1);

    let mp_configs = if is_mp_enabled {
        crate::api::plugins::load_plugin_configs_pub(state, "model_marketplace")
            .await
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    let display_mode = mp_configs
        .get("mp_display_mode")
        .map(|s| s.as_str())
        .unwrap_or("blacklist");
    let is_blacklist = display_mode == "blacklist";

    // 优化：如果为白名单模式且没有任何配置开启的模型，直接跳过查询 models
    let has_enabled_models = is_blacklist
        || mp_configs.iter().any(|(k, v)| {
            k.starts_with("mp_model_id_")
                && serde_json::from_str::<serde_json::Value>(v)
                    .map(|json| json.get("enabled").and_then(|e| e.as_bool()) == Some(true))
                    .unwrap_or(false)
        });
    if !has_enabled_models {
        let grouped_models: Vec<serde_json::Value> = Vec::new();
        ctx.insert("models", &grouped_models);
        return Ok(ctx);
    }

    let models: Vec<SimpleModel> = sqlx::query_as(
        &state.db.format_query(
            "SELECT m.id, m.name AS model_name, m.mid, m.model_id, m.original_id, t.name AS type_name, p.name AS provider_name, \
             m.global_discount, m.global_discount_enabled, \
             CASE WHEN i.file_path IS NOT NULL THEN '/assets/' || i.file_path \
                  WHEN m.logo IS NOT NULL AND m.logo != '' THEN m.logo \
                  ELSE NULL END AS logo, \
             CASE WHEN ti.file_path IS NOT NULL THEN '/assets/' || ti.file_path \
                  WHEN t.logo IS NOT NULL AND t.logo != '' THEN t.logo \
                  ELSE NULL END AS type_logo, \
             CASE WHEN pi.file_path IS NOT NULL THEN '/assets/' || pi.file_path \
                  WHEN p.logo IS NOT NULL AND p.logo != '' THEN p.logo \
                  ELSE NULL END AS provider_logo, \
             m.description, \
             json_build_object('billing_type', br.billing_type, 'billing_rule', br.billing_rule, 'prompt_rate', br.prompt_rate, 'completion_rate', br.completion_rate, 'fixed_rate', br.fixed_rate, 'duration_rate', br.duration_rate, 'extended_config', br.extended_config, 'pricing_tiers', br.pricing_tiers, 'cached_rate', br.cached_rate, 'claude_cache_creation_rate', br.claude_cache_creation_rate, 'claude_cache_read_rate', br.claude_cache_read_rate, 'global_discount', m.global_discount, 'global_discount_enabled', m.global_discount_enabled) AS billing \
             FROM models m \
             LEFT JOIN model_types t ON m.type_id = t.id \
             LEFT JOIN model_providers p ON m.provider_id = p.id \
             LEFT JOIN site_icons i ON i.name = m.logo \
             LEFT JOIN site_icons ti ON ti.name = t.logo \
             LEFT JOIN site_icons pi ON pi.name = p.logo \
             LEFT JOIN billing_rules br ON m.billing_rule_id = br.id \
             WHERE m.is_active = 1 ORDER BY m.id DESC"
        )
    ).fetch_all(&state.db.pool).await.unwrap_or_default();

    let mut filtered_models = Vec::new();
    for mut m in models {
        let config_key = format!("mp_model_id_{}", m.id);
        let model_conf: serde_json::Value = mp_configs
            .get(&config_key)
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({"sort_order": 0, "description": ""}));

        let default_enabled = is_blacklist;
        let is_enabled = model_conf
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(default_enabled);
        if !is_enabled {
            continue;
        }

        let sort_order = model_conf
            .get("sort_order")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let customized_desc = model_conf
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        m.sort_order = sort_order;
        if !customized_desc.is_empty() {
            m.description = Some(customized_desc.to_string());
        }
        filtered_models.push(m);
    }

    filtered_models.sort_by(|a, b| b.sort_order.cmp(&a.sort_order));

    let mut grouped_map: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    let mut grouped_order: Vec<String> = Vec::new();
    for m in &filtered_models {
        let val = serde_json::to_value(m).unwrap_or(json!({}));
        let original_id = m.original_id.clone();
        let model_id = m.model_id.clone();
        let base_key = if !original_id.is_empty() {
            original_id
        } else {
            model_id.clone()
        };
        let type_name = val.get("type_name").and_then(|v| v.as_str()).unwrap_or("");
        let group_key = format!("{}::{}", base_key, type_name);

        if !grouped_map.contains_key(&group_key) {
            grouped_order.push(group_key.clone());
        }
        grouped_map.entry(group_key).or_default().push(val);
    }

    let grouped_models: Vec<serde_json::Value> = grouped_order
        .into_iter()
        .filter_map(|group_key| {
            let variants = grouped_map.remove(&group_key)?;
            let primary = &variants[0];
            let mut group = primary.clone();
            group["variant_count"] = json!(variants.len());
            group["variants"] = json!(variants);
            let original_id = primary
                .get("original_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let model_id = primary
                .get("model_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let base_key = if !original_id.is_empty() {
                original_id
            } else {
                model_id
            };
            group["model_id"] = json!(base_key);
            Some(group)
        })
        .collect();

    let currency = crate::api::settings::get_currency_settings(&state).await;

    let default_lang = site_settings.default_language.as_str();

    ctx.insert("nav", &nav);
    ctx.insert("home", &home);
    ctx.insert("columns", &columns);
    ctx.insert("footer", &footer);
    ctx.insert("scripts", &scripts);
    ctx.insert("seo", &seo);
    ctx.insert("style", &style);
    ctx.insert("models", &grouped_models);
    ctx.insert("currency", &currency);
    ctx.insert("year", &chrono::Utc::now().format("%Y").to_string());
    ctx.insert("default_language", default_lang);

    ctx.insert("portal_locales_zh", PORTAL_LOCALE_ZH);
    ctx.insert("portal_locales_en", PORTAL_LOCALE_EN);
    ctx.insert("portal_locales_ja", PORTAL_LOCALE_JA);
    ctx.insert("portal_locales_ko", PORTAL_LOCALE_KO);
    ctx.insert("portal_locales_vi", PORTAL_LOCALE_VI);

    Ok(ctx)
}

const PORTAL_LOCALE_ZH: &str =
    include_str!("../../../frontend/src/pages/Plugins/SitePortal/locales/portal/zh.json");
const PORTAL_LOCALE_EN: &str =
    include_str!("../../../frontend/src/pages/Plugins/SitePortal/locales/portal/en.json");
const PORTAL_LOCALE_JA: &str =
    include_str!("../../../frontend/src/pages/Plugins/SitePortal/locales/portal/ja.json");
const PORTAL_LOCALE_KO: &str =
    include_str!("../../../frontend/src/pages/Plugins/SitePortal/locales/portal/ko.json");
const PORTAL_LOCALE_VI: &str =
    include_str!("../../../frontend/src/pages/Plugins/SitePortal/locales/portal/vi.json");

fn render_page(tera: &tera::Tera, page: &str, ctx: &tera::Context) -> Result<String, AppError> {
    let tpl = match page {
        "home" => "home.html",
        "models" => "models.html",
        "model_detail" => "model_detail.html",
        "contact" => "contact.html",
        "about" => "about.html",
        _ => return Err(AppError::BadRequest(format!("未知页面: {}", page))),
    };
    tera.render(tpl, ctx)
        .map_err(|e| AppError::Internal(format!("模板渲染失败: {}", e)))
}

fn register_templates(tera: &mut tera::Tera) {
    let base = include_str!("../templates/portal/base.html");
    let home = include_str!("../templates/portal/home.html");
    let models = include_str!("../templates/portal/models.html"); // triggered template reload v3
    let model_detail = include_str!("../templates/portal/model_detail.html");
    let contact = include_str!("../templates/portal/contact.html");
    let about = include_str!("../templates/portal/about.html");

    tera.add_raw_templates(vec![
        ("base.html", base),
        ("home.html", home),
        ("models.html", models),
        ("model_detail.html", model_detail),
        ("contact.html", contact),
        ("about.html", about),
    ])
    .expect("Failed to register portal templates");
}

pub async fn auto_generate_portal_models_static(state: &AppState) -> Result<(), AppError> {
    let enabled: Option<i64> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_enabled FROM plugins WHERE name = 'site_portal'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if enabled != Some(1) {
        return Ok(());
    }

    let configs = load_configs(state).await?;
    let mut portal_data = build_portal_data(state, &configs).await?;
    let portal_dir = &state.config.portal_dir;

    let columns_cfg: serde_json::Value = configs
        .get("columns_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({}));
    let models_path = columns_cfg["models"]["path"].as_str().unwrap_or("models");

    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, models_path))
        .await
        .ok();

    let mut tera = tera::Tera::default();
    register_templates(&mut tera);

    portal_data.insert("current_page", &"models");
    if let Ok(html) = render_page(&tera, "models", &portal_data) {
        tokio::fs::write(format!("{}/{}/index.html", portal_dir, models_path), &html)
            .await
            .ok();
    }

    let models = portal_data.get("models").cloned().unwrap_or(json!([]));
    if let Some(models_arr) = models.as_array() {
        for m in models_arr {
            if let Some(model_id) = m.get("model_id").and_then(|v| v.as_str()) {
                let original_id = m.get("original_id").and_then(|v| v.as_str()).unwrap_or("");
                let target_id = if !original_id.is_empty() {
                    original_id
                } else {
                    model_id
                };
                let model_dir = format!("{}/model/{}", portal_dir, target_id);
                tokio::fs::create_dir_all(&model_dir).await.ok();

                let mut single_portal_data = portal_data.clone();
                single_portal_data.insert("current_mid", &target_id);
                if let Ok(html) = render_page(&tera, "model_detail", &single_portal_data) {
                    tokio::fs::write(format!("{}/index.html", model_dir), &html)
                        .await
                        .ok();
                }
            }
        }
    }

    Ok(())
}

async fn run_all_static_generation(state: &AppState) -> Result<(), AppError> {
    let configs = load_configs(state).await?;
    let mut portal_data = build_portal_data(state, &configs).await?;
    let portal_dir = &state.config.portal_dir;

    let columns_cfg: serde_json::Value = configs
        .get("columns_config")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({}));
    let models_path = columns_cfg["models"]["path"].as_str().unwrap_or("models");
    let contact_path = columns_cfg["contact"]["path"].as_str().unwrap_or("contact");
    let about_path = columns_cfg["about"]["path"].as_str().unwrap_or("about");

    tokio::fs::create_dir_all(portal_dir).await.ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, models_path))
        .await
        .ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, contact_path))
        .await
        .ok();
    tokio::fs::create_dir_all(format!("{}/{}", portal_dir, about_path))
        .await
        .ok();

    let mut tera = tera::Tera::default();
    register_templates(&mut tera);

    // 1. Home - 检查自定义主页
    let custom_hp: serde_json::Value = configs
        .get("custom_homepage")
        .and_then(|v| serde_json::from_str(v).ok())
        .unwrap_or(json!({ "enabled": false, "html": "" }));
    let hp_enabled = custom_hp["enabled"].as_bool().unwrap_or(false);
    let hp_html = custom_hp["html"].as_str().unwrap_or("");

    if hp_enabled && !hp_html.is_empty() {
        tokio::fs::write(format!("{}/index.html", portal_dir), hp_html)
            .await
            .ok();
    } else {
        portal_data.insert("current_page", &"home");
        let html = render_page(&tera, "home", &portal_data)?;
        tokio::fs::write(format!("{}/index.html", portal_dir), &html)
            .await
            .ok();
    }

    // 2. Models
    portal_data.insert("current_page", &"models");
    let html = render_page(&tera, "models", &portal_data)?;
    tokio::fs::write(format!("{}/{}/index.html", portal_dir, models_path), &html)
        .await
        .ok();

    let models = portal_data.get("models").cloned().unwrap_or(json!([]));
    if let Some(models_arr) = models.as_array() {
        for m in models_arr {
            if let Some(model_id) = m.get("model_id").and_then(|v| v.as_str()) {
                let original_id = m.get("original_id").and_then(|v| v.as_str()).unwrap_or("");
                let target_id = if !original_id.is_empty() {
                    original_id
                } else {
                    model_id
                };
                let model_dir = format!("{}/model/{}", portal_dir, target_id);
                tokio::fs::create_dir_all(&model_dir).await.ok();
                let mut single_portal_data = portal_data.clone();
                single_portal_data.insert("current_mid", &target_id);
                if let Ok(html) = render_page(&tera, "model_detail", &single_portal_data) {
                    tokio::fs::write(format!("{}/index.html", model_dir), &html)
                        .await
                        .ok();
                }
            }
        }
    }

    // 3. Contact
    portal_data.insert("current_page", &"contact");
    let html = render_page(&tera, "contact", &portal_data)?;
    tokio::fs::write(format!("{}/{}/index.html", portal_dir, contact_path), &html)
        .await
        .ok();

    // 4. About
    portal_data.insert("current_page", &"about");
    let html = render_page(&tera, "about", &portal_data)?;
    tokio::fs::write(format!("{}/{}/index.html", portal_dir, about_path), &html)
        .await
        .ok();

    Ok(())
}
