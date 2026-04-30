# OpenCode 模块设计报告

## 1. 背景

当前 app 已经重新接回官方 `anomalyco/opencode` 产品线，并以 `opencode-ai@1.14.29` 作为独立功能模块嵌入。现阶段的实现重点是：

- 先保证官方 CLI 在 app 内稳定可用
- 保留后续个性化和产品化改造空间
- 避免直接深改内核，降低版本升级成本

现有版本本质上是：

- app 负责会话管理、工作目录、参数管理、启动生命周期
- `OpenCode` 官方二进制负责实际 agent / TUI / 工具执行
- 内置终端只承担受控宿主角色

这意味着当前模块已经可用，但还没有形成真正“属于这个 app 自己”的编程工作台体验。

## 2. 当前实现现状

当前 `OpenCode` 模块由以下部分组成：

- 页面入口与模式切换：
  - [App.tsx](/Users/guyue/Project/guyue-master/App.tsx)
  - [types.ts](/Users/guyue/Project/guyue-master/types.ts)
- 模块页面壳层：
  - [components/OpenCodeManager.tsx](/Users/guyue/Project/guyue-master/components/OpenCodeManager.tsx)
- Electron 端二进制发现与信息桥接：
  - [electron/main.ts](/Users/guyue/Project/guyue-master/electron/main.ts)
  - [electron/preload.ts](/Users/guyue/Project/guyue-master/electron/preload.ts)
- 终端承载层：
  - [components/Terminal.tsx](/Users/guyue/Project/guyue-master/components/Terminal.tsx)

当前已具备的能力：

- `OpenCode` 作为独立模块显示在侧边栏
- 会话列表、新建、重命名、删除
- 每个会话绑定工作目录和附加参数
- 进入模块后先显示安全壳层，手动点击“启动”再挂载终端
- 开发态直接使用 `node_modules/opencode-ai/bin/.opencode`
- 打包态将官方二进制作为额外资源带入 app

当前仍然存在的产品层不足：

- UI 仍偏“终端宿主”，不是“编程工作台”
- 会话数据还只是轻量本地状态，没有项目级结构
- 缺少文件、截图、选区、报错等上下文一键注入
- 缺少工具权限、命令审批、结果结构化面板
- 输出仍主要停留在终端文本，不利于和 app 其它模块协同

## 3. 设计目标

OpenCode 模块后续演进的核心目标不是“把终端放进 app”，而是把它升级成一个可控、可配置、可协同的编程代理工作台。

目标拆成四层：

1. 稳定性
- 官方 CLI 在 app 内长期稳定运行
- 终端渲染、启动链、异常恢复、状态保存可靠

2. 个性化
- 不同项目、不同任务可以有不同默认设置
- 用户可以定义自己的工作流和 prompt 模板

3. 协同化
- 能和文件管理、知识库、截图、学习空间、工作空间等模块互通
- 能把上下文显式传给 agent，而不是完全依赖手工输入

4. 可升级
- 尽量不改 OpenCode 内核源码
- 优先通过宿主层做增强，保证后续升级 `opencode-ai` 成本低

## 4. 设计原则

### 4.1 先做宿主层，后做内核层

第一阶段不 fork `OpenCode` 源码，只做外层增强：

- 会话系统
- 配置系统
- 上下文注入
- 权限控制
- 结果展示

只有当以下诉求出现时，才考虑 fork 内核：

- 需要改 OpenCode 自己的 TUI 布局
- 需要改内部快捷键和交互语义
- 需要改变工具调用和输出结构

### 4.2 不把终端当最终产品形态

终端只是承载层，不是最终体验本身。后续要逐步把以下内容从纯终端里“抬出来”：

- 改动文件列表
- diff
- 命令执行记录
- 错误输出
- 审批与确认
- 历史上下文

### 4.3 项目优先，而不是会话优先

当前数据结构偏“会话”，后续应转向“项目工作区”：

- 一个项目可以有多个会话
- 一个项目有固定的规则、记忆、默认模型、权限策略
- 会话只是该项目下某次 agent 工作过程的视图

## 5. 目标架构

建议把 `OpenCode` 模块拆成 5 层：

### 5.1 Runtime 层

职责：

- 找到官方 `OpenCode` 二进制
- 启动、停止、重启进程
- 绑定 PTY
- 处理崩溃恢复

对应现有基础：

- [electron/main.ts](/Users/guyue/Project/guyue-master/electron/main.ts)
- [components/Terminal.tsx](/Users/guyue/Project/guyue-master/components/Terminal.tsx)

### 5.2 Session 层

职责：

- 会话列表
- 会话标题
- 工作目录
- 启动参数
- 启动状态

现有实现基础：

- [components/OpenCodeManager.tsx](/Users/guyue/Project/guyue-master/components/OpenCodeManager.tsx)

后续要增强为：

- 项目分组
- 归档会话
- 最近使用
- 恢复历史工作目录

### 5.3 Project Config 层

职责：

- 每个项目自己的配置
- 默认模型、provider、附加参数
- 规则文件
- 允许/禁止工具
- 项目记忆

建议新增数据结构：

```ts
interface OpenCodeProjectProfile {
  id: string;
  name: string;
  cwd: string;
  defaultArgs: string;
  model?: string;
  provider?: string;
  rulesMarkdown?: string;
  memoryMarkdown?: string;
  allowedTools?: string[];
  blockedTools?: string[];
  createdAt: number;
  updatedAt: number;
}
```

### 5.4 Context Bridge 层

职责：

- 把 app 其它模块里的信息转成 agent 上下文

优先支持的输入源：

- 当前文件
- 当前选中文本
- 当前截图
- 当前错误输出
- 当前知识库片段
- 当前工作空间/学习空间笔记

交互形式建议：

- “发送到 OpenCode” 按钮
- 右键菜单
- 顶部快捷动作

### 5.5 Result Surface 层

职责：

- 不只显示终端文本，还要结构化承载结果

建议拆出的可视区域：

- 改动文件列表
- patch / diff 预览
- 终端日志
- 错误信息
- 用户批准区

## 6. 分阶段实施方案

### Phase 1：稳定宿主壳层

目标：把“能跑”收成“可长期使用”。

范围：

- 稳定 `OpenCode` 启动链
- 完善会话状态保存
- 明确开发态与打包态二进制路径
- 收紧异常处理与降级界面

当前状态：

- 已基本完成

### Phase 2：项目级配置中心

目标：把会话升级成可复用的项目工作配置。

范围：

- 项目配置面板
- 默认模型 / provider / args
- 项目规则和项目记忆
- 最近项目和快速切换

产出形式：

- `OpenCode Settings`
- `Project Profiles`

### Phase 3：上下文注入能力

目标：让 `OpenCode` 和 app 其它模块形成协作。

范围：

- 文件管理 -> 发送文件/片段到 OpenCode
- 截图 -> 附图注入
- 编码练习 -> 发送代码/报错
- 工作空间/学习空间 -> 发送笔记/文档

这是最关键的一步，因为这一步完成后，OpenCode 才真正成为整个 app 的编程代理中枢。

### Phase 4：结果结构化展示

目标：减少“只靠终端看结果”的低效体验。

范围：

- 解析 agent 运行后的改动
- 单独展示文件变更和 diff
- 单独展示命令执行和错误
- 支持一键跳转相关文件

### Phase 5：权限与审批系统

目标：在不破坏效率的情况下，保证安全可控。

范围：

- 命令白名单 / 黑名单
- 文件路径限制
- 高风险操作确认
- 审批历史

## 7. UI 设计建议

OpenCode 模块建议采用“三栏可收缩”布局：

- 左栏：项目 / 会话 / 搜索 / 新建
- 中栏：终端主视图
- 右栏：结果 / diff / 上下文 / 设置

初始版本可以保持简洁：

- 左栏最小必要信息
- 中间仍以终端为主
- 右栏默认折叠，需要时展开

风格原则：

- 视觉上不要比编码练习更重
- 不要把它做成第二个普通终端模块
- 信息密度高，但界面层次要明确

## 8. 数据与存储建议

建议把 `OpenCode` 数据拆成以下几类：

1. 全局设置
- 默认渲染模式
- 默认终端 profile
- 全局 provider / model 偏好

2. 项目配置
- 按项目路径维度保存

3. 会话数据
- 标题
- cwd
- 启动参数
- 最近活动时间

4. 项目记忆
- `rules`
- `memory`
- `notes`

存储策略建议：

- 轻量配置：`localStorage`
- 项目级内容：用户目录 JSON / Markdown 文件
- 后续如果复杂度继续上升，再考虑统一迁移到文件存储层

## 9. 风险与边界

### 9.1 终端渲染边界

即使宿主层优化很多，Electron + xterm 的体验也不可能完全等于 Ghostty 这类原生终端。复杂 TUI、特殊字符、同步渲染场景仍可能存在差异。

### 9.2 官方升级带来的兼容变化

如果 OpenCode 后续版本改了：

- 启动参数
- 输出格式
- 交互流程
- 配置文件结构

宿主层需要同步调整。

### 9.3 二进制嵌入与深度定制的边界

如果继续使用官方二进制，能改很多宿主层体验，但不能直接改它内部 TUI 逻辑。

如果未来要做这些：

- 改内部布局
- 改快捷键
- 改工具调用语义
- 改输出结构

就需要 fork 源码，而不是只嵌二进制。

## 10. 建议的下一步

建议按这个顺序推进：

1. 先做 `OpenCode 专属设置中心`
2. 再做 `项目级配置与模板`
3. 再做 `文件/截图/报错/选区` 注入
4. 再做 `diff / 结果面板`
5. 最后补 `权限与审批`

原因很简单：

- 这条路径不破坏当前可用性
- 版本升级仍然方便
- 每一步都能直接提升使用体验

## 11. 结论

OpenCode 模块后续最合理的方向，不是马上重写成另一个 agent，也不是立刻 fork 内核，而是：

- 先把官方 `OpenCode` 稳定嵌入
- 再逐步把“项目配置、上下文注入、结果结构化、权限审批”做在 app 外层
- 让它从“内置终端跑 CLI”升级成“编程代理工作台”

这样既能保留官方版本更新能力，也能逐步长成你自己的产品形态。
