/**
 * Quiz System — Prompt 模板
 */

import type { QuestionType, FollowUpStrategy, VectorStoreRole } from './types';

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

/** 出题 Prompt */
export function buildQuestionPrompt(
  chunks: string[],
  questionType: QuestionType,
  difficulty: number,
  existingQuestions?: string[],
  sourceRole?: VectorStoreRole,
): string {
  const dedup = existingQuestions?.length
    ? `\n\n## 已有题目（请勿重复）\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : '';

  const chunksContent = chunks.join('\n\n---\n\n');

  let roleIntro: string;
  let contentLabel: string;
  let roleRequirements: string;

  if (sourceRole === 'questions_no_answer') {
    roleIntro = '你是一位专业的出题专家。以下是一些题目素材（不含答案），请基于这些题目进行再创作。';
    contentLabel = '原始题目素材';
    roleRequirements = `1. 首先理解每道题目的考查方向
2. 为题目生成完整的参考答案
3. 对题目进行适当的扩展和改动，使其更加完善
4. 保持题目的核心考查方向不变`;
  } else if (sourceRole === 'questions_with_answer') {
    roleIntro = '你是一位专业的出题专家。以下是一些题目及其答案，请基于这些内容进行丰富和扩展。';
    contentLabel = '原始题目与答案';
    roleRequirements = `1. 在原题目和答案的基础上，进行丰富、扩展和补充
2. 可以调整题目角度、增加深度或拓展广度
3. 确保参考答案覆盖所有关键知识点
4. 保持与原题相关的知识领域`;
  } else {
    roleIntro = '你是一位专业的技术面试官和出题专家。请根据以下知识内容，生成一道高质量的题目。';
    contentLabel = '知识内容';
    roleRequirements = `1. **题型**: ${QUESTION_TYPE_DESC[questionType] || QUESTION_TYPE_DESC.concept}
2. **难度**: ${difficulty}/5（${DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC[3]}）
3. **目标**: 考察对核心概念的深度理解，而非死记硬背
4. **语言**: 中文出题`;
  }

  // For non-material roles, still include type/difficulty info
  const extraReqs = sourceRole && sourceRole !== 'material'
    ? `\n5. **题型**: ${QUESTION_TYPE_DESC[questionType] || QUESTION_TYPE_DESC.concept}\n6. **难度**: ${difficulty}/5（${DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC[3]}）\n7. **语言**: 中文出题`
    : '';

  return `${roleIntro}

## ${contentLabel}

${chunksContent}

## 出题要求

${roleRequirements}${extraReqs}
${dedup}

## 输出格式（严格 JSON，不要多余文字）

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
\`\`\`

## 注意事项

- keyPoints 应为 3-5 个，每个是独立可验证的知识要点
- referenceAnswer 应完整但不啰嗦
- tags 应反映知识点所属领域，2-4 个
- 不要出选择题，只出开放式问答题`;
}

/** 评分 Prompt（第三级 LLM 深度评分） */
export function buildScoringPrompt(
  question: string,
  referenceAnswer: string,
  keyPoints: string[],
  userAnswer: string,
  cosineSimilarity: number,
  keyPointMatches: Array<{ keyPoint: string; status: string; similarity: number }>,
): string {
  const kpFormatted = keyPointMatches
    .map(kp => `- ${kp.keyPoint}: ${kp.status === 'hit' ? '✅ 命中' : kp.status === 'partial' ? '⚠️ 部分命中' : '❌ 未命中'} (相似度: ${(kp.similarity * 100).toFixed(0)}%)`)
    .join('\n');

  return `你是一位严格但公正的技术考官。请评估以下回答。

## 题目

${question}

## 参考答案

${referenceAnswer}

## 关键得分点

${keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}

## 学生回答

${userAnswer}

## 预评估数据

- 语义相似度: ${(cosineSimilarity * 100).toFixed(1)}%（仅供参考）
- 关键点初步匹配:
${kpFormatted}

## 评分标准

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
  "masteryLevel": "not_mastered|partially|mastered|expert"
}
\`\`\`

## 重要规则

1. totalScore 必须等于四个维度分数之和
2. 即使学生用不同的表述方式，只要意思正确就应认可
3. 参考预评估数据作为锚定，但最终以你的专业判断为准
4. 如果学生有超出参考答案的正确补充，应该加分鼓励`;
}

/** 追问 Prompt */
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

/** Session 总结 Prompt */
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
