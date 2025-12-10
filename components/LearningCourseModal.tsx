import React, { useState, useEffect } from 'react';
import { X, Check, Brain, Cpu, Server, Code, Wrench, BookOpen, GraduationCap, Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc, Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network, FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star } from 'lucide-react';
import { CourseData } from './LearningData';

interface LearningCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (course: Partial<CourseData>) => void;
  initialData?: CourseData;
  categoryId: string;
  isEditing: boolean;
}

const AVAILABLE_ICONS = [
  { name: 'Brain', icon: Brain },
  { name: 'Cpu', icon: Cpu },
  { name: 'Server', icon: Server },
  { name: 'Code', icon: Code },
  { name: 'Wrench', icon: Wrench },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'GraduationCap', icon: GraduationCap },
  { name: 'Globe', icon: Globe },
  { name: 'Database', icon: Database },
  { name: 'Cloud', icon: Cloud },
  { name: 'Terminal', icon: Terminal },
  { name: 'Layout', icon: Layout },
  { name: 'Layers', icon: Layers },
  { name: 'Box', icon: Box },
  { name: 'Circle', icon: Circle },
  { name: 'Disc', icon: Disc },
  // New icons
  { name: 'Rocket', icon: Rocket },
  { name: 'Lightbulb', icon: Lightbulb },
  { name: 'Target', icon: Target },
  { name: 'Puzzle', icon: Puzzle },
  { name: 'Microscope', icon: Microscope },
  { name: 'FlaskConical', icon: FlaskConical },
  { name: 'Atom', icon: Atom },
  { name: 'Network', icon: Network },
  { name: 'FileCode', icon: FileCode },
  { name: 'GitBranch', icon: GitBranch },
  { name: 'Zap', icon: Zap },
  { name: 'Shield', icon: Shield },
  { name: 'Lock', icon: Lock },
  { name: 'Key', icon: Key },
  { name: 'Monitor', icon: Monitor },
  { name: 'Smartphone', icon: Smartphone },
  { name: 'Wifi', icon: Wifi },
  { name: 'Radio', icon: Radio },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Star', icon: Star },
];

export const LearningCourseModal: React.FC<LearningCourseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  categoryId,
  isEditing
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('');
  const [priority, setPriority] = useState(50);

  useEffect(() => {
    if (isOpen && initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description);
      setSelectedIcon(initialData.icon || '');
      setPriority(initialData.priority || 50);
    } else if (isOpen) {
      setTitle('');
      setDescription('');
      setSelectedIcon('');
      setPriority(50);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    
    onSave({
      id: initialData?.id,
      title,
      description,
      categoryId,
      icon: selectedIcon,
      priority
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">
            {isEditing ? '编辑学习模块' : '新建学习模块'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">模块标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：Docker 容器化技术实战"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">备注说明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述该模块的内容..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-24 resize-none"
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择图标 (可选)</label>
            <div className="grid grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map(({ name: iconName, icon: Icon }) => (
                <button
                  key={iconName}
                  onClick={() => setSelectedIcon(iconName)}
                  className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                    selectedIcon === iconName 
                      ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-500 ring-offset-1' 
                      : 'hover:bg-gray-100 text-gray-500'
                  }`}
                  title={iconName}
                >
                  <Icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">优先级</label>
              <span className="text-sm text-gray-500">{priority}</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <p className="text-xs text-gray-500">1-最高优先级，100-最低优先级</p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
