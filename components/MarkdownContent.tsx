import React, { useState, useEffect, useMemo, Component, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import remarkGithubBlockquoteAlert from 'remark-github-blockquote-alert';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

type MdEngine = 'default' | 'github' | 'notion' | 'academic' | 'terminal';
let _currentEngine: MdEngine = (localStorage.getItem('guyue_md_engine') as MdEngine) || 'default';

class MarkdownErrorBoundary extends Component<
  { content: string; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { content: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn('[MarkdownContent] 渲染错误，降级为纯文本:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">
          {this.props.content}
        </p>
      );
    }
    return this.props.children;
  }
}

export const normalizeMarkdownContent = (content: string) => {
  if (!content) return '';
  let normalized = content.replace(/\u00A0/g, ' ').trimEnd();
  const fenceMatches = normalized.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    normalized = `${normalized}\n\n\`\`\``;
  }
  return normalized;
};

export const CodeBlock: React.FC<{ language?: string; children: string; theme?: MdEngine }> = React.memo(({ language, children, theme }) => {
  const [copied, setCopied] = useState(false);
  const effectiveTheme = theme ?? _currentEngine;

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (effectiveTheme === 'github') {
    return (
      <div className="relative group my-3 rounded-md overflow-hidden border border-[#D1D9E0]">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#F6F8FA] border-b border-[#D1D9E0]">
          <span className="text-xs font-mono text-[#656D76] uppercase tracking-wide">{language || 'code'}</span>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[#656D76] hover:text-[#1F2328] hover:bg-[#E1E4E8] transition-all">
            {copied ? <><Check className="w-3 h-3 text-green-600" /><span className="text-green-600">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
          </button>
        </div>
        <SyntaxHighlighter language={language || 'text'} style={oneLight} showLineNumbers
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9rem', background: '#FFFFFF', padding: '0.75rem 1rem' }}
          lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#ADB5BD', textAlign: 'right' }}
          codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' } }}
        >{children}</SyntaxHighlighter>
      </div>
    );
  }

  if (effectiveTheme === 'notion') {
    return (
      <div className="relative group my-3 rounded-lg overflow-hidden bg-[#F7F6F3]">
        <div className="flex items-center justify-between px-4 py-1 bg-[#F1F1EF]">
          <span className="text-[11px] font-mono text-[#9B9A97]">{language || 'code'}</span>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#9B9A97] hover:text-[#37352F] hover:bg-[#E8E7E4] transition-all">
            {copied ? <><Check className="w-3 h-3 text-green-600" /><span className="text-green-600">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
          </button>
        </div>
        <SyntaxHighlighter language={language || 'text'} style={oneLight} showLineNumbers
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9rem', background: '#F7F6F3', padding: '0.75rem 1rem' }}
          lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#C4C4C0', textAlign: 'right' }}
          codeTagProps={{ style: { fontFamily: 'iawriter-mono, Nitti, Menlo, Courier, monospace' } }}
        >{children}</SyntaxHighlighter>
      </div>
    );
  }

  if (effectiveTheme === 'academic') {
    return (
      <div className="relative group my-3 overflow-hidden border-l-4 border-[#C5A55A] bg-[#FAFAF8]">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#F5F3EE] border-b border-[#E8E4DA]">
          <span className="text-xs font-serif text-[#8B7E6A] tracking-wide">{language || 'code'}</span>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[#8B7E6A] hover:text-[#5D4037] hover:bg-[#EDE8DE] transition-all">
            {copied ? <><Check className="w-3 h-3 text-green-600" /><span className="text-green-600">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
          </button>
        </div>
        <SyntaxHighlighter language={language || 'text'} style={oneLight} showLineNumbers
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.92rem', background: '#FAFAF8', padding: '0.75rem 1rem' }}
          lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#C4B99A', textAlign: 'right' }}
          codeTagProps={{ style: { fontFamily: 'Georgia, "Times New Roman", serif' } }}
        >{children}</SyntaxHighlighter>
      </div>
    );
  }

  if (effectiveTheme === 'terminal') {
    return (
      <div className="relative group my-3 rounded-md overflow-hidden border border-[#30363D] bg-[#0D1117]">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#161B22] border-b border-[#30363D]">
          <span className="text-xs font-mono text-[#7EE787] tracking-wide">{language || 'code'}</span>
          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#1B2332] transition-all">
            {copied ? <><Check className="w-3 h-3 text-[#7EE787]" /><span className="text-[#7EE787]">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
          </button>
        </div>
        <SyntaxHighlighter language={language || 'text'} style={oneDark} showLineNumbers
          customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9rem', background: '#0D1117', padding: '0.75rem 1rem' }}
          lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#484F58', textAlign: 'right' }}
          codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' } }}
        >{children}</SyntaxHighlighter>
      </div>
    );
  }

  // Default — light theme with line numbers (macOS style)
  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#f5f5f7] border-b border-gray-200">
        <span className="text-xs font-mono text-gray-400 uppercase tracking-wide">{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200/60 transition-all">
          {copied ? <><Check className="w-3 h-3 text-green-500" /><span className="text-green-500">已复制</span></> : <><Copy className="w-3 h-3" /><span>复制</span></>}
        </button>
      </div>
      <SyntaxHighlighter language={language || 'text'} style={oneLight} showLineNumbers wrapLongLines
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.9rem', background: '#f5f5f7', padding: '1rem' }}
        lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#9ca3af', textAlign: 'right' }}
        codeTagProps={{ style: { fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace' } }}
      >{children}</SyntaxHighlighter>
    </div>
  );
});

function getEngineComponents(engine: MdEngine) {
  const codeComponent = (props: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: any }) => {
    const { inline, className, children, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    const hasNewline = codeString.includes('\n');
    if (hasNewline || (match && !inline)) {
      return <CodeBlock language={match?.[1]} theme={engine}>{codeString}</CodeBlock>;
    }
    const inlineClass = engine === 'github'
      ? 'bg-[#EFF1F3] text-[#1F2328] px-1.5 py-0.5 rounded-md text-[0.85em] font-mono'
      : engine === 'notion'
      ? 'bg-[#F7F6F3] text-[#EB5757] px-1 py-0.5 rounded text-[0.85em] font-mono'
      : engine === 'academic'
      ? 'bg-[#FFF8E1] text-[#5D4037] px-1.5 py-0.5 rounded border border-[#E8E0CC] text-[0.85em] font-mono'
      : engine === 'terminal'
      ? 'bg-[#1B2332] text-[#7EE787] px-1.5 py-0.5 rounded border border-[#30363D] text-[0.85em] font-mono'
      : 'bg-gray-100 text-rose-600 border border-gray-200 px-1.5 py-0.5 rounded-md text-[0.82em] font-mono';
    return <code className={inlineClass} {...rest}>{children}</code>;
  };

  if (engine === 'github') {
    return {
      code: codeComponent,
      table({ children }: any) { return <div className="overflow-x-auto my-3 rounded-lg border border-[#D1D9E0]"><table className="min-w-full text-sm border-collapse">{children}</table></div>; },
      thead({ children }: any) { return <thead className="bg-[#F6F8FA] border-b border-[#D1D9E0]">{children}</thead>; },
      tbody({ children }: any) { return <tbody className="divide-y divide-[#D1D9E0]">{children}</tbody>; },
      tr({ children }: any) { return <tr className="hover:bg-[#F6F8FA]/70 transition-colors">{children}</tr>; },
      th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-semibold text-[#656D76] uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>; },
      td({ children, ...props }: any) { return <td className="px-3 py-2 text-[#1F2328] align-top" {...props}>{children}</td>; },
      blockquote({ children }: any) { return <blockquote className="pl-4 border-l-4 border-[#D1D9E0] text-[#656D76] my-3 py-0.5">{children}</blockquote>; },
      h1({ children }: any) { return <h1 className="text-2xl font-semibold text-[#1F2328] mt-6 mb-4 pb-2 border-b border-[#D1D9E0]">{children}</h1>; },
      h2({ children }: any) { return <h2 className="text-xl font-semibold text-[#1F2328] mt-6 mb-3 pb-2 border-b border-[#D1D9E0]">{children}</h2>; },
      h3({ children }: any) { return <h3 className="text-lg font-semibold text-[#1F2328] mt-5 mb-2">{children}</h3>; },
      h4({ children }: any) { return <h4 className="text-base font-semibold text-[#1F2328] mt-4 mb-1">{children}</h4>; },
      h5({ children }: any) { return <h5 className="text-sm font-semibold text-[#1F2328] mt-3 mb-0.5">{children}</h5>; },
      h6({ children }: any) { return <h6 className="text-xs font-semibold text-[#656D76] uppercase tracking-wide mt-3 mb-0.5">{children}</h6>; },
      ul({ children }: any) { return <ul className="list-disc pl-5 my-2 space-y-0.5 text-[#1F2328]">{children}</ul>; },
      ol({ children }: any) { return <ol className="list-decimal pl-5 my-2 space-y-0.5 text-[#1F2328]">{children}</ol>; },
      li({ children }: any) { return <li className="pl-0.5 leading-7">{children}</li>; },
      a({ href, children }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#0969DA] hover:underline font-medium transition-colors">{children}</a>; },
      img({ src, alt }: any) { return <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-lg my-3 border border-[#D1D9E0]" />; },
      hr() { return <hr className="my-4 border-[#D1D9E0]" />; },
      p({ children }: any) { return <p className="text-[15px] text-[#1F2328] leading-7 mb-4 last:mb-0">{children}</p>; },
      strong({ children }: any) { return <strong className="font-semibold text-[#1F2328]">{children}</strong>; },
      em({ children }: any) { return <em className="italic text-[#1F2328]">{children}</em>; },
      del({ children }: any) { return <del className="line-through text-[#656D76]">{children}</del>; },
    };
  }

  if (engine === 'notion') {
    return {
      code: codeComponent,
      table({ children }: any) { return <div className="overflow-x-auto my-3 rounded-lg border border-[#E9E9E7]"><table className="min-w-full text-sm border-collapse">{children}</table></div>; },
      thead({ children }: any) { return <thead className="bg-[#F7F6F3] border-b border-[#E9E9E7]">{children}</thead>; },
      tbody({ children }: any) { return <tbody className="divide-y divide-[#E9E9E7]">{children}</tbody>; },
      tr({ children }: any) { return <tr className="hover:bg-[#F7F6F3]/50 transition-colors">{children}</tr>; },
      th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-semibold text-[#787774] uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>; },
      td({ children, ...props }: any) { return <td className="px-3 py-2 text-[#37352F] align-top" {...props}>{children}</td>; },
      blockquote({ children }: any) { return <blockquote className="pl-4 border-l-[3px] border-[#37352F] text-[#37352F] my-2 py-0">{children}</blockquote>; },
      h1({ children }: any) { return <h1 className="text-[1.875rem] font-bold text-[#37352F] mt-8 mb-1">{children}</h1>; },
      h2({ children }: any) { return <h2 className="text-[1.5rem] font-semibold text-[#37352F] mt-6 mb-1">{children}</h2>; },
      h3({ children }: any) { return <h3 className="text-[1.25rem] font-semibold text-[#37352F] mt-5 mb-1">{children}</h3>; },
      h4({ children }: any) { return <h4 className="text-base font-semibold text-[#37352F] mt-4 mb-0.5">{children}</h4>; },
      h5({ children }: any) { return <h5 className="text-sm font-medium text-[#37352F] mt-3 mb-0.5">{children}</h5>; },
      h6({ children }: any) { return <h6 className="text-xs font-semibold text-[#787774] uppercase tracking-wide mt-3 mb-0.5">{children}</h6>; },
      ul({ children }: any) { return <ul className="list-disc pl-5 my-1.5 space-y-0.5 text-[#37352F]">{children}</ul>; },
      ol({ children }: any) { return <ol className="list-decimal pl-5 my-1.5 space-y-0.5 text-[#37352F]">{children}</ol>; },
      li({ children }: any) { return <li className="pl-0.5 leading-[1.7]">{children}</li>; },
      a({ href, children }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#37352F] underline decoration-[#37352F]/30 hover:decoration-[#37352F] transition-colors">{children}</a>; },
      img({ src, alt }: any) { return <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-lg my-3" />; },
      hr() { return <hr className="my-4 border-[#E9E9E7]" />; },
      p({ children }: any) { return <p className="text-[15px] text-[#37352F] leading-[1.7] mb-1 last:mb-0">{children}</p>; },
      strong({ children }: any) { return <strong className="font-bold text-[#37352F]">{children}</strong>; },
      em({ children }: any) { return <em className="italic text-[#37352F]">{children}</em>; },
      del({ children }: any) { return <del className="line-through text-[#787774]">{children}</del>; },
    };
  }

  if (engine === 'academic') {
    return {
      code: codeComponent,
      table({ children }: any) { return <div className="overflow-x-auto my-3" style={{ borderTop: '2px solid #2C2C2C', borderBottom: '2px solid #2C2C2C' }}><table className="min-w-full text-sm border-collapse">{children}</table></div>; },
      thead({ children }: any) { return <thead className="border-b border-[#2C2C2C]">{children}</thead>; },
      tbody({ children }: any) { return <tbody className="divide-y divide-[#E0DCD4]">{children}</tbody>; },
      tr({ children }: any) { return <tr className="hover:bg-[#F5F3EE]/50 transition-colors">{children}</tr>; },
      th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-semibold text-[#5D4037] uppercase tracking-wider font-serif whitespace-nowrap" {...props}>{children}</th>; },
      td({ children, ...props }: any) { return <td className="px-3 py-2 text-[#2C2C2C] align-top font-serif" {...props}>{children}</td>; },
      blockquote({ children }: any) { return <blockquote className="pl-4 border-l-4 border-[#C5A55A] italic text-[#5D4037] my-3 py-0.5">{children}</blockquote>; },
      h1({ children }: any) { return <h1 className="text-2xl font-bold text-[#2C2C2C] mt-6 mb-4 pb-2 border-b-2 border-[#2C2C2C] font-serif uppercase tracking-wider">{children}</h1>; },
      h2({ children }: any) { return <h2 className="text-xl font-bold text-[#2C2C2C] mt-6 mb-3 pb-1 border-b border-[#C5A55A] font-serif uppercase tracking-wide">{children}</h2>; },
      h3({ children }: any) { return <h3 className="text-lg font-semibold text-[#2C2C2C] mt-5 mb-2 font-serif">{children}</h3>; },
      h4({ children }: any) { return <h4 className="text-base font-semibold text-[#2C2C2C] mt-4 mb-1 font-serif">{children}</h4>; },
      h5({ children }: any) { return <h5 className="text-sm font-medium text-[#2C2C2C] mt-3 mb-0.5 font-serif">{children}</h5>; },
      h6({ children }: any) { return <h6 className="text-xs font-semibold text-[#5D4037] uppercase tracking-wide mt-3 mb-0.5 font-serif">{children}</h6>; },
      ul({ children }: any) { return <ul className="list-disc pl-6 my-2 space-y-1 text-[#2C2C2C] font-serif">{children}</ul>; },
      ol({ children }: any) { return <ol className="list-decimal pl-6 my-2 space-y-1 text-[#2C2C2C] font-serif">{children}</ol>; },
      li({ children }: any) { return <li className="pl-1 leading-8 font-serif">{children}</li>; },
      a({ href, children }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#1565C0] hover:underline font-serif transition-colors">{children}</a>; },
      img({ src, alt }: any) { return <img src={src} alt={alt || ''} className="max-w-full h-auto my-3 border border-[#E0DCD4]" />; },
      hr() { return <div className="my-6 text-center text-[#C5A55A] tracking-[1em] text-sm select-none">···</div>; },
      p({ children }: any) { return <p className="text-[15px] text-[#2C2C2C] leading-8 mb-4 last:mb-0 font-serif">{children}</p>; },
      strong({ children }: any) { return <strong className="font-bold text-[#2C2C2C] font-serif">{children}</strong>; },
      em({ children }: any) { return <em className="italic text-[#2C2C2C] font-serif">{children}</em>; },
      del({ children }: any) { return <del className="line-through text-[#8B7E6A] font-serif">{children}</del>; },
    };
  }

  if (engine === 'terminal') {
    return {
      code: codeComponent,
      table({ children }: any) { return <div className="overflow-x-auto my-3 rounded-md border border-[#30363D]"><table className="min-w-full text-sm border-collapse bg-[#0D1117]">{children}</table></div>; },
      thead({ children }: any) { return <thead className="bg-[#161B22] border-b border-[#30363D]">{children}</thead>; },
      tbody({ children }: any) { return <tbody className="divide-y divide-[#21262D]">{children}</tbody>; },
      tr({ children }: any) { return <tr className="hover:bg-[#161B22]/70 transition-colors">{children}</tr>; },
      th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-mono font-semibold text-[#7EE787] uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>; },
      td({ children, ...props }: any) { return <td className="px-3 py-2 text-[#C9D1D9] align-top font-mono" {...props}>{children}</td>; },
      blockquote({ children }: any) { return <blockquote className="pl-4 border-l-4 border-[#4ADE80] bg-[#0D1117]/50 text-[#8B949E] my-3 py-0.5 font-mono">{children}</blockquote>; },
      h1({ children }: any) { return <h1 className="text-2xl font-bold text-[#4ADE80] mt-6 mb-4 font-mono"><span className="text-[#484F58]"># </span>{children}</h1>; },
      h2({ children }: any) { return <h2 className="text-xl font-bold text-[#4ADE80] mt-6 mb-3 font-mono"><span className="text-[#484F58]">## </span>{children}</h2>; },
      h3({ children }: any) { return <h3 className="text-lg font-semibold text-[#4ADE80] mt-5 mb-2 font-mono"><span className="text-[#484F58]">{'> '}</span>{children}</h3>; },
      h4({ children }: any) { return <h4 className="text-base font-semibold text-[#4ADE80] mt-4 mb-1 font-mono">{children}</h4>; },
      h5({ children }: any) { return <h5 className="text-sm font-medium text-[#4ADE80] mt-3 mb-0.5 font-mono">{children}</h5>; },
      h6({ children }: any) { return <h6 className="text-xs font-semibold text-[#8B949E] uppercase tracking-wide mt-3 mb-0.5 font-mono">{children}</h6>; },
      ul({ children }: any) { return <ul className="list-disc pl-5 my-2 space-y-0.5 text-[#C9D1D9] font-mono marker:text-[#4ADE80]">{children}</ul>; },
      ol({ children }: any) { return <ol className="list-decimal pl-5 my-2 space-y-0.5 text-[#C9D1D9] font-mono">{children}</ol>; },
      li({ children }: any) { return <li className="pl-0.5 leading-7 font-mono">{children}</li>; },
      a({ href, children }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#58A6FF] hover:underline font-mono transition-colors">{children}</a>; },
      img({ src, alt }: any) { return <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-md my-3 border border-[#30363D]" />; },
      hr() { return <hr className="my-4 border-[#30363D]" />; },
      p({ children }: any) { return <p className="text-[14px] text-[#C9D1D9] leading-7 mb-2 last:mb-0 font-mono">{children}</p>; },
      strong({ children }: any) { return <strong className="font-bold text-[#E6EDF3] font-mono">{children}</strong>; },
      em({ children }: any) { return <em className="italic text-[#A8D8A8] font-mono">{children}</em>; },
      del({ children }: any) { return <del className="line-through text-[#484F58] font-mono">{children}</del>; },
    };
  }

  // default engine
  return {
    code: codeComponent,
    table({ children }: any) { return <div className="overflow-x-auto my-3 rounded-xl border border-gray-200 shadow-sm"><table className="min-w-full text-sm border-collapse">{children}</table></div>; },
    thead({ children }: any) { return <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>; },
    tbody({ children }: any) { return <tbody className="divide-y divide-gray-100">{children}</tbody>; },
    tr({ children }: any) { return <tr className="hover:bg-gray-50/70 transition-colors">{children}</tr>; },
    th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap" {...props}>{children}</th>; },
    td({ children, ...props }: any) { return <td className="px-3 py-2 text-gray-700 align-top" {...props}>{children}</td>; },
    blockquote({ children }: any) { return <blockquote className="pl-4 border-l-4 border-purple-400 bg-purple-50/60 rounded-r-lg py-1.5 pr-2 my-3 text-gray-600 not-italic">{children}</blockquote>; },
    h1({ children }: any) { return <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2.5 pb-1.5 border-b border-gray-200 leading-tight">{children}</h1>; },
    h2({ children }: any) { return <h2 className="text-lg font-bold text-gray-800 mt-4 mb-2 leading-tight">{children}</h2>; },
    h3({ children }: any) { return <h3 className="text-base font-semibold text-gray-800 mt-3 mb-1.5 leading-tight">{children}</h3>; },
    h4({ children }: any) { return <h4 className="text-sm font-semibold text-gray-700 mt-2.5 mb-1 leading-tight">{children}</h4>; },
    h5({ children }: any) { return <h5 className="text-sm font-medium text-gray-700 mt-2 mb-0.5">{children}</h5>; },
    h6({ children }: any) { return <h6 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-0.5">{children}</h6>; },
    ul({ children }: any) { return <ul className="list-disc pl-5 my-2 space-y-0.5 text-gray-700">{children}</ul>; },
    ol({ children }: any) { return <ol className="list-decimal pl-5 my-2 space-y-0.5 text-gray-700">{children}</ol>; },
    li({ children }: any) { return <li className="pl-0.5 leading-relaxed">{children}</li>; },
    a({ href, children }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-500 font-medium transition-colors">{children}</a>; },
    img({ src, alt }: any) { return <img src={src} alt={alt || ''} className="max-w-full h-auto rounded-xl my-3 border border-gray-200 shadow-sm" />; },
    hr() { return <hr className="my-4 border-gray-200" />; },
    p({ children }: any) { return <p className="mb-2 last:mb-0 leading-relaxed text-gray-800 text-sm">{children}</p>; },
    strong({ children }: any) { return <strong className="font-semibold text-gray-900">{children}</strong>; },
    em({ children }: any) { return <em className="italic text-gray-700">{children}</em>; },
    del({ children }: any) { return <del className="line-through text-gray-400">{children}</del>; },
  };
}

export const MdEngineSwitcher: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-1 text-[10px]">
    {(['default', 'github', 'notion', 'academic', 'terminal'] as const).map(e => (
      <button key={e} onClick={() => onChange(e)}
        className={`px-1.5 py-0.5 rounded transition-colors ${value === e ? 'bg-gray-200 text-gray-700 font-medium' : 'text-gray-400 hover:text-gray-600'}`}
      >
        {e === 'default' ? '默认' : e === 'github' ? 'GitHub' : e === 'notion' ? 'Notion' : e === 'academic' ? '学术' : '终端'}
      </button>
    ))}
  </div>
);

export const MarkdownContent: React.FC<{ content: string; isStreaming?: boolean }> = React.memo(({ content, isStreaming }) => {
  const [engine, setEngine] = useState<MdEngine>(_currentEngine);

  useEffect(() => {
    const handler = () => {
      _currentEngine = (localStorage.getItem('guyue_md_engine') as MdEngine) || 'default';
      setEngine(_currentEngine);
    };
    window.addEventListener('md-engine-change', handler);
    return () => window.removeEventListener('md-engine-change', handler);
  }, []);

  const components = useMemo(() => getEngineComponents(engine), [engine]);
  const displayContent = normalizeMarkdownContent(content);

  return (
    <MarkdownErrorBoundary content={content}>
    <div className={engine === 'terminal' ? 'bg-[#0D1117] rounded-lg p-4 text-[#C9D1D9] font-mono' : 'prose-chat'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, [remarkBreaks], remarkGithubBlockquoteAlert]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]]}
        components={components as any}
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
    </MarkdownErrorBoundary>
  );
});
