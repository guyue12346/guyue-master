/**
 * Legacy RAG compatibility layer.
 *
 * ChatManager / AgentPanel 还在用这组旧 API，这里把它们统一桥接到 vectorService，
 * 保留旧调用方式，但底层索引、检索、持久化都走新的 collection-based 实现。
 */

import {
  buildIndex as buildVectorIndex,
  loadCollectionPayload,
  search as searchVectorIndex,
  getCollectionIndexStatus,
} from '../services/vectorService';

export interface EmbeddingConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface EmbeddingModelDef {
  id: string;
  name: string;
  provider: string;
  dimensions?: number;
  description?: string;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModelDef[]> = {
  gemini: [
    { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', provider: 'gemini', dimensions: 768, description: '稳定·推荐' },
    { id: 'gemini-embedding-2-preview', name: 'Gemini Embedding 2', provider: 'gemini', dimensions: 768, description: '多模态·预览' },
  ],
  qwen: [
    { id: 'text-embedding-v3', name: 'text-embedding-v3', provider: 'qwen', dimensions: 1024, description: '最新·推荐' },
    { id: 'text-embedding-v2', name: 'text-embedding-v2', provider: 'qwen', dimensions: 1536 },
    { id: 'text-embedding-v1', name: 'text-embedding-v1', provider: 'qwen', dimensions: 1536 },
  ],
  openai: [
    { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', dimensions: 1536, description: '性价比' },
    { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'openai', dimensions: 3072, description: '最强' },
    { id: 'text-embedding-ada-002', name: 'Ada 002', provider: 'openai', dimensions: 1536 },
  ],
  zhipu: [
    { id: 'embedding-3', name: 'Embedding-3', provider: 'zhipu', dimensions: 2048, description: '最新' },
    { id: 'embedding-2', name: 'Embedding-2', provider: 'zhipu', dimensions: 1024 },
  ],
  'custom-openai': [],
};

export const EMBEDDING_PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  qwen: '通义千问 (阿里云)',
  openai: 'OpenAI',
  zhipu: '智谱 GLM',
  'custom-openai': '自定义 (OpenAI 兼容)',
};

export interface RagIndexMeta {
  embeddingProvider: string;
  embeddingModel: string;
  builtAt: number;
  fileCount: number;
  chunkCount: number;
}

export interface RagChunk {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  indexedAt?: number;
}

export type RagIndex = RagChunk[];

export interface SearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  score: number;
}

const LEGACY_COLLECTION_ID = 'legacy-chat-kb';
const META_STORAGE_KEY = 'guyue_rag-index-meta';

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

function inferProvider(baseUrl?: string): { provider: string; model: string } {
  const normalized = (baseUrl || '').toLowerCase();
  if (normalized.includes('generativelanguage.googleapis.com') || normalized.includes('googleapis.com')) {
    return { provider: 'gemini', model: 'gemini-embedding-001' };
  }
  if (normalized.includes('dashscope') || normalized.includes('aliyuncs.com')) {
    return { provider: 'qwen', model: 'text-embedding-v3' };
  }
  if (normalized.includes('bigmodel.cn') || normalized.includes('zhipu')) {
    return { provider: 'zhipu', model: 'embedding-3' };
  }
  return { provider: 'openai', model: 'text-embedding-3-small' };
}

function normalizeEmbeddingConfig(embeddingConfig: EmbeddingConfig | string, baseUrl?: string): EmbeddingConfig {
  if (typeof embeddingConfig === 'object' && embeddingConfig !== null) {
    return embeddingConfig;
  }

  const { provider, model } = inferProvider(baseUrl);
  return {
    provider,
    model,
    apiKey: embeddingConfig,
    ...(baseUrl ? { baseUrl } : {}),
  };
}

function mapPayloadToLegacyIndex(payload: Awaited<ReturnType<typeof loadCollectionPayload>>): RagIndex {
  return (payload.vectorStore?.entries || []).map((entry: any, index: number) => ({
    fileId: entry.metadata?.fileId || entry.metadata?.filePath || entry.id,
    fileName: entry.metadata?.fileName || '未知文件',
    filePath: entry.metadata?.filePath || '',
    chunkIndex: entry.metadata?.chunkIndex ?? index,
    text: entry.text || '',
    embedding: Array.isArray(entry.embedding) ? entry.embedding : [],
    indexedAt: entry.metadata?.indexedAt,
  }));
}

export async function loadRagIndex(): Promise<RagIndex> {
  try {
    const payload = await loadCollectionPayload(LEGACY_COLLECTION_ID);
    return mapPayloadToLegacyIndex(payload);
  } catch {
    return [];
  }
}

export async function saveRagIndex(_index: RagIndex): Promise<void> {
  // 旧调用方还会显式调用 saveRagIndex，但新实现已经在 buildIndex 中自动持久化。
}

export async function loadRagIndexMeta(): Promise<RagIndexMeta | null> {
  const electronAPI = getElectronAPI();
  if (electronAPI?.loadAppData) {
    try {
      const data = await electronAPI.loadAppData('rag-index-meta');
      if (data && typeof data === 'object') return data as RagIndexMeta;
    } catch {
      // fall through
    }
  }
  try {
    const saved = localStorage.getItem(META_STORAGE_KEY);
    if (saved) return JSON.parse(saved) as RagIndexMeta;
  } catch {
    // ignore
  }
  return null;
}

export async function saveRagIndexMeta(meta: RagIndexMeta): Promise<void> {
  const electronAPI = getElectronAPI();
  if (electronAPI?.saveAppData) {
    await electronAPI.saveAppData('rag-index-meta', meta);
  }
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
}

export async function checkIndexStatus(
  kbFiles: Array<{ id: string; name: string; path: string }>,
  _existingIndex: RagIndex,
): Promise<{ newFiles: string[]; staleFiles: string[]; removedFiles: string[]; upToDate: boolean }> {
  return getCollectionIndexStatus(
    LEGACY_COLLECTION_ID,
    kbFiles.map(file => ({ name: file.name, path: file.path })),
  );
}

export async function removeFileFromIndex(_fileId: string): Promise<void> {
  // 旧入口已不再使用；文件删除改由重建/增量更新统一处理。
}

export async function invalidateFileIndex(fileId: string): Promise<void> {
  return removeFileFromIndex(fileId);
}

export async function buildIndex(
  kbFiles: Array<{ id: string; name: string; path: string }>,
  _existingIndex: RagIndex,
  embeddingConfig: EmbeddingConfig | string,
  onProgress?: (msg: string) => void,
  baseUrl?: string,
): Promise<RagIndex> {
  const normalizedConfig = normalizeEmbeddingConfig(embeddingConfig, baseUrl);
  const files = kbFiles.map(file => ({ id: file.id, name: file.name, path: file.path }));
  let lastStartedFileIndex = -1;

  onProgress?.(`正在索引：共 ${files.length} 个文件...`);
  await buildVectorIndex(
    LEGACY_COLLECTION_ID,
    files,
    normalizedConfig as any,
    undefined,
    {
      onProgress: (stage, done, total) => {
        if (stage === 'loading' && lastStartedFileIndex >= 0 && files[lastStartedFileIndex]) {
          onProgress?.(`✅ 已索引：${files[lastStartedFileIndex].name}`);
        }
        if (stage === 'loading' && files[done]) {
          lastStartedFileIndex = done;
          onProgress?.(`正在索引：${files[done].name}...`);
        }
      },
    },
  );

  const index = await loadRagIndex();
  if (lastStartedFileIndex >= 0 && files[lastStartedFileIndex]) {
    onProgress?.(`✅ 已索引：${files[lastStartedFileIndex].name}`);
  }
  onProgress?.(`✅ 索引完成：${kbFiles.length} 个文件，${index.length} 个文本块`);
  return index;
}

export async function searchIndex(
  query: string,
  _index: RagIndex,
  embeddingConfig: EmbeddingConfig | string,
  topK = 5,
  baseUrl?: string,
): Promise<SearchResult[]> {
  const normalizedConfig = normalizeEmbeddingConfig(embeddingConfig, baseUrl);
  const results = await searchVectorIndex(
    LEGACY_COLLECTION_ID,
    query,
    normalizedConfig as any,
    { topK },
  ).catch(() => []);

  return results.map(result => ({
    fileId: result.metadata?.fileId || result.filePath || result.nodeId,
    fileName: result.fileName,
    filePath: result.filePath,
    chunkIndex: result.metadata?.chunkIndex ?? 0,
    text: result.text,
    score: result.score,
  }));
}
