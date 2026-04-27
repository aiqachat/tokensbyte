#!/bin/bash
echo "Stopping existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo "Restarting database..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

echo "Starting backend..."
cd backend
export DATABASE_URL="postgres://tokensapi:tokensapi@localhost:5432/tokensapi"
export RUST_LOG="info"
# Use nohup or similar to keep it running in background
nohup cargo watch -w src -x run > ../backend.log 2>&1 &
echo $! > backend.pid
cd ..

echo "Starting frontend..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
echo $! > frontend.pid
cd ..

echo "Services started in background."
echo "Backend log: backend.log"
echo "Frontend log: frontend.log"
