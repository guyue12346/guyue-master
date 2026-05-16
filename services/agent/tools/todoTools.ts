import type { RecurringEvent, SubTask, TodoItem } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import { normalizeTodoPayload, resolveTodoMatch, resolveTodoSchedulePayload } from './todoHelpers';

const RESERVED_TODO_CATEGORY_NAMES = new Set(['全部', '默认', '未分类', '__all__']);

const getAvailableTodoCategories = (categories: string[]) =>
  categories
    .map(category => category.trim())
    .filter(category => category && !RESERVED_TODO_CATEGORY_NAMES.has(category));

export const TODO_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'create_todo',
      module: 'todo',
      tool: {
        name: 'create_todo',
        description: '创建一个新的待办事项。创建前必须先 query_todos 获取可用分类列表（availableCategories），category 必须是其中之一，不可自行编造。普通时点事项用 dueDate；时间段日程必须使用 startDateTime + endDateTime（或 durationMinutes）创建 range 事件。',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '待办事项标题或内容' },
            description: { type: 'string', description: '补充说明' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级，必填：high=高/紧急，medium=中/普通，low=低/不急。' },
            category: { type: 'string', description: '分类名称，必须是系统已有分类，工具执行时会校验。若已有分类均不合适，请先调用 create_category 创建新分类。' },
            dueDate: { type: 'string', description: '单个时间点或全天事项时间，格式 YYYY-MM-DDTHH:mm，如 "2026-03-15T14:00"。若仅传日期且想视为全天，可传 timeType="allday"。' },
            timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '时间类型。时间段日程请传 range。' },
            startDateTime: { type: 'string', description: '时间段事件开始时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T15:00"。' },
            endDateTime: { type: 'string', description: '时间段事件结束时间，格式 YYYY-MM-DDTHH:mm，例如 "2026-03-15T17:00"。' },
            durationMinutes: { type: 'number', description: '时间段事件时长（分钟）。若未提供 endDateTime，可用它配合 startDateTime 自动计算结束时间。' },
          },
          required: ['content', 'category', 'priority'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办创建未授权。请在权限面板中开启「待办事项」写入权限。' };
        const availableCategories = getAvailableTodoCategories(ctx.todoCategories);
        const catName = typeof args.category === 'string' ? args.category.trim() : '';
        if (!availableCategories.length) {
          return { success: false, error: '当前没有可用待办分类。请先创建一个待办分类后再创建事项。' };
        }
        if (!catName || RESERVED_TODO_CATEGORY_NAMES.has(catName)) {
          return { success: false, error: `创建待办必须指定一个已有分类，不能使用“全部/默认/未分类”。当前可用分类：${availableCategories.join('、')}。` };
        }
        if (!availableCategories.includes(catName)) {
          return { success: false, error: `分类「${catName}」不存在。当前可用分类：${availableCategories.join('、')}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
        }
        if (!['high', 'medium', 'low'].includes(args.priority)) {
          return { success: false, error: '创建待办必须指定优先级 priority：high（高/紧急）、medium（中/普通）或 low（低/不急）。' };
        }
        const schedule = resolveTodoSchedulePayload(args);
        if (schedule.error) {
          return { success: false, error: schedule.error };
        }
        const todoData = normalizeTodoPayload(args);
        todoData.id = crypto.randomUUID();
        ctx.onCreateTodo(todoData);
        // 同步更新 ctx.todos 以便后续 create_subtask 能立即找到
        ctx.todos.push({
          id: todoData.id,
          content: todoData.content || '新事项',
          description: todoData.description,
          isCompleted: false,
          priority: todoData.priority || 'medium',
          category: todoData.category || catName,
          dueDate: todoData.dueDate,
          timeType: todoData.timeType,
          timeStart: todoData.timeStart,
          timeEnd: todoData.timeEnd,
          createdAt: Date.now(),
        } as TodoItem);
        return { success: true, message: '待办事项创建成功', todo: { id: todoData.id, ...todoData } };
      },
    },
  {
      name: 'query_todos',
      module: 'todo',
      tool: {
        name: 'query_todos',
        description: '查询当前所有待办事项及可用分类列表。创建/修改待办前必须先调用此工具获取可用分类名称，不可自行编造分类。',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['all', 'pending', 'completed'], description: '筛选状态：all=全部，pending=未完成，completed=已完成。默认 pending。' },
            limit: { type: 'number', description: '最多返回条数，默认 20，最大 50。' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请点击 🔒 按钮，在权限面板中开启「待办事项」读取权限。' };
        const status = args.status || 'pending';
        const limit = Math.min(Number(args.limit) || 20, 50);
        let items = ctx.todos;
        if (status === 'pending') items = items.filter(t => !t.isCompleted);
        else if (status === 'completed') items = items.filter(t => t.isCompleted);
        const result = items.slice(0, limit).map(t => ({
          id: t.id,
          content: t.content,
          priority: t.priority,
          category: t.category,
          isCompleted: t.isCompleted,
          dueDate: t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null,
          timeType: t.timeType || (t.dueDate ? 'allday' : null),
          timeStart: t.timeStart ? new Date(t.timeStart).toLocaleString('zh-CN') : null,
          timeEnd: t.timeEnd ? new Date(t.timeEnd).toLocaleString('zh-CN') : null,
          schedule: t.timeType === 'range' && t.timeStart
            ? `${new Date(t.timeStart).toLocaleString('zh-CN')} ～ ${new Date(t.timeEnd || (t.timeStart + 3600000)).toLocaleString('zh-CN')}`
            : (t.dueDate ? new Date(t.dueDate).toLocaleString('zh-CN') : null),
          description: t.description || null,
          subtaskCount: t.subtasks?.length || 0,
          subtaskCompleted: t.subtasks?.filter(s => s.isCompleted).length || 0,
        }));
        return { success: true, total: items.length, returned: result.length, availableCategories: getAvailableTodoCategories(ctx.todoCategories), todos: result };
      },
    },
  {
      name: 'update_todo',
      module: 'todo',
      tool: {
        name: 'update_todo',
        description: '修改一条已有的待办事项。可修改内容、优先级、分类、截止日期、完成状态等字段。需要先 query_todos 获取 id 和可用分类列表。category 必须是已有分类名称，不可自行编造。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '待办的 id（从 query_todos 结果中获取）' },
            content: { type: 'string', description: '新的内容标题（可选）' },
            description: { type: 'string', description: '新的描述（可选）' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '新的优先级（可选）' },
            category: { type: 'string', description: '新的分类名称（必须是 query_todos 返回的 availableCategories 中的值，不可自行编造）' },
            dueDate: { type: 'string', description: '新的单点时间 YYYY-MM-DDTHH:mm（可选）' },
            timeType: { type: 'string', enum: ['point', 'range', 'allday'], description: '新的时间类型（可选）' },
            startDateTime: { type: 'string', description: '新的时间段开始时间 YYYY-MM-DDTHH:mm（可选）' },
            endDateTime: { type: 'string', description: '新的时间段结束时间 YYYY-MM-DDTHH:mm（可选）' },
            durationMinutes: { type: 'number', description: '新的时长分钟（可选，配合 startDateTime 使用）' },
            isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
          },
          required: ['id'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请在权限面板中开启「待办事项」写入权限。' };
        const todo = ctx.todos.find(t => t.id === args.id);
        if (!todo) return { success: false, error: `未找到 id 为「${args.id}」的待办事项。` };
        const updates: Partial<TodoItem> = {};
        if (typeof args.content === 'string') updates.content = args.content.trim();
        if (typeof args.description === 'string') updates.description = args.description;
        if (['high', 'medium', 'low'].includes(args.priority)) updates.priority = args.priority;
        if (typeof args.category === 'string') {
          const availableCategories = getAvailableTodoCategories(ctx.todoCategories);
          const catName = args.category.trim();
          if (!catName || RESERVED_TODO_CATEGORY_NAMES.has(catName)) {
            return { success: false, error: `分类名称不能为空，也不能使用“全部/默认/未分类”。当前可用分类：${availableCategories.join('、') || '（暂无）'}。` };
          }
          if (!availableCategories.includes(catName)) {
            return { success: false, error: `分类「${catName}」不存在。当前可用分类：${availableCategories.join('、') || '（暂无）'}。请从已有分类中选择，或先调用 create_category（module: "todo"）创建新分类后再试。` };
          }
          updates.category = catName;
        }
        const schedule = resolveTodoSchedulePayload(args);
        if (schedule.error) {
          return { success: false, error: schedule.error };
        }
        Object.assign(updates, schedule.updates);
        if (typeof args.isCompleted === 'boolean') {
          updates.isCompleted = args.isCompleted;
          if (args.isCompleted) updates.completedAt = Date.now();
        }
        ctx.onUpdateTodo(args.id, updates);
        return { success: true, message: `待办「${todo.content}」已更新`, updated: updates };
      },
    },
  {
      name: 'delete_todo',
      module: 'todo',
      tool: {
        name: 'delete_todo',
        description: '删除一条待办事项。优先用 id 删除；若没有 id，可传 content 做精确匹配。若重名项超过一条，工具会要求先 query_todos 获取 id。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '待办的 id' },
            content: { type: 'string', description: '待办标题。仅在没有 id 时使用，会先精确匹配。' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办删除未授权。请在权限面板中开启「待办事项」写入权限。' };
        const match = resolveTodoMatch(ctx.todos, args);
        if (!match.todo) return { success: false, error: match.error || '未找到待办事项。' };
        ctx.onDeleteTodo(match.todo.id, { skipConfirm: true });
        return { success: true, message: `待办「${match.todo.content}」已删除` };
      },
    },
  {
      name: 'query_subtasks',
      module: 'todo',
      tool: {
        name: 'query_subtasks',
        description: '查询某条待办事项的所有子任务。需要先 query_todos 获取待办 id。',
        inputSchema: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: '待办的 id' },
          },
          required: ['todoId'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.read) return { success: false, error: '待办查询未授权。请开启「待办事项」读取权限。' };
        const todo = ctx.todos.find(t => t.id === args.todoId);
        if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
        const subtasks = todo.subtasks || [];
        return {
          success: true,
          todoId: todo.id,
          todoContent: todo.content,
          total: subtasks.length,
          completed: subtasks.filter(s => s.isCompleted).length,
          subtasks: subtasks.map(s => ({ id: s.id, content: s.content, isCompleted: s.isCompleted })),
        };
      },
    },
  {
      name: 'create_subtask',
      module: 'todo',
      tool: {
        name: 'create_subtask',
        description: '为某条待办事项添加一个或多个子任务。需要同时创建多个子任务时，请将所有内容一次性放入 contents 数组，而不是多次调用此工具（多次调用会因状态竞争导致只保留最后一个）。',
        inputSchema: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: '待办的 id' },
            contents: { type: 'array', items: { type: 'string' }, description: '子任务内容列表，支持一次传入多个，如 ["阅读", "写作"]' },
          },
          required: ['todoId', 'contents'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
        const todo = ctx.todos.find(t => t.id === args.todoId);
        if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
        const rawList: string[] = Array.isArray(args.contents)
          ? args.contents.map((c: unknown) => String(c).trim()).filter(Boolean)
          : (typeof args.contents === 'string' ? [String(args.contents).trim()] : []);
        if (rawList.length === 0) return { success: false, error: 'contents 不能为空。' };
        const newSubtasks: SubTask[] = rawList.map(content => ({
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          content,
          isCompleted: false,
        }));
        const subtasks = [...(todo.subtasks || []), ...newSubtasks];
        ctx.onUpdateTodo(args.todoId, { subtasks });
        const names = newSubtasks.map(s => `「${s.content}」`).join('、');
        return { success: true, message: `已为「${todo.content}」添加 ${newSubtasks.length} 个子任务：${names}`, subtasks: newSubtasks };
      },
    },
  {
      name: 'update_subtask',
      module: 'todo',
      tool: {
        name: 'update_subtask',
        description: '修改某条待办事项的子任务（内容或完成状态）。需要先 query_subtasks 获取子任务 id。',
        inputSchema: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: '待办的 id' },
            subtaskId: { type: 'string', description: '子任务的 id' },
            content: { type: 'string', description: '新的子任务内容（可选）' },
            isCompleted: { type: 'boolean', description: '是否已完成（可选）' },
          },
          required: ['todoId', 'subtaskId'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
        const todo = ctx.todos.find(t => t.id === args.todoId);
        if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
        const subtasks = [...(todo.subtasks || [])];
        const idx = subtasks.findIndex(s => s.id === args.subtaskId);
        if (idx === -1) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
        if (typeof args.content === 'string') subtasks[idx] = { ...subtasks[idx], content: args.content.trim() };
        if (typeof args.isCompleted === 'boolean') subtasks[idx] = { ...subtasks[idx], isCompleted: args.isCompleted };
        ctx.onUpdateTodo(args.todoId, { subtasks });
        return { success: true, message: `子任务「${subtasks[idx].content}」已更新`, subtask: subtasks[idx] };
      },
    },
  {
      name: 'delete_subtask',
      module: 'todo',
      tool: {
        name: 'delete_subtask',
        description: '删除某条待办事项的子任务。需要先 query_subtasks 获取子任务 id。',
        inputSchema: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: '待办的 id' },
            subtaskId: { type: 'string', description: '子任务的 id' },
          },
          required: ['todoId', 'subtaskId'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '待办修改未授权。请开启「待办事项」写入权限。' };
        const todo = ctx.todos.find(t => t.id === args.todoId);
        if (!todo) return { success: false, error: `未找到 id 为「${args.todoId}」的待办事项。` };
        const subtask = (todo.subtasks || []).find(s => s.id === args.subtaskId);
        if (!subtask) return { success: false, error: `未找到 id 为「${args.subtaskId}」的子任务。` };
        const subtasks = (todo.subtasks || []).filter(s => s.id !== args.subtaskId);
        ctx.onUpdateTodo(args.todoId, { subtasks });
        return { success: true, message: `子任务「${subtask.content}」已删除` };
      },
    },
  {
      name: 'query_recurring_events',
      module: 'todo',
      tool: {
        name: 'query_recurring_events',
        description: '查询所有重复事件（循环日程），返回标题、分类及其唯一 ID、重复规则、时间等信息。创建重复事件前必须先调用此工具获取分类 ID。',
        inputSchema: {
          type: 'object',
          properties: {
            categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 availableCategories[].id 获取）。不传返回全部。' },
            onlyActive: { type: 'boolean', description: '是否只返回已激活的事件，默认 true' },
            limit: { type: 'number', description: '最多返回条数，默认 30' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.read) return { success: false, error: '重复事件查询未授权。请在权限面板中开启「待办事项」读取权限。' };
        let items = ctx.recurringEvents;
        const onlyActive = args.onlyActive !== false;
        if (onlyActive) items = items.filter(e => e.isActive);
        if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
          const catId = args.categoryId.trim();
          const matchedCat = ctx.recurringCategories.find(c => c.id === catId);
          if (matchedCat) items = items.filter(e => e.category === matchedCat.name);
        }
        const limit = Math.min(Number(args.limit) || 30, 50);
        const WEEKDAY = ['日','一','二','三','四','五','六'];
        const result = items.slice(0, limit).map(e => {
          let recurrenceDesc = '';
          if (e.interval === 1) {
            recurrenceDesc = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }[e.recurrence] || e.recurrence;
          } else {
            const unit = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }[e.recurrence] || e.recurrence;
            recurrenceDesc = `每 ${e.interval} ${unit}`;
          }
          if (e.recurrence === 'weekly' && e.weekDays?.length) {
            recurrenceDesc += `（${e.weekDays.sort((a,b)=>a-b).map(d=>'周'+WEEKDAY[d]).join('、')}）`;
          }
          const timeDesc = e.allDay ? '全天' : (() => {
            const h = Math.floor((e.startTime??0)/60), m = (e.startTime??0)%60;
            const dur = e.duration ?? 60;
            const eh = Math.floor(((e.startTime??0)+dur)/60) % 24, em = ((e.startTime??0)+dur) % 60;
            return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} – ${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
          })();
          return {
            id: e.id,
            title: e.title,
            category: e.category,
            recurrence: recurrenceDesc,
            time: timeDesc,
            startDate: new Date(e.startDate).toLocaleDateString('zh-CN'),
            endDate: e.endDate ? new Date(e.endDate).toLocaleDateString('zh-CN') : null,
            isActive: e.isActive,
            description: e.description || null,
          };
        });
        const availableCats = ctx.recurringCategories.map(c => ({ id: c.id, name: c.name }));
        return { success: true, total: items.length, returned: result.length, availableCategories: availableCats, recurringEvents: result };
      },
    },
  {
      name: 'create_recurring_event',
      module: 'todo',
      tool: {
        name: 'create_recurring_event',
        description: '创建一个重复事件（循环日程）。调用前必须先 query_recurring_events 获取分类列表及其 ID，用 categoryId 指定分类。若已有分类均不合适，请先调用 create_recurring_category 创建新分类。',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '事件标题，如"高数课"、"周例会"' },
            description: { type: 'string', description: '备注描述（可选）' },
            categoryId: { type: 'string', description: '分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取）。' },
            recurrence: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'], description: '重复类型：daily=每天，weekly=每周，monthly=每月，yearly=每年' },
            interval: { type: 'number', description: '重复间隔，如 interval=2 配合 weekly 表示每两周。默认 1。' },
            weekDays: { type: 'array', items: { type: 'number', minimum: 0, maximum: 6 }, description: '每周重复时指定星期几（0=周日，1=周一…6=周六）。仅在 recurrence="weekly" 时生效。' },
            startDate: { type: 'string', description: '重复开始日期，格式 YYYY-MM-DD，默认今天' },
            endDate: { type: 'string', description: '重复结束日期，格式 YYYY-MM-DD（可选，不传表示永久）' },
            allDay: { type: 'boolean', description: '是否为全天事件。默认 false。' },
            startTime: { type: 'string', description: '开始时间，格式 HH:mm，如 "09:00"。allDay=false 时有效。' },
            duration: { type: 'number', description: '时长（分钟），如 90 表示 1.5 小时。allDay=false 时有效，默认 60。' },
            color: { type: 'string', description: '事件颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）（可选）' },
          },
          required: ['title', 'categoryId', 'recurrence'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件创建未授权。请在权限面板中开启「待办事项」写入权限。' };
        const title = (typeof args.title === 'string' ? args.title.trim() : '') || '新重复事件';
        const recurrence = (['daily','weekly','monthly','yearly'].includes(args.recurrence) ? args.recurrence : 'weekly') as RecurringEvent['recurrence'];
        const interval = Math.max(Number(args.interval) || 1, 1);

        // 日期解析
        const parseDate = (s: string | undefined) => {
          if (!s) return undefined;
          const ts = new Date(s + 'T00:00:00').getTime();
          return isNaN(ts) ? undefined : ts;
        };
        const startDate = parseDate(args.startDate) ?? Date.now();
        const endDate = parseDate(args.endDate);

        // 时间解析
        const allDay = args.allDay === true;
        let startTimeMin: number | undefined;
        let duration: number | undefined;
        if (!allDay && typeof args.startTime === 'string') {
          const [h, m] = args.startTime.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) startTimeMin = h * 60 + m;
          duration = Math.max(Number(args.duration) || 60, 15);
        }

        // 分类匹配：通过 ID 精确查找
        const catId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
        const matchedCat = catId ? ctx.recurringCategories.find(c => c.id === catId) : null;
        if (!catId) {
          const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `创建重复事件必须指定已有分类 ID。当前可用分类：${available}。请先调用 query_recurring_events 获取分类 ID。` };
        }
        if (catId && !matchedCat) {
          const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
          return { success: false, error: `分类 ID「${catId}」不存在。当前可用分类：${available}。请先调用 query_recurring_events 获取正确的分类 ID。` };
        }
        const categoryValue = matchedCat.name;

        const weekDays = recurrence === 'weekly' && Array.isArray(args.weekDays) && args.weekDays.length > 0
          ? args.weekDays.filter((d: number) => d >= 0 && d <= 6)
          : undefined;

        const eventData: Partial<RecurringEvent> = {
          title,
          description: typeof args.description === 'string' ? args.description.trim() || undefined : undefined,
          category: categoryValue,
          recurrence,
          interval,
          weekDays,
          startDate,
          endDate,
          allDay,
          startTime: startTimeMin,
          duration,
          color: typeof args.color === 'string' ? args.color : undefined,
        };
        ctx.onCreateRecurring(eventData);
        return { success: true, message: `重复事件「${title}」已创建（${recurrence}，分类：${categoryValue}）`, event: eventData };
      },
    },
  {
      name: 'update_recurring_event',
      module: 'todo',
      tool: {
        name: 'update_recurring_event',
        description: '修改一个已有的重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可；都知道时优先传 id。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '重复事件的 id（从 query_recurring_events 获取，与 eventTitle 二选一）' },
            eventTitle: { type: 'string', description: '要修改的事件当前标题（精确匹配，与 id 二选一）' },
            title: { type: 'string', description: '新标题（可选）' },
            description: { type: 'string', description: '新描述（可选）' },
            categoryId: { type: 'string', description: '新分类的唯一 ID（从 query_recurring_events 返回的 availableCategories[].id 获取，可选）' },
            isActive: { type: 'boolean', description: '是否激活（可选）' },
            endDate: { type: 'string', description: '新的结束日期 YYYY-MM-DD（可选）' },
            weekDays: { type: 'array', items: { type: 'number' }, description: '新的每周星期几（仅 weekly，可选）' },
            startTime: { type: 'string', description: '新的开始时间 HH:mm（可选）' },
            duration: { type: 'number', description: '新的时长分钟（可选）' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件修改未授权。请在权限面板中开启「待办事项」写入权限。' };
        const event = args.id
          ? ctx.recurringEvents.find(e => e.id === args.id)
          : ctx.recurringEvents.find(e => e.title === args.eventTitle);
        if (!event) {
          if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
          const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
          return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
        }
        const updates: Partial<RecurringEvent> = {};
        if (typeof args.title === 'string') updates.title = args.title.trim();
        if (typeof args.description === 'string') updates.description = args.description.trim() || undefined;
        if (typeof args.isActive === 'boolean') updates.isActive = args.isActive;
        if (typeof args.categoryId === 'string') {
          const matched = ctx.recurringCategories.find(c => c.id === args.categoryId.trim());
          if (!matched) {
            const available = ctx.recurringCategories.map(c => `${c.name}(${c.id})`).join('、') || '（暂无）';
            return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。` };
          }
          updates.category = matched.name;
        }
        if (typeof args.endDate === 'string') {
          const ts = new Date(args.endDate + 'T23:59:59').getTime();
          if (!isNaN(ts)) updates.endDate = ts;
        }
        if (Array.isArray(args.weekDays)) updates.weekDays = args.weekDays.filter((d:number) => d>=0 && d<=6);
        if (typeof args.startTime === 'string') {
          const [h, m] = args.startTime.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) updates.startTime = h * 60 + m;
        }
        if (typeof args.duration === 'number') updates.duration = Math.max(args.duration, 15);
        ctx.onUpdateRecurring(event.id, updates);
        return { success: true, message: `重复事件「${event.title}」已更新`, updated: updates };
      },
    },
  {
      name: 'delete_recurring_event',
      module: 'todo',
      tool: {
        name: 'delete_recurring_event',
        description: '删除一个重复事件。可通过 id 或 eventTitle（事件当前标题）定位，两者提供其一即可。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '重复事件的 id（与 eventTitle 二选一）' },
            eventTitle: { type: 'string', description: '要删除的事件标题（精确匹配，与 id 二选一）' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件删除未授权。请在权限面板中开启「待办事项」写入权限。' };
        const event = args.id
          ? ctx.recurringEvents.find(e => e.id === args.id)
          : ctx.recurringEvents.find(e => e.title === args.eventTitle);
        if (!event) {
          if (args.id) return { success: false, error: `未找到 id 为「${args.id}」的重复事件。` };
          const titles = ctx.recurringEvents.map(e => e.title).join('、') || '（暂无）';
          return { success: false, error: `未找到标题为「${args.eventTitle}」的重复事件。当前所有事件：${titles}` };
        }
        ctx.onDeleteRecurring(event.id);
        return { success: true, message: `重复事件「${event.title}」已删除` };
      },
    },
  {
      name: 'create_recurring_category',
      module: 'todo',
      tool: {
        name: 'create_recurring_category',
        description: '创建一个新的重复事件分类。当已有分类（课程、工作、健身、生活等）都不适合时，先调用此工具创建新分类，再调用 create_recurring_event 使用该分类名称。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '分类名称，如"学习"、"医疗"、"社交"' },
            color: { type: 'string', description: '分类颜色 hex 值，如 "#3b82f6"（蓝）、"#8b5cf6"（紫）、"#22c55e"（绿）、"#ef4444"（红）、"#f97316"（橙）、"#ec4899"（粉）。不传则自动分配。' },
          },
          required: ['name'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '重复事件分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
        const name = typeof args.name === 'string' ? args.name.trim() : '';
        if (!name || RESERVED_TODO_CATEGORY_NAMES.has(name)) return { success: false, error: '分类名称不能为空，也不能使用“全部/默认/未分类”。' };
        if (ctx.recurringCategories.find(c => c.name === name)) {
          return { success: false, error: `分类「${name}」已存在，无需重复创建。` };
        }
        const PRESET_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#ef4444','#14b8a6','#f59e0b'];
        const usedColors = new Set(ctx.recurringCategories.map(c => c.color));
        const color = (typeof args.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.color.trim()))
          ? args.color.trim()
          : (PRESET_COLORS.find(c => !usedColors.has(c)) ?? PRESET_COLORS[ctx.recurringCategories.length % PRESET_COLORS.length]);
        const newCat = { id: `rc-${Date.now()}`, name, color };
        ctx.onUpdateRecurringCategories([...ctx.recurringCategories, newCat]);
        const allNames = [...ctx.recurringCategories.map(c => c.name), name].join('、');
        return { success: true, message: `分类「${name}」已创建（颜色：${color}）。现有全部分类：${allNames}`, category: newCat };
      },
    },
  {
      name: 'create_category',
      module: 'todo',
      tool: {
        name: 'create_category',
        description: '为待办事项（todo）、技能卡（prompts）或 Markdown 笔记（markdown）创建新分类。当 create_todo / create_prompt / create_markdown_note 校验失败提示分类不存在时，先调用此工具创建新分类，再重试。',
        inputSchema: {
          type: 'object',
          properties: {
            module: { type: 'string', enum: ['todo', 'prompts', 'markdown'], description: '要添加分类的模块：todo=待办事项，prompts=技能卡，markdown=Markdown 笔记' },
            name: { type: 'string', description: '分类名称，如"学习"、"生活"、"项目"' },
          },
          required: ['module', 'name'],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.todos.write) return { success: false, error: '分类创建未授权。请在权限面板中开启「待办事项」写入权限。' };
        const moduleKey = args.module as string;
        if (!['todo', 'prompts', 'markdown'].includes(moduleKey)) return { success: false, error: 'module 参数必须是 todo、prompts 或 markdown 之一。' };
        const name = typeof args.name === 'string' ? args.name.trim() : '';
        if (!name || RESERVED_TODO_CATEGORY_NAMES.has(name)) return { success: false, error: '分类名称不能为空，也不能使用“全部/默认/未分类”。' };
        const currentList = moduleKey === 'todo' ? ctx.todoCategories : moduleKey === 'prompts' ? ctx.promptCategories : ctx.markdownCategories;
        if (currentList.includes(name)) {
          return { success: false, error: `分类「${name}」在「${moduleKey}」中已存在，无需重复创建。` };
        }
        ctx.onAddCategory(moduleKey, name);
        const allNames = [...currentList, name].join('、');
        return { success: true, message: `分类「${name}」已添加到「${moduleKey}」。现有全部分类：${allNames}` };
      },
    },
];
