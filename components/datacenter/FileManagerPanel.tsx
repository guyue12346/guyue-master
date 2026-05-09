import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  BookmarkX,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  FileSearch,
  FileText,
  Folder,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
} from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
  size?: number;
  mtime?: number | null;
}

interface MarkedPath {
  name: string;
  path: string;
  isDirectory: boolean;
  addedAt: number;
  note?: string;
}

const RECENT_ROOTS_KEY = 'datacenter_file_manager_recent_roots';
const LAST_ROOT_KEY = 'datacenter_file_manager_last_root';
const MARKED_PATHS_KEY = 'datacenter_file_manager_marked_paths';

function dirname(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function loadRecentRoots(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ROOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentRoots(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return;
  const next = [trimmed, ...loadRecentRoots().filter(item => item !== trimmed)].slice(0, 8);
  localStorage.setItem(RECENT_ROOTS_KEY, JSON.stringify(next));
  localStorage.setItem(LAST_ROOT_KEY, trimmed);
}

function loadMarkedPaths(): MarkedPath[] {
  try {
    const raw = localStorage.getItem(MARKED_PATHS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistMarkedPaths(paths: MarkedPath[]) {
  localStorage.setItem(MARKED_PATHS_KEY, JSON.stringify(paths));
}

function formatBytes(size?: number): string {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatMtime(value?: number | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

export const FileManagerPanel: React.FC = () => {
  const [rootPath, setRootPath] = useState(() => localStorage.getItem(LAST_ROOT_KEY) || '');
  const [pathInput, setPathInput] = useState(() => localStorage.getItem(LAST_ROOT_KEY) || '');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [searchText, setSearchText] = useState('');
  const [recentRoots, setRecentRoots] = useState<string[]>(loadRecentRoots);
  const [markedPaths, setMarkedPaths] = useState<MarkedPath[]>(loadMarkedPaths);
  const [isLoadingDir, setIsLoadingDir] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = fileContent !== savedContent;

  const isMarked = useCallback((path: string) => markedPaths.some(item => item.path === path), [markedPaths]);

  const updateMarkedPaths = useCallback((updater: (items: MarkedPath[]) => MarkedPath[]) => {
    setMarkedPaths(prev => {
      const next = updater(prev);
      persistMarkedPaths(next);
      return next;
    });
  }, []);

  const toggleMark = useCallback((target: { path: string; name?: string; isDirectory: boolean }) => {
    const targetPath = target.path.trim();
    if (!targetPath) return;
    updateMarkedPaths(items => {
      if (items.some(item => item.path === targetPath)) {
        return items.filter(item => item.path !== targetPath);
      }
      return [
        {
          name: target.name || basename(targetPath),
          path: targetPath,
          isDirectory: target.isDirectory,
          addedAt: Date.now(),
          note: '',
        },
        ...items,
      ].slice(0, 40);
    });
  }, [updateMarkedPaths]);

  const updateMarkedNote = useCallback((path: string, note: string) => {
    updateMarkedPaths(items => items.map(item => item.path === path ? { ...item, note } : item));
  }, [updateMarkedPaths]);

  const loadDirectory = useCallback(async (dirPath: string) => {
    const path = dirPath.trim();
    if (!path) return;
    if (!window.electronAPI?.listDir) {
      setError('仅在桌面端可用');
      return;
    }

    setIsLoadingDir(true);
    setError(null);
    setNotice(null);
    try {
      const result = await window.electronAPI.listDir(path);
      setEntries(sortEntries(result || []));
      setRootPath(path);
      setPathInput(path);
      saveRecentRoots(path);
      setRecentRoots(loadRecentRoots());
    } catch (e) {
      setError((e as Error).message || '读取目录失败');
    } finally {
      setIsLoadingDir(false);
    }
  }, []);

  const openFile = useCallback(async (filePath: string) => {
    const path = filePath.trim();
    if (!path) return;
    if (!window.electronAPI?.readFile) {
      setError('仅在桌面端可用');
      return;
    }

    setIsLoadingFile(true);
    setError(null);
    setNotice(null);
    try {
      const content = await window.electronAPI.readFile(path);
      if (content === null || content === undefined) {
        setError('文件读取失败，可能不是文本文件或权限不足');
        return;
      }
      setActiveFilePath(path);
      setFileContent(content);
      setSavedContent(content);
      const parent = dirname(path);
      if (parent && parent !== rootPath) {
        void loadDirectory(parent);
      }
    } catch (e) {
      setError((e as Error).message || '文件读取失败');
    } finally {
      setIsLoadingFile(false);
    }
  }, [loadDirectory, rootPath]);

  const openInputPath = useCallback(async () => {
    const target = pathInput.trim();
    if (!target) return;
    setError(null);
    setNotice(null);
    try {
      const stats = await window.electronAPI?.getFileStats?.(target);
      if (!stats) {
        setError('路径不存在或无权访问');
        return;
      }
      if (stats.isDirectory) {
        await loadDirectory(target);
      } else {
        await openFile(target);
      }
    } catch (e) {
      setError((e as Error).message || '无法打开路径');
    }
  }, [loadDirectory, openFile, pathInput]);

  const openMarkedPath = useCallback(async (item: MarkedPath) => {
    setError(null);
    setNotice(null);
    try {
      const stats = await window.electronAPI?.getFileStats?.(item.path);
      if (!stats) {
        setError('标记的路径不存在或无权访问');
        return;
      }
      if (stats.isDirectory) {
        await loadDirectory(item.path);
      } else {
        await openFile(item.path);
      }
    } catch (e) {
      setError((e as Error).message || '无法打开标记路径');
    }
  }, [loadDirectory, openFile]);

  const selectFolder = async () => {
    const selected = await window.electronAPI?.selectDirectory?.();
    if (selected) await loadDirectory(selected);
  };

  const selectFile = async () => {
    const selected = await window.electronAPI?.selectFile?.();
    if (selected?.path) await openFile(selected.path);
  };

  const saveFile = async () => {
    if (!activeFilePath || !dirty) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const ok = await window.electronAPI?.writeFile?.(activeFilePath, fileContent);
      if (!ok) {
        setError('保存失败，请检查文件权限');
        return;
      }
      setSavedContent(fileContent);
      setNotice('已保存');
      void loadDirectory(dirname(activeFilePath));
    } catch (e) {
      setError((e as Error).message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (rootPath) void loadDirectory(rootPath);
  }, []);

  const filteredEntries = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter(entry => entry.name.toLowerCase().includes(query));
  }, [entries, searchText]);

  const activeName = activeFilePath ? basename(activeFilePath) : '';
  const parentPath = rootPath ? dirname(rootPath) : '';
  const rootMarked = rootPath ? isMarked(rootPath) : false;
  const activeFileMarked = activeFilePath ? isMarked(activeFilePath) : false;

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-sky-600 dark:bg-sky-500 flex items-center justify-center">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">文件管理</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{rootPath || '未打开文件夹'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={selectFolder}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <Folder className="w-3.5 h-3.5" />
              打开文件夹
            </button>
            <button
              onClick={selectFile}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <FileText className="w-3.5 h-3.5" />
              打开文件
            </button>
            <button
              onClick={() => rootPath && loadDirectory(rootPath)}
              disabled={!rootPath || isLoadingDir}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDir ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={() => rootPath && toggleMark({ path: rootPath, name: basename(rootPath), isDirectory: true })}
              disabled={!rootPath}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50 ${rootMarked ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
            >
              {rootMarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
              标记文件夹
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 xl:flex-row">
          <div className="flex min-w-0 flex-1">
            <input
              value={pathInput}
              onChange={event => setPathInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void openInputPath(); }}
              placeholder="/Users/you/.config/app/config.json"
              className="min-w-0 flex-1 rounded-l-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-400"
            />
            <button
              onClick={openInputPath}
              className="px-3 py-2 rounded-r-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              打开路径
            </button>
          </div>
          {recentRoots.length > 0 && (
            <select
              value=""
              onChange={event => {
                if (event.target.value) void loadDirectory(event.target.value);
              }}
              className="min-w-[220px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 outline-none focus:border-blue-400"
            >
              <option value="">最近文件夹</option>
              {recentRoots.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {(error || notice) && (
        <div className={`shrink-0 px-4 py-2 text-xs flex items-center gap-2 border-b ${error ? 'bg-red-50 border-red-100 text-red-700 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-300' : 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800/40 dark:text-emerald-300'}`}>
          {error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          <span>{error || notice}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-h-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
          <div className="shrink-0 border-b border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-3.5 h-3.5 text-sky-500" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">标记列表</span>
              </div>
              <span className="text-[10px] text-gray-400">{markedPaths.length}</span>
            </div>
            <div className="max-h-44 overflow-auto px-2 pb-2">
              {markedPaths.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-4 text-center text-xs text-gray-400">
                  标记常用文件或文件夹后会显示在这里
                </div>
              ) : (
                <div className="space-y-1">
                  {markedPaths.map(item => (
                    <div
                      key={item.path}
                      className="group rounded-lg px-2 py-2 hover:bg-white dark:hover:bg-gray-700/60"
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => openMarkedPath(item)}
                          className="min-w-0 flex-1 text-left"
                          title={item.path}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {item.isDirectory
                              ? <Folder className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                              : <FileCode2 className="w-3.5 h-3.5 shrink-0 text-gray-400" />}
                            <span className="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                          </div>
                          <p className="mt-0.5 truncate pl-5 text-[10px] text-gray-400">{item.path}</p>
                        </button>
                        <button
                          onClick={() => toggleMark(item)}
                          className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-600"
                          title="取消标记"
                        >
                          <BookmarkX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={item.note || ''}
                        onChange={(event) => updateMarkedNote(item.path, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        placeholder="添加备注"
                        className="mt-2 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200 outline-none focus:border-sky-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={searchText}
                  onChange={event => setSearchText(event.target.value)}
                  placeholder="搜索当前目录"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 pl-8 pr-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-400"
                />
              </div>
              <button
                onClick={() => parentPath && parentPath !== rootPath && loadDirectory(parentPath)}
                disabled={!parentPath || parentPath === rootPath}
                className="px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                上级
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {!rootPath && (
              <div className="p-6 text-center text-xs text-gray-400">选择文件夹或输入路径</div>
            )}
            {rootPath && filteredEntries.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-400">{isLoadingDir ? '读取中...' : '当前目录为空'}</div>
            )}
            {filteredEntries.map(entry => {
              const hidden = entry.name.startsWith('.');
              const active = activeFilePath === entry.path;
              const marked = isMarked(entry.path);
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={entry.path}
                  onClick={() => entry.isDirectory ? loadDirectory(entry.path) : openFile(entry.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      entry.isDirectory ? loadDirectory(entry.path) : openFile(entry.path);
                    }
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/60 hover:bg-white dark:hover:bg-gray-700/50 transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.isDirectory
                      ? <Folder className={`w-4 h-4 shrink-0 ${hidden ? 'text-amber-500' : 'text-blue-500'}`} />
                      : <FileCode2 className={`w-4 h-4 shrink-0 ${hidden ? 'text-amber-500' : 'text-gray-400'}`} />}
                    <span className={`truncate text-sm ${active ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-800 dark:text-gray-200'}`}>
                      {entry.name}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMark({ path: entry.path, name: entry.name, isDirectory: entry.isDirectory });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleMark({ path: entry.path, name: entry.name, isDirectory: entry.isDirectory });
                        }
                      }}
                      className={`ml-auto shrink-0 rounded-md p-1 transition-colors ${marked ? 'text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20' : 'text-gray-300 hover:bg-gray-100 hover:text-sky-500 dark:hover:bg-gray-700'}`}
                      title={marked ? '取消标记' : '标记'}
                    >
                      {marked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </span>
                    {hidden && (
                      <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">隐藏</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 pl-6 text-[10px] text-gray-400 dark:text-gray-500">
                    <span>{entry.isDirectory ? '文件夹' : formatBytes(entry.size)}</span>
                    <span>{formatMtime(entry.mtime)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 flex flex-col bg-white dark:bg-gray-900">
          <div className="shrink-0 min-h-[57px] border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{activeName || '未打开文件'}</h3>
                {dirty && <span className="shrink-0 rounded bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 text-[10px] text-orange-700 dark:text-orange-300">未保存</span>}
              </div>
              {activeFilePath && <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{activeFilePath}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => activeFilePath && toggleMark({ path: activeFilePath, name: activeName, isDirectory: false })}
                disabled={!activeFilePath}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50 ${activeFileMarked ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                {activeFileMarked ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                标记
              </button>
              <button
                onClick={() => activeFilePath && openFile(activeFilePath)}
                disabled={!activeFilePath || isLoadingFile}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                重载
              </button>
              <button
                onClick={() => activeFilePath && window.electronAPI?.openPath?.(activeFilePath)}
                disabled={!activeFilePath}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                系统打开
              </button>
              <button
                onClick={saveFile}
                disabled={!activeFilePath || !dirty || isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? '保存中' : '保存'}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {activeFilePath ? (
              <textarea
                value={fileContent}
                onChange={event => setFileContent(event.target.value)}
                spellCheck={false}
                className="h-full w-full resize-none border-0 bg-white dark:bg-gray-950 p-4 font-mono text-sm leading-6 text-gray-900 dark:text-gray-100 outline-none"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                {isLoadingFile ? '读取文件中...' : '从左侧选择文件，或直接输入文件路径'}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default FileManagerPanel;
