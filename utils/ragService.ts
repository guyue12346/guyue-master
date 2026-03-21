/**
 * RAG 服务：文本分块、多模型 Embedding、余弦相似度检索
 * 支持 Gemini、Qwen（阿里云百练）、OpenAI 兼容（OpenAI/DeepSeek/智谱/Moonshot/MiniMax）等 Embedding 提供商
 */
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs worker（在 Electron 渲染进程中禁用独立 worker，使用内联假 worker 避免跨域）
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// ── Embedding 配置 ──
export interface EmbeddingConfig {
  provider: string;   // 'gemini' | 'qwen' | 'openai' | 'zhipu' | 'custom-openai'
  model: string;      // e.g. 'gemini-embedding-001', 'text-embedding-v3'
  apiKey: string;
  baseUrl?: string;
}

// ── 可选 Embedding 模型列表 ──
export interface EmbeddingModelDef {
  id: string;
  name: string;
  provider: string;
  dimensions?: number;
  description?: string;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModelDef[]> = {
  gemini: [
    { id: 'gemini-embedding-exp-03-07', name: 'Gemini Embedding Exp 03-07', provider: 'gemini', dimensions: 3072, description: '最新·推荐' },
    { id: 'text-embedding-004', name: 'Text Embedding 004', provider: 'gemini', dimensions: 768, description: '稳定版' },
    { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', provider: 'gemini', dimensions: 768, description: '旧版' },
  ],
  qwen: [
    { id: 'text-embedding-v3', name: 'text-embedding-v3', provider: 'qwen', dimensions: 1024, description: '最新·推荐' },
    { id: 'text-embedding-v2', name: 'text-embedding-v2', provider: 'qwen', dimensions: 1536 },
    { id: 'text-embedding-v1', name: 'text-embedding-v1', provider: 'qwen', dimensions: 1536 },
  ],
  openai: [
    { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small', provider: 'openai', dimensions: 1536, description: '性价比' },
    { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', provider: 'openai', dimensions: 3072, description: '最强' },
    { id: 'text-embedding-ada-002', name: 'Ada 002', provider: 'openai', dimensions: 1536 },
  ],
  zhipu: [
    { id: 'embedding-3', name: 'Embedding-3', provider: 'zhipu', dimensions: 2048, description: '最新' },
    { id: 'embedding-2', name: 'Embedding-2', provider: 'zhipu', dimensions: 1024 },
  ],
  'custom-openai': [],
};

export const EMBEDDING_PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Google Gemini',
  qwen: '通义千问 (阿里云)',
  openai: 'OpenAI',
  zhipu: '智谱 GLM',
  'custom-openai': '自定义 (OpenAI 兼容)',
};

// ── 索引元数据（用于跟踪索引状态） ──
export interface RagIndexMeta {
  embeddingProvider: string;
  embeddingModel: string;
  builtAt: number;        // 索引最后构建时间
  fileCount: number;      // 索引中的文件数
  chunkCount: number;     // 分块总数
}

export interface RagChunk {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  indexedAt?: number; // 索引构建时间戳（ms），用于检测文件更新
}

export type RagIndex = RagChunk[];

export interface SearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  score: number;
}

const RAG_INDEX_KEY = 'rag-index';

/** 将文本按段落边界分割为重叠块 */
export function chunkText(text: string, maxChunkSize = 800, overlap = 100): string[] {
  // 按段落边界优先分割（连续换行）
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? current + '\n\n' + para : para;
    if (candidate.length > maxChunkSize) {
      if (current.trim()) {
        chunks.push(current.trim());
        // 携带 overlap 部分到下一块
        const tail = current.slice(-overlap);
        current = tail + '\n\n' + para;
      } else {
        // 单个段落超长，强制按字符分割
        for (let i = 0; i < para.length; i += maxChunkSize - overlap) {
          const slice = para.slice(i, i + maxChunkSize).trim();
          if (slice.length > 20) chunks.push(slice);
        }
        current = '';
      }
    } else {
      current = candidate;
    }
  }

  if (current.trim().length > 20) chunks.push(current.trim());
  return chunks.filter(c => c.length > 20);
}

/** 调用 Gemini Embedding API
 *  - taskType=RETRIEVAL_DOCUMENT 对 RAG 场景有更好的召回效果
 *  - gemini-embedding-exp-03-07 支持最高 3072 维（outputDimensionality 参数）
 */
async function getGeminiEmbedding(text: string, apiKey: string, model: string, baseUrl?: string): Promise<number[]> {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const body: Record<string, unknown> = {
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  };
  // gemini-embedding-exp-03-07 支持高维度，设为 1536 兼顾效果与存储
  if (model === 'gemini-embedding-exp-03-07') {
    body.outputDimensionality = 1536;
  }
  const response = await fetch(
    `${base}/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini Embedding API 错误 ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const values: number[] | undefined = data?.embedding?.values;
  if (!values || values.length === 0) throw new Error('Embedding API 返回了空向量');
  return values;
}

/** 调用 OpenAI 兼容 Embedding API（适用 OpenAI / 智谱 / 自定义） */
async function getOpenAIEmbedding(text: string, apiKey: string, model: string, baseUrl: string): Promise<number[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ input: text, model }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Embedding API 错误 ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const values: number[] | undefined = data?.data?.[0]?.embedding;
  if (!values || values.length === 0) throw new Error('Embedding API 返回了空向量');
  return values;
}

/** 根据配置获取 Embedding 向量（统一入口） */
export async function getEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  const { provider, model, apiKey, baseUrl } = config;
  if (provider === 'gemini') {
    return getGeminiEmbedding(text, apiKey, model, baseUrl);
  }
  // qwen：阿里云百炼 DashScope OpenAI 兼容接口
  if (provider === 'qwen') {
    const base = baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode';
    return getOpenAIEmbedding(text, apiKey, model, base);
  }
  // OpenAI 兼容（openai / zhipu / custom-openai）
  const defaultBaseUrls: Record<string, string> = {
    openai: 'https://api.openai.com',
    zhipu: 'https://open.bigmodel.cn/api/paas',
    'custom-openai': '',
  };
  const base = baseUrl || defaultBaseUrls[provider] || '';
  if (!base) throw new Error('请配置 Embedding API 的 Base URL');
  return getOpenAIEmbedding(text, apiKey, model, base);
}

/** 从 PDF 文件提取纯文本（优先通过主进程 IPC，绕开 Windows Web Worker 限制） */
async function extractPdfText(filePath: string): Promise<string> {
  const electronAPI = (window as any).electronAPI;

  // 首选：主进程（Node.js）提取，完全避开 Web Worker，跨平台可靠
  if (electronAPI?.extractPdfText) {
    const mainText = await electronAPI.extractPdfText(filePath);
    if (mainText && typeof mainText === 'string' && mainText.trim()) return mainText;
  }

  // 回退：渲染进程提取（使用 pdfjs FakeWorker）
  const base64: string | null = electronAPI?.readFileBase64
    ? await electronAPI.readFileBase64(filePath)
    : null;

  if (!base64) throw new Error('无法读取 PDF 文件');

  // base64 → Uint8Array
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pageTexts.push(`[第${pageNum}页]\n${pageText}`);
  }

  return pageTexts.join('\n\n');
}

/** 余弦相似度（两向量必须同维度） */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** 从持久化存储加载索引 */
export async function loadRagIndex(): Promise<RagIndex> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.loadAppData) {
    try {
      const data = await electronAPI.loadAppData(RAG_INDEX_KEY);
      if (Array.isArray(data)) return data as RagIndex;
    } catch {}
  }
  // 回退到 localStorage（不存大型 embedding，仅作后备）
  try {
    const saved = localStorage.getItem(`guyue_${RAG_INDEX_KEY}`);
    if (saved) return JSON.parse(saved) as RagIndex;
  } catch {}
  return [];
}

/** 持久化索引 */
export async function saveRagIndex(index: RagIndex): Promise<void> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.saveAppData) {
    await electronAPI.saveAppData(RAG_INDEX_KEY, index);
  }
}

/** 加载索引元数据 */
export async function loadRagIndexMeta(): Promise<RagIndexMeta | null> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.loadAppData) {
    try {
      const data = await electronAPI.loadAppData('rag-index-meta');
      if (data && typeof data === 'object') return data as RagIndexMeta;
    } catch {}
  }
  try {
    const saved = localStorage.getItem('guyue_rag-index-meta');
    if (saved) return JSON.parse(saved) as RagIndexMeta;
  } catch {}
  return null;
}

/** 保存索引元数据 */
export async function saveRagIndexMeta(meta: RagIndexMeta): Promise<void> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.saveAppData) {
    await electronAPI.saveAppData('rag-index-meta', meta);
  }
  localStorage.setItem('guyue_rag-index-meta', JSON.stringify(meta));
}

/**
 * 检查索引状态：返回需要更新的文件和过期的文件
 */
export async function checkIndexStatus(
  kbFiles: Array<{ id: string; name: string; path: string }>,
  existingIndex: RagIndex,
): Promise<{ newFiles: string[]; staleFiles: string[]; removedFiles: string[]; upToDate: boolean }> {
  const electronAPI = (window as any).electronAPI;
  const kbFileIdSet = new Set(kbFiles.map(f => f.id));
  const indexedFileIds = new Set(existingIndex.map(c => c.fileId));
  
  const newFiles: string[] = [];
  const staleFiles: string[] = [];
  const removedFiles: string[] = [];
  
  // 新文件：在 KB 中但未索引
  for (const f of kbFiles) {
    if (!indexedFileIds.has(f.id)) newFiles.push(f.name);
  }
  
  // 过期文件：已索引但文件修改时间晚于索引时间
  if (electronAPI?.getFileMtime) {
    for (const file of kbFiles) {
      if (!indexedFileIds.has(file.id)) continue;
      const chunk = existingIndex.find(c => c.fileId === file.id);
      if (!chunk?.indexedAt) continue;
      try {
        const mtime = await electronAPI.getFileMtime(file.path);
        if (mtime && mtime > chunk.indexedAt) staleFiles.push(file.name);
      } catch {}
    }
  }
  
  // 已删除文件：在索引中但不在 KB 中
  const removedIds = new Set<string>();
  for (const c of existingIndex) {
    if (!kbFileIdSet.has(c.fileId) && !removedIds.has(c.fileId)) {
      removedIds.add(c.fileId);
      removedFiles.push(c.fileName);
    }
  }
  
  return {
    newFiles,
    staleFiles,
    removedFiles,
    upToDate: newFiles.length === 0 && staleFiles.length === 0 && removedFiles.length === 0,
  };
}

/** 从索引中移除指定文件的所有分块 */
export async function removeFileFromIndex(fileId: string): Promise<void> {
  const index = await loadRagIndex();
  const filtered = index.filter(c => c.fileId !== fileId);
  if (filtered.length !== index.length) {
    await saveRagIndex(filtered);
  }
}

/** 使文件索引失效（删除该文件的分块，下次查询时会重新构建） */
export async function invalidateFileIndex(fileId: string): Promise<void> {
  return removeFileFromIndex(fileId);
}

/**
 * 增量构建/更新索引：只为尚未建立索引的文件生成 embedding
 * @param kbFiles          知识库文件列表
 * @param existingIndex    已有索引
 * @param embeddingConfig  Embedding 配置（多提供商）
 * @param onProgress       进度回调字符串
 */
export async function buildIndex(
  kbFiles: Array<{ id: string; name: string; path: string }>,
  existingIndex: RagIndex,
  embeddingConfig: EmbeddingConfig,
  onProgress?: (msg: string) => void,
): Promise<RagIndex> {
  const electronAPI = (window as any).electronAPI;
  const kbFileIdSet = new Set(kbFiles.map(f => f.id));

  // 过滤掉已不在 KB 中的旧条目
  const filteredExisting = existingIndex.filter(c => kbFileIdSet.has(c.fileId));
  const indexedFileIds = new Set(filteredExisting.map(c => c.fileId));

  // 检测已索引文件是否有更新（对比文件修改时间与索引时间）
  const staleFileIds = new Set<string>();
  if (electronAPI?.getFileMtime) {
    for (const file of kbFiles) {
      if (!indexedFileIds.has(file.id)) continue;
      const chunk = filteredExisting.find(c => c.fileId === file.id);
      if (!chunk?.indexedAt) continue;
      try {
        const mtime = await electronAPI.getFileMtime(file.path);
        if (mtime && mtime > chunk.indexedAt) {
          staleFileIds.add(file.id);
          onProgress?.(`🔄 检测到更新：${file.name}`);
        }
      } catch {}
    }
  }

  // 移除过期文件的旧分块
  const cleanedExisting = filteredExisting.filter(c => !staleFileIds.has(c.fileId));

  const newChunks: RagChunk[] = [];

  for (const file of kbFiles) {
    if (indexedFileIds.has(file.id) && !staleFileIds.has(file.id)) {
      onProgress?.(`✓ 已有索引：${file.name}`);
      continue;
    }

    onProgress?.(`正在索引：${file.name}...`);
    try {
      let content: string | null = null;
      const ext = file.path.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        try {
          content = await extractPdfText(file.path);
        } catch (pdfErr) {
          onProgress?.(`⚠️ PDF 解析失败，跳过：${file.name} — ${(pdfErr as Error).message}`);
          continue;
        }
      } else {
        if (electronAPI?.readFile) {
          content = await electronAPI.readFile(file.path);
        }
      }

      if (!content || typeof content !== 'string') {
        onProgress?.(`⚠️ 跳过（无法读取）：${file.name}`);
        continue;
      }

      const chunks = chunkText(content);
      if (chunks.length === 0) {
        onProgress?.(`⚠️ 跳过（内容为空）：${file.name}`);
        continue;
      }

      for (let i = 0; i < chunks.length; i++) {
        const embedding = await getEmbedding(chunks[i], embeddingConfig);
        newChunks.push({
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          chunkIndex: i,
          text: chunks[i],
          embedding,
          indexedAt: Date.now(),
        });
      }

      onProgress?.(`✅ 已索引：${file.name}（${chunks.length} 块）`);
    } catch (e) {
      onProgress?.(`❌ 索引失败：${file.name} — ${(e as Error).message}`);
    }
  }

  return [...cleanedExisting, ...newChunks];
}

/**
 * 语义检索：embed 查询 → 余弦相似度排序 → topK 结果
 */
export async function searchIndex(
  query: string,
  index: RagIndex,
  embeddingConfig: EmbeddingConfig,
  topK = 5,
): Promise<SearchResult[]> {
  if (index.length === 0) return [];

  const qEmbedding = await getEmbedding(query, embeddingConfig);

  const scored = index.map(chunk => ({
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    filePath: chunk.filePath,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    score: cosineSimilarity(qEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}
