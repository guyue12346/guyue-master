/**
 * API Profile Service — 统一 API 密钥管理
 *
 * 所有模块共享同一份 API 配置，不再分散存储。
 * 提供 CRUD 操作 + 旧数据迁移。
 */

import type { ApiProfile, ApiProviderType } from '../types';

// ── 存储 Key ──
const STORAGE_KEY = 'guyue_api_profiles_v1';
const MIGRATED_FLAG = 'guyue_api_profiles_migrated';

// ── Provider 显示信息 ──
export const API_PROVIDER_LABELS: Record<ApiProviderType, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  zhipu: '智谱 AI',
  qwen: '通义千问',
  moonshot: 'Moonshot (Kimi)',
  minimax: 'MiniMax',
  ollama: 'Ollama (本地)',
  zenmux: 'Zenmux',
  custom: '自定义',
};

export const API_PROVIDER_BASE_URLS: Partial<Record<ApiProviderType, string>> = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  zhipu: 'https://open.bigmodel.cn',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
  moonshot: 'https://api.moonshot.cn',
  minimax: 'https://api.minimax.chat',
  ollama: 'http://localhost:11434',
};

// ── CRUD ──

export function loadProfiles(): ApiProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: ApiProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function addProfile(profile: Omit<ApiProfile, 'id' | 'createdAt' | 'updatedAt'>): ApiProfile {
  const profiles = loadProfiles();
  const now = Date.now();
  const newProfile: ApiProfile = {
    ...profile,
    id: `ap_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  profiles.push(newProfile);
  saveProfiles(profiles);
  return newProfile;
}

export function updateProfile(id: string, updates: Partial<Pick<ApiProfile, 'name' | 'provider' | 'apiKey' | 'baseUrl'>>): ApiProfile | null {
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) return null;
  profiles[idx] = { ...profiles[idx], ...updates, updatedAt: Date.now() };
  saveProfiles(profiles);
  return profiles[idx];
}

export function deleteProfile(id: string): boolean {
  const profiles = loadProfiles();
  const filtered = profiles.filter(p => p.id !== id);
  if (filtered.length === profiles.length) return false;
  saveProfiles(filtered);
  return true;
}

export function getProfileById(id: string): ApiProfile | undefined {
  return loadProfiles().find(p => p.id === id);
}

export function getProfilesByProvider(provider: ApiProviderType): ApiProfile[] {
  return loadProfiles().filter(p => p.provider === provider);
}

// ── 迁移旧数据 ──

/**
 * 将分散在各模块中的 API Key 迁移到统一 profiles。
 * 只会执行一次（通过 MIGRATED_FLAG 标记）。
 */
export function migrateOldApiKeys(): void {
  if (localStorage.getItem(MIGRATED_FLAG)) return;

  const existing = loadProfiles();
  const existingKeys = new Set(existing.map(p => `${p.provider}:${p.apiKey}`));
  const toAdd: Array<Omit<ApiProfile, 'id' | 'createdAt' | 'updatedAt'>> = [];

  const maybeAdd = (name: string, provider: ApiProviderType, apiKey: string, baseUrl?: string) => {
    if (!apiKey || existingKeys.has(`${provider}:${apiKey}`)) return;
    existingKeys.add(`${provider}:${apiKey}`);
    toAdd.push({ name, provider, apiKey, baseUrl });
  };

  // 1. ChatManager: Chat API profiles
  tryMigrate('guyue_chat_api_profiles_v1', (arr: any[]) => {
    arr.forEach(c => maybeAdd(c.label || `Chat ${c.provider}`, mapProvider(c.provider), c.apiKey, c.baseUrl));
  });

  // 2. ChatManager: KB API profiles
  tryMigrate('guyue_kb_api_profiles_v1', (arr: any[]) => {
    arr.forEach(c => maybeAdd(c.label || `KB ${c.provider}`, mapProvider(c.provider), c.apiKey, c.baseUrl));
  });

  // 3. ChatManager: KB embedding profiles
  tryMigrate('guyue_kb_emb_profiles_v1', (arr: any[]) => {
    arr.forEach(c => maybeAdd(c.label || `Embedding ${c.provider}`, mapEmbeddingProvider(c.provider), c.apiKey, c.baseUrl));
  });

  // 4. ChatManager: KB chat profiles
  tryMigrate('guyue_kb_chat_profiles_v1', (arr: any[]) => {
    arr.forEach(c => maybeAdd(c.label || `KB Chat ${c.provider}`, mapProvider(c.provider), c.apiKey, c.baseUrl));
  });

  // 5. Agent API profiles
  tryMigrate('guyue_agent_api_profiles_v1', (arr: any[]) => {
    arr.forEach(c => maybeAdd(c.label || `Agent ${c.provider}`, mapProvider(c.provider), c.apiKey, c.baseUrl));
  });

  // 6. Agent config (single object)
  tryMigrate('guyue_agent_config', (obj: any) => {
    if (obj.apiKey) maybeAdd(`Agent ${obj.provider || 'custom'}`, mapProvider(obj.provider), obj.apiKey, obj.baseUrl);
  });

  // 7. RAG Lab embedding config
  tryMigrate('guyue_rag_lab_embedding', (obj: any) => {
    if (obj.apiKey) maybeAdd(`RAG ${obj.provider || 'openai'}`, mapEmbeddingProvider(obj.provider), obj.apiKey, obj.baseUrl);
  });

  // 8. Shared embedding key
  const embKey = localStorage.getItem('guyue_rag_embedding_key');
  const embUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim();
  if (embKey) maybeAdd('Embedding (shared)', 'gemini', embKey, embUrl || undefined);

  // 9. Kimi panel
  const kimiKey = localStorage.getItem('kimi_panel_api_key');
  if (kimiKey) maybeAdd('Kimi API', 'moonshot', kimiKey);

  // 10. Music AI config
  tryMigrate('guyue_music_ai_config', (obj: any) => {
    if (obj.apiKey) maybeAdd(`Music AI ${obj.provider || 'gemini'}`, mapProvider(obj.provider), obj.apiKey, obj.baseUrl);
  });

  // 11. Legacy single configs
  tryMigrate('guyue_kb_embedding_config_v1', (obj: any) => {
    if (obj.apiKey) maybeAdd(`KB Embedding (legacy)`, mapEmbeddingProvider(obj.provider), obj.apiKey, obj.baseUrl);
  });
  tryMigrate('guyue_kb_chat_config_v1', (obj: any) => {
    if (obj.apiKey) maybeAdd(`KB Chat (legacy)`, mapProvider(obj.provider), obj.apiKey, obj.baseUrl);
  });

  // 批量添加
  if (toAdd.length > 0) {
    const now = Date.now();
    const newProfiles = toAdd.map((p, i) => ({
      ...p,
      id: `ap_mig_${now}_${i}`,
      createdAt: now,
      updatedAt: now,
    }));
    saveProfiles([...existing, ...newProfiles]);
  }

  localStorage.setItem(MIGRATED_FLAG, '1');
}

// ── 内部辅助 ──

function tryMigrate(key: string, handler: (data: any) => void): void {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      handler(data);
    } else if (data && typeof data === 'object') {
      handler(data);
    }
  } catch { /* skip */ }
}

/** 将各模块不统一的 provider 字符串映射到 ApiProviderType */
function mapProvider(raw: string | undefined): ApiProviderType {
  if (!raw) return 'custom';
  const map: Record<string, ApiProviderType> = {
    zenmux: 'zenmux', gemini: 'gemini', openai: 'openai',
    anthropic: 'anthropic', ollama: 'ollama', custom: 'custom',
    deepseek: 'deepseek', zhipu: 'zhipu', moonshot: 'moonshot', minimax: 'minimax',
  };
  return map[raw.toLowerCase()] ?? 'custom';
}

/** Embedding provider 映射（EmbeddingProvider → ApiProviderType） */
function mapEmbeddingProvider(raw: string | undefined): ApiProviderType {
  if (!raw) return 'openai';
  const map: Record<string, ApiProviderType> = {
    openai: 'openai', gemini: 'gemini', zhipu: 'zhipu',
    qwen: 'qwen', ollama: 'ollama', custom: 'custom',
  };
  return map[raw.toLowerCase()] ?? 'custom';
}
