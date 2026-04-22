use crate::error::{AppError, AppResult};
use crate::models::SmsSettings;
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// 腾讯云短信服务（TC3-HMAC-SHA256 签名，直接使用 reqwest 调用）
pub struct SmsService {
    settings: SmsSettings,
}

impl SmsService {
    pub fn new(settings: &SmsSettings) -> Self {
        Self {
            settings: settings.clone(),
        }
    }

    /// 发送短信验证码（测试和业务共用此方法）
    pub async fn send_verification_code(&self, mobile: &str, code: &str) -> AppResult<()> {
        let host = "sms.tencentcloudapi.com";
        let service = "sms";
        let action = "SendSms";
        let version = "2021-01-11";
        let region = "ap-guangzhou";

        // 构建请求体
        let payload = serde_json::json!({
            "PhoneNumberSet": [mobile],
            "SmsSdkAppId": self.settings.sdk_app_id,
            "SignName": self.settings.sign_name,
            "TemplateId": self.settings.template_id,
            "TemplateParamSet": [code]
        });
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| AppError::BadRequest(format!("序列化短信请求失败: {}", e)))?;

        let now = Utc::now();
        let timestamp = now.timestamp();
        let date = now.format("%Y-%m-%d").to_string();

        // === TC3-HMAC-SHA256 签名计算 ===
        let content_type = "application/json; charset=utf-8";

        // 步骤1：拼接规范请求串
        let hashed_payload = hex::encode(Sha256::digest(payload_str.as_bytes()));
        let canonical_request = format!(
            "POST\n/\n\ncontent-type:{}\nhost:{}\n\ncontent-type;host\n{}",
            content_type, host, hashed_payload
        );

        // 步骤2：拼接待签名字符串
        let credential_scope = format!("{}/{}/tc3_request", date, service);
        let hashed_canonical = hex::encode(Sha256::digest(canonical_request.as_bytes()));
        let string_to_sign = format!(
            "TC3-HMAC-SHA256\n{}\n{}\n{}",
            timestamp, credential_scope, hashed_canonical
        );

        // 步骤3：计算签名
        let secret_date = hmac_sha256(
            format!("TC3{}", self.settings.secret_key).as_bytes(),
            date.as_bytes(),
        );
        let secret_service = hmac_sha256(&secret_date, service.as_bytes());
        let secret_signing = hmac_sha256(&secret_service, b"tc3_request");
        let signature = hex::encode(hmac_sha256(&secret_signing, string_to_sign.as_bytes()));

        // 步骤4：拼接 Authorization
        let authorization = format!(
            "TC3-HMAC-SHA256 Credential={}/{}, SignedHeaders=content-type;host, Signature={}",
            self.settings.secret_id, credential_scope, signature
        );

        // 发送请求
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("https://{}", host))
            .header("Content-Type", content_type)
            .header("Host", host)
            .header("X-TC-Action", action)
            .header("X-TC-Version", version)
            .header("X-TC-Timestamp", timestamp.to_string())
            .header("X-TC-Region", region)
            .header("Authorization", &authorization)
            .body(payload_str)
            .send()
            .await
            .map_err(|e| AppError::BadRequest(format!("短信发送请求失败: {}", e)))?;

        let status = resp.status();
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AppError::BadRequest(format!("短信响应解析失败: {}", e)))?;

        if !status.is_success() {
            return Err(AppError::BadRequest(format!(
                "短信 API 返回错误: {}",
                body
            )));
        }

        // 检查业务错误
        if let Some(err) = body.pointer("/Response/Error") {
            return Err(AppError::BadRequest(format!(
                "短信发送失败: {}",
                err
            )));
        }

        Ok(())
    }
}

/// HMAC-SHA256 计算
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(key).expect("HMAC key length should always be valid");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}
