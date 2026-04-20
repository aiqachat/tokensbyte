#!/bin/bash

# TokensByte 快速部署脚本
# 适用于 Linux/Mac 环境

set -e

echo "========================================="
echo "  TokensByte Docker 部署脚本"
echo "========================================="
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未找到 Docker，请先安装 Docker"
    echo "   访问: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查 Docker Compose 是否安装
if ! command -v docker compose &> /dev/null; then
    echo "❌ 错误: 未找到 Docker Compose，请先安装"
    echo "   访问: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"
echo "✅ Docker Compose 版本: $(docker compose version)"
echo ""

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件"
    echo ""
    echo "📝 开始配置环境变量..."
    echo "========================================="
    echo ""
    
    # 引导用户配置
    echo "1️⃣  PostgreSQL 数据库密码"
    echo "   (用于保护数据库，建议使用强密码)"
    # 自动生成强密码
    if command -v openssl &> /dev/null; then
        POSTGRES_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=' | head -c 16)
        echo "   ✅ 已自动生成强密码 (16位)"
    else
        # 如果没有 openssl，使用 /dev/urandom
        POSTGRES_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 16)
        echo "   ✅ 已自动生成强密码 (16位)"
    fi
    echo ""
    
    echo "2️⃣  JWT 密钥"
    echo "   (用于用户认证，生产环境必须修改)"
    # 自动生成随机密钥
    if command -v openssl &> /dev/null; then
        JWT_SECRET=$(openssl rand -hex 32)
        echo "   ✅ 已自动生成随机密钥"
    else
        # 如果没有 openssl，使用 /dev/urandom
        JWT_SECRET=$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
        echo "   ✅ 已自动生成随机密钥"
    fi
    echo ""
    
    echo "3️⃣  管理员密码"
    echo "   (管理后台登录密码)"
    read -p "   请输入管理员密码 (默认: admin): " admin_password
    ADMIN_PASSWORD=${admin_password:-admin}
    echo ""
    
    echo "4️⃣  是否允许用户注册？"
    read -p "   是/否 (默认: 是): " register_input
    case $register_input in
        [Nn]|[Ff]|[Oo]|否|false)
            REGISTER_ENABLED=false
            ;;
        *)
            REGISTER_ENABLED=true
            ;;
    esac
    echo ""
    
    # 生成 .env 文件
    echo "✅ 正在生成 .env 文件..."
    cat > .env << EOF
# TokensByte 环境变量配置
# 生成时间: $(date '+%Y-%m-%d %H:%M:%S')

# 数据库配置
DATABASE_URL=postgres://tokensbyte:${POSTGRES_PASSWORD}@postgres:5432/tokensbyte
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# JWT 密钥
JWT_SECRET=${JWT_SECRET}

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=5173

# 功能开关
REGISTER_ENABLED=${REGISTER_ENABLED}

# 其他配置
HOST=0.0.0.0
PORT=3000
RUST_LOG=info
EOF
    
    echo "✅ .env 文件已创建！"
    echo ""
    echo "📋 配置摘要:"
    echo "   - 数据库密码: [已自动生成 16 位强密码]"
    echo "   - JWT_SECRET: [已自动生成 64 位随机密钥]"
    echo "   - 管理员密码: ${ADMIN_PASSWORD}"
    echo "   - 用户注册: $([ "$REGISTER_ENABLED" = "true" ] && echo "允许" || echo "禁止")"
    echo ""
    
    # 确认配置
    read -p "是否使用此配置继续部署？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "部署已取消"
        echo "您可以编辑 .env 文件修改配置，然后重新运行此脚本"
        exit 0
    fi
    echo ""
else
    echo "✅ 发现已有的 .env 文件"
    echo ""
    # 显示当前配置摘要
    echo "📋 当前配置:"
    if grep -q "POSTGRES_PASSWORD" .env; then
        echo "   - 数据库密码: [已配置]"
    fi
    if grep -q "JWT_SECRET" .env; then
        echo "   - JWT_SECRET: [已配置]"
    fi
    if grep -q "ADMIN_PASSWORD" .env; then
        ADMIN_PWD=$(grep "ADMIN_PASSWORD" .env | head -1 | cut -d'=' -f2)
        echo "   - 管理员密码: $ADMIN_PWD"
    fi
    if grep -q "REGISTER_ENABLED" .env; then
        REG=$(grep "REGISTER_ENABLED" .env | head -1 | cut -d'=' -f2)
        echo "   - 用户注册: $([ "$REG" = "true" ] && echo "允许" || echo "禁止")"
    fi
    echo ""
    
    # 询问是否重新配置
    read -p "是否重新配置？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "📝 开始重新配置..."
        rm -f .env
        echo ""
        echo "✅ 已删除旧配置，请重新运行此脚本"
        echo "   命令: bash $0"
        exit 0
    fi
    echo ""
fi

# 询问部署模式
echo ""
echo "请选择部署模式:"
echo "  1) 开发环境 (内置PostgreSQL，快速测试)"
echo "  2) 生产环境 (外部PostgreSQL，推荐)"
echo ""
read -p "请输入选项 (1/2): " mode

case $mode in
    1)
        echo ""
        echo "🚀 启动开发环境..."
        docker compose up -d
        echo ""
        echo "✅ 开发环境部署完成！"
        echo ""
        echo "📍 访问地址:"
        echo "   - 用户端: http://localhost:5173"
        echo "   - 管理后台: http://localhost:5173/admin0755"
        echo "   - API: http://localhost:3000/v1"
        echo ""
        echo "👤 默认管理员账号:"
        echo "   - 用户名: admin"
        echo "   - 密码: admin"
        echo ""
        echo "📝 查看日志: docker compose logs -f"
        ;;
    2)
        echo ""
        echo "🚀 启动生产环境..."
        docker compose -f docker-compose.prod.yml up -d
        echo ""
        echo "✅ 生产环境部署完成！"
        echo ""
        echo "📍 访问地址:"
        echo "   - 用户端: http://localhost:5173"
        echo "   - 管理后台: http://localhost:5173/admin0755"
        echo "   - API: http://localhost:3000/v1"
        echo ""
        echo "👤 默认管理员账号:"
        echo "   - 用户名: admin"
        echo "   - 密码: admin (请通过管理后台修改)"
        echo ""
        echo "📊 服务状态:"
        docker compose -f docker-compose.prod.yml ps
        echo ""
        echo "📝 查看日志: docker compose -f docker-compose.prod.yml logs -f"
        echo ""
        echo "💡 提示: 生产环境建议配置 HTTPS 反向代理"
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
