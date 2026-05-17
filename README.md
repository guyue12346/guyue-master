# Guyue Master

Guyue Master 是一个本地优先的 macOS 个人 AI 工作台。它不是单纯的聊天应用，而是把 Agent Runtime、结构化个人数据、学习空间、题库、RAG、Git、文件管理、MCP、Skills 和插件扩展统一到一个桌面应用中，让大模型可以在受控权限下操作真实的本地工作流。

## 项目定位

- **Agent-native**：应用内模块以工具能力的形式注册给 Agent，Agent 可以按计划查询、创建、修改和检查结果。
- **Local-first**：核心数据保存在本地，支持统一存储、镜像、迁移和快照，敏感信息优先在本地处理。
- **Extensible**：内置模块、插件、Skills、MCP Server 进入同一个 Capability Registry，由权限中心统一管理。
- **Workflow-oriented**：面向学习、刷题、写作、知识库、Git、文件、数据看板等长期工作流，而不是一次性问答。

## 核心架构

```text
React / Electron UI
  ├─ AgentPanel / FloatingAgentWindow
  ├─ Feature Modules
  └─ Settings / Permission Center

AgentRuntimeService
  └─ LangGraph NativeToolsAgentRuntime
      ├─ clarification_check
      ├─ tool_search
      ├─ load_skill
      ├─ mcp_read_resource
      ├─ planning
      ├─ tool_decision
      ├─ execution
      ├─ verification
      ├─ inspection
      └─ reporting

Capability Layer
  ├─ Builtin Module Tools
  ├─ Plugin Tools
  ├─ Skills / Prompt Cards
  └─ MCP Tools / Resources

Storage Layer
  ├─ localStorage mirror
  ├─ unified file storage
  ├─ migration / rescue
  └─ operation snapshots
```

## Agent Runtime

Agent 使用 `@langchain/langgraph` 实现节点式运行时，核心流程是“澄清需求 -> 规划步骤 -> 决策工具 -> 执行工具 -> 检查结果 -> 汇报”。相比一次性 Function Calling，它更适合多步骤任务，例如先获取当前时间，再搜索今日信息，再打开网页提取正文，最后综合回答。

### 执行节点

| 节点 | 作用 |
|------|------|
| `clarification_check` | 判断任务是否缺少必要信息，例如分类、时间、优先级、确认项等 |
| `tool_search` | 查询当前可用能力，支持插件、Skills、MCP 和内置工具发现 |
| `load_skill` | 根据用户 `@Skill` 或任务语义加载对应 Skill 内容 |
| `mcp_read_resource` | 读取 MCP Resource，为外部上下文注入提供正式入口 |
| `planning` | 生成可执行计划，并在 Agent Console 中展示步骤状态 |
| `tool_decision` | 为当前步骤选择一个工具或进入最终汇报 |
| `execution` | 执行工具调用，做 schema 校验、权限校验和风险处理 |
| `verification` | 检查工具执行结果是否满足当前步骤目标 |
| `inspection` | 对失败、空结果或不完整执行进行补救判断 |
| `reporting` | 汇总执行过程，给出最终自然语言结果 |

### Agent 能力

- 原生 Function Calling 工具调用。
- 多轮对话记忆和页面状态记忆。
- 计划列表实时更新，支持长任务取消和后台运行。
- 工具参数使用严格 schema 校验，避免模型生成非法参数。
- 写入、删除和高风险 MCP 操作可进入确认流程。
- 修改类操作保留快照，支持回滚设计。
- 支持 `@` 唤起 Skills / MCP / Prompt 能力选择。
- 支持联网搜索、网页打开、网页正文抽取和来源整合。
- 支持复杂任务模型配置，用更强模型处理长文生成或复杂分析。
- 支持调试面板导出单轮完整日志，便于定位工具调用问题。

## Capability 与扩展系统

Guyue Master 将“能力”抽象为统一的 `AgentCapability`，来源包括：

| 来源 | 说明 |
|------|------|
| `builtin` | 应用内置模块注册的工具，例如待办、学习空间、RAG、Git |
| `plugin` | 外部插件注册的 UI、commands、events 和 Agent tools |
| `skill` | `SKILL.md` 能力包或 Prompt 工作流 |
| `mcp` | MCP Server 暴露的 tools 与 resources |

核心实现：

- `ModuleManifest`：描述模块入口、图标、排序、权限和可注册能力。
- `AGENT_TOOL_REGISTRY`：动态工具注册中心，不再依赖固定静态数组。
- `CapabilityRegistry`：统一收集 builtin / plugin / skill / mcp 能力。
- `SkillManager`：扫描、解析、启停和加载 `SKILL.md`。
- `McpManager`：由 Electron main 进程管理 MCP 生命周期，renderer 通过 IPC 调用。
- `Permission Center`：按来源和模块管理 Agent 可用能力。
- `window.guyue`：插件侧安全 API，避免插件直接依赖 Node.js 权限。

插件可以注册：

- 页面 UI
- commands
- events
- Agent tools
- Skills 依赖
- MCP 依赖

插件开发说明可在应用 Agent 页面右侧文档入口查看，也可作为插件作者的接入规范。

## 主要功能模块

| 模块 | 能力 |
|------|------|
| **Agent** | 澄清、规划、工具调用、检查、后台任务、调试日志、浮窗唤起 |
| **Skills / MCP / Prompt** | 管理 Prompt、Skill 能力包、MCP Server 和分类 |
| **任务与日程** | 待办、子任务、提醒、优先级、分类、长期规划 |
| **学习空间** | 方向、课程、模块、章节、学习内容、学习资源和其他资源 |
| **题库** | 多级分类、Markdown / LaTeX 渲染、多解答、解题方法、题单导出 |
| **Code** | 编码练习、分类笔记、练习文件和代码材料管理 |
| **Git 管理** | 本地仓库列表、状态、分支、远程仓库、提交图谱和常用 Git 操作 |
| **RAG Studio** | 文件知识库、参数方案、分块、Embedding、向量检索、Agent 查询接口 |
| **数据中心** | 网站、SSH、API Key、OJ 热力图、资源中心、ZenMux / Kimi / DeepSeek / Google 数据 |
| **文件管理** | 打开文件夹、路径访问、隐藏文件、标记、备注和快速编辑 |
| **图床管理** | 图片分类、上传记录、链接访问和 Agent 图片读取 |
| **LaTeX** | 文件、模板、分类、模板新建文件和预览工作流 |
| **画布** | Excalidraw 多画布、分类、缩略图、拖拽排序和全屏编辑 |
| **便签 / Markdown** | 本地笔记、Markdown 编辑和快速内容管理 |
| **Music** | 本地音乐库、播放列表、后台播放、侧边栏状态岛、歌词和进度 |
| **终端 / 浏览器** | xterm.js 终端、内置浏览器和本地页面预览 |

## RAG Studio

RAG 部分以 LlamaIndex 为核心，重点是可配置、可评估、可被 Agent 调用。

- 支持文件夹和文件级知识库构建。
- 支持 Markdown、PDF、文本等格式的加载和分块。
- 支持保存 RAG 参数方案，构建时直接选择方案。
- 支持文件元信息记录：是否被收录、所属集合、索引时间、chunk 数量。
- 支持向量检索、查询配置和 Agent 工具调用。
- 当前主路径聚焦向量检索与元数据过滤，不把知识图谱作为默认链路。

## 数据与安全

- 应用默认本地存储，关键数据通过统一存储层做镜像和迁移。
- 分类型数据要求显式选择已有分类，减少“默认 / 未分类”导致的数据污染。
- 密码、API Key 等敏感信息会被本地拦截处理，避免直接发送给大模型。
- 写入和删除类 Agent 工具支持权限控制、确认和快照备份。
- MCP 高风险操作需要确认，浏览器导航、快照、只读资源读取可直接执行。

## 技术栈

| 层级 | 技术 |
|------|------|
| Desktop | Electron 39, Electron Builder |
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS |
| Agent | LangGraph, native Function Calling, typed tool registry |
| Editor | Monaco Editor, React Markdown, KaTeX |
| RAG | LlamaIndex, Embedding adapters, local vector store |
| Terminal | node-pty, xterm.js |
| Drawing | Excalidraw |
| Music | Howler, music-metadata |
| Integration | MCP stdio servers, Nodemailer, local IPC |

## 快速开始

```bash
# 安装依赖
npm install

# 完整桌面应用开发模式
# Vite 默认运行在 3001 端口，Electron 会等待该端口启动
npm run electron:dev

# 仅启动前端调试
npm run dev

# 类型检查
npx tsc --noEmit

# 构建渲染层
npm run build

# 打包 macOS DMG
npm run electron:build:dmg
```

## 目录结构

```text
.
├── App.tsx                    # 应用入口与全局状态编排
├── components/                # React 功能模块与 UI
├── electron/                  # Electron main / preload / MCP manager
├── services/
│   ├── agent/                 # Agent runtime、工具、权限、Skills、MCP、日志
│   ├── modules/               # ModuleManifest 与内置模块注册
│   ├── rag/                   # RAG 仓储与配置抽象
│   └── ragLlamaIndex/         # LlamaIndex 分块、索引、检索实现
├── utils/                     # 本地存储、导出、Markdown、密码处理等工具
├── scripts/                   # 构建与数据脚本
├── build/                     # Electron 构建资源
└── release/                   # 打包产物
```

## 开发约定

- 新模块优先通过 `ModuleManifest` 注册，而不是直接写死到主界面。
- 新 Agent 工具需要提供清晰的 schema、权限目标和执行结果结构。
- 涉及写入、删除、外部可见副作用的工具需要确认或快照。
- 分类型资源新增时应要求用户选择已有分类。
- 插件能力应通过 `window.guyue` 与宿主通信，不直接打开 Node.js 权限。
- 调试 Agent 问题时优先导出单轮 Debug JSON，检查计划、工具参数、执行结果和检查节点。

## 当前状态

项目仍在快速迭代中，重点方向包括：

- 完善插件生态和插件开发文档。
- 扩展 MCP Server 的稳定连接、工具发现和资源读取。
- 继续细化 Agent 对各业务模块的 CRUD 能力。
- 提升 RAG 构建、评测和查询体验。
- 强化长期任务、后台执行、回滚和执行日志。
