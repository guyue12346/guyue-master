import React, { useState, useEffect } from 'react';
import { Bookmark } from '../types';
import { X, Link as LinkIcon, Type, FileText, ListOrdered } from 'lucide-react';

interface AddEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bm: Partial<Bookmark>) => void;
  initialData?: Bookmark | null;
  categories: string[];
}

export const AddEditModal: React.FC<AddEditModalProps> = ({ isOpen, onClose, onSave, initialData, categories }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<string>('');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setUrl(initialData.url);
      setCategory(initialData.category);
      setNote(initialData.note);
      setPriority(initialData.priority ? initialData.priority.toString() : '');
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setTitle('');
    setUrl('');
    setCategory('');
    setNote('');
    setPriority('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      title: title || new URL(url).hostname,
      url,
      category,
      note,
      priority: priority ? parseInt(priority) : undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-lg border border-white/50 overflow-hidden transform transition-all scale-100">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialData ? '编辑网址' : '添加新网址'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* URL Input Group */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">目标网址</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LinkIcon className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">名称</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Type className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="网站标题"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">分类</label>
              <div className="relative">
                <input
                  list="categories"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="选择或输入"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
                <datalist id="categories">
                  {categories.filter(c => c !== '全部').map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                排序优先级 <span className="text-gray-400 font-normal">(1-100)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <ListOrdered className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  placeholder="默认排最后"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">备注</label>
            <div className="relative">
               <div className="absolute top-3 left-3 pointer-events-none">
                  <FileText className="h-4 w-4 text-gray-400" />
                </div>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="添加一些关于这个网站的备注..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium bg-gray-900 text-white rounded-xl shadow-lg shadow-gray-900/20 hover:bg-black hover:scale-105 active:scale-95 transition-all"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};