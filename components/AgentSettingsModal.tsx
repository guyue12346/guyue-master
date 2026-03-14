import React from 'react';
import { X, CheckCircle2, AlertCircle, Trash2, Sparkles } from 'lucide-react';
import { AGENT_AVAILABLE_MODELS, ChatConfig } from '../services/chatService';

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatConfig;
  onChangeConfig: (config: ChatConfig) => void;
  onClearHistory: () => void;
}

const NATIVE_TOOL_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'zenmux']);

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  const currentModels = AGENT_AVAILABLE_MODELS[config.provider] || [];
  const supportsNativeTools = NATIVE_TOOL_PROVIDERS.has(config.provider);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
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

        <div className="px-6 py-5 space-y-5">
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
