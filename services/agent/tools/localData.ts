import type { MusicPlaylist, MusicTrack } from '../../../types';
import { DEFAULT_MUSIC_PLAYLISTS } from '../../../types';
import { appDataMirrorKeyForLocalStorageKey, loadLocalJson, loadUnifiedJson, saveUnifiedJson } from '../../../utils/unifiedStorage';

export const agentNowId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const parseAgentTags = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value.join(';') : String(value || '');
  return source
    .split(/[,，;；\n]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index);
};

export const normalizeAgentDifficulty = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.3;
  return Math.round(Math.min(1, Math.max(0, parsed)) * 10) / 10;
};

export interface AgentQuestionCategory {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentQuestionSolution {
  id: string;
  note: string;
  content: string;
}

export interface AgentQuestionItem {
  id: string;
  title: string;
  categoryId: string;
  question: string;
  answer: string;
  solutions: AgentQuestionSolution[];
  summary: string;
  difficulty: number;
  tags: string[];
  note: string;
  methodIds: string[];
  methodId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentMethodItem {
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

export interface AgentQuestionBankData {
  categories: AgentQuestionCategory[];
  questions: AgentQuestionItem[];
}

export interface AgentMethodLibraryData {
  categories: AgentQuestionCategory[];
  methods: AgentMethodItem[];
}

export interface AgentCanvasCategoryMeta {
  name: string;
  icon: string;
  color: string;
}

export interface AgentDrawingFile {
  id: string;
  name: string;
  data: any;
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export const QUESTION_BANK_STORAGE_KEY = 'guyue_question_bank_v1';
export const METHOD_LIBRARY_STORAGE_KEY = 'guyue_method_library_v1';
export const QUESTION_BANK_STORE_KEY = 'question-bank';
export const METHOD_LIBRARY_STORE_KEY = 'question-bank-method-library';
export const CANVAS_DRAWINGS_STORAGE_KEY = 'guyue_excalidraw_drawings';
export const CANVAS_CATEGORIES_STORAGE_KEY = 'guyue_excalidraw_categories';
export const CANVAS_ACTIVE_STORAGE_KEY = 'guyue_excalidraw_active';
export const CANVAS_DRAWINGS_STORE_KEY = 'excalidraw-drawings';
export const CANVAS_CATEGORIES_STORE_KEY = 'excalidraw-categories';
export const CANVAS_ACTIVE_STORE_KEY = 'excalidraw-active';
export const GIT_REPOSITORIES_STORAGE_KEY = 'guyue_git_repositories_v1';
export const MUSIC_TRACKS_STORAGE_KEY = 'guyue_music_tracks_v1';
export const MUSIC_PLAYLISTS_STORAGE_KEY = 'guyue_music_playlists_v1';
export const MUSIC_SELECTED_PLAYLIST_STORAGE_KEY = 'guyue_music_selected_playlist';

export const createAgentQuestionDefaultData = (): AgentQuestionBankData => ({
  categories: [{ id: agentNowId('cat'), name: '数学', createdAt: Date.now(), updatedAt: Date.now() }],
  questions: [],
});

export const createAgentMethodDefaultData = (): AgentMethodLibraryData => ({
  categories: [{ id: agentNowId('cat'), name: '解题方法', createdAt: Date.now(), updatedAt: Date.now() }],
  methods: [],
});

export const normalizeAgentCategories = (source: any, fallback: AgentQuestionCategory[]): AgentQuestionCategory[] => {
  const raw = Array.isArray(source) ? source : fallback;
  const categories = raw
    .map((category: any): AgentQuestionCategory | null => {
      const name = String(category?.name || '').trim();
      if (!name) return null;
      return {
        id: String(category?.id || agentNowId('cat')),
        name,
        parentId: typeof category?.parentId === 'string' && category.parentId ? category.parentId : undefined,
        createdAt: Number(category?.createdAt) || Date.now(),
        updatedAt: Number(category?.updatedAt) || Date.now(),
      };
    })
    .filter((category: AgentQuestionCategory | null): category is AgentQuestionCategory => Boolean(category));
  return categories.length > 0 ? categories : fallback;
};

export const normalizeAgentSolutions = (solutions: unknown, fallbackAnswer?: unknown): AgentQuestionSolution[] => {
  const normalized = Array.isArray(solutions)
    ? solutions
        .map((solution: any): AgentQuestionSolution | null => {
          const content = String(solution?.content ?? solution?.answer ?? solution?.text ?? '').trim();
          const note = String(solution?.note ?? solution?.remark ?? solution?.description ?? '').trim();
          if (!content && !note) return null;
          return { id: String(solution?.id || agentNowId('sol')), note, content };
        })
        .filter((solution: AgentQuestionSolution | null): solution is AgentQuestionSolution => Boolean(solution))
    : [];
  if (normalized.length > 0) return normalized;
  const fallback = String(fallbackAnswer || '').trim();
  return fallback ? [{ id: agentNowId('sol'), note: '', content: fallback }] : [];
};

export const normalizeAgentQuestionBankData = (source: any): AgentQuestionBankData => {
  const fallback = createAgentQuestionDefaultData();
  const categories = normalizeAgentCategories(source?.categories, fallback.categories);
  const validCategoryIds = new Set(categories.map(category => category.id));
  const fallbackCategoryId = categories[0]?.id || '';
  const questions = Array.isArray(source?.questions)
    ? source.questions.map((question: any): AgentQuestionItem => {
        const categoryId = validCategoryIds.has(String(question?.categoryId || ''))
          ? String(question.categoryId)
          : fallbackCategoryId;
        const solutions = normalizeAgentSolutions(question?.solutions, question?.answer);
        return {
          id: String(question?.id || agentNowId('q')),
          title: String(question?.title || '未命名题目'),
          categoryId,
          question: String(question?.question || ''),
          answer: String(question?.answer || solutions[0]?.content || ''),
          solutions,
          summary: String(question?.summary || ''),
          difficulty: normalizeAgentDifficulty(question?.difficulty),
          tags: Array.isArray(question?.tags) ? question.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
          note: String(question?.note || ''),
          methodIds: Array.isArray(question?.methodIds)
            ? question.methodIds.map((id: unknown) => String(id).trim()).filter(Boolean)
            : (typeof question?.methodId === 'string' && question.methodId ? [question.methodId] : []),
          methodId: typeof question?.methodId === 'string' && question.methodId ? question.methodId : undefined,
          createdAt: Number(question?.createdAt) || Date.now(),
          updatedAt: Number(question?.updatedAt) || Date.now(),
        };
      })
    : [];
  return { categories, questions };
};

export const normalizeAgentMethodLibraryData = (source: any): AgentMethodLibraryData => {
  const fallback = createAgentMethodDefaultData();
  const categories = normalizeAgentCategories(source?.categories, fallback.categories);
  const validCategoryIds = new Set(categories.map(category => category.id));
  const fallbackCategoryId = categories[0]?.id || '';
  const methods = Array.isArray(source?.methods)
    ? source.methods.map((method: any): AgentMethodItem => ({
        id: String(method?.id || agentNowId('method')),
        title: String(method?.title || '未命名方法'),
        categoryId: validCategoryIds.has(String(method?.categoryId || '')) ? String(method.categoryId) : fallbackCategoryId,
        content: String(method?.content || ''),
        summary: String(method?.summary || ''),
        tags: Array.isArray(method?.tags) ? method.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [],
        note: String(method?.note || ''),
        createdAt: Number(method?.createdAt) || Date.now(),
        updatedAt: Number(method?.updatedAt) || Date.now(),
      }))
    : [];
  return { categories, methods };
};

export const loadAgentQuestionBankData = () =>
  loadUnifiedJson({
    appDataKey: QUESTION_BANK_STORE_KEY,
    localStorageKey: QUESTION_BANK_STORAGE_KEY,
    defaultValue: createAgentQuestionDefaultData,
    normalize: normalizeAgentQuestionBankData,
  });

export const saveAgentQuestionBankData = (data: AgentQuestionBankData) => {
  saveUnifiedJson(
    {
      appDataKey: QUESTION_BANK_STORE_KEY,
      localStorageKey: QUESTION_BANK_STORAGE_KEY,
      defaultValue: createAgentQuestionDefaultData,
      normalize: normalizeAgentQuestionBankData,
    },
    data,
  );
  window.dispatchEvent(new CustomEvent('guyue-question-bank-updated'));
};

export const loadAgentMethodLibraryData = () =>
  loadUnifiedJson({
    appDataKey: METHOD_LIBRARY_STORE_KEY,
    localStorageKey: METHOD_LIBRARY_STORAGE_KEY,
    defaultValue: createAgentMethodDefaultData,
    normalize: normalizeAgentMethodLibraryData,
  });

export const saveAgentMethodLibraryData = (data: AgentMethodLibraryData) => {
  saveUnifiedJson(
    {
      appDataKey: METHOD_LIBRARY_STORE_KEY,
      localStorageKey: METHOD_LIBRARY_STORAGE_KEY,
      defaultValue: createAgentMethodDefaultData,
      normalize: normalizeAgentMethodLibraryData,
    },
    data,
  );
  window.dispatchEvent(new CustomEvent('guyue-question-bank-updated'));
};

export const findAgentCategory = (categories: AgentQuestionCategory[], args: Record<string, any>) => {
  const id = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
  const name = typeof args.categoryName === 'string' ? args.categoryName.trim() : '';
  return (id ? categories.find(category => category.id === id) : undefined)
    || (name ? categories.find(category => category.name === name) : undefined);
};

export const getAgentDescendantCategoryIds = (categories: AgentQuestionCategory[], categoryId: string) => {
  const result = new Set<string>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id);
        changed = true;
      }
    }
  }
  return result;
};

export const summarizeQuestion = (question: AgentQuestionItem, categoryName?: string) => ({
  id: question.id,
  title: question.title,
  categoryId: question.categoryId,
  categoryName,
  summary: question.summary || null,
  difficulty: question.difficulty,
  tags: question.tags,
  note: question.note || null,
  solutionCount: question.solutions.length,
  methodIds: question.methodIds,
  createdAt: question.createdAt,
  updatedAt: question.updatedAt,
});

export const summarizeMethod = (method: AgentMethodItem, categoryName?: string) => ({
  id: method.id,
  title: method.title,
  categoryId: method.categoryId,
  categoryName,
  summary: method.summary || null,
  tags: method.tags,
  note: method.note || null,
  createdAt: method.createdAt,
  updatedAt: method.updatedAt,
});

export const normalizeCanvasCategoryMeta = (entry: unknown): AgentCanvasCategoryMeta | null => {
  const name = typeof entry === 'string'
    ? entry.trim()
    : entry && typeof entry === 'object'
      ? String((entry as any).name || '').trim()
      : '';
  if (!name || name === '全部' || name === '未分类' || name === '__all__') return null;
  const rawIcon = entry && typeof entry === 'object' ? String((entry as any).icon || '').trim() : '';
  const rawColor = entry && typeof entry === 'object' ? String((entry as any).color || '').trim() : '';
  return {
    name,
    icon: rawIcon || 'Layers',
    color: rawColor || '#3b82f6',
  };
};

export const normalizeCanvasCategories = (source: unknown): AgentCanvasCategoryMeta[] => {
  if (!Array.isArray(source)) return [];
  const seen = new Set<string>();
  const result: AgentCanvasCategoryMeta[] = [];
  for (const item of source) {
    const meta = normalizeCanvasCategoryMeta(item);
    if (!meta || seen.has(meta.name)) continue;
    seen.add(meta.name);
    result.push(meta);
  }
  return result;
};

export const normalizeCanvasDrawings = (source: unknown): AgentDrawingFile[] => {
  if (!Array.isArray(source)) return [];
  return source.map((drawing: any): AgentDrawingFile => ({
    id: String(drawing?.id || agentNowId('draw')),
    name: String(drawing?.name || '未命名画布'),
    data: drawing?.data && typeof drawing.data === 'object' ? drawing.data : { elements: [], appState: {}, files: {} },
    category: typeof drawing?.category === 'string' && drawing.category.trim() && drawing.category !== '未分类' ? drawing.category.trim() : undefined,
    createdAt: Number(drawing?.createdAt) || Date.now(),
    updatedAt: Number(drawing?.updatedAt) || Date.now(),
  }));
};

export const loadAgentCanvasDrawings = () =>
  loadUnifiedJson({
    appDataKey: CANVAS_DRAWINGS_STORE_KEY,
    localStorageKey: CANVAS_DRAWINGS_STORAGE_KEY,
    defaultValue: () => [] as AgentDrawingFile[],
    normalize: normalizeCanvasDrawings,
  });

export const saveAgentCanvasDrawings = (drawings: AgentDrawingFile[], activeId?: string) => {
  saveUnifiedJson(
    {
      appDataKey: CANVAS_DRAWINGS_STORE_KEY,
      localStorageKey: CANVAS_DRAWINGS_STORAGE_KEY,
      defaultValue: () => [] as AgentDrawingFile[],
      normalize: normalizeCanvasDrawings,
    },
    drawings,
  );
  if (activeId) {
    saveUnifiedJson(
      {
        appDataKey: CANVAS_ACTIVE_STORE_KEY,
        localStorageKey: CANVAS_ACTIVE_STORAGE_KEY,
        defaultValue: () => '',
        normalize: value => (typeof value === 'string' ? value : ''),
        localStorageMode: 'raw-string',
      },
      activeId,
    );
  }
  window.dispatchEvent(new CustomEvent('guyue-canvas-updated'));
};

export const loadAgentCanvasCategories = () =>
  loadUnifiedJson({
    appDataKey: CANVAS_CATEGORIES_STORE_KEY,
    localStorageKey: CANVAS_CATEGORIES_STORAGE_KEY,
    defaultValue: () => [] as AgentCanvasCategoryMeta[],
    normalize: normalizeCanvasCategories,
  });

export const saveAgentCanvasCategories = (categories: AgentCanvasCategoryMeta[]) => {
  saveUnifiedJson(
    {
      appDataKey: CANVAS_CATEGORIES_STORE_KEY,
      localStorageKey: CANVAS_CATEGORIES_STORAGE_KEY,
      defaultValue: () => [] as AgentCanvasCategoryMeta[],
      normalize: normalizeCanvasCategories,
    },
    categories,
  );
  window.dispatchEvent(new CustomEvent('guyue-canvas-updated'));
};

const normalizeMusicTrack = (track: any): MusicTrack | null => {
  const id = String(track?.id || '').trim();
  const filePath = String(track?.filePath || '').trim();
  const title = String(track?.title || track?.name || '').trim();
  if (!id && !filePath && !title) return null;
  return {
    id: id || agentNowId('track'),
    filePath,
    title: title || filePath.split(/[\\/]/).pop() || '未命名歌曲',
    artist: String(track?.artist || '未知艺术家'),
    album: String(track?.album || ''),
    duration: Number(track?.duration) || 0,
    format: String(track?.format || ''),
    sampleRate: Number.isFinite(Number(track?.sampleRate)) ? Number(track.sampleRate) : undefined,
    bitDepth: Number.isFinite(Number(track?.bitDepth)) ? Number(track.bitDepth) : undefined,
    bitrate: Number.isFinite(Number(track?.bitrate)) ? Number(track.bitrate) : undefined,
    lossless: typeof track?.lossless === 'boolean' ? track.lossless : undefined,
    addedAt: Number(track?.addedAt) || Date.now(),
    lyricist: typeof track?.lyricist === 'string' ? track.lyricist : undefined,
    composer: typeof track?.composer === 'string' ? track.composer : undefined,
    arranger: typeof track?.arranger === 'string' ? track.arranger : undefined,
    producer: typeof track?.producer === 'string' ? track.producer : undefined,
    band: typeof track?.band === 'string' ? track.band : undefined,
    genre: typeof track?.genre === 'string' ? track.genre : undefined,
    year: Number.isFinite(Number(track?.year)) ? Number(track.year) : undefined,
    trackNumber: Number.isFinite(Number(track?.trackNumber)) ? Number(track.trackNumber) : undefined,
    discNumber: Number.isFinite(Number(track?.discNumber)) ? Number(track.discNumber) : undefined,
    comment: typeof track?.comment === 'string' ? track.comment : undefined,
    lyrics: typeof track?.lyrics === 'string' ? track.lyrics : undefined,
    customCover: typeof track?.customCover === 'string' ? track.customCover : undefined,
  };
};

const normalizeMusicTracks = (source: unknown): MusicTrack[] =>
  Array.isArray(source)
    ? source.map(normalizeMusicTrack).filter((track): track is MusicTrack => Boolean(track))
    : [];

const normalizeMusicPlaylists = (source: unknown): MusicPlaylist[] => {
  const raw = Array.isArray(source) ? source : DEFAULT_MUSIC_PLAYLISTS;
  const seen = new Set<string>();
  const playlists = raw
    .filter((playlist: any) => playlist?.id !== 'favorites')
    .map((playlist: any): MusicPlaylist | null => {
      const id = String(playlist?.id || '').trim();
      const name = String(playlist?.name || '').trim();
      if (!id || !name || seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name,
        icon: String(playlist?.icon || 'ListMusic'),
        color: typeof playlist?.color === 'string' ? playlist.color : undefined,
        isSystem: Boolean(playlist?.isSystem),
        trackIds: Array.isArray(playlist?.trackIds)
          ? playlist.trackIds.map((trackId: unknown) => String(trackId).trim()).filter(Boolean)
          : [],
      };
    })
    .filter((playlist): playlist is MusicPlaylist => Boolean(playlist));
  if (!playlists.some(playlist => playlist.id === 'all')) {
    playlists.unshift({ ...DEFAULT_MUSIC_PLAYLISTS[0] });
  }
  return playlists;
};

export const loadAgentMusicTracks = () =>
  loadUnifiedJson({
    appDataKey: appDataMirrorKeyForLocalStorageKey(MUSIC_TRACKS_STORAGE_KEY),
    localStorageKey: MUSIC_TRACKS_STORAGE_KEY,
    defaultValue: () => [] as MusicTrack[],
    normalize: normalizeMusicTracks,
  });

export const loadAgentMusicPlaylists = () =>
  loadUnifiedJson({
    appDataKey: appDataMirrorKeyForLocalStorageKey(MUSIC_PLAYLISTS_STORAGE_KEY),
    localStorageKey: MUSIC_PLAYLISTS_STORAGE_KEY,
    defaultValue: () => DEFAULT_MUSIC_PLAYLISTS,
    normalize: normalizeMusicPlaylists,
  });

export const loadAgentSelectedMusicPlaylist = () => {
  try {
    return localStorage.getItem(MUSIC_SELECTED_PLAYLIST_STORAGE_KEY) || 'all';
  } catch {
    return 'all';
  }
};

export const loadAgentGitRepositories = () =>
  loadLocalJson({
    localStorageKey: GIT_REPOSITORIES_STORAGE_KEY,
    defaultValue: () => [] as Array<{ path: string; name: string; addedAt?: number; lastOpenedAt?: number }>,
    normalize: (source: unknown) => Array.isArray(source)
      ? source
          .map((repo: any) => ({
            path: String(repo?.path || '').trim(),
            name: String(repo?.name || repo?.path?.split(/[\\/]/).pop() || '').trim(),
            addedAt: Number(repo?.addedAt) || Date.now(),
            lastOpenedAt: Number(repo?.lastOpenedAt) || undefined,
          }))
          .filter(repo => repo.path)
      : [],
  });

export const findAgentGitRepo = (args: Record<string, any>) => {
  const repositories = loadAgentGitRepositories();
  const repoPath = typeof args.repoPath === 'string' ? args.repoPath.trim() : '';
  const repoName = typeof args.repoName === 'string' ? args.repoName.trim() : '';
  return (repoPath ? repositories.find(repo => repo.path === repoPath) : undefined)
    || (repoName ? repositories.find(repo => repo.name === repoName) : undefined)
    || (repositories.length === 1 ? repositories[0] : undefined);
};
