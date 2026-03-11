import { GoogleGenAI } from "@google/genai";

// ==================== Types ====================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  tokens?: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatConfig {
  provider: 'zenmux' | 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'custom' | 'deepseek' | 'zhipu' | 'moonshot' | 'minimax';
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableWebSearch?: boolean; // 启用联网搜索 (Gemini/Zenmux)
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

// ==================== Model Definitions ====================

import { ZENMUX_MODELS } from './zenmuxModels';

export const AVAILABLE_MODELS: Record<string, { id: string; name: string; provider: string; category?: string; description?: string }[]> = {
  zenmux: ZENMUX_MODELS,
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'gemini', description: '最新旗舰' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', description: '性价比' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'gemini', description: '最快最省' },
  ],
  openai: [
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', description: '旗舰模型' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', description: '高性价比' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'o3', name: 'o3', provider: 'openai', description: '推理' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', description: '最强智能' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', description: '速度与智能' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', description: '最快' },
  ],
  ollama: [
    { id: 'llama3.3', name: 'Llama 3.3', provider: 'ollama' },
    { id: 'qwen3', name: 'Qwen 3', provider: 'ollama' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'ollama' },
    { id: 'gemma3', name: 'Gemma 3', provider: 'ollama' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek-V3', provider: 'deepseek', description: '对话模型' },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1', provider: 'deepseek', description: '推理模型' },
  ],
  zhipu: [
    { id: 'glm-4-plus', name: 'GLM-4-Plus', provider: 'zhipu', description: '旗舰' },
    { id: 'glm-4-air-250414', name: 'GLM-4-Air', provider: 'zhipu', description: '高性价比' },
    { id: 'glm-4-flash-250414', name: 'GLM-4-Flash', provider: 'zhipu', description: '免费' },
    { id: 'glm-z1-air', name: 'GLM-Z1-Air', provider: 'zhipu', description: '推理' },
    { id: 'glm-z1-flash', name: 'GLM-Z1-Flash', provider: 'zhipu', description: '免费推理' },
  ],
  moonshot: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'moonshot', description: '最新旗舰' },
    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', provider: 'moonshot', description: '高速版' },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', provider: 'moonshot', description: '推理' },
    { id: 'moonshot-v1-128k', name: 'Moonshot (128k)', provider: 'moonshot', description: '长文本' },
  ],
  minimax: [
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'minimax', description: '最新旗舰' },
    { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', provider: 'minimax', description: '极速版' },
    { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', provider: 'minimax' },
    { id: 'MiniMax-M2', name: 'MiniMax M2', provider: 'minimax' },
  ],
};

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  provider: 'zenmux',
  apiKey: '',
  baseUrl: 'https://zenmux.ai/api/v1',
  model: 'anthropic/claude-sonnet-4.5',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '你是一个有帮助的AI助手。',
  enableWebSearch: false
};

// ==================== Chat Service ====================

export class ChatService {
  private config: ChatConfig;
  private abortController: AbortController | null = null;

  constructor(config: ChatConfig) {
    this.config = config;
  }

  updateConfig(config: Partial<ChatConfig>) {
    this.config = { ...this.config, ...config };
  }

  async sendMessage(
    messages: ChatMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    this.abortController = new AbortController();

    try {
      switch (this.config.provider) {
        case 'gemini':
          await this.sendGemini(messages, callbacks);
          break;
        case 'zenmux':
        case 'openai':
        case 'anthropic':
        case 'ollama':
        case 'custom':
        case 'deepseek':
        case 'zhipu':
        case 'moonshot':
        case 'minimax':
          await this.sendOpenAICompatible(messages, callbacks);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        callbacks.onComplete(''); // Gracefully handle abort
      } else {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async sendGemini(
    messages: ChatMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('请配置 Gemini API Key');
    }

    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });

    // Build contents from messages
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    // Get system prompt
    const systemPrompt = messages.find(m => m.role === 'system')?.content || this.config.systemPrompt;

    let fullText = '';

    try {
      // Build config with optional Google Search tool
      const config: any = {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
        systemInstruction: systemPrompt
      };

      // Enable Google Search grounding if configured
      if (this.config.enableWebSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const response = await ai.models.generateContentStream({
        model: this.config.model,
        contents: contents,
        config
      });

      for await (const chunk of response) {
        if (this.abortController?.signal.aborted) {
          break;
        }
        const text = chunk.text || '';
        fullText += text;
        callbacks.onToken(text);
      }

      callbacks.onComplete(fullText);
    } catch (error) {
      throw error;
    }
  }

  private async sendOpenAICompatible(
    messages: ChatMessage[],
    callbacks: StreamCallbacks
  ): Promise<void> {
    if (!this.config.apiKey && this.config.provider !== 'ollama') {
      throw new Error(`请配置 ${this.config.provider} API Key`);
    }

    // Determine base URL
    let baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      switch (this.config.provider) {
        case 'zenmux':
          baseUrl = 'https://zenmux.ai/api/v1';
          break;
        case 'openai':
          baseUrl = 'https://api.openai.com/v1';
          break;
        case 'anthropic':
          baseUrl = 'https://api.anthropic.com/v1';
          break;
        case 'ollama':
          baseUrl = 'http://localhost:11434/v1';
          break;
        case 'deepseek':
          baseUrl = 'https://api.deepseek.com/v1';
          break;
        case 'zhipu':
          baseUrl = 'https://open.bigmodel.cn/api/paas/v4';
          break;
        case 'moonshot':
          baseUrl = 'https://api.moonshot.cn/v1';
          break;
        case 'minimax':
          baseUrl = 'https://api.minimax.chat/v1';
          break;
        default:
          throw new Error('自定义提供商需要配置 Base URL');
      }
    }

    // Convert messages to OpenAI format
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Add system prompt if not already present
    if (this.config.systemPrompt && !messages.some(m => m.role === 'system')) {
      formattedMessages.unshift({
        role: 'system',
        content: this.config.systemPrompt
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.provider === 'anthropic') {
      headers['x-api-key'] = this.config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const body: any = {
      model: this.config.model,
      messages: formattedMessages,
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens
    };

    // Enable Web Search for Zenmux (暂时禁用，需要确认正确的格式)
    // TODO: 确认Zenmux的web search正确格式
    // if (this.config.provider === 'zenmux' && this.config.enableWebSearch) {
    //   body.tools = [{
    //     type: 'web_search',
    //     web_search: {
    //       enabled: true
    //     }
    //   }];
    // }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace(/^data:\s*/, '');
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            callbacks.onToken(content);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    callbacks.onComplete(fullText);
  }
}

// ==================== Conversation Management ====================

const STORAGE_KEY_CONVERSATIONS = 'guyue_chat_conversations';
const STORAGE_KEY_CHAT_CONFIG = 'guyue_chat_config';

export const loadConversations = (): ChatConversation[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

/** 最多保留的对话数量，超出时自动删除最旧的 */
const MAX_CONVERSATIONS = 50;

export const saveConversations = (conversations: ChatConversation[]): void => {
  // 按最后更新时间降序，保留最新的 MAX_CONVERSATIONS 条
  const trimmed = conversations
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, MAX_CONVERSATIONS);
  try {
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(trimmed));
  } catch (e) {
    // localStorage 满时，尝试删除最旧的一半后重试
    const half = trimmed.slice(0, Math.floor(MAX_CONVERSATIONS / 2));
    try {
      localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(half));
    } catch {
      console.warn('ChatService: 无法保存对话历史，localStorage 已满');
    }
  }
};

export const loadChatConfig = (): ChatConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CHAT_CONFIG);
    return saved ? { ...DEFAULT_CHAT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CHAT_CONFIG;
  } catch {
    return DEFAULT_CHAT_CONFIG;
  }
};

export const saveChatConfig = (config: ChatConfig): void => {
  localStorage.setItem(STORAGE_KEY_CHAT_CONFIG, JSON.stringify(config));
};

export const createNewConversation = (model: string, systemPrompt?: string): ChatConversation => {
  return {
    id: crypto.randomUUID(),
    title: '新对话',
    messages: [],
    model,
    systemPrompt,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
};

export const generateConversationTitle = async (
  messages: ChatMessage[],
  chatService: ChatService
): Promise<string> => {
  if (messages.length < 2) return '新对话';

  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return '新对话';

  // Simple title extraction from first message
  const content = firstUserMessage.content.trim();
  if (content.length <= 20) return content;
  return content.substring(0, 20) + '...';
};
