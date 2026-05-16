import { app, ipcMain } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type AgentMcpServerConfig = {
  id: string;
  name?: string;
  enabled?: boolean;
  transport?: 'stdio' | 'http';
  framing?: 'jsonl' | 'headers';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type DiagnosticLogger = (message: string, payload?: unknown) => void;

const buildMcpProcessEnv = (extraEnv?: Record<string, string>) => {
  const pathParts = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set(pathParts.join(':').split(':').filter(Boolean))).join(':'),
    ...(extraEnv || {}),
  };
};

const findCachedPlaywrightMcpCli = () => {
  const npxRoot = path.join(app.getPath('home'), '.npm', '_npx');
  try {
    if (!fs.existsSync(npxRoot)) return '';
    return fs.readdirSync(npxRoot)
      .map(dir => path.join(npxRoot, dir, 'node_modules', '@playwright', 'mcp', 'cli.js'))
      .filter(file => fs.existsSync(file))
      .map(file => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file || '';
  } catch {
    return '';
  }
};

const resolveStdioSpawn = (config: AgentMcpServerConfig) => {
  const command = String(config.command || '').trim();
  const args = Array.isArray(config.args) ? config.args.map(String) : [];
  const commandName = path.basename(command).toLowerCase();
  const isNpxPlaywrightMcp =
    commandName === 'npx' &&
    args.some(arg => /^@playwright\/mcp(?:@.+)?$/.test(arg));

  if (!isNpxPlaywrightMcp) {
    return { command, args, resolvedFromCache: false };
  }

  const cachedCli = findCachedPlaywrightMcpCli();
  if (!cachedCli) {
    return { command, args, resolvedFromCache: false };
  }

  return {
    command: cachedCli,
    args: args.filter(arg => arg !== '-y' && !/^@playwright\/mcp(?:@.+)?$/.test(arg)),
    resolvedFromCache: true,
  };
};

class StdioMcpClient {
  private proc: ReturnType<typeof spawn> | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private initialized = false;
  private pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();

  constructor(
    private readonly config: AgentMcpServerConfig,
    private readonly log: DiagnosticLogger,
  ) {}

  private start() {
    if (this.proc) return;
    const resolvedSpawn = resolveStdioSpawn(this.config);
    const command = resolvedSpawn.command;
    if (!command) throw new Error('stdio MCP Server 缺少 command。');
    const proc = spawn(command, resolvedSpawn.args, {
      cwd: app.getPath('home'),
      env: buildMcpProcessEnv(this.config.env),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.log('mcp:spawn', {
      server: this.config.id,
      command,
      args: resolvedSpawn.args,
      resolvedFromCache: resolvedSpawn.resolvedFromCache,
    });
    if (!proc.stdin || !proc.stdout || !proc.stderr) {
      proc.kill();
      throw new Error('MCP stdio 进程未提供 stdin/stdout/stderr。');
    }
    this.proc = proc;
    proc.stdout.on('data', chunk => this.handleData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    proc.stderr.on('data', chunk => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (text.trim()) this.log('mcp:stderr', { server: this.config.id, text: text.slice(0, 1000) });
    });
    proc.on('error', error => {
      const nextError = new Error(`MCP Server 启动失败：${this.config.id} ${error.message}`);
      this.pending.forEach(pending => {
        clearTimeout(pending.timer);
        pending.reject(nextError);
      });
      this.pending.clear();
      this.proc = null;
      this.initialized = false;
      this.log('mcp:spawn-error', { server: this.config.id, error: error.message, command, args: resolvedSpawn.args });
    });
    proc.on('exit', (code, signal) => {
      const error = new Error(`MCP Server 已退出：${this.config.id} code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.pending.forEach(pending => {
        clearTimeout(pending.timer);
        pending.reject(error);
      });
      this.pending.clear();
      this.proc = null;
      this.initialized = false;
    });
  }

  private handleData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const prefix = this.buffer.slice(0, Math.min(this.buffer.length, 32)).toString('utf8');
      if (/^content-length:/i.test(prefix)) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = this.buffer.slice(0, headerEnd).toString('utf8');
        const match = header.match(/content-length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + length;
        if (this.buffer.length < bodyEnd) return;
        const raw = this.buffer.slice(bodyStart, bodyEnd).toString('utf8');
        this.buffer = this.buffer.slice(bodyEnd);
        this.handleMessage(raw);
        continue;
      }

      const lineEnd = this.buffer.indexOf('\n');
      if (lineEnd === -1) return;
      const raw = this.buffer.slice(0, lineEnd).toString('utf8').replace(/\r$/, '').trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!raw) continue;
      this.handleMessage(raw);
    }
  }

  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw);
      if (typeof message.id === 'number' && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)!;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          pending.resolve(message.result);
        }
      }
    } catch (error) {
      this.log('mcp:parse-error', { server: this.config.id, error: (error as Error).message, raw: raw.slice(0, 500) });
    }
  }

  private send(message: Record<string, any>) {
    this.start();
    const body = JSON.stringify(message);
    const payload = this.config.framing === 'headers'
      ? `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
      : `${body}\n`;
    if (!this.proc?.stdin) throw new Error('MCP stdio 进程不可用。');
    this.proc.stdin.write(payload);
  }

  private request(method: string, params?: Record<string, any>) {
    const id = this.nextId++;
    const timeoutMs = Number.isFinite(Number(this.config.timeoutMs)) ? Number(this.config.timeoutMs) : 30_000;
    const message = { jsonrpc: '2.0', id, method, params: params || {} };
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(message);

      // `npx`/`npm exec` may launch the real MCP server after stdin already
      // received the first frame. Re-send initialize while the same request is
      // still pending so stdio wrappers do not swallow the handshake.
      if (method === 'initialize') {
        [1_500, 5_000, 15_000].forEach(delay => {
          setTimeout(() => {
            if (!this.pending.has(id)) return;
            try {
              this.send(message);
            } catch (error) {
              this.log('mcp:initialize-retry-error', { server: this.config.id, error: (error as Error).message });
            }
          }, delay);
        });
      }
    });
  }

  private notify(method: string, params?: Record<string, any>) {
    this.send({ jsonrpc: '2.0', method, params: params || {} });
  }

  async initialize() {
    if (this.initialized) return;
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'Guyue Master',
        version: app.getVersion(),
      },
    });
    this.notify('notifications/initialized');
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    return this.request('tools/list');
  }

  async callTool(name: string, args: Record<string, any>) {
    await this.initialize();
    return this.request('tools/call', { name, arguments: args || {} });
  }

  async listResources() {
    await this.initialize();
    return this.request('resources/list');
  }

  async readResource(uri: string) {
    await this.initialize();
    return this.request('resources/read', { uri });
  }

  close() {
    this.pending.forEach(pending => {
      clearTimeout(pending.timer);
      pending.reject(new Error('MCP Server 已关闭'));
    });
    this.pending.clear();
    this.proc?.kill();
    this.proc = null;
    this.initialized = false;
  }
}

export class McpManager {
  private clients = new Map<string, { signature: string; client: StdioMcpClient }>();

  constructor(private readonly log: DiagnosticLogger = () => {}) {}

  private signature(server: AgentMcpServerConfig) {
    return JSON.stringify({
      transport: server.transport || 'stdio',
      framing: server.framing || 'jsonl',
      command: server.command || '',
      args: server.args || [],
      env: server.env || {},
      url: server.url || '',
      headers: server.headers || {},
    });
  }

  private getClient(server: AgentMcpServerConfig) {
    if ((server.transport || 'stdio') !== 'stdio') {
      throw new Error('当前版本先支持 stdio MCP Server，HTTP/SSE MCP 将在后续接入。');
    }
    const id = String(server.id || server.name || '').trim();
    if (!id) throw new Error('MCP Server 缺少 id。');
    const signature = this.signature(server);
    const existing = this.clients.get(id);
    if (existing && existing.signature === signature) return existing.client;
    existing?.client.close();
    const client = new StdioMcpClient(server, this.log);
    this.clients.set(id, { signature, client });
    return client;
  }

  registerIpcHandlers() {
    ipcMain.handle('agent-mcp-list-tools', async (_event, params?: { server?: AgentMcpServerConfig }) => {
      try {
        const server = params?.server;
        if (!server) throw new Error('缺少 MCP Server 配置。');
        const result = await this.getClient(server).listTools();
        return { success: true, serverId: server.id, tools: result?.tools || [], raw: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('agent-mcp-call-tool', async (_event, params?: { server?: AgentMcpServerConfig; toolName?: string; arguments?: Record<string, any> }) => {
      try {
        const server = params?.server;
        const toolName = String(params?.toolName || '').trim();
        if (!server) throw new Error('缺少 MCP Server 配置。');
        if (!toolName) throw new Error('缺少 MCP toolName。');
        const result = await this.getClient(server).callTool(toolName, params?.arguments || {});
        return { success: true, serverId: server.id, toolName, result, raw: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('agent-mcp-list-resources', async (_event, params?: { server?: AgentMcpServerConfig }) => {
      try {
        const server = params?.server;
        if (!server) throw new Error('缺少 MCP Server 配置。');
        const result = await this.getClient(server).listResources();
        return { success: true, serverId: server.id, resources: result?.resources || [], raw: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('agent-mcp-read-resource', async (_event, params?: { server?: AgentMcpServerConfig; uri?: string }) => {
      try {
        const server = params?.server;
        const uri = String(params?.uri || '').trim();
        if (!server) throw new Error('缺少 MCP Server 配置。');
        if (!uri) throw new Error('缺少 MCP resource URI。');
        const result = await this.getClient(server).readResource(uri);
        return { success: true, serverId: server.id, uri, contents: result?.contents || [], raw: result };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });
  }

  closeAll() {
    this.clients.forEach(({ client }) => client.close());
    this.clients.clear();
  }
}
