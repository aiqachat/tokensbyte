pub mod live_metrics;
pub mod rate_limit;
use std::sync::Arc;

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::{IntoResponse, Response},
};

use crate::auth;
use crate::error::AppError;
use crate::AppState;

/// API Key 脱敏：保留前8后4位，中间用 *** 替代
fn mask_key(key: &str) -> String {
    if key.len() <= 12 {
        return "***".to_string();
    }
    format!("{}***{}", &key[..8], &key[key.len() - 4..])
}

/// Extract user claims from JWT token in Authorization header
pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth_header = match request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
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

    // 高频只读观测接口：仅校验 JWT，跳过 is_active 查库（减轻看板轮询对连接池压力）
    let path = request.uri().path();
    if path.ends_with("/metrics/live") {
        request.extensions_mut().insert(claims);
        return next.run(request).await;
    }

    // Verify user still exists and is active
    let is_active: Result<Option<i64>, sqlx::Error> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT is_active FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await;

    match is_active {
        Ok(Some(active)) if active != 0 => {
            request.extensions_mut().insert(claims);
            next.run(request).await
        }
        Ok(Some(_)) | Ok(None) => AppError::Unauthorized.into_response(),
        Err(e) => {
            tracing::error!("Database error in auth_middleware: {}", e);
            AppError::Internal("Database connection error".to_string()).into_response()
        }
    }
}

/// Require admin role
pub async fn admin_middleware(request: Request, next: Next) -> Response {
    let claims = match request.extensions().get::<auth::Claims>() {
        Some(c) => c,
        None => return AppError::Unauthorized.into_response(),
    };

    if claims.role != "admin" {
        return AppError::Forbidden("Admin access required".to_string()).into_response();
    }

    next.run(request).await
}

/// Normalize vendor-specific API auth formats to standard Authorization header
/// Supports: x-api-key / X-Api-Key (Anthropic & Volcengine)
///           x-goog-api-key (Google Gemini)
///           ?key=xxx query parameter (Google Gemini)
fn normalize_request_auth(request: &mut Request) {
    if request.headers().get(header::AUTHORIZATION).is_none() {
        // 1. Try x-api-key or X-Api-Key (Anthropic & Volcengine)
        if let Some(key) = request
            .headers()
            .get("x-api-key")
            .or_else(|| request.headers().get("X-Api-Key"))
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert(header::AUTHORIZATION, val);
                return;
            }
        }

        // 2. Try x-goog-api-key (Google Gemini)
        if let Some(key) = request
            .headers()
            .get("x-goog-api-key")
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(val) = format!("Bearer {}", key).parse() {
                request.headers_mut().insert(header::AUTHORIZATION, val);
                return;
            }
        }

        // 3. Try ?key= query parameter (Google Gemini)
        if let Some(query) = request.uri().query() {
            for pair in query.split('&') {
                if let Some(key) = pair.strip_prefix("key=") {
                    if let Ok(val) = format!("Bearer {}", key).parse() {
                        request.headers_mut().insert(header::AUTHORIZATION, val);
                    }
                    break;
                }
            }
        }
    }
}

/// Extract API token (sk-xxx) for relay endpoints
pub async fn api_key_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request,
    next: Next,
) -> Response {
    // 规范化各种厂商的认证头部/参数为标准 Authorization 格式
    normalize_request_auth(&mut request);

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
        .and_then(|v| v.to_str().ok())
    {
        Some(h) => h,
        None => {
            if !skip_log && !path.ends_with("/health") && !path.ends_with("favicon.ico") {
                tracing::warn!("[Auth] {} | 缺少 Authorization 请求头", path);
                crate::relay::proxy::record_error_log(
                    &state,
                    "unknown",
                    None,
                    None,
                    "unknown",
                    401,
                    &path,
                    "Missing Authorization Header",
                    None,
                    None,
                )
                .await;
            }
            return AppError::AuthFailed("Missing Authorization Header".to_string())
                .into_response();
        }
    };

    let api_key = match auth_header.strip_prefix("Bearer ") {
        Some(k) => k,
        None => {
            tracing::warn!(
                "[Auth] {} | Bearer 格式错误, header={}",
                path,
                &auth_header[..auth_header.len().min(20)]
            );
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    "unknown",
                    None,
                    None,
                    "unknown",
                    401,
                    &path,
                    "Invalid Bearer Token Format",
                    None,
                    None,
                )
                .await;
            }
            return AppError::AuthFailed("Invalid Bearer Token Format".to_string()).into_response();
        }
    };

    let token: crate::models::ApiToken = match sqlx::query_as::<_, crate::models::ApiToken>(
        &state
            .db
            .format_query("SELECT * FROM api_tokens WHERE token_key = ?"),
    )
    .bind(api_key)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(Some(t)) if t.is_active != 0 => {
            tracing::info!(
                "[Auth] {} | 令牌验证通过: key={}, token_id={}, user={}",
                path,
                mask_key(api_key),
                t.id,
                t.user_id
            );
            t
        }
        Ok(Some(t)) => {
            tracing::warn!(
                "[Auth] {} | 令牌已禁用: key={}, token_id={}, user={}",
                path,
                mask_key(api_key),
                t.id,
                t.user_id
            );
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &t.user_id,
                    None,
                    Some(t.id),
                    "unknown",
                    403,
                    &path,
                    "Token disabled",
                    None,
                    None,
                )
                .await;
            }
            return AppError::Forbidden("Token disabled".to_string()).into_response();
        }
        Ok(None) => {
            tracing::warn!("[Auth] {} | 无效 API Key: key={}", path, mask_key(api_key));
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    "unknown",
                    None,
                    None,
                    "unknown",
                    401,
                    &path,
                    "Invalid API Key",
                    None,
                    None,
                )
                .await;
            }
            return AppError::AuthFailed("Invalid API Key".to_string()).into_response();
        }
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
        if !skip_log {
            crate::relay::proxy::record_error_log(
                &state,
                &token.user_id,
                None,
                Some(token.id),
                "unknown",
                403,
                &path,
                "Token expired",
                None,
                None,
            )
            .await;
        }
        return AppError::Forbidden("Token expired".to_string()).into_response();
    }

    // 额度检查：GET（轮询/余额）与 DELETE（取消任务以释放冻结）在超额时仍放行
    let skip_quota_check = matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::DELETE
    );
    if !skip_quota_check {
        let (site_tz, _) = crate::relay::get_cached_config(&state).await;
        // 计费自然日以用户 timedisplay 为准（非站点全局、非 timesystem）
        let timedisplay = crate::api::date_helper::resolve_user_timedisplay_name(
            &state.db,
            &token.user_id,
            &site_tz,
        )
        .await;

        // 内存拦截器：DashMap miss 时从 DB hydration，覆盖日/周/月/总额度
        let limits = crate::relay::quota_memory::limits_from_token(&token);
        if let Err(e) = state
            .quota_memory
            .check_quota(&state.db, token.id, &timedisplay, &limits)
            .await
        {
            let err_msg = e.to_string();
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
            .or_else(|| {
                request
                    .headers()
                    .get("x-real-ip")
                    .and_then(|v| v.to_str().ok())
            })
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
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    "unknown",
                    403,
                    &path,
                    &msg,
                    None,
                    None,
                )
                .await;
            }
            return AppError::Forbidden(msg).into_response();
        }
    }

    // Check Rate Limits
    if token.rps_limit > 0 {
        if !state.rate_limiter.check_rps(token.id, token.rps_limit) {
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    "unknown",
                    429,
                    &path,
                    "RPS limit exceeded",
                    None,
                    None,
                )
                .await;
            }
            return AppError::TooManyRequests("RPS limit exceeded".to_string()).into_response();
        }
    }

    if token.rpm_limit > 0 {
        if !state.rate_limiter.check_rpm(token.id, token.rpm_limit) {
            if !skip_log {
                crate::relay::proxy::record_error_log(
                    &state,
                    &token.user_id,
                    None,
                    Some(token.id),
                    "unknown",
                    429,
                    &path,
                    "RPM limit exceeded",
                    None,
                    None,
                )
                .await;
            }
            return AppError::TooManyRequests("RPM limit exceeded".to_string()).into_response();
        }
    }

    // 实时吞吐观测（QPS/RPM/Task）；Guard 挂到 Response 直至 body 结束
    let (global_guard, user_guard) = live_metrics::begin_request(&token.user_id, token.id);
    request.extensions_mut().insert(token);
    let mut response = next.run(request).await;
    response
        .extensions_mut()
        .insert(live_metrics::LiveMetricsTaskGuards::new(
            global_guard,
            user_guard,
        ));
    response
}
