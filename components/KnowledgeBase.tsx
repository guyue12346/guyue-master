/**
 * KnowledgeBase — 知识库模块
 *
 * 三个模式:
 * - AI 助手: 通用对话（复用 ChatService 流式对话 + MarkdownContent）
 * - 知识库问答: 基于 RAG 向量库检索 + LLM 问答
 * - 智能测验: 出题 + 评分 + 掌握度仪表盘
 *
 * 左侧栏随模式变化:
 * - AI 助手 / 知识库问答: 对话历史
 * - 智能测验: 向量库列表
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Library, MessageSquare, GraduationCap, Send, Loader2,
  Settings, ChevronRight, CheckCircle2, XCircle, Clock, Award,
  Sparkles, RotateCcw, Database, X, Check, Eye, EyeOff,
  ChevronDown, ChevronUp, BarChart3, Brain, Target,
  BookOpen, Lightbulb, ArrowRight, RefreshCw,
  Trash2, Pencil, Plus, Theater, Bot, User,
  Copy, Quote, StopCircle, MessageSquarePlus, PanelLeftClose, PanelLeftOpen,
  Bug, FileText, Thermometer, Search, Paperclip, Image,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  LocalVectorStore,
} from '../services/ragLlamaIndex';
import type { EmbeddingConfig } from '../services/ragLlamaIndex';
import {
  search as vectorServiceSearch,
  searchMultiple as vectorServiceSearchMultiple,
  getRawStore,
} from '../services/vectorService';

// Chat service (same as AI Chat)
import {
  ChatMessage, ChatConversation, ChatConfig, ChatService,
  AVAILABLE_MODELS, DEFAULT_CHAT_CONFIG,
  loadChatConfig, saveChatConfig, createNewConversation,
} from '../services/chatService';
import { MarkdownContent } from './MarkdownContent';
import type { PromptRecord } from '../types';
import { loadProfiles, API_PROVIDER_LABELS } from '../utils/apiProfileService';

// Quiz System services
import {
  QUESTION_TYPE_INFO, DIFFICULTY_INFO, MASTERY_LEVEL_INFO, BUILTIN_SCENARIOS,
  loadSettings, saveSettings,
  loadMastery,
  loadStats,
  loadRecentSessions, saveRecentSessions, recordSessionStats,
  evaluate,
  getRetentionRate, getRetentionStatus, calculateQuestionPriorities,
  buildSessionPlan,
  generateSessionSummary, updateMasteryAfterAnswer,
  clearLegacyMastery,
  generateFollowUp,
} from '../services/quizSystem';
import type {
  QuizQuestion, QuestionType, AnswerEvaluation,
  QuizSession, QuizAttempt, SessionSummary,
  TagMastery, QuizStats, QuizSettings, LLMFunction,
  QuizScenario, VectorStoreRole, StoreContext,
} from '../services/quizSystem';

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

interface RagCollection {
  id: string; name: string; vectorCount: number;
  embeddingProvider?: string; embeddingModel?: string;
  topicVocabulary?: string[];
}

function getEmbeddingConfig(): EmbeddingConfig {
  // 1. Try centralized API profiles first
  try {
    const profiles = loadProfiles();
    // Find a profile that looks like an embedding provider
    const embProviders = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'cohere', 'voyage', 'jina'];
    const embProfile = profiles.find(p => embProviders.includes(p.provider));
    if (embProfile?.apiKey) {
      return {
        provider: embProfile.provider as any,
        model: embProfile.provider === 'gemini' ? 'gemini-embedding-001' : 'text-embedding-3-small',
        apiKey: embProfile.apiKey,
        baseUrl: embProfile.baseUrl || undefined,
        dimensions: embProfile.provider === 'gemini' ? 768 : 1536,
      };
    }
  } catch {}
  // 2. Read from RAG Lab's actual storage key
  try {
    const raw = localStorage.getItem('guyue_rag_lab_embedding');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.apiKey) return cfg;
    }
  } catch {}
  // 3. Fallback: try ChatManager's embedding key
  try {
    const apiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
    const baseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
    if (apiKey) return { provider: 'gemini', model: 'gemini-embedding-001', apiKey, baseUrl, dimensions: 768 };
  } catch {}
  // Last resort: quiz settings
  const s = loadSettings();
  return { provider: 'gemini', model: 'gemini-embedding-001', apiKey: s.llmConfig.apiKey, dimensions: 768 };
}

import { GoogleGenAI } from '@google/genai';

function makeLLMFn(settings: QuizSettings): LLMFunction {
  return async (prompt: string, systemPrompt?: string) => {
    const { provider, apiKey, model, baseUrl } = settings.llmConfig;
    if (!apiKey) throw new Error('请先在设置中配置 API Key（点击右上角"设置"）');
    const effectiveProvider = provider || 'gemini';
    if (effectiveProvider === 'gemini') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const contents: any[] = [];
        if (systemPrompt) {
          contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
          contents.push({ role: 'model', parts: [{ text: '好的。' }] });
        }
        contents.push({ role: 'user', parts: [{ text: prompt }] });
        const response = await ai.models.generateContent({ model, contents, config: { temperature: 0.7, maxOutputTokens: 4096 } });
        return response.text || '';
      } catch (err: any) {
        throw new Error(`Gemini API 错误 [模型: ${model}]: ${err?.message || String(err)}`);
      }
    } else {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (effectiveProvider === 'anthropic') { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01'; }
      else { headers['Authorization'] = `Bearer ${apiKey}`; }
      const url = `${baseUrl}/chat/completions`;
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }) });
      } catch (err: any) { throw new Error(`网络错误 [${effectiveProvider}/${model}]: ${err?.message}`); }
      if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`${effectiveProvider} API 错误 (${res.status}) [模型: ${model}]: ${body.slice(0, 500)}`); }
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    }
  };
}

/** 从 ChatConfig 创建简单 LLM 函数（用于检索前优化等） */
function makeLlmFnFromConfig(cfg: ChatConfig): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const { provider, apiKey, model, baseUrl } = cfg;
    if (!apiKey) throw new Error('LLM API Key 未配置');
    const isGemini = (provider || '').includes('gemini') || (baseUrl || '').includes('generativelanguage.googleapis.com');
    if (isGemini) {
      const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const res = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if ((provider || '') === 'anthropic') { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01'; }
    else { headers['Authorization'] = `Bearer ${apiKey}`; }
    const url = `${(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }) });
    if (!res.ok) throw new Error(`LLM API error ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  };
}

// Provider & model definitions (for quiz settings)
const PROVIDER_OPTIONS: { value: string; label: string; defaultUrl: string }[] = [
  { value: 'gemini', label: 'Gemini', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/v1' },
  { value: 'zhipu', label: '智谱 GLM', defaultUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'moonshot', label: 'Moonshot', defaultUrl: 'https://api.moonshot.cn/v1' },
  { value: 'minimax', label: 'MiniMax', defaultUrl: 'https://api.minimax.chat/v1' },
  { value: 'ollama', label: 'Ollama (本地)', defaultUrl: 'http://localhost:11434/v1' },
  { value: 'custom', label: '自定义', defaultUrl: '' },
];
const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (旗舰·推荐)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  openai: [
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'o3', label: 'o3 (推理)' },
    { value: 'o4-mini', label: 'o4 Mini (推理)' },
  ],
  anthropic: [
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  zhipu: [
    { value: 'glm-4-plus', label: 'GLM-4 Plus' },
    { value: 'glm-4-air-250414', label: 'GLM-4 Air' },
    { value: 'glm-4-flash-250414', label: 'GLM-4 Flash (免费)' },
  ],
  moonshot: [
    { value: 'kimi-k2.5', label: 'Kimi K2.5' },
    { value: 'moonshot-v1-128k', label: 'Moonshot 128K' },
  ],
  minimax: [
    { value: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
    { value: 'MiniMax-M2', label: 'MiniMax M2' },
  ],
  ollama: [
    { value: 'llama3.3', label: 'Llama 3.3' },
    { value: 'qwen3', label: 'Qwen3' },
    { value: 'deepseek-r1', label: 'DeepSeek R1' },
  ],
  custom: [],
};

// Conversation storage for KB module
const KB_AI_CONVERSATIONS_KEY = 'guyue_kb_ai_conversations';
const KB_QA_CONVERSATIONS_KEY = 'guyue_kb_qa_conversations';

function loadKbConversations(key: string): ChatConversation[] {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveKbConversations(key: string, convs: ChatConversation[]) {
  localStorage.setItem(key, JSON.stringify(convs.slice(0, 50)));
}

// ═══════════════════════════════════════════════════════
// Per-feature LLM Config
// ═══════════════════════════════════════════════════════
interface KbLlmConfig {
  profileId?: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const KB_AI_CONFIG_KEY = 'guyue_kb_ai_llm_config';
const KB_QA_CONFIG_KEY = 'guyue_kb_qa_llm_config';
const KB_QUIZ_CONFIG_KEY = 'guyue_kb_quiz_llm_config';

function loadKbLlmConfig(key: string): KbLlmConfig | null {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveKbLlmConfig(key: string, cfg: KbLlmConfig) {
  localStorage.setItem(key, JSON.stringify(cfg));
}

/** Icon-only button → dropdown listing global API profiles for selection + model picker */
const KbLlmConfigButton: React.FC<{
  storageKey: string;
  label: string;
  config: KbLlmConfig | null;
  onConfigChange: (cfg: KbLlmConfig) => void;
}> = ({ storageKey, label, config, onConfigChange }) => {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(config?.profileId ?? null);
  const [model, setModel] = useState(config?.model || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    setProfiles(loadProfiles());
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    setSelectedProfileId(profileId);
    const models = MODEL_OPTIONS[profile.provider] || [];
    const defaultModel = models[0]?.value || '';
    setModel(defaultModel);
    const providerInfo = PROVIDER_OPTIONS.find(p => p.value === profile.provider);
    const cfg: KbLlmConfig = {
      profileId: profileId,
      provider: profile.provider,
      apiKey: profile.apiKey,
      model: defaultModel,
      baseUrl: profile.baseUrl || providerInfo?.defaultUrl || '',
    };
    saveKbLlmConfig(storageKey, cfg);
    onConfigChange(cfg);
  };

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    if (config) {
      const cfg = { ...config, model: newModel };
      saveKbLlmConfig(storageKey, cfg);
      onConfigChange(cfg);
    }
  };

  const handleClear = () => {
    setSelectedProfileId(null);
    setModel('');
    localStorage.removeItem(storageKey);
    onConfigChange({ profileId: undefined, provider: '', apiKey: '', model: '', baseUrl: '' });
    setOpen(false);
  };

  const isConfigured = !!config?.apiKey;
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);
  const models = selectedProfile ? (MODEL_OPTIONS[selectedProfile.provider] || []) : [];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
          isConfigured
            ? 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 ring-1 ring-blue-200'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
        }`}
        title={isConfigured ? `${label}: ${config!.provider}/${config!.model}` : `配置 ${label} API`}
      >
        <Settings size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg shadow-black/8 border border-gray-200/80 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 tracking-wide uppercase">{label} · API</span>
            {isConfigured && (
              <button onClick={handleClear} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">清除</button>
            )}
          </div>
          {/* Profile list */}
          {profiles.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {profiles.map(p => {
                const active = p.id === selectedProfileId;
                const providerLabel = (API_PROVIDER_LABELS as any)[p.provider] || p.provider;
                return (
                  <button key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      active ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                      active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {active ? '✓' : p.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate ${active ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{p.name}</div>
                      <div className="text-[10px] text-gray-400">{providerLabel}</div>
                    </div>
                    <div className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                    }`}>{p.apiKey ? '••••' + p.apiKey.slice(-4) : '未配置'}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-center">
              <div className="text-xs text-gray-400">尚无 API 配置</div>
              <div className="text-[10px] text-gray-300 mt-0.5">请在左下角「设置」中添加 API Key</div>
            </div>
          )}
          {/* Model selector (only if profile selected) */}
          {selectedProfile && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              <label className="block text-[10px] font-medium text-gray-400 mb-1">模型</label>
              {models.length > 0 ? (
                <select
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:border-blue-400 focus:outline-none transition-colors"
                  value={model}
                  onChange={e => handleModelChange(e.target.value)}
                >
                  {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              ) : (
                <input
                  className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:border-blue-400 focus:outline-none transition-colors"
                  value={model}
                  onChange={e => handleModelChange(e.target.value)}
                  placeholder="输入模型名称"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════════════
// Avatars (matching ChatManager style)
// ═══════════════════════════════════════════════════════
const AIAvatar: React.FC = () => (
  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm"
    style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 40%, #db2777 100%)' }}>
    <Sparkles className="w-4 h-4 text-white" />
  </div>
);
const KBAvatar: React.FC = () => (
  <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600">
    <Brain className="w-4 h-4 text-white" />
  </div>
);
const getUserAvatar = () => { try { return localStorage.getItem('guyue_user_avatar') || ''; } catch { return ''; } };
const UserAvatar: React.FC = () => {
  const avatar = getUserAvatar();
  return avatar ? (
    <div className="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden shadow-sm"><img src={avatar} alt="" className="w-full h-full object-cover" /></div>
  ) : (
    <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 shadow-sm"><User className="w-4 h-4 text-white" /></div>
  );
};

// ═══════════════════════════════════════════════════════
// MessageBubble (matching ChatManager)
// ═══════════════════════════════════════════════════════
const MessageBubble: React.FC<{
  message: ChatMessage;
  isStreaming?: boolean;
  isKb?: boolean;
  onQuote?: (content: string) => void;
  onDebug?: (id: string) => void;
  hasDebug?: boolean;
}> = React.memo(({ message, isStreaming, isKb, onQuote, onDebug, hasDebug }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const timeStr = message.timestamp ? new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';

  if (message.role === 'system') return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      {isUser ? <UserAvatar /> : isKb ? <KBAvatar /> : <AIAvatar />}
      <div className={`flex-1 min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {isUser ? (
          <div className="max-w-[80%]">
            <div className="px-4 py-3 rounded-2xl rounded-tr-sm shadow-sm" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
              <p className="whitespace-pre-wrap text-sm text-white leading-relaxed">{message.content}</p>
            </div>
            <div className={`mt-1 flex justify-end items-center gap-1 transition-opacity ${hasDebug ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
              {hasDebug && onDebug && <button onClick={() => onDebug(message.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-amber-600 hover:bg-amber-50"><Bug className="w-3 h-3" /><span>调试</span></button>}
              {onQuote && <button onClick={() => onQuote(message.content)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Quote className="w-3 h-3" /><span>引用</span></button>}
              <span className="text-[11px] text-gray-400">{timeStr}</span>
            </div>
          </div>
        ) : (
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
            {!isStreaming && message.content && (
              <div className={`mt-1.5 flex items-center gap-2 transition-opacity ${hasDebug ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button onClick={handleCopy} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  {copied ? <><Check className="w-3 h-3 text-green-500" /><span className="text-green-600">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
                </button>
                {onQuote && <button onClick={() => onQuote(message.content)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100"><Quote className="w-3 h-3" /><span>引用</span></button>}
                {hasDebug && onDebug && <button onClick={() => onDebug(message.id)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-gray-400 hover:text-amber-600 hover:bg-amber-50"><Bug className="w-3 h-3" /><span>调试</span></button>}
                <span className="text-[11px] text-gray-300">{timeStr}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════

export function KnowledgeBase({ compact = false }: { compact?: boolean }) {
  // ── Core ──
  const [mode, setMode] = useState<'ai' | 'qa' | 'quiz'>('ai');
  const [kbSidebarVisible, setKbSidebarVisible] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    try { const v = localStorage.getItem('guyue_kb_selected_collections'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [ragCollections, setRagCollections] = useState<RagCollection[]>([]);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>(() => loadSettings());
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Per-feature LLM configs ──
  const [aiLlmConfig, setAiLlmConfig] = useState<KbLlmConfig | null>(() => loadKbLlmConfig(KB_AI_CONFIG_KEY));
  const [qaLlmConfig, setQaLlmConfig] = useState<KbLlmConfig | null>(() => loadKbLlmConfig(KB_QA_CONFIG_KEY));
  const [quizLlmConfig, setQuizLlmConfig] = useState<KbLlmConfig | null>(() => loadKbLlmConfig(KB_QUIZ_CONFIG_KEY));

  // ── AI Chat ──
  const [chatConfig, setChatConfig] = useState<ChatConfig>(() => {
    const saved = loadKbLlmConfig(KB_AI_CONFIG_KEY);
    if (saved?.apiKey) {
      return { ...loadChatConfig(), provider: saved.provider as any, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl };
    }
    return loadChatConfig();
  });
  const [chatServiceRef] = useState<{ current: ChatService }>(() => ({ current: new ChatService(chatConfig) }));
  const [aiConversations, setAiConversations] = useState<ChatConversation[]>(() => loadKbConversations(KB_AI_CONVERSATIONS_KEY));
  const [activeAiConvId, setActiveAiConvId] = useState<string | null>(() => {
    const convs = loadKbConversations(KB_AI_CONVERSATIONS_KEY);
    return convs.length > 0 ? convs[0].id : null;
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ type: 'image' | 'file'; name: string; mimeType: string; base64: string; size: number }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── QA (knowledge base Q&A with RAG) ──
  const [qaConversations, setQaConversations] = useState<ChatConversation[]>(() => loadKbConversations(KB_QA_CONVERSATIONS_KEY));
  const [activeQaConvId, setActiveQaConvId] = useState<string | null>(() => {
    const convs = loadKbConversations(KB_QA_CONVERSATIONS_KEY);
    return convs.length > 0 ? convs[0].id : null;
  });
  const [qaProcessing, setQaProcessing] = useState(false);
  const [qaInput, setQaInput] = useState('');
  const qaTextareaRef = useRef<HTMLTextAreaElement>(null);
  const qaMessagesEndRef = useRef<HTMLDivElement>(null);

  // ── Per-conversation turn prompts (AI and QA are independent) ──
  const activeAiConv = aiConversations.find(c => c.id === activeAiConvId) ?? null;
  const activeQaConv = qaConversations.find(c => c.id === activeQaConvId) ?? null;
  const aiTurnPrompt = activeAiConv?.turnPrompt ?? '';
  const qaTurnPrompt = activeQaConv?.turnPrompt ?? '';
  const setAiTurnPrompt = useCallback((val: string) => {
    setAiConversations(prev => prev.map(c => c.id === activeAiConvId ? { ...c, turnPrompt: val } : c));
  }, [activeAiConvId]);
  const setQaTurnPrompt = useCallback((val: string) => {
    setQaConversations(prev => prev.map(c => c.id === activeQaConvId ? { ...c, turnPrompt: val } : c));
  }, [activeQaConvId]);

  // ── Rename ──
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── Debug & System Prompt ──
  const [debugMsgId, setDebugMsgId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({});
  const addDebugInfo = useCallback((msgId: string, info: Record<string, any>) => {
    setDebugInfo(prev => {
      const next = { ...prev, [msgId]: info };
      const keys = Object.keys(next);
      if (keys.length > 5) {
        const pruned: Record<string, any> = {};
        keys.slice(-5).forEach(k => { pruned[k] = next[k]; });
        return pruned;
      }
      return next;
    });
  }, []);
  const [showSystemPromptPanel, setShowSystemPromptPanel] = useState(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [skills, setSkills] = useState<PromptRecord[]>([]);
  const SKILLS_STORAGE_KEY = 'linkmaster_prompts_v1';
  // ── Quiz ──
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [quizPrompt, setQuizPrompt] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [quizTypes, setQuizTypes] = useState<QuestionType[]>(['concept', 'comparison', 'scenario']);
  const [quizDifficulty, setQuizDifficulty] = useState(3);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizProgress, setQuizProgress] = useState('');
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [gradingIndex, setGradingIndex] = useState(-1);
  const [recentSessions, setRecentSessions] = useState<QuizSession[]>(() => loadRecentSessions());
  const allScenarios = [...BUILTIN_SCENARIOS, ...(quizSettings.scenarios || [])];
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('daily-study');
  const [showScenarioEditor, setShowScenarioEditor] = useState(false);
  const [editingScenario, setEditingScenario] = useState<QuizScenario | null>(null);
  const [editingSessionName, setEditingSessionName] = useState<string | null>(null);
  const [sessionNameInput, setSessionNameInput] = useState('');
  const [showDashboard, setShowDashboard] = useState(false);

  // ── Quiz Debug ──
  const [quizDebugData, setQuizDebugData] = useState<any[]>([]);
  const [showQuizDebug, setShowQuizDebug] = useState(false);

  // ── Interview Mode ──
  const [interviewHistory, setInterviewHistory] = useState<Array<{
    question: QuizQuestion;
    userAnswer: string;
    evaluation?: AnswerEvaluation;
    isFollowUp: boolean;
    followUpCount: number;
  }>>([]);
  const [interviewCurrentQ, setInterviewCurrentQ] = useState<QuizQuestion | null>(null);
  const [interviewAnswer, setInterviewAnswer] = useState('');
  const [interviewGrading, setInterviewGrading] = useState(false);
  const [interviewQueuedChunks, setInterviewQueuedChunks] = useState<any[]>([]);
  const [interviewFollowUpCount, setInterviewFollowUpCount] = useState(0);
  const [interviewTotalNew, setInterviewTotalNew] = useState(0);
  const [interviewMaxQuestions, setInterviewMaxQuestions] = useState(5);

  // ── Quiz Categories ──
  interface QuizCategory {
    id: string;
    name: string;
    icon: string;    // Lucide icon name (e.g., 'GraduationCap')
    color: string;   // hex color (e.g., '#8b5cf6')
    createdAt: number;
  }

  const QuizIconRender = ({ name, className, color }: { name: string; className?: string; color?: string }) => {
    const Icon = (LucideIcons as any)[name] || LucideIcons.GraduationCap;
    return color ? <Icon className={className} color={color} /> : <Icon className={className} />;
  };

  const QUIZ_CATEGORY_ICONS = [
    'GraduationCap', 'BookOpen', 'Code', 'Brain', 'Atom',
    'FlaskConical', 'Calculator', 'Globe', 'Briefcase', 'Lightbulb',
    'Target', 'Award', 'Sparkles', 'Zap', 'Database',
    'FileText', 'Terminal', 'Music', 'PenTool', 'Heart',
    'Star', 'Coffee', 'Cpu', 'Shield', 'Wrench',
    'Microscope', 'Library', 'Notebook', 'Tags', 'Activity',
  ];

  const PRESET_COLORS = [
    '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981',
    '#22c55e', '#84cc16', '#f59e0b', '#f97316',
    '#ef4444', '#ec4899', '#64748b', '#a8a29e',
  ];

  const QUIZ_CATEGORIES_KEY = 'guyue_quiz_categories';
  const [quizCategories, setQuizCategories] = useState<QuizCategory[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(QUIZ_CATEGORIES_KEY) || '[]');
      return raw.map((c: any) => ({ icon: 'GraduationCap', color: '#8b5cf6', ...c }));
    } catch { return []; }
  });
  const [activeQuizCategoryId, setActiveQuizCategoryId] = useState<string | null>(() => {
    try { const cats = JSON.parse(localStorage.getItem(QUIZ_CATEGORIES_KEY) || '[]'); return cats.length > 0 ? cats[0].id : null; } catch { return null; }
  });
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);

  // ── Per-category config snapshots ──
  interface QuizCategoryConfig {
    quizPrompt: string;
    quizCount: number;
    quizTypes: QuestionType[];
    quizDifficulty: number;
    selectedScenarioId: string;
    selectedVectorIds: string[];
    storeRoles: Record<string, VectorStoreRole[]>;
    // Quiz runtime state snapshot
    activeQuizSnapshot?: {
      session: any;
      currentQIndex: number;
      userAnswers: Record<string, string>;
      debugData: any[];
      // Interview mode state
      interviewHistory?: Array<{
        question: QuizQuestion;
        userAnswer: string;
        evaluation?: AnswerEvaluation;
        isFollowUp: boolean;
        followUpCount: number;
      }>;
      interviewCurrentQ?: QuizQuestion | null;
      interviewQueuedChunks?: any[];
      interviewFollowUpCount?: number;
      interviewTotalNew?: number;
    } | null;
  }
  const QUIZ_CAT_CONFIGS_KEY = 'guyue_quiz_category_configs';
  const [categoryConfigs, setCategoryConfigs] = useState<Record<string, QuizCategoryConfig>>(() => {
    try { return JSON.parse(localStorage.getItem(QUIZ_CAT_CONFIGS_KEY) || '{}'); } catch { return {}; }
  });
  const categoryConfigsRef = useRef(categoryConfigs);
  categoryConfigsRef.current = categoryConfigs;
  const prevCategoryIdRef = useRef<string | null>(activeQuizCategoryId);
  const currentQuizConfigRef = useRef<QuizCategoryConfig>({
    quizPrompt: '', quizCount: 5, quizTypes: ['concept', 'comparison', 'scenario'] as QuestionType[],
    quizDifficulty: 3, selectedScenarioId: 'daily-study', selectedVectorIds: [],
    storeRoles: {},
    activeQuizSnapshot: null,
  });

  // ── Store roles state ──
  const [storeRoles, setStoreRoles] = useState<Record<string, VectorStoreRole[]>>({});
  const [showRolePicker, setShowRolePicker] = useState<{ role: VectorStoreRole; anchorIdx: number } | null>(null);

  // ── Dashboard ──
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [mastery, setMastery] = useState<Record<string, TagMastery>>({});

  // ── Store cache ──
  const storeCache = useRef<Map<string, LocalVectorStore>>(new Map());

  // ══════════════════════════════════════════════════════
  // Persistence & Effects
  // ══════════════════════════════════════════════════════
  useEffect(() => { localStorage.setItem('guyue_kb_selected_collections', JSON.stringify(selectedIds)); }, [selectedIds]);
  useEffect(() => { localStorage.setItem(QUIZ_CATEGORIES_KEY, JSON.stringify(quizCategories)); }, [quizCategories]);
  useEffect(() => { localStorage.setItem(QUIZ_CAT_CONFIGS_KEY, JSON.stringify(categoryConfigs)); }, [categoryConfigs]);

  // Keep currentQuizConfigRef in sync with latest quiz settings
  useEffect(() => {
    currentQuizConfigRef.current = {
      quizPrompt, quizCount, quizTypes: [...quizTypes], quizDifficulty, selectedScenarioId, selectedVectorIds: [...selectedIds],
      storeRoles: { ...storeRoles },
      activeQuizSnapshot: activeQuiz ? {
        session: activeQuiz,
        currentQIndex,
        userAnswers: { ...userAnswers },
        debugData: [...quizDebugData],
        interviewHistory: activeQuiz.mode === 'interview' ? [...interviewHistory] : undefined,
        interviewCurrentQ: activeQuiz.mode === 'interview' ? interviewCurrentQ : undefined,
        interviewQueuedChunks: activeQuiz.mode === 'interview' ? [...interviewQueuedChunks] : undefined,
        interviewFollowUpCount: activeQuiz.mode === 'interview' ? interviewFollowUpCount : undefined,
        interviewTotalNew: activeQuiz.mode === 'interview' ? interviewTotalNew : undefined,
      } : null,
    };
  });

  // Save/restore per-category config on category switch
  useEffect(() => {
    const prevId = prevCategoryIdRef.current;

    if (prevId) {
      const snapshot = { ...currentQuizConfigRef.current };
      setCategoryConfigs(prev => ({ ...prev, [prevId]: snapshot }));
    }

    if (activeQuizCategoryId) {
      const config = categoryConfigsRef.current[activeQuizCategoryId];
      if (config) {
        setQuizPrompt(config.quizPrompt);
        setQuizCount(config.quizCount);
        setQuizTypes(config.quizTypes);
        setQuizDifficulty(config.quizDifficulty);
        setSelectedScenarioId(config.selectedScenarioId);
        setSelectedIds(config.selectedVectorIds);
        setStoreRoles(config.storeRoles || {});
        // Restore quiz state
        if (config.activeQuizSnapshot) {
          setActiveQuiz(config.activeQuizSnapshot.session);
          setCurrentQIndex(config.activeQuizSnapshot.currentQIndex);
          setUserAnswers(config.activeQuizSnapshot.userAnswers);
          setQuizDebugData(config.activeQuizSnapshot.debugData);
          // Restore interview state
          if (config.activeQuizSnapshot.interviewHistory) {
            setInterviewHistory(config.activeQuizSnapshot.interviewHistory);
            setInterviewCurrentQ(config.activeQuizSnapshot.interviewCurrentQ || null);
            setInterviewQueuedChunks(config.activeQuizSnapshot.interviewQueuedChunks || []);
            setInterviewFollowUpCount(config.activeQuizSnapshot.interviewFollowUpCount || 0);
            setInterviewTotalNew(config.activeQuizSnapshot.interviewTotalNew || 0);
          } else {
            setInterviewHistory([]);
            setInterviewCurrentQ(null);
            setInterviewQueuedChunks([]);
            setInterviewFollowUpCount(0);
            setInterviewTotalNew(0);
          }
        } else {
          setActiveQuiz(null);
          setCurrentQIndex(0);
          setUserAnswers({});
          setQuizDebugData([]);
          setInterviewHistory([]);
          setInterviewCurrentQ(null);
          setInterviewQueuedChunks([]);
          setInterviewFollowUpCount(0);
          setInterviewTotalNew(0);
        }
      } else {
        setQuizPrompt('');
        setQuizCount(5);
        setQuizTypes(['concept', 'comparison', 'scenario']);
        setQuizDifficulty(3);
        setSelectedScenarioId('daily-study');
        setStoreRoles({});
        // Reset quiz state
        setActiveQuiz(null);
        setCurrentQIndex(0);
        setUserAnswers({});
        setQuizDebugData([]);
        setInterviewHistory([]);
        setInterviewCurrentQ(null);
        setInterviewQueuedChunks([]);
        setInterviewFollowUpCount(0);
        setInterviewTotalNew(0);
      }
    }

    prevCategoryIdRef.current = activeQuizCategoryId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuizCategoryId]);

  // Save current category config on unmount
  useEffect(() => {
    return () => {
      if (prevCategoryIdRef.current) {
        const snapshot = { ...currentQuizConfigRef.current };
        const id = prevCategoryIdRef.current;
        setCategoryConfigs(prev => ({ ...prev, [id]: snapshot }));
      }
    };
  }, []);

  useEffect(() => { saveKbConversations(KB_AI_CONVERSATIONS_KEY, aiConversations); }, [aiConversations]);
  useEffect(() => { saveKbConversations(KB_QA_CONVERSATIONS_KEY, qaConversations); }, [qaConversations]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [streamingContent, aiConversations, activeAiConvId]);
  useEffect(() => { qaMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [qaConversations, activeQaConvId]);
  useEffect(() => {
    if (!isStreaming && !qaProcessing) {
      const t = setTimeout(() => {
        if (mode === 'ai') textareaRef.current?.focus();
        else if (mode === 'qa') qaTextareaRef.current?.focus();
      }, 80);
      return () => clearTimeout(t);
    }
  }, [isStreaming, qaProcessing, mode]);

  // Load/refresh vector store collections whenever mode changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem('guyue_rag_lab_collections');
      if (raw) {
        const cols: any[] = JSON.parse(raw);
        const mapped = cols.map((c: any) => ({
          id: c.id, name: c.name, vectorCount: c.vectorCount || 0,
          embeddingProvider: c.embeddingProvider, embeddingModel: c.embeddingModel,
          topicVocabulary: c.topicVocabulary,
        }));
        setRagCollections(mapped);
        // Prune selectedIds that no longer exist
        const validIds = new Set(mapped.map(c => c.id));
        setSelectedIds(prev => {
          const pruned = prev.filter(id => validIds.has(id));
          return pruned.length !== prev.length ? pruned : prev;
        });
      }
    } catch {}
  }, [mode]);

  // Reload config from per-feature or global settings when switching to AI mode
  useEffect(() => {
    if (mode === 'ai') {
      const saved = aiLlmConfig;
      let cfg: ChatConfig;
      if (saved?.apiKey) {
        cfg = { ...loadChatConfig(), provider: saved.provider as any, apiKey: saved.apiKey, model: saved.model, baseUrl: saved.baseUrl };
      } else {
        cfg = loadChatConfig();
      }
      setChatConfig(cfg);
      chatServiceRef.current = new ChatService(cfg);
    }
  }, [mode, aiLlmConfig]);

  // Load skills
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SKILLS_STORAGE_KEY);
      if (stored) setSkills(JSON.parse(stored));
    } catch {}
  }, []);

  // Load dashboard data when showing dashboard
  useEffect(() => {
    if (showDashboard) {
      loadStats(activeQuizCategoryId || undefined).then(setStats).catch(() => {});
      loadMastery(activeQuizCategoryId || undefined).then(setMastery).catch(() => {});
    }
  }, [showDashboard, activeQuizCategoryId]);

  // One-time migration: clear legacy global mastery/stats
  useEffect(() => {
    const migrationKey = 'guyue_quiz_mastery_migrated_v2';
    if (!localStorage.getItem(migrationKey)) {
      clearLegacyMastery().then(() => {
        localStorage.setItem(migrationKey, 'true');
      }).catch(() => {});
    }
  }, []);

  // ══════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════
  const toggleCollection = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const loadStore = useCallback(async (id: string): Promise<LocalVectorStore> => {
    if (storeCache.current.has(id)) return storeCache.current.get(id)!;
    const store = await getRawStore(id);
    storeCache.current.set(id, store);
    return store;
  }, []);

  const llmFn = useCallback(() => {
    if (quizLlmConfig?.apiKey) {
      const overriddenSettings: QuizSettings = {
        ...quizSettings,
        llmConfig: { provider: quizLlmConfig.provider as any, apiKey: quizLlmConfig.apiKey, model: quizLlmConfig.model, baseUrl: quizLlmConfig.baseUrl },
      };
      return makeLLMFn(overriddenSettings);
    }
    return makeLLMFn(quizSettings);
  }, [quizSettings, quizLlmConfig]);
  const hasSelection = selectedIds.length > 0;

  const handleQuoteMessage = useCallback((content: string) => {
    const quoted = '> ' + content.replace(/\n/g, '\n> ');
    if (mode === 'ai') setInputValue(prev => prev ? `${quoted}\n\n${prev}` : `${quoted}\n\n`);
    else setQaInput(prev => prev ? `${quoted}\n\n${prev}` : `${quoted}\n\n`);
  }, [mode]);

  // ══════════════════════════════════════════════════════
  // AI Assistant Handlers
  // ══════════════════════════════════════════════════════
  const handleNewAiConv = useCallback(() => {
    const conv = createNewConversation(chatConfig.model, chatConfig.systemPrompt);
    setAiConversations(prev => [conv, ...prev]);
    setActiveAiConvId(conv.id);
    setInputValue('');
    setChatError(null);
  }, [chatConfig]);

  const handleDeleteAiConv = useCallback((id: string) => {
    setAiConversations(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (activeAiConvId === id) setActiveAiConvId(remaining.length > 0 ? remaining[0].id : null);
      return remaining;
    });
  }, [activeAiConvId]);

  // ── File upload helpers ──
  const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
  const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
      json: 'application/json', csv: 'text/csv',
      py: 'text/x-python', js: 'text/javascript', ts: 'text/typescript',
      html: 'text/html', css: 'text/css', xml: 'text/xml',
    };
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_SIZE) { alert(`"${file.name}" 超出 20MB 限制`); continue; }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeType = mimeMap[ext] || file.type || 'application/octet-stream';
      const isImage = IMAGE_MIME_TYPES.has(mimeType);
      if (isImage) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setPendingAttachments(prev => [...prev, { type: 'image', name: file.name, mimeType, base64, size: file.size }]);
      } else {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        setPendingAttachments(prev => [...prev, { type: 'file', name: file.name, mimeType, base64: text, size: file.size }]);
      }
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  }, []);
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); dragCounterRef.current = 0; setIsDragging(false);
    if (e.dataTransfer.files.length > 0) await processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleSendAi = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return;
    setChatError(null);

    let conv = activeAiConv;
    if (!conv) {
      conv = createNewConversation(chatConfig.model, chatConfig.systemPrompt);
      setAiConversations(prev => [conv!, ...prev]);
      setActiveAiConvId(conv.id);
    }

    // Build content with attachment info for API
    let attachmentBlock = '';
    const currentAttachments = [...pendingAttachments];
    if (currentAttachments.length > 0) {
      attachmentBlock = currentAttachments.map(a => {
        if (a.type === 'image') return `[图片：${a.name}]`;
        return `--- ${a.name} ---\n${a.base64.substring(0, 10000)}${a.base64.length > 10000 ? '\n...(内容已截断)' : ''}\n---`;
      }).join('\n\n');
    }
    const rawContent = inputValue.trim();
    const fullContent = attachmentBlock ? `${attachmentBlock}\n\n${rawContent}` : rawContent;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: rawContent, timestamp: Date.now() };
    const assistantMsgId = crypto.randomUUID();
    const userMsgId = userMsg.id;
    const updatedMessages = [...conv.messages, userMsg];
    const apiUserMsg: ChatMessage = { ...userMsg, content: fullContent };
    const apiUpdatedMessages = [...conv.messages, apiUserMsg];
    setAiConversations(prev => prev.map(c => c.id === conv!.id ? { ...c, messages: updatedMessages, updatedAt: Date.now() } : c));
    setInputValue('');
    setPendingAttachments([]);
    setIsStreaming(true);
    setStreamingContent('');

    const effectiveSystemPrompt = conv.systemPrompt !== undefined ? conv.systemPrompt : (chatConfig.systemPrompt || '');
    const effectiveTurnPrompt = aiTurnPrompt.trim();
    const apiMessages: ChatMessage[] = effectiveSystemPrompt
      ? [{ id: 'system', role: 'system', content: effectiveSystemPrompt, timestamp: 0 }, ...apiUpdatedMessages]
      : [...apiUpdatedMessages];
    if (effectiveTurnPrompt) {
      const lastIdx = apiMessages.length - 1;
      apiMessages[lastIdx] = { ...apiMessages[lastIdx], content: `[本轮指令] ${effectiveTurnPrompt}\n\n${apiMessages[lastIdx].content}` };
    }

    const dbg: Record<string, any> = {
      query: rawContent, timestamp: new Date().toISOString(),
      model: chatConfig.model, provider: chatConfig.provider, temperature: chatConfig.temperature,
      turnPrompt: effectiveTurnPrompt || '(none)',
      systemPrompt: effectiveSystemPrompt || '(none)', messageCount: apiMessages.length,
      fullMessages: apiMessages.map(m => ({ role: m.role, content: m.content })),
      attachments: currentAttachments.map(a => ({ name: a.name, type: a.type, size: a.size })),
    };

    try {
      await chatServiceRef.current.sendMessage(apiMessages, {
        onToken: (token) => setStreamingContent(prev => prev + token),
        onComplete: (fullText) => {
          const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: fullText, timestamp: Date.now(), model: chatConfig.model };
          dbg.replyLength = fullText.length;
          addDebugInfo(assistantMsgId, dbg);
          setAiConversations(prev => prev.map(c => {
            if (c.id === conv!.id) {
              const newMsgs = [...updatedMessages, assistantMsg];
              const title = newMsgs.length === 2 ? userMsg.content.substring(0, 30) + (userMsg.content.length > 30 ? '...' : '') : c.title;
              return { ...c, messages: newMsgs, title, updatedAt: Date.now() };
            }
            return c;
          }));
          setIsStreaming(false);
          setStreamingContent('');
        },
        onError: (err) => {
          dbg.error = err.message;
          addDebugInfo(assistantMsgId, dbg);
          setIsStreaming(false); setStreamingContent(''); setChatError(err.message);
        },
      });
    } catch (err: any) {
      dbg.error = err?.message || '发送失败';
      addDebugInfo(assistantMsgId, dbg);
      setChatError(err?.message || '发送失败'); setIsStreaming(false); setStreamingContent('');
    }
  }, [inputValue, isStreaming, activeAiConv, chatConfig, pendingAttachments, addDebugInfo]);

  const handleStopAi = useCallback(() => { chatServiceRef.current.abort(); setIsStreaming(false); }, []);

  // ══════════════════════════════════════════════════════
  // QA Handlers (RAG-based)
  // ══════════════════════════════════════════════════════
  const handleNewQaConv = useCallback(() => {
    const conv: ChatConversation = { id: crypto.randomUUID(), title: '新的问答', messages: [], model: '', createdAt: Date.now(), updatedAt: Date.now() };
    setQaConversations(prev => [conv, ...prev]);
    setActiveQaConvId(conv.id);
    setQaInput('');
  }, []);

  const handleDeleteQaConv = useCallback((id: string) => {
    setQaConversations(prev => {
      const remaining = prev.filter(c => c.id !== id);
      if (activeQaConvId === id) setActiveQaConvId(remaining.length > 0 ? remaining[0].id : null);
      return remaining;
    });
  }, [activeQaConvId]);

  const handleSendQa = useCallback(async () => {
    if (!qaInput.trim() || qaProcessing || !hasSelection) return;
    const msg = qaInput.trim();

    let conv = activeQaConv;
    if (!conv) {
      conv = { id: crypto.randomUUID(), title: '新的问答', messages: [], model: '', createdAt: Date.now(), updatedAt: Date.now() };
      setQaConversations(prev => [conv!, ...prev]);
      setActiveQaConvId(conv.id);
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: msg, timestamp: Date.now() };
    const placeholderId = crypto.randomUUID();
    const placeholderMsg: ChatMessage = { id: placeholderId, role: 'assistant', content: '正在检索知识库...', timestamp: Date.now() };

    const prevMessages = conv.messages;
    setQaConversations(prev => prev.map(c => c.id === conv!.id ? { ...c, messages: [...c.messages, userMsg, placeholderMsg], updatedAt: Date.now() } : c));
    setQaInput('');
    setQaProcessing(true);

    const dbg: Record<string, any> = { query: msg, timestamp: new Date().toISOString(), selectedCollections: selectedIds, turnPrompt: qaTurnPrompt.trim() || '(none)' };

    try {
      const embCfg = getEmbeddingConfig();
      dbg.embeddingConfig = { provider: embCfg.provider, model: embCfg.model, hasKey: !!embCfg.apiKey, baseUrl: embCfg.baseUrl };
      if (!embCfg.apiKey) throw new Error('Embedding API Key 未配置。请在 RAG 文档库中配置 Embedding 设置。');

      let allResults: any[] = [];
      const retrievalErrors: string[] = [];

      // 使用 VectorService 统一 API 进行多库联合检索（使用向量库保存的配置）
      // 构建 LLM 函数以支持检索前优化（查询改写 / HyDE）
      const qaLlmCfg: ChatConfig = qaLlmConfig?.apiKey
        ? { ...loadChatConfig(), provider: qaLlmConfig.provider as any, apiKey: qaLlmConfig.apiKey, model: qaLlmConfig.model, baseUrl: qaLlmConfig.baseUrl }
        : chatConfig;
      const preRetrievalLlmFn = qaLlmCfg.apiKey ? makeLlmFnFromConfig(qaLlmCfg) : undefined;

      try {
        const multiResult = await vectorServiceSearchMultiple(selectedIds, msg, embCfg, {
          topK: 5,
          useCollectionConfig: true,
          llmFn: preRetrievalLlmFn,
        });
        allResults = multiResult.results.map(r => ({
          text: r.text,
          score: r.score,
          metadata: r.metadata,
          nodeId: r.nodeId,
        }));
        for (const colRes of multiResult.perCollection) {
          dbg[`store_${colRes.collectionId}`] = { resultCount: colRes.results.length };
        }
        for (const errMsg of multiResult.errors) {
          retrievalErrors.push(errMsg);
        }
      } catch (e: any) {
        retrievalErrors.push(e?.message || String(e));
      }
      if (retrievalErrors.length > 0) dbg.retrievalErrors = retrievalErrors;

      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      const top = allResults.slice(0, 5);
      dbg.totalResults = allResults.length;
      dbg.topResults = top.map((r: any) => ({
        score: r.score, fileName: r.metadata?.fileName, textPreview: (r.text || '').substring(0, 100),
      }));

      const contextBlock = top.length > 0
        ? top.map((r: any, i: number) => {
            const m = r.metadata || {};
            const parts: string[] = [m.fileName || '未知'];
            if (m.pageNumber != null) parts.push(`第${m.pageNumber}页`);
            if (m.sectionTitle) parts.push(`「${m.sectionTitle}」`);
            if (m.lineStart != null) parts.push(`行${m.lineStart}-${m.lineEnd ?? m.lineStart}`);
            if (m.codeLanguage) parts.push(`(${m.codeLanguage})`);
            return `### 片段 ${i + 1}（来源：${parts.join(' ')}，相关度：${Math.round((r.score || 0) * 100)}%）\n${r.text}`;
          }).join('\n\n')
        : '未检索到相关内容。';

      const kbSystemPrompt = `你是「知识库助手」，基于用户的向量知识库回答问题。\n\n## 规则\n1. 优先根据下方「知识库检索结果」中的内容回答，可以结合自身知识补充。\n2. 如果检索结果中没有相关内容，诚实告知，但仍可用通用知识尝试回答并标注。\n3. 回答末尾标注引用来源，包括文件名、页码和章节信息。\n\n## 知识库检索结果\n${contextBlock}`;
      dbg.systemPrompt = kbSystemPrompt;

      setQaConversations(prev => prev.map(c => c.id === conv!.id
        ? { ...c, messages: c.messages.map(m => m.id === placeholderId ? { ...m, content: '正在生成回答...' } : m) }
        : c));

      const historyMsgs = prevMessages.filter(m => m.role !== 'system').slice(-6);
      const chatMessages: ChatMessage[] = [
        { id: 'system', role: 'system', content: kbSystemPrompt, timestamp: 0 },
        ...historyMsgs.map(m => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp })),
        { id: userMsg.id, role: 'user', content: userMsg.content, timestamp: userMsg.timestamp },
      ];
      if (qaTurnPrompt.trim()) {
        const lastIdx = chatMessages.length - 1;
        chatMessages[lastIdx] = { ...chatMessages[lastIdx], content: `[本轮指令] ${qaTurnPrompt.trim()}\n\n${userMsg.content}` };
      }
      // Use per-feature QA config if available, otherwise fall back to AI config
      const qaConfig: ChatConfig = qaLlmConfig?.apiKey
        ? { ...loadChatConfig(), provider: qaLlmConfig.provider as any, apiKey: qaLlmConfig.apiKey, model: qaLlmConfig.model, baseUrl: qaLlmConfig.baseUrl }
        : chatConfig;
      const qaService = qaLlmConfig?.apiKey ? new ChatService(qaConfig) : chatServiceRef.current;

      dbg.llmRequest = { model: qaConfig.model, provider: qaConfig.provider, baseUrl: qaConfig.baseUrl, temperature: qaConfig.temperature, messageCount: chatMessages.length };
      dbg.fullMessages = chatMessages.map(m => ({ role: m.role, content: m.content }));

      const reply = await qaService.completeText(chatMessages);
      dbg.replyLength = reply?.length || 0;
      const isFirstMsg = prevMessages.filter(m => m.role === 'user').length === 0;
      const newTitle = isFirstMsg ? msg.substring(0, 30) + (msg.length > 30 ? '...' : '') : undefined;

      setQaConversations(prev => prev.map(c => c.id === conv!.id
        ? { ...c, title: newTitle || c.title, messages: c.messages.map(m => m.id === placeholderId ? { ...m, content: reply || '未获得回复。' } : m), updatedAt: Date.now() }
        : c));
    } catch (err: any) {
      dbg.error = err?.message || String(err);
      setQaConversations(prev => prev.map(c => c.id === conv!.id
        ? { ...c, messages: c.messages.map(m => m.id === placeholderId ? { ...m, content: `❌ 发生错误: ${err?.message || String(err)}` } : m) }
        : c));
    } finally {
      setQaProcessing(false);
      addDebugInfo(placeholderId, dbg);
    }
  }, [qaInput, qaProcessing, hasSelection, activeQaConv, selectedIds, loadStore, chatConfig, qaLlmConfig, addDebugInfo]);

  // ══════════════════════════════════════════════════════
  // Conversation Rename
  // ══════════════════════════════════════════════════════
  const handleStartRename = useCallback((id: string, title: string) => { setRenamingConvId(id); setRenameValue(title); }, []);
  const handleFinishRename = useCallback((isQa: boolean) => {
    if (renamingConvId && renameValue.trim()) {
      const setter = isQa ? setQaConversations : setAiConversations;
      setter(prev => prev.map(c => c.id === renamingConvId ? { ...c, title: renameValue.trim() } : c));
    }
    setRenamingConvId(null);
    setRenameValue('');
  }, [renamingConvId, renameValue]);

  // ══════════════════════════════════════════════════════
  // Quiz Handlers (carried over from previous version)
  // ══════════════════════════════════════════════════════
  const handleGenerateQuiz = useCallback(async () => {
    if (!hasSelection || quizGenerating) return;
    setQuizGenerating(true);
    setQuizProgress('准备中…');
    const debugLog: any[] = [];
    try {
      const stores: LocalVectorStore[] = [];
      for (const id of selectedIds) { try { stores.push(await loadStore(id)); } catch {} }
      if (stores.length === 0) throw new Error('无法加载向量库');

      // Build StoreContext[] — pairs each store with its collection metadata + embedding config
      const globalEmbCfg = getEmbeddingConfig();
      const storeContexts: StoreContext[] = stores.map((store, idx) => {
        const col = ragCollections.find(c => c.id === selectedIds[idx]);
        // Use per-store embedding config if available, else global
        const embCfg = col?.embeddingProvider && col?.embeddingModel
          ? { ...globalEmbCfg, provider: col.embeddingProvider as any, model: col.embeddingModel }
          : globalEmbCfg;
        return {
          store,
          storeId: selectedIds[idx],
          name: col?.name || selectedIds[idx],
          topicVocabulary: col?.topicVocabulary,
          embeddingConfig: embCfg,
        };
      });

      const scenario = allScenarios.find(s => s.id === selectedScenarioId);
      const rolePromptStr = scenario?.systemPrompt?.trim() || undefined;
      const quizDirectionStr = quizPrompt?.trim() || undefined;
      // Wrap LLM fn for debug capture
      const baseFn = llmFn();
      const debugFn: LLMFunction = async (prompt: string, systemPrompt?: string) => {
        const startTime = Date.now();
        const response = await baseFn(prompt, systemPrompt);
        debugLog.push({
          timestamp: Date.now(), duration: Date.now() - startTime,
          prompt, response, promptLength: prompt.length, responseLength: response.length,
          type: 'generation',
        });
        return response;
      };
      const plan = await buildSessionPlan(
        storeContexts, debugFn, getEmbeddingConfig(),
        { totalQuestions: quizCount, reviewRatio: 0.3, weakPointRatio: 0.3, newKnowledgeRatio: 0.3, randomReviewRatio: 0.1 },
        quizTypes, quizDifficulty, rolePromptStr, quizDirectionStr,
        (done, total, status) => setQuizProgress(`${status} (${done}/${total})`),
        storeRoles,
        activeQuizCategoryId || undefined,
      );
      if (!plan.questions || plan.questions.length === 0) throw new Error('未能生成任何题目，请检查模型设置');
      setQuizDebugData(debugLog);
      const isInterview = selectedScenarioId === 'interview-prep';
      const session: QuizSession = {
        id: `session-${Date.now()}`, mode: isInterview ? 'interview' : 'practice', collectionIds: [...selectedIds],
        topic: quizPrompt || scenario?.name || undefined, attempts: [], startedAt: Date.now(),
        status: isInterview ? 'interview_active' : 'answering',
      };
      (session as any)._questions = plan.questions;
      (session as any)._composition = plan.composition;
      (session as any)._scenarioId = selectedScenarioId;
      (session as any)._customName = '';
      (session as any)._categoryId = activeQuizCategoryId;
      setActiveQuiz(session);

      if (isInterview) {
        setInterviewHistory([]);
        setInterviewCurrentQ(plan.questions[0] || null);
        setInterviewAnswer('');
        setInterviewFollowUpCount(0);
        setInterviewTotalNew(1);
        setInterviewMaxQuestions(quizCount);
        setInterviewQueuedChunks(plan.questions.slice(1));
      } else {
        setCurrentQIndex(0);
        setUserAnswers({});
      }

      const updated = [session, ...recentSessions.filter(s => s.id !== session.id)].slice(0, 50);
      setRecentSessions(updated);
      saveRecentSessions(updated);
    } catch (err: any) { alert(`出题失败: ${err?.message || '未知错误'}`); }
    finally { setQuizGenerating(false); setQuizProgress(''); }
  }, [hasSelection, quizGenerating, selectedIds, loadStore, llmFn, quizCount, quizTypes, quizDifficulty, quizPrompt, selectedScenarioId, allScenarios, recentSessions, activeQuizCategoryId, storeRoles, ragCollections]);

  const handleExitQuiz = useCallback(() => {
    if (!activeQuiz) { setActiveQuiz(null); return; }
    const updated = recentSessions.map(s => {
      if (s.id !== activeQuiz.id) return s;
      const saved = { ...activeQuiz };
      (saved as any)._userAnswers = { ...userAnswers };
      (saved as any)._currentQIndex = currentQIndex;
      return saved;
    });
    if (!updated.find(s => s.id === activeQuiz.id)) updated.unshift(activeQuiz);
    const sliced = updated.slice(0, 50);
    setRecentSessions(sliced);
    saveRecentSessions(sliced);
    setActiveQuiz(null);
    // Clear interview state
    setInterviewHistory([]);
    setInterviewCurrentQ(null);
    setInterviewAnswer('');
    setInterviewFollowUpCount(0);
    setInterviewTotalNew(0);
  }, [activeQuiz, recentSessions, userAnswers, currentQIndex]);

  const handleResumeQuiz = useCallback((session: QuizSession) => {
    setActiveQuiz(session);
    setUserAnswers((session as any)._userAnswers || {});
    setCurrentQIndex((session as any)._currentQIndex || 0);
    // Restore interview state
    if (session.mode === 'interview') {
      const hist = (session as any)._interviewHistory || [];
      setInterviewHistory(hist);
      const questions: QuizQuestion[] = (session as any)._questions || [];
      const answeredCount = hist.filter((h: any) => !h.isFollowUp).length;
      setInterviewCurrentQ(questions[answeredCount] || null);
      setInterviewQueuedChunks(questions.slice(answeredCount + 1));
      setInterviewFollowUpCount(0);
      setInterviewTotalNew(answeredCount + (questions[answeredCount] ? 1 : 0));
      setInterviewMaxQuestions(questions.length);
      setInterviewAnswer('');
    }
  }, []);

  const handleGradeQuiz = useCallback(async () => {
    if (!activeQuiz) return;
    const questions: QuizQuestion[] = (activeQuiz as any)._questions || [];
    if (questions.length === 0) return;
    const gradingSession = { ...activeQuiz, status: 'grading' as const };
    setActiveQuiz(gradingSession);
    const gradingHistory = recentSessions.map(s => s.id === gradingSession.id ? gradingSession : s);
    setRecentSessions(gradingHistory);
    saveRecentSessions(gradingHistory);
    const embCfg = getEmbeddingConfig();
    const baseFn = llmFn();
    const gradeDebugLog: any[] = [];
    const debugFn: LLMFunction = async (prompt: string, systemPrompt?: string) => {
      const startTime = Date.now();
      const response = await baseFn(prompt, systemPrompt);
      gradeDebugLog.push({
        timestamp: Date.now(), duration: Date.now() - startTime,
        prompt, response, promptLength: prompt.length, responseLength: response.length,
        type: 'scoring',
      });
      return response;
    };
    const attempts: QuizAttempt[] = [];
    let totalScore = 0;
    for (let i = 0; i < questions.length; i++) {
      setGradingIndex(i);
      const q = questions[i];
      const answer = userAnswers[q.id] || '';
      let evaluation: AnswerEvaluation;
      try { evaluation = await evaluate(q, answer, embCfg, debugFn); }
      catch {
        evaluation = {
          totalScore: 0, dimensions: {
            keyPointCoverage: { score: 0, matches: q.keyPoints.map(kp => ({ keyPoint: kp, status: 'missed' as const, similarity: 0 })) },
            accuracy: { score: 0, errors: [] }, completeness: { score: 0, feedback: '评分失败' }, clarity: { score: 0, feedback: '' },
          },
          overallFeedback: '评分过程出错', suggestions: [], masteryLevel: 'not_mastered',
          meta: { cosineSimilarity: 0, keyPointHitRate: 0, llmRawScore: 0, calibratedScore: 0, scoringTimeMs: 0 },
        };
      }
      // Add evaluation meta to debug log
      gradeDebugLog.push({
        timestamp: Date.now(), duration: evaluation.meta.scoringTimeMs,
        type: 'eval_meta',
        questionIndex: i,
        questionText: q.question.slice(0, 60),
        meta: evaluation.meta,
        keyPointMatches: evaluation.dimensions.keyPointCoverage.matches.map(m => ({
          keyPoint: m.keyPoint, status: m.status, similarity: m.similarity,
        })),
        embeddingConfig: { provider: embCfg.provider, model: embCfg.model, hasKey: !!embCfg.apiKey },
      });
      attempts.push({ id: `attempt-${i}`, questionId: q.id, question: q, userAnswer: answer, evaluation, timeSpentMs: 0, createdAt: Date.now() });
      totalScore += evaluation.totalScore;
      try { await updateMasteryAfterAnswer(q, evaluation.totalScore, activeQuizCategoryId || undefined); } catch {}
    }
    setQuizDebugData(prev => [...prev, ...gradeDebugLog]);
    let summary: SessionSummary | undefined;
    try {
      const scores = attempts.map(a => a.evaluation.totalScore);
      const tags = attempts.map(a => a.question.tags);
      const { overallGrade, recommendation } = await generateSessionSummary(scores, tags, debugFn);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      summary = { totalQuestions: questions.length, avgScore: avg, maxScore: Math.max(...scores), minScore: Math.min(...scores), strongPoints: [], weakPoints: [], overallGrade: overallGrade as any, recommendation };
    } catch {}
    const completed: QuizSession = { ...activeQuiz, attempts, summary, status: 'completed', finishedAt: Date.now() };
    (completed as any)._questions = questions;
    setActiveQuiz(completed);
    setGradingIndex(-1);
    try { await recordSessionStats(completed, activeQuizCategoryId || undefined); } catch {}
    const updatedHist = [completed, ...recentSessions.filter(s => s.id !== completed.id)].slice(0, 50);
    setRecentSessions(updatedHist);
    saveRecentSessions(updatedHist);
  }, [activeQuiz, userAnswers, llmFn, recentSessions, activeQuizCategoryId]);

  // ── Interview mode: submit answer, grade, decide follow-up ──
  const handleInterviewSubmit = useCallback(async () => {
    if (!activeQuiz || !interviewCurrentQ || interviewGrading || !interviewAnswer.trim()) return;

    setInterviewGrading(true);
    const debugLog: any[] = [];

    try {
      const embCfg = getEmbeddingConfig();
      const baseFn = llmFn();
      const debugFn: LLMFunction = async (prompt: string, systemPrompt?: string) => {
        const startTime = Date.now();
        const response = await baseFn(prompt, systemPrompt);
        debugLog.push({
          timestamp: Date.now(), duration: Date.now() - startTime,
          prompt, response, promptLength: prompt.length, responseLength: response.length,
          type: 'scoring',
        });
        return response;
      };

      // Grade the answer
      const evaluation = await evaluate(interviewCurrentQ, interviewAnswer, embCfg, debugFn, true);

      // Add eval diagnostics to debug
      debugLog.push({
        timestamp: Date.now(), duration: evaluation.meta.scoringTimeMs,
        type: 'eval_meta',
        questionText: interviewCurrentQ.question.slice(0, 60),
        meta: evaluation.meta,
        keyPointMatches: evaluation.dimensions.keyPointCoverage.matches.map(m => ({
          keyPoint: m.keyPoint, status: m.status, similarity: m.similarity,
        })),
        embeddingConfig: { provider: embCfg.provider, model: embCfg.model, hasKey: !!embCfg.apiKey },
        interviewDecision: { shouldFollowUp: evaluation.shouldFollowUp, followUpReason: evaluation.followUpReason },
      });

      // Update mastery
      try { await updateMasteryAfterAnswer(interviewCurrentQ, evaluation.totalScore, activeQuizCategoryId || undefined); } catch {}

      // Add to history
      const historyEntry = {
        question: interviewCurrentQ,
        userAnswer: interviewAnswer,
        evaluation,
        isFollowUp: interviewCurrentQ.type === 'follow_up',
        followUpCount: interviewFollowUpCount,
      };
      const newHistory = [...interviewHistory, historyEntry];
      setInterviewHistory(newHistory);

      // Add attempt to session
      const attempt: QuizAttempt = {
        id: `attempt-${newHistory.length}`,
        questionId: interviewCurrentQ.id,
        question: interviewCurrentQ,
        userAnswer: interviewAnswer,
        evaluation,
        timeSpentMs: 0,
        createdAt: Date.now(),
      };
      const updatedSession = { ...activeQuiz, attempts: [...activeQuiz.attempts, attempt] };
      (updatedSession as any)._questions = (activeQuiz as any)._questions;
      (updatedSession as any)._composition = (activeQuiz as any)._composition;
      (updatedSession as any)._scenarioId = (activeQuiz as any)._scenarioId;
      (updatedSession as any)._customName = (activeQuiz as any)._customName;
      (updatedSession as any)._categoryId = (activeQuiz as any)._categoryId;
      (updatedSession as any)._interviewHistory = newHistory;
      setActiveQuiz(updatedSession);

      // Add debug data
      setQuizDebugData(prev => [...prev, ...debugLog]);

      // Decide: follow-up or next question
      const score = evaluation.totalScore;
      const missedPoints = evaluation.dimensions.keyPointCoverage.matches
        .filter(m => m.status === 'missed')
        .map(m => m.keyPoint);
      const hitPoints = evaluation.dimensions.keyPointCoverage.matches
        .filter(m => m.status === 'hit')
        .map(m => m.keyPoint);
      const errors = evaluation.dimensions.accuracy.errors;

      const shouldFollowUp = evaluation.shouldFollowUp === true && interviewFollowUpCount < 3;

      if (shouldFollowUp) {
        try {
          const followUp = await generateFollowUp(
            interviewCurrentQ, interviewAnswer, score,
            hitPoints, missedPoints, errors, debugFn,
          );
          setInterviewCurrentQ(followUp);
          setInterviewFollowUpCount(prev => prev + 1);
          setInterviewAnswer('');
        } catch {
          doMoveToNext(updatedSession, newHistory, attempt);
        }
      } else {
        doMoveToNext(updatedSession, newHistory, attempt);
      }

      function doMoveToNext(sess: QuizSession, hist: typeof interviewHistory, att: QuizAttempt) {
        if (interviewTotalNew >= interviewMaxQuestions) {
          doFinishInterview(sess, hist, att);
        } else {
          const nextQ = interviewQueuedChunks[0];
          if (nextQ) {
            setInterviewCurrentQ(nextQ);
            setInterviewQueuedChunks(prev => prev.slice(1));
            setInterviewFollowUpCount(0);
            setInterviewTotalNew(prev => prev + 1);
            setInterviewAnswer('');
          } else {
            doFinishInterview(sess, hist, att);
          }
        }
      }

      async function doFinishInterview(sess: QuizSession, _hist: typeof interviewHistory, lastAttempt: QuizAttempt) {
        const allAttempts = [...sess.attempts, lastAttempt];
        let summary: SessionSummary | undefined;
        try {
          const scores = allAttempts.map(a => a.evaluation.totalScore);
          const tags = allAttempts.map(a => a.question.tags);
          const { overallGrade, recommendation } = await generateSessionSummary(scores, tags, debugFn);
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          summary = { totalQuestions: allAttempts.length, avgScore: avg, maxScore: Math.max(...scores), minScore: Math.min(...scores), strongPoints: [], weakPoints: [], overallGrade: overallGrade as any, recommendation };
        } catch {}
        const completed: QuizSession = { ...sess, attempts: allAttempts, summary, status: 'completed', finishedAt: Date.now() };
        (completed as any)._questions = (activeQuiz as any)?._questions;
        (completed as any)._interviewHistory = (activeQuiz as any)?._interviewHistory || [];
        setActiveQuiz(completed);
        setInterviewCurrentQ(null);
        try { await recordSessionStats(completed, activeQuizCategoryId || undefined); } catch {}
        const updatedHist = [completed, ...recentSessions.filter(s => s.id !== completed.id)].slice(0, 50);
        setRecentSessions(updatedHist);
        saveRecentSessions(updatedHist);
      }

    } catch (err: any) {
      console.error('[Interview] 评分失败:', err);
      setInterviewHistory(prev => [...prev, {
        question: interviewCurrentQ!,
        userAnswer: interviewAnswer,
        isFollowUp: interviewCurrentQ!.type === 'follow_up',
        followUpCount: interviewFollowUpCount,
      }]);
    } finally {
      setInterviewGrading(false);
    }
  }, [activeQuiz, interviewCurrentQ, interviewAnswer, interviewGrading, interviewHistory, interviewFollowUpCount, interviewTotalNew, interviewMaxQuestions, interviewQueuedChunks, llmFn, activeQuizCategoryId, recentSessions]);

  // History management
  const handleRenameSession = useCallback((sessionId: string, newName: string) => {
    const updated = recentSessions.map(s => { if (s.id !== sessionId) return s; const copy = { ...s }; (copy as any)._customName = newName; return copy; });
    setRecentSessions(updated);
    saveRecentSessions(updated);
    setEditingSessionName(null);
  }, [recentSessions]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const updated = recentSessions.filter(s => s.id !== sessionId);
    setRecentSessions(updated);
    saveRecentSessions(updated);
  }, [recentSessions]);

  // Scenario management
  const handleSaveScenario = useCallback((scenario: QuizScenario) => {
    const existing = quizSettings.scenarios || [];
    const idx = existing.findIndex(s => s.id === scenario.id);
    let updated: QuizScenario[];
    if (idx >= 0) { updated = [...existing]; updated[idx] = scenario; } else { updated = [...existing, scenario]; }
    const newSettings = { ...quizSettings, scenarios: updated };
    setQuizSettings(newSettings);
    saveSettings(newSettings);
    setEditingScenario(null);
    setShowScenarioEditor(false);
  }, [quizSettings]);

  const handleDeleteScenario = useCallback((scenarioId: string) => {
    const updated = (quizSettings.scenarios || []).filter(s => s.id !== scenarioId);
    const newSettings = { ...quizSettings, scenarios: updated };
    setQuizSettings(newSettings);
    saveSettings(newSettings);
    if (selectedScenarioId === scenarioId) setSelectedScenarioId('daily-study');
  }, [quizSettings, selectedScenarioId]);

  // ══════════════════════════════════════════════════════
  // Styles
  // ══════════════════════════════════════════════════════
  const panelCls = 'bg-white border border-gray-200 rounded-xl';
  const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none transition-colors';
  const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
  const btnSecondary = 'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors';

  // ══════════════════════════════════════════════════════
  // Left Sidebar: Conversation List
  // ══════════════════════════════════════════════════════
  function renderConversationSidebar(conversations: ChatConversation[], activeId: string | null, setActiveId: (id: string) => void, onNew: () => void, onDelete: (id: string) => void, isQa: boolean) {
    const accentColor = isQa ? 'green' : 'purple';
    return (
      <div className="w-[220px] shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
        <div className="h-12 border-b border-gray-100 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {isQa ? <KBAvatar /> : <AIAvatar />}
            <span className="font-semibold text-gray-800 text-xs">{isQa ? '知识库对话' : 'AI 对话'}</span>
          </div>
          <button onClick={onNew} className={`p-1.5 hover:bg-${accentColor}-50 rounded-lg text-gray-500 hover:text-${accentColor}-600 transition-colors`} title="新建对话">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-8">{isQa ? <Brain className="w-6 h-6 mx-auto mb-2 opacity-40" /> : <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-40" />}暂无对话</div>
          ) : conversations.map(conv => {
            const isActive = activeId === conv.id;
            const isRenaming = renamingConvId === conv.id;
            return (
              <button key={conv.id} onClick={() => setActiveId(conv.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left group transition-all ${isActive ? `bg-${accentColor}-50 text-${accentColor}-700 shadow-sm` : 'hover:bg-gray-50 text-gray-700'}`}>
                <div className="flex-1 min-w-0">
                  {isRenaming ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleFinishRename(isQa)}
                      onKeyDown={e => { if (e.key === 'Enter') handleFinishRename(isQa); if (e.key === 'Escape') { setRenamingConvId(null); setRenameValue(''); } e.stopPropagation(); }}
                      onClick={e => e.stopPropagation()}
                      className={`w-full text-xs bg-white border border-${accentColor}-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-${accentColor}-400`} />
                  ) : (
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                  )}
                </div>
                {!isRenaming && (
                  <>
                    <button onClick={e => { e.stopPropagation(); handleStartRename(conv.id, conv.title); }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-all flex-shrink-0"><Pencil className="w-3 h-3" /></button>
                    <button onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-500 rounded transition-all flex-shrink-0"><Trash2 className="w-3 h-3" /></button>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {/* QA mode: show selected vector stores indicator */}
        {isQa && (
          <div className="p-3 border-t border-gray-100">
            <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-1"><Database className="w-3 h-3" /> 向量库</div>
            <div className="flex flex-wrap gap-1.5">
              {ragCollections.length === 0 ? (
                <span className="text-[10px] text-gray-400">暂无向量库</span>
              ) : ragCollections.map(c => {
                const selected = selectedIds.includes(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCollection(c.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      selected
                        ? 'bg-green-50 text-green-700 border-green-300 font-medium shadow-sm'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-600'
                    }`}>{c.name}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Left Sidebar: Quiz Category List (for Quiz mode)
  // ══════════════════════════════════════════════════════
  function renderQuizCategorySidebar() {
    return (
      <div className="w-[220px] shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
        <div className="h-12 border-b border-gray-100 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-purple-500" />
            <span className="font-semibold text-gray-800 text-xs">智能测验</span>
          </div>
          <button
            className="p-1.5 hover:bg-purple-50 rounded-lg text-gray-500 hover:text-purple-600 transition-colors"
            title="新建分类"
            onClick={() => {
              const cat: QuizCategory = { id: `cat-${Date.now()}`, name: '新分类', icon: 'GraduationCap', color: '#8b5cf6', createdAt: Date.now() };
              setQuizCategories(prev => [cat, ...prev]);
              setActiveQuizCategoryId(cat.id);
              setRenamingCategoryId(cat.id);
              setCategoryNameInput('新分类');
            }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {quizCategories.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-8"><GraduationCap className="w-6 h-6 mx-auto mb-2 opacity-40" />暂无分类</div>
          ) : quizCategories.map(cat => {
            return (
            <div key={cat.id}
              draggable
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragCategoryId(cat.id); }}
              onDragEnd={() => { setDragCategoryId(null); setDragOverCategoryId(null); }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCategoryId(cat.id); }}
              onDragLeave={() => { if (dragOverCategoryId === cat.id) setDragOverCategoryId(null); }}
              onDrop={e => {
                e.preventDefault();
                if (dragCategoryId && dragCategoryId !== cat.id) {
                  setQuizCategories(prev => {
                    const items = [...prev];
                    const fromIdx = items.findIndex(c => c.id === dragCategoryId);
                    const toIdx = items.findIndex(c => c.id === cat.id);
                    if (fromIdx === -1 || toIdx === -1) return prev;
                    const [moved] = items.splice(fromIdx, 1);
                    items.splice(toIdx, 0, moved);
                    return items;
                  });
                }
                setDragCategoryId(null);
                setDragOverCategoryId(null);
              }}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                activeQuizCategoryId === cat.id
                  ? 'font-medium border shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 border border-transparent'
              } ${dragOverCategoryId === cat.id && dragCategoryId !== cat.id ? 'border-t-2 border-t-purple-400' : ''} ${dragCategoryId === cat.id ? 'opacity-40' : ''}`}
              style={activeQuizCategoryId === cat.id ? { backgroundColor: cat.color + '15', color: cat.color, borderColor: cat.color + '40' } : undefined}
              onClick={() => setActiveQuizCategoryId(cat.id)}>
              {renamingCategoryId === cat.id ? (
                <div className="flex-1 space-y-1.5" onClick={e => e.stopPropagation()}>
                  <input
                    className="w-full text-xs bg-white border border-purple-300 rounded px-1.5 py-0.5 outline-none"
                    value={categoryNameInput}
                    onChange={e => setCategoryNameInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setQuizCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: categoryNameInput.trim() || '未命名' } : c));
                        setRenamingCategoryId(null);
                      }
                      if (e.key === 'Escape') setRenamingCategoryId(null);
                    }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="grid grid-cols-6 gap-1 max-h-32 overflow-y-auto">
                    {QUIZ_CATEGORY_ICONS.map(iconName => (
                      <button key={iconName}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-all ${
                          cat.icon === iconName ? 'ring-2 ring-offset-1 shadow-sm' : 'hover:bg-gray-100'
                        }`}
                        style={cat.icon === iconName ? { backgroundColor: cat.color + '20', color: cat.color } : undefined}
                        onClick={e => { e.stopPropagation(); setQuizCategories(prev => prev.map(c => c.id === cat.id ? { ...c, icon: iconName } : c)); }}
                      >
                        <QuizIconRender name={iconName} className="w-3.5 h-3.5" color={cat.icon === iconName ? cat.color : '#9ca3af'} />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c}
                        className={`w-5 h-5 rounded-full transition-all ${cat.color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                        onClick={e => { e.stopPropagation(); setQuizCategories(prev => prev.map(ct => ct.id === cat.id ? { ...ct, color: c } : ct)); }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-end gap-1 pt-0.5">
                    <button
                      className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                      onClick={e => { e.stopPropagation(); setRenamingCategoryId(null); }}
                    >取消</button>
                    <button
                      className="text-[10px] px-2 py-0.5 rounded bg-purple-500 text-white hover:bg-purple-600"
                      onClick={e => {
                        e.stopPropagation();
                        setQuizCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: categoryNameInput.trim() || '未命名' } : c));
                        setRenamingCategoryId(null);
                      }}
                    >✓ 确认</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: cat.color + '20' }}>
                    <QuizIconRender name={cat.icon} className="w-3 h-3" color={cat.color} />
                  </div>
                  <span className="flex-1 text-xs truncate">{cat.name}</span>
                  <span className="text-[10px] text-gray-400">{recentSessions.filter(s => (s as any)._categoryId === cat.id).length}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button className="p-0.5 rounded hover:bg-gray-200" onClick={e => {
                      e.stopPropagation();
                      setRenamingCategoryId(cat.id);
                      setCategoryNameInput(cat.name);
                    }}><Pencil size={10} className="text-gray-400" /></button>
                    <button className="p-0.5 rounded hover:bg-red-100" onClick={e => {
                      e.stopPropagation();
                      if (confirm(`删除分类「${cat.name}」？其中的测验历史将保留。`)) {
                        setQuizCategories(prev => prev.filter(c => c.id !== cat.id));
                        setCategoryConfigs(prev => { const next = { ...prev }; delete next[cat.id]; return next; });
                        if (activeQuizCategoryId === cat.id) {
                          const remaining = quizCategories.filter(c => c.id !== cat.id);
                          setActiveQuizCategoryId(remaining.length > 0 ? remaining[0].id : null);
                        }
                      }
                    }}><Trash2 size={10} className="text-gray-400 hover:text-red-500" /></button>
                  </div>
                </>
              )}
            </div>
          );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Debug Panel
  // ══════════════════════════════════════════════════════
  function renderDebugPanel(msgId: string) {
    const info = debugInfo[msgId];
    if (!info) return null;
    return (
      <div className="mx-12 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1.5 font-mono">
        <div className="flex items-center justify-between">
          <span className="font-bold text-amber-700 flex items-center gap-1"><Bug size={12} /> 调试信息</span>
          <button onClick={() => setDebugMsgId(null)} className="text-amber-500 hover:text-amber-700"><X size={14} /></button>
        </div>
        {Object.entries(info).map(([key, val]) => {
          const isLong = typeof val === 'string' && val.length > 100;
          const isObj = typeof val === 'object' && val !== null;
          return (
            <details key={key} className="group" open={!isLong && !isObj}>
              <summary className="cursor-pointer text-amber-800 hover:text-amber-900 select-none">
                <span className="font-medium">{key}</span>
                {!isObj && !isLong && <span className="text-gray-600 ml-2">{String(val)}</span>}
                {isObj && <span className="text-gray-400 ml-2">[{Array.isArray(val) ? `${val.length} items` : 'object'}]</span>}
                {isLong && <span className="text-gray-400 ml-2">[{val.length} chars]</span>}
              </summary>
              {(isObj || isLong) && (
                <pre className="mt-1 p-2 bg-white rounded border border-amber-100 text-[10px] text-gray-700 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                  {isObj ? JSON.stringify(val, null, 2) : String(val)}
                </pre>
              )}
            </details>
          );
        })}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // System Prompt Panel (for AI mode)
  // ══════════════════════════════════════════════════════
  function renderSystemPromptPanel() {
    if (!showSystemPromptPanel) return null;
    const conv = activeAiConv;
    const globalPrompt = chatConfig.systemPrompt || '';
    const currentPrompt = conv?.systemPrompt !== undefined ? conv.systemPrompt : globalPrompt;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowSystemPromptPanel(false)}>
        <div className="bg-white rounded-2xl shadow-xl w-[520px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2"><FileText size={16} className="text-purple-500" /> 系统提示词</h3>
            <button onClick={() => setShowSystemPromptPanel(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-3">
            <textarea
              className={`${inputCls} h-32 resize-none font-mono text-xs`}
              value={currentPrompt}
              onChange={e => {
                const val = e.target.value;
                if (conv) {
                  setAiConversations(prev => prev.map(c => c.id === conv.id ? { ...c, systemPrompt: val } : c));
                } else {
                  const newCfg = { ...chatConfig, systemPrompt: val };
                  setChatConfig(newCfg);
                  saveChatConfig(newCfg);
                  chatServiceRef.current = new ChatService(newCfg);
                }
              }}
              placeholder="设定 AI 的角色和行为…"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 flex items-center gap-1"><Thermometer size={12} /> Temperature</label>
              <input type="range" min="0" max="2" step="0.1" value={chatConfig.temperature || 0.7}
                onChange={e => {
                  const t = parseFloat(e.target.value);
                  const newCfg = { ...chatConfig, temperature: t };
                  setChatConfig(newCfg);
                  saveChatConfig(newCfg);
                  chatServiceRef.current = new ChatService(newCfg);
                }}
                className="flex-1 accent-purple-500" />
              <span className="text-xs text-gray-600 w-8 text-right">{chatConfig.temperature?.toFixed(1) || '0.7'}</span>
            </div>
            {conv && conv.systemPrompt !== undefined && (
              <button className="text-xs text-gray-500 hover:text-gray-700 underline"
                onClick={() => { setAiConversations(prev => prev.map(c => c.id === conv.id ? { ...c, systemPrompt: undefined } : c)); }}>
                恢复使用全局提示词
              </button>
            )}
            {skills.length > 0 && (() => {
              const sq = skillSearchQuery.toLowerCase();
              const filtered = sq
                ? skills.filter(s =>
                    s.title.toLowerCase().includes(sq) ||
                    s.content.toLowerCase().includes(sq) ||
                    s.tags?.some(t => t.toLowerCase().includes(sq))
                  )
                : skills;
              return (
              <div className="border-t border-gray-100 pt-3">
                <div className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1"><Sparkles size={12} /> 预设技能</div>
                {skills.length > 4 && (
                  <div className="relative mb-2">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={skillSearchQuery}
                      onChange={e => setSkillSearchQuery(e.target.value)}
                      placeholder="搜索技能…"
                      className="w-full rounded-lg border border-gray-200 bg-white pl-7 pr-6 py-1 text-xs text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                    />
                    {skillSearchQuery && (
                      <button onClick={() => setSkillSearchQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}
                {skillSearchQuery && (
                  <p className="text-[10px] text-gray-500 mb-1">找到 {filtered.length} 个匹配</p>
                )}
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {filtered.map(skill => (
                    <button key={skill.id} onClick={() => {
                      if (conv) {
                        setAiConversations(prev => prev.map(c => c.id === conv.id ? { ...c, systemPrompt: skill.content } : c));
                      } else {
                        const newCfg = { ...chatConfig, systemPrompt: skill.content };
                        setChatConfig(newCfg);
                        saveChatConfig(newCfg);
                        chatServiceRef.current = new ChatService(newCfg);
                      }
                    }}
                      className={`text-left p-2 rounded-lg border transition-all text-xs ${
                        currentPrompt === skill.content ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-100 hover:border-purple-200 hover:bg-purple-50/50 text-gray-700'
                      }`}>
                      <div className="font-medium truncate">{skill.title}</div>
                      {skill.description && <div className="text-[10px] text-gray-400 truncate mt-0.5">{skill.description}</div>}
                    </button>
                  ))}
                </div>
              </div>
              );
            })()}
          </div>
          {/* 本轮提示词 — per conversation, AI and QA independent */}
          <div className="px-4 pb-3 border-t border-gray-100 pt-3">
            <label className="text-xs font-medium text-gray-700 mb-1 block flex items-center gap-1.5">
              <MessageSquarePlus size={12} className="text-purple-500" />
              本轮提示词
              {(mode === 'ai' ? aiTurnPrompt : qaTurnPrompt).trim() && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />}
            </label>
            <p className="text-[11px] text-gray-400 mb-2">仅对当前对话生效，附加到每条消息的补充指令；新建对话时自动清空</p>
            <div className="relative">
              <textarea
                className={`${inputCls} h-16 resize-none text-xs`}
                value={mode === 'ai' ? aiTurnPrompt : qaTurnPrompt}
                onChange={e => mode === 'ai' ? setAiTurnPrompt(e.target.value) : setQaTurnPrompt(e.target.value)}
                placeholder="例如：请用英文回答、请给出代码示例、请保持简洁…"
              />
              {(mode === 'ai' ? aiTurnPrompt : qaTurnPrompt).trim() && (
                <button onClick={() => mode === 'ai' ? setAiTurnPrompt('') : setQaTurnPrompt('')} className="absolute top-1.5 right-1.5 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-white/80">
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
          <div className="p-3 border-t border-gray-100 flex justify-end">
            <button className={btnPrimary} onClick={() => setShowSystemPromptPanel(false)}>完成</button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // AI Assistant Mode
  // ══════════════════════════════════════════════════════
  function renderAiMode() {
    const conv = activeAiConv;
    const messages = conv?.messages || [];
    const isEmpty = messages.length === 0 && !isStreaming;

    return (
      <div className="flex flex-col flex-1 min-h-0 relative"
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}
        onDragOver={handleDragOver} onDrop={handleDrop}>
        {isDragging && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-purple-500/10 border-2 border-purple-400 border-dashed backdrop-blur-sm pointer-events-none rounded-xl">
            <Paperclip className="w-10 h-10 text-purple-400 mb-3" />
            <p className="text-purple-500 font-semibold text-sm">松开鼠标上传文件</p>
            <p className="text-purple-400 text-xs mt-1">支持图片、PDF、文本等格式</p>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isEmpty && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center text-gray-400 space-y-3">
                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #9333ea 40%, #db2777 100%)' }}>
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div className="text-sm font-medium text-gray-600">AI 助手</div>
                <div className="text-xs text-gray-400">输入消息开始对话，支持 Markdown 渲染</div>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <React.Fragment key={msg.id}>
              <MessageBubble message={msg} onQuote={handleQuoteMessage} onDebug={id => setDebugMsgId(debugMsgId === id ? null : id)} hasDebug={!!debugInfo[msg.id]} />
              {debugMsgId === msg.id && renderDebugPanel(msg.id)}
            </React.Fragment>
          ))}
          {isStreaming && streamingContent && <MessageBubble message={{ id: 'streaming', role: 'assistant', content: streamingContent, timestamp: Date.now() }} isStreaming />}
          {isStreaming && !streamingContent && (
            <div className="flex gap-3"><AIAvatar /><div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '160ms' }} /><span className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: '320ms' }} /></div></div></div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {chatError && (
          <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-600">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs flex-1">{chatError}</span>
            <button onClick={() => setChatError(null)} className="p-1 hover:bg-red-100 rounded-lg"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {/* Per-turn prompt indicator (now edited in the prompt panel) */}
        {aiTurnPrompt.trim() && (
          <div className="mx-4 mb-1 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between text-[11px] text-purple-600">
            <span className="flex items-center gap-1"><MessageSquarePlus size={10} /> 本轮提示词已激活</span>
            <button onClick={() => setShowSystemPromptPanel(true)} className="underline hover:text-purple-800">编辑</button>
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="px-4 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                  {att.type === 'image' ? <Image size={12} /> : <FileText size={12} />}
                  <span className="truncate max-w-[120px]">{att.name}</span>
                  <span className="text-[10px] text-purple-400">({(att.size / 1024).toFixed(0)}KB)</span>
                  <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="p-0.5 rounded hover:bg-purple-100"><X size={10} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-4 border-t border-gray-100 bg-white">
          <div className="flex items-end gap-2 border rounded-2xl px-4 py-3 bg-gray-50 border-gray-200 hover:border-purple-300 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100 transition-all shadow-sm">
            <textarea ref={textareaRef} value={inputValue}
              onChange={e => { setInputValue(e.target.value); requestAnimationFrame(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; const sh = textareaRef.current.scrollHeight; textareaRef.current.style.height = `${Math.max(36, Math.min(sh, 120))}px`; } }); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSendAi(); } }}
              placeholder="输入消息，按 ⌘+Enter 发送..."
              rows={1} className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 overflow-y-auto" style={{ height: '36px', maxHeight: '120px', minHeight: '36px' }} disabled={isStreaming} />
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-purple-500 rounded-xl hover:bg-purple-50 transition-colors" title="上传文件">
              <Paperclip className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept="image/*,.pdf,.txt,.md,.json,.csv,.py,.js,.ts,.html,.css,.xml"
              onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }} />
            {isStreaming ? (
              <button onClick={handleStopAi} className="flex-shrink-0 p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-sm" title="停止生成"><StopCircle className="w-4 h-4" /></button>
            ) : (
              <button onClick={handleSendAi} disabled={!inputValue.trim()}
                className={`flex-shrink-0 p-2 rounded-xl transition-all shadow-sm ${inputValue.trim() ? 'text-white hover:opacity-90 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                style={inputValue.trim() ? { background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)' } : {}} title="发送"><Send className="w-4 h-4" /></button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // QA Mode (RAG-based)
  // ══════════════════════════════════════════════════════
  function renderQAMode() {
    const conv = activeQaConv;
    const messages = conv?.messages || [];
    const isEmpty = messages.length === 0;

    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isEmpty && (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center text-gray-400 space-y-3">
                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <div className="text-sm font-medium text-gray-600">知识库问答</div>
                <div className="text-xs text-gray-400">
                  {hasSelection ? '基于已选向量库进行知识检索问答' : '请先在左下角选择向量库'}
                </div>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <React.Fragment key={msg.id}>
              <MessageBubble message={msg} isKb onQuote={handleQuoteMessage} onDebug={id => setDebugMsgId(debugMsgId === id ? null : id)} hasDebug={!!debugInfo[msg.id]} />
              {debugMsgId === msg.id && renderDebugPanel(msg.id)}
            </React.Fragment>
          ))}
          <div ref={qaMessagesEndRef} />
        </div>
        {!hasSelection && !isEmpty && (
          <div className="mx-4 mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700 text-xs">
            <Lightbulb className="w-4 h-4 flex-shrink-0" /> 请在左下角选择向量库以启用 RAG 检索
          </div>
        )}
        {/* Per-turn prompt indicator (now edited in the prompt panel) */}
        {qaTurnPrompt.trim() && (
          <div className="mx-4 mb-1 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between text-[11px] text-green-700">
            <span className="flex items-center gap-1"><MessageSquarePlus size={10} /> 本轮提示词已激活</span>
            <button onClick={() => setShowSystemPromptPanel(true)} className="underline hover:text-green-900">编辑</button>
          </div>
        )}
        <div className="p-4 border-t border-gray-100 bg-green-50/30">
          <div className="flex items-end gap-2 border rounded-2xl px-4 py-3 bg-white border-green-200 hover:border-green-300 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100 transition-all shadow-sm">
            <textarea ref={qaTextareaRef} value={qaInput}
              onChange={e => { setQaInput(e.target.value); requestAnimationFrame(() => { if (qaTextareaRef.current) { qaTextareaRef.current.style.height = 'auto'; const sh = qaTextareaRef.current.scrollHeight; qaTextareaRef.current.style.height = `${Math.max(36, Math.min(sh, 120))}px`; } }); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSendQa(); } }}
              placeholder={hasSelection ? '向知识库提问...' : '请先选择向量库...'}
              rows={1} className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-400 overflow-y-auto" style={{ height: '36px', maxHeight: '120px', minHeight: '36px' }} disabled={qaProcessing || !hasSelection} />
            <button onClick={handleSendQa} disabled={!qaInput.trim() || qaProcessing || !hasSelection}
              className={`flex-shrink-0 p-2 rounded-xl transition-all shadow-sm ${qaInput.trim() && !qaProcessing && hasSelection ? 'text-white hover:opacity-90 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              style={qaInput.trim() && !qaProcessing && hasSelection ? { background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)' } : {}} title="发送">
              {qaProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Scenario Editor Modal
  // ══════════════════════════════════════════════════════
  function renderScenarioEditor() {
    if (!showScenarioEditor) return null;
    const isNew = !editingScenario;
    const [name, setName] = [editingScenario?.name || '', (v: string) => setEditingScenario(prev => prev ? { ...prev, name: v } : { id: `scenario-${Date.now()}`, name: v, systemPrompt: '', isBuiltin: false })];
    const [prompt, setPrompt] = [editingScenario?.systemPrompt || '', (v: string) => setEditingScenario(prev => prev ? { ...prev, systemPrompt: v } : { id: `scenario-${Date.now()}`, name: '', systemPrompt: v, isBuiltin: false })];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setShowScenarioEditor(false); setEditingScenario(null); }}>
        <div className={`${panelCls} w-[460px] p-5 space-y-4 shadow-xl`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2"><Theater size={16} className="text-purple-500" /> {isNew ? '新建场景' : '编辑场景'}</div>
            <button className="p-1 rounded hover:bg-gray-100 text-gray-400" onClick={() => { setShowScenarioEditor(false); setEditingScenario(null); }}><X size={14} /></button>
          </div>
          <div className="space-y-3">
            <div><label className="text-xs text-gray-500 mb-1 block">场景名称</label><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="例如：期末复习" /></div>
            <div><label className="text-xs text-gray-500 mb-1 block">提示词（系统角色设定）</label><textarea className={`${inputCls} h-32 resize-none`} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="描述 AI 出题的风格…" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className={btnSecondary} onClick={() => { setShowScenarioEditor(false); setEditingScenario(null); }}>取消</button>
            <button className={btnPrimary} disabled={!name.trim() || !prompt.trim()} onClick={() => {
              const sc: QuizScenario = editingScenario?.id ? editingScenario : { id: `scenario-${Date.now()}`, name: name.trim(), systemPrompt: prompt.trim(), isBuiltin: false };
              sc.name = name.trim(); sc.systemPrompt = prompt.trim();
              handleSaveScenario(sc);
            }}><Check size={12} /> 保存</button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Quiz Setup (with Dashboard toggle)
  // ══════════════════════════════════════════════════════
  function renderQuizSetup() {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto space-y-4">
          {/* Dashboard / Quiz toggle */}
          <div className="flex items-center justify-between">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!showDashboard ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShowDashboard(false)}><GraduationCap size={12} className="inline mr-1" />出题</button>
              <button className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showDashboard ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setShowDashboard(true)}><BarChart3 size={12} className="inline mr-1" />掌握度</button>
            </div>
          </div>

          {!activeQuizCategoryId ? (
            <div className="text-center py-8 text-gray-400">
              <GraduationCap size={32} className="mx-auto mb-3 text-gray-300" />
              <div className="text-sm font-medium text-gray-500 mb-1">请先创建一个分类</div>
              <div className="text-xs">在左侧创建分类后即可开始出题</div>
            </div>
          ) : showDashboard ? renderDashboardContent() : renderQuizForm()}
        </div>
      </div>
    );
  }

  function renderQuizForm() {
    const categoryRecentSessions = recentSessions.filter(s => (s as any)._categoryId === activeQuizCategoryId);

    const roleConfig: { role: VectorStoreRole; label: string; desc: string; icon: React.ReactNode; colorCls: string }[] = [
      { role: 'material', label: '资料', desc: '根据资料内容出题', icon: <BookOpen size={12} className="text-blue-500" />, colorCls: 'text-blue-700 bg-blue-50 border-blue-200' },
      { role: 'questions_no_answer', label: '题库（无答案）', desc: '为题目生成答案并扩展', icon: <FileText size={12} className="text-amber-500" />, colorCls: 'text-amber-700 bg-amber-50 border-amber-200' },
      { role: 'questions_with_answer', label: '题库（含答案）', desc: '丰富和扩展已有题目', icon: <CheckCircle2 size={12} className="text-green-500" />, colorCls: 'text-green-700 bg-green-50 border-green-200' },
    ];

    function getStoresForRole(role: VectorStoreRole): string[] {
      return Object.entries(storeRoles).filter(([, roles]) => roles.includes(role)).map(([id]) => id);
    }

    function addStoreToRole(storeId: string, role: VectorStoreRole) {
      setStoreRoles(prev => {
        const existing = prev[storeId] || [];
        if (existing.includes(role)) return prev;
        const updated = { ...prev, [storeId]: [...existing, role] };
        // Derive selectedIds from all stores with any role
        const allIds = Object.keys(updated);
        setSelectedIds(allIds);
        return updated;
      });
      setShowRolePicker(null);
    }

    function removeStoreFromRole(storeId: string, role: VectorStoreRole) {
      setStoreRoles(prev => {
        const existing = prev[storeId] || [];
        const newRoles = existing.filter(r => r !== role);
        const updated = { ...prev };
        if (newRoles.length === 0) {
          delete updated[storeId];
        } else {
          updated[storeId] = newRoles;
        }
        const allIds = Object.keys(updated);
        setSelectedIds(allIds);
        return updated;
      });
    }

    return (
      <>
        <div className={`${panelCls} p-5 space-y-4`}>
          <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <GraduationCap size={16} className="text-purple-500" /> 生成测验
          </div>
          {/* Vector Store Roles */}
          <div>
            <label className="text-xs text-gray-500 mb-2 block">向量库数据源</label>
            {ragCollections.length === 0 ? (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">暂无向量库，请先在 RAG Lab 中构建</div>
            ) : (
              <div className="space-y-3">
                {roleConfig.map((rc, roleIdx) => {
                  const assignedStoreIds = getStoresForRole(rc.role);
                  const isPickerOpen = showRolePicker?.role === rc.role && showRolePicker?.anchorIdx === roleIdx;
                  return (
                    <div key={rc.role} className="border border-gray-200 rounded-lg p-3">
                      <div className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        {rc.icon} {rc.label}
                        <span className="text-[10px] text-gray-400 font-normal">— {rc.desc}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                        {assignedStoreIds.map(sid => {
                          const col = ragCollections.find(c => c.id === sid);
                          if (!col) return null;
                          return (
                            <span key={sid} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                              <Database size={10} className="text-gray-400" />
                              {col.name}
                              <span className="text-[10px] text-gray-400">{col.vectorCount}</span>
                              <button className="ml-0.5 text-gray-400 hover:text-red-500" onClick={() => removeStoreFromRole(sid, rc.role)}>
                                <X size={10} />
                              </button>
                            </span>
                          );
                        })}
                        <button
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 border border-dashed border-gray-300 hover:bg-gray-50 transition-colors"
                          onClick={() => setShowRolePicker(isPickerOpen ? null : { role: rc.role, anchorIdx: roleIdx })}
                        >
                          <Plus size={10} /> 添加
                        </button>
                      </div>
                      {isPickerOpen && (
                        <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm max-h-32 overflow-y-auto">
                          {ragCollections.filter(c => !assignedStoreIds.includes(c.id)).length === 0 ? (
                            <div className="text-xs text-gray-400 p-2 text-center">所有向量库已添加</div>
                          ) : ragCollections.filter(c => !assignedStoreIds.includes(c.id)).map(col => (
                            <button key={col.id}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
                              onClick={() => addStoreToRole(col.id, rc.role)}
                            >
                              <Database size={11} className="text-gray-400" />
                              <span className="flex-1">{col.name}</span>
                              <span className="text-[10px] text-gray-400">{col.vectorCount} 条</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Scenario */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">出题场景</label>
            <div className="flex flex-wrap gap-1.5">
              {allScenarios.map(sc => (
                <button key={sc.id} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors border ${selectedScenarioId === sc.id ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  onClick={() => setSelectedScenarioId(sc.id)}>
                  <Theater size={11} /> {sc.name}
                  {!sc.isBuiltin && (
                    <span className="ml-1 flex gap-0.5">
                      <Pencil size={9} className="text-gray-400 hover:text-gray-600 cursor-pointer" onClick={e => { e.stopPropagation(); setEditingScenario(sc); setShowScenarioEditor(true); }} />
                      <Trash2 size={9} className="text-gray-400 hover:text-red-500 cursor-pointer" onClick={e => { e.stopPropagation(); handleDeleteScenario(sc.id); }} />
                    </span>
                  )}
                </button>
              ))}
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 border border-dashed border-gray-300 hover:bg-gray-50 transition-colors"
                onClick={() => { setEditingScenario(null); setShowScenarioEditor(true); }}><Plus size={11} /> 自定义</button>
            </div>
          </div>
          {/* Direction */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">出题方向（可选）</label>
            <textarea className={`${inputCls} h-16 resize-none`} placeholder="例如：重点考查第三章的概念定义和应用场景…" value={quizPrompt} onChange={e => setQuizPrompt(e.target.value)} />
          </div>
          {/* Config */}
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">题数</label>
              <input className={`${inputCls} w-16`} type="number" min={1} max={20} value={quizCount}
                onChange={e => setQuizCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">难度</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(d => (
                  <button key={d} className={`w-7 h-7 rounded-md text-xs font-medium transition-colors ${quizDifficulty === d ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    onClick={() => setQuizDifficulty(d)} title={DIFFICULTY_INFO[d]?.description}>{d}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Types */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">题型</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(QUESTION_TYPE_INFO) as [QuestionType, any][]).filter(([k]) => k !== 'follow_up').map(([key, info]) => (
                <label key={key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${quizTypes.includes(key) ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  <input type="checkbox" className="accent-purple-500 w-3 h-3" checked={quizTypes.includes(key)}
                    onChange={e => { if (e.target.checked) setQuizTypes(p => [...p, key]); else setQuizTypes(p => p.filter(t => t !== key)); }} />
                  {info.label}
                </label>
              ))}
            </div>
          </div>
          {/* Generate button */}
          <button className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${hasSelection && !quizGenerating && quizTypes.length > 0 ? 'bg-purple-500 hover:bg-purple-600' : 'bg-gray-300 cursor-not-allowed'}`}
            onClick={handleGenerateQuiz} disabled={!hasSelection || quizGenerating || quizTypes.length === 0}>
            {quizGenerating ? <><Loader2 size={16} className="animate-spin" /> {quizProgress}</> : <><Sparkles size={16} /> 开始出题</>}
          </button>
        </div>
        {/* History */}
        {categoryRecentSessions.length > 0 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3"><Clock size={16} className="text-gray-400" /> 测验历史</div>
            <div className="space-y-2">
              {categoryRecentSessions.slice(0, 20).map(session => {
                const isAnswering = session.status === 'answering';
                const isGradingSt = session.status === 'grading';
                const isCompleted = session.status === 'completed';
                const avg = session.summary?.avgScore || (session.attempts.length > 0 ? session.attempts.reduce((s, a) => s + a.evaluation.totalScore, 0) / session.attempts.length : 0);
                const pct = avg / 100;
                const displayName = (session as any)._customName || session.topic || '综合测验';
                const qCount = session.attempts.length || (session as any)._questions?.length || '?';
                return (
                  <div key={session.id} className="group flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    {isGradingSt ? <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100"><Loader2 size={16} className="animate-spin text-amber-600" /></div>
                      : isAnswering ? <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 text-blue-600"><Pencil size={16} /></div>
                      : <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${pct >= 0.8 ? 'bg-green-100 text-green-700' : pct >= 0.6 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{Math.round(avg)}</div>}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                      if (isAnswering) handleResumeQuiz(session);
                      else {
                        setActiveQuiz(session);
                        setCurrentQIndex(0);
                        // Restore interview history for replay
                        if (session.mode === 'interview' && (session as any)._interviewHistory) {
                          setInterviewHistory((session as any)._interviewHistory);
                          setInterviewCurrentQ(null);
                        }
                      }
                    }}>
                      {editingSessionName === session.id ? (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <input className={`${inputCls} text-xs py-0.5`} value={sessionNameInput} onChange={e => setSessionNameInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameSession(session.id, sessionNameInput); if (e.key === 'Escape') setEditingSessionName(null); }} autoFocus />
                          <button className="p-0.5 rounded hover:bg-gray-200" onClick={() => handleRenameSession(session.id, sessionNameInput)}><Check size={12} className="text-green-600" /></button>
                          <button className="p-0.5 rounded hover:bg-gray-200" onClick={() => setEditingSessionName(null)}><X size={12} className="text-gray-400" /></button>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-700 truncate flex items-center gap-1.5">
                          {qCount} 题 · {displayName}
                          {isGradingSt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">评测中</span>}
                          {isAnswering && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">未完成</span>}
                          {session.mode === 'interview' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">面试</span>}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400">{isCompleted && session.summary?.overallGrade && `${session.summary.overallGrade} · `}{new Date(session.startedAt).toLocaleString('zh-CN')}</div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600" title="重命名"
                        onClick={e => { e.stopPropagation(); setEditingSessionName(session.id); setSessionNameInput((session as any)._customName || session.topic || ''); }}><Pencil size={12} /></button>
                      <button className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="删除"
                        onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════
  // Shared Quiz Debug Panel
  // ══════════════════════════════════════════════════════
  function renderQuizDebugPanel() {
    if (!showQuizDebug || quizDebugData.length === 0) return null;
    return (
      <div className={`${panelCls} p-4 space-y-3`}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-gray-800 flex items-center gap-2"><Bug size={16} className="text-amber-500" /> 调试数据 ({quizDebugData.length} 条)</div>
          <button className="p-1 rounded hover:bg-gray-100 text-gray-400" onClick={() => setShowQuizDebug(false)}><X size={14} /></button>
        </div>
        <div className="space-y-2">
          {quizDebugData.map((entry, i) => (
            <details key={i} className="border border-gray-100 rounded-lg overflow-hidden">
              <summary className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-gray-50">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  entry.type === 'generation' ? 'bg-blue-100 text-blue-700' :
                  entry.type === 'scoring' ? 'bg-purple-100 text-purple-700' :
                  entry.type === 'eval_meta' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {entry.type === 'generation' ? '出题' : entry.type === 'scoring' ? '评分' : entry.type === 'eval_meta' ? '评分诊断' : '其他'}
                </span>
                <span className="text-gray-500">#{i + 1}</span>
                {entry.type === 'eval_meta' ? (
                  <span className="text-gray-400 ml-auto text-[10px]">
                    cosine={entry.meta?.cosineSimilarity?.toFixed(3)} · kpHit={entry.meta?.keyPointHitRate?.toFixed(2)} · LLM原={entry.meta?.llmRawScore} → 校准={entry.meta?.calibratedScore}
                  </span>
                ) : (
                  <span className="text-gray-400 ml-auto">{entry.duration}ms · ~{Math.round((entry.promptLength || 0) / 4)} tok → ~{Math.round((entry.responseLength || 0) / 4)} tok</span>
                )}
              </summary>
              <div className="border-t border-gray-100 p-3 space-y-2">
                {entry.type === 'eval_meta' ? (
                  <>
                    <div className="text-[10px] text-gray-500 font-medium">题目: {entry.questionText}…</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Embedding:</span> {entry.embeddingConfig?.provider}/{entry.embeddingConfig?.model} {entry.embeddingConfig?.hasKey ? '✅Key' : '❌无Key'}</div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">语义相似度:</span> <span className="font-mono font-bold">{entry.meta?.cosineSimilarity?.toFixed(4)}</span> {entry.meta?.cosineSimilarity === 0 ? '⚠️embedding可能失败' : ''}</div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">关键点命中率:</span> <span className="font-mono font-bold">{((entry.meta?.keyPointHitRate || 0) * 100).toFixed(1)}%</span></div>
                      <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">LLM原始分:</span> {entry.meta?.llmRawScore} → <span className="text-gray-500">校准:</span> <span className="font-bold">{entry.meta?.calibratedScore}</span></div>
                    </div>
                    {entry.keyPointMatches && (
                      <div>
                        <div className="text-[10px] text-gray-500 font-medium mb-1">关键点匹配详情</div>
                        {entry.keyPointMatches.map((kp: any, ki: number) => (
                          <div key={ki} className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded mb-0.5 ${
                            kp.status === 'hit' ? 'bg-green-50 text-green-700' : kp.status === 'partial' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
                          }`}>
                            <span>{kp.status === 'hit' ? '✓' : kp.status === 'partial' ? '~' : '✗'}</span>
                            <span className="flex-1">{kp.keyPoint}</span>
                            <span className="font-mono">{(kp.similarity * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] text-gray-500 font-medium mb-1">Prompt ({entry.promptLength} chars)</div>
                      <pre className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{entry.prompt}</pre>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 font-medium mb-1">Response ({entry.responseLength} chars)</div>
                      <pre className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{entry.response}</pre>
                    </div>
                  </>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Active Quiz
  // ══════════════════════════════════════════════════════
  function renderActiveQuiz() {
    if (!activeQuiz) return null;
    const questions: QuizQuestion[] = (activeQuiz as any)._questions || activeQuiz.attempts.map(a => a.question);
    const isCompleted = activeQuiz.status === 'completed';
    const isGrading = activeQuiz.status === 'grading';
    const q = questions[currentQIndex];
    if (!q) return null;
    const attempt = isCompleted ? activeQuiz.attempts[currentQIndex] : null;
    const ev = attempt?.evaluation;

    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <button className={btnSecondary} onClick={handleExitQuiz}><ChevronRight size={12} className="rotate-180" /> 返回</button>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {questions.map((_, i) => {
                  const a = isCompleted ? activeQuiz.attempts[i] : null;
                  const s = a?.evaluation.totalScore;
                  return (
                    <button key={i} onClick={() => setCurrentQIndex(i)}
                      className={`w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${i === currentQIndex ? 'ring-2 ring-blue-400 ring-offset-1' : ''} ${
                        isCompleted && s !== undefined ? s >= 70 ? 'bg-green-500 text-white' : s >= 40 ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                        : userAnswers[questions[i]?.id] ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>{i + 1}</button>
                  );
                })}
              </div>
              {isCompleted && activeQuiz.summary && (
                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${activeQuiz.summary.avgScore >= 70 ? 'bg-green-100 text-green-700' : activeQuiz.summary.avgScore >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  <Award size={12} className="inline mr-1" />{activeQuiz.summary.overallGrade} · 均分{Math.round(activeQuiz.summary.avgScore)}
                </div>
              )}
              {quizDebugData.length > 0 && (
                <button className={`p-1.5 rounded-lg text-xs transition-colors ${showQuizDebug ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                  onClick={() => setShowQuizDebug(!showQuizDebug)} title="调试数据">
                  <Bug size={14} />
                </button>
              )}
            </div>
          </div>
          {/* Question card */}
          <div className={`${panelCls} p-5 space-y-4 ${isCompleted && ev ? ev.totalScore >= 70 ? 'border-green-200' : ev.totalScore >= 40 ? 'border-yellow-200' : 'border-red-200' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{QUESTION_TYPE_INFO[q.type]?.label || q.type}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">难度 {q.difficulty}/5</span>
              {q.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{t}</span>)}
              {isCompleted && ev && <span className={`text-xs font-bold ml-auto ${ev.totalScore >= 70 ? 'text-green-600' : ev.totalScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{ev.totalScore} 分</span>}
            </div>
            <div className="text-sm text-gray-800 leading-relaxed font-medium">{q.question}</div>
            {!isCompleted && !isGrading && (
              <textarea className={`${inputCls} h-32 resize-none`} placeholder="请输入你的回答…" value={userAnswers[q.id] || ''}
                onChange={e => setUserAnswers(prev => ({ ...prev, [q.id]: e.target.value }))} />
            )}
            {isGrading && gradingIndex === currentQIndex && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center"><Loader2 size={16} className="animate-spin" /> 正在三级评分中…</div>
            )}
            {isCompleted && ev && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '关键点覆盖', score: ev.dimensions.keyPointCoverage.score, max: 40, color: '#3b82f6' },
                    { label: '准确性', score: ev.dimensions.accuracy.score, max: 25, color: '#22c55e' },
                    { label: '完整性', score: ev.dimensions.completeness.score, max: 20, color: '#a855f7' },
                    { label: '表达清晰', score: ev.dimensions.clarity.score, max: 15, color: '#f97316' },
                  ].map(d => (
                    <div key={d.label} className="bg-gray-50 rounded-lg p-2.5">
                      <div className="flex justify-between text-[10px] text-gray-500 mb-1"><span>{d.label}</span><span className="font-bold text-gray-700">{d.score}/{d.max}</span></div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(d.score / d.max) * 100}%`, backgroundColor: d.color }} /></div>
                    </div>
                  ))}
                </div>
                {ev.dimensions.keyPointCoverage.matches.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-gray-500 font-medium">关键点匹配</div>
                    {ev.dimensions.keyPointCoverage.matches.map((kp, i) => (
                      <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${kp.status === 'hit' ? 'bg-green-50 text-green-700' : kp.status === 'partial' ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'}`}>
                        {kp.status === 'hit' ? <CheckCircle2 size={12} /> : kp.status === 'partial' ? <Target size={12} /> : <XCircle size={12} />}
                        <span className="flex-1">{kp.keyPoint}</span>
                        <span className="text-[10px]">{(kp.similarity * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="text-xs text-gray-800 leading-relaxed">{ev.overallFeedback}</div>
                  {ev.suggestions.length > 0 && (
                    <div className="space-y-1"><div className="text-[10px] text-gray-500 font-medium">💡 改进建议</div>{ev.suggestions.map((s, i) => <div key={i} className="text-xs text-gray-600">• {s}</div>)}</div>
                  )}
                </div>
                <details className="text-xs"><summary className="text-gray-500 cursor-pointer hover:text-gray-700">查看参考答案</summary><div className="mt-2 p-3 bg-blue-50 rounded-lg text-gray-700 leading-relaxed">{q.referenceAnswer}</div></details>
                <details className="text-xs"><summary className="text-gray-500 cursor-pointer hover:text-gray-700">你的回答</summary><div className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-600 leading-relaxed">{attempt?.userAnswer || '未作答'}</div></details>
              </div>
            )}
          </div>
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button className={btnSecondary} onClick={() => setCurrentQIndex(Math.max(0, currentQIndex - 1))} disabled={currentQIndex === 0}>上一题</button>
            <div className="text-xs text-gray-400">{currentQIndex + 1} / {questions.length}</div>
            {!isCompleted && !isGrading && currentQIndex === questions.length - 1 ? (
              <button className={`${btnPrimary} bg-purple-500 hover:bg-purple-600`} onClick={handleGradeQuiz}
                disabled={Object.keys(userAnswers).filter(k => userAnswers[k]?.trim()).length === 0}><CheckCircle2 size={14} /> 提交评分</button>
            ) : (
              <button className={btnSecondary} onClick={() => setCurrentQIndex(Math.min(questions.length - 1, currentQIndex + 1))} disabled={currentQIndex >= questions.length - 1}>下一题 <ArrowRight size={12} /></button>
            )}
          </div>
          {/* Session Summary */}
          {isCompleted && activeQuiz.summary && currentQIndex === questions.length - 1 && (
            <div className={`${panelCls} p-4 space-y-2`}>
              <div className="text-sm font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={16} className="text-blue-500" /> 练习报告</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-gray-800">{activeQuiz.summary.overallGrade}</div><div className="text-[10px] text-gray-400">等级</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-gray-800">{Math.round(activeQuiz.summary.avgScore)}</div><div className="text-[10px] text-gray-400">均分</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-green-600">{activeQuiz.summary.maxScore}</div><div className="text-[10px] text-gray-400">最高</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-red-600">{activeQuiz.summary.minScore}</div><div className="text-[10px] text-gray-400">最低</div></div>
              </div>
              {activeQuiz.summary.recommendation && <div className="text-xs text-gray-600 bg-blue-50 rounded-lg p-3">📝 {activeQuiz.summary.recommendation}</div>}
              <button className={`${btnSecondary} w-full justify-center mt-2`} onClick={() => setActiveQuiz(null)}><RotateCcw size={14} /> 重新出题</button>
            </div>
          )}
          {renderQuizDebugPanel()}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Interview Mode Render
  // ══════════════════════════════════════════════════════
  function renderInterviewMode() {
    if (!activeQuiz) return null;
    const isCompleted = activeQuiz.status === 'completed';

    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button className={btnSecondary} onClick={handleExitQuiz}><ChevronRight size={12} className="rotate-180" /> 返回</button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {isCompleted ? `面试结束 · ${interviewHistory.length} 题` : `面试进行中 · 第 ${interviewTotalNew}/${interviewMaxQuestions} 题`}
              </span>
              {interviewFollowUpCount > 0 && !isCompleted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">追问 {interviewFollowUpCount}/3</span>
              )}
              {quizDebugData.length > 0 && (
                <button className={`p-1.5 rounded-lg text-xs transition-colors ${showQuizDebug ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100'}`}
                  onClick={() => setShowQuizDebug(!showQuizDebug)} title="调试数据"><Bug size={14} /></button>
              )}
            </div>
          </div>

          {/* Conversation history */}
          <div className="space-y-3">
            {interviewHistory.map((entry, i) => (
              <div key={i} className="space-y-2">
                {/* Interviewer question */}
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <GraduationCap size={14} className="text-purple-600" />
                  </div>
                  <div className={`flex-1 ${panelCls} p-3 space-y-2`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        {entry.isFollowUp ? '追问' : QUESTION_TYPE_INFO[entry.question.type]?.label || entry.question.type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">难度 {entry.question.difficulty}/5</span>
                      {entry.question.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{t}</span>)}
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed">{entry.question.question}</div>
                  </div>
                </div>
                {/* User answer */}
                <div className="flex gap-3 justify-end">
                  <div className={`flex-1 ml-10 p-3 rounded-lg text-sm text-gray-700 leading-relaxed ${entry.evaluation ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                    {entry.userAnswer || <span className="text-gray-400 italic">未作答</span>}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={14} className="text-blue-600" />
                  </div>
                </div>
                {/* Evaluation feedback */}
                {entry.evaluation && (
                  <div className="ml-10 mr-10">
                    {isCompleted ? (
                      // After interview ends: show full evaluation
                      <div className="space-y-2">
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                          entry.evaluation.totalScore >= 70 ? 'bg-green-50 text-green-700 border border-green-200' :
                          entry.evaluation.totalScore >= 40 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                          <Award size={14} />
                          <span>{entry.evaluation.totalScore} 分</span>
                          <span className="text-[10px] font-normal opacity-75">
                            关键点 {entry.evaluation.dimensions.keyPointCoverage.score}/40 · 
                            准确 {entry.evaluation.dimensions.accuracy.score}/25 · 
                            完整 {entry.evaluation.dimensions.completeness.score}/20 · 
                            表达 {entry.evaluation.dimensions.clarity.score}/15
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">
                          {entry.evaluation.overallFeedback}
                        </div>
                        {entry.evaluation.suggestions.length > 0 && (
                          <div className="text-xs text-gray-500 px-1">
                            💡 {entry.evaluation.suggestions.join(' · ')}
                          </div>
                        )}
                        <details className="text-xs">
                          <summary className="text-gray-400 cursor-pointer hover:text-gray-600">查看参考答案与关键点</summary>
                          <div className="mt-1 space-y-1.5">
                            <div className="p-2 bg-blue-50 rounded text-gray-700 leading-relaxed">{entry.question.referenceAnswer}</div>
                            <div className="flex flex-wrap gap-1">
                              {entry.evaluation.dimensions.keyPointCoverage.matches.map((kp, ki) => (
                                <span key={ki} className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  kp.status === 'hit' ? 'bg-green-100 text-green-700' :
                                  kp.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{kp.status === 'hit' ? '✓' : kp.status === 'partial' ? '~' : '✗'} {kp.keyPoint}</span>
                              ))}
                            </div>
                          </div>
                        </details>
                      </div>
                    ) : (
                      // During interview: only show interviewer's comment
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <GraduationCap size={14} className="text-purple-600" />
                        </div>
                        <div className="flex-1 text-sm text-gray-700 leading-relaxed bg-purple-50 border border-purple-100 rounded-lg p-3">
                          {entry.evaluation.interviewerComment || entry.evaluation.overallFeedback}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Current question (not yet answered) */}
            {interviewCurrentQ && !isCompleted && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <GraduationCap size={14} className="text-purple-600" />
                  </div>
                  <div className={`flex-1 ${panelCls} p-3 space-y-2 border-purple-200`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        {interviewCurrentQ.type === 'follow_up' ? '追问' : QUESTION_TYPE_INFO[interviewCurrentQ.type]?.label || interviewCurrentQ.type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">难度 {interviewCurrentQ.difficulty}/5</span>
                      {interviewCurrentQ.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{t}</span>)}
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed font-medium">{interviewCurrentQ.question}</div>
                  </div>
                </div>
                {/* Answer input */}
                {interviewGrading ? (
                  <div className="ml-10 flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
                    <Loader2 size={16} className="animate-spin" /> 面试官正在评估你的回答…
                  </div>
                ) : (
                  <div className="ml-10 space-y-2">
                    <textarea
                      className={`${inputCls} h-28 resize-none`}
                      placeholder="请输入你的回答…"
                      value={interviewAnswer}
                      onChange={e => setInterviewAnswer(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && interviewAnswer.trim()) {
                          e.preventDefault();
                          handleInterviewSubmit();
                        }
                      }}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400">Ctrl+Enter 提交</span>
                      <button
                        className={`${btnPrimary} ${!interviewAnswer.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!interviewAnswer.trim() || interviewGrading}
                        onClick={handleInterviewSubmit}
                      >
                        <Send size={12} /> 提交回答
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completed summary */}
          {isCompleted && activeQuiz.summary && (
            <div className={`${panelCls} p-4 space-y-3`}>
              <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-500" /> 面试报告
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-gray-800">{activeQuiz.summary.overallGrade}</div><div className="text-[10px] text-gray-400">等级</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-gray-800">{Math.round(activeQuiz.summary.avgScore)}</div><div className="text-[10px] text-gray-400">均分</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-green-600">{activeQuiz.summary.maxScore}</div><div className="text-[10px] text-gray-400">最高</div></div>
                <div className="bg-gray-50 rounded-lg p-2"><div className="text-lg font-bold text-red-600">{activeQuiz.summary.minScore}</div><div className="text-[10px] text-gray-400">最低</div></div>
              </div>
              {activeQuiz.summary.recommendation && (
                <div className="text-xs text-gray-600 bg-blue-50 rounded-lg p-3">📝 {activeQuiz.summary.recommendation}</div>
              )}
              <button className={`${btnSecondary} w-full justify-center mt-2`} onClick={() => { setActiveQuiz(null); setInterviewHistory([]); setInterviewCurrentQ(null); }}>
                <RotateCcw size={14} /> 重新出题
              </button>
            </div>
          )}

          {renderQuizDebugPanel()}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // Dashboard (merged into Quiz tab)
  // ══════════════════════════════════════════════════════
  function renderDashboardContent() {
    const points = Object.values(mastery);
    const priorities = points.length > 0 ? calculateQuestionPriorities(points) : [];

    // ── Mastery distribution data ──
    const masteryDist = {
      not_mastered: points.filter(p => p.masteryLevel === 'not_mastered').length,
      partially: points.filter(p => p.masteryLevel === 'partially').length,
      mastered: points.filter(p => p.masteryLevel === 'mastered').length,
      expert: points.filter(p => p.masteryLevel === 'expert').length,
    };
    const masteryTotal = points.length || 1;

    // ── Score distribution (10-point buckets) ──
    const scoreBuckets = Array.from({ length: 10 }, (_, i) => ({
      label: `${i * 10}`,
      count: points.filter(p => {
        const s = Math.round(p.avgScore);
        return i === 9 ? s >= 90 : s >= i * 10 && s < (i + 1) * 10;
      }).length,
    }));
    const maxBucket = Math.max(1, ...scoreBuckets.map(b => b.count));

    // ── Session score trend (recent 10) ──
    const completedSessions = recentSessions
      .filter(s => s.status === 'completed' && s.summary)
      .slice(0, 10)
      .reverse();
    const trendPoints = completedSessions.map((s, i) => ({
      x: i,
      y: s.summary?.avgScore ?? 0,
      label: `#${completedSessions.length - i}`,
    }));

    // ── Donut chart SVG helper ──
    const DonutChart = () => {
      const levels = [
        { key: 'not_mastered', count: masteryDist.not_mastered, color: MASTERY_LEVEL_INFO.not_mastered.color },
        { key: 'partially', count: masteryDist.partially, color: MASTERY_LEVEL_INFO.partially.color },
        { key: 'mastered', count: masteryDist.mastered, color: MASTERY_LEVEL_INFO.mastered.color },
        { key: 'expert', count: masteryDist.expert, color: MASTERY_LEVEL_INFO.expert.color },
      ].filter(l => l.count > 0);
      if (levels.length === 0) return null;

      const r = 40, cx = 50, cy = 50, stroke = 12;
      const circumference = 2 * Math.PI * r;
      let offset = 0;

      return (
        <svg viewBox="0 0 100 100" className="w-28 h-28">
          {levels.map(l => {
            const pct = l.count / masteryTotal;
            const dash = pct * circumference;
            const gap = circumference - dash;
            const el = (
              <circle key={l.key} cx={cx} cy={cy} r={r} fill="none"
                stroke={l.color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                className="transition-all duration-500" />
            );
            offset += dash;
            return el;
          })}
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-700 text-[11px] font-bold">{masteryTotal}</text>
          <text x={cx} y={cy + 8} textAnchor="middle" className="fill-gray-400 text-[7px]">标签</text>
        </svg>
      );
    };

    return (
      <>
        {/* ── Top stats cards ── */}
        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '总练习', value: stats.totalSessions, icon: <BookOpen size={14} /> },
              { label: '总答题', value: stats.totalQuestions, icon: <Target size={14} /> },
              { label: '均分', value: Math.round(stats.avgScore), icon: <Award size={14} /> },
              { label: '连续天数', value: stats.streakDays, icon: <Sparkles size={14} /> },
            ].map(s => (
              <div key={s.label} className={`${panelCls} p-3 text-center`}>
                <div className="text-gray-400 mb-1">{s.icon}</div>
                <div className="text-xl font-bold text-gray-800">{s.value}</div>
                <div className="text-[10px] text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Mastery distribution: donut + legend ── */}
        {points.length > 0 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Brain size={16} className="text-purple-500" /> 标签掌握度分布
            </div>
            <div className="flex items-center gap-6">
              <DonutChart />
              <div className="flex-1 grid grid-cols-2 gap-2">
                {(['not_mastered', 'partially', 'mastered', 'expert'] as const).map(level => {
                  const count = masteryDist[level];
                  const info = MASTERY_LEVEL_INFO[level];
                  const pct = Math.round((count / masteryTotal) * 100);
                  return (
                    <div key={level} className="flex items-center gap-2 p-1.5 rounded-lg bg-gray-50/80">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-gray-500 truncate">{info.icon} {info.label}</div>
                        <div className="text-xs font-bold" style={{ color: info.color }}>{count} <span className="text-[10px] text-gray-400 font-normal">({pct}%)</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Score distribution bar chart ── */}
        {points.length > 0 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-blue-500" /> 分数分布
            </div>
            <div className="flex items-end gap-1 h-20">
              {scoreBuckets.map((b, i) => {
                const h = b.count > 0 ? Math.max(8, (b.count / maxBucket) * 100) : 0;
                const color = i >= 9 ? '#8b5cf6' : i >= 7 ? '#22c55e' : i >= 4 ? '#eab308' : '#ef4444';
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="text-[9px] text-gray-400 leading-none">{b.count || ''}</div>
                    <div className="w-full rounded-t transition-all duration-300" style={{ height: `${h}%`, backgroundColor: color, opacity: b.count > 0 ? 1 : 0.15 }} />
                    <div className="text-[8px] text-gray-400 leading-none">{b.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Session score trend ── */}
        {trendPoints.length >= 2 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-amber-500" /> 成绩趋势
            </div>
            <svg viewBox="0 0 200 60" className="w-full h-16">
              {/* Grid lines */}
              {[0, 25, 50, 75, 100].map(v => {
                const y = 55 - (v / 100) * 50;
                return <line key={v} x1="20" y1={y} x2="195" y2={y} stroke="#e5e7eb" strokeWidth="0.5" />;
              })}
              {/* Y-axis labels */}
              {[0, 50, 100].map(v => {
                const y = 55 - (v / 100) * 50;
                return <text key={v} x="16" y={y + 2} textAnchor="end" className="fill-gray-400 text-[5px]">{v}</text>;
              })}
              {/* Line */}
              {trendPoints.length >= 2 && (() => {
                const xStep = 175 / Math.max(trendPoints.length - 1, 1);
                const pathParts = trendPoints.map((p, i) => {
                  const x = 20 + i * xStep;
                  const y = 55 - (p.y / 100) * 50;
                  return `${i === 0 ? 'M' : 'L'}${x},${y}`;
                });
                return (
                  <>
                    <path d={pathParts.join(' ')} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    {trendPoints.map((p, i) => {
                      const x = 20 + i * xStep;
                      const y = 55 - (p.y / 100) * 50;
                      return (
                        <g key={i}>
                          <circle cx={x} cy={y} r="2.5" fill="white" stroke="#6366f1" strokeWidth="1" />
                          <text x={x} y={y - 4} textAnchor="middle" className="fill-gray-500 text-[4px]">{Math.round(p.y)}</text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        )}

        {/* ── Priority tags list ── */}
        {priorities.length > 0 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <Target size={16} className="text-orange-500" /> 重点关注标签
            </div>
            {priorities.slice(0, 10).map(p => {
              const point = mastery[p.tag];
              if (!point) return null;
              const retention = getRetentionRate(point);
              const rStatus = getRetentionStatus(retention);
              return (
                <div key={p.tag} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-5 text-center text-xs">{rStatus.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-700 truncate">{point.tag}</div>
                    <div className="text-[10px] text-gray-400">{p.reason}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium" style={{ color: MASTERY_LEVEL_INFO[point.masteryLevel].color }}>
                      {MASTERY_LEVEL_INFO[point.masteryLevel].label}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      均分 {Math.round(point.avgScore)} · {point.totalAttempts}题
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tag stats (by attempts) ── */}
        {stats && Object.keys(stats.byTag).length > 0 && (
          <div className={`${panelCls} p-4`}>
            <div className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
              <BarChart3 size={16} className="text-teal-500" /> 标签练习统计
            </div>
            <div className="space-y-2">
              {Object.entries(stats.byTag).sort(([, a], [, b]) => b.attempts - a.attempts).slice(0, 12).map(([tag, data]) => (
                <div key={tag} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-24 truncate">{tag}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${data.avgScore >= 70 ? 'bg-green-500' : data.avgScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${data.avgScore}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-16 text-right">{Math.round(data.avgScore)}分 ({data.attempts}题)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {points.length === 0 && !stats?.totalSessions && (
          <EmptyState icon={<BarChart3 size={48} className="text-gray-300" />} text="暂无练习数据" sub="完成一次测验后这里将显示掌握度分析" />
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════
  // Empty State
  // ══════════════════════════════════════════════════════
  function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub?: string }) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400 space-y-2">
          <div className="flex justify-center">{icon}</div>
          <div className="text-sm">{text}</div>
          {sub && <div className="text-xs">{sub}</div>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // Main Layout
  // ═══════════════════════════════════════════════════════
  return (
    <div className="h-full flex bg-white text-gray-800">
      {renderScenarioEditor()}
      {renderSystemPromptPanel()}

      {/* Left sidebar: changes based on mode */}
      {!compact && kbSidebarVisible && mode === 'ai' && renderConversationSidebar(aiConversations, activeAiConvId, setActiveAiConvId, handleNewAiConv, handleDeleteAiConv, false)}
      {!compact && kbSidebarVisible && mode === 'qa' && renderConversationSidebar(qaConversations, activeQaConvId, setActiveQaConvId, handleNewQaConv, handleDeleteQaConv, true)}
      {!compact && kbSidebarVisible && mode === 'quiz' && renderQuizCategorySidebar()}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {!compact && (
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setKbSidebarVisible(v => !v)}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title={kbSidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
            >
              {kbSidebarVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Library size={18} className="text-blue-500" /> 知识库
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5 ml-2">
              {([
                { key: 'ai' as const, label: 'AI 助手', icon: <Sparkles size={12} />, color: 'purple' },
                { key: 'qa' as const, label: '知识库问答', icon: <Brain size={12} />, color: 'green' },
                { key: 'quiz' as const, label: '智能测验', icon: <GraduationCap size={12} />, color: 'blue' },
              ]).map(tab => (
                <button key={tab.key}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
                    mode === tab.key ? `bg-white shadow text-${tab.color}-600 font-medium` : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => { setMode(tab.key); if (tab.key !== 'quiz') setActiveQuiz(null); }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Model name badge */}
            {(() => {
              const cfg = mode === 'ai' ? (aiLlmConfig || chatConfig) : mode === 'qa' ? (qaLlmConfig || chatConfig) : quizLlmConfig;
              const modelName = cfg?.model;
              return modelName ? (
                <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5 font-mono truncate max-w-[160px]" title={modelName}>
                  {modelName}
                </span>
              ) : null;
            })()}
            {mode === 'ai' && (
              <>
                <button onClick={() => setShowSystemPromptPanel(true)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                    activeAiConv?.systemPrompt !== undefined && activeAiConv.systemPrompt !== ''
                      ? 'bg-purple-50 text-purple-600 border border-purple-200'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`} title="系统提示词与技能">
                  <FileText size={11} /> 提示词
                </button>
                <KbLlmConfigButton storageKey={KB_AI_CONFIG_KEY} label="AI助手" config={aiLlmConfig} onConfigChange={cfg => {
                  setAiLlmConfig(cfg);
                  const newChatConfig = { ...loadChatConfig(), provider: cfg.provider as any, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl };
                  setChatConfig(newChatConfig);
                  chatServiceRef.current = new ChatService(newChatConfig);
                }} />
              </>
            )}
            {mode === 'qa' && (
              <>
                {hasSelection && (
                  <div className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Database size={11} /> {selectedIds.length} 个向量库
                  </div>
                )}
                <button onClick={() => setShowSystemPromptPanel(true)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                    qaTurnPrompt.trim()
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                  }`} title="提示词设计">
                  <FileText size={11} /> 提示词
                </button>
                <KbLlmConfigButton storageKey={KB_QA_CONFIG_KEY} label="知识库问答" config={qaLlmConfig} onConfigChange={setQaLlmConfig} />
              </>
            )}
            {mode === 'quiz' && (
              <KbLlmConfigButton storageKey={KB_QUIZ_CONFIG_KEY} label="智能测验" config={quizLlmConfig} onConfigChange={setQuizLlmConfig} />
            )}
          </div>
        </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {mode === 'ai' && renderAiMode()}
          {mode === 'qa' && renderQAMode()}
          {mode === 'quiz' && (activeQuiz ? (activeQuiz.mode === 'interview' ? renderInterviewMode() : renderActiveQuiz()) : renderQuizSetup())}
        </div>
      </div>
    </div>
  );
}
