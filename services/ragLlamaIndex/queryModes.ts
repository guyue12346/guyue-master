/**
 * RAG LlamaIndex Module — Advanced Query Modes
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：高级查询引擎模式（Advanced Query Engine Modes）
 * ═══════════════════════════════════════════════════════════
 *
 * 基础 RAG 是"单次检索"：query → retrieve → rerank → answer
 * 但实际问题往往更复杂，需要更精巧的查询策略：
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 1️⃣  条件路由（Router）                                  │
 * │     不同类型的问题应该查不同的知识库                       │
 * │     例："React怎么用?" → 代码库                           │
 * │         "公司政策是什么?" → 文档库                         │
 * │                                                         │
 * │     query ──→ [路由决策] ──→ Pipeline A ──→ results      │
 * │                   │                                      │
 * │                   └──→ Pipeline B ──→ results            │
 * ├─────────────────────────────────────────────────────────┤
 * │ 2️⃣  分支并行（SubQuestion）                              │
 * │     复杂问题分解为子问题并行检索                           │
 * │     例："对比React和Vue的状态管理"                         │
 * │         → 子问题1: "React状态管理"                        │
 * │         → 子问题2: "Vue状态管理"                          │
 * │                                                         │
 * │     query ──→ [LLM分解] ──→ sub-q1 ──→ results ──┐     │
 * │                    │                               │     │
 * │                    └──→ sub-q2 ──→ results ──→ merge     │
 * ├─────────────────────────────────────────────────────────┤
 * │ 3️⃣  循环迭代（Iterative）                                │
 * │     检索→评估→不够好？→ 改写查询再检索                     │
 * │     例：首次检索没找到好答案 → 自动扩展关键词/换个角度重试   │
 * │                                                         │
 * │     query ──→ retrieve ──→ 评估 ──→ 足够好? ──→ return   │
 * │                  ▲                     │                 │
 * │                  │        不够好        │                 │
 * │                  └── 改写查询 ◄────────┘                 │
 * └─────────────────────────────────────────────────────────┘
 *
 * 📚 为什么需要这些模式？
 * ───────────────────────
 * - Router: 企业场景下通常有多个知识库（代码、文档、FAQ），精准路由能大幅提升检索质量
 * - SubQuestion: 复杂的对比/综合类问题，单次检索很难覆盖所有方面
 * - Iterative: 模仿人类"搜不到就换个词再搜"的行为，自动提高召回率
 *
 * 📚 这三种模式参考了 LlamaIndex 的设计理念：
 * - RouterQueryEngine
 * - SubQuestionQueryEngine
 * - 以及 Self-Correcting RAG / CRAG 的迭代思想
 */

import { LLMFunction, EmbeddingConfig } from './types';
import { RagPipeline, QueryEngineConfig, QueryResult } from './queryEngine';
import { RetrievalResult } from './retrieval';
import { getEmbedding } from './embedding';

// ════════════════════════════════════════════════════════════
// Type Definitions — 查询模式配置
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：查询模式类型
 * ────────────────────────
 * - single:       默认的单次检索模式
 * - router:       条件路由，根据问题类型选择不同知识库
 * - sub-question: 子问题分解，将复杂问题拆成多个子问题并行检索
 * - iterative:    迭代优化，不断改写查询直到找到满意结果
 */
export type QueryMode = 'single' | 'router' | 'sub-question' | 'iterative' | 'custom';

// ── Router Mode（条件路由）──

/**
 * 📚 知识点：路由定义
 * ────────────────────
 * 每个路由代表一个"知识领域"，关联一个向量存储集合。
 * - description 给 LLM 看，帮助它判断哪个知识库最合适
 * - keywords 给关键词路由用，简单但快速
 * - collectionId 是实际检索时用的标识
 */
export interface RouteDefinition {
  id: string;
  name: string;
  description: string;
  keywords?: string[];
  collectionId?: string;
}

/**
 * 📚 知识点：路由方法对比
 * ────────────────────────
 * - llm:       最智能，让 LLM 阅读描述后选择（慢但准）
 * - keyword:   最快速，简单的关键词匹配（快但粗糙）
 * - embedding: 折中方案，用向量相似度比较查询和路由描述（中等速度和精度）
 */
export interface RouterConfig {
  routes: RouteDefinition[];
  defaultRoute?: string;
  routingMethod: 'llm' | 'keyword' | 'embedding';
}

// ── SubQuestion Mode（分支并行）──

/**
 * 📚 知识点：子问题分解配置
 * ──────────────────────────
 * maxSubQuestions: 最多分解为几个子问题，太多会浪费资源
 * mergeStrategy:
 *   - concatenate: 简单拼接，最快但可能有重复
 *   - deduplicate: 基于文本相似度去重
 *   - rerank: 合并后统一重排序，质量最高但最慢
 */
export interface SubQuestionConfig {
  maxSubQuestions: number;
  mergeStrategy: 'concatenate' | 'deduplicate' | 'rerank';
  deduplicateThreshold?: number;
}

// ── Iterative Mode（循环迭代）──

/**
 * 📚 知识点：迭代优化配置
 * ────────────────────────
 * 灵感来自 Self-Correcting RAG (CRAG) 论文：
 * 如果检索到的文档质量不够好，系统会自动尝试改进查询。
 *
 * refinementStrategy:
 *   - expand:    从已检索到的结果中提取高频词，扩展原始查询
 *   - rephrase:  让 LLM 用不同措辞重新表述查询
 *   - decompose: 让 LLM 把复杂查询简化为更基础的查询
 *
 * 📚 直觉理解：就像人搜索时的行为：
 *   搜"TypeScript泛型约束的高级用法" → 没结果
 *   → 换成"TypeScript generics constraints" → 有了！
 */
export interface IterativeConfig {
  maxIterations: number;
  qualityThreshold: number;
  refinementStrategy: 'expand' | 'rephrase' | 'decompose';
}

// ── Combined Config ──

export interface CustomQueryConfig {
  steps: Array<{ type: 'retrieve' | 'rewrite' | 'decompose' | 'filter' | 'rerank'; params?: Record<string, any> }>;
  description?: string;
}

export interface QueryModeConfig {
  mode: QueryMode;
  router?: RouterConfig;
  subQuestion?: SubQuestionConfig;
  iterative?: IterativeConfig;
  custom?: CustomQueryConfig;
}

// ════════════════════════════════════════════════════════════
// Router Query Engine（条件路由查询引擎）
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：路由查询上下文
 * ────────────────────────
 * pipelines: 每个 collectionId 对应一个已初始化的 RagPipeline
 * llmFn: LLM 路由和 embedding 路由都可能用到
 * embeddingConfig: embedding 路由需要将查询和描述向量化
 */
export interface RouterQueryContext {
  pipelines: Map<string, RagPipeline>;
  llmFn?: LLMFunction;
  embeddingConfig: EmbeddingConfig;
}

/**
 * 📚 条件路由查询
 * ──────────────────────────────────────────────────
 * 根据路由方法选择最匹配的知识库，然后用该知识库的 Pipeline 执行查询。
 *
 * 路由决策流程：
 *   query → [路由方法] → 选中的 routeId → pipelines.get(routeId) → pipeline.query(query)
 *
 * 三种路由方法：
 * 1. LLM 路由：把查询和所有路由描述发给 LLM，让它选
 * 2. 关键词路由：统计查询中命中了哪个路由的关键词最多
 * 3. Embedding 路由：计算查询与路由描述的向量余弦相似度
 */
export async function routerQuery(
  query: string,
  config: RouterConfig,
  context: RouterQueryContext,
  pipelineConfig: QueryEngineConfig,
): Promise<QueryResult> {
  const startTime = Date.now();

  // 📚 Step 1: 根据路由方法选出最佳路由
  let selectedRouteId: string;

  switch (config.routingMethod) {
    case 'llm':
      selectedRouteId = await routeByLLM(query, config, context.llmFn);
      break;
    case 'keyword':
      selectedRouteId = routeByKeyword(query, config);
      break;
    case 'embedding':
      selectedRouteId = await routeByEmbedding(query, config, context.embeddingConfig);
      break;
    default:
      selectedRouteId = config.defaultRoute || config.routes[0]?.id || '';
  }

  // 📚 Step 2: 如果选中的路由无效，降级到 defaultRoute
  const selectedRoute = config.routes.find(r => r.id === selectedRouteId);
  const collectionId = selectedRoute?.collectionId || selectedRouteId;
  const pipeline = context.pipelines.get(collectionId);

  if (!pipeline) {
    // 降级：尝试 defaultRoute，再不行就用第一个可用的 pipeline
    const fallbackId = config.defaultRoute || '';
    const fallbackPipeline = context.pipelines.get(fallbackId)
      || context.pipelines.values().next().value;

    if (!fallbackPipeline) {
      return createEmptyResult(query, 'router', Date.now() - startTime, {
        routingMethod: config.routingMethod,
        selectedRoute: selectedRouteId,
        error: 'No pipeline available',
      });
    }

    const result = await fallbackPipeline.query(query);
    return addModeMetadata(result, 'router', Date.now() - startTime, {
      routingMethod: config.routingMethod,
      selectedRoute: selectedRouteId,
      fallback: true,
    });
  }

  // 📚 Step 3: 用选中的 pipeline 执行查询
  const result = await pipeline.query(query);
  return addModeMetadata(result, 'router', Date.now() - startTime, {
    routingMethod: config.routingMethod,
    selectedRoute: selectedRouteId,
    selectedRouteName: selectedRoute?.name,
    collectionId,
  });
}

// ── 路由方法实现 ──

/**
 * 📚 LLM 路由
 * ──────────────
 * 将路由描述和查询一起发给 LLM，让它选择最合适的知识库。
 * 这是最智能的方法，但也最慢（需要一次 LLM 调用）。
 */
async function routeByLLM(
  query: string,
  config: RouterConfig,
  llmFn?: LLMFunction,
): Promise<string> {
  if (!llmFn) {
    // 没有 LLM 函数时降级为关键词路由
    return routeByKeyword(query, config);
  }

  const routeDescriptions = config.routes
    .map(r => `${r.id}: ${r.name} - ${r.description}`)
    .join('\n');

  const prompt = `你是一个查询路由器。根据用户的问题，选择最合适的知识库。
可用知识库：
${routeDescriptions}

用户问题：${query}

请只回复最合适的知识库ID，不要其他内容。`;

  const response = await llmFn(prompt);
  const routeId = response.trim();

  // 验证 LLM 返回的 ID 是否有效
  const validRoute = config.routes.find(r => r.id === routeId);
  if (validRoute) {
    return validRoute.id;
  }

  // 📚 LLM 可能返回了不完全匹配的内容，尝试模糊匹配
  const fuzzyMatch = config.routes.find(r =>
    response.toLowerCase().includes(r.id.toLowerCase()),
  );
  if (fuzzyMatch) {
    return fuzzyMatch.id;
  }

  // 最终降级到 defaultRoute
  return config.defaultRoute || config.routes[0]?.id || '';
}

/**
 * 📚 关键词路由
 * ──────────────
 * 最简单的路由方法：统计查询中命中了每个路由的多少个关键词。
 * 命中最多的就是最佳路由。
 *
 * 优点：零延迟、零成本
 * 缺点：容易误判，不理解语义
 */
function routeByKeyword(query: string, config: RouterConfig): string {
  const queryLower = query.toLowerCase();
  let bestRouteId = config.defaultRoute || config.routes[0]?.id || '';
  let bestScore = 0;

  for (const route of config.routes) {
    if (!route.keywords || route.keywords.length === 0) continue;

    // 统计命中的关键词数量
    const hitCount = route.keywords.reduce((count, keyword) => {
      return count + (queryLower.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    if (hitCount > bestScore) {
      bestScore = hitCount;
      bestRouteId = route.id;
    }
  }

  return bestRouteId;
}

/**
 * 📚 Embedding 路由
 * ──────────────────
 * 将查询和每个路由的描述都转为向量，选择余弦相似度最高的路由。
 *
 * 比关键词路由更智能（理解语义），比 LLM 路由更快（不需要生成文本）。
 * 是推荐的折中方案。
 */
async function routeByEmbedding(
  query: string,
  config: RouterConfig,
  embeddingConfig: EmbeddingConfig,
): Promise<string> {
  const queryEmbedding = await getEmbedding(query, embeddingConfig);

  let bestRouteId = config.defaultRoute || config.routes[0]?.id || '';
  let bestSimilarity = -1;

  for (const route of config.routes) {
    const descEmbedding = await getEmbedding(
      `${route.name}: ${route.description}`,
      embeddingConfig,
    );
    const similarity = cosineSimilarity(queryEmbedding, descEmbedding);

    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestRouteId = route.id;
    }
  }

  return bestRouteId;
}

// ════════════════════════════════════════════════════════════
// SubQuestion Query Engine（分支并行查询引擎）
// ════════════════════════════════════════════════════════════

/**
 * 📚 子问题分解查询
 * ──────────────────────────────────────────────────
 * 核心思想：把一个复杂的大问题拆成几个简单的小问题，
 * 分别检索后再合并结果。
 *
 * 流程：
 *   "对比 React 和 Vue 的状态管理"
 *     ↓ LLM 分解
 *   ["React的状态管理方案有哪些?", "Vue的状态管理方案有哪些?"]
 *     ↓ 并行检索（Promise.all）
 *   [results1, results2]
 *     ↓ 合并策略
 *   merged results
 *
 * 📚 为什么要并行？
 * ─────────────────
 * 子问题之间是独立的，串行检索浪费时间。
 * Promise.all 可以同时发出所有检索请求，总耗时 ≈ 最慢的那个子问题。
 */
export async function subQuestionQuery(
  query: string,
  config: SubQuestionConfig,
  pipeline: RagPipeline,
  llmFn: LLMFunction,
  pipelineConfig: QueryEngineConfig,
): Promise<QueryResult> {
  const startTime = Date.now();

  // 📚 Step 1: 用 LLM 分解子问题
  const maxSub = config.maxSubQuestions || 3;
  const subQuestions = await decomposeToSubQuestions(query, maxSub, llmFn);

  if (subQuestions.length === 0) {
    // 分解失败，降级为单次查询
    const result = await pipeline.query(query);
    return addModeMetadata(result, 'sub-question', Date.now() - startTime, {
      subQuestions: [],
      fallbackToSingle: true,
    });
  }

  // 📚 Step 2: 并行检索所有子问题
  const subResults = await Promise.all(
    subQuestions.map(sq => pipeline.query(sq)),
  );

  // 📚 Step 3: 合并结果
  const allResults = subResults.flatMap(r => r.results);
  let mergedResults: RetrievalResult[];

  switch (config.mergeStrategy) {
    case 'deduplicate':
      mergedResults = deduplicateResults(
        allResults,
        config.deduplicateThreshold ?? 0.9,
      );
      break;
    case 'rerank':
      // 合并后按原始 score 降序排列（模拟重排序效果）
      mergedResults = deduplicateResults(allResults, 0.9);
      mergedResults.sort((a, b) => b.score - a.score);
      mergedResults = mergedResults.slice(0, pipelineConfig.reranker.topN || 5);
      break;
    case 'concatenate':
    default:
      mergedResults = allResults;
      break;
  }

  // 📚 Step 4: 合并知识图谱三元组
  const allTriples = subResults
    .flatMap(r => r.relatedTriples || []);

  const totalRetrieved = subResults.reduce(
    (sum, r) => sum + r.metadata.totalRetrieved, 0,
  );

  return {
    results: mergedResults,
    metadata: {
      query,
      strategy: `sub-question(${config.mergeStrategy})`,
      totalRetrieved,
      totalAfterRerank: mergedResults.length,
      retrievalTimeMs: subResults.reduce((sum, r) => Math.max(sum, r.metadata.retrievalTimeMs), 0),
      rerankTimeMs: subResults.reduce((sum, r) => sum + r.metadata.rerankTimeMs, 0),
      totalTimeMs: Date.now() - startTime,
      // 附加：子问题信息（通过类型扩展传递）
      ...({ subQuestions, subResultCounts: subResults.map(r => r.results.length) } as Record<string, unknown>),
    },
    relatedTriples: allTriples.length > 0 ? allTriples : undefined,
  };
}

/**
 * 📚 子问题分解
 * ──────────────
 * 让 LLM 把一个复杂问题拆成多个独立的子问题。
 * 每个子问题应该能独立检索到有用信息。
 */
async function decomposeToSubQuestions(
  query: string,
  maxSubQuestions: number,
  llmFn: LLMFunction,
): Promise<string[]> {
  const prompt = `将以下复杂问题分解为${maxSubQuestions}个独立的子问题，每个子问题应该可以独立检索到有用信息。
只输出子问题，每行一个，不要编号或其他格式。

原始问题：${query}`;

  const response = await llmFn(prompt);

  // 解析：每行一个子问题，过滤空行
  const subQuestions = response
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    // 去除可能的编号前缀（如 "1. ", "- " 等）
    .map(line => line.replace(/^[\d]+[.、)]\s*/, '').replace(/^[-*]\s*/, ''))
    .filter(line => line.length > 0)
    .slice(0, maxSubQuestions);

  return subQuestions;
}

// ════════════════════════════════════════════════════════════
// Iterative Query Engine（循环迭代查询引擎）
// ════════════════════════════════════════════════════════════

/**
 * 📚 迭代优化查询
 * ──────────────────────────────────────────────────
 * 核心思想：如果第一次检索的结果质量不够好，就自动改写查询再试。
 * 模仿人类的搜索行为——搜不到就换个词。
 *
 * 流程：
 *   iteration 0: query → retrieve → score < threshold?
 *     ↓ yes
 *   iteration 1: refine(query) → retrieve → score < threshold?
 *     ↓ yes
 *   iteration 2: refine(query) → retrieve → score < threshold?
 *     ↓ no (或达到 maxIterations)
 *   return best results
 *
 * 📚 与 Self-Correcting RAG (CRAG) 的关系：
 * ──────────────────────────────────────────
 * CRAG 论文提出：检索后先评估文档质量，
 * 如果"不相关"则触发网络搜索，
 * 如果"模糊"则改写查询重新检索。
 * 我们这里简化了评估逻辑，用 score 阈值代替 LLM 评估。
 */
export async function iterativeQuery(
  query: string,
  config: IterativeConfig,
  pipeline: RagPipeline,
  llmFn: LLMFunction,
  pipelineConfig: QueryEngineConfig,
): Promise<QueryResult> {
  const startTime = Date.now();
  const maxIter = config.maxIterations || 3;
  const threshold = config.qualityThreshold ?? 0.7;

  // 📚 收集所有迭代的信息
  const iterations: Array<{
    query: string;
    bestScore: number;
    resultCount: number;
  }> = [];
  let allResults: RetrievalResult[] = [];
  let currentQuery = query;
  let bestScore = 0;

  for (let i = 0; i < maxIter; i++) {
    // 📚 执行当前查询
    const result = await pipeline.query(currentQuery);

    const iterBestScore = result.results.length > 0
      ? Math.max(...result.results.map(r => r.score))
      : 0;

    iterations.push({
      query: currentQuery,
      bestScore: iterBestScore,
      resultCount: result.results.length,
    });

    // 合并结果（保留所有迭代的结果）
    allResults = mergeIterationResults(allResults, result.results);
    bestScore = allResults.length > 0
      ? Math.max(...allResults.map(r => r.score))
      : 0;

    // 📚 检查是否满足质量阈值
    if (bestScore >= threshold) {
      break;
    }

    // 📚 最后一次迭代不需要再 refine
    if (i >= maxIter - 1) {
      break;
    }

    // 📚 根据策略改写查询
    currentQuery = await refineQuery(
      query,
      currentQuery,
      result.results,
      config.refinementStrategy,
      llmFn,
    );
  }

  // 📚 最终结果：按 score 降序，取 topN
  allResults.sort((a, b) => b.score - a.score);
  const topN = pipelineConfig.reranker.topN || 5;
  const finalResults = allResults.slice(0, topN);

  return {
    results: finalResults,
    metadata: {
      query,
      strategy: `iterative(${config.refinementStrategy})`,
      totalRetrieved: allResults.length,
      totalAfterRerank: finalResults.length,
      retrievalTimeMs: 0,
      rerankTimeMs: 0,
      totalTimeMs: Date.now() - startTime,
      ...({
        iterations,
        iterationCount: iterations.length,
        finalBestScore: bestScore,
        metThreshold: bestScore >= threshold,
      } as Record<string, unknown>),
    },
  };
}

// ── 查询改写策略 ──

/**
 * 📚 查询改写
 * ──────────────
 * 三种策略：
 * - expand:    从已有结果中提取高频词，追加到查询中
 * - rephrase:  让 LLM 用不同措辞重新表述
 * - decompose: 让 LLM 简化查询
 */
async function refineQuery(
  originalQuery: string,
  currentQuery: string,
  results: RetrievalResult[],
  strategy: IterativeConfig['refinementStrategy'],
  llmFn: LLMFunction,
): Promise<string> {
  switch (strategy) {
    case 'expand':
      return expandQuery(currentQuery, results);
    case 'rephrase':
      return rephraseQuery(currentQuery, results, llmFn);
    case 'decompose':
      return decomposeQuery(currentQuery, llmFn);
    default:
      return currentQuery;
  }
}

/**
 * 📚 扩展策略
 * ──────────────
 * 从已检索到的 top 结果中提取高频非停用词，追加到查询后面。
 * 这类似于"伪相关反馈"（Pseudo Relevance Feedback, PRF）技术。
 */
function expandQuery(query: string, results: RetrievalResult[]): string {
  if (results.length === 0) return query;

  // 取 top 3 结果的文本
  const topTexts = results.slice(0, 3).map(r => r.text).join(' ');

  // 📚 简单的停用词列表（中英文混合）
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
    'and', 'or', 'not', 'no', 'but', 'if', 'then', 'so', 'as',
    'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she',
    '的', '了', '在', '是', '我', '有', '和', '就',
    '不', '人', '都', '一', '一个', '上', '也', '很',
    '到', '说', '要', '去', '你', '会', '着', '没有',
    '看', '好', '自己', '这',
  ]);

  // 统计词频
  const words = topTexts
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、]+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  const freq = new Map<string, number>();
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  // 取 top 3 高频词，排除已在查询中出现的
  const queryLower = query.toLowerCase();
  const expansionTerms = [...freq.entries()]
    .filter(([word]) => !queryLower.includes(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  if (expansionTerms.length === 0) return query;

  return `${query} ${expansionTerms.join(' ')}`;
}

/**
 * 📚 重述策略
 * ──────────────
 * 让 LLM 用不同的措辞重新表述查询，保持原意但使用不同关键词。
 * 当原始查询的措辞与知识库中的文档措辞不匹配时特别有效。
 */
async function rephraseQuery(
  query: string,
  results: RetrievalResult[],
  llmFn: LLMFunction,
): Promise<string> {
  const topSnippet = results.length > 0
    ? results[0].text.slice(0, 200)
    : '（无结果）';

  const prompt = `以下查询没有找到足够相关的结果。请用不同的措辞重新表述这个问题，保持原意但使用不同的关键词。
原始查询：${query}
当前最佳结果摘要：${topSnippet}
只输出重新表述后的查询，不要其他内容。`;

  const response = await llmFn(prompt);
  return response.trim() || query;
}

/**
 * 📚 简化策略
 * ──────────────
 * 让 LLM 把复杂查询简化为更基础的形式。
 * 当原始查询太具体或太长时，简化后的查询往往能匹配到更多文档。
 */
async function decomposeQuery(
  query: string,
  llmFn: LLMFunction,
): Promise<string> {
  const prompt = `以下查询太复杂，检索效果不好。请简化为一个更基础的查询。
原始查询：${query}
只输出简化后的查询，不要其他内容。`;

  const response = await llmFn(prompt);
  return response.trim() || query;
}

// ════════════════════════════════════════════════════════════
// Unified Dispatcher（统一调度入口）
// ════════════════════════════════════════════════════════════

/**
 * 📚 统一查询模式调度器
 * ──────────────────────
 * 根据 modeConfig.mode 分发到不同的查询引擎：
 *
 *   mode='single'       → pipeline.query()
 *   mode='router'       → routerQuery()
 *   mode='sub-question' → subQuestionQuery()
 *   mode='iterative'    → iterativeQuery()
 *
 * 📚 设计理念：策略模式（Strategy Pattern）
 * ─────────────────────────────────────────
 * 调用方只需要传入不同的配置，不需要知道内部实现。
 * 这让 RAG Lab 可以通过 UI 切换查询模式进行对比实验。
 */
export async function executeQueryMode(
  query: string,
  modeConfig: QueryModeConfig,
  context: {
    pipeline: RagPipeline;
    pipelines?: Map<string, RagPipeline>;
    llmFn?: LLMFunction;
    pipelineConfig: QueryEngineConfig;
    hydeEmbedding?: number[];
  },
): Promise<QueryResult> {
  switch (modeConfig.mode) {
    case 'router': {
      if (!modeConfig.router) {
        throw new Error('RouterConfig is required for router mode');
      }
      if (!context.pipelines) {
        throw new Error('Multiple pipelines are required for router mode');
      }
      return routerQuery(
        query,
        modeConfig.router,
        {
          pipelines: context.pipelines,
          llmFn: context.llmFn,
          embeddingConfig: context.pipelineConfig.embeddingConfig,
        },
        context.pipelineConfig,
      );
    }

    case 'sub-question': {
      if (!modeConfig.subQuestion) {
        throw new Error('SubQuestionConfig is required for sub-question mode');
      }
      if (!context.llmFn) {
        throw new Error('LLM function is required for sub-question mode');
      }
      return subQuestionQuery(
        query,
        modeConfig.subQuestion,
        context.pipeline,
        context.llmFn,
        context.pipelineConfig,
      );
    }

    case 'iterative': {
      if (!modeConfig.iterative) {
        throw new Error('IterativeConfig is required for iterative mode');
      }
      if (!context.llmFn) {
        throw new Error('LLM function is required for iterative mode');
      }
      return iterativeQuery(
        query,
        modeConfig.iterative,
        context.pipeline,
        context.llmFn,
        context.pipelineConfig,
      );
    }

    case 'custom': {
      // Custom mode: execute a user-defined pipeline of steps
      // For now, custom mode runs sub-steps sequentially; falls back to single if no config
      const steps = modeConfig.custom?.steps;
      if (!steps || steps.length === 0) {
        return context.pipeline.query(query, context.hydeEmbedding);
      }
      let currentQuery = query;
      let result: QueryResult | null = null;
      for (const step of steps) {
        switch (step.type) {
          case 'rewrite':
            if (context.llmFn) {
              const rewritten = await context.llmFn(
                `请改写以下查询以提高检索效果，只返回改写后的查询，不要解释：\n${currentQuery}`,
              );
              currentQuery = rewritten.trim() || currentQuery;
            }
            break;
          case 'decompose':
            if (context.llmFn) {
              const decomposed = await context.llmFn(
                `将以下查询分解为更简单的子查询，每行一个，只返回子查询：\n${currentQuery}`,
              );
              const subQueries = decomposed.split('\n').map(s => s.trim()).filter(Boolean);
              if (subQueries.length > 0) currentQuery = subQueries[0];
            }
            break;
          case 'retrieve':
          case 'filter':
          case 'rerank':
            result = await context.pipeline.query(currentQuery, context.hydeEmbedding);
            break;
        }
      }
      return result ?? context.pipeline.query(currentQuery, context.hydeEmbedding);
    }

    case 'single':
    default:
      return context.pipeline.query(query, context.hydeEmbedding);
  }
}

// ════════════════════════════════════════════════════════════
// Utility Functions（工具函数）
// ════════════════════════════════════════════════════════════

/**
 * 📚 余弦相似度
 * ──────────────
 * cos(A, B) = (A · B) / (|A| × |B|)
 * 结果范围 [-1, 1]，1 表示方向完全相同，0 表示正交。
 * 在 NLP 中通常 > 0.8 表示高度相似。
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 📚 Jaccard 相似度（用于文本去重）
 * ──────────────────────────────────
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * 其中 A、B 是两段文本的词集合。
 * 结果范围 [0, 1]，1 表示词集合完全相同。
 *
 * 📚 为什么用 Jaccard 而不是余弦相似度？
 * 因为这里只需要判断"是否是同一段文本的变体"，
 * 不需要语义理解，Jaccard 足够且计算更快。
 */
function jaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 0));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 0));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 📚 结果去重
 * ──────────────
 * 基于 Jaccard 相似度，如果两个结果的文本过于相似（超过阈值），
 * 只保留 score 更高的那个。
 */
function deduplicateResults(
  results: RetrievalResult[],
  threshold: number,
): RetrievalResult[] {
  if (results.length === 0) return [];

  const deduplicated: RetrievalResult[] = [results[0]];

  for (let i = 1; i < results.length; i++) {
    const candidate = results[i];
    let isDuplicate = false;

    for (const existing of deduplicated) {
      if (jaccardSimilarity(candidate.text, existing.text) >= threshold) {
        isDuplicate = true;
        // 如果候选结果 score 更高，替换已有结果
        if (candidate.score > existing.score) {
          const idx = deduplicated.indexOf(existing);
          deduplicated[idx] = candidate;
        }
        break;
      }
    }

    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  }

  return deduplicated;
}

/**
 * 📚 迭代结果合并
 * ────────────────
 * 将新一轮迭代的结果与已有结果合并，基于 nodeId 去重。
 * 如果同一个 node 在多次迭代中被检索到，保留 score 更高的版本。
 */
function mergeIterationResults(
  existing: RetrievalResult[],
  newResults: RetrievalResult[],
): RetrievalResult[] {
  const merged = new Map<string, RetrievalResult>();

  // 先加入已有结果
  for (const result of existing) {
    const key = result.nodeId || result.text.slice(0, 100);
    const current = merged.get(key);
    if (!current || result.score > current.score) {
      merged.set(key, result);
    }
  }

  // 加入新结果
  for (const result of newResults) {
    const key = result.nodeId || result.text.slice(0, 100);
    const current = merged.get(key);
    if (!current || result.score > current.score) {
      merged.set(key, result);
    }
  }

  return [...merged.values()];
}

/**
 * 创建空结果（用于错误降级场景）
 */
function createEmptyResult(
  query: string,
  mode: string,
  totalTimeMs: number,
  extra: Record<string, unknown>,
): QueryResult {
  return {
    results: [],
    metadata: {
      query,
      strategy: mode,
      totalRetrieved: 0,
      totalAfterRerank: 0,
      retrievalTimeMs: 0,
      rerankTimeMs: 0,
      totalTimeMs,
      ...extra as Record<string, unknown>,
    },
  };
}

/**
 * 在已有 QueryResult 上附加查询模式的元数据
 */
function addModeMetadata(
  result: QueryResult,
  mode: string,
  totalTimeMs: number,
  extra: Record<string, unknown>,
): QueryResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      strategy: `${mode}(${result.metadata.strategy})`,
      totalTimeMs,
      ...extra as Record<string, unknown>,
    },
  };
}
