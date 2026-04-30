import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { OpenCodeRuntimeAdapter, type OpenCodeRuntimeSnapshot } from './opencodeRuntimeAdapter';

interface OpenCodeProviderInfo {
  id: string;
  label: string;
  authType: string;
  hasStoredCredential: boolean;
}

interface OpenCodeInfo {
  binaryPath: string;
  defaultCwd: string;
  binaryExists: boolean;
  version?: string | null;
  authPath?: string;
  providers: OpenCodeProviderInfo[];
  knownModelsByProvider: Record<string, string[]>;
  defaultModelsByProvider: Record<string, string>;
}

interface OpenCodeRuntimeState {
  session: {
    id: string;
    title: string;
    directory: string;
    projectId: string;
    timeCreated: number;
    timeUpdated: number;
  } | null;
  latestUsage: {
    providerId: string | null;
    providerLabel: string | null;
    modelId: string | null;
    cost: number;
    tokens: {
      total: number;
      input: number;
      output: number;
      reasoning: number;
      cacheRead: number;
      cacheWrite: number;
    };
    timeUpdated: number | null;
  } | null;
  sessionTotals: {
    turns: number;
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  knownModels: string[];
  plan: {
    available: boolean;
    note: string;
  };
  source: 'database';
  lastUpdated: number;
}

interface OpenCodeHistorySession {
  id: string;
  title: string;
  directory: string;
  projectId: string;
  timeCreated: number;
  timeUpdated: number;
  version: string | null;
}

interface OpenCodeChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  providerId: string | null;
  modelId: string | null;
  timeCreated: number;
  timeUpdated: number;
  text: string;
  hasReasoning: boolean;
  hasTool: boolean;
  cost: number | null;
  totalTokens: number | null;
  parts?: OpenCodeMessagePart[];
  optimistic?: boolean;
}

interface OpenCodeMessagePart {
  id?: string | null;
  type: string;
  timeCreated?: number | null;
  timeUpdated?: number | null;
  text?: string;
  isRedactedReasoning?: boolean;
  tool?: string;
  callId?: string;
  status?: string;
  title?: string;
  input?: unknown;
  output?: string;
  metadata?: unknown;
  files?: string[];
  hash?: string;
  filename?: string;
  mime?: string;
  url?: string;
}

interface OpenCodeCategory {
  id: string;
  name: string;
  isExpanded: boolean;
  createdAt: number;
}

interface OpenCodeProject {
  id: string;
  categoryId: string;
  title: string;
  cwd: string;
  providerId: string;
  modelId: string;
  availableModels: string[];
  createdAt: number;
}

interface OpenCodeSession {
  id: string;
  projectId: string;
  title: string;
  args: string;
  relaunchKey: number;
  officialSessionId?: string | null;
  runtimeStartedAt?: number | null;
  lastOfficialUpdateAt?: number | null;
  createdAt: number;
}

interface LegacyOpenCodeSession {
  id: string;
  title: string;
  cwd: string;
  args: string;
  relaunchKey: number;
  createdAt: number;
}

type OpenCodeRendererMode = 'auto' | 'compatibility';
type OpenCodeTerminalProfile = 'default' | 'coding-cli';

interface OpenCodeSettings {
  defaultCwd: string;
  defaultArgs: string;
  defaultProviderId: string;
  defaultModelId: string;
  knownModelsByProvider: Record<string, string[]>;
  envText: string;
  rendererMode: OpenCodeRendererMode;
  terminalProfile: OpenCodeTerminalProfile;
  inheritCurrentSessionOnCreate: boolean;
}

interface ProjectEditorState {
  projectId: string | null;
  categoryId: string;
  title: string;
  cwd: string;
}

interface CategoryEditorState {
  categoryId: string | null;
  name: string;
}

const STORAGE_KEY_CATEGORIES = 'opencode_categories_v1';
const STORAGE_KEY_PROJECTS = 'opencode_projects_v1';
const STORAGE_KEY_SESSIONS = 'opencode_sessions_v3';
const STORAGE_KEY_ACTIVE_PROJECT = 'opencode_active_project_v1';
const STORAGE_KEY_ACTIVE_SESSION = 'opencode_active_session_v3';
const STORAGE_KEY_SETTINGS = 'opencode_settings_v2';

const LEGACY_STORAGE_KEY_SESSIONS = 'opencode_sessions_v2';
const LEGACY_STORAGE_KEY_ACTIVE = 'opencode_active_v2';
const DEFAULT_CATEGORY_ID = 'opencode-category-default';

const DEFAULT_SETTINGS: OpenCodeSettings = {
  defaultCwd: '',
  defaultArgs: '',
  defaultProviderId: '',
  defaultModelId: '',
  knownModelsByProvider: {},
  envText: '',
  rendererMode: 'compatibility',
  terminalProfile: 'coding-cli',
  inheritCurrentSessionOnCreate: true,
};

const OPENCODE_EMBEDDED_POST_LAUNCH_INPUTS = [
  { data: '\u0018', delayMs: 2600 },
  { data: 'b', delayMs: 2750 },
];

const DEFAULT_CATEGORY = (id = DEFAULT_CATEGORY_ID): OpenCodeCategory => ({
  id,
  name: '我的项目',
  isExpanded: true,
  createdAt: Date.now(),
});

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const officialSessionLocalId = (officialSessionId: string) => `opencode-session-official-${officialSessionId}`;

const shellQuote = (value: string) => `"${value.replace(/(["\\$`])/g, '\\$1')}"`;

const basename = (cwd: string) => {
  const cleaned = cwd.replace(/[\\/]+$/, '');
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || '项目';
};

const dedupeStrings = (values: string[]) =>
  values.filter((value, index, all) => value && all.findIndex((item) => item === value) === index);

const formatMessageTime = (timestamp: number) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCost = (value: number | null | undefined) => `$${Number(value || 0).toFixed(6)}`;

const formatInteger = (value: number | null | undefined) => Number(value || 0).toLocaleString('en-US');

const shouldDisplayOpenCodeMessage = (message: OpenCodeChatMessage) =>
  Boolean(message.text.trim() || message.hasTool);

const stringifyOpenCodeValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const trimOpenCodePreview = (value: string, limit = 2400) => {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...输出已截断`;
};

const renderOpenCodePartDetails = (parts: OpenCodeMessagePart[] | undefined) => {
  const visibleParts = (parts || []).filter(part => (
    part.type === 'reasoning'
      ? Boolean(part.text?.trim() || part.isRedactedReasoning)
      : ['tool', 'patch', 'file'].includes(part.type)
  ));

  if (!visibleParts.length) return null;

  return (
    <div className="mt-5 space-y-3 border-l border-slate-200 pl-4">
      {visibleParts.map((part, index) => {
        if (part.type === 'reasoning') {
          const reasoningText = part.text?.trim();
          return (
            <details key={part.id || `reasoning-${index}`} className="group text-sm">
              <summary className="cursor-pointer select-none text-slate-400 transition-colors hover:text-slate-600">
                思考过程{part.isRedactedReasoning && !reasoningText ? ' · 已由提供商隐藏' : ''}
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-slate-500">
                {reasoningText || '该提供商返回了受保护的推理元数据，但没有公开可读文本。'}
              </div>
            </details>
          );
        }

        if (part.type === 'patch') {
          return (
            <details key={part.id || `patch-${index}`} className="group text-sm">
              <summary className="cursor-pointer select-none text-slate-500 transition-colors hover:text-slate-700">
                代码变更 · {(part.files || []).length || 0} 个文件
              </summary>
              <div className="mt-2 space-y-1 text-[13px] leading-6 text-slate-500">
                {(part.files || []).map(file => (
                  <div key={file} className="break-all">{file}</div>
                ))}
                {part.hash ? <div className="break-all text-slate-400">hash: {part.hash}</div> : null}
              </div>
            </details>
          );
        }

        if (part.type === 'file') {
          return (
            <div key={part.id || `file-${index}`} className="text-sm text-slate-500">
              文件附件 · {part.filename || part.mime || '未命名文件'}
            </div>
          );
        }

        const inputText = stringifyOpenCodeValue(part.input);
        const outputText = trimOpenCodePreview(part.output || '');
        const title = part.title || part.tool || '工具调用';

        return (
          <details key={part.id || `tool-${index}`} className="group text-sm">
            <summary className="cursor-pointer select-none text-slate-500 transition-colors hover:text-slate-700">
              {title}
              {part.status ? <span className="ml-2 text-xs text-slate-400">{part.status}</span> : null}
            </summary>
            <div className="mt-2 space-y-2 text-[13px] leading-6 text-slate-500">
              {inputText ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap border-l border-slate-200 pl-3 font-mono text-[12px] leading-5 text-slate-500">
                  {inputText}
                </pre>
              ) : null}
              {outputText ? (
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-l border-slate-200 pl-3 font-mono text-[12px] leading-5 text-slate-600">
                  {outputText}
                </pre>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
};

const normalizeModelCatalog = (catalog: Record<string, string[]> | undefined) =>
  Object.fromEntries(
    Object.entries(catalog || {}).map(([provider, models]) => [
      provider,
      dedupeStrings((models || []).map((model) => model.trim()).filter(Boolean)),
    ]),
  );

const mergeModelCatalogs = (...catalogs: Array<Record<string, string[]> | undefined>) => {
  const merged: Record<string, string[]> = {};
  catalogs.forEach((catalog) => {
    Object.entries(normalizeModelCatalog(catalog)).forEach(([provider, models]) => {
      merged[provider] = dedupeStrings([...(merged[provider] || []), ...models]);
    });
  });
  return merged;
};

const loadJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const parseModelArg = (rawArgs: string) => {
  let providerId = '';
  let modelId = '';

  const remainingArgs = rawArgs
    .replace(/(?:^|\s)(--model|-m)\s+("[^"]+"|'[^']+'|\S+)/, (_match, _flag, modelValue) => {
      const unquoted = String(modelValue).replace(/^['"]|['"]$/g, '');
      const [provider, model] = unquoted.split('/', 2);
      providerId = provider || '';
      modelId = model || '';
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  return { providerId, modelId, remainingArgs };
};

const parseEnvText = (envText: string) => {
  const valid: Array<{ key: string; value: string }> = [];
  const invalid: string[] = [];

  envText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        invalid.push(line);
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1);

      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        invalid.push(line);
        return;
      }

      valid.push({ key, value });
    });

  return { valid, invalid };
};

const buildLaunchCommand = (
  info: OpenCodeInfo | null,
  project: OpenCodeProject,
  session: OpenCodeSession,
  settings: OpenCodeSettings,
  embeddedTuiConfigPath?: string | null,
) => {
  const cwd = project.cwd.trim() || settings.defaultCwd.trim() || info?.defaultCwd || '.';
  const binaryPath = info?.binaryPath || 'opencode';
  const envCommands = parseEnvText(settings.envText).valid.map(({ key, value }) => `export ${key}=${shellQuote(value)}`);
  if (embeddedTuiConfigPath) {
    envCommands.push(`export OPENCODE_TUI_CONFIG=${shellQuote(embeddedTuiConfigPath)}`);
  }
  const modelPath = project.providerId && project.modelId ? `${project.providerId}/${project.modelId}` : '';
  const modelArg = modelPath ? `--model ${shellQuote(modelPath)}` : '';
  const sessionArg = session.officialSessionId ? `--session ${shellQuote(session.officialSessionId)}` : '';
  const rawArgs = session.args.trim() || settings.defaultArgs.trim();
  const args = [modelArg, sessionArg, rawArgs].filter(Boolean).join(' ');
  const segments = [...envCommands, `cd ${shellQuote(cwd)}`, `${shellQuote(binaryPath)}${args ? ` ${args}` : ''}`];
  return segments.join(' && ');
};

const normalizeSettings = (
  raw: Partial<OpenCodeSettings>,
  detectedCwd = '',
  providers: OpenCodeProviderInfo[] = [],
  detectedModelCatalog?: Record<string, string[]>,
): OpenCodeSettings => {
  const parsedDefaultArgs = parseModelArg(raw.defaultArgs || '');
  const fallbackProviderId = raw.defaultProviderId || parsedDefaultArgs.providerId || providers[0]?.id || '';
  const fallbackModelId = raw.defaultModelId || parsedDefaultArgs.modelId || '';

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    defaultCwd: raw.defaultCwd || detectedCwd || '',
    defaultArgs: parsedDefaultArgs.remainingArgs || '',
    defaultProviderId: fallbackProviderId,
    defaultModelId: fallbackModelId,
    knownModelsByProvider: mergeModelCatalogs(detectedModelCatalog, raw.knownModelsByProvider),
    envText: raw.envText || '',
    rendererMode: raw.rendererMode === 'auto' ? 'auto' : 'compatibility',
    terminalProfile: raw.terminalProfile === 'default' ? 'default' : 'coding-cli',
    inheritCurrentSessionOnCreate: raw.inheritCurrentSessionOnCreate ?? true,
  };
};

const makeProject = (
  categoryId: string,
  cwd: string,
  settings: OpenCodeSettings,
  partial?: Partial<OpenCodeProject>,
): OpenCodeProject => {
  const providerId = partial?.providerId || settings.defaultProviderId;
  const modelId = partial?.modelId || settings.defaultModelId;
  const defaultKnownModels = providerId ? settings.knownModelsByProvider[providerId] || [] : [];
  return {
    id: partial?.id || uid('opencode-project'),
    categoryId,
    title: partial?.title || basename(cwd || settings.defaultCwd || '') || '新项目',
    cwd: partial?.cwd || cwd || settings.defaultCwd,
    providerId,
    modelId,
    availableModels: dedupeStrings([...(partial?.availableModels || []), ...defaultKnownModels, modelId].filter(Boolean)),
    createdAt: partial?.createdAt || Date.now(),
  };
};

const makeSession = (projectId: string, index: number, args = '', partial?: Partial<OpenCodeSession>): OpenCodeSession => ({
  id: partial?.id || uid('opencode-session'),
  projectId,
  title: partial?.title || `对话 ${index}`,
  args: partial?.args ?? args,
  relaunchKey: partial?.relaunchKey || 0,
  officialSessionId: partial?.officialSessionId || null,
  runtimeStartedAt: partial?.runtimeStartedAt || null,
  lastOfficialUpdateAt: partial?.lastOfficialUpdateAt || null,
  createdAt: partial?.createdAt || Date.now(),
});

const migrateLegacyState = (detectedCwd: string, settings: OpenCodeSettings) => {
  const legacySessions = loadJSON<LegacyOpenCodeSession[]>(LEGACY_STORAGE_KEY_SESSIONS, []);
  const legacyActiveSessionId = localStorage.getItem(LEGACY_STORAGE_KEY_ACTIVE);
  const categories = [DEFAULT_CATEGORY()];

  if (!legacySessions.length) {
    const project = makeProject(DEFAULT_CATEGORY_ID, settings.defaultCwd || detectedCwd, settings);
    const session = makeSession(project.id, 1, settings.defaultArgs);
    return {
      categories,
      projects: [project],
      sessions: [session],
      activeProjectId: project.id,
      activeSessionId: session.id,
    };
  }

  const grouped = new Map<string, LegacyOpenCodeSession[]>();
  legacySessions.forEach((session) => {
    const key = session.cwd?.trim() || settings.defaultCwd || detectedCwd || '';
    const bucket = grouped.get(key) || [];
    bucket.push(session);
    grouped.set(key, bucket);
  });

  const projects: OpenCodeProject[] = [];
  const sessions: OpenCodeSession[] = [];

  Array.from(grouped.entries()).forEach(([cwd, bucket], projectIndex) => {
    const parsedDefaults = parseModelArg(bucket[0]?.args || '');
    const project = makeProject(DEFAULT_CATEGORY_ID, cwd, settings, {
      title: bucket.length === 1 ? basename(cwd) : `${basename(cwd)} ${projectIndex + 1}`,
      providerId: parsedDefaults.providerId || settings.defaultProviderId,
      modelId: parsedDefaults.modelId || settings.defaultModelId,
      availableModels: [parsedDefaults.modelId].filter(Boolean),
    });
    projects.push(project);

    bucket.forEach((legacy, sessionIndex) => {
      const parsed = parseModelArg(legacy.args || '');
      project.providerId = project.providerId || parsed.providerId;
      project.modelId = project.modelId || parsed.modelId;
      project.availableModels = dedupeStrings([...project.availableModels, parsed.modelId].filter(Boolean));
      sessions.push(makeSession(project.id, sessionIndex + 1, parsed.remainingArgs, {
        id: legacy.id,
        title: legacy.title || `对话 ${sessionIndex + 1}`,
        relaunchKey: legacy.relaunchKey,
        createdAt: legacy.createdAt,
      }));
    });
  });

  const activeSession = sessions.find((session) => session.id === legacyActiveSessionId) || sessions[0];
  const activeProjectId = activeSession ? activeSession.projectId : projects[0]?.id || null;

  return {
    categories,
    projects,
    sessions,
    activeProjectId,
    activeSessionId: activeSession?.id || null,
  };
};

const normalizeStoredState = (
  rawCategories: OpenCodeCategory[],
  rawProjects: OpenCodeProject[],
  rawSessions: OpenCodeSession[],
  settings: OpenCodeSettings,
  detectedCwd: string,
) => {
  const categories = rawCategories.length
    ? rawCategories.map((category) => ({
        ...category,
        name: category.name || '未命名分类',
        isExpanded: category.isExpanded !== false,
      }))
    : [DEFAULT_CATEGORY()];

  const validCategoryIds = new Set(categories.map((category) => category.id));
  const projects = rawProjects
    .filter((project) => validCategoryIds.has(project.categoryId))
    .map((project) =>
      makeProject(project.categoryId, project.cwd || settings.defaultCwd || detectedCwd, settings, {
        ...project,
        availableModels: dedupeStrings([
          ...(project.availableModels || []),
          project.modelId,
          ...(project.providerId ? settings.knownModelsByProvider[project.providerId] || [] : []),
        ].filter(Boolean)),
      }),
    );

  const ensuredProjects = projects.length
    ? projects
    : [makeProject(categories[0].id, settings.defaultCwd || detectedCwd, settings)];

  const validProjectIds = new Set(ensuredProjects.map((project) => project.id));
  const sessions = rawSessions
    .filter((session) => validProjectIds.has(session.projectId))
    .map((session, index) => makeSession(session.projectId, index + 1, session.args || '', session));

  const ensuredSessions = sessions.length
    ? sessions
    : [makeSession(ensuredProjects[0].id, 1, settings.defaultArgs)];

  return { categories, projects: ensuredProjects, sessions: ensuredSessions };
};

const modelOptionsForProject = (project: OpenCodeProject | null, settings: OpenCodeSettings) => {
  if (!project) return [];
  const catalog = settings.knownModelsByProvider[project.providerId] || [];
  return dedupeStrings([...catalog, ...(project.availableModels || []), project.modelId].filter(Boolean));
};

class OpenCodeModuleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'OpenCode 模块渲染失败' };
  }

  componentDidCatch(error: unknown) {
    console.error('OpenCode module crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-white px-8">
          <div className="w-full max-w-xl border border-slate-200 bg-white p-8">
            <div className="text-lg font-semibold text-slate-900">OpenCode 模块渲染失败</div>
            <div className="mt-3 break-all font-mono text-xs leading-6 text-red-500">{this.state.error}</div>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-6 border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              重新加载模块
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface OpenCodeManagerProps {
  isVisible?: boolean;
}

const OpenCodeManagerInner: React.FC<OpenCodeManagerProps> = ({
  isVisible = true,
}) => {
  const [info, setInfo] = useState<OpenCodeInfo | null>(null);
  const [embeddedTuiConfigPath, setEmbeddedTuiConfigPath] = useState<string | null>(null);
  const [settings, setSettings] = useState<OpenCodeSettings>(() => normalizeSettings(loadJSON(STORAGE_KEY_SETTINGS, {} as Partial<OpenCodeSettings>)));
  const [categories, setCategories] = useState<OpenCodeCategory[]>([]);
  const [projects, setProjects] = useState<OpenCodeProject[]>([]);
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectEditorOpen, setIsProjectEditorOpen] = useState(false);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [projectEditor, setProjectEditor] = useState<ProjectEditorState>({
    projectId: null,
    categoryId: DEFAULT_CATEGORY_ID,
    title: '',
    cwd: '',
  });
  const [categoryEditor, setCategoryEditor] = useState<CategoryEditorState>({ categoryId: null, name: '' });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [isInfoReady, setIsInfoReady] = useState(false);
  const [infoLoadFailed, setInfoLoadFailed] = useState(false);
  const [chatMessages, setChatMessages] = useState<OpenCodeChatMessage[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OpenCodeChatMessage[]>([]);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const runtimeAdapterRef = useRef<OpenCodeRuntimeAdapter | null>(null);
  if (!runtimeAdapterRef.current) {
    runtimeAdapterRef.current = new OpenCodeRuntimeAdapter();
  }
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<OpenCodeRuntimeSnapshot>({ sessions: {} });
  const [runtimeState, setRuntimeState] = useState<OpenCodeRuntimeState | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingSendRef = useRef<{
    prompt: string;
    sentAt: number;
    optimisticId: string;
    timeoutId: number | null;
  } | null>(null);
  const clearPendingSend = React.useCallback(() => {
    if (pendingSendRef.current?.timeoutId) {
      window.clearTimeout(pendingSendRef.current.timeoutId);
    }
    pendingSendRef.current = null;
  }, []);

  useEffect(() => {
    const adapter = runtimeAdapterRef.current;
    if (!adapter) return undefined;
    return adapter.subscribe(setRuntimeSnapshot);
  }, []);

  const requestOpenCodeInfo = React.useCallback(async (timeoutMs = 8000) => {
    const getOpenCodeInfo = window.electronAPI?.getOpenCodeInfo;
    if (typeof getOpenCodeInfo !== 'function') return null;

    return await Promise.race([
      getOpenCodeInfo(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('OpenCode info request timed out')), timeoutMs);
      }),
    ]);
  }, []);

  const requestEmbeddedTuiConfigPath = React.useCallback(async (timeoutMs = 4000) => {
    const getEmbeddedTuiConfigPath = window.electronAPI?.getOpenCodeEmbeddedTuiConfigPath;
    if (typeof getEmbeddedTuiConfigPath !== 'function') return null;

    return await Promise.race([
      getEmbeddedTuiConfigPath(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('OpenCode embedded tui config request timed out')), timeoutMs);
      }),
    ]);
  }, []);

  const refreshOpenCodeInfo = async () => {
    if (typeof window.electronAPI?.getOpenCodeInfo !== 'function') return;

    try {
      const loadedInfo = await requestOpenCodeInfo();
      if (!loadedInfo) return;

      setInfo(loadedInfo);
      setInfoLoadFailed(false);
      setSettings((prev) =>
        normalizeSettings(prev, loadedInfo.defaultCwd || '', loadedInfo.providers || [], loadedInfo.knownModelsByProvider || {}),
      );
      setProjects((prev) =>
        prev.map((project) => ({
          ...project,
          availableModels: dedupeStrings([
            ...(project.availableModels || []),
            project.modelId,
            ...(project.providerId ? loadedInfo.knownModelsByProvider?.[project.providerId] || [] : []),
          ].filter(Boolean)),
        })),
      );
    } catch {
      // Ignore refresh failures and keep the current UI state.
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      let loadedInfo: OpenCodeInfo | null = null;
      let loadedEmbeddedTuiConfigPath: string | null = null;

      if (typeof window.electronAPI?.getOpenCodeInfo === 'function') {
        try {
          loadedInfo = await requestOpenCodeInfo();
        } catch {
          loadedInfo = null;
        }
      }

      if (typeof window.electronAPI?.getOpenCodeEmbeddedTuiConfigPath === 'function') {
        try {
          loadedEmbeddedTuiConfigPath = await requestEmbeddedTuiConfigPath();
        } catch {
          loadedEmbeddedTuiConfigPath = null;
        }
      }

      if (!mounted) return;

      const normalizedSettings = normalizeSettings(
        loadJSON(STORAGE_KEY_SETTINGS, {} as Partial<OpenCodeSettings>),
        loadedInfo?.defaultCwd || '',
        loadedInfo?.providers || [],
        loadedInfo?.knownModelsByProvider || {},
      );

      const rawCategories = loadJSON<OpenCodeCategory[]>(STORAGE_KEY_CATEGORIES, []);
      const rawProjects = loadJSON<OpenCodeProject[]>(STORAGE_KEY_PROJECTS, []);
      const rawSessions = loadJSON<OpenCodeSession[]>(STORAGE_KEY_SESSIONS, []);

      const state = rawProjects.length || rawSessions.length
        ? normalizeStoredState(rawCategories, rawProjects, rawSessions, normalizedSettings, loadedInfo?.defaultCwd || '')
        : migrateLegacyState(loadedInfo?.defaultCwd || '', normalizedSettings);

      const savedProjectId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
      const savedSessionId = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      const preferredSessionId = savedSessionId;
      const preferredProjectId = savedProjectId;

      const activeSession = state.sessions.find((session) => session.id === preferredSessionId) || state.sessions[0] || null;
      const activeProject = state.projects.find((project) => project.id === preferredProjectId)
        || state.projects.find((project) => project.id === activeSession?.projectId)
        || state.projects[0]
        || null;
      const resolvedActiveSessionId = activeSession?.id || state.sessions.find((session) => session.projectId === activeProject?.id)?.id || null;

      setInfo(loadedInfo);
      setInfoLoadFailed(Boolean(window.electronAPI?.getOpenCodeInfo) && !loadedInfo);
      setEmbeddedTuiConfigPath(loadedEmbeddedTuiConfigPath);
      setSettings(normalizedSettings);
      setCategories(state.categories);
      setProjects(state.projects);
      setSessions(state.sessions);
      setActiveProjectId(activeProject?.id || null);
      setActiveSessionId(resolvedActiveSessionId);
      setIsInfoReady(true);
      localStorage.removeItem('opencode_runtime_v1');
    };

    void initialize();

    return () => {
      mounted = false;
    };
  }, [requestEmbeddedTuiConfigPath, requestOpenCodeInfo]);

  useEffect(() => {
    if (!isVisible || !window.electronAPI?.getOpenCodeInfo) return;
    void refreshOpenCodeInfo();
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !window.electronAPI?.getOpenCodeInfo) return;

    const handleFocus = () => {
      void refreshOpenCodeInfo();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isVisible]);

  useEffect(() => {
    if (categories.length) localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    if (projects.length) localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (sessions.length) localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (activeProjectId) localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    if (activeSessionId) localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, activeSessionId);
  }, [activeSessionId]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId],
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId)
      || sessions.find((session) => session.projectId === activeProject?.id)
      || sessions[0]
      || null,
    [sessions, activeSessionId, activeProject?.id],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const isActiveSessionLaunched = useMemo(
    () => {
      if (!activeSession) return false;
      const status = runtimeSnapshot.sessions[activeSession.id]?.status;
      return status === 'starting' || status === 'running';
    },
    [activeSession, runtimeSnapshot],
  );

  const activeRuntimeSession = activeSession ? runtimeSnapshot.sessions[activeSession.id] || null : null;

  const launchCommand = useMemo(() => {
    if (!activeProject || !activeSession) return '';
    return buildLaunchCommand(info, activeProject, activeSession, settings, embeddedTuiConfigPath);
  }, [info, activeProject, activeSession, settings, embeddedTuiConfigPath]);

  const envSummary = useMemo(() => parseEnvText(settings.envText), [settings.envText]);
  const availableModelOptions = useMemo(
    () => {
      const latestModelForActiveProvider = activeProject?.providerId && runtimeState?.latestUsage?.providerId === activeProject.providerId
        ? runtimeState.latestUsage.modelId || ''
        : '';

      return dedupeStrings([
        ...modelOptionsForProject(activeProject, settings),
        ...(runtimeState?.knownModels || []),
        latestModelForActiveProvider,
      ].filter(Boolean));
    },
    [activeProject, settings, runtimeState],
  );
  const getProviderLabel = React.useCallback(
    (providerId: string | null | undefined) => {
      if (!providerId) return '未指定';
      return (info?.providers || []).find((provider) => provider.id === providerId)?.label || providerId;
    },
    [info?.providers],
  );
  const currentProviderLabel = runtimeState?.latestUsage?.providerLabel
    || getProviderLabel(runtimeState?.latestUsage?.providerId || activeProject?.providerId);
  const currentModelLabel = runtimeState?.latestUsage?.modelId || activeProject?.modelId || '未指定';
  const currentCostLabel = formatCost(runtimeState?.sessionTotals?.totalCost ?? runtimeState?.latestUsage?.cost ?? 0);
  const currentCodePlanLabel = runtimeState?.plan?.note || (runtimeState?.plan?.available ? '可用' : '官方本地库未提供');
  const currentTurnCount = formatInteger(runtimeState?.sessionTotals?.turns);
  const currentTokenCount = formatInteger(runtimeState?.sessionTotals?.totalTokens);

  const visibleChatMessages = useMemo(() => {
    const officialMessages = [...chatMessages];
    const unmatchedOptimistic = optimisticMessages.filter((optimistic) => (
      !officialMessages.some((message) => (
        message.role === optimistic.role
        && message.text.trim() === optimistic.text.trim()
        && Math.abs(message.timeCreated - optimistic.timeCreated) < 30_000
      ))
    ));

    return [...officialMessages, ...unmatchedOptimistic].sort((a, b) => {
      if (a.timeCreated !== b.timeCreated) return a.timeCreated - b.timeCreated;
      if (a.timeUpdated !== b.timeUpdated) return a.timeUpdated - b.timeUpdated;
      return a.id.localeCompare(b.id);
    });
  }, [chatMessages, optimisticMessages]);
  const hasStreamingAssistantMessage = optimisticMessages.some((message) => message.role === 'assistant' && message.text.trim());
  useEffect(() => {
    if (!activeProject || !activeSession || !window.electronAPI?.getOpenCodeRuntimeState) {
      return;
    }

    if (!activeSession.officialSessionId && !isActiveSessionLaunched) {
      setRuntimeState(null);
      return;
    }

    let cancelled = false;

    const refreshRuntimeState = async () => {
      try {
        const result = await window.electronAPI.getOpenCodeRuntimeState({
          directory: activeProject.cwd || info?.defaultCwd || '',
          officialSessionId: activeSession.officialSessionId || undefined,
          startedAfter: activeSession.runtimeStartedAt || undefined,
          providerId: activeProject.providerId || undefined,
        });

        if (cancelled) return;

        setRuntimeState(result);

        if (result.session?.id && result.session.id !== activeSession.officialSessionId) {
          updateSession(activeSession.id, (session) => (
            session.officialSessionId === result.session?.id
              ? session
              : { ...session, officialSessionId: result.session?.id || null }
          ));
        }
      } catch {
        if (!cancelled) {
          setRuntimeState(null);
        }
      }
    };

    void refreshRuntimeState();
    const timer = window.setInterval(() => void refreshRuntimeState(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeProject?.id,
    activeProject?.cwd,
    activeProject?.providerId,
    activeSession?.id,
    activeSession?.officialSessionId,
    activeSession?.runtimeStartedAt,
    info?.defaultCwd,
    isActiveSessionLaunched,
  ]);

  useEffect(() => {
    if (!activeProject?.providerId || !runtimeState?.knownModels?.length) return;

    setSettings((prev) => {
      const existing = prev.knownModelsByProvider[activeProject.providerId] || [];
      const merged = dedupeStrings([...existing, ...runtimeState.knownModels]);
      if (merged.join('\u0000') === existing.join('\u0000')) return prev;
      return {
        ...prev,
        knownModelsByProvider: {
          ...prev.knownModelsByProvider,
          [activeProject.providerId]: merged,
        },
      };
    });
  }, [activeProject?.providerId, runtimeState?.knownModels]);

  useEffect(() => {
    if (!activeProject?.id || !activeProject.providerId || !window.electronAPI?.getOpenCodeProviderModels) {
      return;
    }

    let cancelled = false;

    const refreshProviderModels = async () => {
      try {
        const result = await window.electronAPI.getOpenCodeProviderModels({
          providerId: activeProject.providerId,
          directory: activeProject.cwd || info?.defaultCwd || '',
        });
        if (cancelled) return;

        const normalizedModels = dedupeStrings(result.models || []);

        setSettings((prev) => {
          const existing = prev.knownModelsByProvider[activeProject.providerId] || [];
          if (existing.join('\u0000') === normalizedModels.join('\u0000')) {
            return prev;
          }

          return {
            ...prev,
            knownModelsByProvider: {
              ...prev.knownModelsByProvider,
              [activeProject.providerId]: normalizedModels,
            },
          };
        });

        updateProject(activeProject.id, (project) => {
          const nextModelId = project.modelId || result.defaultModel || '';
          const nextModels = dedupeStrings([...normalizedModels, nextModelId].filter(Boolean));
          if (nextModels.join('\u0000') === (project.availableModels || []).join('\u0000')) {
            if (nextModelId === project.modelId) {
              return project;
            }
            return {
              ...project,
              modelId: nextModelId,
            };
          }
          return {
            ...project,
            modelId: nextModelId,
            availableModels: nextModels,
          };
        });
      } catch {
        // keep current local model list when fetch fails
      }
    };

    void refreshProviderModels();

    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, activeProject?.providerId, activeProject?.cwd, info?.defaultCwd]);

  useEffect(() => {
    setRuntimeState(null);
  }, [activeProjectId, activeSessionId, activeProject?.providerId]);

  useEffect(() => {
    if (!activeSession?.officialSessionId || !window.electronAPI?.getOpenCodeSessionMessages) {
      setChatMessages([]);
      return;
    }

    let cancelled = false;

    const refreshMessages = async () => {
      try {
        const rows = await window.electronAPI.getOpenCodeSessionMessages({
          sessionId: activeSession.officialSessionId || undefined,
        });
        if (cancelled) return;

        const normalized = rows.filter(shouldDisplayOpenCodeMessage);
        setChatMessages(normalized);

        const pending = pendingSendRef.current;
        if (pending) {
          const mirroredUserMessage = normalized.some((message) => (
            message.role === 'user'
            && message.text.trim() === pending.prompt.trim()
            && message.timeCreated >= pending.sentAt - 60_000
          ));
          const mirroredAssistantMessage = normalized.some((message) => (
            message.role === 'assistant'
            && Math.max(message.timeCreated || 0, message.timeUpdated || 0) >= pending.sentAt - 10_000
          ));

          if (mirroredUserMessage) {
            setOptimisticMessages((prev) => prev.filter((message) => message.id !== pending.optimisticId));
          }

          if (mirroredAssistantMessage) {
            setIsSending(false);
            clearPendingSend();
          }
        }
      } catch {
        if (!cancelled) {
          setChatMessages([]);
        }
      }
    };

    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), isSending ? 1200 : 2400);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSession?.officialSessionId, clearPendingSend, isSending]);

  useEffect(() => {
    setOptimisticMessages([]);
    setChatError(null);
    setDraftPrompt('');
    setIsSending(false);
    clearPendingSend();
  }, [activeSessionId, clearPendingSend]);

  useEffect(() => {
    const node = messageScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visibleChatMessages, isSending]);

  useEffect(() => {
    runtimeAdapterRef.current?.removeMissingSessions(new Set(sessions.map((session) => session.id)));
  }, [sessions]);

  useEffect(() => {
    return () => {
      clearPendingSend();
      runtimeAdapterRef.current?.stopAll();
    };
  }, [clearPendingSend]);

  const visibleCategoryIds = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return new Set(categories.map((category) => category.id));

    const matchedProjectIds = new Set(
      projects
        .filter((project) => project.title.toLowerCase().includes(query) || project.cwd.toLowerCase().includes(query))
        .map((project) => project.id),
    );

    sessions.forEach((session) => {
      if (session.title.toLowerCase().includes(query)) {
        matchedProjectIds.add(session.projectId);
      }
    });

    return new Set(
      categories
        .filter((category) => category.name.toLowerCase().includes(query) || projects.some((project) => matchedProjectIds.has(project.id) && project.categoryId === category.id))
        .map((category) => category.id),
    );
  }, [categories, projects, sessions, keyword]);

  const syncOfficialSessions = React.useCallback((projectId: string, rows: OpenCodeHistorySession[]) => {
    setSessions((prev) => {
      const projectSessions = prev.filter((session) => session.projectId === projectId);
      const drafts = [...projectSessions.filter((session) => !session.officialSessionId)];
      const existingByOfficialId = new Map(
        projectSessions
          .filter((session) => session.officialSessionId)
          .map((session) => [session.officialSessionId as string, session]),
      );

      const synced = rows.map((row, index) => {
        let existing = existingByOfficialId.get(row.id);
        if (!existing) {
          const draftIndex = drafts.findIndex((draft) => {
            if (draft.title === row.title) return true;
            if (!draft.runtimeStartedAt) return false;
            return row.timeUpdated >= draft.runtimeStartedAt - 2_000;
          });
          if (draftIndex >= 0) {
            existing = drafts[draftIndex];
            drafts.splice(draftIndex, 1);
          }
        }
        return makeSession(projectId, index + 1, existing?.args ?? settings.defaultArgs, {
          ...existing,
          id: existing?.id || officialSessionLocalId(row.id),
          title: row.title || `对话 ${index + 1}`,
          officialSessionId: row.id,
          runtimeStartedAt: existing?.runtimeStartedAt || null,
          lastOfficialUpdateAt: row.timeUpdated || row.timeCreated || null,
          createdAt: existing?.createdAt || row.timeCreated || Date.now(),
        });
      });

      return [
        ...prev.filter((session) => session.projectId !== projectId),
        ...drafts,
        ...synced,
      ];
    });
  }, [settings.defaultArgs]);

  useEffect(() => {
    if (!activeProject?.cwd || !window.electronAPI?.getOpenCodeSessions) {
      return;
    }

    let cancelled = false;

    const refreshSessions = async () => {
      try {
        const rows = await window.electronAPI.getOpenCodeSessions({ directory: activeProject.cwd });
        if (cancelled) return;

        syncOfficialSessions(activeProject.id, rows);

        const currentSessionBelongsToProject = activeSession?.projectId === activeProject.id;
        const currentOfficialStillExists = activeSession?.officialSessionId
          ? rows.some((row) => row.id === activeSession.officialSessionId)
          : true;

        if ((!currentSessionBelongsToProject || !currentOfficialStillExists) && rows[0]) {
          setActiveSessionId(officialSessionLocalId(rows[0].id));
        }
      } catch {
        // ignore refresh failures
      }
    };

    void refreshSessions();
    const timer = window.setInterval(() => void refreshSessions(), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeProject?.id,
    activeProject?.cwd,
    activeSession?.id,
    activeSession?.officialSessionId,
    syncOfficialSessions,
  ]);

  const getProjectSessions = (projectId: string) => (
    sessions
      .filter((session) => session.projectId === projectId)
      .sort((a, b) => {
        const aKind = a.officialSessionId ? 1 : 0;
        const bKind = b.officialSessionId ? 1 : 0;
        if (aKind !== bKind) return aKind - bKind;
        const aTime = a.lastOfficialUpdateAt || a.createdAt;
        const bTime = b.lastOfficialUpdateAt || b.createdAt;
        return bTime - aTime;
      })
  );

  const isSessionLaunched = React.useCallback(
    (sessionId: string) => {
      const status = runtimeSnapshot.sessions[sessionId]?.status;
      return status === 'starting' || status === 'running';
    },
    [runtimeSnapshot],
  );

  const getSessionRuntimeStatus = React.useCallback(
    (sessionId: string) => runtimeSnapshot.sessions[sessionId]?.status || 'idle',
    [runtimeSnapshot],
  );

  const updateProject = (projectId: string, updater: (project: OpenCodeProject) => OpenCodeProject) => {
    setProjects((prev) => prev.map((project) => (project.id === projectId ? updater(project) : project)));
  };

  const updateSession = (sessionId: string, updater: (session: OpenCodeSession) => OpenCodeSession) => {
    setSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)));
  };

  const sendOpenCodeSessionCommand = React.useCallback((steps: Array<{ data: string; delayMs?: number }>) => {
    if (!activeSession) return false;
    return runtimeAdapterRef.current?.writeSteps(activeSession.id, steps) || false;
  }, [activeSession]);

  const applyProviderToRunningSession = React.useCallback((providerId: string) => {
    if (!providerId || !activeSession?.officialSessionId || !isActiveSessionLaunched) return false;
    const providerLabel = (info?.providers || []).find((provider) => provider.id === providerId)?.label || providerId;
    return sendOpenCodeSessionCommand([
      { data: '\u0015' },
      { data: '/connect\n', delayMs: 40 },
      { data: `${providerLabel}\n`, delayMs: 260 },
    ]);
  }, [activeSession?.officialSessionId, info?.providers, isActiveSessionLaunched, sendOpenCodeSessionCommand]);

  const applyModelToRunningSession = React.useCallback((modelId: string) => {
    if (!modelId || !activeSession?.officialSessionId || !isActiveSessionLaunched) return false;
    return sendOpenCodeSessionCommand([
      { data: '\u0015' },
      { data: '/model\n', delayMs: 40 },
      { data: `${modelId}\n`, delayMs: 260 },
    ]);
  }, [activeSession?.officialSessionId, isActiveSessionLaunched, sendOpenCodeSessionCommand]);

  const handleCreateCategory = () => {
    setCategoryEditor({ categoryId: null, name: '' });
    setIsCategoryEditorOpen(true);
  };

  const handleEditCategory = (category: OpenCodeCategory) => {
    setCategoryEditor({ categoryId: category.id, name: category.name });
    setIsCategoryEditorOpen(true);
  };

  const handleSaveCategory = () => {
    const name = categoryEditor.name.trim();
    if (!name) return;

    if (categoryEditor.categoryId) {
      setCategories((prev) => prev.map((category) => (
        category.id === categoryEditor.categoryId ? { ...category, name } : category
      )));
    } else {
      setCategories((prev) => [...prev, { id: uid('opencode-category'), name, isExpanded: true, createdAt: Date.now() }]);
    }

    setIsCategoryEditorOpen(false);
    setCategoryEditor({ categoryId: null, name: '' });
  };

  const handleDeleteCategory = (categoryId: string) => {
    if (categories.length <= 1) return;
    const fallbackCategory = categories.find((category) => category.id !== categoryId);
    if (!fallbackCategory) return;

    setProjects((prev) => prev.map((project) => (
      project.categoryId === categoryId ? { ...project, categoryId: fallbackCategory.id } : project
    )));
    setCategories((prev) => prev.filter((category) => category.id !== categoryId));
  };

  const handleOpenProjectEditor = (project?: OpenCodeProject, categoryId?: string) => {
    const fallbackCategoryId = categoryId || activeProject?.categoryId || categories[0]?.id || DEFAULT_CATEGORY_ID;
    setProjectEditor({
      projectId: project?.id || null,
      categoryId: project?.categoryId || fallbackCategoryId,
      title: project?.title || '',
      cwd: project?.cwd || settings.defaultCwd || info?.defaultCwd || '',
    });
    setIsProjectEditorOpen(true);
  };

  const handleSaveProject = () => {
    const cwd = projectEditor.cwd.trim();
    const title = projectEditor.title.trim() || basename(cwd || settings.defaultCwd || info?.defaultCwd || '');
    if (!projectEditor.categoryId || !cwd) return;

    if (projectEditor.projectId) {
      updateProject(projectEditor.projectId, (project) => ({
        ...project,
        categoryId: projectEditor.categoryId,
        title,
        cwd,
      }));
    } else {
      const project = makeProject(projectEditor.categoryId, cwd, settings, { title });
      const session = makeSession(project.id, 1, settings.defaultArgs);
      setProjects((prev) => [...prev, project]);
      setSessions((prev) => [...prev, session]);
      setActiveProjectId(project.id);
      setActiveSessionId(session.id);
    }

    setIsProjectEditorOpen(false);
  };

  const handleDeleteProject = (projectId: string) => {
    const deletedSessionIds = sessions.filter((session) => session.projectId === projectId).map((session) => session.id);
    const nextProjects = projects.filter((project) => project.id !== projectId);
    const nextSessions = sessions.filter((session) => session.projectId !== projectId);
    const fallbackProject = nextProjects[0] || null;
    const fallbackSession = nextSessions.find((session) => session.projectId === fallbackProject?.id) || nextSessions[0] || null;

    setProjects(nextProjects);
    setSessions(nextSessions.length ? nextSessions : fallbackProject ? [makeSession(fallbackProject.id, 1, settings.defaultArgs)] : []);
    setActiveProjectId(fallbackProject?.id || null);
    setActiveSessionId(fallbackSession?.id || null);
    deletedSessionIds.forEach((sessionId) => runtimeAdapterRef.current?.stopSession(sessionId));
  };

  const handleChooseProjectDirectory = async () => {
    const selected = await window.electronAPI?.selectDirectory?.();
    if (selected) {
      setProjectEditor((prev) => ({ ...prev, cwd: selected, title: prev.title || basename(selected) }));
    }
  };

  const handleSelectProject = (projectId: string) => {
    const projectSessions = getProjectSessions(projectId);
    setActiveProjectId(projectId);
    setActiveSessionId((prev) => (
      projectSessions.find((session) => session.id === prev)?.id || projectSessions[0]?.id || prev
    ));
  };

  const handleCreateSession = (projectId = activeProject?.id) => {
    if (!projectId) return;
    const projectSessions = getProjectSessions(projectId);
    const next = makeSession(projectId, projectSessions.length + 1, settings.inheritCurrentSessionOnCreate ? activeSession?.args || settings.defaultArgs : settings.defaultArgs);
    setSessions((prev) => [...prev, next]);
    setActiveProjectId(projectId);
    setActiveSessionId(next.id);
  };

  const handleDeleteSession = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target || target.officialSessionId) return;
    const siblingSessions = sessions.filter((session) => session.projectId === target.projectId && session.id !== sessionId);
    const nextSessions = sessions.filter((session) => session.id !== sessionId);

    if (!siblingSessions.length) {
      const fallback = makeSession(target.projectId, 1, settings.defaultArgs);
      setSessions([...nextSessions, fallback]);
      setActiveSessionId(fallback.id);
      setActiveProjectId(target.projectId);
    } else {
      setSessions(nextSessions);
      if (activeSessionId === sessionId) {
        setActiveSessionId(siblingSessions[0].id);
      }
    }

    runtimeAdapterRef.current?.stopSession(sessionId);
  };

  const handleDeleteOfficialSession = async (session: OpenCodeSession) => {
    if (!session.officialSessionId || !window.electronAPI?.deleteOpenCodeSession) return;

    const siblingSessions = getProjectSessions(session.projectId).filter((item) => item.id !== session.id);

    if (activeSessionId === session.id) {
      setRuntimeState(null);
      setActiveSessionId(siblingSessions[0]?.id || null);
    }

    const result = await window.electronAPI.deleteOpenCodeSession({
      sessionId: session.officialSessionId,
      directory: activeProject?.cwd || info?.defaultCwd || '',
    });

    if (!result.ok) {
      return;
    }

    runtimeAdapterRef.current?.stopSession(session.id);
    setSessions((prev) => prev.filter((item) => item.id !== session.id));
  };

  const handleCommitSessionRename = () => {
    const target = sessions.find((session) => session.id === editingSessionId);
    const title = editingSessionTitle.trim();
    if (!editingSessionId || target?.officialSessionId) return;
    if (title) {
      updateSession(editingSessionId, (session) => ({ ...session, title }));
    }
    setEditingSessionId(null);
    setEditingSessionTitle('');
  };

  const handleStartSessionRuntime = React.useCallback(async (session: OpenCodeSession) => {
    const project = projectById.get(session.projectId);
    const adapter = runtimeAdapterRef.current;
    if (!project || !adapter) return false;

    const existingState = adapter.getSession(session.id);
    if (existingState?.status === 'running' || existingState?.status === 'starting') {
      return true;
    }

    try {
      const state = adapter.startLogicalSession(session.id);

      if (state.status !== 'running') {
        setChatError(state.error || '后台 OpenCode 会话启动失败');
        return false;
      }

      setChatError(null);
      const startedAt = state.startedAt || Date.now();
      updateSession(session.id, (current) => ({
        ...current,
        runtimeStartedAt: current.officialSessionId ? current.runtimeStartedAt || startedAt : startedAt,
      }));
      return true;
    } catch (error) {
      adapter.stopSession(session.id);
      setChatError(error instanceof Error ? error.message : '后台会话启动失败');
      return false;
    }
  }, [
    projectById,
  ]);

  const handleStopSessionRuntime = React.useCallback((session: OpenCodeSession) => {
    runtimeAdapterRef.current?.stopSession(session.id);

    if (activeSessionId === session.id) {
      setIsSending(false);
      setOptimisticMessages([]);
      clearPendingSend();
    }
  }, [activeSessionId, clearPendingSend]);

  const handleToggleSessionRuntime = React.useCallback(async (session: OpenCodeSession) => {
    if (isSessionLaunched(session.id)) {
      handleStopSessionRuntime(session);
      return;
    }

    setActiveProjectId(session.projectId);
    setActiveSessionId(session.id);
    await handleStartSessionRuntime(session);
  }, [handleStartSessionRuntime, handleStopSessionRuntime, isSessionLaunched]);

  const handleSendPrompt = async () => {
    if (!activeProject || !activeSession) return;

    const prompt = draftPrompt.trim();
    if (!prompt || isSending) return;
    const adapter = runtimeAdapterRef.current;
    if (!adapter || !isSessionLaunched(activeSession.id)) {
      setChatError('请先从左侧启动当前对话，再发送消息。');
      return;
    }

    const sessionId = activeSession.id;
    const projectId = activeProject.id;
    const startedAt = Date.now();
    const streamId = uid('opencode-stream');
    const assistantOptimisticId = uid('opencode-chat-stream');
    const optimisticMessage: OpenCodeChatMessage = {
      id: uid('opencode-chat-optimistic'),
      role: 'user',
      providerId: activeProject.providerId || null,
      modelId: activeProject.modelId || null,
      timeCreated: Date.now(),
      timeUpdated: Date.now(),
      text: prompt,
      hasReasoning: false,
      hasTool: false,
      cost: null,
      totalTokens: null,
      parts: [],
      optimistic: true,
    };
    const upsertStreamingAssistantMessage = (textDelta: string) => {
      if (!textDelta) return;
      setOptimisticMessages((prev) => {
        const existing = prev.find((message) => message.id === assistantOptimisticId);
        if (existing) {
          return prev.map((message) => (
            message.id === assistantOptimisticId
              ? { ...message, text: `${message.text}${textDelta}`, timeUpdated: Date.now() }
              : message
          ));
        }

        const assistantMessage: OpenCodeChatMessage = {
          id: assistantOptimisticId,
          role: 'assistant',
          providerId: activeProject.providerId || null,
          modelId: activeProject.modelId || null,
          timeCreated: Date.now(),
          timeUpdated: Date.now(),
          text: textDelta,
          hasReasoning: false,
          hasTool: false,
          cost: null,
          totalTokens: null,
          parts: [],
          optimistic: true,
        };
        return [...prev, assistantMessage];
      });
    };

    setDraftPrompt('');
    setChatError(null);
    setIsSending(true);
    setOptimisticMessages((prev) => [...prev, optimisticMessage]);
    clearPendingSend();
    const timeoutId = window.setTimeout(() => {
      setIsSending(false);
      setChatError('OpenCode 生成超过 3 分钟，已停止等待。你可以稍后刷新当前对话数据。');
      clearPendingSend();
    }, 180000);

    pendingSendRef.current = {
      prompt,
      sentAt: startedAt,
      optimisticId: optimisticMessage.id,
      timeoutId,
    };

    const disposeStream = window.electronAPI?.onOpenCodeMessageStream?.((_event, payload) => {
      if (payload.streamId !== streamId) return;
      if (payload.type === 'text' && payload.text) {
        upsertStreamingAssistantMessage(payload.text);
      }
      if (payload.type === 'error' && payload.error) {
        setChatError(payload.error);
      }
    });

    try {
      const result = await adapter.sendPrompt({
        sessionId,
        streamId,
        directory: activeProject.cwd || info?.defaultCwd || '',
        officialSessionId: activeSession.officialSessionId || undefined,
        title: activeSession.title,
        providerId: activeProject.providerId,
        modelId: activeProject.modelId,
        argsText: activeSession.args || settings.defaultArgs,
        env: Object.fromEntries(envSummary.valid.map(({ key, value }) => [key, value])),
        prompt,
      });

      if (!result.ok) {
        throw new Error(result.error || result.stderr || result.stdout || 'OpenCode 发送失败');
      }

      const nextOfficialSessionId = result.sessionId || activeSession.officialSessionId || null;
      if (nextOfficialSessionId) {
        updateSession(sessionId, (session) => ({
          ...session,
          officialSessionId: nextOfficialSessionId,
          title: result.sessionTitle || session.title,
          runtimeStartedAt: session.runtimeStartedAt || startedAt,
          lastOfficialUpdateAt: Date.now(),
        }));

        if (window.electronAPI?.getOpenCodeSessionMessages) {
          const rows = await window.electronAPI.getOpenCodeSessionMessages({
            sessionId: nextOfficialSessionId,
          });
          setChatMessages(rows.filter(shouldDisplayOpenCodeMessage));
        }
      }

      if (window.electronAPI?.getOpenCodeSessions && activeProject.cwd) {
        try {
          const rows = await window.electronAPI.getOpenCodeSessions({ directory: activeProject.cwd });
          syncOfficialSessions(projectId, rows);
        } catch {
          // Keep the direct message result even if session list refresh fails.
        }
      }

      setOptimisticMessages((prev) => prev.filter((message) => message.id !== optimisticMessage.id && message.id !== assistantOptimisticId));
      setIsSending(false);
      setChatError(null);
      clearPendingSend();
      disposeStream?.();
    } catch (error) {
      disposeStream?.();
      setDraftPrompt(prompt);
      setChatError(error instanceof Error ? error.message : 'OpenCode 发送失败');
      setIsSending(false);
      setOptimisticMessages([]);
      clearPendingSend();
    }
  };

  const handleAddModel = () => {
    if (!activeProject) return;
    const model = modelDraft.trim();
    if (!model) return;

    updateProject(activeProject.id, (project) => ({
      ...project,
      modelId: model,
      availableModels: dedupeStrings([...project.availableModels, model]),
    }));

    if (activeProject.providerId) {
      setSettings((prev) => ({
        ...prev,
        knownModelsByProvider: {
          ...prev.knownModelsByProvider,
          [activeProject.providerId]: dedupeStrings([...(prev.knownModelsByProvider[activeProject.providerId] || []), model]),
        },
      }));
    }

    setModelDraft('');
  };

  useEffect(() => {
    setRuntimeState(null);
  }, [activeProjectId, activeSessionId]);

  if (!isInfoReady) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
        正在初始化 OpenCode...
      </div>
    );
  }

  if (!activeProject || !activeSession) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
        暂无可用项目，先创建一个 OpenCode 项目。
      </div>
    );
  }

  return (
    <div className="relative flex h-full overflow-hidden bg-white">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-5 w-5 shrink-0 text-slate-700" />
              <h1 className="truncate text-lg font-semibold text-slate-900">OpenCode</h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleCreateCategory} className="theme-icon-btn h-8 w-8 rounded-md" title="新建分类">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => handleOpenProjectEditor()} className="theme-icon-btn h-8 w-8 rounded-md" title="新建项目">
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 border-b border-slate-200 px-1 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索分类、项目或对话..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-200">
            {categories
              .filter((category) => visibleCategoryIds.has(category.id))
              .map((category) => {
                const categoryProjects = projects.filter((project) => project.categoryId === category.id);
                return (
                  <div key={category.id}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <button
                        onClick={() => setCategories((prev) => prev.map((item) => (
                          item.id === category.id ? { ...item, isExpanded: !item.isExpanded } : item
                        )))}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {category.isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                        <span className="truncate text-sm font-semibold text-slate-800">{category.name}</span>
                        <span className="text-[11px] text-slate-400">{categoryProjects.length}</span>
                      </button>
                      <div className="ml-2 flex items-center gap-1">
                        <button onClick={() => handleOpenProjectEditor(undefined, category.id)} className="theme-icon-btn h-7 w-7 rounded-md" title="新增项目">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleEditCategory(category)} className="theme-icon-btn h-7 w-7 rounded-md" title="编辑分类">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {categories.length > 1 ? (
                          <button onClick={() => handleDeleteCategory(category.id)} className="theme-icon-btn theme-icon-btn-danger h-7 w-7 rounded-md" title="删除分类">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {category.isExpanded ? (
                      <div className="border-t border-slate-100">
                        {categoryProjects.length ? categoryProjects.map((project) => {
                          const projectSessions = getProjectSessions(project.id).filter((session) => {
                            const query = keyword.trim().toLowerCase();
                            if (!query) return true;
                            return session.title.toLowerCase().includes(query)
                              || project.title.toLowerCase().includes(query)
                              || project.cwd.toLowerCase().includes(query);
                          });

                          if (!projectSessions.length && keyword.trim()) return null;

                          const isActiveProject = project.id === activeProject.id;
                          return (
                            <div key={project.id} className="border-b border-slate-100 last:border-b-0">
                              <div className={`flex items-start justify-between gap-3 px-4 py-3 ${isActiveProject ? 'bg-slate-50' : ''}`}>
                                <button onClick={() => handleSelectProject(project.id)} className="min-w-0 flex-1 text-left">
                                  <div className="truncate text-sm font-medium text-slate-900">{project.title}</div>
                                  <div className="mt-1 truncate text-[11px] text-slate-500">{project.cwd}</div>
                                  <div className="mt-1 truncate text-[11px] text-slate-400">
                                    {[project.providerId, project.modelId].filter(Boolean).join(' / ') || '未指定模型'}
                                  </div>
                                </button>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleCreateSession(project.id)} className="theme-icon-btn h-7 w-7 rounded-md" title="新建对话">
                                    <Plus className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleOpenProjectEditor(project)} className="theme-icon-btn h-7 w-7 rounded-md" title="编辑项目">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button onClick={() => handleDeleteProject(project.id)} className="theme-icon-btn theme-icon-btn-danger h-7 w-7 rounded-md" title="删除项目">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {isActiveProject ? (
                                <div className="border-t border-slate-100 bg-white py-1">
                                  {projectSessions.map((session) => {
                                    const isActiveSession = session.id === activeSession.id;
                                    const isEditing = editingSessionId === session.id;
                                    const isOfficialSession = Boolean(session.officialSessionId);
                                    const runtimeStatus = getSessionRuntimeStatus(session.id);
                                    const isStarting = runtimeStatus === 'starting';
                                    const isRunning = runtimeStatus === 'running';
                                    const isRuntimeActive = isStarting || isRunning;
                                    const runtimeTitle = runtimeStatus === 'starting'
                                      ? '正在启动当前对话'
                                      : runtimeStatus === 'running'
                                        ? '关闭当前对话'
                                        : runtimeStatus === 'error'
                                          ? '重新启动当前对话'
                                          : '启动当前对话';
                                    return (
                                      <div
                                        key={session.id}
                                        onClick={() => {
                                          setActiveProjectId(project.id);
                                          setActiveSessionId(session.id);
                                        }}
                                        className={`group flex cursor-pointer items-center gap-3 px-8 py-2 transition-colors ${isActiveSession ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                                      >
                                        <button
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void handleToggleSessionRuntime(session);
                                          }}
                                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                            isRuntimeActive
                                              ? 'border-blue-200 bg-blue-50 text-blue-600'
                                              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                                          }`}
                                          title={runtimeTitle}
                                        >
                                          {isStarting ? <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> : isRunning ? <X className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                        </button>
                                        {isEditing ? (
                                          <input
                                            autoFocus
                                            value={editingSessionTitle}
                                            onClick={(event) => event.stopPropagation()}
                                            onChange={(event) => setEditingSessionTitle(event.target.value)}
                                            onBlur={handleCommitSessionRename}
                                            onKeyDown={(event) => {
                                              if (event.key === 'Enter') {
                                                event.preventDefault();
                                                handleCommitSessionRename();
                                              }
                                              if (event.key === 'Escape') {
                                                event.preventDefault();
                                                setEditingSessionId(null);
                                                setEditingSessionTitle('');
                                              }
                                            }}
                                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                                          />
                                        ) : (
                                          <div className="min-w-0 flex-1 truncate text-sm">{session.title}</div>
                                        )}
                                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                          {isOfficialSession ? (
                                            <>
                                              <span className="text-[10px] uppercase tracking-wide text-slate-300">official</span>
                                              <button
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void handleDeleteOfficialSession(session);
                                                }}
                                                className="theme-icon-btn theme-icon-btn-danger h-6 w-6 rounded-md"
                                                title="删除官方会话"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setEditingSessionId(session.id);
                                                  setEditingSessionTitle(session.title);
                                                }}
                                                className="theme-icon-btn h-6 w-6 rounded-md"
                                                title="重命名对话"
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </button>
                                              <button
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  handleDeleteSession(session.id);
                                                }}
                                                className="theme-icon-btn theme-icon-btn-danger h-6 w-6 rounded-md"
                                                title="删除对话"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        }) : (
                          <div className="px-4 py-5 text-center text-xs text-slate-400">
                            这个分类下还没有项目
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="border-t border-slate-200 px-3 py-3">
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-2 border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              title="打开 OpenCode 专属中心"
            >
              <Settings2 className="h-4 w-4" />
              专属中心
            </button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {infoLoadFailed && !info ? (
          <div className="flex flex-1 items-center justify-center bg-slate-50">
            <div className="max-w-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="text-lg font-semibold text-slate-900">
                OpenCode 初始化失败
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                当前桌面端没有在时限内返回 OpenCode 基础信息。这通常是初始化偏慢或主进程数据源暂时异常，不代表本地 binary 一定缺失。
              </p>
              <button
                onClick={() => {
                  setIsInfoReady(false);
                  setInfoLoadFailed(false);
                  window.location.reload();
                }}
                className="mt-4 inline-flex items-center justify-center border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                重新加载模块
              </button>
            </div>
          </div>
        ) : !info?.binaryExists ? (
          <div className="flex flex-1 items-center justify-center bg-slate-50">
            <div className="max-w-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <div className="text-lg font-semibold text-slate-900">
                {window.electronAPI?.getOpenCodeInfo ? '未检测到 OpenCode 可执行文件' : 'OpenCode 仅支持桌面端'}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {window.electronAPI?.getOpenCodeInfo
                  ? '当前模块已经接好，但本地没有找到官方 `opencode` binary。请确认 `opencode-ai@1.14.29` 已安装，或重新打包桌面端。'
                  : 'Web 预览里不会注入 Electron API，所以这里只展示模块壳层。真正运行 OpenCode 需要从桌面端 app 打开。'}
              </p>
              <div className="mt-4 border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-500">
                {info?.binaryPath || '当前未提供可执行文件路径'}
              </div>
            </div>
          </div>
        ) : !isSessionLaunched(activeSession.id) ? (
          <div className="flex flex-1 items-center justify-center bg-white">
            <div className="max-w-xl text-center">
              <div className="text-2xl font-semibold tracking-tight text-slate-900">{activeSession.title}</div>
              <div className="mt-4 text-sm leading-7 text-slate-400">
                {activeRuntimeSession?.status === 'error'
                  ? activeRuntimeSession.error || '后台 OpenCode 会话启动失败。'
                  : '先从左侧点击启动图标，拉起后台 OpenCode 会话，再在这里进行原生聊天渲染。'}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div ref={messageScrollRef} className="min-h-0 flex-1 overflow-y-auto px-12 py-10">
              {visibleChatMessages.length ? (
                <div className="mx-auto flex w-full max-w-4xl flex-col">
                  {visibleChatMessages.map((message) => {
                    const isUser = message.role === 'user';
                    const text = message.text.trim() || (message.hasTool ? '已执行工具操作。' : '');
                    const providerLabel = getProviderLabel(message.providerId || activeProject.providerId);
                    const modelLabel = message.modelId || activeProject.modelId || '未指定';

                    return (
                      <div key={message.id} className={`border-b border-slate-100 py-7 ${isUser ? 'flex justify-end' : ''}`}>
                        <div className={`min-w-0 ${isUser ? 'max-w-[72%]' : 'w-full'}`}>
                          {isUser ? (
                            <div className="whitespace-pre-wrap text-right text-[15px] leading-8 text-slate-900">
                              {text}
                            </div>
                          ) : (
                            <>
                              <div className="text-[15px] leading-8 text-slate-800">
                                <MarkdownContent content={text} />
                              </div>
                              {renderOpenCodePartDetails(message.parts)}
                              <div className="mt-4 flex justify-end text-[11px] text-slate-400">
                                <span>{formatMessageTime(message.timeUpdated || message.timeCreated)}</span>
                                <span className="mx-2 text-slate-300">/</span>
                                <span>{providerLabel}</span>
                                <span className="mx-2 text-slate-300">/</span>
                                <span>{modelLabel}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isSending && !hasStreamingAssistantMessage ? (
                    <div className="border-b border-slate-100 py-7">
                      <div className="min-w-0 text-[15px] leading-8 text-slate-400">
                        正在生成回复…
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="w-full max-w-2xl text-center">
                    <div className="text-[28px] font-semibold tracking-tight text-slate-900">{activeSession.title}</div>
                    <div className="mt-3 text-sm leading-7 text-slate-400">
                      原生聊天初版已就绪，消息会直接从官方 OpenCode 会话中捕获并显示。
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 px-12 py-6">
              <div className="mx-auto w-full max-w-4xl">
                {chatError ? (
                  <div className="mb-4 border-b border-red-200 pb-3 text-sm text-red-500">
                    {chatError}
                  </div>
                ) : null}
                <div>
                  <div className="border-b border-slate-300 pb-3">
                    <textarea
                      value={draftPrompt}
                      onChange={(event) => setDraftPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendPrompt();
                        }
                      }}
                      placeholder="输入消息，回车发送，Shift + Enter 换行"
                      className="min-h-[84px] w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-8 text-slate-800 outline-none placeholder:text-slate-300"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => void handleSendPrompt()}
                      disabled={!draftPrompt.trim() || isSending}
                      className="text-sm text-slate-600 transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <aside className="flex w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-base font-semibold text-slate-900">数据区</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">工作目录</div>
            <div className="mt-2 break-all text-sm leading-6 text-slate-800">{activeProject.cwd || info?.defaultCwd || '未设置'}</div>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">当前状态</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Provider</span>
                <span className="truncate text-right text-slate-800">{currentProviderLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Model</span>
                <span className="truncate text-right text-slate-800">{currentModelLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">消费</span>
                <span className="truncate text-right text-slate-800">{currentCostLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Code Plan</span>
                <span className="truncate text-right text-slate-800">{currentCodePlanLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">对话轮次</span>
                <span className="truncate text-right text-slate-800">{currentTurnCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">总 Tokens</span>
                <span className="truncate text-right text-slate-800">{currentTokenCount}</span>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">可用 Provider</div>
            <select
              value={activeProject.providerId}
              onChange={(event) => {
                const nextProviderId = event.target.value;
                const nextDefaultModel = info?.defaultModelsByProvider?.[nextProviderId] || '';
                updateProject(activeProject.id, (project) => ({
                  ...project,
                  providerId: nextProviderId,
                  availableModels: dedupeStrings([
                    ...(settings.knownModelsByProvider[nextProviderId] || []),
                    nextDefaultModel,
                  ].filter(Boolean)),
                  modelId: project.providerId === nextProviderId ? project.modelId : nextDefaultModel,
                }));
                void applyProviderToRunningSession(nextProviderId);
              }}
              className="mt-2 w-full border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-700 outline-none"
            >
              <option value="">未指定</option>
              {(info?.providers || []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">可用 Model</div>
            <select
              value={activeProject.modelId}
              onChange={(event) => {
                const nextModelId = event.target.value;
                updateProject(activeProject.id, (project) => ({ ...project, modelId: nextModelId }));
                void applyModelToRunningSession(nextModelId);
              }}
              className="mt-2 w-full border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-700 outline-none"
            >
              <option value="">未指定</option>
              {availableModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            <div className="mt-2 text-xs text-slate-500">
              {availableModelOptions.length
                ? `当前 provider 已发现 ${availableModelOptions.length} 个 model`
                : '当前 provider 还没有可用 model 列表'}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={modelDraft}
                onChange={(event) => setModelDraft(event.target.value)}
                placeholder="手动添加模型"
                className="min-w-0 flex-1 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-700 outline-none"
              />
              <button
                onClick={handleAddModel}
                className="border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </aside>

      {isProjectEditorOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/25 p-6">
          <div className="w-full max-w-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{projectEditor.projectId ? '编辑项目' : '新建项目'}</div>
              <button onClick={() => setIsProjectEditorOpen(false)} className="theme-icon-btn h-9 w-9 rounded-md">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-slate-500">分类</div>
                <select
                  value={projectEditor.categoryId}
                  onChange={(event) => setProjectEditor((prev) => ({ ...prev, categoryId: event.target.value }))}
                  className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-slate-500">项目名称</div>
                <input
                  value={projectEditor.title}
                  onChange={(event) => setProjectEditor((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs font-medium text-slate-500">项目目录</div>
                <div className="flex gap-2">
                  <input
                    value={projectEditor.cwd}
                    onChange={(event) => setProjectEditor((prev) => ({ ...prev, cwd: event.target.value }))}
                    className="min-w-0 flex-1 border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => void handleChooseProjectDirectory()}
                    className="border border-slate-200 px-4 py-3 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    选择目录
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setIsProjectEditorOpen(false)} className="border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                取消
              </button>
              <button onClick={handleSaveProject} className="bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCategoryEditorOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/25 p-6">
          <div className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-slate-900">{categoryEditor.categoryId ? '编辑分类' : '新建分类'}</div>
              <button onClick={() => setIsCategoryEditorOpen(false)} className="theme-icon-btn h-9 w-9 rounded-md">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 block">
              <div className="mb-1.5 text-xs font-medium text-slate-500">分类名称</div>
              <input
                value={categoryEditor.name}
                onChange={(event) => setCategoryEditor((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
              />
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setIsCategoryEditorOpen(false)} className="border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50">
                取消
              </button>
              <button onClick={handleSaveCategory} className="bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/25 p-6">
          <div className="flex h-[min(760px,100%)] w-[min(960px,100%)] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <div className="text-xl font-semibold tracking-tight text-slate-900">OpenCode 专属中心</div>
                <p className="mt-1 text-sm text-slate-500">这里管全局默认项和终端行为，不再额外包卡片。</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="theme-icon-btn h-10 w-10 rounded-md" title="关闭专属中心">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.1fr,0.9fr]">
              <div className="border-r border-slate-200">
                <div className="border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-900">默认项目设置</div>
                <div className="space-y-4 px-6 py-5">
                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">默认工作目录</div>
                      <input
                        value={settings.defaultCwd}
                        onChange={(event) => setSettings((prev) => ({ ...prev, defaultCwd: event.target.value }))}
                        placeholder={info?.defaultCwd || '/path/to/project'}
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">默认附加参数</div>
                      <input
                        value={settings.defaultArgs}
                        onChange={(event) => setSettings((prev) => ({ ...prev, defaultArgs: event.target.value }))}
                        placeholder="例如：--agent build"
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">默认 Provider</div>
                      <select
                        value={settings.defaultProviderId}
                        onChange={(event) => setSettings((prev) => ({ ...prev, defaultProviderId: event.target.value }))}
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="">未指定</option>
                        {(info?.providers || []).map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">默认 Model</div>
                      <input
                        value={settings.defaultModelId}
                        onChange={(event) => setSettings((prev) => ({ ...prev, defaultModelId: event.target.value }))}
                        placeholder="例如：kimi-k2.6"
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      />
                    </label>

                    <label className="flex items-start gap-3 border-b border-slate-200 py-3">
                      <input
                        type="checkbox"
                        checked={settings.inheritCurrentSessionOnCreate}
                        onChange={(event) => setSettings((prev) => ({ ...prev, inheritCurrentSessionOnCreate: event.target.checked }))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-700">新建对话继承当前对话参数</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">关闭后会统一回退到全局默认参数。</div>
                      </div>
                    </label>

                  <label className="block">
                    <div className="mb-1.5 text-xs font-medium text-slate-500">环境变量</div>
                    <textarea
                      value={settings.envText}
                      onChange={(event) => setSettings((prev) => ({ ...prev, envText: event.target.value }))}
                      placeholder={`OPENAI_API_KEY=...\nOPENCODE_PROVIDER=openai`}
                      className="min-h-[220px] w-full border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-700 outline-none focus:border-blue-400"
                    />
                    <div className="mt-2 text-xs text-slate-500">
                      有效 {envSummary.valid.length} 条
                      {envSummary.invalid.length ? `，忽略 ${envSummary.invalid.length} 条无效写法` : ''}
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <div className="border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-900">终端与本地环境</div>
                <div className="space-y-4 px-6 py-5">
                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">终端档案</div>
                      <select
                        value={settings.terminalProfile}
                        onChange={(event) => setSettings((prev) => ({ ...prev, terminalProfile: event.target.value as OpenCodeTerminalProfile }))}
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="coding-cli">编程 CLI</option>
                        <option value="default">默认终端</option>
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1.5 text-xs font-medium text-slate-500">渲染模式</div>
                      <select
                        value={settings.rendererMode}
                        onChange={(event) => setSettings((prev) => ({ ...prev, rendererMode: event.target.value as OpenCodeRendererMode }))}
                        className="w-full border-b border-slate-200 bg-white px-0 py-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                      >
                        <option value="compatibility">兼容模式</option>
                        <option value="auto">自适应 GPU</option>
                      </select>
                    </label>
                    <div className="border-b border-slate-200 py-3">
                      <div className="text-xs font-medium text-slate-500">二进制路径</div>
                      <div className="mt-1 break-all font-mono text-[12px] leading-5 text-slate-700">{info?.binaryPath || '未检测到'}</div>
                    </div>
                    <div className="border-b border-slate-200 py-3">
                      <div className="text-xs font-medium text-slate-500">检测版本</div>
                      <div className="mt-1 text-sm text-slate-700">{info?.version ? `v${info.version}` : '未知'}</div>
                    </div>
                    <div className="border-b border-slate-200 py-3">
                      <div className="text-xs font-medium text-slate-500">凭证文件</div>
                      <div className="mt-1 break-all font-mono text-[12px] leading-5 text-slate-700">{info?.authPath || '未提供'}</div>
                    </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <div className="text-xs text-slate-500">这层只改宿主壳，不碰 OpenCode 内核。</div>
              <button onClick={() => setIsSettingsOpen(false)} className="bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const OpenCodeManager: React.FC<OpenCodeManagerProps> = (props) => (
  <OpenCodeModuleErrorBoundary>
    <OpenCodeManagerInner {...props} />
  </OpenCodeModuleErrorBoundary>
);

export default OpenCodeManager;
