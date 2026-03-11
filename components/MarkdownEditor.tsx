import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Save, Edit3, Maximize2, Minimize2, Info, Lightbulb, AlertCircle, AlertTriangle, ShieldAlert, Book, List, Check, Loader2, CloudOff } from 'lucide-react';
import { MarkdownToolbar } from './MarkdownToolbar';

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
  hideHeaderTitle?: boolean;
  hideFullscreen?: boolean;
  hideEditButton?: boolean;
  externalIsEditing?: boolean;
  onEditingChange?: (v: boolean) => void;
  hideTOCButton?: boolean;
  externalShowTOC?: boolean;
  onShowTOCChange?: (v: boolean) => void;
  onTOCAvailableChange?: (available: boolean) => void;
  hideToolbar?: boolean;
  compact?: boolean;
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
  onExitEdit,
  hideHeaderTitle = false,
  hideFullscreen = false,
  hideEditButton = false,
  externalIsEditing,
  onEditingChange,
  hideTOCButton = false,
  externalShowTOC,
  onShowTOCChange,
  onTOCAvailableChange,
  hideToolbar = false,
  compact = false
}) => {
  const [isEditing, setIsEditingInternal] = useState(false);
  const isEditingRef = useRef(false);
  const setIsEditing = useCallback((value: boolean) => {
    isEditingRef.current = value;
    setIsEditingInternal(value);
    onEditingChange?.(value);
  }, [onEditingChange]);
  // Sync external editing state — save before exiting
  const noteRef = useRef(note);
  const contentRef = useRef('');
  const titleRef = useRef('');
  const categoryRef = useRef('');
  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => {
    if (externalIsEditing !== undefined) {
      if (externalIsEditing === false && isEditingRef.current) {
        // Exiting edit mode externally — flush save immediately
        const n = noteRef.current;
        if (n) {
          onUpdate(n.id, { content: contentRef.current, title: titleRef.current, category: categoryRef.current, updatedAt: Date.now() });
        }
      }
      isEditingRef.current = externalIsEditing;
      setIsEditingInternal(externalIsEditing);
    }
  }, [externalIsEditing]);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  // Keep refs in sync for external save
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { categoryRef.current = category; }, [category]);
  const [showTOC, setShowTOCInternal] = useState(false);
  const setShowTOC = useCallback((v: boolean) => {
    setShowTOCInternal(v);
    onShowTOCChange?.(v);
  }, [onShowTOCChange]);
  // Sync external showTOC
  useEffect(() => {
    if (externalShowTOC !== undefined) {
      setShowTOCInternal(externalShowTOC);
    }
  }, [externalShowTOC]);
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save states
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (!note || !hasUnsavedChanges) return;

    // Check if content actually changed from last save
    const currentData = JSON.stringify({ content, title, category });
    if (currentData === lastSavedContentRef.current) return;

    setAutoSaveStatus('saving');
    try {
      await onUpdate(note.id, { content, title, category, updatedAt: Date.now() });
      lastSavedContentRef.current = currentData;
      setHasUnsavedChanges(false);
      setAutoSaveStatus('saved');
      // Reset status after 2 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaveStatus('idle');
    }
  }, [note, content, title, category, hasUnsavedChanges, onUpdate]);

  // Debounced auto-save: save 3 seconds after user stops typing
  useEffect(() => {
    if (!isEditing || !hasUnsavedChanges) return;

    // Clear previous timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for 3 seconds
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, title, category, isEditing, hasUnsavedChanges, performAutoSave]);

  // Save on page visibility change (when user switches tab/window)
  useEffect(() => {
    if (!isEditing) return;

    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges) {
        performAutoSave();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        performAutoSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const handleWindowBlur = () => {
      if (hasUnsavedChanges) {
        performAutoSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isEditing, hasUnsavedChanges, performAutoSave]);

  // Track content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasUnsavedChanges(true);
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setHasUnsavedChanges(true);
  };

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
      onTOCAvailableChange?.(headers.length > 0);
    } else {
      setToc([]);
      onTOCAvailableChange?.(false);
    }
  }, [content]);

  useEffect(() => {
    // Clear any pending auto-save timer when note changes
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (note) {
      setContent(note.content);
      setTitle(note.title);
      setCategory(note.category);
      // Reset auto-save state when loading a new note
      setHasUnsavedChanges(false);
      lastSavedContentRef.current = JSON.stringify({ content: note.content, title: note.title, category: note.category });
      setAutoSaveStatus('idle');
      // If onExitEdit is provided, we assume we start in edit mode (File Management)
      // Or if initialEditMode is true
      if (onExitEdit || initialEditMode) {
        setIsEditing(true);
      }
    } else {
      setContent('');
      setTitle('');
      setCategory('');
      setHasUnsavedChanges(false);
      lastSavedContentRef.current = '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, onExitEdit, initialEditMode]);

  if (!note) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white">
        <p>请从左侧选择笔记开始编写</p>
      </div>
    );
  }

  const handleSave = async () => {
    await onUpdate(note.id, { content, title, category, updatedAt: Date.now() });
    // Reset auto-save state after manual save
    setHasUnsavedChanges(false);
    lastSavedContentRef.current = JSON.stringify({ content, title, category });
    setAutoSaveStatus('idle');
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
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
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
            const validChildren = React.Children.toArray(children).filter(child => React.isValidElement(child));
            return <>{validChildren.length > 0 ? validChildren : children}</>;
          },
          img: ({src, alt, ...props}) => {
            if (!src) return null;
            
            // Parse alt text for width, border and caption
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
                if (!isNaN(Number(altText)) && altText.trim() !== '') {
                    width = `${altText}px`;
                }
            }

            const imgStyle: React.CSSProperties = { 
                width: width,
                maxWidth: '100%' 
            };

            let imgClassName = "mx-auto"; 
            if (hasBorder) {
                imgClassName += " rounded-lg shadow-md";
            }

            // If caption exists, wrap in figure element
            if (caption) {
              const captionClassName = captionStyle === 'bold' 
                ? 'mt-2 text-sm text-gray-800 text-center font-bold'
                : 'mt-2 text-sm text-gray-500 text-center italic';
              return (
                <figure className="my-4 flex flex-col items-center">
                  <img 
                    src={src} 
                    alt={realAlt} 
                    style={imgStyle}
                    className={imgClassName}
                    {...props} 
                  />
                  <figcaption className={captionClassName}>
                    {caption}
                  </figcaption>
                </figure>
              );
            }

            return (
              <img 
                src={src} 
                alt={realAlt} 
                style={imgStyle}
                className={`${imgClassName} my-4`}
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
      {!hideToolbar && (
      <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        {isEditing ? (
          <div className="flex items-center gap-4 w-full mr-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {!hideMetadata && (
              <>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="text-xl font-bold text-gray-800 bg-transparent border-none focus:ring-0 placeholder-gray-300 flex-1"
                  placeholder="笔记标题"
                />
                {!hideCategory && (
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 w-32 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="分类"
                  />
                )}
              </>
            )}
            {hideMetadata && !hideHeaderTitle && (
               <span className="text-xl font-bold text-gray-800 flex-1">{title}</span>
            )}
            {hideHeaderTitle && <div className="flex-1" />}
          </div>
        ) : (
          hideHeaderTitle ? <div className="flex-1" /> : (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-800">{note.title}</h1>
              {!hideMetadata && !hideCategory && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                  {note.category || '未分类'}
                </span>
              )}
            </div>
          )
        )}

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Auto-save status indicator */}
          {isEditing && (
            <div className="flex items-center gap-1.5 text-xs mr-2">
              {autoSaveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  <span className="text-blue-500">保存中...</span>
                </>
              )}
              {autoSaveStatus === 'saved' && (
                <>
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-green-500">已保存</span>
                </>
              )}
              {autoSaveStatus === 'idle' && hasUnsavedChanges && (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-400">未保存</span>
                </>
              )}
            </div>
          )}

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

          {!hideEditButton && (
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
          )}

          {/* TOC Button - only show when not editing and has headers */}
          {!hideTOCButton && !isEditing && toc.length > 0 && (
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

          {!hideFullscreen && (
          <button 
            onClick={onToggleFullscreen}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors shrink-0"
            title={isFullscreen ? "退出全屏" : "全屏阅读"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          )}
        </div>
      </div>
      )}

      {/* Editor / Preview Area */}
      <div className="flex-1 overflow-hidden flex">
        {isEditing ? (
          viewMode === 'single' ? (
            // Single Pane Mode
            activeTab === 'edit' ? (
              <div className="w-full h-full flex flex-col">
                <MarkdownToolbar
                  textareaRef={textareaRef}
                  content={content}
                  onContentChange={handleContentChange}
                />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
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
                <MarkdownToolbar
                  textareaRef={textareaRef}
                  content={content}
                  onContentChange={handleContentChange}
                />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
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
            <div className={`flex-1 h-full overflow-y-auto bg-white select-text ${compact ? 'p-[10px]' : 'p-8 md:p-12 lg:p-16'}`}>
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
