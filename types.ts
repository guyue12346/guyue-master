export interface Note {
  id: string;
  content: string;
  color: string; // Tailwind class string, e.g. 'bg-yellow-100'
  createdAt: number;
}

// ── API Profile Types (统一密钥管理) ──

export type ApiProviderType =
  | 'openai' | 'gemini' | 'anthropic' | 'deepseek'
  | 'zhipu' | 'qwen' | 'moonshot' | 'minimax'
  | 'ollama' | 'zenmux' | 'custom';

export interface ApiProfile {
  id: string;
  name: string;            // 用户自定义名称，如 "我的 Gemini"
  provider: ApiProviderType;
  apiKey: string;
  baseUrl?: string;        // 自定义 endpoint
  createdAt: number;
  updatedAt: number;
}

// ── Music Player Types ──
export interface MusicTrack {
  id: string;
  filePath: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  format: string;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
  lossless?: boolean;
  addedAt: number;
  // Extended metadata (user-editable)
  lyricist?: string;    // 作词
  composer?: string;    // 作曲
  arranger?: string;    // 编曲
  producer?: string;    // 制作人
  band?: string;        // 乐队/组合
  genre?: string;       // 流派
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  comment?: string;
  lyrics?: string;
  customCover?: string; // base64 data URI for user-uploaded cover
}

export interface MusicPlaylist {
  id: string;
  name: string;
  icon: string;
  color?: string;
  isSystem?: boolean;
  trackIds: string[];
}

export const DEFAULT_MUSIC_PLAYLISTS: MusicPlaylist[] = [
  { id: 'all', name: '全部音乐', icon: 'Music', isSystem: true, trackIds: [] },
];

export type MusicRepeatMode = 'off' | 'all' | 'one';

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
  timeType?: 'point' | 'range' | 'allday'; // 'point' = specific datetime, 'range' = start–end, 'allday' = all-day event
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

/** 知识库标签 */
export interface KbTag {
  id: string;       // UUID
  name: string;
  color: string;    // hex color, e.g. '#3b82f6'
  icon?: string;    // Lucide icon name, e.g. 'BookOpen'
}

/** 知识库文件条目（fileId → tagIds 映射） */
export interface KbFileEntry {
  fileId: string;
  tagIds: string[]; // 空数组 = 未分类
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

export type AppMode = 'notes' | 'ssh' | 'api' | 'todo' | 'files' | 'prompts' | 'markdown' | 'terminal' | 'browser' | 'practice' | 'leetcode' | 'spaces' | 'learning' | 'workspace' | 'coding-practice' | 'image-hosting' | 'recurring' | string;

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
  { id: 'agent',        name: 'AI助手',    enabled: true, priority: 0,  icon: 'Bot' },
  { id: 'todo',         name: '任务与日程', enabled: true, priority: 1,  icon: 'ListTodo',      shortcut: 'Tab+1' },
  { id: 'datacenter',   name: '数据中心',  enabled: true, priority: 2,  icon: 'BarChart3',     shortcut: 'Tab+D' },
  { id: 'spaces',       name: '空间',      enabled: true, priority: 3,  icon: 'PanelsTopLeft',  shortcut: 'Tab+K' },
  { id: 'practice',     name: '刷题',      enabled: true, priority: 4,  icon: 'Code2',         shortcut: 'Tab+L' },
  { id: 'files',        name: '文件管理',  enabled: true, priority: 7,  icon: 'FolderOpen',    shortcut: 'Tab+4' },
  { id: 'terminal',     name: '本地终端',  enabled: true, priority: 8,  icon: 'Command',       shortcut: 'Tab+0' },
  { id: 'excalidraw',   name: '绘图板',    enabled: true, priority: 9,  icon: 'Pencil',        shortcut: 'Tab+E' },
  { id: 'prompts',      name: 'Skills',    enabled: true, priority: 10, icon: 'Sparkles',      shortcut: 'Tab+5' },
  { id: 'notes',        name: '便签',      enabled: true, priority: 11, icon: 'StickyNote',    shortcut: 'Tab+2' },
  { id: 'api',          name: 'API管理',   enabled: true, priority: 12, icon: 'Webhook',       shortcut: 'Tab+3' },
  { id: 'browser',      name: '内置浏览器', enabled: true, priority: 13, icon: 'Globe',        shortcut: 'Tab+B' },
  { id: 'image-hosting', name: '图床管理', enabled: true, priority: 14, icon: 'Image',         shortcut: 'Tab+I' },
  { id: 'latex',        name: 'LaTeX编辑器', enabled: true, priority: 15, icon: 'FileType2',    shortcut: 'Tab+X' },
  { id: 'music',        name: 'Music',      enabled: true, priority: 16, icon: 'Music',         shortcut: 'Tab+M' },
  { id: 'rag',          name: 'RAG Lab',    enabled: true, priority: 17, icon: 'Database',      shortcut: 'Tab+R' },
  { id: 'knowledge-base', name: '知识库',  enabled: true, priority: 18, icon: 'Library',       shortcut: 'Tab+J' },
  { id: 'workflow',       name: '工作流引擎', enabled: true, priority: 19, icon: 'Workflow',      shortcut: 'Tab+W' },
];

export interface RecurringCategory {
  id: string;
  name: string;
  color: string; // hex color, e.g. '#3b82f6'
}

export const DEFAULT_RECURRING_CATEGORIES: RecurringCategory[] = [
  { id: 'rc-course',   name: '课程',  color: '#3b82f6' },
  { id: 'rc-work',     name: '工作',  color: '#8b5cf6' },
  { id: 'rc-exercise', name: '健身',  color: '#22c55e' },
  { id: 'rc-life',     name: '生活',  color: '#f97316' },
];

export const STORAGE_KEY_RECURRING_CATS = 'linkmaster_recurring_cats_v1';

export interface RecurringEvent {
  id: string;
  title: string;
  description?: string;
  category: string;
  color?: string;
  allDay: boolean;
  startDate: number;       // timestamp of first occurrence (time part ignored if allDay)
  endDate?: number;        // optional end of recurrence range (inclusive)
  startTime?: number;      // minutes from midnight, only when !allDay
  duration?: number;       // duration in minutes, only when !allDay
  recurrence: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;        // every N units
  weekDays?: number[];     // for weekly: 0=Sun … 6=Sat
  isActive: boolean;
  createdAt: number;
  lunarRecurrence?: boolean; // monthly/yearly follows lunar calendar
  lunarMonth?: number;       // 1-12, for yearly lunar recurrence
  lunarDay?: number;         // 1-30, for monthly/yearly lunar recurrence
}

export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  color?: string; // Hex color code
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
  getHomeDir: () => Promise<string>;
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
  // Codex Usage API
  fetchCodexUsage: (params: { sessionToken: string; accountId?: string; baseUrl?: string }) => Promise<CodexUsage>;
  openCodexUsageLogin: (params?: { profileId?: string }) => Promise<boolean>;
  fetchCodexUsageFromBrowser: (params?: { profileId?: string }) => Promise<CodexUsage>;
  // Zenmux Usage API
  openZenmuxLogin: () => Promise<boolean>;
  fetchZenmuxUsageFromBrowser: () => Promise<ZenmuxUsage>;
  fetchZenmuxDashboardData: () => Promise<any>;
  // AI Studio API
  openAIStudioLogin: () => Promise<boolean>;
  fetchAIStudioData: (params?: { projectId?: string }) => Promise<any>;
  // GCP Billing API
  fetchGCPBillingData: (params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) => Promise<any>;
  queryBigQueryBilling: (params: { serviceAccountJson: string; projectId: string; bqTablePath: string; bqLocation?: string }) => Promise<any>;
  // Email API
  sendEmail: (params: { config: import('./types').EmailConfig; subject: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  testEmailConfig: (config: import('./types').EmailConfig) => Promise<{ success: boolean; error?: string }>;
  // 代理设置
  setProxy?: (port: number | null) => Promise<{ success: boolean; error?: string }>;
  // LaTeX
  latexCheckEnv: () => Promise<LatexEnvironment>;
  latexCompile: (params: { content: string; engine: string; jobId: string }) => Promise<LatexCompileResult>;
  latexReadPdf: (pdfPath: string) => Promise<string>;  // 返回 base64
  latexGetTemplates: () => Promise<LatexTemplate[]>;
  latexSaveTemplate: (template: LatexTemplate) => Promise<boolean>;
  latexDeleteTemplate: (id: string) => Promise<boolean>;
  latexRenameCategory: (params: { oldName: string; newName: string }) => Promise<boolean>;
  latexDeleteCategory: (params: { categoryName: string; moveToCategory: string }) => Promise<boolean>;
  latexOpenFile: () => Promise<{ path: string; content: string } | null>;
  latexSaveFile: (params: { filePath: string; content: string }) => Promise<boolean>;
  latexSaveFileAs: (content: string) => Promise<string | null>;  // 返回保存路径
  latexGetSettings: () => Promise<LatexSettings>;
  latexSaveSettings: (settings: LatexSettings) => Promise<boolean>;
  latexBrowseExecutable: () => Promise<string | null>;
  latexInstallPackage: (packageName: string) => Promise<{ success: boolean; output: string }>;
  // 托管文件（userData/latex/files/）
  latexListFiles: () => Promise<LatexManagedFile[]>;
  latexNewManagedFile: (name: string) => Promise<{ path: string; content: string } | null>;
  latexOpenManagedFile: (filePath: string) => Promise<{ path: string; content: string } | null>;
  latexSaveManagedFile: (params: { filePath: string; content: string }) => Promise<boolean>;
  latexRenameManagedFile: (params: { filePath: string; newName: string }) => Promise<string | null>;
  latexDeleteManagedFile: (filePath: string) => Promise<boolean>;
  // LaTeX 文件分类
  latexGetFileCategories: () => Promise<LatexFileCategory[]>;
  latexSaveFileCategories: (categories: LatexFileCategory[]) => Promise<boolean>;
  latexGetFileCategoryMap: () => Promise<Record<string, string>>;
  latexSetFileCategory: (params: { filePath: string; categoryId: string }) => Promise<boolean>;
  codingPracticeRun: (params: CodingPracticeRunParams) => Promise<CodingPracticeRunResult>;
  codingPracticeCheck: (params: CodingPracticeRunParams) => Promise<CodingPracticeCheckResult>;
}

export interface CodingPracticeRunnerConfig {
  compileCommand: string;
  runCommand: string;
  timeoutSeconds: number;
}

export interface CodingPracticeRunParams {
  language: string;
  files: Array<{
    id: 'input' | 'code' | 'output';
    name: string;
    content: string;
  }>;
  runner: CodingPracticeRunnerConfig;
}

export interface CodingPracticeRunResult {
  success: boolean;
  stage: 'prepare' | 'compile' | 'run';
  output: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  caseCount?: number;
  error?: string;
}

export interface CodingPracticeCheckResult {
  success: boolean;
  supported: boolean;
  stage: 'prepare' | 'compile';
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
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

export interface CodexUsageWindow {
  usedPercent: number;
  windowMinutes?: number | null;
  resetsAt?: number | null;
}

export interface CodexUsageCredits {
  hasCredits: boolean;
  unlimited: boolean;
  balance?: string | null;
}

export interface CodexAdditionalLimit {
  limitId: string;
  limitName?: string | null;
  primary?: CodexUsageWindow | null;
  secondary?: CodexUsageWindow | null;
}

export interface CodexUsage {
  category: 'Codex';
  planType?: string | null;
  primary?: CodexUsageWindow | null;
  secondary?: CodexUsageWindow | null;
  credits?: CodexUsageCredits | null;
  additionalLimits?: CodexAdditionalLimit[];
  accountId?: string | null;
  accountEmail?: string | null;
  accountName?: string | null;
  currentUrl?: string;
  endpoint?: string;
  lastUpdated: number;
  source: string;
  loginRequired?: boolean;
  error?: string | null;
}

// 数据中心模块配置
export type DataCenterModuleKey =
  | 'ssh'
  | 'apiManager'
  | 'ojHeatmap'
  | 'resourceCenter'
  | 'passwordManager'
  | 'codeCli'
  | 'zenmuxUsage'
  | 'codexUsage'
  | 'aiStudio'
  | 'kimiApi';

export interface DataCenterConfig {
  modules: Record<DataCenterModuleKey, boolean>;
  moduleOrder?: DataCenterModuleKey[];
  moduleColors?: Partial<Record<DataCenterModuleKey, string>>;
  moduleIcons?: Partial<Record<DataCenterModuleKey, string>>;
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

/** LaTeX 文件分类 */
export interface LatexFileCategory {
  id: string;
  name: string;
}

/** LaTeX 托管文件条目（userData/latex/files/ 目录内） */
export interface LatexManagedFile {
  name: string;       // 文件名，如 "thesis.tex"
  path: string;       // 绝对路径
  size: number;       // 字节数
  modifiedAt: number; // 最后修改时间戳
  category?: string;  // 分类 ID
}

// ── LaTeX 编辑器 ──────────────────────────────────────────────────────────────

/** LaTeX 模板 */
export interface LatexTemplate {
  id: string;
  name: string;
  description?: string;
  content: string;     // .tex 源码
  category: string;    // 如 'article' | 'beamer' | 'custom'
  createdAt: number;
  updatedAt: number;
}

/** LaTeX 编译结果 */
export interface LatexCompileResult {
  success: boolean;
  pdfPath?: string;    // 编译成功时输出的 PDF 绝对路径
  errors: LatexLogEntry[];
  warnings: LatexLogEntry[];
  rawLog: string;      // 原始日志
  duration: number;    // 编译耗时 ms
}

/** 日志条目（错误/警告） */
export interface LatexLogEntry {
  type: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

/** LaTeX 环境检测结果 */
export interface LatexEnvironment {
  xelatex: string | null;    // 可执行文件路径，null 表示未找到
  pdflatex: string | null;
  lualatex: string | null;
  tlmgr: string | null;
  mpm: string | null;        // MiKTeX 包管理器
  ctexInstalled: boolean;
  platform: 'darwin' | 'win32' | 'linux';
}

/** 当前打开的 LaTeX 文档状态 */
export interface LatexDocState {
  filePath: string | null;    // null 表示未保存的新文档
  content: string;
  isDirty: boolean;           // 有未保存的修改
  lastCompilePdfPath: string | null;
}

/** 用户可手动配置的 LaTeX 设置 */
export interface LatexSettings {
  /** 各编译器的自定义可执行文件路径（留空则自动检测）*/
  xelatexPath: string;
  pdflatexPath: string;
  lualatexPath: string;
  /** 包管理器自定义路径（留空则自动检测）*/
  tlmgrPath: string;
}
