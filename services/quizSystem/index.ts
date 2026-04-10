/**
 * Quiz System — 模块入口
 */

// Types
export type {
  QuestionType, MasteryLevel, SessionMode, KeyPointHitStatus, FollowUpStrategy,
  QuizQuestion, KeyPointMatch, ScoreDimensions, AnswerEvaluation,
  QuizAttempt, SessionSummary, QuizSession,
  TagMastery, KnowledgePointMastery, QuestionPriority, StoreContext,
  SessionConfig, QuizSettings, QuizStats,
  LLMFunction, QuizScenario, VectorStoreRole,
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
export type {
  PromptChunk, StorePromptContext, StudentProfile,
  HistoryExample, GenerationPhase,
} from './prompts';

// Storage
export {
  loadMastery, saveMastery, updateMasteryPoint,
  loadQuestionCache, saveQuestionCache, addCachedQuestion, markQuestionUsed,
  saveSession, loadSession, loadRecentSessions, saveRecentSessions,
  loadStats, saveStats, recordSessionStats,
  loadSettings, saveSettings,
  clearLegacyMastery,
} from './storageService';

// Scorer
export { evaluate } from './scorer';

// Scheduler
export {
  mapScoreToQuality, updateMastery, calculateMasteryLevel,
  getRetentionRate, getRetentionStatus,
  suggestQuestionType, suggestDifficulty,
  calculateQuestionPriorities, createTagMastery,
} from './scheduler';

// Engine
export {
  generateQuestion, isDuplicate, generateFollowUp,
  buildSessionPlan, generateSessionSummary,
  updateMasteryAfterAnswer,
} from './quizEngine';
export type { SessionPlan } from './quizEngine';
