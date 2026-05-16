export type ConversationRole = 'user' | 'assistant' | 'system';

export interface ConversationMemoryMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  attachments?: Array<{
    type?: string;
    name?: string;
    mimeType?: string;
    size?: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export interface ConversationContextOptions {
  keepRecentTurns?: number;
  maxContextChars?: number;
  maxSummaryChars?: number;
  maxStructuredMemoryChars?: number;
  maxRecentMessageChars?: number;
  memoryState?: ConversationMemoryState | null;
  memoryMessageId?: string;
  memoryTitle?: string;
}

export interface ConversationStorageOptions {
  maxMessages?: number;
  maxStoredChars?: number;
  maxMessageChars?: number;
}

export interface ConversationMemoryState {
  summary: string;
  structured?: ConversationStructuredMemory;
  compactedUntilMessageId?: string;
  compactedUntilTimestamp?: number;
  sourceMessageCount?: number;
  sourceCharCount?: number;
  updatedAt: number;
  provider?: string;
  model?: string;
  version: 1;
}

export type ConversationStructuredMemoryKey =
  | 'userPreferences'
  | 'importantFacts'
  | 'openTasks'
  | 'completedTasks'
  | 'toolResults'
  | 'constraints';

export interface ConversationStructuredMemoryEntry {
  id: string;
  text: string;
  source?: string;
  updatedAt: number;
}

export type ConversationStructuredMemory = Record<ConversationStructuredMemoryKey, ConversationStructuredMemoryEntry[]>;

export type ConversationStructuredMemoryPatch = Partial<Record<ConversationStructuredMemoryKey, Array<string | Partial<ConversationStructuredMemoryEntry>>>>;

export interface ConversationCompactionSelectionOptions {
  keepRecentTurns?: number;
  minMessagesForCompaction?: number;
  minCharsForCompaction?: number;
}

export interface ConversationCompactionSelection<T extends ConversationMemoryMessage> {
  shouldCompact: boolean;
  candidateMessages: T[];
  retainedMessages: T[];
  lastCandidate?: T;
  candidateCharCount: number;
}

const DEFAULT_CONTEXT_OPTIONS: Required<ConversationContextOptions> = {
  keepRecentTurns: 8,
  maxContextChars: 70000,
  maxSummaryChars: 12000,
  maxStructuredMemoryChars: 9000,
  maxRecentMessageChars: 16000,
  memoryState: null,
  memoryMessageId: 'conversation-memory',
  memoryTitle: '以下是较早对话的压缩记忆，供你延续上下文使用。',
};

const DEFAULT_STORAGE_OPTIONS: Required<ConversationStorageOptions> = {
  maxMessages: 200,
  maxStoredChars: 300000,
  maxMessageChars: 50000,
};

const DEFAULT_COMPACTION_SELECTION_OPTIONS: Required<ConversationCompactionSelectionOptions> = {
  keepRecentTurns: 8,
  minMessagesForCompaction: 14,
  minCharsForCompaction: 24000,
};

const STRUCTURED_MEMORY_KEYS: ConversationStructuredMemoryKey[] = [
  'userPreferences',
  'importantFacts',
  'openTasks',
  'completedTasks',
  'toolResults',
  'constraints',
];

const STRUCTURED_MEMORY_LIMITS: Record<ConversationStructuredMemoryKey, number> = {
  userPreferences: 40,
  importantFacts: 50,
  openTasks: 40,
  completedTasks: 50,
  toolResults: 60,
  constraints: 40,
};

const STRUCTURED_MEMORY_LABELS: Record<ConversationStructuredMemoryKey, string> = {
  userPreferences: '用户偏好',
  importantFacts: '重要事实',
  openTasks: '未完成事项',
  completedTasks: '已完成事项',
  toolResults: '工具执行结论',
  constraints: '长期约束',
};

const SENSITIVE_MEMORY_PATTERN =
  /(api[\s_-]?key|apikey|secret|token|bearer|password|passwd|密码|密钥|令牌|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{12,})/i;

const roleLabel = (role: ConversationRole): string => {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return '系统';
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const truncateText = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  if (maxChars <= 16) return value.slice(0, maxChars);
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(maxChars - head - 12, 0);
  return `${value.slice(0, head)}...(已压缩)...${tail > 0 ? value.slice(-tail) : ''}`;
};

const contentChars = (messages: ConversationMemoryMessage[]): number =>
  messages.reduce((sum, message) => sum + (message.content?.length || 0), 0);

const normalizeMemoryEntryText = (value: unknown, maxChars = 900): string => {
  const text = typeof value === 'string' ? normalizeWhitespace(value) : '';
  if (!text || SENSITIVE_MEMORY_PATTERN.test(text)) return '';
  return truncateText(text, maxChars);
};

const createMemoryEntry = (
  value: string | Partial<ConversationStructuredMemoryEntry>,
  source?: string,
): ConversationStructuredMemoryEntry | null => {
  const text = normalizeMemoryEntryText(typeof value === 'string' ? value : value.text);
  if (!text) return null;
  return {
    id: typeof value === 'string' ? `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : value.id || `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    source: typeof value === 'string' ? source : value.source || source,
    updatedAt: typeof value === 'string' ? Date.now() : typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
};

export const createEmptyStructuredMemory = (): ConversationStructuredMemory => ({
  userPreferences: [],
  importantFacts: [],
  openTasks: [],
  completedTasks: [],
  toolResults: [],
  constraints: [],
});

export const normalizeStructuredMemory = (value: any): ConversationStructuredMemory | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const normalized = createEmptyStructuredMemory();
  let hasAny = false;
  for (const key of STRUCTURED_MEMORY_KEYS) {
    const entries = Array.isArray(value[key]) ? value[key] : [];
    normalized[key] = entries
      .map((entry: any) => createMemoryEntry(entry, entry?.source))
      .filter((entry): entry is ConversationStructuredMemoryEntry => Boolean(entry))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, STRUCTURED_MEMORY_LIMITS[key]);
    if (normalized[key].length > 0) hasAny = true;
  }
  return hasAny ? normalized : undefined;
};

export const mergeStructuredMemory = (
  current: ConversationStructuredMemory | undefined,
  patch: ConversationStructuredMemoryPatch,
  source?: string,
): ConversationStructuredMemory | undefined => {
  const base = current ? normalizeStructuredMemory(current) || createEmptyStructuredMemory() : createEmptyStructuredMemory();
  let hasPatch = false;

  for (const key of STRUCTURED_MEMORY_KEYS) {
    const incoming = (patch[key] || [])
      .map(item => createMemoryEntry(item, source))
      .filter((entry): entry is ConversationStructuredMemoryEntry => Boolean(entry));
    if (incoming.length === 0) continue;
    hasPatch = true;

    const merged = [...incoming, ...base[key]];
    const seen = new Set<string>();
    base[key] = merged
      .filter(entry => {
        const identity = normalizeWhitespace(entry.text).toLowerCase();
        if (!identity || seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, STRUCTURED_MEMORY_LIMITS[key]);
  }

  return hasPatch ? base : current;
};

export const mergeConversationMemoryState = (
  current: ConversationMemoryState | null | undefined,
  patch: ConversationStructuredMemoryPatch,
  meta: { provider?: string; model?: string; source?: string } = {},
): ConversationMemoryState | null => {
  const structured = mergeStructuredMemory(current?.structured, patch, meta.source);
  if (!structured) return current || null;
  return {
    summary: current?.summary || '',
    compactedUntilMessageId: current?.compactedUntilMessageId,
    compactedUntilTimestamp: current?.compactedUntilTimestamp,
    sourceMessageCount: current?.sourceMessageCount,
    sourceCharCount: current?.sourceCharCount,
    structured,
    updatedAt: Date.now(),
    provider: meta.provider || current?.provider,
    model: meta.model || current?.model,
    version: 1,
  };
};

export const formatStructuredMemory = (
  structured?: ConversationStructuredMemory,
  maxChars = 9000,
): string => {
  const normalized = normalizeStructuredMemory(structured);
  if (!normalized) return '';
  const sections = STRUCTURED_MEMORY_KEYS
    .map(key => {
      const entries = normalized[key];
      if (!entries.length) return '';
      return [
        `### ${STRUCTURED_MEMORY_LABELS[key]}`,
        ...entries.map(entry => `- ${entry.text}`),
      ].join('\n');
    })
    .filter(Boolean);
  return truncateText(sections.join('\n\n'), maxChars);
};

const attachmentSummary = (message: ConversationMemoryMessage): string => {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (!attachments.length) return '';
  return attachments
    .map(attachment => {
      const name = attachment.name || '未命名附件';
      const type = attachment.type || attachment.mimeType || 'file';
      return `[附件:${type}:${name}]`;
    })
    .join(' ');
};

const cloneWithContent = <T extends ConversationMemoryMessage>(message: T, content: string): T => ({
  ...message,
  content,
});

const splitSystemAndDialogue = <T extends ConversationMemoryMessage>(messages: T[]) => ({
  systemMessages: messages.filter(message => message.role === 'system'),
  dialogueMessages: messages.filter(message => message.role !== 'system'),
});

const indexAfterCompactedMessage = <T extends ConversationMemoryMessage>(
  messages: T[],
  memoryState?: ConversationMemoryState | null,
): number => {
  const compactedId = memoryState?.compactedUntilMessageId;
  if (!compactedId) return 0;
  const index = messages.findIndex(message => message.id === compactedId);
  return index >= 0 ? index + 1 : 0;
};

const takeRecentTurns = <T extends ConversationMemoryMessage>(messages: T[], keepRecentTurns: number): T[] => {
  if (messages.length === 0) return [];

  let userTurns = 0;
  let startIndex = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      userTurns += 1;
      if (userTurns > keepRecentTurns) {
        startIndex = index + 1;
        break;
      }
    }
  }

  return messages.slice(startIndex);
};

const summarizeOlderMessages = <T extends ConversationMemoryMessage>(
  messages: T[],
  maxSummaryChars: number,
): string => {
  if (!messages.length) return '';

  const lines: string[] = [];
  for (const message of messages) {
    const attachmentText = attachmentSummary(message);
    const normalized = normalizeWhitespace(message.content || '');
    const content = truncateText(normalized, 900);
    if (!content && !attachmentText) continue;
    lines.push(`- ${roleLabel(message.role)}：${[attachmentText, content].filter(Boolean).join(' ')}`);
  }

  return truncateText(lines.join('\n'), maxSummaryChars);
};

export const buildFallbackConversationSummary = <T extends ConversationMemoryMessage>(
  messages: T[],
  maxSummaryChars = 12000,
): string => summarizeOlderMessages(messages, maxSummaryChars);

export const selectConversationCompactionMessages = <T extends ConversationMemoryMessage>(
  messages: T[],
  memoryState?: ConversationMemoryState | null,
  options: ConversationCompactionSelectionOptions = {},
): ConversationCompactionSelection<T> => {
  const config = { ...DEFAULT_COMPACTION_SELECTION_OPTIONS, ...options };
  const cleanMessages = Array.isArray(messages) ? messages.filter(message => message && typeof message.content === 'string') : [];
  const dialogueMessages = cleanMessages.filter(message => message.role !== 'system');
  const startIndex = indexAfterCompactedMessage(dialogueMessages, memoryState);
  const uncompactedMessages = dialogueMessages.slice(startIndex);
  const retainedMessages = takeRecentTurns(uncompactedMessages, config.keepRecentTurns);
  const candidateMessages = uncompactedMessages.slice(0, Math.max(0, uncompactedMessages.length - retainedMessages.length));
  const candidateCharCount = contentChars(candidateMessages);

  return {
    shouldCompact: candidateMessages.length >= config.minMessagesForCompaction || candidateCharCount >= config.minCharsForCompaction,
    candidateMessages,
    retainedMessages,
    lastCandidate: candidateMessages[candidateMessages.length - 1],
    candidateCharCount,
  };
};

export const buildConversationContextMessages = <T extends ConversationMemoryMessage>(
  messages: T[],
  options: ConversationContextOptions = {},
): T[] => {
  const config = { ...DEFAULT_CONTEXT_OPTIONS, ...options };
  const cleanMessages = Array.isArray(messages) ? messages.filter(message => message && typeof message.content === 'string') : [];
  const { systemMessages, dialogueMessages } = splitSystemAndDialogue(cleanMessages);
  const startIndex = indexAfterCompactedMessage(dialogueMessages, config.memoryState);
  const uncompactedMessages = dialogueMessages.slice(startIndex);
  const recentMessages = takeRecentTurns(uncompactedMessages, config.keepRecentTurns)
    .map(message => cloneWithContent(message, truncateText(message.content || '', config.maxRecentMessageChars)));
  const olderMessages = uncompactedMessages.slice(0, Math.max(0, uncompactedMessages.length - recentMessages.length));
  const structuredMemory = formatStructuredMemory(config.memoryState?.structured, config.maxStructuredMemoryChars);
  const summaryParts = [
    structuredMemory
      ? `## 结构化长期记忆\n${structuredMemory}`
      : '',
    config.memoryState?.summary
      ? `## 已持久化压缩记忆\n${truncateText(config.memoryState.summary, config.maxSummaryChars)}`
      : '',
    olderMessages.length > 0
      ? `## 尚未持久化的较早对话摘要\n${summarizeOlderMessages(olderMessages, config.maxSummaryChars)}`
      : '',
  ].filter(Boolean);
  const summary = truncateText(summaryParts.join('\n\n'), config.maxSummaryChars);

  const contextMessages: T[] = [...systemMessages];
  if (summary) {
    contextMessages.push({
      id: config.memoryMessageId,
      role: 'system',
      content: `${config.memoryTitle}\n\n${summary}`,
      timestamp: 0,
    } as T);
  }
  contextMessages.push(...recentMessages);

  while (contextMessages.length > 2 && contentChars(contextMessages) > config.maxContextChars) {
    const firstDroppableIndex = contextMessages.findIndex(message => message.role !== 'system');
    if (firstDroppableIndex < 0 || firstDroppableIndex >= contextMessages.length - 2) break;
    contextMessages.splice(firstDroppableIndex, 1);
  }

  return contextMessages;
};

export const trimConversationForStorage = <T extends ConversationMemoryMessage>(
  messages: T[],
  options: ConversationStorageOptions = {},
): T[] => {
  const config = { ...DEFAULT_STORAGE_OPTIONS, ...options };
  const trimmed = Array.isArray(messages)
    ? messages
        .filter(message => message && typeof message.content === 'string')
        .slice(-config.maxMessages)
        .map(message => cloneWithContent(message, truncateText(message.content || '', config.maxMessageChars)))
    : [];

  while (trimmed.length > 1 && contentChars(trimmed) > config.maxStoredChars) {
    const firstDroppableIndex = trimmed.findIndex(message => message.role !== 'system');
    if (firstDroppableIndex < 0) break;
    trimmed.splice(firstDroppableIndex, 1);
  }

  return trimmed;
};
