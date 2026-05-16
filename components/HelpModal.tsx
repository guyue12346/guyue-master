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
    title: '便签',
    description: '轻量记录入口，用来保存临时想法、片段信息和快速备忘。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '创建不同颜色的便签，按时间自动归档' },
          { text: '支持 Markdown 内容，适合保存短笔记、清单和链接' },
          { text: '支持搜索历史便签，快速定位旧记录' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '适合保存临时信息；长期文档建议转入 Markdown 或学习空间' },
          { text: '便签数据参与本地备份，更新前建议使用设置中的数据备份功能' },
        ],
      },
    ],
  },
  todo: {
    title: '任务与日程',
    description: '管理待办、提醒、日程和总体规划。新增任务必须选择已有分类。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持待办、子任务、截止时间、提醒时间、优先级和完成状态' },
          { text: '顶部总体规划支持 Markdown，用于保存长期目标和阶段计划' },
          { text: '已完成表示任务完成；已归档表示从当前工作视图收起到历史区' },
          { text: 'Agent 创建任务时会检查分类、时间、优先级等必要字段' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '先建立清晰分类，再创建任务，避免后期整理成本' },
          { text: '时间相关任务请明确日期和时区；“明天”会按本机当前日期解析' },
          { text: '重要任务建议同时填写优先级和提醒，方便 Agent 后续查询' },
        ],
      },
    ],
  },
  files: {
    title: '文件管理',
    description: '快捷访问和编辑本地文件，支持打开文件夹、输入路径、隐藏文件和标记列表。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '可通过选择文件夹或输入路径访问本地目录' },
          { text: '支持以点开头的隐藏文件和配置文件' },
          { text: '可标记常用文件或文件夹，并添加备注' },
          { text: '文本文件可直接编辑保存，适合维护配置文件' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '编辑敏感配置前先备份；Agent 修改文件也受权限中心控制' },
          { text: '常用项目目录建议加入标记列表，减少重复定位' },
        ],
      },
    ],
  },
  prompts: {
    title: 'Skills/MCP',
    description: '统一管理 Prompt、Skills 和 MCP Server，为 Agent 提供可复用能力。',
    sections: [
      {
        title: '三个模块',
        items: [
          { text: 'Prompt：保存可复用提示词卡片，只保留分类，不再使用标签属性' },
          { text: 'Skills：扫描和加载 SKILL.md，作为 Agent 的能力说明和流程规范' },
          { text: 'MCP：管理本地 stdio MCP Server，把外部工具注册给 Agent' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: 'Prompt 适合保存短模板；Skills 适合保存完整工作流和专业规则' },
          { text: 'MCP Server 需要填写名称、分类、command 和 args，添加后可先测试连接' },
          { text: '分类可在各自页签中管理，Agent 是否能使用由权限中心控制' },
        ],
      },
    ],
  },
  markdown: {
    title: 'Markdown 笔记',
    description: '面向长文档的 Markdown 编辑器，支持编辑、预览和本地文件管理。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持编辑、预览、分屏和全屏专注模式' },
          { text: '支持 GFM、代码块、表格、链接和目录导航' },
          { text: '支持自动保存，适合维护学习笔记和技术文档' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '长文档建议用标题层级组织，方便目录跳转' },
          { text: '需要被 RAG 检索的文档可放入统一目录后建立知识库' },
        ],
      },
    ],
  },
  practice: {
    title: '刷题',
    description: '整合题单、做题进度和 Code 模块，用于算法训练和代码练习。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '题单支持分组、题目管理和完成状态追踪' },
          { text: 'Code 支持分类、分类笔记、编码练习和练习文件管理' },
          { text: '数据中心可同步或记录 OJ 做题数据和热力图' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '先按主题建立题单，再维护每道题的状态和备注' },
          { text: '代码练习的三个文件可用于题解、草稿和运行记录' },
        ],
      },
    ],
  },
  leetcode: {
    title: 'Code',
    description: '算法题目管理和刷题追踪系统，配合 Agent 整理题单与练习记录。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '管理题单、分组、题目和完成情况' },
          { text: '记录 OJ 做题数据，配合数据中心展示统计和热力图' },
          { text: '管理编码练习、分类笔记和练习文件' },
        ],
      },
    ],
  },
  spaces: {
    title: '学习空间',
    description: '结构化管理学习方向、课程、章节和资源，适合长期知识体系沉淀。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持方向、课程、模块、章节和条目的多层级管理' },
          { text: '学习内容、学习资源、其他资源可以独立组织' },
          { text: '导入导出应保留每个章节、小节的 id 和顺序' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '课程结构尽量细化到最小可维护单元，方便 Agent 精确修改' },
          { text: '章节内容建议使用 Markdown 文档承载，便于导入导出和 RAG 建库' },
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
          { text: '按方向、课程和章节管理学习内容' },
          { text: '支持资源和其他资料的结构化记录' },
          { text: '可交给 Agent 查询、创建、修改具体章节或条目' },
        ],
      },
    ],
  },
  git: {
    title: 'Git 管理',
    description: '本地仓库管理中心，参考 VS Code 的存储库、更改和图表视图。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '查看仓库、当前分支、远程仓库、ahead/behind 和变更列表' },
          { text: '查看提交图谱、分支标签和合并提交信息' },
          { text: '支持刷新、Fetch、Pull、Push、暂存、提交等常用 Git 操作' },
          { text: '可在仓库目录拉起 Git Bash 或终端，手动执行命令' },
        ],
      },
      {
        title: '安全提示',
        items: [
          { text: '写入类操作会进入确认流程；不要在未确认前执行危险命令' },
          { text: '仓库列表只管理本地已登记路径，远程信息来自 Git 配置' },
        ],
      },
    ],
  },
  'question-bank': {
    title: '题库',
    description: '管理题目、解答、解题方法和题单，支持 Markdown、LaTeX 与图片识别。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '题目由题干、多个解答、备注、概述、难度和多个标签组成' },
          { text: '支持分类管理、连续阅读、单题阅读和编辑预览分栏' },
          { text: '每道题可关联多个解题方法，阅读时可弹窗查看' },
          { text: '题单页面可对题目副本二次编辑，并支持题答合并或题答分离导出' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '新增题目前先选择分类；标签用分号分割' },
          { text: '图片识别只在编辑题目时追加到编辑区，题目和解答图片可分别识别' },
          { text: '解答可以添加备注说明，用于标注方法、来源或易错点' },
        ],
      },
    ],
  },
  'image-hosting': {
    title: '图床管理',
    description: '管理图片分类、上传记录和图片链接，支持供 Agent 读取图片信息。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '按分类管理图片，新增图片需要选择已有分类' },
          { text: '支持图片预览、复制链接、删除记录和上传图片' },
          { text: 'Agent 可查询图片记录，也可通过图片链接访问图片' },
        ],
      },
      {
        title: '配置步骤',
        items: [
          { text: '在图床设置中填写仓库、分支、路径和访问 Token' },
          { text: '上传前确认仓库权限正确，避免生成不可访问链接' },
        ],
      },
    ],
  },
  latex: {
    title: 'LaTeX 编辑器',
    description: '管理 LaTeX 文件和模板库，支持读取模板并基于模板新建文件。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '管理 LaTeX 文件、模板和分类' },
          { text: '支持从模板创建新文件，适合论文、作业和报告' },
          { text: '模板库分类必须显式选择，避免默认分类混乱' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '把常用导言区、版式和宏包整理成模板' },
          { text: 'Agent 操作 LaTeX 文件前需要在权限中心开启对应能力' },
        ],
      },
    ],
  },
  excalidraw: {
    title: '绘图板',
    description: '管理多个画布和画布分类，适合绘制流程图、架构图和草图。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持画布库、分类管理、缩略图和拖拽排序' },
          { text: '新建画布必须选择分类，分类可设置图标和颜色' },
          { text: '支持全屏编辑和导出图片' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '按项目或主题建立分类，画布多时用拖拽调整顺序' },
          { text: '复杂架构图可先让 Agent 生成结构，再手动微调画布' },
        ],
      },
    ],
  },
  datacenter: {
    title: '数据中心',
    description: '聚合账号、资源、API、SSH、OJ、ZenMux、Studio API 和文件配置等数据面板。',
    sections: [
      {
        title: '包含模块',
        items: [
          { text: 'SSH 管理、API 管理、网站管理、资源中心都支持分类或标签管理' },
          { text: 'OJ 热力图展示做题数据，支持手动记录和账号数据同步' },
          { text: 'API Key 面板可查看 Kimi、DeepSeek、Google 等配置或用量入口' },
          { text: 'ZenMux 面板区分 PAYG 和 Plan 数据，避免混合展示' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '新增网站、SSH、API 等记录前先创建对应标签或分类' },
          { text: '敏感字段尽量通过本地表单保存，不要直接发给大模型' },
          { text: 'Agent 访问这些数据前需要在权限中心开启对应模块权限' },
        ],
      },
    ],
  },
  rag: {
    title: 'RAG Lab',
    description: '本地知识库构建与检索实验台，用于把文件夹内容构建成可查询的向量库。',
    sections: [
      {
        title: '核心流程',
        items: [
          { text: '选择文件夹或文件后，系统会读取、分块、生成 embedding 并写入向量库' },
          { text: '构建方案保存索引参数、分块策略、embedding 配置和查询配置' },
          { text: '查询时返回检索片段、来源元信息和可用于 Agent 的结构化结果' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '先用少量高质量文档测试分块和召回，再扩大文件规模' },
          { text: '每个文件会保留是否纳入知识库、纳入时间等元信息，方便后续增量更新' },
          { text: '知识图谱功能已移除，当前聚焦向量检索和可评测配置' },
        ],
      },
    ],
  },
  music: {
    title: 'Music',
    description: '本地音乐播放器，可在切换模块后继续播放，并通过左侧状态区显示进度。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持导入本地音乐、播放列表、播放控制和歌词显示' },
          { text: '播放时可切换到其他模块，音乐状态在最左侧状态栏中展示' },
          { text: '进度水管按当前播放时间和总时长计算，播放结束才到 100%' },
        ],
      },
      {
        title: '使用建议',
        items: [
          { text: '左下角灵动岛按钮用于切换侧边栏状态展示，后续也可承载 Agent 状态' },
          { text: '状态栏空间较窄，歌词会以短句形式逐行展示' },
        ],
      },
    ],
  },
  browser: {
    title: '内置浏览器',
    description: '应用内轻量网页预览工具，适合查看文档、测试本地页面或快速打开链接。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持输入 URL 打开网页或本地服务' },
          { text: '适合配合 Agent 搜索结果进行网页阅读和验证' },
          { text: '可作为开发预览窗口，不影响主应用其他模块' },
        ],
      },
    ],
  },
  terminal: {
    title: '本地终端',
    description: '基于 xterm 的内置终端，用于运行开发命令、Git 命令和本地脚本。',
    sections: [
      {
        title: '使用建议',
        items: [
          { text: '可配合 Git 管理模块在仓库目录打开终端' },
          { text: '长时间任务建议保留终端标签，避免误关进程' },
          { text: '涉及密码和密钥的命令请优先使用本地交互，不要粘贴到 Agent 对话' },
        ],
      },
    ],
  },
  workflow: {
    title: '工作流引擎',
    description: '可视化编排节点任务，用于搭建可重复执行的自动化流程。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持节点、连线、参数和执行历史' },
          { text: '适合把固定流程沉淀成可复用自动化' },
          { text: '后续可与 Agent、插件和事件总线协同' },
        ],
      },
    ],
  },
  'knowledge-base': {
    title: '知识库',
    description: '知识资料管理入口，可与 RAG Lab 配合完成资料整理和检索。',
    sections: [
      {
        title: '使用建议',
        items: [
          { text: '把长期资料按主题整理，再选择合适集合构建 RAG' },
          { text: '需要 Agent 检索知识时，优先使用 RAG Lab 中已构建的知识库' },
        ],
      },
    ],
  },
  chat: {
    title: 'AI Chat',
    description: '普通多轮 AI 对话入口，适合不需要工具调用的问答、写作和代码解释。',
    sections: [
      {
        title: '核心功能',
        items: [
          { text: '支持多模型配置、Markdown 渲染和历史对话' },
          { text: '与 Agent 不同，AI Chat 主要负责自然语言对话，不默认执行本地工具' },
        ],
      },
    ],
  },
  api: {
    title: 'API 管理',
    description: '数据中心中的 API 记录管理，用于保存接口、密钥用途和调用说明。',
    sections: [
      {
        title: '使用建议',
        items: [
          { text: '新增 API 记录必须选择已有分类' },
          { text: 'API Key 等敏感字段应通过本地表单保存，不要直接发送给 Agent' },
          { text: '可使用一键复制功能快速复制 key 或 endpoint' },
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
      className="theme-modal-backdrop fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="theme-modal-shell max-w-lg w-full max-h-[78vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="theme-header-bar flex items-center justify-between px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="theme-logo-mark w-9 h-9 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>{content.title}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--t-text-muted)' }}>使用帮助</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="theme-icon-btn w-8 h-8 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--t-text-secondary)' }}>{content.description}</p>

          {content.sections.map((section, i) => (
            <div key={i}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--t-text-muted)' }}>
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--t-text-secondary)' }}>
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--t-help-dot)' }} />
                    <span className="leading-relaxed">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0" style={{ background: 'var(--t-bg-secondary)', borderTop: '1px solid var(--t-border-light)' }}>
          <button
            onClick={onClose}
            className="theme-primary-btn w-full py-2 text-sm font-medium"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
