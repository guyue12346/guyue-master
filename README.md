# Guyue Master

面向 macOS 的个人生产力工作台。集笔记、待办、刷题、AI 助手、终端、文件管理于一体，所有数据本地存储。

## 功能模块

| 模块 | 说明 |
|------|------|
| **Markdown 笔记** | 编辑器 + 实时预览，支持 GFM、KaTeX、代码高亮、图片托管 |
| **待办与日程** | Todo 列表 / 子任务 / 日历热力图，支持归档 |
| **LeetCode 刷题** | Hot 100 / 自定义题单 / OJ 提交记录 / 做题热力图 |
| **学习管理** | 课程 / 分类 / 进度追踪 / 学习数据面板 |
| **AI 助手** | 多模型（Gemini / OpenAI / Anthropic），原生工具调用，多轮自动链式执行 |
| **终端** | xterm.js + node-pty 多标签终端 |
| **数据中心** | API 管理 / SSH 管理 / 密码库 / 资源中心 / GCP 账单 / Excalidraw 白板 |
| **文件与图床** | 文件分类管理 + 图片托管上传 |
| **邮件** | 通过 Nodemailer 发送邮件 |
| **插件** | iframe 容器加载自定义插件 |
| **浏览器** | 内置 Mini Browser 快速预览网页 |

## 技术栈

React 19 · TypeScript · Vite 6 · Tailwind CSS · Electron 39 · node-pty · @google/genai · KaTeX · xterm.js

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
├── services/                # 业务服务（AI Chat 等）
├── utils/                   # 工具函数
├── example_plugins/         # 插件示例
├── build/                   # 图标与构建资源
└── release/                 # 打包产物
```

## 环境要求

- macOS 10.15+
- Node.js 18+
- npm 9+
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
