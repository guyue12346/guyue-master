import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import pty from 'node-pty';
import os from 'os';
import net from 'net';
import nodemailer from 'nodemailer';
import dns from 'dns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let zenmuxUsageWindow: BrowserWindow | null = null;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

function createWindow() {
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 15, y: 15 };
  } else {
    // Windows/Linux: use default system frame
    windowOptions.autoHideMenuBar = true;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // 当页面准备好显示时再展示窗口，避免白屏/黑屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 加载失败时的处理
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    // 开发环境下可能是 Vite 还没启动，尝试重新加载
    if (isDev && errorCode === -102) { // ERR_CONNECTION_REFUSED
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:3000');
      }, 1000);
    }
  });

  // 渲染进程崩溃时的处理
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process gone:', details.reason);
    if (details.reason === 'crashed') {
      // 尝试重新加载页面
      mainWindow?.reload();
    }
  });

  // 开发环境加载 Vite 开发服务器
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools(); // 自动打开开发者工具
  } else {
    // 生产环境加载打包后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 处理新窗口打开请求（例如 window.open）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 如果是 http 或 https 协议，使用系统默认浏览器打开
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' }; // 阻止 Electron 创建新窗口
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Zenmux 登录窗口
const ZENMUX_COST_PAGE_URL = 'https://zenmux.ai/platform/cost';

function createZenmuxUsageWindow(showWindow = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: showWindow,
    title: 'Zenmux 登录',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:zenmux',
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  void win.loadURL(ZENMUX_COST_PAGE_URL);

  win.on('closed', () => {
    if (zenmuxUsageWindow === win) {
      zenmuxUsageWindow = null;
    }
  });

  return win;
}

function waitForWindowLoad(win: BrowserWindow, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (win.isDestroyed()) {
      reject(new Error('窗口已关闭'));
      return;
    }

    if (!win.webContents.isLoadingMainFrame()) {
      resolve();
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      win.webContents.removeListener('did-finish-load', onFinish);
      win.webContents.removeListener('did-fail-load', onFail);
    };

    const onFinish = () => {
      cleanup();
      resolve();
    };

    const onFail = (_event: unknown, errorCode: number, errorDescription: string) => {
      cleanup();
      reject(new Error(`页面加载失败(${errorCode}): ${errorDescription || 'unknown'}`));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('页面加载超时，请重试'));
    }, timeoutMs);

    win.webContents.once('did-finish-load', onFinish);
    win.webContents.once('did-fail-load', onFail);
  });
}

async function ensureZenmuxUsageWindow(showWindow = false): Promise<BrowserWindow> {
  if (!zenmuxUsageWindow || zenmuxUsageWindow.isDestroyed()) {
    zenmuxUsageWindow = createZenmuxUsageWindow(showWindow);
  } else if (showWindow) {
    zenmuxUsageWindow.show();
    zenmuxUsageWindow.focus();
  }

  const currentUrl = zenmuxUsageWindow.webContents.getURL();
  if (!currentUrl.includes('zenmux.ai/platform')) {
    void zenmuxUsageWindow.loadURL(ZENMUX_COST_PAGE_URL);
  }

  await waitForWindowLoad(zenmuxUsageWindow);
  return zenmuxUsageWindow;
}

// 当 Electron 完成初始化时创建窗口
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS 特性：点击 Dock 图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出应用（Windows & Linux）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 通信示例：获取应用版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// IPC 通信示例：获取平台信息
ipcMain.handle('get-platform', () => {
  return process.platform;
});

// IPC: 获取用户数据路径
ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// IPC: Get App Path
ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

// IPC 通信：打开文件或路径
ipcMain.handle('open-path', async (event, filePath) => {
  try {
    // Check if it is a URL
    if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('mailto:')) {
        await shell.openExternal(filePath);
        return null;
    }

    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) {
      console.error('Failed to open path:', errorMessage);
      return errorMessage;
    }
    return null; // Success
  } catch (error) {
    console.error('Error opening path:', error);
    return (error as Error).message;
  }
});

// IPC: 选择文件夹
ipcMain.handle('select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// IPC: 确保目录存在
ipcMain.handle('ensure-dir', async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error('Failed to create directory:', error);
    return false;
  }
});

// IPC: 复制文件
ipcMain.handle('copy-file', async (event, source, target) => {
  try {
    // Decode source path if it's URL encoded (sometimes happens with drag & drop or file inputs)
    const decodedSource = decodeURIComponent(source);
    
    // Check if source exists
    try {
        await fs.access(decodedSource);
    } catch {
        console.error(`Source file not found: ${decodedSource}`);
        return false;
    }

    await fs.copyFile(decodedSource, target);
    return true;
  } catch (error) {
    console.error('Failed to copy file:', error);
    // Log detailed error for debugging
    console.error(`Source: ${source}, Target: ${target}`);
    return false;
  }
});

// IPC: 路径拼接
ipcMain.handle('path-join', async (event, ...args) => {
  return path.join(...args);
});

// IPC: 选择文件并获取信息
ipcMain.handle('select-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  });
  
  if (result.canceled || result.filePaths.length === 0) return null;
  
  const filePath = result.filePaths[0];
  try {
    const stats = await fs.stat(filePath);
    const name = path.basename(filePath);
    const ext = path.extname(filePath).replace('.', '').toUpperCase();
    
    return {
      path: filePath,
      name: name,
      size: stats.size,
      type: ext || 'FILE'
    };
  } catch (e) {
    console.error('Error reading file stats:', e);
    return null;
  }
});

// IPC: 读取文件内容
ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error('Failed to read file:', error);
    return null;
  }
});

// IPC: 读取文件内容 (Base64)
ipcMain.handle('read-file-base64', async (_, filePath) => {
  try {
    const content = await fs.readFile(filePath, { encoding: 'base64' });
    return content;
  } catch (error) {
    console.error('Failed to read file as base64:', error);
    return null;
  }
});

// IPC: 检查文件是否存在
ipcMain.handle('check-file-exists', async (_, filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

// IPC: 写入文件
ipcMain.handle('write-file', async (_, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to write file:', error);
    return false;
  }
});

// IPC: 删除文件
ipcMain.handle('delete-file', async (_, filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error('Failed to delete file:', error);
    return false;
  }
});

// IPC: 重命名文件
ipcMain.handle('rename-file', async (_, oldPath: string, newPath: string) => {
  try {
    await fs.rename(oldPath, newPath);
    return true;
  } catch (error) {
    console.error('Failed to rename file:', error);
    return false;
  }
});

// IPC: 删除目录（递归删除）
ipcMain.handle('delete-dir', async (_, dirPath: string) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error('Failed to delete directory:', error);
    return false;
  }
});

// IPC: 列出目录内容 (用于笔记文件树)
ipcMain.handle('list-dir', async (_, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      path: path.join(dirPath, entry.name)
    }));
  } catch (error) {
    console.error('Failed to list directory:', error);
    return [];
  }
});

// IPC: 获取用户信息
ipcMain.handle('get-user-info', () => {
  return {
    username: os.userInfo().username,
    hostname: os.hostname()
  };
});

// IPC: Upload Image to Gitee
ipcMain.handle('upload-image', async (event, { accessToken, owner, repo, path: filePath, content, message }) => {
  try {
    // 1. Clean inputs
    const cleanOwner = owner ? owner.trim() : '';
    const cleanRepo = repo ? repo.trim() : '';
    
    if (!cleanOwner || !cleanRepo) {
      throw new Error('请检查配置：用户名(Owner)和仓库名(Repo)不能为空');
    }

    // 2. Encode path segments to handle spaces and special characters in filenames
    // e.g. "images/my file.png" -> "images/my%20file.png"
    const encodedPath = filePath.split('/').map((segment: string) => encodeURIComponent(segment)).join('/');
    
    const url = `https://gitee.com/api/v5/repos/${cleanOwner}/${cleanRepo}/contents/${encodedPath}`;
    console.log('Uploading to Gitee URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8'
      },
      body: JSON.stringify({
        access_token: accessToken,
        content: content,
        message: message
      })
    });

    // 3. Read text first to handle non-JSON responses (like 404 HTML pages)
    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // If parsing fails, it's likely HTML. Log it and throw a readable error.
      console.error('Gitee API returned non-JSON:', responseText);
      
      // Try to extract page title if it's HTML
      const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1] : 'Unknown Error';
      
      if (response.status === 404) {
        throw new Error(`请求失败 (404): 仓库或路径不存在。请检查用户名"${cleanOwner}"和仓库名"${cleanRepo}"是否正确。`);
      }
      
      throw new Error(`Gitee 服务器返回了非 JSON 数据 (可能是网页): ${pageTitle}`);
    }

    if (!response.ok) {
      throw new Error(data.message || 'Upload failed');
    }

    return data;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
});

// --- LeetCode API ---
ipcMain.handle('leetcode-api', async (event, { query, variables, session }) => {
  try {
    // 支持 REST API 调用
    if (query === '__REST__' && variables?.url) {
      const response = await fetch(variables.url, {
        method: 'GET',
        headers: {
          'Cookie': `LEETCODE_SESSION=${session}`,
          'Referer': 'https://leetcode.cn/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      const text = await response.text();
      // 尝试解析为 JSON
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    // GraphQL 请求
    const response = await fetch('https://leetcode.cn/graphql/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `LEETCODE_SESSION=${session}`,
        'Referer': 'https://leetcode.cn/',
        'Origin': 'https://leetcode.cn',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify({ query, variables }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('LeetCode API error:', error);
    throw error;
  }
});

// --- Zenmux Usage API ---

// 用 webRequest 拦截 ctoken
let cachedCtoken: string | null = null;

function setupCtokenInterceptor(win: BrowserWindow) {
  const filter = { urls: ['https://zenmux.ai/api/*'] };
  win.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const m = details.url.match(/[?&]ctoken=([^&]+)/);
    if (m) cachedCtoken = m[1];
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

// 从隐藏窗口提取 ctoken 并调用 Zenmux 内部 API
async function fetchZenmuxDashboardData(): Promise<any> {
  // 创建或复用隐藏窗口
  if (!zenmuxUsageWindow || zenmuxUsageWindow.isDestroyed()) {
    cachedCtoken = null;
    zenmuxUsageWindow = createZenmuxUsageWindow(false);
    setupCtokenInterceptor(zenmuxUsageWindow);
  }

  // 仅在没有 ctoken 时才加载页面（首次 / 过期）
  if (!cachedCtoken) {
    void zenmuxUsageWindow.loadURL('https://zenmux.ai/platform/usage');
    await waitForWindowLoad(zenmuxUsageWindow);
    // 等待 SPA 发出至少一个带 ctoken 的请求
    for (let i = 0; i < 30 && !cachedCtoken; i++) {
      await new Promise(r => setTimeout(r, 300));
    }
    if (!cachedCtoken) {
      return { error: 'ctoken-not-found', loginRequired: false };
    }
  }

  const ctokenLiteral = JSON.stringify(cachedCtoken);
  const script = `
    (async () => {
      const result = { loginRequired: false, error: null, data: null, lastUpdated: Date.now() };

      try {
        const url = window.location.href;
        if (url.includes('/sign-in') || url.includes('/login')) { result.loginRequired = true; return result; }
        const bodyText = (document.body && document.body.innerText) || '';
        if (bodyText.includes('Sign in') && bodyText.includes('Continue with Google') && bodyText.length < 3000) { result.loginRequired = true; return result; }

        const ctoken = ${ctokenLiteral};
        const ym = '' + new Date().getFullYear() + String(new Date().getMonth() + 1).padStart(2, '0');
        const postBody = JSON.stringify({ queryDimension: 'BIZ_MTH', queryTime: ym, apiKeys: [], modelSlugs: [] });
        const postOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: postBody };

        // 三个 API 并行调用
        const [r1, r2, r3] = await Promise.all([
          fetch('/api/dashboard/usage/query?ctoken=' + ctoken, postOpts).then(r => r.text()).catch(() => ''),
          fetch('/api/dashboard/cost/query/cost?ctoken=' + ctoken, { ...postOpts, body: postBody }).then(r => r.text()).catch(() => ''),
          fetch('/api/payment/transtion/get_credits?ctoken=' + ctoken).then(r => r.text()).catch(() => ''),
        ]);

        result.data = {};
        try { result.data.usage = JSON.parse(r1); } catch(e) {}
        try { result.data.costDetail = JSON.parse(r2); } catch(e) {}
        try { result.data.credits = JSON.parse(r3); } catch(e) {}

        return result;
      } catch (error) {
        result.error = (error && error.message) || 'unknown-error';
        return result;
      }
    })();
  `;

  try {
    const res = await zenmuxUsageWindow.webContents.executeJavaScript(script, true);
    // ctoken 过期（API 返回非 JSON / 登录页）则清除缓存，下次会重新加载页面
    if (res?.loginRequired || res?.error) cachedCtoken = null;
    return res;
  } catch (error) {
    cachedCtoken = null;
    return { error: (error as Error).message, loginRequired: false };
  }
}

ipcMain.handle('open-zenmux-login', async () => {
  try {
    await ensureZenmuxUsageWindow(true);
    return true;
  } catch (error) {
    throw new Error((error as Error).message || '打开登录窗口失败');
  }
});

ipcMain.handle('fetch-zenmux-usage-browser', async () => {
  try {
    return await fetchZenmuxDashboardData();
  } catch (error) {
    throw new Error((error as Error).message || '同步数据失败');
  }
});

ipcMain.handle('fetch-zenmux-dashboard-data', async () => {
  try {
    return await fetchZenmuxDashboardData();
  } catch (error) {
    return { error: (error as Error).message, loginRequired: false };
  }
});

// --- Plugin System ---
ipcMain.handle('get-plugins', async () => {
  const pluginsDir = path.join(app.getPath('userData'), 'plugins');
  try {
    await fs.mkdir(pluginsDir, { recursive: true });
    const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(pluginsDir, entry.name, 'manifest.json');
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          plugins.push({
            ...manifest,
            dirPath: path.join(pluginsDir, entry.name),
            entryPath: path.join(pluginsDir, entry.name, manifest.entry)
          });
        } catch (e) {
          console.warn(`Failed to load plugin manifest for ${entry.name}`, e);
        }
      }
    }
    return plugins;
  } catch (e) {
    console.error('Failed to get plugins:', e);
    return [];
  }
});

ipcMain.handle('install-plugin', async () => {
  if (!mainWindow) return false;
  
  // 1. Select Folder
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择插件文件夹 (包含 manifest.json)'
  });

  if (result.canceled || result.filePaths.length === 0) return false;
  const sourceDir = result.filePaths[0];

  // 2. Validate Manifest
  try {
    const manifestPath = path.join(sourceDir, 'manifest.json');
    await fs.access(manifestPath);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    
    if (!manifest.id || !manifest.name || !manifest.entry) {
      throw new Error('Invalid manifest: missing id, name, or entry');
    }

    // 3. Copy to Plugins Dir
    const pluginsDir = path.join(app.getPath('userData'), 'plugins');
    const targetDir = path.join(pluginsDir, manifest.id);
    
    // Helper for recursive copy
    async function copyDir(src: string, dest: string) {
      await fs.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await copyDir(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }

    // Remove existing if any
    try {
        await fs.rm(targetDir, { recursive: true, force: true });
    } catch {}

    await copyDir(sourceDir, targetDir);
    return true;

  } catch (e) {
    console.error('Failed to install plugin:', e);
    dialog.showErrorBox('安装失败', `无法安装插件: ${(e as Error).message}`);
    return false;
  }
});

ipcMain.handle('delete-plugin', async (event, pluginId) => {
  try {
    const pluginsDir = path.join(app.getPath('userData'), 'plugins');
    const targetDir = path.join(pluginsDir, pluginId);
    await fs.rm(targetDir, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.error('Failed to delete plugin:', e);
    return false;
  }
});

// --- Terminal Logic ---
const ptyProcesses: Record<string, any> = {};

ipcMain.handle('terminal-create', (event, options) => {
  const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'] || '/bin/zsh';
  const id = options?.id || Math.random().toString(36).substring(7);
  
  if (ptyProcesses[id]) {
    try {
        ptyProcesses[id].kill();
    } catch(e) {}
  }

  try {
    // Use login shell to ensure user's profile (and PATH) is loaded
    const args = os.platform() === 'win32' ? [] : ['-l'];
    
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
        ...options?.env
      } as any
    });

    ptyProcess.onData((data: any) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-incoming-data', { id, data });
      }
    });

    ptyProcesses[id] = ptyProcess;
    return id;
  } catch (e) {
    console.error('Failed to spawn terminal:', e);
    return null;
  }
});

ipcMain.on('terminal-write', (event, { id, data }) => {
  if (ptyProcesses[id]) {
    ptyProcesses[id].write(data);
  }
});

ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
  if (ptyProcesses[id]) {
    try {
      ptyProcesses[id].resize(cols, rows);
    } catch (e) {
      console.error('Failed to resize terminal:', e);
    }
  }
});

ipcMain.on('terminal-close', (event, id) => {
  if (ptyProcesses[id]) {
    try {
      ptyProcesses[id].kill();
    } catch (e) {}
    delete ptyProcesses[id];
  }
});

// ==================== 应用数据文件存储 ====================
// 获取应用数据目录路径
function getAppDataDir(): string {
  return path.join(app.getPath('userData'), 'app-data');
}

// 确保应用数据目录存在
async function ensureAppDataDir(): Promise<void> {
  const dir = getAppDataDir();
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// IPC: 保存应用数据到文件
ipcMain.handle('save-app-data', async (_, key: string, data: any) => {
  try {
    await ensureAppDataDir();
    const filePath = path.join(getAppDataDir(), `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`Failed to save app data [${key}]:`, error);
    return false;
  }
});

// IPC: 读取应用数据文件
ipcMain.handle('load-app-data', async (_, key: string) => {
  try {
    const filePath = path.join(getAppDataDir(), `${key}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // 文件不存在时返回 null，不打印错误
    return null;
  }
});

// IPC: 检查应用数据文件是否存在
ipcMain.handle('app-data-exists', async (_, key: string) => {
  try {
    const filePath = path.join(getAppDataDir(), `${key}.json`);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

// ==================== 邮件发送功能 ====================
interface EmailConfig {
  enabled: boolean;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  recipient: string;
}

// 常用 SMTP 服务器 IP 映射（绕过 DNS 污染/代理劫持）
const SMTP_IP_MAP: Record<string, string[]> = {
  'smtp.qq.com': ['43.129.255.54', '43.137.210.144', '109.244.198.105'],
  'smtp.163.com': ['220.181.12.15', '123.126.97.79'],
  'smtp.126.com': ['220.181.12.15', '123.126.97.79'],
  'smtp.gmail.com': ['142.250.157.108', '142.250.157.109'],
  'smtp.outlook.com': ['52.98.154.2', '52.98.138.66'],
};

// 测试 IP 是否可连接
async function testConnection(host: string, port: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

// 获取可用的 SMTP 服务器地址
async function getSmtpHost(hostname: string, port: number): Promise<string> {
  const cleanHostname = hostname.trim().toLowerCase();

  // 如果有预设 IP，尝试连接
  const ips = SMTP_IP_MAP[cleanHostname];
  if (ips && ips.length > 0) {
    for (const ip of ips) {
      if (await testConnection(ip, port)) {
        return ip;
      }
    }
    // 即使测试失败，也使用第一个 IP（避免 DNS 查询）
    return ips[0];
  }
  return hostname;
}

// 创建邮件传输器
async function createTransporter(config: EmailConfig) {
  const host = await getSmtpHost(config.smtp.host, config.smtp.port);

  return nodemailer.createTransport({
    host: host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      rejectUnauthorized: false,
      servername: config.smtp.host,
    },
  } as nodemailer.TransportOptions);
}

// IPC: 发送邮件
ipcMain.handle('send-email', async (_, { config, subject, content }: { config: EmailConfig; subject: string; content: string }) => {
  try {
    const transporter = await createTransporter(config);

    await transporter.sendMail({
      from: config.smtp.user,
      to: config.recipient,
      subject: subject,
      html: content,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: (error as Error).message };
  }
});

// IPC: 测试邮件配置
ipcMain.handle('test-email-config', async (_, config: EmailConfig) => {
  try {
    const transporter = await createTransporter(config);
    await transporter.verify();

    await transporter.sendMail({
      from: config.smtp.user,
      to: config.recipient,
      subject: '[Guyue Master] 邮件配置测试',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #3b82f6;">邮件配置测试成功</h2>
          <p>如果你收到这封邮件，说明 SMTP 配置正确！</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            发送时间: ${new Date().toLocaleString('zh-CN')}
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error('Email config test failed:', error);
    return { success: false, error: (error as Error).message };
  }
});
