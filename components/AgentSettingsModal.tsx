import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Trash2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { AGENT_AVAILABLE_MODELS, ChatConfig } from '../services/chatService';

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
  const [profileLabel, setProfileLabel] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadSavedApiConfigs();
    setSavedApiConfigs(saved);
    const matched = saved.find(item => (
      item.provider === config.provider &&
      item.apiKey === config.apiKey &&
      (item.baseUrl || '') === (config.baseUrl || '')
    ));
    setSelectedApiConfigId(matched?.id || '');
    setProfileLabel(matched?.label || '');
  }, [isOpen, config.provider, config.apiKey, config.baseUrl]);

  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const supportsNativeTools = NATIVE_TOOL_PROVIDERS.has(config.provider);

  const updateProvider = (provider: ChatConfig['provider']) => {
    const nextModel = AGENT_AVAILABLE_MODELS[provider]?.some(model => model.id === config.model)
      ? config.model
      : AGENT_AVAILABLE_MODELS[provider]?.[0]?.id || '';
    setSelectedApiConfigId('');
    onChangeConfig({ ...config, provider, model: nextModel });
  };

  const applySavedApiConfig = (savedConfig: SavedAgentApiConfig) => {
    const nextModel = AGENT_AVAILABLE_MODELS[savedConfig.provider]?.some(model => model.id === config.model)
      ? config.model
      : AGENT_AVAILABLE_MODELS[savedConfig.provider]?.[0]?.id || '';
    setSelectedApiConfigId(savedConfig.id);
    setProfileLabel(savedConfig.label);
    onChangeConfig({
      ...config,
      provider: savedConfig.provider,
      model: nextModel,
      apiKey: savedConfig.apiKey,
      baseUrl: savedConfig.baseUrl || '',
    });
  };

  const handleSaveCurrentProfile = (overwrite = false) => {
    const label = profileLabel.trim();
    if (!label || !config.apiKey.trim()) return;

    const profile: SavedAgentApiConfig = {
      id: overwrite && selectedApiConfigId ? selectedApiConfigId : crypto.randomUUID(),
      label,
      provider: config.provider as AgentProvider,
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl?.trim() || '',
    };

    const nextConfigs = overwrite && selectedApiConfigId
      ? savedApiConfigs.map(item => item.id === selectedApiConfigId ? profile : item)
      : [profile, ...savedApiConfigs.filter(item => item.id !== profile.id)];

    setSavedApiConfigs(nextConfigs);
    setSelectedApiConfigId(profile.id);
    persistSavedApiConfigs(nextConfigs);
    setProfileLabel('');
  };

  const handleDeleteProfile = () => {
    if (!selectedApiConfigId) return;
    const nextConfigs = savedApiConfigs.filter(item => item.id !== selectedApiConfigId);
    setSavedApiConfigs(nextConfigs);
    setSelectedApiConfigId('');
    persistSavedApiConfigs(nextConfigs);
  };

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
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Agent 设置</h2>
            <p className="text-sm text-gray-500 mt-1">配置模型提供商、模型和 API Key。</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto min-h-0">
          <div className="rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">API 配置仓库</p>
              <p className="text-xs text-gray-500 mt-1">保存多组 Key，之后可一键切换当前 Agent 提供商与凭据。</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="max-h-44 overflow-y-auto space-y-2">
                {savedApiConfigs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-400">
                    还没有已保存的 API 配置
                  </div>
                ) : (
                  savedApiConfigs.map(item => (
                    <button
                      key={item.id}
                      onClick={() => applySavedApiConfig(item)}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedApiConfigId === item.id
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{item.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.provider} · {maskApiKey(item.apiKey)}</p>
                        </div>
                        {selectedApiConfigId === item.id && (
                          <span className="text-xs font-medium text-blue-600">当前已应用</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={profileLabel}
                  onChange={(e) => setProfileLabel(e.target.value)}
                  placeholder="例如：主力 Kimi Key / 备用 OpenAI"
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  onClick={() => handleSaveCurrentProfile(false)}
                  disabled={!profileLabel.trim() || !config.apiKey.trim()}
                  className="rounded-xl bg-gray-900 px-3 py-2.5 text-sm text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  保存当前
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => handleSaveCurrentProfile(true)}
                  disabled={!selectedApiConfigId || !config.apiKey.trim()}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  覆盖已选配置
                </button>
                <button
                  onClick={handleDeleteProfile}
                  disabled={!selectedApiConfigId}
                  className="rounded-lg border border-red-200 px-3 py-2 text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  删除已选配置
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">提供商</span>
              <select
                value={config.provider}
                onChange={(e) => updateProvider(e.target.value as ChatConfig['provider'])}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {Object.keys(AGENT_AVAILABLE_MODELS).map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">模型</span>
              <select
                value={config.model}
                onChange={(e) => onChangeConfig({ ...config, model: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {currentModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-2">API Key</span>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => {
                setSelectedApiConfigId('');
                onChangeConfig({ ...config, apiKey: e.target.value });
              }}
              placeholder="输入你的 API Key"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>

          {(config.provider === 'custom' || config.provider === 'ollama') && (
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">Base URL</span>
              <input
                type="text"
                value={config.baseUrl || ''}
                onChange={(e) => {
                  setSelectedApiConfigId('');
                  onChangeConfig({ ...config, baseUrl: e.target.value });
                }}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </label>
          )}

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-2">系统提示词</span>
            <textarea
              value={config.systemPrompt || ''}
              onChange={(e) => onChangeConfig({ ...config, systemPrompt: e.target.value })}
              placeholder="留空则仅使用内置 Agent 系统提示词"
              rows={5}
              className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              这里的内容会追加到 Agent 内置提示词末尾，适合写你的固定约束或偏好。
            </p>
          </label>

          {/* Per-module prompts */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowModulePrompts(!showModulePrompts)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-sm font-medium text-gray-700">模块专属提示词</span>
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
                      onChange={(e) => onChangeModulePrompts({ ...modulePrompts, [activeModuleTab]: e.target.value })}
                      placeholder={`为「${modules.find(m => m.id === activeModuleTab)?.name}」模块设置专属指令...\n\n例如：创建待办时默认优先级为高`}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    />
                    <p className="mt-1.5 text-xs text-gray-500">
                      当 Agent 路由到此模块时，此提示词会注入系统提示。留空不生效。
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white text-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900">
                  {supportsNativeTools ? '当前提供商支持原生 Function Calling' : '当前提供商走兼容模式'}
                </p>
                <p className="text-xs text-blue-700 leading-relaxed">
                  {supportsNativeTools
                    ? 'Zenmux / OpenAI / Anthropic / Gemini / Kimi 会优先走标准 tools 流程；未选模块时会先做一轮模块判断。'
                    : '其他提供商会继续使用普通对话与 action block 兼容流程。'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={onClearHistory}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清除对话
          </button>

          <div className="flex items-center gap-2 text-sm">
            {config.apiKey ? (
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                已配置
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                需要配置 API Key
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsModal;
