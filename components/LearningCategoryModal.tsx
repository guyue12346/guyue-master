import React, { useState, useEffect } from 'react';
import { X, Check, Brain, Cpu, Server, Code, Wrench, BookOpen, GraduationCap, Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc, Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network, FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star } from 'lucide-react';
import { CourseCategory } from './LearningData';

interface LearningCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: CourseCategory) => void;
  initialData?: CourseCategory;
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

const AVAILABLE_COLORS = [
  { name: 'purple', bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  { name: 'blue', bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  { name: 'green', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  { name: 'orange', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  { name: 'cyan', bg: 'bg-cyan-100', text: 'text-cyan-600', border: 'border-cyan-200' },
  { name: 'gray', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
  { name: 'red', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' },
  { name: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-600', border: 'border-yellow-200' },
  { name: 'pink', bg: 'bg-pink-100', text: 'text-pink-600', border: 'border-pink-200' },
  { name: 'indigo', bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200' },
];

export const LearningCategoryModal: React.FC<LearningCategoryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isEditing
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('BookOpen');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [priority, setPriority] = useState(50);

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name);
      setDescription(initialData.description);
      setSelectedIcon(initialData.icon);
      setSelectedColor(initialData.color);
      setPriority(initialData.priority || 50);
    } else if (isOpen) {
      setName('');
      setDescription('');
      setSelectedIcon('BookOpen');
      setSelectedColor('blue');
      setPriority(50);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    
    onSave({
      id: initialData?.id || `cat_${Date.now()}`,
      name,
      description,
      icon: selectedIcon,
      color: selectedColor,
      priority
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[500px] max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">
            {isEditing ? '编辑学习方向' : '新建学习方向'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">方向名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：人工智能、前端开发"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">备注说明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述该学习方向的内容..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 h-24 resize-none"
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">选择图标</label>
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

          {/* Color Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">主题颜色</label>
            <div className="flex flex-wrap gap-3">
              {AVAILABLE_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setSelectedColor(color.name)}
                  className={`w-8 h-8 rounded-full ${color.bg} border-2 flex items-center justify-center transition-all ${
                    selectedColor === color.name 
                      ? 'border-gray-600 scale-110' 
                      : 'border-transparent hover:scale-105'
                  }`}
                  title={color.name}
                >
                  {selectedColor === color.name && <Check className={`w-4 h-4 ${color.text}`} />}
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
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
