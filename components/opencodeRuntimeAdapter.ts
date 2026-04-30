export type OpenCodeRuntimeStatus = 'idle' | 'starting' | 'running' | 'error';

export interface OpenCodeRuntimeSessionState {
  sessionId: string;
  terminalId: string | null;
  status: OpenCodeRuntimeStatus;
  error: string | null;
  startedAt: number | null;
}

export interface OpenCodeRuntimeSnapshot {
  sessions: Record<string, OpenCodeRuntimeSessionState>;
}

export interface OpenCodeRuntimeInput {
  data: string;
  delayMs?: number;
}

export interface StartOpenCodeRuntimeOptions {
  sessionId: string;
  command: string;
  postLaunchInputs?: OpenCodeRuntimeInput[];
}

export interface OpenCodePromptOptions {
  sessionId: string;
  streamId?: string;
  directory?: string;
  officialSessionId?: string | null;
  title?: string;
  providerId?: string;
  modelId?: string;
  argsText?: string;
  env?: Record<string, string>;
  prompt: string;
}

export interface OpenCodePromptResult {
  ok: boolean;
  error?: string;
  stdout?: string;
  stderr?: string;
  sessionId?: string | null;
  sessionTitle?: string | null;
}

type RuntimeListener = (snapshot: OpenCodeRuntimeSnapshot) => void;

const cloneSnapshot = (sessions: Map<string, OpenCodeRuntimeSessionState>): OpenCodeRuntimeSnapshot => ({
  sessions: Object.fromEntries(Array.from(sessions.entries()).map(([sessionId, state]) => [sessionId, { ...state }])),
});

const stripAnsi = (value: string) => value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, '');

export class OpenCodeRuntimeAdapter {
  private sessions = new Map<string, OpenCodeRuntimeSessionState>();
  private listeners = new Set<RuntimeListener>();
  private timers = new Map<string, number[]>();
  private terminalSessionIds = new Map<string, string>();
  private commandSentAt = new Map<string, number>();
  private disposeTerminalListener: (() => void) | null = null;

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): OpenCodeRuntimeSnapshot {
    return cloneSnapshot(this.sessions);
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) || null;
  }

  isRunning(sessionId: string) {
    return this.sessions.get(sessionId)?.status === 'running';
  }

  isStarting(sessionId: string) {
    return this.sessions.get(sessionId)?.status === 'starting';
  }

  startLogicalSession(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (existing?.status === 'running' || existing?.status === 'starting') {
      return existing;
    }

    const state: OpenCodeRuntimeSessionState = {
      sessionId,
      terminalId: null,
      status: 'running',
      error: null,
      startedAt: Date.now(),
    };
    this.setSession(state);
    return state;
  }

  async startSession(options: StartOpenCodeRuntimeOptions) {
    const existing = this.sessions.get(options.sessionId);
    if (existing?.status === 'running' || existing?.status === 'starting') {
      return existing;
    }

    this.setSession({
      sessionId: options.sessionId,
      terminalId: null,
      status: 'starting',
      error: null,
      startedAt: Date.now(),
    });

    const api = window.electronAPI;
    if (!api?.createTerminal || !api.writeTerminal) {
      const state = this.failSession(options.sessionId, '当前环境没有可用的 Electron 终端 API');
      return state;
    }

    try {
      const terminalId = await api.createTerminal({ cols: 120, rows: 40 });
      if (!terminalId) {
        throw new Error('创建后台终端失败');
      }

      const startedAt = Date.now();
      this.ensureTerminalListener();
      this.terminalSessionIds.set(terminalId, options.sessionId);
      this.setSession({
        sessionId: options.sessionId,
        terminalId,
        status: 'starting',
        error: null,
        startedAt,
      });

      this.scheduleWrite(options.sessionId, terminalId, `${options.command}\n`, 500, true);
      (options.postLaunchInputs || []).forEach(({ data, delayMs = 0 }) => {
        this.scheduleWrite(options.sessionId, terminalId, data, 650 + delayMs);
      });

      return await this.waitForStartup(options.sessionId, terminalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '后台 OpenCode 会话启动失败';
      return this.failSession(options.sessionId, message);
    }
  }

  stopSession(sessionId: string) {
    const state = this.sessions.get(sessionId);
    this.clearTimers(sessionId);

    if (state?.terminalId && window.electronAPI?.closeTerminal) {
      try {
        window.electronAPI.closeTerminal(state.terminalId);
      } catch {
        // Terminal close errors should not break the OpenCode UI.
      }
      this.terminalSessionIds.delete(state.terminalId);
    }

    this.commandSentAt.delete(sessionId);
    this.sessions.delete(sessionId);
    this.emit();
  }

  stopAll() {
    Array.from(this.sessions.keys()).forEach((sessionId) => this.stopSession(sessionId));
    this.disposeTerminalListener?.();
    this.disposeTerminalListener = null;
    this.terminalSessionIds.clear();
    this.commandSentAt.clear();
  }

  write(sessionId: string, data: string) {
    const state = this.sessions.get(sessionId);
    if (!state?.terminalId || state.status !== 'running') {
      throw new Error('OpenCode 后台会话未启动');
    }

    window.electronAPI?.writeTerminal?.(state.terminalId, data);
  }

  writeSteps(sessionId: string, steps: OpenCodeRuntimeInput[]) {
    const state = this.sessions.get(sessionId);
    if (!state?.terminalId || state.status !== 'running') {
      return false;
    }

    let elapsed = 0;
    steps.forEach(({ data, delayMs = 0 }) => {
      elapsed += delayMs;
      this.scheduleWrite(sessionId, state.terminalId as string, data, elapsed);
    });
    return true;
  }

  async sendPrompt(options: OpenCodePromptOptions): Promise<OpenCodePromptResult> {
    const api = window.electronAPI;
    if (!api?.sendOpenCodeMessage) {
      return {
        ok: false,
        error: '当前环境没有可用的 OpenCode 发送 API',
      };
    }

    return await api.sendOpenCodeMessage({
      streamId: options.streamId,
      directory: options.directory,
      officialSessionId: options.officialSessionId || undefined,
      title: options.title,
      providerId: options.providerId,
      modelId: options.modelId,
      argsText: options.argsText,
      env: options.env,
      prompt: options.prompt,
    });
  }

  removeMissingSessions(existingSessionIds: Set<string>) {
    Array.from(this.sessions.keys()).forEach((sessionId) => {
      if (!existingSessionIds.has(sessionId)) {
        this.stopSession(sessionId);
      }
    });
  }

  private setSession(state: OpenCodeRuntimeSessionState) {
    this.sessions.set(state.sessionId, state);
    this.emit();
  }

  private failSession(sessionId: string, error: string) {
    const current = this.sessions.get(sessionId);
    this.clearTimers(sessionId);
    this.commandSentAt.delete(sessionId);
    if (current?.terminalId) {
      this.terminalSessionIds.delete(current.terminalId);
      try {
        window.electronAPI?.closeTerminal?.(current.terminalId);
      } catch {
        // Ignore terminal cleanup failures after startup errors.
      }
    }
    const state: OpenCodeRuntimeSessionState = {
      sessionId,
      terminalId: null,
      status: 'error',
      error,
      startedAt: Date.now(),
    };
    this.setSession(state);
    return state;
  }

  private scheduleWrite(sessionId: string, terminalId: string, data: string, delayMs: number, markCommandSent = false) {
    const timer = window.setTimeout(() => {
      const state = this.sessions.get(sessionId);
      if (state?.terminalId !== terminalId || (state.status !== 'running' && state.status !== 'starting')) return;
      if (markCommandSent) {
        this.commandSentAt.set(sessionId, Date.now());
      }
      window.electronAPI?.writeTerminal?.(terminalId, data);
    }, delayMs);

    this.timers.set(sessionId, [...(this.timers.get(sessionId) || []), timer]);
  }

  private clearTimers(sessionId: string) {
    (this.timers.get(sessionId) || []).forEach((timer) => window.clearTimeout(timer));
    this.timers.delete(sessionId);
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private ensureTerminalListener() {
    if (this.disposeTerminalListener || !window.electronAPI?.onTerminalData) return;

    this.disposeTerminalListener = window.electronAPI.onTerminalData((_event, payload) => {
      const sessionId = this.terminalSessionIds.get(payload.id);
      if (!sessionId) return;

      const state = this.sessions.get(sessionId);
      if (!state || state.status !== 'starting') return;

      const sentAt = this.commandSentAt.get(sessionId);
      if (!sentAt) return;

      const text = stripAnsi(payload.data || '');
      if (!text.trim()) return;

      const elapsed = Date.now() - sentAt;
      const markRunning = () => {
        const latest = this.sessions.get(sessionId);
        if (!latest || latest.terminalId !== payload.id || latest.status !== 'starting') return;
        this.setSession({
          ...latest,
          status: 'running',
          error: null,
        });
      };

      if (/OpenCode|opencode|Initialize Project|LSP Configuration|press enter|ctrl\+/i.test(text) || elapsed >= 900) {
        markRunning();
      } else {
        const delay = Math.max(0, 900 - elapsed);
        const timer = window.setTimeout(markRunning, delay);
        this.timers.set(sessionId, [...(this.timers.get(sessionId) || []), timer]);
      }
    });
  }

  private async waitForStartup(sessionId: string, terminalId: string) {
    return await new Promise<OpenCodeRuntimeSessionState>((resolve) => {
      const startedAt = Date.now();
      const poll = window.setInterval(() => {
        const state = this.sessions.get(sessionId);
        if (!state || state.terminalId !== terminalId) {
          window.clearInterval(poll);
          resolve(state || this.failSession(sessionId, '后台 OpenCode 会话已被关闭'));
          return;
        }

        if (state.status === 'running' || state.status === 'error') {
          window.clearInterval(poll);
          resolve(state);
          return;
        }

        if (Date.now() - startedAt > 15000) {
          window.clearInterval(poll);
          resolve(this.failSession(sessionId, '后台终端已创建，但 15 秒内没有收到 OpenCode 启动输出'));
        }
      }, 120);
    });
  }
}
