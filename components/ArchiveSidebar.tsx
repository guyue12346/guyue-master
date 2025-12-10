import React, { useState, useMemo } from 'react';
import { FileRecord, Category } from '../types';
import { Folder, ChevronRight, ChevronDown, FileText, Image, FileCode, Archive, File, Edit2, Trash2, AlertCircle, FolderPlus, Upload, FilePlus, Plus, Settings2 } from 'lucide-react';
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
  activeFileId: string | null;
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
  activeFileId
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

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

  const getCategoryIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.Folder;
    return <Icon className="w-4 h-4 text-blue-400 fill-blue-50" />;
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
  };

  // Initialize expanded folders (expand all by default)
  React.useEffect(() => {
    setExpandedFolders(new Set(Object.keys(groupedArchives)));
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
                {getCategoryIcon(category.icon)}
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
                      
                      {/* Hover Actions */}
                      <div className={`flex gap-1 shrink-0 ${activeFileId === file.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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
    </div>
  );
};
