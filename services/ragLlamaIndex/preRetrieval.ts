/**
 * RAG LlamaIndex Module — Pre-Retrieval Optimization
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：检索前优化（Pre-Retrieval Optimization）
 * ═══════════════════════════════════════════════════════════
 *
 * 传统 RAG：用户查询 → 直接向量化 → 检索
 * 优化 RAG：用户查询 → 【检索前优化】→ 优化后的查询/向量 → 检索
 *
 * 为什么需要检索前优化？
 * ────────────────────────
 * 1. 用户查询通常短且模糊（"React 状态管理"只有 4 个字）
 * 2. 短查询的 embedding 信息量不足，难以精准匹配长文档
 * 3. 用户可能用口语表述，而文档用的是专业术语
 *
 * 本模块提供三种策略：
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 1️⃣  查询扩展（Query Expansion）                          │
 * │     原始查询 → LLM 补充同义词/相关术语 → 扩展后的查询      │
 * │     "React hooks" → "React hooks useState useEffect      │
 * │      useCallback useMemo 自定义 Hook 函数组件"            │
 * │                                                          │
 * │ 2️⃣  查询改写（Query Rewriting）                           │
 * │     原始查询 → LLM 改写为更精确的表述 → 改写后的查询        │
 * │     "那个前端框架怎么用" → "React 前端框架核心概念与使用"    │
 * │                                                          │
 * │ 3️⃣  HyDE（假设文档嵌入）                                  │
 * │     原始查询 → LLM 生成假设回答 → 用假设回答去检索          │
 * │     "HNSW" → "HNSW（Hierarchical Navigable Small World）  │
 * │      是一种高效的近似最近邻搜索算法..."                     │
 * │     → 用这段假设回答的向量去检索，比原始短查询更精准         │
 * └─────────────────────────────────────────────────────────┘
 */

import { PreRetrievalConfig, PreRetrievalStrategy, LLMFunction, EmbeddingConfig } from './types';
import { getEmbedding } from './embedding';

// ════════════════════════════════════════════════════════════
// Prompt Templates
// ════════════════════════════════════════════════════════════

function buildExpansionPrompt(query: string, maxTerms: number): string {
  return `你是一个搜索优化专家。请为以下查询生成 ${maxTerms} 个相关的扩展词/短语。
这些扩展词应该是查询主题的同义词、相关概念、技术术语等，能帮助在知识库中找到更多相关文档。

## 要求
1. 只输出扩展词，每行一个
2. 不要重复原始查询中已有的词
3. 优先输出最相关的词
4. 不要输出解释或其他内容

## 原始查询
${query}

## 扩展词（每行一个）：`;
}

function buildRewritePrompt(query: string, style: string): string {
  const styleGuide: Record<string, string> = {
    precise: '更精确、具体的表述，使用领域术语',
    broad: '更广泛、全面的表述，涵盖更多方面',
    technical: '更技术化、学术化的表述',
  };
  return `你是一个搜索优化专家。请将以下查询改写为${styleGuide[style] ?? styleGuide.precise}。

## 要求
1. 保持原始查询的核心意图
2. 只输出改写后的查询，不要输出其他内容
3. 改写后的查询应该更适合在知识库中进行语义检索

## 原始查询
${query}

## 改写后的查询：`;
}

function buildHyDEPrompt(query: string, length: string): string {
  const lengthGuide: Record<string, string> = {
    short: '用 2-3 句话',
    medium: '用 4-6 句话',
    long: '用 8-12 句话',
  };
  return `请为以下问题写一段${lengthGuide[length] ?? lengthGuide.medium}的回答。
这段回答应该像是从一篇专业文档中摘录的内容，包含相关的技术细节和关键概念。
即使你不确定准确答案，也请生成一段合理的假设性回答。

## 问题
${query}

## 回答：`;
}

// ════════════════════════════════════════════════════════════
// Pre-Retrieval Result
// ════════════════════════════════════════════════════════════

export interface PreRetrievalResult {
  /** 最终用于检索的查询文本 */
  optimizedQuery: string;
  /** 如果用了 HyDE，这是假设回答的 embedding（直接用于向量检索，跳过 query embedding） */
  hydeEmbedding?: number[];
  /** 优化过程的详细日志 */
  log: string[];
  /** 耗时 (ms) */
  timeMs: number;
  /** 使用的策略 */
  strategy: PreRetrievalStrategy;
}

// ════════════════════════════════════════════════════════════
// Main Function
// ════════════════════════════════════════════════════════════

/**
 * 执行检索前优化
 *
 * @param query - 原始用户查询
 * @param config - 检索前优化配置
 * @param llmFn - LLM 调用函数
 * @param embeddingConfig - Embedding 配置（HyDE 模式需要）
 * @returns 优化结果，包含优化后的查询和/或 HyDE embedding
 */
export async function optimizePreRetrieval(
  query: string,
  config: PreRetrievalConfig,
  llmFn: LLMFunction,
  embeddingConfig?: EmbeddingConfig,
): Promise<PreRetrievalResult> {
  const start = Date.now();
  const log: string[] = [];

  if (config.strategy === 'none') {
    return {
      optimizedQuery: query,
      log: ['⏭️ 跳过检索前优化（策略: none）'],
      timeMs: 0,
      strategy: 'none',
    };
  }

  log.push(`🔄 开始检索前优化 — 策略: ${config.strategy}`);
  log.push(`📝 原始查询: "${query}"`);

  try {
    switch (config.strategy) {
      case 'expansion': {
        const maxTerms = config.expansion?.maxTerms ?? 5;
        const includeOriginal = config.expansion?.includeOriginal ?? true;

        log.push(`🔍 查询扩展: 生成最多 ${maxTerms} 个扩展词...`);
        const prompt = buildExpansionPrompt(query, maxTerms);
        const response = await llmFn(prompt);

        // Parse expansion terms (one per line)
        const terms = response
          .split('\n')
          .map(l => l.replace(/^[\d\-\.\*•]+\s*/, '').trim())
          .filter(l => l.length > 0 && l.length < 100)
          .slice(0, maxTerms);

        log.push(`✅ 获得 ${terms.length} 个扩展词: ${terms.join(', ')}`);

        const optimized = includeOriginal
          ? `${query} ${terms.join(' ')}`
          : terms.join(' ');

        log.push(`📝 扩展后查询: "${optimized}"`);

        return {
          optimizedQuery: optimized,
          log,
          timeMs: Date.now() - start,
          strategy: 'expansion',
        };
      }

      case 'rewrite': {
        const style = config.rewrite?.style ?? 'precise';

        log.push(`✏️ 查询改写: 风格 = ${style}...`);
        const prompt = buildRewritePrompt(query, style);
        const response = await llmFn(prompt);

        const rewritten = response.trim().replace(/^["']|["']$/g, '');
        log.push(`✅ 改写后查询: "${rewritten}"`);

        return {
          optimizedQuery: rewritten,
          log,
          timeMs: Date.now() - start,
          strategy: 'rewrite',
        };
      }

      case 'hyde': {
        const length = config.hyde?.responseLength ?? 'medium';
        const numHypothetical = config.hyde?.numHypothetical ?? 1;

        if (!embeddingConfig) {
          throw new Error('HyDE 策略需要 embeddingConfig 参数');
        }

        log.push(`🧪 HyDE: 生成 ${numHypothetical} 个假设回答 (长度: ${length})...`);

        // Generate hypothetical documents
        const hypotheticals: string[] = [];
        for (let i = 0; i < numHypothetical; i++) {
          const prompt = buildHyDEPrompt(query, length);
          const response = await llmFn(prompt);
          hypotheticals.push(response.trim());
          log.push(`  假设回答 ${i + 1}: "${response.trim().slice(0, 100)}..."`);
        }

        // Embed hypothetical documents
        log.push('🔢 将假设回答向量化...');
        const embeddings: number[][] = [];
        for (const hyp of hypotheticals) {
          const emb = await getEmbedding(hyp, embeddingConfig);
          embeddings.push(emb);
        }

        // Average embeddings if multiple
        let finalEmbedding: number[];
        if (embeddings.length === 1) {
          finalEmbedding = embeddings[0];
        } else {
          const dim = embeddings[0].length;
          finalEmbedding = new Array(dim).fill(0);
          for (const emb of embeddings) {
            for (let i = 0; i < dim; i++) {
              finalEmbedding[i] += emb[i];
            }
          }
          for (let i = 0; i < dim; i++) {
            finalEmbedding[i] /= embeddings.length;
          }
          log.push(`✅ 已平均 ${embeddings.length} 个向量`);
        }

        log.push('✅ HyDE 向量生成完成');

        return {
          optimizedQuery: query, // 保留原始查询用于 BM25 等
          hydeEmbedding: finalEmbedding,
          log,
          timeMs: Date.now() - start,
          strategy: 'hyde',
        };
      }

      default:
        return {
          optimizedQuery: query,
          log: [`⚠️ 未知策略: ${config.strategy}，使用原始查询`],
          timeMs: Date.now() - start,
          strategy: config.strategy,
        };
    }
  } catch (err: any) {
    log.push(`❌ 检索前优化失败: ${err?.message ?? String(err)}`);
    log.push('⚠️ 回退使用原始查询');
    return {
      optimizedQuery: query,
      log,
      timeMs: Date.now() - start,
      strategy: config.strategy,
    };
  }
}
