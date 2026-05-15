import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertCircle, ListTodo, Settings, Settings2, StickyNote, FolderOpen, Command, Globe, Code2, GraduationCap, Image, MessageSquare, Pencil, HelpCircle, ChevronDown, ChevronUp, ChevronRight, Bug, Trash2, Paperclip, FileText, Trophy, HardDrive, Lock, Unlock, LayoutGrid, Mail, StopCircle, Undo2, Plus, BookUser, User, ShieldCheck, Workflow } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import type { TodoItem, Note, PromptRecord, MarkdownNote, OJSubmission, OJHeatmapData, ResourceItem, ResourceCenterData, EmailConfig, SubTask, FileRecord, Category, RecurringEvent, RecurringCategory, LatexFileCategory, LatexManagedFile, LatexTemplate, SSHRecord, APIRecord } from '../types';
import {
  ChatConfig,
  ChatService,
  AGENT_AVAILABLE_MODELS,
  ChatMessage,
  ChatAttachment,
  ChatTool,
  ChatToolCall,
  ChatDebugEvent,
} from '../services/chatService';
import { AgentSettingsModal } from './AgentSettingsModal';
import { AgentHelpModal } from './AgentHelpModal';
import { AgentPluginDocsModal } from './AgentPluginDocsModal';
import { AgentPermissionCenterModal } from './AgentPermissionCenterModal';
import { MarkdownContent } from './MarkdownContent';
import {
  AGENT_MODULE_REGISTRY_CHANGED_EVENT,
  getAgentModules,
  getEnabledAgentModules,
  getModuleById,
  isStepwiseNativeProvider,
  type AgentModule,
} from '../services/agent/agentModules';
import {
  DEFAULT_AGENT_EMAIL_CONFIG,
  AGENT_EMAIL_CONFIG_KEY,
  loadAgentConfig,
  loadAgentRouterConfig,
  loadAgentSearchConfig,
  saveAgentConfig,
  saveAgentRouterConfig,
  saveAgentSearchConfig,
  loadAgentHistory,
  saveAgentHistory,
  clearAgentHistory,
  loadAgentPermissions,
  saveAgentPermissions,
  loadContacts,
  saveContacts,
  loadModulePrompts as loadStoredModulePrompts,
  saveModulePrompts,
  type AgentEmailConfig,
  type AgentSearchConfig,
  type Contact,
} from '../services/agent/agentStorage';
import {
  AGENT_CRUD_ACTIONS,
  createAgentToolPermissions,
  DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS,
  DEFAULT_AGENT_TOOL_PERMISSIONS,
  getAgentPermissionModules,
  type AgentCrudAction,
  type AgentFullAccessPermissions,
  type AgentToolPermissions,
  type DataPermissions,
  deriveDataPermissionsFromToolPermissions,
} from '../services/agent/agentPermissions';
import {
  canUseToolRegistration,
  executeToolRegistration,
  findToolRegistration,
  generateToolCallSummary,
  getNativeToolRegistrations,
  getModuleByToolName,
  getToolPermissionCapabilities,
  getToolPermissionTarget,
  hasFullToolAccess,
  SPECIALIZED_SEARCH_TOOL,
  WEB_SEARCH_TOOL_REGISTRATION,
  SPECIALIZED_SEARCH_TOOL_REGISTRATION,
  type ToolRegistration,
  type ToolExecutionContext,
} from '../services/agent/toolRegistry';
import { toStrictTool } from '../services/agent/toolSchema';
import { getToolRegistry, getToolRegistryOwner } from '../services/agent/tools';
import { AGENT_TOOL_REGISTRY_CHANGED_EVENT } from '../services/agent/dynamicToolRegistry';
import {
  normalizeTodoPayload,
  resolveTodoMatch,
  resolveTodoSchedulePayload,
} from '../services/agent/tools/todoHelpers';
import {
  createAgentRuntime,
  createAgentToolExecutionEnvelope,
  type AgentCompletionEvaluation,
  type AgentTraceEvent,
} from '../services/agent/runtime';
import {
  appendAgentExecutionEntry,
  appendAgentExecutionTrace,
  createAgentExecutionLog,
  finalizeAgentExecutionLog,
  finishAgentToolTransaction,
  startAgentToolTransaction,
} from '../services/agent/executionLog';
import {
  needsHumanConfirmation,
  type AgentPendingConfirmation,
  type AgentUndoSnapshot,
} from '../services/agent/safety';
import {
  createAgentUndoSnapshotForTool,
  restoreAgentUndoSnapshot,
} from '../services/agent/snapshots';
import {
  detectModuleScopeLocally,
  getModuleDisplayName,
  getModuleScopeLabel,
  getRouterSignature,
  normalizeModuleScope,
} from '../services/agent/router';
import { detectSensitiveInput, redactSensitiveText } from '../services/agent/privacy';

/* ─── 类型定义 ─── */

/** 待确认操作（如发送邮件），需要用户手动批准 */
type PendingConfirmation = AgentPendingConfirmation;

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  action?: AgentAction;
  targetModule?: string; // 目标模块
  targetModules?: string[]; // 多模块作用域
  attachments?: ChatAttachment[];
  undoSnapshot?: UndoSnapshot;
  pendingConfirmation?: PendingConfirmation;
}

/** 修改/删除操作前的数据快照，用于一键回退 */
type UndoSnapshot = AgentUndoSnapshot;

interface AgentAction {
  type: string;
  status: 'pending' | 'success' | 'error';
  data?: Record<string, any>;
  error?: string;
}

type AgentRuntimeStatusStage = AgentTraceEvent['stage'] | 'idle';

interface AgentRuntimeStatusState {
  stage: AgentRuntimeStatusStage;
  status: AgentTraceEvent['status'] | 'idle';
  title: string;
  active: boolean;
}

interface AgentPanelProps {
  onOpenSettings?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  compact?: boolean;
  onRuntimeStatusChange?: (status: AgentRuntimeStatusState & { isProcessing: boolean }) => void;
  todos: TodoItem[];
  notes: Note[];
  onCreateTodo: (todoData: Partial<TodoItem>) => void;
  onUpdateTodo: (id: string, updates: Partial<TodoItem>) => void;
  onDeleteTodo: (id: string, options?: { skipConfirm?: boolean }) => void;
  onCreateNote: (noteData: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onCreatePrompt: (promptData: Partial<PromptRecord>) => void;
  onCreateMarkdownNote: (noteData: Partial<MarkdownNote>) => void;
  onCreateOJSubmission: (submission: OJSubmission) => void;
  onUpdateOJHeatmapData: (data: OJHeatmapData) => void;
  ojHeatmapData: OJHeatmapData;
  onCreateResource: (item: Partial<ResourceItem>) => void;
  onUpdateResource: (id: string, updates: Partial<ResourceItem>) => void;
  onDeleteResource: (id: string) => void;
  resourceData: ResourceCenterData;
  sshRecords: SSHRecord[];
  sshCategories: string[];
  onSaveSSH: (record: Partial<SSHRecord>) => void;
  onDeleteSSH: (id: string) => void;
  apiRecords: APIRecord[];
  apiCategories: string[];
  onSaveAPI: (record: Partial<APIRecord>) => void;
  onDeleteAPI: (id: string) => void;
  fileRecords: FileRecord[];
  fileCategories: string[];
  recurringEvents: RecurringEvent[];
  recurringCategories: RecurringCategory[];
  onCreateRecurring: (data: Partial<RecurringEvent>) => void;
  onUpdateRecurring: (id: string, data: Partial<RecurringEvent>) => void;
  onDeleteRecurring: (id: string) => void;
  onUpdateRecurringCategories: (categories: RecurringCategory[]) => void;
  todoCategories: string[];
  promptCategories: string[];
  markdownCategories: string[];
  onAddCategory: (moduleKey: string, name: string) => void;
  knowledgeBaseFileIds?: Set<string>;
}

interface AgentPromptOptions {
  selectedModule?: string | null;
  selectedModules?: string[];
  routedModule?: string | null;
  routedModules?: string[];
  promptMode?: 'native-tools' | 'fallback';
  customSystemPrompt?: string;
  modulePrompts?: Record<string, string>;
  allowedActionTypes?: string[];
}

interface AgentRouteResult {
  modules: string[];
  source: 'manual' | 'local' | 'llm' | 'cache' | 'search-only' | 'none';
  confidence: number;
  reason: string;
  useTools: boolean;
}

interface AgentSupplementalRouteResult {
  addModules: string[];
  needContinue: boolean;
  source: 'llm' | 'cache' | 'none';
  confidence: number;
  reason: string;
}

interface AgentRouteCacheEntry {
  key: string;
  kind: 'initial' | 'supplemental';
  modules: string[];
  useTools: boolean;
  confidence: number;
  reason: string;
  routerSignature: string;
  createdAt: number;
  updatedAt: number;
  hitCount: number;
}

interface AgentDebugItem {
  id: string;
  stage: string;
  summary: string;
  payload?: any;
  level?: 'info' | 'success' | 'error';
  timestamp: number;
  turnId?: string;
  turnIndex?: number;
}

interface AgentRuntimeToolVisualEvent {
  id: string;
  toolName: string;
  moduleName?: string;
  sourceLabel?: string;
  categoryLabel?: string;
  permissionLabel?: string;
  status: 'running' | 'success' | 'error' | 'waiting';
  summary: string;
  timestamp: number;
  durationMs?: number;
}

const MAX_DEBUG_ITEMS = 200;
const MAX_RUNTIME_VISUAL_EVENTS = 120;
const MAX_RUNTIME_TOOL_EVENTS = 80;
const AGENT_TOOL_CATEGORY_LABELS: Record<AgentCrudAction, string> = {
  read: '查询',
  create: '创建',
  update: '修改',
  delete: '删除',
};

const getToolVisualMeta = (registration: ToolRegistration) => {
  const owner = getToolRegistryOwner(registration.name);
  const permissionTarget = getToolPermissionTarget(registration);
  const sourceLabel = registration.module === 'web'
    ? '运行时工具'
    : owner?.kind === 'plugin'
      ? `插件：${owner.ownerId}`
      : '内置模块';
  const categoryLabel = registration.module === 'web'
    ? '联网检索'
    : AGENT_TOOL_CATEGORY_LABELS[permissionTarget.action] || permissionTarget.action;

  return {
    moduleName: getModuleDisplayName(registration.module),
    sourceLabel,
    categoryLabel,
    permissionLabel: `${getModuleDisplayName(permissionTarget.module)} · ${permissionTarget.action}`,
  };
};
const AGENT_ROUTE_CACHE_KEY = 'guyue_agent_route_cache_v1';
const AGENT_ROUTE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AGENT_ROUTE_CACHE_MAX_ENTRIES = 100;
const AGENT_ROUTE_CACHE_MIN_CONFIDENCE = 0.75;
const AGENT_PAGE_STATE_KEY = 'guyue_agent_page_state_v1';

interface AgentPageState {
  inputDraft: string;
  selectedModules: string[];
  isDebugCollapsed: boolean;
  isExecutionVizCollapsed: boolean;
  enableWebSearch: boolean;
}

const normalizeAgentPageState = (value: any): AgentPageState => {
  const enabledModuleIds = new Set(getEnabledAgentModules().map(module => module.id));
  return {
    inputDraft: typeof value?.inputDraft === 'string' ? value.inputDraft : '',
    selectedModules: Array.isArray(value?.selectedModules)
      ? value.selectedModules
          .map((moduleId: unknown) => String(moduleId))
          .filter(moduleId => enabledModuleIds.has(moduleId))
      : [],
    isDebugCollapsed: typeof value?.isDebugCollapsed === 'boolean' ? value.isDebugCollapsed : true,
    isExecutionVizCollapsed: typeof value?.isExecutionVizCollapsed === 'boolean' ? value.isExecutionVizCollapsed : false,
    enableWebSearch: typeof value?.enableWebSearch === 'boolean'
      ? value.enableWebSearch
      : localStorage.getItem('guyue_agent_web_search') === 'true',
  };
};

const loadAgentPageState = (): AgentPageState => {
  try {
    return normalizeAgentPageState(JSON.parse(localStorage.getItem(AGENT_PAGE_STATE_KEY) || 'null'));
  } catch {
    return normalizeAgentPageState(null);
  }
};

const saveAgentPageState = (state: AgentPageState) => {
  try {
    localStorage.setItem(AGENT_PAGE_STATE_KEY, JSON.stringify(state));
    localStorage.setItem('guyue_agent_web_search', state.enableWebSearch ? 'true' : 'false');
  } catch {}
};

const EMAIL_SENDING_LINE_RE = /(^|\n)\s*发送中(?:\.{3}|…+|。*)\s*(?=\n|$)/g;

const removeEmailSendingLine = (content: string) => {
  EMAIL_SENDING_LINE_RE.lastIndex = 0;
  const cleaned = content.replace(EMAIL_SENDING_LINE_RE, '$1').replace(/\n{3,}/g, '\n\n').trimEnd();
  EMAIL_SENDING_LINE_RE.lastIndex = 0;
  return cleaned;
};

const withEmailSendingLine = (content: string) => {
  if (EMAIL_SENDING_LINE_RE.test(content)) {
    EMAIL_SENDING_LINE_RE.lastIndex = 0;
    return content;
  }
  EMAIL_SENDING_LINE_RE.lastIndex = 0;
  return `${content.trimEnd()}\n\n发送中...`;
};

const withEmailFinalLine = (content: string, finalLine: string) => {
  const cleaned = removeEmailSendingLine(content);
  if (cleaned.includes(finalLine)) return cleaned;
  return `${cleaned}\n\n${finalLine}`;
};

/* ─── 调试阶段中文标签映射 ─── */
const STAGE_DISPLAY: Record<string, string> = {
  'send:start': '🚀 开始执行',
  'send:blocked': '🚫 发送阻止',
  'send:routing-result': '🧭 路由完成',
  'send:error': '❌ 执行失败',
  'langgraph:planning': '🧠 Agent 规划',
  'langgraph:decision': '🧭 Agent 决策',
  'langgraph:execution': '⚙️ Agent 执行',
  'langgraph:verification': '🔎 Agent 检查',
  'langgraph:inspection': '✅ Agent 复核',
  'langgraph:reflection': '🔄 Agent 反思',
  'langgraph:reporting': '📝 Agent 汇报',
  'langgraph:approval': '✋ Agent 待确认',
  'langgraph:error': '❌ Agent 错误',
  'router:selected-scope': '📌 手动作用域',
  'router:local-intent': '🔍 本地意图匹配',
  'router:cache-hit': '⚡ 路由缓存命中',
  'router:llm-request': '🤖 LLM 路由请求',
  'router:llm-response': '📨 LLM 路由结果',
  'router:supplement-request': '🔄 补充路由请求',
  'router:supplement-response': '📨 补充路由结果',
  'router:supplement-cache-hit': '⚡ 补充路由缓存',
  'router:supplement-applied': '✅ 补充作用域应用',
  'router:supplement-skip': '⏭️ 跳过补充路由',
  'router:skip': '⏭️ 跳过路由',
  'router:error': '❌ 路由失败',
  'native:request-context': '📋 构建请求上下文',
  'native:tool-call': '🔧 调用工具',
  'native:tool-result': '📦 工具执行结果',
  'native:done': '✅ 原生工具完成',
  'fallback:request': '📤 兼容模式请求',
  'fallback:response': '📥 流式回复完成',
  'fallback:action-parse': '🔍 解析 Action',
  'fallback:tool-exec': '🔧 执行工具',
  'fallback:tool-result': '📦 工具执行结果',
  'fallback:error': '❌ 兼容模式失败',
  'text-completion:start': '📤 LLM 文本请求',
  'text-completion:done': '📥 LLM 文本响应',
  'text-completion:error': '❌ LLM 请求失败',
  'openai:first-request': '📤 发送请求（含工具定义）',
  'openai:first-response': '📥 模型首轮响应',
  'openai:tool-calls': '🔧 模型工具决策',
  'openai:second-request': '📤 提交工具执行结果',
  'openai:second-response': '📥 模型总结回复',
  'anthropic:first-request': '📤 发送请求（含工具定义）',
  'anthropic:first-response': '📥 Claude 首轮响应',
  'anthropic:tool-calls': '🔧 Claude 工具决策',
  'anthropic:second-request': '📤 提交工具执行结果',
  'anthropic:second-response': '📥 Claude 总结回复',
  'gemini:first-request': '📤 发送请求（含工具定义）',
  'gemini:first-response': '📥 Gemini 首轮响应',
  'gemini:tool-calls': '🔧 Gemini 工具决策',
  'gemini:second-request': '📤 提交工具执行结果',
  'gemini:second-response': '📥 Gemini 总结回复',
  'native:tool-error-retry': '🔄 工具失败，回传模型重试',
  'native:max-iterations': '⚠️ 达到最大迭代次数',
  'history:clear': '🗑️ 清空历史',
  'history:delete-message': '🗑️ 删除消息',
  'web:search': '🌐 网络搜索',
};

/* ─── 调试面板每轮配色 ─── */
const TURN_COLORS = [
  { borderL: 'border-l-blue-400',    badge: 'bg-blue-50 text-blue-600 border border-blue-200',    title: 'text-blue-600' },
  { borderL: 'border-l-violet-400',  badge: 'bg-violet-50 text-violet-600 border border-violet-200',  title: 'text-violet-600' },
  { borderL: 'border-l-emerald-400', badge: 'bg-emerald-50 text-emerald-600 border border-emerald-200', title: 'text-emerald-600' },
  { borderL: 'border-l-amber-400',   badge: 'bg-amber-50 text-amber-600 border border-amber-200',   title: 'text-amber-600' },
  { borderL: 'border-l-rose-400',    badge: 'bg-rose-50 text-rose-600 border border-rose-200',    title: 'text-rose-600' },
  { borderL: 'border-l-teal-400',    badge: 'bg-teal-50 text-teal-600 border border-teal-200',    title: 'text-teal-600' },
] as const;

const AGENT_RUNTIME_STAGE_LABELS: Record<AgentRuntimeStatusStage, string> = {
  idle: '空闲',
  planning: '规划',
  decision: '决策',
  execution: '执行',
  verification: '检查',
  inspection: '复核',
  reflection: '反思',
  reporting: '汇报',
  approval: '确认',
  error: '错误',
};

const AGENT_RUNTIME_VISUAL_STAGES: Array<Exclude<AgentRuntimeStatusStage, 'idle'>> = [
  'planning',
  'decision',
  'execution',
  'verification',
  'inspection',
  'reflection',
  'reporting',
  'approval',
  'error',
];

const getAgentRuntimeIndicatorClass = (state: AgentRuntimeStatusState): string => {
  if (!state.active && state.status !== 'error') return 'bg-slate-300 ring-slate-100';
  if (state.status === 'error' || state.stage === 'error') return 'bg-red-500 ring-red-100';
  if (state.status === 'success') return 'bg-emerald-500 ring-emerald-100';
  if (state.status === 'waiting' || state.stage === 'approval') return 'bg-amber-500 ring-amber-100';
  if (state.stage === 'decision') return 'bg-indigo-500 ring-indigo-100';
  if (state.stage === 'verification') return 'bg-cyan-500 ring-cyan-100';
  if (state.stage === 'inspection') return 'bg-emerald-500 ring-emerald-100';
  if (state.stage === 'reflection') return 'bg-violet-500 ring-violet-100';
  return 'bg-blue-500 ring-blue-100';
};

const summarizeRuntimeToolResult = (result: any): string => {
  if (!result) return '无返回内容';
  if (typeof result === 'string') return result.length > 80 ? `${result.slice(0, 80)}...` : result;
  if (result.pendingConfirmation) return result.message || '等待用户确认';
  if (result.success === false) return result.error || '执行失败';
  if (Array.isArray(result)) return `返回 ${result.length} 项`;
  if (Array.isArray(result.items)) return `返回 ${result.items.length} 项`;
  if (typeof result.message === 'string') return result.message;
  if (result.success === true) return '执行成功';
  return '已返回结果';
};

/* ─── 各模块默认专属提示词 ─── */
const DEFAULT_MODULE_PROMPTS: Record<string, string> = {
  todo: `## 待办事项模块

### 核心能力
你可以管理用户的待办事项（增删改查）、子任务、重复事件（循环日程）和分类。

### 可用工具
- **create_todo** — 创建待办。必填 content（标题）；普通时间点用 dueDate，时间段事件用 startDateTime + endDateTime（或 durationMinutes），必要时显式传 timeType="range"。
- **query_todos** — 查询待办列表。可按 status（pending/completed/all）筛选，默认返回未完成项。
- **update_todo** — 修改待办。通过 id 定位，可改 content、priority、category、dueDate、startDateTime、endDateTime、isCompleted。
- **delete_todo** — 删除待办。优先通过 id 删除；若没有 id，可传 content 做精确定位。
- **create_subtask / query_subtasks / update_subtask / delete_subtask** — 子任务 CRUD，需先知道父待办 id。create_subtask 支持 subtasks 数组批量创建。
- **query_recurring_events** — 查询重复事件列表及可用分类（含 ID）。创建/修改重复事件前**必须**先调用此工具获取分类 ID。
- **create_recurring_event** — 创建循环日程（课程表、例会等）。需指定 title、recurrence（daily/weekly/monthly/yearly）、categoryId。weekly 可指定 weekDays。
- **update_recurring_event / delete_recurring_event** — 修改/删除重复事件。
- **create_recurring_category** — 创建新的重复事件分类。
- **create_category** — 为 todo / prompts / markdown 模块创建新分类（module + name）。

### 工作流程规范
1. **创建待办前**：如果用户没有明确指定分类，先 query_todos 了解已有分类结构，选择最合适的分类。
2. **设定时间**：用户说"明天下午三点"时，用明天对应日期的 dueDate（YYYY-MM-DDT15:00）；用户说"明天下午三点到五点"时，必须改用 startDateTime 和 endDateTime，不要只传一个 dueDate。
3. **批量创建**：用户要求创建多个待办时，逐个调用 create_todo，每个都带合适的参数。创建完后统一列出所有已创建项。
4. **子任务**：创建子任务前必须先知道父待办 id，可以在同一轮中先 create_todo 再 create_subtask（同一会话上下文中 id 可用）。
5. **重复事件分类**：创建/修改重复事件前**必须**先调用 query_recurring_events 获取 availableCategories（含 id），然后用 categoryId 指定。不要猜测分类名称。
6. **Todo 分类**：是字符串，直接用名称。如果用户指定的分类不在已有列表中，先调用 create_category（module: "todo"）创建。`,

  notes: `## 便签笔记模块

### 核心能力
管理用户的便签笔记（短文本备忘），支持增删改查和颜色设置。

### 可用工具
- **create_note** — 创建便签。必填 content，可选 color（bg-yellow-100 / bg-green-100 / bg-blue-100 / bg-pink-100 / bg-purple-100 / bg-orange-100）。
- **query_notes** — 查询所有便签列表。
- **update_note** — 修改便签内容或颜色，通过 id 定位。
- **delete_note** — 删除便签，通过 id 定位。

### 工作流程规范
1. 便签适合**简短的备忘信息**（一两句话），长内容请引导用户使用 Markdown 笔记模块。
2. 可以根据内容语义自动选择合适的颜色：重要/紧急用粉色或橙色，学习相关用蓝色，生活用绿色，默认黄色。
3. 修改/删除前如果不确定 id，先 query_notes 查询。`,

  prompts: `## Prompt 技能卡模块

### 核心能力
创建可复用的提示词/技能模板卡片，用于存储常用的 AI 提示词、工作流模板等。

### 可用工具
- **create_prompt** — 创建技能卡。必填 title 和 content（支持 Markdown），可选 category、description。
- **create_category** — 为 prompts 模块创建新分类（module: "prompts"）。

### 工作流程规范
1. content 字段支持完整的 Markdown 格式，可以包含代码块、列表、标题等。
2. 如果用户提供了一段提示词，帮助优化排版后存入——添加清晰的标题、使用 Markdown 结构化。
3. category 是字符串分类名，如果用户指定的分类不存在，先 create_category 创建。
4. description 应是一句话简介，方便用户快速识别这张卡片的用途。`,

  markdown: `## Markdown 笔记模块

### 核心能力
创建长文本 Markdown 笔记，适合日记、学习笔记、技术文章、会议记录等结构化内容。

### 可用工具
- **create_markdown_note** — 创建笔记。必填 title 和 content（Markdown 格式），可选 category。
- **create_category** — 为 markdown 模块创建新分类（module: "markdown"）。

### 工作流程规范
1. content 应使用规范的 Markdown 格式：合理使用标题层级（##、###）、列表、代码块、引用等。
2. 如果用户给出零散信息要求"帮我记一下"，主动整理成结构化的笔记格式。
3. 日记类内容可自动加上日期标题（如 ## 2026-03-15 周日）。
4. 技术笔记应有清晰的目录结构：概述 → 关键内容 → 总结/待办。
5. category 是字符串分类名，如果用户指定的分类不存在，先 create_category 创建。`,

  'dc-oj': `## OJ 记录模块

### 核心能力
查询 OJ 做题统计/热力图明细，管理做题记录和 OJ 网站配置。

### 可用工具
- **query_oj_stats** — 查询提交统计、最近记录、可用平台和分类 ID。
- **query_oj_heatmap** — 查询按日期聚合的热力图明细和提交记录。
- **create_oj_submission** — 创建做题记录。必填 siteName 和 problemId，可选 categoryId、problemTitle、date。
- **update_oj_submission / delete_oj_submission** — 修改或删除做题记录。
- **create_oj_site / update_oj_site / delete_oj_site** — 管理 OJ 网站和分类配置。

### 工作流程规范
1. 如果不确定平台或分类 ID，先 query_oj_stats。
2. 用户发截图时，从截图中提取平台、题号、题名和难度分类；不确定的信息不要编造。
3. date 使用 YYYY-MM-DD。`,

  'dc-resources': `## 资源中心模块

### 核心能力
管理数据中心资源记录，如云盘、AI 服务、服务器、域名、订阅等。

### 可用工具
- **query_resources** — 查询资源和分类列表（含 categoryId）。
- **create_resource** — 创建资源记录。
- **update_resource** — 修改资源记录。
- **delete_resource** — 删除资源记录。

### 工作流程规范
1. 创建或修改资源前先 query_resources 获取分类 ID。
2. 到期分析使用 expiringSoonDays 筛选。
3. 从自然语言中提取容量、费用、到期日、账号、备注等字段。`,

  'dc-ssh': `## SSH 管理模块

### 核心能力
管理数据中心 SSH 连接记录。

### 可用工具
- **query_ssh_records** — 查询 SSH 连接记录和可用分类。
- **create_ssh_category** — 创建 SSH 分类。
- **create_ssh_record** — 创建 SSH 连接记录，必须使用已有分类。
- **update_ssh_record** — 修改 SSH 连接记录。
- **delete_ssh_record** — 删除 SSH 连接记录。

### 工作流程规范
1. 修改或删除前先 query_ssh_records 获取 id。
2. 创建 SSH 记录前必须确认已有分类；没有合适分类时先调用 create_ssh_category。
3. 创建时如果用户没给 command，根据 host、username、port 自动生成。
4. 不确定字段时保留为空，不要猜测真实服务器信息。`,

  'dc-api': `## API 记录模块

### 核心能力
管理数据中心 API 接口记录。

### 可用工具
- **query_api_records** — 查询 API 记录和可用分类；只返回 hasApiKey，不返回密钥明文。
- **create_api_category** — 创建 API 分类。
- **create_api_record** — 创建 API 记录，必须使用已有分类；不要传 apiKey 明文，需要保存密钥时传 needsSecret=true。
- **update_api_record** — 修改 API 记录；不要传 apiKey 明文，需要修改密钥时传 needsSecret=true。
- **delete_api_record** — 删除 API 记录。

### 工作流程规范
1. 修改或删除前先 query_api_records 获取 id。
2. 创建 API 记录前必须确认已有分类；没有合适分类时先调用 create_api_category。
3. API Key、token、密钥永远不要写入模型回复或工具参数；让宿主创建本地填写卡片。
4. 用户要求保存密钥时，先创建/修改记录空位并设置 needsSecret=true，由用户在本地卡片中填写，也可以选择不保存。`,

  'dc-website': `## 网站管理模块

### 核心能力
管理数据中心的网站账号记录、密码、标签和备注。应用离线存储，访问由 Agent 权限中心控制。

### 可用工具
- **query_website_records** — 查询网站记录和标签；只返回 hasPassword，不返回密码明文。
- **create_website_record / update_website_record / delete_website_record** — 创建、修改、删除网站账号记录；需要保存密码时传 needsSecret=true。
- **create_website_tag / update_website_tag / delete_website_tag** — 管理网站标签。

### 工作流程规范
1. 修改或删除前先 query_website_records 获取 id。
2. 密码永远不要写入模型回复或工具参数；让宿主创建本地填写卡片。
3. 创建网站记录前必须先确认已有标签；没有合适标签时先调用 create_website_tag，再用该标签创建网站记录。
4. 用户要求保存密码时，先创建/修改记录空位并设置 needsSecret=true，由用户在本地卡片中填写，也可以选择不保存。
5. 删除标签时如果标签下有记录，必须指定另一个已有标签作为 fallbackTag；不能清空标签，也不能迁移到不存在的标签。`,

  leetcode: `## LeetCode 刷题模块

### 核心能力
创建和查询 LeetCode 结构化题单，每个题单由分组构成，每组包含多道题目。

### 可用工具
- **create_leetcode_list** — 创建题单。必填 title，可选 description、priority、groups（分组数组，每组含 name 和 problems）。
- **query_leetcode_lists** — 查询所有已有题单，返回标题、分组数和题目总数。

### 工作流程规范
1. 创建题单时，每组的 problems 数组中每道题应包含 id（编号如 "1"）和 title（如 "Two Sum"），可选 url。
2. 如果用户给出零散题目列表，主动按主题分组（如 "数组"、"链表"、"动态规划"）。
3. 合理设置 priority（排序用），数字越小越靠前。
4. 创建前可先 query_leetcode_lists 查看已有题单，避免重复创建。`,

  learning: `## 学习中心模块

### 核心能力
管理结构化学习课程，支持完整的课程体系（学习模块 → 讲义、练习模块、个人资源模块、自定义分区）。

### 可用工具
- **create_learning_course** — 创建课程。必填 title，必须指定 categoryId（已有分类 ID）或 categoryName（创建新分类），二选一。可选完整结构：modules（学习模块及其讲义）、assignmentModules（练习模块）、personalModules（个人资源模块）、customSections（自定义分区）。
- **query_learning_courses** — 查询所有分类（含唯一 ID）和课程列表。创建课程前**必须**先调用此工具获取分类 ID。
- **read_learning_course** — 读取课程完整结构。
- **create/update/delete_learning_category** — 管理学习分类。
- **update/delete_learning_course** — 修改或删除课程。
- **create/update/delete_learning_module** — 管理课程模块。
- **create/update/delete_learning_item** — 管理模块中的讲义或资源条目。

### 工作流程规范
1. **创建课程前**：**必须**先调用 query_learning_courses 获取 categories 列表及其 ID，然后用 categoryId 指定所属分类。绝对不要猜测分类名。
2. **创建新分类**：如果所有已有分类都不合适，可在 create_learning_course 中传 categoryName 自动创建新分类。
3. **课程结构**：一个课程可包含多个 module（如"第一章 概述"），每个 module 下有 lectures（讲义，标题+可选 Markdown 内容）。
4. **练习模块**：assignmentModules 用于放作业和练习。
5. **个人资源**：personalModules 用于存放个人笔记、参考资料等。
6. **自定义分区**：customSections 允许用户定义额外的知识分区。
7. 生成课程时应有完整的模块结构，而不只是一个空壳标题。`,

  files: `## 文件管理模块

### 核心能力
查询和读取用户文件管理中的文件内容（需在 Agent 权限中心开启文件读取权限），适合配合其他模块做总结、整理、发送邮件等跨模块任务。

### 可用工具
- **query_files** — 查询文件列表，可按分类或关键词筛选。返回文件 id、文件名、类型、分类、备注等元信息。
- **read_file** — 读取某个文件的文本内容（限 50KB 以内的文本文件）。必须使用 query_files 返回的 id。

### 工作流程规范
1. 需要在 Agent 权限中心开启「文件」读取权限后才能操作；不再使用侧边栏分类授权。
2. 操作流程：先 query_files 获取文件列表和 id → 用 read_file 读取具体文件内容。
3. 只能读取文本类文件（.txt, .md, .json, .csv, .js, .py 等），二进制文件（图片、PDF）无法读取。
4. 如果用户要求"看看文件里有什么"，用 query_files 列出即可；如果要求"读一下某个文件的内容"，再用 read_file。`,

  knowledge: `## 知识库模块

### 核心能力
基于 RAG Studio 中构建的向量库，以及用户加入 Agent 文件知识库的本地文件，进行语义检索。适合回答“根据我的资料/某批文件/知识库内容”的问题。

### 可用工具
- **list_rag_collections** — 列出 RAG Studio 中已有的向量库集合和查询方案。
- **search_rag_collections** — 搜索 RAG Studio 中已有的一个或多个向量库集合；不指定集合时搜索全部已构建集合。
- **search_knowledge_base** — 在已加入知识库的文件中语义搜索，返回相关片段和来源文件。
- **build_knowledge_base** — 构建或更新知识库索引。

### 工作流程规范
1. 用户说“我的向量库 / RAG / 知识库 / 文档库”时，优先 list_rag_collections 判断可用集合，再调用 search_rag_collections。
2. 用户明确指的是 Agent 文件知识库或刚加入的文件时，调用 search_knowledge_base；如果索引缺失，再 build_knowledge_base 后重试。
3. 最终回复需要标注主要来源文件名和知识库名，不要把未检索到的信息说成来自知识库。
4. 如果没有可用集合或未配置 Embedding API Key，明确告诉用户需要先在 RAG Studio 构建向量库或完成配置。`,

  image: `## 图床模块

### 核心能力
查询、上传和管理图床图片记录。

### 可用工具
- **query_images** — 查询图床中已有图片，返回 URL 和 Markdown 格式链接。
- **create_image_record** — 为外部图片 URL 创建本地图床记录。
- **upload_image** — 将用户消息中附带的图片上传到图床，返回访问链接。
- **update_image_record / delete_image_record** — 修改或删除本地图床记录。
- **rename_image_category** — 批量重命名图床分类。

### 工作流程规范
1. upload_image 需要用户在消息中附带图片（粘贴或拖拽），不能凭空上传。
2. 上传成功后返回图片的 URL 和 Markdown 引用格式，方便用户直接使用。
3. 如果用户问"我之前上传过什么图片"，用 query_images 查询。
4. 图床基于 Gitee，需要系统已配置好图床仓库信息。`,

  email: `## 邮件模块

### 核心能力
通过系统预设的 SMTP 配置发送邮件，内置通讯录管理，支持二次确认机制保障发送安全。

### 可用工具
- **query_contacts(keyword?)** — 查询通讯录。按关键词匹配简称、邮箱或备注，不传 keyword 则返回全部联系人。
- **send_email(subject, content, recipient?)** — 准备一封邮件，调用后系统生成确认卡片等待用户手动确认，**不会立即发送**。

### 标准工作流

**场景一：通过简称找人发邮件**
1. 先调用 query_contacts 搜索用户提到的名字
2. 匹配到唯一联系人 → 用其邮箱调用 send_email
3. 匹配到多个 → 列出让用户选择，再发送
4. 未匹配到 → 告知用户通讯录中无此联系人，可直接提供邮箱或去设置中添加

**场景二：用户直接提供邮箱**
- 无需查通讯录，直接用提供的邮箱调用 send_email

**场景三：发给默认收件人**
- 不传 recipient，系统使用设置中配置的默认收件人

### 内容规范
- subject：简洁明确，不超过 50 字
- content：支持 HTML（<h2>、<p>、<ul>/<li>、<strong>、<br> 等），建议适当排版，正式场合使用敬语
- 如果用户没指定内容细节，根据上下文合理补全，调用前需告知用户正文大纲

### 边界处理
- 邮箱未配置 → 告知用户去「Agent 设置 → 邮件与通讯录」完成 SMTP 配置
- 通讯录为空 → 提示用户在 Agent 设置的通讯录区域添加联系人
- 确认卡片弹出后，等待用户操作，不要重复调用 send_email`,

  latex: `## LaTeX 模块

### 核心能力
查询、读取和编辑 LaTeX 托管文件和模板（由 Agent 权限中心控制读/建/改权限）。

### 可用工具
- **query_latex_file_categories** — 查询 LaTeX 文件分类列表（含唯一 ID）。操作文件前**必须**先调用。
- **create_latex_file_category** — 创建新的文件分类（提供名称，自动生成 ID）。
- **query_latex_files** — 查询 LaTeX 文件列表，可按分类 ID 筛选。需要「LaTeX」读取权限。返回结果中 writable 字段表示是否有编辑权限。
- **read_latex_file** — 读取某个 LaTeX 文件的内容（需「LaTeX」读取权限）。返回 result 中 writable 字段表示是否有编辑权限。
- **edit_latex_file** — 修改 LaTeX 文件内容（需「LaTeX」修改权限）。
- **query_latex_template_categories** — 查询模板分类列表（含唯一 ID）。
- **create_latex_template_category** — 创建新的模板分类。
- **query_latex_templates** — 查询模板列表，可按分类筛选。
- **read_latex_template** — 读取模板的完整内容（通过模板 ID）。
- **create_latex_template** — 创建新模板（提供名称、分类、完整 .tex 源码）。
- **edit_latex_template** — 修改已有模板的名称、描述、分类或内容。

### 权限说明
- 文件读取由「LaTeX」读取权限控制。
- 文件/模板编辑由「LaTeX」修改权限控制。
- 模板创建由「LaTeX」创建权限控制。

### 工作流程规范
1. 需要在 Agent 权限中心开启 LaTeX 对应权限后才能操作。未授权会返回错误，请提示用户去权限中心开启。
2. **分类必须用 ID**：查询分类获取 id 列表后，在查询/创建文件时用 categoryId 参数指定。不要用分类名称代替 ID。
3. 如果用户指定的分类不存在，先 create_latex_file_category 或 create_latex_template_category 创建。
4. 操作流程：先 query_latex_file_categories → query_latex_files → read_latex_file / edit_latex_file。
5. 编辑文件时需提供完整的文件内容，不能只传部分内容。`,

  'question-bank': `## 题库模块

### 核心能力
管理题库、解题方法和多级分类。题目由题面、多个解答、概述、难度、标签、备注和关联解题方法组成，内容均支持 Markdown/LaTeX。

### 可用工具
- **query_question_categories** — 查询题库或解题方法分类，创建题目/方法前先调用获取 categoryId。
- **create_question_category** — 创建题库或解题方法分类，可在 parentId 下创建子分类。
- **query_questions** — 查询题目，支持分类、关键词、标签过滤；includeContent=true 返回完整题面和解答。
- **create_question** — 创建题目，必须指定已有分类，solutions 支持多个解答。
- **update_question / delete_question** — 修改或删除题目，会进入确认和快照回退流程。
- **query_solution_methods / create_solution_method / update_solution_method** — 查询、创建、修改解题方法。

### 工作流程规范
1. 创建题目或方法前必须先 query_question_categories，使用返回的 categoryId，不要猜测分类。
2. 标签可以多个，用数组或分号分隔；难度系数控制在 0 到 1，一位小数。
3. 修改/删除前先 query_questions 或 query_solution_methods 确认 id。
4. 如果用户要求“整理成题库”，保留原题关键信息，不要自行补不存在的条件。`,

  canvas: `## 画布模块

### 核心能力
管理 Excalidraw 画布库的分类和画布元数据，可创建空白画布、重命名、改分类和删除。

### 可用工具
- **query_canvas_categories** — 查询画布分类和数量。
- **create_canvas_category** — 创建画布分类，可指定图标和颜色。
- **query_canvases** — 查询画布元数据，不返回完整绘图内容。
- **create_canvas** — 创建空白画布，必须指定已有分类。
- **update_canvas_meta / delete_canvas** — 修改画布名称/分类或删除画布，会进入确认和快照回退流程。

### 工作流程规范
1. 创建画布前先 query_canvas_categories，分类不存在则先 create_canvas_category。
2. 画布工具只管理画布库结构，不直接编辑 Excalidraw 元素内容。
3. 修改/删除前先 query_canvases 确认 id。`,

  git: `## Git 管理模块

### 核心能力
查询本地 Git 管理中心登记的仓库、查看状态/日志/diff，并执行仓库、分支、暂存区、提交、远程同步和 stash 操作。

### 可用工具
- **git_add_repository / git_remove_repository** — 添加或移除 Git 管理中心仓库记录。
- **query_git_repositories** — 查询已登记仓库，refresh=true 可同步状态。
- **query_git_status** — 查询仓库分支、远程、ahead/behind 和工作区文件。
- **query_git_diff** — 查看指定文件 diff。
- **query_git_branches / query_git_commit** — 查询分支和提交详情。
- **git_stage_files / git_unstage_files** — 暂存或取消暂存明确文件列表。
- **git_commit / git_fetch / git_pull / git_push** — 执行提交和远程同步操作。
- **git_checkout_branch / git_create_branch / git_delete_branch / git_merge_branch** — 分支切换、创建、删除、合并。
- **git_discard_file / git_stash** — 丢弃文件更改或管理 stash。

### 工作流程规范
1. 先 query_git_repositories 或 query_git_status 确认仓库、分支、远程和变更列表。
2. 暂存/提交/拉取/推送都属于修改操作，会进入用户确认流程；不要在用户只问状态时执行。
3. commit 前应确认已暂存文件和提交信息。pull 使用 ff-only，遇到冲突要提示用户手动处理。`,
};

const createAgentWelcomeMessage = (content?: string): AgentMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: content || '👋 你好！我是 **古月助手**，你的智能工作台助理。\n\n我可以帮你管理待办与日程、整理笔记、查询学习进度、记录刷题、收发邮件等。直接描述需求即可，也可以点击右侧输入框旁的 **作用域图标** 限定一个或多个模块。\n\n**目前支持的功能**：\n- 📋 **任务与日程**：创建/更新待办、管理重复事件\n- 📝 **笔记**：创建便签与 Markdown 文档\n- 🎯 **Skills**：管理提示词技能库\n- 🗂️ **数据中心**：查询云资源、OJ 提交记录、SSH/API 记录\n- 📚 **学习空间**：查询课程与学习分类\n- 💻 **LeetCode**：记录刷题提交\n- 📁 **文件管理/知识库**：查询文件归档、检索本地知识库\n- 📧 **邮件**：发送邮件通知\n\n有什么我可以帮你的吗？',
  timestamp: Date.now(),
});

const sanitizeAgentMessageForHistory = (message: AgentMessage): AgentMessage => {
  if (typeof message.content !== 'string') return message;
  const redactedContent = redactSensitiveText(message.content);
  return redactedContent === message.content ? message : { ...message, content: redactedContent };
};

const toSafeChatMessage = (message: AgentMessage): ChatMessage => ({
  id: message.id,
  role: message.role as 'user' | 'assistant',
  content: redactSensitiveText(message.content || ''),
  timestamp: message.timestamp,
  attachments: message.attachments,
});

/* ─── Agent System Prompt ─── */

const normalizeRouteCacheText = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);

const hashRouteCacheKey = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const loadRouteCacheEntries = (): AgentRouteCacheEntry[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_ROUTE_CACHE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((entry): entry is AgentRouteCacheEntry => (
      entry &&
      typeof entry.key === 'string' &&
      (entry.kind === 'initial' || entry.kind === 'supplemental') &&
      Array.isArray(entry.modules) &&
      typeof entry.useTools === 'boolean' &&
      typeof entry.confidence === 'number' &&
      typeof entry.routerSignature === 'string' &&
      typeof entry.updatedAt === 'number' &&
      now - entry.updatedAt <= AGENT_ROUTE_CACHE_TTL_MS
    ));
  } catch {
    return [];
  }
};

const saveRouteCacheEntries = (entries: AgentRouteCacheEntry[]) => {
  const now = Date.now();
  const next = entries
    .filter(entry => now - entry.updatedAt <= AGENT_ROUTE_CACHE_TTL_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, AGENT_ROUTE_CACHE_MAX_ENTRIES);
  localStorage.setItem(AGENT_ROUTE_CACHE_KEY, JSON.stringify(next));
};

const getRouteCacheEntry = (
  key: string,
  routerSignature: string,
): AgentRouteCacheEntry | null => {
  const entries = loadRouteCacheEntries();
  const found = entries.find(entry => entry.key === key && entry.routerSignature === routerSignature);
  if (!found) {
    saveRouteCacheEntries(entries);
    return null;
  }
  const updated = {
    ...found,
    hitCount: found.hitCount + 1,
    updatedAt: Date.now(),
  };
  saveRouteCacheEntries(entries.map(entry => entry.key === key ? updated : entry));
  return updated;
};

const setRouteCacheEntry = (entry: Omit<AgentRouteCacheEntry, 'createdAt' | 'updatedAt' | 'hitCount'>) => {
  const entries = loadRouteCacheEntries();
  const existing = entries.find(item => item.key === entry.key && item.routerSignature === entry.routerSignature);
  const now = Date.now();
  const nextEntry: AgentRouteCacheEntry = {
    ...entry,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    hitCount: existing?.hitCount || 0,
  };
  saveRouteCacheEntries([
    nextEntry,
    ...entries.filter(item => !(item.key === entry.key && item.routerSignature === entry.routerSignature)),
  ]);
};

const makeInitialRouteCacheKey = (input: string, routingConfig: ChatConfig) =>
  `initial:${hashRouteCacheKey(`${getRouterSignature(routingConfig)}|${normalizeRouteCacheText(input)}`)}`;

const makeSupplementalRouteCacheKey = (input: {
  goal: string;
  currentModules: string[];
  finalText: string;
  evaluationMessage: string;
  failedTools: string[];
}, routingConfig: ChatConfig) =>
  `supplemental:${hashRouteCacheKey([
    getRouterSignature(routingConfig),
    normalizeRouteCacheText(input.goal),
    input.currentModules.slice().sort().join(','),
    normalizeRouteCacheText(input.evaluationMessage),
    normalizeRouteCacheText(input.finalText).slice(0, 500),
    input.failedTools.slice().sort().join(','),
  ].join('|'))}`;

const shouldCacheRouteResult = (routeResult: AgentRouteResult) =>
  routeResult.source === 'llm' &&
  routeResult.confidence >= AGENT_ROUTE_CACHE_MIN_CONFIDENCE &&
  (!routeResult.useTools || routeResult.modules.length > 0);

const getActiveModuleScope = (options: Pick<AgentPromptOptions, 'selectedModule' | 'selectedModules' | 'routedModule' | 'routedModules'>): string[] => {
  const routedScope = normalizeModuleScope([
    ...(options.routedModules || []),
    options.routedModule,
  ]);
  if (routedScope.length > 0) return routedScope;
  return normalizeModuleScope([
    ...(options.selectedModules || []),
    options.selectedModule,
  ]);
};

const buildModulePromptSection = (moduleIds: string[], modulePrompts?: Record<string, string>) => {
  if (moduleIds.length === 0) return '';
  return moduleIds
    .map(moduleId => {
      const module = getModuleById(moduleId);
      const prompt = modulePrompts?.[moduleId]?.trim();
      if (!prompt) return '';
      return `\n\n## 【${module?.name || moduleId}】模块专属指令\n${prompt}`;
    })
    .filter(Boolean)
    .join('');
};

const buildModuleRouterPrompt = (input: string, modules: AgentModule[] = getEnabledAgentModules()) => {
  const moduleList = modules
    .map(module => `- ${module.id}: ${module.name}，${module.description}`)
    .join('\n');
  return [
    '你是 Guyue Master Agent 的作用域路由器。你的任务是根据用户请求选择需要开放给 Agent 的应用模块。',
    '只返回 JSON，不要输出 Markdown，不要解释。',
    'JSON 格式：{"modules":["todo"],"useTools":true,"confidence":0.82,"reason":"一句话理由"}',
    '规则：',
    '1. modules 可以为空，也可以包含多个模块；跨模块任务必须返回多个模块。',
    '2. 如果用户只是闲聊、解释概念、问设计方案且无需调用应用数据，返回 {"modules":[],"useTools":false,...}。',
    '3. 如果不确定但可能需要应用能力，返回最可能的 1-3 个模块，不要为了保险返回全部模块。',
    '4. 只能从可用模块 ID 中选择。',
    '',
    '可用模块：',
    moduleList,
    '',
    `用户请求：${input}`,
  ].join('\n');
};

const buildSupplementalRouterPrompt = (input: {
  goal: string;
  currentModules: string[];
  finalText: string;
  toolCalls: ChatToolCall[];
  toolResults: Array<{ toolCall: ChatToolCall; result: any }>;
  evaluation: AgentCompletionEvaluation;
}, modules: AgentModule[] = getEnabledAgentModules()) => {
  const currentSet = new Set(input.currentModules);
  const moduleList = modules
    .filter(module => !currentSet.has(module.id))
    .map(module => `- ${module.id}: ${module.name}，${module.description}`)
    .join('\n') || '无';
  const compactResults = input.toolResults.slice(-8).map(item => ({
    tool: item.toolCall.name,
    success: item.result?.success !== false,
    message: item.result?.message || item.result?.error || item.result?.summary,
  }));

  return [
    '你是 Guyue Master Agent 的补充作用域路由器。',
    '当前 Agent 已执行一轮，但验收节点认为任务没有完成。你的任务是判断是否需要追加开放新的应用模块。',
    '只返回 JSON，不要输出 Markdown，不要解释。',
    'JSON 格式：{"addModules":["email"],"needContinue":true,"confidence":0.82,"reason":"一句话理由"}',
    '规则：',
    '1. addModules 只能选择尚未开放的模块，最多 3 个；不要返回当前已开放模块。',
    '2. 如果失败原因是权限未开启、用户信息不足、API 错误、模型回答质量问题，返回 {"addModules":[],"needContinue":false,...}。',
    '3. 如果任务缺少发送邮件、写待办、读文件、查询数据中心等跨模块能力，返回需要追加的模块。',
    '4. 不要为了保险返回全部模块，只返回真正能补齐任务的模块。',
    '',
    `当前已开放模块：${input.currentModules.length > 0 ? getModuleScopeLabel(input.currentModules) : '仅搜索 / 无应用模块'}`,
    '',
    '可追加模块：',
    moduleList,
    '',
    '执行上下文：',
    JSON.stringify({
      goal: input.goal,
      finalText: input.finalText,
      evaluation: input.evaluation,
      toolCalls: input.toolCalls.map(call => ({ name: call.name, arguments: call.arguments })),
      recentToolResults: compactResults,
    }).slice(0, 16000),
  ].join('\n');
};

const parseModuleRouterResponse = (text: string): AgentRouteResult => {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(jsonText);
  const modules = normalizeModuleScope(Array.isArray(parsed.modules) ? parsed.modules.map(String) : []);
  const useTools = parsed.useTools !== false;
  return {
    modules,
    source: useTools ? (modules.length > 0 ? 'llm' : 'search-only') : 'none',
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    reason: typeof parsed.reason === 'string' ? parsed.reason : 'LLM 路由完成',
    useTools,
  };
};

const parseSupplementalRouterResponse = (
  text: string,
  currentModules: string[],
): AgentSupplementalRouteResult => {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
  const parsed = JSON.parse(jsonText);
  const currentSet = new Set(currentModules);
  const addModules = normalizeModuleScope(Array.isArray(parsed.addModules) ? parsed.addModules.map(String) : [])
    .filter(moduleId => !currentSet.has(moduleId))
    .slice(0, 3);
  const needContinue = parsed.needContinue !== false && addModules.length > 0;
  return {
    addModules,
    needContinue,
    source: needContinue ? 'llm' : 'none',
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '补充路由完成',
  };
};

const getAgentSystemPrompt = ({
  selectedModule,
  selectedModules,
  routedModule,
  routedModules,
  promptMode = 'fallback',
  customSystemPrompt,
  modulePrompts,
  allowedActionTypes,
}: AgentPromptOptions = {}) => {
  const customPromptSection = customSystemPrompt?.trim()
    ? `\n\n## 用户自定义系统提示\n${customSystemPrompt.trim()}`
    : '';
  const permissionPrompt = allowedActionTypes
    ? `\n\n## 当前授权函数\n本轮只允许使用以下 action / tool：${allowedActionTypes.length ? allowedActionTypes.join('、') : '无'}。未列出的能力不要输出 action，也不要假装已经执行。`
    : '';

  const activeModuleIds = getActiveModuleScope({ selectedModule, selectedModules, routedModule, routedModules });
  const modulePrompt = buildModulePromptSection(activeModuleIds, modulePrompts);

  const moduleInfo = activeModuleIds.length > 0
    ? `\n\n## 当前任务作用域\n当前任务作用域为：${getModuleScopeLabel(activeModuleIds)}。你只能优先使用该作用域内被授权的工具；跨模块任务需要按模块顺序完成。${modulePrompt}`
    : '\n\n## 当前任务作用域\n当前没有手动限定作用域。系统会根据用户请求自动选择可用模块；如果没有合适工具，直接自然语言回复。';

  if (promptMode === 'native-tools') {
    // 原生工具模式：工具已按作用域和权限过滤后通过 tools 参数提供
    return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。

## 工具调用规则
1. 你已被提供了一组工具（function calling），请根据用户意图自行决定是否调用。
2. 工具分两类：**创建类**（create_*）和**查询类**（query_*）。如果任务需要先了解现有数据再操作，请先调用查询工具。
3. 如果没有合适工具，直接自然语言回复即可。
4. 不要输出 Markdown action 代码块，也不要伪造工具调用结果。
5. 如果工具执行返回了错误信息，请根据错误原因调整参数后重试，最多重试一次。
6. 你可以进行多轮工具调用。例如先 query_files 查询文件列表，再逐个 read_file 读取内容。不要在只完成第一步后就停止。
7. 当前作用域：${activeModuleIds.length > 0 ? getModuleScopeLabel(activeModuleIds) : '自动路由 / 未限定'}。不要请求未提供的工具，也不要声称调用了不可见工具。
8. 如果验收节点补充开放了新的模块工具，你会收到一条继续执行提示；以最新提示和当前可见工具为准，不要重复已经成功完成的创建、修改、删除操作。
9. 如果本轮工具列表包含 web_search 或 specialized_search，说明你已获得联网权限，可以检索网页、GitHub、npm、StackOverflow、arXiv 等信息；不要再声称无法访问互联网或 GitHub。

## 任务分解
- 如果用户的请求包含多个子任务（如「帮我创建三个待办」「查一下文件然后把内容总结发邮件」），你必须逐个完成每个子任务，依次调用对应的工具。
- 对于复杂任务（需要先查询再操作、需要多步骤），按逻辑顺序拆解执行，不要跳过中间步骤。

## 回复与总结规范
- **绝对不要**只回复「已帮你完成」「已处理完成」等笼统表述。
- 每次工具执行完成后，你的最终回复必须包含具体的执行结果摘要。
- 格式要求：
  - 如果创建了待办/笔记/资源等，列出创建的具体内容（标题、分类、关键字段）。
  - 如果查询了数据，展示查询到的关键结果。
  - 如果执行了多个操作，用编号列表逐一说明每步完成了什么。
  - 如果有失败的操作，明确说明失败原因。
- 示例（好的回复）：
  ✅「已创建 3 个待办事项：\n1. **买菜** — 优先级：高，截止：明天 18:00\n2. **写周报** — 优先级：中，截止：周五 23:59\n3. **预约牙医** — 优先级：低」
- 示例（差的回复）：
  ❌「已帮你完成这个任务。」

## 时间处理
- 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 今天: ${new Date().toISOString().split('T')[0]}（${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}）
- 明天: ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- 后天: ${new Date(Date.now() + 172800000).toISOString().split('T')[0]}
- 时间点事项使用 dueDate；如果用户说的是"下午 3 点到 5 点"这类时间段，必须改传 startDateTime 和 endDateTime。所有时间字段都必须换算为 ISO 8601 格式（YYYY-MM-DDTHH:mm），绝对不要传自然语言或时间戳。${modulePrompt}${permissionPrompt}${customPromptSection}`;
  }

  return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。${moduleInfo}

## 你的能力
你可以帮用户操作以下功能：
1. **待办事项** — 创建待办、查询已有待办内容
2. **便签笔记** — 创建短文本便签备忘
3. **Prompt 技能卡** — 创建可复用的提示词/技能模板
4. **Markdown 笔记** — 创建长文 Markdown 日记/笔记/文章
5. **OJ 做题记录** — 记录洛谷、AcWing、LeetCode 等平台的做题情况（从截图或描述中提取题号、平台、难度）
6. **资源管理** — 查询、创建、修改、删除云盘、AI资源、服务器、域名、订阅等资源记录
7. **SSH 管理** — 查询、创建、修改、删除 SSH 连接记录
8. **API 记录** — 查询、创建、修改、删除 API 接口记录，查询时不回显密钥明文
9. **LeetCode 题单** — 创建结构化题单（含分组和题目链接）；查询已有题单
10. **学习课程** — 在学习中心创建课程和分类；查询已有课程
11. **发送邮件** — 编辑邮件内容并发送（支持 HTML 正文）
12. **文件管理** — 按分类查询文件列表、读取文件内容（需用户授权文件分类）
13. **知识库** — 构建本地文件知识库并进行语义检索
14. **图床管理** — 查询已有图片（获取 URL / Markdown 链接），上传图片到图床指定分类
15. **LaTeX** — 查询、读取、编辑 LaTeX 托管文件和模板（需授权分类）

## 输出格式
当你确定用户想要执行某个操作时，请在回复末尾输出一个特殊的 JSON 块。支持以下 action type：

### 创建待办事项
\`\`\`action
{
  "type": "create_todo",
  "data": {
    "content": "事项内容",
    "description": "详细描述",
    "priority": "medium",
    "category": "未分类",
    "dueDate": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T23:59"
  }
}
\`\`\`
若是时间段事件，改为：
\`\`\`action
{
  "type": "create_todo",
  "data": {
    "content": "和产品开评审会",
    "category": "工作",
    "timeType": "range",
    "startDateTime": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T15:00",
    "endDateTime": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T17:00"
  }
}
\`\`\`

### 创建便签
\`\`\`action
{
  "type": "create_note",
  "data": {
    "content": "便签内容",
    "color": "bg-yellow-100"
  }
}
\`\`\`
color 可选：bg-yellow-100, bg-green-100, bg-blue-100, bg-pink-100, bg-purple-100, bg-orange-100

### 创建技能卡
\`\`\`action
{
  "type": "create_prompt",
  "data": {
    "title": "技能名称",
    "content": "提示词内容，支持 Markdown",
    "category": "分类",
    "description": "简短描述"
  }
}
\`\`\`

### 创建 Markdown 笔记
\`\`\`action
{
  "type": "create_markdown_note",
  "data": {
    "title": "笔记标题",
    "content": "# 标题\\n\\nMarkdown 正文...",
    "category": "分类"
  }
}
\`\`\`

### 创建 OJ 做题记录
\`\`\`action
{
  "type": "create_oj_submission",
  "data": {
    "siteName": "洛谷",
    "problemId": "P1001",
    "categoryId": "分类ID（从 query_oj_stats 获取）",
    "problemTitle": "A+B Problem",
    "date": "${new Date().toISOString().split('T')[0]}"
  }
}
\`\`\`
siteName 可选：洛谷、AcWing、LeetCode。categoryId 必须优先从 query_oj_stats 返回的站点 categories[].id 获取；不确定时可以省略，不要用分类名称冒充 ID。

### 创建资源记录
\`\`\`action
{
  "type": "create_resource",
  "data": {
    "name": "iCloud 200G",
    "categoryId": "分类ID（从 query_resources 获取）",
    "expireDate": "2027-03-14",
    "capacityUsed": 85,
    "capacityTotal": 200,
    "capacityUnit": "GB",
    "costAmount": 21,
    "costPeriod": "month",
    "autoRenewal": true,
    "note": "备注"
  }
}
\`\`\`
categoryId 必须优先从 query_resources 返回的 categories[].id 获取；不确定时可以省略，不要用分类名称冒充 ID。

### 创建 LeetCode 题单
\`\`\`action
{
  "type": "create_leetcode_list",
  "data": {
    "title": "题单标题",
    "description": "题单描述",
    "priority": 10,
    "groups": [
      {
        "name": "分组名称",
        "problems": [
          { "title": "70. 爬楼梯", "url": "https://leetcode.cn/problems/climbing-stairs/", "note": "" }
        ]
      }
    ]
  }
}
\`\`\`

### 创建学习课程
\`\`\`action
{
  "type": "create_learning_course",
  "data": {
    "title": "课程标题",
    "description": "课程简介",
    "categoryName": "分类名称（若不存在会自动创建）",
    "introMarkdown": "# 标题\\n\\n内容...",
    "icon": "BookOpen",
    "priority": 10
  }
}
\`\`\`
categoryName 填写你想归属的分类，若不存在会自动新建。icon 可选：BookOpen、Code2、GraduationCap、FlaskConical。

### 修改待办事项
\`\`\`action
{
  "type": "update_todo",
  "data": {
    "id": "待办的id",
    "content": "新内容",
    "priority": "high",
    "isCompleted": true
  }
}
\`\`\`

### 删除待办事项
\`\`\`action
{ "type": "delete_todo", "data": { "id": "待办的id" } }
\`\`\`
若暂时没有 id，也可以传 content 做精确定位：
\`\`\`action
{ "type": "delete_todo", "data": { "content": "和产品开评审会" } }
\`\`\`

### 查询子任务
\`\`\`action
{ "type": "query_subtasks", "data": { "todoId": "待办的id" } }
\`\`\`

### 创建子任务
\`\`\`action
{ "type": "create_subtask", "data": { "todoId": "待办的id", "content": "子任务内容" } }
\`\`\`

### 修改子任务
\`\`\`action
{ "type": "update_subtask", "data": { "todoId": "待办的id", "subtaskId": "子任务id", "content": "新内容", "isCompleted": true } }
\`\`\`

### 删除子任务
\`\`\`action
{ "type": "delete_subtask", "data": { "todoId": "待办的id", "subtaskId": "子任务id" } }
\`\`\`
子任务操作需要先通过 query_todos 获取待办 id，再通过 query_subtasks 获取子任务 id。

### 修改便签
\`\`\`action
{ "type": "update_note", "data": { "id": "便签id", "content": "新内容", "color": "bg-blue-100" } }
\`\`\`

### 删除便签
\`\`\`action
{ "type": "delete_note", "data": { "id": "便签id" } }
\`\`\`

### 修改资源
\`\`\`action
{ "type": "update_resource", "data": { "name": "资源名称", "newName": "新名称", "expireDate": "2027-01-01", "note": "备注" } }
\`\`\`

### 删除资源
\`\`\`action
{ "type": "delete_resource", "data": { "name": "资源名称" } }
\`\`\`

修改/删除操作需要先通过查询工具获取 id 或名称。修改资源按名称匹配。

### 发送邮件
\`\`\`action
{
  "type": "send_email",
  "data": {
    "subject": "邮件主题",
    "content": "<h1>标题</h1><p>正文内容，支持 HTML</p>",
    "recipient": "可选，不填则使用默认收件人"
  }
}
\`\`\`

### 查询文件列表
\`\`\`action
{
  "type": "query_files",
  "data": {
    "category": "分类名称（可选）",
    "keyword": "搜索关键词（可选）",
    "limit": 20
  }
}
\`\`\`

### 读取文件内容
\`\`\`action
{
  "type": "read_file",
  "data": {
    "id": "文件的id（从 query_files 获取）"
  }
}
\`\`\`
文件操作仅限于用户已授权的文件分类范围内。需要先 query_files 获取文件 id，再 read_file 读取内容。

### 查询图床图片
\`\`\`action
{
  "type": "query_images",
  "data": {
    "keyword": "搜索关键词（可选）",
    "category": "分类名称（可选）",
    "limit": 20
  }
}
\`\`\`

### 上传图片到图床
\`\`\`action
{
  "type": "upload_image",
  "data": {
    "name": "图片显示名称（可选）",
    "category": "图床分类（可选，默认未分类）",
    "attachmentIndex": 0
  }
}
\`\`\`
上传图片时，用户必须在消息中附带图片附件。attachmentIndex 指定上传第几个图片（从 0 开始）。

## 时间处理
- 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 今天: ${new Date().toISOString().split('T')[0]}（${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}）
- 明天: ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- 后天: ${new Date(Date.now() + 172800000).toISOString().split('T')[0]}
- 时间点事项使用 dueDate；时间段事项使用 startDateTime / endDateTime。所有时间字段都必须换算为 ISO 8601 格式（YYYY-MM-DDTHH:mm）。用户没指定具体时间时，单点事项默认 23:59。绝对不要传自然语言或时间戳。

## 交互原则
1. 如果用户的意图不明确，先询问澄清。
2. 如果用户的请求包含多个子任务（如「帮我创建三个待办」「查一下文件然后总结发邮件」），你应该逐个输出对应的 action 块，每个占一个 \`\`\`action\`\`\` 块。
3. 对于复杂任务（需要先查询再操作），按逻辑顺序拆解执行，不要跳过中间步骤。
4. **绝对不要**只回复「已帮你完成」「已处理完成」等笼统表述。完成后必须具体列出做了什么：创建了什么内容、标题是什么、关键字段是什么。多项操作用编号列表逐一说明。
5. 如果用户只是闲聊，正常回复即可，不要输出 action 块。
6. 保持回复简洁友好。${permissionPrompt}${customPromptSection}`;
};

/* ─── Action 解析器 ─── */

const SUPPORTED_ACTION_TYPES = new Set(['create_todo', 'create_note', 'create_prompt', 'create_markdown_note', 'create_oj_submission', 'create_resource', 'create_leetcode_list', 'create_learning_course', 'update_todo', 'delete_todo', 'update_note', 'delete_note', 'update_resource', 'delete_resource', 'send_email', 'query_files', 'read_file', 'query_images', 'upload_image', 'query_subtasks', 'create_subtask', 'update_subtask', 'delete_subtask']);

const parseAgentAction = (content: string): AgentAction | null => {
  const actionMatch = content.match(/```action\s*([\s\S]*?)\s*```/);
  if (!actionMatch) return null;

  try {
    const actionData = JSON.parse(actionMatch[1]);
    if (SUPPORTED_ACTION_TYPES.has(actionData.type) && actionData.data) {
      return {
        type: actionData.type,
        status: 'pending',
        data: actionData.data,
      };
    }
  } catch (e) {
    console.error('Failed to parse agent action:', e);
  }
  return null;
};

const removeActionBlock = (content: string): string => {
  return content.replace(/```action\s*[\s\S]*?\s*```/g, '').trim();
};

/* ─── 本地意图解析（备用） ─── */

function parseIntentLocally(input: string): { isCreateTodo: boolean; data?: Partial<TodoItem>; suggestedModule?: string } {
  const lowerInput = input.toLowerCase();
  
  // 检测创建意图的关键词
  const createKeywords = ['新建', '创建', '添加', '加一个', '帮我记', '安排', '提醒我', '待办', '任务', '事项', '日程'];
  const hasCreateIntent = createKeywords.some(kw => lowerInput.includes(kw));
  
  if (!hasCreateIntent) {
    return { isCreateTodo: false };
  }

  // 提取内容（简单规则）
  let content = input
    .replace(/新建|创建|添加|加一个|帮我记|安排|提醒我|一个|待办|任务|事项|日程/g, '')
    .trim();
  
  // 解析优先级
  let priority: 'high' | 'medium' | 'low' = 'medium';
  if (/重要|紧急|高优先级/.test(lowerInput)) {
    priority = 'high';
    content = content.replace(/重要|紧急|高优先级/g, '').trim();
  } else if (/低优先级|不急/.test(lowerInput)) {
    priority = 'low';
    content = content.replace(/低优先级|不急/g, '').trim();
  }

  // 解析日期
  let dueDate: number | undefined;
  let timeStart: number | undefined;
  let timeEnd: number | undefined;
  let timeType: TodoItem['timeType'] | undefined;
  const now = new Date();

  let baseDate: Date | null = null;
  if (/今天/.test(lowerInput)) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    baseDate = d;
    dueDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    content = content.replace(/今天/g, '').trim();
  } else if (/明天/.test(lowerInput)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    baseDate = d;
    dueDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    content = content.replace(/明天/g, '').trim();
  } else if (/后天/.test(lowerInput)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(0, 0, 0, 0);
    baseDate = d;
    dueDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    content = content.replace(/后天/g, '').trim();
  }

  const parseHourMinute = (modifier: string | undefined, hourRaw: string, minuteRaw?: string) => {
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw || '0');
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    const mod = modifier || '';
    if (/下午|晚上/.test(mod) && hour < 12) hour += 12;
    if (/中午/.test(mod) && hour < 11) hour += 12;
    if (/凌晨/.test(mod) && hour === 12) hour = 0;
    return { hour, minute };
  };

  if (baseDate) {
    const rangeMatch = input.match(/(今天|明天|后天)?\s*(上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})(?::|点|时)(\d{1,2})?\s*(?:到|至|\-|—|~|～)\s*(上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})(?::|点|时)(\d{1,2})?/);
    if (rangeMatch) {
      const start = parseHourMinute(rangeMatch[2], rangeMatch[3], rangeMatch[4]);
      const end = parseHourMinute(rangeMatch[5], rangeMatch[6], rangeMatch[7]);
      if (start && end) {
        timeStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), start.hour, start.minute, 0, 0).getTime();
        timeEnd = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), end.hour, end.minute, 0, 0).getTime();
        if (timeEnd <= timeStart) timeEnd += 24 * 60 * 60 * 1000;
        timeType = 'range';
      }
    } else {
      const pointMatch = input.match(/(今天|明天|后天)?\s*(上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})(?::|点|时)(\d{1,2})?/);
      if (pointMatch) {
        const point = parseHourMinute(pointMatch[2], pointMatch[3], pointMatch[4]);
        if (point) {
          dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), point.hour, point.minute, 0, 0).getTime();
          timeType = 'point';
        }
      }
    }
  }

  // 清理多余空格
  content = content.replace(/\s+/g, ' ').trim();

  if (!content) {
    return { isCreateTodo: false };
  }

  return {
    isCreateTodo: true,
    suggestedModule: 'todo',
    data: {
      content,
      priority,
      dueDate,
      timeType,
      timeStart,
      timeEnd,
      category: '未分类',
    }
  };
}

/* ─── 组件 ─── */

export const AgentPanel: React.FC<AgentPanelProps> = ({
  onOpenSettings,
  isOpen,
  onClose,
  todos,
  notes,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onCreatePrompt,
  onCreateMarkdownNote,
  onCreateOJSubmission,
  onUpdateOJHeatmapData,
  ojHeatmapData,
  onCreateResource,
  onUpdateResource,
  onDeleteResource,
  resourceData,
  sshRecords,
  sshCategories,
  onSaveSSH,
  onDeleteSSH,
  apiRecords,
  apiCategories,
  onSaveAPI,
  onDeleteAPI,
  fileRecords,
  fileCategories,
  recurringEvents,
  recurringCategories,
  onCreateRecurring,
  onUpdateRecurring,
  onDeleteRecurring,
  onUpdateRecurringCategories,
  todoCategories,
  promptCategories,
  markdownCategories,
  onAddCategory,
  knowledgeBaseFileIds = new Set<string>(),
  compact = false,
  onRuntimeStatusChange,
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = loadAgentHistory<AgentMessage>().map(sanitizeAgentMessageForHistory);
    if (saved.length === 0) {
      return [createAgentWelcomeMessage()];
    }
    return saved;
  });
  const initialPageState = useMemo(() => loadAgentPageState(), []);
  const [registryVersion, setRegistryVersion] = useState(0);
  const agentModules = useMemo(() => getAgentModules(), [registryVersion]);
  const enabledAgentModules = useMemo(() => getEnabledAgentModules(), [registryVersion]);
  const toolRegistry = useMemo(() => getToolRegistry(), [registryVersion]);
  const permissionModules = useMemo(() => getAgentPermissionModules(), [registryVersion]);
  const [inputValue, setInputValue] = useState(() => initialPageState.inputDraft);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPluginDocs, setShowPluginDocs] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [config, setConfig] = useState<ChatConfig>(() => loadAgentConfig());
  const [routerConfig, setRouterConfig] = useState<ChatConfig>(() => loadAgentRouterConfig());
  const [searchConfig, setSearchConfig] = useState<AgentSearchConfig>(() => loadAgentSearchConfig());
  const [modulePrompts, setModulePrompts] = useState<Record<string, string>>(() => loadStoredModulePrompts(DEFAULT_MODULE_PROMPTS));
  const [selectedModules, setSelectedModules] = useState<string[]>(() => initialPageState.selectedModules);
  const [storedAgentPermissions] = useState(() => loadAgentPermissions());
  const [toolPermissions, setToolPermissions] = useState<AgentToolPermissions>(() => storedAgentPermissions.tools || DEFAULT_AGENT_TOOL_PERMISSIONS);
  const [fullAccessPermissions, setFullAccessPermissions] = useState<AgentFullAccessPermissions>(() => storedAgentPermissions.fullAccess || DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS);
  const [showPermissions, setShowPermissions] = useState(false);
  const effectiveDataPermissions = useMemo<DataPermissions>(
    () => deriveDataPermissionsFromToolPermissions(toolPermissions),
    [toolPermissions],
  );
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [emailConfig, setEmailConfig] = useState<AgentEmailConfig>(() => {
    try { const s = localStorage.getItem(AGENT_EMAIL_CONFIG_KEY); return s ? JSON.parse(s) : DEFAULT_AGENT_EMAIL_CONFIG; } catch { return DEFAULT_AGENT_EMAIL_CONFIG; }
  });
  const [emailTestStatus, setEmailTestStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [emailTestError, setEmailTestError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());
  const [isModuleCollapsed, setIsModuleCollapsed] = useState(false);
  const [isDebugCollapsed, setIsDebugCollapsed] = useState(() => initialPageState.isDebugCollapsed);
  const [isExecutionVizCollapsed, setIsExecutionVizCollapsed] = useState(() => initialPageState.isExecutionVizCollapsed);
  const [expandedDebugIds, setExpandedDebugIds] = useState<Set<string>>(new Set());
  const [debugItems, setDebugItems] = useState<AgentDebugItem[]>([]);
  const [agentRuntimeEvents, setAgentRuntimeEvents] = useState<AgentTraceEvent[]>([]);
  const [agentRuntimeToolEvents, setAgentRuntimeToolEvents] = useState<AgentRuntimeToolVisualEvent[]>([]);
  const [agentRuntimeStatus, setAgentRuntimeStatus] = useState<AgentRuntimeStatusState>({
    stage: 'idle',
    status: 'idle',
    title: 'Agent 空闲',
    active: false,
  });

  useEffect(() => {
    onRuntimeStatusChange?.({ ...agentRuntimeStatus, isProcessing });
  }, [agentRuntimeStatus, isProcessing, onRuntimeStatusChange]);

  const [enableWebSearch, setEnableWebSearch] = useState(() => initialPageState.enableWebSearch);
  const webSearchPermissionEnabled = Boolean(toolPermissions.web?.read);
  const effectiveWebSearchEnabled = enableWebSearch && webSearchPermissionEnabled;

  useEffect(() => {
    const bumpRegistryVersion = () => setRegistryVersion(version => version + 1);
    window.addEventListener(AGENT_TOOL_REGISTRY_CHANGED_EVENT, bumpRegistryVersion);
    window.addEventListener(AGENT_MODULE_REGISTRY_CHANGED_EVENT, bumpRegistryVersion);
    return () => {
      window.removeEventListener(AGENT_TOOL_REGISTRY_CHANGED_EVENT, bumpRegistryVersion);
      window.removeEventListener(AGENT_MODULE_REGISTRY_CHANGED_EVENT, bumpRegistryVersion);
    };
  }, []);

  useEffect(() => {
    const defaultPermissions = createAgentToolPermissions(false);
    setToolPermissions(prev => {
      const next = { ...defaultPermissions, ...prev };
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
    setFullAccessPermissions(prev => {
      const next = { ...defaultPermissions, ...prev };
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [permissionModules]);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollMessagesRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatServiceRef = useRef<ChatService | null>(null);
  const supportsNativeTools = useMemo(() => isStepwiseNativeProvider(config.provider), [config.provider]);
  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const toolPermissionCapabilities = useMemo(
    () => getToolPermissionCapabilities(toolRegistry, enabledAgentModules),
    [enabledAgentModules, toolRegistry],
  );
  const isSupportedToolPermission = useCallback(
    (moduleId: string, action: AgentCrudAction) => Boolean(toolPermissionCapabilities[moduleId]?.[action]),
    [toolPermissionCapabilities],
  );
  const enabledToolPermissionCount = useMemo(
    () => permissionModules.reduce((total, module) => (
      total + AGENT_CRUD_ACTIONS.reduce((sum, action) => (
        sum + (isSupportedToolPermission(module.key, action.key) && toolPermissions[module.key]?.[action.key] ? 1 : 0)
      ), 0)
    ), 0),
    [isSupportedToolPermission, permissionModules, toolPermissions],
  );
  const allToolPermissionsEnabled = useMemo(
    () => permissionModules.every(module =>
      AGENT_CRUD_ACTIONS.every(action =>
        !isSupportedToolPermission(module.key, action.key) ||
        Boolean(toolPermissions[module.key]?.[action.key]),
      ),
    ),
    [isSupportedToolPermission, permissionModules, toolPermissions],
  );
  const fullAccessPermissionCount = useMemo(
    () => permissionModules.reduce((total, module) => (
      total + (['update', 'delete'] as AgentCrudAction[]).reduce((sum, action) => (
        sum + (
          isSupportedToolPermission(module.key, action) &&
          toolPermissions[module.key]?.[action] &&
          fullAccessPermissions[module.key]?.[action]
            ? 1
            : 0
        )
      ), 0)
    ), 0),
    [fullAccessPermissions, isSupportedToolPermission, permissionModules, toolPermissions],
  );
  const allowedActionTypes = useMemo(
    () => {
      const names = toolRegistry
      .filter(registration => canUseToolRegistration(registration, toolPermissions))
      .map(registration => registration.name);
      if (effectiveWebSearchEnabled) {
        names.push('web_search');
        if ((searchConfig.specialized?.enabledSources?.length || 0) > 0) {
          names.push(SPECIALIZED_SEARCH_TOOL.name);
        }
      }
      return names;
    },
    [effectiveWebSearchEnabled, searchConfig.specialized?.enabledSources?.length, toolPermissions, toolRegistry],
  );
  const effectiveFilePermissions = useMemo(
    () => (toolPermissions.files?.read || toolPermissions.files?.update) ? ['全部'] : [],
    [toolPermissions],
  );
  const effectiveLatexFileReadPermissions = useMemo(
    () => toolPermissions.latex?.read ? ['__all__'] : [],
    [toolPermissions],
  );
  const effectiveLatexFileWritePermissions = useMemo(
    () => toolPermissions.latex?.update ? ['__all__'] : [],
    [toolPermissions],
  );
  const effectiveLatexTemplatePermissions = useMemo(
    () => (toolPermissions.latex?.read || toolPermissions.latex?.create || toolPermissions.latex?.update) ? ['__all__'] : [],
    [toolPermissions],
  );

  const turnStepRef = useRef(0);
  const turnStartTimeRef = useRef(0);
  const turnIndexRef = useRef(-1);
  const turnIdRef = useRef('');

  const resetTurnDebug = useCallback(() => {
    turnStepRef.current = 0;
    turnStartTimeRef.current = Date.now();
    turnIndexRef.current += 1;
    turnIdRef.current = crypto.randomUUID();
  }, []);

  const pushDebugItem = useCallback((item: Omit<AgentDebugItem, 'id' | 'timestamp'>) => {
    turnStepRef.current += 1;
    const elapsed = turnStartTimeRef.current ? Date.now() - turnStartTimeRef.current : 0;
    const displayStage = STAGE_DISPLAY[item.stage] || item.stage;
    const currentTurnId = turnIdRef.current || crypto.randomUUID();
    const currentTurnIndex = Math.max(0, turnIndexRef.current);
    setDebugItems(prev => {
      const next: AgentDebugItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...item,
        stage: `#${turnStepRef.current} ${displayStage}`,
        summary: elapsed > 0 ? `${item.summary} (+${elapsed}ms)` : item.summary,
        turnId: currentTurnId,
        turnIndex: currentTurnIndex,
      };
      return [...prev, next].slice(-MAX_DEBUG_ITEMS);
    });
  }, []);

  const pushServiceDebugEvent = useCallback((event: ChatDebugEvent) => {
    pushDebugItem({
      stage: event.stage,
      summary: event.detail || `${event.provider} 调用`,
      payload: {
        endpoint: event.endpoint,
        request: event.request,
        response: event.response,
      },
      level: event.stage.includes('error') ? 'error' : 'info',
    });
  }, [pushDebugItem]);

  const handleSaveEmailConfig = useCallback(() => {
    localStorage.setItem(AGENT_EMAIL_CONFIG_KEY, JSON.stringify(emailConfig));
    setEmailTestStatus('idle');
    setEmailTestError('');
    pushDebugItem({
      stage: 'settings:email',
      summary: '已保存 Agent 邮件配置',
      payload: { smtpHost: emailConfig.smtp.host, recipient: emailConfig.recipient },
      level: 'success',
    });
  }, [emailConfig, pushDebugItem]);

  const handleTestEmail = useCallback(async () => {
    setEmailTestStatus('loading');
    setEmailTestError('');
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.testEmailConfig) throw new Error('邮件测试接口不可用。');
      const result = await electronAPI.testEmailConfig(emailConfig);
      if (!result?.success) throw new Error(result?.error || '邮件测试失败。');
      setEmailTestStatus('success');
    } catch (error) {
      setEmailTestStatus('error');
      setEmailTestError(error instanceof Error ? error.message : String(error));
    }
  }, [emailConfig]);

  const handleSaveContact = useCallback((contact: Contact) => {
    const normalized: Contact = {
      ...contact,
      id: contact.id || crypto.randomUUID(),
      nickname: contact.nickname.trim(),
      email: contact.email.trim(),
      note: contact.note?.trim() || '',
    };
    setContacts(prev => {
      const exists = prev.some(item => item.id === normalized.id);
      const next = exists
        ? prev.map(item => item.id === normalized.id ? normalized : item)
        : [normalized, ...prev];
      saveContacts(next);
      return next;
    });
  }, []);

  const handleDeleteContact = useCallback((id: string) => {
    setContacts(prev => {
      const next = prev.filter(item => item.id !== id);
      saveContacts(next);
      return next;
    });
  }, []);

  const handleModuleClick = (moduleId: string) => {
    const module = getModuleById(moduleId);
    if (!module?.enabled) return;
    setSelectedModules(current =>
      current.includes(moduleId)
        ? current.filter(id => id !== moduleId)
        : [...current, moduleId],
    );
  };

  const setAllToolPermissions = useCallback((enabled: boolean) => {
    setToolPermissions(
      permissionModules.reduce((acc, module) => {
        acc[module.key] = {
          read: isSupportedToolPermission(module.key, 'read') ? enabled : false,
          create: isSupportedToolPermission(module.key, 'create') ? enabled : false,
          update: isSupportedToolPermission(module.key, 'update') ? enabled : false,
          delete: isSupportedToolPermission(module.key, 'delete') ? enabled : false,
        };
        return acc;
      }, {} as AgentToolPermissions),
    );
    if (!enabled) {
      setFullAccessPermissions(createAgentToolPermissions(false));
    }
  }, [isSupportedToolPermission, permissionModules]);

  const toggleToolPermission = useCallback((moduleKey: string, actionKey: AgentCrudAction) => {
    if (!isSupportedToolPermission(moduleKey, actionKey)) return;
    setToolPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...(prev[moduleKey] || DEFAULT_AGENT_TOOL_PERMISSIONS[moduleKey]),
        [actionKey]: !prev[moduleKey]?.[actionKey],
      },
    }));
    if (actionKey === 'update' || actionKey === 'delete') {
      setFullAccessPermissions(prev => ({
        ...prev,
        [moduleKey]: {
          ...(prev[moduleKey] || DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS[moduleKey]),
          [actionKey]: false,
        },
      }));
    }
  }, [isSupportedToolPermission]);

  const toggleFullAccessPermission = useCallback((moduleKey: string, actionKey: AgentCrudAction) => {
    if (!['update', 'delete'].includes(actionKey)) return;
    if (!isSupportedToolPermission(moduleKey, actionKey) || !toolPermissions[moduleKey]?.[actionKey]) return;
    setFullAccessPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...(prev[moduleKey] || DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS[moduleKey]),
        [actionKey]: !prev[moduleKey]?.[actionKey],
      },
    }));
  }, [isSupportedToolPermission, toolPermissions]);

  const isFallbackActionAllowed = useCallback((actionType: string) => {
    const registration = findToolRegistration(toolRegistry, actionType);
    return registration ? canUseToolRegistration(registration, toolPermissions) : true;
  }, [toolPermissions, toolRegistry]);

  const buildToolExecContext = useCallback((currentAttachments?: ChatAttachment[]): ToolExecutionContext => ({
    todos: [...todos],
    notes,
    dataPermissions: effectiveDataPermissions,
    filePermissions: effectiveFilePermissions,
    fileRecords,
    lastUserAttachments: currentAttachments,
    onCreateTodo,
    onUpdateTodo,
    onDeleteTodo,
    onCreateNote,
    onUpdateNote,
    onDeleteNote,
    onCreatePrompt,
    onCreateMarkdownNote,
    onCreateOJSubmission,
    onUpdateOJHeatmapData,
    ojHeatmapData,
    onCreateResource,
    onUpdateResource,
    onDeleteResource,
    resourceData,
    sshRecords: [...sshRecords],
    sshCategories,
    onSaveSSH,
    onDeleteSSH,
    apiRecords: [...apiRecords],
    apiCategories,
    onSaveAPI,
    onDeleteAPI,
    recurringEvents,
    recurringCategories,
    onCreateRecurring,
    onUpdateRecurring,
    onDeleteRecurring,
    onUpdateRecurringCategories,
    todoCategories,
    promptCategories,
    markdownCategories,
    onAddCategory,
    knowledgeBaseFileIds,
    latexFileReadPermissions: effectiveLatexFileReadPermissions,
    latexFileWritePermissions: effectiveLatexFileWritePermissions,
    latexTemplatePermissions: effectiveLatexTemplatePermissions,
    onAutoAuthLatexFileCategory: () => undefined,
    onAutoAuthLatexTemplateCategory: () => undefined,
    executeWebSearch: async (args: Record<string, any>) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.agentWebSearch) return { success: false, error: '联网搜索功能不可用（非桌面端）。' };
      return electronAPI.agentWebSearch({
        ...searchConfig,
        ...args,
        provider: args.provider || searchConfig.provider,
        fallbackProviders: Array.isArray(args.fallbackProviders) ? args.fallbackProviders : searchConfig.fallbackProviders,
      });
    },
    executeSpecializedSearch: async (args: Record<string, any>) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.agentWebSearch) return { success: false, error: '联网搜索功能不可用（非桌面端）。' };
      const source = typeof args.source === 'string' ? args.source : '';
      const domainMap: Record<string, string[]> = {
        github: ['github.com'],
        npm: ['npmjs.com', 'registry.npmjs.org'],
        stackoverflow: ['stackoverflow.com', 'stackexchange.com'],
        arxiv: ['arxiv.org'],
      };
      return electronAPI.agentWebSearch({
        ...searchConfig,
        ...args,
        provider: args.provider || searchConfig.provider,
        fallbackProviders: Array.isArray(args.fallbackProviders) ? args.fallbackProviders : searchConfig.fallbackProviders,
        searchMode: args.searchMode || 'deep',
        includeDomains: domainMap[source] || args.includeDomains,
      });
    },
  }), [
    apiCategories,
    apiRecords,
    effectiveDataPermissions,
    effectiveFilePermissions,
    effectiveLatexFileReadPermissions,
    effectiveLatexFileWritePermissions,
    effectiveLatexTemplatePermissions,
    fileRecords,
    knowledgeBaseFileIds,
    markdownCategories,
    notes,
    ojHeatmapData,
    onAddCategory,
    onCreateMarkdownNote,
    onCreateNote,
    onCreateOJSubmission,
    onUpdateOJHeatmapData,
    onCreatePrompt,
    onCreateRecurring,
    onCreateResource,
    onCreateTodo,
    onDeleteAPI,
    onDeleteNote,
    onDeleteRecurring,
    onDeleteResource,
    onDeleteSSH,
    onDeleteTodo,
    onSaveAPI,
    onSaveSSH,
    onUpdateNote,
    onUpdateRecurring,
    onUpdateRecurringCategories,
    onUpdateResource,
    onUpdateTodo,
    promptCategories,
    recurringCategories,
    recurringEvents,
    resourceData,
    searchConfig,
    sshCategories,
    sshRecords,
    todoCategories,
    todos,
  ]);

  const createUndoSnapshotForTool = useCallback((
    toolName: string,
    args: Record<string, any>,
  ): Promise<UndoSnapshot | undefined> => createAgentUndoSnapshotForTool(toolName, args, {
    todos,
    notes,
    resourceData,
    sshRecords,
    apiRecords,
    ojHeatmapData,
    recurringEvents,
    fileRecords,
  }), [apiRecords, fileRecords, notes, ojHeatmapData, recurringEvents, resourceData, sshRecords, todos]);

  const buildToolConfirmation = useCallback((
    toolName: string,
    args: Record<string, any>,
    snapshot?: UndoSnapshot,
  ): PendingConfirmation => ({
    id: `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'agent_tool',
    status: 'pending',
    summary: `确认执行 ${toolName}`,
    data: {
      toolName,
      arguments: args,
      snapshot,
      actionLabel: snapshot?.label || toolName,
    },
  }), []);

  const executeRegisteredToolWithSafety = useCallback(async (
    registration: NonNullable<ReturnType<typeof findToolRegistration>>,
    args: Record<string, any>,
    context: ToolExecutionContext,
    options: { confirmed?: boolean } = {},
  ): Promise<{ result: any; undoSnapshot?: UndoSnapshot; pendingConfirmation?: PendingConfirmation; executed: boolean }> => {
    const target = getToolPermissionTarget(registration);
    const needsSafety = needsHumanConfirmation(target.action);
    const snapshot = needsSafety ? await createUndoSnapshotForTool(registration.name, args) : undefined;
    const requiresConfirmation = needsSafety && !options.confirmed && !hasFullToolAccess(registration, fullAccessPermissions);

    if (requiresConfirmation) {
      const pendingConfirmation = buildToolConfirmation(registration.name, args, snapshot);
      return {
        executed: false,
        pendingConfirmation,
        result: {
          success: true,
          pendingConfirmation: true,
          confirmationId: pendingConfirmation.id,
          confirmationType: 'agent_tool',
          message: `${snapshot?.label || registration.name} 等待确认。`,
          toolName: registration.name,
          arguments: args,
        },
      };
    }

    const normalizedResult = await executeToolRegistration(registration, args, context);
    const result = normalizedResult.raw ?? normalizedResult;
    return { executed: true, result, undoSnapshot: snapshot };
  }, [buildToolConfirmation, createUndoSnapshotForTool, fullAccessPermissions]);

  const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
  const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

  const handleAddAttachment = useCallback(async () => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.selectFile) return;

    const file = await electronAPI.selectFile();
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_SIZE) {
      alert('文件超出 20MB 限制');
      return;
    }

    const base64 = await electronAPI.readFileBase64(file.path);
    if (!base64) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
      json: 'application/json', csv: 'text/csv',
      py: 'text/x-python', js: 'text/javascript', ts: 'text/typescript',
      html: 'text/html', css: 'text/css', xml: 'text/xml',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const isImage = IMAGE_MIME_TYPES.has(mimeType);

    setPendingAttachments(prev => [...prev, {
      type: isImage ? 'image' : 'file',
      name: file.name,
      mimeType,
      base64,
      size: file.size,
    }]);
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const processDroppedFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
      json: 'application/json', csv: 'text/csv',
      py: 'text/x-python', js: 'text/javascript', ts: 'text/typescript',
      html: 'text/html', css: 'text/css', xml: 'text/xml',
    };
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        alert(`"${file.name}" 超出 20MB 限制，已跳过`);
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeType = mimeMap[ext] || file.type || 'application/octet-stream';
      const isImage = IMAGE_MIME_TYPES.has(mimeType);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setPendingAttachments(prev => [...prev, { type: isImage ? 'image' : 'file', name: file.name, mimeType, base64, size: file.size }]);
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await processDroppedFiles(e.dataTransfer.files);
    }
  }, [processDroppedFiles]);

  useEffect(() => {
    chatServiceRef.current = new ChatService({
      ...config,
      systemPrompt: getAgentSystemPrompt({
        selectedModules,
        promptMode: supportsNativeTools ? 'native-tools' : 'fallback',
        customSystemPrompt: config.systemPrompt,
        modulePrompts,
        allowedActionTypes,
      }),
    });
  }, []);

  useEffect(() => {
    saveAgentPageState({
      inputDraft: inputValue,
      selectedModules,
      isDebugCollapsed,
      isExecutionVizCollapsed,
      enableWebSearch,
    });
  }, [enableWebSearch, inputValue, isDebugCollapsed, isExecutionVizCollapsed, selectedModules]);

  useEffect(() => {
    saveAgentConfig(config);
    saveModulePrompts(modulePrompts);
    if (chatServiceRef.current) {
      chatServiceRef.current.updateConfig({
        ...config,
        systemPrompt: getAgentSystemPrompt({
          selectedModules,
          promptMode: supportsNativeTools ? 'native-tools' : 'fallback',
          customSystemPrompt: config.systemPrompt,
          modulePrompts,
          allowedActionTypes,
        }),
      });
    }
  }, [allowedActionTypes, config, modulePrompts, selectedModules, supportsNativeTools]);

  useEffect(() => {
    saveAgentRouterConfig(routerConfig);
  }, [routerConfig]);

  useEffect(() => {
    saveAgentSearchConfig(searchConfig);
  }, [searchConfig]);

  useEffect(() => {
    saveAgentHistory(messages.filter(m => m.id !== 'welcome').map(sanitizeAgentMessageForHistory));
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!shouldAutoScrollMessagesRef.current) return;

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messages]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollMessagesRef.current = distanceToBottom < 120;
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setShowPermissions(false);
    }
  }, [isOpen]);

  useEffect(() => {
    saveAgentPermissions(effectiveDataPermissions, [], toolPermissions, fullAccessPermissions);
  }, [effectiveDataPermissions, fullAccessPermissions, toolPermissions]);

  const detectModuleScope = useCallback(async (input: string): Promise<AgentRouteResult> => {
    const manualScope = normalizeModuleScope(selectedModules);
    if (manualScope.length > 0) {
      const routeResult: AgentRouteResult = {
        modules: manualScope,
        source: 'manual',
        confidence: 1,
        reason: '使用用户手动限定的作用域',
        useTools: true,
      };
      pushDebugItem({
        stage: 'router:selected-scope',
        summary: '使用用户手动限定的作用域',
        payload: routeResult,
      });
      return routeResult;
    }

    const localScope = detectModuleScopeLocally(input);
    if (localScope.length > 0) {
      const routeResult: AgentRouteResult = {
        modules: localScope,
        source: 'local',
        confidence: 0.78,
        reason: '本地关键词规则命中模块作用域',
        useTools: true,
      };
      pushDebugItem({
        stage: 'router:local-intent',
        summary: `本地路由命中：${getModuleScopeLabel(localScope)}`,
        payload: routeResult,
      });
      return routeResult;
    }

    const routingConfig = routerConfig.apiKey ? routerConfig : config;
    if (!routingConfig.apiKey) {
      return {
        modules: [],
        source: 'search-only',
        confidence: 0.2,
        reason: '路由模型未配置，仅开放搜索工具；应用工具需要手动选择作用域或配置路由模型',
        useTools: true,
      };
    }

    const routerSignature = getRouterSignature(routingConfig);
    const cacheKey = makeInitialRouteCacheKey(input, routingConfig);
    const cached = getRouteCacheEntry(cacheKey, routerSignature);
    if (cached) {
      const routeResult: AgentRouteResult = {
        modules: normalizeModuleScope(cached.modules),
        source: 'cache',
        confidence: cached.confidence,
        reason: `${cached.reason}（路由缓存命中）`,
        useTools: cached.useTools,
      };
      pushDebugItem({
        stage: 'router:cache-hit',
        summary: routeResult.useTools
          ? routeResult.modules.length > 0
            ? `路由缓存命中：${getModuleScopeLabel(routeResult.modules)}`
            : '路由缓存命中：无需应用工具'
          : '路由缓存命中：无需工具',
        payload: { routeResult, cacheKey, hitCount: cached.hitCount },
      });
      return routeResult;
    }

    try {
      const routerPrompt = buildModuleRouterPrompt(input, enabledAgentModules);
      const routerService = new ChatService({
        ...routingConfig,
        systemPrompt: '',
        temperature: 0,
        maxTokens: Math.min(routingConfig.maxTokens || 1024, 1024),
      });
      pushDebugItem({
        stage: 'router:llm-request',
        summary: '请求 LLM 自动选择多模块作用域',
        payload: {
          prompt: routerPrompt,
          provider: routingConfig.provider,
          model: routingConfig.model,
          independentRouterConfig: Boolean(routerConfig.apiKey),
        },
      });
      const text = await routerService.completeText([
        { id: 'agent-router-system', role: 'system', content: routerPrompt, timestamp: 0 },
      ], { onDebugEvent: pushServiceDebugEvent });
      const routeResult = parseModuleRouterResponse(text);
      if (shouldCacheRouteResult(routeResult)) {
        setRouteCacheEntry({
          key: cacheKey,
          kind: 'initial',
          modules: routeResult.modules,
          useTools: routeResult.useTools,
          confidence: routeResult.confidence,
          reason: routeResult.reason,
          routerSignature,
        });
      }
      pushDebugItem({
        stage: 'router:llm-response',
        summary: routeResult.useTools
          ? routeResult.modules.length > 0
            ? `LLM 路由：${getModuleScopeLabel(routeResult.modules)}`
            : 'LLM 路由：仅开放搜索工具'
          : 'LLM 路由：无需工具',
        payload: { text, routeResult },
      });
      return routeResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const routeResult: AgentRouteResult = {
        modules: [],
        source: 'search-only',
        confidence: 0.1,
        reason: `自动路由失败，仅开放搜索工具：${message}`,
        useTools: true,
      };
      pushDebugItem({
        stage: 'router:llm-response',
        summary: '自动路由失败，回退到搜索工具',
        payload: routeResult,
        level: 'info',
      });
      return routeResult;
    }
  }, [config, enabledAgentModules, pushDebugItem, pushServiceDebugEvent, routerConfig, selectedModules]);

  const detectSupplementalModuleScope = useCallback(async (input: {
    goal: string;
    currentModules: string[];
    finalText: string;
    toolCalls: ChatToolCall[];
    toolResults: Array<{ toolCall: ChatToolCall; result: any }>;
    evaluation: AgentCompletionEvaluation;
  }): Promise<AgentSupplementalRouteResult> => {
    const currentModules = normalizeModuleScope(input.currentModules);
    const routingConfig = routerConfig.apiKey ? routerConfig : config;
    if (!routingConfig.apiKey) {
      return {
        addModules: [],
        needContinue: false,
        source: 'none',
        confidence: 0,
        reason: '路由模型未配置，无法补充作用域',
      };
    }

    const failedTools = input.toolResults
      .filter(item => item.result?.success === false)
      .map(item => item.toolCall.name);
    const routerSignature = getRouterSignature(routingConfig);
    const cacheKey = makeSupplementalRouteCacheKey({
      goal: input.goal,
      currentModules,
      finalText: input.finalText,
      evaluationMessage: input.evaluation.message,
      failedTools,
    }, routingConfig);
    const cached = getRouteCacheEntry(cacheKey, routerSignature);
    if (cached) {
      const addModules = normalizeModuleScope(cached.modules).filter(moduleId => !currentModules.includes(moduleId));
      const result: AgentSupplementalRouteResult = {
        addModules,
        needContinue: cached.useTools && addModules.length > 0,
        source: 'cache',
        confidence: cached.confidence,
        reason: `${cached.reason}（补充路由缓存命中）`,
      };
      pushDebugItem({
        stage: 'router:supplement-cache-hit',
        summary: result.needContinue
          ? `补充路由缓存命中：${getModuleScopeLabel(result.addModules)}`
          : '补充路由缓存命中：无需追加模块',
        payload: { result, cacheKey, hitCount: cached.hitCount },
      });
      return result;
    }

    try {
      const routerPrompt = buildSupplementalRouterPrompt({
        ...input,
        currentModules,
      }, enabledAgentModules);
      const routerService = new ChatService({
        ...routingConfig,
        systemPrompt: '',
        temperature: 0,
        maxTokens: Math.min(routingConfig.maxTokens || 1024, 1024),
      });
      pushDebugItem({
        stage: 'router:supplement-request',
        summary: '请求 LLM 补充任务作用域',
        payload: {
          prompt: routerPrompt,
          provider: routingConfig.provider,
          model: routingConfig.model,
          currentModules,
        },
      });
      const text = await routerService.completeText([
        { id: 'agent-supplement-router-system', role: 'system', content: routerPrompt, timestamp: 0 },
      ], { onDebugEvent: pushServiceDebugEvent });
      const result = parseSupplementalRouterResponse(text, currentModules);
      if (
        result.needContinue &&
        result.confidence >= AGENT_ROUTE_CACHE_MIN_CONFIDENCE &&
        result.addModules.length > 0
      ) {
        setRouteCacheEntry({
          key: cacheKey,
          kind: 'supplemental',
          modules: result.addModules,
          useTools: result.needContinue,
          confidence: result.confidence,
          reason: result.reason,
          routerSignature,
        });
      }
      pushDebugItem({
        stage: 'router:supplement-response',
        summary: result.needContinue
          ? `补充路由：${getModuleScopeLabel(result.addModules)}`
          : '补充路由：无需追加模块',
        payload: { text, result },
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: AgentSupplementalRouteResult = {
        addModules: [],
        needContinue: false,
        source: 'none',
        confidence: 0,
        reason: `补充路由失败：${message}`,
      };
      pushDebugItem({
        stage: 'router:supplement-response',
        summary: result.reason,
        payload: result,
        level: 'error',
      });
      return result;
    }
  }, [config, enabledAgentModules, pushDebugItem, pushServiceDebugEvent, routerConfig]);

  const runFallbackConversation = useCallback(async (
    assistantId: string,
    userMessage: AgentMessage,
    routedModules: string[],
    fallbackReason: string,
  ) => {
    const primaryModule = routedModules[0];
    const chatMessages: ChatMessage[] = [
      {
        id: 'system',
        role: 'system',
        content: [
          '你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能助理。',
          '本轮没有进入逐步 Function Calling runtime，只能进行自然语言回复，不会执行本地应用工具。',
          `原因：${fallbackReason}`,
          '不要输出 ```action``` JSON 块，不要声称已经创建、修改、删除、发送或读取了应用内数据。',
          '如果用户要求执行本地操作，请提醒用户检查 Agent 模型配置、作用域、联网开关和权限中心授权后再执行。',
          `当前参考作用域：${routedModules.length > 0 ? getModuleScopeLabel(routedModules) : '未限定'}`,
          config.systemPrompt?.trim() ? `\n## 用户自定义系统提示\n${config.systemPrompt.trim()}` : '',
        ].filter(Boolean).join('\n'),
        timestamp: 0,
      },
      ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-6).map(toSafeChatMessage),
      toSafeChatMessage(userMessage),
    ];

    pushDebugItem({
      stage: 'fallback:request',
      summary: '兼容模式请求 LLM（流式）',
      payload: {
        provider: config.provider,
        model: config.model,
        messages: chatMessages,
      },
    });

    let fullResponse = '';

    await chatServiceRef.current?.sendMessage(chatMessages, {
      onToken: (token) => {
        fullResponse += token;
        setMessages(prev => prev.map(message =>
          message.id === assistantId ? { ...message, content: fullResponse, targetModule: primaryModule, targetModules: routedModules } : message
        ));
      },
      onComplete: async (text) => {
        pushDebugItem({
          stage: 'fallback:response',
          summary: '兼容模式流式回复完成',
          payload: { text },
        });

        const plainFallbackContent = text || fullResponse || '...';
        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? { ...message, content: plainFallbackContent, targetModule: primaryModule, targetModules: routedModules }
            : message
        ));
        setIsProcessing(false);
        return;

        const actionFromModel = parseAgentAction(text);
        const localIntent = !actionFromModel && routedModules.includes('todo')
          ? parseIntentLocally(userMessage.content)
          : { isCreateTodo: false };
        const action: AgentAction | null = actionFromModel || (localIntent.isCreateTodo
          ? { type: 'create_todo', status: 'pending', data: (localIntent.data || {}) as Record<string, any> }
          : null);
        const displayContent = removeActionBlock(text) || (action ? '已收到，我来帮你处理。' : text);

        pushDebugItem({
          stage: 'fallback:action-parse',
          summary: action ? `解析到 Action: ${action.type}` : '未解析到 Action，仅文本回复',
          payload: {
            actionFromModel,
            localIntent,
            finalAction: action,
          },
        });

        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? { ...message, content: displayContent || '...', action: action || undefined, targetModule: primaryModule, targetModules: routedModules }
            : message
        ));

        if (action?.status === 'pending') {
          try {
            if (!isFallbackActionAllowed(action.type)) {
              throw new Error(`工具未授权: ${action.type}`);
            }
            let resultData: any;
            let summaryText = '';
            let pendingConfirm: PendingConfirmation | undefined;
            let undoSnapshot: UndoSnapshot | undefined;
            const registration = findToolRegistration(toolRegistry, action.type);
            if (registration) {
              const target = getToolPermissionTarget(registration);
              if (target.action === 'update' || target.action === 'delete') {
                undoSnapshot = await createUndoSnapshotForTool(action.type, action.data || {});
                if (!hasFullToolAccess(registration, fullAccessPermissions)) {
                  pendingConfirm = buildToolConfirmation(action.type, action.data || {}, undoSnapshot);
                  resultData = {
                    pendingConfirmation: true,
                    confirmationId: pendingConfirm.id,
                    confirmationType: 'agent_tool',
                    toolName: action.type,
                    arguments: action.data || {},
                    snapshot: undoSnapshot,
                    message: `${undoSnapshot?.label || action.type} 等待确认。`,
                  };
                  summaryText = `${undoSnapshot?.label || action.type} 等待确认`;
                }
              }
            }

            if (pendingConfirm) {
              // 修改/删除类 action 默认只生成确认卡片，不立即执行。
            } else if (action.type === 'create_todo') {
              const schedule = resolveTodoSchedulePayload(action.data || {});
              if (schedule.error) throw new Error(schedule.error);
              resultData = normalizeTodoPayload(action.data || {});
              onCreateTodo(resultData);
              summaryText = '待办创建成功';
            } else if (action.type === 'create_note') {
              resultData = { content: action.data?.content || '新便签', color: action.data?.color || 'bg-yellow-100' };
              onCreateNote(resultData);
              summaryText = '便签创建成功';
            } else if (action.type === 'create_prompt') {
              resultData = { title: action.data?.title || '未命名技能', content: action.data?.content || '', category: action.data?.category || '未分类', description: action.data?.description };
              onCreatePrompt(resultData);
              summaryText = '技能卡创建成功';
            } else if (action.type === 'create_markdown_note') {
              resultData = { title: action.data?.title || '新笔记', content: action.data?.content || '', category: action.data?.category || '' };
              onCreateMarkdownNote(resultData);
              summaryText = 'Markdown 笔记创建成功';
            } else if (action.type === 'create_oj_submission') {
              const d = action.data || {};
              const siteName = (typeof d.siteName === 'string' ? d.siteName : '').trim();
              const site = ojHeatmapData.sites.find(s =>
                s.name.toLowerCase() === siteName.toLowerCase() || s.id.toLowerCase() === siteName.toLowerCase()
              );
              if (!site) {
                throw new Error(`未找到平台「${siteName}」，当前可用：${ojHeatmapData.sites.map(s => s.name).join('、') || '暂无'}`);
              }
              const catName = (typeof d.categoryName === 'string' ? d.categoryName : '').trim();
              let catId = site.categories?.[0]?.id || 'easy';
              if (catName && site.categories) {
                const m = site.categories.find(c => c.name === catName || c.id === catName);
                if (m) catId = m.id;
              }
              const now2 = new Date();
              const dateStr = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
                ? d.date
                : `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, '0')}-${String(now2.getDate()).padStart(2, '0')}`;
              const submission: OJSubmission = {
                id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                siteId: site.id, categoryId: catId,
                problemId: String(d.problemId || '').trim(),
                problemTitle: typeof d.problemTitle === 'string' ? d.problemTitle.trim() : undefined,
                timestamp: Date.now(), date: dateStr,
              };
              onCreateOJSubmission(submission);
              resultData = submission;
              summaryText = `做题记录创建成功：${site.name} ${submission.problemId}`;
            } else if (action.type === 'create_resource') {
              const d = action.data || {};
              const cats = resourceData.categories;
              const catName = (typeof d.categoryName === 'string' ? d.categoryName : '').trim();
              let catId = cats[0]?.id || 'cloud';
              if (catName && cats.length > 0) {
                const m = cats.find(c => c.name === catName || c.id === catName);
                if (m) catId = m.id;
              }
              const item: Partial<ResourceItem> = {
                name: typeof d.name === 'string' ? d.name.trim() : '新资源',
                categoryId: catId,
                expireDate: typeof d.expireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.expireDate) ? d.expireDate : undefined,
                capacity: (d.capacityTotal && d.capacityTotal > 0)
                  ? { used: Number(d.capacityUsed) || 0, total: Number(d.capacityTotal), unit: typeof d.capacityUnit === 'string' ? d.capacityUnit : 'GB' }
                  : undefined,
                cost: (d.costAmount && d.costAmount > 0)
                  ? { amount: Number(d.costAmount), period: (['month', 'year', 'once'].includes(d.costPeriod) ? d.costPeriod : 'month') as 'month' | 'year' | 'once' }
                  : undefined,
                url: typeof d.url === 'string' ? d.url.trim() : undefined,
                note: typeof d.note === 'string' ? d.note.trim() : undefined,
                account: typeof d.account === 'string' ? d.account.trim() : undefined,
                autoRenewal: typeof d.autoRenewal === 'boolean' ? d.autoRenewal : undefined,
              };
              onCreateResource(item);
              resultData = item;
              summaryText = `资源创建成功：${item.name}`;
            } else if (action.type === 'create_leetcode_list') {
              const d = action.data || {};
              const groups = Array.isArray(d.groups) ? d.groups : [];
              const mdLines: string[] = [];
              const categories: { title: string; problems: { title: string; url: string; note?: string }[] }[] = [];
              for (const group of groups) {
                mdLines.push(`### ${group.name}`);
                mdLines.push('| 题目 | 相关链接 | 备注 |');
                mdLines.push('|---|---|---|');
                const problems: { title: string; url: string; note?: string }[] = [];
                for (const p of (Array.isArray(group.problems) ? group.problems : [])) {
                  mdLines.push(`| [${p.title}](${p.url}) | | ${p.note || ''} |`);
                  problems.push({ title: p.title, url: p.url, note: p.note || undefined });
                }
                categories.push({ title: group.name, problems });
                mdLines.push('');
              }
              const newList = {
                id: Date.now().toString(),
                title: String(d.title || '').trim(),
                description: String(d.description || '').trim(),
                priority: Number(d.priority) || 10,
                categories,
                rawMarkdown: mdLines.join('\n'),
                createdAt: Date.now(),
              };
              const existing: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
              existing.push(newList);
              existing.sort((a: any, b: any) => (a.priority ?? 10) - (b.priority ?? 10));
              localStorage.setItem('leetcode_lists', JSON.stringify(existing));
              resultData = newList;
              summaryText = `题单「${newList.title}」创建成功`;
            } else if (action.type === 'create_learning_course') {
              const d = action.data || {};
              const catName = String(d.categoryName || '').trim();
              const courseTitle = String(d.title || '').trim();
              const courseDesc = String(d.description || '').trim();
              const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
              let targetCat = cats.find((c: any) => c.name === catName || c.id === catName);
              if (!targetCat) {
                targetCat = { id: `cat_${Date.now()}`, name: catName, icon: 'BookOpen', color: 'blue', priority: 10 };
                cats.push(targetCat);
                localStorage.setItem('learning_categories_v1', JSON.stringify(cats));
              }
              const newCourse = {
                id: `course_${Date.now()}`,
                title: courseTitle,
                description: courseDesc,
                categoryId: targetCat.id,
                modules: [],
                assignments: [],
                assignmentModules: [],
                personalModules: [],
                customSections: [],
                introMarkdown: String(d.introMarkdown || '').trim() || `# ${courseTitle}\n\n${courseDesc || '在这里编写学习总览...'}`,
                icon: d.icon || undefined,
                priority: Number(d.priority) || 10,
              };
              const courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
              courses.push(newCourse);
              localStorage.setItem('learning_courses_v1', JSON.stringify(courses));
              resultData = newCourse;
              summaryText = `课程「${courseTitle}」创建成功，归属分类「${targetCat.name}」`;
            } else if (action.type === 'update_todo') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.id);
              if (!todo) throw new Error(`未找到 id 为「${d.id}」的待办`);
              const updates: Partial<TodoItem> = {};
              if (typeof d.content === 'string') updates.content = d.content.trim();
              if (typeof d.description === 'string') updates.description = d.description;
              if (['high', 'medium', 'low'].includes(d.priority)) updates.priority = d.priority;
              if (typeof d.category === 'string') updates.category = d.category.trim();
              const schedule = resolveTodoSchedulePayload(d);
              if (schedule.error) throw new Error(schedule.error);
              Object.assign(updates, schedule.updates);
              if (typeof d.isCompleted === 'boolean') { updates.isCompleted = d.isCompleted; if (d.isCompleted) updates.completedAt = Date.now(); }
              onUpdateTodo(d.id, updates);
              resultData = updates;
              summaryText = `待办「${todo.content}」已更新`;
            } else if (action.type === 'delete_todo') {
              const d = action.data || {};
              const match = resolveTodoMatch(todos, d);
              if (!match.todo) throw new Error(match.error || '未找到待办');
              onDeleteTodo(match.todo.id, { skipConfirm: true });
              resultData = { id: match.todo.id };
              summaryText = `待办「${match.todo.content}」已删除`;
            } else if (action.type === 'query_subtasks') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.todoId);
              if (!todo) throw new Error(`未找到 id 为「${d.todoId}」的待办`);
              const subtasks = todo.subtasks || [];
              resultData = { todoId: todo.id, todoContent: todo.content, total: subtasks.length, completed: subtasks.filter((s: SubTask) => s.isCompleted).length, subtasks };
              summaryText = `待办「${todo.content}」共有 ${subtasks.length} 个子任务`;
            } else if (action.type === 'create_subtask') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.todoId);
              if (!todo) throw new Error(`未找到 id 为「${d.todoId}」的待办`);
              const newSub: SubTask = { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), content: String(d.content).trim(), isCompleted: false };
              const subtasks = [...(todo.subtasks || []), newSub];
              onUpdateTodo(d.todoId, { subtasks });
              resultData = newSub;
              summaryText = `子任务「${newSub.content}」已添加到「${todo.content}」`;
            } else if (action.type === 'update_subtask') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.todoId);
              if (!todo) throw new Error(`未找到 id 为「${d.todoId}」的待办`);
              const subtasks = [...(todo.subtasks || [])];
              const idx = subtasks.findIndex((s: SubTask) => s.id === d.subtaskId);
              if (idx === -1) throw new Error(`未找到 id 为「${d.subtaskId}」的子任务`);
              if (typeof d.content === 'string') subtasks[idx] = { ...subtasks[idx], content: d.content.trim() };
              if (typeof d.isCompleted === 'boolean') subtasks[idx] = { ...subtasks[idx], isCompleted: d.isCompleted };
              onUpdateTodo(d.todoId, { subtasks });
              resultData = subtasks[idx];
              summaryText = `子任务「${subtasks[idx].content}」已更新`;
            } else if (action.type === 'delete_subtask') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.todoId);
              if (!todo) throw new Error(`未找到 id 为「${d.todoId}」的待办`);
              const subtask = (todo.subtasks || []).find((s: SubTask) => s.id === d.subtaskId);
              if (!subtask) throw new Error(`未找到 id 为「${d.subtaskId}」的子任务`);
              const subtasks = (todo.subtasks || []).filter((s: SubTask) => s.id !== d.subtaskId);
              onUpdateTodo(d.todoId, { subtasks });
              resultData = { id: d.subtaskId };
              summaryText = `子任务「${subtask.content}」已删除`;
            } else if (action.type === 'update_note') {
              const d = action.data || {};
              const note = notes.find(n => n.id === d.id);
              if (!note) throw new Error(`未找到 id 为「${d.id}」的便签`);
              const updates: Partial<Note> = {};
              if (typeof d.content === 'string') updates.content = d.content;
              if (typeof d.color === 'string') updates.color = d.color;
              onUpdateNote(d.id, updates);
              resultData = updates;
              summaryText = '便签已更新';
            } else if (action.type === 'delete_note') {
              const d = action.data || {};
              const note = notes.find(n => n.id === d.id);
              if (!note) throw new Error(`未找到 id 为「${d.id}」的便签`);
              onDeleteNote(d.id);
              resultData = { id: d.id };
              summaryText = '便签已删除';
            } else if (action.type === 'update_resource') {
              const d = action.data || {};
              const item = resourceData.items.find(i => i.name === d.name);
              if (!item) throw new Error(`未找到名为「${d.name}」的资源`);
              const updates: Partial<ResourceItem> = {};
              if (typeof d.newName === 'string') updates.name = d.newName.trim();
              if (typeof d.expireDate === 'string') updates.expireDate = d.expireDate;
              if (typeof d.note === 'string') updates.note = d.note;
              if (typeof d.autoRenewal === 'boolean') updates.autoRenewal = d.autoRenewal;
              onUpdateResource(item.id, updates);
              resultData = updates;
              summaryText = `资源「${item.name}」已更新`;
            } else if (action.type === 'delete_resource') {
              const d = action.data || {};
              const item = resourceData.items.find(i => i.name === d.name);
              if (!item) throw new Error(`未找到名为「${d.name}」的资源`);
              onDeleteResource(item.id);
              resultData = { id: item.id };
              summaryText = `资源「${item.name}」已删除`;
            } else if (action.type === 'send_email') {
              const d = action.data || {};
              const configStr = localStorage.getItem('linkmaster_email_config');
              if (!configStr) throw new Error('邮箱未配置。请在「设置 → 邮箱配置」中完成 SMTP 设置。');
              let emailCfg: EmailConfig;
              try { emailCfg = JSON.parse(configStr); } catch { throw new Error('邮箱配置格式错误，请重新设置。'); }
              const recipient = (typeof d.recipient === 'string' && d.recipient.trim()) ? d.recipient.trim() : emailCfg.recipient;
              if (!recipient) throw new Error('收件人地址为空，请指定收件人或在设置中配置默认收件人。');
              const allContacts = loadContacts();
              const matchedContact = allContacts.find(c => c.email === recipient || c.nickname === recipient);
              const recipientDisplay = matchedContact ? `${matchedContact.nickname} <${matchedContact.email}>` : recipient;
              const confirmationId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const contentPreview = String(d.content || '').replace(/<[^>]+>/g, '').slice(0, 200);
              resultData = {
                pendingConfirmation: true,
                confirmationId,
                confirmationType: 'send_email',
                recipient: matchedContact ? matchedContact.email : recipient,
                recipientDisplay,
                subject: String(d.subject || '').trim(),
                contentPreview,
                fullContent: String(d.content || ''),
                message: `邮件待确认 → 收件人: ${recipientDisplay}, 主题: ${d.subject}`
              };
              pendingConfirm = { id: confirmationId, type: 'send_email', status: 'pending' as const, data: resultData, summary: `发送邮件给 ${recipientDisplay}: ${d.subject}` };
              summaryText = `邮件待确认 → ${recipientDisplay}`;
            } else if (action.type === 'query_files') {
              const d = action.data || {};
              if (effectiveFilePermissions.length === 0) throw new Error('文件读取未授权。请在 Agent 权限中心开启「文件」读取权限。');
              let items = fileRecords.filter(f => effectiveFilePermissions.includes(f.category) || effectiveFilePermissions.includes('全部'));
              if (typeof d.category === 'string' && d.category.trim()) {
                const cat = d.category.trim();
                if (!effectiveFilePermissions.includes(cat) && !effectiveFilePermissions.includes('全部')) throw new Error(`分类「${cat}」未授权。`);
                items = items.filter(f => f.category === cat);
              }
              if (typeof d.keyword === 'string' && d.keyword.trim()) {
                const kw = d.keyword.trim().toLowerCase();
                items = items.filter(f => f.name.toLowerCase().includes(kw) || f.note.toLowerCase().includes(kw));
              }
              const limit = Math.min(Number(d.limit) || 20, 50);
              resultData = { total: items.length, files: items.slice(0, limit).map(f => ({ id: f.id, name: f.name, type: f.type, category: f.category, note: f.note || null })) };
              summaryText = `查询到 ${items.length} 个文件`;
            } else if (action.type === 'read_file') {
              const d = action.data || {};
              const file = fileRecords.find(f => f.id === d.id);
              if (!file) throw new Error(`未找到 id 为「${d.id}」的文件。`);
              if (!effectiveFilePermissions.includes(file.category) && !effectiveFilePermissions.includes('全部')) throw new Error(`文件「${file.name}」读取未授权。请在 Agent 权限中心开启「文件」读取权限。`);
              const eAPI = (window as any).electronAPI;
              if (!eAPI?.readFile) throw new Error('文件读取不可用（非桌面端）。');
              const content = await eAPI.readFile(file.path);
              if (content === null) throw new Error(`读取失败：文件「${file.name}」不存在。`);
              resultData = { id: file.id, name: file.name, content: content.length > 50000 ? content.slice(0, 50000) : content, length: content.length };
              summaryText = `文件「${file.name}」读取成功`;
            } else if (action.type === 'query_images') {
              const d = action.data || {};
              let records: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
              if (typeof d.category === 'string' && d.category.trim()) {
                const cat = d.category.trim();
                records = records.filter((r: any) => r.category === cat || (!r.category && cat === '未分类'));
              }
              if (typeof d.keyword === 'string' && d.keyword.trim()) {
                const kw = d.keyword.trim().toLowerCase();
                records = records.filter((r: any) => (r.filename || '').toLowerCase().includes(kw) || (r.name || '').toLowerCase().includes(kw));
              }
              records.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
              const limit = typeof d.limit === 'number' && d.limit > 0 ? d.limit : 20;
              const sliced = records.slice(0, limit);
              resultData = {
                total: records.length,
                images: sliced.map((r: any) => ({ name: r.name || r.filename, url: r.url, markdown: `![${r.name || r.filename}](${r.url})`, category: r.category || '未分类' })),
              };
              summaryText = `查询到 ${records.length} 张图片`;
            } else if (action.type === 'upload_image') {
              const d = action.data || {};
              // 获取图床配置
              const imgConfigStr = localStorage.getItem('linkmaster_image_config_v1');
              if (!imgConfigStr) throw new Error('图床未配置。请在「图床管理」中设置 Gitee 配置。');
              let imgConfig: any;
              try { imgConfig = JSON.parse(imgConfigStr); } catch { throw new Error('图床配置格式错误。'); }
              if (!imgConfig.accessToken || !imgConfig.owner || !imgConfig.repo) throw new Error('图床配置不完整。');
              // 获取图片附件
              const imageAttachments = (userMessage.attachments || []).filter(a => a.type === 'image' && a.base64);
              if (imageAttachments.length === 0) throw new Error('未找到图片附件。请在消息中附带图片后再调用。');
              const idx = typeof d.attachmentIndex === 'number' ? d.attachmentIndex : 0;
              if (idx < 0 || idx >= imageAttachments.length) throw new Error(`图片索引 ${idx} 超出范围。`);
              const attachment = imageAttachments[idx];
              const ext = (attachment.name || 'image.png').split('.').pop()?.toLowerCase() || 'png';
              const ts = Date.now();
              const rnd = Math.random().toString(36).slice(2, 9);
              const filename = `${ts}_${rnd}.${ext}`;
              const uploadPath = imgConfig.path ? `${imgConfig.path}/${filename}` : filename;
              const eAPI = (window as any).electronAPI;
              if (!eAPI?.uploadImage) throw new Error('上传功能不可用（非桌面端）。');
              const uploadResult = await eAPI.uploadImage({ accessToken: imgConfig.accessToken, owner: imgConfig.owner, repo: imgConfig.repo, path: uploadPath, content: attachment.base64, message: `Upload ${filename} via Agent` });
              if (!uploadResult || !uploadResult.content) throw new Error(`上传失败：${uploadResult?.message || '未知错误'}`);
              const displayName = (typeof d.name === 'string' && d.name.trim()) ? d.name.trim() : (attachment.name || filename);
              const category = (typeof d.category === 'string' && d.category.trim()) ? d.category.trim() : '未分类';
              const newRecord = { id: ts.toString(), filename, name: displayName, url: uploadResult.content.download_url, sha: uploadResult.content.sha, path: uploadResult.content.path, category, createdAt: Date.now() };
              const existing: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
              existing.unshift(newRecord);
              localStorage.setItem('linkmaster_image_records_v1', JSON.stringify(existing));
              window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));
              resultData = { url: uploadResult.content.download_url, markdown: `![${displayName}](${uploadResult.content.download_url})`, name: displayName, category };
              summaryText = `图片「${displayName}」已上传至图床`;
            }

            if (resultData) {
              pushDebugItem({
                stage: 'fallback:tool-exec',
                summary: `执行本地 API：${action.type}`,
                payload: { tool: action.type, args: action.data || {}, normalized: resultData },
              });
              setMessages(prev => prev.map(message =>
                message.id === assistantId ? {
                  ...message,
                  action: { ...action, status: pendingConfirm ? 'pending' : 'success', data: resultData },
                  ...(pendingConfirm ? { pendingConfirmation: pendingConfirm } : {}),
                  ...(undoSnapshot ? { undoSnapshot } : {}),
                } : message
              ));
              pushDebugItem({
                stage: 'fallback:tool-result',
                summary: summaryText,
                payload: { result: resultData },
                level: 'success',
              });
            }
          } catch (error) {
            setMessages(prev => prev.map(message =>
              message.id === assistantId
                ? { ...message, action: { ...action, status: 'error', error: String(error) } }
                : message
            ));
            pushDebugItem({
              stage: 'fallback:tool-result',
              summary: `${action.type} 执行失败`,
              payload: { error: error instanceof Error ? error.message : String(error) },
              level: 'error',
            });
          }
        }

        setIsProcessing(false);
      },
      onError: (error) => {
        pushDebugItem({
          stage: 'fallback:error',
          summary: '兼容模式调用失败',
          payload: { error: error.message },
          level: 'error',
        });
        setMessages(prev => prev.map(message =>
          message.id === assistantId ? { ...message, content: `❌ 发生错误: ${error.message}`, targetModule: primaryModule, targetModules: routedModules } : message
        ));
        setIsProcessing(false);
      },
    });
  }, [allowedActionTypes, config.model, config.provider, config.systemPrompt, messages, todos, effectiveDataPermissions, effectiveFilePermissions, fileRecords, onCreateTodo, onCreateNote, onCreatePrompt, onCreateMarkdownNote, onCreateOJSubmission, ojHeatmapData, onCreateResource, resourceData, pushDebugItem, selectedModules, isFallbackActionAllowed]);

  const evaluateAgentCompletion = useCallback(async (input: {
    goal: string;
    finalText: string;
    toolCalls: ChatToolCall[];
    toolResults: Array<{ toolCall: ChatToolCall; result: any }>;
  }): Promise<AgentCompletionEvaluation> => {
    if (!chatServiceRef.current) {
      return { status: 'success', message: '缺少模型复核服务，已使用确定性检查。', confidence: 0.4 };
    }

    const compactResults = input.toolResults.map(item => ({
      tool: item.toolCall.name,
      args: item.toolCall.arguments,
      success: item.result?.success !== false,
      message: item.result?.message || item.result?.error || item.result?.summary,
      result: item.result,
    }));
    const verifierPrompt = [
      '你是 Agent 执行结果验收器。只返回 JSON，不要输出 Markdown。',
      '判断标准：用户目标是否已经由工具调用和最终回复共同完成；不能因为助手说“完成了”就通过。',
      '如果工具失败、缺少必要工具调用、结果和目标不匹配，应判定 failed。',
      '如果需要用户补充信息或确认，应判定 needs_user。',
      'JSON 格式：{"status":"success|failed|needs_user","message":"一句话原因","confidence":0.0,"missing":["缺失项"]}',
    ].join('\n');
    const text = await chatServiceRef.current.completeText([
      { id: 'agent-eval-system', role: 'system', content: verifierPrompt, timestamp: 0 },
      {
        id: 'agent-eval-user',
        role: 'user',
        timestamp: Date.now(),
        content: JSON.stringify({
          goal: input.goal,
          finalText: input.finalText,
          toolCalls: input.toolCalls.map(call => ({ name: call.name, arguments: call.arguments })),
          toolResults: compactResults,
        }).slice(0, 18000),
      },
    ], { onDebugEvent: pushServiceDebugEvent });

    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
    const parsed = JSON.parse(jsonText);
    const status = ['success', 'failed', 'needs_user'].includes(parsed.status) ? parsed.status : 'failed';
    return {
      status,
      message: typeof parsed.message === 'string' ? parsed.message : '模型复核完成。',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : undefined,
      retryable: status === 'failed',
    };
  }, [pushServiceDebugEvent]);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if ((!trimmedInput && pendingAttachments.length === 0) || isProcessing) return;

    const sensitiveDetection = trimmedInput ? detectSensitiveInput(trimmedInput) : { matched: false, kinds: [], redactedText: trimmedInput };
    if (sensitiveDetection.matched) {
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: sensitiveDetection.redactedText,
        timestamp: Date.now(),
      };
      const assistantMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: [
          '检测到疑似 API Key、密码或令牌，原文没有发送给模型，也不会写入对话记录。',
          '',
          `拦截类型：${sensitiveDetection.kinds.join('、')}`,
          '',
          '请重新发送不包含敏感值的请求，例如只写网站地址、账号、用途等信息。',
          '',
          '后续 Agent 会创建空位并弹出本地填写卡片；你可以在本地保存密码/API Key，也可以选择“不保存”。',
        ].join('\n'),
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setInputValue('');
      setPendingAttachments([]);
      pushDebugItem({
        stage: 'send:blocked-sensitive',
        summary: '已拦截疑似敏感输入',
        payload: { kinds: sensitiveDetection.kinds },
        level: 'info',
      });
      return;
    }

    if (!config.apiKey) {
      pushDebugItem({
        stage: 'send:blocked',
        summary: '发送被阻止：未配置 API Key',
        payload: { provider: config.provider },
        level: 'error',
      });
      setShowSettings(true);
      return;
    }

    const currentAttachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    const manualScope = normalizeModuleScope(selectedModules);
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput || (currentAttachments ? `[已上传 ${currentAttachments.length} 个文件]` : ''),
      timestamp: Date.now(),
      targetModule: manualScope[0],
      targetModules: manualScope.length > 0 ? manualScope : undefined,
      attachments: currentAttachments,
    };
    const assistantId = crypto.randomUUID();
    const agentRunLogId = createAgentExecutionLog({
      goal: userMessage.content,
      provider: config.provider,
      model: config.model,
      selectedModule: manualScope.length > 0 ? manualScope.join(',') : null,
    });
    setMessages(prev => [...prev, userMessage, {
      id: assistantId,
      role: 'assistant',
      content: manualScope.length > 0 ? '正在处理任务...' : '正在判断任务作用域...',
      timestamp: Date.now(),
    }]);
    setInputValue('');
    setPendingAttachments([]);
    setIsProcessing(true);

    resetTurnDebug();
    setAgentRuntimeEvents([]);
    setAgentRuntimeToolEvents([]);
    setAgentRuntimeStatus({
      stage: 'planning',
      status: 'started',
      title: '准备启动 Agent',
      active: true,
    });
    pushDebugItem({
      stage: 'send:start',
      summary: '新一轮 Agent 执行流程启动',
      payload: {
        provider: config.provider,
        model: config.model,
        supportsNativeTools,
        selectedModules: manualScope,
        userInput: trimmedInput,
      },
    });
    appendAgentExecutionEntry(agentRunLogId, {
      stage: 'send:start',
      level: 'info',
      message: 'Agent 执行流程启动',
      payload: {
        provider: config.provider,
        model: config.model,
        selectedModules: manualScope,
        input: userMessage.content,
      },
    });

    try {
      if (!chatServiceRef.current) {
        throw new Error('聊天服务尚未初始化');
      }

      const routeResult = await detectModuleScope(userMessage.content);
      let activeRoutedScope = routeResult.useTools ? routeResult.modules : [];
      const getNativeToolScope = (scope: string[], useTools: boolean) =>
        useTools
          ? (scope.length === 0 ? ['__search_only__'] : scope)
          : ['__no_tools__'];
      const searchOnlyScope = routeResult.useTools && activeRoutedScope.length === 0;
      const toolScope = getNativeToolScope(activeRoutedScope, routeResult.useTools);
      const enableSpecializedSearch = effectiveWebSearchEnabled && (searchConfig.specialized?.enabledSources?.length || 0) > 0;
      const runtimeToolRegistry = [
        ...toolRegistry,
        WEB_SEARCH_TOOL_REGISTRATION,
        SPECIALIZED_SEARCH_TOOL_REGISTRATION,
      ];
      const buildNativeRegistrationsForScope = (scope: string[], useTools: boolean) =>
        supportsNativeTools && useTools
          ? getNativeToolRegistrations(
              toolRegistry,
              enabledAgentModules,
              getNativeToolScope(scope, useTools),
              effectiveWebSearchEnabled,
              toolPermissions,
              enableSpecializedSearch,
            )
          : [];
      const buildNativeToolsForScope = (scope: string[], useTools: boolean): ChatTool[] =>
        buildNativeRegistrationsForScope(scope, useTools).map(registration => toStrictTool(registration.tool));

      // 原生模式：按作用域注册已授权工具。自动路由未命中模块时只开放搜索工具，避免全量工具暴露。
      const nativeRegistrations = buildNativeRegistrationsForScope(activeRoutedScope, routeResult.useTools);
      const nativeTools = nativeRegistrations.map(registration => toStrictTool(registration.tool));
      const toolExecContext = buildToolExecContext(currentAttachments);

      pushDebugItem({
        stage: 'send:routing-result',
        summary: '任务路由完成',
        payload: {
          selectedModules: manualScope,
          routeResult,
          routedScope: activeRoutedScope,
          toolScope,
          searchOnlyScope,
          nativeToolCount: nativeTools.length,
          nativeToolNames: nativeTools.map(t => t.name),
          mode: supportsNativeTools && nativeTools.length > 0 ? 'native-tools (self-route)' : 'fallback',
        },
      });

      if (supportsNativeTools && nativeTools.length > 0) {
        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? { ...message, content: '正在规划任务...' }
            : message
        ));

        const chatMessages: ChatMessage[] = [
          {
            id: 'system',
            role: 'system',
            content: getAgentSystemPrompt({
              selectedModules: manualScope,
              routedModules: activeRoutedScope,
              promptMode: 'native-tools',
              customSystemPrompt: config.systemPrompt || '',
              modulePrompts,
              allowedActionTypes,
            }),
            timestamp: 0,
          },
          ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-6).map(toSafeChatMessage),
          toSafeChatMessage(userMessage),
        ];

        {
          let executedAction: AgentAction | undefined;

          const executeNativeToolCall = async (toolCall: ChatToolCall) => {
            const txId = startAgentToolTransaction(agentRunLogId, toolCall.name, toolCall.arguments || {});
            const visualToolId = crypto.randomUUID();
            const markToolEvent = (updates: Partial<AgentRuntimeToolVisualEvent>) => {
              setAgentRuntimeToolEvents(prev => prev.map(item => (
                item.id === visualToolId
                  ? { ...item, ...updates, durationMs: updates.durationMs ?? Date.now() - item.timestamp }
                  : item
              )));
            };
            setAgentRuntimeToolEvents(prev => [
              ...prev,
              {
                id: visualToolId,
                toolName: toolCall.name,
                status: 'running' as const,
                summary: '模型请求工具',
                timestamp: Date.now(),
              },
            ].slice(-MAX_RUNTIME_TOOL_EVENTS));
            pushDebugItem({
              stage: 'native:tool-call',
              summary: `模型请求工具：${toolCall.name}`,
              payload: {
                id: toolCall.id,
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
            });

            const registration = findToolRegistration(runtimeToolRegistry, toolCall.name);
            if (!registration) {
              markToolEvent({
                status: 'error',
                summary: `未知工具: ${toolCall.name}`,
              });
              pushDebugItem({
                stage: 'native:tool-result',
                summary: `未知工具：${toolCall.name}`,
                payload: { toolCall },
                level: 'error',
              });
              finishAgentToolTransaction(agentRunLogId, txId, { status: 'failed', error: `未知工具: ${toolCall.name}` });
              return { success: false, error: `未知工具: ${toolCall.name}` };
            }
            const visualMeta = getToolVisualMeta(registration);
            markToolEvent({ ...visualMeta, summary: '校验工具权限' });
            if (registration.module !== 'web' && activeRoutedScope.length > 0 && !activeRoutedScope.includes(registration.module)) {
              const moduleName = getModuleDisplayName(registration.module);
              const error = `工具 ${toolCall.name} 属于「${moduleName}」，不在当前作用域「${getModuleScopeLabel(activeRoutedScope)}」内。`;
              markToolEvent({
                ...visualMeta,
                moduleName,
                status: 'error',
                summary: error,
              });
              pushDebugItem({
                stage: 'native:tool-result',
                summary: error,
                payload: { toolCall, routedScope: activeRoutedScope },
                level: 'error',
              });
              finishAgentToolTransaction(agentRunLogId, txId, { status: 'failed', error });
              return { success: false, error };
            }
            if (!canUseToolRegistration(registration, toolPermissions)) {
              markToolEvent({
                ...visualMeta,
                status: 'error',
                summary: `工具未授权: ${toolCall.name}`,
              });
              pushDebugItem({
                stage: 'native:tool-result',
                summary: `工具未授权：${toolCall.name}`,
                payload: { toolCall },
                level: 'error',
              });
              finishAgentToolTransaction(agentRunLogId, txId, { status: 'failed', error: `工具未授权: ${toolCall.name}` });
              return { success: false, error: `工具未授权: ${toolCall.name}` };
            }

            try {
              const execution = await executeRegisteredToolWithSafety(registration, toolCall.arguments, toolExecContext);
              const result = execution.result;
              const moduleName = visualMeta.moduleName;
              executedAction = { type: toolCall.name, status: execution.executed ? 'success' : 'pending', data: execution.executed ? toolCall.arguments : result };
              const pendingConfirmation = execution.pendingConfirmation || (
                result?.pendingConfirmation && result?.confirmationId
                  ? {
                      id: result.confirmationId,
                      type: result.confirmationType || 'send_email',
                      status: 'pending' as const,
                      data: result,
                      summary: result.message || '操作待确认',
                    }
                  : undefined
              );

              markToolEvent({
                ...visualMeta,
                moduleName,
                status: pendingConfirmation ? 'waiting' : result?.success === false ? 'error' : 'success',
                summary: summarizeRuntimeToolResult(result),
              });
              pushDebugItem({
                stage: 'native:tool-result',
                summary: `${toolCall.name} 执行成功 [${moduleName}]`,
                payload: { input: toolCall.arguments, result },
                level: 'success',
              });
              finishAgentToolTransaction(agentRunLogId, txId, {
                status: pendingConfirmation ? 'waiting_approval' : result?.success === false ? 'failed' : 'success',
                result,
                error: result?.success === false ? result.error : undefined,
                snapshot: execution.undoSnapshot as any,
                confirmationId: pendingConfirmation?.id || result?.confirmationId,
              });
              return createAgentToolExecutionEnvelope(result, {
                undoSnapshot: execution.undoSnapshot,
                pendingConfirmation,
              });
            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              markToolEvent({
                ...visualMeta,
                status: 'error',
                summary: errMsg,
              });
              pushDebugItem({
                stage: 'native:tool-error-retry',
                summary: `${toolCall.name} 执行失败，错误回传模型`,
                payload: { input: toolCall.arguments, error: errMsg },
                level: 'error',
              });
              finishAgentToolTransaction(agentRunLogId, txId, { status: 'failed', error: errMsg });
              return { success: false, error: errMsg, hint: '请根据错误信息调整参数后重试' };
            }
          };

          const handleRuntimeTrace = (event: AgentTraceEvent) => {
            const stageText: Partial<Record<AgentTraceEvent['stage'], string>> = {
              planning: '正在规划任务...',
              decision: '正在决策工具...',
              execution: '正在调用工具...',
              verification: '正在检查结果...',
              inspection: '正在复核完成度...',
              reflection: '正在修正执行计划...',
              reporting: '正在整理结果...',
              approval: '等待用户确认...',
            };
            setAgentRuntimeStatus({
              stage: event.stage,
              status: event.status,
              title: event.title,
              active: event.status === 'started' || event.status === 'waiting',
            });
            setAgentRuntimeEvents(prev => [...prev, event].slice(-MAX_RUNTIME_VISUAL_EVENTS));
            appendAgentExecutionTrace(agentRunLogId, event);
            appendAgentExecutionEntry(agentRunLogId, {
              stage: `langgraph:${event.stage}`,
              level: event.status === 'error' ? 'error' : event.status === 'success' ? 'success' : 'info',
              message: event.title,
              payload: {
                detail: event.detail,
                status: event.status,
                payload: event.payload,
              },
            });
            pushDebugItem({
              stage: `langgraph:${event.stage}`,
              summary: event.title,
              payload: {
                detail: event.detail,
                status: event.status,
                payload: event.payload,
              },
              level: event.status === 'error' ? 'error' : event.status === 'success' ? 'success' : 'info',
            });
            if (event.status === 'started' && stageText[event.stage]) {
              setMessages(prev => prev.map(message =>
                message.id === assistantId
                  ? { ...message, content: stageText[event.stage] || message.content }
                  : message
              ));
            }
          };

          pushDebugItem({
            stage: 'native:request-context',
            summary: '准备逐步原生工具模式请求上下文',
            payload: {
              messages: chatMessages,
              tools: nativeTools,
            },
          });

          const supplementTools = async (input: {
            goal: string;
            finalText: string;
            toolCalls: ChatToolCall[];
            toolResults: Array<{ toolCall: ChatToolCall; result: any }>;
            currentTools: ChatTool[];
            evaluation: AgentCompletionEvaluation;
            supplementCount: number;
          }) => {
            if (manualScope.length > 0) {
              pushDebugItem({
                stage: 'router:supplement-skip',
                summary: '手动作用域已启用，跳过补充路由',
                payload: { manualScope, evaluation: input.evaluation },
              });
              return null;
            }

            setAgentRuntimeStatus({
              stage: 'reflection',
              status: 'started',
              title: '正在补充任务作用域',
              active: true,
            });
            setMessages(prev => prev.map(message =>
              message.id === assistantId
                ? { ...message, content: '正在补充任务作用域...' }
                : message
            ));

            const supplementalRoute = await detectSupplementalModuleScope({
              goal: input.goal,
              currentModules: activeRoutedScope,
              finalText: input.finalText,
              toolCalls: input.toolCalls,
              toolResults: input.toolResults,
              evaluation: input.evaluation,
            });
            if (!supplementalRoute.needContinue || supplementalRoute.addModules.length === 0) {
              return null;
            }

            const nextScope = normalizeModuleScope([...activeRoutedScope, ...supplementalRoute.addModules]);
            const nextTools = buildNativeToolsForScope(nextScope, true);
            const currentToolNames = new Set(input.currentTools.map(tool => tool.name));
            const addedToolNames = nextTools
              .map(tool => tool.name)
              .filter(toolName => !currentToolNames.has(toolName));
            if (addedToolNames.length === 0) {
              pushDebugItem({
                stage: 'router:supplement-skip',
                summary: '补充模块没有新增可用工具',
                payload: { supplementalRoute, nextScope, nextToolNames: nextTools.map(tool => tool.name) },
              });
              return null;
            }

            activeRoutedScope = nextScope;
            pushDebugItem({
              stage: 'router:supplement-applied',
              summary: `补充作用域已应用：${getModuleScopeLabel(supplementalRoute.addModules)}`,
              payload: {
                supplementalRoute,
                activeRoutedScope,
                addedToolNames,
                supplementCount: input.supplementCount + 1,
              },
              level: 'success',
            });
            appendAgentExecutionEntry(agentRunLogId, {
              stage: 'router:supplement-applied',
              level: 'info',
              message: `补充作用域：${getModuleScopeLabel(supplementalRoute.addModules)}`,
              payload: { supplementalRoute, activeRoutedScope, addedToolNames },
            });

            return {
              tools: nextTools,
              addedModules: supplementalRoute.addModules,
              message: [
                `新增作用域：${getModuleScopeLabel(supplementalRoute.addModules)}`,
                `当前完整作用域：${getModuleScopeLabel(activeRoutedScope)}`,
                `原因：${supplementalRoute.reason}`,
              ].join('\n'),
            };
          };

          const runtime = createAgentRuntime({
            chatService: chatServiceRef.current,
            messages: chatMessages,
            tools: nativeTools,
            goal: userMessage.content,
            runId: agentRunLogId,
            maxIterations: 10,
            executeToolCall: executeNativeToolCall,
            getToolRisk: (toolCall: ChatToolCall) => {
              const registration = findToolRegistration(runtimeToolRegistry, toolCall.name);
              if (!registration) return 'write';
              return getToolPermissionTarget(registration).action === 'read' ? 'read' : 'write';
            },
            evaluateCompletion: evaluateAgentCompletion,
            supplementTools,
            maxSupplementRoutes: 2,
            onTrace: handleRuntimeTrace,
            onDebugEvent: pushServiceDebugEvent,
          });
          const runtimeResult = await runtime.run();
          pushDebugItem({
            stage: 'native:done',
            summary: '逐步原生工具模式执行完成',
            payload: {
              toolCalls: runtimeResult.toolCalls,
              finalText: runtimeResult.text,
              error: runtimeResult.error,
            },
            level: runtimeResult.status === 'failed' ? 'error' : 'success',
          });
          finalizeAgentExecutionLog(agentRunLogId, {
            status: (runtimeResult.pendingConfirmations?.length || 0) > 0 || runtimeResult.status === 'needs_user' ? 'needs_user' : runtimeResult.status === 'failed' ? 'failed' : 'completed',
            finalText: runtimeResult.text,
            error: runtimeResult.error,
          });

          const inferredModules = normalizeModuleScope(runtimeResult.toolCalls
            .map(call => getModuleByToolName(runtimeToolRegistry, call.name))
            .filter(Boolean));
          const displayModules = inferredModules.length > 0 ? inferredModules : activeRoutedScope;
          const runtimePendingConfirmation = runtimeResult.pendingConfirmations?.[runtimeResult.pendingConfirmations.length - 1] as PendingConfirmation | undefined;
          const runtimeUndoSnapshot = runtimeResult.undoSnapshots?.[runtimeResult.undoSnapshots.length - 1] as UndoSnapshot | undefined;

          setMessages(prev => prev.map(message =>
            message.id === assistantId
              ? {
                  ...message,
                  content: runtimeResult.text || (runtimeResult.error ? `❌ 发生错误: ${runtimeResult.error}` : generateToolCallSummary(runtimeResult.toolCalls)),
                  action: executedAction,
                  targetModule: displayModules[0],
                  targetModules: displayModules.length > 0 ? displayModules : undefined,
                  undoSnapshot: runtimeUndoSnapshot,
                  pendingConfirmation: runtimePendingConfirmation,
                }
              : message
          ));
          setAgentRuntimeStatus({
            stage: runtimePendingConfirmation || runtimeResult.status === 'needs_user' ? 'approval' : runtimeResult.status === 'failed' ? 'error' : 'reporting',
            status: runtimePendingConfirmation || runtimeResult.status === 'needs_user' ? 'waiting' : runtimeResult.status === 'failed' ? 'error' : 'success',
            title: runtimePendingConfirmation || runtimeResult.status === 'needs_user' ? '等待用户确认或补充' : runtimeResult.status === 'failed' ? 'Agent 执行失败' : 'Agent 执行完成',
            active: Boolean(runtimePendingConfirmation || runtimeResult.status === 'needs_user'),
          });
          setIsProcessing(false);
          return;
        }
      }

      // Fallback 模式沿用同一作用域结果
      const fallbackScope = activeRoutedScope.length > 0
        ? activeRoutedScope
        : normalizeModuleScope([parseIntentLocally(trimmedInput).suggestedModule]);
      setAgentRuntimeStatus({
        stage: 'execution',
        status: 'started',
        title: '兼容模式执行中',
        active: true,
      });
      const fallbackReason = !supportsNativeTools
        ? `当前提供商「${config.provider}」暂未接入本应用的逐步 Function Calling runtime。`
        : nativeTools.length === 0
          ? [
              '本轮没有可用工具。',
              effectiveWebSearchEnabled
                ? '可能是自动路由未命中可执行模块，或权限中心没有开启对应工具。'
                : '如果需要联网搜索，请同时打开右侧联网开关，并在权限中心开启「联网 / 读取」。',
            ].join('')
          : '逐步工具 runtime 未启动。';
      await runFallbackConversation(assistantId, userMessage, fallbackScope, fallbackReason);
      finalizeAgentExecutionLog(agentRunLogId, {
        status: 'completed',
        finalText: '兼容模式执行完成',
      });
      setAgentRuntimeStatus({
        stage: 'idle',
        status: 'idle',
        title: 'Agent 空闲',
        active: false,
      });
    } catch (error) {
      finalizeAgentExecutionLog(agentRunLogId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      pushDebugItem({
        stage: 'send:error',
        summary: '本轮执行失败',
        payload: { error: error instanceof Error ? error.message : String(error) },
        level: 'error',
      });
      setMessages(prev => prev.map(message =>
        message.id === assistantId
          ? { ...message, content: `❌ 发生错误: ${error instanceof Error ? error.message : String(error)}` }
          : message
      ));
      setAgentRuntimeStatus({
        stage: 'error',
        status: 'error',
        title: error instanceof Error ? error.message : String(error),
        active: false,
      });
      setIsProcessing(false);
    }
  }, [
    allowedActionTypes,
    buildToolExecContext,
    config.apiKey,
    config.model,
    config.provider,
    config.systemPrompt,
    detectModuleScope,
    detectSupplementalModuleScope,
    effectiveDataPermissions,
    effectiveWebSearchEnabled,
    enabledAgentModules,
    evaluateAgentCompletion,
    executeRegisteredToolWithSafety,
    fileRecords,
    inputValue,
    isProcessing,
    knowledgeBaseFileIds,
    messages,
    notes,
    ojHeatmapData,
    onAddCategory,
    onCreateOJSubmission,
    onCreateRecurring,
    onCreateTodo,
    onCreateNote,
    onCreatePrompt,
    onCreateMarkdownNote,
    onCreateResource,
    onDeleteNote,
    onDeleteRecurring,
    onDeleteResource,
    onDeleteTodo,
    onUpdateNote,
    onUpdateRecurring,
    onUpdateRecurringCategories,
    onUpdateResource,
    onUpdateTodo,
    pendingAttachments,
    promptCategories,
    pushDebugItem,
    pushServiceDebugEvent,
    recurringCategories,
    recurringEvents,
    resourceData,
    runFallbackConversation,
    searchConfig,
    selectedModules,
    supportsNativeTools,
    todoCategories,
    toolPermissions,
    toolRegistry,
  ]);

  const clearHistory = () => {
    setMessages([
      createAgentWelcomeMessage('👋 对话已经清空。\n\n你可以重新选择作用域，或者直接告诉我你想做什么。'),
    ]);
    clearAgentHistory();
    setDebugItems([]);
    setAgentRuntimeEvents([]);
    setAgentRuntimeToolEvents([]);
    setAgentRuntimeStatus({
      stage: 'idle',
      status: 'idle',
      title: 'Agent 空闲',
      active: false,
    });
  };

  const handleClearHistory = () => {
    setShowClearConfirm(true);
  };

  const confirmClearHistory = () => {
    setShowClearConfirm(false);
    clearHistory();
    pushDebugItem({
      stage: 'history:clear',
      summary: '用户手动清空了对话历史',
      level: 'info',
    });
  };

  const handleAbort = useCallback(() => {
    chatServiceRef.current?.abort();
    const runningTexts = new Set([
      '正在处理任务...',
      '正在判断任务归属...',
      '正在规划任务...',
      '正在调用工具...',
      '正在检查结果...',
      '正在修正执行计划...',
      '正在整理结果...',
      '等待用户确认...',
    ]);
    const abortMapper = (msg: AgentMessage) =>
      runningTexts.has(msg.content)
        ? { ...msg, content: '⏹ 已终止执行。' }
        : msg;
    setMessages(prev => prev.map(abortMapper));
    setIsProcessing(false);
    setAgentRuntimeStatus({
      stage: 'idle',
      status: 'idle',
      title: '执行已终止',
      active: false,
    });
    pushDebugItem({
      stage: 'send:aborted',
      summary: '用户手动终止了当前执行',
      level: 'info',
    });
  }, [pushDebugItem]);

  const handleDeleteMessage = (messageId: string) => {
    if (messageId === 'welcome') {
      return;
    }

    setMessages(prev => {
      const filtered = prev.filter(msg => msg.id !== messageId);
      if (filtered.length === 0) {
        return [createAgentWelcomeMessage('👋 对话已清空，你可以开始新的任务。')];
      }
      return filtered;
    });

    pushDebugItem({
      stage: 'history:delete-message',
      summary: '删除了一条历史消息',
      payload: { messageId },
      level: 'info',
    });
  };

  const handleUndo = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.undoSnapshot) return;
    const snap = msg.undoSnapshot;
    try {
      await restoreAgentUndoSnapshot(snap, {
        onCreateTodo,
        onUpdateTodo,
        onCreateNote,
        onUpdateNote,
        onCreateResource,
        onUpdateResource,
        onUpdateOJHeatmapData,
        onSaveSSH,
        onSaveAPI,
        onCreateRecurring,
        onUpdateRecurring,
      });
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, content: m.content + '\n\n↩️ 已回退此操作。', undoSnapshot: undefined }
          : m
      ));
      pushDebugItem({
        stage: 'undo:executed',
        summary: `回退操作: ${snap.label}`,
        payload: snap,
        level: 'info',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, content: m.content + `\n\n⚠️ 回退失败：${errMsg}` }
          : m
      ));
      pushDebugItem({
        stage: 'undo:error',
        summary: `回退失败: ${errMsg}`,
        payload: snap,
        level: 'error',
      });
    }
  }, [
    messages,
    onCreateTodo,
    onUpdateTodo,
    onCreateNote,
    onUpdateNote,
    onCreateResource,
    onUpdateResource,
    onSaveSSH,
    onSaveAPI,
    onCreateRecurring,
    onUpdateRecurring,
    pushDebugItem,
  ]);

  const handleConfirmAction = useCallback(async (messageId: string, payload?: { secretValue?: string }) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.pendingConfirmation || msg.pendingConfirmation.status !== 'pending') return;

    const pc = msg.pendingConfirmation;
    if (pc.type === 'local_secret') {
      const secretValue = payload?.secretValue || '';
      if (!secretValue) {
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? { ...m, content: `${m.content}\n\n❌ 保存失败：请输入本地密钥或密码。` }
            : m
        ));
        return;
      }

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              pendingConfirmation: { ...pc, status: 'processing' },
              action: { ...(m.action || { type: pc.data.toolName || 'local_secret' }), type: m.action?.type || pc.data.toolName || 'local_secret', status: 'pending' },
            }
          : m
      ));

      try {
        if (pc.data.operation === 'update_api_record_secret') {
          const targetId = String(pc.data.targetId || '');
          if (!targetId) throw new Error('缺少 API 记录 ID');
          onSaveAPI({ id: targetId, apiKey: secretValue.trim() });
        } else if (pc.data.operation === 'update_website_record_password') {
          const targetId = String(pc.data.targetId || '');
          if (!targetId) throw new Error('缺少网站记录 ID');
          const storageKey = 'linkmaster_passwords_v1';
          const records = JSON.parse(localStorage.getItem(storageKey) || '[]') as Array<Record<string, any>>;
          const nextRecords = records.map(record =>
            record.id === targetId
              ? { ...record, password: secretValue, updatedAt: Date.now() }
              : record
          );
          if (!records.some(record => record.id === targetId)) throw new Error('未找到对应网站记录');
          localStorage.setItem(storageKey, JSON.stringify(nextRecords));
          window.dispatchEvent(new CustomEvent('guyue-password-manager-updated'));
        } else {
          throw new Error(`不支持的本地密钥操作：${pc.data.operation || 'unknown'}`);
        }

        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n✅ 已在本地保存，不会回传给模型。`,
                action: { ...(m.action || { type: pc.data.toolName || 'local_secret' }), type: m.action?.type || pc.data.toolName || 'local_secret', status: 'success' },
                pendingConfirmation: { ...pc, status: 'confirmed' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:local-secret', summary: `本地密钥已保存：${pc.data.targetLabel || pc.data.targetId}`, payload: { operation: pc.data.operation, targetId: pc.data.targetId }, level: 'success' });
        setAgentRuntimeStatus({
          stage: 'reporting',
          status: 'success',
          title: '本地保存已完成',
          active: false,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n❌ 保存失败：${errMsg}`,
                action: m.action ? { ...m.action, status: 'error', error: errMsg } : m.action,
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:local-secret', summary: `本地密钥保存失败: ${errMsg}`, payload: { operation: pc.data.operation }, level: 'error' });
        setAgentRuntimeStatus({
          stage: 'error',
          status: 'error',
          title: errMsg,
          active: false,
        });
      }
      return;
    }

    if (pc.type === 'agent_tool') {
      const toolName = pc.data.toolName;
      const args = pc.data.arguments || {};
      const registration = typeof toolName === 'string'
        ? findToolRegistration(toolRegistry, toolName)
        : undefined;

      if (!registration) {
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n❌ 确认失败：未知工具 ${toolName || ''}`,
                action: m.action ? { ...m.action, status: 'error', error: `未知工具 ${toolName || ''}` } : m.action,
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        return;
      }

      if (!canUseToolRegistration(registration, toolPermissions)) {
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n❌ 确认失败：工具未授权 ${toolName}`,
                action: m.action ? { ...m.action, status: 'error', error: `工具未授权 ${toolName}` } : m.action,
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        return;
      }

      try {
        const context = buildToolExecContext(msg.attachments);
        const execution = await executeRegisteredToolWithSafety(registration, args, context, { confirmed: true });
        if (execution.result?.success === false) {
          throw new Error(execution.result.error || '工具执行失败');
        }
        const snapshot = (pc.data.snapshot as UndoSnapshot | undefined) || execution.undoSnapshot;
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n✅ 已确认并执行：${pc.data.actionLabel || toolName}`,
                action: { type: toolName, status: 'success', data: execution.result },
                pendingConfirmation: { ...pc, status: 'confirmed' },
                ...(snapshot ? { undoSnapshot: snapshot } : {}),
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:agent-tool', summary: `已确认执行 ${toolName}`, payload: { args, result: execution.result }, level: 'success' });
        setAgentRuntimeStatus({
          stage: 'reporting',
          status: 'success',
          title: '确认操作已完成',
          active: false,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content}\n\n❌ 执行失败：${errMsg}`,
                action: m.action ? { ...m.action, status: 'error', error: errMsg } : m.action,
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:agent-tool', summary: `${toolName} 执行失败: ${errMsg}`, payload: { args }, level: 'error' });
        setAgentRuntimeStatus({
          stage: 'error',
          status: 'error',
          title: errMsg,
          active: false,
        });
      }
      return;
    }

    if (pc.type === 'send_email') {
      // 邮件发送是异步 IPC，先进入 processing，防止重复点击确认按钮。
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
              ...m,
              content: withEmailSendingLine(m.content),
              action: {
                ...(m.action || { type: 'send_email' }),
                type: m.action?.type || 'send_email',
                status: 'pending',
              },
              pendingConfirmation: { ...pc, status: 'processing' },
            }
          : m
      ));

      try {
        const configStr = localStorage.getItem('linkmaster_email_config');
        if (!configStr) throw new Error('邮箱未配置');
        const emailCfg: EmailConfig = JSON.parse(configStr);
        const sendConfig = { ...emailCfg, recipient: pc.data.recipient };
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.sendEmail) throw new Error('发送邮件功能不可用（非桌面端）');

        const result = await electronAPI.sendEmail({
          config: sendConfig,
          subject: pc.data.subject,
          content: pc.data.fullContent,
        });

        if (!result.success) throw new Error(result.error || '发送失败');

        const successLine = `✅ 邮件已成功发送至 ${pc.data.recipientDisplay || pc.data.recipient}`;
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: withEmailFinalLine(m.content, successLine),
                action: {
                  ...(m.action || { type: 'send_email' }),
                  type: m.action?.type || 'send_email',
                  status: 'success',
                  data: { ...(m.action?.data || {}), result },
                },
                pendingConfirmation: { ...pc, status: 'confirmed' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:send-email', summary: `邮件已发送至 ${pc.data.recipient}`, payload: pc.data, level: 'success' });
        setAgentRuntimeStatus({
          stage: 'reporting',
          status: 'success',
          title: '确认操作已完成',
          active: false,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorLine = `❌ 发送失败：${errMsg}`;
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: withEmailFinalLine(m.content, errorLine),
                action: {
                  ...(m.action || { type: 'send_email' }),
                  type: m.action?.type || 'send_email',
                  status: 'error',
                  error: errMsg,
                },
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:send-email', summary: `邮件发送失败: ${errMsg}`, payload: pc.data, level: 'error' });
        setAgentRuntimeStatus({
          stage: 'error',
          status: 'error',
          title: errMsg,
          active: false,
        });
      }
    }
  }, [buildToolExecContext, executeRegisteredToolWithSafety, messages, onSaveAPI, pushDebugItem, toolPermissions, toolRegistry]);

  const handleCancelAction = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.pendingConfirmation?.status === 'pending'
        ? {
            ...m,
            content: m.content + `\n\n🚫 已取消${m.pendingConfirmation?.type === 'send_email' ? '发送' : m.pendingConfirmation?.type === 'local_secret' ? '本地保存' : '执行'}。`,
            action: m.action
              ? { ...m.action, status: 'error', error: m.pendingConfirmation?.type === 'send_email' ? '用户取消发送' : m.pendingConfirmation?.type === 'local_secret' ? '用户取消本地保存' : '用户取消执行' }
              : m.action,
            pendingConfirmation: { ...m.pendingConfirmation!, status: 'cancelled' },
          }
        : m
    ));
    setAgentRuntimeStatus({
      stage: 'idle',
      status: 'idle',
      title: '确认操作已取消',
      active: false,
    });
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const serializeDebugPayload = (payload: any): string => {
    try {
      const text = JSON.stringify(payload, null, 2);
      if (text.length > 14000) {
        return `${text.slice(0, 14000)}\n...（已截断）`;
      }
      return text;
    } catch {
      return String(payload);
    }
  };

  if (!isOpen && isOpen !== undefined) return null;

  return (
    <div
      className="flex-1 flex flex-col h-full w-full overflow-hidden" style={{ background: 'var(--t-bg-main)' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-500/10 border-2 border-blue-400 border-dashed backdrop-blur-sm pointer-events-none">
              <Paperclip className="w-10 h-10 text-blue-400 mb-3" />
              <p className="text-blue-500 font-semibold text-base">松开鼠标上传文件</p>
              <p className="text-blue-400 text-sm mt-1">支持图片、PDF、文本等格式</p>
            </div>
          )}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 min-h-0 flex flex-col" style={{ background: 'var(--t-bg-main)' }}>
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-4"
                style={{ overflowAnchor: 'none' }}
              >
                {messages.map(message => (
                  <MessageErrorBoundary key={message.id}>
                    <MessageBubble
                      message={message}
                      onDelete={handleDeleteMessage}
                      onUndo={handleUndo}
                      onConfirm={handleConfirmAction}
                      onCancelConfirm={handleCancelAction}
                    />
                  </MessageErrorBoundary>
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>处理中...</span>
                  </div>
                )}
              </div>

              <div className="shrink-0 px-5 py-4 border-t space-y-3" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-main)' }}>
                {selectedModules.length > 0 ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedModules.map(moduleId => {
                      const module = getModuleById(moduleId);
                      if (!module) return null;
                      const Icon = module.icon;
                      return (
                        <div key={module.id} className="text-xs rounded-full px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {module.name}
                        </div>
                      );
                    })}
                    <button onClick={() => setSelectedModules([])} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">✕ 清除作用域</button>
                  </div>
                ) : null}

                <div className="rounded-[24px] border px-4 py-3 transition-colors focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100" style={{ borderColor: 'var(--t-input-border)', background: 'var(--t-input-bg)' }}>
                  {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {pendingAttachments.map((att, idx) => (
                        <div key={idx} className="relative group flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs text-gray-600">
                          {att.type === 'image' ? (
                            <img src={`data:${att.mimeType};base64,${att.base64}`} alt={att.name} className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="max-w-[120px] truncate">{att.name}</span>
                          <button
                            onClick={() => handleRemoveAttachment(idx)}
                            className="ml-1 w-4 h-4 rounded-full bg-gray-200 hover:bg-red-400 hover:text-white flex items-center justify-center text-gray-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white/70 flex items-center gap-2 shrink-0"
                      title={agentRuntimeStatus.title}
                    >
                      <span className={`relative w-3 h-3 rounded-full ring-4 ${getAgentRuntimeIndicatorClass(agentRuntimeStatus)}`}>
                        {agentRuntimeStatus.active && (
                          <span className="absolute inset-0 rounded-full bg-current opacity-40 animate-ping" />
                        )}
                      </span>
                      <span className="hidden sm:inline text-[11px] font-medium text-slate-500 min-w-[24px]">
                        {AGENT_RUNTIME_STAGE_LABELS[agentRuntimeStatus.stage]}
                      </span>
                    </div>
                    <button
                      onClick={handleAddAttachment}
                      disabled={isProcessing || !config.apiKey}
                      className="w-9 h-9 rounded-xl hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-gray-500 transition-colors shrink-0"
                      title="上传文件或图片"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={config.apiKey ? '描述你想完成的任务...' : '请先在设置中配置 API Key'}
                      className="flex-1 bg-transparent placeholder-gray-400 outline-none text-[15px]" style={{ color: 'var(--t-text)' }}
                      disabled={isProcessing || !config.apiKey}
                    />
                    {isProcessing ? (
                      <button
                        onClick={handleAbort}
                        className="w-11 h-11 rounded-2xl bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors shrink-0"
                        title="终止执行"
                      >
                        <StopCircle className="w-5 h-5" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={(!inputValue.trim() && pendingAttachments.length === 0) || !config.apiKey}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-colors shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {/* 作用域选择 */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => { setShowModuleSelector(v => !v); setShowPermissions(false); }}
                        className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
                          selectedModules.length > 0
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                            : showModuleSelector
                              ? 'text-slate-700 bg-slate-100'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="选择 Agent 作用域"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        {selectedModules.length > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] leading-4 text-center">
                            {selectedModules.length}
                          </span>
                        )}
                      </button>
                      {showModuleSelector && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowModuleSelector(false)} />
                          <div className="absolute bottom-full right-0 mb-2 z-50 w-72 max-w-[calc(100vw-2rem)] max-h-[min(70vh,520px)] rounded-2xl shadow-xl border overflow-hidden py-1.5 flex flex-col" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                            <div className="px-3 py-1.5 flex items-center justify-between shrink-0 border-b" style={{ borderColor: 'var(--t-border)' }}>
                              <div>
                                <p className="text-[11px] font-semibold text-gray-500">Agent 作用域</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">不选则自动路由</p>
                              </div>
                              {selectedModules.length > 0 && (
                                <button onClick={() => setSelectedModules([])} className="text-[10px] text-gray-400 hover:text-gray-600">清除</button>
                              )}
                            </div>
                            <div className="min-h-0 overflow-y-auto py-1">
                              {agentModules.map((module) => {
                                const Icon = module.icon;
                                const isSelected = selectedModules.includes(module.id);
                                return (
                                  <button
                                    key={module.id}
                                    onClick={() => handleModuleClick(module.id)}
                                    disabled={!module.enabled}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                                      isSelected
                                        ? 'bg-blue-50 text-blue-600'
                                        : module.enabled
                                          ? 'text-gray-700 hover:bg-gray-50'
                                          : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                  >
                                    <Icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-xs font-medium shrink-0">{module.name}</span>
                                    <span className="text-[10px] text-gray-400 truncate">{module.description}</span>
                                    {isSelected && <CheckCircle2 className="w-3 h-3 ml-auto text-blue-500 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-center" style={{ color: 'var(--t-text-muted)' }}>
                  {config.apiKey
                    ? `✨ ${config.provider} · ${currentModels.find(model => model.id === config.model)?.name || config.model} · ${supportsNativeTools ? '原生 Function Calling' : '兼容模式'}`
                    : '⚙️ 点击右上角设置完成模型配置'}
                  {' · '}按 Enter 发送
                </p>
              </div>
            </div>

            {/* 执行过程可视化面板 */}
            {!compact && !isExecutionVizCollapsed && (
              <AgentExecutionProcessPanel
                status={agentRuntimeStatus}
                events={agentRuntimeEvents}
                toolEvents={agentRuntimeToolEvents}
                onClear={() => {
                  setAgentRuntimeEvents([]);
                  setAgentRuntimeToolEvents([]);
                }}
              />
            )}

            {/* 调试内容面板 */}
            {!compact && !isDebugCollapsed && (
              <div className="shrink-0 w-[310px] border-l flex flex-col min-h-0 overflow-hidden" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-secondary)' }}>
                <div className="shrink-0 border-b flex items-center justify-between px-3" style={{ minHeight: '48px', borderColor: 'var(--t-border)', background: 'var(--t-header-bg)' }}>
                  <div className="flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5 text-slate-500" />
                    <p className="text-xs font-semibold text-slate-600">调试</p>
                    {debugItems.length > 0 && (
                      <span className="text-[10px] text-slate-400">({debugItems.length})</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setDebugItems([]); setExpandedDebugIds(new Set()); }}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="清空调试信息"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {debugItems.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-6">暂无调试数据</div>
                  ) : (() => {
                    // 按 turnId 分组（保持插入顺序）
                    const groups: Array<{ turnId: string; turnIndex: number; items: AgentDebugItem[] }> = [];
                    for (const item of debugItems) {
                      const tid = item.turnId || '__root__';
                      const tidx = item.turnIndex ?? 0;
                      const last = groups[groups.length - 1];
                      if (!last || last.turnId !== tid) {
                        groups.push({ turnId: tid, turnIndex: tidx, items: [item] });
                      } else {
                        last.items.push(item);
                      }
                    }
                    return groups.map(({ turnId, turnIndex, items }) => {
                      const tc = TURN_COLORS[turnIndex % TURN_COLORS.length];
                      return (
                        <div key={turnId}>
                          {/* 轮次标题 */}
                          <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tc.badge}`}>
                              第 {turnIndex + 1} 轮
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(items[0].timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          {/* 步骤列表 */}
                          <div className="space-y-1 pl-1">
                            {items.map((item) => {
                              const isExpanded = expandedDebugIds.has(item.id);
                              const hasPayload = item.payload !== undefined;
                              return (
                                <div
                                  key={item.id}
                                  className={`rounded-xl border border-l-[3px] ${tc.borderL} ${
                                    item.level === 'error'
                                      ? 'border-red-200 bg-red-50/60'
                                      : item.level === 'success'
                                        ? 'border-emerald-100 bg-emerald-50/40'
                                        : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <div
                                    className={`flex items-start justify-between gap-2 p-2.5 ${hasPayload ? 'cursor-pointer select-none' : ''}`}
                                    onClick={() => {
                                      if (!hasPayload) return;
                                      setExpandedDebugIds(prev => {
                                        const next = new Set(prev);
                                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                        return next;
                                      });
                                    }}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className={`text-[11px] font-semibold block leading-tight ${tc.title}`}>{item.stage}</span>
                                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{item.summary}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </span>
                                      {hasPayload && (
                                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`} />
                                      )}
                                    </div>
                                  </div>
                                  {isExpanded && hasPayload && (
                                    <div className="px-2.5 pb-2.5">
                                      <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] leading-5 p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                                        {serializeDebugPayload(item.payload)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* 右侧竖向图标栏 */}
            <div className="shrink-0 w-10 border-l flex flex-col items-center py-2 gap-0.5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-header-bg)' }}>
              {/* ── 设置组 ── */}
              {/* 帮助 */}
              <button
                onClick={() => setShowHelp(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="帮助"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {/* 插件开发说明 */}
              <button
                onClick={() => setShowPluginDocs(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Agent 插件开发说明"
              >
                <FileText className="w-4 h-4" />
              </button>
              {/* 设置(齿轮) */}
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="API 设置"
              >
                <Settings className="w-4 h-4" />
              </button>
              {/* 网络搜索 */}
              <button
                onClick={() => {
                  if (!webSearchPermissionEnabled) {
                    setToolPermissions(prev => ({
                      ...prev,
                      web: {
                        ...(prev.web || DEFAULT_AGENT_TOOL_PERMISSIONS.web),
                        read: true,
                      },
                    }));
                    setEnableWebSearch(true);
                    return;
                  }
                  setEnableWebSearch(v => !v);
                }}
                className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  effectiveWebSearchEnabled
                    ? 'text-blue-600 bg-blue-50'
                    : enableWebSearch && !webSearchPermissionEnabled
                      ? 'text-amber-500 bg-amber-50'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title={
                  effectiveWebSearchEnabled
                    ? '关闭网络搜索'
                    : webSearchPermissionEnabled
                      ? '开启网络搜索'
                      : '联网搜索未授权，点击会同时开启联网权限'
                }
              >
                <Globe className="w-4 h-4" />
                {(effectiveWebSearchEnabled || (enableWebSearch && !webSearchPermissionEnabled)) && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${effectiveWebSearchEnabled ? 'bg-blue-500' : 'bg-amber-500'}`} />
                )}
              </button>
              <div className="w-5 h-px bg-slate-200 my-1" />
              {/* ── 权限组 ── */}
              {/* Agent 工具权限 */}
              <div className="relative">
                {(() => {
                  return (
                    <button
                      onClick={() => { setShowPermissions(v => !v); setShowModuleSelector(false); }}
                      className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                        enabledToolPermissionCount > 0
                          ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                      title="Agent 工具权限"
                    >
                      {enabledToolPermissionCount > 0 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {enabledToolPermissionCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                          {enabledToolPermissionCount}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {false && showPermissions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPermissions(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-[380px] rounded-2xl shadow-xl border overflow-hidden" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>Agent 工具权限</p>
                        <button
                          onClick={() => setAllToolPermissions(!allToolPermissionsEnabled)}
                          className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          {allToolPermissionsEnabled ? '全部关闭' : '全部开启'}
                        </button>
                      </div>
                      <div className="flex items-center px-4 pt-2.5 pb-1 text-[10px] text-gray-400 font-medium">
                        <span className="flex-1">模块</span>
                        {AGENT_CRUD_ACTIONS.map(action => (
                          <span key={action.key} className="w-10 text-center">{action.label}</span>
                        ))}
                        <span className="w-12 text-center">完全</span>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto pb-2">
                        {permissionModules
                          .filter(module => AGENT_CRUD_ACTIONS.some(action => isSupportedToolPermission(module.key, action.key)))
                          .map(module => {
                            const enabledFullActions = (['update', 'delete'] as AgentCrudAction[])
                              .filter(action => isSupportedToolPermission(module.key, action) && toolPermissions[module.key]?.[action]);
                            const fullEnabled = enabledFullActions.length > 0 && enabledFullActions.every(action => fullAccessPermissions[module.key]?.[action]);
                            return (
                          <div key={module.key} className="flex items-center gap-1 px-4 py-2 hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{module.label}</p>
                              <p className="text-[10px] text-gray-400 truncate">{module.desc}</p>
                            </div>
                            {AGENT_CRUD_ACTIONS.map(action => {
                              const supported = isSupportedToolPermission(module.key, action.key);
                              const enabled = Boolean(toolPermissions[module.key]?.[action.key]);
                              const activeClass = action.key === 'read'
                                ? 'bg-blue-500 text-white'
                                : action.key === 'create'
                                  ? 'bg-emerald-500 text-white'
                                  : action.key === 'update'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-rose-500 text-white';
                              if (!supported) {
                                return (
                                  <span key={action.key} className="w-8 h-7 rounded-lg flex items-center justify-center text-[11px] text-gray-200">
                                    -
                                  </span>
                                );
                              }
                              return (
                                <button
                                  key={action.key}
                                  onClick={() => toggleToolPermission(module.key, action.key)}
                                  className={`w-8 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold transition-colors ${
                                    enabled ? activeClass : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                                  }`}
                                  title={`${module.label} ${action.label}`}
                                >
                                  {action.label}
                                </button>
                              );
                            })}
                            <button
                              onClick={() => {
                                enabledFullActions.forEach(action => {
                                  if (fullAccessPermissions[module.key]?.[action] === fullEnabled) {
                                    toggleFullAccessPermission(module.key, action);
                                  }
                                });
                              }}
                              disabled={enabledFullActions.length === 0}
                              className={`w-10 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                fullEnabled
                                  ? 'bg-slate-900 text-white'
                                  : enabledFullActions.length > 0
                                    ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                    : 'bg-gray-50 text-gray-200 cursor-not-allowed'
                              }`}
                              title={enabledFullActions.length > 0 ? `${module.label} 修改/删除免确认` : `${module.label} 没有可设置完全权限的修改/删除工具`}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                            </button>
                          </div>
                            );
                          })}
                      </div>
                      {fullAccessPermissionCount > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-amber-600 bg-amber-50/60">
                          已开启 {fullAccessPermissionCount} 项完全权限：修改/删除会跳过确认，但仍保留撤销快照。
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="w-5 h-px bg-slate-200 my-1" />
              {/* 清空对话 */}
              <button
                onClick={handleClearHistory}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="删除对话历史"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {/* 执行过程 */}
              <button
                onClick={() => {
                  setIsExecutionVizCollapsed(v => !v);
                  setIsDebugCollapsed(true);
                }}
                className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  !isExecutionVizCollapsed ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title={isExecutionVizCollapsed ? '展开 Agent Console' : '收起 Agent Console'}
              >
                <Workflow className="w-4 h-4" />
                {agentRuntimeStatus.active && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
                {isExecutionVizCollapsed && !agentRuntimeStatus.active && (agentRuntimeEvents.length > 0 || agentRuntimeToolEvents.length > 0) && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {Math.min(9, agentRuntimeEvents.length + agentRuntimeToolEvents.length)}
                  </span>
                )}
              </button>
              {/* 调试 */}
              <button
                onClick={() => {
                  setIsDebugCollapsed(v => !v);
                  setIsExecutionVizCollapsed(true);
                }}
                className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  !isDebugCollapsed ? 'text-slate-700 bg-slate-100' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title={isDebugCollapsed ? '展开调试面板' : '收起调试面板'}
              >
                <Bug className="w-4 h-4" />
                {isDebugCollapsed && debugItems.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {debugItems.length > 9 ? '9+' : debugItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>

      <AgentSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={config}
        onChangeConfig={setConfig}
        routerConfig={routerConfig}
        onChangeRouterConfig={setRouterConfig}
        searchConfig={searchConfig}
        onChangeSearchConfig={setSearchConfig}
        onClearHistory={handleClearHistory}
        modules={enabledAgentModules.map(m => ({ id: m.id, name: m.name }))}
        modulePrompts={modulePrompts}
        onChangeModulePrompts={setModulePrompts}
        emailConfig={emailConfig}
        onChangeEmailConfig={setEmailConfig}
        onSaveEmailConfig={handleSaveEmailConfig}
        onTestEmail={handleTestEmail}
        emailTestStatus={emailTestStatus}
        emailTestError={emailTestError}
        contacts={contacts}
        onSaveContact={handleSaveContact}
        onDeleteContact={handleDeleteContact}
      />

      <AgentPermissionCenterModal
        isOpen={showPermissions}
        onClose={() => setShowPermissions(false)}
        capabilities={toolPermissionCapabilities}
        toolPermissions={toolPermissions}
        fullAccessPermissions={fullAccessPermissions}
        modules={permissionModules}
        allToolPermissionsEnabled={allToolPermissionsEnabled}
        enabledToolPermissionCount={enabledToolPermissionCount}
        fullAccessPermissionCount={fullAccessPermissionCount}
        onSetAllToolPermissions={setAllToolPermissions}
        onToggleToolPermission={toggleToolPermission}
        onToggleFullAccessPermission={toggleFullAccessPermission}
      />

      <AgentHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />

      <AgentPluginDocsModal
        isOpen={showPluginDocs}
        onClose={() => setShowPluginDocs(false)}
      />

      <ConfirmDialog
        isOpen={showClearConfirm}
        title="清空对话历史"
        message="确认删除所有 Agent 对话记录吗？此操作不可撤销。"
        confirmText="清空"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmClearHistory}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
};

/* ─── Agent 执行过程面板 ─── */

const formatRuntimeTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const AgentExecutionProcessPanel: React.FC<{
  status: AgentRuntimeStatusState;
  events: AgentTraceEvent[];
  toolEvents: AgentRuntimeToolVisualEvent[];
  onClear: () => void;
}> = ({ status, events, toolEvents, onClear }) => {
  const latestByStage = useMemo(() => {
    const map = new Map<AgentTraceEvent['stage'], AgentTraceEvent>();
    events.forEach(event => map.set(event.stage, event));
    return map;
  }, [events]);

  const visibleStages = AGENT_RUNTIME_VISUAL_STAGES.filter(stage =>
    stage !== 'error' || latestByStage.has('error') || status.stage === 'error',
  );

  const selectedToolNames = useMemo(() => {
    const names = new Set<string>();
    const addToolCall = (item: any) => {
      const name = typeof item?.name === 'string' ? item.name : typeof item?.toolName === 'string' ? item.toolName : '';
      if (name) names.add(name);
    };
    for (const event of events) {
      const payload = event.payload as any;
      if (Array.isArray(payload?.toolCalls)) payload.toolCalls.forEach(addToolCall);
      if (Array.isArray(payload?.pendingToolCalls)) payload.pendingToolCalls.forEach(addToolCall);
      if (Array.isArray(payload?.toolResults)) payload.toolResults.forEach((result: any) => addToolCall(result?.toolCall));
      if (payload?.observation?.toolName) names.add(payload.observation.toolName);
    }
    toolEvents.forEach(tool => names.add(tool.toolName));
    return Array.from(names);
  }, [events, toolEvents]);

  const recentEvents = events.slice(-10).reverse();
  const recentTools = toolEvents.slice(-8).reverse();
  const hasData = events.length > 0 || toolEvents.length > 0;
  const completedStageCount = visibleStages.filter(stage => latestByStage.get(stage)?.status === 'success').length;
  const waitingToolCount = toolEvents.filter(tool => tool.status === 'waiting').length;
  const failedToolCount = toolEvents.filter(tool => tool.status === 'error').length;
  const snapshotCount = events.reduce((count, event) => {
    const value = (event.payload as any)?.undoSnapshotCount;
    return count + (Number.isFinite(Number(value)) ? Number(value) : 0);
  }, 0);
  const pendingApprovalCount = Math.max(waitingToolCount, events.reduce((count, event) => {
    const value = (event.payload as any)?.pendingConfirmationCount;
    return count + (Number.isFinite(Number(value)) ? Number(value) : 0);
  }, 0));

  const consoleStatus = status.stage === 'idle'
    ? '等待任务'
    : status.status === 'error' || status.stage === 'error'
      ? '需要处理'
      : status.stage === 'approval' || status.status === 'waiting'
        ? '等待确认'
        : status.active
          ? '运行中'
          : '已完成';

  const phaseCards: Array<{ label: string; desc: string; stages: AgentTraceEvent['stage'][] }> = [
    { label: '路由/规划', desc: '确定作用域与工具范围', stages: ['planning', 'decision'] },
    { label: '执行', desc: '调用已授权函数', stages: ['execution'] },
    { label: '检查', desc: '校验结果与缺失项', stages: ['verification', 'inspection'] },
    { label: '汇报', desc: '整理最终答复', stages: ['reflection', 'reporting'] },
  ];

  const getPhaseTone = (phaseStages: AgentTraceEvent['stage'][]) => {
    const phaseEvents = phaseStages.map(stage => latestByStage.get(stage)).filter(Boolean) as AgentTraceEvent[];
    const isActive = phaseStages.includes(status.stage as AgentTraceEvent['stage']) && status.active;
    if (phaseEvents.some(event => event.status === 'error') || (phaseStages.includes('error') && status.stage === 'error')) {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    if (phaseEvents.some(event => event.status === 'waiting') || (isActive && status.status === 'waiting')) {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    if (isActive) return 'border-blue-200 bg-blue-50 text-blue-700';
    if (phaseEvents.length && phaseEvents.every(event => event.status === 'success' || event.status === 'skipped')) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    return 'border-slate-200 bg-white text-slate-500';
  };

  const getStageTone = (stage: Exclude<AgentRuntimeStatusStage, 'idle'>) => {
    const event = latestByStage.get(stage);
    const isActive = status.stage === stage && status.active;
    if (event?.status === 'error' || stage === 'error') {
      return { dot: 'bg-red-500 border-red-100 text-white', line: 'bg-red-200', card: 'border-red-100 bg-red-50/70', text: 'text-red-700' };
    }
    if (event?.status === 'waiting' || (status.stage === stage && status.status === 'waiting')) {
      return { dot: 'bg-amber-500 border-amber-100 text-white', line: 'bg-amber-200', card: 'border-amber-100 bg-amber-50/70', text: 'text-amber-700' };
    }
    if (isActive || event?.status === 'started') {
      return { dot: 'bg-blue-500 border-blue-100 text-white', line: 'bg-blue-200', card: 'border-blue-100 bg-blue-50/70', text: 'text-blue-700' };
    }
    if (event?.status === 'success') {
      return { dot: 'bg-emerald-500 border-emerald-100 text-white', line: 'bg-emerald-200', card: 'border-emerald-100 bg-emerald-50/70', text: 'text-emerald-700' };
    }
    if (event?.status === 'skipped') {
      return { dot: 'bg-slate-300 border-slate-100 text-white', line: 'bg-slate-200', card: 'border-slate-100 bg-slate-50', text: 'text-slate-500' };
    }
    return { dot: 'bg-white border-slate-200 text-slate-300', line: 'bg-slate-100', card: 'border-slate-100 bg-white', text: 'text-slate-400' };
  };

  const getToolTone = (tool: AgentRuntimeToolVisualEvent) => {
    if (tool.status === 'error') return 'border-red-100 bg-red-50/70 text-red-700';
    if (tool.status === 'waiting') return 'border-amber-100 bg-amber-50/70 text-amber-700';
    if (tool.status === 'running') return 'border-blue-100 bg-blue-50/70 text-blue-700';
    return 'border-emerald-100 bg-emerald-50/70 text-emerald-700';
  };

  return (
    <div className="shrink-0 w-[380px] border-l flex flex-col min-h-0 overflow-hidden" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-secondary)' }}>
      <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: 'var(--t-border)', background: 'var(--t-header-bg)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Workflow className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Agent Console</p>
              <p className="text-[11px] text-slate-400 truncate">可观察、可确认、可回退</p>
            </div>
          </div>
          <button
            onClick={onClear}
            disabled={!hasData}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-xl transition-colors ${
              hasData ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-200 cursor-not-allowed'
            }`}
            title="清空执行过程"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">当前状态</p>
              <div className="mt-1 flex items-center gap-2">
                <span className={`relative w-2.5 h-2.5 rounded-full ring-4 ${getAgentRuntimeIndicatorClass(status)}`}>
                  {status.active && <span className="absolute inset-0 rounded-full bg-current opacity-40 animate-ping" />}
                </span>
                <p className="text-base font-semibold text-slate-900">{consoleStatus}</p>
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-2.5 py-1.5 text-right">
              <p className="text-[10px] text-slate-400">节点</p>
              <p className="text-sm font-semibold text-slate-700">{status.stage === 'idle' ? '空闲' : AGENT_RUNTIME_STAGE_LABELS[status.stage]}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed line-clamp-2">
            {hasData ? status.title : '等待下一次 Agent 任务。'}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 px-2 py-2">
              <p className="text-[10px] text-slate-400">节点</p>
              <p className="text-sm font-semibold text-slate-700">{completedStageCount}/{visibleStages.length}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2">
              <p className="text-[10px] text-slate-400">函数</p>
              <p className="text-sm font-semibold text-slate-700">{selectedToolNames.length}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2">
              <p className="text-[10px] text-slate-400">确认</p>
              <p className="text-sm font-semibold text-slate-700">{pendingApprovalCount}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-2">
              <p className="text-[10px] text-slate-400">快照</p>
              <p className="text-sm font-semibold text-slate-700">{snapshotCount}</p>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-2">
          {phaseCards.map(phase => (
            <div key={phase.label} className={`rounded-2xl border px-3 py-2.5 ${getPhaseTone(phase.stages)}`}>
              <p className="text-xs font-semibold">{phase.label}</p>
              <p className="mt-0.5 text-[10px] opacity-75 line-clamp-1">{phase.desc}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-500">本次函数范围</p>
            <span className="text-[10px] text-slate-400">{selectedToolNames.length || '自动'}</span>
          </div>
          {selectedToolNames.length === 0 ? (
            <p className="text-xs text-slate-400 leading-relaxed">尚未产生工具决策。模型选择函数后会在这里列出实际进入执行链路的函数。</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selectedToolNames.slice(0, 12).map(name => (
                <span key={name} className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {name}
                </span>
              ))}
              {selectedToolNames.length > 12 && (
                <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1 text-[11px] font-medium text-slate-400">+{selectedToolNames.length - 12}</span>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-500">节点流转</p>
            <span className="text-[10px] text-slate-400 truncate max-w-[190px]">{status.title}</span>
          </div>
          <div className="space-y-2">
            {visibleStages.map((stage, index) => {
              const event = latestByStage.get(stage);
              const tone = getStageTone(stage);
              const isActive = status.stage === stage && status.active;
              return (
                <div key={stage} className="relative flex gap-2.5">
                  {index < visibleStages.length - 1 && (
                    <span className={`absolute left-[11px] top-7 bottom-[-12px] w-px ${tone.line}`} />
                  )}
                  <span className={`relative z-10 mt-1 w-5 h-5 rounded-full border-4 flex items-center justify-center ${tone.dot}`}>
                    {isActive ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : event?.status === 'success' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : event?.status === 'error' ? (
                      <AlertCircle className="w-3 h-3" />
                    ) : null}
                  </span>
                  <div className={`flex-1 min-w-0 rounded-xl border px-2.5 py-2 ${tone.card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-semibold ${tone.text}`}>{AGENT_RUNTIME_STAGE_LABELS[stage]}</p>
                      {event && <span className="text-[10px] text-slate-400 shrink-0">{formatRuntimeTimestamp(event.timestamp)}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 mt-0.5">{event?.title || '等待触发'}</p>
                    {event?.detail && <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2 mt-1">{event.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-500">工具调用</p>
            <span className={`text-[10px] ${failedToolCount > 0 ? 'text-red-500' : waitingToolCount > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
              {recentTools.length} 条
            </span>
          </div>
          {recentTools.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 py-5 text-center text-xs text-slate-400">暂无工具调用</div>
          ) : (
            <div className="space-y-1.5">
              {recentTools.map(tool => (
                <div key={tool.id} className={`rounded-xl border px-2.5 py-2 ${getToolTone(tool)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5">
                      {tool.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : tool.status === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : tool.status === 'waiting' ? <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                      <p className="text-xs font-semibold truncate">{tool.toolName}</p>
                    </div>
                    {tool.durationMs !== undefined && <span className="text-[10px] opacity-70 shrink-0">{tool.durationMs}ms</span>}
                  </div>
	                  <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-80">
	                    {tool.moduleName && <span className="rounded-md bg-white/70 px-1.5 py-0.5">{tool.moduleName}</span>}
	                    {tool.sourceLabel && <span className="rounded-md bg-white/70 px-1.5 py-0.5">{tool.sourceLabel}</span>}
	                    {tool.categoryLabel && <span className="rounded-md bg-white/70 px-1.5 py-0.5">{tool.categoryLabel}</span>}
	                    {tool.permissionLabel && <span className="rounded-md bg-white/70 px-1.5 py-0.5">{tool.permissionLabel}</span>}
	                    <span className="line-clamp-1">{tool.summary}</span>
	                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-500">最近轨迹</p>
            <span className="text-[10px] text-slate-400">{recentEvents.length} 条</span>
          </div>
          {recentEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 py-5 text-center text-xs text-slate-400">暂无运行轨迹</div>
          ) : (
            <div className="space-y-1.5">
              {recentEvents.map(event => (
                <div key={event.id} className="rounded-xl border border-slate-100 bg-white px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-slate-600">{AGENT_RUNTIME_STAGE_LABELS[event.stage]}</p>
                    <span className="text-[10px] text-slate-400">{formatRuntimeTimestamp(event.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{event.title}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

/* ─── 消息气泡组件 ─── */

const useUserAvatar = () => {
  const [avatar, setAvatar] = useState(() => localStorage.getItem('guyue_user_avatar') || '');
  useEffect(() => {
    const update = () => setAvatar(localStorage.getItem('guyue_user_avatar') || '');
    window.addEventListener('guyue_avatar_change', update);
    return () => window.removeEventListener('guyue_avatar_change', update);
  }, []);
  return avatar;
};

class MessageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): { hasError: boolean; error: string } {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.warn('[MessageBubble] 渲染异常:', error.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-xs text-red-400 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
          ⚠️ 消息渲染失败
        </div>
      );
    }
    return this.props.children;
  }
}

const formatAgentCardPayload = (value: unknown, maxLength = 260) => {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value || '');
  }
};

const MessageBubble: React.FC<{
  message: AgentMessage;
  onDelete?: (messageId: string) => void;
  onUndo?: (messageId: string) => void;
  onConfirm?: (messageId: string, payload?: { secretValue?: string }) => void;
  onCancelConfirm?: (messageId: string) => void;
}> = ({ message, onDelete, onUndo, onConfirm, onCancelConfirm }) => {
  const isUser = message.role === 'user';
  const targetModuleIds = message.targetModules?.length
    ? message.targetModules
    : message.targetModule
      ? [message.targetModule]
      : [];
  const targetModules = normalizeModuleScope(targetModuleIds).map(moduleId => {
    const module = getModuleById(moduleId);
    return module || { id: moduleId, name: getModuleDisplayName(moduleId) };
  }).filter(Boolean) as Array<Pick<AgentModule, 'id' | 'name'>>;
  const canDelete = message.id !== 'welcome';
  const pc = message.pendingConfirmation;
  const [localSecretValue, setLocalSecretValue] = useState('');
  const userAvatar = useUserAvatar();
  const snapshotLabel = (pc?.data?.snapshot as UndoSnapshot | undefined)?.label || message.undoSnapshot?.label || '';
  const toolArgumentsPreview = pc?.type === 'agent_tool'
    ? formatAgentCardPayload(pc.data.arguments || {})
    : '';
  const showRunCard = !isUser && (
    targetModules.length > 0 ||
    Boolean(message.action) ||
    Boolean(pc) ||
    Boolean(message.undoSnapshot)
  );
  
  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] px-4 py-3.5 ${
        isUser 
          ? 'bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 text-white rounded-2xl rounded-tr-sm shadow-[0_4px_24px_rgba(139,92,246,0.45)]' 
          : 'rounded-3xl shadow-sm'
      }`} style={!isUser ? { background: 'var(--t-bg-secondary)', color: 'var(--t-text)' } : undefined}>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {message.action && (() => {
            const actionLabels: Record<string, { icon: typeof ListTodo; label: string }> = {
              create_todo: { icon: ListTodo, label: '待办工具' },
              create_note: { icon: StickyNote, label: '便签工具' },
              create_prompt: { icon: Sparkles, label: '技能工具' },
              create_markdown_note: { icon: Pencil, label: '笔记工具' },
              create_oj_submission: { icon: Trophy, label: '做题记录' },
              create_resource: { icon: HardDrive, label: '资源工具' },
              create_ssh_record: { icon: Command, label: 'SSH 工具' },
              update_ssh_record: { icon: Command, label: 'SSH 工具' },
              delete_ssh_record: { icon: Command, label: 'SSH 工具' },
              create_api_record: { icon: Globe, label: 'API 工具' },
              update_api_record: { icon: Globe, label: 'API 工具' },
              delete_api_record: { icon: Globe, label: 'API 工具' },
              send_email: { icon: Mail, label: '邮件发送' },
              query_contacts: { icon: BookUser, label: '查询通讯录' },
              query_files: { icon: FolderOpen, label: '文件查询' },
              read_file: { icon: FileText, label: '读取文件' },
              query_images: { icon: Image, label: '图片查询' },
              upload_image: { icon: Image, label: '图片上传' },
              query_subtasks: { icon: ListTodo, label: '查询子任务' },
              create_subtask: { icon: ListTodo, label: '创建子任务' },
              update_subtask: { icon: ListTodo, label: '修改子任务' },
              delete_subtask: { icon: ListTodo, label: '删除子任务' },
            };
            const info = actionLabels[message.action.type] || { icon: ListTodo, label: '工具' };
            const ActionIcon = info.icon;
            return (
            <div className={`flex items-center gap-1.5 text-xs ${
              message.action.status === 'success' ? 'text-green-600' :
              message.action.status === 'error' ? 'text-red-500' :
              'text-amber-500'
            }`}>
              {message.action.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {message.action.status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              {message.action.status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <ActionIcon className="w-3.5 h-3.5" />
              <span>{info.label}</span>
            </div>
            );
          })()}

          {targetModules.length > 0 && !isUser && (
            <div className="flex items-center gap-1 flex-wrap">
              {targetModules.slice(0, 3).map(module => (
                <span key={module.id} className="inline-flex items-center rounded-full bg-white/80 text-gray-500 px-2 py-0.5 text-[11px] border border-gray-200">
                  {module.name}
                </span>
              ))}
              {targetModules.length > 3 && (
                <span className="inline-flex items-center rounded-full bg-white/80 text-gray-400 px-2 py-0.5 text-[11px] border border-gray-200">
                  +{targetModules.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {showRunCard && (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white/85 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  pc?.status === 'pending'
                    ? 'bg-amber-500'
                    : pc?.status === 'processing'
                      ? 'bg-blue-500 animate-pulse'
                      : message.action?.status === 'error'
                      ? 'bg-red-500'
                      : message.action?.status === 'pending'
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-emerald-500'
                }`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">
                    {pc?.status === 'pending'
                      ? '等待用户确认'
                      : pc?.status === 'processing'
                        ? '正在执行'
                        : message.action?.status === 'error'
                        ? '执行失败'
                        : message.action?.status === 'pending'
                          ? '正在执行'
                          : '执行结果'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {message.action?.type || pc?.data?.toolName || snapshotLabel || 'Agent 任务'}
                  </p>
                </div>
              </div>
              {message.undoSnapshot && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 border border-amber-100">
                  <Undo2 className="w-3 h-3" />
                  可撤回
                </span>
              )}
            </div>
            {targetModules.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {targetModules.slice(0, 4).map(module => (
                  <span key={module.id} className="inline-flex items-center rounded-lg bg-slate-50 text-slate-500 px-2 py-1 text-[10px] border border-slate-100">
                    {module.name}
                  </span>
                ))}
                {targetModules.length > 4 && (
                  <span className="inline-flex items-center rounded-lg bg-slate-50 text-slate-400 px-2 py-1 text-[10px] border border-slate-100">
                    +{targetModules.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.attachments.map((att, idx) => (
              att.type === 'image' ? (
                <img
                  key={idx}
                  src={`data:${att.mimeType};base64,${att.base64}`}
                  alt={att.name}
                  className="max-w-[200px] max-h-[160px] rounded-xl object-cover border border-white/20"
                />
              ) : (
                <div key={idx} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${
                  isUser ? 'bg-blue-500/30 text-blue-100' : 'bg-white border border-gray-200 text-gray-600'
                }`}>
                  <FileText className="w-4 h-4" />
                  <span className="max-w-[120px] truncate">{att.name}</span>
                </div>
              )
            ))}
          </div>
        )}

        <div className="text-sm leading-relaxed">
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        {/* 执行确认卡片 */}
        {pc && (
          <div className={`mt-3 rounded-2xl border p-3.5 shadow-sm ${
            pc.status === 'pending' ? 'border-amber-200 bg-amber-50/80' :
            pc.status === 'processing' ? 'border-blue-200 bg-blue-50/80' :
            pc.status === 'confirmed' ? 'border-green-200 bg-green-50/80' :
            'border-gray-200 bg-gray-50/80'
          }`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  pc.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  pc.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                  pc.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {pc.status === 'processing' ? <Loader2 className="w-4 h-4 animate-spin" /> : pc.type === 'send_email' ? <Mail className="w-4 h-4" /> : pc.type === 'local_secret' ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${
                    pc.status === 'pending' ? 'text-amber-800' :
                    pc.status === 'processing' ? 'text-blue-800' :
                    pc.status === 'confirmed' ? 'text-green-800' :
                    'text-gray-600'
                  }`}>
                    {pc.type === 'send_email'
                      ? (pc.status === 'pending' ? '邮件发送确认' : pc.status === 'processing' ? '邮件发送中' : pc.status === 'confirmed' ? '邮件已发送' : '邮件发送已取消')
                      : pc.type === 'local_secret'
                        ? (pc.status === 'pending' ? '本地密钥填写' : pc.status === 'processing' ? '本地保存中' : pc.status === 'confirmed' ? '本地已保存' : '本地保存已取消')
                        : (pc.status === 'pending' ? '工具执行确认' : pc.status === 'processing' ? '工具执行中' : pc.status === 'confirmed' ? '工具已执行' : '工具执行已取消')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">{pc.summary}</p>
                </div>
              </div>
              {snapshotLabel && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-[10px] font-medium text-amber-700 border border-amber-100">
                  <Undo2 className="w-3 h-3" />
                  已快照
                </span>
              )}
            </div>

            {pc.type === 'send_email' ? (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">收件人</span><span className="font-medium truncate">{pc.data.recipientDisplay || pc.data.recipient}</span></div>
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">主题</span><span className="font-medium">{pc.data.subject}</span></div>
                {pc.data.contentPreview && (
                  <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">正文</span><span className="text-gray-600 line-clamp-3">{pc.data.contentPreview}</span></div>
                )}
              </div>
            ) : pc.type === 'local_secret' ? (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">对象</span><span className="font-medium truncate">{pc.data.targetLabel || pc.data.targetId}</span></div>
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">字段</span><span className="font-mono text-[11px] text-slate-700">{pc.data.secretField || pc.data.secretKind}</span></div>
                {pc.status === 'pending' && (
                  <input
                    type="password"
                    value={localSecretValue}
                    onChange={e => setLocalSecretValue(e.target.value)}
                    placeholder={pc.data.secretKind === 'password' ? '在本地输入密码' : '在本地输入 API Key'}
                    className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">函数</span><span className="font-mono text-[11px] text-slate-700 truncate">{pc.data.toolName}</span></div>
                <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">操作</span><span className="font-medium">{pc.data.actionLabel || pc.data.toolName}</span></div>
                {snapshotLabel && (
                  <div className="grid grid-cols-[56px,1fr] gap-2"><span className="text-gray-500">回退点</span><span className="text-amber-700 line-clamp-2">{snapshotLabel}</span></div>
                )}
                {toolArgumentsPreview && toolArgumentsPreview !== '{}' && (
                  <div className="mt-2 rounded-xl bg-white/70 border border-slate-100 p-2">
                    <div className="mb-1 text-[10px] font-semibold text-slate-400">参数预览</div>
                    <pre className="text-[10px] leading-4 text-slate-600 whitespace-pre-wrap break-all max-h-28 overflow-auto">{toolArgumentsPreview}</pre>
                  </div>
                )}
              </div>
            )}

            {pc.status === 'pending' && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => onConfirm?.(message.id, pc.type === 'local_secret' ? { secretValue: localSecretValue } : undefined)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-sm"
                >
                  {pc.type === 'send_email' ? <Send className="w-3 h-3" /> : pc.type === 'local_secret' ? <Lock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  {pc.type === 'send_email' ? '发送' : pc.type === 'local_secret' ? '本地保存' : '执行'}
                </button>
                <button
                  onClick={() => onCancelConfirm?.(message.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-600 rounded-xl transition-colors border border-gray-200"
                >
                  <X className="w-3 h-3" />
                  {pc.type === 'local_secret' ? (pc.data.secretKind === 'password' ? '不保存密码' : '不保存密钥') : '取消'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className={`flex items-center justify-between mt-2`}>
          <div className={`text-xs ${isUser ? 'text-blue-100' : ''}`} style={!isUser ? { color: 'var(--t-text-muted)' } : undefined}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="flex items-center gap-1">
            {message.undoSnapshot && onUndo && (
              <button
                onClick={() => onUndo(message.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-amber-600 hover:bg-amber-50 transition-colors"
                title={`回退: ${message.undoSnapshot.label}`}
              >
                <Undo2 className="w-3 h-3" />
                <span>撤销</span>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete?.(message.id)}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                  isUser
                    ? 'text-blue-200 hover:text-white hover:bg-blue-500'
                    : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                }`}
                title="删除这条消息"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center shadow-[0_2px_8px_rgba(139,92,246,0.5)]">
          {userAvatar ? (
            <img src={userAvatar} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-white" />
          )}
        </div>
      )}
    </div>
  );
};

export default AgentPanel;
