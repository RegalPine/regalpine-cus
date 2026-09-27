# CUS Designer

基于 OKLCH 感知色彩空间的主题设计系统，用于生成高质量、可访问的色彩主题。

## 特性

- **感知色彩空间**：在 OKLCH 色彩空间中设计，保持明度、色度和色相的独立性
- **自动主题生成**：从品牌色自动生成 Light/Dark 主题
- **色域映射**：支持 sRGB 和 Display P3，智能色域映射
- **设计偏好**：可调色度基调、对比强度、中性色风格、语义色策略
- **实时验证**：WCAG 对比度验证，即时反馈色彩可访问性
- **多格式导出**：导出 JSON 配置、CSS 变量、Design Tokens
- **3D 色彩空间可视化**：交互式色彩空间探索器

## 技术栈

- **前端框架**：React 19 + TypeScript
- **构建工具**：Vite 7
- **样式方案**：Tailwind CSS 4
- **状态管理**：Zustand
- **UI 组件**：Radix UI
- **3D 渲染**：Three.js
- **包管理**：pnpm workspace
- **测试框架**：Vitest + Playwright

## 项目结构

```
cus/
├── apps/
│   └── designer/          # React Designer 应用
├── packages/
│   ├── core/              # 核心类型与工具
│   ├── color/             # 色彩转换与计算
│   ├── color-engine/      # 色彩引擎
│   ├── palette/           # 调色板生成
│   ├── palette-engine/    # 调色板引擎
│   ├── theme/             # 主题生成
│   ├── theme-engine/      # 主题引擎
│   ├── theme-schema/      # 主题 Schema
│   ├── semantic/          # 语义色映射
│   ├── semantic-engine/   # 语义色引擎
│   ├── export/            # 导出功能
│   ├── validation/        # 验证逻辑
│   ├── studio/            # Studio 工具
│   └── ui/                # 共享 UI 组件
└── tests/                 # 测试套件
```

## 快速开始

### 环境要求

- Node.js >= 22.12
- pnpm >= 10.28

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

访问 http://127.0.0.1:5173/cus/

### 构建

```bash
pnpm build
```

### 测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch

# E2E 测试
pnpm test:e2e

# 视觉回归测试
pnpm test:visual
```

## 使用指南

### 1. 选择品牌色

- 在侧边栏输入 HEX 颜色值
- 或使用品牌拾色器
- 或从预设品牌色中选择

### 2. 调整感知色彩

- **明度 (L)**：控制色彩的明暗程度
- **色度 (C)**：控制色彩的饱和度
- **色相 (h)**：控制色彩在色轮上的角度

### 3. 配置设计偏好

- **色度基调**：柔和 / 平衡 / 鲜明
- **对比强度**：标准 / 高对比
- **中性色**：品牌调 / 纯中性
- **语义色**：和谐 / 区分

### 4. 预览主题

- 切换 Light / Dark / Split 模式
- 查看界面预览、色板、色彩空间、Design Tokens
- 调整预览密度（舒适 / 紧凑 / 密集）

### 5. 导出主题

- 点击"导出主题"按钮
- 选择输出格式（sRGB / Display P3）
- 下载 JSON 配置文件

## 架构设计

### 色彩流水线

```
Brand Input (HEX/OKLCH)
    ↓
createBrandProfile → OKLCH 感知锚点
    ↓
createTheme → 生成 Light/Dark 主题
    ↓
generateValidatedTheme → WCAG 验证
    ↓
Export → JSON / CSS / Tokens
```

### 核心模块

- **@cus/color**：色彩转换（HEX ↔ RGB ↔ OKLCH）、色域映射、对比度计算
- **@cus/palette**：基于品牌色生成调色板
- **@cus/theme**：生成 Light/Dark 主题 tokens
- **@cus/semantic**：语义色映射（surface、text、border 等）
- **@cus/validation**：WCAG 对比度验证
- **@cus/export**：导出为多种格式

## 贡献指南

欢迎贡献！请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 许可证

MIT License - 详见 [LICENSE](./LICENSE)

## 致谢

- [OKLCH](https://oklch.com/) 色彩空间理论
- [Radix UI](https://www.radix-ui.com/) 无障碍组件
- [Tailwind CSS](https://tailwindcss.com/) 实用优先的 CSS 框架
