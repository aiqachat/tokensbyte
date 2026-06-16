#!/bin/bash
# =========================================================================
# TokensByte 开源版本一键自动同步与脱敏脚本
# 运行环境: macOS / Linux (需安装 rsync)
# =========================================================================

set -e

# 获取当前脚本所在路径（默认为开源版 tokensbyte 仓库的根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$SCRIPT_DIR"

# 默认假设私有版 tokensbyte-ws 与开源版在同一父目录下
SOURCE_DIR="$(cd "$SCRIPT_DIR/../tokensbyte-ws" && pwd 2>/dev/null || true)"

echo "=================================================="
echo "    TokensByte 开源版一键同步与脱敏脚本"
echo "=================================================="
echo "🎯 开源版目标目录: $TARGET_DIR"

# 检查源目录是否存在
if [ -z "$SOURCE_DIR" ] || [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ 错误: 未能在 $SCRIPT_DIR/../tokensbyte-ws 找到源私有版仓库。"
    echo "   请确保私有商业版项目文件夹命名为 'tokensbyte-ws' 并与开源项目并列存放。"
    echo "   如果存放路径不同，请编辑本脚本修改 SOURCE_DIR 变量。"
    exit 1
fi

echo "📦 商业版源目录:   $SOURCE_DIR"
echo ""

# 确认是否开始
read -p "⚠️  本脚本将覆盖开源目录下的文件，是否继续？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "同步已取消。"
    exit 0
fi

# 1. 使用 rsync 从私有版同步最新代码（保留开源版自身的 .git 目录和本地环境配置）
echo "🔄 正在同步文件核心代码..."
rsync -av --delete \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='node_modules/' \
  --exclude='target/' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='backend.pid' \
  --exclude='frontend.pid' \
  --exclude='.antigravity/' \
  --exclude='PLUGINS_SEPARATION.md' \
  --exclude='OPEN_SOURCE_RELEASE_GUIDE.md' \
  --exclude='release-oss.sh' \
  "$SOURCE_DIR/" "$TARGET_DIR/"

# 1.5 修改开源版后端 Cargo.toml features 声明，只保留站点图标插件
echo "🔧 正在配置开源版 Cargo.toml Features..."
perl -pi -e 's/default = \[.*?\]/default = ["plugin_site_icons"]/g' "$TARGET_DIR/backend/Cargo.toml"

# 2. 物理删除商业版后端的敏感代码文件 (Rust)
echo "🧹 正在清除后端商业版插件源文件..."
rm -f "$TARGET_DIR/backend/src/api/volcengine_pool.rs"
rm -f "$TARGET_DIR/backend/src/api/gptimage_pool.rs"
rm -f "$TARGET_DIR/backend/src/api/assets.rs"
rm -f "$TARGET_DIR/backend/src/api/team_marketing.rs"
rm -f "$TARGET_DIR/backend/src/api/playground.rs"
rm -f "$TARGET_DIR/backend/src/services/volcengine.rs"
rm -f "$TARGET_DIR/backend/src/services/volcengine_pool.rs"
rm -f "$TARGET_DIR/backend/src/models/volcengine_pool.rs"
rm -f "$TARGET_DIR/backend/src/models/gptimage_pool.rs"

# 3. 物理删除前端商业版组件目录
echo "🧹 正在清除前端商业版插件源文件..."
rm -rf "$TARGET_DIR/frontend/src/pages/Plugins/VolcenginePool"
rm -rf "$TARGET_DIR/frontend/src/pages/Plugins/GptImagePool"
rm -rf "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing"
rm -rf "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager"
rm -f "$TARGET_DIR/frontend/src/pages/Plugins/PluginsList.tsx"
rm -f "$TARGET_DIR/frontend/src/pages/Plugins/PluginConfig.tsx"

# 4. 创建前端桩文件夹并生成 Mock 桩文件，解决 Vite 静态解析懒加载（safeLazy）失败报错问题
echo "📝 正在生成前端 Mock 桩代码..."
mkdir -p "$TARGET_DIR/frontend/src/pages/Plugins/VolcenginePool"
mkdir -p "$TARGET_DIR/frontend/src/pages/Plugins/GptImagePool"
mkdir -p "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/locales"
mkdir -p "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/locales"

echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/VolcenginePool/PoolManager.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/GptImagePool/PoolManager.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/TeamConfig.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/AdminPresetAssets.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/RelayConvertAssets.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/PluginsList.tsx"
echo "import React from 'react'; export default () => null;" > "$TARGET_DIR/frontend/src/pages/Plugins/PluginConfig.tsx"

echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/locales/zh.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/locales/en.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/locales/ja.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/AssetManager/locales/ko.json"

echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/locales/zh.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/locales/en.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/locales/ja.json"
echo "{}" > "$TARGET_DIR/frontend/src/pages/Plugins/TeamMarketing/locales/ko.json"

echo "✨ 脱敏和 Mock 文件写入完成！"
echo ""

# 5. 本地编译验证
echo "🔍 正在进行开源版本编译检查..."
echo "⚙️  检查后端编译 (Rust)..."
cd "$TARGET_DIR/backend"
# 不携带 commercial_plugins feature 运行 check
if cargo check; then
    echo "✅ 后端编译验证通过！"
else
    echo "❌ 错误: 后端编译失败，请检查条件编译配置。"
    exit 1
fi

echo "⚙️  检查前端编译 (Vite)..."
cd "$TARGET_DIR/frontend"
echo "📦 正在安装前端依赖..."
npm install
if npm run build; then
    echo "✅ 前端构建验证通过！"
else
    echo "❌ 错误: 前端打包失败，请检查 Mock 桩文件或引用。"
    exit 1
fi

# 6. Git 提交提示
cd "$TARGET_DIR"
echo ""
echo "=================================================="
echo "🎉 开源版本代码同步、脱敏及验证已全部顺利完成！"
echo "=================================================="
echo ""
echo "📱 下一步操作指南："
echo "   1. 检查开源仓下的 Git 变更状态: git status"
echo "   2. 提交代码变更 (脚本未执行 push):"
echo "      git add ."
echo "      git commit -m \"sync: release tokensbyte open source version\""
echo "   3. 将最新开源版代码推送到 GitHub 公开仓库:"
echo "      git push origin main"
echo ""
