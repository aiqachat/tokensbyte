use axum::{
    extract::State,
    Json,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::{SiteSettings, CurrencySettings, RegistrationSettings, SMTPSettings, MarketingSettings, AllSettings, UpdateSettingsRequest};
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
    
    let registration_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'registration_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let smtp_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'smtp_settings'")
        .fetch_optional(&state.db.pool)
        .await?;

    let marketing_val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'marketing_settings'")
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

    let registration = if let Some(val) = registration_val {
        serde_json::from_str(&val).unwrap_or(default_registration_settings())
    } else {
        default_registration_settings()
    };

    let smtp = if let Some(val) = smtp_val {
        serde_json::from_str(&val).unwrap_or(default_smtp_settings())
    } else {
        default_smtp_settings()
    };

    let marketing = if let Some(val) = marketing_val {
        serde_json::from_str(&val).unwrap_or(default_marketing_settings())
    } else {
        default_marketing_settings()
    };

    Ok(Json(AllSettings { site, currency, registration, smtp, marketing }))
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

    if let Some(registration) = request.registration {
        let val = serde_json::to_string(&registration).unwrap_or_default();
        sqlx::query("INSERT INTO settings (key, value) VALUES ('registration_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(smtp) = request.smtp {
        let val = serde_json::to_string(&smtp).unwrap_or_default();
        sqlx::query("INSERT INTO settings (key, value) VALUES ('smtp_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    if let Some(marketing) = request.marketing {
        let val = serde_json::to_string(&marketing).unwrap_or_default();
        sqlx::query("INSERT INTO settings (key, value) VALUES ('marketing_settings', ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value")
            .bind(val)
            .execute(&state.db.pool)
            .await?;
    }

    // Return the updated settings
    let site = get_setting::<SiteSettings>(&state, "site_settings", default_site_settings()).await?;
    let currency = get_setting::<CurrencySettings>(&state, "currency_settings", default_currency_settings()).await?;
    let registration = get_setting::<RegistrationSettings>(&state, "registration_settings", default_registration_settings()).await?;
    let smtp = get_setting::<SMTPSettings>(&state, "smtp_settings", default_smtp_settings()).await?;
    let marketing = get_setting::<MarketingSettings>(&state, "marketing_settings", default_marketing_settings()).await?;

    Ok(Json(AllSettings { site, currency, registration, smtp, marketing }))
}

async fn get_setting<T: serde::de::DeserializeOwned + Clone>(state: &Arc<AppState>, key: &str, default: T) -> AppResult<T> {
    let val: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db.pool)
        .await?;
    
    if let Some(v) = val {
        Ok(serde_json::from_str(&v).unwrap_or(default))
    } else {
        Ok(default)
    }
}

pub fn default_site_settings() -> SiteSettings {
    SiteSettings {
        name: "TokensByte".to_string(),
        title: "TokensByte - LLM API Gateway".to_string(),
        keywords: "LLM, API, Gateway, Rust".to_string(),
        description: "Next-gen LLM API Distribution & Management Platform".to_string(),
    }
}

pub fn default_currency_settings() -> CurrencySettings {
    CurrencySettings {
        default_currency: "CNY".to_string(),
        currency_symbol: "¥".to_string(),
        currency_unit: "元".to_string(),
        token_ratio: 1.0,
    }
}

pub fn default_registration_settings() -> RegistrationSettings {
    RegistrationSettings {
        enable_username_registration: false,
        enable_email_registration: false,
        enable_password_recovery: false,
    }
}

pub fn default_smtp_settings() -> SMTPSettings {
    SMTPSettings {
        host: "smtp.example.com".to_string(),
        port: 465,
        username: "".to_string(),
        password: "".to_string(),
        from_address: "noreply@example.com".to_string(),
        from_name: "TokensByte".to_string(),
    }
}

pub fn default_marketing_settings() -> MarketingSettings {
    MarketingSettings {
        enable_registration_gift: false,
        gift_mode: "fixed".to_string(),
        fixed_amount: 0.0,
        min_amount: 0.0,
        max_amount: 0.0,
    }
}

