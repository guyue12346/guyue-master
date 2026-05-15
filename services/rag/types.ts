import type {
  EmbeddingConfig,
  EmbeddingProvider,
  SupportedDocType,
  VectorStoreInfo,
} from '../ragLlamaIndex';
import type {
  BuildResult,
  VectorBuildOptions,
  VectorSearchOptions,
  VectorSearchResult,
} from '../vectorService';
import type { RagCollectionRuntimeConfig } from './config';

export const RAG_SCHEMA_VERSION = 2;
export const RAG_MANIFEST_FILE = 'rag-manifest-v1.json';
export const AGENT_KNOWLEDGE_COLLECTION_ID = 'agent-file-knowledge';

export type RagCollectionSource =
  | 'rag-lab'
  | 'agent'
  | 'legacy-agent'
  | 'vector-service'
  | 'disk'
  | 'unknown';

export type RagFileCollectionState =
  | 'listed'
  | 'indexed'
  | 'stale'
  | 'missing'
  | 'removed';

export interface RagFileInput {
  id?: string;
  path: string;
  name: string;
  type?: SupportedDocType | string;
  size?: number;
  lastModified?: number;
}

export interface RagIndexedFileInput {
  fileId?: string;
  filePath: string;
  fileName: string;
  fileType?: string;
  chunkCount: number;
  indexedAt?: number;
  fileSize?: number;
  lastModified?: number;
}

export interface RagFileCollectionRef {
  collectionId: string;
  collectionName?: string;
  state: RagFileCollectionState;
  includedAt: number;
  indexedAt?: number;
  chunkCount: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  source: RagCollectionSource;
  fileSize?: number;
  lastModified?: number;
}

export interface RagFileRecord {
  fileId?: string;
  fileName: string;
  filePath: string;
  fileType?: string;
  fileSize?: number;
  lastModified?: number;
  createdAt: number;
  updatedAt: number;
  collections: Record<string, RagFileCollectionRef>;
}

export interface RagCollectionRecord {
  id: string;
  name: string;
  source: RagCollectionSource;
  createdAt: number;
  updatedAt: number;
  vectorCount: number;
  fileCount: number;
  docPaths: string[];
  embeddingProvider?: string;
  embeddingModel?: string;
  payloadPath?: string;
  metadata?: Record<string, any>;
  config?: RagCollectionRuntimeConfig;
}

export interface RagManifest {
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  collections: Record<string, RagCollectionRecord>;
  files: Record<string, RagFileRecord>;
}

export interface RagBuildCollectionParams {
  collectionId: string;
  collectionName?: string;
  files: RagFileInput[];
  embeddingConfig: EmbeddingConfig;
  options?: VectorBuildOptions;
  config?: RagCollectionRuntimeConfig;
  source?: RagCollectionSource;
}

export interface RagBuildCollectionResult extends BuildResult {
  manifest: RagManifest;
}

export interface RagCollectionSearchParams {
  collectionId: string;
  query: string;
  embeddingConfig?: EmbeddingConfig;
  fallbackEmbeddingConfig?: EmbeddingConfig;
  queryProfileId?: string;
  options?: VectorSearchOptions;
}

export interface RagMultiCollectionSearchParams {
  collectionIds: string[];
  query: string;
  embeddingConfig?: EmbeddingConfig;
  fallbackEmbeddingConfig?: EmbeddingConfig;
  queryProfileId?: string;
  options?: VectorSearchOptions;
}

export interface RagSearchResponse {
  results: VectorSearchResult[];
  perCollection?: Array<{ collectionId: string; results: VectorSearchResult[] }>;
  errors?: string[];
}

export interface RagKnowledgeQueryParams {
  query: string;
  collectionIds?: string[];
  queryProfileId?: string;
  topK?: number;
  fallbackEmbeddingConfig?: EmbeddingConfig;
}

export interface RagCollectionSnapshot {
  id: string;
  manifest?: RagCollectionRecord;
  vectorInfo?: VectorStoreInfo | null;
}

export type { EmbeddingConfig, EmbeddingProvider, VectorSearchOptions, VectorSearchResult };
