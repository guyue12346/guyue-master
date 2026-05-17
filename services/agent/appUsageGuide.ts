export interface AppUsageGuideQuery {
  query?: string;
  section?: string;
  limit?: number;
  includeFullGuide?: boolean;
}

export interface AppUsageGuideSection {
  id: string;
  title: string;
  aliases: string[];
  content: string;
}

const GUIDE_SECTIONS: AppUsageGuideSection[] = [
  {
    id: 'overview',
    title: '总体工作台',
    aliases: ['app', '应用', '工作台', '总览', '使用方法', '帮助', '指南', '功能'],
    content: [
      'Guyue Master 是一个本地优先的个人智能工作台，核心模块包括 Agent、Skills/MCP/Prompt、待办与日程、便签、Markdown、学习空间、题库、Code、Git、数据中心、文件管理、RAG、图床、LaTeX、画布和音乐。',
      '左侧主侧边栏用于切换模块；部分模块还有二级分类栏。带分类的数据通常必须先选择已有分类，不再允许“默认/未分类/全部”作为真实分类。',
      '总设置负责主题、模块排序、模型/API、Agent 权限、数据备份导出等全局配置。更新或迁移前应优先使用数据备份。',
      'Agent 可以通过权限中心调用本地功能函数；查询类工具通常直接执行，创建/修改/删除类工具会按权限和安全策略确认。',
    ].join('\n'),
  },
  {
    id: 'agent',
    title: 'Agent',
    aliases: ['agent', '智能体', '助手', 'function calling', '函数调用', '权限', '调试', 'console'],
    content: [
      'Agent 使用节点式 Runtime：澄清需求、规划步骤、工具决策、工具执行、结果检查、最终汇报。复杂任务会先形成计划，再按步骤连续调用工具。',
      'Agent 右侧面板可查看执行过程、工具调用、计划状态和调试信息；调试轮次支持导出，便于排查模型决策和工具结果。',
      '权限中心按能力来源管理核心模块、插件、Skills、MCP。读、建、改、删按模块独立授权；敏感写入和删除会触发确认或快照机制。',
      '双击 Command 可唤起 Agent 小窗；点击左侧 Agent 模块则进入完整页面。Agent 任务可在后台继续运行。',
      '联网任务通常先搜索，再打开最相关来源读取正文；涉及今天、明天、天气、新闻等实时问题，应先获取当前电脑时间。',
    ].join('\n'),
  },
  {
    id: 'skills-mcp-prompts',
    title: 'Skills / MCP / Prompt',
    aliases: ['skills', 'skill', 'mcp', 'prompt', '提示词', '能力中心', '插件能力'],
    content: [
      'Prompt 用于保存可复用提示词卡片，是用户的提示词模板库。',
      'Skills 用于管理可被 Agent 加载的 SKILL.md 能力包，适合保存完整工作流、专业规则和领域方法。',
      'MCP 用于管理本地 stdio MCP Server，把外部工具、资源和上下文接入 Agent。MCP Server 需要配置名称、分类、command、args，并建议先测试连接。',
      '三者是不同来源：问“当前有哪些 Skills”时只查询 Skills；问 Prompt 时查询提示词卡片；问 MCP 时查询 MCP Server。',
      '分类在各自页签中维护；新增内容应选择已有分类，必要时先创建分类。',
    ].join('\n'),
  },
  {
    id: 'todo-calendar',
    title: '待办与日程',
    aliases: ['todo', '待办', '任务', '日程', '提醒', '优先级', '归档', '完成'],
    content: [
      '待办支持分类、标题/内容、描述、优先级、截止时间、提醒时间、子任务、完成状态和归档状态。',
      '已完成表示任务已经做完；已归档表示从当前工作视图收起到历史区，归档不等于完成。',
      '创建待办时必须选择已有分类，并明确优先级。时间相关任务应确认日期、时间和是否需要提醒。',
      '重复事件/日程使用独立分类和时间字段，适合周期性安排或较正式的日程记录。',
    ].join('\n'),
  },
  {
    id: 'notes-markdown',
    title: '便签与 Markdown',
    aliases: ['便签', 'notes', 'note', 'markdown', 'md', '笔记', '文档'],
    content: [
      '便签适合保存短信息、临时想法、片段链接和快速备忘，支持颜色和搜索。',
      'Markdown 模块适合长文档、学习笔记、会议记录和技术文章，支持编辑、预览、分屏、全屏和自动保存。',
      '长内容建议放入 Markdown；需要进入知识库检索的资料建议按目录组织后再构建 RAG。',
    ].join('\n'),
  },
  {
    id: 'learning-space',
    title: '学习空间',
    aliases: ['学习空间', '学习', '课程', '方向', '章节', '资源', '导入', '导出'],
    content: [
      '学习空间按方向、课程、顶层分区、章节和条目组织。课程内部可包含学习内容、学习资源、其他资源和自定义同层模块。',
      '导入导出应保留方向、课程、章节、小节、条目的 id 和顺序，便于精确迁移和 Agent 修改。',
      '内容建议细化到最小可维护单元，例如修改某一小节标题、新增某个章节、替换某条资源链接。',
    ].join('\n'),
  },
  {
    id: 'question-bank-code',
    title: '题库 / 题单 / Code',
    aliases: ['题库', '题单', '解题方法', '题目', '答案', 'code', '编码练习', '刷题', 'leetcode'],
    content: [
      '题库支持多级分类、题目、多个解答、备注、概述、难度系数、多个标签和关联解题方法。',
      '题目支持阅读和编辑视图，编辑时可分区预览题目与答案；解答可展开/隐藏。',
      '题单是独立页面，可选择题目组成试卷式列表，支持二次编辑且不影响原题库，并可按题目答案紧跟或题答分离布局导出。',
      '解题方法是独立 Markdown 内容，可被多个题目关联，阅读时以弹出页面查看。',
      'Code 模块管理分类、分类笔记、编码练习和练习文件，适合算法练习和代码草稿维护。',
    ].join('\n'),
  },
  {
    id: 'data-center',
    title: '数据中心',
    aliases: ['数据中心', '网站', '密码', 'ssh', 'api', 'oj', '热力图', '资源', 'zenmux', 'kimi', 'deepseek', 'google'],
    content: [
      '数据中心管理网站账号、SSH、API Key、资源、OJ 热力图、ZenMux/API 统计、图床和文件等数据。',
      '网站、SSH、API 等带标签/分类的数据新增时必须选择已有标签或分类。密码和 API Key 等私密字段应在本地补充卡片中填写，不应直接发给模型。',
      'API 管理可记录 Kimi、DeepSeek、Google 等平台信息；余额或使用量以对应平台接口能力为准，不能获取的数据不应伪造展示。',
      'OJ 热力图用于查看做题活跃度和记录；资源中心用于管理订阅、云资源、链接和账号类资源。',
    ].join('\n'),
  },
  {
    id: 'files-rag',
    title: '文件管理与 RAG',
    aliases: ['文件', '文件管理', '隐藏文件', '配置文件', 'rag', '知识库', '向量库', '检索'],
    content: [
      '文件管理支持打开文件夹、输入路径、查看点号开头的隐藏文件、编辑文本文件、标记常用文件/文件夹并添加备注。',
      'RAG 知识库用于选择文件或文件夹构建可检索索引。文件元信息应记录是否纳入知识库、纳入时间和所属库，方便后续增量更新。',
      '查询知识库时通常返回相关片段、来源文件和元信息，再由 Agent 结合问题生成回答。',
      '配置文件、密钥文件等敏感内容读取和修改应通过权限中心和本地确认控制。',
    ].join('\n'),
  },
  {
    id: 'git-latex-image-canvas',
    title: 'Git / LaTeX / 图床 / 画布',
    aliases: ['git', '存储库', 'latex', '图床', '图片', '画布', 'canvas', 'excalidraw'],
    content: [
      'Git 管理中心参考 VS Code 的存储库、更改和图表视图，支持查看仓库、分支、远程、ahead/behind、变更、提交图谱，以及 Fetch/Pull/Push/Commit 等操作。写入类 Git 操作需要确认。',
      'LaTeX 模块管理模板和文件，可读取模板并用模板新建文件，适合论文、报告和排版任务。',
      '图床管理支持分类、图片列表、图片链接和 Markdown 链接，Agent 可读取图片链接信息。',
      '画布模块支持分类管理、缩略图、拖拽排序、全屏和分类编辑，适合整理 Excalidraw/绘图内容。',
    ].join('\n'),
  },
  {
    id: 'music-dynamic-island',
    title: '音乐与灵动岛',
    aliases: ['音乐', '播放', '歌词', '灵动岛', '侧边栏', '进度'],
    content: [
      '音乐模块可在播放时切换到其它模块，播放状态可通过最左侧主侧边栏的动态状态区域展示。',
      '动态状态区域不是音乐专属，后续也可用于 Agent 状态等后台任务展示。',
      '音乐状态 UI 可显示进度、歌词片段和控制按钮；进度应按当前播放时间与总时长计算。',
    ].join('\n'),
  },
  {
    id: 'settings-backup-plugins',
    title: '设置、备份与扩展',
    aliases: ['设置', '备份', '导出', '迁移', '插件', '扩展', 'ModuleManifest', '权限中心'],
    content: [
      '总设置用于管理主题、模块排序、模型 API、复杂需求处理模型、搜索引擎、Agent 权限、数据备份和导出。',
      '数据迁移应使用结构化备份，覆盖本地存储、文件索引、分类、模块配置、Agent 权限和插件配置，避免更新时丢失分类。',
      '扩展体系以 ModuleManifest、CapabilityRegistry、插件 API、事件总线和 Agent 工具注册为基础。插件可以注册 UI、commands、events、agent tools，也可以声明 MCP/Skill 依赖。',
      '插件应通过安全的 window.guyue API 与宿主交互，不应直接依赖 renderer 的 Node 权限。',
    ].join('\n'),
  },
];

const normalize = (value: string) => value.toLowerCase().trim();

const tokenize = (value: string) =>
  normalize(value)
    .split(/[\s,，;；/\\|。！？?：:、（）()【】[\]"'`]+/)
    .map(token => token.trim())
    .filter(Boolean);

const scoreSection = (section: AppUsageGuideSection, query: string) => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1;
  const haystack = normalize([
    section.id,
    section.title,
    ...section.aliases,
    section.content,
  ].join(' '));
  return tokens.reduce((score, token) => {
    if (!token) return score;
    if (section.id.toLowerCase() === token) return score + 8;
    if (normalize(section.title).includes(token)) return score + 5;
    if (section.aliases.some(alias => normalize(alias).includes(token))) return score + 4;
    return score + (haystack.includes(token) ? 1 : 0);
  }, 0);
};

const clampLimit = (value: unknown, fallback = 5) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(n)));
};

export const getAppUsageGuideSections = () => GUIDE_SECTIONS.map(section => ({ ...section }));

export const queryAppUsageGuide = ({
  query = '',
  section = '',
  limit,
  includeFullGuide = false,
}: AppUsageGuideQuery) => {
  const normalizedSection = normalize(section);
  const maxItems = includeFullGuide ? GUIDE_SECTIONS.length : clampLimit(limit, 5);
  const bySection = normalizedSection
    ? GUIDE_SECTIONS.filter(item =>
        normalize(item.id) === normalizedSection ||
        normalize(item.title).includes(normalizedSection) ||
        item.aliases.some(alias => normalize(alias).includes(normalizedSection)),
      )
    : [];

  const matched = includeFullGuide
    ? GUIDE_SECTIONS
    : bySection.length > 0
      ? bySection
      : GUIDE_SECTIONS
          .map(item => ({ item, score: scoreSection(item, query) }))
          .filter(entry => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxItems)
          .map(entry => entry.item);

  const sections = matched.length > 0 ? matched : GUIDE_SECTIONS.slice(0, maxItems);
  const markdown = sections
    .map(item => `## ${item.title}\n${item.content}`)
    .join('\n\n');

  return {
    success: true,
    query,
    section,
    totalSections: GUIDE_SECTIONS.length,
    sections: sections.map(item => ({
      id: item.id,
      title: item.title,
      aliases: item.aliases,
      content: item.content,
    })),
    markdown,
    message: sections.length
      ? `已找到 ${sections.length} 个 App 使用指南章节。`
      : '没有找到匹配的 App 使用指南章节。',
  };
};
