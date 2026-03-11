import React, { useEffect, useState } from 'react';
import { PromptRecord } from '../types';
import { X, Sparkles, Eye, Pencil } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Partial<PromptRecord>) => void;
  initialData?: PromptRecord | null;
  categories: string[];
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen, onClose, onSave, initialData, categories,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [contentTab, setContentTab] = useState<'edit' | 'preview'>('edit');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setCategory(initialData.category);
      setDescription(initialData.description || initialData.note || '');
      setContent(initialData.content);
      setTags(initialData.tags || []);
      setAuthor(initialData.author || '');
      setSource(initialData.source || '');
      setShowDetails(!!(initialData.author || initialData.source));
    } else {
      setTitle(''); setCategory(''); setDescription(''); setContent('');
      setTags([]); setTagInput(''); setAuthor(''); setSource('');
      setContentTab('edit'); setShowDetails(false);
    }
  }, [initialData, isOpen]);

  const handleAddTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(); }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) setTags(prev => prev.slice(0, -1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      title: title || '未命名 Skill',
      category: category || '未分类',
      description,
      content,
      tags,
      note: description,
      author: author || undefined,
      source: source || undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-800">
              {initialData ? '编辑 Skill' : '创建 Skill'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Title + Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">标题</label>
                <input
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Skill 名称"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">分类</label>
                <input
                  list="skill-categories" value={category} onChange={e => setCategory(e.target.value)}
                  placeholder="选择或输入分类"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
                <datalist id="skill-categories">
                  {categories.filter(c => c !== '全部').map(cat => <option value={cat} key={cat} />)}
                </datalist>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">简介（可选）</label>
              <input
                type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="一句话描述这个 Skill 的用途..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">标签</label>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl min-h-[42px] focus-within:ring-2 focus-within:ring-purple-500/20 focus-within:border-purple-500 transition-all">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    #{tag}
                    <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} className="hover:text-red-500 leading-none">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="text" value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleAddTag}
                  placeholder={tags.length === 0 ? '输入标签后按 Enter 或逗号...' : ''}
                  className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            {/* Content with Edit/Preview tabs */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">内容（支持 Markdown）</label>
                <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
                  <button type="button" onClick={() => setContentTab('edit')}
                    className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-all ${contentTab === 'edit' ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Pencil className="w-3 h-3" />编辑
                  </button>
                  <button type="button" onClick={() => setContentTab('preview')}
                    className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-all ${contentTab === 'preview' ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Eye className="w-3 h-3" />预览
                  </button>
                </div>
              </div>
              {contentTab === 'edit' ? (
                <textarea
                  value={content} onChange={e => setContent(e.target.value)}
                  placeholder="在这里输入 Skill 内容，支持 Markdown 格式..."
                  rows={10} required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-y"
                />
              ) : (
                <div className="min-h-[220px] max-h-[400px] overflow-y-auto px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl prose prose-sm max-w-none text-gray-700">
                  {content
                    ? <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
                    : <p className="text-gray-400 text-sm italic">暂无内容...</p>
                  }
                </div>
              )}
            </div>

            {/* Author/Source (optional) */}
            <div>
              <button type="button" onClick={() => setShowDetails(v => !v)}
                className="text-xs text-purple-500 hover:underline">
                {showDetails ? '▲ 收起' : '▼ 展开'} 来源信息（可选）
              </button>
              {showDetails && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">作者</label>
                    <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="作者名称"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">来源 URL</label>
                    <input type="url" value={source} onChange={e => setSource(e.target.value)} placeholder="https://..."
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 outline-none" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              取消
            </button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-600/20 hover:bg-purple-700 active:scale-95 transition-all">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
