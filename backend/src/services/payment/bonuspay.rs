use crate::models::PaymentBonuspaySettings;
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::Client;
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::sha2::Sha256;
use rsa::signature::{Signer, SignatureEncoding, Verifier};
use rsa::{RsaPrivateKey, RsaPublicKey};

pub struct BonuspayClient {
    settings: PaymentBonuspaySettings,
    http: Client,
}

/// getAddress 响应中的 wallet 信息
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerWallet {
    pub address: Option<String>,
    pub cashier_url: Option<String>,
    pub customer_id: Option<String>,
    pub network: Option<String>,
    pub status: Option<String>,
    pub min_deposit: Option<f64>,
    pub confirm: Option<i64>,
    pub product: Option<String>,
}

impl BonuspayClient {
    pub fn new(settings: PaymentBonuspaySettings) -> Self {
        Self {
            settings,
            http: Client::new(),
        }
    }

    /// 使用商户私钥对 body JSON 做 SHA256WithRSA 签名，返回 Base64 编码
    fn rsa_sign(&self, body: &str) -> Result<String> {
        let private_key = RsaPrivateKey::from_pkcs8_pem(&self.settings.merchant_private_key)
            .map_err(|e| anyhow!("解析商户私钥失败: {}", e))?;

        let signing_key = rsa::pkcs1v15::SigningKey::<Sha256>::new(private_key);
        let signature = signing_key.sign(body.as_bytes());

        Ok(BASE64.encode(signature.to_bytes()))
    }

    /// 使用 BonusPay 公钥验证回调签名
    pub fn verify_signature(bonuspay_public_key_pem: &str, body: &str, sign_base64: &str) -> Result<bool> {
        let public_key = RsaPublicKey::from_public_key_pem(bonuspay_public_key_pem)
            .map_err(|e| anyhow!("解析 BonusPay 公钥失败: {}", e))?;

        let verifying_key = rsa::pkcs1v15::VerifyingKey::<Sha256>::new(public_key);

        let signature_bytes = BASE64
            .decode(sign_base64)
            .map_err(|e| anyhow!("Base64 解码签名失败: {}", e))?;

        let signature = rsa::pkcs1v15::Signature::try_from(signature_bytes.as_slice())
            .map_err(|e| anyhow!("签名格式错误: {}", e))?;

        match verifying_key.verify(body.as_bytes(), &signature) {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    /// Crypto TOPUP — 获取充值地址
    /// 调用 /sgs/api/ccdeposit/getAddress
    /// customer_id: 系统内用户唯一标识
    /// asset_code: USDT / USDC
    /// network: TRON / ETH / POLYGON
    /// 返回 cashierUrl (BonusPay 收银台页面) 供前端跳转
    pub async fn get_deposit_address(
        &self,
        customer_id: &str,
        asset_code: &str,
        network: &str,
    ) -> Result<CustomerWallet> {
        let now_ms = chrono::Utc::now().timestamp_millis();

        // 构建请求体
        let body = serde_json::json!({
            "requestTime": now_ms,
            "bizContent": {
                "customerId": customer_id,
                "assetCode": asset_code,
                "network": network,
            }
        });

        let body_str = serde_json::to_string(&body)
            .map_err(|e| anyhow!("序列化请求体失败: {}", e))?;

        // RSA 签名
        let sign = self.rsa_sign(&body_str)?;

        let api_url = format!(
            "{}/sgs/api/ccdeposit/getAddress",
            self.settings.api_url.trim_end_matches('/')
        );

        tracing::info!(
            "[BonusPay] getAddress 请求: url={}, partner_id={}, customer_id={}",
            api_url,
            self.settings.partner_id,
            customer_id
        );

        let resp = self
            .http
            .post(&api_url)
            .header("Content-Type", "application/json")
            .header("Content-Language", "en")
            .header("Partner-Id", &self.settings.partner_id)
            .header("sign", &sign)
            .body(body_str)
            .send()
            .await
            .map_err(|e| anyhow!("BonusPay 请求失败: {}", e))?;

        let status = resp.status();
        let resp_body = resp.text().await.unwrap_or_default();

        tracing::info!("[BonusPay] getAddress 响应: HTTP {}", status);
        tracing::debug!("[BonusPay] 响应内容: {}", resp_body);

        if !status.is_success() {
            return Err(anyhow!("BonusPay HTTP {}: {}", status, resp_body));
        }

        let data: serde_json::Value = serde_json::from_str(&resp_body)
            .map_err(|e| anyhow!("BonusPay JSON 解析失败: {} body={}", e, resp_body))?;

        // 检查 head.applyStatus == "SUCCESS" && head.code == "0"
        let apply_status = data["head"]["applyStatus"].as_str().unwrap_or("");
        let code = data["head"]["code"].as_str().unwrap_or("");

        if apply_status != "SUCCESS" || code != "0" {
            let msg = data["head"]["msg"].as_str().unwrap_or("未知错误");
            return Err(anyhow!(
                "BonusPay getAddress 失败: applyStatus={}, code={}, msg={}",
                apply_status, code, msg
            ));
        }

        // 解析 body.wallet
        let wallet: CustomerWallet = serde_json::from_value(
            data["body"]["wallet"].clone(),
        )
        .map_err(|e| anyhow!("解析 wallet 失败: {} resp={}", e, resp_body))?;

        tracing::info!(
            "[BonusPay] ✅ getAddress 成功: address={:?}, cashierUrl={:?}",
            wallet.address,
            wallet.cashier_url
        );

        Ok(wallet)
    }
}
