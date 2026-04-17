use axum::{
    extract::{State, Path},
    Json,
    response::IntoResponse,
};
use axum_extra::extract::WithRejection;
use std::sync::Arc;
use crate::AppState;
use crate::models::{Order, RechargeRecord};
use crate::error::{AppResult, AppError};
use crate::services::payment::alipay::AlipayClient;
use crate::services::payment::wechat::WechatClient;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Local;
use std::collections::BTreeMap;
use reqwest::StatusCode;

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub amount: f64,
    pub payment_method: String, // "wechat" or "alipay"
}

#[derive(Debug, Serialize)]
pub struct CreateOrderResp {
    pub out_trade_no: String,
    pub payment_url: String, // For Alipay it's the page url, for Wechat it's the native code_url
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    crate::extractors::AuthUser(user): crate::extractors::AuthUser,
    Json(payload): Json<CreateOrderReq>,
) -> AppResult<Json<CreateOrderResp>> {
    if payload.amount <= 0.0 {
        return Err(AppError::BadRequest("金额必须大于0".to_string()));
    }

    let out_trade_no = format!("T{}R{}", Local::now().format("%Y%m%d%H%M%S"), Uuid::new_v4().simple().to_string()[..8].to_string());
    
    // Check if method is enabled
    let site_url = {
        let setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'site_settings'"))
            .fetch_optional(&state.db.pool)
            .await?;
        let mut base_url = "http://localhost:8181".to_string(); // Fallback
        if let Some(val) = setting {
            // Ideally we'd have site.url but let's just use request header or hardcode a fallback for now.
            // Since this isn't provided directly, we'll construct it or assume frontend handles relative.
        }
        // Let's rely on standard config or just build notify url dynamically if request context is available.
        // For now:
        "https://api.example.com".to_string() // TODO: Fetch real domain somehow
    };

    let base_notify_url = std::env::var("PUBLIC_API_URL").unwrap_or_else(|_| "http://localhost:8181".to_string());

    let mut payment_url = String::new();

    if payload.payment_method == "wechat" {
        let wechat_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_wechat'")).fetch_optional(&state.db.pool).await?;
        let wechat_config: crate::models::PaymentWechatSettings = serde_json::from_str(&wechat_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("微信支付未配置".to_string()))?;
        
        if !wechat_config.enabled {
            return Err(AppError::BadRequest("微信支付暂未开启".to_string()));
        }

        let wechat_client = WechatClient::new(wechat_config);
        let notify_url = format!("{}/api/finance/pay/notify/wechat", base_notify_url);
        payment_url = wechat_client.create_native_order(&out_trade_no, payload.amount, "钱包充值", &notify_url).await?;
    } else if payload.payment_method == "alipay" {
        let alipay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_alipay'")).fetch_optional(&state.db.pool).await?;
        let alipay_config: crate::models::PaymentAlipaySettings = serde_json::from_str(&alipay_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("支付宝未配置".to_string()))?;
        
        if !alipay_config.enabled {
            return Err(AppError::BadRequest("支付宝暂未开启".to_string()));
        }

        let alipay_client = AlipayClient::new(alipay_config);
        let notify_url = format!("{}/api/finance/pay/notify/alipay", base_notify_url);
        let return_url = format!("{}/wallet", base_notify_url); // Or frontend URL
        payment_url = alipay_client.generate_page_pay_url(&out_trade_no, payload.amount, "钱包充值", &notify_url, &return_url)?;
    } else {
        return Err(AppError::BadRequest("不支持的支付方式".to_string()));
    }

    // Save order
    sqlx::query(&state.db.format_query("INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status) VALUES (?, ?, ?, ?, 'pending')"))
        .bind(&out_trade_no)
        .bind(&user.id)
        .bind(&payload.payment_method)
        .bind(payload.amount)
        .execute(&state.db.pool)
        .await?;

    Ok(Json(CreateOrderResp {
        out_trade_no,
        payment_url,
    }))
}

#[derive(Debug, Serialize)]
pub struct OrderStatusResp {
    pub status: String,
}

pub async fn check_status(
    State(state): State<Arc<AppState>>,
    crate::extractors::AuthUser(user): crate::extractors::AuthUser,
    Path(out_trade_no): Path<String>,
) -> AppResult<Json<OrderStatusResp>> {
    let order_status: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT status FROM orders WHERE out_trade_no = ? AND user_id = ?"))
        .bind(&out_trade_no)
        .bind(&user.id)
        .fetch_optional(&state.db.pool)
        .await?;

    if let Some(status) = order_status {
        Ok(Json(OrderStatusResp { status }))
    } else {
        Err(AppError::NotFound("订单不存在或无权访问".into()))
    }
}

// ================= Notifications =================

pub async fn wechat_notify(
    State(state): State<Arc<AppState>>,
    body: String,
) -> impl IntoResponse {
    use axum::response::IntoResponse;
    use reqwest::StatusCode;
    use crate::models::PaymentWechatSettings;
    
    tracing::info!("Received wechat notify: {}", body);
    
    let resp_success = serde_json::json!({
        "code": "SUCCESS",
        "message": "成功"
    });

    let resp_fail = serde_json::json!({
        "code": "FAIL",
        "message": "失败"
    });

    let wechat_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_wechat'")).fetch_optional(&state.db.pool).await.unwrap_or_default();
    
    let config = if let Ok(c) = serde_json::from_str::<PaymentWechatSettings>(&wechat_setting.unwrap_or_default()) {
        c
    } else {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    };

    let client = WechatClient::new(config);
    
    let payload: serde_json::Value = if let Ok(p) = serde_json::from_str(&body) {
        p
    } else {
        return (StatusCode::BAD_REQUEST, Json(resp_fail));
    };

    if payload["event_type"] != "TRANSACTION.SUCCESS" {
        return (StatusCode::OK, Json(resp_success));
    }

    let resource = &payload["resource"];
    let nonce = resource["nonce"].as_str().unwrap_or("");
    let associated_data = resource["associated_data"].as_str().unwrap_or("");
    let ciphertext = resource["ciphertext"].as_str().unwrap_or("");
    
    if let Ok(decrypted) = client.decrypt_callback_resource(nonce, associated_data, ciphertext) {
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&decrypted) {
            if data["trade_state"] == "SUCCESS" {
                let out_trade_no = data["out_trade_no"].as_str().unwrap_or("");
                let trade_no = data["transaction_id"].as_str().unwrap_or("");
                
                if let Ok(mut tx) = state.db.pool.begin().await {
                    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
                        .bind(out_trade_no)
                        .fetch_optional(&mut *tx)
                        .await.unwrap_or(None);

                    if let Some(order) = order {
                        if order.status == "pending" {
                            let amount = order.amount;
                            let _ = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ?"))
                                .bind(trade_no)
                                .bind(Local::now().format("%Y-%m-%d %H:%M:%S").to_string())
                                .bind(out_trade_no)
                                .execute(&mut *tx)
                                .await;

                            let _ = sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
                                .bind(amount)
                                .bind(&order.user_id)
                                .execute(&mut *tx)
                                .await;
                                
                            let _ = sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'wechat', ?)"))
                                .bind(&order.user_id)
                                .bind(amount)
                                .bind(format!("WeChat Order: {}", out_trade_no))
                                .execute(&mut *tx)
                                .await;

                            let _ = tx.commit().await;
                        }
                    }
                }
            }
        }
    }
    
    (StatusCode::OK, Json(resp_success))
}

pub async fn alipay_notify(
    State(state): State<Arc<AppState>>,
    body: String,
) -> impl IntoResponse {
    // URL encoded form data
    let mut params = BTreeMap::new();
    for pair in body.split('&') {
        let mut parts = pair.splitn(2, '=');
        let k = parts.next().unwrap_or("");
        let v = parts.next().unwrap_or("");
        if let Ok(dec_v) = urlencoding::decode(v) {
            params.insert(k.to_string(), dec_v.into_owned());
        }
    }

    let sign = params.get("sign").unwrap_or(&"".to_string()).clone();
    let out_trade_no = params.get("out_trade_no").unwrap_or(&"".to_string()).clone();
    let trade_no = params.get("trade_no").unwrap_or(&"".to_string()).clone();
    let trade_status = params.get("trade_status").unwrap_or(&"".to_string()).clone();
    let total_amount_str = params.get("total_amount").unwrap_or(&"0".to_string()).clone();

    if trade_status != "TRADE_SUCCESS" && trade_status != "TRADE_FINISHED" {
        return "success".to_string();
    }

    let alipay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_alipay'")).fetch_optional(&state.db.pool).await.unwrap_or_default();
    if let Ok(config) = serde_json::from_str::<crate::models::PaymentAlipaySettings>(&alipay_setting.unwrap_or_default()) {
        let client = AlipayClient::new(config);
        if let Ok(true) = client.verify_signature(&params, &sign) {
            // verified
            if let Ok(mut tx) = state.db.pool.begin().await {
                let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
                    .bind(&out_trade_no)
                    .fetch_optional(&mut *tx)
                    .await.unwrap_or(None);

                if let Some(order) = order {
                    if order.status == "pending" {
                        let amount = order.amount;
                        // update order
                        let _ = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ?"))
                            .bind(&trade_no)
                            .bind(Local::now().format("%Y-%m-%d %H:%M:%S").to_string())
                            .bind(&out_trade_no)
                            .execute(&mut *tx)
                            .await;

                        // Add user balance
                        let _ = sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
                            .bind(amount)
                            .bind(&order.user_id)
                            .execute(&mut *tx)
                            .await;
                            
                        // Record
                        let _ = sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'alipay', ?)"))
                            .bind(&order.user_id)
                            .bind(amount)
                            .bind(format!("Alipay Order: {}", out_trade_no))
                            .execute(&mut *tx)
                            .await;

                        let _ = tx.commit().await;
                    }
                }
            }
        }
    }

    "success".to_string()
}
