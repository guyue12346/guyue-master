import type { GuyueModuleManifest } from './manifest';
import { moduleManifestToModuleConfig } from './manifest';

export const BUILTIN_MODULE_MANIFESTS: GuyueModuleManifest[] = [
  {
    id: 'agent',
    name: 'AI助手',
    version: '1.0.0',
    kind: 'core',
    icon: 'Bot',
    priority: 0,
    ui: { type: 'native', appMode: 'agent' },
    agent: {
      scopes: [
        { id: 'system', name: '系统功能', icon: 'Clock3', description: '读取当前电脑时间等本机只读系统信息' },
      ],
    },
  },
  {
    id: 'todo',
    name: '任务与日程',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'ListTodo',
    priority: 1,
    shortcut: 'Tab+1',
    ui: { type: 'native', appMode: 'todo' },
    agent: {
      scopes: [
        { id: 'todo', name: '待办事项', icon: 'ListTodo', description: '创建、查询待办事项' },
      ],
    },
    storage: { namespace: 'linkmaster_todos_v1', schemaVersion: 1 },
    events: { publishes: ['todo.created', 'todo.updated', 'todo.deleted'] },
  },
  {
    id: 'datacenter',
    name: '数据中心',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'BarChart3',
    priority: 2,
    shortcut: 'Tab+D',
    ui: { type: 'native', appMode: 'datacenter' },
    agent: {
      scopes: [
        { id: 'dc-oj', name: 'OJ记录', icon: 'Flame', description: '查询 OJ 统计、创建做题记录' },
        { id: 'dc-resources', name: '资源中心', icon: 'Package', description: '查询、创建、修改、删除资源记录' },
        { id: 'dc-ssh', name: 'SSH管理', icon: 'Server', description: '查询、创建、修改、删除 SSH 连接记录' },
        { id: 'dc-api', name: 'API记录', icon: 'Webhook', description: '查询、创建、修改、删除 API 接口记录' },
        { id: 'dc-website', name: '网站管理', icon: 'Shield', description: '查询、创建、修改、删除网站账号记录和标签' },
      ],
    },
    storage: { namespace: 'datacenter', schemaVersion: 1 },
  },
  {
    id: 'spaces',
    name: '空间',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'PanelsTopLeft',
    priority: 3,
    shortcut: 'Tab+K',
    ui: { type: 'native', appMode: 'spaces' },
    agent: {
      scopes: [
        { id: 'learning', name: '学习', icon: 'GraduationCap', description: '管理学习方向、课程、章节和课程资源条目' },
      ],
    },
  },
  {
    id: 'practice',
    name: '刷题',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Code2',
    priority: 4,
    shortcut: 'Tab+L',
    ui: { type: 'native', appMode: 'practice' },
    agent: {
      scopes: [
        { id: 'leetcode', name: '刷题', icon: 'Code2', description: '管理题单、分组、题目和完成进度' },
        { id: 'code', name: 'Code', icon: 'TerminalSquare', description: '管理编码练习分类、分类笔记、练习和练习文件' },
      ],
    },
  },
  {
    id: 'git',
    name: 'Git管理',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'GitBranch',
    priority: 5,
    shortcut: 'Tab+G',
    ui: { type: 'native', appMode: 'git' },
    agent: {
      scopes: [
        { id: 'git', name: 'Git管理', icon: 'GitBranch', description: '查询仓库状态、提交记录，执行暂存、提交、拉取和推送' },
      ],
    },
  },
  {
    id: 'question-bank',
    name: '题库',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'BookOpenCheck',
    priority: 6,
    shortcut: 'Tab+Q',
    ui: { type: 'native', appMode: 'question-bank' },
    agent: {
      scopes: [
        { id: 'question-bank', name: '题库', icon: 'BookOpenCheck', description: '查询、创建、修改题目、题库分类和解题方法' },
      ],
    },
  },
  {
    id: 'files',
    name: '文件管理',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'FolderOpen',
    priority: 7,
    shortcut: 'Tab+4',
    ui: { type: 'native', appMode: 'files' },
    agent: {
      scopes: [
        { id: 'files', name: '文件管理', icon: 'FolderOpen', description: '查询、读取文件管理中的文件（需授权分类）' },
      ],
    },
  },
  {
    id: 'terminal',
    name: '本地终端',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Command',
    priority: 8,
    shortcut: 'Tab+0',
    ui: { type: 'native', appMode: 'terminal' },
  },
  {
    id: 'excalidraw',
    name: '绘图板',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Pencil',
    priority: 9,
    shortcut: 'Tab+E',
    ui: { type: 'native', appMode: 'excalidraw' },
    agent: {
      scopes: [
        { id: 'canvas', name: '画布', icon: 'PencilRuler', description: '查询、创建、修改画布和画布分类' },
      ],
    },
  },
  {
    id: 'prompts',
    name: 'Skills/MCP',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Sparkles',
    priority: 10,
    shortcut: 'Tab+5',
    ui: { type: 'native', appMode: 'prompts' },
    agent: {
      scopes: [
        { id: 'prompts', name: '技能卡', icon: 'Sparkles', description: '创建 Prompt 技能卡' },
        { id: 'skills', name: 'Agent Skills', icon: 'Sparkles', description: '查询并加载可供 Agent 使用的 Skill 能力包' },
        { id: 'mcp', name: 'MCP', icon: 'Cable', description: '查询和调用 MCP Server 的 tools 与 resources' },
      ],
    },
  },
  {
    id: 'notes',
    name: '便签',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'StickyNote',
    priority: 11,
    shortcut: 'Tab+2',
    ui: { type: 'native', appMode: 'notes' },
    agent: {
      scopes: [
        { id: 'notes', name: '笔记备忘', icon: 'StickyNote', description: '创建便签笔记' },
      ],
    },
  },
  {
    id: 'browser',
    name: '内置浏览器',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Globe',
    priority: 13,
    shortcut: 'Tab+B',
    ui: { type: 'native', appMode: 'browser' },
  },
  {
    id: 'image-hosting',
    name: '图床管理',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Image',
    priority: 14,
    shortcut: 'Tab+I',
    ui: { type: 'native', appMode: 'image-hosting' },
    agent: {
      scopes: [
        { id: 'image', name: '图床', icon: 'Image', description: '管理图床分类、图片记录、图片链接读取和上传' },
      ],
    },
  },
  {
    id: 'latex',
    name: 'LaTeX编辑器',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'FileType2',
    priority: 15,
    shortcut: 'Tab+X',
    ui: { type: 'native', appMode: 'latex' },
    agent: {
      scopes: [
        { id: 'latex', name: 'LaTeX', icon: 'FileType2', description: '管理 LaTeX 文件、模板和分类，支持从模板新建文件' },
      ],
    },
  },
  {
    id: 'music',
    name: 'Music',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Music',
    priority: 16,
    shortcut: 'Tab+M',
    ui: { type: 'native', appMode: 'music' },
  },
  {
    id: 'rag',
    name: 'RAG Lab',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Database',
    priority: 17,
    shortcut: 'Tab+R',
    ui: { type: 'native', appMode: 'rag' },
    agent: {
      scopes: [
        { id: 'knowledge', name: '知识库', icon: 'Brain', description: '构建本地文件知识库并进行语义检索' },
      ],
    },
  },
  {
    id: 'knowledge-base',
    name: '知识库',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Library',
    priority: 18,
    shortcut: 'Tab+J',
    ui: { type: 'native', appMode: 'knowledge-base' },
  },
  {
    id: 'workflow',
    name: '工作流引擎',
    version: '1.0.0',
    kind: 'builtin',
    icon: 'Workflow',
    priority: 19,
    shortcut: 'Tab+W',
    ui: { type: 'native', appMode: 'workflow' },
  },
];

export const getBuiltinAgentScopeManifests = () =>
  BUILTIN_MODULE_MANIFESTS.flatMap(manifest => manifest.agent?.scopes || []);

export const BUILTIN_MODULE_CONFIG = BUILTIN_MODULE_MANIFESTS.map(moduleManifestToModuleConfig);
