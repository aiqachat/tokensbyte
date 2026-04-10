#!/bin/bash

# TokensByte - Local API Test Suite
# This script tests the core functionalities: Auth, Token Management, and Relay logic.

BASE_URL="http://localhost:3000"
ADMIN_USER="admin"
ADMIN_PASS="123456"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 Starting TokensByte Local API Test..."

# 1. Login Test
echo -n "🔑 Testing Login... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$ADMIN_USER\", \"password\": \"$ADMIN_PASS\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}SUCCESS${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

# 2. Get Settings (Public)
echo -n "⚙️  Testing Public Settings... "
SETTINGS=$(curl -s -X GET "$BASE_URL/api/v1/settings")
if [[ $SETTINGS == *"site"* ]]; then
    echo -e "${GREEN}SUCCESS${NC}"
else
    echo -e "${RED}FAILED${NC}"
fi

# 3. List Tokens (Private)
echo -n "🎫 Testing List Tokens... "
TOKENS_LIST=$(curl -s -X GET "$BASE_URL/api/v1/tokens" \
  -H "Authorization: Bearer $TOKEN")
if [[ $TOKENS_LIST == *"data"* ]]; then
    echo -e "${GREEN}SUCCESS${NC}"
else
    echo -e "${RED}FAILED${NC}"
fi

# 4. Create a Test Token
echo -n "➕ Creating Test API Token... "
CREATE_TOKEN_RESP=$(curl -s -X POST "$BASE_URL/api/v1/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-relay-token", "quota_limit": 10.0}')

# The backend already adds 'sk-', so we grab it as is
RELAY_KEY=$(echo $CREATE_TOKEN_RESP | grep -o '"token_key":"[^"]*' | cut -d'"' -f4)

if [ -n "$RELAY_KEY" ]; then
    echo -e "${GREEN}SUCCESS${NC} (Key: $RELAY_KEY)"
else
    echo -e "${RED}FAILED${NC}"
    echo "Response: $CREATE_TOKEN_RESP"
    exit 1
fi

# 5. Test Relay (Should return error about missing channel/quota)
echo -n "🛰️  Testing Relay Logic (No Channel/Quota)... "
RELAY_RESP=$(curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $RELAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}]
  }')

if [[ $RELAY_RESP == *"No available channels"* ]] || [[ $RELAY_RESP == *"Insufficient user balance"* ]]; then
    echo -e "${GREEN}PASSED${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "Response: $RELAY_RESP"
fi

echo "✅ Test Suite Completed."
