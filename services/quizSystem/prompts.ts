/**
 * Quiz System — 动态 Prompt 生成
 *
 * Prompt 结构：
 * ① 角色定位（场景 + 用户自定义）
 * ② 数据源（按向量库分组的向量块 + 元信息 + 标签关联）
 * ③ 考生画像
 * ④ 阶段专属要求（复习/薄弱/新知识/随机 各有不同策略和示例）
 * ⑤ 通用出题规则
 * ⑥ 输出格式
 */

import type { QuestionType, FollowUpStrategy, VectorStoreRole, TagMastery } from './types';

// ═══════════════════════════════════════════════════════
// 数据接口
// ═══════════════════════════════════════════════════════

/** 向量块（含完整元信息和标签关联） */
export interface PromptChunk {
  text: string;
  chunkId?: string;
  role?: VectorStoreRole;
  storeName?: string;
  /** 向量块的元数据 */
  metadata?: {
    fileName?: string;
    pageNumber?: number;
    chunkIndex?: number;
    [key: string]: any;
  };
  /** 与该块内容关联的标签掌握情况 */
  relatedTags?: {
    tag: string;
    masteryLevel: string;
    avgScore: number;
    totalAttempts: number;
    lastReviewAt?: number;
  }[];
}

/** 向量库级别的上下文信息 */
export interface StorePromptContext {
  name: string;
  role?: VectorStoreRole;
  summary?: string;
  topicVocabulary?: string[];
  chunks: PromptChunk[];
}

/** 考生画像 */
export interface StudentProfile {
  overallMastery: number;
  weakTags: string[];
  strongTags: string[];
  recentAvgScore: number;
  totalAttempts: number;
}

/** 历史题目示例（用于复习/薄弱阶段） */
export interface HistoryExample {
  question: string;
  userAnswer: string;
  score: number;
  keyPointsHit: string[];
  keyPointsMissed: string[];
}

/** 出题阶段 */
export type GenerationPhase = 'review' | 'weak' | 'new' | 'random';

// ═══════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════

const ROLE_LABELS: Record<string, string> = {
  material: '📚 知识资料',
  questions_no_answer: '📝 题库（无答案）',
  questions_with_answer: '📝 题库（含答案）',
};

const QUESTION_TYPE_DESC: Record<QuestionType, string> = {
  concept: '概念解释题 — 要求解释一个核心概念，考察记忆和理解',
  comparison: '对比分析题 — 要求比较两个或多个相关概念的异同，考察分析能力',
  scenario: '应用场景题 — 给定实际场景，要求做出设计或选择，考察综合应用能力',
  coding: '代码实操题 — 要求写出实现或分析代码逻辑，考察编程和创造力',
  follow_up: '追问深入题 — 基于之前的回答进行追问，考察深度思考能力',
};

const DIFFICULTY_DESC: Record<number, string> = {
  1: '入门基础 — 考察基本定义和概念',
  2: '概念理解 — 考察对原理的理解',
  3: '综合应用 — 考察在实际场景中的运用',
  4: '深度分析 — 考察底层原理和设计思考',
  5: '专家级别 — 考察系统性思维和创新能力',
};

/** 阶段专属策略描述 */
const PHASE_STRATEGIES: Record<GenerationPhase, { title: string; instruction: string }> = {
  review: {
    title: '📗 到期复习',
    instruction: `这是一道**复习题**。考生之前学过这些知识但需要巩固。
策略：
- 从**不同角度**考察同一知识点，避免原题重复
- 如果考生之前在某些得分点表现薄弱，可以重点围绕这些点出题
- 难度可以比上次略高，检验是否有更深入的理解
- 参考下面的历史答题记录，了解考生对该知识的掌握情况`,
  },
  weak: {
    title: '📙 薄弱强化',
    instruction: `这是一道**薄弱强化题**。考生在这个知识点上表现不佳，需要针对性练习。
策略：
- 聚焦考生之前**答错或遗漏**的知识要点
- 适当降低难度，帮助考生建立信心和基础理解
- 如果考生多次在同一知识点犯错，尝试用**更简单直接**的方式提问
- 参考下面的历史答题记录，特别关注考生薄弱的部分`,
  },
  new: {
    title: '📘 新知识探索',
    instruction: `这是一道**新知识题**。考生尚未被考察过这个领域。
策略：
- 从基础概念入手，不要一开始就出高难度题
- 优先考察核心概念和关键定义
- 题目应能帮助考生建立对该知识领域的初步认识
- 参考答案应详尽，便于考生学习`,
  },
  random: {
    title: '📓 随机巩固',
    instruction: `这是一道**随机巩固题**，用于拓宽知识面。
策略：
- 可以跨领域出题，增加知识的广度
- 难度适中，以检验综合运用能力为主
- 尽量选择材料中有趣或实用的知识点`,
  },
};

// ═══════════════════════════════════════════════════════
// 核心：动态出题 Prompt
// ═══════════════════════════════════════════════════════

export function buildQuestionPrompt(
  storeContexts: StorePromptContext[],
  questionType: QuestionType,
  difficulty: number,
  phase: GenerationPhase,
  options?: {
    rolePrompt?: string;
    quizDirection?: string;
    existingQuestions?: string[];
    studentProfile?: StudentProfile;
    historyExamples?: HistoryExample[];
    targetTag?: string;
    targetTopic?: string;
  },
): string {
  const sections: string[] = [];

  // ═══ ① 角色定位 ═══
  const defaultRole = '你是一位专业的出题专家和知识评估师。';
  const rolePrompt = options?.rolePrompt?.trim() || defaultRole;
  sections.push(`# 角色\n\n${rolePrompt}`);

  // ═══ ② 数据源 ═══
  const dataSections: string[] = [];
  for (const store of storeContexts) {
    const roleLabel = ROLE_LABELS[store.role || 'material'];
    const storeHeader = `## 【向量库】${store.name}（${roleLabel}）`;
    const storeInfo: string[] = [];
    if (store.summary) {
      storeInfo.push(`> **摘要**: ${store.summary}`);
    }
    if (store.topicVocabulary && store.topicVocabulary.length > 0) {
      storeInfo.push(`> **主题词表（该向量库的核心知识领域）**: ${store.topicVocabulary.slice(0, 20).join(' · ')}`);
      storeInfo.push(`> _出题时应优先围绕上述主题词所涵盖的知识领域展开_`);
    }

    const chunkTexts = store.chunks.map((chunk, i) => {
      const lines: string[] = [];
      const header = `### 片段 ${i + 1}`;
      lines.push(header);

      // 元信息行
      const metaParts: string[] = [];
      if (chunk.metadata?.fileName) metaParts.push(`文件: ${chunk.metadata.fileName}`);
      if (chunk.metadata?.pageNumber) metaParts.push(`页码: ${chunk.metadata.pageNumber}`);
      if (chunk.chunkId) metaParts.push(`ID: ${chunk.chunkId}`);
      if (metaParts.length > 0) {
        lines.push(`[${metaParts.join(' | ')}]`);
      }

      // 标签关联历史
      if (chunk.relatedTags && chunk.relatedTags.length > 0) {
        const tagLines = chunk.relatedTags.map(t => {
          const ago = t.lastReviewAt
            ? `${Math.round((Date.now() - t.lastReviewAt) / 86400000)}天前`
            : '从未';
          return `  - 「${t.tag}」${t.masteryLevel}，均分${Math.round(t.avgScore)}，考${t.totalAttempts}次，上次${ago}`;
        });
        lines.push(`[关联标签]\n${tagLines.join('\n')}`);
      }

      lines.push('');
      lines.push(chunk.text);
      return lines.join('\n');
    });

    dataSections.push([storeHeader, ...storeInfo, '', ...chunkTexts].join('\n'));
  }
  sections.push(`# 数据源\n\n${dataSections.join('\n\n---\n\n')}`);

  // ═══ ③ 考生画像 ═══
  if (options?.studentProfile) {
    const p = options.studentProfile;
    sections.push(`# 考生画像

- 整体掌握率: ${p.overallMastery}%
- 近期平均分: ${p.recentAvgScore}/100
- 已练习次数: ${p.totalAttempts}
- 薄弱标签: ${p.weakTags.join('、') || '无'}
- 擅长标签: ${p.strongTags.join('、') || '无'}`);
  }

  // ═══ ③.5 出题方向 ═══
  if (options?.quizDirection?.trim()) {
    sections.push(`# 出题方向（用户指定）

${options.quizDirection.trim()}

> 请严格遵循以上出题方向，确保生成的题目符合用户的学习意图。`);
  }

  // ═══ ④ 阶段专属要求 ═══
  const phaseInfo = PHASE_STRATEGIES[phase];
  let phaseSection = `# 出题阶段：${phaseInfo.title}\n\n${phaseInfo.instruction}`;

  if (options?.targetTag) {
    phaseSection += `\n\n**本题目标标签**: 「${options.targetTag}」`;
  }
  if (options?.targetTopic) {
    phaseSection += `\n\n**本题目标主题**: 「${options.targetTopic}」`;
  }

  // 历史题目示例（复习和薄弱阶段）
  if (options?.historyExamples && options.historyExamples.length > 0) {
    const examples = options.historyExamples.slice(0, 2).map((ex, i) => {
      return `**历史题目 ${i + 1}** (得分: ${ex.score}/100)
题目: ${ex.question}
考生回答: ${ex.userAnswer.slice(0, 300)}${ex.userAnswer.length > 300 ? '...' : ''}
命中: ${ex.keyPointsHit.join('、') || '无'}
遗漏: ${ex.keyPointsMissed.join('、') || '无'}`;
    }).join('\n\n');

    phaseSection += `\n\n## 历史答题记录\n\n${examples}`;
  }

  sections.push(phaseSection);

  // ═══ ⑤ 通用出题规则 ═══
  let rules = `# 出题要求

- **题型**: ${QUESTION_TYPE_DESC[questionType] || QUESTION_TYPE_DESC.concept}
- **难度**: ${difficulty}/5（${DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC[3]}）
- **语言**: 中文出题
- 考察对核心概念的深度理解，而非死记硬背
- 不要出选择题，只出开放式问答题
- keyPoints 应为 3-5 个独立可验证的知识要点
- referenceAnswer 应完整（200-500字）但不啰嗦
- tags 应反映知识点所属领域，2-4 个`;

  // 去重
  if (options?.existingQuestions?.length) {
    rules += `\n\n## 已有题目（请勿重复）\n${options.existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  }

  sections.push(rules);

  // ═══ ⑥ 输出格式 ═══
  sections.push(`# 输出格式（严格 JSON，不要多余文字）

\`\`\`json
{
  "question": "题目内容",
  "type": "${questionType}",
  "difficulty": ${difficulty},
  "referenceAnswer": "完整的参考答案（200-500字）",
  "keyPoints": [
    "关键得分点1（一句话描述）",
    "关键得分点2",
    "关键得分点3"
  ],
  "tags": ["知识标签1", "知识标签2"]
}
\`\`\``);

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════
// 评分 Prompt
// ═══════════════════════════════════════════════════════

/** 评分 Prompt（第三级 LLM 深度评分） */
export function buildScoringPrompt(
  question: string,
  referenceAnswer: string,
  keyPoints: string[],
  userAnswer: string,
  cosineSimilarity: number,
  keyPointMatches: Array<{ keyPoint: string; status: string; similarity: number }>,
  isInterview?: boolean,
  historyExamples?: Array<{
    question: string;
    userAnswer: string;
    score: number;
    masteryLevel: string;
    hitPoints: string[];
    missedPoints: string[];
  }>,
): string {
  const kpFormatted = keyPointMatches
    .map(kp => `- ${kp.keyPoint}: ${kp.status === 'hit' ? '✅ 命中' : kp.status === 'partial' ? '⚠️ 部分命中' : '❌ 未命中'} (相似度: ${(kp.similarity * 100).toFixed(0)}%)`)
    .join('\n');

  const sections: string[] = [];

  sections.push(`你是一位严格但公正的技术考官。请评估以下回答。

## 题目

${question}

## 参考答案

${referenceAnswer}

## 关键得分点

${keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}

## 学生回答

${userAnswer}

## 预评估数据

- 语义相似度: ${(cosineSimilarity * 100).toFixed(1)}%（仅供参考，embedding 相似度容易偏高，不应作为高分依据）
- 关键点初步匹配（基于语义向量，仅供参考，需要你根据实际内容重新判断）:
${kpFormatted}`);

  // 历史评判参考
  if (historyExamples && historyExamples.length > 0) {
    sections.push(`## 历史评判参考（同类题目的评分先例，帮助你保持评分一致性）

${historyExamples.map((ex, i) => `### 先例 ${i + 1}
- **题目**: ${ex.question}
- **学生回答**: ${ex.userAnswer}
- **评分**: ${ex.score} 分（${ex.masteryLevel}）
- **命中得分点**: ${ex.hitPoints.length > 0 ? ex.hitPoints.join('、') : '无'}
- **遗漏得分点**: ${ex.missedPoints.length > 0 ? ex.missedPoints.join('、') : '无'}`).join('\n\n')}`);
  }

  sections.push(`## 评分标准

| 维度 | 满分 | 评分要点 |
|------|------|---------|
| 关键点覆盖 | 40 | 是否提到了核心概念？未提到的关键点必须列出 |
| 准确性 | 25 | 所述内容是否有事实错误？列出每个错误 |
| 完整性 | 20 | 是否覆盖了问题的各个方面？ |
| 表达清晰度 | 15 | 逻辑是否清晰？表达是否专业？|

## 输出格式（严格 JSON，不要多余文字）

\`\`\`json
{
  "totalScore": 0,
  "dimensions": {
    "keyPointCoverage": { "score": 0, "hitPoints": [], "missedPoints": [] },
    "accuracy": { "score": 0, "errors": [] },
    "completeness": { "score": 0, "feedback": "" },
    "clarity": { "score": 0, "feedback": "" }
  },
  "overallFeedback": "总体评语",
  "suggestions": ["改进建议1"],
  "masteryLevel": "not_mastered|partially|mastered|expert"${isInterview ? `,
  "shouldFollowUp": true,
  "followUpReason": "需要追问的原因（如有遗漏知识点/存在错误/需要深入）",
  "interviewerComment": "面试官的简短口头回应（1-2句，如：'你提到了xx，不错，但还有一些重要方面没有涉及。让我追问一下...'或'很好，基本覆盖了要点。我们继续下一个问题。'）"` : ''}
}
\`\`\`

## 重要规则

1. totalScore 必须等于四个维度分数之和
2. 即使学生用不同的表述方式，只要意思正确就应认可
3. 预评估的语义相似度仅供参考，不要因为相似度高就直接给高分——embedding 对短文本容易产生偏高相似度
4. 关键点的初步匹配结果仅供参考，请根据实际语义重新判断每个得分点是否真正被覆盖
5. 如果学生有超出参考答案的正确补充，应该加分鼓励${historyExamples && historyExamples.length > 0 ? `
6. 参考历史评判先例保持评分尺度一致，但每道题应独立评估` : ''}${isInterview ? `
${historyExamples && historyExamples.length > 0 ? '7' : '6'}. 在面试模式下：shouldFollowUp 表示是否需要追问。如果回答有明显遗漏或错误且值得追问，设为 true。如果回答已经足够好或追问价值不大，设为 false。
${historyExamples && historyExamples.length > 0 ? '8' : '7'}. interviewerComment 是面试官的口头回应，要自然、简短，模拟真实面试对话。` : ''}`);

  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════
// 追问 Prompt
// ═══════════════════════════════════════════════════════

export function buildFollowUpPrompt(
  previousQuestion: string,
  userAnswer: string,
  score: number,
  hitPoints: string[],
  missedPoints: string[],
  errors: string[],
): string {
  return `你是一位经验丰富的技术面试官，正在进行一场技术面试。

## 上一个问题

${previousQuestion}

## 候选人的回答

${userAnswer}

## 回答评估

- 得分: ${score}/100
- 命中的知识点: ${hitPoints.join('、') || '无'}
- 遗漏的知识点: ${missedPoints.join('、') || '无'}
- 存在的错误: ${errors.join('、') || '无'}

## 追问策略

请根据候选人的回答情况选择追问策略：

1. 如果有**明显错误** → 礼貌地指出并请候选人重新思考
2. 如果有**遗漏的重要知识点** → 引导候选人往该方向思考
3. 如果回答**较为完整** → 延伸到更深层或相关的知识点
4. 如果回答**非常优秀** → 提升难度，问更有挑战性的延伸问题

## 输出格式（严格 JSON，不要多余文字）

\`\`\`json
{
  "question": "追问的问题",
  "type": "follow_up",
  "difficulty": 3,
  "followUpStrategy": "error_correction|missing_point|deeper_dive|extension",
  "referenceAnswer": "追问的参考答案",
  "keyPoints": ["得分点1", "得分点2", "得分点3"],
  "tags": ["相关标签"]
}
\`\`\``;
}

// ═══════════════════════════════════════════════════════
// Session 总结 Prompt
// ═══════════════════════════════════════════════════════

export function buildSessionSummaryPrompt(
  totalQuestions: number,
  avgScore: number,
  scores: number[],
  strongTags: string[],
  weakTags: string[],
): string {
  return `请根据以下练习数据，生成一份简洁的练习总结和下次复习建议。

## 练习数据

- 题目总数: ${totalQuestions}
- 平均分: ${avgScore.toFixed(1)}
- 各题得分: ${scores.join(', ')}
- 表现好的知识点: ${strongTags.join('、') || '无'}
- 薄弱知识点: ${weakTags.join('、') || '无'}

## 输出格式（严格 JSON，不要多余文字）

\`\`\`json
{
  "overallGrade": "A|B|C|D|F",
  "recommendation": "下次练习建议（2-3句话，具体指出应重点复习什么）"
}
\`\`\``;
}
