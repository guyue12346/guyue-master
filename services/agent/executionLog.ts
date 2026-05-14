import { loadLocalJson, saveUnifiedJson } from '../../utils/unifiedStorage';
import type { AgentTraceEvent } from './runtime/types';

const STORAGE_KEY_AGENT_EXECUTION_LOGS = 'guyue_agent_execution_logs_v1';
const STORE_KEY_AGENT_EXECUTION_LOGS = 'agent-execution-logs';
const MAX_AGENT_LOGS = 80;

export interface AgentExecutionLogEntry {
  id: string;
  timestamp: number;
  stage: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  payload?: Record<string, any>;
}

export interface AgentToolTransactionLog {
  id: string;
  toolName: string;
  args: Record<string, any>;
  status: 'pending' | 'success' | 'failed' | 'waiting_approval' | 'undone';
  startedAt: number;
  finishedAt?: number;
  result?: any;
  error?: string;
  snapshot?: Record<string, any>;
  confirmationId?: string;
}

export interface AgentExecutionLog {
  id: string;
  goal: string;
  provider: string;
  model: string;
  selectedModule?: string | null;
  status: 'running' | 'completed' | 'failed' | 'needs_user' | 'aborted';
  startedAt: number;
  finishedAt?: number;
  entries: AgentExecutionLogEntry[];
  traces: AgentTraceEvent[];
  transactions: AgentToolTransactionLog[];
  finalText?: string;
  error?: string;
}

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const storageOptions = {
  appDataKey: STORE_KEY_AGENT_EXECUTION_LOGS,
  localStorageKey: STORAGE_KEY_AGENT_EXECUTION_LOGS,
  defaultValue: () => [] as AgentExecutionLog[],
};

const loadLogs = (): AgentExecutionLog[] =>
  loadLocalJson<AgentExecutionLog[]>(storageOptions).filter(Boolean);

const saveLogs = (logs: AgentExecutionLog[]) => {
  const trimmed = logs
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_AGENT_LOGS);
  saveUnifiedJson(storageOptions, trimmed);
};

export const loadAgentExecutionLogs = () => loadLogs();

export const clearAgentExecutionLogs = () => saveLogs([]);

export const createAgentExecutionLog = (input: {
  goal: string;
  provider: string;
  model: string;
  selectedModule?: string | null;
}) => {
  const log: AgentExecutionLog = {
    id: nowId('agent_run'),
    goal: input.goal,
    provider: input.provider,
    model: input.model,
    selectedModule: input.selectedModule,
    status: 'running',
    startedAt: Date.now(),
    entries: [],
    traces: [],
    transactions: [],
  };
  saveLogs([log, ...loadLogs()]);
  return log.id;
};

export const updateAgentExecutionLog = (
  runId: string,
  updater: (log: AgentExecutionLog) => AgentExecutionLog,
) => {
  const logs = loadLogs();
  const index = logs.findIndex(log => log.id === runId);
  if (index < 0) return;
  const next = [...logs];
  next[index] = updater(next[index]);
  saveLogs(next);
};

export const appendAgentExecutionEntry = (
  runId: string,
  entry: Omit<AgentExecutionLogEntry, 'id' | 'timestamp'>,
) => updateAgentExecutionLog(runId, log => ({
  ...log,
  entries: [
    ...log.entries,
    { id: nowId('entry'), timestamp: Date.now(), ...entry },
  ],
}));

export const appendAgentExecutionTrace = (runId: string, trace: AgentTraceEvent) =>
  updateAgentExecutionLog(runId, log => ({ ...log, traces: [...log.traces, trace] }));

export const startAgentToolTransaction = (
  runId: string,
  toolName: string,
  args: Record<string, any>,
) => {
  const tx: AgentToolTransactionLog = {
    id: nowId('tx'),
    toolName,
    args,
    status: 'pending',
    startedAt: Date.now(),
  };
  updateAgentExecutionLog(runId, log => ({ ...log, transactions: [...log.transactions, tx] }));
  return tx.id;
};

export const finishAgentToolTransaction = (
  runId: string,
  transactionId: string,
  patch: Partial<Omit<AgentToolTransactionLog, 'id' | 'toolName' | 'args' | 'startedAt'>>,
) => updateAgentExecutionLog(runId, log => ({
  ...log,
  transactions: log.transactions.map(tx => (
    tx.id === transactionId
      ? { ...tx, ...patch, finishedAt: patch.finishedAt || Date.now() }
      : tx
  )),
}));

export const finalizeAgentExecutionLog = (
  runId: string,
  patch: Pick<Partial<AgentExecutionLog>, 'status' | 'finalText' | 'error'>,
) => updateAgentExecutionLog(runId, log => ({
  ...log,
  ...patch,
  finishedAt: Date.now(),
}));
