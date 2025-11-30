import React, { useState } from 'react';
import { PromptRecord } from '../types';
import { Sparkles, Copy, Check, Edit2, Trash2 } from 'lucide-react';

interface PromptListProps {
  prompts: PromptRecord[];
  onDelete: (id: string) => void;
  onEdit: (prompt: PromptRecord) => void;
}

export const PromptList: React.FC<PromptListProps> = ({ prompts, onDelete, onEdit }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (prompt: PromptRecord) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedId(prompt.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      alert('复制失败，请检查系统权限');
    }
  };

  if (prompts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Sparkles className="w-10 h-10 text-purple-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无 Prompt</h3>
        <p className="text-sm">点击右上角的 “+” 按钮添加你的第一个 Prompt。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {prompts.map(prompt => (
        <div
          key={prompt.id}
          className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col gap-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                {prompt.category}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-gray-800 line-clamp-1" title={prompt.title}>
                {prompt.title}
              </h3>
            </div>

            <div className="flex gap-1">
              <button
                onClick={() => onEdit(prompt)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="编辑"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(prompt.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {prompt.content}
          </div>

          {prompt.note && (
            <div className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed px-1">
              <span className="font-medium text-gray-400 mr-1">备注:</span>
              {prompt.note}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>更新于 {new Date(prompt.updatedAt).toLocaleString()}</span>
            <button
              onClick={() => handleCopy(prompt)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                copiedId === prompt.id
                  ? 'bg-green-100 border-green-200 text-green-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {copiedId === prompt.id ? (
                <>
                  <Check className="w-4 h-4" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  一键复制
                </>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
