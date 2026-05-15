import type {
  APIRecord,
  FileRecord,
  Note,
  OJHeatmapData,
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
  ojHeatmapData: OJHeatmapData;
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
  onUpdateOJHeatmapData: (data: OJHeatmapData) => void;
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
    ojHeatmapData,
    recurringEvents,
    resourceData,
    sshRecords,
    todos,
  } = context;

  const makeLocalStorageSnapshot = (
    label: string,
    keys: string[],
    events: string[] = [],
  ): AgentUndoSnapshot => ({
    type: 'local_storage',
    action: 'update',
    id: keys.join('|'),
    data: {
      items: keys.map(key => ({ key, value: localStorage.getItem(key) })),
      events,
    },
    label,
  });

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

  if ([
    'update_oj_submission',
    'delete_oj_submission',
    'update_oj_site',
    'delete_oj_site',
  ].includes(toolName)) {
    return {
      type: 'oj_heatmap',
      action: toolName.startsWith('delete') ? 'delete' : 'update',
      id: 'oj-heatmap',
      data: ojHeatmapData as any,
      label: toolName.includes('site') ? '修改 OJ 网站配置' : '修改 OJ 做题记录',
    };
  }

  if ([
    'update_website_record',
    'delete_website_record',
    'update_website_tag',
    'delete_website_tag',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot('修改网站管理数据', ['linkmaster_passwords_v1', 'linkmaster_password_tags_v1'], ['guyue-password-manager-updated']);
  }

  if ([
    'update_image_record',
    'delete_image_record',
    'update_image_category',
    'delete_image_category',
    'rename_image_category',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot(
      '修改图床记录',
      ['linkmaster_image_records_v1', 'linkmaster_categories_v1'],
      ['guyue:image-records-updated', 'guyue:categories-updated'],
    );
  }

  if ([
    'update_leetcode_list',
    'delete_leetcode_list',
    'update_leetcode_group',
    'delete_leetcode_group',
    'update_leetcode_problem',
    'delete_leetcode_problem',
    'set_leetcode_problem_progress',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot('修改 LeetCode 题单', ['leetcode_lists', 'leetcode_progress'], ['leetcode-data-updated']);
  }

  if ([
    'update_code_category',
    'delete_code_category',
    'update_code_category_note',
    'delete_code_category_note',
    'update_code_exercise',
    'delete_code_exercise',
    'update_code_exercise_file',
    'clear_code_exercise_file',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot(
      '修改 Code 编码练习',
      ['coding_practice_categories_v1', 'coding_practice_sessions_v2', 'coding_practice_active_v1'],
      ['guyue-coding-practice-updated'],
    );
  }

  if ([
    'update_learning_category',
    'delete_learning_category',
    'update_learning_course',
    'delete_learning_course',
    'update_learning_section',
    'delete_learning_section',
    'update_learning_module',
    'delete_learning_module',
    'update_learning_item',
    'delete_learning_item',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot('修改学习空间数据', ['learning_categories_v1', 'learning_courses_v1'], ['learning-data-updated']);
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

  if ([
    'git_add_repository',
    'git_remove_repository',
  ].includes(toolName)) {
    return makeLocalStorageSnapshot('修改 Git 仓库列表', ['guyue_git_repositories_v1'], ['guyue-git-repositories-updated']);
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

  if ([
    'update_latex_file_category',
    'delete_latex_file_category',
  ].includes(toolName)) {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexGetFileCategories || !electronAPI?.latexGetFileCategoryMap) return undefined;
    const [categories, categoryMap] = await Promise.all([
      electronAPI.latexGetFileCategories(),
      electronAPI.latexGetFileCategoryMap(),
    ]);
    return {
      type: 'latex_file_categories',
      action: 'update',
      id: 'latex-file-categories',
      data: {
        categories: Array.isArray(categories) ? categories : [],
        categoryMap: categoryMap && typeof categoryMap === 'object' ? categoryMap : {},
      },
      label: toolName === 'delete_latex_file_category' ? '删除 LaTeX 文件分类' : '修改 LaTeX 文件分类',
    };
  }

  if ([
    'edit_latex_file',
    'rename_latex_file',
    'move_latex_file',
    'delete_latex_file',
  ].includes(toolName)) {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexOpenManagedFile || typeof args.filePath !== 'string') return undefined;
    const [result, files] = await Promise.all([
      electronAPI.latexOpenManagedFile(args.filePath),
      electronAPI.latexListFiles?.(),
    ]);
    if (result?.content !== undefined) {
      const file = Array.isArray(files) ? files.find((item: any) => item.path === args.filePath) : undefined;
      const newName = typeof args.newName === 'string'
        ? (args.newName.trim().endsWith('.tex') ? args.newName.trim() : `${args.newName.trim()}.tex`)
        : '';
      const separatorIndex = args.filePath.lastIndexOf('/');
      const newPath = newName && separatorIndex >= 0
        ? `${args.filePath.slice(0, separatorIndex + 1)}${newName}`
        : undefined;
      return {
        type: 'latex_file',
        action: toolName === 'delete_latex_file' ? 'delete' : 'update',
        id: args.filePath,
        data: {
          filePath: args.filePath,
          content: result.content,
          categoryId: file?.category,
          newPath,
        },
        label: `${toolName === 'delete_latex_file' ? '删除' : '修改'} LaTeX 文件「${args.filePath}」`,
      };
    }
  }

  if ([
    'rename_latex_template_category',
    'delete_latex_template_category',
  ].includes(toolName)) {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexGetTemplates) return undefined;
    const templates = await electronAPI.latexGetTemplates();
    return {
      type: 'latex_templates',
      action: 'update',
      id: 'latex-templates',
      data: { templates: Array.isArray(templates) ? templates : [] },
      label: toolName === 'delete_latex_template_category' ? '删除 LaTeX 模板分类' : '修改 LaTeX 模板分类',
    };
  }

  if (['edit_latex_template', 'delete_latex_template'].includes(toolName)) {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexGetTemplates || typeof args.templateId !== 'string') return undefined;
    const templates = await electronAPI.latexGetTemplates();
    const template = Array.isArray(templates)
      ? templates.find((item: any) => item.id === args.templateId)
      : undefined;
    if (template) {
      return {
        type: 'latex_template',
        action: toolName === 'delete_latex_template' ? 'delete' : 'update',
        id: template.id,
        data: { ...template },
        label: `${toolName === 'delete_latex_template' ? '删除' : '修改'} LaTeX 模板「${template.name || template.id}」`,
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

  if (snap.type === 'oj_heatmap') {
    handlers.onUpdateOJHeatmapData(snap.data as unknown as OJHeatmapData);
    return;
  }

  if (snap.type === 'local_storage') {
    const items = Array.isArray((snap.data as any).items) ? (snap.data as any).items : [];
    for (const item of items) {
      if (!item?.key) continue;
      if (item.value === null || item.value === undefined) localStorage.removeItem(item.key);
      else localStorage.setItem(item.key, String(item.value));
    }
    const events = Array.isArray((snap.data as any).events) ? (snap.data as any).events : [];
    for (const eventName of events) {
      if (eventName === 'guyue:image-records-updated') {
        const raw = localStorage.getItem('linkmaster_image_records_v1');
        let records: any[] = [];
        try { records = raw ? JSON.parse(raw) : []; } catch { records = []; }
        window.dispatchEvent(new CustomEvent(eventName, { detail: { records } }));
      } else if (eventName === 'guyue:categories-updated') {
        const raw = localStorage.getItem('linkmaster_categories_v1');
        let categoriesMap: Record<string, any> = {};
        try { categoriesMap = raw ? JSON.parse(raw) : {}; } catch { categoriesMap = {}; }
        window.dispatchEvent(new CustomEvent(eventName, { detail: { categoriesMap } }));
      } else {
        window.dispatchEvent(new CustomEvent(eventName));
      }
    }
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
    let filePath = snap.data.filePath;
    if (snap.data.newPath && electronAPI?.latexRenameManagedFile) {
      const oldName = String(snap.data.filePath || '').split('/').pop();
      if (oldName) {
        const renamedPath = await electronAPI.latexRenameManagedFile({
          filePath: snap.data.newPath,
          newName: oldName,
        }).catch(() => null);
        if (renamedPath) filePath = renamedPath;
      }
    }
    const ok = await electronAPI.latexSaveManagedFile({
      filePath,
      content: snap.data.content,
    });
    if (!ok) throw new Error('LaTeX 文件回退失败。');
    if (snap.data.categoryId && electronAPI?.latexSetFileCategory) {
      await electronAPI.latexSetFileCategory({ filePath, categoryId: snap.data.categoryId }).catch(() => null);
    }
    return;
  }

  if (snap.type === 'latex_file_categories') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexSaveFileCategories) throw new Error('LaTeX 文件分类写入接口不可用。');
    const ok = await electronAPI.latexSaveFileCategories(Array.isArray(snap.data.categories) ? snap.data.categories : []);
    if (!ok) throw new Error('LaTeX 文件分类回退失败。');
    if (electronAPI?.latexSetFileCategory && snap.data.categoryMap && typeof snap.data.categoryMap === 'object') {
      for (const [filePath, categoryId] of Object.entries(snap.data.categoryMap)) {
        if (typeof filePath === 'string' && typeof categoryId === 'string') {
          await electronAPI.latexSetFileCategory({ filePath, categoryId }).catch(() => null);
        }
      }
    }
    return;
  }

  if (snap.type === 'latex_template') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexSaveTemplate) throw new Error('LaTeX 模板写入接口不可用。');
    const ok = await electronAPI.latexSaveTemplate(snap.data);
    if (!ok) throw new Error('LaTeX 模板回退失败。');
    return;
  }

  if (snap.type === 'latex_templates') {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI?.latexGetTemplates || !electronAPI?.latexSaveTemplate || !electronAPI?.latexDeleteTemplate) {
      throw new Error('LaTeX 模板批量写入接口不可用。');
    }
    const current = await electronAPI.latexGetTemplates();
    if (Array.isArray(current)) {
      for (const template of current) {
        if (template?.id) await electronAPI.latexDeleteTemplate(template.id).catch(() => null);
      }
    }
    const templates = Array.isArray(snap.data.templates) ? snap.data.templates : [];
    for (const template of templates) {
      if (template?.id) {
        const ok = await electronAPI.latexSaveTemplate(template);
        if (!ok) throw new Error('LaTeX 模板批量回退失败。');
      }
    }
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
