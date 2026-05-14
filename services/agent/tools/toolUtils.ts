import type { APIRecord, SSHRecord } from '../../../types';
import { loadProfiles } from '../../../utils/apiProfileService';

export const getEmbeddingKeyFromProfiles = (): { apiKey: string; baseUrl?: string } => {
  try {
    const profiles = loadProfiles();
    const embProviders = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'cohere', 'voyage', 'jina'];
    const profile = profiles.find(p => embProviders.includes(p.provider) && p.apiKey);
    if (profile) return { apiKey: profile.apiKey, baseUrl: profile.baseUrl || undefined };
  } catch {}
  const apiKey = localStorage.getItem('guyue_rag_embedding_key') || '';
  const baseUrl = localStorage.getItem('guyue_rag_embedding_base_url')?.trim() || undefined;
  return { apiKey, baseUrl };
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
