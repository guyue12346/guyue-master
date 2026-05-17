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
  origin?: 'builtin' | 'plugin' | 'skill' | 'mcp';
  sourceId?: string;
  exposure?: 'direct' | 'deferred' | 'hidden';
  permissionless?: boolean;
  tool: ChatTool;
  permission?: {
    module?: string;
    action?: AgentCrudAction;
  };
  safety?: {
    confirm?: boolean;
    shouldConfirm?: (args: Record<string, any>) => boolean;
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
  confirmationType?: 'send_email' | 'agent_tool' | 'local_secret';
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
  toolRegistry?: ToolRegistration[];
  executeComplexTask?: (args: Record<string, any>) => Promise<any>;
  executeWebSearch?: (args: Record<string, any>) => Promise<any>;
  executeWebOpen?: (args: Record<string, any>) => Promise<any>;
  executeSpecializedSearch?: (args: Record<string, any>) => Promise<any>;
}

export const WEB_SEARCH_TOOL: ChatTool = {
  name: 'web_search',
  description: '使用 Agent 设置中的联网搜索引擎检索互联网实时信息。支持 OpenAI Web Search、SearXNG、Brave、Tavily、Exa、Firecrawl、Bing、Google；当需要最新资讯、官方文档、新闻、事实核验、价格或时效性内容时使用。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词或问题，中英文均可' },
      maxResults: { type: 'number', description: '最多返回结果数，默认使用设置值。建议 5-10。' },
      searchMode: { type: 'string', enum: ['fast', 'balanced', 'deep'], description: '搜索深度：fast=更快，balanced=默认，deep=更全面。' },
      timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: '按时间范围过滤，适合新闻、版本、价格等时效性查询。' },
      topic: { type: 'string', enum: ['general', 'news', 'finance'], description: '搜索主题，默认 general。' },
      includeDomains: { type: 'array', items: { type: 'string' }, description: '限定只搜索这些域名，例如 ["openai.com", "github.com"]。' },
      excludeDomains: { type: 'array', items: { type: 'string' }, description: '排除这些域名。' },
    },
    required: ['query'],
  },
};

export const WEB_OPEN_TOOL: ChatTool = {
  name: 'web_open',
  description: '打开一个网页 URL，抽取标题、描述、正文和与查询相关的片段。通常在 web_search 返回候选页面后使用，用于获得页面里的具体事实、数字、天气、价格、文档内容等。',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要打开的 http/https URL，通常来自 web_search 的 results.url。' },
      query: { type: 'string', description: '可选。原始问题或需要在页面中聚焦查找的关键词。' },
      maxChars: { type: 'number', description: '最多返回正文字符数，默认 12000，最大 50000。' },
      includeHtml: { type: 'boolean', description: '是否返回原始 HTML 片段。通常不要开启。' },
    },
    required: ['url'],
  },
};

export const SPECIALIZED_SEARCH_TOOL: ChatTool = {
  name: 'specialized_search',
  description: '使用专用搜索 API 检索 GitHub、npm、StackOverflow、arXiv。需要查仓库、代码、包、问答或论文时优先使用；不要用它做普通网页搜索。',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['github', 'npm', 'stackoverflow', 'arxiv'],
        description: '专用搜索源。github=代码与仓库，npm=包，stackoverflow=问答，arxiv=论文。',
      },
      query: { type: 'string', description: '搜索关键词。GitHub 可以包含官方搜索限定符。' },
      maxResults: { type: 'number', description: '最多返回结果数，默认使用专用搜索配置。建议 5-10。' },
      githubType: {
        type: 'string',
        enum: ['repositories', 'code', 'issues', 'pull_requests', 'users'],
        description: 'source=github 时使用。默认 repositories。pull_requests 会通过 GitHub issues search 加 is:pr 限定。',
      },
      owner: { type: 'string', description: 'source=github 时可选，限定 GitHub 用户或组织。' },
      repo: { type: 'string', description: 'source=github 时可选，和 owner 组合为 repo:owner/repo。' },
      language: { type: 'string', description: 'source=github 时可选，限定编程语言；source=arxiv 时可用于传 arXiv 分类。' },
      sort: { type: 'string', description: '排序字段，按搜索源支持情况使用，例如 stars、updated、relevance、votes。' },
      order: { type: 'string', enum: ['asc', 'desc'], description: '排序方向，默认 desc。' },
      tags: { type: 'array', items: { type: 'string' }, description: 'source=stackoverflow 时可选，限定标签。' },
      arxivCategory: { type: 'string', description: 'source=arxiv 时可选，例如 cs.AI、math.PR。' },
    },
    required: ['source', 'query'],
  },
};

const SPECIALIZED_SEARCH_DOMAINS: Record<string, string[]> = {
  github: ['github.com'],
  npm: ['npmjs.com', 'registry.npmjs.org'],
  stackoverflow: ['stackoverflow.com', 'stackexchange.com'],
  arxiv: ['arxiv.org'],
};

const buildSpecializedSearchQuery = (args: Record<string, any>, source: string, query: string) => {
  const parts = [query];
  if (source === 'github') {
    if (args.githubType) parts.push(String(args.githubType).replace(/_/g, ' '));
    if (args.owner && args.repo) parts.push(`${String(args.owner).trim()}/${String(args.repo).trim()}`);
    else if (args.owner) parts.push(String(args.owner).trim());
    if (args.language) parts.push(`language ${String(args.language).trim()}`);
  }
  if (source === 'stackoverflow' && Array.isArray(args.tags) && args.tags.length > 0) {
    parts.push(`tags ${args.tags.map((tag: string) => String(tag).trim()).filter(Boolean).join(' ')}`);
  }
  if (source === 'arxiv' && (args.arxivCategory || args.language)) {
    parts.push(`category ${String(args.arxivCategory || args.language).trim()}`);
  }
  if (args.sort) parts.push(`sort ${String(args.sort).trim()}`);
  return parts.filter(Boolean).join(' ');
};

const compactText = (value: unknown, maxLength = 1600) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
};

const buildWebSearchToolMessage = (query: string, result: any) => {
  if (!result || result.success === false) {
    return `联网搜索失败：${result?.error || result?.message || '未知错误'}`;
  }

  const answer = compactText(result.directAnswer || result.answer || result.summary || '', 1800);
  const results = Array.isArray(result.results) ? result.results.slice(0, 8) : [];
  const sources = results
    .map((item: any, index: number) => {
      const title = compactText(item?.title || item?.url || `来源 ${index + 1}`, 120);
      const url = typeof item?.url === 'string' ? item.url : '';
      const snippet = compactText(item?.snippet || item?.content || '', 240);
      return `${index + 1}. ${title}${url ? ` - ${url}` : ''}${snippet ? `\n   ${snippet}` : ''}`;
    })
    .join('\n');

  return [
    `查询：${query}`,
    answer ? `直答：${answer}` : '',
    sources ? `来源：\n${sources}` : '来源：OpenAI web_search 未返回可枚举引用，但已返回直答。',
  ].filter(Boolean).join('\n\n');
};

const buildWebOpenToolMessage = (result: any) => {
  if (!result || result.success === false) {
    return `网页打开失败：${result?.error || result?.message || '未知错误'}`;
  }
  const title = compactText(result.title || result.finalUrl || result.url || '网页', 160);
  const description = compactText(result.description || '', 500);
  const excerpt = compactText(result.excerpt || result.content || '', 2400);
  return [
    `网页：${title}`,
    `URL：${result.finalUrl || result.url || ''}`,
    description ? `描述：${description}` : '',
    excerpt ? `内容摘录：\n${excerpt}` : '内容摘录：页面没有提取到可读正文。',
  ].filter(Boolean).join('\n\n');
};

export const WEB_SEARCH_TOOL_REGISTRATION: ToolRegistration = {
  name: WEB_SEARCH_TOOL.name,
  module: 'web',
  permission: { module: 'web', action: 'read' },
  tool: WEB_SEARCH_TOOL,
  execute: async (args, ctx) => {
    if (!ctx.executeWebSearch) {
      return { success: false, error: '联网搜索执行器未配置。' };
    }
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { success: false, error: '搜索词不能为空。' };
    const result = await ctx.executeWebSearch({ ...args, query });
    return {
      ...result,
      success: result?.success !== false,
      message: buildWebSearchToolMessage(query, result),
    };
  },
};

export const WEB_OPEN_TOOL_REGISTRATION: ToolRegistration = {
  name: WEB_OPEN_TOOL.name,
  module: 'web',
  permission: { module: 'web', action: 'read' },
  tool: WEB_OPEN_TOOL,
  execute: async (args, ctx) => {
    if (!ctx.executeWebOpen) {
      return { success: false, error: '网页打开执行器未配置。' };
    }
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) return { success: false, error: 'URL 不能为空。' };
    const result = await ctx.executeWebOpen({ ...args, url });
    return {
      ...result,
      success: result?.success !== false,
      message: buildWebOpenToolMessage(result),
    };
  },
};

export const SPECIALIZED_SEARCH_TOOL_REGISTRATION: ToolRegistration = {
  name: SPECIALIZED_SEARCH_TOOL.name,
  module: 'web',
  permission: { module: 'web', action: 'read' },
  tool: SPECIALIZED_SEARCH_TOOL,
  execute: async (args, ctx) => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const source = typeof args.source === 'string' ? args.source.trim() : '';
    if (!query) return { success: false, error: '搜索词不能为空。' };
    if (!source) return { success: false, error: '专用搜索源不能为空。' };
    if (ctx.executeSpecializedSearch) {
      const result = await ctx.executeSpecializedSearch({ ...args, query, source });
      return {
        ...result,
        success: result?.success !== false,
        message: buildWebSearchToolMessage(`${source}: ${query}`, result),
        source,
        query,
        provider: result?.provider || result?.engine || source,
        engine: result?.engine || source,
      };
    }
    if (!ctx.executeWebSearch) {
      return { success: false, error: '联网搜索执行器未配置。' };
    }
    const includeDomains = SPECIALIZED_SEARCH_DOMAINS[source] || [];
    if (includeDomains.length === 0) return { success: false, error: `不支持的专用搜索源：${source}` };
    const routedQuery = buildSpecializedSearchQuery(args, source, query);
    const result = await ctx.executeWebSearch({
      query: routedQuery,
      maxResults: args.maxResults,
      searchMode: 'deep',
      topic: 'general',
      includeDomains,
    });
    return {
      ...result,
      success: result?.success !== false,
      message: buildWebSearchToolMessage(`${source}: ${query}`, result),
      source,
      query,
      routedQuery,
      provider: result?.provider || 'openai-web-search',
      engine: 'openai-web-search',
    };
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
  const capabilities = registry.reduce((acc, registration) => {
    if (registration.permissionless) return acc;
    if (!enabledModuleIds.has(registration.module)) return acc;
    const target = getToolPermissionTarget(registration);
    if (!acc[target.module]) acc[target.module] = {};
    acc[target.module][target.action] = true;
    return acc;
  }, {} as ToolPermissionCapabilities);
  capabilities.web = { read: true };
  return capabilities;
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
  if (registration.permissionless) return true;
  if (!permissions) return true;
  const target = getToolPermissionTarget(registration);
  return Boolean(permissions[target.module]?.[target.action]);
};

export const hasFullToolAccess = (
  registration: ToolRegistration,
  permissions?: AgentFullAccessPermissions,
): boolean => {
  if (registration.permissionless) return true;
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
  enableSpecializedSearch?: boolean,
): ChatTool[] => getNativeToolRegistrations(
  registry,
  enabledModules,
  moduleScope,
  enableWebSearch,
  permissions,
  enableSpecializedSearch,
).map(reg => toStrictTool(reg.tool));

export const getNativeToolRegistrations = (
  registry: ToolRegistration[],
  enabledModules: AgentModule[],
  moduleScope?: string | string[] | null,
  enableWebSearch?: boolean,
  permissions?: AgentToolPermissions,
  enableSpecializedSearch?: boolean,
): ToolRegistration[] => {
  const enabledModuleIds = new Set(enabledModules.map(module => module.id));
  const scopeIds = Array.isArray(moduleScope)
    ? moduleScope.filter(Boolean)
    : moduleScope
      ? [moduleScope]
      : [];
  const scopeSet = new Set(scopeIds);
  const canSearchWeb = !permissions || Boolean(permissions.web?.read);
  const searchRegistrations = [
    ...(enableWebSearch && canSearchWeb ? [WEB_SEARCH_TOOL_REGISTRATION] : []),
    ...(enableWebSearch && canSearchWeb ? [WEB_OPEN_TOOL_REGISTRATION] : []),
    ...(enableSpecializedSearch && canSearchWeb ? [SPECIALIZED_SEARCH_TOOL_REGISTRATION] : []),
  ];
  const allRegistrations = [...registry, ...searchRegistrations];
  const noTools = scopeSet.has('__no_tools__');
  const searchOnly = scopeSet.has('__search_only__');
  if (noTools) return [];

  return allRegistrations
    .filter(reg => {
      if (reg.module === 'web' || reg.module === 'system') return true;
      if (!enabledModuleIds.has(reg.module) || searchOnly) return false;
      return scopeSet.size === 0 || scopeSet.has(reg.module);
    })
    .filter(reg => canUseToolRegistration(reg, permissions));
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
    get_current_time: '获取当前时间',
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
    query_ssh_records: '查询 SSH 记录', create_ssh_category: '创建 SSH 分类', create_ssh_record: '创建 SSH 记录',
    query_api_records: '查询 API 记录', create_api_category: '创建 API 分类', create_api_record: '创建 API 记录',
    update_oj_submission: '更新做题记录', delete_oj_submission: '删除做题记录',
    query_oj_heatmap: '查询 OJ 热力图', create_oj_site: '创建 OJ 网站',
    update_oj_site: '更新 OJ 网站', delete_oj_site: '删除 OJ 网站',
    query_website_records: '查询网站记录', create_website_record: '创建网站记录',
    update_website_record: '更新网站记录', delete_website_record: '删除网站记录',
    create_website_tag: '创建网站标签', update_website_tag: '更新网站标签', delete_website_tag: '删除网站标签',
    delegate_complex_task: '复杂需求处理',
    query_leetcode_lists: '查询题单', read_leetcode_list: '读取题单',
    update_leetcode_list: '更新题单', delete_leetcode_list: '删除题单',
    create_leetcode_group: '创建题单分组', update_leetcode_group: '更新题单分组',
    delete_leetcode_group: '删除题单分组', create_leetcode_problem: '创建题目',
    update_leetcode_problem: '更新题目', delete_leetcode_problem: '删除题目',
    query_leetcode_progress: '查询题单进度', set_leetcode_problem_progress: '设置题目完成状态',
    query_code_categories: '查询 Code 分类', create_code_category: '创建 Code 分类',
    update_code_category: '更新 Code 分类', delete_code_category: '删除 Code 分类',
    query_code_category_notes: '查询 Code 分类笔记', read_code_category_note: '读取 Code 分类笔记',
    update_code_category_note: '更新 Code 分类笔记', delete_code_category_note: '清空 Code 分类笔记',
    query_code_exercises: '查询编码练习', read_code_exercise: '读取编码练习',
    create_code_exercise: '创建编码练习', update_code_exercise: '更新编码练习',
    delete_code_exercise: '删除编码练习', read_code_exercise_file: '读取练习文件',
    update_code_exercise_file: '更新练习文件', clear_code_exercise_file: '清空练习文件',
    query_learning_courses: '查询课程',
    query_learning_categories: '查询学习方向', query_learning_sections: '查询课程分区',
    create_learning_category: '创建学习分类', update_learning_category: '更新学习分类',
    delete_learning_category: '删除学习分类', read_learning_course: '读取课程',
    update_learning_course: '更新课程', delete_learning_course: '删除课程',
    create_learning_section: '创建课程分区', update_learning_section: '更新课程分区',
    delete_learning_section: '删除课程分区', read_learning_module: '读取课程章节',
    create_learning_module: '创建课程模块', update_learning_module: '更新课程模块',
    delete_learning_module: '删除课程模块', create_learning_item: '创建课程条目',
    read_learning_item: '读取课程条目',
    update_learning_item: '更新课程条目', delete_learning_item: '删除课程条目',
    query_files: '查询文件', read_file: '读取文件',
    edit_file: '编辑文件',
    query_question_categories: '查询题库分类', create_question_category: '创建题库分类',
    query_questions: '查询题目', create_question: '创建题目',
    update_question: '更新题目', delete_question: '删除题目',
    query_solution_methods: '查询解题方法', create_solution_method: '创建解题方法',
    update_solution_method: '更新解题方法',
    query_canvas_categories: '查询画布分类', create_canvas_category: '创建画布分类',
    query_canvases: '查询画布', create_canvas: '创建画布',
    update_canvas_meta: '更新画布', delete_canvas: '删除画布',
    query_music_library: '查询音乐库',
    query_git_repositories: '查询 Git 仓库', discover_git_repositories: '扫描 Git 仓库',
    query_git_status: '查询 Git 状态',
    query_git_repository_info: '查看仓库信息', query_git_log: '查询 Git 日志',
    query_git_remotes: '查询 Git 远程', query_git_tree: '查看仓库文件树',
    read_git_file: '读取仓库文件',
    query_git_diff: '查看 Git Diff', git_stage_files: '暂存文件',
    git_unstage_files: '取消暂存', git_commit: 'Git 提交',
    git_fetch: 'Git Fetch', git_pull: 'Git Pull', git_push: 'Git Push',
    git_add_repository: '添加 Git 仓库', git_remove_repository: '移除 Git 仓库',
    query_git_branches: '查询 Git 分支', query_git_stashes: '查询 Git Stash',
    query_git_commit: '查看 Git 提交',
    git_discard_file: '丢弃 Git 更改', git_checkout_branch: '切换 Git 分支',
    git_create_branch: '创建 Git 分支', git_delete_branch: '删除 Git 分支',
    git_merge_branch: '合并 Git 分支', git_stash: 'Git Stash',
    query_image_categories: '查询图片分类', create_image_category: '创建图片分类',
    update_image_category: '更新图片分类', delete_image_category: '删除图片分类',
    query_images: '查询图片', read_image_record: '读取图片记录', read_image_url: '读取图片链接',
    create_image_record: '创建图片记录', upload_image: '上传图片',
    update_image_record: '更新图片记录', delete_image_record: '删除图片记录', rename_image_category: '重命名图片分类',
    query_subtasks: '查询子任务', query_recurring_events: '查询重复事件',
    query_latex_file_categories: '查询 LaTeX 文件分类', create_latex_file_category: '创建 LaTeX 文件分类',
    update_latex_file_category: '更新 LaTeX 文件分类', delete_latex_file_category: '删除 LaTeX 文件分类',
    query_latex_files: '查询 LaTeX 文件', create_latex_file: '创建 LaTeX 文件',
    create_latex_file_from_template: '从模板创建 LaTeX 文件',
    read_latex_file: '读取 LaTeX 文件', edit_latex_file: '编辑 LaTeX 文件',
    rename_latex_file: '重命名 LaTeX 文件', move_latex_file: '移动 LaTeX 文件',
    delete_latex_file: '删除 LaTeX 文件',
    query_latex_template_categories: '查询模板分类', create_latex_template_category: '创建模板分类',
    rename_latex_template_category: '重命名模板分类', delete_latex_template_category: '删除模板分类',
    query_latex_templates: '查询 LaTeX 模板', read_latex_template: '读取 LaTeX 模板',
    create_latex_template: '创建 LaTeX 模板', edit_latex_template: '编辑 LaTeX 模板',
    delete_latex_template: '删除 LaTeX 模板',
    search_agent_capabilities: '查询 Agent 能力',
    tool_search: '搜索 Agent 工具能力',
    query_agent_skills: '查询 Agent Skills', load_agent_skill: '加载 Agent Skill',
    load_skill: '加载 Skill',
    query_mcp_servers: '查询 MCP Server', list_mcp_tools: '列出 MCP 工具',
    call_mcp_tool: '调用 MCP 工具', list_mcp_resources: '列出 MCP 资源',
    read_mcp_resource: '读取 MCP 资源', mcp_read_resource: '读取 MCP 资源',
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
