import type { ChatTool } from '../chatService';
import type { AgentCrudAction } from './agentPermissions';
import type { ToolRegistration } from './toolRegistry';
import { getToolPermissionTarget, inferToolPermissionAction } from './toolRegistry';

export type AgentCapabilityOrigin = 'builtin' | 'plugin' | 'skill' | 'mcp';
export type AgentCapabilityType = 'tool' | 'instruction' | 'resource' | 'prompt';
export type AgentCapabilityExposure = 'direct' | 'deferred' | 'hidden';

export interface AgentCapabilityPermission {
  module: string;
  action: AgentCrudAction;
  risk?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  origin: AgentCapabilityOrigin;
  sourceId: string;
  type: AgentCapabilityType;
  exposure: AgentCapabilityExposure;
  tool?: ChatTool;
  permission?: AgentCapabilityPermission;
  tags?: string[];
  metadata?: Record<string, any>;
}

const CAPABILITY_REGISTRY_EVENT = 'guyue-agent-capability-registry-changed';

const notifyCapabilityRegistryChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CAPABILITY_REGISTRY_EVENT));
  }
};

const normalizeCapabilityId = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9:_-]/g, '_');

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[\s,，;；/\\|]+/)
    .map(part => part.trim())
    .filter(Boolean);

const scoreCapability = (capability: AgentCapability, query: string) => {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1;
  const text = [
    capability.id,
    capability.name,
    capability.description,
    capability.origin,
    capability.sourceId,
    capability.permission?.module,
    capability.permission?.action,
    ...(capability.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
};

export class AgentCapabilityRegistry {
  private capabilities = new Map<string, AgentCapability>();

  list() {
    return Array.from(this.capabilities.values());
  }

  register(capability: AgentCapability) {
    const id = normalizeCapabilityId(capability.id);
    if (!id) throw new Error('能力 ID 不能为空');
    this.capabilities.set(id, { ...capability, id });
    notifyCapabilityRegistryChanged();
    return () => this.unregister(id);
  }

  registerMany(capabilities: AgentCapability[]) {
    const disposers = capabilities.map(capability => this.register(capability));
    return () => disposers.forEach(dispose => dispose());
  }

  unregister(id: string) {
    const removed = this.capabilities.delete(normalizeCapabilityId(id));
    if (removed) notifyCapabilityRegistryChanged();
    return removed;
  }

  unregisterBySource(origin: AgentCapabilityOrigin, sourceId: string) {
    const ids = this.list()
      .filter(capability => capability.origin === origin && capability.sourceId === sourceId)
      .map(capability => capability.id);
    ids.forEach(id => this.capabilities.delete(id));
    if (ids.length > 0) notifyCapabilityRegistryChanged();
  }

  search(query: string, limit = 12) {
    return this.list()
      .map(capability => ({ capability, score: scoreCapability(capability, query) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name))
      .slice(0, Math.max(1, limit))
      .map(item => item.capability);
  }
}

export const AGENT_CAPABILITY_REGISTRY = new AgentCapabilityRegistry();
export const AGENT_CAPABILITY_REGISTRY_CHANGED_EVENT = CAPABILITY_REGISTRY_EVENT;

export const toolRegistrationToCapability = (registration: ToolRegistration): AgentCapability => {
  const permissionTarget = registration.permissionless ? null : getToolPermissionTarget(registration);
  const origin: AgentCapabilityOrigin = registration.origin || 'builtin';
  const sourceId = registration.sourceId || registration.module;
  return {
    id: `${origin}:tool:${registration.name}`,
    name: registration.name,
    description: registration.tool.description,
    origin,
    sourceId,
    type: 'tool',
    exposure: registration.exposure || 'direct',
    tool: registration.tool,
    permission: permissionTarget
      ? {
          module: permissionTarget.module,
          action: permissionTarget.action || inferToolPermissionAction(registration.name),
          requiresConfirmation: Boolean(registration.safety?.confirm),
        }
      : undefined,
    tags: [
      registration.module,
      permissionTarget?.module,
      permissionTarget?.action,
      origin,
      registration.permissionless ? 'permissionless' : '',
    ].filter(Boolean) as string[],
    metadata: {
      module: registration.module,
      permissionless: Boolean(registration.permissionless),
    },
  };
};

export const listToolCapabilities = (registrations: ToolRegistration[]) =>
  registrations.map(toolRegistrationToCapability);
