# Guyue Master 

Guyue Master 是一款专为 macOS 设计的现代化生产力工具，集成了书签管理、LeetCode 刷题助手、Markdown 笔记、终端工具等多种功能。它采用 React + Electron 构建，拥有精美的 macOS 原生风格界面（Glassmorphism）。

## ✨ 主要功能

### 1. 🔖 智能书签管理

- **可视化管理**：以卡片形式展示书签，支持拖拽排序。
- **智能分类**：支持多级分类管理，方便整理大量书签。
- **浏览器集成**：内置简易浏览器，可直接在应用内预览网页。
- **导入导出**：支持从 Chrome/Edge 等浏览器导入书签。

### 2. 🧠 LeetCode 刷题助手

- **题目列表**：集成 LeetCode 题目数据，支持按难度、标签筛选。
- **刷题计划**：支持制定刷题计划，追踪进度。
- **代码编辑器**：内置代码编辑器，支持多种编程语言高亮。
- **笔记关联**：每道题目都可以关联 Markdown 笔记，记录解题思路。

### 3. 📝 Markdown 笔记系统

- **所见即所得**：支持实时预览的 Markdown 编辑器。
- **数学公式**：支持 LaTeX 数学公式渲染 ($E=mc^2$)。
- **代码高亮**：支持多种语言的代码块高亮。
- **图片管理**：支持图片粘贴上传（需配置图床）。

### 4. 💻 开发者工具箱

- **内置终端**：集成 zsh 终端，支持多标签页，方便执行命令行操作。
- **SSH 连接**：支持保存和管理 SSH 连接，一键连接远程服务器。
- **API 调试**：内置简易 API 调试工具，方便测试 HTTP 接口。

### 5. 🎨 现代化界面

- **macOS 风格**：采用 hiddenInset 标题栏，完美融入 macOS 系统。
- **深色模式**：支持系统级深色模式切换。
- **毛玻璃效果**：大量使用 backdrop-filter 实现精美的毛玻璃效果。

## 🛠️ 技术栈

- **前端框架**: React 19, TypeScript, Vite
- **桌面框架**: Electron
- **UI 组件**: Lucide React (图标), Tailwind CSS (样式)
- **编辑器**: React Markdown, React Syntax Highlighter
- **终端**: xterm.js, node-pty

## 📦 环境要求

- **操作系统**: macOS 10.15+ (Catalina 或更高版本)
- **Node.js**: v18.0.0+ (推荐 v20 LTS)
- **包管理器**: npm 或 yarn

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式运行

```bash
npm run electron:dev
```

此命令会同时启动 Vite 开发服务器和 Electron 窗口，支持热重载。

### 3. 打包应用

#### 打包为 DMG 安装包 (推荐)

```bash
npm run electron:build:dmg
```

打包完成后，安装包位于 `release/` 目录下。

#### 仅打包为 .app

```bash
npm run electron:build:mac
```

## 📂 项目结构

```
guyue-master/
├── components/           # React UI 组件
│   ├── Sidebar.tsx      # 侧边栏导航
│   ├── Terminal.tsx     # 终端组件
│   ├── MarkdownEditor.tsx # Markdown 编辑器
│   └── ...
├── electron/             # Electron 主进程代码
│   ├── main.ts          # 主进程入口 (窗口管理, IPC)
│   └── preload.ts       # 预加载脚本 (安全桥接)
├── services/             # 业务逻辑服务 (AI, API 等)
├── utils/                # 工具函数
├── build/                # 构建资源 (图标等)
├── release/              # 打包输出目录
├── package.json          # 项目配置与依赖
└── vite.config.ts        # Vite 构建配置
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

[MIT License](LICENSE)
