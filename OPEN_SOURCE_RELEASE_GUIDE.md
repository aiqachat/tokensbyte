# TokensByte 开源发布与自动同步指南（方案二）

本指南介绍如何将私有商业版仓库 `tokensbyte-ws` 的代码，快速、安全且物理隔离地同步并发布到开源版仓库 `tokensbyte`，同时确保开源版代码在编译时不包含任何商业隐私插件。

---

## 📂 1. 本地目录推荐结构
为了让脚本方便运行，建议在本地将两个仓库克隆到同一父级目录下：
```text
development/
├── tokensbyte-ws/   # 私有商业版仓库 (主开发仓，包含所有卡池和站点插件)
└── tokensbyte/      # 开源版仓库 (公开发布仓，仅包含核心功能与站点 Icon 图标库)
```

---

## 🛠️ 2. 开源版（方案二）改造说明

我们将使用 **Cargo Feature 门控** + **前端 Mock 桩** 保证开源版脱敏编译。

### 后端（Rust）处理
在 `tokensbyte` 开源仓库中，编译时不加载 `commercial_plugins` Feature：
1. `volcengine_pool`、`gptimage_pool` 等卡池业务相关的代码文件在同步时会被直接**删除**。
2. 编译器因为没有启用 `commercial_plugins` 特性，会自动跳过被 `#[cfg(feature = "commercial_plugins")]` 包裹的上述被删除的模块，**不报错且能完美编译**。

### 前端（React/Vite）处理
在同步时，脚本会自动清空商业插件的 UI 文件夹，并写入对应的 **Mock 桩文件**（如 `export default () => null`），避免 Vite 在打包时因为静态解析懒加载路径（safeLazy）失败而报错。

---

## 🚀 3. 本地一键同步与发布脚本

我们已经编写了自动化同步脚本 `release-oss.sh`，支持一键完成：
**文件同步 -> 商业插件删除 -> 前端桩代码生成 -> 本地编译验证 -> 提交到开源 Git 仓库**。

脚本已保存在工作区目录下：[release-oss.sh](file:///Volumes/D/aiwwwroot2026/tokensbyte/release-oss.sh)

### 运行同步脚本的步骤：
1. **进入商业版仓库目录**：确保您处于 `tokensbyte-ws` 中运行，或直接执行该脚本。
2. **运行脚本**：`bash release-oss.sh`

---

## 🤖 4. GitHub Actions 自动同步方案（极力推荐）

如果您希望**在往 `tokensbyte-ws` 推送代码时，自动同步并发布脱敏后的代码到 `tokensbyte`**，可以通过配置 GitHub Actions 工作流来实现。这样您就无需在本地手动运行脚本，所有清理与发布工作均在云端全自动完成。

### 第一步：在 GitHub 上配置推送密钥
因为 GitHub Actions 需要向您的开源仓库 `tokensbyte` 写入代码，您需要生成一个访问权限密钥。

1. **生成 Personal Access Token (PAT)**：
   * 在您的 GitHub 个人设置中依次打开：`Settings` -> `Developer Settings` -> `Personal Access Tokens (Tokens classic)`。
   * 点击 `Generate new token`，勾选 `repo` 权限（允许读写仓库代码）。
   * 生成后复制保存该 Token（假设为 `ghp_xxxxxxxxxxxx`）。
2. **在私有仓库 `tokensbyte-ws` 中添加 Secret**：
   * 打开 `tokensbyte-ws` 仓库的 `Settings` -> `Secrets and variables` -> `Actions`。
   * 点击 `New repository secret`。
   * 变量名命名为：`SYNC_PAT`。
   * 值粘贴为您刚才生成的 PAT Token。

---

### 第二步：在 `tokensbyte-ws` 中创建 GitHub Actions 工作流文件
在私有仓库 `tokensbyte-ws` 根目录下，新建 `.github/workflows/sync-to-oss.yml` 文件，内容如下：

```yaml
name: Auto Sync to Open Source Repo

on:
  push:
    branches:
      - main # 当向私有仓的 main 分支推送代码时触发。可根据需要修改为其他发布分支

jobs:
  sync:
    runs-on: ubuntu-latest

    steps:
      # 1. 检出私有仓代码
      - name: Checkout Private Repo
        uses: actions/checkout@v4
        with:
          path: private-repo

      # 2. 检出开源仓代码
      - name: Checkout Open Source Repo
        uses: actions/checkout@v4
        with:
          repository: aiqachat/tokensbyte # 开源仓仓库路径
          token: ${{ secrets.SYNC_PAT }}  # 使用上一步配置的 Secret
          path: oss-repo

      # 3. 执行同步与脱敏清理
      - name: Sync and De-sensitize Code
        run: |
          # 使用 rsync 将私有仓的核心代码同步到开源仓目录，排除 Git 历史和无关配置文件
          rsync -av --delete \
            --exclude='.git/' \
            --exclude='.github/' \
            --exclude='node_modules/' \
            --exclude='target/' \
            --exclude='.env' \
            --exclude='.env.local' \
            --exclude='backend.pid' \
            --exclude='frontend.pid' \
            private-repo/ oss-repo/

          # 删除商业版专属 Rust 敏感文件
          rm -f oss-repo/backend/src/api/volcengine_pool.rs
          rm -f oss-repo/backend/src/api/gptimage_pool.rs
          rm -f oss-repo/backend/src/api/assets.rs
          rm -f oss-repo/backend/src/api/team_marketing.rs
          rm -f oss-repo/backend/src/api/playground.rs
          rm -f oss-repo/backend/src/services/volcengine.rs
          rm -f oss-repo/backend/src/services/volcengine_pool.rs
          rm -f oss-repo/backend/src/models/volcengine_pool.rs
          rm -f oss-repo/backend/src/models/gptimage_pool.rs

          # 删除前端商业组件目录
          rm -rf oss-repo/frontend/src/pages/Plugins/VolcenginePool
          rm -rf oss-repo/frontend/src/pages/Plugins/GptImagePool
          rm -rf oss-repo/frontend/src/pages/Plugins/TeamMarketing
          rm -rf oss-repo/frontend/src/pages/Plugins/AssetManager
          rm -f oss-repo/frontend/src/pages/Plugins/PluginsList.tsx
          rm -f oss-repo/frontend/src/pages/Plugins/PluginConfig.tsx

          # 生成前端编译所需的空 Mock 桩组件，防止打包报错
          mkdir -p oss-repo/frontend/src/pages/Plugins/VolcenginePool
          mkdir -p oss-repo/frontend/src/pages/Plugins/GptImagePool
          mkdir -p oss-repo/frontend/src/pages/Plugins/TeamMarketing
          mkdir -p oss-repo/frontend/src/pages/Plugins/AssetManager

          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/VolcenginePool/PoolManager.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/GptImagePool/PoolManager.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/TeamMarketing/TeamConfig.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/AssetManager/AdminPresetAssets.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/AssetManager/RelayConvertAssets.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/PluginsList.tsx
          echo "import React from 'react'; export default () => null;" > oss-repo/frontend/src/pages/Plugins/PluginConfig.tsx

      # 4. (可选) 安装 Rust 并验证后端能否通过 check
      - name: Setup Rust Toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Validate Backend Build
        run: |
          cd oss-repo/backend
          cargo check

      # 5. 自动提交并推送到开源仓库
      - name: Commit and Push to Open Source Repo
        run: |
          cd oss-repo
          # 配置 git 机器人用户信息
          git config --global user.name "github-actions[bot]"
          git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"
          
          # 检查是否有文件变更，有则提交并推送
          if [ -n "$(git status --porcelain)" ]; then
            git add .
            git commit -m "sync: release auto-update from private repo"
            git push origin main
            echo "🚀 已成功同步并推送到开源仓库！"
          else
            echo "无代码更新，无需推送。"
          fi
```

### 第三步：提交工作流文件到私有仓
将上述工作流文件保存后提交并推送到 `tokensbyte-ws`：
```bash
git add .github/workflows/sync-to-oss.yml
git commit -m "ci: add auto sync to open source repo workflow"
git push
```
此后，只要您向私有商业版仓库推送代码，GitHub Actions 会在云端全自动拉取、剔除敏感商业逻辑代码、重新编译检测，并发布到您的开源 `tokensbyte` 仓库。
