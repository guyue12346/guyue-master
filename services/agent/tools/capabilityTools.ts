import { listAgentCapabilities } from '../capabilityProviders';
import type { AgentCapability } from '../capabilityRegistry';
import type { ToolRegistration } from '../toolRegistry';

const normalizeLimit = (value: unknown, fallback = 12) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(50, Math.floor(n))) : fallback;
};

const searchableText = (capability: AgentCapability) => [
  capability.id,
  capability.name,
  capability.description,
  capability.origin,
  capability.sourceId,
  capability.permission?.module,
  capability.permission?.action,
  ...(capability.tags || []),
].filter(Boolean).join(' ').toLowerCase();

export const CAPABILITY_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'search_agent_capabilities',
    module: 'system',
    origin: 'builtin',
    exposure: 'direct',
    permission: { module: 'system', action: 'read' },
    tool: {
      name: 'search_agent_capabilities',
      description: '搜索当前 Agent 已注册的能力与工具来源。用于不确定是否有某类工具、插件、Skill 或 MCP 能力时发现可用工具；不会执行工具。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索词，例如 MCP、题库、Git、图片、Skill。' },
          limit: { type: 'number', description: '最多返回数量，默认 12。' },
          origin: { type: 'string', enum: ['builtin', 'plugin', 'skill', 'mcp'], description: '可选，按能力来源过滤。' },
        },
        required: ['query'],
      },
    },
    execute: async (args, ctx) => {
      const query = String(args.query || '').trim();
      const limit = normalizeLimit(args.limit);
      const origin = typeof args.origin === 'string' ? args.origin : '';
      const providerCapabilities = listAgentCapabilities();
      const fallbackCapabilities = (ctx.toolRegistry || []).map(registration => ({
        id: `builtin:tool:${registration.name}`,
        name: registration.name,
        description: registration.tool.description,
        origin: registration.origin || 'builtin',
        sourceId: registration.sourceId || registration.module,
        type: 'tool' as const,
        exposure: registration.exposure || 'direct',
        permission: registration.permission
          ? { module: registration.permission.module || registration.module, action: registration.permission.action || 'read' }
          : undefined,
      }));
      const capabilities = (providerCapabilities.length > 0 ? providerCapabilities : fallbackCapabilities)
        .filter(capability => !origin || capability.origin === origin)
        .map(capability => ({
          capability,
          score: query
            ? query.toLowerCase().split(/[\s,，;；/\\|]+/).filter(Boolean)
                .reduce((total, token) => total + (searchableText(capability).includes(token) ? 1 : 0), 0)
            : 1,
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name))
        .slice(0, limit)
        .map(({ capability }) => ({
          id: capability.id,
          name: capability.name,
          description: capability.description,
          origin: capability.origin,
          sourceId: capability.sourceId,
          type: capability.type,
          exposure: capability.exposure,
          permission: capability.permission,
        }));
      return {
        success: true,
        capabilities,
        message: capabilities.length
          ? `找到 ${capabilities.length} 个相关能力。`
          : '没有找到匹配能力。',
      };
    },
  },
  {
    name: 'tool_search',
    module: 'system',
    origin: 'builtin',
    exposure: 'direct',
    permission: { module: 'system', action: 'read' },
    tool: {
      name: 'tool_search',
      description: '正式能力发现节点：搜索当前 Agent 已注册的工具、Skill、插件和 MCP 能力。语义等同 search_agent_capabilities。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索词，例如 MCP、题库、Git、图片、Skill。' },
          limit: { type: 'number', description: '最多返回数量，默认 12。' },
          origin: { type: 'string', enum: ['builtin', 'plugin', 'skill', 'mcp'], description: '可选，按能力来源过滤。' },
        },
        required: ['query'],
      },
    },
    execute: async (args, ctx) =>
      CAPABILITY_TOOL_REGISTRATIONS[0].execute(args, ctx),
  },
];
