
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, FileDown, FolderOpen, ToggleLeft, ToggleRight, AlertCircle, ChevronDown, Globe, Package, Plus, Trash2 } from 'lucide-react';
import { Bookmark, Category, Note, SSHRecord, APIRecord, TodoItem, FileRecord, ModuleConfig, AVAILABLE_ICONS, PluginMetadata } from '../types';
import * as LucideIcons from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Bookmark[];
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
  bookmarks,
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
  const [localModules, setLocalModules] = useState<ModuleConfig[]>([]);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [openIconSelectorId, setOpenIconSelectorId] = useState<string | null>(null);
  const [browserStartPage, setBrowserStartPage] = useState<string>('');
  const [plugins, setPlugins] = useState<PluginMetadata[]>([]);
  const iconSelectorRef = useRef<HTMLDivElement>(null);

  // Sort modules by priority for display
  const sortedModules = useMemo(() => {
    return [...localModules].sort((a, b) => a.priority - b.priority);
  }, [localModules]);

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
    
    const savedStartPage = localStorage.getItem('linkmaster_browser_start_page');
    if (savedStartPage) setBrowserStartPage(savedStartPage);
    else setBrowserStartPage('https://www.bing.com');

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
    if (moduleConfig.length > 0) {
      setLocalModules(JSON.parse(JSON.stringify(moduleConfig)));
    }
  }, [moduleConfig, isOpen]);

  const handleModuleToggle = (id: string) => {
    const updated = localModules.map(m => 
      m.id === id ? { ...m, enabled: !m.enabled } : m
    );
    setLocalModules(updated);
    validateAndSave(updated);
  };

  const handlePriorityChange = (id: string, newPriority: number) => {
    const safeValue = Number.isFinite(newPriority) ? Math.min(100, Math.max(1, newPriority)) : 1;
    const updated = localModules.map(m => 
      m.id === id ? { ...m, priority: safeValue } : m
    );
    setLocalModules(updated);
    validateAndSave(updated);
  };

  const handleShortcutChange = (id: string, newShortcut: string) => {
    const updated = localModules.map(m => 
      m.id === id ? { ...m, shortcut: newShortcut } : m
    );
    setLocalModules(updated);
    validateAndSave(updated);
  };

  const handleIconChange = (id: string, newIcon: string) => {
    const updated = localModules.map(m => 
      m.id === id ? { ...m, icon: newIcon } : m
    );
    setLocalModules(updated);
    validateAndSave(updated);
    setOpenIconSelectorId(null);
  };

  const validateAndSave = (modules: ModuleConfig[]) => {
    // Check for duplicate priorities among ENABLED modules
    const enabledModules = modules.filter(m => m.enabled);
    const priorities = enabledModules.map(m => m.priority);
    const hasDuplicates = new Set(priorities).size !== priorities.length;

    if (hasDuplicates) {
      setPriorityError('启用的功能优先级不能重复');
      // We still update local state but don't push to parent yet? 
      // Or we push but parent handles it? 
      // Requirement: "启用的功能的优先级不能相同"
      // Let's just show error and NOT save to parent if invalid.
      return;
    } else {
      setPriorityError(null);
      if (onUpdateModules) {
        onUpdateModules(modules);
      }
    }
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
  
  const handleExportMarkdown = () => {
    // 1. Header
    const dateStr = new Date().toISOString().split('T')[0];
    let mdContent = `# LinkMaster Backup\n> Exported on ${dateStr}\n\n`;

    // 2. Export Bookmarks
    mdContent += `# Bookmarks\n\n`;
    
    const validCategories = categories.filter(c => c.id !== 'all' && c.name !== '全部');

    validCategories.forEach(cat => {
      const catBookmarks = bookmarks.filter(b => b.category === cat.name);
      
      if (catBookmarks.length > 0) {
        mdContent += `## ${cat.name}\n\n`;
        
        catBookmarks.forEach(b => {
            const noteText = b.note ? ` - ${b.note}` : '';
            mdContent += `- [${b.title}](${b.url})${noteText}\n`;
        });
        
        mdContent += `\n`;
      }
    });

    // Uncategorized Bookmarks
    const processedIds = new Set(validCategories.flatMap(c => bookmarks.filter(b => b.category === c.name).map(b => b.id)));
    const uncategorized = bookmarks.filter(b => !processedIds.has(b.id));

    if (uncategorized.length > 0) {
       mdContent += `## Uncategorized\n\n`;
       uncategorized.forEach(b => {
          mdContent += `- [${b.title}](${b.url}) - ${b.note || ''}\n`;
       });
       mdContent += `\n`;
    }

    // 3. Export SSH Records
    if (sshRecords.length > 0) {
      mdContent += `---\n\n# SSH Records\n\n`;
      mdContent += `| Hostname | Address | User | Port | Note |\n`;
      mdContent += `| --- | --- | --- | --- | --- |\n`;
      sshRecords.forEach(rec => {
        mdContent += `| ${rec.title} | ${rec.host} | ${rec.username} | ${rec.port} | ${rec.note} |\n`;
      });
      mdContent += `\n`;
    }

    // 4. Export API Records
    if (apiRecords.length > 0) {
      mdContent += `---\n\n# API Records\n\n`;
      apiRecords.forEach(rec => {
        mdContent += `### ${rec.title} (${rec.method})\n`;
        mdContent += `- **URL**: \`${rec.baseUrl}${rec.endpoint}\`\n`;
        mdContent += `- **Key**: \`${rec.apiKey}\`\n`;
        if (rec.usage) mdContent += `- **Usage**: \`${rec.usage}\`\n`;
        if (rec.note) mdContent += `- **Note**: ${rec.note}\n`;
        mdContent += `\n`;
      });
    }

    // 5. Export Notes
    if (notes.length > 0) {
      mdContent += `---\n\n# Notes\n\n`;
      notes.forEach(note => {
        mdContent += `### Note (${new Date(note.createdAt).toLocaleString()})\n`;
        mdContent += `${note.content}\n\n`;
      });
    }

    // 6. Export Todos
    if (todos.length > 0) {
      mdContent += `---\n\n# ToDos\n\n`;
      todos.forEach(todo => {
        const status = todo.isCompleted ? '[x]' : '[ ]';
        const due = todo.dueDate ? ` (Due: ${new Date(todo.dueDate).toLocaleDateString()})` : '';
        const priority = `[${todo.priority.toUpperCase()}]`;
        mdContent += `- ${status} ${priority} ${todo.content}${due}\n`;
      });
    }

    // 7. Export Files
    if (fileRecords.length > 0) {
      mdContent += `---\n\n# Important Files\n\n`;
      mdContent += `| Name | Size | Type | Importance | Note |\n`;
      mdContent += `| --- | --- | --- | --- | --- |\n`;
      fileRecords.forEach(file => {
        mdContent += `| ${file.name} | ${file.size} | ${file.type} | ${file.importance} | ${file.note} |\n`;
      });
    }

    // 8. Trigger Download
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LinkMaster_Backup_${dateStr}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          
          {/* Section: Module Management */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-2">
              功能模块管理
            </h3>
            
            {priorityError && (
              <div className="bg-red-50 text-red-600 text-xs p-2 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {priorityError}
              </div>
            )}

            <div className="rounded-xl border border-gray-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-16 text-center">启用</th>
                    <th className="px-4 py-3">模块名称</th>
                    <th className="px-4 py-3 w-24 text-center">图标</th>
                    <th className="px-4 py-3 w-28 text-center">快捷键</th>
                    <th className="px-4 py-3 w-20 text-center">优先级</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sortedModules.map(module => (
                    <tr key={module.id} className="hover:bg-gray-50/50 transition-colors">
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
                        <input 
                          type="number" 
                          min="1" 
                          max="100"
                          value={module.priority}
                          onChange={(e) => handlePriorityChange(module.id, parseInt(e.target.value) || 0)}
                          className={`w-full px-2 py-1 text-sm border rounded-lg text-center outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 ${
                            priorityError && module.enabled ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                          } ${!module.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={!module.enabled}
                        />
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
                  <p className="text-xs text-gray-400 mt-1">上传的文件将按分类整理到此目录</p>
                </div>
                <button 
                  onClick={handleSelectArchiveDir}
                  className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all text-gray-600"
                  title="选择文件夹"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
              
              <div className={`text-xs font-mono border rounded-lg p-2 break-all flex items-center gap-2 ${archivePath ? 'bg-white border-gray-200 text-gray-600' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                {archivePath ? (
                  <span>{archivePath}</span>
                ) : (
                  <span>未设置 (请选择文件夹以启用归档功能)</span>
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
                title="打开数据文件夹"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-700">导出数据</h4>
                <p className="text-xs text-gray-400 mt-1">导出所有数据为 Markdown</p>
              </div>
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-all shadow-sm active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                <span>导出 .md</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
