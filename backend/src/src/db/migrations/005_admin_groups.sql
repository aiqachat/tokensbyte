-- Create admin_groups table
CREATE TABLE IF NOT EXISTS admin_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    permissions TEXT, -- JSON array of menu keys
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add admin_group_id to users table
ALTER TABLE users ADD COLUMN admin_group_id INTEGER;
