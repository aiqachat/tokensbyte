#!/bin/bash

# 启动开发环境的便捷脚本 (macOS / Linux)
echo "🚀 正在启动全实时热重载开发环境..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
