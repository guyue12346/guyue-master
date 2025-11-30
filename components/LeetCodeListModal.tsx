import React, { useState, useEffect } from 'react';
import { X, Save, HelpCircle } from 'lucide-react';
import { LeetCodeList, parseLeetCodeMarkdown } from '../utils/leetcodeParser';

interface LeetCodeListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (list: Partial<LeetCodeList>) => void;
  initialData?: LeetCodeList | null;
}

export const LeetCodeListModal: React.FC<LeetCodeListModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(10);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setDescription(initialData.description || '');
        setPriority(initialData.priority ?? 10);
        setContent(initialData.rawMarkdown || '');
      } else {
        setTitle('');
        setDescription('');
        setPriority(10);
        setContent('');
      }
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    // Auto preview
    const parsed = parseLeetCodeMarkdown(content);
    setPreview(parsed);
  }, [content]);

  const handleSave = () => {
    if (!title.trim()) {
      alert('请输入题单标题');
      return;
    }
    if (!content.trim()) {
      alert('请输入题单内容');
      return;
    }

    const categories = parseLeetCodeMarkdown(content);
    if (categories.length === 0) {
      alert('无法解析题单内容，请检查格式');
      return;
    }

    onSave({
      id: initialData?.id,
      title,
      description,
      priority,
      rawMarkdown: content,
      categories
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialData ? '编辑题单' : '新建题单'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Editor */}
          <div className="w-1/2 flex flex-col border-r border-gray-200 p-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">题单标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="例如：基础算法精讲"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">描述 (可选)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="简短描述这个题单的内容"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">优先级 (越小越靠前)</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="10"
              />
            </div>

            <div className="flex-1 flex flex-col space-y-2 min-h-0">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">内容 (Markdown 表格)</label>
                <div className="group relative">
                  <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    支持 Markdown 格式：<br/>
                    ### 分类名称<br/>
                    |题目|相关链接|备注|<br/>
                    |---|---|---|<br/>
                    |[题目](链接)|[自定义文字](链接)|备注|
                  </div>
                </div>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-mono text-xs resize-none"
                placeholder={`### 数组
|题目|相关链接|备注|
|---|---|---|
|[1. 两数之和](https://leetcode.cn/problems/two-sum/)|[笔记](https://note.com)|重点复习|`}
              />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="w-1/2 bg-gray-50 flex flex-col">
            <div className="p-3 border-b border-gray-200 bg-gray-100/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              预览 ({preview.reduce((acc, cat) => acc + cat.problems.length, 0)} 题)
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {preview.map((cat, idx) => (
                <div key={idx} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 font-medium text-sm text-gray-700">
                    {cat.title}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {cat.problems.map((prob: any, pIdx: number) => (
                      <div key={pIdx} className="px-3 py-2 text-sm text-gray-600">
                        {prob.title}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {preview.length === 0 && (
                <div className="text-center text-gray-400 mt-10 text-sm">
                  在左侧输入内容以预览
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/30 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            保存题单
          </button>
        </div>
      </div>
    </div>
  );
};
