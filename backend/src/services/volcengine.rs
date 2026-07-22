/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

#![allow(dead_code)]
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

type HmacSha256 = Hmac<Sha256>;

/// HMAC-SHA256 签名（公共工具函数，供火山引擎所有服务复用）
pub fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// SHA256 十六进制哈希（公共工具函数）
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// 火山引擎 HMAC-SHA256 签名（Signature V4）— 统一公共函数
/// 供 VolcClient、volcengine_billing、即梦 CV 等所有火山引擎服务复用
/// 返回 (authorization_header, x_date, payload_sha256_hex)
pub fn volcengine_sign(
    access_key: &str,
    secret_key: &str,
    method: &str,
    host: &str,
    path: &str,
    query: &str,
    service: &str,
    region: &str,
    payload: &[u8],
) -> (String, String, String) {
    let now = chrono::Utc::now();
    let x_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let hashed_payload = sha256_hex(payload);

    // 1. Canonical Request
    let canonical_headers = format!(
        "content-type:application/json\nhost:{}\nx-content-sha256:{}\nx-date:{}\n",
        host, hashed_payload, x_date
    );
    let signed_headers = "content-type;host;x-content-sha256;x-date";

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method, path, query, canonical_headers, signed_headers, hashed_payload
    );
    let hashed_canonical_request = sha256_hex(canonical_request.as_bytes());

    // 2. String to Sign
    let credential_scope = format!("{}/{}/{}/request", date_short, region, service);
    let string_to_sign = format!(
        "HMAC-SHA256\n{}\n{}\n{}",
        x_date, credential_scope, hashed_canonical_request
    );

    // 3. Signing Key — 使用原始 SecretKey（不加前缀），与火山引擎官方 SDK 一致
    let k_date = hmac_sha256(secret_key.as_bytes(), date_short.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    let k_signing = hmac_sha256(&k_service, b"request");

    let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    // 4. Authorization Header
    let authorization = format!(
        "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    (authorization, x_date, hashed_payload)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolcConfig {
    pub access_key: String,
    pub secret_key: String,
    pub app_id: String,
    pub project_name: String,
    pub group_id: Option<String>,
    pub region: String, // cn-beijing (国内版) 或 ap-southeast-1 (国际版)
}

impl VolcConfig {
    pub fn from_map(map: &HashMap<String, String>) -> Option<Self> {
        let ak = map.get("volc_access_key")?.trim();
        let sk = map.get("volc_secret_key")?.trim();
        let app_id = map
            .get("volc_app_id")
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let project_name = map
            .get("volc_project_name")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "default".to_string());
        let project_name = if project_name.is_empty() {
            "default".to_string()
        } else {
            project_name
        };

        let group_id = map
            .get("volc_group_id")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let region = map
            .get("volc_region")
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "cn-beijing".to_string());
        let region = if region.is_empty() {
            "cn-beijing".to_string()
        } else {
            region
        };

        if ak.is_empty() || sk.is_empty() {
            return None;
        }

        Some(Self {
            access_key: ak.to_string(),
            secret_key: sk.to_string(),
            app_id,
            project_name,
            group_id,
            region,
        })
    }
}

#[derive(Clone)]
pub struct VolcClient {
    config: VolcConfig,
    client: Client,
    logger: Option<(crate::db::Database, String, String, String)>, // (db, user_id, source, plugin_name)
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
        self.logger = Some((db, user_id, "page".to_string(), "asset_manager".to_string()));
        self
    }

    /// 设置日志来源标识：api_proxy / page / relay_convert
    pub fn with_source(mut self, source: &str) -> Self {
        if let Some(ref mut l) = self.logger {
            l.2 = source.to_string();
        }
        self
    }

    /// 设置插件命名空间：决定 API 日志写入哪个插件（asset_manager / asset_manager_intl）
    pub fn with_plugin_name(mut self, plugin_name: &str) -> Self {
        if let Some(ref mut l) = self.logger {
            l.3 = plugin_name.to_string();
        }
        self
    }

    /// Implement Volcengine Signature V4（委托公共签名函数）
    fn sign(
        &self,
        method: &Method,
        host: &str,
        path: &str,
        query: &str,
        service: &str,
        region: &str,
        _now: DateTime<Utc>,
        payload: &[u8],
    ) -> String {
        let (auth, _, _) = volcengine_sign(
            &self.config.access_key,
            &self.config.secret_key,
            method.as_str(),
            host,
            path,
            query,
            service,
            region,
            payload,
        );
        auth
    }

    fn hmac_sha256(&self, key: &[u8], data: &[u8]) -> Vec<u8> {
        hmac_sha256(key, data)
    }

    pub async fn call_api<T: Serialize, R: for<'de> Deserialize<'de>>(
        &self,
        service: &str,
        region: &str,
        action: &str,
        version: &str,
        body: T,
    ) -> Result<R> {
        // 根据 region 区分国内版与国际版（BytePlus）的 API 域名
        // 国内版: open.volcengineapi.com / {service}.volcengineapi.com
        // 国际版: open.byteplusapi.com / {service}.byteplusapi.com
        let is_international = region.starts_with("ap-");
        let base_domain = if is_international {
            "byteplusapi.com"
        } else {
            "volcengineapi.com"
        };

        let host = if service == "ark" {
            // ark 素材资产管理 API 统一使用 open.{domain}
            format!("open.{}", base_domain)
        } else {
            format!("{}.{}", service, base_domain)
        };
        let url = format!("https://{}/?Action={}&Version={}", host, action, version);
        let path = "/";
        let query = format!("Action={}&Version={}", action, version);
        let payload = serde_json::to_vec(&body)?;

        let (auth, x_date, payload_hash) = volcengine_sign(
            &self.config.access_key,
            &self.config.secret_key,
            "POST",
            &host,
            path,
            &query,
            service,
            region,
            &payload,
        );

        let res = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("X-Date", &x_date)
            .header("X-Content-Sha256", &payload_hash)
            .header("Authorization", auth)
            .body(payload.clone())
            .send()
            .await?;

        let status = res.status();
        let text = res.text().await?;
        let status_code = status.as_u16();

        // 异步记录日志：不阻塞主流程，直接丢进数据库
        if let Some((db, user_id, source, plugin_name)) = &self.logger {
            let req_payload = String::from_utf8_lossy(&payload).into_owned();
            let res_payload = text.clone();
            let db_clone = db.clone();
            let uid_clone = user_id.clone();
            let action_clone = action.to_string();
            let source_clone = source.clone();
            let plugin_name_clone = plugin_name.clone();

            tokio::spawn(async move {
                let _ = sqlx::query(&db_clone.format_query(
                    "INSERT INTO plugin_api_logs (user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, source) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)"
                ))
                .bind(&uid_clone)
                .bind(&plugin_name_clone)
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
        let raw: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
            anyhow!(
                "Failed to parse Volcengine response JSON: {} - Raw: {}",
                e,
                text
            )
        })?;

        // 先尝试直接反序列化整个响应（兼容自带 ResponseMetadata 包装的结构体）
        if let Ok(parsed) = serde_json::from_value::<R>(raw.clone()) {
            return Ok(parsed);
        }

        // 再尝试从 "Result" 字段提取（Ark API 的标准响应格式）
        if let Some(result_val) = raw.get("Result") {
            return serde_json::from_value(result_val.clone())
                .map_err(|e| anyhow!("Failed to parse Volcengine Result: {} - Raw: {}", e, text));
        }

        Err(anyhow!(
            "Volcengine response missing 'Result' field - Raw: {}",
            text
        ))
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AssetModerationConfig {
    #[serde(rename = "Strategy")]
    pub strategy: String,
}

/// CreateAsset 创建素材资产（上传到方舟素材库）
#[derive(Serialize)]
pub struct CreateAssetRequest {
    #[serde(rename = "GroupId")]
    pub group_id: String,
    #[serde(rename = "URL")]
    pub url: String, // 公网可访问的图片 URL
    #[serde(rename = "AssetType")]
    pub asset_type: String, // "Image" / "Video" / "Audio"
    #[serde(rename = "Name", skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "ProjectName", skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(rename = "Moderation", skip_serializing_if = "Option::is_none")]
    pub moderation: Option<AssetModerationConfig>,
}

#[derive(Deserialize, Debug)]
pub struct CreateAssetResponse {
    #[serde(rename = "Id")]
    pub id: String, // asset-20260318071009-*****
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
    #[serde(rename = "Error", default)]
    pub error: Option<GetAssetResponseError>,
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

#[derive(Deserialize, Debug, Clone)]
pub struct GetAssetResponseError {
    #[serde(rename = "Code")]
    pub code: String,
    #[serde(rename = "Message")]
    pub message: String,
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

/// GetModerationResult 审核拦截原因查询（ServiceName=ark, Version=2024-01-01）
#[derive(Serialize)]
pub struct GetModerationResultRequest {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Type")]
    pub id_type: String, // asset_id / task_id / request_id
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ModerationBlockReason {
    // 文档示例为 snake_case；Ark 实际响应常见 PascalCase，双兼容
    #[serde(default, alias = "Label")]
    pub label: Option<String>,
    #[serde(default, alias = "SubLabel")]
    pub sub_label: Option<String>,
    #[serde(default, alias = "Detail")]
    pub detail: Option<String>,
}

/// 注意：block_reasons 不可加 `default`。
/// `VolcClient::call_api` 会先尝试整包反序列化；若字段可缺省，会误把
/// `{ResponseMetadata, Result:{...}}` 解析成空列表，永远读不到 Result。
#[derive(Deserialize, Debug)]
pub struct GetModerationResultResponse {
    #[serde(alias = "BlockReasons", rename = "block_reasons")]
    pub block_reasons: Vec<ModerationBlockReason>,
}
