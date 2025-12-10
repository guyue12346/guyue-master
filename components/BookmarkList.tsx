
import React from 'react';
import { Bookmark } from '../types';
import { ExternalLink, Edit2, Trash2, Globe } from 'lucide-react';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  onDelete: (id: string) => void;
  onEdit: (bookmark: Bookmark) => void;
  onOpenInBrowser: (url: string) => void;
}

export const BookmarkList: React.FC<BookmarkListProps> = ({ bookmarks, onDelete, onEdit, onOpenInBrowser }) => {
  const handleOpen = (bm: Bookmark) => {
    // Standard open in new tab behavior (Default Browser)
    if (window.electronAPI) {
      window.electronAPI.openPath(bm.url);
    } else {
      window.open(bm.url, '_blank');
    }
  };

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Globe className="w-10 h-10 text-gray-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无书签</h3>
        <p className="text-sm">点击右上角的 "+" 按钮添加您的第一个收藏。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
      {bookmarks.map((bm) => (
        <div 
          key={bm.id} 
          className="group relative bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col min-h-[10rem]"
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider border border-gray-100 px-1.5 py-0.5 rounded-md">
                {bm.category}
              </span>
            </div>
            
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onEdit(bm); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(bm.id); }} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 cursor-pointer" onClick={() => handleOpen(bm)}>
            <h3 className="font-semibold text-gray-800 line-clamp-1 mb-1 group-hover:text-blue-600 transition-colors">
              {bm.title}
            </h3>
            <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">
              {bm.note || "暂无备注"}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between items-center text-xs text-gray-400">
             <span className="font-mono text-[10px] truncate max-w-[70%] opacity-60">{new URL(bm.url).hostname}</span>
             <button 
                onClick={(e) => { e.stopPropagation(); onOpenInBrowser(bm.url); }}
                className="flex items-center gap-1 text-blue-500 font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                title="在内置浏览器中打开"
             >
               访问 <ExternalLink className="w-3 h-3" />
             </button>
          </div>
        </div>
      ))}
    </div>
  );
};
