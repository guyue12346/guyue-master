import type { AgentFullAccessPermissions } from './agentPermissions';
import type { AgentPendingConfirmation, AgentUndoSnapshot } from './safety';
import { needsHumanConfirmation } from './safety';
import {
  executeToolRegistration,
  getToolPermissionTarget,
  hasFullToolAccess,
  type ToolExecutionContext,
  type ToolRegistration,
} from './toolRegistry';
import { validateAgentToolExecution, type AgentToolValidationResult } from './toolValidators';

export interface AgentToolPipelineOptions {
  confirmed?: boolean;
}

export interface AgentToolPipelineInput {
  registration: ToolRegistration;
  args: Record<string, any>;
  context: ToolExecutionContext;
  options?: AgentToolPipelineOptions;
  fullAccessPermissions?: AgentFullAccessPermissions;
  createUndoSnapshot: (toolName: string, args: Record<string, any>) => Promise<AgentUndoSnapshot | undefined>;
  buildConfirmation: (
    toolName: string,
    args: Record<string, any>,
    snapshot?: AgentUndoSnapshot,
  ) => AgentPendingConfirmation;
}

export interface AgentToolPipelineResult {
  executed: boolean;
  result: any;
  undoSnapshot?: AgentUndoSnapshot;
  pendingConfirmation?: AgentPendingConfirmation;
  beforeValidation: AgentToolValidationResult;
  afterValidation?: AgentToolValidationResult;
}

const attachVerification = (result: any, verification: AgentToolValidationResult) => {
  const base = result && typeof result === 'object' ? { ...result } : { success: true, data: result };
  base.verification = verification;
  if (!verification.ok && base.success !== false) {
    base.success = false;
    base.error = verification.summary;
  }
  return base;
};

export const executeAgentToolPipeline = async ({
  registration,
  args,
  context,
  options = {},
  fullAccessPermissions,
  createUndoSnapshot,
  buildConfirmation,
}: AgentToolPipelineInput): Promise<AgentToolPipelineResult> => {
  const target = getToolPermissionTarget(registration);
  const beforeValidation = validateAgentToolExecution({
    registration,
    args,
    context,
    phase: 'before',
  });

  if (!beforeValidation.ok) {
    return {
      executed: false,
      beforeValidation,
      result: {
        success: false,
        error: beforeValidation.summary,
        verification: beforeValidation,
        fatal: false,
      },
    };
  }

  const forceConfirmation = Boolean(registration.safety?.confirm);
  const needsSafety = forceConfirmation || needsHumanConfirmation(target.action);
  const snapshot = needsSafety ? await createUndoSnapshot(registration.name, args) : undefined;
  const requiresConfirmation = needsSafety
    && !options.confirmed
    && (forceConfirmation || !hasFullToolAccess(registration, fullAccessPermissions));

  if (requiresConfirmation) {
    const pendingConfirmation = buildConfirmation(registration.name, args, snapshot);
    return {
      executed: false,
      undoSnapshot: snapshot,
      pendingConfirmation,
      beforeValidation,
      result: {
        success: true,
        pendingConfirmation: true,
        confirmationId: pendingConfirmation.id,
        confirmationType: 'agent_tool',
        message: `${snapshot?.label || registration.name} 等待确认。`,
        toolName: registration.name,
        arguments: args,
        verification: beforeValidation,
      },
    };
  }

  const normalizedResult = await executeToolRegistration(registration, args, context);
  const rawResult = normalizedResult.raw ?? normalizedResult;
  const afterValidation = validateAgentToolExecution({
    registration,
    args,
    context,
    result: normalizedResult,
    phase: 'after',
  });

  return {
    executed: true,
    undoSnapshot: snapshot,
    beforeValidation,
    afterValidation,
    result: attachVerification(rawResult, afterValidation),
  };
};

