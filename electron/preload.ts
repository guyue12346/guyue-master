import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 获取用户数据路径
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // 打开文件或路径
  openPath: (path: string) => ipcRenderer.invoke('open-path', path),

  // 文件系统操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  ensureDir: (path: string) => ipcRenderer.invoke('ensure-dir', path),
  copyFile: (source: string, target: string) => ipcRenderer.invoke('copy-file', source, target),
  pathJoin: (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
  selectFile: () => ipcRenderer.invoke('select-file'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  readFileBase64: (path: string) => ipcRenderer.invoke('read-file-base64', path),
  checkFileExists: (path: string) => ipcRenderer.invoke('check-file-exists', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  deleteFile: (path: string) => ipcRenderer.invoke('delete-file', path),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  deleteDir: (path: string) => ipcRenderer.invoke('delete-dir', path),
  listDir: (path: string) => ipcRenderer.invoke('list-dir', path),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  uploadImage: (params: any) => ipcRenderer.invoke('upload-image', params),

  // Plugins
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  installPlugin: () => ipcRenderer.invoke('install-plugin'),
  deletePlugin: (id: string) => ipcRenderer.invoke('delete-plugin', id),

  // Terminal
  createTerminal: (options?: any) => ipcRenderer.invoke('terminal-create', options),
  onTerminalData: (callback: (event: any, payload: { id: string, data: string }) => void) => {
    const subscription = (event: any, payload: { id: string, data: string }) => callback(event, payload);
    ipcRenderer.on('terminal-incoming-data', subscription);
  },
  writeTerminal: (id: string, data: string) => ipcRenderer.send('terminal-write', { id, data }),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal-resize', { id, cols, rows }),
  closeTerminal: (id: string) => ipcRenderer.send('terminal-close', id),

  // 应用数据文件存储
  saveAppData: (key: string, data: any) => ipcRenderer.invoke('save-app-data', key, data),
  loadAppData: (key: string) => ipcRenderer.invoke('load-app-data', key),
  appDataExists: (key: string) => ipcRenderer.invoke('app-data-exists', key),

  // LeetCode API
  leetcodeApi: (params: { query: string; variables: any; session: string }) => ipcRenderer.invoke('leetcode-api', params),
  // Codex Usage API
  fetchCodexUsage: (params: { sessionToken: string }) => ipcRenderer.invoke('fetch-codex-usage', params),
  openCodexUsageLogin: () => ipcRenderer.invoke('open-codex-usage-login'),
  fetchCodexUsageFromBrowser: () => ipcRenderer.invoke('fetch-codex-usage-browser'),

  // Zenmux Usage API
  openZenmuxLogin: () => ipcRenderer.invoke('open-zenmux-login'),
  fetchZenmuxUsageFromBrowser: () => ipcRenderer.invoke('fetch-zenmux-usage-browser'),
  fetchZenmuxDashboardData: () => ipcRenderer.invoke('fetch-zenmux-dashboard-data'),

  // GCP Billing API
  fetchGCPBillingData: (params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) =>
    ipcRenderer.invoke('fetch-gcp-billing-data', params),

  // Email API
  sendEmail: (params: { config: any; subject: string; content: string }) => ipcRenderer.invoke('send-email', params),
  testEmailConfig: (config: any) => ipcRenderer.invoke('test-email-config', config),
});

// 类型定义（可选，用于 TypeScript）
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
  checkFileExists: (path: string) => Promise<boolean>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<boolean>;
  listDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  getUserInfo: () => Promise<{ username: string; hostname: string }>;
  uploadImage: (params: { accessToken: string; owner: string; repo: string; path: string; content: string; message: string }) => Promise<any>;
  // Plugins
  getPlugins: () => Promise<any[]>;
  installPlugin: () => Promise<boolean>;
  deletePlugin: (id: string) => Promise<boolean>;
  // Terminal
  createTerminal: (options?: any) => Promise<string>;
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
  fetchCodexUsage: (params: { sessionToken: string }) => Promise<{
    category: 'Codex';
    fiveHourUsed: number;
    fiveHourLimit: number;
    weeklyUsed: number;
    weeklyLimit: number;
    fiveHourResetAt?: string | null;
    weeklyResetAt?: string | null;
    lastUpdated: number;
    source: string;
  }>;
  openCodexUsageLogin: () => Promise<boolean>;
  fetchCodexUsageFromBrowser: () => Promise<{
    category: 'Codex';
    fiveHourUsed: number;
    fiveHourLimit: number;
    weeklyUsed: number;
    weeklyLimit: number;
    fiveHourResetAt?: string | null;
    weeklyResetAt?: string | null;
    lastUpdated: number;
    source: string;
  }>;
  // Email API
  sendEmail: (params: { config: any; subject: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  testEmailConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  // GCP Billing API
  fetchGCPBillingData: (params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) => Promise<any>;
}
