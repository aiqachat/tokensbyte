/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

use serde::{Deserialize, Serialize};

/// 站点基本信息设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SiteSettings {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub keywords: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub favicon: String,
    #[serde(default)]
    pub logo: String,
    #[serde(default)]
    pub login_title: String,
    #[serde(default)]
    pub login_subtitle: String,
    #[serde(default = "default_enable_multilingual")]
    pub enable_multilingual: bool,
    /// 站点支持的语言列表（语言代码），如 ["zh", "en"]
    #[serde(default = "default_supported_languages")]
    pub supported_languages: Vec<String>,
    /// 站点默认语言
    #[serde(default = "default_language")]
    pub default_language: String,
    /// 站点默认时区
    #[serde(default = "default_site_timezone")]
    pub default_timezone: String,
    /// 是否在前端显示时区后缀
    #[serde(default = "default_show_timezone")]
    pub show_timezone: bool,
    /// 是否允许用户切换亮色/暗色主题（关闭后用户端不显示切换按钮）
    #[serde(default = "default_true_theme")]
    pub enable_theme_toggle: bool,
    /// 站点默认主题："dark" 或 "light"
    #[serde(default = "default_theme_mode")]
    pub default_theme: String,
    /// 版权信息，显示在登录页面底部
    #[serde(default = "default_copyright")]
    pub copyright: String,
    /// 管理后台访问路径，默认 admin1688
    #[serde(default = "default_admin_path")]
    pub admin_path: String,
    /// 登录页风格："split"（左右风格）或 "classic"（经典风格）
    #[serde(default = "default_login_style")]
    pub login_style: String,
    /// 左右风格下的左侧广告语名言
    #[serde(default)]
    pub login_quote: String,
}

fn default_login_style() -> String {
    "split".to_string()
}

fn default_admin_path() -> String {
    "admin1688".to_string()
}

fn default_copyright() -> String {
    "© 2026 Tokensbyte. All rights reserved.".to_string()
}

fn default_true_theme() -> bool {
    true
}

fn default_theme_mode() -> String {
    "dark".to_string()
}

fn default_enable_multilingual() -> bool {
    true
}

fn default_supported_languages() -> Vec<String> {
    vec!["zh".to_string(), "en".to_string()]
}

fn default_language() -> String {
    "zh".to_string()
}

fn default_site_timezone() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "Asia/Shanghai".to_string())
}

fn default_show_timezone() -> bool {
    true
}

/// 站点协议设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AgreementSettings {
    #[serde(default = "default_agreement_mode")]
    pub tos_mode: String, // "text" or "link"
    #[serde(default = "default_agreement_mode")]
    pub tos_mode_en: String,
    #[serde(default)]
    pub tos_content: String,
    #[serde(default)]
    pub tos_content_en: String,
    #[serde(default)]
    pub tos_link: String,
    #[serde(default)]
    pub tos_link_en: String,
    #[serde(default = "default_agreement_mode")]
    pub privacy_mode: String, // "text" or "link"
    #[serde(default = "default_agreement_mode")]
    pub privacy_mode_en: String,
    #[serde(default)]
    pub privacy_content: String,
    #[serde(default)]
    pub privacy_content_en: String,
    #[serde(default)]
    pub privacy_link: String,
    #[serde(default)]
    pub privacy_link_en: String,
    #[serde(default)]
    pub tos_enabled: bool,
    #[serde(default)]
    pub privacy_enabled: bool,
}

fn default_agreement_mode() -> String {
    "link".to_string()
}

/// 辅助货币设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuxiliaryCurrency {
    #[serde(default)]
    pub code: String, // e.g., "USD"
    #[serde(default)]
    pub symbol: String, // e.g., "$"
    #[serde(default)]
    pub exchange_rate: f64, // e.g., if default is CNY and this is USD, rate could be 0.14
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// 货币设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CurrencySettings {
    #[serde(default)]
    pub default_currency: String,
    #[serde(default)]
    pub currency_symbol: String,
    #[serde(default)]
    pub currency_unit: String,
    #[serde(default)]
    pub token_ratio: f64,
    #[serde(default)]
    pub auxiliary_currencies: Vec<AuxiliaryCurrency>,
    #[serde(default = "default_quick_amounts")]
    pub quick_amounts: Vec<f64>,
    #[serde(default = "default_min_recharge_amount")]
    pub min_recharge_amount: f64,
}

fn default_quick_amounts() -> Vec<f64> {
    vec![20.0, 50.0, 100.0, 500.0, 1000.0, 5000.0]
}

fn default_min_recharge_amount() -> f64 {
    5.0
}

/// 登录方式设置 — 控制用户端可用的登录方式
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct LoginSettings {
    #[serde(default = "default_true")]
    pub enable_username_login: bool,
    #[serde(default)]
    pub enable_mobile_login: bool,
    #[serde(default)]
    pub enable_email_login: bool,
    #[serde(default)]
    pub enable_wechat_login: bool,
    #[serde(default)]
    pub enable_google_login: bool,
}

/// 注册方式设置 — 控制用户端可用的注册方式及安全策略
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RegistrationSettings {
    #[serde(default)]
    pub enable_username_registration: bool,
    #[serde(default)]
    pub enable_email_registration: bool,
    #[serde(default)]
    pub enable_mobile_registration: bool,
    #[serde(default)]
    pub enable_password_recovery: bool,
    /// IP 防刷：开启后限制同 IP 每日注册次数
    #[serde(default)]
    pub ip_rate_limit_enabled: bool,
    /// 同 IP 每日最多注册数
    #[serde(default = "default_ip_daily_limit")]
    pub ip_daily_limit: i32,
    /// 邮箱防刷：开启后 @ 前仅允许数字+字母+"_"，长度≤25
    #[serde(default)]
    pub email_validation_strict: bool,
    /// 邮箱白名单：开启后仅允许指定域名邮箱注册
    #[serde(default)]
    pub email_whitelist_enabled: bool,
    /// 允许的邮箱域名列表
    #[serde(default = "default_email_whitelist")]
    pub email_whitelist: Vec<String>,
}

fn default_true() -> bool {
    true
}

fn default_ip_daily_limit() -> i32 {
    6
}

fn default_email_whitelist() -> Vec<String> {
    vec![
        "qq.com".to_string(),
        "163.com".to_string(),
        "outlook.com".to_string(),
        "aliyun.com".to_string(),
        "foxmail.com".to_string(),
    ]
}

/// SMTP 邮箱通知设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SMTPSettings {
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub from_address: String,
    #[serde(default)]
    pub from_name: String,
}

/// 腾讯云短信通知设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SmsSettings {
    /// 腾讯云 SecretId
    #[serde(default)]
    pub secret_id: String,
    /// 腾讯云 SecretKey
    #[serde(default)]
    pub secret_key: String,
    /// 短信应用 SDK AppID
    #[serde(default)]
    pub sdk_app_id: String,
    /// 已审核的短信签名
    #[serde(default)]
    pub sign_name: String,
    /// 验证码模板 ID
    #[serde(default)]
    pub template_id: String,
    /// 余额不足提醒模板 ID（模板参数建议：{1}=当前余额 {2}=阈值）
    #[serde(default)]
    pub balance_template_id: String,
}

/// 营销设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MarketingSettings {
    #[serde(default)]
    pub enable_registration_gift: bool,
    /// 是否开启用户端兑换码功能
    #[serde(default)]
    pub enable_redemption: bool,
    #[serde(default = "default_gift_mode")]
    pub gift_mode: String, // "fixed" or "random"
    #[serde(default)]
    pub fixed_amount: f64,
    #[serde(default)]
    pub min_amount: f64,
    #[serde(default)]
    pub max_amount: f64,
}

fn default_gift_mode() -> String {
    "fixed".to_string()
}

/// 数据库连接设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DatabaseSettings {
    #[serde(default)]
    pub db_type: String, // "postgres"
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub database: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub ssl_mode: bool,
}

/// 微信支付设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentWechatSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub mchid: String,
    #[serde(default)]
    pub appid: String,
    #[serde(default)]
    pub api_v3_key: String,
    #[serde(default)]
    pub cert_serial_no: String,
    #[serde(default)]
    pub private_key: String,
}

/// 支付宝设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentAlipaySettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub app_id: String,
    #[serde(default)]
    pub private_key: String,
    #[serde(default)]
    pub alipay_public_key: String,
    #[serde(default = "default_sign_type")]
    pub sign_type: String,
}

fn default_sign_type() -> String {
    "RSA2".to_string()
}

/// Stripe 支付设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentStripeSettings {
    #[serde(default)]
    pub enabled: bool,
    /// Stripe Secret Key (sk_live_xxx 或 sk_test_xxx)
    #[serde(default)]
    pub secret_key: String,
    /// Stripe Publishable Key (pk_live_xxx 或 pk_test_xxx)
    #[serde(default)]
    pub publishable_key: String,
    /// Stripe Webhook Signing Secret (whsec_xxx)
    #[serde(default)]
    pub webhook_secret: String,
}

/// BonusPay 加密货币支付设置
/// 基于 https://docs.bonuspay.network 文档
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentBonuspaySettings {
    #[serde(default)]
    pub enabled: bool,
    /// BonusPay 商户 Partner-Id (如 200000000888)
    #[serde(default)]
    pub partner_id: String,
    /// 商户 RSA 私钥 (PKCS#8 PEM 格式，用于请求签名)
    #[serde(default)]
    pub merchant_private_key: String,
    /// BonusPay RSA 公钥 (PEM 格式，用于验证回调签名)
    #[serde(default)]
    pub bonuspay_public_key: String,
    /// API 接口地址
    #[serde(default = "default_bonuspay_api_url")]
    pub api_url: String,
    /// USDT/USDC 兑换系统货币(如CNY)的汇率
    #[serde(default = "default_crypto_exchange_rate")]
    pub crypto_exchange_rate: f64,
}

fn default_crypto_exchange_rate() -> f64 {
    1.0
}

fn default_bonuspay_api_url() -> String {
    "https://api.bonuspay.network".to_string()
}

/// HyperBC 加密货币支付设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentHyperbcSettings {
    #[serde(default)]
    pub enabled: bool,
    /// CipherBC 分配的 APP_ID
    #[serde(default)]
    pub app_id: String,
    /// 商户 RSA 私钥 (PEM 格式，用于请求签名)
    #[serde(default)]
    pub merchant_private_key: String,
    /// CipherBC 平台 RSA 公钥 (PEM 格式，用于验证回调签名)
    #[serde(default)]
    pub hyperbc_public_key: String,
    /// API 接口地址
    #[serde(default = "default_hyperbc_api_url")]
    pub api_url: String,
    /// USDT/加密货币 兑换系统货币的汇率
    #[serde(default = "default_crypto_exchange_rate")]
    pub crypto_exchange_rate: f64,
}

fn default_hyperbc_api_url() -> String {
    "https://api.hyperbc.com".to_string()
}

/// 通联支付设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PaymentAllinpaySettings {
    /// 是否启用通联支付方式
    #[serde(default)]
    pub enabled: bool,
    /// 实际交易商户号 (cusid)
    #[serde(default)]
    pub cusid: String,
    /// 平台分配的应用ID (appid)
    #[serde(default)]
    pub appid: String,
    /// 商户 RSA 私钥 (PKCS#1 Base64/PEM，对应通联「RSA公钥」栏位上传的商户公钥)
    #[serde(default)]
    pub merchant_private_key: String,
    /// 通联平台 RSA 公钥 (PEM，填商服「通联RSA公钥」，用于回调/查询验签)
    #[serde(default)]
    pub allinpay_public_key: String,
    /// 签名类型固定为 RSA（SHA1WithRSA）；保留字段以兼容已存配置
    #[serde(default = "default_allinpay_sign_type")]
    pub sign_type: String,
    /// 接口网关地址
    #[serde(default = "default_allinpay_api_url")]
    pub api_url: String,
    /// 统一支付业务接口协议版本
    #[serde(default = "default_allinpay_version")]
    pub version: String,
}

fn default_allinpay_api_url() -> String {
    "https://vsp.allinpay.com/apiweb".to_string()
}

fn default_allinpay_version() -> String {
    "11".to_string()
}

fn default_allinpay_sign_type() -> String {
    "RSA".to_string()
}

/// 谷歌 OAuth 2.0 设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GoogleOAuthSettings {
    /// Google OAuth Client ID
    #[serde(default)]
    pub client_id: String,
    /// Google OAuth Client Secret
    #[serde(default)]
    pub client_secret: String,
}

/// 微信开放平台授权登录设置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WechatOAuthSettings {
    /// 网站应用 AppId
    #[serde(default)]
    pub app_id: String,
    /// 网站应用密钥 AppSecret
    #[serde(default)]
    pub app_secret: String,
}

/// 存储配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageSettings {
    #[serde(default)]
    pub tos_access_key: String,
    #[serde(default)]
    pub tos_secret_key: String,
    #[serde(default)]
    pub tos_endpoint: String,
    #[serde(default)]
    pub tos_region: String,
    #[serde(default)]
    pub tos_bucket: String,
    #[serde(default)]
    pub tos_path_prefix: String,
    #[serde(default)]
    pub tos_custom_domain: String,
    /// 使用日志详情保留天数，超期自动清理请求/响应内容，0=永不清理
    #[serde(default = "default_log_retention_days")]
    pub log_retention_days: i32,
    /// 使用日志行保留天数：超期行迁入 logs_archive 并从热表删除；0=永不归档（默认）
    /// 建议 ≥ 详情保留天数，且先确保 usage_daily_stats 已覆盖对应日期。
    #[serde(default = "default_log_row_retention_days")]
    pub log_row_retention_days: i32,
}

impl Default for StorageSettings {
    fn default() -> Self {
        Self {
            tos_access_key: String::new(),
            tos_secret_key: String::new(),
            tos_endpoint: String::new(),
            tos_region: String::new(),
            tos_bucket: String::new(),
            tos_path_prefix: String::new(),
            tos_custom_domain: String::new(),
            log_retention_days: default_log_retention_days(),
            log_row_retention_days: default_log_row_retention_days(),
        }
    }
}

fn default_log_retention_days() -> i32 {
    30
}

fn default_log_row_retention_days() -> i32 {
    0
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MenuItemConfig {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub label_zh: String,
    #[serde(default)]
    pub label_en: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default = "default_all_levels")]
    pub allowed_levels: String,
}

fn default_all_levels() -> String {
    "all".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MenuConfigSettings {
    #[serde(default)]
    pub items: Vec<MenuItemConfig>,
}

/// 提示通知设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotificationSettings {
    #[serde(default)]
    pub site_notification_enabled: bool,
    /// 是否向用户开放短信余额提醒订阅
    #[serde(default)]
    pub sms_balance_notification: bool,
    /// 是否向用户开放邮件余额提醒订阅
    #[serde(default)]
    pub email_balance_notification: bool,
    /// 是否向用户开放站内 Web 通知订阅
    #[serde(default = "default_true_notif")]
    pub web_notification_enabled: bool,
    /// 是否向用户开放浏览器 Push 订阅
    #[serde(default = "default_true_notif")]
    pub push_notification_enabled: bool,
    /// 是否向用户开放勿扰模式
    #[serde(default = "default_true_notif")]
    pub do_not_disturb_enabled: bool,
    #[serde(default = "default_low_balance_threshold")]
    pub low_balance_threshold: f64,
    /// 余额不足提醒邮件主题（支持 {{site_name}} {{balance}} {{threshold}}）
    #[serde(default = "default_low_balance_email_subject")]
    pub low_balance_email_subject: String,
    /// 余额不足提醒邮件 HTML 正文（支持 {{site_name}} {{balance}} {{threshold}}）
    #[serde(default = "default_low_balance_email_html")]
    pub low_balance_email_html: String,
}

fn default_true_notif() -> bool {
    true
}

fn default_low_balance_threshold() -> f64 {
    100.0
}

pub fn default_low_balance_email_subject() -> String {
    "【{{site_name}}】账户余额不足提醒".to_string()
}

pub fn default_low_balance_email_html() -> String {
    r#"<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e8e8e8; border-radius: 8px;">
  <div style="padding: 30px;">
    <h2 style="color: #fa8c16; margin: 0 0 24px 0; font-size: 22px; font-weight: 600;">余额不足提醒</h2>
    <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">您好！</p>
    <p style="color: #333; font-size: 16px; margin: 0 0 24px 0;">您的账户可用余额已低于设定阈值，请及时充值以免影响服务使用。</p>
    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 6px; margin-bottom: 24px;">
      <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">当前余额：<strong style="color: #fa541c; font-size: 18px;">{{balance}}</strong></p>
      <p style="color: #666; font-size: 14px; margin: 0;">提醒阈值：<strong>{{threshold}}</strong></p>
    </div>
    <div style="border-top: 1px dashed #e8e8e8; margin-top: 24px; padding-top: 16px;">
      <p style="color: #999; font-size: 12px; margin: 0;">此邮件由 {{site_name}} 系统根据您的通知订阅设置自动发送。</p>
    </div>
  </div>
</div>"#
    .to_string()
}

/// 渲染余额提醒模版变量
pub fn render_low_balance_template(
    template: &str,
    site_name: &str,
    balance: &str,
    threshold: &str,
) -> String {
    template
        .replace("{{site_name}}", site_name)
        .replace("{{balance}}", balance)
        .replace("{{threshold}}", threshold)
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            site_notification_enabled: false,
            sms_balance_notification: false,
            email_balance_notification: false,
            web_notification_enabled: true,
            push_notification_enabled: true,
            do_not_disturb_enabled: true,
            low_balance_threshold: 100.0,
            low_balance_email_subject: default_low_balance_email_subject(),
            low_balance_email_html: default_low_balance_email_html(),
        }
    }
}

/// 聚合所有设置（读取）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AllSettings {
    #[serde(default)]
    pub site: SiteSettings,
    #[serde(default)]
    pub currency: CurrencySettings,
    #[serde(default)]
    pub login: LoginSettings,
    #[serde(default)]
    pub registration: RegistrationSettings,
    #[serde(default)]
    pub smtp: SMTPSettings,
    #[serde(default)]
    pub sms: Option<SmsSettings>,
    #[serde(default)]
    pub marketing: MarketingSettings,
    #[serde(default)]
    pub database: DatabaseSettings,
    #[serde(default)]
    pub payment_wechat: Option<PaymentWechatSettings>,
    #[serde(default)]
    pub payment_alipay: Option<PaymentAlipaySettings>,
    #[serde(default)]
    pub payment_stripe: Option<PaymentStripeSettings>,
    #[serde(default)]
    pub payment_bonuspay: Option<PaymentBonuspaySettings>,
    #[serde(default)]
    pub payment_hyperbc: Option<PaymentHyperbcSettings>,
    #[serde(default)]
    pub payment_allinpay: Option<PaymentAllinpaySettings>,
    #[serde(default)]
    pub google_oauth: Option<GoogleOAuthSettings>,
    #[serde(default)]
    pub wechat_oauth: Option<WechatOAuthSettings>,
    #[serde(default)]
    pub agreement: AgreementSettings,
    #[serde(default)]
    pub storage: Option<StorageSettings>,
    #[serde(default)]
    pub menu_config: Option<MenuConfigSettings>,
    #[serde(default)]
    pub notification: NotificationSettings,
    #[serde(default, skip_deserializing)]
    pub server_timezone: Option<String>,
    #[serde(default, skip_deserializing)]
    pub server_time: Option<String>,
}

/// 更新设置请求（写入）
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    #[serde(default)]
    pub site: Option<serde_json::Value>,
    #[serde(default)]
    pub currency: Option<serde_json::Value>,
    #[serde(default)]
    pub login: Option<serde_json::Value>,
    #[serde(default)]
    pub registration: Option<serde_json::Value>,
    #[serde(default)]
    pub smtp: Option<serde_json::Value>,
    #[serde(default)]
    pub sms: Option<serde_json::Value>,
    #[serde(default)]
    pub marketing: Option<serde_json::Value>,
    #[serde(default)]
    pub database: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_wechat: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_alipay: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_stripe: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_bonuspay: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_hyperbc: Option<serde_json::Value>,
    #[serde(default)]
    pub payment_allinpay: Option<serde_json::Value>,
    #[serde(default)]
    pub google_oauth: Option<serde_json::Value>,
    #[serde(default)]
    pub wechat_oauth: Option<serde_json::Value>,
    #[serde(default)]
    pub agreement: Option<serde_json::Value>,
    #[serde(default)]
    pub storage: Option<serde_json::Value>,
    #[serde(default)]
    pub menu_config: Option<serde_json::Value>,
    #[serde(default)]
    pub notification: Option<serde_json::Value>,
}

// ════════════════════════════════════════════════════════════════════════════
// 【安全原则】公开接口返回的数据结构
//
// 以下 PublicSettings 系列结构体用于无需认证的公开接口返回值。
// 系统安全原则：隐私数据（密钥、密码、Secret、数据库信息等）绝不暴露到公开接口。
// 新增设置字段时，须评估是否属于公开数据。如为隐私数据，仅添加到 AllSettings，
// 不得添加到 PublicSettings。此原则必须被所有开发者（包括 AI）严格遵守。
// ════════════════════════════════════════════════════════════════════════════

/// 公开注册设置 — 仅暴露注册方式开关，隐藏 IP 限制、邮箱白名单等安全策略
#[derive(Debug, Serialize, Clone)]
pub struct PublicRegistrationSettings {
    #[serde(default)]
    pub enable_username_registration: bool,
    #[serde(default)]
    pub enable_email_registration: bool,
    #[serde(default)]
    pub enable_mobile_registration: bool,
    #[serde(default)]
    pub enable_password_recovery: bool,
}

impl From<&RegistrationSettings> for PublicRegistrationSettings {
    fn from(r: &RegistrationSettings) -> Self {
        Self {
            enable_username_registration: r.enable_username_registration,
            enable_email_registration: r.enable_email_registration,
            enable_mobile_registration: r.enable_mobile_registration,
            enable_password_recovery: r.enable_password_recovery,
        }
    }
}

/// 公开营销设置 — 仅暴露注册赠送 / 兑换开关，隐藏具体金额配置
#[derive(Debug, Serialize, Clone)]
pub struct PublicMarketingSettings {
    #[serde(default)]
    pub enable_registration_gift: bool,
    #[serde(default)]
    pub enable_redemption: bool,
}

impl From<&MarketingSettings> for PublicMarketingSettings {
    fn from(m: &MarketingSettings) -> Self {
        Self {
            enable_registration_gift: m.enable_registration_gift,
            enable_redemption: m.enable_redemption,
        }
    }
}

/// 公开支付状态 — 仅暴露各支付渠道的启用开关，不含任何密钥/密码/私钥
#[derive(Debug, Serialize, Clone)]
pub struct PublicPaymentStatus {
    #[serde(default)]
    pub wechat_enabled: bool,
    #[serde(default)]
    pub alipay_enabled: bool,
    #[serde(default)]
    pub stripe_enabled: bool,
    #[serde(default)]
    pub bonuspay_enabled: bool,
    #[serde(default)]
    pub hyperbc_enabled: bool,
    pub allinpay_enabled: bool,
}

/// 公开通知设置
#[derive(Debug, Serialize, Clone)]
pub struct PublicNotificationSettings {
    #[serde(default)]
    pub site_notification_enabled: bool,
    #[serde(default)]
    pub sms_balance_notification: bool,
    #[serde(default)]
    pub email_balance_notification: bool,
    #[serde(default)]
    pub web_notification_enabled: bool,
    #[serde(default)]
    pub push_notification_enabled: bool,
    #[serde(default)]
    pub do_not_disturb_enabled: bool,
    #[serde(default)]
    pub low_balance_threshold: f64,
}

impl From<&NotificationSettings> for PublicNotificationSettings {
    fn from(n: &NotificationSettings) -> Self {
        Self {
            site_notification_enabled: n.site_notification_enabled,
            sms_balance_notification: n.sms_balance_notification,
            email_balance_notification: n.email_balance_notification,
            web_notification_enabled: n.web_notification_enabled,
            push_notification_enabled: n.push_notification_enabled,
            do_not_disturb_enabled: n.do_not_disturb_enabled,
            low_balance_threshold: if n.low_balance_threshold > 0.0 {
                n.low_balance_threshold
            } else {
                100.0
            },
        }
    }
}

/// 公开设置聚合 — 仅包含前端 UI 渲染所需的安全数据
///
/// 【安全】不包含任何密钥、密码、Secret、数据库、支付、SMTP、短信、存储等隐私配置。
/// OAuth 仅暴露 client_id / app_id（前端发起 OAuth 跳转必需），不暴露 secret。
#[derive(Debug, Serialize, Clone)]
pub struct PublicSettings {
    #[serde(default)]
    pub is_open_source: bool,
    #[serde(default)]
    pub site: SiteSettings,
    #[serde(default)]
    pub currency: CurrencySettings,
    #[serde(default)]
    pub login: LoginSettings,
    #[serde(default)]
    pub registration: PublicRegistrationSettings,
    #[serde(default)]
    pub marketing: PublicMarketingSettings,
    /// 各支付渠道启用状态（仅布尔值，不含密钥）
    #[serde(default)]
    pub payment: PublicPaymentStatus,
    #[serde(default)]
    pub agreement: AgreementSettings,
    /// 微信 OAuth app_id（前端扫码绑定/登录需要），不含 app_secret
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub wechat_oauth_app_id: Option<String>,
    /// Google OAuth client_id（前端 OAuth 跳转需要），不含 client_secret
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub google_oauth_client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default)]
    pub menu_config: Option<MenuConfigSettings>,
    #[serde(default)]
    pub notification: PublicNotificationSettings,
}
