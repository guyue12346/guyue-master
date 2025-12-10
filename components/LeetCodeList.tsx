import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, PlayCircle, FileText, ExternalLink, Plus, ArrowLeft, Trash2, Edit2, CheckCircle2, Circle } from 'lucide-react';
import { LeetCodeList as ILeetCodeList, LeetCodeCategory } from '../utils/leetcodeParser';

interface LeetCodeListProps {
  lists: ILeetCodeList[];
  progress: Record<string, boolean>;
  onSelectProblem: (url: string) => void;
  onToggleProblem: (url: string) => void;
  onAddList: () => void;
  onDeleteList: (id: string) => void;
  onEditList: (list: ILeetCodeList) => void;
}

export const LeetCodeList: React.FC<LeetCodeListProps> = ({ 
  lists, 
  progress,
  onSelectProblem, 
  onToggleProblem,
  onAddList,
  onDeleteList,
  onEditList
}) => {
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const activeList = lists.find(l => l.id === activeListId);

  // Calculate progress for a list
  const getListProgress = (list: ILeetCodeList) => {
    let total = 0;
    let completed = 0;
    list.categories.forEach(cat => {
      cat.problems.forEach(prob => {
        total++;
        if (progress[prob.url]) completed++;
      });
    });
    return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  };

  const toggleCategory = (title: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(title)) {
      newSet.delete(title);
    } else {
      newSet.add(title);
    }
    setExpandedCategories(newSet);
  };

  // Auto expand first category when entering a list
  useEffect(() => {
    if (activeList && activeList.categories.length > 0) {
      setExpandedCategories(new Set([activeList.categories[0].title]));
    }
  }, [activeListId]);

  // View: All Lists
  if (!activeListId) {
    return (
      <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200 w-80 shrink-0">
        <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            我的题单
          </h2>
          <button 
            onClick={onAddList}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            title="新建题单"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {lists.map(list => {
            const { total, completed, percent } = getListProgress(list);
            return (
              <div 
                key={list.id}
                className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group relative"
                onClick={() => setActiveListId(list.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium text-gray-800 line-clamp-1 pr-6">{list.title}</h3>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white pl-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEditList(list); }}
                      className="p-1 text-gray-400 hover:text-blue-600 rounded"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteList(list.id); }}
                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                
                {list.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{list.description}</p>
                )}

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>进度</span>
                    <span>{completed}/{total} ({percent}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // View: Single List Detail
  const { total, completed, percent } = getListProgress(activeList);

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200 w-80 shrink-0">
      <div className="p-4 border-b border-gray-200 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveListId(null)}
            className="p-1 -ml-1 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-semibold text-gray-800 truncate flex-1" title={activeList.title}>
            {activeList.title}
          </h2>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>总进度</span>
            <span>{completed}/{total}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {activeList.categories.map((cat, idx) => (
          <div key={idx} className="rounded-lg overflow-hidden bg-white border border-gray-100 shadow-sm">
            <button
              onClick={() => toggleCategory(cat.title)}
              className="w-full px-3 py-2 flex items-center justify-between bg-gray-50/50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="font-medium text-sm text-gray-700 truncate pr-2" title={cat.title}>
                {cat.title}
              </span>
              {expandedCategories.has(cat.title) ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>
            
            {expandedCategories.has(cat.title) && (
              <div className="divide-y divide-gray-50">
                {cat.problems.map((prob, pIdx) => {
                  const isCompleted = progress[prob.url];
                  return (
                    <div 
                      key={pIdx}
                      className={`group px-3 py-2 hover:bg-blue-50 transition-colors cursor-pointer flex flex-col gap-1 ${isCompleted ? 'bg-green-50/30' : ''}`}
                      onClick={() => onSelectProblem(prob.url)}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleProblem(prob.url); }}
                          className={`mt-0.5 shrink-0 transition-colors ${isCompleted ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'}`}
                        >
                          {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm leading-tight block ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-700 group-hover:text-blue-700'}`}>
                            {prob.title}
                          </span>
                        </div>
                      </div>
                      
                      {(prob.note || prob.codeUrl) && (
                        <div className="flex items-center gap-3 text-xs text-gray-400 pl-6">
                          {prob.note && <span>{prob.note}</span>}
                          {prob.codeUrl && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSelectProblem(prob.codeUrl!); }}
                              className="flex items-center gap-1 hover:text-blue-600"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {prob.codeText || '相关链接'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
