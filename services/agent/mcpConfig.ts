export type AgentMcpTransport = 'stdio' | 'http';

export interface AgentMcpServerConfig {
  id: string;
  name: string;
  category?: string;
  enabled: boolean;
  transport: AgentMcpTransport;
  framing?: 'jsonl' | 'headers';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  createdAt?: number;
  updatedAt?: number;
}

export const STORAGE_KEY_MCP_SERVERS = 'guyue_agent_mcp_servers_v1';
export const STORAGE_KEY_MCP_CATEGORIES = 'guyue_agent_mcp_categories_v1';
export const STORAGE_KEY_MCP_DEFAULTS_SEEDED = 'guyue_agent_mcp_defaults_seeded_v1';
export const MCP_REGISTRY_EVENT = 'guyue-agent-mcp-registry-changed';
const RESERVED_MCP_CATEGORY_NAMES = new Set(['全部', '默认', '未分类', '__all__']);
const DEFAULT_MCP_CATEGORY = '浏览器';
const DEFAULT_MCP_SERVERS: AgentMcpServerConfig[] = [
  {
    id: 'playwright',
    name: 'Playwright',
    category: DEFAULT_MCP_CATEGORY,
    enabled: true,
    transport: 'stdio',
    framing: 'jsonl',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
    env: {},
    headers: {},
    timeoutMs: 120_000,
    createdAt: 0,
    updatedAt: 0,
  },
];

const notifyMcpRegistryChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MCP_REGISTRY_EVENT));
  }
};

const safeId = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || `mcp-${Date.now()}`;

const safeParse = (value: string | null): AgentMcpServerConfig[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeParseStringArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const normalizeCategoryNames = (categories: string[]) =>
  Array.from(new Set(
    categories
      .map(category => category.trim())
      .filter(category => category && !RESERVED_MCP_CATEGORY_NAMES.has(category)),
  ));

const mergeDefaultMcpServers = (servers: AgentMcpServerConfig[]) => {
  const existingIds = new Set(servers.map(server => safeId(String(server.id))));
  const missingDefaults = DEFAULT_MCP_SERVERS.filter(server => !existingIds.has(server.id));
  return missingDefaults.length > 0 ? [...missingDefaults, ...servers] : servers;
};

const readMcpServerSource = (): AgentMcpServerConfig[] => {
  if (typeof localStorage === 'undefined') return DEFAULT_MCP_SERVERS;
  const raw = localStorage.getItem(STORAGE_KEY_MCP_SERVERS);
  if (raw === null) return DEFAULT_MCP_SERVERS;

  const parsed = safeParse(raw);
  if (localStorage.getItem(STORAGE_KEY_MCP_DEFAULTS_SEEDED) === 'true') {
    return parsed;
  }

  const merged = mergeDefaultMcpServers(parsed);
  localStorage.setItem(STORAGE_KEY_MCP_SERVERS, JSON.stringify(merged));
  localStorage.setItem(STORAGE_KEY_MCP_DEFAULTS_SEEDED, 'true');
  return merged;
};

export const loadMcpServers = (): AgentMcpServerConfig[] => {
  return readMcpServerSource()
    .filter(server => server && server.id && server.name)
    .map(server => ({
      ...server,
      id: safeId(server.id),
      category: typeof server.category === 'string' && server.category.trim() ? server.category.trim() : '',
      transport: server.transport || 'stdio',
      framing: server.framing || 'jsonl',
      enabled: server.enabled !== false,
      args: Array.isArray(server.args) ? server.args.map(String) : [],
      env: server.env && typeof server.env === 'object' ? server.env : {},
      headers: server.headers && typeof server.headers === 'object' ? server.headers : {},
      timeoutMs: Number.isFinite(Number(server.timeoutMs))
        ? (server.id === 'playwright' && Number(server.timeoutMs) <= 30_000 ? 120_000 : Number(server.timeoutMs))
        : (server.id === 'playwright' ? 120_000 : 30_000),
    }));
};

export const loadMcpCategories = (): string[] => {
  if (typeof localStorage === 'undefined') return [];
  const rawCategories = localStorage.getItem(STORAGE_KEY_MCP_CATEGORIES);
  const rawServers = localStorage.getItem(STORAGE_KEY_MCP_SERVERS);
  const stored = rawCategories === null && rawServers === null
    ? [DEFAULT_MCP_CATEGORY]
    : safeParseStringArray(rawCategories);
  const fromServers = readMcpServerSource()
    .map(server => typeof server.category === 'string' ? server.category : '')
    .filter(Boolean);
  return normalizeCategoryNames([...stored, ...fromServers]);
};

export const saveMcpCategories = (categories: string[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_MCP_CATEGORIES, JSON.stringify(normalizeCategoryNames(categories)));
  notifyMcpRegistryChanged();
};

export const upsertMcpCategory = (name: string) => {
  const category = name.trim();
  if (!category || RESERVED_MCP_CATEGORY_NAMES.has(category)) {
    throw new Error('MCP 分类名称无效。');
  }
  const categories = loadMcpCategories();
  if (!categories.includes(category)) {
    saveMcpCategories([...categories, category]);
  }
  return category;
};

export const saveMcpServers = (servers: AgentMcpServerConfig[]) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_MCP_SERVERS, JSON.stringify(servers));
  localStorage.setItem(STORAGE_KEY_MCP_DEFAULTS_SEEDED, 'true');
  notifyMcpRegistryChanged();
};

export const upsertMcpServer = (input: Partial<AgentMcpServerConfig> & { name: string }) => {
  const now = Date.now();
  const id = safeId(input.id || input.name);
  const servers = loadMcpServers();
  const next: AgentMcpServerConfig = {
    id,
    name: input.name.trim(),
    category: input.category?.trim() || loadMcpCategories()[0] || '',
    enabled: input.enabled !== false,
    transport: input.transport || 'stdio',
    framing: input.framing || 'jsonl',
    command: input.command?.trim(),
    args: Array.isArray(input.args) ? input.args.map(String) : [],
    env: input.env || {},
    url: input.url?.trim(),
    headers: input.headers || {},
    timeoutMs: input.timeoutMs || (id === 'playwright' ? 120_000 : 30_000),
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  const index = servers.findIndex(server => server.id === id);
  const updated = index >= 0
    ? servers.map(server => server.id === id ? { ...server, ...next, createdAt: server.createdAt || now } : server)
    : [next, ...servers];
  saveMcpServers(updated);
  return next;
};

export const deleteMcpServer = (id: string) => {
  const servers = loadMcpServers();
  const next = servers.filter(server => server.id !== id);
  saveMcpServers(next);
  return next.length !== servers.length;
};

export const findMcpServer = (serverIdOrName: string) => {
  const needle = serverIdOrName.trim().toLowerCase();
  return loadMcpServers().find(server =>
    server.id.toLowerCase() === needle ||
    server.name.toLowerCase() === needle,
  ) || null;
};
