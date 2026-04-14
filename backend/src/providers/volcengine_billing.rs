use reqwest::Client;
use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

/// 对字符串进行 SHA256 哈希并返回小写十六进制
fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

/// HMAC-SHA256 签名
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key error");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

pub async fn query_balance(ak: &str, sk: &str) -> anyhow::Result<f64> {
    let host = "open.volcengineapi.com";
    let region = "cn-beijing";
    let service = "billing";
    let action = "QueryBalanceAcct";
    let version = "2022-01-01";
    let method = "GET";

    // 1. 生成时间戳
    let dt = chrono::Utc::now();
    let date_str = dt.format("%Y%m%d").to_string();       // e.g. 20260414
    let x_date = dt.format("%Y%m%dT%H%M%SZ").to_string(); // e.g. 20260414T140000Z

    // 2. 构建 Query String（参数按key字母序排列）
    let mut query_params = BTreeMap::new();
    query_params.insert("Action", action);
    query_params.insert("Version", version);

    let query_str: String = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    // 3. Body hash（GET 无 body，使用空串）
    let payload_hash = sha256_hex(b"");

    // 4. 构建 CanonicalHeaders 和 SignedHeaders
    //    Headers 按 key 小写字母序排列
    let mut headers_map = BTreeMap::new();
    headers_map.insert("host", host);
    headers_map.insert("x-content-sha256", &payload_hash);
    headers_map.insert("x-date", &x_date);

    let canonical_headers: String = headers_map
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k, v.trim()))
        .collect();

    let signed_headers: String = headers_map
        .keys()
        .copied()
        .collect::<Vec<_>>()
        .join(";");

    // 5. 构建 CanonicalRequest
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method,                  // HTTPRequestMethod
        "/",                     // CanonicalURI
        query_str,               // CanonicalQueryString
        canonical_headers,       // CanonicalHeaders (每行末尾已有 \n)
        signed_headers,          // SignedHeaders
        payload_hash             // HexEncode(Hash(RequestPayload))
    );

    tracing::debug!("Volcengine CanonicalRequest:\n{}", canonical_request);

    // 6. 构建 StringToSign
    let credential_scope = format!("{}/{}/{}/request", date_str, region, service);
    let string_to_sign = format!(
        "HMAC-SHA256\n{}\n{}\n{}",
        x_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    tracing::debug!("Volcengine StringToSign:\n{}", string_to_sign);

    // 7. 派生签名密钥 (Signing Key)
    let k_date = hmac_sha256(sk.as_bytes(), date_str.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    let k_signing = hmac_sha256(&k_service, b"request");

    // 8. 计算最终签名
    let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    // 9. 构建 Authorization Header
    let auth_header = format!(
        "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        ak, credential_scope, signed_headers, signature
    );

    tracing::debug!("Volcengine Authorization: {}", auth_header);

    // 10. 发起请求
    let url = format!("https://{}/?{}", host, query_str);

    let client = Client::new();
    let resp = client
        .get(&url)
        .header("Host", host)
        .header("X-Date", &x_date)
        .header("X-Content-Sha256", &payload_hash)
        .header("Authorization", &auth_header)
        .send()
        .await?;

    let resp_text = resp.text().await?;
    tracing::info!("Volcengine QueryBalanceAcct response: {}", resp_text);

    let v: serde_json::Value = serde_json::from_str(&resp_text)?;

    // 检查 ResponseMetadata.Error
    if let Some(meta) = v.get("ResponseMetadata") {
        if let Some(err) = meta.get("Error") {
            anyhow::bail!(
                "Volcengine API error: Code={}, Message={}",
                err.get("Code").and_then(|v| v.as_str()).unwrap_or("unknown"),
                err.get("Message").and_then(|v| v.as_str()).unwrap_or("unknown")
            );
        }
    }

    if let Some(res) = v.get("Result") {
        // CashBalance 可能是字符串也可能是数字
        let cash_balance = res
            .get("CashBalance")
            .map(|v| match v {
                serde_json::Value::String(s) => s.parse::<f64>().unwrap_or(0.0),
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
                _ => 0.0,
            })
            .unwrap_or(0.0);
        return Ok(cash_balance);
    }

    anyhow::bail!("Failed to parse Volcengine response: {}", resp_text)
}
