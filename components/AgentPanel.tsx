import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertCircle, ListTodo, Settings, Settings2, StickyNote, FolderOpen, Command, Globe, Code2, GraduationCap, Image, MessageSquare, Pencil, BarChart3, HelpCircle, ChevronDown, ChevronUp, ChevronRight, Bug, Trash2, Paperclip, FileText, Trophy, HardDrive, Lock, Unlock, LayoutGrid, Eye, PenLine, Mail } from 'lucide-react';
import type { TodoItem, Note, PromptRecord, MarkdownNote, OJSubmission, OJHeatmapData, ResourceItem, ResourceCenterData, EmailConfig, SubTask, FileRecord, Category } from '../types';
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
  { id: 'notes',      name: '笔记备忘', icon: StickyNote,  enabled: true,  description: '创建便签笔记' },
  { id: 'files',      name: '文件管理', icon: FolderOpen,  enabled: true,  description: '查询、读取文件管理中的文件（需授权分类）' },
  { id: 'prompts',    name: 'Skills',    icon: Sparkles,   enabled: true,  description: '创建 Prompt 技能卡' },
  { id: 'markdown',   name: 'Markdown',  icon: Pencil,     enabled: true,  description: '创建 Markdown 笔记' },
  { id: 'leetcode',   name: '刷题',     icon: Code2,         enabled: true,  description: '创建题单、查询已有题单' },
  { id: 'learning',   name: '学习',     icon: GraduationCap, enabled: true,  description: '创建课程、查询学习分类' },
  { id: 'image',      name: '图床',     icon: Image,      enabled: true,  description: '查询图片链接、上传图片到图床' },
  { id: 'datacenter', name: '数据中心', icon: BarChart3,  enabled: true,  description: '数据管理：OJ做题、资源、数据查询' },
  { id: 'email',      name: '邮件',     icon: Mail,       enabled: true,  description: '发送邮件' },
];

const ENABLED_AGENT_MODULES = AGENT_MODULES.filter(module => module.enabled);
const isNativeProvider = (provider: ChatConfig['provider']) => ['openai', 'anthropic', 'gemini', 'zenmux'].includes(provider);
const getModuleById = (moduleId?: string | null) => AGENT_MODULES.find(module => module.id === moduleId) || null;

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  action?: AgentAction;
  targetModule?: string; // 目标模块
  attachments?: ChatAttachment[];
}

interface AgentAction {
  type: string;
  status: 'pending' | 'success' | 'error';
  data?: Record<string, any>;
  error?: string;
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  todos: TodoItem[];
  notes: Note[];
  onCreateTodo: (todoData: Partial<TodoItem>) => void;
  onUpdateTodo: (id: string, updates: Partial<TodoItem>) => void;
  onDeleteTodo: (id: string) => void;
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
}

interface AgentPromptOptions {
  selectedModule?: string | null;
  routedModule?: string | null;
  promptMode?: 'native-tools' | 'fallback';
  customSystemPrompt?: string;
}

interface AgentDebugItem {
  id: string;
  stage: string;
  summary: string;
  payload?: any;
  level?: 'info' | 'success' | 'error';
  timestamp: number;
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
};

/* ─── Agent 配置存储 ─── */

const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';
const STORAGE_KEY_AGENT_PERMISSIONS = 'guyue_agent_permissions';

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
  content: content || '👋 你好！我是 Guyue-Master-Agent。\n\n你可以选择上方的功能模块图标来指定任务范围，或者直接描述你的需求，我会自动判断。\n\n目前支持：\n- ✅ **待办事项**：创建、管理待办\n- 🔜 更多功能开发中...',
  timestamp: Date.now(),
});

/* ─── Agent System Prompt ─── */

const getAgentSystemPrompt = ({
  selectedModule,
  routedModule,
  promptMode = 'fallback',
  customSystemPrompt,
}: AgentPromptOptions = {}) => {
  const customPromptSection = customSystemPrompt?.trim()
    ? `\n\n## 用户自定义系统提示\n${customSystemPrompt.trim()}`
    : '';

  const activeModule = getModuleById(routedModule || selectedModule);
  const moduleInfo = activeModule
    ? `\n\n## 当前任务模块\n当前任务已路由到【${activeModule.name}】模块，请优先在这个范围内处理任务。`
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
6. 回复保持简洁、确认式、面向执行。

## 时间处理
- 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 今天: ${new Date().toISOString().split('T')[0]}（${new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}）
- 明天: ${new Date(Date.now() + 86400000).toISOString().split('T')[0]}
- 后天: ${new Date(Date.now() + 172800000).toISOString().split('T')[0]}
- 设置 dueDate 时，你必须自行将用户描述的日期时间换算为 ISO 8601 格式（YYYY-MM-DDTHH:mm）。例如用户说"明天下午两点"，你应传入 "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T14:00"。如果用户没指定具体时间，默认使用 23:59，如 "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}T23:59"。绝对不要传自然语言或时间戳。${customPromptSection}`;
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
- 设置 dueDate 时，你必须自行将用户描述的日期时间换算为 ISO 8601 格式（YYYY-MM-DDTHH:mm）。用户没指定时间则默认 23:59。绝对不要传自然语言或时间戳。

## 交互原则
1. 如果用户的意图不明确，先询问澄清。
2. 执行操作前，简要确认你理解的内容。
3. 成功后给予友好的确认反馈。
4. 如果用户只是闲聊，正常回复即可，不要输出 action 块。
5. 保持回复简洁友好。${customPromptSection}`;
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
  const now = new Date();
  
  if (/今天/.test(lowerInput)) {
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    dueDate = d.getTime();
    content = content.replace(/今天/g, '').trim();
  } else if (/明天/.test(lowerInput)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    dueDate = d.getTime();
    content = content.replace(/明天/g, '').trim();
  } else if (/后天/.test(lowerInput)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(23, 59, 59, 999);
    dueDate = d.getTime();
    content = content.replace(/后天/g, '').trim();
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
  onDeleteTodo: (id: string) => void;
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
}

const TOOL_REGISTRY: ToolRegistration[] = [
  {
    name: 'create_todo',
    module: 'todo',
    tool: {
      name: 'create_todo',
      description: '创建一个新的待办事项',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '待办事项标题或内容' },
          description: { type: 'string', description: '补充说明' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
          category: { type: 'string', description: '分类名称' },
          dueDate: { type: 'string', description: '截止日期时间，必须为 ISO 8601 格式 YYYY-MM-DDTHH:mm，如 "2026-03-15T14:00"。用户没指定具体时间则默认 23:59，如 "2026-03-15T23:59"。' },
        },
        required: ['content'],
      },
    },
    execute: async (args, ctx) => {
      const todoData = normalizeTodoPayload(args);
      ctx.onCreateTodo(todoData);
      return { success: true, message: '待办事项创建成功', todo: todoData };
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
          category: { type: 'string', description: '分类名称' },
          description: { type: 'string', description: '简短描述' },
        },
        required: ['title', 'content'],
      },
    },
    execute: async (args, ctx) => {
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
          category: { type: 'string', description: '分类名称' },
        },
        required: ['title', 'content'],
      },
    },
    execute: async (args, ctx) => {
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
          categoryName: { type: 'string', description: '难度/分类名称，如 "简单"、"中等"、"困难"、"入门"、"普及"、"提高"、"省选"。不确定时可省略。' },
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

      const categoryName = (typeof args.categoryName === 'string' ? args.categoryName : '').trim();
      let categoryId = site.categories?.[0]?.id || 'easy';
      if (categoryName && site.categories) {
        const matched = site.categories.find(c =>
          c.name === categoryName || c.id === categoryName
        );
        if (matched) categoryId = matched.id;
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
      description: '创建一条资源记录（云盘、AI 资源、服务器、域名、订阅服务等）。从用户描述或截图中识别名称、容量、到期时间等。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '资源名称，如 "iCloud 200G"、"ChatGPT Plus"' },
          categoryName: { type: 'string', description: '分类名称，如 "云盘资源"、"AI资源"、"服务器"、"域名"、"订阅服务"。不确定时可省略。' },
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
      const categoryName = (typeof args.categoryName === 'string' ? args.categoryName : '').trim();
      let categoryId = categories[0]?.id || 'cloud';
      if (categoryName && categories.length > 0) {
        const matched = categories.find(c =>
          c.name === categoryName || c.id === categoryName
        );
        if (matched) categoryId = matched.id;
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
      description: '查询当前所有待办事项。在创建新待办前可先调用此工具了解已有内容，避免重复。',
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
        description: t.description || null,
        subtaskCount: t.subtasks?.length || 0,
        subtaskCompleted: t.subtasks?.filter(s => s.isCompleted).length || 0,
      }));
      return { success: true, total: items.length, returned: result.length, todos: result };
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
      description: '查询资源中心的资源列表，可按分类或是否即将到期筛选。用于了解已有资源、分析到期情况。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryName: { type: 'string', description: '分类名称筛选，如 "云盘资源"、"AI资源"、"服务器"、"域名"、"订阅服务"。不传则返回全部。' },
          expiringSoonDays: { type: 'number', description: '筛选 N 天内即将到期的资源，不传则不过滤。' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.resources.read) return { success: false, error: '资源查询未授权。请点击 🔒 按钮，在权限面板中开启「资源中心」读取权限。' };
      const cats = ctx.resourceData.categories;
      let items = ctx.resourceData.items;
      if (args.categoryName) {
        const cat = cats.find(c => c.name === args.categoryName || c.id === args.categoryName);
        if (cat) items = items.filter(i => i.categoryId === cat.id);
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
          category: cat?.name || i.categoryId,
          expireDate: i.expireDate || null,
          daysLeft,
          capacity: i.capacity ? `${i.capacity.used}/${i.capacity.total} ${i.capacity.unit || 'GB'}` : null,
          cost: i.cost ? `${i.cost.amount} / ${i.cost.period}` : null,
          autoRenewal: i.autoRenewal ?? null,
          note: i.note || null,
        };
      });
      return { success: true, total: result.length, resources: result };
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
      description: '在学习中心创建一个新课程。若指定分类不存在，会自动创建该分类。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '课程标题' },
          description: { type: 'string', description: '课程简介（可选）' },
          categoryName: { type: 'string', description: '所属分类名称。可先调用 query_learning_courses 查看现有分类；若分类不存在则自动创建。' },
          introMarkdown: { type: 'string', description: '课程总览 Markdown 内容，不传则自动生成。' },
          icon: { type: 'string', description: 'Lucide 图标名，如 "BookOpen"、"Code2"、"FlaskConical"（可选）' },
          priority: { type: 'number', description: '排序优先级，默认 10' },
        },
        required: ['title', 'categoryName'],
      },
    },
    execute: async (args, _ctx) => {
      const catName = String(args.categoryName || '').trim();
      const title = String(args.title || '').trim();
      const description = String(args.description || '').trim();
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let targetCategory = cats.find((c: any) => c.name === catName || c.id === catName);
      if (!targetCategory) {
        targetCategory = { id: `cat_${Date.now()}`, name: catName, icon: 'BookOpen', color: 'blue', priority: 10 };
        cats.push(targetCategory);
        localStorage.setItem('learning_categories_v1', JSON.stringify(cats));
      }
      const newCourse = {
        id: `course_${Date.now()}`,
        title,
        description,
        categoryId: targetCategory.id,
        modules: [],
        assignments: [],
        assignmentModules: [],
        personalModules: [],
        customSections: [],
        introMarkdown: String(args.introMarkdown || '').trim() || `# ${title}\n\n${description || '在这里编写学习总览...'}`,
        icon: args.icon || undefined,
        priority: Number(args.priority) || 10,
      };
      const courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      courses.push(newCourse);
      localStorage.setItem('learning_courses_v1', JSON.stringify(courses));
      return { success: true, message: `课程「${title}」已创建，归属分类「${targetCategory.name}」。` };
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
      description: '查询学习中心的分类和课程列表。创建课程前可先调用，了解现有分类名称。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryName: { type: 'string', description: '按分类名称筛选，不传则返回全部' },
        },
        required: [],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.learningCourses.read) return { success: false, error: '学习课程查询未授权。请点击 🔒 按钮，在权限面板中开启「学习课程」读取权限。' };
      const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
      let courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
      if (args.categoryName) {
        const cat = cats.find((c: any) => c.name === args.categoryName || c.id === args.categoryName);
        if (cat) courses = courses.filter((c: any) => c.categoryId === cat.id);
      }
      return {
        success: true,
        categories: cats.map((c: any) => ({ id: c.id, name: c.name })),
        courses: courses.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || null,
          category: cats.find((cat: any) => cat.id === c.categoryId)?.name || c.categoryId,
          moduleCount: (c.modules || []).length,
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
      description: '修改一条已有的待办事项。可修改内容、优先级、分类、截止日期、完成状态等字段。需要先 query_todos 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id（从 query_todos 结果中获取）' },
          content: { type: 'string', description: '新的内容标题（可选）' },
          description: { type: 'string', description: '新的描述（可选）' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '新的优先级（可选）' },
          category: { type: 'string', description: '新的分类（可选）' },
          dueDate: { type: 'string', description: '新的截止日期 YYYY-MM-DDTHH:mm（可选）' },
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
      if (typeof args.category === 'string') updates.category = args.category.trim();
      if (typeof args.dueDate === 'string') updates.dueDate = parseDueDateString(args.dueDate);
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
      description: '删除一条待办事项。需要先 query_todos 获取 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办的 id' },
        },
        required: ['id'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办删除未授权。请在权限面板中开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.id);
      if (!todo) return { success: false, error: `未找到 id 为「${args.id}」的待办事项。` };
      ctx.onDeleteTodo(args.id);
      return { success: true, message: `待办「${todo.content}」已删除` };
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
      description: '为某条待办事项添加一个子任务。',
      inputSchema: {
        type: 'object',
        properties: {
          todoId: { type: 'string', description: '待办的 id' },
          content: { type: 'string', description: '子任务内容' },
        },
        required: ['todoId', 'content'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
      const todo = ctx.todos.find(t => t.id === args.todoId);
      if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
      const newSubtask: SubTask = { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), content: String(args.content).trim(), isCompleted: false };
      const subtasks = [...(todo.subtasks || []), newSubtask];
      ctx.onUpdateTodo(args.todoId, { subtasks });
      return { success: true, message: `子任务「${newSubtask.content}」已添加到「${todo.content}」`, subtask: newSubtask };
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
  // ─── 邮件发送工具 ───
  {
    name: 'send_email',
    module: 'email',
    tool: {
      name: 'send_email',
      description: '发送一封邮件。邮箱配置在系统设置中已预设，Agent 只需提供主题和正文内容。正文支持 HTML 格式。',
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

      const sendConfig = { ...config, recipient };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.sendEmail) return { success: false, error: '发送邮件功能不可用（非桌面端）。' };

      const result = await electronAPI.sendEmail({ config: sendConfig, subject: String(args.subject || '').trim(), content: String(args.content || '') });
      if (result.success) {
        return { success: true, message: `邮件已发送至 ${recipient}`, subject: args.subject };
      }
      return { success: false, error: `发送失败：${result.error || '未知错误'}` };
    },
  },
];

/** 获取所有已启用模块的工具（如指定 selectedModule 则只返回该模块的） */
const getAllNativeTools = (selectedModule?: string | null): ChatTool[] => {
  const enabledModuleIds = new Set(ENABLED_AGENT_MODULES.map(m => m.id));
  return TOOL_REGISTRY
    .filter(reg => enabledModuleIds.has(reg.module))
    .filter(reg => !selectedModule || reg.module === selectedModule)
    .map(reg => reg.tool);
};

/** 根据工具名查找注册项 */
const findToolRegistration = (toolName: string): ToolRegistration | undefined =>
  TOOL_REGISTRY.find(reg => reg.name === toolName);

/** 从工具名推断所属模块 */
const getModuleByToolName = (toolName: string): string | undefined =>
  TOOL_REGISTRY.find(reg => reg.name === toolName)?.module;

const parseDueDateString = (value: any): number | undefined => {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;

  // LLM 被要求返回 ISO 8601 格式，直接解析
  const parsed = new Date(value.trim()).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;

  return undefined;
};

const normalizeTodoPayload = (data: Record<string, any>): Partial<TodoItem> => ({
  content: typeof data.content === 'string' && data.content.trim() ? data.content.trim() : '新事项',
  description: typeof data.description === 'string' ? data.description : undefined,
  isCompleted: false,
  priority: data.priority === 'high' || data.priority === 'low' ? data.priority : 'medium',
  category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : '未分类',
  dueDate: parseDueDateString(data.dueDate),
});

/* ─── 组件 ─── */

export const AgentPanel: React.FC<AgentPanelProps> = ({
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
  const [config, setConfig] = useState<ChatConfig>(() => loadAgentConfig());
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [dataPermissions, setDataPermissions] = useState<DataPermissions>(() => loadAgentPermissions().data);
  const [filePermissions, setFilePermissions] = useState<string[]>(() => loadAgentPermissions().files);
  const [showFilePermissions, setShowFilePermissions] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showModuleSelector, setShowModuleSelector] = useState(false);
  const [isModuleCollapsed, setIsModuleCollapsed] = useState(false);
  const [isDebugCollapsed, setIsDebugCollapsed] = useState(false);
  const [expandedDebugIds, setExpandedDebugIds] = useState<Set<string>>(new Set());
  const [debugItems, setDebugItems] = useState<AgentDebugItem[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatServiceRef = useRef<ChatService | null>(null);
  const supportsNativeTools = useMemo(() => isNativeProvider(config.provider), [config.provider]);
  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];

  const turnStepRef = useRef(0);
  const turnStartTimeRef = useRef(0);

  const resetTurnDebug = useCallback(() => {
    turnStepRef.current = 0;
    turnStartTimeRef.current = Date.now();
  }, []);

  const pushDebugItem = useCallback((item: Omit<AgentDebugItem, 'id' | 'timestamp'>) => {
    turnStepRef.current += 1;
    const elapsed = turnStartTimeRef.current ? Date.now() - turnStartTimeRef.current : 0;
    const displayStage = STAGE_DISPLAY[item.stage] || item.stage;
    setDebugItems(prev => {
      const next: AgentDebugItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...item,
        stage: `#${turnStepRef.current} ${displayStage}`,
        summary: elapsed > 0 ? `${item.summary} (+${elapsed}ms)` : item.summary,
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
      }),
    });
  }, []);

  useEffect(() => {
    saveAgentConfig(config);
    if (chatServiceRef.current) {
      chatServiceRef.current.updateConfig({
        ...config,
        systemPrompt: getAgentSystemPrompt({
          selectedModule,
          promptMode: supportsNativeTools ? 'native-tools' : 'fallback',
          customSystemPrompt: config.systemPrompt,
        }),
      });
    }
  }, [config, selectedModule, supportsNativeTools]);

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

            if (action.type === 'create_todo') {
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
              if (typeof d.dueDate === 'string') updates.dueDate = parseDueDateString(d.dueDate);
              if (typeof d.isCompleted === 'boolean') { updates.isCompleted = d.isCompleted; if (d.isCompleted) updates.completedAt = Date.now(); }
              onUpdateTodo(d.id, updates);
              resultData = updates;
              summaryText = `待办「${todo.content}」已更新`;
            } else if (action.type === 'delete_todo') {
              const d = action.data || {};
              const todo = todos.find(t => t.id === d.id);
              if (!todo) throw new Error(`未找到 id 为「${d.id}」的待办`);
              onDeleteTodo(d.id);
              resultData = { id: d.id };
              summaryText = `待办「${todo.content}」已删除`;
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
              let emailConfig: EmailConfig;
              try { emailConfig = JSON.parse(configStr); } catch { throw new Error('邮箱配置格式错误，请重新设置。'); }
              if (!emailConfig.enabled) throw new Error('邮箱功能未启用。请在设置中开启。');
              const recipient = (typeof d.recipient === 'string' && d.recipient.trim()) ? d.recipient.trim() : emailConfig.recipient;
              if (!recipient) throw new Error('收件人地址为空，请指定收件人或在设置中配置默认收件人。');
              const eAPI = (window as any).electronAPI;
              if (!eAPI?.sendEmail) throw new Error('发送邮件功能不可用（非桌面端）。');
              const sendResult = await eAPI.sendEmail({ config: { ...emailConfig, recipient }, subject: String(d.subject || '').trim(), content: String(d.content || '') });
              if (!sendResult.success) throw new Error(`发送失败：${sendResult.error || '未知错误'}`);
              resultData = { recipient, subject: d.subject };
              summaryText = `邮件已发送至 ${recipient}`;
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
                message.id === assistantId ? { ...message, action: { ...action, status: 'success', data: resultData } } : message
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
      const nativeTools = supportsNativeTools ? getAllNativeTools(selectedModule) : [];
      const toolExecContext: ToolExecutionContext = { todos, notes, dataPermissions, filePermissions, fileRecords, lastUserAttachments: currentAttachments, onCreateTodo, onUpdateTodo, onDeleteTodo, onCreateNote, onUpdateNote, onDeleteNote, onCreatePrompt, onCreateMarkdownNote, onCreateOJSubmission, ojHeatmapData, onCreateResource, onUpdateResource, onDeleteResource, resourceData };

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
            content: getAgentSystemPrompt({ selectedModule, promptMode: 'native-tools', customSystemPrompt: config.systemPrompt }),
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

          try {
            const result = await registration.execute(toolCall.arguments, toolExecContext);
            const moduleName = getModuleById(registration.module)?.name || registration.module;
            executedAction = { type: toolCall.name, status: 'success', data: toolCall.arguments };
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
                content: toolResult.text || (executedAction ? '已帮你完成这个任务。' : '已处理完成。'),
                action: executedAction,
                targetModule: inferredModule,
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
    setDebugItems([]);
    localStorage.removeItem(STORAGE_KEY_AGENT_HISTORY);
  };

  const handleClearHistory = () => {
    if (!window.confirm('确认删除当前 Agent 对话历史吗？此操作不可撤销。')) {
      return;
    }

    clearHistory();
    pushDebugItem({
      stage: 'history:clear',
      summary: '用户手动清空了对话历史',
      level: 'info',
    });
  };

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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div
          className="relative w-[860px] max-w-[94vw] h-[820px] max-h-[92vh] bg-white/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-[28px] bg-blue-500/10 border-2 border-blue-400 border-dashed backdrop-blur-sm pointer-events-none">
              <Paperclip className="w-10 h-10 text-blue-400 mb-3" />
              <p className="text-blue-500 font-semibold text-base">松开鼠标上传文件</p>
              <p className="text-blue-400 text-sm mt-1">支持图片、PDF、文本等格式</p>
            </div>
          )}
          <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center shadow-lg overflow-hidden border border-white/10">
                <div className="flex flex-col items-center justify-center leading-none text-gray-200">
                  <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
                  <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
                </div>
              </div>
              <div>
                <h2 className="text-gray-900 font-semibold text-lg">Guyue-Master-Agent</h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col bg-white">
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                {messages.map(message => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onDelete={handleDeleteMessage}
                  />
                ))}
                {isProcessing && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>处理中...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 px-5 py-4 border-t border-gray-200 bg-white space-y-3">
                {selectedModule && (
                  <div className="flex items-center gap-2">
                    <div className="text-xs rounded-full px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                      {(() => { const m = getModuleById(selectedModule); if (!m) return null; const Icon = m.icon; return <><Icon className="w-3 h-3" />{m.name}</>; })()}
                    </div>
                    <button onClick={() => setSelectedModule(null)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">✕ 取消限定</button>
                  </div>
                )}

                <div className="rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 transition-colors">
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
                      className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 outline-none text-[15px]"
                      disabled={isProcessing || !config.apiKey}
                    />
                    <button
                      onClick={handleSend}
                      disabled={(!inputValue.trim() && pendingAttachments.length === 0) || isProcessing || !config.apiKey}
                      className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors shrink-0"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  {config.apiKey
                    ? `✨ ${config.provider} · ${currentModels.find(model => model.id === config.model)?.name || config.model} · ${supportsNativeTools ? '原生 Function Calling' : '兼容模式'}`
                    : '⚙️ 点击右上角设置完成模型配置'}
                  {' · '}按 Enter 发送
                </p>
              </div>
            </div>

            {/* 调试内容面板 */}
            {!isDebugCollapsed && (
              <div className="shrink-0 w-[310px] border-l border-gray-200 bg-slate-50/80 flex flex-col min-h-0 overflow-hidden">
                <div className="shrink-0 border-b border-gray-200 bg-white/80 flex items-center justify-between px-3" style={{ minHeight: '48px' }}>
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
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {debugItems.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-6">暂无调试数据</div>
                  ) : (
                    debugItems.map((item) => {
                      const isExpanded = expandedDebugIds.has(item.id);
                      const hasPayload = item.payload !== undefined;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border ${
                            item.level === 'error'
                              ? 'border-red-200 bg-red-50/70'
                              : item.level === 'success'
                                ? 'border-emerald-200 bg-emerald-50/70'
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
                              <span className="text-[11px] font-semibold text-slate-700 block leading-tight">{STAGE_DISPLAY[item.stage] || item.stage}</span>
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
                    })
                  )}
                </div>
              </div>
            )}

            {/* 右侧竖向图标栏 */}
            <div className="shrink-0 w-10 border-l border-gray-200 bg-white/80 flex flex-col items-center py-2 gap-0.5">
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
              {/* 权限(读/写) */}
              <div className="relative">
                {(() => {
                  const count = Object.values(dataPermissions).reduce((n, p) => n + (p.read ? 1 : 0) + (p.write ? 1 : 0), 0);
                  return (
                    <button
                      onClick={() => { setShowPermissions(v => !v); setShowModuleSelector(false); }}
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
                    <div className="absolute right-full top-0 mr-2 z-50 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-800">Agent 数据权限</p>
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
                      {/* 表头 */}
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
              {/* 功能模块选择 */}
              <div className="relative">
                <button
                  onClick={() => { setShowModuleSelector(v => !v); setShowPermissions(false); }}
                  className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                    selectedModule
                      ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                      : showModuleSelector
                        ? 'text-slate-700 bg-slate-100'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                  title="功能模块"
                >
                  <LayoutGrid className="w-4 h-4" />
                  {selectedModule && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </button>
                {showModuleSelector && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModuleSelector(false)} />
                    <div className="absolute right-full top-0 mr-2 z-50 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden py-1.5">
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
              {/* 邮件快捷入口 */}
              <button
                onClick={() => {
                  setSelectedModule('email');
                  setShowModuleSelector(false);
                  setShowPermissions(false);
                  if (inputRef.current) { inputRef.current.focus(); }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors ${
                  selectedModule === 'email'
                    ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="发送邮件"
              >
                <Mail className="w-4 h-4" />
              </button>
              {/* 文件分类权限 */}
              <div className="relative">
                <button
                  onClick={() => { setShowFilePermissions(v => !v); setShowPermissions(false); setShowModuleSelector(false); }}
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
                    <div className="absolute right-full top-0 mr-2 z-50 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 pt-3.5 pb-2 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-800">Agent 文件分类权限</p>
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
              {/* 清空对话 */}
              <button
                onClick={handleClearHistory}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="删除对话历史"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="w-5 h-px bg-slate-200 my-1" />
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
        </div>
      </div>

      <AgentSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={config}
        onChangeConfig={setConfig}
        onClearHistory={handleClearHistory}
      />

      <AgentHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </>
  );
};

/* ─── 消息气泡组件 ─── */

const MessageBubble: React.FC<{ message: AgentMessage; onDelete?: (messageId: string) => void }> = ({ message, onDelete }) => {
  const isUser = message.role === 'user';
  const targetModule = getModuleById(message.targetModule);
  const canDelete = message.id !== 'welcome';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-3xl px-4 py-3.5 shadow-sm ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : 'bg-gray-100 text-gray-800'
      }`}>
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

          {canDelete && (
            <button
              onClick={() => onDelete?.(message.id)}
              className={`ml-auto inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                isUser
                  ? 'text-blue-100 hover:text-white hover:bg-blue-500'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
              title="删除这条消息"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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

        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
          )}
        </div>

        <div className={`text-xs mt-2 ${isUser ? 'text-blue-100' : 'text-gray-400'}`}>
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default AgentPanel;
