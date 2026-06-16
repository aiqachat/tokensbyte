# TokensByte 商业版脱敏与开源版本同步方案

本项目维护了两个仓库版本：**商业私有仓 (`tokensbyte-ws`)** 与 **开源发布仓 (`tokensbyte`)**。
为了实现快速开发与安全开源的无缝对接，我们设计并实施了一套基于 **“Cargo Features 条件编译 + Vite Mock 代码桩 + 数据库影子拦截”** 的单向一键脱敏与编译验证方案。

本文档详细记录了该方案的技术细节与日常发布流程。

---

## 🛠️ 核心设计方案与技术实现

为了在物理上彻底删除商业机密代码（例如火山卡池、GPT-Image 卡池、团队营销、素材资产管理等插件），同时保证开源版本在失去了这部分代码后仍能**一键编译、一键打包通过**，系统实施了以下几项关键技术：

### 1. 前端桩文件与语言包 Mock (Vite & TypeScript)
* **面临的挑战**：物理删除商业插件的前端 `.tsx` 页面和组件后，前端路由或懒加载模块（`safeLazy`）依然存在对这些组件的静态引用，这会导致 Vite 打包和 TypeScript 类型校验抛出无法找到模块的报错 (TS2307)。此外，`src/i18n.ts` 中静态加载了所有插件的 `locales/*.json` 多语言文件，缺失同样会导致打包崩溃。
* **技术实现**：
  - 在同步代码并物理删除商业文件夹后，自动化脚本会针对被删除的入口文件（如 `PoolManager.tsx`、`TeamConfig.tsx` 等），写入仅有一行的 Dummy React 桩组件：
    ```typescript
    import React from 'react'; export default () => null;
    ```
  - 同时自动在 Mock 目录下重建 `locales/` 文件夹，并向其中写入仅含空对象的 Mock 多语言文件（如 `zh.json`, `en.json`，内容均为 `{}`）。
  - 该方案在物理删除敏感商业逻辑的前提下，利用极轻量的桩文件满足了打包工具的依赖树静态分析，消除了所有的编译期报错。

### 2. 后端 Cargo Feature 条件编译门控 (Rust)
* **特征生命周期声明**：在后端的 `backend/Cargo.toml` 中声明了 `commercial_plugins` 特征。在私有商业仓中，该特征默认启用并打包所有插件。在发布开源版时，一键同步工具会自动修改 `Cargo.toml`，将 `commercial_plugins` 等商业插件特征从 `default` 列表中彻底移除。
* **条件路由挂载与 fallback 桩**：
  - 后端核心模块（如 `api/mod.rs`、`services/mod.rs`）中使用 `#[cfg(feature = "commercial_plugins")]` 包裹商业插件的模块定义和路由挂载。
  - 对于通用模块中对商业插件的深层调用（例如：即梦 AI 的 API 请求体签名、卡池调度算法、火山引擎余额查询），系统在 feature 缺失时提供返回友好错误的 Fallback 代理函数，实现了代码的高度解耦。

### 3. 数据库种子与迁移 SQL 影子拦截器（最关键设计）
* **面临的挑战**：
  在历经数百次迭代的数据库初始化文件 `migrations.rs` 中，包含有大量商业表创建 SQL 和种子数据插入（如创建 `volcengine_pools` 等）。由于宏 `pg_migration_blocks!` 庞大且多为字面值字符串执行，若在 2000 多行的 SQL代码里大量充斥 `#[cfg]` 条件宏，会导致文件极难阅读且编译匹配极易报错。
* **影子 `sqlx::query` 机制**：
  - 我们在 `migrations.rs` 的头部，为开源版本（未激活 `commercial_plugins` 特征）编写了一个同名遮蔽模块 `mod sqlx`：
    ```rust
    #[cfg(not(feature = "commercial_plugins"))]
    mod sqlx {
        pub use ::sqlx::{Pool, Postgres, query_scalar, query_as, Error, FromRow};
        pub use ::sqlx::postgres::{PgQueryResult, PgRow};

        pub fn query(sql: &str) -> ::sqlx::query::Query<'_, Postgres, ::sqlx::postgres::PgArguments> {
            let sql_lower = sql.to_lowercase();
            // 匹配商业表的关键字
            let is_commercial = sql_lower.contains("volcengine_pool") || 
                                sql_lower.contains("gptimage_pool") || 
                                sql_lower.contains("marketing_team") || 
                                sql_lower.contains("plugin_asset") || 
                                sql_lower.contains("plugin_config") || 
                                sql_lower.contains("plugin_api_log") ||
                                sql_lower.contains("asset_manager") ||
                                sql_lower.contains("team_marketing") ||
                                sql_lower.contains("playground") ||
                                sql_lower.contains("model_marketplace");
            let is_site_icons = sql_lower.contains("site_icons");
            let should_ignore = is_commercial && !is_site_icons;
            
            if should_ignore {
                // 将商业表的迁移拦截为一条空指令 SELECT 1，确保成功返回且不报错
                ::sqlx::query("SELECT 1")
            } else {
                ::sqlx::query(sql)
            }
        }
    }
    ```
  - 当开源版编译时，`migrations.rs` 中所有的 `sqlx::query(...)` 会被就地编译为影子模块中的函数，动态判断 SQL 语句的关键字。一旦属于商业表或其种子，将被拦截重写为 `"SELECT 1"`，直接从底层避开了商业数据库表的建立。
  - 站点自带的公共图标库 (`site_icons`) 不会被拦截，完美保留在开源版本中。

---

## 🚀 日常发布与一键同步步骤

每次私有商业版完成功能更新，需要向开源版本同步并发布时，请按照以下流程操作：

### 1. 执行一键同步脚本 (在开源仓下)
请在您本地的开源仓库 `/Volumes/D/aiwwwroot2026/tokensbyte` 目录下，运行私有版提供的同步脚本（注意：此脚本不应该被发布在开源 GitHub 上）：
```bash
# 执行同步、自动脱敏、物理删除、生成 Mock 桩文件和双端编译测试
echo "y" | bash release-oss.sh
```

若您在终端中看到以下结果，代表两端编译均 100% 成功，脱敏完成：
```
✅ 后端编译验证通过！
✅ 前端构建验证通过！
```

### 2. 本地开发与测试
在开源目标仓下，您可以随时启动与商业版互相隔离的本地测试环境：
```bash
# 启动独立的 Postgres (5435 端口)，并拉起开发前后端
export POSTGRES_PORT=5435
echo "1" | bash dev.sh
```
在浏览器打开 [http://localhost:5173](http://localhost:5173) 即可直接调试开源版本。

### 3. 推送提交至 GitHub 开源库
检查代码变更并将其推送到开源远程的 `main` 分支：
```bash
git add .
git commit -m "sync: release tokensbyte open source version" --no-verify
git push origin main
```
