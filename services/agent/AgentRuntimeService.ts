import type {
  ChatDebugEvent,
  ChatMessage,
  ChatService,
  ChatTool,
  ChatToolCall,
} from '../chatService';
import {
  createAgentRuntime,
  type AgentClarificationResult,
  type AgentCompletionEvaluation,
  type AgentTraceEvent,
  type FunctionCallingAgentRuntimeResult,
} from './runtime';
import {
  appendAgentJobTrace,
  createAgentJob,
  finalizeAgentJob,
  getAgentJob,
  isAgentJobCancellationRequested,
  loadAgentJobs,
  requestCancelAgentJob,
  type AgentJobRecord,
} from './jobs';
import type { AgentMention } from './agentMentions';

export interface AgentRuntimeServiceRunInput {
  chatService: ChatService;
  messages: ChatMessage[];
  tools: ChatTool[];
  goal: string;
  runId: string;
  maxIterations?: number;
  mentions?: AgentMention[];
  clarify: () => Promise<AgentClarificationResult> | AgentClarificationResult;
  executeToolCall: (toolCall: ChatToolCall) => Promise<any>;
  getToolRisk: (toolCall: ChatToolCall) => 'read' | 'write';
  evaluateCompletion?: (input: {
    goal: string;
    finalText: string;
    toolCalls: ChatToolCall[];
    toolResults: Array<{ toolCall: ChatToolCall; result: any }>;
  }) => Promise<AgentCompletionEvaluation>;
  onTrace?: (event: AgentTraceEvent) => void;
  onDebugEvent?: (event: ChatDebugEvent) => void;
  onJobUpdate?: (job: AgentJobRecord) => void;
}

export class AgentRuntimeService {
  private activeRuns = new Set<string>();

  cancel(jobId: string) {
    requestCancelAgentJob(jobId);
  }

  getJob(jobId: string) {
    return getAgentJob(jobId);
  }

  listJobs() {
    return loadAgentJobs();
  }

  async runNativeToolTask(input: AgentRuntimeServiceRunInput): Promise<FunctionCallingAgentRuntimeResult> {
    const job = createAgentJob({
      runId: input.runId,
      goal: input.goal,
      provider: input.chatService.getConfig?.().provider,
      model: input.chatService.getConfig?.().model,
      metadata: {
        toolCount: input.tools.length,
        maxIterations: input.maxIterations ?? 10,
        mentionCount: input.mentions?.length || 0,
      },
    });
    this.activeRuns.add(job.runId);
    input.onJobUpdate?.(job);

    const emitJobTrace = (event: AgentTraceEvent) => {
      const updated = appendAgentJobTrace(job.id, event);
      if (updated) input.onJobUpdate?.(updated);
      input.onTrace?.(event);
    };

    const runtime = createAgentRuntime({
      chatService: input.chatService,
      messages: input.messages,
      tools: input.tools,
      goal: input.goal,
      runId: job.runId,
      maxIterations: input.maxIterations ?? 10,
      mentions: input.mentions,
      clarify: input.clarify,
      executeToolCall: async toolCall => {
        if (isAgentJobCancellationRequested(job.id)) {
          throw new Error('Agent 任务已取消。');
        }
        return input.executeToolCall(toolCall);
      },
      getToolRisk: input.getToolRisk,
      evaluateCompletion: input.evaluateCompletion,
      shouldCancel: () => isAgentJobCancellationRequested(job.id),
      onTrace: emitJobTrace,
      onDebugEvent: input.onDebugEvent,
    });
    try {
      const result = await runtime.run();
      const cancelled = isAgentJobCancellationRequested(job.id);
      const updated = finalizeAgentJob(job.id, {
        status: cancelled ? 'cancelled' : result.status,
        finalText: result.text,
        error: result.error,
      });
      if (updated) input.onJobUpdate?.(updated);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = isAgentJobCancellationRequested(job.id);
      const updated = finalizeAgentJob(job.id, {
        status: cancelled ? 'cancelled' : 'failed',
        error: message,
      });
      if (updated) input.onJobUpdate?.(updated);
      throw error;
    } finally {
      this.activeRuns.delete(job.runId);
    }
  }
}

export const agentRuntimeService = new AgentRuntimeService();
