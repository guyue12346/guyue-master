
import React, { useState } from 'react';
import { TodoItem, SubTask } from '../types';
import { Check, Trash2, Edit2, Calendar, AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronRight, Archive, AlignLeft, ListChecks } from 'lucide-react';

interface TodoListProps {
  todos: TodoItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
  onToggleSubtask: (todoId: string, subtaskId: string) => void;
}

const ARCHIVE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const TodoList: React.FC<TodoListProps> = ({ todos, onToggle, onDelete, onEdit, onToggleSubtask }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const now = Date.now();
  const pendingTodos = todos.filter(t => !t.isCompleted);
  const recentCompleted = todos.filter(t => t.isCompleted && (!t.completedAt || now - t.completedAt < ARCHIVE_THRESHOLD_MS));
  const archivedTodos = todos.filter(t => t.isCompleted && t.completedAt && now - t.completedAt >= ARCHIVE_THRESHOLD_MS);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500 bg-red-50 border-red-100';
      case 'medium': return 'text-orange-500 bg-orange-50 border-orange-100';
      case 'low': return 'text-blue-500 bg-blue-50 border-blue-100';
      default: return 'text-gray-500 bg-gray-50 border-gray-100';
    }
  };

  const getPriorityLabel = (priority: string) => {
     switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '-';
    }
  };

  const TodoItemCard = ({ todo }: { todo: TodoItem }) => {
    const isOverdue = !todo.isCompleted && todo.dueDate && todo.dueDate < now;
    const isExpanded = expandedIds.has(todo.id);
    const hasExtra = !!(todo.description || (todo.subtasks && todo.subtasks.length > 0));
    const subtasks = todo.subtasks || [];
    const completedSubs = subtasks.filter(s => s.isCompleted).length;
    const subProgress = subtasks.length > 0 ? completedSubs / subtasks.length : 0;

    return (
      <div 
        className={`group bg-white rounded-xl border transition-all duration-200
          ${todo.isCompleted ? 'border-gray-100 opacity-60' : 'border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100'}
        `}
      >
        {/* Main row */}
        <div className="flex items-start gap-3 p-4">
          <button
            onClick={() => onToggle(todo.id)}
            className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
              ${todo.isCompleted 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'border-gray-300 hover:border-blue-400 text-transparent'
              }
            `}
          >
            <Check className="w-3 h-3" strokeWidth={3} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasExtra && (
                <button onClick={() => toggleExpand(todo.id)} className="flex-shrink-0 p-0.5 -ml-1 text-gray-400 hover:text-gray-600 transition-colors">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
              <div className={`text-sm font-medium leading-relaxed ${todo.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {todo.content}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getPriorityColor(todo.priority)}`}>
                {getPriorityLabel(todo.priority)}
              </span>
               
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 border-gray-100 text-gray-500 font-medium">
                {todo.category}
              </span>

              {todo.dueDate && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 font-medium
                  ${isOverdue ? 'text-red-600 bg-red-50 border-red-100' : 'text-gray-500 bg-gray-50 border-gray-100'}
                `}>
                  <Calendar className="w-3 h-3" />
                  {new Date(todo.dueDate).toLocaleDateString()}
                  {isOverdue && ' (已过期)'}
                </span>
              )}

              {subtasks.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-100 bg-gray-50 text-gray-500 font-medium flex items-center gap-1">
                  <ListChecks className="w-3 h-3" />
                  {completedSubs}/{subtasks.length}
                </span>
              )}

              {todo.description && !isExpanded && (
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <AlignLeft className="w-3 h-3" />
                </span>
              )}
            </div>

            {/* Sub-task progress bar (inline) */}
            {subtasks.length > 0 && !isExpanded && (
              <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden w-full max-w-[200px]">
                <div className="h-full bg-green-400 rounded-full transition-all duration-300" style={{ width: `${subProgress * 100}%` }} />
              </div>
            )}
          </div>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-center shrink-0">
            <button onClick={() => onEdit(todo)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(todo.id)} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded: description + subtasks */}
        {isExpanded && hasExtra && (
          <div className="px-4 pb-4 pl-12 space-y-3 border-t border-gray-50 pt-3">
            {todo.description && (
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{todo.description}</p>
            )}
            {subtasks.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full transition-all duration-300" style={{ width: `${subProgress * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium shrink-0">{completedSubs}/{subtasks.length}</span>
                </div>
                {subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleSubtask(todo.id, st.id)}
                      className={`flex-shrink-0 w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center transition-all
                        ${st.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}
                      `}
                    >
                      {st.isCompleted && <Check className="w-2 h-2" strokeWidth={3} />}
                    </button>
                    <span className={`text-xs ${st.isCompleted ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                      {st.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (todos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center text-gray-400">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
          <CheckCircle2 className="w-10 h-10 text-green-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-600">暂无待办事项</h3>
        <p className="text-sm">点击右上角的 "+" 按钮添加新任务。</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      {/* Pending */}
      {pendingTodos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2 px-1">
            <Clock className="w-4 h-4" />
            进行中 ({pendingTodos.length})
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {pendingTodos.map(todo => <TodoItemCard key={todo.id} todo={todo} />)}
          </div>
        </div>
      )}

      {/* Recently completed */}
      {recentCompleted.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 px-1">
            <CheckCircle2 className="w-4 h-4" />
            已完成 ({recentCompleted.length})
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {recentCompleted.map(todo => <TodoItemCard key={todo.id} todo={todo} />)}
          </div>
        </div>
      )}

      {/* Archived (7+ days) */}
      {archivedTodos.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 px-1 text-sm font-bold text-gray-300 uppercase tracking-wider hover:text-gray-400 transition-colors"
          >
            <Archive className="w-4 h-4" />
            已归档 ({archivedTodos.length})
            {showArchived ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showArchived && (
            <div className="grid grid-cols-1 gap-2">
              {archivedTodos.map(todo => <TodoItemCard key={todo.id} todo={todo} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
