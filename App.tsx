import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { NavRail } from './components/NavRail';
import { Sidebar } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import { FloatingChatWindow } from './components/FloatingChatWindow';
import { Bookmark, Category, Note, SSHRecord, APIRecord, TodoItem, FileRecord, PromptRecord, MarkdownNote, ImageRecord, ImageHostingConfig, DEFAULT_CATEGORIES, AppMode, ModuleConfig, DEFAULT_MODULE_CONFIG, PluginMetadata } from './types';
import { Plus, Search, Command, Loader2 } from 'lucide-react';

// Lazy load components to improve initial load performance
const BookmarkList = React.lazy(() => import('./components/BookmarkList').then(m => ({ default: m.BookmarkList })));
const NoteList = React.lazy(() => import('./components/NoteList').then(m => ({ default: m.NoteList })));
const SSHList = React.lazy(() => import('./components/SSHList').then(m => ({ default: m.SSHList })));
const APIList = React.lazy(() => import('./components/APIList').then(m => ({ default: m.APIList })));
const TodoList = React.lazy(() => import('./components/TodoList').then(m => ({ default: m.TodoList })));
const FileList = React.lazy(() => import('./components/FileList').then(m => ({ default: m.FileList })));
const PromptList = React.lazy(() => import('./components/PromptList').then(m => ({ default: m.PromptList })));
const MarkdownSidebar = React.lazy(() => import('./components/MarkdownSidebar').then(m => ({ default: m.MarkdownSidebar })));
const FileSidebar = React.lazy(() => import('./components/FileSidebar').then(m => ({ default: m.FileSidebar })));
const ArchiveSidebar = React.lazy(() => import('./components/ArchiveSidebar').then(m => ({ default: m.ArchiveSidebar })));
const MarkdownEditor = React.lazy(() => import('./components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const FileRenderer = React.lazy(() => import('./components/FileRenderer').then(m => ({ default: m.FileRenderer })));
const Terminal = React.lazy(() => import('./components/Terminal').then(m => ({ default: m.Terminal })));
const WebBrowser = React.lazy(() => import('./components/WebBrowser').then(m => ({ default: m.WebBrowser })));
const LeetCodeManager = React.lazy(() => import('./components/LeetCodeManager').then(m => ({ default: m.LeetCodeManager })));
const LearningManager = React.lazy(() => import('./components/LearningManager').then(m => ({ default: m.LearningManager })));
const ImageHosting = React.lazy(() => import('./components/ImageHosting').then(m => ({ default: m.ImageHosting })));
const ChatManager = React.lazy(() => import('./components/ChatManager').then(m => ({ default: m.ChatManager })));
const PluginContainer = React.lazy(() => import('./components/PluginContainer').then(m => ({ default: m.PluginContainer })));

// Lazy load modals
const AddEditModal = React.lazy(() => import('./components/AddEditModal').then(m => ({ default: m.AddEditModal })));
const NoteModal = React.lazy(() => import('./components/NoteModal').then(m => ({ default: m.NoteModal })));
const SSHModal = React.lazy(() => import('./components/SSHModal').then(m => ({ default: m.SSHModal })));
const APIModal = React.lazy(() => import('./components/APIModal').then(m => ({ default: m.APIModal })));
const TodoModal = React.lazy(() => import('./components/TodoModal').then(m => ({ default: m.TodoModal })));
const FileModal = React.lazy(() => import('./components/FileModal').then(m => ({ default: m.FileModal })));
const PromptModal = React.lazy(() => import('./components/PromptModal').then(m => ({ default: m.PromptModal })));
const CategoryManagerModal = React.lazy(() => import('./components/CategoryManagerModal').then(m => ({ default: m.CategoryManagerModal })));
const SettingsModal = React.lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));

// Storage version for migration management
const STORAGE_VERSION = 'v1';
const STORAGE_VERSION_KEY = 'linkmaster_storage_version';

const STORAGE_KEY_BOOKMARKS = 'linkmaster_bookmarks_v1';
const STORAGE_KEY_CATEGORIES = 'linkmaster_categories_v1';
const STORAGE_KEY_NOTES = 'linkmaster_notes_v1';
const STORAGE_KEY_SSH = 'linkmaster_ssh_v1';
const STORAGE_KEY_API = 'linkmaster_api_v1';
const STORAGE_KEY_TODOS = 'linkmaster_todos_v1';
const STORAGE_KEY_FILES = 'linkmaster_files_v1';
const STORAGE_KEY_PROMPTS = 'linkmaster_prompts_v1';
const STORAGE_KEY_MARKDOWN = 'linkmaster_markdown_v1';
const STORAGE_KEY_RENDER_FILES = 'linkmaster_render_files_v1';
const STORAGE_KEY_MODULES = 'linkmaster_modules_v1';
const STORAGE_KEY_IMAGE_RECORDS = 'linkmaster_image_records_v1';
const STORAGE_KEY_IMAGE_CONFIG = 'linkmaster_image_config_v1';
const STORAGE_KEY_SPLASH_TEXT = 'linkmaster_splash_text_v1';

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
      { old: 'linkmaster_bookmarks', new: STORAGE_KEY_BOOKMARKS },
      { old: 'linkmaster_categories', new: STORAGE_KEY_CATEGORIES },
      { old: 'linkmaster_notes', new: STORAGE_KEY_NOTES },
      { old: 'linkmaster_ssh', new: STORAGE_KEY_SSH },
      { old: 'linkmaster_api', new: STORAGE_KEY_API },
      { old: 'linkmaster_todos', new: STORAGE_KEY_TODOS },
      { old: 'linkmaster_files', new: STORAGE_KEY_FILES },
      { old: 'linkmaster_prompts', new: STORAGE_KEY_PROMPTS },
      { old: 'linkmaster_markdown', new: STORAGE_KEY_MARKDOWN },
      { old: 'linkmaster_render_files', new: STORAGE_KEY_RENDER_FILES },
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

  // Splash screen state
  const [showSplash, setShowSplash] = useState(true);
  const [splashText] = useState<string>(() => {
    const quotes = loadSplashQuotes();
    return pickRandomSplashQuote(quotes);
  });
  const [isAppReady, setIsAppReady] = useState(false);
  
  // Performance: Cache for loaded data to prevent re-parsing
  const [dataCache] = useState(() => new Map<string, any>());

  const [appMode, setAppMode] = useState<AppMode>('bookmarks');
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig[]>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_MODULE_CONFIG;
    }

    const savedModules = localStorage.getItem(STORAGE_KEY_MODULES);
    if (savedModules) {
      try {
        const parsed: ModuleConfig[] = JSON.parse(savedModules);
        const merged = DEFAULT_MODULE_CONFIG.map(defaultModule => {
          const existing = parsed.find(m => m.id === defaultModule.id);
          return existing ? { ...defaultModule, ...existing, name: defaultModule.name } : defaultModule;
        });
        const legacyExtras = parsed.filter(m =>
          !merged.find(item => item.id === m.id) &&
          (m.id as string) !== 'tips' &&
          (m.id as string) !== 'renderer' &&
          (m.id as string) !== 'markdown' &&
          (m.id as string) !== 'vscode' &&
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

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
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
  const [hasChatMounted, setHasChatMounted] = useState(false);
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);
  const [floatingChatSource, setFloatingChatSource] = useState<'leetcode' | 'learning' | null>(null);

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
    if (appMode === 'chat' && !hasChatMounted) {
      setHasChatMounted(true);
    }
  }, [appMode, hasTerminalMounted, hasBrowserMounted, hasLeetCodeMounted, hasLearningMounted, hasChatMounted]);

  useEffect(() => {
    if (appMode === 'chat') {
      setIsFloatingChatOpen(false);
      setFloatingChatSource(null);
    }
  }, [appMode]);
  
  // Categories now managed per app mode
  const [categoriesMap, setCategoriesMap] = useState<Record<string, Category[]>>({
    bookmarks: DEFAULT_CATEGORIES,
    ssh: DEFAULT_CATEGORIES,
    api: DEFAULT_CATEGORIES,
    todo: DEFAULT_CATEGORIES,
    files: DEFAULT_CATEGORIES,
    prompts: DEFAULT_CATEGORIES,
    'image-hosting': DEFAULT_CATEGORIES,
    notes: []
  });
  
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isSSHModalOpen, setIsSSHModalOpen] = useState(false);
  const [isAPIModalOpen, setIsAPIModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [initialCategoryEditId, setInitialCategoryEditId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingSSH, setEditingSSH] = useState<SSHRecord | null>(null);
  const [editingAPI, setEditingAPI] = useState<APIRecord | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);
  const [fileModalMode, setFileModalMode] = useState<'file' | 'note'>('file');
  const [editingPrompt, setEditingPrompt] = useState<PromptRecord | null>(null);
  
  // File Editing State
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [editingFileContent, setEditingFileContent] = useState('');

  // Shortcut handling
  const isTabPressed = React.useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        isTabPressed.current = true;
      }

      // Check for shortcuts
      if (isTabPressed.current) {
        // Check if a number or letter key is pressed
        if (/^[\da-zA-Z]$/.test(e.key)) {
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
          e.preventDefault();
          setIsSidebarVisible(prev => !prev);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        isTabPressed.current = false;
      }
    };

    const handleBlur = () => {
      isTabPressed.current = false;
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
      const storageKeys = [
        { key: STORAGE_KEY_BOOKMARKS, setter: setBookmarks, defaultValue: [
          {id: '1', title: 'Google', url: 'https://google.com', category: '工具', note: 'Search Engine', priority: 1, createdAt: Date.now()},
          {id: '2', title: 'Tailwind CSS', url: 'https://tailwindcss.com', category: '开发', note: 'CSS Framework', priority: 2, createdAt: Date.now()},
        ]},
        { key: STORAGE_KEY_CATEGORIES, setter: (data: any) => setCategoriesMap(prev => ({ ...prev, ...data })), defaultValue: null },
        { key: STORAGE_KEY_NOTES, setter: setNotes, defaultValue: [{id: '1', content: '欢迎使用 NoteMaster！\n在这里记录你的灵感。', color: 'bg-yellow-100', createdAt: Date.now()}]},
        { key: STORAGE_KEY_SSH, setter: setSSHRecords, defaultValue: [] },
        { key: STORAGE_KEY_API, setter: setApiRecords, defaultValue: [] },
        { key: STORAGE_KEY_TODOS, setter: setTodos, defaultValue: [] },
        { key: STORAGE_KEY_FILES, setter: setFileRecords, defaultValue: [] },
        { key: STORAGE_KEY_PROMPTS, setter: setPrompts, defaultValue: [] },
        { key: STORAGE_KEY_MARKDOWN, setter: setMarkdownNotes, defaultValue: [] },
        { key: STORAGE_KEY_IMAGE_RECORDS, setter: setImageRecords, defaultValue: [] },
        { key: STORAGE_KEY_IMAGE_CONFIG, setter: setImageHostingConfig, defaultValue: { accessToken: '', owner: '', repo: '', path: '' } },
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

  // Load Bookmarks (kept for backward compatibility, but now handled in batch)
  useEffect(() => {
    const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (savedBookmarks && !dataCache.has(STORAGE_KEY_BOOKMARKS)) {
      const parsed = safeJSONParse(savedBookmarks, [
        {id: '1', title: 'Google', url: 'https://google.com', category: '工具', note: 'Search Engine', priority: 1, createdAt: Date.now()},
        {id: '2', title: 'Tailwind CSS', url: 'https://tailwindcss.com', category: '开发', note: 'CSS Framework', priority: 2, createdAt: Date.now()},
      ]);
      setBookmarks(parsed);
    }
  }, [dataCache]);

  // Note: Following individual loads are kept but will be skipped if batch load succeeded
  useEffect(() => {
    if (dataCache.has(STORAGE_KEY_BOOKMARKS)) return;
    // Load Bookmarks (fallback)
    const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (savedBookmarks) {
      setBookmarks(safeJSONParse(savedBookmarks, [
        {id: '1', title: 'Google', url: 'https://google.com', category: '工具', note: 'Search Engine', priority: 1, createdAt: Date.now()},
        {id: '2', title: 'Tailwind CSS', url: 'https://tailwindcss.com', category: '开发', note: 'CSS Framework', priority: 2, createdAt: Date.now()},
      ]));
    } else {
        setBookmarks([
            {id: '1', title: 'Google', url: 'https://google.com', category: '工具', note: 'Search Engine', priority: 1, createdAt: Date.now()},
            {id: '2', title: 'Tailwind CSS', url: 'https://tailwindcss.com', category: '开发', note: 'CSS Framework', priority: 2, createdAt: Date.now()},
        ]);
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

    // Load Image Records
    const savedImageRecords = localStorage.getItem(STORAGE_KEY_IMAGE_RECORDS);
    if (savedImageRecords) {
      try {
        setImageRecords(JSON.parse(savedImageRecords));
      } catch (e) {
        console.error("Failed to parse image records", e);
      }
    }

    // Load Image Config
    const savedImageConfig = localStorage.getItem(STORAGE_KEY_IMAGE_CONFIG);
    if (savedImageConfig) {
      try {
        setImageHostingConfig(JSON.parse(savedImageConfig));
      } catch (e) {
        console.error("Failed to parse image config", e);
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

  // Reset selection and search when mode changes
  useEffect(() => {
    setSelectedCategory('全部');
    setSearchQuery('');
    setIsEditingFile(false); // Reset editing state
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
    if (bookmarks.length > 0) {
      saveToStorage(STORAGE_KEY_BOOKMARKS, bookmarks);
    }
  }, [bookmarks, saveToStorage]);

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
    saveToStorage(STORAGE_KEY_FILES, fileRecords);
  }, [fileRecords, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_PROMPTS, prompts);
  }, [prompts, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_MARKDOWN, markdownNotes);
  }, [markdownNotes, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_IMAGE_RECORDS, imageRecords);
  }, [imageRecords, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_IMAGE_CONFIG, imageHostingConfig);
  }, [imageHostingConfig, saveToStorage]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_RENDER_FILES, fileRecords, 500); // Longer delay for file records
  }, [fileRecords, saveToStorage]);

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
    return categoriesMap[appMode] || DEFAULT_CATEGORIES;
  }, [appMode, noteCategories, categoriesMap]);

  // Derived State: Filtered Items
  const filteredBookmarks = useMemo(() => {
    if (appMode !== 'bookmarks') return [];
    return bookmarks
      .filter(b => selectedCategory === '全部' || b.category === selectedCategory)
      .filter(b => 
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        b.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.url.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const pA = a.priority ?? 999;
        const pB = b.priority ?? 999;
        if (pA !== pB) return pA - pB;
        return a.createdAt - b.createdAt;
      });
  }, [bookmarks, selectedCategory, searchQuery, appMode]);

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

  const filteredSSHRecords = useMemo(() => {
    if (appMode !== 'ssh') return [];
    return sshRecords
      .filter(r => selectedCategory === '全部' || r.category === selectedCategory)
      .filter(r => 
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.note.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const pA = a.priority ?? 999;
        const pB = b.priority ?? 999;
        if (pA !== pB) return pA - pB;
        return a.createdAt - b.createdAt;
      });
  }, [sshRecords, selectedCategory, searchQuery, appMode]);

  const filteredAPIRecords = useMemo(() => {
    if (appMode !== 'api') return [];
    return apiRecords
      .filter(r => selectedCategory === '全部' || r.category === selectedCategory)
      .filter(r => 
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.note.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const pA = a.priority ?? 999;
        const pB = b.priority ?? 999;
        if (pA !== pB) return pA - pB;
        return a.createdAt - b.createdAt;
      });
  }, [apiRecords, selectedCategory, searchQuery, appMode]);

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
    if (appMode === 'bookmarks') return filteredBookmarks.length;
    if (appMode === 'notes') return filteredNotes.length;
    if (appMode === 'ssh') return filteredSSHRecords.length;
    if (appMode === 'api') return filteredAPIRecords.length;
    if (appMode === 'todo') return filteredTodos.length;
    if (appMode === 'files') return filteredFileRecords.length;
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
      case 'bookmarks': return '添加书签';
      case 'notes': return '新建笔记';
      case 'ssh': return '添加连接';
      case 'api': return '添加API';
      case 'todo': return '添加待办';
      case 'files': return '添加文件';
      case 'prompts': return '添加Prompt';
      case 'markdown': return '添加Markdown笔记';
      case 'image-hosting': return '上传图片';
      default: return '添加';
    }
  };

  const getSearchPlaceholder = () => {
    if (appMode === 'bookmarks') return '搜索书签...';
    if (appMode === 'ssh') return '搜索服务器...';
    if (appMode === 'api') return '搜索 API...';
    if (appMode === 'todo') return '搜索任务...';
    if (appMode === 'files') return '搜索文件...';
    if (appMode === 'prompts') return '搜索 Prompt...';
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

  // --- Handlers: Bookmarks ---

  const handleSaveBookmark = (bm: Partial<Bookmark>) => {
    const catName = bm.category || '未分类';
    ensureCategoryExists(catName);

    if (bm.id) {
      setBookmarks(prev => prev.map(b => b.id === bm.id ? { ...b, ...bm } as Bookmark : b));
    } else {
      const currentMaxPriority = bookmarks.length > 0 
        ? Math.max(...bookmarks.map(b => b.priority || 0)) 
        : 0;
      
      const newBookmark: Bookmark = {
        id: crypto.randomUUID(),
        title: bm.title!,
        url: bm.url!,
        category: catName,
        note: bm.note || '',
        priority: bm.priority ?? (currentMaxPriority + 1),
        createdAt: Date.now(),
      };
      setBookmarks(prev => [newBookmark, ...prev]);
    }
    setEditingBookmark(null);
  };

  const handleDeleteBookmark = (id: string) => {
    if (confirm('确定要删除这个书签吗?')) {
      setBookmarks(prev => prev.filter(b => b.id !== id));
    }
  };

  const handleEditBookmark = (bm: Bookmark) => {
    setEditingBookmark(bm);
    setIsAddModalOpen(true);
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
    ensureCategoryExists(catName);

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

  // --- Handlers: API ---

  const handleSaveAPI = (record: Partial<APIRecord>) => {
    const catName = record.category || '未分类';
    ensureCategoryExists(catName);

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
    setEditingAPI(null);
  };

  const handleDeleteAPI = (id: string) => {
    if (confirm('确定要删除这个 API 记录吗?')) {
      setApiRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleEditAPI = (record: APIRecord) => {
    setEditingAPI(record);
    setIsAPIModalOpen(true);
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
        isCompleted: false,
        priority: todoData.priority || 'medium',
        category: catName,
        dueDate: todoData.dueDate,
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

  const handleToggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, isCompleted: !t.isCompleted } : t));
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
         size: fileData.size || '0 B',
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

  const handleOpenFloatingChat = (source: 'leetcode' | 'learning') => {
    setFloatingChatSource(source);
    setIsFloatingChatOpen(true);
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
    
    try {
      // 1. Generate unique name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `Note-${timestamp}.md`;
      
      // 2. Construct path
      const safeCategory = categoryName.replace(/[\\/:*?"<>|]/g, '_');
      const targetDir = await window.electronAPI.pathJoin(archiveRoot, safeCategory, 'MARKDOWN');
      await window.electronAPI.ensureDir(targetDir);
      const targetPath = await window.electronAPI.pathJoin(targetDir, fileName);
      
      // 3. Create file
      await window.electronAPI.writeFile(targetPath, '');
      
      // 4. Update state
      const newFile: FileRecord = {
         id: crypto.randomUUID(),
         name: fileName,
         path: targetPath,
         size: '0 B',
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
          {!(isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen) && isSidebarVisible && (
            <NavRail 
              currentMode={appMode} 
              onModeChange={setAppMode} 
              onOpenSettings={() => setIsSettingsOpen(true)}
              moduleConfig={moduleConfig}
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
              onCreateNoteInFolder={handleCreateNoteInFolder}
              onDelete={(id) => handleDeleteFile(id)}
              onEdit={(file) => {
                setEditingFile(file);
                setFileModalMode('file');
                setIsFileModalOpen(true);
              }}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          </Suspense>
        )
      ) : appMode !== 'markdown' && appMode !== 'files' && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && appMode !== 'learning' && appMode !== 'chat' && !isRendererFullscreen && !isTerminalFullscreen && isSidebarVisible && !moduleConfig.find(m => m.id === appMode)?.isPlugin ? (
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

      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!(isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen) && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && appMode !== 'learning' && appMode !== 'image-hosting' && appMode !== 'chat' && appMode !== 'files' && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
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
              {appMode !== 'image-hosting' && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
              <button 
                onClick={() => {
                  switch (appMode) {
                    case 'notes': 
                      setEditingNote(null);
                      setIsNoteModalOpen(true); 
                      break;
                    case 'ssh': 
                      setEditingSSH(null);
                      setIsSSHModalOpen(true); 
                      break;
                    case 'api': 
                      setEditingAPI(null);
                      setIsAPIModalOpen(true); 
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
                    default: 
                      setEditingBookmark(null);
                      setIsAddModalOpen(true);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30"
              >
                <Plus className="w-4 h-4" />
                <span className="font-medium">{getAddButtonLabel()}</span>
              </button>
              )}
           </div>
        </div>
        )}

        <div className={`flex-1 overflow-auto ${isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen || appMode === 'browser' || appMode === 'leetcode' || appMode === 'learning' || appMode === 'image-hosting' || appMode === 'chat' || moduleConfig.find(m => m.id === appMode)?.isPlugin ? '' : 'p-6'}`}>
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>加载模块中...</span>
            </div>
          }>
            {appMode === 'bookmarks' && <BookmarkList bookmarks={filteredBookmarks} onDelete={handleDeleteBookmark} onEdit={handleEditBookmark} onOpenInBrowser={handleOpenInBrowser} />}
            {appMode === 'notes' && <NoteList notes={filteredNotes} onDelete={handleDeleteNote} onEdit={handleEditNote} />}
            {appMode === 'ssh' && <SSHList records={filteredSSHRecords} onDelete={handleDeleteSSH} onEdit={handleEditSSH} onOpenInTerminal={handleOpenSSHInTerminal} />}
            {appMode === 'api' && <APIList records={filteredAPIRecords} onDelete={handleDeleteAPI} onEdit={handleEditAPI} />}
            {appMode === 'todo' && <TodoList todos={filteredTodos} onDelete={handleDeleteTodo} onEdit={handleEditTodo} onToggle={handleToggleTodo} />}
            
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
                        if (updates.content !== undefined && window.electronAPI) {
                          const file = fileRecords.find(f => f.id === id);
                          if (file) {
                            await window.electronAPI.writeFile(file.path, updates.content);
                            setEditingFileContent(updates.content);
                            // Force update file record to ensure FileRenderer re-reads content
                            setFileRecords(prev => prev.map(f => f.id === id ? { ...f } : f));
                          }
                        }
                      }}
                      isFullscreen={isRendererFullscreen}
                      onToggleFullscreen={() => setIsRendererFullscreen(!isRendererFullscreen)}
                      hideMetadata={true}
                      showViewToggle={true}
                      onExitEdit={() => setIsEditingFile(false)}
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
                    />
                  )
               ) : (
                 <div className="flex flex-col items-center justify-center h-full text-gray-400">
                   <p>请从左侧选择文件查看</p>
                 </div>
               )
            )}

            {appMode === 'prompts' && <PromptList prompts={filteredPrompts} onDelete={handleDeletePrompt} onEdit={handleEditPrompt} />}
            
            {appMode === 'image-hosting' && (
              <ImageHosting 
                records={filteredImageRecords}
                config={imageHostingConfig}
                selectedCategory={selectedCategory}
                categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
                onUpdateRecords={setImageRecords}
                onUpdateConfig={setImageHostingConfig}
              />
            )}

            {/* Plugin Rendering */}
            {moduleConfig.find(m => m.id === appMode && m.isPlugin) && (
              <PluginContainer 
                entryPath={moduleConfig.find(m => m.id === appMode)?.pluginPath || ''} 
                pluginId={appMode}
                onOpenInBrowser={handleOpenInBrowser}
              />
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
                <LeetCodeManager onOpenChat={() => handleOpenFloatingChat('leetcode')} />
              </div>
            )}

            {(hasLearningMounted || appMode === 'learning') && (
              <div className={appMode === 'learning' ? 'h-full' : 'hidden'}>
                <LearningManager onOpenChat={() => handleOpenFloatingChat('learning')} />
              </div>
            )}

            {(hasChatMounted || appMode === 'chat') && (
              <div className={appMode === 'chat' ? 'h-full' : 'hidden'}>
                <ChatManager />
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
          </Suspense>
        </div>
      </div>

      <FloatingChatWindow
        isOpen={isFloatingChatOpen}
        onClose={() => {
          setIsFloatingChatOpen(false);
          setFloatingChatSource(null);
        }}
        title={floatingChatSource === 'leetcode' ? '刷题 AI 小窗' : '学习 AI 小窗'}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>加载 AI 助手...</span>
            </div>
          }
        >
          <ChatManager compact />
        </Suspense>
      </FloatingChatWindow>

      {/* Modals */}
      <Suspense fallback={null}>
        <AddEditModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSave={handleSaveBookmark}
          initialData={editingBookmark}
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

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
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

        <APIModal
          isOpen={isAPIModalOpen}
          onClose={() => setIsAPIModalOpen(false)}
          onSave={handleSaveAPI}
          initialData={editingAPI}
          categories={(categoriesMap[appMode] || DEFAULT_CATEGORIES).map(c => c.name)}
        />

        <TodoModal
          isOpen={isTodoModalOpen}
          onClose={() => setIsTodoModalOpen(false)}
          onSave={handleSaveTodo}
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
            setCategoriesMap(prev => ({ ...prev, [appMode]: newCategories }));
            setSelectedCategory('全部');
          }}
          onDeleteCategory={handleDeleteCategory}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          bookmarks={bookmarks}
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
        </div>
      )}
    </>
  );
};

export default App;
