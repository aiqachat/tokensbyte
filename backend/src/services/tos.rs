#![allow(dead_code)]
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::future::Future;
use std::time::Duration;
type HmacSha256 = Hmac<Sha256>;

/// 内部 HMAC-SHA256 签名辅助函数（供 download_file / list_folder / generate_presigned_put_url 共用）
fn hmac_sign(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key error");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

use async_trait::async_trait;
use futures::future::BoxFuture;
use tokio::runtime::Handle;
use ve_tos_rust_sdk::asynchronous::bucket::BucketAPI;
use ve_tos_rust_sdk::asynchronous::object::ObjectAPI;
use ve_tos_rust_sdk::asynchronous::tos;
use ve_tos_rust_sdk::asynchronous::tos::AsyncRuntime;
use ve_tos_rust_sdk::bucket::ListBucketsInput;
use ve_tos_rust_sdk::object::DeleteObjectInput;
use ve_tos_rust_sdk::object::PutObjectFromBufferInput;

/// TOS 存储配置
#[derive(Debug, Clone)]
pub struct TosConfig {
    pub access_key: String,
    pub secret_key: String,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub path_prefix: String,
    pub custom_domain: String,
}

impl TosConfig {
    pub fn from_map(map: &HashMap<String, String>) -> Option<Self> {
        let ak = map.get("tos_access_key")?.trim().to_string();
        let sk = map.get("tos_secret_key")?.trim().to_string();
        let endpoint = map.get("tos_endpoint")?.trim().to_string();
        let region = map.get("tos_region")?.trim().to_string();
        let bucket = map.get("tos_bucket")?.trim().to_string();

        if ak.is_empty()
            || sk.is_empty()
            || endpoint.is_empty()
            || region.is_empty()
            || bucket.is_empty()
        {
            return None;
        }

        Some(Self {
            access_key: ak,
            secret_key: sk,
            endpoint,
            region,
            bucket,
            path_prefix: map
                .get("tos_path_prefix")
                .map(|s| s.trim().to_string())
                .unwrap_or_default(),
            custom_domain: map
                .get("tos_custom_domain")
                .map(|s| s.trim().to_string())
                .unwrap_or_default(),
        })
    }

    /// 生成文件的公开访问 URL（可走自定义域名 / CDN）
    pub fn file_url(&self, object_key: &str) -> String {
        let key = object_key.trim_start_matches('/');
        if !self.custom_domain.is_empty() {
            let raw = self.custom_domain.trim().trim_end_matches('/');
            let (scheme, host) = if let Some(h) = raw.strip_prefix("https://") {
                ("https", h.trim_end_matches('/'))
            } else if let Some(h) = raw.strip_prefix("http://") {
                ("http", h.trim_end_matches('/'))
            } else {
                ("https", raw)
            };
            return format!("{}://{}/{}", scheme, host, key);
        }
        self.official_request_target(key).2
    }

    /// 直传专用：官方 endpoint 的 `(host, path, url)`，忽略自定义域名
    /// 保证签名 host 与浏览器 PUT Host 一致，并规避 CDN 改写 Host
    fn official_request_target(&self, key: &str) -> (String, String, String) {
        let ep = self.endpoint.trim().trim_end_matches('/');
        let ep_domain = if let Some(h) = ep.strip_prefix("https://") {
            h
        } else if let Some(h) = ep.strip_prefix("http://") {
            h
        } else {
            ep
        };

        // Bucket 名含点号时用 Path-Style，避免 SSL 证书与 Virtual-Hosted 不匹配
        let (host, path) = if self.bucket.contains('.') {
            (ep_domain.to_string(), format!("/{}/{}", self.bucket, key))
        } else {
            (
                format!("{}.{}", self.bucket, ep_domain),
                format!("/{}", key),
            )
        };
        let url = format!("https://{}{}", host, path);
        (host, path, url)
    }

    /// 生成完整的 object key（含路径前缀）
    pub fn full_key(&self, filename: &str) -> String {
        if self.path_prefix.is_empty() {
            filename.to_string()
        } else {
            let prefix = self.path_prefix.trim_end_matches('/');
            format!("{}/{}", prefix, filename)
        }
    }

    /// 从 file_url 反推 object key
    /// 优先按当前 file_url 规则匹配；若开启了自定义域名，再回退官方 endpoint（兼容历史官方 URL）
    pub fn extract_object_key(&self, file_url: &str) -> Option<String> {
        let try_base = |base: &str| -> Option<String> {
            let prefix = format!("{}/", base.trim_end_matches('/'));
            file_url.strip_prefix(&prefix).map(|s| s.to_string())
        };

        if let Some(key) = try_base(&self.file_url("")) {
            return Some(key);
        }
        if !self.custom_domain.is_empty() {
            return try_base(&self.official_request_target("").2);
        }
        None
    }
}

/// Tokio 运行时适配器
#[derive(Debug, Default)]
pub struct TokioRuntime {}

#[async_trait]
impl AsyncRuntime for TokioRuntime {
    type JoinError = tokio::task::JoinError;

    async fn sleep(&self, duration: Duration) {
        tokio::time::sleep(duration).await;
    }

    fn spawn<'a, F>(&self, future: F) -> BoxFuture<'a, Result<F::Output, Self::JoinError>>
    where
        F: Future + Send + 'static,
        F::Output: Send + 'static,
    {
        Box::pin(Handle::current().spawn(future))
    }

    fn block_on<F: Future>(&self, future: F) -> F::Output {
        Handle::current().block_on(future)
    }
}

/// 测试 TOS 连接
pub async fn test_connection(config: &TosConfig) -> Result<String, String> {
    let client = tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(10000)
        .max_retry_count(2)
        .ak(&config.access_key)
        .sk(&config.secret_key)
        .region(&config.region)
        .endpoint(&config.endpoint)
        .build()
        .map_err(|e| format!("创建 TOS 客户端失败: {:?}", e))?;

    match client.list_buckets(&ListBucketsInput::new()).await {
        Ok(output) => {
            let names: Vec<String> = output
                .buckets()
                .iter()
                .map(|b| b.name().to_string())
                .collect();
            if names.contains(&config.bucket) {
                Ok(format!("连接成功，已找到目标 Bucket: {}", config.bucket))
            } else {
                Ok(format!(
                    "连接成功，但未找到 Bucket '{}'，可用: {:?}",
                    config.bucket, names
                ))
            }
        }
        Err(e) => Err(format!("连接失败: {:?}", e)),
    }
}

/// 上传文件到 TOS（显式设置 x-tos-acl: default 继承桶 ACL）
pub async fn upload_file(
    config: &TosConfig,
    object_key: &str,
    data: Vec<u8>,
    content_type: &str,
    tags: Option<&str>,
) -> Result<String, String> {
    let client = tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(60000)
        .max_retry_count(3)
        .ak(&config.access_key)
        .sk(&config.secret_key)
        .region(&config.region)
        .endpoint(&config.endpoint)
        .build()
        .map_err(|e| format!("创建 TOS 客户端失败: {:?}", e))?;

    let mut input = PutObjectFromBufferInput::new_with_content(&config.bucket, object_key, data);
    if !content_type.is_empty() {
        input.set_content_type(content_type);
    }
    if let Some(t) = tags {
        input.set_tagging(t);
    }
    // 显式设置 x-tos-acl: default 继承桶 ACL（SDK 的 ACLType 枚举不含 default，故通过自定义请求头注入）
    let mut extra_headers = std::collections::HashMap::new();
    extra_headers.insert("x-tos-acl".to_string(), "default".to_string());
    input.set_request_header(extra_headers);

    client
        .put_object_from_buffer(&input)
        .await
        .map_err(|e| format!("上传失败: {:?}", e))?;

    Ok(config.file_url(object_key))
}

/// 删除 TOS 文件
pub async fn delete_file(config: &TosConfig, object_key: &str) -> Result<(), String> {
    let client = tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(10000)
        .max_retry_count(2)
        .ak(&config.access_key)
        .sk(&config.secret_key)
        .region(&config.region)
        .endpoint(&config.endpoint)
        .build()
        .map_err(|e| format!("创建 TOS 客户端失败: {:?}", e))?;

    let input = DeleteObjectInput::new(&config.bucket, object_key);
    client
        .delete_object(&input)
        .await
        .map_err(|e| format!("删除失败: {:?}", e))?;

    Ok(())
}

/// 从 TOS 下载文件（通过 S3 兼容 REST API）
pub async fn download_file(config: &TosConfig, object_key: &str) -> Result<Vec<u8>, String> {
    let ep = config.endpoint.trim_end_matches('/');
    let ep_domain = if ep.starts_with("https://") {
        &ep[8..]
    } else if ep.starts_with("http://") {
        &ep[7..]
    } else {
        ep
    };

    let host = if config.bucket.contains('.') {
        ep_domain.to_string()
    } else {
        format!("{}.{}", config.bucket, ep_domain)
    };

    let path = if config.bucket.contains('.') {
        format!("/{}/{}", config.bucket, object_key)
    } else {
        format!("/{}", object_key)
    };

    let now = chrono::Utc::now();
    let date_str = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let canonical_request = format!(
        "GET\n{}\n\nhost:{}\nx-tos-date:{}\n\nhost;x-tos-date\n{}",
        path, host, date_str, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    let credential_scope = format!("{}/{}/tos/request", date_short, config.region);
    let canonical_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str, credential_scope, canonical_hash
    );

    let k_date = hmac_sign(config.secret_key.as_bytes(), date_short.as_bytes());
    let k_region = hmac_sign(&k_date, config.region.as_bytes());
    let k_service = hmac_sign(&k_region, b"tos");
    let k_signing = hmac_sign(&k_service, b"request");
    let signature = hex::encode(hmac_sign(&k_signing, string_to_sign.as_bytes()));

    let auth_header = format!(
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders=host;x-tos-date,Signature={}",
        config.access_key, credential_scope, signature
    );

    let url = format!("https://{}{}", host, path);

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Host", &host)
        .header("x-tos-date", &date_str)
        .header("Authorization", &auth_header)
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("TOS 下载请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("TOS 下载失败 ({}): {}", status, body));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取文件数据失败: {}", e))?;
    Ok(bytes.to_vec())
}

/// 生成预签名 PUT URL（前端直传 TOS 专用）
/// - 有效期 expires_secs 秒，足够完成单次上传，降低 URL 泄露窗口
/// - 仅签名 host header（TOS 预签名 URL 规范），Content-Type 由前端上传时携带但不参与签名
/// - Object Key 路径已含用户 uid/project_id，即使 URL 泄露也只能写入该用户目录
/// - 直传 URL 始终使用官方 endpoint（与自定义域名/CDN 解耦），公开访问仍走 file_url 自定义域名
/// 注意：canonical request 中的 X-Tos-SignedHeaders 必须与 query string 中的值严格一致，否则 403
pub fn generate_presigned_put_url(
    config: &TosConfig,
    object_key: &str,
    expires_secs: u64,
) -> String {
    // 签名 host ≡ 浏览器 PUT 的 Host（官方域名）；避免自定义域名签名/URL 分裂及 CDN 改写 Host
    let (host, path, base_url) = config.official_request_target(object_key.trim_start_matches('/'));

    let now = chrono::Utc::now();
    let date_str = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    let credential_scope = format!("{}/{}/tos/request", date_short, config.region);
    // Credential 值需要 URL 编码（含 / 符号）
    let credential_val = format!("{}/{}", config.access_key, credential_scope);
    let credential_encoded = urlencoding::encode(&credential_val).to_string();

    // Query String 参数严格按字母序排列（TOS 规范要求）
    // X-Tos-SignedHeaders 只包含 host，与下方 canonical request 完全一致
    let signed_headers = "host";
    let query = format!(
        "X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential={cred}&X-Tos-Date={date}&X-Tos-Expires={exp}&X-Tos-SignedHeaders={sh}",
        cred = credential_encoded,
        date = date_str,
        exp = expires_secs,
        sh = signed_headers,
    );

    // Canonical Request：signed headers 仅含 host，与 X-Tos-SignedHeaders 严格对应
    let canonical_request = format!(
        "PUT\n{}\n{}\nhost:{}\n\n{}\nUNSIGNED-PAYLOAD",
        path, query, host, signed_headers
    );

    let canonical_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str, credential_scope, canonical_hash
    );

    let k_date = hmac_sign(config.secret_key.as_bytes(), date_short.as_bytes());
    let k_region = hmac_sign(&k_date, config.region.as_bytes());
    let k_service = hmac_sign(&k_region, b"tos");
    let k_signing = hmac_sign(&k_service, b"request");
    let signature = hex::encode(hmac_sign(&k_signing, string_to_sign.as_bytes()));

    format!("{}?{}&X-Tos-Signature={}", base_url, query, signature)
}

use ve_tos_rust_sdk::common::{Tag, TagSet};
use ve_tos_rust_sdk::object::{GetObjectTaggingInput, PutObjectTaggingInput};

/// 获取 TOS 文件标签
pub async fn get_object_tags(
    config: &TosConfig,
    object_key: &str,
) -> Result<HashMap<String, String>, String> {
    let client = tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(10000)
        .max_retry_count(2)
        .ak(&config.access_key)
        .sk(&config.secret_key)
        .region(&config.region)
        .endpoint(&config.endpoint)
        .build()
        .map_err(|e| format!("创建 TOS 客户端失败: {:?}", e))?;

    let input = GetObjectTaggingInput::new(&config.bucket, object_key);
    let output = client
        .get_object_tagging(&input)
        .await
        .map_err(|e| format!("获取标签失败: {:?}", e))?;

    let mut result = HashMap::new();
    for tag in output.tag_set().tags() {
        result.insert(tag.key().to_string(), tag.value().to_string());
    }

    Ok(result)
}

/// 更新 TOS 文件标签
pub async fn update_object_tags(
    config: &TosConfig,
    object_key: &str,
    tags: HashMap<String, String>,
) -> Result<(), String> {
    let client = tos::builder::<TokioRuntime>()
        .connection_timeout(5000)
        .request_timeout(10000)
        .max_retry_count(2)
        .ak(&config.access_key)
        .sk(&config.secret_key)
        .region(&config.region)
        .endpoint(&config.endpoint)
        .build()
        .map_err(|e| format!("创建 TOS 客户端失败: {:?}", e))?;

    let tag_list: Vec<Tag> = tags
        .into_iter()
        .map(|(k, v)| {
            let mut t = Tag::default();
            t.set_key(k);
            t.set_value(v);
            t
        })
        .collect();

    let mut tag_set = TagSet::default();
    tag_set.set_tags(tag_list);

    let mut input = PutObjectTaggingInput::new(&config.bucket, object_key);
    input.set_tag_set(tag_set);

    client
        .put_object_tagging(&input)
        .await
        .map_err(|e| format!("设置标签失败: {:?}", e))?;

    Ok(())
}

/// TOS 文件夹中的对象信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct TosObject {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
}

/// 列出 TOS 文件夹下的所有文件（通过 S3 兼容 REST API）
/// 返回文件列表和总大小
pub async fn list_folder(
    config: &TosConfig,
    folder_prefix: &str,
) -> Result<(Vec<TosObject>, i64), String> {
    let full_prefix = config.full_key(folder_prefix);
    // 确保 prefix 以 / 结尾
    let prefix = if full_prefix.ends_with('/') {
        full_prefix
    } else {
        format!("{}/", full_prefix)
    };

    let ep = config.endpoint.trim_end_matches('/');
    let ep_domain = if ep.starts_with("https://") {
        &ep[8..]
    } else if ep.starts_with("http://") {
        &ep[7..]
    } else {
        ep
    };

    let host = if config.bucket.contains('.') {
        ep_domain.to_string()
    } else {
        format!("{}.{}", config.bucket, ep_domain)
    };

    let path = if config.bucket.contains('.') {
        format!("/{}", config.bucket)
    } else {
        "/".to_string()
    };

    let now = chrono::Utc::now();
    let date_str = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_short = now.format("%Y%m%d").to_string();

    // S3/TOS 签名要求 query string 必须按字母顺序排序: list-type, max-keys, prefix
    let query_string = format!(
        "list-type=2&max-keys=1000&prefix={}",
        urlencoding::encode(&prefix)
    );

    // 构造 CanonicalRequest
    let canonical_request = format!(
        "GET\n{}\n{}\nhost:{}\nx-tos-date:{}\n\nhost;x-tos-date\n{}",
        path,
        query_string,
        host,
        date_str,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" // empty body hash
    );

    let credential_scope = format!("{}/{}/tos/request", date_short, config.region);
    let canonical_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str, credential_scope, canonical_hash
    );

    // 计算签名（使用模块级 hmac_sign 函数）
    let k_date = hmac_sign(config.secret_key.as_bytes(), date_short.as_bytes());
    let k_region = hmac_sign(&k_date, config.region.as_bytes());
    let k_service = hmac_sign(&k_region, b"tos");
    let k_signing = hmac_sign(&k_service, b"request");
    let signature = hex::encode(hmac_sign(&k_signing, string_to_sign.as_bytes()));

    let auth_header = format!(
        "TOS4-HMAC-SHA256 Credential={}/{},SignedHeaders=host;x-tos-date,Signature={}",
        config.access_key, credential_scope, signature
    );

    let url = format!("https://{}{}?{}", host, path, query_string);

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Host", &host)
        .header("x-tos-date", &date_str)
        .header("Authorization", &auth_header)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("TOS 请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("TOS ListObjects 失败 ({}): {}", status, body));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    // 解析 XML 响应
    let mut objects = Vec::new();
    let mut total_size: i64 = 0;

    // 简单 XML 解析（提取 <Key>, <Size>, <LastModified>）
    for content_block in body.split("<Contents>").skip(1) {
        if let Some(end) = content_block.find("</Contents>") {
            let block = &content_block[..end];
            let key = extract_xml_value(block, "Key").unwrap_or_default();
            let size_str = extract_xml_value(block, "Size").unwrap_or_default();
            let last_modified = extract_xml_value(block, "LastModified").unwrap_or_default();

            let size: i64 = size_str.parse().unwrap_or(0);
            // 跳过文件夹标记（0字节且以/结尾的key）
            if size == 0 && key.ends_with('/') {
                continue;
            }
            total_size += size;
            objects.push(TosObject {
                key,
                size,
                last_modified,
            });
        }
    }

    Ok((objects, total_size))
}

/// 辅助：从 XML 中提取标签值
fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml.find(&close)?;
    Some(xml[start..end].to_string())
}
