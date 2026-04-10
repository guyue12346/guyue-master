import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Trash2, Sparkles, ChevronDown, ChevronRight, Plus, Pencil, Download } from 'lucide-react';
import { AGENT_AVAILABLE_MODELS, ChatConfig } from '../services/chatService';
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
  onClearHistory: () => void;
  modules: ModuleInfo[];
  modulePrompts: Record<string, string>;
  onChangeModulePrompts: (prompts: Record<string, string>) => void;
}

const NATIVE_TOOL_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'zenmux', 'moonshot']);
const STORAGE_KEY_AGENT_API_CONFIGS = 'guyue_agent_api_profiles_v1';

type AgentProvider = keyof typeof AGENT_AVAILABLE_MODELS;

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
      item.provider in AGENT_AVAILABLE_MODELS
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

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onClearHistory,
  modules,
  modulePrompts,
  onChangeModulePrompts,
}) => {
  const [showModulePrompts, setShowModulePrompts] = useState(false);
  const [activeModuleTab, setActiveModuleTab] = useState<string | null>(null);
  const [savedApiConfigs, setSavedApiConfigs] = useState<SavedAgentApiConfig[]>([]);
  const [selectedApiConfigId, setSelectedApiConfigId] = useState<string>('');
  const [globalApiProfiles, setGlobalApiProfiles] = useState<ApiProfile[]>([]);

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
    setSelectedApiConfigId(matched?.id || '');
  }, [isOpen, config.provider, config.apiKey, config.baseUrl]);

  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const supportsNativeTools = NATIVE_TOOL_PROVIDERS.has(config.provider);

  const applyConfig = (item: SavedAgentApiConfig) => {
    const nextModel = AGENT_AVAILABLE_MODELS[item.provider]?.some(m => m.id === config.model)
      ? config.model
      : AGENT_AVAILABLE_MODELS[item.provider]?.[0]?.id || '';
    setSelectedApiConfigId(item.id);
    onChangeConfig({ ...config, provider: item.provider, model: nextModel, apiKey: item.apiKey, baseUrl: item.baseUrl || '' });
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
    cancelEdit();
  };

  const handleDelete = (id: string) => {
    const next = savedApiConfigs.filter(item => item.id !== id);
    setSavedApiConfigs(next);
    persistSavedApiConfigs(next);
    if (selectedApiConfigId === id) setSelectedApiConfigId('');
    if (editingId === id) cancelEdit();
  };

  const formNeedsBaseUrl = formProvider === 'custom' || formProvider === 'ollama';
  const isEditing = editingId !== null;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col"
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">API 配置</p>
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
                    if (!(provider in AGENT_AVAILABLE_MODELS)) return;
                    const typedProvider = provider as ChatConfig['provider'];
                    
                    // 导入到 savedApiConfigs 列表
                    const newItem: SavedAgentApiConfig = {
                      id: crypto.randomUUID(),
                      label: profile.name,
                      provider: typedProvider,
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

          {/* ── 当前模型 ── */}
          <div className="px-5 pb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">模型</p>
            <select
              value={config.model}
              onChange={e => onChangeConfig({ ...config, model: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              {currentModels.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.description ? ` — ${m.description}` : ''}</option>
              ))}
            </select>
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
