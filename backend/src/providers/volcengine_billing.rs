use reqwest::Client;
use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

pub async fn query_balance(ak: &str, sk: &str) -> anyhow::Result<f64> {
    let host = "api.volcengine.com";
    let region = "cn-beijing";
    let service = "billing";
    let action = "QueryBalanceAcct";
    let version = "2022-01-01";
    let method = "GET";
    
    let dt = chrono::Utc::now();
    let date_str = dt.format("%Y%m%d").to_string();
    let x_date = dt.format("%Y%m%dT%H%M%SZ").to_string();
    
    let mut query_params = BTreeMap::new();
    query_params.insert("Action", action);
    query_params.insert("Version", version);
    
    // Construct Query String
    let mut query_str = String::new();
    for (k, v) in &query_params {
        if !query_str.is_empty() {
            query_str.push('&');
        }
        query_str.push_str(&urlencoding::encode(k));
        query_str.push('=');
        query_str.push_str(&urlencoding::encode(v));
    }
    
    let url = format!("https://{}?{}", host, query_str);
    
    // Construct Canonical Request
    let signed_headers = "host;x-date";
    let mut canonical_request = String::new();
    canonical_request.push_str(&format!("{}\n", method));
    canonical_request.push_str("/\n");
    canonical_request.push_str(&format!("{}\n", query_str));
    canonical_request.push_str(&format!("host:{}\nx-date:{}\n\n", host, x_date));
    canonical_request.push_str(&format!("{}\n", signed_headers));
    
    let empty_hash = hex::encode(Sha256::digest("".as_bytes()));
    canonical_request.push_str(&empty_hash);
    
    // String to Sign
    let credential_scope = format!("{}/{}/{}/request", date_str, region, service);
    let mut string_to_sign = String::new();
    string_to_sign.push_str("HMAC-SHA256\n");
    string_to_sign.push_str(&format!("{}\n", x_date));
    string_to_sign.push_str(&format!("{}\n", credential_scope));
    string_to_sign.push_str(&hex::encode(Sha256::digest(canonical_request.as_bytes())));
    
    // Calculate signature
    let mut mac = HmacSha256::new_from_slice(sk.as_bytes()).unwrap();
    mac.update(date_str.as_bytes());
    let k_date = mac.finalize().into_bytes();
    
    let mut mac = HmacSha256::new_from_slice(&k_date).unwrap();
    mac.update(region.as_bytes());
    let k_region = mac.finalize().into_bytes();
    
    let mut mac = HmacSha256::new_from_slice(&k_region).unwrap();
    mac.update(service.as_bytes());
    let k_service = mac.finalize().into_bytes();
    
    let mut mac = HmacSha256::new_from_slice(&k_service).unwrap();
    mac.update(b"request");
    let k_signing = mac.finalize().into_bytes();
    
    let mut mac = HmacSha256::new_from_slice(&k_signing).unwrap();
    mac.update(string_to_sign.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    
    let auth_header = format!(
        "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        ak, credential_scope, signed_headers, signature
    );
    
    let client = Client::new();
    let resp = client.get(&url)
        .header("x-date", &x_date)
        .header("Authorization", auth_header)
        .send()
        .await?;
        
    let resp_text = resp.text().await?;
    // tracing::info!("Volcengine query balance: {}", resp_text);
    
    let v: serde_json::Value = serde_json::from_str(&resp_text)?;
    
    if let Some(res) = v.get("Result") {
        let cash_balance = res.get("CashBalance").and_then(|v| v.as_str()).unwrap_or("0");
        return Ok(cash_balance.parse::<f64>().unwrap_or(0.0));
    }
    
    anyhow::bail!("Failed to parse Volcengine response: {}", resp_text)
}
