import { app, BrowserWindow, ipcMain, shell, dialog, session, net } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { fileURLToPath } from 'url';
import pty from 'node-pty';
import os from 'os';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { spawn, exec, execFile } from 'child_process';
import { createSign } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';
const DEV_SERVER_URL = 'http://localhost:3001';

if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Guyue Master Dev'));
}

let mainWindow: BrowserWindow | null = null;
const codexUsageWindows = new Map<string, BrowserWindow>();
let aiStudioWindow: BrowserWindow | null = null;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

function writeDiagnosticLog(message: string, payload?: unknown) {
  const suffix = payload === undefined
    ? ''
    : ` ${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}`;
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;

  try {
    console.log(line.trim());
  } catch {
    // Ignore console write failures in packaged apps launched from Finder.
  }

  try {
    const logPath = path.join(app.getPath('userData'), 'diagnostics.log');
    fsSync.mkdirSync(path.dirname(logPath), { recursive: true });
    fsSync.appendFileSync(logPath, line);
  } catch {
    // Diagnostics must never break app startup.
  }
}

ipcMain.on('renderer-diagnostic', (_event, payload) => {
  writeDiagnosticLog('renderer:diagnostic', payload);
});

// ── GPU 渲染稳定性修复 ──────────────────────────────────────────────────────
// macOS 上 Chromium 自动选图形后端时偶发 GPU 进程崩溃，导致彩虹干涉纹。
// 显式指定 Metal 后端并关闭 vsync 抖动可消除绝大多数此类异常。
if (isMac) {
  app.commandLine.appendSwitch('use-angle', 'metal');      // 显式使用 Metal 后端
  app.commandLine.appendSwitch('disable-gpu-vsync');        // 消除 vsync 时序导致的帧错位
  app.commandLine.appendSwitch('ignore-gpu-blocklist');     // 防止 Chromium 因驱动版本将 GPU 列入黑名单后退化为软渲染
}

function createWindow() {
  writeDiagnosticLog('createWindow:start', {
    isDev,
    userData: app.getPath('userData'),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });

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
    writeDiagnosticLog('window:ready-to-show');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-start-loading', () => {
    writeDiagnosticLog('webContents:did-start-loading', mainWindow?.webContents.getURL());
  });

  mainWindow.webContents.on('dom-ready', () => {
    writeDiagnosticLog('webContents:dom-ready', mainWindow?.webContents.getURL());
  });

  mainWindow.webContents.on('did-finish-load', () => {
    writeDiagnosticLog('webContents:did-finish-load', mainWindow?.webContents.getURL());
  });

  // 加载失败时的处理
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeDiagnosticLog('webContents:did-fail-load', {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
    // 开发环境下可能是 Vite 还没启动，尝试重新加载
    if (isDev && errorCode === -102) { // ERR_CONNECTION_REFUSED
      setTimeout(() => {
        mainWindow?.loadURL(DEV_SERVER_URL);
      }, 1000);
    }
  });

  // 渲染进程崩溃时的处理
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeDiagnosticLog('webContents:render-process-gone', details);
    if (details.reason === 'crashed') {
      // 尝试重新加载页面
      mainWindow?.reload();
    }
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeDiagnosticLog('webContents:preload-error', {
      preloadPath,
      message: error.message,
      stack: error.stack,
    });
  });

  mainWindow.on('unresponsive', () => {
    writeDiagnosticLog('window:unresponsive');
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const type = level >= 2 ? 'error' : 'log';
    console[type](`[renderer:${level}] ${message} (${sourceId}:${line})`);
    if (level >= 2) {
      writeDiagnosticLog('renderer:console-message', {
        level,
        message,
        line,
        sourceId,
      });
    }
  });

  // 开发环境加载 Vite 开发服务器
  if (isDev) {
    writeDiagnosticLog('loadURL', DEV_SERVER_URL);
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools(); // 自动打开开发者工具
  } else {
    // 生产环境加载打包后的文件
    const indexPath = path.join(__dirname, '../dist/index.html');
    writeDiagnosticLog('loadFile', indexPath);
    mainWindow.loadFile(indexPath);
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
    writeDiagnosticLog('window:closed');
    mainWindow = null;
  });
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

interface GitRunResult {
  stdout: string;
  stderr: string;
}

interface GitFileStatus {
  path: string;
  originalPath?: string;
  index: string;
  workingTree: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflict: boolean;
  status: string;
}

interface GitRepoSummary {
  path: string;
  name: string;
}

interface GitRemote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}

const GIT_SCAN_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'release',
  'build',
  'out',
  '.cache',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  'Library',
]);

function runGit(args: string[], cwd?: string, timeoutMs = 20000): Promise<GitRunResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        LC_ALL: 'C',
      },
    }, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr || error.message || 'Git command failed').trim();
        reject(new Error(message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function resolveGitRoot(inputPath: string): Promise<string> {
  const absolutePath = path.resolve(inputPath);
  const { stdout } = await runGit(['rev-parse', '--show-toplevel'], absolutePath, 10000);
  return stdout.trim();
}

function getRepoName(repoPath: string): string {
  return path.basename(repoPath) || repoPath;
}

function ensureRelativeGitPath(repoPath: string, filePath: string): string {
  if (!filePath || filePath.includes('\0')) {
    throw new Error('文件路径无效');
  }

  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  const relative = path.relative(repoPath, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('文件不在当前 Git 仓库内');
  }
  return relative;
}

function parseStatusBranch(line: string) {
  const raw = line.slice(3).trim();
  const ahead = Number(raw.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(raw.match(/behind (\d+)/)?.[1] ?? 0);
  let branch = raw;
  let upstream: string | null = null;

  if (raw.includes('...')) {
    const [left, right = ''] = raw.split('...');
    branch = left.trim();
    upstream = right.replace(/\s+\[.*\]$/, '').trim() || null;
  } else {
    branch = raw.replace(/\s+\[.*\]$/, '').trim();
  }

  if (branch.startsWith('No commits yet on ')) {
    branch = branch.replace('No commits yet on ', '').trim();
  }

  return { branch: branch || 'HEAD', upstream, ahead, behind };
}

function gitStatusLabel(index: string, workingTree: string, pathValue: string): string {
  const pair = `${index}${workingTree}`;
  if (index === '?' && workingTree === '?') return 'U';
  if (index === 'R' || pathValue.includes(' -> ')) return 'R';
  if (index === 'A' || workingTree === 'A') return 'A';
  if (index === 'D' || workingTree === 'D') return 'D';
  if (pair.includes('U') || ['AA', 'DD'].includes(pair)) return '!';
  if (index === 'M' || workingTree === 'M') return 'M';
  return pair.trim() || 'M';
}

function parseGitStatus(stdout: string): {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
} {
  let branch = 'HEAD';
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFileStatus[] = [];

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('## ')) {
      const parsed = parseStatusBranch(line);
      branch = parsed.branch;
      upstream = parsed.upstream;
      ahead = parsed.ahead;
      behind = parsed.behind;
      continue;
    }

    const index = line[0] || ' ';
    const workingTree = line[1] || ' ';
    const rawPath = line.slice(3);
    const renameParts = rawPath.includes(' -> ') ? rawPath.split(' -> ') : null;
    const filePath = renameParts ? renameParts[renameParts.length - 1] : rawPath;
    const originalPath = renameParts ? renameParts.slice(0, -1).join(' -> ') : undefined;
    const untracked = index === '?' && workingTree === '?';
    const conflict = index === 'U' || workingTree === 'U' || ['AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(`${index}${workingTree}`);
    const staged = !untracked && index !== ' ' && index !== '!';
    const unstaged = untracked || workingTree !== ' ';

    files.push({
      path: filePath,
      originalPath,
      index,
      workingTree,
      staged,
      unstaged,
      untracked,
      conflict,
      status: gitStatusLabel(index, workingTree, rawPath),
    });
  }

  return { branch, upstream, ahead, behind, files };
}

function parseGitRemotes(stdout: string): GitRemote[] {
  const remoteMap = new Map<string, GitRemote>();

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/);
    if (!match) continue;

    const [, name, url, kind] = match;
    const current = remoteMap.get(name) || { name };
    if (kind === 'fetch') current.fetchUrl = url;
    if (kind === 'push') current.pushUrl = url;
    remoteMap.set(name, current);
  }

  return [...remoteMap.values()];
}

async function getGitStatus(repoPath: string) {
  const root = await resolveGitRoot(repoPath);
  const [{ stdout }, stashResult, headResult, remoteResult] = await Promise.all([
    runGit(['status', '--porcelain=v1', '-b', '--untracked-files=all'], root),
    runGit(['stash', 'list'], root).catch(() => ({ stdout: '', stderr: '' })),
    runGit(['rev-parse', '--short', 'HEAD'], root).catch(() => ({ stdout: '', stderr: '' })),
    runGit(['remote', '-v'], root).catch(() => ({ stdout: '', stderr: '' })),
  ]);
  const parsed = parseGitStatus(stdout);
  const remotes = parseGitRemotes(remoteResult.stdout);
  const upstreamRemoteName = parsed.upstream?.split('/')[0] || null;
  const defaultRemote =
    remotes.find(remote => remote.name === upstreamRemoteName)
    || remotes.find(remote => remote.name === 'origin')
    || remotes[0]
    || null;

  return {
    path: root,
    name: getRepoName(root),
    branch: parsed.branch,
    upstream: parsed.upstream,
    upstreamRemoteName,
    upstreamBranch: parsed.upstream?.split('/').slice(1).join('/') || null,
    remotes,
    defaultRemote,
    ahead: parsed.ahead,
    behind: parsed.behind,
    headHash: headResult.stdout.trim() || null,
    stashCount: stashResult.stdout.trim() ? stashResult.stdout.trim().split('\n').length : 0,
    clean: parsed.files.length === 0,
    files: parsed.files,
    updatedAt: Date.now(),
  };
}

async function discoverGitRepositories(rootPath: string, maxDepth = 5): Promise<GitRepoSummary[]> {
  const root = path.resolve(rootPath);
  const found = new Map<string, GitRepoSummary>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || found.size >= 200) return;

    try {
      const dotGitPath = path.join(dir, '.git');
      const dotGitStat = await fs.stat(dotGitPath).catch(() => null);
      if (dotGitStat) {
        try {
          const gitRoot = await resolveGitRoot(dir);
          found.set(gitRoot, { path: gitRoot, name: getRepoName(gitRoot) });
        } catch {
          found.set(dir, { path: dir, name: getRepoName(dir) });
        }
        return;
      }

      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries
        .filter(entry => entry.isDirectory() && !GIT_SCAN_SKIP_DIRS.has(entry.name))
        .map(entry => walk(path.join(dir, entry.name), depth + 1)));
    } catch {
      // Ignore unreadable directories during broad scans.
    }
  }

  await walk(root, 0);
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function parseGitLog(stdout: string) {
  return stdout
    .split('\x1e')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [hash, shortHash, parents, refs, author, date, ...subjectParts] = record.split('\x1f');
      return {
        hash,
        shortHash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs ? refs.split(',').map(ref => ref.trim()).filter(Boolean) : [],
        author,
        date,
        subject: subjectParts.join('\x1f') || '(no subject)',
      };
    });
}

async function getGitLog(repoPath: string, limit = 80) {
  const root = await resolveGitRoot(repoPath);
  const safeLimit = String(Math.max(1, Math.min(Number(limit) || 80, 300)));
  const { stdout } = await runGit([
    'log',
    '--all',
    '--topo-order',
    `--max-count=${safeLimit}`,
    '--date=iso-strict',
    '--pretty=format:%H%x1f%h%x1f%P%x1f%D%x1f%an%x1f%ad%x1f%s%x1e',
  ], root);

  return parseGitLog(stdout);
}

// Codex / ChatGPT 登录窗口
const CODEX_USAGE_PAGE_URL = 'https://chatgpt.com/codex';
const CODEX_USAGE_PARTITION_PREFIX = 'persist:codex-usage';

function normalizeCodexProfileId(profileId?: string) {
  const trimmed = String(profileId || '').trim();
  if (!trimmed) return 'default';
  return trimmed.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function getCodexUsagePartition(profileId?: string) {
  return `${CODEX_USAGE_PARTITION_PREFIX}:${normalizeCodexProfileId(profileId)}`;
}

function shouldHandleCodexPopupInApp(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    return [
      'chatgpt.com',
      'auth.openai.com',
      'openai.com',
      'accounts.google.com',
      'appleid.apple.com',
      'login.live.com',
      'microsoftonline.com',
      'github.com',
    ].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function createCodexUsageWindow(profileId?: string, showWindow = true): BrowserWindow {
  const normalizedProfileId = normalizeCodexProfileId(profileId);
  const partition = getCodexUsagePartition(normalizedProfileId);
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: showWindow,
    title: `Codex 登录 · ${normalizedProfileId}`,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldHandleCodexPopupInApp(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            partition,
          },
        },
      };
    }

    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  void win.loadURL(CODEX_USAGE_PAGE_URL);

  win.on('closed', () => {
    if (codexUsageWindows.get(normalizedProfileId) === win) {
      codexUsageWindows.delete(normalizedProfileId);
    }
  });

  return win;
}

async function ensureCodexUsageWindow(profileId?: string, showWindow = false): Promise<BrowserWindow> {
  const normalizedProfileId = normalizeCodexProfileId(profileId);
  let win = codexUsageWindows.get(normalizedProfileId) ?? null;

  if (!win || win.isDestroyed()) {
    win = createCodexUsageWindow(normalizedProfileId, showWindow);
    codexUsageWindows.set(normalizedProfileId, win);
  } else if (showWindow) {
    win.show();
    win.focus();
  }

  const currentUrl = win.webContents.getURL();
  if (!currentUrl.includes('chatgpt.com/codex') && !currentUrl.includes('auth.openai.com')) {
    void win.loadURL(CODEX_USAGE_PAGE_URL);
  }

  await waitForWindowLoad(win);
  return win;
}

function normalizeCodexWindow(raw: any) {
  if (!raw || typeof raw !== 'object') return null;

  const usedPercent = Number(raw.used_percent ?? raw.usedPercent ?? 0);
  const limitWindowSeconds = Number(raw.limit_window_seconds ?? raw.limitWindowSeconds ?? 0);
  const resetAt = Number(raw.reset_at ?? raw.resetsAt ?? 0);
  const hasData =
    Number.isFinite(usedPercent) ||
    (Number.isFinite(limitWindowSeconds) && limitWindowSeconds > 0) ||
    (Number.isFinite(resetAt) && resetAt > 0);

  if (!hasData) return null;

  return {
    usedPercent: Number.isFinite(usedPercent) ? usedPercent : 0,
    windowMinutes: Number.isFinite(limitWindowSeconds) && limitWindowSeconds > 0
      ? Math.round(limitWindowSeconds / 60)
      : null,
    resetsAt: Number.isFinite(resetAt) && resetAt > 0 ? resetAt : null,
  };
}

function normalizeCodexCredits(raw: any) {
  if (!raw || typeof raw !== 'object') return null;

  const hasCredits = Boolean(raw.has_credits ?? raw.hasCredits ?? false);
  const unlimited = Boolean(raw.unlimited ?? false);
  const balance =
    raw.balance === undefined || raw.balance === null ? null : String(raw.balance);

  if (!hasCredits && !unlimited && !balance) return null;

  return {
    hasCredits,
    unlimited,
    balance,
  };
}

function parseCodexHeaderNumber(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseCodexHeaderString(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value ? value : null;
}

function parseCodexHeaderBoolean(headers: Headers, name: string) {
  const raw = parseCodexHeaderString(headers, name)?.toLowerCase();
  if (!raw) return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function normalizeCodexWindowFromHeaders(headers: Headers, prefix: string) {
  const usedPercent = parseCodexHeaderNumber(headers, `${prefix}-used-percent`);
  const windowMinutes = parseCodexHeaderNumber(headers, `${prefix}-window-minutes`);
  const resetsAt = parseCodexHeaderNumber(headers, `${prefix}-reset-at`);

  if (usedPercent === null && windowMinutes === null && resetsAt === null) {
    return null;
  }

  return {
    usedPercent: usedPercent ?? 0,
    windowMinutes,
    resetsAt,
  };
}

type CodexUsageMeta = {
  source: string;
  endpoint?: string;
  currentUrl?: string;
  lastUpdated?: number;
  fallbackPlanType?: string | null;
  accountId?: string | null;
  accountEmail?: string | null;
  accountName?: string | null;
};

function normalizeCodexUsageHeaders(
  headers: Headers,
  meta: CodexUsageMeta
) {
  const primary = normalizeCodexWindowFromHeaders(headers, 'x-codex-primary');
  const secondary = normalizeCodexWindowFromHeaders(headers, 'x-codex-secondary');

  const hasCredits = parseCodexHeaderBoolean(headers, 'x-codex-credits-has-credits');
  const unlimited = parseCodexHeaderBoolean(headers, 'x-codex-credits-unlimited');
  const balance = parseCodexHeaderString(headers, 'x-codex-credits-balance');
  const credits = hasCredits !== null || unlimited !== null || balance
    ? {
        hasCredits: hasCredits ?? false,
        unlimited: unlimited ?? false,
        balance,
      }
    : null;

  const limitPrefixes = new Set<string>();
  for (const [name] of headers.entries()) {
    const lower = name.toLowerCase();
    if (lower.endsWith('-primary-used-percent')) {
      limitPrefixes.add(lower.slice(0, -'-primary-used-percent'.length));
    }
  }

  const additionalLimits = [...limitPrefixes]
    .filter(prefix => prefix !== 'x-codex')
    .map(prefix => {
      const parsedPrimary = normalizeCodexWindowFromHeaders(headers, `${prefix}-primary`);
      const parsedSecondary = normalizeCodexWindowFromHeaders(headers, `${prefix}-secondary`);
      if (!parsedPrimary && !parsedSecondary) return null;

      return {
        limitId: prefix.replace(/^x-/, '').replace(/-/g, '_'),
        limitName: parseCodexHeaderString(headers, `${prefix}-limit-name`),
        primary: parsedPrimary,
        secondary: parsedSecondary,
      };
    })
    .filter(Boolean);

  const planType = parseCodexHeaderString(headers, 'x-codex-plan-type') ?? meta.fallbackPlanType ?? null;

  if (!primary && !secondary && !credits && additionalLimits.length === 0 && !planType) {
    return null;
  }

  return {
    category: 'Codex' as const,
    planType,
    primary,
    secondary,
    credits,
    additionalLimits,
    accountId: meta.accountId ?? null,
    accountEmail: meta.accountEmail ?? null,
    accountName: meta.accountName ?? null,
    currentUrl: meta.currentUrl,
    endpoint: meta.endpoint,
    lastUpdated: meta.lastUpdated ?? Date.now(),
    source: meta.source,
    loginRequired: false,
    error: null,
  };
}

function normalizeCodexUsagePayload(
  payload: any,
  meta: CodexUsageMeta
) {
  const primary = normalizeCodexWindow(payload?.rate_limit?.primary_window ?? payload?.rateLimit?.primaryWindow);
  const secondary = normalizeCodexWindow(payload?.rate_limit?.secondary_window ?? payload?.rateLimit?.secondaryWindow);
  const credits = normalizeCodexCredits(payload?.credits);

  const additionalLimits = Array.isArray(payload?.additional_rate_limits)
    ? payload.additional_rate_limits
        .map((entry: any, index: number) => {
          const limitId = String(entry?.metered_feature ?? entry?.limit_name ?? `codex_additional_${index}`);
          const limitName = entry?.limit_name ? String(entry.limit_name) : null;
          const limitPayload = entry?.rate_limit ?? entry?.rateLimit ?? null;
          const additionalPrimary = normalizeCodexWindow(limitPayload?.primary_window ?? limitPayload?.primaryWindow);
          const additionalSecondary = normalizeCodexWindow(limitPayload?.secondary_window ?? limitPayload?.secondaryWindow);

          if (!additionalPrimary && !additionalSecondary) return null;

          return {
            limitId,
            limitName,
            primary: additionalPrimary,
            secondary: additionalSecondary,
          };
        })
        .filter(Boolean)
    : [];

  return {
    category: 'Codex' as const,
    planType:
      typeof payload?.plan_type === 'string'
        ? payload.plan_type
        : typeof payload?.planType === 'string'
          ? payload.planType
          : meta.fallbackPlanType ?? null,
    primary,
    secondary,
    credits,
    additionalLimits,
    accountId: meta.accountId ?? null,
    accountEmail: meta.accountEmail ?? null,
    accountName: meta.accountName ?? null,
    currentUrl: meta.currentUrl,
    endpoint: meta.endpoint,
    lastUpdated: meta.lastUpdated ?? Date.now(),
    source: meta.source,
    loginRequired: false,
    error: null,
  };
}

function buildCodexUsageEndpointCandidates(baseUrl?: string): string[] {
  const baseCandidates = baseUrl
    ? [baseUrl]
    : ['https://chatgpt.com/backend-api', 'https://chatgpt.com/backend-api/codex'];

  const endpoints = baseCandidates
    .map(value => value.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map(value => {
      if (value.endsWith('/wham/usage') || value.endsWith('/api/codex/usage')) {
        return value;
      }
      return value.includes('/backend-api') ? `${value}/wham/usage` : `${value}/api/codex/usage`;
    });

  return [...new Set(endpoints)];
}

async function fetchCodexUsageWithToken(params: { sessionToken: string; accountId?: string; baseUrl?: string }) {
  const token = params.sessionToken?.trim();
  if (!token) {
    throw new Error('sessionToken 不能为空');
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    origin: 'https://chatgpt.com',
    referer: CODEX_USAGE_PAGE_URL,
    'user-agent': 'Guyue Master',
  };

  if (params.accountId?.trim()) {
    headers['ChatGPT-Account-Id'] = params.accountId.trim();
  }

  let lastError = 'Codex usage 接口不可用';

  for (const endpoint of buildCodexUsageEndpointCandidates(params.baseUrl)) {
    try {
      const response = await fetch(endpoint, { headers });
      const bodyText = await response.text();

      if (!response.ok) {
        lastError = `GET ${endpoint} 失败: ${response.status} ${bodyText.slice(0, 160)}`;
        continue;
      }

      const normalizedFromHeaders = normalizeCodexUsageHeaders(response.headers, {
        source: 'chatgpt-token',
        endpoint,
        lastUpdated: Date.now(),
      });
      if (normalizedFromHeaders) {
        return normalizedFromHeaders;
      }

      if (bodyText.trim()) {
        const payload = JSON.parse(bodyText);
        return normalizeCodexUsagePayload(payload, {
          source: 'chatgpt-token',
          endpoint,
          lastUpdated: Date.now(),
        });
      }

      lastError = `GET ${endpoint} 成功但未返回可解析的 usage 数据`;
    } catch (error) {
      lastError = `${endpoint}: ${(error as Error).message}`;
    }
  }

  throw new Error(lastError);
}

async function fetchCodexUsageFromBrowserWindow(profileId?: string) {
  const win = await ensureCodexUsageWindow(profileId, false);
  const currentUrl = win.webContents.getURL();

  if (!currentUrl.includes('chatgpt.com/codex') && !currentUrl.includes('auth.openai.com')) {
    void win.loadURL(CODEX_USAGE_PAGE_URL);
    await waitForWindowLoad(win);
  }

  const script = `
    (async () => {
      const result = {
        loginRequired: false,
        error: null,
        payload: null,
        endpoint: null,
        accessToken: null,
        accountId: null,
        accountEmail: null,
        accountName: null,
        planType: null,
        currentUrl: window.location.href,
        lastUpdated: Date.now(),
        attempts: [],
      };

      const looksLikeLoginPage = (url, text) => {
        const haystack = String(url || '') + '\\n' + String(text || '');
        const lower = haystack.toLowerCase();
        return lower.includes('auth.openai.com')
          || lower.includes('/login')
          || lower.includes('/log-in')
          || lower.includes('/signin')
          || lower.includes('continue with google')
          || lower.includes('continue with apple')
          || lower.includes('log in to continue')
          || lower.includes('sign up');
      };

      const decodeJwtPayload = (token) => {
        try {
          const parts = String(token || '').split('.');
          if (parts.length < 2) return null;
          const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
          return JSON.parse(atob(padded));
        } catch {
          return null;
        }
      };

      const normalizeText = (value) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed || null;
      };

      const extractSessionHints = (sessionData) => {
        const accessToken = sessionData?.accessToken || sessionData?.access_token || sessionData?.token || null;
        const jwtPayload = accessToken ? decodeJwtPayload(accessToken) : null;
        const authClaims = jwtPayload?.['https://api.openai.com/auth'] || {};
        const user = sessionData?.user || {};
        return {
          accessToken,
          accountId:
            sessionData?.account_id
            || sessionData?.chatgpt_account_id
            || user?.id
            || user?.account_id
            || authClaims?.chatgpt_account_id
            || null,
          accountEmail:
            normalizeText(sessionData?.email)
            || normalizeText(user?.email)
            || normalizeText(user?.profile?.email)
            || normalizeText(jwtPayload?.email)
            || normalizeText(authClaims?.email)
            || null,
          accountName:
            normalizeText(sessionData?.name)
            || normalizeText(user?.name)
            || normalizeText(user?.display_name)
            || normalizeText(user?.displayName)
            || normalizeText(user?.username)
            || normalizeText(jwtPayload?.name)
            || normalizeText(authClaims?.name)
            || null,
          planType:
            sessionData?.chatgpt_plan_type
            || user?.plan_type
            || user?.planType
            || authClaims?.chatgpt_plan_type
            || null,
        };
      };

      const fetchAuthSession = async () => {
        const sessionEndpoints = ['/api/auth/session', '/auth/session'];
        for (const endpoint of sessionEndpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'GET',
              credentials: 'include',
              headers: { accept: 'application/json' },
            });
            const text = await response.text();
            result.attempts.push({ endpoint, status: response.status });
            if (!response.ok || !text.trim()) continue;

            const sessionData = JSON.parse(text);
            const hints = extractSessionHints(sessionData);
            if (hints.accessToken) {
              result.accessToken = hints.accessToken;
              result.accountId = hints.accountId;
              result.accountEmail = hints.accountEmail;
              result.accountName = hints.accountName;
              result.planType = hints.planType;
              return hints;
            }
          } catch (error) {
            result.attempts.push({ endpoint, error: (error && error.message) || String(error) });
          }
        }
        return null;
      };

      try {
        const bodyText = (document.body && document.body.innerText) || '';
        const authSession = await fetchAuthSession();
        if (looksLikeLoginPage(window.location.href, bodyText) && !authSession?.accessToken) {
          result.loginRequired = true;
          result.error = 'login-required';
          return result;
        }

        const endpoints = ['/backend-api/wham/usage', '/backend-api/codex/wham/usage'];

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'GET',
              credentials: 'include',
              headers: { accept: 'application/json' },
            });
            const text = await response.text();
            result.attempts.push({ endpoint, status: response.status });

            if (response.status === 401 || response.status === 403) {
              result.endpoint = endpoint;
              if (!authSession?.accessToken) {
                result.loginRequired = true;
                result.error = 'login-required';
                return result;
              }
              continue;
            }

            if (looksLikeLoginPage(response.url, text) && !authSession?.accessToken) {
              result.loginRequired = true;
              result.error = 'login-required';
              result.endpoint = endpoint;
              return result;
            }

            if (!response.ok) {
              continue;
            }

            result.payload = JSON.parse(text);
            result.endpoint = endpoint;
            return result;
          } catch (error) {
            result.attempts.push({ endpoint, error: (error && error.message) || String(error) });
          }
        }

        if (authSession?.accessToken) {
          result.error = 'usage-browser-fetch-failed';
          return result;
        }

        result.error = result.attempts
          .map(item => item.error ? item.endpoint + ': ' + item.error : item.endpoint + ': ' + item.status)
          .join(' | ') || 'usage-unavailable';
        return result;
      } catch (error) {
        result.error = (error && error.message) || String(error);
        return result;
      }
    })();
  `;

  try {
    const result = await win.webContents.executeJavaScript(script, true);
    if (result?.payload) {
      return normalizeCodexUsagePayload(result.payload, {
        source: 'chatgpt-browser',
        endpoint: result.endpoint,
        currentUrl: result.currentUrl,
        lastUpdated: result.lastUpdated,
        fallbackPlanType: result.planType,
        accountId: result.accountId,
        accountEmail: result.accountEmail,
        accountName: result.accountName,
      });
    }

    if (result?.accessToken) {
      try {
        const tokenUsage = await fetchCodexUsageWithToken({
          sessionToken: result.accessToken,
          accountId: result.accountId || undefined,
        });
        return {
          ...tokenUsage,
          planType: tokenUsage.planType ?? result.planType ?? null,
          accountId: tokenUsage.accountId ?? result.accountId ?? null,
          accountEmail: tokenUsage.accountEmail ?? result.accountEmail ?? null,
          accountName: tokenUsage.accountName ?? result.accountName ?? null,
          currentUrl: result.currentUrl ?? tokenUsage.currentUrl,
          source: 'chatgpt-browser-token',
        };
      } catch (tokenError) {
        return {
          category: 'Codex' as const,
          planType: result.planType ?? null,
          primary: null,
          secondary: null,
          credits: null,
          additionalLimits: [],
          accountId: result?.accountId ?? null,
          accountEmail: result?.accountEmail ?? null,
          accountName: result?.accountName ?? null,
          currentUrl: result?.currentUrl,
          endpoint: result?.endpoint,
          lastUpdated: result?.lastUpdated ?? Date.now(),
          source: 'chatgpt-browser-token',
          loginRequired: false,
          error: `${result?.error || 'usage-browser-fetch-failed'} | ${(tokenError as Error).message}`,
        };
      }
    }

    return {
      category: 'Codex' as const,
      planType: result?.planType ?? null,
      primary: null,
      secondary: null,
      credits: null,
      additionalLimits: [],
      accountId: result?.accountId ?? null,
      accountEmail: result?.accountEmail ?? null,
      accountName: result?.accountName ?? null,
      currentUrl: result?.currentUrl,
      endpoint: result?.endpoint,
      lastUpdated: result?.lastUpdated ?? Date.now(),
      source: 'chatgpt-browser',
      loginRequired: Boolean(result?.loginRequired),
      error: result?.error ?? 'usage-unavailable',
    };
  } catch (error) {
    return {
      category: 'Codex' as const,
      planType: null,
      primary: null,
      secondary: null,
      credits: null,
      additionalLimits: [],
      accountId: null,
      accountEmail: null,
      accountName: null,
      currentUrl: win.webContents.getURL(),
      endpoint: undefined,
      lastUpdated: Date.now(),
      source: 'chatgpt-browser',
      loginRequired: false,
      error: (error as Error).message,
    };
  }
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

// IPC: 获取用户主目录
ipcMain.handle('get-home-dir', () => {
  return app.getPath('home');
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
    properties: ['openDirectory', 'showHiddenFiles']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('git-select-repository', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'showHiddenFiles'],
    title: '选择 Git 仓库',
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const repoPath = await resolveGitRoot(result.filePaths[0]);
  return { path: repoPath, name: getRepoName(repoPath) };
});

ipcMain.handle('git-discover-repositories', async (_event, params?: { rootPath?: string; maxDepth?: number }) => {
  if (!params?.rootPath) {
    throw new Error('缺少扫描目录');
  }
  return discoverGitRepositories(params.rootPath, params.maxDepth);
});

ipcMain.handle('git-status', async (_event, repoPath: string) => {
  if (!repoPath) throw new Error('缺少仓库路径');
  return getGitStatus(repoPath);
});

ipcMain.handle('git-log', async (_event, params: { repoPath: string; limit?: number }) => {
  if (!params?.repoPath) throw new Error('缺少仓库路径');
  return getGitLog(params.repoPath, params.limit);
});

ipcMain.handle('git-diff', async (_event, params: { repoPath: string; filePath: string; staged?: boolean }) => {
  if (!params?.repoPath || !params?.filePath) throw new Error('缺少 diff 参数');
  const root = await resolveGitRoot(params.repoPath);
  const relativePath = ensureRelativeGitPath(root, params.filePath);
  const args = params.staged
    ? ['diff', '--cached', '--no-ext-diff', '--', relativePath]
    : ['diff', '--no-ext-diff', '--', relativePath];
  const { stdout } = await runGit(args, root);
  return stdout;
});

ipcMain.handle('git-show-commit', async (_event, params: { repoPath: string; hash: string }) => {
  if (!params?.repoPath || !params?.hash) throw new Error('缺少提交参数');
  if (!/^[a-f0-9]{4,40}$/i.test(params.hash)) throw new Error('提交哈希无效');
  const root = await resolveGitRoot(params.repoPath);
  const { stdout } = await runGit([
    'show',
    '--stat',
    '--format=medium',
    '--decorate=short',
    '--no-ext-diff',
    params.hash,
  ], root);
  return stdout;
});

ipcMain.handle('git-stage', async (_event, params: { repoPath: string; paths: string[] }) => {
  if (!params?.repoPath || !Array.isArray(params.paths)) throw new Error('缺少暂存参数');
  const root = await resolveGitRoot(params.repoPath);
  const paths = params.paths.map(filePath => ensureRelativeGitPath(root, filePath));
  if (paths.length === 0) return getGitStatus(root);
  await runGit(['add', '--', ...paths], root, 60000);
  return getGitStatus(root);
});

ipcMain.handle('git-unstage', async (_event, params: { repoPath: string; paths: string[] }) => {
  if (!params?.repoPath || !Array.isArray(params.paths)) throw new Error('缺少取消暂存参数');
  const root = await resolveGitRoot(params.repoPath);
  const paths = params.paths.map(filePath => ensureRelativeGitPath(root, filePath));
  if (paths.length === 0) return getGitStatus(root);
  await runGit(['restore', '--staged', '--', ...paths], root, 60000);
  return getGitStatus(root);
});

ipcMain.handle('git-discard', async (_event, params: { repoPath: string; filePath: string; untracked?: boolean }) => {
  if (!params?.repoPath || !params?.filePath) throw new Error('缺少丢弃参数');
  const root = await resolveGitRoot(params.repoPath);
  const relativePath = ensureRelativeGitPath(root, params.filePath);
  if (params.untracked) {
    await runGit(['clean', '-f', '--', relativePath], root, 60000);
  } else {
    await runGit(['restore', '--worktree', '--', relativePath], root, 60000);
  }
  return getGitStatus(root);
});

ipcMain.handle('git-commit', async (_event, params: { repoPath: string; message: string }) => {
  if (!params?.repoPath) throw new Error('缺少仓库路径');
  const message = params.message?.trim();
  if (!message) throw new Error('提交信息不能为空');
  const root = await resolveGitRoot(params.repoPath);
  const { stdout, stderr } = await runGit(['commit', '-m', message], root, 120000);
  return { output: `${stdout}${stderr}`.trim(), status: await getGitStatus(root), log: await getGitLog(root, 80) };
});

ipcMain.handle('git-fetch', async (_event, repoPath: string) => {
  if (!repoPath) throw new Error('缺少仓库路径');
  const root = await resolveGitRoot(repoPath);
  const { stdout, stderr } = await runGit(['fetch', '--prune'], root, 120000);
  return { output: `${stdout}${stderr}`.trim(), status: await getGitStatus(root), log: await getGitLog(root, 80) };
});

ipcMain.handle('git-pull', async (_event, repoPath: string) => {
  if (!repoPath) throw new Error('缺少仓库路径');
  const root = await resolveGitRoot(repoPath);
  const { stdout, stderr } = await runGit(['pull', '--ff-only'], root, 120000);
  return { output: `${stdout}${stderr}`.trim(), status: await getGitStatus(root), log: await getGitLog(root, 80) };
});

ipcMain.handle('git-push', async (_event, repoPath: string) => {
  if (!repoPath) throw new Error('缺少仓库路径');
  const root = await resolveGitRoot(repoPath);
  const { stdout, stderr } = await runGit(['push'], root, 120000);
  return { output: `${stdout}${stderr}`.trim(), status: await getGitStatus(root), log: await getGitLog(root, 80) };
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
    properties: ['openFile', 'showHiddenFiles']
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
    return await Promise.all(entries.map(async entry => {
      const entryPath = path.join(dirPath, entry.name);
      try {
        const stats = await fs.stat(entryPath);
        return {
          name: entry.name,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          path: entryPath,
          size: stats.size,
          mtime: stats.mtimeMs,
        };
      } catch {
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          path: entryPath,
          size: 0,
          mtime: null,
        };
      }
    }));
  } catch (error) {
    console.error('Failed to list directory:', error);
    return [];
  }
});

// IPC: 获取文件状态信息
ipcMain.handle('get-file-stats', async (_, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtime: stats.mtimeMs, isDirectory: stats.isDirectory(), isFile: stats.isFile() };
  } catch (error) {
    console.error('Failed to get file stats:', error);
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

// --- Codex Usage API ---

ipcMain.handle('fetch-codex-usage', async (_event, params: { sessionToken: string; accountId?: string; baseUrl?: string }) => {
  return await fetchCodexUsageWithToken(params);
});

ipcMain.handle('open-codex-usage-login', async (_event, params?: { profileId?: string }) => {
  try {
    await ensureCodexUsageWindow(params?.profileId, true);
    return true;
  } catch (error) {
    throw new Error((error as Error).message || '打开 Codex 登录窗口失败');
  }
});

ipcMain.handle('fetch-codex-usage-browser', async (_event, params?: { profileId?: string }) => {
  try {
    return await fetchCodexUsageFromBrowserWindow(params?.profileId);
  } catch (error) {
    return {
      category: 'Codex' as const,
      planType: null,
      primary: null,
      secondary: null,
      credits: null,
      additionalLimits: [],
      lastUpdated: Date.now(),
      source: 'chatgpt-browser',
      loginRequired: false,
      error: (error as Error).message,
    };
  }
});

// --- ZenMux Management API ---

const ZENMUX_MANAGEMENT_API_BASE = 'https://zenmux.ai/api/v1/management';

type ZenmuxManagementParams = {
  apiKey?: string;
};

async function zenmuxManagementGet(apiKey: string, endpoint: string, params?: Record<string, string | number | undefined>): Promise<any> {
  const url = new URL(`${ZENMUX_MANAGEMENT_API_BASE}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || text || `${response.status} ${response.statusText}`;
    throw new Error(`ZenMux 管理 API 请求失败：${message}`);
  }
  if (payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || 'ZenMux 管理 API 返回失败');
  }
  return payload?.data ?? payload;
}

async function fetchZenmuxManagementData(params: ZenmuxManagementParams): Promise<any> {
  const apiKey = String(params?.apiKey || '').trim();
  if (!apiKey) {
    return { error: '请先填写 ZenMux Management API Key', missingApiKey: true, lastUpdated: Date.now() };
  }

  const subscription = await zenmuxManagementGet(apiKey, '/subscription/detail');
  const balance = await zenmuxManagementGet(apiKey, '/payg/balance').catch((error) => ({ error: (error as Error).message }));

  return {
    data: {
      subscription,
      balance: balance?.error ? null : balance,
      partialErrors: {
        balance: balance?.error || null,
      },
    },
    lastUpdated: Date.now(),
    source: 'zenmux-management-api',
  };
}

ipcMain.handle('fetch-zenmux-management-data', async (_event, params: ZenmuxManagementParams) => {
  try {
    return await fetchZenmuxManagementData(params);
  } catch (error) {
    return { error: (error as Error).message, missingApiKey: false, lastUpdated: Date.now() };
  }
});

// --- API Key Balance ---

type ApiKeyBalanceProvider = 'kimi' | 'deepseek';

type ApiKeyBalanceParams = {
  provider?: ApiKeyBalanceProvider;
  apiKey?: string;
};

const API_KEY_BALANCE_ENDPOINTS: Record<ApiKeyBalanceProvider, string> = {
  kimi: 'https://api.moonshot.cn/v1/users/me/balance',
  deepseek: 'https://api.deepseek.com/user/balance',
};

async function fetchApiKeyBalance(params: ApiKeyBalanceParams): Promise<any> {
  const provider = params?.provider;
  const apiKey = String(params?.apiKey || '').trim();
  if (!provider || !API_KEY_BALANCE_ENDPOINTS[provider]) {
    throw new Error('不支持的 API Key 平台');
  }
  if (!apiKey) {
    throw new Error('请先填写 API Key');
  }

  const response = await fetch(API_KEY_BALANCE_ENDPOINTS[provider], {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || text || `${response.status} ${response.statusText}`;
    throw new Error(`${provider === 'kimi' ? 'Kimi' : 'DeepSeek'} 余额查询失败：${message}`);
  }
  if (provider === 'kimi' && payload?.status === false) {
    throw new Error(payload?.message || 'Kimi 余额查询失败');
  }

  return {
    provider,
    data: provider === 'kimi' ? (payload?.data ?? payload) : (payload?.data ?? payload),
    lastUpdated: Date.now(),
  };
}

ipcMain.handle('fetch-api-key-balance', async (_event, params: ApiKeyBalanceParams) => {
  try {
    return await fetchApiKeyBalance(params);
  } catch (error) {
    return { error: (error as Error).message, provider: params?.provider, lastUpdated: Date.now() };
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

type GoogleServiceAccountJson = {
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  token_uri?: string;
};

type GoogleApiMetricsParams = {
  projectId?: string;
  serviceAccountJson?: string;
};

type GoogleMetricDescriptor = {
  type: string;
  displayName?: string;
  description?: string;
  metricKind?: string;
  valueType?: string;
};

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function parseGoogleServiceAccount(raw: string): GoogleServiceAccountJson {
  if (!raw?.trim()) throw new Error('请填写 Service Account JSON');
  let parsed: GoogleServiceAccountJson;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Service Account JSON 格式不正确');
  }
  if (parsed.type !== 'service_account') throw new Error('JSON 不是 service_account 类型');
  if (!parsed.client_email || !parsed.private_key) throw new Error('Service Account JSON 缺少 client_email 或 private_key');
  return parsed;
}

function createServiceAccountJwt(sa: GoogleServiceAccountJson, scopes: string[]): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(String(sa.private_key).replace(/\\n/g, '\n'));
  return `${signingInput}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(sa: GoogleServiceAccountJson, scopes: string[]): Promise<string> {
  const assertion = createServiceAccountJwt(sa, scopes);
  const tokenUrl = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || `获取 Google access token 失败：HTTP ${response.status}`);
  }
  return payload.access_token;
}

async function googleGetJson(url: URL, accessToken: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || text || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

async function listGenerativeLanguageDescriptors(projectId: string, accessToken: string): Promise<GoogleMetricDescriptor[]> {
  const descriptors: GoogleMetricDescriptor[] = [];
  let pageToken = '';
  do {
    const url = new URL(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/metricDescriptors`);
    url.searchParams.set('filter', 'metric.type = starts_with("generativelanguage.googleapis.com/quota/")');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await googleGetJson(url, accessToken);
    descriptors.push(...(payload.metricDescriptors || []).map((item: any) => ({
      type: item.type,
      displayName: item.displayName,
      description: item.description,
      metricKind: item.metricKind,
      valueType: item.valueType,
    })));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return descriptors;
}

function metricPointValue(point: any): number {
  const value = point?.value || {};
  const raw = value.int64Value ?? value.doubleValue ?? value.stringValue ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyGoogleMetric(type: string): 'requests' | 'tokens' | 'other' {
  const lower = type.toLowerCase();
  if (lower.includes('token')) return 'tokens';
  if (lower.includes('request')) return 'requests';
  return 'other';
}

function compactMetricName(type: string): string {
  return type.replace('generativelanguage.googleapis.com/quota/', '');
}

async function listGoogleTimeSeries(
  projectId: string,
  accessToken: string,
  descriptor: GoogleMetricDescriptor,
  startTime: string,
  endTime: string,
): Promise<any[]> {
  const isLimit = descriptor.type.endsWith('/limit');
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries`);
  url.searchParams.set('filter', `metric.type="${descriptor.type}"`);
  url.searchParams.set('interval.startTime', startTime);
  url.searchParams.set('interval.endTime', endTime);
  url.searchParams.set('aggregation.alignmentPeriod', isLimit ? '3600s' : '86400s');
  url.searchParams.set('aggregation.perSeriesAligner', isLimit ? 'ALIGN_MAX' : 'ALIGN_SUM');
  url.searchParams.set('view', 'FULL');
  url.searchParams.set('pageSize', '200');

  const series: any[] = [];
  let pageToken = '';
  do {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const payload = await googleGetJson(url, accessToken);
    series.push(...(payload.timeSeries || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return series;
}

function summarizeGoogleSeries(descriptor: GoogleMetricDescriptor, series: any[]) {
  const isLimit = descriptor.type.endsWith('/limit');
  const byModel = new Map<string, { model: string; method: string; limitName: string; value: number }>();
  let total = 0;

  for (const item of series) {
    const labels = item.metric?.labels || {};
    const model = labels.model || 'unknown';
    const method = labels.method || '';
    const limitName = labels.limit_name || '';
    const points = Array.isArray(item.points) ? item.points : [];
    const values: number[] = points.map(metricPointValue);
    const value = isLimit ? Math.max(0, ...values) : values.reduce((sum: number, n: number) => sum + n, 0);
    total += value;

    const key = `${model}::${method}::${limitName}`;
    const current = byModel.get(key) || { model, method, limitName, value: 0 };
    current.value += value;
    byModel.set(key, current);
  }

  return {
    type: descriptor.type,
    name: compactMetricName(descriptor.type),
    displayName: descriptor.displayName || compactMetricName(descriptor.type),
    category: classifyGoogleMetric(descriptor.type),
    kind: isLimit ? 'limit' : 'usage',
    total,
    seriesCount: series.length,
    byModel: [...byModel.values()]
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
  };
}

async function fetchGoogleApiMonitoringData(params: GoogleApiMetricsParams): Promise<any> {
  const serviceAccount = parseGoogleServiceAccount(String(params?.serviceAccountJson || ''));
  const projectId = String(params?.projectId || serviceAccount.project_id || '').trim();
  if (!projectId) throw new Error('请填写 Google Cloud Project ID');

  const accessToken = await getGoogleAccessToken(serviceAccount, [
    'https://www.googleapis.com/auth/monitoring.read',
  ]);

  const descriptors = await listGenerativeLanguageDescriptors(projectId, accessToken);
  const usageDescriptors = descriptors
    .filter(item => item.type.endsWith('/usage'))
    .filter(item => /generate|predict|embed|token|request/i.test(item.type))
    .slice(0, 40);
  const limitDescriptors = descriptors
    .filter(item => item.type.endsWith('/limit'))
    .filter(item => /generate|predict|embed|token|request/i.test(item.type))
    .slice(0, 40);

  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 3600_000);
  const startTime = start.toISOString();
  const endTime = end.toISOString();

  const usageSummaries = [];
  for (const descriptor of usageDescriptors) {
    try {
      const series = await listGoogleTimeSeries(projectId, accessToken, descriptor, startTime, endTime);
      const summary = summarizeGoogleSeries(descriptor, series);
      if (summary.total > 0 || summary.seriesCount > 0) usageSummaries.push(summary);
    } catch (error) {
      usageSummaries.push({
        type: descriptor.type,
        name: compactMetricName(descriptor.type),
        displayName: descriptor.displayName || compactMetricName(descriptor.type),
        category: classifyGoogleMetric(descriptor.type),
        kind: 'usage',
        total: 0,
        seriesCount: 0,
        byModel: [],
        error: (error as Error).message,
      });
    }
  }

  const limitSummaries = [];
  for (const descriptor of limitDescriptors) {
    try {
      const series = await listGoogleTimeSeries(projectId, accessToken, descriptor, new Date(end.getTime() - 24 * 3600_000).toISOString(), endTime);
      const summary = summarizeGoogleSeries(descriptor, series);
      if (summary.total > 0 || summary.seriesCount > 0) limitSummaries.push(summary);
    } catch {
      // Limit descriptors are supplementary; missing data shouldn't hide usage.
    }
  }

  const totals = usageSummaries.reduce((acc, item: any) => {
    if (item.category === 'requests') acc.requests += item.total || 0;
    else if (item.category === 'tokens') acc.tokens += item.total || 0;
    else acc.other += item.total || 0;
    return acc;
  }, { requests: 0, tokens: 0, other: 0 });

  return {
    loginRequired: false,
    error: null,
    lastUpdated: Date.now(),
    source: 'google-cloud-monitoring',
    data: {
      projectId,
      serviceAccountEmail: serviceAccount.client_email,
      windowDays: 7,
      descriptorCount: descriptors.length,
      totals,
      usage: usageSummaries.sort((a: any, b: any) => (b.total || 0) - (a.total || 0)),
      limits: limitSummaries.sort((a: any, b: any) => (b.total || 0) - (a.total || 0)),
    },
  };
}

ipcMain.handle('fetch-aistudio-data', async (_event, params?: GoogleApiMetricsParams) => {
  try {
    if (params?.serviceAccountJson) {
      return await fetchGoogleApiMonitoringData(params);
    }
    return await fetchAIStudioData(params?.projectId);
  } catch (error) {
    return { error: (error as Error).message, loginRequired: false };
  }
});

ipcMain.handle('fetch-google-api-metrics', async (_event, params?: GoogleApiMetricsParams) => {
  try {
    return await fetchGoogleApiMonitoringData(params || {});
  } catch (error) {
    return { error: (error as Error).message, loginRequired: false, lastUpdated: Date.now() };
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
  const program = options?.command || shell;
  const id = options?.id || Math.random().toString(36).substring(7);
  
  if (ptyProcesses[id]) {
    try {
        ptyProcesses[id].kill();
    } catch(e) {}
  }

  try {
    // Use login shell to ensure user's profile (and PATH) is loaded
    const args = Array.isArray(options?.args)
      ? options.args
      : (options?.command ? [] : (os.platform() === 'win32' ? [] : ['-l']));
    
    const ptyProcess = pty.spawn(program, args, {
      name: 'xterm-256color',
      cols: options?.cols || 80,
      rows: options?.rows || 30,
      cwd: options?.cwd || process.env.HOME || os.homedir(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'Guyue Master',
        TERM_PROGRAM_VERSION: app.getVersion(),
        LANG: process.env.LANG || 'en_US.UTF-8',
        LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
        LC_CTYPE: process.env.LC_CTYPE || process.env.LANG || 'en_US.UTF-8',
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

type AgentSearchProvider = 'tavily' | 'exa' | 'brave' | 'searxng' | 'bing-browser';
type AgentSearchMode = 'fast' | 'balanced' | 'deep';
type AgentSpecializedSearchSource = 'github' | 'npm' | 'stackoverflow' | 'arxiv';

interface AgentWebSearchParams {
  query: string;
  provider?: AgentSearchProvider;
  fallbackProviders?: AgentSearchProvider[];
  mode?: AgentSearchMode;
  searchMode?: AgentSearchMode;
  maxResults?: number;
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  apiKeys?: {
    tavily?: string;
    exa?: string;
    brave?: string;
  };
  searxngBaseUrl?: string;
  language?: string;
  country?: string;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  topic?: 'general' | 'news' | 'finance';
  includeDomains?: string[];
  excludeDomains?: string[];
}

interface AgentSpecializedSearchParams {
  source: AgentSpecializedSearchSource;
  query: string;
  maxResults?: number;
  githubType?: 'repositories' | 'code' | 'issues' | 'pull_requests' | 'users';
  owner?: string;
  repo?: string;
  language?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  tags?: string[];
  arxivCategory?: string;
  specialized?: {
    enabledSources?: AgentSpecializedSearchSource[];
    maxResults?: number;
    apiKeys?: {
      github?: string;
      stackExchange?: string;
    };
  };
}

interface AgentWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedDate?: string;
  score?: number;
  content?: string;
  meta?: Record<string, any>;
}

const AGENT_SEARCH_PROVIDERS = new Set<AgentSearchProvider>(['tavily', 'exa', 'brave', 'searxng', 'bing-browser']);
const AGENT_SPECIALIZED_SEARCH_SOURCES = new Set<AgentSpecializedSearchSource>(['github', 'npm', 'stackoverflow', 'arxiv']);

const normalizeAgentSearchProvider = (value: unknown, fallback: AgentSearchProvider): AgentSearchProvider =>
  typeof value === 'string' && AGENT_SEARCH_PROVIDERS.has(value as AgentSearchProvider)
    ? value as AgentSearchProvider
    : fallback;

const normalizeAgentSearchMode = (value: unknown): AgentSearchMode =>
  value === 'fast' || value === 'deep' || value === 'balanced' ? value : 'balanced';

const normalizeSpecializedSearchSource = (value: unknown): AgentSpecializedSearchSource | null =>
  typeof value === 'string' && AGENT_SPECIALIZED_SEARCH_SOURCES.has(value as AgentSpecializedSearchSource)
    ? value as AgentSpecializedSearchSource
    : null;

const normalizeSearchMaxResults = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.floor(parsed), 3), 20);
};

const providerNeedsApiKey = (provider: AgentSearchProvider) =>
  provider === 'tavily' || provider === 'exa' || provider === 'brave';

const withDomainOperators = (query: string, includeDomains?: string[], excludeDomains?: string[]) => {
  const include = Array.isArray(includeDomains)
    ? includeDomains.map(item => item.trim()).filter(Boolean)
    : [];
  const exclude = Array.isArray(excludeDomains)
    ? excludeDomains.map(item => item.trim()).filter(Boolean)
    : [];
  const includePrefix = include.length > 0
    ? `(${include.map(domain => `site:${domain}`).join(' OR ')}) `
    : '';
  const excludeSuffix = exclude.length > 0
    ? ` ${exclude.map(domain => `-site:${domain}`).join(' ')}`
    : '';
  return `${includePrefix}${query}${excludeSuffix}`.trim();
};

const fetchJson = async (url: string, options?: RequestInit & { bypassCustomProtocolHandlers?: boolean }): Promise<any> => {
  const response = await net.fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 240)}` : ''}`);
  }
  return response.json();
};

const fetchText = async (url: string, options?: RequestInit & { bypassCustomProtocolHandlers?: boolean }): Promise<string> => {
  const response = await net.fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text.slice(0, 240)}` : ''}`);
  }
  return response.text();
};

const decodeHtmlEntity = (value: string): string =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripMarkup = (value: unknown): string =>
  decodeHtmlEntity(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

const getXmlTag = (xml: string, tagName: string): string => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? stripMarkup(match[1]) : '';
};

const normalizeSpecializedSearchMaxResults = (value: unknown, fallback?: unknown) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(Math.floor(parsed), 3), 20);
};

const searchWithTavily = async (params: AgentWebSearchParams): Promise<{ directAnswer: string | null; results: AgentWebSearchResult[] }> => {
  const apiKey = params.apiKeys?.tavily?.trim();
  if (!apiKey) throw new Error('Tavily API Key 未配置');
  const mode = normalizeAgentSearchMode(params.searchMode || params.mode);
  const body: Record<string, unknown> = {
    query: params.query,
    search_depth: mode === 'deep' ? 'advanced' : mode === 'fast' ? 'fast' : 'basic',
    topic: params.topic || 'general',
    max_results: normalizeSearchMaxResults(params.maxResults),
    include_answer: params.includeAnswer ? (mode === 'deep' ? 'advanced' : 'basic') : false,
    include_raw_content: params.includeRawContent ? 'markdown' : false,
  };
  if (params.timeRange) {
    body.time_range = ({ day: 'day', week: 'week', month: 'month', year: 'year' } as const)[params.timeRange];
  }
  if (Array.isArray(params.includeDomains) && params.includeDomains.length > 0) {
    body.include_domains = params.includeDomains;
  }
  if (Array.isArray(params.excludeDomains) && params.excludeDomains.length > 0) {
    body.exclude_domains = params.excludeDomains;
  }
  if (params.country && params.topic !== 'news' && params.topic !== 'finance') {
    body.country = params.country.toLowerCase();
  }

  const data = await fetchJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    directAnswer: typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : null,
    results: results.map((item: any): AgentWebSearchResult => ({
      title: String(item.title || item.url || '').trim(),
      url: String(item.url || '').trim(),
      snippet: String(item.content || item.snippet || '').trim(),
      source: 'tavily',
      publishedDate: item.published_date || item.publishedDate,
      score: typeof item.score === 'number' ? item.score : undefined,
      content: typeof item.raw_content === 'string' ? item.raw_content : undefined,
    })).filter((item: AgentWebSearchResult) => item.title && item.url),
  };
};

const searchWithExa = async (params: AgentWebSearchParams): Promise<{ directAnswer: string | null; results: AgentWebSearchResult[] }> => {
  const apiKey = params.apiKeys?.exa?.trim();
  if (!apiKey) throw new Error('Exa API Key 未配置');
  const mode = normalizeAgentSearchMode(params.searchMode || params.mode);
  const body: Record<string, unknown> = {
    query: params.query,
    type: mode === 'deep' ? 'deep' : mode === 'fast' ? 'fast' : 'auto',
    numResults: normalizeSearchMaxResults(params.maxResults),
    userLocation: params.country || 'CN',
  };
  if (params.includeRawContent) {
    body.text = true;
  } else {
    body.highlights = true;
  }
  if (Array.isArray(params.includeDomains) && params.includeDomains.length > 0) {
    body.includeDomains = params.includeDomains;
  }
  if (Array.isArray(params.excludeDomains) && params.excludeDomains.length > 0) {
    body.excludeDomains = params.excludeDomains;
  }

  const data = await fetchJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    directAnswer: typeof data.context === 'string' && data.context.trim() ? data.context.trim().slice(0, 1200) : null,
    results: results.map((item: any): AgentWebSearchResult => {
      const highlights = Array.isArray(item.highlights) ? item.highlights.join(' ') : '';
      return {
        title: String(item.title || item.url || '').trim(),
        url: String(item.url || '').trim(),
        snippet: String(item.text || highlights || item.summary || '').trim().slice(0, 1200),
        source: 'exa',
        publishedDate: item.publishedDate,
        score: typeof item.score === 'number' ? item.score : undefined,
        content: typeof item.text === 'string' ? item.text : undefined,
      };
    }).filter((item: AgentWebSearchResult) => item.title && item.url),
  };
};

const searchWithBrave = async (params: AgentWebSearchParams): Promise<{ directAnswer: string | null; results: AgentWebSearchResult[] }> => {
  const apiKey = params.apiKeys?.brave?.trim();
  if (!apiKey) throw new Error('Brave Search API Key 未配置');
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('count', String(normalizeSearchMaxResults(params.maxResults)));
  url.searchParams.set('search_lang', (params.language || 'zh-CN').split('-')[0]);
  url.searchParams.set('country', params.country || 'CN');
  url.searchParams.set('safesearch', 'moderate');
  const data = await fetchJson(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });
  const webResults = Array.isArray(data.web?.results) ? data.web.results : [];
  const directAnswer = data.query?.summary || data.infobox?.description || null;
  return {
    directAnswer: typeof directAnswer === 'string' && directAnswer.trim() ? directAnswer.trim() : null,
    results: webResults.map((item: any): AgentWebSearchResult => ({
      title: String(item.title || item.url || '').replace(/<[^>]+>/g, '').trim(),
      url: String(item.url || '').trim(),
      snippet: String(item.description || item.extra_snippets?.join(' ') || '').replace(/<[^>]+>/g, '').trim(),
      source: 'brave',
      publishedDate: item.age,
    })).filter((item: AgentWebSearchResult) => item.title && item.url),
  };
};

const searchWithSearxng = async (params: AgentWebSearchParams): Promise<{ directAnswer: string | null; results: AgentWebSearchResult[] }> => {
  const baseUrl = params.searxngBaseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('SearXNG Base URL 未配置');
  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set('q', withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', params.language || 'zh-CN');
  url.searchParams.set('categories', params.topic === 'news' ? 'news' : 'general');
  const data = await fetchJson(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    directAnswer: typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : null,
    results: results.slice(0, normalizeSearchMaxResults(params.maxResults)).map((item: any): AgentWebSearchResult => ({
      title: String(item.title || item.url || '').trim(),
      url: String(item.url || '').trim(),
      snippet: String(item.content || item.snippet || '').trim(),
      source: item.engine || 'searxng',
      publishedDate: item.publishedDate || item.published_date,
      score: typeof item.score === 'number' ? item.score : undefined,
    })).filter((item: AgentWebSearchResult) => item.title && item.url),
  };
};

// Agent 网络搜索：旧兜底方案。用隐藏 BrowserWindow 加载 Bing 搜索页，渲染完毕后提取真实结果。
const searchWithBingBrowser = async (params: AgentWebSearchParams): Promise<{ directAnswer: string | null; results: AgentWebSearchResult[] }> => {
  let searchWin: BrowserWindow | null = null;
  try {
    const encoded = encodeURIComponent(withDomainOperators(params.query, params.includeDomains, params.excludeDomains));
    const searchUrl = `https://www.bing.com/search?q=${encoded}&setlang=${encodeURIComponent(params.language || 'zh-CN')}&cc=${encodeURIComponent(params.country || 'CN')}&count=${normalizeSearchMaxResults(params.maxResults)}`;

    searchWin = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // 复用 defaultSession，继承代理设置
        session: session.defaultSession,
      },
    });

    // 等待页面完全加载（含 JS 渲染）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('搜索页面加载超时')), 15000);
      searchWin!.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        // 额外等待 1.5s，确保 Bing JS 渲染完成（天气卡等动态内容）
        setTimeout(resolve, 1500);
      });
      searchWin!.webContents.once('did-fail-load', (_, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`页面加载失败: ${desc} (${code})`));
      });
      searchWin!.loadURL(searchUrl, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        extraHeaders: 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8\n',
      });
    });

    // 在页面上下文中提取搜索结果
    const extracted = await searchWin.webContents.executeJavaScript(`
      (() => {
        const results = [];

        // 1. 直答卡（天气、计算、知识卡等）
        const answerBox = document.querySelector('#b_content .b_ans, #b_content .b_direct_answer, .wtr_maincard, .b_focusTextMedium');
        const directAnswer = answerBox ? answerBox.innerText.trim().replace(/\\s+/g, ' ').substring(0, 500) : null;

        // 2. 普通搜索条目 #b_results > li.b_algo
        const items = document.querySelectorAll('#b_results > li.b_algo');
        items.forEach(item => {
          if (results.length >= 8) return;
          const titleEl = item.querySelector('h2 a');
          const snippetEl = item.querySelector('.b_caption p, .b_snippet, .b_algoSlug');
          const title = titleEl ? titleEl.innerText.trim() : '';
          const url = titleEl ? (titleEl.href || '') : '';
          const snippet = snippetEl ? snippetEl.innerText.trim().replace(/\\s+/g, ' ').substring(0, 400) : '';
          if (title && url) results.push({ title, url, snippet });
        });

        return { directAnswer, results };
      })()
    `);

    searchWin.destroy();
    searchWin = null;

    const { directAnswer, results } = extracted as { directAnswer: string | null; results: Array<{ title: string; url: string; snippet: string }> };

    if (!directAnswer && results.length === 0) {
      throw new Error('未获得搜索结果，请检查网络或代理设置');
    }

    return { directAnswer, results: results.map(item => ({ ...item, source: 'bing-browser' })) };
  } catch (e) {
    searchWin?.destroy();
    throw e;
  }
};

const buildGitHubSearchQuery = (params: AgentSpecializedSearchParams) => {
  const parts = [params.query.trim()];
  const owner = params.owner?.trim();
  const repo = params.repo?.trim();
  if (owner && repo) {
    parts.push(`repo:${owner}/${repo}`);
  } else if (owner) {
    parts.push(`user:${owner}`);
  }
  if (params.language?.trim()) {
    parts.push(`language:${params.language.trim()}`);
  }
  if (params.githubType === 'issues') parts.push('is:issue');
  if (params.githubType === 'pull_requests') parts.push('is:pr');
  return parts.join(' ');
};

const searchWithGitHub = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const githubType = params.githubType || 'repositories';
  const endpointType = githubType === 'pull_requests' ? 'issues' : githubType;
  const url = new URL(`https://api.github.com/search/${endpointType}`);
  url.searchParams.set('q', buildGitHubSearchQuery(params));
  url.searchParams.set('per_page', String(normalizeSpecializedSearchMaxResults(params.maxResults, params.specialized?.maxResults)));
  if (params.sort?.trim()) url.searchParams.set('sort', params.sort.trim());
  if (params.order === 'asc' || params.order === 'desc') url.searchParams.set('order', params.order);

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Guyue-Master-Agent',
  };
  const token = params.specialized?.apiKeys?.github?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const data = await fetchJson(url.toString(), { method: 'GET', headers });
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item: any): AgentWebSearchResult => {
    if (githubType === 'repositories') {
      return {
        title: String(item.full_name || item.name || '').trim(),
        url: String(item.html_url || '').trim(),
        snippet: [
          stripMarkup(item.description || ''),
          item.language ? `语言: ${item.language}` : '',
          Number.isFinite(item.stargazers_count) ? `Stars: ${item.stargazers_count}` : '',
          item.updated_at ? `更新: ${item.updated_at}` : '',
        ].filter(Boolean).join(' · '),
        source: 'github',
        publishedDate: item.updated_at,
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: {
          type: githubType,
          fullName: item.full_name,
          defaultBranch: item.default_branch,
          stars: item.stargazers_count,
          forks: item.forks_count,
        },
      };
    }
    if (githubType === 'code') {
      return {
        title: `${item.repository?.full_name || 'repository'} / ${item.path || item.name || 'file'}`,
        url: String(item.html_url || '').trim(),
        snippet: [
          item.name ? `文件: ${item.name}` : '',
          item.path ? `路径: ${item.path}` : '',
          item.repository?.description ? stripMarkup(item.repository.description) : '',
        ].filter(Boolean).join(' · '),
        source: 'github',
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: {
          type: githubType,
          repository: item.repository?.full_name,
          path: item.path,
          sha: item.sha,
        },
      };
    }
    if (githubType === 'users') {
      return {
        title: String(item.login || '').trim(),
        url: String(item.html_url || '').trim(),
        snippet: [item.type ? `类型: ${item.type}` : '', Number.isFinite(item.score) ? `Score: ${item.score}` : ''].filter(Boolean).join(' · '),
        source: 'github',
        score: typeof item.score === 'number' ? item.score : undefined,
        meta: { type: githubType, login: item.login },
      };
    }
    return {
      title: `#${item.number || ''} ${stripMarkup(item.title || '')}`.trim(),
      url: String(item.html_url || '').trim(),
      snippet: [
        item.state ? `状态: ${item.state}` : '',
        item.user?.login ? `作者: ${item.user.login}` : '',
        item.updated_at ? `更新: ${item.updated_at}` : '',
        stripMarkup(item.body || '').slice(0, 500),
      ].filter(Boolean).join(' · '),
      source: 'github',
      publishedDate: item.updated_at || item.created_at,
      score: typeof item.score === 'number' ? item.score : undefined,
      meta: {
        type: githubType,
        number: item.number,
        repositoryUrl: item.repository_url,
      },
    };
  }).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchWithNpm = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', params.query);
  url.searchParams.set('size', String(normalizeSpecializedSearchMaxResults(params.maxResults, params.specialized?.maxResults)));
  const data = await fetchJson(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  const objects = Array.isArray(data.objects) ? data.objects : [];
  return objects.map((item: any): AgentWebSearchResult => {
    const pkg = item.package || {};
    return {
      title: String(pkg.name || '').trim(),
      url: String(pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name || ''}`).trim(),
      snippet: [
        stripMarkup(pkg.description || ''),
        pkg.version ? `版本: ${pkg.version}` : '',
        pkg.date ? `更新: ${pkg.date}` : '',
      ].filter(Boolean).join(' · '),
      source: 'npm',
      publishedDate: pkg.date,
      score: typeof item.score?.final === 'number' ? item.score.final : undefined,
      meta: {
        version: pkg.version,
        keywords: pkg.keywords,
        publisher: pkg.publisher?.username,
      },
    };
  }).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchWithStackOverflow = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
  url.searchParams.set('order', params.order || 'desc');
  url.searchParams.set('sort', params.sort || 'relevance');
  url.searchParams.set('q', params.query);
  url.searchParams.set('site', 'stackoverflow');
  url.searchParams.set('pagesize', String(normalizeSpecializedSearchMaxResults(params.maxResults, params.specialized?.maxResults)));
  const tags = Array.isArray(params.tags) ? params.tags.map(tag => tag.trim()).filter(Boolean) : [];
  if (tags.length > 0) url.searchParams.set('tagged', tags.join(';'));
  const key = params.specialized?.apiKeys?.stackExchange?.trim();
  if (key) url.searchParams.set('key', key);

  const data = await fetchJson(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((item: any): AgentWebSearchResult => ({
    title: stripMarkup(item.title || ''),
    url: String(item.link || '').trim(),
    snippet: [
      Number.isFinite(item.score) ? `Score: ${item.score}` : '',
      Number.isFinite(item.answer_count) ? `Answers: ${item.answer_count}` : '',
      Array.isArray(item.tags) && item.tags.length ? `Tags: ${item.tags.join(', ')}` : '',
      item.is_answered ? '已回答' : '未标记已回答',
    ].filter(Boolean).join(' · '),
    source: 'stackoverflow',
    publishedDate: item.creation_date ? new Date(item.creation_date * 1000).toISOString() : undefined,
    score: typeof item.score === 'number' ? item.score : undefined,
    meta: {
      questionId: item.question_id,
      answerCount: item.answer_count,
      tags: item.tags,
      isAnswered: item.is_answered,
    },
  })).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const searchWithArxiv = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  const maxResults = normalizeSpecializedSearchMaxResults(params.maxResults, params.specialized?.maxResults);
  const category = params.arxivCategory?.trim() || params.language?.trim();
  const searchQuery = `${category ? `cat:${category} AND ` : ''}all:${params.query}`;
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', params.sort === 'submittedDate' ? 'submittedDate' : 'relevance');
  url.searchParams.set('sortOrder', params.order === 'asc' ? 'ascending' : 'descending');

  const xml = await fetchText(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/atom+xml, application/xml, text/xml' },
  });
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map(match => match[1]);
  return entries.map((entry): AgentWebSearchResult => {
    const id = getXmlTag(entry, 'id');
    const authors = Array.from(entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g))
      .map(match => stripMarkup(match[1]))
      .filter(Boolean)
      .slice(0, 5);
    const title = getXmlTag(entry, 'title');
    return {
      title,
      url: id,
      snippet: [
        authors.length ? `作者: ${authors.join(', ')}` : '',
        getXmlTag(entry, 'summary').slice(0, 900),
      ].filter(Boolean).join(' · '),
      source: 'arxiv',
      publishedDate: getXmlTag(entry, 'published') || undefined,
      meta: {
        updated: getXmlTag(entry, 'updated') || undefined,
        authors,
        primaryCategory: entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] || entry.match(/<category[^>]*term="([^"]+)"/)?.[1],
      },
    };
  }).filter((item: AgentWebSearchResult) => item.title && item.url);
};

const runSpecializedSearch = async (params: AgentSpecializedSearchParams): Promise<AgentWebSearchResult[]> => {
  switch (params.source) {
    case 'github':
      return searchWithGitHub(params);
    case 'npm':
      return searchWithNpm(params);
    case 'stackoverflow':
      return searchWithStackOverflow(params);
    case 'arxiv':
      return searchWithArxiv(params);
    default:
      throw new Error('不支持的专用搜索源');
  }
};

const runAgentSearchProvider = async (provider: AgentSearchProvider, params: AgentWebSearchParams) => {
  switch (provider) {
    case 'tavily':
      return searchWithTavily(params);
    case 'exa':
      return searchWithExa(params);
    case 'brave':
      return searchWithBrave(params);
    case 'searxng':
      return searchWithSearxng(params);
    case 'bing-browser':
    default:
      return searchWithBingBrowser(params);
  }
};

ipcMain.handle('agent-web-search', async (_, rawParams: AgentWebSearchParams) => {
  const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
  if (!query) return { success: false, error: '搜索词不能为空', results: [] };

  const primary = normalizeAgentSearchProvider(rawParams.provider, 'tavily');
  const fallbackProviders = Array.isArray(rawParams.fallbackProviders)
    ? rawParams.fallbackProviders.map(item => normalizeAgentSearchProvider(item, 'bing-browser'))
    : ['exa', 'brave', 'bing-browser'] as AgentSearchProvider[];
  const providerOrder = [primary, ...fallbackProviders].filter((provider, index, arr) => arr.indexOf(provider) === index);
  const params: AgentWebSearchParams = {
    ...rawParams,
    query,
    provider: primary,
    mode: normalizeAgentSearchMode(rawParams.searchMode || rawParams.mode),
    maxResults: normalizeSearchMaxResults(rawParams.maxResults),
  };
  const errors: string[] = [];

  for (const provider of providerOrder) {
    try {
      if (providerNeedsApiKey(provider)) {
        const key = params.apiKeys?.[provider]?.trim();
        if (!key) {
          errors.push(`${provider}: API Key 未配置`);
          continue;
        }
      }
      const result = await runAgentSearchProvider(provider, params);
      if (result.directAnswer || result.results.length > 0) {
        return {
          success: true,
          provider,
          usedFallback: provider !== primary,
          attemptedProviders: providerOrder.slice(0, providerOrder.indexOf(provider) + 1),
          directAnswer: result.directAnswer,
          results: result.results.slice(0, params.maxResults),
          query,
        };
      }
      errors.push(`${provider}: 未返回结果`);
    } catch (error) {
      errors.push(`${provider}: ${(error as Error).message}`);
    }
  }

  return {
    success: false,
    provider: primary,
    attemptedProviders: providerOrder,
    error: errors.join('；') || '未获得搜索结果，请检查网络、代理或搜索配置',
    results: [],
    query,
  };
});

ipcMain.handle('agent-specialized-search', async (_, rawParams: AgentSpecializedSearchParams) => {
  const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
  const source = normalizeSpecializedSearchSource(rawParams.source);
  if (!query) return { success: false, error: '搜索词不能为空', results: [] };
  if (!source) return { success: false, error: '不支持的专用搜索源', results: [], query };

  const enabledSources = Array.isArray(rawParams.specialized?.enabledSources)
    ? rawParams.specialized.enabledSources.map(normalizeSpecializedSearchSource).filter(Boolean) as AgentSpecializedSearchSource[]
    : ['github', 'npm', 'stackoverflow', 'arxiv'] as AgentSpecializedSearchSource[];
  if (!enabledSources.includes(source)) {
    return {
      success: false,
      source,
      query,
      results: [],
      error: `${source} 专用搜索未启用，请在 Agent 设置的专用搜索配置中开启`,
    };
  }

  const params: AgentSpecializedSearchParams = {
    ...rawParams,
    source,
    query,
    maxResults: normalizeSpecializedSearchMaxResults(rawParams.maxResults, rawParams.specialized?.maxResults),
  };

  try {
    const results = await runSpecializedSearch(params);
    return {
      success: true,
      source,
      query,
      results: results.slice(0, params.maxResults),
    };
  } catch (error) {
    return {
      success: false,
      source,
      query,
      results: [],
      error: (error as Error).message,
    };
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

interface CodingPracticeRunFile {
  id: 'input' | 'code' | 'output';
  name: string;
  content: string;
}

interface CodingPracticeRunParams {
  language: string;
  files: CodingPracticeRunFile[];
  runner: {
    compileCommand: string;
    runCommand: string;
    timeoutSeconds: number;
  };
}

function parseCodingPracticeCaseBlocks(rawInput: string) {
  const text = String(rawInput || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const markerRegex = /^\s*={3,}\s*(.*?)\s*={3,}\s*$/;
  const cases: Array<{ label: string; content: string }> = [];
  let currentLabel = '';
  let currentLines: string[] = [];
  let sawMarkers = false;

  const pushCurrent = () => {
    const label = currentLabel.trim() || `case ${cases.length + 1}`;
    const content = currentLines.join('\n').replace(/\n+$/, '');
    cases.push({ label, content });
    currentLines = [];
  };

  for (const line of lines) {
    const marker = line.match(markerRegex);
    if (marker) {
      if (sawMarkers) {
        pushCurrent();
      }
      sawMarkers = true;
      currentLabel = marker[1]?.trim() || `case ${cases.length + 1}`;
      continue;
    }
    currentLines.push(line);
  }

  if (!sawMarkers) {
    return [{ label: 'case 1', content: text }];
  }

  pushCurrent();
  return cases;
}

function formatCodingPracticeCaseLog(
  entries: Array<{ label: string; content: string }>,
  preferRawSingle = false,
) {
  if (entries.length === 0) return '';
  if (entries.length === 1 && preferRawSingle) {
    return entries[0].content;
  }

  return entries
    .map((entry, index) => {
      const header = `=== ${entry.label || `case ${index + 1}`} ===`;
      const body = entry.content.trimEnd();
      return body ? `${header}\n${body}` : header;
    })
    .join('\n\n')
    .trim();
}

function renderCodingPracticeCommand(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}

function inferCodingPracticeCheckTemplate(params: CodingPracticeRunParams) {
  const compileCommand = String(params?.runner?.compileCommand || '').trim();
  if (compileCommand) {
    return compileCommand;
  }

  switch (params?.language) {
    case 'python':
      return 'python3 -m py_compile "{{codeFile}}"';
    case 'javascript':
      return 'node --check "{{codeFile}}"';
    case 'go':
      return 'go build -o "{{binaryFile}}" "{{codeFile}}"';
    case 'swift':
      return 'swiftc -typecheck "{{codeFile}}"';
    default:
      return '';
  }
}

function executeCodingPracticeCommand(command: string, cwd: string, timeoutMs: number) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
    const child = process.platform === 'win32'
      ? spawn(process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', command], { cwd, env: process.env })
      : spawn('/bin/bash', ['-lc', command], { cwd, env: process.env });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (payload: { exitCode: number; stdout: string; stderr: string; timedOut: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      finish({
        exitCode: -1,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        timedOut,
      });
    });
    child.on('close', (code) => {
      finish({
        exitCode: code ?? -1,
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr ? '\n\n' : ''}命令执行超时（${Math.max(1, Math.round(timeoutMs / 1000))} 秒）。`
          : stderr,
        timedOut,
      });
    });
  });
}

function formatCodingPracticeOutput(baseOutput: string, title: string, stderr: string, stdout: string, error?: string) {
  const sections = [`=== ${title} ===`];

  if (baseOutput.trim()) {
    sections.push(`程序输出:\n${baseOutput.trim()}`);
  }
  if ((error || '').trim()) {
    sections.push(`错误信息:\n${(error || '').trim()}`);
  }
  if (stderr.trim()) {
    sections.push(`stderr:\n${stderr.trim()}`);
  }
  if (stdout.trim() && stdout.trim() !== baseOutput.trim()) {
    sections.push(`stdout:\n${stdout.trim()}`);
  }

  return sections.join('\n\n').trim();
}

ipcMain.handle('coding-practice-run', async (_event, params: CodingPracticeRunParams) => {
  const startedAt = Date.now();
  let workDir = '';

  try {
    const files = Array.isArray(params?.files) ? params.files : [];
    const inputFile = files.find(file => file?.id === 'input');
    const codeFile = files.find(file => file?.id === 'code');
    const outputFile = files.find(file => file?.id === 'output');

    if (!codeFile?.name) {
      return {
        success: false,
        stage: 'prepare' as const,
        output: formatCodingPracticeOutput('', '执行失败', '', '', '缺少核心代码文件。'),
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: '缺少核心代码文件',
      };
    }

    const runCommandTemplate = String(params?.runner?.runCommand || '').trim();
    if (!runCommandTemplate) {
      return {
        success: false,
        stage: 'prepare' as const,
        output: formatCodingPracticeOutput('', '执行失败', '', '', '请先配置运行命令。'),
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: '缺少运行命令',
      };
    }

    const runRoot = path.join(app.getPath('userData'), 'coding-practice-runs');
    await fs.mkdir(runRoot, { recursive: true });
    workDir = await fs.mkdtemp(path.join(runRoot, 'run-'));

    const codeFilePath = path.join(workDir, codeFile.name);
    const inputFilePath = path.join(workDir, inputFile?.name || 'input.in');
    const outputFilePath = path.join(workDir, outputFile?.name || 'output.out');
    const binaryFilePath = path.join(workDir, process.platform === 'win32' ? 'main.exe' : 'main.bin');

    await Promise.all([
      fs.writeFile(codeFilePath, codeFile.content || '', 'utf8'),
      fs.writeFile(inputFilePath, inputFile?.content || '', 'utf8'),
      fs.writeFile(outputFilePath, '', 'utf8'),
    ]);

    const variables = {
      workDir,
      codeFile: codeFilePath,
      inputFile: inputFilePath,
      outputFile: outputFilePath,
      binaryFile: binaryFilePath,
    };
    const timeoutMs = Math.max(5000, Math.min(120000, Math.round(Number(params?.runner?.timeoutSeconds || 15) * 1000)));
    const compileCommand = renderCodingPracticeCommand(String(params?.runner?.compileCommand || ''), variables).trim();
    const runCommand = renderCodingPracticeCommand(runCommandTemplate, variables).trim();
    const inputCases = parseCodingPracticeCaseBlocks(inputFile?.content || '');
    const collectedOutputEntries: Array<{ label: string; content: string }> = [];
    const collectedStdoutEntries: Array<{ label: string; content: string }> = [];
    const collectedStderrEntries: Array<{ label: string; content: string }> = [];

    if (compileCommand) {
      const compileResult = await executeCodingPracticeCommand(compileCommand, workDir, timeoutMs);
      if (compileResult.exitCode !== 0) {
        return {
          success: false,
          stage: 'compile' as const,
          output: formatCodingPracticeOutput('', '编译失败', compileResult.stderr, compileResult.stdout, '编译器返回了非零退出码。'),
          stdout: compileResult.stdout,
          stderr: compileResult.stderr,
          durationMs: Date.now() - startedAt,
          caseCount: inputCases.length,
          error: '编译失败',
        };
      }
    }

    for (let index = 0; index < inputCases.length; index += 1) {
      const inputCase = inputCases[index];
      await Promise.all([
        fs.writeFile(inputFilePath, inputCase.content || '', 'utf8'),
        fs.writeFile(outputFilePath, '', 'utf8'),
      ]);

      const runResult = await executeCodingPracticeCommand(runCommand, workDir, timeoutMs);
      const rawOutput = await fs.readFile(outputFilePath, 'utf8').catch(() => '');

      collectedOutputEntries.push({ label: inputCase.label, content: rawOutput });
      if (runResult.stdout.trim()) {
        collectedStdoutEntries.push({ label: inputCase.label, content: runResult.stdout });
      }
      if (runResult.stderr.trim()) {
        collectedStderrEntries.push({ label: inputCase.label, content: runResult.stderr });
      }

      if (runResult.exitCode !== 0) {
        const multiCaseError = inputCases.length > 1 ? `第 ${index + 1} 组用例执行失败。` : '';
        return {
          success: false,
          stage: 'run' as const,
          output: formatCodingPracticeOutput(
            formatCodingPracticeCaseLog(collectedOutputEntries, inputCases.length === 1),
            '运行失败',
            formatCodingPracticeCaseLog(collectedStderrEntries, inputCases.length === 1),
            formatCodingPracticeCaseLog(collectedStdoutEntries, inputCases.length === 1),
            `${multiCaseError}${runResult.timedOut ? '程序执行超时。' : '程序返回了非零退出码。'}`.trim(),
          ),
          stdout: formatCodingPracticeCaseLog(collectedStdoutEntries, inputCases.length === 1),
          stderr: formatCodingPracticeCaseLog(collectedStderrEntries, inputCases.length === 1),
          durationMs: Date.now() - startedAt,
          caseCount: inputCases.length,
          error: '运行失败',
        };
      }
    }

    return {
      success: true,
      stage: 'run' as const,
      output: formatCodingPracticeCaseLog(collectedOutputEntries, inputCases.length === 1),
      stdout: formatCodingPracticeCaseLog(collectedStdoutEntries, inputCases.length === 1),
      stderr: formatCodingPracticeCaseLog(collectedStderrEntries, inputCases.length === 1),
      durationMs: Date.now() - startedAt,
      caseCount: inputCases.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '执行失败';
    return {
      success: false,
      stage: 'prepare' as const,
      output: formatCodingPracticeOutput('', '执行失败', '', '', message),
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startedAt,
      caseCount: 1,
      error: message,
    };
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});

ipcMain.handle('coding-practice-check', async (_event, params: CodingPracticeRunParams) => {
  const startedAt = Date.now();
  let workDir = '';

  try {
    const files = Array.isArray(params?.files) ? params.files : [];
    const inputFile = files.find(file => file?.id === 'input');
    const codeFile = files.find(file => file?.id === 'code');
    const outputFile = files.find(file => file?.id === 'output');

    if (!codeFile?.name) {
      return {
        success: false,
        supported: false,
        stage: 'prepare' as const,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: '缺少核心代码文件',
      };
    }

    const runRoot = path.join(app.getPath('userData'), 'coding-practice-runs');
    await fs.mkdir(runRoot, { recursive: true });
    workDir = await fs.mkdtemp(path.join(runRoot, 'check-'));

    const codeFilePath = path.join(workDir, codeFile.name);
    const inputFilePath = path.join(workDir, inputFile?.name || 'input.in');
    const outputFilePath = path.join(workDir, outputFile?.name || 'output.out');
    const binaryFilePath = path.join(workDir, process.platform === 'win32' ? 'main.exe' : 'main.bin');

    await Promise.all([
      fs.writeFile(codeFilePath, codeFile.content || '', 'utf8'),
      fs.writeFile(inputFilePath, inputFile?.content || '', 'utf8'),
      fs.writeFile(outputFilePath, '', 'utf8'),
    ]);

    const variables = {
      workDir,
      codeFile: codeFilePath,
      inputFile: inputFilePath,
      outputFile: outputFilePath,
      binaryFile: binaryFilePath,
    };
    const timeoutMs = Math.max(3000, Math.min(30000, Math.round(Number(params?.runner?.timeoutSeconds || 15) * 1000)));
    const checkTemplate = inferCodingPracticeCheckTemplate(params);
    const checkCommand = renderCodingPracticeCommand(checkTemplate, variables).trim();

    if (!checkCommand) {
      return {
        success: true,
        supported: false,
        stage: 'prepare' as const,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
      };
    }

    const checkResult = await executeCodingPracticeCommand(checkCommand, workDir, timeoutMs);
    return {
      success: checkResult.exitCode === 0,
      supported: true,
      stage: 'compile' as const,
      stdout: checkResult.stdout,
      stderr: checkResult.stderr,
      durationMs: Date.now() - startedAt,
      error: checkResult.exitCode === 0
        ? undefined
        : (checkResult.timedOut ? '检查超时' : '语法检查失败'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '语法检查失败';
    return {
      success: false,
      supported: false,
      stage: 'prepare' as const,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startedAt,
      error: message,
    };
  } finally {
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});

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

/** 从 PDF 文件提取纯文本 — 主进程执行
 * 优先使用 pdf-parse（对双栏学术 PDF 和特殊字体更可靠），失败后回退到 pdfjs legacy build
 */
ipcMain.handle('extract-pdf-text', async (_, filePath: string): Promise<string | null> => {
  const buf = await fs.readFile(filePath) as Buffer;

  // ── 首选：pdf-parse（纯 Node.js，无 Worker，处理学术 PDF 效果更好）──
  try {
    const pdfParseModule = await import('pdf-parse') as any;
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    const result = await pdfParse(buf);
    if (result.text && result.text.trim()) {
      // 按换页符分页，保留原始段落结构
      const pages = result.text
        .split(/\f/)
        .map((p: string, i: number) => p.trim() ? `[第${i + 1}页]\n${p.trim()}` : '')
        .filter(Boolean);
      return pages.join('\n\n') || result.text;
    }
  } catch (e) {
    console.warn('pdf-parse failed, falling back to pdfjs:', (e as Error).message);
  }

  // ── 回退：pdfjs legacy build ──
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    const data = new Uint8Array(buf);
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
    console.error('extract-pdf-text (pdfjs fallback) failed:', (e as Error).message);
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

// ── Music Player IPC ───────────────────────────────────────────────────────
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus',
  '.wma', '.aiff', '.aif', '.ape', '.dsf', '.dff', '.wv',
]);

function isAudioFile(fileName: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

async function scanAudioFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanAudioFiles(fullPath);
        results.push(...sub);
      } else if (isAudioFile(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

// ── RAG Lab IPC ──
ipcMain.handle('rag-select-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '文档', extensions: ['pdf', 'md', 'markdown', 'mdx', 'txt', 'html', 'htm', 'json', 'yaml', 'yml', 'xml', 'csv', 'log', 'toml', 'ini', 'conf'] },
      { name: '代码', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'scala', 'sql', 'sh', 'lua', 'dart', 'vue', 'svelte', 'css', 'scss', 'less'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('rag-select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('music-select-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '音频文件', extensions: ['mp3','flac','wav','aac','ogg','m4a','opus','wma','aiff','aif','ape','dsf','wv'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('music-select-folder', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return scanAudioFiles(result.filePaths[0]);
});

ipcMain.handle('music-parse-metadata', async (_, filePath: string) => {
  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath);
    const common = metadata.common;
    const fmt = metadata.format;

    let coverBase64: string | undefined;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      coverBase64 = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
    }

    return {
      title: common.title || path.basename(filePath, path.extname(filePath)),
      artist: common.artist || '未知艺术家',
      album: common.album || '未知专辑',
      duration: fmt.duration || 0,
      format: (path.extname(filePath).replace('.', '') || 'unknown').toUpperCase(),
      sampleRate: fmt.sampleRate,
      bitDepth: fmt.bitsPerSample,
      bitrate: fmt.bitrate ? Math.round(fmt.bitrate / 1000) : undefined,
      lossless: fmt.lossless ?? false,
      coverArt: coverBase64,
      composer: Array.isArray(common.composer) ? common.composer.join(', ') : common.composer,
      lyricist: (common as any).lyricist ? (Array.isArray((common as any).lyricist) ? (common as any).lyricist.join(', ') : (common as any).lyricist) : undefined,
      genre: common.genre ? common.genre.join(', ') : undefined,
      year: common.year,
      trackNumber: common.track?.no ?? undefined,
      discNumber: common.disk?.no ?? undefined,
    };
  } catch (error) {
    console.error('Failed to parse audio metadata:', filePath, error);
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artist: '未知艺术家',
      album: '未知专辑',
      duration: 0,
      format: (path.extname(filePath).replace('.', '') || 'unknown').toUpperCase(),
      lossless: false,
    };
  }
});

ipcMain.handle('music-import-lyrics', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: '歌词文件', extensions: ['lrc', 'txt'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const fsSync = await import('fs');
  return fsSync.readFileSync(result.filePaths[0], 'utf-8');
});

// AI lyrics recognition via Whisper API
ipcMain.handle('music-ai-lyrics', async (_, opts: { filePath: string; apiKey: string; baseUrl: string; provider: string; model?: string; language?: string }) => {
  const fsSync = await import('fs');
  const nodePath = await import('path');

  const stat = fsSync.statSync(opts.filePath);
  const fileName = nodePath.basename(opts.filePath);
  const ext = nodePath.extname(opts.filePath).replace('.', '').toLowerCase();
  const mimeMap: Record<string, string> = { mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4', opus: 'audio/opus', aiff: 'audio/aiff', aif: 'audio/aiff', wma: 'audio/x-ms-wma' };
  const mime = mimeMap[ext] || 'audio/mpeg';

  // Helper: convert Whisper-style segments to LRC
  const toLrc = (segments: Array<{ start: number; text: string }>) => {
    return segments.map(seg => {
      const min = Math.floor(seg.start / 60);
      const sec = (seg.start % 60).toFixed(2).padStart(5, '0');
      return `[${min.toString().padStart(2, '0')}:${sec}]${seg.text.trim()}`;
    }).join('\n');
  };

  try {
    // ── Gemini path: multimodal generateContent ──
    if (opts.provider === 'gemini') {
      const fileData = fsSync.readFileSync(opts.filePath);
      const geminiBase = opts.baseUrl.replace(/\/+$/, '').replace(/\/v1beta$/, '').replace(/\/v1$/, '');
      const model = opts.model || 'gemini-2.5-flash';
      const MAX_INLINE = 20 * 1024 * 1024;

      let filePart: any;

      if (stat.size > MAX_INLINE) {
        // Use Gemini File API for large files (supports up to 2GB)
        // Step 1: Upload file via resumable upload
        const initUrl = `${geminiBase}/upload/v1beta/files?key=${opts.apiKey}`;
        const initRes = await fetch(initUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(stat.size),
            'X-Goog-Upload-Header-Content-Type': mime,
          },
          body: JSON.stringify({ file: { display_name: fileName } }),
        });
        if (!initRes.ok) {
          const errText = await initRes.text();
          return { error: `Gemini 文件上传初始化失败 (${initRes.status}): ${errText.substring(0, 300)}` };
        }
        const uploadUrl = initRes.headers.get('X-Goog-Upload-URL') || initRes.headers.get('x-goog-upload-url');
        if (!uploadUrl) return { error: 'Gemini 文件上传失败：未获取到上传 URL' };

        // Step 2: Upload the actual bytes
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(stat.size),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
          },
          body: fileData,
        });
        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          return { error: `Gemini 文件上传失败 (${uploadRes.status}): ${errText.substring(0, 300)}` };
        }
        const uploadData = await uploadRes.json() as any;
        const fileUri = uploadData.file?.uri;
        if (!fileUri) return { error: 'Gemini 文件上传失败：未获取到文件 URI' };

        // Step 3: Poll until file is ACTIVE
        const fileApiName = uploadData.file?.name;
        if (fileApiName) {
          for (let i = 0; i < 60; i++) {
            const statusRes = await fetch(`${geminiBase}/v1beta/${fileApiName}?key=${opts.apiKey}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json() as any;
              if (statusData.state === 'ACTIVE') break;
              if (statusData.state === 'FAILED') return { error: 'Gemini 文件处理失败' };
            }
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        filePart = { file_data: { mime_type: mime, file_uri: fileUri } };
      } else {
        // Inline base64 for smaller files
        const b64 = fileData.toString('base64');
        filePart = { inline_data: { mime_type: mime, data: b64 } };
      }

      const url = `${geminiBase}/v1beta/models/${model}:generateContent?key=${opts.apiKey}`;
      const body = JSON.stringify({
        contents: [{
          parts: [
            filePart,
            { text: '请仔细听这段音频，识别其中的歌词/人声内容。输出标准 LRC 格式，每行格式为 [mm:ss.xx]歌词内容。时间戳必须精确对应音频中该句歌词的起始时间。所有中文歌词必须使用简体中文，不要输出繁体中文。英文歌词保留英文原文。只输出 LRC 内容，不要输出任何其它解释。' }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) {
        const errText = await response.text();
        return { error: `Gemini API 请求失败 (${response.status}): ${errText.substring(0, 300)}` };
      }
      const data = await response.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text.trim()) return { error: '未识别到任何歌词内容' };
      const lrcLines = text.split('\n').filter((l: string) => l.match(/^\[[\d:.\[\]]+\]/)).join('\n');
      return { lrc: lrcLines || text, text };
    }

    // ── Whisper path (OpenAI / Zenmux / compatible) ──
    const MAX_WHISPER = 25 * 1024 * 1024;
    if (stat.size > MAX_WHISPER) {
      return { error: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，Whisper API 限制 25MB。建议切换到 Gemini 作为 AI 提供商，支持最大 2GB 文件。` };
    }

    const fileData = fsSync.readFileSync(opts.filePath);
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const parts: Buffer[] = [];
    const addField = (name: string, value: string) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`));
    parts.push(fileData);
    parts.push(Buffer.from('\r\n'));
    addField('model', 'whisper-1');
    addField('response_format', 'verbose_json');
    addField('timestamp_granularities[]', 'segment');
    addField('language', opts.language || 'zh');
    addField('prompt', '请使用简体中文输出歌词，不要使用繁体中文。');
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const url = opts.baseUrl.replace(/\/+$/, '') + '/audio/transcriptions';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    if (!response.ok) {
      const errText = await response.text();
      return { error: `API 请求失败 (${response.status}): ${errText.substring(0, 300)}` };
    }
    const data = await response.json() as any;
    const segments = data.segments || [];
    if (segments.length === 0) return { error: '未识别到任何歌词内容' };
    return { lrc: toLrc(segments), text: data.text || '' };
  } catch (err: any) {
    return { error: `请求异常: ${err.message || err}` };
  }
});

// Check if a file exists
ipcMain.handle('music-file-exists', async (_, filePath: string) => {
  const fsSync = await import('fs');
  return fsSync.existsSync(filePath);
});

// Select a cover image and return base64
ipcMain.handle('music-select-cover', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const fsSync = await import('fs');
  const nodePath = await import('path');
  const data = fsSync.readFileSync(result.filePaths[0]);
  const ext = nodePath.extname(result.filePaths[0]).replace('.', '').toLowerCase();
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };
  const mime = mimeMap[ext] || 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
});

// Re-link a track file (user picks new location)
ipcMain.handle('music-relink-file', async () => {
  const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff', 'aif', 'ape', 'dsf', 'dff', 'wv'];
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: '音频文件', extensions: AUDIO_EXTS }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
