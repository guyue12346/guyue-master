import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquarePlus, Send, Settings2, Trash2, StopCircle, Copy, Check,
  ChevronDown, Bot, User, Sparkles, AlertCircle, Loader2, Plus, X,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Download, Globe, Columns, Square, Zap, Wand2, Search, HelpCircle
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
import { PromptRecord } from '../types';
import { HelpModal } from './HelpModal';

interface ChatManagerProps {
  compact?: boolean;
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

// ==================== Markdown Renderer ====================
const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = React.memo(({ content, isStreaming }) => {
  const displayContent = normalizeMarkdownContent(content);
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, [remarkBreaks], remarkGithubBlockquoteAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
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
}> = React.memo(({ message, isStreaming }) => {
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
        <AIAvatar />
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
         prevProps.isStreaming === nextProps.isStreaming;
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

        {/* Web Search Toggle (Gemini/Zenmux) */}
        {(localConfig.provider === 'gemini' || localConfig.provider === 'zenmux') && (
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">联网搜索</label>
              <p className="text-xs text-gray-500 mt-0.5">
                {localConfig.provider === 'gemini' ? '启用 Google Search 实时搜索' : '启用 Web Search 实时搜索'}
              </p>
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
            <h3 className="font-semibold text-gray-800 text-sm leading-tight">对话预设词</h3>
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

// ==================== Main ChatManager Component ====================

export const ChatManager: React.FC<ChatManagerProps> = ({ compact = false }) => {
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
        <div className="w-72 bg-white border-r border-gray-100 flex flex-col shadow-sm">
          {/* Sidebar Header */}
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
                      <p className="text-sm font-medium truncate">{conv.title}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="p-1 mt-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 rounded-lg transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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
        </div>
      )}

      {/* ======================== Main Chat Area ======================== */}
      <div className="flex-1 flex flex-col min-w-0">
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
            <AIAvatar size="sm" />
            <span className="font-semibold text-gray-800 text-sm">
              {activeConversation?.title || 'AI 助手'}
            </span>
          </div>

          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Web Search Toggle */}
            {!compact && (config.provider === 'gemini' || config.provider === 'zenmux') && (
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
                <span>{config.enableWebSearch ? '联网' : '离线'}</span>
              </button>
            )}
            {!compact && (
              <>
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
                  title={activeConversation?.systemPrompt !== undefined ? '已设置对话预设词（点击编辑）' : '为此对话设置预设词'}
                >
                  <Wand2 className="w-4 h-4" />
                  {activeConversation?.systemPrompt !== undefined && activeConversation.systemPrompt !== '' && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-purple-500 border border-white" />
                  )}
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
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className={`flex-1 flex overflow-hidden`}>
            {/* Left Chat Pane */}
            <div className={layoutMode === 'split' ? 'w-1/2 border-r border-gray-100 flex flex-col' : 'w-full flex flex-col'}>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
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
              <div className="p-4 bg-white border-t border-gray-100">
                <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 hover:border-purple-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 rounded-2xl px-4 py-3 transition-all shadow-sm">
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
                    placeholder="输入消息，按 Enter 发送..."
                    rows={1}
                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 overflow-y-auto"
                    style={{ height: '36px', maxHeight: '120px', minHeight: '36px' }}
                    disabled={isStreaming}
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
                      onClick={handleSend}
                      disabled={!inputValue.trim()}
                      className={`flex-shrink-0 p-2 rounded-xl transition-all shadow-sm ${
                        inputValue.trim()
                          ? 'text-white hover:opacity-90 active:scale-95'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      style={inputValue.trim() ? { background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' } : {}}
                      title="发送"
                    >
                      <Send className="w-4.5 h-4.5" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-300 text-center mt-1.5">Enter 发送 · Shift+Enter 换行</p>
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
