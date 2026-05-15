import type { ToolRegistration } from '../toolRegistry';

const formatOffset = (date: Date) => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
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
];
