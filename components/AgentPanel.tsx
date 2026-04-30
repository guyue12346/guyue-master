import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertCircle, ListTodo, Settings, Settings2, StickyNote, FolderOpen, Command, Globe, Code2, GraduationCap, Image, MessageSquare, Pencil, BarChart3, HelpCircle, ChevronDown, ChevronUp, ChevronRight, Bug, Trash2, Paperclip, FileText, Trophy, HardDrive, Lock, Unlock, LayoutGrid, Eye, PenLine, Mail, StopCircle, Undo2, Server, Key, CheckCircle, ToggleLeft, ToggleRight, Plus, Edit3, BookUser, FileType2, User } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import type { TodoItem, Note, PromptRecord, MarkdownNote, OJSubmission, OJHeatmapData, ResourceItem, ResourceCenterData, EmailConfig, SubTask, FileRecord, Category, RecurringEvent, RecurringCategory, LatexFileCategory, LatexManagedFile, LatexTemplate } from '../types';
import {
  ChatConfig,
  ChatService,
  AGENT_AVAILABLE_MODELS,
  DEFAULT_CHAT_CONFIG,
  ChatMessage,
  ChatAttachment,
  ChatTool,
  ChatToolCall,
  ChatDebugEvent,
} from '../services/chatService';
import { AgentSettingsModal } from './AgentSettingsModal';
import { AgentHelpModal } from './AgentHelpModal';
import { MarkdownContent } from './MarkdownContent';
import { buildIndex, loadRagIndex, saveRagIndex, searchIndex } from '../utils/ragService';
import { loadProfiles } from '../utils/apiProfileService';

/** 从统一 API Profiles 或 legacy localStorage 获取嵌入密钥 */
function getEmbeddingKeyFromProfiles(): { apiKey: string; baseUrl?: string } {
  try {
    const profiles = loadProfiles();
    const embProviders = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'cohere', 'voyage', 'jina'];
    const profile = profiles.find(p => embProviders.includes(p.provider) && p.apiKey);
    if (profile) return { apiKey: profile.apiKey, baseUrl: profile.baseUrl || undefined };
  } catch {}
  // Fallback to legacy keys
  const apiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
  const baseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
  return { apiKey, baseUrl };
}

/* ─── 类型定义 ─── */

// Agent 支持的功能模块定义
interface AgentModule {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean; // 当前是否可选（已实现的功能）
  description: string;
}

// 可用的功能模块列表
const AGENT_MODULES: AgentModule[] = [
  { id: 'todo',       name: '待办事项', icon: ListTodo,    enabled: true,  description: '创建、查询待办事项' },
  { id: 'datacenter', name: '数据中心', icon: BarChart3,  enabled: true,  description: '数据管理：OJ做题、资源、数据查询' },
  { id: 'learning',   name: '学习',     icon: GraduationCap, enabled: true,  description: '创建课程、查询学习分类' },
  { id: 'leetcode',   name: '刷题',     icon: Code2,         enabled: true,  description: '创建题单、查询已有题单' },
  { id: 'files',      name: '文件管理', icon: FolderOpen,  enabled: true,  description: '查询、读取文件管理中的文件（需授权分类）' },
  { id: 'prompts',    name: 'Skills',    icon: Sparkles,   enabled: true,  description: '创建 Prompt 技能卡' },
  { id: 'notes',      name: '笔记备忘', icon: StickyNote,  enabled: true,  description: '创建便签笔记' },
  { id: 'image',      name: '图床',     icon: Image,      enabled: true,  description: '查询图片链接、上传图片到图床' },
  { id: 'markdown',   name: 'Markdown',  icon: Pencil,     enabled: true,  description: '创建 Markdown 笔记' },
  { id: 'latex',      name: 'LaTeX',    icon: FileType2,  enabled: true,  description: '查询、读取、编辑 LaTeX 文件和模板（需授权分类）' },
  { id: 'email',      name: '邮件',     icon: Mail,       enabled: true,  description: '发送邮件' },
];

const ENABLED_AGENT_MODULES = AGENT_MODULES.filter(module => module.enabled);
const isNativeProvider = (provider: ChatConfig['provider']) => ['openai', 'anthropic', 'gemini', 'zenmux', 'moonshot'].includes(provider);
const getModuleById = (moduleId?: string | null) => AGENT_MODULES.find(module => module.id === moduleId) || null;

/** 待确认操作（如发送邮件），需要用户手动批准 */
interface PendingConfirmation {
  id: string;
  type: 'send_email';
  status: 'pending' | 'confirmed' | 'cancelled';
  data: Record<string, any>;
  summary: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  action?: AgentAction;
  targetModule?: string; // 目标模块
  attachments?: ChatAttachment[];
  undoSnapshot?: UndoSnapshot;
  pendingConfirmation?: PendingConfirmation;
}

/** 修改/删除操作前的数据快照，用于一键回退 */
interface UndoSnapshot {
  type: 'todo' | 'note' | 'resource';
  action: 'update' | 'delete';
  id: string;
  data: Record<string, any>;
  label: string;
}

interface AgentAction {
  type: string;
  status: 'pending' | 'success' | 'error';
  data?: Record<string, any>;
  error?: string;
}

interface AgentPanelProps {
  onOpenSettings?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
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
  ojHeatmapData: OJHeatmapData;
  onCreateResource: (item: Partial<ResourceItem>) => void;
  onUpdateResource: (id: string, updates: Partial<ResourceItem>) => void;
  onDeleteResource: (id: string) => void;
  resourceData: ResourceCenterData;
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
  routedModule?: string | null;
  promptMode?: 'native-tools' | 'fallback';
  customSystemPrompt?: string;
  modulePrompts?: Record<string, string>;
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

const MAX_DEBUG_ITEMS = 200;

/* ─── 调试阶段中文标签映射 ─── */
const STAGE_DISPLAY: Record<string, string> = {
  'send:start': '🚀 开始执行',
  'send:blocked': '🚫 发送阻止',
  'send:routing-result': '🧭 路由完成',
  'send:error': '❌ 执行失败',
  'router:selected-module': '📌 手动选择模块',
  'router:local-intent': '🔍 本地意图匹配',
  'router:llm-request': '🤖 LLM 路由请求',
  'router:llm-response': '📨 LLM 路由结果',
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

/* ─── Agent 配置存储 ─── */

const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';
const STORAGE_KEY_AGENT_PERMISSIONS = 'guyue_agent_permissions';
const STORAGE_KEY_MODULE_PROMPTS = 'guyue_agent_module_prompts';

const AGENT_EMAIL_CONFIG_KEY = 'linkmaster_email_config';
const DEFAULT_AGENT_EMAIL_CONFIG = {
  enabled: false,
  smtp: { host: '', port: 465, secure: true, user: '', pass: '' },
  recipient: '',
  senderName: '古月的Agent助理',
};
type AgentEmailConfig = typeof DEFAULT_AGENT_EMAIL_CONFIG;

/* ─── 通讯录 ─── */
const STORAGE_KEY_CONTACTS = 'guyue_agent_contacts';
interface Contact {
  id: string;
  nickname: string;
  email: string;
  note: string;
}
const loadContacts = (): Contact[] => {
  try { const s = localStorage.getItem(STORAGE_KEY_CONTACTS); return s ? JSON.parse(s) : []; } catch { return []; }
};
const saveContacts = (contacts: Contact[]) => {
  localStorage.setItem(STORAGE_KEY_CONTACTS, JSON.stringify(contacts));
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
2. **设定时间**：用户说"明天下午三点"时，用 dueDate=2026-03-16T15:00；用户说"明天下午三点到五点"时，必须改用 startDateTime=2026-03-16T15:00 和 endDateTime=2026-03-16T17:00，不要只传一个 dueDate。
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

  datacenter: `## 数据中心模块

### 核心能力
管理 OJ 做题记录和资源中心（云盘、AI 服务、服务器、域名、订阅等）。

### 可用工具
**OJ 做题相关：**
- **create_oj_submission** — 创建做题记录。必填 siteName（平台名）和 problemId（题号），可选 categoryId（难度分类 ID）、problemTitle、date。
- **query_oj_stats** — 查询 OJ 统计数据（各平台提交总数、最近做题记录、可用平台及其 categories）。

**资源管理相关：**
- **create_resource** — 创建资源记录。必填 name，可选 categoryId、expireDate、capacity、cost、url、note、account、autoRenewal。
- **query_resources** — 查询所有资源及分类列表（含唯一 ID）。创建/修改资源前**必须**先调用此工具获取分类 ID。
- **update_resource** — 修改资源记录（通过 name 定位）。
- **delete_resource** — 删除资源记录（通过 name 定位）。

### 工作流程规范
1. **OJ 做题**：用户说"我做了洛谷 P1001"，提取 siteName="洛谷"、problemId="P1001"。如果不确定平台的分类体系（难度等级），先 query_oj_stats 查看。
2. **从截图识别**：用户可能发截图，请从图中提取平台名称、题号、难度等信息。
3. **资源管理**：创建资源前**必须**先 query_resources 获取分类列表及其 ID，用 categoryId 指定分类，不要猜分类名。
4. **到期提醒**：query_resources 可传 expiringSoonDays 筛选即将到期资源，帮用户做到期分析。
5. **从截图/描述提取**：用户描述"iCloud 200G 用了 150G 明年 3 月到期 每月 21 元"时，拆解为 name、capacity、expireDate、cost 等字段。`,

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
查询和读取用户文件管理中的文件内容（需文件权限授权）。

### 可用工具
- **query_files** — 查询文件列表，可按分类或关键词筛选。返回文件名、类型、大小等元信息。
- **read_file** — 读取某个文件的文本内容（限 50KB 以内的文本文件）。通过 fileName + category 定位。

### 工作流程规范
1. 需要文件权限授权后才能操作。如果未授权会返回错误，请提示用户在权限面板中开启对应分类的文件读取权限。
2. 操作流程：先 query_files 获取文件列表 → 用 read_file 读取具体文件内容。
3. 只能读取文本类文件（.txt, .md, .json, .csv, .js, .py 等），二进制文件（图片、PDF）无法读取。
4. 如果用户要求"看看文件里有什么"，用 query_files 列出即可；如果要求"读一下某个文件的内容"，再用 read_file。`,

  image: `## 图床模块

### 核心能力
查询已上传的图片和上传新图片到 Gitee 图床。

### 可用工具
- **query_images** — 查询图床中已有图片，返回 URL 和 Markdown 格式链接。
- **upload_image** — 将用户消息中附带的图片上传到图床，返回访问链接。

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
- 邮箱未配置或未启用 → 告知用户去「邮件设置」完成 SMTP 配置
- 通讯录为空 → 提示用户在邮件设置面板的通讯录区域添加联系人
- 确认卡片弹出后，等待用户操作，不要重复调用 send_email`,

  latex: `## LaTeX 模块

### 核心能力
查询、读取和编辑 LaTeX 托管文件和模板（需分类授权）。

### 可用工具
- **query_latex_file_categories** — 查询 LaTeX 文件分类列表（含唯一 ID）。操作文件前**必须**先调用。
- **create_latex_file_category** — 创建新的文件分类（提供名称，自动生成 ID）。
- **query_latex_files** — 查询 LaTeX 文件列表，可按分类 ID 筛选。需要对应分类的读取权限。返回结果中 writable 字段表示该文件是否有编辑权限。
- **read_latex_file** — 读取某个 LaTeX 文件的内容（需读取权限）。返回结果中 writable 字段表示是否有编辑权限。
- **edit_latex_file** — 修改 LaTeX 文件内容（需编辑权限，与读取权限独立）。
- **query_latex_template_categories** — 查询模板分类列表（含唯一 ID）。
- **create_latex_template_category** — 创建新的模板分类。
- **query_latex_templates** — 查询模板列表，可按分类筛选。
- **read_latex_template** — 读取模板的完整内容（通过模板 ID）。
- **create_latex_template** — 创建新模板（提供名称、分类、完整 .tex 源码）。
- **edit_latex_template** — 修改已有模板的名称、描述、分类或内容。

### 权限说明
- 文件权限分为**读取**和**编辑**两种，用户可以独立授权。
- 可能某个分类只授权了读取但未授权编辑，此时无法修改文件。请根据 writable 字段判断，若无编辑权限请提示用户在权限面板中开启。

### 工作流程规范
1. 需要 LaTeX 分类权限授权后才能操作。未授权会返回错误，请提示用户在权限面板中开启。
2. **分类必须用 ID**：查询分类获取 id 列表后，在查询/创建文件时用 categoryId 参数指定。不要用分类名称代替 ID。
3. 如果用户指定的分类不存在，先 create_latex_file_category 或 create_latex_template_category 创建。
4. 操作流程：先 query_latex_file_categories → query_latex_files → read_latex_file / edit_latex_file。
5. 编辑文件时需提供完整的文件内容，不能只传部分内容。`,
};

const loadModulePrompts = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_MODULE_PROMPTS);
    const userPrompts = saved ? JSON.parse(saved) : {};
    // 合并：用户自定义优先，未自定义的用默认值
    return { ...DEFAULT_MODULE_PROMPTS, ...userPrompts };
  } catch { return { ...DEFAULT_MODULE_PROMPTS }; }
};

const saveModulePrompts = (prompts: Record<string, string>): void => {
  localStorage.setItem(STORAGE_KEY_MODULE_PROMPTS, JSON.stringify(prompts));
};

const loadAgentConfig = (): ChatConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_CHAT_CONFIG,
        ...parsed,
        // Agent 默认不强制注入通用 systemPrompt，留空表示只使用内置 Agent Prompt
        systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : '',
      };
    }

    return {
      ...DEFAULT_CHAT_CONFIG,
      systemPrompt: '',
    };
  } catch {
    return {
      ...DEFAULT_CHAT_CONFIG,
      systemPrompt: '',
    };
  }
};

const saveAgentConfig = (config: ChatConfig): void => {
  localStorage.setItem(STORAGE_KEY_AGENT_CONFIG, JSON.stringify(config));
};

const loadAgentHistory = (): AgentMessage[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_HISTORY);
    const msgs = saved ? JSON.parse(saved) : [];
    return msgs.slice(-20); // 只保留最近20条
  } catch {
    return [];
  }
};

const saveAgentHistory = (messages: AgentMessage[]): void => {
  const trimmed = messages.slice(-20);
  localStorage.setItem(STORAGE_KEY_AGENT_HISTORY, JSON.stringify(trimmed));
};

const loadAgentPermissions = (): { data: DataPermissions; files: string[] } => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_PERMISSIONS);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        data: { ...DEFAULT_DATA_PERMISSIONS, ...parsed.data },
        files: Array.isArray(parsed.files) ? parsed.files : [],
      };
    }
  } catch { /* ignore */ }
  return { data: { ...DEFAULT_DATA_PERMISSIONS }, files: [] };
};

const saveAgentPermissions = (data: DataPermissions, files: string[]): void => {
  localStorage.setItem(STORAGE_KEY_AGENT_PERMISSIONS, JSON.stringify({ data, files }));
};

const createAgentWelcomeMessage = (content?: string): AgentMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: content || '👋 你好！我是 **古月助手**，你的智能工作台助理。\n\n我可以帮你管理待办与日程、整理笔记、查询学习进度、记录刷题、收发邮件等，直接描述你的需求即可，也可以点击右侧输入框旁的 **模块图标** 限定任务范围。\n\n**目前支持的功能**：\n- 📋 **任务与日程**：创建/更新待办、管理重复事件\n- 📝 **笔记**：创建便签与 Markdown 文档\n- 🎯 **Skills**：管理提示词技能库\n- 🗂️ **数据中心**：查询云资源、OJ 提交记录\n- 📚 **学习空间**：查询课程与学习分类\n- 💻 **LeetCode**：记录刷题提交\n- 📁 **文件管理**：查询文件归档\n- 📧 **邮件**：发送邮件通知\n\n有什么我可以帮你的吗？',
  timestamp: Date.now(),
});

/* ─── Agent System Prompt ─── */

const getAgentSystemPrompt = ({
  selectedModule,
  routedModule,
  promptMode = 'fallback',
  customSystemPrompt,
  modulePrompts,
}: AgentPromptOptions = {}) => {
  const customPromptSection = customSystemPrompt?.trim()
    ? `\n\n## 用户自定义系统提示\n${customSystemPrompt.trim()}`
    : '';

  const activeModuleId = routedModule || selectedModule;
  const activeModule = getModuleById(activeModuleId);
  const modulePrompt = activeModuleId && modulePrompts?.[activeModuleId]?.trim()
    ? `\n\n## 【${activeModule?.name || activeModuleId}】模块专属指令\n${modulePrompts[activeModuleId].trim()}`
    : '';

  const moduleInfo = activeModule
    ? `\n\n## 当前任务模块\n当前任务已路由到【${activeModule.name}】模块，请优先在这个范围内处理任务。${modulePrompt}`
    : '\n\n## 当前任务模块\n当前没有预选模块，请先理解用户意图，再决定是否需要调用应用能力。';

  if (promptMode === 'native-tools') {
    // 原生工具模式：所有已注册工具通过 tools 参数自路由，无需模块描述
    return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。

## 工具调用规则
1. 你已被提供了一组工具（function calling），请根据用户意图自行决定是否调用。
2. 工具分两类：**创建类**（create_*）和**查询类**（query_*）。如果任务需要先了解现有数据再操作，请先调用查询工具。
3. 如果没有合适工具，直接自然语言回复即可。
4. 不要输出 Markdown action 代码块，也不要伪造工具调用结果。
5. 如果工具执行返回了错误信息，请根据错误原因调整参数后重试，最多重试一次。
6. 你可以进行多轮工具调用。例如先 query_files 查询文件列表，再逐个 read_file 读取内容。不要在只完成第一步后就停止。

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
- 时间点事项使用 dueDate；如果用户说的是"下午 3 点到 5 点"这类时间段，必须改传 startDateTime 和 endDateTime。所有时间字段都必须换算为 ISO 8601 格式（YYYY-MM-DDTHH:mm），绝对不要传自然语言或时间戳。${modulePrompt}${customPromptSection}`;
  }

  return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。${moduleInfo}

## 你的能力
你可以帮用户操作以下功能：
1. **待办事项** — 创建待办、查询已有待办内容
2. **便签笔记** — 创建短文本便签备忘
3. **Prompt 技能卡** — 创建可复用的提示词/技能模板
4. **Markdown 笔记** — 创建长文 Markdown 日记/笔记/文章
5. **OJ 做题记录** — 记录洛谷、AcWing、LeetCode 等平台的做题情况（从截图或描述中提取题号、平台、难度）
6. **资源管理** — 创建云盘、AI资源、服务器、域名、订阅等资源记录（从截图或描述中识别名称、容量、到期时间等）
7. **LeetCode 题单** — 创建结构化题单（含分组和题目链接）；查询已有题单
8. **学习课程** — 在学习中心创建课程和分类；查询已有课程
9. **发送邮件** — 编辑邮件内容并发送（支持 HTML 正文）
10. **文件管理** — 按分类查询文件列表、读取文件内容（需用户授权文件分类）
11. **图床管理** — 查询已有图片（获取 URL / Markdown 链接），上传图片到图床指定分类

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
    "categoryName": "入门",
    "problemTitle": "A+B Problem",
    "date": "${new Date().toISOString().split('T')[0]}"
  }
}
\`\`\`
siteName 可选：洛谷、AcWing、LeetCode。categoryName：LeetCode 用简单/中等/困难，洛谷用入门/普及/提高/省选，AcWing 用简单/中等/困难。

### 创建资源记录
\`\`\`action
{
  "type": "create_resource",
  "data": {
    "name": "iCloud 200G",
    "categoryName": "云盘资源",
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
categoryName 可选：云盘资源、AI资源、服务器、域名、订阅服务。

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
6. 保持回复简洁友好。${customPromptSection}`;
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

/* ─── 数据权限（读/写） ─── */

interface PermissionLevel { read: boolean; write: boolean }
interface DataPermissions {
  todos: PermissionLevel;
  ojStats: PermissionLevel;
  resources: PermissionLevel;
  leetcodeLists: PermissionLevel;
  learningCourses: PermissionLevel;
}
const DEFAULT_DATA_PERMISSIONS: DataPermissions = {
  todos: { read: false, write: false },
  ojStats: { read: false, write: false },
  resources: { read: false, write: false },
  leetcodeLists: { read: false, write: false },
  learningCourses: { read: false, write: false },
};
const PERMISSION_LABELS: { key: keyof DataPermissions; label: string; desc: string }[] = [
  { key: 'todos',          label: '待办事项',  desc: '查询和修改待办内容' },
  { key: 'ojStats',        label: '刷题统计',  desc: '查询和修改做题记录' },
  { key: 'resources',      label: '资源中心',  desc: '查询和修改资源列表' },
  { key: 'leetcodeLists',  label: '题单',      desc: '查询和修改 LeetCode 题单' },
  { key: 'learningCourses',label: '学习课程',  desc: '查询和修改学习课程' },
];

/* ─── 声明式工具注册表 ─── */

interface ToolRegistration {
  name: string;
  module: string;           // 所属 AGENT_MODULE id
  tool: ChatTool;           // 发给 LLM 的 JSON Schema
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any>;
}

interface ToolExecutionContext {
  todos: TodoItem[];
  notes: Note[];
  dataPermissions: DataPermissions;
  filePermissions: string[];
  fileRecords: FileRecord[];
  lastUserAttachments?: ChatAttachment[];
  onCreateTodo: (data: Partial<TodoItem>) => void;
  onUpdateTodo: (id: string, updates: Partial<TodoItem>) => void;
  onDeleteTodo: (id: string, options?: { skipConfirm?: boolean }) => void;
  onCreateNote: (data: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onCreatePrompt: (data: Partial<PromptRecord>) => void;
  onCreateMarkdownNote: (data: Partial<MarkdownNote>) => void;
  onCreateOJSubmission: (submission: OJSubmission) => void;
  ojHeatmapData: OJHeatmapData;
  onCreateResource: (item: Partial<ResourceItem>) => void;
  onUpdateResource: (id: string, updates: Partial<ResourceItem>) => void;
  onDeleteResource: (id: string) => void;
  resourceData: ResourceCenterData;
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
  // Knowledge Base
  knowledgeBaseFileIds?: Set<string>;
  // LaTeX
  latexFileReadPermissions: string[];  // 已授权可读的文件分类 ID 列表
  latexFileWritePermissions: string[]; // 已授权可写的文件分类 ID 列表
  latexTemplatePermissions: string[];  // 已授权的模板分类名称列表
  onAutoAuthLatexFileCategory: (catId: string) => void;  // 自动授权新建的文件分类
  onAutoAuthLatexTemplateCategory: (catName: string) => void; // 自动授权新建的模板分类
}

const TOOL_REGISTRY: ToolRegistration[] = [
  {
    name: 'create_todo',
    module: 'todo',
    tool: {
      name: 'create_todo',
      description: '创建一个新的待办事项。创建前必须先 query_todos 获取可用分类列表（availableCategories），category 必须是其中之一，不可自行编造。普通时点事项用 dueDate；时间段日程必须使用 startDateTime + endDateTime（或 durationMinutes）创建 range 事件。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '待办事项标题或内容' },
          description: { type: 'string', description: '补充说明' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
          category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
          dueDate: { type: 'string', description: '单个时间点或全天事项时间，格式 YYYY-MM-DDTHH:mm，如 "2026-03-15T14:00"。若仅传日期且想视为全天，可传 timeType="allday"。' },
          timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '时间类型。时间段日程请传 range。' },
          startDateTime: { type: 'string', description: '时间段事件开始时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T15:00"。' },
          endDateTime: { type: 'string', description: '时间段事件结束时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T17:00"。' },
          durationMinutes: { type: 'number', description: '时间段事件时长（分钟）。若未提供 endDateTime，可用它配合 startDateTime 自动计算结束时间。' },
        },
        required: ['content'],
      },
    },
    execute: async (args, ctx) => {
      if (typeof args.category === 'string' && args.category.trim()) {
        const catName = args.category.trim();
        if (!ctx.todoCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.todoCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
        }
      }
      const schedule = resolveTodoSchedulePayload(args);
      if (schedule.error) {
        return { success: false, error: schedule.error };
      }
      const todoData = normalizeTodoPayload(args);
      todoData.id = crypto.randomUUID();
      ctx.onCreateTodo(todoData);
      // 同步更新 ctx.todos 以便后续 create_subtask 能立即找到
      ctx.todos.push({
        id: todoData.id,
        content: todoData.content || '新事项',
        description: todoData.description,
        isCompleted: false,
        priority: todoData.priority || 'medium',
        category: todoData.category || '未分类',
        dueDate: todoData.dueDate,
        timeType: todoData.timeType,
        timeStart: todoData.timeStart,
        timeEnd: todoData.timeEnd,
        createdAt: Date.now(),
      } as TodoItem);
      return { success: true, message: '待办事项创建成功', todo: { id: todoData.id, ...todoData } };
    },
  },
  {
    name: 'create_note',
    module: 'notes',
    tool: {
      name: 'create_note',
      description: '创建一个便签笔记（短文本备忘）',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '笔记内容' },
          color: { type: 'string', enum: ['bg-yellow-100', 'bg-green-100', 'bg-blue-100', 'bg-pink-100', 'bg-purple-100', 'bg-orange-100'], description: '便签颜色，默认 bg-yellow-100' },
        },
        required: ['content'],
      },
    },
    execute: async (args, ctx) => {
      const noteData: Partial<Note> = {
        content: typeof args.content === 'string' ? args.content.trim() : '新便签',
        color: args.color || 'bg-yellow-100',
      };
      ctx.onCreateNote(noteData);
      return { success: true, message: '便签创建成功', note: noteData };
    },
  },
  {
    name: 'create_prompt',
    module: 'prompts',
    tool: {
      name: 'create_prompt',
      description: '创建一个 Prompt 技能卡（用于存储可复用的提示词/技能模板）',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '技能名称' },
          content: { type: 'string', description: '提示词/技能内容，支持 Markdown' },
          category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
          description: { type: 'string', description: '简短描述' },
        },
        required: ['title', 'content'],
      },
    },
    execute: async (args, ctx) => {
      if (typeof args.category === 'string' && args.category.trim()) {
        const catName = args.category.trim();
        if (!ctx.promptCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.promptCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "prompts"）创建新分类后再试。` };
        }
      }
      const promptData: Partial<PromptRecord> = {
        title: typeof args.title === 'string' ? args.title.trim() : '未命名技能',
        content: typeof args.content === 'string' ? args.content : '',
        category: typeof args.category === 'string' ? args.category.trim() : '未分类',
        description: typeof args.description === 'string' ? args.description : undefined,
      };
      ctx.onCreatePrompt(promptData);
      return { success: true, message: '技能卡创建成功', prompt: promptData };
    },
  },
  {
    name: 'create_markdown_note',
    module: 'markdown',
    tool: {
      name: 'create_markdown_note',
      description: '创建一篇 Markdown 长文笔记（适合日记、笔记、文章）',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记正文，Markdown 格式' },
          category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
        },
        required: ['title', 'content'],
      },
    },
    execute: async (args, ctx) => {
      if (typeof args.category === 'string' && args.category.trim()) {
        const catName = args.category.trim();
        if (!ctx.markdownCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.markdownCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "markdown"）创建新分类后再试。` };
        }
      }
      const noteData: Partial<MarkdownNote> = {
        title: typeof args.title === 'string' ? args.title.trim() : '新笔记',
        content: typeof args.content === 'string' ? args.content : '',
        category: typeof args.category === 'string' ? args.category.trim() : '',
      };
      ctx.onCreateMarkdownNote(noteData);
      return { success: true, message: 'Markdown 笔记创建成功', note: noteData };
    },
  },
  {
    name: 'create_oj_submission',
    module: 'datacenter',
    tool: {
      name: 'create_oj_submission',
      description: '创建一条 OJ 做题记录（洛谷、AcWing、LeetCode 等）。从用户描述或截图中提取题号、平台、难度等信息。',
      inputSchema: {
        type: 'object',
        properties: {
          siteName: { type: 'string', description: '平台名称，如 "洛谷"、"AcWing"、"LeetCode"' },
          categoryId: { type: 'string', description: '难度/分类的唯一 ID（从 query_oj_stats 返回的站点 categories[].id 获取）。不确定时可省略。' },
          problemId: { type: 'string', description: '题号，如 "P1001"、"3"、"1"' },
          problemTitle: { type: 'string', description: '题目标题（可选）' },
          date: { type: 'string', description: '做题日期 YYYY-MM-DD，默认今天' },
        },
        required: ['siteName', 'problemId'],
      },
    },
    execute: async (args, ctx) => {
      const siteName = (typeof args.siteName === 'string' ? args.siteName : '').trim();
      const site = ctx.ojHeatmapData.sites.find(s =>
        s.name.toLowerCase() === siteName.toLowerCase() ||
        s.id.toLowerCase() === siteName.toLowerCase()
      );
      if (!site) {
        const available = ctx.ojHeatmapData.sites.map(s => s.name).join('、') || '暂无';
        return { success: false, error: `未找到平台「${siteName}」，当前可用平台：${available}` };
      }

      let categoryId = site.categories?.[0]?.id || 'easy';
      if (args.categoryId && site.categories) {
        const matched = site.categories.find(c => c.id === String(args.categoryId).trim());
        if (!matched) {
          const available = site.categories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」在平台「${site.name}」中不存在。可用分类：${available}。` };
        }
        categoryId = matched.id;
      }

      const now = new Date();
      const dateStr = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date)
        ? args.date
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const submission: OJSubmission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        siteId: site.id,
        categoryId,
        problemId: String(args.problemId).trim(),
        problemTitle: typeof args.problemTitle === 'string' ? args.problemTitle.trim() : undefined,
        timestamp: Date.now(),
        date: dateStr,
      };
      ctx.onCreateOJSubmission(submission);
      const catLabel = site.categories?.find(c => c.id === categoryId)?.name || categoryId;
      return { success: true, message: `做题记录创建成功：${site.name} ${submission.problemId}（${catLabel}）`, submission };
    },
  },
  {
    name: 'create_resource',
    module: 'datacenter',
    tool: {
      name: 'create_resource',
      description: '创建一条资源记录（云盘、AI 资源、服务器、域名、订阅服务等）。调用前请先 query_resources 获取分类列表及其 ID，用 categoryId 指定分类。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '资源名称，如 "iCloud 200G"、"ChatGPT Plus"' },
          categoryId: { type: 'string', description: '分类的唯一 ID（从 query_resources 返回的 categories[].id 获取）。不确定时可省略，将使用默认分类。' },
          expireDate: { type: 'string', description: '到期日期 YYYY-MM-DD（可选）' },
          capacityUsed: { type: 'number', description: '已用容量数值（可选）' },
          capacityTotal: { type: 'number', description: '总容量数值（可选）' },
          capacityUnit: { type: 'string', description: '容量单位，如 GB、TB（可选）' },
          costAmount: { type: 'number', description: '费用金额（可选）' },
          costPeriod: { type: 'string', enum: ['month', 'year', 'once'], description: '费用周期（可选）' },
          url: { type: 'string', description: '资源网址（可选）' },
          note: { type: 'string', description: '备注（可选）' },
          account: { type: 'string', description: '账号/用户名（可选）' },
          autoRenewal: { type: 'boolean', description: '是否自动续费（可选）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      const categories = ctx.resourceData.categories;
      let categoryId = categories[0]?.id || 'cloud';
      if (args.categoryId) {
        const matched = categories.find(c => c.id === String(args.categoryId).trim());
        if (!matched) {
          const available = categories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。请先调用 query_resources 获取正确的分类 ID。` };
        }
        categoryId = matched.id;
      }

      const item: Partial<ResourceItem> = {
        name: typeof args.name === 'string' ? args.name.trim() : '新资源',
        categoryId,
        expireDate: typeof args.expireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.expireDate) ? args.expireDate : undefined,
        capacity: (args.capacityTotal && args.capacityTotal > 0)
          ? { used: Number(args.capacityUsed) || 0, total: Number(args.capacityTotal), unit: typeof args.capacityUnit === 'string' ? args.capacityUnit : 'GB' }
          : undefined,
        cost: (args.costAmount && args.costAmount > 0)
          ? { amount: Number(args.costAmount), period: (['month', 'year', 'once'].includes(args.costPeriod) ? args.costPeriod : 'month') as 'month' | 'year' | 'once' }
          : undefined,
        url: typeof args.url === 'string' ? args.url.trim() : undefined,
        note: typeof args.note === 'string' ? args.note.trim() : undefined,
        account: typeof args.account === 'string' ? args.account.trim() : undefined,
        autoRenewal: typeof args.autoRenewal === 'boolean' ? args.autoRenewal : undefined,
      };
      ctx.onCreateResource(item);
      const catLabel = categories.find(c => c.id === categoryId)?.name || categoryId;
      return { success: true, message: `资源创建成功：${item.name}（${catLabel}）`, resource: item };
    },
  },
  // ─── 查询工具（只读，不修改数据）───
  {
    name: 'query_todos',
    module: 'todo',
    tool: {
      name: 'query_todos',
      description: '查询当前所有待办事项及可用分类列表。创建/修改待办前必须先调用此工具获取可用分类名称，不可自行编造分类。',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'pending', 'completed'], description: '筛选状态：all=全部，pending=未完成，completed=已完成。默认 pending。' },
          limit: { type: 'number', description: '最多返回条数，默认 20，最大 50。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请点击 🔒 按钮，在权限面板中开启「待办事项」读取权限。' };
      const status = args.status || 'pending';
      const limit = Math.min(Number(args.limit) || 20, 50);
      let items = ctx.todos;
      if (status === 'pending') items = items.filter(t => !t.isCompleted);
      else if (status === 'completed') items = items.filter(t => t.isCompleted);
      const result = items.slice(0, limit).map(t => ({
        id: t.id,
        content: t.content,
        priority: t.priority,
        category: t.category,
        isCompleted: t.isCompleted,
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null,
        timeType: t.timeType || (t.dueDate ? 'allday' : null),
        timeStart: t.timeStart ? new Date(t.timeStart).toLocaleString('zh-CN') : null,
        timeEnd: t.timeEnd ? new Date(t.timeEnd).toLocaleString('zh-CN') : null,
        schedule: t.timeType === 'range' && t.timeStart
          ? `${new Date(t.timeStart).toLocaleString('zh-CN')} ～ ${new Date(t.timeEnd || (t.timeStart + 3600000)).toLocaleString('zh-CN')}`
          : (t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null),
        description: t.description || null,
        subtaskCount: t.subtasks?.length || 0,
        subtaskCompleted: t.subtasks?.filter(s => s.isCompleted).length || 0,
      }));
      return { success: true, total: items.length, returned: result.length, availableCategories: ctx.todoCategories, todos: result };
    },
  },
  {
    name: 'query_oj_stats',
    module: 'datacenter',
    tool: {
      name: 'query_oj_stats',
      description: '查询 OJ 做题统计数据，包括各平台提交总数、最近做题记录等。可用于生成学习总结或分析刷题情况。',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: '统计最近 N 天的数据，默认 30，传 0 表示全部。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.ojStats.read) return { success: false, error: '刷题统计查询未授权。请点击 🔒 按钮，在权限面板中开启「刷题统计」读取权限。' };
      const days = Number(args.days ?? 30);
      const now = Date.now();
      const cutoff = days > 0 ? now - days * 86400000 : 0;
      const subs = ctx.ojHeatmapData.submissions.filter(s =>
        s.id !== 'lc_stats_meta' && s.categoryId !== 'meta' && s.timestamp >= cutoff
      );
      const bysite: Record<string, { name: string; total: number; byCategory: Record<string, number> }> = {};
      for (const site of ctx.ojHeatmapData.sites) {
        bysite[site.id] = { name: site.name, total: 0, byCategory: {} };
      }
      for (const s of subs) {
        if (!bysite[s.siteId]) continue;
        bysite[s.siteId].total += 1;
        bysite[s.siteId].byCategory[s.categoryId] = (bysite[s.siteId].byCategory[s.categoryId] || 0) + 1;
      }
      const recent = subs.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10).map(s => ({
        site: ctx.ojHeatmapData.sites.find(st => st.id === s.siteId)?.name || s.siteId,
        problemId: s.problemId,
        problemTitle: s.problemTitle || null,
        category: s.categoryId,
        date: s.date,
      }));
      return {
        success: true,
        period: days > 0 ? `最近 ${days} 天` : '全部',
        totalSubmissions: subs.length,
        bySite: Object.values(bysite).filter(v => v.total > 0),
        recentSubmissions: recent,
      };
    },
  },
  {
    name: 'query_resources',
    module: 'datacenter',
    tool: {
      name: 'query_resources',
      description: '查询资源中心的资源列表及所有分类（含唯一 ID）。创建资源前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 categories[].id 获取）。不传则返回全部。' },
          expiringSoonDays: { type: 'number', description: '筛选 N 天内即将到期的资源，不传则不过滤。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.read) return { success: false, error: '资源查询未授权。请点击 🔒 按钮，在权限面板中开启「资源中心」读取权限。' };
      const cats = ctx.resourceData.categories;
      let items = ctx.resourceData.items;
      if (args.categoryId) {
        const catId = String(args.categoryId).trim();
        items = items.filter(i => i.categoryId === catId);
      }
      if (args.expiringSoonDays) {
        const limit = Date.now() + Number(args.expiringSoonDays) * 86400000;
        items = items.filter(i => {
          if (!i.expireDate) return false;
          return new Date(i.expireDate).getTime() <= limit;
        });
      }
      const result = items.map(i => {
        const cat = cats.find(c => c.id === i.categoryId);
        const expireTs = i.expireDate ? new Date(i.expireDate).getTime() : null;
        const daysLeft = expireTs ? Math.ceil((expireTs - Date.now()) / 86400000) : null;
        return {
          name: i.name,
          categoryId: i.categoryId,
          categoryName: cat?.name || i.categoryId,
          expireDate: i.expireDate || null,
          daysLeft,
          capacity: i.capacity ? `${i.capacity.used}/${i.capacity.total} ${i.capacity.unit || 'GB'}` : null,
          cost: i.cost ? `${i.cost.amount} / ${i.cost.period}` : null,
          autoRenewal: i.autoRenewal ?? null,
          note: i.note || null,
        };
      });
      return { success: true, total: result.length, categories: cats.map(c => ({ id: c.id, name: c.name })), resources: result };
    },
  },
  {
    name: 'create_leetcode_list',
    module: 'leetcode',
    tool: {
      name: 'create_leetcode_list',
      description: '创建一个 LeetCode 题单，由若干分组构成，每组包含多道题目。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '题单标题' },
          description: { type: 'string', description: '题单描述（可选）' },
          priority: { type: 'number', description: '排序优先级，数字越小越靠前，默认 10' },
          groups: {
            type: 'array',
            description: '题目分组列表',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '分组名称，如"基础 DP"' },
                problems: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '题目完整标题，如 "70. 爬楼梯"' },
                      url: { type: 'string', description: 'LeetCode 题目链接，如 "https://leetcode.cn/problems/climbing-stairs/"' },
                      note: { type: 'string', description: '备注信息（可选）' },
                    },
                    required: ['title', 'url'],
                  },
                },
              },
              required: ['name', 'problems'],
            },
          },
        },
        required: ['title', 'groups'],
      },
    },
    execute: async (args, _ctx) => {
      const groups = Array.isArray(args.groups) ? args.groups : [];
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
      const rawMarkdown = mdLines.join('\n');
      const totalProblems = categories.reduce((n, g) => n + g.problems.length, 0);
      const newList = {
        id: Date.now().toString(),
        title: String(args.title || '').trim(),
        description: String(args.description || '').trim(),
        priority: Number(args.priority) || 10,
        categories,
        rawMarkdown,
        createdAt: Date.now(),
      };
      const existing: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
      existing.push(newList);
      existing.sort((a: any, b: any) => (a.priority ?? 10) - (b.priority ?? 10));
      localStorage.setItem('leetcode_lists', JSON.stringify(existing));
      return { success: true, message: `题单「${newList.title}」已创建，包含 ${categories.length} 个分组共 ${totalProblems} 道题。` };
    },
  },
  {
    name: 'create_learning_course',
    module: 'learning',
    tool: {
      name: 'create_learning_course',
      description: '在学习中心创建一个完整的结构化课程（含学习模块、讲义、练习、个人资源、自定义分区）。调用前必须先 query_learning_courses 获取已有分类列表及其 ID，然后用 categoryId 指定分类；若需要新分类请先自行说明。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '课程标题' },
          description: { type: 'string', description: '课程简介' },
          categoryId: { type: 'string', description: '所属分类的唯一 ID（从 query_learning_courses 返回的 categories[].id 获取）。若传入的 ID 不存在，可传 categoryName 来自动创建新分类。' },
          categoryName: { type: 'string', description: '仅在需要创建新分类时使用。传入新分类的显示名称，会自动创建。必须与 categoryId 二选一。' },
          introMarkdown: { type: 'string', description: '课程总览 Markdown（支持 # 标题、列表等）' },
          icon: { type: 'string', description: 'Lucide 图标名，如 "BookOpen"、"Code2"' },
          priority: { type: 'number', description: '排序优先级，默认 10' },
          modules: {
            type: 'array',
            description: '学习内容模块列表，每个模块包含多个讲义',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '模块标题，如 "第一章 基础概念"' },
                description: { type: 'string', description: '模块描述' },
                lectures: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '讲义标题' },
                      lecturer: { type: 'string', description: '讲师/来源' },
                      date: { type: 'string', description: '日期，如 "2025-01-15"' },
                      desc: { type: 'string', description: '讲义描述' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe', 'music', 'image'], description: '图标类型' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          assignmentModules: {
            type: 'array',
            description: '练习模块列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '练习模块标题' },
                description: { type: 'string', description: '描述' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '练习项标题' },
                      link: { type: 'string', description: '链接（可选）' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          personalModules: {
            type: 'array',
            description: '个人资源模块列表',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '资源模块标题' },
                description: { type: 'string', description: '描述' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: '资源项标题' },
                      link: { type: 'string', description: '链接（可选）' },
                      icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
          customSections: {
            type: 'array',
            description: '自定义分区列表（用户自定义的额外板块）',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '分区标题' },
                icon: { type: 'string', description: 'Lucide 图标名，如 "Star"' },
                color: { type: 'string', enum: ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan', 'amber'], description: '颜色' },
                modules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      description: { type: 'string' },
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { title: { type: 'string' }, link: { type: 'string' }, icon: { type: 'string' } },
                          required: ['title'],
                        },
                      },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['title'],
            },
          },
        },
        required: ['title'],
      },
    },
    execute: async (args, _ctx) => {
      const title = String(args.title || '').trim();
      const description = String(args.description || '').trim();
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let targetCategory: any = null;
      // 优先用 categoryId 精确匹配
      if (args.categoryId) {
        targetCategory = cats.find((c: any) => c.id === String(args.categoryId).trim());
        if (!targetCategory) {
          const available = cats.map((c: any) => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。请先调用 query_learning_courses 获取正确的分类 ID。` };
        }
      } else if (args.categoryName) {
        // 创建新分类
        const catName = String(args.categoryName).trim();
        targetCategory = { id: `cat_${Date.now()}`, name: catName, icon: args.icon || 'BookOpen', color: 'blue', priority: 10 };
        cats.push(targetCategory);
        localStorage.setItem('learning_categories_v1', JSON.stringify(cats));
      } else {
        return { success: false, error: '必须提供 categoryId（已有分类）或 categoryName（创建新分类）。请先调用 query_learning_courses 查看已有分类。' };
      }

      const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const courseId = genId('course');

      // 构建 modules
      const modules = (Array.isArray(args.modules) ? args.modules : []).map((m: any) => ({
        id: genId('mod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        lectures: (Array.isArray(m.lectures) ? m.lectures : []).map((l: any) => ({
          id: genId('lec'),
          title: String(l.title || ''),
          lecturer: String(l.lecturer || ''),
          materials: '',
          date: String(l.date || ''),
          desc: String(l.desc || ''),
          icon: l.icon || undefined,
        })),
      }));

      // 构建 assignmentModules
      const assignmentModules = (Array.isArray(args.assignmentModules) ? args.assignmentModules : []).map((m: any) => ({
        id: genId('amod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
          id: genId('ai'),
          title: String(i.title || ''),
          link: String(i.link || ''),
          icon: i.icon || undefined,
        })),
      }));

      // 构建 personalModules
      const personalModules = (Array.isArray(args.personalModules) ? args.personalModules : []).map((m: any) => ({
        id: genId('pmod'),
        title: String(m.title || ''),
        description: String(m.description || ''),
        items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
          id: genId('pi'),
          title: String(i.title || ''),
          link: String(i.link || ''),
          icon: i.icon || undefined,
        })),
      }));

      // 构建 customSections
      const customSections = (Array.isArray(args.customSections) ? args.customSections : []).map((s: any) => ({
        id: genId('csec'),
        title: String(s.title || ''),
        icon: String(s.icon || 'Star'),
        color: String(s.color || 'blue'),
        modules: (Array.isArray(s.modules) ? s.modules : []).map((m: any) => ({
          id: genId('cm'),
          title: String(m.title || ''),
          description: String(m.description || ''),
          items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
            id: genId('ci'),
            title: String(i.title || ''),
            link: String(i.link || ''),
            icon: i.icon || undefined,
          })),
        })),
      }));

      const totalLectures = modules.reduce((n: number, m: any) => n + m.lectures.length, 0);
      const totalAssignments = assignmentModules.reduce((n: number, m: any) => n + m.items.length, 0);

      const newCourse = {
        id: courseId,
        title,
        description,
        categoryId: targetCategory.id,
        modules,
        assignments: [],
        assignmentModules,
        personalModules,
        customSections,
        introMarkdown: String(args.introMarkdown || '').trim() || `# ${title}\n\n${description || '在这里编写学习总览...'}`,
        icon: args.icon || undefined,
        priority: Number(args.priority) || 10,
      };
      const courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      courses.push(newCourse);
      localStorage.setItem('learning_courses_v1', JSON.stringify(courses));
      // 通知 LearningManager 重新读取
      window.dispatchEvent(new CustomEvent('learning-data-updated'));

      const parts = [`课程「${title}」已创建，归属分类「${targetCategory.name}」`];
      if (modules.length > 0) parts.push(`${modules.length} 个学习模块（${totalLectures} 个讲义）`);
      if (assignmentModules.length > 0) parts.push(`${assignmentModules.length} 个练习模块（${totalAssignments} 个练习项）`);
      if (personalModules.length > 0) parts.push(`${personalModules.length} 个个人资源模块`);
      if (customSections.length > 0) parts.push(`${customSections.length} 个自定义分区`);
      return { success: true, message: parts.join('，') + '。' };
    },
  },
  {
    name: 'query_leetcode_lists',
    module: 'leetcode',
    tool: {
      name: 'query_leetcode_lists',
      description: '查询所有 LeetCode 题单，返回标题、描述、分组数和题目总数。创建新题单前可先调用以避免重复。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, ctx) => {
      if (!ctx.dataPermissions.leetcodeLists.read) return { success: false, error: '题单查询未授权。请点击 🔒 按钮，在权限面板中开启「题单」读取权限。' };
      const lists: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
      return {
        success: true,
        total: lists.length,
        lists: lists.map((l: any) => ({
          id: l.id,
          title: l.title,
          description: l.description || null,
          priority: l.priority ?? 10,
          groupCount: (l.categories || []).length,
          problemCount: (l.categories || []).reduce((n: number, g: any) => n + (g.problems || []).length, 0),
          createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString('zh-CN') : null,
        })),
      };
    },
  },
  {
    name: 'query_learning_courses',
    module: 'learning',
    tool: {
      name: 'query_learning_courses',
      description: '查询学习中心的分类和课程列表，返回每个分类的唯一 ID。创建课程前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 categories[].id 获取），不传则返回全部' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.learningCourses.read) return { success: false, error: '学习课程查询未授权。请点击 🔒 按钮，在权限面板中开启「学习课程」读取权限。' };
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      if (args.categoryId) {
        const catId = String(args.categoryId).trim();
        courses = courses.filter((c: any) => c.categoryId === catId);
      }
      return {
        success: true,
        categories: cats.map((c: any) => ({ id: c.id, name: c.name })),
        courses: courses.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || null,
          categoryId: c.categoryId,
          categoryName: cats.find((cat: any) => cat.id === c.categoryId)?.name || c.categoryId,
          moduleCount: (c.modules || []).length,
          lectureCount: (c.modules || []).reduce((n: number, m: any) => n + (m.lectures || []).length, 0),
          assignmentModuleCount: (c.assignmentModules || []).length,
          personalModuleCount: (c.personalModules || []).length,
          customSectionCount: (c.customSections || []).length,
        })),
      };
    },
  },
  // ─── 修改工具（需要写入权限）───
  {
    name: 'update_todo',
    module: 'todo',
    tool: {
      name: 'update_todo',
      description: '修改一条已有的待办事项。可修改内容、优先级、分类、截止日期、完成状态等字段。需要先 query_todos 获取 id 和可用分类列表。category 必须是已有分类名称，不可自行编造。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id（从 query_todos 结果中获取）' },
          content: { type: 'string', description: '新的内容标题（可选）' },
          description: { type: 'string', description: '新的描述（可选）' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '新的优先级（可选）' },
          category: { type: 'string', description: '新的分类名称（必须是 query_todos 返回的 availableCategories 中的值，不可自行编造）' },
          dueDate: { type: 'string', description: '新的单点时间 YYYY-MM-DDTHH:mm（可选）' },
          timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '新的时间类型（可选）' },
          startDateTime: { type: 'string', description: '新的时间段开始时间 YYYY-MM-DDTHH:mm（可选）' },
          endDateTime: { type: 'string', description: '新的时间段结束时间 YYYY-MM-DDTHH:mm（可选）' },
          durationMinutes: { type: 'number', description: '新的时长分钟（可选，配合 startDateTime 使用）' },
          isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请在权限面板中开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.id);
      if (!todo) return { success: false, error: `未找到 id 为「${args.id}」的待办事项。` };
      const updates: Partial<TodoItem> = {};
      if (typeof args.content === 'string') updates.content = args.content.trim();
      if (typeof args.description === 'string') updates.description = args.description;
      if (['high', 'medium', 'low'].includes(args.priority)) updates.priority = args.priority;
      if (typeof args.category === 'string') {
        const catName = args.category.trim();
        if (catName && !ctx.todoCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${ctx.todoCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
        }
        updates.category = catName;
      }
      const schedule = resolveTodoSchedulePayload(args);
      if (schedule.error) {
        return { success: false, error: schedule.error };
      }
      Object.assign(updates, schedule.updates);
      if (typeof args.isCompleted === 'boolean') {
        updates.isCompleted = args.isCompleted;
        if (args.isCompleted) updates.completedAt = Date.now();
      }
      ctx.onUpdateTodo(args.id, updates);
      return { success: true, message: `待办「${todo.content}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_todo',
    module: 'todo',
    tool: {
      name: 'delete_todo',
      description: '删除一条待办事项。优先用 id 删除；若没有 id，可传 content 做精确匹配。若重名项超过一条，工具会要求先 query_todos 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id' },
          content: { type: 'string', description: '待办标题。仅在没有 id 时使用，会先精确匹配。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const match = resolveTodoMatch(ctx.todos, args);
      if (!match.todo) return { success: false, error: match.error || '未找到待办事项。' };
      ctx.onDeleteTodo(match.todo.id, { skipConfirm: true });
      return { success: true, message: `待办「${match.todo.content}」已删除` };
    },
  },
  // ─── 子任务工具 ───
  {
    name: 'query_subtasks',
    module: 'todo',
    tool: {
      name: 'query_subtasks',
      description: '查询某条待办事项的所有子任务。需要先 query_todos 获取待办 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
        },
        required: ['todoId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请开启「待办事项」读取权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtasks = todo.subtasks || [];
      return {
        success: true,
        todoId: todo.id,
        todoContent: todo.content,
        total: subtasks.length,
        completed: subtasks.filter(s => s.isCompleted).length,
        subtasks: subtasks.map(s => ({ id: s.id, content: s.content, isCompleted: s.isCompleted })),
      };
    },
  },
  {
    name: 'create_subtask',
    module: 'todo',
    tool: {
      name: 'create_subtask',
      description: '为某条待办事项添加一个或多个子任务。需要同时创建多个子任务时，请将所有内容一次性放入 contents 数组，而不是多次调用此工具（多次调用会因状态竞争导致只保留最后一个）。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          contents: { type: 'array', items: { type: 'string' }, description: '子任务内容列表，支持一次传入多个，如 ["阅读", "写作"]' },
        },
        required: ['todoId', 'contents'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const rawList: string[] = Array.isArray(args.contents)
        ? args.contents.map((c: unknown) => String(c).trim()).filter(Boolean)
        : (typeof args.contents === 'string' ? [String(args.contents).trim()] : []);
      if (rawList.length === 0) return { success: false, error: 'contents 不能为空。' };
      const newSubtasks: SubTask[] = rawList.map(content => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        content,
        isCompleted: false,
      }));
      const subtasks = [...(todo.subtasks || []), ...newSubtasks];
      ctx.onUpdateTodo(args.todoId, { subtasks });
      const names = newSubtasks.map(s => `「${s.content}」`).join('、');
      return { success: true, message: `已为「${todo.content}」添加 ${newSubtasks.length} 个子任务：${names}`, subtasks: newSubtasks };
    },
  },
  {
    name: 'update_subtask',
    module: 'todo',
    tool: {
      name: 'update_subtask',
      description: '修改某条待办事项的子任务（内容或完成状态）。需要先 query_subtasks 获取子任务 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          subtaskId: { type: 'string', description: '子任务的 id' },
          content: { type: 'string', description: '新的子任务内容（可选）' },
          isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
        },
        required: ['todoId', 'subtaskId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtasks = [...(todo.subtasks || [])];
      const idx = subtasks.findIndex(s => s.id === args.subtaskId);
      if (idx === -1) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
      if (typeof args.content === 'string') subtasks[idx] = { ...subtasks[idx], content: args.content.trim() };
      if (typeof args.isCompleted === 'boolean') subtasks[idx] = { ...subtasks[idx], isCompleted: args.isCompleted };
      ctx.onUpdateTodo(args.todoId, { subtasks });
      return { success: true, message: `子任务「${subtasks[idx].content}」已更新`, subtask: subtasks[idx] };
    },
  },
  {
    name: 'delete_subtask',
    module: 'todo',
    tool: {
      name: 'delete_subtask',
      description: '删除某条待办事项的子任务。需要先 query_subtasks 获取子任务 id。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          subtaskId: { type: 'string', description: '子任务的 id' },
        },
        required: ['todoId', 'subtaskId'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const subtask = (todo.subtasks || []).find(s => s.id === args.subtaskId);
      if (!subtask) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
      const subtasks = (todo.subtasks || []).filter(s => s.id !== args.subtaskId);
      ctx.onUpdateTodo(args.todoId, { subtasks });
      return { success: true, message: `子任务「${subtask.content}」已删除` };
    },
  },
  {
    name: 'query_notes',
    module: 'notes',
    tool: {
      name: 'query_notes',
      description: '查询当前所有便签笔记。',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '便签查询未授权。请在权限面板中开启「待办事项」读取权限。' };
      const limit = Math.min(Number(args.limit) || 20, 50);
      const result = ctx.notes.slice(0, limit).map(n => ({
        id: n.id,
        content: n.content,
        color: n.color,
        createdAt: new Date(n.createdAt).toLocaleString('zh-CN'),
      }));
      return { success: true, total: ctx.notes.length, returned: result.length, notes: result };
    },
  },
  {
    name: 'update_note',
    module: 'notes',
    tool: {
      name: 'update_note',
      description: '修改一条已有的便签笔记。需要先 query_notes 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签的 id' },
          content: { type: 'string', description: '新的内容（可选）' },
          color: { type: 'string', enum: ['bg-yellow-100', 'bg-green-100', 'bg-blue-100', 'bg-pink-100', 'bg-purple-100', 'bg-orange-100'], description: '新的颜色（可选）' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '便签修改未授权。请在权限面板中开启「待办事项」写入权限。' };
      const note = ctx.notes.find(n => n.id === args.id);
      if (!note) return { success: false, error: `未找到 id 为「${args.id}」的便签。` };
      const updates: Partial<Note> = {};
      if (typeof args.content === 'string') updates.content = args.content;
      if (typeof args.color === 'string') updates.color = args.color;
      ctx.onUpdateNote(args.id, updates);
      return { success: true, message: '便签已更新', updated: updates };
    },
  },
  {
    name: 'delete_note',
    module: 'notes',
    tool: {
      name: 'delete_note',
      description: '删除一条便签笔记。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '便签的 id' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '便签删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const note = ctx.notes.find(n => n.id === args.id);
      if (!note) return { success: false, error: `未找到 id 为「${args.id}」的便签。` };
      ctx.onDeleteNote(args.id);
      return { success: true, message: '便签已删除' };
    },
  },
  {
    name: 'update_resource',
    module: 'datacenter',
    tool: {
      name: 'update_resource',
      description: '修改一条已有的资源记录。需要先 query_resources 获取资源名称，再通过名称匹配修改。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要修改的资源名称（精确匹配）' },
          newName: { type: 'string', description: '新名称（可选）' },
          expireDate: { type: 'string', description: '新的到期日期 YYYY-MM-DD（可选）' },
          capacityUsed: { type: 'number', description: '新的已用容量（可选）' },
          capacityTotal: { type: 'number', description: '新的总容量（可选）' },
          costAmount: { type: 'number', description: '新的费用金额（可选）' },
          note: { type: 'string', description: '新的备注（可选）' },
          autoRenewal: { type: 'boolean', description: '是否自动续费（可选）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.write) return { success: false, error: '资源修改未授权。请在权限面板中开启「资源中心」写入权限。' };
      const item = ctx.resourceData.items.find(i => i.name === args.name);
      if (!item) return { success: false, error: `未找到名为「${args.name}」的资源。` };
      const updates: Partial<ResourceItem> = {};
      if (typeof args.newName === 'string') updates.name = args.newName.trim();
      if (typeof args.expireDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.expireDate)) updates.expireDate = args.expireDate;
      if (typeof args.note === 'string') updates.note = args.note;
      if (typeof args.autoRenewal === 'boolean') updates.autoRenewal = args.autoRenewal;
      if (item.capacity && (args.capacityUsed !== undefined || args.capacityTotal !== undefined)) {
        updates.capacity = {
          used: typeof args.capacityUsed === 'number' ? args.capacityUsed : item.capacity.used,
          total: typeof args.capacityTotal === 'number' ? args.capacityTotal : item.capacity.total,
          unit: item.capacity.unit,
        };
      }
      if (item.cost && typeof args.costAmount === 'number') {
        updates.cost = { ...item.cost, amount: args.costAmount };
      }
      ctx.onUpdateResource(item.id, updates);
      return { success: true, message: `资源「${item.name}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_resource',
    module: 'datacenter',
    tool: {
      name: 'delete_resource',
      description: '删除一条资源记录。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要删除的资源名称（精确匹配）' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.write) return { success: false, error: '资源删除未授权。请在权限面板中开启「资源中心」写入权限。' };
      const item = ctx.resourceData.items.find(i => i.name === args.name);
      if (!item) return { success: false, error: `未找到名为「${args.name}」的资源。` };
      ctx.onDeleteResource(item.id);
      return { success: true, message: `资源「${item.name}」已删除` };
    },
  },
  // ─── 文件管理工具（需分类授权）───
  {
    name: 'query_files',
    module: 'files',
    tool: {
      name: 'query_files',
      description: '查询文件管理模块中的文件列表。可按分类筛选、按名称搜索。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '按分类筛选（可选，不传则返回所有已授权分类的文件）' },
          keyword: { type: 'string', description: '按文件名或备注搜索（可选）' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.filePermissions.length === 0) return { success: false, error: '未授权任何文件分类。请点击右侧 📂 按钮，勾选要授权的文件分类。' };
      let items = ctx.fileRecords.filter(f => ctx.filePermissions.includes(f.category) || ctx.filePermissions.includes('全部'));
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        if (!ctx.filePermissions.includes(cat) && !ctx.filePermissions.includes('全部')) {
          return { success: false, error: `分类「${cat}」未授权。当前已授权：${ctx.filePermissions.join('、')}` };
        }
        items = items.filter(f => f.category === cat);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        items = items.filter(f => f.name.toLowerCase().includes(kw) || f.note.toLowerCase().includes(kw));
      }
      const limit = Math.min(Number(args.limit) || 20, 50);
      const result = items.slice(0, limit).map(f => ({ id: f.id, name: f.name, type: f.type, category: f.category, importance: f.importance, note: f.note || null }));
      return { success: true, total: items.length, returned: result.length, files: result, authorizedCategories: ctx.filePermissions, hint: '以上仅为文件元信息。如需查看文件内容，请对每个文件调用 read_file 工具并传入对应的 id。' };
    },
  },
  {
    name: 'read_file',
    module: 'files',
    tool: {
      name: 'read_file',
      description: '读取文件管理模块中某个文件的内容。需要先 query_files 获取文件 id。仅支持文本类文件（md、txt、json 等）。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '文件的 id（从 query_files 结果中获取）' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      const file = ctx.fileRecords.find(f => f.id === args.id);
      if (!file) return { success: false, error: `未找到 id 为「${args.id}」的文件。` };
      if (!ctx.filePermissions.includes(file.category) && !ctx.filePermissions.includes('全部')) {
        return { success: false, error: `文件「${file.name}」所在分类「${file.category}」未授权。` };
      }
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.readFile) return { success: false, error: '文件读取不可用（非桌面端）。' };
      const content = await electronAPI.readFile(file.path);
      if (content === null) return { success: false, error: `读取失败：文件「${file.name}」不存在或无法读取。` };
      const MAX_LEN = 50000;
      const truncated = content.length > MAX_LEN;
      return {
        success: true,
        id: file.id,
        name: file.name,
        category: file.category,
        content: truncated ? content.slice(0, MAX_LEN) : content,
        length: content.length,
        truncated,
      };
    },
  },
  // ─── 图床工具 ───
  {
    name: 'query_images',
    module: 'image',
    tool: {
      name: 'query_images',
      description: '查询图床中已有的图片。可按名称或分类搜索，返回图片的 URL 和 Markdown 链接。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，匹配图片文件名或显示名称（可选，不传则返回全部）' },
          category: { type: 'string', description: '按分类筛选（可选）' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
        required: [],
      },
    },
    execute: async (args) => {
      let records: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        records = records.filter((r: any) => r.category === cat || (!r.category && cat === '未分类'));
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        records = records.filter((r: any) =>
          (r.filename || '').toLowerCase().includes(kw) || (r.name || '').toLowerCase().includes(kw)
        );
      }
      records.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 20;
      const sliced = records.slice(0, limit);
      // 收集所有可用分类
      const allRecords: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      const categories = [...new Set(allRecords.map((r: any) => r.category || '未分类'))];
      return {
        success: true,
        total: records.length,
        returned: sliced.length,
        categories,
        images: sliced.map((r: any) => ({
          name: r.name || r.filename,
          filename: r.filename,
          url: r.url,
          markdown: `![${r.name || r.filename}](${r.url})`,
          category: r.category || '未分类',
          createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : null,
        })),
      };
    },
  },
  {
    name: 'upload_image',
    module: 'image',
    tool: {
      name: 'upload_image',
      description: '将用户发送的图片附件上传到图床（Gitee 仓库），并返回访问链接。用户必须在消息中附带图片。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '图片显示名称（可选，不传则使用文件名）' },
          category: { type: 'string', description: '图床分类名称（可选，默认"未分类"）' },
          attachmentIndex: { type: 'number', description: '上传第几个图片附件（从 0 开始，默认 0 即第一个图片）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      // 1. 获取图床配置
      const configStr = localStorage.getItem('linkmaster_image_config_v1');
      if (!configStr) return { success: false, error: '图床未配置。请在「图床管理」中设置 Gitee 配置。' };
      let imgConfig: any;
      try { imgConfig = JSON.parse(configStr); } catch { return { success: false, error: '图床配置格式错误。' }; }
      if (!imgConfig.accessToken || !imgConfig.owner || !imgConfig.repo) return { success: false, error: '图床配置不完整（缺少 accessToken / owner / repo）。' };

      // 2. 获取用户附件中的图片
      const attachments = ctx.lastUserAttachments || [];
      const imageAttachments = attachments.filter(a => a.type === 'image' && a.base64);
      if (imageAttachments.length === 0) return { success: false, error: '未找到图片附件。请在消息中附带图片后再调用此工具。' };
      const idx = typeof args.attachmentIndex === 'number' ? args.attachmentIndex : 0;
      if (idx < 0 || idx >= imageAttachments.length) return { success: false, error: `图片索引 ${idx} 超出范围，当前共 ${imageAttachments.length} 个图片附件。` };
      const attachment = imageAttachments[idx];

      // 3. 生成唯一文件名并上传
      const ext = (attachment.name || 'image.png').split('.').pop()?.toLowerCase() || 'png';
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).slice(2, 9);
      const filename = `${timestamp}_${randomStr}.${ext}`;
      const uploadPath = imgConfig.path ? `${imgConfig.path}/${filename}` : filename;

      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.uploadImage) return { success: false, error: '上传功能不可用（非桌面端）。' };

      const result = await electronAPI.uploadImage({
        accessToken: imgConfig.accessToken,
        owner: imgConfig.owner,
        repo: imgConfig.repo,
        path: uploadPath,
        content: attachment.base64,
        message: `Upload ${filename} via Agent`,
      });

      if (!result || !result.content) return { success: false, error: `上传失败：${result?.message || '未知错误'}` };

      // 4. 创建图片记录并保存
      const displayName = (typeof args.name === 'string' && args.name.trim()) ? args.name.trim() : (attachment.name || filename);
      const category = (typeof args.category === 'string' && args.category.trim()) ? args.category.trim() : '未分类';
      const newRecord = {
        id: timestamp.toString(),
        filename,
        name: displayName,
        url: result.content.download_url,
        sha: result.content.sha,
        path: result.content.path,
        category,
        createdAt: Date.now(),
      };
      // 保存到 localStorage 并触发事件通知 App
      const existing: any[] = JSON.parse(localStorage.getItem('linkmaster_image_records_v1') || '[]');
      existing.unshift(newRecord);
      localStorage.setItem('linkmaster_image_records_v1', JSON.stringify(existing));
      // 通过自定义事件通知 App 更新状态
      window.dispatchEvent(new CustomEvent('guyue:image-record-added', { detail: newRecord }));

      return {
        success: true,
        message: `图片已上传至图床：${displayName}`,
        url: result.content.download_url,
        markdown: `![${displayName}](${result.content.download_url})`,
        name: displayName,
        category,
      };
    },
  },
  // ─── 通讯录查询工具 ───
  {
    name: 'query_contacts',
    module: 'email',
    tool: {
      name: 'query_contacts',
      description: '查询通讯录联系人，可按关键词搜索简称、邮箱或备注。用户提到联系人名字时，先用此工具查找对应的邮箱地址。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，匹配简称、邮箱或备注' },
        },
        required: [],
      },
    },
    execute: async (args) => {
      const contacts = loadContacts();
      if (contacts.length === 0) return { success: true, total: 0, contacts: [], hint: '通讯录为空，请让用户在邮件设置面板中添加联系人。' };
      const kw = (typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '');
      const matched = kw ? contacts.filter(c =>
        c.nickname.toLowerCase().includes(kw) || c.email.toLowerCase().includes(kw) || c.note.toLowerCase().includes(kw)
      ) : contacts;
      return {
        success: true,
        total: matched.length,
        contacts: matched.map(c => ({ id: c.id, nickname: c.nickname, email: c.email, note: c.note || null })),
      };
    },
  },
  // ─── 邮件发送工具（二次确认） ───
  {
    name: 'send_email',
    module: 'email',
    tool: {
      name: 'send_email',
      description: '发送一封邮件。调用后不会立即发送，系统将生成一张确认卡片展示给用户，用户手动确认后才真正发出。你只需提供主题、正文和收件人即可。',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: '邮件主题' },
          content: { type: 'string', description: '邮件正文，支持 HTML 标签（如 <h1>、<p>、<ul> 等）' },
          recipient: { type: 'string', description: '收件人邮箱地址（可选，不传则使用系统设置中的默认收件人）' },
        },
        required: ['subject', 'content'],
      },
    },
    execute: async (args) => {
      const configStr = localStorage.getItem('linkmaster_email_config');
      if (!configStr) return { success: false, error: '邮箱未配置。请在「设置 → 邮箱配置」中完成 SMTP 设置。' };
      let config: EmailConfig;
      try { config = JSON.parse(configStr); } catch { return { success: false, error: '邮箱配置格式错误，请重新设置。' }; }
      if (!config.enabled) return { success: false, error: '邮箱功能未启用。请在「设置 → 邮箱配置」中开启。' };
      if (!config.smtp?.host || !config.smtp?.user || !config.smtp?.pass) return { success: false, error: '邮箱 SMTP 配置不完整，请检查设置。' };

      const recipient = (typeof args.recipient === 'string' && args.recipient.trim()) ? args.recipient.trim() : config.recipient;
      if (!recipient) return { success: false, error: '收件人地址为空，请指定收件人或在设置中配置默认收件人。' };

      // 查找通讯录匹配的简称（用于显示）
      const contacts = loadContacts();
      const contactMatch = contacts.find(c => c.email === recipient);
      const displayName = contactMatch ? `${contactMatch.nickname} <${recipient}>` : recipient;

      // 不立即发送，返回待确认状态
      const confirmationId = crypto.randomUUID();
      return {
        success: true,
        pendingConfirmation: true,
        confirmationId,
        confirmationType: 'send_email',
        recipient,
        recipientDisplay: displayName,
        subject: String(args.subject || '').trim(),
        contentPreview: String(args.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
        fullContent: String(args.content || ''),
        message: `邮件已准备好，等待用户确认发送。收件人：${displayName}，主题：${args.subject}`,
      };
    },
  },
  // ─── 重复事件工具 ───
  {
    name: 'query_recurring_events',
    module: 'todo',
    tool: {
      name: 'query_recurring_events',
      description: '查询所有重复事件（循环日程），返回标题、分类及其唯一 ID、重复规则、时间等信息。创建重复事件前必须先调用此工具获取分类 ID。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 availableCategories[].id 获取）。不传返回全部。' },
          onlyActive: { type: 'boolean', description: '是否只返回已激活的事件，默认 true' },
          limit: { type: 'number', description: '最多返回条数，默认 30' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.read) return { success: false, error: '重复事件查询未授权。请在权限面板中开启「待办事项」读取权限。' };
      let items = ctx.recurringEvents;
      const onlyActive = args.onlyActive !== false;
      if (onlyActive) items = items.filter(e => e.isActive);
      if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
        const catId = args.categoryId.trim();
        const matchedCat = ctx.recurringCategories.find(c => c.id === catId);
        if (matchedCat) items = items.filter(e => e.category === matchedCat.name);
      }
      const limit = Math.min(Number(args.limit) || 30, 50);
      const WEEKDAY = ['日','一','二','三','四','五','六'];
      const result = items.slice(0, limit).map(e => {
        let recurrenceDesc = '';
        if (e.interval === 1) {
          recurrenceDesc = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[e.recurrence] || e.recurrence;
        } else {
          const unit = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }[e.recurrence] || e.recurrence;
          recurrenceDesc = `每 ${e.interval} ${unit}`;
        }
        if (e.recurrence === 'weekly' && e.weekDays?.length) {
          recurrenceDesc += `（${e.weekDays.sort((a,b)=>a-b).map(d=>'周'+WEEKDAY[d]).join('、')}）`;
        }
        const timeDesc = e.allDay ? '全天' : (() => {
          const h = Math.floor((e.startTime??0)/60), m = (e.startTime??0)%60;
          const dur = e.duration ?? 60;
          const eh = Math.floor(((e.startTime??0)+dur)/60) % 24, em = ((e.startTime??0)+dur) % 60;
          return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} – ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
        })();
        return {
          id: e.id,
          title: e.title,
          category: e.category,
          recurrence: recurrenceDesc,
          time: timeDesc,
          startDate: new Date(e.startDate).toLocaleDateString('zh-CN'),
          endDate: e.endDate ? new Date(e.endDate).toLocaleDateString('zh-CN') : null,
          isActive: e.isActive,
          description: e.description || null,
        };
      });
      const availableCats = ctx.recurringCategories.map(c => ({ id: c.id, name: c.name }));
      return { success: true, total: items.length, returned: result.length, availableCategories: availableCats, recurringEvents: result };
    },
  },
  {
    name: 'create_recurring_event',
    module: 'todo',
    tool: {
      name: 'create_recurring_event',
      description: '创建一个重复事件（循环日程）。调用前必须先 query_recurring_events 获取分类列表及其 ID，用 categoryId 指定分类。若已有分类均不合适，请先调用 create_recurring_category 创建新分类。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事件标题，如"高数课"、"周例会"' },
          description: { type: 'string', description: '备注描述（可选）' },
          categoryId: { type: 'string', description: '分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取）。' },
          recurrence: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], description: '重复类型：daily=每天，weekly=每周，monthly=每月，yearly=每年' },
          interval: { type: 'number', description: '重复间隔，如 interval=2 配合 weekly 表示每两周。默认 1。' },
          weekDays: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 }, description: '每周重复时指定星期几（0=周日，1=周一…6=周六）。仅在 recurrence="weekly" 时生效。' },
          startDate: { type: 'string', description: '重复开始日期，格式 YYYY-MM-DD，默认今天' },
          endDate: { type: 'string', description: '重复结束日期，格式 YYYY-MM-DD（可选，不传表示永久）' },
          allDay: { type: 'boolean', description: '是否为全天事件。默认 false。' },
          startTime: { type: 'string', description: '开始时间，格式 HH:mm，如 "09:00"。allDay=false 时有效。' },
          duration: { type: 'number', description: '时长（分钟），如 90 表示 1.5 小时。allDay=false 时有效，默认 60。' },
          color: { type: 'string', description: '事件颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）（可选）' },
        },
        required: ['title', 'recurrence'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const title = (typeof args.title === 'string' ? args.title.trim() : '') || '新重复事件';
      const recurrence = (['daily','weekly','monthly','yearly'].includes(args.recurrence) ? args.recurrence : 'weekly') as RecurringEvent['recurrence'];
      const interval = Math.max(Number(args.interval) || 1, 1);

      // 日期解析
      const parseDate = (s: string | undefined) => {
        if (!s) return undefined;
        const ts = new Date(s + 'T00:00:00').getTime();
        return isNaN(ts) ? undefined : ts;
      };
      const startDate = parseDate(args.startDate) ?? Date.now();
      const endDate = parseDate(args.endDate);

      // 时间解析
      const allDay = args.allDay === true;
      let startTimeMin: number | undefined;
      let duration: number | undefined;
      if (!allDay && typeof args.startTime === 'string') {
        const [h, m] = args.startTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) startTimeMin = h * 60 + m;
        duration = Math.max(Number(args.duration) || 60, 15);
      }

      // 分类匹配：通过 ID 精确查找
      const catId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
      const matchedCat = catId ? ctx.recurringCategories.find(c => c.id === catId) : null;
      if (catId && !matchedCat) {
        const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
        return { success: false, error: `分类 ID「${catId}」不存在。当前可用分类：${available}。请先调用 query_recurring_events 获取正确的分类 ID。` };
      }
      const categoryValue = matchedCat?.name || '未分类';

      const weekDays = recurrence === 'weekly' && Array.isArray(args.weekDays) && args.weekDays.length > 0
        ? args.weekDays.filter((d: number) => d >= 0 && d <= 6)
        : undefined;

      const eventData: Partial<RecurringEvent> = {
        title,
        description: typeof args.description === 'string' ? args.description.trim() || undefined : undefined,
        category: categoryValue,
        recurrence,
        interval,
        weekDays,
        startDate,
        endDate,
        allDay,
        startTime: startTimeMin,
        duration,
        color: typeof args.color === 'string' ? args.color : undefined,
      };
      ctx.onCreateRecurring(eventData);
      return { success: true, message: `重复事件「${title}」已创建（${recurrence}，分类：${categoryValue}）`, event: eventData };
    },
  },
  {
    name: 'update_recurring_event',
    module: 'todo',
    tool: {
      name: 'update_recurring_event',
      description: '修改一个已有的重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可；都知道时优先传 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '重复事件的 id（从 query_recurring_events 获取，与 eventTitle 二选一）' },
          eventTitle: { type: 'string', description: '要修改的事件当前标题（精确匹配，与 id 二选一）' },
          title: { type: 'string', description: '新标题（可选）' },
          description: { type: 'string', description: '新描述（可选）' },
          categoryId: { type: 'string', description: '新分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取，可选）' },
          isActive: { type: 'boolean', description: '是否激活（可选）' },
          endDate: { type: 'string', description: '新的结束日期 YYYY-MM-DD（可选）' },
          weekDays: { type: 'array', items: { type: 'number' }, description: '新的每周星期几（仅 weekly，可选）' },
          startTime: { type: 'string', description: '新的开始时间 HH:mm（可选）' },
          duration: { type: 'number', description: '新的时长分钟（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件修改未授权。请在权限面板中开启「待办事项」写入权限。' };
      const event = args.id
        ? ctx.recurringEvents.find(e => e.id === args.id)
        : ctx.recurringEvents.find(e => e.title === args.eventTitle);
      if (!event) {
        if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
        const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
        return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
      }
      const updates: Partial<RecurringEvent> = {};
      if (typeof args.title === 'string') updates.title = args.title.trim();
      if (typeof args.description === 'string') updates.description = args.description.trim() || undefined;
      if (typeof args.isActive === 'boolean') updates.isActive = args.isActive;
      if (typeof args.categoryId === 'string') {
        const matched = ctx.recurringCategories.find(c => c.id === args.categoryId.trim());
        if (!matched) {
          const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。` };
        }
        updates.category = matched.name;
      }
      if (typeof args.endDate === 'string') {
        const ts = new Date(args.endDate + 'T23:59:59').getTime();
        if (!isNaN(ts)) updates.endDate = ts;
      }
      if (Array.isArray(args.weekDays)) updates.weekDays = args.weekDays.filter((d:number) => d>=0 && d<=6);
      if (typeof args.startTime === 'string') {
        const [h, m] = args.startTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) updates.startTime = h * 60 + m;
      }
      if (typeof args.duration === 'number') updates.duration = Math.max(args.duration, 15);
      ctx.onUpdateRecurring(event.id, updates);
      return { success: true, message: `重复事件「${event.title}」已更新`, updated: updates };
    },
  },
  {
    name: 'delete_recurring_event',
    module: 'todo',
    tool: {
      name: 'delete_recurring_event',
      description: '删除一个重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '重复事件的 id（与 eventTitle 二选一）' },
          eventTitle: { type: 'string', description: '要删除的事件标题（精确匹配，与 id 二选一）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const event = args.id
        ? ctx.recurringEvents.find(e => e.id === args.id)
        : ctx.recurringEvents.find(e => e.title === args.eventTitle);
      if (!event) {
        if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
        const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
        return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
      }
      ctx.onDeleteRecurring(event.id);
      return { success: true, message: `重复事件「${event.title}」已删除` };
    },
  },
  {
    name: 'create_recurring_category',
    module: 'todo',
    tool: {
      name: 'create_recurring_category',
      description: '创建一个新的重复事件分类。当已有分类（课程、工作、健身、生活等）都不适合时，先调用此工具创建新分类，再调用 create_recurring_event 使用该分类名称。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称，如"学习"、"医疗"、"社交"' },
          color: { type: 'string', description: '分类颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）、"#ec4899"（粉）。不传则自动分配。' },
        },
        required: ['name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      if (ctx.recurringCategories.find(c => c.name === name)) {
        return { success: false, error: `分类「${name}」已存在，无需重复创建。` };
      }
      const PRESET_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#ef4444','#14b8a6','#f59e0b'];
      const usedColors = new Set(ctx.recurringCategories.map(c => c.color));
      const color = (typeof args.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.color.trim()))
        ? args.color.trim()
        : (PRESET_COLORS.find(c => !usedColors.has(c)) ?? PRESET_COLORS[ctx.recurringCategories.length % PRESET_COLORS.length]);
      const newCat = { id: `rc-${Date.now()}`, name, color };
      ctx.onUpdateRecurringCategories([...ctx.recurringCategories, newCat]);
      const allNames = [...ctx.recurringCategories.map(c => c.name), name].join('、');
      return { success: true, message: `分类「${name}」已创建（颜色：${color}）。现有全部分类：${allNames}`, category: newCat };
    },
  },
  {
    name: 'create_category',
    module: 'todo',
    tool: {
      name: 'create_category',
      description: '为待办事项（todo）、技能卡（prompts）或 Markdown 笔记（markdown）创建新分类。当 create_todo / create_prompt / create_markdown_note 校验失败提示分类不存在时，先调用此工具创建新分类，再重试。',
      inputSchema: {
        type: 'object',
        properties: {
          module: { type: 'string', enum: ['todo', 'prompts', 'markdown'], description: '要添加分类的模块：todo=待办事项，prompts=技能卡，markdown=Markdown 笔记' },
          name: { type: 'string', description: '分类名称，如"学习"、"生活"、"项目"' },
        },
        required: ['module', 'name'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
      const moduleKey = args.module as string;
      if (!['todo', 'prompts', 'markdown'].includes(moduleKey)) return { success: false, error: 'module 参数必须是 todo、prompts 或 markdown 之一。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const currentList = moduleKey === 'todo' ? ctx.todoCategories : moduleKey === 'prompts' ? ctx.promptCategories : ctx.markdownCategories;
      if (currentList.includes(name)) {
        return { success: false, error: `分类「${name}」在「${moduleKey}」中已存在，无需重复创建。` };
      }
      ctx.onAddCategory(moduleKey, name);
      const allNames = [...currentList, name].join('、');
      return { success: true, message: `分类「${name}」已添加到「${moduleKey}」。现有全部分类：${allNames}` };
    },
  },
  // ─── 知识库工具 ───
  {
    name: 'search_knowledge_base',
    module: 'knowledge',
    tool: {
      name: 'search_knowledge_base',
      description: '在用户的本地知识库文件中进行语义搜索，返回最相关的内容片段及来源文件名。回答与用户文件相关的问题时，请优先调用此工具。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索问题或关键词，使用自然语言描述你要查找的内容' },
          topK: { type: 'number', description: '返回最相关片段数量，默认 5，最多 10' },
        },
        required: ['query'],
      },
    },
    execute: async (args, ctx) => {
      const { apiKey: embeddingApiKey, baseUrl: embeddingBaseUrl } = getEmbeddingKeyFromProfiles();
      if (!embeddingApiKey) {
        return { success: false, error: '未配置知识库 Embedding API Key。请在全局设置中添加 API 配置，或在 Agent 右侧栏点击知识库图标并配置 Gemini API Key。' };
      }
      const kbFileIds = ctx.knowledgeBaseFileIds;
      if (kbFileIds.size === 0) {
        return { success: false, error: '知识库中没有文件。请先在文件管理模块中悬停文件、点击绿色脑图标将文件加入知识库。' };
      }
      const kbFiles = ctx.fileRecords.filter(f => kbFileIds.has(f.id));
      if (kbFiles.length === 0) {
        return { success: false, error: '知识库文件已不存在，请重新添加。' };
      }
      try {
        let index = await loadRagIndex();
        const progressLogs: string[] = [];
        index = await buildIndex(kbFiles, index, embeddingApiKey, msg => progressLogs.push(msg), embeddingBaseUrl);
        await saveRagIndex(index);
        const topK = Math.min(Math.max(typeof args.topK === 'number' ? args.topK : 5, 1), 10);
        const results = await searchIndex(args.query as string, index, embeddingApiKey, topK, embeddingBaseUrl);
        if (results.length === 0) {
          return { success: true, results: [], message: '知识库中未找到与该问题相关的内容。', indexLog: progressLogs };
        }
        const formatted = results.map(r => ({
          source: r.fileName,
          relevance: Math.round(r.score * 100) / 100,
          content: r.text,
        }));
        return {
          success: true,
          results: formatted,
          message: `找到 ${results.length} 条相关内容，请基于以下内容回答，并在回答末尾注明"来源：文件名"。`,
          indexLog: progressLogs.length > 0 ? progressLogs : undefined,
        };
      } catch (e) {
        return { success: false, error: `知识库检索失败：${(e as Error).message}` };
      }
    },
  },
  {
    name: 'build_knowledge_base',
    module: 'knowledge',
    tool: {
      name: 'build_knowledge_base',
      description: '对知识库中所有文件建立或更新向量索引。首次使用或文件更新后调用，完成后 search_knowledge_base 才能检索到最新内容。',
      inputSchema: {
        type: 'object',
        properties: {
          forceRebuild: { type: 'boolean', description: '是否强制重建所有文件的索引（默认 false，仅索引新文件）' },
        },
      },
    },
    execute: async (args, ctx) => {
      const { apiKey: embeddingApiKey, baseUrl: embeddingBaseUrl } = getEmbeddingKeyFromProfiles();
      if (!embeddingApiKey) {
        return { success: false, error: '未配置知识库 Embedding API Key。请在全局设置中添加 API 配置。' };
      }
      const kbFileIds = ctx.knowledgeBaseFileIds;
      if (kbFileIds.size === 0) {
        return { success: false, error: '知识库中没有文件，请先在文件管理模块添加文件。' };
      }
      const kbFiles = ctx.fileRecords.filter(f => kbFileIds.has(f.id));
      try {
        const existingIndex = args.forceRebuild ? [] : await loadRagIndex();
        const progressLogs: string[] = [];
        const newIndex = await buildIndex(kbFiles, existingIndex as any[], embeddingApiKey, msg => progressLogs.push(msg), embeddingBaseUrl);
        await saveRagIndex(newIndex);
        const chunkCount = newIndex.filter((c: any) => kbFileIds.has(c.fileId)).length;
        return {
          success: true,
          message: `✅ 知识库索引构建完成！共 ${kbFiles.length} 个文件，${chunkCount} 个文本块。`,
          details: progressLogs,
        };
      } catch (e) {
        return { success: false, error: `索引构建失败：${(e as Error).message}` };
      }
    },
  },
  // ─── LaTeX 模块工具 ───────────────────────────────────────────────────────────
  {
    name: 'query_latex_file_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_file_categories',
      description: '查询 LaTeX 文件分类列表（含唯一 ID）。操作文件前必须先调用此工具获取分类 ID。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetFileCategories) return { success: false, error: 'LaTeX API 不可用。' };
      const categories = await electronAPI.latexGetFileCategories();
      return { success: true, categories, hint: '使用 categoryId 参数操作文件。如需新分类，调用 create_latex_file_category。' };
    },
  },
  {
    name: 'create_latex_file_category',
    module: 'latex',
    tool: {
      name: 'create_latex_file_category',
      description: '创建新的 LaTeX 文件分类。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称' },
        },
        required: ['name'],
      },
    },
    execute: async (args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetFileCategories) return { success: false, error: 'LaTeX API 不可用。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const existing: any[] = await electronAPI.latexGetFileCategories();
      if (existing.some((c: any) => c.name === name)) {
        return { success: false, error: `分类「${name}」已存在。`, existingCategory: existing.find((c: any) => c.name === name) };
      }
      const newCat = { id: crypto.randomUUID(), name };
      const updated = [...existing, newCat];
      await electronAPI.latexSaveFileCategories(updated);
      // Auto-authorize the new category
      _ctx.onAutoAuthLatexFileCategory(newCat.id);
      return { success: true, message: `文件分类「${name}」已创建并已自动授权。`, category: newCat };
    },
  },
  {
    name: 'query_latex_files',
    module: 'latex',
    tool: {
      name: 'query_latex_files',
      description: '查询 LaTeX 托管文件列表。可按分类 ID 筛选、按文件名搜索。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '按分类 ID 筛选（可选）' },
          keyword: { type: 'string', description: '按文件名搜索（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexFileReadPermissions.length === 0) return { success: false, error: '未授权任何 LaTeX 文件分类的读取权限。请点击右侧 LaTeX 权限按钮，勾选要授权的分类。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexListFiles) return { success: false, error: 'LaTeX API 不可用。' };
      let files: any[] = await electronAPI.latexListFiles();
      // Filter by read permission
      files = files.filter(f => {
        const cat = f.category || '__uncategorized__';
        return ctx.latexFileReadPermissions.includes(cat) || ctx.latexFileReadPermissions.includes('__all__');
      });
      if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
        const catId = args.categoryId.trim();
        if (!ctx.latexFileReadPermissions.includes(catId) && !ctx.latexFileReadPermissions.includes('__all__')) {
          return { success: false, error: `分类「${catId}」未授权读取。当前已授权读取：${ctx.latexFileReadPermissions.join('、')}` };
        }
        files = files.filter(f => (f.category || '__uncategorized__') === catId);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        files = files.filter(f => f.name.toLowerCase().includes(kw));
      }
      const result = files.map((f: any) => {
        const fCat = f.category || '__uncategorized__';
        const writable = ctx.latexFileWritePermissions.includes(fCat) || ctx.latexFileWritePermissions.includes('__all__');
        return { name: f.name, path: f.path, size: f.size, modifiedAt: f.modifiedAt, category: f.category || null, writable };
      });
      return { success: true, total: result.length, files: result, readableCategories: ctx.latexFileReadPermissions, writableCategories: ctx.latexFileWritePermissions };
    },
  },
  {
    name: 'read_latex_file',
    module: 'latex',
    tool: {
      name: 'read_latex_file',
      description: '读取一个 LaTeX 托管文件的内容。通过文件路径定位。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件的完整路径（从 query_latex_files 结果中获取）' },
        },
        required: ['filePath'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexOpenManagedFile) return { success: false, error: 'LaTeX API 不可用。' };
      // Check read permission by looking up the file's category
      const files: any[] = await electronAPI.latexListFiles();
      const file = files.find((f: any) => f.path === args.filePath);
      if (!file) return { success: false, error: `未找到文件「${args.filePath}」。` };
      const cat = file.category || '__uncategorized__';
      if (!ctx.latexFileReadPermissions.includes(cat) && !ctx.latexFileReadPermissions.includes('__all__')) {
        return { success: false, error: `文件所在分类未授权读取。` };
      }
      const result = await electronAPI.latexOpenManagedFile(args.filePath);
      if (!result) return { success: false, error: '文件读取失败。' };
      const writable = ctx.latexFileWritePermissions.includes(cat) || ctx.latexFileWritePermissions.includes('__all__');
      return { success: true, name: file.name, path: result.path, content: result.content, length: result.content.length, writable };
    },
  },
  {
    name: 'edit_latex_file',
    module: 'latex',
    tool: {
      name: 'edit_latex_file',
      description: '修改一个 LaTeX 托管文件的内容。需要提供完整的新文件内容。',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件路径（从 query_latex_files 获取）' },
          content: { type: 'string', description: '新的完整文件内容' },
        },
        required: ['filePath', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveManagedFile) return { success: false, error: 'LaTeX API 不可用。' };
      const files: any[] = await electronAPI.latexListFiles();
      const file = files.find((f: any) => f.path === args.filePath);
      if (!file) return { success: false, error: `未找到文件「${args.filePath}」。` };
      const cat = file.category || '__uncategorized__';
      if (!ctx.latexFileWritePermissions.includes(cat) && !ctx.latexFileWritePermissions.includes('__all__')) {
        return { success: false, error: '文件所在分类未授权写入。请在权限面板中开启该分类的编辑权限。' };
      }
      const ok = await electronAPI.latexSaveManagedFile({ filePath: args.filePath, content: args.content });
      if (!ok) return { success: false, error: '文件保存失败。' };
      return { success: true, message: `文件「${file.name}」已更新。`, length: args.content.length };
    },
  },
  {
    name: 'query_latex_template_categories',
    module: 'latex',
    tool: {
      name: 'query_latex_template_categories',
      description: '查询 LaTeX 模板分类列表（含唯一 ID）。创建/查询模板时需先调用此工具。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    execute: async (_args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      // Derive unique categories from templates
      const catSet = new Map<string, string>();
      templates.forEach((t: any) => {
        const cat = t.category || 'custom';
        if (!catSet.has(cat)) catSet.set(cat, cat); // category name is used as both id and name for templates
      });
      const categories = Array.from(catSet.entries()).map(([id, name]) => ({ id, name }));
      return { success: true, categories, hint: '模板分类的 ID 即是分类名称字符串。' };
    },
  },
  {
    name: 'create_latex_template_category',
    module: 'latex',
    tool: {
      name: 'create_latex_template_category',
      description: '创建新的 LaTeX 模板分类。会创建一个占位模板使分类出现。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '分类名称' },
        },
        required: ['name'],
      },
    },
    execute: async (args, _ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX API 不可用。' };
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      if (templates.some((t: any) => t.category === name)) {
        return { success: false, error: `模板分类「${name}」已存在。` };
      }
      const placeholder = {
        id: `cat-${Date.now()}`,
        name: '新模板',
        content: '% 新模板\n\\documentclass{article}\n\\begin{document}\n\n\\end{document}',
        category: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await electronAPI.latexSaveTemplate(placeholder);
      // Auto-authorize the new template category
      _ctx.onAutoAuthLatexTemplateCategory(name);
      return { success: true, message: `模板分类「${name}」已创建并已自动授权。`, categoryId: name };
    },
  },
  {
    name: 'query_latex_templates',
    module: 'latex',
    tool: {
      name: 'query_latex_templates',
      description: '查询 LaTeX 模板列表。可按分类筛选。需要对应分类的权限。',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '按分类名称筛选（可选，即 query_latex_template_categories 返回的 id）' },
          keyword: { type: 'string', description: '按模板名称搜索（可选）' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (ctx.latexTemplatePermissions.length === 0) return { success: false, error: '未授权任何 LaTeX 模板分类。请点击右侧 LaTeX 权限按钮，勾选要授权的分类。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      let templates: any[] = await electronAPI.latexGetTemplates();
      // Filter by permission
      templates = templates.filter(t => {
        const cat = t.category || 'custom';
        return ctx.latexTemplatePermissions.includes(cat) || ctx.latexTemplatePermissions.includes('__all__');
      });
      if (typeof args.category === 'string' && args.category.trim()) {
        const cat = args.category.trim();
        if (!ctx.latexTemplatePermissions.includes(cat) && !ctx.latexTemplatePermissions.includes('__all__')) {
          return { success: false, error: `模板分类「${cat}」未授权。` };
        }
        templates = templates.filter(t => t.category === cat);
      }
      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const kw = args.keyword.trim().toLowerCase();
        templates = templates.filter(t => t.name.toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw));
      }
      const result = templates.map(t => ({ id: t.id, name: t.name, description: t.description || null, category: t.category, hasContent: !!t.content }));
      return { success: true, total: result.length, templates: result };
    },
  },
  {
    name: 'read_latex_template',
    module: 'latex',
    tool: {
      name: 'read_latex_template',
      description: '读取一个 LaTeX 模板的完整内容。通过模板 ID 定位（从 query_latex_templates 结果中获取）。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: '模板 ID（从 query_latex_templates 结果中获取）' },
        },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      const tpl = templates.find((t: any) => t.id === args.templateId);
      if (!tpl) return { success: false, error: `未找到模板「${args.templateId}」。` };
      const cat = tpl.category || 'custom';
      if (!ctx.latexTemplatePermissions.includes(cat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `模板所在分类「${cat}」未授权。` };
      }
      return { success: true, id: tpl.id, name: tpl.name, description: tpl.description || null, category: tpl.category, content: tpl.content, length: (tpl.content || '').length };
    },
  },
  {
    name: 'create_latex_template',
    module: 'latex',
    tool: {
      name: 'create_latex_template',
      description: '创建一个新的 LaTeX 模板。需提供名称、分类和完整的 .tex 源码内容。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '模板名称' },
          description: { type: 'string', description: '模板描述（可选）' },
          category: { type: 'string', description: '分类名称（从 query_latex_template_categories 获取，或新分类名）' },
          content: { type: 'string', description: '完整的 .tex 源码内容' },
        },
        required: ['name', 'category', 'content'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate) return { success: false, error: 'LaTeX API 不可用。' };
      const cat = typeof args.category === 'string' ? args.category.trim() : 'custom';
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '模板名称不能为空。' };
      const content = typeof args.content === 'string' ? args.content : '';
      const tpl = {
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        description: typeof args.description === 'string' ? args.description.trim() || undefined : undefined,
        content,
        category: cat,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(tpl);
      if (!ok) return { success: false, error: '模板保存失败。' };
      // If category is new, auto-authorize it
      if (!ctx.latexTemplatePermissions.includes(cat)) {
        ctx.onAutoAuthLatexTemplateCategory(cat);
      }
      return { success: true, message: `模板「${name}」已创建。`, id: tpl.id, category: cat };
    },
  },
  {
    name: 'edit_latex_template',
    module: 'latex',
    tool: {
      name: 'edit_latex_template',
      description: '修改一个已有的 LaTeX 模板。可更新名称、描述、分类或内容。',
      inputSchema: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: '模板 ID（从 query_latex_templates 获取）' },
          name: { type: 'string', description: '新的模板名称（可选）' },
          description: { type: 'string', description: '新的描述（可选）' },
          category: { type: 'string', description: '新的分类（可选）' },
          content: { type: 'string', description: '新的完整 .tex 源码内容（可选）' },
        },
        required: ['templateId'],
      },
    },
    execute: async (args, ctx) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.latexSaveTemplate || !electronAPI?.latexGetTemplates) return { success: false, error: 'LaTeX API 不可用。' };
      const templates: any[] = await electronAPI.latexGetTemplates();
      const tpl = templates.find((t: any) => t.id === args.templateId);
      if (!tpl) return { success: false, error: `未找到模板「${args.templateId}」。` };
      const oldCat = tpl.category || 'custom';
      if (!ctx.latexTemplatePermissions.includes(oldCat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `模板所在分类「${oldCat}」未授权。` };
      }
      const newCat = typeof args.category === 'string' && args.category.trim() ? args.category.trim() : oldCat;
      if (newCat !== oldCat && !ctx.latexTemplatePermissions.includes(newCat) && !ctx.latexTemplatePermissions.includes('__all__')) {
        return { success: false, error: `目标分类「${newCat}」未授权。` };
      }
      const updated = {
        ...tpl,
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : tpl.name,
        description: typeof args.description === 'string' ? (args.description.trim() || undefined) : tpl.description,
        category: newCat,
        content: typeof args.content === 'string' ? args.content : tpl.content,
        updatedAt: Date.now(),
      };
      const ok = await electronAPI.latexSaveTemplate(updated);
      if (!ok) return { success: false, error: '模板保存失败。' };
      return { success: true, message: `模板「${updated.name}」已更新。`, id: tpl.id };
    },
  },
];

/* ─── Agent 网络搜索工具定义 ─── */
const WEB_SEARCH_TOOL: ChatTool = {
  name: 'web_search',
  description: '使用 Bing 搜索互联网上的实时信息。当需要获取最新资讯、天气、新闻、查询事实等时使用。返回结果包含 directAnswer（直答卡，如天气数据）和 results（搜索条目列表）。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或问题，中英文均可' },
    },
    required: ['query'],
  },
};

/** 获取所有已启用模块的工具（如指定 selectedModule 则只返回该模块的） */
const getAllNativeTools = (selectedModule?: string | null, enableWebSearch?: boolean): ChatTool[] => {
  const enabledModuleIds = new Set(ENABLED_AGENT_MODULES.map(m => m.id));
  const tools = TOOL_REGISTRY
    .filter(reg => enabledModuleIds.has(reg.module))
    .filter(reg => !selectedModule || reg.module === selectedModule)
    .map(reg => reg.tool);
  if (enableWebSearch) tools.push(WEB_SEARCH_TOOL);
  return tools;
};

/** 根据工具名查找注册项 */
const findToolRegistration = (toolName: string): ToolRegistration | undefined =>
  TOOL_REGISTRY.find(reg => reg.name === toolName);

/** 从工具名推断所属模块 */
const getModuleByToolName = (toolName: string): string | undefined =>
  TOOL_REGISTRY.find(reg => reg.name === toolName)?.module;

/** 当模型最终回复为空时，基于实际工具调用生成具体的执行摘要 */
const generateToolCallSummary = (toolCalls: ChatToolCall[]): string => {
  if (toolCalls.length === 0) return '已处理完成。';

  const TOOL_LABELS: Record<string, string> = {
    create_todo: '创建待办', create_note: '创建便签', create_prompt: '创建技能卡',
    create_markdown_note: '创建 Markdown 笔记', create_oj_submission: '创建做题记录',
    create_resource: '创建资源', create_leetcode_list: '创建 LeetCode 题单',
    create_learning_course: '创建学习课程', create_subtask: '创建子任务',
    create_recurring_event: '创建重复事件', create_recurring_category: '创建重复分类', create_category: '创建分类',
    update_todo: '更新待办', update_note: '更新便签', update_resource: '更新资源',
    update_subtask: '更新子任务', update_recurring_event: '更新重复事件',
    delete_todo: '删除待办', delete_note: '删除便签', delete_resource: '删除资源',
    delete_subtask: '删除子任务', delete_recurring_event: '删除重复事件',
    send_email: '发送邮件', query_contacts: '查询通讯录',
    query_todos: '查询待办', query_notes: '查询便签', query_prompts: '查询技能卡',
    query_markdown_notes: '查询笔记', query_resources: '查询资源',
    query_leetcode_lists: '查询题单', query_learning_courses: '查询课程',
    query_files: '查询文件', read_file: '读取文件',
    query_images: '查询图片', upload_image: '上传图片',
    query_subtasks: '查询子任务', query_recurring_events: '查询重复事件',
    query_latex_file_categories: '查询 LaTeX 文件分类', create_latex_file_category: '创建 LaTeX 文件分类',
    query_latex_files: '查询 LaTeX 文件', read_latex_file: '读取 LaTeX 文件', edit_latex_file: '编辑 LaTeX 文件',
    query_latex_template_categories: '查询模板分类', create_latex_template_category: '创建模板分类',
    query_latex_templates: '查询 LaTeX 模板', read_latex_template: '读取 LaTeX 模板',
    create_latex_template: '创建 LaTeX 模板', edit_latex_template: '编辑 LaTeX 模板',
  };

  const lines: string[] = [];
  for (const tc of toolCalls) {
    const label = TOOL_LABELS[tc.name] || tc.name;
    const args = tc.arguments || {};
    // 提取一个关键标识字段作为摘要
    const key = args.content || args.title || args.name || args.subject || args.keyword || args.category || args.id || '';
    const brief = typeof key === 'string' && key.length > 40 ? key.slice(0, 40) + '…' : key;
    lines.push(brief ? `- ${label}：${brief}` : `- ${label}`);
  }

  if (lines.length === 1) {
    return `✅ 已完成操作：\n${lines[0]}`;
  }
  return `✅ 已完成 ${lines.length} 项操作：\n${lines.join('\n')}`;
};

const parseLocalDateTimeString = (value: string, dateOnlyTime: 'start' | 'end' = 'end'): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T${dateOnlyTime === 'start' ? '00:00:00' : '23:59:00'}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}:00`;
  }

  const parsed = new Date(normalized).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;
  return undefined;
};

const parseDueDateString = (value: any): number | undefined => {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return parseLocalDateTimeString(value, 'end');
};

const resolveTodoSchedulePayload = (data: Record<string, any>): { updates: Partial<TodoItem>; error?: string } => {
  const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  const explicitTimeType = typeof data.timeType === 'string' ? data.timeType : undefined;
  const startRaw = data.startDateTime ?? data.timeStart;
  const endRaw = data.endDateTime ?? data.timeEnd;
  const startDateTime = typeof startRaw === 'number'
    ? startRaw
    : (typeof startRaw === 'string' ? parseLocalDateTimeString(startRaw.trim(), 'start') : undefined);
  const endDateTime = typeof endRaw === 'number'
    ? endRaw
    : (typeof endRaw === 'string' ? parseLocalDateTimeString(endRaw.trim(), 'start') : undefined);
  const durationMinutes = Number(data.durationMinutes ?? data.duration);
  const hasRangeIntent = explicitTimeType === 'range'
    || hasKey('startDateTime')
    || hasKey('endDateTime')
    || hasKey('timeStart')
    || hasKey('timeEnd')
    || hasKey('durationMinutes')
    || hasKey('duration');

  if (hasRangeIntent) {
    if (!startDateTime) {
      return { updates: {}, error: '时间段事件缺少合法的开始时间 startDateTime。请使用 YYYY-MM-DDTHH:mm 格式。' };
    }
    const computedEnd = endDateTime
      ?? ((Number.isFinite(durationMinutes) && durationMinutes > 0)
        ? startDateTime + durationMinutes * 60_000
        : startDateTime + 60 * 60_000);
    if (computedEnd <= startDateTime) {
      return { updates: {}, error: '时间段事件的结束时间必须晚于开始时间。' };
    }
    return {
      updates: {
        timeType: 'range',
        timeStart: startDateTime,
        timeEnd: computedEnd,
        dueDate: undefined,
      },
    };
  }

  if (hasKey('dueDate') || explicitTimeType === 'point' || explicitTimeType === 'allday') {
    const rawDueDate = data.dueDate ?? data.startDateTime;
    const dueDate = parseDueDateString(rawDueDate);
    if (rawDueDate !== undefined && dueDate === undefined) {
      return { updates: {}, error: 'dueDate 格式不合法，请使用 YYYY-MM-DDTHH:mm。' };
    }
    if (dueDate !== undefined) {
      const dueString = typeof rawDueDate === 'string' ? rawDueDate.trim() : '';
      const inferredType: TodoItem['timeType'] =
        explicitTimeType === 'allday'
          ? 'allday'
          : (dueString && !dueString.includes('T') ? 'allday' : 'point');
      return {
        updates: {
          dueDate,
          timeType: inferredType,
          timeStart: undefined,
          timeEnd: undefined,
        },
      };
    }
  }

  return { updates: {} };
};

const resolveTodoMatch = (
  todos: TodoItem[],
  args: Record<string, any>,
): { todo?: TodoItem; error?: string } => {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  const content = typeof args.content === 'string' ? args.content.trim() : '';

  if (id) {
    const todo = todos.find((item) => item.id === id);
    return todo ? { todo } : { error: `未找到 id 为「${id}」的待办事项。` };
  }

  if (!content) {
    return { error: '必须提供待办 id，或提供 content 进行精确匹配删除。' };
  }

  const exactMatches = todos.filter((item) => item.content === content);
  if (exactMatches.length === 1) return { todo: exactMatches[0] };
  if (exactMatches.length > 1) {
    return {
      error: `找到 ${exactMatches.length} 条同名待办「${content}」。请先 query_todos 获取准确 id 后再删除。候选 id：${exactMatches.map((item) => item.id).join('、')}`,
    };
  }

  const fuzzyMatches = todos.filter((item) => item.content.includes(content));
  if (fuzzyMatches.length === 1) return { todo: fuzzyMatches[0] };
  if (fuzzyMatches.length > 1) {
    return {
      error: `找到多条包含「${content}」的待办。请先 query_todos 获取准确 id 后再删除。候选：${fuzzyMatches.map((item) => `${item.content}(${item.id})`).join('、')}`,
    };
  }

  return { error: `未找到标题为「${content}」的待办事项。` };
};

const normalizeTodoPayload = (data: Record<string, any>): Partial<TodoItem> => {
  const schedule = resolveTodoSchedulePayload(data);
  return {
    content: typeof data.content === 'string' && data.content.trim() ? data.content.trim() : '新事项',
    description: typeof data.description === 'string' ? data.description : undefined,
    isCompleted: false,
    priority: data.priority === 'high' || data.priority === 'low' ? data.priority : 'medium',
    category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : '未分类',
    ...schedule.updates,
  };
};

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
  ojHeatmapData,
  onCreateResource,
  onUpdateResource,
  onDeleteResource,
  resourceData,
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
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = loadAgentHistory();
    if (saved.length === 0) {
      return [createAgentWelcomeMessage()];
    }
    return saved;
  });
  const [inputValue, setInputValue] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [config, setConfig] = useState<ChatConfig>(() => loadAgentConfig());
  const [modulePrompts, setModulePrompts] = useState<Record<string, string>>(() => loadModulePrompts());
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [dataPermissions, setDataPermissions] = useState<DataPermissions>(() => loadAgentPermissions().data);
  const [filePermissions, setFilePermissions] = useState<string[]>(() => loadAgentPermissions().files);
  const [showFilePermissions, setShowFilePermissions] = useState(false);
  const [latexFileReadPermissions, setLatexFileReadPermissions] = useState<string[]>(() => {
    try { const s = localStorage.getItem('guyue_agent_latex_permissions'); if (s) { const p = JSON.parse(s); return Array.isArray(p.fileRead) ? p.fileRead : Array.isArray(p.files) ? p.files : []; } } catch {} return [];
  });
  const [latexFileWritePermissions, setLatexFileWritePermissions] = useState<string[]>(() => {
    try { const s = localStorage.getItem('guyue_agent_latex_permissions'); if (s) { const p = JSON.parse(s); return Array.isArray(p.fileWrite) ? p.fileWrite : []; } } catch {} return [];
  });
  const [latexTemplatePermissions, setLatexTemplatePermissions] = useState<string[]>(() => {
    try { const s = localStorage.getItem('guyue_agent_latex_permissions'); if (s) { const p = JSON.parse(s); return Array.isArray(p.templates) ? p.templates : []; } } catch {} return [];
  });
  const [showLatexPermissions, setShowLatexPermissions] = useState(false);
  const [latexFileCategories, setLatexFileCategories] = useState<{id: string; name: string}[]>([]);
  const [latexTemplateCategories, setLatexTemplateCategories] = useState<string[]>([]);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailConfig, setEmailConfig] = useState<AgentEmailConfig>(() => {
    try { const s = localStorage.getItem(AGENT_EMAIL_CONFIG_KEY); return s ? JSON.parse(s) : DEFAULT_AGENT_EMAIL_CONFIG; } catch { return DEFAULT_AGENT_EMAIL_CONFIG; }
  });
  const [emailTestStatus, setEmailTestStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [emailTestError, setEmailTestError] = useState('');
  const [contacts, setContacts] = useState<Contact[]>(() => loadContacts());
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showContactList, setShowContactList] = useState(false);
  const [isModuleCollapsed, setIsModuleCollapsed] = useState(false);
  const [isDebugCollapsed, setIsDebugCollapsed] = useState(true);
  const [expandedDebugIds, setExpandedDebugIds] = useState<Set<string>>(new Set());
  const [debugItems, setDebugItems] = useState<AgentDebugItem[]>([]);
  const [enableWebSearch, setEnableWebSearch] = useState(() =>
    localStorage.getItem('guyue_agent_web_search') === 'true'
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatServiceRef = useRef<ChatService | null>(null);
  const supportsNativeTools = useMemo(() => isNativeProvider(config.provider), [config.provider]);
  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];

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

  const handleModuleClick = (moduleId: string) => {
    const module = getModuleById(moduleId);
    if (!module?.enabled) return;
    setSelectedModule(current => current === moduleId ? null : moduleId);
  };

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
        selectedModule,
        promptMode: supportsNativeTools ? 'native-tools' : 'fallback',
        customSystemPrompt: config.systemPrompt,
        modulePrompts,
      }),
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('guyue_agent_web_search', enableWebSearch ? 'true' : 'false');
  }, [enableWebSearch]);

  useEffect(() => {
    saveAgentConfig(config);
    saveModulePrompts(modulePrompts);
    if (chatServiceRef.current) {
      chatServiceRef.current.updateConfig({
        ...config,
        systemPrompt: getAgentSystemPrompt({
          selectedModule,
          promptMode: supportsNativeTools ? 'native-tools' : 'fallback',
          customSystemPrompt: config.systemPrompt,
          modulePrompts,
        }),
      });
    }
  }, [config, modulePrompts, selectedModule, supportsNativeTools]);

  useEffect(() => {
    saveAgentHistory(messages.filter(m => m.id !== 'welcome'));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setShowPermissions(false);
    }
  }, [isOpen]);

  useEffect(() => {
    saveAgentPermissions(dataPermissions, filePermissions);
  }, [dataPermissions, filePermissions]);

  // Save latex permissions
  useEffect(() => {
    localStorage.setItem('guyue_agent_latex_permissions', JSON.stringify({ fileRead: latexFileReadPermissions, fileWrite: latexFileWritePermissions, templates: latexTemplatePermissions }));
  }, [latexFileReadPermissions, latexFileWritePermissions, latexTemplatePermissions]);

  // Load latex categories on mount
  useEffect(() => {
    const loadLatexCats = async () => {
      try {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.latexGetFileCategories) {
          const cats = await electronAPI.latexGetFileCategories();
          setLatexFileCategories(Array.isArray(cats) ? cats : []);
        }
        if (electronAPI?.latexGetTemplates) {
          const templates = await electronAPI.latexGetTemplates();
          const catSet = new Set<string>();
          templates.forEach((t: any) => catSet.add(t.category || 'custom'));
          setLatexTemplateCategories(Array.from(catSet));
        }
      } catch { /* ignore */ }
    };
    loadLatexCats();
  }, []);

  const detectTargetModule = useCallback(async (input: string): Promise<string | null> => {
    // 原生模式下不需要路由——tools 自路由，这里只用于 fallback 模式
    if (selectedModule) {
      pushDebugItem({
        stage: 'router:selected-module',
        summary: '使用用户手动选中的模块',
        payload: { module: selectedModule },
      });
      return selectedModule;
    }

    const localIntent = parseIntentLocally(input);
    if (localIntent.suggestedModule) {
      pushDebugItem({
        stage: 'router:local-intent',
        summary: '本地意图规则命中模块',
        payload: {
          suggestedModule: localIntent.suggestedModule,
          parsedData: localIntent.data,
        },
      });
      return localIntent.suggestedModule;
    }

    return null;
  }, [pushDebugItem, selectedModule]);

  const runFallbackConversation = useCallback(async (
    assistantId: string,
    userMessage: AgentMessage,
    routedModule: string | null,
  ) => {
    const chatMessages: ChatMessage[] = [
      {
        id: 'system',
        role: 'system',
        content: getAgentSystemPrompt({
          selectedModule,
          routedModule,
          promptMode: 'fallback',
          customSystemPrompt: config.systemPrompt,
          modulePrompts,
        }),
        timestamp: 0,
      },
      ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-6).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
        attachments: m.attachments,
      })),
      { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp, attachments: userMessage.attachments },
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
          message.id === assistantId ? { ...message, content: fullResponse, targetModule: routedModule || undefined } : message
        ));
      },
      onComplete: async (text) => {
        pushDebugItem({
          stage: 'fallback:response',
          summary: '兼容模式流式回复完成',
          payload: { text },
        });

        const actionFromModel = parseAgentAction(text);
        const localIntent = !actionFromModel && routedModule === 'todo'
          ? parseIntentLocally(userMessage.content)
          : { isCreateTodo: false };
        const action = actionFromModel || (localIntent.isCreateTodo
          ? { type: 'create_todo', status: 'pending', data: localIntent.data }
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
            ? { ...message, content: displayContent || '...', action: action || undefined, targetModule: routedModule || undefined }
            : message
        ));

        if (action?.status === 'pending') {
          try {
            let resultData: any;
            let summaryText = '';
            let pendingConfirm: PendingConfirmation | undefined;

            if (action.type === 'create_todo') {
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
              if (!emailCfg.enabled) throw new Error('邮箱功能未启用。请在设置中开启。');
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
              if (filePermissions.length === 0) throw new Error('未授权任何文件分类。请点击右侧 📂 按钮勾选分类。');
              let items = fileRecords.filter(f => filePermissions.includes(f.category) || filePermissions.includes('全部'));
              if (typeof d.category === 'string' && d.category.trim()) {
                const cat = d.category.trim();
                if (!filePermissions.includes(cat) && !filePermissions.includes('全部')) throw new Error(`分类「${cat}」未授权。`);
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
              if (!filePermissions.includes(file.category) && !filePermissions.includes('全部')) throw new Error(`文件「${file.name}」所在分类未授权。`);
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
              const imageAttachments = (currentAttachments || []).filter(a => a.type === 'image' && a.base64);
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
                message.id === assistantId ? { ...message, action: { ...action, status: 'success', data: resultData }, ...(pendingConfirm ? { pendingConfirmation: pendingConfirm } : {}) } : message
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
          message.id === assistantId ? { ...message, content: `❌ 发生错误: ${error.message}`, targetModule: routedModule || undefined } : message
        ));
        setIsProcessing(false);
      },
    });
  }, [config.model, config.provider, config.systemPrompt, messages, todos, dataPermissions, filePermissions, fileRecords, onCreateTodo, onCreateNote, onCreatePrompt, onCreateMarkdownNote, onCreateOJSubmission, ojHeatmapData, onCreateResource, resourceData, pushDebugItem, selectedModule]);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if ((!trimmedInput && pendingAttachments.length === 0) || isProcessing) return;

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
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput || (currentAttachments ? `[已上传 ${currentAttachments.length} 个文件]` : ''),
      timestamp: Date.now(),
      targetModule: selectedModule || undefined,
      attachments: currentAttachments,
    };
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, userMessage, {
      id: assistantId,
      role: 'assistant',
      content: selectedModule ? '正在处理任务...' : '正在判断任务归属...',
      timestamp: Date.now(),
    }]);
    setInputValue('');
    setPendingAttachments([]);
    setIsProcessing(true);

    resetTurnDebug();
    pushDebugItem({
      stage: 'send:start',
      summary: '新一轮 Agent 执行流程启动',
      payload: {
        provider: config.provider,
        model: config.model,
        supportsNativeTools,
        selectedModule,
        userInput: trimmedInput,
      },
    });

    try {
      if (!chatServiceRef.current) {
        throw new Error('聊天服务尚未初始化');
      }

      // 原生模式：注册所有已启用工具，让 tool_choice=auto 自路由
      const nativeTools = supportsNativeTools ? getAllNativeTools(selectedModule, enableWebSearch) : [];
      const toolExecContext: ToolExecutionContext = { todos: [...todos], notes, dataPermissions, filePermissions, fileRecords, lastUserAttachments: currentAttachments, onCreateTodo, onUpdateTodo, onDeleteTodo, onCreateNote, onUpdateNote, onDeleteNote, onCreatePrompt, onCreateMarkdownNote, onCreateOJSubmission, ojHeatmapData, onCreateResource, onUpdateResource, onDeleteResource, resourceData, recurringEvents, recurringCategories, onCreateRecurring, onUpdateRecurring, onDeleteRecurring, onUpdateRecurringCategories, todoCategories, promptCategories, markdownCategories, onAddCategory, knowledgeBaseFileIds, latexFileReadPermissions, latexFileWritePermissions, latexTemplatePermissions, onAutoAuthLatexFileCategory: (catId: string) => { setLatexFileReadPermissions(p => p.includes(catId) ? p : [...p, catId]); setLatexFileWritePermissions(p => p.includes(catId) ? p : [...p, catId]); }, onAutoAuthLatexTemplateCategory: (catName: string) => { setLatexTemplatePermissions(p => p.includes(catName) ? p : [...p, catName]); } };

      pushDebugItem({
        stage: 'send:routing-result',
        summary: '任务路由完成',
        payload: {
          selectedModule,
          nativeToolCount: nativeTools.length,
          nativeToolNames: nativeTools.map(t => t.name),
          mode: supportsNativeTools && nativeTools.length > 0 ? 'native-tools (self-route)' : 'fallback',
        },
      });

      if (supportsNativeTools && nativeTools.length > 0) {
        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? { ...message, content: '正在调用工具...' }
            : message
        ));

        const chatMessages: ChatMessage[] = [
          {
            id: 'system',
            role: 'system',
            content: getAgentSystemPrompt({
              selectedModule,
              promptMode: 'native-tools',
              customSystemPrompt: config.systemPrompt || '',
              modulePrompts,
            }),
            timestamp: 0,
          },
          ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-6).map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
            attachments: m.attachments,
          })),
          { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp, attachments: userMessage.attachments },
        ];

        pushDebugItem({
          stage: 'native:request-context',
          summary: '准备原生工具模式请求上下文',
          payload: {
            messages: chatMessages,
            tools: nativeTools,
          },
        });

        let executedAction: AgentAction | undefined;
        let lastUndoSnapshot: UndoSnapshot | undefined;
        let lastPendingConfirmation: PendingConfirmation | undefined;
        const toolResult = await chatServiceRef.current.runToolsConversation(chatMessages, nativeTools, async (toolCall: ChatToolCall) => {
          pushDebugItem({
            stage: 'native:tool-call',
            summary: `模型请求工具：${toolCall.name}`,
            payload: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
          });

          // 内置网络搜索工具（不在 TOOL_REGISTRY 中，单独处理）
          if (toolCall.name === 'web_search') {
            try {
              const electronAPI = (window as any).electronAPI;
              const query = typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query.trim() : '';
              if (!query) throw new Error('搜索词不能为空');
              const result = await electronAPI.agentWebSearch({ query });
              const resultSummary = result.success
                ? `${result.directAnswer ? '直答卡 + ' : ''}${result.results?.length || 0} 条结果`
                : result.error;
              pushDebugItem({
                stage: 'web:search',
                summary: `搜索「${query}」→ ${resultSummary}`,
                payload: result,
                level: result.success ? 'success' : 'error',
              });
              return result;
            } catch (e) {
              const err = (e as Error).message;
              pushDebugItem({ stage: 'web:search', summary: `网络搜索失败：${err}`, level: 'error' });
              return { success: false, error: err };
            }
          }

          const registration = findToolRegistration(toolCall.name);
          if (!registration) {
            pushDebugItem({
              stage: 'native:tool-result',
              summary: `未知工具：${toolCall.name}`,
              payload: { toolCall },
              level: 'error',
            });
            return { success: false, error: `未知工具: ${toolCall.name}` };
          }

          // 修改/删除操作前备份快照
          if (['update_todo', 'delete_todo'].includes(toolCall.name) && toolCall.arguments.id) {
            const todo = todos.find(t => t.id === toolCall.arguments.id);
            if (todo) lastUndoSnapshot = { type: 'todo', action: toolCall.name.startsWith('delete') ? 'delete' : 'update', id: todo.id, data: { ...todo }, label: `${toolCall.name === 'delete_todo' ? '删除' : '修改'}待办「${todo.content}」` };
          } else if (['update_note', 'delete_note'].includes(toolCall.name) && toolCall.arguments.id) {
            const note = notes.find(n => n.id === toolCall.arguments.id);
            if (note) lastUndoSnapshot = { type: 'note', action: toolCall.name.startsWith('delete') ? 'delete' : 'update', id: note.id, data: { ...note }, label: `${toolCall.name === 'delete_note' ? '删除' : '修改'}便签` };
          } else if (['update_resource', 'delete_resource'].includes(toolCall.name)) {
            const items = resourceData?.categories?.flatMap(c => c.items) || [];
            const item = toolCall.arguments.name ? items.find(i => i.name === toolCall.arguments.name) : undefined;
            if (item) lastUndoSnapshot = { type: 'resource', action: toolCall.name.startsWith('delete') ? 'delete' : 'update', id: item.id, data: { ...item }, label: `${toolCall.name === 'delete_resource' ? '删除' : '修改'}资源「${item.name}」` };
          }

          try {
            const result = await registration.execute(toolCall.arguments, toolExecContext);
            const moduleName = getModuleById(registration.module)?.name || registration.module;
            executedAction = { type: toolCall.name, status: 'success', data: toolCall.arguments };

            // 检测工具返回的二次确认请求
            if (result?.pendingConfirmation && result?.confirmationId) {
              lastPendingConfirmation = {
                id: result.confirmationId,
                type: result.confirmationType || 'send_email',
                status: 'pending',
                data: result,
                summary: result.message || '操作待确认',
              };
            }

            pushDebugItem({
              stage: 'native:tool-result',
              summary: `${toolCall.name} 执行成功 [${moduleName}]`,
              payload: { input: toolCall.arguments, result },
              level: 'success',
            });
            return result;
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            pushDebugItem({
              stage: 'native:tool-error-retry',
              summary: `${toolCall.name} 执行失败，错误回传模型`,
              payload: { input: toolCall.arguments, error: errMsg },
              level: 'error',
            });
            // 返回错误信息而不是 throw，让模型看到错误并有机会在第二轮修正
            return { success: false, error: errMsg, hint: '请根据错误信息调整参数后重试' };
          }
        }, {
          onDebugEvent: pushServiceDebugEvent,
        });

        pushDebugItem({
          stage: 'native:done',
          summary: '原生工具模式执行完成',
          payload: {
            toolCalls: toolResult.toolCalls,
            finalText: toolResult.text,
          },
          level: 'success',
        });

        const inferredModule = toolResult.toolCalls.length > 0
          ? getModuleByToolName(toolResult.toolCalls[0].name)
          : undefined;

        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? {
                ...message,
                content: toolResult.text || generateToolCallSummary(toolResult.toolCalls),
                action: executedAction,
                targetModule: inferredModule,
                undoSnapshot: lastUndoSnapshot,
                pendingConfirmation: lastPendingConfirmation,
              }
            : message
        ));
        setIsProcessing(false);
        return;
      }

      // Fallback 模式路由
      const routedModule = selectedModule || parseIntentLocally(trimmedInput).suggestedModule || null;
      await runFallbackConversation(assistantId, userMessage, routedModule);
    } catch (error) {
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
      setIsProcessing(false);
    }
  }, [
    config.apiKey,
    config.model,
    config.provider,
    config.systemPrompt,
    detectTargetModule,
    inputValue,
    isProcessing,
    messages,
    onCreateTodo,
    onCreateNote,
    onCreatePrompt,
    onCreateMarkdownNote,
    pendingAttachments,
    pushDebugItem,
    pushServiceDebugEvent,
    runFallbackConversation,
    selectedModule,
    supportsNativeTools,
  ]);

  const clearHistory = () => {
    setMessages([
      createAgentWelcomeMessage('👋 对话已经清空。\n\n你可以重新选择模块，或者直接告诉我你想做什么。'),
    ]);
    localStorage.removeItem(STORAGE_KEY_AGENT_HISTORY);
    setDebugItems([]);
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
    const abortMapper = (msg: AgentMessage) =>
      msg.content === '正在处理任务...' || msg.content === '正在判断任务归属...' || msg.content === '正在调用工具...'
        ? { ...msg, content: '⏹ 已终止执行。' }
        : msg;
    setMessages(prev => prev.map(abortMapper));
    setIsProcessing(false);
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

  const handleUndo = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.undoSnapshot) return;
    const snap = msg.undoSnapshot;
    if (snap.type === 'todo') {
      if (snap.action === 'delete') {
        onCreateTodo(snap.data as Partial<TodoItem>);
      } else {
        onUpdateTodo(snap.id, snap.data as Partial<TodoItem>);
      }
    } else if (snap.type === 'note') {
      if (snap.action === 'delete') {
        onCreateNote(snap.data as Partial<Note>);
      } else {
        onUpdateNote(snap.id, snap.data as Partial<Note>);
      }
    } else if (snap.type === 'resource') {
      if (snap.action === 'delete') {
        onCreateResource(snap.data as Partial<ResourceItem>);
      } else {
        onUpdateResource(snap.id, snap.data as Partial<ResourceItem>);
      }
    }
    // 标记已回退，移除 undoSnapshot
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
  }, [messages, onCreateTodo, onUpdateTodo, onCreateNote, onUpdateNote, onCreateResource, onUpdateResource, pushDebugItem]);

  const handleSaveEmailConfig = () => {
    localStorage.setItem(AGENT_EMAIL_CONFIG_KEY, JSON.stringify(emailConfig));
    setEmailTestStatus('idle');
    setEmailTestError('');
  };

  const handleTestEmail = async () => {
    if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.pass || !emailConfig.recipient) {
      setEmailTestStatus('error'); setEmailTestError('请填写完整的邮件配置'); return;
    }
    setEmailTestStatus('loading'); setEmailTestError('');
    try {
      if ((window as any).electronAPI?.testEmailConfig) {
        const result = await (window as any).electronAPI.testEmailConfig(emailConfig);
        if (result.success) { setEmailTestStatus('success'); }
        else { setEmailTestStatus('error'); setEmailTestError(result.error || '发送失败'); }
      } else { setEmailTestStatus('error'); setEmailTestError('邮件功能仅在桌面端可用'); }
    } catch (err) { setEmailTestStatus('error'); setEmailTestError((err as Error).message); }
  };

  // ─── 通讯录管理 ───
  const handleSaveContact = (contact: Contact) => {
    setContacts(prev => {
      const isNew = !contact.id;
      if (isNew) {
        const withId = { ...contact, id: `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
        const updated = [...prev, withId];
        saveContacts(updated);
        return updated;
      }
      const updated = prev.map(c => c.id === contact.id ? contact : c);
      saveContacts(updated);
      return updated;
    });
    setEditingContact(null);
  };

  const handleDeleteContact = (id: string) => {
    setContacts(prev => {
      const updated = prev.filter(c => c.id !== id);
      saveContacts(updated);
      return updated;
    });
  };

  // ─── 二次确认操作 ───
  const handleConfirmAction = useCallback(async (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.pendingConfirmation || msg.pendingConfirmation.status !== 'pending') return;

    const pc = msg.pendingConfirmation;
    if (pc.type === 'send_email') {
      // 更新状态为处理中（复用 pending 但 UI 中会显示加载）
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, pendingConfirmation: { ...pc, status: 'confirmed' } }
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

        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: m.content + `\n\n✅ 邮件已成功发送至 ${pc.data.recipientDisplay || pc.data.recipient}`,
                pendingConfirmation: { ...pc, status: 'confirmed' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:send-email', summary: `邮件已发送至 ${pc.data.recipient}`, payload: pc.data, level: 'success' });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: m.content + `\n\n❌ 发送失败：${errMsg}`,
                pendingConfirmation: { ...pc, status: 'cancelled' },
              }
            : m
        ));
        pushDebugItem({ stage: 'confirm:send-email', summary: `邮件发送失败: ${errMsg}`, payload: pc.data, level: 'error' });
      }
    }
  }, [messages, pushDebugItem]);

  const handleCancelAction = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.pendingConfirmation?.status === 'pending'
        ? {
            ...m,
            content: m.content + '\n\n🚫 已取消发送。',
            pendingConfirmation: { ...m.pendingConfirmation!, status: 'cancelled' },
          }
        : m
    ));
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
            <div className="flex-1 min-w-0 flex flex-col" style={{ background: 'var(--t-bg-main)' }}>
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
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
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 px-5 py-4 border-t space-y-3" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-main)' }}>
                {selectedModule ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs rounded-full px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                      {(() => { const m = getModuleById(selectedModule); if (!m) return null; const Icon = m.icon; return <><Icon className="w-3 h-3" />{m.name}</>; })()}
                    </div>
                    <button onClick={() => setSelectedModule(null)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">✕ 取消限定</button>
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
                    {/* 功能模块选择 */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => { setShowModuleSelector(v => !v); setShowPermissions(false); }}
                        className={`relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${
                          selectedModule
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                            : showModuleSelector
                              ? 'text-slate-700 bg-slate-100'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="选择功能模块"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        {selectedModule && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </button>
                      {showModuleSelector && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowModuleSelector(false)} />
                          <div className="absolute bottom-full right-0 mb-2 z-50 w-48 rounded-2xl shadow-xl border overflow-hidden py-1.5" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                            <div className="px-3 py-1.5 flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-gray-500">功能模块</p>
                              {selectedModule && (
                                <button onClick={() => { setSelectedModule(null); setShowModuleSelector(false); }} className="text-[10px] text-gray-400 hover:text-gray-600">清除</button>
                              )}
                            </div>
                            {AGENT_MODULES.map((module) => {
                              const Icon = module.icon;
                              const isSelected = selectedModule === module.id;
                              return (
                                <button
                                  key={module.id}
                                  onClick={() => { handleModuleClick(module.id); setShowModuleSelector(false); }}
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
                                  <span className="text-xs font-medium">{module.name}</span>
                                  {isSelected && <CheckCircle2 className="w-3 h-3 ml-auto text-blue-500" />}
                                </button>
                              );
                            })}
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

            {/* 调试内容面板 */}
            {!isDebugCollapsed && (
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
              {/* 设置(齿轮) */}
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="API 设置"
              >
                <Settings className="w-4 h-4" />
              </button>
              {/* 邮件设置 */}
              <div className="relative">
                <button
                  onClick={() => { setShowEmailSettings(v => !v); setShowPermissions(false); setShowFilePermissions(false); setShowModuleSelector(false); setShowLatexPermissions(false); }}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                    showEmailSettings ? 'text-blue-600 bg-blue-50' : emailConfig.enabled ? 'text-blue-500 hover:bg-blue-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                  title="邮件设置"
                >
                  <Mail className="w-4 h-4" />
                  {emailConfig.enabled && !showEmailSettings && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </button>
                {showEmailSettings && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmailSettings(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-80 rounded-2xl shadow-xl border overflow-hidden" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                      <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>邮件设置</p>
                        <button
                          onClick={() => setEmailConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                          className={`transition-colors ${emailConfig.enabled ? 'text-blue-600' : 'text-gray-400'}`}
                        >
                          {emailConfig.enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                        </button>
                      </div>
                      <div className="p-4 space-y-3">
                        {!emailConfig.enabled && (
                          <p className="text-xs text-gray-400 text-center py-2">开启后配置 SMTP 即可使用 Agent 发送邮件</p>
                        )}
                        {emailConfig.enabled && (
                          <>
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Server className="w-3 h-3" />SMTP 服务器</label>
                              <div className="flex gap-2">
                                <input type="text" value={emailConfig.smtp.host} onChange={e => setEmailConfig(p => ({ ...p, smtp: { ...p.smtp, host: e.target.value } }))} placeholder="smtp.163.com" className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                                <input type="number" value={emailConfig.smtp.port} onChange={e => setEmailConfig(p => ({ ...p, smtp: { ...p.smtp, port: parseInt(e.target.value) || 465 } }))} placeholder="465" className="w-16 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <input type="checkbox" id="agent-smtp-secure" checked={emailConfig.smtp.secure} onChange={e => setEmailConfig(p => ({ ...p, smtp: { ...p.smtp, secure: e.target.checked } }))} className="rounded" />
                                <label htmlFor="agent-smtp-secure" className="text-[11px] text-gray-500">使用 SSL/TLS（端口 465 建议开启）</label>
                              </div>
                            </div>
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Mail className="w-3 h-3" />发件邮箱</label>
                              <input type="email" value={emailConfig.smtp.user} onChange={e => setEmailConfig(p => ({ ...p, smtp: { ...p.smtp, user: e.target.value } }))} placeholder="your-email@163.com" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                            </div>
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Edit3 className="w-3 h-3" />发件人显示名称</label>
                              <input type="text" value={emailConfig.senderName ?? '古月的Agent助理'} onChange={e => setEmailConfig(p => ({ ...p, senderName: e.target.value }))} placeholder="古月的Agent助理" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                              <p className="text-[11px] text-gray-400 mt-0.5">收件人看到的发件人名称</p>
                            </div>
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Key className="w-3 h-3" />授权码（非邮箱密码）</label>
                              <input type="password" value={emailConfig.smtp.pass} onChange={e => setEmailConfig(p => ({ ...p, smtp: { ...p.smtp, pass: e.target.value } }))} placeholder="SMTP 授权码" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                              <p className="text-[11px] text-gray-400 mt-0.5">163/QQ 邮箱需在设置中开启 SMTP 并获取授权码</p>
                            </div>
                            <div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Mail className="w-3 h-3" />收件邮箱</label>
                              <input type="email" value={emailConfig.recipient} onChange={e => setEmailConfig(p => ({ ...p, recipient: e.target.value }))} placeholder="receive@example.com" className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900" />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button onClick={handleTestEmail} disabled={emailTestStatus === 'loading'} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50">
                                {emailTestStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                测试
                              </button>
                              <button onClick={handleSaveEmailConfig} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                                保存
                              </button>
                            </div>
                            {emailTestStatus === 'success' && <div className="flex items-center gap-1.5 text-green-500 text-xs"><CheckCircle className="w-3.5 h-3.5" />测试邮件发送成功！</div>}
                            {emailTestStatus === 'error' && <div className="flex items-center gap-1.5 text-red-500 text-xs"><AlertCircle className="w-3.5 h-3.5" />{emailTestError}</div>}

                            {/* 通讯录 */}
                            <div className="border-t border-gray-100 pt-3 mt-1">
                              <div className="flex items-center justify-between mb-2">
                                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"><BookUser className="w-3.5 h-3.5" />通讯录</label>
                                <button
                                  onClick={() => setEditingContact({ id: '', nickname: '', email: '', note: '' })}
                                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                >
                                  <Plus className="w-3 h-3" />添加
                                </button>
                              </div>
                              {editingContact && (
                                <div className="mb-2 p-2.5 bg-gray-50 rounded-xl space-y-2 border border-gray-200">
                                  <input
                                    type="text"
                                    value={editingContact.nickname}
                                    onChange={e => setEditingContact(prev => prev ? { ...prev, nickname: e.target.value } : prev)}
                                    placeholder="简称 *"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900"
                                  />
                                  <input
                                    type="email"
                                    value={editingContact.email}
                                    onChange={e => setEditingContact(prev => prev ? { ...prev, email: e.target.value } : prev)}
                                    placeholder="邮箱 *"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900"
                                  />
                                  <input
                                    type="text"
                                    value={editingContact.note}
                                    onChange={e => setEditingContact(prev => prev ? { ...prev, note: e.target.value } : prev)}
                                    placeholder="备注（选填）"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        if (editingContact.nickname.trim() && editingContact.email.trim()) {
                                          handleSaveContact(editingContact);
                                          setEditingContact(null);
                                        }
                                      }}
                                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                                    >
                                      保存
                                    </button>
                                    <button
                                      onClick={() => setEditingContact(null)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              )}
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {contacts.length === 0 && !editingContact && (
                                  <p className="text-[11px] text-gray-400 text-center py-2">暂无联系人</p>
                                )}
                                {contacts.map(c => (
                                  <div key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 group transition-colors">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium text-gray-800 truncate">{c.nickname}</span>
                                        <span className="text-[11px] text-gray-400 truncate">{c.email}</span>
                                      </div>
                                      {c.note && <p className="text-[10px] text-gray-400 truncate">{c.note}</p>}
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button
                                        onClick={() => setEditingContact({ ...c })}
                                        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                        title="编辑"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteContact(c.id)}
                                        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        title="删除"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* 网络搜索 */}
              <button
                onClick={() => setEnableWebSearch(v => !v)}
                className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  enableWebSearch ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title={enableWebSearch ? '关闭网络搜索' : '开启网络搜索'}
              >
                <Globe className="w-4 h-4" />
                {enableWebSearch && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>
              <div className="w-5 h-px bg-slate-200 my-1" />
              {/* ── 权限组 ── */}
              {/* 数据权限(读/写) */}
              <div className="relative">
                {(() => {
                  const count = Object.values(dataPermissions).reduce((n, p) => n + (p.read ? 1 : 0) + (p.write ? 1 : 0), 0);
                  return (
                    <button
                      onClick={() => { setShowPermissions(v => !v); setShowModuleSelector(false); setShowFilePermissions(false); setShowLatexPermissions(false); }}
                      className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                        count > 0
                          ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                      title="数据权限"
                    >
                      {count > 0 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {count > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {showPermissions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPermissions(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-72 rounded-2xl shadow-xl border overflow-hidden" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>Agent 数据权限</p>
                        <button
                          onClick={() => {
                            const allOn = Object.values(dataPermissions).every(p => p.read && p.write);
                            const v = { read: !allOn, write: !allOn };
                            setDataPermissions({ todos: { ...v }, ojStats: { ...v }, resources: { ...v }, leetcodeLists: { ...v }, learningCourses: { ...v } });
                          }}
                          className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          {Object.values(dataPermissions).every(p => p.read && p.write) ? '全部关闭' : '全部开启'}
                        </button>
                      </div>
                      <div className="flex items-center px-4 pt-2.5 pb-1 text-[10px] text-gray-400 font-medium">
                        <span className="flex-1">数据类型</span>
                        <span className="w-12 text-center">读取</span>
                        <span className="w-12 text-center">修改</span>
                      </div>
                      <div className="pb-2">
                        {PERMISSION_LABELS.map(({ key, label }) => (
                          <div key={key} className="flex items-center px-4 py-2 hover:bg-gray-50 transition-colors">
                            <span className="flex-1 text-xs font-medium text-gray-700">{label}</span>
                            <div className="w-12 flex justify-center">
                              <button
                                onClick={() => setDataPermissions(prev => ({ ...prev, [key]: { ...prev[key], read: !prev[key].read } }))}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                                  dataPermissions[key].read ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                                }`}
                                title={`${label} 读取`}
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="w-12 flex justify-center">
                              <button
                                onClick={() => setDataPermissions(prev => ({ ...prev, [key]: { ...prev[key], write: !prev[key].write } }))}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                                  dataPermissions[key].write ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                                }`}
                                title={`${label} 修改`}
                              >
                                <PenLine className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* 文件分类权限 */}
              <div className="relative">
                <button
                  onClick={() => { setShowFilePermissions(v => !v); setShowPermissions(false); setShowModuleSelector(false); setShowLatexPermissions(false); }}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                    filePermissions.length > 0
                      ? 'text-green-600 bg-green-50 hover:bg-green-100'
                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                  title="文件分类权限"
                >
                  <FolderOpen className="w-4 h-4" />
                  {filePermissions.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {filePermissions.length}
                    </span>
                  )}
                </button>
                {showFilePermissions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowFilePermissions(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-64 rounded-2xl shadow-xl border overflow-hidden" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>Agent 文件权限</p>
                        <button
                          onClick={() => {
                            if (filePermissions.length === fileCategories.length) {
                              setFilePermissions([]);
                            } else {
                              setFilePermissions([...fileCategories]);
                            }
                          }}
                          className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          {filePermissions.length === fileCategories.length ? '全部关闭' : '全部开启'}
                        </button>
                      </div>
                      <div className="py-1.5 max-h-48 overflow-y-auto">
                        {fileCategories.length === 0 ? (
                          <p className="px-4 py-3 text-[11px] text-gray-400 text-center">文件管理中暂无分类</p>
                        ) : (
                          fileCategories.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setFilePermissions(prev =>
                                prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                              )}
                              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 transition-colors"
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                                filePermissions.includes(cat) ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-300'
                              }`}>
                                {filePermissions.includes(cat) && <CheckCircle2 className="w-3 h-3" />}
                              </div>
                              <FolderOpen className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="text-xs text-gray-700">{cat}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* LaTeX 分类权限 */}
              <div className="relative">
                <button
                  onClick={() => { setShowLatexPermissions(v => !v); setShowPermissions(false); setShowFilePermissions(false); setShowModuleSelector(false); }}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${showLatexPermissions ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                  title="LaTeX 分类权限"
                >
                  <FileType2 className="w-4 h-4" />
                  {(latexFileReadPermissions.length > 0 || latexFileWritePermissions.length > 0 || latexTemplatePermissions.length > 0) && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {latexFileReadPermissions.length + latexFileWritePermissions.length + latexTemplatePermissions.length}
                    </span>
                  )}
                </button>
                {showLatexPermissions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLatexPermissions(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-72 rounded-2xl shadow-xl border overflow-hidden" style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                      {/* 文件分类 */}
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>LaTeX 文件权限</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-400">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />读取</span>
                          <span className="flex items-center gap-1"><Pencil className="w-3 h-3" />编辑</span>
                        </div>
                      </div>
                      <div className="py-1.5 max-h-44 overflow-y-auto">
                        {/* 未分类 */}
                        {(() => {
                          const catId = '__uncategorized__';
                          const hasRead = latexFileReadPermissions.includes(catId);
                          const hasWrite = latexFileWritePermissions.includes(catId);
                          return (
                            <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50 transition-colors">
                              <button
                                onClick={() => setLatexFileReadPermissions(prev => {
                                  if (hasRead) {
                                    // Remove read also removes write
                                    setLatexFileWritePermissions(wp => wp.filter(c => c !== catId));
                                    return prev.filter(c => c !== catId);
                                  }
                                  return [...prev, catId];
                                })}
                                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${hasRead ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}
                                title="读取权限"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (hasWrite) {
                                    setLatexFileWritePermissions(prev => prev.filter(c => c !== catId));
                                  } else {
                                    // Grant write also grants read
                                    if (!hasRead) setLatexFileReadPermissions(prev => [...prev, catId]);
                                    setLatexFileWritePermissions(prev => [...prev, catId]);
                                  }
                                }}
                                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${hasWrite ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}
                                title="编辑权限"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-xs text-gray-500 italic flex-1 truncate">未分类</span>
                            </div>
                          );
                        })()}
                        {latexFileCategories.map((cat) => {
                          const hasRead = latexFileReadPermissions.includes(cat.id);
                          const hasWrite = latexFileWritePermissions.includes(cat.id);
                          return (
                            <div key={cat.id} className="flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50 transition-colors">
                              <button
                                onClick={() => setLatexFileReadPermissions(prev => {
                                  if (hasRead) {
                                    setLatexFileWritePermissions(wp => wp.filter(c => c !== cat.id));
                                    return prev.filter(c => c !== cat.id);
                                  }
                                  return [...prev, cat.id];
                                })}
                                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${hasRead ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}
                                title="读取权限"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (hasWrite) {
                                    setLatexFileWritePermissions(prev => prev.filter(c => c !== cat.id));
                                  } else {
                                    if (!hasRead) setLatexFileReadPermissions(prev => [...prev, cat.id]);
                                    setLatexFileWritePermissions(prev => [...prev, cat.id]);
                                  }
                                }}
                                className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${hasWrite ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}
                                title="编辑权限"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-xs text-gray-700 flex-1 truncate">{cat.name}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* 模板分类 */}
                      <div className="px-4 pt-3 pb-2 border-t border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>LaTeX 模板权限</p>
                        <button
                          onClick={() => {
                            setLatexTemplatePermissions(prev => prev.length === latexTemplateCategories.length ? [] : [...latexTemplateCategories]);
                          }}
                          className="text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                          {latexTemplatePermissions.length === latexTemplateCategories.length ? '全部关闭' : '全部开启'}
                        </button>
                      </div>
                      <div className="py-1.5 max-h-36 overflow-y-auto">
                        {latexTemplateCategories.length === 0 ? (
                          <p className="px-4 py-3 text-[11px] text-gray-400 text-center">暂无模板分类</p>
                        ) : (
                          latexTemplateCategories.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setLatexTemplatePermissions(prev =>
                                prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                              )}
                              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 transition-colors"
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                                latexTemplatePermissions.includes(cat) ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-300'
                              }`}>
                                {latexTemplatePermissions.includes(cat) && <CheckCircle2 className="w-3 h-3" />}
                              </div>
                              <span className="text-xs text-gray-700">{cat}</span>
                            </button>
                          ))
                        )}
                      </div>
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
              {/* 调试 */}
              <button
                onClick={() => setIsDebugCollapsed(v => !v)}
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
        onClearHistory={handleClearHistory}
        modules={ENABLED_AGENT_MODULES.map(m => ({ id: m.id, name: m.name }))}
        modulePrompts={modulePrompts}
        onChangeModulePrompts={setModulePrompts}
      />

      <AgentHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
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

const MessageBubble: React.FC<{
  message: AgentMessage;
  onDelete?: (messageId: string) => void;
  onUndo?: (messageId: string) => void;
  onConfirm?: (messageId: string) => void;
  onCancelConfirm?: (messageId: string) => void;
}> = ({ message, onDelete, onUndo, onConfirm, onCancelConfirm }) => {
  const isUser = message.role === 'user';
  const targetModule = getModuleById(message.targetModule);
  const canDelete = message.id !== 'welcome';
  const pc = message.pendingConfirmation;
  const userAvatar = useUserAvatar();
  
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

          {targetModule && !isUser && (
            <span className="inline-flex items-center rounded-full bg-white/80 text-gray-500 px-2 py-0.5 text-[11px] border border-gray-200">
              {targetModule.name}
            </span>
          )}
        </div>

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

        {/* 二次确认卡片 */}
        {pc && pc.type === 'send_email' && (
          <div className={`mt-3 rounded-2xl border p-3.5 ${
            pc.status === 'pending' ? 'border-blue-200 bg-blue-50/80' :
            pc.status === 'confirmed' ? 'border-green-200 bg-green-50/80' :
            'border-gray-200 bg-gray-50/80'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Mail className={`w-4 h-4 ${pc.status === 'confirmed' ? 'text-green-600' : pc.status === 'cancelled' ? 'text-gray-400' : 'text-blue-600'}`} />
              <span className={`text-xs font-semibold ${pc.status === 'confirmed' ? 'text-green-700' : pc.status === 'cancelled' ? 'text-gray-500' : 'text-blue-700'}`}>
                {pc.status === 'pending' ? '📮 邮件待确认' : pc.status === 'confirmed' ? '✅ 邮件已发送' : '🚫 已取消发送'}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-700">
              <div className="flex gap-2">
                <span className="text-gray-500 shrink-0 w-10">收件人</span>
                <span className="font-medium">{pc.data.recipientDisplay || pc.data.recipient}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 shrink-0 w-10">主题</span>
                <span className="font-medium">{pc.data.subject}</span>
              </div>
              {pc.data.contentPreview && (
                <div className="flex gap-2">
                  <span className="text-gray-500 shrink-0 w-10">内容</span>
                  <span className="text-gray-600 line-clamp-3">{pc.data.contentPreview}</span>
                </div>
              )}
            </div>
            {pc.status === 'pending' && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => onConfirm?.(message.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-sm"
                >
                  <Send className="w-3 h-3" />
                  确认发送
                </button>
                <button
                  onClick={() => onCancelConfirm?.(message.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-600 rounded-xl transition-colors border border-gray-200"
                >
                  <X className="w-3 h-3" />
                  取消
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
