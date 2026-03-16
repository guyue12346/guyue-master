/**
 * RAG 服务：文本分块、Gemini Embedding、余弦相似度检索
 * 使用 Gemini text-embedding-004 API（768 维向量）
 */
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs worker（在 Electron 渲染进程中禁用独立 worker，使用内联假 worker 避免跨域）
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export interface RagChunk {
  fileId: string;
  fileName: string;
  filePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
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

/** 调用 Gemini gemini-embedding-001 获取向量 */
export async function getGeminiEmbedding(text: string, apiKey: string, baseUrl?: string): Promise<number[]> {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const response = await fetch(
    `${base}/v1beta/models/gemini-embedding-001:embedContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
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

/** 从 PDF 文件提取纯文本（逐页提取，合并所有 TextItem） */
async function extractPdfText(filePath: string): Promise<string> {
  const electronAPI = (window as any).electronAPI;
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

/**
 * 增量构建/更新索引：只为尚未建立索引的文件生成 embedding
 * @param kbFiles       知识库文件列表（{id, name, path}）
 * @param existingIndex 已有索引（会保留 kbFiles 中的条目）
 * @param apiKey        Gemini API Key
 * @param onProgress    进度回调字符串
 */
export async function buildIndex(
  kbFiles: Array<{ id: string; name: string; path: string }>,
  existingIndex: RagIndex,
  apiKey: string,
  onProgress?: (msg: string) => void,
  baseUrl?: string,
): Promise<RagIndex> {
  const electronAPI = (window as any).electronAPI;
  const kbFileIdSet = new Set(kbFiles.map(f => f.id));

  // 过滤掉已不在 KB 中的旧条目
  const filteredExisting = existingIndex.filter(c => kbFileIdSet.has(c.fileId));
  const indexedFileIds = new Set(filteredExisting.map(c => c.fileId));

  const newChunks: RagChunk[] = [];

  for (const file of kbFiles) {
    if (indexedFileIds.has(file.id)) {
      onProgress?.(`✓ 已有索引：${file.name}`);
      continue;
    }

    onProgress?.(`正在索引：${file.name}...`);
    try {
      let content: string | null = null;
      const ext = file.path.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf') {
        // PDF：用 pdfjs 提取文本
        try {
          content = await extractPdfText(file.path);
        } catch (pdfErr) {
          onProgress?.(`⚠️ PDF 解析失败，跳过：${file.name} — ${(pdfErr as Error).message}`);
          continue;
        }
      } else {
        // 文本文件：直接 UTF-8 读取
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
        const embedding = await getGeminiEmbedding(chunks[i], apiKey, baseUrl);
        newChunks.push({
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          chunkIndex: i,
          text: chunks[i],
          embedding,
        });
      }

      onProgress?.(`✅ 已索引：${file.name}（${chunks.length} 块）`);
    } catch (e) {
      onProgress?.(`❌ 索引失败：${file.name} — ${(e as Error).message}`);
    }
  }

  return [...filteredExisting, ...newChunks];
}

/**
 * 语义检索：embed 查询 → 余弦相似度排序 → topK 结果
 */
export async function searchIndex(
  query: string,
  index: RagIndex,
  apiKey: string,
  topK = 5,
  baseUrl?: string,
): Promise<SearchResult[]> {
  if (index.length === 0) return [];

  const qEmbedding = await getGeminiEmbedding(query, apiKey, baseUrl);

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
