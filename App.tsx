import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { NavRail } from './components/NavRail';
import { Sidebar } from './components/Sidebar';
import { TodoSidebar, TodoSubMode } from './components/TodoSidebar';
import { SplashScreen } from './components/SplashScreen';
import { Category, Note, SSHRecord, APIRecord, TodoItem, FileRecord, PromptRecord, MarkdownNote, ImageRecord, ImageHostingConfig, DEFAULT_CATEGORIES, AppMode, ModuleConfig, DEFAULT_MODULE_CONFIG, PluginMetadata, HeatmapData, OJHeatmapData, ResourceCenterData, EmailConfig, RecurringEvent, RecurringCategory, DEFAULT_RECURRING_CATEGORIES, STORAGE_KEY_RECURRING_CATS, MusicTrack, MusicPlaylist, DEFAULT_MUSIC_PLAYLISTS } from './types';
import { Plus, Search, Command, Loader2, ChevronRight, Upload, Edit3, Save, List, HelpCircle } from 'lucide-react';
import type { VaultFileEntry } from './components/VaultImportModal';
import { FloatingChatWindow } from './components/FloatingChatWindow';

// Lazy load components to improve initial load performance
const NoteList = React.lazy(() => import('./components/NoteList').then(m => ({ default: m.NoteList })));
const SSHList = React.lazy(() => import('./components/SSHList').then(m => ({ default: m.SSHList })));
const TodoList = React.lazy(() => import('./components/TodoList').then(m => ({ default: m.TodoList })));
const ScheduleView = React.lazy(() => import('./components/ScheduleView').then(m => ({ default: m.ScheduleView })));
const PromptList = React.lazy(() => import('./components/PromptList').then(m => ({ default: m.PromptList })));
const MarkdownSidebar = React.lazy(() => import('./components/MarkdownSidebar').then(m => ({ default: m.MarkdownSidebar })));
const ArchiveSidebar = React.lazy(() => import('./components/ArchiveSidebar').then(m => ({ default: m.ArchiveSidebar })));
const MarkdownEditor = React.lazy(() => import('./components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const FileRenderer = React.lazy(() => import('./components/FileRenderer').then(m => ({ default: m.FileRenderer })));
const Terminal = React.lazy(() => import('./components/Terminal').then(m => ({ default: m.Terminal })));
const WebBrowser = React.lazy(() => import('./components/WebBrowser').then(m => ({ default: m.WebBrowser })));
const LeetCodeManager = React.lazy(() => import('./components/LeetCodeManager').then(m => ({ default: m.LeetCodeManager })));
const LearningManager = React.lazy(() => import('./components/LearningManager').then(m => ({ default: m.LearningManager })));
const ImageHosting = React.lazy(() => import('./components/ImageHosting').then(m => ({ default: m.ImageHosting })));
const PluginContainer = React.lazy(() => import('./components/PluginContainer').then(m => ({ default: m.PluginContainer })));
const HeatmapContainer = React.lazy(() => import('./components/HeatmapContainer').then(m => ({ default: m.HeatmapContainer })));
const DataCenterManager = React.lazy(() => import('./components/datacenter/DataCenterManager').then(m => ({ default: m.DataCenterManager })));
const ExcalidrawEditor = React.lazy(() => import('./components/datacenter/ExcalidrawEditor').then(m => ({ default: m.ExcalidrawEditor })));
const RecurringEventManager = React.lazy(() => import('./components/RecurringEventManager').then(m => ({ default: m.RecurringEventManager })));
const LatexEditor = React.lazy(() => import('./components/LatexEditor').then(m => ({ default: m.LatexEditor })));
const LatexSidebar = React.lazy(() => import('./components/LatexSidebar').then(m => ({ default: m.LatexSidebar })));
const MusicPlayer = React.lazy(() => import('./components/MusicPlayer').then(m => ({ default: m.MusicPlayer })));
const MusicSidebar = React.lazy(() => import('./components/MusicSidebar').then(m => ({ default: m.MusicSidebar })));
const RagTestBench = React.lazy(() => import('./components/RagTestBench').then(m => ({ default: m.RagTestBench })));
const KnowledgeBase = React.lazy(() => import('./components/KnowledgeBase').then(m => ({ default: m.KnowledgeBase })));
const WorkflowEngine = React.lazy(() => import('./components/WorkflowEngine').then(m => ({ default: m.WorkflowEngine })));

// Lazy load modals
const NoteModal = React.lazy(() => import('./components/NoteModal').then(m => ({ default: m.NoteModal })));
const SSHModal = React.lazy(() => import('./components/SSHModal').then(m => ({ default: m.SSHModal })));
const TodoModal = React.lazy(() => import('./components/TodoModal').then(m => ({ default: m.TodoModal })));
const FileModal = React.lazy(() => import('./components/FileModal').then(m => ({ default: m.FileModal })));
const PromptModal = React.lazy(() => import('./components/PromptModal').then(m => ({ default: m.PromptModal })));
const CategoryManagerModal = React.lazy(() => import('./components/CategoryManagerModal').then(m => ({ default: m.CategoryManagerModal })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const VaultImportModal = React.lazy(() => import('./components/VaultImportModal').then(m => ({ default: m.VaultImportModal })));
const AgentPanel = React.lazy(() => import('./components/AgentPanel').then(m => ({ default: m.AgentPanel })));
import { HelpModal } from './components/HelpModal';

// Storage version for migration management
const STORAGE_VERSION = 'v1';
const STORAGE_VERSION_KEY = 'linkmaster_storage_version';

const STORAGE_KEY_CATEGORIES = 'linkmaster_categories_v1';
const STORAGE_KEY_NOTES = 'linkmaster_notes_v1';
const STORAGE_KEY_SSH = 'linkmaster_ssh_v1';
const STORAGE_KEY_API = 'linkmaster_api_v1';
const STORAGE_KEY_TODOS = 'linkmaster_todos_v1';
const STORAGE_KEY_TODO_PLAN = 'linkmaster_todo_plan_v1';
const STORAGE_KEY_FILES = 'linkmaster_files_v1';
const STORAGE_KEY_PROMPTS = 'linkmaster_prompts_v1';
const STORAGE_KEY_MARKDOWN = 'linkmaster_markdown_v1';
const STORAGE_KEY_MODULES = 'linkmaster_modules_v1';
const STORAGE_KEY_IMAGE_RECORDS = 'linkmaster_image_records_v1';
const STORAGE_KEY_IMAGE_CONFIG = 'linkmaster_image_config_v1';
const STORAGE_KEY_SPLASH_TEXT = 'linkmaster_splash_text_v1';
const STORAGE_KEY_HEATMAP = 'linkmaster_heatmap_v1';
const STORAGE_KEY_OJ_HEATMAP = 'linkmaster_oj_heatmap_v1';
const STORAGE_KEY_RESOURCE = 'linkmaster_resource_v1';
const STORAGE_KEY_EMAIL_CONFIG = 'linkmaster_email_config';
const STORAGE_KEY_AGENT_SHORTCUT = 'linkmaster_agent_shortcut';
const STORAGE_KEY_LAST_EMAIL_CHECK = 'linkmaster_last_email_check';
const STORAGE_KEY_RECURRING = 'linkmaster_recurring_v1';
const STORAGE_KEY_MUSIC_TRACKS = 'guyue_music_tracks_v1';
const STORAGE_KEY_MUSIC_PLAYLISTS = 'guyue_music_playlists_v1';
const STORAGE_KEY_APP_MODE = 'guyue_app_mode';
const STORAGE_KEY_TODO_SUBMODE = 'guyue_todo_submode';
const STORAGE_KEY_MODE_SNAPSHOTS = 'guyue_mode_snapshots';

const DEFAULT_SPLASH_QUOTES = [
  '有善始者实繁，能克终者盖寡',
  '行到水穷处，坐看云起时',
  '不畏浮云遮望眼，自缘身在最高层'
];

const loadSplashQuotes = (): string[] => {
  if (typeof window === 'undefined') return DEFAULT_SPLASH_QUOTES;
  const raw = localStorage.getItem(STORAGE_KEY_SPLASH_TEXT);
  if (!raw) return DEFAULT_SPLASH_QUOTES;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  } catch (error) {
    const single = raw.trim();
    if (single) return [single];
  }

  const fallback = raw.trim();
  return fallback ? [fallback] : DEFAULT_SPLASH_QUOTES;
};

const pickRandomSplashQuote = (quotes: string[]) => {
  if (!quotes.length) return DEFAULT_SPLASH_QUOTES[0];
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
};

// Data migration utility
const migrateStorageData = () => {
  const currentVersion = localStorage.getItem(STORAGE_VERSION_KEY);
  
  // First time or old version - perform migration
  if (!currentVersion) {
    console.log('Performing storage migration...');
    
    // Example: Migrate old keys to new keys
    const oldKeys = [
      { old: 'linkmaster_categories', new: STORAGE_KEY_CATEGORIES },
      { old: 'linkmaster_notes', new: STORAGE_KEY_NOTES },
      { old: 'linkmaster_ssh', new: STORAGE_KEY_SSH },
      { old: 'linkmaster_api', new: STORAGE_KEY_API },
      { old: 'linkmaster_todos', new: STORAGE_KEY_TODOS },
      { old: 'linkmaster_files', new: STORAGE_KEY_FILES },
      { old: 'linkmaster_prompts', new: STORAGE_KEY_PROMPTS },
      { old: 'linkmaster_markdown', new: STORAGE_KEY_MARKDOWN },
      { old: 'linkmaster_modules', new: STORAGE_KEY_MODULES },
      { old: 'linkmaster_image_records', new: STORAGE_KEY_IMAGE_RECORDS },
      { old: 'linkmaster_image_config', new: STORAGE_KEY_IMAGE_CONFIG },
      { old: 'linkmaster_splash_text', new: STORAGE_KEY_SPLASH_TEXT },
      { old: 'learning_data', new: 'learning_data_v1' },
    ];
    
    oldKeys.forEach(({ old, new: newKey }) => {
      const oldData = localStorage.getItem(old);
      if (oldData && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldData);
        console.log(`Migrated ${old} to ${newKey}`);
      }
    });
    
    // Set current version
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  }
};

// Safe JSON parse with error handling
const safeJSONParse = <T,>(data: string | null, defaultValue: T): T => {
  if (!data) return defaultValue;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('JSON parse error:', e);
    return defaultValue;
  }
};

const App: React.FC = () => {
  // Perform data migration on app start
  useEffect(() => {
    migrateStorageData();
  }, []);

  // 启动时恢复代理设置
  useEffect(() => {
    const savedPort = localStorage.getItem('linkmaster_proxy_port');
    if (savedPort && window.electronAPI?.setProxy) {
      window.electronAPI.setProxy(parseInt(savedPort, 10));
    }
  }, []);

  // Splash screen state
  const [showSplash, setShowSplash] = useState(() => {
    const splashEnabled = localStorage.getItem('linkmaster_splash_enabled');
    return splashEnabled !== 'false';
  });
  const [splashText] = useState<string>(() => {
    const quotes = loadSplashQuotes();
    return pickRandomSplashQuote(quotes);
  });
  const [isAppReady, setIsAppReady] = useState(false);
  const imageDataLoadedRef = useRef(false);  // 图床数据是否已完成初始加载
  
  // Performance: Cache for loaded data to prevent re-parsing
  const [dataCache] = useState(() => new Map<string, any>());

  const [appMode, setAppMode] = useState<AppMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_APP_MODE);
      return saved ? JSON.parse(saved) : 'todo';
    } catch { return 'todo'; }
  });
  const [todoSubMode, setTodoSubMode] = useState<TodoSubMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TODO_SUBMODE);
      return saved ? JSON.parse(saved) : 'tasks';
    } catch { return 'tasks'; }
  });
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig[]>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MODULE_CONFIG;
    }

    const savedModules = localStorage.getItem(STORAGE_KEY_MODULES);
    if (savedModules) {
      try {
        const parsed: ModuleConfig[] = JSON.parse(savedModules);
        const merged = DEFAULT_MODULE_CONFIG
          .filter(m => m.id !== 'api') // API模块已并入数据中心
          .map(defaultModule => {
          const existing = parsed.find(m => m.id === defaultModule.id);
          return existing ? { ...defaultModule, ...existing, name: defaultModule.name } : defaultModule;
        });
        const legacyExtras = parsed.filter(m =>
          !merged.find(item => item.id === m.id) &&
          (m.id as string) !== 'tips' &&
          (m.id as string) !== 'renderer' &&
          (m.id as string) !== 'markdown' &&
          (m.id as string) !== 'vscode' &&
          (m.id as string) !== 'bookmarks' &&
          (m.id as string) !== 'ssh' &&
          (m.id as string) !== 'api' &&
          (m.id as string) !== 'recurring' &&
          m.name !== '文件归档'
        );
        return [...merged, ...legacyExtras];
      } catch (error) {
        console.error('Failed to parse module config, falling back to defaults', error);
      }
    }

    return DEFAULT_MODULE_CONFIG;
  });
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [sshRecords, setSSHRecords] = useState<SSHRecord[]>([]);
  const [apiRecords, setApiRecords] = useState<APIRecord[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [fileRecords, setFileRecords] = useState<FileRecord[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [markdownNotes, setMarkdownNotes] = useState<MarkdownNote[]>([]);
  const [imageRecords, setImageRecords] = useState<ImageRecord[]>([]);
  const [imageHostingConfig, setImageHostingConfig] = useState<ImageHostingConfig>({
    accessToken: '',
    owner: '',
    repo: '',
    path: ''
  });
  const [activeRenderFileId, setActiveRenderFileId] = useState<string | null>(null);
  const [activeTipId, setActiveTipId] = useState<string | null>(null);
  const [isRendererFullscreen, setIsRendererFullscreen] = useState(false);
  const [isMarkdownFullscreen, setIsMarkdownFullscreen] = useState(false);
  const [isTerminalFullscreen, setIsTerminalFullscreen] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isLatexFullscreen, setIsLatexFullscreen] = useState(false);
  const [initialTerminalCommand, setInitialTerminalCommand] = useState<string | undefined>(undefined);
  const [initialTerminalTitle, setInitialTerminalTitle] = useState<string | undefined>(undefined);
  const [browserUrl, setBrowserUrl] = useState<string>(() => {
    return localStorage.getItem('linkmaster_browser_start_page') || 'https://www.bing.com';
  });
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  
  // Lazy initialization states
  const [hasTerminalMounted, setHasTerminalMounted] = useState(false);
  const [hasBrowserMounted, setHasBrowserMounted] = useState(false);
  const [hasLeetCodeMounted, setHasLeetCodeMounted] = useState(false);
  const [hasLearningMounted, setHasLearningMounted] = useState(false);
  const [hasExcalidrawMounted, setHasExcalidrawMounted] = useState(false);
  const [hasDataCenterMounted, setHasDataCenterMounted] = useState(false);
  const [hasMusicMounted, setHasMusicMounted] = useState(false);
  const [hasRagMounted, setHasRagMounted] = useState(false);
  const [hasKbMounted, setHasKbMounted] = useState(false);
  const [hasWorkflowMounted, setHasWorkflowMounted] = useState(false);

  // Prevent body scroll to fix layout shifts on focus
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    document.body.style.width = '100vw';
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.body.style.width = '';
    };
  }, []);

  useEffect(() => {
    if (appMode === 'terminal' && !hasTerminalMounted) {
      setHasTerminalMounted(true);
    }
    if (appMode === 'browser' && !hasBrowserMounted) {
      setHasBrowserMounted(true);
    }
    if (appMode === 'leetcode' && !hasLeetCodeMounted) {
      setHasLeetCodeMounted(true);
    }
    if (appMode === 'learning' && !hasLearningMounted) {
      setHasLearningMounted(true);
    }
    if (appMode === 'excalidraw' && !hasExcalidrawMounted) {
      setHasExcalidrawMounted(true);
    }
    if (appMode === 'datacenter' && !hasDataCenterMounted) {
      setHasDataCenterMounted(true);
    }
    if (appMode === 'music' && !hasMusicMounted) {
      setHasMusicMounted(true);
    }
    if (appMode === 'rag' && !hasRagMounted) {
      setHasRagMounted(true);
    }
    if (appMode === 'knowledge-base' && !hasKbMounted) {
      setHasKbMounted(true);
    }
    if (appMode === 'workflow' && !hasWorkflowMounted) {
      setHasWorkflowMounted(true);
    }
  }, [appMode, hasTerminalMounted, hasBrowserMounted, hasLeetCodeMounted, hasLearningMounted, hasExcalidrawMounted, hasDataCenterMounted, hasMusicMounted, hasRagMounted, hasKbMounted, hasWorkflowMounted]);

  // Persist appMode & todoSubMode to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_APP_MODE, JSON.stringify(appMode)); } catch {}
  }, [appMode]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_TODO_SUBMODE, JSON.stringify(todoSubMode)); } catch {}
  }, [todoSubMode]);

  // Per-mode category snapshots: remember selectedCategory for each mode
  const modeSnapshotsRef = useRef<Record<string, string>>({});
  // Initialize ref from localStorage (run once)
  const [modeSnapshotsLoaded] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MODE_SNAPSHOTS);
      if (saved) modeSnapshotsRef.current = JSON.parse(saved);
    } catch {}
    return true;
  });
  
  // Categories now managed per app mode
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category[]>>({
    ssh: DEFAULT_CATEGORIES,
    api: DEFAULT_CATEGORIES,
    todo: DEFAULT_CATEGORIES,
    files: DEFAULT_CATEGORIES,
    prompts: DEFAULT_CATEGORIES,
    'image-hosting': DEFAULT_CATEGORIES,
    notes: []
  });
  
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const selectedCategoryRef = useRef(selectedCategory);
  selectedCategoryRef.current = selectedCategory;
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isSkillImportOpen, setIsSkillImportOpen] = useState(false);
  
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [initialCategoryEditId, setInitialCategoryEditId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);
  const [floatingChatSource, setFloatingChatSource] = useState<'leetcode' | 'learning' | null>(null);

  const handleToggleFloatingChat = useCallback((source: 'leetcode' | 'learning') => {
    if (isFloatingChatOpen && floatingChatSource === source) {
      setIsFloatingChatOpen(false);
    } else {
      setFloatingChatSource(source);
      setIsFloatingChatOpen(true);
    }
  }, [isFloatingChatOpen, floatingChatSource]);

  const [vaultImportFiles, setVaultImportFiles] = useState<VaultFileEntry[] | null>(null);
  
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingSSH, setEditingSSH] = useState<SSHRecord | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);
  const [fileModalMode, setFileModalMode] = useState<'file' | 'note'>('file');
  const [editingPrompt, setEditingPrompt] = useState<PromptRecord | null>(null);
  
  // Todo Plan State
  const [showTodoPlan, setShowTodoPlan] = useState(true);
  const [todoPlanEditing, setTodoPlanEditing] = useState(false);
  const [todoPlanShowTOC, setTodoPlanShowTOC] = useState(false);
  const [todoPlanHasTOC, setTodoPlanHasTOC] = useState(false);
  const [todoPlanContent, setTodoPlanContent] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TODO_PLAN);
    if (saved) {
      let raw = saved;
      // 兼容旧JSON字符串格式
      if (raw.startsWith('"') && raw.endsWith('"')) {
        try { raw = JSON.parse(raw); } catch {
          raw = raw.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
      }
      // 迁移：去掉旧默认的 # 总体规划 标题行
      raw = raw.replace(/^#\s*总体规划\s*\n+/, '');
      return raw || '在这里记录你的总体规划和目标...\n';
    }
    return '在这里记录你的总体规划和目标...\n';
  });

  // Heatmap State
  const [heatmapData, setHeatmapData] = useState<HeatmapData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HEATMAP);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { guyue: {}, xiaohong: {} };
      }
    }
    return { guyue: {}, xiaohong: {} };
  });

  // OJ Heatmap State (数据中心) - 初始为空，从文件加载
  const [ojHeatmapData, setOJHeatmapData] = useState<OJHeatmapData>({ sites: [], submissions: [] });
  const [isOJDataLoaded, setIsOJDataLoaded] = useState(false);

  // Resource Center State
  const [resourceData, setResourceData] = useState<ResourceCenterData>({ categories: [], items: [] });
  const [isResourceDataLoaded, setIsResourceDataLoaded] = useState(false);

  // Recurring Events State
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECURRING);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [recurringCategories, setRecurringCategories] = useState<RecurringCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECURRING_CATS);
      return saved ? JSON.parse(saved) : DEFAULT_RECURRING_CATEGORIES;
    } catch { return DEFAULT_RECURRING_CATEGORIES; }
  });

  const handleUpdateRecurringCategories = (cats: RecurringCategory[]) => {
    setRecurringCategories(cats);
    try { localStorage.setItem(STORAGE_KEY_RECURRING_CATS, JSON.stringify(cats)); } catch {}
  };

  const handleAddCategory = useCallback((moduleKey: string, name: string) => {
    setCategoriesMap(prev => {
      const current = prev[moduleKey] || DEFAULT_CATEGORIES;
      if (current.some(c => c.name === name)) return prev;
      const newCat: Category = { id: crypto.randomUUID(), name, icon: 'Folder', isSystem: false };
      return { ...prev, [moduleKey]: [...current, newCat] };
    });
  }, []);

  // File Editing State
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editingFileContent, setEditingFileContent] = useState('');

  // ── Music Player State ──
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MUSIC_TRACKS);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [musicPlaylists, setMusicPlaylists] = useState<MusicPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MUSIC_PLAYLISTS);
      if (saved) {
        const parsed = JSON.parse(saved) as MusicPlaylist[];
        // Migration: remove legacy "favorites" playlist
        return parsed.filter(p => p.id !== 'favorites');
      }
      return DEFAULT_MUSIC_PLAYLISTS;
    } catch { return DEFAULT_MUSIC_PLAYLISTS; }
  });
  const [selectedMusicPlaylist, setSelectedMusicPlaylist] = useState('all');
  const musicCoverCache = useRef(new Map<string, string>());
  const [musicCoverVersion, setMusicCoverVersion] = useState(0);

  const saveMusicTracks = useCallback((tracks: MusicTrack[]) => {
    setMusicTracks(tracks);
    try { localStorage.setItem(STORAGE_KEY_MUSIC_TRACKS, JSON.stringify(tracks)); } catch {}
  }, []);
  const saveMusicPlaylists = useCallback((pls: MusicPlaylist[]) => {
    setMusicPlaylists(pls);
    try { localStorage.setItem(STORAGE_KEY_MUSIC_PLAYLISTS, JSON.stringify(pls)); } catch {}
  }, []);

  const addMusicFilesHelper = useCallback(async (filePaths: string[]) => {
    const api = (window as any).electronAPI;
    if (!api?.musicParseMetadata || filePaths.length === 0) return;
    const existingPaths = new Set(musicTracks.map(t => t.filePath));
    const newPaths = filePaths.filter(p => !existingPaths.has(p));
    if (newPaths.length === 0) return;
    const newTracks: MusicTrack[] = [];
    for (const fp of newPaths) {
      const meta = await api.musicParseMetadata(fp);
      const id = crypto.randomUUID();
      newTracks.push({
        id, filePath: fp,
        title: meta.title, artist: meta.artist, album: meta.album,
        duration: meta.duration, format: meta.format,
        sampleRate: meta.sampleRate, bitDepth: meta.bitDepth,
        bitrate: meta.bitrate, lossless: meta.lossless,
        composer: meta.composer, lyricist: meta.lyricist,
        genre: meta.genre, year: meta.year,
        trackNumber: meta.trackNumber, discNumber: meta.discNumber,
        addedAt: Date.now(),
      });
      if (meta.coverArt) musicCoverCache.current.set(id, meta.coverArt);
    }
    const allTracks = [...musicTracks, ...newTracks];
    saveMusicTracks(allTracks);
    // Add to current playlist if it's a user playlist
    const newIds = newTracks.map(t => t.id);
    if (selectedMusicPlaylist !== 'all') {
      saveMusicPlaylists(musicPlaylists.map(p =>
        p.id === selectedMusicPlaylist ? { ...p, trackIds: [...p.trackIds, ...newIds] } : p
      ));
    }
    setMusicCoverVersion(v => v + 1);
  }, [musicTracks, musicPlaylists, selectedMusicPlaylist, saveMusicTracks, saveMusicPlaylists]);

  const handleMusicAddFiles = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.musicSelectFiles) return;
    const filePaths: string[] = await api.musicSelectFiles();
    await addMusicFilesHelper(filePaths);
  }, [addMusicFilesHelper]);

  const handleMusicAddFolder = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.musicSelectFolder) return;
    const filePaths: string[] = await api.musicSelectFolder();
    await addMusicFilesHelper(filePaths);
  }, [addMusicFilesHelper]);

  const handleMusicCreatePlaylist = useCallback((name: string, icon?: string, color?: string) => {
    const pl: MusicPlaylist = { id: crypto.randomUUID(), name, icon: icon || 'ListMusic', color, trackIds: [] };
    saveMusicPlaylists([...musicPlaylists, pl]);
  }, [musicPlaylists, saveMusicPlaylists]);

  const handleMusicRenamePlaylist = useCallback((id: string, name: string) => {
    saveMusicPlaylists(musicPlaylists.map(p => p.id === id ? { ...p, name } : p));
  }, [musicPlaylists, saveMusicPlaylists]);

  const handleMusicDeletePlaylist = useCallback((id: string) => {
    saveMusicPlaylists(musicPlaylists.filter(p => p.id !== id));
    if (selectedMusicPlaylist === id) setSelectedMusicPlaylist('all');
  }, [musicPlaylists, selectedMusicPlaylist, saveMusicPlaylists]);

  const handleMusicUpdatePlaylist = useCallback((id: string, updates: Partial<MusicPlaylist>) => {
    saveMusicPlaylists(musicPlaylists.map(p => p.id === id ? { ...p, ...updates } : p));
  }, [musicPlaylists, saveMusicPlaylists]);

  const handleMusicReorderPlaylist = useCallback((id: string, direction: 'up' | 'down') => {
    const userPls = musicPlaylists.filter(p => !p.isSystem);
    const sysPls = musicPlaylists.filter(p => p.isSystem);
    const idx = userPls.findIndex(p => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= userPls.length) return;
    const arr = [...userPls];
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
    saveMusicPlaylists([...sysPls, ...arr]);
  }, [musicPlaylists, saveMusicPlaylists]);

  const handleMusicToggleInPlaylist = useCallback((playlistId: string, trackId: string) => {
    saveMusicPlaylists(musicPlaylists.map(p => {
      if (p.id !== playlistId) return p;
      const has = p.trackIds.includes(trackId);
      return { ...p, trackIds: has ? p.trackIds.filter(id => id !== trackId) : [...p.trackIds, trackId] };
    }));
  }, [musicPlaylists, saveMusicPlaylists]);

  const handleMusicUpdateTrack = useCallback((trackId: string, updates: Partial<MusicTrack>) => {
    saveMusicTracks(musicTracks.map(t => t.id === trackId ? { ...t, ...updates } : t));
  }, [musicTracks, saveMusicTracks]);

  const handleMusicDeleteTrack = useCallback((trackId: string) => {
    saveMusicTracks(musicTracks.filter(t => t.id !== trackId));
    // Remove from all playlists
    saveMusicPlaylists(musicPlaylists.map(p => ({
      ...p, trackIds: p.trackIds.filter(id => id !== trackId),
    })));
  }, [musicTracks, musicPlaylists, saveMusicTracks, saveMusicPlaylists]);

  const handleMusicLoadCover = useCallback(async (trackId: string, filePath: string) => {
    if (musicCoverCache.current.has(trackId)) return;
    // Check for customCover first
    const track = musicTracks.find(t => t.id === trackId);
    if (track?.customCover) { musicCoverCache.current.set(trackId, track.customCover); setMusicCoverVersion(v => v + 1); return; }
    try {
      const api = (window as any).electronAPI;
      if (!api?.musicParseMetadata) return;
      const meta = await api.musicParseMetadata(filePath);
      if (meta.coverArt) {
        musicCoverCache.current.set(trackId, meta.coverArt);
        setMusicCoverVersion(v => v + 1);
      }
    } catch { /* ignore */ }
  }, [musicTracks]);

  const handleMusicSetCover = useCallback((trackId: string, dataUri: string) => {
    musicCoverCache.current.set(trackId, dataUri);
    setMusicCoverVersion(v => v + 1);
  }, []);

  const handleMusicReorderTracks = useCallback((playlistId: string, trackIds: string[]) => {
    saveMusicPlaylists(musicPlaylists.map(p => p.id === playlistId ? { ...p, trackIds } : p));
  }, [musicPlaylists, saveMusicPlaylists]);

  // LaTeX: ref bridges so LatexSidebar can inject content/files into LatexEditor
  const latexEditTemplateRef = useRef<((template: any) => void) | null>(null);
  const latexLoadTemplateAsFileRef = useRef<((content: string) => void) | null>(null);
  const latexOpenFileRef = useRef<((file: { path: string; content: string }) => void) | null>(null);
  // LaTeX sidebar visibility (independent of global isSidebarVisible)
  const [isLatexSidebarVisible, setIsLatexSidebarVisible] = useState(true);

  // Shortcut handling
  const isTabPressed = React.useRef(false);
  const tabComboUsed = React.useRef(false); // whether Tab was used with a combo key
  const fileSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Agent shortcut: double-tap key detection
  const agentShortcutKey = React.useRef<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AGENT_SHORTCUT);
    return saved || 'Meta';
  });
  const lastAgentKeyTime = React.useRef<number>(0);
  const agentKeyWasUsedAsCombo = React.useRef<boolean>(false);

  // Load agent shortcut config and watch for changes
  useEffect(() => {
    const load = () => {
      const saved = localStorage.getItem(STORAGE_KEY_AGENT_SHORTCUT);
      agentShortcutKey.current = saved || 'Meta';
    };
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY_AGENT_SHORTCUT) load(); };
    // Also pick up same-tab writes from SettingsModal
    const onCustom = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener('agent-shortcut-changed', onCustom);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('agent-shortcut-changed', onCustom); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track if the agent shortcut key is being used as a combo modifier
      if (e.key === agentShortcutKey.current) {
        agentKeyWasUsedAsCombo.current = false;
      } else if (
        (agentShortcutKey.current === 'Meta' && e.metaKey) ||
        (agentShortcutKey.current === 'Control' && e.ctrlKey) ||
        (agentShortcutKey.current === 'Alt' && e.altKey)
      ) {
        agentKeyWasUsedAsCombo.current = true;
      }

      if (e.key === 'Tab') {
        isTabPressed.current = true;
        tabComboUsed.current = false;
        // Prevent browser default focus-jump when Tab is used as our nav modifier
        e.preventDefault();
        return;
      }

      // Check for shortcuts while Tab is held
      if (isTabPressed.current) {
        // Check if a number or letter key is pressed
        if (/^[\da-zA-Z]$/.test(e.key)) {
          tabComboUsed.current = true;
          const key = e.key.toLowerCase();
          // Find module with matching shortcut
          const targetModule = moduleConfig.find(m => {
            if (!m.shortcut) return false;
            const parts = m.shortcut.toLowerCase().split('+');
            const shortcutKey = parts[parts.length - 1];
            const hasTab = parts.includes('tab');
            return hasTab && shortcutKey === key;
          });

          if (targetModule && targetModule.enabled) {
            e.preventDefault();
            setAppMode(targetModule.id);
          }
        }

        // Check for Tilde (~) / Backquote (`) to toggle sidebar
        if (e.code === 'Backquote') {
          tabComboUsed.current = true;
          e.preventDefault();
          setIsSidebarVisible(prev => !prev);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Agent shortcut: double-tap detection
      if (e.key === agentShortcutKey.current && !agentKeyWasUsedAsCombo.current) {
        const now = Date.now();
        if (now - lastAgentKeyTime.current < 350) {
          // Double-tap detected
          lastAgentKeyTime.current = 0;
          setAppMode(prev => prev === 'agent' ? 'todo' : 'agent');
        } else {
          lastAgentKeyTime.current = now;
        }
      }

      if (e.key === 'Tab') {
        if (!tabComboUsed.current) {
          // Pure Tab press (no combo) → cycle to next enabled module from current
          setAppMode(prev => {
            const enabled = moduleConfig
              .filter(m => m.enabled && m.id !== 'agent')
              .sort((a, b) => a.priority - b.priority);
            const cur = enabled.findIndex(m => m.id === prev);
            const next = enabled[(cur + 1) % enabled.length];
            return next ? next.id : prev;
          });
        }
        isTabPressed.current = false;
        tabComboUsed.current = false;
      }
    };

    const handleBlur = () => {
      isTabPressed.current = false;
      tabComboUsed.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [moduleConfig]);

  // Initial Load - Performance: Batch load all data
  useEffect(() => {
    const loadAllData = () => {
      // Performance Optimization 1: Batch read from localStorage
      // 注意：图床数据（IMAGE_RECORDS 和 IMAGE_CONFIG）由单独的 useEffect 从文件存储加载
      // 不在这里加载，避免被空值覆盖
      const storageKeys = [
        { key: STORAGE_KEY_CATEGORIES, setter: (data: any) => setCategoriesMap(prev => ({ ...prev, ...data })), defaultValue: null },
        { key: STORAGE_KEY_NOTES, setter: setNotes, defaultValue: [{id: '1', content: '欢迎使用 NoteMaster！\n在这里记录你的灵感。', color: 'bg-yellow-100', createdAt: Date.now()}]},
        { key: STORAGE_KEY_SSH, setter: setSSHRecords, defaultValue: [] },
        { key: STORAGE_KEY_API, setter: setApiRecords, defaultValue: [] },
        { key: STORAGE_KEY_TODOS, setter: setTodos, defaultValue: [] },
        { key: STORAGE_KEY_FILES, setter: setFileRecords, defaultValue: [] },
        { key: STORAGE_KEY_PROMPTS, setter: setPrompts, defaultValue: [] },
        { key: STORAGE_KEY_MARKDOWN, setter: setMarkdownNotes, defaultValue: [] },
      ];

      // Load all data in batch
      storageKeys.forEach(({ key, setter, defaultValue }) => {
        // Performance Optimization 2: Use cache to avoid re-parsing
        if (dataCache.has(key)) {
          setter(dataCache.get(key) as any);
          return;
        }

        const savedData = localStorage.getItem(key);

        if (savedData) {
          const parsed = safeJSONParse(savedData, defaultValue);
          if (parsed !== defaultValue) {
            dataCache.set(key, parsed);
            setter(parsed as any);
          } else if (defaultValue) {
            setter(defaultValue as any);
          }
        } else if (defaultValue) {
          setter(defaultValue as any);
        }
      });
    };

    loadAllData();
  }, [dataCache]);

  // 图床数据单独加载 - 优先从文件存储加载，确保更新后数据不丢失
  useEffect(() => {
    const loadImageData = async () => {
      if (!window.electronAPI) {
        // 非 Electron 环境，从 localStorage 加载
        const savedImageRecords = localStorage.getItem(STORAGE_KEY_IMAGE_RECORDS);
        if (savedImageRecords) {
          try {
            setImageRecords(JSON.parse(savedImageRecords));
          } catch (e) {
            console.error("Failed to parse image records", e);
          }
        }
        const savedImageConfig = localStorage.getItem(STORAGE_KEY_IMAGE_CONFIG);
        if (savedImageConfig) {
          try {
            setImageHostingConfig(JSON.parse(savedImageConfig));
          } catch (e) {
            console.error("Failed to parse image config", e);
          }
        }
        // 标记加载完成（使用 rAF 确保在 React 处理完状态更新后的渲染周期之后再标记）
        requestAnimationFrame(() => { imageDataLoadedRef.current = true; });
        return;
      }

      // 加载图床记录 - 优先从文件存储
      try {
        const fileData = await window.electronAPI.loadAppData('image-records');
        if (fileData && Array.isArray(fileData) && fileData.length > 0) {
          setImageRecords(fileData);
          // 同步回 localStorage 保证一致性
          localStorage.setItem(STORAGE_KEY_IMAGE_RECORDS, JSON.stringify(fileData));
        } else {
          // 回退到 localStorage（兼容旧数据）
          const savedImageRecords = localStorage.getItem(STORAGE_KEY_IMAGE_RECORDS);
          if (savedImageRecords) {
            const parsed = JSON.parse(savedImageRecords);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setImageRecords(parsed);
              // 迁移到文件存储
              await window.electronAPI.saveAppData('image-records', parsed);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load image records:", e);
      }

      // 加载图床配置 - 优先从文件存储
      try {
        const fileData = await window.electronAPI.loadAppData('image-config');
        if (fileData && typeof fileData === 'object') {
          setImageHostingConfig(fileData);
          localStorage.setItem(STORAGE_KEY_IMAGE_CONFIG, JSON.stringify(fileData));
        } else {
          const savedImageConfig = localStorage.getItem(STORAGE_KEY_IMAGE_CONFIG);
          if (savedImageConfig) {
            const parsed = JSON.parse(savedImageConfig);
            if (parsed && typeof parsed === 'object') {
              setImageHostingConfig(parsed);
              await window.electronAPI.saveAppData('image-config', parsed);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load image config:", e);
      }

      // 标记加载完成
      requestAnimationFrame(() => { imageDataLoadedRef.current = true; });
    };

    loadImageData();
  }, []);

  // 加载 OJ 热力图数据 - 从文件存储
  useEffect(() => {
    const loadOJData = async () => {
      if (!window.electronAPI) {
        // 浏览器环境：从 localStorage 加载
        const saved = localStorage.getItem(STORAGE_KEY_OJ_HEATMAP);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.records && !parsed.submissions) {
              setOJHeatmapData({ sites: parsed.sites || [], submissions: [] });
            } else {
              setOJHeatmapData(parsed);
            }
          } catch (e) {
            console.error("Failed to parse OJ data from localStorage:", e);
          }
        }
        setIsOJDataLoaded(true);
        return;
      }

      try {
        const fileData = await window.electronAPI.loadAppData('oj-heatmap');
        if (fileData && (fileData.sites || fileData.submissions)) {
          // 兼容旧数据结构
          if (fileData.records && !fileData.submissions) {
            setOJHeatmapData({ sites: fileData.sites || [], submissions: [] });
          } else {
            setOJHeatmapData(fileData);
          }
          console.log("Loaded OJ data from file storage");
        } else {
          // 回退到 localStorage（兼容旧数据）
          const saved = localStorage.getItem(STORAGE_KEY_OJ_HEATMAP);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed.records && !parsed.submissions) {
                setOJHeatmapData({ sites: parsed.sites || [], submissions: [] });
              } else {
                setOJHeatmapData(parsed);
              }
              // 迁移到文件存储
              await window.electronAPI.saveAppData('oj-heatmap', parsed);
              console.log("Migrated OJ data to file storage");
            } catch (e) {
              console.error("Failed to parse OJ data:", e);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load OJ data:", e);
      }
      setIsOJDataLoaded(true);
    };

    loadOJData();
  }, []);

  // 加载资源中心数据 - 从文件存储
  useEffect(() => {
    // 数据清理函数：清理无效的 cost 对象
    const cleanResourceData = (data: ResourceCenterData): ResourceCenterData => {
      return {
        ...data,
        items: data.items.map(item => ({
          ...item,
          // 如果 cost 存在但 amount <= 0，则将 cost 设为 undefined
          cost: (item.cost && item.cost.amount > 0) ? item.cost : undefined
        }))
      };
    };

    const loadResourceData = async () => {
      if (!window.electronAPI) {
        // 浏览器环境：从 localStorage 加载
        const saved = localStorage.getItem(STORAGE_KEY_RESOURCE);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const cleaned = cleanResourceData(parsed);
            setResourceData(cleaned);
            // 如果清理后数据有变化，保存回 localStorage
            if (JSON.stringify(parsed) !== JSON.stringify(cleaned)) {
              localStorage.setItem(STORAGE_KEY_RESOURCE, JSON.stringify(cleaned));
              console.log("Cleaned invalid cost data in resource center");
            }
          } catch (e) {
            console.error("Failed to parse resource data from localStorage:", e);
          }
        }
        setIsResourceDataLoaded(true);
        return;
      }

      try {
        const fileData = await window.electronAPI.loadAppData('resource-center');
        if (fileData && (fileData.categories || fileData.items)) {
          const cleaned = cleanResourceData(fileData);
          setResourceData(cleaned);
          // 如果清理后数据有变化，保存回文件
          if (JSON.stringify(fileData) !== JSON.stringify(cleaned)) {
            await window.electronAPI.saveAppData('resource-center', cleaned);
            console.log("Cleaned invalid cost data in resource center");
          }
          console.log("Loaded resource data from file storage");
        } else {
          // 回退到 localStorage
          const saved = localStorage.getItem(STORAGE_KEY_RESOURCE);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              const cleaned = cleanResourceData(parsed);
              setResourceData(cleaned);
              await window.electronAPI.saveAppData('resource-center', cleaned);
              console.log("Migrated resource data to file storage");
            } catch (e) {
              console.error("Failed to parse resource data:", e);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load resource data:", e);
      }
      setIsResourceDataLoaded(true);
    };

    loadResourceData();
  }, []);

  // 启动时检查资源到期并发送邮件提醒
  useEffect(() => {
    const checkAndSendExpiryReminder = async () => {
      // 等待资源数据加载完成
      if (!isResourceDataLoaded || resourceData.items.length === 0) return;

      // 读取邮件配置
      const emailConfigStr = localStorage.getItem(STORAGE_KEY_EMAIL_CONFIG);
      if (!emailConfigStr) return;

      let emailConfig: EmailConfig;
      try {
        emailConfig = JSON.parse(emailConfigStr);
      } catch {
        return;
      }

      // 检查邮件是否启用
      if (!emailConfig.enabled || !emailConfig.smtp.host || !emailConfig.recipient) return;

      // 检查今天是否已经发送过
      const today = new Date().toISOString().split('T')[0];
      const lastCheck = localStorage.getItem(STORAGE_KEY_LAST_EMAIL_CHECK);
      if (lastCheck === today) return;

      // 找出所有启用了提醒且明天到期的资源
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const expiringResources = resourceData.items.filter(item => {
        if (!item.emailReminder || !item.expireDate) return false;
        return item.expireDate === tomorrowStr;
      });

      if (expiringResources.length === 0) {
        // 没有即将到期的资源，标记今天已检查
        localStorage.setItem(STORAGE_KEY_LAST_EMAIL_CHECK, today);
        return;
      }

      // 构建邮件内容
      const resourceList = expiringResources.map(r => `<li>${r.name} (到期日期: ${r.expireDate})</li>`).join('');
      const emailContent = `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">资源到期提醒</h2>
          <p>以下资源将于<strong>明天 (${tomorrowStr})</strong> 到期，请及时处理：</p>
          <ul style="line-height: 2;">
            ${resourceList}
          </ul>
          <p style="color: #6b7280; font-size: 12px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
            此邮件由 Guyue Master 自动发送
          </p>
        </div>
      `;

      // 发送邮件
      if (window.electronAPI?.sendEmail) {
        try {
          const result = await window.electronAPI.sendEmail({
            config: emailConfig,
            subject: `[Guyue Master] ${expiringResources.length} 个资源明天到期`,
            content: emailContent,
          });

          if (result.success) {
            console.log('Expiry reminder email sent successfully');
            localStorage.setItem(STORAGE_KEY_LAST_EMAIL_CHECK, today);
          } else {
            console.error('Failed to send expiry reminder:', result.error);
          }
        } catch (error) {
          console.error('Failed to send expiry reminder:', error);
        }
      }
    };

    checkAndSendExpiryReminder();
  }, [isResourceDataLoaded, resourceData]);

  // Note: Following individual loads are kept but will be skipped if batch load succeeded
  useEffect(() => {
    if (dataCache.has(STORAGE_KEY_CATEGORIES)) {
      // 批量加载已完成，只加载插件并标记应用就绪
      if (window.electronAPI) {
        window.electronAPI.getPlugins().then(loadedPlugins => {
          setPlugins(loadedPlugins);

          setModuleConfig(prevConfig => {
            const pluginModules: ModuleConfig[] = loadedPlugins.map(p => ({
              id: p.id,
              name: p.name,
              icon: 'Package',
              enabled: true,
              priority: 50,
              isPlugin: true,
              pluginPath: p.entryPath
            }));

            const newConfig = [...prevConfig];
            pluginModules.forEach(pm => {
              const existingIndex = newConfig.findIndex(m => m.id === pm.id);
              if (existingIndex === -1) {
                newConfig.push(pm);
              } else {
                newConfig[existingIndex] = { ...newConfig[existingIndex], pluginPath: pm.pluginPath, isPlugin: true };
              }
            });
            return newConfig;
          });

          setIsAppReady(true);
        });
      } else {
        setIsAppReady(true);
      }
      return;
    }

    // Load Categories
    const savedCategories = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (savedCategories) {
      try {
        const parsed = JSON.parse(savedCategories);
        // Merge with defaults to ensure all keys exist
        setCategoriesMap(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.error("Failed to parse categories", e);
      }
    }

    // Load Notes
    const savedNotes = localStorage.getItem(STORAGE_KEY_NOTES);
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch (e) {}
    } else {
      setNotes([{
        id: '1', content: '欢迎使用 NoteMaster！\n在这里记录你的灵感。', color: 'bg-yellow-100', createdAt: Date.now()
      }]);
    }

    // Load SSH Records
    const savedSSH = localStorage.getItem(STORAGE_KEY_SSH);
    if (savedSSH) {
      try {
        setSSHRecords(JSON.parse(savedSSH));
      } catch (e) {}
    }

    // Load API Records
    const savedAPI = localStorage.getItem(STORAGE_KEY_API);
    if (savedAPI) {
      try {
        setApiRecords(JSON.parse(savedAPI));
      } catch (e) {}
    }

    // Load Todos
    const savedTodos = localStorage.getItem(STORAGE_KEY_TODOS);
    if (savedTodos) {
      try {
        setTodos(JSON.parse(savedTodos));
      } catch (e) {}
    }

    // Load Files
    const savedFiles = localStorage.getItem(STORAGE_KEY_FILES);
    if (savedFiles) {
      try {
        setFileRecords(JSON.parse(savedFiles));
      } catch (e) {}
    }

    // Load Prompts
    const savedPrompts = localStorage.getItem(STORAGE_KEY_PROMPTS);
    if (savedPrompts) {
      try {
        setPrompts(JSON.parse(savedPrompts));
      } catch (e) {
        console.error("Failed to parse prompts", e);
      }
    }

    // Load Markdown Notes
    const savedMarkdown = localStorage.getItem(STORAGE_KEY_MARKDOWN);
    if (savedMarkdown) {
      try {
        setMarkdownNotes(JSON.parse(savedMarkdown));
      } catch (e) {
        console.error("Failed to parse markdown notes", e);
      }
    }

    // Load Plugins
    if (window.electronAPI) {
      window.electronAPI.getPlugins().then(loadedPlugins => {
        setPlugins(loadedPlugins);

        setModuleConfig(prevConfig => {
          const pluginModules: ModuleConfig[] = loadedPlugins.map(p => ({
            id: p.id,
            name: p.name,
            icon: 'Package',
            enabled: true,
            priority: 50,
            isPlugin: true,
            pluginPath: p.entryPath
          }));

          const newConfig = [...prevConfig];
          pluginModules.forEach(pm => {
            const existingIndex = newConfig.findIndex(m => m.id === pm.id);
            if (existingIndex === -1) {
              newConfig.push(pm);
            } else {
               // Update path if needed, keep user settings
               newConfig[existingIndex] = { ...newConfig[existingIndex], pluginPath: pm.pluginPath, isPlugin: true };
            }
          });
          return newConfig;
        });

        // All data loaded, mark app as ready
        setIsAppReady(true);
      });
    } else {
      // No electron API, mark as ready immediately
      setIsAppReady(true);
    }
  }, []);

  // Save/restore per-mode UI state when switching modes
  const prevAppModeRef = useRef<AppMode>(appMode);
  useEffect(() => {
    const prevMode = prevAppModeRef.current;
    prevAppModeRef.current = appMode;

    // Save previous mode's category
    if (prevMode !== appMode) {
      modeSnapshotsRef.current = { ...modeSnapshotsRef.current, [prevMode]: selectedCategoryRef.current };
      try { localStorage.setItem(STORAGE_KEY_MODE_SNAPSHOTS, JSON.stringify(modeSnapshotsRef.current)); } catch {}
    }

    // Restore target mode's category (or default '全部')
    setSelectedCategory(modeSnapshotsRef.current[appMode] || '全部');
    setSearchQuery('');
    setIsEditingFile(false);
    if (appMode !== 'terminal') {
      setInitialTerminalCommand(undefined);
      setInitialTerminalTitle(undefined);
    }
  }, [appMode]);

  // Performance Optimization 3: Debounced save to reduce write operations
  const saveToStorage = useMemo(() => {
    const timeouts = new Map<string, NodeJS.Timeout>();
    
    return (key: string, data: any, delay: number = 300) => {
      // Clear existing timeout
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key)!);
      }
      
      // Set new timeout
      const timeout = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify(data));
          dataCache.set(key, data);
          timeouts.delete(key);
        } catch (e) {
          console.error(`Failed to save ${key}:`, e);
        }
      }, delay);
      
      timeouts.set(key, timeout);
    };
  }, [dataCache]);

  // Save on change - with debounce
  useEffect(() => {
    if (Object.keys(categoriesMap).length > 0) {
      saveToStorage(STORAGE_KEY_CATEGORIES, categoriesMap);
    }
  }, [categoriesMap, saveToStorage]);

  useEffect(() => {
    if (notes.length > 0) {
      saveToStorage(STORAGE_KEY_NOTES, notes);
    }
  }, [notes, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_SSH, sshRecords);
  }, [sshRecords, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_API, apiRecords);
  }, [apiRecords, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_TODOS, todos);
  }, [todos, saveToStorage]);

  useEffect(() => {
    // 直接保存字符串，不需要JSON序列化
    if (todoPlanContent) {
      localStorage.setItem(STORAGE_KEY_TODO_PLAN, todoPlanContent);
    }
  }, [todoPlanContent]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HEATMAP, JSON.stringify(heatmapData));
  }, [heatmapData]);

  useEffect(() => {
    // 只在数据加载完成后才保存，避免覆盖已有数据
    if (!isOJDataLoaded) return;

    // 保存到文件存储
    if (window.electronAPI) {
      window.electronAPI.saveAppData('oj-heatmap', ojHeatmapData);
    }
    // 同时保存到 localStorage 作为备份
    localStorage.setItem(STORAGE_KEY_OJ_HEATMAP, JSON.stringify(ojHeatmapData));
  }, [ojHeatmapData, isOJDataLoaded]);

  useEffect(() => {
    // 只在数据加载完成后才保存
    if (!isResourceDataLoaded) return;

    if (window.electronAPI) {
      window.electronAPI.saveAppData('resource-center', resourceData);
    }
    localStorage.setItem(STORAGE_KEY_RESOURCE, JSON.stringify(resourceData));
  }, [resourceData, isResourceDataLoaded]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_FILES, fileRecords);
  }, [fileRecords, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_PROMPTS, prompts);
  }, [prompts, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_MARKDOWN, markdownNotes);
  }, [markdownNotes, saveToStorage]);

  useEffect(() => {
    // 只在初始加载完成后才保存，避免空数组覆盖已有数据
    if (!imageDataLoadedRef.current) return;
    saveToStorage(STORAGE_KEY_IMAGE_RECORDS, imageRecords);
    // 同步写入备份（非 debounced，保证一致性）
    try {
      localStorage.setItem(STORAGE_KEY_IMAGE_RECORDS + '_backup', JSON.stringify(imageRecords));
    } catch {}
    // 持久化到文件存储
    if (window.electronAPI) {
      window.electronAPI.saveAppData('image-records', imageRecords);
    }
  }, [imageRecords, saveToStorage]);

  // 监听 Excalidraw 等外部组件添加图床记录（通过事件传递数据，不再从 localStorage 读取）
  useEffect(() => {
    const handleImageRecordAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.id) return;
      setImageRecords(prev => {
        // 去重：避免同一条记录被添加多次
        if (prev.some(r => r.id === detail.id)) return prev;
        return [detail, ...prev];
      });
    };
    window.addEventListener('guyue:image-record-added', handleImageRecordAdded);
    return () => window.removeEventListener('guyue:image-record-added', handleImageRecordAdded);
  }, []);

  useEffect(() => {
    // 只在初始加载完成后才保存配置
    if (!imageDataLoadedRef.current) return;
    saveToStorage(STORAGE_KEY_IMAGE_CONFIG, imageHostingConfig);
    try {
      localStorage.setItem(STORAGE_KEY_IMAGE_CONFIG + '_backup', JSON.stringify(imageHostingConfig));
    } catch {}
    if (window.electronAPI) {
      window.electronAPI.saveAppData('image-config', imageHostingConfig);
    }
  }, [imageHostingConfig, saveToStorage]);

  useEffect(() => {
    if (moduleConfig.length > 0) {
      saveToStorage(STORAGE_KEY_MODULES, moduleConfig);
    }
  }, [moduleConfig, saveToStorage]);

  // --- Dynamic Categories for Notes (By Month) ---
  const noteCategories: Category[] = useMemo(() => {
    const months = new Set<string>();
    notes.forEach(note => {
      const date = new Date(note.createdAt);
      const monthStr = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      months.add(monthStr);
    });

    const sortedMonths = Array.from(months).sort((a, b) => {
      const [yearA, monthA] = a.replace('月', '').split('年').map(Number);
      const [yearB, monthB] = b.replace('月', '').split('年').map(Number);
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });

    return [
      ...sortedMonths.map(m => ({ id: m, name: m, icon: 'Calendar' })),
      { id: 'all', name: '全部', icon: 'LayoutGrid', isSystem: true }
    ];
  }, [notes]);

  // Determine which categories to pass to sidebar
  const activeCategories = useMemo(() => {
    if (appMode === 'notes') return noteCategories;
    if (appMode === 'files') return categoriesMap['files'] || DEFAULT_CATEGORIES;
    if (appMode === 'prompts') {
      const base = categoriesMap['prompts'] || DEFAULT_CATEGORIES;
      const baseNames = new Set(base.map(c => c.name));
      // Always keep 导入 as a permanent category
      const importCat = !baseNames.has('导入')
        ? [{ id: 'import', name: '导入', icon: 'Download' }]
        : [];
      const dataCategories = Array.from(new Set(prompts.map(p => p.category).filter(Boolean))) as string[];
      const extra = dataCategories
        .filter(name => !baseNames.has(name) && name !== '导入')
        .map(name => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, icon: 'Tag' }));
      return [...base, ...importCat, ...extra];
    }
    return categoriesMap[appMode] || DEFAULT_CATEGORIES;
  }, [appMode, noteCategories, categoriesMap, prompts]);

  // Derived State: Filtered Items
  const filteredNotes = useMemo(() => {
    if (appMode !== 'notes') return [];
    return notes
      .filter(n => {
         if (selectedCategory === '全部') return true;
         const date = new Date(n.createdAt);
         const monthStr = `${date.getFullYear()}年${date.getMonth() + 1}月`;
         return monthStr === selectedCategory;
      })
      .filter(n => n.content.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [notes, searchQuery, appMode, selectedCategory]);

  const filteredTodos = useMemo(() => {
    if (appMode !== 'todo') return [];
    return todos
      .filter(t => selectedCategory === '全部' || t.category === selectedCategory)
      .filter(t => t.content.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => {
        // Sort by completion status (pending first), then priority (high>med>low), then due date
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
           return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        
        const dateA = a.dueDate || 9999999999999;
        const dateB = b.dueDate || 9999999999999;
        return dateA - dateB;
      });
  }, [todos, selectedCategory, searchQuery, appMode]);

  const filteredFileRecords = useMemo(() => {
    if (appMode !== 'files') return [];
    return fileRecords
      .filter(f => selectedCategory === '全部' || f.category === selectedCategory)
      .filter(f => 
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
         // Sort by importance desc
         if (a.importance !== b.importance) return b.importance - a.importance;
         return a.createdAt - b.createdAt;
      });
  }, [fileRecords, selectedCategory, searchQuery, appMode]);

  const filteredPrompts = useMemo(() => {
    if (appMode !== 'prompts') return [];
    return prompts
      .filter(p => selectedCategory === '全部' || p.category === selectedCategory)
      .filter(p => {
        const q = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [prompts, selectedCategory, searchQuery, appMode]);

  const filteredMarkdownNotes = useMemo(() => {
    if (appMode !== 'markdown') return [];
    return markdownNotes
      .filter(n => {
        const q = searchQuery.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [markdownNotes, searchQuery, appMode]);

  const filteredImageRecords = useMemo(() => {
    if (appMode !== 'image-hosting') return [];
    return imageRecords
      .filter(r => selectedCategory === '全部' || r.category === selectedCategory || (!r.category && selectedCategory === '未分类'))
      .filter(r => {
        const q = searchQuery.toLowerCase();
        return r.filename.toLowerCase().includes(q);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [imageRecords, searchQuery, appMode, selectedCategory]);

  const getCurrentCount = () => {
    if (appMode === 'notes') return filteredNotes.length;
    if (appMode === 'todo') return filteredTodos.length;
    if (appMode === 'files') return filteredFileRecords.length;
    if (appMode === 'prompts') return filteredPrompts.length;
    if (appMode === 'markdown') return filteredMarkdownNotes.length;
    if (appMode === 'image-hosting') return filteredImageRecords.length;
    return 0;
  };

  const getCountLabel = () => {
    if (appMode === 'notes') return '条';
    if (appMode === 'todo') return '项';
    if (appMode === 'files') return '个';
    if (appMode === 'prompts') return '条';
    if (appMode === 'markdown') return '篇';
    if (appMode === 'image-hosting') return '张';
    return '项';
  };

  const getTitle = () => {
    const config = moduleConfig.find(m => m.id === appMode);
    return config ? config.name : 'Guyue Master';
  };

  const getAddButtonLabel = () => {
    switch (appMode) {
      case 'notes': return '新建笔记';
      case 'api': return '添加API';
      case 'todo': return '添加待办';
      case 'files': return '添加文件';
      case 'prompts': return '新建 Skill';
      case 'markdown': return '添加Markdown笔记';
      case 'image-hosting': return '上传图片';
      default: return '添加';
    }
  };

  const getSearchPlaceholder = () => {
    if (appMode === 'todo') return '搜索任务...';
    if (appMode === 'files') return '搜索文件...';
    if (appMode === 'prompts') return '搜索 Skills...';
    if (appMode === 'files') return '搜索文件...';
    if (appMode === 'markdown') return '搜索笔记...';
    if (appMode === 'browser') return '搜索网页...';
    if (appMode === 'leetcode') return '搜索题目...';
    if (appMode === 'image-hosting') return '搜索图片...';
    
    const currentModule = moduleConfig.find(m => m.id === appMode);
    if (currentModule?.isPlugin) return `在 ${currentModule.name} 中搜索...`;

    return '搜索...';
  };

  const ensureCategoryExists = (categoryName: string) => {
    if (categoryName === '全部' || categoryName === '未分类') return;
    
    setCategoriesMap(prev => {
      const currentCategories = prev[appMode] || DEFAULT_CATEGORIES;
      if (currentCategories.some(c => c.name === categoryName)) {
        return prev;
      }
      
      const newCategory: Category = {
        id: crypto.randomUUID(),
        name: categoryName,
        icon: 'Folder',
        isSystem: false
      };
      
      return {
        ...prev,
        [appMode]: [...currentCategories, newCategory]
      };
    });
  };

  // --- Handlers: Notes ---

  const handleSaveNote = (noteData: Partial<Note>) => {
    if (noteData.id) {
      setNotes(prev => prev.map(n => n.id === noteData.id ? { ...n, ...noteData } as Note : n));
    } else {
      const newNote: Note = {
        id: crypto.randomUUID(),
        content: noteData.content!,
        color: noteData.color || 'bg-yellow-100',
        createdAt: Date.now(),
      };
      setNotes(prev => [newNote, ...prev]);
    }
    setEditingNote(null);
  };

  const handleDeleteNote = (id: string) => {
    if (confirm('确定要删除这个便签吗?')) {
      setNotes(prev => prev.filter(n => n.id !== id));
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setIsNoteModalOpen(true);
  };

  // --- Handlers: SSH ---

  const handleSaveSSH = (record: Partial<SSHRecord>) => {
    const catName = record.category || '未分类';
    if (catName !== '全部' && catName !== '未分类') {
      setCategoriesMap(prev => {
        const currentCategories = prev['ssh'] || DEFAULT_CATEGORIES;
        if (currentCategories.some(c => c.name === catName)) return prev;
        const newCategory: Category = {
          id: crypto.randomUUID(),
          name: catName,
          icon: 'Server',
          isSystem: false,
        };
        return { ...prev, ssh: [...currentCategories, newCategory] };
      });
    }

    if (record.id) {
      setSSHRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...record } as SSHRecord : r));
    } else {
      const currentMaxPriority = sshRecords.length > 0 
        ? Math.max(...sshRecords.map(r => r.priority || 0)) 
        : 0;

      const newRecord: SSHRecord = {
        id: crypto.randomUUID(),
        title: record.title!,
        host: record.host!,
        username: record.username || 'root',
        port: record.port || '22',
        command: record.command!,
        category: catName,
        note: record.note || '',
        priority: record.priority ?? (currentMaxPriority + 1),
        networkType: record.networkType || '局域网',
        createdAt: Date.now(),
      };
      setSSHRecords(prev => [newRecord, ...prev]);
    }
    setEditingSSH(null);
  };

  const handleDeleteSSH = (id: string) => {
    if (confirm('确定要删除这个连接记录吗?')) {
      setSSHRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleEditSSH = (record: SSHRecord) => {
    setEditingSSH(record);
    setIsSSHModalOpen(true);
  };

  const handleUpdateSSHCategories = (newCategories: Category[]) => {
    const oldCategories = categoriesMap['ssh'] || DEFAULT_CATEGORIES;
    const oldNameMap = new Map(oldCategories.map(category => [category.id, category.name]));
    const renamedPairs = new Map<string, string>();

    newCategories.forEach(category => {
      const oldName = oldNameMap.get(category.id);
      if (oldName && oldName !== category.name) {
        renamedPairs.set(oldName, category.name);
      }
    });

    if (renamedPairs.size > 0) {
      setSSHRecords(prev => prev.map(record => {
        const nextCategory = renamedPairs.get(record.category);
        return nextCategory ? { ...record, category: nextCategory } : record;
      }));
    }

    setCategoriesMap(prev => ({
      ...prev,
      ssh: newCategories,
    }));
  };

  const handleDeleteSSHCategory = (id: string) => {
    const currentCategories = categoriesMap['ssh'] || DEFAULT_CATEGORIES;
    const category = currentCategories.find(item => item.id === id);
    if (!category) return;
    if (!window.confirm(`确定要删除分类“${category.name}”吗？该分类下的 SSH 记录会移动到“未分类”。`)) {
      return;
    }

    setSSHRecords(prev => prev.map(record =>
      record.category === category.name ? { ...record, category: '未分类' } : record
    ));
    setCategoriesMap(prev => ({
      ...prev,
      ssh: (prev['ssh'] || DEFAULT_CATEGORIES).filter(item => item.id !== id),
    }));
  };

  // --- Handlers: API ---

  const handleSaveAPI = (record: Partial<APIRecord>) => {
    const catName = record.category || '未分类';
    // 直接更新 api 分类（不依赖 appMode）
    if (catName !== '全部' && catName !== '未分类') {
      setCategoriesMap(prev => {
        const currentCategories = prev['api'] || DEFAULT_CATEGORIES;
        if (currentCategories.some(c => c.name === catName)) return prev;
        const newCategory: Category = {
          id: crypto.randomUUID(),
          name: catName,
          icon: 'Folder',
          isSystem: false
        };
        return { ...prev, api: [...currentCategories, newCategory] };
      });
    }

    if (record.id) {
      setApiRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...record } as APIRecord : r));
    } else {
      const currentMaxPriority = apiRecords.length > 0 
        ? Math.max(...apiRecords.map(r => r.priority || 0)) 
        : 0;

      const newRecord: APIRecord = {
        id: crypto.randomUUID(),
        title: record.title!,
        baseUrl: record.baseUrl || '',
        endpoint: record.endpoint!,
        method: record.method || 'GET',
        apiKey: record.apiKey || '',
        usage: record.usage || '',
        category: catName,
        note: record.note || '',
        priority: record.priority ?? (currentMaxPriority + 1),
        createdAt: Date.now(),
      };
      setApiRecords(prev => [newRecord, ...prev]);
    }
  };

  const handleUpdateAPICategories = (newCategories: Category[]) => {
    const oldCategories = categoriesMap['api'] || DEFAULT_CATEGORIES;
    const oldNameMap = new Map(oldCategories.map(category => [category.id, category.name]));
    const renamedPairs = new Map<string, string>();

    newCategories.forEach(category => {
      const oldName = oldNameMap.get(category.id);
      if (oldName && oldName !== category.name) {
        renamedPairs.set(oldName, category.name);
      }
    });

    if (renamedPairs.size > 0) {
      setApiRecords(prev => prev.map(record => {
        const nextCategory = renamedPairs.get(record.category);
        return nextCategory ? { ...record, category: nextCategory } : record;
      }));
    }

    setCategoriesMap(prev => ({
      ...prev,
      api: newCategories,
    }));
  };

  const handleDeleteAPICategory = (id: string) => {
    const currentCategories = categoriesMap['api'] || DEFAULT_CATEGORIES;
    const category = currentCategories.find(item => item.id === id);
    if (!category) return;
    if (!window.confirm(`确定要删除分类“${category.name}”吗？该分类下的 API 会移动到“未分类”。`)) {
      return;
    }

    setApiRecords(prev => prev.map(record =>
      record.category === category.name ? { ...record, category: '未分类' } : record
    ));
    setCategoriesMap(prev => ({
      ...prev,
      api: (prev['api'] || DEFAULT_CATEGORIES).filter(item => item.id !== id),
    }));
  };

  const handleDeleteAPI = (id: string) => {
    if (confirm('确定要删除这个 API 记录吗?')) {
      setApiRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  // --- Handlers: Todo ---

  const handleSaveTodo = (todoData: Partial<TodoItem>) => {
    const catName = todoData.category || '未分类';
    ensureCategoryExists(catName);

    if (todoData.id) {
      setTodos(prev => prev.map(t => t.id === todoData.id ? { ...t, ...todoData } as TodoItem : t));
    } else {
      const newTodo: TodoItem = {
        id: crypto.randomUUID(),
        content: todoData.content!,
        description: todoData.description,
        isCompleted: false,
        priority: todoData.priority || 'medium',
        category: catName,
        dueDate: todoData.dueDate,
        timeType: todoData.timeType,
        timeStart: todoData.timeStart,
        timeEnd: todoData.timeEnd,
        color: todoData.color,
        subtasks: todoData.subtasks,
        createdAt: Date.now(),
      };
      setTodos(prev => [newTodo, ...prev]);
    }
    setEditingTodo(null);
  };

  const handleDeleteTodo = (id: string) => {
    if (confirm('确定要删除这个待办事项吗?')) {
      setTodos(prev => prev.filter(t => t.id !== id));
    }
  };

  // ─── Recurring Event handlers ───
  const handleCreateRecurring = useCallback((data: Partial<RecurringEvent>) => {
    const newEvent: RecurringEvent = {
      id: crypto.randomUUID(),
      title: data.title || '新重复事件',
      description: data.description,
      category: data.category || '未分类',
      color: data.color,
      allDay: data.allDay ?? false,
      startDate: data.startDate ?? Date.now(),
      endDate: data.endDate,
      startTime: data.startTime,
      duration: data.duration,
      recurrence: data.recurrence ?? 'weekly',
      interval: data.interval ?? 1,
      weekDays: data.weekDays,
      isActive: true,
      createdAt: Date.now(),
    };
    setRecurringEvents(prev => {
      const next = [newEvent, ...prev];
      try { localStorage.setItem(STORAGE_KEY_RECURRING, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleUpdateRecurring = useCallback((id: string, data: Partial<RecurringEvent>) => {
    setRecurringEvents(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...data } : e);
      try { localStorage.setItem(STORAGE_KEY_RECURRING, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleDeleteRecurring = useCallback((id: string) => {
    setRecurringEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      try { localStorage.setItem(STORAGE_KEY_RECURRING, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleToggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted, completedAt: !t.isCompleted ? Date.now() : undefined } : t));
  };

  const handleToggleSubtask = (todoId: string, subtaskId: string) => {
    setTodos(prev => prev.map(t => {
      if (t.id !== todoId || !t.subtasks) return t;
      return { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, isCompleted: !s.isCompleted } : s) };
    }));
  };

  const handleAutoSaveTodoSubtasks = (todoId: string, subtasks: import('./types').SubTask[]) => {
    setTodos(prev => prev.map(t => t.id === todoId
      ? { ...t, subtasks: subtasks.length > 0 ? subtasks : undefined }
      : t
    ));
  };

  const handleEditTodo = (todo: TodoItem) => {
    setEditingTodo(todo);
    setIsTodoModalOpen(true);
  };

  // --- Handlers: Files ---

  const handleSaveFile = async (fileData: Partial<FileRecord>) => {
     const catName = fileData.category || '未分类';
     ensureCategoryExists(catName);

     if (fileData.id) {
       // 检查是否需要重命名文件
       const existingFile = fileRecords.find(f => f.id === fileData.id);
       if (existingFile && fileData.name && existingFile.name !== fileData.name && window.electronAPI) {
         // 获取文件所在目录
         const dirPath = existingFile.path.substring(0, existingFile.path.lastIndexOf('/'));
         const newPath = dirPath ? `${dirPath}/${fileData.name}` : fileData.name;
         
         // 尝试重命名实际文件
         const success = await window.electronAPI.renameFile(existingFile.path, newPath);
         if (success) {
           // 更新文件路径
           fileData.path = newPath;
         } else {
           console.error('Failed to rename file on disk');
           // 即使重命名失败，也继续更新记录（可能是记录与实际文件不同步的情况）
         }
       }
       setFileRecords(prev => prev.map(f => f.id === fileData.id ? { ...f, ...fileData } as FileRecord : f));
     } else {
       const newFile: FileRecord = {
         id: crypto.randomUUID(),
         name: fileData.name!,
         path: fileData.path || fileData.name!,
         size: fileData.size || 0,
         type: fileData.type || 'FILE',
         importance: fileData.importance || 50,
         category: catName,
         note: fileData.note || '',
         createdAt: Date.now(),
       };
       setFileRecords(prev => [newFile, ...prev]);
     }
     setEditingFile(null);
  };

  const handleDeleteFile = async (id: string) => {
    const file = fileRecords.find(f => f.id === id);
    if (!file) return;
    
    // 检查文件是否在归档目录内（自建或上传的文件需要实际删除）
    const archiveRoot = localStorage.getItem('linkmaster_archive_path');
    const isInArchive = archiveRoot && file.path.startsWith(archiveRoot);
    
    const message = isInArchive 
      ? '确定要删除这个文件吗？文件将从磁盘上永久删除！'
      : '确定要删除这个文件引用吗？（原文件不会被删除）';
    
    if (confirm(message)) {
      // 如果是归档目录内的文件，实际删除
      if (isInArchive && window.electronAPI) {
        const success = await window.electronAPI.deleteFile(file.path);
        if (!success) {
          console.error('Failed to delete file from disk');
          // 即使删除失败也继续移除记录（可能文件已不存在）
        }
      }
      setFileRecords(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleEditFile = (file: FileRecord) => {
    setEditingFile(file);
    setFileModalMode('file');
    setIsFileModalOpen(true);
  };

  const handleRelocateFile = async (file: FileRecord) => {
    if (!window.electronAPI?.selectFile) return;
    const fileInfo = await window.electronAPI.selectFile();
    if (fileInfo) {
      setFileRecords(prev => prev.map(f => 
        f.id === file.id 
          ? { ...f, path: fileInfo.path, name: fileInfo.name, size: fileInfo.size, type: fileInfo.type }
          : f
      ));
    }
  };

  const handleImportFromVault = async () => {
    const vaultPath = localStorage.getItem('linkmaster_vault_path');
    if (!vaultPath) {
      alert('请先在设置中配置 Obsidian Vault 路径');
      return;
    }
    if (!window.electronAPI?.listDir) return;

    try {
      // Supported file extensions and their types
      const SUPPORTED_EXTENSIONS: Record<string, string> = {
        '.md': 'MARKDOWN', '.markdown': 'MARKDOWN',
        '.txt': 'TEXT', '.text': 'TEXT',
        '.pdf': 'PDF',
        '.doc': 'WORD', '.docx': 'WORD',
        '.xls': 'EXCEL', '.xlsx': 'EXCEL',
        '.ppt': 'PPT', '.pptx': 'PPT',
        '.png': 'IMAGE', '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.gif': 'IMAGE', '.webp': 'IMAGE', '.svg': 'IMAGE',
        '.mp4': 'VIDEO', '.mov': 'VIDEO', '.avi': 'VIDEO', '.mkv': 'VIDEO',
        '.mp3': 'AUDIO', '.wav': 'AUDIO', '.flac': 'AUDIO', '.m4a': 'AUDIO',
        '.zip': 'ARCHIVE', '.rar': 'ARCHIVE', '.7z': 'ARCHIVE', '.tar': 'ARCHIVE', '.gz': 'ARCHIVE',
        '.json': 'CODE', '.ts': 'CODE', '.tsx': 'CODE', '.js': 'CODE', '.jsx': 'CODE',
        '.py': 'CODE', '.java': 'CODE', '.cpp': 'CODE', '.c': 'CODE', '.go': 'CODE', '.rs': 'CODE',
        '.html': 'CODE', '.css': 'CODE', '.sh': 'CODE', '.yaml': 'CODE', '.yml': 'CODE',
        '.csv': 'SPREADSHEET',
      };

      const getExtension = (name: string) => {
        const idx = name.lastIndexOf('.');
        return idx >= 0 ? name.slice(idx).toLowerCase() : '';
      };

      // Recursively scan vault for supported files (max 5 levels deep)
      const scanDir = async (dir: string, depth: number = 0): Promise<{name: string; path: string; fileType: string}[]> => {
        if (depth > 5) return [];
        const entries = await window.electronAPI!.listDir(dir);
        let results: {name: string; path: string; fileType: string}[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue; // Skip hidden files/folders
          if (entry.isDirectory) {
            const sub = await scanDir(entry.path, depth + 1);
            results = results.concat(sub);
          } else {
            const ext = getExtension(entry.name);
            const fileType = SUPPORTED_EXTENSIONS[ext];
            if (fileType) {
              results.push({ name: entry.name, path: entry.path, fileType });
            }
          }
        }
        return results;
      };

      const mdFiles = await scanDir(vaultPath);
      if (mdFiles.length === 0) {
        alert('Vault 中未找到支持的文件（支持：Markdown、文本、PDF、Office、代码、图片等）');
        return;
      }

      // Filter out already-imported files
      const existingPaths = new Set(fileRecords.map(f => f.path));
      const newFiles = mdFiles.filter(f => !existingPaths.has(f.path));

      if (newFiles.length === 0) {
        alert('Vault 中的所有文件已导入');
        return;
      }

      // Build entries with relative path and folder info for the selection modal
      // Use the immediate parent directory as the folder name
      const vaultEntries: VaultFileEntry[] = newFiles.map(f => {
        const relativePath = f.path.replace(vaultPath + '/', '');
        const parts = relativePath.split('/');
        const folder = parts.length > 1 ? parts[parts.length - 2] : 'Vault';
        return { name: f.name, path: f.path, relativePath, folder, fileType: f.fileType };
      });

      setVaultImportFiles(vaultEntries);
    } catch (e) {
      console.error('Failed to scan vault:', e);
      alert('扫描 Vault 失败');
    }
  };

  const handleVaultImportConfirm = (selected: VaultFileEntry[]) => {
    if (selected.length === 0) return;

    const importedRecords: FileRecord[] = selected.map(f => ({
      id: crypto.randomUUID(),
      name: f.name,
      path: f.path,
      size: 0,
      type: (f.fileType || 'MARKDOWN') as FileRecord['type'],
      importance: 50,
      category: f.folder,
      note: '',
      createdAt: Date.now(),
    }));

    // Ensure categories exist
    const newCategories = new Set(importedRecords.map(r => r.category));
    newCategories.forEach(cat => ensureCategoryExists(cat));

    setFileRecords(prev => [...importedRecords, ...prev]);
    setVaultImportFiles(null);
    alert(`成功导入 ${importedRecords.length} 篇笔记`);
  };

  // --- Handlers: Prompts ---

  const handleSavePrompt = (promptData: Partial<PromptRecord>) => {
    const catName = promptData.category || '未分类';
    ensureCategoryExists(catName);

    if (promptData.id) {
      setPrompts(prev => prev.map(p => p.id === promptData.id ? {
        ...p,
        ...promptData,
        category: catName,
        updatedAt: Date.now()
      } as PromptRecord : p));
    } else {
      const newPrompt: PromptRecord = {
        id: crypto.randomUUID(),
        title: promptData.title || '未命名提示',
        content: promptData.content || '',
        tags: [],
        note: '',
        category: catName,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      setPrompts(prev => [newPrompt, ...prev]);
    }
    setEditingPrompt(null);
  };

  const handleDeletePrompt = (id: string) => {
    setPrompts(prompts.filter(p => p.id !== id));
  };

  const handleDeleteManyPrompts = (ids: string[]) => {
    const idSet = new Set(ids);
    setPrompts(prev => prev.filter(p => !idSet.has(p.id)));
  };

  const handleImportSkills = (newSkills: PromptRecord[]) => {
    setPrompts(prev => [...newSkills, ...prev]);
  };

  const handleEditPrompt = (prompt: PromptRecord) => {
    setEditingPrompt(prompt);
    setIsPromptModalOpen(true);
  };

  const handleOpenSSHInTerminal = (command: string, title: string) => {
    setInitialTerminalCommand(command);
    setInitialTerminalTitle(title);
    setAppMode('terminal');
  };

  const handleOpenInBrowser = (url: string) => {
    setBrowserUrl(url);
    setAppMode('browser');
  };

  // Markdown Handlers
  const handleAddMarkdownNote = () => {
    const newNote: MarkdownNote = {
      id: Date.now().toString(),
      title: '新笔记',
      category: '',
      content: '# 新笔记\n\n开始编写...',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setMarkdownNotes([...markdownNotes, newNote]);
    setActiveTipId(newNote.id);
  };

  const handleUpdateMarkdownNote = (id: string, updates: Partial<MarkdownNote>) => {
    setMarkdownNotes(markdownNotes.map(note => 
      note.id === id ? { ...note, ...updates } : note
    ));
  };

  const handleDeleteMarkdownNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个笔记吗？')) {
      setMarkdownNotes(markdownNotes.filter(n => n.id !== id));
      if (activeTipId === id) {
        setActiveTipId(null);
      }
    }
  };

  const handleCreateNoteInFolder = async (categoryName: string) => {
    if (!window.electronAPI) return;
    const archiveRoot = localStorage.getItem('linkmaster_archive_path');
    if (!archiveRoot) {
        alert('请先在设置中配置本地归档根目录');
        return;
    }
    
    // 弹窗让用户输入文件名
    const userInput = prompt('请输入笔记文件名（不需要输入 .md 后缀）:', '');
    if (userInput === null) return; // 用户取消
    const trimmed = userInput.trim();
    if (!trimmed) {
      alert('文件名不能为空');
      return;
    }
    const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
    
    try {
      // Construct path
      const safeCategory = categoryName.replace(/[\\/:*?"<>|]/g, '_');
      const targetDir = await window.electronAPI.pathJoin(archiveRoot, safeCategory, 'MARKDOWN');
      await window.electronAPI.ensureDir(targetDir);
      const targetPath = await window.electronAPI.pathJoin(targetDir, fileName);
      
      // Create file
      await window.electronAPI.writeFile(targetPath, '');
      
      // Update state
      const newFile: FileRecord = {
         id: crypto.randomUUID(),
         name: fileName,
         path: targetPath,
         size: 0,
         type: 'MARKDOWN',
         importance: 50,
         category: categoryName,
         note: '',
         createdAt: Date.now(),
       };
       setFileRecords(prev => [newFile, ...prev]);
       setActiveRenderFileId(newFile.id);
    } catch (e) {
      console.error('Failed to create note:', e);
      alert('创建笔记失败');
    }
  };

  const handleEditCategory = (category: Category) => {
    setInitialCategoryEditId(category.id);
    setIsCategoryManagerOpen(true);
  };

  const handleDeleteCategory = async (id: string) => {
    // 获取分类名称
    const category = (categoriesMap[appMode] || []).find(c => c.id === id);
    if (!category) return;
    
    // 对于文件管理模块，检查是否要删除对应的文件夹
    if (appMode === 'files') {
      const archiveRoot = localStorage.getItem('linkmaster_archive_path');
      if (archiveRoot && window.electronAPI) {
        const confirmDelete = window.confirm(
          `确定要删除分类"${category.name}"吗？\n\n⚠️ 警告：这将同时删除该分类下的文件夹及所有文件！`
        );
        
        if (confirmDelete) {
          // 删除该分类下所有文件类型的文件夹
          const filesInCategory = fileRecords.filter(f => f.category === category.name);
          const fileTypes = [...new Set(filesInCategory.map(f => f.type))];
          
          // 删除分类文件夹（包含所有子文件夹）
          const safeCategoryName = category.name.replace(/[\\/:*?"<>|]/g, '_');
          const categoryDir = await window.electronAPI.pathJoin(archiveRoot, safeCategoryName);
          
          console.log('Deleting category directory:', categoryDir);
          
          const deleteSuccess = await window.electronAPI.deleteDir(categoryDir);
          console.log('Delete result:', deleteSuccess);
          
          if (!deleteSuccess) {
            console.error('Failed to delete category directory:', categoryDir);
          }
          
          // 删除该分类下的文件记录
          setFileRecords(prev => prev.filter(f => f.category !== category.name));
          
          // 删除分类
          setCategoriesMap(prev => ({
            ...prev,
            [appMode]: prev[appMode].filter(c => c.id !== id)
          }));
        }
      } else {
        // 没有归档目录，只删除记录
        if (window.confirm('确定要删除这个分类吗？分类下的文件记录将被删除。')) {
          setFileRecords(prev => prev.filter(f => f.category !== category.name));
          setCategoriesMap(prev => ({
            ...prev,
            [appMode]: prev[appMode].filter(c => c.id !== id)
          }));
        }
      }
    } else {
      // 其他模块，只删除分类
      if (window.confirm('确定要删除这个分类吗？')) {
        setCategoriesMap(prev => ({
          ...prev,
          [appMode]: prev[appMode].filter(c => c.id !== id)
        }));
      }
    }
  };

  return (
    <>
      {showSplash ? (
        <SplashScreen
          customText={splashText}
          onComplete={() => setShowSplash(false)}
        />
      ) : (
        <div className="fixed inset-0 flex overflow-hidden bg-gray-50">
          {!(isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen || isLatexFullscreen) && isSidebarVisible && (
            <NavRail 
              currentMode={appMode} 
              onModeChange={setAppMode} 
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenAgent={() => setAppMode('agent')}
              isAgentOpen={appMode === 'agent'}
              moduleConfig={moduleConfig}
              onReorderModules={setModuleConfig}
            />
          )}

      {appMode === 'markdown' && !isMarkdownFullscreen ? (
        <Suspense fallback={<div className="w-64 bg-gray-50 border-r border-gray-200" />}>
          <MarkdownSidebar
            notes={filteredMarkdownNotes}
            categories={categoriesMap[appMode] || DEFAULT_CATEGORIES}
            selectedNoteId={activeTipId}
            onSelectNote={setActiveTipId}
            onAddNote={handleAddMarkdownNote}
            onDeleteNote={handleDeleteMarkdownNote}
          />
        </Suspense>
      ) : appMode === 'files' ? (
        !isRendererFullscreen && (
          <Suspense fallback={<div className="w-64 bg-gray-50 border-r border-gray-200" />}>
            <ArchiveSidebar
              archives={filteredFileRecords}
              categories={categoriesMap[appMode] || DEFAULT_CATEGORIES}
              activeFileId={activeRenderFileId}
              onOpen={(file) => {
              setActiveRenderFileId(file.id);
              setIsEditingFile(false);
            }}
              onCreateFolder={() => {
                setInitialCategoryEditId(null);
                setIsCategoryManagerOpen(true);
              }}
              onUploadFile={() => {
                setEditingFile(null);
                setFileModalMode('file');
                setIsFileModalOpen(true);
              }}
              onCreateNote={() => {
                setEditingFile(null);
                setFileModalMode('note');
                setIsFileModalOpen(true);
              }}
              onDelete={(id) => handleDeleteFile(id)}
              onEdit={(file) => {
                setEditingFile(file);
                setFileModalMode('file');
                setIsFileModalOpen(true);
              }}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
              onImportFromVault={handleImportFromVault}
              onHelp={() => setIsHelpOpen(true)}
            />
          </Suspense>
        )
      ) : appMode === 'todo' && !isRendererFullscreen && !isTerminalFullscreen && isSidebarVisible ? (
        <TodoSidebar
          subMode={todoSubMode}
          onSubModeChange={setTodoSubMode}
          recurringCount={recurringEvents.filter(e => e.isActive).length}
        />
      ) : appMode === 'latex' && !isRendererFullscreen && !isTerminalFullscreen && !isLatexFullscreen && isLatexSidebarVisible ? (
        <Suspense fallback={<div className="w-60 bg-[#F5F5F5] border-r border-gray-200 shrink-0" />}>
          <LatexSidebar
            currentContent={''}
            onEditTemplate={(template) => {
              if (latexEditTemplateRef.current) latexEditTemplateRef.current(template);
            }}
            onLoadTemplateAsFile={(tplContent) => {
              if (latexLoadTemplateAsFileRef.current) latexLoadTemplateAsFileRef.current(tplContent);
            }}
            onOpenManagedFile={(file) => {
              if (latexOpenFileRef.current) latexOpenFileRef.current(file);
            }}
            onCollapse={() => setIsLatexSidebarVisible(false)}
          />
        </Suspense>
      ) : appMode === 'music' && !isRendererFullscreen && !isTerminalFullscreen && isSidebarVisible ? (
        <Suspense fallback={<div className="w-60 bg-[#F5F5F5] border-r border-gray-200 shrink-0" />}>
          <MusicSidebar
            playlists={musicPlaylists}
            tracks={musicTracks}
            selectedPlaylist={selectedMusicPlaylist}
            onSelectPlaylist={setSelectedMusicPlaylist}
            onCreatePlaylist={handleMusicCreatePlaylist}
            onRenamePlaylist={handleMusicRenamePlaylist}
            onDeletePlaylist={handleMusicDeletePlaylist}
            onUpdatePlaylist={handleMusicUpdatePlaylist}
            onReorderPlaylist={handleMusicReorderPlaylist}
          />
        </Suspense>
      ) : appMode !== 'markdown' && appMode !== 'files' && appMode !== 'todo' && appMode !== 'latex' && appMode !== 'music' && appMode !== 'rag' && appMode !== 'knowledge-base' && appMode !== 'workflow' && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && appMode !== 'learning' && appMode !== 'excalidraw' && appMode !== 'datacenter' && appMode !== 'agent' && !isRendererFullscreen && !isTerminalFullscreen && isSidebarVisible && !moduleConfig.find(m => m.id === appMode)?.isPlugin ? (
        <Sidebar 
          appMode={appMode}  
          categories={activeCategories} 
          selectedCategory={selectedCategory} 
          onSelectCategory={setSelectedCategory}
          onOpenManager={() => setIsCategoryManagerOpen(true)}
          totalCount={getCurrentCount()}
          files={appMode === 'files' ? filteredFileRecords : undefined}
          activeFileId={activeRenderFileId}
          onSelectFile={(id) => {
            setActiveRenderFileId(id);
            setIsEditingFile(false);
          }}
        />
      ) : null}

      {appMode === 'agent' && (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}>
          <AgentPanel
            todos={todos}
            notes={notes}
            onCreateTodo={(todoData) => {
              const newTodo: TodoItem = {
                id: todoData.id || crypto.randomUUID(),
                content: todoData.content || '新事项',
                description: todoData.description,
                isCompleted: false,
                priority: todoData.priority || 'medium',
                category: todoData.category || '未分类',
                dueDate: todoData.dueDate,
                createdAt: Date.now(),
              };
              setTodos(prev => [newTodo, ...prev]);
            }}
            onUpdateTodo={(id, updates) => {
              setTodos(prev => prev.map(t => t.id === id ? { ...t, ...updates } as TodoItem : t));
            }}
            onDeleteTodo={(id) => {
              setTodos(prev => prev.filter(t => t.id !== id));
            }}
            onCreateNote={(noteData) => {
              const newNote: Note = {
                id: crypto.randomUUID(),
                content: noteData.content || '新便签',
                color: noteData.color || 'bg-yellow-100',
                createdAt: Date.now(),
              };
              setNotes(prev => [newNote, ...prev]);
            }}
            onUpdateNote={(id, updates) => {
              setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } as Note : n));
            }}
            onDeleteNote={(id) => {
              setNotes(prev => prev.filter(n => n.id !== id));
            }}
            onCreatePrompt={(promptData) => {
              const newPrompt: PromptRecord = {
                id: crypto.randomUUID(),
                title: promptData.title || '未命名技能',
                content: promptData.content || '',
                description: promptData.description,
                tags: promptData.tags || [],
                category: promptData.category || '未分类',
                note: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              setPrompts(prev => [newPrompt, ...prev]);
            }}
            onCreateMarkdownNote={(noteData) => {
              const newNote: MarkdownNote = {
                id: Date.now().toString(),
                title: noteData.title || '新笔记',
                category: noteData.category || '',
                content: noteData.content || '# 新笔记\n\n开始编写...',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              setMarkdownNotes(prev => [...prev, newNote]);
            }}
            onCreateOJSubmission={(submission) => {
              setOJHeatmapData(prev => ({
                ...prev,
                submissions: [...prev.submissions, submission],
              }));
            }}
            ojHeatmapData={ojHeatmapData}
            onCreateResource={(itemData) => {
              const newItem = {
                id: crypto.randomUUID(),
                categoryId: itemData.categoryId || 'cloud',
                name: itemData.name || '',
                expireDate: itemData.expireDate,
                capacity: itemData.capacity,
                cost: itemData.cost,
                url: itemData.url,
                note: itemData.note,
                account: itemData.account,
                autoRenewal: itemData.autoRenewal,
                createdAt: Date.now(),
              };
              setResourceData(prev => ({
                categories: prev.categories.length > 0 ? prev.categories : [
                  { id: 'cloud', name: '云盘资源', icon: 'Cloud', color: '#3b82f6' },
                  { id: 'ai', name: 'AI资源', icon: 'Bot', color: '#8b5cf6' },
                  { id: 'server', name: '服务器', icon: 'Server', color: '#22c55e' },
                  { id: 'domain', name: '域名', icon: 'Globe', color: '#f59e0b' },
                  { id: 'subscription', name: '订阅服务', icon: 'CreditCard', color: '#ec4899' },
                ],
                items: [...prev.items, newItem],
              }));
            }}
            onUpdateResource={(id, updates) => {
              setResourceData(prev => ({
                ...prev,
                items: prev.items.map(i => i.id === id ? { ...i, ...updates } : i),
              }));
            }}
            onDeleteResource={(id) => {
              setResourceData(prev => ({
                ...prev,
                items: prev.items.filter(i => i.id !== id),
              }));
            }}
            resourceData={resourceData}
            fileRecords={fileRecords}
            fileCategories={(categoriesMap['files'] || []).filter(c => c.id !== 'all').map(c => c.name)}
            recurringEvents={recurringEvents}
            recurringCategories={recurringCategories}
            onCreateRecurring={handleCreateRecurring}
            onUpdateRecurring={handleUpdateRecurring}
            onDeleteRecurring={handleDeleteRecurring}
            onUpdateRecurringCategories={handleUpdateRecurringCategories}
            todoCategories={(categoriesMap['todo'] || DEFAULT_CATEGORIES).filter(c => c.id !== 'all').map(c => c.name)}
            promptCategories={(categoriesMap['prompts'] || DEFAULT_CATEGORIES).filter(c => c.id !== 'all').map(c => c.name)}
            markdownCategories={[
              ...(categoriesMap['markdown'] || DEFAULT_CATEGORIES).filter(c => c.id !== 'all').map(c => c.name),
              ...markdownNotes.map(n => n.category).filter((c): c is string => !!c && c !== '未分类'),
            ].filter((v, i, a) => a.indexOf(v) === i)}
            onAddCategory={handleAddCategory}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </Suspense>
      )}

      <div className={`flex-1 flex flex-col min-w-0 relative bg-white`} style={appMode === 'agent' ? { display: 'none' } : undefined}>
        {!(isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen) && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && appMode !== 'learning' && appMode !== 'image-hosting' && appMode !== 'files' && appMode !== 'excalidraw' && appMode !== 'datacenter' && appMode !== 'latex' && appMode !== 'music' && appMode !== 'rag' && appMode !== 'knowledge-base' && appMode !== 'workflow' && !(appMode === 'todo' && todoSubMode !== 'tasks') && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
           <div className="flex items-center gap-4 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={getSearchPlaceholder()}
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
              </div>
           </div>
           <div className="flex items-center gap-3 ml-4">
              {appMode === 'prompts' && (
              <button
                onClick={() => setIsSkillImportOpen(true)}
                className="flex items-center gap-2 px-4 py-2 border border-purple-200 text-purple-600 rounded-xl hover:bg-purple-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="font-medium">导入</span>
              </button>
              )}
              {appMode !== 'image-hosting' && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
              <button 
                onClick={() => {
                  switch (appMode) {
                    case 'notes': 
                      setEditingNote(null);
                      setIsNoteModalOpen(true); 
                      break;
                    case 'todo': 
                      setEditingTodo(null);
                      setIsTodoModalOpen(true); 
                      break;
                    case 'files': 
                      setEditingFile(null);
                      setFileModalMode('file');
                      setIsFileModalOpen(true); 
                      break;
                    case 'prompts': 
                      setEditingPrompt(null);
                      setIsPromptModalOpen(true); 
                      break;
                    case 'markdown': 
                      handleAddMarkdownNote(); 
                      break;
                    default: break;
                  }
                }}
                className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
                title={getAddButtonLabel()}
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
              )}
              {/* Help button */}
              <button
                onClick={() => setIsHelpOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 transition-all"
                title="使用帮助"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
           </div>
        </div>
        )}

        <div className={`flex-1 ${appMode === 'latex' ? 'overflow-hidden' : appMode === 'music' ? 'overflow-hidden' : appMode === 'rag' ? 'overflow-hidden' : appMode === 'knowledge-base' ? 'overflow-hidden' : appMode === 'workflow' ? 'overflow-hidden' : (appMode === 'todo' && todoSubMode !== 'tasks') ? 'overflow-hidden' : 'overflow-auto'} ${isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen || appMode === 'browser' || appMode === 'leetcode' || appMode === 'learning' || appMode === 'image-hosting' || appMode === 'excalidraw' || appMode === 'datacenter' || appMode === 'latex' || appMode === 'music' || appMode === 'rag' || appMode === 'knowledge-base' || appMode === 'workflow' || moduleConfig.find(m => m.id === appMode)?.isPlugin ? '' : (appMode === 'todo' && todoSubMode !== 'tasks') ? 'p-4' : 'p-6'}`}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>加载模块中...</span>
            </div>
          }>
            {appMode === 'notes' && <NoteList notes={filteredNotes} onDelete={handleDeleteNote} onEdit={handleEditNote} />}
            {/* SSH模块已迁移到数据中心 */}
            {/* API模块已迁移到数据中心 */}
            {appMode === 'todo' && todoSubMode === 'plan' && (
              <div className="h-full flex flex-col">
                <div className="flex items-center justify-between px-2 mb-3">
                  <h3 className="text-lg font-bold text-gray-800">总体规划</h3>
                  <div className="flex items-center gap-1">
                    {todoPlanHasTOC && !todoPlanEditing && (
                      <button
                        onClick={() => setTodoPlanShowTOC(v => !v)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          todoPlanShowTOC ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                        title={todoPlanShowTOC ? "隐藏目录" : "显示目录"}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setTodoPlanEditing(v => !v)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        todoPlanEditing ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                      }`}
                      title={todoPlanEditing ? "保存" : "编辑"}
                    >
                      {todoPlanEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <MarkdownEditor
                    note={{ id: 'todo-plan', title: '总体规划', content: todoPlanContent, category: '', createdAt: 0, updatedAt: 0 }}
                    onUpdate={(_id, updates) => { if (updates.content !== undefined) setTodoPlanContent(updates.content); }}
                    isFullscreen={false}
                    onToggleFullscreen={() => {}}
                    hideMetadata={true}
                    showViewToggle={false}
                    hideHeaderTitle={true}
                    hideFullscreen={true}
                    hideEditButton={true}
                    hideToolbar={true}
                    compact={true}
                    externalIsEditing={todoPlanEditing}
                    onEditingChange={setTodoPlanEditing}
                    hideTOCButton={true}
                    externalShowTOC={todoPlanShowTOC}
                    onShowTOCChange={setTodoPlanShowTOC}
                    onTOCAvailableChange={setTodoPlanHasTOC}
                  />
                </div>
              </div>
            )}
            {appMode === 'todo' && todoSubMode === 'schedule' && (
              <div className="h-full overflow-auto">
                <ScheduleView
                  todos={filteredTodos}
                  onEditTodo={handleEditTodo}
                  onToggleTodo={handleToggleTodo}
                  recurringEvents={recurringEvents}
                  onEditRecurring={(re) => { /* open modal via manager */ }}
                />
              </div>
            )}
            {appMode === 'todo' && todoSubMode === 'tasks' && (
              <TodoList todos={filteredTodos} onDelete={handleDeleteTodo} onEdit={handleEditTodo} onToggle={handleToggleTodo} onToggleSubtask={handleToggleSubtask} categories={activeCategories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} onOpenManager={() => setIsCategoryManagerOpen(true)} />
            )}

            {appMode === 'todo' && todoSubMode === 'recurring' && (
              <RecurringEventManager
                events={recurringEvents}
                categories={recurringCategories}
                onCreate={handleCreateRecurring}
                onUpdate={handleUpdateRecurring}
                onDelete={handleDeleteRecurring}
                onUpdateCategories={handleUpdateRecurringCategories}
              />
            )}
            
            {appMode === 'files' && (
               activeRenderFileId ? (
                  isEditingFile ? (
                    <MarkdownEditor
                      note={{
                        id: activeRenderFileId,
                        title: fileRecords.find(f => f.id === activeRenderFileId)?.name || '',
                        content: editingFileContent,
                        category: fileRecords.find(f => f.id === activeRenderFileId)?.category || '',
                        createdAt: 0,
                        updatedAt: 0
                      }}
                      onUpdate={async (id, updates) => {
                        if (updates.content !== undefined) {
                          setEditingFileContent(updates.content);
                          // Write directly to disk — MarkdownEditor already debounces internally
                          if (window.electronAPI) {
                            const file = fileRecords.find(f => f.id === id);
                            if (file) {
                              await window.electronAPI.writeFile(file.path, updates.content);
                            }
                          }
                        }
                      }}
                      isFullscreen={isRendererFullscreen}
                      onToggleFullscreen={() => setIsRendererFullscreen(!isRendererFullscreen)}
                      hideMetadata={true}
                      showViewToggle={true}
                      onExitEdit={() => {
                        setIsEditingFile(false);
                      }}
                    />
                  ) : (
                    <FileRenderer 
                      file={fileRecords.find(f => f.id === activeRenderFileId)!} 
                      isFullscreen={isRendererFullscreen}
                      onToggleFullscreen={() => setIsRendererFullscreen(!isRendererFullscreen)}
                      onEdit={async () => {
                        const file = fileRecords.find(f => f.id === activeRenderFileId);
                        if (file && window.electronAPI) {
                           try {
                             const content = await window.electronAPI.readFile(file.path);
                             setEditingFileContent(content);
                             setIsEditingFile(true);
                           } catch (e) {
                             console.error('Failed to read file for editing', e);
                             alert('无法读取文件内容');
                           }
                        }
                      }}
                      onRelocate={handleRelocateFile}
                    />
                  )
               ) : (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400">
                   <p>请从左侧选择文件查看</p>
                 </div>
               )
            )}

            {appMode === 'prompts' && <PromptList prompts={filteredPrompts} onDelete={handleDeletePrompt} onDeleteMany={handleDeleteManyPrompts} onEdit={handleEditPrompt} onImport={handleImportSkills} isImportOpen={isSkillImportOpen} onImportOpenChange={setIsSkillImportOpen} />}
            
            {appMode === 'image-hosting' && (
              <ImageHosting 
                records={filteredImageRecords}
                config={imageHostingConfig}
                selectedCategory={selectedCategory}
                categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
                onUpdateRecords={setImageRecords}
                onUpdateConfig={setImageHostingConfig}
                onHelp={() => setIsHelpOpen(true)}
              />
            )}

            {/* Plugin Rendering */}
            {moduleConfig.find(m => m.id === appMode && m.isPlugin) && (
              <div className="relative h-full">
                <button
                  onClick={() => setIsHelpOpen(true)}
                  className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 transition-all shadow-sm"
                  title="使用帮助"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
                <PluginContainer 
                  entryPath={moduleConfig.find(m => m.id === appMode)?.pluginPath || ''} 
                  pluginId={appMode}
                  onOpenInBrowser={handleOpenInBrowser}
                />
              </div>
            )}

            {(hasTerminalMounted || appMode === 'terminal') && (
              <div className={appMode === 'terminal' ? 'h-full' : 'hidden'}>
                <Terminal 
                  isFullscreen={isTerminalFullscreen}
                  onToggleFullscreen={() => setIsTerminalFullscreen(!isTerminalFullscreen)}
                  initialCommand={initialTerminalCommand}
                  initialTitle={initialTerminalTitle}
                  isVisible={appMode === 'terminal'}
                />
              </div>
            )}

            {(hasBrowserMounted || appMode === 'browser') && (
              <div className={appMode === 'browser' ? 'h-full' : 'hidden'}>
                <WebBrowser initialUrl={browserUrl} />
              </div>
            )}

            {(hasLeetCodeMounted || appMode === 'leetcode') && (
              <div className={appMode === 'leetcode' ? 'h-full' : 'hidden'}>
                <LeetCodeManager
                  onCreateNote={() => {
                    setEditingNote(null);
                    setIsNoteModalOpen(true);
                  }}
                  onOpenChat={() => handleToggleFloatingChat('leetcode')}
                />
              </div>
            )}

            {(hasLearningMounted || appMode === 'learning') && (
              <div className={appMode === 'learning' ? 'h-full' : 'hidden'}>
                <LearningManager onOpenChat={() => handleToggleFloatingChat('learning')} />
              </div>
            )}

            {(hasExcalidrawMounted || appMode === 'excalidraw') && (
              <div className={appMode === 'excalidraw' ? 'h-full relative' : 'hidden'}>
                {appMode === 'excalidraw' && (
                  <button
                    onClick={() => setIsHelpOpen(true)}
                    className="absolute top-3 right-16 z-10 w-7 h-7 flex items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 transition-all shadow-sm"
                    title="使用帮助"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                <ExcalidrawEditor />
              </div>
            )}

            {(hasDataCenterMounted || appMode === 'datacenter') && (
              <div className={appMode === 'datacenter' ? 'h-full' : 'hidden'}>
                <DataCenterManager
                  ojHeatmapData={ojHeatmapData}
                  onUpdateOJHeatmapData={setOJHeatmapData}
                  resourceData={resourceData}
                  onUpdateResourceData={setResourceData}
                  sshRecords={sshRecords}
                  sshCategories={categoriesMap['ssh'] || DEFAULT_CATEGORIES}
                  onSaveSSH={handleSaveSSH}
                  onDeleteSSH={handleDeleteSSH}
                  onOpenSSHInTerminal={handleOpenSSHInTerminal}
                  onUpdateSSHCategories={handleUpdateSSHCategories}
                  onDeleteSSHCategory={handleDeleteSSHCategory}
                  apiRecords={apiRecords}
                  apiCategories={categoriesMap['api'] || DEFAULT_CATEGORIES}
                  onSaveAPI={handleSaveAPI}
                  onDeleteAPI={handleDeleteAPI}
                  onUpdateAPICategories={handleUpdateAPICategories}
                  onDeleteAPICategory={handleDeleteAPICategory}
                />
              </div>
            )}

            {appMode === 'latex' && (
              <div className="relative flex h-full w-full overflow-hidden">
                {/* Floating expand strip — shown when latex sidebar is collapsed */}
                {!isLatexSidebarVisible && !isLatexFullscreen && (
                  <button
                    onClick={() => setIsLatexSidebarVisible(true)}
                    className="absolute left-0 top-0 h-full w-5 z-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 border-r border-gray-200 transition-colors group"
                    title="展开侧边栏"
                  >
                    <span className="w-0.5 h-8 bg-gray-300 group-hover:bg-gray-500 rounded-full transition-colors" />
                  </button>
                )}
                <div className={`flex-1 min-w-0 h-full transition-all ${!isLatexSidebarVisible && !isLatexFullscreen ? 'pl-5' : ''}`}>
                  <LatexEditor
                    onEditTemplateRef={latexEditTemplateRef}
                    onLoadTemplateAsFileRef={latexLoadTemplateAsFileRef}
                    onOpenFileRef={latexOpenFileRef}
                    isSidebarVisible={isLatexSidebarVisible}
                    onToggleSidebar={() => setIsLatexSidebarVisible(v => !v)}
                    isFullscreen={isLatexFullscreen}
                    onToggleFullscreen={() => setIsLatexFullscreen(v => !v)}
                  />
                </div>
              </div>
            )}

            {appMode === 'markdown' && activeTipId && (
              <MarkdownEditor
                note={markdownNotes.find(t => t.id === activeTipId)!}
                onUpdate={handleUpdateMarkdownNote}
                isFullscreen={isMarkdownFullscreen}
                onToggleFullscreen={() => setIsMarkdownFullscreen(!isMarkdownFullscreen)}
              />
            )}

            {(hasMusicMounted || appMode === 'music') && (
              <div className={appMode === 'music' ? 'h-full' : 'hidden'}>
                <MusicPlayer
                  tracks={musicTracks}
                  playlists={musicPlaylists}
                  selectedPlaylist={selectedMusicPlaylist}
                  coverCache={musicCoverCache.current}
                  coverVersion={musicCoverVersion}
                  onUpdateTrack={handleMusicUpdateTrack}
                  onDeleteTrack={handleMusicDeleteTrack}
                  onToggleInPlaylist={handleMusicToggleInPlaylist}
                  onLoadCover={handleMusicLoadCover}
                  onSetCover={handleMusicSetCover}
                  onAddFiles={handleMusicAddFiles}
                  onAddFolder={handleMusicAddFolder}
                  onReorderTracksInPlaylist={handleMusicReorderTracks}
                />
              </div>
            )}

            {(hasRagMounted || appMode === 'rag') && (
              <div className={appMode === 'rag' ? 'h-full' : 'hidden'}>
                <RagTestBench />
              </div>
            )}
            {(hasKbMounted || appMode === 'knowledge-base') && (
              <div className={appMode === 'knowledge-base' ? 'h-full' : 'hidden'}>
                <KnowledgeBase />
              </div>
            )}
            {(hasWorkflowMounted || appMode === 'workflow') && (
              <div className={appMode === 'workflow' ? 'h-full' : 'hidden'}>
                <WorkflowEngine />
              </div>
            )}
          </Suspense>
        </div>
      </div>

      {/* Modals */}
      <Suspense fallback={null}>
        <NoteModal
          isOpen={isNoteModalOpen}
          onClose={() => setIsNoteModalOpen(false)}
          onSave={handleSaveNote}
          initialData={editingNote}
        />

        <SSHModal
          isOpen={isSSHModalOpen}
          onClose={() => setIsSSHModalOpen(false)}
          onSave={handleSaveSSH}
          initialData={editingSSH}
          categories={(categoriesMap['ssh'] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

        <TodoModal
          isOpen={isTodoModalOpen}
          onClose={() => setIsTodoModalOpen(false)}
          onSave={handleSaveTodo}
          onAutoSave={handleAutoSaveTodoSubtasks}
          initialData={editingTodo}
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

        <FileModal
          isOpen={isFileModalOpen}
          onClose={() => setIsFileModalOpen(false)}
          onSave={handleSaveFile}
          initialData={editingFile}
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
          mode={fileModalMode}
        />

        <PromptModal
          isOpen={isPromptModalOpen}
          onClose={() => setIsPromptModalOpen(false)}
          onSave={handleSavePrompt}
          initialData={editingPrompt}
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

        <CategoryManagerModal
          isOpen={isCategoryManagerOpen}
          onClose={() => {
            setIsCategoryManagerOpen(false);
            setInitialCategoryEditId(null);
          }}
          categories={categoriesMap[appMode] || DEFAULT_CATEGORIES}
          initialEditId={initialCategoryEditId}
          onUpdateCategories={newCategories => {
            const oldCategories = categoriesMap[appMode] || DEFAULT_CATEGORIES;
            
            // 检测分类名称是否有变化
            const categoryNameChanges = new Map<string, string>(); // oldName -> newName
            oldCategories.forEach(oldCat => {
              const newCat = newCategories.find(c => c.id === oldCat.id);
              if (newCat && newCat.name !== oldCat.name) {
                categoryNameChanges.set(oldCat.name, newCat.name);
              }
            });
            
            // 如果有分类名称变化，更新相关数据记录
            if (categoryNameChanges.size > 0) {
              switch (appMode) {
                case 'ssh':
                  setSSHRecords(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'api':
                  setApiRecords(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'todo':
                  setTodos(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'files':
                  setFileRecords(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'prompts':
                  setPrompts(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'markdown':
                  setMarkdownNotes(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category);
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
                case 'image':
                  setImageRecords(prev => prev.map(item => {
                    const newName = categoryNameChanges.get(item.category || '');
                    return newName ? { ...item, category: newName } : item;
                  }));
                  break;
              }
            }
            
            setCategoriesMap(prev => ({ ...prev, [appMode]: newCategories }));
            setSelectedCategory('全部');
          }}
          onDeleteCategory={handleDeleteCategory}
        />

        {vaultImportFiles && (
          <VaultImportModal
            files={vaultImportFiles}
            onImport={handleVaultImportConfirm}
            onClose={() => setVaultImportFiles(null)}
          />
        )}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          categories={activeCategories}
          notes={notes}
          sshRecords={sshRecords}
          apiRecords={apiRecords}
          todos={todos}
          fileRecords={fileRecords}
          moduleConfig={moduleConfig}
          onUpdateModules={setModuleConfig}
        />
      </Suspense>

      {/* Floating AI Chat Window */}
      <FloatingChatWindow
        isOpen={isFloatingChatOpen}
        onClose={() => { setIsFloatingChatOpen(false); setFloatingChatSource(null); }}
        title={floatingChatSource === 'leetcode' ? '刷题 AI 助手' : '学习 AI 助手'}
      >
        <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /><span>加载中...</span></div>}>
          <KnowledgeBase compact />
        </Suspense>
      </FloatingChatWindow>

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        appMode={appMode}
        moduleName={moduleConfig.find(m => m.id === appMode)?.name}
        isPlugin={moduleConfig.find(m => m.id === appMode)?.isPlugin}
      />


        </div>
      )}
    </>
  );
};

export default App;
