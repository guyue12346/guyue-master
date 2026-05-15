import {
  executeToolRegistration,
  findToolRegistration,
} from '../toolRegistry';
import type {
  AgentPlanStep,
  AgentRuntimeState,
  AgentToolExecutor,
  AgentToolObservation,
  ToolRegistryExecutorOptions,
} from './types';

export const createToolRegistryExecutor = ({
  registry,
  context,
  executeWebSearch,
  executeWebOpen,
  executeSpecializedSearch,
}: ToolRegistryExecutorOptions): AgentToolExecutor => ({
  async execute(step: AgentPlanStep, _state: AgentRuntimeState): Promise<AgentToolObservation> {
    if (!step.toolName) {
      return {
        stepId: step.id,
        success: true,
        result: { skipped: true, message: '该步骤没有绑定工具。' },
        timestamp: Date.now(),
      };
    }

    try {
      const executionContext = {
        ...context,
        executeWebSearch: context.executeWebSearch || executeWebSearch,
        executeWebOpen: context.executeWebOpen || executeWebOpen,
        executeSpecializedSearch: context.executeSpecializedSearch || executeSpecializedSearch,
      };
      const registration = findToolRegistration(registry, step.toolName);
      const result = registration
        ? await executeToolRegistration(registration, step.args || {}, executionContext)
        : undefined;

      if (result === undefined) {
        return {
          stepId: step.id,
          toolName: step.toolName,
          success: false,
          error: `未知工具：${step.toolName}`,
          timestamp: Date.now(),
        };
      }

      return {
        stepId: step.id,
        toolName: step.toolName,
        success: result?.success !== false,
        result,
        error: result?.success === false ? String(result.error || '工具执行失败') : undefined,
        requiresApproval: Boolean(result?.pendingConfirmation),
        approvalMessage: result?.message,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        stepId: step.id,
        toolName: step.toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  },
});
