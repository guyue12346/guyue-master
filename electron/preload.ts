import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  
  // 获取用户数据路径
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  getHomeDir: () => ipcRenderer.invoke('get-home-dir'),
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
  getFileMtime: (path: string) => ipcRenderer.invoke('get-file-mtime', path),
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
    return () => ipcRenderer.removeListener('terminal-incoming-data', subscription);
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
  fetchCodexUsage: (params: { sessionToken: string; accountId?: string; baseUrl?: string }) => ipcRenderer.invoke('fetch-codex-usage', params),
  openCodexUsageLogin: (params?: { profileId?: string }) => ipcRenderer.invoke('open-codex-usage-login', params),
  fetchCodexUsageFromBrowser: (params?: { profileId?: string }) => ipcRenderer.invoke('fetch-codex-usage-browser', params),

  // Zenmux Usage API
  openZenmuxLogin: () => ipcRenderer.invoke('open-zenmux-login'),
  fetchZenmuxUsageFromBrowser: () => ipcRenderer.invoke('fetch-zenmux-usage-browser'),
  fetchZenmuxDashboardData: () => ipcRenderer.invoke('fetch-zenmux-dashboard-data'),

  // AI Studio API
  openAIStudioLogin: () => ipcRenderer.invoke('open-aistudio-login'),
  fetchAIStudioData: (params?: { projectId?: string }) => ipcRenderer.invoke('fetch-aistudio-data', params),

  // GCP Billing API
  fetchGCPBillingData: (params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) =>
    ipcRenderer.invoke('fetch-gcp-billing-data', params),
  queryBigQueryBilling: (params: { serviceAccountJson: string; projectId: string; bqTablePath: string; bqLocation?: string }) =>
    ipcRenderer.invoke('query-bigquery-billing', params),

  // Email API
  sendEmail: (params: { config: any; subject: string; content: string }) => ipcRenderer.invoke('send-email', params),
  testEmailConfig: (config: any) => ipcRenderer.invoke('test-email-config', config),

  // Agent 网络搜索
  agentWebSearch: (params: { query: string }) => ipcRenderer.invoke('agent-web-search', params),

  // 代理设置
  setProxy: (port: number | null) => ipcRenderer.invoke('set-proxy', port),

  // LaTeX
  latexCheckEnv: () => ipcRenderer.invoke('latex-check-env'),
  latexCompile: (params: { content: string; engine: string; jobId: string }) =>
    ipcRenderer.invoke('latex-compile', params),
  latexReadPdf: (pdfPath: string) => ipcRenderer.invoke('latex-read-pdf', pdfPath),
  extractPdfText: (filePath: string) => ipcRenderer.invoke('extract-pdf-text', filePath),
  latexGetTemplates: () => ipcRenderer.invoke('latex-get-templates'),
  latexSaveTemplate: (template: any) => ipcRenderer.invoke('latex-save-template', template),
  latexDeleteTemplate: (id: string) => ipcRenderer.invoke('latex-delete-template', id),
  latexRenameCategory: (params: { oldName: string; newName: string }) =>
    ipcRenderer.invoke('latex-rename-category', params),
  latexDeleteCategory: (params: { categoryName: string; moveToCategory: string }) =>
    ipcRenderer.invoke('latex-delete-category', params),
  latexOpenFile: () => ipcRenderer.invoke('latex-open-file'),
  latexSaveFile: (params: { filePath: string; content: string }) =>
    ipcRenderer.invoke('latex-save-file', params),
  latexSaveFileAs: (content: string) => ipcRenderer.invoke('latex-save-file-as', content),
  latexGetSettings: () => ipcRenderer.invoke('latex-get-settings'),
  latexSaveSettings: (settings: any) => ipcRenderer.invoke('latex-save-settings', settings),
  latexBrowseExecutable: () => ipcRenderer.invoke('latex-browse-executable'),
  latexInstallPackage: (packageName: string) => ipcRenderer.invoke('latex-install-package', packageName),
  // 托管文件
  latexListFiles: () => ipcRenderer.invoke('latex-list-files'),
  latexNewManagedFile: (name: string) => ipcRenderer.invoke('latex-new-managed-file', name),
  latexOpenManagedFile: (filePath: string) => ipcRenderer.invoke('latex-open-managed-file', filePath),
  latexSaveManagedFile: (params: { filePath: string; content: string }) =>
    ipcRenderer.invoke('latex-save-managed-file', params),
  latexRenameManagedFile: (params: { filePath: string; newName: string }) =>
    ipcRenderer.invoke('latex-rename-managed-file', params),
  latexDeleteManagedFile: (filePath: string) => ipcRenderer.invoke('latex-delete-managed-file', filePath),
  // LaTeX 文件分类
  latexGetFileCategories: () => ipcRenderer.invoke('latex-get-file-categories'),
  latexSaveFileCategories: (categories: any[]) => ipcRenderer.invoke('latex-save-file-categories', categories),
  latexGetFileCategoryMap: () => ipcRenderer.invoke('latex-get-file-category-map'),
  latexSetFileCategory: (params: { filePath: string; categoryId: string }) =>
    ipcRenderer.invoke('latex-set-file-category', params),

  // Music Player
  musicSelectFiles: () => ipcRenderer.invoke('music-select-files'),
  musicSelectFolder: () => ipcRenderer.invoke('music-select-folder'),
  musicParseMetadata: (filePath: string) => ipcRenderer.invoke('music-parse-metadata', filePath),
  musicImportLyrics: () => ipcRenderer.invoke('music-import-lyrics'),
  musicAiLyrics: (opts: { filePath: string; apiKey: string; baseUrl: string; language?: string }) => ipcRenderer.invoke('music-ai-lyrics', opts),
  musicFileExists: (filePath: string) => ipcRenderer.invoke('music-file-exists', filePath),
  musicSelectCover: () => ipcRenderer.invoke('music-select-cover'),
  musicRelinkFile: () => ipcRenderer.invoke('music-relink-file'),

  // RAG Lab
  ragSelectFiles: () => ipcRenderer.invoke('rag-select-files'),
  ragSelectFolder: () => ipcRenderer.invoke('rag-select-folder'),
  getFileStats: (filePath: string) => ipcRenderer.invoke('get-file-stats', filePath),
  codingPracticeRun: (params: {
    language: string;
    files: Array<{ id: 'input' | 'code' | 'output'; name: string; content: string }>;
    runner: { compileCommand: string; runCommand: string; timeoutSeconds: number };
  }) => ipcRenderer.invoke('coding-practice-run', params),
  codingPracticeCheck: (params: {
    language: string;
    files: Array<{ id: 'input' | 'code' | 'output'; name: string; content: string }>;
    runner: { compileCommand: string; runCommand: string; timeoutSeconds: number };
  }) => ipcRenderer.invoke('coding-practice-check', params),
});

// 类型定义（可选，用于 TypeScript）
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
  checkFileExists: (path: string) => Promise<boolean>;
  getFileMtime: (path: string) => Promise<number | null>;
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
  onTerminalData: (callback: (event: any, payload: { id: string, data: string }) => void) => (() => void);
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
  fetchCodexUsage: (params: { sessionToken: string; accountId?: string; baseUrl?: string }) => Promise<{
    category: 'Codex';
    planType?: string | null;
    primary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    secondary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    credits?: { hasCredits: boolean; unlimited: boolean; balance?: string | null } | null;
    additionalLimits?: Array<{
      limitId: string;
      limitName?: string | null;
      primary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
      secondary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    }>;
    currentUrl?: string;
    endpoint?: string;
    lastUpdated: number;
    source: string;
    loginRequired?: boolean;
    error?: string | null;
  }>;
  openCodexUsageLogin: (params?: { profileId?: string }) => Promise<boolean>;
  fetchCodexUsageFromBrowser: (params?: { profileId?: string }) => Promise<{
    category: 'Codex';
    planType?: string | null;
    primary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    secondary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    credits?: { hasCredits: boolean; unlimited: boolean; balance?: string | null } | null;
    additionalLimits?: Array<{
      limitId: string;
      limitName?: string | null;
      primary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
      secondary?: { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null } | null;
    }>;
    currentUrl?: string;
    endpoint?: string;
    lastUpdated: number;
    source: string;
    loginRequired?: boolean;
    error?: string | null;
  }>;
  // Email API
  sendEmail: (params: { config: any; subject: string; content: string }) => Promise<{ success: boolean; error?: string }>;
  testEmailConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  // GCP Billing API
  fetchGCPBillingData: (params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) => Promise<any>;
  queryBigQueryBilling: (params: { serviceAccountJson: string; projectId: string; bqTablePath: string; bqLocation?: string }) => Promise<any>;
  // Agent 网络搜索
  agentWebSearch: (params: { query: string }) => Promise<{ success: boolean; results: Array<{ title: string; url: string; snippet: string }>; error?: string; query?: string }>;
  // 代理设置
  setProxy: (port: number | null) => Promise<{ success: boolean; error?: string }>;
  extractPdfText: (filePath: string) => Promise<string | null>;
  // Music Player
  musicSelectFiles: () => Promise<string[]>;
  musicSelectFolder: () => Promise<string[]>;
  musicParseMetadata: (filePath: string) => Promise<{
    title: string;
    artist: string;
    album: string;
    duration: number;
    format: string;
    sampleRate?: number;
    bitDepth?: number;
    bitrate?: number;
    lossless?: boolean;
    coverArt?: string;
    composer?: string;
    lyricist?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
  }>;
  musicImportLyrics: () => Promise<string | null>;
  musicAiLyrics: (opts: { filePath: string; apiKey: string; baseUrl: string; provider: string; model?: string; language?: string }) => Promise<{ lrc?: string; text?: string; error?: string }>;
  musicFileExists: (filePath: string) => Promise<boolean>;
  musicSelectCover: () => Promise<string | null>;
  musicRelinkFile: () => Promise<string | null>;
  // RAG Lab
  ragSelectFiles: () => Promise<string[]>;
  ragSelectFolder: () => Promise<string | null>;
  getFileStats: (filePath: string) => Promise<{ size: number; mtime: number } | null>;
  codingPracticeRun: (params: {
    language: string;
    files: Array<{ id: 'input' | 'code' | 'output'; name: string; content: string }>;
    runner: { compileCommand: string; runCommand: string; timeoutSeconds: number };
  }) => Promise<{
    success: boolean;
    stage: 'prepare' | 'compile' | 'run';
    output: string;
    stdout: string;
    stderr: string;
    durationMs: number;
    error?: string;
  }>;
  codingPracticeCheck: (params: {
    language: string;
    files: Array<{ id: 'input' | 'code' | 'output'; name: string; content: string }>;
    runner: { compileCommand: string; runCommand: string; timeoutSeconds: number };
  }) => Promise<{
    success: boolean;
    supported: boolean;
    stage: 'prepare' | 'compile';
    stdout: string;
    stderr: string;
    durationMs: number;
    error?: string;
  }>;
}
