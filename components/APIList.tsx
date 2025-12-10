
import React, { useState } from 'react';
import { APIRecord } from '../types';
import { Webhook, Copy, Check, Edit2, Trash2, Key, Globe, FileCode } from 'lucide-react';

interface APIListProps {
  records: APIRecord[];
  onDelete: (id: string) => void;
  onEdit: (record: APIRecord) => void;
}

export const APIList: React.FC<APIListProps> = ({ records, onDelete, onEdit }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyType, setCopyType] = useState<'url' | 'key' | 'usage' | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, id: string, type: 'url' | 'key' | 'usage') => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setCopyType(type);
    setTimeout(() => {
      setCopiedId(null);
      setCopyType(null);
    }, 2000);
  };

  const getMethodColor = (method: string) => {
    const m = method.toUpperCase();
    if (m === 'GET') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (m === 'POST') return 'bg-green-100 text-green-700 border-green-200';
    if (m === 'PUT' || m === 'PATCH') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (m === 'DELETE') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Webhook className="w-10 h-10 text-purple-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无 API 记录</h3>
        <p className="text-sm">点击右上角的 "+" 按钮添加 API 接口管理。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 p-1">
      {records.map((rec) => (
        <div 
          key={rec.id} 
          className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-500">
                <Webhook className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-800 truncate leading-tight">{rec.title}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getMethodColor(rec.method)}`}>
                    {rec.method}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                    {rec.category}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={(e) => { e.stopPropagation(); onEdit(rec); }} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(rec.id); }} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* URL & Endpoint */}
          <div className="space-y-2 mb-3">
            <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-between border border-gray-100 group/url">
              <div className="flex items-center gap-2 overflow-hidden">
                <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="text-xs text-gray-600 font-mono truncate">
                  <span className="opacity-50">{rec.baseUrl}</span>
                  <span className="font-semibold text-gray-800">{rec.endpoint}</span>
                </div>
              </div>
              <button
                onClick={(e) => handleCopy(e, `${rec.baseUrl}${rec.endpoint}`, rec.id, 'url')}
                className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover/url:opacity-100"
                title="复制完整 URL"
              >
                 {copiedId === rec.id && copyType === 'url' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            {/* API Key */}
            <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-between border border-gray-100 group/key">
              <div className="flex items-center gap-2 overflow-hidden">
                <Key className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="text-xs text-gray-600 font-mono truncate">
                  {rec.apiKey ? (
                    <span className="opacity-70">••••••••••••••••</span>
                  ) : <span className="text-gray-400 italic">No API Key</span>}
                </div>
              </div>
              {rec.apiKey && (
                <button
                  onClick={(e) => handleCopy(e, rec.apiKey, rec.id, 'key')}
                  className="p-1 hover:bg-white rounded text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover/key:opacity-100"
                  title="复制 API Key"
                >
                   {copiedId === rec.id && copyType === 'key' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>

          {/* Usage / Note */}
          <div className="flex-1 min-h-0 text-xs text-gray-500">
            {rec.usage ? (
              <div className="bg-gray-900 rounded p-2 text-green-400 font-mono mb-2 opacity-80 relative group/usage">
                 <div className="whitespace-pre-wrap break-all pr-6">{rec.usage}</div>
                 <button
                    onClick={(e) => handleCopy(e, rec.usage, rec.id, 'usage')}
                    className="absolute top-2 right-2 p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors opacity-0 group-hover/usage:opacity-100"
                    title="复制使用方式"
                  >
                     {copiedId === rec.id && copyType === 'usage' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </button>
              </div>
            ) : null}
            
            {rec.note && (
              <div className="whitespace-pre-wrap leading-relaxed opacity-70">
                {rec.note}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
