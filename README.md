# Guyue Master

面向 macOS 的个人生产力工作台。集 Agent、笔记、待办、学习空间、刷题、Git、RAG、终端、文件管理和插件扩展于一体，核心数据本地存储。

## 功能模块

| 模块 | 说明 |
|------|------|
| **Agent** | 规划、澄清、逐步工具调用、检查和总结；支持权限中心、Skills、MCP、插件工具和联网搜索 |
| **任务与日程** | 待办 / 子任务 / 提醒 / 优先级 / 总体规划，新增内容需要选择已有分类 |
| **学习空间** | 学习方向 / 课程 / 模块 / 章节 / 资源条目的结构化管理 |
| **刷题与 Code** | 题单 / 完成状态 / OJ 记录 / 编码练习 / 分类笔记 / 练习文件 |
| **题库** | 多级分类、题目与多个解答、解题方法关联、题单组卷和导出 |
| **Git 管理** | 本地仓库状态、变更、提交图谱、远程信息和常用 Git 操作 |
| **RAG Lab** | 本地文件知识库构建、参数方案、向量检索和 Agent 查询接口 |
| **Skills/MCP** | Prompt 能力卡、SKILL.md 扫描、stdio MCP Server 管理 |
| **数据中心** | 网站 / SSH / API / OJ / 资源 / ZenMux / Studio API / API Key 数据面板 |
| **文件与图床** | 本地文件编辑、隐藏文件支持、标记列表、图片托管和链接访问 |
| **LaTeX 与绘图板** | LaTeX 文件与模板管理，Excalidraw 多画布分类管理 |
| **Music** | 本地音乐播放，切换模块后继续播放，侧边栏状态展示进度和歌词 |
| **终端与浏览器** | xterm.js 多标签终端，内置 Mini Browser 快速预览网页 |
| **插件** | 内置插件化模块框架，插件可注册 UI、commands、events 和 Agent tools |

## 技术栈

React 19 · TypeScript · Vite 6 · Tailwind CSS · Electron 39 · node-pty · LangGraph · KaTeX · xterm.js

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（Vite + Electron 热重载）
npm run electron:dev

# 仅前端调试
npm run dev

# 打包 DMG
npm run electron:build:dmg
```

## 目录结构

```
├── App.tsx / components/    # React 组件
├── electron/                # Electron 主进程 + preload
├── services/                # 业务服务（Agent、RAG、模块注册等）
├── utils/                   # 工具函数
├── example_plugins/         # 插件示例（本地开发目录，默认不提交）
├── build/                   # 图标与构建资源
└── release/                 # 打包产物
```

## 环境要求

- macOS 10.15+
- Node.js 18+
- npm 9+
## 插件与 Agent 扩展

插件按 `ModuleManifest` 接入应用，可声明 UI、commands、events、agent tools，也可以声明 Skills/MCP 依赖。Agent 的工具入口由统一 Capability Registry 管理，核心模块、插件、Skills 和 MCP 都会进入同一张能力表，再由权限中心决定是否可用。

典型步骤：

1. 在 `example_plugins/your-plugin/` 中编写插件页面、manifest 和工具声明。
2. 通过安全的 `window.guyue` API 与宿主应用交互，不直接依赖 Node.js 能力。
3. 在插件说明中声明可注册给 Agent 的工具 schema、权限和执行结果格式。
4. 在应用中加载插件目录，并到权限中心开启对应能力。

## 🤝 贡献指南

1. Fork 仓库并创建特性分支 `git checkout -b feature/awesome`
2. 开发并确保 `npm run electron:dev` 与打包脚本通过
3. 提交前运行 `npm run build` 验证渲染层无错误
4. 推送分支并发起 Pull Request，附上变化截图或说明

欢迎反馈 Bug、提出新模块想法，或完善插件生态。

## 📄 License

MIT License © Guyue — 详见 `LICENSE`
