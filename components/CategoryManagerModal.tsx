import React, { useState, useEffect } from 'react';
import { Category, AVAILABLE_ICONS } from '../types';
import { X, Plus, Trash2, Check, Edit2, GripVertical } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const PRESET_COLORS = [
  '#ef4444','#f97316','#f59e0b','#84cc16',
  '#22c55e','#10b981','#06b6d4','#3b82f6',
  '#8b5cf6','#ec4899','#64748b','#a8a29e',
];

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUpdateCategories: (categories: Category[]) => void;
  onDeleteCategory: (id: string) => void;
  initialEditId?: string | null;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onUpdateCategories,
  onDeleteCategory,
  initialEditId
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState<string>('#3b82f6');
  const [isAdding, setIsAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && initialEditId) {
      const cat = categories.find(c => c.id === initialEditId);
      if (cat) {
        startEdit(cat);
      }
    }
  }, [isOpen, initialEditId]);

  // Dynamic Icon Renderer
  const IconRender = ({ name, className, color }: { name: string; className?: string; color?: string }) => {
    const Icon = (LucideIcons as any)[name] || LucideIcons.Folder;
    return color ? <Icon className={className} color={color} /> : <Icon className={className} />;
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon);
    setEditColor(cat.color || '#3b82f6');
    setIsAdding(false);
  };

  const startAdd = () => {
    setEditingId(null);
    setEditName('');
    setEditIcon('Folder');
    setEditColor('#3b82f6');
    setIsAdding(true);
  };

  const saveCategory = () => {
    if (!editName.trim()) return;

    if (isAdding) {
      const newCat: Category = {
        id: crypto.randomUUID(),
        name: editName,
        icon: editIcon,
        color: editColor,
      };
      onUpdateCategories([...userCategories, newCat, ...systemCategories]);
    } else if (editingId) {
      onUpdateCategories(
        categories.map((c) =>
          c.id === editingId ? { ...c, name: editName, icon: editIcon, color: editColor } : c
        )
      );
    }
    cancelEdit();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    // Critical: prevent opening the edit mode
    e.preventDefault();
    e.stopPropagation();
    
    // 确认弹窗由 onDeleteCategory 处理
    onDeleteCategory(id);
    
    if (editingId === id) {
      cancelEdit();
    }
  };

  // 分离用户分类与系统分类（系统分类不在列表中展示，也不参与排序）
  const userCategories = categories.filter(c => !c.isSystem && c.id !== 'all');
  const systemCategories = categories.filter(c => c.isSystem || c.id === 'all');

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newUserCats = [...userCategories];
    const [removed] = newUserCats.splice(dragIndex, 1);
    newUserCats.splice(targetIndex, 0, removed);
    onUpdateCategories([...newUserCats, ...systemCategories]);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setEditName('');
    setEditIcon('');
    setEditColor('#3b82f6');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="relative bg-white/90 backdrop-blur-2xl rounded-2xl shadow-2xl w-full max-w-2xl border border-white/50 overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">分类管理</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Category List (Sortable) */}
          <div className="w-5/12 border-r border-gray-100 overflow-y-auto bg-gray-50/50 p-3 space-y-2">
            
            <div className="space-y-1">
              {userCategories.map((cat, index) => {
                const isEditing = editingId === cat.id && !isAdding;

                return (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDrop={(e) => { e.preventDefault(); handleDrop(index); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    onClick={() => startEdit(cat)}
                    className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all group cursor-pointer
                      ${isEditing ? 'bg-white shadow-sm ring-1 ring-blue-500/20 z-10' : 'hover:bg-white hover:shadow-sm'}
                      ${dragOverIndex === index ? 'ring-2 ring-blue-300 bg-blue-50' : ''}
                      ${dragIndex === index ? 'opacity-50' : ''}
                    `}
                  >
                    {/* Drag handle */}
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Icon */}
                    <div
                      className={`p-1.5 rounded-md shrink-0 pointer-events-none ${isEditing ? 'ring-1 ring-blue-500/50' : ''}`}
                      style={{ backgroundColor: cat.color ? `${cat.color}20` : '#f3f4f6' }}
                    >
                      <IconRender name={cat.icon} className="w-4 h-4" color={cat.color || '#9ca3af'} />
                    </div>
                    {/* Name */}
                    <span className="flex-1 text-sm font-medium text-gray-700 truncate pointer-events-none">{cat.name}</span>
                    
                    {/* Delete Button */}
                    <button 
                      type="button"
                      onClick={(e) => handleDelete(e, cat.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-20"
                      title="删除分类"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={startAdd}
              className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all text-sm font-medium mt-4
                 ${isAdding ? 'bg-blue-50 border-blue-400 text-blue-600' : ''}
              `}
            >
              <Plus className="w-4 h-4" />
              <span>新建分类</span>
            </button>
          </div>

          {/* Right: Edit Area */}
          <div className="flex-1 p-6 bg-white overflow-y-auto">
            {(editingId || isAdding) ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                   <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">
                     {isAdding ? '新建分类' : '编辑分类'}
                   </h3>
                   
                   <div className="space-y-5">
                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase">分类名称</label>
                       <input
                         type="text"
                         value={editName}
                         onChange={(e) => setEditName(e.target.value)}
                         className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                         placeholder="例如: 常用工具"
                         autoFocus
                       />
                     </div>

                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">选择颜色</label>
                       <div className="flex flex-wrap gap-2">
                         {PRESET_COLORS.map(c => (
                           <button
                             key={c}
                             onClick={() => setEditColor(c)}
                             className={`w-6 h-6 rounded-full transition-all ${
                               editColor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'
                             }`}
                             style={{ background: c }}
                           />
                         ))}
                       </div>
                     </div>

                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-2 uppercase">选择图标</label>
                       <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1 p-1 custom-scrollbar">
                         {AVAILABLE_ICONS.map((iconName) => (
                           <button
                             key={iconName}
                             onClick={() => setEditIcon(iconName)}
                             className={`aspect-square flex items-center justify-center rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5
                               ${editIcon === iconName 
                                 ? 'bg-blue-500 border-blue-500 text-white shadow-md ring-2 ring-blue-200' 
                                 : 'bg-white border-gray-100 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                               }
                             `}
                             title={iconName}
                           >
                             <IconRender name={iconName} className="w-5 h-5" />
                           </button>
                         ))}
                       </div>
                     </div>
                   </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-50">
                   <button 
                     onClick={cancelEdit}
                     className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                   >
                     取消
                   </button>
                   <button 
                     onClick={saveCategory}
                     disabled={!editName}
                     className="px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg shadow-lg shadow-gray-900/10 hover:bg-black hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                   >
                     <Check className="w-4 h-4" />
                     {isAdding ? '创建分类' : '保存修改'}
                   </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-dashed border-gray-200">
                  <Edit2 className="w-8 h-8 opacity-30" />
                </div>
                <p className="text-sm font-medium text-gray-400">点击左侧分类进行编辑</p>
                <p className="text-xs text-gray-300 mt-1">或点击"新建分类"添加</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};