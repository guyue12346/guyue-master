
import React from 'react';
import { TodoItem } from '../types';
import { Check, Circle, Trash2, Edit2, Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

interface TodoListProps {
  todos: TodoItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
}

export const TodoList: React.FC<TodoListProps> = ({ todos, onToggle, onDelete, onEdit }) => {
  const pendingTodos = todos.filter(t => !t.isCompleted);
  const completedTodos = todos.filter(t => t.isCompleted);

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
      case 'high': return '高优先级';
      case 'medium': return '中优先级';
      case 'low': return '低优先级';
      default: return '普通';
    }
  };

  const TodoItemCard = ({ todo }: { todo: TodoItem }) => {
    const isOverdue = !todo.isCompleted && todo.dueDate && todo.dueDate < Date.now();

    return (
      <div 
        className={`group flex items-start gap-3 p-4 bg-white rounded-xl border transition-all duration-200
          ${todo.isCompleted ? 'border-gray-100 opacity-60' : 'border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100'}
        `}
      >
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
          <div className={`text-sm font-medium leading-relaxed mb-1.5 ${todo.isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            {todo.content}
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
             <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex items-center gap-1 ${getPriorityColor(todo.priority)}`}>
               <AlertCircle className="w-3 h-3" />
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
          </div>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-center">
            <button onClick={() => onEdit(todo)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-400 hover:text-blue-600 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(todo.id)} className="p-1.5 hover:bg-red-50 rounded-md text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
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

      {completedTodos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 px-1">
            <CheckCircle2 className="w-4 h-4" />
            已完成 ({completedTodos.length})
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {completedTodos.map(todo => <TodoItemCard key={todo.id} todo={todo} />)}
          </div>
        </div>
      )}
    </div>
  );
};
