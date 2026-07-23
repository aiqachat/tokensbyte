/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia
 * @license        MIT (https://www.tokensbyte.ai/)
 */

//! 上游渠道素材接口客户端（Bearer + Action/Version 查询参数）
//!
//! 用于 upstream_asset_relay：对绑定渠道 base_url(+可选 path) 发起 CreateAsset/GetAsset。

use crate::relay::url_utils::join_url;
use anyhow::{anyhow, Result};
use serde_json::Value;

const ASSET_API_VERSION: &str = "2024-01-01";

/// 拼装素材接口基础 endpoint（不含 Action/Version）。
/// `asset_base_path` 为空时直接使用 `base_url`（去尾 `/`），禁止走 join_url("",)。
pub fn build_asset_endpoint(base_url: &str, asset_base_path: &str) -> String {
    let path = asset_base_path.trim();
    if path.is_empty() {
        base_url.trim_end_matches('/').to_string()
    } else {
        join_url(base_url, path)
    }
}

/// 在 endpoint 上追加 Action/Version；若已有 query 则用 `&`。
pub fn append_action_query(endpoint: &str, action: &str) -> String {
    let sep = if endpoint.contains('?') { '&' } else { '?' };
    format!(
        "{}{}Action={}&Version={}",
        endpoint, sep, action, ASSET_API_VERSION
    )
}

/// 从响应中取字段：优先 `Result.<key>`，其次顶层 `<key>`。
pub fn extract_result_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .pointer(&format!("/Result/{}", key))
        .and_then(|v| v.as_str())
        .or_else(|| value.get(key).and_then(|v| v.as_str()))
}

fn spawn_api_log(
    db: crate::db::Database,
    user_id: String,
    plugin_name: String,
    action: String,
    request_payload: String,
    response_payload: String,
    status_code: i32,
) {
    tokio::spawn(async move {
        let _ = sqlx::query(&db.format_query(
            "INSERT INTO plugin_api_logs (user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, source) \
             VALUES (?, ?, ?, ?, ?, ?, 'upstream_relay_convert')",
        ))
        .bind(&user_id)
        .bind(&plugin_name)
        .bind(&action)
        .bind(&request_payload)
        .bind(&response_payload)
        .bind(status_code)
        .execute(&db.pool)
        .await;
    });
}

/// Bearer 调用上游素材 Action 所需上下文（避免过多参数）。
pub struct UpstreamCallCtx<'a> {
    pub http: &'a reqwest::Client,
    pub db: &'a crate::db::Database,
    pub user_id: &'a str,
    pub plugin_name: &'a str,
    pub endpoint_base: &'a str,
    pub api_key: &'a str,
}

/// Bearer 调用上游素材 Action（带日志），返回完整 JSON。
pub async fn call_action_logged(
    ctx: &UpstreamCallCtx<'_>,
    action: &str,
    body: &Value,
) -> Result<Value> {
    let url = append_action_query(ctx.endpoint_base, action);
    let req_payload = body.to_string();
    let res = ctx
        .http
        .post(&url)
        .header("Authorization", format!("Bearer {}", ctx.api_key))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await?;
    let status_code = res.status().as_u16() as i32;
    let text = res.text().await.unwrap_or_default();
    spawn_api_log(
        ctx.db.clone(),
        ctx.user_id.to_string(),
        ctx.plugin_name.to_string(),
        action.to_string(),
        req_payload,
        text.clone(),
        status_code,
    );
    if !(200..300).contains(&status_code) {
        return Err(anyhow!("上游素材接口错误: {} - {}", status_code, text));
    }
    serde_json::from_str(&text).map_err(|e| anyhow!("解析上游素材响应失败: {} - {}", e, text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn empty_path_appends_query_on_base() {
        let ep = build_asset_endpoint("https://x.com", "");
        assert_eq!(ep, "https://x.com");
        assert_eq!(
            append_action_query(&ep, "CreateAsset"),
            "https://x.com?Action=CreateAsset&Version=2024-01-01"
        );
    }

    #[test]
    fn empty_path_trims_trailing_slash() {
        let ep = build_asset_endpoint("https://x.com/", "  ");
        assert_eq!(ep, "https://x.com");
        let url = append_action_query(&ep, "CreateAsset");
        assert!(!url.contains("://x.com/?"));
        assert!(url.starts_with("https://x.com?Action="));
    }

    #[test]
    fn non_empty_path_joins() {
        let ep = build_asset_endpoint("https://x.com", "/api");
        assert_eq!(ep, "https://x.com/api");
        assert_eq!(
            append_action_query(&ep, "GetAsset"),
            "https://x.com/api?Action=GetAsset&Version=2024-01-01"
        );
    }

    #[test]
    fn existing_query_uses_ampersand() {
        let ep = build_asset_endpoint("https://x.com?foo=1", "");
        assert_eq!(
            append_action_query(&ep, "CreateAsset"),
            "https://x.com?foo=1&Action=CreateAsset&Version=2024-01-01"
        );
    }

    #[test]
    fn extract_result_wrapped_and_top_level() {
        let wrapped = json!({"Result": {"Id": "asset-1", "Status": "Active"}});
        assert_eq!(extract_result_field(&wrapped, "Id"), Some("asset-1"));
        assert_eq!(extract_result_field(&wrapped, "Status"), Some("Active"));
        let top = json!({"Id": "asset-2", "Status": "active"});
        assert_eq!(extract_result_field(&top, "Id"), Some("asset-2"));
        assert_eq!(extract_result_field(&top, "Status"), Some("active"));
    }
}
