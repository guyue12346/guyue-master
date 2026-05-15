export interface GuyueRuntimeContext {
  source?: string;
  requestId?: string;
}

export interface GuyueModuleEvent<T = any> {
  type: string;
  payload?: T;
  source?: string;
  timestamp: number;
}

export type GuyueModuleEventHandler<T = any> = (event: GuyueModuleEvent<T>) => void | Promise<void>;
export type GuyueCommandHandler<TInput = any, TOutput = any> = (
  payload: TInput,
  context: GuyueRuntimeContext,
) => TOutput | Promise<TOutput>;

export interface GuyueCommandRegistration {
  name: string;
  owner: string;
  description?: string;
  handler: GuyueCommandHandler;
}

const MODULE_RUNTIME_EVENT = 'guyue-module-runtime-change';

const notifyRuntimeChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MODULE_RUNTIME_EVENT));
  }
};

export class GuyueEventBus {
  private handlers = new Map<string, Set<GuyueModuleEventHandler>>();

  on<T = any>(type: string, handler: GuyueModuleEventHandler<T>) {
    const normalizedType = type.trim();
    if (!normalizedType) return () => {};
    const bucket = this.handlers.get(normalizedType) || new Set<GuyueModuleEventHandler>();
    bucket.add(handler as GuyueModuleEventHandler);
    this.handlers.set(normalizedType, bucket);
    notifyRuntimeChange();
    return () => {
      bucket.delete(handler as GuyueModuleEventHandler);
      if (bucket.size === 0) this.handlers.delete(normalizedType);
      notifyRuntimeChange();
    };
  }

  async emit<T = any>(type: string, payload?: T, context: GuyueRuntimeContext = {}) {
    const event: GuyueModuleEvent<T> = {
      type,
      payload,
      source: context.source,
      timestamp: Date.now(),
    };
    const exactHandlers = Array.from(this.handlers.get(type) || []);
    const wildcardHandlers = Array.from(this.handlers.get('*') || []);
    await Promise.all([...exactHandlers, ...wildcardHandlers].map(handler => handler(event)));
    return event;
  }

  listSubscriptions() {
    return Array.from(this.handlers.entries()).map(([type, handlers]) => ({
      type,
      count: handlers.size,
    }));
  }
}

export class GuyueCommandBus {
  private commands = new Map<string, GuyueCommandRegistration>();

  register(registration: GuyueCommandRegistration) {
    const name = registration.name.trim();
    if (!name) throw new Error('命令名称不能为空');
    if (this.commands.has(name)) throw new Error(`命令已注册：${name}`);
    this.commands.set(name, { ...registration, name });
    notifyRuntimeChange();
    return () => {
      const existing = this.commands.get(name);
      if (existing?.owner === registration.owner) {
        this.commands.delete(name);
        notifyRuntimeChange();
      }
    };
  }

  unregisterByOwner(owner: string) {
    Array.from(this.commands.entries()).forEach(([name, registration]) => {
      if (registration.owner === owner) this.commands.delete(name);
    });
    notifyRuntimeChange();
  }

  async execute<TInput = any, TOutput = any>(
    name: string,
    payload?: TInput,
    context: GuyueRuntimeContext = {},
  ): Promise<TOutput> {
    const registration = this.commands.get(name);
    if (!registration) throw new Error(`未找到命令：${name}`);
    return registration.handler(payload, context) as Promise<TOutput>;
  }

  listCommands() {
    return Array.from(this.commands.values()).map(({ name, owner, description }) => ({
      name,
      owner,
      description,
    }));
  }
}

export const guyueEventBus = new GuyueEventBus();
export const guyueCommandBus = new GuyueCommandBus();
export const GUYUE_MODULE_RUNTIME_EVENT = MODULE_RUNTIME_EVENT;
