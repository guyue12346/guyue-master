import { loadLocalJson, saveUnifiedJson } from '../../utils/unifiedStorage';
import type { AgentPlanStep, AgentRunStatus, AgentTraceEvent } from './runtime/types';

export type AgentJobStatus = AgentRunStatus | 'cancelled';

export interface AgentJobRecord {
  id: string;
  runId: string;
  goal: string;
  provider?: string;
  model?: string;
  status: AgentJobStatus;
  stage?: AgentTraceEvent['stage'];
  title?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  cancelRequested?: boolean;
  plan: AgentPlanStep[];
  trace: AgentTraceEvent[];
  finalText?: string;
  error?: string;
  metadata?: Record<string, any>;
}

const STORAGE_KEY_AGENT_JOBS = 'guyue_agent_jobs_v1';
const STORE_KEY_AGENT_JOBS = 'agent-jobs';
const MAX_AGENT_JOBS = 80;
export const AGENT_JOBS_CHANGED_EVENT = 'guyue-agent-jobs-changed';

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeJobStatus = (value: unknown): AgentJobStatus => {
  const allowed = new Set<AgentJobStatus>([
    'idle',
    'planning',
    'executing',
    'verifying',
    'inspecting',
    'reflecting',
    'reporting',
    'completed',
    'failed',
    'needs_user',
    'cancelled',
  ]);
  return allowed.has(value as AgentJobStatus) ? value as AgentJobStatus : 'idle';
};

const normalizeJob = (value: any): AgentJobRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const id = typeof value.id === 'string' && value.id ? value.id : nowId('agent_job');
  const runId = typeof value.runId === 'string' && value.runId ? value.runId : id;
  const startedAt = Number(value.startedAt);
  const updatedAt = Number(value.updatedAt);
  return {
    id,
    runId,
    goal: typeof value.goal === 'string' ? value.goal : '',
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    status: normalizeJobStatus(value.status),
    stage: typeof value.stage === 'string' ? value.stage as AgentTraceEvent['stage'] : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    finishedAt: Number.isFinite(Number(value.finishedAt)) ? Number(value.finishedAt) : undefined,
    cancelRequested: Boolean(value.cancelRequested),
    plan: Array.isArray(value.plan) ? value.plan : [],
    trace: Array.isArray(value.trace) ? value.trace : [],
    finalText: typeof value.finalText === 'string' ? value.finalText : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
    metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : undefined,
  };
};

const storageOptions = {
  appDataKey: STORE_KEY_AGENT_JOBS,
  localStorageKey: STORAGE_KEY_AGENT_JOBS,
  defaultValue: () => [] as AgentJobRecord[],
  normalize: (value: any) => Array.isArray(value)
    ? value.map(normalizeJob).filter(Boolean) as AgentJobRecord[]
    : [],
};

const notifyJobsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AGENT_JOBS_CHANGED_EVENT));
  }
};

const loadJobs = () => loadLocalJson<AgentJobRecord[]>(storageOptions);

const saveJobs = (jobs: AgentJobRecord[]) => {
  const trimmed = jobs
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, MAX_AGENT_JOBS);
  saveUnifiedJson(storageOptions, trimmed);
  notifyJobsChanged();
};

export const loadAgentJobs = () => loadJobs();

export const getAgentJob = (jobId: string) =>
  loadJobs().find(job => job.id === jobId || job.runId === jobId);

export const createAgentJob = (input: {
  runId?: string;
  goal: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, any>;
}) => {
  const id = input.runId || nowId('agent_job');
  const job: AgentJobRecord = {
    id,
    runId: input.runId || id,
    goal: input.goal,
    provider: input.provider,
    model: input.model,
    status: 'idle',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    plan: [],
    trace: [],
    metadata: input.metadata,
  };
  saveJobs([job, ...loadJobs().filter(item => item.id !== id && item.runId !== job.runId)]);
  return job;
};

export const updateAgentJob = (
  jobId: string,
  updater: (job: AgentJobRecord) => AgentJobRecord,
) => {
  const jobs = loadJobs();
  const index = jobs.findIndex(job => job.id === jobId || job.runId === jobId);
  if (index < 0) return undefined;
  const current = jobs[index];
  const nextJob = {
    ...updater(current),
    updatedAt: Date.now(),
  };
  const next = [...jobs];
  next[index] = nextJob;
  saveJobs(next);
  return nextJob;
};

export const appendAgentJobTrace = (jobId: string, trace: AgentTraceEvent) =>
  updateAgentJob(jobId, job => ({
    ...job,
    status: trace.stage === 'error'
      ? 'failed'
      : trace.status === 'waiting'
        ? 'needs_user'
        : job.status,
    stage: trace.stage,
    title: trace.title,
    trace: [...job.trace, trace],
    plan: Array.isArray(trace.payload?.plan) ? trace.payload?.plan as AgentPlanStep[] : job.plan,
  }));

export const finalizeAgentJob = (
  jobId: string,
  patch: {
    status: AgentJobStatus;
    finalText?: string;
    error?: string;
    plan?: AgentPlanStep[];
  },
) => updateAgentJob(jobId, job => ({
  ...job,
  ...patch,
  finishedAt: Date.now(),
}));

export const requestCancelAgentJob = (jobId: string) =>
  updateAgentJob(jobId, job => ({
    ...job,
    cancelRequested: true,
    status: job.status === 'completed' || job.status === 'failed' ? job.status : 'cancelled',
    finishedAt: job.finishedAt || Date.now(),
  }));

export const isAgentJobCancellationRequested = (jobId: string) =>
  Boolean(getAgentJob(jobId)?.cancelRequested);

