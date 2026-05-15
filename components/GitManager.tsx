import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Clock3,
  Download,
  FileDiff,
  FolderOpen,
  GitBranch,
  GitGraph,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Terminal as TerminalIcon,
  Trash2,
  Upload,
} from 'lucide-react';
import type { GitCommitRecord, GitFileStatus, GitRepositorySummary, GitStatusData } from '../types';

interface GitRepositoryRecord extends GitRepositorySummary {
  addedAt: number;
  lastOpenedAt?: number;
}

type SelectedDiff =
  | { type: 'file'; filePath: string; staged: boolean; title: string; untracked?: boolean }
  | { type: 'commit'; hash: string; title: string };

interface GitGraphRow {
  commit: GitCommitRecord;
  index: number;
  laneIndex: number;
  lanesBefore: string[];
  lanesAfter: string[];
  branchLabel: string;
  commitColor: string;
  isMerge: boolean;
}

interface GitManagerProps {
  onOpenTerminal?: (repoPath: string, title: string) => void;
}

const STORAGE_KEY = 'guyue_git_repositories_v1';

const statusText: Record<string, string> = {
  M: 'M',
  A: 'A',
  D: 'D',
  R: 'R',
  U: 'U',
  '!': '!',
};

const BRANCH_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5'];

const hashColor = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return BRANCH_COLORS[hash % BRANCH_COLORS.length];
};

const colorWash = (hex: string, alpha = 0.12) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeRefName = (ref: string) =>
  ref
    .replace(/^HEAD ->\s*/, '')
    .replace(/^tag:\s*/, '')
    .trim();

const isBranchRef = (ref: string) => {
  const normalized = normalizeRefName(ref);
  return Boolean(normalized) && !ref.startsWith('tag:') && !normalized.includes('stash');
};

const getUpstreamRemoteName = (status?: GitStatusData) =>
  status?.upstreamRemoteName || status?.upstream?.split('/')[0] || null;

const getStatusRemote = (status?: GitStatusData) => {
  if (!status) return null;
  const upstreamRemoteName = getUpstreamRemoteName(status);
  return status.defaultRemote
    || status.remotes?.find(remote => remote.name === upstreamRemoteName)
    || status.remotes?.find(remote => remote.name === 'origin')
    || status.remotes?.[0]
    || (upstreamRemoteName ? { name: upstreamRemoteName } : null);
};

const displayRemoteUrl = (url?: string, hasRemote = false) => {
  if (!url) return hasRemote ? '远程 URL 待刷新' : '无远程仓库';
  return url
    .replace(/^git@([^:]+):/, '$1/')
    .replace(/^https?:\/\/([^@]+@)?/, '')
    .replace(/\.git$/, '');
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getFileName = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
};

const getDirName = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : '';
};

const loadRepositories = (): GitRepositoryRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter(item => item?.path && item?.name && !seen.has(item.path))
      .map(item => {
        seen.add(item.path);
        return {
          path: item.path,
          name: item.name,
          addedAt: Number(item.addedAt) || Date.now(),
          lastOpenedAt: Number(item.lastOpenedAt) || undefined,
        };
      });
  } catch {
    return [];
  }
};

const saveRepositories = (repositories: GitRepositoryRecord[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repositories));
};

const statusClass = (file: GitFileStatus) => {
  if (file.conflict) return 'bg-red-50 text-red-600 border-red-100';
  if (file.untracked) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (file.status === 'A') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
  if (file.status === 'D') return 'bg-rose-50 text-rose-600 border-rose-100';
  if (file.status === 'R') return 'bg-violet-50 text-violet-600 border-violet-100';
  return 'bg-amber-50 text-amber-600 border-amber-100';
};

const diffLineClass = (line: string) => {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'bg-emerald-50 text-emerald-800';
  if (line.startsWith('-') && !line.startsWith('---')) return 'bg-rose-50 text-rose-800';
  if (line.startsWith('@@')) return 'bg-blue-50 text-blue-700';
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
    return 'bg-slate-100 text-slate-600';
  }
  return 'text-slate-700';
};

const buildGraphRows = (commits: GitCommitRecord[], currentBranch?: string): GitGraphRow[] => {
  const lanes: string[] = [];

  return commits.map((commit, index) => {
    let laneIndex = lanes.indexOf(commit.hash);
    if (laneIndex === -1) {
      const insertAt = lanes.length === 0 ? 0 : Math.min(1, lanes.length);
      lanes.splice(insertAt, 0, commit.hash);
      laneIndex = insertAt;
    }

    const lanesBefore = [...lanes];
    const branchRef = commit.refs.find(isBranchRef);
    const branchLabel = branchRef ? normalizeRefName(branchRef) : (index === 0 ? currentBranch || '' : '');
    const commitColor = hashColor(branchLabel || commit.hash);

    if (commit.parents[0]) {
      lanes[laneIndex] = commit.parents[0];
      commit.parents.slice(1).forEach((parent, parentIndex) => {
        if (!lanes.includes(parent)) {
          lanes.splice(laneIndex + parentIndex + 1, 0, parent);
        }
      });
    } else {
      lanes.splice(laneIndex, 1);
    }

    return {
      commit,
      index,
      laneIndex,
      lanesBefore,
      lanesAfter: [...lanes],
      branchLabel,
      commitColor,
      isMerge: commit.parents.length > 1,
    };
  });
};

export const GitManager: React.FC<GitManagerProps> = ({ onOpenTerminal }) => {
  const [repositories, setRepositories] = useState<GitRepositoryRecord[]>(() => loadRepositories());
  const [selectedPath, setSelectedPath] = useState<string>(() => loadRepositories()[0]?.path || '');
  const [statuses, setStatuses] = useState<Record<string, GitStatusData>>({});
  const [logs, setLogs] = useState<Record<string, GitCommitRecord[]>>({});
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiff | null>(null);
  const [diffText, setDiffText] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const selectedRepo = repositories.find(repo => repo.path === selectedPath) || null;
  const selectedStatus = selectedPath ? statuses[selectedPath] : undefined;
  const selectedLog = selectedPath ? logs[selectedPath] || [] : [];
  const selectedRemote = getStatusRemote(selectedStatus);
  const selectedRemoteUrl = selectedRemote?.fetchUrl || selectedRemote?.pushUrl || '';
  const currentBranchColor = hashColor(selectedStatus?.branch || selectedRepo?.name || 'git');
  const graphRows = useMemo(() => buildGraphRows(selectedLog, selectedStatus?.branch), [selectedLog, selectedStatus?.branch]);

  const filteredRepositories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter(repo =>
      repo.name.toLowerCase().includes(query) ||
      repo.path.toLowerCase().includes(query)
    );
  }, [repositories, search]);

  const stagedFiles = useMemo(() => selectedStatus?.files.filter(file => file.staged && !file.conflict) || [], [selectedStatus]);
  const workingFiles = useMemo(() => selectedStatus?.files.filter(file => file.unstaged && !file.conflict) || [], [selectedStatus]);
  const conflictFiles = useMemo(() => selectedStatus?.files.filter(file => file.conflict) || [], [selectedStatus]);
  const totalChanges = selectedStatus?.files.length || 0;

  const persistRepos = useCallback((updater: (prev: GitRepositoryRecord[]) => GitRepositoryRecord[]) => {
    setRepositories(prev => {
      const next = updater(prev);
      saveRepositories(next);
      return next;
    });
  }, []);

  const applyStatus = useCallback((status: GitStatusData) => {
    setStatuses(prev => ({ ...prev, [status.path]: status }));
  }, []);

  const refreshRepo = useCallback(async (repoPath: string, options?: { silent?: boolean }) => {
    if (!repoPath || !window.electronAPI) return;
    if (!options?.silent) setLoadingRepo(repoPath);
    setError(null);

    try {
      const status = await window.electronAPI.gitStatus(repoPath);
      applyStatus(status);
      setSelectedPath(current => current || status.path);

      try {
        const log = await window.electronAPI.gitLog({ repoPath: status.path, limit: 120 });
        setLogs(prev => ({ ...prev, [status.path]: log }));
      } catch {
        setLogs(prev => ({ ...prev, [status.path]: [] }));
      }

      persistRepos(prev => prev.map(repo =>
        repo.path === repoPath || repo.path === status.path
          ? { ...repo, path: status.path, name: status.name, lastOpenedAt: Date.now() }
          : repo
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!options?.silent) setLoadingRepo(null);
    }
  }, [applyStatus, persistRepos]);

  const refreshAll = useCallback(async () => {
    for (const repo of repositories) {
      await refreshRepo(repo.path, { silent: true });
    }
  }, [repositories, refreshRepo]);

  useEffect(() => {
    if (repositories.length === 0) return;
    refreshAll();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const nextRepositories = Array.isArray(detail?.repositories) ? detail.repositories : loadRepositories();
      setRepositories(nextRepositories);
      setSelectedPath(current => nextRepositories.some((repo: GitRepositoryRecord) => repo.path === current)
        ? current
        : nextRepositories[0]?.path || '');
    };
    window.addEventListener('guyue-git-repositories-updated', handler);
    return () => window.removeEventListener('guyue-git-repositories-updated', handler);
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    refreshRepo(selectedPath, { silent: true });
  }, [selectedPath]);

  useEffect(() => {
    setSelectedDiff(null);
    setDiffText('');
  }, [selectedPath]);

  const addRepository = async () => {
    if (!window.electronAPI) return;
    setBusy('add');
    setError(null);
    try {
      const picked = await window.electronAPI.gitSelectRepository();
      if (!picked) return;
      persistRepos(prev => {
        if (prev.some(repo => repo.path === picked.path)) return prev;
        return [{ ...picked, addedAt: Date.now(), lastOpenedAt: Date.now() }, ...prev];
      });
      setSelectedPath(picked.path);
      await refreshRepo(picked.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const scanRepositories = async () => {
    if (!window.electronAPI) return;
    setBusy('scan');
    setError(null);
    try {
      const rootPath = await window.electronAPI.selectDirectory();
      if (!rootPath) return;
      const found = await window.electronAPI.gitDiscoverRepositories({ rootPath, maxDepth: 6 });
      if (found.length === 0) {
        setOutput('没有发现 Git 仓库');
        return;
      }
      persistRepos(prev => {
        const existing = new Set(prev.map(repo => repo.path));
        const additions = found
          .filter(repo => !existing.has(repo.path))
          .map(repo => ({ ...repo, addedAt: Date.now() }));
        return [...additions, ...prev];
      });
      setSelectedPath(found[0].path);
      setOutput(`发现 ${found.length} 个仓库`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const removeRepository = (repoPath: string) => {
    persistRepos(prev => prev.filter(repo => repo.path !== repoPath));
    setStatuses(prev => {
      const next = { ...prev };
      delete next[repoPath];
      return next;
    });
    setLogs(prev => {
      const next = { ...prev };
      delete next[repoPath];
      return next;
    });
    if (selectedPath === repoPath) {
      const nextRepo = repositories.find(repo => repo.path !== repoPath);
      setSelectedPath(nextRepo?.path || '');
      setSelectedDiff(null);
      setDiffText('');
    }
  };

  const loadDiff = async (next: SelectedDiff) => {
    if (!window.electronAPI || !selectedPath) return;
    setSelectedDiff(next);
    setDiffText('');
    setError(null);

    try {
      if (next.type === 'commit') {
        const text = await window.electronAPI.gitShowCommit({ repoPath: selectedPath, hash: next.hash });
        setDiffText(text || '没有可显示的提交详情');
        return;
      }

      if (next.untracked) {
        setDiffText('未跟踪文件尚未进入 Git 索引，暂存后可查看标准 diff。');
        return;
      }

      const text = await window.electronAPI.gitDiff({
        repoPath: selectedPath,
        filePath: next.filePath,
        staged: next.staged,
      });
      setDiffText(text || '没有可显示的 diff');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runStatusAction = async (name: string, action: () => Promise<GitStatusData>) => {
    if (!selectedPath) return;
    setBusy(name);
    setError(null);
    try {
      const status = await action();
      applyStatus(status);
      setOutput(`${name} 完成`);
      setSelectedDiff(null);
      setDiffText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runRepoAction = async (name: string, action: () => Promise<{ output: string; status: GitStatusData; log: GitCommitRecord[] }>) => {
    if (!selectedPath) return;
    setBusy(name);
    setError(null);
    try {
      const result = await action();
      applyStatus(result.status);
      setLogs(prev => ({ ...prev, [result.status.path]: result.log }));
      setOutput(result.output || `${name} 完成`);
      setSelectedDiff(null);
      setDiffText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    const message = commitMessage.trim();
    if (!selectedPath || !message || !window.electronAPI) return;
    await runRepoAction('提交', () => window.electronAPI.gitCommit({ repoPath: selectedPath, message }));
    setCommitMessage('');
  };

  const openGitTerminal = () => {
    if (!selectedRepo) return;
    onOpenTerminal?.(selectedRepo.path, `Git Bash: ${selectedRepo.name}`);
  };

  const renderRepository = (repo: GitRepositoryRecord) => {
    const status = statuses[repo.path];
    const isActive = repo.path === selectedPath;
    const count = status?.files.length || 0;
    const branch = status?.branch || '-';
    const branchColor = hashColor(branch || repo.name);
    const remote = getStatusRemote(status);
    const remoteUrl = remote?.fetchUrl || remote?.pushUrl || '';

    return (
      <button
        key={repo.path}
        onClick={() => setSelectedPath(repo.path)}
        className={`group w-full text-left rounded-lg border p-3 transition-all ${
          isActive ? 'border-slate-300 bg-white shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white/70'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{repo.name}</div>
            <div className="mt-1 truncate text-[11px] text-slate-400">{repo.path}</div>
          </div>
          <div className="flex items-center gap-1">
            {loadingRepo === repo.path && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            {count > 0 && <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{count}</span>}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex min-w-0 items-center gap-1">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: colorWash(branchColor, 0.14), color: branchColor }}>
              <GitBranch className="h-3 w-3" />
            </span>
            <span className="truncate font-medium" style={{ color: branchColor }}>{branch}</span>
          </span>
          <span className="shrink-0">
            {status ? `↑${status.ahead} ↓${status.behind}` : ''}
          </span>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-1 text-[11px] text-slate-400">
          <Cloud className="h-3 w-3 shrink-0 text-cyan-500" />
          <span className="shrink-0">{remote?.name || '-'}</span>
          <span className="truncate">{displayRemoteUrl(remoteUrl, Boolean(remote))}</span>
        </div>
      </button>
    );
  };

  const renderFileRow = (file: GitFileStatus, staged: boolean) => {
    const selected = selectedDiff?.type === 'file' && selectedDiff.filePath === file.path && selectedDiff.staged === staged;
    const title = `${staged ? '暂存' : '更改'}: ${file.path}`;

    return (
      <div
        key={`${file.path}-${staged ? 'staged' : 'worktree'}`}
        className={`group flex items-center gap-2 rounded-lg border px-2 py-2 ${
          selected ? 'border-slate-300 bg-white shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'
        }`}
      >
        <button
          onClick={() => loadDiff({ type: 'file', filePath: file.path, staged, title, untracked: file.untracked && !staged })}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${statusClass(file)}`}>
            {file.conflict ? '!' : statusText[file.status] || file.status}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-800">{getFileName(file.path)}</span>
            <span className="block truncate text-[11px] text-slate-400">{getDirName(file.path) || file.originalPath || file.path}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {staged ? (
            <button
              onClick={() => runStatusAction('取消暂存', () => window.electronAPI.gitUnstage({ repoPath: selectedPath, paths: [file.path] }))}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="取消暂存"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => runStatusAction('暂存', () => window.electronAPI.gitStage({ repoPath: selectedPath, paths: [file.path] }))}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="暂存"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`确定丢弃 ${file.path} 的本地更改吗？`)) {
                    runStatusAction('丢弃', () => window.electronAPI.gitDiscard({ repoPath: selectedPath, filePath: file.path, untracked: file.untracked }));
                  }
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="丢弃"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderGraphCell = (row: GitGraphRow) => {
    const laneCount = Math.max(row.lanesBefore.length, row.lanesAfter.length, 1);
    const width = Math.min(124, Math.max(64, laneCount * 16 + 28));
    const xForIndex = (index: number) => 12 + index * 16;
    const commitX = xForIndex(row.laneIndex);
    const commitY = 25;
    const firstParent = row.commit.parents[0];

    return (
      <svg width={width} height="58" viewBox={`0 0 ${width} 58`} className="shrink-0 overflow-visible">
        {row.lanesBefore.map((laneHash, laneIndex) => {
          const x = xForIndex(laneIndex);
          const isCurrentLane = laneIndex === row.laneIndex;
          const color = isCurrentLane ? row.commitColor : hashColor(laneHash);

          if (isCurrentLane) {
            return (
              <g key={`current-${laneHash}-${laneIndex}`}>
                <line x1={x} y1="0" x2={x} y2={commitY - 9} stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
                {firstParent && <line x1={x} y1={commitY + 9} x2={x} y2="58" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.85" />}
              </g>
            );
          }

          return (
            <line
              key={`lane-${laneHash}-${laneIndex}`}
              x1={x}
              y1="0"
              x2={x}
              y2="58"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.62"
            />
          );
        })}

        {row.commit.parents.slice(1).map((parentHash, parentIndex) => {
          const parentLaneIndex = row.lanesAfter.indexOf(parentHash);
          const targetX = xForIndex(parentLaneIndex >= 0 ? parentLaneIndex : row.laneIndex + parentIndex + 1);
          const color = hashColor(parentHash);
          return (
            <path
              key={`merge-${parentHash}`}
              d={`M ${commitX} ${commitY + 7} C ${commitX} ${commitY + 25}, ${targetX} ${commitY + 25}, ${targetX} 58`}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.82"
            />
          );
        })}

        <circle cx={commitX} cy={commitY} r="9" fill={row.commitColor} stroke="white" strokeWidth="2" />
        <circle cx={commitX} cy={commitY} r="3" fill="white" opacity="0.92" />
        {row.isMerge && (
          <path
            d={`M ${commitX - 3.5} ${commitY - 1.5} L ${commitX} ${commitY + 3.5} L ${commitX + 4} ${commitY - 4}`}
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    );
  };

  const renderSection = (id: string, title: string, files: GitFileStatus[], staged: boolean) => {
    const isCollapsed = collapsed[id] === true;
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50/60">
        <button
          onClick={() => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))}
          className="flex w-full items-center justify-between px-3 py-2"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {title}
          </span>
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{files.length}</span>
        </button>
        {!isCollapsed && (
          <div className="space-y-1 px-2 pb-2">
            {files.length === 0 ? (
              <div className="px-2 py-3 text-xs text-slate-400">无</div>
            ) : (
              files.map(file => renderFileRow(file, staged))
            )}
          </div>
        )}
      </section>
    );
  };

  const renderDiff = () => {
    if (!selectedDiff) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          选择一个文件或提交
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <div className="min-w-0 truncate text-sm font-semibold text-slate-800">{selectedDiff.title}</div>
          {selectedDiff.type === 'commit' && <span className="font-mono text-xs text-slate-400">{selectedDiff.hash.slice(0, 12)}</span>}
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-white text-[12px] leading-5">
          {diffText.split('\n').map((line, index) => (
            <div key={`${index}-${line.slice(0, 12)}`} className={`min-w-max px-4 ${diffLineClass(line)}`}>
              {line || ' '}
            </div>
          ))}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100 text-slate-900">
      <aside className="flex w-[286px] shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 via-emerald-500 to-blue-600 text-white shadow-sm">
                <GitBranch className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">存储库</div>
                <div className="text-[11px] text-slate-400">{repositories.length} repos</div>
              </div>
            </div>
            <button
              onClick={addRepository}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-slate-300 hover:text-slate-900"
              title="添加仓库"
            >
              {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-slate-400"
                placeholder="搜索"
              />
            </div>
            <button
              onClick={scanRepositories}
              className="rounded-lg border border-slate-200 bg-white px-3 text-slate-600 hover:border-slate-300 hover:text-slate-900"
              title="扫描目录"
            >
              {busy === 'scan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {filteredRepositories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-400">
              暂无仓库
            </div>
          ) : (
            filteredRepositories.map(renderRepository)
          )}
        </div>
      </aside>

      <section className="flex w-[390px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-bold">{selectedRepo?.name || 'Git 管理'}</h2>
                {selectedStatus?.clean && <Check className="h-4 w-4 text-emerald-500" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
                  style={{ background: colorWash(currentBranchColor, 0.12), color: currentBranchColor }}
                >
                  <GitBranch className="h-3.5 w-3.5" />{selectedStatus?.branch || '-'}
                </span>
                {selectedStatus?.upstream && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                    {selectedStatus.upstream}
                  </span>
                )}
                <span>↑{selectedStatus?.ahead || 0} ↓{selectedStatus?.behind || 0}</span>
                {selectedStatus?.stashCount ? <span>{selectedStatus.stashCount} stash</span> : null}
              </div>
              <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                <Cloud className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                <span className="shrink-0 font-medium">{selectedRemote?.name || 'remote'}</span>
                <span className="truncate font-mono text-[11px] text-slate-400">{displayRemoteUrl(selectedRemoteUrl, Boolean(selectedRemote))}</span>
              </div>
            </div>
            {selectedRepo && (
              <button
                onClick={() => removeRepository(selectedRepo.path)}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                title="从列表移除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => selectedPath && refreshRepo(selectedPath)}
              disabled={!selectedPath || Boolean(busy)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
            >
              <RefreshCw className="mr-1 inline h-3.5 w-3.5" />刷新
            </button>
            <button
              onClick={() => selectedPath && runRepoAction('Fetch', () => window.electronAPI.gitFetch(selectedPath))}
              disabled={!selectedPath || Boolean(busy)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />Fetch
            </button>
            <button
              onClick={() => selectedPath && runRepoAction('Pull', () => window.electronAPI.gitPull(selectedPath))}
              disabled={!selectedPath || Boolean(busy)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
            >
              <Download className="mr-1 inline h-3.5 w-3.5 rotate-180" />Pull
            </button>
            <button
              onClick={() => selectedPath && runRepoAction('Push', () => window.electronAPI.gitPush(selectedPath))}
              disabled={!selectedPath || Boolean(busy)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
            >
              <Upload className="mr-1 inline h-3.5 w-3.5" />Push
            </button>
            {selectedRepo && (
              <button
                onClick={openGitTerminal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
                title="在当前仓库打开 Git Bash"
              >
                <TerminalIcon className="mr-1 inline h-3.5 w-3.5" />Git Bash
              </button>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <textarea
              value={commitMessage}
              onChange={event => setCommitMessage(event.target.value)}
              className="h-20 w-full resize-none rounded-lg border border-transparent bg-white p-3 text-sm outline-none focus:border-slate-300"
              placeholder="提交信息"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                onClick={() => stagedFiles.length > 0 && runStatusAction('全部取消暂存', () => window.electronAPI.gitUnstage({ repoPath: selectedPath, paths: stagedFiles.map(file => file.path) }))}
                disabled={stagedFiles.length === 0 || Boolean(busy)}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-white disabled:opacity-40"
              >
                全部取消暂存
              </button>
              <button
                onClick={commit}
                disabled={!commitMessage.trim() || stagedFiles.length === 0 || Boolean(busy)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === '提交' ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : 'Commit'}
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {error && (
            <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
          {busy && busy !== 'add' && busy !== 'scan' && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {busy}
            </div>
          )}
          {selectedRepo ? (
            <>
              {renderSection('conflicts', '冲突', conflictFiles, false)}
              {renderSection('staged', '暂存的更改', stagedFiles, true)}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <FileDiff className="h-3.5 w-3.5" />
                    更改
                  </span>
                  <button
                    onClick={() => workingFiles.length > 0 && runStatusAction('全部暂存', () => window.electronAPI.gitStage({ repoPath: selectedPath, paths: workingFiles.map(file => file.path) }))}
                    disabled={workingFiles.length === 0 || Boolean(busy)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white disabled:opacity-40"
                  >
                    全部暂存
                  </button>
                </div>
                <div className="space-y-1 px-2 pb-2">
                  {workingFiles.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-slate-400">无</div>
                  ) : (
                    workingFiles.map(file => renderFileRow(file, false))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-400">
              添加或扫描一个 Git 仓库
            </div>
          )}
        </div>

        {output && (
          <div className="max-h-24 overflow-auto border-t border-slate-200 bg-slate-50 px-4 py-2 font-mono text-[11px] text-slate-500">
            {output}
          </div>
        )}
      </section>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-1/2 min-h-[260px] flex-col border-b border-slate-200 bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center gap-2">
              <GitGraph className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">图表</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{selectedLog.length}</span>
            </div>
            {selectedStatus?.headHash && (
              <span className="font-mono text-xs text-slate-400">HEAD {selectedStatus.headHash}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {graphRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                暂无提交
              </div>
            ) : (
              <div className="space-y-0">
                {graphRows.map((row) => {
                  const { commit, branchLabel, commitColor, isMerge } = row;
                  const active = selectedDiff?.type === 'commit' && selectedDiff.hash === commit.hash;
                  return (
                    <button
                      key={commit.hash}
                      onClick={() => loadDiff({ type: 'commit', hash: commit.hash, title: commit.subject })}
                      className={`group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors ${
                        active ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      {renderGraphCell(row)}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-800">{commit.subject}</div>
                          {branchLabel && (
                            <span
                              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ background: colorWash(commitColor, 0.12), color: commitColor }}
                            >
                              {branchLabel}
                            </span>
                          )}
                          {isMerge && (
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              merge {commit.parents.length}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className="font-mono">{commit.shortHash}</span>
                          <span>{commit.author}</span>
                          <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(commit.date)}</span>
                          {isMerge && (
                            <span className="font-mono text-amber-600">
                              parents {commit.parents.map(parent => parent.slice(0, 7)).join(' + ')}
                            </span>
                          )}
                        </div>
                        {commit.refs.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {commit.refs.slice(0, 6).map(ref => {
                              const normalizedRef = normalizeRefName(ref);
                              const refColor = hashColor(normalizedRef);
                              const isTag = ref.startsWith('tag:');
                              return (
                              <span
                                key={ref}
                                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  background: isTag ? '#fef3c7' : colorWash(refColor, 0.12),
                                  color: isTag ? '#b45309' : refColor,
                                }}
                              >
                                {normalizedRef}
                              </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-white">
          {renderDiff()}
        </div>
      </main>
    </div>
  );
};

export default GitManager;
