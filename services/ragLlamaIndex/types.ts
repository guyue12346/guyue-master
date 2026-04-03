/**
 * RAG LlamaIndex Module — Type Definitions
 *
 * 📚 知识点：为什么需要独立的类型定义？
 * ------------------------------------------
 * TypeScript 的类型系统是编译时的"合同"。把类型单独抽出来有两个好处：
 * 1. 解耦：各子模块只依赖类型接口，不依赖具体实现
 * 2. 可测试：可以用 mock 数据满足类型约束进行单元测试
 *
 * 📚 知识点：LlamaIndex 的 Document / TextNode 模型
 * ------------------------------------------
 * LlamaIndex 核心数据模型是树形的：
 *   Document (根节点，代表一个文件)
 *     └── TextNode (子节点，代表文本块/chunk)
 *           ├── text: string        — 文本内容
 *           ├── metadata: Record    — 元数据（文件名、页码、章节等）
 *           ├── embedding: number[] — 向量表示
 *           └── relationships       — 与其他节点的关系（前后、父子）
 *
 * 这种设计的好处：节点之间有上下文关系，检索时可以"看"前后文。
 */

// ════════════════════════════════════════════════════════════
// Common Function Types
// ════════════════════════════════════════════════════════════

/** 通用 LLM 调用函数 — 输入 prompt，返回文本 */
export type LLMFunction = (prompt: string) => Promise<string>;

// ════════════════════════════════════════════════════════════
// Embedding Configuration (嵌入模型配置)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：Embedding（嵌入/向量化）
 * -----------------------------------
 * Embedding 是把文本转化为高维数字向量的过程。
 * 例如 "猫在桌子上" → [0.12, -0.34, 0.56, ...]（1536维）
 *
 * 语义相近的文本，向量也相近（余弦相似度高）。
 * 这就是 RAG 能"语义搜索"的核心原理。
 *
 * 不同模型维度不同：
 * - OpenAI text-embedding-3-small: 1536D
 * - Gemini gemini-embedding-001: 768D
 * - 通义千问 text-embedding-v3: 1024D
 *
 * 维度越高，信息越丰富，但存储和计算开销也越大。
 */
export type EmbeddingProvider = 'openai' | 'gemini' | 'zhipu' | 'qwen' | 'ollama' | 'custom';

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  dimensions?: number;  // 向量维度，部分模型可指定
}

// ════════════════════════════════════════════════════════════
// Document Types (文档类型)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：为什么要区分文档类型？
 * ----------------------------------
 * 不同格式的文档需要不同的解析策略：
 * - PDF：需要提取文本+保留页码结构
 * - Markdown：需要识别标题层级（# ## ###）
 * - 代码：需要识别函数/类边界
 * - HTML：需要去除标签，保留语义结构
 *
 * 元数据也不同：PDF 有页码，Markdown 有标题层级，代码有函数名。
 */
export type SupportedDocType = 'pdf' | 'markdown' | 'text' | 'code' | 'html' | 'docx';

export interface DocumentInfo {
  id: string;
  fileName: string;
  filePath: string;
  docType: SupportedDocType;
  fileSize: number;         // bytes
  lastModified: number;     // timestamp
  mimeType?: string;
  language?: string;        // 代码文件的编程语言
}

// ════════════════════════════════════════════════════════════
// Chunking Strategy (分块策略)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：文本分块（Chunking）是 RAG 中最关键的环节之一
 * ---------------------------------------------------------
 * 为什么要分块？
 * 1. LLM 的上下文窗口有限（即使 128K，也不能把整本书塞进去）
 * 2. Embedding 模型对长文本效果差（信息被稀释）
 * 3. 精准检索需要细粒度的文本单元
 *
 * 三种主要策略：
 *
 * 1️⃣ SentenceSplitter（句子分割）
 *    - 按句号/换行分句，然后按 chunkSize 合并
 *    - overlap 参数控制相邻块的重叠区域
 *    - 最简单、最快、适合大部分场景
 *    - 缺点：可能切断语义段落
 *
 * 2️⃣ SentenceWindowNodeParser（滑动窗口）
 *    - 每个节点是"中心句 + 前后 N 句上下文"
 *    - 检索时匹配中心句，但返回给 LLM 的是包含上下文的窗口
 *    - 类比：用望远镜看书——找到关键句后，自动展示前后文
 *    - 优点：检索精度高（匹配单句），LLM 回答质量好（有上下文）
 *    - 适合 QA 场景
 *
 * 3️⃣ SemanticSplitterNodeParser（语义分割）
 *    - 用 Embedding 模型计算相邻句子的语义相似度
 *    - 当相似度骤降时，认为是话题转换点，在此处切分
 *    - 类比：人类阅读时自然感知到的"这里话题变了"
 *    - 优点：最尊重原文的语义结构
 *    - 缺点：速度较慢（每句都要调 Embedding API），块大小不均匀
 *    - 2026 benchmark 显示需要注意：太细碎的块（平均 43 token）反而降低准确率
 *
 * 🏆 2026 年最佳实践（来自多项 benchmark）：
 *    - 推荐 512 tokens/块 + 50-100 tokens overlap
 *    - 块太小（<100 tokens）丢失上下文 → 准确率下降
 *    - 块太大（>1024 tokens）稀释重点 → 检索不精确
 *    - 语义分块需要兜底：设最小块大小，防止过度碎片化
 */
export type ChunkingStrategy = 'sentence' | 'sentence-window' | 'semantic';

export interface ChunkingConfig {
  strategy: ChunkingStrategy;

  // SentenceSplitter 参数
  chunkSize?: number;       // 每个块的最大 token 数 (default: 512)
  chunkOverlap?: number;    // 相邻块重叠 token 数 (default: 50)

  // SentenceWindowNodeParser 参数
  windowSize?: number;      // 窗口大小：中心句前后各取 N 句 (default: 3)

  // SemanticSplitterNodeParser 参数
  bufferSize?: number;      // 语义判断时的缓冲句数 (default: 1)
  breakpointPercentile?: number; // 相似度断点百分位 (default: 95)
  // ↑ 意思是：当相邻句子的相似度低于第 95 百分位时，认为话题切换

  // 格式感知分块覆盖配置
  formatOverrides?: FormatChunkingOverrides;
}

// ════════════════════════════════════════════════════════════
// Format-Aware Chunking Types (格式感知分块类型)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：格式感知分块（Format-Aware Chunking）
 * ─────────────────────────────────────────────────
 * 不同格式的文档有不同的天然结构：
 * - Markdown 有标题层级（# ## ###）→ 按标题切分最自然
 * - PDF 有页面边界 → 按页或按页内段落切分
 * - HTML 有 DOM 结构 → 按语义标签（h1-h6, section, article）切分
 * - 代码有函数/类边界 → 按代码结构切分
 * - 纯文本没有结构 → 只能用通用的句子/语义策略
 *
 * 格式感知分块的核心思想：利用文档的原生结构来指导分块，
 * 而不是把所有格式都当作"一串文字"来处理。
 */

// ── Markdown 分块配置 ──

export type MarkdownChunkingMethod = 'heading' | 'sentence' | 'semantic';

export interface MarkdownChunkingConfig {
  method: MarkdownChunkingMethod;
  maxHeadingLevel?: number;         // 按哪一级标题切分 (1-6, default: 2, 即 ##)
  includeParentHeadings?: boolean;  // 子节点是否包含父标题作为上下文 (default: true)
  chunkSize?: number;               // heading 模式下每块的最大 token 数上限
  chunkOverlap?: number;
}

// ── PDF 分块配置 ──

export type PdfChunkingMethod = 'page' | 'paragraph' | 'sentence' | 'semantic';

export interface PdfChunkingConfig {
  method: PdfChunkingMethod;
  respectPageBoundary?: boolean;    // 是否在页面边界处切分 (default: true)
  chunkSize?: number;
  chunkOverlap?: number;
}

// ── HTML 分块配置 ──

export type HtmlChunkingMethod = 'dom-section' | 'sentence' | 'semantic';

export interface HtmlChunkingConfig {
  method: HtmlChunkingMethod;
  sectionTags?: string[];           // 用作切分点的标签 (default: ['h1','h2','h3','section','article'])
  stripTags?: boolean;              // 是否去除标签 (default: true)
  chunkSize?: number;
  chunkOverlap?: number;
}

// ── 代码分块配置 ──

export type CodeChunkingMethod = 'function' | 'class' | 'block' | 'sentence';

export interface CodeChunkingConfig {
  method: CodeChunkingMethod;
  includeImports?: boolean;         // 是否在每个块前加上 import 语句作为上下文 (default: false)
  chunkSize?: number;
  chunkOverlap?: number;
}

// ── 统一的格式覆盖配置 ──

export interface FormatChunkingOverrides {
  markdown?: MarkdownChunkingConfig;
  pdf?: PdfChunkingConfig;
  html?: HtmlChunkingConfig;
  code?: CodeChunkingConfig;
  // text 和 docx 使用默认的 ChunkingConfig
}

// ════════════════════════════════════════════════════════════
// Metadata Schema (元数据结构)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：为什么元数据如此重要？
 * -----------------------------------
 * 元数据 = 关于数据的数据。在 RAG 中有三大作用：
 *
 * 1. **检索过滤**：用户问"第3章讲了什么"→ 用 pageNumber/section 过滤
 * 2. **来源追溯**：回答时标注"根据 xxx.pdf 第5页"→ 增强可信度
 * 3. **上下文补充**：LLM 看到 section="机器学习概论" 就知道语境
 *
 * LlamaIndex 的 Node.metadata 是一个 Record<string, any>，
 * 我们定义一个结构化的 schema 确保一致性。
 */
export interface ChunkMetadata {
  // 文件级
  fileName: string;
  filePath: string;
  fileType: SupportedDocType;
  fileSize: number;

  // 位置级
  pageNumber?: number;        // PDF 页码
  sectionTitle?: string;      // 标题/章节名
  sectionLevel?: number;      // 标题层级 (1=H1, 2=H2, ...)
  lineStart?: number;         // 起始行号
  lineEnd?: number;           // 结束行号

  // 语义级
  language?: string;          // 内容语言 (zh/en/...)
  codeLanguage?: string;      // 代码文件的编程语言
  functionName?: string;      // 代码文件中的函数名
  className?: string;         // 代码文件中的类名

  // 结构级
  chunkIndex: number;         // 在文档中的块序号
  totalChunks: number;        // 文档总块数
  parentDocId: string;        // 所属文档 ID

  // 索引管理
  indexedAt: number;           // 索引时间戳
  embeddingModel: string;      // 使用的 Embedding 模型
}

// ════════════════════════════════════════════════════════════
// Knowledge Graph (知识图谱)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：知识图谱（Knowledge Graph）
 * ----------------------------------------
 * 普通向量检索是"语义相似度匹配"——找最像的文本块。
 * 但它有局限：无法回答"A 和 B 是什么关系？"这类结构化问题。
 *
 * 知识图谱用"三元组"表示知识：
 *   (实体A, 关系, 实体B)
 *   例如：("LlamaIndex", "is_a", "RAG 框架")
 *         ("React", "used_by", "Guyue Master")
 *
 * 在 RAG 中结合知识图谱的好处：
 * 1. 向量检索找到相关文本块
 * 2. 知识图谱补充实体间的关系
 * 3. 两者结合 = 更精准、更结构化的回答
 *
 * LlamaIndex 支持用 LLM 自动从文本中提取三元组构建图谱。
 */
export interface KnowledgeTriple {
  subject: string;      // 主语实体
  predicate: string;    // 关系/谓语
  object: string;       // 宾语实体
  sourceChunkId: string; // 来源文本块 ID
  confidence?: number;  // 置信度 (0-1)
}

export interface KnowledgeGraphConfig {
  enabled: boolean;
  maxTriplesPerChunk: number;  // 每个块最多提取多少三元组 (default: 10)
  entityTypes?: string[];       // 关注的实体类型，如 ['人物', '技术', '概念']
  includeEntityDescriptions?: boolean; // 是否生成实体描述
}

// ════════════════════════════════════════════════════════════
// Index & Storage (索引与存储)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：向量存储（Vector Store）
 * ------------------------------------
 * 向量存储是 RAG 的"数据库"。核心操作：
 * 1. 写入：把文本块的 embedding 向量存入
 * 2. 查询：给定查询向量，找出最相似的 Top-K 个
 *
 * 存储方案对比：
 * | 方案 | 特点 | 适合场景 |
 * |------|------|---------|
 * | SimpleVectorStore | 内存+JSON文件 | 小数据集、本地桌面App ✅ |
 * | Qdrant | 独立服务、高性能 | 大数据集、生产环境 |
 * | Pinecone | 云托管、零运维 | SaaS 产品 |
 * | ChromaDB | 轻量嵌入式 | 原型开发 |
 *
 * 我们选 SimpleVectorStore：
 * - 不需要额外服务（Electron 桌面 App 不适合跑 Qdrant）
 * - 可以序列化为 JSON 通过 Electron IPC 持久化到磁盘
 * - 对于知识库级别的数据量（几百到几千个块）完全够用
 */
export interface StorageConfig {
  persistDir: string;          // 持久化目录路径
  collectionName?: string;     // 索引集合名 (default: 'default')
}

// ════════════════════════════════════════════════════════════
// RAG Pipeline Config (完整 RAG 流水线配置)
// ════════════════════════════════════════════════════════════

export interface RagPipelineConfig {
  embedding: EmbeddingConfig;
  chunking: ChunkingConfig;
  storage: StorageConfig;
  knowledgeGraph: KnowledgeGraphConfig;

  // 全局选项
  supportedExtensions: string[];  // 支持的文件扩展名
  maxFileSizeMB: number;          // 单文件最大大小 (default: 100)
}

// ════════════════════════════════════════════════════════════
// Index Status (索引状态)
// ════════════════════════════════════════════════════════════

export interface IndexedFileInfo {
  docId: string;
  fileName: string;
  filePath: string;
  docType: SupportedDocType;
  chunkCount: number;
  indexedAt: number;
  embeddingModel: string;
}

export interface IndexStatus {
  totalFiles: number;
  totalChunks: number;
  indexedFiles: IndexedFileInfo[];
  lastBuildAt?: number;
  embeddingProvider: string;
  embeddingModel: string;
  chunkingStrategy: ChunkingStrategy;
  knowledgeGraphEnabled: boolean;
  tripleCount?: number;
}

// ════════════════════════════════════════════════════════════
// Search Results (检索结果)
// ════════════════════════════════════════════════════════════

export interface SearchResult {
  text: string;
  /**
   * 相似度评分，基于余弦相似度（Cosine Similarity）。
   *
   * 📚 评分标准说明
   * ═══════════════
   *
   * 一、计算方式
   * ──────────
   * cos(query_vec, doc_vec) = (A·B) / (||A|| × ||B||)
   * 取值范围：[-1, 1]，实际 Embedding 场景下通常在 [0, 1]
   *
   * 二、分数解读（仅向量检索时）
   * ─────────────────────────
   *   > 0.85  极高相关性 — 查询与文本语义几乎一致
   *   0.7-0.85  高相关性 — 文本与查询主题高度匹配
   *   0.5-0.7   中等相关性 — 文本包含相关信息但不完全匹配
   *   0.3-0.5   低相关性 — 仅有部分语义关联
   *   < 0.3     基本无关 — 几乎没有语义联系
   *
   * 三、影响因素
   * ──────────
   * - Embedding 模型：不同模型的分数尺度不同（OpenAI 模型分数普遍偏高）
   * - 查询长度：短查询的分数波动较大
   * - 文本块大小：过大的块可能稀释相关性分数
   * - 搜索算法：暴力搜索返回精确分数，HNSW 返回近似分数（可能略有偏差）
   *
   * 四、混合检索时的分数含义
   * ───────────────────────
   * - Alpha 加权：score = alpha × vector_score + (1-alpha) × bm25_normalized_score
   *   分数仍在 [0, 1] 范围内，但含义是加权混合相关性
   * - RRF (Reciprocal Rank Fusion)：score = Σ(1 / (k + rank_i))
   *   分数反映的是排名融合结果，与原始余弦相似度尺度不同，仅用于排序
   *
   * 五、重排序后的分数
   * ────────────────
   * - LLM 重排序：分数由 LLM 评估（0-1），代表 LLM 判断的相关性
   * - MMR 重排序：score = λ × relevance - (1-λ) × max_similarity_to_selected
   *   兼顾相关性和多样性，分数可能低于原始检索分数
   * - Cohere/Jina 重排序：分数由专用重排序模型输出，尺度独立于原始检索
   */
  score: number;
  metadata: ChunkMetadata;
  nodeId: string;
  /** 与该文本块相关的知识图谱三元组 */
  relatedTriples?: KnowledgeTriple[];
}

export interface SearchOptions {
  topK?: number;              // 返回前 K 个结果 (default: 5)
  minScore?: number;          // 最低相似度阈值 (default: 0.0)
  filters?: {                 // 元数据过滤
    fileTypes?: SupportedDocType[];
    fileNames?: string[];
    dateRange?: { from?: number; to?: number };
  };
  includeKnowledgeGraph?: boolean; // 是否包含图谱信息
}

// ════════════════════════════════════════════════════════════
// Vector Store Info (向量库完整信息)
// ════════════════════════════════════════════════════════════

/**
 * 📚 向量库完整信息（用于前端展示向量库概览）
 *
 * 包含：基础统计、分块策略、搜索算法、知识图谱状态
 */
export interface VectorStoreInfo {
  // ── 基础统计 ──
  totalEntries: number;
  embeddingProvider: string;
  embeddingModel: string;
  createdAt: number;
  updatedAt: number;
  files: Array<{ filePath: string; fileName: string; chunkCount: number; indexedAt: number }>;

  // ── 分块策略 ──
  chunkingStrategy: ChunkingStrategy | null;
  chunkingConfig: ChunkingConfig | null;

  // ── 搜索算法 ──
  searchAlgorithm: SearchAlgorithm;
  hasHnswIndex: boolean;
  hnswConfig: HnswConfig | null;

  // ── 知识图谱 ──
  hasKnowledgeGraph: boolean;
  knowledgeGraphStats: {
    tripleCount: number;
    entityCount: number;
    builtAt?: number;
  } | null;
}

// ════════════════════════════════════════════════════════════
// Vector Entry Detail (单条向量详细信息)
// ════════════════════════════════════════════════════════════

/**
 * 📚 单条向量的详细信息
 *
 * 包含该向量的文本、完整元数据、embedding 维度信息，
 * 以及从知识图谱中提取的与该文本块相关的三元组。
 */
export interface VectorEntryDetail {
  id: string;
  text: string;
  metadata: Record<string, any>;
  embeddingDimensions: number;
  /** 该文本块在知识图谱中作为来源的三元组 */
  relatedTriples: KnowledgeTriple[];
}

// ════════════════════════════════════════════════════════════
// Knowledge Graph Stats (知识图谱统计摘要)
// ════════════════════════════════════════════════════════════

/**
 * 知识图谱的统计摘要，存储在向量库中以便展示
 */
export interface KnowledgeGraphSummary {
  tripleCount: number;
  entityCount: number;
  builtAt?: number;
}

// ════════════════════════════════════════════════════════════
// Retrieval Strategy (检索策略)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：三种主流检索策略
 *
 * 1️⃣ Vector (向量检索 / Dense Retrieval)
 *    把查询和文档都转成向量，用余弦相似度匹配。
 *    优点：理解语义（"汽车"能匹配到"轿车"）
 *    缺点：对精确关键词不敏感（搜 "RFC 7231" 可能找不到）
 *
 * 2️⃣ BM25 (关键词检索 / Sparse Retrieval)
 *    经典信息检索算法（Elasticsearch 的核心）。
 *    基于词频(TF)和逆文档频率(IDF)。
 *    优点：精确关键词匹配强（型号、编号、专有名词）
 *    缺点：不理解语义（"汽车"匹配不到"轿车"）
 *
 * 3️⃣ Hybrid (混合检索)
 *    同时用 Vector + BM25，然后融合结果。
 *    融合方法：
 *    - Alpha 加权：final = alpha × vector_score + (1-alpha) × bm25_score
 *    - RRF (Reciprocal Rank Fusion)：按排名倒数加权，无需归一化
 *    优点：取两者之长，2026 年生产环境标配
 */
export type RetrievalStrategy = 'vector' | 'bm25' | 'hybrid';

export type FusionMethod = 'alpha' | 'rrf';

export interface RetrievalConfig {
  strategy: RetrievalStrategy;
  topK: number;                // 初始检索数量 (default: 20)

  // Hybrid 参数
  alpha?: number;              // vector 权重 (0-1, default: 0.7)
  fusionMethod?: FusionMethod; // 融合方法 (default: 'rrf')
  rrfK?: number;               // RRF 的 K 参数 (default: 60)

  // BM25 参数
  bm25K1?: number;             // 词频饱和参数 (default: 1.2)
  bm25B?: number;              // 文档长度归一化 (default: 0.75)

  // 知识图谱增强
  includeKnowledgeGraph?: boolean;
  kgMaxTriples?: number;       // 最多补充多少个三元组 (default: 5)
}

// ════════════════════════════════════════════════════════════
// Reranking Strategy (重排序策略)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：为什么需要 Reranking（重排序）？
 *
 * 初始检索（retrieval）速度快但粗糙——用 bi-encoder 独立编码 query 和 doc。
 * 重排序用更强的模型对 (query, doc) 配对进行精细打分。
 *
 * 类比：初始检索 = 海选，重排序 = 决赛评审。
 *
 * 1️⃣ LLM Reranker — 最灵活，让 LLM 评分
 * 2️⃣ Cross-Encoder API (Cohere/Jina) — 专用重排序模型，速度快
 * 3️⃣ MMR — 不只看相关性，还保证多样性，避免返回重复内容
 */
export type RerankerType = 'none' | 'llm' | 'cohere' | 'jina' | 'mmr';

export interface RerankerConfig {
  type: RerankerType;
  topN: number;                // 重排后保留前 N 个 (default: 5)

  // LLM Reranker
  llmPromptTemplate?: string;

  // Cohere Rerank
  cohereApiKey?: string;
  cohereModel?: string;        // default: 'rerank-v3.5'

  // Jina Reranker
  jinaApiKey?: string;
  jinaModel?: string;          // default: 'jina-reranker-v2-base-multilingual'

  // MMR
  mmrLambda?: number;          // 相关性 vs 多样性 (0-1, default: 0.7)
}

// ════════════════════════════════════════════════════════════
// Query Modes（高级查询模式）
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：查询模式
 * ────────────────────
 * - single:       默认单次检索
 * - router:       条件路由，不同问题查不同知识库
 * - sub-question: 子问题分解，复杂问题拆成多个子问题并行检索
 * - iterative:    迭代优化，不断改写查询直到找到满意结果
 *
 * 详见 queryModes.ts 中的完整实现和注释。
 */
export type QueryMode = 'single' | 'router' | 'sub-question' | 'iterative';

export interface QueryModeConfig {
  mode: QueryMode;
  router?: {
    routes: Array<{
      id: string;
      name: string;
      description: string;
      keywords?: string[];
      collectionId?: string;
    }>;
    defaultRoute?: string;
    routingMethod: 'llm' | 'keyword' | 'embedding';
  };
  subQuestion?: {
    maxSubQuestions: number;
    mergeStrategy: 'concatenate' | 'deduplicate' | 'rerank';
    deduplicateThreshold?: number;
  };
  iterative?: {
    maxIterations: number;
    qualityThreshold: number;
    refinementStrategy: 'expand' | 'rephrase' | 'decompose';
  };
}

// ════════════════════════════════════════════════════════════
// Pre-Retrieval Optimization (检索前优化)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：检索前优化（Pre-Retrieval Optimization）
 * ─────────────────────────────────────────────────────
 * 在向量检索之前，先对用户查询进行优化处理，提升检索质量。
 *
 * 三种主要策略：
 *
 * 1️⃣ 查询扩展（Query Expansion）
 *    在原始查询基础上，用 LLM 补充同义词和相关术语。
 *    例："React 状态管理" → "React 状态管理 useState useReducer Redux Zustand"
 *    优点：提高召回率（recall）
 *
 * 2️⃣ 查询改写（Query Rewriting）
 *    让 LLM 把口语化/模糊的查询改写为更精确的表述。
 *    例："那个前端框架怎么用" → "React 框架的基本使用方法和核心概念"
 *    优点：提高精确度（precision）
 *
 * 3️⃣ HyDE（Hypothetical Document Embeddings）
 *    让 LLM 生成一段"假设的回答"，用假设回答的向量去检索。
 *    原理：假设回答与真实文档的向量距离，比原始查询更近。
 *    论文：Gao et al., "Precise Zero-Shot Dense Retrieval without Relevance Labels" (2022)
 *    例：Q: "HNSW 算法" → 假设回答："HNSW 是一种用于近似最近邻搜索的图算法..."
 *        → 用假设回答的 embedding 去检索，比直接用 "HNSW 算法" 更准
 *    优点：对领域术语和简短查询效果显著
 */
export type PreRetrievalStrategy = 'none' | 'expansion' | 'rewrite' | 'hyde';

export interface PreRetrievalConfig {
  strategy: PreRetrievalStrategy;

  // 查询扩展参数
  expansion?: {
    maxTerms?: number;         // 最多补充多少个扩展词 (default: 5)
    includeOriginal?: boolean; // 是否保留原始查询 (default: true)
  };

  // 查询改写参数
  rewrite?: {
    style?: 'precise' | 'broad' | 'technical';  // 改写风格 (default: 'precise')
  };

  // HyDE 参数
  hyde?: {
    responseLength?: 'short' | 'medium' | 'long'; // 假设回答长度 (default: 'medium')
    numHypothetical?: number;  // 生成几个假设回答 (default: 1, 多个可用平均向量)
  };
}

// ════════════════════════════════════════════════════════════
// Search Algorithm
// ════════════════════════════════════════════════════════════

export type SearchAlgorithm = 'brute-force' | 'hnsw';

export interface HnswConfig {
  m?: number;              // 每层连接数 (default: 16)
  efConstruction?: number; // 建图搜索宽度 (default: 200)
  efSearch?: number;       // 查询搜索宽度 (default: 50)
}

// ════════════════════════════════════════════════════════════
// Full Pipeline Config
// ════════════════════════════════════════════════════════════

export interface FullRagConfig extends RagPipelineConfig {
  retrieval: RetrievalConfig;
  reranker: RerankerConfig;
  searchAlgorithm: SearchAlgorithm;
  hnsw?: HnswConfig;
  preRetrieval?: PreRetrievalConfig;
}
