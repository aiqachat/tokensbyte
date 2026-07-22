# TokensByte 前端架构设计与开发指南

TokensByte 采用了现代化的超前前端技术栈架构：**React 19 + TypeScript 6 + Vite 8 + Ant Design 6.x + Shadcn UI + Tailwind CSS v4**。本指南旨在说明这一套高吞吐量、极速热重载的协同开发规范。

---

## 🎨 核心技术栈与架构设计

### 1. 核心框架层
* **React 19**：提供更高性能的并发渲染机制，支持 Server Component 协同与优化的 Hooks 体验。
* **TypeScript 6.x**：基于最新的语言规范提供更强劲的静态类型推导与类型安全防护。
* **Vite 8.x**：作为最先进的构建工具，提供秒级冷启动与近乎即时的热模块替换 (HMR) 体验。

### 2. 双 UI 库协同策略 (Coexistence Strategy)
为了同时兼顾管理后台的“密集表单数据处理”与用户侧的“极致高阶视觉体验”，系统采用了双 UI 库并存的方案：
* **Ant Design 6.x**：用于管理后台（Admin End）。提供强大的高维复杂数据管理、过滤表格、树形选择器和后台统计面板。
* **Shadcn UI / Tailwind v4 Custom Components**：用于用户端页面与高交互性的 Playground 创作中心。完全基于 Tailwind CSS 编写，提供流畅的微交互、深色模式切换和毛玻璃 (Glassmorphic) 艺术感。

---

## 🚀 Tailwind CSS v4 深度实践

Tailwind v4 抛弃了传统的 JavaScript 配置文件 (`tailwind.config.js`)，改用全新的 **CSS-first 架构**。

### 1. 编译器集成
系统在 [vite.config.ts](file:///Volumes/D/aiwwwroot2026/tokensbyte-ws/frontend/vite.config.ts) 中集成了全新的 `@tailwindcss/vite` 编译器插件：
```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

### 2. CSS-first 主题配置
在 [src/index.css](file:///Volumes/D/aiwwwroot2026/tokensbyte-ws/frontend/src/index.css) 中，我们直接使用 `@theme` 指令定义所有的 HSL 设计令牌：
```css
@import "tailwindcss";

@theme {
  --color-border: hsl(var(--border-custom));
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-accent: hsl(var(--accent-custom));
  
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

---

## 🤝 Ant Design 与 Tailwind v4/Shadcn 的完美融合

### 1. 主题 HSL 变量对齐
为了实现暗色模式 (Dark Mode) 和一键换肤，我们在 `:root` 及 `.dark` 伪类中注入了标准 HSL 变量。这些变量由 Tailwind 引擎自动编译为 CSS Utility Classes：
```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --radius: 0.5rem;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
}
```

### 2. 避免样式与 Reset 冲突 (Style Isolation)
* **CSS Reset 兼容**：Tailwind CSS v4 内置了 Preflight 作为默认 CSS 重置，这可能会改变部分 Ant Design 原生基础样式。因此，对于需要精细化定制的 UI 板块，我们通过 CSS Variable 进行对齐。
* **主题提供器对齐**：为了让 Ant Design 组件的外观颜色与 Tailwind 风格匹配，在 [AppThemeProvider.tsx](file:///Volumes/D/aiwwwroot2026/tokensbyte-ws/frontend/src/components/AppThemeProvider.tsx) 中，Ant Design 的 `theme.useToken()` 和全局 `ConfigProvider` 会根据系统明暗主题色动态注入对应的色彩算法。

---

## 🛠️ 常用开发指南

### 1. 运行核心命令
```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 启动本地开发服务 (支持 HMR 热更新)
npm run dev

# 静态类型检查
npx tsc --noEmit

# 生产环境编译打包
npm run build
```

### 2. Tailwind v4 高级修饰符用法示例
在 React 组件中，可以直接结合 Tailwind v4 最新的动态类：
```tsx
// 完美支持基于 HSL HMR 主题的一行类名
<div className="bg-background text-foreground border-border rounded-lg shadow-md hover:bg-accent transition-all duration-300">
  <h3 className="text-lg font-semibold">现代化高阶卡片</h3>
</div>
```
