import type { APIRecord, SSHRecord } from '../../../types';
import { loadProfiles } from '../../../utils/apiProfileService';
import type { EmbeddingConfig, EmbeddingProvider } from '../../rag';

const EMBEDDING_PROVIDERS: EmbeddingProvider[] = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'custom'];

const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  openai: 'text-embedding-3-small',
  gemini: 'gemini-embedding-001',
  zhipu: 'embedding-3',
  qwen: 'text-embedding-v3',
  ollama: 'nomic-embed-text',
  custom: 'text-embedding-3-small',
};

const inferEmbeddingProvider = (provider?: string, baseUrl?: string): EmbeddingProvider => {
  const p = (provider || '').toLowerCase();
  if (EMBEDDING_PROVIDERS.includes(p as EmbeddingProvider)) return p as EmbeddingProvider;
  const normalizedUrl = (baseUrl || '').toLowerCase();
  if (normalizedUrl.includes('generativelanguage.googleapis.com') || normalizedUrl.includes('googleapis.com')) return 'gemini';
  if (normalizedUrl.includes('dashscope') || normalizedUrl.includes('aliyuncs.com')) return 'qwen';
  if (normalizedUrl.includes('bigmodel.cn') || normalizedUrl.includes('zhipu')) return 'zhipu';
  if (normalizedUrl.includes('localhost:11434')) return 'ollama';
  return normalizedUrl ? 'custom' : 'openai';
};

export const getEmbeddingConfigFromProfiles = (): EmbeddingConfig | null => {
  try {
    const ragEmbeddingRaw = localStorage.getItem('guyue_rag_lab_embedding');
    if (ragEmbeddingRaw) {
      const saved = JSON.parse(ragEmbeddingRaw);
      if (saved?.provider && (saved.apiKey || saved.provider === 'ollama')) {
        const provider = inferEmbeddingProvider(saved.provider, saved.baseUrl);
        return {
          provider,
          apiKey: saved.apiKey || '',
          model: saved.model || DEFAULT_EMBEDDING_MODELS[provider],
          baseUrl: saved.baseUrl || undefined,
          dimensions: saved.dimensions,
        };
      }
    }
  } catch {}

  try {
    const profiles = loadProfiles();
    const profile = profiles.find(p => {
      const provider = inferEmbeddingProvider(p.provider, p.baseUrl);
      return EMBEDDING_PROVIDERS.includes(provider) && (p.apiKey || provider === 'ollama');
    });
    if (profile) {
      const provider = inferEmbeddingProvider(profile.provider, profile.baseUrl);
      return {
        provider,
        apiKey: profile.apiKey || '',
        model: DEFAULT_EMBEDDING_MODELS[provider],
        baseUrl: profile.baseUrl || undefined,
      };
    }
  } catch {}

  const apiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
  const baseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
  if (!apiKey && !baseUrl) return null;
  const provider = inferEmbeddingProvider(undefined, baseUrl);
  return {
    provider,
    apiKey,
    model: DEFAULT_EMBEDDING_MODELS[provider],
    ...(baseUrl ? { baseUrl } : {}),
  };
};

export const getEmbeddingKeyFromProfiles = (): { apiKey: string; baseUrl?: string } => {
  const config = getEmbeddingConfigFromProfiles();
  return { apiKey: config?.apiKey || '', baseUrl: config?.baseUrl };
};

export const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

export const textIncludes = (value: unknown, keyword: string) =>
  typeof value === 'string' && value.toLowerCase().includes(keyword.toLowerCase());

export const buildSshCommand = (record: Pick<SSHRecord, 'host' | 'username' | 'port'>) =>
  `ssh -p ${record.port || '22'} ${record.username || 'root'}@${record.host}`;

export const toSafeApiRecord = (record: APIRecord) => ({
  id: record.id,
  title: record.title,
  baseUrl: record.baseUrl,
  endpoint: record.endpoint,
  method: record.method,
  usage: record.usage,
  category: record.category,
  note: record.note,
  priority: record.priority,
  createdAt: record.createdAt,
  hasApiKey: Boolean(record.apiKey),
});
