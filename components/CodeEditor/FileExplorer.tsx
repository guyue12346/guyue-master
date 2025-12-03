import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  isExpanded?: boolean;
}

interface FileExplorerProps {
  rootPath: string | null;
  onSelectFile: (path: string) => void;
  onSelectFolder: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ rootPath, onSelectFile, onSelectFolder }) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath).then(nodes => setFileTree(nodes));
      setExpandedPaths(new Set([rootPath]));
    }
  }, [rootPath]);

  const loadDirectory = async (path: string): Promise<FileNode[]> => {
    if (!window.electronAPI) return [];
    try {
      const items = await window.electronAPI.listDir(path);
      return items.map(item => ({
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory,
      })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
    } catch (error) {
      console.error('Failed to load directory:', error);
      return [];
    }
  };

  const toggleFolder = async (node: FileNode) => {
    if (!node.isDirectory) {
      onSelectFile(node.path);
      return;
    }

    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path);
    } else {
      newExpanded.add(node.path);
      // Load children if not loaded (though here we might need a better state management for deep trees)
      // For simplicity, we'll just rely on the parent component or a recursive render
    }
    setExpandedPaths(newExpanded);
  };

  const FileTreeNode: React.FC<{ node: FileNode; depth: number }> = ({ node, depth }) => {
    const isExpanded = expandedPaths.has(node.path);
    const [children, setChildren] = useState<FileNode[]>([]);
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
      if (isExpanded && !hasLoaded && node.isDirectory) {
        loadDirectory(node.path).then(nodes => {
          setChildren(nodes);
          setHasLoaded(true);
        });
      }
    }, [isExpanded, node.path, node.isDirectory, hasLoaded]);

    return (
      <div>
        <div
          className={`flex items-center gap-1 py-1 px-2 hover:bg-gray-100 cursor-pointer text-sm ${depth === 0 ? 'font-medium' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleFolder(node)}
        >
          {node.isDirectory ? (
            <>
              {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
              {isExpanded ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-blue-500" />}
            </>
          ) : (
            <>
              <span className="w-3" /> {/* Spacer for alignment */}
              <File className="w-4 h-4 text-gray-500" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {isExpanded && node.isDirectory && (
          <div>
            {children.map(child => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4 text-center">
        <p className="mb-4">未打开文件夹</p>
        <button
          onClick={onSelectFolder}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          打开文件夹
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 border-r border-gray-200">
      <div className="p-2 font-semibold text-xs text-gray-500 uppercase tracking-wider flex justify-between items-center">
        <span>资源管理器</span>
        <button onClick={onSelectFolder} className="hover:text-blue-600" title="切换文件夹">
          ...
        </button>
      </div>
      <div className="pb-4">
        {fileTree.map(node => (
          <FileTreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
};
