import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileRecord, Category, KbTag, KbFileEntry } from '../types';
import { Folder, ChevronRight, ChevronDown, FileText, Image, FileCode, Archive, File, Edit2, Trash2, AlertCircle, FolderPlus, Upload, FilePlus, Plus, Settings2, BookOpen, HelpCircle, Brain, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface ArchiveSidebarProps {
  archives: FileRecord[];
  categories: Category[];
  onDelete: (id: string) => void;
  onEdit: (file: FileRecord) => void;
  onOpen: (file: FileRecord) => void;
  onCreateFolder: () => void;
  onUploadFile: () => void;
  onCreateNote: () => void;
  onCreateNoteInFolder: (folder: string) => void;
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (id: string) => void;
  onImportFromVault?: () => void;
  onHelp?: () => void;
  activeFileId: string | null;
  knowledgeBaseFileIds: Set<string>;
  kbTags: KbTag[];
  kbFileEntries: KbFileEntry[];
  onToggleKnowledgeBase: (fileId: string, tagIds?: string[]) => void;
  onSaveKbTags: (tags: KbTag[]) => void;
}

export const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({ 
  archives, 
  categories,
  onDelete, 
  onEdit, 
  onOpen, 
  onCreateFolder,
  onUploadFile,
  onCreateNote,
  onCreateNoteInFolder,
  onEditCategory,
  onDeleteCategory,
  onImportFromVault,
  onHelp,
  activeFileId,
  knowledgeBaseFileIds,
  kbTags,
  kbFileEntries,
  onToggleKnowledgeBase,
  onSaveKbTags,
}) => {
  const [tagPickerFileId, setTagPickerFileId] = useState<string | null>(null);
  const [tagPickerSelectedIds, setTagPickerSelectedIds] = useState<string[]>([]);
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [tagPickerMode, setTagPickerMode] = useState<'add' | 'manage'>('add');
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭标签选择弹出框
  useEffect(() => {
    if (!tagPickerFileId) return;
    const handler = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerFileId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagPickerFileId]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('guyue-archive-sidebar-expanded');
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch {}
    return new Set<string>();
  });

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase().replace('.', '');
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(t)) return <Image className="w-4 h-4 text-purple-500" />;
    if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'java', 'go'].includes(t)) return <FileCode className="w-4 h-4 text-blue-500" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return <Archive className="w-4 h-4 text-orange-500" />;
    if (['pdf'].includes(t)) return <FileText className="w-4 h-4 text-red-500" />;
    if (['md', 'markdown', 'txt'].includes(t)) return <FileText className="w-4 h-4 text-gray-500" />;
    if (['doc', 'docx'].includes(t)) return <FileText className="w-4 h-4 text-blue-700" />;
    return <File className="w-4 h-4 text-gray-400" />;
  };

  const getCategoryIcon = (iconName: string, color?: string) => {
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.Folder;
    if (color) {
      return <Icon className="w-4 h-4" color={color} />;
    }
    return <Icon className="w-4 h-4" color="#60a5fa" />;
  };

  // Group by category (Folder)
  const groupedArchives = useMemo(() => {
    const groups: Record<string, { files: FileRecord[], category: Category }> = {};
    
    // Initialize with all categories
    categories.forEach(cat => {
      if (cat.id !== 'all' && !cat.isSystem) {
        groups[cat.name] = { files: [], category: cat };
      }
    });

    // Add files to groups
    archives.forEach(file => {
      const folder = file.category || '未分类';
      if (groups[folder]) {
        groups[folder].files.push(file);
      } else {
        // Handle files in categories that might not be in the list (shouldn't happen usually)
        // or '未分类' if not in categories list
        if (!groups['未分类']) {
           // Find '未分类' category object or create dummy
           const uncat = categories.find(c => c.name === '未分类') || { id: 'uncategorized', name: '未分类', icon: 'Folder' };
           groups['未分类'] = { files: [], category: uncat };
        }
        groups['未分类'].files.push(file);
      }
    });
    
    return groups;
  }, [archives, categories]);

  const toggleFolder = (folder: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folder)) {
      newExpanded.delete(folder);
    } else {
      newExpanded.add(folder);
    }
    setExpandedFolders(newExpanded);
    localStorage.setItem('guyue-archive-sidebar-expanded', JSON.stringify([...newExpanded]));
  };

  // Expand all folders on first load only (when no saved state)
  React.useEffect(() => {
    const saved = localStorage.getItem('guyue-archive-sidebar-expanded');
    if (!saved) {
      const allKeys = Object.keys(groupedArchives);
      setExpandedFolders(new Set(allKeys));
      localStorage.setItem('guyue-archive-sidebar-expanded', JSON.stringify(allKeys));
    }
  }, [groupedArchives]);

  return (
    <div className="w-64 h-full flex-shrink-0 bg-macOS-sidebar backdrop-blur-xl border-r border-macOS-border flex flex-col pt-6 pb-4 px-3 z-20">
      
      {/* Header */}
      <div className="px-2 mb-6" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">
          文件管理
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          File Management
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 mb-4">
        <button 
          onClick={onCreateFolder}
          className="p-1.5 text-gray-500 hover:bg-gray-200/50 rounded-lg transition-colors"
          title="新建文件夹"
        >
          <FolderPlus className="w-4 h-4" />
        </button>
        <button 
          onClick={onUploadFile}
          className="p-1.5 text-gray-500 hover:bg-gray-200/50 rounded-lg transition-colors"
          title="上传文件"
        >
          <Upload className="w-4 h-4" />
        </button>
        <button 
          onClick={onCreateNote}
          className="p-1.5 text-gray-500 hover:bg-gray-200/50 rounded-lg transition-colors"
          title="新建笔记"
        >
          <FilePlus className="w-4 h-4" />
        </button>
        {onImportFromVault && (
          <button 
            onClick={onImportFromVault}
            className="p-1.5 text-gray-500 hover:bg-gray-200/50 rounded-lg transition-colors"
            title="从 Obsidian Vault 导入"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        )}
        {onHelp && (
          <button
            onClick={onHelp}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-200/50 rounded-lg transition-colors"
            title="使用帮助"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300 pr-1">
        {Object.entries(groupedArchives).length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8">
            暂无文件
          </div>
        ) : (
          Object.entries(groupedArchives).map(([folderName, { files, category }]) => (
            <div key={folderName}>
              {/* Folder Item */}
              <div 
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-black/5 transition-colors group"
                onClick={() => toggleFolder(folderName)}
              >
                {expandedFolders.has(folderName) ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                )}
                {getCategoryIcon(category.icon, category.color)}
                <span className="flex-1 text-sm text-gray-700 truncate font-medium">{folderName}</span>
                {/* Folder Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateNoteInFolder(folderName);
                    }}
                    className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500 transition-all"
                    title="新建 Markdown 笔记"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Files in Folder */}
              {expandedFolders.has(folderName) && (
                <div className="ml-3 pl-3 border-l border-gray-200/50 mt-0.5 space-y-0.5">
                  {files.map((file) => (
                    <div 
                      key={file.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        activeFileId === file.id 
                          ? 'bg-blue-50 text-blue-600' 
                          : 'hover:bg-black/5 text-gray-600'
                      }`}
                      onClick={() => onOpen(file)}
                    >
                      <div className="shrink-0">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="flex-1 min-w-0" title={file.note ? `${file.name}\n备注: ${file.note}` : file.name}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs truncate font-medium">{file.name}</span>
                          {file.importance >= 80 && (
                            <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                          )}
                        </div>
                      </div>
                      
                      {/* 知识库状态：已加入时常驻显示图标（颜色/图标跟随第一个标签）*/}
                      {knowledgeBaseFileIds.has(file.id) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const entry = kbFileEntries.find(en => en.fileId === file.id);
                            setTagPickerSelectedIds(entry?.tagIds ?? []);
                            setTagPickerPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 216) });
                            setTagPickerMode('manage');
                            setTagPickerFileId(tagPickerFileId === file.id ? null : file.id);
                          }}
                          className={`p-1 rounded transition-colors shrink-0 ${
                            tagPickerFileId === file.id
                              ? 'bg-green-100 ring-1 ring-green-300'
                              : 'bg-green-50 hover:bg-green-100'
                          }`}
                          title="已加入知识库（点击管理标签）"
                        >
                          {(() => {
                            const entry = kbFileEntries.find(en => en.fileId === file.id);
                            const firstTag = entry?.tagIds?.[0] ? kbTags.find(t => t.id === entry!.tagIds[0]) : null;
                            const TIcon = firstTag?.icon ? (LucideIcons as any)[firstTag.icon] : null;
                            return TIcon
                              ? <TIcon className="w-3 h-3" style={{ color: firstTag!.color }} />
                              : <Brain className="w-3 h-3 text-green-500" />;
                          })()}
                        </button>
                      ) : null}

                      {/* Hover Actions */}
                      <div className={`flex gap-1 shrink-0 ${activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {!knowledgeBaseFileIds.has(file.id) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTagPickerSelectedIds([]);
                              setTagPickerPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 216) });
                              setTagPickerMode('add');
                              setTagPickerFileId(tagPickerFileId === file.id ? null : file.id);
                            }}
                            className="p-1 rounded transition-colors text-gray-400 hover:text-green-500 hover:bg-green-50"
                            title="加入知识库"
                          >
                            <Brain className="w-3 h-3" />
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEdit(file); }} 
                          className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-blue-600"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} 
                          className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 知识库标签选择弹出框（fixed portal，避免被 sidebar overflow 和 backdrop-filter 裁剪）*/}
      {tagPickerFileId && createPortal(
        <div
          ref={tagPickerRef}
          style={{ position: 'fixed', top: tagPickerPos.top, left: tagPickerPos.left, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-52 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-green-50/80">
            <Brain className="w-3.5 h-3.5 text-green-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-700">
              {tagPickerMode === 'manage' ? '管理标签' : '加入知识库'}
            </span>
          </div>

          {/* Vertical tag list */}
          <div className="py-1 max-h-56 overflow-y-auto">
            {kbTags.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-3">
                {tagPickerMode === 'add' ? '直接加入（暂无标签）' : '暂无标签'}
              </p>
            ) : (
              <>
                {/* 不分类 option */}
                <button
                  onClick={() => setTagPickerSelectedIds([])}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                    tagPickerSelectedIds.length === 0
                      ? 'bg-gray-100 text-gray-700 font-medium'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    {tagPickerSelectedIds.length === 0 && <Check className="w-3 h-3 text-gray-600" />}
                  </span>
                  <span className="flex-1 text-left">不分类</span>
                </button>

                {/* Tag rows */}
                {kbTags.map(tag => {
                  const sel = tagPickerSelectedIds.includes(tag.id);
                  const TIcon = tag.icon ? (LucideIcons as any)[tag.icon] : null;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => setTagPickerSelectedIds(prev =>
                        prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                      )}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-gray-50"
                      style={sel ? { background: tag.color + '18' } : {}}
                    >
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                        style={{ background: sel ? tag.color : tag.color + '33' }}
                      >
                        {TIcon
                          ? <TIcon className="w-3 h-3" style={{ color: sel ? 'white' : tag.color }} />
                          : sel
                            ? <Check className="w-3 h-3 text-white" />
                            : null
                        }
                      </span>
                      <span
                        className="flex-1 text-left font-medium truncate"
                        style={{ color: sel ? tag.color : undefined }}
                      >{tag.name}</span>
                      {sel && <Check className="w-3 h-3 shrink-0" style={{ color: tag.color }} />}
                    </button>
                  );
                })}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 px-2.5 py-2 border-t border-gray-100 bg-gray-50/70">
            {tagPickerMode === 'manage' ? (
              <>
                <button
                  onClick={() => {
                    if (tagPickerFileId) onToggleKnowledgeBase(tagPickerFileId);
                    setTagPickerFileId(null);
                  }}
                  className="flex-1 text-xs py-1.5 text-red-500 hover:bg-red-50 rounded-lg border border-red-100 hover:border-red-200 transition-colors font-medium"
                >移出知识库</button>
                <button
                  onClick={() => {
                    if (tagPickerFileId) onToggleKnowledgeBase(tagPickerFileId, tagPickerSelectedIds);
                    setTagPickerFileId(null);
                  }}
                  className="flex-1 text-xs py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg transition-colors font-medium shadow-sm"
                >保存</button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setTagPickerFileId(null)}
                  className="flex-1 text-xs py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors font-medium"
                >取消</button>
                <button
                  onClick={() => {
                    if (tagPickerFileId) onToggleKnowledgeBase(tagPickerFileId, tagPickerSelectedIds);
                    setTagPickerFileId(null);
                  }}
                  className="flex-1 text-xs py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg transition-colors font-medium shadow-sm"
                >加入</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
