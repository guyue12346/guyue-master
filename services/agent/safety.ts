import type { AgentCrudAction } from './agentPermissions';

export interface AgentPendingConfirmation {
  id: string;
  type: 'send_email' | 'agent_tool' | 'local_secret';
  status: 'pending' | 'processing' | 'confirmed' | 'cancelled';
  data: Record<string, any>;
  summary: string;
}

export interface AgentUndoSnapshot {
  type:
    | 'todo'
    | 'note'
    | 'resource'
    | 'ssh'
    | 'api'
    | 'recurring'
    | 'latex_file'
    | 'latex_template'
    | 'file'
    | 'question'
    | 'question_method'
    | 'canvas'
    | 'oj_heatmap'
    | 'local_storage';
  action: 'update' | 'delete';
  id: string;
  data: Record<string, any>;
  label: string;
}

export const isMutatingAgentAction = (action: AgentCrudAction) =>
  action === 'create' || action === 'update' || action === 'delete';

export const needsHumanConfirmation = (action: AgentCrudAction) =>
  action === 'update' || action === 'delete';
