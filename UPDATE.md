# 更新日志

## 2026-04-15

### 新增功能
- ✅ Docker 镜像打包测试通过
- ✅ 完整的 Docker 部署文档（README.md）
- ✅ 生产环境 Docker Compose 配置（docker-compose.prod.yml）
- ✅ 环境变量配置模板（.env.example）
- ✅ 一键部署脚本（deploy.sh / deploy.ps1）
  - **交互式配置引导**
  - **自动生成数据库密码**（16位强密码，包含大小写字母、数字、特殊字符）
  - **自动生成 JWT 密钥**（64位随机密钥）
  - 仅需输入管理员密码和选择是否允许注册
  - 显示配置摘要确认
  - 支持重新配置
  - 自动检测已有配置并显示
- ✅ 本地镜像导出工具（export-images.sh / export-images.ps1）
  - 支持在本地构建镜像并导出
  - 自动生成服务器导入脚本
  - 自动生成上传指南
  - 仅导出项目自定义镜像（后端 + 前端）
  - PostgreSQL 使用官方镜像，服务器自动拉取
- ✅ 镜像导出使用指南（EXPORT-IMAGES-GUIDE.md）
- ✅ 快速参考卡片（QUICK-EXPORT.md）

### 修复问题
- 🔧 修复 TypeScript 类型错误
  - RequestLog 接口添加 upstream_url 字段
  - Upstreams.tsx 修复 Divider 组件 orientation 属性
- 🔧 修复导出脚本镜像获取逻辑
  - 改用 docker images 直接查询
  - 添加空值检查和默认值
- 🔧 优化导出流程
  - 移除 PostgreSQL 镜像导出（使用官方镜像）
  - 减小传输体积约 50%（从 511MB 降至 261MB）

### 文档改进
- 📝 完善 README.md
  - 新增 Docker 部署指南（4种方式）
  - 新增 HTTPS 部署配置
  - 新增部署架构图
  - 新增运维命令大全
  - 新增故障排查指南
  - 新增安全建议
  - 新增项目结构说明
  - 新增 API 文档示例
  - 新增常见问题
- 📝 创建 EXPORT-IMAGES-GUIDE.md - 镜像导出详细指南
- 📝 创建 QUICK-EXPORT.md - 快速参考卡片

### 优化改进
- ⚡ 镜像导出体积优化
  - 仅导出自定义镜像（后端 158MB + 前端 103MB = 261MB）
  - PostgreSQL 使用官方镜像，服务器自动拉取
  - 压缩后约 150-180MB，传输更快
- ⚡ 部署流程优化
  - 提供一键部署脚本
  - 提供本地打包+服务器部署方案
  - 支持多种传输方式（scp、rsync、云存储）
