import React from 'react';
import { X, HelpCircle, Bot, Wrench, Shield, Lightbulb } from 'lucide-react';

interface AgentHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpSections = [
  {
    icon: Bot,
    title: '如何工作',
    items: [
      '支持 OpenAI、Anthropic、Gemini、Zenmux —— 这些会走原生 Function Calling，调用更精准。',
      '其他模型会自动回退到兼容模式（AI 在回复末尾输出结构化指令块）。',
      '可以手动选中某个模块来限定工具范围，不选则 Agent 自动路由。',
    ],
  },
  {
    icon: Wrench,
    title: '当前能力',
    items: [
      '📝 待办事项：增删改查，支持子任务的查看、创建、修改和删除',
      '📋 便签、Markdown 笔记、Prompt 技能卡的增删改查',
      '📊 记录 OJ 做题（洛谷 / AcWing / LeetCode）、创建结构化题单',
      '🎓 在学习中心创建课程和分类',
      '🗄️ 资源中心条目的增删改查（云盘、服务器、订阅等）',
      '📧 发送邮件（需在设置中配置邮件服务）',
      '📁 本地文件管理：列出目录、读取文件、创建文件（需授权文件夹）',
      '🖼️ 图床管理：查询已上传图片、上传新图片到 Gitee 图床',
    ],
  },
  {
    icon: Shield,
    title: '权限管理',
    items: [
      '🔒 数据权限：点击右侧 🔒 图标，逐项开启读取/写入权限（待办、刷题、资源、题单、课程）。',
      '📂 文件夹权限：点击右侧 📂 图标，添加 Agent 可访问的本地文件夹。',
      '✅ 权限会自动保存，下次打开无需重新勾选。',
      '不开权限时，Agent 只能创建新内容，无法查询或修改已有数据。',
    ],
  },
  {
    icon: Lightbulb,
    title: '推荐用法',
    items: [
      '发图 + 描述：上传截图（如刷题记录、账单），Agent 自动提取信息创建条目。',
      '"帮我总结上周刷题情况" —— 先解锁刷题统计权限，再提问。',
      '"给任务 X 添加几个子任务" —— Agent 自动查询待办并创建子任务。',
      '"新建一个动态规划题单，包含..." —— 直接描述分组和题目即可。',
      '右侧 🗑️ 按钮可清空对话历史，📧 按钮可快速进入邮件模式。',
      '先说清楚分类/优先级/时间，减少 Agent 的确认反复。',
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
              <h2 className="text-lg font-semibold text-gray-900">Agent 使用指南</h2>
              <p className="text-sm text-gray-500 mt-0.5">工具调用、权限管理和推荐用法</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {helpSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="w-9 h-9 rounded-xl bg-white text-blue-600 flex items-center justify-center shadow-sm mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{section.title}</h3>
                <ul className="space-y-1.5">
                  {section.items.map((item) => (
                    <li key={item} className="text-[13px] text-gray-600 leading-relaxed">
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
            开始使用
          </button>
        </div>
      </div>
    </div>
  );
};
