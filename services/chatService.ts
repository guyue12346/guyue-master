import { GoogleGenAI } from "@google/genai";

// ==================== Types ====================

export interface ChatAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  base64: string; // base64 编码的文件内容
  size?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  tokens?: number;
  attachments?: ChatAttachment[];
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

export interface ChatTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatToolRunResult {
  text: string;
  toolCalls: ChatToolCall[];
}

export interface ChatDebugEvent {
  stage: string;
  provider: ChatConfig['provider'];
  endpoint?: string;
  request?: any;
  response?: any;
  detail?: string;
  timestamp: number;
}

export interface ChatRunOptions {
  onDebugEvent?: (event: ChatDebugEvent) => void;
}

// ==================== Model Definitions ====================

import { ZENMUX_MODELS, ZENMUX_AGENT_MODELS } from './zenmuxModels';

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

// Agent 专用模型列表：只保留支持原生 Tool Calling 的提供商和模型
export const AGENT_AVAILABLE_MODELS: Record<string, { id: string; name: string; provider: string; category?: string; description?: string }[]> = {
  zenmux: ZENMUX_AGENT_MODELS,
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', provider: 'gemini', description: '最新旗舰' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'gemini' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', description: '性价比' },
  ],
  openai: [
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai', description: '旗舰模型' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', description: '高性价比' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  ],
  anthropic: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', description: '最强智能' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', description: '速度与智能' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', description: '最快' },
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

  supportsNativeTools(): boolean {
    return ['openai', 'anthropic', 'gemini', 'zenmux'].includes(this.config.provider);
  }

  async completeText(messages: ChatMessage[], options?: ChatRunOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      let streamedText = '';

      options?.onDebugEvent?.({
        stage: 'text-completion:start',
        provider: this.config.provider,
        detail: '开始普通文本补全请求',
        request: {
          model: this.config.model,
          messages: this.toOpenAIMessages(messages),
        },
        timestamp: Date.now(),
      });

      this.sendMessage(messages, {
        onToken: (token) => {
          streamedText += token;
        },
        onComplete: (fullText) => {
          options?.onDebugEvent?.({
            stage: 'text-completion:done',
            provider: this.config.provider,
            detail: '文本补全完成',
            response: {
              text: fullText || streamedText,
            },
            timestamp: Date.now(),
          });
          resolve(fullText || streamedText);
        },
        onError: (error) => {
          options?.onDebugEvent?.({
            stage: 'text-completion:error',
            provider: this.config.provider,
            detail: error.message,
            response: { error: error.message },
            timestamp: Date.now(),
          });
          reject(error);
        },
      }).catch(reject);
    });
  }

  async runToolsConversation(
    messages: ChatMessage[],
    tools: ChatTool[],
    executeToolCall: (toolCall: ChatToolCall) => Promise<any>,
    options?: ChatRunOptions,
  ): Promise<ChatToolRunResult> {
    if (!this.supportsNativeTools() || tools.length === 0) {
      return {
        text: await this.completeText(messages, options),
        toolCalls: [],
      };
    }

    switch (this.config.provider) {
      case 'zenmux':
      case 'openai':
        return this.runOpenAIToolsConversation(messages, tools, executeToolCall, options);
      case 'anthropic':
        return this.runAnthropicToolsConversation(messages, tools, executeToolCall, options);
      case 'gemini':
        return this.runGeminiToolsConversation(messages, tools, executeToolCall, options);
      default:
        return {
          text: await this.completeText(messages, options),
          toolCalls: [],
        };
    }
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

  private getBaseUrl(): string {
    if (this.config.baseUrl) {
      return this.config.baseUrl;
    }

    switch (this.config.provider) {
      case 'zenmux':
        return 'https://zenmux.ai/api/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'ollama':
        return 'http://localhost:11434/v1';
      case 'deepseek':
        return 'https://api.deepseek.com/v1';
      case 'zhipu':
        return 'https://open.bigmodel.cn/api/paas/v4';
      case 'moonshot':
        return 'https://api.moonshot.cn/v1';
      case 'minimax':
        return 'https://api.minimax.chat/v1';
      default:
        throw new Error('自定义提供商需要配置 Base URL');
    }
  }

  private getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.provider === 'anthropic') {
      headers['x-api-key'] = this.config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private toOpenAIMessages(messages: ChatMessage[]) {
    const formattedMessages = messages.map(m => {
      const images = (m.attachments || []).filter(a => a.type === 'image');
      if (images.length > 0 && m.role === 'user') {
        return {
          role: m.role,
          content: [
            { type: 'text' as const, text: m.content },
            ...images.map(img => ({
              type: 'image_url' as const,
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    if (this.config.systemPrompt && !messages.some(m => m.role === 'system')) {
      formattedMessages.unshift({
        role: 'system',
        content: this.config.systemPrompt,
      } as any);
    }

    return formattedMessages;
  }

  private toAnthropicMessages(messages: ChatMessage[]) {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const images = (m.attachments || []).filter(a => a.type === 'image');
        if (images.length > 0 && m.role === 'user') {
          return {
            role: 'user' as const,
            content: [
              ...images.map(img => ({
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: img.mimeType,
                  data: img.base64,
                },
              })),
              { type: 'text' as const, text: m.content },
            ],
          };
        }
        return {
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
          content: m.content,
        };
      });
  }

  private getSystemPrompt(messages: ChatMessage[]): string | undefined {
    return messages.find(m => m.role === 'system')?.content || this.config.systemPrompt;
  }

  private async runOpenAIToolsConversation(
    messages: ChatMessage[],
    tools: ChatTool[],
    executeToolCall: (toolCall: ChatToolCall) => Promise<any>,
    options?: ChatRunOptions,
  ): Promise<ChatToolRunResult> {
    const emitDebug = (event: Omit<ChatDebugEvent, 'provider' | 'timestamp'>) => {
      options?.onDebugEvent?.({
        ...event,
        provider: this.config.provider,
        timestamp: Date.now(),
      });
    };

    const baseUrl = this.getBaseUrl();
    const headers = this.getRequestHeaders();
    const formattedTools = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const MAX_ITERATIONS = 6;
    let currentMessages = this.toOpenAIMessages(messages);
    const allToolCalls: ChatToolCall[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const includeTools = iteration < MAX_ITERATIONS - 1;
      const requestBody: any = {
        model: this.config.model,
        messages: currentMessages,
        stream: false,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };
      if (includeTools) {
        requestBody.tools = formattedTools;
        requestBody.tool_choice = 'auto';
      }

      emitDebug({
        stage: iteration === 0 ? 'openai:first-request' : 'openai:second-request',
        endpoint: `${baseUrl}/chat/completions`,
        detail: iteration === 0
          ? '发送第一轮请求（允许模型决定是否调用工具）'
          : `提交工具结果，发起第 ${iteration + 1} 轮请求`,
        request: requestBody,
      });

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json();
      emitDebug({
        stage: iteration === 0 ? 'openai:first-response' : 'openai:second-response',
        detail: iteration === 0 ? '收到第一轮模型回复' : `收到第 ${iteration + 1} 轮模型回复`,
        response: data,
      });

      const message = data.choices?.[0]?.message;
      const toolCalls: ChatToolCall[] = (message?.tool_calls || []).map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: this.safeParseJson(tc.function?.arguments),
      }));

      emitDebug({
        stage: 'openai:tool-calls',
        detail: toolCalls.length ? `模型返回 ${toolCalls.length} 个工具调用` : '模型未触发工具调用',
        response: { toolCalls },
      });

      if (toolCalls.length === 0) {
        return {
          text: typeof message?.content === 'string' ? message.content : '',
          toolCalls: allToolCalls,
        };
      }

      allToolCalls.push(...toolCalls);
      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => ({
        toolCall,
        result: await executeToolCall(toolCall),
      })));

      currentMessages = [
        ...currentMessages,
        {
          role: 'assistant',
          content: message?.content || '',
          tool_calls: (message?.tool_calls || []).map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        },
        ...toolResults.map(({ toolCall, result }) => ({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        })),
      ];
    }

    // Max iterations reached — do a final request without tools
    emitDebug({
      stage: 'native:max-iterations',
      detail: `达到最大迭代次数 (${MAX_ITERATIONS})，强制总结`,
    });
    const finalResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: currentMessages,
        stream: false,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
      signal: this.abortController?.signal,
    });
    if (!finalResponse.ok) {
      throw new Error(`API Error: ${finalResponse.status} - ${await finalResponse.text()}`);
    }
    const finalData = await finalResponse.json();
    return {
      text: finalData.choices?.[0]?.message?.content || '',
      toolCalls: allToolCalls,
    };
  }

  private async runAnthropicToolsConversation(
    messages: ChatMessage[],
    tools: ChatTool[],
    executeToolCall: (toolCall: ChatToolCall) => Promise<any>,
    options?: ChatRunOptions,
  ): Promise<ChatToolRunResult> {
    const emitDebug = (event: Omit<ChatDebugEvent, 'provider' | 'timestamp'>) => {
      options?.onDebugEvent?.({
        ...event,
        provider: this.config.provider,
        timestamp: Date.now(),
      });
    };

    const baseUrl = this.getBaseUrl();
    const headers = this.getRequestHeaders();
    const system = this.getSystemPrompt(messages);
    const anthropicMessages = this.toAnthropicMessages(messages);
    const anthropicTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    const MAX_ITERATIONS = 6;
    let currentMessages = [...anthropicMessages];
    const allToolCalls: ChatToolCall[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const includeTools = iteration < MAX_ITERATIONS - 1;
      const requestBody: any = {
        model: this.config.model,
        system,
        messages: currentMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false,
      };
      if (includeTools) {
        requestBody.tools = anthropicTools;
      }

      emitDebug({
        stage: iteration === 0 ? 'anthropic:first-request' : 'anthropic:second-request',
        endpoint: `${baseUrl}/messages`,
        detail: iteration === 0
          ? '发送第一轮请求（Claude 工具选择）'
          : `提交 tool_result，发起第 ${iteration + 1} 轮请求`,
        request: requestBody,
      });

      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json();
      emitDebug({
        stage: iteration === 0 ? 'anthropic:first-response' : 'anthropic:second-response',
        detail: iteration === 0 ? '收到第一轮 Claude 回复' : `收到第 ${iteration + 1} 轮 Claude 回复`,
        response: data,
      });

      const content = data.content || [];
      const toolCalls: ChatToolCall[] = content
        .filter((block: any) => block.type === 'tool_use')
        .map((block: any) => ({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        }));

      emitDebug({
        stage: 'anthropic:tool-calls',
        detail: toolCalls.length ? `Claude 返回 ${toolCalls.length} 个工具调用` : 'Claude 未触发工具调用',
        response: { toolCalls },
      });

      if (toolCalls.length === 0) {
        return {
          text: content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join(''),
          toolCalls: allToolCalls,
        };
      }

      allToolCalls.push(...toolCalls);
      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => ({
        toolCall,
        result: await executeToolCall(toolCall),
      })));

      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content },
        {
          role: 'user' as const,
          content: toolResults.map(({ toolCall, result }) => ({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result),
          })),
        },
      ];
    }

    // Max iterations reached — do a final request without tools
    emitDebug({
      stage: 'native:max-iterations',
      detail: `达到最大迭代次数 (${MAX_ITERATIONS})，强制总结`,
    });
    const finalResponse = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        system,
        messages: currentMessages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: false,
      }),
      signal: this.abortController?.signal,
    });
    if (!finalResponse.ok) {
      throw new Error(`API Error: ${finalResponse.status} - ${await finalResponse.text()}`);
    }
    const finalData = await finalResponse.json();
    return {
      text: (finalData.content || []).filter((block: any) => block.type === 'text').map((block: any) => block.text).join(''),
      toolCalls: allToolCalls,
    };
  }

  private async runGeminiToolsConversation(
    messages: ChatMessage[],
    tools: ChatTool[],
    executeToolCall: (toolCall: ChatToolCall) => Promise<any>,
    options?: ChatRunOptions,
  ): Promise<ChatToolRunResult> {
    const emitDebug = (event: Omit<ChatDebugEvent, 'provider' | 'timestamp'>) => {
      options?.onDebugEvent?.({
        ...event,
        provider: this.config.provider,
        timestamp: Date.now(),
      });
    };

    if (!this.config.apiKey) {
      throw new Error('请配置 Gemini API Key');
    }

    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
    const systemPrompt = this.getSystemPrompt(messages);
    let currentContents = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        const parts: any[] = [{ text: m.content }];
        const images = (m.attachments || []).filter(a => a.type === 'image');
        for (const img of images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

    // Gemini 不允许 functionDeclarations 和 codeExecution 同时存在
    const functionDeclarations = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }));

    const MAX_ITERATIONS = 6;
    const allToolCalls: ChatToolCall[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const includeTools = iteration < MAX_ITERATIONS - 1;
      const config: any = {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
        systemInstruction: systemPrompt,
      };
      if (includeTools) {
        config.tools = [{ functionDeclarations }];
      }

      const requestBody = {
        model: this.config.model,
        contents: currentContents,
        config,
      };

      emitDebug({
        stage: iteration === 0 ? 'gemini:first-request' : 'gemini:second-request',
        endpoint: 'google-genai.models.generateContent',
        detail: iteration === 0
          ? '发送第一轮 Gemini 请求（含 functionDeclarations）'
          : `提交 functionResponse，发起第 ${iteration + 1} 轮请求`,
        request: requestBody,
      });

      const response: any = await ai.models.generateContent(requestBody);

      emitDebug({
        stage: iteration === 0 ? 'gemini:first-response' : 'gemini:second-response',
        detail: iteration === 0 ? '收到第一轮 Gemini 回复' : `收到第 ${iteration + 1} 轮 Gemini 回复`,
        response,
      });

      const parts = response?.candidates?.[0]?.content?.parts || [];
      const toolCalls: ChatToolCall[] = parts
        .filter((part: any) => part.functionCall)
        .map((part: any, index: number) => ({
          id: part.functionCall.id || `${part.functionCall.name}-${index}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        }));

      emitDebug({
        stage: 'gemini:tool-calls',
        detail: toolCalls.length ? `Gemini 返回 ${toolCalls.length} 个 functionCall` : 'Gemini 未触发 functionCall',
        response: { toolCalls },
      });

      if (toolCalls.length === 0) {
        return {
          text: parts.filter((part: any) => part.text).map((part: any) => part.text).join('') || response?.text || '',
          toolCalls: allToolCalls,
        };
      }

      allToolCalls.push(...toolCalls);
      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => ({
        toolCall,
        result: await executeToolCall(toolCall),
      })));

      currentContents = [
        ...currentContents,
        { role: 'model', parts },
        {
          role: 'user',
          parts: toolResults.map(({ toolCall, result }) => ({
            functionResponse: {
              name: toolCall.name,
              response: { result },
            },
          })),
        },
      ];
    }

    // Max iterations reached — do a final request without tools
    emitDebug({
      stage: 'native:max-iterations',
      detail: `达到最大迭代次数 (${MAX_ITERATIONS})，强制总结`,
    });
    const finalResponse: any = await ai.models.generateContent({
      model: this.config.model,
      contents: currentContents,
      config: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
        systemInstruction: systemPrompt,
      },
    });
    const finalParts = finalResponse?.candidates?.[0]?.content?.parts || [];
    return {
      text: finalParts.filter((part: any) => part.text).map((part: any) => part.text).join('') || finalResponse?.text || '',
      toolCalls: allToolCalls,
    };
  }

  private safeParseJson(value: string | undefined): Record<string, any> {
    if (!value) {
      return {};
    }

    try {
      return JSON.parse(value);
    } catch {
      return {};
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
      .map(m => {
        const parts: any[] = [{ text: m.content }];
        const images = (m.attachments || []).filter(a => a.type === 'image');
        for (const img of images) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        };
      });

    // Get system prompt
    const systemPrompt = messages.find(m => m.role === 'system')?.content || this.config.systemPrompt;

    let fullText = '';

    try {
      // Build config with optional built-in tools
      const config: any = {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
        systemInstruction: systemPrompt,
        tools: [{ codeExecution: {} }],
      };

      // Enable Google Search grounding if configured
      if (this.config.enableWebSearch) {
        config.tools.push({ googleSearch: {} });
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

    const baseUrl = this.getBaseUrl();

    // Convert messages to OpenAI format
    const formattedMessages = this.toOpenAIMessages(messages);
    const headers = this.getRequestHeaders();

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
