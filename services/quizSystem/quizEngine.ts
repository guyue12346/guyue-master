/**
 * Quiz System — 出题引擎
 *
 * 基于向量库搜索API的出题管线：
 * 标签优先级 → 搜索向量库 → LLM生成 → 去重 → 追问
 */

import type {
  QuizQuestion, QuestionType, LLMFunction,
  TagMastery, SessionConfig, VectorStoreRole, StoreContext,
} from './types';
import { buildQuestionPrompt, buildFollowUpPrompt, buildSessionSummaryPrompt } from './prompts';
import type { PromptChunk, StudentProfile, StorePromptContext, GenerationPhase, HistoryExample } from './prompts';
import { calculateQuestionPriorities, createTagMastery } from './scheduler';
import { loadMastery, saveMastery, loadQuestionCache, addCachedQuestion } from './storageService';
import { getEmbedding } from '../ragLlamaIndex/embedding';
import type { EmbeddingConfig, SearchResult } from '../ragLlamaIndex';

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

function generateId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseJSON<T>(text: string): T | null {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch { return null; }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

/** 去重：合并多次搜索结果，按 nodeId 去重 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    if (seen.has(r.nodeId)) return false;
    seen.add(r.nodeId);
    return true;
  });
}

// ═══════════════════════════════════════════════════════
// 向量库搜索策略
// ═══════════════════════════════════════════════════════

interface TextChunk {
  id: string;
  text: string;
  metadata?: Record<string, any>;
  sourceStoreId?: string;
}

function searchResultToChunk(r: SearchResult, storeId: string): TextChunk {
  return { id: r.nodeId, text: r.text, metadata: r.metadata, sourceStoreId: storeId };
}

/** 搜索策略：用查询文本在多个向量库中搜索，合并去重 */
async function searchStores(
  storeContexts: StoreContext[],
  query: string,
  topK: number = 5,
): Promise<TextChunk[]> {
  const allResults: SearchResult[] = [];
  for (const ctx of storeContexts) {
    try {
      const results = await ctx.store.search(query, ctx.embeddingConfig, { topK });
      allResults.push(...results);
    } catch (err) {
      console.warn(`[QuizEngine] search failed for store ${ctx.name}:`, err);
    }
  }
  return deduplicateResults(allResults)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => searchResultToChunk(r, storeContexts[0]?.storeId || ''));
}

/** 根据标签历史题目搜索相关向量块 */
async function searchForTag(
  tag: string,
  storeContexts: StoreContext[],
  questionCache: QuizQuestion[],
): Promise<TextChunk[]> {
  // 用该标签下最近的题目文本作为搜索query（更精准）
  const tagQuestions = questionCache
    .filter(q => q.tags.includes(tag))
    .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));

  const queries: string[] = [];
  if (tagQuestions.length > 0) {
    // 用最近2道题目的文本
    queries.push(...tagQuestions.slice(0, 2).map(q => q.question));
  }
  // 兜底：直接用标签名搜索
  if (queries.length === 0) {
    queries.push(tag);
  }

  const allChunks: TextChunk[] = [];
  for (const query of queries) {
    const chunks = await searchStores(storeContexts, query, 5);
    allChunks.push(...chunks);
  }

  // 去重
  const seen = new Set<string>();
  return allChunks.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/** 根据主题词搜索新知识向量块 */
async function searchForNewTopic(
  topic: string,
  storeContexts: StoreContext[],
): Promise<TextChunk[]> {
  return searchStores(storeContexts, topic, 5);
}

// ═══════════════════════════════════════════════════════
// 主题词-标签 语义匹配（embedding级别）
// ═══════════════════════════════════════════════════════

/** 计算主题词是否已被现有标签覆盖 (embedding相似度) */
async function isTopicCoveredByTags(
  topic: string,
  existingTags: string[],
  embeddingConfig: EmbeddingConfig,
  threshold: number = 0.75,
): Promise<boolean> {
  if (existingTags.length === 0) return false;
  try {
    const topicEmb = await getEmbedding(topic, embeddingConfig);
    for (const tag of existingTags) {
      const tagEmb = await getEmbedding(tag, embeddingConfig);
      const sim = cosineSimilarity(topicEmb, tagEmb);
      if (sim >= threshold) return true;
    }
  } catch {
    // Fallback: 字符串包含
    const topicLower = topic.toLowerCase();
    for (const tag of existingTags) {
      const tagLower = tag.toLowerCase();
      if (topicLower.includes(tagLower) || tagLower.includes(topicLower)) return true;
    }
  }
  return false;
}

/** 批量筛选未覆盖的主题词 */
async function findUncoveredTopics(
  allTopics: string[],
  existingTags: string[],
  embeddingConfig: EmbeddingConfig,
): Promise<string[]> {
  if (existingTags.length === 0) return allTopics;

  // 批量计算embedding以减少API调用
  const uncovered: string[] = [];
  try {
    const tagEmbeddings: number[][] = [];
    for (const tag of existingTags) {
      tagEmbeddings.push(await getEmbedding(tag, embeddingConfig));
    }

    for (const topic of allTopics) {
      const topicEmb = await getEmbedding(topic, embeddingConfig);
      const maxSim = Math.max(...tagEmbeddings.map(te => cosineSimilarity(topicEmb, te)));
      if (maxSim < 0.75) {
        uncovered.push(topic);
      }
    }
  } catch {
    // Fallback: 字符串匹配
    for (const topic of allTopics) {
      const topicLower = topic.toLowerCase();
      const covered = existingTags.some(tag => {
        const tagLower = tag.toLowerCase();
        return topicLower.includes(tagLower) || tagLower.includes(topicLower);
      });
      if (!covered) uncovered.push(topic);
    }
  }
  return uncovered;
}

// ═══════════════════════════════════════════════════════
// Question Generation
// ═══════════════════════════════════════════════════════

/** 生成单道题目（使用动态 prompt） */
export async function generateQuestion(
  chunks: TextChunk[],
  questionType: QuestionType,
  difficulty: number,
  llmFn: LLMFunction,
  phase: GenerationPhase,
  options?: {
    storeContexts?: StoreContext[];
    allTags?: TagMastery[];
    rolePrompt?: string;
    quizDirection?: string;
    existingQuestions?: string[];
    studentProfile?: StudentProfile;
    historyExamples?: HistoryExample[];
    targetTag?: string;
    targetTopic?: string;
  },
): Promise<QuizQuestion> {
  // Build StorePromptContext[] from chunks grouped by store
  const storeGroups = new Map<string, { ctx?: StoreContext; chunks: PromptChunk[] }>();
  for (const chunk of chunks) {
    const storeId = chunk.sourceStoreId || '_default';
    if (!storeGroups.has(storeId)) {
      const ctx = options?.storeContexts?.find(c => c.storeId === storeId);
      storeGroups.set(storeId, { ctx, chunks: [] });
    }
    // Build enriched PromptChunk
    const chunkText = chunk.text.toLowerCase();
    const relatedTags = (options?.allTags || [])
      .filter(t => chunkText.includes(t.tag.toLowerCase()))
      .slice(0, 5)
      .map(t => ({
        tag: t.tag,
        masteryLevel: t.masteryLevel,
        avgScore: t.avgScore,
        totalAttempts: t.totalAttempts,
        lastReviewAt: t.lastReviewAt,
      }));

    storeGroups.get(storeId)!.chunks.push({
      text: chunk.text,
      chunkId: chunk.id,
      role: storeGroups.get(storeId)?.ctx?.role,
      storeName: chunk.metadata?.fileName || storeGroups.get(storeId)?.ctx?.name,
      metadata: chunk.metadata,
      relatedTags: relatedTags.length > 0 ? relatedTags : undefined,
    });
  }

  const storePromptContexts: StorePromptContext[] = Array.from(storeGroups.entries()).map(([, group]) => ({
    name: group.ctx?.name || '未知向量库',
    role: group.ctx?.role,
    summary: undefined, // summary from collection meta - could be passed via StoreContext
    topicVocabulary: group.ctx?.topicVocabulary,
    chunks: group.chunks,
  }));

  const prompt = buildQuestionPrompt(
    storePromptContexts,
    questionType,
    difficulty,
    phase,
    {
      rolePrompt: options?.rolePrompt,
      quizDirection: options?.quizDirection,
      existingQuestions: options?.existingQuestions,
      studentProfile: options?.studentProfile,
      historyExamples: options?.historyExamples,
      targetTag: options?.targetTag,
      targetTopic: options?.targetTopic,
    },
  );

  const response = await llmFn(prompt);
  const parsed = parseJSON<any>(response);

  if (!parsed?.question) {
    throw new Error('题目生成失败：LLM 返回格式错误');
  }

  return {
    id: generateId(),
    question: parsed.question,
    type: parsed.type || questionType,
    difficulty: parsed.difficulty || difficulty,
    referenceAnswer: parsed.referenceAnswer || '',
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    sourceChunkIds: chunks.map(c => c.id),
    createdAt: Date.now(),
    usedCount: 0,
  };
}

/** 题目去重（embedding 相似度） */
export async function isDuplicate(
  newQuestionText: string,
  existingQuestions: QuizQuestion[],
  embeddingConfig: EmbeddingConfig,
  threshold: number = 0.92,
): Promise<boolean> {
  if (existingQuestions.length === 0) return false;
  try {
    const newEmb = await getEmbedding(newQuestionText, embeddingConfig);
    for (const q of existingQuestions) {
      if (q.embedding) {
        const sim = cosineSimilarity(newEmb, q.embedding);
        if (sim > threshold) return true;
      }
    }
  } catch {}
  return false;
}

/** 生成追问 */
export async function generateFollowUp(
  prevQuestion: QuizQuestion,
  userAnswer: string,
  score: number,
  hitPoints: string[],
  missedPoints: string[],
  errors: string[],
  llmFn: LLMFunction,
): Promise<QuizQuestion> {
  const response = await llmFn(buildFollowUpPrompt(
    prevQuestion.question, userAnswer, score, hitPoints, missedPoints, errors,
  ));
  const parsed = parseJSON<any>(response);
  if (!parsed?.question) throw new Error('追问生成失败');

  return {
    id: generateId(),
    question: parsed.question,
    type: 'follow_up',
    difficulty: parsed.difficulty || Math.min(prevQuestion.difficulty + 1, 5),
    referenceAnswer: parsed.referenceAnswer || '',
    keyPoints: parsed.keyPoints || [],
    tags: parsed.tags || prevQuestion.tags,
    sourceChunkIds: prevQuestion.sourceChunkIds,
    createdAt: Date.now(),
    usedCount: 0,
  };
}

// ═══════════════════════════════════════════════════════
// Session Plan — 基于搜索的出题管线
// ═══════════════════════════════════════════════════════

export interface SessionPlan {
  questions: QuizQuestion[];
  composition: {
    review: number;
    weakPoint: number;
    newKnowledge: number;
    random: number;
  };
}

/** 构建一个 session 的出题计划（搜索API版本） */
export async function buildSessionPlan(
  storeContexts: StoreContext[],
  llmFn: LLMFunction,
  embeddingConfig: EmbeddingConfig,
  config: SessionConfig = {
    totalQuestions: 10,
    reviewRatio: 0.4,
    weakPointRatio: 0.3,
    newKnowledgeRatio: 0.2,
    randomReviewRatio: 0.1,
  },
  questionTypes: QuestionType[] = ['concept', 'comparison', 'scenario'],
  difficulty: number = 3,
  topicHint?: string,
  quizDirection?: string,
  onProgress?: (done: number, total: number, status: string) => void,
  storeRoles?: Record<string, VectorStoreRole[]>,
  categoryId?: string,
): Promise<SessionPlan> {
  const total = config.totalQuestions;
  const reviewCount = Math.round(total * config.reviewRatio);
  const weakCount = Math.round(total * config.weakPointRatio);
  const newCount = Math.round(total * config.newKnowledgeRatio);
  const randomCount = Math.max(0, total - reviewCount - weakCount - newCount);

  // Load mastery data (now TagMastery)
  const mastery = await loadMastery(categoryId);
  const allTags = Object.values(mastery);
  const priorities = calculateQuestionPriorities(allTags);

  // Build student profile
  const weakMastery = allTags.filter(t => t.masteryLevel === 'not_mastered' || t.masteryLevel === 'partially');
  const studentProfile: StudentProfile | undefined = allTags.length > 0 ? {
    overallMastery: Math.round(allTags.reduce((sum, t) => sum + t.avgScore, 0) / allTags.length),
    weakTags: weakMastery.map(t => t.tag).slice(0, 5),
    strongTags: allTags.filter(t => t.masteryLevel === 'mastered' || t.masteryLevel === 'expert')
      .map(t => t.tag).slice(0, 5),
    recentAvgScore: Math.round(allTags.slice(0, 10).reduce((sum, t) => sum + t.avgScore, 0) / Math.min(allTags.length, 10)),
    totalAttempts: allTags.reduce((sum, t) => sum + t.totalAttempts, 0),
  } : undefined;

  // Load question cache for search queries
  const questionCache = await loadQuestionCache();

  // Collect all topic vocabularies from store contexts
  const allTopics = storeContexts.flatMap(ctx => ctx.topicVocabulary || []);
  const existingTagNames = allTags.map(t => t.tag);

  // Apply store roles to contexts
  for (const ctx of storeContexts) {
    if (storeRoles?.[ctx.storeId]) {
      ctx.role = storeRoles[ctx.storeId][0];
    }
  }

  const existingTexts: string[] = [];
  const questions: QuizQuestion[] = [];
  let done = 0;

  const pickType = () => questionTypes[Math.floor(Math.random() * questionTypes.length)];

  let lastError: Error | null = null;

  /** 从题目缓存中获取某个标签的历史答题示例 */
  function getHistoryExamples(tag: string): HistoryExample[] {
    // 暂无完整的 attempt 数据，使用缓存题目的基本信息
    const tagQuestions = questionCache
      .filter(q => q.tags.includes(tag) && q.usedCount > 0)
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt))
      .slice(0, 2);
    return tagQuestions.map(q => ({
      question: q.question,
      userAnswer: '（历史回答不可用）',
      score: mastery[tag]?.avgScore ?? 0,
      keyPointsHit: q.keyPoints.slice(0, 2),
      keyPointsMissed: q.keyPoints.slice(2),
    }));
  }

  async function gen(
    chunks: TextChunk[],
    phase: GenerationPhase,
    qType?: QuestionType,
    targetTag?: string,
    targetTopic?: string,
  ): Promise<QuizQuestion | null> {
    try {
      const historyExamples = targetTag ? getHistoryExamples(targetTag) : undefined;
      const q = await generateQuestion(chunks, qType || pickType(), difficulty, llmFn, phase, {
        storeContexts,
        allTags,
        rolePrompt: topicHint,
        quizDirection,
        existingQuestions: existingTexts,
        studentProfile,
        historyExamples: historyExamples?.length ? historyExamples : undefined,
        targetTag,
        targetTopic,
      });
      existingTexts.push(q.question);
      await addCachedQuestion(q);
      return q;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error('[QuizEngine] 出题失败:', lastError.message);
      return null;
    }
  }

  // ── 1. 到期复习题：用历史题目搜索相关向量块 ──
  const overdueTags = priorities.filter(p => p.priority > 0).slice(0, reviewCount);
  for (const op of overdueTags) {
    onProgress?.(++done, total, `复习题 ${done}/${total}`);
    const chunks = await searchForTag(op.tag, storeContexts, questionCache);
    if (chunks.length === 0) continue;
    const q = await gen(chunks.slice(0, 5), 'review', op.suggestedType, op.tag);
    if (q) questions.push(q);
  }

  // ── 2. 薄弱点强化：用薄弱标签搜索 ──
  const weakTagNames = weakMastery.map(t => t.tag);
  for (let i = 0; i < weakCount && questions.length < total; i++) {
    onProgress?.(++done, total, `薄弱强化 ${done}/${total}`);
    const tag = weakTagNames[i % Math.max(weakTagNames.length, 1)] || '';
    let chunks: TextChunk[];
    if (tag) {
      chunks = await searchForTag(tag, storeContexts, questionCache);
    } else {
      const randomTopic = allTopics[Math.floor(Math.random() * Math.max(allTopics.length, 1))] || '基础概念';
      chunks = await searchStores(storeContexts, randomTopic, 5);
    }
    if (chunks.length === 0) continue;
    const q = await gen(chunks.slice(0, 5), 'weak', 'concept', tag || undefined);
    if (q) questions.push(q);
  }

  // ── 3. 新知识：用未覆盖的主题词搜索 ──
  let uncoveredTopics: string[] = [];
  try {
    // 使用第一个 storeContext 的 embeddingConfig 做语义匹配
    const matchEmbCfg = storeContexts[0]?.embeddingConfig || embeddingConfig;
    uncoveredTopics = await findUncoveredTopics(allTopics, existingTagNames, matchEmbCfg);
  } catch {
    uncoveredTopics = allTopics; // 匹配失败则全部视为未覆盖
  }
  const shuffledTopics = shuffleArray(uncoveredTopics);
  for (let i = 0; i < newCount && questions.length < total; i++) {
    onProgress?.(++done, total, `新知识 ${done}/${total}`);
    const topic = shuffledTopics[i] || allTopics[Math.floor(Math.random() * Math.max(allTopics.length, 1))] || '核心概念';
    const chunks = await searchForNewTopic(topic, storeContexts);
    if (chunks.length === 0) continue;
    const q = await gen(chunks.slice(0, 5), 'new', undefined, undefined, topic);
    if (q) questions.push(q);
  }

  // ── 4. 随机巩固：随机主题词搜索 ──
  for (let i = 0; i < randomCount && questions.length < total; i++) {
    onProgress?.(++done, total, `随机巩固 ${done}/${total}`);
    const seeds = [...allTopics, ...existingTagNames];
    const seed = seeds[Math.floor(Math.random() * Math.max(seeds.length, 1))] || '知识点';
    const chunks = await searchStores(storeContexts, seed, 5);
    if (chunks.length === 0) continue;
    const q = await gen(chunks.slice(0, 5), 'random');
    if (q) questions.push(q);
  }

  // ── 5. 补足不够的题目 ──
  while (questions.length < total) {
    onProgress?.(++done, total, `补充出题 ${done}/${total}`);
    const fallbackSeed = topicHint || allTopics[Math.floor(Math.random() * Math.max(allTopics.length, 1))] || '知识点';
    const chunks = await searchStores(storeContexts, fallbackSeed, 5);
    if (chunks.length === 0) break;
    const q = await gen(chunks.slice(0, 5), 'random');
    if (q) questions.push(q);
    else break;
  }

  if (questions.length === 0 && lastError) {
    throw new Error(lastError.message);
  }

  return {
    questions,
    composition: {
      review: Math.min(overdueTags.length, reviewCount),
      weakPoint: weakCount,
      newKnowledge: newCount,
      random: randomCount,
    },
  };
}

/** 生成 session 总结 */
export async function generateSessionSummary(
  scores: number[],
  tags: string[][],
  llmFn: LLMFunction,
): Promise<{ overallGrade: string; recommendation: string }> {
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const tagScores: Record<string, number[]> = {};
  tags.forEach((t, i) => {
    for (const tag of t) {
      if (!tagScores[tag]) tagScores[tag] = [];
      tagScores[tag].push(scores[i]);
    }
  });

  const strongTags = Object.entries(tagScores)
    .filter(([, ss]) => ss.reduce((a, b) => a + b, 0) / ss.length >= 70)
    .map(([t]) => t);
  const weakTags = Object.entries(tagScores)
    .filter(([, ss]) => ss.reduce((a, b) => a + b, 0) / ss.length < 60)
    .map(([t]) => t);

  try {
    const response = await llmFn(buildSessionSummaryPrompt(scores.length, avg, scores, strongTags, weakTags));
    const parsed = parseJSON<any>(response);
    if (parsed) return { overallGrade: parsed.overallGrade || 'C', recommendation: parsed.recommendation || '' };
  } catch {}

  const grade = avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg >= 40 ? 'D' : 'F';
  return { overallGrade: grade, recommendation: weakTags.length > 0 ? `建议重点复习：${weakTags.join('、')}` : '继续保持！' };
}

/** 答题后更新每个标签的掌握度 */
export async function updateMasteryAfterAnswer(
  question: QuizQuestion,
  score: number,
  categoryId?: string,
): Promise<void> {
  const { updateMastery } = await import('./scheduler');
  const mastery = await loadMastery(categoryId);

  // 为题目的每个标签独立更新掌握度
  for (const tag of question.tags) {
    if (!tag.trim()) continue;
    if (mastery[tag]) {
      mastery[tag] = updateMastery(mastery[tag], score);
    } else {
      const newTag = createTagMastery(tag);
      mastery[tag] = updateMastery(newTag, score);
    }
  }

  await saveMastery(mastery, categoryId);
}
