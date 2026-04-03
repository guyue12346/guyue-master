/**
 * RAG LlamaIndex Module — Chunking Strategies
 *
 * ════════════════════════════════════════════════════════════════
 * 📚 深入讲解：文本分块（Chunking）
 * ════════════════════════════════════════════════════════════════
 *
 * 分块是 RAG 系统中对检索质量影响最大的环节。
 * 一个好的分块策略要平衡三个维度：
 *
 *   精度 ←───── 块大小 ─────→ 上下文
 *  (小块更精准)            (大块更完整)
 *
 *            ↑
 *          语义完整性
 *       (不要切断一个完整的概念)
 *
 * ════════════════════════════════════════════════════════════════
 * 策略 1️⃣：SentenceSplitter（句子分割器）
 * ════════════════════════════════════════════════════════════════
 *
 * 工作原理：
 * 1. 将文本按标点/换行拆成句子
 * 2. 贪心合并：不断往当前块追加句子，直到达到 chunkSize
 * 3. 新块开始时，把上一块的最后 overlap 个 token 复制过来
 *
 * 例子（chunkSize=10 words, overlap=3）：
 * 原文：  "猫坐在桌上。狗在地上跑。鸟在天上飞。鱼在水里游。"
 * Chunk 1: "猫坐在桌上。狗在地上跑。鸟在天上飞。"
 * Chunk 2: "鸟在天上飞。鱼在水里游。"
 *           ↑ overlap 部分
 *
 * 参数：
 * - chunkSize: 每块最大 token 数 (default 512)
 * - chunkOverlap: 重叠 token 数 (default 50)
 *
 * ════════════════════════════════════════════════════════════════
 * 策略 2️⃣：SentenceWindowNodeParser（滑动窗口）
 * ════════════════════════════════════════════════════════════════
 *
 * 这是 LlamaIndex 独创的高级策略，核心思想是"检索用小粒度，回答用大粒度"。
 *
 * 工作原理：
 * 1. 将文本拆成单个句子
 * 2. 每个句子创建一个 Node
 * 3. 每个 Node 的 metadata 里存储"窗口文本"——前后 N 句拼起来的上下文
 *
 * 例子（windowSize=1，即前后各 1 句）：
 * 句子: [S1, S2, S3, S4, S5]
 * Node for S3:
 *   - text (用于 embedding): "S3"      ← 精准匹配
 *   - window (用于 LLM):    "S2 S3 S4" ← 丰富上下文
 *
 * 为什么有效？
 * - Embedding 只对核心句做向量化 → 匹配精度高
 * - LLM 收到的是带上下文的窗口 → 回答质量高
 * - 相当于自动实现了"先精确定位，再展开上下文"
 *
 * 适用场景：FAQ、QA 问答、精确信息提取
 *
 * 参数：
 * - windowSize: 窗口半径（前后各取几句）(default 3)
 *
 * ════════════════════════════════════════════════════════════════
 * 策略 3️⃣：SemanticSplitterNodeParser（语义分割器）
 * ════════════════════════════════════════════════════════════════
 *
 * 最智能但最慢的策略，利用 Embedding 模型感知"话题转换"。
 *
 * 工作原理：
 * 1. 将文本拆成句子
 * 2. 对每个句子计算 Embedding 向量
 * 3. 计算相邻句子的余弦相似度
 * 4. 当相似度显著下降（低于 breakpoint 阈值）时，认为话题切换
 * 5. 在切换点分块
 *
 * 例子：
 * 句子:      [S1, S2, S3, S4, S5, S6]
 * 相似度:       0.9  0.8  0.3  0.85 0.7
 *                         ↑ 话题切换！
 * 结果: Chunk1=[S1,S2,S3], Chunk2=[S4,S5,S6]
 *
 * breakpointPercentile=95 意味着：
 *   计算所有相邻句对的相似度差值，
 *   当差值 > 第 95 百分位时，认为是切换点
 *
 * 为什么需要 bufferSize？
 *   计算相似度时，不是只看一句，而是看前后 buffer 句的"组合"。
 *   bufferSize=1 意味着比较 [S(i-1),S(i)] vs [S(i),S(i+1)]
 *   这样更稳健，不会因单句噪声误判。
 *
 * 注意事项：
 * - 每个句子都要调一次 Embedding API → 慢，有成本
 * - 块大小不可控 → 可能产生很小的碎片块
 * - 2026 benchmark 发现平均 43 token 的碎片块准确率只有 54%
 * - 建议设置最小块大小兜底
 */

import { Document, SentenceSplitter, Settings } from 'llamaindex';
import type { TextNode } from '@llamaindex/core/schema';
import { ChunkingConfig, ChunkMetadata } from './types';
import { DEFAULT_CHUNKING_CONFIG } from './config';
import { EmbeddingConfig } from './types';

// ════════════════════════════════════════════════════════════
// Sentence Splitter Strategy
// ════════════════════════════════════════════════════════════

/**
 * 使用 LlamaIndex 的 SentenceSplitter 进行基础分块
 *
 * 📚 LlamaIndex 的 SentenceSplitter 内部逻辑：
 * 1. 用正则/NLP 把文本拆成句子
 * 2. 估算每个句子的 token 数
 * 3. 贪心合并到 chunkSize 以内
 * 4. 相邻块之间保留 chunkOverlap 个 token 的重叠
 */
export function createSentenceSplitter(config: ChunkingConfig): SentenceSplitter {
  return new SentenceSplitter({
    chunkSize: config.chunkSize ?? DEFAULT_CHUNKING_CONFIG.chunkSize!,
    chunkOverlap: config.chunkOverlap ?? DEFAULT_CHUNKING_CONFIG.chunkOverlap!,
  });
}

/**
 * Progress callback for per-document chunking progress
 */
export type ChunkProgressCallback = (done: number, total: number, fileName?: string) => void;

/**
 * 用 SentenceSplitter 分块文档（异步，支持进度回调）
 */
export async function splitWithSentenceSplitter(
  documents: Document[],
  config: ChunkingConfig,
  onDocProgress?: ChunkProgressCallback,
): Promise<TextNode[]> {
  const splitter = createSentenceSplitter(config);
  const allNodes: TextNode[] = [];

  for (let d = 0; d < documents.length; d++) {
    const doc = documents[d];
    onDocProgress?.(d, documents.length, doc.metadata?.fileName);

    try {
      const nodes = splitter.getNodesFromDocuments([doc]);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i] as TextNode;
        node.metadata = {
          ...doc.metadata,
          ...node.metadata,
          chunkIndex: i,
          totalChunks: nodes.length,
          chunkingStrategy: 'sentence',
        };
        allNodes.push(node);
      }
    } catch (err: any) {
      console.warn(`Chunking failed for doc ${doc.metadata?.fileName}:`, err?.message);
    }

    // Yield to UI every document to prevent freezing on large files
    if (d % 3 === 2 || documents.length <= 10) await new Promise(r => setTimeout(r, 0));
  }

  onDocProgress?.(documents.length, documents.length);
  return allNodes;
}

// ════════════════════════════════════════════════════════════
// Sentence Window Strategy
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：手动实现 SentenceWindow
 * -----------------------------------
 * LlamaIndex Python 版有 SentenceWindowNodeParser，
 * TypeScript 版可能不完整，所以我们自己实现核心逻辑。
 *
 * 实现思路：
 * 1. 拆句子
 * 2. 每句创建一个 TextNode（text = 该句）
 * 3. metadata.window = 前后 N 句拼接的文本
 * 4. 检索时用 text 做 embedding 匹配
 * 5. 提交给 LLM 时用 window 字段
 */

function splitIntoSentences(text: string): string[] {
  // 支持中文标点和英文标点
  // 句号/问号/叹号/省略号 作为句子边界
  const sentences = text
    .split(/(?<=[。？！.!?\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return sentences;
}

export async function splitWithSentenceWindow(
  documents: Document[],
  config: ChunkingConfig,
  onDocProgress?: ChunkProgressCallback,
): Promise<TextNode[]> {
  const windowSize = config.windowSize ?? DEFAULT_CHUNKING_CONFIG.windowSize!;
  const allNodes: TextNode[] = [];

  for (let d = 0; d < documents.length; d++) {
    const doc = documents[d];
    onDocProgress?.(d, documents.length, doc.metadata?.fileName);
    const sentences = splitIntoSentences(doc.getText());
    if (sentences.length === 0) continue;

    for (let i = 0; i < sentences.length; i++) {
      const windowStart = Math.max(0, i - windowSize);
      const windowEnd = Math.min(sentences.length - 1, i + windowSize);
      const windowText = sentences.slice(windowStart, windowEnd + 1).join(' ');

      const nodeDoc = new Document({
        text: sentences[i],
        id_: `${doc.id_}_sw${i}`,
        metadata: {
          ...doc.metadata,
          window: windowText,
          windowSize,
          sentenceIndex: i,
          totalSentences: sentences.length,
          chunkIndex: i,
          totalChunks: sentences.length,
          chunkingStrategy: 'sentence-window',
        },
      });

      allNodes.push(nodeDoc as unknown as TextNode);
    }

    if (d % 10 === 9) await new Promise(r => setTimeout(r, 0));
  }

  onDocProgress?.(documents.length, documents.length);
  return allNodes;
}

// ════════════════════════════════════════════════════════════
// Semantic Splitter Strategy
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：语义分割的数学原理
 * ------------------------------
 * 给定句子序列 [S1, S2, ..., Sn]
 *
 * 1. 对每句计算 embedding: E(Si)
 * 2. 计算相邻对的余弦相似度: sim(i) = cos(E(Si), E(Si+1))
 * 3. 计算相似度差值（距离）: dist(i) = 1 - sim(i)
 * 4. 找到"显著断裂点"：dist(i) > percentile(all_dists, breakpointPercentile)
 * 5. 在断裂点处切分
 *
 * percentile 的含义：
 * breakpointPercentile=95 意味着只有 5% 最大的距离变化会被视为切分点。
 * 值越高 → 越不容易切 → 块越大
 * 值越低 → 越容易切 → 块越小
 */

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
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

/**
 * 计算百分位数
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Embedding 函数接口
 * 由调用者提供具体的 embedding 实现
 */
export type EmbedFunction = (text: string) => Promise<number[]>;

/**
 * 语义分割
 *
 * ⚠️ 注意：这个函数需要调用 Embedding API，是异步的且有成本。
 * 对于一篇 100 句的文章，会调 100 次 embedding。
 */
export async function splitWithSemantic(
  documents: Document[],
  config: ChunkingConfig,
  embedFn: EmbedFunction,
  onProgress?: (msg: string) => void,
): Promise<TextNode[]> {
  const breakpointPct = config.breakpointPercentile ?? DEFAULT_CHUNKING_CONFIG.breakpointPercentile!;
  const bufferSize = config.bufferSize ?? DEFAULT_CHUNKING_CONFIG.bufferSize!;
  const minChunkSize = 80; // 最小块大小（字符数），防止过度碎片化
  const allNodes: TextNode[] = [];

  for (const doc of documents) {
    const sentences = splitIntoSentences(doc.getText());
    if (sentences.length <= 1) {
      // 单句直接作为一个块
      allNodes.push(new Document({
        text: doc.getText(),
        id_: `${doc.id_}_sem0`,
        metadata: { ...doc.metadata, chunkIndex: 0, totalChunks: 1, chunkingStrategy: 'semantic' },
      }) as unknown as TextNode);
      continue;
    }

    onProgress?.(`🔍 语义分析: ${doc.metadata?.fileName || 'unknown'} (${sentences.length} 句)...`);

    // Step 1: 计算每句的 embedding
    const embeddings: number[][] = [];
    for (let i = 0; i < sentences.length; i++) {
      // 使用 buffer: 把当前句和前后句拼起来一起 embed
      const start = Math.max(0, i - bufferSize);
      const end = Math.min(sentences.length, i + bufferSize + 1);
      const combinedText = sentences.slice(start, end).join(' ');
      embeddings.push(await embedFn(combinedText));
    }

    // Step 2: 计算相邻句的语义距离
    const distances: number[] = [];
    for (let i = 0; i < embeddings.length - 1; i++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[i + 1]);
      distances.push(1 - sim); // 距离 = 1 - 相似度
    }

    // Step 3: 找断裂点
    const threshold = percentile(distances, breakpointPct);
    const breakpoints: number[] = [];
    for (let i = 0; i < distances.length; i++) {
      if (distances[i] > threshold) {
        breakpoints.push(i + 1); // 在第 i+1 句之前切分
      }
    }

    // Step 4: 根据断裂点分块
    const chunks: string[][] = [];
    let chunkStart = 0;
    for (const bp of breakpoints) {
      chunks.push(sentences.slice(chunkStart, bp));
      chunkStart = bp;
    }
    chunks.push(sentences.slice(chunkStart));

    // Step 5: 合并太小的块（防碎片化）
    const mergedChunks: string[][] = [];
    let currentMerge: string[] = [];
    for (const chunk of chunks) {
      const text = chunk.join(' ');
      if (currentMerge.length > 0 && text.length < minChunkSize) {
        currentMerge.push(...chunk);
      } else {
        if (currentMerge.length > 0) mergedChunks.push(currentMerge);
        currentMerge = [...chunk];
      }
    }
    if (currentMerge.length > 0) mergedChunks.push(currentMerge);

    // Step 6: 创建节点
    for (let i = 0; i < mergedChunks.length; i++) {
      const chunkText = mergedChunks[i].join(' ');
      allNodes.push(new Document({
        text: chunkText,
        id_: `${doc.id_}_sem${i}`,
        metadata: {
          ...doc.metadata,
          chunkIndex: i,
          totalChunks: mergedChunks.length,
          chunkingStrategy: 'semantic',
        },
      }) as unknown as TextNode);
    }

    onProgress?.(`  ✅ ${doc.metadata?.fileName}: ${mergedChunks.length} 个语义块`);
  }

  return allNodes;
}

// ════════════════════════════════════════════════════════════
// Unified Chunking Interface (统一分块接口)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：策略模式（Strategy Pattern）
 * ----------------------------------------
 * 三种分块策略有相同的输入输出，但不同的算法。
 * 通过统一接口，调用者不需要关心具体用哪种策略——
 * 只需传入 config.strategy 即可。
 *
 * 这是 GoF 设计模式中的"策略模式"。
 */
export async function chunkDocuments(
  documents: Document[],
  config: ChunkingConfig,
  embedFn?: EmbedFunction,
  onProgress?: (msg: string) => void,
  onDocProgress?: ChunkProgressCallback,
): Promise<TextNode[]> {
  // 如果配置了 formatOverrides，委托给格式感知分块器
  // 延迟导入避免循环依赖
  if (config.formatOverrides) {
    onProgress?.(`🔀 启用格式感知分块，按文件类型分组处理…`);
    const { chunkDocumentsByFormat } = await import('./formatChunking');
    return chunkDocumentsByFormat(documents, config, embedFn, onProgress);
  }

  const strategy = config.strategy ?? 'sentence';

  onProgress?.(`📄 分块策略: ${strategy}，共 ${documents.length} 个文档`);
  // Yield to UI so progress message renders before heavy computation
  await new Promise(r => setTimeout(r, 0));

  switch (strategy) {
    case 'sentence':
      onProgress?.(`  参数: chunkSize=${config.chunkSize ?? 512}, overlap=${config.chunkOverlap ?? 50}`);
      return splitWithSentenceSplitter(documents, config, onDocProgress);

    case 'sentence-window':
      onProgress?.(`  参数: windowSize=${config.windowSize ?? 3}`);
      return splitWithSentenceWindow(documents, config, onDocProgress);

    case 'semantic':
      if (!embedFn) {
        throw new Error('语义分割需要 Embedding 函数。请配置 Embedding 模型后重试。');
      }
      onProgress?.(`  参数: breakpoint=${config.breakpointPercentile ?? 95}%, buffer=${config.bufferSize ?? 1}`);
      return splitWithSemantic(documents, config, embedFn, onProgress);

    default:
      throw new Error(`Unknown chunking strategy: ${strategy}`);
  }
}
