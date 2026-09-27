# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [Unreleased]

### Added

- 初始版本发布
- 基于 OKLCH 感知色彩空间的主题设计系统
- React Designer 应用
- 核心色彩引擎模块
  - @cus/core：核心类型与工具
  - @cus/color：色彩转换与计算
  - @cus/palette：调色板生成
  - @cus/theme：主题生成
  - @cus/semantic：语义色映射
  - @cus/export：导出功能
  - @cus/validation：WCAG 验证
- 支持 sRGB 和 Display P3 色域
- Light/Dark 主题自动生成
- 设计偏好配置（色度、对比度、中性色、语义色）
- 3D 色彩空间可视化
- 实时 WCAG 对比度验证
- JSON 配置导入/导出
- 界面预览、色板、Design Tokens 视图
- 完整的测试套件（Vitest + Playwright）

### Technical Details

- **前端框架**：React 19 + TypeScript
- **构建工具**：Vite 7
- **样式方案**：Tailwind CSS 4
- **状态管理**：Zustand
- **UI 组件**：Radix UI
- **3D 渲染**：Three.js
- **包管理**：pnpm workspace
- **测试框架**：Vitest + Playwright

## [1.0.0] - 2026-09-27

### 首次发布

- 完整的色彩设计系统
- 感知色彩空间支持（OKLCH）
- 自动主题生成
- 色域映射与验证
- 多格式导出功能

---

## 版本说明

### 版本号规则

- **Major**：不兼容的 API 变更
- **Minor**：向后兼容的功能新增
- **Patch**：向后兼容的 bug 修复

### 变更类型

- **Added**：新功能
- **Changed**：功能变更
- **Deprecated**：即将废弃的功能
- **Removed**：已移除的功能
- **Fixed**：问题修复
- **Security**：安全性修复

---

[Unreleased]: https://github.com/yourusername/cus/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/cus/releases/tag/v1.0.0
