-- Migration: 003_redemptions.sql
-- Create redemptions table for credit recharge

CREATE TABLE IF NOT EXISTS redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    quota REAL NOT NULL,
    is_used INTEGER DEFAULT 0,
    used_at TEXT,
    used_by TEXT, -- references users.id
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_redemption_code ON redemptions(code);
CREATE INDEX IF NOT EXISTS idx_redemption_is_used ON redemptions(is_used);

-- Add group field to users as well
ALTER TABLE users ADD COLUMN user_group TEXT DEFAULT 'default';
