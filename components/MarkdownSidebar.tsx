import React, { useState } from 'react';
import { Plus, Trash2, BookOpen, ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { MarkdownNote, Category } from '../types';

interface MarkdownSidebarProps {
  notes: MarkdownNote[];
  categories: Category[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  onDeleteNote: (id: string, e: React.MouseEvent) => void;
}

export const MarkdownSidebar: React.FC<MarkdownSidebarProps> = ({
  notes,
  categories,
  selectedNoteId,
  onSelectNote,
  onAddNote,
  onDeleteNote
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

  // Group notes by category
  const notesByCategory = notes.reduce((acc, note) => {
    const cat = note.category || '未分类';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(note);
    return acc;
  }, {} as Record<string, MarkdownNote[]>);

  // Get all unique categories from notes + defined categories
  const allCategoryNames = Array.from(new Set([
    ...categories.map(c => c.name),
    ...Object.keys(notesByCategory)
  ])).filter(name => name !== '全部'); // '全部' is handled separately if needed, or just list all

  return (
    <div className="w-64 bg-macOS-sidebar backdrop-blur-xl border-r border-gray-200 flex flex-col h-full transition-all duration-300">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200/50 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold text-gray-700 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Markdown笔记
        </span>
        <button 
          onClick={onAddNote}
          className="p-1.5 hover:bg-gray-200/50 rounded-md text-gray-500 transition-colors"
          title="添加笔记"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {notes.length === 0 ? (
          <div className="text-center text-gray-400 text-sm mt-10">
            暂无笔记<br/>点击右上角添加
          </div>
        ) : (
          allCategoryNames.map(categoryName => {
            const categoryNotes = notesByCategory[categoryName] || [];
            if (categoryNotes.length === 0) return null;

            const isExpanded = expandedCategories.has(categoryName);

            return (
              <div key={categoryName} className="mb-1">
                <div 
                  className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200/50 rounded-md cursor-pointer"
                  onClick={() => toggleCategory(categoryName)}
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <Folder className="w-3.5 h-3.5 text-blue-400" />
                  <span>{categoryName}</span>
                  <span className="ml-auto text-xs text-gray-400">{categoryNotes.length}</span>
                </div>

                {isExpanded && (
                  <div className="ml-2 pl-2 border-l border-gray-200 mt-1 space-y-0.5">
                    {categoryNotes.map(note => (
                      <div
                        key={note.id}
                        onClick={() => onSelectNote(note.id)}
                        className={`group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-all text-sm ${
                          selectedNoteId === note.id 
                            ? 'bg-blue-50 text-blue-600' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span className="truncate flex-1">{note.title}</span>
                        <button
                          onClick={(e) => onDeleteNote(note.id, e)}
                          className={`p-0.5 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ${
                            selectedNoteId === note.id ? 'opacity-100' : ''
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
