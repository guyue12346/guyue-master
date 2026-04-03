/**
 * VectorSearchModal — 向量库搜索测试弹窗
 *
 * 独立的全屏弹窗，可从 RAG Lab 或其他地方打开。
 * 调用 VectorService 统一 API 进行检索，展示详细结果和评估指标。
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Search, Loader2, ChevronDown, ChevronUp, BarChart3,
  Database, Tag, GitBranch, SlidersHorizontal, Play,
} from 'lucide-react';
import {
  searchWithMeta,
  listCollections,
  loadCollection,
  type VectorSearchResult,
  type VectorSearchOptions,
  type CollectionInfo,
  type SearchWithMetaResult,
} from '../services/vectorService';
import type { EmbeddingConfig, RetrievalStrategy, RerankerType } from '../services/ragLlamaIndex';
import { loadProfiles, API_PROVIDER_LABELS, API_PROVIDER_BASE_URLS } from '../utils/apiProfileService';
import type { ApiProfile } from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────

const DOC_TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-500/20 text-red-400',
  markdown: 'bg-blue-500/20 text-blue-400',
  text: 'bg-gray-500/20 text-gray-400',
  code: 'bg-green-500/20 text-green-400',
  html: 'bg-orange-500/20 text-orange-400',
  docx: 'bg-purple-500/20 text-purple-400',
};

const STRATEGY_OPTIONS: { value: RetrievalStrategy; label: string }[] = [
  { value: 'hybrid', label: '混合检索' },
  { value: 'vector', label: '向量检索' },
  { value: 'bm25', label: 'BM25 关键词' },
];

const RERANKER_OPTIONS: { value: RerankerType; label: string }[] = [
  { value: 'none', label: '无重排' },
  { value: 'mmr', label: 'MMR 多样性' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'jina', label: 'Jina' },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvalMetrics {
  totalResults: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scoreStdDev: number;
  totalMs: number;
  strategy: string;
  scoreDistribution: number[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 预选的集合 ID（从 RAG Lab 传入） */
  initialCollectionId?: string;
  /** 预填的嵌入配置（从 RAG Lab 传入） */
  initialEmbeddingConfig?: EmbeddingConfig;
  /** 隐藏集合选择器（当从单个集合的搜索图标打开时） */
  hideCollectionSelector?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function computeMetrics(results: VectorSearchResult[], totalMs: number, strategy: string): EvalMetrics {
  const scores = results.map(r => r.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const variance = scores.length ? scores.reduce((a, s) => a + (s - avg) ** 2, 0) / scores.length : 0;
  const distribution = new Array(10).fill(0);
  for (const s of scores) {
    const bucket = Math.min(9, Math.floor(s * 10));
    distribution[bucket]++;
  }
  return {
    totalResults: results.length,
    avgScore: avg,
    maxScore: scores.length ? Math.max(...scores) : 0,
    minScore: scores.length ? Math.min(...scores) : 0,
    scoreStdDev: Math.sqrt(variance),
    totalMs,
    strategy,
    scoreDistribution: distribution,
  };
}

// Default embedding config from localStorage (RAG Lab format)
function loadDefaultEmbeddingConfig(): EmbeddingConfig | null {
  try {
    const raw = localStorage.getItem('guyue_rag_lab_embedding');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VectorSearchModal({ isOpen, onClose, initialCollectionId, initialEmbeddingConfig, hideCollectionSelector }: Props) {
  // ── Collection state ──
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [collectionInfoMap, setCollectionInfoMap] = useState<Map<string, CollectionInfo>>(new Map());
  const [selectedCollectionId, setSelectedCollectionId] = useState(initialCollectionId ?? '');
  const [loadingCollections, setLoadingCollections] = useState(false);

  // ── Embedding config ──
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(
    initialEmbeddingConfig ?? loadDefaultEmbeddingConfig() ?? {
      provider: 'openai' as any,
      apiKey: '',
      model: 'text-embedding-3-small',
    }
  );

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [evalMetrics, setEvalMetrics] = useState<EvalMetrics | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [searchMeta, setSearchMeta] = useState<SearchWithMetaResult['meta'] | null>(null);

  // ── Search options ──
  const [showOptions, setShowOptions] = useState(false);
  const [useCollectionConfig, setUseCollectionConfig] = useState(true);
  const [topK, setTopK] = useState(10);
  const [strategy, setStrategy] = useState<RetrievalStrategy>('hybrid');
  const [alpha, setAlpha] = useState(0.7);
  const [reranker, setReranker] = useState<RerankerType>('none');

  // ── API profiles for embedding ──
  const [apiProfiles, setApiProfiles] = useState<ApiProfile[]>([]);

  // ── Load collections on open ──
  useEffect(() => {
    if (!isOpen) return;
    loadAvailableCollections();
    setApiProfiles(loadProfiles());
    // Sync embedding config from parent every time modal opens
    const freshConfig = initialEmbeddingConfig ?? loadDefaultEmbeddingConfig();
    if (freshConfig) setEmbeddingConfig(freshConfig);
    // Sync collection selection
    if (initialCollectionId) setSelectedCollectionId(initialCollectionId);
  }, [isOpen]);

  const loadAvailableCollections = async () => {
    setLoadingCollections(true);
    try {
      const ids = await listCollections();
      setCollectionIds(ids);

      // Load info for each collection
      const infoMap = new Map<string, CollectionInfo>();
      for (const id of ids) {
        try {
          const info = await loadCollection(id);
          infoMap.set(id, info);
        } catch { /* skip unloadable */ }
      }
      setCollectionInfoMap(infoMap);

      // Auto-select first if none selected
      if (!selectedCollectionId && ids.length > 0) {
        setSelectedCollectionId(ids[0]);
      }
    } catch (err: any) {
      console.error('Failed to load collections:', err);
    } finally {
      setLoadingCollections(false);
    }
  };

  // ── Search handler ──
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !selectedCollectionId) return;
    if (!embeddingConfig.apiKey) {
      setError('请先配置嵌入模型的 API Key');
      return;
    }

    setSearching(true);
    setSearchResults([]);
    setEvalMetrics(null);
    setSearchMeta(null);
    setError('');

    try {
      const options: VectorSearchOptions = useCollectionConfig
        ? { topK, useCollectionConfig: true }
        : { topK, strategy, alpha, reranker, rerankerTopN: topK };

      // Build llmFn from guyue_settings for pre-retrieval / LLM reranker
      try {
        const stored = localStorage.getItem('guyue_settings');
        const settings = stored ? JSON.parse(stored) : {};
        if (settings.apiKey) {
          const isGemini = (settings.baseUrl || '').includes('generativelanguage.googleapis.com');
          options.llmFn = async (prompt: string) => {
            if (isGemini) {
              const url = `${settings.baseUrl || 'https://generativelanguage.googleapis.com'}/v1beta/models/${settings.model || 'gemini-2.0-flash'}:generateContent?key=${settings.apiKey}`;
              const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
              const data = await res.json();
              return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            } else {
              const url = `${settings.baseUrl || 'https://api.openai.com'}/v1/chat/completions`;
              const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify({ model: settings.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3 }) });
              const data = await res.json();
              return data?.choices?.[0]?.message?.content ?? '';
            }
          };
        }
      } catch { /* no llmFn available */ }

      const result = await searchWithMeta(selectedCollectionId, searchQuery.trim(), embeddingConfig, options);

      setSearchResults(result.results);
      setSearchMeta(result.meta);
      setExpandedResults(new Set());
      setEvalMetrics(computeMetrics(result.results, result.meta.totalTimeMs, result.meta.retrievalStrategy));
    } catch (err: any) {
      console.error('Search error:', err);
      setError(`搜索失败: ${err?.message ?? String(err)}`);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, selectedCollectionId, embeddingConfig, topK, strategy, alpha, reranker, useCollectionConfig]);

  // ── Select API profile for embedding ──
  const handleSelectProfile = (profileId: string) => {
    const profile = apiProfiles.find(p => p.id === profileId);
    if (profile) {
      setEmbeddingConfig(prev => ({
        ...prev,
        provider: profile.provider as any,
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl || prev.baseUrl,
      }));
    }
  };

  if (!isOpen) return null;

  const selectedInfo = collectionInfoMap.get(selectedCollectionId);

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 shrink-0 bg-white">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Search size={20} className="text-pink-500" />
          向量库搜索测试
        </h2>
        <button
          className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center"
          onClick={onClose}
          title="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">

          {/* ── Collection Selector ── */}
          {hideCollectionSelector ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center gap-2">
              <Database size={14} className="text-blue-500" />
              <span className="text-sm font-semibold text-gray-800">{selectedCollectionId || '未选择'}</span>
              {selectedInfo && (
                <span className="text-xs text-gray-400 ml-2">
                  {selectedInfo.totalChunks} 块 · {selectedInfo.files.length} 文件
                  {selectedInfo.hasHnswIndex && ' · HNSW'}
                  {selectedInfo.hasKnowledgeGraph && ' · 知识图谱'}
                </span>
              )}
            </div>
          ) : (
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Database size={14} className="text-blue-500" /> 选择向量库集合
            </div>
            {loadingCollections ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                <Loader2 size={14} className="animate-spin" /> 加载集合列表…
              </div>
            ) : collectionIds.length === 0 ? (
              <div className="text-sm text-gray-400 py-2">
                暂无向量库集合，请先在 RAG Lab 中创建并构建索引
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {collectionIds.map(id => {
                  const info = collectionInfoMap.get(id);
                  const isActive = id === selectedCollectionId;
                  return (
                    <button
                      key={id}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                        isActive
                          ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                      onClick={() => setSelectedCollectionId(id)}
                    >
                      {id}
                      {info && (
                        <span className={`ml-1.5 text-xs ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>
                          ({info.totalChunks} 块)
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Collection info summary */}
            {selectedInfo && (
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                <span>嵌入: {selectedInfo.embeddingModel}</span>
                <span>文件: {selectedInfo.files.length}</span>
                <span>块数: {selectedInfo.totalChunks}</span>
                <span>算法: {selectedInfo.searchAlgorithm}</span>
                {selectedInfo.hasHnswIndex && <span className="text-green-500">✓ HNSW</span>}
                {selectedInfo.hasKnowledgeGraph && <span className="text-teal-500">✓ 知识图谱</span>}
              </div>
            )}
          </div>
          )}

          {/* ── Search Input ── */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none transition-colors"
              placeholder="输入查询语句…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              autoFocus
            />
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim() || !selectedCollectionId}
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              搜索
            </button>
            <button
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                showOptions ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
              onClick={() => setShowOptions(!showOptions)}
              title="搜索选项"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>

          {/* ── Search Options (collapsible) ── */}
          {showOptions && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <SlidersHorizontal size={14} className="text-gray-500" /> 搜索选项
              </div>

              {/* Toggle: use collection's saved config */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useCollectionConfig}
                    onClick={() => setUseCollectionConfig(!useCollectionConfig)}
                    className={`w-8 h-[18px] rounded-full relative transition-colors ${useCollectionConfig ? 'bg-blue-500' : 'bg-gray-300'}`}
                  >
                    <span className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm absolute top-[2px] left-[2px] transition-transform ${useCollectionConfig ? 'translate-x-3.5' : ''}`} />
                  </button>
                  <span className="text-xs text-gray-600">使用向量库已保存配置</span>
                </label>
                {useCollectionConfig && selectedInfo?.config && (
                  <span className="text-[10px] text-blue-500 ml-auto">
                    {selectedInfo.config.retrieval?.strategy ?? 'hybrid'} · TopK {selectedInfo.config.retrieval?.topK ?? 20}
                    {selectedInfo.config.reranker?.type !== 'none' ? ` · ${selectedInfo.config.reranker?.type}` : ''}
                  </span>
                )}
              </div>

              {!useCollectionConfig && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {/* Strategy */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">检索策略</label>
                  <select
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
                    value={strategy}
                    onChange={e => setStrategy(e.target.value as RetrievalStrategy)}
                  >
                    {STRATEGY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {/* TopK */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">返回数量 (TopK)</label>
                  <input
                    type="number"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
                    value={topK}
                    onChange={e => setTopK(parseInt(e.target.value) || 5)}
                    min={1}
                    max={50}
                  />
                </div>
                {/* Alpha (for hybrid) */}
                {strategy === 'hybrid' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">向量权重 (Alpha: {alpha.toFixed(2)})</label>
                    <input
                      type="range"
                      className="w-full"
                      min={0}
                      max={1}
                      step={0.05}
                      value={alpha}
                      onChange={e => setAlpha(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>BM25 优先</span><span>向量优先</span>
                    </div>
                  </div>
                )}
                {/* Reranker */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">重排策略</label>
                  <select
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none"
                    value={reranker}
                    onChange={e => setReranker(e.target.value as RerankerType)}
                  >
                    {RERANKER_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              )}

              {/* Embedding config quick view */}
              <div className="pt-2 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-2">嵌入模型配置</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <label className="text-[10px] text-gray-400 block">Provider</label>
                    <div className="text-gray-700 font-mono text-xs">{embeddingConfig.provider}</div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block">Model</label>
                    <div className="text-gray-700 font-mono text-xs">{embeddingConfig.model}</div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block">API Key</label>
                    <div className="text-gray-700 font-mono text-xs">
                      {embeddingConfig.apiKey ? '••••' + embeddingConfig.apiKey.slice(-4) : '未配置'}
                    </div>
                  </div>
                </div>
                {/* Profile quick-select */}
                {apiProfiles.length > 0 && (
                  <div className="mt-2">
                    <label className="text-[10px] text-gray-400 block mb-1">从已保存配置中选择</label>
                    <select
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
                      value=""
                      onChange={e => handleSelectProfile(e.target.value)}
                    >
                      <option value="">选择配置…</option>
                      {apiProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.provider})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ── Eval Metrics ── */}
          {evalMetrics && renderEvalMetrics(evalMetrics)}

          {/* ── Search Debug Info ── */}
          {searchMeta && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2 text-[11px]">
              <div className="font-semibold text-gray-600 flex items-center gap-1.5">
                <SlidersHorizontal size={12} /> 检索详情
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-500">
                <span>检索策略: <span className="font-medium text-gray-700">{searchMeta.retrievalStrategy}</span></span>
                <span>重排器: <span className="font-medium text-gray-700">{searchMeta.rerankerType}</span></span>
                <span>检索耗时: <span className="font-medium text-gray-700">{searchMeta.retrievalTimeMs.toFixed(0)}ms</span></span>
                <span>重排耗时: <span className="font-medium text-gray-700">{searchMeta.rerankTimeMs.toFixed(0)}ms</span></span>
                <span>总耗时: <span className="font-medium text-gray-700">{searchMeta.totalTimeMs.toFixed(0)}ms</span></span>
                <span>topK: <span className="font-medium text-gray-700">{searchMeta.topK}</span></span>
              </div>
              {searchMeta.preRetrievalStrategy !== 'none' && (
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <div className="font-medium text-gray-600 mb-1">检索前优化 ({searchMeta.preRetrievalStrategy})</div>
                  <div className="text-gray-500 space-y-0.5">
                    <div>原始查询: <span className="font-mono text-gray-700">"{searchMeta.originalQuery}"</span></div>
                    {searchMeta.optimizedQuery !== searchMeta.originalQuery && (
                      <div>优化后: <span className="font-mono text-blue-600">"{searchMeta.optimizedQuery}"</span></div>
                    )}
                    {searchMeta.preRetrievalLog.map((log, i) => (
                      <div key={i} className="text-[10px] text-gray-400">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Results ── */}
          <div className="space-y-2">
            {searchResults.length === 0 && !searching && !error && (
              <div className="text-center text-gray-400 text-sm py-8">
                {selectedCollectionId ? '输入查询语句开始搜索' : '请先选择一个向量库集合'}
              </div>
            )}
            {searching && (
              <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
                <Loader2 size={16} className="animate-spin" /> 正在搜索…
              </div>
            )}
            {searchResults.map((r, i) => renderResultCard(r, i, expandedResults, setExpandedResults))}
          </div>
        </div>
      </div>
  );
}

// ─── Result Card ────────────────────────────────────────────────────────────

function renderResultCard(
  r: VectorSearchResult,
  i: number,
  expandedResults: Set<number>,
  setExpandedResults: React.Dispatch<React.SetStateAction<Set<number>>>,
) {
  const isExpanded = expandedResults.has(i);
  const toggleExpand = () => setExpandedResults(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const m = r.metadata || {} as any;

  return (
    <div key={r.nodeId + i} className="bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-bold text-blue-500 shrink-0">#{i + 1}</span>
          {m.fileName && (
            <span className="text-xs text-gray-600 truncate max-w-[180px] font-medium" title={m.fileName}>{m.fileName}</span>
          )}
          {m.fileType && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${DOC_TYPE_COLORS[m.fileType] ?? DOC_TYPE_COLORS.text}`}>
              {m.fileType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
            {(r.score * 100).toFixed(1)}%
          </span>
          <button
            className="text-gray-400 hover:text-gray-600 transition-colors p-0.5"
            onClick={toggleExpand}
            title={isExpanded ? '收起' : '展开详情'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Score details bar */}
      <div className="flex flex-wrap gap-2 px-3 pt-1.5 text-[10px]">
        {(r as any).vectorScore !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">向量 {((r as any).vectorScore * 100).toFixed(1)}%</span>
        )}
        {(r as any).bm25Score !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">BM25 {((r as any).bm25Score).toFixed(3)}</span>
        )}
        {(r as any).retrievalStrategy && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{(r as any).retrievalStrategy}</span>
        )}
        {m.chunkIndex !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">块 {m.chunkIndex + 1}/{m.totalChunks}</span>
        )}
        {m.sectionTitle && (
          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600" title={m.sectionTitle}>§ {truncate(m.sectionTitle, 25)}</span>
        )}
        {m.pageNumber !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">页 {m.pageNumber}</span>
        )}
      </div>

      {/* Text preview / full */}
      <div className="px-3 py-2">
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
          {isExpanded ? r.text : truncate(r.text, 300)}
        </p>
        {!isExpanded && r.text.length > 300 && (
          <button className="text-[11px] text-blue-500 hover:text-blue-600 mt-1" onClick={toggleExpand}>
            展开全文 ↓
          </button>
        )}
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 space-y-2">
          {/* Metadata grid */}
          <div>
            <div className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1"><Tag size={10} /> 元数据</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
              {m.fileName && <div><span className="text-gray-400">文件名:</span> <span className="text-gray-700">{m.fileName}</span></div>}
              {m.filePath && <div className="col-span-2"><span className="text-gray-400">路径:</span> <span className="text-gray-700 break-all">{m.filePath}</span></div>}
              {m.fileType && <div><span className="text-gray-400">格式:</span> <span className="text-gray-700">{m.fileType}</span></div>}
              {m.fileSize !== undefined && <div><span className="text-gray-400">大小:</span> <span className="text-gray-700">{(m.fileSize / 1024).toFixed(1)} KB</span></div>}
              {m.pageNumber !== undefined && <div><span className="text-gray-400">页码:</span> <span className="text-gray-700">{m.pageNumber}</span></div>}
              {m.sectionTitle && <div><span className="text-gray-400">章节:</span> <span className="text-gray-700">{m.sectionTitle}</span></div>}
              {m.sectionLevel !== undefined && <div><span className="text-gray-400">层级:</span> <span className="text-gray-700">H{m.sectionLevel}</span></div>}
              {m.lineStart !== undefined && <div><span className="text-gray-400">行号:</span> <span className="text-gray-700">{m.lineStart}{m.lineEnd ? `-${m.lineEnd}` : ''}</span></div>}
              {m.language && <div><span className="text-gray-400">语言:</span> <span className="text-gray-700">{m.language}</span></div>}
              {m.codeLanguage && <div><span className="text-gray-400">编程语言:</span> <span className="text-gray-700">{m.codeLanguage}</span></div>}
              {m.functionName && <div><span className="text-gray-400">函数:</span> <span className="text-gray-700 font-mono">{m.functionName}</span></div>}
              {m.className && <div><span className="text-gray-400">类名:</span> <span className="text-gray-700 font-mono">{m.className}</span></div>}
              <div><span className="text-gray-400">块序号:</span> <span className="text-gray-700">{(m.chunkIndex ?? 0) + 1} / {m.totalChunks ?? '?'}</span></div>
              <div><span className="text-gray-400">节点ID:</span> <span className="text-gray-700 font-mono">{truncate(r.nodeId, 20)}</span></div>
              {m.embeddingModel && <div><span className="text-gray-400">嵌入模型:</span> <span className="text-gray-700">{m.embeddingModel}</span></div>}
              {m.indexedAt && <div><span className="text-gray-400">索引时间:</span> <span className="text-gray-700">{new Date(m.indexedAt).toLocaleString('zh-CN')}</span></div>}
            </div>
          </div>

          {/* Scores detail */}
          <div>
            <div className="text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1"><BarChart3 size={10} /> 评分详情</div>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <div className="flex items-center gap-1.5 bg-amber-50 rounded px-2 py-1">
                <span className="text-amber-500">综合分:</span>
                <span className="font-mono font-bold text-amber-700">{(r.score * 100).toFixed(2)}%</span>
                <div className="w-16 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(r.score * 100, 100)}%` }} />
                </div>
              </div>
              {(r as any).vectorScore !== undefined && (
                <div className="flex items-center gap-1.5 bg-blue-50 rounded px-2 py-1">
                  <span className="text-blue-500">向量:</span>
                  <span className="font-mono font-bold text-blue-700">{((r as any).vectorScore * 100).toFixed(2)}%</span>
                  <div className="w-16 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min((r as any).vectorScore * 100, 100)}%` }} />
                  </div>
                </div>
              )}
              {(r as any).bm25Score !== undefined && (
                <div className="flex items-center gap-1.5 bg-purple-50 rounded px-2 py-1">
                  <span className="text-purple-500">BM25:</span>
                  <span className="font-mono font-bold text-purple-700">{((r as any).bm25Score).toFixed(4)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Collapse button */}
          <button className="text-[11px] text-gray-400 hover:text-gray-600 w-full text-center pt-1" onClick={toggleExpand}>
            收起 ↑
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Eval Metrics Panel ─────────────────────────────────────────────────────

function renderEvalMetrics(metrics: EvalMetrics) {
  const { scoreDistribution, avgScore, maxScore, minScore, scoreStdDev, totalMs, totalResults, strategy } = metrics;
  const maxBucket = Math.max(...scoreDistribution, 1);

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
        <BarChart3 size={12} /> 检索评估指标
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3 text-[11px]">
        <div className="text-center">
          <div className="text-amber-500 font-mono text-sm">{totalResults}</div>
          <div className="text-gray-400">结果数</div>
        </div>
        <div className="text-center">
          <div className="text-green-500 font-mono text-sm">{(avgScore * 100).toFixed(1)}%</div>
          <div className="text-gray-400">平均分</div>
        </div>
        <div className="text-center">
          <div className="text-blue-500 font-mono text-sm">{(maxScore * 100).toFixed(1)}%</div>
          <div className="text-gray-400">最高分</div>
        </div>
        <div className="text-center">
          <div className="text-purple-500 font-mono text-sm">{totalMs.toFixed(0)}ms</div>
          <div className="text-gray-400">总耗时</div>
        </div>
      </div>
      {/* Score distribution histogram */}
      <div className="flex items-end gap-px h-10 mb-1">
        {scoreDistribution.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-blue-400 rounded-t-sm transition-all"
              style={{ height: `${(count / maxBucket) * 100}%`, minHeight: count > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
      <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
        <span>策略: {strategy}</span>
        <span>标准差: {(scoreStdDev * 100).toFixed(1)}%</span>
        <span>最低分: {(minScore * 100).toFixed(1)}%</span>
        <span>耗时: {totalMs.toFixed(0)}ms</span>
      </div>
    </div>
  );
}
