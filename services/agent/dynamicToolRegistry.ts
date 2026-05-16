import type { ChatTool } from '../chatService';
import type { AgentCrudAction } from './agentPermissions';
import type { ToolRegistration } from './toolRegistry';

export interface AgentToolRegistryOwner {
  kind: 'builtin' | 'plugin' | 'skill' | 'mcp';
  ownerId: string;
}

export interface PluginAgentToolDefinition {
  name: string;
  description: string;
  inputSchema: ChatTool['inputSchema'];
  module?: string;
  permission?: {
    module?: string;
    action?: AgentCrudAction;
  };
}

const TOOL_REGISTRY_EVENT = 'guyue-agent-tool-registry-changed';

const notifyToolRegistryChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOOL_REGISTRY_EVENT));
  }
};

export class DynamicAgentToolRegistry {
  private registrations: ToolRegistration[];
  private owners = new Map<string, AgentToolRegistryOwner>();

  constructor(target: ToolRegistration[] = []) {
    this.registrations = target;
  }

  list(): ToolRegistration[] {
    return [...this.registrations];
  }

  mutableList(): ToolRegistration[] {
    return this.registrations;
  }

  find(name: string): ToolRegistration | undefined {
    return this.registrations.find(registration => registration.name === name);
  }

  register(registration: ToolRegistration, owner: AgentToolRegistryOwner) {
    const name = registration.name.trim();
    if (!name) throw new Error('工具名称不能为空');
    const existingOwner = this.owners.get(name);
    if (existingOwner && existingOwner.ownerId !== owner.ownerId) {
      throw new Error(`Agent 工具已被注册：${name}`);
    }
    this.unregister(name, owner.ownerId, false);
    this.registrations.push({
      ...registration,
      origin: registration.origin || owner.kind,
      sourceId: registration.sourceId || owner.ownerId,
    });
    this.owners.set(name, owner);
    notifyToolRegistryChanged();
    return () => this.unregister(name, owner.ownerId);
  }

  registerMany(registrations: ToolRegistration[], owner: AgentToolRegistryOwner) {
    const disposers = registrations.map(registration => this.register(registration, owner));
    return () => disposers.forEach(dispose => dispose());
  }

  unregister(name: string, ownerId?: string, notify = true) {
    const existingOwner = this.owners.get(name);
    if (ownerId && existingOwner && existingOwner.ownerId !== ownerId) return false;
    const before = this.registrations.length;
    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      if (this.registrations[index].name === name) this.registrations.splice(index, 1);
    }
    this.owners.delete(name);
    if (before !== this.registrations.length && notify) notifyToolRegistryChanged();
    return before !== this.registrations.length;
  }

  unregisterByOwner(ownerId: string) {
    const names = Array.from(this.owners.entries())
      .filter(([, owner]) => owner.ownerId === ownerId)
      .map(([name]) => name);
    names.forEach(name => this.unregister(name, ownerId, false));
    if (names.length > 0) notifyToolRegistryChanged();
  }

  getOwner(name: string) {
    return this.owners.get(name) || null;
  }
}

export const AGENT_TOOL_REGISTRY_CHANGED_EVENT = TOOL_REGISTRY_EVENT;
export const createDynamicAgentToolRegistry = (target?: ToolRegistration[]) => new DynamicAgentToolRegistry(target);
