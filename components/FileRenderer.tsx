import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { FileRecord } from '../types';
import { FileText, Maximize2, Minimize2, Info, Lightbulb, AlertCircle, AlertTriangle, ShieldAlert, Edit, List } from 'lucide-react';

interface FileRendererProps {
  file: FileRecord | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onEdit?: () => void;
}

export const FileRenderer: React.FC<FileRendererProps> = ({ 
  file,
  isFullscreen,
  onToggleFullscreen,
  onEdit
}) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<{ level: number; text: string; id: string }[]>([]);

  useEffect(() => {
    const loadContent = async () => {
      if (!file) {
        setContent('');
        setToc([]);
        return;
      }

      const ext = file.type.toLowerCase().replace('.', '');
      
      if (['md', 'markdown', 'txt', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'html', 'py'].includes(ext)) {
        setLoading(true);
        try {
          if (window.electronAPI && window.electronAPI.readFile) {
            const text = await window.electronAPI.readFile(file.path);
            setContent(text || '无法读取文件内容');
            
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
          setContent('读取文件出错');
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

  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-white">
        <FileText className="w-16 h-16 mb-4 text-gray-200" />
        <p>请从左侧选择文件开始阅读</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Header */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-8 bg-white z-10 shrink-0">
        <div className="flex flex-col min-w-0">
           <h1 className="text-xl font-bold text-gray-800 truncate" title={file.name}>
             {file.name}
           </h1>
        </div>
        
        <div className="flex items-center gap-2 ml-4 shrink-0">
          {['md', 'markdown'].includes(file.type.toLowerCase().replace('.', '')) && (
            <button 
              onClick={() => setShowTOC(!showTOC)}
              className={`p-2 rounded-lg transition-colors ${showTOC ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
              title="显示目录"
            >
              <List className="w-5 h-5" />
            </button>
          )}
          {onEdit && ['md', 'markdown'].includes(file.type.toLowerCase().replace('.', '')) && (
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
               {renderFileContent(file, content)}
            </div>
            
            {/* TOC Sidebar */}
            {showTOC && ['md', 'markdown'].includes(file.type.toLowerCase().replace('.', '')) && (
              <div className="absolute top-0 right-0 bottom-0 w-64 bg-gray-50 border-l border-gray-200 overflow-y-auto p-4 animate-in slide-in-from-right duration-200">
                <h3 className="font-semibold text-gray-700 mb-4 px-2">目录</h3>
                {toc.length === 0 ? (
                  <p className="text-sm text-gray-400 px-2">暂无目录</p>
                ) : (
                  <nav className="space-y-1">
                    {toc.map((item, index) => (
                      <a
                        key={index}
                        href={`#${item.id}`}
                        className="block text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded transition-colors truncate"
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
                    ))}
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

const renderFileContent = (file: FileRecord, content: string) => {
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
    // Pre-process content:
    // 1. Ensure $$...$$ is treated as block math
    let formattedContent = content.replace(/(\$\$[\s\S]+?\$\$)/g, '\n\n$1\n\n');
    
    // 2. Support Obsidian style image embeds: ![[filename|width]] -> ![width](filename)
    formattedContent = formattedContent.replace(/!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (match, filename, args) => {
      return `![${args || ''}](${filename})`;
    });

    return (
      <div className="h-full overflow-y-auto p-8 md:p-12 lg:p-16 bg-white select-text">
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
        <div className="prose prose-slate max-w-4xl mx-auto">
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

                // Parse alt text for width and border
                // Syntax: ![alt|width|border]
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
                    // Handle case where alt is just a number (Obsidian style from pre-processing)
                    if (!isNaN(Number(altText)) && altText.trim() !== '') {
                        width = `${altText}px`;
                    }
                }

                const style: React.CSSProperties = { 
                    width: width,
                    maxWidth: '100%' 
                };

                // Default: no border, no shadow. 
                let className = "mx-auto my-4"; 
                
                if (hasBorder) {
                    className += " rounded-lg shadow-md";
                }

                return (
                  <img 
                    src={finalSrc} 
                    alt={realAlt} 
                    style={style}
                    className={className}
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
