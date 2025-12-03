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
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  deleteFile: (path: string) => ipcRenderer.invoke('delete-file', path),
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
}


