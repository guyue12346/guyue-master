import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Terminal as TerminalIcon, Maximize2, Minimize2, Plus, X, Settings, Type } from 'lucide-react';

interface TerminalProps {
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  initialCommand?: string;
  initialTitle?: string;
  isVisible?: boolean;
}

interface TerminalTab {
  id: string;
  title: string;
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#333333',
  selectionBackground: 'rgba(0, 0, 0, 0.1)',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
};

export const Terminal: React.FC<TerminalProps> = ({ isFullscreen, onToggleFullscreen, initialCommand, initialTitle, isVisible = true }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(14);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState('Terminal');
  const defaultTitleRef = useRef('Terminal');

  // Refs to keep track of terminal instances and DOM elements
  const xtermRefs = useRef<Map<string, XTerm>>(new Map());
  const fitAddonRefs = useRef<Map<string, FitAddon>>(new Map());
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // We need a ref for the current active tab ID to use in the global data listener
  // because the listener closure captures the initial state
  const tabsRef = useRef<TerminalTab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  // Fetch user info for default title
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getUserInfo) {
      window.electronAPI.getUserInfo().then(info => {
        const newDefaultTitle = `${info.username}@${info.hostname}`;
        setDefaultTitle(newDefaultTitle);
        defaultTitleRef.current = newDefaultTitle;
        // Update existing tabs that have the generic 'Terminal' title
        setTabs(prev => prev.map(tab => 
          tab.title === 'Terminal' ? { ...tab, title: newDefaultTitle } : tab
        ));
      }).catch(err => console.error('Failed to get user info', err));
    }
  }, []);

  // Global Data Listener
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleData = (_: any, { id, data }: { id: string, data: string }) => {
      const term = xtermRefs.current.get(id);
      if (term) {
        term.write(data);
      }
    };

    window.electronAPI.onTerminalData(handleData);

    return () => {
      // Cleanup if possible (currently our preload doesn't expose removeListener easily without refactoring, 
      // but since this component is likely long-lived, it's okay. 
      // Ideally we should implement removeListener in preload)
    };
  }, []);

  const createTab = useCallback(async (command?: string, title?: string) => {
    if (!window.electronAPI) return;

    try {
      const id = await window.electronAPI.createTerminal();
      // Use provided title, or default title (user@host), or fallback to 'Terminal'
      const tabTitle = title || defaultTitleRef.current;
      const newTab = { id, title: tabTitle };
      
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(id);

      // We need to wait for the DOM element to be rendered before initializing xterm
      // We'll do this in a separate effect that watches `tabs`
      
      // If there's a command, we need to send it after initialization
      if (command) {
        // Store command to be executed after init
        (newTab as any).initialCommand = command;
      }

    } catch (error) {
      console.error('Failed to create terminal tab:', error);
    }
  }, []);

  const closeTab = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    if (window.electronAPI) {
      window.electronAPI.closeTerminal(id);
    }

    // Cleanup refs
    const term = xtermRefs.current.get(id);
    if (term) term.dispose();
    xtermRefs.current.delete(id);
    fitAddonRefs.current.delete(id);
    containerRefs.current.delete(id);

    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      return newTabs;
    });
  }, [activeTabId]);

  // Initialize XTerm for new tabs
  useEffect(() => {
    tabs.forEach(tab => {
      if (!xtermRefs.current.has(tab.id) && containerRefs.current.has(tab.id)) {
        const container = containerRefs.current.get(tab.id)!;
        
        const term = new XTerm({
          cursorBlink: true,
          fontSize: fontSize,
          fontFamily: 'Menlo, Monaco, "Courier New", "PingFang SC", "Microsoft YaHei", monospace',
          theme: LIGHT_THEME,
          allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        
        term.open(container);
        fitAddon.fit();

        // Store refs
        xtermRefs.current.set(tab.id, term);
        fitAddonRefs.current.set(tab.id, fitAddon);

        // Handle Input
        term.onData((data) => {
          window.electronAPI.writeTerminal(tab.id, data);
        });

        // Handle Resize
        term.onResize(({ cols, rows }) => {
          window.electronAPI.resizeTerminal(tab.id, cols, rows);
        });

        // Initial Resize
        setTimeout(() => {
          fitAddon.fit();
          window.electronAPI.resizeTerminal(tab.id, term.cols, term.rows);
          
          // Execute initial command if any
          if ((tab as any).initialCommand) {
            window.electronAPI.writeTerminal(tab.id, (tab as any).initialCommand + '\n');
            delete (tab as any).initialCommand;
          }
        }, 100);
      }
    });
  }, [tabs, fontSize]);

  // Handle Font Size Change
  useEffect(() => {
    xtermRefs.current.forEach(term => {
      term.options.fontSize = fontSize;
    });
    // Re-fit after font size change
    setTimeout(() => {
      fitAddonRefs.current.forEach(addon => addon.fit());
    }, 100);
  }, [fontSize]);

  // Handle Resize Window
  useEffect(() => {
    const handleResize = () => {
      fitAddonRefs.current.forEach((addon, id) => {
        addon.fit();
        const term = xtermRefs.current.get(id);
        if (term) {
          window.electronAPI.resizeTerminal(id, term.cols, term.rows);
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Fullscreen Change
  useEffect(() => {
    setTimeout(() => {
      fitAddonRefs.current.forEach((addon, id) => {
        addon.fit();
        const term = xtermRefs.current.get(id);
        if (term) {
          window.electronAPI.resizeTerminal(id, term.cols, term.rows);
        }
      });
    }, 300);
  }, [isFullscreen]);

  // Handle Visibility Change
  useEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        fitAddonRefs.current.forEach((addon, id) => {
          addon.fit();
          const term = xtermRefs.current.get(id);
          if (term) {
            window.electronAPI.resizeTerminal(id, term.cols, term.rows);
          }
        });
      }, 100);
    }
  }, [isVisible]);

  // Initial Load
  useEffect(() => {
    if (tabs.length === 0) {
      createTab(initialCommand, initialTitle);
    } else if (initialCommand) {
      createTab(initialCommand, initialTitle);
    }
  }, [initialCommand, initialTitle]); // Only run when initialCommand changes (or on mount)

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center justify-between px-2 shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer transition-colors min-w-[120px] max-w-[200px] border-t border-x border-transparent
                ${activeTabId === tab.id 
                  ? 'bg-white text-gray-800 border-gray-200 border-b-white -mb-[1px] z-10' 
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}
              `}
            >
              <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{tab.title}</span>
              <button 
                onClick={(e) => closeTab(tab.id, e)}
                className={`p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-gray-300 transition-all ${tabs.length === 1 ? 'hidden' : ''}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button 
            onClick={() => createTab()}
            className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors ml-1"
            title="New Terminal"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-2 ml-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          
          {/* Settings */}
          <div className="relative">
            <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-1.5 rounded transition-colors ${isSettingsOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            {isSettingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Type className="w-3 h-3" /> Font Size
                  </span>
                  <span className="text-xs text-gray-500">{fontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="24" 
                  step="1" 
                  value={fontSize} 
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            )}
          </div>

          {onToggleFullscreen && (
            <button 
              onClick={onToggleFullscreen}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Terminal Containers */}
      <div className="flex-1 relative bg-white">
        {tabs.map(tab => (
          <div 
            key={tab.id}
            ref={(el) => {
              if (el) containerRefs.current.set(tab.id, el);
              else containerRefs.current.delete(tab.id);
            }}
            className={`absolute inset-0 p-2 ${activeTabId === tab.id ? 'z-10 visible' : 'z-0 invisible'}`}
          />
        ))}
        {tabs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <TerminalIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>No active terminals</p>
              <button 
                onClick={() => createTab()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                Open Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
