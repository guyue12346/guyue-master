import React, { useState, useMemo } from 'react';
import { Search, CheckSquare, Square, ChevronRight, ChevronDown, FileText, X, Download, FolderOpen } from 'lucide-react';

export interface VaultFileEntry {
  name: string;
  path: string;
  relativePath: string;
  folder: string;
  fileType?: string;
}

interface VaultImportModalProps {
  files: VaultFileEntry[];
  onImport: (selected: VaultFileEntry[]) => void;
  onClose: () => void;
}

export const VaultImportModal: React.FC<VaultImportModalProps> = ({ files, onImport, onClose }) => {
  const [search, setSearch] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    // Default expand all folders
    return new Set(files.map(f => f.folder));
  });

  // Group files by folder
  const grouped = useMemo(() => {
    const map: Record<string, VaultFileEntry[]> = {};
    files.forEach(f => {
      const key = f.folder;
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    // Sort folders alphabetically
    const sorted: [string, VaultFileEntry[]][] = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    return sorted;
  }, [files]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map(([folder, entries]) => {
        const matched = entries.filter(
          e => e.name.toLowerCase().includes(q) || e.relativePath.toLowerCase().includes(q)
        );
        return [folder, matched] as [string, VaultFileEntry[]];
      })
      .filter(([, entries]) => entries.length > 0);
  }, [grouped, search]);

  const totalVisible = useMemo(() => filtered.reduce((s, [, e]) => s + e.length, 0), [filtered]);

  const toggleFile = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleFolder = (folderFiles: VaultFileEntry[]) => {
    const paths = folderFiles.map(f => f.path);
    const allSelected = paths.every(p => selectedPaths.has(p));
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (allSelected) {
        paths.forEach(p => next.delete(p));
      } else {
        paths.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const toggleExpandFolder = (folder: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const selectAll = () => {
    const allPaths = filtered.flatMap(([, entries]) => entries.map(e => e.path));
    setSelectedPaths(new Set(allPaths));
  };

  const deselectAll = () => {
    setSelectedPaths(new Set());
  };

  const allVisibleSelected = totalVisible > 0 && filtered.every(([, entries]) =>
    entries.every(e => selectedPaths.has(e.path))
  );

  const handleImport = () => {
    const selected = files.filter(f => selectedPaths.has(f.path));
    if (selected.length === 0) return;
    onImport(selected);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[200]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">从 Obsidian 导入</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              发现 {files.length} 篇新笔记，选择要导入的文件
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Search + Actions */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="搜索文件名..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
            />
          </div>
          <button
            onClick={allVisibleSelected ? deselectAll : selectAll}
            className="text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors whitespace-nowrap border border-gray-200"
          >
            {allVisibleSelected ? '取消全选' : '全选'}
          </button>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 scrollbar-thin scrollbar-thumb-gray-200">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12">无匹配结果</div>
          ) : (
            filtered.map(([folder, entries]) => {
              const folderAllSelected = entries.every(e => selectedPaths.has(e.path));
              const folderSomeSelected = entries.some(e => selectedPaths.has(e.path));
              const isExpanded = expandedFolders.has(folder);

              return (
                <div key={folder} className="mb-1">
                  {/* Folder header */}
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer select-none group"
                  >
                    <button
                      onClick={() => toggleExpandFolder(folder)}
                      className="p-0.5"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      }
                    </button>
                    <button
                      onClick={() => toggleFolder(entries)}
                      className="p-0.5"
                    >
                      {folderAllSelected
                        ? <CheckSquare className="w-4 h-4 text-blue-500" />
                        : folderSomeSelected
                          ? <div className="w-4 h-4 border-2 border-blue-400 rounded bg-blue-50 flex items-center justify-center">
                              <div className="w-2 h-1.5 bg-blue-400 rounded-sm" />
                            </div>
                          : <Square className="w-4 h-4 text-gray-300" />
                      }
                    </button>
                    <FolderOpen className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-gray-700 flex-1 truncate" onClick={() => toggleExpandFolder(folder)}>
                      {folder}
                    </span>
                    <span className="text-xs text-gray-400">{entries.length}</span>
                  </div>

                  {/* Files */}
                  {isExpanded && (
                    <div className="ml-5 pl-3 border-l border-gray-100 space-y-0.5 mt-0.5 mb-1">
                      {entries.map(entry => {
                        const isChecked = selectedPaths.has(entry.path);
                        return (
                          <div
                            key={entry.path}
                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer select-none transition-colors"
                            onClick={() => toggleFile(entry.path)}
                          >
                            {isChecked
                              ? <CheckSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                            }
                            <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate" title={entry.relativePath}>
                              {entry.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <span className="text-xs text-gray-400">
            已选择 <span className="font-medium text-gray-600">{selectedPaths.size}</span> / {totalVisible} 个文件
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={selectedPaths.size === 0}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              导入 {selectedPaths.size > 0 ? `(${selectedPaths.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
