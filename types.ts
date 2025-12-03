export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  note: string;
  priority?: number; // 1-100, 1 is highest priority (top)
  createdAt: number;
}

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

export interface TodoItem {
  id: string;
  content: string;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  category: string;
  dueDate?: number; // timestamp
  createdAt: number;
}

export interface FileRecord {
  id: string;
  name: string;
  path: string; // Simulated path or real path in Electron
  size: string; // e.g. "2.5 MB"
  type: string; // Extension, e.g. "pdf"
  importance: number; // 1-100
  category: string;
  note: string;
  createdAt: number;
}

export interface PromptRecord {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  note: string;
  createdAt: number;
  updatedAt: number;
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

export type AppMode = 'bookmarks' | 'notes' | 'ssh' | 'api' | 'todo' | 'files' | 'renderer' | 'prompts' | 'markdown' | 'terminal' | 'browser' | 'leetcode' | 'learning' | 'image-hosting' | string;

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
  { id: 'bookmarks', name: '书签管理', enabled: true, priority: 0, icon: 'LayoutGrid', shortcut: 'Tab+1' },
  { id: 'notes', name: '笔记备忘', enabled: true, priority: 1, icon: 'StickyNote', shortcut: 'Tab+2' },
  { id: 'ssh', name: 'SSH连接', enabled: true, priority: 2, icon: 'Terminal', shortcut: 'Tab+3' },
  { id: 'api', name: 'API管理', enabled: true, priority: 3, icon: 'Webhook', shortcut: 'Tab+4' },
  { id: 'todo', name: '待办事项', enabled: true, priority: 4, icon: 'ListTodo', shortcut: 'Tab+5' },
  { id: 'files', name: '文件管理', enabled: true, priority: 5, icon: 'FolderOpen', shortcut: 'Tab+6' },
  { id: 'renderer', name: '文件阅读', enabled: true, priority: 6, icon: 'Book', shortcut: 'Tab+7' },
  { id: 'prompts', name: 'Prompt管理', enabled: true, priority: 7, icon: 'Sparkles', shortcut: 'Tab+8' },
  { id: 'markdown', name: 'Markdown笔记', enabled: true, priority: 8, icon: 'BookOpen', shortcut: 'Tab+9' },
  { id: 'terminal', name: '本地终端', enabled: true, priority: 9, icon: 'Command', shortcut: 'Tab+0' },
  { id: 'browser', name: '内置浏览器', enabled: true, priority: 10, icon: 'Globe', shortcut: 'Tab+B' },
  { id: 'leetcode', name: 'Code', enabled: true, priority: 11, icon: 'Code2', shortcut: 'Tab+L' },
  { id: 'learning', name: '学习中心', enabled: true, priority: 12, icon: 'GraduationCap', shortcut: 'Tab+K' },
  { id: 'image-hosting', name: '图床管理', enabled: true, priority: 13, icon: 'Image', shortcut: 'Tab+I' },
  { id: 'chat', name: 'AI Chat', enabled: true, priority: 14, icon: 'MessageSquare', shortcut: 'Tab+C' },
  { id: 'vscode', name: 'VS Code', enabled: true, priority: 15, icon: 'Code', shortcut: 'Tab+V' }
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
  'Highlighter', 'Pencil', 'Eraser', 'Save', 'Clipboard', 'ClipboardList', 'ClipboardCheck'
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
