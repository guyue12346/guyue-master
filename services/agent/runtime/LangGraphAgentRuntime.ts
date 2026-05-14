import { Annotation, END, GraphRecursionError, START, StateGraph } from '@langchain/langgraph';
import {
  createStaticPlanner,
  defaultInspector,
  defaultReflector,
  defaultReporter,
  defaultVerifier,
} from './defaults';
import type {
  AgentPlanStep,
  AgentRunStatus,
  AgentRuntimeHost,
  AgentRuntimeInput,
  AgentRuntimeResult,
  AgentRuntimeState,
  AgentToolObservation,
  AgentTraceEvent,
} from './types';

const nowId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createTrace = (
  state: AgentRuntimeState,
  event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
): AgentTraceEvent => ({
  id: nowId('trace'),
  runId: state.runId,
  timestamp: Date.now(),
  ...event,
});

const updateStep = (
  plan: AgentPlanStep[],
  stepId: string,
  updates: Partial<AgentPlanStep>,
) => plan.map(step => step.id === stepId ? { ...step, ...updates } : step);

const nextExecutableStepIndex = (plan: AgentPlanStep[], startIndex: number) =>
  plan.findIndex((step, index) =>
    index >= startIndex &&
    step.status !== 'success' &&
    step.status !== 'skipped' &&
    step.status !== 'waiting_approval'
  );

const AgentRuntimeGraphAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  goal: Annotation<string>(),
  status: Annotation<AgentRunStatus>(),
  context: Annotation<Record<string, any>>(),
  plan: Annotation<AgentPlanStep[]>(),
  currentStepIndex: Annotation<number>(),
  observations: Annotation<AgentToolObservation[]>(),
  trace: Annotation<AgentTraceEvent[]>(),
  report: Annotation<string>(),
  error: Annotation<string | undefined>(),
  iteration: Annotation<number>(),
  maxIterations: Annotation<number>(),
  pendingApproval: Annotation<AgentRuntimeState['pendingApproval'] | undefined>(),
});

type GraphState = typeof AgentRuntimeGraphAnnotation.State;

const createInitialState = (input: AgentRuntimeInput): GraphState => ({
  runId: input.runId || nowId('run'),
  goal: input.goal,
  status: 'idle',
  context: input.context || {},
  plan: input.initialPlan || [],
  currentStepIndex: 0,
  observations: [],
  trace: [],
  report: '',
  error: undefined,
  iteration: 0,
  maxIterations: input.maxIterations ?? 1,
  pendingApproval: undefined,
});

export const createLangGraphAgentRuntime = (host: AgentRuntimeHost) => {
  const planner = host.planner || createStaticPlanner();
  const verifier = host.verifier || defaultVerifier;
  const inspector = host.inspector || defaultInspector;
  const reflector = host.reflector || defaultReflector;
  const reporter = host.reporter || defaultReporter;

  const withTrace = (
    state: AgentRuntimeState,
    event: Omit<AgentTraceEvent, 'id' | 'runId' | 'timestamp'>,
  ) => {
    const trace = createTrace(state, event);
    host.onTrace?.(trace);
    return trace;
  };

  const planningNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'planning',
      title: '生成执行计划',
      detail: runtimeState.goal,
      status: 'started',
    });

    try {
      const plan = await planner.plan(
        {
          goal: runtimeState.goal,
          runId: runtimeState.runId,
          initialPlan: runtimeState.plan,
          context: runtimeState.context,
          maxIterations: runtimeState.maxIterations,
        },
        runtimeState,
      );
      const normalizedPlan = plan.map((step, index) => ({
        ...step,
        id: step.id || `step_${index + 1}`,
        status: step.status || 'pending',
      }));
      const traceDone = withTrace(runtimeState, {
        stage: 'planning',
        title: `计划生成完成：${normalizedPlan.length} 个步骤`,
        status: 'success',
        payload: { plan: normalizedPlan },
      });
      return {
        status: 'executing' as AgentRunStatus,
        plan: normalizedPlan,
        currentStepIndex: 0,
        trace: [...runtimeState.trace, traceStart, traceDone],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const traceError = withTrace(runtimeState, {
        stage: 'error',
        title: '计划生成失败',
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

  const executingNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const index = nextExecutableStepIndex(runtimeState.plan, runtimeState.currentStepIndex);

    if (index < 0) {
      return { status: 'verifying' as AgentRunStatus };
    }

    const step = runtimeState.plan[index];
    const traceStart = withTrace(runtimeState, {
      stage: 'execution',
      title: `执行：${step.title}`,
      detail: step.toolName ? `工具：${step.toolName}` : '无工具步骤',
      status: 'started',
      payload: { step },
    });

    const runningPlan = updateStep(runtimeState.plan, step.id, { status: 'running' });

    const observation = await host.tools.execute(step, {
      ...runtimeState,
      plan: runningPlan,
      status: 'executing',
    });

    if (observation.requiresApproval) {
      const traceWaiting = withTrace(runtimeState, {
        stage: 'approval',
        title: `等待用户确认：${step.title}`,
        detail: observation.approvalMessage || '该步骤需要确认后继续。',
        status: 'waiting',
        payload: { observation },
      });
      return {
        status: 'needs_user' as AgentRunStatus,
        plan: updateStep(runningPlan, step.id, { status: 'waiting_approval' }),
        observations: [...runtimeState.observations, observation],
        pendingApproval: {
          stepId: step.id,
          message: observation.approvalMessage || `步骤「${step.title}」需要用户确认。`,
          payload: { step, observation },
        },
        trace: [...runtimeState.trace, traceStart, traceWaiting],
      };
    }

    const traceDone = withTrace(runtimeState, {
      stage: 'execution',
      title: observation.success ? `执行成功：${step.title}` : `执行失败：${step.title}`,
      detail: observation.error,
      status: observation.success ? 'success' : 'error',
      payload: { observation },
    });

    return {
      status: observation.success ? 'executing' as AgentRunStatus : 'verifying' as AgentRunStatus,
      plan: updateStep(runningPlan, step.id, { status: observation.success ? 'success' : 'failed' }),
      observations: [...runtimeState.observations, observation],
      currentStepIndex: index + 1,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const verifyingNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'verification',
      title: '检查执行结果',
      status: 'started',
    });

    const result = await verifier.verify({
      ...runtimeState,
      status: 'verifying',
    });

    const nextStatus: AgentRunStatus = result.status === 'success'
      ? 'inspecting'
      : result.status === 'needs_user'
        ? 'needs_user'
        : (result.retryable ? 'reflecting' : 'reporting');

    const traceDone = withTrace(runtimeState, {
      stage: 'verification',
      title: result.status === 'success' ? '验证通过' : '验证未通过',
      detail: result.message,
      status: result.status === 'success' ? 'success' : result.status === 'needs_user' ? 'waiting' : 'error',
      payload: result,
    });

    return {
      status: nextStatus,
      error: result.status === 'failed' && !result.retryable ? result.message : runtimeState.error,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const inspectingNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'inspection',
      title: '审查任务完成度',
      status: 'started',
    });

    const result = await inspector.inspect({
      ...runtimeState,
      status: 'inspecting',
    });

    const nextStatus: AgentRunStatus = result.status === 'success'
      ? 'reporting'
      : result.status === 'needs_user'
        ? 'needs_user'
        : (result.retryable ? 'reflecting' : 'reporting');

    const traceDone = withTrace(runtimeState, {
      stage: 'inspection',
      title: result.status === 'success' ? '完成度检查通过' : '完成度检查未通过',
      detail: result.message,
      status: result.status === 'success' ? 'success' : result.status === 'needs_user' ? 'waiting' : 'error',
      payload: result,
    });

    return {
      status: nextStatus,
      error: result.status === 'failed' && !result.retryable ? result.message : runtimeState.error,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const reflectingNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const traceStart = withTrace(runtimeState, {
      stage: 'reflection',
      title: '反思失败并准备重试',
      status: 'started',
    });

    const result = await reflector.reflect(runtimeState);
    const nextPlan = result.plan || runtimeState.plan;
    const traceDone = withTrace(runtimeState, {
      stage: 'reflection',
      title: '反思完成',
      detail: result.message,
      status: 'success',
      payload: { plan: nextPlan },
    });

    return {
      status: 'executing' as AgentRunStatus,
      plan: nextPlan,
      currentStepIndex: 0,
      iteration: runtimeState.iteration + 1,
      trace: [...runtimeState.trace, traceStart, traceDone],
    };
  };

  const reportingNode = async (state: GraphState) => {
    const runtimeState = state as AgentRuntimeState;
    const finalStatus: AgentRunStatus = runtimeState.error ? 'failed' : 'completed';
    const nextState = {
      ...runtimeState,
      status: finalStatus,
    };
    const report = await reporter.report(nextState);
    const traceDone = withTrace(nextState, {
      stage: 'reporting',
      title: finalStatus === 'completed' ? '生成完成汇报' : '生成失败汇报',
      status: finalStatus === 'completed' ? 'success' : 'error',
      payload: { report },
    });

    return {
      status: finalStatus,
      report,
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
    state.status === 'failed' ? 'reporting' : 'executing';

  const routeAfterExecuting = (state: GraphState) => {
    if (state.status === 'needs_user') return END;
    if (state.status === 'verifying') return 'verifying';
    if (state.status === 'failed') return 'reporting';
    return 'executing';
  };

  const routeAfterVerifying = (state: GraphState) => {
    if (state.status === 'needs_user') return END;
    if (state.status === 'reflecting') return 'reflecting';
    if (state.status === 'inspecting') return 'inspecting';
    return 'reporting';
  };

  const routeAfterInspecting = (state: GraphState) => {
    if (state.status === 'needs_user') return END;
    if (state.status === 'reflecting') return 'reflecting';
    return 'reporting';
  };

  const routeAfterReflecting = (state: GraphState) =>
    state.status === 'failed' ? 'reporting' : 'executing';

  const runtimeGraph = new StateGraph(AgentRuntimeGraphAnnotation)
    .addNode('planning', planningNode)
    .addNode('executing', executingNode)
    .addNode('verifying', verifyingNode)
    .addNode('inspecting', inspectingNode)
    .addNode('reflecting', reflectingNode)
    .addNode('reporting', reportingNode)
    .addEdge(START, 'planning')
    .addConditionalEdges('planning', routeAfterPlanning)
    .addConditionalEdges('executing', routeAfterExecuting)
    .addConditionalEdges('verifying', routeAfterVerifying)
    .addConditionalEdges('inspecting', routeAfterInspecting)
    .addConditionalEdges('reflecting', routeAfterReflecting)
    .addEdge('reporting', END)
    .compile({ name: 'guyue-agent-runtime' });

  return {
    async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
      let state = createInitialState(input);
      const recursionLimit = Math.max(25, (input.maxIterations ?? 1) * 10 + 20);

      try {
        state = await runtimeGraph.invoke(state, { recursionLimit });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = error instanceof GraphRecursionError
          ? 'Agent 执行超过最大步数。'
          : rawMessage;
        const traceError = withTrace(state, {
          stage: 'error',
          title: 'Agent 运行失败',
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
            title: '生成汇报失败',
            detail: reportMessage,
            status: 'error',
          });
          state = mergeState(failedState, {
            report: `执行失败：${reportMessage}`,
            trace: [...failedState.trace, traceReportError],
          });
        }
      }

      return {
        runId: state.runId,
        status: state.status,
        goal: state.goal,
        plan: state.plan,
        observations: state.observations,
        trace: state.trace,
        report: state.report,
        error: state.error,
        pendingApproval: state.pendingApproval,
      };
    },
  };
};
