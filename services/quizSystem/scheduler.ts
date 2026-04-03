/**
 * Quiz System — 自适应调度引擎
 *
 * SM-2 间隔重复 + 艾宾浩斯遗忘曲线 + 知识点掌握度模型
 */

import type {
  KnowledgePointMastery, MasteryLevel, QuestionType, QuestionPriority,
} from './types';

// ═══════════════════════════════════════════════════════
// SM-2 Mastery Update
// ═══════════════════════════════════════════════════════

/** 分数映射到 SM-2 质量等级 (0-5) */
export function mapScoreToQuality(score: number): number {
  if (score >= 91) return 5;
  if (score >= 71) return 4;
  if (score >= 41) return 3;
  if (score >= 21) return 2;
  if (score >= 1) return 1;
  return 0;
}

/** 每次答题后更新掌握度 */
export function updateMastery(
  point: KnowledgePointMastery,
  score: number,
): KnowledgePointMastery {
  const updated = { ...point };
  const quality = mapScoreToQuality(score);

  // SM-2 间隔更新
  if (quality >= 3) {
    if (updated.repetitions === 0) {
      updated.interval = 1;
    } else if (updated.repetitions === 1) {
      updated.interval = 3;
    } else {
      updated.interval = Math.round(updated.interval * updated.easeFactor);
    }
    updated.repetitions += 1;
  } else {
    updated.repetitions = 0;
    updated.interval = 0.5;
  }

  // 间隔上限 180 天
  updated.interval = Math.min(updated.interval, 180);

  // 难度因子更新
  updated.easeFactor = Math.max(
    1.3,
    updated.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  // 时间戳
  const now = Date.now();
  updated.lastReviewAt = now;
  updated.nextReviewAt = now + updated.interval * 24 * 60 * 60 * 1000;

  // 统计
  updated.totalAttempts += 1;
  if (score >= 60) updated.correctCount += 1;
  updated.recentScores = [...updated.recentScores.slice(-4), score];
  updated.avgScore = updated.recentScores.reduce((a, b) => a + b, 0) / updated.recentScores.length;

  // 掌握等级
  updated.masteryLevel = calculateMasteryLevel(updated);

  return updated;
}

/** 计算掌握等级 */
export function calculateMasteryLevel(point: KnowledgePointMastery): MasteryLevel {
  const { avgScore, repetitions, recentScores, totalAttempts } = point;

  if (totalAttempts === 0) return 'not_mastered';

  const recentThree = recentScores.slice(-3);
  if (recentThree.length >= 3 && recentThree.every(s => s >= 90) && repetitions >= 3) {
    return 'expert';
  }

  if (avgScore >= 70 && repetitions >= 2) return 'mastered';
  if (avgScore >= 40 || repetitions >= 1) return 'partially';

  return 'not_mastered';
}

// ═══════════════════════════════════════════════════════
// 遗忘曲线
// ═══════════════════════════════════════════════════════

/** 计算记忆保持率 R = e^(-t/S) */
export function getRetentionRate(point: KnowledgePointMastery): number {
  if (point.totalAttempts === 0) return 0;

  const now = Date.now();
  const daysSinceReview = (now - point.lastReviewAt) / (24 * 60 * 60 * 1000);
  const stability = point.easeFactor * Math.max(point.interval, 0.1);

  return Math.exp(-daysSinceReview / stability);
}

/** 记忆状态描述 */
export function getRetentionStatus(rate: number): { label: string; emoji: string; level: 'strong' | 'ok' | 'fading' | 'weak' | 'forgotten' } {
  if (rate >= 0.9) return { label: '记忆牢固', emoji: '🟢', level: 'strong' };
  if (rate >= 0.7) return { label: '记忆尚可', emoji: '🟡', level: 'ok' };
  if (rate >= 0.5) return { label: '开始遗忘', emoji: '🟠', level: 'fading' };
  if (rate >= 0.3) return { label: '即将遗忘', emoji: '🔴', level: 'weak' };
  return { label: '已基本遗忘', emoji: '⚫', level: 'forgotten' };
}

// ═══════════════════════════════════════════════════════
// 出题优先级
// ═══════════════════════════════════════════════════════

/** 根据掌握度建议题型 */
export function suggestQuestionType(point: KnowledgePointMastery): QuestionType {
  switch (point.masteryLevel) {
    case 'not_mastered': return 'concept';
    case 'partially': return 'comparison';
    case 'mastered': return Math.random() > 0.5 ? 'scenario' : 'coding';
    case 'expert': return 'follow_up';
    default: return 'concept';
  }
}

/** 根据历史得分建议难度 */
export function suggestDifficulty(point: KnowledgePointMastery): number {
  if (point.totalAttempts === 0) return 1;
  const avg = point.avgScore;
  if (avg >= 90) return Math.min(5, 4);
  if (avg >= 70) return 3;
  if (avg >= 50) return 2;
  return 1;
}

/** 计算所有知识点的出题优先级 */
export function calculateQuestionPriorities(
  allPoints: KnowledgePointMastery[],
): QuestionPriority[] {
  const now = Date.now();

  return allPoints.map(point => {
    let priority = 0;
    const reasons: string[] = [];

    // 因素1: 复习到期（最高权重）
    if (now >= point.nextReviewAt) {
      const overdueDays = (now - point.nextReviewAt) / (24 * 60 * 60 * 1000);
      priority += 50 + Math.min(overdueDays * 5, 30);
      reasons.push(`已逾期 ${overdueDays.toFixed(1)} 天`);
    }

    // 因素2: 记忆保持率低
    const retention = getRetentionRate(point);
    if (retention < 0.5) {
      priority += (1 - retention) * 40;
      reasons.push(`记忆保持率 ${(retention * 100).toFixed(0)}%`);
    }

    // 因素3: 掌握度低
    if (point.masteryLevel === 'not_mastered') {
      priority += 30;
      reasons.push('尚未掌握');
    } else if (point.masteryLevel === 'partially') {
      priority += 15;
      reasons.push('部分掌握');
    }

    // 因素4: 得分下降趋势
    if (point.recentScores.length >= 3) {
      const recent = point.recentScores.slice(-3);
      if (recent[2] < recent[0] - 10) {
        priority += 10;
        reasons.push('得分下降趋势');
      }
    }

    // 因素5: 从未练习
    if (point.totalAttempts === 0) {
      priority += 20;
      reasons.push('从未练习');
    }

    return {
      pointId: point.pointId,
      priority,
      reason: reasons.join('；'),
      retentionRate: retention,
      suggestedType: suggestQuestionType(point),
      suggestedDifficulty: suggestDifficulty(point),
    };
  }).sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════
// 创建新知识点
// ═══════════════════════════════════════════════════════

export function createMasteryPoint(
  pointId: string,
  label: string,
  tags: string[],
  sourceChunkIds: string[],
): KnowledgePointMastery {
  const now = Date.now();
  return {
    pointId,
    label,
    tags,
    sourceChunkIds,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    createdAt: now,
    lastReviewAt: now,
    nextReviewAt: now, // 立即可出题
    totalAttempts: 0,
    correctCount: 0,
    avgScore: 0,
    recentScores: [],
    masteryLevel: 'not_mastered',
  };
}
