import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import remarkGithubBlockquoteAlert from 'remark-github-blockquote-alert';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

export const normalizeMarkdownContent = (content: string) => {
  if (!content) return '';
  let normalized = content.replace(/\u00A0/g, ' ').trimEnd();
  const fenceMatches = normalized.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    normalized = `${normalized}\n\n\`\`\``;
  }
  return normalized;
};

export const CodeBlock: React.FC<{ language?: string; children: string }> = React.memo(({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-700/50 shadow-md">
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-800/90 border-b border-gray-700/50">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wide">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-all"
        >
          {copied
            ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">已复制</span></>
            : <><Copy className="w-3 h-3" /><span>复制</span></>}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        wrapLongLines
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.85rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#1a1b26',
          padding: '1rem',
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
});

export const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = React.memo(({ content, isStreaming }) => {
  const displayContent = normalizeMarkdownContent(content);
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, [remarkBreaks], remarkGithubBlockquoteAlert]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          code(props: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: any }) {
            const { inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const hasNewline = codeString.includes('\n');
            if (hasNewline || (match && !inline)) {
              return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
            }
            return (
              <code
                className="bg-gray-100 text-rose-600 border border-gray-200 px-1.5 py-0.5 rounded-md text-[0.82em] font-mono"
                {...rest}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 rounded-xl border border-gray-200 shadow-sm">
                <table className="min-w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-gray-100">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-gray-50/70 transition-colors">{children}</tr>;
          },
          th({ children, ...props }: any) {
            return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>;
          },
          td({ children, ...props }: any) {
            return <td className="px-3 py-2 text-gray-700 align-top" {...props}>{children}</td>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="pl-4 border-l-4 border-purple-400 bg-purple-50/60 rounded-r-lg py-1.5 pr-2 my-3 text-gray-600 not-italic">
                {children}
              </blockquote>
            );
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2.5 pb-1.5 border-b border-gray-200 leading-tight">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold text-gray-800 mt-4 mb-2 leading-tight">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold text-gray-800 mt-3 mb-1.5 leading-tight">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-sm font-semibold text-gray-700 mt-2.5 mb-1 leading-tight">{children}</h4>;
          },
          h5({ children }) {
            return <h5 className="text-sm font-medium text-gray-700 mt-2 mb-0.5">{children}</h5>;
          },
          h6({ children }) {
            return <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-0.5">{children}</h6>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-0.5 text-gray-700">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-0.5 text-gray-700">{children}</ol>;
          },
          li({ children }) {
            return <li className="pl-0.5 leading-relaxed">{children}</li>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-500 font-medium transition-colors"
              >
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt || ''}
                className="max-w-full h-auto rounded-xl my-3 border border-gray-200 shadow-sm"
              />
            );
          },
          hr() {
            return <hr className="my-4 border-gray-200" />;
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed text-gray-800 text-sm">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-gray-900">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-gray-700">{children}</em>;
          },
          del({ children }) {
            return <del className="line-through text-gray-400">{children}</del>;
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block w-1 h-4 bg-purple-500 rounded-sm ml-0.5 animate-pulse"
          style={{ verticalAlign: 'text-bottom' }}
        />
      )}
    </div>
  );
});
