import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquarePlus, Send, Settings2, Trash2, StopCircle, Copy, Check,
  ChevronDown, Bot, User, Sparkles, AlertCircle, Loader2, Plus, X,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Download, Globe, Columns, Square, Zap, Wand2, Search, HelpCircle,
  Brain, Key, Pencil, Quote, Tag
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import remarkGithubBlockquoteAlert from 'remark-github-blockquote-alert';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
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
import { Terminal as TerminalComponent } from './Terminal';
import { PromptRecord, FileRecord, KbTag, KbFileEntry } from '../types';
import * as LucideIcons from 'lucide-react';
import { HelpModal } from './HelpModal';
import { buildIndex, loadRagIndex, saveRagIndex, searchIndex } from '../utils/ragService';

const STORAGE_KEY_KB_MESSAGES = 'guyue_kb_agent_history';

const createKbWelcomeMessage = (): ChatMessage => ({
  id: 'kb-welcome',
  role: 'assistant',
  content: '🧠 你好！我是**知识库助手**，专注于回答你本地知识库中文件相关的问题。\n\n**使用方式**：\n1. 在文件管理中悬停文件，点击 🧠 图标将文件加入知识库\n2. 点击右上角 🧠 按钮旁边的设置图标，配置 Embedding API Key\n3. 直接向我提问，我会在知识库中搜索相关内容并回答\n\n有什么关于你的文件想了解的吗？',
  timestamp: Date.now(),
});

interface ChatManagerProps {
  compact?: boolean;
  knowledgeBaseFileIds?: Set<string>;
  kbTags?: KbTag[];
  kbFileEntries?: KbFileEntry[];
  onSaveKbTags?: (tags: KbTag[]) => void;
  onToggleKnowledgeBase?: (fileId: string, tagIds?: string[]) => void;
  fileRecords?: FileRecord[];
}

// ==================== Code Block Component ====================

const CodeBlock: React.FC<{ language?: string; children: string }> = React.memo(({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-700/50 shadow-md">
      {/* Language bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800/90 border-b border-gray-700/50">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wide">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-all"
        >
          {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        wrapLongLines
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.85rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#1a1b26',
          padding: '1rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
});

const normalizeMarkdownContent = (content: string) => {
  if (!content) return '';
  let normalized = content.replace(/\u00A0/g, ' ').trimEnd();
  const fenceMatches = normalized.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    normalized = `${normalized}\n\n\`\`\``;
  }
  return normalized;
};

// ==================== AI Logo ====================
const AIAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-16 h-16' };
  const iconSizeMap = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-8 h-8' };
  return (
    <div
      className={`${sizeMap[size]} rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm`}
      style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 40%, #db2777 100%)' }}
    >
      <Sparkles className={`${iconSizeMap[size]} text-white`} />
    </div>
  );
};

// ==================== KB Logo ====================
const KBAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-16 h-16' };
  const iconSizeMap = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-8 h-8' };
  return (
    <div
      className={`${sizeMap[size]} rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm`}
      style={{ background: 'linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%)' }}
    >
      <Brain className={`${iconSizeMap[size]} text-white`} />
    </div>
  );
};

// ==================== Markdown Renderer ====================
const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = React.memo(({ content, isStreaming }) => {
  const displayContent = normalizeMarkdownContent(content);
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, [remarkBreaks], remarkGithubBlockquoteAlert]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          code(props: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: any }) {
            const { inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const hasNewline = codeString.includes('\n');
            if (hasNewline || (match && !inline)) {
              return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
            }
            return (
              <code
                className="bg-gray-100 text-rose-600 border border-gray-200 px-1.5 py-0.5 rounded-md text-[0.82em] font-mono"
                {...rest}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-xl border border-gray-200 shadow-sm">
                <table className="min-w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-gray-100">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-gray-50/70 transition-colors">{children}</tr>;
          },
          th({ children, ...props }: any) {
            return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>;
          },
          td({ children, ...props }: any) {
            return <td className="px-3 py-2 text-gray-700 align-top" {...props}>{children}</td>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="pl-4 border-l-4 border-purple-400 bg-purple-50/60 rounded-r-lg py-1.5 pr-2 my-3 text-gray-600 not-italic">
                {children}
              </blockquote>
            );
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2.5 pb-1.5 border-b border-gray-200 leading-tight">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold text-gray-800 mt-4 mb-2 leading-tight">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-gray-800 mt-3 mb-1.5 leading-tight">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-sm font-semibold text-gray-700 mt-2.5 mb-1 leading-tight">{children}</h4>;
          },
          h5({ children }) {
            return <h5 className="text-sm font-medium text-gray-700 mt-2 mb-0.5">{children}</h5>;
          },
          h6({ children }) {
            return <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-0.5">{children}</h6>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-0.5 text-gray-700">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-0.5 text-gray-700">{children}</ol>;
          },
          li({ children }) {
            return <li className="pl-0.5 leading-relaxed">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-500 font-medium transition-colors"
              >
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="max-w-full h-auto rounded-xl my-3 border border-gray-200 shadow-sm"
              />
            );
          },
          hr() {
            return <hr className="my-4 border-gray-200" />;
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed text-gray-800 text-sm">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-gray-900">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-gray-700">{children}</em>;
          },
          del({ children }) {
            return <del className="line-through text-gray-400">{children}</del>;
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {isStreaming && <span className="inline-block w-1 h-4 bg-purple-500 rounded-sm ml-0.5 animate-pulse" style={{ verticalAlign: 'text-bottom' }} />}
    </div>
  );
});

// ==================== Message Component ====================

const MessageBubble: React.FC<{
  message: ChatMessage;
  isStreaming?: boolean;
  isKb?: boolean;
  onQuote?: (content: string) => void;
}> = React.memo(({ message, isStreaming, isKb, onQuote }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timeStr = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm">
          <User className="w-4 h-4 text-white" />
        </div>
      ) : (
        isKb ? <KBAvatar /> : <AIAvatar />
      )}

      {/* Content */}
      <div className={`flex-1 min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {isUser ? (
          // User bubble
          <div className="max-w-[80%]">
            <div className="px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
              <p className="whitespace-pre-wrap text-sm text-white leading-relaxed">{message.content}</p>
            </div>
            <div className="mt-1 flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onQuote && (
                <button
                  onClick={() => onQuote(message.content)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                  title="引用此消息"
                >
                  <Quote className="w-3 h-3" />
                  <span>引用</span>
                </button>
              )}
              <span className="text-[11px] text-gray-400">{timeStr}</span>
            </div>
          </div>
        ) : (
          // AI bubble
          <div className="max-w-[92%] w-full">
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
              {isStreaming && !message.content ? (
                <div className="flex items-center gap-1.5 h-5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '160ms' }} />
                  <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '320ms' }} />
                </div>
              ) : (
                <MarkdownContent content={message.content} isStreaming={isStreaming} />
              )}
            </div>
            {!isStreaming && (
              <div className="mt-1.5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {copied ? <><Check className="w-3 h-3 text-green-500" /><span className="text-green-600">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
                </button>
                {onQuote && (
                  <button
                    onClick={() => onQuote(message.content)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                    title="引用此消息"
                  >
                    <Quote className="w-3 h-3" />
                    <span>引用</span>
                  </button>
                )}
                <span className="text-[11px] text-gray-300">{timeStr}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.content === nextProps.message.content &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.isKb === nextProps.isKb;
});

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
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h3 className="font-semibold text-gray-800">Chat 设置</h3>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
            <option value="zenmux">Zenmux</option>
            <option value="gemini">Google</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="zhipu">智谱 GLM</option>
            <option value="moonshot">月之暗面</option>
            <option value="minimax">MiniMax</option>
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

        {/* Base URL (for custom/ollama/zenmux) */}
        {(localConfig.provider === 'custom' || localConfig.provider === 'ollama' || localConfig.provider === 'zenmux') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Base URL</label>
            <input
              type="text"
              value={localConfig.baseUrl || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, baseUrl: e.target.value })}
              placeholder={
                localConfig.provider === 'zenmux' ? 'https://zenmux.ai/api/v1' :
                localConfig.provider === 'ollama' ? 'http://localhost:11434/v1' : 
                'https://api.example.com/v1'
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            模型 {localConfig.provider === 'zenmux' && <span className="text-xs text-gray-500">({models.length} 个可用)</span>}
          </label>
          {models.length > 0 ? (
            <select
              value={localConfig.model}
              onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              {localConfig.provider === 'zenmux' ? (
                // Zenmux 模型按类别分组显示
                (() => {
                  const grouped: Record<string, typeof models> = {};
                  models.forEach((m: any) => {
                    const category = m.category || '其他';
                    if (!grouped[category]) grouped[category] = [];
                    grouped[category].push(m);
                  });
                  
                  return Object.entries(grouped).map(([category, categoryModels]) => (
                    <optgroup key={category} label={`━━ ${category} ━━`}>
                      {categoryModels.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.description ? `(${m.description})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()
              ) : (
                // 其他 provider 正常显示
                models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              )}
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

        {/* Keyboard Shortcut Hint */}
        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            💡 发送快捷键：⌘/Ctrl + Enter 发送，Enter 换行
          </p>
        </div>
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

// ==================== System Prompt Panel ====================

const SKILLS_STORAGE_KEY = 'linkmaster_prompts_v1';

const SystemPromptPanel: React.FC<{
  conversation: ChatConversation | undefined;
  globalPrompt: string;
  onApply: (prompt: string) => void;
  onClose: () => void;
}> = ({ conversation, globalPrompt, onApply, onClose }) => {
  const [promptText, setPromptText] = useState(
    conversation?.systemPrompt !== undefined ? conversation.systemPrompt : (globalPrompt || '')
  );
  const [skills, setSkills] = useState<PromptRecord[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SKILLS_STORAGE_KEY);
      if (stored) setSkills(JSON.parse(stored));
    } catch {}
  }, []);

  const filtered = skills.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.content.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const hasCustomPrompt = conversation?.systemPrompt !== undefined;
  const isUsingCustom = hasCustomPrompt && conversation!.systemPrompt !== '';

  return (
    <div className="absolute inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800 text-sm leading-tight">本轮对话定制预设词</h3>
            <p className="text-[10px] text-gray-400 leading-tight">
              {isUsingCustom ? '🟣 已启用自定义预设' : hasCustomPrompt ? '⚪ 已清除预设（无系统提示）' : '🔵 使用全局默认'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Prompt editor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">预设词内容</label>
            {globalPrompt && (
              <button
                onClick={() => setPromptText(globalPrompt)}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                填入全局默认
              </button>
            )}
          </div>
          <textarea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            placeholder={globalPrompt ? `全局默认: ${globalPrompt.substring(0, 60)}...` : '输入系统预设词，例如：你是一位专业的前端工程师，请用简洁的技术语言回答...'}
            rows={6}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-300 focus:border-purple-400 outline-none resize-none leading-relaxed text-gray-800 placeholder-gray-300"
          />
          <p className="text-[11px] text-gray-400 mt-1">此预设词仅对当前对话生效，不影响其他对话和全局设置。</p>
        </div>

        {/* Skills picker */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">从 Skills 库选择</label>
          {skills.length === 0 ? (
            <div className="text-center py-6 text-gray-300 text-sm border border-dashed border-gray-200 rounded-xl">
              <Wand2 className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
              Skills 库为空，请先在 Skills 模块添加内容
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索 Skills..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-300"
                />
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">没有匹配的 Skill</p>
                ) : (
                  filtered.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => setPromptText(skill.content)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all group ${
                        promptText === skill.content
                          ? 'border-purple-300 bg-purple-50'
                          : 'border-gray-100 hover:border-purple-200 hover:bg-purple-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${promptText === skill.content ? 'text-purple-700' : 'text-gray-800 group-hover:text-purple-600'}`}>
                            {skill.title}
                          </p>
                          {skill.description && (
                            <p className="text-xs text-gray-400 truncate mt-0.5">{skill.description}</p>
                          )}
                        </div>
                        {skill.category && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">
                            {skill.category}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-100 flex gap-2.5">
        <button
          onClick={() => { onApply('__RESET__'); onClose(); }}
          className="px-4 py-2 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 text-sm transition-colors"
          title="恢复使用全局默认系统提示词"
        >
          恢复默认
        </button>
        <button
          onClick={() => { onApply(promptText); onClose(); }}
          className="flex-1 py-2 font-medium text-sm rounded-xl text-white transition-colors"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)' }}
        >
          应用到此对话
        </button>
      </div>
    </div>
  );
};

// ==================== Scroll Navigation Track ====================

const ScrollNavTrack: React.FC<{
  turns: ChatMessage[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  msgRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  isKb?: boolean;
}> = ({ turns, containerRef, msgRefs, isKb }) => {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => {
      const mid = container.scrollTop + container.clientHeight / 2;
      let best = 0;
      turns.forEach((t, i) => {
        const el = msgRefs.current.get(t.id);
        if (el && el.offsetTop <= mid) best = i;
      });
      setActiveIdx(best);
    };
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, [containerRef, turns, msgRefs]);

  const validTurns = turns.filter(t => t.id !== 'kb-welcome');
  if (validTurns.length <= 1) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col py-3 items-center gap-0.5" style={{ zIndex: 5 }}>
      {validTurns.map((t, i) => {
        const el = msgRefs.current.get(t.id);
        const container = containerRef.current;
        const topPct = el && container
          ? `${Math.min(96, (el.offsetTop / container.scrollHeight) * 100)}%`
          : `${(i / validTurns.length) * 100}%`;
        const isActive = i === activeIdx;
        return (
          <button
            key={t.id}
            className="absolute left-1/2 -translate-x-1/2 group/dot"
            style={{ top: topPct }}
            title={t.content.substring(0, 50)}
            onClick={() => {
              msgRefs.current.get(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <div
              className={`rounded-full transition-all duration-150 ${
                isActive
                  ? (isKb ? 'w-1.5 h-3 bg-green-500' : 'w-1.5 h-3 bg-purple-500')
                  : (isKb ? 'w-1 h-1.5 bg-green-200 group-hover/dot:bg-green-400 group-hover/dot:h-2.5' : 'w-1 h-1.5 bg-gray-200 group-hover/dot:bg-purple-300 group-hover/dot:h-2.5')
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};

// ==================== KB Conversation Types ====================
interface KbConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY_KB_CONVERSATIONS = 'guyue_kb_conversations_v1';
const loadKbConversations = (): KbConversation[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_CONVERSATIONS);
    if (saved) return JSON.parse(saved);
    return [];
  } catch { return []; }
};
const createNewKbConversation = (): KbConversation => ({
  id: crypto.randomUUID(),
  title: '新知识库对话',
  messages: [createKbWelcomeMessage()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ==================== Main ChatManager Component ====================

// 预设知识库标签颜色和图标
const PRESET_COLORS = [
  '#ef4444','#f97316','#f59e0b','#84cc16',
  '#22c55e','#10b981','#06b6d4','#3b82f6',
  '#8b5cf6','#ec4899','#64748b','#a8a29e',
];
const PRESET_ICONS = [
  'BookOpen','Code2','Lightbulb','Star',
  'Briefcase','FlaskConical','Globe','GraduationCap',
  'Heart','Zap','Database','Cpu',
  'Music','Camera','Tag','FileText',
];

export const ChatManager: React.FC<ChatManagerProps> = ({ compact = false, knowledgeBaseFileIds, kbTags = [], kbFileEntries = [], onSaveKbTags, onToggleKnowledgeBase, fileRecords }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CHAT_CONFIG);
  const [chatService, setChatService] = useState<ChatService | null>(null);
  
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showPromptPanel, setShowPromptPanel] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => !compact);
  const [layoutMode, setLayoutMode] = useState<'single' | 'split'>('single'); // single or split view
  const [showTerminal, setShowTerminal] = useState(false); // show terminal pane

  // ── Rename conversation ──
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── Scroll navigation refs ──
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Knowledge Base mode ──
  const [isKbMode, setIsKbMode] = useState(false);
  const [showKbSettings, setShowKbSettings] = useState(false);
  const [selectedKbTagIds, setSelectedKbTagIds] = useState<string[]>([]); // 空 = 全部
  const [showKbTagManager, setShowKbTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#10b981');
  const [newTagIcon, setNewTagIcon] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [editingTagColor, setEditingTagColor] = useState('');
  const [editingTagIcon, setEditingTagIcon] = useState('');
  const [kbEmbeddingKey, setKbEmbeddingKey] = useState(() => localStorage.getItem('guyue_rag_embedding_key') || '');
  const [kbEmbeddingBaseUrl, setKbEmbeddingBaseUrl] = useState(() => localStorage.getItem('guyue_rag_embedding_base_url') || '');
  const [isKbProcessing, setIsKbProcessing] = useState(false);
  const [kbConversations, setKbConversations] = useState<KbConversation[]>(() => loadKbConversations());
  const [activeKbConversationId, setActiveKbConversationId] = useState<string | null>(() => {
    const convs = loadKbConversations();
    return convs.length > 0 ? convs[0].id : null;
  });
    useEffect(() => {
      if (compact) {
        setShowSidebar(false);
        setLayoutMode('single');
        setShowTerminal(false);
      }
    }, [compact]);

  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto resize textarea based on content (max 4 lines)
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // First reset to auto to get true content height
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 120; // max 4 lines
      const minHeight = 36; // match settings button height
      // Set height based on content, clamped between min and max
      const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

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

  // Persist KB conversations
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_KB_CONVERSATIONS, JSON.stringify(kbConversations));
  }, [kbConversations]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingContent, conversations, kbConversations]);

  // Windows / Electron focus fix:
  // When textarea transitions from disabled→enabled (after streaming/kb processing),
  // the OS does NOT auto-restore focus on Windows. Manually refocus it.
  useEffect(() => {
    if (!isStreaming && !isKbProcessing) {
      // Use a short timeout so React finishes committing the disabled→enabled DOM change first.
      const t = setTimeout(() => textareaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isStreaming, isKbProcessing]);

  // Get active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeKbConversation = kbConversations.find(c => c.id === activeKbConversationId);

  // Handle new conversation
  const handleNewConversation = () => {
    const newConv = createNewConversation(config.model, config.systemPrompt);
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setInputValue('');
    setError(null);
  };

  // Handle new KB conversation
  const handleNewKbConversation = () => {
    const newConv = createNewKbConversation();
    setKbConversations(prev => [newConv, ...prev]);
    setActiveKbConversationId(newConv.id);
    setInputValue('');
  };

  // Handle delete KB conversation
  const handleDeleteKbConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个知识库对话吗？')) {
      setKbConversations(prev => {
        const remaining = prev.filter(c => c.id !== id);
        if (activeKbConversationId === id) {
          setActiveKbConversationId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    }
  };

  // Toggle mode: auto-create first KB conversation if needed
  const handleToggleKbMode = (value: boolean) => {
    setIsKbMode(value);
    if (value && kbConversations.length === 0) {
      const firstConv = createNewKbConversation();
      setKbConversations([firstConv]);
      setActiveKbConversationId(firstConv.id);
    } else if (value && !activeKbConversationId && kbConversations.length > 0) {
      setActiveKbConversationId(kbConversations[0].id);
    }
  };

  // Handle set conversation-level system prompt
  const handleSetConversationPrompt = (prompt: string) => {
    setConversations(prev => prev.map(c =>
      c.id === activeConversationId
        ? { ...c, systemPrompt: prompt === '__RESET__' ? undefined : prompt }
        : c
    ));
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

  // Handle rename conversation
  const handleStartRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingConvId(id);
    setRenameValue(title);
  };

  const handleFinishRename = (isKb = false) => {
    if (renamingConvId && renameValue.trim()) {
      if (isKb) {
        setKbConversations(prev => prev.map(c => c.id === renamingConvId ? { ...c, title: renameValue.trim() } : c));
      } else {
        setConversations(prev => prev.map(c => c.id === renamingConvId ? { ...c, title: renameValue.trim() } : c));
      }
    }
    setRenamingConvId(null);
    setRenameValue('');
  };

  // Handle quote message into input
  const handleQuoteMessage = useCallback((content: string) => {
    const quoted = '> ' + content.replace(/\n/g, '\n> ');
    setInputValue(prev => prev ? `${quoted}\n\n${prev}` : `${quoted}\n\n`);
    textareaRef.current?.focus();
  }, []);

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

    // Prepare messages for API (conversation prompt > global prompt)
    const effectiveSystemPrompt = conv!.systemPrompt !== undefined
      ? conv!.systemPrompt
      : (config.systemPrompt || '');
    const apiMessages: ChatMessage[] = effectiveSystemPrompt
      ? [{ id: 'system', role: 'system', content: effectiveSystemPrompt, timestamp: 0 }, ...updatedMessages]
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
          setIsStreaming(false);
          setStreamingContent('');
          // On 401 hint user to re-login via DataCenter > Zenmux
          if (config.provider === 'zenmux' && /401|unauthorized/i.test(err.message)) {
            setError('Token 已失效，请在「数据中心 → Zenmux」页面重新登录');
          } else {
            setError(err.message);
          }
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

  // ── KB mode handlers ──
  const handleSaveKbSettings = () => {
    localStorage.setItem('guyue_rag_embedding_key', kbEmbeddingKey.trim());
    localStorage.setItem('guyue_rag_embedding_base_url', kbEmbeddingBaseUrl.trim());
    setShowKbSettings(false);
  };

  const handleKbSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isKbProcessing) return;
    const embeddingApiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
    if (!embeddingApiKey) {
      setError('请先在设置中配置知识库 Embedding API Key（右下角设置→知识库）');
      return;
    }
    if (!chatService) return;

    // Ensure there's an active KB conversation
    let kbConv = activeKbConversation;
    if (!kbConv) {
      kbConv = createNewKbConversation();
      setKbConversations(prev => [kbConv!, ...prev]);
      setActiveKbConversationId(kbConv.id);
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmedInput, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    const placeholderMsg: ChatMessage = { id: assistantId, role: 'assistant' as const, content: '正在检索知识库...', timestamp: Date.now() };
    const prevMessages = kbConv.messages;
    setKbConversations(prev => prev.map(c => c.id === kbConv!.id
      ? { ...c, messages: [...c.messages, userMessage, placeholderMsg], updatedAt: Date.now() }
      : c
    ));
    setInputValue('');
    setIsKbProcessing(true);
    try {
      const embeddingBaseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
      // 按已选标签过滤：空 = 全部；否则只搜索包含任一所选标签的文件（或无标签文件）
      const kbFiles = (fileRecords || []).filter(f => {
        if (!(knowledgeBaseFileIds || new Set()).has(f.id)) return false;
        if (selectedKbTagIds.length === 0) return true;
        const entry = kbFileEntries.find(e => e.fileId === f.id);
        if (!entry) return true; // 老数据兼容
        if (entry.tagIds.length === 0) return selectedKbTagIds.includes('__uncat__');
        return selectedKbTagIds.some(tid => entry.tagIds.includes(tid));
      });
      let index = await loadRagIndex();
      // 记录索引构建进度，将警告/错误通过 setError 反馈给用户
      const indexProgressMessages: string[] = [];
      index = await buildIndex(kbFiles, index, embeddingApiKey, (msg) => {
        indexProgressMessages.push(msg);
        // 实时在状态消息中更新进度（仅索引中）
        if (msg.startsWith('正在索引')) {
          setKbConversations(prev => prev.map(c => c.id === kbConv!.id
            ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: `⏳ ${msg}` } : m) }
            : c
          ));
        }
      }, embeddingBaseUrl);
      // 若有索引失败/跳过，收集并通过 error 提示用户
      const indexErrors = indexProgressMessages.filter(m => m.startsWith('❌') || m.startsWith('⚠️'));
      if (indexErrors.length > 0) {
        setError(`索引警告：${indexErrors.join(' | ')}`);
      }
      await saveRagIndex(index);
      const results = await searchIndex(trimmedInput, index, embeddingApiKey, 5, embeddingBaseUrl);

      let contextBlock = '';
      if (results.length > 0) {
        const snippets = results.map((r, i) =>
          `### 片段 ${i + 1}（来源：${r.fileName}，相关度：${Math.round(r.score * 100)}%）\n${r.text}`
        ).join('\n\n');
        contextBlock = `\n\n## 知识库检索结果\n以下是与用户问题最相关的内容片段：\n\n${snippets}`;
      } else {
        contextBlock = '\n\n## 知识库检索结果\n未检索到与用户问题相关的内容。';
      }
      const kbSize = kbFiles.length;
      const fileListBlock = kbFiles.length > 0
        ? '\n\n## 知识库文件列表\n' + kbFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
        : '';
      const kbSystemPrompt = `你是「知识库助手」，专注于基于用户本地文件回答问题。\n\n## 规则\n1. 优先根据下方「知识库检索结果」中的内容回答，可以结合你自身知识进行补充和解释。\n2. 如果检索结果中没有相关内容，诚实告知用户知识库中未找到，但你仍可以用自身知识尝试回答，需标注哪些是来自知识库、哪些是你的通用知识。\n3. 回答末尾标注引用来源，格式：📄 来源：文件名。\n4. 当前知识库共有 ${kbSize} 个文件（${kbFiles.length} 个有效），你**始终知道所有文件的名字**，见「知识库文件列表」。${fileListBlock}${contextBlock}`;

      setKbConversations(prev => prev.map(c => c.id === kbConv!.id
        ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: '正在生成回答...' } : m) }
        : c
      ));

      const historyMsgs = prevMessages.filter(m => m.role !== 'system' && m.id !== 'kb-welcome').slice(-6);
      const chatMessages: ChatMessage[] = [
        { id: 'system', role: 'system', content: kbSystemPrompt, timestamp: 0 },
        ...historyMsgs.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp })),
        { id: userMessage.id, role: 'user', content: userMessage.content, timestamp: userMessage.timestamp },
      ];
      const reply = await chatService.completeText(chatMessages);

      const isFirstUserMsg = prevMessages.filter(m => m.role === 'user').length === 0;
      const newTitle = isFirstUserMsg
        ? trimmedInput.substring(0, 30) + (trimmedInput.length > 30 ? '...' : '')
        : undefined;

      setKbConversations(prev => prev.map(c => c.id === kbConv!.id
        ? {
            ...c,
            title: newTitle || c.title,
            messages: c.messages.map(m => m.id === assistantId ? { ...m, content: reply || '未获得回复。' } : m),
            updatedAt: Date.now(),
          }
        : c
      ));
    } catch (err) {
      setKbConversations(prev => prev.map(c => c.id === kbConv!.id
        ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: `❌ 发生错误: ${err instanceof Error ? err.message : String(err)}` } : m) }
        : c
      ));
    } finally {
      setIsKbProcessing(false);
    }
  }, [inputValue, isKbProcessing, chatService, activeKbConversation, knowledgeBaseFileIds, fileRecords]);

  // Handle config update
  const handleUpdateConfig = (newConfig: ChatConfig) => {
    setConfig(newConfig);
    setChatService(new ChatService(newConfig));
  };

  // Handle key press: Cmd+Enter to send, Enter for newline
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (isKbMode) { handleKbSend(); } else { handleSend(); }
    }
  };

  // Render empty state
  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
      <div className="relative mb-8">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 50%, #db2777 100%)' }}
        >
          <Sparkles className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-400 rounded-full border-2 border-white flex items-center justify-center shadow-md">
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">开始对话</h2>
      <p className="text-gray-400 text-center max-w-sm mb-8 text-sm leading-relaxed">
        选择一个建议快速开始，或者用自己的语言就可以。
      </p>
      <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
        {[
          { icon: '\uD83D\uDCBB', label: '帮我写一段代码' },
          { icon: '\uD83D\uDCD6', label: '解释一个概念' },
          { icon: '\uD83C\uDF0D', label: '翻译一段文本' },
          { icon: '\u2728', label: '头脑风暴开始' },
        ].map(({ icon, label }) => (
          <button
            key={label}
            onClick={() => setInputValue(label)}
            className="flex items-center gap-2 px-3 py-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300 hover:shadow-sm rounded-xl text-sm text-gray-700 transition-all group text-left"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-gray-50/80 relative">
      {/* ======================== Sidebar ======================== */}
      {showSidebar && (
        <div className={`w-72 bg-white border-r flex flex-col shadow-sm ${isKbMode ? 'border-green-100' : 'border-gray-100'}`}>
          {isKbMode ? (
            <>
              {/* KB Sidebar Header */}
              <div className="h-14 border-b border-green-100 flex items-center justify-between px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <KBAvatar size="sm" />
                  <span className="font-semibold text-gray-800 text-sm">知识库对话</span>
                </div>
                <button
                  onClick={handleNewKbConversation}
                  className="p-1.5 hover:bg-green-50 rounded-lg text-gray-500 hover:text-green-600 transition-colors"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  title="新建知识库对话"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* KB Conversation List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {kbConversations.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-12">
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    暂无知识库对话
                  </div>
                ) : (
                  kbConversations.map((conv) => {
                    const isActive = activeKbConversationId === conv.id;
                    const isRenaming = renamingConvId === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveKbConversationId(conv.id)}
                        className={`
                          w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left group transition-all
                          ${isActive
                            ? 'bg-green-50 text-green-700 shadow-sm'
                            : 'hover:bg-gray-50 text-gray-700'
                          }
                        `}
                      >
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => handleFinishRename(true)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleFinishRename(true);
                                if (e.key === 'Escape') { setRenamingConvId(null); setRenameValue(''); }
                                e.stopPropagation();
                              }}
                              onClick={e => e.stopPropagation()}
                              className="w-full text-sm bg-white border border-green-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-green-400"
                            />
                          ) : (
                            <p className="text-sm font-medium truncate">{conv.title}</p>
                          )}
                        </div>
                        {!isRenaming && (
                          <>
                            <button
                              onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                              className="p-1 mt-0.5 opacity-0 group-hover:opacity-100 hover:bg-green-50 hover:text-green-600 rounded-lg transition-all flex-shrink-0"
                              title="重命名"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteKbConversation(conv.id, e)}
                              className="p-1 mt-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* KB Sidebar Footer */}
              <div className="p-3 border-t border-green-100 relative">
                {showKbSettings && (
                  <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-lg border border-green-100 p-3 space-y-2.5 z-50">
                    <div className="text-xs font-semibold text-gray-500 mb-1">知识库设置</div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Embedding API Key</label>
                      <input
                        type="password"
                        value={kbEmbeddingKey}
                        onChange={e => setKbEmbeddingKey(e.target.value)}
                        placeholder="AIzaSy...（当前仅支持 Gemini Embedding）"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900 font-mono outline-none focus:ring-2 focus:ring-green-500/20"
                      />
                      <p className="text-[10px] text-gray-400 mt-0.5">AI 对话已支持 Kimi；知识库向量化目前仍使用 Gemini Embedding。</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Embedding Base URL</label>
                      <input
                        type="text"
                        value={kbEmbeddingBaseUrl}
                        onChange={e => setKbEmbeddingBaseUrl(e.target.value)}
                        placeholder="留空使用官方地址"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-900 font-mono outline-none focus:ring-2 focus:ring-green-500/20"
                      />
                    </div>
                    <button
                      onClick={handleSaveKbSettings}
                      className="w-full px-3 py-1.5 text-xs bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                    >
                      保存
                    </button>
                  </div>
                )}
                {/* 标签管理 */}
                <button
                  onClick={() => setShowKbTagManager(v => !v)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded-xl transition-colors text-sm"
                >
                  <Tag className="w-4 h-4" />
                  <span>标签管理</span>
                  {kbTags.length > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-green-100 text-green-600 rounded-full font-medium">{kbTags.length}</span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform ${showKbTagManager ? 'rotate-180' : ''} ${kbTags.length > 0 ? '' : 'ml-auto'}`} />
                </button>
                {showKbTagManager && (
                  <div className="mx-1 mb-1 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {/* 标签列表 */}
                    <div className="divide-y divide-gray-100">
                      {kbTags.length === 0 && (
                        <div className="px-3 py-3 text-xs text-gray-400 text-center">暂无标签，在下方新建</div>
                      )}
                      {kbTags.map(tag => (
                        editingTagId === tag.id ? (
                          <div key={tag.id} className="px-2.5 py-2 bg-green-50/70 border-b border-green-100 space-y-1.5">
                            {/* 名称行 */}
                            <div className="flex items-center gap-2">
                              <span
                                className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/10"
                                style={{ background: editingTagColor }}
                              >
                                {editingTagIcon && (() => {
                                  const TIcon = (LucideIcons as any)[editingTagIcon];
                                  return TIcon ? <TIcon className="w-3 h-3 text-white" /> : null;
                                })()}
                              </span>
                              <input
                                autoFocus
                                value={editingTagName}
                                onChange={e => setEditingTagName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && editingTagName.trim()) {
                                    const updated = kbTags.map(t => t.id === tag.id ? { ...t, name: editingTagName.trim(), color: editingTagColor, icon: editingTagIcon || undefined } : t);
                                    onSaveKbTags?.(updated);
                                    setEditingTagId(null);
                                  }
                                  if (e.key === 'Escape') setEditingTagId(null);
                                }}
                                className="flex-1 text-xs px-2 py-1 border border-green-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-300/40"
                              />
                              <button
                                onClick={() => { const updated = kbTags.map(t => t.id === tag.id ? { ...t, name: editingTagName.trim(), color: editingTagColor, icon: editingTagIcon || undefined } : t); onSaveKbTags?.(updated); setEditingTagId(null); }}
                                className="p-1 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                              ><Check className="w-3 h-3" /></button>
                              <button
                                onClick={() => setEditingTagId(null)}
                                className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg transition-colors"
                              ><X className="w-3 h-3" /></button>
                            </div>
                            {/* 颜色色块 */}
                            <div className="grid grid-cols-6 gap-1">
                              {PRESET_COLORS.map(c => (
                                <button
                                  key={c}
                                  onClick={() => setEditingTagColor(c)}
                                  className={`w-5 h-5 rounded-full transition-all ${
                                    editingTagColor === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110'
                                  }`}
                                  style={{ background: c }}
                                />
                              ))}
                            </div>
                            {/* 图标选择 */}
                            <div className="grid grid-cols-6 gap-1">
                              <button
                                onClick={() => setEditingTagIcon('')}
                                className={`flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold transition-all ${
                                  !editingTagIcon ? 'bg-gray-300 text-gray-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                }`}
                                title="无图标"
                              >—</button>
                              {PRESET_ICONS.map(iconName => {
                                const TIcon = (LucideIcons as any)[iconName];
                                if (!TIcon) return null;
                                const active = editingTagIcon === iconName;
                                return (
                                  <button
                                    key={iconName}
                                    onClick={() => setEditingTagIcon(iconName)}
                                    className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${
                                      active ? 'ring-2 ring-green-400 scale-110' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                                    }`}
                                    style={active ? { background: editingTagColor + '28', color: editingTagColor } : {}}
                                    title={iconName}
                                  >
                                    <TIcon className="w-3 h-3" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div key={tag.id} className="flex items-center gap-2 px-2.5 py-2 group hover:bg-gray-50 transition-colors">
                            {(() => {
                              const TIcon = tag.icon ? (LucideIcons as any)[tag.icon] : null;
                              return (
                                <span
                                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/10"
                                  style={{ background: tag.color }}
                                >
                                  {TIcon && <TIcon className="w-3 h-3 text-white" />}
                                </span>
                              );
                            })()}
                            <span className="flex-1 text-xs text-gray-700 font-medium truncate">{tag.name}</span>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name); setEditingTagColor(tag.color); setEditingTagIcon(tag.icon || ''); }}
                                className="p-1 hover:bg-green-100 rounded-md text-gray-400 hover:text-green-600 transition-colors"
                                title="编辑"
                              ><Pencil className="w-3 h-3" /></button>
                              <button
                                onClick={() => onSaveKbTags?.(kbTags.filter(t => t.id !== tag.id))}
                                className="p-1 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors"
                                title="删除"
                              ><X className="w-3 h-3" /></button>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                    {/* 新增标签 */}
                    <div className="px-2.5 py-2 bg-gray-50 border-t border-gray-100 space-y-1.5">
                      {/* 名称行 */}
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center ring-1 ring-black/10 flex-none"
                          style={{ background: newTagColor }}
                        >
                          {newTagIcon && (() => {
                            const TIcon = (LucideIcons as any)[newTagIcon];
                            return TIcon ? <TIcon className="w-3 h-3 text-white" /> : null;
                          })()}
                        </span>
                        <input
                          value={newTagName}
                          onChange={e => setNewTagName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing && newTagName.trim()) {
                              const newTag: KbTag = { id: crypto.randomUUID(), name: newTagName.trim(), color: newTagColor, icon: newTagIcon || undefined };
                              onSaveKbTags?.([...kbTags, newTag]);
                              setNewTagName('');
                            }
                          }}
                          placeholder="新标签名称..."
                          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-green-300/40 focus:border-green-300 placeholder-gray-300"
                        />
                        <button
                          onClick={() => {
                            if (!newTagName.trim()) return;
                            const newTag: KbTag = { id: crypto.randomUUID(), name: newTagName.trim(), color: newTagColor, icon: newTagIcon || undefined };
                            onSaveKbTags?.([...kbTags, newTag]);
                            setNewTagName('');
                          }}
                          className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shrink-0"
                          title="添加标签"
                        ><Plus className="w-3 h-3" /></button>
                      </div>
                      {/* 颜色色块 */}
                      <div className="grid grid-cols-6 gap-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setNewTagColor(c)}
                            className={`w-5 h-5 rounded-full transition-all ${
                              newTagColor === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110'
                            }`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      {/* 图标选择 */}
                      <div className="grid grid-cols-6 gap-1">
                        <button
                          onClick={() => setNewTagIcon('')}
                          className={`flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold transition-all ${
                            !newTagIcon ? 'bg-gray-300 text-gray-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                          title="无图标"
                        >—</button>
                        {PRESET_ICONS.map(iconName => {
                          const TIcon = (LucideIcons as any)[iconName];
                          if (!TIcon) return null;
                          const active = newTagIcon === iconName;
                          return (
                            <button
                              key={iconName}
                              onClick={() => setNewTagIcon(iconName)}
                              className={`flex items-center justify-center w-5 h-5 rounded-md transition-all ${
                                active ? 'ring-2 ring-green-400 scale-110' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                              }`}
                              style={active ? { background: newTagColor + '28', color: newTagColor } : {}}
                              title={iconName}
                            >
                              <TIcon className="w-3 h-3" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowKbSettings(v => !v)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-500 hover:text-green-700 hover:bg-green-50 rounded-xl transition-colors text-sm"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>知识库设置</span>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Chat Sidebar Header */}
              <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <AIAvatar size="sm" />
                  <span className="font-semibold text-gray-800 text-sm">AI 助手</span>
                </div>
                <button
                  onClick={handleNewConversation}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-purple-600 transition-colors"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                  title="新建对话"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {conversations.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-12">
                    <MessageSquarePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    暂无对话记录
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const isActive = activeConversationId === conv.id;
                    const msgCount = conv.messages.length;
                    const dateStr = conv.updatedAt
                      ? new Date(conv.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
                      : '';
                    const isRenaming = renamingConvId === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setActiveConversationId(conv.id)}
                        className={`
                          w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left group transition-all
                          ${isActive
                            ? 'bg-purple-50 text-purple-700 shadow-sm'
                            : 'hover:bg-gray-50 text-gray-700'
                          }
                        `}
                      >
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => handleFinishRename(false)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleFinishRename(false);
                                if (e.key === 'Escape') { setRenamingConvId(null); setRenameValue(''); }
                                e.stopPropagation();
                              }}
                              onClick={e => e.stopPropagation()}
                              className="w-full text-sm bg-white border border-purple-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-purple-400"
                            />
                          ) : (
                            <p className="text-sm font-medium truncate">{conv.title}</p>
                          )}
                        </div>
                        {!isRenaming && (
                          <>
                            <button
                              onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                              className="p-1 mt-0.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-all flex-shrink-0"
                              title="重命名"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteConversation(conv.id, e)}
                              className="p-1 mt-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Sidebar Footer */}
              <div className="p-3 border-t border-gray-100">
                <button
                  onClick={() => setShowSettings(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors text-sm"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>设置</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======================== Main Chat Area ======================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 bg-white/90 backdrop-blur-sm" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
              title={showSidebar ? '隐藏侧边栏' : '显示侧边栏'}
            >
              {showSidebar ? <PanelLeftClose className="w-4.5 h-4.5" /> : <PanelLeftOpen className="w-4.5 h-4.5" />}
            </button>
            <div className="h-5 w-px bg-gray-200 mx-1" />
            {isKbMode ? <KBAvatar size="sm" /> : <AIAvatar size="sm" />}
            <span className="font-semibold text-gray-800 text-sm">
              {isKbMode ? (activeKbConversation?.title || '知识库助手') : (activeConversation?.title || 'AI 助手')}
            </span>
          </div>

          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* KB mode header buttons */}
            {isKbMode && (
              <>
                {(knowledgeBaseFileIds?.size || 0) > 0 && (
                  <span className="text-xs px-2.5 py-0.5 bg-green-50 text-green-600 border border-green-100 rounded-full flex items-center gap-1 shrink-0">
                    <Brain className="w-3 h-3" />{knowledgeBaseFileIds!.size} 个文件
                  </span>
                )}
                <button
                  onClick={() => {
                    if (activeKbConversationId) {
                      setKbConversations(prev => prev.map(c =>
                        c.id === activeKbConversationId ? { ...c, messages: [createKbWelcomeMessage()] } : c
                      ));
                    }
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="清空知识库对话"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            {/* Chat mode buttons */}
            {!isKbMode && !compact && (
              <>
                {/* Web Search Toggle */}
                {(config.provider === 'gemini' || config.provider === 'zenmux') && (
                  <button
                    onClick={() => {
                      const newConfig = { ...config, enableWebSearch: !config.enableWebSearch };
                      setConfig(newConfig);
                      chatService?.updateConfig(newConfig);
                      saveChatConfig(newConfig);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      config.enableWebSearch
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title={config.enableWebSearch ? '联网搜索已启用' : '点击启用联网搜索'}
                  >
                    <Globe className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="px-2.5 py-1 bg-purple-50 text-purple-600 rounded-full text-[11px] font-medium border border-purple-100 max-w-[160px] truncate">
                  {config.model.split('/').pop() || config.model}
                </div>
                {/* Per-conversation System Prompt */}
                <button
                  onClick={() => setShowPromptPanel(true)}
                  className={`p-1.5 rounded-lg transition-colors relative ${
                    activeConversation?.systemPrompt !== undefined && activeConversation.systemPrompt !== ''
                      ? 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                      : 'text-purple-400 hover:text-purple-600 hover:bg-purple-50'
                  }`}
                  title={activeConversation?.systemPrompt !== undefined ? '已设置本轮对话定制预设词（点击编辑）' : '为此对话设置预设词'}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsHelpOpen(true)}
                  className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                  title="使用帮助"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setLayoutMode(layoutMode === 'single' ? 'split' : 'single')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    layoutMode === 'split'
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                  title={layoutMode === 'split' ? '退出分屏' : '分屏模式'}
                >
                  <Columns className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => setShowTerminal(!showTerminal)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showTerminal
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                  title={showTerminal ? '隐藏终端' : '显示终端'}
                >
                  <Square className="w-4.5 h-4.5" />
                </button>
              </>
            )}
            {/* KB mode: no inline settings popover — KB settings now live in the main SettingsModal */}
            {/* Mode Toggle Pill */}
            {!compact && (
              <div className="flex items-center ml-1.5 bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => handleToggleKbMode(false)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    !isKbMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  AI 对话
                </button>
                <button
                  onClick={() => handleToggleKbMode(true)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                    isKbMode ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Brain className="w-3 h-3" />
                  知识库
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className={`flex-1 flex overflow-hidden`}>
            {/* Left Chat Pane */}
            <div className={layoutMode === 'split' ? 'w-1/2 border-r border-gray-100 flex flex-col overflow-hidden' : 'flex-1 flex flex-col overflow-hidden'}>
              {/* Messages Area + Nav Track */}
              <div className="flex-1 relative overflow-hidden">
                <div ref={messagesContainerRef} className="absolute inset-0 overflow-y-auto px-6 py-5 space-y-5 pr-7">
                {isKbMode ? (
                  <>
                    {(activeKbConversation?.messages || []).map((msg) => (
                      <div
                        key={msg.id}
                        ref={msg.role === 'user' ? (el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); } : undefined}
                      >
                        <MessageBubble message={msg} isKb onQuote={handleQuoteMessage} />
                      </div>
                    ))}
                    {isKbProcessing && (
                      <div className="flex gap-3">
                        <KBAvatar />
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: '160ms' }} />
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '320ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                ) : !activeConversation || activeConversation.messages.length === 0 ? (
                  renderEmptyState()
                ) : (
                  <>
                    {activeConversation.messages.map((msg) => (
                      <div
                        key={msg.id}
                        ref={msg.role === 'user' ? (el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); } : undefined}
                      >
                        <MessageBubble message={msg} onQuote={handleQuoteMessage} />
                      </div>
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

                    {/* Waiting for first token */}
                    {isStreaming && !streamingContent && (
                      <div className="flex gap-3">
                        <AIAvatar />
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '160ms' }} />
                            <span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '320ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </>
                )}
                </div>

                {/* Scroll Navigation Track */}
                <ScrollNavTrack
                  turns={isKbMode
                    ? (activeKbConversation?.messages || []).filter(m => m.role === 'user')
                    : (activeConversation?.messages || []).filter(m => m.role === 'user')
                  }
                  containerRef={messagesContainerRef}
                  msgRefs={msgRefs}
                  isKb={isKbMode}
                />
              </div>

              {/* Error Banner */}
              {error && (
                <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs flex-1">{error}</span>
                  <button onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded-lg">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Input Area */}
              <div className={`p-4 border-t border-gray-100 ${isKbMode ? 'bg-green-50/30' : 'bg-white'}`}>
                <div className={`flex items-end gap-2 border rounded-2xl px-4 py-3 transition-all shadow-sm ${
                  isKbMode
                    ? 'bg-white border-green-200 hover:border-green-300 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100'
                    : 'bg-gray-50 border-gray-200 hover:border-purple-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100'
                }`}>
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      requestAnimationFrame(() => {
                        if (textareaRef.current) {
                          textareaRef.current.style.height = 'auto';
                          const scrollHeight = textareaRef.current.scrollHeight;
                          const maxHeight = 120;
                          const minHeight = 36;
                          const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
                          textareaRef.current.style.height = `${newHeight}px`;
                        }
                      });
                    }}
                    onKeyDown={handleKeyPress}
                    placeholder={isKbMode ? '向知识库提问...' : '输入消息，按 Enter 发送...'}
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 overflow-y-auto"
                    style={{ height: '36px', maxHeight: '120px', minHeight: '36px' }}
                    disabled={isStreaming || isKbProcessing}
                  />
                  {isStreaming ? (
                    <button
                      onClick={handleStop}
                      className="flex-shrink-0 p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-sm"
                      title="停止生成"
                    >
                      <StopCircle className="w-4.5 h-4.5" />
                    </button>
                  ) : (
                    <button
                      onClick={isKbMode ? handleKbSend : handleSend}
                      disabled={!inputValue.trim() || isKbProcessing}
                      className={`flex-shrink-0 p-2 rounded-xl transition-all shadow-sm ${
                        inputValue.trim() && !isKbProcessing
                          ? 'text-white hover:opacity-90 active:scale-95'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      style={inputValue.trim() && !isKbProcessing ? { background: isKbMode ? 'linear-gradient(135deg, #16a34a 0%, #059669 100%)' : 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' } : {}}
                      title="发送"
                    >
                      <Send className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
                {isKbMode && kbTags.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-xs text-gray-400 shrink-0">范围：</span>
                    <button
                      onClick={() => setSelectedKbTagIds([])}
                      className={`text-xs px-2.5 py-0.5 rounded-full border transition-all font-medium ${
                        selectedKbTagIds.length === 0
                          ? 'bg-green-500 text-white border-green-500 shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                      }`}
                    >全部</button>
                    {kbTags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedKbTagIds(prev =>
                          prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                        )}
                        className={`text-xs px-2.5 py-0.5 rounded-full border transition-all font-medium flex items-center gap-1 ${
                          selectedKbTagIds.includes(tag.id)
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                        }`}
                        style={selectedKbTagIds.includes(tag.id) ? { background: tag.color, borderColor: tag.color } : {}}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: selectedKbTagIds.includes(tag.id) ? 'rgba(255,255,255,0.75)' : tag.color }}
                        />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-300 text-center mt-1.5">Cmd+Enter 发送 · Enter 换行</p>
              </div>
            </div>

            {/* Right Pane - Split View */}
            {layoutMode === 'split' && (
              <div className="w-1/2 flex flex-col bg-gray-50">
                {showTerminal ? (
                  <div className="flex-1 bg-gray-900">
                    <TerminalComponent />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-300 p-6">
                    <div className="text-center">
                      <Columns className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">分屏模式</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Terminal Pane */}
          {showTerminal && layoutMode !== 'split' && (
            <div className="h-1/3 border-t border-gray-200 bg-gray-900">
              <TerminalComponent />
            </div>
          )}
        </div>
      </div>

      {/* System Prompt Panel */}
      {showPromptPanel && (
        <SystemPromptPanel
          conversation={activeConversation}
          globalPrompt={config.systemPrompt || ''}
          onApply={handleSetConversationPrompt}
          onClose={() => setShowPromptPanel(false)}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          config={config}
          onUpdateConfig={handleUpdateConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        appMode="chat"
      />
    </div>
  );
};

export default ChatManager;
