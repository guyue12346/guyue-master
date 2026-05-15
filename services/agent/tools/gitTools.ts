import type { ToolRegistration } from '../toolRegistry';
import { findAgentGitRepo, GIT_REPOSITORIES_STORAGE_KEY, loadAgentGitRepositories } from './localData';

const normalizeLimit = (value: unknown, fallback = 20, max = 100) => {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
};

const saveAgentGitRepositories = (repositories: Array<{ path: string; name: string; addedAt?: number; lastOpenedAt?: number }>) => {
  localStorage.setItem(GIT_REPOSITORIES_STORAGE_KEY, JSON.stringify(repositories));
  window.dispatchEvent(new CustomEvent('guyue-git-repositories-updated', { detail: { repositories } }));
};

const resolveGitRepoForTool = (args: Record<string, any>) => {
  const repo = findAgentGitRepo(args);
  if (!repo) throw new Error('未找到仓库。请先在 Git 管理中心添加仓库，或传 repoPath/repoName。');
  return repo;
};

export const GIT_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── Git 管理工具 ───
  {
    name: 'git_add_repository',
    module: 'git',
    permission: { module: 'git', action: 'create' },
    tool: {
      name: 'git_add_repository',
      description: '把一个本地 Git 仓库路径加入 Git 管理中心。repoPath 必须是已有本地路径。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, name: { type: 'string' } }, required: ['repoPath'] },
    },
    execute: async (args) => {
      const repoPath = String(args.repoPath || '').trim();
      if (!repoPath) return { success: false, error: 'repoPath 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStatus) return { success: false, error: 'Git API 不可用。' };
      const status = await electronAPI.gitStatus(repoPath);
      const repositories = loadAgentGitRepositories();
      const record = {
        path: status.path,
        name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : status.name,
        addedAt: Date.now(),
        lastOpenedAt: Date.now(),
      };
      const next = repositories.some(repo => repo.path === status.path)
        ? repositories.map(repo => repo.path === status.path ? { ...repo, ...record } : repo)
        : [record, ...repositories];
      saveAgentGitRepositories(next);
      return { success: true, message: `仓库「${record.name}」已加入 Git 管理中心`, repository: record, status };
    },
  },
  {
    name: 'git_remove_repository',
    module: 'git',
    permission: { module: 'git', action: 'delete' },
    tool: {
      name: 'git_remove_repository',
      description: '从 Git 管理中心移除一个仓库记录。只移除 App 记录，不删除磁盘文件。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const repositories = loadAgentGitRepositories();
      saveAgentGitRepositories(repositories.filter(item => item.path !== repo.path));
      return { success: true, message: `仓库「${repo.name}」已从 Git 管理中心移除`, repository: repo };
    },
  },
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
    name: 'query_git_branches',
    module: 'git',
    tool: {
      name: 'query_git_branches',
      description: '查询 Git 仓库的本地分支和远程分支，以及当前分支状态。只有一个仓库时可不传 repoPath/repoName。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitBranches) return { success: false, error: 'Git branches API 不可用。' };
      const result = await electronAPI.gitBranches(repo.path);
      return { success: true, repository: repo, ...result };
    },
  },
  {
    name: 'query_git_commit',
    module: 'git',
    tool: {
      name: 'query_git_commit',
      description: '查看一个 Git 提交的详情和文件统计。需要 commit hash。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, hash: { type: 'string' } }, required: ['hash'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const hash = String(args.hash || '').trim();
      if (!hash) return { success: false, error: 'hash 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitShowCommit) return { success: false, error: 'Git show API 不可用。' };
      const detail = await electronAPI.gitShowCommit({ repoPath: repo.path, hash });
      return { success: true, repository: repo, hash, detail };
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
    name: 'git_discard_file',
    module: 'git',
    permission: { module: 'git', action: 'delete' },
    tool: {
      name: 'git_discard_file',
      description: '丢弃一个文件的本地更改，或删除未跟踪文件。该操作不可逆，会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, filePath: { type: 'string' }, untracked: { type: 'boolean' } }, required: ['filePath'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const filePath = String(args.filePath || '').trim();
      if (!filePath) return { success: false, error: 'filePath 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitDiscard) return { success: false, error: 'Git discard API 不可用。' };
      const status = await electronAPI.gitDiscard({ repoPath: repo.path, filePath, untracked: Boolean(args.untracked) });
      return { success: true, message: `已丢弃 ${filePath} 的本地更改。`, status };
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
  {
    name: 'git_checkout_branch',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_checkout_branch',
      description: '切换到指定 Git 分支。也可 create=true 创建并切换到新分支。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, branch: { type: 'string' }, create: { type: 'boolean' }, startPoint: { type: 'string' } }, required: ['branch'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const branch = String(args.branch || '').trim();
      if (!branch) return { success: false, error: 'branch 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitCheckout) return { success: false, error: 'Git checkout API 不可用。' };
      const result = await electronAPI.gitCheckout({ repoPath: repo.path, branch, create: Boolean(args.create), startPoint: typeof args.startPoint === 'string' ? args.startPoint : undefined });
      return { success: true, message: `已切换到分支 ${branch}。`, ...result };
    },
  },
  {
    name: 'git_create_branch',
    module: 'git',
    permission: { module: 'git', action: 'create' },
    tool: {
      name: 'git_create_branch',
      description: '创建 Git 分支，可选择创建后立即 checkout。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, branch: { type: 'string' }, startPoint: { type: 'string' }, checkout: { type: 'boolean' } }, required: ['branch'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const branch = String(args.branch || '').trim();
      if (!branch) return { success: false, error: 'branch 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitCreateBranch) return { success: false, error: 'Git create branch API 不可用。' };
      const result = await electronAPI.gitCreateBranch({ repoPath: repo.path, branch, startPoint: typeof args.startPoint === 'string' ? args.startPoint : undefined, checkout: Boolean(args.checkout) });
      return { success: true, message: `分支 ${branch} 已创建。`, ...result };
    },
  },
  {
    name: 'git_delete_branch',
    module: 'git',
    permission: { module: 'git', action: 'delete' },
    tool: {
      name: 'git_delete_branch',
      description: '删除 Git 本地分支。force=true 使用 -D 强制删除。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, branch: { type: 'string' }, force: { type: 'boolean' } }, required: ['branch'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const branch = String(args.branch || '').trim();
      if (!branch) return { success: false, error: 'branch 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitDeleteBranch) return { success: false, error: 'Git delete branch API 不可用。' };
      const result = await electronAPI.gitDeleteBranch({ repoPath: repo.path, branch, force: Boolean(args.force) });
      return { success: true, message: `分支 ${branch} 已删除。`, ...result };
    },
  },
  {
    name: 'git_merge_branch',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_merge_branch',
      description: '将指定分支合并到当前分支，默认 --no-edit。该操作会触发确认。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' }, branch: { type: 'string' }, noFf: { type: 'boolean' } }, required: ['branch'] },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const branch = String(args.branch || '').trim();
      if (!branch) return { success: false, error: 'branch 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitMerge) return { success: false, error: 'Git merge API 不可用。' };
      const result = await electronAPI.gitMerge({ repoPath: repo.path, branch, noFf: Boolean(args.noFf) });
      return { success: true, message: `已合并分支 ${branch}。`, ...result };
    },
  },
  {
    name: 'git_stash',
    module: 'git',
    permission: { module: 'git', action: 'update' },
    tool: {
      name: 'git_stash',
      description: '管理 Git stash。action=list/push/pop/drop；push/pop/drop 会触发确认。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          action: { type: 'string', enum: ['list', 'push', 'pop', 'drop'] },
          message: { type: 'string' },
          index: { type: 'number' },
          includeUntracked: { type: 'boolean' },
        },
        required: ['action'],
      },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const action = String(args.action || 'list');
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStash) return { success: false, error: 'Git stash API 不可用。' };
      const result = await electronAPI.gitStash({
        repoPath: repo.path,
        action,
        message: typeof args.message === 'string' ? args.message : undefined,
        index: typeof args.index === 'number' ? args.index : undefined,
        includeUntracked: Boolean(args.includeUntracked),
      });
      return { success: true, message: `Git stash ${action} 完成。`, ...result };
    },
  },

];
