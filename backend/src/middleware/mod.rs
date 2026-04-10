pub mod rate_limit;
use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::{Response, IntoResponse},
};

use crate::error::AppError;
use crate::auth;
use crate::AppState;

/// Extract user claims from JWT token in Authorization header
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok()) {
            Some(h) => h,
            None => return AppError::Unauthorized.into_response(),
        };

    let token = match auth_header.strip_prefix("Bearer ") {
        Some(t) => t,
        None => return AppError::Unauthorized.into_response(),
    };

    let claims = match auth::validate_token(token, &state.config.jwt_secret) {
        Ok(c) => c,
        Err(_) => return AppError::Unauthorized.into_response(),
    };

    // Verify user still exists and is active
    let is_active: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
        "SELECT is_active FROM users WHERE id = ?"
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await;

    match is_active {
        Ok(Some(active)) if active != 0 => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        },
        _ => AppError::Unauthorized.into_response(),
    }
}

/// Require admin role
pub async fn admin_middleware(
    request: Request,
    next: Next,
) -> Response {
    let claims = match request.extensions().get::<auth::Claims>() {
        Some(c) => c,
        None => return AppError::Unauthorized.into_response(),
    };

    if claims.role != "admin" {
        return AppError::Forbidden("Admin access required".to_string()).into_response();
    }

    next.run(request).await
}

/// Extract API token (sk-xxx) for relay endpoints
pub async fn api_key_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok()) {
            Some(h) => h,
            None => return AppError::Unauthorized.into_response(),
        };

    let api_key = match auth_header.strip_prefix("Bearer ") {
        Some(k) => k,
        None => return AppError::Unauthorized.into_response(),
    };

    // Look up the API token
    let token: crate::models::ApiToken = match sqlx::query_as::<sqlx::Any, crate::models::ApiToken>(
        "SELECT * FROM api_tokens WHERE token_key = ?"
    )
    .bind(api_key)
    .fetch_optional(&state.db.pool)
    .await {
        Ok(Some(t)) if t.is_active != 0 => t,
        Ok(Some(_)) => return AppError::Forbidden("Token disabled".to_string()).into_response(),
        Ok(None) => return AppError::Unauthorized.into_response(),
        Err(e) => return AppError::Internal(format!("Database error: {}", e)).into_response(),
    };

    // Check expiry
    if token.is_expired() {
        return AppError::Forbidden("Token expired".to_string()).into_response();
    }

    // Check quota
    if !token.has_quota() {
        return AppError::Forbidden("Quota exceeded".to_string()).into_response();
    }

    // Check IP Whitelist
    if !token.allowed_ips.is_empty() {
        let client_ip: &str = request
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .or_else(|| request.headers().get("x-real-ip").and_then(|v| v.to_str().ok()))
            .unwrap_or("127.0.0.1");

        let allowed: Vec<&str> = token.allowed_ips.split(',').collect();
        let mut is_allowed = false;
        for ip in allowed {
            if client_ip == ip.trim() {
                is_allowed = true;
                break;
            }
        }
        if !is_allowed {
            return AppError::Forbidden(format!("IP {} not whitelisted", client_ip)).into_response();
        }
    }

    // Check Rate Limits
    if token.rps_limit > 0 {
        if !state.rate_limiter.check(token.id, token.rps_limit) {
            return AppError::TooManyRequests("Rate limit exceeded".to_string()).into_response();
        }
    }

    request.extensions_mut().insert(token);
    next.run(request).await
}
