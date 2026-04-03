/**
 * RAG LlamaIndex Module — Metadata Enrichment
 *
 * 📚 知识点：元数据在 RAG 中的三层作用
 * ======================================
 *
 * 第一层：检索过滤（Pre-retrieval Filtering）
 * ─────────────────────────────────────────────
 * 在向量搜索之前，先用元数据缩小搜索范围。
 * 例如：用户问"summarize chapter 3" → 先过滤 pageNumber 在第3章范围的块
 * 这大幅减少了需要做向量比较的块数，提高速度和准确度。
 *
 * 第二层：来源追溯（Source Attribution）
 * ──────────────────────────────────────
 * 在回答中标注"根据 xxx.pdf 第5页"。
 * 这对于知识库系统极其重要——用户需要验证 AI 的回答。
 * 没有来源的回答和幻觉（hallucination）无法区分。
 *
 * 第三层：上下文增强（Context Augmentation）
 * ──────────────────────────────────────────
 * 元数据本身可以作为 LLM 的额外上下文。
 * 例如：LLM 看到 metadata.sectionTitle="机器学习概论" 时，
 * 就知道这段文字属于 ML 领域，即使文本本身没有提到 ML。
 *
 * 📚 知识点：LlamaIndex 中的 metadata 处理
 * ─────────────────────────────────────────
 * LlamaIndex 的 TextNode.metadata 是 Record<string, any>。
 * 在 embedding 时，metadata 默认会被拼接到文本前面一起向量化！
 * 这意味着 metadata 的内容会影响检索结果。
 *
 * 例如，如果 metadata = { sectionTitle: "深度学习基础" }
 * 实际被 embed 的文本会变成：
 *   "sectionTitle: 深度学习基础\n\n实际文本内容..."
 *
 * 可以通过 excludedEmbedMetadataKeys 控制哪些 key 不参与 embedding。
 * 可以通过 excludedLlmMetadataKeys 控制哪些 key 不发送给 LLM。
 */

import type { TextNode } from '@llamaindex/core/schema';
import { ChunkMetadata } from './types';

// ════════════════════════════════════════════════════════════
// Metadata Keys Classification
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：选择性暴露元数据
 * ---------------------------
 * 不是所有元数据都应该参与 embedding 或发送给 LLM。
 *
 * 参与 Embedding 的（影响检索）：
 *   - sectionTitle: "章节名" → 让搜索能匹配到章节
 *   - codeLanguage: "python" → 让搜索 "python代码" 能命中
 *
 * 不参与 Embedding 的（只做过滤/展示）：
 *   - filePath: 太长，稀释语义
 *   - fileSize: 对检索无意义
 *   - indexedAt: 时间戳对语义无关
 *
 * 发送给 LLM 的（帮助回答）：
 *   - fileName, sectionTitle, pageNumber: 帮助 LLM 定位
 *
 * 不发送给 LLM 的（节省 token）：
 *   - fileSize, indexedAt, embeddingModel: LLM 不需要
 */

export const EMBED_INCLUDE_KEYS = [
  'sectionTitle',
  'sectionLevel',
  'codeLanguage',
  'functionName',
  'className',
  'language',
];

export const EMBED_EXCLUDE_KEYS = [
  'filePath',
  'fileSize',
  'fileType',
  'indexedAt',
  'embeddingModel',
  'chunkIndex',
  'totalChunks',
  'parentDocId',
  'lineStart',
  'lineEnd',
  'window',          // SentenceWindow 的窗口文本不参与核心句的 embedding
  'windowSize',
  'sentenceIndex',
  'totalSentences',
  'chunkingStrategy',
];

export const LLM_EXCLUDE_KEYS = [
  'fileSize',
  'indexedAt',
  'embeddingModel',
  'chunkIndex',
  'totalChunks',
  'parentDocId',
  'windowSize',
  'sentenceIndex',
  'totalSentences',
  'chunkingStrategy',
];

// ════════════════════════════════════════════════════════════
// Language Detection (简单语言检测)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：为什么要检测语言？
 * ----------------------------
 * 不同语言的文本处理策略不同：
 * - 中文：没有空格分隔词，句子以。？！结尾
 * - 英文：空格分词，句子以 .?! 结尾
 * - 日文：混合使用汉字+平假名+片假名
 *
 * 语言信息作为元数据也可以用于过滤：
 * "只搜索中文文档" 或 "找英文资料"
 */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 500);
  // Count CJK characters
  const cjkCount = (sample.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  // Count Japanese-specific chars
  const jpCount = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  // Count Korean
  const krCount = (sample.match(/[\uac00-\ud7af]/g) || []).length;
  // Count Latin
  const latinCount = (sample.match(/[a-zA-Z]/g) || []).length;

  const total = sample.length || 1;
  if (jpCount / total > 0.1) return 'ja';
  if (krCount / total > 0.1) return 'ko';
  if (cjkCount / total > 0.2) return 'zh';
  if (latinCount / total > 0.3) return 'en';
  return 'unknown';
}

// ════════════════════════════════════════════════════════════
// Metadata Enrichment Pipeline
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：流水线模式（Pipeline Pattern）
 * ------------------------------------------
 * 元数据丰富化是一个多步骤过程，每步独立、可组合：
 *
 *   原始节点
 *     → 语言检测
 *     → 内容摘要（可选）
 *     → 排除 key 设置
 *     → 丰富化后的节点
 *
 * 每个步骤都是纯函数：输入节点，输出修改后的节点。
 * 这种设计方便添加新的丰富化步骤。
 */

/**
 * 为节点添加语言检测元数据
 */
export function enrichWithLanguage(nodes: TextNode[]): TextNode[] {
  for (const node of nodes) {
    if (!node.metadata.language) {
      node.metadata.language = detectLanguage(node.getText());
    }
  }
  return nodes;
}

/**
 * 为节点设置 Embedding 排除键
 *
 * 📚 这告诉 LlamaIndex：在计算 embedding 时，
 * 不要把 filePath、fileSize 等无关信息拼到文本里。
 * 但 sectionTitle 等语义丰富的字段会保留。
 */
export function setMetadataExclusions(nodes: TextNode[]): TextNode[] {
  for (const node of nodes) {
    // LlamaIndex TextNode 支持这些属性来控制元数据暴露
    if ('excludedEmbedMetadataKeys' in node) {
      (node as any).excludedEmbedMetadataKeys = EMBED_EXCLUDE_KEYS;
    }
    if ('excludedLlmMetadataKeys' in node) {
      (node as any).excludedLlmMetadataKeys = LLM_EXCLUDE_KEYS;
    }
  }
  return nodes;
}

/**
 * 为节点添加 embedding 模型信息
 */
export function enrichWithEmbeddingInfo(
  nodes: TextNode[],
  embeddingModel: string,
): TextNode[] {
  const now = Date.now();
  for (const node of nodes) {
    node.metadata.embeddingModel = embeddingModel;
    node.metadata.indexedAt = now;
  }
  return nodes;
}

/**
 * 📚 完整元数据丰富化流水线
 *
 * 调用顺序很重要：
 * 1. 先检测语言（因为后续可能根据语言调整策略）
 * 2. 添加 embedding 信息
 * 3. 最后设置排除键（应该在所有元数据都添加完之后）
 */
export function enrichMetadata(
  nodes: TextNode[],
  embeddingModel: string,
): TextNode[] {
  let enriched = nodes;
  enriched = enrichWithLanguage(enriched);
  enriched = enrichWithEmbeddingInfo(enriched, embeddingModel);
  enriched = setMetadataExclusions(enriched);
  return enriched;
}

// ════════════════════════════════════════════════════════════
// Metadata Validation (元数据验证)
// ════════════════════════════════════════════════════════════

/**
 * 验证节点的元数据是否完整
 * 返回缺失的必要字段列表
 */
export function validateMetadata(node: TextNode): string[] {
  const missing: string[] = [];
  const meta = node.metadata;

  if (!meta.fileName) missing.push('fileName');
  if (!meta.filePath) missing.push('filePath');
  if (!meta.fileType) missing.push('fileType');
  if (meta.chunkIndex === undefined) missing.push('chunkIndex');
  if (!meta.parentDocId) missing.push('parentDocId');

  return missing;
}

/**
 * 生成人类可读的节点摘要（用于调试和日志）
 */
export function describeNode(node: TextNode): string {
  const m = node.metadata;
  const text = node.getText();
  const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
  return [
    `[${m.fileType || '?'}]`,
    m.fileName || '?',
    m.sectionTitle ? `§${m.sectionTitle}` : '',
    m.pageNumber ? `p.${m.pageNumber}` : '',
    `chunk ${m.chunkIndex ?? '?'}/${m.totalChunks ?? '?'}`,
    `"${preview}"`,
  ].filter(Boolean).join(' ');
}
