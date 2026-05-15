import React from 'react';
import { Download, FileText, X } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import {
  AGENT_PLUGIN_DEVELOPMENT_DOC,
  AGENT_PLUGIN_DEVELOPMENT_DOC_FILENAME,
} from '../services/agent/pluginDevelopmentDoc';

interface AgentPluginDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const downloadPluginDoc = () => {
  const blob = new Blob([AGENT_PLUGIN_DEVELOPMENT_DOC], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = AGENT_PLUGIN_DEVELOPMENT_DOC_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const AgentPluginDocsModal: React.FC<AgentPluginDocsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] rounded-3xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">Agent 插件开发说明</h2>
              <p className="text-sm text-gray-500 mt-0.5 truncate">Manifest、权限、工具注册和安全 API</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={downloadPluginDoc}
              className="h-9 px-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
              title="下载 Markdown 说明"
            >
              <Download className="w-4 h-4" />
              下载
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-none rounded-2xl border border-gray-200 bg-gray-50/70 px-5 py-4">
            <MarkdownContent content={AGENT_PLUGIN_DEVELOPMENT_DOC} />
          </div>
        </div>
      </div>
    </div>
  );
};
