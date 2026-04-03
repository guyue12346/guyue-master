import React, { useState, useRef, useCallback } from 'react';
import { PromptRecord, SkillPack } from '../types';
import {
  Sparkles, Copy, Check, Edit2, Trash2, ChevronDown, ChevronUp,
  User, Link2, Upload, X, AlertCircle, CheckCircle2, Loader2,
  Globe, FileText, Zap, Search,
} from 'lucide-react';

// ===== 内置快速导入源 =====
const PRESET_SOURCES: Array<{
  name: string;
  desc: string;
  url: string;
  count: string;
  color: string;
}> = [
  {
    name: 'awesome-chatgpt-prompts',
    desc: '最知名的 Prompt 合集，覆盖各类角色和场景',
    url: 'https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv',
    count: '200+',
    color: 'bg-orange-50 border-orange-100 hover:border-orange-300',
  },
  {
    name: 'Awesome Claude Prompts',
    desc: '专为 Claude 优化的 Prompt 集合',
    url: 'https://raw.githubusercontent.com/langgptai/awesome-claude-prompts/main/README.md',
    count: '100+',
    color: 'bg-violet-50 border-violet-100 hover:border-violet-300',
  },
  {
    name: 'LangGPT 结构化提示词',
    desc: '中文结构化 Prompt 模板集合',
    url: 'https://raw.githubusercontent.com/langgptai/wonderful-prompts/main/README.md',
    count: '50+',
    color: 'bg-blue-50 border-blue-100 hover:border-blue-300',
  },
];
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface SkillListProps {
  prompts: PromptRecord[];
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onEdit: (prompt: PromptRecord) => void;
  onImport: (skills: PromptRecord[]) => void;
  isImportOpen?: boolean;
  onImportOpenChange?: (open: boolean) => void;
}

// ===== Skill Card =====
const SkillCard: React.FC<{
  skill: PromptRecord;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ skill, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(skill.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { alert('复制失败，请检查系统权限'); }
  };

  const displayDesc = skill.description || skill.note;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
      {/* Card Header */}
      <div
        className="flex items-start justify-between p-4 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              {skill.category || '未分类'}
            </span>
            {skill.tags?.filter(Boolean).map(tag => (
              <span key={tag} className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
          <h3 className="font-semibold text-gray-800 line-clamp-1">{skill.title}</h3>
          {displayDesc && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{displayDesc}</p>
          )}
          {(skill.author || skill.source) && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400 flex-wrap">
              {skill.author && <><User className="w-3 h-3" /><span>{skill.author}</span></>}
              {skill.author && skill.source && <span className="mx-0.5">·</span>}
              {skill.source && (
                <>
                  <Link2 className="w-3 h-3" />
                  <a
                    href={skill.source} target="_blank" rel="noopener noreferrer"
                    className="hover:text-blue-500 truncate max-w-[180px]"
                    onClick={e => e.stopPropagation()}
                  >
                    {skill.source.replace(/^https?:\/\//, '')}
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-lg transition-colors ${copied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
            title={copied ? '已复制' : '复制内容'}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="编辑"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </div>

      {/* Expanded: MD content */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-3 bg-gray-50/60 prose prose-sm max-w-none text-gray-700 overflow-auto">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                code: ({node, inline, className, children, ...props}: any) => {
                  if (inline) {
                    return <code className="bg-gray-100 text-rose-600 border border-gray-200 px-1.5 py-0.5 rounded-md text-[0.82em] font-mono not-prose" {...props}>{children}</code>;
                  }
                  return (
                    <pre className="not-prose p-3 rounded-lg bg-gray-50 border border-gray-200 overflow-x-auto my-3">
                      <code className="bg-transparent text-gray-800 font-mono text-sm" {...props}>{children}</code>
                    </pre>
                  );
                }
              }}
            >
              {skill.content || '*（暂无内容）*'}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Import Modal =====
const ImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImport: (skills: PromptRecord[]) => void;
}> = ({ isOpen, onClose, onImport }) => {
  const [tab, setTab] = useState<'paste' | 'url' | 'file'>('paste');
  const [jsonText, setJsonText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [parsed, setParsed] = useState<SkillPack | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseInput = useCallback((text: string) => {
    setParseError(null);
    setParsed(null);
    if (!text.trim()) return;
    try {
      const data = JSON.parse(text);
      if (data.skills && Array.isArray(data.skills)) {
        const pack = data as SkillPack;
        setParsed(pack);
        setSelectedIndices(new Set(pack.skills.map((_, i) => i)));
        return;
      }
      if (Array.isArray(data)) {
        const pack: SkillPack = {
          name: '导入的 Skills',
          skills: data.map((item: any) => ({
            title: item.title || item.name || item.act || '未命名',
            content: item.content || item.prompt || item.text || '',
            category: item.category || '导入',
            description: item.description || item.note || '',
            tags: item.tags || [],
            note: item.note || '',
            author: item.author,
            source: item.source,
          })),
        };
        setParsed(pack);
        setSelectedIndices(new Set(pack.skills.map((_, i) => i)));
        return;
      }
      setParseError('无法识别格式，请确保是 SkillPack JSON 或数组格式');
    } catch {
      // Try CSV (awesome-chatgpt-prompts: act,prompt)
      try {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { setParseError('内容太少，无法解析'); return; }
        const firstLine = lines[0].toLowerCase();
        const isHeader = firstLine.includes('act') || firstLine.includes('prompt') || firstLine.includes('title');
        const dataLines = isHeader ? lines.slice(1) : lines;
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let inQuote = false, cur = '';
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"' && !inQuote) { inQuote = true; }
            else if (ch === '"' && inQuote && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"' && inQuote) { inQuote = false; }
            else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
            else { cur += ch; }
          }
          result.push(cur);
          return result;
        };
        const skills = dataLines
          .map(line => {
            const cols = parseCSVLine(line);
            return { title: cols[0]?.trim() || '未命名', content: cols[1]?.trim() || '', category: '导入', description: '', tags: [], note: '' };
          })
          .filter(s => s.content);
        if (skills.length === 0) { setParseError('未找到有效内容'); return; }
        const pack: SkillPack = { name: '从 CSV 导入', skills };
        setParsed(pack);
        setSelectedIndices(new Set(skills.map((_, i) => i)));
      } catch {
        setParseError('解析失败，请检查格式是否正确');
      }
    }
  }, []);

  const handleFetchUrlWith = async (url: string) => {
    if (!url.trim()) return;
    setIsLoading(true);
    setParseError(null);
    try {
      const resp = await fetch(url.trim());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      setJsonText(text);
      parseInput(text);
    } catch (e) {
      setParseError(`获取失败：${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchUrl = async () => handleFetchUrlWith(urlInput);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const text = ev.target?.result as string; setJsonText(text); parseInput(text); };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!parsed) return;
    const now = Date.now();
    const newSkills: PromptRecord[] = parsed.skills
      .filter((_, i) => selectedIndices.has(i))
      .map((s, idx) => ({
        id: `imported_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        title: s.title || '未命名',
        content: s.content || '',
        description: s.description,
        category: s.category || '导入',
        tags: s.tags || [],
        note: s.note || '',
        author: s.author || parsed.author,
        source: s.source || parsed.sourceUrl,
        createdAt: now,
        updatedAt: now,
      }));
    onImport(newSkills);
    handleClose();
  };

  const handleClose = () => {
    setParsed(null); setJsonText(''); setUrlInput(''); setParseError(null); setTab('paste');
    onClose();
  };

  const toggleAll = () => {
    if (!parsed) return;
    setSelectedIndices(prev => prev.size === parsed.skills.length ? new Set() : new Set(parsed.skills.map((_, i) => i)));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-800">导入 SkillPack</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {(['paste', 'url', 'file'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm rounded-lg transition-all ${tab === t ? 'bg-white shadow text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'paste' ? '粘贴 JSON' : t === 'url' ? '从 URL 导入' : '上传文件'}
              </button>
            ))}
          </div>

          <p className="text-xs text-gray-400">
            支持 SkillPack JSON、对象数组、以及{' '}
            <a href="https://github.com/f/awesome-chatgpt-prompts" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              awesome-chatgpt-prompts
            </a>{' '}CSV 格式
          </p>

          {tab === 'paste' && (
            <textarea
              value={jsonText}
              onChange={e => { setJsonText(e.target.value); parseInput(e.target.value); }}
              placeholder={`{\n  "name": "My Skills",\n  "skills": [\n    {\n      "title": "...",\n      "content": "...",\n      "category": "Dev",\n      "tags": ["tag1"]\n    }\n  ]\n}`}
              rows={9}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none resize-y"
            />
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              {/* 快速导入源 */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">一键导入热门合集</p>
              <div className="space-y-2">
                {PRESET_SOURCES.map(src => (
                  <button
                    key={src.url}
                    onClick={() => { setUrlInput(src.url); handleFetchUrlWith(src.url); }}
                    disabled={isLoading}
                    className={`w-full flex items-center justify-between px-4 py-3 border rounded-xl text-left transition-all disabled:opacity-50 ${src.color}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Zap className="w-4 h-4 text-purple-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{src.name}</p>
                        <p className="text-xs text-gray-500 truncate">{src.desc}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 ml-3">{src.count}</span>
                  </button>
                ))}
              </div>
              {/* 自定义 URL */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">或输入自定义链接</p>
              <div className="flex gap-2">
                <input
                  type="url" value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && !e.nativeEvent.isComposing && handleFetchUrlWith(urlInput)}
                  placeholder="https://raw.githubusercontent.com/.../skills.json"
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
                <button onClick={() => handleFetchUrlWith(urlInput)} disabled={isLoading || !urlInput.trim()}
                  className="px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  获取
                </button>
              </div>
            </div>
          )}

          {tab === 'file' && (
            <>
              <input ref={fileInputRef} type="file" accept=".json,.csv,.txt" className="hidden" onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-purple-300 hover:bg-purple-50/30 transition-all">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">点击选择 JSON 或 CSV 文件</p>
                <p className="text-xs text-gray-400 mt-1">.json / .csv / .txt</p>
              </button>
            </>
          )}

          {parseError && (
            <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 px-4 py-2.5 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />{parseError}
            </div>
          )}

          {parsed && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-4 py-2.5 rounded-xl">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>解析成功：<strong>{parsed.name}</strong>，共 {parsed.skills.length} 个 Skill
                  {parsed.author && <span className="ml-1 text-green-500">（作者：{parsed.author}）</span>}
                </span>
              </div>
              <div className="border border-gray-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                {parsed.skills.map((s, i) => (
                  <label key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <input type="checkbox" checked={selectedIndices.has(i)} onChange={() => setSelectedIndices(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} className="accent-purple-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{s.title || '未命名'}</p>
                      <p className="text-xs text-gray-400 truncate">{s.content?.slice(0, 80)}{(s.content?.length || 0) > 80 ? '…' : ''}</p>
                    </div>
                    {s.category && <span className="text-xs text-gray-400 shrink-0">{s.category}</span>}
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button onClick={toggleAll} className="text-xs text-purple-500 hover:underline">
                  {selectedIndices.size === parsed.skills.length ? '取消全选' : '全选'}
                </button>
                <span className="text-xs text-gray-400">已选 {selectedIndices.size} / {parsed.skills.length}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={handleClose} className="px-5 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">取消</button>
          <button onClick={handleConfirmImport} disabled={!parsed || selectedIndices.size === 0}
            className="px-5 py-2 text-sm bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors">
            导入 {selectedIndices.size > 0 ? `(${selectedIndices.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== Main Component =====
export const PromptList: React.FC<SkillListProps> = ({ prompts, onDelete, onDeleteMany, onEdit, onImport, isImportOpen: externalImportOpen, onImportOpenChange }) => {
  const [internalImportOpen, setInternalImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isImportOpen = externalImportOpen !== undefined ? externalImportOpen : internalImportOpen;
  const setIsImportOpen = (v: boolean) => {
    setInternalImportOpen(v);
    onImportOpenChange?.(v);
  };

  if (prompts.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
          <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <Sparkles className="w-10 h-10 text-purple-300" />
          </div>
          <h3 className="text-lg font-medium text-gray-600 mb-1">暂无 Skills</h3>
          <p className="text-sm mb-4">创建你的第一个 Skill，或从外部导入 SkillPack</p>
        </div>
        <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={onImport} />
      </>
    );
  }

  const q = searchQuery.toLowerCase();
  const filteredPrompts = q
    ? prompts.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.content.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q))
      )
    : prompts;

  return (
    <>
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索 Skills（标题、标签、内容）…"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-8 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={15} />
          </button>
        )}
      </div>
      {searchQuery && (
        <p className="text-xs text-gray-500 mb-3">找到 {filteredPrompts.length} 个匹配</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPrompts.map(skill => (
          <SkillCard key={skill.id} skill={skill} onEdit={() => onEdit(skill)} onDelete={() => onDelete(skill.id)} />
        ))}
      </div>
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={onImport} />
    </>
  );
};
