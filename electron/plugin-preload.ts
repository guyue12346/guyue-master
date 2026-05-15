import { contextBridge, ipcRenderer } from 'electron';

type GuyuePluginRequestPayload =
  | { type: 'event.emit'; payload: { type: string; payload?: unknown } }
  | { type: 'command.execute'; payload: { name: string; payload?: unknown } }
  | { type: 'agent.registerTool'; payload: { tool: GuyuePluginToolDefinition } }
  | { type: 'agent.unregisterTool'; payload: { name: string } };

interface GuyuePluginToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  module?: string;
  permission?: {
    module?: string;
    action?: 'read' | 'create' | 'update' | 'delete';
  };
}

type GuyueToolHandler = (args: unknown, context?: unknown) => unknown | Promise<unknown>;

const toolHandlers = new Map<string, GuyueToolHandler>();
const pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
const pluginGlobal = globalThis as typeof globalThis & {
  location?: { href?: string };
  crypto?: { randomUUID?: () => string };
};

const getPluginId = () => {
  try {
    const url = new URL(pluginGlobal.location?.href || 'file://plugin/index.html');
    return url.searchParams.get('guyuePluginId') || 'unknown-plugin';
  } catch {
    return 'unknown-plugin';
  }
};

const pluginId = getPluginId();

const safeIdentifier = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '') || 'tool';

const normalizePluginToolName = (name: string) => {
  const safePluginId = safeIdentifier(pluginId);
  const safeName = safeIdentifier(name);
  return safeName.startsWith(`${safePluginId}_`) ? safeName : `${safePluginId}_${safeName}`;
};

const requestHost = (payload: GuyuePluginRequestPayload) => new Promise((resolve, reject) => {
  const requestId = pluginGlobal.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  pendingRequests.set(requestId, { resolve, reject });
  ipcRenderer.sendToHost('guyue-plugin-message', {
    requestId,
    ...payload,
  });
});

ipcRenderer.on('guyue-plugin-reply', (_event, message: { requestId?: string; success?: boolean; result?: unknown; error?: string }) => {
  if (!message?.requestId) return;
  const pending = pendingRequests.get(message.requestId);
  if (!pending) return;
  pendingRequests.delete(message.requestId);
  if (message.success === false) {
    pending.reject(new Error(message.error || 'Guyue host request failed'));
    return;
  }
  pending.resolve(message.result);
});

ipcRenderer.on('guyue-agent-tool-call', async (_event, message: { requestId?: string; toolName?: string; args?: unknown; context?: unknown }) => {
  if (!message?.requestId || !message.toolName) return;
  const handler = toolHandlers.get(message.toolName);
  if (!handler) {
    ipcRenderer.sendToHost('guyue-plugin-message', {
      type: 'agent.toolResult',
      requestId: message.requestId,
      payload: { success: false, error: `插件工具未注册处理器：${message.toolName}` },
    });
    return;
  }

  try {
    const result = await handler(message.args, message.context);
    ipcRenderer.sendToHost('guyue-plugin-message', {
      type: 'agent.toolResult',
      requestId: message.requestId,
      payload: { success: true, result },
    });
  } catch (error) {
    ipcRenderer.sendToHost('guyue-plugin-message', {
      type: 'agent.toolResult',
      requestId: message.requestId,
      payload: { success: false, error: error instanceof Error ? error.message : String(error) },
    });
  }
});

contextBridge.exposeInMainWorld('guyue', {
  version: '1.0',
  plugin: {
    id: pluginId,
  },
  events: {
    emit: (type: string, payload?: unknown) =>
      requestHost({ type: 'event.emit', payload: { type, payload } }),
  },
  commands: {
    execute: (name: string, payload?: unknown) =>
      requestHost({ type: 'command.execute', payload: { name, payload } }),
  },
  agent: {
    registerTool: async (tool: GuyuePluginToolDefinition, handler: GuyueToolHandler) => {
      const normalizedName = normalizePluginToolName(tool.name);
      if (typeof handler !== 'function') {
        throw new Error('registerTool 需要传入工具处理函数');
      }
      toolHandlers.set(normalizedName, handler);
      await requestHost({
        type: 'agent.registerTool',
        payload: { tool: { ...tool, name: normalizedName } },
      });
      return { name: normalizedName };
    },
    unregisterTool: async (name: string) => {
      const normalizedName = normalizePluginToolName(name);
      toolHandlers.delete(normalizedName);
      return requestHost({ type: 'agent.unregisterTool', payload: { name: normalizedName } });
    },
  },
});
