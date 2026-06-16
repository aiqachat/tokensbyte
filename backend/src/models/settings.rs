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
    /// 站点支持的语言列表（语言代码），如 ["zh", "en"]
    #[serde(default = "default_supported_languages")]
    pub supported_languages: Vec<String>,
    /// 站点默认语言
    #[serde(default = "default_language")]
    pub default_language: String,
    /// 站点默认时区
    #[serde(default = "default_site_timezone")]
    pub default_timezone: String,
    /// 是否允许用户切换亮色/暗色主题（关闭后用户端不显示切换按钮）
    #[serde(default = "default_true_theme")]
    pub enable_theme_toggle: bool,
    /// 站点默认主题："dark" 或 "light"
    #[serde(default = "default_theme_mode")]
    pub default_theme: String,
    /// 版权信息，显示在登录页面底部
    #[serde(default = "default_copyright")]
    pub copyright: String,
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

/// 辅助货币设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuxiliaryCurrency {
    pub code: String, // e.g., "USD"
    pub symbol: String, // e.g., "$"
    pub exchange_rate: f64, // e.g., if default is CNY and this is USD, rate could be 0.14
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// 货币设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CurrencySettings {
    pub default_currency: String,
    pub currency_symbol: String,
    pub currency_unit: String,
    pub token_ratio: f64,
    #[serde(default)]
    pub auxiliary_currencies: Vec<AuxiliaryCurrency>,
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

/// BonusPay 加密货币支付设置
/// 基于 https://docs.bonuspay.network 文档
#[derive(Debug, Serialize, Deserialize, Clone)]
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

/// 存储配置
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
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
}

fn default_log_retention_days() -> i32 {
    30
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MenuItemConfig {
    pub key: String,
    pub label_zh: String,
    pub label_en: String,
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
    pub payment_bonuspay: Option<PaymentBonuspaySettings>,
    pub google_oauth: Option<GoogleOAuthSettings>,
    pub wechat_oauth: Option<WechatOAuthSettings>,
    pub agreement: AgreementSettings,
    pub storage: Option<StorageSettings>,
    #[serde(default)]
    pub menu_config: Option<MenuConfigSettings>,
    #[serde(default, skip_deserializing)]
    pub server_timezone: Option<String>,
    #[serde(default, skip_deserializing)]
    pub server_time: Option<String>,
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
    pub payment_bonuspay: Option<PaymentBonuspaySettings>,
    pub google_oauth: Option<GoogleOAuthSettings>,
    pub wechat_oauth: Option<WechatOAuthSettings>,
    pub agreement: Option<AgreementSettings>,
    pub storage: Option<StorageSettings>,
    pub menu_config: Option<MenuConfigSettings>,
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
    pub enable_username_registration: bool,
    pub enable_email_registration: bool,
    pub enable_mobile_registration: bool,
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

/// 公开营销设置 — 仅暴露注册赠送开关，隐藏具体金额配置
#[derive(Debug, Serialize, Clone)]
pub struct PublicMarketingSettings {
    pub enable_registration_gift: bool,
}

impl From<&MarketingSettings> for PublicMarketingSettings {
    fn from(m: &MarketingSettings) -> Self {
        Self {
            enable_registration_gift: m.enable_registration_gift,
        }
    }
}

/// 公开支付状态 — 仅暴露各支付渠道的启用开关，不含任何密钥/密码/私钥
#[derive(Debug, Serialize, Clone)]
pub struct PublicPaymentStatus {
    pub wechat_enabled: bool,
    pub alipay_enabled: bool,
    pub stripe_enabled: bool,
    pub bonuspay_enabled: bool,
}

/// 公开设置聚合 — 仅包含前端 UI 渲染所需的安全数据
///
/// 【安全】不包含任何密钥、密码、Secret、数据库、支付、SMTP、短信、存储等隐私配置。
/// OAuth 仅暴露 client_id / app_id（前端发起 OAuth 跳转必需），不暴露 secret。
#[derive(Debug, Serialize, Clone)]
pub struct PublicSettings {
    pub site: SiteSettings,
    pub currency: CurrencySettings,
    pub login: LoginSettings,
    pub registration: PublicRegistrationSettings,
    pub marketing: PublicMarketingSettings,
    /// 各支付渠道启用状态（仅布尔值，不含密钥）
    pub payment: PublicPaymentStatus,
    pub agreement: AgreementSettings,
    /// 微信 OAuth app_id（前端扫码绑定/登录需要），不含 app_secret
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wechat_oauth_app_id: Option<String>,
    /// Google OAuth client_id（前端 OAuth 跳转需要），不含 client_secret
    #[serde(skip_serializing_if = "Option::is_none")]
    pub google_oauth_client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub menu_config: Option<MenuConfigSettings>,
}
