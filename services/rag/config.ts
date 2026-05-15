import type {
  ChunkingConfig,
  EmbeddingConfig,
  FormatChunkingOverrides,
  HnswConfig,
  PreRetrievalConfig,
  RerankerConfig,
  RetrievalConfig,
  SearchAlgorithm,
} from '../ragLlamaIndex';
import type { QueryModeConfig } from '../ragLlamaIndex/queryModes';

export const RAG_COLLECTION_CONFIG_VERSION = 2;
export const DEFAULT_RAG_QUERY_PROFILE_ID = 'default';

export interface RagBuildConfig {
  embedding: EmbeddingConfig;
  chunking: ChunkingConfig;
  formatOverrides?: FormatChunkingOverrides;
  formatTypeEnabled?: Record<string, boolean>;
}

export interface RagIndexConfig {
  searchAlgorithm: SearchAlgorithm;
  hnsw: HnswConfig;
}

export interface RagQueryConfig {
  retrieval: RetrievalConfig;
  reranker: RerankerConfig;
  queryMode: QueryModeConfig;
  preRetrieval: PreRetrievalConfig;
}

export interface RagQueryProfile extends RagQueryConfig {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RagGenerationConfig {
  modelProfileId?: string;
  systemPrompt?: string;
  answerStyle?: 'concise' | 'normal' | 'detailed';
  includeSources?: boolean;
}

export interface RagCollectionRuntimeConfig {
  schemaVersion: number;
  build: RagBuildConfig;
  index: RagIndexConfig;
  queryProfiles: RagQueryProfile[];
  defaultQueryProfileId: string;
  generation: RagGenerationConfig;
}

export interface RagConfigFallbacks {
  embedding?: EmbeddingConfig;
  chunking?: ChunkingConfig;
  retrieval?: RetrievalConfig;
  reranker?: RerankerConfig;
  queryMode?: QueryModeConfig;
  preRetrieval?: PreRetrievalConfig;
  searchAlgorithm?: SearchAlgorithm;
  hnsw?: HnswConfig;
  formatOverrides?: FormatChunkingOverrides;
  formatTypeEnabled?: Record<string, boolean>;
}

export interface RagQueryOverrides {
  retrieval?: Partial<RetrievalConfig>;
  reranker?: Partial<RerankerConfig>;
  queryMode?: Partial<QueryModeConfig>;
  preRetrieval?: Partial<PreRetrievalConfig>;
}

const DEFAULT_EMBEDDING: EmbeddingConfig = {
  provider: 'openai',
  apiKey: '',
  model: 'text-embedding-3-small',
};

const DEFAULT_CHUNKING: ChunkingConfig = {
  strategy: 'sentence',
  chunkSize: 512,
  chunkOverlap: 50,
  windowSize: 3,
  bufferSize: 1,
  breakpointPercentile: 95,
};

const DEFAULT_RETRIEVAL: RetrievalConfig = {
  strategy: 'hybrid',
  topK: 20,
  alpha: 0.7,
  fusionMethod: 'rrf',
  rrfK: 60,
};

const DEFAULT_RERANKER: RerankerConfig = {
  type: 'none',
  topN: 5,
  mmrLambda: 0.7,
};

const DEFAULT_QUERY_MODE: QueryModeConfig = {
  mode: 'single',
  subQuestion: {
    maxSubQuestions: 3,
    mergeStrategy: 'deduplicate',
    deduplicateThreshold: 0.9,
  },
  iterative: {
    maxIterations: 3,
    qualityThreshold: 0.7,
    refinementStrategy: 'rephrase',
  },
};

const DEFAULT_PRE_RETRIEVAL: PreRetrievalConfig = {
  strategy: 'none',
  expansion: { maxTerms: 5, includeOriginal: true },
  rewrite: { style: 'precise' },
  hyde: { responseLength: 'medium', numHypothetical: 1 },
};

const DEFAULT_HNSW: HnswConfig = {
  m: 16,
  efConstruction: 200,
  efSearch: 50,
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function sanitizeRetrievalConfig(input?: Partial<RetrievalConfig>): RetrievalConfig {
  const merged = {
    ...DEFAULT_RETRIEVAL,
    ...(input || {}),
  } as RetrievalConfig;
  delete (merged as any).includeKnowledgeGraph;
  delete (merged as any).kgMaxTriples;
  return merged;
}

export function getDefaultRagConfigFallbacks(fallbacks?: RagConfigFallbacks): Required<RagConfigFallbacks> {
  return {
    embedding: clone(fallbacks?.embedding || DEFAULT_EMBEDDING),
    chunking: clone(fallbacks?.chunking || DEFAULT_CHUNKING),
    retrieval: sanitizeRetrievalConfig(fallbacks?.retrieval || DEFAULT_RETRIEVAL),
    reranker: clone(fallbacks?.reranker || DEFAULT_RERANKER),
    queryMode: clone(fallbacks?.queryMode || DEFAULT_QUERY_MODE),
    preRetrieval: clone(fallbacks?.preRetrieval || DEFAULT_PRE_RETRIEVAL),
    searchAlgorithm: fallbacks?.searchAlgorithm || 'brute-force',
    hnsw: clone(fallbacks?.hnsw || DEFAULT_HNSW),
    formatOverrides: clone(fallbacks?.formatOverrides || {}),
    formatTypeEnabled: clone(fallbacks?.formatTypeEnabled || { markdown: true, pdf: true, html: true, code: true }),
  };
}

export function createRagQueryProfile(
  input: Partial<RagQueryProfile> & Partial<RagQueryConfig>,
  fallbacks?: RagConfigFallbacks,
): RagQueryProfile {
  const defaults = getDefaultRagConfigFallbacks(fallbacks);
  const now = Date.now();
  return {
    id: input.id || DEFAULT_RAG_QUERY_PROFILE_ID,
    name: input.name || '默认查询',
    description: input.description,
    createdAt: Number(input.createdAt) || now,
    updatedAt: Number(input.updatedAt) || now,
    retrieval: sanitizeRetrievalConfig(input.retrieval || defaults.retrieval),
    reranker: clone(input.reranker || defaults.reranker),
    queryMode: clone(input.queryMode || defaults.queryMode),
    preRetrieval: clone(input.preRetrieval || defaults.preRetrieval),
  };
}

export function createRagCollectionConfig(input: {
  build?: Partial<RagBuildConfig>;
  index?: Partial<RagIndexConfig>;
  queryProfiles?: Array<Partial<RagQueryProfile> & Partial<RagQueryConfig>>;
  defaultQueryProfileId?: string;
  generation?: RagGenerationConfig;
}, fallbacks?: RagConfigFallbacks): RagCollectionRuntimeConfig {
  const defaults = getDefaultRagConfigFallbacks(fallbacks);
  const queryProfiles = (input.queryProfiles && input.queryProfiles.length > 0
    ? input.queryProfiles
    : [{
        id: DEFAULT_RAG_QUERY_PROFILE_ID,
        name: '默认查询',
        retrieval: defaults.retrieval,
        reranker: defaults.reranker,
        queryMode: defaults.queryMode,
        preRetrieval: defaults.preRetrieval,
      }]
  ).map(profile => createRagQueryProfile(profile, defaults));
  const defaultQueryProfileId = input.defaultQueryProfileId && queryProfiles.some(p => p.id === input.defaultQueryProfileId)
    ? input.defaultQueryProfileId
    : queryProfiles[0].id;

  return {
    schemaVersion: RAG_COLLECTION_CONFIG_VERSION,
    build: {
      embedding: clone(input.build?.embedding || defaults.embedding),
      chunking: clone(input.build?.chunking || defaults.chunking),
      formatOverrides: clone(input.build?.formatOverrides || defaults.formatOverrides),
      formatTypeEnabled: clone(input.build?.formatTypeEnabled || defaults.formatTypeEnabled),
    },
    index: {
      searchAlgorithm: input.index?.searchAlgorithm || defaults.searchAlgorithm,
      hnsw: clone(input.index?.hnsw || defaults.hnsw),
    },
    queryProfiles,
    defaultQueryProfileId,
    generation: {
      answerStyle: input.generation?.answerStyle || 'normal',
      includeSources: input.generation?.includeSources !== false,
      modelProfileId: input.generation?.modelProfileId,
      systemPrompt: input.generation?.systemPrompt,
    },
  };
}

export function normalizeRagCollectionConfig(raw?: any, fallbacks?: RagConfigFallbacks): RagCollectionRuntimeConfig {
  const defaults = getDefaultRagConfigFallbacks(fallbacks);
  if (!raw || typeof raw !== 'object') {
    return createRagCollectionConfig({}, defaults);
  }

  if (raw.build || raw.index || Array.isArray(raw.queryProfiles)) {
    return createRagCollectionConfig({
      build: {
        embedding: raw.build?.embedding,
        chunking: raw.build?.chunking,
        formatOverrides: raw.build?.formatOverrides,
        formatTypeEnabled: raw.build?.formatTypeEnabled,
      },
      index: {
        searchAlgorithm: raw.index?.searchAlgorithm,
        hnsw: raw.index?.hnsw,
      },
      queryProfiles: raw.queryProfiles,
      defaultQueryProfileId: raw.defaultQueryProfileId,
      generation: raw.generation,
    }, defaults);
  }

  return createRagCollectionConfig({
    build: {
      embedding: raw.embedding,
      chunking: raw.chunking,
      formatOverrides: raw.formatOverrides,
      formatTypeEnabled: raw.formatTypeEnabled,
    },
    index: {
      searchAlgorithm: raw.searchAlgorithm,
      hnsw: raw.hnsw,
    },
    queryProfiles: [{
      id: DEFAULT_RAG_QUERY_PROFILE_ID,
      name: '默认查询',
      retrieval: raw.retrieval,
      reranker: raw.reranker,
      queryMode: raw.queryMode,
      preRetrieval: raw.preRetrieval,
    }],
    defaultQueryProfileId: DEFAULT_RAG_QUERY_PROFILE_ID,
    generation: raw.generation,
  }, defaults);
}

export function getRagQueryProfile(
  config: RagCollectionRuntimeConfig,
  queryProfileId?: string | null,
): RagQueryProfile {
  const id = queryProfileId || config.defaultQueryProfileId;
  return config.queryProfiles.find(profile => profile.id === id)
    || config.queryProfiles.find(profile => profile.id === config.defaultQueryProfileId)
    || config.queryProfiles[0]
    || createRagQueryProfile({});
}

export function resolveRagQueryConfig(
  rawConfig: any,
  queryProfileId?: string | null,
  overrides?: RagQueryOverrides,
  fallbacks?: RagConfigFallbacks,
): RagQueryProfile {
  const config = normalizeRagCollectionConfig(rawConfig, fallbacks);
  const profile = getRagQueryProfile(config, queryProfileId);
  return {
    ...profile,
    retrieval: sanitizeRetrievalConfig({ ...profile.retrieval, ...(overrides?.retrieval || {}) }),
    reranker: { ...profile.reranker, ...(overrides?.reranker || {}) },
    queryMode: { ...profile.queryMode, ...(overrides?.queryMode || {}) },
    preRetrieval: { ...profile.preRetrieval, ...(overrides?.preRetrieval || {}) },
  };
}
