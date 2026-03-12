export interface Note {
  id: string;
  content: string;
  color: string; // Tailwind class string, e.g. 'bg-yellow-100'
  createdAt: number;
}

export interface SSHRecord {
  id: string;
  title: string; // Hostname / Alias
  host: string;  // IP or Domain
  username: string;
  port: string;
  command: string; // The full ssh command
  category: string;
  note: string;
  priority?: number; // 1-100
  networkType?: string; // Changed to string to support custom values
  createdAt: number;
}

export interface APIRecord {
  id: string;
  title: string; // API Name
  baseUrl: string;
  endpoint: string;
  method: string; // GET, POST, PUT, DELETE, etc.
  apiKey: string;
  usage: string; // Code snippet or description
  category: string;
  note: string;
  priority?: number;
  createdAt: number;
}

export interface SubTask {
  id: string;
  content: string;
  isCompleted: boolean;
}

export interface TodoItem {
  id: string;
  content: string;
  description?: string;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  category: string;
  dueDate?: number; // timestamp (legacy date-only or timeType='point' full datetime)
  timeType?: 'point' | 'range'; // 'point' = specific datetime, 'range' = start–end
  timeStart?: number; // range start timestamp
  timeEnd?: number;   // range end timestamp
  color?: string; // event display color for calendar view
  subtasks?: SubTask[];
  completedAt?: number; // timestamp when completed
  createdAt: number;
}

export interface FileRecord {
  id: string;
  name: string;
  path: string; // Simulated path or real path in Electron
  size: number; // File size in bytes
  type: string; // Extension, e.g. "pdf"
  importance: number; // 1-100
  category: string;
  note: string;
  createdAt: number;
}

export interface PromptRecord {
  id: string;
  title: string;
  content: string;           // Markdown supported
  description?: string;      // 简短描述（新增）
  tags: string[];
  category: string;
  note: string;              // 保留向后兼容
  author?: string;           // 来源作者（新增）
  source?: string;           // 来源 URL（新增）
  createdAt: number;
  updatedAt: number;
}

/** 可导入/导出的 Skills 包格式 */
export interface SkillPack {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  sourceUrl?: string;
  skills: Array<Omit<PromptRecord, 'id' | 'createdAt' | 'updatedAt'>>;
}

export interface MarkdownNote {
  id: string;
  title: string;
  category: string;
  content: string; // Markdown content
  createdAt: number;
  updatedAt: number;
}

export interface ImageRecord {
  id: string;
  filename: string;
  name?: string; // Display name
  url: string;
  sha: string; // Gitee SHA for deletion/update
  path: string; // Path in repo
  category?: string;
  createdAt: number;
}

export interface ImageHostingConfig {
  accessToken: string;
  owner: string;
  repo: string;
  path: string; // Default upload path, e.g., "images"
}

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string; // Lucide icon name
  entry: string; // relative path to index.html
  author?: string;
  dirPath?: string; // Runtime only: absolute path to plugin directory
  entryPath?: string; // Runtime only: absolute path to entry file
}

export type AppMode = 'notes' | 'ssh' | 'api' | 'todo' | 'files' | 'prompts' | 'markdown' | 'terminal' | 'browser' | 'leetcode' | 'learning' | 'image-hosting' | string;

export interface ModuleConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number; // 1-100
  icon: string; // Lucide icon name for NavRail
  shortcut?: string; // e.g. "Tab+1"
  isPlugin?: boolean;
  pluginPath?: string;
}

export const DEFAULT_MODULE_CONFIG: ModuleConfig[] = [
  { id: 'notes', name: '笔记备忘', enabled: true, priority: 0, icon: 'StickyNote', shortcut: 'Tab+1' },
  { id: 'api', name: 'API管理', enabled: true, priority: 1, icon: 'Webhook', shortcut: 'Tab+2' },
  { id: 'todo', name: '待办事项', enabled: true, priority: 2, icon: 'ListTodo', shortcut: 'Tab+3' },
  { id: 'files', name: '文件管理', enabled: true, priority: 3, icon: 'FolderOpen', shortcut: 'Tab+4' },
  { id: 'prompts', name: 'Skills', enabled: true, priority: 4, icon: 'Sparkles', shortcut: 'Tab+5' },
  { id: 'terminal', name: '本地终端', enabled: true, priority: 5, icon: 'Command', shortcut: 'Tab+0' },
  { id: 'browser', name: '内置浏览器', enabled: true, priority: 6, icon: 'Globe', shortcut: 'Tab+B' },
  { id: 'leetcode', name: 'Code', enabled: true, priority: 7, icon: 'Code2', shortcut: 'Tab+L' },
  { id: 'learning', name: '学习空间', enabled: true, priority: 8, icon: 'GraduationCap', shortcut: 'Tab+K' },
  { id: 'image-hosting', name: '图床管理', enabled: true, priority: 9, icon: 'Image', shortcut: 'Tab+I' },
  { id: 'chat', name: 'AI Chat', enabled: true, priority: 10, icon: 'MessageSquare', shortcut: 'Tab+C' },
  { id: 'excalidraw', name: '绘图板', enabled: true, priority: 11, icon: 'Pencil', shortcut: 'Tab+E' },
  { id: 'datacenter', name: '数据中心', enabled: true, priority: 12, icon: 'BarChart3', shortcut: 'Tab+D' }
];

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  isSystem?: boolean; // If true, cannot be deleted (e.g., 'All')
}

// List of icon names available for selection
export const AVAILABLE_ICONS = [
  'LayoutGrid', 'Folder', 'Code', 'PenTool', 'BookOpen',
  'Wrench', 'Gamepad2', 'Briefcase', 'Coffee', 'Music',
  'Video', 'ShoppingCart', 'Heart', 'Star', 'Zap',
  'Globe', 'Server', 'Database', 'Cloud', 'Smartphone',
  'Monitor', 'GraduationCap', 'Plane', 'Smile', 'Terminal', 'Cpu', 'Webhook', 'Activity',
  'ListTodo', 'CheckSquare', 'Calendar', 'FolderOpen', 'FileText', 'Image', 'Archive', 'Sparkles',
  'Sun', 'Moon', 'Umbrella', 'Watch', 'Headphones', 'Camera', 'Mic', 'Speaker', 'Bell', 'Search',
  'Map', 'Navigation', 'Compass', 'Anchor', 'Flag', 'Award', 'Gift', 'Package', 'Truck', 'Home',
  // Computer & Tech
  'Laptop', 'HardDrive', 'Keyboard', 'Mouse', 'Printer', 'Wifi', 'Bluetooth', 'Battery', 'Power',
  'Command', 'Option', 'Shift', 'Hash', 'Cpu', 'CircuitBoard', 'Binary', 'Network', 'Router',
  'Shield', 'Lock', 'Key', 'Globe', 'Radio', 'Cast', 'Signal', 'ServerCog', 'DatabaseZap',
  // Files & Notes
  'File', 'FilePlus', 'FileMinus', 'FileEdit', 'FileCheck', 'FileX', 'FileSearch', 'FileCode2',
  'FileJson', 'FileType', 'StickyNote', 'Notebook', 'Book', 'BookMarked', 'Library', 'Tags',
  'Highlighter', 'Pencil', 'Eraser', 'Save', 'Clipboard', 'ClipboardList', 'ClipboardCheck',
  // Shapes & Symbols (新增30个图形符号)
  'Circle', 'Square', 'Triangle', 'Pentagon', 'Hexagon', 'Octagon', 'Diamond',
  'Asterisk', 'AtSign', 'Hash', 'Percent', 'Plus', 'Minus', 'X', 'Check',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'CornerRightDown', 'CornerLeftUp',
  'ChevronUp', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'ChevronsUp', 'ChevronsDown',
  'Target', 'Crosshair', 'Focus', 'Maximize', 'Minimize', 'Move',
  // Science & Math
  'Atom', 'FlaskConical', 'Microscope', 'TestTube', 'Dna', 'Brain',
  'Calculator', 'Sigma', 'Pi', 'Infinity', 'Equal', 'NotEqual',
  // Communication
  'MessageCircle', 'MessageSquare', 'Mail', 'Send', 'Phone', 'PhoneCall',
  'Bot', 'User', 'Users', 'UserPlus', 'UserMinus', 'Contact'
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'all', name: '全部', icon: 'LayoutGrid', isSystem: true },
  { id: 'dev', name: '开发', icon: 'Code' },
  { id: 'design', name: '设计', icon: 'PenTool' },
  { id: 'read', name: '阅读', icon: 'BookOpen' },
  { id: 'tools', name: '工具', icon: 'Wrench' },
  { id: 'fun', name: '娱乐', icon: 'Gamepad2' }
];

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  getAppPath: () => Promise<string>;
  openPath: (path: string) => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  ensureDir: (path: string) => Promise<boolean>;
  copyFile: (source: string, target: string) => Promise<boolean>;
  pathJoin: (...args: string[]) => Promise<string>;
  selectFile: () => Promise<{ path: string; name: string; size: number; type: string } | null>;
  readFile: (path: string) => Promise<string>;
  readFileBase64: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<boolean>;
  checkFileExists: (path: string) => Promise<boolean>;
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>;
  deleteDir: (path: string) => Promise<boolean>;
  listDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  getUserInfo: () => Promise<{ username: string; hostname: string }>;
  uploadImage: (params: { accessToken: string; owner: string; repo: string; path: string; content: string; message: string }) => Promise<any>;
  // Plugins
  getPlugins: () => Promise<PluginMetadata[]>;
  installPlugin: () => Promise<boolean>;
  deletePlugin: (id: string) => Promise<boolean>;
  // Terminal
  createTerminal: (options?: any) => Promise<string>; // returns terminal ID
  onTerminalData: (callback: (event: any, payload: { id: string, data: string }) => void) => void;
  writeTerminal: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  closeTerminal: (id: string) => void;
  // 应用数据文件存储
  saveAppData: (key: string, data: any) => Promise<boolean>;
  loadAppData: (key: string) => Promise<any>;
  appDataExists: (key: string) => Promise<boolean>;
  // LeetCode API
  leetcodeApi: (params: { query: string; variables: any; session: string }) => Promise<any>;
  // Zenmux Usage API
  openZenmuxLogin: () => Promise<boolean>;
  fetchZenmuxUsageFromBrowser: () => Promise<ZenmuxUsage>;
  fetchZenmuxDashboardData: () => Promise<any>;
  // Email API
  sendEmail: (params: { config: import('./types').EmailConfig; subject: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  testEmailConfig: (config: import('./types').EmailConfig) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// 热力图数据类型
export interface HeatmapData {
  guyue: Record<string, number>;   // { "2025-01-02": 85, ... }
  xiaohong: Record<string, number>; // { "2025-01-02": 70, ... }
}

// OJ网站统计分类
export interface OJStatCategory {
  id: string;          // 分类唯一标识（如 "easy", "medium", "hard"）
  name: string;        // 分类名称（如"简单"、"中等"、"困难"）
  color: string;       // 分类颜色
}

// OJ网站配置
export interface OJSite {
  id: string;          // 唯一标识
  name: string;        // 网站名称（如"洛谷"、"acwing"）
  color: string;       // 标识颜色（用于图例，如 "#22c55e"）
  url?: string;        // 网站链接（可选）
  categories?: OJStatCategory[];  // 统计分类（如 easy/mid/hard）
}

// 单次提交记录
export interface OJSubmission {
  id: string;          // 提交记录ID
  siteId: string;      // OJ网站ID
  categoryId: string;  // 难度分类ID
  problemId: string;   // 题号
  problemTitle?: string; // 题目标题（可选）
  timestamp: number;   // 提交时间戳
  date: string;        // 提交日期 YYYY-MM-DD
}

// OJ热力图数据
export interface OJHeatmapData {
  sites: OJSite[];                              // 网站列表
  submissions: OJSubmission[];                  // 所有提交记录
}

// 资源分类
export interface ResourceCategory {
  id: string;
  name: string;
  icon: string;       // Lucide icon name
  color: string;      // 主题色
}

// 资源项
export interface ResourceItem {
  id: string;
  categoryId: string;
  name: string;
  icon?: string;      // 自定义图标
  expireDate?: string; // 到期日期 YYYY-MM-DD
  totalTime?: {       // 总时间（如会员总时长）
    value: number;    // 时间值
    unit: 'day' | 'month' | 'year'; // 时间单位
  };
  capacity?: {
    used: number;     // 已用容量
    total: number;    // 总容量
    unit?: string;    // 单位（如 GB、TB 等）
  };
  cost?: {
    amount: number;   // 费用金额
    period: 'month' | 'year' | 'once'; // 周期
  };
  quota?: {
    used: number;     // 已用额度
    total: number;    // 总额度
    unit: string;     // 单位（如"次"、"tokens"等）
  };
  autoRenewal?: boolean; // 自动续费状态
  renewalDate?: string; // 续费日期 (每月1-31日或每年MM-DD格式)
  account?: string;   // 账号/用户名
  url?: string;       // 资源链接
  note?: string;      // 备注
  emailReminder?: boolean; // 是否启用邮件到期提醒
  createdAt: number;
}

// 资源中心数据
export interface ResourceCenterData {
  categories: ResourceCategory[];
  items: ResourceItem[];
}

// Zenmux 使用统计
export interface ZenmuxUsage {
  category: 'Zenmux';
  totalRequests: number;      // 总请求数
  totalCost: number;           // 总花费(美元)
  balance: number;             // 账户余额
  monthlyRequests: number;     // 本月请求数
  monthlyCost: number;         // 本月花费
  lastUpdated: number;         // 最后更新时间戳
  source: string;              // 数据来源
}

// 数据中心模块配置
export interface DataCenterConfig {
  modules: {
    ssh: boolean;
    apiManager: boolean;
    ojHeatmap: boolean;
    resourceCenter: boolean;
    passwordManager: boolean;
    zenmuxUsage: boolean;
  };
  moduleOrder?: string[];
}

// 邮件SMTP配置
export interface EmailConfig {
  enabled: boolean;
  smtp: {
    host: string;      // smtp.163.com / smtp.qq.com / smtp.gmail.com
    port: number;      // 465 或 587
    secure: boolean;   // true for 465, false for 587
    user: string;      // 发件邮箱
    pass: string;      // 授权码（非邮箱密码）
  };
  recipient: string;   // 收件邮箱
}
