use serde::{Deserialize, Serialize};

/// 站点基本信息设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SiteSettings {
    pub name: String,
    pub title: String,
    pub keywords: String,
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
    /// 是否允许用户切换亮色/暗色主题（关闭后用户端不显示切换按钮）
    #[serde(default = "default_true_theme")]
    pub enable_theme_toggle: bool,
    /// 站点默认主题："dark" 或 "light"
    #[serde(default = "default_theme_mode")]
    pub default_theme: String,
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

/// 站点协议设置
#[derive(Debug, Serialize, Deserialize, Clone)]
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
}

fn default_agreement_mode() -> String {
    "link".to_string()
}

/// 货币设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrencySettings {
    pub default_currency: String,
    pub currency_symbol: String,
    pub currency_unit: String,
    pub token_ratio: f64,
}

/// 登录方式设置 — 控制用户端可用的登录方式
#[derive(Debug, Serialize, Deserialize, Clone)]
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
#[derive(Debug, Serialize, Deserialize, Clone)]
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
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SMTPSettings {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
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
}

/// 营销设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketingSettings {
    #[serde(default)]
    pub enable_registration_gift: bool,
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
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseSettings {
    pub db_type: String, // "postgres"
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub ssl_mode: bool,
}

/// 微信支付设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaymentWechatSettings {
    #[serde(default)]
    pub enabled: bool,
    pub mchid: String,
    pub appid: String,
    pub api_v3_key: String,
    pub cert_serial_no: String,
    pub private_key: String,
}

/// 支付宝设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaymentAlipaySettings {
    #[serde(default)]
    pub enabled: bool,
    pub app_id: String,
    pub private_key: String,
    pub alipay_public_key: String,
    #[serde(default = "default_sign_type")]
    pub sign_type: String,
}

fn default_sign_type() -> String {
    "RSA2".to_string()
}

/// Stripe 支付设置
#[derive(Debug, Serialize, Deserialize, Clone)]
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

/// 谷歌 OAuth 2.0 设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleOAuthSettings {
    /// Google OAuth Client ID
    #[serde(default)]
    pub client_id: String,
    /// Google OAuth Client Secret
    #[serde(default)]
    pub client_secret: String,
}

/// 微信开放平台授权登录设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WechatOAuthSettings {
    /// 网站应用 AppId
    #[serde(default)]
    pub app_id: String,
    /// 网站应用密钥 AppSecret
    #[serde(default)]
    pub app_secret: String,
}

/// 聚合所有设置（读取）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AllSettings {
    pub site: SiteSettings,
    pub currency: CurrencySettings,
    pub login: LoginSettings,
    pub registration: RegistrationSettings,
    pub smtp: SMTPSettings,
    pub sms: Option<SmsSettings>,
    pub marketing: MarketingSettings,
    pub database: DatabaseSettings,
    pub payment_wechat: Option<PaymentWechatSettings>,
    pub payment_alipay: Option<PaymentAlipaySettings>,
    pub payment_stripe: Option<PaymentStripeSettings>,
    pub google_oauth: Option<GoogleOAuthSettings>,
    pub wechat_oauth: Option<WechatOAuthSettings>,
    pub agreement: AgreementSettings,
}

/// 更新设置请求（写入）
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSettingsRequest {
    pub site: Option<SiteSettings>,
    pub currency: Option<CurrencySettings>,
    pub login: Option<LoginSettings>,
    pub registration: Option<RegistrationSettings>,
    pub smtp: Option<SMTPSettings>,
    pub sms: Option<SmsSettings>,
    pub marketing: Option<MarketingSettings>,
    pub database: Option<DatabaseSettings>,
    pub payment_wechat: Option<PaymentWechatSettings>,
    pub payment_alipay: Option<PaymentAlipaySettings>,
    pub payment_stripe: Option<PaymentStripeSettings>,
    pub google_oauth: Option<GoogleOAuthSettings>,
    pub wechat_oauth: Option<WechatOAuthSettings>,
    pub agreement: Option<AgreementSettings>,
}
