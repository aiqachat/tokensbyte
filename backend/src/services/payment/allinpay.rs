/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::models::PaymentAllinpaySettings;
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::Client;
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::signature::{SignatureEncoding, Signer, Verifier};
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::Deserialize;
use sha1::Sha1;
use std::collections::BTreeMap;

pub struct AllinpayClient {
    settings: PaymentAllinpaySettings,
    http: Client,
}

/// 通联统一下单 / 查询共用响应字段（部分字段仅用于排查，不在主路径读取）
#[derive(Debug, Deserialize)]
#[allow(dead_code)] // 通联回包字段保留完整反序列化，业务路径不全读取
pub struct AllinpayQueryResponse {
    pub retcode: String,
    pub retmsg: Option<String>,
    pub cusid: Option<String>,
    pub appid: Option<String>,
    pub trxid: Option<String>,
    pub reqsn: Option<String>,
    pub payinfo: Option<String>,
    pub trxstatus: Option<String>,
    pub trxamt: Option<String>,
    pub paytime: Option<String>,
    pub sign: Option<String>,
}

impl AllinpayClient {
    pub fn new(settings: PaymentAllinpaySettings) -> Self {
        Self {
            settings,
            http: Client::new(),
        }
    }

    fn api_base(&self, kind: &str) -> String {
        let base = self.settings.api_url.trim_end_matches('/');
        if base.contains("syb-test.allinpay.com") {
            base.to_string()
        } else if kind == "h5" {
            base.replace("vsp.allinpay.com", "syb.allinpay.com")
        } else {
            base.replace("syb.allinpay.com", "vsp.allinpay.com")
        }
    }

    fn random_str() -> String {
        uuid::Uuid::new_v4().simple().to_string()[..16].to_string()
    }

    fn trxamt_fen(amount: f64) -> String {
        ((amount * 100.0).round() as i64).to_string()
    }

    fn decode_b64(raw: &str) -> Result<Vec<u8>> {
        let compact: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
        BASE64
            .decode(compact.as_bytes())
            .map_err(|e| anyhow!("密钥 Base64 解码失败: {}", e))
    }

    /// 通联 RSA：优先 PKCS#1；兼容历史上误填的 PKCS#8
    fn load_private_key(&self) -> Result<RsaPrivateKey> {
        let raw = self.settings.merchant_private_key.trim();
        if raw.contains("-----BEGIN") {
            return RsaPrivateKey::from_pkcs1_pem(raw)
                .or_else(|_| RsaPrivateKey::from_pkcs8_pem(raw))
                .map_err(|e| anyhow!("解析通联商户私钥失败: {}", e));
        }
        let der = Self::decode_b64(raw)?;
        RsaPrivateKey::from_pkcs1_der(&der)
            .or_else(|_| RsaPrivateKey::from_pkcs8_der(&der))
            .map_err(|e| anyhow!("解析通联商户私钥失败: {}", e))
    }

    /// 通联平台公钥：优先 SPKI/PEM；兼容 PKCS#1 Base64
    fn load_public_key(&self) -> Result<RsaPublicKey> {
        let raw = self.settings.allinpay_public_key.trim();
        if raw.contains("-----BEGIN") {
            return RsaPublicKey::from_public_key_pem(raw)
                .or_else(|_| RsaPublicKey::from_pkcs1_pem(raw))
                .map_err(|e| anyhow!("解析通联平台公钥失败: {}", e));
        }
        let der = Self::decode_b64(raw)?;
        RsaPublicKey::from_public_key_der(&der)
            .or_else(|_| RsaPublicKey::from_pkcs1_der(&der))
            .map_err(|e| anyhow!("解析通联平台公钥失败: {}", e))
    }

    /// 官方：除 sign 外所有非空字段按 ASCII 排序拼接（含 signtype）
    fn build_sign_string(params: &BTreeMap<String, String>) -> String {
        params
            .iter()
            .filter(|(k, v)| k.as_str() != "sign" && !v.is_empty())
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("&")
    }

    /// 同 build_sign_string，但同时排除值为 "0" 的字段
    /// 通联部分回调场景下，数值为 0 的字段（如 fee=0、termtraceno=0）不参与签名
    fn build_sign_string_exclude_zero(params: &BTreeMap<String, String>) -> String {
        params
            .iter()
            .filter(|(k, v)| k.as_str() != "sign" && !v.is_empty() && v.as_str() != "0")
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("&")
    }

    fn attach_sign(&self, params: &mut BTreeMap<String, String>) -> Result<()> {
        params.insert("signtype".to_string(), "RSA".to_string());
        let sign_str = Self::build_sign_string(params);
        tracing::debug!("[通联签名] content={}", sign_str);
        let signing_key = rsa::pkcs1v15::SigningKey::<Sha1>::new(self.load_private_key()?);
        let signature = signing_key.sign(sign_str.as_bytes());
        params.insert("sign".to_string(), BASE64.encode(signature.to_bytes()));
        Ok(())
    }

    pub fn verify_signature(
        &self,
        params: &BTreeMap<String, String>,
        sign_base64: &str,
    ) -> Result<bool> {
        // 去除 BASE64 中的空白（form_urlencoded 会把未编码的 + 变成空格，需容错）
        let sign_clean: String = sign_base64.chars().filter(|c| !c.is_whitespace()).collect();
        let signature_bytes = BASE64
            .decode(sign_clean.as_bytes())
            .map_err(|e| anyhow!("通联签名 Base64 解码失败: {}", e))?;

        let public_key = self.load_public_key()?;
        let key_bits = public_key.n().bits();
        let key_bytes = (key_bits + 7) / 8;

        // 签名长度与密钥长度不匹配时提前警告（大概率公钥配置有误）
        if signature_bytes.len() != key_bytes {
            tracing::warn!(
                "[通联验签] 签名长度 {} 字节与公钥长度 {} 字节不匹配，请检查通联平台公钥配置",
                signature_bytes.len(),
                key_bytes
            );
            return Ok(false);
        }

        let sig = rsa::pkcs1v15::Signature::try_from(signature_bytes.as_slice())
            .map_err(|e| anyhow!("无效的通联签名格式: {}", e))?;

        // 穷举 4 种候选拼串：含/不含 signtype × 含/不含 0 值字段
        let mut params_with_signtype = params.clone();
        if !params_with_signtype.contains_key("signtype") {
            params_with_signtype.insert("signtype".to_string(), self.settings.sign_type.clone());
        }
        let sign_str_a = Self::build_sign_string(params);
        let sign_str_b = Self::build_sign_string(&params_with_signtype);
        let sign_str_c = Self::build_sign_string_exclude_zero(params);
        let sign_str_d = Self::build_sign_string_exclude_zero(&params_with_signtype);

        let candidates = [&sign_str_a, &sign_str_b, &sign_str_c, &sign_str_d];
        for candidate in &candidates {
            // SHA1WithRSA（通联文档标准算法）
            let vk1 = rsa::pkcs1v15::VerifyingKey::<Sha1>::new(public_key.clone());
            if vk1.verify(candidate.as_bytes(), &sig).is_ok() {
                return Ok(true);
            }
            // SHA256WithRSA（兜底尝试）
            let vk2 = rsa::pkcs1v15::VerifyingKey::<sha2::Sha256>::new(public_key.clone());
            if vk2.verify(candidate.as_bytes(), &sig).is_ok() {
                return Ok(true);
            }
        }

        tracing::warn!(
            "[通联验签] 签名验证失败，公钥 {}bit，请确认通联平台公钥配置是否正确",
            key_bits
        );
        Ok(false)
    }

    fn base_params(&self) -> BTreeMap<String, String> {
        BTreeMap::from([
            ("cusid".to_string(), self.settings.cusid.clone()),
            ("appid".to_string(), self.settings.appid.clone()),
        ])
    }

    async fn post_form(&self, path: &str, params: &BTreeMap<String, String>) -> Result<String> {
        let resp = self
            .http
            .post(path)
            .form(params)
            .send()
            .await
            .map_err(|e| anyhow!("请求通联接口失败: {}", e))?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(anyhow!("通联接口响应 HTTP {}: {}", status, body));
        }
        Ok(body)
    }

    /// 统一扫码支付（PC）：paytype W01=微信 / A01=支付宝
    pub async fn create_scan_pay(
        &self,
        out_trade_no: &str,
        amount: f64,
        subject: &str,
        notify_url: &str,
        paytype: &str,
    ) -> Result<String> {
        let mut params = self.base_params();
        params.insert("version".to_string(), self.settings.version.clone());
        params.insert("trxamt".to_string(), Self::trxamt_fen(amount));
        params.insert("reqsn".to_string(), out_trade_no.to_string());
        params.insert("paytype".to_string(), paytype.to_string());
        params.insert("randomstr".to_string(), Self::random_str());
        params.insert("body".to_string(), subject.to_string());
        params.insert("notify_url".to_string(), notify_url.to_string());
        self.attach_sign(&mut params)?;

        let url = format!("{}/unitorder/pay", self.api_base("scan"));
        let body = self.post_form(&url, &params).await?;
        let res: AllinpayQueryResponse = serde_json::from_str(&body)
            .map_err(|e| anyhow!("解析通联支付响应 JSON 失败: {}, body={}", e, body))?;
        if res.retcode != "SUCCESS" {
            return Err(anyhow!(
                "通联支付下单失败: {}",
                res.retmsg.unwrap_or_default()
            ));
        }
        res.payinfo
            .ok_or_else(|| anyhow!("通联返回数据中缺少 payinfo 支付链接"))
    }

    /// H5 收银台：拼装带签名的跳转 URL
    pub fn generate_h5_pay_url(
        &self,
        out_trade_no: &str,
        amount: f64,
        notify_url: &str,
        return_url: &str,
    ) -> Result<String> {
        let mut params = self.base_params();
        params.insert("version".to_string(), "12".to_string());
        params.insert("trxamt".to_string(), Self::trxamt_fen(amount));
        params.insert("reqsn".to_string(), out_trade_no.to_string());
        params.insert("notify_url".to_string(), notify_url.to_string());
        params.insert("returl".to_string(), return_url.to_string());
        params.insert("randomstr".to_string(), Self::random_str());
        self.attach_sign(&mut params)?;

        let query = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&");
        Ok(format!(
            "{}/h5unionpay/unionorder?{}",
            self.api_base("h5"),
            query
        ))
    }

    /// 主动查询订单状态
    pub async fn query_order(&self, out_trade_no: &str) -> Result<AllinpayQueryResponse> {
        let mut params = self.base_params();
        params.insert("version".to_string(), self.settings.version.clone());
        params.insert("reqsn".to_string(), out_trade_no.to_string());
        params.insert("randomstr".to_string(), Self::random_str());
        self.attach_sign(&mut params)?;

        let url = format!("{}/tranx/query", self.api_base("query"));
        let body = self.post_form(&url, &params).await?;
        serde_json::from_str(&body)
            .map_err(|e| anyhow!("解析通联查询返回失败: {}, body={}", e, body))
    }
}
