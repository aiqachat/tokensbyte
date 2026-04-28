use axum::{
    routing::{get, post, put, delete},
    Router,
    middleware as axum_middleware,
};
use std::sync::Arc;
use crate::AppState;
use crate::middleware::{auth_middleware, admin_middleware, api_key_middleware};

pub mod auth;
pub mod channels;
pub mod channel_configs;
pub mod dashboard;
pub mod logs;
pub mod model_classifications;
pub mod models;
pub mod redemptions;
pub mod settings;
pub mod tokens;
pub mod user;
pub mod user_levels;
pub mod users;
pub mod finance;
pub mod pay;
pub mod admin_groups;
pub mod forward_rules;
pub mod billing_rules;
pub mod task_logs;
pub mod upstreams;
pub mod announcements;

pub fn build_router(state: Arc<AppState>) -> Router {
    // 1. Management APIs (Admin/User UI)
    let admin_routes: Router<Arc<AppState>> = Router::new()
        .route("/users", get(users::list_users).post(users::create_user))
        .route("/users/{id}", put(users::update_user).delete(users::delete_user))
        .route("/users/{id}/recharge", post(users::recharge_user))
        .route("/users/{id}/impersonate", post(users::impersonate_user))
        .route("/channels", post(channels::create_channel))
        .route("/channels/{id}", put(channels::update_channel).delete(channels::delete_channel))
        .route("/channels/{id}/test", post(channels::test_channel))
        .route("/channel-configs", post(channel_configs::create_channel_config))
        .route("/channel-configs/{id}", put(channel_configs::update_channel_config).delete(channel_configs::delete_channel_config))
        .route("/upstreams", get(upstreams::list_upstreams).post(upstreams::create_upstream))
        .route("/upstreams/{id}", put(upstreams::update_upstream).delete(upstreams::delete_upstream))
        .route("/upstreams/{id}/balance", get(upstreams::get_upstream_balance))
        .route("/models", post(models::create_model))
        .route("/models/{id}", put(models::update_model).delete(models::delete_model))
        .route("/model-providers", get(model_classifications::list_providers).post(model_classifications::create_provider))
        .route("/model-providers/{id}", put(model_classifications::update_provider).delete(model_classifications::delete_provider))
        .route("/model-types", get(model_classifications::list_types).post(model_classifications::create_type))
        .route("/model-types/{id}", put(model_classifications::update_type).delete(model_classifications::delete_type))
        .route("/classifications/stats", get(model_classifications::get_classifications_stats))
        .route("/redemptions", get(redemptions::list_redemptions).post(redemptions::generate_redemptions))
        .route("/redemptions/{id}", delete(redemptions::delete_redemption))
        .route("/tokens/all", get(tokens::list_all_tokens))
        .route("/settings", post(settings::update_settings))
        .route("/settings/database/verify", post(settings::verify_database))
        .route("/settings/database/initialize", post(settings::initialize_database))
        .route("/settings/database/backup", post(settings::backup_database))
        .route("/settings/email/test", post(settings::test_email))
        .route("/settings/sms/test", post(settings::test_sms))
        .route("/user_levels", get(user_levels::list_user_levels).post(user_levels::create_user_level))
        .route("/user_levels/{id}", put(user_levels::update_user_level).delete(user_levels::delete_user_level))
        .route("/finance/orders", get(finance::list_orders))
        .route("/finance/recharges", get(finance::list_recharges))
        .route("/finance/recharge_types", get(finance::list_recharge_types))
        .route("/admin_groups", get(admin_groups::list_admin_groups).post(admin_groups::create_admin_group))
        .route("/admin_groups/{id}", put(admin_groups::update_admin_group).delete(admin_groups::delete_admin_group))
        .route("/forward-rules", get(forward_rules::list_rules).post(forward_rules::create_rule))
        .route("/forward-rules/{id}", put(forward_rules::update_rule).delete(forward_rules::delete_rule))
        .route("/billing-rules", get(billing_rules::list_rules).post(billing_rules::create_rule))
        .route("/billing-rules/{id}", put(billing_rules::update_rule).delete(billing_rules::delete_rule))
        .route("/announcements", get(announcements::list_admin_announcements).post(announcements::create_announcement))
        .route("/announcements/{id}", put(announcements::update_announcement).delete(announcements::delete_announcement))
        .layer(axum_middleware::from_fn(admin_middleware))
        .with_state(state.clone());

    let management_routes: Router<Arc<AppState>> = Router::new()
        .route("/dashboard", get(dashboard::get_stats))
        .route("/channels", get(channels::list_channels))
        .route("/models", get(models::list_models))
        .route("/tokens", get(tokens::list_tokens).post(tokens::create_token))
        .route("/tokens/{id}", put(tokens::update_token).delete(tokens::delete_token))
        .route("/tokens/{id}/reveal", post(tokens::reveal_token))
        .route("/channel-configs", get(channel_configs::list_channel_configs))
        .route("/logs", get(logs::list_logs))
        .route("/redemptions/redeem", post(redemptions::redeem_code))
        
        .route("/user/profile", get(user::get_profile).put(user::update_profile))
        .route("/user/wallet", get(user::get_wallet_stats))
        .route("/user/recharge_records", get(user::list_recharge_records))
        .route("/user/affiliate/transfer", post(user::transfer_commission))
        .route("/user/bind/mobile", post(user::bind_mobile))
        .route("/user/bind/email", post(user::bind_email))
        .route("/user/bind/wechat", get(user::bind_wechat))
        .route("/user/bind/google", get(user::bind_google))
        .route("/user/unbind/{bind_type}", post(user::unbind_third_party))
        .route("/task_logs", get(task_logs::list_task_logs))
        .route("/task_logs/{id}/sync", post(task_logs::sync_task_log))
        .route("/finance/pay/create", post(pay::create_order))
        .route("/finance/pay/status/{out_trade_no}", get(pay::check_status))
        .route("/system/about", get(settings::system_about))

        .merge(admin_routes)
        .nest("/plugins/volcengine_pool", volcengine_pool::router())
        .nest("/plugins/gptimage_pool", gptimage_pool::router())
        .nest("/plugins/site-icons", site_icons::router())
        .nest("/plugins", plugins::router())
        .route("/marketplace/public", get(plugins::get_marketplace_public))
        .nest("/assets", assets::router())
        .nest("/team-marketing", team_marketing::router())
        .nest("/playground", playground::router())
        .layer(axum_middleware::from_fn_with_state(state.clone(), auth_middleware));

    let payment_public_routes: Router<Arc<AppState>> = Router::new()
        .route("/finance/pay/notify/wechat", post(pay::wechat_notify))
        .route("/finance/pay/notify/alipay", post(pay::alipay_notify))
        .with_state(state.clone());

    // 2. Auth APIs & Public Configs (Public)
    let auth_routes: Router<Arc<AppState>> = Router::new()
        .route("/login", post(auth::login))
        .route("/admin/login", post(auth::admin_login))
        .route("/register", post(auth::register))
        .route("/send-code", post(auth::send_code))
        .route("/send-sms-code", post(auth::send_sms_code))
        .route("/register-email", post(auth::register_email))
        .route("/register-mobile", post(auth::register_mobile))
        .route("/reset-password", post(auth::reset_password))
        .route("/oauth/wechat", get(auth::oauth_wechat))
        .route("/oauth/wechat/callback", get(auth::oauth_wechat_callback))
        .route("/oauth/google", get(auth::oauth_google))
        .route("/oauth/google/callback", get(auth::oauth_google_callback))
        .with_state(state.clone());

    let public_v1_routes: Router<Arc<AppState>> = Router::new()
        .route("/settings", get(settings::get_settings))
        .route("/announcements/public", get(announcements::get_public_announcements))
        .route("/plugins/active", get(plugins::get_active_plugins_public))
        // OAuth 绑定回调（浏览器重定向，无 JWT，通过 state 参数识别用户）
        .route("/user/bind/wechat/callback", get(user::bind_wechat_callback))
        .route("/user/bind/google/callback", get(user::bind_google_callback))
        .merge(payment_public_routes)
        .with_state(state.clone());

    // 3. Relay APIs (OpenAI Compatible)
    let relay_routes: Router<Arc<AppState>> = Router::new()
        .route("/chat/completions", post(crate::relay::chat_completions))
        .route("/images/generations", post(crate::relay::image::image_generations))
        .route("/videos/generations", post(crate::relay::video::video_generations))
        .route("/video/generations", post(crate::relay::video::video_generations))
        .route("/video/generations/{task_id}", get(crate::relay::video::video_generations_status))
        // 阿里百炼 DashScope 视频生成 API 原生路径
        .route("/v1/services/aigc/video-generation/video-synthesis", post(crate::relay::video::video_generations))
        // 阿里百炼 DashScope 图像生成 API 原生路径 (多模态)
        .route("/v1/services/aigc/multimodal-generation/generation", post(crate::relay::image::image_generations))
        .route("/v1/tasks/{task_id}", get(crate::relay::video::video_generations_status))
        .route("/tasks/{task_id}", get(crate::relay::task::task_status))
        .layer(axum_middleware::from_fn_with_state(state.clone(), api_key_middleware))
        .with_state(state.clone());

    // 4. Google Gemini Native Relay (supports ?key=, x-goog-api-key, and Bearer auth)
    let google_native_routes: Router<Arc<AppState>> = Router::new()
        .route("/v1beta/models/{model_action}", post(crate::relay::native::gemini_proxy))
        .layer(axum_middleware::from_fn_with_state(state.clone(), api_key_middleware))
        .layer(axum_middleware::from_fn(crate::relay::native::normalize_google_auth))
        .with_state(state.clone());

    // 5. Volcengine Native Relay
    let volcengine_native_routes: Router<Arc<AppState>> = Router::new()
        .route("/api/v3/contents/generations/tasks", post(crate::relay::native::volcengine_submit))
        .route("/api/v3/contents/generations/tasks/{task_id}", get(crate::relay::native::volcengine_status))
        .route("/api/v3/images/generations", post(crate::relay::native::volcengine_images))
        .route("/api", post(crate::relay::native::ark_asset_proxy))
        .layer(axum_middleware::from_fn_with_state(state.clone(), api_key_middleware))
        .with_state(state.clone());

    let public_router = Router::new()
        .route("/api/health", get(|| async { "OK" }))
        .route("/favicon.ico", get(|| async { "" }));

    Router::new()
        .merge(public_router)
        .nest("/api/v1/auth", auth_routes)
        .nest("/api/v1", public_v1_routes)
        .nest("/api/v1", management_routes)
        .nest("/v1", relay_routes.clone())
        .nest("/api", relay_routes)
        .merge(google_native_routes)
        .merge(volcengine_native_routes)
        .with_state(state)
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024))
}

pub mod plugins;
pub mod assets;
pub mod team_marketing;
pub mod playground;
pub mod volcengine_pool;
pub mod gptimage_pool;
pub mod site_icons;
