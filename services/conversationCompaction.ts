import { ChatMessage, ChatService } from './chatService';
import {
  buildFallbackConversationSummary,
  ConversationCompactionSelectionOptions,
  ConversationMemoryMessage,
  ConversationMemoryState,
  selectConversationCompactionMessages,
} from './conversationMemory';

export interface ConversationCompactionOptions extends ConversationCompactionSelectionOptions {
  maxTranscriptChars?: number;
  maxSummaryChars?: number;
  domainLabel?: string;
  memoryInstruction?: string;
}

export interface ConversationCompactionResult {
  memoryState: ConversationMemoryState | null;
  compacted: boolean;
  usedFallback: boolean;
  error?: string;
  compactedMessageCount: number;
  compactedCharCount: number;
}

const DEFAULT_COMPACTION_OPTIONS: Required<ConversationCompactionOptions> = {
  keepRecentTurns: 8,
  minMessagesForCompaction: 14,
  minCharsForCompaction: 24000,
  maxTranscriptChars: 52000,
  maxSummaryChars: 12000,
  domainLabel: '通用对话',
  memoryInstruction: '',
};

const truncateText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.7);
  const tail = Math.max(maxChars - head - 14, 0);
  return `${value.slice(0, head)}\n...(中间内容已省略)...\n${tail > 0 ? value.slice(-tail) : ''}`;
};

const roleLabel = (role: ConversationMemoryMessage['role']) => {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return '系统';
};

const formatTranscript = (
  messages: ConversationMemoryMessage[],
  maxChars: number,
): string => {
  const lines = messages.map((message, index) => {
    const attachments = Array.isArray(message.attachments) && message.attachments.length > 0
      ? `\n附件：${message.attachments.map(item => item.name || item.mimeType || item.type || '未命名附件').join('、')}`
      : '';
    return `### ${index + 1}. ${roleLabel(message.role)} / ${new Date(message.timestamp || Date.now()).toLocaleString()}\n${message.content || ''}${attachments}`;
  });
  return truncateText(lines.join('\n\n'), maxChars);
};

const buildCompactionMessages = (
  previousSummary: string,
  candidateMessages: ConversationMemoryMessage[],
  options: Required<ConversationCompactionOptions>,
): ChatMessage[] => [
  {
    id: 'compact-system',
    role: 'system',
    content: [
      '你是对话上下文压缩器。你的任务是把多轮对话压缩成后续模型可直接使用的长期记忆。',
      '只保留对后续回答、执行任务、理解用户偏好、避免重复操作有价值的信息。',
      '不要编造对话中没有出现的事实。不要输出寒暄。不要保留 API Key、密码、token 等敏感明文。',
      '输出 Markdown，建议包含：用户偏好、已确认事实、已完成事项、未完成事项、重要约束、后续应注意的问题。',
      options.memoryInstruction,
    ].filter(Boolean).join('\n'),
    timestamp: 0,
  },
  {
    id: 'compact-user',
    role: 'user',
    content: [
      `领域：${options.domainLabel}`,
      previousSummary ? `## 已有长期记忆\n${previousSummary}` : '## 已有长期记忆\n无',
      `## 需要合并进长期记忆的新对话\n${formatTranscript(candidateMessages, options.maxTranscriptChars)}`,
      '',
      `请输出合并后的长期记忆，控制在 ${options.maxSummaryChars} 字以内。`,
    ].join('\n\n'),
    timestamp: Date.now(),
  },
];

export const maybeCompactConversationMemory = async (
  input: {
    messages: ConversationMemoryMessage[];
    memoryState?: ConversationMemoryState | null;
    chatService: ChatService | null | undefined;
    provider?: string;
    model?: string;
    options?: ConversationCompactionOptions;
  },
): Promise<ConversationCompactionResult> => {
  const options = { ...DEFAULT_COMPACTION_OPTIONS, ...(input.options || {}) };
  const selection = selectConversationCompactionMessages(input.messages, input.memoryState, options);
  if (!selection.shouldCompact || !selection.lastCandidate) {
    return {
      memoryState: input.memoryState || null,
      compacted: false,
      usedFallback: false,
      compactedMessageCount: selection.candidateMessages.length,
      compactedCharCount: selection.candidateCharCount,
    };
  }

  const previousSummary = input.memoryState?.summary || '';
  let summary = '';
  let usedFallback = false;
  let error: string | undefined;

  try {
    if (!input.chatService) throw new Error('ChatService 未初始化');
    summary = await input.chatService.completeText(buildCompactionMessages(previousSummary, selection.candidateMessages, options));
  } catch (err) {
    usedFallback = true;
    error = err instanceof Error ? err.message : String(err);
    const fallbackSummary = buildFallbackConversationSummary(selection.candidateMessages, options.maxSummaryChars);
    summary = [
      previousSummary ? `## 已有长期记忆\n${previousSummary}` : '',
      fallbackSummary ? `## 新增压缩记忆\n${fallbackSummary}` : '',
    ].filter(Boolean).join('\n\n');
  }

  const memoryState: ConversationMemoryState = {
    summary: truncateText((summary || previousSummary || '').trim(), options.maxSummaryChars),
    structured: input.memoryState?.structured,
    compactedUntilMessageId: selection.lastCandidate.id,
    compactedUntilTimestamp: selection.lastCandidate.timestamp,
    sourceMessageCount: (input.memoryState?.sourceMessageCount || 0) + selection.candidateMessages.length,
    sourceCharCount: (input.memoryState?.sourceCharCount || 0) + selection.candidateCharCount,
    updatedAt: Date.now(),
    provider: input.provider,
    model: input.model,
    version: 1,
  };

  return {
    memoryState,
    compacted: true,
    usedFallback,
    error,
    compactedMessageCount: selection.candidateMessages.length,
    compactedCharCount: selection.candidateCharCount,
  };
};
