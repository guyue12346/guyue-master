import type { TodoItem } from '../../../types';

export const parseLocalDateTimeString = (value: string, dateOnlyTime: 'start' | 'end' = 'end'): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T${dateOnlyTime === 'start' ? '00:00:00' : '23:59:00'}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}:00`;
  }

  const parsed = new Date(normalized).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;
  return undefined;
};

export const parseDueDateString = (value: any): number | undefined => {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return parseLocalDateTimeString(value, 'end');
};

export const resolveTodoSchedulePayload = (data: Record<string, any>): { updates: Partial<TodoItem>; error?: string } => {
  const hasKey = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  const explicitTimeType = typeof data.timeType === 'string' ? data.timeType : undefined;
  const startRaw = data.startDateTime ?? data.timeStart;
  const endRaw = data.endDateTime ?? data.timeEnd;
  const startDateTime = typeof startRaw === 'number'
    ? startRaw
    : (typeof startRaw === 'string' ? parseLocalDateTimeString(startRaw.trim(), 'start') : undefined);
  const endDateTime = typeof endRaw === 'number'
    ? endRaw
    : (typeof endRaw === 'string' ? parseLocalDateTimeString(endRaw.trim(), 'start') : undefined);
  const durationMinutes = Number(data.durationMinutes ?? data.duration);
  const hasRangeIntent = explicitTimeType === 'range'
    || hasKey('startDateTime')
    || hasKey('endDateTime')
    || hasKey('timeStart')
    || hasKey('timeEnd')
    || hasKey('durationMinutes')
    || hasKey('duration');

  if (hasRangeIntent) {
    if (!startDateTime) {
      return { updates: {}, error: '时间段事件缺少合法的开始时间 startDateTime。请使用 YYYY-MM-DDTHH:mm 格式。' };
    }
    const computedEnd = endDateTime
      ?? ((Number.isFinite(durationMinutes) && durationMinutes > 0)
        ? startDateTime + durationMinutes * 60_000
        : startDateTime + 60 * 60_000);
    if (computedEnd <= startDateTime) {
      return { updates: {}, error: '时间段事件的结束时间必须晚于开始时间。' };
    }
    return {
      updates: {
        timeType: 'range',
        timeStart: startDateTime,
        timeEnd: computedEnd,
        dueDate: undefined,
      },
    };
  }

  if (hasKey('dueDate') || explicitTimeType === 'point' || explicitTimeType === 'allday') {
    const rawDueDate = data.dueDate ?? data.startDateTime;
    const dueDate = parseDueDateString(rawDueDate);
    if (rawDueDate !== undefined && dueDate === undefined) {
      return { updates: {}, error: 'dueDate 格式不合法，请使用 YYYY-MM-DDTHH:mm。' };
    }
    if (dueDate !== undefined) {
      const dueString = typeof rawDueDate === 'string' ? rawDueDate.trim() : '';
      const inferredType: TodoItem['timeType'] =
        explicitTimeType === 'allday'
          ? 'allday'
          : (dueString && !dueString.includes('T') ? 'allday' : 'point');
      return {
        updates: {
          dueDate,
          timeType: inferredType,
          timeStart: undefined,
          timeEnd: undefined,
        },
      };
    }
  }

  return { updates: {} };
};

export const resolveTodoMatch = (
  todos: TodoItem[],
  args: Record<string, any>,
): { todo?: TodoItem; error?: string } => {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  const content = typeof args.content === 'string' ? args.content.trim() : '';

  if (id) {
    const todo = todos.find((item) => item.id === id);
    return todo ? { todo } : { error: `未找到 id 为「${id}」的待办事项。` };
  }

  if (!content) {
    return { error: '必须提供待办 id，或提供 content 进行精确匹配删除。' };
  }

  const exactMatches = todos.filter((item) => item.content === content);
  if (exactMatches.length === 1) return { todo: exactMatches[0] };
  if (exactMatches.length > 1) {
    return {
      error: `找到 ${exactMatches.length} 条同名待办「${content}」。请先 query_todos 获取准确 id 后再删除。候选 id：${exactMatches.map((item) => item.id).join('、')}`,
    };
  }

  const fuzzyMatches = todos.filter((item) => item.content.includes(content));
  if (fuzzyMatches.length === 1) return { todo: fuzzyMatches[0] };
  if (fuzzyMatches.length > 1) {
    return {
      error: `找到多条包含「${content}」的待办。请先 query_todos 获取准确 id 后再删除。候选：${fuzzyMatches.map((item) => `${item.content}(${item.id})`).join('、')}`,
    };
  }

  return { error: `未找到标题为「${content}」的待办事项。` };
};

export const normalizeTodoPayload = (data: Record<string, any>): Partial<TodoItem> => {
  const schedule = resolveTodoSchedulePayload(data);
  return {
    content: typeof data.content === 'string' && data.content.trim() ? data.content.trim() : '新事项',
    description: typeof data.description === 'string' ? data.description : undefined,
    isCompleted: false,
    priority: data.priority === 'high' || data.priority === 'low' ? data.priority : 'medium',
    category: typeof data.category === 'string' && data.category.trim() ? data.category.trim() : '未分类',
    ...schedule.updates,
  };
};
