--
-- PostgreSQL database dump
--

\restrict CDfQuaToMmZDdZnqLD5BGbp19BByc6wvS4FGf8MPD4dd5aWNcO3sojRmosUKq9o

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
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.billing_rules OWNER TO tokensapi;

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
    updated_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.channels OWNER TO tokensapi;

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
    created_at text DEFAULT (now())::text NOT NULL
);


ALTER TABLE public.logs OWNER TO tokensapi;

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
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.marketing_teams OWNER TO tokensapi;

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
    is_system integer DEFAULT 0 NOT NULL
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
    is_system integer DEFAULT 0 NOT NULL
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
    site_discount_enabled integer DEFAULT 0 NOT NULL
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
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.plugins OWNER TO tokensapi;

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
-- Name: admin_groups id; Type: DEFAULT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.admin_groups ALTER COLUMN id SET DEFAULT nextval('public.admin_groups_id_seq'::regclass);


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
-- Data for Name: admin_groups; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.admin_groups (id, name, permissions, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: api_tokens; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.api_tokens (id, user_id, token_key, name, quota_limit, quota_used, allowed_models, allowed_ips, ip_whitelist, rps_limit, rpm_limit, expires_at, is_active, remark, upstream_type, config, created_at, updated_at, kid) FROM stdin;
1	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	sk-e3459bd825279b4d091e8b9cfd3bb9b22743f8c43aa78a9c	default	-1	1.7709180000000004	[]		\N	0	0	\N	1	\N	other	\N	2026-04-24 02:21:27.496534+00	2026-04-24 07:32:20.850917+00	040526
\.


--
-- Data for Name: billing_rules; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.billing_rules (id, name, billing_type, prompt_rate, completion_rate, fixed_rate, duration_rate, billing_rule, pricing_tiers, extended_config, is_active, remark, upstream_type, config, created_at, updated_at) FROM stdin;
3	单次请求扣费 ($0.1)	requests	0	0	0.1	0	standard	[]	{}	1	\N	other	\N	2026-04-23 11:08:11.557049+00	2026-04-23 11:08:11.557049+00
4	按张计费	requests	0	0	0.1	0	per_image	[]	{}	1	\N	other	\N	2026-04-24 02:17:13.731429+00	2026-04-24 02:17:13.731429+00
2	标准 1M 万字计费 ($1)	tokens	1	2	0	0	standard	[]	{}	1	\N	other	\N	2026-04-23 11:08:11.557049+00	2026-04-24 02:17:30.023941+00
1	seedance2.0	tokens	0	0	0	0	seedance2.0	[]	{"resolution_rates":{"1080p":{"with_video":31,"without_video":51},"480p":{"with_video":28,"without_video":46},"720p":{"with_video":28,"without_video":46}}}	1	\N	other	\N	2026-04-23 11:08:11.557049+00	2026-04-24 02:19:17.548252+00
5	seedance2.0-fast	tokens	0	0	0	0	seedance2.0	[]	{"resolution_rates":{"480p":{"with_video":22,"without_video":37},"720p":{"with_video":22,"without_video":37}}}	1	\N	other	\N	2026-04-24 02:20:01.788415+00	2026-04-24 02:20:01.788415+00
\.


--
-- Data for Name: channel_configs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.channel_configs (id, name, provider_type, base_url, api_key, remark, created_at, updated_at) FROM stdin;
1	火山voice6688	ark	https://ark.cn-beijing.volces.com	403b1d69-2d5c-408b-9f93-4113b10a3dbb	\N	2026-04-24 02:15:41.981698+00	2026-04-24 02:15:41.981698+00
2	火山-seedance2.0-素材测试	ark	https://ark.cn-beijing.volces.com	ark-55eaacbc-b497-408e-8bcc-f5eb109b5c45-b016f	\N	2026-04-24 02:35:03.057628+00	2026-04-24 02:35:03.057628+00
3	new_api-中转	newAPI	http://208.98.41.154:3000	sk-sLzP434eWRAeHglvFpjbmfJYNVnmamNhMBgr2Dytobjea6o3	\N	2026-04-24 05:40:42.535882+00	2026-04-24 05:40:42.535882+00
4	new-api-mart	mart	https://api.apimart.ai	sk-VVUUVneRC8IeSKMRLbmDZ04Cc1TvUgV5YWyt38Et7zIL8FYG	\N	2026-04-24 05:51:21.750328+00	2026-04-24 05:51:21.750328+00
\.


--
-- Data for Name: channels; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.channels (id, name, provider_type, base_url, api_key, models, model_mapping, priority, weight, status, balance, max_rps, quota_limit, quota_used, config, user_groups, group_aid, preset_id, created_at, updated_at) FROM stdin;
1	火山测试号6688	custom			["doubao-seedream-4-0-250828","doubao-seed-2-0-mini-260215","doubao-seedance-1-0-pro-fast-251015"]	{}	0	1	1	\N	0	-1	0.40091800000000005	null	[]	5759	1	2026-04-24 02:21:13.628398+00	2026-04-24 03:00:14.699929+00
2	火山-素材转换	custom			["Doubao-Seed-2.0-fast"]	{"Doubao-Seed-2.0-fast":"ep-20260422152151-bgxm6"}	0	1	1	\N	0	-1	1	null	[]	6655	2	2026-04-24 02:35:27.712512+00	2026-04-24 03:07:20.953369+00
3	newAPI	custom			["gemini-3-pro-image-preview-1K","gemini-3-pro-image-preview"]	{}	0	1	1	\N	0	-1	0.09000000000000001	null	[]	8108	3	2026-04-24 05:43:17.126477+00	2026-04-24 05:45:33.117624+00
4	mart	custom			["gpt-image-2-official","doubao-seedance-1-0-mart"]	{"doubao-seedance-1-0-mart":"doubao-seedance-1-0-pro-fast"}	0	1	1	\N	0	-1	0.28	null	[]	6792	4	2026-04-24 05:55:15.086499+00	2026-04-24 07:40:41.151249+00
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
1	Google Gemini 格式转换 (聊天)	gemini	聊天	{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}	将标准请求转换并适配到 Gemini contents	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
3	OpenAI 兼容原生通道 (图片)	openai	图片	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/images/generations","new":"/v1/images/generations"}}	供图片生成调用的原生通道	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
12	mart	mart	图片	{\n  "mode": "passthrough",\n  "header_mapping": {\n    "Authorization": "Bearer ${api_key}"\n  },\n  "path_rewrite": {\n    "old": "/v1/images/generations",\n    "new": "/v1/images/generations"\n  },\n  "poll_path": "/v1/tasks/${task_id}"\n}	\N	1	0	\N	other	\N	2026-04-24 08:18:06.183445+00	2026-04-24 08:18:41.709783+00
2	火山方舟 视频素材转换	volcengine	视频	{"mode":"transform","target_type":"volcengine","asset_convert":true,"path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}	在火山方舟视频生成基础上，自动将 content 中的网络 URL 通过 CreateAsset API 转换为素材 ID（asset://前缀），需配置素材资产管理插件的审核凭证	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
4	Anthropic 原生转化	anthropic	聊天	{"mode":"transform","target_type":"anthropic","header_mapping":{"x-api-key":"${api_key}","anthropic-version":"2023-06-01"},"body_transform":{"extract_to_contents":true}}	转换 Messages 格式，注入专有 Header	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
5	Google Gemini 流式转换 (聊天)	gemini	聊天	{"mode":"transform","target_type":"gemini","path_rewrite":{"old":"/v1/chat/completions","new":"/v1beta/models/${model}:streamGenerateContent?alt=sse"},"auth_type":"query_key"}	将标准请求转换为支持流式输出的 Gemini contents	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
6	火山方舟 图片生成	volcengine	图片	{"mode":"transform","target_type":"volcengine_image","path_rewrite":{"old":"/v1/images/generations","new":"/api/v3/images/generations"},"auth_type":"bearer"}	将标准的图片生成请求转发到火山方舟官方 images 接口，body 保持 OpenAI 兼容格式	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
7	OpenAI 兼容原生通道 (视频)	openai	视频	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/video/generations","new":"/v1/video/generations"}}	供视频生成调用的原生通道	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
8	OpenAI 兼容原生通道 (聊天)	openai	聊天	{"mode":"passthrough","header_mapping":{"Authorization":"Bearer ${api_key}"},"path_rewrite":{"old":"/v1/chat/completions","new":"/v1/chat/completions"}}	标准的按路径聊天透传规则	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
9	火山方舟 视频生成	volcengine	视频	{"mode":"transform","target_type":"volcengine","path_rewrite":{"old":"/v1/video/generations","new":"/api/v3/contents/generations/tasks"},"auth_type":"bearer"}	将标准的视频生成请求适配到火山方舟 tasks 接口	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
10	Google Gemini 原生生图	gemini	图片	{"mode":"transform","target_type":"gemini_image","path_rewrite":{"old":"/v1/images/generations","new":"/v1beta/models/${model}:generateContent"},"auth_type":"query_key"}	将标准的生图请求适配到 Gemini contents 接口	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
11	火山方舟 聊天	volcengine	聊天	{"mode":"transform","target_type":"volcengine_chat","path_rewrite":{"old":"/v1/chat/completions","new":"/api/v3/chat/completions"},"auth_type":"bearer"}	将标准的聊天请求转发到火山方舟官方 Chat 接口，body 保持 OpenAI 兼容格式	1	1	\N	other	\N	2026-04-23 11:08:11.548635+00	2026-04-23 11:08:11.548635+00
\.


--
-- Data for Name: logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.logs (id, user_id, channel_id, token_id, model, prompt_tokens, completion_tokens, cost, latency_ms, status_code, endpoint, error_message, upstream_url, request_content, response_content, upstream_req_content, is_stream, billing_detail, created_at) FROM stdin;
1	unknown	0	0	unknown	0	0	0	0	401	/images/generations	Invalid API Key		\N	\N	\N	0		2026-04-24 02:22:04.93851+00
2	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedream-4-0-250828	0	4176	0.1	13157	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","n":2,"prompt":"把图片中的女神衣服颜色换成白色的，其它保持不变","size":"1k","watermark":true}	{"model":"doubao-seedream-4-0-250828","created":1776997365,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021776997353604fcaf69e354b9959077c8dee8e8ff31e0f35608_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T022245Z&X-Tos-Expires=86400&X-Tos-Signature=f957128d37cabb5c77f7b6cba494d9f7310692e8834d12a349a3b812989933f1&X-Tos-SignedHeaders=host","size":"928x1152"}],"usage":{"generated_images":1,"output_tokens":4176,"total_tokens":4176}}\n	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","prompt":"把图片中的女神衣服颜色换成白色的，其它保持不变","sequential_image_generation":"auto","sequential_image_generation_options":{"max_images":2},"size":"1k","watermark":true}	0	固定按次计费 -> (1量 * 0.1单价 * 1.00倍率) | 等级折扣	2026-04-24 02:22:45.234306+00
3	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedream-4-0-250828	0	4176	0.1	13093	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","n":2,"prompt":"把图片中的女神衣服颜色换成白色的，其它保持不变","size":"1k","watermark":true}	{"model":"doubao-seedream-4-0-250828","created":1776997464,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021776997451735fcaf69e354b9959077c8dee8e8ff31e0a1fb76_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T022424Z&X-Tos-Expires=86400&X-Tos-Signature=34819bcfb796a42ea557e3c3c509ba3f0e7a919d6f4ff70fdaeda325fe5e5d40&X-Tos-SignedHeaders=host","size":"928x1152"}],"usage":{"generated_images":1,"output_tokens":4176,"total_tokens":4176}}\n	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","prompt":"把图片中的女神衣服颜色换成白色的，其它保持不变","sequential_image_generation":"auto","sequential_image_generation_options":{"max_images":2},"size":"1k","watermark":true}	0	按张返回计费 -> (1量 * 0.1单价 * 1.00倍率) | 等级折扣	2026-04-24 02:24:24.638521+00
4	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedream-4-0-250828	0	8112	0.2	57941	200	/v1/images/generations	\N	https://ark.cn-beijing.volces.com/api/v3/images/generations	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","n":2,"prompt":"生成3组图片中的女神衣服颜色换成白色的，其它保持不变","size":"1k","watermark":true}	{"model":"doubao-seedream-4-0-250828","created":1776997610,"data":[{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T022648Z&X-Tos-Expires=86400&X-Tos-Signature=34d12a356da8576cc593cc51f591d58d2fa71a2c8b4f24363df04e2c56769b24&X-Tos-SignedHeaders=host","size":"832x1248"},{"url":"https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-4-0/021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_1.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T022650Z&X-Tos-Expires=86400&X-Tos-Signature=62712a2ff47a989453a5b21d71302bc5de3d26c786dad4517406667ccee331fe&X-Tos-SignedHeaders=host","size":"832x1248"}],"usage":{"generated_images":2,"output_tokens":8112,"total_tokens":8112}}\n	{"image":["https://control.ldreamai.com/web/uploads/visual_file/mall1/2026-01-12/69646658680c4.png"],"model":"doubao-seedream-4-0-250828","prompt":"生成3组图片中的女神衣服颜色换成白色的，其它保持不变","sequential_image_generation":"auto","sequential_image_generation_options":{"max_images":2},"size":"1k","watermark":true}	0	按张返回计费 -> (2量 * 0.1单价 * 1.00倍率) | 等级折扣	2026-04-24 02:26:50.451406+00
5	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	0	0	doubao-seed-2-0-mini-260215	0	0	0	0	404	/v1/chat/completions	No available channels found for model doubao-seed-2-0-mini-260215		\N	\N	\N	0		2026-04-24 02:58:28.425812+00
6	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seed-2-0-mini-260215	51	272	0.0005355000000000001	5103	200	/v1/chat/completions	\N	https://ark.cn-beijing.volces.com/api/v3/chat/completions	{"messages":[{"content":"今天几号","role":"user"}],"model":"doubao-seed-2-0-mini-260215","stream":true}	data: {"choices":[{"delta":{"content":"","reasoning_content":"用户","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"现在","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"问","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"几号","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，但","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"首先","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"我","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"没办法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"对吧","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"？","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"首先","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"得","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"跟","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"用户","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"说明","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"这个","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"情况","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"然后","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"告诉","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"用户","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"怎么","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"查","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"比如","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"看","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"手机","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日历","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"、","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"电脑","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"系统","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"时间","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"或者","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"如果","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"要","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"知道","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"当前","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"公历","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"也","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"说","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"一下","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"如果","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"在","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"特定","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"场景","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"下","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"话","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"提示","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"他","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"提供","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"所在","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"地区","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"或者","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"更","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"具体","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"信息","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"？","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"不对","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"应该","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"更","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"直接","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"一点","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"首先","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"说明","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"我","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"无法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"当前","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"然后","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"建议","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"用户","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"查看","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"自己","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"设备","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日历","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"、","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"时钟","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"应用","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"来","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"准确","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"也","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"说","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"如果","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"有","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"其他","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"和","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"相关","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"问题","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"比如","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"节日","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"、","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"节气","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"之类","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"要是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"知道","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"大概","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"月份","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"帮忙","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"解答","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"？","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"等","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"下","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"用户","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"只是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"问","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"几号","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"首先","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"得","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"明确","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"作为","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"AI","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"我","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"没有","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"联网","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"当前","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"时间","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"功能","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"所以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"没办法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"直接","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"告诉你","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"准确","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"对吧","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"？","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"那","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"组织","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"语言","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"话","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"应该","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"友好","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"一点","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"：","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"“","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"抱歉","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"呀","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"我","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"没办法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"当前","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"你","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"通过","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"手机","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"日历","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"、","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"电脑","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"系统","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"时钟","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"或者","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"其他","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"查询","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"工具","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"来","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"查看","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"具体","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"几号","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"哦","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"😉","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"”","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":" ","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"对","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"这样","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"就","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"了","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"不要","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"太","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"复杂","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"清晰","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"说明","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"原因","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"和","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"解决","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"办法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","reasoning_content":"。","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"抱歉","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"呀","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"我","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"没办法","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"获取","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"的","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"当前","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"日期","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"，","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"你","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"可以","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"通过","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"手机","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"日历","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"、","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"电脑","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"系统","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"时钟","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"或者","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"其他","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"实时","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"查询","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"工具","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"来","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"查看","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"今天","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"具体","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"是","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"几号","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"哦","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"😉","role":"assistant"},"index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[{"delta":{"content":"","role":"assistant"},"finish_reason":"stop","index":0}],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":null}\ndata: {"choices":[],"created":1776999540,"id":"02177699954035643854e365f1eb1011ffcf5b03a34eea33656ee","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion.chunk","usage":{"completion_tokens":272,"prompt_tokens":51,"total_tokens":323,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":238}}}\ndata: [DONE]\n	{"messages":[{"content":"今天几号","role":"user"}],"model":"doubao-seed-2-0-mini-260215","stream":true,"stream_options":{"include_usage":true}}	1	标准 Tokens 计费 -> (51P*1 + 272C*2)/1M * 0.90倍率 | 等级折扣	2026-04-24 02:59:05.270156+00
7	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seed-2-0-mini-260215	51	187	0.0003825	1791	200	/v1/chat/completions	\N	https://ark.cn-beijing.volces.com/api/v3/chat/completions	{"messages":[{"content":"今天几号","role":"user"}],"model":"doubao-seed-2-0-mini-260215"}	{"choices":[{"finish_reason":"stop","index":0,"logprobs":null,"message":{"content":"不好意思呀，我没办法获取实时的当前日期哦，你可以通过手机日历、电脑右下角的状态栏或者其他电子设备的日期显示功能，就能看到今天具体是几号啦～","reasoning_content":"用户现在问今天几号，但首先我没办法获取实时的日期啊，得跟用户说明这个情况，然后告诉用户可以怎么查看，比如看手机日历、电脑右下角之类的，还要友好一点。首先先解释一下，因为我没有实时联网获取当前日期的功能，没办法直接告诉你今天具体是哪一天，然后建议用户通过自己的手机、电脑或者其他电子设备的日历功能来查看准确的日期。对，还要说得自然一点，不要太生硬。比如可以这么说：“不好意思呀，我没办法获取实时的当前日期哦，你可以通过手机日历、电脑右下角的状态栏或者其他电子设备的日期显示功能，就能看到今天具体是几号啦～”","role":"assistant"}}],"created":1776999614,"id":"02177699961293943854e365f1eb1011ffcf5b03a34eea3eb1699","model":"doubao-seed-2-0-mini-260215","service_tier":"default","object":"chat.completion","usage":{"completion_tokens":187,"prompt_tokens":51,"total_tokens":238,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":148}}}	{"messages":[{"content":"今天几号","role":"user"}],"model":"doubao-seed-2-0-mini-260215"}	0	标准 Tokens 计费 -> (51P*1 + 187C*2)/1M * 0.90倍率 | 等级折扣	2026-04-24 03:00:14.699929+00
8	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	2	1	Doubao-Seed-2.0-fast	0	0	0	973	400	/v1/video/generations	{"error":{"code":"InvalidParameter","message":"The parameter `content[1].image_url` specified in the request is not valid. Request id: 021776999978057657765fc6300cdd4e93f5ef1ddfe5d42cac658","param":"content[1].image_url","type":"BadRequest"}}	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"duration":4,"generate_audio":true,"images":["asset-20260424104515-fdl67"],"model":"Doubao-Seed-2.0-fast","prompt":"把小狗狗加入进去，和谐相处","ratio":"4:3","resolution":"480p"}	{"error":{"code":"InvalidParameter","message":"The parameter `content[1].image_url` specified in the request is not valid. Request id: 021776999978057657765fc6300cdd4e93f5ef1ddfe5d42cac658","param":"content[1].image_url","type":"BadRequest"}}	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"asset-20260424104515-fdl67"},"role":"first_frame","type":"image_url"}],"duration":4,"generate_audio":true,"model":"ep-20260422152151-bgxm6","ratio":"4:3","resolution":"480p"}	0	素材转换: [asset-20260424104515-fdl67] 跳过: 不支持的格式	2026-04-24 03:06:18.294194+00
12	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedance-1-0-pro-fast-251015	0	47311	0.0851598	26531	200	/api/v3/contents/generations/tasks	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"},"role":"first_frame","type":"image_url"}],"generate_audio":true,"model":"doubao-seedance-1-0-pro-fast-251015","ratio":"4:3","resolution":"480p"}	{"id":"cgt-20260424131416-vk8kz","model":"doubao-seedance-1-0-pro-fast-251015","status":"succeeded","content":{"video_url":"https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-1-0-pro-fast/02177700765908500000000000000000000ffffac154595bb4024.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T051440Z&X-Tos-Expires=86400&X-Tos-Signature=ffbb2ef8928753ff55db3da38fa62593008f874e509c93a67eb2be18d130fd0e&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":47311,"total_tokens":47311},"created_at":1777007658,"updated_at":1777007680,"seed":84338,"resolution":"480p","ratio":"4:3","duration":5,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":true,"draft":false}\n	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"},"role":"first_frame","type":"image_url"}],"generate_audio":true,"model":"doubao-seedance-1-0-pro-fast-251015","ratio":"4:3","resolution":"480p"}	0	标准 Tokens 计费 -> (0P*1 + 47311C*2)/1M * 0.90倍率 | 等级折扣 | [后台自动轮询结算]	2026-04-24 05:14:16.746343+00
9	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	2	1	Doubao-Seed-2.0-fast	0	39891	1.3283703	1886973	200	/v1/video/generations	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"duration":4,"generate_audio":true,"images":["asset://asset-20260424104515-fdl67"],"model":"Doubao-Seed-2.0-fast","prompt":"把小狗狗加入进去，和谐相处","ratio":"4:3","resolution":"480p"}	{"id":"cgt-20260424110722-cj7rp","model":"doubao-seedance-2-0-fast-260128","status":"succeeded","content":{"video_url":"https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-2-0-fast/02177700004307400000000000000000000ffffac1545ae458664.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T030910Z&X-Tos-Expires=86400&X-Tos-Signature=36f22dbe2188366a8d1e59398bf3074942f666700a1f186c209cc0835fe0f971&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":39891,"total_tokens":39891},"created_at":1777000043,"updated_at":1777000161,"seed":63402,"resolution":"480p","ratio":"4:3","duration":4,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":true,"draft":false}\n	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"asset://asset-20260424104515-fdl67"},"role":"first_frame","type":"image_url"}],"duration":4,"generate_audio":true,"model":"ep-20260422152151-bgxm6","ratio":"4:3","resolution":"480p"}	0	Seedance2.0(480p|无视频|基本单价:37) -> (0P*37 + 39891C*37)/1M * 0.90倍率 | 等级折扣 | [后台自动轮询结算]	2026-04-24 03:07:20.953369+00
10	unknown	0	0	unknown	0	0	0	0	401	/video/generations	Invalid API Key		\N	\N	\N	0		2026-04-24 05:12:39.333315+00
11	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedance-1-0-pro-fast-251015	0	47311	0.0851598	70963	200	/v1/video/generations	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"generate_audio":false,"images":["https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"],"model":"doubao-seedance-1-0-pro-fast-251015","prompt":"把小狗狗加入进去，和谐相处","ratio":"4:3","resolution":"480p"}	{"id":"cgt-20260424131332-gzcjb","model":"doubao-seedance-1-0-pro-fast-251015","status":"succeeded","content":{"video_url":"https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-1-0-pro-fast/02177700761497900000000000000000000ffffac154595f5784b.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T051355Z&X-Tos-Expires=86400&X-Tos-Signature=a04620a0ec5744208a2c93c98ec036629187fde3cd503add78e1ef9dd97651b3&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":47311,"total_tokens":47311},"created_at":1777007614,"updated_at":1777007635,"seed":54044,"resolution":"480p","ratio":"4:3","duration":5,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":false,"draft":false}\n	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"},"role":"first_frame","type":"image_url"}],"generate_audio":false,"model":"doubao-seedance-1-0-pro-fast-251015","ratio":"4:3","resolution":"480p"}	0	标准 Tokens 计费 -> (0P*1 + 47311C*2)/1M * 0.90倍率 | 等级折扣 | [后台自动轮询结算]	2026-04-24 05:13:32.654761+00
14	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	3	1	gemini-3-pro-image-preview-1K	0	0	0	760	503	/v1/images/generations	{"error":{"code":"model_not_found","message":"No available channel for model gemini-3-pro-image-preview-1K under group gemini (distributor) (request id: 202604240544111824585428268d9d6xiMy88lj)","type":"new_api_error"}}	http://208.98.41.154:3000/v1/images/generations	{"model":"gemini-3-pro-image-preview-1K","prompt":"小狗"}	{"error":{"code":"model_not_found","message":"No available channel for model gemini-3-pro-image-preview-1K under group gemini (distributor) (request id: 202604240544111824585428268d9d6xiMy88lj)","type":"new_api_error"}}	{"model":"gemini-3-pro-image-preview-1K","prompt":"小狗"}	0	\N	2026-04-24 05:44:08.818567+00
17	unknown	0	0	unknown	0	0	0	0	401	/v1/tasks/task_01KPZ0ZC0ZMTA07JJ8D6PFATE9	Missing Authorization Header		\N	\N	\N	0		2026-04-24 05:58:03.471128+00
13	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1	1	doubao-seedance-1-0-pro-fast-251015	0	47311	0.0851598	81123	200	/api/v3/contents/generations/tasks	\N	https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"},"role":"first_frame","type":"image_url"}],"generate_audio":true,"model":"doubao-seedance-1-0-pro-fast-251015","ratio":"4:3","resolution":"480p"}	{"id":"cgt-20260424132428-n4nb9","model":"doubao-seedance-1-0-pro-fast-251015","status":"succeeded","content":{"video_url":"https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/doubao-seedance-1-0-pro-fast/02177700827668200000000000000000000ffffac1545952fa249.mp4?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260424%2Fcn-beijing%2Ftos%2Frequest&X-Tos-Date=20260424T052457Z&X-Tos-Expires=86400&X-Tos-Signature=31ff70561cfab6b5ffe97beb3fc02ec401bde23cc80e617264e83e8e8443f865&X-Tos-SignedHeaders=host"},"usage":{"completion_tokens":47311,"total_tokens":47311},"created_at":1777008275,"updated_at":1777008298,"seed":65665,"resolution":"480p","ratio":"4:3","duration":5,"framespersecond":24,"service_tier":"default","execution_expires_after":172800,"generate_audio":true,"draft":false}\n	{"content":[{"text":"把小狗狗加入进去，和谐相处","type":"text"},{"image_url":{"url":"https://control.ldreamai.com/web/uploads/visual_file/2025-10-31/69042a54aaee2.jpg"},"role":"first_frame","type":"image_url"}],"generate_audio":true,"model":"doubao-seedance-1-0-pro-fast-251015","ratio":"4:3","resolution":"480p"}	0	标准 Tokens 计费 -> (0P*1 + 47311C*2)/1M * 0.90倍率 | 等级折扣 | [后台自动轮询结算]	2026-04-24 05:24:33.513643+00
15	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	3	1	gemini-3-pro-image-preview	2	1337	0.09000000000000001	53642	200	/v1/images/generations	\N	http://208.98.41.154:3000/v1beta/models/gemini-3-pro-image-preview:generateContent	{"model":"gemini-3-pro-image-preview","prompt":"小狗"}	{\n  "candidates": [\n    {\n      "content": {\n        "role": "model",\n        "parts": [\n          {\n            "inlineData": {\n              "mimeType": "image/png",\n              "data": "base64数据"\n            },\n            "thoughtSignature": "base64数据"\n          }\n        ]\n      },\n      "finishReason": "STOP"\n    }\n  ],\n  "usageMetadata": {\n    "promptTokenCount": 2,\n    "candidatesTokenCount": 1120,\n    "totalTokenCount": 1339,\n    "trafficType": "ON_DEMAND",\n    "promptTokensDetails": [\n      {\n        "modality": "TEXT",\n        "tokenCount": 2\n      }\n    ],\n    "candidatesTokensDetails": [\n      {\n        "modality": "IMAGE",\n        "tokenCount": 1120\n      }\n    ],\n    "thoughtsTokenCount": 217\n  },\n  "modelVersion": "gemini-3-pro-image-preview",\n  "createTime": "2026-04-24T05:44:49.057572Z",\n  "responseId": "UQPraeTBA76_odAPl9DGoAE"\n}\n	{"contents":[{"parts":[{"text":"小狗"}]}],"generationConfig":{"responseModalities":["IMAGE"]}}	0	按张返回计费 -> (1量 * 0.1单价 * 0.90倍率) | 等级折扣	2026-04-24 05:45:33.117624+00
16	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	4	1	gpt-image-2-official	0	0	0.09000000000000001	655	200	/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	{"model":"gpt-image-2-official","prompt":"小狗","size":"16:9"}	{"code":200,"data":{"actual_time":21,"completed":1777010213,"created":1777010192,"estimated_time":60,"id":"task_01KPZ0ZC0ZMTA07JJ8D6PFATE9","progress":100,"result":{"images":[{"expires_at":1777096613,"url":["https://upload.apimart.ai/f/image/9998222989786939-febc4ca4-ae80-4e42-9d34-822aeed8d64e-gpt_image_2_official_task_01KPZ10063FCS5PFVHJMNY0HWC_0.png"]}]},"status":"completed"}}	{"model":"gpt-image-2-official","prompt":"小狗","size":"16:9"}	0	按张返回计费 -> (1量 * 0.1单价 * 0.90倍率) | 等级折扣	2026-04-24 05:56:29.988074+00
18	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	4	1	gpt-image-2-official	0	0	0.09000000000000001	2051	200	/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	{"model":"gpt-image-2-official","n":2,"prompt":"小狗和小猫","size":"16:9"}	{"code":200,"data":{"actual_time":25,"completed":1777015065,"created":1777015040,"estimated_time":60,"id":"task_01KPZ5KA6N7MK8N1CBCS9YYF7S","progress":100,"result":{"images":[{"expires_at":1777101465,"url":["https://upload.apimart.ai/f/image/9998222984937664-314d754d-2e40-4adb-a5db-4a89c59d95eb-gpt_image_2_official_task_01KPZ5KZSWE255RYNQZ53E3TS0_0.png","https://upload.apimart.ai/f/image/9998222984936204-72f8d6fb-77d7-408f-bfff-fab1322f51b2-gpt_image_2_official_task_01KPZ5KZSWE255RYNQZ53E3TS0_1.png"]}]},"status":"completed"}}	{"model":"gpt-image-2-official","n":2,"prompt":"小狗和小猫","size":"16:9"}	0	按张返回计费 -> (1量 * 0.1单价 * 0.90倍率) | 等级折扣	2026-04-24 07:17:17.608642+00
19	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	4	1	gpt-image-2-official	0	0	0.1	877	200	/v1/images/generations	\N	https://api.apimart.ai/v1/images/generations	{"model":"gpt-image-2-official","n":2,"prompt":"一群狗","size":"16:9"}	{"code":200,"data":[{"status":"submitted","task_id":"task_01KPZ6EW4JEC7GDGYRTG60R189"}]}	{"model":"gpt-image-2-official","n":2,"prompt":"一群狗","size":"16:9"}	0	异步任务预扣费冻结	2026-04-24 07:32:20.850917+00
\.


--
-- Data for Name: marketing_team_leaders; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_team_leaders (id, team_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: marketing_team_members; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_team_members (id, team_id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: marketing_teams; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.marketing_teams (id, name, description, invite_code, max_members, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: model_providers; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.model_providers (id, name, sort_order, is_active, remark, upstream_type, config, created_at, updated_at, is_system) FROM stdin;
1	火山引擎	1	1	\N	other	\N	2026-04-23 11:08:11.602886+00	2026-04-23 11:08:11.602886+00	1
2	谷歌	2	1	\N	other	\N	2026-04-23 11:08:11.602886+00	2026-04-23 11:08:11.602886+00	1
3	阿里云	3	1	\N	other	\N	2026-04-23 11:08:11.602886+00	2026-04-23 11:08:11.602886+00	1
49	gpt	0	1	\N	other	\N	2026-04-24 05:54:25.605804+00	2026-04-24 05:54:25.605804+00	0
\.


--
-- Data for Name: model_types; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.model_types (id, name, sort_order, is_active, remark, upstream_type, config, created_at, updated_at, is_system) FROM stdin;
1	视频	1	1	\N	other	\N	2026-04-23 11:08:11.60333+00	2026-04-23 11:08:11.60333+00	1
2	图片	2	1	\N	other	\N	2026-04-23 11:08:11.60333+00	2026-04-23 11:08:11.60333+00	1
3	音频	3	1	\N	other	\N	2026-04-23 11:08:11.60333+00	2026-04-23 11:08:11.60333+00	1
4	聊天	4	1	\N	other	\N	2026-04-23 11:08:11.60333+00	2026-04-23 11:08:11.60333+00	1
\.


--
-- Data for Name: models; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.models (id, name, model_id, provider_id, type_id, group_ratios, is_active, remark, upstream_type, config, enable_log_content, forward_rule_ids, billing_rule_id, pre_deduction, created_at, updated_at, mid, site_discount, site_discount_enabled) FROM stdin;
8	gpt-image-2-official	gpt-image-2-official	49	2	null	1	\N	other	\N	1	[12]	4	0.1	2026-04-24 05:55:00.240844+00	2026-04-24 08:19:38.745355+00	305169	1	0
1	doubao-seedream-4-0-250828	doubao-seedream-4-0-250828	1	2	null	1	\N	other	\N	1	[6]	4	0.1	2026-04-24 02:16:49.118687+00	2026-04-24 02:23:59.812979+00	300669	1	0
2	doubao-seed-2-0-mini-260215	doubao-seed-2-0-mini-260215	1	4	null	1	\N	other	\N	1	[11]	2	0	2026-04-24 02:30:26.743584+00	2026-04-24 02:30:26.743584+00	306300	1	0
3	doubao-seedance-1-0-pro-fast-251015	doubao-seedance-1-0-pro-fast-251015	1	1	null	1	\N	other	\N	1	[9]	2	0	2026-04-24 02:31:09.032051+00	2026-04-24 02:31:09.032051+00	303765	1	0
4	doubao-seedance-2-0-fast-260128	doubao-seedance-2-0-fast-260128	1	1	null	1	\N	other	\N	1	[9]	5	0	2026-04-24 02:31:38.682243+00	2026-04-24 02:31:38.682243+00	307114	1	0
5	Doubao-Seed...ce-2.0-fast	Doubao-Seed-2.0-fast	1	1	null	1	\N	other	\N	1	[2]	5	1	2026-04-24 02:36:10.796954+00	2026-04-24 02:57:30.967677+00	301395	1	0
6	gemini-3-pro-image-preview	gemini-3-pro-image-preview	2	2	null	1	\N	other	\N	1	[10,5,1]	4	0.5	2026-04-24 05:42:11.468048+00	2026-04-24 05:42:11.468048+00	302898	1	0
7	gemini-3-pro-image-preview-1K	gemini-3-pro-image-preview-1K	2	2	null	1	\N	other	\N	1	[10,5,3,1]	4	0.4	2026-04-24 05:42:56.005957+00	2026-04-24 05:42:56.005957+00	304853	1	0
9	doubao-seedance-1-0-mart	doubao-seedance-1-0-mart	49	1	null	1	\N	other	\N	1	[7]	2	1	2026-04-24 07:40:08.879616+00	2026-04-24 07:40:08.879616+00	305403	1	0
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
\.


--
-- Data for Name: playground_projects; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.playground_projects (id, user_id, uid, name, description, cover_url, canvas_data, is_deleted, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: plugin_api_logs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_api_logs (id, user_id, plugin_name, api_endpoint, request_payload, response_payload, status_code, created_at, source) FROM stdin;
1	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"abc","Description":"abc","GroupType":"AIGC","ProjectName":"default"}	{"ResponseMetadata":{"RequestId":"20260424100134B7CCC111C2EDC5D18628","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"SubscriptionRequired","Message":"This API requires an active subscription. Please subscribe to an advanced or premium plan.","Data":null}}}	403	2026-04-24 02:01:34.525657+00	page
2	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"abc","Description":"abc","GroupType":"AIGC","ProjectName":"default"}	{"ResponseMetadata":{"RequestId":"20260424100143A490FC3D384F2DEB348B","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"SubscriptionRequired","Message":"This API requires an active subscription. Please subscribe to an advanced or premium plan.","Data":null}}}	403	2026-04-24 02:01:43.212739+00	page
3	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"abc","Description":"abc","GroupType":"AIGC","ProjectName":"default"}	{"ResponseMetadata":{"RequestId":"2026042410040412F2A33B6BCD73556723","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"SubscriptionRequired","Message":"This API requires an active subscription. Please subscribe to an advanced or premium plan.","Data":null}}}	403	2026-04-24 02:04:04.772714+00	page
4	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"abc","Description":"abc","GroupType":"AIGC","ProjectName":"default"}	{"ResponseMetadata":{"RequestId":"20260424100408D6FFAFE1FD89C3FA849D","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"SubscriptionRequired","Message":"This API requires an active subscription. Please subscribe to an advanced or premium plan.","Data":null}}}	403	2026-04-24 02:04:08.736915+00	page
5	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"安倍","Description":"asd","GroupType":"AIGC","ProjectName":"default"}	{"ResponseMetadata":{"RequestId":"2026042410071618EC8EEDF514CAEA8DFD","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing","Error":{"Code":"SubscriptionRequired","Message":"This API requires an active subscription. Please subscribe to an advanced or premium plan.","Data":null}}}	403	2026-04-24 02:07:16.213018+00	page
6	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"test","Description":"test","GroupType":"AIGC","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"202604241036531F5D6F9E443297EE7804","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260424103653-9g8kt"}}	200	2026-04-24 02:36:53.534646+00	page
7	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"ABC","Description":"ABC","GroupType":"AIGC","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"202604241042320311626A6D7F4FF07CD7","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260424104232-bd2lm"}}	200	2026-04-24 02:42:32.994343+00	page
8	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	DeleteAssetGroup	{"Id":"group-20260424103653-9g8kt","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"20260424104317CD23B80E55E9C5F964CD","Action":"DeleteAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260424103653-9g8kt"}}	200	2026-04-24 02:43:17.262308+00	page
9	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAsset	{"GroupId":"group-20260424104232-bd2lm","URL":"https://test-song-24.tos-cn-guangzhou.volces.com/1002353040/ABC/14c0ef8b-df39-49d6-8661-533797fa6f46.jpeg","AssetType":"Image","Name":"021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_0.jpeg","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"20260424104515031DAFFE1A7C5DF5C165","Action":"CreateAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260424104515-fdl67"}}	200	2026-04-24 02:45:16.010651+00	page
10	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	GetAsset	{"Id":"asset-20260424104515-fdl67","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"202604241045211832DBB8CE4FD04E71ED","Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260424104515-fdl67","Name":"021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_0.jpeg","URL":"","AssetType":"Image","GroupId":"group-20260424104232-bd2lm","Status":"Processing","CreateTime":"2026-04-24T02:45:15Z","UpdateTime":"2026-04-24T02:45:17Z","ProjectName":"chenzs"}}	200	2026-04-24 02:45:22.04061+00	page
11	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	GetAsset	{"Id":"asset-20260424104515-fdl67","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"2026042410452700910E11D940E100FEB0","Action":"GetAsset","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"asset-20260424104515-fdl67","Name":"021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_0.jpeg","URL":"https://ark-media-asset.tos-cn-beijing.volces.com/2123777871/042410451536150045.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256\\u0026X-Tos-Credential=AKTP0VyX37NH37peqQWqz0vNsmHzIyWlBuAp0aDqdZu1iD%2F20260424%2Fcn-beijing%2Ftos%2Frequest\\u0026X-Tos-Date=20260424T024527Z\\u0026X-Tos-Expires=43200\\u0026X-Tos-Security-Token=nChBvMlNIdFphUGtMcUtHWld2.CiQKEHVNU1JGYmN4M1BjUm9iVlMSEO1WjzLwG03Fm7B6t5yOp8kQ_ICpzwYYrc-rzwYg-v3I6QcoBDCs7-stOh9Sb2xlRm9yQXJrQXNzZXQvUm9sZUZvckFya0Fzc2V0QgNhcmtSD1JvbGVGb3JBcmtBc3NldFgDegNhcms.zUARlMmeayAJU15r7rd9kpiOyv2J1p7uBYxC_udtGVzn8czmK68L8QnjkGgJvW9wtL44gcq1mlg_BWvZ9a4FNQ\\u0026X-Tos-Signature=bbd2e1820bf90ee4e9f651e92d75f70bd453837aed058d99a7f5e784295f19c8\\u0026X-Tos-SignedHeaders=host","AssetType":"Image","GroupId":"group-20260424104232-bd2lm","Status":"Active","CreateTime":"2026-04-24T02:45:15Z","UpdateTime":"2026-04-24T02:45:24Z","ProjectName":"chenzs"}}	200	2026-04-24 02:45:27.125053+00	page
12	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	asset_manager	CreateAssetGroup	{"Name":"tokensbyte_auto_generated_group","Description":"由 Tokensbyte 系统自动生成的转换素材专用群组","GroupType":"AIGC","ProjectName":"chenzs"}	{"ResponseMetadata":{"RequestId":"2026042411061735FAA2F731C71BDC95B7","Action":"CreateAssetGroup","Version":"2024-01-01","Service":"ark","Region":"cn-beijing"},"Result":{"Id":"group-20260424110617-46fzg"}}	200	2026-04-24 03:06:17.783487+00	relay_convert
\.


--
-- Data for Name: plugin_asset_groups; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_asset_groups (id, user_id, group_id, name, description, created_at, updated_at) FROM stdin;
2	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	group-20260424104232-bd2lm	ABC	ABC	2026-04-24 02:42:35.579647+00	2026-04-24 02:42:35.579647+00
\.


--
-- Data for Name: plugin_assets; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_assets (id, user_id, asset_type, source, status, file_name, file_url, mime_type, size, reject_reason, category, asset_id, sort_order, remark, group_id, created_at, updated_at, content_hash) FROM stdin;
2	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	image	user	approved	021776997552766fcaf69e354b9959077c8dee8e8ff31e072f3bf_0.jpeg	https://test-song-24.tos-cn-guangzhou.volces.com/1002353040/ABC/14c0ef8b-df39-49d6-8661-533797fa6f46.jpeg	image/jpeg	344048	\N	虚拟人像	asset-20260424104515-fdl67	0	\N	group-20260424104232-bd2lm	2026-04-24 02:42:50.106588+00	2026-04-24 02:45:27.12432+00	\N
\.


--
-- Data for Name: plugin_configs; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugin_configs (id, plugin_name, config_key, config_value, created_at, updated_at) FROM stdin;
6	asset_manager	tos_custom_domain		2026-04-24 01:52:38.917271+00	2026-04-24 02:42:11.810571+00
11	asset_manager	volc_group_id	group-20260424110617-46fzg	2026-04-24 02:01:08.491103+00	2026-04-24 03:06:17.783622+00
8	asset_manager	volc_access_key	AKLTYTM1NzY3MGFkMmU5NGZiMDk1YmNkYWI2ZGRiNjhlYTE	2026-04-24 02:01:08.468501+00	2026-04-24 02:33:17.038819+00
9	asset_manager	volc_secret_key	TlRJNE1EZGlaV1pqTkRBNU5ETmhaRGhtWlRka1pUVXdOek5tT1dJeU1EUQ==	2026-04-24 02:01:08.483519+00	2026-04-24 02:33:17.044733+00
10	asset_manager	volc_project_name	chenzs	2026-04-24 02:01:08.487531+00	2026-04-24 02:33:17.051651+00
7	asset_manager	tos_secret_key	TWpoaE5XSTNZalprTWpJMU5ERTVaV0k1TTJJME5UUTFOek5sTlRjNE56VQ==	2026-04-24 01:52:38.918387+00	2026-04-24 02:34:19.048477+00
1	asset_manager	tos_access_key	AKLTYzgwZDUzNzUxNWM0NGY1ZWJlZjM2MzUyNjgzYzFmZGE	2026-04-24 01:52:38.894578+00	2026-04-24 02:42:11.793873+00
2	asset_manager	tos_endpoint	https://tos-cn-guangzhou.volces.com	2026-04-24 01:52:38.905652+00	2026-04-24 02:42:11.804578+00
3	asset_manager	tos_region	cn-guangzhou	2026-04-24 01:52:38.909984+00	2026-04-24 02:42:11.807052+00
4	asset_manager	tos_bucket	test-song-24	2026-04-24 01:52:38.914659+00	2026-04-24 02:42:11.808721+00
5	asset_manager	tos_path_prefix		2026-04-24 01:52:38.916246+00	2026-04-24 02:42:11.809767+00
\.


--
-- Data for Name: plugins; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.plugins (id, name, title, description, is_enabled, allowed_levels, created_at, updated_at) FROM stdin;
2	team_marketing	团队营销管理	提供营销团队的用户管理，支持推广团队创建与成员管理	0	all	2026-04-23 11:08:11.58631+00	2026-04-23 11:08:11.58631+00
3	playground	模型体验中心	提供直接的视频、图片、声音、聊天模型体验服务	0	all	2026-04-23 11:08:11.586713+00	2026-04-23 11:08:11.586713+00
1	asset_manager	素材资产管理	提供全站图片、视频大模型使用的素材上传与审核功能	1	all	2026-04-23 11:08:11.585801+00	2026-04-24 01:47:43.508935+00
\.


--
-- Data for Name: recharge_records; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.recharge_records (id, user_id, amount, recharge_type, remark, created_at) FROM stdin;
1	e9c9cb2a-d4e2-425d-ab38-52c2637b15db	35	registration	注册赠送	2026-04-24 01:59:08.335357+00
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
site_settings	{"name":"TokensByte","title":"TokensByte - LLM API Gateway","keywords":"LLM, API, Gateway, Rust","description":"Next-gen LLM API Distribution & Management Platform","favicon":"","logo":"","login_title":"","login_subtitle":"","enable_multilingual":true}
login_settings	{"enable_username_login":true,"enable_mobile_login":true,"enable_email_login":true,"enable_wechat_login":true,"enable_google_login":false}
marketing_settings	{"enable_registration_gift":true,"gift_mode":"random","fixed_amount":0.0,"min_amount":5.0,"max_amount":50.0}
registration_settings	{"enable_username_registration":true,"enable_email_registration":true,"enable_mobile_registration":true,"enable_password_recovery":true,"ip_rate_limit_enabled":true,"ip_daily_limit":6,"email_validation_strict":false,"email_whitelist_enabled":false,"email_whitelist":["qq.com","163.com","outlook.com","aliyun.com","foxmail.com"]}
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
1	默认用户	default	0.9	0	0	0	10	0	10	普通用户，无折扣	2026-04-23 11:08:11.53473+00	2026-04-24 02:26:49.122809+00	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.users (id, uid, username, email, password_hash, nickname, mobile, wechat_id, role, balance, user_group, used_quota, is_active, remark, upstream_type, config, referred_by, commission_balance, admin_group_id, register_ip, admin_remark, created_at, updated_at, google_id, wechat_name, google_name) FROM stdin;
559890ab-b951-4e61-9a33-eccd3aaf52ff	1004265445	admin	admin@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$qWCzZbM3PrL7r/P13nvwvw$68B+yXCHfmvcbAoRHpwxapjoP/yWcdV9znGfE0FQB/w	\N	\N	\N	admin	100	default	0	1	\N	other	\N	\N	0	\N			2026-04-23T11:08:11.889734583+00:00	2026-04-23 11:17:07.899853+00	\N	\N	\N
e9c9cb2a-d4e2-425d-ab38-52c2637b15db	1002353040	chenzs	u_72899958@tokensbyte.local	$argon2id$v=19$m=19456,t=2,p=1$LecQvNqji7ZBTvcZgsiJ9g$gMLF7CgfhnTeP9aEvwriMtMoZWRCZ8M7UoUYJ0BZsZs	\N	\N	\N	user	32.56007249999998	default	2.4399274999999996	1	\N	other	\N	\N	0	\N	127.0.0.1		2026-04-24 01:59:08.335357+00	2026-04-24 07:32:20.850917+00	\N	\N	\N
\.


--
-- Data for Name: verification_codes; Type: TABLE DATA; Schema: public; Owner: tokensapi
--

COPY public.verification_codes (id, email, code, purpose, expires_at, created_at, phone) FROM stdin;
\.


--
-- Name: admin_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.admin_groups_id_seq', 1, false);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.api_tokens_id_seq', 1, true);


--
-- Name: billing_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.billing_rules_id_seq', 5, true);


--
-- Name: channel_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.channel_configs_id_seq', 4, true);


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

SELECT pg_catalog.setval('public.forward_rules_id_seq', 12, true);


--
-- Name: logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.logs_id_seq', 19, true);


--
-- Name: marketing_team_leaders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_team_leaders_id_seq', 1, false);


--
-- Name: marketing_team_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_team_members_id_seq', 1, false);


--
-- Name: marketing_teams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.marketing_teams_id_seq', 1, false);


--
-- Name: model_providers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.model_providers_id_seq', 91, true);


--
-- Name: model_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.model_types_id_seq', 120, true);


--
-- Name: models_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.models_id_seq', 9, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.orders_id_seq', 1, false);


--
-- Name: playground_assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.playground_assets_id_seq', 1, false);


--
-- Name: playground_projects_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.playground_projects_id_seq', 1, false);


--
-- Name: plugin_api_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_api_logs_id_seq', 12, true);


--
-- Name: plugin_asset_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_asset_groups_id_seq', 2, true);


--
-- Name: plugin_assets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_assets_id_seq', 2, true);


--
-- Name: plugin_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugin_configs_id_seq', 11, true);


--
-- Name: plugins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.plugins_id_seq', 90, true);


--
-- Name: recharge_records_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.recharge_records_id_seq', 1, true);


--
-- Name: redemptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.redemptions_id_seq', 1, false);


--
-- Name: upstreams_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.upstreams_id_seq', 1, false);


--
-- Name: user_levels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.user_levels_id_seq', 30, true);


--
-- Name: verification_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: tokensapi
--

SELECT pg_catalog.setval('public.verification_codes_id_seq', 1, false);


--
-- Name: admin_groups admin_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.admin_groups
    ADD CONSTRAINT admin_groups_pkey PRIMARY KEY (id);


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
-- Name: models models_model_id_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_model_id_key UNIQUE (model_id);


--
-- Name: models models_name_key; Type: CONSTRAINT; Schema: public; Owner: tokensapi
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_name_key UNIQUE (name);


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
-- PostgreSQL database dump complete
--

\unrestrict CDfQuaToMmZDdZnqLD5BGbp19BByc6wvS4FGf8MPD4dd5aWNcO3sojRmosUKq9o

