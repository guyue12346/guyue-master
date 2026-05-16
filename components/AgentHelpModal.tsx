import React from 'react';
import { X, HelpCircle, Bot, Wrench, Shield, Lightbulb } from 'lucide-react';

interface AgentHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpSections = [
  {
    icon: Bot,
    title: '执行流程',
    items: [
      'Agent 会先判断需求是否明确；分类、时间、优先级、收件人等关键信息不足时会先追问。',
      '复杂任务会进入规划节点，生成步骤列表，再按步骤逐次调用工具，而不是一次性盲目执行。',
      '每一步会读取上一步结果，必要时继续补充查询、打开网页、读取本地数据或请求用户确认。',
      '执行后会进入检查节点，核对工具结果是否满足目标，再给出最终总结。',
    ],
  },
  {
    icon: Wrench,
    title: '能力来源',
    items: [
      '核心模块：待办、数据中心、学习空间、刷题、Git、题库、文件、画布、图床、LaTeX、RAG 等。',
      '联网工具：搜索后可继续打开网页读取正文，适合天气、新闻、GitHub 项目、文档检索。',
      'Skills/MCP：可加载 SKILL.md、Prompt 能力卡和本地 stdio MCP Server。',
      '插件能力：插件可以注册 UI、命令、事件和 Agent tools，统一进入能力注册中心。',
      '复杂需求处理模型：长文写作、复杂规划等任务可交给设置中配置的更强模型处理。',
    ],
  },
  {
    icon: Shield,
    title: '权限与安全',
    items: [
      '权限中心按能力来源分组：核心模块、插件、Skills、MCP，每个工具只在授权后可用。',
      '作用域选择只用于手动收窄工具范围；不选择作用域时，模型看到的是权限中心允许的工具。',
      '删除操作需要用户确认；修改和删除会尽量创建快照，方便撤回。',
      '密码、API Key 等敏感信息会优先本地拦截，不应直接发送给大模型。',
      '需要保存敏感字段时，Agent 会创建空位或补充请求，由你在本地卡片中填写。',
    ],
  },
  {
    icon: Lightbulb,
    title: '推荐用法',
    items: [
      '查询实时信息时，可以直接说“查今天北京天气”，Agent 会先获取当前日期再搜索并打开来源。',
      '创建待办时尽量说明分类、时间、优先级和是否提醒；缺字段时 Agent 会追问。',
      '处理 Git 前先选择仓库；提交、拉取、推送等操作会走确认流程。',
      '需要复用工作流时，把方法写成 Skill 或 Prompt；需要外部工具时接入 MCP。',
      '双击 Command 可在其他页面唤起 Agent 小窗，任务可继续在后台执行。',
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
        className="w-full max-w-2xl max-h-[85vh] rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b border-gray-100">
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

        <div className="flex-1 overflow-y-auto px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <div className="shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-100">
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
