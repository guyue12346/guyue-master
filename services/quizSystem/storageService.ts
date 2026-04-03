/**
 * Quiz System — 持久化存储服务
 *
 * 三层存储：
 * - 热数据: localStorage（当前状态、UI偏好）
 * - 温数据: Electron saveAppData（掌握度、题目缓存、统计）
 * - 冷数据: Electron writeFile（历史session归档）
 */

import type {
  KnowledgePointMastery, QuizQuestion, QuizSession,
  QuizStats, QuizSettings, SessionConfig, DEFAULT_SESSION_CONFIG,
} from './types';

// ═══════════════════════════════════════════════════════
// Electron API helpers
// ═══════════════════════════════════════════════════════

function eApi() {
  return (window as any).electronAPI;
}

async function getQuizRoot(): Promise<string> {
  const userDir = await eApi().getUserDataPath();
  const root = `${userDir}/quiz-system`;
  await eApi().ensureDir(root);
  return root;
}

// ═══════════════════════════════════════════════════════
// Mastery Store (温数据)
// ═══════════════════════════════════════════════════════

const MASTERY_KEY = 'quiz-mastery';

export async function loadMastery(): Promise<Record<string, KnowledgePointMastery>> {
  try {
    const data = await eApi().loadAppData(MASTERY_KEY);
    if (data?.points) return data.points;
  } catch {}
  return {};
}

export async function saveMastery(points: Record<string, KnowledgePointMastery>): Promise<void> {
  await eApi().saveAppData(MASTERY_KEY, {
    version: 1,
    updatedAt: Date.now(),
    points,
  });
}

export async function updateMasteryPoint(
  pointId: string,
  updater: (p: KnowledgePointMastery) => KnowledgePointMastery,
): Promise<void> {
  const all = await loadMastery();
  if (all[pointId]) {
    all[pointId] = updater(all[pointId]);
    await saveMastery(all);
  }
}

// ═══════════════════════════════════════════════════════
// Question Cache (温数据)
// ═══════════════════════════════════════════════════════

const QUESTIONS_KEY = 'quiz-questions-cache';

export async function loadQuestionCache(): Promise<QuizQuestion[]> {
  try {
    const data = await eApi().loadAppData(QUESTIONS_KEY);
    if (data?.questions) return data.questions;
  } catch {}
  return [];
}

export async function saveQuestionCache(questions: QuizQuestion[]): Promise<void> {
  await eApi().saveAppData(QUESTIONS_KEY, {
    version: 1,
    updatedAt: Date.now(),
    questions,
  });
}

export async function addCachedQuestion(question: QuizQuestion): Promise<void> {
  const cache = await loadQuestionCache();
  cache.push(question);
  // 缓存上限 500 题
  if (cache.length > 500) cache.splice(0, cache.length - 500);
  await saveQuestionCache(cache);
}

export async function markQuestionUsed(questionId: string): Promise<void> {
  const cache = await loadQuestionCache();
  const q = cache.find(c => c.id === questionId);
  if (q) {
    q.usedCount += 1;
    q.lastUsedAt = Date.now();
    await saveQuestionCache(cache);
  }
}

// ═══════════════════════════════════════════════════════
// Session Store (冷数据)
// ═══════════════════════════════════════════════════════

export async function saveSession(session: QuizSession): Promise<void> {
  try {
    const root = await getQuizRoot();
    const month = new Date(session.startedAt).toISOString().slice(0, 7);
    const dir = `${root}/sessions/${month}`;
    await eApi().ensureDir(dir);
    await eApi().writeFile(
      `${dir}/session-${session.id}.json`,
      JSON.stringify(session, null, 2),
    );
  } catch (e) {
    console.warn('Failed to save quiz session to disk:', e);
    // Fallback: save to localStorage
    const key = `quiz_session_${session.id}`;
    localStorage.setItem(key, JSON.stringify(session));
  }
}

export async function loadSession(sessionId: string): Promise<QuizSession | null> {
  // Try localStorage fallback first
  try {
    const lsKey = `quiz_session_${sessionId}`;
    const lsData = localStorage.getItem(lsKey);
    if (lsData) return JSON.parse(lsData);
  } catch {}
  return null;
}

/** 从 localStorage 加载近期 session 列表 */
export function loadRecentSessions(): QuizSession[] {
  try {
    const raw = localStorage.getItem('quiz_recent_sessions');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveRecentSessions(sessions: QuizSession[]): void {
  // 只保留最近 50 条摘要
  const trimmed = sessions.slice(0, 50);
  localStorage.setItem('quiz_recent_sessions', JSON.stringify(trimmed));
}

// ═══════════════════════════════════════════════════════
// Stats Store (温数据)
// ═══════════════════════════════════════════════════════

const STATS_KEY = 'quiz-stats';

const EMPTY_STATS: QuizStats = {
  totalSessions: 0,
  totalQuestions: 0,
  totalTimeMs: 0,
  avgScore: 0,
  streakDays: 0,
  lastActiveAt: 0,
  byDate: {},
  byTag: {},
};

export async function loadStats(): Promise<QuizStats> {
  try {
    const data = await eApi().loadAppData(STATS_KEY);
    if (data) return { ...EMPTY_STATS, ...data };
  } catch {}
  return { ...EMPTY_STATS };
}

export async function saveStats(stats: QuizStats): Promise<void> {
  await eApi().saveAppData(STATS_KEY, stats);
}

/** 记录一次 session 完成后的统计更新 */
export async function recordSessionStats(session: QuizSession): Promise<void> {
  const stats = await loadStats();
  const now = Date.now();
  const dateKey = new Date(now).toISOString().slice(0, 10);

  stats.totalSessions += 1;
  stats.totalQuestions += session.attempts.length;
  stats.lastActiveAt = now;

  if (session.finishedAt && session.startedAt) {
    stats.totalTimeMs += session.finishedAt - session.startedAt;
  }

  // 平均分
  const scores = session.attempts.map(a => a.evaluation.totalScore);
  const sessionAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  stats.avgScore = stats.totalSessions === 1
    ? sessionAvg
    : (stats.avgScore * (stats.totalSessions - 1) + sessionAvg) / stats.totalSessions;

  // 日期统计
  if (!stats.byDate[dateKey]) {
    stats.byDate[dateKey] = { sessions: 0, questions: 0, avgScore: 0 };
  }
  const dd = stats.byDate[dateKey];
  dd.sessions += 1;
  dd.questions += session.attempts.length;
  dd.avgScore = (dd.avgScore * (dd.sessions - 1) + sessionAvg) / dd.sessions;

  // 标签统计
  for (const attempt of session.attempts) {
    for (const tag of attempt.question.tags) {
      if (!stats.byTag[tag]) stats.byTag[tag] = { attempts: 0, avgScore: 0 };
      const bt = stats.byTag[tag];
      bt.attempts += 1;
      bt.avgScore = (bt.avgScore * (bt.attempts - 1) + attempt.evaluation.totalScore) / bt.attempts;
    }
  }

  // 连续天数
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  if (stats.byDate[yesterday]) {
    stats.streakDays += 1;
  } else if (!stats.byDate[dateKey] || stats.byDate[dateKey].sessions <= 1) {
    stats.streakDays = 1;
  }

  await saveStats(stats);
}

// ═══════════════════════════════════════════════════════
// Settings (热数据 — localStorage)
// ═══════════════════════════════════════════════════════

const SETTINGS_LS_KEY = 'guyue_kb_quiz_settings';

export function loadSettings(): QuizSettings {
  // Always read AI Chat config for provider/apiKey/model as source of truth
  let chatProvider: string = 'gemini';
  let chatApiKey = '';
  let chatModel = 'gemini-2.5-flash';
  let chatBaseUrl = '';
  try {
    const chatCfg = localStorage.getItem('guyue_chat_config');
    if (chatCfg) {
      const cc = JSON.parse(chatCfg);
      chatProvider = cc.provider || 'gemini';
      chatApiKey = cc.apiKey || '';
      chatModel = cc.model || 'gemini-2.5-flash';
      if (cc.baseUrl) chatBaseUrl = cc.baseUrl.replace(/\/+$/, '');
    }
  } catch {}

  // Try loading saved quiz settings
  try {
    const raw = localStorage.getItem(SETTINGS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.llmConfig) {
        // Ensure provider is always set (migrate old settings without provider)
        if (!parsed.llmConfig.provider) {
          parsed.llmConfig.provider = chatProvider;
        }
        // If no apiKey in saved settings, use from chat config
        if (!parsed.llmConfig.apiKey && chatApiKey) {
          parsed.llmConfig.apiKey = chatApiKey;
          parsed.llmConfig.model = chatModel;
          parsed.llmConfig.provider = chatProvider;
          if (chatBaseUrl) parsed.llmConfig.baseUrl = chatBaseUrl;
        }
        return parsed;
      }
    }
  } catch {}

  return {
    defaultSessionConfig: {
      totalQuestions: 10,
      reviewRatio: 0.4,
      weakPointRatio: 0.3,
      newKnowledgeRatio: 0.2,
      randomReviewRatio: 0.1,
    },
    preferredDifficulty: 3,
    enableAutoReview: false,
    llmConfig: {
      provider: chatProvider as any,
      apiKey: chatApiKey,
      model: chatModel,
      baseUrl: chatBaseUrl,
    },
  };
}

export function saveSettings(settings: QuizSettings): void {
  localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(settings));
}
