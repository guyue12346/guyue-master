/**
 * RAG LlamaIndex Module — Configuration & Defaults
 *
 * 📚 知识点：配置与默认值设计原则
 * --------------------------------
 * 好的默认值应该让 80% 的用户开箱即用（Convention over Configuration）。
 * 但同时要暴露足够的旋钮给高级用户调优。
 *
 * RAG 系统中最影响效果的三个参数：
 * 1. chunkSize — 太大→检索不精准，太小→丢失上下文
 * 2. chunkOverlap — 太大→冗余，太小→上下文断裂
 * 3. topK — 太大→噪声多，太小→可能遗漏答案
 *
 * 下面的默认值来自 2026 年多项 RAG benchmark 研究的最佳实践。
 */

import {
  RagPipelineConfig,
  ChunkingConfig,
  KnowledgeGraphConfig,
  SupportedDocType,
} from './types';

// ════════════════════════════════════════════════════════════
// File Extension → Document Type Mapping
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：MIME 类型与文件扩展名
 * ---------------------------------
 * 文件扩展名只是"建议"，真正决定文件类型的是文件内容（Magic Bytes）。
 * 但在桌面 App 场景中，扩展名映射已经足够可靠。
 */
export const EXTENSION_TO_DOCTYPE: Record<string, SupportedDocType> = {
  // PDF
  '.pdf': 'pdf',
  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',
  // Plain Text
  '.txt': 'text',
  '.log': 'text',
  '.csv': 'text',
  '.tsv': 'text',
  '.json': 'text',
  '.yaml': 'text',
  '.yml': 'text',
  '.xml': 'text',
  '.ini': 'text',
  '.conf': 'text',
  '.toml': 'text',
  // Code
  '.js': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.jsx': 'code',
  '.py': 'code',
  '.java': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.cpp': 'code',
  '.c': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.cs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.sql': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.r': 'code',
  '.lua': 'code',
  '.dart': 'code',
  '.vue': 'code',
  '.svelte': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.less': 'code',
  // HTML
  '.html': 'html',
  '.htm': 'html',
  // DOCX (future support)
  '.docx': 'docx',
};

/**
 * 推断文件扩展名对应的编程语言（用于代码文件的元数据）
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript', '.ts': 'typescript', '.tsx': 'tsx', '.jsx': 'jsx',
  '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
  '.kt': 'kotlin', '.scala': 'scala', '.sql': 'sql',
  '.sh': 'shell', '.bash': 'bash', '.zsh': 'zsh',
  '.r': 'r', '.lua': 'lua', '.dart': 'dart',
  '.vue': 'vue', '.svelte': 'svelte',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html',
};

// ════════════════════════════════════════════════════════════
// Default Configs
// ════════════════════════════════════════════════════════════

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  strategy: 'sentence',
  chunkSize: 512,        // 2026 benchmark 最优值
  chunkOverlap: 50,      // ~10% overlap
  windowSize: 3,         // 前后各 3 句
  bufferSize: 1,
  breakpointPercentile: 95,
};

export const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
  enabled: false,           // 默认关闭（需要 LLM 调用，有成本）
  maxTriplesPerChunk: 10,
  includeEntityDescriptions: true,
};

/**
 * 支持的文件扩展名列表
 */
export const DEFAULT_SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_DOCTYPE);

/**
 * 📚 知识点：为什么默认 chunkSize=512？
 * --------------------------------------
 * 2026 年多项 benchmark 结论一致：
 * - 512 tokens ≈ 400-600 个英文单词 ≈ 800-1200 个中文字符
 * - 在 QA 任务上达到 ~69% 准确率（end-to-end）
 * - 比 256 tokens（太碎，丢上下文）高 5-8%
 * - 比 1024 tokens（太大，稀释重点）高 3-5%
 * - 50 tokens overlap ≈ 10% 重叠，平衡了上下文连续性和存储效率
 */
export function createDefaultConfig(
  overrides?: Partial<RagPipelineConfig>
): RagPipelineConfig {
  return {
    embedding: overrides?.embedding ?? {
      provider: 'openai',
      apiKey: '',
      model: 'text-embedding-3-small',
    },
    chunking: { ...DEFAULT_CHUNKING_CONFIG, ...overrides?.chunking },
    storage: overrides?.storage ?? {
      persistDir: '',  // Will be set at runtime via Electron
    },
    knowledgeGraph: { ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG, ...overrides?.knowledgeGraph },
    supportedExtensions: overrides?.supportedExtensions ?? DEFAULT_SUPPORTED_EXTENSIONS,
    maxFileSizeMB: overrides?.maxFileSizeMB ?? 100,
  };
}

/**
 * 根据文件路径推断文档类型
 */
export function inferDocType(filePath: string): SupportedDocType | null {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return null;
  return EXTENSION_TO_DOCTYPE[ext] ?? null;
}

/**
 * 根据文件路径推断编程语言
 */
export function inferCodeLanguage(filePath: string): string | undefined {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return undefined;
  return EXTENSION_TO_LANGUAGE[ext];
}
