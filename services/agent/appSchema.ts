import type { ChatTool } from '../chatService';

export interface AgentAppSchemaCategory {
  id?: string;
  name: string;
}

export interface AgentAppSchemaContextInput {
  tools: ChatTool[];
  scopeLabel: string;
  categories: {
    todo?: string[];
    recurring?: AgentAppSchemaCategory[];
    website?: string[];
    ssh?: string[];
    api?: string[];
    prompts?: string[];
    markdown?: string[];
    files?: string[];
  };
}

const RESERVED_CATEGORY_NAMES = new Set(['全部', '默认', '未分类', '__all__']);

const availableNames = (names: string[] = []) =>
  names
    .map(name => name.trim())
    .filter(name => name && !RESERVED_CATEGORY_NAMES.has(name));

const list = (items: string[] = [], empty = '暂无') => {
  const values = availableNames(items);
  return values.length > 0 ? values.join('、') : empty;
};

const listCategories = (items: AgentAppSchemaCategory[] = [], empty = '暂无') => {
  const values = items
    .filter(item => item.name && !RESERVED_CATEGORY_NAMES.has(item.name))
    .map(item => item.id ? `${item.name}(${item.id})` : item.name);
  return values.length > 0 ? values.join('、') : empty;
};

export const buildAgentAppSchemaContext = ({
  tools,
  scopeLabel,
  categories,
}: AgentAppSchemaContextInput) => {
  const toolNames = new Set(tools.map(tool => tool.name));
  const hasToolLine = (name: string) => toolNames.has(name) ? '可用' : '不可用';

  return [
    '## Guyue Master 应用结构与硬性规则',
    `当前作用域：${scopeLabel}`,
    '',
    '### 全局规则',
    '- 这是本地 App，不是普通聊天机器人；能通过查询工具获得的结构信息，应先查询，不要凭空假设。',
    '- 所有带分类/标签的模块都不允许使用“默认/未分类/全部”。新建内容必须放入已有分类/标签；若没有合适分类，先创建分类或询问用户。',
    '- 创建/修改前必须满足模块必填字段；缺少定位对象、分类、优先级、时间等关键字段时先澄清。',
    '- 删除、修改等高风险操作需要确认；缺少定位对象时必须先查询。',
    '- 密码、API Key、token 等私密字段不要要求用户直接发给大模型；应让工具创建本地占位/补充卡片，由用户在本地填写。',
    '',
    '### 待办事项',
    `- create_todo: ${hasToolLine('create_todo')}；必须有 content、已有 category、priority。`,
    `- query_todos: ${hasToolLine('query_todos')}；创建前优先调用它获取 availableCategories。`,
    `- 当前待办分类：${list(categories.todo)}。`,
    '- 待办 priority 是创建前需要确认的字段，取值 high / medium / low。用户未说明紧急程度或优先级时，应询问“高/中/低，是否紧急？”。',
    '- 如果用户只说“明天早上/下午/晚上”但没有具体时间，应澄清具体几点几分，或确认是否全天事项。',
    '- 如果用户没有给分类，但现有分类和事项语义明显匹配，可以继续计划先 query_todos 再创建；如果无法判断，应先问用户。',
    '',
    '### 重复事件/日程',
    `- create_recurring_event: ${hasToolLine('create_recurring_event')}；必须先 query_recurring_events 获取 categoryId。`,
    `- 当前重复事件分类：${listCategories(categories.recurring)}。`,
    '',
    '### 网站 / SSH / API 管理',
    `- 网站记录：create_website_record ${hasToolLine('create_website_record')}；必须有 URL 和已有网站标签。当前网站标签：${list(categories.website)}。`,
    `- SSH 记录：create_ssh_record ${hasToolLine('create_ssh_record')}；必须有主机地址和已有 SSH 分类。当前 SSH 分类：${list(categories.ssh)}。`,
    `- API 记录：create_api_record ${hasToolLine('create_api_record')}；必须有 endpoint/base URL 和已有 API 分类。当前 API 分类：${list(categories.api)}。`,
    '',
    '### 笔记 / 技能 / 文件',
    `- Prompt 技能卡分类：${list(categories.prompts)}。`,
    `- Markdown 笔记分类：${list(categories.markdown)}。`,
    `- 文件管理分类：${list(categories.files)}。`,
    '- 用户询问 Guyue Master、本 App 或某个模块怎么用、使用指南、功能说明、配置方法时，应使用 query_app_usage_guide 查询内置文档。',
    '- 用户询问当前 App 里具体有哪些 Skills、MCP、工具、能力、插件或 Server 时，这是本地能力查询；应使用 query_agent_skills、query_mcp_servers、search_agent_capabilities，不要使用 web_search。',
    '- 这类问题必须返回查询工具得到的实际列表，不要只解释有哪些查询接口。',
    '',
    '### 联网与时间',
    `- get_current_time: ${hasToolLine('get_current_time')}；涉及今天/明天/昨天/最新/天气/日程时应优先使用。`,
    `- web_search: ${hasToolLine('web_search')}；web_open: ${hasToolLine('web_open')}。搜索后通常需要打开最相关来源再总结。`,
    '- 联网答案必须基于搜索或打开网页结果，不要只复述搜索摘要；需要具体事实时应打开来源页抽取正文。',
  ].join('\n');
};
