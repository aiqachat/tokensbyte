/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::models::PaymentStripeSettings;
use anyhow::{anyhow, Result};

pub struct StripeClient {
    settings: PaymentStripeSettings,
    http: reqwest::Client,
}

impl StripeClient {
    pub fn new(settings: PaymentStripeSettings) -> Self {
        Self {
            settings,
            http: reqwest::Client::new(),
        }
    }

    /// 创建 Stripe Checkout Session（重定向模式）
    /// 返回 Checkout Session URL，前端直接跳转
    pub async fn create_checkout_session(
        &self,
        out_trade_no: &str,
        amount: f64,
        currency: &str,
        description: &str,
        success_url: &str,
        cancel_url: &str,
    ) -> Result<(String, String)> {
        // Stripe 金额以"最小单位"表示（如 USD 是 cents，JPY 是日元本身）
        let amount_minor = self.to_minor_units(amount, currency);
        let currency_lower = currency.to_lowercase();

        let mut params = vec![
            ("mode", "payment".to_string()),
            ("payment_method_types[]", "card".to_string()),
            (
                "line_items[0][price_data][currency]",
                currency_lower.clone(),
            ),
            (
                "line_items[0][price_data][product_data][name]",
                description.to_string(),
            ),
            (
                "line_items[0][price_data][unit_amount]",
                amount_minor.to_string(),
            ),
            ("line_items[0][quantity]", "1".to_string()),
            ("client_reference_id", out_trade_no.to_string()),
            ("success_url", success_url.to_string()),
            ("cancel_url", cancel_url.to_string()),
            ("locale", "auto".to_string()),
        ];

        // 支付宝支付支持的币种列表
        let alipay_currencies = [
            "aud", "cad", "cny", "eur", "gbp", "hkd", "jpy", "myr", "nzd", "sgd", "usd",
        ];
        if alipay_currencies.contains(&currency_lower.as_str()) {
            params.push(("payment_method_types[]", "alipay".to_string()));
        }

        let resp = self
            .http
            .post("https://api.stripe.com/v1/checkout/sessions")
            .basic_auth(&self.settings.secret_key, None::<&str>)
            .form(&params)
            .send()
            .await
            .map_err(|e| anyhow!("Stripe API 请求失败: {}", e))?;

        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow!(
                "Stripe Checkout Session 创建失败 (HTTP {}): {}",
                status,
                body
            ));
        }

        let data: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| anyhow!("Stripe 响应解析失败: {} body={}", e, body))?;

        let session_url = data["url"]
            .as_str()
            .ok_or_else(|| anyhow!("Stripe 响应中缺少 url 字段"))?
            .to_string();

        let session_id = data["id"].as_str().unwrap_or("").to_string();

        Ok((session_url, session_id))
    }

    /// 验证 Stripe Webhook 签名
    /// https://docs.stripe.com/webhooks#verify-official-libraries
    pub fn verify_webhook_signature(&self, payload: &str, sig_header: &str) -> Result<bool> {
        let webhook_secret = &self.settings.webhook_secret;
        if webhook_secret.is_empty() {
            return Err(anyhow!("Stripe Webhook Secret 未配置"));
        }

        // 解析 Stripe-Signature header: t=xxx,v1=xxx
        let mut timestamp = "";
        let mut signature = "";
        for part in sig_header.split(',') {
            let kv: Vec<&str> = part.splitn(2, '=').collect();
            if kv.len() == 2 {
                match kv[0].trim() {
                    "t" => timestamp = kv[1],
                    "v1" => signature = kv[1],
                    _ => {}
                }
            }
        }

        if timestamp.is_empty() || signature.is_empty() {
            return Err(anyhow!("Stripe 签名头格式无效"));
        }

        // 构造签名字符串: timestamp.payload
        let signed_payload = format!("{}.{}", timestamp, payload);

        // HMAC-SHA256
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(webhook_secret.as_bytes())
            .map_err(|e| anyhow!("HMAC 初始化失败: {}", e))?;
        mac.update(signed_payload.as_bytes());
        let expected = hex::encode(mac.finalize().into_bytes());

        Ok(expected == signature)
    }

    /// 将金额转换为 Stripe 最小单位
    /// 零小数点货币（如 JPY, KRW）不需要乘以 100
    fn to_minor_units(&self, amount: f64, currency: &str) -> i64 {
        let zero_decimal = [
            "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd",
            "vuv", "xaf", "xof", "xpf",
        ];
        let cur = currency.to_lowercase();
        if zero_decimal.contains(&cur.as_str()) {
            amount.round() as i64
        } else {
            (amount * 100.0).round() as i64
        }
    }
}
