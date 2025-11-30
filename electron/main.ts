import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import pty from 'node-pty';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS 风格标题栏
    trafficLightPosition: { x: 15, y: 15 }, // 红绿灯位置
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true, // Enable webview tag
    },
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

