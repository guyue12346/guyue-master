/**
 * Quiz System — 出题引擎
 *
 * 知识采样 → LLM生成 → 去重 → 追问 → Session配比
 */

import type {
  QuizQuestion, QuestionType, LLMFunction,
  KnowledgePointMastery, SessionConfig, DEFAULT_SESSION_CONFIG,
  VectorStoreRole,
} from './types';
import { buildQuestionPrompt, buildFollowUpPrompt, buildSessionSummaryPrompt } from './prompts';
import { calculateQuestionPriorities, createMasteryPoint } from './scheduler';
import { loadMastery, saveMastery, loadQuestionCache, addCachedQuestion, markQuestionUsed } from './storageService';
import { getEmbedding } from '../ragLlamaIndex/embedding';
import { LocalVectorStore } from '../ragLlamaIndex';
import type { EmbeddingConfig } from '../ragLlamaIndex';

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

// ═══════════════════════════════════════════════════════
// Knowledge Sampling
// ═══════════════════════════════════════════════════════

interface TextChunk {
  id: string;
  text: string;
  metadata?: Record<string, any>;
  sourceStoreId?: string;
}

/** 从向量库获取所有 chunks */
function getAllChunks(store: LocalVectorStore): TextChunk[] {
  const ids = store.getEntryIds();
  return ids.map(id => {
    const entry = store.getEntry(id);
    if (!entry) return null;
    return { id: entry.id, text: entry.text, metadata: entry.metadata };
  }).filter((c): c is NonNullable<typeof c> => c !== null) as TextChunk[];
}

/** 策略A: 随机采样 */
export function sampleByRandom(
  store: LocalVectorStore,
  count: number,
  excludeIds?: Set<string>,
): TextChunk[] {
  const chunks = getAllChunks(store);
  const candidates = excludeIds ? chunks.filter(c => !excludeIds.has(c.id)) : chunks;
  return shuffleArray(candidates).slice(0, count);
}

/** 策略C: 薄弱点定向检索 (简化版 — 用文本匹配) */
export function sampleByWeakTags(
  store: LocalVectorStore,
  weakTags: string[],
  count: number,
): TextChunk[] {
  const chunks = getAllChunks(store);
  const scored = chunks.map(c => {
    const text = (c.text + ' ' + (c.metadata?.fileName || '')).toLowerCase();
    const matchCount = weakTags.filter(tag => text.includes(tag.toLowerCase())).length;
    return { chunk: c, score: matchCount };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(s => s.chunk);
}

// ═══════════════════════════════════════════════════════
// Question Generation
// ═══════════════════════════════════════════════════════

/** 生成单道题目 */
export async function generateQuestion(
  chunks: TextChunk[],
  questionType: QuestionType,
  difficulty: number,
  llmFn: LLMFunction,
  existingQuestions?: string[],
  sourceRole?: VectorStoreRole,
): Promise<QuizQuestion> {
  const prompt = buildQuestionPrompt(
    chunks.map(c => c.text),
    questionType,
    difficulty,
    existingQuestions,
    sourceRole,
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
// Session Plan
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

/** 构建一个 session 的出题计划 */
export async function buildSessionPlan(
  stores: LocalVectorStore[],
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
  onProgress?: (done: number, total: number, status: string) => void,
  storeRoles?: Record<string, VectorStoreRole[]>,
): Promise<SessionPlan> {
  const total = config.totalQuestions;
  const reviewCount = Math.round(total * config.reviewRatio);
  const weakCount = Math.round(total * config.weakPointRatio);
  const newCount = Math.round(total * config.newKnowledgeRatio);
  const randomCount = Math.max(0, total - reviewCount - weakCount - newCount);

  // Load mastery data
  const mastery = await loadMastery();
  const allPoints = Object.values(mastery);
  const priorities = calculateQuestionPriorities(allPoints);

  // Combine all store chunks, tagging with source store ID
  const allChunks: TextChunk[] = [];
  for (const store of stores) {
    const chunks = getAllChunks(store);
    const storeId = (store as any).id || (store as any).name || '';
    for (const chunk of chunks) {
      chunk.sourceStoreId = storeId;
    }
    allChunks.push(...chunks);
  }
  if (allChunks.length === 0) throw new Error('所选向量库中没有数据');

  // Determine role for a chunk based on storeRoles mapping
  function getChunkRole(chunk: TextChunk): VectorStoreRole | undefined {
    if (!storeRoles || !chunk.sourceStoreId) return undefined;
    const roles = storeRoles[chunk.sourceStoreId];
    if (roles && roles.length > 0) return roles[0];
    return undefined;
  }

  const existingTexts: string[] = [];
  const questions: QuizQuestion[] = [];
  let done = 0;

  const pickType = () => questionTypes[Math.floor(Math.random() * questionTypes.length)];

  let lastError: Error | null = null;

  async function gen(chunks: TextChunk[], qType?: QuestionType): Promise<QuizQuestion | null> {
    try {
      const role = getChunkRole(chunks[0]);
      const q = await generateQuestion(chunks, qType || pickType(), difficulty, llmFn, existingTexts, role);
      existingTexts.push(q.question);
      await addCachedQuestion(q);
      return q;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error('[QuizEngine] 出题失败:', lastError.message);
      return null;
    }
  }

  // 1. 到期复习题
  const overduePoints = priorities.filter(p => p.priority > 0).slice(0, reviewCount);
  for (const op of overduePoints) {
    onProgress?.(++done, total, `复习题 ${done}/${total}`);
    const point = mastery[op.pointId];
    if (!point) continue;
    const relatedChunks = allChunks.filter(c => point.sourceChunkIds.includes(c.id));
    const chunks = relatedChunks.length > 0 ? relatedChunks.slice(0, 3) : shuffleArray(allChunks).slice(0, 3);
    const q = await gen(chunks, op.suggestedType);
    if (q) questions.push(q);
  }

  // 2. 薄弱点强化
  const weakPoints = allPoints.filter(p => p.masteryLevel === 'not_mastered' || p.masteryLevel === 'partially');
  const weakTags = weakPoints.flatMap(p => p.tags).filter((v, i, a) => a.indexOf(v) === i);
  for (let i = 0; i < weakCount && questions.length < total; i++) {
    onProgress?.(++done, total, `薄弱强化 ${done}/${total}`);
    const chunks = weakTags.length > 0
      ? sampleByWeakTags(stores[0], weakTags, 3)
      : shuffleArray(allChunks).slice(0, 3);
    const q = await gen(chunks, 'concept');
    if (q) questions.push(q);
  }

  // 3. 新知识
  const usedChunkIds = new Set(allPoints.flatMap(p => p.sourceChunkIds));
  for (let i = 0; i < newCount && questions.length < total; i++) {
    onProgress?.(++done, total, `新知识 ${done}/${total}`);
    const newChunks = allChunks.filter(c => !usedChunkIds.has(c.id));
    const chunks = newChunks.length > 0 ? shuffleArray(newChunks).slice(0, 3) : shuffleArray(allChunks).slice(0, 3);
    const q = await gen(chunks);
    if (q) questions.push(q);
  }

  // 4. 随机巩固
  for (let i = 0; i < randomCount && questions.length < total; i++) {
    onProgress?.(++done, total, `随机巩固 ${done}/${total}`);
    const chunks = shuffleArray(allChunks).slice(0, 3);
    const q = await gen(chunks);
    if (q) questions.push(q);
  }

  // 补足不够的题目
  while (questions.length < total) {
    onProgress?.(++done, total, `补充出题 ${done}/${total}`);
    const chunks = shuffleArray(allChunks).slice(0, 3);
    const q = await gen(chunks);
    if (q) questions.push(q);
    else break; // 避免无限循环
  }

  if (questions.length === 0 && lastError) {
    throw new Error(lastError.message);
  }

  return {
    questions,
    composition: {
      review: Math.min(overduePoints.length, reviewCount),
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

  // 按标签统计
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

  // Fallback
  const grade = avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg >= 40 ? 'D' : 'F';
  return { overallGrade: grade, recommendation: weakTags.length > 0 ? `建议重点复习：${weakTags.join('、')}` : '继续保持！' };
}

/** 答题后更新/创建知识点掌握度 */
export async function updateMasteryAfterAnswer(
  question: QuizQuestion,
  score: number,
  categoryId?: string,
): Promise<void> {
  const { updateMastery } = await import('./scheduler');
  const mastery = await loadMastery(categoryId);

  // 用题目 tags 构建 pointId
  const pointId = question.tags.sort().join('-') || `unknown-${question.id}`;

  if (mastery[pointId]) {
    mastery[pointId] = updateMastery(mastery[pointId], score);
  } else {
    // 创建新知识点
    const newPoint = createMasteryPoint(pointId, question.tags.join(' / '), question.tags, question.sourceChunkIds);
    mastery[pointId] = updateMastery(newPoint, score);
  }

  await saveMastery(mastery, categoryId);
}
