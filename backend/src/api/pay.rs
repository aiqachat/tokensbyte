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
use crate::services::payment::stripe::StripeClient;
use crate::services::payment::bonuspay::BonuspayClient;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Local;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub amount: f64,
    pub payment_method: String,
    /// BonusPay: 币种 USDT / USDC
    pub asset_code: Option<String>,
    /// BonusPay: 网络 TRON / ETH / POLYGON
    pub network: Option<String>,
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
    if payload.payment_method != "bonuspay" && payload.amount <= 0.0 {
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
    } else if payload.payment_method == "stripe" {
        let stripe_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_stripe'")).fetch_optional(&state.db.pool).await?;
        let stripe_config: crate::models::PaymentStripeSettings = serde_json::from_str(&stripe_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("Stripe 未配置".to_string()))?;

        if !stripe_config.enabled {
            return Err(AppError::BadRequest("Stripe 支付暂未开启".to_string()));
        }

        let return_url = std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
        let success_url = format!("{}/wallet?payment=success", return_url);
        let cancel_url = format!("{}/wallet?payment=cancelled", return_url);

        // 从全局货币设置读取货币代码
        let currency_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'currency_settings'")).fetch_optional(&state.db.pool).await?;
        let currency = currency_setting
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v["default_currency"].as_str().map(|s| s.to_lowercase()))
            .unwrap_or_else(|| "usd".to_string());

        let stripe_client = StripeClient::new(stripe_config);
        tracing::info!("[支付] Stripe Checkout Session 创建中, 货币: {}", currency);
        let (session_url, session_id) = stripe_client.create_checkout_session(
            &out_trade_no, payload.amount, &currency, "钱包充值",
            &success_url, &cancel_url,
        ).await.map_err(|e| AppError::UpstreamError(e.to_string()))?;
        tracing::info!("[支付] Stripe session_id: {}", session_id);
        payment_url = session_url;
    } else if payload.payment_method == "bonuspay" {
        let bonuspay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_bonuspay'")).fetch_optional(&state.db.pool).await?;
        let bonuspay_config: crate::models::PaymentBonuspaySettings = serde_json::from_str(&bonuspay_setting.unwrap_or_default()).map_err(|_| AppError::BadRequest("BonusPay 未配置".to_string()))?;

        if !bonuspay_config.enabled {
            return Err(AppError::BadRequest("BonusPay 支付暂未开启".to_string()));
        }

        let bonuspay_client = BonuspayClient::new(bonuspay_config);
        // Crypto TOPUP: 用户ID作为 customerId，前端选择币种和网络
        let asset_code = payload.asset_code.as_deref().unwrap_or("USDT");
        let network = payload.network.as_deref().unwrap_or("TRON");
        // 校验参数
        if !matches!(asset_code, "USDT" | "USDC") {
            return Err(AppError::BadRequest(format!("不支持的币种: {}", asset_code)));
        }
        if !matches!(network, "TRON" | "ETH" | "POLYGON") {
            return Err(AppError::BadRequest(format!("不支持的网络: {}", network)));
        }
        tracing::info!("[支付] BonusPay TOPUP: user={}, asset={}, network={}", claims.sub, asset_code, network);
        let wallet = bonuspay_client.get_deposit_address(&claims.sub, asset_code, network).await.map_err(|e| AppError::UpstreamError(e.to_string()))?;
        let cashier_url = wallet.cashier_url
            .ok_or_else(|| AppError::UpstreamError("BonusPay 未返回 cashierUrl".to_string()))?;

        // BonusPay TOPUP 不需要预创建订单，充值由回调驱动，直接返回
        tracing::info!("[支付] BonusPay 充值地址获取成功, cashierUrl 已返回");
        return Ok(Json(CreateOrderResp {
            out_trade_no: String::new(),
            payment_url: cashier_url,
        }));
    } else {
        return Err(AppError::BadRequest("不支持的支付方式".to_string()));
    }

    // Save order (仅用于微信/支付宝/Stripe 等传统支付方式)
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

    // 4. 前置检查：事务外查询，避免不必要的事务开销
    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
        .bind(out_trade_no)
        .fetch_optional(&state.db.pool)
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

    // 5. 事务处理：更新订单 + 充值余额 + 写充值记录
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[微信回调] 开启事务失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let amount = order.amount;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(trade_no).bind(&now).bind(out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[微信回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return (StatusCode::OK, Json(resp_success));
        }
        Err(e) => {
            tracing::error!("[微信回调] 更新订单状态失败: {:?}", e);
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
        _ => {}
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

    // 前置检查：事务外查询
    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
        .bind(&out_trade_no)
        .fetch_optional(&state.db.pool)
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

    // 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[支付宝回调] 开启事务失败: {:?}", e);
            return "fail".to_string();
        }
    };

    let amount = order.amount;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(&trade_no).bind(&now).bind(&out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[支付宝回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return "success".to_string();
        }
        Err(e) => {
            tracing::error!("[支付宝回调] 更新订单失败: {:?}", e);
            let _ = tx.rollback().await;
            return "fail".to_string();
        }
        _ => {}
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

pub async fn stripe_notify(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> impl IntoResponse {
    use axum::http::StatusCode;

    tracing::info!("[Stripe回调] 收到 Webhook 通知, body长度: {}", body.len());

    let resp_ok = (StatusCode::OK, "ok");
    let resp_fail = (StatusCode::BAD_REQUEST, "fail");

    // 1. 读取 Stripe 配置
    let stripe_setting: Option<String> = match sqlx::query_scalar(&state.db.format_query("SELECT value FROM settings WHERE key = 'payment_stripe'")).fetch_optional(&state.db.pool).await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[Stripe回调] 读取配置失败: {:?}", e);
            return resp_fail;
        }
    };

    let config = match serde_json::from_str::<crate::models::PaymentStripeSettings>(&stripe_setting.unwrap_or_default()) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[Stripe回调] 解析配置失败: {:?}", e);
            return resp_fail;
        }
    };

    // 2. 验证 Webhook 签名
    let sig_header = headers.get("stripe-signature").and_then(|v| v.to_str().ok()).unwrap_or("");
    let client = StripeClient::new(config);

    if !sig_header.is_empty() {
        match client.verify_webhook_signature(&body, sig_header) {
            Ok(true) => tracing::info!("[Stripe回调] 签名验证通过"),
            Ok(false) => {
                tracing::error!("[Stripe回调] 签名验证失败");
                return resp_fail;
            }
            Err(e) => {
                tracing::error!("[Stripe回调] 签名验证异常: {:?}", e);
                return resp_fail;
            }
        }
    } else {
        tracing::warn!("[Stripe回调] 缺少 Stripe-Signature 头，跳过签名验证（仅建议测试环境）");
    }

    // 3. 解析事件
    let event: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[Stripe回调] JSON 解析失败: {:?}", e);
            return resp_fail;
        }
    };

    let event_type = event["type"].as_str().unwrap_or("");
    tracing::info!("[Stripe回调] event type: {}", event_type);

    if event_type != "checkout.session.completed" {
        tracing::info!("[Stripe回调] 非 checkout.session.completed 事件，忽略");
        return resp_ok;
    }

    let session = &event["data"]["object"];
    let payment_status = session["payment_status"].as_str().unwrap_or("");
    let out_trade_no = session["client_reference_id"].as_str().unwrap_or("");
    let stripe_session_id = session["id"].as_str().unwrap_or("");

    tracing::info!("[Stripe回调] payment_status: {}, out_trade_no: {}, session_id: {}", payment_status, out_trade_no, stripe_session_id);

    if payment_status != "paid" {
        tracing::info!("[Stripe回调] payment_status 非 paid: {}", payment_status);
        return resp_ok;
    }

    // 4. 前置检查
    let order: Option<Order> = sqlx::query_as(&state.db.format_query("SELECT * FROM orders WHERE out_trade_no = ?"))
        .bind(out_trade_no)
        .fetch_optional(&state.db.pool)
        .await.unwrap_or(None);

    if order.is_none() {
        tracing::warn!("[Stripe回调] 订单不存在: {}", out_trade_no);
        return resp_ok;
    }

    let order = order.unwrap();
    if order.status != "pending" {
        tracing::info!("[Stripe回调] 订单已处理过, 当前状态: {}", order.status);
        return resp_ok;
    }

    // 5. 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[Stripe回调] 开启事务失败: {:?}", e);
            return resp_fail;
        }
    };

    let amount = order.amount;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let result = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'paid', trade_no = ?, paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"))
        .bind(stripe_session_id).bind(&now).bind(out_trade_no)
        .execute(&mut *tx).await;
    match result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::info!("[Stripe回调] 订单已被并发处理，跳过: {}", out_trade_no);
            let _ = tx.rollback().await;
            return resp_ok;
        }
        Err(e) => {
            tracing::error!("[Stripe回调] 更新订单状态失败: {:?}", e);
            let _ = tx.rollback().await;
            return resp_fail;
        }
        _ => {}
    }

    if let Err(e) = sqlx::query(&state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"))
        .bind(amount).bind(&order.user_id)
        .execute(&mut *tx).await {
        tracing::error!("[Stripe回调] 更新用户余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return resp_fail;
    }

    if let Err(e) = sqlx::query(&state.db.format_query("INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'stripe', ?)"))
        .bind(&order.user_id).bind(amount).bind(format!("Stripe 充值 订单号:{}", out_trade_no))
        .execute(&mut *tx).await {
        tracing::error!("[Stripe回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return resp_fail;
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("[Stripe回调] 事务提交失败: {:?}", e);
        return resp_fail;
    }

    tracing::info!("[Stripe回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2}", out_trade_no, order.user_id, amount);

    resp_ok
}

pub async fn bonuspay_notify(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    body: String,
) -> impl IntoResponse {
    tracing::info!("[BonusPay回调] 收到充值回调, body长度: {}", body.len());
    tracing::debug!("[BonusPay回调] 原始数据: {}", body);

    // 从 Header 中取签名
    let sign = headers
        .get("Sign")
        .or_else(|| headers.get("sign"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let partner_id = headers
        .get("Partner-Id")
        .or_else(|| headers.get("partner-id"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    tracing::info!("[BonusPay回调] Partner-Id: {}, Sign长度: {}", partner_id, sign.len());

    // 解析 JSON body
    let data: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[BonusPay回调] JSON 解析失败: {:?}", e);
            return "FAIL".to_string();
        }
    };

    // Crypto TOPUP 回调格式: body.customerDepositOrder
    let deposit_order = &data["body"]["customerDepositOrder"];
    let order_status = deposit_order["status"].as_str().unwrap_or("");
    let customer_id = deposit_order["customerId"].as_str().unwrap_or("");
    let order_no = deposit_order["orderNo"].as_str().unwrap_or("");
    let tx_hash = deposit_order["txHash"].as_str().unwrap_or("");
    let network = deposit_order["network"].as_str().unwrap_or("");

    // 实际到账金额 (扣除手续费后)
    let settled_amount = deposit_order["settledAmount"]["amount"]
        .as_f64()
        .unwrap_or(0.0);
    let settled_currency = deposit_order["settledAmount"]["currency"]
        .as_str()
        .unwrap_or("USDT");
    // 充值金额 (用户转入的原始金额)
    let deposit_amount = deposit_order["depositAmount"]["amount"]
        .as_f64()
        .unwrap_or(0.0);

    tracing::info!(
        "[BonusPay回调] status={}, customerId={}, orderNo={}, depositAmount={}, settledAmount={} {}, txHash={}, network={}",
        order_status, customer_id, order_no, deposit_amount, settled_amount, settled_currency, tx_hash, network
    );

    // 只处理 SUCCESS 状态
    if order_status != "SUCCESS" {
        tracing::info!("[BonusPay回调] 非成功状态，忽略: {}", order_status);
        return "SUCCESS".to_string();
    }

    if customer_id.is_empty() || settled_amount <= 0.0 {
        tracing::error!("[BonusPay回调] customerId 或 settledAmount 无效");
        return "FAIL".to_string();
    }

    // 读取配置
    let bonuspay_setting: Option<String> = sqlx::query_scalar(&state.db.format_query(
        "SELECT value FROM settings WHERE key = 'payment_bonuspay'",
    ))
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or_default();

    let config = match serde_json::from_str::<crate::models::PaymentBonuspaySettings>(
        &bonuspay_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[BonusPay回调] 解析配置失败: {:?}", e);
            return "FAIL".to_string();
        }
    };

    // 用 BonusPay 公钥验证签名 (安全加固)
    if !config.bonuspay_public_key.is_empty() {
        if sign.is_empty() {
            tracing::error!("[BonusPay回调] 签名为空，拒绝请求");
            return "FAIL".to_string();
        }
        match BonuspayClient::verify_signature(&config.bonuspay_public_key, &body, sign) {
            Ok(true) => {
                tracing::info!("[BonusPay回调] RSA 签名验证通过");
            }
            Ok(false) => {
                tracing::error!("[BonusPay回调] RSA 签名验证失败");
                return "FAIL".to_string();
            }
            Err(e) => {
                tracing::error!("[BonusPay回调] 签名验证异常: {:?}", e);
                return "FAIL".to_string();
            }
        }
    } else {
        tracing::warn!("[BonusPay回调] ⚠️ 严重警告：未配置 BonusPay 公钥，跳过签名验证，存在极高安全风险！");
    }

    // customerId 就是系统内的用户 ID
    let user_id = customer_id;

    // 检查用户是否存在
    let user_exists: Option<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT id FROM users WHERE id = ?"),
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if user_exists.is_none() {
        tracing::error!("[BonusPay回调] 用户不存在: {}", user_id);
        return "FAIL".to_string();
    }

    // 防止重复处理: 检查 orderNo 是否已经处理过
    let existing_order: Option<String> = sqlx::query_scalar(
        &state.db.format_query("SELECT trade_no FROM orders WHERE trade_no = ?"),
    )
    .bind(order_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

    if existing_order.is_some() {
        tracing::info!("[BonusPay回调] 订单已处理过, orderNo: {}", order_no);
        return "SUCCESS".to_string();
    }

    // 使用实际到账金额充值
    // 重要修复: BonusPay 回调中的 settledAmount 是 USDT/USDC 数量
    // 必须乘以汇率 (crypto_exchange_rate) 转换为系统货币 (如 CNY/USD) 后再入账
    let exchange_rate = config.crypto_exchange_rate;
    let amount = if exchange_rate > 0.0 {
        settled_amount * exchange_rate
    } else {
        settled_amount // fallback if not set properly
    };
    
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    tracing::info!(
        "[BonusPay回调] 货币转换: {} {} * {} (汇率) = {:.6} 系统货币",
        settled_amount, settled_currency, exchange_rate, amount
    );

    // 事务处理
    let mut tx = match state.db.pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("[BonusPay回调] 开启事务失败: {:?}", e);
            return "FAIL".to_string();
        }
    };

    // 创建订单记录
    let out_trade_no = format!("BP{}", order_no);
    if let Err(e) = sqlx::query(&state.db.format_query(
        "INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status, trade_no, paid_at) VALUES (?, ?, 'bonuspay', ?, 'paid', ?, ?)",
    ))
    .bind(&out_trade_no)
    .bind(user_id)
    .bind(amount)
    .bind(order_no)
    .bind(&now)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("[BonusPay回调] 创建订单记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return "FAIL".to_string();
    }

    // 充值余额
    if let Err(e) = sqlx::query(
        &state.db.format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("[BonusPay回调] 更新余额失败: {:?}", e);
        let _ = tx.rollback().await;
        return "FAIL".to_string();
    }

    // 写充值记录
    if let Err(e) = sqlx::query(&state.db.format_query(
        "INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, 'bonuspay', ?)",
    ))
    .bind(user_id)
    .bind(amount)
    .bind(format!(
        "BonusPay 充值 {} {} (txHash: {})",
        deposit_amount, settled_currency, tx_hash
    ))
    .execute(&mut *tx)
    .await
    {
        tracing::error!("[BonusPay回调] 写充值记录失败: {:?}", e);
        let _ = tx.rollback().await;
        return "FAIL".to_string();
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("[BonusPay回调] 事务提交失败: {:?}", e);
        return "FAIL".to_string();
    }

    tracing::info!(
        "[BonusPay回调] ✅ 充值完成: 用户={}, 到账={:.6} {}, txHash={}",
        user_id, amount, settled_currency, tx_hash
    );

    "SUCCESS".to_string()
}

