/**
 * Quiz System — 模块入口
 */

// Types
export type {
  QuestionType, MasteryLevel, SessionMode, KeyPointHitStatus, FollowUpStrategy,
  QuizQuestion, KeyPointMatch, ScoreDimensions, AnswerEvaluation,
  QuizAttempt, SessionSummary, QuizSession,
  KnowledgePointMastery, QuestionPriority,
  SessionConfig, QuizSettings, QuizStats,
  LLMFunction, QuizScenario,
} from './types';

export {
  QUESTION_TYPE_INFO, DIFFICULTY_INFO, MASTERY_LEVEL_INFO,
  DEFAULT_SESSION_CONFIG, BUILTIN_SCENARIOS,
} from './types';

// Prompts
export {
  buildQuestionPrompt, buildScoringPrompt,
  buildFollowUpPrompt, buildSessionSummaryPrompt,
} from './prompts';

// Storage
export {
  loadMastery, saveMastery, updateMasteryPoint,
  loadQuestionCache, saveQuestionCache, addCachedQuestion, markQuestionUsed,
  saveSession, loadSession, loadRecentSessions, saveRecentSessions,
  loadStats, saveStats, recordSessionStats,
  loadSettings, saveSettings,
} from './storageService';

// Scorer
export { evaluate } from './scorer';

// Scheduler
export {
  mapScoreToQuality, updateMastery, calculateMasteryLevel,
  getRetentionRate, getRetentionStatus,
  suggestQuestionType, suggestDifficulty,
  calculateQuestionPriorities, createMasteryPoint,
} from './scheduler';

// Engine
export {
  sampleByRandom, sampleByWeakTags,
  generateQuestion, isDuplicate, generateFollowUp,
  buildSessionPlan, generateSessionSummary,
  updateMasteryAfterAnswer,
} from './quizEngine';
export type { SessionPlan } from './quizEngine';
