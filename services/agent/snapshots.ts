import type {
  APIRecord,
  FileRecord,
  Note,
  RecurringEvent,
  ResourceCenterData,
  ResourceItem,
  SSHRecord,
  TodoItem,
} from '../../types';
import type { AgentUndoSnapshot } from './safety';
import {
  loadAgentCanvasDrawings,
  loadAgentMethodLibraryData,
  loadAgentQuestionBankData,
  saveAgentCanvasDrawings,
  saveAgentMethodLibraryData,
  saveAgentQuestionBankData,
} from './tools/localData';
import { resolveTodoMatch } from './tools/todoHelpers';

export interface AgentUndoSnapshotContext {
  todos: TodoItem[];
  notes: Note[];
  resourceData: ResourceCenterData;
  sshRecords: SSHRecord[];
  apiRecords: APIRecord[];
  recurringEvents: RecurringEvent[];
  fileRecords: FileRecord[];
}

export interface AgentUndoRestoreHandlers {
  onCreateTodo: (data: Partial<TodoItem>) => void;
  onUpdateTodo: (id: string, updates: Partial<TodoItem>) => void;
  onCreateNote: (data: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onCreateResource: (item: Partial<ResourceItem>) => void;
  onUpdateResource: (id: string, updates: Partial<ResourceItem>) => void;
  onSaveSSH: (record: Partial<SSHRecord>) => void;
  onSaveAPI: (record: Partial<APIRecord>) => void;
  onCreateRecurring: (data: Partial<RecurringEvent>) => void;
  onUpdateRecurring: (id: string, data: Partial<RecurringEvent>) => void;
}

export const createAgentUndoSnapshotForTool = async (
  toolName: string,
  args: Record<string, any>,
  context: AgentUndoSnapshotContext,
): Promise<AgentUndoSnapshot | undefined> => {
  const {
    apiRecords,
    fileRecords,
    notes,
    recurringEvents,
    resourceData,
    sshRecords,
    todos,
  } = context;

  if (['update_todo', 'delete_todo'].includes(toolName)) {
    const match = resolveTodoMatch(todos, args);
    const todo = args.id ? todos.find(t => t.id === args.id) : match.todo;
    if (todo) {
      return {
        type: 'todo',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: todo.id,
        data: { ...todo },
        label: `${toolName === 'delete_todo' ? '删除' : '修改'}待办「${todo.content}」`,
      };
    }
  }

  if (['update_subtask', 'delete_subtask'].includes(toolName)) {
    const todo = todos.find(t => t.id === args.todoId);
    if (todo) {
      return {
        type: 'todo',
        action: 'update',
        id: todo.id,
        data: { ...todo },
        label: `${toolName === 'delete_subtask' ? '删除' : '修改'}子任务（${todo.content}）`,
      };
    }
  }

  if (['update_note', 'delete_note'].includes(toolName)) {
    const note = notes.find(n => n.id === args.id);
    if (note) {
      return {
        type: 'note',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: note.id,
        data: { ...note },
        label: `${toolName === 'delete_note' ? '删除' : '修改'}便签`,
      };
    }
  }

  if (['update_resource', 'delete_resource'].includes(toolName)) {
    const item = args.id
      ? resourceData.items.find(i => i.id === args.id)
      : resourceData.items.find(i => i.name === args.name);
    if (item) {
      return {
        type: 'resource',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: item.id,
        data: { ...item },
        label: `${toolName === 'delete_resource' ? '删除' : '修改'}资源「${item.name}」`,
      };
    }
  }

  if (['update_ssh_record', 'delete_ssh_record'].includes(toolName)) {
    const record = sshRecords.find(item => item.id === args.id);
    if (record) {
      return {
        type: 'ssh',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: record.id,
        data: { ...record },
        label: `${toolName === 'delete_ssh_record' ? '删除' : '修改'} SSH 记录「${record.title}」`,
      };
    }
  }

  if (['update_api_record', 'delete_api_record'].includes(toolName)) {
    const record = apiRecords.find(item => item.id === args.id);
    if (record) {
      return {
        type: 'api',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: record.id,
        data: { ...record },
        label: `${toolName === 'delete_api_record' ? '删除' : '修改'} API 记录「${record.title}」`,
      };
    }
  }

  if (['update_recurring_event', 'delete_recurring_event'].includes(toolName)) {
    const event = recurringEvents.find(item => item.id === args.id);
    if (event) {
      return {
        type: 'recurring',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: event.id,
        data: { ...event },
        label: `${toolName === 'delete_recurring_event' ? '删除' : '修改'}重复事件「${event.title}」`,
      };
    }
  }

  if (toolName === 'edit_latex_file') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexOpenManagedFile || typeof args.filePath !== 'string') return undefined;
    const result = await electronAPI.latexOpenManagedFile(args.filePath);
    if (result?.content !== undefined) {
      return {
        type: 'latex_file',
        action: 'update',
        id: args.filePath,
        data: { filePath: args.filePath, content: result.content },
        label: `修改 LaTeX 文件「${args.filePath}」`,
      };
    }
  }

  if (toolName === 'edit_latex_template') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexGetTemplates || typeof args.templateId !== 'string') return undefined;
    const templates = await electronAPI.latexGetTemplates();
    const template = Array.isArray(templates)
      ? templates.find((item: any) => item.id === args.templateId)
      : undefined;
    if (template) {
      return {
        type: 'latex_template',
        action: 'update',
        id: template.id,
        data: { ...template },
        label: `修改 LaTeX 模板「${template.name || template.id}」`,
      };
    }
  }

  if (toolName === 'edit_file') {
    const file = fileRecords.find(item => item.id === args.id);
    const electronAPI = (window as any).electronAPI;
    if (!file || !electronAPI?.readFile) return undefined;
    const content = await electronAPI.readFile(file.path);
    if (typeof content === 'string') {
      return {
        type: 'file',
        action: 'update',
        id: file.id,
        data: { id: file.id, path: file.path, name: file.name, content },
        label: `修改文件「${file.name}」`,
      };
    }
  }

  if (['update_question', 'delete_question'].includes(toolName)) {
    const data = await loadAgentQuestionBankData();
    const question = data.questions.find(item => item.id === args.id);
    if (question) {
      return {
        type: 'question',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: question.id,
        data: { ...question },
        label: `${toolName === 'delete_question' ? '删除' : '修改'}题目「${question.title || question.id}」`,
      };
    }
  }

  if (toolName === 'update_solution_method') {
    const data = await loadAgentMethodLibraryData();
    const method = data.methods.find(item => item.id === args.id);
    if (method) {
      return {
        type: 'question_method',
        action: 'update',
        id: method.id,
        data: { ...method },
        label: `修改解题方法「${method.title || method.id}」`,
      };
    }
  }

  if (['update_canvas_meta', 'delete_canvas'].includes(toolName)) {
    const drawings = await loadAgentCanvasDrawings();
    const drawing = drawings.find(item => item.id === args.id);
    if (drawing) {
      return {
        type: 'canvas',
        action: toolName.startsWith('delete') ? 'delete' : 'update',
        id: drawing.id,
        data: { ...drawing },
        label: `${toolName === 'delete_canvas' ? '删除' : '修改'}画布「${drawing.name || drawing.id}」`,
      };
    }
  }

  return undefined;
};

export const restoreAgentUndoSnapshot = async (
  snap: AgentUndoSnapshot,
  handlers: AgentUndoRestoreHandlers,
) => {
  if (snap.type === 'todo') {
    if (snap.action === 'delete') handlers.onCreateTodo(snap.data as Partial<TodoItem>);
    else handlers.onUpdateTodo(snap.id, snap.data as Partial<TodoItem>);
    return;
  }

  if (snap.type === 'note') {
    if (snap.action === 'delete') handlers.onCreateNote(snap.data as Partial<Note>);
    else handlers.onUpdateNote(snap.id, snap.data as Partial<Note>);
    return;
  }

  if (snap.type === 'resource') {
    if (snap.action === 'delete') handlers.onCreateResource(snap.data as Partial<ResourceItem>);
    else handlers.onUpdateResource(snap.id, snap.data as Partial<ResourceItem>);
    return;
  }

  if (snap.type === 'ssh') {
    handlers.onSaveSSH(snap.data as Partial<SSHRecord>);
    return;
  }

  if (snap.type === 'api') {
    handlers.onSaveAPI(snap.data as Partial<APIRecord>);
    return;
  }

  if (snap.type === 'recurring') {
    if (snap.action === 'delete') handlers.onCreateRecurring(snap.data as Partial<RecurringEvent>);
    else handlers.onUpdateRecurring(snap.id, snap.data as Partial<RecurringEvent>);
    return;
  }

  if (snap.type === 'latex_file') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexSaveManagedFile) throw new Error('LaTeX 文件写入接口不可用。');
    const ok = await electronAPI.latexSaveManagedFile({
      filePath: snap.data.filePath,
      content: snap.data.content,
    });
    if (!ok) throw new Error('LaTeX 文件回退失败。');
    return;
  }

  if (snap.type === 'latex_template') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexSaveTemplate) throw new Error('LaTeX 模板写入接口不可用。');
    const ok = await electronAPI.latexSaveTemplate(snap.data);
    if (!ok) throw new Error('LaTeX 模板回退失败。');
    return;
  }

  if (snap.type === 'file') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.writeFile) throw new Error('文件写入接口不可用。');
    const ok = await electronAPI.writeFile(snap.data.path, snap.data.content);
    if (!ok) throw new Error('文件回退失败。');
    return;
  }

  if (snap.type === 'question') {
    const data = await loadAgentQuestionBankData();
    const exists = data.questions.some(item => item.id === snap.id);
    const nextQuestions = exists
      ? data.questions.map(item => item.id === snap.id ? snap.data as any : item)
      : [snap.data as any, ...data.questions];
    saveAgentQuestionBankData({ ...data, questions: nextQuestions });
    return;
  }

  if (snap.type === 'question_method') {
    const data = await loadAgentMethodLibraryData();
    const exists = data.methods.some(item => item.id === snap.id);
    const nextMethods = exists
      ? data.methods.map(item => item.id === snap.id ? snap.data as any : item)
      : [snap.data as any, ...data.methods];
    saveAgentMethodLibraryData({ ...data, methods: nextMethods });
    return;
  }

  if (snap.type === 'canvas') {
    const drawings = await loadAgentCanvasDrawings();
    const exists = drawings.some(item => item.id === snap.id);
    const nextDrawings = exists
      ? drawings.map(item => item.id === snap.id ? snap.data as any : item)
      : [snap.data as any, ...drawings];
    saveAgentCanvasDrawings(nextDrawings);
  }
};
