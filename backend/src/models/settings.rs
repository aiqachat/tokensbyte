use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SiteSettings {
    pub name: String,
    pub title: String,
    pub keywords: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrencySettings {
    pub default_currency: String,
    pub currency_symbol: String,
    pub currency_unit: String,
    pub token_ratio: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistrationSettings {
    pub enable_username_registration: bool,
    pub enable_email_registration: bool,
    pub enable_password_recovery: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SMTPSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
    pub from_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AllSettings {
    pub site: SiteSettings,
    pub currency: CurrencySettings,
    pub registration: RegistrationSettings,
    pub smtp: SMTPSettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub site: Option<SiteSettings>,
    pub currency: Option<CurrencySettings>,
    pub registration: Option<RegistrationSettings>,
    pub smtp: Option<SMTPSettings>,
}
