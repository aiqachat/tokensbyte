use serde::{Deserialize, Serialize};

fn default_rate() -> f64 {
    1.0
}

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
    #[sqlx(default)]
    pub yid: String,
    #[sqlx(default)]
    pub sort_order: i32,
    pub rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannelConfigRequest {
    pub name: String,
    #[serde(default)]
    pub provider_type: String,
    pub base_url: String,
    pub api_key: String,
    pub remark: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default = "default_rate")]
    pub rate: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelConfigRequest {
    pub name: Option<String>,
    pub provider_type: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub remark: Option<String>,
    pub sort_order: Option<i32>,
    pub rate: Option<f64>,
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
    pub yid: String,
    pub sort_order: i32,
    pub rate: f64,
}

impl ChannelConfigSafe {
    /// 根据用户角色构建安全的响应数据
    /// - 管理员：返回原文密钥，前端通过 Input.Password 眼睛图标控制显隐
    /// - 非管理员：返回脱敏密钥，保证数据安全
    pub fn from_with_role(c: ChannelConfig, is_admin: bool) -> Self {
        let key = if is_admin {
            c.api_key.clone()
        } else {
            crate::models::channel::mask_secret(&c.api_key)
        };
        ChannelConfigSafe {
            id: c.id,
            name: c.name,
            provider_type: c.provider_type,
            base_url: c.base_url,
            has_api_key: !c.api_key.is_empty(),
            api_key: key,
            remark: c.remark,
            created_at: c.created_at,
            updated_at: c.updated_at,
            yid: c.yid,
            sort_order: c.sort_order,
            rate: c.rate,
        }
    }
}
