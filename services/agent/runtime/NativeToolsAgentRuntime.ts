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

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
}

export interface NativeToolsAgentRuntimeOptions {
  chatService: ChatService;
  messages: ChatMessage[];
  tools: ChatTool[];
  goal: string;
  runId?: string;
  maxIterations?: number;
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

const createInitialState = (options: NativeToolsAgentRuntimeOptions): GraphState => ({
  runId: options.runId || nowId('run'),
  goal: options.goal,
  status: 'idle',
  messages: options.messages,
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
});

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

const extractFirstUrl = (text: string) =>
  text.match(/https?:\/\/[^\s)）\]}>"'，。；;]+/i)?.[0] || '';

const firstSearchResultUrl = (toolResults: ChatToolExecutionResult[]) => {
  const result = latestToolResult(toolResults, 'web_search');
  const results = Array.isArray(result?.results) ? result.results : [];
  const first = results.find((item: any) => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url));
  return first?.url || '';
};

const latestCurrentTimeResult = (toolResults: ChatToolExecutionResult[]) =>
  latestToolResult(toolResults, 'get_current_time');

const resolveMcpServerForGoal = (goal: string, toolResults: ChatToolExecutionResult[]) => {
  const result = latestToolResult(toolResults, 'query_mcp_servers');
  const servers = Array.isArray(result?.servers) ? result.servers : [];
  if (servers.length === 0) return '';
  const lowerGoal = goal.toLowerCase();
  const matched = servers.find((server: any) => {
    const id = String(server?.id || '').toLowerCase();
    const name = String(server?.name || '').toLowerCase();
    return (id && lowerGoal.includes(id)) || (name && lowerGoal.includes(name));
  });
  return String((matched || servers[0])?.id || (matched || servers[0])?.name || '');
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
    case 'get_current_time':
      return make({ locale: 'zh-CN', timeZone: 'Asia/Shanghai' });
    case 'query_agent_skills':
      return make(isLocalCapabilityInventoryGoal(state.goal) ? { limit: 50 } : { query: state.goal, limit: 8 });
    case 'query_mcp_servers':
      return make({ includeDisabled: false });
    case 'search_agent_capabilities':
    case 'tool_search':
      return make({
        query: isLocalCapabilityInventoryGoal(state.goal) ? 'skills mcp 工具 能力 capability' : state.goal,
        limit: 12,
      });
    case 'web_search': {
      const timeInfo = latestCurrentTimeResult(state.toolResults);
      const dateHint = timeInfo?.dateISO || timeInfo?.todayISO || '';
      return make({
        query: dateHint && isTimeSensitiveGoal(state.goal) ? `${state.goal} ${dateHint}` : state.goal,
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
      const server = resolveMcpServerForGoal(state.goal, state.toolResults);
      return server ? make({ server }) : null;
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

const wantsMcpToolsList = (goal: string) =>
  /(list_mcp_tools|MCP\s*Server.*工具|MCP.*工具列表|Playwright\s*MCP.*工具|工具名称逐项|列出.*MCP.*tools?|列出.*MCP.*工具)/i.test(goal);

const shouldUseCurrentTime = (goal: string) =>
  isTimeSensitiveGoal(goal) && !isLocalCapabilityInventoryGoal(goal);

const isWebInformationGoal = (goal: string) => {
  if (isLocalCapabilityInventoryGoal(goal)) return false;
  if (/(联网|搜索|网页|官网|新闻|最新|实时|天气|价格|股价|汇率|版本|GitHub|github|npm|StackOverflow|stackoverflow|arXiv|论文|博客|报道|公告)/i.test(goal)) {
    return true;
  }
  return /(查一下|查询|检索)/i.test(goal) &&
    /(网上|互联网|外网|新闻|天气|价格|股价|汇率|官网|资料|Google|谷歌|Bing|百度|DuckDuckGo|GitHub|github|npm|StackOverflow|stackoverflow|arXiv|论文|博客|报道|公告|最新|实时)/i.test(goal);
};

const isTodoCreateGoal = (goal: string) =>
  /(新建|新增|添加|创建|加一个|安排|提醒|记录)/.test(goal) &&
  /(待办|事项|任务|提醒|日程|安排|开会|会议|约|预约|todo)/i.test(goal);

const isComplexGenerationGoal = (goal: string) =>
  /(论文|长文|报告|方案|综述|研究|深度分析|复杂推理|完整文档|一千字|千字|1000字|2000字|3000字|不少于|详细论述|系统分析|结构化方案)/i.test(goal);

const isSourceGroundedWebSummaryGoal = (goal: string) =>
  isWebInformationGoal(goal) &&
  /(https?:\/\/|网页|页面|链接|网址|URL|文档|instructions?|官网)/i.test(goal) &&
  !/(论文|长文|一千字|千字|1000字|2000字|3000字|不少于)/i.test(goal);

const hasExplicitUrl = (goal: string) => /https?:\/\//i.test(goal);

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

const buildFallbackPlan = (goal: string, tools: ChatTool[]): AgentPlanStep[] => {
  const steps: AgentPlanStep[] = [];

  if (shouldUseCurrentTime(goal) && hasTool(tools, 'get_current_time')) {
    steps.push(createPlanStep('step_1_time', '获取当前电脑时间', 'get_current_time', '先确认本地实时日期和时区，避免相对日期出错。'));
  }

  if (isLocalCapabilityInventoryGoal(goal)) {
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
  } else if (isWebInformationGoal(goal) && hasTool(tools, 'web_search')) {
    steps.push(createPlanStep('step_2_search', isWeatherGoal(goal) ? '搜索实时天气信息' : '搜索联网信息', 'web_search', '带上当前日期、关键词和限定条件检索。'));
    if (hasTool(tools, 'web_open')) {
      steps.push(createPlanStep('step_3_open', '打开最相关来源', 'web_open', '读取搜索结果页正文，确认摘要之外的具体信息。'));
    }
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

const parsePlanSteps = (text: string, tools: ChatTool[], goal: string): AgentPlanStep[] => {
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
    return steps.length > 0 ? steps.slice(0, 8) : buildFallbackPlan(goal, tools);
  } catch {
    return buildFallbackPlan(goal, tools);
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

const normalizePlanSteps = (goal: string, tools: ChatTool[], rawSteps: AgentPlanStep[]) => {
  let steps = rawSteps.filter(step => step.title.trim()).slice(0, 8);

  if (wantsMcpToolsList(goal) && hasTool(tools, 'list_mcp_tools')) {
    const listStep = steps.find(step => step.toolName === 'list_mcp_tools') ||
      createPlanStep('step_list_mcp_tools', '列出 MCP Server 工具', 'list_mcp_tools', '查询目标 MCP Server 暴露的工具列表。');
    return [
      { ...listStep, id: listStep.id || 'step_list_mcp_tools', status: listStep.status || 'pending' },
      createPlanStep('step_final_report', '汇总工具名称并回复用户'),
    ];
  }

  if (isLocalCapabilityInventoryGoal(goal)) {
    steps = steps.filter(step =>
      !['get_current_time', 'web_search', 'web_open', 'specialized_search'].includes(step.toolName || ''),
    );
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

  if (isWebInformationGoal(goal) && hasTool(tools, 'web_search') && !steps.some(step => step.toolName === 'web_search')) {
    steps = insertBeforeFinalStep(steps, createPlanStep('step_web_search', isWeatherGoal(goal) ? '搜索实时天气信息' : '搜索联网信息', 'web_search', '带上当前日期、关键词和限定条件检索。'));
  }

  if (isWebInformationGoal(goal) && hasTool(tools, 'web_open') && steps.some(step => step.toolName === 'web_search') && !steps.some(step => step.toolName === 'web_open')) {
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

  if (isSourceGroundedWebSummaryGoal(goal)) {
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

const buildPlannerPrompt = (goal: string, tools: ChatTool[]) => {
  const toolList = tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n') || '无工具';
  return [
    '你是 Guyue Master Agent 的规划节点。你只负责制定执行计划，不要执行工具，不要回答用户。',
    '',
    '请根据用户目标和可用工具输出一个有序计划。计划必须满足：',
    '1. 每个步骤最多对应一个工具；不要把多个工具调用合并在一个步骤里。',
    '2. 如果用户问当前 App 中具体有哪些 Skills、MCP、工具、能力、插件或已配置 Server，这是本地能力查询，必须使用 query_agent_skills / query_mcp_servers / search_agent_capabilities；不要使用 web_search，也不要使用 get_current_time。',
    '3. 追问“具体有哪些/列出来/我要你具体查询有哪些”且上文涉及 Skills/MCP/工具能力时，也按本地能力查询处理。',
    '4. 涉及今天、明天、昨天、最新、当前、天气、新闻、日程、提醒等时效任务时，第一步必须使用 get_current_time（如果可用）；但“当前可用工具/当前 MCP/当前 Skills”不属于时效任务。',
    '5. 联网查询类任务应先 web_search，再 web_open 打开最相关来源，最后再总结。',
    '6. 创建待办事项前必须先 query_todos 获取 availableCategories；不能使用“默认/未分类/全部”。分类不明确时，后续步骤应该基于查询结果决定最合适分类，或向用户补充确认。',
    '7. 长文写作、论文、报告、复杂推理、深度分析或结构化方案生成类任务，如果有 delegate_complex_task，可以安排该工具处理核心内容；但如果任务主要是分析一个网页/URL/官方文档并输出报告，应先 web_open 获取正文并由主 Agent 直接总结，不要默认委托复杂模型。',
    '8. 如果必要信息不足，安排一个不带工具的澄清步骤，不要安排写入工具。',
    '9. 最后保留一个不带工具的汇总回复步骤。',
    '',
    '只输出 JSON，不要 Markdown，不要解释。格式：',
    '{"steps":[{"id":"step_1","title":"步骤标题","description":"做什么","toolName":"工具名或空字符串","verification":"如何判断完成","risk":"low|medium|high"}]}',
    '',
    `用户目标：${goal}`,
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
) => {
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
      : /(skill|技能|提示词|工作流|规范|方法|流程)/i.test(goal);

const shouldReadMcpContext = (goal: string) =>
  isLocalCapabilityInventoryGoal(goal)
    ? wantsMcpInventory(goal) || wantsGeneralCapabilityInventory(goal)
    : isWebInformationGoal(goal)
      ? false
      : /(mcp|resource|资源|外部工具|server)/i.test(goal);

const latestToolResult = (toolResults: ChatToolExecutionResult[], toolName: string) =>
  toolResults.filter(item => item.toolCall.name === toolName).slice(-1)[0]?.result;

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

  const toolSearchNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    if (!shouldSearchCapabilities(runtimeState.goal)) return {};
    return runPreflightTool(
      runtimeState,
      'tool_search',
      '检索 Agent 能力表',
      'search_agent_capabilities',
      {
        query: isLocalCapabilityInventoryGoal(runtimeState.goal)
          ? 'skills mcp 工具 能力 capability'
          : runtimeState.goal,
        limit: 12,
      },
    );
  };

  const loadSkillNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    if (!shouldLoadSkillContext(runtimeState.goal)) return {};
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
    if (!shouldReadMcpContext(runtimeState.goal)) return {};
    return runPreflightTool(
      runtimeState,
      'mcp_read_resource',
      '查询 MCP Server 与资源入口',
      'query_mcp_servers',
      { includeDisabled: false },
    );
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
      const plannerPrompt = buildPlannerPrompt(runtimeState.goal, runtimeState.tools);
      let rawPlan = '';
      const planningExtraTrace: AgentTraceEvent[] = [];
      try {
        rawPlan = await options.chatService.completeText([
          ...runtimeState.messages,
          {
            id: nowId('planner_msg'),
            role: 'user',
            content: plannerPrompt,
            timestamp: Date.now(),
          },
        ], { onDebugEvent: options.onDebugEvent });
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
      const parsedPlan = parsePlanSteps(rawPlan, runtimeState.tools, runtimeState.goal);
      const plan = normalizePlanSteps(runtimeState.goal, runtimeState.tools, parsedPlan);
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
          formatLocalCapabilityInventoryFinalText(runtimeState.goal, runtimeState.toolResults);
        if (deterministicText) {
          const decision: ChatToolDecisionResult = {
            text: deterministicText,
            toolCalls: [],
            rawMessage: { role: 'assistant', content: deterministicText, deterministic: true },
            session: runtimeState.session,
          };
          const traceDone = withTrace(runtimeState, {
            stage: 'decision',
            title: '本地能力清单已生成',
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
      const decision = filterDecisionToolCalls(rawDecision, currentStep?.toolName);

      const traceDone = withTrace(runtimeState, {
        stage: 'decision',
        title: decision.toolCalls.length
          ? `按计划选择工具：${decision.toolCalls.map(toolCall => toolCall.name).join('、')}`
          : currentStep?.toolName
            ? `当前步骤未触发预期工具：${currentStep.toolName}`
            : '当前步骤无需工具',
        detail: decision.toolCalls.map(toolCall => toolCall.name).join('、') || undefined,
        status: 'success',
        payload: {
          text: decision.text,
          toolCalls: decision.toolCalls,
          rawToolCalls: rawDecision.toolCalls,
          currentStep,
        },
      });

      if (decision.toolCalls.length === 0) {
        const isFinalStep = !currentStep || runtimeState.currentStepIndex >= runtimeState.plan.length - 1;
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
      const traceDone = withTrace(runtimeState, {
        stage: 'execution',
        title: '工具执行完成',
        status: 'success',
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

    const traceDone = withTrace(runtimeState, {
      stage: 'verification',
      title: '当前步骤工具结果已回填给模型',
      detail: '推进到下一计划步骤，模型会基于已获得结果继续执行。',
      status: 'success',
        payload: {
        completedStep: currentStep,
        nextStepIndex: runtimeState.currentStepIndex + 1,
      },
    });

    const deterministicFinalText = formatMcpToolsListFinalText(runtimeState.goal, [
      ...runtimeState.toolResults,
      ...latestResults,
    ]);
    if (deterministicFinalText) {
      const traceFinal = withTrace(runtimeState, {
        stage: 'verification',
        title: '已生成 MCP 工具列表',
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
