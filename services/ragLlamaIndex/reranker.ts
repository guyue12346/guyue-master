/**
 * RAG LlamaIndex Module — Reranker
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：重排序（Reranking）
 * ═══════════════════════════════════════════════════════════
 *
 * 为什么初始检索不够？
 * ──────────────────
 * 初始检索（Vector / BM25）使用 bi-encoder：
 *   query 和 document 分别独立编码为向量，然后比较距离。
 *   这很快（可以预计算 doc 向量），但精度有限。
 *
 * Reranking 使用 cross-encoder：
 *   把 (query, document) 作为一个整体输入模型，
 *   模型可以看到 query 和 doc 之间的交叉注意力（cross-attention）。
 *   这大幅提高了判断"这个文档是否真的回答了这个问题"的能力。
 *
 * 类比：
 *   Bi-encoder: 给每个求职者和每个岗位各打一个分，看分数接近的配对
 *   Cross-encoder: 让每个求职者和岗位面对面面试，逐一评估匹配度
 *
 * 生产流水线：
 *   初始检索 Top-100 → Rerank → Top-5 → 送给 LLM
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 MMR (Maximal Marginal Relevance) 详解
 * ═══════════════════════════════════════════════════════════
 *
 * MMR 不是传统的重排序，而是一种"多样性选择"算法。
 *
 * 问题：Top-5 检索结果可能都在说同一件事（冗余）。
 * MMR 在选每一个结果时，同时考虑：
 *   1. 与查询的相关性（越高越好）
 *   2. 与已选结果的差异性（越不同越好）
 *
 * 公式：
 *   MMR(d) = λ × Sim(q, d) - (1-λ) × max[Sim(d, d_selected)]
 *
 * λ 控制权衡：
 *   λ=1.0 → 纯相关性（等同普通排序）
 *   λ=0.5 → 平衡相关性和多样性
 *   λ=0.0 → 纯多样性（可能跑偏）
 *   推荐 λ=0.7（偏重相关性，兼顾多样性）
 */

import { SearchResult, RerankerConfig, LLMFunction } from './types';
import { getEmbedding } from './embedding';
import type { EmbeddingConfig } from './types';

// ════════════════════════════════════════════════════════════
// LLM Reranker
// ════════════════════════════════════════════════════════════

/**
 * 📚 LLM 重排序
 * ─────────────
 * 让 LLM 对每个候选结果打分（0-10）。
 * 优点：可以理解复杂语义、支持自定义评分标准。
 * 缺点：慢（每个候选一次 LLM 调用），贵。
 *
 * 优化：可以把多个候选一起发给 LLM 批量评分。
 */

const DEFAULT_LLM_RERANK_PROMPT = `你是一个搜索结果评估专家。请评估以下文本段落与用户查询的相关性。

用户查询: {query}

文本段落:
{text}

请只回复一个 0-10 的整数分数，不要解释。
- 10 = 完全回答了查询
- 7-9 = 高度相关
- 4-6 = 部分相关
- 1-3 = 略有关联
- 0 = 完全无关

分数:`;

async function rerankWithLLM(
  query: string,
  results: SearchResult[],
  config: RerankerConfig,
  llmFn: LLMFunction,
): Promise<SearchResult[]> {
  const template = config.llmPromptTemplate || DEFAULT_LLM_RERANK_PROMPT;

  const scored: Array<{ result: SearchResult; llmScore: number }> = [];

  for (const result of results) {
    const prompt = template
      .replace('{query}', query)
      .replace('{text}', result.text.slice(0, 1500)); // Truncate to save tokens

    try {
      const response = await llmFn(prompt);
      const scoreMatch = response.match(/(\d+)/);
      const llmScore = scoreMatch ? Math.min(10, parseInt(scoreMatch[1], 10)) / 10 : 0.5;
      scored.push({ result, llmScore });
    } catch {
      scored.push({ result, llmScore: 0.5 }); // Default on error
    }
  }

  return scored
    .sort((a, b) => b.llmScore - a.llmScore)
    .slice(0, config.topN)
    .map(s => ({ ...s.result, score: s.llmScore }));
}

// ════════════════════════════════════════════════════════════
// Cohere Reranker
// ════════════════════════════════════════════════════════════

/**
 * 📚 Cohere Rerank API
 * ─────────────────────
 * Cohere 提供专门的 rerank 模型，比 LLM 重排序快 10-50 倍。
 * API: POST https://api.cohere.ai/v2/rerank
 *
 * 模型选择：
 * - rerank-v3.5: 最新、最准确
 * - rerank-english-v3.0: 英文优化
 * - rerank-multilingual-v3.0: 多语言（包括中文）
 */
async function rerankWithCohere(
  query: string,
  results: SearchResult[],
  config: RerankerConfig,
): Promise<SearchResult[]> {
  if (!config.cohereApiKey) throw new Error('Cohere API key required for Cohere reranker');

  const res = await fetch('https://api.cohere.ai/v2/rerank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.cohereApiKey}`,
    },
    body: JSON.stringify({
      model: config.cohereModel || 'rerank-v3.5',
      query,
      documents: results.map(r => r.text),
      top_n: config.topN,
      return_documents: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cohere rerank error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    ...results[r.index],
    score: r.relevance_score,
  }));
}

// ════════════════════════════════════════════════════════════
// Jina Reranker
// ════════════════════════════════════════════════════════════

/**
 * 📚 Jina Reranker API
 * ─────────────────────
 * Jina AI 也提供专用 rerank 模型，对多语言（含中文）支持好。
 * API: POST https://api.jina.ai/v1/rerank
 */
async function rerankWithJina(
  query: string,
  results: SearchResult[],
  config: RerankerConfig,
): Promise<SearchResult[]> {
  if (!config.jinaApiKey) throw new Error('Jina API key required for Jina reranker');

  const res = await fetch('https://api.jina.ai/v1/rerank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.jinaApiKey}`,
    },
    body: JSON.stringify({
      model: config.jinaModel || 'jina-reranker-v2-base-multilingual',
      query,
      documents: results.map(r => r.text),
      top_n: config.topN,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Jina rerank error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    ...results[r.index],
    score: r.relevance_score,
  }));
}

// ════════════════════════════════════════════════════════════
// MMR (Maximal Marginal Relevance)
// ════════════════════════════════════════════════════════════

/**
 * 📚 MMR 算法实现
 *
 * 输入：
 *   - 候选结果集合 C（带相关性分数）
 *   - query embedding
 *   - 每个候选的 embedding
 *
 * 输出：
 *   - 排序后的子集 S（|S| = topN）
 *
 * 贪心选择过程：
 * 1. 选相关性最高的结果加入 S
 * 2. 对剩余每个候选 d：
 *    MMR(d) = λ × Sim(q, d) - (1-λ) × max_{s∈S} Sim(d, s)
 * 3. 选 MMR 最高的加入 S
 * 4. 重复直到 |S| = topN
 *
 * 需要 embedding 来计算文档间的相似度。
 * 如果没有 embedding，退化为简单截取。
 */

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function rerankWithMMR(
  query: string,
  results: SearchResult[],
  config: RerankerConfig,
  embeddingConfig?: EmbeddingConfig,
): Promise<SearchResult[]> {
  const lambda = config.mmrLambda ?? 0.7;
  const topN = config.topN ?? 5;

  if (!embeddingConfig || results.length <= topN) {
    return results.slice(0, topN);
  }

  // Get embeddings for all candidates + query
  const queryEmb = await getEmbedding(query, embeddingConfig);
  const docEmbs = await Promise.all(
    results.map(r => getEmbedding(r.text.slice(0, 500), embeddingConfig)),
  );

  // Normalize relevance scores to [0, 1]
  const maxScore = Math.max(...results.map(r => r.score)) || 1;
  const normScores = results.map(r => r.score / maxScore);

  const selected: number[] = [];
  const remaining = new Set(results.map((_, i) => i));

  for (let step = 0; step < topN && remaining.size > 0; step++) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (const idx of remaining) {
      // Relevance to query
      const relevance = normScores[idx];

      // Max similarity to already selected docs
      let maxSimToSelected = 0;
      for (const selIdx of selected) {
        const sim = cosineSim(docEmbs[idx], docEmbs[selIdx]);
        if (sim > maxSimToSelected) maxSimToSelected = sim;
      }

      const mmr = lambda * relevance - (1 - lambda) * maxSimToSelected;
      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      selected.push(bestIdx);
      remaining.delete(bestIdx);
    }
  }

  return selected.map((idx, rank) => ({
    ...results[idx],
    score: 1 - rank / selected.length, // Re-score by MMR rank
  }));
}

// ════════════════════════════════════════════════════════════
// Unified Reranker Interface
// ════════════════════════════════════════════════════════════

export interface RerankerContext {
  llmFn?: LLMFunction;
  embeddingConfig?: EmbeddingConfig;
}

/**
 * 📚 统一重排序接口
 *
 * 根据配置选择重排序策略。
 * type='none' 时直接截取前 topN（不做重排序）。
 */
export async function rerank(
  query: string,
  results: SearchResult[],
  config: RerankerConfig,
  context?: RerankerContext,
): Promise<SearchResult[]> {
  if (results.length === 0) return [];

  switch (config.type) {
    case 'none':
      return results.slice(0, config.topN ?? 5);

    case 'llm':
      if (!context?.llmFn) throw new Error('LLM function required for LLM reranker');
      return rerankWithLLM(query, results, config, context.llmFn);

    case 'cohere':
      return rerankWithCohere(query, results, config);

    case 'jina':
      return rerankWithJina(query, results, config);

    case 'mmr':
      return rerankWithMMR(query, results, config, context?.embeddingConfig);

    default:
      return results.slice(0, config.topN ?? 5);
  }
}
