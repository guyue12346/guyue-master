import React, { useState } from 'react';
import { Plus, Trash2, FolderOpen, ChevronRight, ChevronDown, FileText, Image, FileCode, Archive, File } from 'lucide-react';
import { FileRecord, Category } from '../types';

interface FileSidebarProps {
  files: FileRecord[];
  categories: Category[];
  selectedFileId: string | null;
  onSelectFile: (id: string) => void;
  onAddFile: () => void;
  onDeleteFile: (id: string, e: React.MouseEvent) => void;
}

export const FileSidebar: React.FC<FileSidebarProps> = ({
  files,
  categories,
  selectedFileId,
  onSelectFile,
  onAddFile,
  onDeleteFile
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['全部']));

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  // Group files by category
  const filesByCategory = files.reduce((acc, file) => {
    const cat = file.category || '未分类';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(file);
    return acc;
  }, {} as Record<string, FileRecord[]>);

  // Get all unique categories from files + defined categories
  const allCategoryNames = Array.from(new Set([
    ...categories.map(c => c.name),
    ...Object.keys(filesByCategory)
  ])).filter(name => name !== '全部');

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase().replace('.', '');
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(t)) return <Image className="w-3.5 h-3.5 text-purple-500" />;
    if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'java', 'go'].includes(t)) return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return <Archive className="w-3.5 h-3.5 text-orange-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(t)) return <FileText className="w-3.5 h-3.5 text-red-500" />;
    return <File className="w-3.5 h-3.5 text-gray-400" />;
  };

  return (
    <div className="w-64 bg-gray-50/80 backdrop-blur-xl border-r border-gray-200 flex flex-col h-full transition-all duration-300">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200/50 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold text-gray-700 flex items-center gap-2">
          <FolderOpen className="w-4 h-4" />
          重要文件
        </span>
        <button 
          onClick={onAddFile}
          className="p-1.5 hover:bg-gray-200/50 rounded-md text-gray-500 transition-colors"
          title="添加文件"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-10">
            暂无文件<br/>点击右上角添加
          </div>
        ) : (
          allCategoryNames.map(categoryName => {
            const categoryFiles = filesByCategory[categoryName] || [];
            if (categoryFiles.length === 0) return null;

            const isExpanded = expandedCategories.has(categoryName);

            return (
              <div key={categoryName} className="mb-1">
                <div 
                  className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200/50 rounded-md cursor-pointer"
                  onClick={() => toggleCategory(categoryName)}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                  <span>{categoryName}</span>
                  <span className="ml-auto text-xs text-gray-400">{categoryFiles.length}</span>
                </div>

                {isExpanded && (
                  <div className="ml-2 pl-2 border-l border-gray-200 mt-1 space-y-0.5">
                    {categoryFiles.map(file => (
                      <div
                        key={file.id}
                        onClick={() => onSelectFile(file.id)}
                        className={`group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-all text-sm ${
                          selectedFileId === file.id 
                            ? 'bg-blue-50 text-blue-600' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate flex-1">
                          {getFileIcon(file.type)}
                          <span className="truncate">{file.name}</span>
                        </div>
                        <button
                          onClick={(e) => onDeleteFile(file.id, e)}
                          className={`p-0.5 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ${
                            selectedFileId === file.id ? 'opacity-100' : ''
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
