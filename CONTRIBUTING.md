# 贡献指南

感谢你对 CUS Designer 的兴趣！我们欢迎各种形式的贡献，包括 bug 修复、功能添加、文档改进和代码审查。

## 行为准则

本项目遵循贡献者契约行为准则。参与本项目即表示你同意遵守其中的条款和条件。

## 如何贡献

### 报告 Bug

使用 GitHub Issues 报告 bug。请遵循以下模板：

1. **标题**：清晰简洁地描述问题
2. **描述**：详细说明问题
   - 重现步骤
   - 期望行为
   - 实际行为
   - 环境信息（操作系统、浏览器、Node.js 版本）
3. **截图**：如果适用，添加截图
4. **标签**：使用适当的标签（bug、enhancement 等）

### 提出新功能

新功能建议请先在 GitHub Issues 中讨论：

1. **标题**：以 `[Feature]` 开头
2. **描述**：
   - 功能动机
   - 预期用途
   - 实现思路（可选）
   - 替代方案（可选）

### 提交代码

#### 开发流程

1. **Fork 仓库**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cus.git
   cd cus
   ```

2. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

3. **安装依赖**
   ```bash
   pnpm install
   ```

4. **开发**
   ```bash
   pnpm dev  # 启动开发服务器
   pnpm test # 运行测试
   ```

5. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   ```

6. **推送并创建 Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

#### 代码规范

- **TypeScript**：所有新代码必须使用 TypeScript
- **ESLint**：遵循项目的 ESLint 配置
- **Prettier**：代码格式化
- **测试**：新功能必须包含测试

#### 提交信息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**：
- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档更新
- `style`：代码格式调整
- `refactor`：代码重构
- `test`：测试相关
- `chore`：构建/工具链相关

**示例**：
```
feat(color): 添加 OKLCH 到 RGB 的转换函数

- 实现 oklchToRgb 函数
- 支持 sRGB 和 Display P3 色域
- 添加单元测试

Closes #123
```

### 代码审查

所有 Pull Request 都需要至少一位维护者的审查。审查者会关注：

- 代码质量和可读性
- 测试覆盖率
- 文档完整性
- 性能影响
- 安全性

## 开发环境设置

### 环境要求

- Node.js >= 22.12
- pnpm >= 10.28
- Git

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# 构建
pnpm build
```

### 项目结构

```
cus/
├── apps/designer/          # React Designer 应用
├── packages/               # 核心包
│   ├── core/              # 核心类型与工具
│   ├── color/             # 色彩转换
│   ├── palette/           # 调色板生成
│   ├── theme/             # 主题生成
│   ├── semantic/          # 语义色映射
│   ├── export/            # 导出功能
│   ├── validation/        # 验证逻辑
│   └── ui/                # 共享 UI 组件
└── tests/                 # 测试套件
```

### 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test:phase1

# 监听模式
pnpm test:watch

# E2E 测试
pnpm test:e2e

# 视觉回归测试
pnpm test:visual
```

## 文档

- 更新 README.md（如果需要）
- 更新相关包的文档
- 添加代码注释（特别是复杂逻辑）
- 更新 CHANGELOG.md

## 发布流程

发布由维护者负责，流程如下：

1. 更新版本号：`pnpm version <major|minor|patch>`
2. 更新 CHANGELOG.md
3. 创建 GitHub Release
4. 发布到 npm（如果适用）

## 获取帮助

- 查看 [README.md](./README.md)
- 查看 GitHub Issues
- 联系维护者

## 致谢

感谢所有贡献者！
