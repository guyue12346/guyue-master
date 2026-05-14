import type { Category } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';

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
        const categories: { title: string; problems: { title: string; url: string; note?: string }[] }[] = [];
        for (const group of groups) {
          mdLines.push(`### ${group.name}`);
          mdLines.push('| 题目 | 相关链接 | 备注 |');
          mdLines.push('|---|---|---|');
          const problems: { title: string; url: string; note?: string }[] = [];
          for (const p of (Array.isArray(group.problems) ? group.problems : [])) {
            mdLines.push(`| [${p.title}](${p.url}) | | ${p.note || ''} |`);
            problems.push({ title: p.title, url: p.url, note: p.note || undefined });
          }
          categories.push({ title: group.name, problems });
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
        const existing: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
        existing.push(newList);
        existing.sort((a: any, b: any) => (a.priority ?? 10) - (b.priority ?? 10));
        localStorage.setItem('leetcode_lists', JSON.stringify(existing));
        return { success: true, message: `题单「${newList.title}」已创建，包含 ${categories.length} 个分组共 ${totalProblems} 道题。` };
      },
    },
  {
      name: 'create_learning_course',
      module: 'learning',
      tool: {
        name: 'create_learning_course',
        description: '在学习中心创建一个完整的结构化课程（含学习模块、讲义、练习、个人资源、自定义分区）。调用前必须先 query_learning_courses 获取已有分类列表及其 ID，然后用 categoryId 指定分类；若需要新分类请先自行说明。',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '课程标题' },
            description: { type: 'string', description: '课程简介' },
            categoryId: { type: 'string', description: '所属分类的唯一 ID（从 query_learning_courses 返回的 categories[].id 获取）。若传入的 ID 不存在，可传 categoryName 来自动创建新分类。' },
            categoryName: { type: 'string', description: '仅在需要创建新分类时使用。传入新分类的显示名称，会自动创建。必须与 categoryId 二选一。' },
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
          required: ['title'],
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
        } else if (args.categoryName) {
          // 创建新分类
          const catName = String(args.categoryName).trim();
          targetCategory = { id: `cat_${Date.now()}`, name: catName, icon: args.icon || 'BookOpen', color: 'blue', priority: 10 };
          cats.push(targetCategory);
          localStorage.setItem('learning_categories_v1', JSON.stringify(cats));
        } else {
          return { success: false, error: '必须提供 categoryId（已有分类）或 categoryName（创建新分类）。请先调用 query_learning_courses 查看已有分类。' };
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
        const lists: any[] = JSON.parse(localStorage.getItem('leetcode_lists') || '[]');
        return {
          success: true,
          total: lists.length,
          lists: lists.map((l: any) => ({
            id: l.id,
            title: l.title,
            description: l.description || null,
            priority: l.priority ?? 10,
            groupCount: (l.categories || []).length,
            problemCount: (l.categories || []).reduce((n: number, g: any) => n + (g.problems || []).length, 0),
            createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString('zh-CN') : null,
          })),
        };
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
        let courses: any[] = JSON.parse(localStorage.getItem('learning_courses_v1') || '[]');
        if (args.categoryId) {
          const catId = String(args.categoryId).trim();
          courses = courses.filter((c: any) => c.categoryId === catId);
        }
        return {
          success: true,
          categories: cats.map((c: any) => ({ id: c.id, name: c.name })),
          courses: courses.map((c: any) => ({
            id: c.id,
            title: c.title,
            description: c.description || null,
            categoryId: c.categoryId,
            categoryName: cats.find((cat: any) => cat.id === c.categoryId)?.name || c.categoryId,
            moduleCount: (c.modules || []).length,
            lectureCount: (c.modules || []).reduce((n: number, m: any) => n + (m.lectures || []).length, 0),
            assignmentModuleCount: (c.assignmentModules || []).length,
            personalModuleCount: (c.personalModules || []).length,
            customSectionCount: (c.customSections || []).length,
          })),
        };
      },
    },
];
