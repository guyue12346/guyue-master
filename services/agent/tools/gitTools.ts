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

const normalizeRepoRelativePath = (value: unknown, label = 'relativePath') => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '.' || raw === './') return '';
  if (raw.includes('\0') || /^([a-zA-Z]:)?[\\/]/.test(raw)) {
    throw new Error(`${label} 必须是仓库内相对路径。`);
  }
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.');
  if (parts.some(part => part === '..')) {
    throw new Error(`${label} 不能包含 ..。`);
  }
  return parts.join('/');
};

const joinRepoPath = (repoPath: string, relativePath: string) => {
  const root = repoPath.replace(/[\\/]+$/, '');
  return relativePath ? `${root}/${relativePath}` : root;
};

const getRelativePathFromAbsolute = (repoPath: string, absolutePath: string) => {
  const root = repoPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const target = String(absolutePath || '').replace(/\\/g, '/');
  if (target === root) return '';
  return target.startsWith(`${root}/`) ? target.slice(root.length + 1) : target;
};

const isHiddenGitEntry = (name: string) => name === '.git';

export const GIT_TOOL_REGISTRATIONS: ToolRegistration[] = [
  // ─── Git 管理工具 ───
  {
    name: 'git_add_repository',
    module: 'git',
    permission: { module: 'git', action: 'create' },
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    name: 'discover_git_repositories',
    module: 'git',
    tool: {
      name: 'discover_git_repositories',
      description: '扫描指定本地文件夹下的 Git 仓库。只返回发现结果，不会自动加入 Git 管理中心；加入前使用 git_add_repository 并等待用户确认。',
      inputSchema: {
        type: 'object',
        properties: {
          rootPath: { type: 'string', description: '要扫描的本地文件夹路径。' },
          maxDepth: { type: 'number', description: '最大扫描深度，默认 4。' },
        },
        required: ['rootPath'],
      },
    },
    execute: async (args) => {
      const rootPath = typeof args.rootPath === 'string' ? args.rootPath.trim() : '';
      if (!rootPath) return { success: false, error: 'rootPath 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitDiscoverRepositories) return { success: false, error: 'Git 仓库扫描 API 不可用。' };
      const repositories = await electronAPI.gitDiscoverRepositories({
        rootPath,
        maxDepth: normalizeLimit(args.maxDepth, 4, 10),
      });
      return { success: true, rootPath, total: repositories.length, repositories };
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
    name: 'query_git_repository_info',
    module: 'git',
    tool: {
      name: 'query_git_repository_info',
      description: '汇总查看一个 Git 仓库的信息：状态、远程、分支、最近提交和 stash。只有一个仓库时可不传 repoPath/repoName。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          logLimit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStatus) return { success: false, error: 'Git API 不可用。' };
      const status = await electronAPI.gitStatus(repo.path);
      const [branches, log, stash] = await Promise.all([
        electronAPI.gitBranches ? electronAPI.gitBranches(status.path).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) })) : null,
        electronAPI.gitLog ? electronAPI.gitLog({ repoPath: status.path, limit: normalizeLimit(args.logLimit, 20, 80) }).catch(() => []) : [],
        electronAPI.gitStash ? electronAPI.gitStash({ repoPath: status.path, action: 'list' }).catch(() => null) : null,
      ]);
      return {
        success: true,
        repository: { name: repo.name, path: status.path },
        status,
        branches,
        remotes: status.remotes || [],
        defaultRemote: status.defaultRemote || null,
        log,
        stashes: stash?.stashes || [],
      };
    },
  },
  {
    name: 'query_git_log',
    module: 'git',
    tool: {
      name: 'query_git_log',
      description: '查询 Git 仓库提交历史。只有一个仓库时可不传 repoPath/repoName。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitLog) return { success: false, error: 'Git log API 不可用。' };
      const log = await electronAPI.gitLog({ repoPath: repo.path, limit: normalizeLimit(args.limit, 30, 200) });
      return { success: true, repository: repo, total: log.length, log };
    },
  },
  {
    name: 'query_git_remotes',
    module: 'git',
    tool: {
      name: 'query_git_remotes',
      description: '查询 Git 仓库远程仓库、当前 upstream、ahead/behind 信息。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStatus) return { success: false, error: 'Git status API 不可用。' };
      const status = await electronAPI.gitStatus(repo.path);
      return {
        success: true,
        repository: { name: repo.name, path: status.path },
        branch: status.branch,
        upstream: status.upstream,
        upstreamRemoteName: status.upstreamRemoteName,
        upstreamBranch: status.upstreamBranch,
        ahead: status.ahead,
        behind: status.behind,
        remotes: status.remotes || [],
        defaultRemote: status.defaultRemote || null,
      };
    },
  },
  {
    name: 'query_git_tree',
    module: 'git',
    tool: {
      name: 'query_git_tree',
      description: '查看 Git 管理中心已登记仓库内的文件夹/文件列表。路径必须是仓库内相对路径；默认不进入 .git。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          directory: { type: 'string', description: '仓库内相对目录，默认仓库根目录。' },
          recursive: { type: 'boolean' },
          maxDepth: { type: 'number' },
          includeHidden: { type: 'boolean', description: '是否显示点开头文件；.git 永远不会展开。' },
          limit: { type: 'number' },
        },
      },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.listDir) return { success: false, error: '目录读取 API 不可用。' };
      const directory = normalizeRepoRelativePath(args.directory, 'directory');
      const limit = normalizeLimit(args.limit, 80, 500);
      const maxDepth = normalizeLimit(args.maxDepth, 3, 8);
      const includeHidden = Boolean(args.includeHidden);
      const status = electronAPI.gitStatus ? await electronAPI.gitStatus(repo.path).catch(() => null) : null;
      const statusByPath = new Map<string, any>((status?.files || []).map((file: any) => [String(file.path).replace(/\\/g, '/'), file]));
      const entries: any[] = [];

      const walk = async (relativeDir: string, depth: number): Promise<void> => {
        if (entries.length >= limit) return;
        const absoluteDir = joinRepoPath(repo.path, relativeDir);
        const children = await electronAPI.listDir(absoluteDir);
        const sorted = Array.isArray(children)
          ? [...children].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || String(a.name).localeCompare(String(b.name)))
          : [];
        for (const child of sorted) {
          if (entries.length >= limit) break;
          const name = String(child.name || '');
          if (!name || isHiddenGitEntry(name)) continue;
          if (!includeHidden && name.startsWith('.')) continue;
          const relativePath = normalizeRepoRelativePath(
            getRelativePathFromAbsolute(repo.path, child.path) || (relativeDir ? `${relativeDir}/${name}` : name),
            'entryPath',
          );
          const gitFile = statusByPath.get(relativePath);
          entries.push({
            name,
            relativePath,
            type: child.isDirectory ? 'directory' : 'file',
            size: child.size ?? null,
            mtime: child.mtime ?? null,
            gitStatus: gitFile ? {
              status: gitFile.status,
              staged: gitFile.staged,
              unstaged: gitFile.unstaged,
              untracked: gitFile.untracked,
              conflict: gitFile.conflict,
            } : null,
          });
          if (args.recursive && child.isDirectory && depth < maxDepth) {
            await walk(relativePath, depth + 1);
          }
        }
      };

      await walk(directory, 0);
      return {
        success: true,
        repository: repo,
        directory,
        recursive: Boolean(args.recursive),
        returned: entries.length,
        truncated: entries.length >= limit,
        entries,
      };
    },
  },
  {
    name: 'read_git_file',
    module: 'git',
    tool: {
      name: 'read_git_file',
      description: '读取 Git 管理中心已登记仓库内的文本文件内容。filePath 必须是仓库内相对路径，建议先 query_git_tree。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          filePath: { type: 'string' },
          maxBytes: { type: 'number', description: '最多返回字符数，默认 120000。' },
        },
        required: ['filePath'],
      },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const relativePath = normalizeRepoRelativePath(args.filePath, 'filePath');
      if (!relativePath) return { success: false, error: 'filePath 不能为空。' };
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.readFile) return { success: false, error: '文件读取 API 不可用。' };
      const absolutePath = joinRepoPath(repo.path, relativePath);
      const stats = electronAPI.getFileStats ? await electronAPI.getFileStats(absolutePath) : null;
      if (stats?.isDirectory) return { success: false, error: '目标路径是目录，请使用 query_git_tree。' };
      const content = await electronAPI.readFile(absolutePath);
      if (typeof content !== 'string') return { success: false, error: '文件读取失败，或不是可读文本文件。' };
      const maxBytes = normalizeLimit(args.maxBytes, 120000, 500000);
      const truncated = content.length > maxBytes;
      return {
        success: true,
        repository: repo,
        filePath: relativePath,
        size: stats?.size ?? content.length,
        mtime: stats?.mtime ?? null,
        truncated,
        content: truncated ? content.slice(0, maxBytes) : content,
      };
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
    name: 'query_git_stashes',
    module: 'git',
    tool: {
      name: 'query_git_stashes',
      description: '查询 Git stash 列表。只有一个仓库时可不传 repoPath/repoName。',
      inputSchema: { type: 'object', properties: { repoPath: { type: 'string' }, repoName: { type: 'string' } } },
    },
    execute: async (args) => {
      const repo = resolveGitRepoForTool(args);
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.gitStash) return { success: false, error: 'Git stash API 不可用。' };
      const result = await electronAPI.gitStash({ repoPath: repo.path, action: 'list' });
      return { success: true, repository: repo, stashes: result.stashes || [], output: result.output || '' };
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
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
    safety: { confirm: true },
    tool: {
      name: 'git_stash',
      description: '执行 Git stash 写操作。action=push/pop/drop；查询 stash 请使用 query_git_stashes。该操作会触发确认。',
      inputSchema: {
        type: 'object',
        properties: {
          repoPath: { type: 'string' },
          repoName: { type: 'string' },
          action: { type: 'string', enum: ['push', 'pop', 'drop'] },
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
