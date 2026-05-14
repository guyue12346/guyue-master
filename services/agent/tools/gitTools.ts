import type { ToolRegistration } from '../toolRegistry';
import { findAgentGitRepo, loadAgentGitRepositories } from './localData';

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

export const GIT_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── Git 管理工具 ───
  {
    name: 'query_git_repositories',
    module: 'git',
    tool: {
      name: 'query_git_repositories',
      description: '查询 Git 管理中心已登记的本地仓库列表。可选 refresh=true 同时读取每个仓库当前状态。',
      inputSchema: { type: 'object', properties: { refresh: { type: 'boolean' }, limit: { type: 'number' } } },
    },
    execute: async (args) => {
      const repositories = loadAgentGitRepositories();
      const limit = normalizeLimit(args.limit, 20, 80);
      const electronAPI = (window as any).electronAPI;
      if (!args.refresh || !electronAPI?.gitStatus) {
        return { success: true, total: repositories.length, repositories: repositories.slice(0, limit) };
      }
      const results = await Promise.all(repositories.slice(0, limit).map(async repo => {
        try {
          const status = await electronAPI.gitStatus(repo.path);
          return {
            ...repo,
            branch: status.branch,
            upstream: status.upstream,
            ahead: status.ahead,
            behind: status.behind,
            clean: status.clean,
            changeCount: Array.isArray(status.files) ? status.files.length : 0,
            remote: status.defaultRemote || status.remotes?.[0] || null,
          };
        } catch (error) {
          return { ...repo, error: error instanceof Error ? error.message : String(error) };
        }
      }));
      return { success: true, total: repositories.length, repositories: results };
    },
  },
  {
    name: 'query_git_status',
    module: 'git',
    tool: {
      name: 'query_git_status',
      description: '查询一个 Git 仓库的当前分支、远程、ahead/behind 和工作区更改。只有一个仓库时可不传 repoPath/repoName。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, includeLog: { type: 'boolean' }, logLimit: { type: 'number' } } },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。请先在 Git 管理中心添加仓库，或传 repoPath/repoName。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStatus) return { success: false, error: 'Git API 不可用。' };
      const status = await electronAPI.gitStatus(repo.path);
      const result: any = {
        success: true,
        repository: { name: repo.name, path: status.path },
        branch: status.branch,
        upstream: status.upstream,
        ahead: status.ahead,
        behind: status.behind,
        clean: status.clean,
        remotes: status.remotes || [],
        files: status.files || [],
      };
      if (args.includeLog && electronAPI.gitLog) {
        result.log = await electronAPI.gitLog({ repoPath: status.path, limit: normalizeLimit(args.logLimit, 20, 120) });
      }
      return result;
    },
  },
  {
    name: 'query_git_diff',
    module: 'git',
    tool: {
      name: 'query_git_diff',
      description: '查看某个文件的 Git diff。需要 repoPath/repoName 和 filePath。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, filePath: { type: 'string' }, staged: { type: 'boolean' } }, required: ['filePath'] },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitDiff) return { success: false, error: 'Git diff API 不可用。' };
      const diff = await electronAPI.gitDiff({ repoPath: repo.path, filePath: args.filePath, staged: Boolean(args.staged) });
      return { success: true, repoPath: repo.path, filePath: args.filePath, staged: Boolean(args.staged), diff: diff || '没有可显示的 diff。' };
    },
  },
  {
    name: 'git_stage_files',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_stage_files',
      description: '暂存 Git 文件。该操作会触发确认；paths 必须是明确文件列表。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const paths = Array.isArray(args.paths) ? args.paths.map((path: unknown) => String(path).trim()).filter(Boolean) : [];
      if (!paths.length) return { success: false, error: 'paths 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStage) return { success: false, error: 'Git stage API 不可用。' };
      const status = await electronAPI.gitStage({ repoPath: repo.path, paths });
      return { success: true, message: `已暂存 ${paths.length} 个文件。`, status };
    },
  },
  {
    name: 'git_unstage_files',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_unstage_files',
      description: '取消暂存 Git 文件。该操作会触发确认；paths 必须是明确文件列表。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const paths = Array.isArray(args.paths) ? args.paths.map((path: unknown) => String(path).trim()).filter(Boolean) : [];
      if (!paths.length) return { success: false, error: 'paths 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitUnstage) return { success: false, error: 'Git unstage API 不可用。' };
      const status = await electronAPI.gitUnstage({ repoPath: repo.path, paths });
      return { success: true, message: `已取消暂存 ${paths.length} 个文件。`, status };
    },
  },
  {
    name: 'git_commit',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_commit',
      description: '在仓库中提交已暂存更改。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, message: { type: 'string' } }, required: ['message'] },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const message = typeof args.message === 'string' ? args.message.trim() : '';
      if (!message) return { success: false, error: '提交信息不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitCommit) return { success: false, error: 'Git commit API 不可用。' };
      const result = await electronAPI.gitCommit({ repoPath: repo.path, message });
      return { success: true, message: `已提交：${message}`, output: result.output, status: result.status, log: result.log };
    },
  },
  {
    name: 'git_fetch',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_fetch',
      description: '执行 git fetch --prune。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitFetch) return { success: false, error: 'Git fetch API 不可用。' };
      const result = await electronAPI.gitFetch(repo.path);
      return { success: true, message: 'Fetch 完成。', ...result };
    },
  },
  {
    name: 'git_pull',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_pull',
      description: '执行 git pull --ff-only。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitPull) return { success: false, error: 'Git pull API 不可用。' };
      const result = await electronAPI.gitPull(repo.path);
      return { success: true, message: 'Pull 完成。', ...result };
    },
  },
  {
    name: 'git_push',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_push',
      description: '执行 git push。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = findAgentGitRepo(args);
      if (!repo) return { success: false, error: '未找到仓库。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitPush) return { success: false, error: 'Git push API 不可用。' };
      const result = await electronAPI.gitPush(repo.path);
      return { success: true, message: 'Push 完成。', ...result };
    },
  },

];
