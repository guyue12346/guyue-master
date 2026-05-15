import type { ComponentType } from 'react';
import * as Icons from 'lucide-react';
import type { ChatConfig } from '../chatService';
import { getBuiltinAgentScopeManifests } from '../modules';

export interface AgentModule {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  enabled: boolean;
  description: string;
  owner?: string;
  kind?: 'core' | 'builtin' | 'plugin';
}

const iconByName = (iconName?: string): ComponentType<{ className?: string }> => {
  const Icon = (Icons as any)[iconName || 'Package'] || Icons.Package;
  return Icon as ComponentType<{ className?: string }>;
};

const builtinAgentModules: AgentModule[] = getBuiltinAgentScopeManifests().map(scope => ({
  id: scope.id,
  name: scope.name,
  icon: iconByName(scope.icon),
  enabled: true,
  description: scope.description,
  kind: 'builtin',
}));

const pluginAgentModules = new Map<string, AgentModule>();
const AGENT_MODULE_REGISTRY_EVENT = 'guyue-agent-module-registry-changed';

const notifyAgentModuleRegistryChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AGENT_MODULE_REGISTRY_EVENT));
  }
};

export const registerAgentModule = (module: Omit<AgentModule, 'icon'> & { icon?: AgentModule['icon'] | string }) => {
  const normalized: AgentModule = {
    ...module,
    icon: typeof module.icon === 'string' ? iconByName(module.icon) : module.icon || Icons.Package,
    enabled: module.enabled !== false,
    kind: module.kind || 'plugin',
  };
  pluginAgentModules.set(normalized.id, normalized);
  notifyAgentModuleRegistryChanged();
  return () => {
    const current = pluginAgentModules.get(normalized.id);
    if (current?.owner === normalized.owner) {
      pluginAgentModules.delete(normalized.id);
      notifyAgentModuleRegistryChanged();
    }
  };
};

export const unregisterAgentModulesByOwner = (owner: string) => {
  Array.from(pluginAgentModules.entries()).forEach(([id, module]) => {
    if (module.owner === owner) pluginAgentModules.delete(id);
  });
  notifyAgentModuleRegistryChanged();
};

export const getAgentModules = (): AgentModule[] => [
  ...builtinAgentModules,
  ...Array.from(pluginAgentModules.values()),
];

export const getEnabledAgentModules = (): AgentModule[] =>
  getAgentModules().filter(module => module.enabled);

export const AGENT_MODULES = getAgentModules();
export const ENABLED_AGENT_MODULES = getEnabledAgentModules();
export const AGENT_MODULE_REGISTRY_CHANGED_EVENT = AGENT_MODULE_REGISTRY_EVENT;

export const getModuleById = (moduleId?: string | null) =>
  getAgentModules().find(module => module.id === moduleId) || null;

export const isNativeProvider = (provider: ChatConfig['provider']) =>
  ['openai', 'anthropic', 'gemini', 'zenmux', 'moonshot', 'deepseek'].includes(provider);

export const isStepwiseNativeProvider = (provider: ChatConfig['provider']) =>
  ['openai', 'zenmux', 'moonshot', 'deepseek'].includes(provider);
