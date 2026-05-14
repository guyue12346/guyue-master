import { Annotation, END, GraphRecursionError, START, StateGraph } from '@langchain/langgraph';
import type {
  ChatDebugEvent,
  ChatMessage,
  ChatService,
  ChatTool,
  ChatToolCall,
  ChatToolDecisionResult,
  ChatToolExecutionResult,
  ChatToolSessionState,
} from '../../chatService';
import type {
  AgentCompletionEvaluation,
  AgentRunStatus,
  AgentTraceEvent,
} from './types';

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface NativeToolsAgentRuntimeState {
  runId: string;
  goal: string;
  status: AgentRunStatus;
  messages: ChatMessage[];
  tools: ChatTool[];
  session?: ChatToolSessionState;
  decision?: ChatToolDecisionResult;
  pendingToolCalls: ChatToolCall[];
  toolResults: ChatToolExecutionResult[];
  allToolCalls: ChatToolCall[];
  finalText: string;
  trace: AgentTraceEvent[];
  error?: string;
  maxIterations: number;
}

export interface NativeToolsAgentRuntimeOptions {
  chatService: ChatService;
  messages: ChatMessage[];
  tools: ChatTool[];
  goal: string;
  runId?: string;
  maxIterations?: number;
  executeToolCall: (toolCall: ChatToolCall) => Promise<any>;
  evaluateCompletion?: (input: {
    goal: string;
    finalText: string;
    toolCalls: ChatToolCall[];
    toolResults: ChatToolExecutionResult[];
  }) => Promise<AgentCompletionEvaluation>;
  onTrace?: (event: AgentTraceEvent) => void;
  onDebugEvent?: (event: ChatDebugEvent) => void;
}

export interface NativeToolsAgentRuntimeResult {
  runId: string;
  status: AgentRunStatus;
  text: string;
  toolCalls: ChatToolCall[];
  toolResults: ChatToolExecutionResult[];
  trace: AgentTraceEvent[];
  error?: string;
}

const NativeToolsAgentRuntimeAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  status: Annotation<AgentRunStatus>(),
  messages: Annotation<ChatMessage[]>(),
  tools: Annotation<ChatTool[]>(),
  session: Annotation<ChatToolSessionState | undefined>(),
  decision: Annotation<ChatToolDecisionResult | undefined>(),
  pendingToolCalls: Annotation<ChatToolCall[]>(),
  toolResults: Annotation<ChatToolExecutionResult[]>(),
  allToolCalls: Annotation<ChatToolCall[]>(),
  finalText: Annotation<string>(),
  trace: Annotation<AgentTraceEvent[]>(),
  error: Annotation<string | undefined>(),
  maxIterations: Annotation<number>(),
});

type GraphState = typeof NativeToolsAgentRuntimeAnnotation.State;

const createTrace = (
  state: NativeToolsAgentRuntimeState,
  event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
): AgentTraceEvent => ({
  id: nowId('trace'),
  runId: state.runId,
  timestamp: Date.now(),
  ...event,
});

const createInitialState = (options: NativeToolsAgentRuntimeOptions): GraphState => ({
  runId: options.runId || nowId('run'),
  goal: options.goal,
  status: 'idle',
  messages: options.messages,
  tools: options.tools,
  session: undefined,
  decision: undefined,
  pendingToolCalls: [],
  toolResults: [],
  allToolCalls: [],
  finalText: '',
  trace: [],
  error: undefined,
  maxIterations: options.maxIterations ?? 10,
});

export const createNativeToolsAgentRuntime = (options: NativeToolsAgentRuntimeOptions) => {
  const withTrace = (
    state: NativeToolsAgentRuntimeState,
    event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
  ) => {
    const trace = createTrace(state, event);
    options.onTrace?.(trace);
    return trace;
  };

  const planningNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'planning',
      title: '创建原生工具会话',
      detail: runtimeState.goal,
      status: 'started',
    });

    try {
      const session = options.chatService.createOpenAIToolSession(
        runtimeState.messages,
        runtimeState.maxIterations,
      );
      const traceDone = withTrace(runtimeState, {
        stage: 'planning',
        title: '原生工具会话已创建',
        status: 'success',
        payload: {
          toolCount: runtimeState.tools.length,
          maxIterations: runtimeState.maxIterations,
        },
      });
      return {
        status: 'executing' as AgentRunStatus,
        session,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '创建原生工具会话失败',
        detail: message,
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const decisionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'decision',
      title: `模型决策第 ${(runtimeState.session?.iteration ?? 0) + 1} 轮`,
      status: 'started',
      payload: {
        priorToolCalls: runtimeState.allToolCalls.length,
      },
    });

    if (!runtimeState.session) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少原生工具会话',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少原生工具会话。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    try {
      const decision = await options.chatService.requestOpenAIToolDecision(
        runtimeState.session,
        runtimeState.tools,
        { onDebugEvent: options.onDebugEvent },
      );

      const traceDone = withTrace(runtimeState, {
        stage: 'decision',
        title: decision.toolCalls.length
          ? `模型选择 ${decision.toolCalls.length} 个工具`
          : '模型没有继续调用工具',
        detail: decision.toolCalls.map(toolCall => toolCall.name).join('、') || undefined,
        status: 'success',
        payload: {
          text: decision.text,
          toolCalls: decision.toolCalls,
        },
      });

      if (decision.toolCalls.length === 0) {
        return {
          status: 'inspecting' as AgentRunStatus,
          decision,
          finalText: decision.text,
          pendingToolCalls: [],
          trace: [...runtimeState.trace, traceStart, traceDone],
        };
      }

      return {
        status: 'executing' as AgentRunStatus,
        decision,
        pendingToolCalls: decision.toolCalls,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '模型工具决策失败',
        detail: message,
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const executionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'execution',
      title: `执行 ${runtimeState.pendingToolCalls.length} 个工具调用`,
      detail: runtimeState.pendingToolCalls.map(toolCall => toolCall.name).join('、'),
      status: 'started',
      payload: { toolCalls: runtimeState.pendingToolCalls },
    });

    if (!runtimeState.session || !runtimeState.decision) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少工具执行上下文',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少工具执行上下文。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    try {
      const toolResults = await Promise.all(
        runtimeState.pendingToolCalls.map(async toolCall => ({
          toolCall,
          result: await options.executeToolCall(toolCall),
        })),
      );
      const nextSession = options.chatService.appendOpenAIToolResults(
        runtimeState.session,
        runtimeState.decision,
        toolResults,
      );
      const traceDone = withTrace(runtimeState, {
        stage: 'execution',
        title: '工具执行完成',
        status: 'success',
        payload: { toolResults },
      });

      return {
        status: 'verifying' as AgentRunStatus,
        session: nextSession,
        pendingToolCalls: [],
        toolResults: [...runtimeState.toolResults, ...toolResults],
        allToolCalls: nextSession.allToolCalls,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '工具执行失败',
        detail: message,
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: message,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }
  };

  const verificationNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const latestDecision = runtimeState.decision;
    const latestToolCount = latestDecision?.toolCalls.length || 0;
    const latestResults = runtimeState.toolResults.slice(-latestToolCount);
    const traceStart = withTrace(runtimeState, {
      stage: 'verification',
      title: '检查工具执行结果',
      status: 'started',
      payload: { latestToolCount, latestResults },
    });

    if (!latestDecision || latestToolCount === 0) {
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '缺少待检查工具调用',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '缺少待检查工具调用。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const missing = latestDecision.toolCalls.find(toolCall =>
      !latestResults.some(result => result.toolCall.id === toolCall.id),
    );
    if (missing) {
      const traceError = withTrace(runtimeState, {
        stage: 'verification',
        title: `工具结果缺失：${missing.name}`,
        status: 'error',
        payload: { missing },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: `工具结果缺失：${missing.name}`,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const failedResult = latestResults.find(item => item.result?.success === false && item.result?.fatal === true);
    if (failedResult) {
      const traceError = withTrace(runtimeState, {
        stage: 'verification',
        title: `工具结果不可恢复：${failedResult.toolCall.name}`,
        detail: failedResult.result?.error,
        status: 'error',
        payload: failedResult,
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: failedResult.result?.error || `工具 ${failedResult.toolCall.name} 执行失败。`,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    const traceDone = withTrace(runtimeState, {
      stage: 'verification',
      title: '工具结果已回填给模型',
      detail: '允许模型基于工具结果继续决策或生成最终回复。',
      status: 'success',
    });

    return {
      status: 'executing' as AgentRunStatus,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const inspectionNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const failedResults = runtimeState.toolResults.filter(item => item.result?.success === false);
    const successfulResults = runtimeState.toolResults.filter(item => item.result?.success !== false);
    const traceStart = withTrace(runtimeState, {
      stage: 'inspection',
      title: '检查最终完成度',
      status: 'started',
      payload: {
        finalText: runtimeState.finalText,
        toolCalls: runtimeState.allToolCalls,
        failedResults,
      },
    });

    if (runtimeState.pendingToolCalls.length > 0) {
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '仍有未执行工具调用',
        status: 'error',
        payload: { pendingToolCalls: runtimeState.pendingToolCalls },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: 'Agent 结束前仍有未执行工具调用。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    if (failedResults.length > 0 && successfulResults.length === 0) {
      const firstError = failedResults[0]?.result?.error || '工具调用失败，且没有成功结果。';
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '工具调用未真正完成',
        detail: firstError,
        status: 'error',
        payload: { failedResults },
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: firstError,
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    if (!runtimeState.finalText.trim()) {
      const traceError = withTrace(runtimeState, {
        stage: 'inspection',
        title: '缺少最终回复',
        status: 'error',
      });
      return {
        status: 'failed' as AgentRunStatus,
        error: '模型没有生成最终回复。',
        trace: [...runtimeState.trace, traceStart, traceError],
      };
    }

    if (options.evaluateCompletion) {
      try {
        const evaluation = await options.evaluateCompletion({
          goal: runtimeState.goal,
          finalText: runtimeState.finalText,
          toolCalls: runtimeState.allToolCalls,
          toolResults: runtimeState.toolResults,
        });
        const passed = evaluation.status === 'success';
        const traceEvaluation = withTrace(runtimeState, {
          stage: 'inspection',
          title: passed ? '模型复核通过' : '模型复核未通过',
          detail: evaluation.message,
          status: passed ? 'success' : evaluation.status === 'needs_user' ? 'waiting' : 'error',
          payload: evaluation as any,
        });
        if (!passed) {
          return {
            status: evaluation.status === 'needs_user' ? 'needs_user' as AgentRunStatus : 'failed' as AgentRunStatus,
            error: evaluation.status === 'failed' ? evaluation.message : runtimeState.error,
            trace: [...runtimeState.trace, traceStart, traceEvaluation],
          };
        }
        return {
          status: 'reporting' as AgentRunStatus,
          trace: [...runtimeState.trace, traceStart, traceEvaluation],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const traceEvaluationError = withTrace(runtimeState, {
          stage: 'inspection',
          title: '模型复核不可用，使用确定性检查结果',
          detail: message,
          status: 'skipped',
        });
        return {
          status: 'reporting' as AgentRunStatus,
          trace: [...runtimeState.trace, traceStart, traceEvaluationError],
        };
      }
    }

    const traceDone = withTrace(runtimeState, {
      stage: 'inspection',
      title: failedResults.length > 0 ? '完成度检查通过，但存在部分工具失败' : '完成度检查通过',
      detail: failedResults.length > 0 ? `有 ${failedResults.length} 次工具调用失败，模型已基于结果继续处理。` : undefined,
      status: 'success',
      payload: { failedCount: failedResults.length },
    });

    return {
      status: 'reporting' as AgentRunStatus,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const reportingNode = async (state: GraphState) => {
    const runtimeState = state as NativeToolsAgentRuntimeState;
    const finalStatus: AgentRunStatus = runtimeState.status === 'needs_user'
      ? 'needs_user'
      : runtimeState.error ? 'failed' : 'completed';
    const text = runtimeState.error
      ? `执行失败：${runtimeState.error}`
      : finalStatus === 'needs_user'
        ? '需要用户补充信息或确认后继续。'
      : runtimeState.finalText;
    const traceDone = withTrace(runtimeState, {
      stage: 'reporting',
      title: finalStatus === 'completed' ? '生成最终回复' : '生成失败汇报',
      status: finalStatus === 'completed' ? 'success' : 'error',
      payload: {
        text,
        toolCalls: runtimeState.allToolCalls,
      },
    });

    return {
      status: finalStatus,
      finalText: text,
      trace: [...runtimeState.trace, traceDone],
    };
  };

  const mergeState = (
    state: GraphState,
    patch: Partial<GraphState>,
  ): GraphState => ({
    ...state,
    ...patch,
  });

  const routeAfterPlanning = (state: GraphState) =>
    state.status === 'failed' ? 'reporting' : 'decision';

  const routeAfterDecision = (state: GraphState) => {
    if (state.status === 'failed') return 'reporting';
    if (state.status === 'inspecting') return 'inspection';
    return state.pendingToolCalls.length > 0 ? 'execution' : 'reporting';
  };

  const routeAfterExecution = (state: GraphState) =>
    state.status === 'failed' ? 'reporting' : 'verification';

  const routeAfterVerification = (state: GraphState) =>
    state.status === 'failed' ? 'reporting' : 'decision';

  const routeAfterInspection = (state: GraphState) =>
    state.status === 'failed' || state.status === 'needs_user' ? 'reporting' : 'reporting';

  const runtimeGraph = new StateGraph(NativeToolsAgentRuntimeAnnotation)
    .addNode('planning', planningNode)
    .addNode('decision', decisionNode)
    .addNode('execution', executionNode)
    .addNode('verification', verificationNode)
    .addNode('inspection', inspectionNode)
    .addNode('reporting', reportingNode)
    .addEdge(START, 'planning')
    .addConditionalEdges('planning', routeAfterPlanning)
    .addConditionalEdges('decision', routeAfterDecision)
    .addConditionalEdges('execution', routeAfterExecution)
    .addConditionalEdges('verification', routeAfterVerification)
    .addConditionalEdges('inspection', routeAfterInspection)
    .addEdge('reporting', END)
    .compile({ name: 'guyue-agent-runtime' });

  return {
    async run(): Promise<NativeToolsAgentRuntimeResult> {
      let state = createInitialState(options);
      const recursionLimit = Math.max(25, (options.maxIterations ?? 10) * 4 + 10);

      try {
        state = await runtimeGraph.invoke(state, { recursionLimit });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = error instanceof GraphRecursionError
          ? 'Agent 原生工具循环超过最大步数。'
          : rawMessage;
        const traceError = withTrace(state, {
          stage: 'error',
          title: 'Agent 原生工具运行失败',
          detail: rawMessage,
          status: 'error',
        });
        const failedState = mergeState(state, {
          status: 'failed',
          error: message,
          trace: [...state.trace, traceError],
        });

        try {
          state = mergeState(failedState, await reportingNode(failedState));
        } catch (reportError) {
          const reportMessage = reportError instanceof Error ? reportError.message : String(reportError);
          const traceReportError = withTrace(failedState, {
            stage: 'error',
            title: '生成最终回复失败',
            detail: reportMessage,
            status: 'error',
          });
          state = mergeState(failedState, {
            finalText: `执行失败：${reportMessage}`,
            trace: [...failedState.trace, traceReportError],
          });
        }
      }

      return {
        runId: state.runId,
        status: state.status,
        text: state.finalText,
        toolCalls: state.allToolCalls,
        toolResults: state.toolResults,
        trace: state.trace,
        error: state.error,
      };
    },
  };
};

export const createAgentRuntime = createNativeToolsAgentRuntime;
export type AgentRuntimeOptions = NativeToolsAgentRuntimeOptions;
export type FunctionCallingAgentRuntimeResult = NativeToolsAgentRuntimeResult;
