import React, { useState, useEffect, useCallback } from 'react';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './Editor';
import { Terminal } from '../Terminal';
import { PanelBottomClose, PanelBottomOpen, Save, Play, X } from 'lucide-react';

interface Tab {
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
  language: string;
}

export const CodeEditorManager: React.FC = () => {
  const [rootPath, setRootPath] = useState<string | null>(localStorage.getItem('vscode_root_path'));
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(300);

  const activeTab = tabs.find(t => t.path === activeTabPath);

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      setRootPath(path);
      localStorage.setItem('vscode_root_path', path);
      setTabs([]);
      setActiveTabPath(null);
    }
  };

  const getLanguageFromExt = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'py': return 'python';
      case 'java': return 'java';
      case 'c': case 'cpp': return 'cpp';
      case 'go': return 'go';
      case 'rs': return 'rust';
      default: return 'plaintext';
    }
  };

  const handleSelectFile = async (path: string) => {
    // Check if already open
    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabPath(path);
      return;
    }

    if (!window.electronAPI) return;
    try {
      const content = await window.electronAPI.readFile(path);
      const name = path.split('/').pop() || path;
      const newTab: Tab = {
        path,
        name,
        content,
        isDirty: false,
        language: getLanguageFromExt(path)
      };
      setTabs([...tabs, newTab]);
      setActiveTabPath(path);
    } catch (error) {
      console.error('Failed to read file:', error);
    }
  };

  const handleCloseTab = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.path !== path);
    setTabs(newTabs);
    if (activeTabPath === path) {
      setActiveTabPath(newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null);
    }
  };

  const handleContentChange = (value: string | undefined) => {
    if (!activeTabPath || value === undefined) return;
    setTabs(tabs.map(t => 
      t.path === activeTabPath ? { ...t, content: value, isDirty: true } : t
    ));
  };

  const handleSave = async () => {
    if (!activeTab || !window.electronAPI) return;
    try {
      await window.electronAPI.writeFile(activeTab.path, activeTab.content);
      setTabs(tabs.map(t => 
        t.path === activeTab.path ? { ...t, isDirty: false } : t
      ));
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-gray-50">
        <FileExplorer 
          rootPath={rootPath} 
          onSelectFile={handleSelectFile} 
          onSelectFolder={handleSelectFolder}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
        {/* Tabs */}
        <div className="flex bg-[#252526] overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <div
              key={tab.path}
              onClick={() => setActiveTabPath(tab.path)}
              className={`
                flex items-center gap-2 px-3 py-2 text-sm cursor-pointer min-w-[120px] max-w-[200px] border-r border-[#1e1e1e]
                ${activeTabPath === tab.path ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#2a2d2e]'}
              `}
            >
              <span className="truncate flex-1">{tab.name}</span>
              {tab.isDirty && <div className="w-2 h-2 rounded-full bg-white" />}
              <button 
                onClick={(e) => handleCloseTab(tab.path, e)}
                className="opacity-0 group-hover:opacity-100 hover:bg-gray-600 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 relative">
          <CodeEditor
            filePath={activeTabPath}
            content={activeTab?.content || ''}
            language={activeTab?.language || 'plaintext'}
            onChange={handleContentChange}
            onSave={handleSave}
          />
        </div>

        {/* Terminal Toggle & Status Bar */}
        <div className="h-6 bg-[#007acc] text-white flex items-center justify-between px-2 text-xs">
          <div className="flex items-center gap-2">
            {activeTab && (
              <>
                <span>{activeTab.language}</span>
                {activeTab.isDirty && <span>(Unsaved)</span>}
              </>
            )}
          </div>
          <button 
            onClick={() => setShowTerminal(!showTerminal)}
            className="flex items-center gap-1 hover:bg-white/10 px-1 rounded"
          >
            {showTerminal ? <PanelBottomClose className="w-3 h-3" /> : <PanelBottomOpen className="w-3 h-3" />}
            <span>Terminal</span>
          </button>
        </div>

        {/* Terminal Panel */}
        {showTerminal && (
          <div className="h-1/3 border-t border-gray-700 bg-[#1e1e1e]">
            <Terminal isFullscreen={false} onToggleFullscreen={() => {}} isVisible={true} />
          </div>
        )}
      </div>
    </div>
  );
};
