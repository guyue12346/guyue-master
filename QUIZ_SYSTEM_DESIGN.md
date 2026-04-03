# 智能问答系统（Quiz System）技术设计文档

> **版本**: v1.0  
> **日期**: 2026-03-31  
> **状态**: 设计阶段  

---

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 系统架构](#2-系统架构)
- [3. 基于知识库的出题机制](#3-基于知识库的出题机制)
- [4. 评分机制设计](#4-评分机制设计)
- [5. 自适应提问策略](#5-自适应提问策略遗忘曲线--掌握度模型)
- [6. 持久化存储方案](#6-持久化存储方案)
- [7. 核心数据模型（TypeScript 类型定义）](#7-核心数据模型typescript-类型定义)
- [8. 关键 Prompt 模板](#8-关键-prompt-模板)
- [9. 模块拆分与文件结构](#9-模块拆分与文件结构)
- [10. 与现有系统的集成点](#10-与现有系统的集成点)
- [11. 实现路线图](#11-实现路线图)

---

## 1. 项目概述

### 1.1 背景

GuyueMaster 是一个基于 Electron + React + Vite + TailwindCSS 的桌面应用，已具备完整的 RAG（检索增强生成）管道：

- **向量检索**：`LocalVectorStore`（支持暴力搜索 + HNSW 近似搜索）
- **BM25 全文检索**：经典 BM25 算法实现
- **混合检索**：支持 Alpha 加权融合 和 RRF（Reciprocal Rank Fusion）
- **知识图谱**：LLM 驱动的三元组提取 + 图存储
- **重排序**：支持 MMR / LLM / Cohere / Jina 多种 Reranker
- **Embedding 提供商**：Gemini / OpenAI / 通义千问 / 智谱 / Ollama / 自定义
- **LLM 提供商**：Gemini / OpenAI / Anthropic / DeepSeek / 智谱 / Moonshot / MiniMax / Ollama / Zenmux

现需在此基础上构建一个 **智能问答系统**，用于：

1. **知识熟练度锻炼** — 基于知识库自动出题，反复练习巩固
2. **模拟面试** — 模拟真实面试场景，逐步深入追问
3. **自适应复习** — 根据掌握程度和遗忘曲线，智能调度复习

### 1.2 核心目标

| 目标 | 描述 |
|------|------|
| 🎯 精准出题 | 基于 RAG 从知识库精准提取知识点，LLM 生成高质量题目 |
| 📊 科学评分 | 多维度评分（关键点覆盖 + 准确性 + 完整性 + 表达），提供详细反馈 |
| 🧠 智能调度 | 结合 SM-2 间隔重复算法 + 艾宾浩斯遗忘曲线，科学安排复习 |
| 💾 可靠存储 | 分层持久化（热/温/冷数据），与现有 Electron 文件系统集成 |

### 1.3 使用场景

```
场景1: 日常练习
  用户选择一个知识领域 → 系统自动出 10 道题
  → 用户逐题回答 → 系统实时评分 + 给出反馈
  → 结束后生成练习报告

场景2: 模拟面试
  用户选择面试主题 → 系统扮演面试官
  → 基于用户回答进行追问 → 多轮对话式面试
  → 结束后生成面试评估报告

场景3: 智能复习
  系统根据遗忘曲线自动推送"即将遗忘"的知识点
  → 用户回答 → 答对则延长复习间隔，答错则缩短
  → 形成长期记忆
```

---

## 2. 系统架构

### 2.1 架构总图

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI 层 (React + TailwindCSS)              │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ QuizPractice │  │ MockInterview │  │  QuizDashboard       │  │
│  │  练习模式     │  │  面试模拟      │  │  统计/掌握度仪表盘   │  │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
├─────────┴──────────────────┴──────────────────────┴──────────────┤
│                        服务层 (Services)                         │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ quizEngine.ts   │  │ scorer.ts    │  │ scheduler.ts       │  │
│  │                 │  │              │  │                    │  │
│  │ · 知识点采样     │  │ · 语义相似度  │  │ · SM-2 间隔重复    │  │
│  │ · LLM 题目生成  │  │ · 关键点检测  │  │ · 遗忘曲线计算     │  │
│  │ · 题目去重      │  │ · LLM 深度评  │  │ · 出题优先级排序   │  │
│  │ · 追问生成      │  │ · 多维度打分  │  │ · 策略配比         │  │
│  └────────┬────────┘  └──────┬───────┘  └─────────┬──────────┘  │
│           │                  │                     │             │
│  ┌────────┴──────────────────┴─────────────────────┴──────────┐  │
│  │                  storageService.ts                          │  │
│  │  · 掌握度 CRUD  · 题目缓存  · Session 归档  · 全局统计     │  │
│  └───────────────────────────┬────────────────────────────────┘  │
├──────────────────────────────┼───────────────────────────────────┤
│                        基础设施层                                │
│                              │                                  │
│  ┌──────────────┐  ┌────────┴────────┐  ┌────────────────────┐  │
│  │ RAG Pipeline │  │  chatService.ts │  │ Electron IPC       │  │
│  │              │  │                 │  │                    │  │
│  │ · 向量检索    │  │ · 多模型 LLM    │  │ · save-app-data    │  │
│  │ · BM25       │  │ · 流式响应      │  │ · load-app-data    │  │
│  │ · 知识图谱    │  │ · Tool Calling  │  │ · writeFile        │  │
│  │ · Reranker   │  │                 │  │ · readFile         │  │
│  └──────────────┘  └─────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
                              出题流程
                    ┌──────────────────────┐
                    │                      │
  调度引擎 ──────── ▶│   1. 确定出题策略     │
  (哪些知识点需要复习)│   2. 采样知识 chunks  │◀──── RAG Pipeline
                    │   3. LLM 生成题目     │◀──── chatService
                    │   4. 去重 & 缓存      │◀──── storageService
                    └──────────┬───────────┘
                               │ 题目
                               ▼
                    ┌──────────────────────┐
                    │                      │
  用户 ──回答────── ▶│   评分引擎           │
                    │   1. Embedding 相似度 │◀──── RAG Embedding
                    │   2. 关键点命中检测    │
                    │   3. LLM 深度评分     │◀──── chatService
                    │   4. 多维度综合评分    │
                    └──────────┬───────────┘
                               │ 评分结果
                               ▼
                    ┌──────────────────────┐
                    │                      │
                    │   调度引擎更新        │
                    │   1. 更新掌握度       │──── ▶ storageService
                    │   2. 重算遗忘曲线     │
                    │   3. 调整复习间隔     │
                    │   4. 排序下次出题优先级│
                    └──────────────────────┘
```

---

## 3. 基于知识库的出题机制

### 3.1 题目类型体系

设计 5 种题型，覆盖从记忆到应用的不同认知层次（参考布鲁姆分类法）：

| 题型 | 代码标识 | 认知层次 | 描述 | 示例 |
|------|---------|---------|------|------|
| 概念解释 | `concept` | 记忆/理解 | 解释一个核心概念 | "请解释什么是 TCP 三次握手？" |
| 对比分析 | `comparison` | 分析 | 比较两个相关概念的异同 | "进程和线程的区别是什么？" |
| 应用场景 | `scenario` | 应用/综合 | 在给定场景下做设计/选择 | "高并发场景下，Redis 和 Memcached 怎么选？" |
| 代码实操 | `coding` | 应用/创造 | 写出实现/分析代码 | "实现一个 LRU 缓存" |
| 追问深入 | `follow_up` | 评价 | 根据上一题回答进行追问 | "你提到了 XXX，能再展开说说吗？" |

**难度分级**（1-5）：

| 等级 | 描述 | 对应面试级别 |
|------|------|-------------|
| 1 | 入门基础 | 实习/校招基础 |
| 2 | 概念理解 | 校招进阶 |
| 3 | 综合应用 | 社招初中级 |
| 4 | 深度分析 | 社招高级 |
| 5 | 专家追问 | 架构师/专家 |

### 3.2 出题流程详解

#### Step 1: 知识点采样

从知识库中选择用于出题的知识片段，提供三种互补策略：

**策略 A — 文档/章节随机采样**

```typescript
/**
 * 从向量库中随机采样 N 个 chunks
 * 适用于：新用户首次使用、探索新知识领域
 */
async function sampleByRandom(
  vectorStore: LocalVectorStore,
  count: number,
  excludeIds?: Set<string>  // 排除已出过题的 chunk
): Promise<TextChunk[]> {
  const allChunks = vectorStore.getAllNodes();
  const candidates = allChunks.filter(c => !excludeIds?.has(c.id_));
  // Fisher-Yates 洗牌 + 取前 N 个
  return shuffleAndTake(candidates, count);
}
```

**策略 B — 知识图谱实体采样**

```typescript
/**
 * 从知识图谱中选取关键实体，再检索相关 chunks
 * 适用于：知识图谱已建立的场景，能出更有深度的对比题/关联题
 *
 * 例：从 KG 中发现 (React, is_a, 前端框架) 和 (Vue, is_a, 前端框架)
 *     → 自然可以出"React 和 Vue 的对比题"
 */
async function sampleByKnowledgeGraph(
  kg: KnowledgeGraph,
  vectorStore: LocalVectorStore,
  config: EmbeddingConfig
): Promise<{ chunks: TextChunk[]; relatedTriples: KnowledgeTriple[] }> {
  // 1. 随机选一个实体
  const entity = kg.getRandomEntity();
  // 2. 获取该实体的所有三元组
  const triples = kg.getTriplesForEntity(entity);
  // 3. 用实体名称做向量检索，获取相关 chunks
  const results = await vectorStore.query(
    await getEmbedding(entity, config),
    { topK: 5 }
  );
  return { chunks: results, relatedTriples: triples };
}
```

**策略 C — 薄弱点定向检索**

```typescript
/**
 * 根据调度引擎提供的薄弱知识点，定向检索相关 chunks
 * 适用于：自适应复习模式
 *
 * 流程：
 * 1. 调度引擎输出"最需要复习的知识点标签列表"
 * 2. 用这些标签作为 query 到向量库检索
 * 3. 得到与薄弱点最相关的 chunks
 */
async function sampleByWeakPoints(
  weakTags: string[],
  pipeline: RagPipeline,
  embeddingConfig: EmbeddingConfig
): Promise<TextChunk[]> {
  const allChunks: TextChunk[] = [];
  for (const tag of weakTags) {
    // 复用 RagPipeline 的完整检索能力（向量 + BM25 + Rerank）
    const result = await pipeline.query(tag);
    allChunks.push(...result.results.map(r => r.node));
  }
  // 去重
  return deduplicateByChunkId(allChunks);
}
```

#### Step 2: LLM 生成题目

将采样的 chunks 交给 LLM，要求生成结构化题目：

```typescript
async function generateQuestion(
  chunks: TextChunk[],
  questionType: QuestionType,
  difficulty: number,
  llmFn: LLMFunction,
  existingQuestions?: QuizQuestion[]  // 用于避免重复
): Promise<QuizQuestion> {
  const prompt = buildQuestionGenerationPrompt(chunks, questionType, difficulty);
  const response = await llmFn(prompt);
  const parsed = parseStructuredJSON<QuizQuestion>(response);

  // 附加元数据
  parsed.sourceChunkIds = chunks.map(c => c.id_);
  parsed.createdAt = Date.now();
  parsed.id = generateId();

  return parsed;
}
```

完整的 Prompt 模板见 [第 8 节](#8-关键-prompt-模板)。

#### Step 3: 题目去重与质量过滤

```typescript
/**
 * 题目去重：用 embedding 余弦相似度判断是否与已有题目重复
 * 阈值：0.92（经验值——太低会放过相似题，太高会误判不同题目）
 */
async function isDuplicate(
  newQuestion: string,
  existingQuestions: QuizQuestion[],
  embeddingConfig: EmbeddingConfig,
  threshold: number = 0.92
): Promise<boolean> {
  const newEmb = await getEmbedding(newQuestion, embeddingConfig);
  for (const q of existingQuestions) {
    if (!q.embedding) continue;
    const sim = cosineSimilarity(newEmb, q.embedding);
    if (sim > threshold) return true;
  }
  return false;
}
```

### 3.3 追问题生成（面试模拟专用）

在面试模拟模式下，系统会根据用户的回答生成追问：

```typescript
async function generateFollowUp(
  originalQuestion: QuizQuestion,
  userAnswer: string,
  evaluation: AnswerEvaluation,
  llmFn: LLMFunction
): Promise<QuizQuestion> {
  // 追问策略：
  // 1. 如果用户回答有错误 → 针对错误追问
  // 2. 如果用户回答太浅 → 要求深入
  // 3. 如果用户回答好 → 延伸到相关知识点
  const strategy = determineFollowUpStrategy(evaluation);
  const prompt = buildFollowUpPrompt(originalQuestion, userAnswer, evaluation, strategy);
  return parseStructuredJSON<QuizQuestion>(await llmFn(prompt));
}
```

---

## 4. 评分机制设计

### 4.1 评分维度

采用 **四维度评分模型**，总分 100 分：

| 维度 | 权重 | 满分 | 评估内容 |
|------|------|------|---------|
| 关键点覆盖 | 40% | 40 | 是否提到了参考答案中的核心要点 |
| 准确性 | 25% | 25 | 所述内容是否有事实错误 |
| 完整性 | 20% | 20 | 是否覆盖了问题的各个方面 |
| 表达清晰度 | 15% | 15 | 逻辑是否清晰、表达是否专业 |

**为什么选这四个维度？**

- **关键点覆盖 (40%)** — 权重最高，因为面试/考试的核心是"你是否知道关键概念"。这个维度可以通过 embedding 做自动化预评，减少 LLM 评分的不稳定性。
- **准确性 (25%)** — 说错比不说更危险，面试中错误的陈述是扣分大项。
- **完整性 (20%)** — 考察知识的广度，是否能多角度覆盖问题。
- **表达清晰度 (15%)** — 面试中清晰的表达本身就是能力，但权重不宜太高以免成为"语文考试"。

### 4.2 评分流程（三级流水线）

```
                          用户回答
                             │
                ┌────────────┴────────────┐
                ▼                         │
  ┌───────────────────────┐               │
  │  第一级：语义相似度     │               │
  │  (快速 & 自动化)       │               │
  │                       │               │
  │  · 用户回答 embedding  │               │
  │  · 参考答案 embedding  │               │
  │  · 余弦相似度 → 0~1   │               │
  │                       │               │
  │  用途：                │               │
  │  · 提供锚定基础分      │               │
  │  · 快速筛选离谱回答    │               │
  │  · 降低 LLM 评分偏差   │               │
  └───────────┬───────────┘               │
              │ cosine_score              │
              ▼                           │
  ┌───────────────────────┐               │
  │  第二级：关键点命中     │               │
  │  (自动化 + 半结构化)   │               │
  │                       │               │
  │  对每个 keyPoint:      │               │
  │  · keyPoint embedding  │               │
  │  · vs 用户回答各句     │               │
  │  · 最高相似度 > 0.75   │               │
  │    → 命中              │               │
  │  · 0.55 ~ 0.75        │               │
  │    → 部分命中          │               │
  │  · < 0.55             │               │
  │    → 未命中            │               │
  └───────────┬───────────┘               │
              │ keypoint_matches          │
              ▼                           ▼
  ┌─────────────────────────────────────────┐
  │  第三级：LLM 深度评估                    │
  │  (全面 & 细腻)                          │
  │                                         │
  │  输入：                                  │
  │  · 题目 + 参考答案 + 关键点              │
  │  · 用户回答                             │
  │  · 第一级 cosine_score                  │
  │  · 第二级 keypoint_matches              │
  │                                         │
  │  输出（结构化 JSON）：                    │
  │  · 四维度各自得分 + 理由                 │
  │  · 总体评语                             │
  │  · 改进建议                             │
  │  · 掌握等级判定                          │
  └─────────────────────────────────────────┘
```

**为什么要三级，而不是直接全部交给 LLM？**

1. **稳定性**：LLM 评分有随机性（同一回答可能得 70 或 80），第一、二级提供"锚定值"，prompt 中附带这些客观数据可以显著降低 LLM 评分波动。
2. **成本**：如果用户回答明显离题（cosine < 0.3），可以直接低分，不需要调用昂贵的 LLM。
3. **可解释性**：用户可以看到"哪些关键点命中了、哪些没命中"，而不只是一个总分。

### 4.3 掌握等级映射

| 分数区间 | 等级标识 | 中文描述 | SM-2 quality 映射 | 后续策略 |
|----------|---------|---------|-------------------|---------|
| 0 - 40 | `not_mastered` | 未掌握 | 0-2（不合格） | 半天后重考，间隔重置 |
| 41 - 70 | `partially` | 部分掌握 | 3（勉强合格） | 1天后复习，间隔缓慢增长 |
| 71 - 90 | `mastered` | 已掌握 | 4（良好） | 按正常 SM-2 间隔 |
| 91 - 100 | `expert` | 精通 | 5（优秀） | 间隔加速增长 |

### 4.4 评分校准与反作弊

```typescript
/**
 * 评分校准策略：
 * 1. cosine 锚定：LLM 评分不应偏离 cosine 基础分太远
 *    - 如果 cosine < 0.3 但 LLM 给了 80 分 → 触发复核
 *    - 如果 cosine > 0.85 但 LLM 给了 30 分 → 触发复核
 * 2. 关键点一致性：关键点命中 4/5 但总分 < 50 → 异常
 */
function calibrateScore(
  llmScore: number,
  cosineScore: number,
  keyPointHitRate: number
): number {
  const cosineAnchor = cosineScore * 100;
  const keyPointAnchor = keyPointHitRate * 100;

  // 加权融合：LLM 60% + cosine 20% + keyPoint 20%
  let calibrated = llmScore * 0.6 + cosineAnchor * 0.2 + keyPointAnchor * 0.2;

  // 极端偏差修正
  if (Math.abs(llmScore - cosineAnchor) > 40) {
    calibrated = (llmScore + cosineAnchor) / 2;
  }

  return Math.round(Math.max(0, Math.min(100, calibrated)));
}
```

---

## 5. 自适应提问策略（遗忘曲线 + 掌握度模型）

### 5.1 理论基础

本系统的自适应调度结合了两套经典理论：

**艾宾浩斯遗忘曲线（Ebbinghaus Forgetting Curve）**

```
记忆保持率 R = e^(-t/S)

其中：
  t = 距上次复习的时间（天）
  S = 记忆稳定性（stability），与练习次数和掌握程度正相关
  R = 当前记忆保持率（0~1），R < 0.5 时记忆濒临遗忘
```

关键洞察：
- 刚学完时 R ≈ 1.0，随时间指数衰减
- 每次成功复习都会增加 S（稳定性），使遗忘变慢
- 最佳复习时机是 R ≈ 0.5 时（即将忘但还没完全忘）

**SM-2 间隔重复算法（SuperMemo 2）**

```
SM-2 核心公式：

1. 首次正确: interval = 1 天
2. 第二次正确: interval = 3 天
3. 之后每次正确: interval = interval × easeFactor

easeFactor 更新：
  EF' = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))

其中 q = 回答质量 (0-5)，EF 初始值 = 2.5，下限 = 1.3
```

### 5.2 知识点掌握度模型

每个知识点维护以下状态：

```typescript
interface KnowledgePointMastery {
  // ══ 标识 ══
  pointId: string;           // 知识点唯一 ID
  label: string;             // 知识点名称（用于显示）
  tags: string[];            // 知识标签（如 ["网络", "TCP", "传输层"]）
  sourceChunkIds: string[];  // 关联的知识库 chunk IDs

  // ══ SM-2 核心状态 ══
  easeFactor: number;        // 难度因子 (初始 2.5，下限 1.3)
  interval: number;          // 当前复习间隔（天）
  repetitions: number;       // 连续正确次数（答错重置为 0）

  // ══ 时间戳 ══
  createdAt: number;         // 首次遇到此知识点的时间
  lastReviewAt: number;      // 上次复习时间戳 (ms)
  nextReviewAt: number;      // 下次应复习时间戳 (ms)

  // ══ 统计数据 ══
  totalAttempts: number;     // 总答题次数
  correctCount: number;      // 达标次数（得分 >= 60）
  avgScore: number;          // 历史平均得分
  recentScores: number[];    // 最近 5 次得分（用于趋势分析）

  // ══ 掌握等级 ══
  masteryLevel: 'not_mastered' | 'partially' | 'mastered' | 'expert';
}
```

### 5.3 核心算法实现

#### 5.3.1 掌握度更新（每次答题后）

```typescript
function updateMastery(point: KnowledgePointMastery, score: number): KnowledgePointMastery {
  const updated = { ...point };
  const quality = mapScoreToQuality(score);  // 0-100 → 0-5

  // ── SM-2 间隔更新 ──
  if (quality >= 3) {
    // 合格：递增间隔
    if (updated.repetitions === 0) {
      updated.interval = 1;      // 第 1 次合格: 明天再考
    } else if (updated.repetitions === 1) {
      updated.interval = 3;      // 第 2 次合格: 3 天后
    } else {
      updated.interval = Math.round(updated.interval * updated.easeFactor);
    }
    updated.repetitions += 1;
  } else {
    // 不合格：重置间隔（但保留 easeFactor 的历史调整）
    updated.repetitions = 0;
    updated.interval = 0.5;      // 半天后重考
  }

  // 间隔上限：180 天（半年），避免完全遗忘
  updated.interval = Math.min(updated.interval, 180);

  // ── 难度因子更新 ──
  updated.easeFactor = Math.max(1.3,
    updated.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  // ── 时间戳更新 ──
  const now = Date.now();
  updated.lastReviewAt = now;
  updated.nextReviewAt = now + updated.interval * 24 * 60 * 60 * 1000;

  // ── 统计更新 ──
  updated.totalAttempts += 1;
  if (score >= 60) updated.correctCount += 1;
  updated.recentScores = [...updated.recentScores.slice(-4), score];
  updated.avgScore = updated.recentScores.reduce((a, b) => a + b, 0) / updated.recentScores.length;

  // ── 掌握等级更新 ──
  updated.masteryLevel = calculateMasteryLevel(updated);

  return updated;
}

function mapScoreToQuality(score: number): number {
  // 0-100 分映射到 SM-2 的 0-5 质量等级
  if (score >= 91) return 5;       // 精通
  if (score >= 71) return 4;       // 已掌握
  if (score >= 41) return 3;       // 部分掌握（合格线）
  if (score >= 21) return 2;       // 不合格
  if (score >= 1)  return 1;       // 严重不足
  return 0;                        // 完全不会
}

function calculateMasteryLevel(point: KnowledgePointMastery): MasteryLevel {
  // 综合考虑多个因素
  const { avgScore, repetitions, recentScores, totalAttempts } = point;

  // 从未答过
  if (totalAttempts === 0) return 'not_mastered';

  // 最近 3 次都 90+ 且连续正确 >= 3 次
  const recentThree = recentScores.slice(-3);
  if (recentThree.length >= 3 && recentThree.every(s => s >= 90) && repetitions >= 3) {
    return 'expert';
  }

  // 平均分 >= 70 且连续正确 >= 2 次
  if (avgScore >= 70 && repetitions >= 2) return 'mastered';

  // 平均分 >= 40 或有过合格记录
  if (avgScore >= 40 || repetitions >= 1) return 'partially';

  return 'not_mastered';
}
```

#### 5.3.2 记忆保持率计算（遗忘曲线）

```typescript
/**
 * 计算某知识点当前的记忆保持率
 *
 * 数学模型: R = e^(-t/S)
 *   t = 距上次复习的天数
 *   S = stability = easeFactor × interval（记忆稳定性）
 *
 * 直觉解释:
 *   - easeFactor 高的知识点（容易的题），遗忘慢
 *   - interval 长的知识点（已经多次复习成功），遗忘慢
 *   - 刚复习过的(t小)，保持率高
 *   - 复习间隔到期时(t≈S)，R ≈ 0.37（已遗忘大半）
 */
function getRetentionRate(point: KnowledgePointMastery): number {
  if (point.totalAttempts === 0) return 0;  // 从未学过

  const now = Date.now();
  const daysSinceReview = (now - point.lastReviewAt) / (24 * 60 * 60 * 1000);
  const stability = point.easeFactor * Math.max(point.interval, 0.1);

  return Math.exp(-daysSinceReview / stability);
}

/**
 * 获取记忆状态的文字描述
 */
function getRetentionStatus(rate: number): string {
  if (rate >= 0.9) return '🟢 记忆牢固';
  if (rate >= 0.7) return '🟡 记忆尚可';
  if (rate >= 0.5) return '🟠 开始遗忘';
  if (rate >= 0.3) return '🔴 即将遗忘';
  return '⚫ 已基本遗忘';
}
```

#### 5.3.3 智能出题优先级排序

```typescript
interface QuestionPriority {
  pointId: string;
  priority: number;      // 优先级分数，越高越应优先出题
  reason: string;        // 出题理由（可在 UI 展示）
  suggestedType: QuestionType;  // 建议题型
  suggestedDifficulty: number;  // 建议难度
}

function calculateQuestionPriorities(
  allPoints: KnowledgePointMastery[]
): QuestionPriority[] {
  const now = Date.now();

  return allPoints.map(point => {
    let priority = 0;
    const reasons: string[] = [];

    // ── 因素1：复习到期（权重最高，50+30=80分上限）──
    if (now >= point.nextReviewAt) {
      const overdueDays = (now - point.nextReviewAt) / (24 * 60 * 60 * 1000);
      // 到期基础 50 分 + 逾期每天 +5（上限 30）
      priority += 50 + Math.min(overdueDays * 5, 30);
      reasons.push(`已逾期 ${overdueDays.toFixed(1)} 天`);
    }

    // ── 因素2：记忆保持率低（上限 40 分）──
    const retention = getRetentionRate(point);
    if (retention < 0.5) {
      priority += (1 - retention) * 40;
      reasons.push(`记忆保持率 ${(retention * 100).toFixed(0)}%`);
    }

    // ── 因素3：掌握度低（上限 30 分）──
    if (point.masteryLevel === 'not_mastered') {
      priority += 30;
      reasons.push('尚未掌握');
    } else if (point.masteryLevel === 'partially') {
      priority += 15;
      reasons.push('部分掌握');
    }

    // ── 因素4：得分下降趋势（上限 10 分）──
    if (point.recentScores.length >= 3) {
      const recent = point.recentScores.slice(-3);
      if (recent[2] < recent[0] - 10) {
        priority += 10;
        reasons.push('得分下降趋势');
      }
    }

    // ── 因素5：从未练习的新知识点（固定 20 分）──
    if (point.totalAttempts === 0) {
      priority += 20;
      reasons.push('从未练习');
    }

    // ── 确定建议题型和难度 ──
    const suggestedType = suggestQuestionType(point);
    const suggestedDifficulty = suggestDifficulty(point);

    return {
      pointId: point.pointId,
      priority,
      reason: reasons.join('；'),
      suggestedType,
      suggestedDifficulty,
    };
  }).sort((a, b) => b.priority - a.priority);
}

/**
 * 根据掌握度建议题型
 * - 未掌握 → 概念题（从基础开始）
 * - 部分掌握 → 对比题（加深理解）
 * - 已掌握 → 场景题/代码题（提升应用）
 * - 精通 → 追问题（查漏补缺）
 */
function suggestQuestionType(point: KnowledgePointMastery): QuestionType {
  switch (point.masteryLevel) {
    case 'not_mastered': return 'concept';
    case 'partially': return 'comparison';
    case 'mastered': return Math.random() > 0.5 ? 'scenario' : 'coding';
    case 'expert': return 'follow_up';
    default: return 'concept';
  }
}

/**
 * 根据历史得分建议难度
 * 原则："比上次稍难一点"，但不超过用户能力边界太多
 */
function suggestDifficulty(point: KnowledgePointMastery): number {
  if (point.totalAttempts === 0) return 1;
  const avg = point.avgScore;
  if (avg >= 90) return Math.min(5, 4);
  if (avg >= 70) return 3;
  if (avg >= 50) return 2;
  return 1;
}
```

### 5.4 练习 Session 出题配比

每次练习 session 的题目组成（默认 10 题）：

```typescript
interface SessionConfig {
  totalQuestions: number;       // 默认 10
  reviewRatio: number;         // 到期复习题占比, 默认 0.4
  weakPointRatio: number;      // 薄弱点强化占比, 默认 0.3
  newKnowledgeRatio: number;   // 新知识探索占比, 默认 0.2
  randomReviewRatio: number;   // 随机巩固占比, 默认 0.1
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  totalQuestions: 10,
  reviewRatio: 0.4,       // 4 题：到期复习
  weakPointRatio: 0.3,    // 3 题：薄弱点强化
  newKnowledgeRatio: 0.2, // 2 题：新知识探索
  randomReviewRatio: 0.1, // 1 题：已掌握知识随机巩固
};
```

配比可视化：

```
  ┌────────────────┬────────────┬──────────┬──────┐
  │  到期复习 40%   │ 薄弱强化30%│ 新知识20%│巩固10%│
  │  ████████████  │ █████████  │ ██████  │ ███  │
  └────────────────┴────────────┴──────────┴──────┘
```

---

## 6. 持久化存储方案

### 6.1 存储策略总览

基于项目现有存储模式（Electron IPC + JSON 文件 + localStorage），采用 **三层分级存储**：

| 层级 | 存储方式 | 数据类型 | 访问频率 | 数据大小 |
|------|---------|---------|---------|---------|
| 🔴 热数据 | `localStorage` | 当前 session 状态、UI 偏好 | 每秒级 | < 1MB |
| 🟡 温数据 | Electron `save-app-data` | 掌握度、题目缓存、统计 | 每次答题 | 1-50MB |
| 🔵 冷数据 | Electron `writeFile` | 历史 session 归档 | 偶尔查看 | 无限制 |

**为什么不引入 SQLite / IndexedDB？**

- 项目现有代码全部使用 `localStorage` + Electron IPC JSON 文件，引入新存储引擎会增加复杂度
- 预估数据量：1000 个知识点 × 每个约 500B = 500KB；1000 次 session × 每个约 5KB = 5MB，JSON 文件完全够用
- 如果未来数据量增长到百万级，可以用 `save-app-data` IPC 通道平滑迁移到 SQLite

### 6.2 文件存储结构

```
{AppDataDir}/                          ← Electron app.getPath('userData')
└── quiz-system/
    ├── mastery.json                   ← 所有知识点掌握度（核心数据）
    ├── questions-cache.json           ← 已生成题目缓存（避免重复调 LLM）
    ├── stats.json                     ← 全局统计（总答题数、平均分等）
    ├── settings.json                  ← 用户设置（题目数量、难度偏好等）
    └── sessions/
        ├── 2026-03/
        │   ├── session-a1b2c3.json    ← 单次练习会话完整记录
        │   ├── session-d4e5f6.json
        │   └── ...
        └── 2026-04/
            └── ...
```

### 6.3 各文件数据格式

**mastery.json** — 知识点掌握度（最重要的文件）

```json
{
  "version": 1,
  "updatedAt": 1743429600000,
  "points": {
    "tcp-three-way-handshake": {
      "pointId": "tcp-three-way-handshake",
      "label": "TCP 三次握手",
      "tags": ["网络", "TCP", "传输层"],
      "sourceChunkIds": ["chunk-001", "chunk-002"],
      "easeFactor": 2.6,
      "interval": 7,
      "repetitions": 3,
      "createdAt": 1743000000000,
      "lastReviewAt": 1743343200000,
      "nextReviewAt": 1743948000000,
      "totalAttempts": 5,
      "correctCount": 4,
      "avgScore": 78.5,
      "recentScores": [65, 72, 85, 82, 88],
      "masteryLevel": "mastered"
    }
  }
}
```

**questions-cache.json** — 题目缓存

```json
{
  "version": 1,
  "questions": [
    {
      "id": "q-uuid-001",
      "question": "请解释 TCP 三次握手的过程",
      "type": "concept",
      "difficulty": 2,
      "referenceAnswer": "TCP 三次握手是建立可靠连接的过程...",
      "keyPoints": [
        "客户端发送 SYN 包",
        "服务端回复 SYN+ACK",
        "客户端发送 ACK 确认",
        "双方确认序列号"
      ],
      "tags": ["网络", "TCP"],
      "sourceChunkIds": ["chunk-001"],
      "embedding": [0.12, -0.34, ...],
      "createdAt": 1743429600000,
      "usedCount": 2,
      "lastUsedAt": 1743429600000
    }
  ]
}
```

**session-xxx.json** — 单次练习会话

```json
{
  "id": "session-a1b2c3d4",
  "mode": "practice",
  "topic": "计算机网络",
  "startedAt": 1743429600000,
  "finishedAt": 1743431400000,
  "attempts": [
    {
      "id": "attempt-001",
      "questionId": "q-uuid-001",
      "userAnswer": "TCP三次握手首先由客户端发起...",
      "evaluation": {
        "totalScore": 82,
        "dimensions": {
          "keyPointCoverage": { "score": 35, "hitPoints": ["SYN", "SYN+ACK", "ACK"], "missedPoints": ["序列号确认"] },
          "accuracy": { "score": 22, "errors": [] },
          "completeness": { "score": 15, "feedback": "缺少对序列号同步的说明" },
          "clarity": { "score": 10, "feedback": "表达清晰，逻辑通顺" }
        },
        "overallFeedback": "对三次握手的基本流程理解正确...",
        "suggestions": ["建议补充序列号同步的意义"],
        "masteryLevel": "mastered"
      },
      "timeSpentMs": 45000,
      "createdAt": 1743429650000
    }
  ],
  "summary": {
    "totalQuestions": 10,
    "avgScore": 75.3,
    "strongPoints": ["TCP 基础", "HTTP 协议"],
    "weakPoints": ["网络安全", "DNS 解析"],
    "overallGrade": "B",
    "recommendation": "建议重点复习 DNS 解析流程和 HTTPS 加密原理"
  }
}
```

**stats.json** — 全局统计

```json
{
  "version": 1,
  "totalSessions": 42,
  "totalQuestions": 380,
  "totalTimeMs": 86400000,
  "avgScore": 72.5,
  "streakDays": 7,
  "lastActiveAt": 1743429600000,
  "byDate": {
    "2026-03-31": { "sessions": 2, "questions": 18, "avgScore": 76 },
    "2026-03-30": { "sessions": 1, "questions": 10, "avgScore": 71 }
  },
  "byTag": {
    "网络": { "attempts": 45, "avgScore": 78 },
    "操作系统": { "attempts": 30, "avgScore": 65 }
  }
}
```

### 6.4 存储服务接口

```typescript
class QuizStorageService {
  // ══ 掌握度 ══
  async loadMastery(): Promise<Record<string, KnowledgePointMastery>>;
  async saveMastery(data: Record<string, KnowledgePointMastery>): Promise<void>;
  async updatePoint(pointId: string, updater: (p: KnowledgePointMastery) => KnowledgePointMastery): Promise<void>;

  // ══ 题目缓存 ══
  async getCachedQuestions(filter?: { tags?: string[]; type?: QuestionType; difficulty?: number }): Promise<QuizQuestion[]>;
  async cacheQuestion(question: QuizQuestion): Promise<void>;
  async markQuestionUsed(questionId: string): Promise<void>;

  // ══ 练习会话 ══
  async saveSession(session: QuizSession): Promise<void>;
  async loadSession(sessionId: string): Promise<QuizSession | null>;
  async listSessions(filter?: { month?: string; mode?: SessionMode }): Promise<QuizSessionSummary[]>;
  async deleteSession(sessionId: string): Promise<void>;

  // ══ 统计 ══
  async getStats(): Promise<QuizStats>;
  async recordActivity(session: QuizSession): Promise<void>;

  // ══ 设置 ══
  async getSettings(): Promise<QuizSettings>;
  async saveSettings(settings: QuizSettings): Promise<void>;

  // ══ 数据维护 ══
  async exportAll(): Promise<QuizDataExport>;       // 导出全部数据
  async importAll(data: QuizDataExport): Promise<void>; // 导入数据
  async cleanup(olderThanDays: number): Promise<number>; // 清理旧 session
}
```

### 6.5 存储实现（基于现有 Electron IPC）

```typescript
/**
 * 利用现有 IPC 通道实现存储
 *
 * 已有通道（electron/preload.ts）：
 *   - window.electronAPI.saveAppData(key, data)  → 保存到 {AppData}/{key}.json
 *   - window.electronAPI.loadAppData(key)         → 读取
 *   - window.electronAPI.writeFile(path, content) → 任意路径写入
 *   - window.electronAPI.readFile(path)           → 任意路径读取
 *   - window.electronAPI.ensureDir(path)          → 确保目录存在
 */

// 温数据：用 saveAppData（自动管理路径）
async function saveMastery(data: Record<string, KnowledgePointMastery>): Promise<void> {
  await window.electronAPI.saveAppData('quiz-mastery', {
    version: 1,
    updatedAt: Date.now(),
    points: data,
  });
}

// 冷数据：用 writeFile（自定义归档路径）
async function saveSession(session: QuizSession): Promise<void> {
  const month = new Date(session.startedAt).toISOString().slice(0, 7); // "2026-03"
  const dir = `${await getQuizRootPath()}/sessions/${month}`;
  await window.electronAPI.ensureDir(dir);
  await window.electronAPI.writeFile(
    `${dir}/session-${session.id}.json`,
    JSON.stringify(session, null, 2)
  );
}
```

---

## 7. 核心数据模型（TypeScript 类型定义）

以下是系统中所有核心类型的完整定义，将放在 `services/quizSystem/types.ts`：

```typescript
// ═══════════════════════════════════════════════════════
// 枚举与常量
// ═══════════════════════════════════════════════════════

/** 题目类型 */
export type QuestionType = 'concept' | 'comparison' | 'scenario' | 'coding' | 'follow_up';

/** 掌握等级 */
export type MasteryLevel = 'not_mastered' | 'partially' | 'mastered' | 'expert';

/** 练习模式 */
export type SessionMode = 'practice' | 'mock_interview' | 'review';

/** 关键点命中状态 */
export type KeyPointHitStatus = 'hit' | 'partial' | 'missed';

// ═══════════════════════════════════════════════════════
// 题目相关
// ═══════════════════════════════════════════════════════

/** 生成的题目 */
export interface QuizQuestion {
  id: string;
  question: string;
  type: QuestionType;
  difficulty: number;               // 1-5
  referenceAnswer: string;
  keyPoints: string[];              // 3-5 个关键得分点
  tags: string[];                   // 知识标签
  sourceChunkIds: string[];         // 来源 chunk IDs
  embedding?: number[];             // 题目的 embedding（用于去重）
  createdAt: number;
  usedCount: number;                // 被使用次数
  lastUsedAt?: number;
}

// ═══════════════════════════════════════════════════════
// 评分相关
// ═══════════════════════════════════════════════════════

/** 关键点命中详情 */
export interface KeyPointMatch {
  keyPoint: string;
  status: KeyPointHitStatus;
  similarity: number;               // 与用户回答的最高相似度
  matchedSegment?: string;          // 用户回答中匹配的片段
}

/** 完整评分结果 */
export interface AnswerEvaluation {
  totalScore: number;               // 0-100

  dimensions: {
    keyPointCoverage: {
      score: number;                // 0-40
      matches: KeyPointMatch[];
    };
    accuracy: {
      score: number;                // 0-25
      errors: string[];
    };
    completeness: {
      score: number;                // 0-20
      feedback: string;
    };
    clarity: {
      score: number;                // 0-15
      feedback: string;
    };
  };

  overallFeedback: string;
  suggestions: string[];
  masteryLevel: MasteryLevel;

  // 评分元数据
  meta: {
    cosineSimilarity: number;       // 第一级：整体语义相似度
    keyPointHitRate: number;        // 第二级：关键点命中率
    llmRawScore: number;            // 第三级：LLM 原始评分
    calibratedScore: number;        // 校准后最终分
    scoringTimeMs: number;          // 评分耗时
  };
}

// ═══════════════════════════════════════════════════════
// 答题记录
// ═══════════════════════════════════════════════════════

/** 单次答题记录 */
export interface QuizAttempt {
  id: string;
  questionId: string;
  question: QuizQuestion;           // 题目快照（防止缓存清理后丢失）
  userAnswer: string;
  evaluation: AnswerEvaluation;
  timeSpentMs: number;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════
// 练习会话
// ═══════════════════════════════════════════════════════

/** 会话总结 */
export interface SessionSummary {
  totalQuestions: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  strongPoints: string[];           // 得分高的知识标签
  weakPoints: string[];             // 得分低的知识标签
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: string;           // LLM 生成的下次练习建议
}

/** 完整练习会话 */
export interface QuizSession {
  id: string;
  mode: SessionMode;
  topic?: string;
  attempts: QuizAttempt[];
  summary: SessionSummary;
  startedAt: number;
  finishedAt: number;
}

// ═══════════════════════════════════════════════════════
// 知识点掌握度
// ═══════════════════════════════════════════════════════

/** 单个知识点掌握度 */
export interface KnowledgePointMastery {
  pointId: string;
  label: string;
  tags: string[];
  sourceChunkIds: string[];

  easeFactor: number;
  interval: number;
  repetitions: number;

  createdAt: number;
  lastReviewAt: number;
  nextReviewAt: number;

  totalAttempts: number;
  correctCount: number;
  avgScore: number;
  recentScores: number[];

  masteryLevel: MasteryLevel;
}

// ═══════════════════════════════════════════════════════
// 调度相关
// ═══════════════════════════════════════════════════════

/** 出题优先级 */
export interface QuestionPriority {
  pointId: string;
  priority: number;
  reason: string;
  retentionRate: number;
  suggestedType: QuestionType;
  suggestedDifficulty: number;
}

/** Session 配置 */
export interface SessionConfig {
  totalQuestions: number;
  reviewRatio: number;
  weakPointRatio: number;
  newKnowledgeRatio: number;
  randomReviewRatio: number;
}

// ═══════════════════════════════════════════════════════
// 统计与设置
// ═══════════════════════════════════════════════════════

/** 全局统计 */
export interface QuizStats {
  totalSessions: number;
  totalQuestions: number;
  totalTimeMs: number;
  avgScore: number;
  streakDays: number;
  lastActiveAt: number;
  byDate: Record<string, { sessions: number; questions: number; avgScore: number }>;
  byTag: Record<string, { attempts: number; avgScore: number }>;
}

/** 用户设置 */
export interface QuizSettings {
  defaultSessionConfig: SessionConfig;
  preferredDifficulty: number;
  enableAutoReview: boolean;        // 自动推送到期复习
  reviewNotificationHour: number;   // 每日提醒时间（小时）
}
```

---

## 8. 关键 Prompt 模板

### 8.1 出题 Prompt

```
你是一位专业的技术面试官和出题专家。请根据以下知识内容，生成一道高质量的{题型}题目。

## 知识内容

{retrieved_chunks}

## 出题要求

1. **题型**: {question_type_description}
2. **难度**: {difficulty}/5（{difficulty_description}）
3. **目标**: 考察对核心概念的深度理解，而非死记硬背
4. **语言**: 中文出题

## 输出格式（严格 JSON）

```json
{
  "question": "题目内容",
  "type": "{question_type}",
  "difficulty": {difficulty},
  "referenceAnswer": "完整的参考答案（200-500字）",
  "keyPoints": [
    "关键得分点1（一句话描述）",
    "关键得分点2",
    "关键得分点3"
  ],
  "tags": ["知识标签1", "知识标签2"]
}
```

## 注意事项

- keyPoints 应为 3-5 个，每个是独立可验证的知识要点
- referenceAnswer 应完整但不啰嗦
- tags 应反映知识点所属领域，2-4 个
- 不要出"以下哪个是正确的"这类选择题，只出开放式问答题
```

### 8.2 评分 Prompt

```
你是一位严格但公正的技术考官。请评估以下回答。

## 题目

{question}

## 参考答案

{reference_answer}

## 关键得分点

{key_points_formatted}

## 学生回答

{user_answer}

## 预评估数据

- 语义相似度: {cosine_similarity}（0-1，仅供参考）
- 关键点初步匹配:
{key_point_matches_formatted}

## 评分标准

| 维度 | 满分 | 评分要点 |
|------|------|---------|
| 关键点覆盖 | 40 | 学生是否提到了核心概念？未提到的关键点必须列出 |
| 准确性 | 25 | 所述内容是否有事实错误？列出每个错误 |
| 完整性 | 20 | 是否覆盖了问题的各个方面？缺失了哪些方面？ |
| 表达清晰度 | 15 | 逻辑是否清晰？表达是否专业？|

## 输出格式（严格 JSON）

```json
{
  "totalScore": 0-100,
  "dimensions": {
    "keyPointCoverage": {
      "score": 0-40,
      "hitPoints": ["命中的关键点"],
      "missedPoints": ["遗漏的关键点"]
    },
    "accuracy": {
      "score": 0-25,
      "errors": ["错误描述"]
    },
    "completeness": {
      "score": 0-20,
      "feedback": "完整性评价"
    },
    "clarity": {
      "score": 0-15,
      "feedback": "清晰度评价"
    }
  },
  "overallFeedback": "总体评语（2-3句）",
  "suggestions": ["改进建议1", "改进建议2"],
  "masteryLevel": "not_mastered|partially|mastered|expert"
}
```

## 重要规则

1. totalScore 必须等于四个维度分数之和
2. 即使学生用不同的表述方式，只要意思正确就应认可
3. 参考"语义相似度"和"关键点匹配"作为锚定，但最终以你的专业判断为准
4. 如果学生回答有超出参考答案的正确补充，应该加分鼓励
```

### 8.3 面试追问 Prompt

```
你是一位经验丰富的技术面试官，正在进行一场技术面试。

## 上一个问题

{previous_question}

## 候选人的回答

{user_answer}

## 回答评估

- 得分: {score}/100
- 命中的知识点: {hit_points}
- 遗漏的知识点: {missed_points}
- 存在的错误: {errors}

## 追问策略

请根据候选人的回答情况选择追问策略：

1. 如果有**明显错误** → 礼貌地指出并请候选人重新思考
2. 如果有**遗漏的重要知识点** → 引导候选人往该方向思考
3. 如果回答**较为完整** → 延伸到更深层或相关的知识点
4. 如果回答**非常优秀** → 提升难度，问更有挑战性的延伸问题

## 输出格式（严格 JSON）

```json
{
  "question": "追问的问题",
  "type": "follow_up",
  "difficulty": 1-5,
  "followUpStrategy": "error_correction|missing_point|deeper_dive|extension",
  "referenceAnswer": "追问的参考答案",
  "keyPoints": ["得分点1", "得分点2", "得分点3"],
  "tags": ["相关标签"]
}
```
```

### 8.4 Session 总结 Prompt

```
请根据以下练习数据，生成一份简洁的练习总结和下次复习建议。

## 练习数据

- 题目总数: {total}
- 平均分: {avg_score}
- 各题得分: {scores_list}
- 表现好的知识点: {strong_tags}
- 薄弱知识点: {weak_tags}

## 输出格式（严格 JSON）

```json
{
  "overallGrade": "A|B|C|D|F",
  "recommendation": "下次练习建议（2-3句话，具体指出应重点复习什么）"
}
```
```

---

## 9. 模块拆分与文件结构

### 9.1 新增文件

```
services/
└── quizSystem/
    ├── types.ts              # 所有类型定义（第 7 节内容）
    ├── quizEngine.ts         # 出题引擎
    │   ├── sampleChunks()        - 知识点采样（3种策略）
    │   ├── generateQuestion()    - LLM 题目生成
    │   ├── generateFollowUp()    - 追问生成
    │   └── isDuplicate()         - 题目去重
    ├── scorer.ts             # 评分引擎
    │   ├── computeCosineSimilarity()  - 第一级：语义相似度
    │   ├── matchKeyPoints()           - 第二级：关键点命中
    │   ├── llmEvaluate()              - 第三级：LLM 评分
    │   ├── calibrateScore()           - 分数校准
    │   └── evaluate()                 - 完整评分流程
    ├── scheduler.ts          # 自适应调度引擎
    │   ├── updateMastery()           - 掌握度更新（SM-2）
    │   ├── getRetentionRate()        - 遗忘曲线计算
    │   ├── calculatePriorities()     - 出题优先级排序
    │   └── buildSessionPlan()        - 生成 session 出题计划
    ├── storageService.ts     # 持久化存储服务
    │   ├── MasteryStore              - 掌握度存取
    │   ├── QuestionCache             - 题目缓存
    │   ├── SessionStore              - Session 归档
    │   └── StatsStore                - 统计数据
    ├── prompts.ts            # 所有 Prompt 模板（第 8 节内容）
    └── index.ts              # 模块入口，导出公共 API

components/
├── QuizPractice.tsx          # 练习模式 UI（核心交互）
├── QuizMockInterview.tsx     # 面试模拟 UI（对话式）
├── QuizDashboard.tsx         # 统计仪表盘
├── QuizSessionReport.tsx     # 单次练习报告
└── QuizSettings.tsx          # 问答系统设置
```

### 9.2 模块依赖关系

```
                types.ts
               ╱   |   ╲
              ╱    |    ╲
    quizEngine  scorer  scheduler
        |         |        |
        └────┬────┘        |
             |             |
       storageService ─────┘
             |
        prompts.ts
             |
    ┌────────┴────────┐
    |                 |
 RAG Pipeline    chatService
(向量检索)        (LLM 调用)
```

---

## 10. 与现有系统的集成点

### 10.1 复用的现有模块

| 现有模块 | 复用内容 | 集成方式 |
|---------|---------|---------|
| `services/ragLlamaIndex/queryEngine.ts` | `RagPipeline.query()` 知识检索 | 直接 import 调用 |
| `services/ragLlamaIndex/vectorStore.ts` | `LocalVectorStore` 向量操作 | 通过 RagPipeline 间接使用 |
| `services/ragLlamaIndex/embedding.ts` | `getEmbedding()` 文本向量化 | 直接 import 调用 |
| `services/ragLlamaIndex/knowledgeGraph.ts` | `KnowledgeGraph` 实体/三元组 | 通过 RagPipeline 间接使用 |
| `services/chatService.ts` | LLM 调用（题目生成/评分） | 直接 import 调用 |
| `electron/preload.ts` | `saveAppData` / `loadAppData` / `writeFile` IPC | 通过 `window.electronAPI` 调用 |
| `utils/learningStorage.ts` | 目录管理模式参考 | 参考模式，不直接复用 |

### 10.2 UI 集成入口

```typescript
// 在 NavRail.tsx 添加入口
{
  id: 'quiz',
  icon: <Brain size={20} />,
  label: '智能问答',
}

// 在 App.tsx 添加路由
case 'quiz':
  return <QuizPractice
    ragPipeline={ragPipeline}
    chatConfig={chatConfig}
    embeddingConfig={embeddingConfig}
  />;
```

### 10.3 与 LearningManager 的联动

```
LearningManager（学习模块）
      │
      │ 用户正在学习某课程的某章节
      │
      ├── 点击"练习本章知识" ──── ▶ QuizPractice
      │   自动限定 topic 为当前章节的知识标签
      │
      └── 学习完成后 ──── ▶ 自动检查是否有到期复习
          如有，弹出提醒引导去 QuizPractice
```

---

## 11. 实现路线图

### Phase 1: 基础框架

- [ ] `quiz-types` — 定义所有 TypeScript 类型接口
- [ ] `quiz-storage` — 实现持久化存储服务

### Phase 2: 核心引擎

- [ ] `quiz-engine` — 出题引擎（RAG 采样 + LLM 生成 + 去重）
- [ ] `quiz-scorer` — 评分引擎（三级评分流水线）
- [ ] `quiz-scheduler` — 自适应调度引擎（SM-2 + 遗忘曲线）

### Phase 3: 用户界面

- [ ] `quiz-ui-practice` — 练习模式 UI
- [ ] `quiz-ui-dashboard` — 统计仪表盘 UI

### Phase 4: 集成与优化

- [ ] `quiz-integration` — 与 NavRail / LearningManager 集成
- [ ] 性能优化（embedding 缓存、批量评分等）
- [ ] 导入/导出功能

---

> **文档结束** — 如有问题或需要调整，请在实现前讨论确认。
