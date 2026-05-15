import type { ToolRegistration } from '../toolRegistry';
import { ensureDirectory, getModulePath, sanitizeName, type SectionType } from '../../../utils/learningStorage';
import { parseLeetCodeMarkdown } from '../../../utils/leetcodeParser';
import { LEETCODE_DATA } from '../../../components/LeetCodeData';
import { LEETCODE_HOT100_DATA } from '../../../components/LeetCodeHot100Data';
import { LUOGU_9391_DATA } from '../../../components/Luogu9391Data';

const LEARNING_CATEGORIES_STORAGE_KEY = 'learning_categories_v1';
const LEARNING_COURSES_STORAGE_KEY = 'learning_courses_v1';
const LEETCODE_LISTS_STORAGE_KEY = 'leetcode_lists';
const LEETCODE_PROGRESS_STORAGE_KEY = 'leetcode_progress';
type LearningSection = 'resources' | 'assignments' | 'personal' | 'custom';

const agentLearningId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const BUILTIN_LEARNING_SECTIONS = [
  { id: 'resources', title: '学习内容', kind: 'builtin', description: '课程讲义和学习内容' },
  { id: 'assignments', title: '学习练习', kind: 'builtin', description: '课程练习、作业和实践资源' },
  { id: 'personal', title: '其它资源', kind: 'builtin', description: '其它资料、链接和个人资源' },
] as const;

const loadLearningCategories = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem(LEARNING_CATEGORIES_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const loadLearningCourses = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem(LEARNING_COURSES_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveLearningCategories = (categories: any[]) => {
  localStorage.setItem(LEARNING_CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
  window.dispatchEvent(new CustomEvent('learning-data-updated'));
};

const saveLearningCourses = (courses: any[]) => {
  localStorage.setItem(LEARNING_COURSES_STORAGE_KEY, JSON.stringify(courses));
  window.dispatchEvent(new CustomEvent('learning-data-updated'));
};

const summarizeLearningCourse = (course: any, categories: any[]) => ({
  id: course.id,
  title: course.title,
  description: course.description || null,
  categoryId: course.categoryId,
  categoryName: categories.find((cat: any) => cat.id === course.categoryId)?.name || course.categoryId,
  moduleCount: (course.modules || []).length,
  lectureCount: (course.modules || []).reduce((n: number, m: any) => n + (m.lectures || []).length, 0),
  assignmentModuleCount: (course.assignmentModules || []).length,
  assignmentCount: (course.assignmentModules || []).reduce((n: number, m: any) => n + (m.items || []).length, 0),
  personalModuleCount: (course.personalModules || []).length,
  personalItemCount: (course.personalModules || []).reduce((n: number, m: any) => n + (m.items || []).length, 0),
  customSectionCount: (course.customSections || []).length,
  priority: course.priority ?? 10,
});

const summarizeLearningCategory = (category: any, courses: any[] = []) => ({
  id: category.id,
  name: category.name,
  description: category.description || '',
  icon: category.icon || 'BookOpen',
  color: category.color || 'blue',
  priority: category.priority ?? 50,
  courseCount: courses.filter((course: any) => course.categoryId === category.id).length,
});

const summarizeLearningModule = (module: any, section: LearningSection) => ({
  id: module.id,
  title: module.title,
  description: module.description || '',
  order: module.order ?? 0,
  itemCount: section === 'resources' ? (module.lectures || []).length : (module.items || []).length,
});

const summarizeLearningSection = (course: any, sectionId: string) => {
  if (sectionId === 'resources' || sectionId === 'assignments' || sectionId === 'personal') {
    const section = sectionId as LearningSection;
    const meta = BUILTIN_LEARNING_SECTIONS.find(item => item.id === sectionId);
    const modules = getLearningSectionModules(course, section) || [];
    return {
      ...meta,
      moduleCount: modules.length,
      itemCount: modules.reduce((total: number, module: any) => (
        total + (section === 'resources' ? (module.lectures || []).length : (module.items || []).length)
      ), 0),
      modules: modules.map((module: any) => summarizeLearningModule(module, section)),
    };
  }

  const customSection = (Array.isArray(course.customSections) ? course.customSections : []).find((item: any) => item.id === sectionId);
  if (!customSection) return null;
  const modules = Array.isArray(customSection.modules) ? customSection.modules : [];
  return {
    id: customSection.id,
    title: customSection.title,
    kind: 'custom',
    icon: customSection.icon || 'Star',
    color: customSection.color || 'blue',
    order: customSection.order ?? 0,
    moduleCount: modules.length,
    itemCount: modules.reduce((total: number, module: any) => total + (module.items || []).length, 0),
    modules: modules.map((module: any) => summarizeLearningModule(module, 'custom')),
  };
};

const getLearningCourse = (courses: any[], args: Record<string, any>) => {
  const id = typeof args.courseId === 'string' ? args.courseId.trim() : '';
  const title = typeof args.courseTitle === 'string' ? args.courseTitle.trim() : '';
  return (id ? courses.find((course: any) => course.id === id) : undefined)
    || (title ? courses.find((course: any) => course.title === title) : undefined);
};

const getLearningSectionModules = (course: any, section: LearningSection, customSectionId?: string) => {
  if (section === 'resources') {
    course.modules = Array.isArray(course.modules) ? course.modules : [];
    return course.modules;
  }
  if (section === 'assignments') {
    course.assignmentModules = Array.isArray(course.assignmentModules) ? course.assignmentModules : [];
    return course.assignmentModules;
  }
  if (section === 'personal') {
    course.personalModules = Array.isArray(course.personalModules) ? course.personalModules : [];
    return course.personalModules;
  }
  course.customSections = Array.isArray(course.customSections) ? course.customSections : [];
  const customSection = course.customSections.find((item: any) => item.id === customSectionId);
  if (!customSection) return null;
  customSection.modules = Array.isArray(customSection.modules) ? customSection.modules : [];
  return customSection.modules;
};

const getLearningSection = (course: any, args: Record<string, any>) => {
  const sectionId = typeof args.sectionId === 'string' ? args.sectionId.trim() : '';
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  course.customSections = Array.isArray(course.customSections) ? course.customSections : [];
  return (sectionId ? course.customSections.find((item: any) => item.id === sectionId) : undefined)
    || (title ? course.customSections.find((item: any) => item.title === title) : undefined);
};

const getLearningModule = (course: any, args: Record<string, any>) => {
  const section = normalizeLearningSection(args.section);
  const customSectionId = typeof args.customSectionId === 'string' ? args.customSectionId.trim() : undefined;
  const modules = getLearningSectionModules(course, section, customSectionId);
  if (!modules) return { section, modules: null, module: null };
  const moduleId = typeof args.moduleId === 'string' ? args.moduleId.trim() : '';
  const moduleTitle = typeof args.moduleTitle === 'string' ? args.moduleTitle.trim() : '';
  const module = (moduleId ? modules.find((item: any) => item.id === moduleId) : undefined)
    || (moduleTitle ? modules.find((item: any) => item.title === moduleTitle) : undefined)
    || null;
  return { section, modules, module };
};

const getLearningItem = (module: any, section: LearningSection, args: Record<string, any>) => {
  const collectionKey = section === 'resources' ? 'lectures' : 'items';
  module[collectionKey] = Array.isArray(module[collectionKey]) ? module[collectionKey] : [];
  const itemId = typeof args.itemId === 'string' ? args.itemId.trim() : '';
  const itemTitle = typeof args.itemTitle === 'string' ? args.itemTitle.trim() : '';
  const item = (itemId ? module[collectionKey].find((entry: any) => entry.id === itemId) : undefined)
    || (itemTitle ? module[collectionKey].find((entry: any) => entry.title === itemTitle) : undefined)
    || null;
  return { collectionKey, item };
};

const normalizeLearningSection = (value: unknown): LearningSection => {
  const section = String(value || 'resources');
  if (['resources', 'assignments', 'personal', 'custom'].includes(section)) return section as LearningSection;
  return 'resources';
};

const getStorageSection = (section: LearningSection): SectionType =>
  section === 'assignments' ? 'assignments' : section === 'resources' ? 'resources' : 'personal';

const safeLearningMarkdownFileName = (title: string, id: string, order: number) => {
  const name = sanitizeName(title || id || 'content').replace(/\s+/g, '-').slice(0, 64) || id || 'content';
  return `${String(order + 1).padStart(2, '0')}-${name}.md`;
};

const writeLearningMarkdownForItem = async (
  course: any,
  section: LearningSection,
  moduleId: string,
  item: any,
  contentMarkdown?: string,
) => {
  if (typeof contentMarkdown !== 'string') return;
  const storageSection = getStorageSection(section);
  const modulePath = await getModulePath(course.categoryId, course.id, storageSection, moduleId);
  await ensureDirectory(modulePath);
  const order = Number.isFinite(Number(item.order)) ? Number(item.order) : 0;
  const current = section === 'resources' ? item.materials : item.link;
  const currentFile = typeof current === 'string' && current.trim() && !/^https?:\/\//i.test(current) && !current.startsWith('/')
    ? current.trim()
    : '';
  const fileName = currentFile && /\.md$/i.test(currentFile)
    ? currentFile
    : safeLearningMarkdownFileName(item.title, item.id, order);
  const destPath = await window.electronAPI.pathJoin(modulePath, fileName);
  await window.electronAPI.writeFile(destPath, contentMarkdown);
  if (section === 'resources') {
    item.materials = destPath;
  } else {
    item.link = destPath;
  }
};

const readLearningMarkdownForItem = async (section: LearningSection, item: any) => {
  const path = section === 'resources' ? item?.materials : item?.link;
  if (typeof path !== 'string' || !path.trim() || /^https?:\/\//i.test(path)) return null;
  if (!window.electronAPI?.readFile) return null;
  try {
    return await window.electronAPI.readFile(path);
  } catch {
    return null;
  }
};

const notifyLeetCodeUpdated = () => {
  window.dispatchEvent(new CustomEvent('leetcode-data-updated'));
};

const getDefaultLeetCodeLists = () => [
  {
    id: 'default',
    title: '基础算法精讲',
    description: '灵茶山艾府 - 基础算法精讲 · 题目汇总',
    categories: parseLeetCodeMarkdown(LEETCODE_DATA),
    createdAt: Date.now(),
    rawMarkdown: LEETCODE_DATA,
    priority: 0,
  },
  {
    id: 'luogu-9391',
    title: '能力全面提升综合题单',
    description: '洛谷 - 能力全面提升综合题单 · 题目汇总',
    categories: parseLeetCodeMarkdown(LUOGU_9391_DATA),
    createdAt: Date.now(),
    rawMarkdown: LUOGU_9391_DATA,
    priority: 1,
  },
  {
    id: 'leetcode-hot-100',
    title: 'LeetCode 热题 100',
    description: 'LeetCode 热题 100 · 题目汇总',
    categories: parseLeetCodeMarkdown(LEETCODE_HOT100_DATA),
    createdAt: Date.now(),
    rawMarkdown: LEETCODE_HOT100_DATA,
    priority: 2,
  },
];

const mergeDefaultLeetCodeLists = (lists: any[]) => {
  const merged = [...lists];
  for (const defaultList of getDefaultLeetCodeLists()) {
    const index = merged.findIndex((list: any) => list.id === defaultList.id);
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        title: defaultList.title,
        description: defaultList.description,
        categories: defaultList.categories,
        rawMarkdown: defaultList.rawMarkdown,
        priority: merged[index].priority ?? defaultList.priority,
      };
    } else {
      merged.push(defaultList);
    }
  }
  return merged;
};

const loadLeetCodeLists = (): any[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEETCODE_LISTS_STORAGE_KEY) || '[]');
    return mergeDefaultLeetCodeLists(Array.isArray(parsed) ? parsed : []);
  } catch {
    return getDefaultLeetCodeLists();
  }
};

const saveLeetCodeLists = (lists: any[]) => {
  const normalized = lists
    .map(list => ({
      ...list,
      categories: Array.isArray(list.categories) ? list.categories : [],
      priority: Number.isFinite(Number(list.priority)) ? Number(list.priority) : 10,
    }))
    .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
  localStorage.setItem(LEETCODE_LISTS_STORAGE_KEY, JSON.stringify(normalized));
  notifyLeetCodeUpdated();
};

const loadLeetCodeProgress = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(LEETCODE_PROGRESS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const saveLeetCodeProgress = (progress: Record<string, boolean>) => {
  localStorage.setItem(LEETCODE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  notifyLeetCodeUpdated();
};

const getLeetCodeList = (lists: any[], args: Record<string, any>) => {
  const id = typeof args.listId === 'string' ? args.listId.trim() : '';
  const title = typeof args.listTitle === 'string' ? args.listTitle.trim() : '';
  return (id ? lists.find((list: any) => list.id === id) : undefined)
    || (title ? lists.find((list: any) => list.title === title) : undefined)
    || null;
};

const getLeetCodeCategoryIndex = (list: any, args: Record<string, any>) => {
  list.categories = Array.isArray(list.categories) ? list.categories : [];
  if (typeof args.categoryIndex === 'number' && args.categoryIndex >= 0 && args.categoryIndex < list.categories.length) {
    return Math.floor(args.categoryIndex);
  }
  const title = typeof args.categoryTitle === 'string' ? args.categoryTitle.trim() : '';
  if (!title) return -1;
  return list.categories.findIndex((category: any) => category.title === title);
};

const getLeetCodeProblemIndex = (category: any, args: Record<string, any>) => {
  category.problems = Array.isArray(category.problems) ? category.problems : [];
  if (typeof args.problemIndex === 'number' && args.problemIndex >= 0 && args.problemIndex < category.problems.length) {
    return Math.floor(args.problemIndex);
  }
  const url = typeof args.url === 'string' ? args.url.trim() : '';
  const title = typeof args.problemTitle === 'string' ? args.problemTitle.trim() : '';
  return category.problems.findIndex((problem: any) => (
    (url && problem.url === url) ||
    (title && problem.title === title)
  ));
};

const formatLeetCodeMarkdownLink = (text: string, url?: string) => {
  const label = String(text || '').trim();
  const href = String(url || '').trim();
  if (!label || !href) return '';
  return `[${label.replace(/\|/g, '\\|')}](${href})`;
};

const buildLeetCodeMarkdown = (categories: any[]) => (Array.isArray(categories) ? categories : [])
  .map(category => {
    const lines = [
      `### ${String(category.title || '未命名分组').trim()}`,
      '|题目|相关链接|备注|',
      '|---|---|---|',
    ];
    (Array.isArray(category.problems) ? category.problems : []).forEach((problem: any) => {
      const problemLink = formatLeetCodeMarkdownLink(problem.title, problem.url);
      const codeLink = formatLeetCodeMarkdownLink(problem.codeText || '相关链接', problem.codeUrl);
      const note = String(problem.note || '').replace(/\n/g, ' ').replace(/\|/g, '\\|');
      lines.push(`|${problemLink}|${codeLink}|${note}|`);
    });
    return lines.join('\n');
  })
  .join('\n\n');

const syncLeetCodeRawMarkdown = (list: any) => {
  list.categories = Array.isArray(list.categories) ? list.categories : [];
  list.rawMarkdown = buildLeetCodeMarkdown(list.categories);
};

const makeLeetCodeProblem = (args: Record<string, any>) => {
  const title = String(args.title || args.problemTitle || '').trim();
  const url = String(args.url || '').trim();
  if (!title) return { error: '题目标题不能为空。' };
  if (!url) return { error: '题目 URL 不能为空。' };
  return {
    problem: {
      title,
      url,
      codeUrl: typeof args.codeUrl === 'string' && args.codeUrl.trim() ? args.codeUrl.trim() : undefined,
      codeText: typeof args.codeText === 'string' && args.codeText.trim() ? args.codeText.trim() : undefined,
      note: typeof args.note === 'string' ? args.note.trim() : '',
    },
  };
};

const summarizeLeetCodeList = (list: any, progress: Record<string, boolean>) => {
  const categories = Array.isArray(list.categories) ? list.categories : [];
  const total = categories.reduce((count: number, category: any) => count + (Array.isArray(category.problems) ? category.problems.length : 0), 0);
  const completed = categories.reduce((count: number, category: any) => (
    count + (Array.isArray(category.problems) ? category.problems.filter((problem: any) => progress[problem.url]).length : 0)
  ), 0);
  return {
    id: list.id,
    title: list.title,
    description: list.description || null,
    priority: list.priority ?? 10,
    categoryCount: categories.length,
    problemCount: total,
    completedCount: completed,
    pendingCount: Math.max(total - completed, 0),
    completionPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
    createdAt: list.createdAt ? new Date(list.createdAt).toLocaleString('zh-CN') : null,
  };
};

export const LEARNING_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
      name: 'create_leetcode_list',
      module: 'leetcode',
      tool: {
        name: 'create_leetcode_list',
        description: '创建一个 LeetCode 题单，由若干分组构成，每组包含多道题目。',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '题单标题' },
            description: { type: 'string', description: '题单描述（可选）' },
            priority: { type: 'number', description: '排序优先级，数字越小越靠前，默认 10' },
            groups: {
              type: 'array',
              description: '题目分组列表',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: '分组名称，如"基础 DP"' },
                  problems: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: '题目完整标题，如 "70. 爬楼梯"' },
                        url: { type: 'string', description: 'LeetCode 题目链接，如 "https://leetcode.cn/problems/climbing-stairs/"' },
                        codeUrl: { type: 'string', description: '题解、代码或笔记链接（可选）' },
                        codeText: { type: 'string', description: '题解链接显示文字（可选）' },
                        note: { type: 'string', description: '备注信息（可选）' },
                      },
                      required: ['title', 'url'],
                    },
                  },
                },
                required: ['name', 'problems'],
              },
            },
          },
          required: ['title', 'groups'],
        },
      },
      execute: async (args, _ctx) => {
        const groups = Array.isArray(args.groups) ? args.groups : [];
        const mdLines: string[] = [];
        const categories: { title: string; problems: { title: string; url: string; codeUrl?: string; codeText?: string; note?: string }[] }[] = [];
        for (const group of groups) {
          const groupName = String(group.name || '').trim() || '未命名分组';
          mdLines.push(`### ${groupName}`);
          mdLines.push('| 题目 | 相关链接 | 备注 |');
          mdLines.push('|---|---|---|');
          const problems: { title: string; url: string; codeUrl?: string; codeText?: string; note?: string }[] = [];
          for (const p of (Array.isArray(group.problems) ? group.problems : [])) {
            const title = String(p.title || '').trim();
            const url = String(p.url || '').trim();
            if (!title || !url) continue;
            const problem = {
              title,
              url,
              codeUrl: typeof p.codeUrl === 'string' && p.codeUrl.trim() ? p.codeUrl.trim() : undefined,
              codeText: typeof p.codeText === 'string' && p.codeText.trim() ? p.codeText.trim() : undefined,
              note: typeof p.note === 'string' ? p.note.trim() : undefined,
            };
            const problemLink = formatLeetCodeMarkdownLink(problem.title, problem.url);
            const codeLink = formatLeetCodeMarkdownLink(problem.codeText || '相关链接', problem.codeUrl);
            mdLines.push(`| ${problemLink} | ${codeLink} | ${problem.note || ''} |`);
            problems.push(problem);
          }
          categories.push({ title: groupName, problems });
          mdLines.push('');
        }
        const rawMarkdown = mdLines.join('\n');
        const totalProblems = categories.reduce((n, g) => n + g.problems.length, 0);
        const newList = {
          id: Date.now().toString(),
          title: String(args.title || '').trim(),
          description: String(args.description || '').trim(),
          priority: Number(args.priority) || 10,
          categories,
          rawMarkdown,
          createdAt: Date.now(),
        };
        const existing: any[] = loadLeetCodeLists();
        existing.push(newList);
        saveLeetCodeLists(existing);
        return { success: true, message: `题单「${newList.title}」已创建，包含 ${categories.length} 个分组共 ${totalProblems} 道题。` };
      },
    },
  {
      name: 'create_learning_course',
      module: 'learning',
      tool: {
        name: 'create_learning_course',
        description: '在学习中心创建一个完整的结构化课程（含学习模块、讲义、练习、个人资源、自定义分区）。调用前必须先 query_learning_courses 或 query_learning_categories 获取已有学习方向 ID，然后用 categoryId 指定方向；不能自动创建默认方向。',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '课程标题' },
            description: { type: 'string', description: '课程简介' },
            categoryId: { type: 'string', description: '所属学习方向的唯一 ID（从 query_learning_courses 或 query_learning_categories 返回的 categories[].id 获取）。' },
            introMarkdown: { type: 'string', description: '课程总览 Markdown（支持 # 标题、列表等）' },
            icon: { type: 'string', description: 'Lucide 图标名，如 "BookOpen"、"Code2"' },
            priority: { type: 'number', description: '排序优先级，默认 10' },
            modules: {
              type: 'array',
              description: '学习内容模块列表，每个模块包含多个讲义',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '模块标题，如 "第一章 基础概念"' },
                  description: { type: 'string', description: '模块描述' },
                  lectures: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: '讲义标题' },
                        lecturer: { type: 'string', description: '讲师/来源' },
                        date: { type: 'string', description: '日期，如 "2025-01-15"' },
                        desc: { type: 'string', description: '讲义描述' },
                        icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe', 'music', 'image'], description: '图标类型' },
                      },
                      required: ['title'],
                    },
                  },
                },
                required: ['title'],
              },
            },
            assignmentModules: {
              type: 'array',
              description: '练习模块列表',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '练习模块标题' },
                  description: { type: 'string', description: '描述' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: '练习项标题' },
                        link: { type: 'string', description: '链接（可选）' },
                        icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                      },
                      required: ['title'],
                    },
                  },
                },
                required: ['title'],
              },
            },
            personalModules: {
              type: 'array',
              description: '个人资源模块列表',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '资源模块标题' },
                  description: { type: 'string', description: '描述' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: '资源项标题' },
                        link: { type: 'string', description: '链接（可选）' },
                        icon: { type: 'string', enum: ['link', 'video', 'file', 'book', 'code', 'globe'], description: '图标' },
                      },
                      required: ['title'],
                    },
                  },
                },
                required: ['title'],
              },
            },
            customSections: {
              type: 'array',
              description: '自定义分区列表（用户自定义的额外板块）',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: '分区标题' },
                  icon: { type: 'string', description: 'Lucide 图标名，如 "Star"' },
                  color: { type: 'string', enum: ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan', 'amber'], description: '颜色' },
                  modules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: { title: { type: 'string' }, link: { type: 'string' }, icon: { type: 'string' } },
                            required: ['title'],
                          },
                        },
                      },
                      required: ['title'],
                    },
                  },
                },
                required: ['title'],
              },
            },
          },
          required: ['title', 'categoryId'],
        },
      },
      execute: async (args, _ctx) => {
        const title = String(args.title || '').trim();
        const description = String(args.description || '').trim();
        const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
        let targetCategory: any = null;
        // 优先用 categoryId 精确匹配
        if (args.categoryId) {
          targetCategory = cats.find((c: any) => c.id === String(args.categoryId).trim());
          if (!targetCategory) {
            const available = cats.map((c: any) => `${c.name}(${c.id})`).join('、') || '（暂无）';
            return { success: false, error: `分类 ID「${args.categoryId}」不存在。当前可用分类：${available}。请先调用 query_learning_courses 获取正确的分类 ID。` };
          }
        } else {
          return { success: false, error: '必须提供已有学习方向的 categoryId。若没有合适方向，请先调用 create_learning_category 创建方向。' };
        }

        const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const courseId = genId('course');

        // 构建 modules
        const modules = (Array.isArray(args.modules) ? args.modules : []).map((m: any) => ({
          id: genId('mod'),
          title: String(m.title || ''),
          description: String(m.description || ''),
          lectures: (Array.isArray(m.lectures) ? m.lectures : []).map((l: any) => ({
            id: genId('lec'),
            title: String(l.title || ''),
            lecturer: String(l.lecturer || ''),
            materials: '',
            date: String(l.date || ''),
            desc: String(l.desc || ''),
            icon: l.icon || undefined,
          })),
        }));

        // 构建 assignmentModules
        const assignmentModules = (Array.isArray(args.assignmentModules) ? args.assignmentModules : []).map((m: any) => ({
          id: genId('amod'),
          title: String(m.title || ''),
          description: String(m.description || ''),
          items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
            id: genId('ai'),
            title: String(i.title || ''),
            link: String(i.link || ''),
            icon: i.icon || undefined,
          })),
        }));

        // 构建 personalModules
        const personalModules = (Array.isArray(args.personalModules) ? args.personalModules : []).map((m: any) => ({
          id: genId('pmod'),
          title: String(m.title || ''),
          description: String(m.description || ''),
          items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
            id: genId('pi'),
            title: String(i.title || ''),
            link: String(i.link || ''),
            icon: i.icon || undefined,
          })),
        }));

        // 构建 customSections
        const customSections = (Array.isArray(args.customSections) ? args.customSections : []).map((s: any) => ({
          id: genId('csec'),
          title: String(s.title || ''),
          icon: String(s.icon || 'Star'),
          color: String(s.color || 'blue'),
          modules: (Array.isArray(s.modules) ? s.modules : []).map((m: any) => ({
            id: genId('cm'),
            title: String(m.title || ''),
            description: String(m.description || ''),
            items: (Array.isArray(m.items) ? m.items : []).map((i: any) => ({
              id: genId('ci'),
              title: String(i.title || ''),
              link: String(i.link || ''),
              icon: i.icon || undefined,
            })),
          })),
        }));

        const totalLectures = modules.reduce((n: number, m: any) => n + m.lectures.length, 0);
        const totalAssignments = assignmentModules.reduce((n: number, m: any) => n + m.items.length, 0);

        const newCourse = {
          id: courseId,
          title,
          description,
          categoryId: targetCategory.id,
          modules,
          assignments: [],
          assignmentModules,
          personalModules,
          customSections,
          introMarkdown: String(args.introMarkdown || '').trim() || `# ${title}\n\n${description || '在这里编写学习总览...'}`,
          icon: args.icon || undefined,
          priority: Number(args.priority) || 10,
        };
        const courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
        courses.push(newCourse);
        localStorage.setItem('learning_courses_v1', JSON.stringify(courses));
        // 通知 LearningManager 重新读取
        window.dispatchEvent(new CustomEvent('learning-data-updated'));

        const parts = [`课程「${title}」已创建，归属分类「${targetCategory.name}」`];
        if (modules.length > 0) parts.push(`${modules.length} 个学习模块（${totalLectures} 个讲义）`);
        if (assignmentModules.length > 0) parts.push(`${assignmentModules.length} 个练习模块（${totalAssignments} 个练习项）`);
        if (personalModules.length > 0) parts.push(`${personalModules.length} 个个人资源模块`);
        if (customSections.length > 0) parts.push(`${customSections.length} 个自定义分区`);
        return { success: true, message: parts.join('，') + '。' };
      },
    },
  {
      name: 'query_leetcode_lists',
      module: 'leetcode',
      tool: {
        name: 'query_leetcode_lists',
        description: '查询所有 LeetCode 题单，返回标题、描述、分组数和题目总数。创建新题单前可先调用以避免重复。',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      execute: async (_args, ctx) => {
        if (!ctx.dataPermissions.leetcodeLists.read) return { success: false, error: '题单查询未授权。请点击 🔒 按钮，在权限面板中开启「题单」读取权限。' };
        const lists = loadLeetCodeLists();
        const progress = loadLeetCodeProgress();
        return {
          success: true,
          total: lists.length,
          lists: lists.map((list: any) => summarizeLeetCodeList(list, progress)),
        };
      },
    },
  {
      name: 'read_leetcode_list',
      module: 'leetcode',
      tool: {
        name: 'read_leetcode_list',
        description: '读取一个题单的完整内容，包括分组、题目和每道题完成状态。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: '题单 ID，优先使用 query_leetcode_lists 返回的 id。' },
            listTitle: { type: 'string', description: '题单标题，未提供 listId 时可用。' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.leetcodeLists.read) return { success: false, error: '题单读取未授权。' };
        const lists = loadLeetCodeLists();
        const progress = loadLeetCodeProgress();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。请先调用 query_leetcode_lists 获取 listId。' };
        const categories = (Array.isArray(list.categories) ? list.categories : []).map((category: any, categoryIndex: number) => ({
          title: category.title,
          categoryIndex,
          problems: (Array.isArray(category.problems) ? category.problems : []).map((problem: any, problemIndex: number) => ({
            ...problem,
            problemIndex,
            completed: Boolean(progress[problem.url]),
          })),
        }));
        return {
          success: true,
          summary: summarizeLeetCodeList(list, progress),
          list: { ...list, categories },
        };
      },
    },
  {
      name: 'update_leetcode_list',
      module: 'leetcode',
      tool: {
        name: 'update_leetcode_list',
        description: '修改题单基础信息；若传 categories 会整体替换题单内容。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            listTitle: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'number' },
            categories: {
              type: 'array',
              description: '可选：整体替换题单分组内容。',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  problems: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        url: { type: 'string' },
                        codeUrl: { type: 'string' },
                        codeText: { type: 'string' },
                        note: { type: 'string' },
                      },
                      required: ['title', 'url'],
                    },
                  },
                },
                required: ['title'],
              },
            },
          },
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        if (typeof args.title === 'string' && args.title.trim()) list.title = args.title.trim();
        if (typeof args.description === 'string') list.description = args.description.trim();
        if (typeof args.priority === 'number') list.priority = args.priority;
        if (Array.isArray(args.categories)) {
          list.categories = args.categories.map((category: any) => ({
            title: String(category.title || '').trim() || '未命名分组',
            problems: (Array.isArray(category.problems) ? category.problems : []).map((problem: any) => ({
              title: String(problem.title || '').trim(),
              url: String(problem.url || '').trim(),
              codeUrl: typeof problem.codeUrl === 'string' && problem.codeUrl.trim() ? problem.codeUrl.trim() : undefined,
              codeText: typeof problem.codeText === 'string' && problem.codeText.trim() ? problem.codeText.trim() : undefined,
              note: typeof problem.note === 'string' ? problem.note.trim() : '',
            })).filter((problem: any) => problem.title && problem.url),
          }));
          syncLeetCodeRawMarkdown(list);
        }
        saveLeetCodeLists(lists);
        return { success: true, message: `题单「${list.title}」已更新`, list: summarizeLeetCodeList(list, loadLeetCodeProgress()) };
      },
    },
  {
      name: 'delete_leetcode_list',
      module: 'leetcode',
      tool: {
        name: 'delete_leetcode_list',
        description: '删除一个题单。默认保留全局完成状态；若 clearProgress=true，会清除该题单内题目的完成状态。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            listTitle: { type: 'string' },
            clearProgress: { type: 'boolean' },
          },
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        if (args.clearProgress === true) {
          const progress = loadLeetCodeProgress();
          (list.categories || []).forEach((category: any) => {
            (category.problems || []).forEach((problem: any) => {
              if (problem.url) delete progress[problem.url];
            });
          });
          saveLeetCodeProgress(progress);
        }
        saveLeetCodeLists(lists.filter((item: any) => item.id !== list.id));
        return { success: true, message: `题单「${list.title}」已删除` };
      },
    },
  {
      name: 'create_leetcode_group',
      module: 'leetcode',
      tool: {
        name: 'create_leetcode_group',
        description: '在题单中新增一个分组。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            title: { type: 'string', description: '分组标题。' },
            index: { type: 'number', description: '插入位置；不传则追加。' },
          },
          required: ['listId', 'title'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        list.categories = Array.isArray(list.categories) ? list.categories : [];
        const title = String(args.title || '').trim();
        if (!title) return { success: false, error: '分组标题不能为空。' };
        if (list.categories.some((category: any) => category.title === title)) {
          return { success: false, error: `题单中已存在分组「${title}」。` };
        }
        const group = { title, problems: [] };
        const index = typeof args.index === 'number' ? Math.max(0, Math.min(Math.floor(args.index), list.categories.length)) : list.categories.length;
        list.categories.splice(index, 0, group);
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        return { success: true, message: `题单「${list.title}」已新增分组「${title}」`, group };
      },
    },
  {
      name: 'update_leetcode_group',
      module: 'leetcode',
      tool: {
        name: 'update_leetcode_group',
        description: '修改题单分组标题或调整分组顺序。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            categoryTitle: { type: 'string' },
            categoryIndex: { type: 'number' },
            title: { type: 'string', description: '新的分组标题。' },
            index: { type: 'number', description: '新的分组位置。' },
          },
          required: ['listId'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        const categoryIndex = getLeetCodeCategoryIndex(list, args);
        if (categoryIndex < 0) return { success: false, error: '未找到分组。请提供 categoryTitle 或 categoryIndex。' };
        const category = list.categories[categoryIndex];
        if (typeof args.title === 'string' && args.title.trim()) category.title = args.title.trim();
        if (typeof args.index === 'number') {
          const [moved] = list.categories.splice(categoryIndex, 1);
          const nextIndex = Math.max(0, Math.min(Math.floor(args.index), list.categories.length));
          list.categories.splice(nextIndex, 0, moved);
        }
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        return { success: true, message: `题单分组「${category.title}」已更新`, group: category };
      },
    },
  {
      name: 'delete_leetcode_group',
      module: 'leetcode',
      tool: {
        name: 'delete_leetcode_group',
        description: '删除题单中的一个分组。若分组内有题目，需要 deleteProblems=true 才会连同题目删除。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            categoryTitle: { type: 'string' },
            categoryIndex: { type: 'number' },
            deleteProblems: { type: 'boolean' },
            clearProgress: { type: 'boolean' },
          },
          required: ['listId'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        const categoryIndex = getLeetCodeCategoryIndex(list, args);
        if (categoryIndex < 0) return { success: false, error: '未找到分组。' };
        const category = list.categories[categoryIndex];
        const problemCount = Array.isArray(category.problems) ? category.problems.length : 0;
        if (problemCount > 0 && args.deleteProblems !== true) {
          return { success: false, error: `分组「${category.title}」下还有 ${problemCount} 道题。若确认删除，请传 deleteProblems=true。` };
        }
        if (args.clearProgress === true) {
          const progress = loadLeetCodeProgress();
          (category.problems || []).forEach((problem: any) => {
            if (problem.url) delete progress[problem.url];
          });
          saveLeetCodeProgress(progress);
        }
        list.categories.splice(categoryIndex, 1);
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        return { success: true, message: `题单分组「${category.title}」已删除` };
      },
    },
  {
      name: 'create_leetcode_problem',
      module: 'leetcode',
      tool: {
        name: 'create_leetcode_problem',
        description: '向题单分组中新增一道题。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            categoryTitle: { type: 'string' },
            categoryIndex: { type: 'number' },
            title: { type: 'string' },
            url: { type: 'string' },
            codeUrl: { type: 'string' },
            codeText: { type: 'string' },
            note: { type: 'string' },
            index: { type: 'number', description: '插入位置；不传则追加。' },
            completed: { type: 'boolean', description: '是否同时设置完成状态。' },
          },
          required: ['listId', 'title', 'url'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        const categoryIndex = getLeetCodeCategoryIndex(list, args);
        if (categoryIndex < 0) return { success: false, error: '未找到分组。请先创建分组或提供 categoryTitle/categoryIndex。' };
        const category = list.categories[categoryIndex];
        const built = makeLeetCodeProblem(args);
        if ('error' in built) return { success: false, error: built.error };
        const problem = built.problem;
        category.problems = Array.isArray(category.problems) ? category.problems : [];
        if (category.problems.some((item: any) => item.url === problem.url)) {
          return { success: false, error: `分组「${category.title}」中已存在该题目 URL。` };
        }
        const index = typeof args.index === 'number' ? Math.max(0, Math.min(Math.floor(args.index), category.problems.length)) : category.problems.length;
        category.problems.splice(index, 0, problem);
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        if (typeof args.completed === 'boolean') {
          const progress = loadLeetCodeProgress();
          if (args.completed) progress[problem.url] = true;
          else delete progress[problem.url];
          saveLeetCodeProgress(progress);
        }
        return { success: true, message: `题单「${list.title}」已新增题目「${problem.title}」`, problem };
      },
    },
  {
      name: 'update_leetcode_problem',
      module: 'leetcode',
      tool: {
        name: 'update_leetcode_problem',
        description: '修改题单中的一道题，可改标题、URL、题解链接、备注、顺序和所属分组。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            categoryTitle: { type: 'string' },
            categoryIndex: { type: 'number' },
            problemTitle: { type: 'string' },
            problemIndex: { type: 'number' },
            url: { type: 'string', description: '用于定位题目的旧 URL；如果同时传 newUrl，则会更新为 newUrl。' },
            title: { type: 'string', description: '新题目标题。' },
            newUrl: { type: 'string', description: '新题目 URL。' },
            codeUrl: { type: 'string' },
            codeText: { type: 'string' },
            note: { type: 'string' },
            index: { type: 'number', description: '新位置。' },
            targetCategoryTitle: { type: 'string', description: '移动到另一个分组。' },
            targetCategoryIndex: { type: 'number', description: '移动到另一个分组下标。' },
            completed: { type: 'boolean', description: '可同时修改完成状态。' },
          },
          required: ['listId'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        const categoryIndex = getLeetCodeCategoryIndex(list, args);
        if (categoryIndex < 0) return { success: false, error: '未找到源分组。' };
        const category = list.categories[categoryIndex];
        const problemIndex = getLeetCodeProblemIndex(category, args);
        if (problemIndex < 0) return { success: false, error: '未找到题目。请提供 url、problemTitle 或 problemIndex。' };
        const [problem] = category.problems.splice(problemIndex, 1);
        const oldUrl = problem.url;
        if (typeof args.title === 'string' && args.title.trim()) problem.title = args.title.trim();
        if (typeof args.newUrl === 'string' && args.newUrl.trim()) problem.url = args.newUrl.trim();
        if (typeof args.codeUrl === 'string') problem.codeUrl = args.codeUrl.trim() || undefined;
        if (typeof args.codeText === 'string') problem.codeText = args.codeText.trim() || undefined;
        if (typeof args.note === 'string') problem.note = args.note.trim();
        const targetArgs = {
          categoryTitle: args.targetCategoryTitle,
          categoryIndex: args.targetCategoryIndex,
        };
        const targetIndex = (args.targetCategoryTitle || typeof args.targetCategoryIndex === 'number')
          ? getLeetCodeCategoryIndex(list, targetArgs)
          : categoryIndex;
        if (targetIndex < 0) {
          category.problems.splice(problemIndex, 0, problem);
          return { success: false, error: '未找到目标分组。' };
        }
        const targetCategory = list.categories[targetIndex];
        targetCategory.problems = Array.isArray(targetCategory.problems) ? targetCategory.problems : [];
        const insertIndex = typeof args.index === 'number' ? Math.max(0, Math.min(Math.floor(args.index), targetCategory.problems.length)) : targetCategory.problems.length;
        targetCategory.problems.splice(insertIndex, 0, problem);
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        if (typeof args.completed === 'boolean' || oldUrl !== problem.url) {
          const progress = loadLeetCodeProgress();
          const previousDone = Boolean(progress[oldUrl]);
          if (oldUrl !== problem.url) delete progress[oldUrl];
          const nextDone = typeof args.completed === 'boolean' ? args.completed : previousDone;
          if (nextDone) progress[problem.url] = true;
          else delete progress[problem.url];
          saveLeetCodeProgress(progress);
        }
        return { success: true, message: `题目「${problem.title}」已更新`, problem };
      },
    },
  {
      name: 'delete_leetcode_problem',
      module: 'leetcode',
      tool: {
        name: 'delete_leetcode_problem',
        description: '删除题单中的一道题。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            categoryTitle: { type: 'string' },
            categoryIndex: { type: 'number' },
            problemTitle: { type: 'string' },
            problemIndex: { type: 'number' },
            url: { type: 'string' },
            clearProgress: { type: 'boolean', description: '是否同时清除完成状态，默认 true。' },
          },
          required: ['listId'],
        },
      },
      execute: async (args) => {
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) return { success: false, error: '未找到题单。' };
        const categoryIndex = getLeetCodeCategoryIndex(list, args);
        if (categoryIndex < 0) return { success: false, error: '未找到分组。' };
        const category = list.categories[categoryIndex];
        const problemIndex = getLeetCodeProblemIndex(category, args);
        if (problemIndex < 0) return { success: false, error: '未找到题目。' };
        const [problem] = category.problems.splice(problemIndex, 1);
        syncLeetCodeRawMarkdown(list);
        saveLeetCodeLists(lists);
        if (args.clearProgress !== false && problem.url) {
          const progress = loadLeetCodeProgress();
          delete progress[problem.url];
          saveLeetCodeProgress(progress);
        }
        return { success: true, message: `题目「${problem.title}」已删除` };
      },
    },
  {
      name: 'query_leetcode_progress',
      module: 'leetcode',
      tool: {
        name: 'query_leetcode_progress',
        description: '查询题单完成情况。可按题单或单道题查询。',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string' },
            listTitle: { type: 'string' },
            url: { type: 'string', description: '可选：查询单个 URL 是否完成。' },
          },
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.leetcodeLists.read) return { success: false, error: '题单完成情况查询未授权。' };
        const progress = loadLeetCodeProgress();
        if (typeof args.url === 'string' && args.url.trim()) {
          const url = args.url.trim();
          return { success: true, url, completed: Boolean(progress[url]) };
        }
        const lists = loadLeetCodeLists();
        const list = getLeetCodeList(lists, args);
        if (!list) {
          return {
            success: true,
            lists: lists.map((entry: any) => summarizeLeetCodeList(entry, progress)),
          };
        }
        const summary = summarizeLeetCodeList(list, progress);
        const categories = (list.categories || []).map((category: any) => {
          const total = (category.problems || []).length;
          const completed = (category.problems || []).filter((problem: any) => progress[problem.url]).length;
          return {
            title: category.title,
            total,
            completed,
            pending: Math.max(total - completed, 0),
            completionPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
          };
        });
        return { success: true, summary, categories };
      },
    },
  {
      name: 'set_leetcode_problem_progress',
      module: 'leetcode',
      permission: { module: 'leetcode', action: 'update' },
      tool: {
        name: 'set_leetcode_problem_progress',
        description: '设置一道题的完成状态。完成状态按题目 URL 全局记录。',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            completed: { type: 'boolean' },
          },
          required: ['url', 'completed'],
        },
      },
      execute: async (args) => {
        const url = String(args.url || '').trim();
        if (!url) return { success: false, error: '题目 URL 不能为空。' };
        const progress = loadLeetCodeProgress();
        if (args.completed) progress[url] = true;
        else delete progress[url];
        saveLeetCodeProgress(progress);
        return { success: true, message: args.completed ? '题目已标记完成' : '题目已标记未完成', url, completed: Boolean(args.completed) };
      },
    },
  {
      name: 'query_learning_courses',
      module: 'learning',
      tool: {
        name: 'query_learning_courses',
        description: '查询学习中心的分类和课程列表，返回每个分类的唯一 ID。创建课程前必须先调用此工具获取分类 ID。',
        inputSchema: {
          type: 'object',
          properties: {
            categoryId: { type: 'string', description: '按分类 ID 筛选（从本工具返回的 categories[].id 获取），不传则返回全部' },
          },
          required: [],
        },
      },
      execute: async (args, ctx) => {
        if (!ctx.dataPermissions.learningCourses.read) return { success: false, error: '学习课程查询未授权。请点击 🔒 按钮，在权限面板中开启「学习课程」读取权限。' };
        const cats: any[] = JSON.parse(localStorage.getItem('learning_categories_v1') || '[]');
        const allCourses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
        let courses: any[] = allCourses;
        if (args.categoryId) {
          const catId = String(args.categoryId).trim();
          courses = courses.filter((c: any) => c.categoryId === catId);
        }
        return {
          success: true,
          categories: cats.map((c: any) => summarizeLearningCategory(c, allCourses)),
          courses: courses.map((c: any) => summarizeLearningCourse(c, cats)),
        };
      },
    },
  {
      name: 'query_learning_categories',
      module: 'learning',
      tool: {
        name: 'query_learning_categories',
        description: '查询学习空间的所有学习方向，返回方向 ID、名称、备注、图标、颜色、优先级和课程数量。',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      execute: async (_args, ctx) => {
        if (!ctx.dataPermissions.learningCourses.read) return { success: false, error: '学习方向查询未授权。请在权限中心开启「学习课程」读取权限。' };
        const categories = loadLearningCategories();
        const courses = loadLearningCourses();
        return {
          success: true,
          total: categories.length,
          categories: categories.map((category: any) => summarizeLearningCategory(category, courses)),
        };
      },
    },
  {
      name: 'create_learning_category',
      module: 'learning',
      tool: {
        name: 'create_learning_category',
        description: '创建学习空间课程分类。',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string', description: '学习方向备注说明。' },
            icon: { type: 'string', description: 'Lucide 图标名，默认 BookOpen。' },
            color: { type: 'string', description: '颜色键，默认 blue。' },
            priority: { type: 'number' },
          },
          required: ['name'],
        },
      },
      execute: async (args) => {
        const name = String(args.name || '').trim();
        if (!name) return { success: false, error: '分类名称不能为空。' };
        const categories = loadLearningCategories();
        if (categories.some((category: any) => category.name === name)) {
          return { success: false, error: `学习分类「${name}」已存在。` };
        }
        const category = {
          id: agentLearningId('cat'),
          name,
          description: typeof args.description === 'string' ? args.description.trim() : '',
          icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : 'BookOpen',
          color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : 'blue',
          priority: typeof args.priority === 'number' ? args.priority : categories.length + 1,
        };
        saveLearningCategories([...categories, category]);
        return { success: true, message: `学习分类「${name}」已创建`, category };
      },
    },
  {
      name: 'update_learning_category',
      module: 'learning',
      tool: {
        name: 'update_learning_category',
        description: '修改学习空间课程分类。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            icon: { type: 'string' },
            color: { type: 'string' },
            priority: { type: 'number' },
          },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const categories = loadLearningCategories();
        const category = categories.find((item: any) => item.id === id);
        if (!category) return { success: false, error: `未找到学习分类「${id}」。` };
        const updates: Record<string, any> = {};
        for (const field of ['name', 'description', 'icon', 'color']) {
          if (typeof args[field] === 'string') updates[field] = args[field].trim();
        }
        if (typeof args.priority === 'number') updates.priority = args.priority;
        saveLearningCategories(categories.map((item: any) => item.id === id ? { ...item, ...updates } : item));
        return { success: true, message: `学习分类「${category.name}」已更新`, updated: { id, ...updates } };
      },
    },
  {
      name: 'delete_learning_category',
      module: 'learning',
      tool: {
        name: 'delete_learning_category',
        description: '删除学习空间课程分类。若该分类下有课程，需要提供 fallbackCategoryId 迁移课程。',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            fallbackCategoryId: { type: 'string', description: '迁移课程到这个分类。' },
          },
          required: ['id'],
        },
      },
      execute: async (args) => {
        const id = String(args.id || '').trim();
        const categories = loadLearningCategories();
        const category = categories.find((item: any) => item.id === id);
        if (!category) return { success: false, error: `未找到学习分类「${id}」。` };
        const courses = loadLearningCourses();
        const affected = courses.filter((course: any) => course.categoryId === id);
        const fallbackCategoryId = typeof args.fallbackCategoryId === 'string' ? args.fallbackCategoryId.trim() : '';
        if (affected.length > 0) {
          if (!fallbackCategoryId || !categories.some((item: any) => item.id === fallbackCategoryId && item.id !== id)) {
            return { success: false, error: `分类下有 ${affected.length} 门课程，请提供有效 fallbackCategoryId 后再删除。` };
          }
          saveLearningCourses(courses.map((course: any) => course.categoryId === id ? { ...course, categoryId: fallbackCategoryId } : course));
        }
        saveLearningCategories(categories.filter((item: any) => item.id !== id));
        return { success: true, message: `学习分类「${category.name}」已删除，迁移课程 ${affected.length} 门` };
      },
    },
  {
      name: 'read_learning_course',
      module: 'learning',
      tool: {
        name: 'read_learning_course',
        description: '读取一门学习课程的完整结构，包括学习模块、讲义、练习模块、个人资源和自定义分区。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            courseTitle: { type: 'string' },
          },
        },
      },
      execute: async (args) => {
        const categories = loadLearningCategories();
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。请先 query_learning_courses 获取 courseId。' };
        return { success: true, category: categories.find((cat: any) => cat.id === course.categoryId) || null, course };
      },
    },
  {
      name: 'query_learning_sections',
      module: 'learning',
      tool: {
        name: 'query_learning_sections',
        description: '查询课程内部顶层分区。返回固定分区（学习内容、学习练习、其它资源）和用户自定义分区，并列出每个分区下的章节/模块摘要。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            courseTitle: { type: 'string' },
          },
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。请先 query_learning_courses 获取 courseId。' };
        course.customSections = Array.isArray(course.customSections) ? course.customSections : [];
        const builtInSections = BUILTIN_LEARNING_SECTIONS
          .map(section => summarizeLearningSection(course, section.id))
          .filter(Boolean);
        const customSections = course.customSections
          .map((section: any) => summarizeLearningSection(course, section.id))
          .filter(Boolean);
        return {
          success: true,
          courseId: course.id,
          courseTitle: course.title,
          sections: [...builtInSections, ...customSections],
        };
      },
    },
  {
      name: 'create_learning_section',
      module: 'learning',
      tool: {
        name: 'create_learning_section',
        description: '在课程中创建一个顶层自定义分区。该分区与「学习内容 / 学习练习 / 其它资源」同级，用于扩展新的课程目录板块。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            title: { type: 'string' },
            icon: { type: 'string', description: 'Lucide 图标名，默认 Star。' },
            color: { type: 'string', description: '颜色键，默认 blue。' },
            order: { type: 'number', description: '分区顺序，数字越小越靠前。' },
          },
          required: ['courseId', 'title'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const title = String(args.title || '').trim();
        if (!title) return { success: false, error: '分区标题不能为空。' };
        course.customSections = Array.isArray(course.customSections) ? course.customSections : [];
        if (course.customSections.some((section: any) => section.title === title)) {
          return { success: false, error: `课程「${course.title}」中已存在分区「${title}」。` };
        }
        const section = {
          id: agentLearningId('csec'),
          order: typeof args.order === 'number' ? args.order : course.customSections.length,
          title,
          icon: typeof args.icon === 'string' && args.icon.trim() ? args.icon.trim() : 'Star',
          color: typeof args.color === 'string' && args.color.trim() ? args.color.trim() : 'blue',
          modules: [],
        };
        course.customSections.push(section);
        course.customSections.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `课程「${course.title}」已新增顶层分区「${section.title}」`, section };
      },
    },
  {
      name: 'update_learning_section',
      module: 'learning',
      tool: {
        name: 'update_learning_section',
        description: '修改课程顶层自定义分区的标题、图标、颜色或顺序。固定分区不能修改。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            sectionId: { type: 'string' },
            title: { type: 'string' },
            icon: { type: 'string' },
            color: { type: 'string' },
            order: { type: 'number' },
          },
          required: ['courseId', 'sectionId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = getLearningSection(course, args);
        if (!section) return { success: false, error: `未找到自定义分区「${args.sectionId}」。` };
        for (const field of ['title', 'icon', 'color']) {
          if (typeof args[field] === 'string') section[field] = args[field].trim();
        }
        if (typeof args.order === 'number') {
          section.order = args.order;
          course.customSections.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        }
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `顶层分区「${section.title}」已更新`, section };
      },
    },
  {
      name: 'delete_learning_section',
      module: 'learning',
      tool: {
        name: 'delete_learning_section',
        description: '删除课程顶层自定义分区。若分区下有章节/模块，需要 deleteModules=true 才会连同内容删除。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            sectionId: { type: 'string' },
            deleteModules: { type: 'boolean', description: '分区下有内容时必须显式传 true。' },
          },
          required: ['courseId', 'sectionId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = getLearningSection(course, args);
        if (!section) return { success: false, error: `未找到自定义分区「${args.sectionId}」。` };
        const moduleCount = Array.isArray(section.modules) ? section.modules.length : 0;
        if (moduleCount > 0 && args.deleteModules !== true) {
          return { success: false, error: `分区「${section.title}」下还有 ${moduleCount} 个章节/模块。若确认删除，请传 deleteModules=true。` };
        }
        course.customSections = (course.customSections || []).filter((item: any) => item.id !== section.id);
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `顶层分区「${section.title}」已删除` };
      },
    },
  {
      name: 'update_learning_course',
      module: 'learning',
      tool: {
        name: 'update_learning_course',
        description: '修改学习课程的基础信息或总览 Markdown。不会覆盖模块列表，模块请用专门工具修改。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            courseTitle: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            categoryId: { type: 'string' },
            introMarkdown: { type: 'string' },
            icon: { type: 'string' },
            priority: { type: 'number' },
          },
        },
      },
      execute: async (args) => {
        const categories = loadLearningCategories();
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const updates: Record<string, any> = {};
        for (const field of ['title', 'description', 'introMarkdown', 'icon']) {
          if (typeof args[field] === 'string') updates[field] = args[field].trim();
        }
        if (typeof args.categoryId === 'string' && args.categoryId.trim()) {
          const categoryId = args.categoryId.trim();
          if (!categories.some((category: any) => category.id === categoryId)) {
            return { success: false, error: `分类 ID「${categoryId}」不存在。` };
          }
          updates.categoryId = categoryId;
        }
        if (typeof args.priority === 'number') updates.priority = args.priority;
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? { ...item, ...updates } : item));
        return { success: true, message: `课程「${course.title}」已更新`, updated: { id: course.id, ...updates } };
      },
    },
  {
      name: 'delete_learning_course',
      module: 'learning',
      tool: {
        name: 'delete_learning_course',
        description: '删除一门学习课程。需要先 query_learning_courses 获取 courseId。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            courseTitle: { type: 'string' },
          },
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        saveLearningCourses(courses.filter((item: any) => item.id !== course.id));
        return { success: true, message: `课程「${course.title}」已删除` };
      },
    },
  {
      name: 'create_learning_module',
      module: 'learning',
      tool: {
        name: 'create_learning_module',
        description: '在课程中创建模块。section=resources 表示学习讲义模块，assignments 表示练习模块，personal 表示个人资源模块，custom 表示自定义分区模块。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'number', description: '模块顺序，数字越小越靠前；不传则追加到末尾。' },
          },
          required: ['courseId', 'title'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        if (!modules) return { success: false, error: '未找到自定义分区。' };
        const module = {
          id: agentLearningId('mod'),
          order: typeof args.order === 'number' ? args.order : modules.length,
          title: String(args.title || '').trim(),
          description: typeof args.description === 'string' ? args.description.trim() : '',
          ...(section === 'resources' ? { lectures: [] } : { items: [] }),
        };
        if (!module.title) return { success: false, error: '模块标题不能为空。' };
        modules.push(module);
        modules.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `课程「${course.title}」已新增模块「${module.title}」`, module };
      },
    },
  {
      name: 'update_learning_module',
      module: 'learning',
      tool: {
        name: 'update_learning_module',
        description: '修改课程模块标题或描述。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'number', description: '模块顺序，数字越小越靠前。' },
          },
          required: ['courseId', 'moduleId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        if (!modules) return { success: false, error: '未找到分区。' };
        const module = modules.find((item: any) => item.id === args.moduleId);
        if (!module) return { success: false, error: `未找到模块「${args.moduleId}」。` };
        if (typeof args.title === 'string') module.title = args.title.trim();
        if (typeof args.description === 'string') module.description = args.description.trim();
        if (typeof args.order === 'number') {
          module.order = args.order;
          modules.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        }
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `模块「${module.title}」已更新`, module };
      },
    },
  {
      name: 'delete_learning_module',
      module: 'learning',
      tool: {
        name: 'delete_learning_module',
        description: '删除课程模块及其中的讲义/条目。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
          },
          required: ['courseId', 'moduleId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        if (!modules) return { success: false, error: '未找到分区。' };
        const module = modules.find((item: any) => item.id === args.moduleId);
        if (!module) return { success: false, error: `未找到模块「${args.moduleId}」。` };
        const nextModules = modules.filter((item: any) => item.id !== args.moduleId);
        modules.splice(0, modules.length, ...nextModules);
        saveLearningCourses(courses.map((item: any) => item.id === course.id ? course : item));
        return { success: true, message: `模块「${module.title}」已删除` };
      },
    },
  {
      name: 'read_learning_module',
      module: 'learning',
      tool: {
        name: 'read_learning_module',
        description: '读取课程某个分区下的单个章节/模块及其内部条目。section=resources/assignments/personal/custom；custom 分区必须提供 customSectionId。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            moduleTitle: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
          },
          required: ['courseId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const { section, module } = getLearningModule(course, args);
        if (!module) return { success: false, error: '未找到章节/模块。请提供 moduleId 或 moduleTitle。' };
        return {
          success: true,
          courseId: course.id,
          courseTitle: course.title,
          section,
          module,
        };
      },
    },
  {
      name: 'create_learning_item',
      module: 'learning',
      tool: {
        name: 'create_learning_item',
        description: '在课程模块中创建讲义或资源条目。resources 分区会创建 lecture，其它分区创建 item。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
            title: { type: 'string' },
            link: { type: 'string', description: '练习/个人/自定义资源链接。' },
            lecturer: { type: 'string', description: '讲义来源或讲师。' },
            materials: { type: 'string', description: '讲义材料文件名。' },
            date: { type: 'string' },
            desc: { type: 'string' },
            icon: { type: 'string' },
            order: { type: 'number', description: '条目顺序，数字越小越靠前；不传则追加到末尾。' },
            contentMarkdown: { type: 'string', description: '需要创建/写入的 Markdown 正文；传入后会在课程模块目录中自动建立 .md 文档并关联到该条目。' },
          },
          required: ['courseId', 'moduleId', 'title'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        const module = modules?.find((item: any) => item.id === args.moduleId);
        if (!module) return { success: false, error: `未找到模块「${args.moduleId}」。` };
        const title = String(args.title || '').trim();
        if (!title) return { success: false, error: '条目标题不能为空。' };
        const collectionKey = section === 'resources' ? 'lectures' : 'items';
        module[collectionKey] = Array.isArray(module[collectionKey]) ? module[collectionKey] : [];
        const order = typeof args.order === 'number' ? args.order : module[collectionKey].length;
        const item = section === 'resources'
          ? {
              id: agentLearningId('lec'),
              order,
              title,
              lecturer: typeof args.lecturer === 'string' ? args.lecturer.trim() : '',
              materials: typeof args.materials === 'string' ? args.materials.trim() : '',
              date: typeof args.date === 'string' ? args.date.trim() : '',
              desc: typeof args.desc === 'string' ? args.desc.trim() : '',
              icon: typeof args.icon === 'string' ? args.icon.trim() : undefined,
            }
          : {
              id: agentLearningId('item'),
              order,
              title,
              link: typeof args.link === 'string' ? args.link.trim() : '',
              icon: typeof args.icon === 'string' ? args.icon.trim() : undefined,
            };
        await writeLearningMarkdownForItem(course, section, args.moduleId, item, args.contentMarkdown);
        module[collectionKey].push(item);
        module[collectionKey].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        saveLearningCourses(courses.map((entry: any) => entry.id === course.id ? course : entry));
        return { success: true, message: `课程「${course.title}」已新增条目「${title}」`, item };
      },
    },
  {
      name: 'read_learning_item',
      module: 'learning',
      tool: {
        name: 'read_learning_item',
        description: '读取课程某个章节/模块内部的单个讲义或资源条目，可返回其关联 Markdown 正文。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            moduleTitle: { type: 'string' },
            itemId: { type: 'string' },
            itemTitle: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
            includeContent: { type: 'boolean', description: '是否尝试读取条目关联的本地 Markdown 正文，默认 true。' },
          },
          required: ['courseId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const { section, module } = getLearningModule(course, args);
        if (!module) return { success: false, error: '未找到章节/模块。请提供 moduleId 或 moduleTitle。' };
        const { item } = getLearningItem(module, section, args);
        if (!item) return { success: false, error: '未找到条目。请提供 itemId 或 itemTitle。' };
        const contentMarkdown = args.includeContent === false ? null : await readLearningMarkdownForItem(section, item);
        return {
          success: true,
          courseId: course.id,
          courseTitle: course.title,
          section,
          module: summarizeLearningModule(module, section),
          item,
          contentMarkdown,
        };
      },
    },
  {
      name: 'update_learning_item',
      module: 'learning',
      tool: {
        name: 'update_learning_item',
        description: '修改课程模块中的讲义或资源条目。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            itemId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
            title: { type: 'string' },
            link: { type: 'string' },
            lecturer: { type: 'string' },
            materials: { type: 'string' },
            date: { type: 'string' },
            desc: { type: 'string' },
            icon: { type: 'string' },
            order: { type: 'number', description: '条目顺序，数字越小越靠前。' },
            contentMarkdown: { type: 'string', description: '写入该条目关联 Markdown 文档的正文；没有文档时会自动创建。' },
          },
          required: ['courseId', 'moduleId', 'itemId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        const module = modules?.find((entry: any) => entry.id === args.moduleId);
        if (!module) return { success: false, error: `未找到模块「${args.moduleId}」。` };
        const collectionKey = section === 'resources' ? 'lectures' : 'items';
        module[collectionKey] = Array.isArray(module[collectionKey]) ? module[collectionKey] : [];
        const item = module[collectionKey].find((entry: any) => entry.id === args.itemId);
        if (!item) return { success: false, error: `未找到条目「${args.itemId}」。` };
        for (const field of ['title', 'link', 'lecturer', 'materials', 'date', 'desc', 'icon']) {
          if (typeof args[field] === 'string') item[field] = args[field].trim();
        }
        if (typeof args.order === 'number') {
          item.order = args.order;
          module[collectionKey].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        }
        await writeLearningMarkdownForItem(course, section, args.moduleId, item, args.contentMarkdown);
        saveLearningCourses(courses.map((entry: any) => entry.id === course.id ? course : entry));
        return { success: true, message: `条目「${item.title}」已更新`, item };
      },
    },
  {
      name: 'delete_learning_item',
      module: 'learning',
      tool: {
        name: 'delete_learning_item',
        description: '删除课程模块中的讲义或资源条目。',
        inputSchema: {
          type: 'object',
          properties: {
            courseId: { type: 'string' },
            moduleId: { type: 'string' },
            itemId: { type: 'string' },
            section: { type: 'string', enum: ['resources', 'assignments', 'personal', 'custom'] },
            customSectionId: { type: 'string' },
          },
          required: ['courseId', 'moduleId', 'itemId'],
        },
      },
      execute: async (args) => {
        const courses = loadLearningCourses();
        const course = getLearningCourse(courses, args);
        if (!course) return { success: false, error: '未找到课程。' };
        const section = normalizeLearningSection(args.section);
        const modules = getLearningSectionModules(course, section, typeof args.customSectionId === 'string' ? args.customSectionId : undefined);
        const module = modules?.find((entry: any) => entry.id === args.moduleId);
        if (!module) return { success: false, error: `未找到模块「${args.moduleId}」。` };
        const collectionKey = section === 'resources' ? 'lectures' : 'items';
        module[collectionKey] = Array.isArray(module[collectionKey]) ? module[collectionKey] : [];
        const item = module[collectionKey].find((entry: any) => entry.id === args.itemId);
        if (!item) return { success: false, error: `未找到条目「${args.itemId}」。` };
        module[collectionKey] = module[collectionKey].filter((entry: any) => entry.id !== args.itemId);
        saveLearningCourses(courses.map((entry: any) => entry.id === course.id ? course : entry));
        return { success: true, message: `条目「${item.title}」已删除` };
      },
    },
];
