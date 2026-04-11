import sqlite3
import os
import sys

# Add the local library path for pg8000
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'aidb', 'test_lib'))

import pg8000.native

# Configuration
SQLITE_DB = os.path.join(os.path.dirname(__file__), '..', 'data', 'tokensbyte.db')
if not os.path.exists(SQLITE_DB):
    # Try the one in backend/
    SQLITE_DB = os.path.join(os.path.dirname(__file__), '..', 'backend', 'tokensbyte.db')

PG_CONFIG = {
    'user': 'tokensapi',
    'password': 'tokensapi',
    'host': 'localhost',
    'port': 5432,
    'database': 'tokensapi'
}

TABLES = [
    'users', 'user_levels', 'recharge_records', 'channels', 
    'api_tokens', 'logs', 'redemptions', 'settings', 
    'model_providers', 'model_types', 'models', 
    'verification_codes', 'admin_groups'
]

def migrate():
    print(f"Connecting to SQLite: {SQLITE_DB}")
    sl_conn = sqlite3.connect(SQLITE_DB)
    sl_conn.row_factory = sqlite3.Row
    sl_cursor = sl_conn.cursor()

    print(f"Connecting to PostgreSQL: {PG_CONFIG['database']} on {PG_CONFIG['host']}")
    pg_conn = pg8000.native.Connection(**PG_CONFIG)

    # 1. Create Schema (Simplified version from migrations.rs)
    print("Creating schema in PostgreSQL...")
    
    schema_queries = [
        """CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, nickname TEXT,
            mobile TEXT, wechat_id TEXT, role TEXT NOT NULL DEFAULT 'user',
            balance DOUBLE PRECISION NOT NULL DEFAULT 0.0, user_group TEXT NOT NULL DEFAULT 'default',
            is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, admin_group_id INTEGER
        )""",
        """CREATE TABLE IF NOT EXISTS user_levels (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, group_key TEXT NOT NULL UNIQUE,
            discount DOUBLE PRECISION NOT NULL DEFAULT 1.0, description TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            commission_ratio DOUBLE PRECISION DEFAULT 0.0
        )""",
        """CREATE TABLE IF NOT EXISTS recharge_records (
            id SERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
            amount DOUBLE PRECISION NOT NULL, recharge_type TEXT NOT NULL DEFAULT 'other',
            remark TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS channels (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, provider_type TEXT NOT NULL,
            base_url TEXT NOT NULL, api_key TEXT NOT NULL, models TEXT NOT NULL DEFAULT '[]',
            model_mapping TEXT NOT NULL DEFAULT '{}', priority INTEGER NOT NULL DEFAULT 0,
            weight INTEGER NOT NULL DEFAULT 1, status INTEGER NOT NULL DEFAULT 1,
            balance DOUBLE PRECISION, max_rps INTEGER DEFAULT 0, config TEXT NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS api_tokens (
            id SERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
            token_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT 'default',
            quota_limit DOUBLE PRECISION NOT NULL DEFAULT -1, quota_used DOUBLE PRECISION NOT NULL DEFAULT 0,
            allowed_models TEXT NOT NULL DEFAULT '[]', allowed_ips TEXT NOT NULL DEFAULT '',
            ip_whitelist TEXT, rps_limit INTEGER DEFAULT 0, rpm_limit INTEGER DEFAULT 0,
            expires_at TEXT, is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS logs (
            id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, channel_id INTEGER,
            token_id INTEGER, model TEXT NOT NULL DEFAULT '', prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0, cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            latency_ms INTEGER NOT NULL DEFAULT 0, status_code INTEGER NOT NULL DEFAULT 200,
            endpoint TEXT NOT NULL DEFAULT '', error_message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS redemptions (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
            quota DOUBLE PRECISION NOT NULL, is_used INTEGER DEFAULT 0,
            used_at TEXT, used_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
        )""",
        """CREATE TABLE IF NOT EXISTS model_providers (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS model_types (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS models (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, model_id TEXT NOT NULL UNIQUE,
            provider_id INTEGER REFERENCES model_providers(id), type_id INTEGER REFERENCES model_types(id),
            billing_type TEXT NOT NULL DEFAULT 'tokens', prompt_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            completion_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0, fixed_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            duration_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0, group_ratios TEXT NOT NULL DEFAULT '{}',
            billing_rule TEXT NOT NULL DEFAULT 'standard', billing_unit TEXT NOT NULL DEFAULT '1k',
            pricing_tiers TEXT NOT NULL DEFAULT '[]', is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS verification_codes (
            id SERIAL PRIMARY KEY, email TEXT NOT NULL, code TEXT NOT NULL,
            purpose TEXT NOT NULL, expires_at TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS admin_groups (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, permissions TEXT, description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    ]

    for query in schema_queries:
        try:
            pg_conn.run(query)
        except Exception as e:
            print(f"Schema Error: {e}")

    # 2. Migrate Data
    for table in TABLES:
        print(f"Migrating table: {table}...")
        try:
            sl_cursor.execute(f"SELECT * FROM {table}")
            rows = sl_cursor.fetchall()
            if not rows:
                print(f"  Table {table} is empty.")
                continue

            columns = rows[0].keys()
            # Special handling for commission_ratio in user_levels if it was missing in SQLite
            if table == 'user_levels' and 'commission_ratio' not in columns:
                # We'll handle it below
                pass

            # Reset sequences for serial columns if necessary (optional here, done at end)
            
            # Delete existing data to avoid conflicts on retry
            pg_conn.run(f"TRUNCATE TABLE {table} CASCADE")

            for row in rows:
                row_dict = dict(row)
                # PostgreSQL doesn't like some SQLite date formats if they are weird,
                # but 'YYYY-MM-DD HH:MM:SS' should be fine.
                
                # Filter out columns that don't exist in the PG schema if needed
                # (Assuming they match for now as per migrations.rs)
                
                cols_joined = ", ".join(columns)
                placeholders_joined = ", ".join([f":{c}" for c in columns])
                
                pg_conn.run(f"INSERT INTO {table} ({cols_joined}) VALUES ({placeholders_joined})", **row_dict)
            
            print(f"  Successfully migrated {len(rows)} rows to {table}.")

            # Reset serial sequences for tables with SERIAL IDs
            if table not in ['users', 'settings']:
                pg_conn.run(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM {table}")

        except Exception as e:
            print(f"Error migrating {table}: {e}")

    sl_conn.close()
    print("Migration completed!")

if __name__ == "__main__":
    migrate()
