import React, { useState, useEffect, useRef } from 'react';
import { GraduationCap, Search, ArrowLeft, ArrowRight, RotateCw, ExternalLink, Maximize2, Minimize2, X, PlayCircle, FileText, Columns, Square, MousePointerClick, MessageSquare, TerminalSquare, ChevronLeft, Brain, Cpu, Server, Code, BookOpen, FolderOpen, Plus, MoreVertical, Edit2, Trash2, Wrench, Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc, Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network, FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star } from 'lucide-react';
import { LearningList } from './LearningList';
import { CS336_DATA, DOCKER_DATA, GIT_DATA, CourseData, Lecture, COURSE_CATEGORIES, CourseCategory } from './LearningData';
import { MarkdownEditor } from './MarkdownEditor';
import { Terminal as TerminalComponent } from './Terminal';
import { MarkdownNote } from '../types';
import { LearningCategoryModal } from './LearningCategoryModal';
import { LearningCourseModal } from './LearningCourseModal';
import { deleteCategoryFolder, deleteCourseFolder } from '../utils/learningStorage';

// All courses
const DEFAULT_COURSES: CourseData[] = [CS336_DATA, DOCKER_DATA, GIT_DATA];

const STORAGE_KEY_PROGRESS = 'learning_progress';
const STORAGE_KEY_DATA = 'learning_data_v1'; // Combined data storage
const STORAGE_KEY_COURSES = 'learning_courses_v1';

// Helper Component for Internal Browser
const MiniBrowser: React.FC<{ url: string; title?: string; onClose?: () => void }> = ({ url, title, onClose }) => {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<any>(null);

  // Reset state when url prop changes
  useEffect(() => {
    setCurrentUrl(url);
  }, [url]);

  const handleReload = () => {
    if (webviewRef.current) webviewRef.current.reload();
  };

  const handleGoBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) webviewRef.current.goBack();
  };

  const handleGoForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) webviewRef.current.goForward();
  };

  return (
    <div className="flex flex-col h-full bg-white relative border-b border-gray-200">
       {/* Toolbar */}
       <div className="h-10 border-b border-gray-200 flex items-center px-2 gap-2 bg-gray-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button 
              onClick={handleGoBack}
              disabled={!canGoBack}
              className={`p-1 rounded-md transition-colors ${canGoBack ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleGoForward}
              disabled={!canGoForward}
              className={`p-1 rounded-md transition-colors ${canGoForward ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReload}
              className="p-1 rounded-md hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-500 truncate font-mono" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {currentUrl}
          </div>

          <button 
            onClick={() => window.electronAPI?.openPath(currentUrl)}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-500 transition-colors\"
            title="在默认浏览器中打开"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          
          {onClose && (
             <button onClick={onClose} className="p-1 rounded-md hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors">
               <X className="w-4 h-4" />
             </button>
          )}
       </div>

       {/* Webview */}
       <div className="flex-1 relative bg-white">
          {/* 
            // @ts-ignore 
          */}
          <webview
            ref={(el: any) => {
              if (el) {
                webviewRef.current = el;
                if (!el.dataset.listenersAttached) {
                  el.dataset.listenersAttached = 'true';
                  el.addEventListener('did-start-loading', () => setIsLoading(true));
                  el.addEventListener('did-stop-loading', () => {
                    setIsLoading(false);
                    setCanGoBack(el.canGoBack());
                    setCanGoForward(el.canGoForward());
                    setCurrentUrl(el.getURL());
                  });
                  el.addEventListener('new-window', (e: any) => {
                    e.preventDefault();
                    el.loadURL(e.url);
                  });
                }
              }
            }}
            src={url}
            className="w-full h-full"
            // @ts-ignore
            allowpopups="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
       </div>
    </div>
  );
};
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
    return saved ? JSON.parse(saved) : DEFAULT_COURSES;
  });

  useEffect(() => {
    localStorage.setItem('learning_categories_v1', JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COURSES, JSON.stringify(courses));
  }, [courses]);

  // Modal States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CourseCategory | undefined>(undefined);

  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseData | undefined>(undefined);

  const handleSaveCategory = (category: CourseCategory) => {
    if (editingCategory) {
      setCategories(prev => prev.map(c => c.id === category.id ? category : c));
    } else {
      setCategories(prev => [...prev, category]);
    }
    setEditingCategory(undefined);
  };

  const handleDeleteCategory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除该学习方向吗？这将同时删除该方向下的所有课程及其文件。')) {
      // 获取要删除的分类名称
      const categoryToDelete = categories.find(c => c.id === id);
      
      // 先更新状态
      setCategories(prev => prev.filter(c => c.id !== id));
      setCourses(prev => prev.filter(c => c.categoryId !== id));
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      
      // 删除本地文件夹
      if (categoryToDelete) {
        await deleteCategoryFolder(categoryToDelete.name);
      }
    }
  };

  const handleSaveCourse = (courseData: Partial<CourseData>) => {
    if (editingCourse) {
      setCourses(prev => prev.map(c => c.id === courseData.id ? { ...c, ...courseData } as CourseData : c));
    } else {
      // Create new course with default structure
      const newCourse: CourseData = {
        ...courseData,
        id: `course_${Date.now()}`,
        title: courseData.title!,
        description: courseData.description || '',
        categoryId: selectedCategoryId!,
        modules: [],
        assignments: [],
        introMarkdown: '# 课程介绍\n\n在这里编写课程介绍...',
      };
      console.log('Creating new course:', newCourse);
      setCourses(prev => [...prev, newCourse]);
    }
    setEditingCourse(undefined);
  };

  const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除该课程吗？这将同时删除课程内的所有文件。')) {
      // 获取要删除的课程和分类信息
      const courseToDelete = courses.find(c => c.id === id);
      const category = courseToDelete ? categories.find(cat => cat.id === courseToDelete.categoryId) : null;
      
      // 先更新状态
      setCourses(prev => prev.filter(c => c.id !== id));
      if (selectedCourseId === id) setSelectedCourseId(null);
      
      // 删除本地文件夹
      if (courseToDelete && category) {
        await deleteCourseFolder(category.name, courseToDelete.title);
      }
    }
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

  const handleUpdateCourse = (updatedCourse: CourseData) => {
    setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c));
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  
  // Get courses in selected category
  const coursesInCategory = selectedCategoryId 
    ? courses
        .filter(c => c.categoryId === selectedCategoryId)
        .sort((a, b) => (a.priority || 50) - (b.priority || 50))
    : [];

  // Helper to get category icon component
  const getCategoryIcon = (iconName: string) => {
    const icons: Record<string, any> = { 
      Brain, Cpu, Server, Code, BookOpen, FolderOpen, GraduationCap, Wrench, 
      Globe, Database, Cloud, Terminal, Layout, Layers, Box, Circle, Disc,
      Rocket, Lightbulb, Target, Puzzle, Microscope, FlaskConical, Atom, Network,
      FileCode, GitBranch, Zap, Shield, Lock, Key, Monitor, Smartphone, Wifi, Radio, Sparkles, Star
    };
    return icons[iconName] || BookOpen;
  };

  // Helper to find lecture by ID across modules
  const findLecture = (id: string): Lecture | undefined => {
    if (!selectedCourse) return undefined;
    for (const module of selectedCourse.modules) {
      const found = module.lectures.find(l => l.id === id);
      if (found) return found;
    }
    return undefined;
  };

  const handleSelectItem = async (type: 'video' | 'note' | 'assignment' | 'intro' | 'custom-note' | 'personal-resource', id: string) => {
    let content: PaneContent | null = null;

    if (type === 'intro') {
      content = { type: 'intro', id: 'intro' };
    } else if (type === 'custom-note') {
      // Load note content
      if (window.electronAPI) {
        const fileContent = await window.electronAPI.readFile(id);
        const noteData: MarkdownNote = {
          id: id,
          title: id.split('/').pop()?.replace('.md', '') || 'Untitled',
          content: fileContent || '',
          category: 'My Notes',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setCurrentNote(noteData);
        content = { type: 'custom-note', id: id, data: noteData, origin: 'course' };
      }
    } else if (type === 'personal-resource') {
      // Handle Personal Resource - id is the link (URL or file path)
      const link = id;
      if (link.startsWith('http://') || link.startsWith('https://')) {
        // It's a URL, open in browser pane
        content = { type: 'personal-resource', id: link, url: link };
      } else if (link.toLowerCase().endsWith('.md')) {
        // Treat as markdown note
        if (window.electronAPI) {
          const fileContent = await window.electronAPI.readFile(link);
          const noteData: MarkdownNote = {
            id: link,
            title: link.split('/').pop()?.replace('.md', '') || 'Untitled',
            content: fileContent || '',
            category: 'Personal Resource',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          setCurrentNote(noteData);
          content = { type: 'custom-note', id: link, data: noteData, origin: 'personal' };
        }
      } else {
        // Treat as external file (PDF, etc)
        content = { type: 'personal-resource', id: link, url: `file://${link}` };
      }
    } else if (type === 'video') {
      const lecture = findLecture(id);
      if (lecture && lecture.videoUrl) {
        content = { type: 'video', id, url: lecture.videoUrl };
      } else if (lecture) {
        content = { type: 'video', id }; // No URL, show placeholder
      }
    } else if (type === 'note') {
      const lecture = findLecture(id);
      if (lecture) {
        // Check if it is a local absolute path (starts with /)
        const isLocal = lecture.materials && lecture.materials.startsWith('/');
        
        if (isLocal) {
           // It is a local file
           if (lecture.materials.toLowerCase().endsWith('.md')) {
             // Handle as markdown note
             if (window.electronAPI) {
                const fileContent = await window.electronAPI.readFile(lecture.materials);
                const noteData: MarkdownNote = {
                  id: lecture.materials,
                  title: lecture.title,
                  content: fileContent || '',
                  category: 'Course Note',
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                };
                setCurrentNote(noteData);
                content = { type: 'custom-note', id: lecture.materials, data: noteData, origin: 'course' };
             }
           } else {
             // Handle as external file (PDF, etc)
             content = { type: 'personal-resource', id: lecture.materials, url: `file://${lecture.materials}` };
           }
        } else if (lecture.materials && (lecture.materials.startsWith('http://') || lecture.materials.startsWith('https://'))) {
           // It is a direct URL
           content = { type: 'note', id, url: lecture.materials };
        } else {
           // Legacy GitHub logic
           const resourceUrl = lecture.materials 
            ? (lecture.materials.endsWith('.pdf') 
                ? `https://github.com/stanford-cs336/spring2025-lectures/blob/main/nonexecutable/${encodeURIComponent(lecture.materials)}`
                : `https://github.com/stanford-cs336/spring2025-lectures/blob/main/${encodeURIComponent(lecture.materials)}`)
            : 'https://github.com/stanford-cs336/spring2025-lectures';
           content = { type: 'note', id, url: resourceUrl };
        }
      }
    } else if (type === 'assignment') {
      // For new assignmentModules structure, id is the link (URL or file path)
      const link = id;
      
      if (link.startsWith('http://') || link.startsWith('https://')) {
        // It's a URL, open in browser pane
        content = { type: 'assignment', id: link, url: link };
      } else if (link.startsWith('/')) {
        // It is a local file path
        if (link.toLowerCase().endsWith('.md')) {
          // Handle as markdown note
          if (window.electronAPI) {
            const fileContent = await window.electronAPI.readFile(link);
            const noteData: MarkdownNote = {
              id: link,
              title: link.split('/').pop()?.replace('.md', '') || 'Untitled',
              content: fileContent || '',
              category: 'Course Assignment',
              createdAt: Date.now(),
              updatedAt: Date.now()
            };
            setCurrentNote(noteData);
            content = { type: 'custom-note', id: link, data: noteData, origin: 'course' };
          }
        } else {
          // Handle as external file (PDF, etc)
          content = { type: 'personal-resource', id: link, url: `file://${link}` };
        }
      } else {
        // Fallback: try old assignments array for backward compatibility
        const assignment = selectedCourse?.assignments.find(a => a.id === id);
        if (assignment) {
          const isLocal = assignment.link && assignment.link.startsWith('/');
          if (isLocal) {
            if (assignment.link.toLowerCase().endsWith('.md')) {
              if (window.electronAPI) {
                const fileContent = await window.electronAPI.readFile(assignment.link);
                const noteData: MarkdownNote = {
                  id: assignment.link,
                  title: assignment.title,
                  content: fileContent || '',
                  category: 'Course Assignment',
                  createdAt: Date.now(),
                  updatedAt: Date.now()
                };
                setCurrentNote(noteData);
                content = { type: 'custom-note', id: assignment.link, data: noteData, origin: 'course' };
              }
            } else {
              content = { type: 'personal-resource', id: assignment.link, url: `file://${assignment.link}` };
            }
          } else {
            content = { type: 'assignment', id, url: assignment.link };
          }
        }
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
      await window.electronAPI.writeFile(id, updates.content);
      // Update local state if needed
      setCurrentNote(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Color mapping for categories - using actual color values for dynamic colors
  const colorMap: Record<string, { bg: string; bgColor: string; text: string; textColor: string; border: string; borderColor: string; hoverBorderColor: string }> = {
    purple: { bg: 'bg-purple-50', bgColor: '#faf5ff', text: 'text-purple-600', textColor: '#9333ea', border: 'border-purple-200', borderColor: '#e9d5ff', hoverBorderColor: '#a855f7' },
    blue: { bg: 'bg-blue-50', bgColor: '#eff6ff', text: 'text-blue-600', textColor: '#2563eb', border: 'border-blue-200', borderColor: '#bfdbfe', hoverBorderColor: '#3b82f6' },
    green: { bg: 'bg-green-50', bgColor: '#f0fdf4', text: 'text-green-600', textColor: '#16a34a', border: 'border-green-200', borderColor: '#bbf7d0', hoverBorderColor: '#22c55e' },
    orange: { bg: 'bg-orange-50', bgColor: '#fff7ed', text: 'text-orange-600', textColor: '#ea580c', border: 'border-orange-200', borderColor: '#fed7aa', hoverBorderColor: '#f97316' },
    cyan: { bg: 'bg-cyan-50', bgColor: '#ecfeff', text: 'text-cyan-600', textColor: '#0891b2', border: 'border-cyan-200', borderColor: '#a5f3fc', hoverBorderColor: '#06b6d4' },
    gray: { bg: 'bg-gray-50', bgColor: '#f9fafb', text: 'text-gray-600', textColor: '#4b5563', border: 'border-gray-200', borderColor: '#e5e7eb', hoverBorderColor: '#6b7280' },
    red: { bg: 'bg-red-50', bgColor: '#fef2f2', text: 'text-red-600', textColor: '#dc2626', border: 'border-red-200', borderColor: '#fecaca', hoverBorderColor: '#ef4444' },
    yellow: { bg: 'bg-yellow-50', bgColor: '#fefce8', text: 'text-yellow-600', textColor: '#ca8a04', border: 'border-yellow-200', borderColor: '#fef08a', hoverBorderColor: '#eab308' },
    pink: { bg: 'bg-pink-50', bgColor: '#fdf2f8', text: 'text-pink-600', textColor: '#db2777', border: 'border-pink-200', borderColor: '#fbcfe8', hoverBorderColor: '#ec4899' },
    indigo: { bg: 'bg-indigo-50', bgColor: '#eef2ff', text: 'text-indigo-600', textColor: '#4f46e5', border: 'border-indigo-200', borderColor: '#c7d2fe', hoverBorderColor: '#6366f1' },
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
                学习中心
              </h1>
              <p className="text-gray-500 mt-1">选择一个学习方向</p>
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
      </div>
    );
  }

  // View 2: Course Selection (within category)
  if (!selectedCourseId) {
    const filteredCourses = coursesInCategory.filter(c => 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    console.log('View 2 - coursesInCategory:', coursesInCategory);
    console.log('View 2 - filteredCourses:', filteredCourses);
    console.log('View 2 - selectedCategoryId:', selectedCategoryId);

    const colors = colorMap[selectedCategory?.color || 'gray'] || colorMap.gray;
    const IconComponent = getCategoryIcon(selectedCategory?.icon || 'BookOpen');

    return (
      <div className="flex flex-col h-full bg-white p-6">
        <div className="max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <button
                onClick={() => { setSelectedCategoryId(null); setSearchQuery(''); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors mb-2"
              >
                <ChevronLeft className="w-4 h-4" />
                返回
              </button>
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
              <p className="text-sm mt-2">敬请期待更多内容</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map(course => (
                <div 
                  key={course.id} 
                  className="relative group cursor-pointer"
                  onClick={() => {
                    console.log('=== CLICK EVENT ===');
                    console.log('Clicking course:', course.id, course.title);
                    console.log('All courses:', courses.map(c => ({ id: c.id, title: c.title })));
                    console.log('Setting selectedCourseId to:', course.id);
                    setSelectedCourseId(course.id);
                  }}
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
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 w-full">
                      <span>{course.modules.length} 个模块</span>
                      <span>{course.assignments.length} 个作业</span>
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
              ))}
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
            note={{
              id: selectedCourse.id,
              title: '课程介绍',
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

      return (
        <div className="p-8 overflow-y-auto h-full bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8 border-b border-gray-100 pb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">{selectedCourse?.title}</h1>
              <p className="text-xl text-gray-600 leading-relaxed mb-6">
                Language models serve as the cornerstone of modern natural language processing (NLP) applications and open up a new paradigm of having a single general purpose system address a range of downstream tasks.
              </p>
              <div className="flex flex-wrap gap-4">
                <a 
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath('https://stanford-cs336.github.io/spring2025/'); }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  访问课程主页
                </a>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">
                  <GraduationCap className="w-4 h-4" />
                  Instructors: Tatsunori Hashimoto, Percy Liang
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 bg-blue-50 rounded-xl border border-blue-100">
                <h3 className="text-lg font-bold text-blue-900 mb-2">Course Content</h3>
                <p className="text-blue-800/80 text-sm leading-relaxed">
                  This course is designed to provide students with a comprehensive understanding of language models by walking them through the entire process of developing their own. We will lead students through every aspect of language model creation, including data collection, model construction, training, and evaluation.
                </p>
              </div>
              <div className="p-6 bg-purple-50 rounded-xl border border-purple-100">
                <h3 className="text-lg font-bold text-purple-900 mb-2">Logistics</h3>
                <ul className="space-y-2 text-sm text-purple-800/80">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold min-w-[4rem]">Lectures:</span>
                    <span>Tuesday/Thursday 3:00-4:20pm</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold min-w-[4rem]">Location:</span>
                    <span>NVIDIA Auditorium</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-900 mb-1">{selectedCourse?.modules.length}</div>
                <div className="text-sm text-gray-600">Course Modules</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-900 mb-1">{selectedCourse?.assignments.length}</div>
                <div className="text-sm text-gray-600">Assignments</div>
              </div>
            </div>

            <div className="mt-10 space-y-8">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">核心资源入口 (Quick Links)</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li>
                    <span className="font-semibold">Course GitHub Organization:</span>{' '}
                    <a href="https://github.com/stanford-cs336" className="text-blue-600 hover:underline" onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath('https://github.com/stanford-cs336'); }}>
                      github.com/stanford-cs336
                    </a>
                    <span className="text-gray-500">（所有作业和课件的根目录）</span>
                  </li>
                  <li>
                    <span className="font-semibold">Lectures Repo:</span>{' '}
                    <a href="https://github.com/stanford-cs336/spring2025-lectures" className="text-blue-600 hover:underline" onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath('https://github.com/stanford-cs336/spring2025-lectures'); }}>
                      spring2025-lectures
                    </a>
                    <span className="text-gray-500">（包含所有的 .py 和 .pdf 课件）</span>
                  </li>
                  <li>
                    <span className="font-semibold">YouTube Playlist:</span>{' '}
                    <a href="https://www.youtube.com/playlist?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_" className="text-blue-600 hover:underline" onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath('https://www.youtube.com/playlist?list=PLoROMvodv4rOY23Y0BoGoBGgQ1zmU_MT_'); }}>
                      Spring 2025 Lecture Videos
                    </a>
                    <span className="text-gray-500">（官方录播视频）</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">详细课程表与资源下载 (Schedule with Links)</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-left text-gray-600 border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Topic</th>
                        <th className="px-3 py-2">Course Materials</th>
                        <th className="px-3 py-2">Assignments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {[
                        { id: '1', date: 'Apr 1', topic: 'Overview, Tokenization', material: { label: 'lecture_01.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_01.py' }, assignment: { title: 'Assignment 1: Basics', code: 'https://github.com/stanford-cs336/assignment1-basics', leaderboard: 'https://github.com/stanford-cs336/assignment1-basics-leaderboard' } },
                        { id: '2', date: 'Apr 3', topic: 'PyTorch, Resource Accounting', material: { label: 'lecture_02.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_02.py' } },
                        { id: '3', date: 'Apr 8', topic: 'Architectures', material: { label: 'lecture_03.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' } },
                        { id: '4', date: 'Apr 10', topic: 'Mixture of Experts (MoE)', material: { label: 'lecture_04.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' } },
                        { id: '5', date: 'Apr 15', topic: 'GPUs', material: { label: 'lecture_05.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' }, assignment: { title: 'Assignment 2: Systems', code: 'https://github.com/stanford-cs336/assignment2-systems', leaderboard: 'https://github.com/stanford-cs336/assignment2-systems-leaderboard' } },
                        { id: '6', date: 'Apr 17', topic: 'Kernels, Triton', material: { label: 'lecture_06.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_06.py' } },
                        { id: '7', date: 'Apr 22', topic: 'Parallelism 1', material: { label: 'lecture_07.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' } },
                        { id: '8', date: 'Apr 24', topic: 'Parallelism 2', material: { label: 'lecture_08.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_08.py' } },
                        { id: '9', date: 'Apr 29', topic: 'Scaling Laws 1', material: { label: 'lecture_09.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' }, assignment: { title: 'Assignment 3: Scaling', code: 'https://github.com/stanford-cs336/assignment3-scaling' } },
                        { id: '10', date: 'May 1', topic: 'Inference', material: { label: 'lecture_10.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_10.py' } },
                        { id: '11', date: 'May 6', topic: 'Scaling Laws 2', material: { label: 'lecture_11.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' }, assignment: { title: 'Assignment 4: Data', code: 'https://github.com/stanford-cs336/assignment4-data' } },
                        { id: '12', date: 'May 8', topic: 'Evaluation', material: { label: 'lecture_12.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_12.py' } },
                        { id: '13', date: 'May 13', topic: 'Data (Pre-training)', material: { label: 'lecture_13.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_13.py' } },
                        { id: '14', date: 'May 15', topic: 'Data (Filtering)', material: { label: 'lecture_14.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_14.py' } },
                        { id: '15', date: 'May 20', topic: 'Alignment (SFT)', material: { label: 'lecture_15.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' }, assignment: { title: 'Assignment 5: Alignment', code: 'https://github.com/stanford-cs336/assignment5-alignment' } },
                        { id: '16', date: 'May 22', topic: 'Alignment (RL)', material: { label: 'lecture_16.pdf', url: 'https://github.com/stanford-cs336/spring2025-lectures/tree/main/nonexecutable' } },
                        { id: '17', date: 'May 27', topic: 'Alignment (DPO)', material: { label: 'lecture_17.py', url: 'https://github.com/stanford-cs336/spring2025-lectures/blob/main/lecture_17.py' } }
                      ].map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="px-3 py-2 font-semibold text-gray-900">{row.id}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{row.topic}</td>
                          <td className="px-3 py-2">
                            <a
                              href={row.material.url}
                              className="text-blue-600 hover:underline"
                              onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath(row.material.url); }}
                            >
                              {row.material.label}
                            </a>
                          </td>
                          <td className="px-3 py-2 space-y-1">
                            {row.assignment ? (
                              <div>
                                <div className="font-medium text-gray-800">{row.assignment.title}</div>
                                <div className="text-xs text-blue-600 space-x-2">
                                  <a href={row.assignment.code} onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath(row.assignment.code); }} className="hover:underline">[Code]</a>
                                  {row.assignment.leaderboard && (
                                    <a href={row.assignment.leaderboard} onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath(row.assignment.leaderboard); }} className="hover:underline">[Leaderboard]</a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">如何使用这些资源？</h3>
                <ol className="space-y-4 text-sm text-gray-700 list-decimal list-inside">
                  <li className="space-y-1">
                    <span className="font-semibold text-gray-900">课件 (.py / .pdf)</span>
                    <ul className="ml-5 mt-1 space-y-1 text-gray-600 list-disc">
                      <li>访问 <a className="text-blue-600 hover:underline" href="https://github.com/stanford-cs336/spring2025-lectures" onClick={(e) => { e.preventDefault(); window.electronAPI?.openPath('https://github.com/stanford-cs336/spring2025-lectures'); }}>spring2025-lectures</a> 仓库</li>
                      <li>.py 文件位于根目录；.pdf 文件在 <code className="px-1 py-0.5 bg-gray-100 rounded">nonexecutable</code> 文件夹内</li>
                    </ul>
                  </li>
                  <li className="space-y-1">
                    <span className="font-semibold text-gray-900">练习 (Exercises)</span>
                    <ul className="ml-5 mt-1 space-y-1 text-gray-600 list-disc">
                      <li>每个练习都是独立仓库，点击 [Code] 访问</li>
                      <li>按仓库中的 README（通常使用 conda 或 uv）完成环境配置</li>
                      <li>练习说明文档通常在 README 或附带的 writeup.pdf 中</li>
                    </ul>
                  </li>
                  <li className="space-y-1">
                    <span className="font-semibold text-gray-900">排行榜 (Leaderboard)</span>
                    <ul className="ml-5 mt-1 space-y-1 text-gray-600 list-disc">
                      <li>专用仓库展示匿名提交成绩，可用作性能参考</li>
                      <li>关注最新提交，给自己的实现设定目标</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </div>
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
          <div className="h-12 flex items-center px-4 border-b border-gray-200 bg-gray-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <button 
              onClick={() => { setSelectedCourseId(null); setSearchQuery(''); }}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <ArrowLeft className="w-4 h-4" />
              返回
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
    </div>
  );
};
