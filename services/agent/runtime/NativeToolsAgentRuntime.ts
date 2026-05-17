import { Annotation, END, GraphRecursionError, START, StateGraph } from '@langchain/langgraph';
import type {
  ChatDebugEvent,
  ChatMessage,
  ChatService,
  ChatTool,
  ChatToolCall,
  ChatToolDecisionResult,
  ChatToolExecutionResult,
  ChatToolSessionState,
} from '../../chatService';
import type {
  AgentPlanStep,
  AgentClarificationResult,
  AgentCompletionEvaluation,
  AgentRunStatus,
  AgentTraceEvent,
} from './types';
import {
  formatAgentMentionsForPrompt,
  stripAgentMentionTokens,
  type AgentMention,
} from '../agentMentions';

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const AGENT_PLANNER_TIMEOUT_MS = 15_000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => {
    onTimeout?.();
    reject(new Error(`${label} 超时（${Math.round(timeoutMs / 1000)} 秒）`));
  }, timeoutMs);

  promise
    .then((value) => {
      clearTimeout(timer);
      resolve(value);
    })
    .catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
});

interface NativeToolsAgentRuntimeState {
  runId: string;
  goal: string;
  status: AgentRunStatus;
  messages: ChatMessage[];
  tools: ChatTool[];
  clarification?: AgentClarificationResult;
  clarificationChecked: boolean;
  plan: AgentPlanStep[];
  currentStepIndex: number;
  session?: ChatToolSessionState;
  decision?: ChatToolDecisionResult;
  pendingToolCalls: ChatToolCall[];
  toolResults: ChatToolExecutionResult[];
  allToolCalls: ChatToolCall[];
  finalText: string;
  trace: AgentTraceEvent[];
  error?: string;
  maxIterations: number;
  correctionCount: number;
  pendingConfirmations: any[];
  undoSnapshots: any[];
  mentions: AgentMention[];
}

export interface NativeToolsAgentRuntimeOptions {
  chatService: ChatService;
  messages: ChatMessage[];
  tools: ChatTool[];
  goal: string;
  runId?: string;
  maxIterations?: number;
  mentions?: AgentMention[];
  executeToolCall: (toolCall: ChatToolCall) => Promise<any>;
  getToolRisk?: (toolCall: ChatToolCall) => 'read' | 'write';
  clarify?: (input: {
    goal: string;
    messages: ChatMessage[];
    tools: ChatTool[];
  }) => Promise<AgentClarificationResult> | AgentClarificationResult;
  evaluateCompletion?: (input: {
    goal: string;
    finalText: string;
    toolCalls: ChatToolCall[];
    toolResults: ChatToolExecutionResult[];
  }) => Promise<AgentCompletionEvaluation>;
  shouldCancel?: () => boolean;
  onTrace?: (event: AgentTraceEvent) => void;
  onDebugEvent?: (event: ChatDebugEvent) => void;
}

export interface NativeToolsAgentRuntimeResult {
  runId: string;
  status: AgentRunStatus;
  text: string;
  toolCalls: ChatToolCall[];
  toolResults: ChatToolExecutionResult[];
  trace: AgentTraceEvent[];
  clarification?: AgentClarificationResult;
  error?: string;
  pendingConfirmations: any[];
  undoSnapshots: any[];
}

export interface NativeToolExecutionEnvelope {
  __agentToolExecutionEnvelope: true;
  result: any;
  pendingConfirmation?: any;
  undoSnapshot?: any;
}

export const createAgentToolExecutionEnvelope = (
  result: any,
  sideEffect: Omit<NativeToolExecutionEnvelope, '__agentToolExecutionEnvelope' | 'result'> = {},
): NativeToolExecutionEnvelope => ({
  __agentToolExecutionEnvelope: true,
  result,
  ...sideEffect,
});

const unwrapToolExecutionResult = (value: any) => {
  if (value && typeof value === 'object' && value.__agentToolExecutionEnvelope === true) {
    return {
      result: value.result,
      pendingConfirmation: value.pendingConfirmation,
      undoSnapshot: value.undoSnapshot,
    };
  }
  return { result: value, pendingConfirmation: undefined, undoSnapshot: undefined };
};

const NativeToolsAgentRuntimeAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  status: Annotation<AgentRunStatus>(),
  messages: Annotation<ChatMessage[]>(),
  tools: Annotation<ChatTool[]>(),
  clarification: Annotation<AgentClarificationResult | undefined>(),
  clarificationChecked: Annotation<boolean>(),
  plan: Annotation<AgentPlanStep[]>(),
  currentStepIndex: Annotation<number>(),
  session: Annotation<ChatToolSessionState | undefined>(),
  decision: Annotation<ChatToolDecisionResult | undefined>(),
  pendingToolCalls: Annotation<ChatToolCall[]>(),
  toolResults: Annotation<ChatToolExecutionResult[]>(),
  allToolCalls: Annotation<ChatToolCall[]>(),
  finalText: Annotation<string>(),
  trace: Annotation<AgentTraceEvent[]>(),
  error: Annotation<string | undefined>(),
  maxIterations: Annotation<number>(),
  correctionCount: Annotation<number>(),
  pendingConfirmations: Annotation<any[]>(),
  undoSnapshots: Annotation<any[]>(),
  mentions: Annotation<AgentMention[]>(),
});

type GraphState = typeof NativeToolsAgentRuntimeAnnotation.State;

const createTrace = (
  state: NativeToolsAgentRuntimeState,
  event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
): AgentTraceEvent => ({
  id: nowId('trace'),
  runId: state.runId,
  timestamp: Date.now(),
  ...event,
});

const createInitialState = (options: NativeToolsAgentRuntimeOptions): GraphState => {
  const runId = options.runId || nowId('run');
  const mentions = options.mentions || [];
  const mentionContext = formatAgentMentionsForPrompt(mentions);
  const cleanGoal = stripAgentMentionTokens(options.goal) || options.goal;
  return {
  runId,
  goal: cleanGoal,
  status: 'idle',
  messages: mentionContext
    ? [
        ...options.messages,
        {
          id: nowId('mention_context'),
          role: 'system',
          timestamp: Date.now(),
          content: mentionContext,
        },
      ]
    : options.messages,
  tools: options.tools,
  clarification: undefined,
  clarificationChecked: false,
  plan: [],
  currentStepIndex: 0,
  session: undefined,
  decision: undefined,
  pendingToolCalls: [],
  toolResults: [],
  allToolCalls: [],
  finalText: '',
  trace: [],
  error: undefined,
  maxIterations: options.maxIterations ?? 10,
  correctionCount: 0,
  pendingConfirmations: [],
  undoSnapshots: [],
  mentions,
  };
};

const appendRuntimeSystemMessage = (
  session: ChatToolSessionState | undefined,
  message: string,
): ChatToolSessionState | undefined => {
  if (!session) return session;
  return {
    ...session,
    messages: [
      ...session.messages,
      {
        role: 'user',
        content: message,
      },
    ],
  };
};

const appendUserSessionMessage = (
  session: ChatToolSessionState,
  message: string,
): ChatToolSessionState => ({
  ...session,
  messages: [
    ...session.messages,
    {
      role: 'user',
      content: message,
    },
  ],
});

const compactJson = (value: any, maxLength = 1800) => {
  try {
    const text = JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value ?? '');
  }
};

const trimNaturalLanguageUrlSuffix = (url: string) => {
  let candidate = url;
  const suffixPatterns = [
    /(这个|该|此)?(页面|网页|网站|链接|网址|文档|地址)(是什么|是啥|干什么|做什么|有什么|讲什么|能干嘛).*$/i,
    /(帮我|请|麻烦)?(分析|总结|看看|看一下|解释|说明|阅读|打开|访问|查询|搜索|识别)(一下|下|这个|该|此)?.*$/i,
    /(你)?(分析|总结|看看|解释|说明)(一下|下)?$/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of suffixPatterns) {
      const next = candidate.replace(pattern, '').trim();
      if (next !== candidate && /^https?:\/\//i.test(next)) {
        candidate = next;
        changed = true;
      }
    }
  }
  return candidate;
};

const sanitizeExtractedUrl = (url: string) => {
  const candidate = trimNaturalLanguageUrlSuffix(
    url
      .trim()
      .replace(/[)）\]}>"'，。；;！？!?]+$/g, ''),
  );
  return candidate.replace(/[?&]+$/g, '');
};

const extractFirstUrl = (text: string) => {
  const matched = text.match(/https?:\/\/[^\s)）\]}>"'，。；;]+/i)?.[0] || '';
  return matched ? sanitizeExtractedUrl(matched) : '';
};

const normalizeSearchQueryText = (value: string) =>
  stripAgentMentionTokens(value)
    .replace(/\b(web_search|web_open|specialized_search)\b/gi, ' ')
    .replace(/\bstep[_\-\s]*\d+\b/gi, ' ')
    .replace(/使用\s*/g, ' ')
    .replace(/从\s*第?\s*\d+\s*步.*$/gi, ' ')
    .replace(/从\s*step[_\-\s]*\d+.*$/gi, ' ')
    .replace(/[「」“”"'`]/g, ' ')
    .replace(/[：:，,。；;]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

const compactSearchQuery = (parts: string[], maxLength = 180) => {
  const normalizedParts = parts
    .map(part => normalizeSearchQueryText(part))
    .filter(Boolean);
  const uniqueParts: string[] = [];
  for (const part of normalizedParts) {
    const lower = part.toLowerCase();
    if (uniqueParts.some(existing => existing.toLowerCase() === lower || existing.toLowerCase().includes(lower))) continue;
    uniqueParts.push(part);
  }
  const query = uniqueParts.join(' ').replace(/\s{2,}/g, ' ').trim();
  return query.length > maxLength ? query.slice(0, maxLength).trim() : query;
};

const buildWebSearchQueryForStep = (
  state: NativeToolsAgentRuntimeState,
  step: AgentPlanStep | undefined,
) => {
  const stepTitle = step?.title || '';
  const stepDescription = step?.description || '';
  const stepText = normalizeSearchQueryText(`${stepTitle} ${stepDescription}`);
  const isGenericStepText =
    !stepText ||
    /(搜索联网信息|搜索实时天气信息|带上当前日期|关键词|限定条件|检索|查询)/i.test(stepText) && stepText.length < 24;
  return compactSearchQuery([
    isGenericStepText ? '' : stepText,
    state.goal,
  ]) || state.goal;
};

const firstSearchResultUrl = (toolResults: ChatToolExecutionResult[]) => {
  const result = toolResults
    .filter(item => item.toolCall.name === 'web_search' && item.result?.success !== false && Array.isArray(item.result?.results))
    .slice(-1)[0]?.result;
  const results = Array.isArray(result?.results) ? result.results : [];
  const first = results.find((item: any) => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url));
  return first?.url ? sanitizeExtractedUrl(first.url) : '';
};

const latestCurrentTimeResult = (toolResults: ChatToolExecutionResult[]) =>
  latestToolResult(toolResults, 'get_current_time');

const latestWebsiteRecords = (toolResults: ChatToolExecutionResult[]) => {
  const result = latestToolResult(toolResults, 'query_website_records');
  return Array.isArray(result?.records) ? result.records : [];
};

const resolveMcpServerForGoal = (goal: string, toolResults: ChatToolExecutionResult[], explicitServer = '') => {
  const result = latestToolResult(toolResults, 'query_mcp_servers');
  const servers = Array.isArray(result?.servers) ? result.servers : [];
  if (servers.length === 0) return explicitServer;
  const explicitNeedle = explicitServer.trim().toLowerCase();
  if (explicitNeedle) {
    const explicitMatch = servers.find((server: any) => {
      const id = String(server?.id || '').toLowerCase();
      const name = String(server?.name || '').toLowerCase();
      return id === explicitNeedle || name === explicitNeedle;
    });
    if (explicitMatch) return String(explicitMatch.id || explicitMatch.name || explicitServer);
  }
  const lowerGoal = goal.toLowerCase();
  const matched = servers.find((server: any) => {
    const id = String(server?.id || '').toLowerCase();
    const name = String(server?.name || '').toLowerCase();
    return (id && lowerGoal.includes(id)) || (name && lowerGoal.includes(name));
  });
  return String((matched || servers[0])?.id || (matched || servers[0])?.name || '');
};

const MCP_PAGE_TEXT_EVALUATE_FUNCTION = `() => {
  const selectors = [
    'main',
    'article',
    '#main-content',
    '.main-content',
    '.region-content',
    '.node__content',
    '.node--type-conference-page'
  ];
  const root = selectors.map(selector => document.querySelector(selector)).find(Boolean) || document.body;
  return [
    document.title,
    location.href,
    root ? root.innerText : document.body.innerText
  ].filter(Boolean).join('\\n\\n');
}`;

const getMcpSubToolName = (toolCall: ChatToolCall) =>
  toolCall.name === 'call_mcp_tool' ? String(toolCall.arguments?.toolName || '') : '';

const hasMcpSubToolCall = (state: NativeToolsAgentRuntimeState, subToolName: string) =>
  state.allToolCalls.some(toolCall => getMcpSubToolName(toolCall) === subToolName);

const buildMcpPageTextToolCall = (state: NativeToolsAgentRuntimeState): ChatToolCall | null => {
  const server = resolveMcpServerForGoal(state.goal, state.toolResults, resolveMentionedMcpServer(state));
  if (!server || !extractFirstUrl(state.goal) || !hasMcpSubToolCall(state, 'browser_navigate')) return null;
  return {
    id: nowId('deterministic_call_mcp_tool'),
    name: 'call_mcp_tool',
    arguments: {
      server,
      toolName: 'browser_evaluate',
      arguments: { function: MCP_PAGE_TEXT_EVALUATE_FUNCTION },
    },
  };
};

const isMcpPageAnalysisStep = (goal: string, step: AgentPlanStep | undefined) => {
  if (!step || step.toolName !== 'call_mcp_tool') return false;
  if (!extractFirstUrl(goal)) return false;
  const text = `${step.title || ''} ${step.description || ''}`;
  return /(页面|网页|正文|内容|文本|快照|snapshot|提取|获取|读取|分析)/i.test(text);
};

const buildDeterministicToolCallForStep = (
  state: NativeToolsAgentRuntimeState,
  step: AgentPlanStep | undefined,
): ChatToolCall | null => {
  const toolName = step?.toolName;
  if (!toolName) return null;

  const id = nowId(`deterministic_${toolName}`);
  const make = (args: Record<string, any>): ChatToolCall => ({
    id,
    name: toolName,
    arguments: args,
  });

  switch (toolName) {
    case 'query_app_usage_guide':
      return make({
        query: state.goal,
        limit: /(全部|完整|详细|所有|全量)/i.test(state.goal) ? 20 : 5,
        includeFullGuide: /(全部|完整|详细|所有|全量)/i.test(state.goal),
      });
    case 'get_current_time':
      return make({ locale: 'zh-CN', timeZone: 'Asia/Shanghai' });
    case 'query_agent_skills':
      return make(isLocalCapabilityInventoryGoal(state.goal) ? { limit: 50 } : { query: state.goal, limit: 8 });
    case 'load_agent_skill':
    case 'load_skill': {
      const listed = latestToolResult(state.toolResults, 'query_agent_skills');
      const firstSkill = Array.isArray(listed?.skills) ? listed.skills[0] : null;
      const idOrName = inferSkillIdOrNameFromGoal(state.goal) || firstSkill?.id || firstSkill?.name || '';
      return idOrName ? make({ idOrName }) : null;
    }
    case 'query_mcp_servers':
      return make({ includeDisabled: false });
    case 'query_website_records':
      return make({ limit: 50 });
    case 'delete_website_record': {
      const records = latestWebsiteRecords(state.toolResults);
      const record = records[0];
      const id = typeof record?.id === 'string' ? record.id.trim() : '';
      return id ? make({ id }) : null;
    }
    case 'query_oj_stats':
      return make({ days: 0 });
    case 'query_oj_heatmap':
      return make({ days: 0, limit: 80 });
    case 'query_resources':
      return make({});
    case 'query_ssh_records':
    case 'query_api_records':
      return make({ limit: 50 });
    case 'query_learning_categories':
    case 'query_learning_courses':
      return make({});
    case 'query_git_repositories':
      return make({ refresh: true, limit: 20 });
    case 'query_image_categories':
      return make({});
    case 'query_images':
      return make({ limit: 20 });
    case 'query_question_categories':
      return make({});
    case 'query_questions':
      return make({ limit: 20, includeContent: false });
    case 'query_solution_methods':
      return make({ limit: 20, includeContent: false });
    case 'query_latex_file_categories':
    case 'query_latex_files':
    case 'query_latex_template_categories':
    case 'query_latex_templates':
      return make({});
    case 'query_code_categories':
    case 'query_code_category_notes':
      return make({});
    case 'query_code_exercises':
      return make({ limit: 20, includeFiles: false });
    case 'query_files':
      return make({ limit: 50 });
    case 'query_music_library':
      return make({ limit: 50 });
    case 'query_canvas_categories':
      return make({});
    case 'query_canvases':
      return make({ limit: 20 });
    case 'list_rag_collections':
      return make({ includeProfiles: true });
    case 'get_knowledge_base_index_status':
      return make({});
    case 'search_agent_capabilities':
    case 'tool_search':
      return make({
        query: isLocalCapabilityInventoryGoal(state.goal) ? 'skills mcp 工具 能力 capability' : state.goal,
        limit: 12,
      });
    case 'web_search': {
      const timeInfo = latestCurrentTimeResult(state.toolResults);
      const dateHint = timeInfo?.dateISO || timeInfo?.todayISO || '';
      const query = buildWebSearchQueryForStep(state, step);
      return make({
        query: dateHint && isTimeSensitiveGoal(state.goal) && !query.includes(dateHint)
          ? `${query} ${dateHint}`
          : query,
        maxResults: 5,
        timeRange: isTimeSensitiveGoal(state.goal) ? 'day' : undefined,
      });
    }
    case 'web_open': {
      const url = extractFirstUrl(state.goal) || firstSearchResultUrl(state.toolResults);
      if (!url) return null;
      return make({ url, query: state.goal, maxChars: 20000 });
    }
    case 'list_mcp_tools': {
      const server = resolveMcpServerForGoal(
        state.goal,
        state.toolResults,
        resolveMentionedMcpServer(state) || inferMcpServerFromGoal(state.goal),
      );
      return server ? make({ server }) : null;
    }
    case 'call_mcp_tool': {
      const server = resolveMcpServerForGoal(state.goal, state.toolResults, resolveMentionedMcpServer(state));
      if (!server) return null;
      const url = extractFirstUrl(state.goal);
      const stepText = `${step?.title || ''} ${step?.description || ''}`;
      if (url && /(导航|打开|访问|加载|navigate)/i.test(stepText) && !hasMcpSubToolCall(state, 'browser_navigate')) {
        return make({ server, toolName: 'browser_navigate', arguments: { url } });
      }
      if (isMcpPageAnalysisStep(state.goal, step) && hasMcpSubToolCall(state, 'browser_navigate')) {
        return buildMcpPageTextToolCall(state);
      }
      return null;
    }
    default:
      return null;
  }
};

const extractJsonObject = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || text;
  return JSON.parse(candidate);
};

const hasTool = (tools: ChatTool[], name: string) => tools.some(tool => tool.name === name);

const explicitMentionsOf = (state: Pick<NativeToolsAgentRuntimeState, 'mentions'>, type: AgentMention['type']) =>
  state.mentions.filter(mention => mention.type === type && (mention.invocationType || 'explicit') === 'explicit');

const resolveMentionedMcpServer = (state: Pick<NativeToolsAgentRuntimeState, 'mentions'>) => {
  const server = explicitMentionsOf(state, 'mcp-server')[0];
  return server?.value || server?.label || '';
};

const inferMcpServerFromGoal = (goal: string) =>
  /playwright/i.test(goal) ? 'playwright' : '';

const mentionedToolNames = (mentions: AgentMention[], tools: ChatTool[]) => {
  const available = new Set(tools.map(tool => tool.name));
  return mentions
    .filter(mention => mention.type === 'tool')
    .map(mention => mention.value || mention.label)
    .filter(name => available.has(name));
};

const inferSkillIdOrNameFromGoal = (goal: string) => {
  if (/(builtin:)?create[-_\s]?plan/i.test(goal)) return 'builtin:create-plan';
  const explicit = goal.match(/(?:使用|加载|调用|用)\s*([A-Za-z0-9:_-]{3,80})\s*(?:这个)?\s*(?:Skill|skill|技能)/i)?.[1];
  return explicit?.trim() || '';
};

const isTimeSensitiveGoal = (goal: string) =>
  /(今天|明天|昨天|后天|当前|现在|最新|实时|天气|新闻|预报|日程|提醒|几号|几点|日期|时间)/i.test(goal);

const isWeatherGoal = (goal: string) =>
  /(天气|气温|温度|下雨|降雨|空气质量|AQI|预报|风力|湿度)/i.test(goal);

const isLocalCapabilityInventoryGoal = (goal: string) => {
  const trimmed = goal.trim();
  const isUrlAnalysisGoal =
    /https?:\/\//i.test(trimmed) &&
    /(分析|报告|总结|阅读|打开|网页|页面|正文|文档)/i.test(trimmed) &&
    !/(当前|本地|已配置|可用).*(skill|skills|技能|mcp|能力|工具|插件|plugin|server|服务器)|具体有哪些|列出.*(skill|skills|技能|mcp|server|服务器)/i.test(trimmed);
  if (isUrlAnalysisGoal) return false;
  const asksInventory = /(有哪些|具体有哪些|列出|列表|清单|查看|查询|已配置|可用|能用|支持|接口|函数|工具)/i.test(trimmed);
  const localTargets = /(skill|skills|技能|mcp|能力|工具|插件|plugin|server|服务器|Agent\s*工具箱|工具箱|函数调用|function\s*calling)/i.test(trimmed);
  const likelyFollowUp = /^(具体)?有哪些[啊呢？?]*$|^列出来[吧。！!？?]*$|具体查询有哪些/i.test(trimmed);
  return (asksInventory && localTargets) || likelyFollowUp;
};

const isLocalCapabilityFollowUp = (goal: string) => {
  const trimmed = goal.trim();
  return /^(具体)?有哪些[啊呢？?]*$|^列出来[吧。！!？?]*$|具体查询有哪些/i.test(trimmed);
};

const wantsMcpInventory = (goal: string) =>
  isLocalCapabilityFollowUp(goal) || /(mcp|server|服务器)/i.test(goal);

const wantsSkillInventory = (goal: string) =>
  isLocalCapabilityFollowUp(goal) || /(skill|skills|技能)/i.test(goal);

const wantsGeneralCapabilityInventory = (goal: string) =>
  isLocalCapabilityFollowUp(goal) || /(能力|工具|插件|plugin|Agent\s*工具箱|工具箱|接口|函数|function\s*calling)/i.test(goal);

const isAppUsageGuideGoal = (goal: string) => {
  const trimmed = goal.trim();
  if (isLocalCapabilityInventoryGoal(trimmed)) return false;
  const usageIntent = /(怎么用|如何使用|使用方法|使用指南|操作指南|帮助文档|说明文档|教程|怎么操作|怎么配置|怎么设置|功能介绍|功能说明|有哪些功能|模块说明|使用文档)/i.test(trimmed);
  const appTarget = /(Guyue|古月|这个\s*App|这个\s*app|本\s*App|本\s*app|应用|软件|系统|工作台|模块|Agent|智能体|Skills?|MCP|Prompt|RAG|知识库|数据中心|学习空间|题库|题单|解题方法|待办|日程|文件管理|图床|LaTeX|Git|画布|音乐)/i.test(trimmed);
  return usageIntent && appTarget;
};

const wantsMcpToolsList = (goal: string) =>
  /(list_mcp_tools|MCP\s*Server.*工具|MCP.*工具列表|MCP.*(?:有哪些|可用|列出|查看|查询).{0,24}工具|Playwright.*MCP.*工具|工具名称逐项|列出.*MCP.*tools?|列出.*MCP.*工具)/i.test(goal);

const hasNaturalMcpReference = (goal: string) =>
  /(mcp|Playwright\s*(?:这个)?\s*(?:MCP|服务|工具)|用\s*Playwright|浏览器\s*MCP)/i.test(goal);

const shouldUseCurrentTime = (goal: string) =>
  isTimeSensitiveGoal(goal) && !isLocalCapabilityInventoryGoal(goal);

const hasReadOnlyIntent = (goal: string) =>
  /(看一下|看看|查看|查询|列出|有哪些|列表|清单|概览|大概|汇总|统计|只看|不改|不要改|不要修改|不要保存|不要删除)/i.test(goal);

const normalizeIntentText = (text: string) => text
  .replace(/(?:不要|无需|不需要|不用|不|别|禁止)(?:创建|新建|新增|添加|保存|记录|导入|上传|修改|更新|改成|重命名|编辑|调整|移动|归档|完成|标记|删除|移除|清空|丢弃|撤销|提交|推送|发送|构建)(?:[\/、和或以及]*(?:创建|新建|新增|添加|保存|记录|导入|上传|修改|更新|改成|重命名|编辑|调整|移动|归档|完成|标记|删除|移除|清空|丢弃|撤销|提交|推送|发送|构建))*[^，。；;,.]*/g, '')
  .replace(/(?:只读|只看|查询|列出|读取|搜索|获取)[^，。；;,.]{0,24}(?:不要|无需|不需要|不用|别|禁止)[^，。；;,.]{0,48}/g, '');

const hasWriteIntent = (goal: string) =>
  /(新建|新增|添加|创建|修改|更新|编辑|保存|删除|移除|清空|提交|推送|发送|上传|导入|导出|构建)/i.test(normalizeIntentText(goal));

const isStrictReadOnlyGoal = (goal: string) =>
  hasReadOnlyIntent(goal) && !hasWriteIntent(goal);

const isWriteToolName = (toolName?: string) =>
  /^(create|update|delete|send|upload|import|export|save|write|move|rename|archive|complete|submit|push|pull|fetch|merge|stash|stage)_/i.test(toolName || '');

const isDataCenterReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(数据中心|网站管理|网站记录|OJ记录|OJ|刷题记录|资源中心|云资源|SSH管理|SSH|API管理|API记录|接口记录)/i.test(goal);

const isWebsiteRecordDeleteGoal = (goal: string) =>
  /(删除|移除|删掉|删了|清理)/i.test(goal) &&
  /(网站记录|网站管理|网站|账号记录|密码记录)/i.test(goal);

const isLearningReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(学习空间|学习方向|课程|章节|学习内容|学习资源|其他资源)/i.test(goal);

const isGitReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(Git管理|存储库|仓库|git\s*仓库|分支|远程仓库|提交记录|git\s*状态)/i.test(goal);

const isImageHostReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(图床|图片管理|图片分类|图片链接|最近.*图片)/i.test(goal);

const isLeetCodeReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  (
    /(LeetCode|leetcode|力扣|洛谷|刷题)/i.test(goal) ||
    (/(题单|完成进度|刷题进度|做题进度)/i.test(goal) && !/(题库|解题方法|题目分类)/i.test(goal))
  );

const isQuestionBankReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(题库|题目|解题方法|题目分类)/i.test(goal) &&
  !isLeetCodeReadGoal(goal);

const isLatexReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(LaTeX|latex|模板库|模板|tex文件|托管文件)/i.test(goal);

const isCodeReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(Code模块|编码练习|练习文件|分类笔记|代码笔记|code\s*模块)/i.test(goal);

const isFileManagerReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(文件管理|文件列表|收藏.*路径|标记.*路径|文件分类|文件夹分类|常用文件|常用路径)/i.test(goal);

const isMusicReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(音乐库|音乐模块|Music|歌曲|歌单|播放列表|曲库|歌词|专辑|艺术家)/i.test(goal);

const isCanvasReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(画布库|画布分类|画布|绘图板|白板|Excalidraw|excalidraw)/i.test(goal);

const isRagReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(RAG|知识库|向量库|索引状态|知识库索引)/i.test(goal);

const isTodoReadGoal = (goal: string) =>
  isStrictReadOnlyGoal(goal) &&
  /(待办|事项|任务|提醒|日程|安排|开会|会议|todo)/i.test(goal);

const isWebInformationGoal = (goal: string) => {
  if (isLocalCapabilityInventoryGoal(goal)) return false;
  if (/(联网|搜索|网页|官网|新闻|最新|实时|天气|价格|股价|汇率|版本|GitHub|github|npm|StackOverflow|stackoverflow|arXiv|论文|博客|报道|公告)/i.test(goal)) {
    return true;
  }
  return /(查一下|查询|检索)/i.test(goal) &&
    /(网上|互联网|外网|新闻|天气|价格|股价|汇率|官网|资料|Google|谷歌|Bing|百度|DuckDuckGo|GitHub|github|npm|StackOverflow|stackoverflow|arXiv|论文|博客|报道|公告|最新|实时)/i.test(goal);
};

const isTodoCreateGoal = (goal: string) =>
  !isStrictReadOnlyGoal(goal) &&
  /(新建|新增|添加|创建|加一个|加到|加入|设置.*提醒|设.*提醒|提醒我|记一下|记录一下|帮我记|帮我记录|安排一下|安排一个|安排一场|帮我安排)/i.test(normalizeIntentText(goal)) &&
  /(待办|事项|任务|提醒|日程|安排|开会|会议|约|预约|todo)/i.test(goal);

const isComplexGenerationGoal = (goal: string) =>
  /(论文|长文|报告|方案|综述|研究|深度分析|复杂推理|完整文档|一千字|千字|1000字|2000字|3000字|不少于|详细论述|系统分析|结构化方案)/i.test(goal);

const isSourceGroundedWebSummaryGoal = (goal: string) =>
  isWebInformationGoal(goal) &&
  /(https?:\/\/|网页|页面|链接|网址|URL|文档|instructions?|官网)/i.test(goal) &&
  !/(论文|长文|一千字|千字|1000字|2000字|3000字|不少于)/i.test(goal);

const hasExplicitUrl = (goal: string) => /https?:\/\//i.test(goal);

const isKnownLocalReadGoal = (goal: string) =>
  isDataCenterReadGoal(goal) ||
  isLearningReadGoal(goal) ||
  isGitReadGoal(goal) ||
  isImageHostReadGoal(goal) ||
  isLeetCodeReadGoal(goal) ||
  isQuestionBankReadGoal(goal) ||
  isLatexReadGoal(goal) ||
  isCodeReadGoal(goal) ||
  isFileManagerReadGoal(goal) ||
  isMusicReadGoal(goal) ||
  isCanvasReadGoal(goal) ||
  isRagReadGoal(goal) ||
  isTodoReadGoal(goal);

const shouldUseDeterministicPlanner = (
  goal: string,
  tools: ChatTool[],
  mentions: AgentMention[] = [],
) => {
  const hasMcpMention = mentions.some(mention => mention.type === 'mcp-server') || hasNaturalMcpReference(goal);
  if (isSourceGroundedWebSummaryGoal(goal) && hasExplicitUrl(goal) && hasTool(tools, 'web_open') && !hasMcpMention) {
    return true;
  }
  if (hasMcpMention && hasExplicitUrl(goal) && hasTool(tools, 'call_mcp_tool')) {
    return true;
  }
  if (isLocalCapabilityInventoryGoal(goal)) {
    return true;
  }
  if (shouldLoadSkillContext(goal) && inferSkillIdOrNameFromGoal(goal) && (hasTool(tools, 'load_agent_skill') || hasTool(tools, 'load_skill'))) {
    return true;
  }
  if (isKnownLocalReadGoal(goal)) {
    return true;
  }
  if (isWebsiteRecordDeleteGoal(goal) && hasTool(tools, 'query_website_records') && hasTool(tools, 'delete_website_record')) {
    return true;
  }
  return false;
};

const createPlanStep = (
  id: string,
  title: string,
  toolName?: string,
  description?: string,
): AgentPlanStep => ({
  id,
  title,
  description,
  toolName,
  status: 'pending',
});

const buildFallbackPlan = (goal: string, tools: ChatTool[], mentions: AgentMention[] = []): AgentPlanStep[] => {
  const steps: AgentPlanStep[] = [];
  const explicitToolNames = mentionedToolNames(mentions, tools);
  const hasMcpMention = mentions.some(mention => mention.type === 'mcp-server') || hasNaturalMcpReference(goal);
  const addQueryStep = (id: string, title: string, toolName: string, description: string) => {
    if (hasTool(tools, toolName) && !steps.some(step => step.toolName === toolName)) {
      steps.push(createPlanStep(id, title, toolName, description));
    }
  };

  if (shouldUseCurrentTime(goal) && hasTool(tools, 'get_current_time')) {
    steps.push(createPlanStep('step_1_time', '获取当前电脑时间', 'get_current_time', '先确认本地实时日期和时区，避免相对日期出错。'));
  }

  if (hasMcpMention && hasExplicitUrl(goal) && hasTool(tools, 'call_mcp_tool')) {
    addQueryStep('step_query_mcp_servers', '查询 MCP Server', 'query_mcp_servers', '先确认本地可用的 MCP Server，并选择用户提到的 Playwright。');
    steps.push(createPlanStep('step_mcp_navigate', '打开目标网页', 'call_mcp_tool', '使用浏览器 MCP 导航到用户给出的 URL。'));
    steps.push(createPlanStep('step_mcp_extract_text', '提取页面内容', 'call_mcp_tool', '使用浏览器 MCP 读取页面正文、标题和 URL。'));
    steps.push(createPlanStep('step_final_report', '分析并回复用户'));
    return steps.slice(0, 8);
  }

  for (const toolName of explicitToolNames) {
    if (!steps.some(step => step.toolName === toolName)) {
      steps.push(createPlanStep(`step_mention_${toolName}`, `使用 @ 指定工具 ${toolName}`, toolName, '用户显式指定了该工具，优先判断并调用。'));
    }
  }

  const inferredSkill = inferSkillIdOrNameFromGoal(goal);
  if (!isLocalCapabilityInventoryGoal(goal) && shouldLoadSkillContext(goal) && inferredSkill && (hasTool(tools, 'load_agent_skill') || hasTool(tools, 'load_skill'))) {
    addQueryStep('step_query_skills', '查询相关 Skill', 'query_agent_skills', '先确认本地可用 Skills，避免把 Prompt 卡片当作 Skill。');
    addQueryStep('step_load_skill', '加载指定 Skill', hasTool(tools, 'load_agent_skill') ? 'load_agent_skill' : 'load_skill', `加载用户指定的 Skill：${inferredSkill}。`);
  } else if (isLocalCapabilityInventoryGoal(goal)) {
    if (wantsMcpToolsList(goal) && hasTool(tools, 'list_mcp_tools')) {
      steps.push(createPlanStep('step_1_list_mcp_tools', '列出 MCP Server 工具', 'list_mcp_tools', '查询目标 MCP Server 暴露的工具列表。'));
      steps.push(createPlanStep('step_final_report', '汇总工具名称并回复用户'));
      return steps;
    }
    if ((wantsSkillInventory(goal) || wantsGeneralCapabilityInventory(goal)) && hasTool(tools, 'query_agent_skills')) {
      steps.push(createPlanStep('step_2_query_skills', '查询本地 Agent Skills 列表', 'query_agent_skills', '列出当前应用中已配置、可加载的 Skills，不要联网搜索概念说明。'));
    }
    if ((wantsMcpInventory(goal) || wantsGeneralCapabilityInventory(goal)) && hasTool(tools, 'query_mcp_servers')) {
      steps.push(createPlanStep('step_3_query_mcp_servers', '查询本地 MCP Server 列表', 'query_mcp_servers', '列出 Skills/MCP 中心已配置的 MCP Server。'));
    }
    if (wantsGeneralCapabilityInventory(goal) && hasTool(tools, 'search_agent_capabilities')) {
      steps.push(createPlanStep('step_4_query_capabilities', '查询已注册 Agent 能力', 'search_agent_capabilities', '补充列出当前能力表中的相关工具来源和分类。'));
    }
  } else if (isAppUsageGuideGoal(goal) && hasTool(tools, 'query_app_usage_guide')) {
    steps.push(createPlanStep('step_2_query_app_usage_guide', '查询 App 使用指南', 'query_app_usage_guide', '读取内置使用文档后回答用户，不要联网猜测。'));
  } else if (isWebInformationGoal(goal) && hasTool(tools, 'web_search')) {
    steps.push(createPlanStep('step_2_search', isWeatherGoal(goal) ? '搜索实时天气信息' : '搜索联网信息', 'web_search', '带上当前日期、关键词和限定条件检索。'));
    if (hasTool(tools, 'web_open')) {
      steps.push(createPlanStep('step_3_open', '打开最相关来源', 'web_open', '读取搜索结果页正文，确认摘要之外的具体信息。'));
    }
  } else if (isDataCenterReadGoal(goal)) {
    const wantsAllDataCenter = /数据中心/.test(goal) || /(网站|OJ|资源|SSH|API).*(网站|OJ|资源|SSH|API)/i.test(goal);
    if (wantsAllDataCenter || /(网站|账号|密码)/i.test(goal)) {
      addQueryStep('step_dc_websites', '查询网站管理记录', 'query_website_records', '读取网站记录、标签和是否保存了本地密码，不返回密码明文。');
    }
    if (wantsAllDataCenter || /(OJ|刷题)/i.test(goal)) {
      addQueryStep('step_dc_oj_stats', '查询 OJ 做题统计', 'query_oj_stats', '读取 OJ 统计、平台和最近提交记录。');
      addQueryStep('step_dc_oj_heatmap', '查询 OJ 热力图记录', 'query_oj_heatmap', '读取 OJ 热力图和做题记录。');
    }
    if (wantsAllDataCenter || /(资源中心|云资源|资源|订阅|服务器|域名)/i.test(goal)) {
      addQueryStep('step_dc_resources', '查询资源中心记录', 'query_resources', '读取资源中心分类、资源、到期和费用信息。');
    }
    if (wantsAllDataCenter || /SSH/i.test(goal)) {
      addQueryStep('step_dc_ssh', '查询 SSH 管理记录', 'query_ssh_records', '读取 SSH 分类、主机、端口、用户名和备注。');
    }
    if (wantsAllDataCenter || /(API|接口)/i.test(goal)) {
      addQueryStep('step_dc_api', '查询 API 管理记录', 'query_api_records', '读取 API 分类、余额字段和是否保存了本地密钥，不返回密钥明文。');
    }
  } else if (isWebsiteRecordDeleteGoal(goal)) {
    addQueryStep('step_dc_websites_before_delete', '查询网站记录', 'query_website_records', '先读取网站记录列表，确定用户所说的目标记录 id；不读取密码明文。');
    addQueryStep('step_dc_delete_website_record', '删除目标网站记录', 'delete_website_record', '只删除已查询到的目标记录。该步骤必须进入确认流程，用户确认前不得真正删除。');
  } else if (isLearningReadGoal(goal)) {
    addQueryStep('step_learning_categories', '查询学习空间分类', 'query_learning_categories', '读取学习方向、课程分类和层级。');
    addQueryStep('step_learning_courses', '查询学习空间课程', 'query_learning_courses', '读取课程列表和基本状态。');
  } else if (isGitReadGoal(goal)) {
    addQueryStep('step_git_repositories', '查询 Git 仓库列表', 'query_git_repositories', '读取已登记仓库、分支和远程信息。');
  } else if (isImageHostReadGoal(goal)) {
    addQueryStep('step_image_categories', '查询图床分类', 'query_image_categories', '读取图床分类列表。');
    addQueryStep('step_images', '查询图床图片', 'query_images', '读取最近图片记录和链接。');
  } else if (isLeetCodeReadGoal(goal)) {
    addQueryStep('step_leetcode_lists', '查询刷题题单', 'query_leetcode_lists', '读取 LeetCode/刷题题单、分组数和题目数量。');
    addQueryStep('step_leetcode_progress', '查询刷题完成进度', 'query_leetcode_progress', '读取题单完成数量、完成率和题目完成状态。');
  } else if (isQuestionBankReadGoal(goal)) {
    addQueryStep('step_question_categories', '查询题库分类', 'query_question_categories', '读取题库分类树。');
    addQueryStep('step_questions', '查询题目列表', 'query_questions', '读取最近题目和元信息。');
    if (/解题方法/.test(goal)) {
      addQueryStep('step_solution_methods', '查询解题方法', 'query_solution_methods', '读取解题方法分类和内容摘要。');
    }
  } else if (isLatexReadGoal(goal)) {
    addQueryStep('step_latex_file_categories', '查询 LaTeX 文件分类', 'query_latex_file_categories', '读取托管文件分类。');
    addQueryStep('step_latex_files', '查询 LaTeX 文件', 'query_latex_files', '读取托管文件列表。');
    addQueryStep('step_latex_template_categories', '查询 LaTeX 模板分类', 'query_latex_template_categories', '读取模板分类。');
    addQueryStep('step_latex_templates', '查询 LaTeX 模板', 'query_latex_templates', '读取模板列表。');
  } else if (isCodeReadGoal(goal)) {
    addQueryStep('step_code_categories', '查询 Code 分类', 'query_code_categories', '读取 Code 模块分类。');
    addQueryStep('step_code_notes', '查询分类笔记', 'query_code_category_notes', '读取分类笔记列表。');
    addQueryStep('step_code_exercises', '查询编码练习', 'query_code_exercises', '读取编码练习列表。');
  } else if (isFileManagerReadGoal(goal)) {
    addQueryStep('step_files', '查询文件管理列表', 'query_files', '读取文件管理中的已授权分类、文件元信息、备注和标记信息。');
  } else if (isMusicReadGoal(goal)) {
    addQueryStep('step_music_library', '查询音乐库', 'query_music_library', '读取 Music 模块中的歌曲、播放列表和当前选中状态，不播放也不修改。');
  } else if (isCanvasReadGoal(goal)) {
    addQueryStep('step_canvas_categories', '查询画布分类', 'query_canvas_categories', '读取画布分类、图标颜色和画布数量。');
    addQueryStep('step_canvases', '查询画布列表', 'query_canvases', '读取画布名称、分类、更新时间和元数据，不打开编辑器。');
  } else if (isRagReadGoal(goal)) {
    addQueryStep('step_rag_collections', '查询 RAG 知识库列表', 'list_rag_collections', '读取知识库集合、文档数量和索引状态。');
    addQueryStep('step_rag_status', '查询知识库索引状态', 'get_knowledge_base_index_status', '读取当前知识库索引构建状态。');
  } else if (isTodoReadGoal(goal)) {
    addQueryStep('step_todos', '查询待办和日程', 'query_todos', '读取待办分类、最近事项和日程安排；只读，不创建不修改。');
  } else if (isComplexGenerationGoal(goal) && !isSourceGroundedWebSummaryGoal(goal) && hasTool(tools, 'delegate_complex_task')) {
    steps.push(createPlanStep('step_2_delegate_complex', '委托复杂需求处理模型', 'delegate_complex_task', '把完整任务、背景和输出要求交给复杂模型处理。'));
  } else if (isTodoCreateGoal(goal)) {
    if (hasTool(tools, 'query_todos')) {
      steps.push(createPlanStep('step_2_query_todo_categories', '查询待办分类', 'query_todos', '创建前先获取 availableCategories，不能使用默认或未分类。'));
    }
    if (hasTool(tools, 'create_todo')) {
      steps.push(createPlanStep('step_3_create_todo', '创建待办事项', 'create_todo', '根据用户意图和已有分类创建事项；信息不足时先向用户补充确认。'));
    }
  }

  if (steps.length === 0) {
    steps.push(createPlanStep('step_1_answer', '直接回答或选择合适工具', undefined, '如果没有必要调用工具，直接给出回答。'));
  }

  steps.push(createPlanStep('step_final_report', '汇总结果并回复用户'));
  return steps.slice(0, 8);
};

const parsePlanSteps = (text: string, tools: ChatTool[], goal: string, mentions: AgentMention[] = []): AgentPlanStep[] => {
  const toolNames = new Set(tools.map(tool => tool.name));
  try {
    const parsed = extractJsonObject(text);
    const rawSteps = Array.isArray(parsed?.steps)
      ? parsed.steps
      : Array.isArray(parsed?.plan)
        ? parsed.plan
        : [];
    const steps = rawSteps
      .map((step: any, index: number): AgentPlanStep | null => {
        const rawToolName = String(step?.toolName ?? step?.tool ?? step?.expectedTool ?? '').trim();
        const toolName = rawToolName && toolNames.has(rawToolName) ? rawToolName : undefined;
        const title = String(step?.title ?? step?.name ?? `步骤 ${index + 1}`).trim();
        if (!title) return null;
        return {
          id: String(step?.id ?? `step_${index + 1}`),
          title,
          description: typeof step?.description === 'string' ? step.description.trim() : undefined,
          toolName,
          verification: typeof step?.verification === 'string' ? step.verification.trim() : undefined,
          risk: ['low', 'medium', 'high'].includes(step?.risk) ? step.risk : undefined,
          status: 'pending',
        };
      })
      .filter(Boolean) as AgentPlanStep[];
    return steps.length > 0 ? steps.slice(0, 8) : buildFallbackPlan(goal, tools, mentions);
  } catch {
    return buildFallbackPlan(goal, tools, mentions);
  }
};

const ensureStepBefore = (
  steps: AgentPlanStep[],
  beforeToolName: string,
  requiredStep: AgentPlanStep,
) => {
  if (steps.some(step => step.toolName === requiredStep.toolName)) return steps;
  const targetIndex = steps.findIndex(step => step.toolName === beforeToolName);
  if (targetIndex === -1) return steps;
  const next = [...steps];
  next.splice(targetIndex, 0, requiredStep);
  return next;
};

const insertBeforeFinalStep = (steps: AgentPlanStep[], requiredStep: AgentPlanStep) => {
  if (steps.some(step => step.toolName === requiredStep.toolName)) return steps;
  const finalIndex = steps.findIndex((step, index) =>
    index === steps.length - 1 &&
    !step.toolName &&
    /(汇总|总结|回复|回答|final|report)/i.test(step.title),
  );
  const next = [...steps];
  next.splice(finalIndex >= 0 ? finalIndex : next.length, 0, requiredStep);
  return next;
};

const appendBeforeFinalStep = (steps: AgentPlanStep[], step: AgentPlanStep) => {
  const finalIndex = steps.findIndex((item, index) =>
    index === steps.length - 1 &&
    !item.toolName &&
    /(汇总|总结|回复|回答|final|report|分析)/i.test(item.title),
  );
  const next = [...steps];
  next.splice(finalIndex >= 0 ? finalIndex : next.length, 0, step);
  return next;
};

const normalizePlanSteps = (goal: string, tools: ChatTool[], rawSteps: AgentPlanStep[], mentions: AgentMention[] = []) => {
  let steps = rawSteps.filter(step => step.title.trim()).slice(0, 8);
  const hasMcpMention = mentions.some(mention => mention.type === 'mcp-server') || hasNaturalMcpReference(goal);
  const prefersMcp = hasMcpMention || steps.some(step => step.toolName === 'call_mcp_tool');
  const explicitToolNames = mentionedToolNames(mentions, tools);

  if (isStrictReadOnlyGoal(goal)) {
    steps = steps.filter(step => !isWriteToolName(step.toolName));
  }

  if (wantsMcpToolsList(goal) && hasTool(tools, 'list_mcp_tools')) {
    const listStep = steps.find(step => step.toolName === 'list_mcp_tools') ||
      createPlanStep('step_list_mcp_tools', '列出 MCP Server 工具', 'list_mcp_tools', '查询目标 MCP Server 暴露的工具列表。');
    const queryStep = hasTool(tools, 'query_mcp_servers')
      ? createPlanStep('step_query_mcp_servers', '查询 MCP Server', 'query_mcp_servers', '先确认本地可用的 MCP Server。')
      : null;
    return [
      ...(queryStep ? [queryStep] : []),
      { ...listStep, id: listStep.id || 'step_list_mcp_tools', status: listStep.status || 'pending' },
      createPlanStep('step_final_report', '汇总工具名称并回复用户'),
    ];
  }

  if (isLocalCapabilityInventoryGoal(goal)) {
    steps = steps.filter(step =>
      !['get_current_time', 'web_search', 'web_open', 'specialized_search'].includes(step.toolName || ''),
    );
  }

  if (prefersMcp && hasTool(tools, 'query_mcp_servers') && !steps.some(step => step.toolName === 'query_mcp_servers')) {
    steps = insertBeforeFinalStep(steps, createPlanStep(
      'step_mention_query_mcp_servers',
      '查询 MCP Server',
      'query_mcp_servers',
      '用户提到了 MCP 或计划包含 MCP 调用，先确认本地配置。',
    ));
  }
  if (prefersMcp && !isLocalCapabilityInventoryGoal(goal) && !wantsMcpToolsList(goal)) {
    steps = steps.filter(step => step.toolName !== 'list_mcp_tools');
  }
  if (prefersMcp && hasExplicitUrl(goal) && hasTool(tools, 'call_mcp_tool')) {
    steps = steps.filter(step => !['web_search', 'web_open'].includes(step.toolName || ''));
    const hasNavigateStep = steps.some(step =>
      step.toolName === 'call_mcp_tool' && /(导航|打开|访问|navigate)/i.test(`${step.title} ${step.description || ''}`),
    );
    const hasExtractStep = steps.some(step =>
      step.toolName === 'call_mcp_tool' && /(提取|读取|正文|内容|evaluate|innerText|textContent)/i.test(`${step.title} ${step.description || ''}`),
    );
    if (!hasNavigateStep) {
      steps = appendBeforeFinalStep(steps, createPlanStep(
        'step_mcp_navigate',
        '打开目标网页',
        'call_mcp_tool',
        '使用浏览器 MCP 导航到用户给出的 URL。',
      ));
    }
    if (!hasExtractStep) {
      steps = appendBeforeFinalStep(steps, createPlanStep(
        'step_mcp_extract_text',
        '提取页面内容',
        'call_mcp_tool',
        '使用浏览器 MCP 读取页面正文、标题和 URL。',
      ));
    }
  }

  for (const toolName of explicitToolNames) {
    if (!steps.some(step => step.toolName === toolName)) {
      steps = insertBeforeFinalStep(steps, createPlanStep(
        `step_mention_${toolName}`,
        `使用 @ 指定工具 ${toolName}`,
        toolName,
        '用户显式 @ 指定该工具，优先纳入执行计划。',
      ));
    }
  }

  if (shouldUseCurrentTime(goal) && hasTool(tools, 'get_current_time') && !steps.some(step => step.toolName === 'get_current_time')) {
    steps = [
      createPlanStep('step_time', '获取当前电脑时间', 'get_current_time', '先确认本地实时日期和时区，避免今天/明天/昨天出错。'),
      ...steps,
    ];
  }

  if (isLocalCapabilityInventoryGoal(goal)) {
    if ((wantsSkillInventory(goal) || wantsGeneralCapabilityInventory(goal)) && hasTool(tools, 'query_agent_skills') && !steps.some(step => step.toolName === 'query_agent_skills')) {
      steps = insertBeforeFinalStep(steps, createPlanStep('step_query_agent_skills', '查询本地 Agent Skills 列表', 'query_agent_skills', '列出当前应用中已配置、可加载的 Skills。'));
    }
    if ((wantsMcpInventory(goal) || wantsGeneralCapabilityInventory(goal)) && hasTool(tools, 'query_mcp_servers') && !steps.some(step => step.toolName === 'query_mcp_servers')) {
      steps = insertBeforeFinalStep(steps, createPlanStep('step_query_mcp_servers', '查询本地 MCP Server 列表', 'query_mcp_servers', '列出 Skills/MCP 中心已配置的 MCP Server。'));
    }
  }

  if (isAppUsageGuideGoal(goal) && hasTool(tools, 'query_app_usage_guide') && !steps.some(step => step.toolName === 'query_app_usage_guide')) {
    steps = steps.filter(step =>
      !['web_search', 'web_open', 'specialized_search', 'get_current_time'].includes(step.toolName || ''),
    );
    steps = insertBeforeFinalStep(steps, createPlanStep(
      'step_query_app_usage_guide',
      '查询 App 使用指南',
      'query_app_usage_guide',
      '读取内置使用文档后回答用户，不要联网猜测。',
    ));
  }

  if (!prefersMcp && isWebInformationGoal(goal) && hasTool(tools, 'web_search') && !steps.some(step => step.toolName === 'web_search')) {
    steps = insertBeforeFinalStep(steps, createPlanStep('step_web_search', isWeatherGoal(goal) ? '搜索实时天气信息' : '搜索联网信息', 'web_search', '带上当前日期、关键词和限定条件检索。'));
  }

  if (!prefersMcp && isWebInformationGoal(goal) && hasTool(tools, 'web_open') && steps.some(step => step.toolName === 'web_search') && !steps.some(step => step.toolName === 'web_open')) {
    const searchIndex = steps.findIndex(step => step.toolName === 'web_search');
    const next = [...steps];
    next.splice(searchIndex + 1, 0, createPlanStep('step_web_open', '打开最相关来源', 'web_open', '读取网页正文确认搜索摘要。'));
    steps = next;
  }

  if (isTodoCreateGoal(goal) && hasTool(tools, 'create_todo') && !steps.some(step => step.toolName === 'create_todo')) {
    steps = insertBeforeFinalStep(steps, createPlanStep('step_create_todo', '创建待办事项', 'create_todo', '根据用户意图和已有分类创建事项；信息不足时先向用户补充确认。'));
  }

  if (isTodoCreateGoal(goal) && hasTool(tools, 'query_todos') && steps.some(step => step.toolName === 'create_todo')) {
    steps = ensureStepBefore(
      steps,
      'create_todo',
      createPlanStep('step_query_todos', '查询待办分类', 'query_todos', '先获取 availableCategories，再决定使用哪个分类或是否需要新建分类。'),
    );
  }

  if (!prefersMcp && isSourceGroundedWebSummaryGoal(goal)) {
    steps = steps.filter(step =>
      ![
        'delegate_complex_task',
        ...(hasExplicitUrl(goal) ? ['web_search', 'specialized_search'] : []),
        'search_agent_capabilities',
        'tool_search',
        'query_agent_skills',
        'load_agent_skill',
        'query_mcp_servers',
        'list_mcp_tools',
        'list_mcp_resources',
      ].includes(step.toolName || ''),
    );
    if (hasTool(tools, 'web_open') && !steps.some(step => step.toolName === 'web_open')) {
      steps = [
        createPlanStep('step_web_open', '打开目标网页', 'web_open', '读取用户给出的 URL 正文，后续报告必须基于页面内容。'),
        ...steps,
      ];
    }
  }

  if (!isSourceGroundedWebSummaryGoal(goal) && isComplexGenerationGoal(goal) && hasTool(tools, 'delegate_complex_task') && !steps.some(step => step.toolName === 'delegate_complex_task')) {
    steps = insertBeforeFinalStep(steps, createPlanStep(
      'step_delegate_complex_task',
      '委托复杂需求处理模型',
      'delegate_complex_task',
      '把完整任务、背景和输出要求交给复杂模型生成结果。',
    ));
  }

  if (!steps.some(step => !step.toolName)) {
    steps.push(createPlanStep('step_final_report', '汇总结果并回复用户'));
  }

  return steps.slice(0, 10).map((step, index) => ({
    ...step,
    id: step.id || `step_${index + 1}`,
    status: step.status || 'pending',
  }));
};

const buildPlannerPrompt = (goal: string, tools: ChatTool[], mentions: AgentMention[] = []) => {
  const toolList = tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n') || '无工具';
  const mentionContext = formatAgentMentionsForPrompt(mentions);
  return [
    '你是 Guyue Master Agent 的规划节点。你只负责制定执行计划，不要执行工具，不要回答用户。',
    '',
    '请根据用户目标和可用工具输出一个有序计划。计划必须满足：',
    '1. 每个步骤最多对应一个工具；不要把多个工具调用合并在一个步骤里。',
    '2. 如果用户问当前 App 中具体有哪些 Skills、MCP、工具、能力、插件或已配置 Server，这是本地能力查询，必须使用 query_agent_skills / query_mcp_servers / search_agent_capabilities；不要使用 web_search，也不要使用 get_current_time。',
    '3. 追问“具体有哪些/列出来/我要你具体查询有哪些”且上文涉及 Skills/MCP/工具能力时，也按本地能力查询处理。',
    '4. 用户询问 Guyue Master、本 App 或某个模块怎么用、使用指南、功能说明、配置方法或操作教程时，必须使用 query_app_usage_guide 读取本地内置文档；不要联网搜索，也不要凭记忆泛答。',
    '5. 涉及今天、明天、昨天、最新、当前、天气、新闻、日程、提醒等时效任务时，第一步必须使用 get_current_time（如果可用）；但“当前可用工具/当前 MCP/当前 Skills”不属于时效任务。',
    '6. 联网查询类任务应先 web_search，再 web_open 打开最相关来源，最后再总结。',
    '7. 创建待办事项前必须先 query_todos 获取 availableCategories；不能使用“默认/未分类/全部”。分类不明确时，后续步骤应该基于查询结果决定最合适分类，或向用户补充确认。',
    '8. 长文写作、论文、报告、复杂推理、深度分析或结构化方案生成类任务，如果有 delegate_complex_task，可以安排该工具处理核心内容；但如果任务主要是分析一个网页/URL/官方文档并输出报告，应先 web_open 获取正文并由主 Agent 直接总结，不要默认委托复杂模型。',
    '9. 使用 Playwright MCP 分析网页时，应至少安排：list_mcp_tools、call_mcp_tool/browser_navigate、call_mcp_tool/browser_evaluate 提取正文、最终汇总。不要只保存 snapshot 文件链接后就总结。',
    '10. 如果必要信息不足，安排一个不带工具的澄清步骤，不要安排写入工具。',
    '11. 如果用户输入里包含 @Skill/@MCP/@Tool/@Prompt，应把这些显式提及的能力作为优先上下文；相关工具可用时必须安排查询或加载步骤。',
    '12. 最后保留一个不带工具的汇总回复步骤。',
    '',
    '只输出 JSON，不要 Markdown，不要解释。格式：',
    '{"steps":[{"id":"step_1","title":"步骤标题","description":"做什么","toolName":"工具名或空字符串","verification":"如何判断完成","risk":"low|medium|high"}]}',
    '',
    `用户目标：${goal}`,
    mentionContext ? `\n${mentionContext}` : '',
    '',
    '可用工具：',
    toolList,
  ].join('\n');
};

const buildExecutionPlanMessage = (goal: string, plan: AgentPlanStep[]) => [
  '系统已经为本轮任务生成执行计划。后续必须按步骤执行，每轮只执行当前步骤，不要越级。',
  `原始目标：${goal}`,
  '',
  '执行计划：',
  ...plan.map((step, index) => `${index + 1}. ${step.title}${step.toolName ? `（工具：${step.toolName}）` : '（无需工具）'}${step.description ? `：${step.description}` : ''}`),
].join('\n');

const buildCurrentStepMessage = (state: NativeToolsAgentRuntimeState) => {
  const step = state.plan[state.currentStepIndex];
  if (!step) {
    return [
      '当前计划步骤：所有工具步骤已经完成。',
      '请基于已经获得的工具结果生成最终回复。不要继续调用工具。',
    ].join('\n');
  }
  const latestSearchResults = state.toolResults
    .filter(item => item.toolCall.name === 'web_search' && item.result?.success !== false)
    .slice(-1)[0];
  return [
    `当前计划步骤 ${state.currentStepIndex + 1}/${state.plan.length}：${step.title}`,
    step.description ? `步骤说明：${step.description}` : '',
    step.toolName === 'web_open' && latestSearchResults
      ? `上一步搜索结果可作为 web_open 参数来源，请优先选择最相关且可信的 URL：${compactJson(latestSearchResults.result, 2400)}`
      : '',
    step.toolName
      ? `本轮只能判断是否调用工具 ${step.toolName}；如果参数还需要依赖上一步工具结果，请先使用上下文中的工具结果来填充。不要调用其他工具，不要一次调用多个工具。`
      : '本轮不应调用工具。请进行澄清、总结或最终回复。',
    state.toolResults.length > 0
      ? `最近工具结果摘要：${compactJson(state.toolResults.slice(-3).map(item => ({ tool: item.toolCall.name, result: item.result })), 2400)}`
      : '',
  ].filter(Boolean).join('\n');
};

const filterDecisionToolCalls = (
  decision: ChatToolDecisionResult,
  allowedToolName?: string,
  allowAnyWhenNoAllowed = false,
) => {
  if (!allowedToolName && allowAnyWhenNoAllowed) {
    return {
      ...decision,
      toolCalls: decision.toolCalls.slice(0, 1),
    };
  }
  const nextToolCalls = allowedToolName
    ? decision.toolCalls.filter(toolCall => toolCall.name === allowedToolName).slice(0, 1)
    : [];
  if (nextToolCalls.length === decision.toolCalls.length) return decision;
  const allowedIds = new Set(nextToolCalls.map(toolCall => toolCall.id));
  const rawMessage = decision.rawMessage && typeof decision.rawMessage === 'object'
    ? {
        ...decision.rawMessage,
        tool_calls: Array.isArray(decision.rawMessage.tool_calls)
          ? decision.rawMessage.tool_calls.filter((toolCall: any) => allowedIds.has(toolCall.id))
          : [],
      }
    : decision.rawMessage;
  return {
    ...decision,
    toolCalls: nextToolCalls,
    rawMessage,
  };
};

const parseMaybeJsonValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^({|\[|true$|false$|null$|-?\d)/i.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
};

const parseTextToolCalls = (text: string, tools: ChatTool[]): ChatToolCall[] => {
  if (!text || !/<[^>]*invoke\s+name=/i.test(text)) return [];
  const toolNames = new Set(tools.map(tool => tool.name));
  const calls: ChatToolCall[] = [];
  const invokeRe = /<[^>]*invoke\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]*invoke>/gi;
  let invokeMatch: RegExpExecArray | null;
  while ((invokeMatch = invokeRe.exec(text))) {
    const name = invokeMatch[1]?.trim();
    if (!name || !toolNames.has(name)) continue;
    const body = invokeMatch[2] || '';
    const args: Record<string, any> = {};
    const paramRe = /<[^>]*parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/[^>]*parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRe.exec(body))) {
      const key = paramMatch[1]?.trim();
      if (!key) continue;
      args[key] = parseMaybeJsonValue(paramMatch[2] || '');
    }
    calls.push({ id: nowId(`parsed_${name}`), name, arguments: args });
    if (calls.length >= 1) break;
  }
  return calls;
};

const attachSyntheticToolCalls = (
  decision: ChatToolDecisionResult,
  parsedToolCalls: ChatToolCall[],
): ChatToolDecisionResult => {
  if (parsedToolCalls.length === 0) return decision;
  return {
    ...decision,
    toolCalls: parsedToolCalls,
    rawMessage: {
      ...(decision.rawMessage || { role: 'assistant' }),
      content: decision.rawMessage?.content || decision.text || '',
      tool_calls: parsedToolCalls.map(toolCall => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments || {}),
        },
      })),
    },
  };
};

const TOOL_CAPABILITY_DENIAL_PATTERN =
  /无法(?:直接)?(?:访问互联网|浏览网页|联网|执行真实的?联网搜索|调用工具|使用工具)|不能(?:联网|浏览网页|调用工具|使用工具)|当前模型不支持逐步\s*Function Calling|无法确定.*搜索引擎/i;

const isSearchToolName = (name?: string) =>
  name === 'web_search' || name === 'specialized_search';

const shouldSearchCapabilities = (goal: string) =>
  isLocalCapabilityInventoryGoal(goal)
    ? wantsGeneralCapabilityInventory(goal)
    : isWebInformationGoal(goal)
      ? false
      : /(工具|能力|插件|plugin|skill|mcp|可以做什么|有哪些功能|能不能)/i.test(goal);

const shouldLoadSkillContext = (goal: string) =>
  isLocalCapabilityInventoryGoal(goal)
    ? wantsSkillInventory(goal) || wantsGeneralCapabilityInventory(goal)
    : isWebInformationGoal(goal)
      ? false
      : /(?:skill|skills|技能|提示词|Prompt|prompt|工作流\s*(?:规范|模板|skill|技能)|流程\s*(?:规范|模板|skill|技能))/i.test(goal);

const shouldReadMcpContext = (goal: string) =>
  isLocalCapabilityInventoryGoal(goal)
    ? wantsMcpInventory(goal) || wantsGeneralCapabilityInventory(goal)
    : isWebInformationGoal(goal)
      ? false
      : /(mcp|外部工具|mcp\s*resource|mcp\s*资源|server|服务器)/i.test(goal);

const latestToolResult = (toolResults: ChatToolExecutionResult[], toolName: string) =>
  toolResults.filter(item => item.toolCall.name === toolName).slice(-1)[0]?.result;

const isRecoverableToolFailure = (result: any) =>
  result?.success === false && result?.fatal !== true;

const summarizeToolFailure = (result: any) =>
  result?.error || result?.message || '工具返回失败结果。';

const formatLocalCapabilityInventoryFinalText = (
  goal: string,
  toolResults: ChatToolExecutionResult[],
) => {
  if (!isLocalCapabilityInventoryGoal(goal)) return '';

  const lines: string[] = [];
  const includeSkills = wantsSkillInventory(goal) || wantsGeneralCapabilityInventory(goal);
  const includeMcp = wantsMcpInventory(goal) || wantsGeneralCapabilityInventory(goal);
  const includeCapabilities = wantsGeneralCapabilityInventory(goal);
  const skillResult = latestToolResult(toolResults, 'query_agent_skills');
  const mcpResult = latestToolResult(toolResults, 'query_mcp_servers');
  const capabilityResult = latestToolResult(toolResults, 'search_agent_capabilities');

  if (includeSkills && skillResult) {
    const skills = Array.isArray(skillResult.skills) ? skillResult.skills : [];
    lines.push('当前可用 Skills：');
    if (skills.length === 0) {
      lines.push('- 暂无可用 Skill。');
    } else {
      for (const skill of skills) {
        const meta = [
          skill.category ? `分类：${skill.category}` : '',
          skill.source ? `来源：${skill.source}` : '',
          skill.enabled === false ? '已禁用' : '已启用',
        ].filter(Boolean).join('，');
        lines.push(`- ${skill.name || skill.id}${skill.id ? `（${skill.id}）` : ''}${meta ? `：${meta}` : ''}${skill.description ? `；${skill.description}` : ''}`);
      }
    }
    lines.push('');
  }

  if (includeMcp && mcpResult) {
    const servers = Array.isArray(mcpResult.servers) ? mcpResult.servers : [];
    lines.push('当前可用 MCP Server：');
    if (servers.length === 0) {
      lines.push('- 暂无已启用 MCP Server。');
    } else {
      for (const server of servers) {
        const command = [server.command, ...(Array.isArray(server.args) ? server.args : [])].filter(Boolean).join(' ');
        const meta = [
          server.category ? `分类：${server.category}` : '',
          server.transport ? `传输：${server.transport}` : '',
          server.framing ? `协议：${server.framing}` : '',
          server.enabled === false ? '已禁用' : '已启用',
        ].filter(Boolean).join('，');
        lines.push(`- ${server.name || server.id}${server.id ? `（${server.id}）` : ''}${meta ? `：${meta}` : ''}${command ? `；命令：${command}` : ''}`);
      }
    }
    lines.push('');
  }

  if (includeCapabilities && capabilityResult) {
    const capabilities = Array.isArray(capabilityResult.capabilities) ? capabilityResult.capabilities : [];
    lines.push('相关 Agent 能力：');
    if (capabilities.length === 0) {
      lines.push('- 暂无匹配能力。');
    } else {
      for (const capability of capabilities) {
        const meta = [
          capability.origin ? `来源：${capability.origin}` : '',
          capability.type ? `类型：${capability.type}` : '',
          capability.permission?.module ? `权限：${capability.permission.module}/${capability.permission.action || 'read'}` : '',
        ].filter(Boolean).join('，');
        lines.push(`- ${capability.name || capability.id}${meta ? `：${meta}` : ''}${capability.description ? `；${capability.description}` : ''}`);
      }
    }
  }

  return lines.join('\n').trim();
};

const formatMcpToolsListFinalText = (
  goal: string,
  toolResults: ChatToolExecutionResult[],
) => {
  if (!wantsMcpToolsList(goal)) return '';
  const result = latestToolResult(toolResults, 'list_mcp_tools');
  if (!result) return '';
  if (result.success === false) {
    return `MCP 工具列表查询失败：${result.error || result.message || '未知错误'}`;
  }
  const tools = Array.isArray(result.tools) ? result.tools : [];
  const serverName = result.serverName || result.serverId || 'MCP Server';
  const lines = [`${serverName} 可用工具（${tools.length} 个）：`];
  if (tools.length === 0) {
    lines.push('- 暂无工具。');
  } else {
    for (const tool of tools) {
      lines.push(`- ${tool.name}${tool.description ? `：${tool.description}` : ''}`);
    }
  }
  return lines.join('\n');
};

const formatAppUsageGuideFinalText = (
  goal: string,
  toolResults: ChatToolExecutionResult[],
) => {
  if (!isAppUsageGuideGoal(goal)) return '';
  const result = latestToolResult(toolResults, 'query_app_usage_guide');
  if (!result) return '';
  if (result.success === false) {
    return `App 使用指南查询失败：${result.error || result.message || '未知错误'}`;
  }
  const markdown = typeof result.markdown === 'string' ? result.markdown.trim() : '';
  if (markdown) return markdown;
  const sections = Array.isArray(result.sections) ? result.sections : [];
  if (sections.length === 0) return '没有找到匹配的 App 使用指南章节。';
  return sections
    .map((section: any) => `## ${section.title || section.id}\n${section.content || ''}`.trim())
    .join('\n\n');
};

const compactPlainText = (value: unknown, maxLength = 1200) => {
  const text = typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value);
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const extractReadableFallbackBullets = (text: string, maxItems = 8) => {
  const normalized = text.replace(/\r/g, '\n');
  const lines = normalized
    .split(/\n+/)
    .map(line => line.replace(/^[\s\-*•#>]+/, '').trim())
    .filter(line => line.length >= 24 && line.length <= 220);
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(line);
    if (bullets.length >= maxItems) break;
  }
  if (bullets.length > 0) return bullets;

  return normalized
    .split(/(?<=[。.!?！？])\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 24 && item.length <= 220)
    .slice(0, maxItems);
};

const formatWebOpenFallbackFinalText = (
  goal: string,
  toolResults: ChatToolExecutionResult[],
  errorMessage?: string,
) => {
  if (!isSourceGroundedWebSummaryGoal(goal)) return '';
  const result = latestToolResult(toolResults, 'web_open');
  if (!result || result.success === false) return '';

  const title = compactPlainText(result.title || result.finalUrl || result.url || '目标网页', 180);
  const url = compactPlainText(result.finalUrl || result.url || extractFirstUrl(goal), 320);
  const description = compactPlainText(result.description || '', 700);
  const excerpt = compactPlainText(result.excerpt || result.content || result.text || result.message || '', 3000);
  const bullets = extractReadableFallbackBullets([description, excerpt].filter(Boolean).join('\n\n'));
  const lines = [
    `已成功打开目标网页，但模型汇总阶段失败${errorMessage ? `：${compactPlainText(errorMessage, 180)}` : ''}。下面先返回基于网页抽取内容的本地降级报告。`,
    '',
    `来源：${title}`,
    url ? `URL：${url}` : '',
    description ? `页面概述：${description}` : '',
    bullets.length > 0 ? `抽取要点：\n${bullets.map(item => `- ${item}`).join('\n')}` : '',
    excerpt ? `正文摘录：\n${excerpt}` : '正文摘录：页面没有提取到可读正文。',
    '',
    '说明：这是工具结果的本地降级汇总。切换到未超额的模型/API 后，可以继续生成更完整的分析报告。',
  ];
  return lines.filter(Boolean).join('\n');
};

const collectReadableStrings = (value: any, output: string[] = [], seen = new WeakSet<object>()) => {
  if (typeof value === 'string') {
    const text = compactPlainText(value, 4000);
    if (text.length >= 20 && !/^\[object Object\]$/.test(text)) output.push(text);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectReadableStrings(item, output, seen));
    return output;
  }
  for (const key of ['text', 'content', 'markdown', 'body', 'value']) {
    if (key in value) collectReadableStrings(value[key], output, seen);
  }
  return output;
};

const formatMcpPageFallbackFinalText = (
  goal: string,
  toolResults: ChatToolExecutionResult[],
  errorMessage?: string,
) => {
  const pageResult = toolResults
    .filter(item => item.toolCall.name === 'call_mcp_tool' && getMcpSubToolName(item.toolCall) === 'browser_evaluate' && item.result?.success !== false)
    .slice(-1)[0]?.result;
  if (!pageResult) return '';
  const fragments = Array.from(new Set(collectReadableStrings(pageResult.result || pageResult.raw || pageResult).map(item => compactPlainText(item, 1200))))
    .filter(item => !/^\[MaxDepth\]$/.test(item))
    .slice(0, 8);
  if (fragments.length === 0) return '';
  return [
    `已打开并读取目标页面，但最终模型汇总阶段没有返回文本${errorMessage ? `：${compactPlainText(errorMessage, 180)}` : ''}。下面先返回本地抽取结果，避免任务空失败。`,
    '',
    `用户目标：${goal}`,
    '',
    '页面抽取内容：',
    ...fragments.map(item => `- ${item}`),
  ].join('\n');
};

const buildFinalResponseMessages = (
  state: NativeToolsAgentRuntimeState,
  currentStep: AgentPlanStep | undefined,
): ChatMessage[] => {
  const toolSummary = state.toolResults.map(item => ({
    tool: item.toolCall.name,
    arguments: item.toolCall.arguments,
    result: item.result,
  }));
  return [
    {
      id: nowId('final_system'),
      role: 'system',
      timestamp: Date.now(),
      content: [
        '你是 Guyue Master 的 Agent 汇报节点。',
        '请基于已经完成的工具调用结果生成最终中文回复。',
        '不要声称没有联网、不能打开网页或不能使用工具；如果工具结果不足，说明不足在哪里，并基于已有结果给出结论。',
        '不要再调用工具，不要输出 JSON。',
      ].join('\n'),
    },
    {
      id: nowId('final_user'),
      role: 'user',
      timestamp: Date.now(),
      content: [
        `用户原始目标：${state.goal}`,
        currentStep ? `当前汇报步骤：${currentStep.title}${currentStep.description ? ` - ${currentStep.description}` : ''}` : '',
        '',
        '已执行工具结果摘要：',
        compactJson(toolSummary, 22000),
        '',
        '请给出清晰、完整、面向用户的最终回答。',
      ].filter(Boolean).join('\n'),
    },
  ];
};

export const createNativeToolsAgentRuntime = (options: NativeToolsAgentRuntimeOptions) => {
  const withTrace = (
    state: NativeToolsAgentRuntimeState,
    event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
  ) => {
    const trace = createTrace(state, event);
    options.onTrace?.(trace);
    return trace;
  };

  const buildCancellationPatch = (state: NativeToolsAgentRuntimeState): Partial<GraphState> | null => {
    if (!options.shouldCancel?.()) return null;
    const traceCancel = withTrace(state, {
      stage: 'error',
      title: 'Agent 任务已取消',
      detail: '用户请求取消当前后台任务。',
      status: 'error',
    });
    return {
      status: 'failed' as AgentRunStatus,
      error: 'Agent 任务已取消。',
      trace: [...state.trace, traceCancel],
    };
  };

  const clarificationNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const traceStart = withTrace(runtimeState, {
      stage: 'clarification',
      title: '检查任务信息是否明确',
      detail: runtimeState.goal,
      status: 'started',
      payload: {
        toolCount: runtimeState.tools.length,
      },
    });

    if (!options.clarify) {
      const traceSkipped = withTrace(runtimeState, {
        stage: 'clarification',
        title: '未配置澄清器，跳过',
        status: 'skipped',
      });
      return {
        status: 'planning' as AgentRunStatus,
        clarificationChecked: true,
        trace: [...runtimeState.trace, traceStart, traceSkipped],
      };
    }

    try {
      const clarification = await options.clarify({
        goal: runtimeState.goal,
        messages: runtimeState.messages,
        tools: runtimeState.tools,
      });
      const needsUser = clarification.status === 'needs_user';
      const message = clarification.message || clarification.questions?.join('\n') || '';
      const traceDone = withTrace(runtimeState, {
        stage: 'clarification',
        title: needsUser ? '需要用户补充信息' : '任务信息足够明确',
        detail: message || undefined,
        status: needsUser ? 'waiting' : 'success',
        payload: clarification as any,
      });

      return {
        status: needsUser ? 'needs_user' as AgentRunStatus : 'planning' as AgentRunStatus,
        clarification,
        clarificationChecked: true,
        finalText: needsUser ? (message || '需要用户补充信息后继续。') : runtimeState.finalText,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'clarification',
        title: '澄清检查失败，继续执行',
        detail: message,
        status: 'skipped',
      });
      return {
        status: 'planning' as AgentRunStatus,
        clarificationChecked: true,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const runPreflightTool = async (
    runtimeState: NativeToolsAgentRuntimeState,
    stage: AgentTraceEvent['stage'],
    title: string,
    toolName: string,
    args: Record<string, any>,
  ) => {
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const traceStart = withTrace(runtimeState, {
      stage,
      title,
      status: 'started',
      payload: { toolName, args },
    });

    if (!hasTool(runtimeState.tools, toolName)) {
      const traceSkipped = withTrace(runtimeState, {
        stage,
        title: `跳过：${toolName} 不可用`,
        status: 'skipped',
      });
      return { trace: [...runtimeState.trace, traceStart, traceSkipped] };
    }

    try {
      const toolCall: ChatToolCall = {
        id: nowId(`preflight_${toolName}`),
        name: toolName,
        arguments: args,
      };
      const rawResult = await options.executeToolCall(toolCall);
      const unwrapped = unwrapToolExecutionResult(rawResult);
      const toolResult: ChatToolExecutionResult = {
        toolCall,
        result: unwrapped.result,
      };
      const traceDone = withTrace(runtimeState, {
        stage,
        title: `${title}完成`,
        status: unwrapped.result?.success === false ? 'error' : 'success',
        payload: { toolResult },
      });
      const contextMessage: ChatMessage = {
        id: nowId(`preflight_context_${toolName}`),
        role: 'system',
        timestamp: Date.now(),
        content: [
          `预检节点 ${stage} 已调用 ${toolName}。`,
          '该结果是后续规划和执行的可用上下文：',
          compactJson(unwrapped.result, 6000),
        ].join('\n'),
      };
      return {
        messages: [...runtimeState.messages, contextMessage],
        toolResults: [...runtimeState.toolResults, toolResult],
        allToolCalls: [...runtimeState.allToolCalls, toolCall],
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const traceError = withTrace(runtimeState, {
        stage,
        title: `${title}失败，继续主流程`,
        detail: error instanceof Error ? error.message : String(error),
        status: 'skipped',
      });
      return { trace: [...runtimeState.trace, traceStart, traceError] };
    }
  };

  const runPreflightToolCalls = async (
    runtimeState: NativeToolsAgentRuntimeState,
    stage: AgentTraceEvent['stage'],
    calls: Array<{ title: string; toolName: string; args: Record<string, any> }>,
  ) => {
    let working = runtimeState;
    for (const call of calls) {
      const patch = await runPreflightTool(working, stage, call.title, call.toolName, call.args);
      working = {
        ...working,
        ...patch,
      } as NativeToolsAgentRuntimeState;
      if (working.status === 'failed') break;
    }
    return {
      ...(working.status === 'failed' ? { status: working.status } : {}),
      messages: working.messages,
      toolResults: working.toolResults,
      allToolCalls: working.allToolCalls,
      trace: working.trace,
      ...(working.error ? { error: working.error } : {}),
    };
  };

  const toolSearchNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const explicitToolMentions = explicitMentionsOf(runtimeState, 'tool');
    const explicitModuleMentions = explicitMentionsOf(runtimeState, 'module');
    const explicitPromptMentions = explicitMentionsOf(runtimeState, 'prompt');
    if (!shouldSearchCapabilities(runtimeState.goal) && explicitToolMentions.length === 0 && explicitModuleMentions.length === 0 && explicitPromptMentions.length === 0) return {};
    const query = [
      ...explicitToolMentions.map(mention => mention.value || mention.label),
      ...explicitModuleMentions.map(mention => mention.value || mention.label),
      ...explicitPromptMentions.map(mention => mention.value || mention.label),
    ].filter(Boolean).join(' ') || (
      isLocalCapabilityInventoryGoal(runtimeState.goal)
        ? 'skills mcp 工具 能力 capability'
        : runtimeState.goal
    );
    return runPreflightTool(
      runtimeState,
      'tool_search',
      '检索 Agent 能力表',
      'search_agent_capabilities',
      {
        query,
        limit: 12,
      },
    );
  };

  const loadSkillNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const explicitSkills = explicitMentionsOf(runtimeState, 'skill');
    if (!shouldLoadSkillContext(runtimeState.goal) && explicitSkills.length === 0) return {};
    if (explicitSkills.length > 0) {
      return runPreflightToolCalls(
        runtimeState,
        'load_skill',
        explicitSkills.slice(0, 4).map(mention => ({
          title: `加载 @Skill：${mention.label}`,
          toolName: hasTool(runtimeState.tools, 'load_agent_skill') ? 'load_agent_skill' : 'load_skill',
          args: { idOrName: mention.value || mention.label },
        })),
      );
    }
    return runPreflightTool(
      runtimeState,
      'load_skill',
      '查询相关 Skills',
      'query_agent_skills',
      isLocalCapabilityInventoryGoal(runtimeState.goal)
        ? { limit: 50 }
        : { query: runtimeState.goal, limit: 5 },
    );
  };

  const mcpReadResourceNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const explicitServers = explicitMentionsOf(runtimeState, 'mcp-server');
    if (!shouldReadMcpContext(runtimeState.goal) && explicitServers.length === 0) return {};
    const calls: Array<{ title: string; toolName: string; args: Record<string, any> }> = [
      {
        title: '查询 MCP Server 与资源入口',
        toolName: 'query_mcp_servers',
        args: { includeDisabled: false },
      },
    ];
    if (explicitServers.length > 0 && hasTool(runtimeState.tools, 'list_mcp_tools')) {
      calls.push(...explicitServers.slice(0, 3).map(mention => ({
        title: `列出 @MCP 工具：${mention.label}`,
        toolName: 'list_mcp_tools',
        args: { server: mention.value || mention.label },
      })));
    }
    return runPreflightToolCalls(runtimeState, 'mcp_read_resource', calls);
  };

  const planningNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const traceStart = withTrace(runtimeState, {
      stage: 'planning',
      title: '生成任务执行计划',
      detail: runtimeState.goal,
      status: 'started',
    });

    try {
      const plannerPrompt = buildPlannerPrompt(runtimeState.goal, runtimeState.tools, runtimeState.mentions);
      let rawPlan = '';
      const planningExtraTrace: AgentTraceEvent[] = [];
      if (shouldUseDeterministicPlanner(runtimeState.goal, runtimeState.tools, runtimeState.mentions)) {
        planningExtraTrace.push(withTrace(runtimeState, {
          stage: 'planning',
          title: '命中确定性计划模板',
          detail: '该任务可由本地规则稳定拆解，跳过模型规划以避免等待和误路由。',
          status: 'skipped',
        }));
      } else {
        try {
          rawPlan = await withTimeout(
            options.chatService.completeText([
              ...runtimeState.messages,
              {
                id: nowId('planner_msg'),
                role: 'user',
                content: plannerPrompt,
                timestamp: Date.now(),
              },
            ], { onDebugEvent: options.onDebugEvent }),
            AGENT_PLANNER_TIMEOUT_MS,
            '模型规划',
            () => options.chatService.abort(),
          );
        } catch (planError) {
          rawPlan = '';
          const tracePlanFallback = withTrace(runtimeState, {
            stage: 'planning',
            title: '模型规划失败，使用确定性计划',
            detail: planError instanceof Error ? planError.message : String(planError),
            status: 'skipped',
          });
          planningExtraTrace.push(tracePlanFallback);
        }
      }
      const parsedPlan = parsePlanSteps(rawPlan, runtimeState.tools, runtimeState.goal, runtimeState.mentions);
      const plan = normalizePlanSteps(runtimeState.goal, runtimeState.tools, parsedPlan, runtimeState.mentions);
      const executionMessages: ChatMessage[] = [
        ...runtimeState.messages,
        {
          id: nowId('plan_msg'),
          role: 'system',
          content: buildExecutionPlanMessage(runtimeState.goal, plan),
          timestamp: Date.now(),
        },
      ];
      const session = options.chatService.createOpenAIToolSession(
        executionMessages,
        runtimeState.maxIterations,
      );
      const traceDone = withTrace(runtimeState, {
        stage: 'planning',
        title: `执行计划已生成：${plan.length} 步`,
        detail: plan.map((step, index) => `${index + 1}. ${step.title}${step.toolName ? ` [${step.toolName}]` : ''}`).join('\n'),
        status: 'success',
        payload: {
          plan,
          rawPlan,
          toolCount: runtimeState.tools.length,
          maxIterations: runtimeState.maxIterations,
        },
      });
      return {
        status: 'executing' as AgentRunStatus,
        plan,
        currentStepIndex: 0,
        session,
        trace: [...runtimeState.trace, traceStart, ...planningExtraTrace, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '创建原生工具会话失败',
        detail: message,
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const decisionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const currentStep = runtimeState.plan[runtimeState.currentStepIndex];
    const stepLabel = currentStep
      ? `${runtimeState.currentStepIndex + 1}/${runtimeState.plan.length} ${currentStep.title}`
      : '最终回复';
    const traceStart = withTrace(runtimeState, {
      stage: 'decision',
      title: `模型决策第 ${(runtimeState.session?.iteration ?? 0) + 1} 轮：${stepLabel}`,
      status: 'started',
      payload: {
        priorToolCalls: runtimeState.allToolCalls.length,
        currentStep,
      },
    });

    if (!runtimeState.session) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少原生工具会话',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少原生工具会话。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    try {
      if (!currentStep?.toolName) {
        const deterministicText =
          formatMcpToolsListFinalText(runtimeState.goal, runtimeState.toolResults) ||
          formatLocalCapabilityInventoryFinalText(runtimeState.goal, runtimeState.toolResults) ||
          formatAppUsageGuideFinalText(runtimeState.goal, runtimeState.toolResults);
        if (deterministicText) {
          const decision: ChatToolDecisionResult = {
            text: deterministicText,
            toolCalls: [],
            rawMessage: { role: 'assistant', content: deterministicText, deterministic: true },
            session: runtimeState.session,
          };
          const traceDone = withTrace(runtimeState, {
            stage: 'decision',
            title: '本地查询结果已生成',
            detail: deterministicText,
            status: 'success',
            payload: {
              decision,
              currentStep,
            },
          });
          return {
            status: 'inspecting' as AgentRunStatus,
            decision,
            finalText: deterministicText,
            pendingToolCalls: [],
            trace: [...runtimeState.trace, traceStart, traceDone],
          };
        }
      }

      const deterministicToolCall = buildDeterministicToolCallForStep(runtimeState, currentStep);
      if (deterministicToolCall) {
        const decision: ChatToolDecisionResult = {
          text: '',
          toolCalls: [deterministicToolCall],
          rawMessage: {
            role: 'assistant',
            content: '',
            deterministic: true,
            tool_calls: [{
              id: deterministicToolCall.id,
              type: 'function',
              function: {
                name: deterministicToolCall.name,
                arguments: JSON.stringify(deterministicToolCall.arguments || {}),
              },
            }],
          },
          session: runtimeState.session,
        };
        const traceDone = withTrace(runtimeState, {
          stage: 'decision',
          title: `确定性选择工具：${deterministicToolCall.name}`,
          detail: compactJson(deterministicToolCall.arguments, 1000),
          status: 'success',
          payload: {
            decision,
            currentStep,
            deterministic: true,
          },
        });
        return {
          status: 'executing' as AgentRunStatus,
          decision,
          pendingToolCalls: [deterministicToolCall],
          trace: [...runtimeState.trace, traceStart, traceDone],
        };
      }

      const stepSession = appendUserSessionMessage(runtimeState.session, buildCurrentStepMessage(runtimeState));
      const scopedTools = currentStep?.toolName
        ? runtimeState.tools.filter(tool => tool.name === currentStep.toolName)
        : [];
      const rawDecision = await options.chatService.requestOpenAIToolDecision(
        stepSession,
        scopedTools,
        { onDebugEvent: options.onDebugEvent },
      );
      const parsedTextToolCalls = rawDecision.toolCalls.length === 0 && currentStep?.toolName
        ? parseTextToolCalls(rawDecision.text, runtimeState.tools)
        : [];
      const decisionWithParsedCalls = attachSyntheticToolCalls(rawDecision, parsedTextToolCalls);
      let decision = filterDecisionToolCalls(
        decisionWithParsedCalls,
        currentStep?.toolName,
        false,
      );
      const isFinalStep = !currentStep || runtimeState.currentStepIndex >= runtimeState.plan.length - 1;
      if (isFinalStep && decision.toolCalls.length === 0 && !decision.text.trim()) {
        let generatedText = '';
        try {
          generatedText = (await options.chatService.completeText(
            buildFinalResponseMessages(runtimeState, currentStep),
            { onDebugEvent: options.onDebugEvent },
          )).trim();
        } catch (finalError) {
          generatedText = formatWebOpenFallbackFinalText(
            runtimeState.goal,
            runtimeState.toolResults,
            finalError instanceof Error ? finalError.message : String(finalError),
          ) || formatMcpPageFallbackFinalText(
            runtimeState.goal,
            runtimeState.toolResults,
            finalError instanceof Error ? finalError.message : String(finalError),
          );
        }
        if (!generatedText) {
          generatedText = formatWebOpenFallbackFinalText(runtimeState.goal, runtimeState.toolResults) ||
            formatMcpPageFallbackFinalText(runtimeState.goal, runtimeState.toolResults);
        }
        if (generatedText) {
          decision = {
            ...decision,
            text: generatedText,
            rawMessage: {
              ...(decision.rawMessage || {}),
              role: 'assistant',
              content: generatedText,
              generatedByFinalFallback: true,
            },
          };
        }
      }

      const missedExpectedTool = Boolean(currentStep?.toolName && decision.toolCalls.length === 0);
      const traceDone = withTrace(runtimeState, {
        stage: 'decision',
        title: decision.toolCalls.length
          ? `按计划选择工具：${decision.toolCalls.map(toolCall => toolCall.name).join('、')}`
          : currentStep?.toolName
            ? `当前步骤未触发预期工具：${currentStep.toolName}`
            : '当前步骤无需工具',
        detail: decision.toolCalls.map(toolCall => toolCall.name).join('、') ||
          (missedExpectedTool ? '模型未提供该步骤所需工具参数，或上一步结果不足以构造工具调用。该步骤已标记为跳过。' : undefined),
        status: missedExpectedTool ? 'skipped' : 'success',
        payload: {
          text: decision.text,
          toolCalls: decision.toolCalls,
          rawToolCalls: rawDecision.toolCalls,
          parsedTextToolCalls,
          currentStep,
        },
      });

      if (decision.toolCalls.length === 0) {
        return {
          status: isFinalStep ? 'inspecting' as AgentRunStatus : 'executing' as AgentRunStatus,
          session: stepSession,
          decision,
          currentStepIndex: isFinalStep ? runtimeState.currentStepIndex : runtimeState.currentStepIndex + 1,
          finalText: isFinalStep ? decision.text : runtimeState.finalText,
          pendingToolCalls: [],
          trace: [...runtimeState.trace, traceStart, traceDone],
        };
      }

      return {
        status: 'executing' as AgentRunStatus,
        session: stepSession,
        decision,
        pendingToolCalls: decision.toolCalls,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '模型工具决策失败',
        detail: message,
        status: 'error',
      });
      const fallbackText = !currentStep?.toolName
        ? formatWebOpenFallbackFinalText(runtimeState.goal, runtimeState.toolResults, message)
        : '';
      if (fallbackText) {
        const decision: ChatToolDecisionResult = {
          text: fallbackText,
          toolCalls: [],
          rawMessage: { role: 'assistant', content: fallbackText, deterministic: true, fallback: 'web_open_summary' },
          session: runtimeState.session,
        };
        const traceFallback = withTrace(runtimeState, {
          stage: 'decision',
          title: '模型汇总失败，使用网页读取结果降级汇报',
          detail: fallbackText,
          status: 'success',
          payload: {
            currentStep,
            fallback: 'web_open_summary',
          },
        });
        return {
          status: 'inspecting' as AgentRunStatus,
          error: undefined,
          decision,
          finalText: fallbackText,
          pendingToolCalls: [],
          trace: [...runtimeState.trace, traceStart, traceError, traceFallback],
        };
      }
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const executionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const currentStep = runtimeState.plan[runtimeState.currentStepIndex];
    const traceStart = withTrace(runtimeState, {
      stage: 'execution',
      title: `执行 ${runtimeState.pendingToolCalls.length} 个工具调用`,
      detail: runtimeState.pendingToolCalls.map(toolCall => toolCall.name).join('、'),
      status: 'started',
      payload: { toolCalls: runtimeState.pendingToolCalls, currentStep },
    });

    if (!runtimeState.session || !runtimeState.decision) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少工具执行上下文',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少工具执行上下文。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    try {
      const hasWriteTool = runtimeState.pendingToolCalls.some(toolCall =>
        (options.getToolRisk?.(toolCall) || 'write') !== 'read',
      );
      const executeOne = async (toolCall: ChatToolCall) => {
        const rawResult = await options.executeToolCall(toolCall);
        const unwrapped = unwrapToolExecutionResult(rawResult);
        return {
          toolCall,
          result: unwrapped.result,
          pendingConfirmation: unwrapped.pendingConfirmation,
          undoSnapshot: unwrapped.undoSnapshot,
        };
      };
      const wrappedResults: Array<{
        toolCall: ChatToolCall;
        result: any;
        pendingConfirmation: any;
        undoSnapshot: any;
      }> = [];
      if (hasWriteTool) {
        for (const toolCall of runtimeState.pendingToolCalls) {
          const result = await executeOne(toolCall);
          wrappedResults.push(result);
          if (result.pendingConfirmation) break;
        }
      } else {
        wrappedResults.push(...await Promise.all(runtimeState.pendingToolCalls.map(executeOne)));
      }
      const toolResults: ChatToolExecutionResult[] = wrappedResults.map(item => ({
        toolCall: item.toolCall,
        result: item.result,
      }));
      const pendingConfirmations = wrappedResults
        .map(item => item.pendingConfirmation)
        .filter(Boolean);
      const undoSnapshots = wrappedResults
        .map(item => item.undoSnapshot)
        .filter(Boolean);
      const nextSession = options.chatService.appendOpenAIToolResults(
        runtimeState.session,
        runtimeState.decision,
        toolResults,
      );
      const failedToolResults = toolResults.filter(item => item.result?.success === false);
      const fatalToolResults = failedToolResults.filter(item => item.result?.fatal === true);
      const traceDone = withTrace(runtimeState, {
        stage: 'execution',
        title: fatalToolResults.length > 0
          ? '工具执行失败'
          : failedToolResults.length > 0
            ? '工具返回可恢复失败'
            : '工具执行完成',
        detail: failedToolResults.map(item => `${item.toolCall.name}: ${summarizeToolFailure(item.result)}`).join('\n') || undefined,
        status: failedToolResults.length > 0 ? 'error' : 'success',
        payload: {
          executionMode: hasWriteTool ? 'sequential' : 'parallel',
          toolResults,
          currentStep,
          pendingConfirmationCount: pendingConfirmations.length,
          undoSnapshotCount: undoSnapshots.length,
        },
      });

      return {
        status: pendingConfirmations.length > 0 ? 'needs_user' as AgentRunStatus : 'verifying' as AgentRunStatus,
        session: nextSession,
        pendingToolCalls: [],
        toolResults: [...runtimeState.toolResults, ...toolResults],
        allToolCalls: nextSession.allToolCalls,
        pendingConfirmations: [...runtimeState.pendingConfirmations, ...pendingConfirmations],
        undoSnapshots: [...runtimeState.undoSnapshots, ...undoSnapshots],
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '工具执行失败',
        detail: message,
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const verificationNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const currentStep = runtimeState.plan[runtimeState.currentStepIndex];
    const latestDecision = runtimeState.decision;
    const latestToolCount = latestDecision?.toolCalls.length || 0;
    const latestResults = runtimeState.toolResults.slice(-latestToolCount);
    const traceStart = withTrace(runtimeState, {
      stage: 'verification',
      title: '检查工具执行结果',
      status: 'started',
      payload: { latestToolCount, latestResults, currentStep },
    });

    if (!latestDecision || latestToolCount === 0) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少待检查工具调用',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少待检查工具调用。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const missing = latestDecision.toolCalls.find(toolCall =>
      !latestResults.some(result => result.toolCall.id === toolCall.id),
    );
    if (missing) {
      const traceError = withTrace(runtimeState, {
        stage: 'verification',
        title: `工具结果缺失：${missing.name}`,
        status: 'error',
        payload: { missing },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: `工具结果缺失：${missing.name}`,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const failedResult = latestResults.find(item => item.result?.success === false && item.result?.fatal === true);
    if (failedResult) {
      const traceError = withTrace(runtimeState, {
        stage: 'verification',
        title: `工具结果不可恢复：${failedResult.toolCall.name}`,
        detail: failedResult.result?.error,
        status: 'error',
        payload: failedResult,
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: failedResult.result?.error || `工具 ${failedResult.toolCall.name} 执行失败。`,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const recoverableFailures = latestResults.filter(item => isRecoverableToolFailure(item.result));
    const stepTraceStatus: AgentTraceEvent['status'] = recoverableFailures.length > 0 ? 'skipped' : 'success';
    const traceDone = withTrace(runtimeState, {
      stage: 'verification',
      title: recoverableFailures.length > 0
        ? '当前步骤工具失败，已作为可恢复结果回填'
        : '当前步骤工具结果已回填给模型',
      detail: recoverableFailures.length > 0
        ? recoverableFailures.map(item => `${item.toolCall.name}: ${summarizeToolFailure(item.result)}`).join('\n')
        : '推进到下一计划步骤，模型会基于已获得结果继续执行。',
      status: stepTraceStatus,
      payload: {
        currentStep,
        ...(recoverableFailures.length > 0 ? { failedResults: recoverableFailures } : { completedStep: currentStep }),
        nextStepIndex: runtimeState.currentStepIndex + 1,
      },
    });

    const mergedResults = [
      ...runtimeState.toolResults,
      ...latestResults,
    ];
    const deterministicFinalText =
      formatMcpToolsListFinalText(runtimeState.goal, mergedResults) ||
      formatAppUsageGuideFinalText(runtimeState.goal, mergedResults);
    if (deterministicFinalText) {
      const traceFinal = withTrace(runtimeState, {
        stage: 'verification',
        title: '已生成本地查询结果',
        detail: deterministicFinalText,
        status: 'success',
      });
      return {
        status: 'inspecting' as AgentRunStatus,
        finalText: deterministicFinalText,
        currentStepIndex: runtimeState.plan.length,
        trace: [...runtimeState.trace, traceStart, traceDone, traceFinal],
      };
    }

    return {
      status: 'executing' as AgentRunStatus,
      currentStepIndex: runtimeState.currentStepIndex + 1,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const inspectionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const cancellation = buildCancellationPatch(runtimeState);
    if (cancellation) return cancellation;
    const failedResults = runtimeState.toolResults.filter(item => item.result?.success === false);
    const successfulResults = runtimeState.toolResults.filter(item => item.result?.success !== false);
    const traceStart = withTrace(runtimeState, {
      stage: 'inspection',
      title: '检查最终完成度',
      status: 'started',
      payload: {
        finalText: runtimeState.finalText,
        toolCalls: runtimeState.allToolCalls,
        failedResults,
      },
    });

    if (runtimeState.pendingToolCalls.length > 0) {
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '仍有未执行工具调用',
        status: 'error',
        payload: { pendingToolCalls: runtimeState.pendingToolCalls },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: 'Agent 结束前仍有未执行工具调用。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    if (failedResults.length > 0 && successfulResults.length === 0) {
      const firstError = failedResults[0]?.result?.error || '工具调用失败，且没有成功结果。';
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '工具调用未真正完成',
        detail: firstError,
        status: 'error',
        payload: { failedResults },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: firstError,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    if (!runtimeState.finalText.trim()) {
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '缺少最终回复',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '模型没有生成最终回复。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const successfulSearchResults = runtimeState.toolResults.filter(item =>
      isSearchToolName(item.toolCall?.name) && item.result?.success !== false,
    );
    if (
      successfulSearchResults.length > 0 &&
      TOOL_CAPABILITY_DENIAL_PATTERN.test(runtimeState.finalText) &&
      runtimeState.correctionCount < 1
    ) {
      const traceCorrection = withTrace(runtimeState, {
        stage: 'inspection',
        title: '拦截了错误的工具能力声明',
        detail: '联网搜索工具已经成功执行，但最终回复仍声称无法联网或无法调用工具。系统将让模型基于工具结果重新回答。',
        status: 'error',
        payload: {
          finalText: runtimeState.finalText,
          searchResults: successfulSearchResults,
        },
      });
      return {
        status: 'executing' as AgentRunStatus,
        finalText: '',
        error: undefined,
        correctionCount: runtimeState.correctionCount + 1,
        session: appendRuntimeSystemMessage(
          runtimeState.session,
          [
            '系统检查：上一轮已经成功执行联网搜索工具，工具结果已经在上下文中。',
            '请直接基于这些工具结果回答原始问题；不要声称无法联网、无法访问网页、无法调用工具或当前模型不支持 Function Calling。',
            '如果工具结果质量不足，请说明已获得的结果有什么不足，而不是否认工具能力。',
          ].join('\n'),
        ),
        trace: [...runtimeState.trace, traceStart, traceCorrection],
      };
    }

    if (isStrictReadOnlyGoal(runtimeState.goal) && failedResults.length === 0 && successfulResults.length > 0) {
      const traceReadonlyPass = withTrace(runtimeState, {
        stage: 'inspection',
        title: '只读任务确定性复核通过',
        detail: '本轮是只读查询，工具均执行成功且已生成最终回复，跳过额外模型复核。',
        status: 'success',
        payload: {
          successfulToolCount: successfulResults.length,
        },
      });
      return {
        status: 'reporting' as AgentRunStatus,
        trace: [...runtimeState.trace, traceStart, traceReadonlyPass],
      };
    }

    if (options.evaluateCompletion) {
      try {
        const evaluation = await options.evaluateCompletion({
          goal: runtimeState.goal,
          finalText: runtimeState.finalText,
          toolCalls: runtimeState.allToolCalls,
          toolResults: runtimeState.toolResults,
        });
        const passed = evaluation.status === 'success';
        const traceEvaluation = withTrace(runtimeState, {
          stage: 'inspection',
          title: passed ? '模型复核通过' : '模型复核未通过',
          detail: evaluation.message,
          status: passed ? 'success' : evaluation.status === 'needs_user' ? 'waiting' : 'error',
          payload: evaluation as any,
        });
        if (!passed) {
          const correctiveToolCall = evaluation.retryable && runtimeState.correctionCount < 1
            ? buildMcpPageTextToolCall(runtimeState)
            : null;
          if (correctiveToolCall) {
            const correctiveDecision: ChatToolDecisionResult = {
              text: '',
              toolCalls: [correctiveToolCall],
              rawMessage: {
                role: 'assistant',
                content: '',
                deterministic: true,
                correction: 'mcp_page_text_extract',
                tool_calls: [{
                  id: correctiveToolCall.id,
                  type: 'function',
                  function: {
                    name: correctiveToolCall.name,
                    arguments: JSON.stringify(correctiveToolCall.arguments || {}),
                  },
                }],
              },
              session: runtimeState.session!,
            };
            const traceCorrection = withTrace(runtimeState, {
              stage: 'reflection',
              title: '复核未通过，补充提取页面正文',
              detail: evaluation.message,
              status: 'started',
              payload: {
                evaluation,
                toolCall: correctiveToolCall,
              },
            });
            return {
              status: 'executing' as AgentRunStatus,
              error: undefined,
              finalText: '',
              decision: correctiveDecision,
              pendingToolCalls: [correctiveToolCall],
              correctionCount: runtimeState.correctionCount + 1,
              trace: [...runtimeState.trace, traceStart, traceEvaluation, traceCorrection],
            };
          }
          return {
            status: evaluation.status === 'needs_user' ? 'needs_user' as AgentRunStatus : 'failed' as AgentRunStatus,
            error: evaluation.status === 'failed' ? evaluation.message : runtimeState.error,
            trace: [...runtimeState.trace, traceStart, traceEvaluation],
          };
        }
        return {
          status: 'reporting' as AgentRunStatus,
          trace: [...runtimeState.trace, traceStart, traceEvaluation],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const traceEvaluationError = withTrace(runtimeState, {
          stage: 'inspection',
          title: '模型复核不可用，使用确定性检查结果',
          detail: message,
          status: 'skipped',
        });
        return {
          status: 'reporting' as AgentRunStatus,
          trace: [...runtimeState.trace, traceStart, traceEvaluationError],
        };
      }
    }

    const traceDone = withTrace(runtimeState, {
      stage: 'inspection',
      title: failedResults.length > 0 ? '完成度检查通过，但存在部分工具失败' : '完成度检查通过',
      detail: failedResults.length > 0 ? `有 ${failedResults.length} 次工具调用失败，模型已基于结果继续处理。` : undefined,
      status: 'success',
      payload: { failedCount: failedResults.length },
    });

    return {
      status: 'reporting' as AgentRunStatus,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const reportingNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const finalStatus: AgentRunStatus = runtimeState.status === 'needs_user'
      ? 'needs_user'
      : runtimeState.error ? 'failed' : 'completed';
    const text = runtimeState.error
      ? `执行失败：${runtimeState.error}`
      : finalStatus === 'needs_user'
        ? runtimeState.finalText || runtimeState.clarification?.message || '需要用户补充信息或确认后继续。'
      : runtimeState.finalText;
    const traceDone = withTrace(runtimeState, {
      stage: 'reporting',
      title: finalStatus === 'completed' ? '生成最终回复' : '生成失败汇报',
      status: finalStatus === 'completed' ? 'success' : 'error',
      payload: {
        text,
        toolCalls: runtimeState.allToolCalls,
      },
    });

    return {
      status: finalStatus,
      finalText: text,
      trace: [...runtimeState.trace, traceDone],
    };
  };

  const mergeState = (
    state: GraphState,
    patch: Partial<GraphState>,
  ): GraphState => ({
    ...state,
    ...patch,
  });

  const routeAfterClarification = (state: GraphState) =>
    state.status === 'needs_user' || state.status === 'failed' ? 'reporting' : 'tool_search';

  const routeAfterPlanning = (state: GraphState) =>
    state.status === 'failed' ? 'reporting' : 'tool_decision';

  const routeAfterDecision = (state: GraphState) => {
    if (state.status === 'failed') return 'reporting';
    if (state.status === 'inspecting') return 'inspection';
    if (state.status === 'executing' && state.pendingToolCalls.length === 0 && state.currentStepIndex < state.plan.length) {
      return 'tool_decision';
    }
    return state.pendingToolCalls.length > 0 ? 'execution' : 'reporting';
  };

  const routeAfterExecution = (state: GraphState) =>
    state.status === 'failed' || state.status === 'needs_user' ? 'reporting' : 'verification';

  const routeAfterVerification = (state: GraphState) =>
    state.status === 'failed'
      ? 'reporting'
      : state.status === 'inspecting'
        ? 'inspection'
        : 'tool_decision';

  const routeAfterInspection = (state: GraphState) =>
    state.status === 'executing'
      ? 'tool_decision'
      : 'reporting';

  const runtimeGraph = new StateGraph(NativeToolsAgentRuntimeAnnotation)
    .addNode('clarification_check', clarificationNode)
    .addNode('tool_search', toolSearchNode)
    .addNode('load_skill', loadSkillNode)
    .addNode('mcp_read_resource', mcpReadResourceNode)
    .addNode('planning', planningNode)
    .addNode('tool_decision', decisionNode)
    .addNode('execution', executionNode)
    .addNode('verification', verificationNode)
    .addNode('inspection', inspectionNode)
    .addNode('reporting', reportingNode)
    .addEdge(START, 'clarification_check')
    .addConditionalEdges('clarification_check', routeAfterClarification)
    .addEdge('tool_search', 'load_skill')
    .addEdge('load_skill', 'mcp_read_resource')
    .addEdge('mcp_read_resource', 'planning')
    .addConditionalEdges('planning', routeAfterPlanning)
    .addConditionalEdges('tool_decision', routeAfterDecision)
    .addConditionalEdges('execution', routeAfterExecution)
    .addConditionalEdges('verification', routeAfterVerification)
    .addConditionalEdges('inspection', routeAfterInspection)
    .addEdge('reporting', END)
    .compile({ name: 'guyue-agent-runtime' });

  return {
    async run(): Promise<NativeToolsAgentRuntimeResult> {
      let state = createInitialState(options);
      const recursionLimit = Math.max(25, (options.maxIterations ?? 10) * 4 + 10);

      try {
        state = await runtimeGraph.invoke(state, { recursionLimit });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = error instanceof GraphRecursionError
          ? 'Agent 原生工具循环超过最大步数。'
          : rawMessage;
        const traceError = withTrace(state, {
          stage: 'error',
          title: 'Agent 原生工具运行失败',
          detail: rawMessage,
          status: 'error',
        });
        const failedState = mergeState(state, {
          status: 'failed',
          error: message,
          trace: [...state.trace, traceError],
        });

        try {
          state = mergeState(failedState, await reportingNode(failedState));
        } catch (reportError) {
          const reportMessage = reportError instanceof Error ? reportError.message : String(reportError);
          const traceReportError = withTrace(failedState, {
            stage: 'error',
            title: '生成最终回复失败',
            detail: reportMessage,
            status: 'error',
          });
          state = mergeState(failedState, {
            finalText: `执行失败：${reportMessage}`,
            trace: [...failedState.trace, traceReportError],
          });
        }
      }

      return {
        runId: state.runId,
        status: state.status,
        text: state.finalText,
        toolCalls: state.allToolCalls,
        toolResults: state.toolResults,
        trace: state.trace,
        clarification: state.clarification,
        error: state.error,
        pendingConfirmations: state.pendingConfirmations,
        undoSnapshots: state.undoSnapshots,
      };
    },
  };
};

export const createAgentRuntime = createNativeToolsAgentRuntime;
export type AgentRuntimeOptions = NativeToolsAgentRuntimeOptions;
export type FunctionCallingAgentRuntimeResult = NativeToolsAgentRuntimeResult;
