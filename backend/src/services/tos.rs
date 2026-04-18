#![allow(dead_code)]
use std::collections::HashMap;
use std::future::Future;
use std::time::Duration;
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
type HmacSha256 = Hmac<Sha256>;

use async_trait::async_trait;
use futures::future::BoxFuture;
use tokio::runtime::Handle;
use ve_tos_rust_sdk::asynchronous::bucket::BucketAPI;
use ve_tos_rust_sdk::asynchronous::object::ObjectAPI;
use ve_tos_rust_sdk::asynchronous::tos;
use ve_tos_rust_sdk::asynchronous::tos::AsyncRuntime;
use ve_tos_rust_sdk::bucket::ListBucketsInput;
use ve_tos_rust_sdk::object::PutObjectFromBufferInput;
use ve_tos_rust_sdk::object::DeleteObjectInput;

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

        if ak.is_empty() || sk.is_empty() || endpoint.is_empty() || region.is_empty() || bucket.is_empty() {
            return None;
        }

        Some(Self {
            access_key: ak,
            secret_key: sk,
            endpoint,
            region,
            bucket,
            path_prefix: map.get("tos_path_prefix").map(|s| s.trim().to_string()).unwrap_or_default(),
            custom_domain: map.get("tos_custom_domain").map(|s| s.trim().to_string()).unwrap_or_default(),
        })
    }

    /// 生成文件的公开访问 URL
    pub fn file_url(&self, object_key: &str) -> String {
        if !self.custom_domain.is_empty() {
            let domain = self.custom_domain.trim_end_matches('/');
            let prefix = if domain.starts_with("http") { "" } else { "https://" };
            format!("{}{}/{}", prefix, domain, object_key)
        } else {
            let ep = self.endpoint.trim_end_matches('/');
            let prefix = if ep.starts_with("http") { "" } else { "https://" };
            
            let ep_domain = if ep.starts_with("https://") {
                &ep[8..]
            } else if ep.starts_with("http://") {
                &ep[7..]
            } else {
                ep
            };
            
            // Bucket 名包含点号时不能用 Virtual-Hosted Style（SSL 证书不匹配），
            // 改用 Path-Style: https://endpoint/bucket/key
            if self.bucket.contains('.') {
                format!("{}{}/{}/{}", prefix, ep_domain, self.bucket, object_key)
            } else {
                format!("{}{}.{}/{}", prefix, self.bucket, ep_domain, object_key)
            }
        }
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
            let names: Vec<String> = output.buckets().iter().map(|b| b.name().to_string()).collect();
            if names.contains(&config.bucket) {
                Ok(format!("连接成功，已找到目标 Bucket: {}", config.bucket))
            } else {
                Ok(format!("连接成功，但未找到 Bucket '{}'，可用: {:?}", config.bucket, names))
            }
        }
        Err(e) => Err(format!("连接失败: {:?}", e)),
    }
}

/// 上传文件到 TOS
pub async fn upload_file(
    config: &TosConfig,
    object_key: &str,
    data: Vec<u8>,
    _content_type: &str,
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
    if let Some(t) = tags {
        input.set_tagging(t);
    }

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
        path, host, date_str,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    let credential_scope = format!("{}/{}/tos/request", date_short, config.region);
    let canonical_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str, credential_scope, canonical_hash
    );

    fn hmac_sign(key: &[u8], data: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }
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
    let resp = client.get(&url)
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

    let bytes = resp.bytes().await.map_err(|e| format!("读取文件数据失败: {}", e))?;
    Ok(bytes.to_vec())
}

use ve_tos_rust_sdk::object::{PutObjectTaggingInput, GetObjectTaggingInput};
use ve_tos_rust_sdk::common::{TagSet, Tag};

/// 获取 TOS 文件标签
pub async fn get_object_tags(config: &TosConfig, object_key: &str) -> Result<HashMap<String, String>, String> {
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
pub async fn update_object_tags(config: &TosConfig, object_key: &str, tags: HashMap<String, String>) -> Result<(), String> {
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

    let tag_list: Vec<Tag> = tags.into_iter().map(|(k, v)| {
        let mut t = Tag::default();
        t.set_key(k);
        t.set_value(v);
        t
    }).collect();

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
pub async fn list_folder(config: &TosConfig, folder_prefix: &str) -> Result<(Vec<TosObject>, i64), String> {
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

    let query_string = format!(
        "list-type=2&prefix={}&max-keys=1000",
        urlencoding::encode(&prefix)
    );

    // 构造 CanonicalRequest
    let canonical_request = format!(
        "GET\n{}\n{}\nhost:{}\nx-tos-date:{}\n\nhost;x-tos-date\n{}",
        path, query_string, host, date_str,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" // empty body hash
    );

    let credential_scope = format!("{}/{}/tos/request", date_short, config.region);
    let canonical_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));
    let string_to_sign = format!(
        "TOS4-HMAC-SHA256\n{}\n{}\n{}",
        date_str,
        credential_scope,
        canonical_hash
    );

    // 计算签名
    fn hmac_sign(key: &[u8], data: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }
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
    let resp = client.get(&url)
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

    let body = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

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
