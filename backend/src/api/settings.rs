use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{SiteSettings, CurrencySettings, AllSettings, UpdateSettingsRequest};
use crate::error::AppResult;

pub async fn get_settings(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<AllSettings>> {
    let site_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'site_settings'")
        .fetch_optional(&state.db.pool)
        .await?;
    
    let currency_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'currency_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let site = if let Some(val) = site_val {
        serde_json::from_str(&val).unwrap_or(default_site_settings())
    } else {
        default_site_settings()
    };

    let currency = if let Some(val) = currency_val {
        serde_json::from_str(&val).unwrap_or(default_currency_settings())
    } else {
        default_currency_settings()
    };

    Ok(Json(AllSettings { site, currency }))
}

pub async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<AllSettings>> {
    if let Some(site) = request.site {
        let val = serde_json::to_string(&site).unwrap_or_default();
        sqlx::query("INSERT INTO settings (key, value) VALUES ('site_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(currency) = request.currency {
        let val = serde_json::to_string(&currency).unwrap_or_default();
        sqlx::query("INSERT INTO settings (key, value) VALUES ('currency_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    // Return the updated settings
    let site_val: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'site_settings'")
        .fetch_optional(&state.db.pool)
        .await?
        .unwrap_or_else(|| serde_json::to_string(&default_site_settings()).unwrap());

    let currency_val: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'currency_settings'")
        .fetch_optional(&state.db.pool)
        .await?
        .unwrap_or_else(|| serde_json::to_string(&default_currency_settings()).unwrap());

    let site = serde_json::from_str(&site_val).unwrap_or(default_site_settings());
    let currency = serde_json::from_str(&currency_val).unwrap_or(default_currency_settings());

    Ok(Json(AllSettings { site, currency }))
}

fn default_site_settings() -> SiteSettings {
    SiteSettings {
        name: "TokensByte".to_string(),
        title: "TokensByte - LLM API Gateway".to_string(),
        keywords: "LLM, API, Gateway, Rust".to_string(),
        description: "Next-gen LLM API Distribution & Management Platform".to_string(),
    }
}

fn default_currency_settings() -> CurrencySettings {
    CurrencySettings {
        default_currency: "CNY".to_string(),
        currency_symbol: "¥".to_string(),
        currency_unit: "元".to_string(),
        token_ratio: 1.0,
    }
}
