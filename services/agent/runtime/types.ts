import type { ToolExecutionContext, ToolRegistration } from '../toolRegistry';

export type AgentRunStatus =
  | 'idle'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'inspecting'
  | 'reflecting'
  | 'reporting'
  | 'completed'
  | 'failed'
  | 'needs_user';

export type AgentTraceStage =
  | 'clarification'
  | 'tool_search'
  | 'load_skill'
  | 'mcp_read_resource'
  | 'planning'
  | 'decision'
  | 'execution'
  | 'verification'
  | 'inspection'
  | 'reflection'
  | 'reporting'
  | 'approval'
  | 'error';

export interface AgentTraceEvent {
  id: string;
  runId: string;
  stage: AgentTraceStage;
  title: string;
  detail?: string;
  status: 'started' | 'success' | 'error' | 'skipped' | 'waiting';
  payload?: Record<string, any>;
  timestamp: number;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  description?: string;
  toolName?: string;
  args?: Record<string, any>;
  verification?: string;
  risk?: 'low' | 'medium' | 'high';
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting_approval';
}

export interface AgentToolObservation {
  stepId: string;
  toolName?: string;
  success: boolean;
  result?: any;
  error?: string;
  requiresApproval?: boolean;
  approvalMessage?: string;
  timestamp: number;
}

export interface AgentCompletionEvaluation {
  status: 'success' | 'failed' | 'needs_user';
  message: string;
  confidence?: number;
  missing?: string[];
  retryable?: boolean;
}

export interface AgentClarificationResult {
  status: 'ready' | 'needs_user';
  message?: string;
  questions?: string[];
  missing?: string[];
  confidence?: number;
  payload?: Record<string, any>;
}

export interface AgentRuntimeInput {
  goal: string;
  runId?: string;
  initialPlan?: AgentPlanStep[];
  context?: Record<string, any>;
  maxIterations?: number;
}

export interface AgentRuntimeState {
  runId: string;
  goal: string;
  status: AgentRunStatus;
  context: Record<string, any>;
  plan: AgentPlanStep[];
  currentStepIndex: number;
  observations: AgentToolObservation[];
  trace: AgentTraceEvent[];
  report: string;
  error?: string;
  iteration: number;
  maxIterations: number;
  pendingApproval?: {
    stepId: string;
    message: string;
    payload?: Record<string, any>;
  };
}

export interface AgentRuntimeResult {
  runId: string;
  status: AgentRunStatus;
  goal: string;
  plan: AgentPlanStep[];
  observations: AgentToolObservation[];
  trace: AgentTraceEvent[];
  report: string;
  error?: string;
  pendingApproval?: AgentRuntimeState['pendingApproval'];
}

export interface AgentPlanner {
  plan(input: AgentRuntimeInput, state: AgentRuntimeState): Promise<AgentPlanStep[]>;
}

export interface AgentToolExecutor {
  execute(step: AgentPlanStep, state: AgentRuntimeState): Promise<AgentToolObservation>;
}

export interface AgentVerifier {
  verify(state: AgentRuntimeState): Promise<{
    status: 'success' | 'failed' | 'needs_user';
    message: string;
    retryable?: boolean;
  }>;
}

export interface AgentInspector {
  inspect(state: AgentRuntimeState): Promise<{
    status: 'success' | 'failed' | 'needs_user';
    message: string;
    retryable?: boolean;
  }>;
}

export interface AgentReflector {
  reflect(state: AgentRuntimeState): Promise<{
    plan?: AgentPlanStep[];
    message: string;
  }>;
}

export interface AgentReporter {
  report(state: AgentRuntimeState): Promise<string>;
}

export interface AgentRuntimeHost {
  planner: AgentPlanner;
  tools: AgentToolExecutor;
  verifier?: AgentVerifier;
  inspector?: AgentInspector;
  reflector?: AgentReflector;
  reporter?: AgentReporter;
  onTrace?: (event: AgentTraceEvent) => void;
}

export interface ToolRegistryExecutorOptions {
  registry: ToolRegistration[];
  context: ToolExecutionContext;
  executeWebSearch?: (args: Record<string, any>) => Promise<any>;
  executeWebOpen?: (args: Record<string, any>) => Promise<any>;
  executeSpecializedSearch?: (args: Record<string, any>) => Promise<any>;
}
