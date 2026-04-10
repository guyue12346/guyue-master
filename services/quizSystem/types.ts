/**
 * Quiz System — 类型定义
 */

import type { LocalVectorStore, EmbeddingConfig } from '../ragLlamaIndex';

// ═══════════════════════════════════════════════════════
// 枚举与常量
// ═══════════════════════════════════════════════════════

/** 题目类型（布鲁姆分类法覆盖） */
export type QuestionType = 'concept' | 'comparison' | 'scenario' | 'coding' | 'follow_up';

export type VectorStoreRole = 'material' | 'questions_no_answer' | 'questions_with_answer';

/** 掌握等级 */
export type MasteryLevel = 'not_mastered' | 'partially' | 'mastered' | 'expert';

/** 练习模式 */
export type SessionMode = 'practice' | 'mock_interview' | 'review' | 'interview';

/** 关键点命中状态 */
export type KeyPointHitStatus = 'hit' | 'partial' | 'missed';

/** 追问策略 */
export type FollowUpStrategy = 'error_correction' | 'missing_point' | 'deeper_dive' | 'extension';

// ═══════════════════════════════════════════════════════
// 题目相关
// ═══════════════════════════════════════════════════════

/** 生成的题目 */
export interface QuizQuestion {
  id: string;
  question: string;
  type: QuestionType;
  difficulty: number;               // 1-5
  referenceAnswer: string;
  keyPoints: string[];              // 3-5 个关键得分点
  tags: string[];                   // 知识标签
  sourceChunkIds: string[];         // 来源 chunk IDs
  embedding?: number[];             // 题目的 embedding（用于去重）
  createdAt: number;
  usedCount: number;
  lastUsedAt?: number;
}

// ═══════════════════════════════════════════════════════
// 评分相关
// ═══════════════════════════════════════════════════════

/** 关键点命中详情 */
export interface KeyPointMatch {
  keyPoint: string;
  status: KeyPointHitStatus;
  similarity: number;
  matchedSegment?: string;
}

/** 四维评分维度 */
export interface ScoreDimensions {
  keyPointCoverage: {
    score: number;                  // 0-40
    matches: KeyPointMatch[];
  };
  accuracy: {
    score: number;                  // 0-25
    errors: string[];
  };
  completeness: {
    score: number;                  // 0-20
    feedback: string;
  };
  clarity: {
    score: number;                  // 0-15
    feedback: string;
  };
}

/** 完整评分结果 */
export interface AnswerEvaluation {
  totalScore: number;               // 0-100
  dimensions: ScoreDimensions;
  overallFeedback: string;
  suggestions: string[];
  masteryLevel: MasteryLevel;
  meta: {
    cosineSimilarity: number;
    keyPointHitRate: number;
    llmRawScore: number;
    calibratedScore: number;
    scoringTimeMs: number;
  };
  // Interview mode fields
  shouldFollowUp?: boolean;
  followUpReason?: string;
  interviewerComment?: string;
}

// ═══════════════════════════════════════════════════════
// 答题记录
// ═══════════════════════════════════════════════════════

/** 单次答题记录 */
export interface QuizAttempt {
  id: string;
  questionId: string;
  question: QuizQuestion;
  userAnswer: string;
  evaluation: AnswerEvaluation;
  timeSpentMs: number;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════
// 练习会话
// ═══════════════════════════════════════════════════════

/** 会话总结 */
export interface SessionSummary {
  totalQuestions: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  strongPoints: string[];
  weakPoints: string[];
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: string;
}

/** 完整练习会话 */
export interface QuizSession {
  id: string;
  mode: SessionMode;
  collectionIds: string[];
  topic?: string;
  attempts: QuizAttempt[];
  summary?: SessionSummary;
  startedAt: number;
  finishedAt?: number;
  status: 'generating' | 'answering' | 'grading' | 'completed' | 'interview_active';
}

// ═══════════════════════════════════════════════════════
// 标签掌握度 (SM-2) — 每个独立标签一条记录
// ═══════════════════════════════════════════════════════

/** 单个标签掌握度 */
export interface TagMastery {
  tag: string;                      // 标签名（即 key）

  // SM-2
  easeFactor: number;               // 初始 2.5，下限 1.3
  interval: number;                 // 当前复习间隔（天）
  repetitions: number;              // 连续正确次数

  // 时间戳
  createdAt: number;
  lastReviewAt: number;
  nextReviewAt: number;

  // 统计
  totalAttempts: number;
  correctCount: number;
  avgScore: number;
  recentScores: number[];           // 最近 5 次

  masteryLevel: MasteryLevel;
}

/** @deprecated 兼容旧数据迁移 */
export interface KnowledgePointMastery {
  pointId: string;
  label: string;
  tags: string[];
  sourceChunkIds: string[];
  easeFactor: number;
  interval: number;
  repetitions: number;
  createdAt: number;
  lastReviewAt: number;
  nextReviewAt: number;
  totalAttempts: number;
  correctCount: number;
  avgScore: number;
  recentScores: number[];
  masteryLevel: MasteryLevel;
}

/** 出题优先级（按标签） */
export interface QuestionPriority {
  tag: string;
  priority: number;
  reason: string;
  retentionRate: number;
  suggestedType: QuestionType;
  suggestedDifficulty: number;
}

/** 向量库上下文（出题管线使用） */
export interface StoreContext {
  store: LocalVectorStore;
  storeId: string;
  name: string;
  role?: VectorStoreRole;
  topicVocabulary?: string[];
  embeddingConfig: EmbeddingConfig;
}

// ═══════════════════════════════════════════════════════
// 配置与设置
// ═══════════════════════════════════════════════════════

/** Session 出题配比 */
export interface SessionConfig {
  totalQuestions: number;
  reviewRatio: number;              // 到期复习 40%
  weakPointRatio: number;           // 薄弱强化 30%
  newKnowledgeRatio: number;        // 新知识 20%
  randomReviewRatio: number;        // 随机巩固 10%
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  totalQuestions: 10,
  reviewRatio: 0.4,
  weakPointRatio: 0.3,
  newKnowledgeRatio: 0.2,
  randomReviewRatio: 0.1,
};

/** 支持的 LLM 提供商 */
export type QuizLLMProvider = 'gemini' | 'openai' | 'anthropic' | 'deepseek' | 'zhipu' | 'moonshot' | 'minimax' | 'ollama' | 'custom';

/** 出题场景 */
export interface QuizScenario {
  id: string;
  name: string;
  systemPrompt: string;
  isBuiltin: boolean;
}

/** 内置场景 */
export const BUILTIN_SCENARIOS: QuizScenario[] = [
  {
    id: 'daily-study',
    name: '日常学习',
    systemPrompt: '你是一位耐心的学习辅导老师。出题风格：注重概念理解和知识巩固，题目表述清晰易懂，难度循序渐进。评分时注重知识点掌握程度，对表述不够专业但意思正确的回答给予适当肯定。',
    isBuiltin: true,
  },
  {
    id: 'interview-prep',
    name: '实习面试',
    systemPrompt: '你是一位资深技术面试官。出题风格：模拟真实面试场景，注重考查深层理解和实际应用能力，会追问细节和边界情况。题目偏向实际工程问题和方案设计。评分标准严格，要求回答专业、有条理、有深度。',
    isBuiltin: true,
  },
];

/** 用户设置 */
export interface QuizSettings {
  defaultSessionConfig: SessionConfig;
  preferredDifficulty: number;      // 1-5
  enableAutoReview: boolean;
  llmConfig: {
    provider: QuizLLMProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  scenarios?: QuizScenario[];       // 用户自定义场景
}

// ═══════════════════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════════════════

/** 全局统计 */
export interface QuizStats {
  totalSessions: number;
  totalQuestions: number;
  totalTimeMs: number;
  avgScore: number;
  streakDays: number;
  lastActiveAt: number;
  byDate: Record<string, { sessions: number; questions: number; avgScore: number }>;
  byTag: Record<string, { attempts: number; avgScore: number }>;
}

// ═══════════════════════════════════════════════════════
// LLM 函数类型
// ═══════════════════════════════════════════════════════

export type LLMFunction = (prompt: string, systemPrompt?: string) => Promise<string>;

// ═══════════════════════════════════════════════════════
// 题型描述（用于 Prompt 和 UI）
// ═══════════════════════════════════════════════════════

export const QUESTION_TYPE_INFO: Record<QuestionType, { label: string; description: string; cognitive: string }> = {
  concept:    { label: '概念解释', description: '解释一个核心概念', cognitive: '记忆/理解' },
  comparison: { label: '对比分析', description: '比较两个相关概念的异同', cognitive: '分析' },
  scenario:   { label: '应用场景', description: '在给定场景下做设计/选择', cognitive: '应用/综合' },
  coding:     { label: '代码实操', description: '写出实现/分析代码', cognitive: '应用/创造' },
  follow_up:  { label: '追问深入', description: '根据回答进行追问', cognitive: '评价' },
};

export const DIFFICULTY_INFO: Record<number, { label: string; description: string }> = {
  1: { label: '入门', description: '基础知识' },
  2: { label: '理解', description: '概念理解' },
  3: { label: '应用', description: '综合应用' },
  4: { label: '深入', description: '深度分析' },
  5: { label: '专家', description: '专家追问' },
};

export const MASTERY_LEVEL_INFO: Record<MasteryLevel, { label: string; color: string; icon: string }> = {
  not_mastered: { label: '未掌握', color: '#EF4444', icon: '⚫' },
  partially:    { label: '部分掌握', color: '#F59E0B', icon: '🟠' },
  mastered:     { label: '已掌握', color: '#10B981', icon: '🟢' },
  expert:       { label: '精通', color: '#8B5CF6', icon: '⭐' },
};
