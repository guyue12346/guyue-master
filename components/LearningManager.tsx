import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GraduationCap, Search, ExternalLink, Maximize2, Minimize2, PlayCircle, FileText, Columns, Square, MousePointerClick, MessageSquare, TerminalSquare, ChevronLeft, FolderOpen, Plus, Edit2, Trash2 } from 'lucide-react';
import { LearningList } from './LearningList';
import { CS336_DATA, DOCKER_DATA, GIT_DATA, CourseData, Lecture, COURSE_CATEGORIES, CourseCategory, migrateCourseData } from './LearningData';
import { MarkdownEditor } from './MarkdownEditor';
import { Terminal as TerminalComponent } from './Terminal';
import { MiniBrowser } from './MiniBrowser';
import { ConfirmDialog } from './ConfirmDialog';
import { MarkdownNote } from '../types';
import { LearningCategoryModal } from './LearningCategoryModal';
import { LearningCourseModal } from './LearningCourseModal';
import { deleteCategoryFolder, deleteCourseFolder, migrateToIdBasedPaths } from '../utils/learningStorage';
import { getCategoryIcon, colorMap } from './LearningConstants';

// All courses
const DEFAULT_COURSES: CourseData[] = [CS336_DATA, DOCKER_DATA, GIT_DATA];

const STORAGE_KEY_PROGRESS = 'learning_progress';
const STORAGE_KEY_COURSES = 'learning_courses_v1';

// #13: Confirm dialog state type
interface ConfirmState {
  title: string;
  message: string;
  onConfirm: () => void;
  variant?: 'danger' | 'default';
}

interface PaneContent {
  type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource' | 'terminal';
  id: string;
  url?: string;
  data?: any;
  origin?: 'course' | 'personal';
}

interface LearningManagerProps {
  onOpenChat?: () => void;
}

export const LearningManager: React.FC<LearningManagerProps> = ({ onOpenChat }) => {
  const [categories, setCategories] = useState<CourseCategory[]>(() => {
    const saved = localStorage.getItem('learning_categories_v1');
    return saved ? JSON.parse(saved) : COURSE_CATEGORIES;
  });

  const [courses, setCourses] = useState<CourseData[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_COURSES);
    const raw: CourseData[] = saved ? JSON.parse(saved) : DEFAULT_COURSES;
    // #2: Auto-migrate legacy data structures on load
    return raw.map(c => migrateCourseData(c));
  });

  // #13: Custom confirm dialog state
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    localStorage.setItem('learning_categories_v1', JSON.stringify(categories));
  }, [categories]);

  // #7: Debounced localStorage write for courses
  const courseSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (courseSaveTimerRef.current) clearTimeout(courseSaveTimerRef.current);
    courseSaveTimerRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(courses));
    }, 500);
    return () => { if (courseSaveTimerRef.current) clearTimeout(courseSaveTimerRef.current); };
  }, [courses]);

  // 一次性：将磁盘目录从名称命名迁移到 ID 命名
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current || !window.electronAPI) return;
    migrationDoneRef.current = true;
    migrateToIdBasedPaths(categories, courses).then(migratedCourses => {
      if (JSON.stringify(migratedCourses) !== JSON.stringify(courses)) {
        setCourses(migratedCourses as CourseData[]);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Modal States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CourseCategory | undefined>(undefined);

  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseData | undefined>(undefined);

  // 学习方向保存：磁盘文件夹用 categoryId 命名，改名只需更新显示名称
  const handleSaveCategory = (category: CourseCategory) => {
    if (editingCategory) {
      setCategories(prev => prev.map(c => c.id === category.id ? category : c));
    } else {
      setCategories(prev => [...prev, category]);
    }
    setEditingCategory(undefined);
  };

  const handleDeleteCategory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmState({
      title: '删除学习方向',
      message: '确定要删除该学习方向吗？这将同时删除该方向下的所有课程及其文件。',
      variant: 'danger',
      onConfirm: async () => {
        setCategories(prev => prev.filter(c => c.id !== id));
        setCourses(prev => prev.filter(c => c.categoryId !== id));
        if (selectedCategoryId === id) setSelectedCategoryId(null);
        await deleteCategoryFolder(id); // 用 ID 删除
        setConfirmState(null);
      },
    });
  };

  // 课程保存：磁盘文件夹用 courseId 命名，改名只需更新显示标题
  const handleSaveCourse = (courseData: Partial<CourseData>) => {
    if (editingCourse) {
      setCourses(prev => prev.map(c => c.id === courseData.id ? { ...c, ...courseData } as CourseData : c));
    } else {
      const newCourse: CourseData = {
        ...courseData,
        id: `course_${Date.now()}`,
        title: courseData.title!,
        description: courseData.description || '',
        categoryId: selectedCategoryId!,
        modules: [],
        assignments: [],
        introMarkdown: '# 学习总览\n\n在这里编写学习总览...',
      };
      setCourses(prev => [...prev, newCourse]);
    }
    setEditingCourse(undefined);
  };

  const handleDeleteCourse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const courseToDelete = courses.find(c => c.id === id);
    setConfirmState({
      title: '删除课程',
      message: `确定要删除「${courseToDelete?.title || ''}」吗？这将同时删除课程内的所有文件。`,
      variant: 'danger',
      onConfirm: async () => {
        setCourses(prev => prev.filter(c => c.id !== id));
        if (selectedCourseId === id) setSelectedCourseId(null);
        if (courseToDelete) {
          await deleteCourseFolder(courseToDelete.categoryId, courseToDelete.id); // 用 ID 删除
        }
        setConfirmState(null);
      },
    });
  };

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  
  // Split View State
  const [layoutMode, setLayoutMode] = useState<'single' | 'split'>('single');
  const [activePane, setActivePane] = useState<'primary' | 'secondary'>('primary');
  
  const [primaryContent, setPrimaryContent] = useState<PaneContent | null>(null);
  const [secondaryContent, setSecondaryContent] = useState<PaneContent | null>(null);
  
  const [isImmersive, setIsImmersive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Auto-open Intro when entering a course
  useEffect(() => {
    if (selectedCourseId) {
      setPrimaryContent({ type: 'intro', id: 'intro' });
      setSecondaryContent(null);
    }
  }, [selectedCourseId]);

  const [progress, setProgress] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROGRESS);
    return saved ? JSON.parse(saved) : {};
  });

  // Custom Note State
  const [currentNote, setCurrentNote] = useState<MarkdownNote | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progress));
  }, [progress]);

  const handleToggleProgress = (id: string) => {
    setProgress(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUpdateCourse = useCallback((updatedCourse: CourseData) => {
    setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
  }, []);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  
  // Get courses in selected category
  const coursesInCategory = useMemo(() => {
    if (!selectedCategoryId) return [];
    return courses
      .filter(c => c.categoryId === selectedCategoryId)
      .sort((a, b) => (a.priority || 50) - (b.priority || 50));
  }, [selectedCategoryId, courses]);

  // #10: Compute progress stats for selected course
  const courseProgress = useMemo(() => {
    if (!selectedCourse) return { completed: 0, total: 0, percent: 0 };
    let total = 0, completed = 0;
    selectedCourse.modules.forEach(m => {
      m.lectures.forEach(l => { total++; if (progress[l.id]) completed++; });
    });
    (selectedCourse.assignmentModules || []).forEach(m => {
      m.items.forEach(i => { total++; if (progress[i.id]) completed++; });
    });
    (selectedCourse.personalModules || []).forEach(m => {
      m.items.forEach(i => { total++; if (progress[i.id]) completed++; });
    });
    return { completed, total, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [selectedCourse, progress]);

  // Helper to find lecture by ID across modules
  const findLecture = (id: string): Lecture | undefined => {
    if (!selectedCourse) return undefined;
    for (const module of selectedCourse.modules) {
      const found = module.lectures.find(l => l.id === id);
      if (found) return found;
    }
    return undefined;
  };

  // #4: Extracted content loading helpers for strategy pattern
  const loadCustomNote = async (filePath: string, origin: 'course' | 'personal' = 'course'): Promise<PaneContent | null> => {
    if (!window.electronAPI) return null;
    const fileContent = await window.electronAPI.readFile(filePath);
    const noteData: MarkdownNote = {
      id: filePath,
      title: filePath.split('/').pop()?.replace('.md', '') || 'Untitled',
      content: fileContent || '',
      category: origin === 'personal' ? 'Personal Resource' : 'Course Note',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setCurrentNote(noteData);
    return { type: 'custom-note', id: filePath, data: noteData, origin };
  };

  const loadFileContent = async (link: string, origin: 'course' | 'personal' = 'course'): Promise<PaneContent | null> => {
    if (link.startsWith('http://') || link.startsWith('https://')) {
      return { type: 'personal-resource', id: link, url: link };
    }
    if (link.toLowerCase().endsWith('.md')) {
      return await loadCustomNote(link, origin);
    }
    return { type: 'personal-resource', id: link, url: `file://${link}` };
  };

  const handleSelectItem = async (type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource', id: string) => {
    let content: PaneContent | null = null;

    switch (type) {
      case 'intro':
        content = { type: 'intro', id: 'intro' };
        break;

      case 'custom-note':
        content = await loadCustomNote(id, 'course');
        break;

      case 'personal-resource':
        content = await loadFileContent(id, 'personal');
        break;

      case 'video': {
        const lecture = findLecture(id);
        content = lecture?.videoUrl
          ? { type: 'video', id, url: lecture.videoUrl }
          : { type: 'video', id };
        break;
      }

      case 'note': {
        const lecture = findLecture(id);
        if (!lecture) break;
        if (lecture.materials?.startsWith('/')) {
          content = await loadFileContent(lecture.materials, 'course');
        } else if (lecture.materials?.startsWith('http://') || lecture.materials?.startsWith('https://')) {
          content = { type: 'note', id, url: lecture.materials };
        } else {
          // Legacy GitHub path for CS336
          const resourceUrl = lecture.materials
            ? (lecture.materials.endsWith('.pdf')
                ? `https://github.com/stanford-cs336/spring2025-lectures/blob/main/nonexecutable/${encodeURIComponent(lecture.materials)}`
                : `https://github.com/stanford-cs336/spring2025-lectures/blob/main/${encodeURIComponent(lecture.materials)}`)
            : 'https://github.com/stanford-cs336/spring2025-lectures';
          content = { type: 'note', id, url: resourceUrl };
        }
        break;
      }

      case 'assignment': {
        const link = id;
        if (link.startsWith('http://') || link.startsWith('https://')) {
          content = { type: 'assignment', id: link, url: link };
        } else if (link.startsWith('/')) {
          content = await loadFileContent(link, 'course');
        } else {
          // Fallback: old assignments array
          const assignment = selectedCourse?.assignments.find(a => a.id === id);
          if (assignment) {
            if (assignment.link?.startsWith('/')) {
              content = await loadFileContent(assignment.link, 'course');
            } else {
              content = { type: 'assignment', id, url: assignment.link };
            }
          }
        }
        break;
      }
    }

    if (content) {
      if (activePane === 'primary') {
        setPrimaryContent(content);
      } else {
        setSecondaryContent(content);
      }
    }
  };

  const handleUpdateNote = async (id: string, updates: Partial<MarkdownNote>) => {
    if (window.electronAPI && updates.content !== undefined) {
      const success = await window.electronAPI.writeFile(id, updates.content);
      if (!success) {
        console.error('Failed to save file:', id);
        return;
      }
      // Update local state
      setCurrentNote(prev => prev ? { ...prev, ...updates } : null);

      // Also update the content in primaryContent/secondaryContent to keep them in sync
      const updatePaneContent = (content: PaneContent | null): PaneContent | null => {
        if (content && content.type === 'custom-note' && content.id === id && content.data) {
          return {
            ...content,
            data: { ...content.data, ...updates }
          };
        }
        return content;
      };

      setPrimaryContent(prev => updatePaneContent(prev));
      setSecondaryContent(prev => updatePaneContent(prev));
    }
  };

  // View 1: Category Selection
  if (!selectedCategoryId) {
    const sortedAndFilteredCategories = categories
      .filter(cat => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const coursesInCat = courses.filter(c => c.categoryId === cat.id);
        return cat.name.toLowerCase().includes(q) || 
               cat.description.toLowerCase().includes(q) ||
               coursesInCat.some(c => c.title.toLowerCase().includes(q));
      })
      .sort((a, b) => (a.priority || 50) - (b.priority || 50));

    return (
      <div className="flex flex-col h-full bg-white p-6">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                <GraduationCap className="w-8 h-8 text-blue-600" />
                学习空间
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
              </div>
              <button
                onClick={() => {
                  setEditingCategory(undefined);
                  setIsCategoryModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建方向
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedAndFilteredCategories.map(cat => {
              const IconComponent = getCategoryIcon(cat.icon);
              const colors = colorMap[cat.color] || colorMap.gray;
              const courseCount = courses.filter(c => c.categoryId === cat.id).length;

              return (
                <div key={cat.id} className="relative group">
                  <button
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`w-full h-full flex flex-col text-left bg-white border rounded-xl p-6 hover:shadow-lg transition-all duration-300`}
                    style={{ borderColor: colors.borderColor }}
                  >
                    <div 
                      className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                      style={{ backgroundColor: colors.bgColor }}
                    >
                      <IconComponent className="w-7 h-7" style={{ color: colors.textColor }} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">{cat.name}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 flex-1">{cat.description}</p>
                    <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                      {courseCount} 门课程
                    </div>
                  </button>
                  
                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory(cat);
                        setIsCategoryModalOpen(true);
                      }}
                      className="p-2 bg-white/80 backdrop-blur rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 border border-gray-200 shadow-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteCategory(cat.id, e)}
                      className="p-2 bg-white/80 backdrop-blur rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200 shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <LearningCategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSave={handleSaveCategory}
          initialData={editingCategory}
          isEditing={!!editingCategory}
        />
        <ConfirmDialog
          isOpen={!!confirmState}
          title={confirmState?.title || ''}
          message={confirmState?.message || ''}
          variant={confirmState?.variant}
          onConfirm={() => confirmState?.onConfirm()}
          onCancel={() => setConfirmState(null)}
        />
      </div>
    );
  }

  // View 2: Course Selection (within category)
  if (!selectedCourseId) {
    const filteredCourses = coursesInCategory.filter(c => 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const colors = colorMap[selectedCategory?.color || 'gray'] || colorMap.gray;
    const IconComponent = getCategoryIcon(selectedCategory?.icon || 'BookOpen');

    return (
      <div className="flex flex-col h-full bg-white p-6">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => { setSelectedCategoryId(null); setSearchQuery(''); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.bgColor }}>
                  <IconComponent className="w-5 h-5" style={{ color: colors.textColor }} />
                </div>
                {selectedCategory?.name}
              </h1>
              <p className="text-gray-500 mt-1">{selectedCategory?.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索课程..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
              </div>
              <button
                onClick={() => {
                  setEditingCourse(undefined);
                  setIsCourseModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                新建课程
              </button>
            </div>
          </div>

          {filteredCourses.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">该分类下暂无课程</p>
              <p className="text-sm mt-2">点击「新建课程」开始学习</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map(course => {
                // #10: per-course progress
                let total = 0, completed = 0;
                course.modules.forEach(m => m.lectures.forEach(l => { total++; if (progress[l.id]) completed++; }));
                (course.assignmentModules || []).forEach(m => m.items.forEach(i => { total++; if (progress[i.id]) completed++; }));
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                <div 
                  key={course.id} 
                  className="relative group cursor-pointer"
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  <div
                    className="w-full flex flex-col text-left bg-white border rounded-xl p-6 hover:shadow-lg transition-all duration-300 h-full"
                    style={{ borderColor: colors.borderColor }}
                  >
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: colors.bgColor }}
                    >
                      {React.createElement(getCategoryIcon(course.icon || 'GraduationCap'), { className: 'w-6 h-6', style: { color: colors.textColor } })}
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2 group-hover:text-gray-900 transition-colors">{course.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 flex-1">{course.description}</p>
                      {/* #10: Progress bar */}
                      {total > 0 && (
                        <div className="mt-3">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: colors.textColor }} />
                          </div>
                        </div>
                      )}
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 w-full">
                      <span>{course.modules.length} 个模块</span>
                      <span>{(course.assignmentModules || []).reduce((s, m) => s + m.items.length, 0)} 个练习</span>
                    </div>
                  </div>

                  <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCourse(course);
                        setIsCourseModalOpen(true);
                      }}
                      className="p-2 bg-white/80 backdrop-blur rounded-lg hover:bg-blue-50 text-gray-500 hover:text-blue-600 border border-gray-200 shadow-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteCourse(course.id, e)}
                      className="p-2 bg-white/80 backdrop-blur rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200 shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        <LearningCourseModal
          isOpen={isCourseModalOpen}
          onClose={() => setIsCourseModalOpen(false)}
          onSave={handleSaveCourse}
          initialData={editingCourse}
          categoryId={selectedCategoryId}
          isEditing={!!editingCourse}
        />
        <ConfirmDialog
          isOpen={!!confirmState}
          title={confirmState?.title || ''}
          message={confirmState?.message || ''}
          variant={confirmState?.variant}
          onConfirm={() => confirmState?.onConfirm()}
          onCancel={() => setConfirmState(null)}
        />
      </div>
    );
  }

  const renderContent = (content: PaneContent | null, paneId: 'primary' | 'secondary') => {
    if (!content) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
          <GraduationCap className="w-16 h-16 opacity-20 mb-4" />
          <p>请从左侧选择内容</p>
          <p className="text-sm mt-2 opacity-60">点击上方“选定”按钮以在此区域显示</p>
        </div>
      );
    }

    if (content.type === 'intro') {
      if (selectedCourse?.introMarkdown) {
        return (
          <MarkdownEditor 
            key={`intro-${selectedCourse.id}`}
            note={{
              id: selectedCourse.id,
              title: '学习总览',
              content: selectedCourse.introMarkdown,
              category: 'Intro',
              createdAt: 0,
              updatedAt: 0
            }} 
            onUpdate={(_id, updates) => {
              if (updates.content !== undefined) {
                setCourses(prev => prev.map(c => 
                  c.id === selectedCourse.id 
                    ? { ...c, introMarkdown: updates.content! } 
                    : c
                ));
              }
            }}
            isFullscreen={isImmersive}
            onToggleFullscreen={() => setIsImmersive(!isImmersive)}
            showViewToggle={false}
            viewMode="single"
            hideCategory={true}
            initialEditMode={false}
          />
        );
      }

      // #1: Generic empty intro template (replaces CS336 hardcoded content)
      return (
        <div className="p-8 overflow-y-auto h-full bg-white">
          <div className="max-w-3xl mx-auto text-center py-16">
            <GraduationCap className="w-20 h-20 mx-auto text-gray-200 mb-6" />
            <h2 className="text-2xl font-bold text-gray-700 mb-3">{selectedCourse?.title}</h2>
            <p className="text-gray-500 mb-8">{selectedCourse?.description}</p>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-900 mb-1">{selectedCourse?.modules.length}</div>
                <div className="text-sm text-gray-600">学习模块</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-900 mb-1">{(selectedCourse?.assignmentModules || []).reduce((s, m) => s + m.items.length, 0)}</div>
                <div className="text-sm text-gray-600">练习任务</div>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              点击左侧「学习总览」旁的编辑按钮，可以自定义本课程的介绍内容
            </p>
          </div>
        </div>
      );
    }

    if (content.type === 'terminal') {
      return (
        <div className="h-full w-full">
          <TerminalComponent 
            isVisible={true} 
            initialTitle="Learning Terminal"
          />
        </div>
      );
    }

    if (content.type === 'custom-note') {
      return (
        <MarkdownEditor 
          key={`note-${content.id}`}
          note={content.data} 
          onUpdate={handleUpdateNote}
          isFullscreen={isImmersive}
          onToggleFullscreen={() => setIsImmersive(!isImmersive)}
          showViewToggle={content.origin === 'personal'}
          viewMode="split"
          hideCategory={true}
          initialEditMode={false}
        />
      );
    }

    if (content.url) {
      return (
        <MiniBrowser 
          key={`browser-${content.url}`}
          url={content.url} 
          title={content.id} 
          onClose={() => {
            if (paneId === 'primary') setPrimaryContent(null);
            else setSecondaryContent(null);
          }} 
        />
      );
    }

    if (content.type === 'personal-resource') {
      // Fallback for personal resource if no URL (shouldn't happen if logic is correct)
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50">
          <FileText className="w-16 h-16 opacity-20 mb-4" />
          <p>无法预览此文件</p>
          <p className="text-sm mt-2 opacity-60">{content.id}</p>
        </div>
      );
    }

    // Fallback for video without URL
    if (content.type === 'video') {
      const lecture = findLecture(content.id);
      return (
        <div className="flex flex-col h-full bg-black text-white overflow-hidden relative group">
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 p-8 text-center">
            <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-900/50">
              <PlayCircle className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">{lecture?.title}</h2>
            <p className="text-gray-400 mb-8">{lecture?.lecturer} • {lecture?.date}</p>
            <p className="text-gray-500">暂无视频源</p>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-full bg-white overflow-hidden relative">
      {/* Left Sidebar: Course Content List */}
      {!isImmersive && (
        <div className="flex flex-col border-r border-gray-200 h-full w-80 flex-shrink-0 transition-all duration-300">
          <div className="h-12 flex items-center px-3 border-b border-gray-200 bg-gray-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <button 
              onClick={() => { setSelectedCourseId(null); setSearchQuery(''); }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="返回课程列表"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
          {selectedCourse ? (
            <LearningList 
              course={selectedCourse}
              categories={categories}
              selectedItemId={null} 
              activeVideoId={primaryContent?.type === 'video' ? primaryContent.id : (secondaryContent?.type === 'video' ? secondaryContent.id : null)}
              activeNoteId={primaryContent?.type === 'note' ? primaryContent.id : (secondaryContent?.type === 'note' ? secondaryContent.id : null)}
              activeCustomNotePath={primaryContent?.type === 'custom-note' ? primaryContent.id : (secondaryContent?.type === 'custom-note' ? secondaryContent.id : null)}
              onSelectItem={handleSelectItem}
              progress={progress}
              onToggleProgress={handleToggleProgress}
              onUpdateCourse={handleUpdateCourse}
            />
          ) : (
            <div className="p-4 text-gray-400 text-sm">
              加载课程中...
            </div>
          )}
        </div>
      )}

      {/* Toolbar - Split Screen Toggle (Bottom Left) */}
      <div className="absolute bottom-4 left-4 z-50 flex gap-2">
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="p-2 bg-white shadow-md rounded-lg text-indigo-600 hover:text-indigo-700 border border-indigo-100 transition-colors"
            title="AI 小窗"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}
        <button 
          onClick={() => {
            if (layoutMode === 'single') {
              setLayoutMode('split');
            } else {
              // When returning to single mode, keep the active pane's content
              if (activePane === 'secondary' && secondaryContent) {
                setPrimaryContent(secondaryContent);
              }
              setSecondaryContent(null);
              setActivePane('primary');
              setLayoutMode('single');
            }
          }}
          className="p-2 bg-white shadow-md rounded-lg text-gray-600 hover:text-blue-600 transition-colors"
          title={layoutMode === 'single' ? "开启分屏" : "关闭分屏"}
        >
          {layoutMode === 'single' ? <Columns className="w-5 h-5" /> : <Square className="w-5 h-5" />}
        </button>
        <button 
          onClick={() => {
            const terminalContent: PaneContent = { type: 'terminal', id: `term-${Date.now()}` };
            if (activePane === 'primary') setPrimaryContent(terminalContent);
            else setSecondaryContent(terminalContent);
          }}
          className="p-2 bg-white shadow-md rounded-lg text-gray-600 hover:text-blue-600 transition-colors"
          title="新建终端"
        >
          <TerminalSquare className="w-5 h-5" />
        </button>
      </div>

      {/* Fullscreen Button (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-50">
        <button 
          onClick={() => setIsImmersive(!isImmersive)}
          className="p-2 bg-white shadow-md rounded-lg text-gray-600 hover:text-blue-600 transition-colors"
          title={isImmersive ? "退出沉浸模式" : "进入沉浸模式"}
        >
          {isImmersive ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Split View Container */}
      <div className="flex-1 flex overflow-hidden">
          {/* Primary Pane */}
          <div className={`${layoutMode === 'split' ? 'w-1/2 border-r border-gray-200' : 'w-full'} h-full relative flex flex-col transition-all duration-300`}>
             {/* Selection Overlay/Button (Top Right) */}
             {layoutMode === 'split' && (
               <div className={`absolute top-2 right-2 z-40 transition-opacity ${activePane === 'primary' ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                 <button 
                   onClick={() => setActivePane('primary')}
                   className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm border transition-colors
                     ${activePane === 'primary' 
                       ? 'bg-blue-600 text-white border-blue-600' 
                       : 'bg-white/80 text-gray-600 border-gray-200 hover:bg-white'}
                   `}
                 >
                   <MousePointerClick className="w-3 h-3" />
                   {activePane === 'primary' ? '当前选定' : '点击选定'}
                 </button>
               </div>
             )}
             
             {/* Active Indicator Border */}
             <div className={`flex-1 relative overflow-hidden ${layoutMode === 'split' && activePane === 'primary' ? 'ring-2 ring-inset ring-blue-500/20' : ''}`}>
               {renderContent(primaryContent, 'primary')}
             </div>
          </div>

          {/* Secondary Pane */}
          {layoutMode === 'split' && (
            <div className="w-1/2 h-full relative flex flex-col transition-all duration-300">
               {/* Selection Overlay/Button (Top Right) */}
               <div className={`absolute top-2 right-2 z-40 transition-opacity ${activePane === 'secondary' ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
                 <button 
                   onClick={() => setActivePane('secondary')}
                   className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium shadow-sm backdrop-blur-sm border transition-colors
                     ${activePane === 'secondary' 
                       ? 'bg-blue-600 text-white border-blue-600' 
                       : 'bg-white/80 text-gray-600 border-gray-200 hover:bg-white'}
                   `}
                 >
                   <MousePointerClick className="w-3 h-3" />
                   {activePane === 'secondary' ? '当前选定' : '点击选定'}
                 </button>
               </div>

               {/* Active Indicator Border */}
               <div className={`flex-1 relative overflow-hidden ${activePane === 'secondary' ? 'ring-2 ring-inset ring-blue-500/20' : ''}`}>
                 {renderContent(secondaryContent, 'secondary')}
               </div>
            </div>
          )}
      </div>

      {/* #13: Custom Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        variant={confirmState?.variant}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};
