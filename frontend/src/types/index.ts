// Types for the TokensByte frontend

export interface User {
  id: string;
  uid: string;
  username: string;
  email: string;
  nickname?: string;
  mobile?: string;
  wechat_id?: string;
  wechat_name?: string;
  google_id?: string;
  google_name?: string;
  role: 'admin' | 'user';
  balance: number;
  used_quota: number;
  user_group: string;
  admin_group_id?: number;
  permissions?: string[];
  is_active: boolean;
  level_name?: string;
  level_id?: number;
  created_at: string;
  updated_at: string;
  register_ip?: string;
  admin_remark?: string;
  referral_history?: string;
  referred_by?: string;
  allow_view_log_details?: number;
  gift_balance?: number;
  gift_used_quota?: number;
  /** 用户模型单独折扣(JSON: {"mid": discount})，优先于等级折扣 */
  model_discounts?: string;
  timezone?: string;
  /** 信控额度 */
  credit_limit?: number;
  /** 是否允许在线支付：1-允许，0-禁止 */
  pay_enabled?: number;
  /** 用户头像 URL */
  avatar?: string;
  /** 用户通知订阅偏好(JSON) */
  notification_preferences?: string;
}

export interface UserLevel {
  id: number;
  name: string;
  group_key: string;
  discount: number;
  commission_ratio: number;
  invite_reward_inviter: number;
  invite_reward_invitee: number;
  daily_invite_limit: number;
  marketing_enabled: number;
  is_default: number;
  max_token_count: number;
  allow_view_log_details: number;
  description: string;
  created_at: string;
  user_count?: number;
}


export interface AdminGroup {
  id: number;
  name: string;
  permissions: string; // JSON string from backend
  description?: string;
  sort_order?: number;
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ModelModel {
  id: number;
  mid: string;
  name: string;
  model_id: string;
  original_id?: string;
  model_id_alias?: string;  // 模型ID别名映射值
  provider_id?: number;
  api_provider_id?: number;
  type_id?: number;
  group_ratios: string;
  billing_rule_id?: number | null;
  pre_deduction?: number;
  forward_rule_ids?: string;
  is_active: number;
  enable_log_content?: number;
  site_discount?: number;
  site_discount_enabled?: number;
  global_discount?: number;
  global_discount_enabled?: number;
  logo?: string;
  remark?: string;
  description?: string;
  feature_attributes?: string;
  created_at: string;
  updated_at?: string;
}

export interface ModelProvider {
  id: number;
  name: string;
  name_en?: string;
  sort_order: number;
  is_active: boolean;
  remark?: string;
  logo?: string;
  created_at: string;
  updated_at: string;
}

export interface ModelType {
  id: number;
  name: string;
  name_en?: string;
  sort_order: number;
  is_active: boolean;
  logo?: string;
  default_features?: string;
  created_at: string;
  updated_at: string;
}

export interface ClassificationCount {
  id: number | null;
  name: string;
  name_en?: string;
  count: number;
  logo?: string;
}

export interface ClassificationsResponse {
  providers: ClassificationCount[];
  types: ClassificationCount[];
}

export interface RechargeRecord {
  id: number;
  user_id: string;
  amount: number;
  recharge_type: string;
  remark?: string;
  wallet_type?: string;
  operator?: string;
  created_at: string;
}

interface FinanceRechargeRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  recharge_type: string;
  remark: string | null;
  operator: string | null;
  created_at: string;
}

export interface WalletStats {
  balance: number;
  gift_balance: number;
  credit_limit: number;
  total_consumption: number;
  total_calls: number;
  success_calls: number;
  commission_balance: number;
  total_referred: number;
  marketing_enabled: boolean;
  commission_ratio: number;
  invite_reward_inviter: number;
  invite_reward_invitee: number;
  /** 是否允许在线支付 */
  pay_enabled?: boolean;
}

export interface Channel {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  models: string[];
  model_mapping: Record<string, string>;
  user_groups: string[];
  exclude_user_groups?: string[];
  group_aid?: string;
  preset_id?: number | null;
  category_id?: number | null;
  sort_order: number;
  priority: number;
  weight: number;
  status: number; // 1=active, 0=disabled
  balance?: number;
  quota_limit: number; // -1 = unlimited
  quota_used: number;
  daily_quota_limit?: number;
  daily_quota_used?: number;
  weekly_quota_limit?: number;
  weekly_quota_used?: number;
  monthly_quota_limit?: number;
  monthly_quota_used?: number;
  last_reset_day?: string;
  last_reset_week?: string;
  last_reset_month?: string;
  config?: string | any;
  rate: number;
  created_at: string;
  updated_at?: string;
}

export interface ChannelCategory {
  id: number;
  name: string;
  name_en?: string;
  sort_order: number;
  is_active: number | boolean;
  is_system?: number;
  created_at: string;
  updated_at: string;
}

export interface ApiToken {
  id: number;
  user_id: string;
  token_key: string;
  kid?: string;
  name: string;
  quota_limit: number;
  quota_used: number;
  allowed_models: string[];
  allowed_ips: string;
  rps_limit: number;
  rpm_limit: number;
  billing_rule: string;
  forward_rule_ids?: string;
  is_active: number | boolean;
  only_playground?: number;
  high_availability?: number;

  last_used_at?: string;
  created_at?: string;

  daily_quota_limit: number;
  daily_quota_used: number;
  weekly_quota_limit: number;
  weekly_quota_used: number;
  monthly_quota_limit: number;
  monthly_quota_used: number;
  last_reset_day?: string;
  last_reset_week?: string;
  last_reset_month?: string;
  /** 后端按站点时区计算的当期有效已用 */
  current_daily_quota_used?: number;
  current_weekly_quota_used?: number;
  current_monthly_quota_used?: number;
}

export interface Redemption {
  id: number;
  name: string;
  code: string;
  quota: number;
  is_used: number;
  used_at?: string;
  used_by?: string;
  created_at: string;
  updated_at: string;
  /** 过期时间，空/null = 长期有效 */
  expires_at?: string | null;
  /** 单兑换码兑换次数，-1 = 不限（兼容历史 0） */
  max_uses?: number;
  /** 已兑换次数（按单个兑换码累计） */
  used_count?: number;
  /** 单兑换码单用户兑换次数，-1 = 不限（兼容历史 0） */
  per_user_limit?: number;
}

export interface RequestLog {
  id: number;
  log_id?: string;
  user_id: string;
  channel_id?: number;
  token_id?: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  /** 缓存命中的 Token 数量（属于输入的子集） */
  cached_tokens?: number;
  cost: number;
  latency_ms: number;
  status_code: number;
  endpoint: string;
  error_message?: string;
  upstream_url?: string;
  channel_group_aid?: string;
  channel_provider_type?: string;
  yid?: string;
  channel_name?: string;
  user_nickname?: string;
  user_uid?: string;
  user_group?: string;
  user_level_name?: string;
  token_name?: string;
  token_kid?: string;
  request_content?: string;
  response_content?: string;
  post_response?: string;
  upstream_req_content?: string;
  is_stream?: number;
  billing_detail?: string;
  billing_pid?: string;
  forward_eid?: string;
  plugin_tag?: string;
  channel_config_id?: number;
  sub_channel_name?: string;
  task_id?: string;
  created_at: string;
}

export interface DashboardStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  total_users: number;
  total_channels: number;
  total_api_tokens: number;
  today_requests: number;
  today_tokens: number;
  today_cost: number;
  today_active_tokens: number;
  yesterday_requests: number;
  yesterday_tokens: number;
  yesterday_cost: number;
  yesterday_active_tokens: number;
  recent_logs: RequestLog[];
  model_stats: {
    model: string;
    count: number;
    total_tokens: number;
    total_cost: number;
    last_three_days?: {
      date: string;
      count: number;
      total_cost: number;
    }[];
  }[];
    daily_trends?: {
    date: string;
    requests: number;
    cost: number;
  }[];
}

interface ModelStat30d {
  model: string;
  count: number;
  total_tokens: number;
  total_cost: number;
}

interface ModelDailyStat {
  date: string;
  model: string;
  count: number;
  total_cost: number;
}

export interface ModelTrend30dResponse {
  top_models: ModelStat30d[];
  daily_data: ModelDailyStat[];
}

interface SiteSettings {
  name: string;
  title: string;
  keywords: string;
  description: string;
  favicon?: string;
  logo?: string;
  login_title?: string;
  login_subtitle?: string;
  enable_multilingual?: boolean;
  enable_theme_toggle?: boolean;
  default_theme?: 'light' | 'dark';
  copyright?: string;
  supported_languages?: string[];
  default_language?: string;
  admin_path?: string;
  login_style?: 'split' | 'classic';
  login_quote?: string;
  default_timezone?: string;
  show_timezone?: boolean;
}

interface AuxiliaryCurrency {
  code: string;
  symbol: string;
  exchange_rate: number;
  enabled: boolean;
}

interface CurrencySettings {
  default_currency: string;
  currency_symbol: string;
  currency_unit: string;
  token_ratio: number;
  auxiliary_currencies?: AuxiliaryCurrency[];
  quick_amounts?: number[];
  min_recharge_amount?: number;
}

interface LoginSettings {
  enable_username_login: boolean;
  enable_mobile_login: boolean;
  enable_email_login: boolean;
  enable_wechat_login: boolean;
  enable_google_login: boolean;
}

interface RegistrationSettings {
  enable_username_registration: boolean;
  enable_email_registration: boolean;
  enable_mobile_registration: boolean;
  enable_password_recovery: boolean;
  // 以下字段仅管理后台完整接口返回，公开接口不包含
  ip_rate_limit_enabled?: boolean;
  ip_daily_limit?: number;
  email_validation_strict?: boolean;
  email_whitelist_enabled?: boolean;
  email_whitelist?: string[];
}

interface SMTPSettings {
  host: string;
  port: number;
  username: string;
  password?: string;
  from_address: string;
  from_name: string;
}

interface SmsSettings {
  secret_id: string;
  secret_key: string;
  sdk_app_id: string;
  sign_name: string;
  template_id: string;
}

interface GoogleOAuthSettings {
  client_id: string;
  client_secret: string;
}

interface WechatOAuthSettings {
  app_id: string;
  app_secret: string;
}

export interface MarketingSettings {
  enable_registration_gift: boolean;
  /** 是否开启用户端兑换码功能 */
  enable_redemption?: boolean;
  // 以下字段仅管理后台完整接口返回，公开接口不包含
  gift_mode?: 'fixed' | 'random';
  fixed_amount?: number;
  min_amount?: number;
  max_amount?: number;
}

interface AgreementSettings {
  tos_mode: 'text' | 'link';
  tos_mode_en: 'text' | 'link';
  tos_content: string;
  tos_content_en: string;
  tos_link: string;
  tos_link_en: string;
  privacy_mode: 'text' | 'link';
  privacy_mode_en: 'text' | 'link';
  privacy_content: string;
  privacy_content_en: string;
  privacy_link: string;
  privacy_link_en: string;
  tos_enabled: boolean;
  privacy_enabled: boolean;
}

/**
 * 公开设置 — 对应后端 PublicSettings，仅包含 UI 渲染所需的安全数据。
 * 不含任何密钥、密码、Secret、数据库信息。
 * 管理后台设置页使用独立 request.get('/settings') 走 admin 路由获取完整数据。
 */
export interface AllSettings {
  is_open_source?: boolean;
  site: SiteSettings;
  currency: CurrencySettings;
  login: LoginSettings;
  registration: RegistrationSettings;
  marketing: MarketingSettings;
  /** 各支付渠道启用状态（仅布尔值，不含密钥） */
  payment?: {
    wechat_enabled: boolean;
    alipay_enabled: boolean;
    stripe_enabled: boolean;
    bonuspay_enabled: boolean;
    hyperbc_enabled: boolean;
    allinpay_enabled: boolean;
  };
  agreement?: AgreementSettings;
  /** 微信 OAuth app_id（前端扫码需要），公开接口仅返回此字段，不含 secret */
  wechat_oauth_app_id?: string;
  /** Google OAuth client_id（前端 OAuth 跳转需要），公开接口仅返回此字段，不含 secret */
  google_oauth_client_id?: string;
  menu_config?: {
    items: {
      key: string;
      label_zh: string;
      label_en: string;
      icon: string;
      enabled: boolean;
      sort_order: number;
      allowed_levels: string;
    }[];
  };
  notification?: {
    site_notification_enabled: boolean;
    sms_balance_notification: boolean;
    email_balance_notification: boolean;
    web_notification_enabled?: boolean;
    push_notification_enabled?: boolean;
    do_not_disturb_enabled?: boolean;
    low_balance_threshold: number;
    /** 余额不足邮件主题，变量 {{site_name}} {{balance}} {{threshold}} */
    low_balance_email_subject?: string;
    /** 余额不足邮件 HTML，变量同上 */
    low_balance_email_html?: string;
  };
  database?: any;
  storage?: any;
  payment_wechat?: any;
  payment_alipay?: any;
  payment_stripe?: any;
  payment_bonuspay?: any;
  payment_hyperbc?: any;
  google_oauth?: any;
  wechat_oauth?: any;
}

export interface ChannelConfig {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  api_key?: string;
  remark?: string;
  has_api_key?: boolean;
  sort_order?: number;
  rate?: number;
  priority?: number;
  weight?: number;
  yid?: string;
  quota_limit?: number;
  quota_used?: number;
  daily_quota_limit?: number;
  daily_quota_used?: number;
  weekly_quota_limit?: number;
  weekly_quota_used?: number;
  monthly_quota_limit?: number;
  monthly_quota_used?: number;
  last_reset_day?: string;
  last_reset_week?: string;
  last_reset_month?: string;
  created_at: string;
  updated_at: string;
}

export interface Upstream {
  id: number;
  name: string;
  upstream_type: string;
  sort_order: number;
  is_active: boolean;
  remark?: string;
  config?: string; // JSON string
  balance?: number; // Fetched async
  created_at: string;
  updated_at: string;
}


export interface Plugin {
  id: number;
  name: string;
  title: string;
  description: string;
  is_enabled: number;
  allowed_levels: string;
  category: string;   // user=用户增强插件, system=系统增强插件, system_builtin=系统内置
  created_at: string;
  updated_at: string;
}

export interface PluginAsset {
  id: number;
  user_id: string;
  asset_type: 'image' | 'video' | 'audio';
  source: 'builtin' | 'user';
  status: 'uploaded' | 'pending' | 'processing' | 'approved' | 'rejected';
  file_name: string;
  file_url: string;
  mime_type?: string;
  size?: number;
  reject_reason?: string;
  category?: string;
  group_id?: string;
  asset_id?: string;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface MarketingTeam {
  id: number;
  name: string;
  description?: string;
  invite_code: string;
  max_members: number;
  leader_can_remove_members?: number;
  allowed_level_ids?: number[];
  allowed_member_level_ids?: number[];
  leaders: TeamMember[];
  members: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  user_id: string;
  username: string;
  uid: string;
}

export interface ReferralUser {
  id: string;
  uid: string;
  username: string;
  email: string;
  user_group: string;
  level_name?: string;
  balance: number;
  credit_limit?: number;
  used_quota?: number;
  gift_balance?: number;
  gift_used_quota?: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  total_recharge: number;
  current_month_system_recharge?: number;
  current_month_gift_recharge?: number;
  remark?: string;
  pay_enabled: number;
}

export interface ReferralRecharge {
  id: number;
  user_id: string;
  amount: number;
  recharge_type: string;
  remark?: string;
  wallet_type?: string;
  operator?: string;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  is_pinned: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}
