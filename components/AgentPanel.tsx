import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertCircle, ListTodo, Settings2, StickyNote, FolderOpen, Command, Globe, Code2, GraduationCap, Image, MessageSquare, Pencil, BarChart3, HelpCircle, ChevronDown, ChevronUp, Bug, Trash2 } from 'lucide-react';
import type { TodoItem } from '../types';
import {
  ChatConfig,
  ChatService,
  AVAILABLE_MODELS,
  DEFAULT_CHAT_CONFIG,
  ChatMessage,
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
  { id: 'todo', name: '待办事项', icon: ListTodo, enabled: true, description: '创建、管理待办事项' },
  { id: 'notes', name: '笔记备忘', icon: StickyNote, enabled: false, description: '创建、搜索笔记' },
  { id: 'files', name: '文件管理', icon: FolderOpen, enabled: false, description: '文件操作' },
  { id: 'prompts', name: 'Skills', icon: Sparkles, enabled: false, description: '管理 Prompt' },
  { id: 'terminal', name: '终端', icon: Command, enabled: false, description: '执行命令' },
  { id: 'browser', name: '浏览器', icon: Globe, enabled: false, description: '网页浏览' },
  { id: 'leetcode', name: 'Code', icon: Code2, enabled: false, description: 'LeetCode 刷题' },
  { id: 'learning', name: '学习', icon: GraduationCap, enabled: false, description: '学习管理' },
  { id: 'image', name: '图床', icon: Image, enabled: false, description: '图片管理' },
  { id: 'chat', name: 'AI Chat', icon: MessageSquare, enabled: false, description: 'AI 对话' },
  { id: 'excalidraw', name: '绘图', icon: Pencil, enabled: false, description: '绘图板' },
  { id: 'datacenter', name: '数据中心', icon: BarChart3, enabled: false, description: '数据管理' },
];

const ENABLED_AGENT_MODULES = AGENT_MODULES.filter(module => module.enabled);
const isNativeProvider = (provider: ChatConfig['provider']) => ['openai', 'anthropic', 'gemini'].includes(provider);
const getModuleById = (moduleId?: string | null) => AGENT_MODULES.find(module => module.id === moduleId) || null;

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  action?: AgentAction;
  targetModule?: string; // 目标模块
}

interface AgentAction {
  type: 'create_todo';
  status: 'pending' | 'success' | 'error';
  data?: Partial<TodoItem>;
  error?: string;
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTodo: (todoData: Partial<TodoItem>) => void;
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

/* ─── Agent 配置存储 ─── */

const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';

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
    return msgs.slice(-30); // 只保留最近30条
  } catch {
    return [];
  }
};

const saveAgentHistory = (messages: AgentMessage[]): void => {
  const trimmed = messages.slice(-30);
  localStorage.setItem(STORAGE_KEY_AGENT_HISTORY, JSON.stringify(trimmed));
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
    return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。${moduleInfo}

## 当前能力
- 当前提供给你的工具只代表本轮任务允许调用的应用能力。
- 目前已实现的是待办事项创建工具。

## 工具调用规则
1. 当用户明确要执行应用操作时，优先调用已提供的工具。
2. 如果没有合适工具，直接自然语言回复即可。
3. 不要输出 Markdown action 代码块，也不要伪造工具调用结果。
4. 回复保持简洁、确认式、面向执行。

## 时间处理
- 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 今天: ${new Date().toLocaleDateString('zh-CN')}
- 明天: ${new Date(Date.now() + 86400000).toLocaleDateString('zh-CN')}
- 后天: ${new Date(Date.now() + 172800000).toLocaleDateString('zh-CN')}${customPromptSection}`;
  }

  return `你是「Guyue-Master-Agent」，Guyue Master 应用的内置智能 Agent。${moduleInfo}

## 你的能力
你目前只有一个能力：帮用户创建待办事项(Todo)。

## 如何创建待办事项
当用户想要创建待办事项时，你需要从对话中提取以下信息并以 JSON 格式输出：
- content: 事项内容（必填）
- description: 详细描述（可选）
- priority: 优先级，可选值为 "high"、"medium"、"low"（默认 "medium"）
- category: 分类名称（默认 "未分类"）
- dueDate: 截止日期时间戳（可选，如果用户提到了时间）

## 输出格式
当你确定用户想要创建待办事项时，请在回复末尾输出一个特殊的 JSON 块：

\`\`\`action
{
  "type": "create_todo",
  "data": {
    "content": "事项内容",
    "description": "详细描述",
    "priority": "medium",
    "category": "未分类",
    "dueDate": 1234567890000
  }
}
\`\`\`

## 时间处理
- 当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 今天: ${new Date().toLocaleDateString('zh-CN')}
- 明天: ${new Date(Date.now() + 86400000).toLocaleDateString('zh-CN')}
- 后天: ${new Date(Date.now() + 172800000).toLocaleDateString('zh-CN')}

## 交互原则
1. 如果用户的意图不明确，先询问澄清。
2. 创建事项前，简要确认你理解的内容。
3. 成功后给予友好的确认反馈。
4. 如果用户只是闲聊，正常回复即可，不要输出 action 块。
5. 保持回复简洁友好。${customPromptSection}`;
};

/* ─── Action 解析器 ─── */

const parseAgentAction = (content: string): AgentAction | null => {
  const actionMatch = content.match(/```action\s*([\s\S]*?)\s*```/);
  if (!actionMatch) return null;

  try {
    const actionData = JSON.parse(actionMatch[1]);
    if (actionData.type === 'create_todo' && actionData.data?.content) {
      return {
        type: 'create_todo',
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

const extractJsonObject = (text: string): Record<string, any> | null => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
};

const parseModuleDecision = (text: string): string | null => {
  const json = extractJsonObject(text);
  if (json && typeof json.module === 'string') {
    const normalized = json.module.trim();
    return ENABLED_AGENT_MODULES.some(module => module.id === normalized) ? normalized : null;
  }

  const lowered = text.trim().toLowerCase();
  return ENABLED_AGENT_MODULES.some(module => module.id === lowered) ? lowered : null;
};

const buildModuleClassifierPrompt = (input: string): string => {
  const moduleList = ENABLED_AGENT_MODULES
    .map(module => `- ${module.id}: ${module.name}（${module.description}）`)
    .join('\n');

  return `请根据用户输入判断最适合的功能模块，只能从以下模块中选择一个，或者返回 null：

${moduleList}

用户输入：${input}

只返回 JSON，格式如下：
{"module":"todo"}
或
{"module":null}`;
};

const buildToolsForModule = (moduleId: string | null): ChatTool[] => {
  if (moduleId !== 'todo') {
    return [];
  }

  return [{
    name: 'create_todo',
    description: '创建一个新的待办事项',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '待办事项标题或内容' },
        description: { type: 'string', description: '补充说明' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级' },
        category: { type: 'string', description: '分类名称' },
        dueDate: { type: 'number', description: '截止时间毫秒时间戳' },
      },
      required: ['content'],
    },
  }];
};

const normalizeTodoPayload = (data: Record<string, any>): Partial<TodoItem> => ({
  content: typeof data.content === 'string' && data.content.trim() ? data.content.trim() : '新事项',
  description: typeof data.description === 'string' ? data.description : undefined,
  isCompleted: false,
  priority: data.priority === 'high' || data.priority === 'low' ? data.priority : 'medium',
  category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : '未分类',
  dueDate: typeof data.dueDate === 'number' ? data.dueDate : undefined,
});

/* ─── 组件 ─── */

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  onClose,
  onCreateTodo,
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = loadAgentHistory();
    if (saved.length === 0) {
      return [createAgentWelcomeMessage()];
    }
    return saved;
  });
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [config, setConfig] = useState<ChatConfig>(() => loadAgentConfig());
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [isModuleCollapsed, setIsModuleCollapsed] = useState(false);
  const [debugItems, setDebugItems] = useState<AgentDebugItem[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatServiceRef = useRef<ChatService | null>(null);
  const supportsNativeTools = useMemo(() => isNativeProvider(config.provider), [config.provider]);
  const currentModels = AVAILABLE_MODELS[config.provider] || [];

  const pushDebugItem = useCallback((item: Omit<AgentDebugItem, 'id' | 'timestamp'>) => {
    setDebugItems(prev => {
      const next: AgentDebugItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...item,
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
    }
  }, [isOpen]);

  const detectTargetModule = useCallback(async (input: string): Promise<string | null> => {
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

    if (!chatServiceRef.current || ENABLED_AGENT_MODULES.length === 0) {
      pushDebugItem({
        stage: 'router:skip',
        summary: '未能执行模块路由（服务未就绪或无可用模块）',
        payload: { serviceReady: Boolean(chatServiceRef.current), enabledModules: ENABLED_AGENT_MODULES.length },
        level: 'error',
      });
      return null;
    }

    try {
      const classifierMessages: ChatMessage[] = [
        {
          id: 'agent-module-classifier-system',
          role: 'system',
          content: '你是一个任务路由器，只负责返回 module JSON，不要输出多余解释。',
          timestamp: 0,
        },
        {
          id: 'agent-module-classifier-user',
          role: 'user',
          content: buildModuleClassifierPrompt(input),
          timestamp: Date.now(),
        },
      ];

      pushDebugItem({
        stage: 'router:llm-request',
        summary: '向模块分类器发送请求',
        payload: { messages: classifierMessages },
      });

      const classifierResponse = await chatServiceRef.current.completeText(classifierMessages, {
        onDebugEvent: pushServiceDebugEvent,
      });
      const parsedModule = parseModuleDecision(classifierResponse);

      pushDebugItem({
        stage: 'router:llm-response',
        summary: '模块分类器返回结果',
        payload: {
          rawResponse: classifierResponse,
          parsedModule,
        },
      });

      return parsedModule;
    } catch (error) {
      pushDebugItem({
        stage: 'router:error',
        summary: '模块分类器执行失败，降级为自动模式',
        payload: { error: error instanceof Error ? error.message : String(error) },
        level: 'error',
      });
      return null;
    }
  }, [pushDebugItem, pushServiceDebugEvent, selectedModule]);

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
      ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-10).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      })),
      { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp },
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
      onComplete: (text) => {
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
          summary: action ? '解析到待办 Action' : '未解析到 Action，仅文本回复',
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

        if (action?.status === 'pending' && action.type === 'create_todo') {
          try {
            const todoData = normalizeTodoPayload(action.data || {});
            pushDebugItem({
              stage: 'fallback:tool-exec',
              summary: '执行本地 API：onCreateTodo',
              payload: { tool: 'create_todo', args: action.data || {}, normalized: todoData },
            });
            onCreateTodo(todoData);
            setMessages(prev => prev.map(message =>
              message.id === assistantId ? { ...message, action: { ...action, status: 'success', data: todoData } } : message
            ));
            pushDebugItem({
              stage: 'fallback:tool-result',
              summary: '待办创建成功',
              payload: { todo: todoData },
              level: 'success',
            });
          } catch (error) {
            setMessages(prev => prev.map(message =>
              message.id === assistantId
                ? { ...message, action: { ...action, status: 'error', error: String(error) } }
                : message
            ));
            pushDebugItem({
              stage: 'fallback:tool-result',
              summary: '待办创建失败',
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
  }, [config.model, config.provider, config.systemPrompt, messages, onCreateTodo, pushDebugItem, selectedModule]);

  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isProcessing) return;

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

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
      targetModule: selectedModule || undefined,
    };
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, userMessage, {
      id: assistantId,
      role: 'assistant',
      content: selectedModule ? '正在处理任务...' : '正在判断任务归属...',
      timestamp: Date.now(),
    }]);
    setInputValue('');
    setIsProcessing(true);

    pushDebugItem({
      stage: 'send:start',
      summary: '开始新一轮 Agent 执行流程',
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

      const routedModule = supportsNativeTools
        ? await detectTargetModule(trimmedInput)
        : (selectedModule || parseIntentLocally(trimmedInput).suggestedModule || null);
      const nativeTools = supportsNativeTools ? buildToolsForModule(routedModule) : [];

      pushDebugItem({
        stage: 'send:routing-result',
        summary: '任务路由完成',
        payload: {
          routedModule,
          moduleName: getModuleById(routedModule)?.name,
          nativeTools,
          mode: supportsNativeTools && nativeTools.length > 0 ? 'native-tools' : 'fallback',
        },
      });

      if (supportsNativeTools && nativeTools.length > 0) {
        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? {
                ...message,
                content: routedModule ? `已进入${getModuleById(routedModule)?.name || routedModule}模块，正在执行...` : '正在调用工具...',
                targetModule: routedModule || undefined,
              }
            : message
        ));

        const chatMessages: ChatMessage[] = [
          {
            id: 'system',
            role: 'system',
            content: getAgentSystemPrompt({ selectedModule, routedModule, promptMode: 'native-tools', customSystemPrompt: config.systemPrompt }),
            timestamp: 0,
          },
          ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-10).map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
          })),
          { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp },
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

          if (toolCall.name === 'create_todo') {
            const todoData = normalizeTodoPayload(toolCall.arguments);
            onCreateTodo(todoData);
            executedAction = { type: 'create_todo', status: 'success', data: todoData };
            pushDebugItem({
              stage: 'native:tool-result',
              summary: 'create_todo 执行成功',
              payload: {
                input: toolCall.arguments,
                normalized: todoData,
              },
              level: 'success',
            });
            return { success: true, message: '待办事项创建成功', todo: todoData };
          }

          pushDebugItem({
            stage: 'native:tool-result',
            summary: `未知工具：${toolCall.name}`,
            payload: { toolCall },
            level: 'error',
          });
          throw new Error(`未知工具: ${toolCall.name}`);
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

        setMessages(prev => prev.map(message =>
          message.id === assistantId
            ? {
                ...message,
                content: toolResult.text || (executedAction ? '已帮你完成这个任务。' : '已处理完成。'),
                action: executedAction,
                targetModule: routedModule || undefined,
              }
            : message
        ));
        setIsProcessing(false);
        return;
      }

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

        <div className="relative w-[1240px] max-w-[96vw] h-[760px] max-h-[88vh] bg-white/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
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
                <p className="text-xs text-gray-400 mt-1">原生 tools 优先，兼容流程兜底</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearHistory}
                className="w-9 h-9 rounded-xl hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors"
                title="删除对话历史"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                title="帮助"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                title="API 设置"
              >
                <Settings2 className="w-5 h-5" />
              </button>
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500">任务模块</p>
                    <p className="text-xs text-gray-400 mt-1">选中后只调用该模块能力；不选则先自动判断。</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setIsModuleCollapsed(current => !current)}
                      className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
                      title={isModuleCollapsed ? '展开任务模块' : '折叠任务模块'}
                    >
                      {isModuleCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                      <span>{isModuleCollapsed ? '展开模块' : '折叠模块'}</span>
                    </button>
                    <div className="text-xs rounded-full px-2.5 py-1 bg-gray-100 text-gray-500">
                      {selectedModule ? `已选：${getModuleById(selectedModule)?.name}` : '自动判断'}
                    </div>
                  </div>
                </div>

                {!isModuleCollapsed && (
                  <div className="grid grid-cols-6 gap-2">
                    {AGENT_MODULES.map((module) => {
                      const Icon = module.icon;
                      const isSelected = selectedModule === module.id;

                      return (
                        <button
                          key={module.id}
                          onClick={() => handleModuleClick(module.id)}
                          disabled={!module.enabled}
                          className={`relative h-11 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1 ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                              : module.enabled
                                ? 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                                : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          }`}
                          title={`${module.name}${module.enabled ? '' : '（即将支持）'}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="text-[10px] leading-none">{module.name}</span>
                          {!module.enabled && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-gray-300" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-3 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 transition-colors">
                  <div className="flex items-center gap-3">
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
                      disabled={!inputValue.trim() || isProcessing || !config.apiKey}
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

            <div className="w-[380px] shrink-0 border-l border-gray-200 bg-slate-50/80 flex flex-col min-h-0">
              <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-white/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-700">调试信息</p>
                </div>
                <button
                  onClick={() => setDebugItems([])}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1 border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
                  title="清空调试信息"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {debugItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-3 text-xs text-slate-500 leading-relaxed">
                    这里会显示 Agent 全流程调试轨迹：
                    <br />
                    1. 发给 LLM 的上下文
                    <br />
                    2. 模型返回内容和工具调用
                    <br />
                    3. 本地 API 执行参数与结果
                  </div>
                ) : (
                  debugItems.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 ${
                        item.level === 'error'
                          ? 'border-red-200 bg-red-50/70'
                          : item.level === 'success'
                            ? 'border-emerald-200 bg-emerald-50/70'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-semibold text-slate-700">{item.stage}</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-2">{item.summary}</p>
                      {item.payload !== undefined && (
                        <pre className="rounded-lg bg-slate-900 text-slate-100 text-[11px] leading-5 p-2.5 overflow-x-auto whitespace-pre-wrap break-all">
                          {serializeDebugPayload(item.payload)}
                        </pre>
                      )}
                    </div>
                  ))
                )}
              </div>
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
          {message.action && (
            <div className={`flex items-center gap-1.5 text-xs ${
              message.action.status === 'success' ? 'text-green-600' :
              message.action.status === 'error' ? 'text-red-500' :
              'text-amber-500'
            }`}>
              {message.action.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {message.action.status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              {message.action.status === 'pending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <ListTodo className="w-3.5 h-3.5" />
              <span>待办工具</span>
            </div>
          )}

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
