/**
 * RAG LlamaIndex Module — Knowledge Graph Extraction
 *
 * ═══════════════════════════════════════════════════════════
 * 📚 深入讲解：知识图谱（Knowledge Graph, KG）
 * ═══════════════════════════════════════════════════════════
 *
 * 一、什么是知识图谱？
 * ────────────────────
 * 知识图谱是一种用"图"（Graph）来组织知识的数据结构。
 *
 * 图 = 节点（Node）+ 边（Edge）
 *   节点 = 实体（Entity）：人、地点、概念、技术...
 *   边 = 关系（Relation）：is_a, used_by, created, located_in...
 *
 * 最基本的单位是"三元组"（Triple）：
 *   (Subject, Predicate, Object)
 *   (主语,    谓语/关系,  宾语)
 *
 * 例子：
 *   ("React", "is_a", "前端框架")
 *   ("React", "created_by", "Facebook")
 *   ("LlamaIndex", "supports", "TypeScript")
 *   ("RAG", "uses", "向量检索")
 *
 * 二、为什么 RAG 需要知识图谱？
 * ───────────────────────────
 * 纯向量检索的局限：
 *   Q: "React 和 Vue 有什么关系？"
 *   → 向量检索找到提到 React 的块和提到 Vue 的块
 *   → 但没有任何块同时深入比较两者
 *   → LLM 只能浅层回答
 *
 * 加入知识图谱后：
 *   → 从图中找到：React --is_a--> 前端框架 <--is_a-- Vue
 *   → 发现共同关系：都是"前端框架"
 *   → 顺着图找到更多：React --uses--> JSX, Vue --uses--> Template
 *   → LLM 可以结构化地比较
 *
 * 三、构建知识图谱的方法
 * ──────────────────────
 * 1. 手动构建：人工标注实体和关系 → 准确但昂贵
 * 2. 规则提取：用正则/NLP 工具提取 → 快速但粗糙
 * 3. LLM 提取：让大语言模型阅读文本并提取三元组 → 平衡
 *
 * 我们用方法 3：给 LLM 一段文本，要求它输出结构化的三元组。
 *
 * 四、提取 Prompt 设计
 * ────────────────────
 * 好的 Prompt 应该：
 * - 明确输出格式（JSON 结构化）
 * - 给出实例（few-shot learning）
 * - 限定实体类型（避免过度提取）
 * - 要求置信度评分
 *
 * 五、图存储
 * ─────────
 * 对于我们的桌面 App，不需要 Neo4j 这种图数据库。
 * 简单的 Map + 邻接表 就够用了。
 * 数据量：1000 个块 × 10 个三元组 = 10,000 条边 → 内存完全够。
 */

import { KnowledgeTriple, KnowledgeGraphConfig, LLMFunction } from './types';

// ════════════════════════════════════════════════════════════
// Triple Extraction Prompt
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：Prompt Engineering for Information Extraction
 * ────────────────────────────────────────────────────────
 * 信息提取（IE）是 NLP 的经典任务。用 LLM 做 IE 的关键是：
 *
 * 1. 结构化输出：告诉模型输出 JSON，而不是自由文本
 * 2. Few-shot 示例：给 2-3 个输入→输出的范例
 * 3. 约束条件：限制实体类型、三元组数量
 * 4. 错误处理：模型可能输出格式不对，需要容错解析
 */
function buildExtractionPrompt(
  text: string,
  config: KnowledgeGraphConfig,
): string {
  const maxTriples = config.maxTriplesPerChunk;
  const entityTypesHint = config.entityTypes?.length
    ? `重点关注以下类型的实体：${config.entityTypes.join('、')}`
    : '提取所有有意义的实体';
  const descriptionHint = config.includeEntityDescriptions
    ? '同时为每个主要实体提供一句话描述。'
    : '';

  return `你是一个知识图谱构建专家。请从以下文本中提取知识三元组（subject-predicate-object）。

## 要求
1. 每个三元组表示一个事实或关系
2. 最多提取 ${maxTriples} 个最重要的三元组
3. ${entityTypesHint}
4. 谓语（关系）使用简洁的中文或英文，如"是"、"属于"、"使用"、"创建于"等
5. 为每个三元组评估置信度（0-1），只保留置信度 > 0.5 的
${descriptionHint}

## 输出格式（严格 JSON）
{
  "triples": [
    { "subject": "实体A", "predicate": "关系", "object": "实体B", "confidence": 0.9 }
  ]${config.includeEntityDescriptions ? `,
  "entities": [
    { "name": "实体A", "description": "一句话描述" }
  ]` : ''}
}

## 示例
文本: "React 是 Facebook 开发的开源前端框架，使用 JSX 语法。"
输出:
{
  "triples": [
    { "subject": "React", "predicate": "是", "object": "前端框架", "confidence": 0.95 },
    { "subject": "React", "predicate": "开发者", "object": "Facebook", "confidence": 0.95 },
    { "subject": "React", "predicate": "使用", "object": "JSX", "confidence": 0.9 }
  ]${config.includeEntityDescriptions ? `,
  "entities": [
    { "name": "React", "description": "Facebook 开发的开源前端框架" }
  ]` : ''}
}

## 待提取文本
${text}

请输出 JSON（不要输出其他内容）：`;
}

// ════════════════════════════════════════════════════════════
// Triple Extraction
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：JSON 容错解析
 * ────────────────────────
 * LLM 输出的 JSON 经常有小问题：
 * - 多余的 markdown 代码块标记 ```json ... ```
 * - 尾部逗号（trailing comma）
 * - 注释
 *
 * 所以我们需要一个"宽容"的 JSON 解析器。
 */
function parseJsonLoose(text: string): any {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  // Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  // Try to find JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');
  return JSON.parse(jsonMatch[0]);
}

/**
 * 从单个文本块提取知识三元组
 */
export async function extractTriples(
  text: string,
  sourceChunkId: string,
  config: KnowledgeGraphConfig,
  llmFn: LLMFunction,
): Promise<{
  triples: KnowledgeTriple[];
  entities?: Array<{ name: string; description: string }>;
  error?: string;
}> {
  const prompt = buildExtractionPrompt(text, config);

  try {
    const response = await llmFn(prompt);
    if (!response || response.trim().length === 0) {
      return { triples: [], error: 'LLM returned empty response' };
    }

    let parsed: any;
    try {
      parsed = parseJsonLoose(response);
    } catch (parseErr: any) {
      return { triples: [], error: `JSON parse failed: ${parseErr?.message}. Raw: ${response.substring(0, 200)}` };
    }

    const triples: KnowledgeTriple[] = (parsed.triples || [])
      .filter((t: any) => t.subject && t.predicate && t.object)
      .filter((t: any) => !t.confidence || t.confidence > 0.5)
      .map((t: any) => ({
        subject: String(t.subject).trim(),
        predicate: String(t.predicate).trim(),
        object: String(t.object).trim(),
        sourceChunkId,
        confidence: t.confidence ?? 0.8,
      }));

    const entities = parsed.entities?.map((e: any) => ({
      name: String(e.name).trim(),
      description: String(e.description || '').trim(),
    }));

    return { triples, entities };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`Triple extraction failed for chunk ${sourceChunkId}:`, msg);
    return { triples: [], error: msg };
  }
}

// ════════════════════════════════════════════════════════════
// Knowledge Graph In-Memory Store
// ════════════════════════════════════════════════════════════

/**
 * 📚 知识点：邻接表（Adjacency List）
 * ────────────────────────────────────
 * 图的存储方式之一。对于稀疏图（实体远多于关系），邻接表比邻接矩阵高效。
 *
 * 结构：
 *   Map<实体名, 该实体的所有出边>
 *   "React" → [
 *     { predicate: "is_a", object: "框架", ... },
 *     { predicate: "uses", object: "JSX", ... },
 *   ]
 *
 * 查询操作：
 *   getRelations("React") → 找到 React 的所有关系
 *   getEntitiesWithRelation("is_a") → 找所有 is_a 关系
 *   findPath("React", "Vue") → 两个实体之间的路径
 */

export interface EntityInfo {
  name: string;
  description?: string;
  tripleCount: number;     // 涉及这个实体的三元组数量
}

export class KnowledgeGraph {
  private triples: KnowledgeTriple[] = [];
  private adjacency: Map<string, KnowledgeTriple[]> = new Map();
  private entityDescriptions: Map<string, string> = new Map();

  // ── Write ──

  addTriples(newTriples: KnowledgeTriple[]): void {
    for (const triple of newTriples) {
      this.triples.push(triple);

      // Forward edge: subject → object
      if (!this.adjacency.has(triple.subject)) {
        this.adjacency.set(triple.subject, []);
      }
      this.adjacency.get(triple.subject)!.push(triple);

      // Reverse edge: object → subject (for bidirectional traversal)
      if (!this.adjacency.has(triple.object)) {
        this.adjacency.set(triple.object, []);
      }
      // Store reverse reference with flipped predicate indicator
      this.adjacency.get(triple.object)!.push({
        ...triple,
        // Mark as reverse for distinction
        predicate: `<-${triple.predicate}`,
      });
    }
  }

  addEntityDescriptions(entities: Array<{ name: string; description: string }>): void {
    for (const entity of entities) {
      if (entity.description) {
        this.entityDescriptions.set(entity.name, entity.description);
      }
    }
  }

  /**
   * 删除特定来源块的三元组
   */
  removeBySourceChunk(sourceChunkId: string): number {
    const before = this.triples.length;
    this.triples = this.triples.filter(t => t.sourceChunkId !== sourceChunkId);
    // Rebuild adjacency
    this.rebuildAdjacency();
    return before - this.triples.length;
  }

  clear(): void {
    this.triples = [];
    this.adjacency.clear();
    this.entityDescriptions.clear();
  }

  // ── Query ──

  /**
   * 获取实体的所有直接关系
   */
  getRelations(entity: string): KnowledgeTriple[] {
    return (this.adjacency.get(entity) || []).filter(t => !t.predicate.startsWith('<-'));
  }

  /**
   * 获取涉及某实体的所有三元组（包括作为 subject 和 object）
   */
  getTriplesForEntity(entity: string): KnowledgeTriple[] {
    return this.triples.filter(
      t => t.subject === entity || t.object === entity,
    );
  }

  /**
   * 📚 知识点：基于关键词的图检索
   * ----------------------------
   * 给定一个查询文本，从中提取实体名，
   * 然后在图中查找这些实体的相关三元组。
   *
   * 这是"关键词 → 图检索"的简单方法。
   * 更高级的做法是用 LLM 先识别查询中的实体，
   * 但那样又多了一次 API 调用。
   */
  findRelevantTriples(queryText: string, maxTriples: number = 10): KnowledgeTriple[] {
    const queryLower = queryText.toLowerCase();
    const scored: Array<{ triple: KnowledgeTriple; score: number }> = [];

    for (const triple of this.triples) {
      let score = 0;
      if (queryLower.includes(triple.subject.toLowerCase())) score += 2;
      if (queryLower.includes(triple.object.toLowerCase())) score += 1.5;
      if (queryLower.includes(triple.predicate.toLowerCase())) score += 0.5;
      if (score > 0) {
        scored.push({ triple, score: score * (triple.confidence ?? 0.8) });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTriples)
      .map(s => s.triple);
  }

  /**
   * 获取所有实体的列表（带统计信息）
   */
  getEntities(): EntityInfo[] {
    const entityCounts = new Map<string, number>();
    for (const triple of this.triples) {
      entityCounts.set(triple.subject, (entityCounts.get(triple.subject) || 0) + 1);
      entityCounts.set(triple.object, (entityCounts.get(triple.object) || 0) + 1);
    }

    return Array.from(entityCounts.entries()).map(([name, count]) => ({
      name,
      description: this.entityDescriptions.get(name),
      tripleCount: count,
    })).sort((a, b) => b.tripleCount - a.tripleCount);
  }

  // ── Serialization ──

  serialize(): { triples: KnowledgeTriple[]; entityDescriptions: Record<string, string> } {
    return {
      triples: this.triples,
      entityDescriptions: Object.fromEntries(this.entityDescriptions),
    };
  }

  static deserialize(data: { triples: KnowledgeTriple[]; entityDescriptions: Record<string, string> }): KnowledgeGraph {
    const graph = new KnowledgeGraph();
    graph.triples = data.triples || [];
    graph.entityDescriptions = new Map(Object.entries(data.entityDescriptions || {}));
    graph.rebuildAdjacency();
    return graph;
  }

  // ── Internal ──

  private rebuildAdjacency(): void {
    this.adjacency.clear();
    const triplesCopy = [...this.triples];
    this.triples = [];
    this.addTriples(triplesCopy);
  }

  // ── Random triple sample ──

  getRandomTriple(): { triple: KnowledgeTriple; entityDescs: Record<string, string> } | null {
    if (this.triples.length === 0) return null;
    const triple = this.triples[Math.floor(Math.random() * this.triples.length)];
    const entityDescs: Record<string, string> = {};
    const subDesc = this.entityDescriptions.get(triple.subject);
    if (subDesc) entityDescs[triple.subject] = subDesc;
    const objDesc = this.entityDescriptions.get(triple.object);
    if (objDesc) entityDescs[triple.object] = objDesc;
    return { triple, entityDescs };
  }

  // ── Stats ──

  get tripleCount(): number {
    return this.triples.length;
  }

  get entityCount(): number {
    const entities = new Set<string>();
    for (const t of this.triples) {
      entities.add(t.subject);
      entities.add(t.object);
    }
    return entities.size;
  }
}

// ════════════════════════════════════════════════════════════
// Batch Triple Extraction
// ════════════════════════════════════════════════════════════

/**
 * 从多个文本块批量提取知识三元组并构建图谱
 *
 * 📚 注意：每个块都要调一次 LLM，成本和速度取决于模型。
 * 建议：
 * - 用便宜/快速的模型（如 GPT-4o-mini, Gemini Flash）做提取
 * - 跳过太短的块（<50 字符大概没有有价值的三元组）
 */
/**
 * 构建批量提取 prompt：多个文本块合并为一次请求
 */
function buildBatchExtractionPrompt(
  texts: Array<{ id: string; text: string }>,
  config: KnowledgeGraphConfig,
): string {
  const maxTriples = config.maxTriplesPerChunk;
  const entityTypesHint = config.entityTypes?.length
    ? `重点关注以下类型的实体：${config.entityTypes.join('、')}`
    : '提取所有有意义的实体';
  const descriptionHint = config.includeEntityDescriptions
    ? '同时为每个主要实体提供一句话描述。'
    : '';

  const textBlocks = texts.map((t, i) => `--- 文本块 ${i + 1} (ID: ${t.id}) ---\n${t.text}`).join('\n\n');

  return `你是一个知识图谱构建专家。请从以下 ${texts.length} 个文本块中分别提取知识三元组（subject-predicate-object）。

## 要求
1. 为每个文本块分别提取三元组
2. 每个文本块最多 ${maxTriples} 个最重要的三元组
3. ${entityTypesHint}
4. 谓语使用简洁的中文或英文
5. 为每个三元组评估置信度（0-1），只保留置信度 > 0.5 的
${descriptionHint}

## 输出格式（严格 JSON 数组）
[
  {
    "chunk_id": "文本块ID",
    "triples": [
      { "subject": "实体A", "predicate": "关系", "object": "实体B", "confidence": 0.9 }
    ]${config.includeEntityDescriptions ? `,
    "entities": [
      { "name": "实体A", "description": "一句话描述" }
    ]` : ''}
  }
]

## 待提取文本
${textBlocks}

请输出 JSON 数组（不要输出其他内容）：`;
}

/**
 * 批量提取多个文本块的三元组（一次 API 调用）
 */
async function extractTriplesBatch(
  chunks: Array<{ id: string; text: string }>,
  config: KnowledgeGraphConfig,
  llmFn: LLMFunction,
): Promise<Array<{
  chunkId: string;
  triples: KnowledgeTriple[];
  entities?: Array<{ name: string; description: string }>;
  error?: string;
}>> {
  const prompt = buildBatchExtractionPrompt(chunks, config);

  try {
    const response = await llmFn(prompt);
    if (!response || response.trim().length === 0) {
      return chunks.map(c => ({ chunkId: c.id, triples: [], error: 'LLM returned empty response' }));
    }

    let parsed: any;
    try {
      // Try to parse as JSON array
      let cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        parsed = JSON.parse(arrayMatch[0]);
      } else {
        // Fallback: try as single object (single chunk response)
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) parsed = [JSON.parse(objMatch[0])];
        else throw new Error('No JSON found');
      }
    } catch (parseErr: any) {
      return chunks.map(c => ({ chunkId: c.id, triples: [], error: `JSON parse failed: ${parseErr?.message}` }));
    }

    if (!Array.isArray(parsed)) parsed = [parsed];

    // Map results back to chunks
    const resultMap = new Map<string, any>();
    for (const item of parsed) {
      const id = item.chunk_id || item.chunkId || '';
      resultMap.set(id, item);
    }

    return chunks.map((chunk, idx) => {
      const item = resultMap.get(chunk.id) || parsed[idx];
      if (!item) return { chunkId: chunk.id, triples: [], error: 'No result for this chunk' };

      const triples: KnowledgeTriple[] = (item.triples || [])
        .filter((t: any) => t.subject && t.predicate && t.object)
        .filter((t: any) => !t.confidence || t.confidence > 0.5)
        .map((t: any) => ({
          subject: String(t.subject).trim(),
          predicate: String(t.predicate).trim(),
          object: String(t.object).trim(),
          sourceChunkId: chunk.id,
          confidence: t.confidence ?? 0.8,
        }));

      const entities = item.entities?.map((e: any) => ({
        name: String(e.name).trim(),
        description: String(e.description || '').trim(),
      }));

      return { chunkId: chunk.id, triples, entities };
    });
  } catch (err: any) {
    return chunks.map(c => ({ chunkId: c.id, triples: [], error: err?.message || String(err) }));
  }
}

export async function buildKnowledgeGraph(
  chunks: Array<{ id: string; text: string }>,
  config: KnowledgeGraphConfig,
  llmFn: LLMFunction,
  onProgress?: (msg: string) => void,
): Promise<KnowledgeGraph> {
  const graph = new KnowledgeGraph();
  const minTextLength = 50;
  const BATCH_SIZE = 10; // 每次 API 请求处理的块数

  const validChunks = chunks.filter(c => c.text.length >= minTextLength);
  onProgress?.(`🧠 知识图谱: 处理 ${validChunks.length} 个有效块 (跳过 ${chunks.length - validChunks.length} 个过短块)`);

  let errorCount = 0;
  let totalTriples = 0;
  let lastError = '';
  const totalBatches = Math.ceil(validChunks.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batchChunks = validChunks.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const batchStart = b * BATCH_SIZE + 1;
    const batchEnd = Math.min((b + 1) * BATCH_SIZE, validChunks.length);
    onProgress?.(`  [批次 ${b + 1}/${totalBatches}] 提取三元组（块 ${batchStart}-${batchEnd}）…`);

    const results = await extractTriplesBatch(batchChunks, config, llmFn);

    let batchTriples = 0;
    let batchErrors = 0;
    for (const result of results) {
      if (result.error) {
        batchErrors++;
        errorCount++;
        lastError = result.error;
      }
      graph.addTriples(result.triples);
      if (result.entities) {
        graph.addEntityDescriptions(result.entities);
      }
      batchTriples += result.triples.length;
      totalTriples += result.triples.length;
    }

    if (batchTriples > 0) {
      onProgress?.(`  ✅ 批次 ${b + 1}: 提取到 ${batchTriples} 个三元组 (累计 ${totalTriples})`);
    } else if (batchErrors > 0) {
      onProgress?.(`  ⚠️ 批次 ${b + 1} 提取失败: ${lastError}`);
    }

    // 如果前2批全部失败，提前终止
    if (errorCount >= BATCH_SIZE * 2 && totalTriples === 0 && b < 3) {
      onProgress?.(`❌ 连续 ${errorCount} 个块提取失败，终止构建。最后错误: ${lastError}`);
      break;
    }
  }

  if (errorCount > 0 && totalTriples === 0) {
    onProgress?.(`❌ 全部 ${errorCount} 个块提取失败！最后错误: ${lastError}\n请检查知识图谱 API 配置。`);
  } else if (errorCount > 0) {
    onProgress?.(`⚠️ ${errorCount}/${validChunks.length} 个块提取失败。`);
  }
  onProgress?.(`🎉 知识图谱构建完成: ${graph.tripleCount} 个三元组, ${graph.entityCount} 个实体`);
  return graph;
}
