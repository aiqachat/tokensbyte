/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::models::PaymentAlipaySettings;
use anyhow::{anyhow, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Local;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs1v15::VerifyingKey;
use rsa::pkcs8::DecodePrivateKey;
use rsa::pkcs8::DecodePublicKey;
use rsa::sha2::Sha256;
use rsa::signature::{SignatureEncoding, Signer, Verifier};
use rsa::RsaPublicKey;
use std::collections::BTreeMap;
use urlencoding::encode;

pub struct AlipayClient {
    settings: PaymentAlipaySettings,
}

impl AlipayClient {
    pub fn new(settings: PaymentAlipaySettings) -> Self {
        Self { settings }
    }

    pub fn generate_page_pay_url(
        &self,
        out_trade_no: &str,
        amount: f64,
        subject: &str,
        notify_url: &str,
        return_url: &str,
    ) -> Result<String> {
        let mut params: BTreeMap<String, String> = BTreeMap::new();
        params.insert("app_id".to_string(), self.settings.app_id.clone());
        params.insert("method".to_string(), "alipay.trade.page.pay".to_string());
        params.insert("format".to_string(), "JSON".to_string());
        params.insert("return_url".to_string(), return_url.to_string());
        params.insert("charset".to_string(), "utf-8".to_string());
        params.insert("sign_type".to_string(), "RSA2".to_string());
        params.insert(
            "timestamp".to_string(),
            Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        );
        params.insert("version".to_string(), "1.0".to_string());
        params.insert("notify_url".to_string(), notify_url.to_string());

        // biz_content
        let biz_content = serde_json::json!({
            "out_trade_no": out_trade_no,
            "product_code": "FAST_INSTANT_TRADE_PAY",
            "total_amount": format!("{:.2}", amount),
            "subject": subject
        })
        .to_string();
        params.insert("biz_content".to_string(), biz_content);

        // Sign string
        let sign_str = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<String>>()
            .join("&");

        let sign = self.sign_rsa2(&sign_str)?;
        params.insert("sign".to_string(), sign);

        // Build URL encoded query string
        let query_str = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, encode(v)))
            .collect::<Vec<String>>()
            .join("&");

        Ok(format!(
            "https://openapi.alipay.com/gateway.do?{}",
            query_str
        ))
    }

    fn sign_rsa2(&self, data: &str) -> Result<String> {
        // Parse private key
        let mut pk_str = self.settings.private_key.trim().to_string();
        if !pk_str.starts_with("-----BEGIN PRIVATE KEY-----")
            && !pk_str.starts_with("-----BEGIN RSA PRIVATE KEY-----")
        {
            pk_str = format!(
                "-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----",
                pk_str
                    .chars()
                    .collect::<Vec<char>>()
                    .chunks(64)
                    .map(|c| c.into_iter().collect::<String>())
                    .collect::<Vec<String>>()
                    .join("\n")
            );
        }

        let priv_key = rsa::RsaPrivateKey::from_pkcs8_pem(&pk_str)
            .map_err(|e| anyhow!("Failed to parse Alipay private key: {}", e))?;

        let signing_key = SigningKey::<Sha256>::new(priv_key);
        let signature = signing_key.sign(data.as_bytes());
        let sign_b64 = STANDARD.encode(signature.to_bytes());
        Ok(sign_b64)
    }

    pub fn verify_signature(
        &self,
        params: &BTreeMap<String, String>,
        signature: &str,
    ) -> Result<bool> {
        let sign_str = params
            .iter()
            .filter(|(k, v)| k.as_str() != "sign" && k.as_str() != "sign_type" && !v.is_empty())
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<String>>()
            .join("&");

        let mut pub_str = self.settings.alipay_public_key.trim().to_string();
        if !pub_str.starts_with("-----BEGIN PUBLIC KEY-----") {
            pub_str = format!(
                "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
                pub_str
                    .chars()
                    .collect::<Vec<char>>()
                    .chunks(64)
                    .map(|c| c.into_iter().collect::<String>())
                    .collect::<Vec<String>>()
                    .join("\n")
            );
        }

        let pub_key = RsaPublicKey::from_public_key_pem(&pub_str)
            .map_err(|e| anyhow!("Failed to parse Alipay public key: {}", e))?;

        let verifying_key = VerifyingKey::<Sha256>::new(pub_key);

        let signature_bytes = STANDARD
            .decode(signature)
            .map_err(|e| anyhow!("Base64 decode signature failed: {}", e))?;

        match rsa::pkcs1v15::Signature::try_from(signature_bytes.as_slice()) {
            Ok(sig) => Ok(verifying_key.verify(sign_str.as_bytes(), &sig).is_ok()),
            Err(_) => Ok(false),
        }
    }
}
