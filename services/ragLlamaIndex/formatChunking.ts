/**
 * RAG LlamaIndex Module — Format-Aware Chunking (格式感知分块)
 *
 * ════════════════════════════════════════════════════════════════
 * 📚 知识点：为什么需要格式感知分块？
 * ════════════════════════════════════════════════════════════════
 *
 * 通用分块（SentenceSplitter / SemanticSplitter）把所有文档视为"纯文本"，
 * 忽略了不同格式自带的结构信息。这会导致：
 *
 * 问题 1：Markdown 的标题层级被切断
 *   原文：  "# 第一章\n## 1.1 背景\n内容..."
 *   通用分块可能在 "1.1 背景" 中间切断，丢失章节上下文
 *
 * 问题 2：PDF 的页面边界被忽略
 *   跨页的段落被合并或在错误位置切分
 *
 * 问题 3：代码的函数边界被破坏
 *   一个函数被切成两半，两个块都不完整
 *
 * 解决思路：针对每种格式，利用其原生结构来指导分块位置。
 *
 * ════════════════════════════════════════════════════════════════
 * 本文件实现四种格式感知分块器：
 * 1. Markdown → 按标题层级分块
 * 2. PDF      → 按页面/段落分块
 * 3. HTML     → 按 DOM 语义标签分块
 * 4. Code     → 按函数/类边界分块
 *
 * 以及一个统一调度器 chunkDocumentsByFormat()
 * ════════════════════════════════════════════════════════════════
 */

import { Document, SentenceSplitter } from 'llamaindex';
import type { TextNode } from '@llamaindex/core/schema';
import {
  ChunkingConfig,
  MarkdownChunkingConfig,
  PdfChunkingConfig,
  HtmlChunkingConfig,
  CodeChunkingConfig,
  SupportedDocType,
} from './types';
import { DEFAULT_CHUNKING_CONFIG } from './config';
import { chunkDocuments, type EmbedFunction } from './chunking';

// ════════════════════════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════════════════════════

/**
 * 当单个块超出 chunkSize 时，用 SentenceSplitter 进一步拆分
 */
function fallbackSplit(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (text.length <= chunkSize) return [text];
  const splitter = new SentenceSplitter({ chunkSize, chunkOverlap });
  const docs = [new Document({ text, id_: '_fallback' })];
  const nodes = splitter.getNodesFromDocuments(docs);
  return nodes.map(n => (n as unknown as { getText(): string }).getText());
}

// ════════════════════════════════════════════════════════════
// 1️⃣  Markdown 标题分块
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：Markdown 标题分块
 * ────────────────────────────
 * Markdown 最天然的结构就是标题层级：
 *   # 一级标题
 *   ## 二级标题
 *   ### 三级标题
 *
 * 按标题切分的好处：
 * 1. 每个块是一个完整的"章节"，语义完整
 * 2. 标题本身就是很好的元数据（sectionTitle）
 * 3. 如果 includeParentHeadings=true，子节点会带上父标题链，
 *    例如 "# 项目介绍\n## 技术栈\n内容..."
 *    即使只检索到 "## 技术栈" 这一块，LLM 也知道它属于"项目介绍"
 *
 * maxHeadingLevel 控制切分粒度：
 * - maxHeadingLevel=1 → 只在 # 处切，每块可能很大
 * - maxHeadingLevel=2 → 在 # 和 ## 处切（推荐）
 * - maxHeadingLevel=3 → 更细粒度
 */
export function splitMarkdownByHeading(
  documents: Document[],
  config: MarkdownChunkingConfig,
): TextNode[] {
  const maxLevel = config.maxHeadingLevel ?? 2;
  const includeParents = config.includeParentHeadings ?? true;
  const chunkSize = config.chunkSize ?? DEFAULT_CHUNKING_CONFIG.chunkSize!;
  const chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNKING_CONFIG.chunkOverlap!;

  const allNodes: TextNode[] = [];

  for (const doc of documents) {
    const text = doc.getText();
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;

    // 解析所有标题及其位置
    interface HeadingInfo {
      level: number;
      title: string;
      startIndex: number;
    }
    const headings: HeadingInfo[] = [];
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(text)) !== null) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        startIndex: match.index,
      });
    }

    // 如果没有标题，整个文档作为一个块
    if (headings.length === 0) {
      const chunks = fallbackSplit(text, chunkSize, chunkOverlap);
      for (let i = 0; i < chunks.length; i++) {
        allNodes.push(new Document({
          text: chunks[i],
          id_: `${doc.id_}_md${i}`,
          metadata: {
            ...doc.metadata,
            chunkIndex: i,
            totalChunks: chunks.length,
            chunkingStrategy: 'markdown-heading',
          },
        }) as unknown as TextNode);
      }
      continue;
    }

    // 按切分级别（<= maxLevel）拆分段落
    interface Section {
      level: number;
      title: string;
      content: string;
      parentChain: string; // 父标题链
    }

    // 构建父标题链的辅助数组：记录每级最新标题
    const parentStack: string[] = new Array(7).fill('');
    const sections: Section[] = [];

    for (let h = 0; h < headings.length; h++) {
      const heading = headings[h];
      const nextStart = h + 1 < headings.length ? headings[h + 1].startIndex : text.length;
      const sectionText = text.slice(heading.startIndex, nextStart);

      // 更新父标题链
      parentStack[heading.level] = `${'#'.repeat(heading.level)} ${heading.title}`;
      // 清除更低级别的标题（因为进入了新的高级标题）
      for (let l = heading.level + 1; l <= 6; l++) {
        parentStack[l] = '';
      }

      // 只在切分级别处切分
      if (heading.level <= maxLevel) {
        const parentChain = includeParents
          ? parentStack.slice(1, heading.level).filter(Boolean).join('\n')
          : '';

        sections.push({
          level: heading.level,
          title: heading.title,
          content: sectionText,
          parentChain,
        });
      } else if (sections.length > 0) {
        // 非切分级别的标题 → 追加到上一个 section
        sections[sections.length - 1].content += sectionText;
      }
    }

    // 处理第一个标题之前的内容（如果有的话）
    if (headings[0].startIndex > 0) {
      const preamble = text.slice(0, headings[0].startIndex).trim();
      if (preamble) {
        sections.unshift({
          level: 0,
          title: '',
          content: preamble,
          parentChain: '',
        });
      }
    }

    // 生成节点
    let globalIdx = 0;
    const totalSections = sections.length;
    for (const section of sections) {
      const fullText = section.parentChain
        ? `${section.parentChain}\n${section.content}`
        : section.content;

      // 如果超出 chunkSize，进一步拆分
      const chunks = fallbackSplit(fullText, chunkSize, chunkOverlap);
      for (const chunk of chunks) {
        allNodes.push(new Document({
          text: chunk,
          id_: `${doc.id_}_md${globalIdx}`,
          metadata: {
            ...doc.metadata,
            sectionTitle: section.title,
            sectionLevel: section.level,
            chunkIndex: globalIdx,
            totalChunks: totalSections, // 近似值，实际可能因 fallback 拆分而更多
            chunkingStrategy: 'markdown-heading',
          },
        }) as unknown as TextNode);
        globalIdx++;
      }
    }
  }

  return allNodes;
}

// ════════════════════════════════════════════════════════════
// 2️⃣  PDF 页面/段落分块
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：PDF 分块的特殊考虑
 * ────────────────────────────────
 * PDF 文档在被解析后，通常每一页会作为独立的 Document 对象，
 * 并且在 metadata 中携带 pageNumber 信息。
 *
 * 两种主要策略：
 * 1. page（按页）：每页一个块，适合页面内容独立的文档（如幻灯片、手册）
 * 2. paragraph（按段落）：在页面内按双换行切分，适合长篇文档
 *
 * respectPageBoundary=true 意味着段落不会跨页合并，
 * 保持页码元数据的准确性。
 */
export function splitPdfByPage(
  documents: Document[],
  config: PdfChunkingConfig,
): TextNode[] {
  const method = config.method ?? 'page';
  const respectPageBoundary = config.respectPageBoundary ?? true;
  const chunkSize = config.chunkSize ?? DEFAULT_CHUNKING_CONFIG.chunkSize!;
  const chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNKING_CONFIG.chunkOverlap!;

  const allNodes: TextNode[] = [];
  let globalIdx = 0;

  // 按 pageNumber 分组（如果有的话）
  if (respectPageBoundary) {
    for (const doc of documents) {
      const pageNum = doc.metadata?.pageNumber ?? doc.metadata?.page_number;
      const text = doc.getText();

      if (method === 'page') {
        // 每页一个块（如果超大则 fallback 拆分）
        const chunks = fallbackSplit(text, chunkSize, chunkOverlap);
        for (const chunk of chunks) {
          allNodes.push(new Document({
            text: chunk,
            id_: `${doc.id_}_pdf${globalIdx}`,
            metadata: {
              ...doc.metadata,
              pageNumber: pageNum,
              chunkIndex: globalIdx,
              totalChunks: 0, // 最后统一更新
              chunkingStrategy: 'pdf-page',
            },
          }) as unknown as TextNode);
          globalIdx++;
        }
      } else if (method === 'paragraph') {
        // 按双换行切分段落
        const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        for (const para of paragraphs) {
          const chunks = fallbackSplit(para, chunkSize, chunkOverlap);
          for (const chunk of chunks) {
            allNodes.push(new Document({
              text: chunk,
              id_: `${doc.id_}_pdf${globalIdx}`,
              metadata: {
                ...doc.metadata,
                pageNumber: pageNum,
                chunkIndex: globalIdx,
                totalChunks: 0,
                chunkingStrategy: 'pdf-paragraph',
              },
            }) as unknown as TextNode);
            globalIdx++;
          }
        }
      }
    }
  } else {
    // 不尊重页面边界 → 把所有页合并后按段落切分
    const fullText = documents.map(d => d.getText()).join('\n\n');
    const paragraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const chunks = fallbackSplit(para, chunkSize, chunkOverlap);
      for (const chunk of chunks) {
        allNodes.push(new Document({
          text: chunk,
          id_: `${documents[0]?.id_ ?? 'pdf'}_pdf${globalIdx}`,
          metadata: {
            ...documents[0]?.metadata,
            chunkIndex: globalIdx,
            totalChunks: 0,
            chunkingStrategy: method === 'page' ? 'pdf-page' : 'pdf-paragraph',
          },
        }) as unknown as TextNode);
        globalIdx++;
      }
    }
  }

  // 更新 totalChunks
  for (const node of allNodes) {
    (node as unknown as { metadata: Record<string, unknown> }).metadata.totalChunks = allNodes.length;
  }

  return allNodes;
}

// ════════════════════════════════════════════════════════════
// 3️⃣  HTML DOM 语义标签分块
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：HTML 语义分块
 * ────────────────────────
 * HTML 文档有丰富的结构标签：
 * - <h1>-<h6>：标题层级
 * - <section>：语义章节
 * - <article>：独立文章
 * - <p>：段落
 *
 * 分块策略：以 sectionTags 指定的标签作为切分边界，
 * 每个边界标签开始一个新的块。
 *
 * stripTags=true 时会去除所有 HTML 标签，只保留纯文本内容。
 * 这对向量化更友好（标签本身不包含语义信息）。
 */
export function splitHtmlBySection(
  documents: Document[],
  config: HtmlChunkingConfig,
): TextNode[] {
  const sectionTags = config.sectionTags ?? ['h1', 'h2', 'h3', 'section', 'article'];
  const stripTags = config.stripTags ?? true;
  const chunkSize = config.chunkSize ?? DEFAULT_CHUNKING_CONFIG.chunkSize!;
  const chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNKING_CONFIG.chunkOverlap!;

  const allNodes: TextNode[] = [];

  // 构建匹配 section 标签的正则（匹配开标签）
  const tagPattern = sectionTags.map(t => `<${t}[^>]*>`).join('|');
  const sectionRegex = new RegExp(`(${tagPattern})`, 'gi');

  // 提取标签内文本内容的正则
  const headingContentRegex = /^<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/i;

  for (const doc of documents) {
    const text = doc.getText();

    // 按 section 标签切分
    const parts = text.split(sectionRegex);
    // parts 交替为: [content, tag, content, tag, content, ...]

    interface HtmlSection {
      title: string;
      content: string;
    }
    const sections: HtmlSection[] = [];
    let currentTitle = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      if (sectionRegex.test(part)) {
        // 这是一个标签 → 下一个 part 是它的内容
        sectionRegex.lastIndex = 0; // 重置 regex 状态
        currentTitle = '';
        continue;
      }
      sectionRegex.lastIndex = 0; // 重置 regex 状态

      // 尝试从内容中提取标题
      const headingMatch = headingContentRegex.exec(part);
      if (headingMatch) {
        currentTitle = headingMatch[2].replace(/<[^>]*>/g, '').trim();
      }

      let content = part;
      if (stripTags) {
        content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      if (content) {
        sections.push({ title: currentTitle, content });
      }
    }

    // 如果没有找到任何 section 标签，把整个文档作为一个 section
    if (sections.length === 0) {
      let content = text;
      if (stripTags) {
        content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (content) {
        sections.push({ title: '', content });
      }
    }

    // 生成节点
    let idx = 0;
    for (const section of sections) {
      const chunks = fallbackSplit(section.content, chunkSize, chunkOverlap);
      for (const chunk of chunks) {
        allNodes.push(new Document({
          text: chunk,
          id_: `${doc.id_}_html${idx}`,
          metadata: {
            ...doc.metadata,
            sectionTitle: section.title || undefined,
            chunkIndex: idx,
            totalChunks: sections.length,
            chunkingStrategy: 'html-section',
          },
        }) as unknown as TextNode);
        idx++;
      }
    }
  }

  return allNodes;
}

// ════════════════════════════════════════════════════════════
// 4️⃣  代码函数/类分块
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：代码结构感知分块
 * ──────────────────────────
 * 代码有天然的"语义单元"——函数和类。
 * 把一个函数切成两半是最差的分块方式（两个碎片都没有意义）。
 *
 * 本实现使用正则启发式检测函数/类边界：
 * - JS/TS: function, const/let ... = (, =>, class
 * - Python: def, class
 * - Java/Go/Rust: 常见的函数签名模式
 *
 * 局限：正则无法处理所有边界情况（如嵌套函数、装饰器等），
 * 但对于 RAG 分块来说，80% 的准确度已经远好于通用分块。
 *
 * includeImports=true 时，会在每个块前面加上文件顶部的 import 语句，
 * 这样 LLM 在看到某个函数时也能知道它依赖了哪些模块。
 */

// 函数/类边界检测正则（各语言通用版）
const CODE_BOUNDARY_PATTERNS = [
  // JS/TS: export function, function, export default function
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/,
  // JS/TS: export const/let/var ... = (...) => / = function
  /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function)/,
  // JS/TS/Java/C#: class
  /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
  // Python: def, class
  /^(?:async\s+)?def\s+(\w+)/,
  /^class\s+(\w+)/,
  // Go: func
  /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
  // Rust: fn, pub fn, impl
  /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
  /^(?:pub\s+)?impl\s+(\w+)/,
  // Java: public/private/protected ... method/class
  /^(?:public|private|protected)\s+(?:static\s+)?(?:(?:abstract|final|synchronized)\s+)*(?:class|interface|enum)\s+(\w+)/,
  /^(?:public|private|protected)\s+(?:static\s+)?(?:(?:abstract|final|synchronized)\s+)*\w+(?:<[^>]+>)?\s+(\w+)\s*\(/,
];

/**
 * 检测一行是否是 import/require 语句
 */
function isImportLine(line: string): boolean {
  const trimmed = line.trim();
  return /^import\s/.test(trimmed)
    || /^from\s/.test(trimmed)
    || /^const\s+\w+\s*=\s*require\(/.test(trimmed)
    || /^require\(/.test(trimmed)
    || /^using\s/.test(trimmed)
    || /^#include\s/.test(trimmed)
    || /^use\s/.test(trimmed);
}

/**
 * 检测一行是否匹配函数/类边界
 * 返回匹配到的名称，或 null
 */
function matchCodeBoundary(
  line: string,
  method: 'function' | 'class' | 'block',
): { name: string; type: 'function' | 'class' } | null {
  const trimmed = line.trim();
  for (const pattern of CODE_BOUNDARY_PATTERNS) {
    const m = pattern.exec(trimmed);
    if (m) {
      const isClass = /class|interface|enum|impl/.test(trimmed);
      if (method === 'function' && isClass) continue;  // 只要函数
      if (method === 'class' && !isClass) continue;     // 只要类
      return { name: m[1], type: isClass ? 'class' : 'function' };
    }
  }
  return null;
}

export function splitCodeByFunction(
  documents: Document[],
  config: CodeChunkingConfig,
): TextNode[] {
  const method = config.method ?? 'function';
  const includeImports = config.includeImports ?? false;
  const chunkSize = config.chunkSize ?? DEFAULT_CHUNKING_CONFIG.chunkSize!;
  const chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNKING_CONFIG.chunkOverlap!;

  // method === 'sentence' → 退回通用分块
  if (method === 'sentence') {
    const splitter = new SentenceSplitter({ chunkSize, chunkOverlap });
    const allNodes: TextNode[] = [];
    for (const doc of documents) {
      const nodes = splitter.getNodesFromDocuments([doc]);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i] as TextNode;
        node.metadata = {
          ...doc.metadata,
          ...node.metadata,
          chunkIndex: i,
          totalChunks: nodes.length,
          chunkingStrategy: 'code-sentence',
        };
        allNodes.push(node);
      }
    }
    return allNodes;
  }

  const allNodes: TextNode[] = [];

  for (const doc of documents) {
    const text = doc.getText();
    const lines = text.split('\n');
    const codeLanguage = doc.metadata?.codeLanguage || doc.metadata?.language || '';

    // 提取 import 语句块
    const importLines: string[] = [];
    for (const line of lines) {
      if (isImportLine(line)) {
        importLines.push(line);
      } else if (importLines.length > 0 && line.trim() === '') {
        // import 块后的空行也保留
        continue;
      } else if (importLines.length > 0) {
        break; // import 块结束
      }
    }
    const importBlock = importLines.join('\n');

    // 查找所有边界位置
    interface BoundaryInfo {
      lineIndex: number;
      name: string;
      type: 'function' | 'class';
    }
    const boundaries: BoundaryInfo[] = [];
    for (let i = 0; i < lines.length; i++) {
      // 跳过 import 行
      if (isImportLine(lines[i])) continue;
      const result = matchCodeBoundary(lines[i], method === 'block' ? 'function' : method);
      if (result) {
        boundaries.push({ lineIndex: i, name: result.name, type: result.type });
      }
    }

    // 如果没检测到边界，退回 fallback
    if (boundaries.length === 0) {
      const chunks = fallbackSplit(text, chunkSize, chunkOverlap);
      for (let i = 0; i < chunks.length; i++) {
        allNodes.push(new Document({
          text: chunks[i],
          id_: `${doc.id_}_code${i}`,
          metadata: {
            ...doc.metadata,
            codeLanguage,
            chunkIndex: i,
            totalChunks: chunks.length,
            chunkingStrategy: `code-${method}`,
          },
        }) as unknown as TextNode);
      }
      continue;
    }

    // 第一个边界之前的代码（全局声明、import 等）
    let idx = 0;
    if (boundaries[0].lineIndex > 0) {
      const preamble = lines.slice(0, boundaries[0].lineIndex).join('\n').trim();
      if (preamble && preamble !== importBlock.trim()) {
        allNodes.push(new Document({
          text: preamble,
          id_: `${doc.id_}_code${idx}`,
          metadata: {
            ...doc.metadata,
            codeLanguage,
            chunkIndex: idx,
            totalChunks: boundaries.length + 1,
            chunkingStrategy: `code-${method}`,
          },
        }) as unknown as TextNode);
        idx++;
      }
    }

    // 按边界切分
    for (let b = 0; b < boundaries.length; b++) {
      const start = boundaries[b].lineIndex;
      const end = b + 1 < boundaries.length ? boundaries[b + 1].lineIndex : lines.length;
      let blockText = lines.slice(start, end).join('\n').trimEnd();

      // 如果 includeImports，在块前加上 import 语句
      if (includeImports && importBlock) {
        blockText = `${importBlock}\n\n${blockText}`;
      }

      const chunks = fallbackSplit(blockText, chunkSize, chunkOverlap);
      for (const chunk of chunks) {
        const metaEntry: Record<string, unknown> = {
          ...doc.metadata,
          codeLanguage,
          chunkIndex: idx,
          totalChunks: boundaries.length,
          chunkingStrategy: `code-${method}`,
        };
        // 设置 functionName 或 className
        if (boundaries[b].type === 'class') {
          metaEntry.className = boundaries[b].name;
        } else {
          metaEntry.functionName = boundaries[b].name;
        }

        allNodes.push(new Document({
          text: chunk,
          id_: `${doc.id_}_code${idx}`,
          metadata: metaEntry,
        }) as unknown as TextNode);
        idx++;
      }
    }
  }

  return allNodes;
}

// ════════════════════════════════════════════════════════════
// 🎯  统一调度器：按文档格式分发到对应分块器
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：调度器模式（Dispatcher Pattern）
 * ────────────────────────────────────────────
 * chunkDocumentsByFormat 是整个格式感知分块的入口。
 * 它的职责是：
 *
 * 1. 根据文档的 fileType / docType 元数据对文档进行分组
 * 2. 对每组文档，检查是否存在格式特定的覆盖配置
 * 3. 有覆盖 → 使用格式感知分块器
 * 4. 无覆盖 → 退回到通用的 chunkDocuments()
 * 5. 合并所有分组的结果
 *
 * 这样调用者只需要调用一个函数，内部自动选择最优分块策略。
 */
export async function chunkDocumentsByFormat(
  documents: Document[],
  defaultConfig: ChunkingConfig,
  embedFn?: EmbedFunction,
  onProgress?: (msg: string) => void,
): Promise<TextNode[]> {
  const overrides = defaultConfig.formatOverrides;

  // 如果没有任何格式覆盖，直接使用默认策略
  if (!overrides) {
    return chunkDocuments(documents, defaultConfig, embedFn, onProgress);
  }

  // ⚠️ 关键：递归调用 chunkDocuments 时必须去掉 formatOverrides，
  // 否则会再次进入 chunkDocumentsByFormat → 无限递归！
  const baseConfig = { ...defaultConfig };
  delete baseConfig.formatOverrides;

  // 按 docType 分组
  const groups = new Map<SupportedDocType | 'unknown', Document[]>();
  for (const doc of documents) {
    const docType = (doc.metadata?.fileType || doc.metadata?.docType || 'unknown') as SupportedDocType | 'unknown';
    if (!groups.has(docType)) groups.set(docType, []);
    groups.get(docType)!.push(doc);
  }

  const allNodes: TextNode[] = [];

  for (const [docType, docs] of groups) {
    onProgress?.(`📂 处理 ${docType} 类型文档 (${docs.length} 个)...`);
    // Yield to UI between format groups to prevent freezing
    await new Promise(r => setTimeout(r, 0));
    // 检查是否有格式特定的覆盖配置
    if (docType === 'markdown' && overrides.markdown) {
      const mdConfig = overrides.markdown;
      onProgress?.(`  📝 Markdown 分块: method=${mdConfig.method}`);

      if (mdConfig.method === 'heading') {
        allNodes.push(...splitMarkdownByHeading(docs, mdConfig));
      } else if (mdConfig.method === 'sentence') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'sentence' }, embedFn, onProgress)));
      } else if (mdConfig.method === 'semantic') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'semantic' }, embedFn, onProgress)));
      }
    } else if (docType === 'pdf' && overrides.pdf) {
      const pdfConfig = overrides.pdf;
      onProgress?.(`  📄 PDF 分块: method=${pdfConfig.method}`);

      if (pdfConfig.method === 'page' || pdfConfig.method === 'paragraph') {
        allNodes.push(...splitPdfByPage(docs, pdfConfig));
      } else if (pdfConfig.method === 'sentence') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'sentence' }, embedFn, onProgress)));
      } else if (pdfConfig.method === 'semantic') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'semantic' }, embedFn, onProgress)));
      }
    } else if (docType === 'html' && overrides.html) {
      const htmlConfig = overrides.html;
      onProgress?.(`  🌐 HTML 分块: method=${htmlConfig.method}`);

      if (htmlConfig.method === 'dom-section') {
        allNodes.push(...splitHtmlBySection(docs, htmlConfig));
      } else if (htmlConfig.method === 'sentence') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'sentence' }, embedFn, onProgress)));
      } else if (htmlConfig.method === 'semantic') {
        allNodes.push(...(await chunkDocuments(docs, { ...baseConfig, strategy: 'semantic' }, embedFn, onProgress)));
      }
    } else if (docType === 'code' && overrides.code) {
      const codeConfig = overrides.code;
      onProgress?.(`  💻 代码分块: method=${codeConfig.method}`);

      if (codeConfig.method === 'function' || codeConfig.method === 'class' || codeConfig.method === 'block') {
        allNodes.push(...splitCodeByFunction(docs, codeConfig));
      } else if (codeConfig.method === 'sentence') {
        allNodes.push(...splitCodeByFunction(docs, codeConfig));
      }
    } else {
      // 没有格式覆盖 → 退回默认策略（注意使用 baseConfig 避免无限递归）
      onProgress?.(`  📋 使用默认策略: ${baseConfig.strategy}`);
      allNodes.push(...(await chunkDocuments(docs, baseConfig, embedFn, onProgress)));
    }

    // Yield to UI between groups
    await new Promise(r => setTimeout(r, 0));
  }

  onProgress?.(`✅ 格式感知分块完成: 共 ${allNodes.length} 个块`);
  return allNodes;
}
