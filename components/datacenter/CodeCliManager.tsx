import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  FileText,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { MarkdownContent } from '../MarkdownContent';

type CodeCliToolId = string;
type CodeCliPanel = 'globalGuide' | 'projectGuide' | 'config' | 'mcp' | 'skills';

interface CodeCliConfigFile {
  id: string;
  label: string;
  path: string;
  description: string;
}

interface CodeCliTool {
  id: CodeCliToolId;
  name: string;
  command: string;
  featureSummary: string;
  globalGuidePath: string;
  projectGuideFile: string;
  configFiles: CodeCliConfigFile[];
  mcpConfigPath: string;
  skillsPath: string;
}

interface CodeCliProject {
  id: string;
  name: string;
  path: string;
  cliId: CodeCliToolId;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

interface CodeCliState {
  tools: CodeCliTool[];
  projects: CodeCliProject[];
  activeToolId: CodeCliToolId;
  activeProjectId: string;
  activeConfigFileId: string;
  activePanel: CodeCliPanel;
}

interface CodeCliManagerProps {
  onOpenInTerminal: (command: string, title: string) => void;
}

const STORAGE_KEY = 'linkmaster_code_cli_manager_v1';
const BUILTIN_TOOL_IDS = new Set(['codex', 'opencode', 'claude', 'gemini', 'custom']);

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const joinPath = (...parts: string[]) => {
  const cleaned = parts.filter(Boolean).map((part, index) => {
    if (index === 0) return part.replace(/\/+$/, '');
    return part.replace(/^\/+|\/+$/g, '');
  });
  return cleaned.join('/');
};

const dirname = (filePath: string) => {
  const index = filePath.lastIndexOf('/');
  return index > 0 ? filePath.slice(0, index) : '/';
};

const basename = (filePath: string) => {
  const cleaned = filePath.replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] || '项目';
};

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const defaultConfigFiles = (toolId: CodeCliToolId, homeDir = ''): CodeCliConfigFile[] => {
  if (toolId === 'codex') {
    return [
      {
        id: 'main',
        label: '主配置',
        path: homeDir ? joinPath(homeDir, '.codex', 'config.toml') : '',
        description: 'Codex CLI 主配置，可维护模型、审批策略、MCP 与默认行为。',
      },
    ];
  }
  if (toolId === 'opencode') {
    return [
      {
        id: 'main',
        label: '主配置',
        path: homeDir ? joinPath(homeDir, '.config', 'opencode', 'opencode.json') : '',
        description: 'OpenCode 主配置，可维护 provider、模型、默认行为与扩展设置。',
      },
    ];
  }
  if (toolId === 'claude') {
    return [
      {
        id: 'main',
        label: '主配置',
        path: homeDir ? joinPath(homeDir, '.claude', 'settings.json') : '',
        description: 'Claude Code 主配置，可调整 provider、API 端点、默认模型与工具策略。',
      },
    ];
  }
  if (toolId === 'gemini') {
    return [
      {
        id: 'main',
        label: '主配置',
        path: homeDir ? joinPath(homeDir, '.gemini', 'settings.json') : '',
        description: 'Gemini CLI 主配置，可维护模型、provider、工具开关与上下文行为。',
      },
    ];
  }
  return [
    {
      id: 'main',
      label: '主配置',
      path: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'config.json') : '',
      description: '当前 CLI 的主配置文件。',
    },
  ];
};

const mergeConfigFiles = (
  defaultFiles: CodeCliConfigFile[],
  rawFiles: CodeCliConfigFile[] | undefined,
): CodeCliConfigFile[] => {
  const source = Array.isArray(rawFiles) ? rawFiles : [];
  const defaultIds = new Set(defaultFiles.map((file) => file.id));
  return defaultFiles
    .map((file) => ({ ...file, ...(source.find((item) => item.id === file.id) || {}) }))
    .concat(
      source
        .filter((file) => file.id && !defaultIds.has(file.id))
        .map((file) => ({
          id: file.id,
          label: file.label || '配置文件',
          path: file.path || '',
          description: file.description || '自定义配置文件。',
        })),
    );
};

const defaultTools = (homeDir = ''): CodeCliTool[] => [
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    featureSummary: 'AGENTS.md 驱动的项目规则、审批式工具调用、MCP 通过 config.toml 管理。',
    globalGuidePath: homeDir ? joinPath(homeDir, '.codex', 'AGENTS.md') : '',
    projectGuideFile: 'AGENTS.md',
    configFiles: defaultConfigFiles('codex', homeDir),
    mcpConfigPath: homeDir ? joinPath(homeDir, '.codex', 'config.toml') : '',
    skillsPath: homeDir ? joinPath(homeDir, '.codex', 'skills') : '',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    featureSummary: '偏向终端 TUI 的代码代理，适合按项目快速进入已有会话和模型配置。',
    globalGuidePath: homeDir ? joinPath(homeDir, '.config', 'opencode', 'AGENTS.md') : '',
    projectGuideFile: 'AGENTS.md',
    configFiles: defaultConfigFiles('opencode', homeDir),
    mcpConfigPath: homeDir ? joinPath(homeDir, '.config', 'opencode', 'opencode.json') : '',
    skillsPath: homeDir ? joinPath(homeDir, '.config', 'opencode', 'skills') : '',
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    featureSummary: '以 CLAUDE.md 作为长期项目记忆，适合管理项目约定、子代理和 slash commands。',
    globalGuidePath: homeDir ? joinPath(homeDir, '.claude', 'CLAUDE.md') : '',
    projectGuideFile: 'CLAUDE.md',
    configFiles: defaultConfigFiles('claude', homeDir),
    mcpConfigPath: homeDir ? joinPath(homeDir, '.claude', 'settings.json') : '',
    skillsPath: homeDir ? joinPath(homeDir, '.claude', 'commands') : '',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    command: 'gemini',
    featureSummary: '以 GEMINI.md 提供上下文规则，适合把项目说明、工具配置和扩展集中管理。',
    globalGuidePath: homeDir ? joinPath(homeDir, '.gemini', 'GEMINI.md') : '',
    projectGuideFile: 'GEMINI.md',
    configFiles: defaultConfigFiles('gemini', homeDir),
    mcpConfigPath: homeDir ? joinPath(homeDir, '.gemini', 'settings.json') : '',
    skillsPath: homeDir ? joinPath(homeDir, '.gemini', 'extensions') : '',
  },
  {
    id: 'custom',
    name: 'Custom CLI',
    command: '',
    featureSummary: '自定义本机代码 CLI，适合接入你自己的 agent、脚本或实验工具。',
    globalGuidePath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'AGENTS.md') : '',
    projectGuideFile: 'AGENTS.md',
    configFiles: defaultConfigFiles('custom', homeDir),
    mcpConfigPath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'mcp.json') : '',
    skillsPath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'skills') : '',
  },
];

const normalizeState = (raw: Partial<CodeCliState> | null | undefined, homeDir = ''): CodeCliState => {
  const defaults = defaultTools(homeDir);
  const rawTools = Array.isArray(raw?.tools) ? raw.tools : [];
  const defaultIds = new Set(defaults.map((tool) => tool.id));
  const tools = defaults.map((tool) => ({
    ...tool,
    ...(rawTools.find((item) => item.id === tool.id) || {}),
    configFiles: mergeConfigFiles(
      tool.configFiles,
      rawTools.find((item) => item.id === tool.id)?.configFiles,
    ),
    globalGuidePath: rawTools.find((item) => item.id === tool.id)?.globalGuidePath || tool.globalGuidePath,
    mcpConfigPath: rawTools.find((item) => item.id === tool.id)?.mcpConfigPath || tool.mcpConfigPath,
    skillsPath: rawTools.find((item) => item.id === tool.id)?.skillsPath || tool.skillsPath,
  })).concat(rawTools
    .filter((tool) => tool.id && !defaultIds.has(tool.id))
    .map((tool) => ({
      id: tool.id,
      name: tool.name || 'Custom CLI',
      command: tool.command || '',
      featureSummary: tool.featureSummary || '自定义本机代码 CLI。',
      globalGuidePath: tool.globalGuidePath || (homeDir ? joinPath(homeDir, '.config', 'code-cli', 'AGENTS.md') : ''),
      projectGuideFile: tool.projectGuideFile || 'AGENTS.md',
      configFiles: mergeConfigFiles(defaultConfigFiles(tool.id, homeDir), tool.configFiles),
      mcpConfigPath: tool.mcpConfigPath || (homeDir ? joinPath(homeDir, '.config', 'code-cli', 'mcp.json') : ''),
      skillsPath: tool.skillsPath || (homeDir ? joinPath(homeDir, '.config', 'code-cli', 'skills') : ''),
    })));

  return {
    tools,
    projects: Array.isArray(raw?.projects) ? raw.projects : [],
    activeToolId: raw?.activeToolId || 'codex',
    activeProjectId: raw?.activeProjectId || '',
    activeConfigFileId: raw?.activeConfigFileId || 'main',
    activePanel: raw?.activePanel || 'globalGuide',
  };
};

const loadState = (): CodeCliState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeState(null);
  }
};

const panelMeta: Record<CodeCliPanel, { label: string; hint: string }> = {
  globalGuide: { label: '全局指导', hint: '当前 CLI 的全局 Markdown 指导文件' },
  projectGuide: { label: '项目指导', hint: '当前项目目录内的 Markdown 指导文件' },
  config: { label: '配置文件', hint: '当前 CLI 的主配置文件与额外配置文件' },
  mcp: { label: 'MCP', hint: '当前 CLI 的 MCP 配置文件' },
  skills: { label: 'Skills', hint: '当前 CLI 的 Skills 目录与说明文件' },
};

export const CodeCliManager: React.FC<CodeCliManagerProps> = ({ onOpenInTerminal }) => {
  const [state, setState] = useState<CodeCliState>(() => loadState());
  const [homeDir, setHomeDir] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileStatus, setFileStatus] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  const activeTool = state.tools.find((tool) => tool.id === state.activeToolId) || state.tools[0];
  const activeConfigFile = activeTool?.configFiles.find((file) => file.id === state.activeConfigFileId)
    || activeTool?.configFiles[0]
    || null;
  const toolProjects = useMemo(
    () => state.projects.filter((project) => project.cliId === activeTool?.id),
    [activeTool?.id, state.projects],
  );
  const activeProject = toolProjects.find((project) => project.id === state.activeProjectId) || toolProjects[0] || null;
  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return toolProjects;
    return toolProjects.filter((project) =>
      project.name.toLowerCase().includes(q) ||
      project.path.toLowerCase().includes(q) ||
      project.note?.toLowerCase().includes(q),
    );
  }, [projectSearch, toolProjects]);

  const activeFilePath = useMemo(() => {
    if (!activeTool) return '';
    if (state.activePanel === 'globalGuide') return activeTool.globalGuidePath;
    if (state.activePanel === 'config') return activeConfigFile?.path || '';
    if (state.activePanel === 'mcp') return activeTool.mcpConfigPath;
    if (state.activePanel === 'skills') return activeTool.skillsPath ? joinPath(activeTool.skillsPath, 'README.md') : '';
    if (!activeProject) return '';
    return joinPath(activeProject.path, activeTool.projectGuideFile || 'AGENTS.md');
  }, [activeConfigFile?.path, activeProject, activeTool, state.activePanel]);

  const commandPreview = useMemo(() => {
    if (!activeProject || !activeTool?.command.trim()) return '';
    return `cd ${shellQuote(activeProject.path)} && ${activeTool.command.trim()}`;
  }, [activeProject, activeTool]);

  useEffect(() => {
    window.electronAPI?.getHomeDir?.().then((dir) => {
      if (!dir) return;
      setHomeDir(dir);
      setState((prev) => normalizeState(prev, dir));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!activeTool) return;
    const currentBelongsToActiveTool = state.projects.some(
      (project) => project.id === state.activeProjectId && project.cliId === activeTool.id,
    );
    if (!currentBelongsToActiveTool) {
      const nextProject = state.projects.find((project) => project.cliId === activeTool.id);
      const nextActiveProjectId = nextProject?.id || '';
      setState((prev) => (
        prev.activeProjectId === nextActiveProjectId
          ? prev
          : { ...prev, activeProjectId: nextActiveProjectId }
      ));
    }
  }, [activeTool?.id, state.projects, state.activeProjectId]);

  useEffect(() => {
    if (!activeTool) return;
    const nextConfigFileId = activeTool.configFiles[0]?.id || '';
    const exists = activeTool.configFiles.some((file) => file.id === state.activeConfigFileId);
    if (!exists) {
      setState((prev) => (
        prev.activeConfigFileId === nextConfigFileId
          ? prev
          : { ...prev, activeConfigFileId: nextConfigFileId }
      ));
    }
  }, [activeTool, state.activeConfigFileId]);

  useEffect(() => {
    let cancelled = false;
    const loadFile = async () => {
      setSaveState('idle');
      if (!activeFilePath) {
        setFileContent('');
        setFileStatus(state.activePanel === 'projectGuide' ? '请先选择项目。' : '请先配置文件路径。');
        return;
      }
      setIsFileLoading(true);
      const exists = await window.electronAPI?.checkFileExists?.(activeFilePath);
      if (cancelled) return;
      if (exists) {
        const content = await window.electronAPI?.readFile?.(activeFilePath);
        if (cancelled) return;
        setFileContent(typeof content === 'string' ? content : '');
        setFileStatus(activeFilePath);
      } else {
        setFileContent(createTemplateContent());
        setFileStatus(`文件不存在，保存后创建：${activeFilePath}`);
      }
      setIsFileLoading(false);
    };
    void loadFile();
    return () => { cancelled = true; };
  }, [activeFilePath, state.activePanel, activeTool?.id, activeProject?.id]);

  const updateTool = (toolId: CodeCliToolId, updater: (tool: CodeCliTool) => CodeCliTool) => {
    setState((prev) => ({
      ...prev,
      tools: prev.tools.map((tool) => tool.id === toolId ? updater(tool) : tool),
    }));
  };

  const updateConfigFile = (
    toolId: CodeCliToolId,
    configFileId: string,
    updater: (configFile: CodeCliConfigFile) => CodeCliConfigFile,
  ) => {
    updateTool(toolId, (tool) => ({
      ...tool,
      configFiles: tool.configFiles.map((configFile) => (
        configFile.id === configFileId ? updater(configFile) : configFile
      )),
    }));
  };

  const updateProject = (projectId: string, updater: (project: CodeCliProject) => CodeCliProject) => {
    setState((prev) => ({
      ...prev,
      projects: prev.projects.map((project) => project.id === projectId ? { ...updater(project), updatedAt: Date.now() } : project),
    }));
  };

  const startRenameProject = (project: CodeCliProject) => {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
  };

  const commitProjectRename = () => {
    if (!editingProjectId) return;
    const name = editingProjectName.trim();
    if (name) {
      updateProject(editingProjectId, (project) => ({ ...project, name }));
    }
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const cancelProjectRename = () => {
    setEditingProjectId(null);
    setEditingProjectName('');
  };

  const handleAddProject = async () => {
    const path = await window.electronAPI?.selectDirectory?.();
    if (!path) return;
    const project: CodeCliProject = {
      id: uid('code-cli-project'),
      name: basename(path),
      path,
      cliId: activeTool?.id || 'codex',
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      activeProjectId: project.id,
    }));
  };

  const handleAddTool = () => {
    const tool: CodeCliTool = {
      id: uid('cli'),
      name: 'New CLI',
      command: '',
      featureSummary: '自定义本机代码 CLI。',
      globalGuidePath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'AGENTS.md') : '',
      projectGuideFile: 'AGENTS.md',
      configFiles: defaultConfigFiles('custom', homeDir),
      mcpConfigPath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'mcp.json') : '',
      skillsPath: homeDir ? joinPath(homeDir, '.config', 'code-cli', 'skills') : '',
    };
    setState((prev) => ({
      ...prev,
      tools: [...prev.tools, tool],
      activeToolId: tool.id,
      activeConfigFileId: tool.configFiles[0]?.id || 'main',
    }));
  };

  const handleAddConfigFile = () => {
    if (!activeTool) return;
    const directory = dirname(activeTool.configFiles[0]?.path || activeTool.globalGuidePath || (homeDir || '/'));
    const fileId = uid('config');
    const nextFile: CodeCliConfigFile = {
      id: fileId,
      label: '额外配置',
      path: joinPath(directory, `${activeTool.id}.config.local.json`),
      description: '额外补充配置，例如不同 provider、实验模型或本地覆盖项。',
    };
    updateTool(activeTool.id, (tool) => ({
      ...tool,
      configFiles: [...tool.configFiles, nextFile],
    }));
    setState((prev) => ({
      ...prev,
      activePanel: 'config',
      activeConfigFileId: fileId,
    }));
  };

  const handleDeleteConfigFile = (configFileId: string) => {
    if (!activeTool || configFileId === 'main') return;
    updateTool(activeTool.id, (tool) => ({
      ...tool,
      configFiles: tool.configFiles.filter((configFile) => configFile.id !== configFileId),
    }));
    const fallbackId = activeTool.configFiles.find((configFile) => configFile.id !== configFileId)?.id || 'main';
    setState((prev) => ({
      ...prev,
      activeConfigFileId: prev.activeConfigFileId === configFileId ? fallbackId : prev.activeConfigFileId,
    }));
  };

  const handleDeleteTool = (toolId: string) => {
    if (BUILTIN_TOOL_IDS.has(toolId)) return;
    setState((prev) => {
      const tools = prev.tools.filter((tool) => tool.id !== toolId);
      const fallbackId = tools[0]?.id || 'codex';
      return {
        ...prev,
        tools,
        activeToolId: prev.activeToolId === toolId ? fallbackId : prev.activeToolId,
        projects: prev.projects.map((project) => project.cliId === toolId ? { ...project, cliId: fallbackId } : project),
      };
    });
  };

  const handleDeleteProject = (projectId: string) => {
    setState((prev) => {
      const projects = prev.projects.filter((project) => project.id !== projectId);
      const currentToolId = prev.activeToolId;
      const nextProject = projects.find((project) => project.cliId === currentToolId);
      return {
        ...prev,
        projects,
        activeProjectId: prev.activeProjectId === projectId ? nextProject?.id || '' : prev.activeProjectId,
      };
    });
  };

  const handleLaunch = () => {
    if (!activeProject || !activeTool || !commandPreview) {
      setFileStatus('请先选择项目，并配置 CLI 启动命令。');
      return;
    }
    onOpenInTerminal(commandPreview, `${activeTool.name} · ${activeProject.name}`);
  };

  const handleSaveFile = async () => {
    if (!activeFilePath) return;
    setSaveState('saving');
    const dir = dirname(activeFilePath);
    if (dir) await window.electronAPI?.ensureDir?.(dir);
    if (state.activePanel === 'skills' && activeTool?.skillsPath) {
      await window.electronAPI?.ensureDir?.(activeTool.skillsPath);
    }
    const ok = await window.electronAPI?.writeFile?.(activeFilePath, fileContent);
    setSaveState(ok ? 'saved' : 'error');
    setFileStatus(ok ? `已保存：${activeFilePath}` : `保存失败：${activeFilePath}`);
  };

  const createTemplateContent = () => {
    if (!activeTool) return '';
    if (state.activePanel === 'config') {
      if (activeFilePath.endsWith('.toml')) {
        return '# CLI config\n';
      }
      if (activeFilePath.endsWith('.json')) {
        return '{}\n';
      }
      return '# Configuration\n';
    }
    if (state.activePanel === 'mcp') {
      if (activeTool.id === 'codex') {
        return '# MCP servers\n\n[mcp_servers]\n\n# Example:\n# [mcp_servers.filesystem]\n# command = "npx"\n# args = ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]\n';
      }
      if (activeTool.id === 'claude') {
        return '{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]\n    }\n  }\n}\n';
      }
      if (activeTool.id === 'gemini') {
        return '{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]\n    }\n  }\n}\n';
      }
      return '{\n  "mcp": {}\n}\n';
    }
    if (state.activePanel === 'skills') {
      if (activeTool.id === 'claude') {
        return '# Claude Code Commands\n\n在这里记录 slash commands、子代理调用习惯和可复用工作流。\n\n## 常用命令\n\n- `/review`：代码审查\n- `/test`：运行测试\n';
      }
      if (activeTool.id === 'gemini') {
        return '# Gemini Extensions\n\n在这里记录 Gemini CLI 扩展、工具说明和可复用提示模板。\n';
      }
      return `# ${activeTool.name} Skills\n\n在这里记录本 CLI 的 Skills 目录约定、常用技能和维护说明。\n`;
    }
    if (state.activePanel === 'projectGuide') {
      const title = activeTool.id === 'claude'
        ? 'Claude Code Project Memory'
        : activeTool.id === 'gemini'
          ? 'Gemini Project Context'
          : 'Agent Guide';
      return `# ${activeProject?.name || 'Project'} ${title}\n\n## 项目结构\n\n## 编码约定\n\n## 运行与测试\n\n## 代理注意事项\n`;
    }
    if (activeTool.id === 'claude') {
      return '# Claude Code Global Memory\n\n## 工作方式\n\n## 代码偏好\n\n## 常用命令\n\n## 禁止事项\n';
    }
    if (activeTool.id === 'gemini') {
      return '# Gemini CLI Global Context\n\n## 工作方式\n\n## 工具偏好\n\n## 输出要求\n';
    }
    return `# ${activeTool.name} Global Guide\n\n## 工作方式\n\n## 偏好设置\n\n## 注意事项\n`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-white text-gray-900">
      <header className="h-14 shrink-0 border-b border-gray-200 bg-white px-5 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2 pr-2">
            <Terminal className="w-4 h-4 text-blue-600" />
            <span className="font-semibold">Code CLI</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            {state.tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setState((prev) => ({ ...prev, activeToolId: tool.id }))}
                className={`h-8 shrink-0 px-3 border text-sm font-medium transition-colors ${
                  state.activeToolId === tool.id
                    ? 'border-gray-900 text-gray-900 bg-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-400'
                }`}
              >
                {tool.name}
              </button>
            ))}
            <button
              onClick={handleAddTool}
              className="h-8 w-8 shrink-0 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600"
              title="新增 CLI"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="h-8 w-8 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900"
            title="Code CLI 设置"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleLaunch}
            disabled={!commandPreview}
            className="h-8 shrink-0 px-3 flex items-center gap-2 border border-blue-600 bg-blue-600 text-white text-sm disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <Play className="w-4 h-4" />
            启动
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="h-11 px-4 border-b border-gray-200 flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">项目文件夹</div>
            <div className="truncate text-[11px] text-gray-400">{activeTool?.name || 'CLI'}</div>
          </div>
          <button onClick={handleAddProject} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-blue-600" title="添加项目文件夹">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2.5 border-b border-gray-100">
          <div className="h-8 border border-gray-200 flex items-center px-2.5 gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              value={projectSearch}
              onChange={(event) => setProjectSearch(event.target.value)}
              placeholder="搜索项目文件夹"
              className="min-w-0 flex-1 outline-none text-xs bg-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredProjects.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              暂无项目文件夹
            </div>
          ) : (
            filteredProjects.map((project) => {
              const selected = activeProject?.id === project.id;
              const isEditing = editingProjectId === project.id;
              return (
                <div
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setState((prev) => ({ ...prev, activeProjectId: project.id }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setState((prev) => ({ ...prev, activeProjectId: project.id }));
                    }
                  }}
                  className={`group w-full border-b border-gray-100 px-3 py-2 text-left transition-colors ${selected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editingProjectName}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setEditingProjectName(event.target.value)}
                          onBlur={commitProjectRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitProjectRename();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelProjectRename();
                            }
                          }}
                          className="h-6 w-full border-b border-blue-500 bg-transparent text-sm font-medium leading-5 outline-none"
                        />
                      ) : (
                        <div className="truncate text-sm font-medium leading-5 text-gray-900">{project.name}</div>
                      )}
                      <div className="truncate text-xs text-gray-400">{project.path}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          startRenameProject(project);
                        }}
                        className="text-gray-300 hover:text-blue-600"
                        title="重命名项目"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(event) => { event.stopPropagation(); handleDeleteProject(project.id); }}
                        className="text-gray-300 hover:text-red-500"
                        title="删除项目"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

        <main className="flex-1 min-w-0 flex flex-col bg-white">
          <section className="min-w-0 flex-1 min-h-0 flex flex-col">
            <div className="h-14 border-b border-gray-200 px-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {([
                  ['globalGuide', BookOpen],
                  ['projectGuide', FileText],
                  ['config', Settings2],
                  ['mcp', Code2],
                  ['skills', Sparkles],
                ] as const).map(([key, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setState((prev) => ({ ...prev, activePanel: key }))}
                    className={`h-8 px-3 flex items-center gap-1.5 border text-sm transition-colors ${
                      state.activePanel === key
                        ? 'border-gray-900 text-gray-900'
                        : 'border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {panelMeta[key].label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSaveFile}
                disabled={!activeFilePath || saveState === 'saving'}
                className="h-8 px-3 flex items-center gap-2 border border-gray-900 text-xs text-gray-900 disabled:border-gray-200 disabled:text-gray-300"
              >
                {saveState === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                保存
              </button>
            </div>

            <div className="border-b border-gray-100 px-5 py-3">
              <div className="text-sm font-medium">{panelMeta[state.activePanel].label}</div>
              <div className="mt-1 text-xs text-gray-400">{panelMeta[state.activePanel].hint}</div>
              {state.activePanel === 'config' && activeTool && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeTool.configFiles.map((configFile) => (
                    <button
                      key={configFile.id}
                      onClick={() => setState((prev) => ({ ...prev, activeConfigFileId: configFile.id }))}
                      className={`h-7 px-2.5 border text-xs transition-colors ${
                        activeConfigFile?.id === configFile.id
                          ? 'border-gray-900 text-gray-900'
                          : 'border-gray-200 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {configFile.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={state.activePanel === 'globalGuide'
                    ? activeTool?.globalGuidePath || ''
                    : state.activePanel === 'config'
                      ? activeConfigFile?.path || ''
                    : state.activePanel === 'mcp'
                      ? activeTool?.mcpConfigPath || ''
                      : state.activePanel === 'skills'
                        ? activeTool?.skillsPath || ''
                        : activeTool?.projectGuideFile || ''}
                  onChange={(event) => {
                    if (!activeTool) return;
                    const value = event.target.value;
                    if (state.activePanel === 'globalGuide') updateTool(activeTool.id, (tool) => ({ ...tool, globalGuidePath: value }));
                    if (state.activePanel === 'config' && activeConfigFile) {
                      updateConfigFile(activeTool.id, activeConfigFile.id, (configFile) => ({ ...configFile, path: value }));
                    }
                    if (state.activePanel === 'mcp') updateTool(activeTool.id, (tool) => ({ ...tool, mcpConfigPath: value }));
                    if (state.activePanel === 'skills') updateTool(activeTool.id, (tool) => ({ ...tool, skillsPath: value }));
                    if (state.activePanel === 'projectGuide') updateTool(activeTool.id, (tool) => ({ ...tool, projectGuideFile: value }));
                  }}
                  className="min-w-0 flex-1 border-b border-gray-200 py-1.5 outline-none font-mono text-xs"
                />
                <button
                  onClick={() => {
                    const target = state.activePanel === 'skills' ? activeTool?.skillsPath : activeFilePath;
                    if (target) window.electronAPI?.openPath?.(target);
                  }}
                  className="h-8 px-3 border border-gray-200 text-xs text-gray-500 hover:text-blue-600"
                >
                  打开
                </button>
              </div>
              {state.activePanel === 'config' && activeConfigFile && (
                <div className="mt-2 text-xs text-gray-500">{activeConfigFile.description}</div>
              )}
              <div className="mt-2 truncate text-xs text-gray-400">{fileStatus}</div>
            </div>

            <div className="min-h-0 flex-1 grid grid-cols-2">
              <div className="min-w-0 border-r border-gray-200">
                <textarea
                  value={fileContent}
                  onChange={(event) => { setFileContent(event.target.value); setSaveState('idle'); }}
                  disabled={isFileLoading || !activeFilePath}
                  className="h-full w-full resize-none border-0 p-5 font-mono text-sm leading-6 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="选择文件后编辑..."
                />
              </div>
              <div className="min-w-0 overflow-auto p-5">
                {state.activePanel === 'mcp' || state.activePanel === 'config' ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{fileContent}</pre>
                ) : (
                  <MarkdownContent content={fileContent || ' '} />
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
      {isSettingsOpen && activeTool && (
        <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm">
          <div className="absolute inset-6 flex min-h-0 flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl">
            <div className="h-14 shrink-0 border-b border-gray-200 px-5 flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">Code CLI 设置</div>
                <div className="truncate text-xs text-gray-400">
                  {activeTool.name}{activeProject ? ` · ${activeProject.name}` : ''}
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="h-8 w-8 flex items-center justify-center border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-900"
                title="关闭设置"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-6">
              <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-6">
                <section className="space-y-5 border border-gray-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">CLI 配置</div>
                      <div className="mt-1 text-xs text-gray-400">维护 CLI 名称、启动命令和配置文件入口。</div>
                    </div>
                    {!BUILTIN_TOOL_IDS.has(activeTool.id) && (
                      <button
                        onClick={() => handleDeleteTool(activeTool.id)}
                        className="text-gray-300 hover:text-red-500"
                        title="删除当前 CLI"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-500">
                    {activeTool.featureSummary || '自定义本机代码 CLI。'}
                  </div>

                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-gray-400">名称</span>
                    <input
                      value={activeTool.name}
                      onChange={(event) => updateTool(activeTool.id, (tool) => ({ ...tool, name: event.target.value }))}
                      className="mt-1 w-full border-b border-gray-200 py-2 outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-gray-400">启动命令</span>
                    <input
                      value={activeTool.command}
                      onChange={(event) => updateTool(activeTool.id, (tool) => ({ ...tool, command: event.target.value }))}
                      placeholder="codex / opencode / your-cli"
                      className="mt-1 w-full border-b border-gray-200 py-2 font-mono text-xs outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-gray-400">特色说明</span>
                    <textarea
                      value={activeTool.featureSummary}
                      onChange={(event) => updateTool(activeTool.id, (tool) => ({ ...tool, featureSummary: event.target.value }))}
                      className="mt-1 min-h-20 w-full resize-none border border-gray-200 p-2 text-xs leading-5 outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-gray-400">项目指导文件名</span>
                    <input
                      value={activeTool.projectGuideFile}
                      onChange={(event) => updateTool(activeTool.id, (tool) => ({ ...tool, projectGuideFile: event.target.value }))}
                      className="mt-1 w-full border-b border-gray-200 py-2 font-mono text-xs outline-none"
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-gray-400">配置文件</span>
                      <button
                        onClick={handleAddConfigFile}
                        className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-blue-600"
                        title="新增配置文件"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {activeTool.configFiles.map((configFile) => {
                        const selected = state.activePanel === 'config' && activeConfigFile?.id === configFile.id;
                        return (
                          <div
                            key={configFile.id}
                            className={`group flex items-start gap-2 border px-3 py-2 transition-colors ${
                              selected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setState((prev) => ({
                                  ...prev,
                                  activePanel: 'config',
                                  activeConfigFileId: configFile.id,
                                }));
                                setIsSettingsOpen(false);
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate text-xs font-medium text-gray-800">{configFile.label}</div>
                              <div className="truncate font-mono text-[11px] text-gray-400">{configFile.path}</div>
                            </button>
                            {configFile.id !== 'main' && (
                              <button
                                onClick={() => handleDeleteConfigFile(configFile.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"
                                title="删除配置文件"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="space-y-5 border border-gray-200 bg-white p-5">
                  <div>
                    <div className="text-sm font-semibold">当前项目</div>
                    <div className="mt-1 text-xs text-gray-400">项目名称会显示在左侧列表和终端标题中。</div>
                  </div>

                  {activeProject ? (
                    <div className="space-y-4 text-sm">
                      <label className="block">
                        <span className="text-xs uppercase tracking-widest text-gray-400">项目名称</span>
                        <input
                          value={activeProject.name}
                          onChange={(event) => updateProject(activeProject.id, (project) => ({ ...project, name: event.target.value }))}
                          className="mt-1 w-full border-b border-gray-200 py-2 outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs uppercase tracking-widest text-gray-400">项目路径</span>
                        <div className="mt-1 flex gap-2">
                          <input
                            value={activeProject.path}
                            onChange={(event) => updateProject(activeProject.id, (project) => ({ ...project, path: event.target.value }))}
                            className="min-w-0 flex-1 border-b border-gray-200 py-2 font-mono text-xs outline-none"
                          />
                          <button
                            onClick={() => window.electronAPI?.openPath?.(activeProject.path)}
                            className="h-9 px-2 border border-gray-200 text-gray-500 hover:text-blue-600"
                            title="打开文件夹"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        </div>
                      </label>

                      <label className="block">
                        <span className="text-xs uppercase tracking-widest text-gray-400">使用 CLI</span>
                        <select
                          value={activeProject.cliId}
                          onChange={(event) => {
                            const cliId = event.target.value as CodeCliToolId;
                            updateProject(activeProject.id, (project) => ({ ...project, cliId }));
                            setState((prev) => ({ ...prev, activeToolId: cliId }));
                          }}
                          className="mt-1 w-full border-b border-gray-200 bg-white py-2 outline-none"
                        >
                          {state.tools.map((tool) => (
                            <option key={tool.id} value={tool.id}>{tool.name}</option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs uppercase tracking-widest text-gray-400">项目备注</span>
                        <textarea
                          value={activeProject.note || ''}
                          onChange={(event) => updateProject(activeProject.id, (project) => ({ ...project, note: event.target.value }))}
                          placeholder="项目备注..."
                          className="mt-1 min-h-24 w-full resize-none border border-gray-200 p-2 text-sm outline-none"
                        />
                      </label>

                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-widest text-gray-400">启动预览</div>
                        <pre className="min-h-16 whitespace-pre-wrap border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">{commandPreview || '选择项目并配置启动命令后显示。'}</pre>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleAddProject}
                      className="w-full border border-dashed border-gray-300 py-10 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600"
                    >
                      添加项目文件夹
                    </button>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeCliManager;
