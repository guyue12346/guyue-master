import type { ToolRegistration } from '../toolRegistry';

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
