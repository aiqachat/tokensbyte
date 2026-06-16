use reqwest::Client;

pub async fn query_balance(ak: &str, sk: &str) -> anyhow::Result<f64> {
    #[cfg(not(feature = "commercial_plugins"))]
    {
        let _ = ak; let _ = sk;
        anyhow::bail!("火山引擎余额查询未启用（商业插件未安装）")
    }
    #[cfg(feature = "commercial_plugins")]
    {
        let host = "open.volcengineapi.com";
        let region = "cn-beijing";
        let service = "billing";
        let action = "QueryBalanceAcct";
        let version = "2022-01-01";

        // 调用公共签名函数
        let query_str = format!("Action={}&Version={}", action, version);
        let (auth_header, x_date, payload_hash) = crate::services::volcengine::volcengine_sign(
            ak, sk, "GET", host, "/", &query_str, service, region, b""
        );

        // 发起请求
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
}
