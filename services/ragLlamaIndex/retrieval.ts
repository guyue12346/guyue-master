/**
 * RAG LlamaIndex Module — Retrieval Engine
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：检索引擎（Retrieval Engine）
 * ═══════════════════════════════════════════════════════════
 *
 * 检索是 RAG 的核心——决定 LLM 能"看到"哪些相关信息。
 * 检索质量直接决定回答质量（Garbage In, Garbage Out）。
 *
 * 本模块实现三种检索策略 + 两种融合算法：
 *
 * ┌────────────────────────────────────────────────────┐
 * │                   Query (用户提问)                  │
 * │                       │                            │
 * │         ┌─────────────┼─────────────┐              │
 * │         ▼             ▼             ▼              │
 * │   ┌──────────┐ ┌──────────┐ ┌──────────────┐     │
 * │   │  Vector  │ │  BM25    │ │  Knowledge   │     │
 * │   │  Search  │ │  Search  │ │  Graph       │     │
 * │   └────┬─────┘ └────┬─────┘ └──────┬───────┘     │
 * │        │             │              │              │
 * │        └─────┬───────┘              │              │
 * │              ▼                      │              │
 * │     ┌─────────────┐                │              │
 * │     │   Fusion    │                │              │
 * │     │ (Alpha/RRF) │                │              │
 * │     └──────┬──────┘                │              │
 * │            └────────────┬──────────┘              │
 * │                         ▼                          │
 * │              ┌──────────────────┐                  │
 * │              │  Merged Results  │                  │
 * │              └──────────────────┘                  │
 * └────────────────────────────────────────────────────┘
 */

import {
  SearchResult, RetrievalConfig, EmbeddingConfig,
  KnowledgeTriple,
} from './types';
import { LocalVectorStore } from './vectorStore';
import { KnowledgeGraph } from './knowledgeGraph';
import { getEmbedding } from './embedding';

// ════════════════════════════════════════════════════════════
// BM25 Implementation
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：BM25 算法详解
 * ────────────────────────
 * BM25 (Best Matching 25) 是信息检索领域的经典算法。
 * Elasticsearch、Lucene 的默认排序算法就是 BM25。
 *
 * 公式：
 *   score(q, d) = Σ IDF(qi) × [f(qi, d) × (k1 + 1)] / [f(qi, d) + k1 × (1 - b + b × |d|/avgdl)]
 *
 * 其中：
 * - q = 查询, d = 文档
 * - qi = 查询中的第 i 个词
 * - f(qi, d) = qi 在文档 d 中的出现次数（词频 TF）
 * - IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)
 *   N = 总文档数, n(qi) = 包含 qi 的文档数
 * - |d| = 文档长度, avgdl = 平均文档长度
 * - k1 = 词频饱和参数 (default 1.2)
 *   控制词频的影响：k1 越大，高频词权重越高
 * - b = 长度归一化参数 (default 0.75)
 *   b=1 完全归一化，b=0 不归一化
 *
 * 直觉理解：
 * - 一个词在文档中出现越多次 → 分数越高（但有饱和，不会无限增长）
 * - 一个词越罕见（IDF 高）→ 越有区分度 → 权重越高
 * - 文档越短，相同词频的权重越高（短文档的关键词更集中）
 *
 * 📚 分词策略：
 * 中文需要分词，英文按空格即可。
 * 这里用简单的 Unicode 分词（按标点和空格切分），
 * 对于生产环境建议用 jieba 或 ICU 分词。
 */

function tokenize(text: string): string[] {
  // Simple tokenizer: split on non-word characters, lowercase, filter short tokens
  return text
    .toLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .filter(t => t.length > 0);
}

export class BM25Index {
  private docs: Array<{ id: string; tokens: string[]; metadata: Record<string, any>; text: string }> = [];
  private avgdl: number = 0;
  private docFreq: Map<string, number> = new Map(); // 每个词出现在多少文档中
  private k1: number;
  private b: number;

  constructor(k1: number = 1.2, b: number = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * 构建 BM25 索引
   */
  buildFromEntries(entries: Array<{ id: string; text: string; metadata: Record<string, any> }>): void {
    this.docs = entries.map(e => ({
      id: e.id,
      tokens: tokenize(e.text),
      metadata: e.metadata,
      text: e.text,
    }));

    // 计算平均文档长度
    const totalLen = this.docs.reduce((sum, d) => sum + d.tokens.length, 0);
    this.avgdl = this.docs.length > 0 ? totalLen / this.docs.length : 0;

    // 计算文档频率 (DF)
    this.docFreq.clear();
    for (const doc of this.docs) {
      const uniqueTokens = new Set(doc.tokens);
      for (const token of uniqueTokens) {
        this.docFreq.set(token, (this.docFreq.get(token) || 0) + 1);
      }
    }
  }

  /**
   * BM25 检索
   */
  search(query: string, topK: number = 20): Array<{ id: string; score: number; text: string; metadata: Record<string, any> }> {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.docs.length === 0) return [];

    const N = this.docs.length;
    const scores: Array<{ id: string; score: number; text: string; metadata: Record<string, any> }> = [];

    for (const doc of this.docs) {
      let score = 0;

      // 计算文档中每个词的词频
      const tf = new Map<string, number>();
      for (const token of doc.tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }

      for (const qt of queryTokens) {
        const freq = tf.get(qt) || 0;
        if (freq === 0) continue;

        const df = this.docFreq.get(qt) || 0;
        // IDF with smoothing
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        // BM25 term score
        const numerator = freq * (this.k1 + 1);
        const denominator = freq + this.k1 * (1 - this.b + this.b * doc.tokens.length / this.avgdl);
        score += idf * numerator / denominator;
      }

      if (score > 0) {
        scores.push({ id: doc.id, score, text: doc.text, metadata: doc.metadata });
      }
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  get size(): number {
    return this.docs.length;
  }
}

// ════════════════════════════════════════════════════════════
// Fusion Algorithms
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：结果融合（Result Fusion）
 * ────────────────────────────────────
 * 两个检索器返回两组排序结果，如何合并？
 *
 * 方法 1: Alpha 加权融合
 *   需要把分数归一化到 [0, 1]，然后：
 *   final_score = alpha × vector_norm_score + (1 - alpha) × bm25_norm_score
 *
 *   问题：不同检索器的分数分布不同，归一化可能丢失信息。
 *
 * 方法 2: RRF (Reciprocal Rank Fusion)
 *   不看分数，只看排名：
 *   RRF_score(d) = Σ 1 / (k + rank_i(d))
 *   k 是平滑参数（default 60），防止排名第 1 的权重过大。
 *
 *   优点：
 *   - 不需要归一化（不同检索器的分数尺度无关）
 *   - 效果稳定，很少需要调参
 *   - 已被多项研究证明优于简单加权
 *
 *   例子：
 *   Doc A: vector 排名 #1, BM25 排名 #3
 *   RRF(A) = 1/(60+1) + 1/(60+3) = 0.0164 + 0.0159 = 0.0323
 *
 *   Doc B: vector 排名 #5, BM25 排名 #1
 *   RRF(B) = 1/(60+5) + 1/(60+1) = 0.0154 + 0.0164 = 0.0318
 *
 *   → Doc A > Doc B（两个检索器都认为 A 不错，比一个很高一个很低的 B 更可靠）
 */

interface RankedResult {
  id: string;
  text: string;
  metadata: Record<string, any>;
  vectorScore?: number;
  bm25Score?: number;
  finalScore: number;
}

function normalizeScores(results: Array<{ score: number }>): number[] {
  if (results.length === 0) return [];
  const max = Math.max(...results.map(r => r.score));
  const min = Math.min(...results.map(r => r.score));
  const range = max - min || 1;
  return results.map(r => (r.score - min) / range);
}

export function fuseWithAlpha(
  vectorResults: Array<{ id: string; score: number; text: string; metadata: Record<string, any> }>,
  bm25Results: Array<{ id: string; score: number; text: string; metadata: Record<string, any> }>,
  alpha: number,
  topK: number,
): RankedResult[] {
  const vecNorm = normalizeScores(vectorResults);
  const bm25Norm = normalizeScores(bm25Results);

  const scoreMap = new Map<string, RankedResult>();

  vectorResults.forEach((r, i) => {
    scoreMap.set(r.id, {
      id: r.id, text: r.text, metadata: r.metadata,
      vectorScore: r.score,
      finalScore: alpha * vecNorm[i],
    });
  });

  bm25Results.forEach((r, i) => {
    const existing = scoreMap.get(r.id);
    if (existing) {
      existing.bm25Score = r.score;
      existing.finalScore += (1 - alpha) * bm25Norm[i];
    } else {
      scoreMap.set(r.id, {
        id: r.id, text: r.text, metadata: r.metadata,
        bm25Score: r.score,
        finalScore: (1 - alpha) * bm25Norm[i],
      });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topK);
}

export function fuseWithRRF(
  vectorResults: Array<{ id: string; score: number; text: string; metadata: Record<string, any> }>,
  bm25Results: Array<{ id: string; score: number; text: string; metadata: Record<string, any> }>,
  k: number,
  topK: number,
): RankedResult[] {
  const scoreMap = new Map<string, RankedResult>();

  vectorResults.forEach((r, rank) => {
    scoreMap.set(r.id, {
      id: r.id, text: r.text, metadata: r.metadata,
      vectorScore: r.score,
      finalScore: 1 / (k + rank + 1),
    });
  });

  bm25Results.forEach((r, rank) => {
    const existing = scoreMap.get(r.id);
    if (existing) {
      existing.bm25Score = r.score;
      existing.finalScore += 1 / (k + rank + 1);
    } else {
      scoreMap.set(r.id, {
        id: r.id, text: r.text, metadata: r.metadata,
        bm25Score: r.score,
        finalScore: 1 / (k + rank + 1),
      });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topK);
}

// ════════════════════════════════════════════════════════════
// Unified Retrieval Engine
// ════════════════════════════════════════════════════════════

export interface RetrievalContext {
  vectorStore: LocalVectorStore;
  bm25Index?: BM25Index;
  knowledgeGraph?: KnowledgeGraph;
  embeddingConfig: EmbeddingConfig;
  /** Pre-computed query embedding from HyDE (bypasses query vectorization) */
  hydeEmbedding?: number[];
}

export interface RetrievalResult extends SearchResult {
  vectorScore?: number;
  bm25Score?: number;
  retrievalStrategy: string;
}

/**
 * 📚 统一检索接口
 *
 * 根据配置自动选择检索策略并执行。
 * 返回的结果包含每种检索器的独立分数（方便对比调试）。
 */
export async function retrieve(
  query: string,
  config: RetrievalConfig,
  context: RetrievalContext,
): Promise<RetrievalResult[]> {
  const topK = config.topK ?? 20;
  let results: RetrievalResult[] = [];

  switch (config.strategy) {
    case 'vector': {
      const vecResults = await context.vectorStore.search(query, context.embeddingConfig, {
        topK,
        minScore: 0,
      }, context.hydeEmbedding);
      results = vecResults.map(r => ({
        ...r,
        vectorScore: r.score,
        retrievalStrategy: 'vector',
      }));
      break;
    }

    case 'bm25': {
      if (!context.bm25Index) {
        throw new Error('BM25 index not built. Call buildBM25Index() first.');
      }
      const bm25Results = context.bm25Index.search(query, topK);
      results = bm25Results.map(r => ({
        text: r.metadata.window || r.text,
        score: r.score,
        metadata: r.metadata as any,
        nodeId: r.id,
        bm25Score: r.score,
        retrievalStrategy: 'bm25',
      }));
      break;
    }

    case 'hybrid': {
      if (!context.bm25Index) {
        throw new Error('BM25 index not built. Call buildBM25Index() first.');
      }

      // 两路检索
      const vecResults = await context.vectorStore.search(query, context.embeddingConfig, {
        topK: topK * 2,
        minScore: 0,
      }, context.hydeEmbedding);
      const bm25Results = context.bm25Index.search(query, topK * 2);

      const vecForFusion = vecResults.map(r => ({
        id: r.nodeId, score: r.score, text: r.text, metadata: r.metadata as Record<string, any>,
      }));
      const bm25ForFusion = bm25Results.map(r => ({
        id: r.id, score: r.score, text: r.metadata.window || r.text, metadata: r.metadata,
      }));

      // 融合
      const fusionMethod = config.fusionMethod ?? 'rrf';
      const fused = fusionMethod === 'rrf'
        ? fuseWithRRF(vecForFusion, bm25ForFusion, config.rrfK ?? 60, topK)
        : fuseWithAlpha(vecForFusion, bm25ForFusion, config.alpha ?? 0.7, topK);

      results = fused.map(r => ({
        text: r.text,
        score: r.finalScore,
        metadata: r.metadata as any,
        nodeId: r.id,
        vectorScore: r.vectorScore,
        bm25Score: r.bm25Score,
        retrievalStrategy: `hybrid-${fusionMethod}`,
      }));
      break;
    }
  }

  // 可选：知识图谱增强
  if (config.includeKnowledgeGraph && context.knowledgeGraph) {
    const kgTriples = context.knowledgeGraph.findRelevantTriples(query, config.kgMaxTriples ?? 5);
    if (kgTriples.length > 0) {
      for (const result of results) {
        result.relatedTriples = kgTriples;
      }
    }
  }

  return results;
}

/**
 * 从 vectorStore 构建 BM25 索引（同步，因为数据已在内存中）
 */
export function buildBM25FromVectorStore(
  vectorStore: LocalVectorStore,
  k1?: number,
  b?: number,
): BM25Index {
  const bm25 = new BM25Index(k1, b);
  const serialized = vectorStore.serialize();
  bm25.buildFromEntries(serialized.entries.map(e => ({
    id: e.id,
    text: e.text,
    metadata: e.metadata,
  })));
  return bm25;
}
