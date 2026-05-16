import type { AgentCapability, AgentCapabilityOrigin } from './capabilityRegistry';
import { toolRegistrationToCapability } from './capabilityRegistry';
import type { ToolRegistration } from './toolRegistry';

export interface AgentCapabilityProvider {
  id: string;
  label: string;
  origin: AgentCapabilityOrigin;
  listCapabilities: () => AgentCapability[];
}

class AgentCapabilityProviderRegistry {
  private providers = new Map<string, AgentCapabilityProvider>();

  register(provider: AgentCapabilityProvider) {
    this.providers.set(provider.id, provider);
    return () => this.providers.delete(provider.id);
  }

  listProviders() {
    return Array.from(this.providers.values());
  }

  listCapabilities() {
    return this.listProviders().flatMap(provider =>
      provider.listCapabilities().map(capability => ({
        ...capability,
        origin: capability.origin || provider.origin,
        sourceId: capability.sourceId || provider.id,
        metadata: {
          ...(capability.metadata || {}),
          providerId: provider.id,
          providerLabel: provider.label,
        },
      })),
    );
  }
}

export const AGENT_CAPABILITY_PROVIDER_REGISTRY = new AgentCapabilityProviderRegistry();

export const registerAgentCapabilityProvider =
  AGENT_CAPABILITY_PROVIDER_REGISTRY.register.bind(AGENT_CAPABILITY_PROVIDER_REGISTRY);

export const listAgentCapabilityProviders =
  AGENT_CAPABILITY_PROVIDER_REGISTRY.listProviders.bind(AGENT_CAPABILITY_PROVIDER_REGISTRY);

export const listAgentCapabilities =
  AGENT_CAPABILITY_PROVIDER_REGISTRY.listCapabilities.bind(AGENT_CAPABILITY_PROVIDER_REGISTRY);

export const createToolRegistryCapabilityProvider = (
  getRegistry: () => ToolRegistration[],
): AgentCapabilityProvider => ({
  id: 'core-agent-tools',
  label: '核心工具注册表',
  origin: 'builtin',
  listCapabilities: () => getRegistry().map(toolRegistrationToCapability),
});

