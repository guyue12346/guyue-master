import type { ChatConfig } from '../chatService';
import { getEnabledAgentModules, getModuleById } from './agentModules';

const VIRTUAL_AGENT_SCOPE_LABELS: Record<string, string> = {
  web: '联网搜索',
};

export const normalizeModuleScope = (moduleIds?: Array<string | null | undefined>): string[] => {
  const enabledIds = new Set(getEnabledAgentModules().map(module => module.id));
  const normalized: string[] = [];
  (moduleIds || []).forEach(moduleId => {
    if (!moduleId || (!enabledIds.has(moduleId) && !VIRTUAL_AGENT_SCOPE_LABELS[moduleId]) || normalized.includes(moduleId)) return;
    normalized.push(moduleId);
  });
  return normalized;
};

export const getModuleDisplayName = (moduleId: string): string =>
  getModuleById(moduleId)?.name || VIRTUAL_AGENT_SCOPE_LABELS[moduleId] || moduleId;

export const getModuleScopeLabel = (moduleIds: string[]): string =>
  moduleIds
    .map(getModuleDisplayName)
    .join('、');

export const getRouterSignature = (routingConfig: ChatConfig) => [
  routingConfig.provider,
  routingConfig.model,
  routingConfig.baseUrl || '',
  getEnabledAgentModules().map(module => module.id).join(','),
].join('|');

export const detectModuleScopeLocally = (input: string): string[] => {
  const text = input.toLowerCase();
  const modules: string[] = [];
  const add = (moduleId: string) => {
    if (!modules.includes(moduleId)) modules.push(moduleId);
  };

  if (/当前时间|现在几点|今天|明天|昨天|后天|前天|本周|下周|日期|时间|几点|几号|timezone|time zone/.test(text)) add('system');
  if (/待办|任务|事项|日程|提醒|子任务|循环|重复/.test(text)) add('todo');
  if (/oj|洛谷|acwing|leetcode|刷题记录|做题记录|提交记录/.test(text)) add('dc-oj');
  if (/资源|订阅|云盘|服务器|域名|到期|续费|容量/.test(text)) add('dc-resources');
  if (/ssh|终端|主机|连接|端口|服务器登录/.test(text)) add('dc-ssh');
  if (/api key|apikey|api记录|接口记录|密钥|余额|deepseek|kimi|moonshot|gemini|zenmux|openai|anthropic/.test(text)) add('dc-api');
  if (/网站管理|网站账号|密码|账号密码|登录信息|网址账号|password|credential/.test(text)) add('dc-website');
  if (/课程|学习|讲义|练习|知识点|学习中心/.test(text)) add('learning');
  if (/题单|leetcode|算法题|刷题计划/.test(text)) add('leetcode');
  if (/题库|题目|解题方法|解答|难度系数|组题|试卷|数学题|物理题|化学题/.test(text)) add('question-bank');
  if (/画布|绘图|白板|excalidraw|流程图|mermaid/.test(text)) add('canvas');
  if (/git|github|仓库|分支|提交|commit|push|pull|fetch|diff|暂存|远程仓库/.test(text)) add('git');
  if (/文件|目录|路径|读取|打开|配置文件|\.env|\.json|\.md|\.tex|\.ya?ml/.test(text)) add('files');
  if (/知识库|语义检索|rag|向量索引|检索文件|基于文件回答/.test(text)) add('knowledge');
  if (/prompt|提示词|skill|技能卡|模板/.test(text)) add('prompts');
  if (/便签|备忘|随手记/.test(text)) add('notes');
  if (/图床|图片链接|上传图片|markdown链接/.test(text)) add('image');
  if (/markdown|md笔记|长文|日记|文章/.test(text)) add('markdown');
  if (/latex|tex|模板|论文|公式/.test(text)) add('latex');
  if (/邮件|邮箱|发信|联系人|通讯录/.test(text)) add('email');

  return normalizeModuleScope(modules);
};
