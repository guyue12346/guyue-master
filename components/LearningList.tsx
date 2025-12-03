import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, PlayCircle, FileText, Code, CheckCircle2, Circle, Folder, Info, Trash2, File, Upload, FileUp } from 'lucide-react';
import { CourseData, Module, Lecture } from './LearningData';

interface NoteEntry {
  name: string;
  isDirectory: boolean;
  path: string;
  children?: NoteEntry[];
}

interface LearningListProps {
  course: CourseData;
  selectedItemId: string | null; 
  activeVideoId: string | null;
  activeNoteId: string | null;
  activeCustomNotePath: string | null;
  onSelectItem: (type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource', id: string) => void;
  progress: Record<string, boolean>;
  onToggleProgress: (id: string) => void;
}

export const LearningList: React.FC<LearningListProps> = ({ 
  course, 
  activeVideoId,
  activeNoteId,
  activeCustomNotePath,
  onSelectItem,
  progress,
  onToggleProgress
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'resources': true,
    'assignments': true,
    'personal': true
  });
  
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  // Personal Resources State
  const [personalRootPath, setPersonalRootPath] = useState<string>('');
  const [personalEntries, setPersonalEntries] = useState<NoteEntry[]>([]);

  const ensurePersonalContextReady = () => {
    if (!window.electronAPI) {
      alert('该功能仅在桌面客户端可用');
      return false;
    }
    if (!personalRootPath) {
      alert('个人资源目录正在初始化，请稍后重试');
      return false;
    }
    return true;
  };

  useEffect(() => {
    const initPaths = async () => {
      if (window.electronAPI) {
        const userDataPath = await window.electronAPI.getUserDataPath();
        
        const savedArchivePath = localStorage.getItem('linkmaster_archive_path');

        // Init Personal Resources
        // Use configured archive path or default to userData/personal_resources
        let personalPath;
        if (savedArchivePath) {
          personalPath = await window.electronAPI.pathJoin(savedArchivePath, 'personal_resources', course.id);
        } else {
          personalPath = await window.electronAPI.pathJoin(userDataPath, 'personal_resources', course.id);
        }
        await window.electronAPI.ensureDir(personalPath);
        setPersonalRootPath(personalPath);
        loadPersonalResources(personalPath);
      }
    };
    initPaths();
  }, [course.id]);

  const loadPersonalResources = async (path: string) => {
    if (!window.electronAPI) return;
    try {
      const entries = await window.electronAPI.listDir(path);
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
      setPersonalEntries(sorted);
    } catch (e) {
      console.error("Failed to load personal resources:", e);
    }
  };

  const handleUploadResource = async () => {
    if (!ensurePersonalContextReady()) {
      return;
    }
    
    const file = await window.electronAPI.selectFile();
    if (!file) return;

    const destPath = await window.electronAPI.pathJoin(personalRootPath, file.name);
    const success = await window.electronAPI.copyFile(file.path, destPath);
    
    if (success) {
      loadPersonalResources(personalRootPath);
    } else {
      alert('上传失败');
    }
  };

  const handleDeleteResource = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ensurePersonalContextReady()) return;
    if (confirm('确定要删除吗？此操作不可恢复。')) {
      await window.electronAPI.deleteFile(path);
      loadPersonalResources(personalRootPath);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  return (
    <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="font-bold text-gray-800">{course.title}</h2>
        <p className="text-xs text-gray-500 mt-1">{course.description}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        
        {/* Course Introduction */}
        <button 
          onClick={() => onSelectItem('intro', 'intro')}
          className={`w-full px-3 py-2 flex items-center gap-2 rounded-lg transition-colors text-sm font-medium
            ${activeVideoId === 'intro' ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}
          `}
        >
          <Info className="w-4 h-4 text-blue-500" />
          课程介绍
        </button>

        {/* Course Resources Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button 
            onClick={() => toggleSection('resources')}
            className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <Folder className="w-4 h-4 text-blue-500" />
              课程资源
            </div>
            {expandedSections['resources'] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
          
          {expandedSections['resources'] && (
            <div className="border-t border-gray-200">
              {course.modules.map((module) => (
                <div key={module.id} className="border-b border-gray-100 last:border-0">
                  <button 
                    onClick={() => toggleModule(module.id)}
                    className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{module.title}</div>
                      <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>
                    </div>
                    {expandedModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                  </button>

                  {expandedModules[module.id] && (
                    <div className="bg-gray-50/50 pb-2">
                      {/* Videos Subsection */}
                      <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                        课程视频
                      </div>
                      {module.lectures.map((lec) => (
                        <div 
                          key={`vid_${lec.id}`}
                          onClick={() => onSelectItem('video', lec.id)}
                          className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors pl-6
                            ${activeVideoId === lec.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                          `}
                        >
                          <PlayCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-sm truncate">{lec.title}</span>
                        </div>
                      ))}

                      {/* Plans/Notes Subsection */}
                      <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                        课程教案
                      </div>
                      {module.lectures.map((lec) => (
                        <div 
                          key={`note_${lec.id}`}
                          onClick={() => onSelectItem('note', lec.id)}
                          className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer transition-colors pl-6
                            ${activeNoteId === lec.id ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}
                          `}
                        >
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-sm truncate">{lec.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignments Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button 
            onClick={() => toggleSection('assignments')}
            className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <Code className="w-4 h-4 text-green-500" />
              课程作业
            </div>
            {expandedSections['assignments'] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
          
          {expandedSections['assignments'] && (
            <div className="border-t border-gray-200">
              {course.assignments.map((assign) => (
                <div 
                  key={assign.id}
                  onClick={() => onSelectItem('assignment', assign.id)}
                  className={`px-3 py-2 flex items-start gap-3 cursor-pointer transition-colors hover:bg-gray-50
                    ${activeNoteId === assign.id ? 'bg-green-50 border-l-2 border-green-500' : 'border-l-2 border-transparent'}
                  `}
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); onToggleProgress(assign.id); }}
                    className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                  >
                    {progress[assign.id] ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${progress[assign.id] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                      {assign.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                      {assign.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Personal Resources Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div 
            className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => toggleSection('personal')}
          >
            <div className="flex items-center gap-2 font-medium text-sm text-gray-700">
              <FileUp className="w-4 h-4 text-orange-500" />
              个人资源
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleUploadResource(); }} 
                  className="p-1 hover:bg-gray-200 rounded text-gray-500" 
                  title="上传资源 (PDF/Markdown)"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
              {expandedSections['personal'] ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
            </div>
          </div>
          
          {expandedSections['personal'] && (
            <div className="p-2">
              {personalEntries.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">暂无资源</div>
              ) : (
                <div className="space-y-1">
                  {personalEntries.map((entry) => (
                    <div 
                      key={entry.path}
                      onClick={() => !entry.isDirectory && onSelectItem('personal-resource', entry.path)}
                      className={`group flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer
                        ${activeCustomNotePath === entry.path ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'}
                      `}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {entry.name.toLowerCase().endsWith('.pdf') ? (
                          <FileText className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        ) : (
                          <File className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{entry.name}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteResource(entry.path, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
