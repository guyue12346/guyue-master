/**
 * 学习模块存储工具
 * 
 * 目录结构:
 * 归档目录/
 * └── 学习模块/
 *     └── [学习方向名称]/           # 如：机器学习、计算机基础
 *         └── [课程名称]/           # 如：Docker容器化技术实战
 *             ├── 学习内容/
 *             │   └── [章节名称]/   # 如：Module 1: Docker 基础概念
 *             │       └── files...
 *             ├── 学习练习/
 *             │   └── [章节名称]/
 *             │       └── files...
 *             └── 其它资源/
 *                 └── [章节名称]/
 *                     └── files...
 */

// 目录名称常量
export const LEARNING_ROOT_DIR = '学习模块';
export const SECTION_NAMES = {
  resources: '学习内容',
  assignments: '学习练习',
  personal: '其它资源'
} as const;

// 旧的目录名称（仅迁移函数使用）
const LEGACY_SECTION_NAMES: Record<string, string> = {
  resources: '学习资源'
};

export type SectionType = keyof typeof SECTION_NAMES;

// 安全的目录名称（去除特殊字符，仅用于迁移阶段读取旧路径）
export const sanitizeName = (name: string): string => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
};

/**
 * Validate and auto-fix archive path
 * Performance & Reliability: Check if path exists, fallback to default if invalid
 */
export const validateArchivePath = async (path: string): Promise<boolean> => {
  try {
    // Try to ensure directory exists
    const exists = await window.electronAPI.ensureDir(path);
    return exists;
  } catch (error) {
    console.error('Archive path validation failed:', error);
    return false;
  }
};

/**
 * 获取学习模块根目录
 * Auto-fix: If saved path is invalid, fallback to default
 */
export const getLearningRootPath = async (): Promise<string> => {
  const savedArchivePath = localStorage.getItem('linkmaster_archive_path');
  
  // Validate saved path
  if (savedArchivePath) {
    const isValid = await validateArchivePath(savedArchivePath);
    if (!isValid) {
      console.warn('Saved archive path is invalid, falling back to default');
      // Clear invalid path
      localStorage.removeItem('linkmaster_archive_path');
    } else {
      return await window.electronAPI.pathJoin(savedArchivePath, LEARNING_ROOT_DIR);
    }
  }
  
  // Use default path
  const rootPath = await window.electronAPI.getUserDataPath();
  return await window.electronAPI.pathJoin(rootPath, LEARNING_ROOT_DIR);
};

/**
 * 获取学习方向目录路径（使用 categoryId 作为目录名，重命名不影响路径）
 */
export const getCategoryPath = async (categoryId: string): Promise<string> => {
  const learningRoot = await getLearningRootPath();
  return await window.electronAPI.pathJoin(learningRoot, categoryId);
};

/**
 * 获取课程目录路径（使用 courseId 作为目录名）
 */
export const getCoursePath = async (categoryId: string, courseId: string): Promise<string> => {
  const categoryPath = await getCategoryPath(categoryId);
  return await window.electronAPI.pathJoin(categoryPath, courseId);
};

/**
 * 获取资源类型目录路径（分区名称是固定常量，不会变化）
 */
export const getSectionPath = async (
  categoryId: string,
  courseId: string,
  section: SectionType
): Promise<string> => {
  const coursePath = await getCoursePath(categoryId, courseId);
  return await window.electronAPI.pathJoin(coursePath, SECTION_NAMES[section]);
};

/**
 * 获取章节目录路径（使用 moduleId 作为目录名，重命名不影响路径）
 */
export const getModulePath = async (
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string
): Promise<string> => {
  const sectionPath = await getSectionPath(categoryId, courseId, section);
  return await window.electronAPI.pathJoin(sectionPath, moduleId);
};

/**
 * 获取文件完整路径
 */
export const getFilePath = async (
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string,
  fileName: string
): Promise<string> => {
  const modulePath = await getModulePath(categoryId, courseId, section, moduleId);
  return await window.electronAPI.pathJoin(modulePath, fileName);
};

/**
 * 确保目录存在
 */
export const ensureDirectory = async (dirPath: string): Promise<boolean> => {
  return await window.electronAPI.ensureDir(dirPath);
};

/**
 * 删除目录及其所有内容
 */
export const deleteDirectory = async (dirPath: string): Promise<boolean> => {
  try {
    return await window.electronAPI.deleteDir(dirPath);
  } catch (error) {
    console.error('Failed to delete directory:', dirPath, error);
    return false;
  }
};

/**
 * 删除单个文件
 */
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    return await window.electronAPI.deleteFile(filePath);
  } catch (error) {
    console.error('Failed to delete file:', filePath, error);
    return false;
  }
};

/**
 * Performance Optimization 4: Batch file operations
 * Copy multiple files to destination in parallel
 */
export const copyFilesToDestination = async (
  files: Array<{
    sourcePath: string;
    fileName: string;
  }>,
  categoryName: string, 
  courseName: string, 
  section: SectionType, 
  moduleName: string
): Promise<Array<{ fileName: string; destPath: string | null }>> => {
  try {
    const modulePath = await getModulePath(categoryName, courseName, section, moduleName);
    await ensureDirectory(modulePath);
    
    // Use Promise.all for parallel processing
    const results = await Promise.all(
      files.map(async ({ sourcePath, fileName }) => {
        try {
          const destPath = await window.electronAPI.pathJoin(modulePath, fileName);
          const success = await window.electronAPI.copyFile(sourcePath, destPath);
          return { fileName, destPath: success ? destPath : null };
        } catch (error) {
          console.error(`Failed to copy ${fileName}:`, error);
          return { fileName, destPath: null };
        }
      })
    );
    
    return results;
  } catch (error) {
    console.error('Batch copy failed:', error);
    return files.map(f => ({ fileName: f.fileName, destPath: null }));
  }
};

/**
 * Copy single file to destination (kept for backward compatibility)
 */
export const copyFileToDestination = async (
  sourcePath: string,
  categoryName: string, 
  courseName: string, 
  section: SectionType, 
  moduleName: string,
  fileName: string
): Promise<string | null> => {
  try {
    const modulePath = await getModulePath(categoryName, courseName, section, moduleName);
    await ensureDirectory(modulePath);
    
    const destPath = await window.electronAPI.pathJoin(modulePath, fileName);
    const success = await window.electronAPI.copyFile(sourcePath, destPath);
    
    if (success) {
      return destPath;
    }
    return null;
  } catch (error) {
    console.error('Failed to copy file:', error);
    return null;
  }
};

/**
 * Performance: Cache for file list to avoid repeated filesystem reads
 */
const fileListCache = new Map<string, { files: any[]; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds cache

/**
 * Get files in a directory with caching
 * Performance Optimization: Lazy loading with cache
 */
export const getFilesInModule = async (
  categoryName: string,
  courseName: string,
  section: SectionType,
  moduleName: string,
  useCache: boolean = true
): Promise<Array<{ name: string; isDirectory: boolean; path: string }>> => {
  const modulePath = await getModulePath(categoryName, courseName, section, moduleName);
  const cacheKey = modulePath;
  
  // Check cache
  if (useCache && fileListCache.has(cacheKey)) {
    const cached = fileListCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.files;
    }
  }
  
  // Read from filesystem
  try {
    const files = await window.electronAPI.listDir(modulePath);
    
    // Update cache
    fileListCache.set(cacheKey, {
      files,
      timestamp: Date.now()
    });
    
    return files;
  } catch (error) {
    console.error('Failed to list files:', error);
    return [];
  }
};

/**
 * Clear cache for a specific module or all
 */
export const clearFileCache = (modulePath?: string) => {
  if (modulePath) {
    fileListCache.delete(modulePath);
  } else {
    fileListCache.clear();
  }
};

/**
 * 检查文件是否在学习模块目录内（用于判断是否需要删除本地文件）
 */
export const isFileInLearningModule = async (filePath: string): Promise<boolean> => {
  if (!filePath || !filePath.startsWith('/')) return false;
  const learningRoot = await getLearningRootPath();
  return filePath.startsWith(learningRoot);
};

/**
 * 删除学习方向及其所有内容
 */
export const deleteCategoryFolder = async (categoryName: string): Promise<boolean> => {
  const categoryPath = await getCategoryPath(categoryName);
  console.log('Deleting category folder:', categoryPath);
  return await deleteDirectory(categoryPath);
};

/**
 * 重命名学习方向文件夹
 * 同时返回路径映射，用于更新课程中的文件路径
 */
export const renameCategoryFolder = async (
  oldCategoryName: string,
  newCategoryName: string
): Promise<{ success: boolean; oldPath: string; newPath: string }> => {
  const oldPath = await getCategoryPath(oldCategoryName);
  const newPath = await getCategoryPath(newCategoryName);

  console.log('Renaming category folder:', oldPath, '->', newPath);

  try {
    // 尝试重命名
    const success = await window.electronAPI.renameFile(oldPath, newPath);
    if (!success) {
      // 文件夹可能不存在，尝试创建新文件夹
      console.log('Category folder rename failed, creating new folder');
      await ensureDirectory(newPath);
    }
    return { success: true, oldPath, newPath };
  } catch (error) {
    console.error('Failed to rename category folder:', error);
    return { success: false, oldPath, newPath };
  }
};

/**
 * 删除课程及其所有内容
 */
export const deleteCourseFolder = async (categoryName: string, courseName: string): Promise<boolean> => {
  const coursePath = await getCoursePath(categoryName, courseName);
  console.log('Deleting course folder:', coursePath);
  return await deleteDirectory(coursePath);
};

/**
 * 删除章节文件夹及其所有内容
 */
export const deleteModuleFolder = async (
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string
): Promise<boolean> => {
  const modulePath = await getModulePath(categoryId, courseId, section, moduleId);
  return await deleteDirectory(modulePath);
};

/**
 * 删除资源文件（如果在学习模块目录内）
 */
export const deleteResourceFile = async (filePath: string): Promise<boolean> => {
  if (!filePath || !filePath.startsWith('/')) {
    return true;
  }
  const isInModule = await isFileInLearningModule(filePath);
  if (!isInModule) return true;
  return await deleteFile(filePath);
};

// ==================== 一次性路径迁移（名称 → ID）====================

interface _CategoryRef { id: string; name: string; }
interface _ModuleRef { id: string; title: string; }
interface _CourseRef {
  id: string; title: string; categoryId: string;
  modules: Array<_ModuleRef & { lectures: Array<{ materials?: string; [k: string]: any }> }>;
  assignmentModules?: Array<_ModuleRef & { items: Array<{ link?: string; [k: string]: any }> }>;
  personalModules?: Array<_ModuleRef & { items: Array<{ link?: string; [k: string]: any }> }>;
  [key: string]: any;
}

/**
 * 将磁盘目录从「显示名称」命名迁移到「ID」命名（一次性，由 localStorage 标记控制）。
 * - 整体移动模块文件夹：[catName]/[courseName]/section/[modName]  →  [catId]/[courseId]/section/[modId]
 * - 同步更新 lecture.materials / item.link 中存储的绝对路径。
 */
export const migrateToIdBasedPaths = async (
  categories: _CategoryRef[],
  courses: _CourseRef[]
): Promise<_CourseRef[]> => {
  if (!window.electronAPI) return courses;
  const MIGRATION_KEY = 'learning_id_path_migration_v1';
  if (localStorage.getItem(MIGRATION_KEY)) return courses;

  const learningRoot = await getLearningRootPath();
  const updatedCourses: _CourseRef[] = JSON.parse(JSON.stringify(courses));
  let anyChanged = false;

  for (const course of updatedCourses) {
    const category = categories.find(c => c.id === course.categoryId);
    if (!category) continue;

    for (const sectionKey of ['resources', 'assignments', 'personal'] as SectionType[]) {
      const sectionName = SECTION_NAMES[sectionKey];
      const mods: _ModuleRef[] =
        sectionKey === 'resources' ? course.modules
        : sectionKey === 'assignments' ? (course.assignmentModules || [])
        : (course.personalModules || []);

      for (const mod of mods) {
        const oldModuleDir = await window.electronAPI.pathJoin(
          learningRoot, sanitizeName(category.name), sanitizeName(course.title), sectionName, sanitizeName(mod.title)
        );
        const newModuleDir = await window.electronAPI.pathJoin(
          learningRoot, category.id, course.id, sectionName, mod.id
        );

        const oldFiles = await window.electronAPI.listDir(oldModuleDir);
        if (oldFiles.length === 0) continue;

        const newFiles = await window.electronAPI.listDir(newModuleDir);
        if (newFiles.length > 0) continue; // 已迁移

        const newSectionDir = await window.electronAPI.pathJoin(learningRoot, category.id, course.id, sectionName);
        await window.electronAPI.ensureDir(newSectionDir);

        const moved = await window.electronAPI.renameFile(oldModuleDir, newModuleDir);
        if (!moved) {
          console.warn(`[Migration] 移动失败: ${oldModuleDir} -> ${newModuleDir}`);
          continue;
        }

        anyChanged = true;
        const updatePath = (p?: string) =>
          p?.startsWith(oldModuleDir) ? newModuleDir + p.slice(oldModuleDir.length) : p;

        if (sectionKey === 'resources') {
          course.modules = course.modules.map((m: any) =>
            m.id !== mod.id ? m : {
              ...m, lectures: m.lectures.map((l: any) => ({ ...l, materials: updatePath(l.materials) }))
            }
          );
        } else if (sectionKey === 'assignments') {
          course.assignmentModules = (course.assignmentModules || []).map((m: any) =>
            m.id !== mod.id ? m : {
              ...m, items: m.items.map((i: any) => ({ ...i, link: updatePath(i.link) }))
            }
          );
        } else {
          course.personalModules = (course.personalModules || []).map((m: any) =>
            m.id !== mod.id ? m : {
              ...m, items: m.items.map((i: any) => ({ ...i, link: updatePath(i.link) }))
            }
          );
        }
      }
    }
  }

  localStorage.setItem(MIGRATION_KEY, '1');
  console.log(`[Migration] ID路径迁移完成，${anyChanged ? '有数据变更已写入' : '无需变更'}`);
  return anyChanged ? updatedCourses : courses;
};
