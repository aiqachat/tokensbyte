use axum::{
    routing::{get, post, put, delete},
    Router,
    middleware as axum_middleware,
};
use std::sync::Arc;
use crate::AppState;
use crate::middleware::{auth_middleware, admin_middleware, api_key_middleware};

pub mod auth;
mod channels;
mod tokens;
mod users;
mod logs;
mod dashboard;
mod redemptions;

pub fn build_router(state: Arc<AppState>) -> Router {
    // 1. Management APIs (Admin/User UI)
    let admin_routes = Router::new()
        .route("/users", get(users::list_users).post(users::create_user))
        .route("/users/{id}", put(users::update_user).delete(users::delete_user))
        .route("/channels", post(channels::create_channel))
        .route("/channels/{id}", put(channels::update_channel).delete(channels::delete_channel))
        .route("/channels/{id}/test", post(channels::test_channel))
        .route("/redemptions", get(redemptions::list_redemptions).post(redemptions::generate_redemptions))
        .route("/redemptions/{id}", delete(redemptions::delete_redemption))
        .route("/tokens/all", get(tokens::list_all_tokens))
        .layer(axum_middleware::from_fn(admin_middleware));

    let management_routes = Router::new()
        .route("/dashboard", get(dashboard::get_stats))
        .route("/channels", get(channels::list_channels))
        .route("/tokens", get(tokens::list_tokens).post(tokens::create_token))
        .route("/tokens/{id}", put(tokens::update_token).delete(tokens::delete_token))
        .route("/logs", get(logs::list_logs))
        .route("/redemptions/redeem", post(redemptions::redeem_code))

        .merge(admin_routes)
        .layer(axum_middleware::from_fn_with_state(state.clone(), auth_middleware));



    // 2. Auth APIs (Public)
    let auth_routes = Router::new()
        .route("/login", post(auth::login))
        .route("/register", post(auth::register));

    // 3. Relay APIs (OpenAI Compatible)
    let relay_routes = Router::new()
        .route("/chat/completions", post(crate::relay::chat_completions))
        .layer(axum_middleware::from_fn_with_state(state.clone(), api_key_middleware));

    Router::new()
        .nest("/api/v1/auth", auth_routes)
        .nest("/api/v1", management_routes)
        .nest("/v1", relay_routes)
        .with_state(state)
        .layer(tower_http::cors::CorsLayer::permissive())
}
