import React from 'react';
import { X, HelpCircle } from 'lucide-react';

interface HelpItem {
  text: string;
}

interface HelpSection {
  title: string;
  items: HelpItem[];
}

interface HelpContent {
  title: string;
  description: string;
  sections: HelpSection[];
}

const HELP_CONTENT: Record<string, HelpContent> = {
  notes: {
    title: '笔记备忘',
    description: '简洁的便签式笔记，快速捕捉你的想法和灵感。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '创建多彩便签，支持黄、绿、蓝、粉等多种颜色' },
          { text: '按月份自动归档，轻松回溯历史笔记' },
          { text: '实时搜索，快速定位目标便签' },
          { text: '支持 Markdown 格式，内容排版更清晰' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '点击右上角「+」新建便签' },
          { text: '点击便签卡片上的编辑图标进入编辑模式' },
          { text: '使用左侧月份分类筛选特定时期的笔记' },
        ],
      },
    ],
  },
  api: {
    title: 'API 管理',
    description: '统一管理你的 API 接口信息，告别散乱的 API 记录。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '记录 API 名称、地址、认证密钥等完整信息' },
          { text: '支持 GET / POST / PUT / DELETE 等多种请求方法' },
          { text: '自定义优先级，数字越小排序越靠前' },
          { text: '分类管理，按项目或功能分组' },
          { text: '一键复制 API Key 和 Endpoint' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '在备注中记录使用示例或注意事项' },
          { text: '利用搜索功能快速找到目标 API' },
          { text: '左侧分类可通过「管理分类」自定义' },
        ],
      },
    ],
  },
  todo: {
    title: '待办事项',
    description: '高效的任务管理系统，帮你掌控每一项工作进度。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '三级优先级（高 / 中 / 低），可视化任务重要程度' },
          { text: '支持子任务拆解，将大任务分解为小步骤' },
          { text: '设置截止日期，避免遗漏重要事项' },
          { text: '顶部「总体规划」区域，支持 Markdown 格式记录目标' },
          { text: '分类管理，按项目分组任务' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '点击任务前的圆圈标记完成状态' },
          { text: '在总体规划中记录长期目标和阶段性计划' },
          { text: '高优先级任务自动排在列表顶部' },
        ],
      },
    ],
  },
  files: {
    title: '文件管理',
    description: '本地文件归档中心，支持多种格式文件的预览与管理。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持 Markdown、PDF、图片、代码等多种文件格式预览' },
          { text: '按分类（文件夹）组织文件，层次清晰' },
          { text: '内置 Markdown 编辑器，可直接编辑 .md 文件' },
          { text: '支持从 Obsidian Vault 批量导入笔记' },
          { text: '可在指定目录快速新建笔记文件' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '先在「设置」中配置本地归档根目录' },
          { text: '点击左侧文件名预览，点击编辑按钮修改内容' },
          { text: '通过「设置 → Obsidian Vault」配置路径后可批量导入' },
          { text: '右键文件可查看重定位、删除等更多操作' },
        ],
      },
    ],
  },
  prompts: {
    title: 'Skills',
    description: 'Prompt 模板库，积累和管理你的 AI 使用技巧。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '创建和管理 Prompt 模板，随时复用' },
          { text: '支持分类整理，按场景归类' },
          { text: '内置 Markdown 渲染，清晰展示格式化内容' },
          { text: '批量导入功能，支持从文件导入大量 Prompt' },
          { text: '全文搜索，快速找到目标模板' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '点击 Prompt 卡片可一键复制全部内容' },
          { text: '为常用 Prompt 添加详细的使用说明' },
          { text: '使用「导入」按钮批量添加社区分享的 Prompt 集' },
        ],
      },
    ],
  },
  markdown: {
    title: 'Markdown 笔记',
    description: '全功能 Markdown 编辑器，支持实时预览和多种排版功能。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持编辑、预览、分屏三种视图模式' },
          { text: '完整 Markdown 语法：标题、列表、代码块、表格等' },
          { text: '自动保存（800ms 防抖），不丢失任何修改' },
          { text: '全屏专注写作模式，减少干扰' },
          { text: '目录（TOC）自动生成，快速导航长文' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '使用 # ## ### 创建标题，自动生成目录导航' },
          { text: '代码块使用 ``` + 语言名 可启用语法高亮' },
          { text: '按 Ctrl+S（Mac: Cmd+S）手动保存并退出编辑' },
          { text: '点击目录图标可展开/折叠文档大纲' },
        ],
      },
    ],
  },
  leetcode: {
    title: 'Code',
    description: '算法题目管理和刷题追踪系统，配合 AI 助手提升刷题效率。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '内置 LeetCode Hot 100 和洛谷题目列表' },
          { text: '标记题目完成状态，追踪刷题进度' },
          { text: '按难度、标签筛选题目' },
          { text: '提交记录热力图，可视化刷题情况' },
          { text: '右下角 AI 小窗，随时获取算法解题思路' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '在数据中心配置 OJ 账号后可同步提交记录' },
          { text: '点击题目标题可直接跳转到对应 OJ 平台' },
          { text: '利用 AI 小窗分析时间复杂度和最优解法' },
        ],
      },
    ],
  },
  learning: {
    title: '学习空间',
    description: '课程和知识体系管理，系统化追踪你的学习进度。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '按分类管理学习课程和知识点' },
          { text: '标记章节完成状态，追踪学习进度' },
          { text: '为每个知识点记录 Markdown 笔记' },
          { text: '右下角 AI 小窗，学习过程中随时提问' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '将大课程拆分为多个小知识点，逐一攻克' },
          { text: '结合 AI 小窗进行费曼学习，用自己的话讲解概念' },
          { text: '定期回顾已学内容，用完成状态追踪复习进度' },
        ],
      },
    ],
  },
  'image-hosting': {
    title: '图床管理',
    description: '基于 GitHub 的个人图床，稳定免费，一键上传获取链接。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '上传图片到 GitHub 仓库作为个人图床' },
          { text: '自动生成 Markdown 格式的图片链接' },
          { text: '按分类管理图片，支持在线预览' },
          { text: '支持批量上传多张图片' },
        ],
      },
      {
        title: '配置步骤',
        items: [
          { text: '在 GitHub 创建一个 Public 仓库作为图床' },
          { text: '生成 Personal Access Token（需要 repo 权限）' },
          { text: '在图床管理页面右上角设置中填入仓库信息和 Token' },
          { text: '配置完成后即可上传图片并一键复制链接' },
        ],
      },
    ],
  },
  chat: {
    title: 'AI Chat',
    description: '多模型 AI 对话助手，支持多种主流 AI 服务商。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持 Zenmux、OpenAI、Anthropic、自定义 API 等服务商' },
          { text: '保留完整对话历史，方便多轮上下文理解' },
          { text: '支持 Markdown 渲染，代码块有语法高亮' },
          { text: '浮动小窗模式，可在刷题或学习时同步使用' },
        ],
      },
      {
        title: '配置步骤',
        items: [
          { text: '点击右上角设置图标，选择 AI 服务商' },
          { text: '输入对应服务商的 API Key' },
          { text: 'Zenmux 用户点击「登录」按钮通过浏览器授权' },
          { text: '选择合适的模型后即可开始对话' },
        ],
      },
    ],
  },
  excalidraw: {
    title: '绘图板',
    description: '内嵌 Excalidraw 白板，支持流程图、思维导图等多种图形绘制。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '手绘风格的流程图、思维导图和示意图' },
          { text: '丰富图形元素：矩形、圆形、箭头、文字等' },
          { text: '支持导出为 PNG 或 SVG 格式' },
          { text: '可从图床插入图片到画板' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '使用 Ctrl+Z 撤销，Ctrl+Y 重做' },
          { text: '滚轮缩放画布，拖拽空白区域移动视图' },
          { text: '选中元素后可调整颜色、字体、线条样式' },
          { text: '按 Ctrl+A 全选，Ctrl+D 复制选中元素' },
        ],
      },
    ],
  },
  datacenter: {
    title: '数据中心',
    description: '功能聚合中心，整合 SSH 管理、OJ 记录、资源中心等多项功能。',
    sections: [
      {
        title: '包含模块',
        items: [
          { text: 'SSH 管理：快速连接远程服务器，支持一键在终端打开' },
          { text: 'OJ 热力图：可视化 LeetCode、洛谷等 OJ 平台的提交记录' },
          { text: '资源中心：管理订阅服务、域名等资源，支持到期邮件提醒' },
          { text: '密码管理：安全存储账号密码，AES-256 加密保护' },
          { text: 'Zenmux：查看 AI 使用量并管理登录状态' },
        ],
      },
      {
        title: '使用技巧',
        items: [
          { text: '在「设置 → 邮件提醒设置」中配置 SMTP，启用资源到期提醒' },
          { text: 'SSH 记录点击「连接」可直接在终端模块中打开' },
          { text: '密码管理需要设置主密码，请务必妥善保管' },
        ],
      },
    ],
  },
};

const PLUGIN_HELP: HelpContent = {
  title: '插件模块',
  description: '这是通过插件系统安装的扩展模块，功能由插件开发者提供。',
  sections: [
    {
      title: '说明',
      items: [
        { text: '插件运行在沙箱环境中，与主应用相互隔离' },
        { text: '如有问题，请参考该插件随附的说明文档' },
        { text: '可在「设置 → 模块管理」中启用或禁用插件' },
      ],
    },
  ],
};

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  appMode: string;
  moduleName?: string;
  isPlugin?: boolean;
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  appMode,
  moduleName,
  isPlugin,
}) => {
  if (!isOpen) return null;

  const content = isPlugin
    ? { ...PLUGIN_HELP, title: moduleName || PLUGIN_HELP.title }
    : HELP_CONTENT[appMode] || null;

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[78vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">{content.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">使用帮助</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <p className="text-sm text-gray-600 leading-relaxed">{content.description}</p>

          {content.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
