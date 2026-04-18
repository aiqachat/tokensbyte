use crate::models::PaymentWechatSettings;
use anyhow::{anyhow, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Local;
use rand::Rng;
use reqwest::Client;
use rsa::pkcs8::DecodePrivateKey;
use rsa::pkcs1v15::SigningKey;
use rsa::signature::{Signer, SignatureEncoding};
use rsa::sha2::Sha256;
use aes_gcm::{Aes256Gcm, Key, Nonce, KeyInit};
use aes_gcm::aead::{Aead, Payload};

pub struct WechatClient {
    settings: PaymentWechatSettings,
    http_client: Client,
}

impl WechatClient {
    pub fn new(settings: PaymentWechatSettings) -> Self {
        Self { 
            settings,
            http_client: Client::new()
        }
    }

    fn generate_nonce(&self) -> String {
        let mut rng = rand::thread_rng();
        (0..32).map(|_| {
            let idx = rng.gen_range(0..62);
            let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            chars[idx] as char
        }).collect()
    }

    fn sign(&self, method: &str, url: &str, timestamp: &str, nonce: &str, body: &str) -> Result<String> {
        let message = format!("{}\n{}\n{}\n{}\n{}\n", method, url, timestamp, nonce, body);
        
        // Parse private key
        let mut pk_str = self.settings.private_key.trim().to_string();
        if !pk_str.starts_with("-----BEGIN PRIVATE KEY-----") && !pk_str.starts_with("-----BEGIN RSA PRIVATE KEY-----") {
            pk_str = format!("-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----", pk_str.chars().collect::<Vec<char>>().chunks(64).map(|c| c.into_iter().collect::<String>()).collect::<Vec<String>>().join("\n"));
        }

        let priv_key = rsa::RsaPrivateKey::from_pkcs8_pem(&pk_str)
            .map_err(|e| anyhow!("Failed to parse Wechat private key: {}", e))?;
            
        let signing_key = SigningKey::<Sha256>::new(priv_key);
        let signature = signing_key.sign(message.as_bytes());
        Ok(STANDARD.encode(signature.to_bytes()))
    }

    fn build_auth_header(&self, method: &str, url: &str, body: &str) -> Result<String> {
        let timestamp = Local::now().timestamp().to_string();
        let nonce = self.generate_nonce();
        let signature = self.sign(method, url, &timestamp, &nonce, body)?;
        
        Ok(format!(
            "WECHATPAY2-SHA256-RSA2048 mchid=\"{}\",nonce_str=\"{}\",signature=\"{}\",timestamp=\"{}\",serial_no=\"{}\"",
            self.settings.mchid,
            nonce,
            signature,
            timestamp,
            self.settings.cert_serial_no
        ))
    }

    pub async fn create_native_order(&self, out_trade_no: &str, amount: f64, description: &str, notify_url: &str) -> Result<String> {
        let url_path = "/v3/pay/transactions/native";
        let full_url = format!("https://api.mch.weixin.qq.com{}", url_path);
        
        // Convert amount to cents
        let total = (amount * 100.0).round() as i32;

        let body = serde_json::json!({
            "mchid": self.settings.mchid,
            "out_trade_no": out_trade_no,
            "appid": self.settings.appid,
            "description": description,
            "notify_url": notify_url,
            "amount": {
                "total": total,
                "currency": "CNY"
            }
        });
        
        let body_str = body.to_string();
        let auth_header = self.build_auth_header("POST", url_path, &body_str)?;

        let resp = self.http_client.post(&full_url)
            .header("Authorization", auth_header)
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("User-Agent", "TokensByte/1.0")
            .body(body_str)
            .send()
            .await?;

        let status = resp.status();
        let resp_body = resp.text().await?;
        
        if status.is_success() {
            let json: serde_json::Value = serde_json::from_str(&resp_body)?;
            if let Some(code_url) = json.get("code_url").and_then(|v| v.as_str()) {
                Ok(code_url.to_string())
            } else {
                Err(anyhow!("No code_url in wechat response"))
            }
        } else {
            Err(anyhow!("Wechat pay error: [{}] {}", status, resp_body))
        }
    }

    pub fn decrypt_callback_resource(&self, nonce: &str, associated_data: &str, ciphertext: &str) -> Result<String> {
        let key_bytes = self.settings.api_v3_key.as_bytes();
        if key_bytes.len() != 32 {
            return Err(anyhow!("Wechat API v3 key must be exactly 32 bytes"));
        }
        
        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);
        
        let nonce_bytes = nonce.as_bytes();
        let nonce_obj = Nonce::from_slice(nonce_bytes);
        
        let cipher_decoded = STANDARD.decode(ciphertext)?;
        
        let payload = Payload {
            msg: &cipher_decoded,
            aad: associated_data.as_bytes()
        };
        
        match cipher.decrypt(nonce_obj, payload) {
            Ok(plaintext) => {
                Ok(String::from_utf8(plaintext)?)
            },
            Err(e) => Err(anyhow!("AES-GCM decryption failed: {:?}", e))
        }
    }
}
