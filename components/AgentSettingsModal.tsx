import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Trash2, Sparkles, ChevronDown, ChevronRight, Plus, Pencil, Mail, Server, Key, Edit3, BookUser, Send, Loader2, Globe2, Search } from 'lucide-react';
import { AGENT_AVAILABLE_MODELS, ChatConfig } from '../services/chatService';
import type { AgentEmailConfig, AgentSearchConfig, AgentSearchMode, AgentSearchProvider, AgentSpecializedSearchSource, Contact } from '../services/agent/agentStorage';
import { loadProfiles } from '../utils/apiProfileService';
import type { ApiProfile } from '../types';

interface ModuleInfo {
  id: string;
  name: string;
}

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatConfig;
  onChangeConfig: (config: ChatConfig) => void;
  routerConfig: ChatConfig;
  onChangeRouterConfig: (config: ChatConfig) => void;
  searchConfig: AgentSearchConfig;
  onChangeSearchConfig: (config: AgentSearchConfig) => void;
  onClearHistory: () => void;
  modules: ModuleInfo[];
  modulePrompts: Record<string, string>;
  onChangeModulePrompts: (prompts: Record<string, string>) => void;
  emailConfig: AgentEmailConfig;
  onChangeEmailConfig: (config: AgentEmailConfig) => void;
  onSaveEmailConfig: () => void;
  onTestEmail: () => void;
  emailTestStatus: 'idle' | 'loading' | 'success' | 'error';
  emailTestError: string;
  contacts: Contact[];
  onSaveContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
}

const NATIVE_TOOL_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'zenmux', 'moonshot']);
const STORAGE_KEY_AGENT_API_CONFIGS = 'guyue_agent_api_profiles_v1';

type AgentProvider = ChatConfig['provider'];

const isAgentProvider = (provider: string): provider is AgentProvider =>
  provider in AGENT_AVAILABLE_MODELS;

interface SavedAgentApiConfig {
  id: string;
  label: string;
  provider: AgentProvider;
  apiKey: string;
  baseUrl?: string;
}

const loadSavedApiConfigs = (): SavedAgentApiConfig[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_API_CONFIGS);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedAgentApiConfig => (
      item &&
      typeof item.id === 'string' &&
      typeof item.label === 'string' &&
      typeof item.provider === 'string' &&
      typeof item.apiKey === 'string' &&
      isAgentProvider(item.provider)
    ));
  } catch {
    return [];
  }
};

const persistSavedApiConfigs = (configs: SavedAgentApiConfig[]) => {
  localStorage.setItem(STORAGE_KEY_AGENT_API_CONFIGS, JSON.stringify(configs));
};

const maskApiKey = (apiKey: string) => {
  if (!apiKey) return '未填写';
  if (apiKey.length <= 10) return apiKey;
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

const PROVIDER_LABELS: Record<string, string> = {
  zenmux: 'Zenmux', openai: 'OpenAI', anthropic: 'Anthropic',
  gemini: 'Gemini', moonshot: 'Kimi', deepseek: 'DeepSeek',
  ollama: 'Ollama', custom: '自定义',
};

const SEARCH_PROVIDER_LABELS: Record<AgentSearchProvider, string> = {
  'openai-web-search': 'OpenAI Web Search',
  tavily: 'Tavily',
  exa: 'Exa',
  brave: 'Brave',
  searxng: 'SearXNG',
  'bing-browser': 'Bing Browser',
  'duckduckgo-browser': 'DuckDuckGo Browser',
};

const SEARCH_PROVIDERS: AgentSearchProvider[] = ['openai-web-search', 'tavily', 'exa', 'brave', 'searxng', 'duckduckgo-browser', 'bing-browser'];
const SEARCH_MODES: Array<{ key: AgentSearchMode; label: string }> = [
  { key: 'fast', label: '快速' },
  { key: 'balanced', label: '均衡' },
  { key: 'deep', label: '深入' },
];
const SPECIALIZED_SEARCH_SOURCE_LABELS: Record<AgentSpecializedSearchSource, string> = {
  github: 'GitHub',
  npm: 'npm',
  stackoverflow: 'StackOverflow',
  arxiv: 'arXiv',
};
const SPECIALIZED_SEARCH_SOURCES: AgentSpecializedSearchSource[] = ['github', 'npm', 'stackoverflow', 'arxiv'];

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  routerConfig,
  onChangeRouterConfig,
  searchConfig,
  onChangeSearchConfig,
  onClearHistory,
  modules,
  modulePrompts,
  onChangeModulePrompts,
  emailConfig,
  onChangeEmailConfig,
  onSaveEmailConfig,
  onTestEmail,
  emailTestStatus,
  emailTestError,
  contacts,
  onSaveContact,
  onDeleteContact,
}) => {
  const [showModulePrompts, setShowModulePrompts] = useState(false);
  const [activeModuleTab, setActiveModuleTab] = useState<string | null>(null);
  const [savedApiConfigs, setSavedApiConfigs] = useState<SavedAgentApiConfig[]>([]);
  const [selectedApiConfigId, setSelectedApiConfigId] = useState<string>('');
  const [selectedRouterApiConfigId, setSelectedRouterApiConfigId] = useState<string>('');
  const [globalApiProfiles, setGlobalApiProfiles] = useState<ApiProfile[]>([]);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // 新增表单状态
  const [formLabel, setFormLabel] = useState('');
  const [formProvider, setFormProvider] = useState<AgentProvider>('zenmux');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');

  // 编辑模式
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadSavedApiConfigs();
    setSavedApiConfigs(saved);
    setGlobalApiProfiles(loadProfiles());
    const matched = saved.find(item => (
      item.provider === config.provider &&
      item.apiKey === config.apiKey &&
      (item.baseUrl || '') === (config.baseUrl || '')
    ));
    const matchedRouter = saved.find(item => (
      item.provider === routerConfig.provider &&
      item.apiKey === routerConfig.apiKey &&
      (item.baseUrl || '') === (routerConfig.baseUrl || '')
    ));
    setSelectedApiConfigId(matched?.id || '');
    setSelectedRouterApiConfigId(matchedRouter?.id || '');
  }, [isOpen, config.provider, config.apiKey, config.baseUrl, routerConfig.provider, routerConfig.apiKey, routerConfig.baseUrl]);

  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const routerModels = AGENT_AVAILABLE_MODELS[routerConfig.provider] || [];
  const supportsNativeTools = NATIVE_TOOL_PROVIDERS.has(config.provider);

  const applyConfig = (item: SavedAgentApiConfig) => {
    const nextModel = AGENT_AVAILABLE_MODELS[item.provider]?.some(m => m.id === config.model)
      ? config.model
      : AGENT_AVAILABLE_MODELS[item.provider]?.[0]?.id || '';
    setSelectedApiConfigId(item.id);
    onChangeConfig({ ...config, provider: item.provider, model: nextModel, apiKey: item.apiKey, baseUrl: item.baseUrl || '' });
  };

  const applyRouterConfig = (item: SavedAgentApiConfig) => {
    const nextModel = AGENT_AVAILABLE_MODELS[item.provider]?.some(m => m.id === routerConfig.model)
      ? routerConfig.model
      : AGENT_AVAILABLE_MODELS[item.provider]?.[0]?.id || '';
    setSelectedRouterApiConfigId(item.id);
    onChangeRouterConfig({
      ...routerConfig,
      provider: item.provider,
      model: nextModel,
      apiKey: item.apiKey,
      baseUrl: item.baseUrl || '',
      systemPrompt: '',
      temperature: 0,
      maxTokens: 1024,
    });
  };

  const startEdit = (item: SavedAgentApiConfig) => {
    setEditingId(item.id);
    setFormLabel(item.label);
    setFormProvider(item.provider);
    setFormApiKey(item.apiKey);
    setFormBaseUrl(item.baseUrl || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormLabel('');
    setFormProvider('zenmux');
    setFormApiKey('');
    setFormBaseUrl('');
  };

  const handleAdd = () => {
    if (!formLabel.trim() || !formApiKey.trim()) return;
    const newItem: SavedAgentApiConfig = {
      id: crypto.randomUUID(),
      label: formLabel.trim(),
      provider: formProvider,
      apiKey: formApiKey.trim(),
      baseUrl: formBaseUrl.trim() || '',
    };
    const next = [...savedApiConfigs, newItem];
    setSavedApiConfigs(next);
    persistSavedApiConfigs(next);
    // 添加后自动应用
    applyConfig(newItem);
    cancelEdit();
  };

  const handleSaveEdit = () => {
    if (!editingId || !formLabel.trim() || !formApiKey.trim()) return;
    const updated: SavedAgentApiConfig = {
      id: editingId,
      label: formLabel.trim(),
      provider: formProvider,
      apiKey: formApiKey.trim(),
      baseUrl: formBaseUrl.trim() || '',
    };
    const next = savedApiConfigs.map(item => item.id === editingId ? updated : item);
    setSavedApiConfigs(next);
    persistSavedApiConfigs(next);
    if (selectedApiConfigId === editingId) applyConfig(updated);
    if (selectedRouterApiConfigId === editingId) applyRouterConfig(updated);
    cancelEdit();
  };

  const handleDelete = (id: string) => {
    const next = savedApiConfigs.filter(item => item.id !== id);
    setSavedApiConfigs(next);
    persistSavedApiConfigs(next);
    if (selectedApiConfigId === id) setSelectedApiConfigId('');
    if (selectedRouterApiConfigId === id) {
      setSelectedRouterApiConfigId('');
      onChangeRouterConfig({ ...routerConfig, apiKey: '', baseUrl: '', systemPrompt: '', temperature: 0, maxTokens: 1024 });
    }
    if (editingId === id) cancelEdit();
  };

  const formNeedsBaseUrl = formProvider === 'custom' || formProvider === 'ollama';
  const configNeedsBaseUrl = config.provider === 'custom' || config.provider === 'ollama';
  const selectedRouterConfig = savedApiConfigs.find(item => item.id === selectedRouterApiConfigId);
  const hasUnlistedRouterConfig = Boolean(routerConfig.apiKey && !selectedRouterConfig);
  const isEditing = editingId !== null;
  const updateSearchConfig = (patch: Partial<AgentSearchConfig>) => onChangeSearchConfig({ ...searchConfig, ...patch });
  const updateSearchApiKey = (provider: keyof AgentSearchConfig['apiKeys'], apiKey: string) => {
    updateSearchConfig({ apiKeys: { ...searchConfig.apiKeys, [provider]: apiKey } });
  };
  const updateSpecializedSearchConfig = (patch: Partial<AgentSearchConfig['specialized']>) => {
    updateSearchConfig({ specialized: { ...searchConfig.specialized, ...patch } });
  };
  const updateSpecializedSearchApiKey = (provider: keyof AgentSearchConfig['specialized']['apiKeys'], apiKey: string) => {
    updateSpecializedSearchConfig({ apiKeys: { ...searchConfig.specialized.apiKeys, [provider]: apiKey } });
  };
  const toggleSpecializedSearchSource = (source: AgentSpecializedSearchSource) => {
    const current = searchConfig.specialized.enabledSources || [];
    updateSpecializedSearchConfig({
      enabledSources: current.includes(source)
        ? current.filter(item => item !== source)
        : [...current, source],
    });
  };
  const toggleFallbackProvider = (provider: AgentSearchProvider) => {
    const current = searchConfig.fallbackProviders || [];
    updateSearchConfig({
      fallbackProviders: current.includes(provider)
        ? current.filter(item => item !== provider)
        : [...current, provider],
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Agent 设置</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1">
          {/* ── API 配置列表 ── */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Agent API 配置列表</p>
            {/* 从全局配置快速导入 */}
            {globalApiProfiles.length > 0 && (
              <div className="mb-3">
                <select
                  className="w-full rounded-lg border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-gray-600 outline-none focus:border-blue-400"
                  value=""
                  onChange={e => {
                    const profile = globalApiProfiles.find(p => p.id === e.target.value);
                    if (!profile) return;
                    const provider = profile.provider;
                    if (!isAgentProvider(provider)) return;
                    
                    // 导入到 savedApiConfigs 列表
                    const newItem: SavedAgentApiConfig = {
                      id: crypto.randomUUID(),
                      label: profile.name,
                      provider,
                      apiKey: profile.apiKey,
                      baseUrl: profile.baseUrl || '',
                    };
                    const next = [...savedApiConfigs, newItem];
                    setSavedApiConfigs(next);
                    persistSavedApiConfigs(next);
                    
                    // 自动应用该配置
                    applyConfig(newItem);
                  }}
                >
                  <option value="">⬇ 从全局设置导入配置…</option>
                  {globalApiProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.provider})</option>
                  ))}
                </select>
              </div>
            )}
            {savedApiConfigs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                暂无配置，在下方添加第一条
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedApiConfigs.map(item => {
                  const isActive = selectedApiConfigId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                        isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {/* 单选指示 */}
                      <button
                        onClick={() => applyConfig(item)}
                        className="shrink-0"
                        title="设为当前使用"
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isActive ? 'border-blue-500' : 'border-gray-300 hover:border-blue-400'
                        }`}>
                          {isActive && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                      </button>

                      {/* 信息 */}
                      <button
                        className="flex-1 text-left min-w-0"
                        onClick={() => applyConfig(item)}
                      >
                        <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-800' : 'text-gray-800'}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {PROVIDER_LABELS[item.provider] || item.provider} · {maskApiKey(item.apiKey)}
                        </p>
                      </button>

                      {/* 操作 */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => startEdit(item)}
                          className="w-7 h-7 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="w-7 h-7 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Agent 本体 API ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Agent 本体 API</p>
                <span className="text-[11px] text-blue-400">{config.apiKey ? '已配置' : '未配置'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">提供商</label>
                  <select
                    value={config.provider}
                    onChange={e => {
                      const provider = e.target.value as AgentProvider;
                      onChangeConfig({
                        ...config,
                        provider,
                        model: AGENT_AVAILABLE_MODELS[provider]?.[0]?.id || '',
                      });
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {Object.keys(AGENT_AVAILABLE_MODELS).map(p => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">模型</label>
                  <select
                    value={config.model}
                    onChange={e => onChangeConfig({ ...config, model: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {currentModels.map(m => (
                      <option key={m.id} value={m.id}>{m.name}{m.description ? ` — ${m.description}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={e => onChangeConfig({ ...config, apiKey: e.target.value })}
                  placeholder="Agent 主模型 API Key"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {configNeedsBaseUrl && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                  <input
                    type="text"
                    value={config.baseUrl || ''}
                    onChange={e => onChangeConfig({ ...config, baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── 自动路由 API ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">自动路由 API</p>
                <button
                  onClick={() => {
                    setSelectedRouterApiConfigId('');
                    onChangeRouterConfig({ ...routerConfig, apiKey: '', baseUrl: '', systemPrompt: '', temperature: 0, maxTokens: 1024 });
                  }}
                  className="text-[11px] text-gray-400 hover:text-gray-600"
                >
                  跟随主模型
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">配置来源</label>
                  <select
                    className="w-full rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    value={selectedRouterApiConfigId}
                    onChange={e => {
                      const nextId = e.target.value;
                      if (!nextId) {
                        setSelectedRouterApiConfigId('');
                        onChangeRouterConfig({ ...routerConfig, apiKey: '', baseUrl: '', systemPrompt: '', temperature: 0, maxTokens: 1024 });
                        return;
                      }
                      const item = savedApiConfigs.find(p => p.id === nextId);
                      if (item) applyRouterConfig(item);
                    }}
                  >
                    <option value="">跟随主 Agent 模型</option>
                    {savedApiConfigs.map(item => (
                      <option key={item.id} value={item.id}>{item.label} ({PROVIDER_LABELS[item.provider] || item.provider})</option>
                    ))}
                  </select>
                  {savedApiConfigs.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">先在上方保存 API 配置后，可选择其中一个作为路由模型。</p>
                  )}
                  {hasUnlistedRouterConfig && (
                    <p className="mt-1 text-[11px] text-amber-500">当前路由配置不在已保存列表中，建议从上方配置列表重新选择。</p>
                  )}
                </div>

                {(selectedRouterConfig || hasUnlistedRouterConfig) && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">模型</label>
                    <select
                      value={routerConfig.model}
                      onChange={e => onChangeRouterConfig({ ...routerConfig, model: e.target.value, systemPrompt: '', temperature: 0, maxTokens: 1024 })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 bg-white"
                    >
                      {routerModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}{m.description ? ` — ${m.description}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-[11px] text-gray-400">
                  {routerConfig.apiKey
                    ? `路由使用 ${selectedRouterConfig?.label ? `${selectedRouterConfig.label} · ` : ''}${PROVIDER_LABELS[routerConfig.provider] || routerConfig.provider} · ${routerConfig.model}`
                    : '当前未单独配置，自动路由会使用主 Agent 模型。'}
                </p>
              </div>
            </div>
          </div>

          {/* ── 联网搜索 ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <Globe2 className="w-3.5 h-3.5" />
                  联网搜索
                </p>
                <span className="text-[11px] text-gray-400">{SEARCH_PROVIDER_LABELS[searchConfig.provider]}</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">默认引擎</label>
                    <select
                      value={searchConfig.provider}
                      onChange={e => updateSearchConfig({ provider: e.target.value as AgentSearchProvider })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      {SEARCH_PROVIDERS.map(provider => (
                        <option key={provider} value={provider}>{SEARCH_PROVIDER_LABELS[provider]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">模式</label>
                    <select
                      value={searchConfig.mode}
                      onChange={e => updateSearchConfig({ mode: e.target.value as AgentSearchMode })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      {SEARCH_MODES.map(mode => (
                        <option key={mode.key} value={mode.key}>{mode.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">结果数</label>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={searchConfig.maxResults}
                      onChange={e => updateSearchConfig({ maxResults: Math.min(Math.max(parseInt(e.target.value, 10) || 8, 3), 20) })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={searchConfig.includeAnswer}
                      onChange={e => updateSearchConfig({ includeAnswer: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    返回直答
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={searchConfig.includeRawContent}
                      onChange={e => updateSearchConfig({ includeRawContent: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    抓取正文
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">语言</label>
                    <input
                      type="text"
                      value={searchConfig.language}
                      onChange={e => updateSearchConfig({ language: e.target.value })}
                      placeholder="zh-CN"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">地区</label>
                    <input
                      type="text"
                      value={searchConfig.country}
                      onChange={e => updateSearchConfig({ country: e.target.value })}
                      placeholder="CN"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-gray-500">API Key</label>
                  <input
                    type="password"
                    value={searchConfig.apiKeys.openai}
                    onChange={e => updateSearchApiKey('openai', e.target.value)}
                    placeholder="OpenAI API Key（Responses web_search）"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="password"
                    value={searchConfig.apiKeys.tavily}
                    onChange={e => updateSearchApiKey('tavily', e.target.value)}
                    placeholder="Tavily API Key"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="password"
                    value={searchConfig.apiKeys.exa}
                    onChange={e => updateSearchApiKey('exa', e.target.value)}
                    placeholder="Exa API Key"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="password"
                    value={searchConfig.apiKeys.brave}
                    onChange={e => updateSearchApiKey('brave', e.target.value)}
                    placeholder="Brave Search API Key"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="text"
                    value={searchConfig.searxngBaseUrl}
                    onChange={e => updateSearchConfig({ searxngBaseUrl: e.target.value })}
                    placeholder="SearXNG Base URL，例如 https://search.example.com"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">失败回退</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SEARCH_PROVIDERS.map(provider => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => toggleFallbackProvider(provider)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                          searchConfig.fallbackProviders.includes(provider)
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {SEARCH_PROVIDER_LABELS[provider]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <Search className="w-3.5 h-3.5" />
                      专用搜索配置
                    </p>
                    <span className="text-[11px] text-gray-400">
                      {searchConfig.specialized.enabledSources.length} 个来源
                    </span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="grid grid-cols-[1fr_96px] gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">启用来源</label>
                        <div className="flex flex-wrap gap-1.5">
                          {SPECIALIZED_SEARCH_SOURCES.map(source => (
                            <button
                              key={source}
                              type="button"
                              onClick={() => toggleSpecializedSearchSource(source)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                                searchConfig.specialized.enabledSources.includes(source)
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-gray-200 bg-white text-gray-400 hover:text-gray-600'
                              }`}
                            >
                              {SPECIALIZED_SEARCH_SOURCE_LABELS[source]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">结果数</label>
                        <input
                          type="number"
                          min={3}
                          max={20}
                          value={searchConfig.specialized.maxResults}
                          onChange={e => updateSpecializedSearchConfig({ maxResults: Math.min(Math.max(parseInt(e.target.value, 10) || 8, 3), 20) })}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="password"
                        value={searchConfig.specialized.apiKeys.github}
                        onChange={e => updateSpecializedSearchApiKey('github', e.target.value)}
                        placeholder="GitHub Token，可选"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                      <input
                        type="password"
                        value={searchConfig.specialized.apiKeys.stackExchange}
                        onChange={e => updateSpecializedSearchApiKey('stackExchange', e.target.value)}
                        placeholder="StackExchange Key，可选"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 添加 / 编辑表单 ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {isEditing ? '编辑配置' : '添加新配置'}
                </p>
                {isEditing && (
                  <button onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">取消</button>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">名称 <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={formLabel}
                      onChange={e => setFormLabel(e.target.value)}
                      placeholder="例如：主力 Kimi"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">提供商 <span className="text-red-400">*</span></label>
                    <select
                      value={formProvider}
                      onChange={e => setFormProvider(e.target.value as AgentProvider)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                    >
                      {Object.keys(AGENT_AVAILABLE_MODELS).map(p => (
                        <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-red-400">*</span></label>
                  <input
                    type="password"
                    value={formApiKey}
                    onChange={e => setFormApiKey(e.target.value)}
                    placeholder="输入 API Key"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {formNeedsBaseUrl && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={formBaseUrl}
                      onChange={e => setFormBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}
                <div className="pt-1">
                  {isEditing ? (
                    <button
                      onClick={handleSaveEdit}
                      disabled={!formLabel.trim() || !formApiKey.trim()}
                      className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      保存修改
                    </button>
                  ) : (
                    <button
                      onClick={handleAdd}
                      disabled={!formLabel.trim() || !formApiKey.trim()}
                      className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      添加
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── 系统提示词 ── */}
          <div className="px-5 pb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">自定义系统提示词</p>
            <textarea
              value={config.systemPrompt || ''}
              onChange={e => onChangeConfig({ ...config, systemPrompt: e.target.value })}
              placeholder="留空则仅使用内置 Agent 系统提示词"
              rows={4}
              className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {/* ── 邮件与通讯录 ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">邮件与通讯录</p>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Server className="w-3 h-3" />SMTP 服务器</label>
                    <input
                      type="text"
                      value={emailConfig.smtp.host}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, host: e.target.value } })}
                      placeholder="smtp.163.com"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">端口</label>
                    <input
                      type="number"
                      value={emailConfig.smtp.port}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, port: parseInt(e.target.value) || 465 } })}
                      placeholder="465"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={emailConfig.smtp.secure}
                    onChange={e => onChangeEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, secure: e.target.checked } })}
                    className="rounded border-gray-300"
                  />
                  使用 SSL/TLS
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Mail className="w-3 h-3" />发件邮箱</label>
                    <input
                      type="email"
                      value={emailConfig.smtp.user}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, user: e.target.value } })}
                      placeholder="your-email@example.com"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Edit3 className="w-3 h-3" />发件人名称</label>
                    <input
                      type="text"
                      value={emailConfig.senderName ?? '古月的Agent助理'}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, senderName: e.target.value })}
                      placeholder="古月的Agent助理"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Key className="w-3 h-3" />SMTP 授权码</label>
                    <input
                      type="password"
                      value={emailConfig.smtp.pass}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, pass: e.target.value } })}
                      placeholder="授权码"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-1"><Mail className="w-3 h-3" />默认收件邮箱</label>
                    <input
                      type="email"
                      value={emailConfig.recipient}
                      onChange={e => onChangeEmailConfig({ ...emailConfig, recipient: e.target.value })}
                      placeholder="receive@example.com"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onTestEmail}
                    disabled={emailTestStatus === 'loading'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {emailTestStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    测试
                  </button>
                  <button
                    onClick={onSaveEmailConfig}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    保存邮件配置
                  </button>
                  {emailTestStatus === 'success' && <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />测试成功</span>}
                  {emailTestStatus === 'error' && <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />{emailTestError}</span>}
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"><BookUser className="w-3.5 h-3.5" />通讯录</label>
                    <button
                      onClick={() => setEditingContact({ id: '', nickname: '', email: '', note: '' })}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-3 h-3" />添加
                    </button>
                  </div>
                  {editingContact && (
                    <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editingContact.nickname}
                          onChange={e => setEditingContact(prev => prev ? { ...prev, nickname: e.target.value } : prev)}
                          placeholder="简称"
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400"
                        />
                        <input
                          type="email"
                          value={editingContact.email}
                          onChange={e => setEditingContact(prev => prev ? { ...prev, email: e.target.value } : prev)}
                          placeholder="邮箱"
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={editingContact.note}
                        onChange={e => setEditingContact(prev => prev ? { ...prev, note: e.target.value } : prev)}
                        placeholder="备注"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (!editingContact.nickname.trim() || !editingContact.email.trim()) return;
                            onSaveContact(editingContact);
                            setEditingContact(null);
                          }}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditingContact(null)}
                          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {contacts.length === 0 && !editingContact && (
                      <p className="rounded-xl border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">暂无联系人</p>
                    )}
                    {contacts.map(contact => (
                      <div key={contact.id} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-gray-50 group transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800 truncate">{contact.nickname}</span>
                            <span className="text-xs text-gray-400 truncate">{contact.email}</span>
                          </div>
                          {contact.note && <p className="text-xs text-gray-400 truncate">{contact.note}</p>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingContact({ ...contact })}
                            className="w-7 h-7 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 flex items-center justify-center transition-colors"
                            title="编辑联系人"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteContact(contact.id)}
                            className="w-7 h-7 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors"
                            title="删除联系人"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── 模块专属提示词 ── */}
          <div className="px-5 pb-4">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setShowModulePrompts(!showModulePrompts)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">模块专属提示词</span>
                {showModulePrompts ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </button>
              {showModulePrompts && (
                <div className="border-t border-gray-200">
                  <div className="flex flex-wrap gap-1.5 px-4 py-3 bg-gray-50/50 border-b border-gray-100">
                    {modules.map(m => {
                      const hasContent = !!modulePrompts[m.id]?.trim();
                      return (
                        <button
                          key={m.id}
                          onClick={() => setActiveModuleTab(activeModuleTab === m.id ? null : m.id)}
                          className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                            activeModuleTab === m.id
                              ? 'bg-blue-600 text-white shadow-sm'
                              : hasContent
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {m.name}{hasContent ? ' ●' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {activeModuleTab && (
                    <div className="px-4 py-3">
                      <textarea
                        value={modulePrompts[activeModuleTab] || ''}
                        onChange={e => onChangeModulePrompts({ ...modulePrompts, [activeModuleTab]: e.target.value })}
                        placeholder={`为「${modules.find(m => m.id === activeModuleTab)?.name}」模块设置专属指令...`}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── 工具调用模式提示 ── */}
          <div className="px-5 pb-5">
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${supportsNativeTools ? 'border-blue-100 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
              <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${supportsNativeTools ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className={`text-xs leading-relaxed ${supportsNativeTools ? 'text-blue-700' : 'text-gray-500'}`}>
                {supportsNativeTools
                  ? '当前提供商支持原生 Function Calling，Agent 会走标准 tools 流程。'
                  : '当前提供商走兼容模式，使用普通对话与 action block 解析。'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={onClearHistory}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除对话
          </button>
          <div className="text-sm">
            {config.apiKey ? (
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" />已配置
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-600">
                <AlertCircle className="w-4 h-4" />需要配置 API Key
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsModal;
