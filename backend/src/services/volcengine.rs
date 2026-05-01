#![allow(dead_code)]
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use reqwest::{Client, Method};
use anyhow::{Result, anyhow};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolcConfig {
    pub access_key: String,
    pub secret_key: String,
    pub app_id: String,
    pub project_name: String,
    pub group_id: Option<String>,
}

impl VolcConfig {
    pub fn from_map(map: &HashMap<String, String>) -> Option<Self> {
        let ak = map.get("volc_access_key")?.trim();
        let sk = map.get("volc_secret_key")?.trim();
        let app_id = map.get("volc_app_id").map(|s| s.trim().to_string()).unwrap_or_default();
        let project_name = map.get("volc_project_name")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "default".to_string());
        let project_name = if project_name.is_empty() { "default".to_string() } else { project_name };

        let group_id = map.get("volc_group_id").map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

        if ak.is_empty() || sk.is_empty() {
            return None;
        }

        Some(Self {
            access_key: ak.to_string(),
            secret_key: sk.to_string(),
            app_id,
            project_name,
            group_id,
        })
    }
}

#[derive(Clone)]
pub struct VolcClient {
    config: VolcConfig,
    client: Client,
    logger: Option<(crate::db::Database, String, String)>, // (db, user_id, source)
}

impl VolcClient {
    pub fn new(config: VolcConfig) -> Self {
        Self {
            config,
            client: Client::new(),
            logger: None,
        }
    }

    pub fn with_logger(mut self, db: crate::db::Database, user_id: String) -> Self {
        self.logger = Some((db, user_id, "page".to_string()));
        self
    }

    /// 设置日志来源标识：api_proxy / page / relay_convert
    pub fn with_source(mut self, source: &str) -> Self {
        if let Some(ref mut l) = self.logger {
            l.2 = source.to_string();
        }
        self
    }

    /// Implement Volcengine Signature V4
    fn sign(
        &self,
        method: &Method,
        host: &str,
        path: &str,
        query: &str,
        service: &str,
        region: &str,
        now: DateTime<Utc>,
        payload: &[u8],
    ) -> String {
        let x_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_short = now.format("%Y%m%d").to_string();

        let hashed_payload = hex::encode(Sha256::digest(payload));

        // 1. Canonical Request
        let canonical_headers = format!(
            "content-type:application/json\nhost:{}\nx-content-sha256:{}\nx-date:{}\n",
            host, hashed_payload, x_date
        );
        let signed_headers = "content-type;host;x-content-sha256;x-date";

        let canonical_request = format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method.as_str(),
            path,
            query,
            canonical_headers,
            signed_headers,
            hashed_payload
        );
        let hashed_canonical_request = hex::encode(Sha256::digest(canonical_request.as_bytes()));

        // 2. String to Sign
        let credential_scope = format!("{}/{}/{}/request", date_short, region, service);
        let string_to_sign = format!(
            "HMAC-SHA256\n{}\n{}\n{}",
            x_date,
            credential_scope,
            hashed_canonical_request
        );

        // 3. Signature - 使用原始 SecretKey（不加前缀），与火山引擎官方 SDK 一致
        let k_date = self.hmac_sha256(self.config.secret_key.as_bytes(), date_short.as_bytes());
        let k_region = self.hmac_sha256(&k_date, region.as_bytes());
        let k_service = self.hmac_sha256(&k_region, service.as_bytes());
        let k_signing = self.hmac_sha256(&k_service, b"request");

        let signature = hex::encode(self.hmac_sha256(&k_signing, string_to_sign.as_bytes()));

        format!(
            "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.config.access_key, credential_scope, signed_headers, signature
        )
    }

    fn hmac_sha256(&self, key: &[u8], data: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }

    pub async fn call_api<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        service: &str,
        region: &str,
        action: &str,
        version: &str,
        body: T,
    ) -> Result<R> {
        // ark 素材资产管理 API 使用 open.volcengineapi.com，其他服务如 visual 仍用 {service}.volcengineapi.com
        let host = if service == "ark" {
            "open.volcengineapi.com".to_string()
        } else {
            format!("{}.volcengineapi.com", service)
        };
        let url = format!("https://{}/?Action={}&Version={}", host, action, version);
        let path = "/";
        let query = format!("Action={}&Version={}", action, version);
        let now = Utc::now();
        let payload = serde_json::to_vec(&body)?;

        let auth = self.sign(&Method::POST, &host, path, &query, service, region, now, &payload);

        let res = self.client.post(&url)
            .header("Content-Type", "application/json")
            .header("X-Date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("X-Content-Sha256", hex::encode(Sha256::digest(&payload)))
            .header("Authorization", auth)
            .body(payload.clone())
            .send()
            .await?;

        let status = res.status();
        let text = res.text().await?;
        let status_code = status.as_u16();

        // 异步记录日志：不阻塞主流程，直接丢进数据库
        if let Some((db, user_id, source)) = &self.logger {
            let req_payload = String::from_utf8_lossy(&payload).into_owned();
            let res_payload = text.clone();
            let db_clone = db.clone();
            let uid_clone = user_id.clone();
            let action_clone = action.to_string();
            let source_clone = source.clone();
            
            tokio::spawn(async move {
                let _ = sqlx::query(&db_clone.format_query(
                    "INSERT INTO plugin_api_logs (user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, source) 
                     VALUES (?, 'asset_manager', ?, ?, ?, ?, ?)"
                ))
                .bind(&uid_clone)
                .bind(&action_clone)
                .bind(&req_payload)
                .bind(&res_payload)
                .bind(status_code as i32)
                .bind(&source_clone)
                .execute(&db_clone.pool)
                .await;
            });
        }

        if !status.is_success() {
            return Err(anyhow!("Volcengine API error: {} - {}", status, text));
        }

        // 火山引擎 API 响应有两种结构：
        // 1. visual 等服务：Response struct 自己定义了 ResponseMetadata + Result → 直接反序列化
        // 2. ark 素材 API：Response struct 只定义了 Result 内部字段 → 需要提取 Result 再反序列化
        let raw: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| anyhow!("Failed to parse Volcengine response JSON: {} - Raw: {}", e, text))?;

        // 先尝试直接反序列化整个响应（兼容自带 ResponseMetadata 包装的结构体）
        if let Ok(parsed) = serde_json::from_value::<R>(raw.clone()) {
            return Ok(parsed);
        }

        // 再尝试从 "Result" 字段提取（Ark API 的标准响应格式）
        if let Some(result_val) = raw.get("Result") {
            return serde_json::from_value(result_val.clone())
                .map_err(|e| anyhow!("Failed to parse Volcengine Result: {} - Raw: {}", e, text));
        }

        Err(anyhow!("Volcengine response missing 'Result' field - Raw: {}", text))
    }
}

// --- Specific API Request/Response Structs ---

#[derive(Serialize)]
pub struct CreateVisualValidateSessionRequest {
    #[serde(rename = "AppId")]
    pub app_id: String,
    #[serde(rename = "CallbackUrl")]
    pub callback_url: String,
    #[serde(rename = "TokenValidTime")]
    pub token_valid_time: i32,
}

#[derive(Deserialize, Debug)]
pub struct CreateVisualValidateSessionResponse {
    #[serde(rename = "ResponseMetadata")]
    pub metadata: ResponseMetadata,
    #[serde(rename = "Result")]
    pub result: Option<SessionResult>,
}

#[derive(Deserialize, Debug)]
pub struct ResponseMetadata {
    #[serde(rename = "RequestId")]
    pub request_id: String,
    #[serde(rename = "Action")]
    pub action: String,
    #[serde(rename = "Version")]
    pub version: String,
    #[serde(rename = "Service")]
    pub service: String,
    #[serde(rename = "Region")]
    pub region: String,
    #[serde(rename = "Error")]
    pub error: Option<ResponseError>,
}

#[derive(Deserialize, Debug)]
pub struct ResponseError {
    #[serde(rename = "Code")]
    pub code: String,
    #[serde(rename = "Message")]
    pub message: String,
}

#[derive(Deserialize, Debug)]
pub struct SessionResult {
    #[serde(rename = "BytedToken")]
    pub byted_token: String,
    #[serde(rename = "H5Link")]
    pub h5_link: String,
}

#[derive(Serialize)]
pub struct GetVisualValidateResultRequest {
    #[serde(rename = "AppId")]
    pub app_id: String,
    #[serde(rename = "BytedToken")]
    pub byted_token: String,
}

#[derive(Deserialize, Debug)]
pub struct GetVisualValidateResultResponse {
    #[serde(rename = "ResponseMetadata")]
    pub metadata: ResponseMetadata,
    #[serde(rename = "Result")]
    pub result: Option<ValidationResult>,
}

#[derive(Deserialize, Debug)]
pub struct ValidationResult {
    #[serde(rename = "Status")]
    pub status: i32, // 0-Success, 1-Failed
    #[serde(rename = "AssetGroupId")]
    pub asset_group_id: Option<String>,
}

// --- 方舟 Ark 素材资产 API (ServiceName=ark, Version=2024-01-01) ---

/// CreateAssetGroup 创建素材资产组合
#[derive(Serialize)]
pub struct CreateAssetGroupRequest {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "Description")]
    pub description: String,
    #[serde(rename = "GroupType", skip_serializing_if = "Option::is_none")]
    pub group_type: Option<String>, // 默认 AIGC
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>, // 默认 default
}

#[derive(Deserialize, Debug)]
pub struct CreateAssetGroupResponse {
    #[serde(rename = "Id")]
    pub id: String,
}

/// CreateAsset 创建素材资产（上传到方舟素材库）
#[derive(Serialize)]
pub struct CreateAssetRequest {
    #[serde(rename = "GroupId")]
    pub group_id: String,
    #[serde(rename = "URL")]
    pub url: String,  // 公网可访问的图片 URL
    #[serde(rename = "AssetType")]
    pub asset_type: String, // "Image" / "Video" / "Audio"
    #[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct CreateAssetResponse {
    #[serde(rename = "Id")]
    pub id: String,  // asset-20260318071009-*****
}

/// GetAsset 查询素材资产信息
#[derive(Serialize)]
pub struct GetAssetRequest {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GetAssetResponse {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Status")]
    pub status: String, // "Active" / "Processing" / "Failed"
    #[serde(rename = "FailCode", default)]
    pub fail_code: Option<String>,
    #[serde(rename = "FailReason", default)]
    pub fail_reason: Option<String>,
    #[serde(rename = "GroupId")]
    pub group_id: Option<String>,
    #[serde(rename = "AssetType")]
    pub asset_type: Option<String>,
    #[serde(rename = "URL")]
    pub url: Option<String>,
    #[serde(rename = "CreateTime")]
    pub create_time: Option<String>,
    #[serde(rename = "ProjectName")]
    pub project_name: Option<String>,
}

/// DeleteAsset 删除素材资产
#[derive(Serialize)]
pub struct DeleteAssetRequest {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct DeleteAssetResponse {}

/// UpdateAssetGroup 更新素材资产组合
#[derive(Serialize)]
pub struct UpdateAssetGroupRequest {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "Description", skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateAssetGroupResponse {
    #[serde(rename = "Id")]
    pub id: String,
}

/// DeleteAssetGroup 删除素材资产组合
#[derive(Serialize)]
pub struct DeleteAssetGroupRequest {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct DeleteAssetGroupResponse {}
