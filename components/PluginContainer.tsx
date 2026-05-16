import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { ChatTool } from '../services/chatService';
import {
  type ToolExecutionContext,
  type ToolRegistration,
  inferToolPermissionAction,
} from '../services/agent/toolRegistry';
import {
  registerAgentTool,
  unregisterAgentTool,
  unregisterAgentToolsByOwner,
} from '../services/agent/tools';
import {
  registerAgentModule,
  unregisterAgentModulesByOwner,
} from '../services/agent/agentModules';
import { guyueCommandBus, guyueEventBus } from '../services/modules/runtime';
import type { AgentCrudAction } from '../services/agent/agentPermissions';

interface PluginContainerProps {
  entryPath: string;
  pluginId: string;
  pluginName?: string;
  onOpenInBrowser?: (url: string) => void;
  runtimeMode?: 'foreground' | 'background';
  hidden?: boolean;
}

interface PluginHostMessage {
  requestId?: string;
  type: string;
  payload?: any;
}

interface PendingPluginToolCall {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: number;
}

const safePluginId = (pluginId: string) =>
  pluginId.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+/, '') || 'plugin';

const createPluginModuleId = (pluginId: string) => `plugin-${safePluginId(pluginId)}`;

export const PluginContainer: React.FC<PluginContainerProps> = ({
  entryPath,
  pluginId,
  pluginName,
  onOpenInBrowser,
  runtimeMode = 'foreground',
  hidden = false,
}) => {
  const webviewRef = useRef<any>(null);
  const pendingToolCallsRef = useRef<Map<string, PendingPluginToolCall>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [pluginPreloadPath, setPluginPreloadPath] = useState('');

  const isBackgroundRuntime = runtimeMode === 'background';
  const ownerId = useMemo(() => `plugin:${pluginId}:${runtimeMode}`, [pluginId, runtimeMode]);
  const defaultPluginModuleId = useMemo(() => createPluginModuleId(pluginId), [pluginId]);
  const src = useMemo(() => {
    const url = new URL(`file://${entryPath}`);
    url.searchParams.set('guyuePluginId', pluginId);
    return url.toString();
  }, [entryPath, pluginId]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getPluginPreloadPath?.()
      .then(preloadPath => {
        if (!cancelled) setPluginPreloadPath(preloadPath || '');
      })
      .catch(() => {
        if (!cancelled) setPluginPreloadPath('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (isBackgroundRuntime) {
      unregisterAgentToolsByOwner(ownerId);
      unregisterAgentModulesByOwner(ownerId);
    }
    pendingToolCallsRef.current.forEach(pending => {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('插件页面已卸载'));
    });
    pendingToolCallsRef.current.clear();
  }, [isBackgroundRuntime, ownerId]);

  const replyToPlugin = useCallback((requestId: string | undefined, result: any, success = true) => {
    if (!requestId || !webviewRef.current) return;
    webviewRef.current.send('guyue-plugin-reply', {
      requestId,
      success,
      ...(success ? { result } : { error: result instanceof Error ? result.message : String(result) }),
    });
  }, []);

  const executePluginTool = useCallback((toolName: string, args: Record<string, any>, _context: ToolExecutionContext) => (
    new Promise<any>((resolve, reject) => {
      const webview = webviewRef.current;
      if (!webview) {
        reject(new Error('插件页面尚未加载'));
        return;
      }
      const requestId = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        pendingToolCallsRef.current.delete(requestId);
        reject(new Error(`插件工具执行超时：${toolName}`));
      }, 60_000);
      pendingToolCallsRef.current.set(requestId, { resolve, reject, timer });
      webview.send('guyue-agent-tool-call', {
        requestId,
        toolName,
        args,
        context: {},
      });
    })
  ), []);

  const handlePluginMessage = useCallback(async (message: PluginHostMessage) => {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'agent.toolResult') {
      const pending = message.requestId ? pendingToolCallsRef.current.get(message.requestId) : undefined;
      if (!pending) return;
      pendingToolCallsRef.current.delete(message.requestId!);
      window.clearTimeout(pending.timer);
      if (message.payload?.success === false) {
        pending.reject(new Error(message.payload?.error || '插件工具执行失败'));
      } else {
        pending.resolve(message.payload?.result);
      }
      return;
    }

    try {
      if (message.type === 'event.emit') {
        await guyueEventBus.emit(
          String(message.payload?.type || ''),
          message.payload?.payload,
          { source: ownerId },
        );
        replyToPlugin(message.requestId, { ok: true });
        return;
      }

      if (message.type === 'command.execute') {
        const result = await guyueCommandBus.execute(
          String(message.payload?.name || ''),
          message.payload?.payload,
          { source: ownerId },
        );
        replyToPlugin(message.requestId, result);
        return;
      }

      if (message.type === 'agent.registerTool') {
        const tool = message.payload?.tool as Partial<ChatTool> & {
          module?: string;
          permission?: { module?: string; action?: AgentCrudAction };
        };
        const name = String(tool?.name || '').trim();
        const description = String(tool?.description || '').trim();
        if (!name || !description || !tool?.inputSchema) {
          throw new Error('插件工具必须包含 name、description 和 inputSchema');
        }

        const moduleId = String(tool.module || tool.permission?.module || defaultPluginModuleId);
        if (!isBackgroundRuntime) {
          replyToPlugin(message.requestId, {
            name,
            module: moduleId,
            delegatedTo: 'background-runtime',
          });
          return;
        }

        registerAgentModule({
          id: moduleId,
          name: moduleId === defaultPluginModuleId ? (pluginName || pluginId) : moduleId,
          description: `插件 ${pluginId} 提供的 Agent 能力`,
          icon: 'Package',
          enabled: true,
          owner: ownerId,
          kind: 'plugin',
        });

        const registration: ToolRegistration = {
          name,
          module: moduleId,
          permission: {
            module: tool.permission?.module || moduleId,
            action: tool.permission?.action || inferToolPermissionAction(name),
          },
          tool: {
            name,
            description,
            inputSchema: tool.inputSchema,
          },
          execute: async (args, context) => {
            try {
              return await executePluginTool(name, args, context);
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          },
        };
        registerAgentTool(registration, { kind: 'plugin', ownerId });
        replyToPlugin(message.requestId, { name, module: moduleId });
        return;
      }

      if (message.type === 'agent.unregisterTool') {
        if (isBackgroundRuntime) {
          unregisterAgentTool(String(message.payload?.name || ''), ownerId);
        }
        replyToPlugin(message.requestId, { ok: true });
        return;
      }

      throw new Error(`未知插件消息类型：${message.type}`);
    } catch (error) {
      replyToPlugin(message.requestId, error, false);
    }
  }, [defaultPluginModuleId, executePluginTool, isBackgroundRuntime, ownerId, pluginId, pluginName, replyToPlugin]);

  const handleExternalLink = useCallback((url: string) => {
    if (hidden) return;
    if (onOpenInBrowser) {
      onOpenInBrowser(url);
    } else {
      window.electronAPI.openPath(url);
    }
  }, [hidden, onOpenInBrowser]);

  if (!pluginPreloadPath) {
    if (hidden) return null;
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <RotateCw className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div
      className={
        hidden
          ? 'pointer-events-none fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0'
          : 'flex h-full flex-col bg-white'
      }
      aria-hidden={hidden}
    >
      <div className="relative flex-1">
        {/*
          // @ts-ignore
        */}
        <webview
          ref={(el: any) => {
            if (el) {
              webviewRef.current = el;
              if (!el.dataset.listenersAttached) {
                el.dataset.listenersAttached = 'true';

                el.addEventListener('did-start-loading', () => setIsLoading(true));
                el.addEventListener('did-stop-loading', () => setIsLoading(false));

                el.addEventListener('ipc-message', (event: any) => {
                  if (event.channel !== 'guyue-plugin-message') return;
                  handlePluginMessage(event.args?.[0]);
                });

                el.addEventListener('new-window', (event: any) => {
                  event.preventDefault();
                  handleExternalLink(event.url);
                });

                el.addEventListener('will-navigate', (event: any) => {
                  if (event.url !== src) {
                    event.preventDefault();
                    handleExternalLink(event.url);
                  }
                });
              }
            }
          }}
          src={src}
          className="h-full w-full"
          partition={`persist:plugin-${pluginId}`}
          preload={pluginPreloadPath}
          // @ts-ignore
          webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
        />

        {!hidden && isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/50">
            <RotateCw className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
};
