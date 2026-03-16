import React, { useState } from 'react';
import { RecurringCategory } from '../types';
import { X, Plus, Trash2, Check, Pencil } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: RecurringCategory[];
  onUpdateCategories: (cats: RecurringCategory[]) => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#6b7280', '#0ea5e9', '#a855f7', '#84cc16',
];

export const RecurringCategoryManagerModal: React.FC<Props> = ({
  isOpen, onClose, categories, onUpdateCategories,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const startAdd = () => {
    setEditingId(null);
    setEditName('');
    setEditColor(PRESET_COLORS[categories.length % PRESET_COLORS.length]);
    setIsAdding(true);
  };

  const startEdit = (cat: RecurringCategory) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setIsAdding(false);
  };

  const save = () => {
    if (!editName.trim()) return;
    if (isAdding) {
      const newCat: RecurringCategory = {
        id: crypto.randomUUID(),
        name: editName.trim(),
        color: editColor,
      };
      onUpdateCategories([...categories, newCat]);
    } else if (editingId) {
      onUpdateCategories(
        categories.map(c => c.id === editingId ? { ...c, name: editName.trim(), color: editColor } : c)
      );
    }
    cancelEdit();
  };

  const handleDelete = (id: string) => {
    onUpdateCategories(categories.filter(c => c.id !== id));
    if (editingId === id) cancelEdit();
  };

  const isFormOpen = isAdding || editingId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md border border-white/50 overflow-hidden flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-gray-800">管理重复事件分类</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {categories.map(cat => {
            const isEditing = editingId === cat.id;
            return (
              <div
                key={cat.id}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                  isEditing ? 'border-violet-300 bg-violet-50' : 'border-gray-100 bg-gray-50 hover:bg-white'
                }`}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                {isEditing ? (
                  /* Inline edit form */
                  <div className="flex-1 flex flex-col gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder="分类名称"
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-violet-400"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${editColor === c ? 'border-gray-700 scale-110' : 'border-transparent hover:border-gray-400'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={save}
                        className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <Check className="w-3 h-3" /> 保存
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700 font-medium">{cat.name}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Add form */}
          {isAdding && (
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-violet-300 bg-violet-50">
              <div className="w-3 h-3 rounded-full shrink-0 mt-2" style={{ backgroundColor: editColor }} />
              <div className="flex-1 flex flex-col gap-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancelEdit(); }}
                  placeholder="新分类名称"
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-violet-400"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${editColor === c ? 'border-gray-700 scale-110' : 'border-transparent hover:border-gray-400'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={save}
                    className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Check className="w-3 h-3" /> 添加
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {categories.length === 0 && !isAdding && (
            <p className="text-center text-sm text-gray-400 py-8">暂无分类，点击下方按钮添加</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            onClick={startAdd}
            disabled={isFormOpen}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            新增分类
          </button>
        </div>
      </div>
    </div>
  );
};
