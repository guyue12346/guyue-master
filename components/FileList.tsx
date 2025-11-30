
import React from 'react';
import { FileRecord } from '../types';
import { FileText, Image, FileCode, Archive, File, Edit2, Trash2, FolderOpen, AlertCircle, BookOpen } from 'lucide-react';

interface FileListProps {
  files: FileRecord[];
  onDelete: (id: string) => void;
  onEdit: (file: FileRecord) => void;
  onAddToRender?: (file: FileRecord) => void;
}

export const FileList: React.FC<FileListProps> = ({ files, onDelete, onEdit, onAddToRender }) => {
  
  const handleOpenFile = async (file: FileRecord) => {
    if (window.electronAPI && window.electronAPI.openPath) {
      const error = await window.electronAPI.openPath(file.path);
      if (error) {
        alert(`无法打开文件: ${error}\n路径: ${file.path}`);
      }
    } else {
      // Fallback for web demo
      alert(`正在尝试打开文件:\n${file.path || file.name}\n\n(注意: Web 版本无法直接调用本地程序，此为演示功能)`);
    }
  };

  const getFileIcon = (type: string) => {
    const t = type.toLowerCase().replace('.', '');
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(t)) return <Image className="w-8 h-8 text-purple-500" />;
    if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'java', 'go'].includes(t)) return <FileCode className="w-8 h-8 text-blue-500" />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(t)) return <Archive className="w-8 h-8 text-orange-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(t)) return <FileText className="w-8 h-8 text-red-500" />;
    return <File className="w-8 h-8 text-gray-400" />;
  };

  const getImportanceBadgeStyle = (val: number) => {
    if (val >= 80) return 'bg-red-50 text-red-600 border-red-100';
    if (val >= 50) return 'bg-orange-50 text-orange-600 border-orange-100';
    return 'bg-green-50 text-green-600 border-green-100';
  };

  const isRenderable = (type: string) => {
    const t = type.toLowerCase().replace('.', '');
    return ['pdf', 'md', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html'].includes(t);
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <FolderOpen className="w-10 h-10 text-blue-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无重要文件</h3>
        <p className="text-sm">点击右上角的 "+" 按钮添加文件记录。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
      {files.map((file) => (
        <div 
          key={file.id} 
          className="group relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 flex flex-col cursor-pointer hover:-translate-y-1 h-auto min-h-[140px]"
          onClick={() => handleOpenFile(file)}
        >
          {/* Header: Icon + Name + Actions */}
          <div className="flex items-center gap-3 mb-3">
             <div className="p-2 bg-gray-50 rounded-lg shrink-0">
               {getFileIcon(file.type)}
             </div>
             
             <div className="flex-1 min-w-0 flex justify-between items-start">
                 <h3 className="font-semibold text-gray-800 truncate pr-2 text-sm leading-tight pt-1" title={file.name}>
                   {file.name}
                 </h3>
                 
                 {/* Action Buttons */}
                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEdit(file); }} 
                      className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} 
                      className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                 </div>
             </div>
          </div>

          {/* Metadata Row: Size, Type, Category, Importance */}
          <div className="flex flex-wrap items-center gap-2 mb-3 px-0.5">
             <span className="text-[10px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
               {file.size || 'Unknown'}
             </span>
             
             <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
               {file.type}
             </span>
             
             <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 truncate max-w-[80px]">
               {file.category}
             </span>

             <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${getImportanceBadgeStyle(file.importance)}`}>
               <AlertCircle className="w-2.5 h-2.5" />
               {file.importance}
             </span>
          </div>

          {/* Footer: Note */}
          <div className="mt-auto pt-2 border-t border-gray-50">
            {file.note ? (
               <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                 {file.note}
               </p>
            ) : (
              <p className="text-[10px] text-gray-300 italic">暂无备注</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
