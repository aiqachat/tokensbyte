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
}

impl VolcConfig {
    pub fn from_map(map: &HashMap<String, String>) -> Option<Self> {
        let ak = map.get("volc_access_key")?.trim();
        let sk = map.get("volc_secret_key")?.trim();
        let app_id = map.get("volc_app_id").map(|s| s.trim().to_string()).unwrap_or_default();

        if ak.is_empty() || sk.is_empty() {
            return None;
        }

        Some(Self {
            access_key: ak.to_string(),
            secret_key: sk.to_string(),
            app_id,
        })
    }
}

pub struct VolcClient {
    config: VolcConfig,
    client: Client,
}

impl VolcClient {
    pub fn new(config: VolcConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
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

        // 3. Signature
        let k_date = self.hmac_sha256(format!("HMAC-V4{}", self.config.secret_key).as_bytes(), date_short.as_bytes());
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
        let host = format!("{}.volcengineapi.com", service);
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
            .body(payload)
            .send()
            .await?;

        let status = res.status();
        let text = res.text().await?;
        
        if !status.is_success() {
            return Err(anyhow!("Volcengine API error: {} - {}", status, text));
        }

        serde_json::from_str(&text).map_err(|e| anyhow!("Failed to parse Volcengine response: {} - Raw: {}", e, text))
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

#[derive(Serialize)]
pub struct CreateAssetRequest {
    #[serde(rename = "AssetType")]
    pub asset_type: String, // "Human"
    #[serde(rename = "AssetId")]
    pub asset_id: String,
    #[serde(rename = "AssetName")]
    pub asset_name: String,
    #[serde(rename = "AssetGroupId")]
    pub asset_group_id: Option<String>,
    #[serde(rename = "BinaryData")]
    pub binary_data: Option<String>, // Base64 for virtual portraits
}

#[derive(Deserialize, Debug)]
pub struct CreateAssetResponse {
    #[serde(rename = "ResponseMetadata")]
    pub metadata: ResponseMetadata,
    #[serde(rename = "Result")]
    pub result: Option<AssetInfo>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct AssetInfo {
    #[serde(rename = "AssetId")]
    pub asset_id: String,
    #[serde(rename = "Status")]
    pub status: String, // "Active", "Processing", etc.
}

#[derive(Serialize)]
pub struct GetAssetRequest {
    #[serde(rename = "AssetId")]
    pub asset_id: String,
}

#[derive(Deserialize, Debug)]
pub struct GetAssetResponse {
    #[serde(rename = "ResponseMetadata")]
    pub metadata: ResponseMetadata,
    #[serde(rename = "Result")]
    pub result: Option<AssetInfo>,
}
