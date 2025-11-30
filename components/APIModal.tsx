
import React, { useState, useEffect } from 'react';
import { APIRecord } from '../types';
import { X, Webhook, Globe, Key, FileCode, Tag, ListOrdered, Link2 } from 'lucide-react';

interface APIModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Partial<APIRecord>) => void;
  initialData?: APIRecord | null;
  categories: string[];
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const APIModal: React.FC<APIModalProps> = ({ isOpen, onClose, onSave, initialData, categories }) => {
  const [title, setTitle] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState('GET');
  const [apiKey, setApiKey] = useState('');
  const [usage, setUsage] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<string>('');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setBaseUrl(initialData.baseUrl);
      setEndpoint(initialData.endpoint);
      setMethod(initialData.method);
      setApiKey(initialData.apiKey);
      setUsage(initialData.usage);
      setCategory(initialData.category);
      setNote(initialData.note);
      setPriority(initialData.priority ? initialData.priority.toString() : '');
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setTitle('');
    setBaseUrl('');
    setEndpoint('/');
    setMethod('GET');
    setApiKey('');
    setUsage('');
    setCategory('');
    setNote('');
    setPriority('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      title,
      baseUrl,
      endpoint,
      method,
      apiKey,
      usage,
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
        
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialData ? '编辑 API' : '新增 API'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Row 1: Title & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">名称</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. User Login"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">分类</label>
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

          {/* Row 2: Method & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">请求方式</label>
              <div className="relative">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm appearance-none"
                >
                  {HTTP_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                排序优先级
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

          {/* Row 3: URL Config */}
          <div className="space-y-3 p-4 bg-gray-50/80 rounded-xl border border-gray-100">
             <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Base URL</label>
               <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Globe className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                  />
               </div>
             </div>
             
             <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Endpoint / Interface</label>
               <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="/users/login"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                  />
               </div>
             </div>

             <div>
               <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">API Key / Token</label>
               <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Bearer eyJhbGciOi..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                  />
               </div>
             </div>
          </div>

          {/* Usage */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">使用方式 / 代码片段</label>
            <div className="relative">
              <div className="absolute top-3 left-3 pointer-events-none">
                <FileCode className="h-4 w-4 text-gray-400" />
              </div>
              <textarea
                rows={2}
                value={usage}
                onChange={(e) => setUsage(e.target.value)}
                placeholder="curl -X POST ..."
                className="w-full pl-9 pr-3 py-2 bg-gray-900 text-green-400 border border-gray-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-xs font-mono resize-none"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">备注</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
              placeholder="添加参数说明或备注..."
            />
          </div>

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
