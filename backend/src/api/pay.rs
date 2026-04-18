use axum::{
    extract::{State, Path},
    Json,
    response::IntoResponse,
};
use std::sync::Arc;
use crate::AppState;
use crate::models::order::Order;
use crate::error::{AppResult, AppError};
use crate::services::payment::alipay::AlipayClient;
use crate::services::payment::wechat::WechatClient;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Local;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub amount: f64,
    pub payment_method: String,
}

#[derive(Debug, Serialize)]
pub struct CreateOrderResp {
    pub out_trade_no: String,
    pub payment_url: String,
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<CreateOrderReq>,
) -> AppResult<Json<CreateOrderResp>> {
    if payload.amount <= 0.0 {
        return Err(AppError::BadRequest("金额必须大于0".to_string()));
    }

    let out_trade_no = format!("T{}R{}", Local::now().format("%Y%m%d%H%M%S"), &Uuid::new_v4().simple().to_string()[..8]);

    // 回调基地址推断：生产环境微信/支付宝回调通过前端nginx反代到后端
    // 优先级: PUBLIC_API_URL env > Origin header > Host header
    let base_notify_url = std::env::var("PUBLIC_API_URL").ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            // 从请求 Origin 获取（浏览器自动携带完整协议+域名）
            headers.get("origin").and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(|s| s.to_string())
        })
        .or_else(|| {
            // 从 X-Forwarded-Host（经过反向代理）或 Host 头获取
            let host = headers.get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let scheme = headers.get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(if host.contains("localhost") || host.contains("127.0.0.1") { "http" } else { "https" });
            Some(format!("{}://{}", scheme, host))
        })
        .unwrap_or_else(|| "http://localhost:3000".to_string())
        .trim_end_matches('/')
        .to_string();

    tracing::info!("[支付] 用户 {} 发起充值 {:.2} 元, 方式: {}, 订单号: {}, 回调基地址: {}",
        claims.sub, payload.amount, payload.payment_method, out_trade_no, base_notify_url);

    let payment_url: String;

    if payload.payment_method == "wechat" {
        let wechat_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_wechat'")).fetch_optional(&state.db.pool).await?;
        let wechat_config: crate::models::PaymentWechatSettings = serde_json::from_str(&wechat_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("微信支付未配置".to_string()))?;

        if !wechat_config.enabled {
            return Err(AppError::BadRequest("微信支付暂未开启".to_string()));
        }

        let wechat_client = WechatClient::new(wechat_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/wechat", base_notify_url);
        tracing::info!("[支付] 微信回调地址: {}", notify_url);
        payment_url = wechat_client.create_native_order(&out_trade_no, payload.amount, "钱包充值", &notify_url).await?;
    } else if payload.payment_method == "alipay" {
        let alipay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_alipay'")).fetch_optional(&state.db.pool).await?;
        let alipay_config: crate::models::PaymentAlipaySettings = serde_json::from_str(&alipay_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("支付宝未配置".to_string()))?;

        if !alipay_config.enabled {
            return Err(AppError::BadRequest("支付宝暂未开启".to_string()));
        }

        let alipay_client = AlipayClient::new(alipay_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/alipay", base_notify_url);
        let return_url = std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
        let return_url = format!("{}/wallet", return_url);
        tracing::info!("[支付] 支付宝回调地址: {}", notify_url);
        payment_url = alipay_client.generate_page_pay_url(&out_trade_no, payload.amount, "钱包充值", &notify_url, &return_url)?;
    } else {
        return Err(AppError::BadRequest("不支持的支付方式".to_string()));
    }

    // Save order
    sqlx::query(&state.db.format_query("INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status) VALUES (?, ?, ?, ?, 'pending')"))
        .bind(&out_trade_no)
        .bind(&claims.sub)
        .bind(&payload.payment_method)
        .bind(payload.amount)
        .execute(&state.db.pool)
        .await?;

    tracing::info!("[支付] 订单创建成功: {}, payment_url 已生成", out_trade_no);

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
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    Path(out_trade_no): Path<String>,
) -> AppResult<Json<OrderStatusResp>> {
    let order_status: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT status FROM orders WHERE out_trade_no = ? AND user_id = ?"))
        .bind(&out_trade_no)
        .bind(&claims.sub)
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
    use crate::models::PaymentWechatSettings;
    use axum::http::StatusCode;

    tracing::info!("[微信回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[微信回调] 原始数据: {}", body);

    let resp_success = serde_json::json!({ "code": "SUCCESS", "message": "成功" });
    let resp_fail = serde_json::json!({ "code": "FAIL", "message": "失败" });

    // 1. 读取配置
    let wechat_setting: Option<String> = match sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_wechat'")).fetch_optional(&state.db.pool).await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[微信回调] 读取配置失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let config = match serde_json::from_str::<PaymentWechatSettings>(&wechat_setting.unwrap_or_default()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[微信回调] 解析配置失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let client = WechatClient::new(config);

    // 2. 解析回调报文
    let payload: serde_json::Value = match serde_json::from_str(&body) {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("[微信回调] JSON解析失败: {:?}", e);
            return (StatusCode::BAD_REQUEST, Json(resp_fail));
        }
    };

    let event_type = payload["event_type"].as_str().unwrap_or("");
    tracing::info!("[微信回调] event_type: {}", event_type);

    if event_type != "TRANSACTION.SUCCESS" {
        tracing::info!("[微信回调] 非支付成功事件，忽略: {}", event_type);
        return (StatusCode::OK, Json(resp_success));
    }

    // 3. 解密资源
    let resource = &payload["resource"];
    let nonce = resource["nonce"].as_str().unwrap_or("");
    let associated_data = resource["associated_data"].as_str().unwrap_or("");
    let ciphertext = resource["ciphertext"].as_str().unwrap_or("");

    let decrypted = match client.decrypt_callback_resource(nonce, associated_data, ciphertext) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("[微信回调] AES解密失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    tracing::info!("[微信回调] 解密成功: {}", decrypted);

    let data: serde_json::Value = match serde_json::from_str(&decrypted) {
        Ok(d) => d,
        Err(e) => {
            tracing::error!("[微信回调] 解密数据JSON解析失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let trade_state = data["trade_state"].as_str().unwrap_or("");
    let out_trade_no = data["out_trade_no"].as_str().unwrap_or("");
    let trade_no = data["transaction_id"].as_str().unwrap_or("");

    tracing::info!("[微信回调] trade_state: {}, out_trade_no: {}, transaction_id: {}", trade_state, out_trade_no, trade_no);

    if trade_state != "SUCCESS" {
        tracing::info!("[微信回调] 交易状态非SUCCESS: {}", trade_state);
        return (StatusCode::OK, Json(resp_success));
    }

    // 4. 事务处理：更新订单 + 充值余额 + 写充值记录
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[微信回调] 开启事务失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
        .bind(out_trade_no)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[微信回调] 订单不存在: {}", out_trade_no);
        return (StatusCode::OK, Json(resp_success));
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[微信回调] 订单已处理过, 当前状态: {}, 跳过", order.status);
        return (StatusCode::OK, Json(resp_success));
    }

    let amount = order.amount;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if let Err(e) = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ?"))
        .bind(trade_no).bind(&now).bind(out_trade_no)
        .execute(&mut *tx).await {
        tracing::error!("[微信回调] 更新订单状态失败: {:?}", e);
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    if let Err(e) = sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
        .bind(amount).bind(&order.user_id)
        .execute(&mut *tx).await {
        tracing::error!("[微信回调] 更新用户余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    if let Err(e) = sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'wechat', ?)"))
        .bind(&order.user_id).bind(amount).bind(format!("微信支付充值 订单号:{}", out_trade_no))
        .execute(&mut *tx).await {
        tracing::error!("[微信回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("[微信回调] 事务提交失败: {:?}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
    }

    tracing::info!("[微信回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元", out_trade_no, order.user_id, amount);

    (StatusCode::OK, Json(resp_success))
}

pub async fn alipay_notify(
    State(state): State<Arc<AppState>>,
    body: String,
) -> impl IntoResponse {
    tracing::info!("[支付宝回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[支付宝回调] 原始数据: {}", body);

    // 使用标准 form_urlencoded 解析，正确处理 %2B → + 等编码
    let params: BTreeMap<String, String> = form_urlencoded::parse(body.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let sign = params.get("sign").cloned().unwrap_or_default();
    let out_trade_no = params.get("out_trade_no").cloned().unwrap_or_default();
    let trade_no = params.get("trade_no").cloned().unwrap_or_default();
    let trade_status = params.get("trade_status").cloned().unwrap_or_default();

    tracing::info!("[支付宝回调] trade_status: {}, out_trade_no: {}, trade_no: {}", trade_status, out_trade_no, trade_no);

    if trade_status != "TRADE_SUCCESS" && trade_status != "TRADE_FINISHED" {
        tracing::info!("[支付宝回调] 非成功状态，忽略: {}", trade_status);
        return "success".to_string();
    }

    let alipay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_alipay'"))
        .fetch_optional(&state.db.pool).await.unwrap_or_default();

    let config = match serde_json::from_str::<crate::models::PaymentAlipaySettings>(&alipay_setting.unwrap_or_default()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[支付宝回调] 解析配置失败: {:?}", e);
            return "fail".to_string();
        }
    };

    let client = AlipayClient::new(config);
    match client.verify_signature(&params, &sign) {
        Ok(true) => tracing::info!("[支付宝回调] 签名验证通过"),
        Ok(false) => {
            tracing::error!("[支付宝回调] 签名验证失败");
            return "fail".to_string();
        }
        Err(e) => {
            tracing::error!("[支付宝回调] 签名验证异常: {:?}", e);
            return "fail".to_string();
        }
    }

    // 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[支付宝回调] 开启事务失败: {:?}", e);
            return "fail".to_string();
        }
    };

    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
        .bind(&out_trade_no)
        .fetch_optional(&mut *tx)
        .await.unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[支付宝回调] 订单不存在: {}", out_trade_no);
        return "success".to_string();
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[支付宝回调] 订单已处理过, 当前状态: {}", order.status);
        return "success".to_string();
    }

    let amount = order.amount;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if let Err(e) = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ?"))
        .bind(&trade_no).bind(&now).bind(&out_trade_no)
        .execute(&mut *tx).await {
        tracing::error!("[支付宝回调] 更新订单失败: {:?}", e);
        let _ = tx.rollback().await;
        return "fail".to_string();
    }

    if let Err(e) = sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
        .bind(amount).bind(&order.user_id)
        .execute(&mut *tx).await {
        tracing::error!("[支付宝回调] 更新余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return "fail".to_string();
    }

    if let Err(e) = sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'alipay', ?)"))
        .bind(&order.user_id).bind(amount).bind(format!("支付宝充值 订单号:{}", out_trade_no))
        .execute(&mut *tx).await {
        tracing::error!("[支付宝回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return "fail".to_string();
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("[支付宝回调] 事务提交失败: {:?}", e);
        return "fail".to_string();
    }

    tracing::info!("[支付宝回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元", out_trade_no, order.user_id, amount);

    "success".to_string()
}
