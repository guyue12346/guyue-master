import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { Terminal as TerminalIcon, Maximize2, Minimize2, Plus, X, Settings, Type } from 'lucide-react';

interface TerminalProps {
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  initialCommand?: string;
  initialTitle?: string;
  isVisible?: boolean;
  hideHeader?: boolean;
  forcedRendererMode?: TerminalRendererMode;
  forcedTerminalProfile?: TerminalProfile;
  postLaunchInputs?: Array<{ data: string; delayMs?: number }>;
  onActiveTerminalChange?: (id: string | null) => void;
  spawnOnInitialChange?: boolean;
}

interface TerminalTab {
  id: string;
  title: string;
}

type TerminalRendererMode = 'auto' | 'compatibility';
type TerminalProfile = 'default' | 'coding-cli';

const DEFAULT_TERMINAL_FONT = '"SF Mono", "JetBrains Mono", "Cascadia Mono", Menlo, Monaco, "Fira Code", "Noto Sans Mono CJK SC", "PingFang SC", monospace';
const FONT_OPTIONS = [
  { label: 'SF Mono', value: '"SF Mono", Menlo, Monaco, monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace' },
  { label: 'Cascadia Mono', value: '"Cascadia Mono", "SF Mono", Menlo, Monaco, monospace' },
  { label: 'Menlo', value: 'Menlo, Monaco, "Courier New", monospace' },
  { label: 'Fira Code', value: '"Fira Code", "SF Mono", Menlo, Monaco, monospace' },
];

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

export const Terminal: React.FC<TerminalProps> = ({
  isFullscreen,
  onToggleFullscreen,
  initialCommand,
  initialTitle,
  isVisible = true,
  hideHeader = false,
  forcedRendererMode,
  forcedTerminalProfile,
  postLaunchInputs = [],
  onActiveTerminalChange,
  spawnOnInitialChange = true,
}) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem('terminal_font_size') || '14');
    return Number.isFinite(saved) ? saved : 14;
  });
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('terminal_font_family') || DEFAULT_TERMINAL_FONT);
  const [lineHeight, setLineHeight] = useState(() => {
    const saved = Number(localStorage.getItem('terminal_line_height') || '1.2');
    return Number.isFinite(saved) ? saved : 1.2;
  });
  const [letterSpacing, setLetterSpacing] = useState(() => {
    const saved = Number(localStorage.getItem('terminal_letter_spacing') || '0');
    return Number.isFinite(saved) ? saved : 0;
  });
  const [rendererMode, setRendererMode] = useState<TerminalRendererMode>(() => {
    return localStorage.getItem('terminal_renderer_mode') === 'compatibility' ? 'compatibility' : 'auto';
  });
  const [terminalProfile, setTerminalProfile] = useState<TerminalProfile>(() => {
    return localStorage.getItem('terminal_profile') === 'coding-cli' ? 'coding-cli' : 'default';
  });
  const [showSeparator, setShowSeparator] = useState(() => {
    return localStorage.getItem('terminal_show_separator') === 'true';
  });
  const [showGreenDot, setShowGreenDot] = useState(() => {
    const saved = localStorage.getItem('terminal_show_green_dot');
    return saved === null ? true : saved === 'true';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState('Terminal');
  const defaultTitleRef = useRef('Terminal');
  const effectiveRendererMode = forcedRendererMode || rendererMode;
  const effectiveTerminalProfile = forcedTerminalProfile || terminalProfile;

  const sendPostLaunchInputs = useCallback((id: string) => {
    postLaunchInputs.forEach(({ data, delayMs = 0 }) => {
      window.setTimeout(() => {
        window.electronAPI.writeTerminal(id, data);
      }, delayMs);
    });
  }, [postLaunchInputs]);

  // Refs to keep track of terminal instances and DOM elements
  const xtermRefs = useRef<Map<string, XTerm>>(new Map());
  const fitAddonRefs = useRef<Map<string, FitAddon>>(new Map());
  const webglAddonRefs = useRef<Map<string, WebglAddon>>(new Map());
  const unicodeAddonRefs = useRef<Map<string, Unicode11Addon>>(new Map());
  const webLinksAddonRefs = useRef<Map<string, WebLinksAddon>>(new Map());
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const resizeObserverRefs = useRef<Map<string, ResizeObserver>>(new Map());
  const fitFrameRefs = useRef<Map<string, number>>(new Map());
  
  // We need a ref for the current active tab ID to use in the global data listener
  // because the listener closure captures the initial state
  const tabsRef = useRef<TerminalTab[]>([]);
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    onActiveTerminalChange?.(activeTabId);
  }, [activeTabId, onActiveTerminalChange]);

  useEffect(() => {
    localStorage.setItem('terminal_font_size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('terminal_font_family', fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    localStorage.setItem('terminal_line_height', String(lineHeight));
  }, [lineHeight]);

  useEffect(() => {
    localStorage.setItem('terminal_letter_spacing', String(letterSpacing));
  }, [letterSpacing]);

  useEffect(() => {
    if (forcedRendererMode) return;
    localStorage.setItem('terminal_renderer_mode', rendererMode);
  }, [rendererMode, forcedRendererMode]);

  useEffect(() => {
    if (forcedTerminalProfile) return;
    localStorage.setItem('terminal_profile', terminalProfile);
  }, [terminalProfile, forcedTerminalProfile]);

  const fitTerminal = useCallback((id: string) => {
    const fitAddon = fitAddonRefs.current.get(id);
    const term = xtermRefs.current.get(id);
    const container = containerRefs.current.get(id);
    if (!fitAddon || !term || !container) return;
    if (container.clientWidth <= 0 || container.clientHeight <= 0) return;

    try {
      fitAddon.fit();
      if (term.cols > 0 && term.rows > 0) {
        window.electronAPI.resizeTerminal(id, term.cols, term.rows);
      }
    } catch (error) {
      console.warn('Failed to fit terminal', id, error);
    }
  }, []);

  const scheduleFitTerminal = useCallback((id: string) => {
    const pending = fitFrameRefs.current.get(id);
    if (pending) {
      cancelAnimationFrame(pending);
    }

    const frame = requestAnimationFrame(() => {
      fitTerminal(id);
      fitFrameRefs.current.delete(id);
    });
    fitFrameRefs.current.set(id, frame);
  }, [fitTerminal]);

  const applyRendererMode = useCallback((id: string, term: XTerm) => {
    if (effectiveRendererMode === 'compatibility') {
      const existingAddon = webglAddonRefs.current.get(id);
      if (existingAddon) {
        existingAddon.dispose();
        webglAddonRefs.current.delete(id);
        term.refresh(0, Math.max(0, term.rows - 1));
      }
      return;
    }

    if (webglAddonRefs.current.has(id)) return;

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
      webglAddonRefs.current.set(id, webglAddon);
    } catch (error) {
      console.warn('WebGL terminal renderer unavailable, falling back to the default renderer.', error);
    }
  }, [effectiveRendererMode]);

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

    const unsubscribe = window.electronAPI.onTerminalData(handleData);

    return () => {
      unsubscribe?.();
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

      // Configure Shell Prompt (Zsh specific)
      // We delay this slightly to ensure the shell has started and sourced .zshrc
      setTimeout(() => {
        if (effectiveTerminalProfile === 'coding-cli') {
          if (command) {
            window.electronAPI.writeTerminal(id, `${command}\n`);
          }
          sendPostLaunchInputs(id);
          return;
        }

        // If neither feature is enabled, do not send any PROMPT command
        if (!showSeparator && !showGreenDot) {
          // Still need to send initial command if any
          if (command) {
            window.electronAPI.writeTerminal(id, `${command}\n`);
          }
          return;
        }

        // Construct PS1 parts
        const separatorPart = showSeparator ? `%F{240}----------------------------------------------------------------%f\\n` : '';
        const dotPart = showGreenDot ? `%F{green}●%f ` : '';
        const basePart = `%n@%m %1~ %# `;
        
        // Use $'' string for newline support in zsh
        const ps1Command = `export PROMPT=$'${separatorPart}${dotPart}${basePart}'`;
        
        // Send command with leading space to avoid history, then clear screen
        window.electronAPI.writeTerminal(id, ` ${ps1Command}; clear\n`);
        
        // If there's a command, we need to send it after initialization
        if (command) {
          setTimeout(() => {
             window.electronAPI.writeTerminal(id, `${command}\n`);
          }, 100);
        }
        sendPostLaunchInputs(id);
      }, 600);

    } catch (error) {
      console.error('Failed to create terminal tab:', error);
    }
  }, [showSeparator, showGreenDot, effectiveTerminalProfile, sendPostLaunchInputs]);

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
    webglAddonRefs.current.get(id)?.dispose();
    webglAddonRefs.current.delete(id);
    unicodeAddonRefs.current.get(id)?.dispose();
    unicodeAddonRefs.current.delete(id);
    webLinksAddonRefs.current.get(id)?.dispose();
    webLinksAddonRefs.current.delete(id);
    resizeObserverRefs.current.get(id)?.disconnect();
    resizeObserverRefs.current.delete(id);
    const pending = fitFrameRefs.current.get(id);
    if (pending) cancelAnimationFrame(pending);
    fitFrameRefs.current.delete(id);
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
          allowProposedApi: true,
          cursorBlink: true,
          cursorStyle: 'block',
          cursorWidth: 2,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fontWeight: '400',
          fontWeightBold: '600',
          letterSpacing: letterSpacing,
          lineHeight: lineHeight,
          scrollback: 10000,
          allowTransparency: false,
          customGlyphs: true,
          drawBoldTextInBrightColors: true,
          macOptionIsMeta: true,
          minimumContrastRatio: 4.5,
          rightClickSelectsWord: true,
          smoothScrollDuration: 0,
          theme: LIGHT_THEME,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        const unicodeAddon = new Unicode11Addon();
        term.loadAddon(unicodeAddon);
        term.unicode.activeVersion = '11';
        const webLinksAddon = new WebLinksAddon((event, uri) => {
          event.preventDefault();
          window.open(uri, '_blank', 'noopener,noreferrer');
        });
        term.loadAddon(webLinksAddon);
        
        term.open(container);
        applyRendererMode(tab.id, term);

        // Store refs
        xtermRefs.current.set(tab.id, term);
        fitAddonRefs.current.set(tab.id, fitAddon);
        unicodeAddonRefs.current.set(tab.id, unicodeAddon);
        webLinksAddonRefs.current.set(tab.id, webLinksAddon);

        if (typeof ResizeObserver !== 'undefined') {
          const resizeObserver = new ResizeObserver(() => {
            scheduleFitTerminal(tab.id);
          });
          resizeObserver.observe(container);
          resizeObserverRefs.current.set(tab.id, resizeObserver);
        }

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
          scheduleFitTerminal(tab.id);
          document.fonts?.ready?.then(() => scheduleFitTerminal(tab.id)).catch(() => {});
          
          // Execute initial command if any
          if ((tab as any).initialCommand) {
            window.electronAPI.writeTerminal(tab.id, (tab as any).initialCommand + '\n');
            delete (tab as any).initialCommand;
          }
        }, 100);
      }
    });
  }, [tabs, fontSize, fontFamily, lineHeight, letterSpacing, scheduleFitTerminal, applyRendererMode]);

  // Handle Font Size Change
  useEffect(() => {
    xtermRefs.current.forEach(term => {
      term.options.fontSize = fontSize;
      term.options.fontFamily = fontFamily;
      term.options.lineHeight = lineHeight;
      term.options.letterSpacing = letterSpacing;
    });
    tabsRef.current.forEach(tab => scheduleFitTerminal(tab.id));
  }, [fontSize, fontFamily, lineHeight, letterSpacing, scheduleFitTerminal]);

  useEffect(() => {
    tabsRef.current.forEach(tab => {
      const term = xtermRefs.current.get(tab.id);
      if (!term) return;
      applyRendererMode(tab.id, term);
      scheduleFitTerminal(tab.id);
    });
  }, [effectiveRendererMode, applyRendererMode, scheduleFitTerminal]);

  // Handle Resize Window
  useEffect(() => {
    const handleResize = () => {
      tabsRef.current.forEach(tab => scheduleFitTerminal(tab.id));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scheduleFitTerminal]);

  // Handle Fullscreen Change
  useEffect(() => {
    const timer = window.setTimeout(() => {
      tabsRef.current.forEach(tab => scheduleFitTerminal(tab.id));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isFullscreen, scheduleFitTerminal]);

  // Handle Visibility Change
  useEffect(() => {
    if (isVisible) {
      const timer = window.setTimeout(() => {
        tabsRef.current.forEach(tab => scheduleFitTerminal(tab.id));
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      tabsRef.current.forEach(tab => {
        try {
          window.electronAPI.closeTerminal(tab.id);
        } catch (error) {
          console.warn('Failed to close terminal during cleanup', tab.id, error);
        }
      });
      resizeObserverRefs.current.forEach(observer => observer.disconnect());
      fitFrameRefs.current.forEach(frame => cancelAnimationFrame(frame));
      webglAddonRefs.current.forEach(addon => addon.dispose());
      unicodeAddonRefs.current.forEach(addon => addon.dispose());
      webLinksAddonRefs.current.forEach(addon => addon.dispose());
      xtermRefs.current.forEach(term => term.dispose());
      resizeObserverRefs.current.clear();
      fitFrameRefs.current.clear();
      webglAddonRefs.current.clear();
      unicodeAddonRefs.current.clear();
      webLinksAddonRefs.current.clear();
      fitAddonRefs.current.clear();
      xtermRefs.current.clear();
      containerRefs.current.clear();
    };
  }, []);

  // Initial Load
  useEffect(() => {
    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true;
      createTab(initialCommand, initialTitle);
      return;
    }

    if (spawnOnInitialChange && initialCommand) {
      createTab(initialCommand, initialTitle);
    }
  }, [initialCommand, initialTitle, createTab, spawnOnInitialChange]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      {!hideHeader && (
      <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center justify-between px-2 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        
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
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-50 space-y-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">终端档案</label>
                  <select
                    value={terminalProfile}
                    onChange={(e) => setTerminalProfile(e.target.value as TerminalProfile)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400"
                  >
                    <option value="default">默认</option>
                    <option value="coding-cli">编程 CLI</option>
                  </select>
                  <p className="mt-1 text-[10px] leading-4 text-gray-400">
                    编程 CLI 档案会关闭自定义 prompt 装饰，减少界面噪声。
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">渲染模式</label>
                  <select
                    value={rendererMode}
                    onChange={(e) => setRendererMode(e.target.value as TerminalRendererMode)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400"
                  >
                    <option value="auto">自适应 GPU</option>
                    <option value="compatibility">兼容模式</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-gray-600">字体</label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400"
                  >
                    {FONT_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

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

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Line Height</span>
                    <span className="text-xs text-gray-500">{lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="1.5"
                    step="0.05"
                    value={lineHeight}
                    onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Letter Spacing</span>
                    <span className="text-xs text-gray-500">{letterSpacing.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="-0.5"
                    max="1.5"
                    step="0.1"
                    value={letterSpacing}
                    onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className={`text-xs font-medium ${terminalProfile === 'coding-cli' ? 'text-gray-300' : 'text-gray-600'}`}>Show Separator</span>
                    <div className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${showSeparator ? 'bg-blue-600' : 'bg-gray-200'}`}>
                      <input 
                        type="checkbox" 
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                        checked={showSeparator}
                        disabled={terminalProfile === 'coding-cli'}
                        onChange={(e) => {
                          const newVal = e.target.checked;
                          setShowSeparator(newVal);
                          localStorage.setItem('terminal_show_separator', String(newVal));
                        }}
                      />
                      <span className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ${showSeparator ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className={`text-xs font-medium ${terminalProfile === 'coding-cli' ? 'text-gray-300' : 'text-gray-600'}`}>Show Green Dot</span>
                    <div className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${showGreenDot ? 'bg-blue-600' : 'bg-gray-200'}`}>
                      <input 
                        type="checkbox" 
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                        checked={showGreenDot}
                        disabled={terminalProfile === 'coding-cli'}
                        onChange={(e) => {
                          const newVal = e.target.checked;
                          setShowGreenDot(newVal);
                          localStorage.setItem('terminal_show_green_dot', String(newVal));
                        }}
                      />
                      <span className={`absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full shadow transform transition-transform duration-200 ${showGreenDot ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </label>
                </div>
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
      )}

      {/* Terminal Containers */}
      <div className="flex-1 relative min-h-0 bg-white">
        {tabs.map(tab => (
          <div 
            key={tab.id}
            ref={(el) => {
              if (el) containerRefs.current.set(tab.id, el);
              else containerRefs.current.delete(tab.id);
            }}
            className={`terminal-surface absolute inset-0 p-2 ${activeTabId === tab.id ? 'z-10 visible' : 'z-0 invisible'}`}
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
