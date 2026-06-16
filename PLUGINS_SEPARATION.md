# TokensByte 开源版与商业版插件隔离方案（方案二）操作指南

本指南详细说明了如何使用 **Rust 条件编译 (Cargo Features)** 以及 **前端 Mock 桩文件** 来实现一套代码兼容“开源版”与“内部商业版”。

通过此方案，您可以保持两套系统在同一代码库（或通过 Git 同步）中维护。当发布开源版时，关闭编译 Features 并用 Dummy 文件替换私有插件目录，即可使开源版顺利编译通过，且不泄漏任何商业逻辑代码。

---

## 一、后端部分 (Rust) 改造步骤

后端的隔离主要依赖 Rust 的条件编译门控 `#[cfg(feature = "system_plugins")]` 和 `#[cfg(feature = "user_plugins")]`。

### 1. 修改 `Cargo.toml`
在 `backend/Cargo.toml` 中，声明需要隔离的 Feature（默认关闭）：

```toml
[features]
default = []
# 商业版专属插件 Feature
commercial_plugins = []
```

### 2. 改造服务、模型与 API 的 Module 声明

在对应的 `mod.rs` 中，使用 `#[cfg]` 宏包裹需要隔离的模块。如果 Feature 未启用，编译器不会去寻找或编译对应的文件。

#### `backend/src/models/mod.rs`
```rust
// 仅在启用商业版 Feature 时编译卡池模型
#[cfg(feature = "commercial_plugins")]
pub mod volcengine_pool;
#[cfg(feature = "commercial_plugins")]
pub mod gptimage_pool;

// 站点 Icon 库为开源版内置，无需包裹
pub mod site_icon;
```

#### `backend/src/services/mod.rs`
```rust
#[cfg(feature = "commercial_plugins")]
pub mod volcengine;
#[cfg(feature = "commercial_plugins")]
pub mod volcengine_pool;
```

#### `backend/src/api/mod.rs`
```rust
#[cfg(feature = "commercial_plugins")]
pub mod volcengine_pool;
#[cfg(feature = "commercial_plugins")]
pub mod gptimage_pool;
// 站点插件（assets/team_marketing/playground/plugins配置等）
#[cfg(feature = "commercial_plugins")]
pub mod assets;
#[cfg(feature = "commercial_plugins")]
pub mod team_marketing;
#[cfg(feature = "commercial_plugins")]
pub mod playground;
#[cfg(feature = "commercial_plugins")]
pub mod plugins; // 模型广场、后台插件管理等
```

### 3. 改造路由挂载 (`backend/src/api/mod.rs`)

在 `build_router` 函数中，使用 `#[cfg]` 条件编译来选择性挂载路由：

```rust
    // 基础管理路由中嵌套的插件路由
    let mut management_routes = Router::new()
        .route("/dashboard", get(dashboard::get_stats))
        // ... 其他核心路由 ...
        .nest("/plugins/site-icons", site_icons::router()); // 站点图标保留在开源版

    // 如果启用了商业版 Feature，则挂载卡池等路由
    #[cfg(feature = "commercial_plugins")]
    {
        management_routes = management_routes
            .nest("/plugins/volcengine_pool", volcengine_pool::router())
            .nest("/plugins/gptimage_pool", gptimage_pool::router())
            .nest("/plugins", plugins::router())
            .nest("/assets", assets::router())
            .nest("/team-marketing", team_marketing::router())
            .nest("/playground", playground::router())
            .route("/marketplace/public", get(plugins::get_marketplace_public));
    }
```

### 4. 改造数据库迁移脚本 (`backend/src/db/migrations.rs`)

在运行表创建和种子数据时，使用 `#[cfg]` 包裹商业版特有的 SQL 执行：

```rust
    // 站点 Icon 依然保留创建
    sqlx::query("CREATE TABLE IF NOT EXISTS site_icons ( ... )").execute(pool).await?;

    // 仅在商业版中创建卡池、素材管理等表
    #[cfg(feature = "commercial_plugins")]
    {
        sqlx::query("CREATE TABLE IF NOT EXISTS volcengine_pools ( ... )").execute(pool).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS gptimage_pools ( ... )").execute(pool).await?;
        sqlx::query("CREATE TABLE IF NOT EXISTS plugin_assets ( ... )").execute(pool).await?;
        // 种子数据插入
        sqlx::query("INSERT INTO plugins (name, title, category) VALUES ('volcengine_pool', ...)")
            .execute(pool).await?;
    }
```

### 5. 改造渠道管理调用 (`backend/src/api/channels.rs`)

修改渠道测试等需要调用商业版服务的逻辑：

```rust
    // ── 处理卡池逻辑 ──
    if let Some(pool_id) = channel.pool_id {
        #[cfg(feature = "commercial_plugins")]
        {
            if let Some(account) = crate::services::volcengine_pool::select_account(&state, pool_id, &test_model).await {
                channel.api_key = account.api_key;
                channel.base_url = account.base_url;
            } else {
                return Err(crate::error::AppError::BadRequest("该渠道绑定了火山卡池，但当前无可用的卡池账号".to_string()));
            }
        }
        #[cfg(not(feature = "commercial_plugins"))]
        {
            return Err(crate::error::AppError::BadRequest("开源版本不支持卡池调度功能".to_string()));
        }
    }
```

---

## 二、前端部分 (React/Vite) 改造步骤

前端通过 **Mock 桩文件** 解决开源代码物理删除后 Vite 编译报错的问题。

### 1. 修改 `PluginConfig.tsx` 动态加载结构
在 `frontend/src/pages/Plugins/PluginConfig.tsx` 中，我们通常使用 `safeLazy` 来导入管理界面。
如果开源版把对应的物理文件夹删除了，Vite 构建会因为找不到文件而报错。因此，在开源版发布时，我们需要为这些目录生成**空 Mock 桩文件**：

#### 商业版专属插件的 Mock 桩文件：
* `frontend/src/pages/Plugins/VolcenginePool/PoolManager.tsx`
* `frontend/src/pages/Plugins/GptImagePool/PoolManager.tsx`
* `frontend/src/pages/Plugins/TeamMarketing/TeamConfig.tsx`
* `frontend/src/pages/Plugins/AssetManager/AdminPresetAssets.tsx`
* `frontend/src/pages/Plugins/AssetManager/RelayConvertAssets.tsx`

**桩文件内容（仅包含一行空渲染组件，无任何商业代码）**：
```typescript
import React from 'react';
export default () => null;
```

### 2. 隐藏前端菜单和页面入口 (`DashboardLayout.tsx`)
在前端通过变量或 API 控制不可见：
1. **隐藏管理后台的“站点插件”菜单**：
   在开源版中，隐藏 `DashboardLayout.tsx` 内的 `key: '/admin0755/plugins'` 菜单选项，使管理员在界面上看不到插件管理页面。
2. **保留站点图标（Site Icon）入口**：
   因为 Icon 图标库直接在模型管理、渠道管理的“图标选择器”（IconPicker）中以弹窗形式使用，不需要经过“站点插件”菜单配置，所以可以直接保留调用：
   `request.get('/plugins/site-icons/public')`

---

## 三、如何进行日常开发与打包发布

### 1. 开发和编译商业版
在 `backend` 目录下，运行时附带 feature 参数：
```bash
cargo run --features commercial_plugins
```
这样会把所有卡池、素材资产管理等功能编译进去。

### 2. 开发和编译开源版
不带任何 feature 参数直接编译：
```bash
cargo build --release
```
此时后端不会包含任何商业版卡池的二进制代码。

### 3. 开源版发布时的一键脱敏脚本 (推荐)
当您需要把 `tokensbyte-ws` 的代码推送到开源 `tokensbyte` 仓库时，只需运行一个简单的 Git 清理脚本：

```bash
#!/bin/bash
# 复制 ws 仓库到开源发布目录
cp -r tokensbyte-ws/ tokensbyte-oss/
cd tokensbyte-oss/

# 1. 物理删除商业版的 Rust 文件（由于有 #[cfg] 包裹，删掉文件依然可以通过编译）
rm backend/src/api/volcengine_pool.rs
rm backend/src/api/gptimage_pool.rs
rm backend/src/api/assets.rs
rm backend/src/api/team_marketing.rs
rm backend/src/api/playground.rs
rm backend/src/services/volcengine.rs
rm backend/src/services/volcengine_pool.rs
rm backend/src/models/volcengine_pool.rs
rm backend/src/models/gptimage_pool.rs

# 2. 物理删除前端商业版专属目录
rm -rf frontend/src/pages/Plugins/VolcenginePool/*
rm -rf frontend/src/pages/Plugins/GptImagePool/*
rm -rf frontend/src/pages/Plugins/TeamMarketing/*
rm -rf frontend/src/pages/Plugins/AssetManager/*

# 3. 写入前端空 Mock 桩文件，以防 Vite 编译报错
echo "export default () => null;" > frontend/src/pages/Plugins/VolcenginePool/PoolManager.tsx
echo "export default () => null;" > frontend/src/pages/Plugins/GptImagePool/PoolManager.tsx
echo "export default () => null;" > frontend/src/pages/Plugins/TeamMarketing/TeamConfig.tsx
echo "export default () => null;" > frontend/src/pages/Plugins/AssetManager/AdminPresetAssets.tsx
echo "export default () => null;" > frontend/src/pages/Plugins/AssetManager/RelayConvertAssets.tsx

# 提交并推送到开源仓库
git add .
git commit -m "release: tokensbyte open source version"
git push origin main
```
