/**
 * Vector Service — 向量库统一 API
 *
 * 将向量库的构建、索引、检索封装为一个整体对外提供简洁 API。
 * 调用者只需 输入 → 输出，无需关心 Pipeline/BM25/HNSW 等内部细节。
 */

import {
  LocalVectorStore,
  RagPipeline,
  KnowledgeGraph,
  loadDocument,
  chunkDocuments,
  enrichMetadata,
  optimizePreRetrieval,
  type EmbeddingConfig,
  type ChunkingStrategy,
  type ChunkingConfig,
  type RetrievalConfig,
  type RerankerConfig,
  type FileReader,
  type QueryEngineConfig,
  type FormatChunkingOverrides,
  type SupportedDocType,
  type PreRetrievalConfig,
} from './ragLlamaIndex';
import type { RetrievalResult } from './ragLlamaIndex/retrieval';
import { inferDocType, DEFAULT_CHUNKING_CONFIG } from './ragLlamaIndex/config';

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

export interface VectorBuildOptions {
  chunkingStrategy?: ChunkingStrategy;
  chunkingConfig?: Partial<ChunkingConfig>;
  formatOverrides?: FormatChunkingOverrides;
  useFormatAwareChunking?: boolean;
  onProgress?: (stage: string, done: number, total: number) => void;
}

export interface VectorSearchOptions {
  topK?: number;
  strategy?: RetrievalConfig['strategy'];
  alpha?: number;
  reranker?: RerankerConfig['type'];
  rerankerTopN?: number;
  /** If true, use the config saved in the collection JSON instead of caller-provided options */
  useCollectionConfig?: boolean;
  /** LLM function for pre-retrieval optimization (query rewriting, HyDE). Required if collection has preRetrieval config. */
  llmFn?: (prompt: string) => Promise<string>;
}

export interface BuildResult {
  collectionId: string;
  totalChunks: number;
  totalFiles: number;
  buildTimeMs: number;
}

export interface CollectionInfo {
  id: string;
  totalChunks: number;
  embeddingProvider: string;
  embeddingModel: string;
  files: Array<{ filePath: string; chunks: number }>;
  createdAt: number;
  updatedAt: number;
  searchAlgorithm: string;
  hasHnswIndex: boolean;
  hasKnowledgeGraph: boolean;
  chunkingStrategy: string | null;
  /** Saved config (retrieval, reranker, etc.) */
  config?: Record<string, any>;
}

export interface VectorSearchResult {
  text: string;
  score: number;
  filePath: string;
  fileName: string;
  metadata: Record<string, any>;
  nodeId: string;
}

export interface MultiSearchResult {
  collectionId: string;
  results: VectorSearchResult[];
}

export interface CollectionPayload {
  vectorStore: ReturnType<LocalVectorStore['serialize']>;
  config?: Record<string, any>;
  knowledgeGraph?: any;
  meta?: Record<string, any>;
}

// ════════════════════════════════════════════════════════════
// Internal Cache & Helpers
// ════════════════════════════════════════════════════════════

function getElectronAPI(): any {
  return (window as any).electronAPI;
}

async function getStoragePath(): Promise<string> {
  const api = getElectronAPI();
  if (!api?.getUserDataPath) throw new Error('Electron API 不可用');
  return `${await api.getUserDataPath()}/rag-indexes`;
}

async function ensureStorageDir(): Promise<string> {
  const dir = await getStoragePath();
  const api = getElectronAPI();
  try { await api.ensureDir(dir); } catch { /* already exists */ }
  return dir;
}

function createElectronFileReader(): FileReader {
  const api = getElectronAPI();
  const reader: FileReader = {
    async readTextFile(filePath: string): Promise<string> {
      const result = await api.readFile(filePath);
      if (typeof result === 'string') return result;
      if (result instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(result));
      }
      return new TextDecoder().decode(new Uint8Array(result));
    },
    async readPdfText(filePath: string): Promise<string> {
      try {
        const text = await api.extractPdfText(filePath);
        if (text) return text;
      } catch {
        // fall through to plain-text reader
      }
      return reader.readTextFile(filePath);
    },
    async getFileStats(filePath: string): Promise<{ size: number; mtime: number }> {
      const stats = await api.getFileStats(filePath);
      return stats ?? { size: 0, mtime: 0 };
    },
  };
  return reader;
}

// ════════════════════════════════════════════════════════════
// Vector Service — Public API
// ════════════════════════════════════════════════════════════

/**
 * 构建/更新向量索引
 *
 * @param collectionId 集合 ID
 * @param files 文件列表 [{ path, name, type? }]
 * @param embeddingConfig 嵌入模型配置
 * @param fileReader 文件读取接口 (Electron IPC)
 * @param options 可选配置
 */
export async function buildIndex(
  collectionId: string,
  files: Array<{ id?: string; path: string; name: string; type?: SupportedDocType }>,
  embeddingConfig: EmbeddingConfig,
  fileReader?: FileReader,
  options?: VectorBuildOptions,
): Promise<BuildResult> {
  const startTime = performance.now();
  const onProgress = options?.onProgress;
  const effectiveFileReader = fileReader ?? createElectronFileReader();

  // 加载已有 store 或创建新的
  let existingCollection: CachedCollection | undefined;
  try {
    existingCollection = await getCollection(collectionId);
  } catch {
    // new collection
  }
  let store = existingCollection?.store ?? new LocalVectorStore();

  const chunkingStrategy = options?.chunkingStrategy ?? DEFAULT_CHUNKING_CONFIG.strategy ?? 'sentence';
  const chunkingConfig: ChunkingConfig = {
    ...DEFAULT_CHUNKING_CONFIG,
    ...options?.chunkingConfig,
    strategy: chunkingStrategy,
  };

  let totalChunks = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.('loading', i, files.length);

    const docType = file.type ?? inferDocType(file.path);
    if (!docType) continue;

    // 加载文档
    const docs = await loadDocument(file.path, {
      fileReader: effectiveFileReader,
    });
    if (!docs.length) continue;
    if (file.id) {
      docs.forEach(doc => {
        doc.metadata = {
          ...doc.metadata,
          fileId: file.id,
        };
      });
    }

    // 删除旧的 chunks（增量更新）
    store.removeByFilePath(file.path);

    // 分块
    onProgress?.('chunking', i, files.length);
    const fullChunkingConfig: ChunkingConfig = {
      ...chunkingConfig,
      formatOverrides: options?.useFormatAwareChunking ? options?.formatOverrides : undefined,
    };
    const nodes = await chunkDocuments(docs, fullChunkingConfig);

    // 元数据丰富
    const enrichedNodes = enrichMetadata(nodes, embeddingConfig.model);

    // 嵌入并存入向量库
    onProgress?.('embedding', i, files.length);
    await store.addNodes(enrichedNodes, embeddingConfig, (done, total) => {
      onProgress?.('embedding', done, total);
    });

    totalChunks += enrichedNodes.length;
  }

  // 记录分块配置
  store.setChunkingConfig(chunkingStrategy, chunkingConfig);

  // 缓存 & 持久化
  collectionCache.set(collectionId, {
    store,
    config: existingCollection?.config,
    knowledgeGraph: existingCollection?.knowledgeGraph,
    meta: existingCollection?.meta,
  });
  await saveCollectionToDisk(collectionId, store);

  return {
    collectionId,
    totalChunks: store.size,
    totalFiles: files.length,
    buildTimeMs: Math.round(performance.now() - startTime),
  };
}

/**
 * 查询单个向量库集合
 */
export async function search(
  collectionId: string,
  query: string,
  embeddingConfig: EmbeddingConfig,
  options?: VectorSearchOptions,
): Promise<VectorSearchResult[]> {
  const collection = await getCollection(collectionId);
  const store = collection.store;

  const qCfg = buildQueryConfig(embeddingConfig, options, collection.config);
  const pipeline = new RagPipeline(qCfg);
  pipeline.setVectorStore(store);
  if (collection.knowledgeGraph) {
    pipeline.setKnowledgeGraph(hydrateKnowledgeGraph(collection.knowledgeGraph));
  }

  // 确保 BM25 构建（hybrid/bm25 需要）
  const strategy = options?.useCollectionConfig && collection.config?.retrieval?.strategy
    ? collection.config.retrieval.strategy
    : (options?.strategy ?? 'hybrid');
  if (strategy === 'hybrid' || strategy === 'bm25') {
    pipeline.buildBM25();
  }

  // Wire LLM function for LLM reranker and pre-retrieval optimization
  if (options?.llmFn) {
    const rerankerType = options?.useCollectionConfig
      ? collection.config?.reranker?.type
      : (options?.reranker ?? 'none');
    if (rerankerType === 'llm') {
      pipeline.setLLMFunction(options.llmFn);
    }
  }

  // 检索前优化（查询改写 / HyDE）
  let optimizedQuery = query;
  let hydeEmbedding: number[] | undefined;
  const preRetCfg: PreRetrievalConfig | undefined = options?.useCollectionConfig
    ? collection.config?.preRetrieval
    : undefined;

  if (preRetCfg && preRetCfg.strategy !== 'none' && options?.llmFn) {
    try {
      const preResult = await optimizePreRetrieval(
        query, preRetCfg, options.llmFn,
        preRetCfg.strategy === 'hyde' ? embeddingConfig : undefined,
      );
      optimizedQuery = preResult.optimizedQuery;
      hydeEmbedding = preResult.hydeEmbedding;
    } catch (err: any) {
      console.warn('VectorService pre-retrieval optimization failed:', err?.message);
      // Fall back to original query
    }
  }

  const result = await pipeline.query(optimizedQuery, hydeEmbedding);
  return normalizeResults(result.results);
}

/** Extended search result with debug metadata */
export interface SearchWithMetaResult {
  results: VectorSearchResult[];
  meta: {
    originalQuery: string;
    optimizedQuery: string;
    preRetrievalStrategy: string;
    preRetrievalLog: string[];
    retrievalStrategy: string;
    rerankerType: string;
    retrievalTimeMs: number;
    rerankTimeMs: number;
    totalTimeMs: number;
    topK: number;
    collectionConfig?: any;
  };
}

/**
 * 查询单个集合，返回结果 + 调试元数据
 */
export async function searchWithMeta(
  collectionId: string,
  query: string,
  embeddingConfig: EmbeddingConfig,
  options?: VectorSearchOptions,
): Promise<SearchWithMetaResult> {
  const collection = await getCollection(collectionId);
  const store = collection.store;

  const qCfg = buildQueryConfig(embeddingConfig, options, collection.config);
  const pipeline = new RagPipeline(qCfg);
  pipeline.setVectorStore(store);
  if (collection.knowledgeGraph) {
    pipeline.setKnowledgeGraph(hydrateKnowledgeGraph(collection.knowledgeGraph));
  }

  const strategy = options?.useCollectionConfig && collection.config?.retrieval?.strategy
    ? collection.config.retrieval.strategy
    : (options?.strategy ?? 'hybrid');
  if (strategy === 'hybrid' || strategy === 'bm25') {
    pipeline.buildBM25();
  }

  // Wire LLM for reranker
  if (options?.llmFn) {
    const rerankerType = options?.useCollectionConfig
      ? collection.config?.reranker?.type
      : (options?.reranker ?? 'none');
    if (rerankerType === 'llm') {
      pipeline.setLLMFunction(options.llmFn);
    }
  }

  // Pre-retrieval optimization
  let optimizedQuery = query;
  let hydeEmbedding: number[] | undefined;
  const preRetCfg = options?.useCollectionConfig ? collection.config?.preRetrieval : undefined;
  const preRetrievalLog: string[] = [];
  let preRetrievalStrategy = 'none';

  if (preRetCfg && preRetCfg.strategy !== 'none' && options?.llmFn) {
    preRetrievalStrategy = preRetCfg.strategy;
    try {
      const preResult = await optimizePreRetrieval(
        query, preRetCfg, options.llmFn,
        preRetCfg.strategy === 'hyde' ? embeddingConfig : undefined,
      );
      optimizedQuery = preResult.optimizedQuery;
      hydeEmbedding = preResult.hydeEmbedding;
      if (preResult.log) preRetrievalLog.push(...preResult.log);
      else preRetrievalLog.push(`✅ ${preRetCfg.strategy}: "${query}" → "${optimizedQuery}"`);
    } catch (err: any) {
      preRetrievalLog.push(`❌ 检索前优化失败: ${err?.message}`);
    }
  }

  const startTime = performance.now();
  const result = await pipeline.query(optimizedQuery, hydeEmbedding);
  const totalMs = performance.now() - startTime;

  const rerankerType = options?.useCollectionConfig
    ? (collection.config?.reranker?.type ?? 'none')
    : (options?.reranker ?? 'none');

  return {
    results: normalizeResults(result.results),
    meta: {
      originalQuery: query,
      optimizedQuery,
      preRetrievalStrategy,
      preRetrievalLog,
      retrievalStrategy: strategy,
      rerankerType,
      retrievalTimeMs: result.metadata?.retrievalTimeMs ?? 0,
      rerankTimeMs: result.metadata?.rerankTimeMs ?? 0,
      totalTimeMs: totalMs,
      topK: qCfg.retrieval.topK,
      collectionConfig: options?.useCollectionConfig ? collection.config : undefined,
    },
  };
}
export async function searchMultiple(
  collectionIds: string[],
  query: string,
  embeddingConfig: EmbeddingConfig,
  options?: VectorSearchOptions,
): Promise<{ results: VectorSearchResult[]; perCollection: MultiSearchResult[]; errors: string[] }> {
  const allResults: VectorSearchResult[] = [];
  const perCollection: MultiSearchResult[] = [];
  const errors: string[] = [];

  for (const colId of collectionIds) {
    try {
      const results = await search(colId, query, embeddingConfig, options);
      allResults.push(...results);
      perCollection.push({ collectionId: colId, results });
    } catch (e: any) {
      errors.push(`${colId}: ${e?.message || '未知错误'}`);
    }
  }

  // 按分数排序，取 topK
  const topK = options?.topK ?? 5;
  allResults.sort((a, b) => b.score - a.score);

  return {
    results: allResults.slice(0, topK),
    perCollection,
    errors,
  };
}

/**
 * 加载集合信息
 */
export async function loadCollection(collectionId: string): Promise<CollectionInfo> {
  const collection = await getCollection(collectionId);
  return storeToInfo(collectionId, collection.store, collection.config);
}

/**
 * 删除集合
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  collectionCache.delete(collectionId);
  try {
    const dir = await getStoragePath();
    const api = getElectronAPI();
    await api.deleteFile(`${dir}/${collectionId}.json`);
  } catch { /* ignore */ }
}

/**
 * 获取集合统计信息（从缓存，不读磁盘）
 */
export function getCollectionStats(collectionId: string): CollectionInfo | null {
  const cached = collectionCache.get(collectionId);
  if (!cached) return null;
  return storeToInfo(collectionId, cached.store, cached.config);
}

/**
 * 检查文件是否已索引
 */
export async function isFileIndexed(collectionId: string, filePath: string): Promise<boolean> {
  try {
    const store = await getStore(collectionId);
    return store.isFileIndexed(filePath);
  } catch {
    return false;
  }
}

/**
 * 从集合中移除指定文件的索引
 */
export async function removeFile(collectionId: string, filePath: string): Promise<number> {
  const store = await getStore(collectionId);
  const removed = store.removeByFilePath(filePath);
  if (removed > 0) {
    await saveCollectionToDisk(collectionId, store);
  }
  return removed;
}

/**
 * 列出所有已保存的集合
 */
export async function listCollections(): Promise<string[]> {
  try {
    const dir = await getStoragePath();
    const api = getElectronAPI();
    const files = await api.listDir(dir);
    return files
      .map((entry: any) => typeof entry === 'string' ? entry : entry?.name)
      .filter((name: string | undefined) => typeof name === 'string' && name.endsWith('.json'))
      .map((name: string) => name.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * 清空集合缓存（释放内存）
 */
export function clearCache(): void {
  collectionCache.clear();
}

/**
 * 获取原始 LocalVectorStore（高级用法，直接操作底层）
 */
export async function getRawStore(collectionId: string): Promise<LocalVectorStore> {
  return getStore(collectionId);
}

export async function loadCollectionPayload(collectionId: string): Promise<CollectionPayload> {
  return readCollectionPayloadFromDisk(collectionId);
}

export async function saveCollectionPayload(collectionId: string, payload: CollectionPayload): Promise<void> {
  const normalized: CollectionPayload = {
    vectorStore: payload.vectorStore,
    ...(payload.config !== undefined ? { config: payload.config } : {}),
    ...(payload.knowledgeGraph !== undefined ? { knowledgeGraph: payload.knowledgeGraph } : {}),
    ...(payload.meta !== undefined ? { meta: payload.meta } : {}),
  };
  await writeCollectionPayloadToDisk(collectionId, normalized);
  collectionCache.set(collectionId, {
    store: LocalVectorStore.deserialize(normalized.vectorStore),
    config: normalized.config,
    knowledgeGraph: normalized.knowledgeGraph,
    meta: normalized.meta,
  });
}

export async function saveCollectionConfig(collectionId: string, config?: Record<string, any>): Promise<void> {
  const payload = await readCollectionPayloadFromDisk(collectionId);
  await saveCollectionPayload(collectionId, {
    ...payload,
    ...(config !== undefined ? { config } : {}),
  });
}

export async function saveCollectionKnowledgeGraph(collectionId: string, knowledgeGraph?: any): Promise<void> {
  const payload = await readCollectionPayloadFromDisk(collectionId);
  await saveCollectionPayload(collectionId, {
    ...payload,
    ...(knowledgeGraph !== undefined ? { knowledgeGraph } : {}),
  });
}

export async function saveCollectionVectorStore(
  collectionId: string,
  store: LocalVectorStore,
  extras?: { config?: Record<string, any>; knowledgeGraph?: any; meta?: Record<string, any> },
): Promise<void> {
  const existing = await getCollection(collectionId).catch(() => undefined);
  await saveCollectionPayload(collectionId, {
    vectorStore: store.serialize(),
    ...(extras?.config !== undefined ? { config: extras.config } : existing?.config !== undefined ? { config: existing.config } : {}),
    ...(extras?.knowledgeGraph !== undefined ? { knowledgeGraph: extras.knowledgeGraph } : existing?.knowledgeGraph !== undefined ? { knowledgeGraph: existing.knowledgeGraph } : {}),
    ...(extras?.meta !== undefined ? { meta: extras.meta } : existing?.meta !== undefined ? { meta: existing.meta } : {}),
  });
}

export async function getCollectionIndexStatus(
  collectionId: string,
  files: Array<{ name: string; path: string }>,
): Promise<{ newFiles: string[]; staleFiles: string[]; removedFiles: string[]; upToDate: boolean }> {
  let store: LocalVectorStore | null = null;
  try {
    store = await getStore(collectionId);
  } catch {
    store = null;
  }

  const indexedFiles = store?.getIndexedFiles() ?? [];
  const indexedByPath = new Map(indexedFiles.map(file => [file.filePath, file]));
  const currentPaths = new Set(files.map(file => file.path));
  const api = getElectronAPI();

  const newFiles: string[] = [];
  const staleFiles: string[] = [];
  const removedFiles: string[] = [];

  for (const file of files) {
    const indexed = indexedByPath.get(file.path);
    if (!indexed) {
      newFiles.push(file.name);
      continue;
    }

    const indexedAt = indexed.indexedAt || 0;
    if (!indexedAt) continue;

    try {
      const mtime = api.getFileStats
        ? (await api.getFileStats(file.path))?.mtime
        : await api.getFileMtime?.(file.path);
      if (mtime && mtime > indexedAt) {
        staleFiles.push(file.name);
      }
    } catch {
      // ignore stat failures
    }
  }

  for (const indexed of indexedFiles) {
    if (!currentPaths.has(indexed.filePath)) {
      removedFiles.push(indexed.fileName);
    }
  }

  return {
    newFiles,
    staleFiles,
    removedFiles,
    upToDate: newFiles.length === 0 && staleFiles.length === 0 && removedFiles.length === 0,
  };
}

// ════════════════════════════════════════════════════════════
// Internal Helpers
// ════════════════════════════════════════════════════════════

/** Cached collection data: store + optional saved config */
interface CachedCollection {
  store: LocalVectorStore;
  config?: any;
  knowledgeGraph?: any;
  meta?: any;
}

const collectionCache = new Map<string, CachedCollection>();

async function getCollection(collectionId: string): Promise<CachedCollection> {
  const cached = collectionCache.get(collectionId);
  if (cached) return cached;
  const collection = await loadFullCollectionFromDisk(collectionId);
  collectionCache.set(collectionId, collection);
  return collection;
}

async function getStore(collectionId: string): Promise<LocalVectorStore> {
  return (await getCollection(collectionId)).store;
}

async function loadFullCollectionFromDisk(collectionId: string): Promise<CachedCollection> {
  const data = await readCollectionPayloadFromDisk(collectionId);
  return {
    store: LocalVectorStore.deserialize(data.vectorStore),
    config: data.config || undefined,
    knowledgeGraph: data.knowledgeGraph || undefined,
    meta: data.meta || undefined,
  };
}

async function saveCollectionToDisk(collectionId: string, store: LocalVectorStore): Promise<void> {
  const existing = collectionCache.get(collectionId);
  const payload: CollectionPayload = { vectorStore: store.serialize() };
  if (existing?.config) payload.config = existing.config;
  if (existing?.knowledgeGraph) payload.knowledgeGraph = existing.knowledgeGraph;
  if (existing?.meta) payload.meta = existing.meta;
  await writeCollectionPayloadToDisk(collectionId, payload);
}

async function readCollectionPayloadFromDisk(collectionId: string): Promise<CollectionPayload> {
  const dir = await getStoragePath();
  const api = getElectronAPI();
  const raw = await api.readFile(`${dir}/${collectionId}.json`);
  if (!raw) throw new Error(`向量库集合 "${collectionId}" 不存在`);
  const data = JSON.parse(raw);
  if (data.vectorStore) return data;
  return { vectorStore: data };
}

async function writeCollectionPayloadToDisk(collectionId: string, payload: CollectionPayload): Promise<void> {
  const dir = await ensureStorageDir();
  const api = getElectronAPI();
  await api.writeFile(`${dir}/${collectionId}.json`, JSON.stringify(payload));
}

function hydrateKnowledgeGraph(serializedGraph: any): KnowledgeGraph {
  return KnowledgeGraph.deserialize(
    typeof serializedGraph === 'string' ? JSON.parse(serializedGraph) : serializedGraph,
  );
}

function buildQueryConfig(
  embeddingConfig: EmbeddingConfig,
  options?: VectorSearchOptions,
  savedConfig?: any,
): QueryEngineConfig {
  // If useCollectionConfig and we have saved config, use it
  if (options?.useCollectionConfig && savedConfig) {
    const ret = savedConfig.retrieval || {};
    const rer = savedConfig.reranker || {};
    const topK = options?.topK ?? ret.topK ?? 5;
    const strategy = ret.strategy ?? 'hybrid';
    return {
      retrieval: {
        strategy,
        topK: strategy === 'hybrid' ? topK * 4 : topK * 2,
        alpha: ret.alpha ?? 0.7,
        fusionMethod: ret.fusionMethod ?? 'rrf',
        rrfK: ret.rrfK ?? 60,
        bm25K1: ret.bm25K1 ?? 1.2,
        bm25B: ret.bm25B ?? 0.75,
        includeKnowledgeGraph: ret.includeKnowledgeGraph ?? false,
        kgMaxTriples: ret.kgMaxTriples ?? 5,
      },
      reranker: {
        type: rer.type ?? 'none',
        topN: rer.topN ?? topK,
        mmrLambda: rer.mmrLambda ?? 0.7,
      },
      embeddingConfig,
    };
  }

  // Fallback: use caller-provided options or defaults
  const topK = options?.topK ?? 5;
  const strategy = options?.strategy ?? 'hybrid';

  return {
    retrieval: {
      strategy,
      topK: strategy === 'hybrid' ? topK * 4 : topK * 2,
      alpha: options?.alpha ?? 0.7,
      fusionMethod: 'rrf',
      rrfK: 60,
      bm25K1: 1.2,
      bm25B: 0.75,
      includeKnowledgeGraph: false,
      kgMaxTriples: 5,
    },
    reranker: {
      type: options?.reranker ?? 'none',
      topN: options?.rerankerTopN ?? topK,
      mmrLambda: 0.7,
    },
    embeddingConfig,
  };
}

function normalizeResults(results: RetrievalResult[]): VectorSearchResult[] {
  return results.map(r => ({
    text: r.text,
    score: r.score,
    filePath: r.metadata?.filePath ?? '',
    fileName: r.metadata?.fileName ?? '',
    metadata: r.metadata ?? {},
    nodeId: r.nodeId,
  }));
}

function storeToInfo(collectionId: string, store: LocalVectorStore, config?: any): CollectionInfo {
  const stats = store.getStats();
  const filesMap = stats.files;
  const files: Array<{ filePath: string; chunks: number }> = [];
  if (filesMap instanceof Map) {
    filesMap.forEach((chunks, filePath) => files.push({ filePath, chunks }));
  }
  return {
    id: collectionId,
    totalChunks: stats.totalEntries,
    embeddingProvider: stats.embeddingProvider,
    embeddingModel: stats.embeddingModel,
    files,
    createdAt: stats.createdAt,
    updatedAt: stats.updatedAt,
    searchAlgorithm: store.searchAlgorithm,
    hasHnswIndex: store.hasHnswIndex,
    hasKnowledgeGraph: store.hasKnowledgeGraph,
    chunkingStrategy: store.chunkingStrategy,
    config,
  };
}
