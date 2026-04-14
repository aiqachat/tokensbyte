#!/bin/bash
BASE_URL="http://localhost:3000"
ADMIN_USER="admin"
ADMIN_PASS="123456"

# Login
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$ADMIN_USER\", \"password\": \"$ADMIN_PASS\"}")
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "Login failed"
    exit 1
fi
echo "Got token."

# Delete Old Rules named "Google Gemini" just to be safe
RULES_RESP=$(curl -s -X GET "$BASE_URL/api/v1/forward-rules" -H "Authorization: Bearer $TOKEN")
# we won't bother deleting, just insert.

# Insert Image Rule
curl -s -X POST "$BASE_URL/api/v1/forward-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Gemini 原生生图",
    "rule_type": "gemini",
    "category": "图片",
    "description": "将标准的生图请求适配到 Gemini contents 接口",
    "config_json": "{\"mode\":\"transform\",\"target_type\":\"gemini_image\",\"path_rewrite\":{\"old\":\"/v1/images/generations\",\"new\":\"/v1beta/models/${model}:generateContent\"},\"auth_type\":\"query_key\"}",
    "is_active": 1
  }'
echo "Created Image rule"

# Insert Chat Rule
curl -s -X POST "$BASE_URL/api/v1/forward-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Gemini 格式转换 (聊天)",
    "rule_type": "gemini",
    "category": "聊天",
    "description": "将标准请求转换并适配到 Gemini contents",
    "config_json": "{\"mode\":\"transform\",\"target_type\":\"gemini\",\"path_rewrite\":{\"old\":\"/v1/chat/completions\",\"new\":\"/v1beta/models/${model}:generateContent\"},\"auth_type\":\"query_key\"}",
    "is_active": 1
  }'
echo "Created Chat rule"

# Insert Stream Rule
curl -s -X POST "$BASE_URL/api/v1/forward-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Gemini 流式转换 (聊天)",
    "rule_type": "gemini",
    "category": "聊天",
    "description": "流式输出",
    "config_json": "{\"mode\":\"transform\",\"target_type\":\"gemini\",\"path_rewrite\":{\"old\":\"/v1/chat/completions\",\"new\":\"/v1beta/models/${model}:streamGenerateContent?alt=sse\"},\"auth_type\":\"query_key\"}",
    "is_active": 1
  }'
echo "Created Stream rule"
