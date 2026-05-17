export type AgentMentionType = 'skill' | 'mcp-server' | 'tool' | 'prompt' | 'module';

export interface AgentMention {
  id: string;
  type: AgentMentionType;
  label: string;
  value: string;
  token?: string;
  description?: string;
  source?: string;
  invocationType?: 'explicit' | 'implicit';
  metadata?: Record<string, any>;
}

export const AGENT_MENTION_TYPE_LABELS: Record<AgentMentionType, string> = {
  skill: 'Skill',
  'mcp-server': 'MCP',
  tool: 'Tool',
  prompt: 'Prompt',
  module: 'Module',
};

export const normalizeAgentMentionToken = (value: string) =>
  value.trim().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5:@./-]+/g, '');

export const createAgentMentionToken = (mention: Pick<AgentMention, 'type' | 'label'>) =>
  `@${AGENT_MENTION_TYPE_LABELS[mention.type]}:${normalizeAgentMentionToken(mention.label)}`;

const AGENT_MENTION_TOKEN_RE =
  /(^|\s)[@＠](?:Skill|MCP|Tool|Prompt|Module|技能|工具|模块|提示词)\s*[:：][^\s@＠]+/gi;

export const stripAgentMentionTokens = (text: string) =>
  text
    .replace(AGENT_MENTION_TOKEN_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const formatAgentMention = (mention: AgentMention) => {
  const typeLabel = AGENT_MENTION_TYPE_LABELS[mention.type] || mention.type;
  const parts = [
    `${typeLabel}：${mention.label}`,
    mention.value && mention.value !== mention.label ? `id=${mention.value}` : '',
    mention.source ? `来源=${mention.source}` : '',
    mention.description ? `说明=${mention.description}` : '',
  ].filter(Boolean);
  return `- ${parts.join('；')}`;
};

export const formatAgentMentionsForPrompt = (mentions: AgentMention[]) => {
  const explicitMentions = mentions.filter(mention => (mention.invocationType || 'explicit') === 'explicit');
  if (explicitMentions.length === 0) return '';
  return [
    '用户在输入中显式 @ 提到了以下能力。它们是本轮任务的强约束和优先上下文：',
    ...explicitMentions.map(formatAgentMention),
    '',
    '执行规则：',
    '1. 如果 @ 了 Skill，应在规划和执行前优先加载并遵循该 Skill 的内容。',
    '2. 如果 @ 了 MCP Server，应优先查询该 Server 和它暴露的工具，再决定是否调用 MCP 工具。',
    '3. 如果 @ 了 Tool，应优先考虑该工具；除非工具不适合任务或不可用，否则不要忽略。',
    '4. 如果 @ 了 Prompt，应把它作为用户指定的提示词上下文使用。',
    '5. 如果显式能力不可用，应在最终回复里说明原因。',
  ].join('\n');
};
