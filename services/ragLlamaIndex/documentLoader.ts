/**
 * RAG LlamaIndex Module — Document Loaders
 *
 * 📚 知识点：数据摄入（Data Ingestion）
 * ======================================
 * RAG 流水线的第一步是"摄入"——把各种格式的文件转化为 LlamaIndex 的
 * Document 对象。这个过程包括：
 *
 *   原始文件 → 文本提取 → 结构识别 → Document 对象
 *              ↑           ↑
 *            格式解析    元数据提取
 *
 * 📚 知识点：LlamaIndex 的 Document 类
 * -------------------------------------
 * ```typescript
 * import { Document } from 'llamaindex';
 * const doc = new Document({
 *   text: "文本内容...",
 *   metadata: { fileName: "example.pdf", pageNumber: 1 },
 * });
 * ```
 * Document 是 TextNode 的父类，它代表"一个完整文档"。
 * 后续的 NodeParser（分块器）会把 Document 拆分成多个 TextNode。
 *
 * 📚 关键设计：Electron 双进程架构的影响
 * ----------------------------------------
 * 我们的 App 是 Electron 架构：
 * - Main Process (Node.js): 可以读文件系统、调用 pdf-parse 等
 * - Renderer Process (React): LlamaIndex 代码在这里运行
 *
 * 所以文件读取需要通过 IPC：
 *   Renderer → IPC → Main → fs.readFile → IPC → Renderer → Document
 *
 * 本模块设计为"纯逻辑层"，文件 I/O 通过传入的接口调用。
 */

import { Document } from 'llamaindex';
import { DocumentInfo, SupportedDocType, ChunkMetadata } from './types';
import { inferDocType, inferCodeLanguage } from './config';

// ════════════════════════════════════════════════════════════
// File I/O Interface (文件读取接口)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：依赖反转原则（Dependency Inversion）
 * ------------------------------------------------
 * 我们不直接调用 fs.readFile 或 electronAPI，而是定义一个接口。
 * 调用者（App.tsx 或 main.ts）负责提供具体实现。
 *
 * 好处：
 * 1. 本模块可以在任何环境运行（Node.js/浏览器/测试）
 * 2. 测试时可以 mock，不需要真实文件系统
 * 3. 未来如果存储方式变了（比如从本地改为云端），只需换实现
 */
export interface FileReader {
  readTextFile(filePath: string): Promise<string>;
  readPdfText(filePath: string): Promise<string>;
  getFileStats(filePath: string): Promise<{ size: number; mtime: number }>;
}

// ════════════════════════════════════════════════════════════
// Text Extraction (文本提取)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：Markdown 结构提取
 * ----------------------------
 * Markdown 文件有天然的层级结构（# ## ### ...），
 * 我们可以从中提取"节标题"作为元数据。
 *
 * 这在检索时非常有用——当用户问"关于 XX 章节的内容"，
 * 我们可以用 sectionTitle 做精确过滤。
 */

interface ExtractedSection {
  title: string;
  level: number;     // 1=H1, 2=H2, ...
  content: string;
  lineStart: number;
  lineEnd: number;
}

/**
 * 从 Markdown 文本中提取节结构
 */
export function extractMarkdownSections(text: string): ExtractedSection[] {
  const lines = text.split('\n');
  const sections: ExtractedSection[] = [];
  let currentSection: ExtractedSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const headerMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        currentSection.lineEnd = i - 1;
        currentSection.content = lines.slice(currentSection.lineStart, i).join('\n');
        sections.push(currentSection);
      }
      currentSection = {
        title: headerMatch[2].trim(),
        level: headerMatch[1].length,
        content: '',
        lineStart: i,
        lineEnd: i,
      };
    }
  }

  // Push last section
  if (currentSection) {
    currentSection.lineEnd = lines.length - 1;
    currentSection.content = lines.slice(currentSection.lineStart, lines.length).join('\n');
    sections.push(currentSection);
  }

  // If no headers found, treat entire text as one section
  if (sections.length === 0) {
    sections.push({ title: '', level: 0, content: text, lineStart: 0, lineEnd: lines.length - 1 });
  }

  return sections;
}

/**
 * 📚 知识点：PDF 页面标记
 * -----------------------
 * 我们的 pdf-parse 提取的文本中包含 [第N页] 标记。
 * 解析这些标记可以保留页码信息到元数据中。
 */

interface PdfPage {
  pageNumber: number;
  content: string;
}

export function extractPdfPages(text: string): PdfPage[] {
  // 匹配 [第N页] 或 [Page N] 标记
  const pagePattern = /\[第(\d+)页\]|\[Page\s+(\d+)\]/g;
  const pages: PdfPage[] = [];
  let lastIndex = 0;
  let lastPageNum = 1;
  let match: RegExpExecArray | null;

  while ((match = pagePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) {
        pages.push({ pageNumber: lastPageNum, content });
      }
    }
    lastPageNum = parseInt(match[1] || match[2], 10);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    pages.push({ pageNumber: lastPageNum, content: remaining });
  }

  // If no page markers, treat as single page
  if (pages.length === 0 && text.trim()) {
    pages.push({ pageNumber: 1, content: text.trim() });
  }

  return pages;
}

/**
 * 📚 知识点：代码文件的结构提取
 * -----------------------------
 * 代码文件有函数、类等结构单元，这些比行号更有语义价值。
 * 简单的正则可以提取顶层结构（非 AST 解析，但足够好用）。
 *
 * 为什么不用 AST（抽象语法树）？
 * - AST 解析需要语言特定的解析器（TypeScript 用 ts.createSourceFile）
 * - 对于 50+ 种语言不现实
 * - 正则 80/20 法则：用 20% 的工作覆盖 80% 的场景
 */
export function extractCodeStructure(text: string, language?: string): {
  functions: string[];
  classes: string[];
} {
  const functions: string[] = [];
  const classes: string[] = [];

  // Common patterns across languages
  // Function: function xxx, def xxx, func xxx, fn xxx
  const funcPatterns = [
    /(?:function|def|func|fn)\s+(\w+)/g,                        // JS/Python/Go/Rust
    /(?:public|private|protected|static)?\s*\w+\s+(\w+)\s*\(/g, // Java/C#
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,         // Arrow functions
    /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)/g,
  ];

  // Class: class xxx
  const classPattern = /(?:class|struct|interface|enum)\s+(\w+)/g;

  for (const pattern of funcPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(match[1])) {
        functions.push(match[1]);
      }
    }
  }

  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(text)) !== null) {
    if (match[1]) classes.push(match[1]);
  }

  return { functions: [...new Set(functions)], classes: [...new Set(classes)] };
}

// ════════════════════════════════════════════════════════════
// Document Loader (文档加载器)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：加载器的职责
 * -----------------------
 * 加载器只做一件事：把文件变成 LlamaIndex Document 对象。
 * 它不负责分块——那是 NodeParser 的工作。
 * 它不负责 Embedding——那是 EmbedModel 的工作。
 *
 * 这是"单一职责原则"（SRP）：每个模块只做一件事，做好。
 *
 * 📚 返回的 Document.metadata 说明：
 * 我们在加载阶段就尽可能丰富元数据，因为分块后这些信息会
 * 自动继承给所有子节点（TextNode）。
 */

export interface LoadDocumentOptions {
  fileReader: FileReader;
  generateId?: () => string;
}

/**
 * 加载单个文件为 LlamaIndex Document(s)
 *
 * 返回数组的原因：
 * - PDF 可能按页返回多个 Document（保留页码）
 * - Markdown 可能按章节返回多个 Document（保留结构）
 * - 普通文本返回单个 Document
 */
export async function loadDocument(
  filePath: string,
  options: LoadDocumentOptions,
): Promise<Document[]> {
  const { fileReader, generateId } = options;
  const docType = inferDocType(filePath);
  if (!docType) {
    throw new Error(`Unsupported file type: ${filePath}`);
  }

  const stats = await fileReader.getFileStats(filePath);
  const fileName = filePath.split('/').pop() || filePath;
  const docId = generateId?.() ?? `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const baseMetadata = {
    fileName,
    filePath,
    fileType: docType,
    fileSize: stats.size,
    parentDocId: docId,
    indexedAt: Date.now(),
  };

  switch (docType) {
    case 'pdf':
      return loadPdfDocument(filePath, baseMetadata, fileReader);
    case 'markdown':
      return loadMarkdownDocument(filePath, baseMetadata, fileReader);
    case 'code':
      return loadCodeDocument(filePath, baseMetadata, fileReader);
    case 'html':
      return loadHtmlDocument(filePath, baseMetadata, fileReader);
    case 'text':
    default:
      return loadTextDocument(filePath, baseMetadata, fileReader);
  }
}

// ── Individual Loaders ──

async function loadPdfDocument(
  filePath: string,
  baseMeta: Record<string, any>,
  reader: FileReader,
): Promise<Document[]> {
  const rawText = await reader.readPdfText(filePath);
  const pages = extractPdfPages(rawText);

  return pages.map((page, idx) => new Document({
    text: page.content,
    id_: `${baseMeta.parentDocId}_p${page.pageNumber}`,
    metadata: {
      ...baseMeta,
      pageNumber: page.pageNumber,
      chunkIndex: idx,
      totalChunks: pages.length,
    },
  }));
}

async function loadMarkdownDocument(
  filePath: string,
  baseMeta: Record<string, any>,
  reader: FileReader,
): Promise<Document[]> {
  const text = await reader.readTextFile(filePath);
  const sections = extractMarkdownSections(text);

  return sections.map((section, idx) => new Document({
    text: section.content,
    id_: `${baseMeta.parentDocId}_s${idx}`,
    metadata: {
      ...baseMeta,
      sectionTitle: section.title || undefined,
      sectionLevel: section.level || undefined,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      chunkIndex: idx,
      totalChunks: sections.length,
    },
  }));
}

async function loadCodeDocument(
  filePath: string,
  baseMeta: Record<string, any>,
  reader: FileReader,
): Promise<Document[]> {
  const text = await reader.readTextFile(filePath);
  const language = inferCodeLanguage(filePath);
  const structure = extractCodeStructure(text, language);

  return [new Document({
    text,
    id_: `${baseMeta.parentDocId}_code`,
    metadata: {
      ...baseMeta,
      codeLanguage: language,
      functionName: structure.functions.join(', ') || undefined,
      className: structure.classes.join(', ') || undefined,
      chunkIndex: 0,
      totalChunks: 1,
    },
  })];
}

async function loadHtmlDocument(
  filePath: string,
  baseMeta: Record<string, any>,
  reader: FileReader,
): Promise<Document[]> {
  const rawHtml = await reader.readTextFile(filePath);
  // Strip HTML tags but preserve structure with newlines
  const text = rawHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return [new Document({
    text,
    id_: `${baseMeta.parentDocId}_html`,
    metadata: {
      ...baseMeta,
      chunkIndex: 0,
      totalChunks: 1,
    },
  })];
}

async function loadTextDocument(
  filePath: string,
  baseMeta: Record<string, any>,
  reader: FileReader,
): Promise<Document[]> {
  const text = await reader.readTextFile(filePath);

  return [new Document({
    text,
    id_: `${baseMeta.parentDocId}_text`,
    metadata: {
      ...baseMeta,
      chunkIndex: 0,
      totalChunks: 1,
    },
  })];
}

/**
 * 批量加载多个文件
 */
export async function loadDocuments(
  filePaths: string[],
  options: LoadDocumentOptions & { onProgress?: (msg: string) => void },
): Promise<Document[]> {
  const allDocs: Document[] = [];
  const { onProgress, ...loadOpts } = options;

  for (let i = 0; i < filePaths.length; i++) {
    const fp = filePaths[i];
    const fileName = fp.split('/').pop() || fp;
    onProgress?.(`[${i + 1}/${filePaths.length}] 加载 ${fileName}...`);

    try {
      const docs = await loadDocument(fp, loadOpts);
      allDocs.push(...docs);
    } catch (err) {
      onProgress?.(`⚠ 加载失败: ${fileName} — ${(err as Error).message}`);
    }
  }

  onProgress?.(`✅ 共加载 ${allDocs.length} 个文档片段 (来自 ${filePaths.length} 个文件)`);
  return allDocs;
}
