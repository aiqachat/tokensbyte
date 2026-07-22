/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use crate::error::{AppError, AppResult};
use crate::models::order::Order;
use crate::services::payment::alipay::AlipayClient;
use crate::services::payment::allinpay::AllinpayClient;
use crate::services::payment::bonuspay::BonuspayClient;
use crate::services::payment::hyperbc::HyperbcClient;
use crate::services::payment::stripe::StripeClient;
use crate::services::payment::wechat::WechatClient;
use crate::time_system::DbTs;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use std::sync::Arc;

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub amount: f64,
    pub payment_method: String,
    /// BonusPay: 币种 USDT / USDC
    pub asset_code: Option<String>,
    /// BonusPay: 网络 TRON / ETH / POLYGON
    pub network: Option<String>,
    /// 是否为移动端支付请求 (用于部分聚合支付通道多端跳转或扫码的自适应)
    #[serde(default)]
    pub is_mobile: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateOrderResp {
    pub out_trade_no: String,
    pub payment_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hyperbc_data: Option<serde_json::Value>,
}

pub async fn create_order(
    State(state): State<Arc<AppState>>,
    axum::extract::Extension(claims): axum::extract::Extension<crate::auth::Claims>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<CreateOrderReq>,
) -> AppResult<Json<CreateOrderResp>> {
    if payload.payment_method != "bonuspay" {
        let min_amount = crate::api::settings::get_currency_settings(&state)
            .await
            .min_recharge_amount;

        if min_amount > 0.0 && payload.amount < min_amount {
            return Err(AppError::BadRequest(format!(
                "充值金额不能小于 {}",
                min_amount
            )));
        }
        if payload.amount < 0.01 {
            return Err(AppError::BadRequest("金额必须大于或等于 0.01".to_string()));
        }
    }

    // 检查用户是否被禁止在线支付（pay_enabled 为 0 表示禁止支付，1 表示允许支付）
    let pay_enabled: Option<i32> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT pay_enabled FROM users WHERE id = ?"),
    )
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;
    if pay_enabled.unwrap_or(1) == 0 {
        return Err(AppError::Forbidden(
            "您的在线支付功能已被管理员关闭".to_string(),
        ));
    }

    let out_trade_no = format!(
        "T{}R{}",
        Local::now().format("%Y%m%d%H%M%S"),
        &Uuid::new_v4().simple().to_string()[..8]
    );

    // 回调基地址推断：生产环境微信/支付宝回调通过前端nginx反代到后端
    // 优先级: PUBLIC_API_URL env > Origin header > Host header
    let base_notify_url = std::env::var("PUBLIC_API_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            // 从请求 Origin 获取（浏览器自动携带完整协议+域名）
            headers
                .get("origin")
                .and_then(|v| v.to_str().ok())
                .filter(|s| !s.is_empty() && *s != "null")
                .map(|s| s.to_string())
        })
        .or_else(|| {
            // 从 X-Forwarded-Host（经过反向代理）或 Host 头获取
            let host = headers
                .get("x-forwarded-host")
                .or_else(|| headers.get("host"))
                .and_then(|v| v.to_str().ok())?;
            let scheme = headers
                .get("x-forwarded-proto")
                .and_then(|v| v.to_str().ok())
                .unwrap_or(
                    if host.contains("localhost") || host.contains("127.0.0.1") {
                        "http"
                    } else {
                        "https"
                    },
                );
            Some(format!("{}://{}", scheme, host))
        })
        .unwrap_or_else(|| "http://localhost:3000".to_string())
        .trim_end_matches('/')
        .to_string();

    tracing::info!(
        "[支付] 用户 {} 发起充值 {:.2} 元, 方式: {}, 订单号: {}, 回调基地址: {}",
        claims.sub,
        payload.amount,
        payload.payment_method,
        out_trade_no,
        base_notify_url
    );

    let payment_url: String;
    let mut trade_no: Option<String> = None;
    let mut hyperbc_data: Option<serde_json::Value> = None;

    if payload.payment_method == "wechat" {
        let wechat_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_wechat'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let wechat_config: crate::models::PaymentWechatSettings =
            serde_json::from_str(&wechat_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("微信支付未配置".to_string()))?;

        if !wechat_config.enabled {
            return Err(AppError::BadRequest("微信支付暂未开启".to_string()));
        }

        let wechat_client = WechatClient::new(wechat_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/wechat", base_notify_url);
        tracing::info!("[支付] 微信回调地址: {}", notify_url);
        payment_url = wechat_client
            .create_native_order(&out_trade_no, payload.amount, "钱包充值", &notify_url)
            .await?;
    } else if payload.payment_method == "alipay" {
        let alipay_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_alipay'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let alipay_config: crate::models::PaymentAlipaySettings =
            serde_json::from_str(&alipay_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("支付宝未配置".to_string()))?;

        if !alipay_config.enabled {
            return Err(AppError::BadRequest("支付宝暂未开启".to_string()));
        }

        let alipay_client = AlipayClient::new(alipay_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/alipay", base_notify_url);
        let return_url =
            std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
        let return_url = format!("{}/wallet", return_url);
        tracing::info!("[支付] 支付宝回调地址: {}", notify_url);
        payment_url = alipay_client.generate_page_pay_url(
            &out_trade_no,
            payload.amount,
            "钱包充值",
            &notify_url,
            &return_url,
        )?;
    } else if payload.payment_method == "stripe" {
        let stripe_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_stripe'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let stripe_config: crate::models::PaymentStripeSettings =
            serde_json::from_str(&stripe_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("Stripe 未配置".to_string()))?;

        if !stripe_config.enabled {
            return Err(AppError::BadRequest("Stripe 支付暂未开启".to_string()));
        }

        let return_url =
            std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
        let success_url = format!("{}/wallet?payment=success", return_url);
        let cancel_url = format!("{}/wallet?payment=cancelled", return_url);

        // 从全局货币设置读取货币代码
        let currency = crate::api::settings::get_currency_settings(&state)
            .await
            .default_currency
            .to_lowercase();

        let stripe_client = StripeClient::new(stripe_config);
        tracing::info!("[支付] Stripe Checkout Session 创建中, 货币: {}", currency);
        let (session_url, session_id) = stripe_client
            .create_checkout_session(
                &out_trade_no,
                payload.amount,
                &currency,
                "钱包充值",
                &success_url,
                &cancel_url,
            )
            .await
            .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        tracing::info!("[支付] Stripe session_id: {}", session_id);
        payment_url = session_url;
    } else if payload.payment_method == "bonuspay" {
        let bonuspay_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_bonuspay'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let bonuspay_config: crate::models::PaymentBonuspaySettings =
            serde_json::from_str(&bonuspay_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("BonusPay 未配置".to_string()))?;

        if !bonuspay_config.enabled {
            return Err(AppError::BadRequest("BonusPay 支付暂未开启".to_string()));
        }

        let bonuspay_client = BonuspayClient::new(bonuspay_config);
        // Crypto TOPUP: 用户ID作为 customerId，前端选择币种和网络
        let asset_code = payload.asset_code.as_deref().unwrap_or("USDT");
        let network = payload.network.as_deref().unwrap_or("TRON");
        // 校验参数
        if !matches!(asset_code, "USDT" | "USDC") {
            return Err(AppError::BadRequest(format!(
                "不支持的币种: {}",
                asset_code
            )));
        }
        if !matches!(network, "TRON" | "ETH" | "POLYGON") {
            return Err(AppError::BadRequest(format!("不支持的网络: {}", network)));
        }
        tracing::info!(
            "[支付] BonusPay TOPUP: user={}, asset={}, network={}",
            claims.sub,
            asset_code,
            network
        );
        let wallet = bonuspay_client
            .get_deposit_address(&claims.sub, asset_code, network)
            .await
            .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        let cashier_url = wallet
            .cashier_url
            .ok_or_else(|| AppError::UpstreamError("BonusPay 未返回 cashierUrl".to_string()))?;

        // BonusPay TOPUP 不需要预创建订单，充值由回调驱动，直接返回
        tracing::info!("[支付] BonusPay 充值地址获取成功, cashierUrl 已返回");
        return Ok(Json(CreateOrderResp {
            out_trade_no: String::new(),
            payment_url: cashier_url,
            hyperbc_data: None,
        }));
    } else if payload.payment_method == "hyperbc" {
        let hyperbc_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let hyperbc_config: crate::models::PaymentHyperbcSettings =
            serde_json::from_str(&hyperbc_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("HyperBC 支付未配置".to_string()))?;

        if !hyperbc_config.enabled {
            return Err(AppError::BadRequest("HyperBC 支付暂未开启".to_string()));
        }

        let hyperbc_client = HyperbcClient::new(hyperbc_config);
        let return_url =
            std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
        let return_url = format!("{}/wallet", return_url);

        let lang = headers
            .get("accept-language")
            .and_then(|v| v.to_str().ok())
            .map(|s| if s.starts_with("en") { "en" } else { "zh" })
            .unwrap_or("zh");

        // 读取系统货币设置作为 CipherBC H5 订单的法币币种
        let currency = crate::api::settings::get_currency_settings(&state)
            .await
            .default_currency
            .to_lowercase();

        tracing::info!(
            "[支付] HyperBC H5 Hosted Cashier 创建中: return_url={}, currency={}, lang={}",
            return_url,
            currency,
            lang
        );

        let h5_order = hyperbc_client
            .create_h5_order(&out_trade_no, payload.amount, &currency, &return_url, lang)
            .await
            .map_err(|e| AppError::UpstreamError(e.to_string()))?;

        payment_url = h5_order.checkout_url.clone();
        trade_no = Some(h5_order.order_no.clone());
        hyperbc_data = Some(serde_json::to_value(&h5_order).unwrap_or_default());
    } else if payload.payment_method == "allinpay_wechat"
        || payload.payment_method == "allinpay_alipay"
    {
        let allinpay_setting: Option<String> = sqlx::query_scalar(
            &state
                .db
                .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
        )
        .fetch_optional(&state.db.pool)
        .await?;
        let allinpay_config: crate::models::PaymentAllinpaySettings =
            serde_json::from_str(&allinpay_setting.unwrap_or_default())
                .map_err(|_| AppError::BadRequest("通联支付未配置".to_string()))?;

        if !allinpay_config.enabled {
            return Err(AppError::BadRequest("通联支付暂未开启".to_string()));
        }

        let allinpay_client = AllinpayClient::new(allinpay_config);
        let notify_url = format!("{}/api/v1/finance/pay/notify/allinpay", base_notify_url);

        let client_is_mobile = payload.is_mobile.unwrap_or_else(|| {
            if let Some(ua) = headers.get("user-agent").and_then(|v| v.to_str().ok()) {
                let ua_lower = ua.to_lowercase();
                ua_lower.contains("mobile")
                    || ua_lower.contains("android")
                    || ua_lower.contains("iphone")
                    || ua_lower.contains("ipad")
            } else {
                false
            }
        });

        if client_is_mobile {
            // 手机H5收银台模式
            let return_url =
                std::env::var("PUBLIC_FRONTEND_URL").unwrap_or_else(|_| base_notify_url.clone());
            let return_url = format!("{}/wallet", return_url);
            tracing::info!("[支付] 通联 H5 收银台支付创建中, return_url={}", return_url);
            payment_url = allinpay_client
                .generate_h5_pay_url(&out_trade_no, payload.amount, &notify_url, &return_url)
                .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        } else {
            // PC端扫码支付模式 (微信/支付宝二维码)
            let paytype = if payload.payment_method == "allinpay_wechat" {
                "W01"
            } else {
                "A01"
            };
            tracing::info!(
                "[支付] 通联 PC 扫码支付创建中, 方式: {}, paytype: {}",
                payload.payment_method,
                paytype
            );
            payment_url = allinpay_client
                .create_scan_pay(
                    &out_trade_no,
                    payload.amount,
                    "钱包充值",
                    &notify_url,
                    paytype,
                )
                .await
                .map_err(|e| AppError::UpstreamError(e.to_string()))?;
        }
    } else {
        return Err(AppError::BadRequest("不支持的支付方式".to_string()));
    }

    // 保存待支付订单记录 (仅用于微信/支付宝/Stripe/HyperBC 等传统支付方式)
    // 数据库写入操作字段说明：
    // - out_trade_no: 系统内唯一交易流水号，格式 T年月日时分秒R随机字符串
    // - user_id: 关联充值发起者的用户主键ID
    // - payment_method: 支付通道类型 (可选值: wechat, alipay, stripe, hyperbc, allinpay_wechat, allinpay_alipay)
    // - amount: 充值金额，对应本系统的法币余额数量
    // - status: 订单处理进度状态，初始化设定为 'pending'
    // - created_at: 订单的创建时间（TIMESTAMPTZ，由数据库 CURRENT_TIMESTAMP 写入）
    sqlx::query(&state.db.format_query("INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status, created_at, trade_no) VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, ?)"))
        .bind(&out_trade_no)
        .bind(&claims.sub)
        .bind(&payload.payment_method)
        .bind(payload.amount)
        .bind(trade_no)
        .execute(&state.db.pool)
        .await?;

    tracing::info!("[支付] 订单创建成功: {}, payment_url 已生成", out_trade_no);

    Ok(Json(CreateOrderResp {
        out_trade_no,
        payment_url,
        hyperbc_data,
    }))
}

/// 通用的充值入账核心逻辑，集成更新订单状态、加用户余额、记录明细三合一事务。
/// 利用数据库行锁与 `status = 'pending'` 限制条件提供强幂等防护，杜绝高并发重复充值。
async fn complete_recharge_payment_common(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
    payment_method: &str,
    channel_name_zh: &str,
) -> AppResult<bool> {
    // 开启数据库事务进行余额入账与记录插入
    let mut tx = state
        .db
        .pool
        .begin()
        .await
        .map_err(|e| AppError::Internal(format!("启动事务失败: {:?}", e)))?;
    let now = DbTs::now();

    // 1. 更新订单表 orders，状态由 pending 变更为 paid
    // 限制条件：仅在原状态为 'pending' 时才能成功更新，防止并发或重复充值
    let result = sqlx::query(&state.db.format_query(
        "UPDATE orders SET status = 'paid', paid_at = ? WHERE out_trade_no = ? AND status = 'pending'"
    ))
    .bind(&now)
    .bind(out_trade_no)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("更新订单状态失败: {:?}", e)))?;

    if result.rows_affected() == 0 {
        tracing::info!(
            "[{}] 订单已是支付状态或已被并发处理，跳过: {}",
            channel_name_zh,
            out_trade_no
        );
        let _ = tx.rollback().await;
        return Ok(false); // 已处理，返回 false
    }

    // 2. 增加用户账户余额 users
    sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&now)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("更新用户余额失败: {:?}", e)))?;

    // 3. 写入充值流水明细表 recharge_records
    // 备注中写入详细中文以方便维护审计
    let remark = format!("{}充值 订单号:{}", channel_name_zh, out_trade_no);
    sqlx::query(&state.db.format_query(
        "INSERT INTO recharge_records (user_id, amount, recharge_type, remark) VALUES (?, ?, ?, ?)",
    ))
    .bind(user_id)
    .bind(amount)
    .bind(payment_method)
    .bind(&remark)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("插入充值记录失败: {:?}", e)))?;

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(format!("提交事务失败: {:?}", e)))?;

    tracing::info!(
        "[{}] ✅ 订单 {} 充值成功，入账 {:.2} 元",
        channel_name_zh,
        out_trade_no,
        amount
    );
    Ok(true) // 处理成功，返回 true
}

async fn complete_hyperbc_payment(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
) -> AppResult<bool> {
    complete_recharge_payment_common(state, out_trade_no, amount, user_id, "hyperbc", "HyperBC")
        .await
}

/// 封装通联支付成功逻辑：更新订单、加用户余额并记录明细（利用数据库行锁与 status='pending' 确保严格的全局幂等性）
async fn complete_allinpay_payment(
    state: &Arc<AppState>,
    out_trade_no: &str,
    amount: f64,
    user_id: &str,
    payment_method: &str,
) -> AppResult<bool> {
    let channel_name = if payment_method == "allinpay_wechat" {
        "通联微信"
    } else {
        "通联支付宝"
    };
    complete_recharge_payment_common(
        state,
        out_trade_no,
        amount,
        user_id,
        payment_method,
        channel_name,
    )
    .await
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
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ? AND user_id = ?"),
    )
    .bind(&out_trade_no)
    .bind(&claims.sub)
    .fetch_optional(&state.db.pool)
    .await?;

    if let Some(mut order) = order {
        // 如果订单是待支付，且支付方式是 HyperBC，我们尝试主动查询最新的支付状态以防回调延迟或在本地开发环境中丢失
        if order.status == "pending" && order.payment_method == "hyperbc" {
            if let Some(ref hyperbc_order_no) = order.trade_no {
                // 读取 HyperBC 配置
                let hyperbc_setting: Option<String> = sqlx::query_scalar(
                    &state
                        .db
                        .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
                )
                .fetch_optional(&state.db.pool)
                .await?;
                if let Some(setting_str) = hyperbc_setting {
                    if let Ok(config) =
                        serde_json::from_str::<crate::models::PaymentHyperbcSettings>(&setting_str)
                    {
                        if config.enabled {
                            let hyperbc_client = HyperbcClient::new(config);
                            // 事务外调用第三方 API，确保不长期锁定数据库连接与行锁
                            match hyperbc_client.query_order(hyperbc_order_no).await {
                                Ok(query_data) => {
                                    tracing::info!("[支付状态查询] HyperBC 订单 {} 查询状态为: status={}, check_status={:?}", out_trade_no, query_data.status, query_data.check_status);
                                    // status=1(已完成) 和 status=5(超额支付) 视为支付成功
                                    // check_status 默认 0 正常，如果有异常则不自动入账
                                    let check_ok = query_data.check_status.unwrap_or(0) == 0;
                                    if (query_data.status == 1 || query_data.status == 5)
                                        && check_ok
                                    {
                                        match complete_hyperbc_payment(
                                            &state,
                                            &out_trade_no,
                                            order.amount,
                                            &order.user_id,
                                        )
                                        .await
                                        {
                                            Ok(_) => {
                                                order.status = "paid".to_string();
                                            }
                                            Err(e) => {
                                                tracing::error!(
                                                    "[支付状态查询] 自动入账失败: {:?}",
                                                    e
                                                );
                                            }
                                        }
                                    } else if query_data.status == 10 {
                                        // 订单已取消
                                        let _ = sqlx::query(&state.db.format_query("UPDATE orders SET status = 'cancelled' WHERE out_trade_no = ? AND status = 'pending'"))
                                            .bind(&out_trade_no)
                                            .execute(&state.db.pool)
                                            .await;
                                        order.status = "cancelled".to_string();
                                    }
                                }
                                Err(e) => {
                                    tracing::error!(
                                        "[支付状态查询] 主动查询 HyperBC 订单 {} 失败: {:?}",
                                        out_trade_no,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        } else if order.status == "pending"
            && (order.payment_method == "allinpay_wechat"
                || order.payment_method == "allinpay_alipay")
        {
            // 读取通联配置并进行主动查询，防止前台关闭或回调延迟导致状态不同步
            let allinpay_setting: Option<String> = sqlx::query_scalar(
                &state
                    .db
                    .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
            )
            .fetch_optional(&state.db.pool)
            .await?;
            if let Some(setting_str) = allinpay_setting {
                if let Ok(config) =
                    serde_json::from_str::<crate::models::PaymentAllinpaySettings>(&setting_str)
                {
                    if config.enabled {
                        let allinpay_client = AllinpayClient::new(config);
                        match allinpay_client.query_order(&order.out_trade_no).await {
                            Ok(query_data) => {
                                tracing::info!("[支付状态查询] 通联订单 {} 查询状态为: retcode={}, trxstatus={:?}", out_trade_no, query_data.retcode, query_data.trxstatus);
                                // trxstatus 0000 交易成功，此时利用 complete_allinpay_payment 悲观锁事务安全入账
                                if query_data.retcode == "SUCCESS"
                                    && query_data.trxstatus.as_deref() == Some("0000")
                                {
                                    match complete_allinpay_payment(
                                        &state,
                                        &out_trade_no,
                                        order.amount,
                                        &order.user_id,
                                        &order.payment_method,
                                    )
                                    .await
                                    {
                                        Ok(_) => {
                                            order.status = "paid".to_string();
                                        }
                                        Err(e) => {
                                            tracing::error!(
                                                "[支付状态查询] 通联自动入账失败: {:?}",
                                                e
                                            );
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!(
                                    "[支付状态查询] 主动查询通联订单 {} 失败: {:?}",
                                    out_trade_no,
                                    e
                                );
                            }
                        }
                    }
                }
            }
        }
        Ok(Json(OrderStatusResp {
            status: order.status,
        }))
    } else {
        Err(AppError::NotFound("订单不存在或无权访问".into()))
    }
}

// ================= Notifications =================

pub async fn wechat_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
    use crate::models::PaymentWechatSettings;
    use axum::http::StatusCode;

    tracing::info!("[微信回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[微信回调] 原始数据: {}", body);

    let resp_success = serde_json::json!({ "code": "SUCCESS", "message": "成功" });
    let resp_fail = serde_json::json!({ "code": "FAIL", "message": "失败" });

    // 1. 读取配置
    let wechat_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_wechat'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[微信回调] 读取配置失败: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(resp_fail));
        }
    };

    let config =
        match serde_json::from_str::<PaymentWechatSettings>(&wechat_setting.unwrap_or_default()) {
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

    tracing::info!(
        "[微信回调] trade_state: {}, out_trade_no: {}, transaction_id: {}",
        trade_state,
        out_trade_no,
        trade_no
    );

    if trade_state != "SUCCESS" {
        tracing::info!("[微信回调] 交易状态非SUCCESS: {}", trade_state);
        return (StatusCode::OK, Json(resp_success));
    }

    // 4. 前置检查：事务外查询，避免不必要的事务开销
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
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
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存微信支付交易流水号
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

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

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
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

    tracing::info!(
        "[微信回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元",
        out_trade_no,
        order.user_id,
        amount
    );

    (StatusCode::OK, Json(resp_success))
}

pub async fn alipay_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
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

    tracing::info!(
        "[支付宝回调] trade_status: {}, out_trade_no: {}, trade_no: {}",
        trade_status,
        out_trade_no,
        trade_no
    );

    if trade_status != "TRADE_SUCCESS" && trade_status != "TRADE_FINISHED" {
        tracing::info!("[支付宝回调] 非成功状态，忽略: {}", trade_status);
        return "success".to_string();
    }

    let alipay_setting: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_alipay'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or_default();

    let config = match serde_json::from_str::<crate::models::PaymentAlipaySettings>(
        &alipay_setting.unwrap_or_default(),
    ) {
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
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(&out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

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
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存支付宝交易流水号
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

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

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
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

    tracing::info!(
        "[支付宝回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2} 元",
        out_trade_no,
        order.user_id,
        amount
    );

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
    let stripe_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_stripe'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[Stripe回调] 读取配置失败: {:?}", e);
            return resp_fail;
        }
    };

    let config = match serde_json::from_str::<crate::models::PaymentStripeSettings>(
        &stripe_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[Stripe回调] 解析配置失败: {:?}", e);
            return resp_fail;
        }
    };

    // 2. 验证 Webhook 签名
    let sig_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
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

    tracing::info!(
        "[Stripe回调] payment_status: {}, out_trade_no: {}, session_id: {}",
        payment_status,
        out_trade_no,
        stripe_session_id
    );

    if payment_status != "paid" {
        tracing::info!("[Stripe回调] payment_status 非 paid: {}", payment_status);
        return resp_ok;
    }

    // 4. 前置检查
    let order: Option<Order> = sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    .unwrap_or(None);

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
    // 数据库更新操作字段说明：
    // - status: 订单状态更新为 'paid' 表示支付成功
    // - trade_no: 保存 Stripe 的 session id，用以对账
    // - paid_at: 记录实际支付完成的时间（TIMESTAMPTZ）
    let now = DbTs::now();

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

    if let Err(e) = sqlx::query(
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
    )
    .bind(amount)
    .bind(&order.user_id)
    .execute(&mut *tx)
    .await
    {
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

    tracing::info!(
        "[Stripe回调] ✅ 订单 {} 处理完成, 用户 {} 充值 {:.2}",
        out_trade_no,
        order.user_id,
        amount
    );

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

    tracing::info!(
        "[BonusPay回调] Partner-Id: {}, Sign长度: {}",
        partner_id,
        sign.len()
    );

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
    let bonuspay_setting: Option<String> = sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_bonuspay'"),
    )
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
        tracing::warn!(
            "[BonusPay回调] ⚠️ 严重警告：未配置 BonusPay 公钥，跳过签名验证，存在极高安全风险！"
        );
    }

    // customerId 就是系统内的用户 ID
    let user_id = customer_id;

    // 检查用户是否存在
    let user_exists: Option<String> =
        sqlx::query_scalar(&state.db.format_query("SELECT id FROM users WHERE id = ?"))
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
        &state
            .db
            .format_query("SELECT trade_no FROM orders WHERE trade_no = ?"),
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

    let now = DbTs::now();

    tracing::info!(
        "[BonusPay回调] 货币转换: {} {} * {} (汇率) = {:.6} 系统货币",
        settled_amount,
        settled_currency,
        exchange_rate,
        amount
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
    // 数据库写入操作字段说明：
    // - out_trade_no: 系统内唯一交易流水号，格式 BP前缀加外部订单号
    // - user_id: 关联充值发起者的用户主键ID
    // - payment_method: 支付通道类型，此处固定为 'bonuspay'
    // - amount: 充值金额，折算为系统货币
    // - status: 订单处理进度状态，初始化为 'paid'
    // - trade_no: 第三方交易订单号
    // - created_at / paid_at: TIMESTAMPTZ
    let out_trade_no = format!("BP{}", order_no);
    if let Err(e) = sqlx::query(&state.db.format_query(
        "INSERT INTO orders (out_trade_no, user_id, payment_method, amount, status, trade_no, created_at, paid_at) VALUES (?, ?, 'bonuspay', ?, 'paid', ?, ?, ?)",
    ))
    .bind(&out_trade_no)
    .bind(user_id)
    .bind(amount)
    .bind(order_no)
    .bind(&now)
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
        &state
            .db
            .format_query("UPDATE users SET balance = balance + ? WHERE id = ?"),
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
        user_id,
        amount,
        settled_currency,
        tx_hash
    );

    "SUCCESS".to_string()
}

/// HyperBC 支付异步回调通知处理函数
/// 收到来自 HyperBC 的 POST 请求，对 body 签名进行平台公钥验签，然后对对应订单状态进行更新，并入账用户余额
pub async fn hyperbc_notify(State(state): State<Arc<AppState>>, body: String) -> impl IntoResponse {
    tracing::info!("[HyperBC回调] 收到回调通知, body长度: {}", body.len());
    tracing::debug!("[HyperBC回调] 原始数据: {}", body);

    // 1. 解析回调 JSON 报文
    let body_val: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[HyperBC回调] JSON 解析失败: {:?}", e);
            return "fail".into_response();
        }
    };

    // 2. 提取并移出 sign 签名参数，供后续验签
    let sign = match body_val.get("sign").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => {
            tracing::error!("[HyperBC回调] 回调报文中缺少签名字段 sign");
            return "fail".into_response();
        }
    };

    // 构造平铺的待签名数据：若包含 data 节点且为 Object，则直接将 data 节点的属性拉平到最外层进行验签
    let flat_body_val = if let Some(data_obj) = body_val.get("data").and_then(|d| d.as_object()) {
        serde_json::Value::Object(data_obj.clone())
    } else {
        body_val.clone()
    };

    // 3. 加载数据库配置进行验签
    let hyperbc_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_hyperbc'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("[HyperBC回调] 查询数据库配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let config: crate::models::PaymentHyperbcSettings =
        match serde_json::from_str(&hyperbc_setting.unwrap_or_default()) {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("[HyperBC回调] 解析 HyperBC 配置失败: {:?}", e);
                return "fail".into_response();
            }
        };

    if !config.hyperbc_public_key.is_empty() {
        let client = HyperbcClient::new(config.clone());
        let sign_content = HyperbcClient::get_sign_content(&flat_body_val);
        // 打印公钥配置摘要，方便确认配置是否正确
        let pubkey_preview = config
            .hyperbc_public_key
            .trim()
            .chars()
            .take(60)
            .collect::<String>();
        tracing::info!("[HyperBC回调] 使用公钥(前60字符): {}...", pubkey_preview);
        tracing::info!("[HyperBC回调] 待验证签名: {}", sign);
        tracing::info!("[HyperBC回调] 计算生成的待签名串: {}", sign_content);

        match client.verify_signature(&flat_body_val, &sign) {
            Ok(true) => {
                tracing::info!("[HyperBC回调] RSA 签名验证通过");
            }
            Ok(false) => {
                tracing::error!("[HyperBC回调] RSA 签名验证失败，签名不匹配");
                return "fail".into_response();
            }
            Err(e) => {
                tracing::error!("[HyperBC回调] 签名验证异常: {:?}", e);
                return "fail".into_response();
            }
        }
    } else {
        tracing::warn!("[HyperBC回调] ⚠️ 未配置 HyperBC 公钥，跳过签名验证，存在安全风险！");
    }

    // 4. 解析业务 data 节点
    let data = match body_val.get("data") {
        Some(d) => d,
        None => {
            tracing::error!("[HyperBC回调] 回调报文中缺少 data 数据节点");
            return "fail".into_response();
        }
    };

    let merchant_order_id = match data.get("merchant_order_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => {
            tracing::error!("[HyperBC回调] data 节点中缺少 merchant_order_id");
            return "fail".into_response();
        }
    };

    let status = match data.get("status").and_then(|v| v.as_i64()) {
        Some(s) => s,
        None => {
            tracing::error!("[HyperBC回调] data 节点中缺少 status 状态");
            return "fail".into_response();
        }
    };

    tracing::info!(
        "[HyperBC回调] 订单号: {}, status: {}",
        merchant_order_id,
        status
    );

    // status = 10 表示已取消
    if status == 10 {
        // 数据库更新操作字段说明：
        // - status: 订单处理状态，更新为 'cancelled' 表示已取消
        // 限制条件：仅在订单原状态为 'pending' 时才能取消，且订单 out_trade_no 需匹配
        let _ = sqlx::query(&state.db.format_query(
            "UPDATE orders SET status = 'cancelled' WHERE out_trade_no = ? AND status = 'pending'",
        ))
        .bind(merchant_order_id)
        .execute(&state.db.pool)
        .await;
        return "success".into_response();
    }

    // status=1(已完成) 和 status=5(超额支付) 视为支付成功
    if status != 1 && status != 5 {
        tracing::info!(
            "[HyperBC回调] status 不是成功或超额支付状态 (status={})，忽略",
            status
        );
        return "success".into_response();
    }

    // 校验 payments 中的异常代码 (check_code: 0 正常，1001 金额不匹配，1002 重复支付)
    if let Some(payments) = data.get("payments").and_then(|v| v.as_array()) {
        for payment in payments {
            let check_code = payment
                .get("check_code")
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .unwrap_or(0);
            if check_code != 0 {
                tracing::warn!(
                    "[HyperBC回调] 支付异常 check_code={}，不自动入账，需人工复核: {}",
                    check_code,
                    merchant_order_id
                );
                return "success".into_response();
            }
        }
    }

    // 查询订单信息以提取入账金额和用户ID
    let order: Option<Order> = match sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(merchant_order_id)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(o) => o,
        Err(e) => {
            tracing::error!("[HyperBC回调] 查询订单失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let order = match order {
        Some(o) => o,
        None => {
            tracing::error!("[HyperBC回调] 订单不存在: {}", merchant_order_id);
            return "fail".into_response();
        }
    };

    // 幂等防护：如果订单状态已经是 paid (已支付)，直接返回 success 避免重复入账
    if order.status == "paid" {
        tracing::info!(
            "[HyperBC回调] 订单已是支付状态，幂等跳过, out_trade_no: {}",
            merchant_order_id
        );
        return "success".into_response();
    }

    // 调用公用入账函数进行状态更新与余额充值，保证业务逻辑的高内聚和 100% 严格防并发防重入
    match complete_hyperbc_payment(&state, merchant_order_id, order.amount, &order.user_id).await {
        Ok(_) => "success".into_response(),
        Err(e) => {
            tracing::error!("[HyperBC回调] 处理订单支付更新失败: {:?}", e);
            "fail".into_response()
        }
    }
}

/// 通联支付异步回调通知接口
pub async fn allinpay_notify(
    State(state): State<Arc<AppState>>,
    body: String,
) -> impl IntoResponse {
    tracing::info!("[通联回调] 收到回调通知, body长度: {}", body.len());
    tracing::info!("[通联回调] 原始数据: {}", body);

    // 通联发送回调是标准的 form-urlencoded 格式
    let params: BTreeMap<String, String> = form_urlencoded::parse(body.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let sign = params.get("sign").cloned().unwrap_or_default();
    // 统一下单回传：优先 reqsn，兼容 cusorderid（文档定义为对应 reqsn）
    let out_trade_no = params
        .get("reqsn")
        .filter(|s| !s.is_empty())
        .or_else(|| params.get("cusorderid"))
        .cloned()
        .unwrap_or_default();
    let trxstatus = params.get("trxstatus").cloned().unwrap_or_default();

    tracing::info!(
        "[通联回调] trxstatus: {}, reqsn: {}",
        trxstatus,
        out_trade_no
    );

    // 通联定义 "0000" 代表支付成功
    if trxstatus != "0000" {
        tracing::info!("[通联回调] 交易状态未成功，忽略");
        return "success".into_response();
    }

    // 获取配置
    let allinpay_setting: Option<String> = match sqlx::query_scalar(
        &state
            .db
            .format_query("SELECT value FROM settings WHERE key = 'payment_allinpay'"),
    )
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("[通联回调] 读取配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let config = match serde_json::from_str::<crate::models::PaymentAllinpaySettings>(
        &allinpay_setting.unwrap_or_default(),
    ) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("[通联回调] 解析配置失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let client = AllinpayClient::new(config);
    // 利用平台公钥校验回调签名，防止伪造攻击
    match client.verify_signature(&params, &sign) {
        Ok(true) => tracing::info!("[通联回调] 签名验证通过"),
        Ok(false) => {
            tracing::error!("[通联回调] 签名验证失败");
            return "fail".into_response();
        }
        Err(e) => {
            tracing::error!("[通联回调] 签名验证过程中出现异常: {:?}", e);
            return "fail".into_response();
        }
    }

    // 获取原订单以确认支付金额和充值人
    let order: Option<Order> = match sqlx::query_as(
        &state
            .db
            .format_query("SELECT * FROM orders WHERE out_trade_no = ?"),
    )
    .bind(&out_trade_no)
    .fetch_optional(&state.db.pool)
    .await
    {
        Ok(o) => o,
        Err(e) => {
            tracing::error!("[通联回调] 查询订单失败: {:?}", e);
            return "fail".into_response();
        }
    };

    let order = match order {
        Some(o) => o,
        None => {
            tracing::error!("[通联回调] 订单不存在: {}", out_trade_no);
            return "fail".into_response();
        }
    };

    // 幂等防护：订单已支付直接返回成功，防重复充值
    if order.status == "paid" {
        tracing::info!(
            "[通联回调] 订单已是支付状态，幂等跳过, out_trade_no: {}",
            out_trade_no
        );
        return "success".into_response();
    }

    // 事务处理入账
    match complete_allinpay_payment(
        &state,
        &out_trade_no,
        order.amount,
        &order.user_id,
        &order.payment_method,
    )
    .await
    {
        Ok(_) => "success".into_response(),
        Err(e) => {
            tracing::error!("[通联回调] 处理加额更新失败: {:?}", e);
            "fail".into_response()
        }
    }
}
