-- Migration: 004_security_updates.sql
-- Add IP whitelist and rate limiting fields to api_tokens

ALTER TABLE api_tokens ADD COLUMN ip_whitelist TEXT; -- Comma separated CIDRs or IPs
ALTER TABLE api_tokens ADD COLUMN rps_limit INTEGER DEFAULT 0; -- Requests per second (0 = unlimited)
ALTER TABLE api_tokens ADD COLUMN rpm_limit INTEGER DEFAULT 0; -- Requests per minute (0 = unlimited)

-- Add index for status and group on users
CREATE INDEX IF NOT EXISTS idx_users_group ON users(user_group);
