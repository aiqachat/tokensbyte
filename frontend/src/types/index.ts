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
  created_at: string;
  register_ip?: string;
  admin_remark?: string;
  referred_by?: string;
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
  description: string;
  created_at: string;
}


export interface AdminGroup {
  id: number;
  name: string;
  permissions: string; // JSON string from backend
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ModelModel {
  id: number;
  mid: string;
  name: string;
  model_id: string;
  provider_id?: number;
  type_id?: number;
  group_ratios: string;
  billing_rule_id?: number | null;
  pre_deduction?: number;
  forward_rule_ids?: string;
  is_active: number;
  enable_log_content?: number;
  site_discount?: number;
  site_discount_enabled?: number;
  created_at: string;
  updated_at?: string;
}

export interface ModelProvider {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  remark?: string;
  created_at: string;
  updated_at: string;
}

export interface ModelType {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassificationCount {
  id: number | null;
  name: string;
  count: number;
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
  created_at: string;
}

export interface FinanceRechargeRecord {
  id: number;
  user_id: string;
  username: string;
  uid: string;
  amount: number;
  recharge_type: string;
  remark: string | null;
  created_at: string;
}

export interface WalletStats {
  balance: number;
  total_consumption: number;
  total_calls: number;
  success_calls: number;
  commission_balance: number;
  total_referred: number;
  marketing_enabled: boolean;
  commission_ratio: number;
  invite_reward_inviter: number;
  invite_reward_invitee: number;
}

export interface Channel {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  models: string[];
  model_mapping: Record<string, string>;
  user_groups: string[];
  group_aid?: string;
  preset_id?: number | null;
  pool_id?: number | null;   // 关联的火山引擎卡池ID
  gptimage_pool_id?: number | null; // 关联的GPT-Image卡池ID
  priority: number;
  weight: number;
  status: number; // 1=active, 0=disabled
  balance?: number;
  quota_limit: number; // -1 = unlimited
  quota_used: number;
  created_at: string;
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
  config?: string;
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
}

export interface RequestLog {
  id: number;
  user_id: string;
  channel_id?: number;
  token_id?: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  status_code: number;
  endpoint: string;
  error_message?: string;
  upstream_url?: string;
  channel_group_aid?: string;
  channel_name?: string;
  user_nickname?: string;
  user_uid?: string;
  user_group?: string;
  token_name?: string;
  token_kid?: string;
  request_content?: string;
  response_content?: string;
  upstream_req_content?: string;
  is_stream?: number;
  billing_detail?: string;
  created_at: string;
}

export interface DashboardStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  total_users: number;
  total_channels: number;
  active_tokens: number;
  today_requests: number;
  today_cost: number;
  recent_logs: RequestLog[];
  model_stats: {
    model: string;
    count: number;
    total_tokens: number;
    total_cost: number;
  }[];
}

export interface SiteSettings {
  name: string;
  title: string;
  keywords: string;
  description: string;
  favicon?: string;
  logo?: string;
  login_title?: string;
  login_subtitle?: string;
  enable_multilingual?: boolean;
}

export interface CurrencySettings {
  default_currency: string;
  currency_symbol: string;
  currency_unit: string;
  token_ratio: number;
}

export interface LoginSettings {
  enable_username_login: boolean;
  enable_mobile_login: boolean;
  enable_email_login: boolean;
  enable_wechat_login: boolean;
  enable_google_login: boolean;
}

export interface RegistrationSettings {
  enable_username_registration: boolean;
  enable_email_registration: boolean;
  enable_mobile_registration: boolean;
  enable_password_recovery: boolean;
  ip_rate_limit_enabled: boolean;
  ip_daily_limit: number;
  email_validation_strict: boolean;
  email_whitelist_enabled: boolean;
  email_whitelist: string[];
}

export interface SMTPSettings {
  host: string;
  port: number;
  username: string;
  password?: string;
  from_address: string;
  from_name: string;
}

export interface SmsSettings {
  secret_id: string;
  secret_key: string;
  sdk_app_id: string;
  sign_name: string;
  template_id: string;
}

export interface GoogleOAuthSettings {
  client_id: string;
  client_secret: string;
}

export interface WechatOAuthSettings {
  app_id: string;
  app_secret: string;
}

export interface MarketingSettings {
  enable_registration_gift: boolean;
  gift_mode: 'fixed' | 'random';
  fixed_amount: number;
  min_amount: number;
  max_amount: number;
}

export interface AllSettings {
  site: SiteSettings;
  currency: CurrencySettings;
  login: LoginSettings;
  registration: RegistrationSettings;
  smtp: SMTPSettings;
  sms?: SmsSettings;
  marketing: MarketingSettings;
  google_oauth?: GoogleOAuthSettings;
  wechat_oauth?: WechatOAuthSettings;
}

export interface ChannelConfig {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  remark?: string;
  has_api_key?: boolean;
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
  category: string;   // user=用户增强插件, system=系统增强插件
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
  is_active: number;
  created_at: string;
  total_recharge: number;
}

export interface ReferralRecharge {
  id: number;
  user_id: string;
  amount: number;
  recharge_type: string;
  remark?: string;
  created_at: string;
}
