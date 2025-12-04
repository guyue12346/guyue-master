import React, { useState } from 'react';
import { ChevronDown, ChevronRight, PlayCircle, FileText, Code, CheckCircle2, Circle, Folder, Info, Trash2, FileUp, Plus, Link } from 'lucide-react';
import { CourseData, Module, Lecture, AssignmentModule, PersonalModule, ResourceItem, COURSE_CATEGORIES } from './LearningData';

interface LearningListProps {
  course: CourseData;
  selectedItemId: string | null; 
  activeVideoId: string | null;
  activeNoteId: string | null;
  activeCustomNotePath: string | null;
  onSelectItem: (type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource', id: string) => void;
  progress: Record<string, boolean>;
  onToggleProgress: (id: string) => void;
  onUpdateCourse: (updatedCourse: CourseData) => void;
}

export const LearningList: React.FC<LearningListProps> = ({ 
  course, 
  activeVideoId,
  activeNoteId,
  activeCustomNotePath,
  onSelectItem,
  progress,
  onToggleProgress,
  onUpdateCourse
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'resources': true,
    'assignments': true,
    'personal': true
  });
  
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // UI States for Inputs/Dialogs
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [addingModuleSection, setAddingModuleSection] = useState<'resources' | 'assignments' | 'personal'>('resources');
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');

  const [addingLinkModuleId, setAddingLinkModuleId] = useState<string | null>(null);
  const [addingLinkSection, setAddingLinkSection] = useState<'resources' | 'assignments' | 'personal' | null>(null);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkType, setNewLinkType] = useState<'video' | 'note'>('note');

  const [expandedAssignmentModules, setExpandedAssignmentModules] = useState<Record<string, boolean>>({});
  const [expandedPersonalModules, setExpandedPersonalModules] = useState<Record<string, boolean>>({});

  const [pendingUpload, setPendingUpload] = useState<{
    file: { path: string; name: string };
    targetId: string; // moduleId
    section: 'resources' | 'assignments' | 'personal';
  } | null>(null);

  // ==================== Module Management ====================
  
  const handleAddModule = (section: 'resources' | 'assignments' | 'personal') => {
    setIsAddingModule(true);
    setAddingModuleSection(section);
    setNewModuleTitle('');
    setNewModuleDesc('');
    setExpandedSections(prev => ({ ...prev, [section]: true }));
  };

  const confirmAddModule = () => {
    if (!newModuleTitle.trim()) {
      setIsAddingModule(false);
      return;
    }
    
    if (addingModuleSection === 'resources') {
      const newModule: Module = {
        id: `mod_${Date.now()}`,
        title: newModuleTitle,
        description: newModuleDesc,
        lectures: []
      };
      const updatedCourse = {
        ...course,
        modules: [...course.modules, newModule]
      };
      onUpdateCourse(updatedCourse);
    } else if (addingModuleSection === 'assignments') {
      const newModule: AssignmentModule = {
        id: `assign_mod_${Date.now()}`,
        title: newModuleTitle,
        description: newModuleDesc,
        items: []
      };
      const currentModules = course.assignmentModules || [];
      const updatedCourse = {
        ...course,
        assignmentModules: [...currentModules, newModule]
      };
      onUpdateCourse(updatedCourse);
    } else if (addingModuleSection === 'personal') {
      const newModule: PersonalModule = {
        id: `personal_mod_${Date.now()}`,
        title: newModuleTitle,
        description: newModuleDesc,
        items: []
      };
      const currentModules = course.personalModules || [];
      const updatedCourse = {
        ...course,
        personalModules: [...currentModules, newModule]
      };
      onUpdateCourse(updatedCourse);
    }
    
    setIsAddingModule(false);
    setNewModuleTitle('');
  };

  const handleDeleteModule = (moduleId: string, section: 'resources' | 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除该章节吗？')) return;
    
    if (section === 'resources') {
      const updatedCourse = {
        ...course,
        modules: course.modules.filter(m => m.id !== moduleId)
      };
      onUpdateCourse(updatedCourse);
    } else if (section === 'assignments') {
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).filter(m => m.id !== moduleId)
      };
      onUpdateCourse(updatedCourse);
    } else if (section === 'personal') {
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).filter(m => m.id !== moduleId)
      };
      onUpdateCourse(updatedCourse);
    }
  };

  // ==================== File Upload ====================

  const handleAddFile = async (moduleId: string, section: 'resources' | 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) {
      alert('请在桌面端使用此功能');
      return;
    }
    
    const file = await window.electronAPI.selectFile();
    if (!file) return;

    setPendingUpload({
      file,
      targetId: moduleId,
      section
    });
  };

  const confirmUpload = async (shouldCopy: boolean) => {
    if (!pendingUpload) return;
    const { file, targetId, section } = pendingUpload;
    
    let finalPath = file.path;

    if (shouldCopy) {
      const savedArchivePath = localStorage.getItem('linkmaster_archive_path');
      const rootPath = savedArchivePath || await window.electronAPI.getUserDataPath();
      
      const category = COURSE_CATEGORIES.find(c => c.id === course.categoryId);
      const categoryName = category ? category.name : 'Uncategorized';
      const courseName = course.title;
      
      const sanitize = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_');
      
      let destDir = '';
      let moduleName = 'General';
      
      if (section === 'resources') {
        const module = course.modules.find(m => m.id === targetId);
        moduleName = module ? module.title : 'General';
        destDir = await window.electronAPI.pathJoin(
          rootPath, 'personal_study', sanitize(categoryName), sanitize(courseName), 'resources', sanitize(moduleName)
        );
      } else if (section === 'assignments') {
        const module = (course.assignmentModules || []).find(m => m.id === targetId);
        moduleName = module ? module.title : 'General';
        destDir = await window.electronAPI.pathJoin(
          rootPath, 'personal_study', sanitize(categoryName), sanitize(courseName), 'assignments', sanitize(moduleName)
        );
      } else {
        const module = (course.personalModules || []).find(m => m.id === targetId);
        moduleName = module ? module.title : 'General';
        destDir = await window.electronAPI.pathJoin(
          rootPath, 'personal_study', sanitize(categoryName), sanitize(courseName), 'personal', sanitize(moduleName)
        );
      }
      
      await window.electronAPI.ensureDir(destDir);
      const destPath = await window.electronAPI.pathJoin(destDir, file.name);
      const success = await window.electronAPI.copyFile(file.path, destPath);
      
      if (!success) {
        alert('文件上传失败');
        setPendingUpload(null);
        return;
      }
      finalPath = destPath;
    }

    const fileTitle = file.name.replace(/\.[^/.]+$/, "");

    if (section === 'resources') {
      const newLecture: Lecture = {
        id: `lec_${Date.now()}`,
        title: fileTitle,
        lecturer: 'User',
        materials: finalPath,
        type: 'note',
        date: new Date().toISOString().split('T')[0],
        desc: shouldCopy ? 'Custom Upload' : 'Local Reference'
      };
      
      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === targetId) {
            return { ...m, lectures: [...m.lectures, newLecture] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedModules(prev => ({ ...prev, [targetId]: true }));
    } else if (section === 'assignments') {
      const newItem: ResourceItem = {
        id: `assign_item_${Date.now()}`,
        title: fileTitle,
        link: finalPath
      };
      
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === targetId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedAssignmentModules(prev => ({ ...prev, [targetId]: true }));
    } else {
      const newItem: ResourceItem = {
        id: `personal_item_${Date.now()}`,
        title: fileTitle,
        link: finalPath
      };
      
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === targetId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
      setExpandedPersonalModules(prev => ({ ...prev, [targetId]: true }));
    }
    
    setPendingUpload(null);
  };

  // ==================== Link Management ====================

  const handleAddLectureLink = (moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingLinkModuleId(moduleId);
    setAddingLinkSection('resources');
    setNewLinkTitle('');
    setNewLinkUrl('');
    setNewLinkType('note');
    setExpandedModules(prev => ({ ...prev, [moduleId]: true }));
  };

  const handleAddLink = (moduleId: string, section: 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingLinkModuleId(moduleId);
    setAddingLinkSection(section);
    setNewLinkTitle('');
    setNewLinkUrl('');
    setExpandedSections(prev => ({ ...prev, [section]: true }));
    if (section === 'assignments') {
      setExpandedAssignmentModules(prev => ({ ...prev, [moduleId]: true }));
    } else {
      setExpandedPersonalModules(prev => ({ ...prev, [moduleId]: true }));
    }
  };

  const confirmAddLink = () => {
    if (!newLinkTitle || !newLinkUrl) {
      setAddingLinkModuleId(null);
      setAddingLinkSection(null);
      return;
    }

    if (addingLinkSection === 'resources' && addingLinkModuleId) {
      const newLecture: Lecture = {
        id: `lec_${Date.now()}`,
        title: newLinkTitle,
        lecturer: 'User',
        materials: newLinkUrl,
        videoUrl: newLinkType === 'video' ? newLinkUrl : undefined,
        type: newLinkType,
        date: new Date().toISOString().split('T')[0],
        desc: 'External Link'
      };

      const updatedCourse = {
        ...course,
        modules: course.modules.map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, lectures: [...m.lectures, newLecture] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (addingLinkSection === 'assignments' && addingLinkModuleId) {
      const newItem: ResourceItem = {
        id: `assign_item_${Date.now()}`,
        title: newLinkTitle,
        link: newLinkUrl
      };

      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else if (addingLinkSection === 'personal' && addingLinkModuleId) {
      const newItem: ResourceItem = {
        id: `personal_item_${Date.now()}`,
        title: newLinkTitle,
        link: newLinkUrl
      };

      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === addingLinkModuleId) {
            return { ...m, items: [...m.items, newItem] };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    }

    setAddingLinkModuleId(null);
    setAddingLinkSection(null);
    setNewLinkTitle('');
    setNewLinkUrl('');
  };

  // ==================== Delete Functions ====================

  const handleDeleteLecture = (moduleId: string, lectureId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除该资料吗？')) return;
    
    const updatedCourse = {
      ...course,
      modules: course.modules.map(m => {
        if (m.id === moduleId) {
          return { ...m, lectures: m.lectures.filter(l => l.id !== lectureId) };
        }
        return m;
      })
    };
    onUpdateCourse(updatedCourse);
  };

  const handleDeleteItem = (moduleId: string, itemId: string, section: 'assignments' | 'personal', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除该资源吗？')) return;
    
    if (section === 'assignments') {
      const updatedCourse = {
        ...course,
        assignmentModules: (course.assignmentModules || []).map(m => {
          if (m.id === moduleId) {
            return { ...m, items: m.items.filter(item => item.id !== itemId) };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    } else {
      const updatedCourse = {
        ...course,
        personalModules: (course.personalModules || []).map(m => {
          if (m.id === moduleId) {
            return { ...m, items: m.items.filter(item => item.id !== itemId) };
          }
          return m;
        })
      };
      onUpdateCourse(updatedCourse);
    }
  };

  // ==================== UI Helpers ====================

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
        
        {/* Upload Choice Modal */}
        {pendingUpload && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">导入文件</h3>
              <p className="text-sm text-gray-600 mb-4">
                您希望如何导入文件 <span className="font-medium text-gray-800">{pendingUpload.file.name}</span>？
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => confirmUpload(true)}
                  className="w-full flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-blue-900">复制到资料库 (推荐)</div>
                    <div className="text-xs text-blue-700 mt-0.5">文件将保存到归档目录，独立于原文件</div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </button>
                
                <button
                  onClick={() => confirmUpload(false)}
                  className="w-full flex items-center justify-between p-3 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium text-gray-900">仅引用路径</div>
                    <div className="text-xs text-gray-500 mt-0.5">仅保存文件链接，依赖原文件位置</div>
                  </div>
                  <Link className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setPendingUpload(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

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
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button 
              onClick={() => toggleSection('resources')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Folder className="w-4 h-4 text-blue-500" />
              课程资源
              {expandedSections['resources'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('resources')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input */}
          {isAddingModule && addingModuleSection === 'resources' && (
            <div className="p-2 border-b border-gray-100 bg-blue-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-blue-600 hover:bg-blue-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['resources'] && (
            <div className="">
              {course.modules.map((module) => (
                <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                  <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                    <button 
                      onClick={() => toggleModule(module.id)}
                      className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-800">{module.title}</div>
                        <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>
                      </div>
                      {expandedModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                    </button>
                    <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleAddLectureLink(module.id, e)}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                        title="添加链接"
                      >
                        <Link className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleAddFile(module.id, 'resources', e)}
                        className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                        title="添加资料"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteModule(module.id, 'resources', e)}
                        className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                        title="删除章节"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {expandedModules[module.id] && (
                    <div className="bg-gray-50/50 pb-2">
                      
                      {/* Add Link Input */}
                      {addingLinkModuleId === module.id && addingLinkSection === 'resources' && (
                        <div className="px-3 py-2 bg-blue-50/30 border-b border-blue-100 mb-2">
                          <div className="space-y-2">
                            <input
                              autoFocus
                              type="text"
                              value={newLinkTitle}
                              onChange={(e) => setNewLinkTitle(e.target.value)}
                              placeholder="资料标题"
                              className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                            />
                            <input
                              type="text"
                              value={newLinkUrl}
                              onChange={(e) => setNewLinkUrl(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                              placeholder="链接 URL (http://...)"
                              className="w-full text-sm px-2 py-1 border border-blue-200 rounded focus:outline-none focus:border-blue-400"
                            />
                            <div className="flex gap-4 my-2">
                              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                  type="radio"
                                  name="linkType"
                                  checked={newLinkType === 'video'}
                                  onChange={() => setNewLinkType('video')}
                                  className="text-blue-500 focus:ring-blue-500"
                                />
                                课程视频
                              </label>
                              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                  type="radio"
                                  name="linkType"
                                  checked={newLinkType === 'note'}
                                  onChange={() => setNewLinkType('note')}
                                  className="text-blue-500 focus:ring-blue-500"
                                />
                                课程教案
                              </label>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setAddingLinkModuleId(null); setAddingLinkSection(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                              <button onClick={confirmAddLink} className="text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">添加</button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Videos Subsection */}
                      {module.lectures.some(l => l.videoUrl) && (
                        <>
                          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                            课程视频
                          </div>
                          {module.lectures.filter(l => l.videoUrl).map((lec) => (
                            <div 
                              key={`vid_${lec.id}`}
                              className={`group/item px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors pl-6
                                ${activeVideoId === lec.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                              `}
                              onClick={() => onSelectItem('video', lec.id)}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <PlayCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="text-sm truncate">{lec.title}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteLecture(module.id, lec.id, e)}
                                className="opacity-0 group-hover/item:opacity-100 p-1 hover:text-red-500 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Plans/Notes Subsection */}
                      {module.lectures.some(l => !l.videoUrl) && (
                        <>
                          <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                            课程教案
                          </div>
                          {module.lectures.filter(l => !l.videoUrl).map((lec) => (
                            <div 
                              key={`note_${lec.id}`}
                              className={`group/item px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors pl-6
                                ${activeNoteId === lec.id ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}
                              `}
                              onClick={() => onSelectItem('note', lec.id)}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="text-sm truncate">{lec.title}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteLecture(module.id, lec.id, e)}
                                className="opacity-0 group-hover/item:opacity-100 p-1 hover:text-red-500 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignments Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button 
              onClick={() => toggleSection('assignments')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Code className="w-4 h-4 text-green-500" />
              课程练习
              {expandedSections['assignments'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('assignments')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input for Assignments */}
          {isAddingModule && addingModuleSection === 'assignments' && (
            <div className="p-2 border-b border-gray-100 bg-green-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-green-600 hover:bg-green-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['assignments'] && (
            <div className="">
              {(course.assignmentModules || []).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">暂无章节，点击 + 添加</div>
              ) : (
                (course.assignmentModules || []).map((module) => (
                  <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                    <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                      <button 
                        onClick={() => setExpandedAssignmentModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                        className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{module.title}</div>
                          {module.description && <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>}
                        </div>
                        {expandedAssignmentModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                      </button>
                      <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleAddLink(module.id, 'assignments', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加链接"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleAddFile(module.id, 'assignments', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加文件"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteModule(module.id, 'assignments', e)}
                          className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                          title="删除章节"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedAssignmentModules[module.id] && (
                      <div className="bg-gray-50/50 pb-2">
                        {/* Add Link Input */}
                        {addingLinkSection === 'assignments' && addingLinkModuleId === module.id && (
                          <div className="px-3 py-2 bg-green-50/30 border-b border-green-100 mb-2">
                            <div className="space-y-2">
                              <input
                                autoFocus
                                type="text"
                                value={newLinkTitle}
                                onChange={(e) => setNewLinkTitle(e.target.value)}
                                placeholder="练习标题"
                                className="w-full text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                              />
                              <input
                                type="text"
                                value={newLinkUrl}
                                onChange={(e) => setNewLinkUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                                placeholder="练习链接 URL"
                                className="w-full text-sm px-2 py-1 border border-green-200 rounded focus:outline-none focus:border-green-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setAddingLinkSection(null); setAddingLinkModuleId(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                                <button onClick={confirmAddLink} className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">添加</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {module.items.length === 0 ? (
                          <div className="px-6 py-2 text-xs text-gray-400">暂无练习资源</div>
                        ) : (
                          module.items.map((item) => (
                            <div 
                              key={item.id}
                              onClick={() => onSelectItem('assignment', item.link)}
                              className="group/item px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors pl-6 text-gray-600 hover:bg-gray-100"
                            >
                              <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); onToggleProgress(item.id); }}
                                  className="flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                                >
                                  {progress[item.id] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Circle className="w-3.5 h-3.5" />}
                                </button>
                                {item.link.startsWith('http') ? (
                                  <Link className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                )}
                                <span className={`text-sm truncate ${progress[item.id] ? 'text-gray-400 line-through' : ''}`}>{item.title}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteItem(module.id, item.id, 'assignments', e)}
                                className="opacity-0 group-hover/item:opacity-100 p-1 hover:text-red-500 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Personal Resources Section */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 border-b border-gray-200">
            <button 
              onClick={() => toggleSection('personal')}
              className="flex-1 px-3 py-2 flex items-center gap-2 font-medium text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FileUp className="w-4 h-4 text-orange-500" />
              个人资源
              {expandedSections['personal'] ? <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />}
            </button>
            <button
              onClick={() => handleAddModule('personal')}
              className="p-2 hover:bg-gray-200 text-gray-500 transition-colors"
              title="添加章节"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add Module Input for Personal */}
          {isAddingModule && addingModuleSection === 'personal' && (
            <div className="p-2 border-b border-gray-100 bg-orange-50/50">
              <div className="flex items-center gap-2 mb-2">
                <input
                  autoFocus
                  type="text"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                  placeholder="输入章节名称..."
                  className="flex-1 text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                />
                <button onClick={confirmAddModule} className="p-1 text-orange-600 hover:bg-orange-100 rounded">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsAddingModule(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={newModuleDesc}
                onChange={(e) => setNewModuleDesc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddModule()}
                placeholder="输入章节备注 (可选)..."
                className="w-full text-xs px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400 text-gray-600"
              />
            </div>
          )}
          
          {expandedSections['personal'] && (
            <div className="">
              {(course.personalModules || []).length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">暂无章节，点击 + 添加</div>
              ) : (
                (course.personalModules || []).map((module) => (
                  <div key={module.id} className="border-b border-gray-100 last:border-0 group/module">
                    <div className="flex items-center justify-between hover:bg-gray-50 transition-colors pr-2">
                      <button 
                        onClick={() => setExpandedPersonalModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                        className="flex-1 px-3 py-2 flex items-center justify-between text-left"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{module.title}</div>
                          {module.description && <div className="text-xs text-gray-400 line-clamp-1">{module.description}</div>}
                        </div>
                        {expandedPersonalModules[module.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                      </button>
                      <div className="flex items-center opacity-0 group-hover/module:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleAddLink(module.id, 'personal', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加链接"
                        >
                          <Link className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleAddFile(module.id, 'personal', e)}
                          className="p-1.5 hover:bg-gray-200 rounded text-gray-500"
                          title="添加文件"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteModule(module.id, 'personal', e)}
                          className="p-1.5 hover:bg-red-100 hover:text-red-500 rounded text-gray-400"
                          title="删除章节"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {expandedPersonalModules[module.id] && (
                      <div className="bg-gray-50/50 pb-2">
                        {/* Add Link Input */}
                        {addingLinkSection === 'personal' && addingLinkModuleId === module.id && (
                          <div className="px-3 py-2 bg-orange-50/30 border-b border-orange-100 mb-2">
                            <div className="space-y-2">
                              <input
                                autoFocus
                                type="text"
                                value={newLinkTitle}
                                onChange={(e) => setNewLinkTitle(e.target.value)}
                                placeholder="资源标题"
                                className="w-full text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                              />
                              <input
                                type="text"
                                value={newLinkUrl}
                                onChange={(e) => setNewLinkUrl(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                                placeholder="资源链接 URL"
                                className="w-full text-sm px-2 py-1 border border-orange-200 rounded focus:outline-none focus:border-orange-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setAddingLinkSection(null); setAddingLinkModuleId(null); }} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">取消</button>
                                <button onClick={confirmAddLink} className="text-xs bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600">添加</button>
                              </div>
                            </div>
                          </div>
                        )}

                        {module.items.length === 0 ? (
                          <div className="px-6 py-2 text-xs text-gray-400">暂无个人资源</div>
                        ) : (
                          module.items.map((item) => (
                            <div 
                              key={item.id}
                              onClick={() => onSelectItem('personal-resource', item.link)}
                              className="group/item px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors pl-6 text-gray-600 hover:bg-gray-100"
                            >
                              <div className="flex items-center gap-2 overflow-hidden flex-1">
                                {item.link.startsWith('http') ? (
                                  <Link className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                )}
                                <span className="text-sm truncate">{item.title}</span>
                              </div>
                              <button
                                onClick={(e) => handleDeleteItem(module.id, item.id, 'personal', e)}
                                className="opacity-0 group-hover/item:opacity-100 p-1 hover:text-red-500 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
