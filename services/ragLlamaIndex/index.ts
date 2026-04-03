/**
 * RAG LlamaIndex Module — Public API
 *
 * 📚 这是模块的入口文件。其他代码通过这个文件访问所有功能。
 *
 * 使用方式：
 * ```typescript
 * import {
 *   loadDocument, chunkDocuments, LocalVectorStore,
 *   createEmbedFunction, buildKnowledgeGraph,
 * } from '../services/ragLlamaIndex';
 * ```
 *
 * 📚 完整 RAG 流水线（Pipeline）概览：
 * ═══════════════════════════════════
 *
 * 索引阶段（Indexing / Offline）：
 * ┌────────────────────────────────────────────────────────┐
 * │  文件 → loadDocument() → Document[]                    │
 * │    → chunkDocuments() → TextNode[]                     │
 * │      → enrichMetadata() → TextNode[] (元数据丰富)       │
 * │        → vectorStore.addNodes() → 向量存储              │
 * │        → buildKnowledgeGraph() → 知识图谱 (可选)        │
 * │          → saveVectorStore() → 持久化到磁盘             │
 * └────────────────────────────────────────────────────────┘
 *
 * 查询阶段（Query / Online）：
 * ┌────────────────────────────────────────────────────────┐
 * │  用户提问                                               │
 * │    → vectorStore.search() → 相似文本块                  │
 * │    → knowledgeGraph.findRelevantTriples() → 相关三元组  │
 * │      → 组装 Prompt = 系统提示 + 检索结果 + 用户问题     │
 * │        → LLM 生成回答                                   │
 * └────────────────────────────────────────────────────────┘
 */

// ── Types ──
export type {
  EmbeddingProvider,
  EmbeddingConfig,
  SupportedDocType,
  DocumentInfo,
  ChunkingStrategy,
  ChunkingConfig,
  ChunkMetadata,
  KnowledgeTriple,
  KnowledgeGraphConfig,
  StorageConfig,
  RagPipelineConfig,
  IndexedFileInfo,
  IndexStatus,
  SearchResult,
  SearchOptions,
  // 向量库信息类型 (version 4)
  VectorStoreInfo,
  VectorEntryDetail,
  KnowledgeGraphSummary,
  // 格式感知分块类型
  MarkdownChunkingMethod,
  MarkdownChunkingConfig,
  PdfChunkingMethod,
  PdfChunkingConfig,
  HtmlChunkingMethod,
  HtmlChunkingConfig,
  CodeChunkingMethod,
  CodeChunkingConfig,
  FormatChunkingOverrides,
  // 检索前优化类型
  PreRetrievalStrategy,
  PreRetrievalConfig,
} from './types';

// ── Config ──
export {
  EXTENSION_TO_DOCTYPE,
  EXTENSION_TO_LANGUAGE,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  DEFAULT_SUPPORTED_EXTENSIONS,
  createDefaultConfig,
  inferDocType,
  inferCodeLanguage,
} from './config';

// ── Document Loading ──
export type { FileReader, LoadDocumentOptions } from './documentLoader';
export {
  loadDocument,
  loadDocuments,
  extractMarkdownSections,
  extractPdfPages,
  extractCodeStructure,
} from './documentLoader';

// ── Chunking ──
export type { EmbedFunction } from './chunking';
export {
  createSentenceSplitter,
  splitWithSentenceSplitter,
  splitWithSentenceWindow,
  splitWithSemantic,
  chunkDocuments,
} from './chunking';

// ── Format-Aware Chunking (格式感知分块) ──
export {
  splitMarkdownByHeading,
  splitPdfByPage,
  splitHtmlBySection,
  splitCodeByFunction,
  chunkDocumentsByFormat,
} from './formatChunking';

// ── Metadata ──
export {
  EMBED_INCLUDE_KEYS,
  EMBED_EXCLUDE_KEYS,
  LLM_EXCLUDE_KEYS,
  detectLanguage,
  enrichWithLanguage,
  setMetadataExclusions,
  enrichWithEmbeddingInfo,
  enrichMetadata,
  validateMetadata,
  describeNode,
} from './metadata';

// ── Embedding ──
export {
  getEmbedding,
  createEmbedFunction,
  batchEmbed,
  EMBEDDING_MODEL_OPTIONS,
} from './embedding';

// ── Vector Store ──
export type { VectorEntry, SerializedVectorStore, SerializedHnswIndex, StorageAdapter } from './vectorStore';
export {
  HnswIndex,
  LocalVectorStore,
  saveVectorStore,
  loadVectorStore,
} from './vectorStore';

// ── Pre-Retrieval Optimization ──
export type { PreRetrievalResult } from './preRetrieval';
export { optimizePreRetrieval } from './preRetrieval';

// ── Knowledge Graph ──
export type { EntityInfo } from './knowledgeGraph';
export {
  extractTriples,
  KnowledgeGraph,
  buildKnowledgeGraph,
} from './knowledgeGraph';

// ── Retrieval ──
export type {
  RetrievalStrategy,
  FusionMethod,
  RetrievalConfig,
  RerankerType,
  RerankerConfig,
  SearchAlgorithm,
  HnswConfig,
  FullRagConfig,
  LLMFunction,
  QueryMode,
  QueryModeConfig,
} from './types';

export type { RetrievalResult, RetrievalContext } from './retrieval';
export {
  BM25Index,
  fuseWithAlpha,
  fuseWithRRF,
  retrieve,
  buildBM25FromVectorStore,
} from './retrieval';

// ── Reranker ──
export type { RerankerContext } from './reranker';
export { rerank } from './reranker';

// ── Query Engine ──
export type { QueryEngineConfig, QueryContext, QueryResult } from './queryEngine';
export {
  RagPipeline,
  createDefaultConfig as createDefaultQueryConfig,
  createSimpleVectorConfig,
  createBalancedConfig,
  createPrecisionConfig,
} from './queryEngine';

// ── Query Modes ──
export { routerQuery, subQuestionQuery, iterativeQuery, executeQueryMode } from './queryModes';
export type {
  RouterConfig,
  RouteDefinition,
  SubQuestionConfig,
  IterativeConfig,
  QueryModeConfig as QueryModeConfigFull,
  RouterQueryContext,
} from './queryModes';
