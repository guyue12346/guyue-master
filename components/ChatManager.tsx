import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquarePlus, Send, Settings2, Trash2, StopCircle, Copy, Check,
  ChevronDown, Bot, User, Sparkles, AlertCircle, Loader2, Plus, X,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Download, Globe
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ChatMessage,
  ChatConversation,
  ChatConfig,
  ChatService,
  AVAILABLE_MODELS,
  DEFAULT_CHAT_CONFIG,
  loadConversations,
  saveConversations,
  loadChatConfig,
  saveChatConfig,
  createNewConversation,
} from '../services/chatService';

// ==================== Code Block Component ====================

const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="absolute right-2 top-2 z-10">
        <button
          onClick={handleCopy}
          className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: '0.5rem',
          fontSize: '0.875rem'
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
};

// ==================== Message Component ====================

const MessageBubble: React.FC<{
  message: ChatMessage;
  isStreaming?: boolean;
}> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} group`}>
      <div className={`
        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${isUser ? 'bg-blue-600' : 'bg-gradient-to-br from-purple-500 to-pink-500'}
      `}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`
          inline-block text-left rounded-2xl px-4 py-3 
          ${isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-100 text-gray-800'
          }
        `}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-pre:p-0 prose-pre:bg-transparent">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    return isInline ? (
                      <code className="px-1 py-0.5 bg-gray-200 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    ) : (
                      <CodeBlock language={match[1]}>
                        {String(children).replace(/\n$/, '')}
                      </CodeBlock>
                    );
                  },
                }}
              >
                {message.content || (isStreaming ? '▊' : '')}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && !isStreaming && (
          <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
              title="复制"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== Settings Panel ====================

const SettingsPanel: React.FC<{
  config: ChatConfig;
  onUpdateConfig: (config: ChatConfig) => void;
  onClose: () => void;
}> = ({ config, onUpdateConfig, onClose }) => {
  const [localConfig, setLocalConfig] = useState(config);

  const handleSave = () => {
    onUpdateConfig(localConfig);
    saveChatConfig(localConfig);
    onClose();
  };

  const models = AVAILABLE_MODELS[localConfig.provider] || [];

  return (
    <div className="absolute inset-0 bg-white z-50 flex flex-col">
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
        <h3 className="font-semibold text-gray-800">Chat 设置</h3>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">服务提供商</label>
          <select
            value={localConfig.provider}
            onChange={(e) => {
              const provider = e.target.value as ChatConfig['provider'];
              const firstModel = AVAILABLE_MODELS[provider]?.[0]?.id || '';
              setLocalConfig({ ...localConfig, provider, model: firstModel });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="ollama">Ollama (本地)</option>
            <option value="custom">自定义 API</option>
          </select>
        </div>

        {/* API Key */}
        {localConfig.provider !== 'ollama' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <input
              type="password"
              value={localConfig.apiKey}
              onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
              placeholder="输入 API Key"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Base URL (for custom/ollama) */}
        {(localConfig.provider === 'custom' || localConfig.provider === 'ollama') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
            <input
              type="text"
              value={localConfig.baseUrl || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
              placeholder={localConfig.provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.example.com/v1'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">模型</label>
          {models.length > 0 ? (
            <select
              value={localConfig.model}
              onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={localConfig.model}
              onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
              placeholder="输入模型名称"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          )}
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Temperature: {localConfig.temperature?.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={localConfig.temperature || 0.7}
            onChange={(e) => setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>精确</span>
            <span>创意</span>
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">系统提示词</label>
          <textarea
            value={localConfig.systemPrompt || ''}
            onChange={(e) => setLocalConfig({ ...localConfig, systemPrompt: e.target.value })}
            placeholder="设定 AI 的角色和行为..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Web Search Toggle (Gemini only) */}
        {localConfig.provider === 'gemini' && (
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">联网搜索</label>
              <p className="text-xs text-gray-500 mt-0.5">启用 Google Search 实时搜索</p>
            </div>
            <button
              type="button"
              onClick={() => setLocalConfig({ ...localConfig, enableWebSearch: !localConfig.enableWebSearch })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localConfig.enableWebSearch ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localConfig.enableWebSearch ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          保存设置
        </button>
      </div>
    </div>
  );
};

// ==================== Main ChatManager Component ====================

export const ChatManager: React.FC = () => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [chatService, setChatService] = useState<ChatService | null>(null);
  
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize
  useEffect(() => {
    const savedConversations = loadConversations();
    const savedConfig = loadChatConfig();
    
    setConversations(savedConversations);
    setConfig(savedConfig);
    setChatService(new ChatService(savedConfig));

    if (savedConversations.length > 0) {
      setActiveConversationId(savedConversations[0].id);
    }
  }, []);

  // Save conversations when changed
  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingContent, conversations]);

  // Get active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Handle new conversation
  const handleNewConversation = () => {
    const newConv = createNewConversation(config.model, config.systemPrompt);
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setInputValue('');
    setError(null);
  };

  // Handle delete conversation
  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个对话吗？')) {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter(c => c.id !== id);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return;
    if (!chatService) return;

    setError(null);

    // Create or use existing conversation
    let conv = activeConversation;
    if (!conv) {
      conv = createNewConversation(config.model, config.systemPrompt);
      setConversations(prev => [conv!, ...prev]);
      setActiveConversationId(conv.id);
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    };

    // Update conversation with user message
    const updatedMessages = [...conv.messages, userMessage];
    setConversations(prev => prev.map(c => 
      c.id === conv!.id 
        ? { ...c, messages: updatedMessages, updatedAt: Date.now() }
        : c
    ));

    setInputValue('');
    setIsStreaming(true);
    setStreamingContent('');

    // Prepare messages for API (include system prompt)
    const apiMessages: ChatMessage[] = config.systemPrompt 
      ? [{ id: 'system', role: 'system', content: config.systemPrompt, timestamp: 0 }, ...updatedMessages]
      : updatedMessages;

    try {
      await chatService.sendMessage(apiMessages, {
        onToken: (token) => {
          setStreamingContent(prev => prev + token);
        },
        onComplete: (fullText) => {
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: fullText,
            timestamp: Date.now(),
            model: config.model
          };

          setConversations(prev => prev.map(c => {
            if (c.id === conv!.id) {
              const newMessages = [...updatedMessages, assistantMessage];
              // Update title if first exchange
              const title = newMessages.length === 2 
                ? userMessage.content.substring(0, 30) + (userMessage.content.length > 30 ? '...' : '')
                : c.title;
              return { ...c, messages: newMessages, title, updatedAt: Date.now() };
            }
            return c;
          }));

          setIsStreaming(false);
          setStreamingContent('');
        },
        onError: (err) => {
          setError(err.message);
          setIsStreaming(false);
          setStreamingContent('');
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [inputValue, isStreaming, chatService, activeConversation, config]);

  // Handle stop streaming
  const handleStop = () => {
    chatService?.abort();
    setIsStreaming(false);
  };

  // Handle config update
  const handleUpdateConfig = (newConfig: ChatConfig) => {
    setConfig(newConfig);
    setChatService(new ChatService(newConfig));
  };

  // Handle key press: Cmd+Enter to send, Enter for newline
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">开始对话</h2>
      <p className="text-gray-500 text-center max-w-md mb-6">
        与 AI 进行对话，获取帮助、创意灵感或解答问题。
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {['帮我写一段代码', '解释一个概念', '翻译文本', '头脑风暴'].map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => setInputValue(suggestion)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-gray-50 relative">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
          {/* Sidebar Header */}
          <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4">
            <h2 className="font-semibold text-gray-800">对话历史</h2>
            <button
              onClick={handleNewConversation}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors"
              title="新建对话"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">
                暂无对话记录
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left group transition-colors
                    ${activeConversationId === conv.id 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'hover:bg-gray-100 text-gray-700'
                    }
                  `}
                >
                  <MessageSquarePlus className="w-4 h-4 flex-shrink-0 opacity-60" />
                  <span className="flex-1 truncate text-sm">{conv.title}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 rounded transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </button>
              ))
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-gray-200">
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              <span className="text-sm">设置</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
              title={showSidebar ? '隐藏侧边栏' : '显示侧边栏'}
            >
              {showSidebar ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-500" />
              <span className="font-medium text-gray-800">
                {activeConversation?.title || 'AI 助手'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Web Search Toggle (Gemini only) */}
            {config.provider === 'gemini' && (
              <button
                onClick={() => {
                  const newConfig = { ...config, enableWebSearch: !config.enableWebSearch };
                  setConfig(newConfig);
                  chatService?.updateConfig(newConfig);
                  saveChatConfig(newConfig);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  config.enableWebSearch
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={config.enableWebSearch ? '联网搜索已启用' : '点击启用联网搜索'}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{config.enableWebSearch ? '联网' : '离线'}</span>
              </button>
            )}
            {/* Model Badge */}
            <div className="px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600 font-medium">
              {config.model}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              {activeConversation.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Streaming Message */}
              {isStreaming && streamingContent && (
                <MessageBubble
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: streamingContent,
                    timestamp: Date.now()
                  }}
                  isStreaming
                />
              )}

              {/* Loading Indicator */}
              {isStreaming && !streamingContent && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-2xl">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                    <span className="text-sm text-gray-500">思考中...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="输入消息..."
                rows={1}
                className="w-full px-4 py-3 pr-12 bg-gray-100 border-none rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                style={{ maxHeight: '200px' }}
                disabled={isStreaming}
              />
            </div>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
                title="停止生成"
              >
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`
                  p-3 rounded-xl transition-colors
                  ${inputValue.trim() 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }
                `}
                title="发送"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="text-center mt-2 text-xs text-gray-400">
            按 ⌘/Ctrl + Enter 发送，Enter 换行
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          config={config}
          onUpdateConfig={handleUpdateConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default ChatManager;
