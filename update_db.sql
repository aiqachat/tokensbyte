ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS account_id TEXT NOT NULL DEFAULT '';
ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS access_key TEXT NOT NULL DEFAULT '';
ALTER TABLE volcengine_pool_accounts ADD COLUMN IF NOT EXISTS secret_key TEXT NOT NULL DEFAULT '';
