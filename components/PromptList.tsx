import React, { useEffect, useState, useRef, useCallback } from 'react';
import { PromptRecord, SkillPack } from '../types';
import {
  Sparkles, Copy, Check, Edit2, Trash2, ChevronDown, ChevronUp,
  User, Link2, Upload, X, AlertCircle, CheckCircle2, Loader2,
  Globe, FileText, Zap, Search, Server, Plus,
} from 'lucide-react';
import {
  deleteMcpServer,
  loadMcpCategories,
  loadMcpServers,
  saveMcpCategories,
  saveMcpServers,
  upsertMcpCategory,
  upsertMcpServer,
  type AgentMcpServerConfig,
} from '../services/agent/mcpConfig';
import {
  loadAgentSkillCategoryOverrides,
  loadAgentSkillRoots,
  listAgentSkillsAsync,
  saveAgentSkillRoots,
  saveAgentSkillCategoryOverrides,
  scanAgentSkillDirectories,
  upsertAgentSkillRoot,
  type AgentSkillManifest,
  type AgentSkillRoot,
} from '../services/agent/skillManager';

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
  onCreate?: () => void;
  onImport: (skills: PromptRecord[]) => void;
  categories?: string[];
  onManageCategories?: () => void;
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
              {skill.category}
            </span>
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

const CategoryPills: React.FC<{
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
  onManage?: () => void;
}> = ({ categories, selected, onSelect, onManage }) => {
  const normalized = Array.from(new Set(categories.map(item => item.trim()).filter(Boolean)));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        onClick={() => onSelect('')}
        className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${!selected ? 'bg-slate-900 text-white' : 'border border-gray-200 bg-white text-gray-500 hover:text-gray-800'}`}
      >
        所有
      </button>
      {normalized.map(category => (
        <button
          key={category}
          onClick={() => onSelect(category)}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${selected === category ? 'bg-purple-600 text-white' : 'border border-gray-200 bg-white text-gray-500 hover:border-purple-200 hover:text-purple-600'}`}
        >
          {category}
        </button>
      ))}
      {onManage && (
        <button
          onClick={onManage}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-purple-200 hover:text-purple-600"
        >
          <Edit2 className="h-3.5 w-3.5" />
          管理分类
        </button>
      )}
    </div>
  );
};

const CategoryManagerDialog: React.FC<{
  open: boolean;
  title: string;
  categories: string[];
  onClose: () => void;
  onCreate?: (name: string) => void;
  onRename: (oldName: string, nextName: string) => void;
  onDelete?: (name: string, fallbackName?: string) => void;
}> = ({ open, title, categories, onClose, onCreate, onRename, onDelete }) => {
  const [newName, setNewName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const normalized = Array.from(new Set(categories.map(item => item.trim()).filter(Boolean)));

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setDrafts(Object.fromEntries(normalized.map(category => [category, category])));
  }, [open, categories.join('|')]);

  if (!open) return null;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name || !onCreate) return;
    onCreate(name);
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-xs text-gray-400">分类名不能是全部、默认、未分类</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {onCreate && (
            <div className="mb-4 flex gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-2">
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') handleCreate();
                }}
                placeholder="新分类名称"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="rounded-xl bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                新建
              </button>
            </div>
          )}

          {normalized.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
              暂无分类
            </div>
          ) : (
            <div className="space-y-2">
              {normalized.map(category => {
                const draft = drafts[category] ?? category;
                const changed = draft.trim() && draft.trim() !== category;
                const fallbackOptions = normalized.filter(item => item !== category);
                return (
                  <div key={category} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={event => setDrafts(prev => ({ ...prev, [category]: event.target.value }))}
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                      />
                      <button
                        onClick={() => onRename(category, draft.trim())}
                        disabled={!changed}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:border-purple-200 hover:text-purple-600 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        保存
                      </button>
                      {onDelete && (
                        <button
                          onClick={() => onDelete(category, fallbackOptions[0])}
                          className="rounded-xl border border-red-100 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      )}
                    </div>
                    {onDelete && fallbackOptions.length > 0 && (
                      <p className="mt-2 text-[11px] text-gray-400">删除时如有内容，会尝试迁移到「{fallbackOptions[0]}」。</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SkillManifestCard: React.FC<{ skill: AgentSkillManifest }> = ({ skill }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-500">
              {skill.category || 'Skills'}
            </span>
            {(skill.tags || []).slice(0, 3).map(tag => (
              <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{tag}</span>
            ))}
          </div>
          <h3 className="truncate text-sm font-semibold text-gray-900">{skill.name}</h3>
          {skill.description && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{skill.description}</p>}
          {skill.path && <p className="mt-2 truncate font-mono text-[11px] text-gray-400">{skill.path}</p>}
        </div>
        <button onClick={() => setExpanded(v => !v)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:text-purple-600">
          {expanded ? '收起' : '查看'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 max-h-64 overflow-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{skill.content || '*暂无内容*'}</ReactMarkdown>
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
            tags: [],
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
        tags: [],
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
              placeholder={`{\n  "name": "My Skills",\n  "skills": [\n    {\n      "title": "...",\n      "content": "...",\n      "category": "Dev"\n    }\n  ]\n}`}
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

const McpServerPanel: React.FC = () => {
  const [servers, setServers] = useState<AgentMcpServerConfig[]>(() => loadMcpServers());
  const [categories, setCategories] = useState<string[]>(() => loadMcpCategories());
  const [draft, setDraft] = useState({ name: '', category: '', command: '', args: '' });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [testingId, setTestingId] = useState('');
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const nextCategories = loadMcpCategories();
      setServers(loadMcpServers());
      setCategories(nextCategories);
      setDraft(prev => prev.category || nextCategories.length === 0 ? prev : { ...prev, category: nextCategories[0] });
    };
    window.addEventListener('guyue-agent-mcp-registry-changed', refresh);
    return () => window.removeEventListener('guyue-agent-mcp-registry-changed', refresh);
  }, []);

  const persist = (next: AgentMcpServerConfig[]) => {
    saveMcpServers(next);
    setServers(next);
    setCategories(loadMcpCategories());
  };

  const handleCreateCategory = (rawName?: string) => {
    const name = rawName?.trim();
    if (!name) return;
    try {
      const category = upsertMcpCategory(name);
      const nextCategories = loadMcpCategories();
      setCategories(nextCategories);
      setDraft(prev => ({ ...prev, category }));
      setSelectedCategory(category);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRenameCategory = (oldName: string, nextName: string) => {
    const name = nextName.trim();
    if (!name || name === oldName) return;
    if (categories.includes(name)) {
      alert(`分类「${name}」已存在`);
      return;
    }
    saveMcpCategories(categories.map(category => category === oldName ? name : category));
    persist(servers.map(server => server.category === oldName ? { ...server, category: name, updatedAt: Date.now() } : server));
    if (selectedCategory === oldName) setSelectedCategory(name);
    setDraft(prev => prev.category === oldName ? { ...prev, category: name } : prev);
  };

  const handleDeleteCategory = (name: string, fallbackName?: string) => {
    const affected = servers.filter(server => server.category === name);
    if (affected.length > 0 && !fallbackName) {
      alert(`分类「${name}」下有 ${affected.length} 个 MCP Server，请先创建另一个分类用于迁移。`);
      return;
    }
    if (!confirm(affected.length > 0 ? `删除分类「${name}」，并把 ${affected.length} 个 Server 迁移到「${fallbackName}」？` : `删除分类「${name}」？`)) {
      return;
    }
    saveMcpCategories(categories.filter(category => category !== name));
    persist(servers.map(server => server.category === name ? { ...server, category: fallbackName, updatedAt: Date.now() } : server));
    if (selectedCategory === name) setSelectedCategory('');
    setDraft(prev => prev.category === name ? { ...prev, category: fallbackName || '' } : prev);
  };

  const handleAdd = () => {
    const name = draft.name.trim();
    const command = draft.command.trim();
    if (!name || !command) {
      alert('需要填写名称和 command');
      return;
    }
    const category = draft.category.trim();
    if (!category || !categories.includes(category)) {
      alert(categories.length > 0 ? '请选择已有分类' : '请先创建 MCP 分类');
      return;
    }
    upsertMcpServer({
      name,
      category,
      command,
      transport: 'stdio',
      args: draft.args.split(/\s+/).map(item => item.trim()).filter(Boolean),
    });
    setDraft({ name: '', category: '', command: '', args: '' });
    setServers(loadMcpServers());
  };

  const handleTest = async (server: AgentMcpServerConfig) => {
    const api = (window as any).electronAPI;
    if (!api?.agentMcpListTools) {
      setTestResult(prev => ({
        ...prev,
        [server.id]: api
          ? 'MCP 执行器未暴露，请重启完整 Electron 应用后再试。'
          : 'MCP 执行器不可用：当前不是 Electron 桌面运行环境。',
      }));
      return;
    }
    setTestingId(server.id);
    setTestResult(prev => ({ ...prev, [server.id]: '连接中...' }));
    const result = await api.agentMcpListTools({ server }).catch((error: Error) => ({ success: false, error: error.message }));
    setTestingId('');
    setTestResult(prev => ({
      ...prev,
      [server.id]: result?.success
        ? `连接成功，发现 ${(result.tools || []).length} 个工具`
        : `连接失败：${result?.error || '未知错误'}`,
    }));
  };

  const handleManageCategories = () => {
    setShowCategoryManager(true);
  };

  return (
    <div className="space-y-4">
      <CategoryManagerDialog
        open={showCategoryManager}
        title="MCP 分类管理"
        categories={categories}
        onClose={() => setShowCategoryManager(false)}
        onCreate={handleCreateCategory}
        onRename={handleRenameCategory}
        onDelete={handleDeleteCategory}
      />
      <CategoryPills
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        onManage={handleManageCategories}
      />
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,0.8fr,1fr,1.4fr,auto] gap-2">
          <input value={draft.name} onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Server 名称" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
          <div className="flex gap-2">
            <select value={draft.category} onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))} className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100">
              <option value="" disabled>{categories.length > 0 ? '选择分类' : '请先创建分类'}</option>
              {categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <button onClick={() => setShowCategoryManager(true)} className="inline-flex w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:border-purple-200 hover:text-purple-600" title="新建 MCP 分类">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <input value={draft.command} onChange={e => setDraft(prev => ({ ...prev, command: e.target.value }))} placeholder="command，例如 npx" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
          <input value={draft.args} onChange={e => setDraft(prev => ({ ...prev, args: e.target.value }))} placeholder="args，例如 -y @modelcontextprotocol/server-filesystem /path" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100" />
          <button onClick={handleAdd} disabled={categories.length === 0} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300">
            <Plus className="h-4 w-4" />
            添加
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="flex h-[45vh] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-center text-gray-400">
          <Server className="mb-3 h-10 w-10 text-gray-300" />
          <div className="text-sm font-medium text-gray-500">暂无 MCP Server</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {servers
            .filter(server => !selectedCategory || server.category === selectedCategory)
            .map(server => (
            <div key={server.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-purple-500" />
                    <h3 className="truncate text-sm font-semibold text-gray-900">{server.name}</h3>
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] text-purple-500">{server.category || '未设置'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${server.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                      {server.enabled ? '启用' : '停用'}
                    </span>
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-gray-500">{server.command} {(server.args || []).join(' ')}</p>
                  {testResult[server.id] && <p className="mt-2 text-xs text-gray-500">{testResult[server.id]}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleTest(server)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-purple-200 hover:text-purple-600">{testingId === server.id ? '测试中' : '测试'}</button>
                  <button onClick={() => persist(servers.map(item => item.id === server.id ? { ...item, enabled: !item.enabled, updatedAt: Date.now() } : item))} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-purple-200 hover:text-purple-600">{server.enabled ? '停用' : '启用'}</button>
                  <button onClick={() => { if (confirm(`删除 MCP Server「${server.name}」？`)) { deleteMcpServer(server.id); setServers(loadMcpServers()); } }} className="rounded-lg border border-red-100 px-2 py-1 text-xs text-red-500 hover:bg-red-50">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SkillRootPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [roots, setRoots] = useState<AgentSkillRoot[]>(() => loadAgentSkillRoots());
  const [pathInput, setPathInput] = useState('');
  const [scanMessage, setScanMessage] = useState('');

  const refresh = () => setRoots(loadAgentSkillRoots());

  const handleAddRoot = () => {
    if (!pathInput.trim()) {
      alert('请输入包含 SKILL.md 的文件夹路径');
      return;
    }
    upsertAgentSkillRoot(pathInput);
    setPathInput('');
    refresh();
    onChanged?.();
  };

  const handleToggleRoot = (root: AgentSkillRoot) => {
    saveAgentSkillRoots(roots.map(item => item.id === root.id ? { ...item, enabled: !item.enabled, updatedAt: Date.now() } : item));
    refresh();
    onChanged?.();
  };

  const handleDeleteRoot = (root: AgentSkillRoot) => {
    saveAgentSkillRoots(roots.filter(item => item.id !== root.id));
    refresh();
    onChanged?.();
  };

  const handleScan = async () => {
    setScanMessage('扫描中...');
    const skills = await scanAgentSkillDirectories().catch(() => []);
    setScanMessage(`扫描到 ${skills.length} 个 SKILL.md`);
    onChanged?.();
  };

  return (
    <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">SKILL.md 根目录</h3>
          <p className="text-xs text-gray-400">Agent 会扫描启用目录下的 SKILL.md</p>
        </div>
        <button onClick={handleScan} className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-purple-200 hover:text-purple-600">
          扫描
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={pathInput}
          onChange={e => setPathInput(e.target.value)}
          placeholder="/Users/.../skills"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
        />
        <button onClick={handleAddRoot} className="rounded-xl bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700">
          添加
        </button>
      </div>
      {(roots.length > 0 || scanMessage) && (
        <div className="mt-3 space-y-2">
          {scanMessage && <p className="text-xs text-gray-500">{scanMessage}</p>}
          {roots.map(root => (
            <div key={root.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
              <span className="min-w-0 truncate font-mono text-xs text-gray-600">{root.path}</span>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => handleToggleRoot(root)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-white">
                  {root.enabled ? '停用' : '启用'}
                </button>
                <button onClick={() => handleDeleteRoot(root)} className="rounded-lg border border-red-100 px-2 py-1 text-xs text-red-500 hover:bg-red-50">
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const SkillsPanel: React.FC = () => {
  const [skills, setSkills] = useState<AgentSkillManifest[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listAgentSkillsAsync();
      setSkills(next.filter(skill => skill.source !== 'prompt'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const categories = Array.from(new Set(skills.map(skill => skill.category || 'Skills').filter(Boolean)));
  const visibleSkills = skills.filter(skill => !selectedCategory || (skill.category || 'Skills') === selectedCategory);

  const handleManageSkillCategories = () => {
    setShowCategoryManager(true);
  };

  const handleRenameSkillCategory = (oldName: string, nextName: string) => {
    const name = nextName.trim();
    if (!name || name === oldName) return;
    if (categories.includes(name)) {
      alert(`分类「${name}」已存在`);
      return;
    }
    const overrides = loadAgentSkillCategoryOverrides();
    skills
      .filter(skill => (skill.category || 'Skills') === oldName)
      .forEach(skill => { overrides[skill.id] = name; });
    saveAgentSkillCategoryOverrides(overrides);
    if (selectedCategory === oldName) setSelectedCategory(name);
    reload();
  };

  return (
    <div>
      <CategoryManagerDialog
        open={showCategoryManager}
        title="Skills 分类管理"
        categories={categories}
        onClose={() => setShowCategoryManager(false)}
        onRename={handleRenameSkillCategory}
      />
      <SkillRootPanel onChanged={reload} />
      <CategoryPills categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} onManage={handleManageSkillCategories} />
      {loading ? (
        <div className="flex h-40 items-center justify-center text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          扫描 Skills...
        </div>
      ) : visibleSkills.length === 0 ? (
        <div className="flex h-[36vh] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white text-center text-gray-400">
          <Sparkles className="mb-3 h-10 w-10 text-gray-300" />
          <div className="text-sm font-medium text-gray-500">暂无 SKILL.md</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleSkills.map(skill => <SkillManifestCard key={skill.id} skill={skill} />)}
        </div>
      )}
    </div>
  );
};

// ===== Main Component =====
export const PromptList: React.FC<SkillListProps> = ({ prompts, onDelete, onDeleteMany, onEdit, onCreate, onImport, categories = [], onManageCategories, isImportOpen: externalImportOpen, onImportOpenChange }) => {
  const [internalImportOpen, setInternalImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'skills' | 'mcp' | 'prompt'>('skills');
  const [selectedPromptCategory, setSelectedPromptCategory] = useState('');
  const isImportOpen = externalImportOpen !== undefined ? externalImportOpen : internalImportOpen;
  const setIsImportOpen = (v: boolean) => {
    setInternalImportOpen(v);
    onImportOpenChange?.(v);
  };

  const tabs = (
    <div className="mb-4 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
      <button
        onClick={() => setActiveTab('skills')}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'skills' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
      >
        Skills
      </button>
      <button
        onClick={() => setActiveTab('mcp')}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'mcp' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
      >
        MCP
      </button>
      <button
        onClick={() => setActiveTab('prompt')}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'prompt' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
      >
        Prompt
      </button>
    </div>
  );

  if (activeTab === 'skills') {
    return (
      <>
        {tabs}
        <SkillsPanel />
        <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={onImport} />
      </>
    );
  }

  if (activeTab === 'mcp') {
    return (
      <>
        {tabs}
        <McpServerPanel />
        <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={onImport} />
      </>
    );
  }

  if (prompts.length === 0) {
    return (
      <>
        {tabs}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {onCreate && (
            <button onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700">
              <Plus className="h-4 w-4" />
              新建 Prompt
            </button>
          )}
          <button onClick={() => setIsImportOpen(true)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:border-purple-200 hover:text-purple-600">
            导入
          </button>
        </div>
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
        s.content.toLowerCase().includes(q)
      )
    : prompts;
  const visiblePrompts = filteredPrompts.filter(prompt => !selectedPromptCategory || prompt.category === selectedPromptCategory);
  const promptCategories = categories.length > 0
    ? categories
    : Array.from(new Set(prompts.map(prompt => prompt.category).filter(Boolean)));

  return (
    <>
      {tabs}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CategoryPills
          categories={promptCategories}
          selected={selectedPromptCategory}
          onSelect={setSelectedPromptCategory}
          onManage={onManageCategories}
        />
        <div className="flex items-center gap-2">
          {onCreate && (
            <button onClick={onCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700">
              <Plus className="h-4 w-4" />
              新建
            </button>
          )}
          <button onClick={() => setIsImportOpen(true)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:border-purple-200 hover:text-purple-600">
            导入
          </button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索 Prompt（标题、内容）…"
          className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-8 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={15} />
          </button>
        )}
      </div>
      {searchQuery && (
        <p className="text-xs text-gray-500 mb-3">找到 {visiblePrompts.length} 个匹配</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visiblePrompts.map(skill => (
          <SkillCard key={skill.id} skill={skill} onEdit={() => onEdit(skill)} onDelete={() => onDelete(skill.id)} />
        ))}
      </div>
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={onImport} />
    </>
  );
};
