
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, FileDown, FolderOpen, ExternalLink, ToggleLeft, ToggleRight, ChevronDown, Globe, Package, Plus, Trash2, GripVertical, Command, User, Camera, ArrowUpRight, Key, Pencil, Eye, EyeOff, Check } from 'lucide-react';
import { Category, Note, SSHRecord, APIRecord, TodoItem, FileRecord, ModuleConfig, AVAILABLE_ICONS, PluginMetadata, ApiProfile, ApiProviderType } from '../types';
import * as LucideIcons from 'lucide-react';
import { loadProfiles, saveProfiles, addProfile, updateProfile, deleteProfile, API_PROVIDER_LABELS, migrateOldApiKeys } from '../utils/apiProfileService';

const DEFAULT_SPLASH_QUOTE = '有善始者实繁，能克终者盖寡';

const parseStoredSplashQuotes = () => {
  if (typeof window === 'undefined') return [DEFAULT_SPLASH_QUOTE];
  const raw = localStorage.getItem('linkmaster_splash_text_v1');
  if (!raw) return [DEFAULT_SPLASH_QUOTE];

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
    const trimmed = raw.trim();
    if (trimmed) return [trimmed];
  }

  const fallback = raw.trim();
  return fallback ? [fallback] : [DEFAULT_SPLASH_QUOTE];
};

const sortByPriority = (modules: ModuleConfig[]) => [...modules].sort((a, b) => a.priority - b.priority);

const normalizePriorities = (modules: ModuleConfig[]) =>
  modules.map((module, index) => ({ ...module, priority: index }));

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  notes: Note[];
  sshRecords: SSHRecord[];
  apiRecords?: APIRecord[];
  todos?: TodoItem[];
  fileRecords?: FileRecord[];
  moduleConfig?: ModuleConfig[];
  onUpdateModules?: (modules: ModuleConfig[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  categories,
  notes,
  sshRecords,
  apiRecords = [],
  todos = [],
  fileRecords = [],
  moduleConfig = [],
  onUpdateModules
}) => {
  const [archivePath, setArchivePath] = useState<string>('');
  const [vaultPath, setVaultPath] = useState<string>('');
  const [localModules, setLocalModules] = useState<ModuleConfig[]>([]);
  const [openIconSelectorId, setOpenIconSelectorId] = useState<string | null>(null);
  const [browserStartPage, setBrowserStartPage] = useState<string>('');
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [splashQuotesInput, setSplashQuotesInput] = useState<string>('');
  const [splashEnabled, setSplashEnabled] = useState<boolean>(true);
  const [agentShortcutKey, setAgentShortcutKey] = useState<string>('Meta');
  const [proxyPort, setProxyPort] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string>('');
  const [userName, setUserName] = useState<string>('Guyue');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStep, setExportStep] = useState<string>('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const iconSelectorRef = useRef<HTMLDivElement>(null);

  // API Profile Management
  const [apiProfiles, setApiProfiles] = useState<ApiProfile[]>([]);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<{ name: string; provider: ApiProviderType; apiKey: string; baseUrl: string }>({
    name: '', provider: 'openai', apiKey: '', baseUrl: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Sort modules by priority for display
  const sortedModules = useMemo(() => sortByPriority(localModules), [localModules]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (iconSelectorRef.current && !iconSelectorRef.current.contains(event.target as Node)) {
        setOpenIconSelectorId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const savedPath = localStorage.getItem('linkmaster_archive_path');
    if (savedPath) setArchivePath(savedPath);
    
    const savedVaultPath = localStorage.getItem('linkmaster_vault_path');
    if (savedVaultPath) setVaultPath(savedVaultPath);
    
    const savedStartPage = localStorage.getItem('linkmaster_browser_start_page');
    if (savedStartPage) setBrowserStartPage(savedStartPage);
    else setBrowserStartPage('https://www.bing.com');

    const splashQuotes = parseStoredSplashQuotes();
    setSplashQuotesInput(splashQuotes.join('\n'));

    const savedSplashEnabled = localStorage.getItem('linkmaster_splash_enabled');
    setSplashEnabled(savedSplashEnabled !== 'false');

    const savedAgentShortcut = localStorage.getItem('linkmaster_agent_shortcut');
    setAgentShortcutKey(savedAgentShortcut || 'Meta');

    const savedProxyPort = localStorage.getItem('linkmaster_proxy_port');
    setProxyPort(savedProxyPort || '');

    // Load avatar & name
    setUserAvatar(localStorage.getItem('guyue_user_avatar') || '');
    setUserName(localStorage.getItem('guyue_user_name') || 'Guyue');

    // Load API Profiles (migrate old keys on first run)
    migrateOldApiKeys();
    setApiProfiles(loadProfiles());

    // Load plugins
    if (window.electronAPI) {
      window.electronAPI.getPlugins().then(setPlugins);
    }
  }, [isOpen]);

  const handleInstallPlugin = async () => {
    if (window.electronAPI) {
      const success = await window.electronAPI.installPlugin();
      if (success) {
        const newPlugins = await window.electronAPI.getPlugins();
        setPlugins(newPlugins);
        alert('插件安装成功！请重启应用以生效。');
      }
    }
  };

  useEffect(() => {
    if (moduleConfig.length > 0 && isOpen) {
      const cloned = JSON.parse(JSON.stringify(moduleConfig)) as ModuleConfig[];
      setLocalModules(normalizePriorities(sortByPriority(cloned)));
    }
  }, [moduleConfig, isOpen]);

  const persistModules = (modules: ModuleConfig[]) => {
    if (onUpdateModules) {
      onUpdateModules(modules);
    }
  };

  const updateModules = (updater: (modules: ModuleConfig[]) => ModuleConfig[]) => {
    setLocalModules(prev => {
      const next = updater(prev);
      persistModules(next);
      return next;
    });
  };

  const handleModuleToggle = (id: string) => {
    updateModules(prev => prev.map(m => 
      m.id === id ? { ...m, enabled: !m.enabled } : m
    ));
  };

  const handleShortcutChange = (id: string, newShortcut: string) => {
    updateModules(prev => prev.map(m => 
      m.id === id ? { ...m, shortcut: newShortcut } : m
    ));
  };

  const handleIconChange = (id: string, newIcon: string) => {
    updateModules(prev => prev.map(m => 
      m.id === id ? { ...m, icon: newIcon } : m
    ));
    setOpenIconSelectorId(null);
  };

  const reorderModules = (sourceId: string, targetId: string) => {
    updateModules(prev => {
      const sorted = sortByPriority(prev);
      const sourceIndex = sorted.findIndex(m => m.id === sourceId);
      const targetIndex = sorted.findIndex(m => m.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return prev;
      }
      const [moved] = sorted.splice(sourceIndex, 1);
      sorted.splice(targetIndex, 0, moved);
      return normalizePriorities(sorted);
    });
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, moduleId: string) => {
    if (!moduleId) return;
    setDraggingModuleId(moduleId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', moduleId);
  };

  const handleDragOver = (event: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    event.preventDefault();
    if (!draggingModuleId || draggingModuleId === targetId) return;
    reorderModules(draggingModuleId, targetId);
  };

  const handleDragEnd = () => {
    setDraggingModuleId(null);
  };

  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
    return Icon;
  };

  const handleSelectArchiveDir = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setArchivePath(path);
        localStorage.setItem('linkmaster_archive_path', path);
      }
    } else {
      alert('此功能仅在桌面版应用中可用');
    }
  };

  const handleSelectVaultDir = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setVaultPath(path);
        localStorage.setItem('linkmaster_vault_path', path);
      }
    }
  };

  const handleSplashQuotesChange = (value: string) => {
    setSplashQuotesInput(value);
    if (typeof window === 'undefined') return;
    const quotes = value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const payload = quotes.length > 0 ? quotes : [DEFAULT_SPLASH_QUOTE];
    localStorage.setItem('linkmaster_splash_text_v1', JSON.stringify(payload));
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { alert('头像图片不能超过 2MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUserAvatar(dataUrl);
      localStorage.setItem('guyue_user_avatar', dataUrl);
      window.dispatchEvent(new Event('guyue_avatar_change'));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setUserAvatar('');
    localStorage.removeItem('guyue_user_avatar');
    window.dispatchEvent(new Event('guyue_avatar_change'));
  };

  const handleSaveUserName = (name: string) => {
    setUserName(name);
    localStorage.setItem('guyue_user_name', name);
  };
  
  const handleExportMarkdown = async () => {
    setIsExporting(true);
    setExportProgress(0);
    const tick = (step: string, pct: number) => {
      setExportStep(step);
      setExportProgress(pct);
      return new Promise<void>(r => setTimeout(r, 0));
    };
    const read = (key: string) => {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
    };

    await tick('读取用户资料…', 5);
    const profile = { name: localStorage.getItem('guyue_user_name') || 'Guyue', avatar: localStorage.getItem('guyue_user_avatar') || '' };

    await tick('导出笔记与待办…', 15);
    const todoPlan = read('linkmaster_todo_plan_v1');

    await tick('导出 SSH / API 记录…', 25);

    await tick('导出文件记录与分类…', 35);
    const exportCategories = read('linkmaster_categories_v1');

    await tick('导出 Prompts / Markdown…', 45);
    const exportPrompts = read('linkmaster_prompts_v1');
    const exportMarkdown = read('linkmaster_markdown_v1');

    await tick('导出学习记录…', 55);
    const learningCategories = read('learning_categories_v1');
    const learningCourses = read('learning_courses_v1');
    const learningProgress = read('learning_progress');

    await tick('导出 LeetCode 记录…', 65);
    const leetcodeLists = read('leetcode_lists');
    const leetcodeProgress = read('leetcode_progress');

    await tick('导出日历 / 循环事项…', 75);
    const recurringEvents = read('linkmaster_recurring_v1');
    const recurringCategories = read('linkmaster_recurring_cats_v1');

    await tick('导出图片 / 配置…', 85);
    const imageRecords = read('linkmaster_image_records_v1');
    const imageConfig = read('linkmaster_image_config_v1');
    const settings = {
      archivePath: localStorage.getItem('linkmaster_archive_path') || '',
      vaultPath: localStorage.getItem('linkmaster_vault_path') || '',
      browserStartPage: localStorage.getItem('linkmaster_browser_start') || '',
      splashQuotes: read('linkmaster_splash_text_v1'),
      agentShortcutKey: localStorage.getItem('linkmaster_agent_shortcut') || 'Meta',
      proxyPort: localStorage.getItem('linkmaster_proxy_port') || '',
    };

    await tick('生成备份文件…', 93);
    const backup = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      app: 'Guyue Master',
      userProfile: profile,
      notes,
      todoPlan,
      todos,
      sshRecords,
      apiRecords,
      fileRecords,
      categories: exportCategories,
      prompts: exportPrompts,
      markdownNotes: exportMarkdown,
      learningCategories,
      learningCourses,
      learningProgress,
      leetcodeLists,
      leetcodeProgress,
      recurringEvents,
      recurringCategories,
      imageRecords,
      imageHostingConfig: imageConfig,
      moduleConfig,
      settings,
    };

    await tick('正在下载…', 98);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `GuyueMaster_Backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    await tick('完成', 100);
    setTimeout(() => { setIsExporting(false); setExportProgress(0); setExportStep(''); }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-2xl border border-white/50 overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <h2 className="text-lg font-semibold text-gray-800">设置</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-8 max-h-[80vh] overflow-y-auto">

          {/* Section: User Profile */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              个人资料
            </h3>
            <div className="flex items-center gap-6">
              {/* Avatar */}
              <div className="relative group">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center border-2 border-white shadow-md">
                  {userAvatar ? (
                    <img src={userAvatar} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-9 h-9 text-indigo-400" />
                  )}
                </div>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                  title="更换头像"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">昵称</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => handleSaveUserName(e.target.value)}
                    placeholder="输入你的名字"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    上传头像
                  </button>
                  {userAvatar && (
                    <button
                      onClick={handleRemoveAvatar}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      移除头像
                    </button>
                  )}
                  <span className="text-xs text-gray-400">支持 JPG、PNG，最大 2MB</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Section: API Key Management */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" /> API 密钥管理
            </h3>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <p className="text-xs text-gray-400">
                统一管理所有 API 密钥。各功能模块（AI 助手、知识库、向量库等）将从此处选择已保存的配置。
              </p>

              {/* Existing profiles list */}
              {apiProfiles.length > 0 && (
                <div className="space-y-2">
                  {apiProfiles.map(profile => {
                    const isEditing = editingProfileId === profile.id;
                    const isKeyVisible = visibleKeys.has(profile.id);

                    if (isEditing) {
                      return (
                        <div key={profile.id} className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                              placeholder="配置名称"
                              value={newProfile.name}
                              onChange={e => setNewProfile(p => ({ ...p, name: e.target.value }))}
                            />
                            <select
                              className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                              value={newProfile.provider}
                              onChange={e => setNewProfile(p => ({ ...p, provider: e.target.value as ApiProviderType }))}
                            >
                              {Object.entries(API_PROVIDER_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </div>
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-mono"
                            placeholder="API Key"
                            type="password"
                            value={newProfile.apiKey}
                            onChange={e => setNewProfile(p => ({ ...p, apiKey: e.target.value }))}
                          />
                          <input
                            className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-mono"
                            placeholder="Base URL（可选）"
                            value={newProfile.baseUrl}
                            onChange={e => setNewProfile(p => ({ ...p, baseUrl: e.target.value }))}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingProfileId(null); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => {
                                const result = updateProfile(profile.id, {
                                  name: newProfile.name, provider: newProfile.provider,
                                  apiKey: newProfile.apiKey, baseUrl: newProfile.baseUrl || undefined,
                                });
                                if (result) {
                                  setApiProfiles(loadProfiles());
                                  setEditingProfileId(null);
                                }
                              }}
                              className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                            >
                              <Check className="w-3 h-3 inline mr-1" />保存
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={profile.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center shrink-0">
                            <Key className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{profile.name}</div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded">{API_PROVIDER_LABELS[profile.provider] || profile.provider}</span>
                              <span className="font-mono">
                                {isKeyVisible ? profile.apiKey : `${profile.apiKey.slice(0, 6)}${'•'.repeat(Math.min(20, Math.max(0, profile.apiKey.length - 6)))}`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setVisibleKeys(prev => {
                              const next = new Set(prev);
                              if (next.has(profile.id)) next.delete(profile.id); else next.add(profile.id);
                              return next;
                            })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title={isKeyVisible ? '隐藏密钥' : '显示密钥'}
                          >
                            {isKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => {
                              setEditingProfileId(profile.id);
                              setNewProfile({ name: profile.name, provider: profile.provider, apiKey: profile.apiKey, baseUrl: profile.baseUrl || '' });
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="编辑"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`确认删除「${profile.name}」？`)) {
                                deleteProfile(profile.id);
                                setApiProfiles(loadProfiles());
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add new profile form */}
              {showAddForm ? (
                <div className="bg-white rounded-lg border border-green-200 p-3 space-y-2">
                  <div className="text-xs font-medium text-gray-600 mb-1">添加新配置</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                      placeholder="配置名称（如：我的 Gemini）"
                      value={newProfile.name}
                      onChange={e => setNewProfile(p => ({ ...p, name: e.target.value }))}
                    />
                    <select
                      className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={newProfile.provider}
                      onChange={e => setNewProfile(p => ({ ...p, provider: e.target.value as ApiProviderType }))}
                    >
                      {Object.entries(API_PROVIDER_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <input
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-mono"
                    placeholder="API Key（如 sk-...）"
                    type="password"
                    value={newProfile.apiKey}
                    onChange={e => setNewProfile(p => ({ ...p, apiKey: e.target.value }))}
                  />
                  <input
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-mono"
                    placeholder="Base URL（可选，留空使用默认）"
                    value={newProfile.baseUrl}
                    onChange={e => setNewProfile(p => ({ ...p, baseUrl: e.target.value }))}
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewProfile({ name: '', provider: 'openai', apiKey: '', baseUrl: '' });
                      }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (!newProfile.name.trim() || !newProfile.apiKey.trim()) return;
                        addProfile({
                          name: newProfile.name.trim(),
                          provider: newProfile.provider,
                          apiKey: newProfile.apiKey.trim(),
                          baseUrl: newProfile.baseUrl.trim() || undefined,
                        });
                        setApiProfiles(loadProfiles());
                        setShowAddForm(false);
                        setNewProfile({ name: '', provider: 'openai', apiKey: '', baseUrl: '' });
                      }}
                      disabled={!newProfile.name.trim() || !newProfile.apiKey.trim()}
                      className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3 inline mr-1" />添加
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingProfileId(null);
                    setNewProfile({ name: '', provider: 'openai', apiKey: '', baseUrl: '' });
                  }}
                  className="w-full px-4 py-2.5 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> 添加 API 配置
                </button>
              )}
            </div>
          </div>

          {/* Section: Module Management */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              功能模块管理
            </h3>
            
            <p className="text-xs text-gray-400">
              拖动右侧的手柄即可调整模块顺序，顺序越靠前会在主界面中优先显示。
            </p>

            <div className="rounded-xl border border-gray-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">启用</th>
                    <th className="px-4 py-3">模块名称</th>
                    <th className="px-4 py-3 w-24 text-center">图标</th>
                    <th className="px-4 py-3 w-28 text-center">快捷键</th>
                    <th className="px-4 py-3 w-24 text-center">顺序</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sortedModules.map(module => (
                    <tr
                      key={module.id}
                      onDragOver={(e) => handleDragOver(e, module.id)}
                      onDrop={(e) => e.preventDefault()}
                      className={`hover:bg-gray-50/50 transition-colors ${draggingModuleId === module.id ? 'bg-blue-50/70' : ''}`}
                    >
                      <td className="px-4 py-3 text-center">
                        <button 
                          onClick={() => handleModuleToggle(module.id)}
                          className={`transition-colors ${module.enabled ? 'text-blue-600' : 'text-gray-400'}`}
                        >
                          {module.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {module.name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setOpenIconSelectorId(openIconSelectorId === module.id ? null : module.id)}
                            className={`p-1.5 rounded-md border transition-colors flex items-center gap-1 mx-auto ${
                              module.enabled 
                                ? 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600' 
                                : 'bg-gray-100 border-transparent text-gray-400 cursor-not-allowed'
                            }`}
                            disabled={!module.enabled}
                            title="更改图标"
                          >
                            {React.createElement(getIcon(module.icon), { className: "w-4 h-4" })}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                          </button>

                          {openIconSelectorId === module.id && (
                            <div 
                              ref={iconSelectorRef}
                              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 grid grid-cols-6 gap-1 max-h-48 overflow-y-auto"
                            >
                              {AVAILABLE_ICONS.map(iconName => {
                                const Icon = getIcon(iconName);
                                return (
                                  <button
                                    key={iconName}
                                    onClick={() => handleIconChange(module.id, iconName)}
                                    className={`p-2 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors ${
                                      module.icon === iconName ? 'bg-blue-50 text-blue-600' : 'text-gray-500'
                                    }`}
                                    title={iconName}
                                  >
                                    <Icon className="w-4 h-4" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="text" 
                          value={module.shortcut || ''}
                          onChange={(e) => handleShortcutChange(module.id, e.target.value)}
                          placeholder="Tab+1"
                          className={`w-full px-2 py-1 text-sm border rounded-lg text-center outline-none focus:ring-2 focus:ring-blue-500/20 ${
                            !module.enabled ? 'opacity-50 cursor-not-allowed' : 'border-gray-200 bg-white'
                          }`}
                          disabled={!module.enabled}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className={`flex items-center justify-center gap-2 ${!module.enabled ? 'opacity-40' : ''}`}>
                          <span className="text-xs text-gray-400">
                            #{sortedModules.findIndex(m => m.id === module.id) + 1}
                          </span>
                          <div
                            className={`p-1.5 rounded-md border border-dashed border-gray-300 bg-white transition-colors ${
                              module.enabled
                                ? 'text-gray-400 hover:text-blue-600 hover:border-blue-300 cursor-grab'
                                : 'text-gray-200 cursor-not-allowed'
                            }`}
                            draggable={module.enabled}
                            onDragStart={(e) => module.enabled && handleDragStart(e, module.id)}
                            onDragEnd={handleDragEnd}
                            title={module.enabled ? "拖动调整顺序" : "请先启用模块"}
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Plugin Extensions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                插件扩展
              </h3>
              <button
                onClick={handleInstallPlugin}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Plus className="w-3 h-3" />
                安装插件
              </button>
            </div>
            
            {plugins.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">暂无已安装的插件</p>
                <p className="text-xs text-gray-400 mt-1">点击右上角"安装插件"导入功能模块</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {plugins.map(plugin => (
                  <div key={plugin.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-200 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      {plugin.icon ? (
                        <img src={plugin.icon} alt={plugin.name} className="w-6 h-6" />
                      ) : (
                        <Package className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-900 truncate">{plugin.name}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">v{plugin.version}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{plugin.description || '无描述'}</p>
                    </div>
                    <button 
                      onClick={() => {
                        if (confirm(`确定要删除插件 "${plugin.name}" 吗？`)) {
                          window.electronAPI.deletePlugin(plugin.id).then(success => {
                            if (success) {
                              setPlugins(prev => prev.filter(p => p.id !== plugin.id));
                              // Also update module config to remove it
                              onUpdateModules(moduleConfig.filter(m => m.id !== plugin.id));
                            } else {
                              alert('删除失败');
                            }
                          });
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="删除插件"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Splash Screen Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              开屏动画设置
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">开屏动画</label>
                  <p className="text-xs text-gray-400">开启或关闭应用启动时的开屏动画</p>
                </div>
                <button 
                  onClick={() => {
                    const newValue = !splashEnabled;
                    setSplashEnabled(newValue);
                    localStorage.setItem('linkmaster_splash_enabled', String(newValue));
                  }}
                  className={`transition-colors ${splashEnabled ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  {splashEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </button>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">开屏文案</label>
                <textarea
                  value={splashQuotesInput}
                  onChange={(e) => handleSplashQuotesChange(e.target.value)}
                  placeholder={DEFAULT_SPLASH_QUOTE}
                  rows={3}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white resize-none"
                  disabled={!splashEnabled}
                />
                <p className="text-xs text-gray-400">支持多行输入，每行一句。应用启动时会从列表中随机展示一句（重启生效）。</p>
              </div>
            </div>
          </div>

          {/* Section: Proxy Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              网络代理（AI 请求）
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">本地 HTTP 代理端口</label>
                <p className="text-xs text-gray-400">填入本地代理软件的 HTTP 端口（如 Clash 的 7897），所有 AI 对话和知识库请求将通过该端口发出。留空则直连。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">127.0.0.1 :</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={proxyPort}
                  onChange={e => setProxyPort(e.target.value)}
                  placeholder="7897"
                  className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-mono"
                />
                <button
                  onClick={async () => {
                    const port = proxyPort.trim() ? parseInt(proxyPort.trim(), 10) : null;
                    localStorage.setItem('linkmaster_proxy_port', proxyPort.trim());
                    if (window.electronAPI?.setProxy) {
                      await window.electronAPI.setProxy(port);
                    }
                  }}
                  className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  应用
                </button>
                {proxyPort.trim() && (
                  <button
                    onClick={async () => {
                      setProxyPort('');
                      localStorage.removeItem('linkmaster_proxy_port');
                      if (window.electronAPI?.setProxy) {
                        await window.electronAPI.setProxy(null);
                      }
                    }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>
              {proxyPort.trim() && (
                <p className="text-xs text-green-600 font-medium">✓ 已配置代理：127.0.0.1:{proxyPort}</p>
              )}
            </div>
          </div>

          {/* Section: Agent Shortcut */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              AI 助手快捷键
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">唤起快捷键</label>
                  <p className="text-xs text-gray-400">连按两下开启 / 关闭 AI 助手</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={agentShortcutKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAgentShortcutKey(val);
                      localStorage.setItem('linkmaster_agent_shortcut', val);
                      window.dispatchEvent(new Event('agent-shortcut-changed'));
                    }}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Meta">⌘ Command</option>
                    <option value="Control">⌃ Control</option>
                    <option value="Alt">⌥ Option</option>
                    <option value="Shift">⇧ Shift</option>
                  </select>
                  <span className="text-xs text-gray-400">× 2</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Browser Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              浏览器设置
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">起始默认页面</label>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    value={browserStartPage}
                    onChange={(e) => {
                      setBrowserStartPage(e.target.value);
                      localStorage.setItem('linkmaster_browser_start_page', e.target.value);
                    }}
                    placeholder="https://www.bing.com"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  />
                </div>
                <p className="text-xs text-gray-400">设置内置浏览器启动时默认打开的网页地址</p>
              </div>
            </div>
          </div>

          {/* Section: File Archive */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              文件管理设置
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">本地归档根目录</h4>
                  <p className="text-xs text-gray-400 mt-1">文件管理和学习模块的资源文件都将保存到此目录</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleSelectArchiveDir}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                    title="选择文件夹"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  {archivePath && (
                    <button 
                      onClick={() => window.electronAPI?.openPath(archivePath)}
                      className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                      title="在文件管理器中打开"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className={`text-xs font-mono border rounded-lg p-2 break-all flex items-center gap-2 ${archivePath ? 'bg-white border-gray-200 text-gray-600' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                {archivePath ? (
                  <span>{archivePath}</span>
                ) : (
                  <span>未设置 (请选择文件夹以启用归档功能)</span>
                )}
              </div>
            </div>

            {/* Obsidian Vault Path */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Obsidian Vault 路径</h4>
                  <p className="text-xs text-gray-400 mt-1">配置后可在文件管理中快速导入 Vault 中的笔记</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleSelectVaultDir}
                    className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                    title="选择 Vault 文件夹"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  {vaultPath && (
                    <button 
                      onClick={() => window.electronAPI?.openPath(vaultPath)}
                      className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                      title="在文件管理器中打开"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className={`text-xs font-mono border rounded-lg p-2 break-all flex items-center gap-2 ${vaultPath ? 'bg-white border-gray-200 text-gray-600' : 'bg-gray-100 border-gray-100 text-gray-400'}`}>
                {vaultPath ? (
                  <span>{vaultPath}</span>
                ) : (
                  <span>未设置 (可选)</span>
                )}
              </div>
            </div>
          </div>

          {/* Section: Data Management */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              数据管理
            </h3>
            
            {/* App Data Location */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-700">应用数据位置</h4>
                <p className="text-xs text-gray-400 mt-1">存储数据库文件和配置信息</p>
              </div>
              <button 
                onClick={async () => {
                  if (window.electronAPI) {
                    const path = await window.electronAPI.getUserDataPath();
                    window.electronAPI.openPath(path);
                  } else {
                    alert('Web 版本数据存储在浏览器 LocalStorage 中');
                  }
                }}
                className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                title="在 Finder 中打开"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">导出数据</h4>
                  <p className="text-xs text-gray-400 mt-1">导出全量数据为 JSON 备份（笔记、待办、学习、LeetCode 等全部模块）</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{isExporting ? '导出中…' : '导出 JSON'}</span>
                </button>
              </div>
              {isExporting && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{exportStep}</span>
                    <span>{exportProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
