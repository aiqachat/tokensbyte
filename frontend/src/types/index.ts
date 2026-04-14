// Types for the TokensByte frontend

export interface User {
  id: string;
  uid: string;
  username: string;
  email: string;
  nickname?: string;
  mobile?: string;
  wechat_id?: string;
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
  description: string;
  created_at: string;
}

export interface PricingTier {
  max_tokens: number;
  prompt_rate: number;
  completion_rate: number;
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
  name: string;
  model_id: string;
  provider_id?: number;
  type_id?: number;
  billing_type: string;
  prompt_rate: number;
  completion_rate: number;
  fixed_rate: number;
  duration_rate: number;
  group_ratios: string;
  billing_rule?: string;
  forward_rule_ids?: string;
  billing_rule_id?: number | null;
  pricing_tiers: string;
  is_active: number;
  enable_log_content?: number;
  created_at: string;
  updated_at?: string;
}

export interface ModelProvider {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
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
  priority: number;
  weight: number;
  status: number; // 1=active, 0=disabled
  balance?: number;
  created_at: string;
}

export interface ApiToken {
  id: number;
  user_id: string;
  token_key: string;
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
  channel_group_aid?: string;
  channel_name?: string;
  user_nickname?: string;
  user_group?: string;
  token_name?: string;
  request_content?: string;
  response_content?: string;
  is_stream?: number;
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
}

export interface CurrencySettings {
  default_currency: string;
  currency_symbol: string;
  currency_unit: string;
  token_ratio: number;
}

export interface RegistrationSettings {
  enable_username_registration: boolean;
  enable_email_registration: boolean;
  enable_password_recovery: boolean;
}

export interface SMTPSettings {
  host: string;
  port: number;
  username: string;
  password?: string;
  from_address: string;
  from_name: string;
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
  registration: RegistrationSettings;
  smtp: SMTPSettings;
  marketing: MarketingSettings;
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

