import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FlaskConical, Upload, Search, Trash2, Play, Settings2, Zap,
  FileText, ChevronDown, ChevronRight, Loader2, CheckCircle2,
  AlertCircle, Clock, Hash, Layers, SlidersHorizontal, Sparkles,
  Plus, FolderOpen, Save, Database, BarChart3, X,
  GitBranch, Repeat, Route, FileCode, FileType,
  HelpCircle, Settings, FolderPlus, Pencil,
  LayoutGrid, List as ListIcon, ArrowUp, ArrowDown, Home, Folder,
  RefreshCw, ChevronUp, Info, FileSearch, MapPin, Tag, Palette,
  Maximize2, Minimize2,
} from 'lucide-react';
import type {
  EmbeddingProvider, EmbeddingConfig, SupportedDocType, ChunkingStrategy,
  ChunkingConfig, RetrievalStrategy, FusionMethod, RetrievalConfig,
  RerankerType, RerankerConfig, SearchResult,
  FormatChunkingOverrides, MarkdownChunkingConfig, PdfChunkingConfig,
  HtmlChunkingConfig, CodeChunkingConfig,
  PreRetrievalStrategy, PreRetrievalConfig, SearchAlgorithm, HnswConfig,
  KnowledgeGraphConfig,
} from '../services/ragLlamaIndex';
import {
  loadDocuments, chunkDocuments, createEmbedFunction,
  LocalVectorStore, buildBM25FromVectorStore,
  RagPipeline, createSimpleVectorConfig, createBalancedConfig,
  createPrecisionConfig, EMBEDDING_MODEL_OPTIONS, DEFAULT_CHUNKING_CONFIG,
  enrichMetadata, executeQueryMode, optimizePreRetrieval,
  buildKnowledgeGraph, KnowledgeGraph,
} from '../services/ragLlamaIndex';
import type { FileReader as RagFileReader } from '../services/ragLlamaIndex';
import type { QueryEngineConfig } from '../services/ragLlamaIndex';
import type { QueryMode, QueryModeConfig, SubQuestionConfig, IterativeConfig, CustomQueryConfig } from '../services/ragLlamaIndex/queryModes';
import VectorSearchModal from './VectorSearchModal';
import { deleteCollection as deleteCollectionCache } from '../services/vectorService';
import { loadProfiles, API_PROVIDER_LABELS, API_PROVIDER_BASE_URLS } from '../utils/apiProfileService';
import type { ApiProfile } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const LS_PREFIX = 'guyue_rag_lab_';
const LS_EMBEDDING = `${LS_PREFIX}embedding`;
const LS_CHUNKING = `${LS_PREFIX}chunking`;
const LS_RETRIEVAL = `${LS_PREFIX}retrieval`;
const LS_RERANKER = `${LS_PREFIX}reranker`;
const LS_COLLECTIONS = `${LS_PREFIX}collections`;
const LS_ACTIVE_COLLECTION = `${LS_PREFIX}active_collection`;
const LS_DOCUMENTS = `${LS_PREFIX}all_documents`;
const LS_FOLDERS = `${LS_PREFIX}doc_folders`;
const LS_QUERY_MODE = `${LS_PREFIX}query_mode`;
const LS_FORMAT_OVERRIDES = `${LS_PREFIX}format_overrides`;
const LS_PRE_RETRIEVAL = `${LS_PREFIX}pre_retrieval`;
const LS_SEARCH_ALGO = `${LS_PREFIX}search_algorithm`;
const LS_KG_API_PROFILE = `${LS_PREFIX}kg_api_profile`;
const LS_PRE_RETRIEVAL_API_PROFILE = `${LS_PREFIX}pre_retrieval_api_profile`;
const LS_LLM_RERANKER_API_PROFILE = `${LS_PREFIX}llm_reranker_api_profile`;
const RAG_DIR_NAME = 'rag-indexes';

const PROVIDERS: EmbeddingProvider[] = ['openai', 'gemini', 'zhipu', 'qwen', 'ollama', 'custom'];
const PROVIDER_LABELS: Record<EmbeddingProvider, string> = {
  openai: 'OpenAI', gemini: 'Gemini', zhipu: '智谱AI', qwen: '通义千问', ollama: 'Ollama (本地)', custom: '自定义',
};
const CHUNKING_STRATEGIES: { value: ChunkingStrategy; label: string; desc: string }[] = [
  { value: 'sentence', label: '句子分割（含滑动重叠）', desc: '按句合并到块上限，通过 chunkOverlap 实现相邻块重叠' },
  { value: 'sentence-window', label: '句子上下文窗口', desc: '每块一个句子，前后 N 句作为上下文元数据' },
  { value: 'semantic', label: '语义分割', desc: '用 Embedding 检测话题切换点，智能切分' },
];
const RETRIEVAL_STRATEGIES: { value: RetrievalStrategy; label: string }[] = [
  { value: 'vector', label: '向量检索' },
  { value: 'bm25', label: 'BM25 关键词' },
  { value: 'hybrid', label: '混合检索' },
];
const FUSION_METHODS: { value: FusionMethod; label: string }[] = [
  { value: 'rrf', label: 'RRF 排序融合' },
  { value: 'alpha', label: 'Alpha 加权' },
];
const RERANKER_TYPES: { value: RerankerType; label: string }[] = [
  { value: 'none', label: '无重排' },
  { value: 'mmr', label: 'MMR 多样性' },
  { value: 'llm', label: 'LLM 重排' },
  { value: 'cohere', label: 'Cohere Rerank' },
  { value: 'jina', label: 'Jina Rerank' },
];
const PRE_RETRIEVAL_STRATEGIES: { value: PreRetrievalStrategy; label: string; desc: string }[] = [
  { value: 'none', label: '无优化', desc: '直接使用原始查询' },
  { value: 'expansion', label: '查询扩展', desc: 'LLM 补充同义词/相关术语提高召回率' },
  { value: 'rewrite', label: '查询改写', desc: 'LLM 改写为更精确的检索表述' },
  { value: 'hyde', label: 'HyDE 假设文档', desc: 'LLM 生成假设回答，用其向量检索（最强但最慢）' },
];
const SEARCH_ALGORITHMS: { value: SearchAlgorithm; label: string; desc: string }[] = [
  { value: 'brute-force', label: '暴力搜索', desc: 'O(n) 遍历所有向量，适合 < 5000 块' },
  { value: 'hnsw', label: 'HNSW 图索引', desc: 'O(log n) 近似最近邻，适合大数据集' },
];
const DOC_TYPE_COLORS: Record<string, string> = {
  pdf: 'bg-red-500/20 text-red-400',
  markdown: 'bg-blue-500/20 text-blue-400',
  text: 'bg-gray-500/20 text-gray-400',
  code: 'bg-green-500/20 text-green-400',
  html: 'bg-orange-500/20 text-orange-400',
  docx: 'bg-purple-500/20 text-purple-400',
};
const QUERY_MODES: { value: QueryMode; label: string; desc: string }[] = [
  { value: 'single', label: '单次检索', desc: '标准 RAG 流程' },
  { value: 'router', label: '条件路由', desc: 'LLM/关键词路由到不同知识库' },
  { value: 'sub-question', label: '分支并行', desc: '分解子问题并行检索合并' },
  { value: 'iterative', label: '循环迭代', desc: '自动改写查询反复检索' },
  { value: 'custom', label: '自定义', desc: '自由组合检索步骤' },
];
const MERGE_STRATEGIES: { value: string; label: string }[] = [
  { value: 'concatenate', label: '直接合并' },
  { value: 'deduplicate', label: '去重合并' },
  { value: 'rerank', label: '重排合并' },
];
const REFINE_STRATEGIES: { value: string; label: string }[] = [
  { value: 'expand', label: '关键词扩展' },
  { value: 'rephrase', label: 'LLM 改写' },
  { value: 'decompose', label: '查询简化' },
];
const MD_CHUNK_METHODS: { value: string; label: string }[] = [
  { value: 'heading', label: '标题层级分割' },
  { value: 'sentence', label: '句子分割' },
  { value: 'semantic', label: '语义分割' },
];
const PDF_CHUNK_METHODS: { value: string; label: string }[] = [
  { value: 'page', label: '按页分割' },
  { value: 'paragraph', label: '按段落分割' },
  { value: 'sentence', label: '句子分割' },
  { value: 'semantic', label: '语义分割' },
];
const HTML_CHUNK_METHODS: { value: string; label: string }[] = [
  { value: 'dom-section', label: 'DOM 语义标签分割' },
  { value: 'sentence', label: '句子分割' },
  { value: 'semantic', label: '语义分割' },
];
const CODE_CHUNK_METHODS: { value: string; label: string }[] = [
  { value: 'function', label: '函数边界分割' },
  { value: 'class', label: '类边界分割' },
  { value: 'block', label: '代码块分割' },
  { value: 'sentence', label: '句子分割' },
];

type IndexStatus = 'idle' | 'loading' | 'chunking' | 'embedding' | 'saving' | 'ready' | 'error';
interface DocEntry { name: string; path: string; type: SupportedDocType; size?: number; folderId: string | null }

// ── 嵌套文件夹数据模型 ──
interface FolderNode {
  id: string;
  name: string;
  parentId: string | null; // null = 根目录
  icon?: string;  // Lucide icon name (default: 'Folder')
  color?: string; // hex color (default: '#60A5FA' blue-400)
}

function generateFolderId(): string {
  return `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 将旧版 string[] 格式迁移为 FolderNode[] */
function migrateFoldersFromStorage(stored: any): FolderNode[] {
  if (!Array.isArray(stored) || stored.length === 0) return [];
  if (typeof stored[0] === 'string') {
    return (stored as string[])
      .filter(name => name !== '未分类')
      .map(name => ({ id: generateFolderId(), name, parentId: null }));
  }
  if (typeof stored[0] === 'object' && 'id' in stored[0]) return stored;
  return [];
}

/** 将旧版 folder?: string 迁移为 folderId: string | null */
function migrateDocumentsFolder(docs: any[], flds: FolderNode[]): DocEntry[] {
  return docs.map((d: any) => {
    if ('folderId' in d) return d;
    if (d.folder && d.folder !== '未分类') {
      const match = flds.find(f => f.name === d.folder);
      const { folder: _f, ...rest } = d;
      return { ...rest, folderId: match?.id ?? null };
    }
    const { folder: _f, ...rest } = d;
    return { ...rest, folderId: null };
  });
}

function getChildFolders(flds: FolderNode[], parentId: string | null): FolderNode[] {
  return flds.filter(f => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
}

function getAncestorPath(flds: FolderNode[], folderId: string | null): FolderNode[] {
  const path: FolderNode[] = [];
  let cur = folderId;
  while (cur) {
    const node = flds.find(f => f.id === cur);
    if (!node) break;
    path.unshift(node);
    cur = node.parentId;
  }
  return path;
}

function getAllDescendantIds(flds: FolderNode[], parentId: string): Set<string> {
  const ids = new Set<string>();
  const queue = [parentId];
  while (queue.length) {
    const pid = queue.shift()!;
    for (const f of flds) {
      if (f.parentId === pid && !ids.has(f.id)) {
        ids.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return ids;
}

function countFolderItems(flds: FolderNode[], docs: DocEntry[], folderId: string): number {
  const childFolders = flds.filter(f => f.parentId === folderId).length;
  const childDocs = docs.filter(d => d.folderId === folderId).length;
  return childFolders + childDocs;
}

// 预设颜色供向量库图标选择
const COLLECTION_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316', '#06B6D4', '#EC4899', '#14B8A6', '#6366F1'];
// 向量库图标（lucide icon 名称）
const COLLECTION_ICON_NAMES = ['Database', 'BookOpen', 'Brain', 'Lightbulb', 'FlaskConical', 'FileText', 'Target', 'Globe', 'Zap', 'FolderOpen'];
// 文件夹图标选项
const FOLDER_ICON_NAMES = ['Folder', 'FolderOpen', 'FolderHeart', 'FolderCog', 'FolderSearch', 'BookOpen', 'Archive', 'Package', 'Library', 'Inbox', 'FileStack', 'Layers'];
const FOLDER_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#FB923C', '#22D3EE', '#F472B6', '#2DD4BF', '#818CF8', '#94A3B8', '#A3E635'];
import * as LucideIcons from 'lucide-react';
const getCollectionIcon = (iconName: string, color: string, size = 16) => {
  const Icon = (LucideIcons as any)[iconName] || LucideIcons.Database;
  return <Icon size={size} style={{ color }} />;
};
const getFolderIcon = (iconName?: string, color?: string, size = 16) => {
  const Icon = (LucideIcons as any)[iconName || 'Folder'] || LucideIcons.Folder;
  return <Icon size={size} style={{ color: color || '#60A5FA' }} />;
};

interface CollectionMeta {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: number;
  vectorCount: number;
  docPaths: string[];   // 引用文档路径，与 documents 解耦
  embeddingProvider: string;
  embeddingModel: string;
  /** 大模型生成的向量库内容摘要 */
  summary?: string;
  /** 是否已构建 HNSW 索引 */
  hasHnsw?: boolean;
  /** 是否已构建知识图谱 */
  hasKg?: boolean;
  /** 知识图谱三元组数量 */
  kgTripleCount?: number;
}

/** LLM API 配置（用于知识图谱构建、检索前优化等需要LLM的功能） */
interface LlmApiConfig {
  profileId: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface BuildProgress {
  phase: 'loading' | 'chunking' | 'embedding' | 'saving';
  current: number;
  total: number;
  detail: string;
  errors: string[];
}

interface EvalMetrics {
  totalResults: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scoreStdDev: number;
  retrievalMs: number;
  rerankMs: number;
  totalMs: number;
  scoreDistribution: number[]; // 10 buckets [0-0.1, 0.1-0.2, ...]
  strategy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Default config values (used when switching to collection without saved config) ──
const DEFAULT_RETRIEVAL: RetrievalConfig = { strategy: 'hybrid' as RetrievalStrategy, topK: 20, alpha: 0.7, fusionMethod: 'rrf' as FusionMethod, rrfK: 60 };
const DEFAULT_RERANKER: RerankerConfig = { type: 'none' as RerankerType, topN: 5, mmrLambda: 0.7 };
const DEFAULT_QUERY_MODE: QueryModeConfig = { mode: 'single' as QueryMode, subQuestion: { maxSubQuestions: 3, mergeStrategy: 'deduplicate' as const, deduplicateThreshold: 0.9 }, iterative: { maxIterations: 3, qualityThreshold: 0.7, refinementStrategy: 'rephrase' as const } };
const DEFAULT_PRE_RETRIEVAL: PreRetrievalConfig = { strategy: 'none' as PreRetrievalStrategy, expansion: { maxTerms: 5, includeOriginal: true }, rewrite: { style: 'precise' as const }, hyde: { responseLength: 'medium' as const, numHypothetical: 1 } };
const DEFAULT_HNSW: HnswConfig = { m: 16, efConstruction: 200, efSearch: 50 };
const DEFAULT_KG_CONFIG: KnowledgeGraphConfig = { enabled: false, maxTriplesPerChunk: 10, includeEntityDescriptions: true };

function inferDocType(name: string): SupportedDocType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, SupportedDocType> = {
    pdf: 'pdf', md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    txt: 'text', log: 'text', csv: 'text', json: 'text', yaml: 'text', yml: 'text', xml: 'text', toml: 'text', ini: 'text', conf: 'text',
    ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code',
    java: 'code', go: 'code', rs: 'code', c: 'code', cpp: 'code', h: 'code',
    cs: 'code', rb: 'code', php: 'code', swift: 'code', kt: 'code', scala: 'code',
    sql: 'code', sh: 'code', bash: 'code', lua: 'code', dart: 'code',
    vue: 'code', svelte: 'code', css: 'code', scss: 'code', less: 'code',
    html: 'html', htm: 'html',
    docx: 'docx',
  };
  return map[ext] ?? 'text';
}

const SUPPORTED_EXTS = new Set(Object.keys({
  pdf: 1, md: 1, markdown: 1, mdx: 1, txt: 1, log: 1, csv: 1, json: 1, yaml: 1, yml: 1, xml: 1, toml: 1,
  ts: 1, tsx: 1, js: 1, jsx: 1, py: 1, java: 1, go: 1, rs: 1, c: 1, cpp: 1, h: 1, cs: 1, rb: 1, php: 1,
  swift: 1, kt: 1, scala: 1, sql: 1, sh: 1, bash: 1, lua: 1, dart: 1, vue: 1, svelte: 1,
  css: 1, scss: 1, less: 1, html: 1, htm: 1, ini: 1, conf: 1,
}));

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s; }

/** 从 LlmApiConfig 或 guyue_settings 构建通用LLM调用函数 */
function makeLlmFnFromConfig(cfg: LlmApiConfig): (prompt: string) => Promise<string> {
  const { apiKey, model, baseUrl: rawBase } = cfg;
  const baseUrl = (rawBase || '').replace(/\/+$/, '');
  if (!apiKey) {
    return async () => { throw new Error('未配置 API Key。请选择一个 API 配置。'); };
  }
  const isGemini = baseUrl.includes('generativelanguage.googleapis.com') || baseUrl.includes('google');
  if (isGemini) {
    return async (prompt: string) => {
      const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Gemini API error ${res.status}: ${errBody.substring(0, 300)}`);
      }
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    };
  }
  return async (prompt: string) => {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`LLM API error ${res.status}: ${errBody.substring(0, 300)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  };
}

/** 从已选API配置或guyue_settings构建LLM函数 */
function makeUniversalLlmFn(apiConfig?: LlmApiConfig | null, fallbackApiKey?: string): (prompt: string) => Promise<string> {
  if (apiConfig?.apiKey) return makeLlmFnFromConfig(apiConfig);
  // Fallback: guyue_settings
  const stored = localStorage.getItem('guyue_settings');
  const settings = stored ? JSON.parse(stored) : {};
  return makeLlmFnFromConfig({
    profileId: '',
    provider: 'gemini',
    apiKey: settings.apiKey || fallbackApiKey || '',
    model: settings.model || 'gemini-2.0-flash',
    baseUrl: settings.baseUrl || 'https://generativelanguage.googleapis.com',
  });
}

function inferCategory(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return '默认';
}

function computeMetrics(results: SearchResult[], retrievalMs: number, rerankMs: number, totalMs: number, strategy: string): EvalMetrics {
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
    retrievalMs, rerankMs, totalMs, strategy,
    scoreDistribution: distribution,
  };
}

const eApi = () => (window as any).electronAPI as any;

const electronFileReader: RagFileReader = {
  async readTextFile(filePath: string): Promise<string> {
    const result = await eApi().readFile(filePath);
    if (typeof result === 'string') return result;
    const bytes = new Uint8Array(result);
    return new TextDecoder().decode(bytes);
  },
  async readPdfText(filePath: string): Promise<string> {
    try {
      const text = await eApi().extractPdfText(filePath);
      if (text) return text;
    } catch (e) {
      console.warn('PDF extraction via IPC failed, falling back to readTextFile:', e);
    }
    return this.readTextFile(filePath);
  },
  async getFileStats(filePath: string): Promise<{ size: number; mtime: number }> {
    const stats = await eApi().getFileStats(filePath);
    return stats ?? { size: 0, mtime: Date.now() };
  },
};

async function getRagDir(): Promise<string> {
  const userData = await eApi().getUserDataPath();
  return `${userData}/${RAG_DIR_NAME}`;
}

async function ensureRagDir(): Promise<string> {
  const dir = await getRagDir();
  await eApi().ensureDir(dir);
  return dir;
}

async function saveCollectionToDisk(id: string, data: any): Promise<void> {
  const dir = await ensureRagDir();
  await eApi().writeFile(`${dir}/${id}.json`, JSON.stringify(data));
}

async function loadCollectionFromDisk(id: string): Promise<any | null> {
  const dir = await getRagDir();
  const raw = await eApi().readFile(`${dir}/${id}.json`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function deleteCollectionFromDisk(id: string): Promise<void> {
  const dir = await getRagDir();
  await eApi().deleteFile(`${dir}/${id}.json`);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const panelCls = 'bg-white border border-gray-200 rounded-xl';
const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none transition-colors';
const selectCls = `${inputCls} appearance-none cursor-pointer`;
const btnPrimary = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnSecondary = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 text-gray-800 hover:bg-gray-200 transition-colors disabled:opacity-40';
const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
const sectionTitle = 'flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3';

/** macOS-style toggle switch */
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string; size?: 'sm' | 'md' }> = ({ checked, onChange, label, size = 'sm' }) => {
  const w = size === 'md' ? 'w-9 h-5' : 'w-7 h-4';
  const dot = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const translate = size === 'md' ? 'translate-x-4' : 'translate-x-3';
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`${w} rounded-full relative transition-colors duration-200 ease-in-out flex-shrink-0 ${
          checked ? 'bg-blue-500' : 'bg-gray-300'
        }`}
      >
        <span className={`${dot} bg-white rounded-full shadow-sm absolute top-0.5 left-0.5 transition-transform duration-200 ease-in-out ${
          checked ? translate : 'translate-x-0'
        }`} />
      </button>
      {label && <span className="text-xs text-gray-600">{label}</span>}
    </label>
  );
};

// ── LLM Model options per provider (for KG / pre-retrieval API config) ──
const LLM_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  ],
  zhipu: [
    { value: 'glm-4-flash-250414', label: 'GLM-4 Flash (免费)' },
    { value: 'glm-4-plus', label: 'GLM-4 Plus' },
  ],
  moonshot: [
    { value: 'moonshot-v1-128k', label: 'Moonshot 128K' },
  ],
  minimax: [
    { value: 'MiniMax-M2', label: 'MiniMax M2' },
  ],
  ollama: [
    { value: 'llama3.3', label: 'Llama 3.3' },
    { value: 'qwen3', label: 'Qwen3' },
  ],
};

/** 内联 API 配置选择器：从全局 API Profiles 中选取，并选择模型 */
const ApiProfilePicker: React.FC<{
  value: LlmApiConfig | null;
  onChange: (cfg: LlmApiConfig | null) => void;
  storageKey: string;
  label?: string;
}> = ({ value, onChange, storageKey, label }) => {
  const [profiles, setProfiles] = React.useState<ApiProfile[]>([]);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setProfiles(loadProfiles()); }, [open]);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectProfile = (p: ApiProfile) => {
    const models = LLM_MODEL_OPTIONS[p.provider] || [];
    const cfg: LlmApiConfig = {
      profileId: p.id,
      provider: p.provider,
      apiKey: p.apiKey,
      model: models[0]?.value || '',
      baseUrl: p.baseUrl || (API_PROVIDER_BASE_URLS as any)[p.provider] || '',
    };
    onChange(cfg);
    localStorage.setItem(storageKey, JSON.stringify(cfg));
    setOpen(false);
  };

  const selectModel = (model: string) => {
    if (!value) return;
    const updated = { ...value, model };
    onChange(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const clear = () => {
    onChange(null);
    localStorage.removeItem(storageKey);
    setOpen(false);
  };

  const selectedProfile = profiles.find(p => p.id === value?.profileId);
  const models = value ? (LLM_MODEL_OPTIONS[value.provider] || []) : [];

  return (
    <div ref={ref} className="relative">
      {label && <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex-1 text-left text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
            value?.apiKey
              ? 'bg-white border-blue-200 text-gray-700 hover:border-blue-300'
              : 'bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-300'
          }`}
        >
          {selectedProfile
            ? `${(API_PROVIDER_LABELS as any)[selectedProfile.provider] || selectedProfile.provider} · ${selectedProfile.name}`
            : '⚠️ 请选择 API 配置'}
        </button>
        {value && models.length > 0 && (
          <select
            className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 min-w-0"
            value={value.model}
            onChange={e => selectModel(e.target.value)}
          >
            {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            {value.model && !models.find(m => m.value === value.model) && (
              <option value={value.model}>{value.model}</option>
            )}
          </select>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {profiles.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">
              暂无 API 配置，请在「总设置」中添加
            </div>
          ) : (
            <>
              {profiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center justify-between transition-colors ${
                    value?.profileId === p.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                  onClick={() => selectProfile(p)}
                >
                  <span>{(API_PROVIDER_LABELS as any)[p.provider] || p.provider} · {p.name}</span>
                  {value?.profileId === p.id && <span className="text-blue-500">✓</span>}
                </button>
              ))}
              {value && (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-t border-gray-100 transition-colors"
                  onClick={clear}
                >
                  清除选择
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Help Content ────────────────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    title: '📦 分块策略（Chunking）',
    content: `分块是 RAG 中对检索质量影响最大的环节，决定了文档被切分成怎样的片段。

【三种通用策略】
• 句子分割（SentenceSplitter）：按句子贪心合并到 chunkSize 上限，相邻块通过 chunkOverlap 实现重叠。
• 句子窗口（SentenceWindow）：每个节点是单个句子，前后 N 句作为上下文窗口。
  → 检索用核心句（精准匹配），回答用窗口文本（丰富上下文）。
• 语义分割（SemanticSplitter）：用 Embedding 模型检测话题转换点，在转换处切分。
  → 最智能但最慢，需要 Embedding 模型支持。

【格式感知分块】
启用后不同格式使用专用分块器（Markdown/PDF/HTML/Code）。

【参数详解】
• chunkSize（块大小）：每个块的最大 token 数。
  → 默认 512。推荐 256-1024。
  → 小值 → 检索精准但上下文少；大值 → 上下文丰富但可能混入无关内容。
• chunkOverlap（块重叠）：相邻块之间重叠的 token 数。
  → 默认 50。推荐 chunkSize 的 10-20%。
  → 作用：防止关键信息被切断在两个块之间。
• windowSize（窗口大小）：句子窗口模式专用，前后各取 N 句。
  → 默认 3。推荐 2-5。越大上下文越丰富，但占用空间越多。`,
  },
  {
    title: '🔍 检索配置',
    content: `检索决定 LLM 能"看到"哪些信息，直接影响回答质量。

【检索策略】
• 向量检索（vector）：用余弦相似度匹配语义。适合自然语言问题。
• BM25 关键词检索（bm25）：基于词频。适合精确关键词搜索。
• 混合检索（hybrid）：Vector + BM25 融合（推荐）。

【参数详解】
• topK（返回数量）：最终返回的结果数量。
  → 默认 5。推荐 3-20。
  → 小值 → 精准但可能遗漏；大值 → 覆盖面广但可能引入噪声。
• alpha（混合权重）：混合检索时向量的权重（0-1）。
  → 默认 0.7。
  → 1.0 = 纯向量；0.0 = 纯 BM25。0.7 表示偏重语义。
• 融合方式：RRF（排名倒数融合）或 Alpha 加权。
  → RRF 更稳健，推荐使用。
• rrfK（RRF 常数）：RRF 融合的平滑因子。
  → 默认 60。较大值使排名差异更平缓。
• bm25K1（BM25 词频饱和度）：控制词频贡献的饱和速度。
  → 默认 1.2。范围 1.0-2.0。较大值对高频词给予更多权重。
• bm25B（BM25 文档长度归一化）：惩罚长文档的程度。
  → 默认 0.75。范围 0-1。0 = 不惩罚长文档，1 = 完全归一化。

【向量搜索算法】
• 暴力搜索（brute-force）：精确计算，<10000 向量时足够快。
• HNSW：构建近似最近邻图，适合大规模向量库。
  → 需要先在「索引优化」中构建。

【知识图谱检索】
• includeKnowledgeGraph：是否在检索时利用知识图谱。
  → 需要先构建知识图谱。
• kgMaxTriples：每次检索最多引入的三元组数量，默认 5。`,
  },
  {
    title: '🔄 重排与检索前优化',
    content: `【重排序（Reranking）】
初始检索是"海选"，重排序是"决赛评审"。

• 无（none）：不重排，直接返回初始检索结果。
• MMR（最大边际相关性）：在相关性和多样性之间平衡。
• LLM 重排：让大模型逐一评分，最灵活（需配置 API）。
• Cohere：专用重排序 API，速度快精度高。
• Jina：专用重排序 API，支持中文。

【重排参数】
• topN（重排后数量）：重排后保留的结果数。
  → 默认等于 topK。如果 topK=10，topN=5 则重排后只保留前5。
• mmrLambda（MMR 多样性权重）：0-1，仅 MMR 模式。
  → 默认 0.7。1.0 = 纯相关性；0.0 = 纯多样性。
  → 推荐 0.5-0.8。较低值减少结果重复。
• LLM Prompt 模板：自定义 LLM 重排的评分提示词。
  → 用 {query} 和 {text} 作为占位符。留空使用默认模板。

【检索前优化】
在检索之前对查询进行增强（需配置 LLM API）：
• 无（none）：直接使用原始查询。
• 查询扩展（queryExpansion）：LLM 补充同义词和相关概念。
  → 适合短查询或模糊查询。
• 查询改写（queryRewrite）：LLM 重新组织查询语句。
  → 适合口语化或不够明确的查询。
• HyDE（假设文档嵌入）：LLM 先生成假设回答，用回答的向量检索。
  → 适合问答类查询，需要额外一次嵌入计算。`,
  },
  {
    title: '🧠 查询模式与知识图谱',
    content: `【查询模式】
• 单次检索（single）：标准 query → retrieve → rerank → return。
• 条件路由（router）：自动选择最合适的知识库。
  → 路由方式：LLM 路由（慢但准）/ 关键词路由 / 向量路由。
• 分支并行（subQuestion）：分解复杂问题并行检索后合并。
  → 合并方式：直接合并 / 去重合并 / 重排合并。
  → 适合对比分析、综合性问题。
• 循环迭代（iterative）：检索→评估→改写→重试。
  → 迭代策略：关键词扩展 / LLM 改写 / 查询简化。
  → maxIterations 控制最大迭代次数（默认 3）。

【知识图谱】
从文档中提取实体和关系（三元组），增强检索的关联能力。

【知识图谱参数】
• maxTriplesPerChunk：每个块最多提取的三元组数。
  → 默认 10。推荐 5-20。过多会引入噪声三元组。
• entityTypes（实体类型）：关注的实体类型，如"人物、技术、概念"。
  → 留空则不限制。设置后 LLM 只提取这些类型的实体。
• 生成实体描述：LLM 为每个实体生成一句话解释。
  → 有助于知识图谱检索时的语义匹配。
• 构建方式：每 10 个块打包一次 API 请求（批处理）。

【自动更新】
HNSW 和知识图谱首次需手动构建。建立后，新增向量时自动增量更新。`,
  },
  {
    title: '📊 评分结果参考',
    content: `搜索后自动计算评估指标，帮助对比不同配置的效果。

【指标说明】
• 结果数 — 返回的文档块数量
• 平均分 — 所有结果的平均相似度分数
• 最高分 — 最相关结果的分数
• 标准差 — 分数分布的离散程度
• 检索耗时 / 重排耗时 — 各阶段毫秒数

【效果判断标准】
• ✅ 优秀：平均分 > 70%，最高分 > 85%，标准差 < 15%
• ⚠️ 一般：平均分 50-70%，可调整分块或检索策略
• ❌ 较差：平均分 < 50%，建议检查 Embedding 模型或分块大小

【不同策略的典型分数范围】
• 向量检索：0.60-0.95（语义匹配）
• BM25：0.00-0.80（关键词匹配，无归一化）
• 混合检索：0.40-0.90（融合分数）
• 经 Cohere 重排后：0.30-0.99（重排分数独立于原始分数）`,
  },
  {
    title: '⚙️ Embedding 配置',
    content: `Embedding 模型将文本转换为向量，是向量检索的基础。

【支持的 Embedding 提供商】
• Gemini（推荐）：gemini-embedding-001，768 维
• OpenAI：text-embedding-3-small/large
• Cohere：embed-multilingual-v3.0（中文友好）
• Jina：jina-embeddings-v3
• Hugging Face：BAAI/bge-small-en-v1.5 等
• Ollama：本地模型，如 nomic-embed-text

【参数详解】
• model：嵌入模型名称。不同模型维度和质量不同。
• dimensions：输出向量维度。
  → 维度越高理论精度越好，但速度越慢、存储越大。
  → 768 维是中等选择，兼顾速度和质量。
• API Key / Base URL：对应提供商的认证信息。

【注意事项】
• 更换 Embedding 模型后，需要重新构建向量库（旧向量维度不兼容）。
• 同一个集合内的所有文档必须使用相同的 Embedding 模型。`,
  },
  {
    title: '💾 向量库与持久化',
    content: `向量库是 RAG 的核心数据存储，保存文档块的向量表示。

【存储方式】
向量库序列化为 JSON 存储在本地磁盘：
路径: {用户数据目录}/rag-indexes/{集合ID}.json

【集合管理】
• 每个集合包含：文档向量、配置、HNSW索引、知识图谱
• 切换集合时自动加载对应配置
• 构建后所有配置封装，对外提供统一检索 API

【4 个构建操作】
• 构建基本向量库：分块 → 嵌入 → 保存
• 更新配置：仅保存配置，不重建向量
• 构建 HNSW 索引：全量构建近似最近邻图
• 构建知识图谱：LLM 批量提取三元组

【HNSW 索引参数】
• M（邻居数）：每个节点的最大邻居连接数。
  → 默认 16。推荐 12-48。越大越精确但构建越慢。
• efConstruction（构建搜索宽度）：构建时的搜索范围。
  → 默认 200。推荐 100-500。越大索引质量越高。
• efSearch（查询搜索宽度）：查询时的搜索范围。
  → 默认 50。推荐 20-200。越大越精确但越慢。`,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function RagTestBench() {
  // ── Config state ──
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(
    () => {
      const saved = lsGet(LS_EMBEDDING, { provider: 'openai' as EmbeddingProvider, apiKey: '', model: 'text-embedding-3-small', dimensions: 1536 });
      // 迁移已废弃的模型名称 → gemini-embedding-001
      const deprecatedGeminiModels: Record<string, { model: string; dimensions: number }> = {
        'text-embedding-004': { model: 'gemini-embedding-001', dimensions: 768 },
        'gemini-embedding-exp-03-07': { model: 'gemini-embedding-001', dimensions: 768 },
      };
      if (saved.provider === 'gemini' && deprecatedGeminiModels[saved.model]) {
        const fix = deprecatedGeminiModels[saved.model];
        saved.model = fix.model;
        saved.dimensions = fix.dimensions;
      }
      return saved;
    },
  );
  const [chunkingConfig, setChunkingConfig] = useState<ChunkingConfig>(
    () => lsGet(LS_CHUNKING, { ...DEFAULT_CHUNKING_CONFIG }),
  );
  const [retrievalConfig, setRetrievalConfig] = useState<RetrievalConfig>(
    () => lsGet(LS_RETRIEVAL, { strategy: 'hybrid' as RetrievalStrategy, topK: 20, alpha: 0.7, fusionMethod: 'rrf' as FusionMethod, rrfK: 60 }),
  );
  const [rerankerConfig, setRerankerConfig] = useState<RerankerConfig>(
    () => lsGet(LS_RERANKER, { type: 'none' as RerankerType, topN: 5, mmrLambda: 0.7 }),
  );

  // ── Query mode state ──
  const [queryModeConfig, setQueryModeConfig] = useState<QueryModeConfig>(
    () => lsGet(LS_QUERY_MODE, {
      mode: 'single' as QueryMode,
      subQuestion: { maxSubQuestions: 3, mergeStrategy: 'deduplicate' as const, deduplicateThreshold: 0.9 },
      iterative: { maxIterations: 3, qualityThreshold: 0.7, refinementStrategy: 'rephrase' as const },
    }),
  );

  // ── Format-specific chunking state ──
  const [formatOverrides, setFormatOverrides] = useState<FormatChunkingOverrides>(
    () => lsGet(LS_FORMAT_OVERRIDES, {}),
  );
  const [formatTypeEnabled, setFormatTypeEnabled] = useState<Record<string, boolean>>(
    () => lsGet(`${LS_PREFIX}format_type_enabled`, { markdown: true, pdf: true, html: true, code: true }),
  );

  // ── Pre-retrieval optimization state ──
  const [preRetrievalConfig, setPreRetrievalConfig] = useState<PreRetrievalConfig>(
    () => lsGet(LS_PRE_RETRIEVAL, {
      strategy: 'none' as PreRetrievalStrategy,
      expansion: { maxTerms: 5, includeOriginal: true },
      rewrite: { style: 'precise' as const },
      hyde: { responseLength: 'medium' as const, numHypothetical: 1 },
    }),
  );
  const [preRetrievalLog, setPreRetrievalLog] = useState<string[]>([]);

  // ── Search algorithm state ──
  const [searchAlgorithm, setSearchAlgorithm] = useState<SearchAlgorithm>(
    () => lsGet(LS_SEARCH_ALGO, 'brute-force' as SearchAlgorithm),
  );
  const [hnswConfig, setHnswConfig] = useState<HnswConfig>(
    () => lsGet(`${LS_PREFIX}hnsw_config`, { m: 16, efConstruction: 200, efSearch: 50 }),
  );

  // ── Knowledge graph state ──
  const [kgEnabled, setKgEnabled] = useState<boolean>(() => lsGet(`${LS_PREFIX}kg_enabled`, false));
  const [kgConfig, setKgConfig] = useState<KnowledgeGraphConfig>(
    () => lsGet(`${LS_PREFIX}kg_config`, { enabled: false, maxTriplesPerChunk: 10, includeEntityDescriptions: true }),
  );
  const knowledgeGraphRef = useRef<KnowledgeGraph | null>(null);
  const [kgTripleSample, setKgTripleSample] = useState<{ triple: { subject: string; predicate: string; object: string; sourceChunkId: string }; entityDescs: Record<string, string> } | null>(null);

  // ── LLM API configs for features requiring LLM calls ──
  const [kgApiConfig, setKgApiConfig] = useState<LlmApiConfig | null>(() => lsGet(LS_KG_API_PROFILE, null));
  const [preRetrievalApiConfig, setPreRetrievalApiConfig] = useState<LlmApiConfig | null>(() => lsGet(LS_PRE_RETRIEVAL_API_PROFILE, null));
  const [llmRerankerApiConfig, setLlmRerankerApiConfig] = useState<LlmApiConfig | null>(() => lsGet(LS_LLM_RERANKER_API_PROFILE, null));

  // ── Collection state ──
  const [collections, setCollections] = useState<CollectionMeta[]>(() => {
    const saved = lsGet(LS_COLLECTIONS, []);
    // Migrate: emoji icons → lucide names, old documents[] → docPaths[]
    return saved.map((c: any, i: number) => ({
      ...c,
      color: c.color || COLLECTION_COLORS[i % COLLECTION_COLORS.length],
      icon: COLLECTION_ICON_NAMES.includes(c.icon) ? c.icon : COLLECTION_ICON_NAMES[i % COLLECTION_ICON_NAMES.length],
      docPaths: c.docPaths || (c.documents || []).map((d: any) => d.path),
    }));
  });
  const [activeCollectionId, setActiveCollectionId] = useState<string>(() => lsGet(LS_ACTIVE_COLLECTION, ''));
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<Partial<CollectionMeta> | null>(null);
  const [detailCollectionId, setDetailCollectionId] = useState<string | null>(null);

  // ── Document & index state (global, independent of collections) ──
  const [documents, setDocuments] = useState<DocEntry[]>(() => {
    const raw = lsGet(LS_DOCUMENTS, []);
    const flds = migrateFoldersFromStorage(lsGet(LS_FOLDERS, []));
    return migrateDocumentsFolder(raw, flds);
  });
  const [indexStatus, setIndexStatus] = useState<IndexStatus>('idle');
  const [indexProgress, setIndexProgress] = useState('');
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');

  // ── Nested folder state (persisted) ──
  const [folders, setFolders] = useState<FolderNode[]>(() => migrateFoldersFromStorage(lsGet(LS_FOLDERS, [])));
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => lsGet(`${LS_PREFIX}view_mode`, 'list'));
  const [sortBy, setSortBy] = useState<'name' | 'type'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'docs' | null>(null);
  const [searchCollectionId, setSearchCollectionId] = useState<string | null>(null);

  // ── Search state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [evalMetrics, setEvalMetrics] = useState<EvalMetrics | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [rebuildingHnsw, setRebuildingHnsw] = useState(false);
  const [rebuildingKg, setRebuildingKg] = useState(false);
  const [updatingConfig, setUpdatingConfig] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const pipelineRef = useRef<RagPipeline | null>(null);
  const vectorStoreRef = useRef<LocalVectorStore>(new LocalVectorStore());

  // ── Help state ──
  const [showHelp, setShowHelp] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ── Active collection helper ──
  const activeCollection = collections.find(c => c.id === activeCollectionId);

  // ── Persist configs ──
  useEffect(() => { lsSet(LS_EMBEDDING, embeddingConfig); }, [embeddingConfig]);
  useEffect(() => { lsSet(LS_CHUNKING, chunkingConfig); }, [chunkingConfig]);
  useEffect(() => { lsSet(LS_RETRIEVAL, retrievalConfig); }, [retrievalConfig]);
  useEffect(() => { lsSet(LS_RERANKER, rerankerConfig); }, [rerankerConfig]);
  useEffect(() => { lsSet(LS_COLLECTIONS, collections); }, [collections]);
  useEffect(() => { lsSet(LS_ACTIVE_COLLECTION, activeCollectionId); }, [activeCollectionId]);
  useEffect(() => { lsSet(LS_QUERY_MODE, queryModeConfig); }, [queryModeConfig]);
  useEffect(() => { lsSet(LS_FORMAT_OVERRIDES, formatOverrides); }, [formatOverrides]);
  useEffect(() => { lsSet(`${LS_PREFIX}format_type_enabled`, formatTypeEnabled); }, [formatTypeEnabled]);
  useEffect(() => { lsSet(LS_DOCUMENTS, documents); }, [documents]);
  useEffect(() => { lsSet(LS_FOLDERS, folders); }, [folders]);
  useEffect(() => { lsSet(`${LS_PREFIX}view_mode`, viewMode); }, [viewMode]);
  useEffect(() => { lsSet(LS_PRE_RETRIEVAL, preRetrievalConfig); }, [preRetrievalConfig]);
  useEffect(() => { lsSet(LS_SEARCH_ALGO, searchAlgorithm); }, [searchAlgorithm]);
  useEffect(() => { lsSet(`${LS_PREFIX}hnsw_config`, hnswConfig); }, [hnswConfig]);
  useEffect(() => { lsSet(`${LS_PREFIX}kg_enabled`, kgEnabled); }, [kgEnabled]);
  useEffect(() => { lsSet(`${LS_PREFIX}kg_config`, kgConfig); }, [kgConfig]);

  // Apply search algorithm to vector store
  useEffect(() => {
    if (vectorStoreRef.current) {
      vectorStoreRef.current.setSearchAlgorithm(searchAlgorithm, hnswConfig);
    }
  }, [searchAlgorithm, hnswConfig]);

  // ── Load collection from disk when active changes ──
  useEffect(() => {
    if (!activeCollectionId) {
      vectorStoreRef.current = new LocalVectorStore();
      pipelineRef.current = null;
      setIndexStatus('idle');
      setIndexProgress('');
      setSearchResults([]);
      setEvalMetrics(null);
      return;
    }

    (async () => {
      setIndexStatus('loading');
      setIndexProgress('正在从磁盘加载向量库...');
      const data = await loadCollectionFromDisk(activeCollectionId);
      if (data?.vectorStore) {
        vectorStoreRef.current = LocalVectorStore.deserialize(data.vectorStore);

        // 恢复封装的完整配置（无保存配置时重置为默认值）
        const cfg = data.config || {};
        setEmbeddingConfig(cfg.embedding ?? embeddingConfig);
        setChunkingConfig(cfg.chunking ?? chunkingConfig);
        setFormatOverrides(cfg.formatOverrides ?? {});
        setFormatTypeEnabled(cfg.formatTypeEnabled ?? { markdown: true, pdf: true, html: true, code: true });
        setRetrievalConfig(cfg.retrieval ?? DEFAULT_RETRIEVAL);
        setRerankerConfig(cfg.reranker ?? DEFAULT_RERANKER);
        setQueryModeConfig(cfg.queryMode ?? DEFAULT_QUERY_MODE);
        setPreRetrievalConfig(cfg.preRetrieval ?? DEFAULT_PRE_RETRIEVAL);
        setSearchAlgorithm(cfg.searchAlgorithm ?? 'brute-force');
        setHnswConfig(cfg.hnsw ?? DEFAULT_HNSW);
        setKgEnabled(cfg.kgEnabled ?? false);
        setKgConfig(cfg.kg ?? DEFAULT_KG_CONFIG);

        const restoredEmbCfg = data.config?.embedding ?? embeddingConfig;
        const restoredRetCfg = data.config?.retrieval ?? retrievalConfig;
        const restoredRerankerCfg = data.config?.reranker ?? rerankerConfig;
        const qCfg: QueryEngineConfig = { retrieval: restoredRetCfg, reranker: restoredRerankerCfg, embeddingConfig: restoredEmbCfg };
        const pipeline = new RagPipeline(qCfg);
        pipeline.loadFromSerialized({ vectorStore: JSON.stringify(data.vectorStore) });
        pipeline.buildBM25();

        // 恢复知识图谱
        if (data.knowledgeGraph) {
          try {
            knowledgeGraphRef.current = KnowledgeGraph.deserialize(data.knowledgeGraph);
            pipeline.setKnowledgeGraph(knowledgeGraphRef.current);
          } catch (err) {
            console.warn('Failed to restore knowledge graph:', err);
            knowledgeGraphRef.current = null;
          }
        } else {
          knowledgeGraphRef.current = null;
        }

        pipelineRef.current = pipeline;
        setIndexStatus('ready');
        const vecCount = vectorStoreRef.current.size;
        const algoInfo = vecCount > 0 && vectorStoreRef.current.searchAlgorithm === 'hnsw' ? '，HNSW 已加载' : '';
        const kgInfo = knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0
          ? `，图谱 ${knowledgeGraphRef.current.tripleCount} 三元组` : '';
        if (vecCount === 0 && (algoInfo || kgInfo)) {
          setIndexProgress(`⚠️ 向量库为空（0 个向量），但存在历史索引数据${kgInfo}。建议重新构建基本向量库。`);
        } else {
          setIndexProgress(`已加载 ${vecCount} 个向量${algoInfo}${kgInfo}`);
        }

        // Update collection metadata with loaded state
        const loadedHasHnsw = vectorStoreRef.current.searchAlgorithm === 'hnsw';
        const loadedKgCount = knowledgeGraphRef.current?.tripleCount ?? 0;
        setCollections(prev => prev.map(c => c.id === activeCollectionId
          ? { ...c, hasHnsw: loadedHasHnsw, hasKg: loadedKgCount > 0, kgTripleCount: loadedKgCount }
          : c
        ));
      } else {
        vectorStoreRef.current = new LocalVectorStore();
        pipelineRef.current = null;
        knowledgeGraphRef.current = null;
        // Reset config to defaults for empty collection
        setRetrievalConfig(DEFAULT_RETRIEVAL);
        setRerankerConfig(DEFAULT_RERANKER);
        setQueryModeConfig(DEFAULT_QUERY_MODE);
        setPreRetrievalConfig(DEFAULT_PRE_RETRIEVAL);
        setSearchAlgorithm('brute-force');
        setHnswConfig(DEFAULT_HNSW);
        setKgEnabled(false);
        setKgConfig(DEFAULT_KG_CONFIG);
        setIndexStatus('idle');
        setIndexProgress('');
      }
      setSearchResults([]);
      setEvalMetrics(null);
    })();
  }, [activeCollectionId]);

  // ── Toggle section collapse ──
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);


  // ── Embedding update helpers ──
  const updateEmbedding = useCallback((patch: Partial<EmbeddingConfig>) => {
    setEmbeddingConfig(prev => {
      const next = { ...prev, ...patch };
      if (patch.provider && patch.provider !== prev.provider) {
        const models = EMBEDDING_MODEL_OPTIONS[patch.provider];
        if (models?.length) {
          next.model = models[0].model;
          next.dimensions = models[0].dimensions;
        }
      }
      if (patch.model && !patch.dimensions) {
        const opt = EMBEDDING_MODEL_OPTIONS[next.provider]?.find((m: any) => m.model === patch.model);
        if (opt) next.dimensions = opt.dimensions;
      }
      return next;
    });
  }, []);

  // ── Apply preset ──
  const applyPreset = useCallback((mode: string) => {
    if (mode === 'simple') {
      const cfg = createSimpleVectorConfig(embeddingConfig);
      setRetrievalConfig(cfg.retrieval);
      setRerankerConfig(cfg.reranker);
      setPreRetrievalConfig({ strategy: 'none' });
    } else if (mode === 'balanced') {
      const cfg = createBalancedConfig(embeddingConfig);
      setRetrievalConfig(cfg.retrieval);
      setRerankerConfig(cfg.reranker);
      setPreRetrievalConfig({ strategy: 'none' });
    } else if (mode === 'precision') {
      const cfg = createPrecisionConfig(embeddingConfig);
      setRetrievalConfig(cfg.retrieval);
      setRerankerConfig(cfg.reranker);
      setPreRetrievalConfig({ strategy: 'none' });
    } else if (mode === 'semantic') {
      setRetrievalConfig({ ...DEFAULT_RETRIEVAL, strategy: 'vector', topK: 8 });
      setRerankerConfig({ type: 'mmr', topN: 5, mmrLambda: 0.5 });
      setPreRetrievalConfig({ strategy: 'expansion' });
    } else if (mode === 'keyword') {
      setRetrievalConfig({ ...DEFAULT_RETRIEVAL, strategy: 'bm25', topK: 15 });
      setRerankerConfig({ type: 'none', topN: 10 });
      setPreRetrievalConfig({ strategy: 'none' });
    } else if (mode === 'deep') {
      setRetrievalConfig({ ...DEFAULT_RETRIEVAL, strategy: 'hybrid', topK: 30, includeKnowledgeGraph: true, kgMaxTriples: 10 });
      setRerankerConfig({ type: 'llm', topN: 5 });
      setPreRetrievalConfig({ strategy: 'rewrite' });
    } else if (mode === 'hyde') {
      setRetrievalConfig({ ...DEFAULT_RETRIEVAL, strategy: 'hybrid', topK: 20 });
      setRerankerConfig({ type: 'mmr', topN: 5, mmrLambda: 0.7 });
      setPreRetrievalConfig({ strategy: 'hyde' });
    }
    setActivePreset(mode);
  }, [embeddingConfig]);

  // ── Create collection ──
  const createCollection = useCallback(() => {
    const name = newCollectionName.trim();
    if (!name) return;
    const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const meta: CollectionMeta = {
      id, name, color: COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length],
      icon: COLLECTION_ICON_NAMES[collections.length % COLLECTION_ICON_NAMES.length],
      createdAt: Date.now(), vectorCount: 0, docPaths: [],
      embeddingProvider: embeddingConfig.provider, embeddingModel: embeddingConfig.model,
    };
    setCollections(prev => [...prev, meta]);
    setActiveCollectionId(id);
    setNewCollectionName('');
    setShowNewCollection(false);
  }, [newCollectionName, embeddingConfig]);

  // ── Delete collection ──
  const deleteCollection = useCallback(async (id: string) => {
    await deleteCollectionFromDisk(id);
    deleteCollectionCache(id); // clear vectorService in-memory cache
    setCollections(prev => prev.filter(c => c.id !== id));
    if (activeCollectionId === id) setActiveCollectionId('');
  }, [activeCollectionId]);

  // ── Add files ──
  const handleAddFiles = useCallback(async () => {
    try {
      const filePaths = await eApi().ragSelectFiles();
      if (!filePaths?.length) return;
      const newDocs: DocEntry[] = filePaths
        .filter((p: string) => !documents.some(d => d.path === p))
        .map((p: string) => {
          const name = p.split('/').pop() ?? p;
          return { name, path: p, type: inferDocType(name), folderId: currentFolderId };
        });
      if (newDocs.length) {
        setDocuments(prev => [...prev, ...newDocs]);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  }, [documents, currentFolderId]);

  const removeDocument = useCallback((path: string) => {
    setDocuments(prev => prev.filter(d => d.path !== path));
    setCollections(prev => prev.map(c => ({
      ...c, docPaths: c.docPaths.filter(p => p !== path),
    })));
  }, []);

  // ── Folder management handlers (nested tree) ──
  const newFolderNameRef = useRef(newFolderName);
  newFolderNameRef.current = newFolderName;

  const handleCreateFolder = useCallback(() => {
    const name = newFolderNameRef.current.trim();
    if (!name) return;
    const newNode: FolderNode = { id: generateFolderId(), name, parentId: currentFolderId };
    setFolders(prev => [...prev, newNode]);
    setNewFolderName('');
    setShowNewFolder(false);
  }, [currentFolderId]);

  const handleRenameFolder = useCallback((folderId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: trimmed } : f));
    setRenamingFolderId(null);
  }, []);

  const handleDeleteFolder = useCallback((folderId: string) => {
    const descendantIds = getAllDescendantIds(folders, folderId);
    const allDeleted = new Set([folderId, ...descendantIds]);
    const deletedNode = folders.find(f => f.id === folderId);
    const targetParent = deletedNode?.parentId ?? null;
    setFolders(prev => prev.filter(f => !allDeleted.has(f.id)));
    setDocuments(prev => prev.map(d => d.folderId && allDeleted.has(d.folderId) ? { ...d, folderId: targetParent } : d));
    if (currentFolderId && allDeleted.has(currentFolderId)) setCurrentFolderId(targetParent);
  }, [folders, currentFolderId]);

  const handleUpdateFolderStyle = useCallback((folderId: string, icon?: string, color?: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...(icon !== undefined && { icon }), ...(color !== undefined && { color }) } : f));
  }, []);

  // Right-click context menu handler
  const handleFolderContextMenu = useCallback((e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folderId });
    setEditingFolderId(null);
  }, []);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!folderContextMenu) return;
    const handleClick = () => setFolderContextMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFolderContextMenu(null); };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('click', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [folderContextMenu]);

  const handleMoveDocsToFolder = useCallback((targetFolderId: string | null) => {
    setDocuments(prev => prev.map(d => selectedDocs.has(d.path) ? { ...d, folderId: targetFolderId } : d));
    setSelectedDocs(new Set());
  }, [selectedDocs]);

  // ── Scan folder ──
  const handleScanFolder = useCallback(async () => {
    try {
      const dirPath = await eApi().ragSelectFolder();
      if (!dirPath) return;

      setIndexProgress('正在扫描文件夹…');
      const allFiles: string[] = [];
      const scanDir = async (dir: string) => {
        const entries = await eApi().listDir(dir);
        if (!entries?.length) return;
        for (const entry of entries) {
          if (entry.isDirectory) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await scanDir(entry.path);
            }
          } else {
            const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
            if (SUPPORTED_EXTS.has(ext)) {
              allFiles.push(entry.path);
            }
          }
        }
      };
      await scanDir(dirPath);

      const newDocs: DocEntry[] = allFiles
        .filter(p => !documents.some(d => d.path === p))
        .map(p => {
          const name = p.split('/').pop() ?? p;
          return { name, path: p, type: inferDocType(name), folderId: currentFolderId };
        });

      if (newDocs.length) {
        setDocuments(prev => [...prev, ...newDocs]);
        setIndexProgress(`已扫描到 ${newDocs.length} 个文件`);
      } else {
        setIndexProgress('未找到新的支持文件');
      }
    } catch (e) {
      console.error('Failed to scan folder:', e);
      setIndexProgress('文件夹扫描失败');
    }
  }, [documents, currentFolderId]);

  // ── Build index ──
  const buildIndex = useCallback(async () => {
    if (!activeCollectionId) return;
    let docsToIndex = documents.filter(d => selectedDocs.has(d.path));
    if (!docsToIndex.length) return;

    // Dedup: warn about already-indexed files
    const activeCollection = collections.find(c => c.id === activeCollectionId);
    const alreadyIndexed = docsToIndex.filter(d => activeCollection?.docPaths.includes(d.path));
    if (alreadyIndexed.length > 0) {
      const names = alreadyIndexed.map(d => d.name).join('、');
      const action = window.confirm(
        `以下 ${alreadyIndexed.length} 个文件已在此向量库中索引过：\n${names}\n\n` +
        `• 点击「确定」→ 跳过已索引文件，仅构建新文件\n` +
        `• 点击「取消」→ 全部重新构建（覆盖旧向量）`
      );
      if (action) {
        docsToIndex = docsToIndex.filter(d => !activeCollection?.docPaths.includes(d.path));
        if (!docsToIndex.length) {
          setIndexProgress('ℹ️ 所有选中文件均已索引，无需重新构建');
          return;
        }
      }
      // action=false: proceed with all files (re-index / overwrite)
    }

    if (!embeddingConfig.apiKey && embeddingConfig.provider !== 'ollama') {
      setIndexStatus('error');
      setIndexProgress('❌ 请先填写 Embedding API Key');
      return;
    }

    // Warn if embedding config changed vs existing store
    if (vectorStoreRef.current.size > 0) {
      const stats = vectorStoreRef.current.getStats();
      const oldProvider = stats.embeddingProvider;
      const oldModel = stats.embeddingModel;
      if (oldProvider && oldModel && (oldProvider !== embeddingConfig.provider || oldModel !== embeddingConfig.model)) {
        const confirmed = window.confirm(
          `⚠️ Embedding 模型已变更（${oldProvider}/${oldModel} → ${embeddingConfig.provider}/${embeddingConfig.model}）。\n\n` +
          `现有 ${vectorStoreRef.current.size} 个向量将与新向量不兼容（不同语义空间），检索质量会严重下降。\n\n` +
          `建议：先删除旧向量或新建一个集合。\n确定要继续追加吗？`
        );
        if (!confirmed) return;
      }
    }

    const errors: string[] = [];
    const FILE_BATCH = 20; // Load files in batches of 20

    try {
      // ═══ Phase 1: Load Documents ═══
      setIndexStatus('loading');
      const allDocs: any[] = [];
      const successPaths = new Set<string>();
      const failedPaths = new Map<string, string>();

      for (let batch = 0; batch < docsToIndex.length; batch += FILE_BATCH) {
        const batchFiles = docsToIndex.slice(batch, batch + FILE_BATCH);
        const batchEnd = Math.min(batch + FILE_BATCH, docsToIndex.length);
        setBuildProgress({ phase: 'loading', current: batch, total: docsToIndex.length, detail: `批次 ${Math.floor(batch / FILE_BATCH) + 1}`, errors });
        setIndexProgress(`📂 加载文档 [${batch + 1}-${batchEnd}/${docsToIndex.length}]…`);

        for (let i = 0; i < batchFiles.length; i++) {
          const file = batchFiles[i];
          const globalIdx = batch + i + 1;
          setBuildProgress({ phase: 'loading', current: globalIdx, total: docsToIndex.length, detail: file.name, errors });

          try {
            const docs = await loadDocuments(
              [file.path],
              { fileReader: electronFileReader },
            );
            if (docs.length === 0) {
              const msg = `⚠ ${file.name}: 文件为空或无法解析`;
              errors.push(msg);
              failedPaths.set(file.path, '文件为空');
            } else {
              allDocs.push(...docs);
              successPaths.add(file.path);
            }
          } catch (err: any) {
            const msg = `❌ ${file.name}: ${err?.message ?? String(err)}`;
            errors.push(msg);
            failedPaths.set(file.path, err?.message ?? String(err));
          }
          // Yield to UI after each file to prevent freezing on large files
          await new Promise(r => setTimeout(r, 0));
        }

        // Yield to UI between batches
        await new Promise(r => setTimeout(r, 0));
      }

      if (allDocs.length === 0) {
        setIndexStatus('error');
        const errDetail = errors.length > 0 ? `\n${errors.slice(0, 5).join('\n')}` : '';
        setIndexProgress(`❌ 所有文件加载失败（${docsToIndex.length} 个）${errDetail}`);
        setBuildProgress(null);
        return;
      }

      setIndexProgress(`✅ 已加载 ${allDocs.length} 个文档片段（来自 ${successPaths.size}/${docsToIndex.length} 个文件）`);

      // ═══ Phase 2: Chunking ═══
      setIndexStatus('chunking');
      setBuildProgress({ phase: 'chunking', current: 0, total: allDocs.length, detail: '准备分块…', errors });
      setIndexProgress(`📄 准备分块…（${allDocs.length} 个文档片段）`);
      await new Promise(r => setTimeout(r, 0)); // yield to render progress

      let nodes: any[];
      try {
        setIndexProgress(`⚙️ 创建 Embedding 函数 (${embeddingConfig.provider}/${embeddingConfig.model})…`);
        const embedFn = createEmbedFunction(embeddingConfig);

        const filteredOverrides: FormatChunkingOverrides | undefined = {
          ...(formatTypeEnabled.markdown !== false && formatOverrides.markdown ? { markdown: formatOverrides.markdown } : {}),
          ...(formatTypeEnabled.pdf !== false && formatOverrides.pdf ? { pdf: formatOverrides.pdf } : {}),
          ...(formatTypeEnabled.html !== false && formatOverrides.html ? { html: formatOverrides.html } : {}),
          ...(formatTypeEnabled.code !== false && formatOverrides.code ? { code: formatOverrides.code } : {}),
        };
        const hasAnyOverride = Object.keys(filteredOverrides).length > 0;
        const effectiveChunkingConfig: ChunkingConfig = hasAnyOverride
          ? { ...chunkingConfig, formatOverrides: filteredOverrides }
          : chunkingConfig;

        setIndexProgress(`⚙️ 分块策略: ${hasAnyOverride ? '格式感知' : chunkingConfig.strategy ?? 'sentence'}，开始处理…`);
        setBuildProgress({ phase: 'chunking', current: 0, total: allDocs.length, detail: '开始分块…', errors });
        await new Promise(r => setTimeout(r, 0)); // yield to render before heavy computation

        nodes = await chunkDocuments(allDocs, effectiveChunkingConfig, embedFn, (msg) => {
          setIndexProgress(msg);
        }, (done, total, fileName) => {
          setBuildProgress({ phase: 'chunking', current: done, total, detail: fileName || `${done}/${total}`, errors });
          setIndexProgress(`📄 分块中: ${done}/${total} — ${fileName || ''}`);
        });
      } catch (err: any) {
        setIndexStatus('error');
        const errMsg = err?.message ?? String(err);
        const detail = errMsg.includes('Maximum call stack')
          ? '❌ 分块失败: 检测到无限递归，请检查分块配置'
          : `❌ 分块失败: ${errMsg}`;
        setIndexProgress(detail);
        setBuildProgress(null);
        console.error('Chunking error:', err);
        return;
      }

      if (nodes.length === 0) {
        setIndexStatus('error');
        setIndexProgress('❌ 分块后无有效节点，请检查文件内容');
        setBuildProgress(null);
        return;
      }

      let enriched: any[];
      try {
        enriched = enrichMetadata(nodes, embeddingConfig.model);
      } catch (err: any) {
        setIndexStatus('error');
        setIndexProgress(`❌ 元数据处理失败: ${err?.message ?? String(err)}`);
        setBuildProgress(null);
        return;
      }

      setIndexProgress(`✅ 分块完成：${enriched.length} 个块`);

      // ═══ Phase 3: Embedding ═══
      setIndexStatus('embedding');
      setBuildProgress({ phase: 'embedding', current: 0, total: enriched.length, detail: '准备嵌入…', errors });
      setIndexProgress(`🧮 嵌入 ${enriched.length} 个块…（使用 ${embeddingConfig.provider}/${embeddingConfig.model}）`);

      try {
        await vectorStoreRef.current.addNodes(enriched, embeddingConfig, (done, total) => {
          setBuildProgress(prev => prev ? { ...prev, phase: 'embedding', current: done, total, detail: `${done}/${total}` } : null);
          setIndexProgress(`🧮 嵌入进度: ${done}/${total} (${Math.round(done / total * 100)}%)`);
        });
      } catch (err: any) {
        setIndexStatus('error');
        const detail = err?.message ?? String(err);
        setIndexProgress(`❌ 嵌入失败: ${detail}`);
        setBuildProgress(null);
        console.error('Embedding error:', err);
        // Surface common issues
        if (detail.includes('401') || detail.includes('Unauthorized')) {
          setIndexProgress(`❌ API Key 无效或已过期 (${embeddingConfig.provider})`);
        } else if (detail.includes('429') || detail.includes('rate')) {
          setIndexProgress(`❌ API 速率限制，请稍后重试或减少文件数量`);
        } else if (detail.includes('fetch') || detail.includes('network') || detail.includes('Failed')) {
          setIndexProgress(`❌ 网络错误，无法连接到 ${embeddingConfig.provider} API。请检查网络和代理设置`);
        }
        return;
      }

      // ═══ Phase 3.5: Knowledge Graph — build if enabled OR if collection already has KG ═══
      const hadKg = knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0;
      if (kgEnabled || hadKg) {
        if (!kgApiConfig?.apiKey && !embeddingConfig.apiKey) {
          const skipMsg = hadKg
            ? '⚠ 知识图谱增量更新跳过：未配置 LLM API，请在「索引优化 → 知识图谱」中选择 API 配置'
            : '⚠ 知识图谱构建跳过：未配置 LLM API，请在「索引优化 → 知识图谱」中选择 API 配置';
          errors.push(skipMsg);
          setIndexProgress('⚠️ 跳过知识图谱（未配置 API）');
        } else {
          const kgAction = hadKg ? '增量更新' : '构建';
          setBuildProgress({ phase: 'saving', current: 0, total: 1, detail: `${kgAction}知识图谱…`, errors });
          setIndexProgress(`🧠 ${kgAction}知识图谱…（${enriched.length} 个块）`);

          try {
            const llmFn = makeUniversalLlmFn(kgApiConfig, embeddingConfig.apiKey);

            const chunks = enriched.map((n: any) => ({ id: n.id_, text: n.getText() }));
            const graph = await buildKnowledgeGraph(chunks, kgConfig, llmFn, (msg) => {
              setIndexProgress(msg);
            });
            knowledgeGraphRef.current = graph;
            setIndexProgress(`✅ 知识图谱${kgAction}完成: ${graph.tripleCount} 三元组, ${graph.entityCount} 实体`);
          } catch (err: any) {
            errors.push(`⚠ 知识图谱${kgAction}失败: ${err?.message}`);
            console.error('KG build error:', err);
          }
        }
      }

      // ═══ Phase 3.75: Rebuild HNSW if previously built or currently selected ═══
      const hadHnsw = vectorStoreRef.current.searchAlgorithm === 'hnsw';
      if (searchAlgorithm === 'hnsw' || hadHnsw) {
        const hnswAction = hadHnsw ? '增量更新' : '构建';
        setBuildProgress({ phase: 'saving', current: 0, total: 1, detail: `${hnswAction} HNSW 索引…`, errors });
        setIndexProgress(`🔗 ${hnswAction} HNSW 索引（${vectorStoreRef.current.size} 个向量，M=${hnswConfig.m ?? 16}）…`);
        try {
          vectorStoreRef.current.setSearchAlgorithm('hnsw', hnswConfig);
          vectorStoreRef.current.rebuildHnswIndex();
          setIndexProgress(`✅ HNSW 索引${hnswAction}完成`);
        } catch (err: any) {
          errors.push(`⚠ HNSW 构建失败，将使用暴力搜索: ${err?.message}`);
          vectorStoreRef.current.setSearchAlgorithm('brute-force');
        }
      }

      // ═══ Phase 3.8: 记录分块策略与知识图谱统计 ═══
      vectorStoreRef.current.setChunkingConfig(
        chunkingConfig.strategy ?? 'sentence',
        chunkingConfig,
      );
      if (knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0) {
        vectorStoreRef.current.setKnowledgeGraphStats({
          tripleCount: knowledgeGraphRef.current.tripleCount,
          entityCount: knowledgeGraphRef.current.entityCount,
          builtAt: Date.now(),
        });
      } else {
        vectorStoreRef.current.setKnowledgeGraphStats(null);
      }

      // ═══ Phase 3.9: 生成向量库摘要 ═══
      let collectionSummary = '';
      try {
        setBuildProgress({ phase: 'saving', current: 0, total: 1, detail: '生成向量库摘要…', errors });
        setIndexProgress('📝 正在生成向量库摘要…');

        const summaryLlmFn = makeUniversalLlmFn(kgApiConfig, embeddingConfig.apiKey);

        // 采样部分文本块用于摘要
        const allEntries = Array.from({ length: Math.min(enriched.length, 20) }, (_, i) =>
          enriched[Math.floor(i * enriched.length / Math.min(enriched.length, 20))]
        );
        const sampleTexts = allEntries.map((n: any) => (typeof n.getText === 'function' ? n.getText() : n.text || '')).filter(Boolean);
        const fileNames = [...new Set(allEntries.map((n: any) => n.metadata?.fileName).filter(Boolean))];

        const summaryPrompt = `你是一个知识库分析专家。请根据以下知识库的采样文本块，用 2-3 句话生成一个简短摘要，描述这个知识库的主要内容、涉及的主题和领域。

知识库名称：${activeCollection?.name || '未命名'}
包含文件：${fileNames.join('、') || '未知'}
总文本块数：${enriched.length}
采样文本（共 ${sampleTexts.length} 段）：
${sampleTexts.map((t: string, i: number) => `[${i + 1}] ${t.slice(0, 200)}`).join('\n')}

请直接输出摘要内容，不要有前缀或格式标记：`;

        collectionSummary = (await summaryLlmFn(summaryPrompt)).trim();
      } catch (err: any) {
        console.warn('Summary generation failed (non-critical):', err?.message);
        // 摘要生成失败不影响整体流程
      }

      // ═══ Phase 4: Build pipeline & save ═══
      setIndexStatus('saving');
      setBuildProgress({ phase: 'saving', current: 0, total: 1, detail: '构建检索管道…', errors });
      setIndexProgress('💾 构建检索管道并保存…');

      try {
        const qCfg: QueryEngineConfig = { retrieval: retrievalConfig, reranker: rerankerConfig, embeddingConfig };
        const pipeline = new RagPipeline(qCfg);
        pipeline.loadFromSerialized({ vectorStore: JSON.stringify(vectorStoreRef.current.serialize()) });
        pipeline.buildBM25();
        pipelineRef.current = pipeline;
      } catch (err: any) {
        console.error('Pipeline build error:', err);
        errors.push(`⚠ 管道构建警告: ${err?.message}`);
      }

      try {
        const saveData: any = {
          vectorStore: vectorStoreRef.current.serialize(),
          meta: { embeddingProvider: embeddingConfig.provider, embeddingModel: embeddingConfig.model },
          // 封装完整配置：向量库 = 向量 + 索引 + 全部配置
          config: {
            embedding: embeddingConfig,
            chunking: chunkingConfig,
            formatOverrides,
            formatTypeEnabled,
            retrieval: retrievalConfig,
            reranker: rerankerConfig,
            queryMode: queryModeConfig,
            preRetrieval: preRetrievalConfig,
            searchAlgorithm,
            hnsw: hnswConfig,
            kgEnabled,
            kg: kgConfig,
          },
        };
        // 持久化知识图谱
        if (knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0) {
          saveData.knowledgeGraph = knowledgeGraphRef.current.serialize();
        }
        await saveCollectionToDisk(activeCollectionId, saveData);
      } catch (err: any) {
        setIndexStatus('error');
        setIndexProgress(`❌ 保存失败: ${err?.message ?? String(err)}`);
        setBuildProgress(null);
        return;
      }

      // ═══ Update state ═══
      const updatedDocPaths = [...new Set([...(activeCollection?.docPaths || []), ...Array.from(successPaths)])];
      setCollections(prev => prev.map(c => c.id === activeCollectionId
        ? {
            ...c,
            docPaths: updatedDocPaths,
            vectorCount: vectorStoreRef.current.size,
            embeddingProvider: embeddingConfig.provider,
            embeddingModel: embeddingConfig.model,
            summary: collectionSummary || c.summary,
            hasHnsw: vectorStoreRef.current.searchAlgorithm === 'hnsw',
            hasKg: (knowledgeGraphRef.current?.tripleCount ?? 0) > 0,
            kgTripleCount: knowledgeGraphRef.current?.tripleCount ?? 0,
          }
        : c,
      ));
      setSelectedDocs(new Set());

      setIndexStatus('ready');
      const errSummary = errors.length > 0 ? ` (${errors.length} 个警告)` : '';
      setIndexProgress(`✅ 索引完成 — ${vectorStoreRef.current.size} 个向量，${successPaths.size} 个文件${errSummary}`);
      setBuildProgress(null);
    } catch (err: any) {
      setIndexStatus('error');
      setIndexProgress(`❌ 未知错误: ${err?.message ?? String(err)}\n${err?.stack?.split('\n').slice(0, 3).join('\n') ?? ''}`);
      setBuildProgress(null);
      console.error('BuildIndex uncaught error:', err);
    }
  }, [documents, selectedDocs, embeddingConfig, chunkingConfig, retrievalConfig, rerankerConfig, activeCollectionId, activeCollection, formatOverrides, formatTypeEnabled, kgEnabled, kgConfig]);

  // ── Update Config (save current config to collection without rebuilding) ──
  const updateConfig = useCallback(async () => {
    if (!activeCollectionId) {
      setIndexStatus('error');
      setIndexProgress('❌ 请先选择一个向量库');
      return;
    }
    setUpdatingConfig(true);

    // Validate: if searchAlgorithm is hnsw, check if HNSW index is built
    if (searchAlgorithm === 'hnsw' && vectorStoreRef.current.searchAlgorithm !== 'hnsw') {
      setIndexStatus('error');
      setIndexProgress('❌ 检索配置中选择了 HNSW 算法，但当前向量库尚未构建 HNSW 索引。请先点击"构建 HNSW 索引"。');
      setUpdatingConfig(false);
      return;
    }

    // Validate: if KG retrieval enabled, check if KG is built
    if (retrievalConfig.includeKnowledgeGraph) {
      const hasKg = knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0;
      if (!hasKg) {
        setIndexStatus('error');
        setIndexProgress('❌ 检索配置中启用了知识图谱增强，但尚未构建知识图谱。请先点击"构建知识图谱"。');
        setUpdatingConfig(false);
        return;
      }
    }

    try {
      const existing = await loadCollectionFromDisk(activeCollectionId);
      if (!existing) {
        setIndexStatus('error');
        setIndexProgress('❌ 向量库数据不存在，请先构建基本向量库');
        setUpdatingConfig(false);
        return;
      }

      const newConfig = {
        embedding: embeddingConfig,
        chunking: chunkingConfig,
        formatOverrides,
        formatTypeEnabled,
        retrieval: retrievalConfig,
        reranker: rerankerConfig,
        queryMode: queryModeConfig,
        preRetrieval: preRetrievalConfig,
        searchAlgorithm,
        hnsw: hnswConfig,
        kgEnabled,
        kg: kgConfig,
      };

      // Warn if embedding model changed
      const oldCfg = existing.config;
      if (oldCfg?.embedding &&
          (oldCfg.embedding.provider !== embeddingConfig.provider || oldCfg.embedding.model !== embeddingConfig.model)) {
        const confirmed = window.confirm(
          `⚠️ Embedding 配置已变更（${oldCfg.embedding.provider}/${oldCfg.embedding.model} → ${embeddingConfig.provider}/${embeddingConfig.model}）。\n\n` +
          `修改 Embedding 模型后，现有向量与新查询向量的语义空间不匹配，检索效果会大幅下降。\n建议重新"构建基本向量库"。\n\n确定要保存此配置吗？`
        );
        if (!confirmed) { setUpdatingConfig(false); return; }
      }

      existing.config = newConfig;
      await saveCollectionToDisk(activeCollectionId, existing);

      // Build diff summary
      const changes: string[] = [];
      if (oldCfg) {
        if (JSON.stringify(oldCfg.embedding) !== JSON.stringify(newConfig.embedding)) changes.push('Embedding');
        if (JSON.stringify(oldCfg.chunking) !== JSON.stringify(newConfig.chunking)) changes.push('分块');
        if (JSON.stringify(oldCfg.retrieval) !== JSON.stringify(newConfig.retrieval)) changes.push('检索');
        if (JSON.stringify(oldCfg.reranker) !== JSON.stringify(newConfig.reranker)) changes.push('重排');
        if (JSON.stringify(oldCfg.queryMode) !== JSON.stringify(newConfig.queryMode)) changes.push('查询流程');
        if (JSON.stringify(oldCfg.preRetrieval) !== JSON.stringify(newConfig.preRetrieval)) changes.push('检索前优化');
        if (oldCfg.searchAlgorithm !== newConfig.searchAlgorithm) changes.push('搜索算法');
        if (JSON.stringify(oldCfg.hnsw) !== JSON.stringify(newConfig.hnsw)) changes.push('HNSW');
        if (JSON.stringify(oldCfg.kg) !== JSON.stringify(newConfig.kg) || oldCfg.kgEnabled !== newConfig.kgEnabled) changes.push('知识图谱');
      }

      setIndexStatus('ready');
      setIndexProgress(changes.length > 0
        ? `✅ 配置已更新：${changes.join('、')}`
        : oldCfg ? '✅ 配置无变化' : '✅ 配置已保存');
    } catch (err: any) {
      setIndexStatus('error');
      setIndexProgress(`❌ 配置更新失败: ${err?.message ?? String(err)}`);
    } finally {
      setUpdatingConfig(false);
    }
  }, [activeCollectionId, embeddingConfig, chunkingConfig, formatOverrides, formatTypeEnabled,
      retrievalConfig, rerankerConfig, queryModeConfig, preRetrievalConfig, searchAlgorithm,
      hnswConfig, kgEnabled, kgConfig]);

  // ── Build HNSW Index (standalone) ──
  const buildHnswIndex = useCallback(async () => {
    if (!activeCollectionId || vectorStoreRef.current.size === 0) {
      setIndexStatus('error');
      setIndexProgress('❌ 请先构建基本向量库');
      return;
    }
    setRebuildingHnsw(true);
    try {
      setIndexProgress(`🔗 构建 HNSW 索引（${vectorStoreRef.current.size} 向量，M=${hnswConfig.m ?? 16}）…`);
      vectorStoreRef.current.setSearchAlgorithm('hnsw', hnswConfig);
      vectorStoreRef.current.rebuildHnswIndex();
      setSearchAlgorithm('hnsw');

      // Persist
      const existing = await loadCollectionFromDisk(activeCollectionId);
      if (existing) {
        existing.vectorStore = vectorStoreRef.current.serialize();
        await saveCollectionToDisk(activeCollectionId, existing);
      }
      setIndexStatus('ready');
      setIndexProgress(`✅ HNSW 索引已构建（${vectorStoreRef.current.size} 向量）`);
      setCollections(prev => prev.map(c => c.id === activeCollectionId ? { ...c, hasHnsw: true } : c));
    } catch (err: any) {
      setIndexStatus('error');
      setIndexProgress(`❌ HNSW 构建失败: ${err?.message}`);
    } finally {
      setRebuildingHnsw(false);
    }
  }, [activeCollectionId, hnswConfig]);

  // ── Build Knowledge Graph (standalone) ──
  const buildKg = useCallback(async () => {
    if (!activeCollectionId || vectorStoreRef.current.size === 0) {
      setIndexStatus('error');
      setIndexProgress('❌ 请先构建基本向量库');
      return;
    }
    if (!kgApiConfig?.apiKey && !embeddingConfig.apiKey) {
      setIndexStatus('error');
      setIndexProgress('❌ 请先在「知识图谱」配置中选择 API 配置，或确保 Embedding 配置中有 API Key');
      return;
    }
    setRebuildingKg(true);
    try {
      const llmFn = makeUniversalLlmFn(kgApiConfig, embeddingConfig.apiKey);

      const allEntries = vectorStoreRef.current.serialize().entries;
      const chunks = allEntries.map(e => ({ id: e.id, text: e.text }));
      setIndexProgress(`🧠 构建知识图谱…（${chunks.length} 个块）`);
      const graph = await buildKnowledgeGraph(chunks, kgConfig, llmFn, (msg) => {
        setIndexProgress(msg);
      });
      knowledgeGraphRef.current = graph;

      if (graph.tripleCount === 0) {
        // 0 triples — keep the error message from buildKnowledgeGraph visible
        setIndexStatus('error');
        setCollections(prev => prev.map(c => c.id === activeCollectionId
          ? { ...c, hasKg: false, kgTripleCount: 0 }
          : c
        ));
        return;
      }

      setKgEnabled(true);

      // Persist
      const existing = await loadCollectionFromDisk(activeCollectionId);
      if (existing) {
        existing.knowledgeGraph = graph.serialize();
        await saveCollectionToDisk(activeCollectionId, existing);
      }
      setIndexStatus('ready');
      setIndexProgress(`✅ 知识图谱: ${graph.tripleCount} 三元组, ${graph.entityCount} 实体`);
      setCollections(prev => prev.map(c => c.id === activeCollectionId
        ? { ...c, hasKg: true, kgTripleCount: graph.tripleCount }
        : c
      ));
    } catch (err: any) {
      setIndexStatus('error');
      setIndexProgress(`❌ 知识图谱构建失败: ${err?.message}`);
    } finally {
      setRebuildingKg(false);
    }
  }, [activeCollectionId, kgConfig, kgApiConfig]);

  // ── Search ──
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !vectorStoreRef.current.size) return;

    setSearching(true);
    setSearchResults([]);
    setEvalMetrics(null);
    setPreRetrievalLog([]);

    try {
      // Apply search algorithm to vector store
      vectorStoreRef.current.setSearchAlgorithm(searchAlgorithm, hnswConfig);

      // === Pre-retrieval optimization ===
      let optimizedQuery = searchQuery.trim();
      let hydeEmbedding: number[] | undefined;

      if (preRetrievalConfig.strategy !== 'none') {
        const llmFn = makeUniversalLlmFn(preRetrievalApiConfig, embeddingConfig.apiKey);

        try {
          const preResult = await optimizePreRetrieval(
            optimizedQuery, preRetrievalConfig, llmFn,
            preRetrievalConfig.strategy === 'hyde' ? embeddingConfig : undefined,
          );
          optimizedQuery = preResult.optimizedQuery;
          hydeEmbedding = preResult.hydeEmbedding;
          setPreRetrievalLog(preResult.log);
        } catch (err: any) {
          setPreRetrievalLog([`❌ 检索前优化失败: ${err?.message}`, '⚠️ 使用原始查询']);
        }
      }

      // Rebuild pipeline with latest config each search
      const qCfg: QueryEngineConfig = { retrieval: retrievalConfig, reranker: rerankerConfig, embeddingConfig };
      const pipeline = new RagPipeline(qCfg);
      pipeline.loadFromSerialized({ vectorStore: JSON.stringify(vectorStoreRef.current.serialize()) });
      pipeline.buildBM25();
      if (knowledgeGraphRef.current) {
        pipeline.setKnowledgeGraph(knowledgeGraphRef.current);
      }
      // Wire LLM function for LLM reranker
      if (rerankerConfig.type === 'llm') {
        const llmFn = makeUniversalLlmFn(llmRerankerApiConfig, embeddingConfig.apiKey);
        pipeline.setLLMFunction(llmFn);
      }
      pipelineRef.current = pipeline;

      const result = await executeQueryMode(optimizedQuery, queryModeConfig, {
        pipeline,
        pipelineConfig: qCfg,
        hydeEmbedding,
      });

      const mapped: SearchResult[] = result.results.map((r: any) => ({
        text: r.text, score: r.score, metadata: r.metadata,
        nodeId: r.nodeId ?? r.id ?? '',
        vectorScore: r.vectorScore, bm25Score: r.bm25Score,
        retrievalStrategy: r.retrievalStrategy,
      }));

      setSearchResults(mapped);
      setExpandedResults(new Set());
      setEvalMetrics(computeMetrics(
        mapped,
        result.metadata.retrievalTimeMs,
        result.metadata.rerankTimeMs,
        result.metadata.totalTimeMs,
        `${queryModeConfig.mode}/${result.metadata.strategy}`,
      ));
    } catch (err: any) {
      console.error('Search error:', err);
      setIndexProgress(`搜索失败: ${err?.message ?? String(err)}`);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, retrievalConfig, rerankerConfig, embeddingConfig, queryModeConfig, preRetrievalConfig, searchAlgorithm, hnswConfig]);

  // ══════════════════════════════════════════════════════════════════
  // Render helpers (plain functions, NOT components)
  // ══════════════════════════════════════════════════════════════════

  function renderSectionHeader(key: string, icon: React.ReactNode, title: string) {
    const collapsed = collapsedSections[key];
    return (
      <button onClick={() => toggleSection(key)} className="flex items-center gap-2 w-full text-left mb-2 group">
        {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        <span className={sectionTitle}>{icon} {title}</span>
      </button>
    );
  }

  function renderEmbeddingConfig() {
    const collapsed = collapsedSections['embedding'];
    const models = EMBEDDING_MODEL_OPTIONS[embeddingConfig.provider] ?? [];
    return (
      <div className="mb-4">
        {renderSectionHeader('embedding', <Sparkles size={14} className="text-amber-500" />, 'Embedding 配置')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            <div>
              <label className={labelCls}>提供商</label>
              <select className={selectCls} value={embeddingConfig.provider} onChange={e => updateEmbedding({ provider: e.target.value as EmbeddingProvider })}>
                {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>模型</label>
              {models.length ? (
                <select className={selectCls} value={embeddingConfig.model} onChange={e => updateEmbedding({ model: e.target.value })}>
                  {models.map((m: any) => <option key={m.model} value={m.model}>{m.label} ({m.dimensions}D){m.note ? ` — ${m.note}` : ''}</option>)}
                </select>
              ) : (
                <input className={inputCls} placeholder="模型名称" value={embeddingConfig.model} onChange={e => updateEmbedding({ model: e.target.value })} />
              )}
            </div>
            {embeddingConfig.provider !== 'ollama' && (
              <div>
                <label className={labelCls}>API Key</label>
                <input className={inputCls} type="password" placeholder="sk-..." value={embeddingConfig.apiKey} onChange={e => updateEmbedding({ apiKey: e.target.value })} />
              </div>
            )}
            {embeddingConfig.provider === 'ollama' && (
              <div>
                <label className={labelCls}>Base URL</label>
                <input className={inputCls} placeholder="http://localhost:11434" value={embeddingConfig.baseUrl ?? ''} onChange={e => updateEmbedding({ baseUrl: e.target.value })} />
              </div>
            )}
            <div>
              <label className={labelCls}>维度</label>
              <input className={inputCls} type="number" value={embeddingConfig.dimensions ?? ''} onChange={e => updateEmbedding({ dimensions: parseInt(e.target.value) || undefined })} />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderChunkingConfig() {
    const collapsed = collapsedSections['chunking'];
    return (
      <div className="mb-4">
        {renderSectionHeader('chunking', <Layers size={14} className="text-green-500" />, '分块配置')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            <div>
              <label className={labelCls}>策略</label>
              <select className={selectCls} value={chunkingConfig.strategy} onChange={e => setChunkingConfig(prev => ({ ...prev, strategy: e.target.value as ChunkingStrategy }))}>
                {CHUNKING_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                {CHUNKING_STRATEGIES.find(s => s.value === chunkingConfig.strategy)?.desc}
              </div>
            </div>
            {chunkingConfig.strategy !== 'sentence-window' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>块大小 (token)</label>
                <input className={inputCls} type="number" value={chunkingConfig.chunkSize ?? 512} onChange={e => setChunkingConfig(prev => ({ ...prev, chunkSize: parseInt(e.target.value) || 512 }))} />
              </div>
              <div>
                <label className={labelCls}>{chunkingConfig.strategy === 'sentence' ? '滑动重叠 (token)' : '重叠 (token)'}</label>
                <input className={inputCls} type="number" value={chunkingConfig.chunkOverlap ?? 50} onChange={e => setChunkingConfig(prev => ({ ...prev, chunkOverlap: parseInt(e.target.value) || 50 }))} />
              </div>
            </div>
            )}
            {chunkingConfig.strategy === 'sentence-window' && (
              <div>
                <label className={labelCls}>上下文窗口大小 (前后句数)</label>
                <input className={inputCls} type="number" value={chunkingConfig.windowSize ?? 3} onChange={e => setChunkingConfig(prev => ({ ...prev, windowSize: parseInt(e.target.value) || 3 }))} />
                <div className="text-[10px] text-gray-400 mt-1">每个句子节点前后各保留 N 句作为上下文</div>
              </div>
            )}
            {chunkingConfig.strategy === 'semantic' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>缓冲句数</label>
                  <input className={inputCls} type="number" value={chunkingConfig.bufferSize ?? 1} onChange={e => setChunkingConfig(prev => ({ ...prev, bufferSize: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <label className={labelCls}>断点百分位</label>
                  <input className={inputCls} type="number" value={chunkingConfig.breakpointPercentile ?? 95} onChange={e => setChunkingConfig(prev => ({ ...prev, breakpointPercentile: parseInt(e.target.value) || 95 }))} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderFormatChunkingConfig() {
    const collapsed = collapsedSections['format-chunking'];
    const updateMd = (patch: Partial<MarkdownChunkingConfig>) =>
      setFormatOverrides(prev => ({ ...prev, markdown: { method: 'heading', ...prev.markdown, ...patch } as MarkdownChunkingConfig }));
    const updatePdf = (patch: Partial<PdfChunkingConfig>) =>
      setFormatOverrides(prev => ({ ...prev, pdf: { method: 'page', ...prev.pdf, ...patch } as PdfChunkingConfig }));
    const updateHtml = (patch: Partial<HtmlChunkingConfig>) =>
      setFormatOverrides(prev => ({ ...prev, html: { method: 'dom-section', ...prev.html, ...patch } as HtmlChunkingConfig }));
    const updateCode = (patch: Partial<CodeChunkingConfig>) =>
      setFormatOverrides(prev => ({ ...prev, code: { method: 'function', ...prev.code, ...patch } as CodeChunkingConfig }));

    return (
      <div className="mb-4 rounded-lg">
        {renderSectionHeader('format-chunking', <FileType size={14} className="text-orange-500" />, '格式专属分块')}
        {!collapsed && (
          <div className="space-y-3 pl-5">
                {/* ── Markdown ── */}
                <div className={`border-l-2 ${formatTypeEnabled.markdown !== false ? 'border-blue-500/30' : 'border-gray-300/30 opacity-60'} pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-blue-400">📝 Markdown / MDX</span>
                    <Toggle checked={formatTypeEnabled.markdown !== false} onChange={v => setFormatTypeEnabled(prev => ({ ...prev, markdown: v }))} />
                  </div>
                  {formatTypeEnabled.markdown !== false && (
                    <>
                  <div>
                    <label className={labelCls}>分块方式</label>
                    <select className={selectCls} value={formatOverrides.markdown?.method ?? 'heading'}
                      onChange={e => updateMd({ method: e.target.value as any })}>
                      {MD_CHUNK_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {(formatOverrides.markdown?.method ?? 'heading') === 'heading'
                        ? '按标题层级切分，每个标题段作为一个块'
                        : (formatOverrides.markdown?.method === 'semantic' ? '用语义相似度检测话题切换' : '按句子贪心合并到块上限')}
                    </div>
                  </div>
                  {(formatOverrides.markdown?.method ?? 'heading') === 'heading' && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className={labelCls}>最大标题级别 (1-6)</label>
                          <input className={inputCls} type="number" min={1} max={6}
                            value={formatOverrides.markdown?.maxHeadingLevel ?? 2}
                            onChange={e => updateMd({ maxHeadingLevel: parseInt(e.target.value) || 2 })} />
                          <div className="text-[10px] text-gray-400">如设为 2，则按 ## 切分</div>
                        </div>
                        <div>
                          <label className={labelCls}>块大小上限 (token)</label>
                          <input className={inputCls} type="number" min={64}
                            value={formatOverrides.markdown?.chunkSize ?? 512}
                            onChange={e => updateMd({ chunkSize: parseInt(e.target.value) || 512 })} />
                          <div className="text-[10px] text-gray-400">超长标题段的二次切分</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className={labelCls}>块重叠 (token)</label>
                          <input className={inputCls} type="number" min={0}
                            value={formatOverrides.markdown?.chunkOverlap ?? 50}
                            onChange={e => updateMd({ chunkOverlap: parseInt(e.target.value) || 0 })} />
                        </div>
                        <div className="pt-5">
                          <Toggle checked={formatOverrides.markdown?.includeParentHeadings ?? true}
                            onChange={v => updateMd({ includeParentHeadings: v })} label="子块含父标题上下文" />
                        </div>
                      </div>
                    </>
                  )}
                  {(formatOverrides.markdown?.method === 'sentence' || formatOverrides.markdown?.method === 'semantic') && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className={labelCls}>块大小 (token)</label>
                        <input className={inputCls} type="number" min={64}
                          value={formatOverrides.markdown?.chunkSize ?? 512}
                          onChange={e => updateMd({ chunkSize: parseInt(e.target.value) || 512 })} />
                      </div>
                      <div>
                        <label className={labelCls}>块重叠 (token)</label>
                        <input className={inputCls} type="number" min={0}
                          value={formatOverrides.markdown?.chunkOverlap ?? 50}
                          onChange={e => updateMd({ chunkOverlap: parseInt(e.target.value) || 0 })} />
                      </div>
                    </div>
                  )}
                    </>
                  )}
                </div>

                {/* ── PDF ── */}
                <div className={`border-l-2 ${formatTypeEnabled.pdf !== false ? 'border-red-500/30' : 'border-gray-300/30 opacity-60'} pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-red-400">📄 PDF</span>
                    <Toggle checked={formatTypeEnabled.pdf !== false} onChange={v => setFormatTypeEnabled(prev => ({ ...prev, pdf: v }))} />
                  </div>
                  {formatTypeEnabled.pdf !== false && (
                    <>
                  <div>
                    <label className={labelCls}>分块方式</label>
                    <select className={selectCls} value={formatOverrides.pdf?.method ?? 'page'}
                      onChange={e => updatePdf({ method: e.target.value as any })}>
                      {PDF_CHUNK_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {(formatOverrides.pdf?.method ?? 'page') === 'page'
                        ? '按页切分，每页一个块（可二次切分超长页）'
                        : formatOverrides.pdf?.method === 'paragraph' ? '按段落切分，保留段落完整性'
                        : formatOverrides.pdf?.method === 'semantic' ? '语义检测切换点' : '按句贪心合并'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className={labelCls}>块大小 (token)</label>
                      <input className={inputCls} type="number" min={64}
                        value={formatOverrides.pdf?.chunkSize ?? 512}
                        onChange={e => updatePdf({ chunkSize: parseInt(e.target.value) || 512 })} />
                    </div>
                    <div>
                      <label className={labelCls}>块重叠 (token)</label>
                      <input className={inputCls} type="number" min={0}
                        value={formatOverrides.pdf?.chunkOverlap ?? 50}
                        onChange={e => updatePdf({ chunkOverlap: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <Toggle checked={formatOverrides.pdf?.respectPageBoundary ?? true}
                    onChange={v => updatePdf({ respectPageBoundary: v })} label="尊重页面边界（不跨页合并）" />
                    </>
                  )}
                </div>

                {/* ── HTML ── */}
                <div className={`border-l-2 ${formatTypeEnabled.html !== false ? 'border-orange-500/30' : 'border-gray-300/30 opacity-60'} pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-orange-400">🌐 HTML</span>
                    <Toggle checked={formatTypeEnabled.html !== false} onChange={v => setFormatTypeEnabled(prev => ({ ...prev, html: v }))} />
                  </div>
                  {formatTypeEnabled.html !== false && (
                    <>
                  <div>
                    <label className={labelCls}>分块方式</label>
                    <select className={selectCls} value={formatOverrides.html?.method ?? 'dom-section'}
                      onChange={e => updateHtml({ method: e.target.value as any })}>
                      {HTML_CHUNK_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {(formatOverrides.html?.method ?? 'dom-section') === 'dom-section'
                        ? '按 DOM 语义标签切分（h1-h3, section, article）'
                        : formatOverrides.html?.method === 'semantic' ? '语义检测切换点' : '按句贪心合并'}
                    </div>
                  </div>
                  {(formatOverrides.html?.method ?? 'dom-section') === 'dom-section' && (
                    <div>
                      <label className={labelCls}>切分标签（逗号分隔）</label>
                      <input className={inputCls} type="text"
                        value={(formatOverrides.html?.sectionTags ?? ['h1','h2','h3','section','article']).join(',')}
                        onChange={e => updateHtml({ sectionTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                      <div className="text-[10px] text-gray-400">遇到这些标签时开始新的块</div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className={labelCls}>块大小 (token)</label>
                      <input className={inputCls} type="number" min={64}
                        value={formatOverrides.html?.chunkSize ?? 512}
                        onChange={e => updateHtml({ chunkSize: parseInt(e.target.value) || 512 })} />
                    </div>
                    <div>
                      <label className={labelCls}>块重叠 (token)</label>
                      <input className={inputCls} type="number" min={0}
                        value={formatOverrides.html?.chunkOverlap ?? 50}
                        onChange={e => updateHtml({ chunkOverlap: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <Toggle checked={formatOverrides.html?.stripTags ?? true}
                    onChange={v => updateHtml({ stripTags: v })} label="去除 HTML 标签（仅保留纯文本）" />
                    </>
                  )}
                </div>

                {/* ── Code ── */}
                <div className={`border-l-2 ${formatTypeEnabled.code !== false ? 'border-green-500/30' : 'border-gray-300/30 opacity-60'} pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-green-400">💻 代码文件</span>
                    <Toggle checked={formatTypeEnabled.code !== false} onChange={v => setFormatTypeEnabled(prev => ({ ...prev, code: v }))} />
                  </div>
                  {formatTypeEnabled.code !== false && (
                    <>
                  <div>
                    <label className={labelCls}>分块方式</label>
                    <select className={selectCls} value={formatOverrides.code?.method ?? 'function'}
                      onChange={e => updateCode({ method: e.target.value as any })}>
                      {CODE_CHUNK_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {(formatOverrides.code?.method ?? 'function') === 'function'
                        ? '按函数/方法切分，每个函数一个块'
                        : formatOverrides.code?.method === 'class' ? '按类切分，每个类一个块'
                        : formatOverrides.code?.method === 'block' ? '按代码块（缩进/花括号）切分' : '按句贪心合并'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className={labelCls}>块大小 (token)</label>
                      <input className={inputCls} type="number" min={64}
                        value={formatOverrides.code?.chunkSize ?? 512}
                        onChange={e => updateCode({ chunkSize: parseInt(e.target.value) || 512 })} />
                    </div>
                    <div>
                      <label className={labelCls}>块重叠 (token)</label>
                      <input className={inputCls} type="number" min={0}
                        value={formatOverrides.code?.chunkOverlap ?? 50}
                        onChange={e => updateCode({ chunkOverlap: parseInt(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <Toggle checked={formatOverrides.code?.includeImports ?? false}
                    onChange={v => updateCode({ includeImports: v })} label="每块前附加 import/require 语句上下文" />
                    </>
                  )}
                </div>
          </div>
        )}
      </div>
    );
  }

  function renderQueryModeConfig() {
    const collapsed = collapsedSections['query-mode'];
    return (
      <div className="mb-4">
        {renderSectionHeader('query-mode', <Route size={14} className="text-pink-400" />, '查询模式')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            <div className="grid grid-cols-2 gap-1.5">
              {QUERY_MODES.map(m => (
                <button key={m.value}
                  className={`text-left px-2.5 py-2 rounded-lg text-xs transition-colors border ${
                    queryModeConfig.mode === m.value
                      ? 'border-blue-400 bg-blue-50 text-blue-500'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                  }`}
                  onClick={() => setQueryModeConfig(prev => ({ ...prev, mode: m.value }))}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>

            {queryModeConfig.mode === 'sub-question' && (
              <div className="border-l-2 border-pink-200 pl-2.5 space-y-2 mt-2">
                <div>
                  <label className={labelCls}>最大子问题数</label>
                  <input className={inputCls} type="number" min={1} max={10}
                    value={queryModeConfig.subQuestion?.maxSubQuestions ?? 3}
                    onChange={e => setQueryModeConfig(prev => ({
                      ...prev, subQuestion: { ...prev.subQuestion!, maxSubQuestions: parseInt(e.target.value) || 3 },
                    }))} />
                </div>
                <div>
                  <label className={labelCls}>合并策略</label>
                  <select className={selectCls}
                    value={queryModeConfig.subQuestion?.mergeStrategy ?? 'deduplicate'}
                    onChange={e => setQueryModeConfig(prev => ({
                      ...prev, subQuestion: { ...prev.subQuestion!, mergeStrategy: e.target.value as any },
                    }))}>
                    {MERGE_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <p className="text-[10px] text-gray-400">需要 LLM 支持。将复杂问题分解为子问题并行检索。</p>
              </div>
            )}

            {queryModeConfig.mode === 'iterative' && (
              <div className="border-l-2 border-pink-200 pl-2.5 space-y-2 mt-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className={labelCls}>最大迭代次数</label>
                    <input className={inputCls} type="number" min={1} max={10}
                      value={queryModeConfig.iterative?.maxIterations ?? 3}
                      onChange={e => setQueryModeConfig(prev => ({
                        ...prev, iterative: { ...prev.iterative!, maxIterations: parseInt(e.target.value) || 3 },
                      }))} />
                  </div>
                  <div>
                    <label className={labelCls}>质量阈值</label>
                    <input className={inputCls} type="number" min={0} max={1} step={0.05}
                      value={queryModeConfig.iterative?.qualityThreshold ?? 0.7}
                      onChange={e => setQueryModeConfig(prev => ({
                        ...prev, iterative: { ...prev.iterative!, qualityThreshold: parseFloat(e.target.value) || 0.7 },
                      }))} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>优化策略</label>
                  <select className={selectCls}
                    value={queryModeConfig.iterative?.refinementStrategy ?? 'rephrase'}
                    onChange={e => setQueryModeConfig(prev => ({
                      ...prev, iterative: { ...prev.iterative!, refinementStrategy: e.target.value as any },
                    }))}>
                    {REFINE_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <p className="text-[10px] text-gray-400">检索结果不佳时自动改写查询重试。改写和分解需要 LLM。</p>
              </div>
            )}

            {queryModeConfig.mode === 'router' && (
              <div className="border-l-2 border-pink-200 pl-2.5 space-y-2 mt-2">
                <p className="text-[10px] text-gray-400">
                  条件路由需要多个向量库集合。根据查询内容自动选择最合适的集合。
                  当前集合数: {collections.length}
                </p>
                <div>
                  <label className={labelCls}>路由方式</label>
                  <select className={selectCls}
                    value={queryModeConfig.router?.routingMethod ?? 'keyword'}
                    onChange={e => setQueryModeConfig(prev => ({
                      ...prev, router: {
                        routes: prev.router?.routes ?? collections.map(c => ({ id: c.id, name: c.name, description: c.name })),
                        routingMethod: e.target.value as any,
                      },
                    }))}>
                    <option value="keyword">关键词匹配</option>
                    <option value="embedding">向量相似度</option>
                    <option value="llm">LLM 路由</option>
                  </select>
                </div>
              </div>
            )}

            {queryModeConfig.mode === 'custom' && (
              <div className="border-l-2 border-pink-200 pl-2.5 space-y-2 mt-2">
                <p className="text-[10px] text-gray-400">
                  自定义管道：按顺序组合检索步骤，构建个性化查询流程。
                </p>
                <div className="space-y-1.5">
                  {(queryModeConfig.custom?.steps ?? []).map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400 w-4">{i + 1}.</span>
                      <select className={`${selectCls} flex-1`}
                        value={step.type}
                        onChange={e => {
                          const newSteps = [...(queryModeConfig.custom?.steps ?? [])];
                          newSteps[i] = { ...newSteps[i], type: e.target.value as any };
                          setQueryModeConfig(prev => ({ ...prev, custom: { ...prev.custom, steps: newSteps } }));
                        }}>
                        <option value="retrieve">检索</option>
                        <option value="rewrite">LLM 改写查询</option>
                        <option value="decompose">分解子问题</option>
                        <option value="filter">过滤</option>
                        <option value="rerank">重排</option>
                      </select>
                      <button className="text-gray-400 hover:text-red-500 text-xs px-1"
                        onClick={() => {
                          const newSteps = (queryModeConfig.custom?.steps ?? []).filter((_, j) => j !== i);
                          setQueryModeConfig(prev => ({ ...prev, custom: { ...prev.custom, steps: newSteps } }));
                        }}>✕</button>
                    </div>
                  ))}
                </div>
                <button
                  className="text-[11px] text-blue-500 hover:text-blue-600 flex items-center gap-1"
                  onClick={() => {
                    const newSteps = [...(queryModeConfig.custom?.steps ?? []), { type: 'retrieve' as const }];
                    setQueryModeConfig(prev => ({ ...prev, custom: { ...prev.custom, steps: newSteps } }));
                  }}>
                  + 添加步骤
                </button>
                {(queryModeConfig.custom?.steps ?? []).length === 0 && (
                  <p className="text-[10px] text-amber-500">⚠️ 未添加步骤，将回退到单次检索模式</p>
                )}
                <p className="text-[10px] text-gray-400">改写和分解需要 LLM 支持。步骤按顺序执行。</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderRetrievalConfig() {
    const collapsed = collapsedSections['retrieval'];
    const hasHnswBuilt = vectorStoreRef.current.searchAlgorithm === 'hnsw';
    return (
      <div className="mb-4">
        {renderSectionHeader('retrieval', <Search size={14} className="text-blue-500" />, '检索配置')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            {/* 向量搜索算法 */}
            <div>
              <label className={labelCls}>向量搜索算法</label>
              <select
                className={selectCls}
                value={searchAlgorithm}
                onChange={e => {
                  const val = e.target.value as SearchAlgorithm;
                  if (val === 'hnsw' && !hasHnswBuilt) return;
                  setSearchAlgorithm(val);
                }}
              >
                <option value="brute-force">暴力搜索（Brute-Force）</option>
                <option value="hnsw" disabled={!hasHnswBuilt}>
                  HNSW{hasHnswBuilt ? '' : ' — 需先在索引优化中构建'}
                </option>
              </select>
              {!hasHnswBuilt && searchAlgorithm === 'brute-force' && vectorStoreRef.current.size > 0 && (
                <div className="text-[10px] text-gray-400 mt-1">
                  💡 在「索引优化」中构建 HNSW 索引后可启用近似最近邻搜索
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>策略</label>
              <select className={selectCls} value={retrievalConfig.strategy} onChange={e => setRetrievalConfig(prev => ({ ...prev, strategy: e.target.value as RetrievalStrategy }))}>
                {RETRIEVAL_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Top K (初始检索数)</label>
              <input className={inputCls} type="number" min={1} max={100} value={retrievalConfig.topK} onChange={e => setRetrievalConfig(prev => ({ ...prev, topK: parseInt(e.target.value) || 20 }))} />
            </div>
            {retrievalConfig.strategy === 'hybrid' && (
              <>
                <div>
                  <label className={labelCls}>融合方法</label>
                  <select className={selectCls} value={retrievalConfig.fusionMethod ?? 'rrf'} onChange={e => setRetrievalConfig(prev => ({ ...prev, fusionMethod: e.target.value as FusionMethod }))}>
                    {FUSION_METHODS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                {retrievalConfig.fusionMethod === 'alpha' && (
                  <div>
                    <label className={labelCls}>Alpha (向量权重 0-1): {retrievalConfig.alpha ?? 0.7}</label>
                    <input type="range" className="w-full accent-blue-500" min={0} max={1} step={0.05} value={retrievalConfig.alpha ?? 0.7} onChange={e => setRetrievalConfig(prev => ({ ...prev, alpha: parseFloat(e.target.value) }))} />
                  </div>
                )}
                {retrievalConfig.fusionMethod === 'rrf' && (
                  <div>
                    <label className={labelCls}>RRF K 参数</label>
                    <input className={inputCls} type="number" value={retrievalConfig.rrfK ?? 60} onChange={e => setRetrievalConfig(prev => ({ ...prev, rrfK: parseInt(e.target.value) || 60 }))} />
                  </div>
                )}
              </>
            )}
            {(retrievalConfig.strategy === 'bm25' || retrievalConfig.strategy === 'hybrid') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>BM25 k1</label>
                  <input className={inputCls} type="number" step={0.1} value={retrievalConfig.bm25K1 ?? 1.2} onChange={e => setRetrievalConfig(prev => ({ ...prev, bm25K1: parseFloat(e.target.value) || 1.2 }))} />
                </div>
                <div>
                  <label className={labelCls}>BM25 b</label>
                  <input className={inputCls} type="number" step={0.05} value={retrievalConfig.bm25B ?? 0.75} onChange={e => setRetrievalConfig(prev => ({ ...prev, bm25B: parseFloat(e.target.value) || 0.75 }))} />
                </div>
              </div>
            )}

            {/* ── 知识图谱检索增强 ── */}
            <div className="border-t border-gray-200 pt-2 mt-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 font-medium">启用知识图谱检索增强</span>
                  {knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600">
                      {knowledgeGraphRef.current.tripleCount} 三元组
                    </span>
                  )}
                </div>
                <Toggle checked={retrievalConfig.includeKnowledgeGraph ?? false} onChange={v => {
                  if (v) {
                    const hasKg = knowledgeGraphRef.current && knowledgeGraphRef.current.tripleCount > 0;
                    if (!hasKg) {
                      alert('⚠️ 尚未构建知识图谱，请先在「索引优化」中点击「构建知识图谱」。');
                      return;
                    }
                  }
                  setRetrievalConfig(prev => ({ ...prev, includeKnowledgeGraph: v }));
                }} />
              </div>
              {retrievalConfig.includeKnowledgeGraph && (
                <div className="pl-5">
                  <label className={labelCls}>最大关联三元组数</label>
                  <input className={inputCls} type="number" min={1} max={20}
                    value={retrievalConfig.kgMaxTriples ?? 5}
                    onChange={e => setRetrievalConfig(prev => ({ ...prev, kgMaxTriples: parseInt(e.target.value) || 5 }))} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderRerankerConfig() {
    const collapsed = collapsedSections['reranker'];
    return (
      <div className="mb-4">
        {renderSectionHeader('reranker', <SlidersHorizontal size={14} className="text-purple-500" />, '重排配置')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            <div>
              <label className={labelCls}>重排方式</label>
              <select className={selectCls} value={rerankerConfig.type} onChange={e => setRerankerConfig(prev => ({ ...prev, type: e.target.value as RerankerType }))}>
                {RERANKER_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Top N (保留数)</label>
              <input className={inputCls} type="number" min={1} max={50} value={rerankerConfig.topN} onChange={e => setRerankerConfig(prev => ({ ...prev, topN: parseInt(e.target.value) || 5 }))} />
            </div>
            {rerankerConfig.type === 'mmr' && (
              <div>
                <label className={labelCls}>MMR Lambda: {rerankerConfig.mmrLambda ?? 0.7}</label>
                <input type="range" className="w-full accent-purple-500" min={0} max={1} step={0.05} value={rerankerConfig.mmrLambda ?? 0.7} onChange={e => setRerankerConfig(prev => ({ ...prev, mmrLambda: parseFloat(e.target.value) }))} />
              </div>
            )}
            {rerankerConfig.type === 'llm' && (
              <>
                <ApiProfilePicker
                  value={llmRerankerApiConfig}
                  onChange={setLlmRerankerApiConfig}
                  storageKey={LS_LLM_RERANKER_API_PROFILE}
                  label="LLM API 配置（用于评分重排）"
                />
                <div>
                  <label className={labelCls}>评分 Prompt 模板（可选）</label>
                  <textarea
                    className={`${inputCls} h-16 resize-none`}
                    placeholder="用 {query} 和 {text} 作为占位符。留空使用默认模板。"
                    value={rerankerConfig.llmPromptTemplate ?? ''}
                    onChange={e => setRerankerConfig(prev => ({ ...prev, llmPromptTemplate: e.target.value || undefined }))}
                  />
                </div>
              </>
            )}
            {rerankerConfig.type === 'cohere' && (
              <>
                <div>
                  <label className={labelCls}>Cohere API Key</label>
                  <input className={inputCls} type="password" value={rerankerConfig.cohereApiKey ?? ''} onChange={e => setRerankerConfig(prev => ({ ...prev, cohereApiKey: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Cohere 模型</label>
                  <input className={inputCls} value={rerankerConfig.cohereModel ?? 'rerank-v3.5'} onChange={e => setRerankerConfig(prev => ({ ...prev, cohereModel: e.target.value }))} />
                </div>
              </>
            )}
            {rerankerConfig.type === 'jina' && (
              <>
                <div>
                  <label className={labelCls}>Jina API Key</label>
                  <input className={inputCls} type="password" value={rerankerConfig.jinaApiKey ?? ''} onChange={e => setRerankerConfig(prev => ({ ...prev, jinaApiKey: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Jina 模型</label>
                  <input className={inputCls} value={rerankerConfig.jinaModel ?? 'jina-reranker-v2-base-multilingual'} onChange={e => setRerankerConfig(prev => ({ ...prev, jinaModel: e.target.value }))} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPreRetrieval() {
    const collapsed = collapsedSections['preRetrieval'];
    return (
      <div className="mb-4">
        {renderSectionHeader('preRetrieval', <Zap size={14} className="text-yellow-500" />, '检索前优化')}
        {!collapsed && (
          <div className="space-y-2 pl-5">
            <div>
              <label className={labelCls}>优化策略</label>
              <select className={selectCls} value={preRetrievalConfig.strategy}
                onChange={e => setPreRetrievalConfig(prev => ({ ...prev, strategy: e.target.value as PreRetrievalStrategy }))}>
                {PRE_RETRIEVAL_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                {PRE_RETRIEVAL_STRATEGIES.find(s => s.value === preRetrievalConfig.strategy)?.desc}
              </div>
            </div>
            {preRetrievalConfig.strategy !== 'none' && (
              <ApiProfilePicker
                value={preRetrievalApiConfig}
                onChange={setPreRetrievalApiConfig}
                storageKey={LS_PRE_RETRIEVAL_API_PROFILE}
                label="LLM API 配置（用于查询优化）"
              />
            )}
            {preRetrievalConfig.strategy === 'expansion' && (
              <div>
                <label className={labelCls}>扩展词数量</label>
                <input className={inputCls} type="number" min={1} max={20}
                  value={preRetrievalConfig.expansion?.maxTerms ?? 5}
                  onChange={e => setPreRetrievalConfig(prev => ({
                    ...prev, expansion: { ...prev.expansion, maxTerms: parseInt(e.target.value) || 5 },
                  }))} />
              </div>
            )}
            {preRetrievalConfig.strategy === 'rewrite' && (
              <div>
                <label className={labelCls}>改写风格</label>
                <select className={selectCls} value={preRetrievalConfig.rewrite?.style ?? 'precise'}
                  onChange={e => setPreRetrievalConfig(prev => ({
                    ...prev, rewrite: { style: e.target.value as 'precise' | 'broad' | 'technical' },
                  }))}>
                  <option value="precise">精确</option>
                  <option value="broad">广泛</option>
                  <option value="technical">技术化</option>
                </select>
              </div>
            )}
            {preRetrievalConfig.strategy === 'hyde' && (
              <>
                <div>
                  <label className={labelCls}>假设回答长度</label>
                  <select className={selectCls} value={preRetrievalConfig.hyde?.responseLength ?? 'medium'}
                    onChange={e => setPreRetrievalConfig(prev => ({
                      ...prev, hyde: { ...prev.hyde, responseLength: e.target.value as 'short' | 'medium' | 'long' },
                    }))}>
                    <option value="short">短 (2-3句)</option>
                    <option value="medium">中 (4-6句)</option>
                    <option value="long">长 (8-12句)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>假设回答数量</label>
                  <input className={inputCls} type="number" min={1} max={5}
                    value={preRetrievalConfig.hyde?.numHypothetical ?? 1}
                    onChange={e => setPreRetrievalConfig(prev => ({
                      ...prev, hyde: { ...prev.hyde, numHypothetical: parseInt(e.target.value) || 1 },
                    }))} />
                  <div className="text-[10px] text-gray-400 mt-1">多个假设回答取平均向量，更稳定但更慢</div>
                </div>
              </>
            )}
            {preRetrievalLog.length > 0 && (
              <div className="mt-2 p-2 rounded bg-gray-50 border border-gray-200 text-[10px] text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {preRetrievalLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderIndexOptimization() {
    const collapsed = collapsedSections['indexOpt'];
    const kgStats = knowledgeGraphRef.current;
    const hasHnswBuilt = vectorStoreRef.current.searchAlgorithm === 'hnsw';
    const hasKgBuilt = kgStats && kgStats.tripleCount > 0;
    return (
      <div className="mb-4">
        {renderSectionHeader('indexOpt', <Database size={14} className="text-cyan-500" />, '索引优化')}
        {!collapsed && (
          <div className="space-y-3 pl-5">
            {/* ── HNSW 索引配置 ── */}
            <div className="border-l-2 border-cyan-500/30 pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-cyan-500 flex items-center gap-1.5">🏗️ HNSW 索引</div>
                {hasHnswBuilt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-600">已构建</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelCls}>M (连接数)</label>
                  <input className={inputCls} type="number" min={4} max={64}
                    value={hnswConfig.m ?? 16}
                    onChange={e => setHnswConfig(prev => ({ ...prev, m: parseInt(e.target.value) || 16 }))} />
                </div>
                <div>
                  <label className={labelCls}>ef 建图</label>
                  <input className={inputCls} type="number" min={50} max={500}
                    value={hnswConfig.efConstruction ?? 200}
                    onChange={e => setHnswConfig(prev => ({ ...prev, efConstruction: parseInt(e.target.value) || 200 }))} />
                </div>
                <div>
                  <label className={labelCls}>ef 查询</label>
                  <input className={inputCls} type="number" min={10} max={500}
                    value={hnswConfig.efSearch ?? 50}
                    onChange={e => setHnswConfig(prev => ({ ...prev, efSearch: parseInt(e.target.value) || 50 }))} />
                </div>
              </div>
              <div className="text-[10px] text-gray-400 leading-relaxed">
                M↑ 更准但更慢 | ef建图↑ 图质量更高 | ef查询↑ 搜索更准
              </div>
              {!vectorStoreRef.current.size && (
                <div className="text-[10px] text-gray-400 italic">需要先构建基本向量库后才能构建 HNSW 索引</div>
              )}
            </div>

            {/* ── 知识图谱配置 ── */}
            <div className="border-l-2 border-teal-500/30 pl-2.5 space-y-2 bg-gray-50 rounded-r-lg p-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-teal-500 flex items-center gap-1.5">🧠 知识图谱</div>
                {hasKgBuilt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-600">已构建</span>}
              </div>
              <ApiProfilePicker
                value={kgApiConfig}
                onChange={setKgApiConfig}
                storageKey={LS_KG_API_PROFILE}
                label="LLM API 配置（用于提取三元组）"
              />
              <div>
                <label className={labelCls}>每块最大三元组数</label>
                <input className={inputCls} type="number" min={1} max={50}
                  value={kgConfig.maxTriplesPerChunk}
                  onChange={e => setKgConfig(prev => ({ ...prev, maxTriplesPerChunk: parseInt(e.target.value) || 10 }))} />
              </div>
              <div>
                <label className={labelCls}>关注实体类型（逗号分隔，留空不限制）</label>
                <input className={inputCls} placeholder="人物, 技术, 概念, 组织"
                  value={(kgConfig.entityTypes || []).join(', ')}
                  onChange={e => setKgConfig(prev => ({
                    ...prev,
                    entityTypes: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                  }))} />
              </div>
              <div className="flex items-center gap-1">
                <Toggle checked={kgConfig.includeEntityDescriptions ?? true}
                  onChange={v => setKgConfig(prev => ({ ...prev, includeEntityDescriptions: v }))} label="生成实体描述" />
                <span className="text-[10px] text-gray-400" title="开启后，LLM 会为每个提取的实体生成一句话描述（如「React — Facebook 开发的前端框架」），有助于知识图谱检索时的语义匹配">ⓘ</span>
              </div>
              {hasKgBuilt && (
                <div className="p-2 rounded bg-teal-50 border border-teal-200 text-[10px] text-teal-700 space-y-2">
                  <div>📊 三元组: {kgStats.tripleCount} | 实体: {kgStats.entityCount}</div>
                  <div className="max-h-24 overflow-y-auto">
                    {kgStats.getEntities().slice(0, 10).map((e, i) => (
                      <span key={i} className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 mb-0.5">
                        {e.name} ({e.tripleCount})
                      </span>
                    ))}
                  </div>
                  {/* Triple example */}
                  <div className="border-t border-teal-200 pt-2">
                    <button
                      className="text-[10px] text-teal-600 hover:text-teal-800 font-medium"
                      onClick={() => {
                        const sample = knowledgeGraphRef.current?.getRandomTriple();
                        setKgTripleSample(sample ?? null);
                      }}
                    >🎲 随机三元组示例</button>
                    {kgTripleSample && (
                      <div className="mt-1.5 space-y-1 bg-white/60 rounded p-2">
                        <div className="font-medium text-teal-800">
                          {kgTripleSample.triple.subject}
                          <span className="mx-1 text-teal-500">→</span>
                          <span className="text-teal-600">{kgTripleSample.triple.predicate}</span>
                          <span className="mx-1 text-teal-500">→</span>
                          {kgTripleSample.triple.object}
                        </div>
                        {Object.keys(kgTripleSample.entityDescs).length > 0 && (
                          <div className="text-[9px] text-gray-500 space-y-0.5">
                            {Object.entries(kgTripleSample.entityDescs).map(([name, desc]) => (
                              <div key={name}><span className="font-medium text-gray-600">{name}</span>: {desc}</div>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const entry = vectorStoreRef.current?.getEntry(kgTripleSample.triple.sourceChunkId);
                          return entry ? (
                            <div className="text-[9px] text-gray-400 mt-1 border-t border-teal-100 pt-1">
                              <span className="font-medium">原文：</span>
                              <span className="italic">{entry.text.slice(0, 200)}{entry.text.length > 200 ? '…' : ''}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!vectorStoreRef.current.size && (
                <div className="text-[10px] text-gray-400 italic">需要先构建基本向量库后才能构建知识图谱</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPresets() {
    const presetItems: Array<{ key: string; icon: React.ReactNode; label: string; desc: string; needsApi?: boolean }> = [
      { key: 'simple', icon: <Zap size={12} />, label: '简单向量', desc: '纯向量检索，最快' },
      { key: 'keyword', icon: <Search size={12} />, label: '关键词', desc: 'BM25 精确匹配' },
      { key: 'balanced', icon: <Settings2 size={12} />, label: '均衡混合', desc: 'Hybrid + RRF + MMR' },
      { key: 'semantic', icon: <GitBranch size={12} />, label: '语义增强', desc: '向量 + 查询扩展 + MMR', needsApi: true },
      { key: 'hyde', icon: <FileSearch size={12} />, label: 'HyDE 检索', desc: 'Hybrid + 假设文档嵌入', needsApi: true },
      { key: 'precision', icon: <Sparkles size={12} />, label: '精确模式', desc: 'Hybrid + KG + LLM 重排', needsApi: true },
      { key: 'deep', icon: <Layers size={12} />, label: '深度分析', desc: 'Hybrid + KG + 查询改写 + LLM 重排', needsApi: true },
    ];
    const needsApiForActive = presetItems.find(p => p.key === activePreset)?.needsApi;
    return (
      <div className="mb-4">
        <div className={sectionTitle}><Zap size={14} className="text-orange-500" /> 预设配置</div>
        <div className="space-y-1 pl-5">
          {presetItems.map(p => (
            <button
              key={p.key}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all border ${
                activePreset === p.key
                  ? 'bg-orange-50 border-orange-300 text-orange-700 ring-1 ring-orange-200'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
              onClick={() => {
                if (activePreset === p.key) {
                  setActivePreset(null);
                } else {
                  applyPreset(p.key);
                }
              }}
            >
              {p.icon}
              <span className="font-medium">{p.label}</span>
              {p.needsApi && <span className="text-[9px] text-amber-500 font-medium">API</span>}
              <span className="text-[10px] text-gray-400 ml-auto">{p.desc}</span>
            </button>
          ))}
        </div>
        {activePreset && (
          <div className="text-[10px] text-orange-500 mt-1.5 pl-5">
            ✨ 已选中「{presetItems.find(p => p.key === activePreset)?.label}」预设，构建时将使用此配置
          </div>
        )}
        {needsApiForActive && (
          <div className="pl-5 mt-2 space-y-1.5">
            <div className="text-[10px] text-gray-500">此预设需要 LLM API，请确认以下配置：</div>
            {(activePreset === 'semantic' || activePreset === 'hyde' || activePreset === 'deep') && (
              <div className="text-[10px]">
                <span className="text-gray-500">检索前优化 API →</span>
                {preRetrievalApiConfig?.apiKey
                  ? <span className="text-green-600 ml-1">✓ 已配置</span>
                  : <span className="text-amber-500 ml-1">⚠ 未配置（请在检索前优化区域设置）</span>}
              </div>
            )}
            {(activePreset === 'precision' || activePreset === 'deep') && (
              <div className="text-[10px]">
                <span className="text-gray-500">LLM 重排 API →</span>
                {llmRerankerApiConfig?.apiKey
                  ? <span className="text-green-600 ml-1">✓ 已配置</span>
                  : <span className="text-amber-500 ml-1">⚠ 未配置（请在重排配置区域设置）</span>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderCollectionPanel() {
    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className={sectionTitle}><Database size={14} className="text-blue-500" /> 向量库</div>
          <button className="text-blue-500 hover:text-blue-600 transition-colors" onClick={() => setShowNewCollection(true)}>
            <Plus size={16} />
          </button>
        </div>

        {showNewCollection && (
          <div className="flex gap-1.5 mb-2 pl-5">
            <input className={`${inputCls} flex-1`} placeholder="集合名称" value={newCollectionName}
              onChange={e => setNewCollectionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCollection()} autoFocus />
            <button className={btnPrimary} onClick={createCollection} disabled={!newCollectionName.trim()}>
              <CheckCircle2 size={14} />
            </button>
            <button className={btnSecondary} onClick={() => { setShowNewCollection(false); setNewCollectionName(''); }}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="space-y-1 pl-1">
          {collections.length === 0 && !showNewCollection && (
            <p className="text-xs text-gray-400 pl-4">暂无向量库，点击 + 创建</p>
          )}
          {collections.map(col => (
            <div key={col.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                col.id === activeCollectionId ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              onClick={() => setActiveCollectionId(col.id)}
            >
              <span className="shrink-0">{getCollectionIcon(col.icon, col.color, 18)}</span>
              <div className="flex-1 min-w-0">
                {renamingCollectionId === col.id ? (
                  <input className={`${inputCls} text-sm w-full`} autoFocus
                    defaultValue={col.name}
                    onBlur={e => {
                      const newName = e.target.value.trim();
                      if (newName) setCollections(prev => prev.map(c => c.id === col.id ? { ...c, name: newName } : c));
                      setRenamingCollectionId(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenamingCollectionId(null);
                    }}
                  />
                ) : (
                  <div className={`text-sm truncate ${col.id === activeCollectionId ? 'font-medium' : ''}`}
                    style={{ color: col.id === activeCollectionId ? col.color : undefined }}
                    onDoubleClick={() => setRenamingCollectionId(col.id)}
                  >{col.name}</div>
                )}
                <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                  <span>{col.docPaths.length} 文档 · {col.vectorCount > 0 ? `${col.vectorCount} 向量` : '未索引'}</span>
                  {col.hasHnsw && <span className="px-1 py-0.5 bg-cyan-50 text-cyan-600 rounded text-[9px] font-medium leading-none">HNSW</span>}
                  {col.hasKg && <span className="px-1 py-0.5 bg-teal-50 text-teal-600 rounded text-[9px] font-medium leading-none">KG</span>}
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                <button className="text-gray-400 hover:text-pink-500"
                  onClick={e => { e.stopPropagation(); setSearchCollectionId(col.id); }}
                  title="搜索测试"
                ><Search size={13} /></button>
                <button className="text-gray-400 hover:text-blue-500"
                  onClick={e => { e.stopPropagation(); setDetailCollectionId(detailCollectionId === col.id ? null : col.id); }}
                  title="向量库详情"
                ><Info size={13} /></button>
                <button className="text-gray-400 hover:text-gray-600"
                  onClick={e => { e.stopPropagation(); setEditingCollection(editingCollection?.id === col.id ? null : col); }}
                  title="编辑图标/颜色"
                ><Settings size={13} /></button>
                <button className="text-red-400 hover:text-red-500"
                  onClick={e => { e.stopPropagation(); deleteCollection(col.id); }}
                  title="删除"
                ><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Edit collection popup */}
        {editingCollection && (
          <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
            <div className="text-xs text-gray-500 mb-1">编辑「{editingCollection.name}」</div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">图标</div>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_ICON_NAMES.map(iconName => (
                  <button key={iconName}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${editingCollection.icon === iconName ? 'bg-blue-100 ring-1 ring-blue-400' : 'hover:bg-gray-100'}`}
                    onClick={() => {
                      setCollections(prev => prev.map(c => c.id === editingCollection.id ? { ...c, icon: iconName } : c));
                      setEditingCollection(prev => prev ? { ...prev, icon: iconName } : null);
                    }}
                  >{getCollectionIcon(iconName, editingCollection.color || '#3B82F6', 16)}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 mb-1">颜色</div>
              <div className="flex flex-wrap gap-1.5">
                {COLLECTION_COLORS.map(color => (
                  <button key={color}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${editingCollection.color === color ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-110'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setCollections(prev => prev.map(c => c.id === editingCollection.id ? { ...c, color } : c));
                      setEditingCollection(prev => prev ? { ...prev, color } : null);
                    }}
                  />
                ))}
              </div>
            </div>
            <button className="text-[10px] text-gray-400 hover:text-gray-600" onClick={() => setEditingCollection(null)}>完成</button>
          </div>
        )}
      </div>
    );
  }

  function renderCollectionDetailModal() {
    if (!detailCollectionId) return null;
    const col = collections.find(c => c.id === detailCollectionId);
    if (!col) return null;

    const isActive = col.id === activeCollectionId;
    const store = isActive ? vectorStoreRef.current : null;
    const kg = isActive ? knowledgeGraphRef.current : null;
    const info = store?.getInfo();

    const strategyLabels: Record<string, string> = {
      'sentence': '句子分割 (Sentence)',
      'sentence-window': '滑动窗口 (Sentence Window)',
      'semantic': '语义分割 (Semantic)',
    };
    const algoLabels: Record<string, string> = {
      'brute-force': '暴力搜索 (Brute Force)',
      'hnsw': 'HNSW 图索引',
    };

    const Row = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
      <div className="flex items-start gap-2 py-1.5">
        <span className="text-[11px] text-gray-400 w-[90px] shrink-0 text-right pt-0.5">{label}</span>
        <span className={`text-[12px] text-gray-700 flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
      </div>
    );

    const Badge = ({ text, color = 'gray' }: { text: string; color?: string }) => {
      const colors: Record<string, string> = {
        green: 'bg-green-50 text-green-600 border-green-200',
        blue: 'bg-blue-50 text-blue-600 border-blue-200',
        purple: 'bg-purple-50 text-purple-600 border-purple-200',
        gray: 'bg-gray-50 text-gray-500 border-gray-200',
        amber: 'bg-amber-50 text-amber-600 border-amber-200',
      };
      return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${colors[color] || colors.gray}`}>{text}</span>;
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setDetailCollectionId(null)}>
        <div className="bg-white border border-gray-200 rounded-xl w-[480px] max-h-[85vh] overflow-y-auto p-5 shadow-xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span>{getCollectionIcon(col.icon, col.color, 20)}</span>
              <div>
                <div className="text-sm font-bold text-gray-800">{col.name}</div>
                <div className="text-[10px] text-gray-400">向量库详情</div>
              </div>
            </div>
            <button className="p-1 rounded hover:bg-gray-100 text-gray-400" onClick={() => setDetailCollectionId(null)}><X size={14} /></button>
          </div>

          {/* Summary */}
          {col.summary && (
            <div className="mb-4 p-3 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-100">
              <div className="text-[10px] text-blue-500 font-medium mb-1 flex items-center gap-1"><Sparkles size={10} /> 摘要</div>
              <p className="text-[12px] text-gray-700 leading-relaxed">{col.summary}</p>
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><Database size={11} /> 基础信息</div>
            <div className="pl-1 divide-y divide-gray-100">
              <Row label="向量数量" value={<span className="font-semibold">{col.vectorCount || 0}</span>} />
              <Row label="文档数量" value={`${col.docPaths.length} 个文件`} />
              <Row label="嵌入模型" value={
                <span className="font-mono text-[11px]">{col.embeddingProvider ? `${col.embeddingProvider} / ${col.embeddingModel}` : '未配置'}</span>
              } />
              <Row label="创建时间" value={col.createdAt ? new Date(col.createdAt).toLocaleString('zh-CN') : '未知'} />
              {info && <Row label="最后更新" value={new Date(info.updatedAt).toLocaleString('zh-CN')} />}
            </div>
          </div>

          {/* Chunking Strategy */}
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><Layers size={11} /> 分块策略</div>
            <div className="pl-1 divide-y divide-gray-100">
              {info?.chunkingStrategy ? (
                <>
                  <Row label="策略" value={<Badge text={strategyLabels[info.chunkingStrategy] || info.chunkingStrategy} color="blue" />} />
                  {info.chunkingConfig && (
                    <>
                      {info.chunkingConfig.chunkSize && <Row label="块大小" value={`${info.chunkingConfig.chunkSize} tokens`} mono />}
                      {info.chunkingConfig.chunkOverlap != null && <Row label="重叠" value={`${info.chunkingConfig.chunkOverlap} tokens`} mono />}
                      {info.chunkingConfig.windowSize != null && <Row label="窗口大小" value={`前后各 ${info.chunkingConfig.windowSize} 句`} />}
                      {info.chunkingConfig.breakpointPercentile != null && <Row label="断点阈值" value={`${info.chunkingConfig.breakpointPercentile}%`} mono />}
                      {info.chunkingConfig.formatOverrides && <Row label="格式感知" value={<Badge text="已启用" color="green" />} />}
                    </>
                  )}
                </>
              ) : (
                <Row label="策略" value={<span className="text-gray-400">未记录（旧版索引）</span>} />
              )}
            </div>
          </div>

          {/* Search Algorithm */}
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><Search size={11} /> 搜索算法</div>
            <div className="pl-1 divide-y divide-gray-100">
              <Row label="算法" value={
                <Badge text={algoLabels[info?.searchAlgorithm || store?.searchAlgorithm || 'brute-force'] || '暴力搜索'} color={info?.hasHnswIndex ? 'purple' : 'gray'} />
              } />
              {info?.hasHnswIndex && info.hnswConfig && (
                <>
                  <Row label="HNSW M" value={info.hnswConfig.m ?? 16} mono />
                  <Row label="efConstruction" value={info.hnswConfig.efConstruction ?? 200} mono />
                  <Row label="efSearch" value={info.hnswConfig.efSearch ?? 50} mono />
                </>
              )}
            </div>
          </div>

          {/* Knowledge Graph */}
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><GitBranch size={11} /> 知识图谱</div>
            <div className="pl-1 divide-y divide-gray-100">
              {(info?.hasKnowledgeGraph || (kg && kg.tripleCount > 0)) ? (
                <>
                  <Row label="状态" value={<Badge text="已构建" color="green" />} />
                  <Row label="三元组" value={`${info?.knowledgeGraphStats?.tripleCount ?? kg?.tripleCount ?? 0} 条`} />
                  <Row label="实体数" value={`${info?.knowledgeGraphStats?.entityCount ?? kg?.entityCount ?? 0} 个`} />
                  {info?.knowledgeGraphStats?.builtAt && (
                    <Row label="构建时间" value={new Date(info.knowledgeGraphStats.builtAt).toLocaleString('zh-CN')} />
                  )}
                </>
              ) : (
                <Row label="状态" value={<Badge text="未构建" color="gray" />} />
              )}
            </div>
          </div>

          {/* File List */}
          {info && info.files.length > 0 && (
            <div className="mb-2">
              <div className="text-[11px] font-semibold text-gray-500 mb-1 flex items-center gap-1"><FileText size={11} /> 已索引文件</div>
              <div className="max-h-[120px] overflow-y-auto pl-1 space-y-0.5">
                {info.files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] text-gray-500 py-0.5">
                    <span className="truncate flex-1" title={f.filePath}>{f.fileName}</span>
                    <span className="shrink-0 ml-2 text-gray-400">{f.chunkCount} 块</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Folder Context Menu (floating, macOS-style) ──
  function renderFolderContextMenu() {
    if (!folderContextMenu) return null;
    const folder = folders.find(f => f.id === folderContextMenu.folderId);
    if (!folder) return null;
    const showStyleEditor = editingFolderId === folder.id;

    // Clamp menu position to viewport
    const menuW = 200, menuH = showStyleEditor ? 320 : 160;
    const x = Math.min(folderContextMenu.x, window.innerWidth - menuW - 8);
    const y = Math.min(folderContextMenu.y, window.innerHeight - menuH - 8);

    return (
      <div className="fixed inset-0 z-[60]" onClick={() => { setFolderContextMenu(null); setEditingFolderId(null); }}>
        <div
          className="absolute bg-white/95 backdrop-blur-lg rounded-xl shadow-xl border border-gray-200/80 py-1 min-w-[180px] text-sm animate-in fade-in zoom-in-95 duration-100"
          style={{ left: x, top: y }}
          onClick={e => e.stopPropagation()}
        >
          {/* Rename */}
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2 text-gray-700"
            onClick={() => {
              setRenamingFolderId(folder.id);
              setFolderContextMenu(null);
              setEditingFolderId(null);
            }}
          >
            <Pencil size={14} className="text-gray-400" />
            重命名
          </button>

          {/* Edit icon / color */}
          <button
            className={`w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center gap-2 ${showStyleEditor ? 'text-blue-600 bg-blue-50/60' : 'text-gray-700'}`}
            onClick={e => {
              e.stopPropagation();
              setEditingFolderId(showStyleEditor ? null : folder.id);
            }}
          >
            <Palette size={14} className="text-gray-400" />
            修改图标与颜色
            <ChevronRight size={12} className={`ml-auto text-gray-300 transition-transform ${showStyleEditor ? 'rotate-90' : ''}`} />
          </button>

          {/* Inline icon/color picker */}
          {showStyleEditor && (
            <div className="px-3 py-2 space-y-2 border-t border-b border-gray-100 bg-gray-50/50">
              <div className="text-[10px] text-gray-500">图标</div>
              <div className="flex flex-wrap gap-1">
                {FOLDER_ICON_NAMES.map(ic => {
                  const Ic = (LucideIcons as any)[ic] || LucideIcons.Folder;
                  return (
                    <button key={ic}
                      className={`p-1.5 rounded-md border transition-colors ${folder.icon === ic || (!folder.icon && ic === 'Folder') ? 'border-blue-400 bg-blue-50' : 'border-transparent hover:bg-white'}`}
                      onClick={() => handleUpdateFolderStyle(folder.id, ic, undefined)}
                      title={ic}
                    ><Ic size={14} style={{ color: folder.color || '#60A5FA' }} /></button>
                  );
                })}
              </div>
              <div className="text-[10px] text-gray-500">颜色</div>
              <div className="flex flex-wrap gap-1">
                {FOLDER_COLORS.map(c => (
                  <button key={c}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${folder.color === c || (!folder.color && c === '#60A5FA') ? 'border-gray-700 scale-110' : 'border-transparent hover:border-gray-300'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleUpdateFolderStyle(folder.id, undefined, c)} />
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="my-1 border-t border-gray-100" />

          {/* Delete with confirmation */}
          {confirmDeleteFolderId === folder.id ? (
            <div className="px-3 py-2 space-y-1.5">
              <div className="text-xs text-red-600">确定删除「{folder.name}」？</div>
              <div className="text-[10px] text-gray-400">子文件夹将一并删除，文件移至上级目录</div>
              <div className="flex gap-1.5 mt-1">
                <button className="flex-1 px-2 py-1 text-[11px] rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                  onClick={() => { handleDeleteFolder(folder.id); setFolderContextMenu(null); setEditingFolderId(null); setConfirmDeleteFolderId(null); }}>
                  删除
                </button>
                <button className="flex-1 px-2 py-1 text-[11px] rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  onClick={() => setConfirmDeleteFolderId(null)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full px-3 py-1.5 text-left hover:bg-red-50 flex items-center gap-2 text-red-500"
              onClick={e => { e.stopPropagation(); setConfirmDeleteFolderId(folder.id); }}
            >
              <Trash2 size={14} />
              删除文件夹
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderDocumentsPanel() {
    const isBusy = indexStatus === 'loading' || indexStatus === 'chunking' || indexStatus === 'embedding' || indexStatus === 'saving';
    // Mutual exclusion: any build/save operation blocks all others
    const isAnyBuildRunning = isBusy || rebuildingHnsw || rebuildingKg || updatingConfig;

    // Current folder contents
    const childFolders = getChildFolders(folders, currentFolderId);
    const currentDocs = documents.filter(d => d.folderId === currentFolderId);
    const breadcrumbs = currentFolderId ? getAncestorPath(folders, currentFolderId) : [];

    // Format filter
    const allTypes = new Set(documents.map(d => d.type));
    const filteredDocs = docTypeFilter === 'all' ? currentDocs : currentDocs.filter(d => d.type === docTypeFilter);

    // Sort
    const sortedDocs = [...filteredDocs].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'type') cmp = a.type.localeCompare(b.type);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const selectedCount = selectedDocs.size;

    return (
      <div className={`${panelCls} flex flex-col h-full`}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <FileText size={14} className="text-blue-500" />
            文档库
            <span className="text-[10px] text-gray-400 font-normal">({documents.length})</span>
          </div>
          <div className="flex items-center gap-1">
            {/* View mode toggle */}
            <div className="flex bg-gray-100 rounded p-0.5">
              <button className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
                onClick={() => setViewMode('list')} title="列表视图">
                <ListIcon size={12} className={viewMode === 'list' ? 'text-blue-500' : 'text-gray-400'} />
              </button>
              <button className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
                onClick={() => setViewMode('grid')} title="图标视图">
                <LayoutGrid size={12} className={viewMode === 'grid' ? 'text-blue-500' : 'text-gray-400'} />
              </button>
            </div>
            <button className={btnSecondary + ' !py-1 !px-2 !text-[10px]'} onClick={() => setShowNewFolder(true)} title="新建文件夹">
              <FolderPlus size={12} />
            </button>
            <button className={btnSecondary + ' !py-1 !px-2 !text-[10px]'} onClick={handleAddFiles}>
              <Upload size={12} /> 添加
            </button>
            <button className={btnSecondary + ' !py-1 !px-2 !text-[10px]'} onClick={handleScanFolder}>
              <FolderOpen size={12} /> 扫描
            </button>
            <button className="p-1 rounded hover:bg-gray-100 transition-colors" title={expandedPanel === 'docs' ? '还原' : '全屏'}
              onClick={() => setExpandedPanel(expandedPanel === 'docs' ? null : 'docs')}>
              {expandedPanel === 'docs' ? <Minimize2 size={12} className="text-gray-400" /> : <Maximize2 size={12} className="text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-1 px-3 py-1 text-xs overflow-x-auto scrollbar-thin">
          <button className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors ${
            currentFolderId === null ? 'text-blue-500 bg-blue-50' : 'text-gray-500 hover:text-blue-500 hover:bg-gray-50'
          }`} onClick={() => setCurrentFolderId(null)}>
            <Home size={11} /> 根目录
          </button>
          {breadcrumbs.map(bc => (
            <React.Fragment key={bc.id}>
              <ChevronRight size={10} className="text-gray-300 shrink-0" />
              <button className={`shrink-0 px-1.5 py-0.5 rounded truncate max-w-[100px] transition-colors ${
                currentFolderId === bc.id ? 'text-blue-500 bg-blue-50' : 'text-gray-500 hover:text-blue-500 hover:bg-gray-50'
              }`} onClick={() => setCurrentFolderId(bc.id)}>
                {bc.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex gap-1.5 px-3 mb-1">
            <input className={`${inputCls} flex-1`} placeholder="文件夹名称" value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              autoFocus />
            <button className={btnPrimary + ' !py-1 !px-2'} onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              <CheckCircle2 size={12} />
            </button>
            <button className={btnSecondary + ' !py-1 !px-2'} onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* Format filter + sort controls */}
        <div className="flex items-center gap-2 px-3 pb-1">
          {allTypes.size > 1 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-thin flex-1 min-w-0">
              <button className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${docTypeFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                onClick={() => setDocTypeFilter('all')}>全部</button>
              {[...allTypes].map(t => (
                <button key={t} className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors ${docTypeFilter === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  onClick={() => setDocTypeFilter(t)}>{t}</button>
              ))}
            </div>
          )}
          <button className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 shrink-0"
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            <select className="bg-transparent text-[10px] text-gray-400 cursor-pointer outline-none"
              value={sortBy} onChange={e => setSortBy(e.target.value as 'name' | 'type')}>
              <option value="name">名称</option>
              <option value="type">类型</option>
            </select>
          </button>
        </div>

        {/* Main content area - folders + files */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0">
          {childFolders.length === 0 && sortedDocs.length === 0 && !showNewFolder ? (
            <div className="text-center text-gray-400 text-sm py-8">
              {documents.length === 0 ? '暂无文档，点击添加或扫描导入' : '此文件夹为空'}
            </div>
          ) : viewMode === 'list' ? (
            /* ── 列表视图 ── */
            <div className="space-y-0.5">
              {/* Back to parent */}
              {currentFolderId !== null && (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-gray-400 transition-colors"
                  onClick={() => {
                    const cur = folders.find(f => f.id === currentFolderId);
                    setCurrentFolderId(cur?.parentId ?? null);
                  }}>
                  <ChevronRight size={14} className="rotate-180" />
                  <span className="text-xs">返回上级</span>
                </div>
              )}
              {/* Child folders */}
              {childFolders.map(folder => (
                <div key={folder.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg group hover:bg-blue-50/60 cursor-pointer transition-colors"
                  onClick={() => setCurrentFolderId(folder.id)}
                  onContextMenu={e => handleFolderContextMenu(e, folder.id)}>
                  {getFolderIcon(folder.icon, folder.color, 16)}
                  {renamingFolderId === folder.id ? (
                    <input className={`${inputCls} flex-1 !py-0 !text-xs`} autoFocus
                      defaultValue={folder.name}
                      onBlur={e => handleRenameFolder(folder.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingFolderId(null); }}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800 truncate">{folder.name}</span>
                  )}
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {countFolderItems(folders, documents, folder.id)} 项
                  </span>
                </div>
              ))}
              {/* Files */}
              {sortedDocs.map(doc => {
                const inActiveCol = activeCollection?.docPaths.includes(doc.path);
                return (
                  <div key={doc.path} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg group transition-colors ${
                    selectedDocs.has(doc.path) ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                  }`}>
                    <input type="checkbox" className="accent-blue-500 w-3.5 h-3.5 shrink-0"
                      checked={selectedDocs.has(doc.path)}
                      onChange={() => setSelectedDocs(prev => {
                        const n = new Set(prev);
                        n.has(doc.path) ? n.delete(doc.path) : n.add(doc.path);
                        return n;
                      })} />
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="flex-1 text-xs text-gray-800 truncate" title={doc.path}>{doc.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_COLORS.text}`}>{doc.type}</span>
                    {inActiveCol && <CheckCircle2 size={12} className="text-green-500 shrink-0" />}
                    <button className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 shrink-0"
                      onClick={() => removeDocument(doc.path)}><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── 图标视图（macOS 风格网格） ── */
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
              {/* Back to parent */}
              {currentFolderId !== null && (
                <div className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    const cur = folders.find(f => f.id === currentFolderId);
                    setCurrentFolderId(cur?.parentId ?? null);
                  }}>
                  <ChevronRight size={28} className="text-gray-300 rotate-180" />
                  <span className="text-[10px] text-gray-400">返回上级</span>
                </div>
              )}
              {/* Child folders */}
              {childFolders.map(folder => (
                <div key={folder.id}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer hover:bg-blue-50/60 transition-colors group relative"
                  onClick={() => setCurrentFolderId(folder.id)}
                  onContextMenu={e => handleFolderContextMenu(e, folder.id)}>
                  <div className="relative">
                    {getFolderIcon(folder.icon, folder.color, 32)}
                  </div>
                  {renamingFolderId === folder.id ? (
                    <input className="text-[10px] text-center bg-blue-100 rounded px-1 w-full outline-none" autoFocus
                      defaultValue={folder.name}
                      onBlur={e => handleRenameFolder(folder.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingFolderId(null); }}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <span className="text-[10px] text-gray-700 text-center truncate w-full" title={folder.name}>{folder.name}</span>
                  )}
                </div>
              ))}
              {/* Files */}
              {sortedDocs.map(doc => (
                <div key={doc.path}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-colors group relative ${
                    selectedDocs.has(doc.path) ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedDocs(prev => {
                    const n = new Set(prev);
                    n.has(doc.path) ? n.delete(doc.path) : n.add(doc.path);
                    return n;
                  })}>
                  <div className="relative">
                    <FileText size={28} className="text-gray-400" />
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-white bg-gray-500 rounded px-0.5 leading-tight">
                      {doc.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-700 text-center truncate w-full" title={doc.name}>{doc.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selection + move bar */}
        {selectedCount > 0 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 text-xs">
            <span className="text-gray-500">已选 {selectedCount} 个文件</span>
            <div className="flex items-center gap-2">
              <select className="text-[10px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 outline-none"
                onChange={e => { handleMoveDocsToFolder(e.target.value === '__root__' ? null : e.target.value); e.target.value = ''; }}
                defaultValue="">
                <option value="" disabled>移动到…</option>
                <option value="__root__">根目录</option>
                {folders.map(f => {
                  const ancestors = getAncestorPath(folders, f.id);
                  const pathStr = ancestors.map(a => a.name).join(' / ');
                  return <option key={f.id} value={f.id}>{pathStr}</option>;
                })}
              </select>
              <button className="text-red-400 hover:text-red-500 text-[10px]"
                onClick={() => {
                  setDocuments(prev => prev.filter(d => !selectedDocs.has(d.path)));
                  setCollections(prev => prev.map(c => ({
                    ...c, docPaths: c.docPaths.filter(p => !selectedDocs.has(p)),
                  })));
                  setSelectedDocs(new Set());
                }}>删除选中</button>
              <button className="text-gray-400 hover:text-gray-600 text-[10px]"
                onClick={() => setSelectedDocs(new Set())}>取消</button>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {buildProgress && (
          <div className="px-3 py-2 space-y-1 border-t border-gray-200">
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <Loader2 size={10} className="animate-spin shrink-0" />
              <span className="font-medium">
                {buildProgress.phase === 'loading' && '加载文档'}
                {buildProgress.phase === 'chunking' && '文本分块'}
                {buildProgress.phase === 'embedding' && '向量嵌入'}
                {buildProgress.phase === 'saving' && '保存索引'}
              </span>
              <span className="text-gray-400 truncate flex-1">{buildProgress.detail}</span>
              <span className="font-mono">{buildProgress.current}/{buildProgress.total}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${buildProgress.total > 0 ? Math.round(buildProgress.current / buildProgress.total * 100) : 0}%`,
                  background: buildProgress.phase === 'loading' ? '#3B82F6' : buildProgress.phase === 'chunking' ? '#10B981' : buildProgress.phase === 'embedding' ? '#F59E0B' : '#8B5CF6',
                }} />
            </div>
            {buildProgress.errors.length > 0 && (
              <div className="text-[10px] text-red-400 max-h-[40px] overflow-y-auto">
                {buildProgress.errors.slice(-3).map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Bottom action bar — 4 buttons */}
        <div className="p-3 pt-2 border-t border-gray-200 space-y-2">
          {/* Status line */}
          {!buildProgress && indexProgress && (
            <div className={`text-[10px] flex items-center gap-1 truncate ${indexStatus === 'error' ? 'text-red-400' : indexStatus === 'ready' ? 'text-green-500' : 'text-amber-500'}`}>
              {indexStatus === 'ready' && <CheckCircle2 size={10} className="shrink-0" />}
              {indexStatus === 'error' && <AlertCircle size={10} className="shrink-0" />}
              <span className="truncate">{indexProgress}</span>
            </div>
          )}
          {/* Context chips */}
          <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
            {activeCollection ? (
              <span className="flex items-center gap-1 bg-gray-50 rounded px-1.5 py-0.5 border border-gray-200"
                style={{ borderLeftColor: activeCollection.color, borderLeftWidth: 3 }}>
                {getCollectionIcon(activeCollection.icon, activeCollection.color, 10)}
                <span className="text-gray-600 truncate max-w-[80px]">{activeCollection.name}</span>
                {vectorStoreRef.current.size > 0 && <span className="text-gray-400">({vectorStoreRef.current.size})</span>}
              </span>
            ) : (
              <span className="text-gray-400 bg-gray-50 rounded px-1.5 py-0.5 border border-gray-200">未选集合</span>
            )}
            {selectedCount > 0 && (
              <span className="bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 border border-blue-200">
                {selectedCount} 文件
              </span>
            )}
            {activePreset && (
              <span className="bg-orange-50 text-orange-600 rounded px-1.5 py-0.5 border border-orange-200">
                预设: {activePreset === 'simple' ? '简单' : activePreset === 'balanced' ? '均衡' : '精确'}
              </span>
            )}
          </div>
          {/* Action buttons — 2 rows, mutually exclusive */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                isAnyBuildRunning || selectedCount === 0 || !activeCollectionId
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
              disabled={isAnyBuildRunning || selectedCount === 0 || !activeCollectionId}
              onClick={buildIndex}
            >
              {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              构建基本向量库{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
            <button
              className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                isAnyBuildRunning || !activeCollectionId
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
              disabled={isAnyBuildRunning || !activeCollectionId}
              onClick={updateConfig}
            >
              {updatingConfig ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              更新配置
            </button>
            <button
              className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                isAnyBuildRunning || !activeCollectionId || vectorStoreRef.current.size === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-500 text-white hover:bg-cyan-600'
              }`}
              disabled={isAnyBuildRunning || !activeCollectionId || vectorStoreRef.current.size === 0}
              onClick={buildHnswIndex}
            >
              {rebuildingHnsw ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
              构建 HNSW 索引
            </button>
            <button
              className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                isAnyBuildRunning || !activeCollectionId || vectorStoreRef.current.size === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              }`}
              disabled={isAnyBuildRunning || !activeCollectionId || vectorStoreRef.current.size === 0}
              onClick={buildKg}
            >
              {rebuildingKg ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
              构建知识图谱
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderEvalMetrics() {
    if (!evalMetrics) return null;
    const { scoreDistribution, avgScore, maxScore, minScore, scoreStdDev, retrievalMs, rerankMs, totalMs, totalResults, strategy } = evalMetrics;
    const maxBucket = Math.max(...scoreDistribution, 1);
    return (
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3">
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
          <span>检索: {retrievalMs.toFixed(0)}ms</span>
          <span>重排: {rerankMs.toFixed(0)}ms</span>
        </div>
      </div>
    );
  }

  function renderHelpModal() {
    if (!showHelp) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
        <div
          className="bg-white border border-gray-200 rounded-2xl w-[720px] max-h-[85vh] flex flex-col shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <HelpCircle size={20} className="text-blue-500" /> RAG Lab 知识手册
            </h2>
            <button className="text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setShowHelp(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {HELP_SECTIONS.map((section, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 mb-3">{section.title}</h3>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed font-sans">{section.content}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }



  // ── Main render ──
  return (
    <div className="h-full flex bg-white text-gray-800">
      {renderHelpModal()}
      {renderCollectionDetailModal()}
      {renderFolderContextMenu()}
      <VectorSearchModal
        isOpen={!!searchCollectionId}
        onClose={() => setSearchCollectionId(null)}
        initialCollectionId={searchCollectionId || ''}
        initialEmbeddingConfig={embeddingConfig}
        hideCollectionSelector
      />

      {/* Left: Collection List */}
      <div className="w-[240px] shrink-0 border-r border-gray-200 overflow-y-auto p-4 bg-white flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <button
              className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
              onClick={() => setShowHelp(true)}
              title="RAG Lab 知识手册"
            >
              <HelpCircle size={15} />
            </button>
          </div>
        </div>
        {renderCollectionPanel()}
      </div>

      {/* Right: Documents (top) + Config (bottom) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Right Top: Documents */}
        <div className={`${expandedPanel === 'docs' ? 'flex-1' : 'h-[45%]'} p-3 border-b border-gray-200`}>
          {renderDocumentsPanel()}
        </div>

        {/* Right Bottom: Configuration Panel — 2 columns */}
        {expandedPanel !== 'docs' && (
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="grid grid-cols-[1fr_320px] gap-4 h-full">
              {/* Left Column: Embedding → 文档处理 → 查询配置 → 查询流程 */}
              <div className="overflow-y-auto pr-2 space-y-1">
                <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-2 pb-1.5 border-b border-gray-100">
                  <SlidersHorizontal size={13} className="text-blue-500" /> 静态配置
                </div>
                {renderEmbeddingConfig()}
                <div className="border-t border-gray-100 pt-1" />
                {renderChunkingConfig()}
                {renderFormatChunkingConfig()}
                <div className="border-t border-gray-100 pt-1" />
                {renderPreRetrieval()}
                {renderRetrievalConfig()}
                {renderRerankerConfig()}
                <div className="border-t border-gray-100 pt-1" />
                {renderQueryModeConfig()}
              </div>

              {/* Right Column: 索引优化 → 预设配置 */}
              <div className="overflow-y-auto pl-3 border-l border-gray-100 space-y-1">
                {renderIndexOptimization()}
                <div className="border-t border-gray-100 pt-1" />
                {renderPresets()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
