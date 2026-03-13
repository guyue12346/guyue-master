import React from 'react';
import { X, HelpCircle, Bot, Wrench, Compass } from 'lucide-react';

interface AgentHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpSections = [
  {
    icon: Bot,
    title: '如何工作',
    items: [
      '如果你先选中模块，Agent 只会在该模块范围内调用工具。',
      '如果你没有选模块，Agent 会先判断任务属于哪个模块，再决定是否调用工具。',
      'OpenAI、Anthropic、Gemini 会优先走原生 Function Calling。',
    ],
  },
  {
    icon: Wrench,
    title: '当前能力',
    items: [
      '目前已启用待办模块，可以直接创建待办事项。',
      '其他模块图标会保留展示，但暂时不可点击。',
      '不支持原生 tools 的提供商会自动回退到普通对话流程。',
    ],
  },
  {
    icon: Compass,
    title: '推荐用法',
    items: [
      '先选中待办图标，再描述任务，会减少模块判断的额外开销。',
      '描述里尽量包含时间、优先级、分类等信息。',
      '如果没有配置 API Key，可以先点设置图标完成配置。',
    ],
  },
];

export const AgentHelpModal: React.FC<AgentHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Agent 使用帮助</h2>
              <p className="text-sm text-gray-500 mt-1">了解模块选择、工具调用和兼容模式。</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {helpSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="w-10 h-10 rounded-2xl bg-white text-blue-600 flex items-center justify-center shadow-sm mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{section.title}</h3>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item} className="text-sm text-gray-600 leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-blue-600 text-white py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentHelpModal;
