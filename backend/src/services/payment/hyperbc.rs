use crate::models::PaymentHyperbcSettings;
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use md5::{Digest, Md5};
use reqwest::Client;
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::{Pkcs1v15Sign, RsaPrivateKey, RsaPublicKey};
#[allow(unused_imports)]
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub struct HyperbcClient {
    settings: PaymentHyperbcSettings,
    http: Client,
}

/// CipherBC API 统一响应格式
/// 文档: {status: 200, msg: "success", data: {...}, sign: "..."}
#[derive(Debug, Deserialize)]
pub struct HyperbcResponse<T> {
    pub status: i32,
    pub msg: Option<String>,
    pub data: Option<T>,
    #[serde(default)]
    #[allow(dead_code)]
    pub sign: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct H5AddressInfo {
    pub coin: String,
    pub address: String,
    pub amount: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CreateH5OrderData {
    pub checkout_url: String,
    pub order_no: String,
    pub addresses: Option<Vec<H5AddressInfo>>,
    pub amount: Option<String>,
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct QueryOrderData {
    pub order_no: String,
    pub merchant_order_id: String,
    pub amount: String,
    pub currency: String,
    pub status: i32,
    pub check_status: Option<i32>,
    pub pay_amount: Option<String>,
    pub pay_currency: Option<String>,
}

impl HyperbcClient {
    pub fn new(settings: PaymentHyperbcSettings) -> Self {
        Self {
            settings,
            http: Client::new(),
        }
    }

    pub fn get_sign_content(val: &Value) -> String {
        // 递归展平子层级（嵌套的 Object 或 Array），提取并拼接所有叶子节点的值，丢弃 key 且不含拼接符
        fn value_as_string(v: &Value) -> String {
            match v {
                Value::Null => String::new(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                Value::Array(arr) => {
                    let mut s = String::new();
                    for item in arr {
                        s.push_str(&value_as_string(item));
                    }
                    s
                }
                Value::Object(map) => {
                    let mut s = String::new();
                    // 开启 preserve_order 后，此处 map 迭代器将遵循 JSON 原始输入顺序
                    for (_, val) in map {
                        s.push_str(&value_as_string(val));
                    }
                    s
                }
            }
        }

        if let Value::Object(map) = val {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort(); // 第一层 key 依然按照字典序排序

            let mut parts = Vec::new();
            for k in keys {
                if k == "sign" {
                    continue;
                }
                let v = map.get(k).unwrap();
                if v.is_null() {
                    continue;
                }
                let v_str = value_as_string(v);
                parts.push(format!("{}={}", k, v_str));
            }
            parts.join("&")
        } else {
            value_as_string(val)
        }
    }

    /// 使用商户 RSA 私钥对参数进行 RSA-MD5 签名
    pub fn rsa_sign(&self, val: &Value) -> Result<String> {
        let sign_str = Self::get_sign_content(val);

        // 1. 计算 MD5
        let mut hasher = Md5::new();
        hasher.update(sign_str.as_bytes());
        let hash_result = hasher.finalize();

        // 2. 构造 PKCS#1 v1.5 MD5 DigestInfo 前缀
        // ASN.1 OID for MD5: 1.2.840.113549.2.5
        // 前缀长度 18 字节
        let prefix: [u8; 18] = [
            0x30, 0x20, 0x30, 0x0c, 0x06, 0x08, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x02, 0x05,
            0x05, 0x00, 0x04, 0x10,
        ];

        let mut digest_info = Vec::with_capacity(34);
        digest_info.extend_from_slice(&prefix);
        digest_info.extend_from_slice(&hash_result);

        // 3. 使用商户私钥做 Raw RSA 签名 (PKCS#1 v1.5)
        let private_key = RsaPrivateKey::from_pkcs8_pem(&self.settings.merchant_private_key)
            .map_err(|e| anyhow!("解析商户私钥失败: {}", e))?;

        let signature_bytes = private_key
            .sign(Pkcs1v15Sign::new_unprefixed(), &digest_info)
            .map_err(|e| anyhow!("RSA 签名计算失败: {}", e))?;

        Ok(BASE64.encode(signature_bytes))
    }

    /// 使用 HyperBC 平台公钥验证回调签名
    pub fn verify_signature(&self, val: &Value, sign_base64: &str) -> Result<bool> {
        let sign_str = Self::get_sign_content(val);

        // 1. 计算 MD5
        let mut hasher = Md5::new();
        hasher.update(sign_str.as_bytes());
        let hash_result = hasher.finalize();

        // 2. 构造 DigestInfo
        let prefix: [u8; 18] = [
            0x30, 0x20, 0x30, 0x0c, 0x06, 0x08, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x02, 0x05,
            0x05, 0x00, 0x04, 0x10,
        ];

        let mut digest_info = Vec::with_capacity(34);
        digest_info.extend_from_slice(&prefix);
        digest_info.extend_from_slice(&hash_result);

        // 3. 公钥验签
        let public_key = RsaPublicKey::from_public_key_pem(&self.settings.hyperbc_public_key)
            .map_err(|e| anyhow!("解析 HyperBC 平台公钥失败: {}", e))?;

        let signature_bytes = BASE64
            .decode(sign_base64)
            .map_err(|e| anyhow!("Base64 解码签名失败: {}", e))?;

        match public_key.verify(
            Pkcs1v15Sign::new_unprefixed(),
            &digest_info,
            &signature_bytes,
        ) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// 创建 H5 Hosted Cashier 订单
    /// merchant_order_id: 商户订单号
    /// amount: 系统法币金额，内部会根据汇率折算为加密货币金额
    /// currency: 法币币种 (如 "usd", "cny")
    /// return_url: 前端返回跳转地址（优先级低于 success_url/fail_url）
    /// lang: 语言 ("zh" 或 "en")
    pub async fn create_h5_order(
        &self,
        merchant_order_id: &str,
        amount: f64,
        currency: &str,
        return_url: &str,
        lang: &str,
    ) -> Result<CreateH5OrderData> {
        let now = chrono::Utc::now().timestamp();
        // 计算换算后的加密货币金额
        let crypto_amount = format!("{:.2}", amount / self.settings.crypto_exchange_rate);

        let mut params = BTreeMap::new();
        // 公共参数
        params.insert(
            "app_id".to_string(),
            Value::String(self.settings.app_id.clone()),
        );
        params.insert("version".to_string(), Value::String("1.0".to_string()));
        params.insert("time".to_string(), Value::String(now.to_string()));
        // 业务参数（回调地址在 CipherBC 商户后台配置，不通过 API 传递）
        params.insert(
            "merchant_order_id".to_string(),
            Value::String(merchant_order_id.to_string()),
        );
        params.insert("amount".to_string(), Value::String(crypto_amount));
        params.insert("currency".to_string(), Value::String(currency.to_string()));
        params.insert(
            "return_url".to_string(),
            Value::String(return_url.to_string()),
        );
        params.insert("lang".to_string(), Value::String(lang.to_string()));

        let params_val =
            Value::Object(params.iter().map(|(k, v)| (k.clone(), v.clone())).collect());
        let sign = self.rsa_sign(&params_val)?;

        // 请求 JSON
        let mut request_body = params;
        request_body.insert("sign".to_string(), Value::String(sign));

        let api_url = format!(
            "{}/h5_order/create",
            self.settings.api_url.trim_end_matches('/')
        );

        tracing::info!(
            "[HyperBC] create_h5_order 请求: url={}, app_id={}, merchant_order_id={}, amount={}",
            api_url,
            self.settings.app_id,
            merchant_order_id,
            amount
        );

        let resp = self
            .http
            .post(&api_url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| anyhow!("HyperBC 请求失败: {}", e))?;

        let status = resp.status();
        let resp_body = resp.text().await.unwrap_or_default();

        tracing::info!("[HyperBC] create_h5_order 响应: HTTP {}", status);
        tracing::debug!("[HyperBC] 响应内容: {}", resp_body);

        if !status.is_success() {
            return Err(anyhow!("HyperBC HTTP {}: {}", status, resp_body));
        }

        let result: HyperbcResponse<CreateH5OrderData> = serde_json::from_str(&resp_body)
            .map_err(|e| anyhow!("HyperBC JSON 解析失败: {} body={}", e, resp_body))?;

        if result.status != 200 {
            return Err(anyhow!(
                "HyperBC create_h5_order 失败: status={}, msg={:?}",
                result.status,
                result.msg
            ));
        }

        let data = result
            .data
            .ok_or_else(|| anyhow!("HyperBC 返回的 data 为空"))?;

        Ok(data)
    }

    /// 查询订单详情
    #[allow(dead_code)]
    pub async fn query_order(&self, order_no: &str) -> Result<QueryOrderData> {
        let now = chrono::Utc::now().timestamp();
        let mut params = BTreeMap::new();
        params.insert(
            "app_id".to_string(),
            Value::String(self.settings.app_id.clone()),
        );
        params.insert("version".to_string(), Value::String("1.0".to_string()));
        params.insert(
            "time".to_string(),
            Value::Number(serde_json::Number::from(now)),
        );
        params.insert("order_no".to_string(), Value::String(order_no.to_string()));

        let params_val =
            Value::Object(params.iter().map(|(k, v)| (k.clone(), v.clone())).collect());
        let sign = self.rsa_sign(&params_val)?;

        let mut request_body = params;
        request_body.insert("sign".to_string(), Value::String(sign));

        let api_url = format!(
            "{}/h5_order/detail",
            self.settings.api_url.trim_end_matches('/')
        );

        let resp = self
            .http
            .post(&api_url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| anyhow!("HyperBC 查询订单请求失败: {}", e))?;

        let status = resp.status();
        let resp_body = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow!("HyperBC HTTP {}: {}", status, resp_body));
        }

        let result: HyperbcResponse<QueryOrderData> = serde_json::from_str(&resp_body)
            .map_err(|e| anyhow!("HyperBC JSON 解析失败: {} body={}", e, resp_body))?;

        if result.status != 200 {
            return Err(anyhow!(
                "HyperBC query_order 失败: status={}, msg={:?}",
                result.status,
                result.msg
            ));
        }

        let data = result
            .data
            .ok_or_else(|| anyhow!("HyperBC 返回的订单 data 为空"))?;

        Ok(data)
    }
}
