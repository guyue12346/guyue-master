import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertCircle, ListTodo, Settings2, ChevronDown, Trash2, StickyNote, Webhook, FolderOpen, Command, Globe, Code2, GraduationCap, Image, MessageSquare, Pencil, BarChart3 } from 'lucide-react';
import type { TodoItem } from '../types';
import {
  ChatConfig,
  ChatService,
  AVAILABLE_MODELS,
  DEFAULT_CHAT_CONFIG,
  ChatMessage,
} from '../services/chatService';

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

/* ─── Agent 配置存储 ─── */

const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';

const loadAgentConfig = (): ChatConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_CONFIG);
    return saved ? { ...DEFAULT_CHAT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CHAT_CONFIG;
  } catch {
    return DEFAULT_CHAT_CONFIG;
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

/* ─── Agent System Prompt ─── */

const getAgentSystemPrompt = () => `你是「古月助手」，Guyue Master 应用的内置智能 Agent。

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
- "明天" 指的是 ${new Date(Date.now() + 86400000).toLocaleDateString('zh-CN')}
- "后天" 指的是 ${new Date(Date.now() + 172800000).toLocaleDateString('zh-CN')}
- 请将用户提到的相对时间转换为具体的毫秒时间戳

## 交互原则
1. 如果用户的意图不明确，先询问澄清
2. 创建事项前，简要确认你理解的内容
3. 成功后给予友好的确认反馈（不要重复输出 action 块）
4. 如果用户只是闲聊，正常回复即可，不要输出 action 块
5. 保持回复简洁友好`;

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

function parseIntentLocally(input: string): { isCreateTodo: boolean; data?: Partial<TodoItem> } {
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
    data: {
      content,
      priority,
      dueDate,
      category: '未分类',
    }
  };
}

/* ─── 组件 ─── */

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen,
  onClose,
  onCreateTodo,
}) => {
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = loadAgentHistory();
    if (saved.length === 0) {
      return [{
        id: 'welcome',
        role: 'assistant',
        content: '👋 你好！我是古月助手，目前我可以帮你快速创建待办事项。\n\n试试说：\n- "帮我新建一个明天的会议"\n- "添加一个紧急任务：提交报告"\n- "提醒我后天交作业"',
        timestamp: Date.now(),
      }];
    }
    return saved;
  });
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<ChatConfig>(() => loadAgentConfig());
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatServiceRef = useRef<ChatService | null>(null);

  // 初始化 ChatService
  useEffect(() => {
    chatServiceRef.current = new ChatService({
      ...config,
      systemPrompt: getAgentSystemPrompt(),
    });
  }, []);

  // 配置变化时更新 ChatService
  useEffect(() => {
    saveAgentConfig(config);
    if (chatServiceRef.current) {
      chatServiceRef.current.updateConfig({
        ...config,
        systemPrompt: getAgentSystemPrompt(),
      });
    }
  }, [config]);

  // 保存历史
  useEffect(() => {
    saveAgentHistory(messages.filter(m => m.id !== 'welcome'));
  }, [messages]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setShowProviderDropdown(false);
      setShowModelDropdown(false);
    };
    if (showProviderDropdown || showModelDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showProviderDropdown, showModelDropdown]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isProcessing) return;

    // 检查 API 配置
    if (!config.apiKey) {
      setShowSettings(true);
      return;
    }

    // 添加用户消息
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    // 准备发送给 LLM 的消息
    const chatMessages: ChatMessage[] = [
      { id: 'system', role: 'system', content: getAgentSystemPrompt(), timestamp: 0 },
      ...messages.filter(m => m.role !== 'system' && m.id !== 'welcome').slice(-10).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      })),
      { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp },
    ];

    const assistantId = crypto.randomUUID();
    let fullResponse = '';

    // 添加空的助手消息用于流式更新
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);

    try {
      await chatServiceRef.current?.sendMessage(chatMessages, {
        onToken: (token) => {
          fullResponse += token;
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: fullResponse } : m
          ));
        },
        onComplete: (text) => {
          fullResponse = text;
          const action = parseAgentAction(text);
          const displayContent = removeActionBlock(text);

          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: displayContent || '...', action } : m
          ));

          // 如果有待执行的动作，执行它
          if (action && action.status === 'pending' && action.type === 'create_todo') {
            try {
              const todoData = action.data!;
              onCreateTodo({
                content: todoData.content || '新事项',
                description: todoData.description,
                isCompleted: false,
                priority: (todoData.priority as 'high' | 'medium' | 'low') || 'medium',
                category: todoData.category || '未分类',
                dueDate: todoData.dueDate,
              });

              // 更新动作状态为成功
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, action: { ...action, status: 'success' } } : m
              ));
            } catch (e) {
              // 更新动作状态为失败
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? {
                  ...m,
                  action: { ...action, status: 'error', error: String(e) }
                } : m
              ));
            }
          }

          setIsProcessing(false);
        },
        onError: (error) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: `❌ 发生错误: ${error.message}` } : m
          ));
          setIsProcessing(false);
        },
      });
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: `❌ 发生错误: ${e}` } : m
      ));
      setIsProcessing(false);
    }
  }, [inputValue, isProcessing, config.apiKey, messages, onCreateTodo]);

  // 清除历史
  const clearHistory = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: '👋 你好！我是古月助手，目前我可以帮你快速创建待办事项。\n\n试试说：\n- "帮我新建一个明天的会议"\n- "添加一个紧急任务：提交报告"\n- "提醒我后天交作业"',
      timestamp: Date.now(),
    }]);
    localStorage.removeItem(STORAGE_KEY_AGENT_HISTORY);
  };

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const providers = Object.keys(AVAILABLE_MODELS);
  const currentModels = AVAILABLE_MODELS[config.provider] || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 对话面板 */}
      <div className="relative w-[500px] max-h-[650px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 flex items-center justify-center shadow-lg overflow-hidden border border-white/10">
              <div className="flex flex-col items-center justify-center leading-none text-gray-200">
                <span className="font-serif text-xs font-bold -mb-0.5 tracking-widest">古</span>
                <span className="font-serif text-xs font-bold -mt-0.5 tracking-widest">月</span>
              </div>
            </div>
            <h2 className="text-gray-800 font-semibold">Guyue-Master-Agent</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                showSettings ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title="API 设置"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 设置面板 */}
        {showSettings && (
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
            <div className="flex items-center gap-3">
              {/* 提供商选择 */}
              <div className="relative flex-1">
                <label className="block text-xs text-gray-500 mb-1">提供商</label>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowProviderDropdown(!showProviderDropdown); setShowModelDropdown(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 hover:border-gray-300 transition-colors"
                >
                  <span className="capitalize">{config.provider}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showProviderDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-48 overflow-auto">
                    {providers.map(p => (
                      <button
                        key={p}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfig(prev => ({
                            ...prev,
                            provider: p as ChatConfig['provider'],
                            model: AVAILABLE_MODELS[p]?.[0]?.id || '',
                          }));
                          setShowProviderDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${config.provider === p ? 'bg-blue-50 text-blue-600' : 'text-gray-800'}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 模型选择 */}
              <div className="relative flex-1">
                <label className="block text-xs text-gray-500 mb-1">模型</label>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); setShowProviderDropdown(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 hover:border-gray-300 transition-colors truncate"
                >
                  <span className="truncate">{currentModels.find(m => m.id === config.model)?.name || config.model || '选择模型'}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
                {showModelDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-20 max-h-48 overflow-auto">
                    {currentModels.map(m => (
                      <button
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfig(prev => ({ ...prev, model: m.id }));
                          setShowModelDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${config.model === m.id ? 'bg-blue-50 text-blue-600' : 'text-gray-800'}`}
                      >
                        <span>{m.name}</span>
                        {m.description && <span className="ml-2 text-xs text-gray-400">{m.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="输入你的 API Key"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Base URL (可选) */}
            {(config.provider === 'custom' || config.provider === 'ollama') && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                <input
                  type="text"
                  value={config.baseUrl || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                清除对话
              </button>
              <div className="flex items-center gap-1 text-xs">
                {config.apiKey ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-3 h-3" />
                    已配置
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertCircle className="w-3 h-3" />
                    需要配置 API Key
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isProcessing && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>思考中...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2 border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.apiKey ? '描述你想创建的待办事项...' : '请先配置 API Key'}
              className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 outline-none text-sm"
              disabled={isProcessing || !config.apiKey}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isProcessing || !config.apiKey}
              className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {config.apiKey ? `✨ ${config.provider} · ${currentModels.find(m => m.id === config.model)?.name || config.model}` : '⚙️ 点击右上角设置配置 API'} · 按 Enter 发送
          </p>
        </div>
      </div>
    </div>
  );
};

/* ─── 消息气泡组件 ─── */

const MessageBubble: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        isUser 
          ? 'bg-blue-600 text-white' 
          : 'bg-gray-100 text-gray-800'
      }`}>
        {/* 操作状态指示 */}
        {message.action && (
          <div className={`flex items-center gap-2 mb-2 text-xs ${
            message.action.status === 'success' ? 'text-green-600' :
            message.action.status === 'error' ? 'text-red-500' :
            'text-amber-500'
          }`}>
            {message.action.status === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {message.action.status === 'error' && <AlertCircle className="w-4 h-4" />}
            {message.action.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" />}
            <ListTodo className="w-4 h-4" />
            <span>创建待办</span>
          </div>
        )}
        
        {/* 消息内容 */}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i}>{part}</strong> : part
          )}
        </div>
        
        {/* 时间戳 */}
        <div className={`text-xs mt-2 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
};

export default AgentPanel;
