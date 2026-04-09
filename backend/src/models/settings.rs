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
pub struct AllSettings {
    pub site: SiteSettings,
    pub currency: CurrencySettings,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub site: Option<SiteSettings>,
    pub currency: Option<CurrencySettings>,
}
