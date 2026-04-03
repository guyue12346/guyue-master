/**
 * RAG LlamaIndex Module — Query Engine
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：查询引擎（Query Engine）
 * ═══════════════════════════════════════════════════════════
 *
 * Query Engine 是 RAG 流水线的编排层：
 *
 *   用户提问
 *     │
 *     ▼
 *   ┌─────────────────────────────────────────┐
 *   │ 1. Query Transform (可选)               │
 *   │    - 查询改写（让 LLM 优化提问方式）      │
 *   │    - HyDE: 先生成假设答案，用假设答案检索  │
 *   │    - 子问题分解                           │
 *   └─────────────────┬───────────────────────┘
 *                     ▼
 *   ┌─────────────────────────────────────────┐
 *   │ 2. Retrieve (检索)                      │
 *   │    - Vector / BM25 / Hybrid             │
 *   │    + KG augmentation                    │
 *   └─────────────────┬───────────────────────┘
 *                     ▼
 *   ┌─────────────────────────────────────────┐
 *   │ 3. Rerank (重排序)                      │
 *   │    - LLM / Cohere / Jina / MMR          │
 *   └─────────────────┬───────────────────────┘
 *                     ▼
 *   ┌─────────────────────────────────────────┐
 *   │ 4. Response Synthesis (回答合成)         │
 *   │    - Stuff: 全部塞给 LLM                │
 *   │    - Map-Reduce: 分段总结再汇总          │
 *   │    - Refine: 逐段精化答案               │
 *   └─────────────────────────────────────────┘
 *
 * 本模块把前面所有组件串联起来，形成完整的 RAG 管道。
 * 用户可以通过 FullRagConfig 配置每个环节的参数。
 */

import { FullRagConfig, SearchResult, RetrievalConfig, RerankerConfig, EmbeddingConfig, LLMFunction } from './types';
import { LocalVectorStore } from './vectorStore';
import { BM25Index, retrieve, buildBM25FromVectorStore, RetrievalResult } from './retrieval';
import { rerank, RerankerContext } from './reranker';
import { KnowledgeGraph } from './knowledgeGraph';

// ════════════════════════════════════════════════════════════
// Query Engine Types
// ════════════════════════════════════════════════════════════

export interface QueryEngineConfig {
  retrieval: RetrievalConfig;
  reranker: RerankerConfig;
  embeddingConfig: EmbeddingConfig;
}

export interface QueryContext {
  vectorStore: LocalVectorStore;
  bm25Index?: BM25Index;
  knowledgeGraph?: KnowledgeGraph;
  llmFn?: LLMFunction;
}

export interface QueryResult {
  // 检索到的文档段落
  results: RetrievalResult[];
  // 完整管道元数据
  metadata: {
    query: string;
    strategy: string;
    totalRetrieved: number;
    totalAfterRerank: number;
    retrievalTimeMs: number;
    rerankTimeMs: number;
    totalTimeMs: number;
  };
  // 知识图谱三元组（如果启用）
  relatedTriples?: Array<{ subject: string; predicate: string; object: string }>;
}

// ════════════════════════════════════════════════════════════
// RAG Pipeline (完整管道)
// ════════════════════════════════════════════════════════════

/**
 * 📚 RAG Pipeline 类
 *
 * 管理完整的 RAG 生命周期：
 * 1. 初始化 — 加载/构建索引
 * 2. 查询 — 检索 + 重排序
 * 3. 序列化 — 持久化索引状态
 *
 * 使用方式：
 * ```ts
 * const pipeline = new RagPipeline(config);
 * await pipeline.initialize(documents);
 * const results = await pipeline.query("你的问题");
 * ```
 */
export class RagPipeline {
  private config: QueryEngineConfig;
  private vectorStore: LocalVectorStore;
  private bm25Index: BM25Index | null = null;
  private knowledgeGraph: KnowledgeGraph | null = null;
  private llmFn: LLMFunction | null = null;

  constructor(config: QueryEngineConfig) {
    this.config = config;
    this.vectorStore = new LocalVectorStore();
  }

  /**
   * 设置 LLM 函数（用于 LLM reranker 和 KG extraction）
   */
  setLLMFunction(fn: LLMFunction): void {
    this.llmFn = fn;
  }

  /**
   * 获取向量存储
   */
  getVectorStore(): LocalVectorStore {
    return this.vectorStore;
  }

  /**
   * 获取 BM25 索引
   */
  getBM25Index(): BM25Index | null {
    return this.bm25Index;
  }

  /**
   * 获取知识图谱
   */
  getKnowledgeGraph(): KnowledgeGraph | null {
    return this.knowledgeGraph;
  }

  /**
   * 构建 BM25 索引（从向量存储的文档中提取文本）
   */
  buildBM25(): void {
    this.bm25Index = buildBM25FromVectorStore(
      this.vectorStore,
      this.config.retrieval.bm25K1,
      this.config.retrieval.bm25B,
    );
  }

  /**
   * 设置知识图谱
   */
  setKnowledgeGraph(kg: KnowledgeGraph): void {
    this.knowledgeGraph = kg;
  }

  /**
   * 从序列化数据恢复状态
   */
  loadFromSerialized(data: {
    vectorStore?: string;
    bm25Entries?: Array<{ id: string; text: string; metadata: Record<string, any> }>;
    knowledgeGraph?: string;
  }): void {
    if (data.vectorStore) {
      this.vectorStore = LocalVectorStore.deserialize(JSON.parse(data.vectorStore));
    }
    if (data.bm25Entries) {
      this.bm25Index = new BM25Index(
        this.config.retrieval.bm25K1,
        this.config.retrieval.bm25B,
      );
      this.bm25Index.buildFromEntries(data.bm25Entries);
    }
    if (data.knowledgeGraph) {
      this.knowledgeGraph = KnowledgeGraph.deserialize(JSON.parse(data.knowledgeGraph));
    }
  }

  /**
   * 📚 核心：执行查询
   *
   * 流程：
   *   query → retrieve → rerank → return results
   *
   * 每一步的耗时都会记录，方便对比不同配置的性能。
   */
  async query(queryText: string, hydeEmbedding?: number[]): Promise<QueryResult> {
    const totalStart = performance.now();

    // === Step 1: Retrieve ===
    const retrieveStart = performance.now();

    // Auto-build BM25 if needed
    if (
      (this.config.retrieval.strategy === 'bm25' || this.config.retrieval.strategy === 'hybrid')
      && !this.bm25Index
    ) {
      this.buildBM25();
    }

    const retrievalResults = await retrieve(queryText, this.config.retrieval, {
      vectorStore: this.vectorStore,
      bm25Index: this.bm25Index || undefined,
      knowledgeGraph: this.knowledgeGraph || undefined,
      embeddingConfig: this.config.embeddingConfig,
      hydeEmbedding,
    });

    const retrieveTimeMs = performance.now() - retrieveStart;

    // === Step 2: Rerank ===
    const rerankStart = performance.now();

    const rerankerContext: RerankerContext = {
      llmFn: this.llmFn || undefined,
      embeddingConfig: this.config.embeddingConfig,
    };

    const rerankedResults = await rerank(
      queryText,
      retrievalResults,
      this.config.reranker,
      rerankerContext,
    );

    const rerankTimeMs = performance.now() - rerankStart;

    // === Collect KG triples ===
    const allTriples = retrievalResults
      .flatMap(r => r.relatedTriples || [])
      .filter((t, i, arr) =>
        arr.findIndex(x => x.subject === t.subject && x.predicate === t.predicate && x.object === t.object) === i,
      );

    const totalTimeMs = performance.now() - totalStart;

    return {
      results: rerankedResults as RetrievalResult[],
      metadata: {
        query: queryText,
        strategy: this.config.retrieval.strategy,
        totalRetrieved: retrievalResults.length,
        totalAfterRerank: rerankedResults.length,
        retrievalTimeMs: Math.round(retrieveTimeMs * 100) / 100,
        rerankTimeMs: Math.round(rerankTimeMs * 100) / 100,
        totalTimeMs: Math.round(totalTimeMs * 100) / 100,
      },
      relatedTriples: allTriples.length > 0 ? allTriples : undefined,
    };
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    vectorStoreSize: number;
    bm25IndexSize: number;
    knowledgeGraphNodes: number;
    knowledgeGraphEdges: number;
  } {
    return {
      vectorStoreSize: this.vectorStore.size,
      bm25IndexSize: this.bm25Index?.size ?? 0,
      knowledgeGraphNodes: this.knowledgeGraph?.entityCount ?? 0,
      knowledgeGraphEdges: this.knowledgeGraph?.tripleCount ?? 0,
    };
  }
}

// ════════════════════════════════════════════════════════════
// Factory — 快速创建预配置管道
// ════════════════════════════════════════════════════════════

/**
 * 📚 预设配置工厂
 *
 * 提供几种常见的 RAG 配置组合，让用户快速上手。
 */
export function createDefaultConfig(
  embeddingConfig: EmbeddingConfig,
  overrides?: Partial<QueryEngineConfig>,
): QueryEngineConfig {
  return {
    retrieval: {
      strategy: 'hybrid',
      topK: 20,
      fusionMethod: 'rrf',
      rrfK: 60,
      alpha: 0.7,
      bm25K1: 1.2,
      bm25B: 0.75,
      includeKnowledgeGraph: false,
      kgMaxTriples: 5,
      ...overrides?.retrieval,
    },
    reranker: {
      type: 'none',
      topN: 5,
      mmrLambda: 0.7,
      ...overrides?.reranker,
    },
    embeddingConfig,
  };
}

/**
 * 纯向量检索 + 无重排序（最简单、最快）
 */
export function createSimpleVectorConfig(embeddingConfig: EmbeddingConfig): QueryEngineConfig {
  return createDefaultConfig(embeddingConfig, {
    retrieval: { strategy: 'vector', topK: 10 },
    reranker: { type: 'none', topN: 5 },
  });
}

/**
 * 混合检索 + MMR 多样性（推荐）
 */
export function createBalancedConfig(embeddingConfig: EmbeddingConfig): QueryEngineConfig {
  return createDefaultConfig(embeddingConfig, {
    retrieval: { strategy: 'hybrid', topK: 20, fusionMethod: 'rrf' },
    reranker: { type: 'mmr', topN: 5, mmrLambda: 0.7 },
  });
}

/**
 * 混合检索 + LLM 重排序（最准确但最慢）
 */
export function createPrecisionConfig(embeddingConfig: EmbeddingConfig): QueryEngineConfig {
  return createDefaultConfig(embeddingConfig, {
    retrieval: {
      strategy: 'hybrid', topK: 30,
      fusionMethod: 'rrf', includeKnowledgeGraph: true,
    },
    reranker: { type: 'llm', topN: 5 },
  });
}
