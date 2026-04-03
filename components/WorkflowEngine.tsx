/**
 * WorkflowEngine — Langflow 工作流管理模块
 * 导入 Langflow JSON → DAG 可视化 → 运行 & 调参
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Workflow, Upload, Play, Settings2, Trash2, Pencil, X, ChevronDown,
  ChevronRight, ChevronUp, Loader2, CheckCircle2, AlertCircle, Clock,
  Zap, Eye, Link2, FileJson, RefreshCw, History, Copy, MoreVertical, HelpCircle,
} from 'lucide-react';
import type {
  LangflowExport, LangflowNode, LangflowEdge, LangflowField,
  WorkflowItem, WorkflowInputField, TweakField, LangflowConnection,
  WorkflowRunRecord, RunFlowOptions, RunFlowResult,
} from '../services/langflowService';
import {
  validateLangflowJson, parseLangflowJson, extractInputFields,
  extractTweakFields, getNodeStyle, getNodeStats, getNodeDisplayName,
  getNodeType, getNodeDescription, testConnection, runFlow, generateId,
} from '../services/langflowService';

// ── localStorage helpers ──

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── localStorage keys ──

const LS_CONNECTION = 'guyue_workflow_connection';
const LS_ITEMS = 'guyue_workflow_items';
const LS_ACTIVE_ID = 'guyue_workflow_active_id';
const LS_RUNS = 'guyue_workflow_runs';

// ── Dagre layout helper ──

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

function layoutDagre(
  nodes: LangflowNode[],
  edges: LangflowEdge[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 });

  nodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const rfNodes: Node[] = nodes.map((n) => {
    const pos = g.node(n.id);
    const nodeType = getNodeType(n);
    const style = getNodeStyle(nodeType);
    return {
      id: n.id,
      type: 'langflowNode',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: getNodeDisplayName(n),
        nodeType,
        nodeId: n.id,
        description: getNodeDescription(n),
        template: n.data?.node?.template ?? {},
        color: style.color,
        styleLabel: style.label,
      },
    };
  });

  const rfEdges: Edge[] = edges.map((e, i) => ({
    id: `e-${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 1.5 },
  }));

  return { nodes: rfNodes, edges: rfEdges };
}

// ── Custom React Flow node ──

interface LangflowNodeData {
  label: string;
  nodeType: string;
  nodeId: string;
  description: string;
  template: Record<string, LangflowField>;
  color: string;
  styleLabel: string;
  onNodeClick?: (nodeId: string) => void;
}

const LangflowNodeComponent = ({ data }: { data: LangflowNodeData }) => {
  return (
    <div
      className="cursor-pointer"
      onClick={() => data.onNodeClick?.(data.nodeId)}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div
        className="rounded-lg border-2 bg-white shadow-sm min-w-[160px] overflow-hidden"
        style={{ borderColor: data.color }}
      >
        <div
          className="px-2 py-0.5 text-[10px] font-semibold text-white"
          style={{ backgroundColor: data.color }}
        >
          {data.styleLabel}
        </div>
        <div className="px-2 py-1.5 text-xs font-medium text-gray-800 truncate">
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
    </div>
  );
};

const nodeTypes = { langflowNode: LangflowNodeComponent };

// ── Default connection ──

const DEFAULT_CONNECTION: LangflowConnection = {
  baseUrl: 'http://localhost:7860',
  apiKey: '',
  verified: false,
};

// ── Context menu types ──

interface ContextMenu {
  x: number;
  y: number;
  workflowId: string;
}

// ── Help Sections ──

const HELP_SECTIONS: { title: string; content: string }[] = [
  {
    title: '🔧 模块概述',
    content: `工作流引擎模块用于导入、可视化和运行 Langflow 设计的工作流。

核心流程：
1. 配置 Langflow 连接（服务器地址 + API Key）
2. 导入 Langflow 导出的 JSON 文件
3. 可视化查看工作流 DAG 拓扑图
4. 配置输入参数和微调项
5. 一键运行工作流并查看结果

适用场景：
• 将 Langflow 中设计好的 AI 工作流固化并复用
• 不再需要每次打开 Langflow 界面即可运行已有流程
• 批量管理和快速切换多个工作流`,
  },
  {
    title: '🔗 连接配置',
    content: `在左侧面板顶部配置 Langflow 服务器连接：

• Base URL：Langflow 服务地址（如 http://localhost:7860）
• API Key：Langflow 的 API 密钥（可在 Langflow 设置中获取）

点击"测试连接"验证配置是否正确。成功后连接信息自动保存。

注意事项：
• 确保 Langflow 服务正在运行
• 如果使用远程服务器，确保网络可达
• API Key 存储在本地 localStorage 中`,
  },
  {
    title: '📥 导入工作流',
    content: `支持导入 Langflow 导出的 JSON 文件：

导出方法（在 Langflow 中）：
1. 打开目标工作流
2. 点击右上角导出按钮
3. 选择"Export as JSON"
4. 保存 .json 文件

导入后自动解析：
• 节点列表和连接关系
• 输入字段（自动提取可填写的输入项）
• 微调参数（Tweaks，每个组件的可调节参数）
• DAG 拓扑结构

Flow ID 设置：
• 右键工作流 → "设置 Flow ID"
• 输入 Langflow 中该工作流的 UUID
• 运行时通过此 ID 调用 Langflow API`,
  },
  {
    title: '🗺️ DAG 可视化',
    content: `右上区域展示工作流的有向无环图（DAG）：

节点颜色含义：
• 🟢 绿色 — 输入节点（ChatInput, TextInput 等）
• 🟠 橙色 — 输出节点（ChatOutput, TextOutput 等）
• 🟣 紫色 — LLM 节点（OpenAI, Anthropic, Gemini 等）
• 🔵 蓝色 — Prompt 节点（模板和提示词）
• 🔴 红色 — Tool 节点（工具调用）
• 🔵 青色 — Retriever 节点（向量检索）
• 🟡 黄色 — Memory 节点（对话记忆）
• ⚪ 灰色 — 其他节点

交互操作：
• 点击节点 → 右侧弹出节点详情面板
• 滚轮缩放 / 拖拽平移
• 左上角显示节点统计信息
• 使用 MiniMap 快速导航大型工作流

布局算法：
• 使用 dagre 自动从左到右（LR）布局
• 节点间距 50px，层间距 80px`,
  },
  {
    title: '▶️ 运行工作流',
    content: `右下区域是运行面板：

输入参数：
• 系统自动从工作流中提取可输入字段
• 支持文本框、数字、布尔值、下拉选择等类型
• 输入字段来自 ChatInput、TextInput 等输入节点

微调参数（Tweaks）：
• 可展开的高级参数区域
• 按组件分组显示可调参数
• 修改后在运行时会覆盖工作流中的默认值
• 典型用途：调整 temperature、max_tokens、prompt 模板等

运行流程：
1. 填写输入参数
2. （可选）调整微调参数
3. 点击"运行工作流"
4. 等待执行完成（显示加载动画）
5. 查看返回结果

运行历史：
• 自动保存最近 10 次运行记录
• 显示时间、状态、耗时
• 可快速查看历史输出`,
  },
  {
    title: '📋 工作流管理',
    content: `左侧面板支持多个工作流管理：

基本操作：
• 点击选中 → 加载对应的 DAG 和输入表单
• 右键菜单：
  - 重命名：修改工作流显示名称
  - 设置 Flow ID：绑定 Langflow 服务端的工作流 UUID
  - 删除：删除本地工作流配置

数据存储：
• 工作流列表保存在 localStorage
• JSON 原始数据保存在本地，无需重复导入
• 连接配置独立存储，所有工作流共用

节点类型徽章：
• 每个工作流项显示其包含的节点类型
• 颜色编码与 DAG 视图一致
• 快速了解工作流构成`,
  },
  {
    title: '⚠️ 常见问题',
    content: `Q: 运行时报 401 错误？
A: API Key 无效或过期，请检查 Langflow 设置中的 API Key。

Q: 运行时报 404 错误？
A: Flow ID 不正确。确保右键 → 设置 Flow ID 中的 UUID 与 Langflow 中一致。

Q: 导入后看不到输入字段？
A: 工作流中可能没有 ChatInput/TextInput 类型的节点。

Q: 连接测试失败？
A: 检查：1) Langflow 是否在运行 2) URL 是否正确 3) 是否有防火墙/代理阻止

Q: DAG 图显示不完整？
A: 尝试滚轮缩小或使用 MiniMap 定位。大型工作流可能超出初始视口。

Q: 修改了 Langflow 工作流怎么更新？
A: 重新导出 JSON 并导入。也可以删除旧版后重新导入。`,
  },
];

// ── Main Component ──

function WorkflowEngine() {
  // ── Connection state ──
  const [connection, setConnection] = useState<LangflowConnection>(
    () => lsGet(LS_CONNECTION, DEFAULT_CONNECTION),
  );
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<string | null>(null);

  // ── Workflow list state ──
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(
    () => lsGet(LS_ITEMS, []),
  );
  const [activeId, setActiveId] = useState<string | null>(
    () => lsGet(LS_ACTIVE_ID, null),
  );

  // ── Run state ──
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [tweakValues, setTweakValues] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunFlowResult | null>(null);
  const [runHistory, setRunHistory] = useState<WorkflowRunRecord[]>(
    () => lsGet(LS_RUNS, []),
  );

  // ── UI state ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [flowIdEditId, setFlowIdEditId] = useState<string | null>(null);
  const [flowIdText, setFlowIdText] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // ── React Flow state ──
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  // ── Refs ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ──
  const activeWorkflow = useMemo(
    () => workflows.find((w) => w.id === activeId) ?? null,
    [workflows, activeId],
  );

  const selectedNodeData = useMemo(() => {
    if (!activeWorkflow || !selectedNodeId) return null;
    const node = activeWorkflow.rawJson.data.nodes.find(
      (n) => n.id === selectedNodeId,
    );
    if (!node) return null;
    return {
      name: getNodeDisplayName(node),
      type: getNodeType(node),
      description: getNodeDescription(node),
      template: node.data?.node?.template ?? {},
    };
  }, [activeWorkflow, selectedNodeId]);

  // ── Persist effects ──
  useEffect(() => lsSet(LS_CONNECTION, connection), [connection]);
  useEffect(() => lsSet(LS_ITEMS, workflows), [workflows]);
  useEffect(() => lsSet(LS_ACTIVE_ID, activeId), [activeId]);
  useEffect(() => lsSet(LS_RUNS, runHistory), [runHistory]);

  // ── Build React Flow graph when active workflow changes ──
  useEffect(() => {
    if (!activeWorkflow) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }
    const { nodes, edges } = layoutDagre(
      activeWorkflow.rawJson.data.nodes,
      activeWorkflow.rawJson.data.edges,
    );
    // Inject onNodeClick handler
    const nodesWithHandler = nodes.map((n) => ({
      ...n,
      data: { ...n.data, onNodeClick: (id: string) => setSelectedNodeId(id) },
    }));
    setRfNodes(nodesWithHandler);
    setRfEdges(edges);
  }, [activeWorkflow, setRfNodes, setRfEdges]);

  // ── Initialize input values when active workflow changes ──
  useEffect(() => {
    if (!activeWorkflow) {
      setInputValues({});
      setTweakValues({});
      return;
    }
    const iv: Record<string, any> = {};
    activeWorkflow.inputFields.forEach((f) => {
      iv[f.key] = f.defaultValue ?? '';
    });
    setInputValues(iv);
    const tv: Record<string, any> = {};
    activeWorkflow.tweakableFields.forEach((f) => {
      tv[`${f.nodeId}.${f.fieldKey}`] = f.currentValue ?? '';
    });
    setTweakValues(tv);
    setRunResult(null);
    setSelectedNodeId(null);
  }, [activeWorkflow?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close context menu on outside click ──
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }
  }, [contextMenu]);

  // ── Connection test ──
  const handleTestConnection = useCallback(async () => {
    setTestingConn(true);
    setConnResult(null);
    const result = await testConnection(connection);
    if (result.ok) {
      setConnection((c) => ({ ...c, verified: true, lastTestedAt: Date.now() }));
      setConnResult(`连接成功，发现 ${result.flowCount ?? 0} 个流`);
    } else {
      setConnection((c) => ({ ...c, verified: false }));
      setConnResult(result.error ?? '连接失败');
    }
    setTestingConn(false);
  }, [connection]);

  // ── Import workflow ──
  const handleImportJson = useCallback(async (content: string) => {
    try {
      const json = JSON.parse(content);
      if (!validateLangflowJson(json)) {
        alert('无效的 Langflow JSON 格式');
        return;
      }
      const parsed = parseLangflowJson(json);
      const now = Date.now();
      const item: WorkflowItem = {
        ...parsed,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        runCount: 0,
      };
      setWorkflows((prev) => [...prev, item]);
      setActiveId(item.id);
    } catch (e: any) {
      alert(`JSON 解析失败: ${e.message}`);
    }
  }, []);

  const handleImportClick = useCallback(async () => {
    try {
      // Try Electron API first
      const path = await (window as any).electronAPI?.selectFile?.();
      if (path) {
        const content = await (window as any).electronAPI?.readTextFile?.(path);
        if (content) {
          handleImportJson(content);
          return;
        }
      }
    } catch {
      // Electron API not available
    }
    // Fallback: HTML file input
    fileInputRef.current?.click();
  }, [handleImportJson]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text === 'string') handleImportJson(text);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [handleImportJson],
  );

  // ── Workflow operations ──
  const handleDeleteWorkflow = useCallback(
    (id: string) => {
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      if (activeId === id) setActiveId(null);
      setRunHistory((prev) => prev.filter((r) => r.workflowId !== id));
    },
    [activeId],
  );

  const handleRenameWorkflow = useCallback(
    (id: string, name: string) => {
      if (!name.trim()) return;
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, name: name.trim(), updatedAt: Date.now() } : w,
        ),
      );
      setRenameId(null);
    },
    [],
  );

  const handleSetFlowId = useCallback(
    (id: string, flowId: string) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, langflowFlowId: flowId.trim() || undefined, updatedAt: Date.now() }
            : w,
        ),
      );
      setFlowIdEditId(null);
    },
    [],
  );

  // ── Run workflow ──
  const handleRun = useCallback(async () => {
    if (!activeWorkflow) return;
    const flowId = activeWorkflow.langflowFlowId;
    if (!flowId) {
      alert('请先设置 Flow ID（右键工作流 → 设置 Flow ID）');
      return;
    }
    if (!connection.verified) {
      alert('请先测试并验证连接');
      return;
    }

    setRunning(true);
    setRunResult(null);

    // Build input value (use first input field)
    const primaryInput =
      inputValues[activeWorkflow.inputFields[0]?.key] ?? '';

    // Build tweaks
    const tweaks: Record<string, Record<string, any>> = {};
    for (const [compoundKey, val] of Object.entries(tweakValues)) {
      const [nodeId, fieldKey] = compoundKey.split('.');
      if (!tweaks[nodeId]) tweaks[nodeId] = {};
      tweaks[nodeId][fieldKey] = val;
    }

    const runRecord: WorkflowRunRecord = {
      id: generateId(),
      workflowId: activeWorkflow.id,
      input: inputValues,
      tweaks,
      output: null,
      status: 'running',
      timestamp: Date.now(),
    };

    const result = await runFlow({
      connection,
      flowId,
      inputValue: primaryInput,
      tweaks: Object.keys(tweaks).length > 0 ? tweaks : undefined,
    });

    const finalRecord: WorkflowRunRecord = {
      ...runRecord,
      output: result.output ?? null,
      status: result.success ? 'success' : 'error',
      error: result.error,
      duration: result.duration,
    };

    setRunResult(result);
    setRunHistory((prev) => [finalRecord, ...prev].slice(0, 10));
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === activeWorkflow.id
          ? { ...w, runCount: w.runCount + 1, lastRunAt: Date.now(), updatedAt: Date.now() }
          : w,
      ),
    );
    setRunning(false);
  }, [activeWorkflow, connection, inputValues, tweakValues]);

  // ── Toggle helpers ──
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const isCollapsed = useCallback(
    (key: string) => !!collapsed[key],
    [collapsed],
  );

  // ── Copy output ──
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  // ── Format timestamp ──
  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // ── Active workflow run history ──
  const activeRunHistory = useMemo(
    () =>
      activeWorkflow
        ? runHistory.filter((r) => r.workflowId === activeWorkflow.id)
        : [],
    [runHistory, activeWorkflow],
  );

  // ══════════════════════════════════════
  // ── RENDER HELPERS
  // ══════════════════════════════════════

  // ── Section header ──
  const renderSectionHeader = (
    sectionId: string,
    icon: React.ReactNode,
    label: string,
    extra?: React.ReactNode,
  ) => (
    <div
      className="flex items-center gap-1.5 cursor-pointer mb-1.5 p-1.5 hover:bg-gray-100 rounded"
      onClick={() => toggle(sectionId)}
    >
      {isCollapsed(sectionId) ? (
        <ChevronRight size={13} className="text-gray-400" />
      ) : (
        <ChevronDown size={13} className="text-gray-400" />
      )}
      {icon}
      <span className="text-xs font-semibold text-gray-700 flex-1">{label}</span>
      {extra}
    </div>
  );

  // ── Connection panel ──
  const renderConnectionPanel = () => (
    <div className="mb-3">
      {renderSectionHeader(
        'connection',
        <Link2 size={13} className="text-blue-500" />,
        '连接设置',
        <span
          className={`w-2 h-2 rounded-full ${
            connection.verified ? 'bg-green-500' : 'bg-red-400'
          }`}
        />,
      )}
      {!isCollapsed('connection') && (
        <div className="space-y-2 pl-5">
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">
              服务器地址
            </label>
            <input
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
              value={connection.baseUrl}
              onChange={(e) =>
                setConnection((c) => ({ ...c, baseUrl: e.target.value, verified: false }))
              }
              placeholder="http://localhost:7860"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">
              API Key
            </label>
            <input
              type="password"
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
              value={connection.apiKey}
              onChange={(e) =>
                setConnection((c) => ({ ...c, apiKey: e.target.value, verified: false }))
              }
              placeholder="可选"
            />
          </div>
          <button
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
            onClick={handleTestConnection}
            disabled={testingConn}
          >
            {testingConn ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            测试连接
          </button>
          {connResult && (
            <div
              className={`text-[10px] px-2 py-1 rounded ${
                connection.verified
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-600'
              }`}
            >
              {connResult}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── Workflow list panel ──
  const renderWorkflowList = () => (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <Workflow size={13} className="text-blue-500" />
          工作流列表
        </span>
        <button
          className="text-[10px] px-2 py-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center gap-1"
          onClick={handleImportClick}
        >
          <Upload size={11} />
          导入工作流
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div className="flex-1 overflow-y-auto space-y-1">
        {workflows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FileJson size={28} className="mx-auto mb-2 opacity-40" />
            <div className="text-[10px]">导入 Langflow JSON 开始</div>
          </div>
        ) : (
          workflows.map((w) => {
            const stats = getNodeStats(w.rawJson);
            const isActive = w.id === activeId;
            const isRenaming = renameId === w.id;
            const isEditingFlowId = flowIdEditId === w.id;
            return (
              <div
                key={w.id}
                className={`px-2.5 py-2 rounded-lg cursor-pointer border transition-colors group ${
                  isActive
                    ? 'bg-blue-50/60 border-blue-200'
                    : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                }`}
                onClick={() => setActiveId(w.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, workflowId: w.id });
                }}
              >
                {isRenaming ? (
                  <input
                    className="text-xs w-full px-1.5 py-0.5 border border-blue-300 rounded bg-white focus:outline-none"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => handleRenameWorkflow(w.id, renameText)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameWorkflow(w.id, renameText);
                      if (e.key === 'Escape') setRenameId(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : isEditingFlowId ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <label className="text-[10px] text-gray-400">Flow ID:</label>
                    <input
                      className="text-xs w-full px-1.5 py-0.5 border border-blue-300 rounded bg-white focus:outline-none mt-0.5"
                      value={flowIdText}
                      onChange={(e) => setFlowIdText(e.target.value)}
                      onBlur={() => handleSetFlowId(w.id, flowIdText)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetFlowId(w.id, flowIdText);
                        if (e.key === 'Escape') setFlowIdEditId(null);
                      }}
                      autoFocus
                      placeholder="Langflow Flow UUID"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate flex-1">
                        {w.name}
                      </span>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded"
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, workflowId: w.id });
                        }}
                      >
                        <MoreVertical size={12} className="text-gray-400" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {stats.slice(0, 4).map((s, i) => (
                        <span
                          key={i}
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                          title={`${s.type}: ${s.count}`}
                        />
                      ))}
                      <span className="text-[10px] text-gray-400 ml-1">
                        {w.rawJson.data.nodes.length} 节点
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      {w.langflowFlowId && (
                        <span className="truncate max-w-[100px]" title={w.langflowFlowId}>
                          ID: {w.langflowFlowId.slice(0, 8)}…
                        </span>
                      )}
                      {w.lastRunAt && (
                        <span className="flex items-center gap-0.5">
                          <Clock size={9} />
                          {fmtTime(w.lastRunAt)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Help modal ──
  function renderHelpModal() {
    if (!showHelp) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
        <div className="bg-white border border-gray-200 rounded-2xl w-[720px] max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <HelpCircle size={20} className="text-blue-500" /> 工作流引擎使用手册
            </h2>
            <button className="text-gray-400 hover:text-gray-700 transition-colors" onClick={() => setShowHelp(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {HELP_SECTIONS.map((section, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 mb-3">{section.title}</h3>
                <pre className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed font-sans">{section.content}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Context menu ──
  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const wf = workflows.find((w) => w.id === contextMenu.workflowId);
    if (!wf) return null;
    return (
      <div
        className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
          onClick={() => {
            setRenameId(wf.id);
            setRenameText(wf.name);
            setContextMenu(null);
          }}
        >
          <Pencil size={12} /> 重命名
        </button>
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
          onClick={() => {
            setFlowIdEditId(wf.id);
            setFlowIdText(wf.langflowFlowId ?? '');
            setContextMenu(null);
          }}
        >
          <Link2 size={12} /> 设置 Flow ID
        </button>
        <div className="border-t border-gray-100 my-0.5" />
        <button
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"
          onClick={() => {
            handleDeleteWorkflow(wf.id);
            setContextMenu(null);
          }}
        >
          <Trash2 size={12} /> 删除
        </button>
      </div>
    );
  };

  // ── DAG panel ──
  const renderDagPanel = () => {
    if (!activeWorkflow) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-50/50">
          <div className="text-center text-gray-400">
            <Workflow size={40} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">选择或导入工作流</div>
            <div className="text-[10px] mt-1">支持 Langflow 导出的 JSON 文件</div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full relative">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background gap={16} size={1} color="#e5e7eb" />
          <Controls
            showInteractive={false}
            className="!shadow-sm !border-gray-200 !rounded-lg"
          />
          <MiniMap
            nodeStrokeWidth={3}
            nodeColor={(n) => (n.data as any)?.color ?? '#6B7280'}
            className="!shadow-sm !border-gray-200 !rounded-lg"
          />
        </ReactFlow>
        {/* Node stats badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 backdrop-blur rounded-lg px-2 py-1 shadow-sm border border-gray-100">
          <Zap size={11} className="text-gray-400" />
          {getNodeStats(activeWorkflow.rawJson).map((s, i) => (
            <span
              key={i}
              className="text-[10px] flex items-center gap-0.5"
              style={{ color: s.color }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.type} {s.count}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // ── Node detail panel ──
  const renderNodeDetail = () => {
    if (!selectedNodeData) return null;
    const templateEntries = Object.entries(selectedNodeData.template).filter(
      ([k, f]) => !k.startsWith('_') && f.show !== false,
    );
    const style = getNodeStyle(selectedNodeData.type);

    return (
      <div className="absolute top-0 right-0 w-[300px] h-full bg-white border-l border-gray-200 shadow-lg z-10 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: style.color }}
            />
            <span className="text-xs font-semibold text-gray-800">
              {selectedNodeData.name}
            </span>
          </div>
          <button
            className="p-1 hover:bg-gray-100 rounded"
            onClick={() => setSelectedNodeId(null)}
          >
            <X size={14} className="text-gray-400" />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-gray-50">
          <div className="text-[10px] text-gray-500">
            类型: <span className="font-medium" style={{ color: style.color }}>{style.label}</span>
            {' · '}
            {selectedNodeData.type}
          </div>
          {selectedNodeData.description && (
            <div className="text-[10px] text-gray-400 mt-1">
              {selectedNodeData.description}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="text-[10px] font-semibold text-gray-500 mb-1.5">
            模板字段 ({templateEntries.length})
          </div>
          {templateEntries.length === 0 ? (
            <div className="text-[10px] text-gray-400">无可见字段</div>
          ) : (
            <div className="space-y-2">
              {templateEntries.map(([key, field]) => (
                <div
                  key={key}
                  className="rounded-lg bg-gray-50 px-2 py-1.5 border border-gray-100"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-gray-700">
                      {field.display_name || key}
                    </span>
                    <span className="text-[9px] text-gray-400">{field.type}</span>
                  </div>
                  {field.info && (
                    <div className="text-[9px] text-gray-400 mt-0.5">
                      {field.info}
                    </div>
                  )}
                  {field.value != null && field.value !== '' && (
                    <div className="text-[10px] text-gray-600 mt-0.5 bg-white rounded px-1.5 py-0.5 border border-gray-100 break-all max-h-[60px] overflow-y-auto">
                      {typeof field.value === 'object'
                        ? JSON.stringify(field.value)
                        : String(field.value)}
                    </div>
                  )}
                  <div className="flex gap-1 mt-0.5">
                    {field.required && (
                      <span className="text-[8px] px-1 py-0 rounded bg-red-50 text-red-500">
                        必填
                      </span>
                    )}
                    {field.advanced && (
                      <span className="text-[8px] px-1 py-0 rounded bg-gray-100 text-gray-500">
                        高级
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Input form ──
  const renderInputForm = () => {
    if (!activeWorkflow) return null;
    return (
      <div className="space-y-2">
        {activeWorkflow.inputFields.map((f) => (
          <div key={f.key}>
            <label className="text-[10px] text-gray-500 mb-0.5 block">
              {f.displayName}
              {f.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {f.type === 'textarea' ? (
              <textarea
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                rows={3}
                value={inputValues[f.key] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.description ?? ''}
              />
            ) : f.type === 'boolean' ? (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!inputValues[f.key]}
                  onChange={(e) =>
                    setInputValues((prev) => ({
                      ...prev,
                      [f.key]: e.target.checked,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                {f.description || f.displayName}
              </label>
            ) : f.type === 'number' ? (
              <input
                type="number"
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
                value={inputValues[f.key] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({
                    ...prev,
                    [f.key]: e.target.valueAsNumber,
                  }))
                }
              />
            ) : f.type === 'select' ? (
              <select
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
                value={inputValues[f.key] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              >
                {f.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-300"
                value={inputValues[f.key] ?? ''}
                onChange={(e) =>
                  setInputValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.description ?? ''}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // ── Tweaks section ──
  const renderTweaks = () => {
    if (!activeWorkflow || activeWorkflow.tweakableFields.length === 0)
      return null;
    return (
      <div className="mt-2">
        {renderSectionHeader(
          'tweaks',
          <Settings2 size={13} className="text-purple-500" />,
          `Tweaks 参数覆盖 (${activeWorkflow.tweakableFields.length})`,
        )}
        {!isCollapsed('tweaks') && (
          <div className="space-y-1.5 pl-5">
            {activeWorkflow.tweakableFields.map((f) => {
              const compKey = `${f.nodeId}.${f.fieldKey}`;
              return (
                <div key={compKey}>
                  <label className="text-[10px] text-gray-500 mb-0.5 block truncate" title={`${f.nodeName}.${f.fieldName}`}>
                    {f.nodeName}.<span className="font-medium">{f.fieldName}</span>
                  </label>
                  <input
                    className="w-full text-xs px-2 py-1 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-1 focus:ring-purple-300"
                    value={tweakValues[compKey] ?? ''}
                    onChange={(e) =>
                      setTweakValues((prev) => ({
                        ...prev,
                        [compKey]: e.target.value,
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Result display ──
  const renderResult = () => {
    if (!runResult) return null;
    return (
      <div className="mt-2">
        {runResult.success ? (
          <div className="rounded-lg border border-green-200 bg-green-50/50 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-green-700 flex items-center gap-1">
                <CheckCircle2 size={11} />
                运行成功
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400">
                  {runResult.duration ? `${(runResult.duration / 1000).toFixed(1)}s` : ''}
                </span>
                <button
                  className="p-0.5 hover:bg-green-100 rounded"
                  onClick={() => handleCopy(runResult.output ?? '')}
                  title="复制"
                >
                  <Copy size={11} className="text-green-600" />
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-700 bg-white rounded-lg border border-green-100 px-2 py-1.5 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
              {runResult.output || '(空输出)'}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-2">
            <span className="text-[10px] text-red-600 flex items-center gap-1 mb-1">
              <AlertCircle size={11} />
              运行失败
              {runResult.duration && (
                <span className="text-gray-400 ml-1">
                  {(runResult.duration / 1000).toFixed(1)}s
                </span>
              )}
            </span>
            <div className="text-xs text-red-700 bg-white rounded-lg border border-red-100 px-2 py-1.5 max-h-[120px] overflow-y-auto break-words">
              {runResult.error || '未知错误'}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Run history ──
  const renderRunHistory = () => {
    if (activeRunHistory.length === 0) return null;
    return (
      <div className="mt-2">
        {renderSectionHeader(
          'history',
          <History size={13} className="text-gray-400" />,
          `运行历史 (${activeRunHistory.length})`,
        )}
        {!isCollapsed('history') && (
          <div className="space-y-1 pl-5 max-h-[150px] overflow-y-auto">
            {activeRunHistory.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-1.5 text-[10px] py-1 px-1.5 rounded hover:bg-gray-50 border border-transparent hover:border-gray-100"
              >
                {r.status === 'success' ? (
                  <CheckCircle2 size={10} className="text-green-500 shrink-0" />
                ) : r.status === 'error' ? (
                  <AlertCircle size={10} className="text-red-500 shrink-0" />
                ) : (
                  <Loader2 size={10} className="text-blue-400 animate-spin shrink-0" />
                )}
                <span className="text-gray-400 shrink-0">{fmtTime(r.timestamp)}</span>
                {r.duration && (
                  <span className="text-gray-400 shrink-0">
                    {(r.duration / 1000).toFixed(1)}s
                  </span>
                )}
                <span className="text-gray-600 truncate flex-1">
                  {r.status === 'error'
                    ? r.error?.slice(0, 50) ?? '错误'
                    : typeof r.output === 'string'
                      ? r.output.slice(0, 50)
                      : '完成'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Run panel ──
  const renderRunPanel = () => {
    if (!activeWorkflow) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-50/30">
          <div className="text-center text-gray-400">
            <Play size={28} className="mx-auto mb-2 opacity-30" />
            <div className="text-xs">选择工作流后可运行</div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col p-3 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Play size={13} className="text-green-500" />
            运行面板
          </span>
          <div className="flex items-center gap-1">
            {activeWorkflow.langflowFlowId ? (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                <Eye size={10} />
                {activeWorkflow.langflowFlowId.slice(0, 12)}…
              </span>
            ) : (
              <span className="text-[10px] text-amber-500">未设置 Flow ID</span>
            )}
          </div>
        </div>
        {renderInputForm()}
        {renderTweaks()}
        <button
          className="mt-3 w-full text-xs px-3 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium"
          onClick={handleRun}
          disabled={running || !activeWorkflow.langflowFlowId}
        >
          {running ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              运行中…
            </>
          ) : (
            <>
              <Play size={13} />
              运行
            </>
          )}
        </button>
        {renderResult()}
        {renderRunHistory()}
      </div>
    );
  };

  // ══════════════════════════════════════
  // ── MAIN RENDER
  // ══════════════════════════════════════

  return (
    <div className="h-full flex bg-white text-gray-800">
      {renderContextMenu()}

      {/* ── Left panel ── */}
      <div className="w-[280px] shrink-0 border-r border-gray-200 overflow-y-auto p-4 bg-white flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <Workflow size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-800">工作流引擎</span>
          <div className="flex-1" />
          <button
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors"
            onClick={() => setShowHelp(true)}
            title="工作流引擎使用手册"
          >
            <HelpCircle size={15} />
          </button>
        </div>
        {renderConnectionPanel()}
        <div className="border-t border-gray-200 pt-2 mt-1 flex-1 min-h-0 flex flex-col">
          {renderWorkflowList()}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* DAG Visualization (top 50%) */}
        <div className="h-[50%] border-b border-gray-200 relative">
          {renderDagPanel()}
          {renderNodeDetail()}
        </div>

        {/* Run Panel (bottom 50%) */}
        <div className="h-[50%] min-h-0">
          {renderRunPanel()}
        </div>
      </div>
      {renderHelpModal()}
    </div>
  );
}

export { WorkflowEngine };
