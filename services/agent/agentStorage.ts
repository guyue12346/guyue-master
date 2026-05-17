import {
  ChatConfig,
  DEFAULT_CHAT_CONFIG,
} from '../chatService';
import { normalizeStructuredMemory, trimConversationForStorage } from '../conversationMemory';
import type { ConversationMemoryState } from '../conversationMemory';
import {
  AgentFullAccessPermissions,
  AgentToolPermissions,
  DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS,
  DEFAULT_AGENT_TOOL_PERMISSIONS,
  DEFAULT_DATA_PERMISSIONS,
  DataPermissions,
  deriveDataPermissionsFromToolPermissions,
  getAgentPermissionModules,
} from './agentPermissions';
import { loadLocalJson, loadUnifiedJson, saveLocalJson, saveUnifiedJson } from '../../utils/unifiedStorage';

export const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
export const STORAGE_KEY_AGENT_COMPLEX_TASK_CONFIG = 'guyue_agent_complex_task_config';
export const STORAGE_KEY_AGENT_SEARCH_CONFIG = 'guyue_agent_search_config';
export const STORAGE_KEY_AGENT_RUNTIME_CONFIG = 'guyue_agent_runtime_config';
export const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';
export const STORAGE_KEY_AGENT_MEMORY = 'guyue_agent_memory';
export const STORAGE_KEY_AGENT_PERMISSIONS = 'guyue_agent_permissions';
export const STORAGE_KEY_MODULE_PROMPTS = 'guyue_agent_module_prompts';
export const STORAGE_KEY_CONTACTS = 'guyue_agent_contacts';
export const AGENT_EMAIL_CONFIG_KEY = 'linkmaster_email_config';

const STORE_KEY_AGENT_CONFIG = 'agent-config';
const STORE_KEY_AGENT_COMPLEX_TASK_CONFIG = 'agent-complex-task-config';
const STORE_KEY_AGENT_SEARCH_CONFIG = 'agent-search-config';
const STORE_KEY_AGENT_RUNTIME_CONFIG = 'agent-runtime-config';
const STORE_KEY_AGENT_HISTORY = 'agent-history';
const STORE_KEY_AGENT_MEMORY = 'agent-memory';
const STORE_KEY_AGENT_PERMISSIONS = 'agent-permissions';
const STORE_KEY_MODULE_PROMPTS = 'agent-module-prompts';
const STORE_KEY_CONTACTS = 'agent-contacts';

export const DEFAULT_AGENT_EMAIL_CONFIG = {
  enabled: false,
  smtp: { host: '', port: 465, secure: true, user: '', pass: '' },
  recipient: '',
  senderName: '古月的Agent助理',
};

export type AgentEmailConfig = typeof DEFAULT_AGENT_EMAIL_CONFIG;

export interface AgentComplexTaskConfig extends ChatConfig {
  enabled: boolean;
}

export const DEFAULT_AGENT_COMPLEX_TASK_CONFIG: AgentComplexTaskConfig = {
  ...DEFAULT_CHAT_CONFIG,
  enabled: false,
  systemPrompt: [
    '你是 Guyue Master Agent 的复杂需求处理模型。',
    '你只负责处理被委托来的复杂写作、长文本生成、深度分析、复杂推理和结构化方案输出。',
    '严格按委托任务要求输出最终内容，不要声称自己操作了本地应用工具。',
  ].join('\n'),
  temperature: 0.7,
  maxTokens: 8192,
};

export type AgentSearchProvider =
  | 'duckduckgo-browser'
  | 'openai-web-search'
  | 'searxng'
  | 'brave'
  | 'tavily'
  | 'exa'
  | 'firecrawl'
  | 'bing-web-search'
  | 'google-cse';
export type AgentSearchMode = 'fast' | 'balanced' | 'deep';
export type AgentSpecializedSearchSource = 'github' | 'npm' | 'stackoverflow' | 'arxiv';

export interface AgentSpecializedSearchConfig {
  enabledSources: AgentSpecializedSearchSource[];
  maxResults: number;
  apiKeys: {
    github: string;
    stackExchange: string;
  };
}

export interface AgentSearchConfig {
  provider: AgentSearchProvider;
  fallbackProviders: AgentSearchProvider[];
  mode: AgentSearchMode;
  maxResults: number;
  maxOpenPages: number;
  includeAnswer: boolean;
  includeRawContent: boolean;
  apiKeys: {
    openai: string;
    bing: string;
    google: string;
    brave: string;
    tavily: string;
    exa: string;
    firecrawl: string;
  };
  bingEndpoint: string;
  googleCx: string;
  searxngBaseUrl: string;
  firecrawlBaseUrl: string;
  language: string;
  country: string;
  specialized: AgentSpecializedSearchConfig;
}

export const DEFAULT_AGENT_SEARCH_CONFIG: AgentSearchConfig = {
  provider: 'duckduckgo-browser',
  fallbackProviders: [],
  mode: 'balanced',
  maxResults: 8,
  maxOpenPages: 1,
  includeAnswer: true,
  includeRawContent: false,
  apiKeys: {
    openai: '',
    bing: '',
    google: '',
    brave: '',
    tavily: '',
    exa: '',
    firecrawl: '',
  },
  bingEndpoint: 'https://api.bing.microsoft.com/v7.0/search',
  googleCx: '',
  searxngBaseUrl: '',
  firecrawlBaseUrl: 'https://api.firecrawl.dev',
  language: 'zh-CN',
  country: 'CN',
  specialized: {
    enabledSources: ['github', 'npm', 'stackoverflow', 'arxiv'],
    maxResults: 8,
    apiKeys: {
      github: '',
      stackExchange: '',
    },
  },
};

export interface AgentRuntimeConfig {
  maxIterations: number;
}

export const DEFAULT_AGENT_RUNTIME_CONFIG: AgentRuntimeConfig = {
  maxIterations: 10,
};

export interface Contact {
  id: string;
  nickname: string;
  email: string;
  note: string;
}

const normalizeConfig = (value: any): ChatConfig => ({
  ...DEFAULT_CHAT_CONFIG,
  ...(value && typeof value === 'object' ? value : {}),
  systemPrompt: typeof value?.systemPrompt === 'string' ? value.systemPrompt : '',
});

const normalizeComplexTaskConfig = (value: any): AgentComplexTaskConfig => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = normalizeConfig(source);
  const maxTokens = Number(source.maxTokens);
  const temperature = Number(source.temperature);
  return {
    ...DEFAULT_AGENT_COMPLEX_TASK_CONFIG,
    ...normalized,
    enabled: Boolean(source.enabled),
    systemPrompt: typeof source.systemPrompt === 'string'
      ? source.systemPrompt
      : DEFAULT_AGENT_COMPLEX_TASK_CONFIG.systemPrompt,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_AGENT_COMPLEX_TASK_CONFIG.temperature,
    maxTokens: Number.isFinite(maxTokens)
      ? Math.min(Math.max(Math.floor(maxTokens), 1024), 64000)
      : DEFAULT_AGENT_COMPLEX_TASK_CONFIG.maxTokens,
  };
};

const AGENT_SEARCH_MODES = new Set<AgentSearchMode>(['fast', 'balanced', 'deep']);
const AGENT_SEARCH_PROVIDERS = new Set<AgentSearchProvider>([
  'duckduckgo-browser',
  'openai-web-search',
  'searxng',
  'brave',
  'tavily',
  'exa',
  'firecrawl',
  'bing-web-search',
  'google-cse',
]);

const normalizeSearchProvider = (value: unknown): AgentSearchProvider => {
  if (typeof value === 'string' && AGENT_SEARCH_PROVIDERS.has(value as AgentSearchProvider)) {
    return value as AgentSearchProvider;
  }
  return DEFAULT_AGENT_SEARCH_CONFIG.provider;
};

const hasProviderConfig = (
  provider: AgentSearchProvider,
  source: Record<string, any>,
  apiKeys: AgentSearchConfig['apiKeys'],
): boolean => {
  switch (provider) {
    case 'duckduckgo-browser':
      return true;
    case 'openai-web-search':
      return Boolean(apiKeys.openai.trim());
    case 'bing-web-search':
      return Boolean(apiKeys.bing.trim());
    case 'google-cse':
      return Boolean(apiKeys.google.trim() && typeof source.googleCx === 'string' && source.googleCx.trim());
    case 'brave':
      return Boolean(apiKeys.brave.trim());
    case 'tavily':
      return Boolean(apiKeys.tavily.trim());
    case 'exa':
      return Boolean(apiKeys.exa.trim());
    case 'firecrawl':
      return Boolean(apiKeys.firecrawl.trim());
    case 'searxng':
      return Boolean(typeof source.searxngBaseUrl === 'string' && source.searxngBaseUrl.trim());
    default:
      return true;
  }
};

const normalizeSpecializedSearchConfig = (value: any): AgentSpecializedSearchConfig => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const maxResults = Number(source.maxResults);
  const apiKeys = source.apiKeys && typeof source.apiKeys === 'object' ? source.apiKeys : {};
  const enabledSources = Array.isArray(source.enabledSources)
    ? source.enabledSources.filter((item: unknown): item is AgentSpecializedSearchSource => (
      item === 'github' || item === 'npm' || item === 'stackoverflow' || item === 'arxiv'
    ))
    : DEFAULT_AGENT_SEARCH_CONFIG.specialized.enabledSources;

  return {
    enabledSources: enabledSources.length > 0 ? enabledSources : DEFAULT_AGENT_SEARCH_CONFIG.specialized.enabledSources,
    maxResults: Number.isFinite(maxResults) ? Math.min(Math.max(Math.floor(maxResults), 3), 20) : DEFAULT_AGENT_SEARCH_CONFIG.specialized.maxResults,
    apiKeys: {
      github: typeof apiKeys.github === 'string' ? apiKeys.github : '',
      stackExchange: typeof apiKeys.stackExchange === 'string' ? apiKeys.stackExchange : '',
    },
  };
};

const normalizeSearchConfig = (value: any): AgentSearchConfig => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const apiKeys = source.apiKeys && typeof source.apiKeys === 'object' ? source.apiKeys : {};
  const maxResults = Number(source.maxResults);
  const maxOpenPages = Number(source.maxOpenPages);
  const normalizedApiKeys = {
    openai: typeof apiKeys.openai === 'string' ? apiKeys.openai : '',
    bing: typeof apiKeys.bing === 'string' ? apiKeys.bing : '',
    google: typeof apiKeys.google === 'string' ? apiKeys.google : '',
    brave: typeof apiKeys.brave === 'string' ? apiKeys.brave : '',
    tavily: typeof apiKeys.tavily === 'string' ? apiKeys.tavily : '',
    exa: typeof apiKeys.exa === 'string' ? apiKeys.exa : '',
    firecrawl: typeof apiKeys.firecrawl === 'string' ? apiKeys.firecrawl : '',
  };
  const savedProvider = normalizeSearchProvider(source.provider);
  const provider = hasProviderConfig(savedProvider, source, normalizedApiKeys)
    ? savedProvider
    : DEFAULT_AGENT_SEARCH_CONFIG.provider;
  const fallbackProviders = Array.isArray(source.fallbackProviders)
    ? source.fallbackProviders.map(normalizeSearchProvider).filter((item, index, array) => array.indexOf(item) === index)
    : DEFAULT_AGENT_SEARCH_CONFIG.fallbackProviders;
  if (provider !== 'duckduckgo-browser' && !fallbackProviders.includes('duckduckgo-browser')) {
    fallbackProviders.push('duckduckgo-browser');
  }

  return {
    provider,
    fallbackProviders,
    mode: AGENT_SEARCH_MODES.has(source.mode) ? source.mode : DEFAULT_AGENT_SEARCH_CONFIG.mode,
    maxResults: Number.isFinite(maxResults) ? Math.min(Math.max(Math.floor(maxResults), 3), 20) : DEFAULT_AGENT_SEARCH_CONFIG.maxResults,
    maxOpenPages: Number.isFinite(maxOpenPages) ? Math.min(Math.max(Math.floor(maxOpenPages), 1), 5) : DEFAULT_AGENT_SEARCH_CONFIG.maxOpenPages,
    includeAnswer: source.includeAnswer !== false,
    includeRawContent: Boolean(source.includeRawContent),
    apiKeys: normalizedApiKeys,
    bingEndpoint: typeof source.bingEndpoint === 'string' && source.bingEndpoint.trim()
      ? source.bingEndpoint.trim()
      : DEFAULT_AGENT_SEARCH_CONFIG.bingEndpoint,
    googleCx: typeof source.googleCx === 'string' ? source.googleCx.trim() : '',
    searxngBaseUrl: typeof source.searxngBaseUrl === 'string' ? source.searxngBaseUrl.trim() : '',
    firecrawlBaseUrl: typeof source.firecrawlBaseUrl === 'string' && source.firecrawlBaseUrl.trim()
      ? source.firecrawlBaseUrl.trim()
      : DEFAULT_AGENT_SEARCH_CONFIG.firecrawlBaseUrl,
    language: typeof source.language === 'string' && source.language.trim() ? source.language : DEFAULT_AGENT_SEARCH_CONFIG.language,
    country: typeof source.country === 'string' && source.country.trim() ? source.country : DEFAULT_AGENT_SEARCH_CONFIG.country,
    specialized: normalizeSpecializedSearchConfig(source.specialized),
  };
};

const normalizeRuntimeConfig = (value: any): AgentRuntimeConfig => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const maxIterations = Number(source.maxIterations);
  return {
    maxIterations: Number.isFinite(maxIterations)
      ? Math.min(Math.max(Math.floor(maxIterations), 3), 50)
      : DEFAULT_AGENT_RUNTIME_CONFIG.maxIterations,
  };
};

export interface StoredAgentPermissions {
  data: DataPermissions;
  files: string[];
  tools: AgentToolPermissions;
  fullAccess: AgentFullAccessPermissions;
}

const normalizePermissionLevel = (value: any) => ({
  read: Boolean(value?.read),
  write: Boolean(value?.write),
});

const normalizeDataPermissions = (value: any): DataPermissions => ({
  todos: normalizePermissionLevel(value?.todos ?? DEFAULT_DATA_PERMISSIONS.todos),
  ojStats: normalizePermissionLevel(value?.ojStats ?? DEFAULT_DATA_PERMISSIONS.ojStats),
  resources: normalizePermissionLevel(value?.resources ?? DEFAULT_DATA_PERMISSIONS.resources),
  leetcodeLists: normalizePermissionLevel(value?.leetcodeLists ?? DEFAULT_DATA_PERMISSIONS.leetcodeLists),
  learningCourses: normalizePermissionLevel(value?.learningCourses ?? DEFAULT_DATA_PERMISSIONS.learningCourses),
});

const normalizeModuleCrud = (value: any) => ({
  read: Boolean(value?.read),
  create: Boolean(value?.create),
  update: Boolean(value?.update),
  delete: Boolean(value?.delete),
});

const moduleCrudFromLegacy = (read?: boolean, write?: boolean) => ({
  read: Boolean(read),
  create: Boolean(write),
  update: Boolean(write),
  delete: Boolean(write),
});

const migrateLegacyToolPermissions = (data: DataPermissions): AgentToolPermissions => ({
  ...DEFAULT_AGENT_TOOL_PERMISSIONS,
  todo: moduleCrudFromLegacy(data.todos.read, data.todos.write),
  notes: moduleCrudFromLegacy(data.todos.read, data.todos.write),
  prompts: moduleCrudFromLegacy(data.todos.read, data.todos.write),
  markdown: moduleCrudFromLegacy(data.todos.read, data.todos.write),
  'dc-oj': moduleCrudFromLegacy(data.ojStats.read, data.ojStats.write),
  'dc-resources': moduleCrudFromLegacy(data.resources.read, data.resources.write),
  learning: moduleCrudFromLegacy(data.learningCourses.read, data.learningCourses.write),
  leetcode: moduleCrudFromLegacy(data.leetcodeLists.read, data.leetcodeLists.write),
});

const normalizeToolPermissions = (value: any, data: DataPermissions): AgentToolPermissions => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : migrateLegacyToolPermissions(data);

  return getAgentPermissionModules().reduce((acc, module) => {
    if (module.key === 'dc-oj' && source.datacenter && !source['dc-oj']) {
      acc[module.key] = normalizeModuleCrud({
        read: source.datacenter.read,
        create: source.datacenter.create,
        update: false,
        delete: false,
      });
      return acc;
    }
    if (module.key === 'dc-resources' && source.datacenter && !source['dc-resources']) {
      acc[module.key] = normalizeModuleCrud(source.datacenter);
      return acc;
    }
    acc[module.key] = normalizeModuleCrud(source[module.key] ?? DEFAULT_AGENT_TOOL_PERMISSIONS[module.key]);
    return acc;
  }, {} as AgentToolPermissions);
};

const normalizePermissions = (value: any): StoredAgentPermissions => {
  const rawData = normalizeDataPermissions(value?.data);
  const tools = normalizeToolPermissions(value?.tools, rawData);
  const fullAccess = normalizeToolPermissions(value?.fullAccess, DEFAULT_DATA_PERMISSIONS);
  return {
    data: value?.tools ? deriveDataPermissionsFromToolPermissions(tools) : rawData,
    files: Array.isArray(value?.files) ? value.files : [],
    tools,
    fullAccess,
  };
};

const normalizeModulePrompts = (value: any, defaults: Record<string, string>) => {
  const userPrompts = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { ...defaults, ...userPrompts };
};

const normalizeContacts = (value: any): Contact[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): Contact | null => {
      if (!item || typeof item !== 'object') return null;
      return {
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        nickname: typeof item.nickname === 'string' ? item.nickname : '',
        email: typeof item.email === 'string' ? item.email : '',
        note: typeof item.note === 'string' ? item.note : '',
      };
    })
    .filter((item): item is Contact => Boolean(item));
};

const normalizeConversationMemory = (value: any): ConversationMemoryState | null => {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string') return null;
  return {
    summary: value.summary,
    structured: normalizeStructuredMemory(value.structured),
    compactedUntilMessageId: typeof value.compactedUntilMessageId === 'string' ? value.compactedUntilMessageId : undefined,
    compactedUntilTimestamp: typeof value.compactedUntilTimestamp === 'number' ? value.compactedUntilTimestamp : undefined,
    sourceMessageCount: typeof value.sourceMessageCount === 'number' ? value.sourceMessageCount : undefined,
    sourceCharCount: typeof value.sourceCharCount === 'number' ? value.sourceCharCount : undefined,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    version: 1,
  };
};

export const loadAgentConfig = (): ChatConfig =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_CONFIG,
    defaultValue: () => ({ ...DEFAULT_CHAT_CONFIG, systemPrompt: '' }),
    normalize: normalizeConfig,
  });

export const loadAgentConfigFromUnified = (): Promise<ChatConfig> =>
  loadUnifiedJson({
    appDataKey: STORE_KEY_AGENT_CONFIG,
    localStorageKey: STORAGE_KEY_AGENT_CONFIG,
    defaultValue: () => ({ ...DEFAULT_CHAT_CONFIG, systemPrompt: '' }),
    normalize: normalizeConfig,
  });

export const saveAgentConfig = (config: ChatConfig): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_CONFIG,
      localStorageKey: STORAGE_KEY_AGENT_CONFIG,
      defaultValue: () => ({ ...DEFAULT_CHAT_CONFIG, systemPrompt: '' }),
      normalize: normalizeConfig,
    },
    config,
  );
};

export const loadAgentComplexTaskConfig = (): AgentComplexTaskConfig =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_COMPLEX_TASK_CONFIG,
    defaultValue: () => ({ ...DEFAULT_AGENT_COMPLEX_TASK_CONFIG }),
    normalize: normalizeComplexTaskConfig,
  });

export const saveAgentComplexTaskConfig = (config: AgentComplexTaskConfig): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_COMPLEX_TASK_CONFIG,
      localStorageKey: STORAGE_KEY_AGENT_COMPLEX_TASK_CONFIG,
      defaultValue: () => ({ ...DEFAULT_AGENT_COMPLEX_TASK_CONFIG }),
      normalize: normalizeComplexTaskConfig,
    },
    normalizeComplexTaskConfig(config),
  );
};

export const loadAgentSearchConfig = (): AgentSearchConfig =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_SEARCH_CONFIG,
    defaultValue: () => ({ ...DEFAULT_AGENT_SEARCH_CONFIG }),
    normalize: normalizeSearchConfig,
  });

export const saveAgentSearchConfig = (config: AgentSearchConfig): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_SEARCH_CONFIG,
      localStorageKey: STORAGE_KEY_AGENT_SEARCH_CONFIG,
      defaultValue: () => ({ ...DEFAULT_AGENT_SEARCH_CONFIG }),
      normalize: normalizeSearchConfig,
    },
    config,
  );
};

export const loadAgentRuntimeConfig = (): AgentRuntimeConfig =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_RUNTIME_CONFIG,
    defaultValue: () => ({ ...DEFAULT_AGENT_RUNTIME_CONFIG }),
    normalize: normalizeRuntimeConfig,
  });

export const saveAgentRuntimeConfig = (config: AgentRuntimeConfig): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_RUNTIME_CONFIG,
      localStorageKey: STORAGE_KEY_AGENT_RUNTIME_CONFIG,
      defaultValue: () => ({ ...DEFAULT_AGENT_RUNTIME_CONFIG }),
      normalize: normalizeRuntimeConfig,
    },
    config,
  );
};

export const loadAgentHistory = <T = any>(): T[] =>
  loadLocalJson<T[]>({
    localStorageKey: STORAGE_KEY_AGENT_HISTORY,
    defaultValue: () => [],
    normalize: value => Array.isArray(value) ? trimConversationForStorage(value as any[], { maxMessages: 200 }) as T[] : [],
  });

export const saveAgentHistory = <T>(messages: T[]): void => {
  const trimmed = Array.isArray(messages) ? trimConversationForStorage(messages as any[], { maxMessages: 200 }) as T[] : [];
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_HISTORY,
      localStorageKey: STORAGE_KEY_AGENT_HISTORY,
      defaultValue: () => [],
      normalize: value => Array.isArray(value) ? trimConversationForStorage(value as any[], { maxMessages: 200 }) as T[] : [],
    },
    trimmed,
  );
};

export const loadAgentMemory = (): ConversationMemoryState | null =>
  loadLocalJson<ConversationMemoryState | null>({
    localStorageKey: STORAGE_KEY_AGENT_MEMORY,
    defaultValue: () => null,
    normalize: normalizeConversationMemory,
  });

export const saveAgentMemory = (memory: ConversationMemoryState | null): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_MEMORY,
      localStorageKey: STORAGE_KEY_AGENT_MEMORY,
      defaultValue: () => null,
      normalize: normalizeConversationMemory,
    },
    memory,
  );
};

export const clearAgentHistory = (): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_AGENT_HISTORY);
    localStorage.removeItem(STORAGE_KEY_AGENT_MEMORY);
  }
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_HISTORY,
      localStorageKey: STORAGE_KEY_AGENT_HISTORY,
      defaultValue: () => [],
      normalize: value => Array.isArray(value) ? trimConversationForStorage(value as any[], { maxMessages: 200 }) : [],
    },
    [],
  );
  saveAgentMemory(null);
};

export const loadAgentPermissions = (): StoredAgentPermissions =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_PERMISSIONS,
    defaultValue: () => ({ data: { ...DEFAULT_DATA_PERMISSIONS }, files: [], tools: { ...DEFAULT_AGENT_TOOL_PERMISSIONS }, fullAccess: { ...DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS } }),
    normalize: normalizePermissions,
  });

export const saveAgentPermissions = (
  data: DataPermissions,
  files: string[],
  tools: AgentToolPermissions,
  fullAccess: AgentFullAccessPermissions,
): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_PERMISSIONS,
      localStorageKey: STORAGE_KEY_AGENT_PERMISSIONS,
      defaultValue: () => ({ data: { ...DEFAULT_DATA_PERMISSIONS }, files: [], tools: { ...DEFAULT_AGENT_TOOL_PERMISSIONS }, fullAccess: { ...DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS } }),
      normalize: normalizePermissions,
    },
    { data, files, tools, fullAccess },
  );
};

export const loadModulePrompts = (defaults: Record<string, string>): Record<string, string> =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_MODULE_PROMPTS,
    defaultValue: () => ({ ...defaults }),
    normalize: value => normalizeModulePrompts(value, defaults),
  });

export const saveModulePrompts = (prompts: Record<string, string>): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_MODULE_PROMPTS,
      localStorageKey: STORAGE_KEY_MODULE_PROMPTS,
      defaultValue: () => ({}),
      normalize: value => value && typeof value === 'object' && !Array.isArray(value) ? value : {},
    },
    prompts,
  );
};

export const loadContacts = (): Contact[] =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_CONTACTS,
    defaultValue: () => [],
    normalize: normalizeContacts,
  });

export const saveContacts = (contacts: Contact[]) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_CONTACTS,
      localStorageKey: STORAGE_KEY_CONTACTS,
      defaultValue: () => [],
      normalize: normalizeContacts,
    },
    contacts,
  );
};

export const saveLegacyEmailConfig = (config: AgentEmailConfig) => {
  saveLocalJson(AGENT_EMAIL_CONFIG_KEY, config);
};
