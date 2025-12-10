# Guyue Master

> 面向 macOS 的多合一知识与开发工作台，整合书签、学习、AI、终端与插件生态，帮助个人在一处完成日常知识与研发工作。

Guyue Master 基于 React + Electron 打造，提供 macOS 原生风格的玻璃拟物界面，覆盖书签收藏、LeetCode 刷题、Markdown 笔记、AI Chat、小型 API/SSH/终端工具箱以及插件容器等模块。所有数据默认保存在本地，可离线工作，也能按需连接云端服务与插件。

## ✨ 功能亮点

**知识与学习**  
- 集成 `LeetCode Hot 100`、自定义课程与学习数据面板，支持刷题计划与进度追踪。
- Markdown 编辑器支持同步预览、代码高亮、KaTeX 数学公式（例如 $E = mc^2$）与图片托管。
- Prompt 库、学习清单、Todo、档案/归档视图等组件帮助整理日常知识体系。

**信息管理**  
- 书签 / API / 文件 / 图片等模块以卡片或分组形式展示，支持拖拽排序和多级分类。  
- 内置 Web Browser 与 File Renderer，可直接在应用中预览网页、Markdown、PDF 或媒体文件。  
- 浮窗聊天、侧边栏、导航轨道等 UI 组件可自由组合，打造个性化控制中心。

**开发者工具**  
- 集成 xterm.js + node-pty 的多标签终端，快捷运行 zsh 命令。  
- SSH 管理器保存常用主机，一键连接。  
- API 调试面板与文件浏览器便于联调接口或查看本地工程。  
- Image Hosting、Plugin Container 等功能模块覆盖常见研发辅助场景。

**AI 与自动化**  
- Chat Manager 与 Floating Chat Window 支持多会话、多模型（通过 `@google/genai` 等 SDK）快速查询或生成内容。  
- 学习/刷题记录可与 AI 笔记联动，实现题解、总结、提示自动化。

**桌面体验**  
- macOS hiddenInset 标题栏、毛玻璃、暗色模式、动画过渡等细节营造原生体验。  
- Electron 主进程提供安全的 preload 桥接，确保渲染进程调用系统能力时的隔离性。  
- 通过 electron-builder 打包 DMG/ZIP，便于分发。

## 🧱 技术栈

- **UI**: React 19 · TypeScript · Vite 6 · Tailwind CSS · Lucide React
- **桌面**: Electron 39、electron-builder、自定义 preload（IPC 安全桥）
- **编辑器与渲染**: React Markdown、remark/rehype 插件族、React Syntax Highlighter、KaTeX
- **终端与系统**: xterm.js、node-pty、文件系统桥接、SSH/HTTP 服务封装
- **AI/插件**: `@google/genai`、插件容器与示例插件 (`example_plugins/`)

## 📦 环境要求

- macOS 10.15 (Catalina) 或更高版本
- Node.js 18+（推荐 20 LTS）
- npm 9+（或使用 pnpm/yarn，自行调整命令）

## 🚀 快速开始

1. **安装依赖**
	```bash
	npm install
	```
2. **启动开发模式**（Vite + Electron 热重载）
	```bash
	npm run electron:dev
	```
3. **浏览器调试**（仅渲染进程）
	```bash
	npm run dev
	```

### 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite，仅调试前端界面 |
| `npm run electron:dev` | 同时启动 Vite 与 Electron，适合日常开发 |
| `npm run build` | 生成前端静态资源，输出到 `dist/` |
| `npm run electron:build` | 构建前端 + 主进程，再执行 electron-builder（按照 `build` 配置输出） |
| `npm run electron:build:mac` | 限定 macOS 平台打包 `.app` 和 `.zip` |
| `npm run electron:build:dmg` | 打包 macOS DMG 安装包（默认产物位于 `release/`） |

## 📦 构建与发布

1. 执行 `npm run electron:build:dmg` 生成 DMG；或使用 `electron:build:mac` 输出 `.app`/`.zip`。
2. 构建产物默认位于 `release/`，其中 `latest-mac.yml`、`.blockmap` 等文件可直接用于自动更新或分发。
3. electron-builder 配置位于 `package.json -> build`，包含应用 ID、图标、签名参数、DMG 布局等，可按需调整。
4. 若需 CI/CD，可在构建前运行 `npm run build && npx tsc -p electron/tsconfig.json` 以确保渲染层与主进程 TypeScript 完整编译。

## 📂 目录概览

```
guyue-master/
├── App.tsx / components/      # React 组件与 UI 模块
├── electron/                  # 主进程、预加载脚本与配置
├── services/                  # Chat / 学习 / API 等业务服务
├── utils/                     # 存储、解析、工具函数
├── build/                     # 图标与构建资源
├── release/                   # 构建输出 (DMG、blockmap 等)
├── example_plugins/           # 插件示例 (calculator, cs336-learning...)
├── types.ts / metadata.json   # 全局类型与应用配置
└── vite.config.ts / tsconfig  # 构建与 TypeScript 配置
```

## 🔌 插件与扩展

- `example_plugins/` 提供 Calculator、CS 课程等 Demo，包含 `manifest.json` 与静态页面，可作为自定义插件模板。
- 插件通过 Plugin Container 挂载，支持在渲染层读取 manifest、注入 iframe、与主进程交换数据。
- 典型步骤：
  1. 在 `example_plugins/your-plugin/` 中编写前端页面与 `manifest.json`；
  2. 在应用设置中加载插件目录，或在代码中将 manifest 写入配置；
  3. 通过 `window.electronAPI` 与主进程通讯，获取存储、网络或文件能力。

## 🤝 贡献指南

1. Fork 仓库并创建特性分支 `git checkout -b feature/awesome`
2. 开发并确保 `npm run electron:dev` 与打包脚本通过
3. 提交前运行 `npm run build` 验证渲染层无错误
4. 推送分支并发起 Pull Request，附上变化截图或说明

欢迎反馈 Bug、提出新模块想法，或完善插件生态。

## 📄 License

MIT License © Guyue — 详见 `LICENSE`
