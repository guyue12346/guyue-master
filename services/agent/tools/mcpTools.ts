import type { ToolRegistration } from '../toolRegistry';
import { findMcpServer, loadMcpServers } from '../mcpConfig';

const getElectronAPI = () => (typeof window !== 'undefined' ? (window as any).electronAPI : null);

const redactServer = (server: ReturnType<typeof loadMcpServers>[number]) => ({
  id: server.id,
  name: server.name,
  category: server.category,
  enabled: server.enabled,
  transport: server.transport,
  framing: server.framing,
  command: server.command,
  args: server.args || [],
  url: server.url,
  timeoutMs: server.timeoutMs,
  hasEnv: Boolean(server.env && Object.keys(server.env).length > 0),
  hasHeaders: Boolean(server.headers && Object.keys(server.headers).length > 0),
});

const summarizeInputSchema = (schema: any) => {
  if (!schema || typeof schema !== 'object') return undefined;
  const properties = schema.properties && typeof schema.properties === 'object'
    ? Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]: [string, any]) => [
          key,
          {
            type: value?.type,
            description: typeof value?.description === 'string'
              ? value.description.slice(0, 180)
              : undefined,
          },
        ]),
      )
    : undefined;
  return {
    type: schema.type,
    required: Array.isArray(schema.required) ? schema.required : undefined,
    properties,
  };
};

const compactMcpTool = (tool: any) => ({
  name: tool?.name,
  description: typeof tool?.description === 'string' ? tool.description.slice(0, 500) : '',
  inputSchema: summarizeInputSchema(tool?.inputSchema || tool?.input_schema || tool?.schema),
});

const resolveServer = (serverIdOrName: string):
  | { server: ReturnType<typeof loadMcpServers>[number] }
  | { error: string } => {
  const server = findMcpServer(serverIdOrName);
  if (!server) {
    return { error: `未找到 MCP Server：${serverIdOrName}` };
  }
  if (server.enabled === false) {
    return { error: `MCP Server 已禁用：${server.name}` };
  }
  return { server };
};

const SAFE_MCP_TOOL_NAMES = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_snapshot',
  'browser_take_screenshot',
  'browser_console_messages',
  'browser_network_requests',
  'browser_network_request',
  'browser_wait_for',
  'browser_resize',
]);

const READ_ONLY_EVALUATE_HINT_RE = /(innerText|textContent|document\.title|location\.href|document\.body|querySelector|querySelectorAll)/i;
const UNSAFE_EVALUATE_RE =
  /(\.click\s*\(|\.submit\s*\(|\.remove\s*\(|\.append(?:Child)?\s*\(|\.prepend\s*\(|\.insertAdjacent|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage\s*\.\s*setItem|sessionStorage\s*\.\s*setItem|document\s*\.\s*cookie\s*=|eval\s*\(|Function\s*\(|browser_run_code_unsafe|window\.open\s*\()/i;

const isReadOnlyBrowserEvaluate = (value: unknown) => {
  const source = String(value || '').trim();
  if (!source || source.length > 2500) return false;
  return READ_ONLY_EVALUATE_HINT_RE.test(source) && !UNSAFE_EVALUATE_RE.test(source);
};

const needsMcpToolConfirmation = (args: Record<string, any>) => {
  const toolName = String(args.toolName || '').trim();
  if (!toolName) return true;
  if (toolName === 'browser_evaluate') {
    return !isReadOnlyBrowserEvaluate(args.arguments?.function);
  }
  if (toolName === 'browser_tabs') {
    const action = String(args.arguments?.action || '').trim();
    return action !== 'list' && action !== 'select';
  }
  return !SAFE_MCP_TOOL_NAMES.has(toolName);
};

const collectMcpContentText = (value: any) => {
  const content = value?.content;
  if (!Array.isArray(content)) return '';
  return content
    .map(item => typeof item?.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const normalizeMcpCallResult = (result: any) => {
  if (!result?.success) return result;
  const payload = result.result || result.raw;
  if (!payload?.isError) return result;
  const message = collectMcpContentText(payload) || 'MCP 工具返回错误。';
  return {
    ...result,
    success: false,
    fatal: true,
    error: message,
    message,
  };
};

export const MCP_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_mcp_servers',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    tool: {
      name: 'query_mcp_servers',
      description: '查询 Skills 与 MCP 中心已配置的 MCP Server。需要调用外部 MCP 工具前先使用。',
      inputSchema: {
        type: 'object',
        properties: {
          includeDisabled: { type: 'boolean', description: '是否包含禁用 server。' },
        },
      },
    },
    execute: async (args) => {
      const servers = loadMcpServers()
        .filter(server => args.includeDisabled || server.enabled !== false)
        .map(redactServer);
      return {
        success: true,
        servers,
        message: servers.length
          ? `当前配置了 ${servers.length} 个 MCP Server。`
          : '当前没有配置 MCP Server。',
      };
    },
  },
  {
    name: 'list_mcp_tools',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    tool: {
      name: 'list_mcp_tools',
      description: '列出某个 MCP Server 暴露的 tools。调用具体 MCP tool 前应先用它确认名称和参数 schema。',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP Server id 或名称。' },
        },
        required: ['server'],
      },
    },
    execute: async (args) => {
      const resolved = resolveServer(String(args.server || ''));
      if ('error' in resolved) return { success: false, error: resolved.error };
      const electronAPI = getElectronAPI();
      if (!electronAPI?.agentMcpListTools) return { success: false, error: 'MCP 执行器不可用（非桌面端）。' };
      const result = await electronAPI.agentMcpListTools({ server: resolved.server });
      if (!result?.success) return result;
      const tools = Array.isArray(result.tools) ? result.tools.map(compactMcpTool) : [];
      return {
        success: true,
        serverId: result.serverId || resolved.server.id,
        serverName: resolved.server.name,
        toolCount: tools.length,
        tools,
        message: `MCP Server ${resolved.server.name || resolved.server.id} 暴露了 ${tools.length} 个工具。`,
      };
    },
  },
  {
    name: 'call_mcp_tool',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    safety: { shouldConfirm: needsMcpToolConfirmation },
    tool: {
      name: 'call_mcp_tool',
      description: '调用某个 MCP Server 的工具。浏览器导航、快照、截图、网络/控制台读取等只读工具可直接执行；点击、输入、表单、文件、任意代码等有副作用或高风险工具会要求确认。调用前应先 list_mcp_tools。',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP Server id 或名称。' },
          toolName: { type: 'string', description: '要调用的 MCP tool 名称。' },
          arguments: {
            type: 'object',
            description: '传给 MCP tool 的参数。该对象按目标 MCP tool 的 schema 透传，可包含任意字段。',
            additionalProperties: true,
          },
        },
        required: ['server', 'toolName'],
      },
    },
    execute: async (args) => {
      const resolved = resolveServer(String(args.server || ''));
      if ('error' in resolved) return { success: false, error: resolved.error };
      const electronAPI = getElectronAPI();
      if (!electronAPI?.agentMcpCallTool) return { success: false, error: 'MCP 执行器不可用（非桌面端）。' };
      const result = await electronAPI.agentMcpCallTool({
        server: resolved.server,
        toolName: String(args.toolName || ''),
        arguments: args.arguments || {},
      });
      return normalizeMcpCallResult(result);
    },
  },
  {
    name: 'list_mcp_resources',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    tool: {
      name: 'list_mcp_resources',
      description: '列出某个 MCP Server 暴露的 resources。适合读取外部知识上下文。',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP Server id 或名称。' },
        },
        required: ['server'],
      },
    },
    execute: async (args) => {
      const resolved = resolveServer(String(args.server || ''));
      if ('error' in resolved) return { success: false, error: resolved.error };
      const electronAPI = getElectronAPI();
      if (!electronAPI?.agentMcpListResources) return { success: false, error: 'MCP 执行器不可用（非桌面端）。' };
      return electronAPI.agentMcpListResources({ server: resolved.server });
    },
  },
  {
    name: 'read_mcp_resource',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    tool: {
      name: 'read_mcp_resource',
      description: '读取某个 MCP resource 的内容。通常先 list_mcp_resources 获取 URI。',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP Server id 或名称。' },
          uri: { type: 'string', description: 'resource URI。' },
        },
        required: ['server', 'uri'],
      },
    },
    execute: async (args) => {
      const resolved = resolveServer(String(args.server || ''));
      if ('error' in resolved) return { success: false, error: resolved.error };
      const electronAPI = getElectronAPI();
      if (!electronAPI?.agentMcpReadResource) return { success: false, error: 'MCP 执行器不可用（非桌面端）。' };
      return electronAPI.agentMcpReadResource({
        server: resolved.server,
        uri: String(args.uri || ''),
      });
    },
  },
  {
    name: 'mcp_read_resource',
    module: 'mcp',
    origin: 'mcp',
    exposure: 'direct',
    permission: { module: 'mcp', action: 'read' },
    tool: {
      name: 'mcp_read_resource',
      description: '正式 MCP 资源读取节点：读取某个 MCP resource 的内容。语义等同 read_mcp_resource。',
      inputSchema: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'MCP Server id 或名称。' },
          uri: { type: 'string', description: 'resource URI。' },
        },
        required: ['server', 'uri'],
      },
    },
    execute: async (args, ctx) => MCP_TOOL_REGISTRATIONS[4].execute(args, ctx),
  },
];
