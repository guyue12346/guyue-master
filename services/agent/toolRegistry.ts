import type {
  Category,
  FileRecord,
  LatexTemplate,
  MarkdownNote,
  Note,
  OJHeatmapData,
  OJSubmission,
  PromptRecord,
  RecurringCategory,
  RecurringEvent,
  ResourceCenterData,
  ResourceItem,
  APIRecord,
  SSHRecord,
  TodoItem,
} from '../../types';
import type { ChatAttachment, ChatTool, ChatToolCall } from '../chatService';
import type { AgentModule } from './agentModules';
import type { AgentCrudAction, AgentFullAccessPermissions, AgentToolPermissions, DataPermissions } from './agentPermissions';
import { toStrictTool, validateToolArguments } from './toolSchema';

export interface ToolRegistration {
  name: string;
  module: string;
  tool: ChatTool;
  permission?: {
    module?: string;
    action?: AgentCrudAction;
  };
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any>;
}

export interface AgentToolExecutionResult<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  raw?: any;
  error?: string;
  fatal?: boolean;
  pendingConfirmation?: boolean;
  confirmationId?: string;
  confirmationType?: 'send_email' | 'agent_tool';
}

export interface ToolExecutionContext {
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
  sshRecords: SSHRecord[];
  sshCategories: string[];
  onSaveSSH: (record: Partial<SSHRecord>) => void;
  onDeleteSSH: (id: string) => void;
  apiRecords: APIRecord[];
  apiCategories: string[];
  onSaveAPI: (record: Partial<APIRecord>) => void;
  onDeleteAPI: (id: string) => void;
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
  latexFileReadPermissions: string[];
  latexFileWritePermissions: string[];
  latexTemplatePermissions: string[];
  onAutoAuthLatexFileCategory: (catId: string) => void;
  onAutoAuthLatexTemplateCategory: (catName: string) => void;
}

export const WEB_SEARCH_TOOL: ChatTool = {
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

export const normalizeToolResult = (result: any): AgentToolExecutionResult => {
  if (result && typeof result === 'object' && 'success' in result) {
    return {
      success: result.success !== false,
      message: result.message || result.summary,
      data: result.data ?? result,
      raw: result,
      error: result.success === false ? String(result.error || result.message || '工具执行失败') : undefined,
      fatal: Boolean(result.fatal),
      pendingConfirmation: Boolean(result.pendingConfirmation),
      confirmationId: result.confirmationId,
      confirmationType: result.confirmationType,
    };
  }
  return {
    success: true,
    message: '工具执行完成',
    data: result,
    raw: result,
  };
};

export const executeToolRegistration = async (
  registration: ToolRegistration,
  args: Record<string, any>,
  context: ToolExecutionContext,
): Promise<AgentToolExecutionResult> => {
  const validation = validateToolArguments(registration.tool, args || {});
  if (!validation.ok) {
    return {
      success: false,
      error: `工具参数不符合 schema：${validation.errors.join('；')}`,
      fatal: false,
    };
  }
  const result = await registration.execute(args || {}, context);
  return normalizeToolResult(result);
};

export const inferToolPermissionAction = (toolName: string): AgentCrudAction => {
  if (/^(query|read|search|list|get)_/.test(toolName)) return 'read';
  if (/^(create|add|upload|send|build)_/.test(toolName)) return 'create';
  if (/^(update|edit|rename|move|toggle|set)_/.test(toolName)) return 'update';
  if (/^(delete|remove|clear)_/.test(toolName)) return 'delete';
  return 'read';
};

export const getToolPermissionTarget = (registration: ToolRegistration) => ({
  module: registration.permission?.module || registration.module,
  action: registration.permission?.action || inferToolPermissionAction(registration.name),
});

export type ToolPermissionCapabilities = Record<string, Partial<Record<AgentCrudAction, boolean>>>;

export const getToolPermissionCapabilities = (
  registry: ToolRegistration[],
  enabledModules: AgentModule[],
): ToolPermissionCapabilities => {
  const enabledModuleIds = new Set(enabledModules.map(module => module.id));
  return registry.reduce((acc, registration) => {
    if (!enabledModuleIds.has(registration.module)) return acc;
    const target = getToolPermissionTarget(registration);
    if (!acc[target.module]) acc[target.module] = {};
    acc[target.module][target.action] = true;
    return acc;
  }, {} as ToolPermissionCapabilities);
};

export const isToolPermissionSupported = (
  capabilities: ToolPermissionCapabilities,
  moduleId: string,
  action: AgentCrudAction,
): boolean => Boolean(capabilities[moduleId]?.[action]);

export const canUseToolRegistration = (
  registration: ToolRegistration,
  permissions?: AgentToolPermissions,
): boolean => {
  if (!permissions) return true;
  const target = getToolPermissionTarget(registration);
  return Boolean(permissions[target.module]?.[target.action]);
};

export const hasFullToolAccess = (
  registration: ToolRegistration,
  permissions?: AgentFullAccessPermissions,
): boolean => {
  if (!permissions) return false;
  const target = getToolPermissionTarget(registration);
  return Boolean(permissions[target.module]?.[target.action]);
};

export const getAllNativeTools = (
  registry: ToolRegistration[],
  enabledModules: AgentModule[],
  moduleScope?: string | string[] | null,
  enableWebSearch?: boolean,
  permissions?: AgentToolPermissions,
): ChatTool[] => {
  const enabledModuleIds = new Set(enabledModules.map(module => module.id));
  const scopeIds = Array.isArray(moduleScope)
    ? moduleScope.filter(Boolean)
    : moduleScope
      ? [moduleScope]
      : [];
  const scopeSet = new Set(scopeIds);
  const tools = registry
    .filter(reg => enabledModuleIds.has(reg.module))
    .filter(reg => scopeSet.size === 0 || scopeSet.has(reg.module))
    .filter(reg => canUseToolRegistration(reg, permissions))
    .map(reg => toStrictTool(reg.tool));
  if (enableWebSearch) tools.push(toStrictTool(WEB_SEARCH_TOOL));
  return tools;
};

export const findToolRegistration = (
  registry: ToolRegistration[],
  toolName: string,
): ToolRegistration | undefined =>
  registry.find(reg => reg.name === toolName);

export const getModuleByToolName = (
  registry: ToolRegistration[],
  toolName: string,
): string | undefined =>
  registry.find(reg => reg.name === toolName)?.module;

export const generateToolCallSummary = (toolCalls: ChatToolCall[]): string => {
  if (toolCalls.length === 0) return '已处理完成。';

  const labels: Record<string, string> = {
    create_todo: '创建待办', create_note: '创建便签', create_prompt: '创建技能卡',
    create_markdown_note: '创建 Markdown 笔记', create_oj_submission: '创建做题记录',
    create_resource: '创建资源', create_leetcode_list: '创建 LeetCode 题单',
    create_learning_course: '创建学习课程', create_subtask: '创建子任务',
    create_recurring_event: '创建重复事件', create_recurring_category: '创建重复分类', create_category: '创建分类',
    update_todo: '更新待办', update_note: '更新便签', update_resource: '更新资源',
    update_ssh_record: '更新 SSH 记录', update_api_record: '更新 API 记录',
    update_subtask: '更新子任务', update_recurring_event: '更新重复事件',
    delete_todo: '删除待办', delete_note: '删除便签', delete_resource: '删除资源',
    delete_ssh_record: '删除 SSH 记录', delete_api_record: '删除 API 记录',
    delete_subtask: '删除子任务', delete_recurring_event: '删除重复事件',
    send_email: '发送邮件', query_contacts: '查询通讯录',
    query_todos: '查询待办', query_notes: '查询便签', query_prompts: '查询技能卡',
    query_markdown_notes: '查询笔记', query_resources: '查询资源',
    query_ssh_records: '查询 SSH 记录', create_ssh_record: '创建 SSH 记录',
    query_api_records: '查询 API 记录', create_api_record: '创建 API 记录',
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

  const lines = toolCalls.map(toolCall => {
    const label = labels[toolCall.name] || toolCall.name;
    const args = toolCall.arguments || {};
    const key = args.content || args.title || args.name || args.subject || args.keyword || args.category || args.id || '';
    const brief = typeof key === 'string' && key.length > 40 ? `${key.slice(0, 40)}…` : key;
    return brief ? `- ${label}：${brief}` : `- ${label}`;
  });

  if (lines.length === 1) {
    return `✅ 已完成操作：\n${lines[0]}`;
  }
  return `✅ 已完成 ${lines.length} 项操作：\n${lines.join('\n')}`;
};

export type { Category, LatexTemplate };
