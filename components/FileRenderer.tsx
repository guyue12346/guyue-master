import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { FileRecord } from '../types';
import { FileText, Maximize2, Minimize2, Info, Lightbulb, AlertCircle, AlertTriangle, ShieldAlert, Edit, List, FolderSearch, RefreshCw, Type, Minus, Plus } from 'lucide-react';

type ReadingTheme = 'default' | 'sepia' | 'dark';

interface ReadingSettings {
  fontSize: number;   // 14-22
  lineHeight: number;  // 1.6-2.4
  theme: ReadingTheme;
}

const READING_SETTINGS_KEY = 'linkmaster_reading_settings';

const loadReadingSettings = (): ReadingSettings => {
  try {
    const saved = localStorage.getItem(READING_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { fontSize: 16, lineHeight: 1.8, theme: 'default' };
};

const themeStyles: Record<ReadingTheme, { bg: string; text: string; prose: string; label: string }> = {
  default: { bg: 'bg-white', text: 'text-gray-800', prose: 'prose-slate', label: '默认' },
  sepia:   { bg: 'bg-amber-50/60', text: 'text-amber-950', prose: 'prose-stone', label: '护眼' },
  dark:    { bg: 'bg-gray-900', text: 'text-gray-200', prose: 'prose-invert', label: '暗色' },
};

interface FileRendererProps {
  file: FileRecord | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEdit?: () => void;
  onRelocate?: (file: FileRecord) => void;
}

export const FileRenderer: React.FC<FileRendererProps> = ({ 
  file,
  isFullscreen,
  onToggleFullscreen,
  onEdit,
  onRelocate
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([]);
  const [fileNotFound, setFileNotFound] = useState(false);
  const [readingSettings, setReadingSettings] = useState<ReadingSettings>(loadReadingSettings);
  const [showReadingControls, setShowReadingControls] = useState(false);
  const [activeTocId, setActiveTocId] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

  const updateSettings = useCallback((partial: Partial<ReadingSettings>) => {
    setReadingSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(READING_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const loadContent = async () => {
      if (!file) {
        setContent('');
        setToc([]);
        setFileNotFound(false);
        return;
      }

      setFileNotFound(false);

      // Check file existence first
      if (window.electronAPI?.checkFileExists) {
        const exists = await window.electronAPI.checkFileExists(file.path);
        if (!exists) {
          setFileNotFound(true);
          setLoading(false);
          setContent('');
          setToc([]);
          return;
        }
      }

      const ext = file.type.toLowerCase().replace('.', '');
      
      if (['md', 'markdown', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py'].includes(ext)) {
        setLoading(true);
        try {
          if (window.electronAPI && window.electronAPI.readFile) {
            const text = await window.electronAPI.readFile(file.path);
            if (text === null) {
              setFileNotFound(true);
              return;
            }
            setContent(text || '');
            
            // Generate TOC for markdown
            if (['md', 'markdown'].includes(ext)) {
              const headers: { level: number; text: string; id: string }[] = [];
              const lines = (text || '').split('\n');
              let inCodeBlock = false;
              
              lines.forEach(line => {
                if (line.trim().startsWith('```')) {
                  inCodeBlock = !inCodeBlock;
                  return;
                }
                if (inCodeBlock) return;

                const match = line.match(/^(#{1,6})\s+(.+)$/);
                if (match) {
                  const level = match[1].length;
                  const text = match[2].trim();
                  const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                  headers.push({ level, text, id });
                }
              });
              setToc(headers);
            } else {
              setToc([]);
            }

          } else {
            setContent('预览模式不支持读取本地文件 (Web Demo)');
          }
        } catch (err) {
          console.error(err);
          setFileNotFound(true);
        } finally {
          setLoading(false);
        }
      } else {
        setContent('');
        setToc([]);
      }
    };

    loadContent();
  }, [file]);

  // TOC scroll spy
  useEffect(() => {
    if (!showTOC || toc.length === 0) return;
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollContainer = container.querySelector('.overflow-y-auto') || container;
      const headings = toc.map(t => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
      let activeId = '';
      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 120) {
          activeId = heading.id;
        }
      }
      setActiveTocId(activeId);
    };

    const scrollEl = container.querySelector('.overflow-y-auto') || container;
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [showTOC, toc]);

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white">
        <FileText className="w-16 h-16 mb-4 text-gray-200" />
        <p>请从左侧选择文件开始阅读</p>
      </div>
    );
  }

  if (fileNotFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8 text-orange-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-700">文件未找到</h2>
          <p className="text-sm text-gray-400">文件可能已被移动、重命名或删除</p>
          <p className="text-xs text-gray-300 font-mono break-all bg-gray-50 p-3 rounded-lg border border-gray-100">{file.path}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            {onRelocate && (
              <button
                onClick={() => onRelocate(file)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
              >
                <FolderSearch className="w-4 h-4" />
                重新定位
              </button>
            )}
            <button
              onClick={() => { setFileNotFound(false); setContent(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMarkdown = ['md', 'markdown'].includes(file.type.toLowerCase().replace('.', ''));
  const ts = themeStyles[readingSettings.theme];

  return (
    <div className={`flex flex-col h-full overflow-hidden relative ${isMarkdown ? ts.bg : 'bg-white'}`} ref={contentRef}>
      {/* Header */}
      <div className={`h-16 border-b flex items-center justify-between px-8 z-10 shrink-0 ${
        readingSettings.theme === 'dark' && isMarkdown ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100'
      }`} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex flex-col min-w-0">
           <h1 className={`text-xl font-bold truncate ${
             readingSettings.theme === 'dark' && isMarkdown ? 'text-gray-100' : 'text-gray-800'
           }`} title={file.name}>
             {file.name}
           </h1>
        </div>
        
        <div className="flex items-center gap-1 ml-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Reading controls toggle */}
          {isMarkdown && (
            <div className="relative">
              <button 
                onClick={() => setShowReadingControls(!showReadingControls)}
                className={`p-2 rounded-lg transition-colors ${showReadingControls ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                title="阅读设置"
              >
                <Type className="w-5 h-5" />
              </button>
              {showReadingControls && (
                <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-gray-200 p-4 space-y-4 z-50">
                  {/* Font size */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">字体大小 ({readingSettings.fontSize}px)</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateSettings({ fontSize: Math.max(12, readingSettings.fontSize - 1) })} className="p-1 rounded hover:bg-gray-100"><Minus className="w-3.5 h-3.5" /></button>
                      <input type="range" min="12" max="24" value={readingSettings.fontSize} onChange={e => updateSettings({ fontSize: +e.target.value })} className="flex-1 accent-blue-500" />
                      <button onClick={() => updateSettings({ fontSize: Math.min(24, readingSettings.fontSize + 1) })} className="p-1 rounded hover:bg-gray-100"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {/* Line height */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">行距 ({readingSettings.lineHeight.toFixed(1)})</label>
                    <input type="range" min="1.4" max="2.6" step="0.1" value={readingSettings.lineHeight} onChange={e => updateSettings({ lineHeight: +e.target.value })} className="w-full accent-blue-500" />
                  </div>
                  {/* Theme */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">阅读主题</label>
                    <div className="flex gap-2">
                      {(Object.keys(themeStyles) as ReadingTheme[]).map(theme => (
                        <button
                          key={theme}
                          onClick={() => updateSettings({ theme })}
                          className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${
                            readingSettings.theme === theme
                              ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                          }`}
                        >
                          {themeStyles[theme].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {isMarkdown && (
            <button 
              onClick={() => setShowTOC(!showTOC)}
              className={`p-2 rounded-lg transition-colors ${showTOC ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
              title="显示目录"
            >
              <List className="w-5 h-5" />
            </button>
          )}
          {onEdit && isMarkdown && (
            <button 
              onClick={onEdit}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="编辑文件"
            >
              <Edit className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={onToggleFullscreen}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title={isFullscreen ? "退出全屏" : "全屏阅读"}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative flex">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <div className={`flex-1 overflow-hidden relative ${showTOC ? 'mr-64' : ''}`}>
               {renderFileContent(file, content, readingSettings)}
            </div>
            
            {/* TOC Sidebar with active highlighting */}
            {showTOC && isMarkdown && (
              <div className={`absolute top-0 right-0 bottom-0 w-64 border-l overflow-y-auto p-4 animate-in slide-in-from-right duration-200 ${
                readingSettings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`}>
                <h3 className={`font-semibold mb-4 px-2 ${readingSettings.theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>目录</h3>
                {toc.length === 0 ? (
                  <p className="text-sm text-gray-400 px-2">暂无目录</p>
                ) : (
                  <nav className="space-y-0.5">
                    {toc.map((item, index) => {
                      const isActive = activeTocId === item.id;
                      return (
                        <a
                          key={index}
                          href={`#${item.id}`}
                          className={`block text-sm px-2 py-1.5 rounded transition-all truncate ${
                            isActive
                              ? 'text-blue-600 bg-blue-50 font-medium'
                              : readingSettings.theme === 'dark'
                                ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
                                : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                          onClick={(e) => {
                            e.preventDefault();
                            const element = document.getElementById(item.id);
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth' });
                            }
                          }}
                        >
                          {item.text}
                        </a>
                      );
                    })}
                  </nav>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const renderFileContent = (file: FileRecord, content: string, settings?: ReadingSettings) => {
  const ext = file.type.toLowerCase().replace('.', '');

  if (ext === 'pdf') {
    return (
      <iframe 
        src={`file://${file.path}`} 
        className="w-full h-full border-none"
        title={file.name}
      />
    );
  }

  if (['md', 'markdown'].includes(ext)) {
    // 如果内容为空，显示提示
    if (!content || content.trim() === '') {
      return (
        <div className="h-full flex items-center justify-center bg-white">
          <div className="text-center text-gray-400">
            <p className="text-lg">文档内容为空</p>
            <p className="text-sm mt-2">请编辑此文档添加内容</p>
          </div>
        </div>
      );
    }
    
    // Pre-process content:
    // 1. Ensure $$...$$ is treated as block math
    let formattedContent = content.replace(/(\$\$[\s\S]+?\$\$)/g, '\n\n$1\n\n');
    
    // 2. Support Obsidian style image embeds: ![[filename|width]] -> ![width](filename)
    formattedContent = formattedContent.replace(/!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, filename, args) => {
      return `![${args || ''}](${filename})`;
    });

    const ts = settings ? themeStyles[settings.theme] : themeStyles.default;
    const fontSize = settings?.fontSize || 16;
    const lineHeight = settings?.lineHeight || 1.8;

    return (
      <div className={`h-full overflow-y-auto p-8 md:p-12 lg:p-16 ${ts.bg} ${ts.text} select-text transition-colors duration-200`}>
        {/* Custom Styles for Math and Alerts */}
        <style>{`
          /* KaTeX Center Alignment */
          .katex-display {
            display: block !important;
            text-align: center !important;
            margin: 1em 0 !important;
          }
          .katex-display > .katex {
            display: inline-block !important;
            text-align: center !important;
          }

          /* Override prose inline code styles - remove auto-added quotes */
          .prose :where(code):not(:where([class~="not-prose"], [class~="not-prose"] *))::before,
          .prose :where(code):not(:where([class~="not-prose"], [class~="not-prose"] *))::after {
            content: none !important;
          }
          .prose :where(code):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
            background-color: #f3f4f6;
            padding: 0.2em 0.4em;
            border-radius: 0.25rem;
            font-size: 0.875em;
            font-weight: 500;
          }

          /* Override prose blockquote styles - no italic, no quotes */
          .prose :where(blockquote):not(:where([class~="not-prose"], [class~="not-prose"] *)) {
            font-style: normal !important;
            quotes: none !important;
          }
          .prose :where(blockquote):not(:where([class~="not-prose"], [class~="not-prose"] *)) p {
            font-style: normal !important;
          }
          .prose :where(blockquote):not(:where([class~="not-prose"], [class~="not-prose"] *))::before,
          .prose :where(blockquote):not(:where([class~="not-prose"], [class~="not-prose"] *))::after {
            content: none !important;
          }

          /* GitHub Alerts / Callouts */
          .markdown-alert {
            padding: 0.5rem 1rem;
            margin-bottom: 1rem;
            border-left: 0.25rem solid;
            border-radius: 0.25rem;
            font-size: 0.95em;
            font-style: normal !important;
          }
          .markdown-alert p {
            font-style: normal !important;
          }
          .markdown-alert-title {
            display: flex;
            align-items: center;
            font-weight: 600;
            margin-bottom: 0.25rem;
          }
          .markdown-alert-title svg {
            margin-right: 0.5rem;
            width: 16px;
            height: 16px;
            fill: currentColor;
          }

          /* Note */
          .markdown-alert-note { border-color: #0969da; background-color: #f0f6fc; color: #1f2328; }
          .markdown-alert-note .markdown-alert-title { color: #0969da; }

          /* Tip */
          .markdown-alert-tip { border-color: #1a7f37; background-color: #f0fdf4; color: #1f2328; }
          .markdown-alert-tip .markdown-alert-title { color: #1a7f37; }

          /* Important */
          .markdown-alert-important { border-color: #8250df; background-color: #fbfaff; color: #1f2328; }
          .markdown-alert-important .markdown-alert-title { color: #8250df; }

          /* Warning */
          .markdown-alert-warning { border-color: #9a6700; background-color: #fff8c5; color: #1f2328; }
          .markdown-alert-warning .markdown-alert-title { color: #9a6700; }

          /* Caution */
          .markdown-alert-caution { border-color: #d1242f; background-color: #fff5f5; color: #1f2328; }
          .markdown-alert-caution .markdown-alert-title { color: #d1242f; }

          /* Custom blockquote colors */
          .blockquote-color {
            padding: 0.5rem 1rem;
            margin: 1rem 0;
            border-left: 0.25rem solid;
            border-radius: 0.25rem;
            font-style: normal !important;
          }
          .blockquote-color p { font-style: normal !important; margin: 0; }

          /* 10 Color options */
          .bq-red { border-color: #ef4444 !important; background-color: #fef2f2 !important; }
          .bq-orange { border-color: #f97316 !important; background-color: #fff7ed !important; }
          .bq-yellow { border-color: #eab308 !important; background-color: #fefce8 !important; }
          .bq-green { border-color: #22c55e !important; background-color: #f0fdf4 !important; }
          .bq-blue { border-color: #3b82f6 !important; background-color: #eff6ff !important; }
          .bq-purple { border-color: #a855f7 !important; background-color: #faf5ff !important; }
          .bq-pink { border-color: #ec4899 !important; background-color: #fdf2f8 !important; }
          .bq-gray { border-color: #6b7280 !important; background-color: #f9fafb !important; }
          .bq-cyan { border-color: #06b6d4 !important; background-color: #ecfeff !important; }
          .bq-teal { border-color: #14b8a6 !important; background-color: #f0fdfa !important; }
        `}</style>
        <div className={`prose ${ts.prose} max-w-4xl mx-auto`} style={{ fontSize: `${fontSize}px`, lineHeight: lineHeight }}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h1 id={id} {...props}>{children}</h1>;
              },
              h2: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h2 id={id} {...props}>{children}</h2>;
              },
              h3: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h3 id={id} {...props}>{children}</h3>;
              },
              h4: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h4 id={id} {...props}>{children}</h4>;
              },
              h5: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h5 id={id} {...props}>{children}</h5>;
              },
              h6: ({node, children, ...props}) => {
                const text = String(children).replace(/\n/g, '');
                const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return <h6 id={id} {...props}>{children}</h6>;
              },
              blockquote: ({node, children, ...props}) => {
                const childrenArray = React.Children.toArray(children);
                const firstChild = childrenArray[0];
                const validColors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray', 'cyan', 'teal'];

                if (React.isValidElement(firstChild) && firstChild.type === 'p') {
                  const pProps = firstChild.props as { children?: React.ReactNode };
                  const pChildren = React.Children.toArray(pProps.children);
                  const firstText = pChildren[0];

                  if (typeof firstText === 'string') {
                    // Match [!NOTE|color] Title or [!NOTE] - Alert with optional color
                    const alertMatch = firstText.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)(?:\|(\w+))?\](?:[ \t]+)?(.*?)(\n|$)/i);
                    if (alertMatch) {
                      const type = alertMatch[1].toLowerCase();
                      const color = alertMatch[2]?.toLowerCase();
                      const title = alertMatch[3]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
                      const remainingText = firstText.substring(alertMatch[0].length);

                      const getAlertIcon = (t: string) => {
                        switch(t) {
                          case 'note': return <Info />;
                          case 'tip': return <Lightbulb />;
                          case 'important': return <AlertCircle />;
                          case 'warning': return <AlertTriangle />;
                          case 'caution': return <ShieldAlert />;
                          default: return <Info />;
                        }
                      };

                      const newPChildren = [remainingText, ...pChildren.slice(1)];
                      const hasContent = remainingText.trim() || newPChildren.length > 1;

                      // Use custom color if provided, otherwise use alert type color
                      const colorClass = color && validColors.includes(color) ? `bq-${color}` : '';
                      const alertClass = colorClass ? `markdown-alert ${colorClass}` : `markdown-alert markdown-alert-${type}`;

                      return (
                        <div className={alertClass}>
                          <p className="markdown-alert-title">
                            {getAlertIcon(type)}
                            {title}
                          </p>
                          {hasContent && <p>{newPChildren}</p>}
                          {childrenArray.slice(1)}
                        </div>
                      );
                    }

                    // Match [color] content - plain blockquote with color
                    const colorMatch = firstText.match(/^\s*\[(\w+)\]\s*/);
                    if (colorMatch && validColors.includes(colorMatch[1].toLowerCase())) {
                      const color = colorMatch[1].toLowerCase();
                      const remainingText = firstText.substring(colorMatch[0].length);
                      const newPChildren = [remainingText, ...pChildren.slice(1)];

                      return (
                        <div className={`blockquote-color bq-${color}`}>
                          <p>{newPChildren}</p>
                          {childrenArray.slice(1)}
                        </div>
                      );
                    }
                  }
                }
                return <blockquote {...props}>{children}</blockquote>;
              },
              pre: ({children}) => {
                // Filter out non-element children (like whitespace text nodes) to prevent artifacts
                const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
                return <>{validChildren.length > 0 ? validChildren : children}</>;
              },
              img: ({src, alt, ...props}) => {
                if (!src) return null;
                
                // Resolve local file path
                let finalSrc = src;
                if (!src.startsWith('http') && !src.startsWith('file://')) {
                  // Assuming the image is relative to the current file
                  const currentDir = file.path.substring(0, file.path.lastIndexOf('/'));
                  finalSrc = `file://${currentDir}/${src}`;
                  
                  // Special handling for .excalidraw files: try to load .svg or .png instead
                  // because browsers can't render .excalidraw JSON directly
                  if (src.endsWith('.excalidraw')) {
                     // You might want to check if .svg exists, but for now let's try appending .svg
                     // Or just assume the user meant the image export. 
                     // A common pattern is that the file is named .excalidraw but the image is .excalidraw.svg
                     finalSrc = finalSrc + '.svg'; 
                  }
                }

                // Parse alt text for width, border and caption
                // Syntax: ![alt|width|border|caption:图注] or ![alt|width|border|title:标题]
                const altText = alt || '';
                let width: string | undefined = undefined;
                let hasBorder = false;
                let caption: string | undefined = undefined;
                let captionStyle: 'italic' | 'bold' = 'italic'; // 默认灰色斜体
                let realAlt = altText;

                // Split by pipe (support both half-width | and full-width ｜)
                const parts = altText.split(/\||｜/);
                
                if (parts.length > 1) {
                    realAlt = parts[0];
                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i].trim();
                        const partLower = part.toLowerCase();
                        if (partLower === 'border') {
                            hasBorder = true;
                        } else if (partLower.startsWith('caption:')) {
                            // caption: 灰色斜体样式
                            caption = part.replace(/^caption:/i, '').trim();
                            captionStyle = 'italic';
                        } else if (partLower.startsWith('title:') || part.startsWith('标题:') || part.startsWith('标题：')) {
                            // title:/标题: 黑色加粗样式
                            caption = part.replace(/^(title:|标题:|标题：)/i, '').trim();
                            captionStyle = 'bold';
                        } else if (/^\d+(%|px)?$/.test(partLower)) {
                             if (!isNaN(Number(partLower))) {
                                 width = `${partLower}px`;
                             } else {
                                 width = partLower;
                             }
                        }
                    }
                } else {
                    // Handle case where alt is just a number (Obsidian style from pre-processing)
                    if (!isNaN(Number(altText)) && altText.trim() !== '') {
                        width = `${altText}px`;
                    }
                }

                const imgStyle: React.CSSProperties = { 
                    width: width,
                    maxWidth: '100%' 
                };

                // Default: no border, no shadow. 
                let imgClassName = "mx-auto"; 
                
                if (hasBorder) {
                    imgClassName += " rounded-lg shadow-md";
                }

                const imgElement = (
                  <img 
                    src={finalSrc} 
                    alt={realAlt} 
                    style={imgStyle}
                    className={imgClassName}
                    onError={(e) => {
                      // Fallback for excalidraw: try .png if .svg failed
                      const target = e.target as HTMLImageElement;
                      if (target.src.endsWith('.excalidraw.svg')) {
                        target.src = target.src.replace('.svg', '.png');
                      }
                    }}
                    {...props} 
                  />
                );

                // If caption exists, wrap in figure element
                if (caption) {
                  const captionClassName = captionStyle === 'bold' 
                    ? 'mt-2 text-sm text-gray-800 text-center font-bold'
                    : 'mt-2 text-sm text-gray-500 text-center italic';
                  return (
                    <figure className="my-4 flex flex-col items-center">
                      {imgElement}
                      <figcaption className={captionClassName}>
                        {caption}
                      </figcaption>
                    </figure>
                  );
                }

                return (
                  <div className="my-4">
                    {imgElement}
                  </div>
                );
              },
              code: ({node, inline, className, children, ...props}: any) => {
                const isSuibi = className?.includes('language-随笔');
                // Handle "代码块" as a generic code block language
                const isGenericCodeBlock = className?.includes('language-代码块');
                const match = /language-(\w+)/.exec(className || '');
                
                if (!inline && isSuibi) {
                  return (
                    <div className="my-6 p-6 bg-stone-50 border border-stone-200 rounded-lg shadow-sm">
                      <div className="font-serif text-lg font-medium text-stone-800 mb-4 border-b border-stone-200 pb-2">
                        随笔
                      </div>
                      <div className="whitespace-pre-wrap font-serif text-stone-700 leading-loose text-base">
                        {children}
                      </div>
                    </div>
                  );
                }

                if (!inline && (match || isGenericCodeBlock)) {
                  // Normalize language: C++ -> cpp, etc.
                  let lang = isGenericCodeBlock ? 'text' : match?.[1]?.toLowerCase();
                  if (lang === 'c++') lang = 'cpp';
                  if (lang === 'c#') lang = 'csharp';

                  return (
                    <SyntaxHighlighter
                      {...props}
                      style={oneLight}
                      language={lang}
                      PreTag="div"
                      className="not-prose"
                      customStyle={{
                        backgroundColor: '#f5f5f7', // macOS style gray
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        margin: '1rem 0',
                        fontSize: '0.9em',
                        border: '1px solid #e5e7eb'
                      }}
                      codeTagProps={{
                        className: 'not-prose',
                        style: {
                          fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace'
                        }
                      }}
                      showLineNumbers={true}
                      lineNumberStyle={{
                        minWidth: '2.5em',
                        paddingRight: '1em',
                        color: '#9ca3af', // gray-400
                        textAlign: 'right'
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                }

                if (inline) {
                  return <code className={className} {...props}>{children}</code>;
                }

                return (
                  <pre className={`not-prose p-4 rounded-lg bg-gray-900 text-gray-100 overflow-x-auto ${className || ''}`} {...props}>
                    <code className={`bg-transparent p-0 border-none ${className || ''}`} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              }
            }}
          >
            {formattedContent}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  if (['py', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'json', 'java', 'cpp', 'c', 'h', 'sql', 'sh', 'yaml', 'yml', 'xml'].includes(ext)) {
    let lang = ext;
    if (lang === 'py') lang = 'python';
    if (lang === 'js') lang = 'javascript';
    if (lang === 'ts') lang = 'typescript';
    if (lang === 'sh') lang = 'bash';
    if (lang === 'yml') lang = 'yaml';

    return (
      <div className="h-full overflow-y-auto bg-white">
        <SyntaxHighlighter
          style={oneLight}
          language={lang}
          showLineNumbers={true}
          customStyle={{ 
            margin: 0, 
            height: '100%', 
            backgroundColor: '#fff',
            fontSize: '0.9rem',
            lineHeight: '1.5'
          }}
          lineNumberStyle={{
            minWidth: '3em',
            paddingRight: '1em',
            color: '#ccc',
            textAlign: 'right'
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    );
  }

  if (['txt'].includes(ext)) {
    return (
      <div className="h-full overflow-y-auto p-8 bg-white">
        <pre className="font-mono text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <p>暂不支持预览此类型文件</p>
    </div>
  );
};
