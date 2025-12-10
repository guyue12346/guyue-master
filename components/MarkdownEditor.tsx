import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { MarkdownNote } from '../types';
import { Save, Edit3, Maximize2, Minimize2, Info, Lightbulb, AlertCircle, AlertTriangle, ShieldAlert, Book, List } from 'lucide-react';

interface MarkdownEditorProps {
  note: MarkdownNote | null;
  onUpdate: (id: string, updates: Partial<MarkdownNote>) => Promise<void> | void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  viewMode?: 'split' | 'single';
  showViewToggle?: boolean;
  hideMetadata?: boolean;
  hideCategory?: boolean;
  initialEditMode?: boolean;
  onExitEdit?: () => void;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({ 
  note, 
  onUpdate,
  isFullscreen,
  onToggleFullscreen,
  viewMode = 'split',
  showViewToggle = false,
  hideMetadata = false,
  hideCategory = false,
  initialEditMode = false,
  onExitEdit
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([]);

  // Generate TOC from content
  useEffect(() => {
    if (content) {
      const headers: { level: number; text: string; id: string }[] = [];
      const lines = content.split('\n');
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
  }, [content]);

  useEffect(() => {
    if (note) {
      setContent(note.content);
      setTitle(note.title);
      setCategory(note.category);
      // If onExitEdit is provided, we assume we start in edit mode (File Management)
      // Or if initialEditMode is true
      if (onExitEdit || initialEditMode) {
        setIsEditing(true);
      }
    } else {
      setContent('');
      setTitle('');
      setCategory('');
    }
  }, [note, onExitEdit, initialEditMode]);

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white">
        <p>请从左侧选择笔记开始编写</p>
      </div>
    );
  }

  const handleSave = async () => {
    await onUpdate(note.id, { content, title, category, updatedAt: Date.now() });
    setIsEditing(false);
  };

  // Pre-process content for math and images
  const processContent = (raw: string) => {
    let processed = raw.replace(/(\$\$[\s\S]+?\$\$)/g, '\n\n$1\n\n');
    processed = processed.replace(/!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, filename, args) => {
      return `![${args || ''}](${filename})`;
    });
    return processed;
  };

  const renderMarkdown = (markdownContent: string) => (
    <>
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

        /* GitHub Alerts / Callouts */
        .markdown-alert {
          padding: 0.5rem 1rem;
          margin-bottom: 1rem;
          border-left: 0.25rem solid;
          border-radius: 0.25rem;
          font-size: 0.95em;
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
      `}</style>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          blockquote: ({node, children, ...props}) => {
            const childrenArray = React.Children.toArray(children);
            const firstChild = childrenArray[0];
            
            if (React.isValidElement(firstChild) && firstChild.type === 'p') {
              const props = firstChild.props as { children?: React.ReactNode };
              const pChildren = React.Children.toArray(props.children);
              const firstText = pChildren[0];
              
              if (typeof firstText === 'string') {
                // Match [!NOTE] Title or [!NOTE]
                const match = firstText.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+)?(.*?)(\n|$)/i);
                if (match) {
                  const type = match[1].toLowerCase();
                  // If title group is empty, use type as title
                  const title = match[2]?.trim() || type.charAt(0).toUpperCase() + type.slice(1);
                  const remainingText = firstText.substring(match[0].length);
                  
                  const getAlertIcon = (t: string) => {
                    switch(t) {
                      case 'note': return <Info className="w-4 h-4" />;
                      case 'tip': return <Lightbulb className="w-4 h-4" />;
                      case 'important': return <AlertCircle className="w-4 h-4" />;
                      case 'warning': return <AlertTriangle className="w-4 h-4" />;
                      case 'caution': return <ShieldAlert className="w-4 h-4" />;
                      default: return <Info className="w-4 h-4" />;
                    }
                  };

                  const newPChildren = [remainingText, ...pChildren.slice(1)];
                  const hasContent = remainingText.trim() || newPChildren.length > 1;

                  return (
                    <div className={`markdown-alert markdown-alert-${type}`}>
                      <p className="markdown-alert-title">
                        {getAlertIcon(type)}
                        {title}
                      </p>
                      {hasContent && <p>{newPChildren}</p>}
                      {childrenArray.slice(1)}
                    </div>
                  );
                }
              }
            }
            return <blockquote {...props}>{children}</blockquote>;
          },
          pre: ({children}) => {
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return <>{validChildren.length > 0 ? validChildren : children}</>;
          },
          img: ({src, alt, ...props}) => {
            if (!src) return null;
            
            // Parse alt text for width and border
            const altText = alt || '';
            let width: string | undefined = undefined;
            let hasBorder = false;
            let realAlt = altText;

            // Split by pipe (support both half-width | and full-width ｜)
            const parts = altText.split(/\||｜/);
            
            if (parts.length > 1) {
                realAlt = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    const part = parts[i].trim().toLowerCase();
                    if (part === 'border') {
                        hasBorder = true;
                    } else if (/^\d+(%|px)?$/.test(part)) {
                            if (!isNaN(Number(part))) {
                                width = `${part}px`;
                            } else {
                                width = part;
                            }
                    }
                }
            } else {
                if (!isNaN(Number(altText)) && altText.trim() !== '') {
                    width = `${altText}px`;
                }
            }

            const style: React.CSSProperties = { 
                width: width,
                maxWidth: '100%' 
            };

            let className = "mx-auto my-4"; 
            if (hasBorder) {
                className += " rounded-lg shadow-md";
            }

            return (
              <img 
                src={src} 
                alt={realAlt} 
                style={style}
                className={className}
                {...props} 
              />
            );
          },
          code: ({node, inline, className, children, ...props}: any) => {
            const isSuibi = className?.includes('language-随笔');
            const isGenericCodeBlock = className?.includes('language-代码块');
            const match = /language-(\w+)/.exec(className || '');
            
            if (!inline && isSuibi) {
              return (
                <div className="my-6 p-6 bg-stone-50 border border-stone-200 rounded-lg shadow-sm">
                  <div className="font-serif text-lg font-medium text-stone-800 mb-4 border-b border-stone-200 pb-2">随笔</div>
                  <div className="whitespace-pre-wrap font-serif text-stone-700 leading-loose text-base">{children}</div>
                </div>
              );
            }

            if (!inline && (match || isGenericCodeBlock)) {
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
                    backgroundColor: '#f5f5f7',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    margin: '1rem 0',
                    fontSize: '0.9em',
                    border: '1px solid #e5e7eb'
                  }}
                  codeTagProps={{
                    className: 'not-prose',
                    style: { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' }
                  }}
                  showLineNumbers={true}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
          a: ({href, children, ...props}) => {
            const handleClick = (e: React.MouseEvent) => {
              e.preventDefault();
              if (href) {
                // 使用系统默认浏览器打开链接
                if (window.electronAPI) {
                  window.electronAPI.openPath(href);
                } else {
                  window.open(href, '_blank');
                }
              }
            };
            return (
              <a 
                href={href} 
                onClick={handleClick}
                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                {...props}
              >
                {children}
              </a>
            );
          },
          // Add IDs to headings for TOC navigation
          h1: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h1 id={id} {...props}>{children}</h1>;
          },
          h2: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h2 id={id} {...props}>{children}</h2>;
          },
          h3: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h3 id={id} {...props}>{children}</h3>;
          },
          h4: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h4 id={id} {...props}>{children}</h4>;
          },
          h5: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h5 id={id} {...props}>{children}</h5>;
          },
          h6: ({children, ...props}) => {
            const text = String(children);
            const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return <h6 id={id} {...props}>{children}</h6>;
          }
        }}
      >
        {processContent(markdownContent)}
      </ReactMarkdown>
    </>
  );

  return (
    <div className="relative h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {isEditing ? (
          <div className="flex items-center gap-4 w-full mr-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {!hideMetadata && (
              <>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-bold text-gray-800 bg-transparent border-none focus:ring-0 placeholder-gray-300 flex-1"
                  placeholder="笔记标题"
                />
                {!hideCategory && (
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 w-32 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="分类"
                  />
                )}
              </>
            )}
            {hideMetadata && (
               <span className="text-xl font-bold text-gray-800 flex-1">{title}</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-800">{note.title}</h1>
            {!hideMetadata && !hideCategory && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                {note.category || '未分类'}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {isEditing && viewMode === 'single' && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 mr-2">
              <button
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'edit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                编辑
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'preview' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                预览
              </button>
            </div>
          )}

          <button
            onClick={async () => {
              if (onExitEdit) {
                // If external exit handler provided (File Management mode)
                await handleSave(); // Save first
                onExitEdit();
              } else {
                // Default behavior (Markdown Note mode)
                isEditing ? handleSave() : setIsEditing(true);
              }
            }}
            className={`p-2 rounded-lg transition-colors shrink-0 ${
              (isEditing || onExitEdit)
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            title={onExitEdit ? "退出编辑 (阅读模式)" : (isEditing ? "保存" : "编辑")}
          >
            {onExitEdit ? <Book className="w-4 h-4" /> : (isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />)}
          </button>

          {/* TOC Button - only show when not editing and has headers */}
          {!isEditing && toc.length > 0 && (
            <button
              onClick={() => setShowTOC(!showTOC)}
              className={`p-2 rounded-lg transition-colors shrink-0 ${
                showTOC ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
              title={showTOC ? "隐藏目录" : "显示目录"}
            >
              <List className="w-4 h-4" />
            </button>
          )}

          <button 
            onClick={onToggleFullscreen}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
            title={isFullscreen ? "退出全屏" : "全屏阅读"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Editor / Preview Area */}
      <div className="flex-1 overflow-hidden flex">
        {isEditing ? (
          viewMode === 'single' ? (
            // Single Pane Mode
            activeTab === 'edit' ? (
              <div className="w-full h-full flex flex-col">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 w-full p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed text-gray-800 bg-gray-50/50"
                  placeholder="在此输入 Markdown 内容..."
                />
              </div>
            ) : (
              <div className="w-full h-full overflow-y-auto bg-white p-6">
                 <div className="prose prose-slate max-w-none mx-auto">
                  {renderMarkdown(content)}
                </div>
              </div>
            )
          ) : (
            // Split View Mode
            <>
              <div className="w-1/2 h-full border-r border-gray-200 flex flex-col">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="flex-1 w-full p-6 resize-none focus:outline-none font-mono text-sm leading-relaxed text-gray-800 bg-gray-50/50"
                  placeholder="在此输入 Markdown 内容..."
                />
              </div>
              <div className="w-1/2 h-full overflow-y-auto bg-white p-6">
                 <div className="prose prose-slate max-w-none">
                  {renderMarkdown(content)}
                </div>
              </div>
            </>
          )
        ) : (
          /* View Mode: Full Width Preview with optional TOC */
          <div className="w-full h-full overflow-hidden flex">
            {/* TOC Sidebar */}
            {showTOC && toc.length > 0 && (
              <div className="w-64 h-full border-r border-gray-200 bg-gray-50/50 overflow-y-auto shrink-0">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2">
                    <List className="w-4 h-4" />
                    目录
                  </h3>
                  <nav className="space-y-1">
                    {toc.map((item, index) => (
                      <a
                        key={index}
                        href={`#${item.id}`}
                        className="block text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                        style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                        onClick={(e) => {
                          e.preventDefault();
                          const element = document.getElementById(item.id);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                      >
                        {item.text}
                      </a>
                    ))}
                  </nav>
                </div>
              </div>
            )}
            {/* Content */}
            <div className="flex-1 h-full overflow-y-auto bg-white p-8 md:p-12 lg:p-16 select-text">
              <div className="prose prose-slate max-w-4xl mx-auto">
                {renderMarkdown(content)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
