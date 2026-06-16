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
        &state.db.format_query("SELECT is_active FROM users WHERE id = ?")
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await;

    match is_active {
        Ok(Some(active)) if active != 0 => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        },
        Ok(Some(_)) | Ok(None) => AppError::Unauthorized.into_response(),
        Err(e) => {
            tracing::error!("Database error in auth_middleware: {}", e);
            AppError::Internal("Database connection error".to_string()).into_response()
        }
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
    let path = request
        .extensions()
        .get::<axum::extract::OriginalUri>()
        .map(|uri| uri.path().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    // 余额查询等轻量只读接口无需记录错误日志
    let skip_log = path.ends_with("/balance");
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok()) {
            Some(h) => h,
            None => {
                // Ignore noise for common public paths
                if !skip_log && !path.ends_with("/health") && !path.ends_with("favicon.ico") {
                    crate::relay::proxy::record_error_log(&state, "unknown", None, None, "unknown", 401, &path, "Missing Authorization Header", None, None).await;
                }
                return AppError::Unauthorized.into_response();
            }
        };

    let api_key = match auth_header.strip_prefix("Bearer ") {
        Some(k) => k,
        None => {
            if !skip_log { crate::relay::proxy::record_error_log(&state, "unknown", None, None, "unknown", 401, &path, "Invalid Bearer Token Format", None, None).await; }
            return AppError::Unauthorized.into_response();
        }
    };

    // Look up the API token
    let token: crate::models::ApiToken = match sqlx::query_as::<_, crate::models::ApiToken>(
        &state.db.format_query("SELECT * FROM api_tokens WHERE token_key = ?")
    )
    .bind(api_key)
    .fetch_optional(&state.db.pool)
    .await {
        Ok(Some(t)) if t.is_active != 0 => t,
        Ok(Some(t)) => {
            if !skip_log { crate::relay::proxy::record_error_log(&state, &t.user_id, None, Some(t.id), "unknown", 403, &path, "Token disabled", None, None).await; }
            return AppError::Forbidden("Token disabled".to_string()).into_response();
        },
        Ok(None) => {
            if !skip_log { crate::relay::proxy::record_error_log(&state, "unknown", None, None, "unknown", 401, &path, "Invalid API Key", None, None).await; }
            return AppError::Unauthorized.into_response();
        },
        Err(e) => return AppError::Internal(format!("Database error: {}", e)).into_response(),
    };

    // Check only_playground restrict
    if token.only_playground == 1 {
        let x_playground = request
            .headers()
            .get("x-playground")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if x_playground != "1" && x_playground != "true" {
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    "unknown",
                    403,
                    &path,
                    "This token is restricted to Playground use only",
                    None,
                    None,
                )
                .await;
            }
            return AppError::Forbidden("该令牌仅能在创作中心内使用".to_string()).into_response();
        }
    }

    // Check expiry
    if token.is_expired() {
        if !skip_log { crate::relay::proxy::record_error_log(&state, &token.user_id, None, Some(token.id), "unknown", 403, &path, "Token expired", None, None).await; }
        return AppError::Forbidden("Token expired".to_string()).into_response();
    }

    // Check quota (allow GET requests for task polling even if quota is exceeded)
    if request.method() != axum::http::Method::GET {
        let now = chrono::Local::now();
        let now_day = now.format("%Y-%m-%d").to_string();
        let now_week = now.format("%Y-%U").to_string();
        let now_month = now.format("%Y-%m").to_string();
        if let Err(err_msg) = token.check_quota_limits(&now_day, &now_week, &now_month) {
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    "unknown",
                    403,
                    &path,
                    &err_msg,
                    None,
                    None,
                )
                .await;
            }
            return AppError::Forbidden(err_msg).into_response();
        }
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
            let msg = format!("IP {} not whitelisted", client_ip);
            if !skip_log { crate::relay::proxy::record_error_log(&state, &token.user_id, None, Some(token.id), "unknown", 403, &path, &msg, None, None).await; }
            return AppError::Forbidden(msg).into_response();
        }
    }

    // Check Rate Limits
    if token.rps_limit > 0 {
        if !state.rate_limiter.check_rps(token.id, token.rps_limit) {
            if !skip_log { crate::relay::proxy::record_error_log(&state, &token.user_id, None, Some(token.id), "unknown", 429, &path, "RPS limit exceeded", None, None).await; }
            return AppError::TooManyRequests("RPS limit exceeded".to_string()).into_response();
        }
    }

    if token.rpm_limit > 0 {
        if !state.rate_limiter.check_rpm(token.id, token.rpm_limit) {
            if !skip_log { crate::relay::proxy::record_error_log(&state, &token.user_id, None, Some(token.id), "unknown", 429, &path, "RPM limit exceeded", None, None).await; }
            return AppError::TooManyRequests("RPM limit exceeded".to_string()).into_response();
        }
    }

    request.extensions_mut().insert(token);
    next.run(request).await
}
