import type {
  AgentReporter,
  AgentReflector,
  AgentRuntimeInput,
  AgentRuntimeState,
  AgentVerifier,
  AgentInspector,
  AgentPlanner,
  AgentPlanStep,
} from './types';

export const createStaticPlanner = (): AgentPlanner => ({
  async plan(input: AgentRuntimeInput): Promise<AgentPlanStep[]> {
    if (input.initialPlan?.length) {
      return input.initialPlan.map((step, index) => ({
        ...step,
        id: step.id || `step_${index + 1}`,
        status: step.status || 'pending',
      }));
    }

    return [{
      id: 'step_1',
      title: '理解目标并等待具体工具计划',
      description: '当前没有注入 LLM planner，也没有传入 initialPlan，因此只生成一个占位计划。',
      status: 'skipped',
    }];
  },
});

export const defaultVerifier: AgentVerifier = {
  async verify(state: AgentRuntimeState) {
    if (state.pendingApproval) {
      return {
        status: 'needs_user',
        message: state.pendingApproval.message,
      };
    }

    const failed = state.observations.find(observation => !observation.success);
    if (failed) {
      return {
        status: 'failed',
        message: failed.error || `工具 ${failed.toolName || 'unknown'} 执行失败。`,
        retryable: state.iteration < state.maxIterations,
      };
    }

    const executableSteps = state.plan.filter(step => step.toolName);
    if (executableSteps.length === 0) {
      return {
        status: 'success',
        message: '没有需要执行的工具步骤。',
      };
    }

    const successfulStepIds = new Set(
      state.observations
        .filter(observation => observation.success)
        .map(observation => observation.stepId),
    );
    const missing = executableSteps.find(step => !successfulStepIds.has(step.id));
    if (missing) {
      return {
        status: 'failed',
        message: `计划步骤「${missing.title}」没有成功执行记录。`,
        retryable: state.iteration < state.maxIterations,
      };
    }

    return {
      status: 'success',
      message: '所有工具步骤均已有成功执行记录。',
    };
  },
};

export const defaultInspector: AgentInspector = {
  async inspect(state: AgentRuntimeState) {
    if (state.pendingApproval) {
      return {
        status: 'needs_user',
        message: state.pendingApproval.message,
      };
    }

    if (state.error) {
      return {
        status: 'failed',
        message: state.error,
        retryable: state.iteration < state.maxIterations,
      };
    }

    const failed = state.observations.find(observation => !observation.success);
    if (failed) {
      return {
        status: 'failed',
        message: failed.error || `工具 ${failed.toolName || 'unknown'} 执行失败。`,
        retryable: state.iteration < state.maxIterations,
      };
    }

    const hasExecutableStep = state.plan.some(step => step.toolName && step.status !== 'skipped');
    const hasSuccessfulObservation = state.observations.some(observation => observation.success);
    if (hasExecutableStep && !hasSuccessfulObservation) {
      return {
        status: 'failed',
        message: '计划包含工具步骤，但没有成功的执行记录。',
        retryable: state.iteration < state.maxIterations,
      };
    }

    return {
      status: 'success',
      message: '任务完成度检查通过。',
    };
  },
};

export const defaultReflector: AgentReflector = {
  async reflect(state: AgentRuntimeState) {
    const failedSteps = state.plan.filter(step => step.status === 'failed');
    return {
      plan: state.plan.map(step => (
        step.status === 'failed'
          ? { ...step, status: 'pending' as const }
          : step
      )),
      message: failedSteps.length
        ? `准备重试失败步骤：${failedSteps.map(step => step.title).join('、')}`
        : '未发现明确失败步骤，保持原计划继续。',
    };
  },
};

export const defaultReporter: AgentReporter = {
  async report(state: AgentRuntimeState) {
    if (state.status === 'needs_user') {
      return state.pendingApproval?.message || '需要用户确认后继续。';
    }

    if (state.error) {
      return `执行失败：${state.error}`;
    }

    const lines = state.plan.map((step, index) => {
      const marker = step.status === 'success'
        ? '完成'
        : step.status === 'failed'
          ? '失败'
          : step.status === 'waiting_approval'
            ? '待确认'
            : '跳过';
      return `${index + 1}. ${step.title}：${marker}`;
    });

    return [
      state.status === 'completed' ? '任务已完成并通过基础验证。' : '任务执行结束。',
      ...lines,
    ].join('\n');
  },
};
