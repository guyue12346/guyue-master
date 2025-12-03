import React, { useState } from 'react';
import { FileRecord } from '../types';
import { FileText, Image, FileCode, Archive, File, Edit2, Trash2, Folder, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react';

interface ArchiveListProps {
  archives: FileRecord[];
  onDelete: (id: string) => void;
  onEdit: (file: FileRecord) => void;
  onOpen: (file: FileRecord) => void;
}

export const ArchiveList: React.FC<ArchiveListProps> = ({ archives, onDelete, onEdit, onOpen }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase().replace('.', '');
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(t)) return <Image className="w-5 h-5 text-purple-500" />;
    if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'java', 'go'].includes(t)) return <FileCode className="w-5 h-5 text-blue-500" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return <Archive className="w-5 h-5 text-orange-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'markdown'].includes(t)) return <FileText className="w-5 h-5 text-red-500" />;
    return <File className="w-5 h-5 text-gray-400" />;
  };

  const getImportanceBadgeStyle = (val: number) => {
    if (val >= 80) return 'bg-red-50 text-red-600 border-red-100';
    if (val >= 50) return 'bg-orange-50 text-orange-600 border-orange-100';
    return 'bg-green-50 text-green-600 border-green-100';
  };

  // Group by category (Folder)
  const groupedArchives = React.useMemo(() => {
    const groups: Record<string, FileRecord[]> = {};
    archives.forEach(file => {
      const folder = file.category || '未分类';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(file);
    });
    return groups;
  }, [archives]);

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

  if (archives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Folder className="w-10 h-10 text-blue-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无归档文件</h3>
        <p className="text-sm">请点击右上角按钮创建文件夹或上传文件</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {Object.entries(groupedArchives).map(([folder, files]) => (
        <div key={folder} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Folder Header */}
          <div 
            className="flex items-center gap-2 p-3 bg-gray-50/50 cursor-pointer hover:bg-gray-50 transition-colors select-none"
            onClick={() => toggleFolder(folder)}
          >
            {expandedFolders.has(folder) ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
            <Folder className="w-5 h-5 text-blue-400 fill-blue-50" />
            <span className="font-medium text-gray-700">{folder}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {files.length}
            </span>
          </div>

          {/* File List */}
          {expandedFolders.has(folder) && (
            <div className="divide-y divide-gray-50">
              {files.map((file) => (
                <div 
                  key={file.id}
                  className="group flex items-center gap-4 p-3 hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => onOpen(file)}
                >
                  <div className="shrink-0">
                    {getFileIcon(file.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700 truncate">{file.name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${getImportanceBadgeStyle(file.importance)}`}>
                      <AlertCircle className="w-3 h-3" />
                      {file.importance}
                    </span>
                    
                    <span className="text-xs text-gray-400 font-mono w-16 text-right">
                      {file.size}
                    </span>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(file); }} 
                        className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} 
                        className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
