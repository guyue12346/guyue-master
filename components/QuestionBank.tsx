import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { exportReactNodeToPdf } from '../utils/markdownPdfExport';
import { AVAILABLE_MODELS, ChatMessage, ChatService, ChatConfig } from '../services/chatService';
import { API_PROVIDER_LABELS, loadProfiles } from '../utils/apiProfileService';
import { hasUnifiedFileStorage, loadLocalJson, loadUnifiedJson, saveUnifiedJson } from '../utils/unifiedStorage';
import type { ApiProfile } from '../types';

interface QuestionCategory {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
}

interface QuestionItem {
  id: string;
  title: string;
  categoryId: string;
  question: string;
  answer: string;
  solutions: QuestionSolution[];
  summary: string;
  difficulty: number;
  tags: string[];
  note: string;
  methodIds: string[];
  methodId?: string;
  attributes?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

interface QuestionSolution {
  id: string;
  note: string;
  content: string;
}

interface SheetItem extends QuestionItem {
  sourceQuestionId: string;
}

interface MethodItem {
  id: string;
  title: string;
  categoryId: string;
  content: string;
  summary: string;
  tags: string[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

type ViewMode = 'read' | 'edit' | 'browse';
type ContentMode = 'questions' | 'methods';
type MethodViewMode = 'read' | 'edit';
type ExportScope = 'full' | 'questions' | 'answers';
type SheetDensity = 'compact' | 'normal' | 'loose';
type SheetAnswerLayout = 'inline' | 'separate';
type OcrImageRole = 'question' | 'answer';

interface QuestionBankData {
  categories: QuestionCategory[];
  questions: QuestionItem[];
}

interface MethodLibraryData {
  categories: QuestionCategory[];
  methods: MethodItem[];
}

interface AiDraft {
  profileId: string;
  model: string;
}

interface QuestionBankUiState {
  contentMode: ContentMode;
  activeCategoryId: string;
  activeQuestionId: string;
  activeMethodCategoryId: string;
  activeMethodId: string;
  viewMode: ViewMode;
  methodViewMode: MethodViewMode;
  isSidebarCollapsed: boolean;
  isQuestionActionsOpen: boolean;
  search: string;
}

interface OcrImageSlot {
  file: File | null;
  preview: string;
  base64: string;
}

type CategoryModalState =
  | { mode: 'create'; collection: ContentMode; parentId?: string; name: string }
  | { mode: 'rename'; collection: ContentMode; category: QuestionCategory; name: string };

type QuestionNameModalState = { question: QuestionItem; name: string };
type MethodNameModalState = { method: MethodItem; name: string };

type ConfirmDialogState =
  | { type: 'category'; collection: ContentMode; category: QuestionCategory }
  | { type: 'question'; question: QuestionItem }
  | { type: 'method'; method: MethodItem };

const STORAGE_KEY = 'guyue_question_bank_v1';
const METHOD_STORAGE_KEY = 'guyue_method_library_v1';
const AI_CONFIG_KEY = 'guyue_question_bank_ai_config_v1';
const UI_STATE_KEY = 'guyue_question_bank_ui_state_v1';
const STORE_KEY_QUESTION_BANK = 'question-bank';
const STORE_KEY_METHOD_LIBRARY = 'question-bank-method-library';
const STORE_KEY_AI_CONFIG = 'question-bank-ai-config';
const STORE_KEY_UI_STATE = 'question-bank-ui-state';
const SUPPORTED_AI_PROVIDERS = new Set(['zenmux', 'gemini', 'openai', 'anthropic', 'deepseek', 'zhipu', 'moonshot', 'minimax', 'ollama', 'custom']);

const nowId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const defaultUiState = (): QuestionBankUiState => ({
  contentMode: 'questions',
  activeCategoryId: '',
  activeQuestionId: '',
  activeMethodCategoryId: '',
  activeMethodId: '',
  viewMode: 'read',
  methodViewMode: 'read',
  isSidebarCollapsed: false,
  isQuestionActionsOpen: true,
  search: '',
});

const loadUiState = (): QuestionBankUiState => {
  if (typeof window === 'undefined') return defaultUiState();
  return loadLocalJson({
    localStorageKey: UI_STATE_KEY,
    defaultValue: defaultUiState,
    normalize: normalizeUiState,
  });
};

const saveUiState = (state: QuestionBankUiState) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_UI_STATE,
      localStorageKey: UI_STATE_KEY,
      defaultValue: defaultUiState,
      normalize: normalizeUiState,
    },
    state,
  );
};

function normalizeUiState(source: any): QuestionBankUiState {
  const fallback = defaultUiState();
  return {
    contentMode: source?.contentMode === 'methods' ? 'methods' : fallback.contentMode,
    activeCategoryId: typeof source?.activeCategoryId === 'string' ? source.activeCategoryId : '',
    activeQuestionId: typeof source?.activeQuestionId === 'string' ? source.activeQuestionId : '',
    activeMethodCategoryId: typeof source?.activeMethodCategoryId === 'string' ? source.activeMethodCategoryId : '',
    activeMethodId: typeof source?.activeMethodId === 'string' ? source.activeMethodId : '',
    viewMode: source?.viewMode === 'edit' || source?.viewMode === 'browse' ? source.viewMode : fallback.viewMode,
    methodViewMode: source?.methodViewMode === 'edit' ? 'edit' : fallback.methodViewMode,
    isSidebarCollapsed: Boolean(source?.isSidebarCollapsed),
    isQuestionActionsOpen: typeof source?.isQuestionActionsOpen === 'boolean' ? source.isQuestionActionsOpen : fallback.isQuestionActionsOpen,
    search: typeof source?.search === 'string' ? source.search : '',
  };
}

const defaultData = (): QuestionBankData => ({
  categories: [
    {
      id: nowId('cat'),
      name: '数学',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  questions: [],
});

const defaultMethodData = (): MethodLibraryData => ({
  categories: [
    {
      id: nowId('cat'),
      name: '解题方法',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  methods: [],
});

const normalizeQuestionBankData = (source: any): QuestionBankData => {
  const fallback = defaultData();
  const rawCategories = Array.isArray(source?.categories) ? source.categories : fallback.categories;
  const categories = rawCategories
    .map((category: any): QuestionCategory | null => {
      const name = String(category?.name || '').trim();
      if (!name) return null;
      return {
        id: String(category?.id || nowId('cat')),
        name,
        parentId: typeof category?.parentId === 'string' && category.parentId ? category.parentId : undefined,
        createdAt: Number(category?.createdAt) || Date.now(),
        updatedAt: Number(category?.updatedAt) || Date.now(),
      };
    })
    .filter((category: QuestionCategory | null): category is QuestionCategory => !!category);
  const finalCategories = categories.length > 0 ? categories : fallback.categories;
  const validCategoryIds = new Set(finalCategories.map(category => category.id));
  const fallbackCategoryId = finalCategories[0].id;
  const questions = Array.isArray(source?.questions)
    ? source.questions.map((question: any): QuestionItem => {
        const rawCategoryId = typeof question?.categoryId === 'string' ? question.categoryId : '';
        return {
          id: String(question?.id || nowId('q')),
          title: String(question?.title || '未命名题目'),
          categoryId: validCategoryIds.has(rawCategoryId) ? rawCategoryId : fallbackCategoryId,
          question: String(question?.question || ''),
          answer: String(question?.answer || ''),
          solutions: normalizeSolutions(question?.solutions, question?.answer),
          summary: String(question?.summary || ''),
          difficulty: normalizeDifficulty(question?.difficulty),
          tags: Array.isArray(question?.tags) ? question.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
          note: typeof question?.note === 'string' ? question.note : attributesToNote(question?.attributes),
          methodIds: normalizeMethodIds(question?.methodIds, question?.methodId),
          methodId: typeof question?.methodId === 'string' && question.methodId ? question.methodId : undefined,
          attributes: undefined,
          createdAt: Number(question?.createdAt) || Date.now(),
          updatedAt: Number(question?.updatedAt) || Date.now(),
        };
      })
    : [];

  return { categories: finalCategories, questions };
};

const normalizeMethodLibraryData = (source: any): MethodLibraryData => {
  const fallback = defaultMethodData();
  const rawCategories = Array.isArray(source?.categories) ? source.categories : fallback.categories;
  const categories = rawCategories
    .map((category: any): QuestionCategory | null => {
      const name = String(category?.name || '').trim();
      if (!name) return null;
      return {
        id: String(category?.id || nowId('cat')),
        name,
        parentId: typeof category?.parentId === 'string' && category.parentId ? category.parentId : undefined,
        createdAt: Number(category?.createdAt) || Date.now(),
        updatedAt: Number(category?.updatedAt) || Date.now(),
      };
    })
    .filter((category: QuestionCategory | null): category is QuestionCategory => !!category);
  const finalCategories = categories.length > 0 ? categories : fallback.categories;
  const validCategoryIds = new Set(finalCategories.map(category => category.id));
  const fallbackCategoryId = finalCategories[0].id;
  const methods = Array.isArray(source?.methods)
    ? source.methods.map((method: any): MethodItem => {
        const rawCategoryId = typeof method?.categoryId === 'string' ? method.categoryId : '';
        return {
          id: String(method?.id || nowId('method')),
          title: String(method?.title || '未命名方法'),
          categoryId: validCategoryIds.has(rawCategoryId) ? rawCategoryId : fallbackCategoryId,
          content: String(method?.content || ''),
          summary: String(method?.summary || ''),
          tags: Array.isArray(method?.tags) ? method.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
          note: String(method?.note || ''),
          createdAt: Number(method?.createdAt) || Date.now(),
          updatedAt: Number(method?.updatedAt) || Date.now(),
        };
      })
    : [];

  return { categories: finalCategories, methods };
};

const loadData = (): QuestionBankData => {
  return loadLocalJson({
    localStorageKey: STORAGE_KEY,
    defaultValue: defaultData,
    normalize: normalizeQuestionBankData,
  });
};

const loadDataFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_QUESTION_BANK,
    localStorageKey: STORAGE_KEY,
    defaultValue: defaultData,
    normalize: normalizeQuestionBankData,
  });
};

const saveData = (data: QuestionBankData) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_QUESTION_BANK,
      localStorageKey: STORAGE_KEY,
      defaultValue: defaultData,
      normalize: normalizeQuestionBankData,
    },
    data,
  );
};

const loadMethodData = (): MethodLibraryData => {
  return loadLocalJson({
    localStorageKey: METHOD_STORAGE_KEY,
    defaultValue: defaultMethodData,
    normalize: normalizeMethodLibraryData,
  });
};

const loadMethodDataFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_METHOD_LIBRARY,
    localStorageKey: METHOD_STORAGE_KEY,
    defaultValue: defaultMethodData,
    normalize: normalizeMethodLibraryData,
  });
};

const saveMethodData = (data: MethodLibraryData) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_METHOD_LIBRARY,
      localStorageKey: METHOD_STORAGE_KEY,
      defaultValue: defaultMethodData,
      normalize: normalizeMethodLibraryData,
    },
    data,
  );
};

const loadAiDraft = (): AiDraft => {
  return loadLocalJson({
    localStorageKey: AI_CONFIG_KEY,
    defaultValue: () => ({ profileId: '', model: '' }),
    normalize: normalizeAiDraft,
  });
};

const loadAiDraftFromStorage = () => {
  return loadUnifiedJson({
    appDataKey: STORE_KEY_AI_CONFIG,
    localStorageKey: AI_CONFIG_KEY,
    defaultValue: () => ({ profileId: '', model: '' }),
    normalize: normalizeAiDraft,
  });
};

const saveAiDraft = (draft: AiDraft) => {
  saveUnifiedJson(
    {
      appDataKey: STORE_KEY_AI_CONFIG,
      localStorageKey: AI_CONFIG_KEY,
      defaultValue: () => ({ profileId: '', model: '' }),
      normalize: normalizeAiDraft,
    },
    draft,
  );
};

const normalizeAiDraft = (source: any): AiDraft => ({
  profileId: typeof source?.profileId === 'string' ? source.profileId : '',
  model: typeof source?.model === 'string' ? source.model : '',
});

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseTags = (value: string) =>
  value
    .split(/[,，;；\n]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);

const normalizeMethodIds = (methodIds: unknown, fallbackMethodId?: unknown) => {
  const ids = Array.isArray(methodIds)
    ? methodIds.map(id => String(id).trim()).filter(Boolean)
    : [];
  const fallback = typeof fallbackMethodId === 'string' ? fallbackMethodId.trim() : '';
  return Array.from(new Set([...ids, ...(fallback ? [fallback] : [])]));
};

const createSolution = (content = '', note = ''): QuestionSolution => ({
  id: nowId('sol'),
  note,
  content,
});

const isEmptySolution = (solution: QuestionSolution) => !solution.note.trim() && !solution.content.trim();

const normalizeSolutions = (solutions: unknown, fallbackAnswer?: unknown): QuestionSolution[] => {
  const normalized = Array.isArray(solutions)
    ? solutions
        .map((solution: any): QuestionSolution | null => {
          const content = String(solution?.content ?? solution?.answer ?? solution?.text ?? '').trim();
          const note = String(solution?.note ?? solution?.remark ?? solution?.description ?? '').trim();
          if (!content && !note) return null;
          return {
            id: String(solution?.id || nowId('sol')),
            note,
            content,
          };
        })
        .filter((solution: QuestionSolution | null): solution is QuestionSolution => !!solution)
    : [];
  if (normalized.length > 0) return normalized;
  const fallback = String(fallbackAnswer || '').trim();
  return fallback ? [createSolution(fallback)] : [createSolution()];
};

const solutionTextForSearch = (solutions: QuestionSolution[]) =>
  solutions.map(solution => `${solution.note}\n${solution.content}`).join('\n');

const solutionMarkdownParts = (solutions: QuestionSolution[], heading = '解答') =>
  solutions.flatMap((solution, index) => {
    const label = solutions.length > 1 ? `${heading} ${index + 1}` : heading;
    const parts = [`### ${label}`, ''];
    if (solution.note.trim()) parts.push(toBlockquoteMarkdown(solution.note), '');
    parts.push(solution.content || '（空）', '');
    return parts;
  });

const normalizeDifficulty = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.3;
  return Math.round(Math.min(1, Math.max(0, parsed)) * 10) / 10;
};

const formatDifficulty = (value: unknown) => normalizeDifficulty(value).toFixed(1);

const appendDraftText = (current: string, addition: string) => {
  const next = addition.trim();
  if (!next) return current;
  return current.trim() ? `${current.trim()}\n\n${next}` : next;
};

const attributesToNote = (attributes: unknown) => {
  if (!attributes || typeof attributes !== 'object') return '';
  return Object.entries(attributes as Record<string, unknown>)
    .map(([key, value]) => value ? `${key}: ${String(value)}` : key)
    .join('\n');
};

const toBlockquoteMarkdown = (value: string) =>
  value
    .split('\n')
    .map(line => line.trim() ? `> ${line}` : '>')
    .join('\n');

const getModelFallback = (profile?: ApiProfile) => {
  if (!profile) return '';
  return AVAILABLE_MODELS[profile.provider]?.[0]?.id || '';
};

const normalizeBaseUrl = (profile: ApiProfile) => {
  const raw = profile.baseUrl?.trim();
  if (!raw) return undefined;
  if (profile.provider === 'gemini') return undefined;
  if (profile.provider === 'custom' || profile.provider === 'zenmux') return raw;
  if (/\/(v1|v4|api\/paas\/v4)\/?$/.test(raw)) return raw.replace(/\/$/, '');
  if (profile.provider === 'zhipu') return `${raw.replace(/\/$/, '')}/api/paas/v4`;
  return `${raw.replace(/\/$/, '')}/v1`;
};

const fileToAttachment = (file: File) =>
  new Promise<{ base64: string; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1] || '';
      resolve({ base64, dataUrl });
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

const extractJsonObject = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('模型没有返回可解析的 JSON');
  return JSON.parse(raw.slice(start, end + 1));
};

const buildSheetMarkdown = (questions: QuestionItem[], scope: ExportScope, sheetTitle = '题单', sheetSubtitle = '', answerLayout: SheetAnswerLayout = 'inline') => {
  const title = scope === 'questions' ? `${sheetTitle}（仅题目）` : scope === 'answers' ? `${sheetTitle}（仅答案）` : sheetTitle;
  if (scope === 'full' && answerLayout === 'separate') {
    return [
      `# ${title}`,
      sheetSubtitle ? `> ${sheetSubtitle}` : '',
      '',
      '## 题目',
      '',
      ...questions.flatMap((question, index) => {
        const parts = [`### ${index + 1}. ${question.title || '未命名题目'}`, '', question.question || '（空）', ''];
        if (question.note.trim()) parts.push(toBlockquoteMarkdown(question.note), '');
        return parts;
      }),
      '## 答案',
      '',
      ...questions.flatMap((question, index) => [
        `### ${index + 1}. ${question.title || '未命名题目'}`,
        '',
        ...solutionMarkdownParts(question.solutions, '解答').map(line => line.replace(/^### /, '#### ')),
      ]),
    ].join('\n');
  }
  return [
    `# ${title}`,
    sheetSubtitle ? `> ${sheetSubtitle}` : '',
    '',
    ...questions.flatMap((question, index) => {
      const parts = [`## ${index + 1}. ${question.title || '未命名题目'}`, ''];
      if (scope !== 'answers') {
        parts.push('### 题目', '', question.question || '（空）', '');
        if (question.note.trim()) parts.push(toBlockquoteMarkdown(question.note), '');
      }
      if (scope !== 'questions') {
        parts.push(...solutionMarkdownParts(question.solutions, '解答'));
      }
      return parts;
    }),
  ].join('\n');
};

const downloadTextFile = (content: string, fileName: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const buildWordHtml = (questions: QuestionItem[], scope: ExportScope, sheetTitle = '题单', sheetSubtitle = '', answerLayout: SheetAnswerLayout = 'inline') => {
  const markdown = buildSheetMarkdown(questions, scope, sheetTitle, sheetSubtitle, answerLayout);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>题单</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; color: #111827; }
    pre { white-space: pre-wrap; font-family: inherit; }
  </style>
</head>
<body>
  <pre>${escapeHtml(markdown)}</pre>
</body>
</html>`;
};

const getDescendants = (categories: QuestionCategory[], categoryId: string) => {
  const ids = new Set<string>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    categories.forEach(category => {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    });
  }
  return ids;
};

const categoryPath = (categories: QuestionCategory[], categoryId?: string) => {
  if (!categoryId) return '';
  const byId = new Map(categories.map(category => [category.id, category]));
  const names: string[] = [];
  let current = byId.get(categoryId);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(' / ');
};

const SolutionPreview: React.FC<{
  solutions: QuestionSolution[];
  titleClassName?: string;
  titleMode?: 'all' | 'multiple' | 'none';
}> = ({ solutions, titleClassName = 'mb-2 text-sm font-semibold text-gray-500', titleMode = 'all' }) => (
  <div className="space-y-5">
    {solutions.map((solution, index) => {
      const shouldShowTitle = titleMode === 'all' || (titleMode === 'multiple' && solutions.length > 1);
      return (
        <div key={solution.id} className={index > 0 ? 'border-t border-gray-100 pt-5' : ''}>
          {shouldShowTitle && <div className={titleClassName}>{solutions.length > 1 ? `解答 ${index + 1}` : '解答'}</div>}
          {solution.note.trim() && <MarkdownContent content={toBlockquoteMarkdown(solution.note)} />}
          <MarkdownContent content={solution.content || '（空）'} />
        </div>
      );
    })}
  </div>
);

const AnswerSection: React.FC<{
  solutions: QuestionSolution[];
  hidden: boolean;
  onToggle: () => void;
  className?: string;
  titleClassName?: string;
}> = ({ solutions, hidden, onToggle, className = '', titleClassName = 'text-sm font-semibold text-gray-500' }) => (
  <section className={className}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className={titleClassName}>解答</div>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        {hidden ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {hidden ? '展开解答' : '隐藏解答'}
      </button>
    </div>
    {hidden ? (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
        解答已隐藏
      </div>
    ) : (
      <SolutionPreview solutions={solutions} titleClassName="mb-2 text-sm font-semibold text-gray-500" titleMode="multiple" />
    )}
  </section>
);

const PrintableSheet: React.FC<{
  questions: QuestionItem[];
  scope: ExportScope;
  title?: string;
  subtitle?: string;
  density?: SheetDensity;
  answerLayout?: SheetAnswerLayout;
}> = ({ questions, scope, title = '题单', subtitle = '', density = 'normal', answerLayout = 'inline' }) => {
  const spacingClass = density === 'compact' ? 'space-y-6' : density === 'loose' ? 'space-y-14' : 'space-y-10';
  const renderQuestionBlock = (question: QuestionItem, index: number) => (
    <section key={`question-${question.id}`} className="break-inside-avoid border-b border-gray-200 pb-8">
      <h2 className="mb-4 text-xl font-semibold">{index + 1}. {question.title || '未命名题目'}</h2>
      <div className="mb-6">
        <div className="mb-2 text-sm font-semibold text-gray-500">题目</div>
        <MarkdownContent content={question.question || '（空）'} />
        {question.note.trim() && <MarkdownContent content={toBlockquoteMarkdown(question.note)} />}
      </div>
      {scope === 'full' && answerLayout === 'inline' && (
        <div>
          <SolutionPreview solutions={question.solutions} />
        </div>
      )}
    </section>
  );
  const renderAnswerBlock = (question: QuestionItem, index: number) => (
    <section key={`answer-${question.id}`} className="break-inside-avoid border-b border-gray-200 pb-8">
      <h2 className="mb-4 text-xl font-semibold">{index + 1}. {question.title || '未命名题目'}</h2>
      <SolutionPreview solutions={question.solutions} />
    </section>
  );

  return (
    <div className="bg-white text-gray-900">
      <h1 className="mb-8 text-3xl font-bold">
        {scope === 'questions' ? `${title}（仅题目）` : scope === 'answers' ? `${title}（仅答案）` : title}
      </h1>
      {subtitle && <div className="mb-8 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">{subtitle}</div>}
      {scope === 'answers' ? (
        <div className={spacingClass}>{questions.map(renderAnswerBlock)}</div>
      ) : scope === 'full' && answerLayout === 'separate' ? (
        <div>
          <h2 className="mb-6 text-2xl font-bold">题目</h2>
          <div className={spacingClass}>{questions.map(renderQuestionBlock)}</div>
          <h2 className="mb-6 mt-14 text-2xl font-bold">答案</h2>
          <div className={spacingClass}>{questions.map(renderAnswerBlock)}</div>
        </div>
      ) : (
        <div className={spacingClass}>{questions.map(renderQuestionBlock)}</div>
      )}
    </div>
  );
};

const CategoryTree: React.FC<{
  categories: QuestionCategory[];
  activeId: string;
  counts: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: (parentId?: string) => void;
  onRename: (category: QuestionCategory) => void;
  onDelete: (category: QuestionCategory) => void;
}> = ({ categories, activeId, counts, onSelect, onAdd, onRename, onDelete }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const childrenByParent = useMemo(() => {
    const map = new Map<string, QuestionCategory[]>();
    categories.forEach(category => {
      const parent = category.parentId || '';
      map.set(parent, [...(map.get(parent) || []), category]);
    });
    return map;
  }, [categories]);

  const renderNode = (category: QuestionCategory, depth = 0): React.ReactNode => {
    const children = childrenByParent.get(category.id) || [];
    const isCollapsed = collapsed.has(category.id);
    const active = activeId === category.id;
    return (
      <div key={category.id}>
        <div
          className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
            active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <button
            onClick={() => {
              const next = new Set(collapsed);
              if (next.has(category.id)) next.delete(category.id);
              else next.add(category.id);
              setCollapsed(next);
            }}
            className="flex h-5 w-5 items-center justify-center text-gray-400"
          >
            {children.length ? (isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <span className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => onSelect(category.id)} className="min-w-0 flex-1 truncate text-left">
            {category.name}
          </button>
          <span className="rounded bg-gray-100 px-1.5 text-[11px] text-gray-500">{counts[category.id] || 0}</span>
          <div className="hidden items-center gap-0.5 group-hover:flex">
            <button onClick={() => onAdd(category.id)} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-500" title="添加子分类">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onRename(category)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="重命名">
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(category)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="删除分类">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!isCollapsed && children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return <>{(childrenByParent.get('') || []).map(category => renderNode(category))}</>;
};

export const QuestionBank: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [uiStateSeed] = useState<QuestionBankUiState>(() => loadUiState());
  const [contentMode, setContentMode] = useState<ContentMode>(() => uiStateSeed.contentMode);
  const [data, setData] = useState<QuestionBankData>(loadData);
  const [methodData, setMethodData] = useState<MethodLibraryData>(loadMethodData);
  const [isQuestionDataReady, setIsQuestionDataReady] = useState(() => !hasUnifiedFileStorage());
  const [isMethodDataReady, setIsMethodDataReady] = useState(() => !hasUnifiedFileStorage());
  const [activeCategoryId, setActiveCategoryId] = useState<string>(() => uiStateSeed.activeCategoryId);
  const [activeQuestionId, setActiveQuestionId] = useState<string>(() => uiStateSeed.activeQuestionId);
  const [activeMethodCategoryId, setActiveMethodCategoryId] = useState<string>(() => uiStateSeed.activeMethodCategoryId);
  const [activeMethodId, setActiveMethodId] = useState<string>(() => uiStateSeed.activeMethodId);
  const [viewMode, setViewMode] = useState<ViewMode>(() => uiStateSeed.viewMode);
  const [methodViewMode, setMethodViewMode] = useState<MethodViewMode>(() => uiStateSeed.methodViewMode);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => uiStateSeed.isSidebarCollapsed);
  const [isQuestionActionsOpen, setIsQuestionActionsOpen] = useState(() => uiStateSeed.isQuestionActionsOpen);
  const [hiddenAnswerQuestionIds, setHiddenAnswerQuestionIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState(() => uiStateSeed.search);
  const [isSheetPageOpen, setIsSheetPageOpen] = useState(false);
  const [sheetItems, setSheetItems] = useState<SheetItem[]>([]);
  const [sheetTitle, setSheetTitle] = useState('题单');
  const [sheetSubtitle, setSheetSubtitle] = useState('');
  const [sheetDensity, setSheetDensity] = useState<SheetDensity>('normal');
  const [sheetAnswerLayout, setSheetAnswerLayout] = useState<SheetAnswerLayout>('inline');
  const [editingSheetItemId, setEditingSheetItemId] = useState('');
  const [draggingSheetItemId, setDraggingSheetItemId] = useState('');
  const [exportScope, setExportScope] = useState<ExportScope>('full');
  const [toast, setToast] = useState('');
  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [questionNameModal, setQuestionNameModal] = useState<QuestionNameModalState | null>(null);
  const [methodNameModal, setMethodNameModal] = useState<MethodNameModalState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [previewMethodId, setPreviewMethodId] = useState('');
  const [isMethodPickerOpen, setIsMethodPickerOpen] = useState(false);
  const [methodPickerPreviewId, setMethodPickerPreviewId] = useState('');

  const [titleDraft, setTitleDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [linkedMethodDrafts, setLinkedMethodDrafts] = useState<string[]>([]);
  const [tagsDraft, setTagsDraft] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [difficultyDraft, setDifficultyDraft] = useState('0.3');
  const [noteDraft, setNoteDraft] = useState('');
  const [questionDraft, setQuestionDraft] = useState('');
  const [solutionDrafts, setSolutionDrafts] = useState<QuestionSolution[]>(() => [createSolution()]);
  const [methodTitleDraft, setMethodTitleDraft] = useState('');
  const [methodCategoryDraft, setMethodCategoryDraft] = useState('');
  const [methodTagsDraft, setMethodTagsDraft] = useState('');
  const [methodSummaryDraft, setMethodSummaryDraft] = useState('');
  const [methodNoteDraft, setMethodNoteDraft] = useState('');
  const [methodContentDraft, setMethodContentDraft] = useState('');

  const [isAiOpen, setIsAiOpen] = useState(false);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [aiDraft, setAiDraft] = useState<AiDraft>(loadAiDraft);
  const [aiPrompt, setAiPrompt] = useState('请进行图片识别，不要自行求解。对题目和解答分别识别成结构清晰的 Markdown，公式使用 LaTeX；修正明显 OCR 错字、断行和排版问题，不确定内容用 [无法识别] 标注。');
  const [questionImage, setQuestionImage] = useState<OcrImageSlot>({ file: null, preview: '', base64: '' });
  const [answerImage, setAnswerImage] = useState<OcrImageSlot>({ file: null, preview: '', base64: '' });
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    if (!hasUnifiedFileStorage()) return;
    let cancelled = false;

    loadDataFromStorage()
      .then(next => {
        if (cancelled) return;
        setData(next);
        setIsQuestionDataReady(true);
      })
      .catch(() => {
        if (!cancelled) setIsQuestionDataReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUnifiedFileStorage()) return;
    let cancelled = false;

    loadMethodDataFromStorage()
      .then(next => {
        if (cancelled) return;
        setMethodData(next);
        setIsMethodDataReady(true);
      })
      .catch(() => {
        if (!cancelled) setIsMethodDataReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasUnifiedFileStorage()) return;
    let cancelled = false;

    loadAiDraftFromStorage()
      .then(next => {
        if (!cancelled) setAiDraft(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isQuestionDataReady) return;
    saveData(data);
  }, [data, isQuestionDataReady]);

  useEffect(() => {
    if (!isMethodDataReady) return;
    saveMethodData(methodData);
  }, [methodData, isMethodDataReady]);
  useEffect(() => {
    saveUiState({
      contentMode,
      activeCategoryId,
      activeQuestionId,
      activeMethodCategoryId,
      activeMethodId,
      viewMode,
      methodViewMode,
      isSidebarCollapsed,
      isQuestionActionsOpen,
      search,
    });
  }, [
    contentMode,
    activeCategoryId,
    activeQuestionId,
    activeMethodCategoryId,
    activeMethodId,
    viewMode,
    methodViewMode,
    isSidebarCollapsed,
    isQuestionActionsOpen,
    search,
  ]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error('Question bank fullscreen failed:', error);
      showToast('无法切换全屏');
    }
  };

  const categories = data.categories;
  const questions = data.questions;
  const activeQuestion = questions.find(question => question.id === activeQuestionId) || questions[0];
  const methodCategories = methodData.categories;
  const methods = methodData.methods;
  const activeMethod = methods.find(method => method.id === activeMethodId) || methods[0];
  const activeQuestionMethods = activeQuestion ? activeQuestion.methodIds.map(id => methods.find(method => method.id === id)).filter((method): method is MethodItem => !!method) : [];
  const previewMethod = methods.find(method => method.id === previewMethodId);
  const methodPickerPreview = methods.find(method => method.id === methodPickerPreviewId) || methods[0];

  useEffect(() => {
    if (!categories.length) return;
    if (!activeCategoryId || !categories.some(category => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [activeCategoryId, categories]);

  useEffect(() => {
    if (!methodCategories.length) return;
    if (!activeMethodCategoryId || !methodCategories.some(category => category.id === activeMethodCategoryId)) {
      setActiveMethodCategoryId(methodCategories[0].id);
    }
  }, [activeMethodCategoryId, methodCategories]);

  useEffect(() => {
    if (!activeQuestionId && questions[0]) setActiveQuestionId(questions[0].id);
    if (activeQuestionId && !questions.find(question => question.id === activeQuestionId)) {
      setActiveQuestionId(questions[0]?.id || '');
    }
  }, [activeQuestionId, questions]);

  useEffect(() => {
    if (!activeMethodId && methods[0]) setActiveMethodId(methods[0].id);
    if (activeMethodId && !methods.find(method => method.id === activeMethodId)) {
      setActiveMethodId(methods[0]?.id || '');
    }
  }, [activeMethodId, methods]);

  useEffect(() => {
    if (!activeQuestion) {
      setTitleDraft('');
      setCategoryDraft('');
      setTagsDraft('');
      setSummaryDraft('');
      setDifficultyDraft('0.3');
      setNoteDraft('');
      setQuestionDraft('');
      setLinkedMethodDrafts([]);
      setSolutionDrafts([createSolution()]);
      return;
    }
    setTitleDraft(activeQuestion.title);
    setCategoryDraft(activeQuestion.categoryId);
    setLinkedMethodDrafts(activeQuestion.methodIds || normalizeMethodIds([], activeQuestion.methodId));
    setTagsDraft(activeQuestion.tags.join('；'));
    setSummaryDraft(activeQuestion.summary || '');
    setDifficultyDraft(formatDifficulty(activeQuestion.difficulty));
    setNoteDraft(activeQuestion.note || attributesToNote(activeQuestion.attributes));
    setQuestionDraft(activeQuestion.question);
    setSolutionDrafts(normalizeSolutions(activeQuestion.solutions, activeQuestion.answer));
  }, [activeQuestion?.id]);

  useEffect(() => {
    if (!activeMethod) {
      setMethodTitleDraft('');
      setMethodCategoryDraft('');
      setMethodTagsDraft('');
      setMethodSummaryDraft('');
      setMethodNoteDraft('');
      setMethodContentDraft('');
      return;
    }
    setMethodTitleDraft(activeMethod.title);
    setMethodCategoryDraft(activeMethod.categoryId);
    setMethodTagsDraft(activeMethod.tags.join('；'));
    setMethodSummaryDraft(activeMethod.summary || '');
    setMethodNoteDraft(activeMethod.note || '');
    setMethodContentDraft(activeMethod.content || '');
  }, [activeMethod?.id]);

  const categoryOptions = useMemo(() => {
    const byParent = new Map<string, QuestionCategory[]>();
    categories.forEach(category => {
      const parent = category.parentId || '';
      byParent.set(parent, [...(byParent.get(parent) || []), category]);
    });
    const list: Array<{ category: QuestionCategory; depth: number }> = [];
    const walk = (parentId = '', depth = 0) => {
      (byParent.get(parentId) || []).forEach(category => {
        list.push({ category, depth });
        walk(category.id, depth + 1);
      });
    };
    walk();
    return list;
  }, [categories]);

  const methodCategoryOptions = useMemo(() => {
    const byParent = new Map<string, QuestionCategory[]>();
    methodCategories.forEach(category => {
      const parent = category.parentId || '';
      byParent.set(parent, [...(byParent.get(parent) || []), category]);
    });
    const list: Array<{ category: QuestionCategory; depth: number }> = [];
    const walk = (parentId = '', depth = 0) => {
      (byParent.get(parentId) || []).forEach(category => {
        list.push({ category, depth });
        walk(category.id, depth + 1);
      });
    };
    walk();
    return list;
  }, [methodCategories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach(question => {
      counts[question.categoryId] = (counts[question.categoryId] || 0) + 1;
    });
    categories.forEach(category => {
      const descendants = getDescendants(categories, category.id);
      counts[category.id] = questions.filter(question => question.categoryId && descendants.has(question.categoryId)).length;
    });
    return counts;
  }, [categories, questions]);

  const methodCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    methods.forEach(method => {
      counts[method.categoryId] = (counts[method.categoryId] || 0) + 1;
    });
    methodCategories.forEach(category => {
      const descendants = getDescendants(methodCategories, category.id);
      counts[category.id] = methods.filter(method => method.categoryId && descendants.has(method.categoryId)).length;
    });
    return counts;
  }, [methodCategories, methods]);

  const methodSelectOptions = useMemo(
    () => [...methods].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    [methods],
  );

  const linkedMethodDraftItems = useMemo(
    () => linkedMethodDrafts.map(id => methods.find(method => method.id === id)).filter((method): method is MethodItem => !!method),
    [linkedMethodDrafts, methods],
  );

  const filteredQuestions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const categorySet = activeCategoryId ? getDescendants(categories, activeCategoryId) : new Set<string>();
    return questions.filter(question => {
      if (!categorySet.has(question.categoryId)) return false;
      if (!keyword) return true;
      const haystack = `${question.title}\n${question.summary}\n${question.question}\n${solutionTextForSearch(question.solutions)}\n${question.note}\n${formatDifficulty(question.difficulty)}\n${question.tags.join(' ')}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeCategoryId, categories, questions, search]);

  const filteredMethods = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const categorySet = activeMethodCategoryId ? getDescendants(methodCategories, activeMethodCategoryId) : new Set<string>();
    return methods.filter(method => {
      if (!categorySet.has(method.categoryId)) return false;
      if (!keyword) return true;
      const haystack = `${method.title}\n${method.summary}\n${method.content}\n${method.note}\n${method.tags.join(' ')}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeMethodCategoryId, methodCategories, methods, search]);

  useEffect(() => {
    if (viewMode === 'edit') return;
    if (filteredQuestions.length > 0 && !filteredQuestions.some(question => question.id === activeQuestionId)) {
      setActiveQuestionId(filteredQuestions[0].id);
    }
  }, [activeQuestionId, filteredQuestions, viewMode]);

  useEffect(() => {
    if (methodViewMode === 'edit') return;
    if (filteredMethods.length > 0 && !filteredMethods.some(method => method.id === activeMethodId)) {
      setActiveMethodId(filteredMethods[0].id);
    }
  }, [activeMethodId, filteredMethods, methodViewMode]);

  const selectedQuestions = useMemo(
    () => sheetItems,
    [sheetItems],
  );
  const selectedIds = useMemo(() => sheetItems.map(item => item.sourceQuestionId), [sheetItems]);

  const updateData = (updater: (current: QuestionBankData) => QuestionBankData) => {
    setData(current => updater(current));
  };

  const updateMethodData = (updater: (current: MethodLibraryData) => MethodLibraryData) => {
    setMethodData(current => updater(current));
  };

  const toggleAnswerVisibility = (questionId: string) => {
    setHiddenAnswerQuestionIds(current => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const handleAddCategory = (parentId?: string) => {
    setCategoryModal({ mode: 'create', collection: contentMode, parentId, name: '' });
  };

  const handleRenameCategory = (category: QuestionCategory) => {
    setCategoryModal({ mode: 'rename', collection: contentMode, category, name: category.name });
  };

  const handleRenameQuestion = (question: QuestionItem) => {
    setQuestionNameModal({ question, name: question.title });
  };

  const handleRenameMethod = (method: MethodItem) => {
    setMethodNameModal({ method, name: method.title });
  };

  const handleSubmitQuestionName = () => {
    if (!questionNameModal) return;
    const finalName = questionNameModal.name.trim() || '未命名题目';
    updateData(current => ({
      ...current,
      questions: current.questions.map(question => question.id === questionNameModal.question.id ? { ...question, title: finalName, updatedAt: Date.now() } : question),
    }));
    if (activeQuestionId === questionNameModal.question.id) setTitleDraft(finalName);
    setQuestionNameModal(null);
    showToast('题目已重命名');
  };

  const handleSubmitMethodName = () => {
    if (!methodNameModal) return;
    const finalName = methodNameModal.name.trim() || '未命名方法';
    updateMethodData(current => ({
      ...current,
      methods: current.methods.map(method => method.id === methodNameModal.method.id ? { ...method, title: finalName, updatedAt: Date.now() } : method),
    }));
    if (activeMethodId === methodNameModal.method.id) setMethodTitleDraft(finalName);
    setMethodNameModal(null);
    showToast('方法已重命名');
  };

  const handleSubmitCategory = () => {
    if (!categoryModal) return;
    const finalName = categoryModal.name.trim();
    if (!finalName) return;
    const updateCategoryData = categoryModal.collection === 'questions' ? updateData : updateMethodData;
    if (categoryModal.mode === 'rename') {
      if (finalName === categoryModal.category.name) {
        setCategoryModal(null);
        return;
      }
      updateCategoryData((current: any) => ({
        ...current,
        categories: current.categories.map(item => item.id === categoryModal.category.id ? { ...item, name: finalName, updatedAt: Date.now() } : item),
      }));
      setCategoryModal(null);
      return;
    }

    const category: QuestionCategory = {
      id: nowId('cat'),
      name: finalName,
      parentId: categoryModal.parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    updateCategoryData((current: any) => ({ ...current, categories: [...current.categories, category] }));
    if (categoryModal.collection === 'questions') setActiveCategoryId(category.id);
    else setActiveMethodCategoryId(category.id);
    setCategoryModal(null);
  };

  const handleDeleteCategory = (category: QuestionCategory) => {
    setConfirmDialog({ type: 'category', collection: contentMode, category });
  };

  const performDeleteCategory = (category: QuestionCategory, collection: ContentMode) => {
    const sourceCategories = collection === 'questions' ? categories : methodCategories;
    const deletedIds = getDescendants(sourceCategories, category.id);
    const remainingCategories = sourceCategories.filter(item => !deletedIds.has(item.id));
    if (remainingCategories.length === 0) {
      showToast('至少保留一个分类');
      return;
    }
    const remainingParentIds = new Set(remainingCategories.map(item => item.parentId).filter(Boolean) as string[]);
    const fallbackCategory = remainingCategories.find(item => !remainingParentIds.has(item.id)) || remainingCategories[0];
    if (collection === 'questions') {
      updateData(current => ({
        categories: current.categories.filter(item => !deletedIds.has(item.id)),
        questions: current.questions.map(question => deletedIds.has(question.categoryId) ? { ...question, categoryId: fallbackCategory.id, updatedAt: Date.now() } : question),
      }));
      if (deletedIds.has(activeCategoryId)) setActiveCategoryId(fallbackCategory.id);
      showToast(`分类已删除，相关题目已移动到「${fallbackCategory.name}」`);
    } else {
      updateMethodData(current => ({
        categories: current.categories.filter(item => !deletedIds.has(item.id)),
        methods: current.methods.map(method => deletedIds.has(method.categoryId) ? { ...method, categoryId: fallbackCategory.id, updatedAt: Date.now() } : method),
      }));
      if (deletedIds.has(activeMethodCategoryId)) setActiveMethodCategoryId(fallbackCategory.id);
      showToast(`分类已删除，相关方法已移动到「${fallbackCategory.name}」`);
    }
  };

  const handleCreateQuestion = () => {
    const categoryId = categories.some(category => category.id === activeCategoryId) ? activeCategoryId : '';
    if (!categoryId) {
      showToast(categories.length > 0 ? '请先选择分类再新建题目' : '请先创建分类');
      return;
    }
    const question: QuestionItem = {
      id: nowId('q'),
      title: '新题目',
      categoryId,
      question: '在这里输入题目，支持 Markdown 和 LaTeX，例如 $x^2+y^2=1$。',
      answer: '在这里输入解答。',
      solutions: [createSolution('在这里输入解答。')],
      summary: '',
      difficulty: 0.3,
      tags: [],
      note: '',
      methodIds: [],
      methodId: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    updateData(current => ({ ...current, questions: [question, ...current.questions] }));
    setActiveQuestionId(question.id);
    setViewMode('edit');
  };

  const handleSaveQuestion = () => {
    if (!activeQuestion) return;
    if (!categoryDraft) {
      showToast('题目必须选择分类');
      return;
    }
    const normalizedSolutionDrafts = solutionDrafts
      .map(solution => ({
        ...solution,
        note: solution.note.trim(),
        content: solution.content,
      }))
      .filter(solution => !isEmptySolution(solution));
    const savedSolutions = normalizedSolutionDrafts.length > 0 ? normalizedSolutionDrafts : [createSolution()];
    const updated: QuestionItem = {
      ...activeQuestion,
      title: titleDraft.trim() || '未命名题目',
      categoryId: categoryDraft,
      tags: parseTags(tagsDraft),
      summary: summaryDraft.trim(),
      difficulty: normalizeDifficulty(difficultyDraft),
      note: noteDraft.trim(),
      methodIds: linkedMethodDrafts,
      methodId: linkedMethodDrafts[0] || undefined,
      attributes: undefined,
      question: questionDraft,
      answer: savedSolutions[0]?.content || '',
      solutions: savedSolutions,
      updatedAt: Date.now(),
    };
    updateData(current => ({
      ...current,
      questions: current.questions.map(question => question.id === updated.id ? updated : question),
    }));
    setViewMode('read');
    showToast('题目已保存');
  };

  const handleDeleteQuestion = () => {
    if (!activeQuestion) return;
    setConfirmDialog({ type: 'question', question: activeQuestion });
  };

  const performDeleteQuestion = (questionToDelete: QuestionItem) => {
    updateData(current => ({ ...current, questions: current.questions.filter(question => question.id !== questionToDelete.id) }));
    setSheetItems(items => items.filter(item => item.sourceQuestionId !== questionToDelete.id));
    showToast('题目已删除');
  };

  const handleCreateMethod = () => {
    const categoryId = methodCategories.some(category => category.id === activeMethodCategoryId) ? activeMethodCategoryId : '';
    if (!categoryId) {
      showToast(methodCategories.length > 0 ? '请先选择分类再新建方法' : '请先创建分类');
      return;
    }
    const method: MethodItem = {
      id: nowId('method'),
      title: '新方法',
      categoryId,
      content: '在这里记录解题方法，支持 Markdown 和 LaTeX，例如 $a^2+b^2=c^2$。',
      summary: '',
      tags: [],
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    updateMethodData(current => ({ ...current, methods: [method, ...current.methods] }));
    setActiveMethodId(method.id);
    setMethodViewMode('edit');
  };

  const handleSaveMethod = () => {
    if (!activeMethod) return;
    if (!methodCategoryDraft) {
      showToast('方法必须选择分类');
      return;
    }
    const updated: MethodItem = {
      ...activeMethod,
      title: methodTitleDraft.trim() || '未命名方法',
      categoryId: methodCategoryDraft,
      tags: parseTags(methodTagsDraft),
      summary: methodSummaryDraft.trim(),
      note: methodNoteDraft.trim(),
      content: methodContentDraft,
      updatedAt: Date.now(),
    };
    updateMethodData(current => ({
      ...current,
      methods: current.methods.map(method => method.id === updated.id ? updated : method),
    }));
    setMethodViewMode('read');
    showToast('方法已保存');
  };

  const handleDeleteMethod = () => {
    if (!activeMethod) return;
    setConfirmDialog({ type: 'method', method: activeMethod });
  };

  const performDeleteMethod = (methodToDelete: MethodItem) => {
    updateMethodData(current => ({ ...current, methods: current.methods.filter(method => method.id !== methodToDelete.id) }));
    updateData(current => ({
      ...current,
      questions: current.questions.map(question => {
        const nextMethodIds = question.methodIds.filter(id => id !== methodToDelete.id);
        return {
          ...question,
          methodIds: nextMethodIds,
          methodId: nextMethodIds[0],
        };
      }),
    }));
    showToast('方法已删除');
  };

  const openMethodPicker = () => {
    setMethodPickerPreviewId(linkedMethodDrafts[0] || methodSelectOptions[0]?.id || '');
    setIsMethodPickerOpen(true);
  };

  const toggleLinkedMethodDraft = (methodId: string) => {
    setLinkedMethodDrafts(current => (
      current.includes(methodId)
        ? current.filter(id => id !== methodId)
        : [...current, methodId]
    ));
    setMethodPickerPreviewId(methodId);
  };

  const createSheetItem = (question: QuestionItem): SheetItem => ({
    ...question,
    id: nowId('sheet'),
    sourceQuestionId: question.id,
    tags: [...question.tags],
    solutions: question.solutions.map(solution => ({ ...solution, id: nowId('sol') })),
    note: question.note || attributesToNote(question.attributes),
  });

  const toggleSelected = (id: string) => {
    const question = questions.find(item => item.id === id);
    if (!question) return;
    setSheetItems(items => {
      if (items.some(item => item.sourceQuestionId === id)) {
        return items.filter(item => item.sourceQuestionId !== id);
      }
      return [...items, createSheetItem(question)];
    });
  };

  const updateSheetItem = (id: string, updates: Partial<Pick<SheetItem, 'title' | 'question' | 'answer' | 'solutions' | 'note' | 'tags'>>) => {
    setSheetItems(items => items.map(item => item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item));
  };

  const updateSolutionDraft = (id: string, updates: Partial<Pick<QuestionSolution, 'note' | 'content'>>) => {
    setSolutionDrafts(solutions => solutions.map(solution => solution.id === id ? { ...solution, ...updates } : solution));
  };

  const addSolutionDraft = () => {
    setSolutionDrafts(solutions => [...solutions, createSolution()]);
  };

  const removeSolutionDraft = (id: string) => {
    setSolutionDrafts(solutions => {
      const next = solutions.filter(solution => solution.id !== id);
      return next.length > 0 ? next : [createSolution()];
    });
  };

  const updateSheetSolution = (itemId: string, solutionId: string, updates: Partial<Pick<QuestionSolution, 'note' | 'content'>>) => {
    setSheetItems(items => items.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        solutions: item.solutions.map(solution => solution.id === solutionId ? { ...solution, ...updates } : solution),
        updatedAt: Date.now(),
      };
    }));
  };

  const addSheetSolution = (itemId: string) => {
    setSheetItems(items => items.map(item => item.id === itemId ? { ...item, solutions: [...item.solutions, createSolution()], updatedAt: Date.now() } : item));
  };

  const removeSheetSolution = (itemId: string, solutionId: string) => {
    setSheetItems(items => items.map(item => {
      if (item.id !== itemId) return item;
      const next = item.solutions.filter(solution => solution.id !== solutionId);
      return { ...item, solutions: next.length > 0 ? next : [createSolution()], updatedAt: Date.now() };
    }));
  };

  const moveSheetItem = (index: number, direction: -1 | 1) => {
    setSheetItems(items => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const moveSheetItemToTarget = (dragId: string, targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setSheetItems(items => {
      const fromIndex = items.findIndex(item => item.id === dragId);
      const targetIndex = items.findIndex(item => item.id === targetId);
      if (fromIndex < 0 || targetIndex < 0) return items;
      const next = [...items];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleExportPdf = async () => {
    const exportQuestions = isSheetPageOpen ? sheetItems : selectedQuestions.length > 0 ? selectedQuestions : filteredQuestions;
    if (exportQuestions.length === 0) {
      showToast('没有可导出的题目');
      return;
    }
    await exportReactNodeToPdf(<PrintableSheet questions={exportQuestions} scope={exportScope} title={sheetTitle || '题单'} subtitle={sheetSubtitle} density={sheetDensity} answerLayout={sheetAnswerLayout} />, `${sheetTitle || '题单'}.pdf`, {
      className: 'question-bank-export',
      widthPx: 960,
      padding: '56px 64px',
      backgroundColor: '#ffffff',
    });
  };

  const handleExportWord = () => {
    const exportQuestions = isSheetPageOpen ? sheetItems : selectedQuestions.length > 0 ? selectedQuestions : filteredQuestions;
    if (exportQuestions.length === 0) {
      showToast('没有可导出的题目');
      return;
    }
    downloadTextFile(buildWordHtml(exportQuestions, exportScope, sheetTitle || '题单', sheetSubtitle, sheetAnswerLayout), `${sheetTitle || '题单'}.doc`, 'application/msword;charset=utf-8');
  };

  const handleImageChange = async (role: OcrImageRole, file?: File) => {
    if (!file) return;
    const data = await fileToAttachment(file);
    const next = { file, preview: data.dataUrl, base64: data.base64 };
    if (role === 'question') setQuestionImage(next);
    else setAnswerImage(next);
  };

  const clearImage = (role: OcrImageRole) => {
    const empty = { file: null, preview: '', base64: '' };
    if (role === 'question') setQuestionImage(empty);
    else setAnswerImage(empty);
  };

  const openAiModal = () => {
    if (!activeQuestion || viewMode !== 'edit') {
      showToast('请先进入题目编辑模式');
      return;
    }
    const nextProfiles = loadProfiles().filter(profile => SUPPORTED_AI_PROVIDERS.has(profile.provider) && profile.apiKey);
    setProfiles(nextProfiles);
    setAiDraft(current => {
      const selected = nextProfiles.find(profile => profile.id === current.profileId) || nextProfiles[0];
      const next = {
        profileId: selected?.id || '',
        model: current.model || getModelFallback(selected),
      };
      saveAiDraft(next);
      return next;
    });
    setIsAiOpen(true);
  };

  const handleAiGenerate = async () => {
    if (!activeQuestion || viewMode !== 'edit') {
      showToast('请先进入题目编辑模式');
      return;
    }
    const profile = profiles.find(item => item.id === aiDraft.profileId);
    if (!profile) {
      showToast('请先在 API Key 中配置可用模型');
      return;
    }
    const attachments: ChatMessage['attachments'] = [];
    if (questionImage.file && questionImage.base64) {
      attachments.push({
        type: 'image',
        name: `题目图片-${questionImage.file.name}`,
        mimeType: questionImage.file.type || 'image/png',
        base64: questionImage.base64,
        size: questionImage.file.size,
      });
    }
    if (answerImage.file && answerImage.base64) {
      attachments.push({
        type: 'image',
        name: `解答图片-${answerImage.file.name}`,
        mimeType: answerImage.file.type || 'image/png',
        base64: answerImage.base64,
        size: answerImage.file.size,
      });
    }
    if (attachments.length === 0) {
      showToast('请先选择题目或解答图片');
      return;
    }
    const model = aiDraft.model || getModelFallback(profile);
    if (!model) {
      showToast('请填写模型名称');
      return;
    }

    setIsAiLoading(true);
    saveAiDraft({ profileId: profile.id, model });

    const config: ChatConfig = {
      provider: profile.provider as ChatConfig['provider'],
      apiKey: profile.apiKey,
      baseUrl: normalizeBaseUrl(profile),
      model,
      temperature: 0.2,
      maxTokens: 4096,
      systemPrompt: '你是一个严谨的题目录入助手，只输出 JSON。',
    };
    const service = new ChatService(config);
    const instruction = `${aiPrompt}

要求：
1. 只做图片识别、转写和排版整理，不要自行补充解题过程，不要根据题目重新求解。
2. 题目图片只放入 question 字段，解答/笔记图片按内容放入 solutions 数组；多个解答或多段笔记请拆成多个元素。
3. 保留题号、条件、图表文字、推导步骤和关键格式；明显 OCR 错字、断句、公式排版可以修正。
4. 公式统一使用 LaTeX，行内公式用 $...$，独立公式用 $$...$$。
5. 无法确认的内容用 [无法识别] 标注，不要臆测。`;

    const messages: ChatMessage[] = [{
      id: nowId('msg'),
      role: 'user',
      timestamp: Date.now(),
      content: `${instruction}

下面会分别给出题目图片和解答图片。请根据每张图片前的说明归入对应字段。`,
    }];

    if (questionImage.file && questionImage.base64) {
      messages.push({
        id: nowId('msg'),
        role: 'user',
        timestamp: Date.now(),
        content: '这是题目图片。请只把这张图片转写到 question 字段。',
        attachments: [attachments[0]],
      });
    }
    if (answerImage.file && answerImage.base64) {
      messages.push({
        id: nowId('msg'),
        role: 'user',
        timestamp: Date.now(),
        content: '这是解答图片或解答笔记图片。请把这张图片转写到 solutions 数组，每个元素可包含 note 和 content。',
        attachments: [questionImage.file && questionImage.base64 ? attachments[1] : attachments[0]],
      });
    }

    messages.push({
      id: nowId('msg'),
      role: 'user',
      timestamp: Date.now(),
      content: `请返回严格 JSON，不要输出额外解释，格式如下：
{
  "title": "题目标题",
  "summary": "一句话概述；没有则为空字符串",
  "difficulty": 0.3,
  "question": "题目图片转写 Markdown；未提供题目图片则为空字符串",
  "solutions": [{"note": "解答备注说明；没有则为空字符串", "content": "解答 Markdown"}],
  "tags": ["标签1", "标签2"],
  "note": "备注；没有则为空字符串"
}`,
    });

    let fullText = '';
    try {
      let streamError: Error | null = null;
      await service.sendMessage(messages, {
        onToken: token => { fullText += token; },
        onComplete: text => {
          fullText = text || fullText;
        },
        onError: error => {
          streamError = error;
        },
      });
      if (streamError) throw streamError;

      const parsed = extractJsonObject(fullText);
      const parsedQuestion = String(parsed.question || '').trim();
      const parsedSolutions = normalizeSolutions(parsed.solutions, parsed.answer).filter(solution => !isEmptySolution(solution));
      const parsedSummary = String(parsed.summary || '').trim();
      const parsedNote = typeof parsed.note === 'string' ? parsed.note.trim() : attributesToNote(parsed.attributes);
      const parsedTags = Array.isArray(parsed.tags) ? parsed.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [];
      setQuestionDraft(current => appendDraftText(current, parsedQuestion));
      if (parsedSolutions.length > 0) {
        setSolutionDrafts(current => {
          const next = parsedSolutions.map(solution => ({ ...solution, id: nowId('sol') }));
          if (current.length === 1 && isEmptySolution(current[0])) return next;
          return [...current, ...next];
        });
      }
      setSummaryDraft(current => parsedSummary ? (current.trim() ? `${current.trim()}；${parsedSummary}` : parsedSummary) : current);
      setNoteDraft(current => appendDraftText(current, parsedNote));
      if (parsedTags.length > 0) {
        setTagsDraft(current => parseTags([...parseTags(current), ...parsedTags].join('；')).join('；'));
      }
      if (parsed.difficulty !== undefined && parsed.difficulty !== null && parsed.difficulty !== '') {
        setDifficultyDraft(formatDifficulty(parsed.difficulty));
      }
      if ((!titleDraft.trim() || titleDraft.trim() === '新题目') && parsed.title) {
        setTitleDraft(String(parsed.title).trim());
      }
      setIsAiOpen(false);
      setQuestionImage({ file: null, preview: '', base64: '' });
      setAnswerImage({ file: null, preview: '', base64: '' });
      showToast('识别结果已追加到编辑区');
    } catch (error) {
      console.error('Question image parse failed:', error, fullText);
      showToast(error instanceof Error ? error.message : '图片识别结果解析失败');
    } finally {
      setIsAiLoading(false);
    }
  };

  const renderOcrImagePicker = (role: OcrImageRole, label: string, slot: OcrImageSlot) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {slot.file && (
          <button
            type="button"
            onClick={() => clearImage(role)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            清除
          </button>
        )}
      </div>
      <label className="relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center hover:bg-gray-100">
        {slot.preview ? (
          <>
            <img src={slot.preview} alt={label} className="max-h-[320px] max-w-full rounded-xl object-contain" />
            <span className="mt-2 max-w-full truncate px-3 text-xs text-gray-400">{slot.file?.name}</span>
          </>
        ) : (
          <>
            <ImageIcon className="mb-3 h-9 w-9 text-gray-300" />
            <span className="text-sm text-gray-500">选择{label}</span>
            <span className="mt-1 text-xs text-gray-400">支持截图、照片、扫描图</span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={event => void handleImageChange(role, event.target.files?.[0] || undefined)} />
      </label>
    </div>
  );

  const renderContinuousReading = () => {
    const scopeTitle = categoryPath(categories, activeCategoryId) || '当前分类';
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="sticky top-0 z-10 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-gray-900">{scopeTitle || '当前分类'}</h2>
              <p className="mt-1 text-xs text-gray-400">{filteredQuestions.length} 道题 · 按当前分类和搜索结果连续阅读</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setSheetItems(current => {
                    const bySource = new Map(current.map(item => [item.sourceQuestionId, item]));
                    return filteredQuestions.map(question => bySource.get(question.id) || createSheetItem(question));
                  });
                  showToast('已加入当前阅读列表');
                }}
                className="h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100"
              >
                加入题单
              </button>
              <button onClick={() => setViewMode('read')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                单题阅读
              </button>
            </div>
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-sm text-gray-400">当前分类下没有题目</div>
        ) : (
          filteredQuestions.map((question, index) => {
            const linkedMethods = question.methodIds.map(id => methods.find(method => method.id === id)).filter((method): method is MethodItem => !!method);
            const answerHidden = hiddenAnswerQuestionIds.has(question.id);
            return (
              <section key={question.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-400">第 {index + 1} 题</div>
                    <h3 className="mt-1 truncate text-lg font-semibold text-gray-900">{question.title || '未命名题目'}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                      <span>{categoryPath(categories, question.categoryId)} · 难度 {formatDifficulty(question.difficulty)} · {formatDate(question.updatedAt)}</span>
                      {question.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">{tag}</span>
                      ))}
                      {linkedMethods.map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPreviewMethodId(method.id)}
                          className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] text-purple-600 hover:bg-purple-100"
                        >
                          {method.title}
                        </button>
                      ))}
                    </div>
                    {question.summary.trim() && <p className="mt-2 text-sm text-gray-500">{question.summary}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button
                      onClick={() => {
                        setActiveQuestionId(question.id);
                        setViewMode('edit');
                      }}
                      className="h-8 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      编辑
                    </button>
                    <button onClick={() => handleRenameQuestion(question)} className="h-8 rounded-lg border border-gray-200 px-2.5 text-xs text-gray-600 hover:bg-gray-50">重命名</button>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 text-sm font-semibold text-gray-500">题目</div>
                    <MarkdownContent content={question.question || '（空）'} />
                    {question.note.trim() && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <MarkdownContent content={toBlockquoteMarkdown(question.note)} />
                      </div>
                    )}
                  </div>
                  <AnswerSection
                    solutions={question.solutions}
                    hidden={answerHidden}
                    onToggle={() => toggleAnswerVisibility(question.id)}
                    className="border-t border-gray-100 pt-5"
                  />
                </div>
              </section>
            );
          })
        )}
      </div>
    );
  };

  const renderMethodContent = () => {
    if (!activeMethod) {
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-gray-400">
          点击左侧“新建”开始记录解题方法
        </div>
      );
    }

    if (methodViewMode === 'edit') {
      return (
        <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_420px] gap-4">
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">方法标题</label>
                  <input value={methodTitleDraft} onChange={event => setMethodTitleDraft(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">所属分类</label>
                  <select value={methodCategoryDraft} onChange={event => setMethodCategoryDraft(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                    {methodCategoryOptions.map(({ category, depth }) => (
                      <option key={category.id} value={category.id}>
                        {`${'　'.repeat(depth)}${category.name}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">概述</label>
                  <input value={methodSummaryDraft} onChange={event => setMethodSummaryDraft(event.target.value)} placeholder="适用题型、核心思路或使用条件" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">标签</label>
                  <input value={methodTagsDraft} onChange={event => setMethodTagsDraft(event.target.value)} placeholder="解析几何；参数法；高频" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">备注</label>
                  <textarea value={methodNoteDraft} onChange={event => setMethodNoteDraft(event.target.value)} placeholder={'适用范围：\n注意事项：'} className="h-20 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <label className="mb-2 block text-sm font-semibold text-gray-700">Markdown 内容</label>
                <textarea value={methodContentDraft} onChange={event => setMethodContentDraft(event.target.value)} className="min-h-[520px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-400" />
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setMethodViewMode('read')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
                <button onClick={handleSaveMethod} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">保存方法</button>
              </div>
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">实时预览</h2>
              {methodSummaryDraft.trim() && <p className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">{methodSummaryDraft.trim()}</p>}
            </div>
            {parseTags(methodTagsDraft).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {parseTags(methodTagsDraft).map(tag => <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{tag}</span>)}
              </div>
            )}
            <MarkdownContent content={methodContentDraft || '（空）'} />
            {methodNoteDraft.trim() && (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <MarkdownContent content={toBlockquoteMarkdown(methodNoteDraft)} />
              </div>
            )}
          </aside>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {activeMethod.summary.trim() && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{activeMethod.summary}</span>
              )}
              {activeMethod.tags.map(tag => (
                <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">{tag}</span>
              ))}
              <span className="text-xs text-gray-400">{formatDate(activeMethod.updatedAt)}</span>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1.5">
              <button onClick={() => setMethodViewMode('edit')} title="编辑方法" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
                <Edit3 className="h-4 w-4" />
              </button>
              <button onClick={handleDeleteMethod} title="删除" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <MarkdownContent content={activeMethod.content || '（空）'} />
          {activeMethod.note.trim() && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <MarkdownContent content={toBlockquoteMarkdown(activeMethod.note)} />
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderSheetPage = () => {
    const spacingClass = sheetDensity === 'compact' ? 'space-y-3' : sheetDensity === 'loose' ? 'space-y-8' : 'space-y-5';
    return (
      <div className="flex h-full flex-col bg-gray-50 text-gray-900">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setIsSheetPageOpen(false)} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
              返回题库
            </button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">题单编辑</div>
              <div className="text-xs text-gray-400">{sheetItems.length} 道题，编辑内容不会影响原题库</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={exportScope} onChange={event => setExportScope(event.target.value as ExportScope)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none">
              <option value="full">题目 + 解答</option>
              <option value="questions">仅题目</option>
              <option value="answers">仅解答</option>
            </select>
            <button onClick={() => void handleExportPdf()} className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-500 px-3 text-sm font-medium text-white hover:bg-blue-600">
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button onClick={handleExportWord} className="flex h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-black">
              <FileText className="h-4 w-4" />
              Word
            </button>
            <div className="ml-2 h-6 w-px bg-gray-200" />
            <button
              onClick={() => void toggleFullscreen()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px]">
          <div className="min-h-0 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <input
                value={sheetTitle}
                onChange={event => setSheetTitle(event.target.value)}
                className="mb-2 w-full border-0 bg-transparent text-center text-3xl font-bold outline-none"
                placeholder="题单标题"
              />
              <input
                value={sheetSubtitle}
                onChange={event => setSheetSubtitle(event.target.value)}
                className="mb-8 w-full border-0 bg-transparent text-center text-sm text-gray-400 outline-none"
                placeholder="副标题、班级、日期或说明"
              />

              {sheetItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400">
                  还没有题目。返回题库后点击“加入题单”，或使用右侧“加入当前筛选结果”。
                </div>
              ) : (
                <>
                  <div className={spacingClass}>
                    {sheetItems.map((item, index) => {
                      const editing = editingSheetItemId === item.id;
                      return (
                        <section
                          key={item.id}
                          onDragOver={event => {
                            if (!draggingSheetItemId) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={event => {
                            event.preventDefault();
                            const dragId = event.dataTransfer.getData('text/plain') || draggingSheetItemId;
                            moveSheetItemToTarget(dragId, item.id);
                            setDraggingSheetItemId('');
                          }}
                          className={`break-inside-avoid rounded-xl border p-5 transition-colors ${
                            draggingSheetItemId && draggingSheetItemId !== item.id
                              ? 'border-blue-200 bg-blue-50/30'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 gap-3">
                              <button
                                type="button"
                                draggable
                                onDragStart={event => {
                                  setDraggingSheetItemId(item.id);
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', item.id);
                                }}
                                onDragEnd={() => setDraggingSheetItemId('')}
                                className="mt-0.5 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-gray-300 hover:bg-gray-50 hover:text-gray-500 active:cursor-grabbing"
                                title="拖拽排序"
                              >
                                <GripVertical className="h-4 w-4" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-gray-400">第 {index + 1} 题</div>
                                {editing ? (
                                  <input
                                    value={item.title}
                                    onChange={event => updateSheetItem(item.id, { title: event.target.value })}
                                    className="mt-1 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium outline-none focus:border-blue-400"
                                  />
                                ) : (
                                  <h3 className="mt-1 text-base font-semibold text-gray-900">{item.title || '未命名题目'}</h3>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button disabled={index === 0} onClick={() => moveSheetItem(index, -1)} className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40">上移</button>
                              <button disabled={index === sheetItems.length - 1} onClick={() => moveSheetItem(index, 1)} className="h-8 rounded-lg border border-gray-200 px-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40">下移</button>
                              <button onClick={() => setEditingSheetItemId(editing ? '' : item.id)} className="h-8 rounded-lg border border-blue-200 px-2 text-xs text-blue-600 hover:bg-blue-50">{editing ? '预览' : '编辑'}</button>
                              <button onClick={() => setSheetItems(items => items.filter(current => current.id !== item.id))} className="h-8 rounded-lg border border-red-100 px-2 text-xs text-red-500 hover:bg-red-50">移除</button>
                            </div>
                          </div>

                          {editing ? (
                            <div className="space-y-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500">题目</label>
                                <textarea value={item.question} onChange={event => updateSheetItem(item.id, { question: event.target.value })} className="min-h-[180px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-400" />
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-medium text-gray-500">解答</label>
                                  <button onClick={() => addSheetSolution(item.id)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                                    添加解答
                                  </button>
                                </div>
                                {item.solutions.map((solution, solutionIndex) => (
                                  <div key={solution.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                      <span className="text-xs font-medium text-gray-500">解答 {solutionIndex + 1}</span>
                                      {item.solutions.length > 1 && (
                                        <button onClick={() => removeSheetSolution(item.id, solution.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                                          删除
                                        </button>
                                      )}
                                    </div>
                                    <input
                                      value={solution.note}
                                      onChange={event => updateSheetSolution(item.id, solution.id, { note: event.target.value })}
                                      placeholder="解答备注说明，会显示在解答最前面"
                                      className="mb-2 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                                    />
                                    <textarea
                                      value={solution.content}
                                      onChange={event => updateSheetSolution(item.id, solution.id, { content: event.target.value })}
                                      className="min-h-[140px] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-400"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-500">标签</label>
                                  <input value={item.tags.join('；')} onChange={event => updateSheetItem(item.id, { tags: parseTags(event.target.value) })} className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-500">备注</label>
                                  <input value={item.note} onChange={event => updateSheetItem(item.id, { note: event.target.value })} className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-5">
                              {exportScope !== 'answers' && (
                                <div>
                                  <MarkdownContent content={item.question || '（空）'} />
                                  {item.note.trim() && <MarkdownContent content={toBlockquoteMarkdown(item.note)} />}
                                </div>
                              )}
                              {exportScope !== 'questions' && (
                                <div className="border-t border-gray-100 pt-4">
                                  <SolutionPreview solutions={item.solutions} />
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">组题</h3>
                <p className="mt-1 text-xs leading-5 text-gray-400">题单中的题目是独立副本，可二次编辑、排序和排版。</p>
              </div>
              <button
                onClick={() => {
                  setSheetItems(current => {
                    const bySource = new Map(current.map(item => [item.sourceQuestionId, item]));
                    return filteredQuestions.map(question => bySource.get(question.id) || createSheetItem(question));
                  });
                  showToast('已加入当前筛选结果');
                }}
                className="h-10 w-full rounded-xl border border-blue-200 bg-blue-50 text-sm font-medium text-blue-600 hover:bg-blue-100"
              >
                加入当前筛选结果
              </button>
              <button onClick={() => setSheetItems([])} className="h-10 w-full rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">清空题单</button>

              <div className="border-t border-gray-100 pt-5">
                <label className="mb-1.5 block text-sm font-medium text-gray-600">题目间距</label>
                <select value={sheetDensity} onChange={event => setSheetDensity(event.target.value as SheetDensity)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                  <option value="compact">紧凑</option>
                  <option value="normal">标准</option>
                  <option value="loose">宽松</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <label className="mb-1.5 block text-sm font-medium text-gray-600">导出答案布局</label>
                <select
                  value={sheetAnswerLayout}
                  onChange={event => setSheetAnswerLayout(event.target.value as SheetAnswerLayout)}
                  disabled={exportScope !== 'full'}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="inline">答案紧跟题目</option>
                  <option value="separate">题目答案分开</option>
                </select>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 text-xs leading-5 text-gray-500">
                PDF/Word 会按当前题单设置导出。
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex h-full bg-gray-50 text-gray-900">
      {isSheetPageOpen ? (
        <main className="min-w-0 flex-1">
          {renderSheetPage()}
        </main>
      ) : (
        <>
      {isSidebarCollapsed ? (
        <aside className="flex w-14 shrink-0 flex-col items-center border-r border-gray-200 bg-white py-4">
          <button
            onClick={() => setIsSidebarCollapsed(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            title="展开分类栏"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={contentMode === 'questions' ? handleCreateQuestion : handleCreateMethod}
            className="mt-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600"
            title={contentMode === 'questions' ? '新建题目' : '新建方法'}
          >
            <Plus className="h-4 w-4" />
          </button>
        </aside>
      ) : (
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="mb-3 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setContentMode('questions')}
              className={`h-8 rounded-lg text-sm font-medium ${contentMode === 'questions' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              题库
            </button>
            <button
              onClick={() => setContentMode('methods')}
              className={`h-8 rounded-lg text-sm font-medium ${contentMode === 'methods' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              解题方法
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{contentMode === 'questions' ? '题库' : '解题方法'}</h2>
              <p className="text-xs text-gray-400">{contentMode === 'questions' ? `${questions.length} 道题` : `${methods.length} 条方法`}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={contentMode === 'questions' ? handleCreateQuestion : handleCreateMethod}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                title={contentMode === 'questions' ? '新建题目' : '新建方法'}
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleAddCategory()}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                title="新增根分类"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                title="隐藏分类栏"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={contentMode === 'questions' ? '搜索题目、解答、概述、标签' : '搜索方法、内容、概述、标签'}
              className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
        </div>

        <div className="border-b border-gray-200 p-3">
          <div className="space-y-1">
            <CategoryTree
              categories={contentMode === 'questions' ? categories : methodCategories}
              activeId={contentMode === 'questions' ? activeCategoryId : activeMethodCategoryId}
              counts={contentMode === 'questions' ? categoryCounts : methodCategoryCounts}
              onSelect={contentMode === 'questions' ? setActiveCategoryId : setActiveMethodCategoryId}
              onAdd={handleAddCategory}
              onRename={handleRenameCategory}
              onDelete={handleDeleteCategory}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {contentMode === 'questions' ? (
              filteredQuestions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">暂无题目</div>
              ) : filteredQuestions.map(question => {
              const active = activeQuestionId === question.id;
              const selected = selectedIds.includes(question.id);
              return (
                <button
                  key={question.id}
                  onClick={() => setActiveQuestionId(question.id)}
                  className={`flex w-full gap-2 rounded-xl border p-3 text-left transition-colors ${active ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'} ${selected ? 'ring-2 ring-blue-300' : ''}`}
                >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{question.title || '未命名题目'}</span>
                      {question.tags.length > 0 && (
                        <span className="mt-1 flex max-h-10 flex-wrap gap-1 overflow-hidden">
                          {question.tags.slice(0, 6).map(tag => <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] leading-4 text-gray-500">{tag}</span>)}
                          {question.tags.length > 6 && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] leading-4 text-gray-500">+{question.tags.length - 6}</span>}
                        </span>
                      )}
                    <span className="mt-1.5 block truncate text-xs text-gray-400">{categoryPath(categories, question.categoryId)} · 难度 {formatDifficulty(question.difficulty)} · {formatDate(question.updatedAt)}</span>
                    {question.summary.trim() && <span className="mt-1 block truncate text-xs text-gray-500">{question.summary}</span>}
                  </span>
                </button>
              );
              })
            ) : (
              filteredMethods.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center text-sm text-gray-400">暂无方法</div>
              ) : filteredMethods.map(method => {
                const active = activeMethodId === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setActiveMethodId(method.id)}
                    className={`flex w-full gap-2 rounded-xl border p-3 text-left transition-colors ${active ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-gray-200'}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{method.title || '未命名方法'}</span>
                      {method.tags.length > 0 && (
                        <span className="mt-1 flex max-h-10 flex-wrap gap-1 overflow-hidden">
                          {method.tags.slice(0, 6).map(tag => <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] leading-4 text-gray-500">{tag}</span>)}
                          {method.tags.length > 6 && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] leading-4 text-gray-500">+{method.tags.length - 6}</span>}
                        </span>
                      )}
                      <span className="mt-1.5 block truncate text-xs text-gray-400">{categoryPath(methodCategories, method.categoryId)} · {formatDate(method.updatedAt)}</span>
                      {method.summary.trim() && <span className="mt-1 block truncate text-xs text-gray-500">{method.summary}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5 text-blue-500" />
              <h1 className="truncate text-lg font-semibold">
                {contentMode === 'questions'
                  ? (viewMode === 'browse' ? '连续阅读' : activeQuestion?.title || '请选择题目')
                  : activeMethod?.title || '请选择方法'}
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {contentMode === 'questions'
                ? (viewMode === 'browse'
                  ? `${categoryPath(categories, activeCategoryId) || '当前分类'} · ${filteredQuestions.length} 道`
                  : activeQuestion ? categoryPath(categories, activeQuestion.categoryId) : '无题目')
                : activeMethod ? categoryPath(methodCategories, activeMethod.categoryId) : '无方法'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {contentMode === 'questions' && viewMode === 'browse' && (
              <>
                <button onClick={() => setViewMode('read')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  单题阅读
                </button>
              </>
            )}

            {contentMode === 'questions' && activeQuestion && viewMode === 'read' && (
              <>
                <button onClick={() => setViewMode('browse')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  连续阅读
                </button>
                <button onClick={() => handleRenameQuestion(activeQuestion)} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  重命名
                </button>
              </>
            )}

            {contentMode === 'questions' && activeQuestion && viewMode === 'edit' && (
              <>
                <button onClick={openAiModal} className="flex h-9 items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 text-sm font-medium text-purple-600 hover:bg-purple-100">
                  <Sparkles className="h-4 w-4" />
                  图片识别
                </button>
                <button onClick={() => setViewMode('read')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  取消
                </button>
                <button onClick={handleSaveQuestion} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">
                  保存题目
                </button>
              </>
            )}

            {contentMode === 'methods' && activeMethod && methodViewMode === 'read' && (
              <button onClick={() => handleRenameMethod(activeMethod)} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                重命名
              </button>
            )}

            {contentMode === 'methods' && activeMethod && methodViewMode === 'edit' && (
              <>
                <button onClick={() => setMethodViewMode('read')} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-gray-50">
                  取消
                </button>
                <button onClick={handleSaveMethod} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">
                  保存方法
                </button>
              </>
            )}

            {contentMode === 'questions' && (
              <button
                onClick={() => setIsSheetPageOpen(true)}
                className="ml-2 flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-600 hover:bg-blue-100"
              >
                <FileText className="h-4 w-4" />
                题单 {selectedIds.length > 0 ? selectedIds.length : ''}
              </button>
            )}

            <div className="ml-2 h-6 w-px bg-gray-200" />
            <button
              onClick={() => void toggleFullscreen()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {contentMode === 'methods' ? (
            renderMethodContent()
          ) : viewMode === 'browse' ? (
            renderContinuousReading()
          ) : !activeQuestion ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-gray-400">点击左侧“新建”开始录入题目</div>
          ) : viewMode === 'edit' ? (
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_420px] gap-4">
              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 lg:grid-cols-[1fr_260px]">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">题目标题</label>
                      <input value={titleDraft} onChange={event => setTitleDraft(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">所属分类</label>
                      <select value={categoryDraft} onChange={event => setCategoryDraft(event.target.value)} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
                        {categoryOptions.map(({ category, depth }) => (
                          <option key={category.id} value={category.id}>
                            {`${'　'.repeat(depth)}${category.name}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">关联解题方法</label>
                      <button
                        type="button"
                        onClick={openMethodPicker}
                        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 text-left text-sm outline-none hover:border-blue-300"
                      >
                        <span className={linkedMethodDraftItems.length > 0 ? 'truncate text-gray-700' : 'text-gray-400'}>
                          {linkedMethodDraftItems.length > 0 ? `已关联 ${linkedMethodDraftItems.length} 个方法` : '选择解题方法'}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">概述</label>
                      <input value={summaryDraft} onChange={event => setSummaryDraft(event.target.value)} placeholder="用一句话概括题型、考点或用途" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">难度系数</label>
                      <input type="number" min="0" max="1" step="0.1" value={difficultyDraft} onChange={event => setDifficultyDraft(event.target.value)} onBlur={() => setDifficultyDraft(formatDifficulty(difficultyDraft))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">标签</label>
                      <input value={tagsDraft} onChange={event => setTagsDraft(event.target.value)} placeholder="函数；圆锥曲线；中等" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">备注</label>
                      <input value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="来源、易错点或补充说明" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" />
                    </div>
                  </div>

                  {linkedMethodDraftItems.length > 0 && (
                    <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
                      <div className="mb-2 text-sm font-semibold text-purple-700">已关联解题方法</div>
                      <div className="flex flex-wrap gap-2">
                        {linkedMethodDraftItems.map(method => (
                          <button
                            key={method.id}
                            onClick={() => setPreviewMethodId(method.id)}
                            className="rounded-full bg-white px-3 py-1 text-xs text-purple-700 shadow-sm hover:bg-purple-100"
                          >
                            {method.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <label className="mb-2 block text-sm font-semibold text-gray-700">题目</label>
                    <textarea value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} className="min-h-[320px] w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-400" />
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-semibold text-gray-700">解答</label>
                      <button onClick={addSolutionDraft} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                        添加解答
                      </button>
                    </div>
                    <div className="space-y-3">
                      {solutionDrafts.map((solution, index) => (
                        <div key={solution.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-600">解答 {index + 1}</span>
                            {solutionDrafts.length > 1 && (
                              <button onClick={() => removeSolutionDraft(solution.id)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                                删除
                              </button>
                            )}
                          </div>
                          <input
                            value={solution.note}
                            onChange={event => updateSolutionDraft(solution.id, { note: event.target.value })}
                            placeholder="解答备注说明，会显示在解答最前面"
                            className="mb-2 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                          />
                          <textarea
                            value={solution.content}
                            onChange={event => updateSolutionDraft(solution.id, { content: event.target.value })}
                            className="min-h-[260px] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button onClick={() => setViewMode('read')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">取消</button>
                    <button onClick={handleSaveQuestion} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">保存题目</button>
                  </div>
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900">实时预览</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">难度 {formatDifficulty(difficultyDraft)}</span>
                </div>
                {summaryDraft.trim() && <p className="mb-4 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">{summaryDraft.trim()}</p>}
                {parseTags(tagsDraft).length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {parseTags(tagsDraft).map(tag => <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{tag}</span>)}
                  </div>
                )}
                <div className="space-y-6">
                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-gray-500">题目</h3>
                    <MarkdownContent content={questionDraft || '（空）'} />
                    {noteDraft.trim() && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <MarkdownContent content={toBlockquoteMarkdown(noteDraft)} />
                      </div>
                    )}
                  </section>
                  <section className="border-t border-gray-100 pt-5">
                    <SolutionPreview solutions={solutionDrafts} titleClassName="mb-3 text-sm font-semibold text-gray-500" />
                  </section>
                </div>
              </aside>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-5">
                <section className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">难度 {formatDifficulty(activeQuestion.difficulty)}</span>
                      {activeQuestion.summary.trim() && (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{activeQuestion.summary}</span>
                      )}
                      {activeQuestion.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600">
                          {tag}
                        </span>
                      ))}
                      {activeQuestionMethods.map(method => (
                        <button
                          key={method.id}
                          onClick={() => setPreviewMethodId(method.id)}
                          className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-100"
                        >
                          {method.title}
                        </button>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1.5">
                      {isQuestionActionsOpen && (
                        <>
                          <button
                            onClick={() => toggleSelected(activeQuestion.id)}
                            title={selectedIds.includes(activeQuestion.id) ? '移出题单' : '加入题单'}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                              selectedIds.includes(activeQuestion.id)
                                ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setViewMode('edit')}
                            title="编辑题目"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={handleDeleteQuestion}
                            title="删除"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setIsQuestionActionsOpen(open => !open)}
                        title={isQuestionActionsOpen ? '收起操作' : '展开操作'}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      >
                        {isQuestionActionsOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <MarkdownContent content={activeQuestion.question || '（空）'} />
                  {activeQuestion.note.trim() && (
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <MarkdownContent content={toBlockquoteMarkdown(activeQuestion.note)} />
                    </div>
                  )}
                </section>

                <AnswerSection
                  solutions={activeQuestion.solutions}
                  hidden={hiddenAnswerQuestionIds.has(activeQuestion.id)}
                  onToggle={() => toggleAnswerVisibility(activeQuestion.id)}
                  className="rounded-2xl border border-gray-200 bg-white p-6"
                  titleClassName="text-base font-semibold text-gray-500"
                />
            </div>
          )}
        </div>
      </main>
        </>
      )}

      {isMethodPickerOpen && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/40 p-4" onClick={() => setIsMethodPickerOpen(false)}>
          <div className="grid max-h-[86vh] w-full max-w-5xl grid-cols-[340px_minmax(0,1fr)] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <aside className="flex min-h-0 flex-col border-r border-gray-200 bg-gray-50">
              <div className="border-b border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">选择解题方法</h3>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{linkedMethodDrafts.length} 已选</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {methodSelectOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-5 text-center text-sm text-gray-400">
                    还没有解题方法
                  </div>
                ) : (
                  <div className="space-y-2">
                    {methodSelectOptions.map(method => {
                      const selected = linkedMethodDrafts.includes(method.id);
                      const active = methodPickerPreview?.id === method.id;
                      return (
                        <div
                          key={method.id}
                          onClick={() => setMethodPickerPreviewId(method.id)}
                          className={`cursor-pointer rounded-xl border bg-white p-3 transition-colors ${
                            active ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                toggleLinkedMethodDraft(method.id);
                              }}
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                                selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 bg-white text-transparent'
                              }`}
                              title={selected ? '取消关联' : '关联'}
                            >
                              ✓
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-gray-900">{method.title || '未命名方法'}</div>
                              <div className="mt-1 truncate text-xs text-gray-400">{categoryPath(methodCategories, method.categoryId) || '未分类'}</div>
                              {method.summary.trim() && <div className="mt-1 truncate text-xs text-gray-500">{method.summary}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 p-3">
                <button onClick={() => setLinkedMethodDrafts([])} className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 hover:bg-white">
                  清空
                </button>
                <button onClick={() => setIsMethodPickerOpen(false)} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">
                  完成
                </button>
              </div>
            </aside>
            <main className="min-h-0 overflow-y-auto p-6">
              {methodPickerPreview ? (
                <article className="mx-auto max-w-3xl">
                  <div className="mb-5">
                    <h2 className="text-xl font-semibold text-gray-900">{methodPickerPreview.title || '未命名方法'}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span>{categoryPath(methodCategories, methodPickerPreview.categoryId) || '未分类'}</span>
                      {methodPickerPreview.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">{tag}</span>
                      ))}
                    </div>
                    {methodPickerPreview.summary.trim() && <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">{methodPickerPreview.summary}</p>}
                  </div>
                  <MarkdownContent content={methodPickerPreview.content || '（空）'} />
                  {methodPickerPreview.note.trim() && (
                    <div className="mt-6 border-t border-gray-100 pt-5">
                      <MarkdownContent content={toBlockquoteMarkdown(methodPickerPreview.note)} />
                    </div>
                  )}
                </article>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">选择左侧方法查看内容</div>
              )}
            </main>
          </div>
        </div>
      )}

      {previewMethod && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewMethodId('')}>
          <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{previewMethod.title || '未命名方法'}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>{categoryPath(methodCategories, previewMethod.categoryId) || '未分类'}</span>
                  <span>{formatDate(previewMethod.updatedAt)}</span>
                  {previewMethod.summary.trim() && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{previewMethod.summary}</span>}
                  {previewMethod.tags.map(tag => (
                    <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">{tag}</span>
                  ))}
                </div>
              </div>
              <button onClick={() => setPreviewMethodId('')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <article className="min-h-0 overflow-y-auto p-6">
              <MarkdownContent content={previewMethod.content || '（空）'} />
              {previewMethod.note.trim() && (
                <div className="mt-6 border-t border-gray-100 pt-5">
                  <MarkdownContent content={toBlockquoteMarkdown(previewMethod.note)} />
                </div>
              )}
            </article>
          </div>
        </div>
      )}

      {isAiOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !isAiLoading && setIsAiOpen(false)}>
          <div className="grid max-h-[88vh] w-full max-w-5xl grid-cols-[1fr_360px] overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="min-h-0 overflow-y-auto p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">图片识别</h3>
                <button onClick={() => setIsAiOpen(false)} disabled={isAiLoading} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {renderOcrImagePicker('question', '题目图片', questionImage)}
                  {renderOcrImagePicker('answer', '解答图片', answerImage)}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-600">识别要求</label>
                  <textarea value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} className="h-24 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                </div>
              </div>
            </div>

            <div className="border-l border-gray-200 bg-gray-50 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Settings className="h-4 w-4" />
                模型配置
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm text-gray-600">API Profile</label>
                  <select
                    value={aiDraft.profileId}
                    onChange={event => {
                      const profile = profiles.find(item => item.id === event.target.value);
                      const next = { profileId: event.target.value, model: getModelFallback(profile) };
                      setAiDraft(next);
                      saveAiDraft(next);
                    }}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  >
                    {profiles.length === 0 ? (
                      <option value="">未找到可用 API Key</option>
                    ) : profiles.map(profile => (
                      <option key={profile.id} value={profile.id}>
                        {(API_PROVIDER_LABELS as any)[profile.provider] || profile.provider} · {profile.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-gray-600">模型</label>
                  <input
                    value={aiDraft.model}
                    onChange={event => setAiDraft(current => ({ ...current, model: event.target.value }))}
                    placeholder="例如 google/gemini-2.5-flash-image"
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                  />
                  {(() => {
                    const profile = profiles.find(item => item.id === aiDraft.profileId);
                    const models = profile ? AVAILABLE_MODELS[profile.provider] || [] : [];
                    if (models.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {models.slice(0, 5).map(model => (
                          <button
                            key={model.id}
                            onClick={() => setAiDraft(current => ({ ...current, model: model.id }))}
                            className="rounded-md bg-white px-2 py-1 text-[11px] text-gray-500 hover:text-blue-600"
                          >
                            {model.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {profiles.length === 0 && (
                  <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    请先在数据中心的 API Key 中添加支持图片理解的模型密钥。
                  </div>
                )}

                <button
                  onClick={() => void handleAiGenerate()}
                  disabled={isAiLoading || profiles.length === 0 || (!questionImage.base64 && !answerImage.base64)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isAiLoading ? '转写中...' : '识别并追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {categoryModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setCategoryModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                {categoryModal.mode === 'create' ? (categoryModal.parentId ? '新增子分类' : '新增分类') : '重命名分类'}
              </h3>
              <button onClick={() => setCategoryModal(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              autoFocus
              value={categoryModal.name}
              onChange={event => setCategoryModal(current => current ? { ...current, name: event.target.value } : current)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleSubmitCategory();
                if (event.key === 'Escape') setCategoryModal(null);
              }}
              placeholder="分类名称"
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCategoryModal(null)} className="h-9 rounded-lg border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={handleSubmitCategory} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">保存</button>
            </div>
          </div>
        </div>
      )}

      {questionNameModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setQuestionNameModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">重命名题目</h3>
              <button onClick={() => setQuestionNameModal(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              autoFocus
              value={questionNameModal.name}
              onChange={event => setQuestionNameModal(current => current ? { ...current, name: event.target.value } : current)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleSubmitQuestionName();
                if (event.key === 'Escape') setQuestionNameModal(null);
              }}
              placeholder="题目名称"
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setQuestionNameModal(null)} className="h-9 rounded-lg border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={handleSubmitQuestionName} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">保存</button>
            </div>
          </div>
        </div>
      )}

      {methodNameModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setMethodNameModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">重命名方法</h3>
              <button onClick={() => setMethodNameModal(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              autoFocus
              value={methodNameModal.name}
              onChange={event => setMethodNameModal(current => current ? { ...current, name: event.target.value } : current)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleSubmitMethodName();
                if (event.key === 'Escape') setMethodNameModal(null);
              }}
              placeholder="方法名称"
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-400"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setMethodNameModal(null)} className="h-9 rounded-lg border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={handleSubmitMethodName} className="h-9 rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600">保存</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {confirmDialog.type === 'category' ? '删除分类' : confirmDialog.type === 'question' ? '删除题目' : '删除方法'}
                </h3>
                <p className="text-sm text-gray-500">
                  {confirmDialog.type === 'category'
                    ? `确认删除「${confirmDialog.category.name}」？子分类会一起删除，相关${confirmDialog.collection === 'questions' ? '题目' : '方法'}会移动到保留的第一个分类。`
                    : confirmDialog.type === 'question'
                      ? `确认删除「${confirmDialog.question.title}」？`
                      : `确认删除「${confirmDialog.method.title}」？`}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmDialog(null)} className="h-9 rounded-lg border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50">取消</button>
              <button
                onClick={() => {
                  if (confirmDialog.type === 'category') performDeleteCategory(confirmDialog.category, confirmDialog.collection);
                  else if (confirmDialog.type === 'question') performDeleteQuestion(confirmDialog.question);
                  else performDeleteMethod(confirmDialog.method);
                  setConfirmDialog(null);
                }}
                className="h-9 rounded-lg bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};

export default QuestionBank;
