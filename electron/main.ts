import { app, BrowserWindow, ipcMain, shell, dialog, session, net } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';
import { createServer as createTcpServer } from 'net';
import pty from 'node-pty';
import os from 'os';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { spawn, exec, execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let zenmuxUsageWindow: BrowserWindow | null = null;
const codexUsageWindows = new Map<string, BrowserWindow>();
let aiStudioWindow: BrowserWindow | null = null;

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const OPENCODE_VERSION = '1.14.29';
const OPENCODE_AUTH_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
const OPENCODE_DB_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const OPENCODE_EMBEDDED_TUI_CONFIG = {
  $schema: 'https://opencode.ai/tui.json',
  keybinds: {
    status_view: 'none',
  },
  plugin_enabled: {
    'internal:sidebar-context': false,
    'internal:sidebar-mcp': false,
    'internal:sidebar-lsp': false,
    'internal:sidebar-todo': false,
    'internal:sidebar-files': false,
    'internal:sidebar-footer': false,
  },
};

const OPENCODE_PROVIDER_LABELS: Record<string, string> = {
  opencode: 'OpenCode',
  zenmux: 'ZenMux',
  'github-copilot': 'GitHub Copilot',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI (China)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openrouter: 'OpenRouter',
  xai: 'xAI',
};

const MODELS_DEV_PROVIDER_ALIASES: Record<string, string[]> = {
  openai: ['openai'],
  anthropic: ['anthropic'],
  google: ['google'],
  xai: ['xai'],
  openrouter: ['openrouter'],
  'github-copilot': ['github-copilot'],
  moonshotai: ['moonshotai', 'moonshot'],
  'moonshotai-cn': ['moonshotai-cn', 'moonshot'],
  zenmux: ['zenmux', 'opencode'],
  opencode: ['opencode'],
};

let modelsDevCache: { data: any; fetchedAt: number } | null = null;
const opencodeProvidersSnapshotCache = new Map<string, {
  fetchedAt: number;
  data: {
    providers: Array<{ id: string; label: string; authType: string; hasStoredCredential: boolean }>;
    knownModelsByProvider: Record<string, string[]>;
    defaultModelsByProvider: Record<string, string>;
  };
}>();

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAvailablePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createTcpServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function normalizeOpenCodeProviderSnapshot(payload: any) {
  const providersRaw = Array.isArray(payload?.providers) ? payload.providers : [];
  const defaultsRaw = payload?.default && typeof payload.default === 'object' ? payload.default : {};

  const providers: Array<{ id: string; label: string; authType: string; hasStoredCredential: boolean }> = [];
  const knownModelsByProvider: Record<string, string[]> = {};
  const defaultModelsByProvider: Record<string, string> = {};

  for (const provider of providersRaw) {
    if (!provider || typeof provider !== 'object') continue;
    const id = typeof provider.id === 'string' ? provider.id.trim() : '';
    if (!id) continue;

    const label = typeof provider.name === 'string' && provider.name.trim()
      ? provider.name.trim()
      : (OPENCODE_PROVIDER_LABELS[id] || id);
    const authType = typeof provider.source === 'string' && provider.source.trim()
      ? provider.source.trim()
      : 'unknown';

    const modelsObject = provider.models && typeof provider.models === 'object' ? provider.models : {};
    const modelIds = dedupeStrings(Object.keys(modelsObject));
    if (modelIds.length) {
      knownModelsByProvider[id] = modelIds;
    }

    const defaultModel = typeof defaultsRaw[id] === 'string' ? defaultsRaw[id].trim() : '';
    if (defaultModel) {
      defaultModelsByProvider[id] = defaultModel;
      knownModelsByProvider[id] = dedupeStrings([...(knownModelsByProvider[id] || []), defaultModel]);
    }

    providers.push({
      id,
      label,
      authType,
      hasStoredCredential: true,
    });
  }

  return {
    providers,
    knownModelsByProvider,
    defaultModelsByProvider,
  };
}

async function fetchOpenCodeProvidersSnapshot(directory?: string, options?: { force?: boolean }) {
  const binaryPath = getOpenCodeBinaryPath();
  const cwd = directory?.trim() || getOpenCodeDefaultCwd();
  const cacheKey = cwd || '__default__';
  const cached = opencodeProvidersSnapshotCache.get(cacheKey);
  const ttlMs = 15_000;

  if (!options?.force && cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.data;
  }

  const port = await getAvailablePort();
  const child = spawn(binaryPath, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: '',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk || '');
  });

  const requestUrl = `http://127.0.0.1:${port}/config/providers`;

  try {
    const deadline = Date.now() + 8_000;
    let response: any = null;

    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(stderr.trim() || `OpenCode server exited with code ${child.exitCode}`);
      }

      try {
        const attempt = await net.fetch(requestUrl);
        if (attempt.ok) {
          response = attempt;
          break;
        }
      } catch {
        // Server is still booting.
      }

      await wait(150);
    }

    if (!response) {
      throw new Error(stderr.trim() || 'Timed out waiting for OpenCode provider snapshot');
    }

    const payload = await response.json();
    const normalized = normalizeOpenCodeProviderSnapshot(payload);
    opencodeProvidersSnapshotCache.set(cacheKey, { fetchedAt: Date.now(), data: normalized });
    return normalized;
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed && child.exitCode === null) {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
        }
      }, 500).unref?.();
    }
  }
}

function hasStoredOpenCodeCredential(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['key', 'apiKey', 'token', 'access', 'refresh']
    .some((field) => {
      const candidate = record[field];
      return typeof candidate === 'string' && candidate.trim() !== '';
    });
}

async function loadOpenCodeModelCatalog() {
  try {
    await fs.access(OPENCODE_DB_PATH);
  } catch {
    return {} as Record<string, string[]>;
  }

  return await new Promise<Record<string, string[]>>((resolve) => {
    execFile(
      'sqlite3',
      [
        '-separator',
        '\t',
        OPENCODE_DB_PATH,
        `
          select providerId, modelId
          from (
            select
              coalesce(json_extract(data, '$.providerID'), json_extract(data, '$.model.providerID')) as providerId,
              coalesce(json_extract(data, '$.modelID'), json_extract(data, '$.model.modelID')) as modelId
            from message
            where json_extract(data, '$.role') = 'assistant'
          )
          where providerId is not null and providerId != ''
            and modelId is not null and modelId != ''
          group by providerId, modelId
          order by providerId, modelId
        `,
      ],
      { timeout: 4000 },
      (_error, stdout) => {
        const catalog: Record<string, string[]> = {};
        for (const line of (stdout || '').split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const [providerId, modelId] = trimmed.split('\t');
          if (!providerId || !modelId) continue;
          catalog[providerId] = [...new Set([...(catalog[providerId] || []), modelId])];
        }
        resolve(catalog);
      },
    );
  });
}

async function loadOpenCodeProviders() {
  const modelCatalog = await loadOpenCodeModelCatalog();
  const builtin = [{ id: 'opencode', label: 'OpenCode', authType: 'builtin', hasStoredCredential: true }];

  try {
    const raw = await fs.readFile(OPENCODE_AUTH_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown> & { type?: string }>;
    const providers = Object.entries(parsed).map(([id, value]) => ({
      id,
      label: OPENCODE_PROVIDER_LABELS[id] || id,
      authType: value?.type || 'unknown',
      hasStoredCredential: hasStoredOpenCodeCredential(value),
    }));

    const deduped = [...builtin, ...providers].filter((provider, index, all) =>
      all.findIndex((item) => item.id === provider.id) === index,
    );
    return {
      providers: deduped,
      authPath: OPENCODE_AUTH_PATH,
      knownModelsByProvider: modelCatalog,
      defaultModelsByProvider: {},
    };
  } catch {
    return {
      providers: builtin,
      authPath: OPENCODE_AUTH_PATH,
      knownModelsByProvider: modelCatalog,
      defaultModelsByProvider: {},
    };
  }
}

async function fetchModelsDevApiPayload() {
  const now = Date.now();
  if (modelsDevCache && now - modelsDevCache.fetchedAt < 10 * 60 * 1000) {
    return modelsDevCache.data;
  }

  const response = await net.fetch('https://models.dev/api.json');
  if (!response.ok) {
    throw new Error(`models.dev api responded with ${response.status}`);
  }

  const data = await response.json();
  modelsDevCache = { data, fetchedAt: now };
  return data;
}

function extractModelId(value: Record<string, any>) {
  const candidates = [
    value.modelID,
    value.modelId,
    value.id,
    value.model?.id,
    value.model?.modelID,
    value.model?.modelId,
  ];

  return candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())?.trim() || '';
}

function pushModelsFromList(target: Set<string>, items: any[]) {
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const modelId = extractModelId(item);
    if (modelId) {
      target.add(modelId);
    }
  }
}

function extractModelsFromModelsDevPayload(payload: any, providerId: string) {
  const aliases = new Set(MODELS_DEV_PROVIDER_ALIASES[providerId] || [providerId]);
  const models = new Set<string>();

  const matchesProvider = (value: Record<string, any>) => {
    const candidates = [
      value.providerId,
      value.providerID,
      value.provider_id,
      typeof value.provider === 'string' ? value.provider : undefined,
      value.provider?.id,
      value.provider?.providerId,
      value.provider?.providerID,
    ];

    return candidates.some((candidate) => typeof candidate === 'string' && aliases.has(candidate));
  };

  const visit = (value: any) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value !== 'object') return;

    if (matchesProvider(value)) {
      const modelId = extractModelId(value);
      if (modelId) {
        models.add(modelId);
      }
    }

    if (value.providers && typeof value.providers === 'object') {
      for (const alias of aliases) {
        const providerEntry = value.providers[alias];
        if (!providerEntry) continue;

        if (Array.isArray(providerEntry)) {
          pushModelsFromList(models, providerEntry);
          continue;
        }

        if (providerEntry && typeof providerEntry === 'object') {
          if (Array.isArray(providerEntry.models)) {
            pushModelsFromList(models, providerEntry.models);
          }
          const directModelId = extractModelId(providerEntry);
          if (directModelId) {
            models.add(directModelId);
          }
        }
      }
    }

    if (Array.isArray(value.models)) {
      if (matchesProvider(value)) {
        pushModelsFromList(models, value.models);
      } else {
        value.models.forEach((model: any) => {
          if (!model || typeof model !== 'object') return;
          const composite = {
            ...model,
            provider: model.provider ?? value.provider ?? value.id,
            providerId: model.providerId ?? value.providerId ?? value.id,
            providerID: model.providerID ?? value.providerID ?? value.id,
          };
          if (!matchesProvider(composite)) return;
          const modelId = extractModelId(composite);
          if (modelId) {
            models.add(modelId);
          }
        });
      }
    }
  };

  visit(payload);
  return Array.from(models).sort((a, b) => a.localeCompare(b));
}

async function loadOpenCodeProviderModels(providerId: string, directory?: string) {
  const localCatalog = await loadOpenCodeModelCatalog();
  const localModels = localCatalog[providerId] || [];

  try {
    const snapshot = await fetchOpenCodeProvidersSnapshot(directory);
    const snapshotModels = snapshot.knownModelsByProvider[providerId] || [];
    if (snapshotModels.length) {
      return {
        models: dedupeStrings([...snapshotModels, ...localModels]),
        defaultModel: snapshot.defaultModelsByProvider[providerId] || '',
        source: 'opencode' as const,
      };
    }
  } catch {
    // Fall through to secondary sources.
  }

  try {
    const payload = await fetchModelsDevApiPayload();
    const remoteModels = extractModelsFromModelsDevPayload(payload, providerId);
    return {
      models: [...new Set([...remoteModels, ...localModels])],
      defaultModel: '',
      source: remoteModels.length ? 'models.dev' : 'local',
    };
  } catch {
    return {
      models: [...new Set(localModels)],
      defaultModel: '',
      source: 'local',
    };
  }
}

function getOpenCodeBinaryPath() {
  if (isDev) {
    return path.join(process.cwd(), 'node_modules', 'opencode-ai', 'bin', '.opencode');
  }
  return path.join(process.resourcesPath, 'vendor', 'opencode', 'bin', '.opencode');
}

function getOpenCodeDefaultCwd() {
  return isDev ? process.cwd() : app.getPath('home');
}

async function ensureEmbeddedOpenCodeTuiConfig() {
  const targetDir = path.join(app.getPath('userData'), 'opencode');
  const filePath = path.join(targetDir, 'embedded-tui.json');
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(OPENCODE_EMBEDDED_TUI_CONFIG, null, 2), 'utf-8');
  return filePath;
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function parseSimpleShellArgs(input: string) {
  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (value) {
      tokens.push(value.replace(/\\(["'\\ ])/g, '$1'));
    }
  }

  return tokens;
}

function safeParseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function collectOpenCodeStreamText(value: unknown, results: Array<{ key: string; text: string }> = [], pathKey = 'root') {
  if (!value || typeof value !== 'object') return results;

  const record = value as Record<string, any>;
  const type = typeof record.type === 'string' ? record.type : '';
  const text = typeof record.text === 'string' ? record.text : '';
  if (type === 'text' && text) {
    results.push({
      key: String(record.id || record.partID || record.messageID || pathKey),
      text,
    });
  }

  ['part', 'data', 'properties', 'message', 'content', 'delta'].forEach((key) => {
    if (record[key]) collectOpenCodeStreamText(record[key], results, `${pathKey}.${key}`);
  });

  if (Array.isArray(record.parts)) {
    record.parts.forEach((part, index) => collectOpenCodeStreamText(part, results, `${pathKey}.parts.${index}`));
  }

  return results;
}

async function runOpenCodeDbQuery<T = any>(query: string): Promise<T[]> {
  const binaryPath = getOpenCodeBinaryPath();

  return await new Promise((resolve, reject) => {
    execFile(binaryPath, ['db', query, '--format', 'json'], { timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }

      try {
        resolve(JSON.parse(stdout || '[]') as T[]);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

async function loadOpenCodeRuntimeState(params: {
  directory?: string;
  officialSessionId?: string;
  startedAfter?: number;
  providerId?: string;
}) {
  const filters: string[] = [];

  if (params.officialSessionId) {
    filters.push(`id = ${sqlLiteral(params.officialSessionId)}`);
  } else if (params.directory) {
    filters.push(`directory = ${sqlLiteral(params.directory)}`);
    if (params.startedAfter) {
      filters.push(`time_created >= ${Math.floor(params.startedAfter)}`);
    }
  }

  let session: {
    id: string;
    title: string;
    directory: string;
    projectId: string;
    timeCreated: number;
    timeUpdated: number;
  } | null = null;

  if (filters.length) {
    const rows = await runOpenCodeDbQuery<{
      id: string;
      title: string;
      directory: string;
      projectId: string;
      timeCreated: number;
      timeUpdated: number;
    }>(`
      select
        id,
        title,
        directory,
        project_id as projectId,
        time_created as timeCreated,
        time_updated as timeUpdated
      from session
      where ${filters.join(' and ')}
      order by time_updated desc
      limit 1
    `);
    session = rows[0] || null;
  }

  if (!session && params.directory && !params.startedAfter && !params.officialSessionId) {
    const fallbackRows = await runOpenCodeDbQuery<{
      id: string;
      title: string;
      directory: string;
      projectId: string;
      timeCreated: number;
      timeUpdated: number;
    }>(`
      select
        id,
        title,
        directory,
        project_id as projectId,
        time_created as timeCreated,
        time_updated as timeUpdated
      from session
      where directory = ${sqlLiteral(params.directory)}
      order by time_updated desc
      limit 1
    `);
    session = fallbackRows[0] || null;
  }

  if (!session) {
    return {
      session: null,
      latestUsage: null,
      sessionTotals: {
        turns: 0,
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      knownModels: [],
      plan: {
        available: false,
        note: '官方本地库未提供',
      },
      source: 'database' as const,
      lastUpdated: Date.now(),
    };
  }

  const latestUsageRows = await runOpenCodeDbQuery<{
    providerId: string | null;
    modelId: string | null;
    cost: number | null;
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    timeUpdated: number | null;
  }>(`
    select
      coalesce(json_extract(data, '$.providerID'), json_extract(data, '$.model.providerID')) as providerId,
      coalesce(json_extract(data, '$.modelID'), json_extract(data, '$.model.modelID')) as modelId,
      cast(coalesce(json_extract(data, '$.cost'), 0) as real) as cost,
      cast(coalesce(json_extract(data, '$.tokens.total'), 0) as integer) as totalTokens,
      cast(coalesce(json_extract(data, '$.tokens.input'), 0) as integer) as inputTokens,
      cast(coalesce(json_extract(data, '$.tokens.output'), 0) as integer) as outputTokens,
      cast(coalesce(json_extract(data, '$.tokens.reasoning'), 0) as integer) as reasoningTokens,
      cast(coalesce(json_extract(data, '$.tokens.cache.read'), 0) as integer) as cacheReadTokens,
      cast(coalesce(json_extract(data, '$.tokens.cache.write'), 0) as integer) as cacheWriteTokens,
      time_updated as timeUpdated
    from message
    where session_id = ${sqlLiteral(session.id)}
      and json_extract(data, '$.role') = 'assistant'
    order by time_updated desc
    limit 1
  `);

  const totalsRows = await runOpenCodeDbQuery<{
    turns: number | null;
    totalCost: number | null;
    totalTokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
  }>(`
    select
      count(*) as turns,
      round(coalesce(sum(cast(coalesce(json_extract(data, '$.cost'), 0) as real)), 0), 8) as totalCost,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.total'), 0) as integer)), 0) as totalTokens,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.input'), 0) as integer)), 0) as inputTokens,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.output'), 0) as integer)), 0) as outputTokens,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.reasoning'), 0) as integer)), 0) as reasoningTokens,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.cache.read'), 0) as integer)), 0) as cacheReadTokens,
      coalesce(sum(cast(coalesce(json_extract(data, '$.tokens.cache.write'), 0) as integer)), 0) as cacheWriteTokens
    from message
    where session_id = ${sqlLiteral(session.id)}
      and json_extract(data, '$.role') = 'assistant'
  `);

  const effectiveProviderId = latestUsageRows[0]?.providerId || params.providerId || '';
  const knownModelRows = effectiveProviderId
    ? await runOpenCodeDbQuery<{ modelId: string | null }>(`
        select modelId
        from (
          select
            coalesce(json_extract(data, '$.modelID'), json_extract(data, '$.model.modelID')) as modelId,
            time_updated as timeUpdated
          from message
          where coalesce(json_extract(data, '$.providerID'), json_extract(data, '$.model.providerID')) = ${sqlLiteral(effectiveProviderId)}
        )
        where modelId is not null and modelId != ''
        order by timeUpdated desc
        limit 50
      `)
    : [];

  const latestUsage = latestUsageRows[0]
    ? {
        providerId: latestUsageRows[0].providerId,
        providerLabel: latestUsageRows[0].providerId ? (OPENCODE_PROVIDER_LABELS[latestUsageRows[0].providerId] || latestUsageRows[0].providerId) : null,
        modelId: latestUsageRows[0].modelId,
        cost: Number(latestUsageRows[0].cost || 0),
        tokens: {
          total: Number(latestUsageRows[0].totalTokens || 0),
          input: Number(latestUsageRows[0].inputTokens || 0),
          output: Number(latestUsageRows[0].outputTokens || 0),
          reasoning: Number(latestUsageRows[0].reasoningTokens || 0),
          cacheRead: Number(latestUsageRows[0].cacheReadTokens || 0),
          cacheWrite: Number(latestUsageRows[0].cacheWriteTokens || 0),
        },
        timeUpdated: latestUsageRows[0].timeUpdated || null,
      }
    : null;

  const totals = totalsRows[0] || {};

  return {
    session,
    latestUsage,
    sessionTotals: {
      turns: Number(totals.turns || 0),
      totalCost: Number(totals.totalCost || 0),
      totalTokens: Number(totals.totalTokens || 0),
      inputTokens: Number(totals.inputTokens || 0),
      outputTokens: Number(totals.outputTokens || 0),
      reasoningTokens: Number(totals.reasoningTokens || 0),
      cacheReadTokens: Number(totals.cacheReadTokens || 0),
      cacheWriteTokens: Number(totals.cacheWriteTokens || 0),
    },
    knownModels: [...new Set(knownModelRows.map((row) => row.modelId).filter((value): value is string => Boolean(value)))],
    plan: {
      available: false,
      note: '官方本地库未提供',
    },
    source: 'database' as const,
    lastUpdated: Date.now(),
  };
}

async function listOpenCodeSessions(directory: string) {
  if (!directory.trim()) return [];

  return await runOpenCodeDbQuery<{
    id: string;
    title: string;
    directory: string;
    projectId: string;
    timeCreated: number;
    timeUpdated: number;
    version: string | null;
  }>(`
    select
      id,
      title,
      directory,
      project_id as projectId,
      time_created as timeCreated,
      time_updated as timeUpdated,
      version
    from session
    where directory = ${sqlLiteral(directory.trim())}
    order by time_updated desc
    limit 100
  `);
}

async function listOpenCodeSessionMessages(sessionId: string) {
  if (!sessionId.trim()) return [];

  const rows = await runOpenCodeDbQuery<{
    messageId: string;
    role: string | null;
    messageData: string;
    messageTimeCreated: number;
    messageTimeUpdated: number;
    providerId: string | null;
    modelId: string | null;
    partId: string | null;
    partTimeCreated: number | null;
    partTimeUpdated: number | null;
    partData: string | null;
  }>(`
    select
      m.id as messageId,
      json_extract(m.data, '$.role') as role,
      m.data as messageData,
      m.time_created as messageTimeCreated,
      m.time_updated as messageTimeUpdated,
      coalesce(json_extract(m.data, '$.providerID'), json_extract(m.data, '$.model.providerID')) as providerId,
      coalesce(json_extract(m.data, '$.modelID'), json_extract(m.data, '$.model.modelID')) as modelId,
      p.id as partId,
      p.time_created as partTimeCreated,
      p.time_updated as partTimeUpdated,
      p.data as partData
    from message m
    left join part p on p.message_id = m.id
    where m.session_id = ${sqlLiteral(sessionId.trim())}
    order by m.time_created asc, p.time_created asc, p.time_updated asc
  `);

  const messages = new Map<string, {
    id: string;
    role: 'user' | 'assistant' | 'system';
    providerId: string | null;
    modelId: string | null;
    timeCreated: number;
    timeUpdated: number;
    textSegments: string[];
    hasReasoning: boolean;
    hasTool: boolean;
    cost: number | null;
    totalTokens: number | null;
    parts: Array<Record<string, any>>;
  }>();

  for (const row of rows) {
    if (!messages.has(row.messageId)) {
      const messageData = safeParseJson<Record<string, any>>(row.messageData);
      messages.set(row.messageId, {
        id: row.messageId,
        role: (row.role === 'assistant' || row.role === 'system' ? row.role : 'user'),
        providerId: row.providerId || null,
        modelId: row.modelId || null,
        timeCreated: Number(row.messageTimeCreated || 0),
        timeUpdated: Number(row.messageTimeUpdated || 0),
        textSegments: [],
        hasReasoning: false,
        hasTool: false,
        cost: typeof messageData?.cost === 'number' ? messageData.cost : null,
        totalTokens: typeof messageData?.tokens?.total === 'number' ? messageData.tokens.total : null,
        parts: [],
      });
    }

    const target = messages.get(row.messageId)!;
    const partData = safeParseJson<Record<string, any>>(row.partData);
    const partType = typeof partData?.type === 'string' ? partData.type : '';

    if (partType === 'text' && typeof partData?.text === 'string' && partData.text.trim()) {
      target.textSegments.push(partData.text);
    } else if (partType === 'reasoning') {
      target.hasReasoning = true;
    } else if (partType === 'tool' || partType === 'patch' || partType === 'file') {
      target.hasTool = true;
    } else if (partType === 'step-finish') {
      if (typeof partData?.cost === 'number') {
        target.cost = partData.cost;
      }
      if (typeof partData?.tokens?.total === 'number') {
        target.totalTokens = partData.tokens.total;
      }
    }

    if (partType && partType !== 'text' && partType !== 'step-start' && partType !== 'step-finish' && partType !== 'compaction') {
      const state = partData?.state && typeof partData.state === 'object' ? partData.state : {};
      target.parts.push({
        id: row.partId,
        type: partType,
        timeCreated: row.partTimeCreated || null,
        timeUpdated: row.partTimeUpdated || null,
        text: typeof partData?.text === 'string' ? partData.text : '',
        isRedactedReasoning: partType === 'reasoning' && !partData?.text && Boolean(partData?.metadata),
        tool: typeof partData?.tool === 'string' ? partData.tool : '',
        callId: typeof partData?.callID === 'string' ? partData.callID : '',
        status: typeof state.status === 'string' ? state.status : '',
        title: typeof state.title === 'string' ? state.title : typeof partData?.title === 'string' ? partData.title : '',
        input: state.input ?? null,
        output: typeof state.output === 'string' ? state.output : '',
        metadata: state.metadata ?? null,
        files: Array.isArray(partData?.files) ? partData.files : [],
        hash: typeof partData?.hash === 'string' ? partData.hash : '',
        filename: typeof partData?.filename === 'string' ? partData.filename : '',
        mime: typeof partData?.mime === 'string' ? partData.mime : '',
        url: typeof partData?.url === 'string' ? partData.url : '',
      });
    }
  }

  return Array.from(messages.values()).map((message) => ({
    id: message.id,
    role: message.role,
    providerId: message.providerId,
    modelId: message.modelId,
    timeCreated: message.timeCreated,
    timeUpdated: message.timeUpdated,
    text: message.textSegments.join('\n\n').trim(),
    hasReasoning: message.hasReasoning,
    hasTool: message.hasTool,
    cost: message.cost,
    totalTokens: message.totalTokens,
    parts: message.parts,
  }));
}

async function runOpenCodePrompt(params: {
  directory: string;
  officialSessionId?: string;
  title?: string;
  providerId?: string;
  modelId?: string;
  argsText?: string;
  env?: Record<string, string>;
  prompt: string;
  streamId?: string;
  streamSender?: Electron.WebContents;
}) {
  const binaryPath = getOpenCodeBinaryPath();
  const cwd = params.directory.trim() || getOpenCodeDefaultCwd();
  const prompt = params.prompt.trim();

  if (!prompt) {
    return { ok: false, error: 'empty-prompt' };
  }

  const args = ['run', '--format', 'json', '--dir', cwd];

  if (params.officialSessionId?.trim()) {
    args.push('--session', params.officialSessionId.trim());
  } else if (params.title?.trim()) {
    args.push('--title', params.title.trim());
  }

  if (params.providerId?.trim() && params.modelId?.trim()) {
    args.push('--model', `${params.providerId.trim()}/${params.modelId.trim()}`);
  }

  if (params.argsText?.trim()) {
    args.push(...parseSimpleShellArgs(params.argsText.trim()));
  }

  args.push(prompt);

  const startedAt = Date.now();

  return await new Promise<{
    ok: boolean;
    error?: string;
    stdout?: string;
    stderr?: string;
    sessionId?: string | null;
    sessionTitle?: string | null;
  }>((resolve) => {
    const child = spawn(binaryPath, args, {
      cwd,
      env: {
        ...process.env,
        ...(params.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutLineBuffer = '';
    const streamedTextByKey = new Map<string, string>();

    const emitStream = (payload: Record<string, unknown>) => {
      if (!params.streamId || !params.streamSender || params.streamSender.isDestroyed()) return;
      params.streamSender.send('opencode-message-stream', {
        streamId: params.streamId,
        ...payload,
      });
    };

    const consumeStdoutChunk = (chunkText: string) => {
      stdoutLineBuffer += chunkText;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() || '';

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const event = safeParseJson<Record<string, any>>(trimmed);
        if (!event) return;

        collectOpenCodeStreamText(event).forEach(({ key, text }) => {
          const previous = streamedTextByKey.get(key) || '';
          const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
          streamedTextByKey.set(key, text);
          if (delta.trim()) {
            emitStream({ type: 'text', text: delta });
          }
        });
      });
    };

    child.stdout?.on('data', (chunk) => {
      const chunkText = String(chunk);
      stdout += chunkText;
      consumeStdoutChunk(chunkText);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      emitStream({ type: 'error', error: error.message });
      resolve({
        ok: false,
        error: error.message,
        stdout,
        stderr,
      });
    });

    child.on('close', async (code) => {
      try {
        const officialSessionId = params.officialSessionId?.trim();
        let sessionId = officialSessionId || null;
        let sessionTitle: string | null = null;

        if (!sessionId) {
          const sessions = await listOpenCodeSessions(cwd);
          const matched = sessions.find((session) =>
            session.timeUpdated >= startedAt - 1000
            && (!params.title?.trim() || session.title === params.title.trim()),
          ) || sessions[0];

          sessionId = matched?.id || null;
          sessionTitle = matched?.title || null;
        }

        resolve({
          ok: code === 0,
          error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `opencode exited with code ${code}`),
          stdout,
          stderr,
          sessionId,
          sessionTitle,
        });
        emitStream({ type: code === 0 ? 'done' : 'error', error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `opencode exited with code ${code}`), sessionId, sessionTitle });
      } catch (error) {
        emitStream({ type: code === 0 ? 'done' : 'error', error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `opencode exited with code ${code}`), sessionId: params.officialSessionId?.trim() || null, sessionTitle: params.title?.trim() || null });
        resolve({
          ok: code === 0,
          error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `opencode exited with code ${code}`),
          stdout,
          stderr: `${stderr}${stderr ? '\n' : ''}${error instanceof Error ? error.message : String(error)}`,
          sessionId: params.officialSessionId?.trim() || null,
          sessionTitle: params.title?.trim() || null,
        });
      }
    });
  });
}

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

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const type = level >= 2 ? 'error' : 'log';
    console[type](`[renderer:${level}] ${message} (${sourceId}:${line})`);
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

// IPC: 获取文件状态信息
ipcMain.handle('get-file-stats', async (_, filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return { size: stats.size, mtime: stats.mtimeMs };
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

ipcMain.handle('opencode-get-info', async () => {
  const binaryPath = getOpenCodeBinaryPath();
  const defaultCwd = getOpenCodeDefaultCwd();
  const binaryExists = await fs.access(binaryPath).then(() => true).catch(() => false);
  const { providers, authPath, knownModelsByProvider, defaultModelsByProvider } = await loadOpenCodeProviders();

  return {
    binaryPath,
    binaryExists,
    defaultCwd,
    version: OPENCODE_VERSION,
    providers,
    authPath,
    knownModelsByProvider,
    defaultModelsByProvider,
  };
});

ipcMain.handle('opencode-get-embedded-tui-config-path', async () => {
  return await ensureEmbeddedOpenCodeTuiConfig();
});

ipcMain.handle('opencode-get-runtime-state', async (_event, params?: {
  directory?: string;
  officialSessionId?: string;
  startedAfter?: number;
  providerId?: string;
}) => {
  return await loadOpenCodeRuntimeState({
    directory: params?.directory,
    officialSessionId: params?.officialSessionId,
    startedAfter: params?.startedAfter,
    providerId: params?.providerId,
  });
});

ipcMain.handle('opencode-get-provider-models', async (_event, params?: {
  providerId?: string;
  directory?: string;
}) => {
  const normalizedProviderId = String(params?.providerId || '').trim();
  if (!normalizedProviderId) {
    return { models: [], defaultModel: '', source: 'local' as const };
  }

  return await loadOpenCodeProviderModels(normalizedProviderId, params?.directory);
});

ipcMain.handle('opencode-list-sessions', async (_event, params?: {
  directory?: string;
}) => {
  return await listOpenCodeSessions(params?.directory || '');
});

ipcMain.handle('opencode-delete-session', async (_event, params?: {
  sessionId?: string;
  directory?: string;
}) => {
  const sessionId = String(params?.sessionId || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'missing-session-id' };
  }

  const binaryPath = getOpenCodeBinaryPath();
  const cwd = params?.directory?.trim() || getOpenCodeDefaultCwd();

  return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    execFile(
      binaryPath,
      ['session', 'delete', sessionId],
      { cwd, timeout: 15000 },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            error: (stderr || error.message || 'delete-failed').trim(),
          });
          return;
        }
        resolve({ ok: true });
      },
    );
  });
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

ipcMain.handle('opencode-get-session-messages', async (_event, params?: {
  sessionId?: string;
}) => {
  const sessionId = String(params?.sessionId || '').trim();
  if (!sessionId) return [];
  try {
    return await listOpenCodeSessionMessages(sessionId);
  } catch {
    return [];
  }
});

ipcMain.handle('opencode-send-message', async (_event, params?: {
  streamId?: string;
  directory?: string;
  officialSessionId?: string;
  title?: string;
  providerId?: string;
  modelId?: string;
  argsText?: string;
  env?: Record<string, string>;
  prompt?: string;
}) => {
  const prompt = String(params?.prompt || '').trim();
  if (!prompt) {
    return { ok: false, error: 'empty-prompt' };
  }

  return await runOpenCodePrompt({
    streamId: params?.streamId,
    streamSender: _event.sender,
    directory: String(params?.directory || '').trim(),
    officialSessionId: params?.officialSessionId,
    title: params?.title,
    providerId: params?.providerId,
    modelId: params?.modelId,
    argsText: params?.argsText,
    env: params?.env || {},
    prompt,
  });
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

// Agent 网络搜索：用隐藏 BrowserWindow 加载 Bing 搜索页，渲染完毕后提取真实结果
// 相比 net.fetch RSS 方案，这种方式能拿到 Bing 渲染后的 JS 结果，包括天气直答卡等
ipcMain.handle('agent-web-search', async (_, { query }: { query: string }) => {
  let searchWin: BrowserWindow | null = null;
  try {
    const encoded = encodeURIComponent(query);
    const searchUrl = `https://www.bing.com/search?q=${encoded}&setlang=zh-CN&cc=CN&count=10`;

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
      return { success: false, error: '未获得搜索结果，请检查网络或代理设置', results: [] };
    }

    return { success: true, directAnswer, results, query };
  } catch (e) {
    searchWin?.destroy();
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
