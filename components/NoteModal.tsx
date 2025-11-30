
import React, { useState, useEffect } from 'react';
import { Note } from '../types';
import { X, Check } from 'lucide-react';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: Partial<Note>) => void;
  initialData?: Note | null;
}

const COLORS = [
  { id: 'white', class: 'bg-white border border-gray-200', label: 'White' },
  { id: 'yellow', class: 'bg-yellow-100', label: 'Yellow' },
  { id: 'blue', class: 'bg-blue-100', label: 'Blue' },
  { id: 'green', class: 'bg-green-100', label: 'Green' },
  { id: 'red', class: 'bg-red-100', label: 'Red' },
  { id: 'purple', class: 'bg-purple-100', label: 'Purple' },
];

export const NoteModal: React.FC<NoteModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [content, setContent] = useState('');
  const [color, setColor] = useState(COLORS[1].class); // Default yellow

  useEffect(() => {
    if (initialData) {
      setContent(initialData.content);
      setColor(initialData.color);
    } else {
      setContent('');
      setColor(COLORS[1].class);
    }
  }, [initialData, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      content,
      color,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className={`relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100 ${color} transition-colors duration-300`}>
        
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-black/5">
          <h2 className="text-lg font-semibold text-gray-800/80">
            {initialData ? '编辑便签' : '新便签'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition-colors">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Content */}
          <div>
            <textarea
              required
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记下你的想法..."
              className="w-full bg-transparent border-none outline-none text-gray-800 placeholder-gray-500/50 text-lg resize-none font-medium leading-relaxed"
              autoFocus
            />
          </div>

          {/* Color Picker */}
          <div className="flex gap-3">
            {COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.class)}
                className={`w-8 h-8 rounded-full border border-black/5 shadow-sm transition-transform hover:scale-110 ${c.class.replace('border border-gray-200', 'bg-white')} 
                  ${color === c.class ? 'ring-2 ring-gray-400 ring-offset-2' : ''}
                `}
                title={c.label}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-6 py-2 bg-gray-900/90 text-white rounded-xl shadow-lg hover:bg-black hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>完成</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
