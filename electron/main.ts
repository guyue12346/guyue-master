import { app, BrowserWindow, ipcMain, shell, dialog, session, net } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';
import pty from 'node-pty';
import os from 'os';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { spawn, exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let zenmuxUsageWindow: BrowserWindow | null = null;
let aiStudioWindow: BrowserWindow | null = null;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// ── GPU 渲染稳定性修复 ──────────────────────────────────────────────────────
// macOS 上 Chromium 自动选图形后端时偶发 GPU 进程崩溃，导致彩虹干涉纹。
// 显式指定 Metal 后端并关闭 vsync 抖动可消除绝大多数此类异常。
if (isMac) {
  app.commandLine.appendSwitch('use-angle', 'metal');      // 显式使用 Metal 后端
  app.commandLine.appendSwitch('disable-gpu-vsync');        // 消除 vsync 时序导致的帧错位
  app.commandLine.appendSwitch('ignore-gpu-blocklist');     // 防止 Chromium 因驱动版本将 GPU 列入黑名单后退化为软渲染
}

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
      if (!win.isDestroyed()) {
        win.webContents.removeListener('did-finish-load', onFinish);
        win.webContents.removeListener('did-fail-load', onFail);
      }
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

// IPC: 获取文件修改时间戳（ms）
ipcMain.handle('get-file-mtime', async (_, filePath: string): Promise<number | null> => {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
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

        // 获取前 2 个月的月份字符串
        const prevMonths = [];
        for (let i = 1; i <= 2; i++) {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - i);
          prevMonths.push('' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0'));
        }

        const makePostBody = (month) => JSON.stringify({ queryDimension: 'BIZ_MTH', queryTime: month, apiKeys: [], modelSlugs: [] });
        const postOpts = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

        // 当月 + 历史月份并行调用
        const [r1, r2, r3, r4, r5, r6] = await Promise.all([
          fetch('/api/dashboard/usage/query?ctoken=' + ctoken, postOpts(makePostBody(ym))).then(r => r.text()).catch(() => ''),
          fetch('/api/dashboard/cost/query/cost?ctoken=' + ctoken, postOpts(makePostBody(ym))).then(r => r.text()).catch(() => ''),
          fetch('/api/payment/transtion/get_credits?ctoken=' + ctoken).then(r => r.text()).catch(() => ''),
          // 前一个月
          fetch('/api/dashboard/usage/query?ctoken=' + ctoken, postOpts(makePostBody(prevMonths[0]))).then(r => r.text()).catch(() => ''),
          fetch('/api/dashboard/cost/query/cost?ctoken=' + ctoken, postOpts(makePostBody(prevMonths[0]))).then(r => r.text()).catch(() => ''),
          // 前两个月
          fetch('/api/dashboard/cost/query/cost?ctoken=' + ctoken, postOpts(makePostBody(prevMonths[1]))).then(r => r.text()).catch(() => ''),
        ]);

        result.data = {};
        try { result.data.usage = JSON.parse(r1); } catch(e) {}
        try { result.data.costDetail = JSON.parse(r2); } catch(e) {}
        try { result.data.credits = JSON.parse(r3); } catch(e) {}
        // 历史月账单（含月份标识）
        const historyMonths = [];
        try { if (r4) historyMonths.push({ month: prevMonths[0], usage: JSON.parse(r4) }); } catch(e) {}
        try { if (r5) historyMonths[0] && (historyMonths[0].cost = JSON.parse(r5)); } catch(e) {}
        result.data.historyMonths = historyMonths;
        result.data.prevMonthCost = null;
        try { if (r6) { const c = JSON.parse(r6); result.data.prevMonthCost = { month: prevMonths[1], cost: c }; } } catch(e) {}
        result.data.prevMonths = prevMonths;

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

// --- AI Studio Usage ---

const AISTUDIO_URL = 'https://aistudio.google.com/apikey';

function createAIStudioWindow(showWindow = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: showWindow,
    title: 'Google AI Studio 登录',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:aistudio',
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  void win.loadURL(AISTUDIO_URL);

  win.on('closed', () => {
    if (aiStudioWindow === win) {
      aiStudioWindow = null;
    }
  });

  return win;
}

async function ensureAIStudioWindow(showWindow = false): Promise<BrowserWindow> {
  if (!aiStudioWindow || aiStudioWindow.isDestroyed()) {
    aiStudioWindow = createAIStudioWindow(showWindow);
  } else if (showWindow) {
    aiStudioWindow.show();
    aiStudioWindow.focus();
  }

  const currentUrl = aiStudioWindow.webContents.getURL();
  if (!currentUrl.includes('aistudio.google.com')) {
    void aiStudioWindow.loadURL(AISTUDIO_URL);
  }

  await waitForWindowLoad(aiStudioWindow);
  return aiStudioWindow;
}

async function fetchAIStudioData(projectId?: string): Promise<any> {
  if (!aiStudioWindow || aiStudioWindow.isDestroyed()) {
    aiStudioWindow = createAIStudioWindow(false);
  }

  // 加载 API Keys 页面
  const targetUrl = projectId
    ? `https://aistudio.google.com/api-keys?project=${encodeURIComponent(projectId)}`
    : AISTUDIO_URL;

  const currentUrl = aiStudioWindow.webContents.getURL();
  if (!currentUrl.includes('aistudio.google.com')) {
    void aiStudioWindow.loadURL(targetUrl);
    await waitForWindowLoad(aiStudioWindow);
  }

  // 确保在 apikey 页面
  if (!currentUrl.includes('/apikey') && !currentUrl.includes('/api-keys')) {
    void aiStudioWindow.loadURL(targetUrl);
    await waitForWindowLoad(aiStudioWindow);
  }

  // SPA 需要额外等待渲染
  await new Promise(r => setTimeout(r, 3000));

  // ── Step 1: 检查登录 + 抓取 API Keys ──
  const keysScript = `
    (async () => {
      const result = { loginRequired: false, error: null, keys: [], userEmail: '', projectId: null };
      try {
        const url = window.location.href;
        if (url.includes('accounts.google.com') || url.includes('/signin')) {
          result.loginRequired = true;
          return result;
        }
        const bodyText = (document.body && document.body.innerText) || '';
        if (bodyText.includes('Sign in') && bodyText.length < 3000) {
          result.loginRequired = true;
          return result;
        }

        await new Promise(r => setTimeout(r, 2000));

        const projectMatch = url.match(/project=([^&]+)/);
        result.projectId = projectMatch ? projectMatch[1] : null;

        const rows = document.querySelectorAll('tbody[role="rowgroup"] tr[role="row"]');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td[role="cell"]');
          if (cells.length < 4) return;

          const cell0 = cells[0];
          const keyStringEl = cell0.querySelector('ms-api-key-key-string');
          const keyHash = keyStringEl ? keyStringEl.textContent.trim() : '';
          const subheaderEl = cell0.querySelector('ms-api-key-subheader');
          let keyName = '';
          if (subheaderEl) {
            keyName = subheaderEl.textContent.trim();
          } else {
            keyName = cell0.textContent.trim().replace(keyHash, '').trim();
          }

          const cell1 = cells[1];
          const cell1Text = cell1.textContent.trim();
          const projMatch = cell1Text.match(/(gen-lang-client-\\d+)/);
          const keyProjectId = projMatch ? projMatch[1] : '';
          const keyId = cell1Text.replace(keyProjectId, '').trim();

          const createdDate = cells[2].textContent.trim();

          const tierEl = cells[3].querySelector('[data-test-quota-tier-text]');
          const quotaTier = tierEl ? tierEl.textContent.trim() : cells[3].textContent.trim();
          const billingBtn = cells[3].querySelector('[data-test-set-up-billing-link]');
          const needsBilling = !!billingBtn;

          result.keys.push({ keyHash, keyName, keyId, projectId: keyProjectId, createdDate, quotaTier, needsBilling });
        });

        const avatarBtn = document.querySelector('connect-avatar button');
        if (avatarBtn) result.userEmail = avatarBtn.textContent.trim();

        return result;
      } catch (error) {
        result.error = (error && error.message) || 'unknown-error';
        return result;
      }
    })();
  `;

  try {
    const keysResult = await aiStudioWindow.webContents.executeJavaScript(keysScript, true);
    if (keysResult?.loginRequired) {
      return { loginRequired: true, error: null, data: null, lastUpdated: Date.now() };
    }
    if (keysResult?.error) {
      return { error: keysResult.error, loginRequired: false, data: null, lastUpdated: Date.now() };
    }

    // ── Step 2: 按项目 ID 直接导航到 /spend?project=xxx 逐个抓取花费 ──
    const uniqueProjects = [...new Map(
      (keysResult.keys as any[]).filter(k => k.projectId).map((k: any) => [k.projectId, k])
    ).values()];

    const spendScript = `
      (function readCurrentSpend(projectName) {
        const tier = (document.querySelector('ms-quota-tier-badge') || {}).textContent?.trim() || '';
        const dashboard = document.querySelector('ms-billing-dashboard');
        const dashText = dashboard ? dashboard.innerText.trim() : '';
        const noBilling = dashText.includes('未设置结算信息') || !dashboard;

        let monthlyLimit = '';
        const limitMatch = dashText.match(/每月支出上限[\\s\\S]*?\\n\\s*([A-Z]{2,3}\\s*[\\d,.]+[^\\n]*)/);
        if (limitMatch) monthlyLimit = limitMatch[1].trim();

        const amounts = dashText.match(/(?:[A-Z]{2,3}|[$¥€£])\\s*[\\d,.]+/g) || [];

        let cost = '', savings = '', totalCost = '';
        const costMatch = dashText.match(/费用\\s*\\n\\s*((?:[A-Z]{2,3}|[$¥€£])\\s*[\\d,.]+)/);
        if (costMatch) cost = costMatch[1].trim();
        const savingsMatch = dashText.match(/节省的费用\\s*\\n\\s*((?:[A-Z]{2,3}|[$¥€£])\\s*[\\d,.]+)/);
        if (savingsMatch) savings = savingsMatch[1].trim();
        const totalMatch = dashText.match(/总费用\\s*\\n\\s*((?:[A-Z]{2,3}|[$¥€£])\\s*[\\d,.]+)/);
        if (totalMatch) totalCost = totalMatch[1].trim();

        let dateRange = '';
        const dateMatch = dashText.match(/\\(([A-Za-z]+ \\d+\\s*[-–]\\s*[A-Za-z]+ \\d+,?\\s*\\d{4})\\)/);
        if (dateMatch) dateRange = dateMatch[1];

        return { name: projectName, tier, noBilling, monthlyLimit, cost, savings, totalCost, dateRange, amounts };
      })
    `;

    const spendProjects: any[] = [];
    for (const proj of uniqueProjects) {
      void aiStudioWindow.loadURL(`https://aistudio.google.com/spend?project=${encodeURIComponent((proj as any).projectId)}`);
      await waitForWindowLoad(aiStudioWindow);
      await new Promise(r => setTimeout(r, 3000));
      try {
        const info = await aiStudioWindow.webContents.executeJavaScript(
          `(${spendScript})(${JSON.stringify((proj as any).keyName || (proj as any).projectId)})`, true
        );
        spendProjects.push(info);
      } catch { /* skip */ }
    }
    const spendResult = { projects: spendProjects };

    // ── Step 3: 按项目 ID 直接导航到 /usage?project=xxx 逐个抓取用量 ──
    const usageScript = `
      (function readCurrentUsage(projectName) {
        const tier = (document.querySelector('ms-quota-tier-badge') || {}).textContent?.trim() || '';
        const timeRange = (document.querySelector('ms-timerange-selector') || {}).textContent?.trim() || '';

        const sectionIds = [
          { id: 'overview', label: '概览' },
          { id: 'generate-content', label: '生成内容' },
          { id: 'generate-media', label: '生成媒体' },
          { id: 'embed-content', label: '嵌入内容' },
        ];

        const sections = [];
        for (const sec of sectionIds) {
          const el = document.querySelector('[data-test-id="' + sec.id + '-section"]');
          if (!el) continue;
          const sectionText = el.innerText || '';
          const noData = sectionText.includes('无可用数据');

          const charts = [];
          el.querySelectorAll('ms-dashboard-chart').forEach(ch => {
            const chText = ch.innerText || '';
            const lines = chText.split('\\n').map(l => l.trim()).filter(Boolean);
            const title = lines[0] || '';
            const chartNoData = chText.includes('无可用数据');
            const rangeMatch = chText.match(/数据值介于\\s*([^\\s]+)\\s*和\\s*([^\\s]+)\\s*之间/);
            const dataRange = rangeMatch ? { min: rangeMatch[1], max: rangeMatch[2] } : null;
            const legends = [];
            ch.querySelectorAll('ac-inline-legend ac-key').forEach(k => {
              const t = k.textContent?.trim();
              if (t && !legends.includes(t)) legends.push(t);
            });
            charts.push({ title, noData: chartNoData, dataRange, legends });
          });

          sections.push({ id: sec.id, label: sec.label, noData, charts });
        }

        return { name: projectName, tier, timeRange, sections };
      })
    `;

    const usageProjects: any[] = [];
    for (const proj of uniqueProjects) {
      void aiStudioWindow.loadURL(`https://aistudio.google.com/usage?project=${encodeURIComponent((proj as any).projectId)}`);
      await waitForWindowLoad(aiStudioWindow);
      await new Promise(r => setTimeout(r, 3000));
      try {
        const info = await aiStudioWindow.webContents.executeJavaScript(
          `(${usageScript})(${JSON.stringify((proj as any).keyName || (proj as any).projectId)})`, true
        );
        usageProjects.push(info);
      } catch { /* skip */ }
    }
    const usageResult = { projects: usageProjects };

    // ── 导航回 API Keys 页面 ──
    void aiStudioWindow.loadURL(AISTUDIO_URL);
    waitForWindowLoad(aiStudioWindow).catch(() => {});

    // ── 获取汇率（CNY 为基准）──
    let exchangeRates: Record<string, number> = {};
    try {
      const rateRes = await net.fetch('https://api.frankfurter.app/latest?from=CNY');
      if (rateRes.ok) {
        const rateData = await rateRes.json() as any;
        // rateData.rates: 1 CNY = X foreign, 反转得到 1 foreign = Y CNY
        for (const [currency, rate] of Object.entries(rateData.rates || {})) {
          exchangeRates[currency] = 1 / (rate as number);
        }
        exchangeRates['CNY'] = 1;
      }
    } catch { /* 汇率获取失败不影响主流程 */ }

    return {
      loginRequired: false,
      error: null,
      lastUpdated: Date.now(),
      data: {
        projectId: keysResult.projectId,
        keys: keysResult.keys,
        userEmail: keysResult.userEmail,
        spend: spendResult,
        usage: usageResult,
        exchangeRates,
      },
    };
  } catch (error) {
    return { error: (error as Error).message, loginRequired: false };
  }
}

ipcMain.handle('open-aistudio-login', async () => {
  try {
    await ensureAIStudioWindow(true);
    return true;
  } catch (error) {
    throw new Error((error as Error).message || '打开登录窗口失败');
  }
});

ipcMain.handle('fetch-aistudio-data', async (_event, params?: { projectId?: string }) => {
  try {
    return await fetchAIStudioData(params?.projectId);
  } catch (error) {
    return { error: (error as Error).message, loginRequired: false };
  }
});

// --- GCP Billing ---

function createGCPJWT(clientEmail: string, privateKey: string, scopes: string[]): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: scopes.join(' '),
  };
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${header}.${body}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

async function getGCPAccessToken(clientEmail: string, privateKey: string, scopes: string[]): Promise<string> {
  const jwt = createGCPJWT(clientEmail, privateKey, scopes);
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json() as any;
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token as string;
}

ipcMain.handle('fetch-gcp-billing-data', async (_, params: { serviceAccountJson: string; projectId: string; billingAccountId?: string }) => {
  try {
    const sa = JSON.parse(params.serviceAccountJson);
    const { client_email, private_key } = sa;
    if (!client_email || !private_key) throw new Error('无效的 Service Account JSON（缺少 client_email 或 private_key）');

    const scopes = [
      'https://www.googleapis.com/auth/monitoring.read',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/cloud-billing',
    ];
    const accessToken = await getGCPAccessToken(client_email, private_key, scopes);

    const projectId = params.projectId || sa.project_id;
    let billingAccountId = params.billingAccountId || '';

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // alignmentPeriod 必须不大于查询区间，否则 Monitoring API 返回空数据
    const intervalSeconds = Math.max(Math.floor((now.getTime() - startOfMonth.getTime()) / 1000), 3600);

    // 并行请求
    const headers = { Authorization: `Bearer ${accessToken}` };

    // 不带 resource.type 过滤，让 metric.type 单独匹配（兼容 Gemini/generativelanguage API）
    const monitoringUrl = `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?` +
      `filter=metric.type%3D%22serviceruntime.googleapis.com%2Fapi%2Frequest_count%22` +
      `&interval.startTime=${encodeURIComponent(startOfMonth.toISOString())}` +
      `&interval.endTime=${encodeURIComponent(now.toISOString())}` +
      `&aggregation.alignmentPeriod=${intervalSeconds}s` +
      `&aggregation.perSeriesAligner=ALIGN_SUM` +
      `&aggregation.crossSeriesReducer=REDUCE_SUM` +
      `&aggregation.groupByFields=resource.labels.service` +
      `&pageSize=50`;

    const billingInfoUrl = `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`;
    const resourceManagerUrl = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;

    const [monitoringResp, billingInfoResp, rmResp] = await Promise.all([
      fetch(monitoringUrl, { headers }).catch(() => null),
      fetch(billingInfoUrl, { headers }).catch(() => null),
      fetch(resourceManagerUrl, { headers }).catch(() => null),
    ]);

    const result: any = { lastUpdated: Date.now(), projectId };

    // 获取项目编号（用于预算过滤）
    try {
      const rmJson = await rmResp?.json() as any;
      if (rmJson?.projectNumber) result.projectNumber = rmJson.projectNumber;
    } catch {}

    // 正确处理监控 API 响应：区分权限错误和真正的无数据
    try {
      const monitoringJson = await monitoringResp?.json() as any;
      if (monitoringJson?.error) {
        result.monitoringError = monitoringJson.error; // { code, message, status }
      } else {
        result.monitoring = monitoringJson;
      }
    } catch {}
    try { result.billingInfo = await billingInfoResp?.json(); } catch {}

    // 从 billingInfo 自动提取 billingAccountId（格式：billingAccounts/XXXX-XXXX-XXXX）
    if (!billingAccountId && result.billingInfo?.billingAccountName) {
      billingAccountId = result.billingInfo.billingAccountName.replace('billingAccounts/', '');
    }

    // 获取预算数据 + 实际花费（通过 Cloud Monitoring billing 指标）
    if (billingAccountId) {
      // Budget API v1（stable）
      const budgetsUrl = `https://billingbudgets.googleapis.com/v1/billingAccounts/${billingAccountId}/budgets?pageSize=50`;
      const billingAccountUrl = `https://cloudbilling.googleapis.com/v1/billingAccounts/${billingAccountId}`;

      const [budgetsResp, baResp] = await Promise.all([
        fetch(budgetsUrl, { headers }).catch(() => null),
        fetch(billingAccountUrl, { headers }).catch(() => null),
      ]);

      try {
        const budgetsJson = await budgetsResp?.json() as any;
        if (budgetsJson?.error) {
          result.budgetsError = budgetsJson.error;
        } else {
          result.budgets = budgetsJson;
        }
      } catch {}

      try {
        result.billingAccount = await baResp?.json();
      } catch {}
    }

    return result;
  } catch (error) {
    return { error: (error as Error).message };
  }
});

/* ─── BigQuery 账单查询 ─── */
ipcMain.handle('query-bigquery-billing', async (_, params: {
  serviceAccountJson: string;
  projectId: string;
  bqTablePath: string;
  bqLocation?: string;
}) => {
  try {
    const sa = JSON.parse(params.serviceAccountJson);
    const { client_email, private_key } = sa;
    if (!client_email || !private_key) throw new Error('无效的 Service Account JSON');

    const scopes = [
      'https://www.googleapis.com/auth/bigquery.readonly',
      'https://www.googleapis.com/auth/cloud-platform',
    ];
    const accessToken = await getGCPAccessToken(client_email, private_key, scopes);

    // 执行查询的 GCP 项目（从表路径提取，或用配置的 projectId）
    const pathParts = params.bqTablePath.split('.');
    const jobProject = pathParts.length >= 2 ? pathParts[0] : params.projectId;

    // 本月花费 + 按月历史（近 3 个月）
    const currentMonthQuery = `
SELECT
  service.description AS service_name,
  SUM(cost) AS total_cost,
  currency
FROM \`${params.bqTablePath}\`
WHERE
  DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY service.description, currency
ORDER BY total_cost DESC
LIMIT 30`;

    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // 同步查询（超时 30s）
    const syncResp = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${jobProject}/queries`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: currentMonthQuery,
          useLegacySql: false,
          timeoutMs: 30000,
          ...(params.bqLocation ? { location: params.bqLocation } : {}),
        }),
      }
    );
    const syncJson = await syncResp.json() as any;
    if (syncJson?.error) {
      return { error: `BigQuery 查询失败（${syncJson.error.code}）：${syncJson.error.message}` };
    }

    // 解析行数据
    const parseRows = (json: any) => {
      const schema: any[] = json.schema?.fields ?? [];
      return (json.rows ?? []).map((row: any) => {
        const obj: Record<string, any> = {};
        (row.f ?? []).forEach((f: any, i: number) => { obj[schema[i]?.name] = f.v; });
        return obj;
      });
    };

    if (syncJson.jobComplete) {
      return { results: parseRows(syncJson), totalRows: syncJson.totalRows, lastUpdated: Date.now() };
    }

    // 未在 30s 内完成：轮询
    const jobId = syncJson.jobReference?.jobId;
    if (!jobId) return { error: '查询超时，无法继续轮询' };

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollResp = await fetch(
        `https://bigquery.googleapis.com/bigquery/v2/projects/${jobProject}/queries/${jobId}`,
        { headers }
      );
      const pollJson = await pollResp.json() as any;
      if (pollJson?.error) return { error: `BigQuery 轮询失败：${pollJson.error.message}` };
      if (pollJson.jobComplete) {
        return { results: parseRows(pollJson), totalRows: pollJson.totalRows, lastUpdated: Date.now() };
      }
    }
    return { error: '查询超时（40 秒），账单表可能较大或网络较慢，请稍后重试' };
  } catch (error) {
    return { error: (error as Error).message };
  }
});


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

// ─── Transporter 缓存（连接池复用，避免每次重建）───
let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransporterKey = '';

function getTransporterCacheKey(config: EmailConfig): string {
  return `${config.smtp.host}:${config.smtp.port}:${config.smtp.user}:${config.smtp.secure}`;
}

function buildTransporter(config: EmailConfig): nodemailer.Transporter {
  const port = config.smtp.port;
  // 智能判断 secure：465 端口强制 SSL，587/25 用 STARTTLS
  const secure = port === 465 ? true : port === 587 || port === 25 ? false : config.smtp.secure;

  return nodemailer.createTransport({
    host: config.smtp.host,
    port,
    secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      rejectUnauthorized: false,
      servername: config.smtp.host,
      minVersion: 'TLSv1.2',
    },
    // 连接池 & 超时
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    // 非 465 端口尝试 STARTTLS 升级
    ...(!secure && { requireTLS: false, opportunisticTLS: true }),
  } as any);
}

function getOrCreateTransporter(config: EmailConfig): nodemailer.Transporter {
  const key = getTransporterCacheKey(config);
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }
  // 配置变了，关闭旧连接池
  if (cachedTransporter) {
    try { cachedTransporter.close(); } catch { /* ignore */ }
  }
  cachedTransporter = buildTransporter(config);
  cachedTransporterKey = key;
  return cachedTransporter;
}

// ─── 带重试的发送 ───
async function sendMailWithRetry(
  config: EmailConfig,
  mailOptions: nodemailer.SendMailOptions,
  maxRetries = 2
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const transporter = getOrCreateTransporter(config);

      // 首次或重试时先 verify 连接是否存活
      if (attempt > 0) {
        try {
          await transporter.verify();
        } catch {
          // 连接已断开，重建 transporter
          cachedTransporter = null;
          cachedTransporterKey = '';
          const fresh = getOrCreateTransporter(config);
          await fresh.sendMail(mailOptions);
          return;
        }
      }

      await transporter.sendMail(mailOptions);
      return; // 成功，直接返回
    } catch (error) {
      lastError = error as Error;
      const msg = lastError.message || '';
      console.error(`[Email] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, msg);

      // 认证错误不重试
      if (msg.includes('Invalid login') || msg.includes('authentication') || msg.includes('AUTH')) {
        throw lastError;
      }

      // 连接类错误：销毁缓存，下次循环会重建
      if (
        msg.includes('socket') || msg.includes('ECONNR') || msg.includes('ETIMEDOUT') ||
        msg.includes('TLS') || msg.includes('disconnected') || msg.includes('EHOSTUNREACH')
      ) {
        try { cachedTransporter?.close(); } catch { /* ignore */ }
        cachedTransporter = null;
        cachedTransporterKey = '';
      }

      // 最后一次重试前等一下
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error('邮件发送失败（未知错误）');
}

// IPC: 发送邮件
ipcMain.handle('send-email', async (_, { config, subject, content }: { config: EmailConfig; subject: string; content: string }) => {
  try {
    await sendMailWithRetry(config, {
      from: `"${(config as any).senderName || '古月的Agent助理'}" <${config.smtp.user}>`,
      to: config.recipient,
      subject,
      html: content,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return { success: false, error: (error as Error).message };
  }
});

// IPC: 测试邮件配置
ipcMain.handle('test-email-config', async (_, config: EmailConfig) => {
  try {
    // 测试时强制重建 transporter，确保用最新配置
    cachedTransporter = null;
    cachedTransporterKey = '';

    const transporter = getOrCreateTransporter(config);
    await transporter.verify();

    await transporter.sendMail({
      from: `"${(config as any).senderName || '古月的Agent助理'}" <${config.smtp.user}>`,
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
    console.error('[Email] Config test failed:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Agent 网络搜索：使用 net.fetch 经由 Chromium 网络栈发起请求
// net.fetch 会继承 session.defaultSession 的代理设置，Node.js 原生 fetch 不会
ipcMain.handle('agent-web-search', async (_, { query }: { query: string }) => {
  try {
    const encoded = encodeURIComponent(query);
    // 使用 Bing RSS 接口，国内可直接访问；配置了代理的用户也可访问 Google 等
    const url = `https://www.bing.com/search?q=${encoded}&format=rss&setlang=zh-CN&count=10`;
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();

    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // 解析 Bing RSS XML
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([^<]*)<\/title>/;
    const linkRegex = /<link>([^<]+)<\/link>/;
    const descRegex = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([^<]*)<\/description>/;

    let m: RegExpExecArray | null;
    while ((m = itemRegex.exec(xml)) !== null && results.length < 8) {
      const block = m[1];
      const titleM = titleRegex.exec(block);
      const linkM  = linkRegex.exec(block);
      const descM  = descRegex.exec(block);
      const title   = (titleM?.[1] || titleM?.[2] || '').trim();
      const link    = (linkM?.[1] || '').trim();
      const snippet = (descM?.[1] || descM?.[2] || '').replace(/<[^>]+>/g, '').trim();
      if (title && link) {
        results.push({ title, url: link, snippet: snippet.substring(0, 300) });
      }
    }

    if (results.length === 0) {
      return { success: false, error: '未获得搜索结果，请检查网络或代理设置', results: [] };
    }

    return { success: true, results, query };
  } catch (e) {
    return { success: false, error: (e as Error).message, results: [] };
  }
});

// 代理设置：供渲染进程配置 HTTP 代理
ipcMain.handle('set-proxy', async (_, port: number | null) => {
  try {
    if (port && port > 0) {
      await session.defaultSession.setProxy({ proxyRules: `http://127.0.0.1:${port}` });
      console.log(`[Proxy] 已配置 HTTP 代理: 127.0.0.1:${port}`);
    } else {
      await session.defaultSession.setProxy({ proxyRules: 'direct://' });
      console.log('[Proxy] 已清除代理设置');
    }
    return { success: true };
  } catch (error) {
    console.error('[Proxy] 设置失败:', error);
    return { success: false, error: (error as Error).message };
  }
});

// ── LaTeX IPC Handlers ────────────────────────────────────────────────────────

/**
 * 在 macOS/Linux 上通过 login shell 执行 which，确保 PATH 包含
 * /Library/TeX/texbin（MacTeX）、/usr/local/bin 等用户配置路径。
 * Electron 进程直接启动时拿到的是精简版 PATH，不含这些目录。
 *
 * @param cmd     命令名（如 "xelatex"）
 * @param custom  用户手动指定的可执行文件绝对路径（非空时直接验证并返回）
 */
function which(cmd: string, custom?: string): Promise<string | null> {
  // 如果用户指定了自定义路径，直接验证其是否可执行
  if (custom && custom.trim()) {
    return new Promise((resolve) => {
      try {
        require('fs').accessSync(custom.trim(), require('fs').constants.X_OK);
        resolve(custom.trim());
      } catch {
        resolve(null); // 文件不存在或没有执行权限
      }
    });
  }

  return new Promise((resolve) => {
    const isWin32 = process.platform === 'win32';
    if (isWin32) {
      exec(`where "${cmd}"`, (err, stdout) => {
        if (err || !stdout.trim()) resolve(null);
        else resolve(stdout.trim().split('\n')[0].trim());
      });
    } else {
      // -l: login shell（加载 /etc/profile, ~/.bash_profile, /etc/paths 等）
      // -c: 执行命令
      exec(`bash -lc 'which "${cmd}"'`, (err, stdout) => {
        if (err || !stdout.trim()) {
          // fallback: 直接检查 MacTeX / TeX Live 常见安装路径
          const knownPaths = [
            `/Library/TeX/texbin/${cmd}`,
            `/usr/local/texlive/2024/bin/universal-darwin/${cmd}`,
            `/usr/local/texlive/2023/bin/universal-darwin/${cmd}`,
            `/usr/local/texlive/2022/bin/universal-darwin/${cmd}`,
            `/usr/texbin/${cmd}`,
          ];
          const found = knownPaths.find((p) => {
            try { require('fs').accessSync(p, require('fs').constants.X_OK); return true; } catch { return false; }
          });
          resolve(found ?? null);
        } else {
          resolve(stdout.trim().split('\n')[0].trim());
        }
      });
    }
  });
}

/** 检测 LaTeX 运行环境 */
ipcMain.handle('latex-check-env', async () => {
  const settings = await readLatexSettings();

  const [xelatex, pdflatex, lualatex, tlmgr, mpm] = await Promise.all([
    which('xelatex', settings.xelatexPath),
    which('pdflatex', settings.pdflatexPath),
    which('lualatex', settings.lualatexPath),
    which('tlmgr'),
    which('mpm'),
  ]);

  // 检测 ctex 宏包是否已安装（kpsewhich 是 TeX 发行版内置的文件查找工具）
  let ctexInstalled = false;
  if (xelatex || pdflatex || lualatex) {
    ctexInstalled = await new Promise<boolean>((resolve) => {
      // 同样用 login shell，确保 kpsewhich 可被找到
      const cmd = process.platform === 'win32'
        ? 'kpsewhich ctex.sty'
        : `bash -lc 'kpsewhich ctex.sty'`;
      exec(cmd, (err, stdout) => {
        resolve(!err && stdout.trim().length > 0);
      });
    });
  }

  return {
    xelatex,
    pdflatex,
    lualatex,
    tlmgr,
    mpm,
    ctexInstalled,
    platform: process.platform as 'darwin' | 'win32' | 'linux',
  };
});

/** 解析 LaTeX 编译日志，提取错误和警告 */
function parseLatexLog(log: string): { errors: any[]; warnings: any[] } {
  const errors: any[] = [];
  const warnings: any[] = [];

  const lines = log.split('\n');
  // 跟踪当前文件（TeX 日志中用括号表示文件入栈/出栈）
  const fileStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 错误：! 开头
    if (line.startsWith('!')) {
      const message = line.slice(1).trim();
      // 接下来尝试找行号（l.NNN 格式）
      let lineNum: number | undefined;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const lineMatch = lines[j].match(/^l\.(\d+)/);
        if (lineMatch) {
          lineNum = parseInt(lineMatch[1], 10);
          break;
        }
      }
      errors.push({
        type: 'error',
        message,
        file: fileStack[fileStack.length - 1],
        line: lineNum,
      });
    }

    // 警告：LaTeX Warning: / Package XXX Warning:
    const warnMatch = line.match(/^(?:LaTeX|Package \w+) Warning: (.+)/);
    if (warnMatch) {
      // 行号通常在同行末尾 "on input line NNN."
      const lineNumMatch = warnMatch[1].match(/on input line (\d+)\./);
      warnings.push({
        type: 'warning',
        message: warnMatch[1],
        file: fileStack[fileStack.length - 1],
        line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : undefined,
      });
    }

    // 追踪文件入栈（新文件）
    const newFileMatch = line.match(/\(([^()]+\.(?:tex|sty|cls|bib))/);
    if (newFileMatch) {
      fileStack.push(path.basename(newFileMatch[1]));
    }
    // 文件出栈
    if (line.includes(')')) {
      fileStack.pop();
    }
  }

  return { errors, warnings };
}

/** LaTeX 编译 */
ipcMain.handle('latex-compile', async (_, params: {
  content: string;
  engine: string;
  jobId: string;
}) => {
  const { content, engine, jobId } = params;
  const startTime = Date.now();

  // 在系统临时目录中创建每次编译独立的子目录
  const tmpDir = path.join(os.tmpdir(), `guyue-latex-${jobId}`);

  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const texFile = path.join(tmpDir, 'main.tex');
    await fs.writeFile(texFile, content, 'utf-8');

    // 读取用户自定义编译器路径设置
    const latexSettings = await readLatexSettings();
    const customPath = engine === 'xelatex'
      ? latexSettings.xelatexPath
      : engine === 'pdflatex'
      ? latexSettings.pdflatexPath
      : engine === 'lualatex'
      ? latexSettings.lualatexPath
      : '';

    const enginePath = await which(engine, customPath);
    if (!enginePath) {
      return {
        success: false,
        errors: [{
          type: 'error',
          message: `找不到编译器 "${engine}"。请在 LaTeX 设置中手动指定编译器路径，或安装 TeX 发行版（macOS: MacTeX，Windows: MiKTeX）。`,
        }],
        warnings: [],
        rawLog: '',
        duration: Date.now() - startTime,
      };
    }

    const pdfPath = path.join(tmpDir, 'main.pdf');

    // 编译参数：-interaction=nonstopmode 不交互，-halt-on-error 遇错停止
    const args = [
      `-interaction=nonstopmode`,
      `-halt-on-error`,
      `-output-directory=${tmpDir}`,
      texFile,
    ];

    const rawLog = await new Promise<string>((resolve) => {
      let output = '';

      // 补充 MacTeX / TeX Live 常见路径到 PATH，防止 Electron 启动时 PATH 不完整
      const extraPaths = process.platform !== 'win32'
        ? [
            '/Library/TeX/texbin',
            '/usr/local/texlive/2024/bin/universal-darwin',
            '/usr/local/texlive/2023/bin/universal-darwin',
            '/usr/local/texlive/2022/bin/universal-darwin',
            '/usr/texbin',
            '/usr/local/bin',
          ]
        : [];
      const envPATH = [...extraPaths, process.env.PATH ?? ''].join(':');

      const proc = spawn(enginePath, args, {
        cwd: tmpDir,
        env: { ...process.env, PATH: envPATH },
      });

      proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { output += data.toString(); });

      // 超时 60 秒自动杀进程
      const timeout = setTimeout(() => {
        proc.kill();
        output += '\n[Guyue] 编译超时（60s），已终止进程。\n';
        resolve(output);
      }, 60000);

      proc.on('close', () => {
        clearTimeout(timeout);
        resolve(output);
      });
    });

    const pdfExists = await fs.access(pdfPath).then(() => true).catch(() => false);
    const { errors, warnings } = parseLatexLog(rawLog);

    return {
      success: pdfExists,
      pdfPath: pdfExists ? pdfPath : undefined,
      errors,
      warnings,
      rawLog,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      errors: [{ type: 'error', message: (err as Error).message }],
      warnings: [],
      rawLog: '',
      duration: Date.now() - startTime,
    };
  }
});

/** 读取编译后的 PDF 为 base64（供 pdfjs 渲染） */
ipcMain.handle('latex-read-pdf', async (_, pdfPath: string) => {
  try {
    const buf = await fs.readFile(pdfPath);
    return buf.toString('base64');
  } catch {
    return null;
  }
});

/** 用 pdfjs-dist (Node.js legacy build) 提取 PDF 纯文本 — 主进程执行，无 Web Worker 问题 */
ipcMain.handle('extract-pdf-text', async (_, filePath: string): Promise<string | null> => {
  try {
    // Dynamic import: pdfjs legacy build works in Node.js without Web Worker
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    const data = new Uint8Array(await fs.readFile(filePath) as Buffer);
    const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false, disableAutoFetch: true, disableStream: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = (content.items as any[])
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) pages.push(`[第${i}页]\n${text}`);
    }
    return pages.join('\n\n') || null;
  } catch (e) {
    console.error('extract-pdf-text failed:', (e as Error).message);
    return null;
  }
});

// LaTeX 模板存储路径
function getLatexTemplatesPath(): string {
  return path.join(app.getPath('userData'), 'latex', 'templates.json');
}

/** 读取所有模板 */
ipcMain.handle('latex-get-templates', async () => {
  try {
    const p = getLatexTemplatesPath();
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) {
      // 首次使用时写入内置模板
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, JSON.stringify(BUILTIN_LATEX_TEMPLATES, null, 2), 'utf-8');
      return BUILTIN_LATEX_TEMPLATES;
    }
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return BUILTIN_LATEX_TEMPLATES;
  }
});

/** 保存（新增或更新）模板 */
ipcMain.handle('latex-save-template', async (_, template: any) => {
  try {
    const p = getLatexTemplatesPath();
    await fs.mkdir(path.dirname(p), { recursive: true });

    let templates: any[] = [];
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (exists) {
      const raw = await fs.readFile(p, 'utf-8');
      templates = JSON.parse(raw);
    } else {
      templates = [...BUILTIN_LATEX_TEMPLATES];
    }

    const idx = templates.findIndex((t: any) => t.id === template.id);
    if (idx >= 0) {
      templates[idx] = template;
    } else {
      templates.push(template);
    }

    await fs.writeFile(p, JSON.stringify(templates, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});

/** 删除模板 */
ipcMain.handle('latex-delete-template', async (_, id: string) => {
  try {
    const p = getLatexTemplatesPath();
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) return false;
    const raw = await fs.readFile(p, 'utf-8');
    const templates = JSON.parse(raw).filter((t: any) => t.id !== id);
    await fs.writeFile(p, JSON.stringify(templates, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});

/** 打开 .tex 文件 */
ipcMain.handle('latex-open-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 LaTeX 文件',
    filters: [{ name: 'LaTeX Files', extensions: ['tex'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { path: filePath, content };
});

/** 保存文件到指定路径 */
ipcMain.handle('latex-save-file', async (_, params: { filePath: string; content: string }) => {
  try {
    await fs.writeFile(params.filePath, params.content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

/** 另存为 */
 ipcMain.handle('latex-save-file-as', async (_, content: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存 LaTeX 文件',
    defaultPath: 'document.tex',
    filters: [{ name: 'LaTeX Files', extensions: ['tex'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, 'utf-8');
  return result.filePath;
});

// ── LaTeX 用户设置（编译器自定义路径）────────────────────────────────────────

const LATEX_SETTINGS_FILE = path.join(app.getPath('userData'), 'latex', 'settings.json');

const DEFAULT_LATEX_SETTINGS = {
  xelatexPath: '',
  pdflatexPath: '',
  lualatexPath: '',
  tlmgrPath: '',
};

async function readLatexSettings(): Promise<typeof DEFAULT_LATEX_SETTINGS> {
  try {
    const raw = await fs.readFile(LATEX_SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_LATEX_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LATEX_SETTINGS };
  }
}

ipcMain.handle('latex-get-settings', async () => {
  return readLatexSettings();
});

ipcMain.handle('latex-save-settings', async (_, settings: typeof DEFAULT_LATEX_SETTINGS) => {
  try {
    await fs.mkdir(path.dirname(LATEX_SETTINGS_FILE), { recursive: true });
    await fs.writeFile(LATEX_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});

/** 弹出文件选择对话框让用户手动定位编译器可执行文件 */
ipcMain.handle('latex-browse-executable', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 LaTeX 编译器可执行文件',
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: 'Executable', extensions: ['exe'] }]
      : [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: process.platform === 'win32'
      ? 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64'
      : '/Library/TeX/texbin',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

/** 安装 LaTeX 宏包 */
ipcMain.handle('latex-install-package', async (_, packageName: string) => {
  // 验证包名只含合法字符（字母、数字、连字符、下划线）
  if (!/^[a-zA-Z0-9_-]+$/.test(packageName)) {
    return { success: false, output: `无效的包名: "${packageName}"` };
  }

  const settings = await readLatexSettings();
  const tlmgrPath = await which('tlmgr', settings.tlmgrPath);
  if (!tlmgrPath) {
    return {
      success: false,
      output: '找不到 tlmgr（TeX Live 包管理器）。请在设置中手动指定 tlmgr 路径，或确认已安装 TeX Live。',
    };
  }

  return new Promise<{ success: boolean; output: string }>((resolve) => {
    let output = '';

    // 补充常见 TeX 路径到 PATH
    const extraPaths = process.platform !== 'win32'
      ? [
          '/Library/TeX/texbin',
          '/usr/local/texlive/2024/bin/universal-darwin',
          '/usr/local/texlive/2023/bin/universal-darwin',
          '/usr/local/bin',
        ]
      : [];
    const envPATH = [...extraPaths, process.env.PATH ?? ''].join(':');

    const proc = spawn(tlmgrPath, ['install', packageName], {
      env: { ...process.env, PATH: envPATH },
    });

    proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    const timeout = setTimeout(() => {
      proc.kill();
      output += '\n[Guyue] 安装超时（120s），已终止进程。\n';
      resolve({ success: false, output });
    }, 120000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        output: output || (code === 0 ? '安装成功' : `安装失败 (exit code: ${code})`),
      });
    });
  });
});

// ── 内置 LaTeX 模板 ───────────────────────────────────────────────────────────
const BUILTIN_LATEX_TEMPLATES = [
  {
    id: 'builtin-article-cn',
    name: '中文文章',
    description: '适合普通中文排版，使用 ctex 宏包，XeLaTeX 编译',
    category: 'article',
    createdAt: 0,
    updatedAt: 0,
    content: `\\documentclass[12pt, a4paper]{article}
\\usepackage{ctex}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{amsmath, amssymb}

\\geometry{left=2.5cm, right=2.5cm, top=2.5cm, bottom=2.5cm}

\\title{文章标题}
\\author{作者}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
这里是摘要内容。
\\end{abstract}

\\tableofcontents
\\newpage

\\section{引言}
这里是引言部分。

\\section{正文}
这里是正文内容。支持数学公式，例如：
\\begin{equation}
  E = mc^2
\\end{equation}

\\section{结论}
这里是结论。

\\end{document}
`,
  },
  {
    id: 'builtin-article-en',
    name: 'English Article',
    description: 'Standard English article template, pdfLaTeX',
    category: 'article',
    createdAt: 0,
    updatedAt: 0,
    content: `\\documentclass[12pt, a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{amsmath, amssymb}

\\geometry{margin=2.5cm}

\\title{Article Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Abstract goes here.
\\end{abstract}

\\tableofcontents
\\newpage

\\section{Introduction}
Introduction text here.

\\section{Main Content}
Content here. Inline math: $E = mc^2$. Display math:
\\begin{equation}
  \\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
\\end{equation}

\\section{Conclusion}
Conclusion here.

\\end{document}
`,
  },
  {
    id: 'builtin-beamer-cn',
    name: '中文演示文稿 (Beamer)',
    description: 'Beamer 幻灯片，中文支持，XeLaTeX 编译',
    category: 'beamer',
    createdAt: 0,
    updatedAt: 0,
    content: `\\documentclass[aspectratio=169]{beamer}
\\usepackage{ctex}
\\usepackage{amsmath}

\\usetheme{Madrid}
\\usecolortheme{default}

\\title{演示文稿标题}
\\subtitle{副标题}
\\author{作者}
\\institute{单位}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{目录}
  \\tableofcontents
\\end{frame}

\\section{第一节}
\\begin{frame}{第一节标题}
  \\begin{itemize}
    \\item 第一点
    \\item 第二点
    \\item 第三点
  \\end{itemize}
\\end{frame}

\\section{第二节}
\\begin{frame}{公式示例}
  Einstein's famous equation:
  \\begin{equation}
    E = mc^2
  \\end{equation}
\\end{frame}

\\end{document}
`,
  },
  {
    id: 'builtin-cv-cn',
    name: '简历（中文）',
    description: '简洁的中文简历模板',
    category: 'cv',
    createdAt: 0,
    updatedAt: 0,
    content: `\\documentclass[11pt, a4paper]{article}
\\usepackage{ctex}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}

\\geometry{left=2cm, right=2cm, top=1.8cm, bottom=1.8cm}
\\setlength{\\parindent}{0pt}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]

\\begin{document}

{\\LARGE\\bfseries 姓名}\\hfill
\\href{mailto:email@example.com}{email@example.com} \\quad
手机: 138-xxxx-xxxx

\\vspace{0.5em}

\\section{教育经历}
\\textbf{XX大学}\\hfill 2020 -- 2024 \\\\
计算机科学与技术，学士

\\section{工作经历}
\\textbf{公司名称} \\quad 软件工程师 \\hfill 2024.07 -- 至今
\\begin{itemize}[noitemsep, topsep=2pt]
  \\item 工作内容描述一
  \\item 工作内容描述二
\\end{itemize}

\\section{项目经历}
\\textbf{项目名称} \\hfill 2023
\\begin{itemize}[noitemsep, topsep=2pt]
  \\item 项目描述
\\end{itemize}

\\section{技能}
编程语言：Python, TypeScript, Java \\\\
工具：Git, Docker, Linux

\\end{document}
`,
  },
  {
    id: 'builtin-math-cn',
    name: '数学笔记',
    description: '适合数学公式密集的笔记，中文支持',
    category: 'article',
    createdAt: 0,
    updatedAt: 0,
    content: `\\documentclass[12pt, a4paper]{article}
\\usepackage{ctex}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{geometry}

\\geometry{margin=2.5cm}

% 定理环境
\\newtheorem{theorem}{定理}[section]
\\newtheorem{lemma}[theorem]{引理}
\\newtheorem{definition}{定义}[section]
\\newtheorem{example}{例}[section]

\\title{数学笔记}
\\author{}
\\date{}

\\begin{document}
\\maketitle

\\section{基本概念}

\\begin{definition}
  设 $f: X \\to Y$ 是一个映射，若对任意 $y \\in Y$，
  存在唯一 $x \\in X$ 使得 $f(x) = y$，则称 $f$ 为双射。
\\end{definition}

\\begin{theorem}
  \\label{thm:example}
  设 $f$ 连续，则 $f$ 可积。
\\end{theorem}

\\begin{proof}
  证明略。
\\end{proof}

\\begin{example}
  计算 $\\int_0^1 x^2 \\, dx$：
  \\[
    \\int_0^1 x^2 \\, dx = \\left[\\frac{x^3}{3}\\right]_0^1 = \\frac{1}{3}
  \\]
    \\end{example}

\\end{document}
`,
  },
];

// ── LaTeX 分类管理 ─────────────────────────────────────────────────────────────

/** 读取模板列表（内部辅助） */
async function readTemplates(): Promise<any[]> {
  const p = getLatexTemplatesPath();
  const exists = await fs.access(p).then(() => true).catch(() => false);
  if (!exists) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(BUILTIN_LATEX_TEMPLATES, null, 2), 'utf-8');
    return [...BUILTIN_LATEX_TEMPLATES];
  }
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8'));
  } catch {
    return [...BUILTIN_LATEX_TEMPLATES];
  }
}

async function writeTemplates(templates: any[]): Promise<void> {
  const p = getLatexTemplatesPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(templates, null, 2), 'utf-8');
}

/** 重命名分类（将所有该分类模板的 category 字段改为新名） */
ipcMain.handle('latex-rename-category', async (_, params: { oldName: string; newName: string }) => {
  try {
    const { oldName, newName } = params;
    if (!newName.trim() || oldName === newName) return false;
    const templates = await readTemplates();
    const updated = templates.map((t: any) =>
      t.category === oldName ? { ...t, category: newName.trim(), updatedAt: Date.now() } : t
    );
    await writeTemplates(updated);
    return true;
  } catch {
    return false;
  }
});

/** 删除分类（将该分类模板批量移到 moveToCategory） */
ipcMain.handle('latex-delete-category', async (_, params: { categoryName: string; moveToCategory: string }) => {
  try {
    const { categoryName, moveToCategory } = params;
    const templates = await readTemplates();
    const updated = templates.map((t: any) =>
      t.category === categoryName
        ? { ...t, category: moveToCategory || 'custom', updatedAt: Date.now() }
        : t
    );
    await writeTemplates(updated);
    return true;
  } catch {
    return false;
  }
});

// ── LaTeX 托管文件（userData/latex/files/）─────────────────────────────────────

function getLatexFilesDir(): string {
  return path.join(app.getPath('userData'), 'latex', 'files');
}

/** 列出托管目录中的所有 .tex 文件 */
ipcMain.handle('latex-list-files', async () => {
  try {
    const dir = getLatexFilesDir();
    await fs.mkdir(dir, { recursive: true });
    // Load category map
    let catMap: Record<string, string> = {};
    try { catMap = JSON.parse(await fs.readFile(getLatexFileCategoryMapPath(), 'utf-8')); } catch { /* empty */ }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(e => e.isFile() && e.name.endsWith('.tex'))
        .map(async e => {
          const filePath = path.join(dir, e.name);
          const stat = await fs.stat(filePath);
          return {
            name: e.name,
            path: filePath,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            category: catMap[filePath] || undefined,
          };
        })
    );
    return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [];
  }
});

/** 在托管目录新建一个 .tex 文件 */
ipcMain.handle('latex-new-managed-file', async (_, name: string) => {
  try {
    const dir = getLatexFilesDir();
    await fs.mkdir(dir, { recursive: true });
    // 确保文件名以 .tex 结尾
    const safeName = name.trim().endsWith('.tex') ? name.trim() : `${name.trim()}.tex`;
    // 避免同名冲突
    let finalName = safeName;
    let counter = 1;
    while (await fs.access(path.join(dir, finalName)).then(() => true).catch(() => false)) {
      const base = safeName.replace(/\.tex$/, '');
      finalName = `${base} (${counter++}).tex`;
    }
    const filePath = path.join(dir, finalName);
    const defaultContent = `\\documentclass[12pt, a4paper]{ctexart}\n\n\\title{${finalName.replace(/\.tex$/, '')}}\n\\author{}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\\section{正文}\n\n\\end{document}\n`;
    await fs.writeFile(filePath, defaultContent, 'utf-8');
    return { path: filePath, content: defaultContent };
  } catch {
    return null;
  }
});

/** 读取托管文件内容 */
ipcMain.handle('latex-open-managed-file', async (_, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { path: filePath, content };
  } catch {
    return null;
  }
});

/** 保存托管文件 */
ipcMain.handle('latex-save-managed-file', async (_, params: { filePath: string; content: string }) => {
  try {
    await fs.writeFile(params.filePath, params.content, 'utf-8');
    return true;
  } catch {
    return false;
  }
});

/** 重命名托管文件，返回新路径 */
ipcMain.handle('latex-rename-managed-file', async (_, params: { filePath: string; newName: string }) => {
  try {
    const { filePath, newName } = params;
    const dir = path.dirname(filePath);
    const safeName = newName.trim().endsWith('.tex') ? newName.trim() : `${newName.trim()}.tex`;
    const newPath = path.join(dir, safeName);
    if (newPath === filePath) return filePath;
    await fs.rename(filePath, newPath);
    return newPath;
  } catch {
    return null;
  }
});

/** 删除托管文件 */
ipcMain.handle('latex-delete-managed-file', async (_, filePath: string) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
});

// ─── LaTeX 文件分类 ───────────────────────────────────────────────────────────

function getLatexFileCategoriesPath(): string {
  return path.join(app.getPath('userData'), 'latex', 'file-categories.json');
}

function getLatexFileCategoryMapPath(): string {
  return path.join(app.getPath('userData'), 'latex', 'file-category-map.json');
}

ipcMain.handle('latex-get-file-categories', async () => {
  try {
    const p = getLatexFileCategoriesPath();
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
});

ipcMain.handle('latex-save-file-categories', async (_, categories: any[]) => {
  try {
    const p = getLatexFileCategoriesPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(categories, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('latex-get-file-category-map', async () => {
  try {
    const p = getLatexFileCategoryMapPath();
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
});

ipcMain.handle('latex-set-file-category', async (_, params: { filePath: string; categoryId: string }) => {
  try {
    const p = getLatexFileCategoryMapPath();
    let map: Record<string, string> = {};
    try { map = JSON.parse(await fs.readFile(p, 'utf-8')); } catch { /* empty */ }
    map[params.filePath] = params.categoryId;
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(map, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
});
