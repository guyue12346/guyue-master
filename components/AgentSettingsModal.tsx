import React, { useState } from 'react';
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

const NATIVE_TOOL_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'zenmux']);

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

  if (!isOpen) return null;

  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const supportsNativeTools = NATIVE_TOOL_PROVIDERS.has(config.provider);

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
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">提供商</span>
              <select
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as ChatConfig['provider'];
                  const nextModel = AGENT_AVAILABLE_MODELS[provider]?.[0]?.id || '';
                  onChangeConfig({ ...config, provider, model: nextModel });
                }}
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
              onChange={(e) => onChangeConfig({ ...config, apiKey: e.target.value })}
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
                onChange={(e) => onChangeConfig({ ...config, baseUrl: e.target.value })}
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
                    ? 'Zenmux / OpenAI / Anthropic / Gemini 会优先走标准 tools 流程；未选模块时会先做一轮模块判断。'
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
