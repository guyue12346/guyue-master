import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { NavRail } from './components/NavRail';
import { Sidebar } from './components/Sidebar';
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
const MarkdownEditor = React.lazy(() => import('./components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const FileRenderer = React.lazy(() => import('./components/FileRenderer').then(m => ({ default: m.FileRenderer })));
const Terminal = React.lazy(() => import('./components/Terminal').then(m => ({ default: m.Terminal })));
const WebBrowser = React.lazy(() => import('./components/WebBrowser').then(m => ({ default: m.WebBrowser })));
const LeetCodeManager = React.lazy(() => import('./components/LeetCodeManager').then(m => ({ default: m.LeetCodeManager })));
const ImageHosting = React.lazy(() => import('./components/ImageHosting').then(m => ({ default: m.ImageHosting })));
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

const App: React.FC = () => {
  const [appMode, setAppMode] = useState<AppMode>('bookmarks');
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig[]>(DEFAULT_MODULE_CONFIG);
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
  }, [appMode, hasTerminalMounted, hasBrowserMounted, hasLeetCodeMounted]);
  
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editingSSH, setEditingSSH] = useState<SSHRecord | null>(null);
  const [editingAPI, setEditingAPI] = useState<APIRecord | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptRecord | null>(null);

  // Shortcut handling
  const isTabPressed = React.useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        isTabPressed.current = true;
      }

      // Check for shortcuts
      if (isTabPressed.current) {
        // Check if a number key is pressed
        if (/^\d$/.test(e.key)) {
          const key = e.key;
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

  // Initial Load
  useEffect(() => {
    // Load Bookmarks
    const savedBookmarks = localStorage.getItem(STORAGE_KEY_BOOKMARKS);
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks));
      } catch (e) {
        console.error("Failed to parse bookmarks", e);
      }
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

    // Load Module Config
    const savedModules = localStorage.getItem(STORAGE_KEY_MODULES);
    if (savedModules) {
      try {
        const parsed: ModuleConfig[] = JSON.parse(savedModules);
        const merged = DEFAULT_MODULE_CONFIG.map(defaultModule => {
          const existing = parsed.find(m => m.id === defaultModule.id);
          // Force name from default config to ensure updates propagate, as renaming is not supported in UI yet
          return existing ? { ...defaultModule, ...existing, name: defaultModule.name } : defaultModule;
        });
        const legacyExtras = parsed.filter(m => !merged.find(item => item.id === m.id) && (m.id as string) !== 'tips');
        setModuleConfig([...merged, ...legacyExtras]);
      } catch (e) {
        setModuleConfig(DEFAULT_MODULE_CONFIG);
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
      });
    }
  }, []);

  // Reset selection and search when mode changes
  useEffect(() => {
    setSelectedCategory('全部');
    setSearchQuery('');
    if (appMode !== 'terminal') {
      setInitialTerminalCommand(undefined);
      setInitialTerminalTitle(undefined);
    }
  }, [appMode]);

  // Save on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BOOKMARKS, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categoriesMap));
  }, [categoriesMap]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SSH, JSON.stringify(sshRecords));
  }, [sshRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_API, JSON.stringify(apiRecords));
  }, [apiRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(fileRecords));
  }, [fileRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROMPTS, JSON.stringify(prompts));
  }, [prompts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MARKDOWN, JSON.stringify(markdownNotes));
  }, [markdownNotes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_IMAGE_RECORDS, JSON.stringify(imageRecords));
  }, [imageRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_IMAGE_CONFIG, JSON.stringify(imageHostingConfig));
  }, [imageHostingConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RENDER_FILES, JSON.stringify(fileRecords));
  }, [fileRecords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MODULES, JSON.stringify(moduleConfig));
  }, [moduleConfig]);

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
    if (appMode === 'renderer') return categoriesMap['files'] || DEFAULT_CATEGORIES;
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
    if (appMode !== 'files' && appMode !== 'renderer') return [];
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
    if (appMode === 'renderer') return filteredFileRecords.length;
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
    if (appMode === 'renderer') return '搜索文件...';
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

  const handleSaveFile = (fileData: Partial<FileRecord>) => {
     const catName = fileData.category || '未分类';
     ensureCategoryExists(catName);

     if (fileData.id) {
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

  const handleDeleteFile = (id: string) => {
    if (confirm('确定要删除这个文件记录吗?')) {
      setFileRecords(prev => prev.filter(f => f.id !== id));
    }
  };

  const handleEditFile = (file: FileRecord) => {
    setEditingFile(file);
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

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-gray-50 select-none">
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
      ) : appMode !== 'markdown' && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && !isRendererFullscreen && !isTerminalFullscreen && isSidebarVisible && !moduleConfig.find(m => m.id === appMode)?.isPlugin ? (
        <Sidebar 
          appMode={appMode}  
          categories={activeCategories} 
          selectedCategory={selectedCategory} 
          onSelectCategory={setSelectedCategory}
          onOpenManager={() => setIsCategoryManagerOpen(true)}
          totalCount={getCurrentCount()}
          files={appMode === 'renderer' ? filteredFileRecords : undefined}
          activeFileId={activeRenderFileId}
          onSelectFile={setActiveRenderFileId}
        />
      ) : null}

      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!(isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen) && appMode !== 'terminal' && appMode !== 'browser' && appMode !== 'leetcode' && appMode !== 'image-hosting' && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
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
              {appMode !== 'renderer' && appMode !== 'image-hosting' && !moduleConfig.find(m => m.id === appMode)?.isPlugin && (
              <button 
                onClick={() => {
                  switch (appMode) {
                    case 'notes': setIsNoteModalOpen(true); break;
                    case 'ssh': setIsSSHModalOpen(true); break;
                    case 'api': setIsAPIModalOpen(true); break;
                    case 'todo': setIsTodoModalOpen(true); break;
                    case 'files': setIsFileModalOpen(true); break;
                    case 'prompts': setIsPromptModalOpen(true); break;
                    case 'markdown': handleAddMarkdownNote(); break;
                    default: setIsAddModalOpen(true);
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

        <div className={`flex-1 overflow-auto ${isRendererFullscreen || isMarkdownFullscreen || isTerminalFullscreen || isBrowserFullscreen || appMode === 'browser' || appMode === 'leetcode' || appMode === 'image-hosting' || moduleConfig.find(m => m.id === appMode)?.isPlugin ? '' : 'p-6'}`}>
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
            {appMode === 'files' && <FileList files={filteredFileRecords} onDelete={handleDeleteFile} onEdit={handleEditFile} />}
            {appMode === 'prompts' && <PromptList prompts={filteredPrompts} onDelete={handleDeletePrompt} onEdit={handleEditPrompt} />}
            
            {appMode === 'image-hosting' && (
              <ImageHosting 
                records={filteredImageRecords}
                config={imageHostingConfig}
                selectedCategory={selectedCategory}
                onUpdateRecords={setImageRecords}
                onUpdateConfig={setImageHostingConfig}
              />
            )}

            {/* Plugin Rendering */}
            {moduleConfig.find(m => m.id === appMode && m.isPlugin) && (
              <PluginContainer 
                entryPath={moduleConfig.find(m => m.id === appMode)?.pluginPath || ''} 
                pluginId={appMode}
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
                <LeetCodeManager />
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

            {appMode === 'renderer' && activeRenderFileId && (
              <FileRenderer 
                file={fileRecords.find(f => f.id === activeRenderFileId)!} 
                isFullscreen={isRendererFullscreen}
                onToggleFullscreen={() => setIsRendererFullscreen(!isRendererFullscreen)}
              />
            )}
          </Suspense>
        </div>
      </div>

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
          onClose={() => setIsCategoryManagerOpen(false)}
          categories={categoriesMap[appMode] || DEFAULT_CATEGORIES}
          onUpdateCategories={newCategories => {
            setCategoriesMap(prev => ({ ...prev, [appMode]: newCategories }));
            setSelectedCategory('全部');
          }}
          onDeleteCategory={(id) => {
            setCategoriesMap(prev => ({
              ...prev,
              [appMode]: prev[appMode].filter(c => c.id !== id)
            }));
          }}
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
  );
};

export default App;
