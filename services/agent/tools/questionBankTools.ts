import type { ToolRegistration } from '../toolRegistry';
import {
  agentNowId,
  findAgentCategory,
  getAgentDescendantCategoryIds,
  loadAgentMethodLibraryData,
  loadAgentQuestionBankData,
  normalizeAgentDifficulty,
  normalizeAgentSolutions,
  parseAgentTags,
  saveAgentMethodLibraryData,
  saveAgentQuestionBankData,
  summarizeMethod,
  summarizeQuestion,
  type AgentMethodItem,
  type AgentQuestionCategory,
  type AgentQuestionItem,
} from './localData';

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

export const QUESTION_BANK_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── 题库 / 解题方法工具 ───
  {
    name: 'query_question_categories',
    module: 'question-bank',
    tool: {
      name: 'query_question_categories',
      description: '查询题库或解题方法库的多级分类。创建题目、方法或子分类前应先调用本工具获取 categoryId。',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', enum: ['questions', 'methods'], description: 'questions=题库分类；methods=解题方法分类。默认 questions。' },
        },
      },
    },
    execute: async (args) => {
      const collection = args.collection === 'methods' ? 'methods' : 'questions';
      if (collection === 'methods') {
        const data = await loadAgentMethodLibraryData();
        const counts = data.methods.reduce((acc, method) => {
          acc[method.categoryId] = (acc[method.categoryId] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        return { success: true, collection, categories: data.categories.map(category => ({ ...category, itemCount: counts[category.id] || 0 })) };
      }
      const data = await loadAgentQuestionBankData();
      const counts = data.questions.reduce((acc, question) => {
        acc[question.categoryId] = (acc[question.categoryId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return { success: true, collection, categories: data.categories.map(category => ({ ...category, itemCount: counts[category.id] || 0 })) };
    },
  },
  {
    name: 'create_question_category',
    module: 'question-bank',
    tool: {
      name: 'create_question_category',
      description: '在题库或解题方法库中创建分类。可传 parentId 或 parentName 创建子分类；不传则创建顶级分类。',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', enum: ['questions', 'methods'], description: 'questions=题库分类；methods=解题方法分类。默认 questions。' },
          name: { type: 'string', description: '分类名称' },
          parentId: { type: 'string', description: '父分类 id（可选）' },
          parentName: { type: 'string', description: '父分类名称（可选，父分类同名时建议使用 parentId）' },
        },
        required: ['name'],
      },
    },
    execute: async (args) => {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (!name) return { success: false, error: '分类名称不能为空。' };
      const collection = args.collection === 'methods' ? 'methods' : 'questions';
      if (collection === 'methods') {
        const data = await loadAgentMethodLibraryData();
        const parent = findAgentCategory(data.categories, args);
        if ((args.parentId || args.parentName) && !parent) return { success: false, error: '父分类不存在。请先 query_question_categories 获取 parentId。' };
        if (data.categories.some(category => category.name === name && category.parentId === parent?.id)) {
          return { success: false, error: `分类「${name}」已存在。` };
        }
        const category: AgentQuestionCategory = { id: agentNowId('cat'), name, parentId: parent?.id, createdAt: Date.now(), updatedAt: Date.now() };
        saveAgentMethodLibraryData({ ...data, categories: [...data.categories, category] });
        return { success: true, message: `解题方法分类「${name}」已创建。`, category };
      }
      const data = await loadAgentQuestionBankData();
      const parent = findAgentCategory(data.categories, args);
      if ((args.parentId || args.parentName) && !parent) return { success: false, error: '父分类不存在。请先 query_question_categories 获取 parentId。' };
      if (data.categories.some(category => category.name === name && category.parentId === parent?.id)) {
        return { success: false, error: `分类「${name}」已存在。` };
      }
      const category: AgentQuestionCategory = { id: agentNowId('cat'), name, parentId: parent?.id, createdAt: Date.now(), updatedAt: Date.now() };
      saveAgentQuestionBankData({ ...data, categories: [...data.categories, category] });
      return { success: true, message: `题库分类「${name}」已创建。`, category };
    },
  },
  {
    name: 'query_questions',
    module: 'question-bank',
    tool: {
      name: 'query_questions',
      description: '查询题库中的题目，可按分类、关键词、标签过滤。默认只返回摘要；需要完整题目和解答时传 includeContent=true。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string', description: '分类 id，可查询该分类及其子分类下题目' },
          categoryName: { type: 'string', description: '分类名称' },
          keyword: { type: 'string', description: '关键词，匹配题名、题面、解答、备注、概述和标签' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签过滤，任一标签命中即可' },
          includeContent: { type: 'boolean', description: '是否返回完整题面、多个解答和关联解题方法 id' },
          limit: { type: 'number', description: '最多返回条数，默认 20' },
        },
      },
    },
    execute: async (args) => {
      const data = await loadAgentQuestionBankData();
      const category = findAgentCategory(data.categories, args);
      const categorySet = category ? getAgentDescendantCategoryIds(data.categories, category.id) : null;
      const categoryById = new Map(data.categories.map(item => [item.id, item]));
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
      const tags = Array.isArray(args.tags) ? args.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [];
      let questions = data.questions.filter(question => !categorySet || categorySet.has(question.categoryId));
      if (keyword) {
        questions = questions.filter(question => {
          const haystack = [
            question.title,
            question.summary,
            question.question,
            question.answer,
            ...question.solutions.map(solution => `${solution.note}\n${solution.content}`),
            question.note,
            question.tags.join(' '),
          ].join('\n').toLowerCase();
          return haystack.includes(keyword);
        });
      }
      if (tags.length) {
        questions = questions.filter(question => tags.some(tag => question.tags.includes(tag)));
      }
      questions.sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = normalizeLimit(args.limit, 20, 80);
      const includeContent = Boolean(args.includeContent);
      return {
        success: true,
        total: questions.length,
        returned: Math.min(limit, questions.length),
        questions: questions.slice(0, limit).map(question => includeContent
          ? {
              ...summarizeQuestion(question, categoryById.get(question.categoryId)?.name),
              question: question.question,
              solutions: question.solutions,
            }
          : summarizeQuestion(question, categoryById.get(question.categoryId)?.name)),
      };
    },
  },
  {
    name: 'create_question',
    module: 'question-bank',
    tool: {
      name: 'create_question',
      description: '创建题库题目。必须指定已有 categoryId 或 categoryName；题面和解答支持 Markdown/LaTeX；solutions 可传多个解答，每个解答有 note 和 content。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '题目名称' },
          categoryId: { type: 'string', description: '分类 id（推荐）' },
          categoryName: { type: 'string', description: '分类名称' },
          question: { type: 'string', description: '题面 Markdown' },
          answer: { type: 'string', description: '兼容字段：单个解答 Markdown。若传 solutions，优先使用 solutions。' },
          solutions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                note: { type: 'string', description: '解答备注/说明' },
                content: { type: 'string', description: '解答 Markdown' },
              },
            },
            description: '多个解答',
          },
          summary: { type: 'string', description: '概述' },
          difficulty: { type: 'number', description: '难度系数 0-1，一位小数' },
          tags: { description: '标签，可为数组，也可用中英文分号/逗号分割的字符串' },
          note: { type: 'string', description: '备注，阅读时会以引用块样式展示' },
          methodIds: { type: 'array', items: { type: 'string' }, description: '关联解题方法 id 列表' },
        },
        required: ['title', 'question'],
      },
    },
    execute: async (args) => {
      const data = await loadAgentQuestionBankData();
      const category = findAgentCategory(data.categories, args);
      if (!category) return { success: false, error: '必须指定已有题库分类。请先 query_question_categories 获取 categoryId。' };
      const questionText = typeof args.question === 'string' ? args.question : '';
      if (!questionText.trim()) return { success: false, error: '题面不能为空。' };
      const solutions = normalizeAgentSolutions(args.solutions, args.answer);
      const question: AgentQuestionItem = {
        id: agentNowId('q'),
        title: String(args.title || '未命名题目').trim() || '未命名题目',
        categoryId: category.id,
        question: questionText,
        answer: solutions[0]?.content || '',
        solutions,
        summary: typeof args.summary === 'string' ? args.summary.trim() : '',
        difficulty: normalizeAgentDifficulty(args.difficulty),
        tags: parseAgentTags(args.tags),
        note: typeof args.note === 'string' ? args.note.trim() : '',
        methodIds: Array.isArray(args.methodIds) ? args.methodIds.map((id: unknown) => String(id).trim()).filter(Boolean) : [],
        methodId: Array.isArray(args.methodIds) && args.methodIds[0] ? String(args.methodIds[0]) : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveAgentQuestionBankData({ ...data, questions: [question, ...data.questions] });
      return { success: true, message: `题目「${question.title}」已创建。`, question: summarizeQuestion(question, category.name) };
    },
  },
  {
    name: 'update_question',
    module: 'question-bank',
    tool: {
      name: 'update_question',
      description: '修改已有题目。必须传 id；可修改题名、分类、题面、多个解答、概述、难度、标签、备注、关联解题方法。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '题目 id' },
          title: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          question: { type: 'string' },
          answer: { type: 'string' },
          solutions: { type: 'array', items: { type: 'object', properties: { note: { type: 'string' }, content: { type: 'string' } } } },
          summary: { type: 'string' },
          difficulty: { type: 'number' },
          tags: {},
          note: { type: 'string' },
          methodIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const data = await loadAgentQuestionBankData();
      const target = data.questions.find(question => question.id === args.id);
      if (!target) return { success: false, error: `未找到题目「${args.id}」。` };
      const category = args.categoryId || args.categoryName ? findAgentCategory(data.categories, args) : undefined;
      if ((args.categoryId || args.categoryName) && !category) return { success: false, error: '目标分类不存在。' };
      const nextSolutions = args.solutions !== undefined || args.answer !== undefined
        ? normalizeAgentSolutions(args.solutions, args.answer)
        : target.solutions;
      const updated: AgentQuestionItem = {
        ...target,
        title: typeof args.title === 'string' ? (args.title.trim() || target.title) : target.title,
        categoryId: category?.id || target.categoryId,
        question: typeof args.question === 'string' ? args.question : target.question,
        answer: nextSolutions[0]?.content || '',
        solutions: nextSolutions,
        summary: typeof args.summary === 'string' ? args.summary.trim() : target.summary,
        difficulty: args.difficulty !== undefined ? normalizeAgentDifficulty(args.difficulty) : target.difficulty,
        tags: args.tags !== undefined ? parseAgentTags(args.tags) : target.tags,
        note: typeof args.note === 'string' ? args.note.trim() : target.note,
        methodIds: Array.isArray(args.methodIds) ? args.methodIds.map((id: unknown) => String(id).trim()).filter(Boolean) : target.methodIds,
        methodId: Array.isArray(args.methodIds) ? (args.methodIds[0] ? String(args.methodIds[0]) : undefined) : target.methodId,
        updatedAt: Date.now(),
      };
      saveAgentQuestionBankData({ ...data, questions: data.questions.map(question => question.id === updated.id ? updated : question) });
      return { success: true, message: `题目「${updated.title}」已更新。`, question: summarizeQuestion(updated, category?.name) };
    },
  },
  {
    name: 'delete_question',
    module: 'question-bank',
    tool: {
      name: 'delete_question',
      description: '删除题库题目。该操作会触发确认和快照回退。',
      inputSchema: { type: 'object', properties: { id: { type: 'string', description: '题目 id' } }, required: ['id'] },
    },
    execute: async (args) => {
      const data = await loadAgentQuestionBankData();
      const target = data.questions.find(question => question.id === args.id);
      if (!target) return { success: false, error: `未找到题目「${args.id}」。` };
      saveAgentQuestionBankData({ ...data, questions: data.questions.filter(question => question.id !== target.id) });
      return { success: true, message: `题目「${target.title}」已删除。` };
    },
  },
  {
    name: 'query_solution_methods',
    module: 'question-bank',
    tool: {
      name: 'query_solution_methods',
      description: '查询解题方法库中的方法，可按分类、关键词、标签过滤。默认只返回摘要；includeContent=true 返回完整 Markdown。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          keyword: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          includeContent: { type: 'boolean' },
          limit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      const data = await loadAgentMethodLibraryData();
      const category = findAgentCategory(data.categories, args);
      const categorySet = category ? getAgentDescendantCategoryIds(data.categories, category.id) : null;
      const categoryById = new Map(data.categories.map(item => [item.id, item]));
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
      const tags = Array.isArray(args.tags) ? args.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [];
      let methods = data.methods.filter(method => !categorySet || categorySet.has(method.categoryId));
      if (keyword) {
        methods = methods.filter(method => `${method.title}\n${method.summary}\n${method.content}\n${method.note}\n${method.tags.join(' ')}`.toLowerCase().includes(keyword));
      }
      if (tags.length) methods = methods.filter(method => tags.some(tag => method.tags.includes(tag)));
      methods.sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = normalizeLimit(args.limit, 20, 80);
      return {
        success: true,
        total: methods.length,
        returned: Math.min(limit, methods.length),
        methods: methods.slice(0, limit).map(method => ({
          ...summarizeMethod(method, categoryById.get(method.categoryId)?.name),
          ...(args.includeContent ? { content: method.content } : {}),
        })),
      };
    },
  },
  {
    name: 'create_solution_method',
    module: 'question-bank',
    tool: {
      name: 'create_solution_method',
      description: '创建解题方法。必须指定已有 categoryId 或 categoryName；content 是完整 Markdown 内容。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          content: { type: 'string' },
          summary: { type: 'string' },
          tags: {},
          note: { type: 'string' },
        },
        required: ['title', 'content'],
      },
    },
    execute: async (args) => {
      const data = await loadAgentMethodLibraryData();
      const category = findAgentCategory(data.categories, args);
      if (!category) return { success: false, error: '必须指定已有解题方法分类。请先 query_question_categories(collection=methods) 获取 categoryId。' };
      const content = typeof args.content === 'string' ? args.content : '';
      if (!content.trim()) return { success: false, error: '解题方法内容不能为空。' };
      const method: AgentMethodItem = {
        id: agentNowId('method'),
        title: String(args.title || '未命名方法').trim() || '未命名方法',
        categoryId: category.id,
        content,
        summary: typeof args.summary === 'string' ? args.summary.trim() : '',
        tags: parseAgentTags(args.tags),
        note: typeof args.note === 'string' ? args.note.trim() : '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveAgentMethodLibraryData({ ...data, methods: [method, ...data.methods] });
      return { success: true, message: `解题方法「${method.title}」已创建。`, method: summarizeMethod(method, category.name) };
    },
  },
  {
    name: 'update_solution_method',
    module: 'question-bank',
    tool: {
      name: 'update_solution_method',
      description: '修改解题方法。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          content: { type: 'string' },
          summary: { type: 'string' },
          tags: {},
          note: { type: 'string' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const data = await loadAgentMethodLibraryData();
      const target = data.methods.find(method => method.id === args.id);
      if (!target) return { success: false, error: `未找到解题方法「${args.id}」。` };
      const category = args.categoryId || args.categoryName ? findAgentCategory(data.categories, args) : undefined;
      if ((args.categoryId || args.categoryName) && !category) return { success: false, error: '目标分类不存在。' };
      const updated: AgentMethodItem = {
        ...target,
        title: typeof args.title === 'string' ? (args.title.trim() || target.title) : target.title,
        categoryId: category?.id || target.categoryId,
        content: typeof args.content === 'string' ? args.content : target.content,
        summary: typeof args.summary === 'string' ? args.summary.trim() : target.summary,
        tags: args.tags !== undefined ? parseAgentTags(args.tags) : target.tags,
        note: typeof args.note === 'string' ? args.note.trim() : target.note,
        updatedAt: Date.now(),
      };
      saveAgentMethodLibraryData({ ...data, methods: data.methods.map(method => method.id === updated.id ? updated : method) });
      return { success: true, message: `解题方法「${updated.title}」已更新。`, method: summarizeMethod(updated, category?.name) };
    },
  },

];
