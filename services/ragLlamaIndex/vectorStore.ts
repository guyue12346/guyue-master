/**
 * RAG LlamaIndex Module — Vector Store (Local Persistent)
 *
 * 📚 知识点：向量存储（Vector Store）详解
 * ═══════════════════════════════════════
 *
 * 向量存储是 RAG 的"搜索引擎"。核心操作只有两个：
 *   1. add(vectors, metadata)  — 写入向量
 *   2. query(vector, topK)     — 查询最相似的 K 个
 *
 * 📚 为什么不直接用数据库？
 * ────────────────────────
 * 传统数据库（SQL/NoSQL）擅长精确查询："找到 name='张三' 的记录"
 * 向量数据库擅长相似度查询："找到和这个向量最接近的 K 个"
 *
 * 底层算法通常是：
 * - 暴力搜索 (Brute Force): 遍历所有向量，计算余弦相似度 → O(n)
 * - HNSW (Hierarchical Navigable Small World): 近似最近邻 → O(log n)
 * - IVF (Inverted File Index): 先聚类再搜索 → O(√n)
 *
 * 对于我们的场景（桌面 App，几百到几千个文本块），暴力搜索已经够快（<10ms）。
 * 只有当数据量达到百万级别时才需要 HNSW/IVF。
 *
 * 📚 为什么选择 SimpleVectorStore？
 * ────────────────────────────────
 * | 方案 | 优点 | 缺点 | 适合 |
 * |------|------|------|------|
 * | SimpleVectorStore | 零依赖、可序列化为 JSON | 全内存、暴力搜索 | ✅ 桌面App |
 * | Qdrant | 高性能、支持过滤 | 需要运行额外服务 | ❌ 过度设计 |
 * | Pinecone | 全托管、无限扩展 | 需要网络、付费 | ❌ 不适合本地 |
 * | ChromaDB | 嵌入式、Python | 需要 Python 运行时 | ❌ 不适合 Electron |
 *
 * 我们的策略：SimpleVectorStore 在内存中运行，
 * 通过 Electron IPC 序列化到磁盘实现持久化。
 *
 * 📚 知识点：持久化策略
 * ─────────────────────
 * Electron App 的数据持久化有几个层次：
 * 1. localStorage: 最简单，但有 5-10MB 限制
 * 2. Electron IPC + fs: 无大小限制，Main Process 读写文件
 * 3. IndexedDB: 浏览器原生，适合大量结构化数据
 * 4. SQLite: 需要 better-sqlite3，最强但有 native 依赖
 *
 * 向量索引可能很大（1000个块 × 1536维 × 4bytes ≈ 6MB），
 * 超出 localStorage 限制，所以用 Electron IPC。
 */

import type { TextNode } from '@llamaindex/core/schema';
import { EmbeddingConfig, SearchResult, SearchOptions, StorageConfig, SearchAlgorithm, HnswConfig, ChunkingStrategy, ChunkingConfig, KnowledgeGraphSummary, VectorStoreInfo, VectorEntryDetail, KnowledgeTriple } from './types';
import { getEmbedding, batchEmbed } from './embedding';

// ════════════════════════════════════════════════════════════
// HNSW Index (Hierarchical Navigable Small World)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：HNSW 算法详解
 * ────────────────────────────
 * HNSW 是目前最流行的近似最近邻（ANN）搜索算法之一。
 * 被 Faiss、Milvus、Qdrant、Pinecone 等主流向量数据库使用。
 *
 * 核心思想：
 * 构建一个多层图（Navigable Small World Graph），
 * 顶层节点少、跳跃大（快速定位大致区域），
 * 底层节点全、连接近（精确定位最近邻）。
 *
 * 类比：
 * 想象你在中国找一个人：
 * - 第 0 层（最顶层）：只有"北京、上海、广州"三个节点 → 快速定位到"上海"
 * - 第 1 层：上海的各个区 → 定位到"浦东新区"
 * - 第 2 层：浦东的各条街 → 定位到"张杨路"
 * - 第 3 层（最底层）：张杨路的每栋楼 → 找到具体的人
 *
 * 参数说明：
 * - M: 每个节点的最大连接数（default: 16）
 *   M 越大 → 图越密 → 搜索越准 → 但内存和构建时间越大
 * - efConstruction: 构建时的搜索宽度（default: 200）
 *   越大 → 构建出的图质量越高 → 但构建越慢
 * - efSearch: 查询时的搜索宽度（default: 50）
 *   越大 → 搜索越准 → 但越慢
 *
 * 时间复杂度：
 * - 构建：O(n × log(n) × M)
 * - 查询：O(log(n) × efSearch)
 * - 暴力搜索：O(n)
 *
 * 对于 < 5000 个向量，暴力搜索通常更快（因为 HNSW 有图遍历开销）。
 * 但 HNSW 在 > 10000 个向量时优势明显。
 */

interface HnswNode {
  id: string;
  level: number;
  /** neighbors[layer] = 该层的邻居 id 列表 */
  neighbors: string[][];
}

export class HnswIndex {
  private nodes: Map<string, HnswNode> = new Map();
  private vectors: Map<string, number[]> = new Map();
  private entryPoint: string | null = null;
  private maxLevel: number = 0;

  private readonly M: number;
  private readonly efConstruction: number;
  private readonly efSearch: number;
  private readonly mL: number; // 层级衰减因子 = 1 / ln(M)

  constructor(config?: HnswConfig) {
    this.M = config?.m ?? 16;
    this.efConstruction = config?.efConstruction ?? 200;
    this.efSearch = config?.efSearch ?? 50;
    this.mL = 1 / Math.log(this.M);
  }

  get size(): number { return this.nodes.size; }

  /** 为新节点随机分配层级（指数衰减概率） */
  private randomLevel(): number {
    let level = 0;
    while (Math.random() < Math.exp(-level / this.mL) && level < 32) {
      level++;
    }
    return level;
  }

  /** 计算两个向量的距离（1 - cosine_similarity，值越小越相似） */
  private distance(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 2;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 2 : 1 - dot / denom;
  }

  /**
   * 在指定层级搜索最近的 ef 个邻居
   * 使用 greedy search with a priority queue
   */
  private searchLayer(
    queryVec: number[], entryId: string, ef: number, level: number,
  ): Array<{ id: string; dist: number }> {
    const visited = new Set<string>([entryId]);
    const entryDist = this.distance(queryVec, this.vectors.get(entryId)!);

    // candidates: 待探索（最小堆语义），results: 已找到的最近邻（最大堆语义）
    const candidates: Array<{ id: string; dist: number }> = [{ id: entryId, dist: entryDist }];
    const results: Array<{ id: string; dist: number }> = [{ id: entryId, dist: entryDist }];

    while (candidates.length > 0) {
      // 取 candidates 中距离最小的
      candidates.sort((a, b) => a.dist - b.dist);
      const nearest = candidates.shift()!;

      // results 中距离最大的
      results.sort((a, b) => a.dist - b.dist);
      const furthestResult = results[results.length - 1];

      if (nearest.dist > furthestResult.dist && results.length >= ef) break;

      const node = this.nodes.get(nearest.id);
      if (!node || !node.neighbors[level]) continue;

      for (const neighborId of node.neighbors[level]) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborVec = this.vectors.get(neighborId);
        if (!neighborVec) continue;

        const dist = this.distance(queryVec, neighborVec);
        results.sort((a, b) => a.dist - b.dist);
        const curFurthest = results[results.length - 1];

        if (dist < curFurthest.dist || results.length < ef) {
          candidates.push({ id: neighborId, dist });
          results.push({ id: neighborId, dist });
          if (results.length > ef) {
            results.sort((a, b) => a.dist - b.dist);
            results.pop();
          }
        }
      }
    }

    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  /** 选择 M 个最近的邻居（简单启发式） */
  private selectNeighbors(
    candidates: Array<{ id: string; dist: number }>, maxNeighbors: number,
  ): string[] {
    return candidates
      .sort((a, b) => a.dist - b.dist)
      .slice(0, maxNeighbors)
      .map(c => c.id);
  }

  /** 插入一个向量 */
  insert(id: string, vector: number[]): void {
    if (this.nodes.has(id)) {
      // Update existing: remove old and re-insert
      this.remove(id);
    }

    const level = this.randomLevel();
    const node: HnswNode = { id, level, neighbors: [] };
    for (let i = 0; i <= level; i++) {
      node.neighbors.push([]);
    }

    this.nodes.set(id, node);
    this.vectors.set(id, vector);

    if (!this.entryPoint) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentId = this.entryPoint;

    // Phase 1: Traverse from top to the node's level (greedy, single nearest)
    for (let l = this.maxLevel; l > level; l--) {
      const results = this.searchLayer(vector, currentId, 1, l);
      if (results.length > 0) currentId = results[0].id;
    }

    // Phase 2: Insert at each layer from level down to 0
    const maxM = this.M;
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const neighbors = this.searchLayer(vector, currentId, this.efConstruction, l);
      const selected = this.selectNeighbors(neighbors, maxM);

      node.neighbors[l] = selected;

      // Add bidirectional connections
      for (const neighborId of selected) {
        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode || !neighborNode.neighbors[l]) continue;
        neighborNode.neighbors[l].push(id);

        // Prune if too many neighbors
        if (neighborNode.neighbors[l].length > maxM * 2) {
          const neighborVec = this.vectors.get(neighborId)!;
          const scored = neighborNode.neighbors[l]
            .map(nId => ({ id: nId, dist: this.distance(neighborVec, this.vectors.get(nId)!) }));
          neighborNode.neighbors[l] = this.selectNeighbors(scored, maxM);
        }
      }

      if (neighbors.length > 0) currentId = neighbors[0].id;
    }

    if (level > this.maxLevel) {
      this.entryPoint = id;
      this.maxLevel = level;
    }
  }

  /** 删除一个向量 */
  remove(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove from all neighbor lists
    for (let l = 0; l <= node.level; l++) {
      for (const neighborId of node.neighbors[l]) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor && neighbor.neighbors[l]) {
          neighbor.neighbors[l] = neighbor.neighbors[l].filter(nId => nId !== id);
        }
      }
    }

    this.nodes.delete(id);
    this.vectors.delete(id);

    // Update entry point if needed
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.maxLevel = 0;
      } else {
        // Pick any remaining node with highest level
        let bestId = '';
        let bestLevel = -1;
        for (const [nId, n] of this.nodes) {
          if (n.level > bestLevel) {
            bestLevel = n.level;
            bestId = nId;
          }
        }
        this.entryPoint = bestId;
        this.maxLevel = bestLevel;
      }
    }
    return true;
  }

  /** 查询最近的 topK 个邻居 */
  search(queryVec: number[], topK: number): Array<{ id: string; score: number }> {
    if (!this.entryPoint || this.nodes.size === 0) return [];

    let currentId = this.entryPoint;

    // Traverse from top layer to layer 1
    for (let l = this.maxLevel; l > 0; l--) {
      const results = this.searchLayer(queryVec, currentId, 1, l);
      if (results.length > 0) currentId = results[0].id;
    }

    // Search at layer 0 with ef = max(efSearch, topK)
    const ef = Math.max(this.efSearch, topK);
    const results = this.searchLayer(queryVec, currentId, ef, 0);

    return results
      .slice(0, topK)
      .map(r => ({ id: r.id, score: 1 - r.dist })); // Convert distance back to similarity
  }

  clear(): void {
    this.nodes.clear();
    this.vectors.clear();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  // ── Serialization ──

  /**
   * 序列化 HNSW 索引为 JSON-safe 对象。
   * 保存图结构（节点+边）、向量数据、入口点和配置参数，
   * 这样反序列化后无需重建即可直接使用。
   */
  serialize(): SerializedHnswIndex {
    const nodesArr: Array<{ id: string; level: number; neighbors: string[][] }> = [];
    for (const [, node] of this.nodes) {
      nodesArr.push({ id: node.id, level: node.level, neighbors: node.neighbors });
    }
    const vectorsArr: Array<{ id: string; vec: number[] }> = [];
    for (const [id, vec] of this.vectors) {
      vectorsArr.push({ id, vec });
    }
    return {
      nodes: nodesArr,
      vectors: vectorsArr,
      entryPoint: this.entryPoint,
      maxLevel: this.maxLevel,
      config: { m: this.M, efConstruction: this.efConstruction, efSearch: this.efSearch },
    };
  }

  static deserialize(data: SerializedHnswIndex): HnswIndex {
    const idx = new HnswIndex(data.config);
    for (const n of data.nodes) {
      idx.nodes.set(n.id, { id: n.id, level: n.level, neighbors: n.neighbors });
    }
    for (const v of data.vectors) {
      idx.vectors.set(v.id, v.vec);
    }
    idx.entryPoint = data.entryPoint;
    idx.maxLevel = data.maxLevel;
    return idx;
  }
}

/** HNSW 索引序列化格式 */
export interface SerializedHnswIndex {
  nodes: Array<{ id: string; level: number; neighbors: string[][] }>;
  vectors: Array<{ id: string; vec: number[] }>;
  entryPoint: string | null;
  maxLevel: number;
  config: { m: number; efConstruction: number; efSearch: number };
}

// ════════════════════════════════════════════════════════════
// In-Memory Vector Store
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：存储的数据结构
 * ────────────────────────
 * 每个向量条目包含：
 * - id: 唯一标识（对应 TextNode 的 id）
 * - embedding: 向量数组
 * - text: 原始文本（用于返回结果）
 * - metadata: 元数据（文件名、页码等）
 *
 * 为什么存文本？不是只存向量就够了吗？
 * 因为检索到向量后，我们需要返回对应的文本给 LLM。
 * 向量只用于相似度计算，文本才是最终输出。
 */
export interface VectorEntry {
  id: string;
  embedding: number[];
  text: string;
  metadata: Record<string, any>;
}

/**
 * 序列化格式（用于持久化到磁盘）
 * version 3: 新增 HNSW 索引和搜索算法配置
 * version 4: 新增分块策略和知识图谱统计
 */
export interface SerializedVectorStore {
  version: 2 | 3 | 4;
  entries: VectorEntry[];
  meta: {
    embeddingProvider: string;
    embeddingModel: string;
    createdAt: number;
    updatedAt: number;
  };
  /** version 3: HNSW 序列化数据（仅当使用 HNSW 时才存在） */
  hnsw?: SerializedHnswIndex;
  /** version 3: 当前搜索算法 */
  searchAlgorithm?: SearchAlgorithm;
  /** version 3: HNSW 配置参数 */
  hnswConfig?: HnswConfig;
  /** version 4: 分块策略 */
  chunkingStrategy?: ChunkingStrategy;
  /** version 4: 分块配置 */
  chunkingConfig?: ChunkingConfig;
  /** version 4: 知识图谱统计摘要 */
  knowledgeGraphStats?: KnowledgeGraphSummary | null;
}

/**
 * 📚 余弦相似度（Cosine Similarity）
 * ──────────────────────────────────
 * cos(A, B) = (A·B) / (||A|| × ||B||)
 *
 * 取值范围 [-1, 1]：
 *   1  = 完全相同方向 → 语义相同
 *   0  = 垂直 → 语义无关
 *  -1  = 完全相反 → 语义相反（实际中很少见）
 *
 * 在 Embedding 空间中，>0.8 通常表示高度相关
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

// ════════════════════════════════════════════════════════════
// LocalVectorStore Class
// ════════════════════════════════════════════════════════════

export class LocalVectorStore {
  private entries: Map<string, VectorEntry> = new Map();
  private embeddingProvider: string = '';
  private embeddingModel: string = '';
  private createdAt: number = Date.now();
  private updatedAt: number = Date.now();

  // HNSW index (optional, built on demand)
  private hnswIndex: HnswIndex | null = null;
  private _searchAlgorithm: SearchAlgorithm = 'brute-force';
  private _hnswConfig: HnswConfig = {};

  // 分块策略 (version 4)
  private _chunkingStrategy: ChunkingStrategy | null = null;
  private _chunkingConfig: ChunkingConfig | null = null;

  // 知识图谱统计 (version 4)
  private _knowledgeGraphStats: KnowledgeGraphSummary | null = null;

  constructor() {}

  /** 设置搜索算法（brute-force 或 hnsw） */
  setSearchAlgorithm(algo: SearchAlgorithm, hnswConfig?: HnswConfig): void {
    this._searchAlgorithm = algo;
    if (hnswConfig) this._hnswConfig = hnswConfig;

    if (algo === 'hnsw' && !this.hnswIndex) {
      this.rebuildHnswIndex();
    }
  }

  get searchAlgorithm(): SearchAlgorithm { return this._searchAlgorithm; }

  /** 从现有数据重建 HNSW 索引（同步，小数据集用） */
  rebuildHnswIndex(): void {
    this.hnswIndex = new HnswIndex(this._hnswConfig);
    for (const entry of this.entries.values()) {
      this.hnswIndex.insert(entry.id, entry.embedding);
    }
  }

  /** 从现有数据异步重建 HNSW 索引，每 batchSize 个向量 yield 一次，避免阻塞 UI */
  async rebuildHnswIndexAsync(
    config?: HnswConfig,
    onProgress?: (done: number, total: number) => void,
    batchSize = 100,
  ): Promise<void> {
    if (config) this._hnswConfig = config;
    this.hnswIndex = new HnswIndex(this._hnswConfig);
    const entries = Array.from(this.entries.values());
    const total = entries.length;
    for (let i = 0; i < total; i++) {
      this.hnswIndex.insert(entries[i].id, entries[i].embedding);
      if ((i + 1) % batchSize === 0) {
        onProgress?.(i + 1, total);
        // yield to the event loop so UI can update
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }
    onProgress?.(total, total);
  }

  // ── 分块策略（Chunking Config） ──

  /** 设置分块策略信息（在索引构建时调用） */
  setChunkingConfig(strategy: ChunkingStrategy, config?: ChunkingConfig): void {
    this._chunkingStrategy = strategy;
    this._chunkingConfig = config ?? null;
  }

  get chunkingStrategy(): ChunkingStrategy | null { return this._chunkingStrategy; }
  get chunkingConfig(): ChunkingConfig | null { return this._chunkingConfig; }

  // ── 知识图谱统计（Knowledge Graph Stats） ──

  /** 设置知识图谱统计信息（在知识图谱构建完成后调用） */
  setKnowledgeGraphStats(stats: KnowledgeGraphSummary | null): void {
    this._knowledgeGraphStats = stats;
  }

  get knowledgeGraphStats(): KnowledgeGraphSummary | null { return this._knowledgeGraphStats; }
  get hasKnowledgeGraph(): boolean { return this._knowledgeGraphStats !== null && this._knowledgeGraphStats.tripleCount > 0; }
  get hasHnswIndex(): boolean { return this.hnswIndex !== null && this.hnswIndex.size > 0; }

  // ── Write Operations ──

  /**
   * 添加节点到向量存储
   *
   * 📚 流程：
   * 1. 提取节点文本
   * 2. 调用 Embedding API 获取向量
   * 3. 存入内存 Map
   *
   * 为什么用 Map 而不是 Array？
   * - O(1) 的按 ID 查找/删除
   * - 方便增量更新（覆盖旧向量）
   * - 内存占用相同
   */
  async addNodes(
    nodes: TextNode[],
    embeddingConfig: EmbeddingConfig,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    this.embeddingProvider = embeddingConfig.provider;
    this.embeddingModel = embeddingConfig.model;

    // 批量 Embedding
    const texts = nodes.map(n => {
      // 如果是 SentenceWindow 策略，embedding 用核心句（text），不用窗口
      return n.getText();
    });

    const embeddings = await batchEmbed(texts, embeddingConfig, {
      batchSize: 10,
      delayMs: 100,
      onProgress,
    });

    // 存入 Map + HNSW
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const entry: VectorEntry = {
        id: node.id_,
        embedding: embeddings[i],
        text: node.getText(),
        metadata: { ...node.metadata },
      };
      this.entries.set(node.id_, entry);
      if (this.hnswIndex) {
        this.hnswIndex.insert(node.id_, embeddings[i]);
      }
    }

    this.updatedAt = Date.now();
  }

  /**
   * 删除指定文档的所有向量
   * (用于增量更新：先删旧的，再添加新的)
   */
  removeByDocId(parentDocId: string): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.metadata.parentDocId === parentDocId) {
        this.entries.delete(id);
        if (this.hnswIndex) this.hnswIndex.remove(id);
        removed++;
      }
    }
    this.updatedAt = Date.now();
    return removed;
  }

  /**
   * 删除指定文件路径的所有向量
   */
  removeByFilePath(filePath: string): number {
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.metadata.filePath === filePath) {
        this.entries.delete(id);
        if (this.hnswIndex) this.hnswIndex.remove(id);
        removed++;
      }
    }
    this.updatedAt = Date.now();
    return removed;
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.entries.clear();
    if (this.hnswIndex) this.hnswIndex.clear();
    this.updatedAt = Date.now();
  }

  // ── Read Operations ──

  /**
   * 📚 向量检索：支持暴力搜索和 HNSW
   *
   * 暴力搜索：O(n × d) — 遍历所有向量，适合小数据集
   * HNSW：O(log(n)) — 图索引搜索，适合大数据集
   *
   * 支持 precomputedQueryVec 参数用于 HyDE 模式（跳过 query embedding）
   */
  async search(
    query: string,
    embeddingConfig: EmbeddingConfig,
    options?: SearchOptions,
    precomputedQueryVec?: number[],
  ): Promise<SearchResult[]> {
    const topK = options?.topK ?? 5;
    const minScore = options?.minScore ?? 0.0;

    // 1. Query embedding (或使用预计算的 HyDE 向量)
    const queryVec = precomputedQueryVec ?? await getEmbedding(query, embeddingConfig);

    // 2. 根据算法选择搜索策略
    let candidates: Array<{ entry: VectorEntry; score: number }> = [];

    const useHnsw = this._searchAlgorithm === 'hnsw' && this.hnswIndex && this.hnswIndex.size > 0;

    if (useHnsw) {
      // HNSW search: 先用 HNSW 找到候选，再应用过滤
      const hnswResults = this.hnswIndex!.search(queryVec, topK * 3); // 多检索一些用于过滤后保证数量
      for (const { id, score } of hnswResults) {
        const entry = this.entries.get(id);
        if (!entry) continue;
        if (score < minScore) continue;

        // 元数据过滤
        if (options?.filters) {
          const { fileTypes, fileNames, dateRange } = options.filters;
          if (fileTypes && !fileTypes.includes(entry.metadata.fileType)) continue;
          if (fileNames && !fileNames.includes(entry.metadata.fileName)) continue;
          if (dateRange) {
            const indexed = entry.metadata.indexedAt || 0;
            if (dateRange.from && indexed < dateRange.from) continue;
            if (dateRange.to && indexed > dateRange.to) continue;
          }
        }

        candidates.push({ entry, score });
      }
    } else {
      // Brute force search
      for (const entry of this.entries.values()) {
        if (options?.filters) {
          const { fileTypes, fileNames, dateRange } = options.filters;
          if (fileTypes && !fileTypes.includes(entry.metadata.fileType)) continue;
          if (fileNames && !fileNames.includes(entry.metadata.fileName)) continue;
          if (dateRange) {
            const indexed = entry.metadata.indexedAt || 0;
            if (dateRange.from && indexed < dateRange.from) continue;
            if (dateRange.to && indexed > dateRange.to) continue;
          }
        }

        const score = cosineSimilarity(queryVec, entry.embedding);
        if (score >= minScore) {
          candidates.push({ entry, score });
        }
      }
    }

    // 3. Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // 4. Take top K
    const topResults = candidates.slice(0, topK);

    // 5. Format results
    return topResults.map(({ entry, score }) => ({
      text: entry.metadata.window || entry.text,
      score,
      metadata: entry.metadata as any,
      nodeId: entry.id,
    }));
  }

  // ── Serialization (持久化) ──

  /**
   * 📚 序列化为 JSON
   *
   * 向量是 number[]，JSON.stringify 会把每个数字完整保存。
   * 1000 个块 × 1536 维 ≈ 序列化后 20-30MB JSON。
   *
   * 优化建议（未来）：
   * - 用 Float32Array + Base64 编码可以减少 3-4 倍体积
   * - 但目前 JSON 格式更易调试，且桌面 App 磁盘空间充足
   */
  serialize(): SerializedVectorStore {
    const result: SerializedVectorStore = {
      version: 4,
      entries: Array.from(this.entries.values()),
      meta: {
        embeddingProvider: this.embeddingProvider,
        embeddingModel: this.embeddingModel,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      },
      searchAlgorithm: this._searchAlgorithm,
      hnswConfig: this._hnswConfig,
      // version 4 字段
      chunkingStrategy: this._chunkingStrategy ?? undefined,
      chunkingConfig: this._chunkingConfig ?? undefined,
      knowledgeGraphStats: this._knowledgeGraphStats,
    };
    // 仅当 HNSW 索引已构建时才序列化（避免无用数据）
    if (this.hnswIndex && this._searchAlgorithm === 'hnsw') {
      result.hnsw = this.hnswIndex.serialize();
    }
    return result;
  }

  /**
   * 从序列化数据恢复（兼容 version 2、3 和 4）
   */
  static deserialize(data: SerializedVectorStore): LocalVectorStore {
    const store = new LocalVectorStore();
    for (const entry of data.entries) {
      store.entries.set(entry.id, entry);
    }
    store.embeddingProvider = data.meta.embeddingProvider;
    store.embeddingModel = data.meta.embeddingModel;
    store.createdAt = data.meta.createdAt;
    store.updatedAt = data.meta.updatedAt;

    // version 3: 恢复搜索算法和 HNSW
    if (data.searchAlgorithm) {
      store._searchAlgorithm = data.searchAlgorithm;
    }
    if (data.hnswConfig) {
      store._hnswConfig = data.hnswConfig;
    }
    if (data.hnsw) {
      store.hnswIndex = HnswIndex.deserialize(data.hnsw);
    }

    // version 4: 恢复分块策略和知识图谱统计
    if (data.chunkingStrategy) {
      store._chunkingStrategy = data.chunkingStrategy;
    }
    if (data.chunkingConfig) {
      store._chunkingConfig = data.chunkingConfig;
    }
    if (data.knowledgeGraphStats !== undefined) {
      store._knowledgeGraphStats = data.knowledgeGraphStats ?? null;
    }

    return store;
  }

  // ── Stats ──

  get size(): number {
    return this.entries.size;
  }

  getStats(): {
    totalEntries: number;
    embeddingProvider: string;
    embeddingModel: string;
    files: Map<string, number>;
    createdAt: number;
    updatedAt: number;
  } {
    const files = new Map<string, number>();
    for (const entry of this.entries.values()) {
      const fp = entry.metadata.filePath || 'unknown';
      files.set(fp, (files.get(fp) || 0) + 1);
    }
    return {
      totalEntries: this.entries.size,
      embeddingProvider: this.embeddingProvider,
      embeddingModel: this.embeddingModel,
      files,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * 检查某个文件是否已经被索引
   */
  isFileIndexed(filePath: string): boolean {
    for (const entry of this.entries.values()) {
      if (entry.metadata.filePath === filePath) return true;
    }
    return false;
  }

  /**
   * 获取已索引的文件列表
   */
  getIndexedFiles(): Array<{ filePath: string; fileName: string; chunkCount: number; indexedAt: number }> {
    const fileMap = new Map<string, { fileName: string; count: number; indexedAt: number }>();
    for (const entry of this.entries.values()) {
      const fp = entry.metadata.filePath;
      if (!fileMap.has(fp)) {
        fileMap.set(fp, {
          fileName: entry.metadata.fileName,
          count: 0,
          indexedAt: entry.metadata.indexedAt || 0,
        });
      }
      fileMap.get(fp)!.count++;
    }
    return Array.from(fileMap.entries()).map(([filePath, info]) => ({
      filePath,
      fileName: info.fileName,
      chunkCount: info.count,
      indexedAt: info.indexedAt,
    }));
  }

  // ── 完整信息 (Version 4) ──

  /**
   * 获取向量库的完整信息（用于前端展示）
   *
   * 包含：基础统计、分块策略、搜索算法、HNSW 状态、知识图谱状态
   */
  getInfo(): VectorStoreInfo {
    return {
      totalEntries: this.entries.size,
      embeddingProvider: this.embeddingProvider,
      embeddingModel: this.embeddingModel,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      files: this.getIndexedFiles(),

      chunkingStrategy: this._chunkingStrategy,
      chunkingConfig: this._chunkingConfig,

      searchAlgorithm: this._searchAlgorithm,
      hasHnswIndex: this.hnswIndex !== null && this.hnswIndex.size > 0,
      hnswConfig: this._searchAlgorithm === 'hnsw' ? this._hnswConfig : null,

      hasKnowledgeGraph: this._knowledgeGraphStats !== null && this._knowledgeGraphStats.tripleCount > 0,
      knowledgeGraphStats: this._knowledgeGraphStats,
    };
  }

  /**
   * 按 ID 获取单条向量的原始数据
   */
  getEntry(id: string): VectorEntry | null {
    return this.entries.get(id) ?? null;
  }

  /**
   * 获取单条向量的详细信息（含元数据和相关知识图谱三元组）
   *
   * @param id - 向量条目 ID
   * @param allTriples - 可选，知识图谱中的所有三元组（用于筛选相关三元组）
   */
  getEntryDetail(id: string, allTriples?: KnowledgeTriple[]): VectorEntryDetail | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    // 筛选与该文本块相关的三元组（通过 sourceChunkId 关联）
    const relatedTriples = allTriples
      ? allTriples.filter(t => t.sourceChunkId === id)
      : [];

    return {
      id: entry.id,
      text: entry.text,
      metadata: { ...entry.metadata },
      embeddingDimensions: entry.embedding.length,
      relatedTriples,
    };
  }

  /**
   * 获取所有向量条目的 ID 列表
   */
  getEntryIds(): string[] {
    return Array.from(this.entries.keys());
  }
}

// ════════════════════════════════════════════════════════════
// Persistence Helpers (through Electron IPC)
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：Electron IPC 持久化接口
 * ────────────────────────────────────
 * 我们定义一个 StorageAdapter 接口，让持久化逻辑与存储实现解耦。
 * 在 Electron 环境中，通过 IPC 调用 Main Process 的 fs 操作。
 * 在测试环境中，可以用内存实现。
 */
export interface StorageAdapter {
  save(key: string, data: any): Promise<void>;
  load(key: string): Promise<any | null>;
}

const VECTOR_STORE_KEY = 'guyue_rag_llamaindex_store';

export async function saveVectorStore(
  store: LocalVectorStore,
  adapter: StorageAdapter,
): Promise<void> {
  const serialized = store.serialize();
  await adapter.save(VECTOR_STORE_KEY, serialized);
}

export async function loadVectorStore(
  adapter: StorageAdapter,
): Promise<LocalVectorStore | null> {
  const data = await adapter.load(VECTOR_STORE_KEY);
  if (!data) return null;
  try {
    return LocalVectorStore.deserialize(data as SerializedVectorStore);
  } catch (err) {
    console.error('Failed to deserialize vector store:', err);
    return null;
  }
}
