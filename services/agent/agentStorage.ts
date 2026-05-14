import {
  ChatConfig,
  DEFAULT_CHAT_CONFIG,
} from '../chatService';
import {
  AGENT_PERMISSION_MODULES,
  AgentFullAccessPermissions,
  AgentToolPermissions,
  DEFAULT_AGENT_FULL_ACCESS_PERMISSIONS,
  DEFAULT_AGENT_TOOL_PERMISSIONS,
  DEFAULT_DATA_PERMISSIONS,
  DataPermissions,
  deriveDataPermissionsFromToolPermissions,
} from './agentPermissions';
import { loadLocalJson, saveLocalJson, saveUnifiedJson } from '../../utils/unifiedStorage';

export const STORAGE_KEY_AGENT_CONFIG = 'guyue_agent_config';
export const STORAGE_KEY_AGENT_ROUTER_CONFIG = 'guyue_agent_router_config';
export const STORAGE_KEY_AGENT_HISTORY = 'guyue_agent_history';
export const STORAGE_KEY_AGENT_PERMISSIONS = 'guyue_agent_permissions';
export const STORAGE_KEY_MODULE_PROMPTS = 'guyue_agent_module_prompts';
export const STORAGE_KEY_CONTACTS = 'guyue_agent_contacts';
export const AGENT_EMAIL_CONFIG_KEY = 'linkmaster_email_config';

const STORE_KEY_AGENT_CONFIG = 'agent-config';
const STORE_KEY_AGENT_ROUTER_CONFIG = 'agent-router-config';
const STORE_KEY_AGENT_HISTORY = 'agent-history';
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

  return AGENT_PERMISSION_MODULES.reduce((acc, module) => {
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

export const loadAgentConfig = (): ChatConfig =>
  loadLocalJson({
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

export const DEFAULT_AGENT_ROUTER_CONFIG: ChatConfig = {
  ...DEFAULT_CHAT_CONFIG,
  systemPrompt: '',
  temperature: 0,
  maxTokens: 1024,
};

export const loadAgentRouterConfig = (): ChatConfig =>
  loadLocalJson({
    localStorageKey: STORAGE_KEY_AGENT_ROUTER_CONFIG,
    defaultValue: () => ({ ...DEFAULT_AGENT_ROUTER_CONFIG }),
    normalize: value => ({
      ...DEFAULT_AGENT_ROUTER_CONFIG,
      ...(value && typeof value === 'object' ? value : {}),
      systemPrompt: '',
      temperature: typeof value?.temperature === 'number' ? value.temperature : 0,
      maxTokens: typeof value?.maxTokens === 'number' ? value.maxTokens : 1024,
    }),
  });

export const saveAgentRouterConfig = (config: ChatConfig): void => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_ROUTER_CONFIG,
      localStorageKey: STORAGE_KEY_AGENT_ROUTER_CONFIG,
      defaultValue: () => ({ ...DEFAULT_AGENT_ROUTER_CONFIG }),
      normalize: value => ({
        ...DEFAULT_AGENT_ROUTER_CONFIG,
        ...(value && typeof value === 'object' ? value : {}),
        systemPrompt: '',
      }),
    },
    { ...config, systemPrompt: '', temperature: config.temperature ?? 0, maxTokens: config.maxTokens ?? 1024 },
  );
};

export const loadAgentHistory = <T = any>(): T[] =>
  loadLocalJson<T[]>({
    localStorageKey: STORAGE_KEY_AGENT_HISTORY,
    defaultValue: () => [],
    normalize: value => Array.isArray(value) ? value.slice(-20) : [],
  });

export const saveAgentHistory = <T>(messages: T[]): void => {
  const trimmed = Array.isArray(messages) ? messages.slice(-20) : [];
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_HISTORY,
      localStorageKey: STORAGE_KEY_AGENT_HISTORY,
      defaultValue: () => [],
      normalize: value => Array.isArray(value) ? value.slice(-20) : [],
    },
    trimmed,
  );
};

export const clearAgentHistory = (): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_AGENT_HISTORY);
  }
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AGENT_HISTORY,
      localStorageKey: STORAGE_KEY_AGENT_HISTORY,
      defaultValue: () => [],
      normalize: value => Array.isArray(value) ? value.slice(-20) : [],
    },
    [],
  );
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
