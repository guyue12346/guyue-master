import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquarePlus, Send, Settings2, Trash2, StopCircle, Copy, Check,
  ChevronDown, Bot, User, Sparkles, AlertCircle, Loader2, Plus, X,
  PanelLeftClose, PanelLeftOpen, RotateCcw, Download, Globe, Columns, Square, Zap, Wand2, Search, HelpCircle,
  Brain, Key, Pencil, Quote, Tag, Database, RefreshCw, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
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
import { buildIndex, loadRagIndex, saveRagIndex, searchIndex, checkIndexStatus, loadRagIndexMeta, saveRagIndexMeta, EMBEDDING_MODELS, EMBEDDING_PROVIDER_LABELS, EmbeddingConfig, RagIndexMeta } from '../utils/ragService';

const STORAGE_KEY_KB_MESSAGES = 'guyue_kb_agent_history';

export interface SavedChatApiConfig {
  id: string;
  label: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

const STORAGE_KEY_CHAT_API_CONFIGS = 'guyue_chat_api_profiles_v1';
const loadChatApiConfigs = (): SavedChatApiConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CHAT_API_CONFIGS);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};
const persistChatApiConfigs = (configs: SavedChatApiConfig[]) => {
  localStorage.setItem(STORAGE_KEY_CHAT_API_CONFIGS, JSON.stringify(configs));
};

const STORAGE_KEY_KB_API_CONFIGS = 'guyue_kb_api_profiles_v1';
const loadKbApiConfigs = (): SavedChatApiConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_API_CONFIGS);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};
const persistKbApiConfigs = (configs: SavedChatApiConfig[]) => {
  localStorage.setItem(STORAGE_KEY_KB_API_CONFIGS, JSON.stringify(configs));
};

// ── KB Embedding 配置持久化（旧单项，保留用于迁移） ──
const STORAGE_KEY_KB_EMBEDDING_CONFIG = 'guyue_kb_embedding_config_v1';
const loadKbEmbeddingConfig = (): EmbeddingConfig => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_EMBEDDING_CONFIG);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { provider: 'gemini', model: 'gemini-embedding-001', apiKey: '', baseUrl: '' };
};
const saveKbEmbeddingConfig = (config: EmbeddingConfig) => {
  localStorage.setItem(STORAGE_KEY_KB_EMBEDDING_CONFIG, JSON.stringify(config));
  localStorage.setItem('guyue_rag_embedding_key', config.apiKey);
  localStorage.setItem('guyue_rag_embedding_base_url', config.baseUrl || '');
};

// ── KB 对话模型配置持久化（旧单项，保留用于迁移） ──
const STORAGE_KEY_KB_CHAT_CONFIG = 'guyue_kb_chat_config_v1';
interface KbChatConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
}
const loadKbChatConfig = (): KbChatConfig | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_CHAT_CONFIG);
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
};
const saveKbChatConfig = (config: KbChatConfig) => {
  localStorage.setItem(STORAGE_KEY_KB_CHAT_CONFIG, JSON.stringify(config));
};

// ── Embedding 配置列表（新版多配置） ──
interface SavedEmbeddingProfile {
  id: string;
  label: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const STORAGE_KEY_KB_EMB_PROFILES = 'guyue_kb_emb_profiles_v1';
const STORAGE_KEY_KB_EMB_ACTIVE_ID = 'guyue_kb_emb_active_id';

const loadEmbeddingProfiles = (): SavedEmbeddingProfile[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_EMB_PROFILES);
    if (saved) return JSON.parse(saved);
  } catch {}
  // 迁移旧的单项配置
  try {
    const old = localStorage.getItem(STORAGE_KEY_KB_EMBEDDING_CONFIG);
    if (old) {
      const cfg: EmbeddingConfig = JSON.parse(old);
      if (cfg.apiKey) {
        return [{ id: 'migrated-default', label: '默认配置', provider: cfg.provider || 'gemini', model: cfg.model || 'gemini-embedding-001', apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }];
      }
    }
  } catch {}
  return [];
};
const persistEmbeddingProfiles = (profiles: SavedEmbeddingProfile[]) => {
  localStorage.setItem(STORAGE_KEY_KB_EMB_PROFILES, JSON.stringify(profiles));
};
const loadActiveEmbId = (): string => localStorage.getItem(STORAGE_KEY_KB_EMB_ACTIVE_ID) || '';
const persistActiveEmbId = (id: string) => localStorage.setItem(STORAGE_KEY_KB_EMB_ACTIVE_ID, id);

// ── KB Chat 配置列表（新版多配置） ──
interface SavedKbChatProfile {
  id: string;
  label: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const STORAGE_KEY_KB_CHAT_PROFILES = 'guyue_kb_chat_profiles_v1';
const STORAGE_KEY_KB_CHAT_ACTIVE_ID = 'guyue_kb_chat_active_id';

const loadKbChatProfiles = (): SavedKbChatProfile[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_KB_CHAT_PROFILES);
    if (saved) return JSON.parse(saved);
  } catch {}
  // 迁移旧的单项配置
  try {
    const old = localStorage.getItem(STORAGE_KEY_KB_CHAT_CONFIG);
    if (old) {
      const cfg: KbChatConfig = JSON.parse(old);
      if (cfg.apiKey) {
        return [{ id: 'migrated-chat-default', label: '默认对话配置', provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }];
      }
    }
  } catch {}
  return [];
};
const persistKbChatProfiles = (profiles: SavedKbChatProfile[]) => {
  localStorage.setItem(STORAGE_KEY_KB_CHAT_PROFILES, JSON.stringify(profiles));
};
const loadActiveKbChatId = (): string => localStorage.getItem(STORAGE_KEY_KB_CHAT_ACTIVE_ID) || '';
const persistActiveKbChatId = (id: string) => localStorage.setItem(STORAGE_KEY_KB_CHAT_ACTIVE_ID, id);

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

// ==================== User Avatar ====================
const getUserAvatar = () => {
  try { return localStorage.getItem('guyue_user_avatar') || ''; } catch { return ''; }
};
const UserAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-16 h-16' };
  const iconSizeMap = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-8 h-8' };
  const avatar = getUserAvatar();
  return avatar ? (
    <div className={`${sizeMap[size]} rounded-xl flex-shrink-0 overflow-hidden shadow-sm`}>
      <img src={avatar} alt="用户头像" className="w-full h-full object-cover" />
    </div>
  ) : (
    <div className={`${sizeMap[size]} rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm`}>
      <User className={`${iconSizeMap[size]} text-white`} />
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
        <UserAvatar />
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
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm border shadow-sm" style={{ background: 'var(--t-msg-ai-bg)', borderColor: 'var(--t-msg-ai-border)' }}>
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

const PROVIDER_LABELS: Record<string, string> = {
  zenmux: 'Zenmux', gemini: 'Google', openai: 'OpenAI', anthropic: 'Anthropic',
  deepseek: 'DeepSeek', zhipu: '智谱 GLM', moonshot: '月之暗面', minimax: 'MiniMax',
  ollama: 'Ollama (本地)', custom: '自定义 API',
};

const PROVIDER_MODEL_HINTS: Record<string, string[]> = {
  zenmux: ['代理 100+ 模型', 'GPT / Claude / Gemini / DeepSeek', 'Kimi / GLM / Qwen / Grok 等'],
  gemini: ['gemini-2.5-pro（旗舰）', 'gemini-2.5-flash / 2.5-flash-lite', 'gemini-2.0-flash / 2.0-flash-lite', 'gemini-1.5-pro / 1.5-flash'],
  openai: ['gpt-4.1 / 4.1-mini / 4.1-nano', 'gpt-4o / 4o-mini', 'o4-mini / o3 / o3-mini（推理）'],
  anthropic: ['claude-opus-4-5（最强）', 'claude-sonnet-4-5 / haiku-4-5', 'claude-3-7-sonnet（扩展思考）', 'claude-3-5-sonnet / 3-5-haiku'],
  deepseek: ['deepseek-chat（DeepSeek-V3）', 'deepseek-reasoner（DeepSeek-R1）'],
  zhipu: ['glm-4-plus / glm-4-air / glm-4-flash', 'glm-z1-air / glm-z1-flash（推理）'],
  moonshot: ['kimi-k2.5 / k2-turbo / k2-thinking', 'moonshot-v1-128k / v1-32k'],
  minimax: ['MiniMax-M2.5 / M2.5-highspeed', 'MiniMax-M2.1 / M2'],
  ollama: ['llama3.3 / qwen3 / deepseek-r1 / gemma3', '本地部署，可自定义模型'],
  custom: ['任意 OpenAI 兼容接口', '自定义 Base URL 与模型名称'],
};

const EMBEDDING_PROVIDER_HINTS: Record<string, string[]> = {
  gemini: ['gemini-embedding-exp-03-07（3072维，推荐）', 'text-embedding-004（768维，稳定）', 'gemini-embedding-001（768维，旧版）'],
  qwen: ['text-embedding-v3（1024维，推荐）', 'text-embedding-v2（1536维）', 'text-embedding-v1（1536维）'],
  openai: ['text-embedding-3-large（3072维，最强）', 'text-embedding-3-small（1536维，性价比）', 'text-embedding-ada-002（1536维）'],
  zhipu: ['embedding-3（2048维，最新）', 'embedding-2（1024维）'],
  'custom-openai': ['任意 OpenAI 兼容嵌入接口', '自定义 Base URL 与模型名称'],
};

const ProviderHint: React.FC<{ hints: string[] }> = ({ hints }) => (
  <span className="relative group inline-flex items-center ml-1 align-middle">
    <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 hover:bg-blue-100 hover:text-blue-500 text-[10px] font-bold flex items-center justify-center cursor-help leading-none select-none">?</span>
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[300] hidden group-hover:block bg-gray-800 text-white text-[11px] rounded-lg px-2.5 py-2 w-56 shadow-xl pointer-events-none whitespace-nowrap">
      <ul className="space-y-0.5">
        {hints.map((h, i) => <li key={i} className="text-gray-200">{h}</li>)}
      </ul>
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
    </span>
  </span>
);

const maskApiKey = (key: string) => {
  if (!key) return '';
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.slice(0, 4) + '*'.repeat(8) + key.slice(-4);
};

const SettingsPanel: React.FC<{
  config: ChatConfig;
  onUpdateConfig: (config: ChatConfig) => void;
  onClose: () => void;
}> = ({ config, onUpdateConfig, onClose }) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [savedApiConfigs, setSavedApiConfigs] = useState<SavedChatApiConfig[]>(() => loadChatApiConfigs());
  const [selectedApiConfigId, setSelectedApiConfigId] = useState<string>(() => {
    const configs = loadChatApiConfigs();
    return configs.find(c => c.apiKey === config.apiKey && c.provider === config.provider)?.id || '';
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formProvider, setFormProvider] = useState<ChatConfig['provider']>('zenmux');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');

  const applyConfig = (item: SavedChatApiConfig) => {
    const provider = item.provider as ChatConfig['provider'];
    const nextModel = AVAILABLE_MODELS[provider]?.some((m: any) => m.id === localConfig.model)
      ? localConfig.model
      : AVAILABLE_MODELS[provider]?.[0]?.id || '';
    setSelectedApiConfigId(item.id);
    setLocalConfig({ ...localConfig, provider, model: nextModel, apiKey: item.apiKey, baseUrl: item.baseUrl || '' });
  };

  const startEdit = (item: SavedChatApiConfig) => {
    setEditingId(item.id);
    setFormLabel(item.label);
    setFormProvider(item.provider as ChatConfig['provider']);
    setFormApiKey(item.apiKey);
    setFormBaseUrl(item.baseUrl || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormLabel(''); setFormProvider('zenmux'); setFormApiKey(''); setFormBaseUrl('');
  };

  const handleAdd = () => {
    if (!formLabel.trim() || !formApiKey.trim()) return;
    const newItem: SavedChatApiConfig = {
      id: crypto.randomUUID(), label: formLabel.trim(), provider: formProvider,
      apiKey: formApiKey.trim(), baseUrl: formBaseUrl.trim() || '',
    };
    const next = [...savedApiConfigs, newItem];
    setSavedApiConfigs(next);
    persistChatApiConfigs(next);
    applyConfig(newItem);
    cancelEdit();
  };

  const handleSaveEdit = () => {
    if (!editingId || !formLabel.trim() || !formApiKey.trim()) return;
    const updated: SavedChatApiConfig = {
      id: editingId, label: formLabel.trim(), provider: formProvider,
      apiKey: formApiKey.trim(), baseUrl: formBaseUrl.trim() || '',
    };
    const next = savedApiConfigs.map(c => c.id === editingId ? updated : c);
    setSavedApiConfigs(next);
    persistChatApiConfigs(next);
    if (selectedApiConfigId === editingId) applyConfig(updated);
    cancelEdit();
  };

  const handleDelete = (id: string) => {
    const next = savedApiConfigs.filter(c => c.id !== id);
    setSavedApiConfigs(next);
    persistChatApiConfigs(next);
    if (selectedApiConfigId === id) setSelectedApiConfigId('');
    if (editingId === id) cancelEdit();
  };

  const handleSave = () => {
    onUpdateConfig(localConfig);
    saveChatConfig(localConfig);
    onClose();
  };

  const isEditing = editingId !== null;
  const formNeedsBaseUrl = formProvider === 'custom' || formProvider === 'ollama' || formProvider === 'zenmux';
  const models = AVAILABLE_MODELS[localConfig.provider] || [];

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--t-bg-main)' }}>
      <div className="h-14 border-b flex items-center justify-between px-4 shrink-0" style={{ borderColor: 'var(--t-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h3 className="font-semibold" style={{ color: 'var(--t-text)' }}>Chat 设置</h3>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── API 配置列表 ── */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--t-text-muted)' }}>API 配置</p>
          {savedApiConfigs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-sm text-gray-400">
              暂无配置，在下方添加第一条
            </div>
          ) : (
            <div className="space-y-1.5">
              {savedApiConfigs.map(item => {
                const isActive = selectedApiConfigId === item.id;
                return (
                  <div key={item.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isActive ? 'border-blue-300' : ''}`} style={isActive ? { background: 'var(--t-accent-bg)' } : { background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
                    <button onClick={() => applyConfig(item)} className="shrink-0" title="设为当前使用">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}>
                        {isActive && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                    </button>
                    <button className="flex-1 text-left min-w-0" onClick={() => applyConfig(item)}>
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-800' : ''}`} style={!isActive ? { color: 'var(--t-text)' } : {}}>{item.label}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--t-text-muted)' }}>{PROVIDER_LABELS[item.provider] || item.provider} · {maskApiKey(item.apiKey)}</p>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(item)} className="w-7 h-7 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center" title="编辑">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 模型选择（跟随选中的 API 配置） ── */}
        {selectedApiConfigId && (
          <div className="px-5 pt-2 pb-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
              <label className="block text-xs font-semibold text-blue-600 mb-2">
                模型
                {localConfig.provider === 'zenmux' && <span className="ml-1 font-normal text-blue-400">({models.length} 个可用)</span>}
              </label>
              {models.length > 0 ? (
                <select value={localConfig.model} onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })} className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg focus:ring-1 focus:ring-blue-400 focus:border-blue-400 text-sm outline-none">
                  {localConfig.provider === 'zenmux' ? (() => {
                    const grouped: Record<string, typeof models> = {};
                    models.forEach((m: any) => { const cat = m.category || '其他'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(m); });
                    return Object.entries(grouped).map(([cat, ms]) => (
                      <optgroup key={cat} label={`━━ ${cat} ━━`}>
                        {ms.map((m: any) => <option key={m.id} value={m.id}>{m.name}{m.description ? ` (${m.description})` : ''}</option>)}
                      </optgroup>
                    ));
                  })() : models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input type="text" value={localConfig.model} onChange={e => setLocalConfig({ ...localConfig, model: e.target.value })} placeholder="输入模型名称" className="w-full px-3 py-2 border border-blue-200 bg-white rounded-lg focus:ring-1 focus:ring-blue-400 text-sm outline-none" />
              )}
            </div>
          </div>
        )}

        {/* ── 添加 / 编辑表单 ── */}
        <div className="px-5 pt-1 pb-4">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: 'var(--t-bg-secondary)', borderColor: 'var(--t-border-light)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>{isEditing ? '编辑配置' : '添加新配置'}</p>
              {isEditing && <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">取消</button>}
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>名称 <span className="text-red-400">*</span></label>
                  <input type="text" value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="例如：主力 API" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="block text-xs mb-1 flex items-center" style={{ color: 'var(--t-text-muted)' }}>提供商 <span className="text-red-400">*</span><ProviderHint hints={PROVIDER_MODEL_HINTS[formProvider] || []} /></label>
                  <select value={formProvider} onChange={e => setFormProvider(e.target.value as ChatConfig['provider'])} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white">
                    {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>API Key <span className="text-red-400">*</span></label>
                <input type="password" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder="输入 API Key" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              {formNeedsBaseUrl && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>Base URL</label>
                  <input type="text" value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
                </div>
              )}
              <div className="pt-1">
                {isEditing ? (
                  <button onClick={handleSaveEdit} disabled={!formLabel.trim() || !formApiKey.trim()} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">保存修改</button>
                ) : (
                  <button onClick={handleAdd} disabled={!formLabel.trim() || !formApiKey.trim()} className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors">
                    <Plus className="w-4 h-4" />添加
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── 高级设置（Temperature + 系统提示词） ── */}
        <div className="px-5 pb-4 border-t pt-4 space-y-4" style={{ borderColor: 'var(--t-border-light)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>高级设置</p>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--t-text)' }}>Temperature: {localConfig.temperature?.toFixed(1)}</label>
            <input type="range" min="0" max="2" step="0.1" value={localConfig.temperature || 0.7} onChange={e => setLocalConfig({ ...localConfig, temperature: parseFloat(e.target.value) })} className="w-full" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>精确</span><span>创意</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--t-text)' }}>系统提示词</label>
            <textarea value={localConfig.systemPrompt || ''} onChange={e => setLocalConfig({ ...localConfig, systemPrompt: e.target.value })} placeholder="设定 AI 的角色和行为..." rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 resize-none" />
          </div>
        </div>
      </div>

      <div className="p-4 border-t shrink-0" style={{ borderColor: 'var(--t-border)' }}>
        <button onClick={handleSave} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">应用并保存</button>
      </div>
    </div>
  );
};

// ==================== KB Settings Panel ====================

const KbSettingsPanel: React.FC<{
  kbEmbeddingConfig: EmbeddingConfig;
  onChangeEmbeddingConfig: (config: EmbeddingConfig) => void;
  kbChatConfig: KbChatConfig | null;
  onChangeKbChatConfig: (config: KbChatConfig) => void;
  indexMeta: RagIndexMeta | null;
  indexStatus: { newFiles: string[]; staleFiles: string[]; removedFiles: string[]; upToDate: boolean } | null;
  onRebuildIndex: () => void;
  onUpdateIndex: () => void;
  isIndexing: boolean;
  indexProgressMsg: string;
  indexProgressDone: number;
  indexProgressTotal: number;
  onClose: () => void;
}> = ({ kbEmbeddingConfig, onChangeEmbeddingConfig, kbChatConfig, onChangeKbChatConfig, indexMeta, indexStatus, onRebuildIndex, onUpdateIndex, isIndexing, indexProgressMsg, indexProgressDone, indexProgressTotal, onClose }) => {

  // ── Embedding 配置列表 ──
  const [embProfiles, setEmbProfiles] = useState<SavedEmbeddingProfile[]>(() => loadEmbeddingProfiles());
  const [activeEmbId, setActiveEmbId] = useState<string>(() => {
    const savedId = loadActiveEmbId();
    const profiles = loadEmbeddingProfiles();
    if (profiles.find(p => p.id === savedId)) return savedId;
    const match = profiles.find(p => p.apiKey === kbEmbeddingConfig.apiKey && p.provider === kbEmbeddingConfig.provider);
    return match?.id || profiles[0]?.id || '';
  });
  const [embEditingId, setEmbEditingId] = useState<string | null>(null);
  const [embFormLabel, setEmbFormLabel] = useState('');
  const [embFormProvider, setEmbFormProvider] = useState('gemini');
  const [embFormModel, setEmbFormModel] = useState('gemini-embedding-001');
  const [embFormCustomModel, setEmbFormCustomModel] = useState('');
  const [embFormApiKey, setEmbFormApiKey] = useState('');
  const [embFormBaseUrl, setEmbFormBaseUrl] = useState('');

  // ── KB Chat 配置列表 ──
  const [chatProfiles, setChatProfiles] = useState<SavedKbChatProfile[]>(() => loadKbChatProfiles());
  const [activeChatId, setActiveChatId] = useState<string>(() => {
    const savedId = loadActiveKbChatId();
    const profiles = loadKbChatProfiles();
    if (profiles.find(p => p.id === savedId)) return savedId;
    const match = kbChatConfig ? profiles.find(p => p.apiKey === kbChatConfig.apiKey && p.provider === kbChatConfig.provider) : null;
    return match?.id || profiles[0]?.id || '';
  });
  const [chatEditingId, setChatEditingId] = useState<string | null>(null);
  const [chatFormLabel, setChatFormLabel] = useState('');
  const [chatFormProvider, setChatFormProvider] = useState('zenmux');
  const [chatFormApiKey, setChatFormApiKey] = useState('');
  const [chatFormBaseUrl, setChatFormBaseUrl] = useState('');
  // 当前激活的对话模型（独立于表单，选中配置后可自由切换）
  const [activeChatModel, setActiveChatModel] = useState<string>(() => {
    const savedId = loadActiveKbChatId();
    const profiles = loadKbChatProfiles();
    const active = profiles.find(p => p.id === savedId) || profiles[0];
    return active?.model || '';
  });

  const activeEmbProfile = embProfiles.find(p => p.id === activeEmbId) || null;
  const activeChatProfile = chatProfiles.find(p => p.id === activeChatId) || null;

  const embFormModels = EMBEDDING_MODELS[embFormProvider] || [];
  const activeChatModels = AVAILABLE_MODELS[activeChatProfile?.provider || ''] || [];

  // 选中的 Embedding 配置 vs 当前索引的兼容性
  const getEmbProfileIndexCompat = (profile: SavedEmbeddingProfile): 'ok' | 'mismatch' | 'no-index' => {
    if (!indexMeta) return 'no-index';
    if (indexMeta.embeddingProvider === profile.provider && indexMeta.embeddingModel === profile.model) return 'ok';
    return 'mismatch';
  };

  // ── Embedding CRUD ──
  const selectEmbProfile = (p: SavedEmbeddingProfile) => {
    setActiveEmbId(p.id);
    persistActiveEmbId(p.id);
  };
  const startEditEmb = (p: SavedEmbeddingProfile) => {
    setEmbEditingId(p.id);
    setEmbFormLabel(p.label); setEmbFormProvider(p.provider); setEmbFormModel(p.model);
    setEmbFormApiKey(p.apiKey); setEmbFormBaseUrl(p.baseUrl || ''); setEmbFormCustomModel('');
  };
  const cancelEditEmb = () => {
    setEmbEditingId(null);
    setEmbFormLabel(''); setEmbFormProvider('gemini'); setEmbFormModel('gemini-embedding-001');
    setEmbFormApiKey(''); setEmbFormBaseUrl(''); setEmbFormCustomModel('');
  };
  const handleAddEmb = () => {
    if (!embFormLabel.trim() || !embFormApiKey.trim()) return;
    const resolvedModel = embFormModels.length === 0 ? (embFormCustomModel.trim() || '') : embFormModel;
    const newP: SavedEmbeddingProfile = { id: crypto.randomUUID(), label: embFormLabel.trim(), provider: embFormProvider, model: resolvedModel, apiKey: embFormApiKey.trim(), baseUrl: embFormBaseUrl.trim() || undefined };
    const next = [...embProfiles, newP];
    setEmbProfiles(next); persistEmbeddingProfiles(next);
    selectEmbProfile(newP); cancelEditEmb();
  };
  const handleSaveEditEmb = () => {
    if (!embEditingId || !embFormLabel.trim() || !embFormApiKey.trim()) return;
    const resolvedModel = embFormModels.length === 0 ? (embFormCustomModel.trim() || '') : embFormModel;
    const updated: SavedEmbeddingProfile = { id: embEditingId, label: embFormLabel.trim(), provider: embFormProvider, model: resolvedModel, apiKey: embFormApiKey.trim(), baseUrl: embFormBaseUrl.trim() || undefined };
    const next = embProfiles.map(p => p.id === embEditingId ? updated : p);
    setEmbProfiles(next); persistEmbeddingProfiles(next); cancelEditEmb();
  };
  const handleDeleteEmb = (id: string) => {
    const next = embProfiles.filter(p => p.id !== id);
    setEmbProfiles(next); persistEmbeddingProfiles(next);
    if (activeEmbId === id) { const na = next[0]?.id || ''; setActiveEmbId(na); persistActiveEmbId(na); }
    if (embEditingId === id) cancelEditEmb();
  };

  // ── Chat CRUD ──
  const selectChatProfile = (p: SavedKbChatProfile) => {
    setActiveChatId(p.id);
    persistActiveKbChatId(p.id);
    setActiveChatModel(p.model || AVAILABLE_MODELS[p.provider]?.[0]?.id || '');
  };
  const startEditChat = (p: SavedKbChatProfile) => {
    setChatEditingId(p.id);
    setChatFormLabel(p.label); setChatFormProvider(p.provider);
    setChatFormApiKey(p.apiKey); setChatFormBaseUrl(p.baseUrl || '');
  };
  const cancelEditChat = () => {
    setChatEditingId(null);
    setChatFormLabel(''); setChatFormProvider('zenmux');
    setChatFormApiKey(''); setChatFormBaseUrl('');
  };
  const handleAddChat = () => {
    if (!chatFormLabel.trim() || !chatFormApiKey.trim()) return;
    const defaultModel = AVAILABLE_MODELS[chatFormProvider]?.[0]?.id || '';
    const newP: SavedKbChatProfile = { id: crypto.randomUUID(), label: chatFormLabel.trim(), provider: chatFormProvider, model: defaultModel, apiKey: chatFormApiKey.trim(), baseUrl: chatFormBaseUrl.trim() || undefined };
    const next = [...chatProfiles, newP];
    setChatProfiles(next); persistKbChatProfiles(next);
    setActiveChatId(newP.id); persistActiveKbChatId(newP.id);
    setActiveChatModel(defaultModel);
    cancelEditChat();
  };
  const handleSaveEditChat = () => {
    if (!chatEditingId || !chatFormLabel.trim() || !chatFormApiKey.trim()) return;
    // 保留原有模型，更新其他字段
    const orig = chatProfiles.find(p => p.id === chatEditingId);
    const updated: SavedKbChatProfile = { id: chatEditingId, label: chatFormLabel.trim(), provider: chatFormProvider, model: orig?.model || AVAILABLE_MODELS[chatFormProvider]?.[0]?.id || '', apiKey: chatFormApiKey.trim(), baseUrl: chatFormBaseUrl.trim() || undefined };
    const next = chatProfiles.map(p => p.id === chatEditingId ? updated : p);
    setChatProfiles(next); persistKbChatProfiles(next);
    // 若提供商改变，同步更新当前激活模型
    if (chatEditingId === activeChatId && updated.provider !== orig?.provider) {
      const newModel = AVAILABLE_MODELS[updated.provider]?.[0]?.id || '';
      setActiveChatModel(newModel);
    }
    cancelEditChat();
  };
  const handleDeleteChat = (id: string) => {
    const next = chatProfiles.filter(p => p.id !== id);
    setChatProfiles(next); persistKbChatProfiles(next);
    if (activeChatId === id) {
      const na = next[0]?.id || '';
      setActiveChatId(na); persistActiveKbChatId(na);
      setActiveChatModel(next[0]?.model || '');
    }
    if (chatEditingId === id) cancelEditChat();
  };

  const handleSave = () => {
    if (activeEmbProfile) {
      const cfg: EmbeddingConfig = { provider: activeEmbProfile.provider, model: activeEmbProfile.model, apiKey: activeEmbProfile.apiKey, baseUrl: activeEmbProfile.baseUrl };
      onChangeEmbeddingConfig(cfg);
    }
    if (activeChatProfile) {
      // 持久化当前选中的模型到配置中
      const modelToSave = activeChatModel || AVAILABLE_MODELS[activeChatProfile.provider]?.[0]?.id || '';
      const updatedProfile = { ...activeChatProfile, model: modelToSave };
      const next = chatProfiles.map(p => p.id === activeChatProfile.id ? updatedProfile : p);
      setChatProfiles(next); persistKbChatProfiles(next);
      const cfg: KbChatConfig = { provider: activeChatProfile.provider, model: modelToSave, apiKey: activeChatProfile.apiKey, baseUrl: activeChatProfile.baseUrl };
      onChangeKbChatConfig(cfg);
    }
    onClose();
  };

  // ── 复用 SettingsPanel 样式的配置卡片 ──
  const renderEmbProfileCard = (p: SavedEmbeddingProfile) => {
    const isActive = activeEmbId === p.id;
    const compat = getEmbProfileIndexCompat(p);
    return (
      <div key={p.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isActive ? 'border-green-300 bg-green-50' : ''}`} style={!isActive ? { background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' } : {}}>
        <button onClick={() => selectEmbProfile(p)} className="shrink-0" title="设为当前使用">
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
            {isActive && <div className="w-2 h-2 rounded-full bg-green-500" />}
          </div>
        </button>
        <button className="flex-1 text-left min-w-0" onClick={() => selectEmbProfile(p)}>
          <p className={`text-sm font-medium truncate ${isActive ? 'text-green-800' : ''}`} style={!isActive ? { color: 'var(--t-text)' } : {}}>{p.label}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--t-text-muted)' }}>
            {EMBEDDING_PROVIDER_LABELS[p.provider] || p.provider} / {p.model} · {maskApiKey(p.apiKey)}
          </p>
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          {compat === 'ok' && <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">索引兼容</span>}
          {compat === 'mismatch' && <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">需重建</span>}
          {compat === 'no-index' && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">无索引</span>}
          <button onClick={() => startEditEmb(p)} className="w-7 h-7 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => handleDeleteEmb(p.id)} className="w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  };

  const renderChatProfileCard = (p: SavedKbChatProfile) => {
    const isActive = activeChatId === p.id;
    return (
      <div key={p.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isActive ? 'border-green-300 bg-green-50' : ''}`} style={!isActive ? { background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' } : {}}>
        <button onClick={() => selectChatProfile(p)} className="shrink-0" title="设为当前使用">
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
            {isActive && <div className="w-2 h-2 rounded-full bg-green-500" />}
          </div>
        </button>
        <button className="flex-1 text-left min-w-0" onClick={() => selectChatProfile(p)}>
          <p className={`text-sm font-medium truncate ${isActive ? 'text-green-800' : ''}`} style={!isActive ? { color: 'var(--t-text)' } : {}}>{p.label}</p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--t-text-muted)' }}>
            {PROVIDER_LABELS[p.provider] || p.provider} / {p.model} · {maskApiKey(p.apiKey)}
          </p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => startEditChat(p)} className="w-7 h-7 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => handleDeleteChat(p.id)} className="w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--t-bg-main)' }}>
      <div className="h-14 border-b flex items-center justify-between px-4 shrink-0" style={{ borderColor: 'var(--t-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
            <Database className="w-4 h-4 text-green-600" />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--t-text)' }}>知识库设置</h3>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ══ Embedding 模型配置列表 ══ */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--t-text-muted)' }}>Embedding 模型（向量化）</p>
          {embProfiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-sm text-gray-400">暂无配置，在下方添加</div>
          ) : (
            <div className="space-y-1.5">{embProfiles.map(renderEmbProfileCard)}</div>
          )}
        </div>

        {/* Embedding 添加/编辑表单 */}
        <div className="px-5 pt-1 pb-3">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: 'var(--t-bg-secondary)', borderColor: 'var(--t-border-light)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>{embEditingId ? '编辑 Embedding 配置' : '添加 Embedding 配置'}</p>
              {embEditingId && <button onClick={cancelEditEmb} className="text-xs text-gray-400 hover:text-gray-600">取消</button>}
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>名称 <span className="text-red-400">*</span></label>
                  <input type="text" value={embFormLabel} onChange={e => setEmbFormLabel(e.target.value)} placeholder="例如：Gemini 主力" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
                </div>
                <div>
                  <label className="block text-xs mb-1 flex items-center" style={{ color: 'var(--t-text-muted)' }}>提供商 <span className="text-red-400">*</span><ProviderHint hints={EMBEDDING_PROVIDER_HINTS[embFormProvider] || []} /></label>
                  <select value={embFormProvider} onChange={e => { const p = e.target.value; setEmbFormProvider(p); const ms = EMBEDDING_MODELS[p] || []; setEmbFormModel(ms[0]?.id || ''); setEmbFormCustomModel(''); }} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 bg-white">
                    {Object.entries(EMBEDDING_PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>模型</label>
                {embFormModels.length > 0 ? (
                  <select value={embFormModel} onChange={e => setEmbFormModel(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 bg-white">
                    {embFormModels.map(m => <option key={m.id} value={m.id}>{m.name}{m.dimensions ? ` (${m.dimensions}维)` : ''}</option>)}
                  </select>
                ) : (
                  <input type="text" value={embFormCustomModel} onChange={e => setEmbFormCustomModel(e.target.value)} placeholder="输入模型名称，如 text-embedding-3-small" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
                )}
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>API Key <span className="text-red-400">*</span></label>
                <input type="password" value={embFormApiKey} onChange={e => setEmbFormApiKey(e.target.value)} placeholder="输入 API Key" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>Base URL</label>
                <input type="text" value={embFormBaseUrl} onChange={e => setEmbFormBaseUrl(e.target.value)} placeholder="留空使用官方地址" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
              </div>
              <div className="pt-1">
                {embEditingId ? (
                  <button onClick={handleSaveEditEmb} disabled={!embFormLabel.trim() || !embFormApiKey.trim()} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 transition-colors">保存修改</button>
                ) : (
                  <button onClick={handleAddEmb} disabled={!embFormLabel.trim() || !embFormApiKey.trim()} className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors">
                    <Plus className="w-4 h-4" />添加
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══ 向量索引状态（基于当前选中的 Embedding 配置） ══ */}
        <div className="px-5 pt-1 pb-3 border-t" style={{ borderColor: 'var(--t-border-light)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 pt-3" style={{ color: 'var(--t-text-muted)' }}>向量索引状态</p>
          <div className="rounded-xl border p-3.5 space-y-2" style={{ borderColor: 'var(--t-border)' }}>
            {!activeEmbProfile ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">请先添加并选择 Embedding 配置</span>
              </div>
            ) : (() => {
              const compat = getEmbProfileIndexCompat(activeEmbProfile);
              return (
                <>
                  {compat === 'ok' && indexMeta && (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-gray-700">已索引 <strong>{indexMeta.fileCount}</strong> 个文件，<strong>{indexMeta.chunkCount}</strong> 个分块</span>
                      </div>
                      <p className="text-xs text-gray-400 ml-6">
                        {EMBEDDING_PROVIDER_LABELS[indexMeta.embeddingProvider] || indexMeta.embeddingProvider} / {indexMeta.embeddingModel}
                        &nbsp;·&nbsp;构建于 {new Date(indexMeta.builtAt).toLocaleString()}
                      </p>
                      {indexStatus && !indexStatus.upToDate && (
                        <div className="mt-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                          <p className="text-xs font-semibold text-amber-700 mb-1">索引需要更新：</p>
                          {indexStatus.newFiles.length > 0 && <p className="text-xs text-amber-600">+{indexStatus.newFiles.length} 个新文件待索引</p>}
                          {indexStatus.staleFiles.length > 0 && <p className="text-xs text-amber-600">🔄 {indexStatus.staleFiles.length} 个文件已修改</p>}
                          {indexStatus.removedFiles.length > 0 && <p className="text-xs text-amber-600">-{indexStatus.removedFiles.length} 个文件已移除</p>}
                        </div>
                      )}
                    </>
                  )}
                  {compat === 'mismatch' && indexMeta && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">当前索引由不同模型构建</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          已有索引：{EMBEDDING_PROVIDER_LABELS[indexMeta.embeddingProvider] || indexMeta.embeddingProvider} / {indexMeta.embeddingModel}
                        </p>
                        <p className="text-xs text-amber-600">应用此配置后需要<strong>完全重建</strong>索引才能使用</p>
                      </div>
                    </div>
                  )}
                  {compat === 'no-index' && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">尚未构建向量索引，发送第一条问题时将自动构建</span>
                    </div>
                  )}
                  {isIndexing && indexProgressTotal > 0 && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
                          <span className="text-xs font-medium text-blue-700">正在构建索引...</span>
                        </div>
                        <span className="text-xs text-blue-500">{indexProgressDone} / {indexProgressTotal}</span>
                      </div>
                      <div className="w-full bg-blue-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${indexProgressTotal > 0 ? Math.round(indexProgressDone / indexProgressTotal * 100) : 0}%` }}
                        />
                      </div>
                      {indexProgressMsg && (
                        <p className="text-[11px] text-blue-500 truncate">{indexProgressMsg}</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={onUpdateIndex} disabled={isIndexing} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40 transition-colors">
                      <RefreshCw className={`w-3.5 h-3.5 ${isIndexing ? 'animate-spin' : ''}`} />
                      {isIndexing ? '索引中...' : '增量更新'}
                    </button>
                    <button onClick={onRebuildIndex} disabled={isIndexing} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors">
                      <Database className="w-3.5 h-3.5" />
                      完全重建
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* ══ KB 对话模型配置列表 ══ */}
        <div className="px-5 pt-1 pb-2 border-t" style={{ borderColor: 'var(--t-border-light)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1 pt-3" style={{ color: 'var(--t-text-muted)' }}>对话模型（知识库问答）</p>
          <p className="text-[11px] text-gray-400 mb-2">用于理解检索结果并生成回答。不配置则使用 AI Chat 当前配置。</p>
          {chatProfiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-sm text-gray-400">暂无配置，在下方添加</div>
          ) : (
            <div className="space-y-1.5">{chatProfiles.map(renderChatProfileCard)}</div>
          )}
        </div>

        {/* 模型选择（跟随选中的对话配置） */}
        {activeChatId && activeChatProfile && (
          <div className="px-5 pt-0 pb-3">
            <div className="rounded-xl border border-green-100 bg-green-50/50 p-3.5">
              <label className="block text-xs font-semibold text-green-600 mb-2">
                模型
                {activeChatProfile.provider === 'zenmux' && <span className="ml-1 font-normal text-green-400">({activeChatModels.length} 个可用)</span>}
              </label>
              {activeChatModels.length > 0 ? (
                <select value={activeChatModel} onChange={e => setActiveChatModel(e.target.value)} className="w-full px-3 py-2 border border-green-200 bg-white rounded-lg focus:ring-1 focus:ring-green-400 focus:border-green-400 text-sm outline-none">
                  {activeChatProfile.provider === 'zenmux' ? (() => {
                    const grouped: Record<string, typeof activeChatModels> = {};
                    activeChatModels.forEach((m: any) => { const cat = m.category || '其他'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(m); });
                    return Object.entries(grouped).map(([cat, ms]) => (
                      <optgroup key={cat} label={`━━ ${cat} ━━`}>
                        {ms.map((m: any) => <option key={m.id} value={m.id}>{m.name}{m.description ? ` (${m.description})` : ''}</option>)}
                      </optgroup>
                    ));
                  })() : activeChatModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input type="text" value={activeChatModel} onChange={e => setActiveChatModel(e.target.value)} placeholder="输入模型名称" className="w-full px-3 py-2 border border-green-200 bg-white rounded-lg focus:ring-1 focus:ring-green-400 text-sm outline-none" />
              )}
            </div>
          </div>
        )}

        {/* Chat 添加/编辑表单 */}
        <div className="px-5 pt-1 pb-5">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
            <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: 'var(--t-bg-secondary)', borderColor: 'var(--t-border-light)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>{chatEditingId ? '编辑对话配置' : '添加对话配置'}</p>
              {chatEditingId && <button onClick={cancelEditChat} className="text-xs text-gray-400 hover:text-gray-600">取消</button>}
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>名称 <span className="text-red-400">*</span></label>
                  <input type="text" value={chatFormLabel} onChange={e => setChatFormLabel(e.target.value)} placeholder="例如：Claude 知识库" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
                </div>
                <div>
                  <label className="block text-xs mb-1 flex items-center" style={{ color: 'var(--t-text-muted)' }}>提供商 <span className="text-red-400">*</span><ProviderHint hints={PROVIDER_MODEL_HINTS[chatFormProvider] || []} /></label>
                  <select value={chatFormProvider} onChange={e => setChatFormProvider(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 bg-white">
                    {Object.entries(PROVIDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>API Key <span className="text-red-400">*</span></label>
                <input type="password" value={chatFormApiKey} onChange={e => setChatFormApiKey(e.target.value)} placeholder="输入 API Key" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--t-text-muted)' }}>Base URL</label>
                <input type="text" value={chatFormBaseUrl} onChange={e => setChatFormBaseUrl(e.target.value)} placeholder="留空使用默认地址" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100" />
              </div>
              <div className="pt-1">
                {chatEditingId ? (
                  <button onClick={handleSaveEditChat} disabled={!chatFormLabel.trim() || !chatFormApiKey.trim()} className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40 transition-colors">保存修改</button>
                ) : (
                  <button onClick={handleAddChat} disabled={!chatFormLabel.trim() || !chatFormApiKey.trim()} className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors">
                    <Plus className="w-4 h-4" />添加
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="p-4 border-t shrink-0" style={{ borderColor: 'var(--t-border)' }}>
        <button onClick={handleSave} className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors">应用并保存</button>
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
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: 'var(--t-bg-main)' }}>
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4" style={{ borderColor: 'var(--t-border)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--t-text)' }}>本轮对话定制预设词</h3>
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
            <label className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>预设词内容</label>
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
          <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--t-text)' }}>从 Skills 库选择</label>
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
      <div className="p-4 border-t flex gap-2.5" style={{ borderColor: 'var(--t-border-light)' }}>
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
  const [kbEmbeddingConfig, setKbEmbeddingConfig] = useState<EmbeddingConfig>(() => {
    const profiles = loadEmbeddingProfiles();
    const activeId = loadActiveEmbId();
    const active = profiles.find(p => p.id === activeId) || profiles[0];
    if (active) return { provider: active.provider, model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl };
    return loadKbEmbeddingConfig();
  });
  const [kbChatConfig, setKbChatConfigState] = useState<KbChatConfig | null>(() => {
    const profiles = loadKbChatProfiles();
    const activeId = loadActiveKbChatId();
    const active = profiles.find(p => p.id === activeId) || profiles[0];
    if (active) return { provider: active.provider, model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl };
    return loadKbChatConfig();
  });
  const [kbIndexMeta, setKbIndexMeta] = useState<RagIndexMeta | null>(null);
  const [kbIndexStatus, setKbIndexStatus] = useState<{ newFiles: string[]; staleFiles: string[]; removedFiles: string[]; upToDate: boolean } | null>(null);
  const [isKbProcessing, setIsKbProcessing] = useState(false);
  const [kbIndexProgressMsg, setKbIndexProgressMsg] = useState('');
  const [kbIndexProgressDone, setKbIndexProgressDone] = useState(0);
  const [kbIndexProgressTotal, setKbIndexProgressTotal] = useState(0);

  // Load async index meta on mount
  useEffect(() => {
    loadRagIndexMeta().then(meta => setKbIndexMeta(meta));
  }, []);
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
    setShowKbSettings(false);
  };

  // Rebuild KB index from scratch
  const handleRebuildKbIndex = useCallback(async () => {
    if (isKbProcessing) return;
    if (!kbEmbeddingConfig.apiKey) { setError('请先配置 Embedding API Key'); return; }
    setIsKbProcessing(true);
    try {
      const kbFiles = (fileRecords || []).filter(f => (knowledgeBaseFileIds || new Set()).has(f.id));
      setKbIndexProgressMsg(''); setKbIndexProgressDone(0); setKbIndexProgressTotal(kbFiles.length);
      let done = 0;
      const index = await buildIndex(kbFiles, [], kbEmbeddingConfig, (msg) => {
        setKbIndexProgressMsg(msg);
        if (msg.startsWith('✅') || msg.startsWith('⚠️') || msg.startsWith('❌')) {
          done++; setKbIndexProgressDone(done);
        }
      });
      await saveRagIndex(index);
      const meta: RagIndexMeta = { embeddingProvider: kbEmbeddingConfig.provider, embeddingModel: kbEmbeddingConfig.model, builtAt: Date.now(), fileCount: kbFiles.length, chunkCount: index.length };
      saveRagIndexMeta(meta);
      setKbIndexMeta(meta);
      setKbIndexStatus({ newFiles: [], staleFiles: [], removedFiles: [], upToDate: true });
    } catch (err) {
      setError(`索引重建失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsKbProcessing(false);
      setKbIndexProgressMsg('');
    }
  }, [isKbProcessing, kbEmbeddingConfig, fileRecords, knowledgeBaseFileIds]);

  // Incremental update KB index
  const handleUpdateKbIndex = useCallback(async () => {
    if (isKbProcessing) return;
    if (!kbEmbeddingConfig.apiKey) { setError('请先配置 Embedding API Key'); return; }
    setIsKbProcessing(true);
    try {
      const kbFiles = (fileRecords || []).filter(f => (knowledgeBaseFileIds || new Set()).has(f.id));
      setKbIndexProgressMsg(''); setKbIndexProgressDone(0); setKbIndexProgressTotal(kbFiles.length);
      let done = 0;
      let index = await loadRagIndex();
      index = await buildIndex(kbFiles, index, kbEmbeddingConfig, (msg) => {
        setKbIndexProgressMsg(msg);
        if (msg.startsWith('✅') || msg.startsWith('⚠️') || msg.startsWith('❌') || msg.startsWith('✓')) {
          done++; setKbIndexProgressDone(done);
        }
      });
      await saveRagIndex(index);
      const meta: RagIndexMeta = { embeddingProvider: kbEmbeddingConfig.provider, embeddingModel: kbEmbeddingConfig.model, builtAt: Date.now(), fileCount: kbFiles.length, chunkCount: index.length };
      saveRagIndexMeta(meta);
      setKbIndexMeta(meta);
      setKbIndexStatus({ newFiles: [], staleFiles: [], removedFiles: [], upToDate: true });
    } catch (err) {
      setError(`索引更新失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsKbProcessing(false);
      setKbIndexProgressMsg('');
    }
  }, [isKbProcessing, kbEmbeddingConfig, fileRecords, knowledgeBaseFileIds]);

  // Refresh index status when KB mode is entered
  useEffect(() => {
    if (isKbMode && knowledgeBaseFileIds) {
      const kbFiles = (fileRecords || []).filter(f => (knowledgeBaseFileIds || new Set()).has(f.id));
      loadRagIndex().then(index => {
        checkIndexStatus(kbFiles, index).then(status => setKbIndexStatus(status));
      });
    }
  }, [isKbMode, knowledgeBaseFileIds, fileRecords]);

  const handleKbSend = useCallback(async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isKbProcessing) return;
    if (!kbEmbeddingConfig.apiKey) {
      setError('请先在知识库设置中配置 Embedding API Key');
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
      index = await buildIndex(kbFiles, index, kbEmbeddingConfig, (msg) => {
        indexProgressMessages.push(msg);
        // 实时在状态消息中更新进度（仅索引中）
        if (msg.startsWith('正在索引')) {
          setKbConversations(prev => prev.map(c => c.id === kbConv!.id
            ? { ...c, messages: c.messages.map(m => m.id === assistantId ? { ...m, content: `⏳ ${msg}` } : m) }
            : c
          ));
        }
      });
      // 若有索引失败/跳过，收集并通过 error 提示用户
      const indexErrors = indexProgressMessages.filter(m => m.startsWith('❌') || m.startsWith('⚠️'));
      if (indexErrors.length > 0) {
        setError(`索引警告：${indexErrors.join(' | ')}`);
      }
      await saveRagIndex(index);
      // 更新索引元数据
      const meta: RagIndexMeta = { embeddingProvider: kbEmbeddingConfig.provider, embeddingModel: kbEmbeddingConfig.model, builtAt: Date.now(), fileCount: kbFiles.length, chunkCount: index.length };
      saveRagIndexMeta(meta);
      setKbIndexMeta(meta);

      const results = await searchIndex(trimmedInput, index, kbEmbeddingConfig, 5);

      let contextBlock = '';
      if (results.length > 0) {
        const snippets = results.map((r, i) => {
          const m = (r as any).metadata || {};
          const parts: string[] = [r.fileName || m.fileName || '未知'];
          if (m.pageNumber != null) parts.push(`第${m.pageNumber}页`);
          if (m.sectionTitle) parts.push(`「${m.sectionTitle}」`);
          if (m.lineStart != null) parts.push(`行${m.lineStart}-${m.lineEnd ?? m.lineStart}`);
          if (m.codeLanguage) parts.push(`(${m.codeLanguage})`);
          return `### 片段 ${i + 1}（来源：${parts.join(' ')}，相关度：${Math.round(r.score * 100)}%）\n${r.text}`;
        }).join('\n\n');
        contextBlock = `\n\n## 知识库检索结果\n以下是与用户问题最相关的内容片段：\n\n${snippets}`;
      } else {
        contextBlock = '\n\n## 知识库检索结果\n未检索到与用户问题相关的内容。';
      }
      const kbSize = kbFiles.length;
      const fileListBlock = kbFiles.length > 0
        ? '\n\n## 知识库文件列表\n' + kbFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
        : '';
      const kbSystemPrompt = `你是「知识库助手」，专注于基于用户本地文件回答问题。\n\n## 规则\n1. 优先根据下方「知识库检索结果」中的内容回答，可以结合你自身知识进行补充和解释。\n2. 如果检索结果中没有相关内容，诚实告知用户知识库中未找到，但你仍可以用自身知识尝试回答，需标注哪些是来自知识库、哪些是你的通用知识。\n3. 回答末尾标注引用来源，包括文件名、页码和章节信息。\n4. 当前知识库共有 ${kbSize} 个文件（${kbFiles.length} 个有效），你**始终知道所有文件的名字**，见「知识库文件列表」。${fileListBlock}${contextBlock}`;

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
  }, [inputValue, isKbProcessing, chatService, activeKbConversation, knowledgeBaseFileIds, fileRecords, kbEmbeddingConfig]);

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
      <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--t-text)' }}>开始对话</h2>
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
            className="flex items-center gap-2 px-3 py-3 hover:bg-gray-50 border hover:border-purple-300 hover:shadow-sm rounded-xl text-sm transition-all group text-left"
            style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
          >
            <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full relative" style={{ background: 'var(--t-bg)' }}>
      {/* ======================== Sidebar ======================== */}
      {showSidebar && (
        <div className={`w-72 border-r flex flex-col shadow-sm`} style={{ background: 'var(--t-bg-card)', borderColor: 'var(--t-border)' }}>
          {isKbMode ? (
            <>
              {/* KB Sidebar Header */}
              <div className="h-14 border-b flex items-center justify-between px-4" style={{ borderColor: 'var(--t-border-light)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <KBAvatar size="sm" />
                  <span className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>知识库对话</span>
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
                            : 'hover:bg-gray-50'
                          }
                        `}
                        style={!isActive ? { color: 'var(--t-text)' } : {}}
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
              <div className="p-3 border-t relative" style={{ borderColor: 'var(--t-border-light)' }}>
                
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
              <div className="h-14 border-b flex items-center justify-between px-4" style={{ borderColor: 'var(--t-border-light)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                  <AIAvatar size="sm" />
                  <span className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>AI 助手</span>
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
                            : 'hover:bg-gray-50'
                          }
                        `}
                        style={!isActive ? { color: 'var(--t-text)' } : {}}
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
              <div className="p-3 border-t" style={{ borderColor: 'var(--t-border-light)' }}>
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
        <div className="h-14 border-b flex items-center justify-between px-4 backdrop-blur-sm" style={{ background: 'var(--t-header-bg)', borderColor: 'var(--t-border-light)', WebkitAppRegion: 'drag' } as React.CSSProperties}>
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
            <span className="font-semibold text-sm" style={{ color: 'var(--t-text)' }}>
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
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm border shadow-sm" style={{ background: 'var(--t-msg-ai-bg)', borderColor: 'var(--t-msg-ai-border)' }}>
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
              <div className={`p-4 border-t ${isKbMode ? 'bg-green-50/30' : ''}`} style={!isKbMode ? { background: 'var(--t-bg-card)', borderColor: 'var(--t-border-light)' } : { borderColor: 'var(--t-border-light)' }}>
                <div className={`flex items-end gap-2 border rounded-2xl px-4 py-3 transition-all shadow-sm ${
                  isKbMode
                    ? 'bg-white border-green-200 hover:border-green-300 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100'
                    : 'hover:border-purple-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100'
                }`} style={!isKbMode ? { background: 'var(--t-input-bg)', borderColor: 'var(--t-input-border)' } : {}}>
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
                    className="flex-1 bg-transparent border-none outline-none resize-none text-sm placeholder-gray-400 overflow-y-auto"
                    style={{ height: '36px', maxHeight: '120px', minHeight: '36px', color: 'var(--t-text)' }}
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

      {/* KB Settings Panel */}
      {showKbSettings && (
        <KbSettingsPanel
          kbEmbeddingConfig={kbEmbeddingConfig}
          onChangeEmbeddingConfig={(config) => {
            setKbEmbeddingConfig(config);
            saveKbEmbeddingConfig(config);
          }}
          kbChatConfig={kbChatConfig}
          onChangeKbChatConfig={(config) => {
            setKbChatConfigState(config);
            saveKbChatConfig(config);
          }}
          indexMeta={kbIndexMeta}
          indexStatus={kbIndexStatus}
          onRebuildIndex={handleRebuildKbIndex}
          onUpdateIndex={handleUpdateKbIndex}
          isIndexing={isKbProcessing}
          indexProgressMsg={kbIndexProgressMsg}
          indexProgressDone={kbIndexProgressDone}
          indexProgressTotal={kbIndexProgressTotal}
          onClose={() => setShowKbSettings(false)}
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
