use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChannelConfig {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub remark: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannelConfigRequest {
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelConfigRequest {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub remark: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChannelConfigListResponse {
    pub data: Vec<ChannelConfigSafe>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct ChannelConfigSafe {
    pub id: i64,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
    pub has_api_key: bool,
    pub remark: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<ChannelConfig> for ChannelConfigSafe {
    fn from(c: ChannelConfig) -> Self {
        ChannelConfigSafe {
            id: c.id,
            name: c.name,
            provider_type: c.provider_type,
            base_url: c.base_url,
            api_key: c.api_key.clone(),
            has_api_key: !c.api_key.is_empty(),
            remark: c.remark,
            created_at: c.created_at,
            updated_at: c.updated_at,
        }
    }
}
