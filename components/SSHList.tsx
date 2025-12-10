
import React, { useState } from 'react';
import { SSHRecord } from '../types';
import { Terminal, Copy, Check, Edit2, Trash2, Server } from 'lucide-react';

interface SSHListProps {
  records: SSHRecord[];
  onDelete: (id: string) => void;
  onEdit: (record: SSHRecord) => void;
  onOpenInTerminal: (command: string, title: string) => void;
}

export const SSHList: React.FC<SSHListProps> = ({ records, onDelete, onEdit, onOpenInTerminal }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, command: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getNetworkBadgeStyle = (type?: string) => {
    const t = (type || '').toLowerCase();
    if (t === '公网' || t === 'public' || t === 'wan') return 'text-blue-500 bg-blue-50';
    if (t === '局域网' || t === 'local' || t === 'lan' || t === 'home') return 'text-green-600 bg-green-50';
    if (t === 'vpn') return 'text-purple-600 bg-purple-50';
    if (t === 'company' || t === '公司') return 'text-orange-600 bg-orange-50';
    return 'text-gray-500 bg-gray-100'; // Default
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <Terminal className="w-10 h-10 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无 SSH 记录</h3>
        <p className="text-sm">点击右上角的 "+" 按钮添加服务器连接信息。</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 p-1">
      {records.map((rec) => (
        <div 
          key={rec.id} 
          className="group relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                <Server className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-800 truncate leading-tight">{rec.title}</h3>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                    {rec.category}
                  </span>
                  {/* Network Type Badge */}
                  {rec.networkType && (
                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${getNetworkBadgeStyle(rec.networkType)}`}>
                       {rec.networkType}
                     </span>
                  )}
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

          {/* Command Area */}
          <div className="relative group/cmd my-2">
            <div className="bg-gray-900 rounded-lg p-3 pr-16 font-mono text-xs text-green-400 break-all leading-relaxed shadow-inner min-h-[3rem] flex items-center">
              <span className="select-all">$ {rec.command}</span>
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onOpenInTerminal(rec.command, rec.title); }}
                className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="在终端中运行"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => handleCopy(e, rec.command, rec.id)}
                className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                title="复制命令"
              >
                {copiedId === rec.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Info Details */}
          <div className="flex flex-col gap-1 mt-2 text-xs text-gray-500">
            <div className="flex items-center justify-between">
               <span>Host:</span>
               <span className="font-mono text-gray-700">{rec.host}</span>
            </div>
            <div className="flex items-center justify-between">
               <span>User:</span>
               <span className="font-mono text-gray-700">{rec.username}</span>
            </div>
            {rec.note && (
              <div className="mt-2 pt-2 border-t border-gray-50 text-gray-400 leading-relaxed whitespace-pre-wrap">
                {rec.note}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
