/**
 * Quiz System — 三级评分引擎
 *
 * Level 1: Embedding 语义相似度（快速锚定）
 * Level 2: 关键点命中检测（结构化匹配）
 * Level 3: LLM 深度评分（四维度打分）
 * + 分数校准
 */

import type {
  AnswerEvaluation, KeyPointMatch, ScoreDimensions,
  MasteryLevel, LLMFunction, QuizQuestion,
} from './types';
import { buildScoringPrompt } from './prompts';
import { getEmbedding } from '../ragLlamaIndex/embedding';
import type { EmbeddingConfig } from '../ragLlamaIndex';

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

function cosineSimilarity(a: number[], b: number[]): number {
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

/** 将句子拆分为片段（按句号/分号/换行） */
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？；\n.!?;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
}

function parseJSON<T>(text: string): T | null {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════
// Level 1: 语义相似度
// ═══════════════════════════════════════════════════════

async function computeCosineSimilarity(
  userAnswer: string,
  referenceAnswer: string,
  embeddingConfig: EmbeddingConfig,
): Promise<number> {
  try {
    const [userEmb, refEmb] = await Promise.all([
      getEmbedding(userAnswer, embeddingConfig),
      getEmbedding(referenceAnswer, embeddingConfig),
    ]);
    return cosineSimilarity(userEmb, refEmb);
  } catch {
    return 0; // embedding 失败时返回 0（无法计算相似度）
  }
}

// ═══════════════════════════════════════════════════════
// Level 2: 关键点命中
// ═══════════════════════════════════════════════════════

async function matchKeyPoints(
  userAnswer: string,
  keyPoints: string[],
  embeddingConfig: EmbeddingConfig,
): Promise<KeyPointMatch[]> {
  const userSentences = splitSentences(userAnswer);
  if (userSentences.length === 0) {
    return keyPoints.map(kp => ({ keyPoint: kp, status: 'missed' as const, similarity: 0 }));
  }

  try {
    // 批量获取 embeddings
    const allTexts = [...keyPoints, ...userSentences];
    const embeddings: number[][] = [];
    for (const text of allTexts) {
      embeddings.push(await getEmbedding(text, embeddingConfig));
    }

    const kpEmbeddings = embeddings.slice(0, keyPoints.length);
    const sentenceEmbeddings = embeddings.slice(keyPoints.length);

    return keyPoints.map((kp, i) => {
      let maxSim = 0;
      let matchedSegment = '';

      for (let j = 0; j < sentenceEmbeddings.length; j++) {
        const sim = cosineSimilarity(kpEmbeddings[i], sentenceEmbeddings[j]);
        if (sim > maxSim) {
          maxSim = sim;
          matchedSegment = userSentences[j];
        }
      }

      const status: KeyPointMatch['status'] =
        maxSim >= 0.75 ? 'hit' :
        maxSim >= 0.55 ? 'partial' :
        'missed';

      return { keyPoint: kp, status, similarity: maxSim, matchedSegment };
    });
  } catch {
    // Embedding 失败时用简单文本匹配降级
    return keyPoints.map(kp => {
      const words = kp.split(/\s+/).filter(w => w.length > 1);
      const hitCount = words.filter(w => userAnswer.includes(w)).length;
      const ratio = words.length > 0 ? hitCount / words.length : 0;
      return {
        keyPoint: kp,
        status: ratio >= 0.6 ? 'hit' as const : ratio >= 0.3 ? 'partial' as const : 'missed' as const,
        similarity: ratio,
      };
    });
  }
}

// ═══════════════════════════════════════════════════════
// Level 3: LLM 深度评分
// ═══════════════════════════════════════════════════════

interface LLMScoreResult {
  totalScore: number;
  dimensions: {
    keyPointCoverage: { score: number; hitPoints: string[]; missedPoints: string[] };
    accuracy: { score: number; errors: string[] };
    completeness: { score: number; feedback: string };
    clarity: { score: number; feedback: string };
  };
  overallFeedback: string;
  suggestions: string[];
  masteryLevel: MasteryLevel;
}

async function llmEvaluate(
  question: QuizQuestion,
  userAnswer: string,
  cosineScore: number,
  keyPointMatches: KeyPointMatch[],
  llmFn: LLMFunction,
): Promise<LLMScoreResult> {
  const prompt = buildScoringPrompt(
    question.question,
    question.referenceAnswer,
    question.keyPoints,
    userAnswer,
    cosineScore,
    keyPointMatches.map(kp => ({ keyPoint: kp.keyPoint, status: kp.status, similarity: kp.similarity })),
  );

  const response = await llmFn(prompt);
  const parsed = parseJSON<LLMScoreResult>(response);

  if (parsed && typeof parsed.totalScore === 'number') {
    // 确保 totalScore = 四维度之和
    const sum =
      (parsed.dimensions?.keyPointCoverage?.score || 0) +
      (parsed.dimensions?.accuracy?.score || 0) +
      (parsed.dimensions?.completeness?.score || 0) +
      (parsed.dimensions?.clarity?.score || 0);
    parsed.totalScore = sum;
    return parsed;
  }

  // 解析失败时的降级评分
  const hitRate = keyPointMatches.filter(k => k.status === 'hit').length / Math.max(keyPointMatches.length, 1);
  const fallbackScore = Math.round(cosineScore * 50 + hitRate * 50);
  return {
    totalScore: fallbackScore,
    dimensions: {
      keyPointCoverage: { score: Math.round(hitRate * 40), hitPoints: keyPointMatches.filter(k => k.status === 'hit').map(k => k.keyPoint), missedPoints: keyPointMatches.filter(k => k.status === 'missed').map(k => k.keyPoint) },
      accuracy: { score: Math.round(cosineScore * 25), errors: [] },
      completeness: { score: Math.round(cosineScore * 20), feedback: 'LLM 评分解析失败，使用自动评分' },
      clarity: { score: Math.round(cosineScore * 15), feedback: '' },
    },
    overallFeedback: 'LLM 评分解析失败，已根据语义相似度和关键点命中自动评分',
    suggestions: [],
    masteryLevel: fallbackScore >= 71 ? 'mastered' : fallbackScore >= 41 ? 'partially' : 'not_mastered',
  };
}

// ═══════════════════════════════════════════════════════
// Score Calibration
// ═══════════════════════════════════════════════════════

function calibrateScore(
  llmScore: number,
  cosineScore: number,
  keyPointHitRate: number,
): number {
  const cosineAnchor = cosineScore * 100;
  const keyPointAnchor = keyPointHitRate * 100;

  // 如果所有指标都很低，直接给 0
  if (cosineAnchor < 25 && keyPointAnchor < 10 && llmScore < 10) {
    return 0;
  }

  // 加权：LLM 60% + cosine 20% + keyPoint 20%
  let calibrated = llmScore * 0.6 + cosineAnchor * 0.2 + keyPointAnchor * 0.2;

  // 极端偏差修正
  if (Math.abs(llmScore - cosineAnchor) > 40) {
    calibrated = (llmScore + cosineAnchor) / 2;
  }

  return Math.round(Math.max(0, Math.min(100, calibrated)));
}

function scoreToMastery(score: number): MasteryLevel {
  if (score >= 91) return 'expert';
  if (score >= 71) return 'mastered';
  if (score >= 41) return 'partially';
  return 'not_mastered';
}

// ═══════════════════════════════════════════════════════
// Main Evaluation Pipeline
// ═══════════════════════════════════════════════════════

export async function evaluate(
  question: QuizQuestion,
  userAnswer: string,
  embeddingConfig: EmbeddingConfig,
  llmFn: LLMFunction,
): Promise<AnswerEvaluation> {
  const startTime = Date.now();

  if (!userAnswer.trim()) {
    return {
      totalScore: 0,
      dimensions: {
        keyPointCoverage: { score: 0, matches: question.keyPoints.map(kp => ({ keyPoint: kp, status: 'missed' as const, similarity: 0 })) },
        accuracy: { score: 0, errors: [] },
        completeness: { score: 0, feedback: '未作答' },
        clarity: { score: 0, feedback: '' },
      },
      overallFeedback: '未作答',
      suggestions: ['请尝试回答此问题'],
      masteryLevel: 'not_mastered',
      meta: { cosineSimilarity: 0, keyPointHitRate: 0, llmRawScore: 0, calibratedScore: 0, scoringTimeMs: Date.now() - startTime },
    };
  }

  // Level 1: Cosine similarity
  const cosineScore = await computeCosineSimilarity(userAnswer, question.referenceAnswer, embeddingConfig);

  // 快速筛选：cosine < 0.3 且关键点基本没命中 → 直接给低分
  if (cosineScore < 0.3) {
    const kpMatches = await matchKeyPoints(userAnswer, question.keyPoints, embeddingConfig);
    const kpHitRate = kpMatches.filter(k => k.status === 'hit').length / Math.max(kpMatches.length, 1);
    if (kpHitRate < 0.15) {
      // 答案与问题几乎无关
      const cal = Math.round(Math.max(0, (cosineScore - 0.1) * 50)); // 0.1→0, 0.2→5, 0.3→10
      return {
        totalScore: cal,
        dimensions: {
          keyPointCoverage: { score: 0, matches: kpMatches },
          accuracy: { score: 0, errors: ['回答与问题关联度极低'] },
          completeness: { score: 0, feedback: '回答内容与问题不相关' },
          clarity: { score: 0, feedback: '' },
        },
        overallFeedback: '回答与题目关联度很低，请重新审题。',
        suggestions: ['建议仔细阅读题目要求', '参考相关知识点重新组织答案'],
        masteryLevel: 'not_mastered',
        meta: { cosineSimilarity: cosineScore, keyPointHitRate: 0, llmRawScore: cal, calibratedScore: cal, scoringTimeMs: Date.now() - startTime },
      };
    }
  }

  // Level 2: Key point matching
  const keyPointMatches = await matchKeyPoints(userAnswer, question.keyPoints, embeddingConfig);
  const hitRate = keyPointMatches.filter(k => k.status === 'hit').length / Math.max(keyPointMatches.length, 1);
  const partialRate = keyPointMatches.filter(k => k.status === 'partial').length / Math.max(keyPointMatches.length, 1);
  const effectiveHitRate = hitRate + partialRate * 0.5;

  // Level 3: LLM deep evaluation
  const llmResult = await llmEvaluate(question, userAnswer, cosineScore, keyPointMatches, llmFn);

  // Calibrate
  const calibrated = calibrateScore(llmResult.totalScore, cosineScore, effectiveHitRate);
  const finalMastery = scoreToMastery(calibrated);

  const dimensions: ScoreDimensions = {
    keyPointCoverage: {
      score: llmResult.dimensions.keyPointCoverage.score,
      matches: keyPointMatches,
    },
    accuracy: {
      score: llmResult.dimensions.accuracy.score,
      errors: llmResult.dimensions.accuracy.errors,
    },
    completeness: {
      score: llmResult.dimensions.completeness.score,
      feedback: llmResult.dimensions.completeness.feedback,
    },
    clarity: {
      score: llmResult.dimensions.clarity.score,
      feedback: llmResult.dimensions.clarity.feedback,
    },
  };

  return {
    totalScore: calibrated,
    dimensions,
    overallFeedback: llmResult.overallFeedback,
    suggestions: llmResult.suggestions,
    masteryLevel: finalMastery,
    meta: {
      cosineSimilarity: cosineScore,
      keyPointHitRate: effectiveHitRate,
      llmRawScore: llmResult.totalScore,
      calibratedScore: calibrated,
      scoringTimeMs: Date.now() - startTime,
    },
  };
}
