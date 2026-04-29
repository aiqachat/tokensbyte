--
-- PostgreSQL database dump
--

\restrict hEdi2OEfZAHNgUd84WCQ9HoVB9n9h7QTIhiwP2PEuWUeqhdMBC4E2yTL5nbUnQ5

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: tokensapi
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO tokensapi;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: tokensapi
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_groups; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.admin_groups (
    id integer NOT NULL,
    name text NOT NULL,
    permissions text,
    description text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.admin_groups OWNER TO tokensapi;

--
-- Name: admin_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.admin_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_groups_id_seq OWNER TO tokensapi;

--
-- Name: admin_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.admin_groups_id_seq OWNED BY public.admin_groups.id;


--
-- Name: announcements; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_pinned integer DEFAULT 0 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.announcements OWNER TO tokensapi;

--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcements_id_seq OWNER TO tokensapi;

--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.api_tokens (
    id integer NOT NULL,
    user_id text NOT NULL,
    token_key text NOT NULL,
    name text DEFAULT 'default'::text NOT NULL,
    quota_limit double precision DEFAULT '-1'::integer NOT NULL,
    quota_used double precision DEFAULT 0 NOT NULL,
    allowed_models text DEFAULT '[]'::text NOT NULL,
    allowed_ips text DEFAULT ''::text NOT NULL,
    ip_whitelist text,
    rps_limit integer DEFAULT 0,
    rpm_limit integer DEFAULT 0,
    expires_at text,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    kid text DEFAULT ''::text
);


ALTER TABLE public.api_tokens OWNER TO tokensapi;

--
-- Name: api_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.api_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.api_tokens_id_seq OWNER TO tokensapi;

--
-- Name: api_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.api_tokens_id_seq OWNED BY public.api_tokens.id;


--
-- Name: billing_rules; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.billing_rules (
    id integer NOT NULL,
    name text NOT NULL,
    billing_type text NOT NULL,
    prompt_rate double precision DEFAULT 0.0 NOT NULL,
    completion_rate double precision DEFAULT 0.0 NOT NULL,
    fixed_rate double precision DEFAULT 0.0 NOT NULL,
    duration_rate double precision DEFAULT 0.0 NOT NULL,
    billing_rule text DEFAULT 'standard'::text NOT NULL,
    pricing_tiers text DEFAULT '[]'::text NOT NULL,
    extended_config text DEFAULT '{}'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    is_system integer DEFAULT 0 NOT NULL,
    cached_rate double precision DEFAULT 0.0 NOT NULL
);


ALTER TABLE public.billing_rules OWNER TO tokensapi;

--
-- Name: COLUMN billing_rules.cached_rate; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.billing_rules.cached_rate IS '缓存费率';


--
-- Name: billing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.billing_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.billing_rules_id_seq OWNER TO tokensapi;

--
-- Name: billing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.billing_rules_id_seq OWNED BY public.billing_rules.id;


--
-- Name: channel_configs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.channel_configs (
    id integer NOT NULL,
    name text NOT NULL,
    provider_type text NOT NULL,
    base_url text NOT NULL,
    api_key text NOT NULL,
    remark text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.channel_configs OWNER TO tokensapi;

--
-- Name: channel_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.channel_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.channel_configs_id_seq OWNER TO tokensapi;

--
-- Name: channel_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.channel_configs_id_seq OWNED BY public.channel_configs.id;


--
-- Name: channels; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.channels (
    id integer NOT NULL,
    name text NOT NULL,
    provider_type text NOT NULL,
    base_url text NOT NULL,
    api_key text NOT NULL,
    models text DEFAULT '[]'::text NOT NULL,
    model_mapping text DEFAULT '{}'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    status integer DEFAULT 1 NOT NULL,
    balance double precision,
    max_rps integer DEFAULT 0,
    quota_limit double precision DEFAULT '-1'::integer NOT NULL,
    quota_used double precision DEFAULT 0 NOT NULL,
    config text DEFAULT '{}'::text NOT NULL,
    user_groups text DEFAULT '[]'::text NOT NULL,
    group_aid text DEFAULT ''::text,
    preset_id integer,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    pool_id integer,
    gptimage_pool_id integer
);


ALTER TABLE public.channels OWNER TO tokensapi;

--
-- Name: COLUMN channels.pool_id; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.channels.pool_id IS '关联的火山引擎卡池ID，为空表示不使用卡池';


--
-- Name: COLUMN channels.gptimage_pool_id; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.channels.gptimage_pool_id IS '关联的GPT-Image卡池ID，为空表示不使用卡池';


--
-- Name: channels_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.channels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.channels_id_seq OWNER TO tokensapi;

--
-- Name: channels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.channels_id_seq OWNED BY public.channels.id;


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.commissions (
    id integer NOT NULL,
    user_id text NOT NULL,
    from_user_id text NOT NULL,
    recharge_id integer,
    amount double precision NOT NULL,
    ratio double precision NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.commissions OWNER TO tokensapi;

--
-- Name: commissions_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.commissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.commissions_id_seq OWNER TO tokensapi;

--
-- Name: commissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.commissions_id_seq OWNED BY public.commissions.id;


--
-- Name: forward_rules; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.forward_rules (
    id integer NOT NULL,
    name text NOT NULL,
    rule_type text NOT NULL,
    category text DEFAULT '聊天'::text NOT NULL,
    config_json text DEFAULT '{}'::text NOT NULL,
    description text,
    is_active integer DEFAULT 1 NOT NULL,
    is_system integer DEFAULT 0 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.forward_rules OWNER TO tokensapi;

--
-- Name: forward_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.forward_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.forward_rules_id_seq OWNER TO tokensapi;

--
-- Name: forward_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.forward_rules_id_seq OWNED BY public.forward_rules.id;


--
-- Name: gptimage_pool_account_mapping; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.gptimage_pool_account_mapping (
    pool_id integer NOT NULL,
    account_id integer NOT NULL
);


ALTER TABLE public.gptimage_pool_account_mapping OWNER TO tokensapi;

--
-- Name: TABLE gptimage_pool_account_mapping; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.gptimage_pool_account_mapping IS 'GPT-Image卡池与账号的多对多映射表';


--
-- Name: gptimage_pool_accounts; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.gptimage_pool_accounts (
    id integer NOT NULL,
    name text NOT NULL,
    base_url text DEFAULT ''::text NOT NULL,
    api_key text NOT NULL,
    models text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    quota_unit text DEFAULT 'images'::text NOT NULL,
    daily_reset_hour integer DEFAULT 0 NOT NULL,
    daily_reset_minute integer DEFAULT 0 NOT NULL,
    period_start text DEFAULT ''::text NOT NULL,
    period_end text DEFAULT ''::text NOT NULL,
    daily_quota double precision DEFAULT 0 NOT NULL,
    hourly_quota double precision DEFAULT 0 NOT NULL,
    period_quota double precision DEFAULT 0 NOT NULL,
    daily_used double precision DEFAULT 0 NOT NULL,
    hourly_used double precision DEFAULT 0 NOT NULL,
    period_used double precision DEFAULT 0 NOT NULL,
    last_daily_reset text DEFAULT ''::text NOT NULL,
    last_hourly_reset text DEFAULT ''::text NOT NULL,
    last_period_reset text DEFAULT ''::text NOT NULL,
    last_error text,
    last_error_at text,
    priority integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.gptimage_pool_accounts OWNER TO tokensapi;

--
-- Name: TABLE gptimage_pool_accounts; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.gptimage_pool_accounts IS 'GPT-Image来源账号表';


--
-- Name: COLUMN gptimage_pool_accounts.base_url; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.base_url IS '请求地址，如 https://api.openai.com';


--
-- Name: COLUMN gptimage_pool_accounts.models; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.models IS '支持的模型列表，逗号分隔';


--
-- Name: COLUMN gptimage_pool_accounts.status; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽';


--
-- Name: COLUMN gptimage_pool_accounts.quota_unit; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.quota_unit IS '配额计量单位: tokens=Token数, requests=请求次数, images=图片张数';


--
-- Name: COLUMN gptimage_pool_accounts.daily_quota; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.daily_quota IS '每日配额上限(0=不限)';


--
-- Name: COLUMN gptimage_pool_accounts.hourly_quota; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.hourly_quota IS '每小时配额上限(0=不限)';


--
-- Name: COLUMN gptimage_pool_accounts.period_quota; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pool_accounts.period_quota IS '时段配额上限(0=不限)';


--
-- Name: gptimage_pool_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.gptimage_pool_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gptimage_pool_accounts_id_seq OWNER TO tokensapi;

--
-- Name: gptimage_pool_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.gptimage_pool_accounts_id_seq OWNED BY public.gptimage_pool_accounts.id;


--
-- Name: gptimage_pool_logs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.gptimage_pool_logs (
    id integer NOT NULL,
    pool_id integer NOT NULL,
    account_id integer NOT NULL,
    account_name text DEFAULT ''::text NOT NULL,
    model_id text DEFAULT ''::text NOT NULL,
    channel_id integer DEFAULT 0 NOT NULL,
    usage_amount double precision DEFAULT 0 NOT NULL,
    quota_unit text DEFAULT 'images'::text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.gptimage_pool_logs OWNER TO tokensapi;

--
-- Name: TABLE gptimage_pool_logs; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.gptimage_pool_logs IS 'GPT-Image卡池调度使用日志';


--
-- Name: gptimage_pool_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.gptimage_pool_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gptimage_pool_logs_id_seq OWNER TO tokensapi;

--
-- Name: gptimage_pool_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.gptimage_pool_logs_id_seq OWNED BY public.gptimage_pool_logs.id;


--
-- Name: gptimage_pools; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.gptimage_pools (
    id integer NOT NULL,
    name text NOT NULL,
    pool_type text DEFAULT 'image'::text NOT NULL,
    strategy text DEFAULT 'random'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.gptimage_pools OWNER TO tokensapi;

--
-- Name: TABLE gptimage_pools; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.gptimage_pools IS 'GPT-Image卡池分组表';


--
-- Name: COLUMN gptimage_pools.pool_type; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pools.pool_type IS '卡池类型: image=图片, custom=自定义';


--
-- Name: COLUMN gptimage_pools.strategy; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.gptimage_pools.strategy IS '调度策略: random=随机分布, sequential=顺序轮转';


--
-- Name: gptimage_pools_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.gptimage_pools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gptimage_pools_id_seq OWNER TO tokensapi;

--
-- Name: gptimage_pools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.gptimage_pools_id_seq OWNED BY public.gptimage_pools.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.logs (
    id integer NOT NULL,
    user_id text NOT NULL,
    channel_id integer,
    token_id integer,
    model text DEFAULT ''::text NOT NULL,
    prompt_tokens integer DEFAULT 0 NOT NULL,
    completion_tokens integer DEFAULT 0 NOT NULL,
    cost double precision DEFAULT 0.0 NOT NULL,
    latency_ms integer DEFAULT 0 NOT NULL,
    status_code integer DEFAULT 200 NOT NULL,
    endpoint text DEFAULT ''::text NOT NULL,
    error_message text,
    upstream_url text DEFAULT ''::text,
    request_content text,
    response_content text,
    upstream_req_content text,
    is_stream integer DEFAULT 0 NOT NULL,
    billing_detail text DEFAULT ''::text,
    created_at text DEFAULT (now())::text NOT NULL,
    cached_tokens integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.logs OWNER TO tokensapi;

--
-- Name: COLUMN logs.cached_tokens; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.logs.cached_tokens IS '缓存命中的Token数量(属于输入的子集)';


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_id_seq OWNER TO tokensapi;

--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: marketing_team_leaders; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.marketing_team_leaders (
    id integer NOT NULL,
    team_id integer NOT NULL,
    user_id text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.marketing_team_leaders OWNER TO tokensapi;

--
-- Name: marketing_team_leaders_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.marketing_team_leaders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_team_leaders_id_seq OWNER TO tokensapi;

--
-- Name: marketing_team_leaders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.marketing_team_leaders_id_seq OWNED BY public.marketing_team_leaders.id;


--
-- Name: marketing_team_members; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.marketing_team_members (
    id integer NOT NULL,
    team_id integer NOT NULL,
    user_id text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.marketing_team_members OWNER TO tokensapi;

--
-- Name: marketing_team_members_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.marketing_team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_team_members_id_seq OWNER TO tokensapi;

--
-- Name: marketing_team_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.marketing_team_members_id_seq OWNED BY public.marketing_team_members.id;


--
-- Name: marketing_teams; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.marketing_teams (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    invite_code text,
    max_members integer DEFAULT 10 NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    allowed_level_ids text DEFAULT '[]'::text NOT NULL,
    allowed_member_level_ids text DEFAULT '[]'::text NOT NULL,
    members_can_set_level integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.marketing_teams OWNER TO tokensapi;

--
-- Name: COLUMN marketing_teams.allowed_level_ids; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.marketing_teams.allowed_level_ids IS '团队负责人被授权可分配的用户等级ID列表(JSON数组)';


--
-- Name: COLUMN marketing_teams.allowed_member_level_ids; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.marketing_teams.allowed_member_level_ids IS '团队负责人被授权可分配给团队成员的用户等级ID列表(JSON数组)';


--
-- Name: marketing_teams_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.marketing_teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.marketing_teams_id_seq OWNER TO tokensapi;

--
-- Name: marketing_teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.marketing_teams_id_seq OWNED BY public.marketing_teams.id;


--
-- Name: model_providers; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.model_providers (
    id integer NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    is_system integer DEFAULT 0 NOT NULL,
    logo text
);


ALTER TABLE public.model_providers OWNER TO tokensapi;

--
-- Name: model_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.model_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.model_providers_id_seq OWNER TO tokensapi;

--
-- Name: model_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.model_providers_id_seq OWNED BY public.model_providers.id;


--
-- Name: model_types; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.model_types (
    id integer NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    is_system integer DEFAULT 0 NOT NULL,
    logo text
);


ALTER TABLE public.model_types OWNER TO tokensapi;

--
-- Name: model_types_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.model_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.model_types_id_seq OWNER TO tokensapi;

--
-- Name: model_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.model_types_id_seq OWNED BY public.model_types.id;


--
-- Name: models; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.models (
    id integer NOT NULL,
    name text NOT NULL,
    model_id text NOT NULL,
    provider_id integer,
    type_id integer,
    group_ratios text DEFAULT '{}'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    enable_log_content integer DEFAULT 0 NOT NULL,
    forward_rule_ids text,
    billing_rule_id integer,
    pre_deduction double precision DEFAULT 0.0 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    mid text DEFAULT ''::text NOT NULL,
    site_discount double precision DEFAULT 1.0 NOT NULL,
    site_discount_enabled integer DEFAULT 0 NOT NULL,
    logo text
);


ALTER TABLE public.models OWNER TO tokensapi;

--
-- Name: models_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.models_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.models_id_seq OWNER TO tokensapi;

--
-- Name: models_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.models_id_seq OWNED BY public.models.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    out_trade_no text NOT NULL,
    user_id text NOT NULL,
    payment_method text NOT NULL,
    amount double precision NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    trade_no text,
    created_at text DEFAULT (now())::text NOT NULL,
    paid_at text
);


ALTER TABLE public.orders OWNER TO tokensapi;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO tokensapi;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: playground_assets; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.playground_assets (
    id integer NOT NULL,
    project_id integer NOT NULL,
    user_id text NOT NULL,
    uid text NOT NULL,
    asset_type text NOT NULL,
    file_name text DEFAULT ''::text,
    file_size bigint DEFAULT 0,
    file_url text NOT NULL,
    tos_object_key text DEFAULT ''::text,
    thumbnail_url text DEFAULT ''::text,
    prompt text DEFAULT ''::text,
    model_id text DEFAULT ''::text,
    model_name text DEFAULT ''::text,
    generation_params text DEFAULT '{}'::text,
    canvas_node_data text DEFAULT '{}'::text,
    duration_seconds double precision DEFAULT 0,
    width integer DEFAULT 0,
    height integer DEFAULT 0,
    is_deleted integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.playground_assets OWNER TO tokensapi;

--
-- Name: playground_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.playground_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.playground_assets_id_seq OWNER TO tokensapi;

--
-- Name: playground_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.playground_assets_id_seq OWNED BY public.playground_assets.id;


--
-- Name: playground_projects; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.playground_projects (
    id integer NOT NULL,
    user_id text NOT NULL,
    uid text NOT NULL,
    name text DEFAULT '未命名项目'::text NOT NULL,
    description text DEFAULT ''::text,
    cover_url text DEFAULT ''::text,
    canvas_data text DEFAULT '{}'::text,
    is_deleted integer DEFAULT 0 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.playground_projects OWNER TO tokensapi;

--
-- Name: playground_projects_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.playground_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.playground_projects_id_seq OWNER TO tokensapi;

--
-- Name: playground_projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.playground_projects_id_seq OWNED BY public.playground_projects.id;


--
-- Name: plugin_api_logs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.plugin_api_logs (
    id integer NOT NULL,
    user_id text NOT NULL,
    plugin_name text NOT NULL,
    api_endpoint text NOT NULL,
    request_payload text,
    response_payload text,
    status_code integer,
    created_at text DEFAULT (now())::text NOT NULL,
    source text DEFAULT 'page'::text NOT NULL
);


ALTER TABLE public.plugin_api_logs OWNER TO tokensapi;

--
-- Name: COLUMN plugin_api_logs.source; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_api_logs.source IS '日志来源: api_proxy=对外接口 / page=页面操作 / relay_convert=转发规则替换素材';


--
-- Name: plugin_api_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.plugin_api_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plugin_api_logs_id_seq OWNER TO tokensapi;

--
-- Name: plugin_api_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.plugin_api_logs_id_seq OWNED BY public.plugin_api_logs.id;


--
-- Name: plugin_asset_groups; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.plugin_asset_groups (
    id integer NOT NULL,
    user_id text NOT NULL,
    group_id text NOT NULL,
    name text NOT NULL,
    description text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.plugin_asset_groups OWNER TO tokensapi;

--
-- Name: plugin_asset_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.plugin_asset_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plugin_asset_groups_id_seq OWNER TO tokensapi;

--
-- Name: plugin_asset_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.plugin_asset_groups_id_seq OWNED BY public.plugin_asset_groups.id;


--
-- Name: plugin_assets; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.plugin_assets (
    id integer NOT NULL,
    user_id text NOT NULL,
    asset_type text NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    mime_type text,
    size integer,
    reject_reason text,
    category text DEFAULT '未分类'::text,
    asset_id text,
    sort_order integer DEFAULT 0 NOT NULL,
    remark text,
    group_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    content_hash text
);


ALTER TABLE public.plugin_assets OWNER TO tokensapi;

--
-- Name: COLUMN plugin_assets.category; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.category IS '素材分类';


--
-- Name: COLUMN plugin_assets.asset_id; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.asset_id IS '火山方舟素材ID（如 asset://...）';


--
-- Name: COLUMN plugin_assets.sort_order; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.sort_order IS '排序权重，数字越大越靠前';


--
-- Name: COLUMN plugin_assets.remark; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.remark IS '管理员内部备注';


--
-- Name: COLUMN plugin_assets.group_id; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.group_id IS '素材绑定的组合ID';


--
-- Name: COLUMN plugin_assets.content_hash; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugin_assets.content_hash IS '资源内容 SHA-256 哈希值，用于精确去重';


--
-- Name: plugin_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.plugin_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plugin_assets_id_seq OWNER TO tokensapi;

--
-- Name: plugin_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.plugin_assets_id_seq OWNED BY public.plugin_assets.id;


--
-- Name: plugin_configs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.plugin_configs (
    id integer NOT NULL,
    plugin_name text NOT NULL,
    config_key text NOT NULL,
    config_value text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.plugin_configs OWNER TO tokensapi;

--
-- Name: plugin_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.plugin_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plugin_configs_id_seq OWNER TO tokensapi;

--
-- Name: plugin_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.plugin_configs_id_seq OWNED BY public.plugin_configs.id;


--
-- Name: plugins; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.plugins (
    id integer NOT NULL,
    name text NOT NULL,
    title text NOT NULL,
    description text,
    is_enabled integer DEFAULT 0 NOT NULL,
    allowed_levels text DEFAULT 'all'::text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    category text DEFAULT 'user'::text NOT NULL
);


ALTER TABLE public.plugins OWNER TO tokensapi;

--
-- Name: COLUMN plugins.category; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.plugins.category IS '插件分类: user=用户增强, system=系统增强';


--
-- Name: plugins_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.plugins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plugins_id_seq OWNER TO tokensapi;

--
-- Name: plugins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.plugins_id_seq OWNED BY public.plugins.id;


--
-- Name: recharge_records; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.recharge_records (
    id integer NOT NULL,
    user_id text NOT NULL,
    amount double precision NOT NULL,
    recharge_type text DEFAULT 'other'::text NOT NULL,
    remark text,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.recharge_records OWNER TO tokensapi;

--
-- Name: recharge_records_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.recharge_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.recharge_records_id_seq OWNER TO tokensapi;

--
-- Name: recharge_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.recharge_records_id_seq OWNED BY public.recharge_records.id;


--
-- Name: redemptions; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.redemptions (
    id integer NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    quota double precision NOT NULL,
    is_used integer DEFAULT 0,
    used_at text,
    used_by text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.redemptions OWNER TO tokensapi;

--
-- Name: redemptions_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.redemptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.redemptions_id_seq OWNER TO tokensapi;

--
-- Name: redemptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.redemptions_id_seq OWNED BY public.redemptions.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.settings OWNER TO tokensapi;

--
-- Name: site_icon_sync_logs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.site_icon_sync_logs (
    id integer NOT NULL,
    total_synced integer DEFAULT 0 NOT NULL,
    total_new integer DEFAULT 0 NOT NULL,
    total_updated integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.site_icon_sync_logs OWNER TO tokensapi;

--
-- Name: TABLE site_icon_sync_logs; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.site_icon_sync_logs IS '站点图标同步日志';


--
-- Name: site_icon_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.site_icon_sync_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_icon_sync_logs_id_seq OWNER TO tokensapi;

--
-- Name: site_icon_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.site_icon_sync_logs_id_seq OWNED BY public.site_icon_sync_logs.id;


--
-- Name: site_icons; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.site_icons (
    id integer NOT NULL,
    name text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    file_path text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'lobe-icons'::text NOT NULL,
    category text DEFAULT 'AI品牌'::text NOT NULL,
    tags text DEFAULT '[]'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.site_icons OWNER TO tokensapi;

--
-- Name: TABLE site_icons; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.site_icons IS '站点图标库，存储 SVG 图标元数据';


--
-- Name: COLUMN site_icons.name; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.name IS '图标标识名（如 openai, claude）';


--
-- Name: COLUMN site_icons.title; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.title IS '显示名称（如 OpenAI, Claude）';


--
-- Name: COLUMN site_icons.file_path; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.file_path IS 'SVG 文件路径（相对于 data/assets/）';


--
-- Name: COLUMN site_icons.source; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.source IS '图标来源: lobe-icons=从 GitHub 同步 / custom=手动上传';


--
-- Name: COLUMN site_icons.category; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.category IS '分类: AI品牌 / 自定义';


--
-- Name: COLUMN site_icons.tags; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.site_icons.tags IS '标签(JSON数组)';


--
-- Name: site_icons_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.site_icons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.site_icons_id_seq OWNER TO tokensapi;

--
-- Name: site_icons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.site_icons_id_seq OWNED BY public.site_icons.id;


--
-- Name: upstreams; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.upstreams (
    id integer NOT NULL,
    name text NOT NULL,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    config text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.upstreams OWNER TO tokensapi;

--
-- Name: upstreams_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.upstreams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.upstreams_id_seq OWNER TO tokensapi;

--
-- Name: upstreams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.upstreams_id_seq OWNED BY public.upstreams.id;


--
-- Name: user_levels; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.user_levels (
    id integer NOT NULL,
    name text NOT NULL,
    group_key text NOT NULL,
    discount double precision DEFAULT 1.0 NOT NULL,
    commission_ratio double precision DEFAULT 0.0 NOT NULL,
    invite_reward_inviter double precision DEFAULT 0.0 NOT NULL,
    invite_reward_invitee double precision DEFAULT 0.0 NOT NULL,
    daily_invite_limit integer DEFAULT 10 NOT NULL,
    marketing_enabled integer DEFAULT 0 NOT NULL,
    max_token_count integer DEFAULT 10 NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    is_default integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.user_levels OWNER TO tokensapi;

--
-- Name: user_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.user_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_levels_id_seq OWNER TO tokensapi;

--
-- Name: user_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.user_levels_id_seq OWNED BY public.user_levels.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.users (
    id text NOT NULL,
    uid text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    nickname text,
    mobile text,
    wechat_id text,
    role text DEFAULT 'user'::text NOT NULL,
    balance double precision DEFAULT 0.0 NOT NULL,
    user_group text DEFAULT 'default'::text NOT NULL,
    used_quota double precision DEFAULT 0.0 NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    upstream_type text DEFAULT 'other'::text NOT NULL,
    config text,
    referred_by text,
    commission_balance double precision DEFAULT 0.0 NOT NULL,
    admin_group_id integer,
    register_ip text DEFAULT ''::text,
    admin_remark text DEFAULT ''::text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    google_id text,
    wechat_name text,
    google_name text,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'user'::text])))
);


ALTER TABLE public.users OWNER TO tokensapi;

--
-- Name: COLUMN users.remark; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.users.remark IS '推广用户备注';


--
-- Name: verification_codes; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.verification_codes (
    id integer NOT NULL,
    email text NOT NULL,
    code text NOT NULL,
    purpose text NOT NULL,
    expires_at text NOT NULL,
    created_at text DEFAULT (now())::text NOT NULL,
    phone text DEFAULT ''::text
);


ALTER TABLE public.verification_codes OWNER TO tokensapi;

--
-- Name: verification_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.verification_codes_id_seq OWNER TO tokensapi;

--
-- Name: verification_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.verification_codes_id_seq OWNED BY public.verification_codes.id;


--
-- Name: volcengine_pool_account_mapping; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.volcengine_pool_account_mapping (
    pool_id integer NOT NULL,
    account_id integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    quota_unit text DEFAULT 'tokens'::text NOT NULL,
    daily_reset_hour integer DEFAULT 0 NOT NULL,
    daily_reset_minute integer DEFAULT 0 NOT NULL,
    period_start text DEFAULT ''::text NOT NULL,
    period_end text DEFAULT ''::text NOT NULL,
    daily_quota double precision DEFAULT 0 NOT NULL,
    hourly_quota double precision DEFAULT 0 NOT NULL,
    period_quota double precision DEFAULT 0 NOT NULL,
    daily_used double precision DEFAULT 0 NOT NULL,
    hourly_used double precision DEFAULT 0 NOT NULL,
    period_used double precision DEFAULT 0 NOT NULL,
    last_daily_reset text DEFAULT ''::text NOT NULL,
    last_hourly_reset text DEFAULT ''::text NOT NULL,
    last_period_reset text DEFAULT ''::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.volcengine_pool_account_mapping OWNER TO tokensapi;

--
-- Name: TABLE volcengine_pool_account_mapping; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.volcengine_pool_account_mapping IS '卡池与账号的多对多映射表';


--
-- Name: volcengine_pool_accounts; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.volcengine_pool_accounts (
    id integer NOT NULL,
    name text NOT NULL,
    base_url text DEFAULT 'https://ark.cn-beijing.volces.com/api/v3'::text NOT NULL,
    api_key text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_error text,
    last_error_at text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    models text DEFAULT ''::text NOT NULL,
    quota_unit text DEFAULT 'tokens'::text NOT NULL,
    daily_reset_hour integer DEFAULT 0 NOT NULL,
    daily_reset_minute integer DEFAULT 0 NOT NULL,
    period_start text DEFAULT ''::text NOT NULL,
    period_end text DEFAULT ''::text NOT NULL,
    account_id text DEFAULT ''::text NOT NULL,
    access_key text DEFAULT ''::text NOT NULL,
    secret_key text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.volcengine_pool_accounts OWNER TO tokensapi;

--
-- Name: TABLE volcengine_pool_accounts; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.volcengine_pool_accounts IS '火山引擎独立账号表';


--
-- Name: COLUMN volcengine_pool_accounts.base_url; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pool_accounts.base_url IS '请求地址';


--
-- Name: COLUMN volcengine_pool_accounts.status; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pool_accounts.status IS '账号状态: active=可用, disabled=故障禁用, exhausted=配额耗尽';


--
-- Name: COLUMN volcengine_pool_accounts.models; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pool_accounts.models IS '支持的模型列表，逗号分隔';


--
-- Name: COLUMN volcengine_pool_accounts.quota_unit; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pool_accounts.quota_unit IS '配额计量单位: tokens=Token数, requests=请求次数, images=图片张数';


--
-- Name: volcengine_pool_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.volcengine_pool_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.volcengine_pool_accounts_id_seq OWNER TO tokensapi;

--
-- Name: volcengine_pool_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.volcengine_pool_accounts_id_seq OWNED BY public.volcengine_pool_accounts.id;


--
-- Name: volcengine_pool_logs; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.volcengine_pool_logs (
    id integer NOT NULL,
    pool_id integer NOT NULL,
    account_id integer NOT NULL,
    account_name text DEFAULT ''::text NOT NULL,
    model_id text DEFAULT ''::text NOT NULL,
    channel_id integer DEFAULT 0 NOT NULL,
    usage_amount double precision DEFAULT 0 NOT NULL,
    quota_unit text DEFAULT 'tokens'::text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.volcengine_pool_logs OWNER TO tokensapi;

--
-- Name: TABLE volcengine_pool_logs; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.volcengine_pool_logs IS '卡池调度使用日志';


--
-- Name: volcengine_pool_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.volcengine_pool_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.volcengine_pool_logs_id_seq OWNER TO tokensapi;

--
-- Name: volcengine_pool_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.volcengine_pool_logs_id_seq OWNED BY public.volcengine_pool_logs.id;


--
-- Name: volcengine_pools; Type: TABLE; Schema: public; Owner: tokensapi
--

CREATE TABLE public.volcengine_pools (
    id integer NOT NULL,
    name text NOT NULL,
    pool_type text DEFAULT 'chat'::text NOT NULL,
    strategy text DEFAULT 'random'::text NOT NULL,
    is_active integer DEFAULT 1 NOT NULL,
    remark text,
    created_at text DEFAULT (now())::text NOT NULL,
    updated_at text DEFAULT (now())::text NOT NULL,
    model_id text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.volcengine_pools OWNER TO tokensapi;

--
-- Name: TABLE volcengine_pools; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON TABLE public.volcengine_pools IS '火山引擎卡池分组表';


--
-- Name: COLUMN volcengine_pools.pool_type; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pools.pool_type IS '卡池类型: chat=聊天, image=图片, video=视频, custom=自定义';


--
-- Name: COLUMN volcengine_pools.strategy; Type: COMMENT; Schema: public; Owner: tokensapi
--

COMMENT ON COLUMN public.volcengine_pools.strategy IS '调度策略: random=随机分布, sequential=顺序轮转';


--
-- Name: volcengine_pools_id_seq; Type: SEQUENCE; Schema: public; Owner: tokensapi
--

CREATE SEQUENCE public.volcengine_pools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.volcengine_pools_id_seq OWNER TO tokensapi;

--
-- Name: volcengine_pools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: tokensapi
--

ALTER SEQUENCE public.volcengine_pools_id_seq OWNED BY public.volcengine_pools.id;


--
-- Name: admin_groups id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.admin_groups ALTER COLUMN id SET DEFAULT nextval('public.admin_groups_id_seq'::regclass);


--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: api_tokens id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.api_tokens ALTER COLUMN id SET DEFAULT nextval('public.api_tokens_id_seq'::regclass);


--
-- Name: billing_rules id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.billing_rules ALTER COLUMN id SET DEFAULT nextval('public.billing_rules_id_seq'::regclass);


--
-- Name: channel_configs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.channel_configs ALTER COLUMN id SET DEFAULT nextval('public.channel_configs_id_seq'::regclass);


--
-- Name: channels id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.channels ALTER COLUMN id SET DEFAULT nextval('public.channels_id_seq'::regclass);


--
-- Name: commissions id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.commissions ALTER COLUMN id SET DEFAULT nextval('public.commissions_id_seq'::regclass);


--
-- Name: forward_rules id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.forward_rules ALTER COLUMN id SET DEFAULT nextval('public.forward_rules_id_seq'::regclass);


--
-- Name: gptimage_pool_accounts id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_accounts ALTER COLUMN id SET DEFAULT nextval('public.gptimage_pool_accounts_id_seq'::regclass);


--
-- Name: gptimage_pool_logs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_logs ALTER COLUMN id SET DEFAULT nextval('public.gptimage_pool_logs_id_seq'::regclass);


--
-- Name: gptimage_pools id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pools ALTER COLUMN id SET DEFAULT nextval('public.gptimage_pools_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: marketing_team_leaders id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_leaders ALTER COLUMN id SET DEFAULT nextval('public.marketing_team_leaders_id_seq'::regclass);


--
-- Name: marketing_team_members id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_members ALTER COLUMN id SET DEFAULT nextval('public.marketing_team_members_id_seq'::regclass);


--
-- Name: marketing_teams id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_teams ALTER COLUMN id SET DEFAULT nextval('public.marketing_teams_id_seq'::regclass);


--
-- Name: model_providers id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_providers ALTER COLUMN id SET DEFAULT nextval('public.model_providers_id_seq'::regclass);


--
-- Name: model_types id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_types ALTER COLUMN id SET DEFAULT nextval('public.model_types_id_seq'::regclass);


--
-- Name: models id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models ALTER COLUMN id SET DEFAULT nextval('public.models_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: playground_assets id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_assets ALTER COLUMN id SET DEFAULT nextval('public.playground_assets_id_seq'::regclass);


--
-- Name: playground_projects id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_projects ALTER COLUMN id SET DEFAULT nextval('public.playground_projects_id_seq'::regclass);


--
-- Name: plugin_api_logs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_api_logs ALTER COLUMN id SET DEFAULT nextval('public.plugin_api_logs_id_seq'::regclass);


--
-- Name: plugin_asset_groups id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_asset_groups ALTER COLUMN id SET DEFAULT nextval('public.plugin_asset_groups_id_seq'::regclass);


--
-- Name: plugin_assets id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_assets ALTER COLUMN id SET DEFAULT nextval('public.plugin_assets_id_seq'::regclass);


--
-- Name: plugin_configs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_configs ALTER COLUMN id SET DEFAULT nextval('public.plugin_configs_id_seq'::regclass);


--
-- Name: plugins id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugins ALTER COLUMN id SET DEFAULT nextval('public.plugins_id_seq'::regclass);


--
-- Name: recharge_records id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.recharge_records ALTER COLUMN id SET DEFAULT nextval('public.recharge_records_id_seq'::regclass);


--
-- Name: redemptions id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.redemptions ALTER COLUMN id SET DEFAULT nextval('public.redemptions_id_seq'::regclass);


--
-- Name: site_icon_sync_logs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.site_icon_sync_logs ALTER COLUMN id SET DEFAULT nextval('public.site_icon_sync_logs_id_seq'::regclass);


--
-- Name: site_icons id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.site_icons ALTER COLUMN id SET DEFAULT nextval('public.site_icons_id_seq'::regclass);


--
-- Name: upstreams id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.upstreams ALTER COLUMN id SET DEFAULT nextval('public.upstreams_id_seq'::regclass);


--
-- Name: user_levels id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.user_levels ALTER COLUMN id SET DEFAULT nextval('public.user_levels_id_seq'::regclass);


--
-- Name: verification_codes id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.verification_codes ALTER COLUMN id SET DEFAULT nextval('public.verification_codes_id_seq'::regclass);


--
-- Name: volcengine_pool_accounts id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_accounts ALTER COLUMN id SET DEFAULT nextval('public.volcengine_pool_accounts_id_seq'::regclass);


--
-- Name: volcengine_pool_logs id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_logs ALTER COLUMN id SET DEFAULT nextval('public.volcengine_pool_logs_id_seq'::regclass);


--
-- Name: volcengine_pools id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pools ALTER COLUMN id SET DEFAULT nextval('public.volcengine_pools_id_seq'::regclass);


--
-- Data for Name: admin_groups; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.admin_groups (id, name, permissions, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.announcements (id, title, content, is_pinned, is_active, created_at, updated_at) FROM stdin;
1	联系方式	<p>有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</p>	1	1	2026-04-25T11:17:05.791582+08:00	2026-04-25T11:17:05.791582+08:00
3	dasdad	<p>dasdasdasd</p>	0	1	2026-04-25T11:17:34.563877+08:00	2026-04-25T11:17:34.563877+08:00
2	dsadasd	<ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><ul><li><span style="background-color: rgb(31, 31, 31); color: rgba(255, 255, 255, 0.85);">有问题联系我们&nbsp;24&nbsp;小时&nbsp;i&nbsp;服务微信&nbsp;artsmp</span></li></ul><h4></h4><p></p>	0	1	2026-04-25T11:17:28.583423+08:00	2026-04-25T11:27:20.357506+08:00
\.


--
-- Data for Name: api_tokens; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.api_tokens (id, user_id, token_key, name, quota_limit, quota_used, allowed_models, allowed_ips, ip_whitelist, rps_limit, rpm_limit, expires_at, is_active, remark, upstream_type, config, created_at, updated_at, kid) FROM stdin;
1	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	sk-65c67ae354ad46b3618ed8e565ea22bbab22fc26954e9226	default	-1	0.2	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 08:11:18.798677+00	2026-04-25 08:17:36.543489+00	183650
11	a8a92839-ab28-475e-acd7-b656a198b03d	sk-38146f7ba8834ae65852b248868ebc77cb351a62afb5109e	default	-1	1.873606	[]		\N	0	0	\N	1	\N	other	\N	2026-04-28 10:10:16.644984+00	2026-04-28 10:26:51.766257+00	820676
2	fc03127f-3d70-4c40-9a23-5a698ea80e57	sk-0e63c59e0428fec22acf57cce25e52015a88afb4adab2391	default	-1	0.6000000000000001	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 09:05:20.76979+00	2026-04-25 09:24:06.714+00	106018
3	92086673-19cd-43e5-81ca-fdf34c06fdaa	sk-7f8485e568b1e63223a1bef32e1523c32b3572f337fa2e53	default	-1	0.4	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 09:45:42.669738+00	2026-04-25 09:48:11.991322+00	764817
4	47aaabf0-7e6a-42a1-a951-bdec068f3024	sk-13a55e0682cefa49a680a0d3a149a8eb1a5bb3a320d65535	default	-1	0.6000000000000001	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 10:06:09.477082+00	2026-04-25 11:18:56.021191+00	266260
5	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	sk-82f347c9a6e711463ccb3e40ab0b675100bc3ce7948b5fc1	default	-1	0.2	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 13:11:41.215243+00	2026-04-25 13:12:35.06066+00	943228
6	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	sk-a1812800513ef0fef8c3c00c5c03e2447a2ce82700df4519	default	-1	0.8	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 14:04:28.562932+00	2026-04-25 17:52:46.17062+00	464096
7	4d77d157-71aa-409a-adf2-19ade50ed63e	sk-a299cd32af903b4fb3245b96e47e74fb31de0a24fbf5a867	default	-1	0.6000000000000001	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 18:09:51.258375+00	2026-04-25 18:35:31.254998+00	912082
8	f41d8242-87f6-4d04-9404-2e44ae001f11	sk-275859adb9036fe731511b423b04cd7b03451b27ee02ef9d	default	-1	0.2	[]		\N	0	0	\N	1	\N	other	\N	2026-04-25 23:39:08.497137+00	2026-04-25 23:46:22.132953+00	594023
9	5ccd16c3-a971-442c-96c0-045e7c3cd896	sk-4348a5631170309f272c2ec1efa869d11d7d354c819ca069	default	-1	0	[]		\N	0	0	\N	1	\N	other	\N	2026-04-27 09:57:45.008285+00	2026-04-27 09:57:45.008285+00	541012
10	348e130f-1955-41ec-953a-c478a901738c	sk-641aed5fc0972efa8aa1badf26f12b29d8cc2073ba0ad0fe	default	-1	4.0293	[]		\N	0	0	\N	1	\N	other	\N	2026-04-28 09:07:20.504333+00	2026-04-28 09:44:58.356154+00	856830
\.


--
-- Data for Name: billing_rules; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.billing_rules (id, name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_active, remark, upstream_type, config, created_at, updated_at, is_system, cached_rate) FROM stdin;
1	免费公益模型模板	tokens	0	0	0	0	standard	[]	{}	1	\N	other	\N	2026-04-24 11:17:00.277578+00	2026-04-24 11:17:00.277578+00	0	0
2	标准 1M 万字计费 ($1)	tokens	1	1	0	0	standard	[]	{}	1	\N	other	\N	2026-04-24 11:17:00.277578+00	2026-04-24 11:17:00.277578+00	0	0
3	单次请求扣费 ($0.1)	requests	0	0	0.1	0	standard	[]	{}	1	\N	other	\N	2026-04-24 11:17:00.277578+00	2026-04-24 11:17:00.277578+00	0	0
4	doubao-seedance-1-5-pro计费	tokens	0	0	0	0	seedance1.5pro	[]	{"audio_rate":16,"base_rate":8,"offline_discount":0.5}	1	\N	other	\N	2026-04-25 08:08:40.849735+00	2026-04-25 08:08:40.849735+00	0	0
5	doubao-seedream-4-0.2张	requests	0	0	0.2	0	fixed	[]	{}	1	\N	other	\N	2026-04-25 08:09:20.308329+00	2026-04-25 08:09:20.308329+00	0	0
6	doubao2.0	tokens	0	0	0	0	tiered	[{"completion_rate":3,"max_completion_tokens":32,"max_prompt_tokens":0,"prompt_rate":2},{"completion_rate":33,"max_completion_tokens":128,"max_prompt_tokens":32,"prompt_rate":33},{"completion_rate":44,"max_completion_tokens":256,"max_prompt_tokens":128,"prompt_rate":4}]	{}	1	\N	other	\N	2026-04-26 16:12:50.658299+00	2026-04-26 16:12:50.658299+00	0	0
7	谷歌	tokens	10	10	0	0	standard	[]	{}	1	\N	other	\N	2026-04-26 16:17:18.040748+00	2026-04-26 16:17:18.040748+00	0	0
8	doubao-seedream-4-0.25VIP	requests	0	0	0.25	0	per_image	[]	{}	1	\N	other	\N	2026-04-27 10:06:30.028094+00	2026-04-27 10:06:30.028094+00	0	0
9	seedream4.0	requests	0	0	0.2	0	per_image	[]	{}	1	\N	other	\N	2026-04-27 13:57:13.698565+00	2026-04-27 13:57:13.698565+00	0	0
10	seedream4.5	requests	0	0	0.25	0	per_image	[]	{}	1	\N	other	\N	2026-04-27 13:57:26.363224+00	2026-04-27 13:57:26.363224+00	0	0
11	seedream5.0	requests	0	0	0.025	0	per_image	[]	{}	1	\N	other	\N	2026-04-27 13:57:39.179513+00	2026-04-27 13:57:39.179513+00	0	0
12	seedance2.0fast	tokens	0	0	0	0	seedance2.0	[]	{"resolution_rates":{"480p":{"with_video":22,"without_video":37},"720p":{"with_video":22,"without_video":37}}}	1	\N	other	\N	2026-04-28 09:00:29.903953+00	2026-04-28 09:00:29.903953+00	0	0
13	seendance标准版	tokens	0	0	0	0	seedance2.0	[]	{"resolution_rates":{"1080p":{"with_video":31,"without_video":51},"480p":{"with_video":28,"without_video":46},"720p":{"with_video":28,"without_video":46}}}	1	\N	other	\N	2026-04-28 09:00:57.134465+00	2026-04-28 09:00:57.134465+00	0	0
14	SC-gpt-image-2	requests	0	0	0	0	image_resolution	[{"cached_rate":0,"enabled":true,"rate":0.063,"resolution":"1K"},{"cached_rate":0,"enabled":true,"rate":0.126,"resolution":"2K"},{"cached_rate":0,"enabled":true,"rate":0.189,"resolution":"4K"}]	{"prompt_extend_multiplier":1}	1	\N	other	\N	2026-04-28 11:53:28.755939+00	2026-04-28 11:53:28.755939+00	0	0
15	SC-gemini-3-pro-image-preview	requests	0	0	0	0	image_resolution	[{"cached_rate":0,"enabled":true,"rate":0.42,"resolution":"1K"},{"cached_rate":0,"enabled":true,"rate":0.42,"resolution":"2K"},{"cached_rate":0,"enabled":true,"rate":0.525,"resolution":"4K"}]	{"prompt_extend_multiplier":1}	1	\N	other	\N	2026-04-28 11:54:35.832806+00	2026-04-28 11:54:35.832806+00	0	0
16	SC-gemini-3-pro-image-preview-official	requests	0	0	0	0	image_resolution	[{"cached_rate":0,"enabled":true,"rate":1.1256,"resolution":"1K"},{"cached_rate":0,"enabled":true,"rate":1.1256,"resolution":"2K"},{"cached_rate":0,"enabled":true,"rate":2.016,"resolution":"4K"}]	{"prompt_extend_multiplier":1}	1	\N	other	\N	2026-04-28 11:55:08.287468+00	2026-04-28 11:55:08.287468+00	0	0
17	SC-gemini-3.1-flash-image-preview	requests	0	0	0	0	image_resolution	[{"cached_rate":0,"enabled":true,"rate":0.315,"resolution":"0.5K"},{"cached_rate":0,"enabled":true,"rate":0.315,"resolution":"1K"},{"cached_rate":0,"enabled":true,"rate":0.42,"resolution":"2K"},{"cached_rate":0,"enabled":true,"rate":0.63,"resolution":"4K"}]	{"prompt_extend_multiplier":1}	1	\N	other	\N	2026-04-28 11:55:47.511169+00	2026-04-28 11:55:47.511169+00	0	0
18	SC-gemini-3.1-flash-image-preview-official	requests	0	0	0	0	image_resolution	[{"cached_rate":0,"enabled":true,"rate":0.5628,"resolution":"0.5K"},{"cached_rate":0,"enabled":true,"rate":0.5628,"resolution":"1K"},{"cached_rate":0,"enabled":true,"rate":0.8484,"resolution":"2K"},{"cached_rate":0,"enabled":true,"rate":1.2684,"resolution":"4K"}]	{"prompt_extend_multiplier":1}	1	\N	other	\N	2026-04-28 11:56:25.049366+00	2026-04-28 11:56:25.049366+00	0	0
\.


--
-- Data for Name: channel_configs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.channel_configs (id, name, provider_type, base_url, api_key, remark, created_at, updated_at) FROM stdin;
1	111	火山	https://ark.cn-beijing.volces.com/api/v3	ark-acb8df15-77ca-46d8-8c6a-0b256269b471-01187	\N	2026-04-25 08:07:20.290317+00	2026-04-25 08:07:20.290317+00
2	300w 自己xinhankr_token	火山	https://ark.cn-beijing.volces.com/api/v3	ark-4b01eae8-890b-4992-9ab0-52522550cfbd-0d8ab	\N	2026-04-28 09:04:12.137713+00	2026-04-28 09:04:12.137713+00
3	SC-api	SC-api	https://api.apimart.ai	sk-UxNnAGVzqb1Fsbzq8DqdIT9yNfl7IBpIDs8hov4QHp8iJAkU	SC-api	2026-04-28 11:59:30.489848+00	2026-04-28 11:59:30.489848+00
\.


--
-- Data for Name: channels; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.channels (id, name, provider_type, base_url, api_key, models, model_mapping, priority, weight, status, balance, max_rps, quota_limit, quota_used, config, user_groups, group_aid, preset_id, created_at, updated_at, pool_id, gptimage_pool_id) FROM stdin;
1	给主站使用	custom			["doubao-seedream-4-0-250828"]	{}	0	1	1	\N	0	-1	3.600000000000001	null	[]	1239	1	2026-04-25 08:14:46.725282+00	2026-04-27 10:07:04.949345+00	\N	\N
2	sd4.0	custom			["doubao-seedream-4-0-250828"]	{}	0	1	1	\N	0	-1	0	null	[]	5708	\N	2026-04-27 10:05:52.034316+00	2026-04-28 08:15:07.788682+00	1	\N
3	sd2.0-牛Bplus	custom			["doubao-seedance-2-0-fast-260128","doubao-seedance-2-0-260128"]	{"doubao-seedance-2-0-260128":"ep-20260423183911-47tvl","doubao-seedance-2-0-fast-260128":"ep-20260423183947-rhw99"}	0	1	1	\N	0	-1	0	null	[]	9862	2	2026-04-28 09:06:07.035637+00	2026-04-28 09:44:07.35767+00	\N	\N
4	SC-api	custom			["gemini-3.1-flash-image-preview-official","gemini-3.1-flash-image-preview","gemini-3-pro-image-preview-official","gemini-3-pro-image-preview","gpt-image-2"]	{}	0	1	1	\N	0	-1	0	null	[]	4911	3	2026-04-28 11:59:54.121106+00	2026-04-28 11:59:54.121106+00	\N	\N
\.


--
-- Data for Name: commissions; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.commissions (id, user_id, from_user_id, recharge_id, amount, ratio, created_at) FROM stdin;
\.


--
-- Data for Name: forward_rules; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.forward_rules (id, name, rule_type, category, config_json, description, is_active, is_system, remark, upstream_type, config, created_at, updated_at) FROM stdin;
5	Google Gemini 流式转换 (聊天)	gemini	聊天	{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:streamGenerateContent?alt=sse"},"auth_type":"query_key"}	将标准请求转换为支持流式输出的 Gemini contents	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
7	OpenAI 兼容原生通道 (视频)	openai	视频	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/video/generations","new":"/v1/video/generations"}}	供视频生成调用的原生通道	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
8	OpenAI 兼容原生通道 (聊天)	openai	聊天	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}	标准的按路径聊天透传规则	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
9	火山方舟 视频生成	volcengine	视频	{"mode":"transform","target_type":"volcengine","path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}	将标准的视频生成请求适配到火山方舟 tasks 接口	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
15	阿里百炼 DashScope 视频生成	dashscope	视频	{"mode":"transform","target_type":"dashscope","path_rewrite":{"old":"/v1/video/generations","new":"/api/v1/services/aigc/video-generation/video-synthesis"},"auth_type":"bearer","poll_path":"/api/v1/tasks/${task_id}"}	将标准视频生成请求（/v1/video/generations）转换为阿里百炼 DashScope 格式，支持文生视频/图生视频/参考生视频/视频编辑，异步任务自动注入 X-DashScope-Async Header	1	1	\N	other	\N	2026-04-28 11:42:48.653363+00	2026-04-28 11:42:48.653363+00
16	阿里百炼 DashScope 视频生成 (官方路径)	dashscope	视频	{"mode":"transform","target_type":"dashscope","path_rewrite":{"old":"/api/v1/services/aigc/video-generation/video-synthesis","new":"/api/v1/services/aigc/video-generation/video-synthesis"},"auth_type":"bearer","poll_path":"/api/v1/tasks/${task_id}"}	阿里百炼官方原生路径直通，适用于直接使用 DashScope API 地址调用的场景	1	1	\N	other	\N	2026-04-28 11:42:48.653363+00	2026-04-28 11:42:48.653363+00
17	阿里百炼 DashScope 图片生成	dashscope	图片	{"mode":"transform","target_type":"dashscope_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v1/services/aigc/multimodal-generation/generation"},"auth_type":"bearer"}	将标准图片生成请求（/v1/images/generations）转换为阿里百炼 DashScope 格式	1	1	\N	other	\N	2026-04-28 11:42:48.653363+00	2026-04-28 11:42:48.653363+00
18	阿里百炼 DashScope 图片生成 (官方路径)	dashscope	图片	{"mode":"transform","target_type":"dashscope_image","path_rewrite":{"old":"/api/v1/services/aigc/multimodal-generation/generation","new":"/api/v1/services/aigc/multimodal-generation/generation"},"auth_type":"bearer"}	阿里百炼官方原生路径直通	1	1	\N	other	\N	2026-04-28 11:42:48.653363+00	2026-04-28 11:42:48.653363+00
1	Google Gemini 格式转换 (聊天)	gemini	聊天	{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}	将标准请求转换并适配到 Gemini contents	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
2	火山方舟 视频素材转换	volcengine	视频	{"mode":"transform","target_type":"volcengine","asset_convert":true,"path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}	在火山方舟视频生成基础上，自动将 content 中的网络 URL 通过 CreateAsset API 转换为素材 ID（asset://前缀），需配置素材资产管理插件的审核凭证	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
4	Anthropic 原生转化	anthropic	聊天	{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}	转换 Messages 格式，注入专有 Header	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
13	mart	mart	图片	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"},"poll_path":"/v1/tasks/${task_id}"}	自定义mart通道	1	1	\N	other	\N	2026-04-25 14:03:39.361066+00	2026-04-25 14:03:39.361066+00
6	火山方舟 图片生成	volcengine	图片	{"mode":"transform","target_type":"volcengine_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v3/images/generations"},"auth_type":"bearer"}	将标准的图片生成请求转发到火山方舟官方 images 接口，body 保持 OpenAI 兼容格式	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
12	火山方舟 聊天	volcengine	聊天	{"mode":"transform","target_type":"volcengine_chat","path_rewrite":{"old":"/v1/chat/completions","new":"/api/v3/chat/completions"},"auth_type":"bearer"}	将标准的聊天请求转发到火山方舟官方 Chat 接口，body 保持 OpenAI 兼容格式	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
3	OpenAI 兼容原生通道 (图片)	openai	图片	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"}}	供图片生成调用的原生通道	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
14	mart-视频	Mart	视频	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/videos/generations","new":"/v1/videos/generations"},"poll_path":"/v1/tasks/${task_id}"}	自定义mart视频通道	1	1	\N	other	\N	2026-04-25 14:03:39.361066+00	2026-04-25 14:03:39.361066+00
10	Google Gemini 原生生图	gemini	图片	{"mode":"transform","target_type":"gemini_image","path_rewrite":{"old":"/v1/images/generations","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}	将标准的生图请求适配到 Gemini contents 接口	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
11	OpenAI 兼容原生通道异步 (图片)	openai	图片	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"},"poll_path":"/v1/tasks/${task_id}"}	供图片生成调用的原生通道	1	1	\N	other	\N	2026-04-24 11:17:00.267198+00	2026-04-24 11:17:00.267198+00
\.


--
-- Data for Name: gptimage_pool_account_mapping; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.gptimage_pool_account_mapping (pool_id, account_id) FROM stdin;
\.


--
-- Data for Name: gptimage_pool_accounts; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.gptimage_pool_accounts (id, name, base_url, api_key, models, status, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, daily_used, hourly_used, period_used, last_daily_reset, last_hourly_reset, last_period_reset, last_error, last_error_at, priority, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: gptimage_pool_logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.gptimage_pool_logs (id, pool_id, account_id, account_name, model_id, channel_id, usage_amount, quota_unit, status, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: gptimage_pools; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.gptimage_pools (id, name, pool_type, strategy, is_active, remark, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.logs (id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, latency_ms, status_code, endpoint, error_message, upstream_url, request_content, response_content, upstream_req_content, is_stream, billing_detail, created_at, cached_tokens) FROM stdin;
1	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Invalid API Key		\N	\N	\N	0		2026-04-25 03:02:57.245712+00	0
2	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.429522+00	0
3	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.453087+00	0
4	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.473542+00	0
5	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.495512+00	0
6	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.519023+00	0
7	unknown	0	0	unknown	0	0	0	0	401	/api/v1/announcements/public	Missing Authorization Header		\N	\N	\N	0		2026-04-25 03:02:57.54895+00	0
8	unknown	0	0	unknown	0	0	0	0	401	/api/v1/team-marketing/allowed-levels	Invalid API Key		\N	\N	\N	0		2026-04-25 04:33:36.412385+00	0
9	unknown	0	0	unknown	0	0	0	0	401	/api/v1/team-marketing/allowed-member-levels	Invalid API Key		\N	\N	\N	0		2026-04-25 04:44:21.676168+00	0
10	unknown	0	0	unknown	0	0	0	0	401	/api/v1/team-marketing/allowed-member-levels	Invalid API Key		\N	\N	\N	0		2026-04-25 04:44:21.687953+00	0
11	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	0	0	doubao-seedream-4-0-250828	0	0	0	0	404	/v1/video/generations	No available channels found for model doubao-seedream-4-0-250828		\N	\N	\N	0		2026-04-25 08:14:19.199996+00	0
12	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1	1	doubao-seedream-4-0-250828	0	0	0	10207	200	/v1/video/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"camera_fixed":false,"duration":5,"generate_audio":true,"model":"doubao-seedream-4-0-250828","prompt":"一个美女在咖啡店喝咖啡","ratio":"16:9","resolution":"720p","return_last_frame":false,"seed":-1,"watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777104900,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777104892450546c150dd91466c4968e4bb2bdb9d5d2ce8b56_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T081500Z&X-Tos-Expires=86400&X-Tos-Signature=8d0c9da778056d1341bbd30a28cc8acc971dd64b0cd912d949b8f8271db54a6e&X-Tos-SignedHeaders=host","size":"2048x2048"}],"usage":{"generated_images":1,"output_tokens":16384,"total_tokens":16384}}\n	{"camera_fixed":false,"duration":5,"generate_audio":true,"model":"doubao-seedream-4-0-250828","prompt":"一个美女在咖啡店喝咖啡","ratio":"16:9","resolution":"720p","return_last_frame":false,"seed":-1,"watermark":false}	0	异步任务处理中(冻结)	2026-04-25 08:15:01.006143+00	0
13	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	0	0	doubao-seedance-1-5-pro-251215	0	0	0	0	404	/v1/video/generations	No available channels found for model doubao-seedance-1-5-pro-251215		\N	\N	\N	0		2026-04-25 08:17:01.985529+00	0
14	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1	1	doubao-seedream-4-0-250828	0	4096	0.2	10168	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个美女在咖啡店喝咖啡","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777105055,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777105048101ad6686bf264e1cfa8d614a02b293f5e0b62351_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T081735Z&X-Tos-Expires=86400&X-Tos-Signature=f97589bba2a23459ed3853c934d3cb9a95660caee33e4c8cc296ea935442a459&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个美女在咖啡店喝咖啡","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 08:17:36.543489+00	0
15	fc03127f-3d70-4c40-9a23-5a698ea80e57	1	2	doubao-seedream-4-0-250828	0	4096	0.2	14516	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777107975,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777107963005ddbe0d776ca28054411b6866ea9771fcdc0db9_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T090615Z&X-Tos-Expires=86400&X-Tos-Signature=5bbadb8a9eb744c83008fca8f58bcd96dea43d73d60ba6ae5f88395f273398c7&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 09:06:15.854971+00	0
16	fc03127f-3d70-4c40-9a23-5a698ea80e57	1	2	doubao-seedream-4-0-250828	0	4096	0.2	9255	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777108763,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777108757378b9f1f8d82739748c57f1ca9984b4fb5eb5f52a_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T091923Z&X-Tos-Expires=86400&X-Tos-Signature=bb90a02055ef1a7add9403960357e1c2fe220bd58af9bdb7ecd1a30c03b65367&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 09:19:25.123695+00	0
17	fc03127f-3d70-4c40-9a23-5a698ea80e57	1	2	doubao-seedream-4-0-250828	0	4096	0.2	17229	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"咋大街上等打车","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777109045,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777109030837c42f47c04edb3ff7f5c9773198a61a0cafa7a8_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T092405Z&X-Tos-Expires=86400&X-Tos-Signature=222fb13605d5de4d3498a273fac4829faa1959c63b4e851e3469d2fd6200beb6&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"咋大街上等打车","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 09:24:06.714+00	0
18	92086673-19cd-43e5-81ca-fdf34c06fdaa	1	3	doubao-seedream-4-0-250828	0	4096	0.2	7139	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777110386,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771103811698c8bbeccabd2a8badabcecc7b49ff2427ddb60_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T094626Z&X-Tos-Expires=86400&X-Tos-Signature=6f081d83a57da4a18620ab60f9fcc4eed76436c655dba9e9f1094b93c64ed410&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 09:46:27.546633+00	0
19	92086673-19cd-43e5-81ca-fdf34c06fdaa	1	3	doubao-seedream-4-0-250828	0	4096	0.2	8906	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777110490,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777110483880b556cf4da499f5769ee5b78217b3f91a3fd89c_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T094810Z&X-Tos-Expires=86400&X-Tos-Signature=1246ce5901dd4e0f8d3c75dadb202049231da4bf601a4664b8d58bd69f67966f&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 09:48:11.991322+00	0
20	47aaabf0-7e6a-42a1-a951-bdec068f3024	1	4	doubao-seedream-4-0-250828	0	4096	0.2	9908	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777111625,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/02177711161862248e5da24e8965daa10accd59f6411c73ac3067_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T100705Z&X-Tos-Expires=86400&X-Tos-Signature=bb0da1e1dc5d4dc0a07ad449f3fe8f78dd1368159aca1eb277c05ea5aa523232&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 10:07:06.065257+00	0
21	47aaabf0-7e6a-42a1-a951-bdec068f3024	1	4	doubao-seedream-4-0-250828	0	4096	0.2	7192	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777111667,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/02177711166168148e5da24e8965daa10accd59f6411c734d69df_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T100747Z&X-Tos-Expires=86400&X-Tos-Signature=a250f8ad1f7fbdfab7924da6801be5be949f7ff1ba457f5d0cc7626998010590&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 10:07:49.084683+00	0
22	47aaabf0-7e6a-42a1-a951-bdec068f3024	1	4	doubao-seedream-4-0-250828	0	4096	0.2	10841	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":5,"model":"doubao-seedream-4-0-250828","n":2,"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上身材完美比例，一个很舒服的姿势，座子为矜持怕走光的姿势，穿着黑色丝袜和黑色很细跟高跟鞋，低胸白色吊带包臀连衣裙，在咖啡店看着窗外喝咖啡。","ratio":"1:1","size":"1024x1024","watermark":true}	{"model":"doubao-seedream-4-0-250828","created":1777115935,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771159273999e9a0f81d29869daa108a627170bdfb2e3b841_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T111855Z&X-Tos-Expires=86400&X-Tos-Signature=a3cb1e0e8a4c9c3fea00cdafdd0444c00308a032b38c4ccdb118dd615df361be&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":5,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上身材完美比例，一个很舒服的姿势，座子为矜持怕走光的姿势，穿着黑色丝袜和黑色很细跟高跟鞋，低胸白色吊带包臀连衣裙，在咖啡店看着窗外喝咖啡。","ratio":"1:1","sequential_image_generation":"auto","sequential_image_generation_options":{"max_images":2},"size":"1024x1024","watermark":true}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 11:18:56.021191+00	0
23	unknown	0	0	unknown	0	0	0	0	401	/	Missing Authorization Header		\N	\N	\N	0		2026-04-25 12:10:41.729386+00	0
24	unknown	0	0	unknown	0	0	0	0	401	/	Missing Authorization Header		\N	\N	\N	0		2026-04-25 12:25:11.685915+00	0
25	unknown	0	0	unknown	0	0	0	0	401	/	Missing Authorization Header		\N	\N	\N	0		2026-04-25 12:31:21.834306+00	0
26	unknown	0	0	unknown	0	0	0	0	401	/	Missing Authorization Header		\N	\N	\N	0		2026-04-25 12:31:28.835283+00	0
27	unknown	0	0	unknown	0	0	0	0	401	/	Missing Authorization Header		\N	\N	\N	0		2026-04-25 12:49:55.72659+00	0
28	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	1	5	doubao-seedream-4-0-250828	0	4096	0.2	10362	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"参考图片里面的这个白色的衣服换成蓝色的。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777122753,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777122746651fa647a4e0ad2c514964a6296626d67a0d15d3e_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T131233Z&X-Tos-Expires=86400&X-Tos-Signature=3053e9e78bfbb9d462ef4570c3f56be94f4bc2d6700ade7c356d09b4facc76d2&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"参考图片里面的这个白色的衣服换成蓝色的。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 13:12:35.06066+00	0
29	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1	6	doubao-seedream-4-0-250828	0	4096	0.2	11896	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":"https://s3.artsapi.com/chedev/1001198464/jkll/1abc2359-8344-4c25-8274-ac4998de5d5d.jpg","image_url":"https://s3.artsapi.com/chedev/1001198464/jkll/1abc2359-8344-4c25-8274-ac4998de5d5d.jpg","model":"doubao-seedream-4-0-250828","n":1,"prompt":"吧这个任务的的上衣换成黑色","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777126267,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777126258103a65bb9cc875deec710c23fb9efaa4f4b46d309_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T141107Z&X-Tos-Expires=86400&X-Tos-Signature=f896c429bd057196823c3e5cc7dbfa6c342d2794175f8177591636f5c2976303&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":"https://s3.artsapi.com/chedev/1001198464/jkll/1abc2359-8344-4c25-8274-ac4998de5d5d.jpg","image_url":"https://s3.artsapi.com/chedev/1001198464/jkll/1abc2359-8344-4c25-8274-ac4998de5d5d.jpg","model":"doubao-seedream-4-0-250828","prompt":"吧这个任务的的上衣换成黑色","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 14:11:08.591613+00	0
30	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1	6	doubao-seedream-4-0-250828	0	4096	0.2	10925	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"把我画黄圈的这朵花给它扣除掉。","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777135425,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777135414719c57e78ec35a4c62cb30347d58d08558fc646a9_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T164345Z&X-Tos-Expires=86400&X-Tos-Signature=df34b9ae2ea384ed7cdba5e912602ac85ec5bc49be1515497a0cea4f7aec5f95&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"把我画黄圈的这朵花给它扣除掉。","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 16:43:45.352248+00	0
31	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1	6	doubao-seedream-4-0-250828	0	4096	0.2	5982	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","n":1,"prompt":"一个亚洲美女穿着包臀短裙在照镜子","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777139506,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777139501060e3fc3002f37f70960f01c9f37bff6e8235c533_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T175146Z&X-Tos-Expires=86400&X-Tos-Signature=916091f629eb37714df8abb339846190dbddfe88a41f11c4e2ae2e8eeac1f35d&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"model":"doubao-seedream-4-0-250828","prompt":"一个亚洲美女穿着包臀短裙在照镜子","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 17:51:46.783952+00	0
32	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1	6	doubao-seedream-4-0-250828	0	4096	0.2	15843	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"把这个衣服换成黑色的","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777139566,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777139550443e3fc3002f37f70960f01c9f37bff6e82e86825_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T175246Z&X-Tos-Expires=86400&X-Tos-Signature=10f194e85f1151270f2cbe02f30f6e38284b07360041a27191d145f7ffe902fa&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"把这个衣服换成黑色的","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 17:52:46.17062+00	0
33	4d77d157-71aa-409a-adf2-19ade50ed63e	1	7	doubao-seedream-4-0-250828	0	4096	0.2	7239	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"把这个衣服变成白色","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777140629,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777140622798b6043c5851c0a2627b25b78c406cf304277cea_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T181029Z&X-Tos-Expires=86400&X-Tos-Signature=d1a9cee9fb3ab854c6d335692f3e1d304064758b2e59ecc059bb16aef63142cd&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"把这个衣服变成白色","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 18:10:29.800446+00	0
34	4d77d157-71aa-409a-adf2-19ade50ed63e	1	7	doubao-seedream-4-0-250828	0	4096	0.2	28884	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"吧图 2 的衣服换到图 1 上面去","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777141901,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777141873266b81e7dc348dc6944e7af7515bd42f6ba52faa5_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T183141Z&X-Tos-Expires=86400&X-Tos-Signature=57cccae4f61354788dc31cf54d7d60ef0585e8463826d431142b8e35881ac881&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"吧图 2 的衣服换到图 1 上面去","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 18:31:41.876601+00	0
35	4d77d157-71aa-409a-adf2-19ade50ed63e	1	7	doubao-seedream-4-0-250828	0	4096	0.2	28285	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"吧图一的上衣换到图二身上","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777142131,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771421032316c842ac2497beff864ff783c000b2c17ec4d4f_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T183531Z&X-Tos-Expires=86400&X-Tos-Signature=7b67cc331347a58a079c051ef6f6c8a10e159bfc01d09601d5c7df18e9dcee9d&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"吧图一的上衣换到图二身上","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 18:35:31.254998+00	0
36	f41d8242-87f6-4d04-9404-2e44ae001f11	1	8	doubao-seedream-4-0-250828	0	4096	0.2	52009	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","n":1,"prompt":"吧图二的衣服换到图一的模特身上","ratio":"1:1","size":"1024x1024","watermark":false}	{"model":"doubao-seedream-4-0-250828","created":1777160781,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771607336225de161b16d50149cbf4122a430bab0f06f709d_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T234621Z&X-Tos-Expires=86400&X-Tos-Signature=05ecfb603b78432f2b272cac6dc5e5849680c89bd29f70705dafec7030f77aa3&X-Tos-SignedHeaders=host","size":"1024x1024"}],"usage":{"generated_images":1,"output_tokens":4096,"total_tokens":4096}}\n	{"guidance_scale":7,"image":""base64数据"","image_url":""base64数据"","model":"doubao-seedream-4-0-250828","prompt":"吧图二的衣服换到图一的模特身上","ratio":"1:1","size":"1024x1024","watermark":false}	0	固定按次计费 -> (1量 * 0.2单价 * 1.00倍率) | 等级折扣	2026-04-25 23:46:22.132953+00	0
37	unknown	0	0	unknown	0	0	0	0	401	/api/auth/login	Missing Authorization Header		\N	\N	\N	0		2026-04-26 17:36:19.508833+00	0
38	unknown	0	0	unknown	0	0	0	0	401	/api/model-providers	Invalid Bearer Token Format		\N	\N	\N	0		2026-04-26 17:36:19.52345+00	0
39	unknown	0	0	unknown	0	0	0	0	401	/api/auth/login	Missing Authorization Header		\N	\N	\N	0		2026-04-26 17:41:41.276649+00	0
40	unknown	0	0	unknown	0	0	0	0	401	/api/admin/model-classifications	Invalid Bearer Token Format		\N	\N	\N	0		2026-04-26 17:41:41.288305+00	0
41	unknown	0	0	unknown	0	0	0	0	401	/api/v1/admin/login	Missing Authorization Header		\N	\N	\N	0		2026-04-28 07:52:26.549086+00	0
42	unknown	0	0	unknown	0	0	0	0	401	/api/v1/login	Missing Authorization Header		\N	\N	\N	0		2026-04-28 07:52:26.594825+00	0
43	unknown	0	0	unknown	0	0	0	0	401	/api/v1/admin/login	Missing Authorization Header		\N	\N	\N	0		2026-04-28 07:52:59.168355+00	0
44	unknown	0	0	unknown	0	0	0	0	401	/api/v1/admin/login	Missing Authorization Header		\N	\N	\N	0		2026-04-28 07:52:59.211927+00	0
45	unknown	0	0	unknown	0	0	0	0	401	/api/v1/admin/login	Missing Authorization Header		\N	\N	\N	0		2026-04-28 07:53:16.315725+00	0
46	unknown	0	0	unknown	0	0	0	0	401	/api/v1/contents/generations/tasks	Invalid API Key		\N	\N	\N	0		2026-04-28 09:24:57.328393+00	0
47	unknown	0	0	unknown	0	0	0	0	401	/api/v3/contents/generations/tasks	Invalid API Key		\N	\N	\N	0		2026-04-28 09:25:09.868044+00	0
48	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	0	0	seedance-2.0-fast	0	0	0	0	404	/api/v3/contents/generations/tasks	No available channels found for model seedance-2.0-fast		\N	\N	\N	0		2026-04-28 09:25:58.79642+00	0
49	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	2	1	doubao-seedream-4-0-250828	0	0	0	1783	401	/api/v3/contents/generations/tasks	{"error":{"code":"AuthenticationError","message":"The API key format is incorrect. Request id: 02177736837798789a6ab5dfd15f12fdf9b1912203a3c65694f35","param":"","type":"Unauthorized"}}	/api/v3/contents/generations/tasks	{"model":"doubao-seedream-4-0-250828","prompt":"test"}	\N	{"model":"doubao-seedream-4-0-250828","prompt":"test","resolution":"720p"}	0	\N	2026-04-28 09:26:18.032783+00	0
50	348e130f-1955-41ec-953a-c478a901738c	3	10	doubao-seedance-2-0-fast-260128	0	108900	4.0293	180001	200	/v1/video/generations	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	\N	{"id":"cgt-20260428174157-h54cv","model":"doubao-seedance-2-0-fast-260128","status":"succeeded","content":{"video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0-fast/02177736937447700000000000000000000ffffac1823a398f6bd.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260428%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260428T094436Z&X-Tos-Expires=86400&X-Tos-Signature=3bb58d3a0c2f53d2d548896b562e4610a6dfd8ae500bbfd6b8256052653e17c2&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":108900,"total_tokens":108900},"created_at":1777369318,"updated_at":1777369492,"seed":37074,"resolution":"720p","ratio":"16:9","duration":5,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":true,"draft":false}\n	\N	0	Seedance2.0(720p|无视频|基本单价:37) -> (0P*37 + 108900C*37)/1M * 1.00倍率 | 等级折扣 | 模型映射: doubao-seedance-2-0-fast-260128 ➞ ep-20260423183947-rhw99	2026-04-28 09:41:58.343319+00	0
51	a8a92839-ab28-475e-acd7-b656a198b03d	3	11	doubao-seedance-2-0-fast-260128	0	50638	1.873606	180022	200	/v1/video/generations	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"camera_fixed":false,"content":[{"text":"全身视频展示图一和图二不同的穿搭。","type":"text"},{"image_url":{"url":""base64数据""},"type":"image_url"}],"duration":5,"generate_audio":true,"model":"doubao-seedance-2-0-fast-260128","ratio":"9:16","resolution":"480p","return_last_frame":false,"seed":-1,"watermark":false}	{"id":"cgt-20260428182351-vrks5","model":"doubao-seedance-2-0-fast-260128","status":"succeeded","content":{"video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0-fast/02177737191825300000000000000000000ffffac177f5f89185a.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260428%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260428T102640Z&X-Tos-Expires=86400&X-Tos-Signature=a5893a1812213e6a24c3c2fe6d750856088268cef494fa33d2e2abacaa8c4f59&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":50638,"total_tokens":50638},"created_at":1777371831,"updated_at":1777372011,"seed":60880,"resolution":"480p","ratio":"9:16","duration":5,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":true,"draft":false}\n	{"content":[{"text":"全身视频展示图一和图二不同的穿搭。","type":"text"},{"image_url":{"url":"asset://asset-20260428182345-mr4jz"},"type":"image_url"}],"duration":5,"generate_audio":true,"model":"ep-20260423183947-rhw99","ratio":"9:16","resolution":"480p","return_last_frame":false,"seed":-1,"watermark":false}	0	Seedance2.0(480p|无视频|基本单价:37) -> (0P*37 + 50638C*37)/1M * 1.00倍率 | 等级折扣 | 模型映射: doubao-seedance-2-0-fast-260128 ➞ ep-20260423183947-rhw99	2026-04-28 10:23:51.735028+00	0
52	8321514a-13f1-4fc3-9384-7223919c7d18	4	0	gemini-3.1-flash-image-preview-official	0	0	0	1315	200	https://api.apimart.ai/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	\N	\N	\N	0		2026-04-28 12:00:00.871361+00	0
53	8321514a-13f1-4fc3-9384-7223919c7d18	4	0	gemini-3.1-flash-image-preview	0	0	0	233	200	https://api.apimart.ai/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	\N	\N	\N	0		2026-04-28 12:00:03.338281+00	0
54	8321514a-13f1-4fc3-9384-7223919c7d18	4	0	gemini-3-pro-image-preview-official	0	0	0	148	200	https://api.apimart.ai/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	\N	\N	\N	0		2026-04-28 12:00:03.625975+00	0
55	8321514a-13f1-4fc3-9384-7223919c7d18	4	0	gemini-3-pro-image-preview	0	0	0	146	200	https://api.apimart.ai/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	\N	\N	\N	0		2026-04-28 12:00:04.0967+00	0
56	8321514a-13f1-4fc3-9384-7223919c7d18	4	0	gpt-image-2	0	0	0	151	200	https://api.apimart.ai/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	\N	\N	\N	0		2026-04-28 12:00:04.801817+00	0
\.


--
-- Data for Name: marketing_team_leaders; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_team_leaders (id, team_id, user_id, created_at) FROM stdin;
6	1	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	2026-04-27 08:25:53.233347+00
\.


--
-- Data for Name: marketing_team_members; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_team_members (id, team_id, user_id, created_at) FROM stdin;
6	1	33d5765d-dacf-499f-a77d-a00ea930729e	2026-04-27 08:25:53.237948+00
\.


--
-- Data for Name: marketing_teams; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_teams (id, name, description, invite_code, max_members, created_at, updated_at, allowed_level_ids, allowed_member_level_ids, members_can_set_level) FROM stdin;
1	bubyday	\N	cydgdz6a	10	2026-04-24 11:56:59.055037+00	2026-04-27 08:25:53.221731+00	[9,12,16]	[10,16]	1
\.


--
-- Data for Name: model_providers; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.model_providers (id, name, sort_order, is_active, remark, upstream_type, config, created_at, updated_at, is_system, logo) FROM stdin;
709	OpenAI	0	1	\N	other	\N	2026-04-27 13:58:07.750081+00	2026-04-27 13:58:07.750081+00	0	openai
710	腾讯	0	1	\N	other	\N	2026-04-27 13:58:27.591147+00	2026-04-27 13:58:27.591147+00	0	hunyuan
1	火山引擎	1	1	\N	other	\N	2026-04-24 11:17:00.321901+00	2026-04-26 17:43:53.652254+00	1	aionlabs
2	谷歌	2	1	\N	other	\N	2026-04-24 11:17:00.321901+00	2026-04-26 17:39:41.700792+00	1	alibabacloud
3	阿里云	3	1	\N	other	\N	2026-04-24 11:17:00.321901+00	2026-04-26 17:28:07.592991+00	1	bailian
\.


--
-- Data for Name: model_types; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.model_types (id, name, sort_order, is_active, remark, upstream_type, config, created_at, updated_at, is_system, logo) FROM stdin;
1	视频	1	1	\N	other	\N	2026-04-24 11:17:00.322573+00	2026-04-26 17:40:06.136432+00	1	bilibili
2	图片	2	1	\N	other	\N	2026-04-24 11:17:00.322573+00	2026-04-26 17:30:34.593173+00	1	aionlabs
3	音频	3	1	\N	other	\N	2026-04-24 11:17:00.322573+00	2026-04-26 17:30:40.320912+00	1	antigravity
4	聊天	4	1	\N	other	\N	2026-04-24 11:17:00.322573+00	2026-04-26 17:30:47.263057+00	1	ai360
\.


--
-- Data for Name: models; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.models (id, name, model_id, provider_id, type_id, group_ratios, is_active, remark, upstream_type, config, enable_log_content, forward_rule_ids, billing_rule_id, pre_deduction, created_at, updated_at, mid, site_discount, site_discount_enabled, logo) FROM stdin;
6	gemini3.1	gemini3.1	2	4	null	1	\N	other	\N	0	[13]	7	0	2026-04-26 16:13:49.055492+00	2026-04-27 14:06:52.675051+00	302249	15	1	antigravity
2	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	1	2	null	1	\N	other	\N	1	[6]	8	0	2026-04-25 08:09:40.910973+00	2026-04-27 10:06:37.126895+00	306831	1	0	\N
7	gpt-image	gpt-image	709	2	null	1	\N	other	\N	0	[13]	11	0	2026-04-27 13:59:10.065823+00	2026-04-27 14:04:15.370818+00	307064	1.25	1	openai
1	doubao-seedance-1-5-pro-251215	doubao-seedance-1-5-pro-251215	1	1	null	1	\N	other	\N	1	[9]	2	0	2026-04-25 08:08:14.19038+00	2026-04-25 08:09:45.82987+00	303325	1	0	\N
10	doubao-seedance-2-0-fast-260128	doubao-seedance-2-0-fast-260128	1	1	null	1	\N	other	\N	1	[2]	12	0	2026-04-28 09:05:26.62431+00	2026-04-28 09:44:52.403861+00	303495	1	0	\N
4	doubao2.0	doubao2.0	1	4	null	1	\N	other	\N	0	[14]	4	0	2026-04-26 16:11:55.490413+00	2026-04-26 17:28:43.625532+00	303096	1	0	doubao
11	SC-gpt-image-2	gpt-image-2	709	2	null	1	\N	other	\N	1	[11]	14	0	2026-04-28 11:57:02.400804+00	2026-04-28 11:57:02.400804+00	308651	1	1	\N
12	SC-gemini-3-pro-image-preview	gemini-3-pro-image-preview	2	2	null	1	\N	other	\N	1	[11]	15	0	2026-04-28 11:57:32.252967+00	2026-04-28 11:57:32.252967+00	302146	1	1	\N
13	SC-gemini-3-pro-image-preview-official	gemini-3-pro-image-preview-official	2	2	null	1	\N	other	\N	1	[11]	16	0	2026-04-28 11:57:55.955416+00	2026-04-28 11:57:55.955416+00	305306	1	1	\N
14	SC-gemini-3.1-flash-image-preview	gemini-3.1-flash-image-preview	2	2	null	1	\N	other	\N	1	[11]	17	0	2026-04-28 11:58:26.256153+00	2026-04-28 11:58:26.256153+00	302856	1	1	\N
15	SC-gemini-3.1-flash-image-preview-official	gemini-3.1-flash-image-preview-official	2	2	null	1	\N	other	\N	1	[11]	18	0	2026-04-28 11:58:55.293638+00	2026-04-28 11:58:55.293638+00	301905	1	1	\N
3	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	1	2	null	1	\N	other	\N	0	[13]	5	0	2026-04-26 16:03:36.114672+00	2026-04-26 16:03:36.114672+00	300406	1	0	\N
8	gpt	gptimage2vip	709	2	null	1	\N	other	\N	0	[13]	11	0	2026-04-27 13:59:35.600838+00	2026-04-27 13:59:48.249589+00	302820	1	1	openai
9	doubao-seedance-2-0-260128	doubao-seedance-2-0-260128	1	1	null	1	\N	other	\N	1	[2]	13	0	2026-04-28 09:05:07.251335+00	2026-04-28 09:44:47.547808+00	300997	1	0	\N
5	doubao2.0	doubao2.0	1	4	null	1	\N	other	\N	0	[14]	6	0	2026-04-26 16:13:14.574146+00	2026-04-26 17:31:22.778188+00	305443	1	0	doubao
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.orders (id, out_trade_no, user_id, payment_method, amount, status, trade_no, created_at, paid_at) FROM stdin;
\.


--
-- Data for Name: playground_assets; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.playground_assets (id, project_id, user_id, uid, asset_type, file_name, file_size, file_url, tos_object_key, thumbnail_url, prompt, model_id, model_name, generation_params, canvas_node_data, duration_seconds, width, height, is_deleted, created_at) FROM stdin;
1	4	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777107987_57b03b5e.jpeg	428097	https://s3.artsapi.com/chedev/1001227106/4/images/1777107987_57b03b5e.jpeg	chedev/1001227106/4/images/1777107987_57b03b5e.jpeg		一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":498.763331185724,"y":318.19658354645077}	0	0	0	0	2026-04-25 09:06:28.200502+00
2	4	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777107997_57b03b5e.jpeg	428097	https://s3.artsapi.com/chedev/1001227106/4/images/1777107997_57b03b5e.jpeg	chedev/1001227106/4/images/1777107997_57b03b5e.jpeg		一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":498.763331185724,"y":318.19658354645077}	0	0	0	0	2026-04-25 09:06:38.274523+00
3	4	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777108767_9433a6a1.jpeg	436449	https://s3.artsapi.com/chedev/1001227106/4/images/1777108767_9433a6a1.jpeg	chedev/1001227106/4/images/1777108767_9433a6a1.jpeg		一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":728.7526688276175,"y":351.9667044210592}	0	0	0	0	2026-04-25 09:19:32.589988+00
4	4	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777108771_9433a6a1.jpeg	436449	https://s3.artsapi.com/chedev/1001227106/4/images/1777108771_9433a6a1.jpeg	chedev/1001227106/4/images/1777108771_9433a6a1.jpeg		一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，翘着二郎腿，穿着黑色丝袜和高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":728.7526688276175,"y":351.9667044210592}	0	0	0	0	2026-04-25 09:19:37.837293+00
5	5	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777109068_208a7504.jpeg	497459	https://s3.artsapi.com/chedev/1001227106/5/images/1777109068_208a7504.jpeg	chedev/1001227106/5/images/1777109068_208a7504.jpeg		咋大街上等打车	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"咋大街上等打车"}	{"height":320,"width":480,"x":226.52402100616763,"y":429.9015431339875}	0	0	0	0	2026-04-25 09:24:31.772058+00
6	5	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	image	1777109068_208a7504.jpeg	497459	https://s3.artsapi.com/chedev/1001227106/5/images/1777109068_208a7504.jpeg	chedev/1001227106/5/images/1777109068_208a7504.jpeg		咋大街上等打车	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"咋大街上等打车"}	{"height":320,"width":480,"x":226.52402100616763,"y":429.9015431339875}	0	0	0	0	2026-04-25 09:24:31.92537+00
7	7	92086673-19cd-43e5-81ca-fdf34c06fdaa	1009691764	image	1777110499_a43996f7.jpeg	449350	https://s3.artsapi.com/chedev/1009691764/00000007/images/1777110499_a43996f7.jpeg	chedev/1009691764/00000007/images/1777110499_a43996f7.jpeg		一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":675.3942392025396,"y":473.1083647153175}	0	0	0	0	2026-04-25 09:48:25.365153+00
8	7	92086673-19cd-43e5-81ca-fdf34c06fdaa	1009691764	image	1777110504_a43996f7.jpeg	449350	https://s3.artsapi.com/chedev/1009691764/00000007/images/1777110504_a43996f7.jpeg	chedev/1009691764/00000007/images/1777110504_a43996f7.jpeg		一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":675.3942392025396,"y":473.1083647153175}	0	0	0	0	2026-04-25 09:48:29.92815+00
9	26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	image	1777111650_963b1bee.jpeg	454120	https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111650_963b1bee.jpeg	chedev/1001272266/26694740/images/1777111650_963b1bee.jpeg		一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":698.5270934630272,"y":388.1729574678498}	0	0	0	0	2026-04-25 10:07:39.1088+00
10	26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	image	1777111674_963b1bee.jpeg	454120	https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111674_963b1bee.jpeg	chedev/1001272266/26694740/images/1777111674_963b1bee.jpeg		一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":698.5270934630272,"y":388.1729574678498}	0	0	0	0	2026-04-25 10:08:00.326688+00
11	26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	image	1777111676_ea356b35.jpeg	439344	https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111676_ea356b35.jpeg	chedev/1001272266/26694740/images/1777111676_ea356b35.jpeg		一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":121.331,"y":712.504}	0	0	0	0	2026-04-25 10:08:01.136996+00
12	26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	image	1777111731_ea356b35.jpeg	439344	https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111731_ea356b35.jpeg	chedev/1001272266/26694740/images/1777111731_ea356b35.jpeg		一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"}	{"height":320,"width":480,"x":121.331,"y":712.504}	0	0	0	0	2026-04-25 10:08:55.067584+00
13	26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	image	1777115946_b35f72b4.jpeg	470506	https://s3.artsapi.com/chedev/1001272266/26694740/images/1777115946_b35f72b4.jpeg	chedev/1001272266/26694740/images/1777115946_b35f72b4.jpeg		一个亚洲长发大波浪正面斜着镜头坐在椅子上身材完美比例，一个很舒服的姿势，座子为矜持怕走光的姿势，穿着黑色丝袜和黑色很细跟高跟鞋，低胸白色吊带包臀连衣裙，在咖啡店看着窗外喝咖啡。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上身材完美比例，一个很舒服的姿势，座子为矜持怕走光的姿势，穿着黑色丝袜和黑色很细跟高跟鞋，低胸白色吊带包臀连衣裙，在咖啡店看着窗外喝咖啡。"}	{"height":320,"width":480,"x":667.0430266991393,"y":425.38330715141376}	0	0	0	0	2026-04-25 11:19:09.976103+00
14	94365882	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	1007845943	image	1777122767_ad5d2ce3.jpeg	330985	https://s3.artsapi.com/chedev/1007845943/94365882/images/1777122767_ad5d2ce3.jpeg	chedev/1007845943/94365882/images/1777122767_ad5d2ce3.jpeg		参考图片里面的这个白色的衣服换成蓝色的。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"参考图片里面的这个白色的衣服换成蓝色的。"}	{"height":320,"width":480,"x":374.15715913922327,"y":347.69930721678475}	0	0	0	0	2026-04-25 13:12:51.124136+00
15	46428931	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	image	1777126272_2eacb2e3.jpeg	456760	https://s3.artsapi.com/chedev/1001198464/46428931/images/1777126272_2eacb2e3.jpeg	chedev/1001198464/46428931/images/1777126272_2eacb2e3.jpeg		吧这个任务的的上衣换成黑色	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"吧这个任务的的上衣换成黑色"}	{"height":320,"width":480,"x":348.99022325703254,"y":209.3185614055248}	0	0	0	0	2026-04-25 14:11:13.406694+00
16	46428931	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	image	1777135425_1536e7f4.jpeg	464042	https://s3.artsapi.com/chedev/1001198464/46428931/images/1777135425_1536e7f4.jpeg	chedev/1001198464/46428931/images/1777135425_1536e7f4.jpeg		把我画黄圈的这朵花给它扣除掉。	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"prompt":"把我画黄圈的这朵花给它扣除掉。"}	{"height":320,"width":480,"x":267.4430179149177,"y":204.74455213174937}	0	0	0	0	2026-04-25 16:43:46.121069+00
17	46428931	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	image	1777139507_fe205f0b.jpeg	384006	https://s3.artsapi.com/chedev/1001198464/46428931/images/1777139507_fe205f0b.jpeg	chedev/1001198464/46428931/images/1777139507_fe205f0b.jpeg		一个亚洲美女穿着包臀短裙在照镜子	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_url":"","created_at":"2026-04-25T17:51:40.758Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"一个亚洲美女穿着包臀短裙在照镜子"}	{"height":320,"width":480,"x":371.3454611831569,"y":274.81432849243214}	0	0	0	0	2026-04-25 17:51:47.591932+00
18	46428931	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	image	1777139566_9ed32e07.jpeg	322882	https://s3.artsapi.com/chedev/1001198464/46428931/images/1777139566_9ed32e07.jpeg	chedev/1001198464/46428931/images/1777139566_9ed32e07.jpeg		把这个衣服换成黑色的	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_url":"blob:http://localhost:5173/b068d98a-d162-4b0b-b1de-36ae3d044c36","created_at":"2026-04-25T17:52:30.222Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"把这个衣服换成黑色的"}	{"height":320,"width":480,"x":406.8630671368089,"y":227.85143072730057}	0	0	0	0	2026-04-25 17:52:46.962809+00
19	91262548	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	image	1777140630_2c3af47f.jpeg	358665	https://s3.artsapi.com/chedev/1005510912/91262548/images/1777140630_2c3af47f.jpeg	chedev/1005510912/91262548/images/1777140630_2c3af47f.jpeg		把这个衣服变成白色	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_url":"blob:http://localhost:5173/abde656d-eb7a-4c5c-9500-d9be23caec3c","created_at":"2026-04-25T18:10:22.421Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"把这个衣服变成白色"}	{"height":320,"width":480,"x":392.00591445417086,"y":222.76929021947225}	0	0	0	0	2026-04-25 18:10:30.691937+00
20	91262548	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	image	1777141902_13e95269.jpeg	265637	https://s3.artsapi.com/chedev/1005510912/91262548/images/1777141902_13e95269.jpeg	chedev/1005510912/91262548/images/1777141902_13e95269.jpeg		吧图 2 的衣服换到图 1 上面去	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_urls":["blob:http://localhost:5173/9090451a-8e9b-4c36-8fea-27406b5f4c55","blob:http://localhost:5173/36058951-fb31-4612-813b-ef41be5c62e9"],"created_at":"2026-04-25T18:31:12.854Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"吧图 2 的衣服换到图 1 上面去"}	{"height":320,"width":480,"x":362.709,"y":159.066}	0	0	0	0	2026-04-25 18:31:42.626897+00
21	91262548	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	image	1777142131_48a776d2.jpeg	341557	https://s3.artsapi.com/chedev/1005510912/91262548/images/1777142131_48a776d2.jpeg	chedev/1005510912/91262548/images/1777142131_48a776d2.jpeg		吧图一的上衣换到图二身上	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_urls":["blob:http://localhost:5173/7945087d-9df5-4968-a3b8-0812e6d20d3c","blob:http://localhost:5173/b7b070c3-43ca-4d42-9861-60004b274fc4"],"created_at":"2026-04-25T18:35:02.836Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"吧图一的上衣换到图二身上"}	{"height":320,"width":480,"x":336.1506263914332,"y":258.3501357931112}	0	0	0	0	2026-04-25 18:35:31.962028+00
22	59417944	f41d8242-87f6-4d04-9404-2e44ae001f11	1004255594	image	1777160790_05d9a2c2.jpeg	287207	https://s3.artsapi.com/chedev/1004255594/59417944/images/1777160790_05d9a2c2.jpeg	chedev/1004255594/59417944/images/1777160790_05d9a2c2.jpeg		吧图二的衣服换到图一的模特身上	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	{"attached_url":"blob:http://localhost:5173/5c4cd357-914f-49c9-a119-8189b460ab66","attached_urls":["blob:http://localhost:5173/5c4cd357-914f-49c9-a119-8189b460ab66","blob:http://localhost:5173/6d4051f8-10f7-4baa-a7d8-7607d5b53a09"],"created_at":"2026-04-25T23:45:29.972Z","model_id":"doubao-seedream-4-0-250828","model_name":"doubao-seedream-4-0-250828","prompt":"吧图二的衣服换到图一的模特身上"}	{"height":320,"width":480,"x":441.449,"y":63.4634}	0	0	0	0	2026-04-25 23:47:01.284932+00
23	85630836	348e130f-1955-41ec-953a-c478a901738c	1008709856	video	1777369594_cc049a41.mp4	2437411	https://s3.artsapi.com/chedev/1008709856/85630836/videos/1777369594_cc049a41.mp4	chedev/1008709856/85630836/videos/1777369594_cc049a41.mp4		穿着衣服做出各种摆拍的姿势	doubao-seedance-2-0-fast-260128	doubao-seedance-2-0-fast-260128	{"attached_url":"blob:http://localhost:5173/5dd1b670-b384-473f-9359-fa1c798fb00f","attached_urls":["blob:http://localhost:5173/5dd1b670-b384-473f-9359-fa1c798fb00f"],"created_at":"2026-04-28T09:41:48.615Z","id":"cgt-20260428174157-h54cv","model_id":"doubao-seedance-2-0-fast-260128","model_name":"doubao-seedance-2-0-fast-260128","prompt":"穿着衣服做出各种摆拍的姿势","task_id":"cgt-20260428174157-h54cv"}	{"height":320,"width":480,"x":544.61,"y":276.359}	0	0	0	0	2026-04-28 09:46:39.515273+00
\.


--
-- Data for Name: playground_projects; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.playground_projects (id, user_id, uid, name, description, cover_url, canvas_data, is_deleted, created_at, updated_at) FROM stdin;
4	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	第一个项目		https://s3.artsapi.com/chedev/1001227106/4/images/1777108771_9433a6a1.jpeg	{"nodes":[{"id":"1777107961304","type":"image","status":"completed","x":632.763,"y":300.197,"width":480,"height":320,"zIndex":11,"taskData":{"prompt":"一个亚洲长发大波浪美女，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777107963005ddbe0d776ca28054411b6866ea9771fcdc0db9_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T090615Z&X-Tos-Expires=86400&X-Tos-Signature=5bbadb8a9eb744c83008fca8f58bcd96dea43d73d60ba6ae5f88395f273398c7&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 08:58:38.245199+00	2026-04-25 09:23:09.439582+00
1	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1003645183	未命名项目			{"nodes":[{"id":"1777104890745","type":"video","status":"completed","x":321.901,"y":513.408,"width":480,"height":320,"zIndex":13,"taskData":{"prompt":"一个美女在咖啡店喝咖啡"},"resultData":null},{"id":"1777105021958","type":"video","status":"error","x":105.686,"y":221.983,"width":480,"height":320,"zIndex":12,"taskData":{"prompt":"一个美女在咖啡店喝咖啡"},"resultData":{"message":"No available channels found for model doubao-seedance-1-5-pro-251215"}},{"id":"1777105046327","type":"image","status":"completed","x":788.501,"y":166.562,"width":480,"height":320,"zIndex":14,"taskData":{"prompt":"一个美女在咖啡店喝咖啡"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777105048101ad6686bf264e1cfa8d614a02b293f5e0b62351_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T081735Z&X-Tos-Expires=86400&X-Tos-Signature=f97589bba2a23459ed3853c934d3cb9a95660caee33e4c8cc296ea935442a459&X-Tos-SignedHeaders=host"}]}},{"id":"1777105781550","type":"image","status":"error","x":577.2645564196073,"y":316.26910667197626,"width":480,"height":320,"zIndex":11,"taskData":{"prompt":"一个在咖啡店和咖啡的美女，穿着吊带上衣大波浪卷发的亚洲网红美女"},"resultData":{"message":"Upstream request failed"}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 07:48:38.080085+00	2026-04-25 08:29:49.265815+00
5	fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	打车		https://s3.artsapi.com/chedev/1001227106/5/images/1777109068_208a7504.jpeg	{"nodes":[{"id":"1777109029408","type":"image","status":"completed","x":572.524,"y":400.902,"width":480,"height":320,"zIndex":12,"taskData":{"prompt":"咋大街上等打车"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777109030837c42f47c04edb3ff7f5c9773198a61a0cafa7a8_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T092405Z&X-Tos-Expires=86400&X-Tos-Signature=222fb13605d5de4d3498a273fac4829faa1959c63b4e851e3469d2fd6200beb6&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 09:23:35.006288+00	2026-04-25 09:24:36.370486+00
3	5b2222df-95c2-4e1c-9a29-321d937c1917	1002582048	未命名项目			{"nodes":[],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 08:50:53.788985+00	2026-04-25 08:51:03.009239+00
6	92086673-19cd-43e5-81ca-fdf34c06fdaa	1009691764	未命名项目			{}	0	2026-04-25 09:45:21.349158+00	2026-04-25 09:45:21.349158+00
2	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1003645183	未命名项目			{"nodes":[{"id":"1777105937567","type":"image","status":"error","x":576.343,"y":423.883,"width":260,"height":191,"zIndex":14,"taskData":{"prompt":"一个咖啡店和咖啡的亚洲美女"},"resultData":{"message":"Upstream request failed"}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 08:29:50.515115+00	2026-04-27 15:52:02.45712+00
7	92086673-19cd-43e5-81ca-fdf34c06fdaa	1009691764	未命名项目		https://s3.artsapi.com/chedev/1009691764/00000007/images/1777110504_a43996f7.jpeg	{"nodes":[{"id":"1777110380365","type":"image","status":"completed","x":360.853,"y":331.897,"width":480,"height":320,"zIndex":12,"taskData":{"prompt":"一个亚洲长发大波浪美女侧身坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，短裙，穿着吊带的白色上衣，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771103811698c8bbeccabd2a8badabcecc7b49ff2427ddb60_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T094626Z&X-Tos-Expires=86400&X-Tos-Signature=6f081d83a57da4a18620ab60f9fcc4eed76436c655dba9e9f1094b93c64ed410&X-Tos-SignedHeaders=host"}]}},{"id":"1777110483006","type":"image","status":"completed","x":675.3942392025396,"y":473.1083647153175,"width":480,"height":320,"zIndex":13,"taskData":{"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色细跟高跟鞋，黑色蕾丝吊带包臀连衣裙。，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777110483880b556cf4da499f5769ee5b78217b3f91a3fd89c_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T094810Z&X-Tos-Expires=86400&X-Tos-Signature=1246ce5901dd4e0f8d3c75dadb202049231da4bf601a4664b8d58bd69f67966f&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 09:45:21.353038+00	2026-04-25 09:48:29.932887+00
39274905	e84fb6df-d137-4a6a-9b97-4acc88c1e24b	1004651392	未命名项目			{}	0	2026-04-25 09:50:05.347955+00	2026-04-25 09:50:05.347955+00
39280600	e84fb6df-d137-4a6a-9b97-4acc88c1e24b	1004651392	未命名项目			{}	0	2026-04-25 09:50:05.352723+00	2026-04-25 09:50:05.352723+00
26694740	47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	未命名项目		https://s3.artsapi.com/chedev/1001272266/26694740/images/1777115946_b35f72b4.jpeg	{"nodes":[{"id":"asset-12","type":"image","status":"completed","x":77.331,"y":814.504,"width":480,"height":320,"zIndex":50,"taskData":{"prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111731_ea356b35.jpeg"}]}},{"id":"asset-11","type":"image","status":"completed","x":320.331,"y":468.504,"width":480,"height":320,"zIndex":45,"taskData":{"prompt":"一个长发大波浪亚洲模特网红美女正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111676_ea356b35.jpeg"}]}},{"id":"asset-10","type":"image","status":"completed","x":682.527,"y":684.173,"width":480,"height":320,"zIndex":11,"taskData":{"prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111674_963b1bee.jpeg"}]}},{"id":"asset-9","type":"image","status":"completed","x":732.527,"y":224.173,"width":480,"height":320,"zIndex":14,"taskData":{"prompt":"一个长发大波浪正面斜着镜头坐在椅子上，一个很舒服的姿势，翘着二郎腿，穿着黑色丝袜和黑色红底细跟高跟鞋，白色蕾丝吊带包臀连衣裙，露出双肩在咖啡店喝咖啡。"},"resultData":{"data":[{"url":"https://s3.artsapi.com/chedev/1001272266/26694740/images/1777111650_963b1bee.jpeg"}]}},{"id":"17771159250960n3w","type":"image","status":"completed","x":180.043,"y":134.383,"width":480,"height":320,"zIndex":13,"taskData":{"prompt":"一个亚洲长发大波浪正面斜着镜头坐在椅子上身材完美比例，一个很舒服的姿势，座子为矜持怕走光的姿势，穿着黑色丝袜和黑色很细跟高跟鞋，低胸白色吊带包臀连衣裙，在咖啡店看着窗外喝咖啡。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771159273999e9a0f81d29869daa108a627170bdfb2e3b841_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T111855Z&X-Tos-Expires=86400&X-Tos-Signature=a3cb1e0e8a4c9c3fea00cdafdd0444c00308a032b38c4ccdb118dd615df361be&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 09:53:35.878497+00	2026-04-25 12:58:40.529715+00
94365882	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	1007845943	未命名项目		https://s3.artsapi.com/chedev/1007845943/94365882/images/1777122767_ad5d2ce3.jpeg	{"nodes":[{"id":"1777122744677asu3","type":"image","status":"completed","x":339.157,"y":536.699,"width":480,"height":320,"zIndex":13,"taskData":{"prompt":"参考图片里面的这个白色的衣服换成蓝色的。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777122746651fa647a4e0ad2c514964a6296626d67a0d15d3e_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T131233Z&X-Tos-Expires=86400&X-Tos-Signature=3053e9e78bfbb9d462ef4570c3f56be94f4bc2d6700ade7c356d09b4facc76d2&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 13:11:27.118351+00	2026-04-25 13:19:10.441302+00
59417944	f41d8242-87f6-4d04-9404-2e44ae001f11	1004255594	未命名项目		https://s3.artsapi.com/chedev/1004255594/59417944/images/1777160790_05d9a2c2.jpeg	{"nodes":[{"id":"1777160729972loa2","type":"image","status":"completed","x":481.449,"y":168.463,"width":243,"height":232,"zIndex":30,"taskData":{"prompt":"吧图二的衣服换到图一的模特身上","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_urls":["blob:http://localhost:5173/5c4cd357-914f-49c9-a119-8189b460ab66","blob:http://localhost:5173/6d4051f8-10f7-4baa-a7d8-7607d5b53a09"],"created_at":"2026-04-25T23:45:29.972Z","attached_url":"blob:http://localhost:5173/5c4cd357-914f-49c9-a119-8189b460ab66"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/0217771607336225de161b16d50149cbf4122a430bab0f06f709d_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T234621Z&X-Tos-Expires=86400&X-Tos-Signature=05ecfb603b78432f2b272cac6dc5e5849680c89bd29f70705dafec7030f77aa3&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 23:39:19.991096+00	2026-04-26 15:26:07.619887+00
46413014	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	未命名项目			{"nodes":[{"id":"1777140321138nk77","type":"image","status":"error","x":401.34508199340286,"y":268.3116623061023,"width":480,"height":320,"zIndex":11,"taskData":{"prompt":"参考图的姿势，一个穿着黑色吊带连衣短裙的美女","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_url":"blob:http://localhost:5173/7577418d-bc12-4f3c-845c-fbefdb4146dc","created_at":"2026-04-25T18:05:21.138Z"},"resultData":{"message":"Request failed with status code 502"}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 18:01:50.885887+00	2026-04-25 18:05:23.866716+00
18310775	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1003645183	未命名项目			{}	0	2026-04-28 08:48:19.173436+00	2026-04-28 08:48:19.173436+00
46428931	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	未命名项目		https://s3.artsapi.com/chedev/1001198464/46428931/images/1777139566_9ed32e07.jpeg	{"nodes":[{"id":"1777126256652e0o0","type":"image","status":"completed","x":405.99,"y":105.319,"width":480,"height":320,"zIndex":21,"taskData":{"prompt":"吧这个任务的的上衣换成黑色"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777126258103a65bb9cc875deec710c23fb9efaa4f4b46d309_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T141107Z&X-Tos-Expires=86400&X-Tos-Signature=f896c429bd057196823c3e5cc7dbfa6c342d2794175f8177591636f5c2976303&X-Tos-SignedHeaders=host"}]}},{"id":"1777135414282xdrr","type":"image","status":"completed","x":796.443,"y":339.745,"width":480,"height":320,"zIndex":15,"taskData":{"prompt":"把我画黄圈的这朵花给它扣除掉。"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777135414719c57e78ec35a4c62cb30347d58d08558fc646a9_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T164345Z&X-Tos-Expires=86400&X-Tos-Signature=df34b9ae2ea384ed7cdba5e912602ac85ec5bc49be1515497a0cea4f7aec5f95&X-Tos-SignedHeaders=host"}]}},{"id":"17771395007583935","type":"image","status":"completed","x":581.345,"y":383.814,"width":480,"height":320,"zIndex":17,"taskData":{"prompt":"一个亚洲美女穿着包臀短裙在照镜子","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_url":"","created_at":"2026-04-25T17:51:40.758Z"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777139501060e3fc3002f37f70960f01c9f37bff6e8235c533_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T175146Z&X-Tos-Expires=86400&X-Tos-Signature=916091f629eb37714df8abb339846190dbddfe88a41f11c4e2ae2e8eeac1f35d&X-Tos-SignedHeaders=host"}]}},{"id":"1777139550222ljdk","type":"image","status":"completed","x":570.863,"y":356.851,"width":480,"height":320,"zIndex":20,"taskData":{"prompt":"把这个衣服换成黑色的","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_url":"blob:http://localhost:5173/b068d98a-d162-4b0b-b1de-36ae3d044c36","created_at":"2026-04-25T17:52:30.222Z"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777139550443e3fc3002f37f70960f01c9f37bff6e82e86825_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T175246Z&X-Tos-Expires=86400&X-Tos-Signature=10f194e85f1151270f2cbe02f30f6e38284b07360041a27191d145f7ffe902fa&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 14:04:16.072237+00	2026-04-25 18:09:24.220604+00
91225190	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	未命名项目			{"nodes":[],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 23:31:28.406348+00	2026-04-25 23:38:27.8268+00
91251036	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	未命名项目			{"nodes":[{"id":"1777159934562c66y","type":"image","status":"error","x":339.9484288300774,"y":217.64387596932855,"width":480,"height":320,"zIndex":11,"taskData":{"prompt":"使用图二的衣服换成图一里面任务的衣服","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_urls":["blob:http://localhost:5173/e6429a9f-e98d-4658-b154-2e91bf03a6d7","blob:http://localhost:5173/8d3a2b6b-6bf3-44bc-a799-35d368862946"],"created_at":"2026-04-25T23:32:14.562Z"},"resultData":{"message":"setAttachedAssets is not defined"}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-25 23:31:35.723014+00	2026-04-25 23:33:29.099631+00
91262548	4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	未命名项目		https://s3.artsapi.com/chedev/1005510912/91262548/images/1777142131_48a776d2.jpeg	{"nodes":[{"id":"1777140622421kmmn","type":"image","status":"completed","x":367.006,"y":206.769,"width":480,"height":320,"zIndex":13,"taskData":{"prompt":"把这个衣服变成白色","model_name":"doubao-seedream-4-0-250828","model_id":"doubao-seedream-4-0-250828","attached_url":"blob:http://localhost:5173/abde656d-eb7a-4c5c-9500-d9be23caec3c","created_at":"2026-04-25T18:10:22.421Z"},"resultData":{"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021777140622798b6043c5851c0a2627b25b78c406cf304277cea_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260425%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260425T181029Z&X-Tos-Expires=86400&X-Tos-Signature=d1a9cee9fb3ab854c6d335692f3e1d304064758b2e59ecc059bb16aef63142cd&X-Tos-SignedHeaders=host"}]}}],"transform":{"x":102.19828903619612,"y":-44.12423540798284,"scale":1}}	0	2026-04-25 18:09:54.415102+00	2026-04-25 23:38:18.81927+00
82029371	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{"nodes":[{"id":"1777371804131vbod","type":"video","status":"completed","x":709.686,"y":191.385,"width":374,"height":657,"zIndex":18,"taskData":{"prompt":"全身视频展示图一和图二不同的穿搭。","model_name":"doubao-seedance-2-0-fast-260128","model_id":"doubao-seedance-2-0-fast-260128","attached_urls":["https://s3.artsapi.com/chedev/1008706820/82029371/references/1777371804_73804359.jpg","https://s3.artsapi.com/chedev/1008706820/82029371/references/1777371804_f729c56e.png"],"created_at":"2026-04-28T10:23:24.132Z","attached_url":"https://s3.artsapi.com/chedev/1008706820/82029371/references/1777371804_73804359.jpg","task_id":"cgt-20260428182351-vrks5","id":"cgt-20260428182351-vrks5"},"resultData":{"content":{"video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0-fast/02177737191825300000000000000000000ffffac177f5f89185a.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260428%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260428T102640Z&X-Tos-Expires=86400&X-Tos-Signature=a5893a1812213e6a24c3c2fe6d750856088268cef494fa33d2e2abacaa8c4f59&X-Tos-SignedHeaders=host"}}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-28 10:14:36.53072+00	2026-04-28 11:45:20.9715+00
85630836	348e130f-1955-41ec-953a-c478a901738c	1008709856	未命名项目		https://s3.artsapi.com/chedev/1008709856/85630836/videos/1777369594_cc049a41.mp4	{"nodes":[{"id":"1777367546556ltwp","type":"video","status":"error","x":64.249,"y":697.738,"width":480,"height":320,"zIndex":15,"taskData":{"prompt":"穿着衣服做出各种摆拍的姿势","model_name":"doubao-seedance-2-0-fast-260128","model_id":"doubao-seedance-2-0-fast-260128","attached_urls":["blob:http://localhost:5173/d39418b0-ad2d-4a83-8cf3-65895e6738d5"],"created_at":"2026-04-28T09:12:26.557Z","attached_url":"blob:http://localhost:5173/d39418b0-ad2d-4a83-8cf3-65895e6738d5"},"resultData":{"message":"Upstream request failed"}},{"id":"1777369308615e6gg","type":"video","status":"completed","x":544.61,"y":276.359,"width":773,"height":504,"zIndex":22,"taskData":{"prompt":"穿着衣服做出各种摆拍的姿势","model_name":"doubao-seedance-2-0-fast-260128","model_id":"doubao-seedance-2-0-fast-260128","attached_urls":["blob:http://localhost:5173/5dd1b670-b384-473f-9359-fa1c798fb00f"],"created_at":"2026-04-28T09:41:48.615Z","attached_url":"blob:http://localhost:5173/5dd1b670-b384-473f-9359-fa1c798fb00f","task_id":"cgt-20260428174157-h54cv","id":"cgt-20260428174157-h54cv"},"resultData":{"content":{"video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0-fast/02177736937447700000000000000000000ffffac1823a398f6bd.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260428%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260428T094436Z&X-Tos-Expires=86400&X-Tos-Signature=3bb58d3a0c2f53d2d548896b562e4610a6dfd8ae500bbfd6b8256052653e17c2&X-Tos-SignedHeaders=host"}}}],"transform":{"x":0,"y":0,"scale":1}}	0	2026-04-28 09:06:58.253971+00	2026-04-28 10:06:59.75181+00
82059876	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:11:12.982286+00	2026-04-28 11:45:10.52583+00
82022638	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{"nodes":[],"transform":{"x":0,"y":0,"scale":1}}	1	2026-04-28 10:07:27.944867+00	2026-04-28 10:09:53.762791+00
82067635	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{"nodes":[],"transform":{"x":0,"y":0,"scale":1}}	1	2026-04-28 10:09:43.619653+00	2026-04-28 10:09:54.659878+00
82089354	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:09:54.712128+00	2026-04-28 10:09:55.723325+00
82072314	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:09:55.773546+00	2026-04-28 10:09:56.245577+00
82050010	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:09:56.290858+00	2026-04-28 10:09:56.450015+00
82072246	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:09:56.674537+00	2026-04-28 10:10:00.082945+00
82021389	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:10:00.132602+00	2026-04-28 10:10:27.234225+00
82081369	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:10:27.2838+00	2026-04-28 10:10:27.395266+00
82094669	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:10:27.657186+00	2026-04-28 10:10:30.23062+00
82019619	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:10:30.280581+00	2026-04-28 10:10:30.948269+00
82020905	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:10:31.002333+00	2026-04-28 10:11:12.230022+00
82080752	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:11:12.282134+00	2026-04-28 10:11:12.534252+00
82017913	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{}	1	2026-04-28 10:11:12.578621+00	2026-04-28 10:11:12.70947+00
82081986	a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	未命名项目			{"nodes":[],"transform":{"x":0,"y":0,"scale":1}}	1	2026-04-28 10:14:39.463778+00	2026-04-28 11:45:12.371881+00
\.


--
-- Data for Name: plugin_api_logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_api_logs (id, user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, created_at, source) FROM stdin;
1	348e130f-1955-41ec-953a-c478a901738c	asset_manager	CreateAssetGroup	{"Name":"tokensbyte_auto_generated_group","Description":"由 Tokensbyte 系统自动生成的转换素材专用群组","GroupType":"AIGC","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281712273DDAF7623AB630AF4C32","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260428171227-xqt4n"}}	200	2026-04-28 09:12:27.320488+00	relay_convert
2	348e130f-1955-41ec-953a-c478a901738c	asset_manager	CreateAsset	{"GroupId":"group-20260428171227-xqt4n","URL":"https://s3.artsapi.com/chedev/_tmp_asset_convert/c5d6ea9e22ed94d5.jpg","AssetType":"Image","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281712279B52BA402C33FBAF93FE","Action":"CreateAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428171228-pggnq"}}	200	2026-04-28 09:12:28.616536+00	relay_convert
3	348e130f-1955-41ec-953a-c478a901738c	asset_manager	GetAsset	{"Id":"asset-20260428171228-pggnq","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"2026042817123167A45EB4528919AEE246","Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428171228-pggnq","Name":"","URL":"https://ark-media-asset.tos-cn-beijing.volces.com/2123777871/042817122705262710.jpg?X-Tos-Algorithm=TOS4-HMAC-SHA256\\u0026X-Tos-Credential=AKTP0VyX37NH37peqQWqz0vNouQi6qpajQM1B8HrBBVeiY%2F20260428%2Fcn-beijing%2Ftos%2Frequest\\u0026X-Tos-Date=20260428T091231Z\\u0026X-Tos-Expires=43200\\u0026X-Tos-Security-Token=nChBvMlNIdFphUGtMcUtHWld2.CiQKEHVNU1JGYmN4M1BjUm9iVlMSEG45j-FtM0q6lsaYUDXALYIQ0djAzwYYv6fDzwYg-v3I6QcoBDCs7-stOh9Sb2xlRm9yQXJrQXNzZXQvUm9sZUZvckFya0Fzc2V0QgNhcmtSD1JvbGVGb3JBcmtBc3NldFgDegNhcms.ua0KSlp-xexQr95eJEN0FcZOcCnnxr8JGHbd7Vg5lM4srWO-JGdk6n7JnanTYF0smeVBvyDNbosVRGKEB2qZrg\\u0026X-Tos-Signature=cdef8c2f92f2ee90316950b3d468a94481e7157aea56dfcc0a06760b0e4004af\\u0026X-Tos-SignedHeaders=host","AssetType":"Image","GroupId":"group-20260428171227-xqt4n","Status":"Active","CreateTime":"2026-04-28T09:12:28Z","UpdateTime":"2026-04-28T09:12:31Z","ProjectName":"xinhankr_token"}}	200	2026-04-28 09:12:31.778156+00	relay_convert
4	348e130f-1955-41ec-953a-c478a901738c	asset_manager	CreateAsset	{"GroupId":"group-20260428171227-xqt4n","URL":"https://s3.artsapi.com/chedev/_tmp_asset_convert/353260c2a842e382.jpg","AssetType":"Image","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281741521A03C8BB1519F6ACAF2D","Action":"CreateAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428174153-lmbk8"}}	200	2026-04-28 09:41:53.055038+00	relay_convert
5	348e130f-1955-41ec-953a-c478a901738c	asset_manager	GetAsset	{"Id":"asset-20260428174153-lmbk8","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281741561A03C8BB1519F6ACAFA8","Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428174153-lmbk8","Name":"","URL":"https://ark-media-asset.tos-cn-beijing.volces.com/2123777871/042817415265516355.jpg?X-Tos-Algorithm=TOS4-HMAC-SHA256\\u0026X-Tos-Credential=AKTP0VyX37NH37peqQWqz0vNr9RzX2UmtsdAh4SkgWypX3%2F20260428%2Fcn-beijing%2Ftos%2Frequest\\u0026X-Tos-Date=20260428T094156Z\\u0026X-Tos-Expires=43200\\u0026X-Tos-Security-Token=nChBvMlNIdFphUGtMcUtHWld2.CiQKEHVNU1JGYmN4M1BjUm9iVlMSELfmFJhOeEWOrHvMjHpS-C0QttPAzwYYh6HDzwYg-v3I6QcoBDCs7-stOh9Sb2xlRm9yQXJrQXNzZXQvUm9sZUZvckFya0Fzc2V0QgNhcmtSD1JvbGVGb3JBcmtBc3NldFgDegNhcms.pwDnp7--4UPtfaf_buol5OLvHKnM6Jt1PINzezqBgCTo3KUyV9NW7Pp1EZ6QutWlwy0Jor3TvncT7Ob-Jv_uYw\\u0026X-Tos-Signature=c89bd863922c7ba9571ac517887b8ce79b404ccaf0e4a2edf5ff71ad15e37682\\u0026X-Tos-SignedHeaders=host","AssetType":"Image","GroupId":"group-20260428171227-xqt4n","Status":"Active","CreateTime":"2026-04-28T09:41:53Z","UpdateTime":"2026-04-28T09:41:55Z","ProjectName":"xinhankr_token"}}	200	2026-04-28 09:41:56.214805+00	relay_convert
6	a8a92839-ab28-475e-acd7-b656a198b03d	asset_manager	CreateAsset	{"GroupId":"group-20260428171227-xqt4n","URL":"https://s3.artsapi.com/chedev/_tmp_asset_convert/73804359a16d1843.jpg","AssetType":"Image","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281823441A1E072C869FCB89A616","Action":"CreateAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428182345-mr4jz"}}	200	2026-04-28 10:23:45.48684+00	relay_convert
7	a8a92839-ab28-475e-acd7-b656a198b03d	asset_manager	GetAsset	{"Id":"asset-20260428182345-mr4jz","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"202604281823481A1E072C869FCB89A645","Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260428182345-mr4jz","Name":"","URL":"https://ark-media-asset.tos-cn-beijing.volces.com/2123777871/042818234425108291.jpg?X-Tos-Algorithm=TOS4-HMAC-SHA256\\u0026X-Tos-Credential=AKTP0VyX37NH37peqQWqz0vNry1o3VZ8CqqS9y7MfRLEYG%2F20260428%2Fcn-beijing%2Ftos%2Frequest\\u0026X-Tos-Date=20260428T102348Z\\u0026X-Tos-Expires=43200\\u0026X-Tos-Security-Token=nChBvMlNIdFphUGtMcUtHWld2.CiQKEHVNU1JGYmN4M1BjUm9iVlMSENKzzPeus06kmweJ7tAAfWwQ8djAzwYYoqrDzwYg-v3I6QcoBDCs7-stOh9Sb2xlRm9yQXJrQXNzZXQvUm9sZUZvckFya0Fzc2V0QgNhcmtSD1JvbGVGb3JBcmtBc3NldFgDegNhcms.dVkgE-FLYayPQkv1jiFptueUKhNEOV7L-7t7bR2y2AMSPnflsVc5HNpBdBuDeJzvMeKoVPDh6dIxP2h09rwFxA\\u0026X-Tos-Signature=c12f064139e7519c74c073f8a3439523f2ef8a1102c193775a8bfce704ab6484\\u0026X-Tos-SignedHeaders=host","AssetType":"Image","GroupId":"group-20260428171227-xqt4n","Status":"Active","CreateTime":"2026-04-28T10:23:45Z","UpdateTime":"2026-04-28T10:23:48Z","ProjectName":"xinhankr_token"}}	200	2026-04-28 10:23:48.652973+00	relay_convert
8	464fdb02-5e2f-4979-89d1-77da502682f6	asset_manager	CreateAssetGroup	{"Name":"dsdsd","Description":"sdsd","GroupType":"AIGC","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"20260428203150A69B2FCA6A3D51D5881F","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260428203150-hwlpk"}}	200	2026-04-28 12:31:50.772461+00	page
9	464fdb02-5e2f-4979-89d1-77da502682f6	asset_manager	DeleteAssetGroup	{"Id":"local_39b3770a4875478a8fb89018232b19f7","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"20260428203223448154F37D6D32D082CA","Action":"DeleteAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"NotFound.group_id","Message":"The specified asset_group local_39b3770a4875478a8fb89018232b19f7 is not found.","Data":{"__Message.parameter":"group_id","__Message.resourceContent":"local_39b3770a4875478a8fb89018232b19f7","__Message.resourceType":"asset_group"}}}}	404	2026-04-28 12:32:23.843481+00	page
10	464fdb02-5e2f-4979-89d1-77da502682f6	asset_manager	DeleteAssetGroup	{"Id":"local_533db20ed9f542a3b439344e551b9936","ProjectName":"xinhankr_token"}	{"ResponseMetadata":{"RequestId":"20260428203235DF452783760E8028F670","Action":"DeleteAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"NotFound.group_id","Message":"The specified asset_group local_533db20ed9f542a3b439344e551b9936 is not found.","Data":{"__Message.parameter":"group_id","__Message.resourceContent":"local_533db20ed9f542a3b439344e551b9936","__Message.resourceType":"asset_group"}}}}	404	2026-04-28 12:32:35.109945+00	page
\.


--
-- Data for Name: plugin_asset_groups; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_asset_groups (id, user_id, group_id, name, description, created_at, updated_at) FROM stdin;
1	47aaabf0-7e6a-42a1-a951-bdec068f3024	local_2088db4d4251406ebbb9dd47e7e8e4d7	1313	231321	2026-04-25 12:40:05.885982+00	2026-04-25 12:40:05.885982+00
2	47aaabf0-7e6a-42a1-a951-bdec068f3024	local_84b825b34b9042179f5f825e8c5c5a54	654646	5541	2026-04-25 12:50:45.852285+00	2026-04-25 12:50:45.852285+00
3	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	local_228fd2dda89f45cf86f14a07fb7b1566	34234	4234234	2026-04-25 13:02:41.732013+00	2026-04-25 13:02:41.732013+00
4	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	local_a0b5972522fc41cb810607492e0b6c09	vcvxcv	vcxv	2026-04-25 13:04:22.159855+00	2026-04-25 13:04:22.159855+00
5	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	local_574186ca0dcb4658a6b6e95a4f203dd5	jkll	kjlj	2026-04-25 14:04:53.560304+00	2026-04-25 14:04:53.560304+00
6	4d77d157-71aa-409a-adf2-19ade50ed63e	local_dbb697931d35493292ed402c43758466	5555	555	2026-04-27 02:35:42.653594+00	2026-04-27 02:35:42.653594+00
7	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	local_67455c5fe7304cb48ca396873ccb2a16	132132	13213	2026-04-28 08:40:04.303394+00	2026-04-28 08:40:04.303394+00
9	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	local_5a5e11eec5cc4cf78c1543ee698d7386	43413	1321	2026-04-28 08:40:21.571728+00	2026-04-28 08:40:21.571728+00
11	a8a92839-ab28-475e-acd7-b656a198b03d	local_ff6e45583721421a8a5ab551d538c5c5	dsds	dsdsd	2026-04-28 11:47:07.30431+00	2026-04-28 11:47:07.30431+00
14	464fdb02-5e2f-4979-89d1-77da502682f6	group-20260428203150-hwlpk	dsdsd	sdsd	2026-04-28 12:31:54.819099+00	2026-04-28 12:31:54.819099+00
\.


--
-- Data for Name: plugin_assets; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_assets (id, user_id, asset_type, source, status, file_name, file_url, mime_type, size, reject_reason, category, asset_id, sort_order, remark, group_id, created_at, updated_at, content_hash) FROM stdin;
1	47aaabf0-7e6a-42a1-a951-bdec068f3024	image	user	approved	0217769037012957f1f09e6949e321cbab1c5b2431983258b0e11_0.jpeg	https://s3.artsapi.com/chedev/1001272266/1313/ffad30a7-6682-453d-93c6-33c9af4c6559.jpeg	image/jpeg	479142	\N	虚拟人像	\N	0	\N	local_2088db4d4251406ebbb9dd47e7e8e4d7	2026-04-25 12:40:22.986937+00	2026-04-25 12:40:22.986937+00	\N
2	47aaabf0-7e6a-42a1-a951-bdec068f3024	image	user	approved	QQ20260420-004532.png	https://s3.artsapi.com/chedev/1001272266/1313/df0afaba-08b8-4582-8a0e-a49bb3c81c3e.png	image/png	3262085	\N	虚拟人像	\N	0	\N	local_2088db4d4251406ebbb9dd47e7e8e4d7	2026-04-25 12:41:17.21288+00	2026-04-25 12:41:17.21288+00	\N
3	47aaabf0-7e6a-42a1-a951-bdec068f3024	image	user	approved	057003001663.jpg	https://s3.artsapi.com/chedev/1001272266/1313/b8d36108-a70e-4dbd-9343-fbb2e12282a6.jpg	image/jpeg	115180	\N	虚拟人像	\N	0	\N	local_2088db4d4251406ebbb9dd47e7e8e4d7	2026-04-25 12:50:28.75397+00	2026-04-25 12:50:28.75397+00	\N
4	47aaabf0-7e6a-42a1-a951-bdec068f3024	image	user	approved	4ad0cc456ec4677e0de2c7ffa1fbbf86.jpg	https://s3.artsapi.com/chedev/1001272266/654646/9cf1df26-373f-4d0c-9fcc-45821be8cd08.jpg	image/jpeg	551122	\N	虚拟人像	\N	0	\N	local_84b825b34b9042179f5f825e8c5c5a54	2026-04-25 12:50:57.35543+00	2026-04-25 12:50:57.35543+00	\N
5	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	image	user	approved	06.jpg	https://s3.artsapi.com/chedev/1007845943/34234/898c63f5-9cbc-4a3a-9d70-cc4523d6cc25.jpg	image/jpeg	94924	\N	虚拟人像	\N	0	\N	local_228fd2dda89f45cf86f14a07fb7b1566	2026-04-25 13:02:49.512248+00	2026-04-25 13:02:49.512248+00	\N
6	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	image	user	approved	0217769037012957f1f09e6949e321cbab1c5b2431983258b0e11_0.jpeg	https://s3.artsapi.com/chedev/1007845943/vcvxcv/080adb59-4152-4c19-bd67-c49624ff84f1.jpeg	image/jpeg	479142	\N	虚拟人像	\N	0	\N	local_a0b5972522fc41cb810607492e0b6c09	2026-04-25 13:05:01.934635+00	2026-04-25 13:05:01.934635+00	\N
7	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	image	user	approved	0490020005873.jpg	https://s3.artsapi.com/chedev/1001198464/jkll/1abc2359-8344-4c25-8274-ac4998de5d5d.jpg	image/jpeg	180125	\N	虚拟人像	\N	0	\N	local_574186ca0dcb4658a6b6e95a4f203dd5	2026-04-25 14:05:11.291834+00	2026-04-25 14:05:11.291834+00	\N
8	4d77d157-71aa-409a-adf2-19ade50ed63e	image	user	approved	06.jpg	https://s3.artsapi.com/chedev/1005510912/5555/9c4398f8-76f5-48fc-a96d-5b49701c7b3a.jpg	image/jpeg	94924	\N	虚拟人像	\N	0	\N	local_dbb697931d35493292ed402c43758466	2026-04-27 02:37:55.468997+00	2026-04-27 02:37:55.468997+00	\N
9	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	image	user	approved	4ad0cc456ec4677e0de2c7ffa1fbbf86.jpg	https://s3.artsapi.com/chedev/1003645183/43413/0538db3e-83d1-4a0a-a2d5-779a4b7418d2.jpg	image/jpeg	551122	\N	虚拟人像	\N	0	\N	local_5a5e11eec5cc4cf78c1543ee698d7386	2026-04-28 08:41:53.142837+00	2026-04-28 08:41:53.142837+00	\N
11	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	image	user	approved	24yjk_matchup_woven_hood_detail_01_01.jpg	https://s3.artsapi.com/chedev/1003645183/132132/03b731c6-9c8c-4b41-9da3-6554dd71a960.jpg	image/jpeg	202044	\N	虚拟人像	\N	0	\N	local_67455c5fe7304cb48ca396873ccb2a16	2026-04-28 08:42:11.133073+00	2026-04-28 08:42:11.133073+00	\N
12	348e130f-1955-41ec-953a-c478a901738c	image	relay_convert	approved	c5d6ea9e22ed94d5.jpg	https://s3.artsapi.com/chedev/_tmp_asset_convert/c5d6ea9e22ed94d5.jpg	\N	\N	\N	转换素材	asset-20260428171228-pggnq	0	\N	\N	2026-04-28 09:12:31.778156+00	2026-04-28 09:12:31.778156+00	c5d6ea9e22ed94d51275d9c4710377edb41347096bb831b5d16c60ccb28479e2
13	348e130f-1955-41ec-953a-c478a901738c	image	relay_convert	approved	353260c2a842e382.jpg	https://s3.artsapi.com/chedev/_tmp_asset_convert/353260c2a842e382.jpg	\N	\N	\N	转换素材	asset-20260428174153-lmbk8	0	\N	\N	2026-04-28 09:41:56.214585+00	2026-04-28 09:41:56.214585+00	353260c2a842e3828f0883a6dbee0bd2b5372e99769bcf0e88551cef151adc71
14	a8a92839-ab28-475e-acd7-b656a198b03d	image	relay_convert	approved	73804359a16d1843.jpg	https://s3.artsapi.com/chedev/_tmp_asset_convert/73804359a16d1843.jpg	\N	\N	\N	转换素材	asset-20260428182345-mr4jz	0	\N	\N	2026-04-28 10:23:48.652979+00	2026-04-28 10:23:48.652979+00	73804359a16d1843d080e2fb3a00767579fed101db9a85fafbb1f69c64062a26
\.


--
-- Data for Name: plugin_configs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_configs (id, plugin_name, config_key, config_value, created_at, updated_at) FROM stdin;
1	playground	default_quota	100	2026-04-25 04:25:25.40937+00	2026-04-25 04:25:25.40937+00
2	playground	max_folders	20	2026-04-25 04:25:25.413173+00	2026-04-25 04:25:25.413173+00
3	playground	max_files_per_folder	100	2026-04-25 04:25:25.417745+00	2026-04-25 04:25:25.417745+00
4	playground	api_enabled_default	true	2026-04-25 04:25:25.42072+00	2026-04-25 04:25:25.42072+00
5	playground	api_enabled	true	2026-04-25 04:25:25.423976+00	2026-04-25 04:25:25.423976+00
6	team_marketing	default_quota	100	2026-04-25 04:36:30.379765+00	2026-04-25 04:36:30.379765+00
7	team_marketing	max_folders	20	2026-04-25 04:36:30.38119+00	2026-04-25 04:36:30.38119+00
8	team_marketing	max_files_per_folder	100	2026-04-25 04:36:30.382983+00	2026-04-25 04:36:30.382983+00
9	team_marketing	api_enabled_333	true	2026-04-25 04:36:30.385679+00	2026-04-25 04:36:30.385679+00
10	team_marketing	api_enabled_33	true	2026-04-25 04:36:30.387171+00	2026-04-25 04:36:30.387171+00
11	team_marketing	api_enabled_5365416	true	2026-04-25 04:36:30.388642+00	2026-04-25 04:36:30.388642+00
12	team_marketing	api_enabled_default	true	2026-04-25 04:36:30.39003+00	2026-04-25 04:36:30.39003+00
13	team_marketing	api_enabled	true	2026-04-25 04:36:30.391279+00	2026-04-25 04:36:30.391279+00
16	playground	tos_access_key	AKLTNzFjODM1NTVkZjBhNDU0MWIzZTg1YjRmZDQxMGQ1ZjM	2026-04-25 08:28:11.037365+00	2026-04-25 08:28:11.037365+00
17	playground	tos_endpoint	https://tos-cn-guangzhou.volces.com	2026-04-25 08:28:11.062553+00	2026-04-25 08:28:11.062553+00
18	playground	tos_region	cn-guangzhou	2026-04-25 08:28:11.08985+00	2026-04-25 08:28:11.08985+00
19	playground	tos_bucket	s3arts	2026-04-25 08:28:11.106987+00	2026-04-25 08:28:11.106987+00
20	playground	tos_path_prefix	chedev	2026-04-25 08:28:11.125078+00	2026-04-25 08:28:11.125078+00
21	playground	tos_custom_domain	s3.artsapi.com	2026-04-25 08:28:11.133262+00	2026-04-25 08:28:11.133262+00
22	playground	tos_secret_key	TnprMllqWTJZbVl4Tm1Zek5EWTBOR0ppWkdJNU9XVmtZV0ptWmpnd09EZw==	2026-04-25 08:28:11.140759+00	2026-04-25 08:28:11.140759+00
23	asset_manager	tos_access_key	AKLTNzFjODM1NTVkZjBhNDU0MWIzZTg1YjRmZDQxMGQ1ZjM	2026-04-25 12:26:41.179745+00	2026-04-25 12:26:41.179745+00
24	asset_manager	tos_endpoint	https://tos-cn-guangzhou.volces.com	2026-04-25 12:26:41.184462+00	2026-04-25 12:26:41.184462+00
25	asset_manager	tos_region	cn-guangzhou	2026-04-25 12:26:41.186159+00	2026-04-25 12:26:41.186159+00
26	asset_manager	tos_bucket	s3arts	2026-04-25 12:26:41.187766+00	2026-04-25 12:26:41.187766+00
27	asset_manager	tos_path_prefix	chedev	2026-04-25 12:26:41.189251+00	2026-04-25 12:26:41.189251+00
28	asset_manager	tos_custom_domain	s3.artsapi.com	2026-04-25 12:26:41.190896+00	2026-04-25 12:26:41.190896+00
29	asset_manager	tos_secret_key	TnprMllqWTJZbVl4Tm1Zek5EWTBOR0ppWkdJNU9XVmtZV0ptWmpnd09EZw==	2026-04-25 12:26:41.19206+00	2026-04-25 12:26:41.19206+00
32	model_marketplace	mp_model_id_6	{"description":"视频生成模型，支持文生视频和图生视频","enabled":true,"sort_order":0}	2026-04-26 16:14:08.8069+00	2026-04-27 14:08:21.961312+00
33	model_marketplace	mp_model_id_5	{"description":"视频生成模型，支持文生视频和图生视频","enabled":true,"sort_order":0}	2026-04-26 16:14:08.812378+00	2026-04-27 14:08:21.963903+00
14	playground	pg_model_id_2	{"enabled":true,"scheme_id":"seedream_4_0"}	2026-04-25 08:12:45.889639+00	2026-04-28 09:07:05.793764+00
15	playground	pg_model_id_1	{"enabled":true,"scheme_id":"seedance1.5pro"}	2026-04-25 08:12:45.895533+00	2026-04-28 09:07:05.795196+00
36	asset_manager	default_quota	100	2026-04-27 02:39:17.438499+00	2026-04-27 02:39:17.438499+00
37	asset_manager	max_folders_gjkol	2	2026-04-27 02:39:17.442982+00	2026-04-27 02:39:17.442982+00
38	asset_manager	max_folders	20	2026-04-27 02:39:17.446403+00	2026-04-27 02:39:17.446403+00
39	asset_manager	max_files_per_folder	100	2026-04-27 02:39:17.447924+00	2026-04-27 02:39:17.447924+00
40	asset_manager	api_enabled_333	true	2026-04-27 02:39:17.449547+00	2026-04-27 02:39:17.449547+00
41	asset_manager	api_enabled_gjkol	true	2026-04-27 02:39:17.451532+00	2026-04-27 02:39:17.451532+00
34	model_marketplace	mp_model_id_4	{"description":"视频生成模型，支持文生视频和图生视频","enabled":true,"sort_order":0}	2026-04-26 16:14:08.81723+00	2026-04-27 14:08:21.966005+00
35	model_marketplace	mp_model_id_3	{"description":"视频生成模型，支持文生视频和图生视频","enabled":true,"sort_order":0}	2026-04-26 16:14:08.820266+00	2026-04-27 14:08:21.968008+00
31	model_marketplace	mp_model_id_2	{"description":"高质量 AI 图片生成","enabled":true,"sort_order":5}	2026-04-26 05:53:47.268034+00	2026-04-27 14:08:21.969681+00
30	model_marketplace	mp_model_id_1	{"description":"视频生成模型，支持文生视频和图生视频","enabled":true,"sort_order":10}	2026-04-26 05:53:47.268034+00	2026-04-27 14:08:21.971098+00
42	asset_manager	api_enabled_33	true	2026-04-27 02:39:17.453811+00	2026-04-27 02:39:17.453811+00
43	asset_manager	api_enabled_default	true	2026-04-27 02:39:17.455741+00	2026-04-27 02:39:17.455741+00
44	asset_manager	api_enabled_23132123	true	2026-04-27 02:39:17.457934+00	2026-04-27 02:39:17.457934+00
45	asset_manager	api_enabled_tgtdgzz	true	2026-04-27 02:39:17.460186+00	2026-04-27 02:39:17.460186+00
46	asset_manager	api_enabled_5365416	true	2026-04-27 02:39:17.461462+00	2026-04-27 02:39:17.461462+00
47	asset_manager	api_enabled	true	2026-04-27 02:39:17.462567+00	2026-04-27 02:39:17.462567+00
48	model_marketplace	mp_model_id_8	{"description":"","enabled":true,"sort_order":0}	2026-04-27 14:08:21.95107+00	2026-04-27 14:08:21.95107+00
49	model_marketplace	mp_model_id_7	{"description":"","enabled":true,"sort_order":0}	2026-04-27 14:08:21.958457+00	2026-04-27 14:08:21.958457+00
55	playground	pg_model_id_10	{"enabled":true,"scheme_id":"seedance2.0fast"}	2026-04-28 09:07:05.758801+00	2026-04-28 09:07:05.758801+00
56	playground	pg_model_id_9	{"enabled":true,"scheme_id":"seedance2.0"}	2026-04-28 09:07:05.76451+00	2026-04-28 09:07:05.76451+00
57	playground	pg_model_id_8	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.772945+00	2026-04-28 09:07:05.772945+00
58	playground	pg_model_id_7	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.778602+00	2026-04-28 09:07:05.778602+00
59	playground	pg_model_id_6	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.78342+00	2026-04-28 09:07:05.78342+00
60	playground	pg_model_id_5	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.785781+00	2026-04-28 09:07:05.785781+00
61	playground	pg_model_id_4	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.789367+00	2026-04-28 09:07:05.789367+00
62	playground	pg_model_id_3	{"enabled":false,"scheme_id":null}	2026-04-28 09:07:05.79155+00	2026-04-28 09:07:05.79155+00
50	asset_manager	volc_access_key	AKLTYTM1NzY3MGFkMmU5NGZiMDk1YmNkYWI2ZGRiNjhlYTE	2026-04-28 09:01:31.067523+00	2026-04-28 12:31:30.86967+00
51	asset_manager	volc_secret_key	TlRJNE1EZGlaV1pqTkRBNU5ETmhaRGhtWlRka1pUVXdOek5tT1dJeU1EUQ==	2026-04-28 09:01:31.075335+00	2026-04-28 12:31:30.873417+00
52	asset_manager	volc_project_name	xinhankr_token	2026-04-28 09:01:31.079165+00	2026-04-28 12:31:30.877772+00
53	asset_manager	volc_group_id	group-20260428171227-xqt4n	2026-04-28 09:01:31.081529+00	2026-04-28 12:31:30.881021+00
54	asset_manager	review_enabled	true	2026-04-28 09:01:31.084357+00	2026-04-28 12:31:30.883777+00
\.


--
-- Data for Name: plugins; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugins (id, name, title, description, is_enabled, allowed_levels, created_at, updated_at, category) FROM stdin;
3	playground	模型体验中心	提供直接的视频、图片、声音、聊天模型体验服务	1	all	2026-04-24 11:17:00.303917+00	2026-04-25 04:25:25.405137+00	user
2	team_marketing	团队营销管理	提供营销团队的用户管理，支持推广团队创建与成员管理	1	all	2026-04-24 11:17:00.303375+00	2026-04-25 04:36:30.37665+00	user
25	volcengine_pool	火山引擎卡池系统	管理多个火山引擎账号，实现智能调度、配额限制与故障自动隔离	1	all	2026-04-25 04:18:48.682627+00	2026-04-25 12:13:55.785264+00	system
98	gptimage_pool	GPT-Image卡池系统	管理多个GPT-Image来源账号，实现智能调度、配额限制与故障自动隔离	1	all	2026-04-25 14:03:39.475824+00	2026-04-26 04:13:02.110706+00	system
124	model_marketplace	模型广场管理	管理模型广场的模型展示，控制哪些模型对用户可见并配置展示信息	1	all	2026-04-26 04:20:06.857711+00	2026-04-26 05:00:36.799493+00	user
225	site_icons	站点icon图标库	提供 AI/LLM 品牌 SVG 图标库，支持搜索选择和自定义上传，数据来源 lobehub/lobe-icons	1	all	2026-04-26 16:38:24.041249+00	2026-04-26 17:15:19.025774+00	system
1	asset_manager	素材资产管理	提供全站图片、视频大模型使用的素材上传与审核功能	1	all	2026-04-24 11:17:00.302728+00	2026-04-27 02:39:17.432337+00	user
\.


--
-- Data for Name: recharge_records; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.recharge_records (id, user_id, amount, recharge_type, remark, created_at) FROM stdin;
1	674a696c-c921-4143-811a-3aa6f9fa6399	20	manual		2026-04-25 07:20:13.275185+00
2	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	100	manual		2026-04-25 08:11:32.998165+00
3	5b2222df-95c2-4e1c-9a29-321d937c1917	15	registration	注册赠送	2026-04-25 08:48:28.926887+00
4	fc03127f-3d70-4c40-9a23-5a698ea80e57	9	registration	注册赠送	2026-04-25 08:58:22.380233+00
5	c6cccf28-dd94-49a8-b34b-a24d292ac1c7	17	registration	注册赠送	2026-04-25 09:34:49.182414+00
6	c9b4e465-1a8c-47dd-9392-427b343ff9fe	27	registration	注册赠送	2026-04-25 09:35:56.976401+00
7	92086673-19cd-43e5-81ca-fdf34c06fdaa	20	registration	注册赠送	2026-04-25 09:44:55.602542+00
8	e84fb6df-d137-4a6a-9b97-4acc88c1e24b	16	registration	注册赠送	2026-04-25 09:50:00.68941+00
9	47aaabf0-7e6a-42a1-a951-bdec068f3024	15	registration	注册赠送	2026-04-25 09:53:33.87939+00
10	10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	22	registration	注册赠送	2026-04-25 13:02:33.749429+00
11	7fc96805-e78e-431d-8b6d-8a54fd18ae2a	29	registration	注册赠送	2026-04-25 14:04:02.321484+00
12	4d77d157-71aa-409a-adf2-19ade50ed63e	24	registration	注册赠送	2026-04-25 18:09:44.721469+00
13	f41d8242-87f6-4d04-9404-2e44ae001f11	25	registration	注册赠送	2026-04-25 23:38:51.429868+00
14	5ccd16c3-a971-442c-96c0-045e7c3cd896	29	registration	注册赠送	2026-04-27 09:57:36.894828+00
15	348e130f-1955-41ec-953a-c478a901738c	24	registration	注册赠送	2026-04-28 09:06:52.570315+00
16	a8a92839-ab28-475e-acd7-b656a198b03d	22	registration	注册赠送	2026-04-28 10:07:11.617548+00
17	464fdb02-5e2f-4979-89d1-77da502682f6	25	registration	注册赠送	2026-04-28 11:55:31.438573+00
18	6b353326-4fd8-4d9b-a028-73b3f3c8da0d	20	registration	注册赠送	2026-04-28 12:30:55.413918+00
\.


--
-- Data for Name: redemptions; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.redemptions (id, name, code, quota, is_used, used_at, used_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.settings (key, value) FROM stdin;
login_settings	{"enable_username_login":true,"enable_mobile_login":false,"enable_email_login":false,"enable_wechat_login":false,"enable_google_login":false}
agreement_settings	{"tos_mode":"link","tos_mode_en":"link","tos_content":"<p>这个系统&nbsp;应该非常好用吧这里是&nbsp;中文</p>","tos_content_en":"<p>4646546565564这里是&nbsp;English这里是&nbsp;English这里是&nbsp;English这里是&nbsp;English这里是&nbsp;English</p>","tos_link":"https://www.baidu.com","tos_link_en":"https://www.google.com","privacy_mode":"link","privacy_mode_en":"link","privacy_content":"<p>这个系统&nbsp;应该非常好用吧这里是&nbsp;中文这个系统&nbsp;应该非常好用吧这里是&nbsp;中文这个系统&nbsp;应该非常好用吧这里是&nbsp;中文这个系统&nbsp;应该非常好用吧这里是&nbsp;中文这个系统&nbsp;应该非常好用吧这里是&nbsp;中文</p>","privacy_content_en":"<p>这里是&nbsp;English</p>","privacy_link":"http://www.qq.com","privacy_link_en":"https://www.openai.com"}
marketing_settings	{"enable_registration_gift":true,"gift_mode":"random","fixed_amount":0.0,"min_amount":15.0,"max_amount":30.0}
registration_settings	{"enable_username_registration":true,"enable_email_registration":true,"enable_mobile_registration":false,"enable_password_recovery":true,"ip_rate_limit_enabled":false,"ip_daily_limit":6,"email_validation_strict":false,"email_whitelist_enabled":false,"email_whitelist":["qq.com","163.com","outlook.com","aliyun.com","foxmail.com"]}
site_settings	{"name":"TokensByte","title":"TokensByte - LLM API Gateway","keywords":"LLM, API, Gateway, Rust","description":"Next-gen LLM API Distribution & Management Platform","favicon":"","logo":"https://api.artsapi.com/uploads/20260318/69ba6d4c0d165.png","login_title":"","login_subtitle":"","enable_multilingual":true}
\.


--
-- Data for Name: site_icon_sync_logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.site_icon_sync_logs (id, total_synced, total_new, total_updated, status, error_message, created_at) FROM stdin;
1	300	300	0	success	\N	2026-04-27T00:50:06.761152+08:00
2	300	300	300	success	\N	2026-04-27T01:07:10.613045+08:00
3	300	300	300	success	\N	2026-04-27T01:13:47.534779+08:00
4	300	300	300	success	\N	2026-04-27T06:36:59.645142129+00:00
\.


--
-- Data for Name: site_icons; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.site_icons (id, name, title, file_path, source, category, tags, is_active, created_at, updated_at) FROM stdin;
5	agui	Agui	icons/lobe/agui.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
6	ai2	Ai2	icons/lobe/ai2.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
2	adobe	Adobe	icons/lobe/adobe.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
7	ai21	Ai21	icons/lobe/ai21.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
8	ai302	Ai302	icons/lobe/ai302.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
9	ai360	Ai360	icons/lobe/ai360.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
10	aihubmix	AiHubMix	icons/lobe/aihubmix.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
11	aimass	AiMass	icons/lobe/aimass.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
12	aistudio	AiStudio	icons/lobe/aistudio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
13	aionlabs	AionLabs	icons/lobe/aionlabs.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
14	akashchat	AkashChat	icons/lobe/akashchat.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
15	alephalpha	AlephAlpha	icons/lobe/alephalpha.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
16	alibaba	Alibaba	icons/lobe/alibaba.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
17	alibabacloud	AlibabaCloud	icons/lobe/alibabacloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
18	amp	Amp	icons/lobe/amp.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
19	antgroup	AntGroup	icons/lobe/antgroup.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
20	anthropic	Anthropic	icons/lobe/anthropic.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
21	antigravity	Antigravity	icons/lobe/antigravity.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
22	anyscale	Anyscale	icons/lobe/anyscale.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
23	apertis	Apertis	icons/lobe/apertis.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
24	apple	Apple	icons/lobe/apple.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
25	arcee	Arcee	icons/lobe/arcee.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
26	askverdict	AskVerdict	icons/lobe/askverdict.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
27	assemblyai	AssemblyAI	icons/lobe/assemblyai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
28	atlascloud	AtlasCloud	icons/lobe/atlascloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
29	automatic	Automatic	icons/lobe/automatic.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
30	aws	Aws	icons/lobe/aws.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
31	aya	Aya	icons/lobe/aya.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
32	azure	Azure	icons/lobe/azure.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
33	azureai	AzureAI	icons/lobe/azureai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
34	baai	BAAI	icons/lobe/baai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
35	baichuan	Baichuan	icons/lobe/baichuan.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
36	baidu	Baidu	icons/lobe/baidu.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
37	baiducloud	BaiduCloud	icons/lobe/baiducloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
38	bailian	Bailian	icons/lobe/bailian.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
39	baseten	Baseten	icons/lobe/baseten.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
40	bedrock	Bedrock	icons/lobe/bedrock.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
41	bfl	Bfl	icons/lobe/bfl.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
42	bilibili	Bilibili	icons/lobe/bilibili.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
43	bilibiliindex	BilibiliIndex	icons/lobe/bilibiliindex.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
44	bing	Bing	icons/lobe/bing.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
45	briaai	BriaAI	icons/lobe/briaai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
46	burncloud	BurnCloud	icons/lobe/burncloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
47	bytedance	ByteDance	icons/lobe/bytedance.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
48	capcut	CapCut	icons/lobe/capcut.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
4	agentvoice	AgentVoice	icons/lobe/agentvoice.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
49	centml	CentML	icons/lobe/centml.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
61	codex	Codex	icons/lobe/codex.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
69	copilot	Copilot	icons/lobe/copilot.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
77	dalle	Dalle	icons/lobe/dalle.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
84	deepseek	DeepSeek	icons/lobe/deepseek.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
92	elevenx	ElevenX	icons/lobe/elevenx.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
100	fishaudio	FishAudio	icons/lobe/fishaudio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
108	gemma	Gemma	icons/lobe/gemma.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
116	goose	Goose	icons/lobe/goose.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
124	hermesagent	HermesAgent	icons/lobe/hermesagent.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
132	iflytekcloud	IFlyTekCloud	icons/lobe/iflytekcloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
139	internlm	InternLM	icons/lobe/internlm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
50	cerebras	Cerebras	icons/lobe/cerebras.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
62	cogvideo	CogVideo	icons/lobe/cogvideo.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
70	copilotkit	CopilotKit	icons/lobe/copilotkit.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
78	dbrx	Dbrx	icons/lobe/dbrx.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
85	dify	Dify	icons/lobe/dify.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
93	essentialai	EssentialAI	icons/lobe/essentialai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
101	flora	Flora	icons/lobe/flora.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
109	giteeai	GiteeAI	icons/lobe/giteeai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
117	gradio	Gradio	icons/lobe/gradio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
125	higress	Higress	icons/lobe/higress.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
133	ideogram	Ideogram	icons/lobe/ideogram.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
51	chatglm	ChatGLM	icons/lobe/chatglm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
63	cogview	CogView	icons/lobe/cogview.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
71	coqui	Coqui	icons/lobe/coqui.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
79	deepai	DeepAI	icons/lobe/deepai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
86	doc2x	Doc2X	icons/lobe/doc2x.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
94	exa	Exa	icons/lobe/exa.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
102	flowith	Flowith	icons/lobe/flowith.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
110	github	Github	icons/lobe/github.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
118	greptile	Greptile	icons/lobe/greptile.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
126	huawei	Huawei	icons/lobe/huawei.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
134	inception	Inception	icons/lobe/inception.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
52	cherrystudio	CherryStudio	icons/lobe/cherrystudio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
64	cohere	Cohere	icons/lobe/cohere.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
72	coze	Coze	icons/lobe/coze.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
80	deepcogito	DeepCogito	icons/lobe/deepcogito.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
87	docsearch	DocSearch	icons/lobe/docsearch.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
95	fal	Fal	icons/lobe/fal.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
103	flux	Flux	icons/lobe/flux.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
111	githubcopilot	GithubCopilot	icons/lobe/githubcopilot.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
119	grok	Grok	icons/lobe/grok.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
127	huaweicloud	HuaweiCloud	icons/lobe/huaweicloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
135	inference	Inference	icons/lobe/inference.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
53	civitai	Civitai	icons/lobe/civitai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
57	clipdrop	Clipdrop	icons/lobe/clipdrop.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
65	colab	Colab	icons/lobe/colab.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
73	crewai	CrewAI	icons/lobe/crewai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
81	deepinfra	DeepInfra	icons/lobe/deepinfra.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
88	dolphin	Dolphin	icons/lobe/dolphin.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
96	fastgpt	FastGPT	icons/lobe/fastgpt.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
104	friendli	Friendli	icons/lobe/friendli.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
112	glama	Glama	icons/lobe/glama.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
120	groq	Groq	icons/lobe/groq.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
128	huggingface	HuggingFace	icons/lobe/huggingface.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
136	infermatic	Infermatic	icons/lobe/infermatic.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
54	claude	Claude	icons/lobe/claude.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
58	cloudflare	Cloudflare	icons/lobe/cloudflare.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
66	cometapi	CometAPI	icons/lobe/cometapi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
74	crusoe	Crusoe	icons/lobe/crusoe.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
82	deepl	DeepL	icons/lobe/deepl.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
89	doubao	Doubao	icons/lobe/doubao.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
97	featherless	Featherless	icons/lobe/featherless.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
105	glmv	GLMV	icons/lobe/glmv.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
113	glif	Glif	icons/lobe/glif.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
121	hailuo	Hailuo	icons/lobe/hailuo.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
129	hunyuan	Hunyuan	icons/lobe/hunyuan.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
137	infinigence	Infinigence	icons/lobe/infinigence.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
55	claudecode	ClaudeCode	icons/lobe/claudecode.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
59	codeflicker	CodeFlicker	icons/lobe/codeflicker.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
67	comfyui	ComfyUI	icons/lobe/comfyui.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
75	cursor	Cursor	icons/lobe/cursor.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
90	dreammachine	DreamMachine	icons/lobe/dreammachine.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
98	figma	Figma	icons/lobe/figma.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
106	gemini	Gemini	icons/lobe/gemini.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
114	google	Google	icons/lobe/google.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
122	haiper	Haiper	icons/lobe/haiper.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
130	hyperbolic	Hyperbolic	icons/lobe/hyperbolic.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
138	inflection	Inflection	icons/lobe/inflection.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
68	commanda	CommandA	icons/lobe/commanda.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
76	cybercut	CyberCut	icons/lobe/cybercut.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
83	deepmind	DeepMind	icons/lobe/deepmind.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
91	elevenlabs	ElevenLabs	icons/lobe/elevenlabs.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
99	fireworks	Fireworks	icons/lobe/fireworks.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
107	geminicli	GeminiCLI	icons/lobe/geminicli.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
115	googlecloud	GoogleCloud	icons/lobe/googlecloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
123	hedra	Hedra	icons/lobe/hedra.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
131	ibm	IBM	icons/lobe/ibm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
140	jimeng	Jimeng	icons/lobe/jimeng.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
141	jina	Jina	icons/lobe/jina.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
142	junie	Junie	icons/lobe/junie.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
143	kilocode	KiloCode	icons/lobe/kilocode.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
144	kimi	Kimi	icons/lobe/kimi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
145	kling	Kling	icons/lobe/kling.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
146	kluster	Kluster	icons/lobe/kluster.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
147	kolors	Kolors	icons/lobe/kolors.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
148	krea	Krea	icons/lobe/krea.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
150	kwaipilot	Kwaipilot	icons/lobe/kwaipilot.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
151	lg	LG	icons/lobe/lg.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
152	llava	LLaVA	icons/lobe/llava.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
153	lambda	Lambda	icons/lobe/lambda.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
154	langchain	LangChain	icons/lobe/langchain.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
155	langgraph	LangGraph	icons/lobe/langgraph.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
156	langsmith	LangSmith	icons/lobe/langsmith.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
157	langfuse	Langfuse	icons/lobe/langfuse.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
158	leptonai	LeptonAI	icons/lobe/leptonai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
159	lightricks	Lightricks	icons/lobe/lightricks.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
160	liquid	Liquid	icons/lobe/liquid.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
161	livekit	LiveKit	icons/lobe/livekit.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
162	llamaindex	LlamaIndex	icons/lobe/llamaindex.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
163	llmapi	LlmApi	icons/lobe/llmapi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
164	lmstudio	LmStudio	icons/lobe/lmstudio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
165	lobehub	LobeHub	icons/lobe/lobehub.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
166	longcat	LongCat	icons/lobe/longcat.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
167	lovable	Lovable	icons/lobe/lovable.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
168	lovart	Lovart	icons/lobe/lovart.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
169	luma	Luma	icons/lobe/luma.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
170	mcp	MCP	icons/lobe/mcp.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
171	magic	Magic	icons/lobe/magic.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
172	make	Make	icons/lobe/make.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
173	manus	Manus	icons/lobe/manus.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
174	mastra	Mastra	icons/lobe/mastra.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
175	mcpso	McpSo	icons/lobe/mcpso.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
60	codegeex	CodeGeeX	icons/lobe/codegeex.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
176	menlo	Menlo	icons/lobe/menlo.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
191	nplcloud	NPLCloud	icons/lobe/nplcloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
199	novelai	NovelAI	icons/lobe/novelai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
207	opencode	OpenCode	icons/lobe/opencode.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
215	phidata	Phidata	icons/lobe/phidata.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
223	pydanticai	PydanticAI	icons/lobe/pydanticai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
231	relace	Relace	icons/lobe/relace.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
232	replicate	Replicate	icons/lobe/replicate.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
177	meshy	Meshy	icons/lobe/meshy.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
184	mistral	Mistral	icons/lobe/mistral.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
192	nanobanana	NanoBanana	icons/lobe/nanobanana.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
200	novita	Novita	icons/lobe/novita.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
208	openhands	OpenHands	icons/lobe/openhands.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
216	phind	Phind	icons/lobe/phind.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
224	qingyan	Qingyan	icons/lobe/qingyan.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
233	replit	Replit	icons/lobe/replit.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
178	meta	Meta	icons/lobe/meta.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
185	modelscope	ModelScope	icons/lobe/modelscope.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
193	nebius	Nebius	icons/lobe/nebius.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
201	nvidia	Nvidia	icons/lobe/nvidia.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
209	openrouter	OpenRouter	icons/lobe/openrouter.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
217	pika	Pika	icons/lobe/pika.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
225	qiniu	Qiniu	icons/lobe/qiniu.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
234	reve	Reve	icons/lobe/reve.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
179	metaai	MetaAI	icons/lobe/metaai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
186	monica	Monica	icons/lobe/monica.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
194	newapi	NewAPI	icons/lobe/newapi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
202	obsidian	Obsidian	icons/lobe/obsidian.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
210	openwebui	OpenWebUI	icons/lobe/openwebui.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
218	pixverse	PixVerse	icons/lobe/pixverse.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
226	qoder	Qoder	icons/lobe/qoder.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
235	roocode	RooCode	icons/lobe/roocode.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
180	metagpt	MetaGPT	icons/lobe/metagpt.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
187	moonshot	Moonshot	icons/lobe/moonshot.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
195	notebooklm	NotebookLM	icons/lobe/notebooklm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
203	ollama	Ollama	icons/lobe/ollama.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
211	ppio	PPIO	icons/lobe/ppio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
219	player2	Player2	icons/lobe/player2.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
227	qwen	Qwen	icons/lobe/qwen.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
236	runway	Runway	icons/lobe/runway.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
181	microsoft	Microsoft	icons/lobe/microsoft.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
188	morph	Morph	icons/lobe/morph.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
196	notion	Notion	icons/lobe/notion.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
204	openai	OpenAI	icons/lobe/openai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
212	palm	PaLM	icons/lobe/palm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
220	poe	Poe	icons/lobe/poe.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
228	rsshub	RSSHub	icons/lobe/rsshub.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
182	midjourney	Midjourney	icons/lobe/midjourney.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
189	myshell	MyShell	icons/lobe/myshell.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
197	nousresearch	NousResearch	icons/lobe/nousresearch.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
205	openchat	OpenChat	icons/lobe/openchat.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
213	parasail	Parasail	icons/lobe/parasail.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
221	pollinations	Pollinations	icons/lobe/pollinations.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
229	railway	Railway	icons/lobe/railway.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
198	nova	Nova	icons/lobe/nova.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
206	openclaw	OpenClaw	icons/lobe/openclaw.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
214	perplexity	Perplexity	icons/lobe/perplexity.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
222	prunaai	PrunaAI	icons/lobe/prunaai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
230	recraft	Recraft	icons/lobe/recraft.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
237	rwkv	Rwkv	icons/lobe/rwkv.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
238	sambanova	SambaNova	icons/lobe/sambanova.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
239	search1api	Search1API	icons/lobe/search1api.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
240	searchapi	SearchApi	icons/lobe/searchapi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
241	sensenova	SenseNova	icons/lobe/sensenova.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
242	siliconcloud	SiliconCloud	icons/lobe/siliconcloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
243	skywork	Skywork	icons/lobe/skywork.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
244	smithery	Smithery	icons/lobe/smithery.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
245	snowflake	Snowflake	icons/lobe/snowflake.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
246	sophnet	SophNet	icons/lobe/sophnet.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
247	sora	Sora	icons/lobe/sora.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
248	spark	Spark	icons/lobe/spark.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
249	speedai	SpeedAI	icons/lobe/speedai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
250	stability	Stability	icons/lobe/stability.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
251	statecloud	StateCloud	icons/lobe/statecloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
252	stepfun	Stepfun	icons/lobe/stepfun.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
253	straico	Straico	icons/lobe/straico.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
254	streamlake	StreamLake	icons/lobe/streamlake.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
255	submodel	SubModel	icons/lobe/submodel.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
256	suno	Suno	icons/lobe/suno.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
257	sync	Sync	icons/lobe/sync.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
258	tii	TII	icons/lobe/tii.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
259	targon	Targon	icons/lobe/targon.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
260	tavily	Tavily	icons/lobe/tavily.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
261	tencent	Tencent	icons/lobe/tencent.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
262	tencentcloud	TencentCloud	icons/lobe/tencentcloud.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
263	tiangong	Tiangong	icons/lobe/tiangong.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
264	together	Together	icons/lobe/together.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
265	topazlabs	TopazLabs	icons/lobe/topazlabs.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
266	trae	Trae	icons/lobe/trae.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
267	tripo	Tripo	icons/lobe/tripo.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
268	turix	TuriX	icons/lobe/turix.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
269	udio	Udio	icons/lobe/udio.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
271	upstage	Upstage	icons/lobe/upstage.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
272	v0	V0	icons/lobe/v0.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
273	vectorizerai	VectorizerAI	icons/lobe/vectorizerai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
274	venice	Venice	icons/lobe/venice.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
275	vercel	Vercel	icons/lobe/vercel.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
276	vertexai	VertexAI	icons/lobe/vertexai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
190	n8n	N8n	icons/lobe/n8n.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
277	vidu	Vidu	icons/lobe/vidu.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
285	xai	XAI	icons/lobe/xai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
293	yuanbao	Yuanbao	icons/lobe/yuanbao.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
278	viggle	Viggle	icons/lobe/viggle.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
286	xiaomimimo	XiaomiMiMo	icons/lobe/xiaomimimo.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
294	zai	ZAI	icons/lobe/zai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
279	vllm	Vllm	icons/lobe/vllm.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
287	xinference	Xinference	icons/lobe/xinference.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
295	zapier	Zapier	icons/lobe/zapier.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
280	volcengine	Volcengine	icons/lobe/volcengine.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
288	xpay	Xpay	icons/lobe/xpay.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
296	zeabur	Zeabur	icons/lobe/zeabur.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
281	voyage	Voyage	icons/lobe/voyage.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
289	xuanyuan	Xuanyuan	icons/lobe/xuanyuan.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
297	zenmux	ZenMux	icons/lobe/zenmux.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
282	wenxin	Wenxin	icons/lobe/wenxin.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
290	yandex	Yandex	icons/lobe/yandex.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
298	zencoder	Zencoder	icons/lobe/zencoder.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
283	windsurf	Windsurf	icons/lobe/windsurf.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
291	yi	Yi	icons/lobe/yi.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
299	zeroone	ZeroOne	icons/lobe/zeroone.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
270	unstructured	Unstructured	icons/lobe/unstructured.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
284	workersai	WorkersAI	icons/lobe/workersai.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
292	youmind	YouMind	icons/lobe/youmind.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
300	zhipu	Zhipu	icons/lobe/zhipu.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
1	ace	Ace	icons/lobe/ace.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
3	adobefirefly	AdobeFirefly	icons/lobe/adobefirefly.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
56	cline	Cline	icons/lobe/cline.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
149	kwaikat	KwaiKAT	icons/lobe/kwaikat.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
183	minimax	Minimax	icons/lobe/minimax.svg	lobe-icons	AI品牌	[]	1	2026-04-27T00:50:06.761152+08:00	2026-04-27T06:36:59.645142129+00:00
\.


--
-- Data for Name: upstreams; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.upstreams (id, name, upstream_type, sort_order, is_active, remark, config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_levels; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.user_levels (id, name, group_key, discount, commission_ratio, invite_reward_inviter, invite_reward_invitee, daily_invite_limit, marketing_enabled, max_token_count, description, created_at, updated_at, is_default) FROM stdin;
1	默认用户	default	1	0	0	0	10	0	10	普通用户，无折扣	2026-04-24 11:17:00.245028+00	2026-04-24 11:17:00.245028+00	1
9	33	33	1	0	0	0	10	0	10		2026-04-25 04:27:18.911859+00	2026-04-25 04:27:18.911859+00	0
10	33fsdf	333	1	0	0	0	10	0	10		2026-04-25 04:27:23.488964+00	2026-04-25 04:27:23.488964+00	0
12	4564654	5365416	1	0	0	0	10	0	10		2026-04-25 04:36:17.645215+00	2026-04-25 04:36:17.645215+00	0
14	高级 kol	gjkol	1	0	0	0	10	0	10		2026-04-25 07:15:31.104668+00	2026-04-25 07:15:31.104668+00	0
15	23132123	23132123	1	0	0	0	10	0	10		2026-04-25 07:15:46.125135+00	2026-04-25 07:15:46.125135+00	0
16	推广团队工作组	tgtdgzz	1	0	0	0	10	0	10		2026-04-25 07:32:02.924299+00	2026-04-25 07:32:02.924299+00	0
284	工作人员	gzry	1	0	0	0	10	0	10		2026-04-27 07:42:59.930575+00	2026-04-27 07:42:59.930575+00	0
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.users (id, uid, username, email, password_hash, nickname, mobile, wechat_id, role, balance, user_group, used_quota, is_active, remark, upstream_type, config, referred_by, commission_balance, admin_group_id, register_ip, admin_remark, created_at, updated_at, google_id, wechat_name, google_name) FROM stdin;
8321514a-13f1-4fc3-9384-7223919c7d18	1000157473	admin	admin@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$AiEoThKaTJBFtj64Js2EXw$ANUOO5wT0kINEex7D8N6P27MWESYYUviXuoFSJbmbl0	\N	\N	\N	admin	100	default	0	1	\N	other	\N	\N	0	\N			2026-04-24T19:17:00.592370+08:00	2026-04-24T19:17:00.592370+08:00	\N	\N	\N
5365a98b-cf98-48d7-9f5a-6e739ed2b61b	1000458381	daka	u_04983005@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$/AJEaJh19FwP501Z9Z6iew$1GOrpC/BDHTVkKuFEA81jKsViWylc/XXPAZS+EYUfZU	\N	\N	\N	user	0	default	0	1	\N	other	\N	33d5765d-dacf-499f-a77d-a00ea930729e	0	\N	127.0.0.1		2026-04-24 11:57:45.743175+00	2026-04-24 11:57:45.743175+00	\N	\N	\N
7fc96805-e78e-431d-8b6d-8a54fd18ae2a	1001198464	jklool	u_81997756@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$QG8eRsqwmr9G8iwYgg4p/g$7Bn4ncOBGHRJThEkX7/qw4yC44NxNV1OSc4k3D8BWwU	\N	\N	\N	user	28.200000000000003	default	0.8	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 14:04:02.321484+00	2026-04-25 17:52:46.17062+00	\N	\N	\N
937afe47-9cd7-4ee8-9a22-fe4bd7720b34	1003645183	bubyday	u_69940939@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$UYoaL4ViFNukxpmZpXmdeA$pUDHgioq+shrZbb9KqYsgAx+ftkkELfJKNia8dg3r4E	\N	\N	\N	user	99.8	default	0.2	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-24 11:55:42.746595+00	2026-04-25 08:17:36.543489+00	\N	\N	\N
5b2222df-95c2-4e1c-9a29-321d937c1917	1002582048	jklll008	u_79563048@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$o8NypRf6yG6Ab0yGrB5Z3g$1zsQ8+pEzfcJRdmvDIeZPdRL6O4xO9LCC5lyYUDnyts	\N	\N	\N	user	15	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 08:48:28.926887+00	2026-04-25 08:48:28.926887+00	\N	\N	\N
47aaabf0-7e6a-42a1-a951-bdec068f3024	1001272266	jklll78787	u_17819303@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$cD6yzWVARTyvRA8buEQ/sw$ZYifHlo7P7eXNZtYtRkOH6iTXveo4cROQAJevTLjhp4	\N	\N	\N	user	14.400000000000002	default	0.6000000000000001	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 09:53:33.87939+00	2026-04-25 11:18:56.021191+00	\N	\N	\N
fc03127f-3d70-4c40-9a23-5a698ea80e57	1001227106	aksk	u_15907188@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$C60k86NnMSK5QsupYvQuiA$evJhdzuHSg3sRAuoM9cfsCk8f0UCQAQYhOETtEmKiSk	\N	\N	\N	user	8.400000000000002	default	0.6000000000000001	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 08:58:22.380233+00	2026-04-25 09:24:06.714+00	\N	\N	\N
c6cccf28-dd94-49a8-b34b-a24d292ac1c7	1002525617	我看看	u_50342721@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$wFhzsQ4LPph7Nvo8zTcEVQ$FM7RSkNxBcIdAyL+HyzHGRYrA58fwKGbTajvdM9V2CY	\N	\N	\N	user	17	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 09:34:49.182414+00	2026-04-25 09:34:49.182414+00	\N	\N	\N
c9b4e465-1a8c-47dd-9392-427b343ff9fe	1005413236	admin666	u_23870929@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$gGDOU5D98WDx4TJnBnoscw$IuuDICIXik4RE7dQoy4DnPFty8BnCijoWyDGHM5Y4Wg	\N	\N	\N	user	27	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 09:35:56.976401+00	2026-04-25 09:35:56.976401+00	\N	\N	\N
10cbc711-bbc2-4f9a-9fab-a7d09fc6eb48	1007845943	kakaka	u_59347565@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$NhE4DTRt2lii1pl5QW/YNQ$wbA3CiiDfdGNd71LBoCr0r5IwNO0DZF4DAVl2Itszr4	\N	\N	\N	user	21.8	default	0.2	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 13:02:33.749429+00	2026-04-25 13:12:35.06066+00	\N	\N	\N
92086673-19cd-43e5-81ca-fdf34c06fdaa	1009691764	666admin	u_91635286@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$P84PLV8MhsYImhm6QVi0fQ$KcH3HwvHNVQc+44FL1b5GP7cHJz9f3el5/sD/ZoOWBg	\N	\N	\N	user	19.6	default	0.4	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 09:44:55.602542+00	2026-04-25 09:48:11.991322+00	\N	\N	\N
e84fb6df-d137-4a6a-9b97-4acc88c1e24b	1004651392	878dasdasd	u_11742680@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$kpCxadrIvaSvw5SXoGgp2Q$LuuyFSkfw88Ql/Ua21btfbtreKB1YMFvhaXgjn0E6t0	\N	\N	\N	user	16	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 09:50:00.68941+00	2026-04-25 09:50:00.68941+00	\N	\N	\N
348e130f-1955-41ec-953a-c478a901738c	1008709856	jks007	u_55436783@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$hWX69cHMDOLwgLsjKcgKHw$cnEP/E/VEQeiYNcpV6hpwQaHZ6LKgegqPKBM4sz+Aq4	\N	\N	\N	user	19.9707	default	4.0293	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-28 09:06:52.570315+00	2026-04-28 09:44:58.350648+00	\N	\N	\N
33d5765d-dacf-499f-a77d-a00ea930729e	1009002662	jklll007	u_14438699@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$aFjfM5HKe90pQ3VpkCSNVA$WQ6+n3UZl5l9zyBnG+vuMJET6tWkEAHoJu6JTBTVuJg	\N	\N	\N	user	0	tgtdgzz	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-24 11:56:06.319887+00	2026-04-27 08:02:41.534493+00	\N	\N	\N
4d77d157-71aa-409a-adf2-19ade50ed63e	1005510912	dakakdakak	u_15885258@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$DeDFSvHlapJ0iPrGLfyTOA$jkaeyHn9HtDF+p/jwBR2FPtrDSyKjcMYwOAm1AIJY8I	\N	\N	\N	user	23.400000000000002	default	0.6000000000000001	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 18:09:44.721469+00	2026-04-25 18:35:31.254998+00	\N	\N	\N
f41d8242-87f6-4d04-9404-2e44ae001f11	1004255594	dakakdakak222	u_07889992@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$R+ACaruJt42TjQCoYwzryQ$2DbcOR64u0iVWXWTkQIfeKYQVIVQs9yb2LYZywBDUL8	\N	\N	\N	user	24.8	default	0.2	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-25 23:38:51.429868+00	2026-04-25 23:46:22.132953+00	\N	\N	\N
674a696c-c921-4143-811a-3aa6f9fa6399	1004445354	hkhjkdha	u_41699688@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$XtkoyW9vYXRHN7VOWgMrhg$QrzaE/b40DByZjRGw0bhpwVbU1qBJXbOhjBlibt6kTc	\N	\N	\N	user	20	tgtdgzz	0	1	\N	other	\N	937afe47-9cd7-4ee8-9a22-fe4bd7720b34	0	\N	127.0.0.1		2026-04-25 04:27:04.488782+00	2026-04-27 08:02:45.0369+00	\N	\N	\N
5ccd16c3-a971-442c-96c0-045e7c3cd896	1007514541	bubyday1212	u_78770988@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$+Z1reZNmoe2pvIkGnV/EHw$qhloihCpIz/bzl6SRrMJuJ9MlmVWDefuZWtt9AOYhg4	\N	\N	\N	user	29	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-27 09:57:36.894828+00	2026-04-27 09:57:36.894828+00	\N	\N	\N
a8a92839-ab28-475e-acd7-b656a198b03d	1008706820	wokaka	u_09621346@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$Od5u4SI1aD3ajDzJBibndA$LDTFzBtCy4B2LgPTG/AAvctVL645ECMRLNIiuBtOH90	\N	\N	\N	user	20.126394	default	1.873606	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-28 10:07:11.617548+00	2026-04-28 10:26:51.762413+00	\N	\N	\N
464fdb02-5e2f-4979-89d1-77da502682f6	1000090577	wokankan2	u_85203302@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$wavAhZlHx5aoYJuyufb+MA$No/whngCd8r2Yn/qVpT49puf8QcfftlVkW4JbpIt0hc	\N	\N	\N	user	25	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-28 11:55:31.438573+00	2026-04-28 11:55:31.438573+00	\N	\N	\N
6b353326-4fd8-4d9b-a028-73b3f3c8da0d	1009210594	dsdsds	u_74035091@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$E8ag8jq/udWwIMvQ+w6jDw$DKGDRDB+auh6oIKDZmWxrdyFr8DlMULA9nS5/QJGWM8	\N	\N	\N	user	20	default	0	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-28 12:30:55.413918+00	2026-04-28 12:30:55.413918+00	\N	\N	\N
\.


--
-- Data for Name: verification_codes; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.verification_codes (id, email, code, purpose, expires_at, created_at, phone) FROM stdin;
\.


--
-- Data for Name: volcengine_pool_account_mapping; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.volcengine_pool_account_mapping (pool_id, account_id, status, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, daily_quota, hourly_quota, period_quota, daily_used, hourly_used, period_used, last_daily_reset, last_hourly_reset, last_period_reset, priority) FROM stdin;
1	1	active	images	0	0			100	0	0	0	0	0	2026-04-28	2026-04-28-17		0
1	2	active	images	0	0			100	0	0	0	0	0	2026-04-28	2026-04-28-17		0
1	8	active	images	0	0			100	0	0	0	0	0	2026-04-28	2026-04-28-17		0
\.


--
-- Data for Name: volcengine_pool_accounts; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.volcengine_pool_accounts (id, name, base_url, api_key, status, last_error, last_error_at, created_at, updated_at, models, quota_unit, daily_reset_hour, daily_reset_minute, period_start, period_end, account_id, access_key, secret_key) FROM stdin;
1	mlderam2103723826	https://ark.cn-beijing.volces.com/api/v3	ark-f53df5b4-a169-4df5-8b0f-537af7d6c4fe-71aa2	active	\N	\N	2026-04-27 10:03:22.994399+00	2026-04-27 10:09:45.761614+00		tokens	0	0					
2	4.0	https://ark.cn-beijing.volces.com/api/v3	ark-d3f399f9-a687-44f9-8463-d6c366787189-fc54f	active	\N	\N	2026-04-28 07:30:43.934689+00	2026-04-28 07:30:43.934689+00		tokens	0	0			2110492332		
3	4.0	https://ark.cn-beijing.volces.com/api/v3	ark-d3f399f9-a687-44f9-8463-d6c366787189-fc54f	active	\N	\N	2026-04-28 07:30:46.596424+00	2026-04-28 07:30:46.596424+00		tokens	0	0			2110492332		
4	4.0	https://ark.cn-beijing.volces.com/api/v3	AKLTNTU4M2NiYTUyMzI4NGZkNDlkOTg1N2YxZDQzODFmYzA	active	\N	\N	2026-04-28 07:34:01.564061+00	2026-04-28 07:34:01.564061+00		tokens	0	0			2110492332		
5	4.0	https://ark.cn-beijing.volces.com/api/v3	AKLTNTU4M2NiYTUyMzI4NGZkNDlkOTg1N2YxZDQzODFmYzA	active	\N	\N	2026-04-28 07:34:02.58811+00	2026-04-28 07:34:02.58811+00		tokens	0	0			2110492332		
6	4.0	https://ark.cn-beijing.volces.com/api/v3	AKLTNTU4M2NiYTUyMzI4NGZkNDlkOTg1N2YxZDQzODFmYzA	active	\N	\N	2026-04-28 07:34:02.995109+00	2026-04-28 07:34:02.995109+00		tokens	0	0			2110492332		
7	4.0	https://ark.cn-beijing.volces.com/api/v3	AKLTNTU4M2NiYTUyMzI4NGZkNDlkOTg1N2YxZDQzODFmYzA	active	\N	\N	2026-04-28 07:34:03.317341+00	2026-04-28 07:34:03.317341+00		tokens	0	0			2110492332		
8	default	https://ark.cn-beijing.volces.com/api/v3	diaoni123	active	\N	\N	2026-04-28 07:35:13.928026+00	2026-04-28 07:35:13.928026+00		tokens	0	0			bubyday		
9	default	https://ark.cn-beijing.volces.com/api/v3	diaoni123	active	\N	\N	2026-04-28 07:46:22.099825+00	2026-04-28 07:46:22.099825+00		tokens	0	0			bubyday		
\.


--
-- Data for Name: volcengine_pool_logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.volcengine_pool_logs (id, pool_id, account_id, account_name, model_id, channel_id, usage_amount, quota_unit, status, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: volcengine_pools; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.volcengine_pools (id, name, pool_type, strategy, is_active, remark, created_at, updated_at, model_id) FROM stdin;
1	1号卡池 sd4.0	image	random	1	sss	2026-04-27 10:04:41.890519+00	2026-04-28 08:14:56.111121+00	doubao-seedream-4-0-250828
\.


--
-- Name: admin_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.admin_groups_id_seq', 1, false);


--
-- Name: announcements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.announcements_id_seq', 3, true);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.api_tokens_id_seq', 11, true);


--
-- Name: billing_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.billing_rules_id_seq', 18, true);


--
-- Name: channel_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.channel_configs_id_seq', 3, true);


--
-- Name: channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.channels_id_seq', 4, true);


--
-- Name: commissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.commissions_id_seq', 1, false);


--
-- Name: forward_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.forward_rules_id_seq', 18, true);


--
-- Name: gptimage_pool_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.gptimage_pool_accounts_id_seq', 1, false);


--
-- Name: gptimage_pool_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.gptimage_pool_logs_id_seq', 1, false);


--
-- Name: gptimage_pools_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.gptimage_pools_id_seq', 1, false);


--
-- Name: logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.logs_id_seq', 56, true);


--
-- Name: marketing_team_leaders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_team_leaders_id_seq', 6, true);


--
-- Name: marketing_team_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_team_members_id_seq', 6, true);


--
-- Name: marketing_teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_teams_id_seq', 1, true);


--
-- Name: model_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.model_providers_id_seq', 782, true);


--
-- Name: model_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.model_types_id_seq', 974, true);


--
-- Name: models_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.models_id_seq', 15, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: playground_assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.playground_assets_id_seq', 23, true);


--
-- Name: playground_projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.playground_projects_id_seq', 7, true);


--
-- Name: plugin_api_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_api_logs_id_seq', 10, true);


--
-- Name: plugin_asset_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_asset_groups_id_seq', 14, true);


--
-- Name: plugin_assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_assets_id_seq', 17, true);


--
-- Name: plugin_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_configs_id_seq', 62, true);


--
-- Name: plugins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugins_id_seq', 1481, true);


--
-- Name: recharge_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.recharge_records_id_seq', 18, true);


--
-- Name: redemptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.redemptions_id_seq', 1, false);


--
-- Name: site_icon_sync_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.site_icon_sync_logs_id_seq', 4, true);


--
-- Name: site_icons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.site_icons_id_seq', 1200, true);


--
-- Name: upstreams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.upstreams_id_seq', 1, false);


--
-- Name: user_levels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.user_levels_id_seq', 399, true);


--
-- Name: verification_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.verification_codes_id_seq', 1, false);


--
-- Name: volcengine_pool_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.volcengine_pool_accounts_id_seq', 9, true);


--
-- Name: volcengine_pool_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.volcengine_pool_logs_id_seq', 1, false);


--
-- Name: volcengine_pools_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.volcengine_pools_id_seq', 1, true);


--
-- Name: admin_groups admin_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.admin_groups
    ADD CONSTRAINT admin_groups_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_key_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_key_key UNIQUE (token_key);


--
-- Name: billing_rules billing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.billing_rules
    ADD CONSTRAINT billing_rules_pkey PRIMARY KEY (id);


--
-- Name: channel_configs channel_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.channel_configs
    ADD CONSTRAINT channel_configs_pkey PRIMARY KEY (id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: forward_rules forward_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.forward_rules
    ADD CONSTRAINT forward_rules_pkey PRIMARY KEY (id);


--
-- Name: gptimage_pool_account_mapping gptimage_pool_account_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_account_mapping
    ADD CONSTRAINT gptimage_pool_account_mapping_pkey PRIMARY KEY (pool_id, account_id);


--
-- Name: gptimage_pool_accounts gptimage_pool_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_accounts
    ADD CONSTRAINT gptimage_pool_accounts_pkey PRIMARY KEY (id);


--
-- Name: gptimage_pool_logs gptimage_pool_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_logs
    ADD CONSTRAINT gptimage_pool_logs_pkey PRIMARY KEY (id);


--
-- Name: gptimage_pools gptimage_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pools
    ADD CONSTRAINT gptimage_pools_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id);


--
-- Name: marketing_team_leaders marketing_team_leaders_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_leaders
    ADD CONSTRAINT marketing_team_leaders_pkey PRIMARY KEY (id);


--
-- Name: marketing_team_leaders marketing_team_leaders_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_leaders
    ADD CONSTRAINT marketing_team_leaders_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: marketing_team_members marketing_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_members
    ADD CONSTRAINT marketing_team_members_pkey PRIMARY KEY (id);


--
-- Name: marketing_team_members marketing_team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_team_members
    ADD CONSTRAINT marketing_team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: marketing_teams marketing_teams_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_teams
    ADD CONSTRAINT marketing_teams_invite_code_key UNIQUE (invite_code);


--
-- Name: marketing_teams marketing_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.marketing_teams
    ADD CONSTRAINT marketing_teams_pkey PRIMARY KEY (id);


--
-- Name: model_providers model_providers_name_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_providers
    ADD CONSTRAINT model_providers_name_key UNIQUE (name);


--
-- Name: model_providers model_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_providers
    ADD CONSTRAINT model_providers_pkey PRIMARY KEY (id);


--
-- Name: model_types model_types_name_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_types
    ADD CONSTRAINT model_types_name_key UNIQUE (name);


--
-- Name: model_types model_types_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.model_types
    ADD CONSTRAINT model_types_pkey PRIMARY KEY (id);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: orders orders_out_trade_no_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_out_trade_no_key UNIQUE (out_trade_no);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: playground_assets playground_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_assets
    ADD CONSTRAINT playground_assets_pkey PRIMARY KEY (id);


--
-- Name: playground_projects playground_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_projects
    ADD CONSTRAINT playground_projects_pkey PRIMARY KEY (id);


--
-- Name: plugin_api_logs plugin_api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_api_logs
    ADD CONSTRAINT plugin_api_logs_pkey PRIMARY KEY (id);


--
-- Name: plugin_asset_groups plugin_asset_groups_group_id_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_asset_groups
    ADD CONSTRAINT plugin_asset_groups_group_id_key UNIQUE (group_id);


--
-- Name: plugin_asset_groups plugin_asset_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_asset_groups
    ADD CONSTRAINT plugin_asset_groups_pkey PRIMARY KEY (id);


--
-- Name: plugin_assets plugin_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_assets
    ADD CONSTRAINT plugin_assets_pkey PRIMARY KEY (id);


--
-- Name: plugin_configs plugin_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_configs
    ADD CONSTRAINT plugin_configs_pkey PRIMARY KEY (id);


--
-- Name: plugin_configs plugin_configs_plugin_name_config_key_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_configs
    ADD CONSTRAINT plugin_configs_plugin_name_config_key_key UNIQUE (plugin_name, config_key);


--
-- Name: plugins plugins_name_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT plugins_name_key UNIQUE (name);


--
-- Name: plugins plugins_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT plugins_pkey PRIMARY KEY (id);


--
-- Name: recharge_records recharge_records_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.recharge_records
    ADD CONSTRAINT recharge_records_pkey PRIMARY KEY (id);


--
-- Name: redemptions redemptions_code_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_code_key UNIQUE (code);


--
-- Name: redemptions redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.redemptions
    ADD CONSTRAINT redemptions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: site_icon_sync_logs site_icon_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.site_icon_sync_logs
    ADD CONSTRAINT site_icon_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: site_icons site_icons_name_source_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.site_icons
    ADD CONSTRAINT site_icons_name_source_key UNIQUE (name, source);


--
-- Name: site_icons site_icons_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.site_icons
    ADD CONSTRAINT site_icons_pkey PRIMARY KEY (id);


--
-- Name: upstreams upstreams_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.upstreams
    ADD CONSTRAINT upstreams_pkey PRIMARY KEY (id);


--
-- Name: user_levels user_levels_group_key_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.user_levels
    ADD CONSTRAINT user_levels_group_key_key UNIQUE (group_key);


--
-- Name: user_levels user_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.user_levels
    ADD CONSTRAINT user_levels_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_uid_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_uid_key UNIQUE (uid);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: verification_codes verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.verification_codes
    ADD CONSTRAINT verification_codes_pkey PRIMARY KEY (id);


--
-- Name: volcengine_pool_account_mapping volcengine_pool_account_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_account_mapping
    ADD CONSTRAINT volcengine_pool_account_mapping_pkey PRIMARY KEY (pool_id, account_id);


--
-- Name: volcengine_pool_accounts volcengine_pool_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_accounts
    ADD CONSTRAINT volcengine_pool_accounts_pkey PRIMARY KEY (id);


--
-- Name: volcengine_pool_logs volcengine_pool_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_logs
    ADD CONSTRAINT volcengine_pool_logs_pkey PRIMARY KEY (id);


--
-- Name: volcengine_pools volcengine_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pools
    ADD CONSTRAINT volcengine_pools_pkey PRIMARY KEY (id);


--
-- Name: idx_pg_assets_project; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_pg_assets_project ON public.playground_assets USING btree (project_id);


--
-- Name: idx_pg_assets_type; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_pg_assets_type ON public.playground_assets USING btree (asset_type);


--
-- Name: idx_pg_assets_user; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_pg_assets_user ON public.playground_assets USING btree (user_id);


--
-- Name: idx_pg_projects_uid; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_pg_projects_uid ON public.playground_projects USING btree (uid);


--
-- Name: idx_pg_projects_user; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_pg_projects_user ON public.playground_projects USING btree (user_id);


--
-- Name: idx_plugin_assets_content_hash; Type: INDEX; Schema: public; Owner: tokensapi
--

CREATE INDEX idx_plugin_assets_content_hash ON public.plugin_assets USING btree (content_hash);


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: commissions commissions_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id);


--
-- Name: commissions commissions_recharge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_recharge_id_fkey FOREIGN KEY (recharge_id) REFERENCES public.recharge_records(id);


--
-- Name: commissions commissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: gptimage_pool_account_mapping gptimage_pool_account_mapping_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_account_mapping
    ADD CONSTRAINT gptimage_pool_account_mapping_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.gptimage_pool_accounts(id) ON DELETE CASCADE;


--
-- Name: gptimage_pool_account_mapping gptimage_pool_account_mapping_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.gptimage_pool_account_mapping
    ADD CONSTRAINT gptimage_pool_account_mapping_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.gptimage_pools(id) ON DELETE CASCADE;


--
-- Name: models models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.model_providers(id);


--
-- Name: models models_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.model_types(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: playground_assets playground_assets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_assets
    ADD CONSTRAINT playground_assets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.playground_projects(id) ON DELETE CASCADE;


--
-- Name: playground_assets playground_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_assets
    ADD CONSTRAINT playground_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: playground_projects playground_projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.playground_projects
    ADD CONSTRAINT playground_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: plugin_asset_groups plugin_asset_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_asset_groups
    ADD CONSTRAINT plugin_asset_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: plugin_assets plugin_assets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.plugin_assets
    ADD CONSTRAINT plugin_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: recharge_records recharge_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.recharge_records
    ADD CONSTRAINT recharge_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: volcengine_pool_account_mapping volcengine_pool_account_mapping_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_account_mapping
    ADD CONSTRAINT volcengine_pool_account_mapping_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.volcengine_pool_accounts(id) ON DELETE CASCADE;


--
-- Name: volcengine_pool_account_mapping volcengine_pool_account_mapping_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.volcengine_pool_account_mapping
    ADD CONSTRAINT volcengine_pool_account_mapping_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES public.volcengine_pools(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: tokensapi
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict hEdi2OEfZAHNgUd84WCQ9HoVB9n9h7QTIhiwP2PEuWUeqhdMBC4E2yTL5nbUnQ5

