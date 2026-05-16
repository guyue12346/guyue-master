import type { AgentToolExecutionResult, ToolExecutionContext, ToolRegistration } from './toolRegistry';
import { getToolPermissionTarget } from './toolRegistry';

export interface AgentToolValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface AgentToolValidationResult {
  ok: boolean;
  issues: AgentToolValidationIssue[];
  summary: string;
}

export interface AgentToolValidationInput {
  registration: ToolRegistration;
  args: Record<string, any>;
  context: ToolExecutionContext;
  result?: AgentToolExecutionResult;
  phase: 'before' | 'after';
}

const RESERVED_CATEGORY_NAMES = new Set(['默认', '未分类', '全部', '__all__']);

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const categoryLooksInvalid = (value: unknown) => {
  const name = text(value);
  return !name || RESERVED_CATEGORY_NAMES.has(name);
};

const hasAny = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const createResult = (issues: AgentToolValidationIssue[]): AgentToolValidationResult => {
  const errors = issues.filter(issue => issue.level === 'error');
  return {
    ok: errors.length === 0,
    issues,
    summary: issues.length === 0
      ? '工具输入和执行结果已通过基础校验。'
      : issues.map(issue => `${issue.level === 'error' ? '错误' : '提醒'}：${issue.message}`).join('；'),
  };
};

const requireExistingCategory = (
  issues: AgentToolValidationIssue[],
  value: unknown,
  available: string[],
  label: string,
) => {
  const name = text(value);
  if (categoryLooksInvalid(name)) {
    issues.push({ level: 'error', message: `${label}不能为空，也不能使用默认/未分类/全部。` });
    return;
  }
  if (available.length > 0 && !available.includes(name)) {
    issues.push({ level: 'error', message: `${label}「${name}」不在已有分类中。当前可用：${available.join('、')}。` });
  }
};

export const validateAgentToolExecution = (input: AgentToolValidationInput): AgentToolValidationResult => {
  const { registration, args, context, result, phase } = input;
  const issues: AgentToolValidationIssue[] = [];
  const target = getToolPermissionTarget(registration);

  if (phase === 'before') {
    if (target.action === 'create' || target.action === 'update') {
      if (/^(create|update)_todo$/.test(registration.name)) {
        if (!text(args.content) && registration.name === 'create_todo') {
          issues.push({ level: 'error', message: '创建待办必须提供 content。' });
        }
        requireExistingCategory(issues, args.category, context.todoCategories || [], '待办分类');
        if (!['high', 'medium', 'low'].includes(text(args.priority))) {
          issues.push({ level: 'error', message: '待办 priority 必须明确为 high / medium / low，不能默认猜测。' });
        }
      }

      if (registration.name === 'create_ssh_record') {
        requireExistingCategory(issues, args.category, context.sshCategories || [], 'SSH 分类');
      }

      if (registration.name === 'create_api_record') {
        requireExistingCategory(issues, args.category, context.apiCategories || [], 'API 分类');
      }

      if (registration.name === 'create_website_record') {
        const tags = (() => {
          try {
            if (typeof localStorage === 'undefined') return [];
            const parsed = JSON.parse(localStorage.getItem('linkmaster_password_tags_v1') || '[]');
            return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
          } catch {
            return [];
          }
        })();
        requireExistingCategory(issues, args.tag || args.category || args.tagName, tags, '网站标签');
      }
    }

    if (target.action === 'delete' && !hasAny(args.id) && !hasAny(args.name) && !hasAny(args.content)) {
      issues.push({ level: 'error', message: '删除操作必须提供明确 id、name 或 content 定位对象。' });
    }
  }

  if (phase === 'after') {
    if (result?.success === false) {
      issues.push({ level: 'error', message: result.error || result.message || '工具返回失败。' });
    }
    if (registration.name === 'web_search' && result?.success !== false) {
      const raw = result.raw || result.data || result;
      const hasResults = Array.isArray(raw?.results) && raw.results.length > 0;
      if (!hasResults && !raw?.directAnswer && !raw?.answer && !raw?.summary) {
        issues.push({ level: 'warning', message: '搜索成功但没有可用结果，通常需要换关键词或换搜索引擎。' });
      }
    }
    if (registration.name === 'web_open' && result?.success !== false) {
      const raw = result.raw || result.data || result;
      if (!text(raw?.content) && !text(raw?.excerpt) && !text(raw?.description)) {
        issues.push({ level: 'warning', message: '网页打开成功但正文抽取为空，应尝试其他来源。' });
      }
    }
  }

  return createResult(issues);
};
