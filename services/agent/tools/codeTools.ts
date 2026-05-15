import type { ToolRegistration } from '../toolRegistry';

type PracticeLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'cpp'
  | 'java'
  | 'go'
  | 'rust'
  | 'swift';

type PracticeFileId = 'input' | 'code' | 'output' | 'notes';

interface PracticeFile {
  id: PracticeFileId;
  name: string;
  editorLanguage: string;
  content: string;
}

interface CodingPracticeSession {
  id: string;
  title: string;
  language: PracticeLanguage;
  categoryId: string;
  priority: number;
  activeFileId: PracticeFileId;
  files: PracticeFile[];
  createdAt: number;
  updatedAt: number;
}

interface PracticeCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  priority: number;
  noteContent: string;
}

const STORAGE_KEY_CATEGORIES = 'coding_practice_categories_v1';
const STORAGE_KEY_SESSIONS = 'coding_practice_sessions_v2';
const LEGACY_STORAGE_KEY_SESSIONS = 'coding_practice_sessions_v1';
const STORAGE_KEY_ACTIVE = 'coding_practice_active_v1';
const CODE_PRACTICE_UPDATED_EVENT = 'guyue-coding-practice-updated';
const DEFAULT_CATEGORY_ID = 'coding-practice-default-category';
const DEFAULT_INPUT_TEMPLATE = '=== case 1 ===\n';

const LANGUAGE_META: Record<PracticeLanguage, { label: string; editorLanguage: string; starterCode: string }> = {
  typescript: {
    label: 'TypeScript',
    editorLanguage: 'typescript',
    starterCode: `function solve(input: string): string {
  const lines = input.trim().split('\\n');
  return lines.join(' ');
}

export { solve };
`,
  },
  javascript: {
    label: 'JavaScript',
    editorLanguage: 'javascript',
    starterCode: `function solve(input) {
  const lines = input.trim().split('\\n');
  return lines.join(' ');
}

module.exports = { solve };
`,
  },
  python: {
    label: 'Python',
    editorLanguage: 'python',
    starterCode: `def solve(text: str) -> str:
    lines = text.strip().splitlines()
    return " ".join(lines)


if __name__ == "__main__":
    sample = ""
    print(solve(sample))
`,
  },
  cpp: {
    label: 'C++',
    editorLanguage: 'cpp',
    starterCode: `#include <iostream>
#include <iterator>
#include <string>

using namespace std;

string solve(const string& input) {
    return input;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    const string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    cout << solve(input);
    return 0;
}
`,
  },
  java: {
    label: 'Java',
    editorLanguage: 'java',
    starterCode: `public class Main {
    public static String solve(String input) {
        return input;
    }

    public static void main(String[] args) {
    }
}
`,
  },
  go: {
    label: 'Go',
    editorLanguage: 'go',
    starterCode: `package main

import "fmt"

func solve(input string) string {
	return input
}

func main() {
	fmt.Println(solve(""))
}
`,
  },
  rust: {
    label: 'Rust',
    editorLanguage: 'rust',
    starterCode: `fn solve(input: &str) -> String {
    input.to_string()
}

fn main() {
    println!("{}", solve(""));
}
`,
  },
  swift: {
    label: 'Swift',
    editorLanguage: 'swift',
    starterCode: `import Foundation

func solve(_ input: String) -> String {
    input
}

print(solve(""))
`,
  },
};

const getCodeFileName = (language: PracticeLanguage) => {
  switch (language) {
    case 'typescript':
      return 'main.ts';
    case 'javascript':
      return 'main.js';
    case 'python':
      return 'main.py';
    case 'cpp':
      return 'main.cpp';
    case 'java':
      return 'Main.java';
    case 'go':
      return 'main.go';
    case 'rust':
      return 'main.rs';
    case 'swift':
      return 'main.swift';
    default:
      return 'main.cpp';
  }
};

const isPracticeLanguage = (value: unknown): value is PracticeLanguage =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGE_META, value);

const isPracticeFileId = (value: unknown): value is PracticeFileId =>
  value === 'input' || value === 'code' || value === 'output' || value === 'notes';

const createDefaultFiles = (language: PracticeLanguage, fileContents?: Record<string, unknown>): PracticeFile[] => [
  {
    id: 'input',
    name: 'input.in',
    editorLanguage: 'plaintext',
    content: typeof fileContents?.input === 'string' ? fileContents.input : DEFAULT_INPUT_TEMPLATE,
  },
  {
    id: 'code',
    name: getCodeFileName(language),
    editorLanguage: LANGUAGE_META[language].editorLanguage,
    content: typeof fileContents?.code === 'string' ? fileContents.code : LANGUAGE_META[language].starterCode,
  },
  {
    id: 'output',
    name: 'output.out',
    editorLanguage: 'plaintext',
    content: typeof fileContents?.output === 'string' ? fileContents.output : '',
  },
  {
    id: 'notes',
    name: 'notes.md',
    editorLanguage: 'markdown',
    content: typeof fileContents?.notes === 'string' ? fileContents.notes : '',
  },
];

const createDefaultCategory = (): PracticeCategory => ({
  id: DEFAULT_CATEGORY_ID,
  name: '默认分类',
  description: '按题型、专题或练习阶段整理卡片。',
  icon: 'Code',
  color: 'blue',
  priority: 0,
  noteContent: '',
});

const sortCategories = (categories: PracticeCategory[]) =>
  [...categories].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

const normalizeCategories = (source: unknown): PracticeCategory[] => {
  const categories = Array.isArray(source)
    ? source
        .map((entry: any, index): PracticeCategory | null => {
          const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
          if (!name) return null;
          return {
            id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `coding-practice-category-${index}`,
            name,
            description: typeof entry?.description === 'string' ? entry.description : '',
            icon: typeof entry?.icon === 'string' && entry.icon.trim() ? entry.icon : 'Code',
            color: typeof entry?.color === 'string' && entry.color.trim() ? entry.color : 'blue',
            priority: Number.isFinite(Number(entry?.priority)) ? Number(entry.priority) : index,
            noteContent: typeof entry?.noteContent === 'string' ? entry.noteContent : '',
          };
        })
        .filter((entry): entry is PracticeCategory => Boolean(entry))
    : [];
  if (categories.length === 0) return [createDefaultCategory()];
  return sortCategories(categories).map((category, index) => ({ ...category, priority: index }));
};

const getSortedCategoryIds = (categories: PracticeCategory[]) => sortCategories(categories).map(category => category.id);

const normalizeFiles = (
  files: unknown,
  language: PracticeLanguage,
  fallbackCode?: string,
): PracticeFile[] => {
  const source = Array.isArray(files) ? files : [];
  const findFile = (id: PracticeFileId) => {
    if (id === 'input') return source.find((file: any) => file?.id === 'input' || file?.name === 'input.in' || file?.name?.endsWith('.in'));
    if (id === 'output') return source.find((file: any) => file?.id === 'output' || file?.name === 'output.out' || file?.name?.endsWith('.out'));
    if (id === 'notes') return source.find((file: any) => file?.id === 'notes' || file?.name === 'notes.md' || file?.name?.endsWith('.md'));
    return source.find((file: any) => file?.id === 'code' || file?.editorLanguage === LANGUAGE_META[language].editorLanguage);
  };
  const inputFile = findFile('input');
  const codeFile = findFile('code');
  const outputFile = findFile('output');
  const notesFile = findFile('notes');
  return [
    {
      id: 'input',
      name: 'input.in',
      editorLanguage: 'plaintext',
      content: typeof inputFile?.content === 'string' ? inputFile.content : DEFAULT_INPUT_TEMPLATE,
    },
    {
      id: 'code',
      name: getCodeFileName(language),
      editorLanguage: LANGUAGE_META[language].editorLanguage,
      content: typeof codeFile?.content === 'string' ? codeFile.content : (fallbackCode ?? LANGUAGE_META[language].starterCode),
    },
    {
      id: 'output',
      name: 'output.out',
      editorLanguage: 'plaintext',
      content: typeof outputFile?.content === 'string' ? outputFile.content : '',
    },
    {
      id: 'notes',
      name: 'notes.md',
      editorLanguage: 'markdown',
      content: typeof notesFile?.content === 'string' ? notesFile.content : '',
    },
  ];
};

const normalizeSessionGroups = (
  sessions: CodingPracticeSession[],
  categoryIds: string[],
  preserveOrder = false,
): CodingPracticeSession[] => {
  const groups = new Map<string, CodingPracticeSession[]>();
  const fallbackCategoryId = categoryIds[0] || DEFAULT_CATEGORY_ID;
  categoryIds.forEach(categoryId => groups.set(categoryId, []));
  sessions.forEach((session) => {
    const targetCategoryId = groups.has(session.categoryId) ? session.categoryId : fallbackCategoryId;
    const list = groups.get(targetCategoryId) || [];
    list.push({ ...session, categoryId: targetCategoryId });
    groups.set(targetCategoryId, list);
  });

  const normalized: CodingPracticeSession[] = [];
  const allCategoryIds = [...categoryIds, ...Array.from(groups.keys()).filter(id => !categoryIds.includes(id))];
  allCategoryIds.forEach((categoryId) => {
    const ordered = preserveOrder
      ? [...(groups.get(categoryId) || [])]
      : [...(groups.get(categoryId) || [])].sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return a.createdAt - b.createdAt;
        });
    ordered.forEach((session, index) => {
      normalized.push({ ...session, categoryId, priority: index });
    });
  });
  return normalized;
};

const createSession = (
  title: string,
  language: PracticeLanguage,
  categoryId: string,
  fileContents?: Record<string, unknown>,
): CodingPracticeSession => {
  const now = Date.now();
  return {
    id: `coding-practice-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    language,
    categoryId,
    priority: 0,
    activeFileId: 'code',
    files: createDefaultFiles(language, fileContents),
    createdAt: now,
    updatedAt: now,
  };
};

const loadCategories = (): PracticeCategory[] => {
  try {
    return normalizeCategories(JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || 'null'));
  } catch {
    return [createDefaultCategory()];
  }
};

const loadSessions = (categories = loadCategories()): CodingPracticeSession[] => {
  const categoryIds = getSortedCategoryIds(categories);
  const fallbackCategoryId = categoryIds[0] || DEFAULT_CATEGORY_ID;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS) || localStorage.getItem(LEGACY_STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sessions = parsed
      .map((item: any, index): CodingPracticeSession => {
        const language = isPracticeLanguage(item?.language) ? item.language : 'cpp';
        const fallbackCode = typeof item?.code === 'string' ? item.code : LANGUAGE_META[language].starterCode;
        const activeFileId = isPracticeFileId(item?.activeFileId) ? item.activeFileId : 'code';
        return {
          id: typeof item?.id === 'string' && item.id.trim() ? item.id : `coding-practice-restored-${index}`,
          title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : `编码练习 ${index + 1}`,
          language,
          categoryId: typeof item?.categoryId === 'string' && item.categoryId.trim() ? item.categoryId : fallbackCategoryId,
          priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : index,
          activeFileId,
          files: normalizeFiles(item?.files, language, fallbackCode),
          createdAt: Number(item?.createdAt) || Date.now(),
          updatedAt: Number(item?.updatedAt) || Date.now(),
        };
      });
    return normalizeSessionGroups(sessions, categoryIds);
  } catch {
    return [];
  }
};

const saveCategories = (categories: PracticeCategory[]) => {
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(sortCategories(categories).map((category, index) => ({ ...category, priority: index }))));
  window.dispatchEvent(new CustomEvent(CODE_PRACTICE_UPDATED_EVENT));
};

const saveSessions = (sessions: CodingPracticeSession[], activeSessionId?: string) => {
  localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  if (activeSessionId) localStorage.setItem(STORAGE_KEY_ACTIVE, activeSessionId);
  window.dispatchEvent(new CustomEvent(CODE_PRACTICE_UPDATED_EVENT));
};

const findCategory = (categories: PracticeCategory[], args: Record<string, any>) => {
  const categoryId = typeof args.categoryId === 'string' ? args.categoryId.trim() : '';
  const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : '';
  return (categoryId ? categories.find(category => category.id === categoryId) : undefined)
    || (categoryName ? categories.find(category => category.name === categoryName) : undefined);
};

const summarizeSession = (session: CodingPracticeSession, category?: PracticeCategory, includeFiles = false) => ({
  id: session.id,
  title: session.title,
  language: session.language,
  languageLabel: LANGUAGE_META[session.language].label,
  categoryId: session.categoryId,
  categoryName: category?.name || null,
  activeFileId: session.activeFileId,
  files: includeFiles
    ? session.files
    : session.files.map(file => ({
        id: file.id,
        name: file.name,
        editorLanguage: file.editorLanguage,
        length: file.content.length,
        isEmpty: file.content.trim().length === 0,
      })),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

const invalidCategoryName = (name: string) =>
  !name || name === '默认分类' || name === '未分类' || name === '全部' || name === '__all__';

export const CODE_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_code_categories',
    module: 'code',
    tool: {
      name: 'query_code_categories',
      description: '查询 Code 编码练习分类列表，返回分类 ID、练习数量和分类笔记长度。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const counts = sessions.reduce((acc, session) => {
        acc[session.categoryId] = (acc[session.categoryId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return {
        success: true,
        categories: categories.map(category => ({
          id: category.id,
          name: category.name,
          description: category.description,
          icon: category.icon,
          color: category.color,
          priority: category.priority,
          exerciseCount: counts[category.id] || 0,
          noteLength: category.noteContent.length,
        })),
      };
    },
  },
  {
    name: 'create_code_category',
    module: 'code',
    tool: {
      name: 'create_code_category',
      description: '创建 Code 编码练习分类。分类名称不能使用默认/未分类/全部。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
        },
        required: ['name'],
      },
    },
    execute: async (args) => {
      const name = typeof args.name === 'string' ? args.name.trim() : '';
      if (invalidCategoryName(name)) return { success: false, error: '分类名称无效，不能使用默认/未分类/全部。' };
      const categories = loadCategories();
      if (categories.some(category => category.name === name)) return { success: false, error: `分类「${name}」已存在。` };
      const category: PracticeCategory = {
        id: `coding-practice-category-${Date.now()}`,
        name,
        description: typeof args.description === 'string' ? args.description.trim() : '',
        icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : 'Code',
        color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : 'blue',
        priority: categories.length,
        noteContent: '',
      };
      saveCategories([...categories, category]);
      return { success: true, message: `Code 分类「${name}」已创建。`, category };
    },
  },
  {
    name: 'update_code_category',
    module: 'code',
    tool: {
      name: 'update_code_category',
      description: '修改 Code 编码练习分类元信息。修改分类笔记内容请使用 update_code_category_note。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
        },
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const target = findCategory(categories, args);
      if (!target) return { success: false, error: '未找到分类。请先 query_code_categories 获取 categoryId。' };
      const nextName = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : target.name;
      if (invalidCategoryName(nextName)) return { success: false, error: '分类名称无效，不能使用默认/未分类/全部。' };
      if (nextName !== target.name && categories.some(category => category.id !== target.id && category.name === nextName)) {
        return { success: false, error: `分类「${nextName}」已存在。` };
      }
      const updated: PracticeCategory = {
        ...target,
        name: nextName,
        description: typeof args.description === 'string' ? args.description.trim() : target.description,
        icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : target.icon,
        color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : target.color,
      };
      saveCategories(categories.map(category => category.id === target.id ? updated : category));
      return { success: true, message: `Code 分类「${updated.name}」已更新。`, category: updated };
    },
  },
  {
    name: 'delete_code_category',
    module: 'code',
    tool: {
      name: 'delete_code_category',
      description: '删除 Code 编码练习分类。若分类下有练习，必须传 fallbackCategoryId 将练习迁移到另一个已有分类。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          fallbackCategoryId: { type: 'string', description: '分类下有练习时用于迁移的目标分类 ID' },
        },
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const target = findCategory(categories, args);
      if (!target) return { success: false, error: '未找到分类。请先 query_code_categories 获取 categoryId。' };
      const remainingCategories = categories.filter(category => category.id !== target.id);
      if (remainingCategories.length === 0) return { success: false, error: '至少保留一个 Code 分类。' };
      const sessions = loadSessions(categories);
      const affected = sessions.filter(session => session.categoryId === target.id);
      let nextSessions = sessions;
      if (affected.length > 0) {
        const fallback = remainingCategories.find(category => category.id === args.fallbackCategoryId);
        if (!fallback) {
          return { success: false, error: `分类「${target.name}」下还有 ${affected.length} 个练习，必须提供有效 fallbackCategoryId。` };
        }
        nextSessions = sessions.map(session => session.categoryId === target.id ? { ...session, categoryId: fallback.id, updatedAt: Date.now() } : session);
      }
      saveCategories(remainingCategories);
      saveSessions(normalizeSessionGroups(nextSessions, getSortedCategoryIds(remainingCategories), true));
      return { success: true, message: `Code 分类「${target.name}」已删除。`, movedExerciseCount: affected.length };
    },
  },
  {
    name: 'query_code_category_notes',
    module: 'code',
    tool: {
      name: 'query_code_category_notes',
      description: '查询 Code 分类笔记列表，只返回摘要和长度。',
      inputSchema: { type: 'object', properties: {} },
    },
    execute: async () => {
      const categories = loadCategories();
      return {
        success: true,
        notes: categories.map(category => ({
          categoryId: category.id,
          categoryName: category.name,
          length: category.noteContent.length,
          excerpt: category.noteContent.trim().slice(0, 160),
          updatedHint: '分类笔记存储在分类元数据中，没有独立更新时间。',
        })),
      };
    },
  },
  {
    name: 'read_code_category_note',
    module: 'code',
    tool: {
      name: 'read_code_category_note',
      description: '读取某个 Code 分类笔记 Markdown 内容。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
        },
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const category = findCategory(categories, args);
      if (!category) return { success: false, error: '未找到分类。请先 query_code_categories 获取 categoryId。' };
      return { success: true, categoryId: category.id, categoryName: category.name, content: category.noteContent, length: category.noteContent.length };
    },
  },
  {
    name: 'update_code_category_note',
    module: 'code',
    tool: {
      name: 'update_code_category_note',
      description: '更新某个 Code 分类笔记 Markdown 内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          content: { type: 'string' },
          append: { type: 'boolean', description: '为 true 时追加到现有笔记末尾；默认替换。' },
        },
        required: ['content'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const category = findCategory(categories, args);
      if (!category) return { success: false, error: '未找到分类。请先 query_code_categories 获取 categoryId。' };
      const content = typeof args.content === 'string' ? args.content : '';
      const nextContent = args.append && category.noteContent.trim()
        ? `${category.noteContent.trimEnd()}\n\n${content}`
        : content;
      const updated = { ...category, noteContent: nextContent };
      saveCategories(categories.map(item => item.id === category.id ? updated : item));
      return { success: true, message: `分类「${category.name}」笔记已更新。`, categoryId: category.id, length: nextContent.length };
    },
  },
  {
    name: 'delete_code_category_note',
    module: 'code',
    tool: {
      name: 'delete_code_category_note',
      description: '清空某个 Code 分类笔记内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
        },
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const category = findCategory(categories, args);
      if (!category) return { success: false, error: '未找到分类。请先 query_code_categories 获取 categoryId。' };
      saveCategories(categories.map(item => item.id === category.id ? { ...item, noteContent: '' } : item));
      return { success: true, message: `分类「${category.name}」笔记已清空。`, categoryId: category.id };
    },
  },
  {
    name: 'query_code_exercises',
    module: 'code',
    tool: {
      name: 'query_code_exercises',
      description: '查询 Code 编码练习，可按分类、关键词、语言过滤。默认返回文件摘要，不返回完整代码。',
      inputSchema: {
        type: 'object',
        properties: {
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          keyword: { type: 'string' },
          language: { type: 'string', enum: Object.keys(LANGUAGE_META) },
          includeFiles: { type: 'boolean', description: '是否返回每个文件完整内容，默认 false。' },
          limit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const category = findCategory(categories, args);
      const categoryById = new Map(categories.map(item => [item.id, item]));
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
      let sessions = loadSessions(categories);
      if (args.categoryId || args.categoryName) {
        if (!category) return { success: false, error: '指定分类不存在。请先 query_code_categories 获取 categoryId。' };
        sessions = sessions.filter(session => session.categoryId === category.id);
      }
      if (isPracticeLanguage(args.language)) sessions = sessions.filter(session => session.language === args.language);
      if (keyword) {
        sessions = sessions.filter(session => {
          const haystack = [
            session.title,
            LANGUAGE_META[session.language].label,
            categoryById.get(session.categoryId)?.name || '',
            ...session.files.map(file => `${file.name}\n${file.content}`),
          ].join('\n').toLowerCase();
          return haystack.includes(keyword);
        });
      }
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = normalizeLimit(args.limit, 20, 100);
      return {
        success: true,
        total: sessions.length,
        returned: Math.min(limit, sessions.length),
        exercises: sessions.slice(0, limit).map(session => summarizeSession(session, categoryById.get(session.categoryId), Boolean(args.includeFiles))),
      };
    },
  },
  {
    name: 'read_code_exercise',
    module: 'code',
    tool: {
      name: 'read_code_exercise',
      description: '读取某个 Code 编码练习完整内容，包含 input/code/output/notes 四个文件。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '练习 ID' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const session = sessions.find(item => item.id === args.id);
      if (!session) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 id。' };
      const category = categories.find(item => item.id === session.categoryId);
      return { success: true, exercise: summarizeSession(session, category, true) };
    },
  },
  {
    name: 'create_code_exercise',
    module: 'code',
    tool: {
      name: 'create_code_exercise',
      description: '创建 Code 编码练习。必须指定已有分类 categoryId/categoryName；可初始化 input/code/output/notes 文件内容。',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          language: { type: 'string', enum: Object.keys(LANGUAGE_META) },
          files: {
            type: 'object',
            properties: {
              input: { type: 'string' },
              code: { type: 'string' },
              output: { type: 'string' },
              notes: { type: 'string' },
            },
            description: '可选初始文件内容。',
          },
        },
        required: ['title'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const category = findCategory(categories, args);
      if (!category) return { success: false, error: '必须指定已有 Code 分类。请先 query_code_categories 获取 categoryId；没有合适分类时先 create_code_category。' };
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '编码练习';
      const language = isPracticeLanguage(args.language) ? args.language : 'cpp';
      const sessions = loadSessions(categories);
      const exercise = createSession(title, language, category.id, args.files && typeof args.files === 'object' ? args.files as Record<string, unknown> : undefined);
      const categorySessions = sessions.filter(session => session.categoryId === category.id);
      exercise.priority = categorySessions.length;
      const normalized = normalizeSessionGroups([exercise, ...sessions], getSortedCategoryIds(categories), true);
      saveSessions(normalized, exercise.id);
      return { success: true, message: `编码练习「${title}」已创建。`, exercise: summarizeSession(exercise, category, false) };
    },
  },
  {
    name: 'update_code_exercise',
    module: 'code',
    tool: {
      name: 'update_code_exercise',
      description: '修改 Code 编码练习标题、分类、语言、当前文件或多个文件内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          categoryId: { type: 'string' },
          categoryName: { type: 'string' },
          language: { type: 'string', enum: Object.keys(LANGUAGE_META) },
          resetCodeOnLanguageChange: { type: 'boolean', description: '切换语言时是否重置 code 文件为新语言模板。默认 false。' },
          activeFileId: { type: 'string', enum: ['input', 'code', 'output', 'notes'] },
          files: {
            type: 'object',
            properties: {
              input: { type: 'string' },
              code: { type: 'string' },
              output: { type: 'string' },
              notes: { type: 'string' },
            },
          },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const target = sessions.find(session => session.id === args.id);
      if (!target) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 id。' };
      const category = args.categoryId || args.categoryName ? findCategory(categories, args) : categories.find(item => item.id === target.categoryId);
      if ((args.categoryId || args.categoryName) && !category) return { success: false, error: '目标分类不存在。请先 query_code_categories 获取 categoryId。' };
      const nextLanguage = isPracticeLanguage(args.language) ? args.language : target.language;
      const filesArg = args.files && typeof args.files === 'object' ? args.files as Record<string, unknown> : {};
      const updated: CodingPracticeSession = {
        ...target,
        title: typeof args.title === 'string' && args.title.trim() ? args.title.trim() : target.title,
        categoryId: category?.id || target.categoryId,
        language: nextLanguage,
        activeFileId: isPracticeFileId(args.activeFileId) ? args.activeFileId : target.activeFileId,
        files: target.files.map((file) => {
          const contentOverride = filesArg[file.id];
          if (file.id === 'code') {
            return {
              ...file,
              name: getCodeFileName(nextLanguage),
              editorLanguage: LANGUAGE_META[nextLanguage].editorLanguage,
              content: typeof contentOverride === 'string'
                ? contentOverride
                : (nextLanguage !== target.language && args.resetCodeOnLanguageChange ? LANGUAGE_META[nextLanguage].starterCode : file.content),
            };
          }
          return typeof contentOverride === 'string' ? { ...file, content: contentOverride } : file;
        }),
        updatedAt: Date.now(),
      };
      const normalized = normalizeSessionGroups(sessions.map(session => session.id === updated.id ? updated : session), getSortedCategoryIds(categories), true);
      saveSessions(normalized, updated.id);
      return { success: true, message: `编码练习「${updated.title}」已更新。`, exercise: summarizeSession(updated, category, false) };
    },
  },
  {
    name: 'delete_code_exercise',
    module: 'code',
    tool: {
      name: 'delete_code_exercise',
      description: '删除 Code 编码练习。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const target = sessions.find(session => session.id === args.id);
      if (!target) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 id。' };
      const remaining = sessions.filter(session => session.id !== target.id);
      saveSessions(normalizeSessionGroups(remaining, getSortedCategoryIds(categories), true), remaining[0]?.id);
      return { success: true, message: `编码练习「${target.title}」已删除。` };
    },
  },
  {
    name: 'read_code_exercise_file',
    module: 'code',
    tool: {
      name: 'read_code_exercise_file',
      description: '读取 Code 编码练习中的单个文件。fileId 可为 input/code/output/notes；界面中 input 和 output 合并显示为 io。',
      inputSchema: {
        type: 'object',
        properties: {
          exerciseId: { type: 'string' },
          fileId: { type: 'string', enum: ['input', 'code', 'output', 'notes'] },
        },
        required: ['exerciseId', 'fileId'],
      },
    },
    execute: async (args) => {
      const sessions = loadSessions();
      const session = sessions.find(item => item.id === args.exerciseId);
      if (!session) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 exerciseId。' };
      if (!isPracticeFileId(args.fileId)) return { success: false, error: 'fileId 必须是 input/code/output/notes。' };
      const file = session.files.find(item => item.id === args.fileId);
      if (!file) return { success: false, error: `练习中不存在文件 ${args.fileId}。` };
      return { success: true, exerciseId: session.id, exerciseTitle: session.title, file };
    },
  },
  {
    name: 'update_code_exercise_file',
    module: 'code',
    tool: {
      name: 'update_code_exercise_file',
      description: '更新 Code 编码练习中的单个文件内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          exerciseId: { type: 'string' },
          fileId: { type: 'string', enum: ['input', 'code', 'output', 'notes'] },
          content: { type: 'string' },
          append: { type: 'boolean', description: '为 true 时追加到现有内容末尾；默认替换。' },
        },
        required: ['exerciseId', 'fileId', 'content'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const target = sessions.find(session => session.id === args.exerciseId);
      if (!target) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 exerciseId。' };
      if (!isPracticeFileId(args.fileId)) return { success: false, error: 'fileId 必须是 input/code/output/notes。' };
      const content = typeof args.content === 'string' ? args.content : '';
      const updated: CodingPracticeSession = {
        ...target,
        activeFileId: args.fileId,
        files: target.files.map(file => {
          if (file.id !== args.fileId) return file;
          const nextContent = args.append && file.content.trim()
            ? `${file.content.trimEnd()}\n\n${content}`
            : content;
          return { ...file, content: nextContent };
        }),
        updatedAt: Date.now(),
      };
      saveSessions(sessions.map(session => session.id === updated.id ? updated : session), updated.id);
      const file = updated.files.find(item => item.id === args.fileId);
      return { success: true, message: `练习「${updated.title}」的 ${args.fileId} 已更新。`, file };
    },
  },
  {
    name: 'clear_code_exercise_file',
    module: 'code',
    tool: {
      name: 'clear_code_exercise_file',
      description: '清空 Code 编码练习中的单个文件内容。该操作会触发确认和快照回退。',
      inputSchema: {
        type: 'object',
        properties: {
          exerciseId: { type: 'string' },
          fileId: { type: 'string', enum: ['input', 'code', 'output', 'notes'] },
        },
        required: ['exerciseId', 'fileId'],
      },
    },
    execute: async (args) => {
      const categories = loadCategories();
      const sessions = loadSessions(categories);
      const target = sessions.find(session => session.id === args.exerciseId);
      if (!target) return { success: false, error: '未找到练习。请先 query_code_exercises 获取 exerciseId。' };
      if (!isPracticeFileId(args.fileId)) return { success: false, error: 'fileId 必须是 input/code/output/notes。' };
      const updated: CodingPracticeSession = {
        ...target,
        activeFileId: args.fileId,
        files: target.files.map(file => file.id === args.fileId ? { ...file, content: '' } : file),
        updatedAt: Date.now(),
      };
      saveSessions(sessions.map(session => session.id === updated.id ? updated : session), updated.id);
      return { success: true, message: `练习「${updated.title}」的 ${args.fileId} 已清空。` };
    },
  },
];
