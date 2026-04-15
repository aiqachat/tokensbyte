use std::collections::HashMap;
use std::future::Future;
use std::time::Duration;

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
        let ak = map.get("tos_access_key")?.clone();
        let sk = map.get("tos_secret_key")?.clone();
        let endpoint = map.get("tos_endpoint")?.clone();
        let region = map.get("tos_region")?.clone();
        let bucket = map.get("tos_bucket")?.clone();

        if ak.is_empty() || sk.is_empty() || endpoint.is_empty() || region.is_empty() || bucket.is_empty() {
            return None;
        }

        Some(Self {
            access_key: ak,
            secret_key: sk,
            endpoint,
            region,
            bucket,
            path_prefix: map.get("tos_path_prefix").cloned().unwrap_or_default(),
            custom_domain: map.get("tos_custom_domain").cloned().unwrap_or_default(),
        })
    }

    /// 生成文件的公开访问 URL
    pub fn file_url(&self, object_key: &str) -> String {
        if !self.custom_domain.is_empty() {
            let domain = self.custom_domain.trim_end_matches('/');
            format!("{}/{}", domain, object_key)
        } else {
            format!("{}/{}/{}", self.endpoint.trim_end_matches('/'), self.bucket, object_key)
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
    content_type: &str,
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

    let input = PutObjectFromBufferInput::new_with_content(&config.bucket, object_key, data);

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
