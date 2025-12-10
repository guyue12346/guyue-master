
import React, { useState, useEffect } from 'react';
import { SSHRecord } from '../types';
import { X, Server, Terminal, User, Network, Tag, ListOrdered, Globe, Shield } from 'lucide-react';

interface SSHModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: Partial<SSHRecord>) => void;
  initialData?: SSHRecord | null;
  categories: string[];
}

export const SSHModal: React.FC<SSHModalProps> = ({ isOpen, onClose, onSave, initialData, categories }) => {
  const [title, setTitle] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('root');
  const [port, setPort] = useState('22');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [customCommand, setCustomCommand] = useState('');
  const [isCustomCommand, setIsCustomCommand] = useState(false);
  const [priority, setPriority] = useState<string>('');
  const [networkType, setNetworkType] = useState<string>('局域网');

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setHost(initialData.host);
      setUsername(initialData.username);
      setPort(initialData.port);
      setCategory(initialData.category);
      setNote(initialData.note);
      setCustomCommand(initialData.command);
      setPriority(initialData.priority ? initialData.priority.toString() : '');
      setNetworkType(initialData.networkType || '局域网');
      
      const generated = `ssh -p ${initialData.port} ${initialData.username}@${initialData.host}`;
      if (initialData.command !== generated) {
        setIsCustomCommand(true);
      } else {
        setIsCustomCommand(false);
      }
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setTitle('');
    setHost('');
    setUsername('root');
    setPort('22');
    setCategory('');
    setNote('');
    setCustomCommand('');
    setIsCustomCommand(false);
    setPriority('');
    setNetworkType('局域网');
  };

  const generatedCommand = `ssh -p ${port} ${username}@${host}`;
  const finalCommand = isCustomCommand ? customCommand : generatedCommand;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id,
      title: title || host,
      host,
      username,
      port,
      command: finalCommand,
      category,
      note,
      priority: priority ? parseInt(priority) : undefined,
      networkType,
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
            {initialData ? '编辑 SSH 记录' : '新增 SSH 记录'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200/50 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Row 1: Title & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">主机别名</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 阿里云服务器"
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

          {/* Row 2: Priority & Network Type */}
          <div className="grid grid-cols-2 gap-4">
            {/* Network Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">网络类型</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  list="networkTypes"
                  value={networkType}
                  onChange={(e) => setNetworkType(e.target.value)}
                  placeholder="公网 / 局域网"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
                <datalist id="networkTypes">
                  <option value="局域网" />
                  <option value="公网" />
                  <option value="VPN" />
                  <option value="家庭" />
                  <option value="公司" />
                </datalist>
              </div>
            </div>

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

          {/* Row 3: Connection Details */}
          <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-100 space-y-4">
             <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Host (IP/Domain)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Server className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="192.168.1.1"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Port</label>
                  <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Network className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="22"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                    />
                  </div>
                </div>
             </div>

             <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="root"
                    className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-mono"
                  />
                </div>
             </div>
          </div>

          {/* Command Preview */}
          <div>
             <div className="flex justify-between items-center mb-1.5">
               <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Command Preview</label>
               <button 
                 type="button" 
                 onClick={() => setIsCustomCommand(!isCustomCommand)} 
                 className="text-[10px] text-blue-500 hover:underline"
               >
                 {isCustomCommand ? '使用自动生成' : '自定义命令'}
               </button>
             </div>
             
             {isCustomCommand ? (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Terminal className="h-4 w-4 text-gray-400" />
                  </div>
                  <input 
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-900 text-green-400 font-mono text-xs rounded-xl border border-gray-800 focus:ring-2 focus:ring-blue-500/50 outline-none"
                  />
                </div>
             ) : (
               <div className="w-full px-3 py-2.5 bg-gray-900 text-green-400 font-mono text-xs rounded-xl border border-gray-800 flex items-center">
                  <Terminal className="w-4 h-4 mr-2 text-gray-500" />
                  $ {generatedCommand}
               </div>
             )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">备注</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm resize-none"
              placeholder="添加备注信息..."
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
