import React from 'react';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Code, FileCode2,
  Table, Link2, Image, Minus, Sigma, SquareFunction,
  Superscript, Subscript, Highlighter, AlertCircle
} from 'lucide-react';

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  content: string;
  onContentChange: (content: string) => void;
}

type InsertType = 'wrap' | 'prefix' | 'block' | 'template';

interface ToolbarAction {
  icon: React.ReactNode;
  title: string;
  type: InsertType;
  before?: string;
  after?: string;
  template?: string;
  placeholder?: string;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  textareaRef,
  content,
  onContentChange
}) => {
  const insertText = (action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    let newContent = '';
    let cursorOffset = 0;

    switch (action.type) {
      case 'wrap': {
        // Wrap selected text with before/after
        const before = action.before || '';
        const after = action.after || '';
        const insertText = selectedText || action.placeholder || '';
        newContent = content.substring(0, start) + before + insertText + after + content.substring(end);
        cursorOffset = selectedText ? start + before.length + insertText.length + after.length : start + before.length;
        break;
      }
      case 'prefix': {
        // Add prefix to line(s)
        const before = action.before || '';
        const lineStart = content.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = content.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? content.length : lineEnd;

        // Check if we need to add newline before
        const needNewlineBefore = lineStart > 0 && content[lineStart - 1] !== '\n';
        const prefix = needNewlineBefore ? '\n' + before : before;

        newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart);
        cursorOffset = lineStart + prefix.length;
        break;
      }
      case 'block': {
        // Insert a block (code block, etc.) with newlines
        const before = action.before || '';
        const after = action.after || '';
        const insertText = selectedText || action.placeholder || '';

        // Add newlines if not at start of line
        const needNewlineBefore = start > 0 && content[start - 1] !== '\n';
        const actualBefore = (needNewlineBefore ? '\n' : '') + before;

        newContent = content.substring(0, start) + actualBefore + insertText + after + content.substring(end);
        cursorOffset = start + actualBefore.length + (selectedText ? insertText.length : 0);
        break;
      }
      case 'template': {
        // Insert a template (table, etc.)
        const template = action.template || '';
        const needNewlineBefore = start > 0 && content[start - 1] !== '\n';
        const actualTemplate = (needNewlineBefore ? '\n\n' : '') + template;

        newContent = content.substring(0, start) + actualTemplate + content.substring(end);
        cursorOffset = start + actualTemplate.length;
        break;
      }
    }

    onContentChange(newContent);

    // Restore focus and set cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorOffset, cursorOffset);
    }, 0);
  };

  const toolbarGroups: { title: string; actions: ToolbarAction[] }[] = [
    {
      title: '文本格式',
      actions: [
        { icon: <Bold className="w-4 h-4" />, title: '粗体 (Ctrl+B)', type: 'wrap', before: '**', after: '**', placeholder: '粗体文本' },
        { icon: <Italic className="w-4 h-4" />, title: '斜体 (Ctrl+I)', type: 'wrap', before: '*', after: '*', placeholder: '斜体文本' },
        { icon: <Strikethrough className="w-4 h-4" />, title: '删除线', type: 'wrap', before: '~~', after: '~~', placeholder: '删除线文本' },
        { icon: <Highlighter className="w-4 h-4" />, title: '高亮', type: 'wrap', before: '==', after: '==', placeholder: '高亮文本' },
        { icon: <Superscript className="w-4 h-4" />, title: '上标', type: 'wrap', before: '<sup>', after: '</sup>', placeholder: '上标' },
        { icon: <Subscript className="w-4 h-4" />, title: '下标', type: 'wrap', before: '<sub>', after: '</sub>', placeholder: '下标' },
      ]
    },
    {
      title: '标题',
      actions: [
        { icon: <Heading1 className="w-4 h-4" />, title: '一级标题', type: 'prefix', before: '# ' },
        { icon: <Heading2 className="w-4 h-4" />, title: '二级标题', type: 'prefix', before: '## ' },
        { icon: <Heading3 className="w-4 h-4" />, title: '三级标题', type: 'prefix', before: '### ' },
      ]
    },
    {
      title: '列表',
      actions: [
        { icon: <List className="w-4 h-4" />, title: '无序列表', type: 'prefix', before: '- ' },
        { icon: <ListOrdered className="w-4 h-4" />, title: '有序列表', type: 'prefix', before: '1. ' },
        { icon: <CheckSquare className="w-4 h-4" />, title: '任务列表', type: 'prefix', before: '- [ ] ' },
      ]
    },
    {
      title: '引用和代码',
      actions: [
        { icon: <Quote className="w-4 h-4" />, title: '引用', type: 'prefix', before: '> ' },
        { icon: <Code className="w-4 h-4" />, title: '行内代码', type: 'wrap', before: '`', after: '`', placeholder: 'code' },
        { icon: <FileCode2 className="w-4 h-4" />, title: '代码块', type: 'block', before: '```\n', after: '\n```\n', placeholder: '// 代码' },
        { icon: <AlertCircle className="w-4 h-4" />, title: 'Callout提示', type: 'block', before: '> [!NOTE] 提示\n> ', after: '\n', placeholder: '提示内容' },
      ]
    },
    {
      title: '数学公式',
      actions: [
        { icon: <Sigma className="w-4 h-4" />, title: '行内公式', type: 'wrap', before: '$', after: '$', placeholder: 'E=mc^2' },
        { icon: <SquareFunction className="w-4 h-4" />, title: '行间公式', type: 'block', before: '$$\n', after: '\n$$\n', placeholder: '\\sum_{i=1}^{n} x_i' },
      ]
    },
    {
      title: '插入',
      actions: [
        { icon: <Link2 className="w-4 h-4" />, title: '链接', type: 'wrap', before: '[', after: '](url)', placeholder: '链接文字' },
        { icon: <Image className="w-4 h-4" />, title: '图片', type: 'wrap', before: '![', after: '](图片地址)', placeholder: '图片描述' },
        {
          icon: <Table className="w-4 h-4" />,
          title: '表格',
          type: 'template',
          template: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |\n'
        },
        { icon: <Minus className="w-4 h-4" />, title: '分割线', type: 'template', template: '\n---\n' },
      ]
    },
  ];

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!textareaRef.current || document.activeElement !== textareaRef.current) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            insertText({ icon: null, title: '', type: 'wrap', before: '**', after: '**', placeholder: '粗体文本' });
            break;
          case 'i':
            e.preventDefault();
            insertText({ icon: null, title: '', type: 'wrap', before: '*', after: '*', placeholder: '斜体文本' });
            break;
          case 'k':
            e.preventDefault();
            insertText({ icon: null, title: '', type: 'wrap', before: '[', after: '](url)', placeholder: '链接文字' });
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [content]);

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b border-gray-200 overflow-x-auto">
      {toolbarGroups.map((group, groupIndex) => (
        <React.Fragment key={group.title}>
          {groupIndex > 0 && <div className="w-px h-5 bg-gray-300 mx-1" />}
          <div className="flex items-center gap-0.5">
            {group.actions.map((action, actionIndex) => (
              <button
                key={actionIndex}
                onClick={() => insertText(action)}
                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title={action.title}
                type="button"
              >
                {action.icon}
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
