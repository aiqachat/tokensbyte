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
pub mod admin_groups;

pub fn build_router(state: Arc<AppState>) -> Router {
    // 1. Management APIs (Admin/User UI)
    let admin_routes: Router<Arc<AppState>> = Router::new()
        .route("/users", get(users::list_users).post(users::create_user))
        .route("/users/{id}", put(users::update_user).delete(users::delete_user))
        .route("/users/{id}/recharge", post(users::recharge_user))
        .route("/channels", post(channels::create_channel))
        .route("/channels/{id}", put(channels::update_channel).delete(channels::delete_channel))
        .route("/channels/{id}/test", post(channels::test_channel))
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
        .route("/user_levels", get(user_levels::list_user_levels).post(user_levels::create_user_level))
        .route("/user_levels/{id}", put(user_levels::update_user_level).delete(user_levels::delete_user_level))
        .route("/finance/orders", get(finance::list_orders))
        .route("/admin_groups", get(admin_groups::list_admin_groups).post(admin_groups::create_admin_group))
        .route("/admin_groups/{id}", put(admin_groups::update_admin_group).delete(admin_groups::delete_admin_group))
        .layer(axum_middleware::from_fn(admin_middleware))
        .with_state(state.clone());

    let management_routes: Router<Arc<AppState>> = Router::new()
        .route("/dashboard", get(dashboard::get_stats))
        .route("/channels", get(channels::list_channels))
        .route("/models", get(models::list_models))
        .route("/tokens", get(tokens::list_tokens).post(tokens::create_token))
        .route("/tokens/{id}", put(tokens::update_token).delete(tokens::delete_token))
        .route("/logs", get(logs::list_logs))
        .route("/redemptions/redeem", post(redemptions::redeem_code))
        
        .route("/user/profile", get(user::get_profile).put(user::update_profile))
        .route("/user/wallet", get(user::get_wallet_stats))
        .route("/user/recharge_records", get(user::list_recharge_records))
        .route("/user/affiliate/transfer", post(user::transfer_commission))

        .merge(admin_routes)
        .layer(axum_middleware::from_fn_with_state(state.clone(), auth_middleware));




    // 2. Auth APIs & Public Configs (Public)
    let auth_routes: Router<Arc<AppState>> = Router::new()
        .route("/login", post(auth::login))
        .route("/admin/login", post(auth::admin_login))
        .route("/register", post(auth::register))
        .route("/send-code", post(auth::send_code))
        .route("/register-email", post(auth::register_email))
        .route("/reset-password", post(auth::reset_password))
        .with_state(state.clone());

    let public_v1_routes: Router<Arc<AppState>> = Router::new()
        .route("/settings", get(settings::get_settings))
        .with_state(state.clone());

    // 3. Relay APIs (OpenAI Compatible)
    let relay_routes: Router<Arc<AppState>> = Router::new()
        .route("/chat/completions", post(crate::relay::chat_completions))
        .layer(axum_middleware::from_fn_with_state(state.clone(), api_key_middleware))
        .with_state(state.clone());

    Router::new()
        .nest("/api/v1/auth", auth_routes)
        .nest("/api/v1", public_v1_routes)
        .nest("/api/v1", management_routes)
        .nest("/v1", relay_routes)
        .with_state(state)
        .layer(tower_http::cors::CorsLayer::permissive())
}
