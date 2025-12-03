import React, { useEffect, useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';

interface CodeEditorProps {
  filePath: string | null;
  content: string;
  language: string;
  onChange: (value: string | undefined) => void;
  onSave: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ filePath, content, language, onChange, onSave }) => {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    
    // Add Save command (Cmd+S)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave();
    });
  };

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-[#1e1e1e]">
        <div className="text-center">
          <div className="text-6xl mb-4">Code</div>
          <p>使用 Cmd+O 打开文件夹，或从左侧选择文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        defaultLanguage={language}
        language={language}
        value={content}
        theme="vs-dark"
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
};
