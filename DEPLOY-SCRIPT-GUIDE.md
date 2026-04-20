# 部署脚本使用指南

## 📋 概述

TokensByte 提供了两个部署脚本，支持交互式引导配置，让部署变得简单快捷：

- **deploy.sh** - Linux/Mac 环境
- **deploy.ps1** - Windows 环境

## 🚀 快速开始

### Windows 用户

```powershell
# 直接运行脚本
.\deploy.ps1
```

### Linux/Mac 用户

```bash
# 添加执行权限
chmod +x deploy.sh

# 运行脚本
./deploy.sh
```

## 📝 交互式配置引导

运行脚本后，会自动引导你完成配置：

### 步骤 1: 环境变量配置

如果是首次运行，脚本会引导你输入以下配置：

```
📝 开始配置环境变量...
=========================================

1️⃣  PostgreSQL 数据库密码
   (用于保护数据库，建议使用强密码)
   ✅ 已自动生成强密码 (16位)

2️⃣  JWT 密钥
   (用于用户认证，生产环境必须修改)
   ✅ 已自动生成随机密钥

3️⃣  管理员密码
   (管理后台登录密码)
   请输入管理员密码 (默认: admin): [输入密码]

4️⃣  是否允许用户注册？
   是/否 (默认: 是): [输入 y 或 n]
```

**配置摘要示例：**
```
✅ .env 文件已创建！

📋 配置摘要:
   - 数据库密码: [已自动生成 16 位强密码]
   - JWT_SECRET: [已自动生成 64 位随机密钥]
   - 管理员密码: mypassword
   - 用户注册: 允许

是否使用此配置继续部署？(y/n): y
```

### 步骤 2: 选择部署模式

```
请选择部署模式:
  1) 开发环境 (内置PostgreSQL，快速测试)
  2) 生产环境 (外部PostgreSQL，推荐)

请输入选项 (1/2): 2
```

### 步骤 3: 自动部署

脚本会自动启动 Docker 容器并显示访问信息：

```
🚀 启动生产环境...

✅ 生产环境部署完成！

📍 访问地址:
   - 用户端: http://localhost:5173
   - 管理后台: http://localhost:5173/admin0755
   - API: http://localhost:3000/v1

👤 默认管理员账号:
   - 用户名: admin
   - 密码: [你设置的密码]

📊 服务状态:
[显示容器状态]

📝 查看日志: docker compose -f docker-compose.prod.yml logs -f

💡 提示: 生产环境建议配置 HTTPS 反向代理
```

## 🔄 重新配置

如果已有 `.env` 文件，脚本会显示当前配置并询问是否重新配置：

```
✅ 发现已有的 .env 文件

📋 当前配置:
   - 数据库密码: myp***
   - JWT_SECRET: mysec***
   - 管理员密码: mypassword
   - 用户注册: 允许

是否重新配置？(y/n): y

📝 开始重新配置...
[重新开始配置流程]
```

## 💡 配置建议

### 生产环境推荐配置

1. **数据库密码**: 自动生成 16 位强密码（包含大小写字母、数字、特殊字符）
   ```
   脚本自动生成，例如: aB3#xY9@mK2$pL5!
   ```

2. **JWT_SECRET**: 自动生成 64 位随机密钥（无需手动输入）
   ```
   脚本会自动生成，例如: a1b2c3d4e5f6...
   ```

3. **管理员密码**: 使用强密码，不要使用默认值
   ```
   示例: Adm1n@2024!Secure
   ```

4. **用户注册**: 生产环境建议关闭
   ```
   输入: n (否)
   ```

### 开发/测试环境

可以使用默认配置快速启动：
- 数据库密码: `tokensbyte_secure`
- JWT_SECRET: `tokensbyte-change-me`
- 管理员密码: `admin`
- 用户注册: `y` (是)

## 📊 生成的 .env 文件示例

```env
# TokensByte 环境变量配置
# 生成时间: 2026-04-15 12:00:00

# 数据库配置
DATABASE_URL=postgres://tokensbyte:aB3#xY9@mK2$pL5!@postgres:5432/tokensbyte
POSTGRES_PASSWORD=aB3#xY9@mK2$pL5!

# JWT 密钥
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Adm1n@2024!Secure

# 端口配置
BACKEND_PORT=3000
FRONTEND_PORT=5173

# 功能开关
REGISTER_ENABLED=false

# 其他配置
HOST=0.0.0.0
PORT=3000
RUST_LOG=info
```

## 🔧 手动编辑配置

如果想手动编辑 `.env` 文件：

```bash
# Linux/Mac
nano .env
# 或
vim .env

# Windows
notepad .env
```

修改后重新运行部署脚本即可。

## 📋 部署模式对比

| 特性 | 开发环境 | 生产环境 |
|------|---------|---------|
| 数据库 | 内置 PostgreSQL | 外部 PostgreSQL |
| 数据持久化 | Docker 卷 | Docker 卷 |
| 适用场景 | 测试、开发 | 正式运营 |
| 性能 | 标准 | 高（可独立调优） |
| 推荐 | ❌ | ✅ |

## ❓ 常见问题

### Q1: 配置输入错误怎么办？

A: 可以重新运行脚本，选择重新配置，或直接删除 `.env` 文件后重新运行。

```bash
# 删除配置文件
rm .env  # Linux/Mac
del .env  # Windows

# 重新运行
./deploy.sh  # Linux/Mac
.\deploy.ps1  # Windows
```

### Q2: 如何查看当前配置？

A: 直接查看 `.env` 文件：

```bash
cat .env  # Linux/Mac
type .env  # Windows
```

### Q3: 配置后如何修改？

A: 有三种方式：
1. 重新运行部署脚本，选择"重新配置"
2. 直接编辑 `.env` 文件，然后重启服务
3. 删除 `.env` 文件，重新运行脚本

```bash
# 方式 2: 编辑后重启
nano .env
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Q4: 忘记了管理员密码怎么办？

A: 修改 `.env` 文件中的 `ADMIN_PASSWORD`，然后重启服务：

```bash
# 修改密码
nano .env  # 修改 ADMIN_PASSWORD

# 重启服务
docker compose -f docker-compose.prod.yml restart backend
```

### Q5: 可以使用已有的 .env 文件吗？

A: 可以！如果有 `.env` 文件，脚本会直接使用它。你也可以从 `.env.example` 复制并修改：

```bash
cp .env.example .env
nano .env  # 编辑配置
./deploy.sh  # 使用已有配置部署
```

## 🎯 最佳实践

1. **首次部署**: 使用交互式引导配置
2. **生产环境**: 务必修改所有默认密码
3. **配置备份**: 妥善保存 `.env` 文件
4. **定期更新**: 定期更换密码和密钥
5. **权限控制**: 限制 `.env` 文件访问权限

```bash
# 设置文件权限（仅所有者可读写）
chmod 600 .env  # Linux/Mac
```

## 📞 需要帮助？

- 查看完整文档: `README.md`
- 查看更新日志: `UPDATE.md`
- 镜像导出指南: `EXPORT-IMAGES-GUIDE.md`
