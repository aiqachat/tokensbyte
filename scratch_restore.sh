#!/bin/bash
set -e

echo "🛑 Stopping any existing dev processes..."
# In case there are any zombie processes
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
pkill -f cargo-watch 2>/dev/null || true

echo "🗑️ Dropping and recreating the database 'tokensapi'..."
docker exec tokensbyte-ws-postgres psql -U tokensapi -d postgres -c "DROP DATABASE IF EXISTS tokensapi WITH (FORCE);"
docker exec tokensbyte-ws-postgres psql -U tokensapi -d postgres -c "CREATE DATABASE tokensapi OWNER tokensapi;"

echo "⏳ Restoring database from backup/ai.artsapi.sql (this may take a few minutes)..."
docker exec -i tokensbyte-ws-postgres psql -U tokensapi -d tokensapi < backup/ai.artsapi.sql
echo "✅ Database restored successfully!"

echo "🚀 Restarting the local dev environment..."
echo 1 | ./dev.sh
