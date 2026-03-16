
import React from 'react';
import { Note } from '../types';
import { Trash2, Edit2, StickyNote } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface NoteListProps {
  notes: Note[];
  onDelete: (id: string) => void;
  onEdit: (note: Note) => void;
}

export const NoteList: React.FC<NoteListProps> = ({ notes, onDelete, onEdit }) => {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <StickyNote className="w-10 h-10 text-yellow-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无便签</h3>
        <p className="text-sm">点击右上角的 "+" 按钮记录您的第一个想法。</p>
      </div>
    );
  }

  return (
    <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 p-1 space-y-4">
      {notes.map((note) => (
        <div 
          key={note.id} 
          className={`group relative break-inside-avoid rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col ${note.color || 'bg-white border border-gray-100'}`}
        >
          {/* Actions */}
          <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(note); }} 
              className="p-1.5 bg-black/5 hover:bg-black/10 rounded-md text-gray-600 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} 
              className="p-1.5 bg-black/5 hover:bg-red-100 rounded-md text-gray-600 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="text-sm text-gray-800 leading-relaxed font-medium min-h-[60px] prose prose-sm max-w-none
            prose-headings:font-semibold prose-headings:text-gray-800 prose-headings:my-1
            prose-p:my-0.5 prose-p:leading-relaxed
            prose-ul:my-1 prose-ol:my-1 prose-li:my-0
            prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
            prose-pre:bg-black/10 prose-pre:rounded-lg prose-pre:text-xs
            prose-blockquote:border-l-2 prose-blockquote:border-current prose-blockquote:opacity-70 prose-blockquote:pl-3 prose-blockquote:my-1
            prose-strong:text-gray-900 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {note.content}
            </ReactMarkdown>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center text-[10px] text-gray-500 font-mono">
             <span>{new Date(note.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
