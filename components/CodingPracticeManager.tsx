import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  FolderPlus,
  GripVertical,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Play,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { AVAILABLE_COLORS, AVAILABLE_ICONS, colorMap, getCategoryIcon } from './LearningConstants';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownNote } from '../types';

type PracticeLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'cpp'
  | 'java'
  | 'go'
  | 'rust'
  | 'swift';

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

type PracticeFileId = 'input' | 'code' | 'output' | 'notes';

interface PracticeFile {
  id: PracticeFileId;
  name: string;
  editorLanguage: string;
  content: string;
}

interface LanguageMeta {
  label: string;
  accent: string;
  editorLanguage: string;
  starterCode: string;
}

interface PracticeRunnerConfig {
  compileCommand: string;
  runCommand: string;
  timeoutSeconds: number;
}

interface PracticeRunNotice {
  tone: 'success' | 'error' | 'info';
  title: string;
  text: string;
  details?: string;
  stage?: 'prepare' | 'compile' | 'run';
}

interface PracticeEditorMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

interface CodingPracticeManagerProps {
  headerSlot?: React.ReactNode;
}

const STORAGE_KEY_CATEGORIES = 'coding_practice_categories_v1';
const STORAGE_KEY_SESSIONS = 'coding_practice_sessions_v2';
const LEGACY_STORAGE_KEY_SESSIONS = 'coding_practice_sessions_v1';
const STORAGE_KEY_ACTIVE = 'coding_practice_active_v1';
const STORAGE_KEY_FONT_SIZE = 'coding_practice_font_size_v1';
const STORAGE_KEY_WRAP = 'coding_practice_word_wrap_v1';
const STORAGE_KEY_HIGHLIGHT_LINE = 'coding_practice_highlight_line_v1';
const STORAGE_KEY_RUNNERS = 'coding_practice_runner_configs_v1';
const DEFAULT_CATEGORY_ID = 'coding-practice-default-category';
const DEFAULT_INPUT_TEMPLATE = '=== case 1 ===\n';

const LANGUAGE_META: Record<PracticeLanguage, LanguageMeta> = {
  typescript: {
    label: 'TypeScript',
    accent: '#2563eb',
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
    accent: '#d97706',
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
    accent: '#0891b2',
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
    accent: '#7c3aed',
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
    accent: '#dc2626',
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
    accent: '#0f766e',
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
    accent: '#92400e',
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
    accent: '#ea580c',
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

const DEFAULT_RUNNER_CONFIGS: Record<PracticeLanguage, PracticeRunnerConfig> = {
  typescript: {
    compileCommand: '',
    runCommand: 'tsx "{{codeFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  javascript: {
    compileCommand: '',
    runCommand: 'node "{{codeFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  python: {
    compileCommand: '',
    runCommand: 'python3 "{{codeFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  cpp: {
    compileCommand: 'clang++ -std=c++17 -O2 "{{codeFile}}" -o "{{binaryFile}}"',
    runCommand: '"{{binaryFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  java: {
    compileCommand: 'javac "{{codeFile}}"',
    runCommand: 'java -cp "{{workDir}}" Main < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  go: {
    compileCommand: '',
    runCommand: 'go run "{{codeFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  rust: {
    compileCommand: 'rustc "{{codeFile}}" -O -o "{{binaryFile}}"',
    runCommand: '"{{binaryFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
  swift: {
    compileCommand: '',
    runCommand: 'swift "{{codeFile}}" < "{{inputFile}}" > "{{outputFile}}"',
    timeoutSeconds: 15,
  },
};

const createDefaultFiles = (language: PracticeLanguage, codeContent?: string): PracticeFile[] => [
  {
    id: 'input',
    name: 'input.in',
    editorLanguage: 'plaintext',
    content: DEFAULT_INPUT_TEMPLATE,
  },
  {
    id: 'code',
    name: getCodeFileName(language),
    editorLanguage: LANGUAGE_META[language].editorLanguage,
    content: codeContent ?? LANGUAGE_META[language].starterCode,
  },
  {
    id: 'output',
    name: 'output.out',
    editorLanguage: 'plaintext',
    content: '',
  },
  {
    id: 'notes',
    name: 'notes.md',
    editorLanguage: 'markdown',
    content: '',
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

const normalizeCategories = (categories: unknown): PracticeCategory[] => {
  const source = Array.isArray(categories) ? categories : [];
  const normalized = source
    .map((entry, index) => ({
      id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id : `coding-practice-category-${index}`,
      name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : `分类 ${index + 1}`,
      description: typeof entry?.description === 'string' ? entry.description : '',
      icon: typeof entry?.icon === 'string' && entry.icon.trim() ? entry.icon : 'Code',
      color: typeof entry?.color === 'string' && colorMap[entry.color] ? entry.color : 'blue',
      priority: Number.isFinite(Number(entry?.priority)) ? Number(entry.priority) : index,
      noteContent: typeof entry?.noteContent === 'string' ? entry.noteContent : '',
    }))
    .filter(category => category.name);

  if (normalized.length === 0) {
    return [createDefaultCategory()];
  }

  const hasDefault = normalized.some(category => category.id === DEFAULT_CATEGORY_ID);
  const next = hasDefault ? normalized : [createDefaultCategory(), ...normalized];
  return sortCategories(next).map((category, index) => ({ ...category, priority: index }));
};

const getSortedCategoryIds = (categories: PracticeCategory[]) => sortCategories(categories).map(category => category.id);

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
    const nextGroup = groups.get(targetCategoryId) || [];
    nextGroup.push({ ...session, categoryId: targetCategoryId });
    groups.set(targetCategoryId, nextGroup);
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

const normalizeFiles = (
  files: unknown,
  language: PracticeLanguage,
  fallbackCode?: string,
): PracticeFile[] => {
  const source = Array.isArray(files) ? files : [];
  const findFile = (id: PracticeFileId) => {
    if (id === 'input') {
      return source.find((file: any) => file?.id === 'input' || file?.name === 'input.in' || file?.name?.endsWith('.in'));
    }
    if (id === 'output') {
      return source.find((file: any) => file?.id === 'output' || file?.name === 'output.out' || file?.name?.endsWith('.out'));
    }
    if (id === 'notes') {
      return source.find((file: any) => file?.id === 'notes' || file?.name === 'notes.md' || file?.name?.endsWith('.md'));
    }
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
      content: typeof codeFile?.content === 'string'
        ? codeFile.content
        : (fallbackCode ?? LANGUAGE_META[language].starterCode),
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

const createSession = (
  language: PracticeLanguage = 'cpp',
  index = 1,
  categoryId: string = DEFAULT_CATEGORY_ID,
): CodingPracticeSession => {
  const now = Date.now();
  return {
    id: `coding-practice-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: `编码练习 ${index}`,
    language,
    categoryId,
    priority: 0,
    activeFileId: 'code',
    files: createDefaultFiles(language),
    createdAt: now,
    updatedAt: now,
  };
};

const loadCategories = (): PracticeCategory[] => {
  if (typeof window === 'undefined') return [createDefaultCategory()];
  try {
    return normalizeCategories(JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES) || 'null'));
  } catch {
    return [createDefaultCategory()];
  }
};

const loadSessions = (categories: PracticeCategory[]): CodingPracticeSession[] => {
  const categoryIds = getSortedCategoryIds(categories);
  const fallbackCategoryId = categoryIds[0] || DEFAULT_CATEGORY_ID;
  if (typeof window === 'undefined') return [createSession('cpp', 1, fallbackCategoryId)];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS) || localStorage.getItem(LEGACY_STORAGE_KEY_SESSIONS);
    if (!raw) return [createSession('cpp', 1, fallbackCategoryId)];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createSession('cpp', 1, fallbackCategoryId)];
    const sanitized = parsed
      .map((item, index) => {
        const language = item?.language && LANGUAGE_META[item.language as PracticeLanguage]
          ? item.language as PracticeLanguage
          : 'cpp';
        const fallbackCode = typeof item?.code === 'string' ? item.code : LANGUAGE_META[language].starterCode;
        const files = normalizeFiles(item?.files, language, fallbackCode);
        const activeFileId: PracticeFileId = item?.activeFileId === 'input' || item?.activeFileId === 'output' || item?.activeFileId === 'notes'
          ? item.activeFileId
          : 'code';
        return {
          id: typeof item?.id === 'string' ? item.id : `coding-practice-restored-${index}`,
          title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : `编码练习 ${index + 1}`,
          language,
          categoryId: typeof item?.categoryId === 'string' && item.categoryId.trim() ? item.categoryId : fallbackCategoryId,
          priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : index,
          activeFileId,
          files,
          createdAt: typeof item?.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item?.updatedAt === 'number' ? item.updatedAt : Date.now(),
        } as CodingPracticeSession;
      });
    return sanitized.length > 0
      ? normalizeSessionGroups(sanitized, categoryIds)
      : [createSession('cpp', 1, fallbackCategoryId)];
  } catch {
    return [createSession('cpp', 1, fallbackCategoryId)];
  }
};

const loadBooleanSetting = (key: string, defaultValue: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
};

const loadNumberSetting = (key: string, defaultValue: number) => {
  try {
    const raw = Number(localStorage.getItem(key));
    return Number.isFinite(raw) && raw > 0 ? raw : defaultValue;
  } catch {
    return defaultValue;
  }
};

const loadRunnerConfigs = (): Record<PracticeLanguage, PracticeRunnerConfig> => {
  if (typeof window === 'undefined') return DEFAULT_RUNNER_CONFIGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RUNNERS);
    if (!raw) return DEFAULT_RUNNER_CONFIGS;
    const parsed = JSON.parse(raw);
    const merged = {} as Record<PracticeLanguage, PracticeRunnerConfig>;
    (Object.keys(DEFAULT_RUNNER_CONFIGS) as PracticeLanguage[]).forEach(language => {
      const fallback = DEFAULT_RUNNER_CONFIGS[language];
      const next = parsed?.[language] || {};
      merged[language] = {
        compileCommand: typeof next.compileCommand === 'string' ? next.compileCommand : fallback.compileCommand,
        runCommand: typeof next.runCommand === 'string' ? next.runCommand : fallback.runCommand,
        timeoutSeconds: Number.isFinite(Number(next.timeoutSeconds))
          ? Math.max(5, Math.min(120, Number(next.timeoutSeconds)))
          : fallback.timeoutSeconds,
      };
    });
    return merged;
  } catch {
    return DEFAULT_RUNNER_CONFIGS;
  }
};

const getRunStageLabel = (stage: 'prepare' | 'compile' | 'run') => {
  switch (stage) {
    case 'compile':
      return '编译';
    case 'run':
      return '运行';
    default:
      return '准备';
  }
};

const getFileDisplayLabel = (id: PracticeFileId) => {
  switch (id) {
    case 'input':
      return 'in';
    case 'output':
      return 'out';
    case 'notes':
      return 'md';
    default:
      return 'main';
  }
};

const formatRunNoticeDetails = (...values: Array<string | undefined>) => {
  const detail = values
    .map(value => (value || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (!detail) return undefined;
  return detail.length > 1200 ? `${detail.slice(0, 1200).trim()}\n\n...` : detail;
};

const getRunNoticePalette = (tone: PracticeRunNotice['tone']) => {
  switch (tone) {
    case 'error':
      return {
        bg: 'rgba(239,68,68,0.08)',
        border: 'rgba(239,68,68,0.20)',
        chip: 'rgba(239,68,68,0.12)',
        text: '#b91c1c',
        muted: '#dc2626',
      };
    case 'success':
      return {
        bg: 'rgba(16,185,129,0.08)',
        border: 'rgba(16,185,129,0.20)',
        chip: 'rgba(16,185,129,0.12)',
        text: '#047857',
        muted: '#059669',
      };
    default:
      return {
        bg: 'rgba(59,130,246,0.08)',
        border: 'rgba(59,130,246,0.18)',
        chip: 'rgba(59,130,246,0.12)',
        text: '#1d4ed8',
        muted: '#2563eb',
      };
  }
};

const createPracticeMarker = (
  lineNumber: number,
  columnNumber: number,
  message: string,
  severity: 'error' | 'warning' = 'error',
): PracticeEditorMarker => ({
  startLineNumber: Math.max(1, lineNumber),
  startColumn: Math.max(1, columnNumber),
  endLineNumber: Math.max(1, lineNumber),
  endColumn: Math.max(2, columnNumber + 1),
  message: message.trim(),
  severity,
});

const parseCompilerMarkers = (raw: string, codeFileName: string): PracticeEditorMarker[] => {
  const text = raw.replace(/\r/g, '');
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const markers: PracticeEditorMarker[] = [];
  const seen = new Set<string>();
  const basename = codeFileName.split(/[\\/]/).pop() || codeFileName;

  const pushMarker = (marker: PracticeEditorMarker) => {
    const key = `${marker.startLineNumber}:${marker.startColumn}:${marker.message}:${marker.severity}`;
    if (seen.has(key)) return;
    seen.add(key);
    markers.push(marker);
  };

  lines.forEach((line, index) => {
    const fileColumnMatch = line.match(/([^\s:][^:]*(?:\/|\\))?([^/\\:\s]+):(\d+):(\d+):\s*(fatal error|error|warning):\s*(.+)$/i);
    if (fileColumnMatch) {
      const targetFile = fileColumnMatch[2];
      if (targetFile === basename) {
        pushMarker(
          createPracticeMarker(
            Number(fileColumnMatch[3]),
            Number(fileColumnMatch[4]),
            fileColumnMatch[6],
            /warning/i.test(fileColumnMatch[5]) ? 'warning' : 'error',
          ),
        );
      }
      return;
    }

    const fileLineMatch = line.match(/([^\s:][^:]*(?:\/|\\))?([^/\\:\s]+):(\d+):\s*(error|warning):\s*(.+)$/i);
    if (fileLineMatch) {
      const targetFile = fileLineMatch[2];
      if (targetFile === basename) {
        pushMarker(
          createPracticeMarker(
            Number(fileLineMatch[3]),
            1,
            fileLineMatch[5],
            /warning/i.test(fileLineMatch[4]) ? 'warning' : 'error',
          ),
        );
      }
      return;
    }

    const tracebackMatch = line.match(/File\s+"([^"]+)",\s+line\s+(\d+)/);
    if (tracebackMatch && tracebackMatch[1].endsWith(basename)) {
      const nextMessage = lines.slice(index + 1).find(entry => /(?:SyntaxError|IndentationError|NameError|TypeError|ValueError|AttributeError|ImportError|RuntimeError|AssertionError)\s*:/.test(entry));
      if (nextMessage) {
        pushMarker(createPracticeMarker(Number(tracebackMatch[2]), 1, nextMessage.replace(/^\s+/, ''), 'error'));
      }
      return;
    }

    const rustArrowMatch = line.match(/-->\s+.*?([^/\\:\s]+):(\d+):(\d+)/);
    if (rustArrowMatch && rustArrowMatch[1] === basename) {
      const previousMessage = [...lines.slice(Math.max(0, index - 3), index)].reverse().find(entry => /^(error|warning)(\[[^\]]+\])?:/.test(entry.trim()));
      if (previousMessage) {
        pushMarker(
          createPracticeMarker(
            Number(rustArrowMatch[2]),
            Number(rustArrowMatch[3]),
            previousMessage.replace(/^(error|warning)(\[[^\]]+\])?:\s*/i, ''),
            /^warning/i.test(previousMessage.trim()) ? 'warning' : 'error',
          ),
        );
      }
    }
  });

  return markers;
};

interface PracticeCategoryModalProps {
  isOpen: boolean;
  initialData?: PracticeCategory;
  onClose: () => void;
  onSave: (category: PracticeCategory) => void;
}

const PracticeCategoryModal: React.FC<PracticeCategoryModalProps> = ({ isOpen, initialData, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Code');
  const [selectedColor, setSelectedColor] = useState('blue');

  useEffect(() => {
    if (!isOpen) return;
    setName(initialData?.name || '');
    setDescription(initialData?.description || '');
    setSelectedIcon(initialData?.icon || 'Code');
    setSelectedColor(initialData?.color || 'blue');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[28px] border bg-white shadow-2xl" style={{ borderColor: 'var(--t-border-light)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--t-border-light)' }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>
              {initialData ? '编辑分类' : '新建分类'}
            </h3>
            <p className="mt-1 text-xs" style={{ color: 'var(--t-text-muted)' }}>设置分类名称、图标和颜色，用来整理练习卡片。</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl transition-colors hover:bg-slate-100"
            title="关闭"
          >
            <X className="h-4 w-4" style={{ color: 'var(--t-text-muted)' }} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>分类名称</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：基础题、图论、手速热身"
              className="w-full rounded-2xl border px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text)' }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>备注说明</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="可选，用于区分这个分类的练习用途。"
              rows={3}
              className="w-full resize-none rounded-2xl border px-3 py-2.5 text-sm outline-none transition-colors"
              style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text)' }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>分类图标</label>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  onClick={() => setSelectedIcon(iconName)}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-all ${
                    selectedIcon === iconName ? 'scale-[1.02]' : 'hover:bg-slate-50'
                  }`}
                  style={{
                    borderColor: selectedIcon === iconName ? '#3b82f6' : 'var(--t-border-light)',
                    background: selectedIcon === iconName ? 'rgba(59,130,246,0.10)' : 'transparent',
                    color: selectedIcon === iconName ? '#2563eb' : 'var(--t-text-muted)',
                  }}
                  title={iconName}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>主题颜色</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setSelectedColor(color.name)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border transition-transform hover:scale-[1.04]"
                  style={{
                    borderColor: selectedColor === color.name ? '#1f2937' : 'transparent',
                    background: colorMap[color.name]?.bgColor || '#eff6ff',
                  }}
                  title={color.name}
                >
                  {selectedColor === color.name ? (
                    <Check className="h-4 w-4" style={{ color: colorMap[color.name]?.textColor || '#2563eb' }} />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t bg-slate-50/70 px-5 py-4" style={{ borderColor: 'var(--t-border-light)' }}>
          <button
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm transition-colors hover:bg-slate-200/70"
            style={{ color: 'var(--t-text-muted)' }}
          >
            取消
          </button>
          <button
            onClick={() => {
              const normalizedName = name.trim();
              if (!normalizedName) return;
              onSave({
                id: initialData?.id || `coding-practice-category-${Date.now()}`,
                name: normalizedName,
                description: description.trim(),
                icon: selectedIcon,
                color: selectedColor,
                priority: initialData?.priority ?? 0,
                noteContent: initialData?.noteContent ?? '',
              });
              onClose();
            }}
            disabled={!name.trim()}
            className="rounded-2xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#2563eb' }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export const CodingPracticeManager: React.FC<CodingPracticeManagerProps> = ({ headerSlot }) => {
  const initialCategories = useMemo(() => loadCategories(), []);
  const initialSessions = useMemo(() => loadSessions(initialCategories), [initialCategories]);
  const [categories, setCategories] = useState<PracticeCategory[]>(initialCategories);
  const [sessions, setSessions] = useState<CodingPracticeSession[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_ACTIVE) || initialSessions[0].id;
    } catch {
      return initialSessions[0].id;
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState(() => Math.max(12, Math.min(20, loadNumberSetting(STORAGE_KEY_FONT_SIZE, 15))));
  const [wordWrap, setWordWrap] = useState(() => loadBooleanSetting(STORAGE_KEY_WRAP, true));
  const [highlightCurrentLine, setHighlightCurrentLine] = useState(() => loadBooleanSetting(STORAGE_KEY_HIGHLIGHT_LINE, true));
  const [runnerConfigs, setRunnerConfigs] = useState<Record<PracticeLanguage, PracticeRunnerConfig>>(() => loadRunnerConfigs());
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [runNotices, setRunNotices] = useState<Record<string, PracticeRunNotice>>({});
  const [focusMode, setFocusMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PracticeCategory | undefined>(undefined);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialCategories.map(category => [category.id, true])),
  );
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ categoryId: string; sessionId?: string; position: 'before' | 'after' | 'end' } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [activeCategoryNoteId, setActiveCategoryNoteId] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [sessionMarkers, setSessionMarkers] = useState<Record<string, PracticeEditorMarker[]>>({});
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const checkRequestRef = useRef(0);
  const decorationIdsRef = useRef<string[]>([]);

  const sortedCategories = useMemo(() => sortCategories(categories), [categories]);
  const sessionsByCategory = useMemo(() => {
    const grouped = new Map<string, CodingPracticeSession[]>();
    sortedCategories.forEach(category => grouped.set(category.id, []));
    sessions.forEach((session) => {
      const targetCategoryId = grouped.has(session.categoryId) ? session.categoryId : sortedCategories[0]?.id || DEFAULT_CATEGORY_ID;
      const list = grouped.get(targetCategoryId) || [];
      list.push(session);
      grouped.set(targetCategoryId, list);
    });
    grouped.forEach((list, categoryId) => {
      grouped.set(categoryId, [...list].sort((a, b) => a.priority - b.priority));
    });
    return grouped;
  }, [sessions, sortedCategories]);

  const keyword = searchQuery.trim().toLowerCase();
  const visibleCategories = useMemo(
    () =>
      sortedCategories.filter((category) => {
        if (!keyword) return true;
        const sessionMatches = (sessionsByCategory.get(category.id) || []).some((session) => {
          const haystack = `${session.title}\n${LANGUAGE_META[session.language].label}`.toLowerCase();
          return haystack.includes(keyword);
        });
        const categoryHaystack = `${category.name}\n${category.description}`.toLowerCase();
        return categoryHaystack.includes(keyword) || sessionMatches;
      }),
    [keyword, sessionsByCategory, sortedCategories],
  );

  const activeSession = useMemo(
    () => sessions.find(session => session.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions],
  );
  const activeCategoryNote = useMemo(
    () => (activeCategoryNoteId ? sortedCategories.find(category => category.id === activeCategoryNoteId) || null : null),
    [activeCategoryNoteId, sortedCategories],
  );
  const activeFile = useMemo(
    () => activeCategoryNote
      ? null
      : activeSession?.files.find(file => file.id === activeSession.activeFileId) || activeSession?.files[0] || null,
    [activeCategoryNote, activeSession],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(sortedCategories));
  }, [sortedCategories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSession) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, activeSession.id);
    }
  }, [activeSession]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WRAP, String(wordWrap));
  }, [wordWrap]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_HIGHLIGHT_LINE, String(highlightCurrentLine));
  }, [highlightCurrentLine]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RUNNERS, JSON.stringify(runnerConfigs));
  }, [runnerConfigs]);

  useEffect(() => {
    if (!sessions.some(session => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id || createSession('cpp', 1, sortedCategories[0]?.id || DEFAULT_CATEGORY_ID).id);
    }
  }, [activeSessionId, sessions, sortedCategories]);

  useEffect(() => {
    if (activeCategoryNoteId && !sortedCategories.some(category => category.id === activeCategoryNoteId)) {
      setActiveCategoryNoteId(null);
    }
  }, [activeCategoryNoteId, sortedCategories]);

  useEffect(() => {
    if (activeFile?.id === 'code') return;
    editorRef.current = null;
    monacoRef.current = null;
    decorationIdsRef.current = [];
    setEditorReady(false);
  }, [activeFile?.id]);

  useEffect(() => {
    if (editingSessionId && !sessions.some(session => session.id === editingSessionId)) {
      setEditingSessionId(null);
      setEditingSessionTitle('');
    }
  }, [editingSessionId, sessions]);

  useEffect(() => {
    const nextExpanded: Record<string, boolean> = {};
    sortedCategories.forEach((category) => {
      nextExpanded[category.id] = expandedCategories[category.id] ?? true;
    });
    setExpandedCategories(nextExpanded);
  }, [sortedCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [settingsOpen]);

  const applySessionGrouping = useCallback((mutator: (groups: Map<string, CodingPracticeSession[]>) => void) => {
    setSessions((prev) => {
      const categoryIds = getSortedCategoryIds(categories);
      const groups = new Map<string, CodingPracticeSession[]>();

      categoryIds.forEach((categoryId) => groups.set(categoryId, []));
      prev.forEach((session) => {
        const targetCategoryId = groups.has(session.categoryId) ? session.categoryId : categoryIds[0] || DEFAULT_CATEGORY_ID;
        const list = groups.get(targetCategoryId) || [];
        list.push({ ...session, categoryId: targetCategoryId });
        groups.set(targetCategoryId, list);
      });
      groups.forEach((list, categoryId) => {
        groups.set(categoryId, [...list].sort((a, b) => a.priority - b.priority));
      });

      mutator(groups);

      const normalized = normalizeSessionGroups(
        Array.from(groups.values()).flat(),
        categoryIds,
        true,
      );

      return normalized.length > 0
        ? normalized
        : [createSession('cpp', 1, categoryIds[0] || DEFAULT_CATEGORY_ID)];
    });
  }, [categories]);

  const updateSession = useCallback((sessionId: string, updater: Partial<CodingPracticeSession> | ((prev: CodingPracticeSession) => CodingPracticeSession)) => {
    setSessions(prev =>
      prev.map(session => {
        if (session.id !== sessionId) return session;
        if (typeof updater === 'function') {
          const next = updater(session);
          return { ...next, updatedAt: Date.now() };
        }
        return { ...session, ...updater, updatedAt: Date.now() };
      }),
    );
  }, []);

  const updateRunnerConfig = useCallback((language: PracticeLanguage, updater: Partial<PracticeRunnerConfig>) => {
    setRunnerConfigs(prev => ({
      ...prev,
      [language]: {
        ...prev[language],
        ...updater,
      },
    }));
  }, []);

  const handleSaveCategory = useCallback((category: PracticeCategory) => {
    setCategories((prev) => {
      const existingIndex = prev.findIndex(entry => entry.id === category.id);
      const next = existingIndex === -1
        ? [...prev, { ...category, priority: prev.length }]
        : prev.map(entry => (entry.id === category.id ? { ...entry, ...category, priority: entry.priority } : entry));
      return sortCategories(next).map((entry, index) => ({ ...entry, priority: index }));
    });
    setExpandedCategories((prev) => ({ ...prev, [category.id]: true }));
  }, []);

  const handleDeleteCategory = useCallback((category: PracticeCategory) => {
    const nextCategories = sortedCategories.filter(entry => entry.id !== category.id);
    if (nextCategories.length === 0) {
      window.alert('至少保留一个分类。');
      return;
    }
    if (!window.confirm(`删除分类「${category.name}」？其中的练习会自动移动到「${nextCategories[0].name}」。`)) return;

    const fallbackCategoryId = nextCategories[0].id;
    setCategories(nextCategories.map((entry, index) => ({ ...entry, priority: index })));
    if (activeCategoryNoteId === category.id) {
      setActiveCategoryNoteId(null);
    }
    setExpandedCategories((prev) => {
      const next = { ...prev };
      delete next[category.id];
      return next;
    });
    applySessionGrouping((groups) => {
      const movingSessions = groups.get(category.id) || [];
      const fallbackSessions = groups.get(fallbackCategoryId) || [];
      groups.delete(category.id);
      groups.set(
        fallbackCategoryId,
        [
          ...fallbackSessions,
          ...movingSessions.map(session => ({ ...session, categoryId: fallbackCategoryId })),
        ],
      );
    });
  }, [activeCategoryNoteId, applySessionGrouping, sortedCategories]);

  const handleCreateSession = useCallback((language: PracticeLanguage = 'cpp', categoryId?: string) => {
    const targetCategoryId = categoryId || activeSession?.categoryId || sortedCategories[0]?.id || DEFAULT_CATEGORY_ID;
    const next = createSession(language, sessions.length + 1, targetCategoryId);
    applySessionGrouping((groups) => {
      const targetSessions = groups.get(targetCategoryId) || [];
      groups.set(targetCategoryId, [next, ...targetSessions]);
    });
    setActiveSessionId(next.id);
    setActiveCategoryNoteId(null);
    setExpandedCategories((prev) => ({ ...prev, [targetCategoryId]: true }));
  }, [activeSession?.categoryId, applySessionGrouping, sessions.length, sortedCategories]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    const target = sessions.find(session => session.id === sessionId);
    if (!target) return;
    if (!window.confirm(`删除练习「${target.title}」？`)) return;
    const remainingSessions = sessions.filter(session => session.id !== sessionId);
    const fallbackCategoryId = sortedCategories[0]?.id || DEFAULT_CATEGORY_ID;

    if (remainingSessions.length === 0) {
      const fallback = createSession('cpp', 1, fallbackCategoryId);
      setSessions([fallback]);
      setActiveSessionId(fallback.id);
      setActiveCategoryNoteId(null);
      return;
    }

    setSessions(normalizeSessionGroups(remainingSessions, getSortedCategoryIds(sortedCategories), true));
    if (activeSessionId === sessionId) {
      setActiveSessionId(remainingSessions[0].id);
      setActiveCategoryNoteId(null);
    }
  }, [activeCategoryNoteId, activeSessionId, sessions, sortedCategories]);

  const handleStartRenameSession = useCallback((session: CodingPracticeSession) => {
    setEditingSessionId(session.id);
    setEditingSessionTitle(session.title);
  }, []);

  const handleCancelRenameSession = useCallback(() => {
    setEditingSessionId(null);
    setEditingSessionTitle('');
  }, []);

  const handleCommitRenameSession = useCallback((sessionId: string) => {
    const normalized = editingSessionTitle.trim();
    if (normalized) {
      updateSession(sessionId, { title: normalized });
    }
    setEditingSessionId(null);
    setEditingSessionTitle('');
  }, [editingSessionTitle, updateSession]);

  const moveSessionTo = useCallback((
    sessionId: string,
    categoryId: string,
    targetSessionId?: string,
    position: 'before' | 'after' | 'end' = 'end',
  ) => {
    applySessionGrouping((groups) => {
      let movingSession: CodingPracticeSession | null = null;
      groups.forEach((entries, currentCategoryId) => {
        const index = entries.findIndex(entry => entry.id === sessionId);
        if (index === -1) return;
        const [session] = entries.splice(index, 1);
        movingSession = { ...session, categoryId };
        groups.set(currentCategoryId, [...entries]);
      });

      if (!movingSession) return;

      const targetEntries = [...(groups.get(categoryId) || [])];
      let insertIndex = targetEntries.length;

      if (targetSessionId) {
        const targetIndex = targetEntries.findIndex(entry => entry.id === targetSessionId);
        if (targetIndex !== -1) {
          insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        }
      }

      targetEntries.splice(insertIndex, 0, movingSession);
      groups.set(categoryId, targetEntries);
    });
  }, [applySessionGrouping]);

  const handleSessionDragStart = useCallback((event: React.DragEvent, sessionId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sessionId);
    setDraggingSessionId(sessionId);
    setDropIndicator(null);
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDraggingSessionId(null);
    setDropIndicator(null);
  }, []);

  const handleCategoryDragOver = useCallback((event: React.DragEvent, categoryId: string) => {
    if (!draggingSessionId || keyword) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropIndicator((current) => (
      current?.categoryId === categoryId && current.position === 'end' && !current.sessionId
        ? current
        : { categoryId, position: 'end' }
    ));
  }, [draggingSessionId, keyword]);

  const handleSessionDragOver = useCallback((event: React.DragEvent, categoryId: string, sessionId: string) => {
    if (!draggingSessionId || keyword || draggingSessionId === sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    const position = event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDropIndicator((current) => (
      current?.categoryId === categoryId && current.sessionId === sessionId && current.position === position
        ? current
        : { categoryId, sessionId, position }
    ));
  }, [draggingSessionId, keyword]);

  const handleCategoryDrop = useCallback((event: React.DragEvent, categoryId: string) => {
    if (!draggingSessionId || keyword) return;
    event.preventDefault();
    moveSessionTo(draggingSessionId, categoryId);
    handleSessionDragEnd();
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: true }));
  }, [draggingSessionId, handleSessionDragEnd, keyword, moveSessionTo]);

  const handleSessionDrop = useCallback((event: React.DragEvent, categoryId: string, sessionId: string) => {
    if (!draggingSessionId || keyword || draggingSessionId === sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    moveSessionTo(
      draggingSessionId,
      categoryId,
      sessionId,
      dropIndicator?.categoryId === categoryId && dropIndicator?.sessionId === sessionId ? dropIndicator.position : 'before',
    );
    handleSessionDragEnd();
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: true }));
  }, [draggingSessionId, dropIndicator, handleSessionDragEnd, keyword, moveSessionTo]);

  const toggleCategoryExpanded = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: prev[categoryId] === false }));
  }, []);

  const handleLanguageChange = useCallback((language: PracticeLanguage) => {
    if (!activeSession) return;
    const previousMeta = LANGUAGE_META[activeSession.language];
    const currentCodeFile = activeSession.files.find(file => file.id === 'code');
    const shouldResetCode =
      !currentCodeFile?.content.trim() || currentCodeFile.content.trim() === previousMeta.starterCode.trim();

    updateSession(activeSession.id, prev => ({
      ...prev,
      language,
      files: prev.files.map(file => {
        if (file.id !== 'code') return file;
        return {
          ...file,
          name: getCodeFileName(language),
          editorLanguage: LANGUAGE_META[language].editorLanguage,
          content: shouldResetCode ? LANGUAGE_META[language].starterCode : file.content,
        };
      }),
    }));
  }, [activeSession, updateSession]);

  const handleRunSession = useCallback(async (sessionId: string) => {
    const session = sessions.find(item => item.id === sessionId);
    if (!session) return;
    if (!window.electronAPI?.codingPracticeRun) {
      setRunNotices(prev => ({
        ...prev,
        [sessionId]: {
          tone: 'error',
          stage: 'prepare',
          title: '仅桌面端可运行',
          text: '当前浏览器预览不支持本地执行链。',
          details: '请使用 Electron 桌面端运行本地编译与执行。',
        },
      }));
      return;
    }

    const runner = runnerConfigs[session.language];
    if (!runner?.runCommand.trim()) {
      setRunNotices(prev => ({
        ...prev,
        [sessionId]: {
          tone: 'error',
          stage: 'prepare',
          title: '未配置运行命令',
          text: '先在左下角设置里补全执行链。',
          details: `当前语言：${LANGUAGE_META[session.language].label}`,
        },
      }));
      return;
    }

    setRunningSessionId(sessionId);
    setRunNotices(prev => ({
      ...prev,
      [sessionId]: {
        tone: 'info',
        stage: 'run',
        title: '正在执行',
        text: `正在调用本地 ${LANGUAGE_META[session.language].label} 运行链。`,
      },
    }));

    try {
      const result = await window.electronAPI.codingPracticeRun({
        language: session.language,
        files: session.files.filter(file => file.id === 'input' || file.id === 'code' || file.id === 'output').map(file => ({
          id: file.id,
          name: file.name,
          content: file.content,
        })),
        runner,
      });

      const codeFile = session.files.find(file => file.id === 'code');
      const parsedMarkers = codeFile
        ? parseCompilerMarkers([result.stderr, result.stdout, result.error].filter(Boolean).join('\n'), codeFile.name)
        : [];
      setSessionMarkers((prev) => {
        const next = { ...prev };
        if (parsedMarkers.length > 0) {
          next[sessionId] = parsedMarkers;
        } else {
          delete next[sessionId];
        }
        return next;
      });

      const nextOutput = result.output || `${getRunStageLabel(result.stage)}阶段没有返回内容。`;
      updateSession(sessionId, prev => ({
        ...prev,
        activeFileId: result.success
          ? 'output'
          : parsedMarkers.length > 0
            ? 'code'
            : 'output',
        files: prev.files.map(file =>
          file.id === 'output' ? { ...file, content: nextOutput } : file,
        ),
      }));
      setActiveSessionId(sessionId);
      setRunNotices(prev => ({
        ...prev,
        [sessionId]: result.success
          ? {
              tone: 'success',
              stage: result.stage,
              title: '运行完成',
              text: `${result.caseCount && result.caseCount > 1 ? `${result.caseCount} 组用例 · ` : ''}耗时 ${Math.max(1, Math.round(result.durationMs))} ms`,
              details: result.output?.trim()
                ? `输出已写入 out。\n\n${result.output.trim().slice(0, 300)}${result.output.trim().length > 300 ? '...' : ''}`
                : '程序已运行完成，没有产生额外输出。',
            }
          : {
              tone: 'error',
              stage: result.stage,
              title: `${getRunStageLabel(result.stage)}失败`,
              text: `${result.caseCount && result.caseCount > 1 ? `${result.caseCount} 组用例中断，` : ''}错误详情已写入 out，可直接切换查看。`,
              details: formatRunNoticeDetails(result.error, result.stderr, result.stdout),
            },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '执行失败';
      updateSession(sessionId, prev => ({
        ...prev,
        activeFileId: 'output',
        files: prev.files.map(file =>
          file.id === 'output' ? { ...file, content: `[执行失败]\n\n${message}` } : file,
        ),
      }));
      setRunNotices(prev => ({
        ...prev,
        [sessionId]: {
          tone: 'error',
          stage: 'prepare',
          title: '执行失败',
          text: '执行链在准备阶段中断。',
          details: message,
        },
      }));
    } finally {
      setRunningSessionId(current => (current === sessionId ? null : current));
    }
  }, [runnerConfigs, sessions, updateSession]);

  if (!activeSession) return null;

  const activeRunnerConfig = runnerConfigs[activeSession.language];
  const canDragCards = !keyword;
  const activeRunNotice = runNotices[activeSession.id];
  const activeRunPalette = activeRunNotice ? getRunNoticePalette(activeRunNotice.tone) : null;
  const activeRunIcon = activeRunNotice?.tone === 'error'
    ? AlertCircle
    : activeRunNotice?.tone === 'success'
      ? CheckCircle2
      : Loader2;
  const ActiveRunIcon = activeRunIcon;
  const editorBaseOptions = {
    fontSize,
    lineHeight: Math.round(fontSize * 1.8),
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: wordWrap ? 'on' as const : 'off' as const,
    smoothScrolling: true,
    padding: { top: 20, bottom: 20 },
    tabSize: 2,
    insertSpaces: true,
    cursorBlinking: 'smooth' as const,
    fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    glyphMargin: false,
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  };
  const inputFile = activeSession.files.find(file => file.id === 'input') || activeSession.files[0];
  const outputFile = activeSession.files.find(file => file.id === 'output') || activeSession.files[activeSession.files.length - 1];
  const categoryNoteTitle = activeCategoryNote ? `${activeCategoryNote.name}笔记` : '分类笔记';
  const activeCategoryMarkdownNote: MarkdownNote | null = activeCategoryNote ? {
    id: `coding-practice-category-note-${activeCategoryNote.id}`,
    title: categoryNoteTitle,
    category: 'Coding Practice Category',
    content: activeCategoryNote.noteContent,
    createdAt: 0,
    updatedAt: 0,
  } : null;
  const activeSessionMarkdownNote: MarkdownNote | null = activeFile?.id === 'notes' ? {
    id: `coding-practice-session-note-${activeSession.id}`,
    title: 'notes',
    category: LANGUAGE_META[activeSession.language].label,
    content: activeFile.content,
    createdAt: activeSession.createdAt,
    updatedAt: activeSession.updatedAt,
  } : null;

  const applyEditorMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco?.editor || !model) return;

    if (activeFile?.id !== 'code') {
      decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, []);
      return;
    }

    const decorations = (sessionMarkers[activeSession.id] || []).map((marker) => ({
      range: new monaco.Range(
        marker.startLineNumber,
        Math.max(1, marker.startColumn),
        marker.endLineNumber,
        Math.max(marker.endColumn, marker.startColumn + 1),
      ),
      options: {
        inlineClassName: marker.severity === 'warning' ? 'cp-warning-inline' : 'cp-error-inline',
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations as any);
  }, [activeFile?.id, activeSession.id, sessionMarkers]);

  useEffect(() => {
    if (!editorReady) return;
    applyEditorMarkers();
  }, [applyEditorMarkers, editorReady]);

  useEffect(() => {
    const requestId = ++checkRequestRef.current;
    if (activeFile?.id !== 'code') return;
    if (!window.electronAPI?.codingPracticeCheck) return;

    const timer = window.setTimeout(async () => {
      try {
        const result = await window.electronAPI.codingPracticeCheck({
          language: activeSession.language,
          files: activeSession.files.filter(file => file.id === 'input' || file.id === 'code' || file.id === 'output').map(file => ({
            id: file.id,
            name: file.name,
            content: file.content,
          })),
          runner: activeRunnerConfig,
        });

        if (checkRequestRef.current !== requestId) return;

        if (!result.supported || result.success) {
          setSessionMarkers((prev) => {
            if (!prev[activeSession.id]?.length) return prev;
            const next = { ...prev };
            delete next[activeSession.id];
            return next;
          });
          return;
        }

        const codeFile = activeSession.files.find(file => file.id === 'code');
        const markers = codeFile
          ? parseCompilerMarkers([result.stderr, result.stdout, result.error].filter(Boolean).join('\n'), codeFile.name)
          : [];

        setSessionMarkers((prev) => {
          const next = { ...prev };
          if (markers.length > 0) {
            next[activeSession.id] = markers;
          } else {
            delete next[activeSession.id];
          }
          return next;
        });
      } catch {
        if (checkRequestRef.current !== requestId) return;
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [activeFile?.id, activeRunnerConfig, activeSession.files, activeSession.id, activeSession.language]);

  return (
    <div className="h-full flex overflow-hidden bg-white">
      <PracticeCategoryModal
        isOpen={categoryModalOpen}
        initialData={editingCategory}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(undefined);
        }}
        onSave={handleSaveCategory}
      />
      {!focusMode && (
      <aside
        className="h-full w-80 shrink-0 flex flex-col bg-white border-r border-gray-200 transition-all duration-300"
      >
        <div className="bg-white">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <Code2 className="w-5 h-5 shrink-0 text-blue-600" />
              <h2 className="font-semibold text-gray-800 truncate">Code</h2>
            </div>
            {headerSlot ? <div className="shrink-0">{headerSlot}</div> : null}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setEditingCategory(undefined);
                  setCategoryModalOpen(true);
                }}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
                title="新建分类"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleCreateSession('cpp')}
                className="p-1.5 rounded-md hover:bg-gray-100 text-blue-600 transition-colors"
                title="新建练习"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            </div>
          </div>

          <div className="p-3 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索练习..."
              className="w-full pl-10 pr-4 py-2 text-sm rounded-md border border-gray-200 bg-white text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white p-3 pt-0 space-y-1">
          {visibleCategories.map((category) => {
            const palette = colorMap[category.color] || colorMap.blue;
            const CategoryIcon = getCategoryIcon(category.icon);
            const categorySessions = (sessionsByCategory.get(category.id) || []).filter((session) => {
              if (!keyword) return true;
              const haystack = `${session.title}\n${LANGUAGE_META[session.language].label}`.toLowerCase();
              return haystack.includes(keyword);
            });
            const isExpanded = keyword ? true : expandedCategories[category.id] !== false;
            const isDropTarget = dropIndicator?.categoryId === category.id;
            return (
              <div
                key={category.id}
                onDragOver={(event) => handleCategoryDragOver(event, category.id)}
                onDrop={(event) => handleCategoryDrop(event, category.id)}
              >
                <div
                  className="group/category flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
                  style={isDropTarget ? { background: '#f8fafc' } : undefined}
                >
                  <button
                    onClick={() => toggleCategoryExpanded(category.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    )}
                    <CategoryIcon className="h-4 w-4 shrink-0" style={{ color: palette.textColor }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                      {category.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      {categorySessions.length}
                    </span>
                  </button>

                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/category:opacity-100 group-focus-within/category:opacity-100">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCreateSession('cpp', category.id);
                      }}
                      className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
                      title="在该分类中新建练习"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingCategory(category);
                        setCategoryModalOpen(true);
                      }}
                      className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
                      title="编辑分类"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteCategory(category);
                      }}
                      className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
                      title="删除分类"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-100 pl-3">
                    <button
                      onClick={() => {
                        setActiveCategoryNoteId(category.id);
                        setFocusMode(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-50"
                      style={activeCategoryNoteId === category.id ? { color: palette.textColor } : undefined}
                    >
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{
                          background: activeCategoryNoteId === category.id ? `${palette.textColor}12` : '#f3f4f6',
                          color: activeCategoryNoteId === category.id ? palette.textColor : '#6b7280',
                        }}
                      >
                        md
                      </span>
                      <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: activeCategoryNoteId === category.id ? palette.textColor : '#6b7280' }} />
                      <span className="min-w-0 flex-1 truncate" style={{ color: activeCategoryNoteId === category.id ? palette.textColor : '#6b7280' }}>
                        {category.name}笔记
                      </span>
                    </button>
                    {categorySessions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-center text-[11px] text-gray-400">
                        {keyword ? '没有匹配的练习' : '拖动练习到这里，或点击右侧 + 新建'}
                      </div>
                    ) : (
                      categorySessions.map((session) => {
                        const meta = LANGUAGE_META[session.language];
                        const isActive = session.id === activeSession.id;
                        const isEditingTitle = editingSessionId === session.id;
                        const isDropBefore = dropIndicator?.categoryId === category.id && dropIndicator?.sessionId === session.id && dropIndicator.position === 'before';
                        const isDropAfter = dropIndicator?.categoryId === category.id && dropIndicator?.sessionId === session.id && dropIndicator.position === 'after';

                        return (
                          <div key={session.id} className="relative">
                            {isDropBefore ? <div className="mb-1 h-1 rounded-full" style={{ background: palette.textColor }} /> : null}
                            <div
                              onClick={() => {
                                setActiveSessionId(session.id);
                                setActiveCategoryNoteId(null);
                              }}
                              onDragOver={(event) => handleSessionDragOver(event, category.id, session.id)}
                              onDrop={(event) => handleSessionDrop(event, category.id, session.id)}
                              className="group/session relative cursor-pointer rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
                              style={{ opacity: draggingSessionId === session.id ? 0.68 : 1 }}
                            >
                              <div className="flex items-center gap-2">
                                {canDragCards ? (
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) => handleSessionDragStart(event, session.id)}
                                    onDragEnd={handleSessionDragEnd}
                                    onClick={(event) => event.stopPropagation()}
                                    className="h-6 w-6 rounded-md shrink-0 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-700 group-hover/session:opacity-100"
                                    title="拖动练习排序或移动分类"
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <div className="w-6 shrink-0" />
                                )}
                                {isEditingTitle ? (
                                  <input
                                    autoFocus
                                    value={editingSessionTitle}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => setEditingSessionTitle(event.target.value)}
                                    onBlur={() => handleCommitRenameSession(session.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.preventDefault();
                                        handleCommitRenameSession(session.id);
                                      } else if (event.key === 'Escape') {
                                        event.preventDefault();
                                        handleCancelRenameSession();
                                      }
                                    }}
                                    className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                                    style={{ color: meta.accent }}
                                  />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: isActive ? meta.accent : '#374151' }}>
                                    {session.title}
                                  </span>
                                )}
                                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/session:opacity-100">
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartRenameSession(session);
                                    }}
                                    className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
                                    title="重命名练习"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  {!isActive ? (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeleteSession(session.id);
                                      }}
                                      className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
                                      title="删除练习"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              {isActive ? (
                                <div className="ml-6 mt-1 space-y-0.5 border-l border-gray-100 pl-3">
                                  {session.files
                                    .filter((file) => file.id === 'input' || file.id === 'code' || file.id === 'notes')
                                    .map(file => {
                                    const isIoEntry = file.id === 'input';
                                    const isCurrentFile = isIoEntry
                                      ? activeFile?.id === 'input' || activeFile?.id === 'output'
                                      : file.id === activeFile?.id;
                                    const displayLabel = isIoEntry ? 'io' : getFileDisplayLabel(file.id);
                                    const displayName = file.id === 'notes'
                                      ? 'notes'
                                      : isIoEntry
                                        ? 'in / out'
                                        : file.name;
                                    return (
                                      <button
                                        key={file.id}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActiveCategoryNoteId(null);
                                          setActiveSessionId(session.id);
                                          updateSession(session.id, { activeFileId: isIoEntry ? 'input' : file.id });
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-50"
                                        style={isCurrentFile ? { color: meta.accent } : undefined}
                                      >
                                        <span
                                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                                          style={{
                                            background: isCurrentFile ? 'transparent' : '#f3f4f6',
                                            color: isCurrentFile ? meta.accent : '#6b7280',
                                          }}
                                        >
                                          {displayLabel}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate" style={{ color: isCurrentFile ? meta.accent : '#6b7280' }}>
                                          {displayName}
                                        </span>
                                      </button>
                                    );
                                  })}

                                  <div className="flex items-center gap-1 pt-1">
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setActiveCategoryNoteId(null);
                                        setActiveSessionId(session.id);
                                        void handleRunSession(session.id);
                                      }}
                                      disabled={runningSessionId === session.id}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-medium transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70"
                                      style={{ color: meta.accent }}
                                      title="执行当前练习"
                                    >
                                      <Play className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeleteSession(session.id);
                                      }}
                                      className="h-6 w-6 rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600"
                                      title="删除练习"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {runNotices[session.id] ? (
                                    <div className="px-2 pt-0.5 text-[10px]" style={{ color: 'var(--t-text-muted)' }}>
                                      {runNotices[session.id].title}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {isDropAfter ? <div className="mt-1 h-1 rounded-full" style={{ background: palette.textColor }} /> : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          ref={settingsRef}
          className="relative shrink-0 border-t border-gray-200 bg-white px-3 py-3"
        >
          {settingsOpen && (
            <div
              className="absolute bottom-[calc(100%-8px)] left-3 right-3 z-20 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            >
              <div className="text-sm font-semibold mb-3" style={{ color: 'var(--t-text)' }}>编辑设置</div>
              <div className="space-y-4">
                <label className="block">
                  <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-text-muted)' }}>语言</div>
                  <select
                    value={activeSession.language}
                    onChange={(e) => handleLanguageChange(e.target.value as PracticeLanguage)}
                    className="h-10 w-full px-3 rounded-2xl border text-sm outline-none"
                    style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text)' }}
                  >
                    {Object.entries(LANGUAGE_META).map(([key, meta]) => (
                      <option key={key} value={key}>{meta.label}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setWordWrap(prev => !prev)}
                    className="h-10 px-3 rounded-2xl border text-xs font-medium"
                    style={{ borderColor: 'var(--t-border)', background: wordWrap ? 'rgba(37,99,235,0.10)' : 'var(--t-bg-card)', color: wordWrap ? '#2563eb' : 'var(--t-text-muted)' }}
                  >
                    自动换行
                  </button>
                  <button
                    onClick={() => setHighlightCurrentLine(prev => !prev)}
                    className="h-10 px-3 rounded-2xl border text-xs font-medium"
                    style={{ borderColor: 'var(--t-border)', background: highlightCurrentLine ? 'rgba(37,99,235,0.10)' : 'var(--t-bg-card)', color: highlightCurrentLine ? '#2563eb' : 'var(--t-text-muted)' }}
                  >
                    高亮当前行
                  </button>
                </div>

                <div>
                  <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-text-muted)' }}>字号</div>
                  <div className="flex items-center rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)' }}>
                    <button
                      onClick={() => setFontSize(size => Math.max(12, size - 1))}
                      className="w-10 h-10 text-sm"
                      style={{ color: 'var(--t-text-muted)' }}
                      title="缩小字号"
                    >
                      -
                    </button>
                    <div className="flex-1 text-center text-xs font-medium" style={{ color: 'var(--t-text)' }}>{fontSize}px</div>
                    <button
                      onClick={() => setFontSize(size => Math.min(20, size + 1))}
                      className="w-10 h-10 text-sm"
                      style={{ color: 'var(--t-text-muted)' }}
                      title="放大字号"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="pt-1 border-t" style={{ borderColor: 'var(--t-border-light)' }}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="text-[11px] font-medium" style={{ color: 'var(--t-text-muted)' }}>执行链</div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--t-text-muted)' }}>
                        当前语言：{LANGUAGE_META[activeSession.language].label}
                      </div>
                    </div>
                    <button
                      onClick={() => setRunnerConfigs(prev => ({
                        ...prev,
                        [activeSession.language]: { ...DEFAULT_RUNNER_CONFIGS[activeSession.language] },
                      }))}
                      className="h-8 px-3 rounded-xl border text-[11px] font-medium"
                      style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text-muted)' }}
                    >
                      恢复默认
                    </button>
                  </div>

                  <label className="block">
                    <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-text-muted)' }}>编译命令</div>
                    <textarea
                      value={activeRunnerConfig.compileCommand}
                      onChange={(e) => updateRunnerConfig(activeSession.language, { compileCommand: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-2xl border text-xs outline-none resize-none"
                      style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text)' }}
                      placeholder="可留空，直接跳过编译阶段"
                    />
                  </label>

                  <label className="block mt-3">
                    <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-text-muted)' }}>运行命令</div>
                    <textarea
                      value={activeRunnerConfig.runCommand}
                      onChange={(e) => updateRunnerConfig(activeSession.language, { runCommand: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-2xl border text-xs outline-none resize-none"
                      style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)', color: 'var(--t-text)' }}
                    />
                  </label>

                  <label className="block mt-3">
                    <div className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--t-text-muted)' }}>超时</div>
                    <div className="flex items-center rounded-2xl border px-3 h-10" style={{ borderColor: 'var(--t-border)', background: 'var(--t-bg-card)' }}>
                      <input
                        type="number"
                        min={5}
                        max={120}
                        value={activeRunnerConfig.timeoutSeconds}
                        onChange={(e) => updateRunnerConfig(activeSession.language, {
                          timeoutSeconds: Math.max(5, Math.min(120, Number(e.target.value) || 15)),
                        })}
                        className="w-full bg-transparent outline-none text-sm"
                        style={{ color: 'var(--t-text)' }}
                      />
                      <span className="text-[11px] ml-2 shrink-0" style={{ color: 'var(--t-text-muted)' }}>秒</span>
                    </div>
                  </label>

                  <div className="mt-3 text-[10px] leading-5" style={{ color: 'var(--t-text-muted)' }}>
                    变量：&#123;&#123;codeFile&#125;&#125; / &#123;&#123;inputFile&#125;&#125; / &#123;&#123;outputFile&#125;&#125; / &#123;&#123;binaryFile&#125;&#125; / &#123;&#123;workDir&#125;&#125;
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setSettingsOpen(prev => !prev)}
            className={`w-full rounded-md border border-gray-200 flex items-center justify-center gap-2 h-10 transition-colors ${
              settingsOpen ? 'bg-gray-50 text-blue-600' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
            title="编辑设置"
          >
            <Settings2 className="w-4 h-4" />
            <span className="text-sm font-medium">设置</span>
          </button>
        </div>
      </aside>
      )}

      <div className="flex-1 min-w-0 relative group">
          <button
            onClick={() => setFocusMode(prev => !prev)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-2xl border flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            style={{ borderColor: 'var(--t-border)', background: 'rgba(255,255,255,0.92)', color: 'var(--t-text-muted)', backdropFilter: 'blur(14px)' }}
            title={focusMode ? '退出全屏' : '进入全屏'}
          >
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {activeRunNotice && activeRunPalette ? (
            <div
              className="absolute right-4 top-16 z-10 w-[360px] max-w-[calc(100%-2rem)] overflow-hidden rounded-[24px] border shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)]"
              style={{
                borderColor: activeRunPalette.border,
                background: 'rgba(255,255,255,0.94)',
                backdropFilter: 'blur(18px)',
              }}
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: activeRunPalette.bg, color: activeRunPalette.text }}
                >
                  <ActiveRunIcon
                    className={`h-4.5 w-4.5 ${activeRunNotice.tone === 'info' ? 'animate-spin' : ''}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold" style={{ color: 'var(--t-text)' }}>
                      {activeRunNotice.title}
                    </div>
                    {activeRunNotice.stage ? (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: activeRunPalette.chip, color: activeRunPalette.muted }}
                      >
                        {getRunStageLabel(activeRunNotice.stage)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[12px] leading-5" style={{ color: 'var(--t-text-muted)' }}>
                    {activeRunNotice.text}
                  </div>
                  {activeRunNotice.details ? (
                    <div
                      className="mt-3 max-h-28 overflow-auto rounded-2xl border px-3 py-2 text-[11px] leading-5 whitespace-pre-wrap"
                      style={{
                        borderColor: activeRunPalette.border,
                        background: activeRunPalette.bg,
                        color: activeRunNotice.tone === 'error' ? '#7f1d1d' : 'var(--t-text-muted)',
                      }}
                    >
                      {activeRunNotice.details}
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActiveCategoryNoteId(null);
                        updateSession(activeSession.id, { activeFileId: 'output' });
                      }}
                      className="rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors"
                      style={{
                        background: activeRunPalette.chip,
                        color: activeRunPalette.text,
                      }}
                    >
                      查看 out
                    </button>
                    <button
                      onClick={() => setRunNotices(prev => {
                        const next = { ...prev };
                        delete next[activeSession.id];
                        return next;
                      })}
                      className="rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-slate-100"
                      style={{ color: 'var(--t-text-muted)' }}
                    >
                      收起
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="h-full coding-practice-editor">
            {activeCategoryMarkdownNote ? (
              <MarkdownEditor
                key={activeCategoryMarkdownNote.id}
                note={activeCategoryMarkdownNote}
                onUpdate={(_id, updates) => {
                  if (updates.content !== undefined && activeCategoryNote) {
                    setCategories((prev) => prev.map((category) => (
                      category.id === activeCategoryNote.id
                        ? { ...category, noteContent: updates.content || '' }
                        : category
                    )));
                  }
                }}
                isFullscreen={focusMode}
                onToggleFullscreen={() => setFocusMode((prev) => !prev)}
                viewMode="split"
                showViewToggle={false}
                hideCategory={true}
                hideHeaderTitle={true}
                hideFullscreen={true}
                tocSide="right"
              />
            ) : activeFile?.id === 'code' ? (
              <Editor
                height="100%"
                language={activeFile.editorLanguage}
                value={activeFile.content}
                onChange={(value) => {
                  if (activeFile.id === 'code' && sessionMarkers[activeSession.id]?.length) {
                    setSessionMarkers((prev) => {
                      const next = { ...prev };
                      delete next[activeSession.id];
                      return next;
                    });
                  }
                  updateSession(activeSession.id, prev => ({
                    ...prev,
                    files: prev.files.map(file =>
                      file.id === activeFile.id ? { ...file, content: value || '' } : file,
                    ),
                  }));
                }}
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  monacoRef.current = monaco;
                  setEditorReady(true);
                }}
                theme="vs"
                options={{
                  ...editorBaseOptions,
                  folding: true,
                  renderLineHighlight: highlightCurrentLine ? 'line' : 'none',
                  renderLineHighlightOnlyWhenFocus: true,
                }}
              />
            ) : activeSessionMarkdownNote ? (
              <MarkdownEditor
                key={activeSessionMarkdownNote.id}
                note={activeSessionMarkdownNote}
                onUpdate={(_id, updates) => {
                  if (updates.content !== undefined) {
                    updateSession(activeSession.id, prev => ({
                      ...prev,
                      files: prev.files.map(file =>
                        file.id === 'notes' ? { ...file, content: updates.content || '' } : file,
                      ),
                    }));
                  }
                }}
                isFullscreen={focusMode}
                onToggleFullscreen={() => setFocusMode((prev) => !prev)}
                viewMode="split"
                showViewToggle={false}
                hideCategory={true}
                hideHeaderTitle={true}
                hideFullscreen={true}
                tocSide="right"
              />
            ) : (
              <div className="grid h-full grid-cols-2 gap-px" style={{ background: 'var(--t-border-light)' }}>
                {[inputFile, outputFile].map((file) => {
                  const isPanelActive = activeSession.activeFileId === file.id;
                  return (
                    <div
                      key={`${activeSession.id}-${file.id}`}
                      className="flex min-h-0 flex-col"
                      style={{ background: 'var(--t-bg-card)' }}
                      onClick={() => updateSession(activeSession.id, { activeFileId: file.id })}
                    >
                      <div
                        className="flex items-center justify-between border-b px-4 py-2.5"
                        style={{
                          borderColor: 'var(--t-border-light)',
                          background: isPanelActive ? 'rgba(37,99,235,0.04)' : 'transparent',
                        }}
                        >
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            color: isPanelActive ? '#2563eb' : 'var(--t-text-muted)',
                            background: isPanelActive ? 'rgba(37,99,235,0.10)' : 'var(--t-chip-bg)',
                          }}
                        >
                          {getFileDisplayLabel(file.id)}
                        </span>
                      </div>
                      <div className="min-h-0 flex-1">
                        <Editor
                          height="100%"
                          language={file.editorLanguage}
                          value={file.content}
                          onChange={(value) => {
                            updateSession(activeSession.id, prev => ({
                              ...prev,
                              files: prev.files.map(entry =>
                                entry.id === file.id ? { ...entry, content: value || '' } : entry,
                              ),
                            }));
                          }}
                          theme="vs"
                          options={{
                            ...editorBaseOptions,
                            folding: false,
                            renderLineHighlight: 'none',
                            renderLineHighlightOnlyWhenFocus: false,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default CodingPracticeManager;
