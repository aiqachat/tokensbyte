export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  balance: number;
  user_group: string;
  is_active: boolean;
  created_at: string;
}

export interface Channel {
  id: number;
  name: string;
  provider_type: string;
  base_url: string;
  models: string[];
  model_mapping: Record<string, string>;
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
  expires_at?: string;
  is_active: boolean;
  created_at: string;
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
