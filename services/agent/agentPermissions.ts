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

export const AGENT_PERMISSION_MODULES: { key: string; label: string; desc: string }[] = [
  { key: 'todo', label: '待办', desc: '待办、子任务、重复事件和待办分类' },
  { key: 'notes', label: '便签', desc: '便签查询、创建、修改、删除' },
  { key: 'prompts', label: '技能卡', desc: '技能卡和提示词分类' },
  { key: 'markdown', label: 'Markdown', desc: 'Markdown 笔记和分类' },
  { key: 'dc-oj', label: 'OJ记录', desc: 'OJ 做题统计和做题记录' },
  { key: 'dc-resources', label: '资源中心', desc: '资源中心记录和分类' },
  { key: 'dc-ssh', label: 'SSH管理', desc: 'SSH 连接记录' },
  { key: 'dc-api', label: 'API记录', desc: 'API 接口记录，查询时默认隐藏密钥' },
  { key: 'learning', label: '学习课程', desc: '学习课程和分类' },
  { key: 'leetcode', label: '题单', desc: 'LeetCode 题单数据' },
  { key: 'files', label: '文件', desc: '已授权文件分类内的查询和读取' },
  { key: 'knowledge', label: '知识库', desc: '本地知识库索引构建和语义检索' },
  { key: 'image', label: '图床', desc: '图片查询和上传' },
  { key: 'latex', label: 'LaTeX', desc: 'LaTeX 文件、模板和分类' },
  { key: 'email', label: '邮件', desc: '通讯录查询和邮件发送' },
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

export const DEFAULT_AGENT_TOOL_PERMISSIONS: AgentToolPermissions =
  AGENT_PERMISSION_MODULES.reduce((acc, module) => {
    acc[module.key] = createModulePermission(false);
    return acc;
  }, {} as AgentToolPermissions);

export const DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS: AgentFullAccessPermissions =
  AGENT_PERMISSION_MODULES.reduce((acc, module) => {
    acc[module.key] = createModulePermission(false);
    return acc;
  }, {} as AgentFullAccessPermissions);

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
