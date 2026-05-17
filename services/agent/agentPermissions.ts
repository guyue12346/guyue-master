import { getAgentModules } from './agentModules';

export interface PermissionLevel {
  read: boolean;
  write: boolean;
}

export interface DataPermissions {
  todos: PermissionLevel;
  ojStats: PermissionLevel;
  resources: PermissionLevel;
  leetcodeLists: PermissionLevel;
  learningCourses: PermissionLevel;
}

export type AgentCrudAction = 'read' | 'create' | 'update' | 'delete';

export interface AgentModulePermission {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export type AgentToolPermissions = Record<string, AgentModulePermission>;
export type AgentFullAccessPermissions = AgentToolPermissions;

export const AGENT_CRUD_ACTIONS: { key: AgentCrudAction; label: string; tone: string }[] = [
  { key: 'read', label: '查', tone: 'blue' },
  { key: 'create', label: '建', tone: 'emerald' },
  { key: 'update', label: '改', tone: 'amber' },
  { key: 'delete', label: '删', tone: 'rose' },
];

export type AgentPermissionSourceGroup = 'core' | 'plugin' | 'skill' | 'mcp';

export interface AgentPermissionModuleMeta {
  key: string;
  label: string;
  desc: string;
  sourceGroup: AgentPermissionSourceGroup;
}

export const AGENT_PERMISSION_MODULES: AgentPermissionModuleMeta[] = [
  { key: 'system', label: '系统功能', desc: '读取当前电脑时间等本机只读系统信息', sourceGroup: 'core' },
  { key: 'todo', label: '待办', desc: '待办、子任务、重复事件和待办分类', sourceGroup: 'core' },
  { key: 'notes', label: '便签', desc: '便签查询、创建、修改、删除', sourceGroup: 'core' },
  { key: 'prompts', label: '技能卡', desc: '技能卡和提示词分类', sourceGroup: 'core' },
  { key: 'skills', label: 'Skills', desc: 'Agent 可加载的 SKILL.md 能力包和内置 Skill', sourceGroup: 'skill' },
  { key: 'mcp', label: 'MCP', desc: 'MCP Server 工具、资源读取和外部工具调用', sourceGroup: 'mcp' },
  { key: 'markdown', label: 'Markdown', desc: 'Markdown 笔记和分类', sourceGroup: 'core' },
  { key: 'dc-oj', label: 'OJ记录', desc: 'OJ 做题统计和做题记录', sourceGroup: 'core' },
  { key: 'dc-resources', label: '资源中心', desc: '资源中心记录和分类', sourceGroup: 'core' },
  { key: 'dc-ssh', label: 'SSH管理', desc: 'SSH 连接记录', sourceGroup: 'core' },
  { key: 'dc-api', label: 'API记录', desc: 'API 接口记录，查询时默认隐藏密钥', sourceGroup: 'core' },
  { key: 'dc-website', label: '网站管理', desc: '网站账号、密码、标签和备注记录', sourceGroup: 'core' },
  { key: 'learning', label: '学习课程', desc: '学习课程和分类', sourceGroup: 'core' },
  { key: 'leetcode', label: '题单', desc: 'LeetCode 题单、分组、题目和完成进度', sourceGroup: 'core' },
  { key: 'code', label: 'Code', desc: '编码练习分类、分类笔记、练习和练习文件', sourceGroup: 'core' },
  { key: 'question-bank', label: '题库', desc: '题库分类、题目、题单和解题方法', sourceGroup: 'core' },
  { key: 'canvas', label: '画布', desc: '画布库、画布分类和绘图元数据', sourceGroup: 'core' },
  { key: 'music', label: '音乐', desc: 'Music 音乐库、播放列表和歌曲元信息', sourceGroup: 'core' },
  { key: 'git', label: 'Git管理', desc: '本地 Git 仓库状态、提交、暂存、拉取和推送', sourceGroup: 'core' },
  { key: 'files', label: '文件', desc: '已授权文件分类内的查询和读取', sourceGroup: 'core' },
  { key: 'knowledge', label: '知识库', desc: '本地知识库索引构建和语义检索', sourceGroup: 'core' },
  { key: 'web', label: '联网搜索', desc: '网页搜索、GitHub/npm/StackOverflow/arXiv 专用搜索', sourceGroup: 'core' },
  { key: 'image', label: '图床', desc: '图片查询和上传', sourceGroup: 'core' },
  { key: 'latex', label: 'LaTeX', desc: 'LaTeX 文件、模板和分类', sourceGroup: 'core' },
  { key: 'email', label: '邮件', desc: '通讯录查询和邮件发送', sourceGroup: 'core' },
];

export const DEFAULT_DATA_PERMISSIONS: DataPermissions = {
  todos: { read: false, write: false },
  ojStats: { read: false, write: false },
  resources: { read: false, write: false },
  leetcodeLists: { read: false, write: false },
  learningCourses: { read: false, write: false },
};

export const createModulePermission = (value = false): AgentModulePermission => ({
  read: value,
  create: value,
  update: value,
  delete: value,
});

export const DEFAULT_AGENT_TOOL_PERMISSIONS: AgentToolPermissions = (() => {
  const permissions = AGENT_PERMISSION_MODULES.reduce((acc, module) => {
    acc[module.key] = createModulePermission(false);
    return acc;
  }, {} as AgentToolPermissions);
  permissions.system = { ...createModulePermission(false), read: true };
  return permissions;
})();

export const DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS: AgentFullAccessPermissions =
  AGENT_PERMISSION_MODULES.reduce((acc, module) => {
    acc[module.key] = createModulePermission(false);
    return acc;
  }, {} as AgentFullAccessPermissions);

export const getAgentPermissionModules = () => {
  const builtInKeys = new Set(AGENT_PERMISSION_MODULES.map(module => module.key));
  const pluginModules = getAgentModules()
    .filter(module => module.kind === 'plugin' && !builtInKeys.has(module.id))
    .map(module => ({
      key: module.id,
      label: module.name,
      desc: module.description || '插件提供的 Agent 工具',
      sourceGroup: 'plugin' as const,
    }));
  return [...AGENT_PERMISSION_MODULES, ...pluginModules];
};

export const createAgentToolPermissions = (value = false): AgentToolPermissions =>
  getAgentPermissionModules().reduce((acc, module) => {
    acc[module.key] = createModulePermission(value);
    return acc;
  }, {} as AgentToolPermissions);

export const deriveDataPermissionsFromToolPermissions = (
  permissions: AgentToolPermissions,
): DataPermissions => {
  const writable = (key: string) => Boolean(
    permissions[key]?.create ||
    permissions[key]?.update ||
    permissions[key]?.delete,
  );
  const legacyTodoRead = Boolean(
    permissions.todo?.read ||
    permissions.notes?.read ||
    permissions.prompts?.read ||
    permissions.markdown?.read,
  );
  const legacyTodoWrite = Boolean(
    writable('todo') ||
    writable('notes') ||
    writable('prompts') ||
    writable('markdown'),
  );

  return {
    todos: {
      read: legacyTodoRead,
      write: legacyTodoWrite,
    },
    ojStats: {
      read: Boolean(permissions['dc-oj']?.read || permissions.datacenter?.read),
      write: writable('dc-oj') || writable('datacenter'),
    },
    resources: {
      read: Boolean(permissions['dc-resources']?.read || permissions.datacenter?.read),
      write: writable('dc-resources') || writable('datacenter'),
    },
    leetcodeLists: {
      read: Boolean(permissions.leetcode?.read),
      write: writable('leetcode'),
    },
    learningCourses: {
      read: Boolean(permissions.learning?.read),
      write: writable('learning'),
    },
  };
};

export const PERMISSION_LABELS: { key: keyof DataPermissions; label: string; desc: string }[] = [
  { key: 'todos',           label: '待办事项', desc: '查询和修改待办内容' },
  { key: 'ojStats',         label: '刷题统计', desc: '查询和修改做题记录' },
  { key: 'resources',       label: '资源中心', desc: '查询和修改资源列表' },
  { key: 'leetcodeLists',   label: '题单',     desc: '查询和修改 LeetCode 题单' },
  { key: 'learningCourses', label: '学习课程', desc: '查询和修改学习课程' },
];
