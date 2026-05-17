import type { ToolRegistration } from '../toolRegistry';
import { queryAppUsageGuide } from '../appUsageGuide';

const formatOffset = (date: Date) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
};

const getZonedDateParts = (timeZone: string, date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
};

const getZonedDateISO = (timeZone: string, offsetDays = 0) => {
  const { year, month, day } = getZonedDateParts(timeZone);
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
};

export const SYSTEM_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_app_usage_guide',
    module: 'system',
    origin: 'builtin',
    exposure: 'direct',
    permissionless: true,
    tool: {
      name: 'query_app_usage_guide',
      description: '查询 Guyue Master 内置使用指南。用户询问本 App、某个模块、Agent、Skills/MCP、RAG、数据中心、学习空间、题库等怎么用、功能说明、配置方法或操作指南时调用；这是本地文档查询，不需要联网，也不需要权限中心授权。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '用户关于 App 使用方法、模块功能、操作流程的原始问题。' },
          section: { type: 'string', description: '可选。指定章节 id 或标题，例如 agent、skills-mcp-prompts、data-center、files-rag。' },
          limit: { type: 'number', description: '最多返回章节数，默认 5。' },
          includeFullGuide: { type: 'boolean', description: '是否返回完整指南。用户要求完整/全部功能时设为 true。' },
        },
      },
    },
    execute: async (args) => queryAppUsageGuide({
      query: typeof args.query === 'string' ? args.query : '',
      section: typeof args.section === 'string' ? args.section : '',
      limit: args.limit,
      includeFullGuide: Boolean(args.includeFullGuide),
    }),
  },
  {
    name: 'get_current_time',
    module: 'system',
    permission: { module: 'system', action: 'read' },
    tool: {
      name: 'get_current_time',
      description: '获取当前电脑的实时本地时间、时区、UTC 偏移和时间戳。处理今天、明天、昨天、几小时后、日程、提醒、日志时间等相对时间问题时应优先调用。',
      inputSchema: {
        type: 'object',
        properties: {
          locale: { type: 'string', description: '可选，格式化语言，例如 zh-CN、en-US。不传则使用系统默认语言。' },
          timeZone: { type: 'string', description: '可选，指定 IANA 时区，例如 Asia/Shanghai。不传则使用当前电脑时区。' },
        },
      },
    },
    execute: async (args) => {
      const now = new Date();
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      const locale = typeof args.locale === 'string' && args.locale.trim()
        ? args.locale.trim()
        : resolved.locale || 'zh-CN';
      const timeZone = typeof args.timeZone === 'string' && args.timeZone.trim()
        ? args.timeZone.trim()
        : resolved.timeZone;

      const formatter = new Intl.DateTimeFormat(locale, {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      return {
        success: true,
        now: now.toISOString(),
        epochMs: now.getTime(),
        epochSeconds: Math.floor(now.getTime() / 1000),
        locale,
        timeZone,
        utcOffset: formatOffset(now),
        formatted: formatter.format(now),
        dateISO: getZonedDateISO(timeZone, 0),
        todayISO: getZonedDateISO(timeZone, 0),
        tomorrowISO: getZonedDateISO(timeZone, 1),
        yesterdayISO: getZonedDateISO(timeZone, -1),
        date: new Intl.DateTimeFormat(locale, {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now),
        time: new Intl.DateTimeFormat(locale, {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now),
      };
    },
  },
  {
    name: 'delegate_complex_task',
    module: 'system',
    permission: { module: 'system', action: 'read' },
    tool: {
      name: 'delegate_complex_task',
      description: '把复杂写作、长文生成、深度分析、复杂推理或结构化方案委托给设置中配置的“复杂需求处理模型”。适合论文、报告、长方案、复杂解释、综合分析等任务。',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '需要复杂模型完成的完整任务描述。' },
          context: { type: 'string', description: '可选。当前对话、工具结果或背景资料。' },
          outputFormat: { type: 'string', description: '可选。期望输出格式，例如 Markdown、论文结构、表格、分点方案。' },
          constraints: { type: 'string', description: '可选。字数、语气、语言、引用、禁止事项等约束。' },
        },
        required: ['task'],
      },
    },
    execute: async (args, ctx) => {
      if (!ctx.executeComplexTask) {
        return { success: false, error: '复杂需求处理模型执行器未配置。' };
      }
      const task = typeof args.task === 'string' ? args.task.trim() : '';
      if (!task) return { success: false, error: '复杂任务描述不能为空。' };
      return ctx.executeComplexTask({ ...args, task });
    },
  },
];
