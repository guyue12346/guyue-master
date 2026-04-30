/**
 * 学习模块存储工具
 *
 * 当前目录结构已经统一为 ID 路径，显示名称与磁盘路径解耦：
 * 归档目录/
 * └── 学习模块/
 *     └── [categoryId]/
 *         └── [courseId]/
 *             ├── 学习内容/
 *             │   └── [moduleId]/
 *             │       └── files...
 *             ├── 学习练习/
 *             │   └── [moduleId]/
 *             │       └── files...
 *             └── 其它资源/
 *                 └── [moduleId]/
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
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string
): Promise<Array<{ fileName: string; destPath: string | null }>> => {
  try {
    const modulePath = await getModulePath(categoryId, courseId, section, moduleId);
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
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string,
  fileName: string
): Promise<string | null> => {
  try {
    const modulePath = await getModulePath(categoryId, courseId, section, moduleId);
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
  categoryId: string,
  courseId: string,
  section: SectionType,
  moduleId: string,
  useCache: boolean = true
): Promise<Array<{ name: string; isDirectory: boolean; path: string }>> => {
  const modulePath = await getModulePath(categoryId, courseId, section, moduleId);
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
export const deleteCategoryFolder = async (categoryId: string): Promise<boolean> => {
  const categoryPath = await getCategoryPath(categoryId);
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

// ==================== 课程包导入导出 ====================

/** 课程包格式版本 */
const COURSE_PACK_VERSION = 1;

/** 内嵌文件项 */
interface PackFile {
  /** 相对路径：section/moduleId/filename */
  relativePath: string;
  /** base64 编码的文件内容 */
  contentBase64: string;
}

/** 课程包结构 */
export interface CoursePack {
  version: number;
  exportedAt: string;
  category: {
    id: string;
    name: string;
    icon: string;
    description: string;
    color: string;
    priority?: number;
  };
  course: any; // CourseData (使用 any 避免循环引用问题)
  progress: Record<string, boolean>;
  files: PackFile[];
}

/**
 * 导出课程包：收集课程 JSON 数据 + 磁盘上的笔记/资源文件（base64 内嵌）
 */
export const exportCoursePack = async (
  course: any,
  category: { id: string; name: string; icon: string; description: string; color: string; priority?: number },
  progress: Record<string, boolean>
): Promise<CoursePack> => {
  // 收集所有讲义/资源的 ID，过滤出与本课程相关的进度
  const relevantIds = new Set<string>();
  (course.modules || []).forEach((m: any) => (m.lectures || []).forEach((l: any) => relevantIds.add(l.id)));
  (course.assignmentModules || []).forEach((m: any) => (m.items || []).forEach((i: any) => relevantIds.add(i.id)));
  (course.personalModules || []).forEach((m: any) => (m.items || []).forEach((i: any) => relevantIds.add(i.id)));
  (course.customSections || []).forEach((s: any) => (s.modules || []).forEach((m: any) => (m.items || []).forEach((i: any) => relevantIds.add(i.id))));

  const courseProgress: Record<string, boolean> = {};
  for (const id of relevantIds) {
    if (progress[id]) courseProgress[id] = true;
  }

  // 收集磁盘文件
  const files: PackFile[] = [];
  const sections: Array<{ key: SectionType; modules: any[] }> = [
    { key: 'resources', modules: course.modules || [] },
    { key: 'assignments', modules: course.assignmentModules || [] },
    { key: 'personal', modules: course.personalModules || [] },
  ];

  for (const { key, modules } of sections) {
    for (const mod of modules) {
      try {
        const dirFiles = await getFilesInModule(category.id, course.id, key, mod.id, false);
        for (const f of dirFiles) {
          if (f.isDirectory) continue;
          try {
            const base64 = await window.electronAPI.readFileBase64(f.path);
            files.push({
              relativePath: `${SECTION_NAMES[key]}/${mod.id}/${f.name}`,
              contentBase64: base64,
            });
          } catch { /* 文件读取失败跳过 */ }
        }
      } catch { /* 目录不存在跳过 */ }
    }
  }

  // customSections 的文件存在 personal 目录下（使用 section id 作为命名空间）
  for (const section of (course.customSections || [])) {
    for (const mod of (section.modules || [])) {
      try {
        const dirFiles = await getFilesInModule(category.id, course.id, 'personal', mod.id, false);
        for (const f of dirFiles) {
          if (f.isDirectory) continue;
          try {
            const base64 = await window.electronAPI.readFileBase64(f.path);
            files.push({
              relativePath: `custom_${section.id}/${mod.id}/${f.name}`,
              contentBase64: base64,
            });
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  }

  // 清理课程数据中的绝对路径，改为相对路径
  const cleanCourse = JSON.parse(JSON.stringify(course));
  const stripAbsPath = (p?: string) => {
    if (!p || !p.startsWith('/')) return p;
    // 只保留文件名
    return p.split('/').pop() || p;
  };
  (cleanCourse.modules || []).forEach((m: any) =>
    (m.lectures || []).forEach((l: any) => { l.materials = stripAbsPath(l.materials); })
  );
  (cleanCourse.assignmentModules || []).forEach((m: any) =>
    (m.items || []).forEach((i: any) => { i.link = stripAbsPath(i.link); })
  );
  (cleanCourse.personalModules || []).forEach((m: any) =>
    (m.items || []).forEach((i: any) => { i.link = stripAbsPath(i.link); })
  );
  (cleanCourse.customSections || []).forEach((s: any) =>
    (s.modules || []).forEach((m: any) =>
      (m.items || []).forEach((i: any) => { i.link = stripAbsPath(i.link); })
    )
  );
  // 移除废弃字段
  delete cleanCourse.assignments;
  delete cleanCourse.personalResources;

  return {
    version: COURSE_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    category,
    course: cleanCourse,
    progress: courseProgress,
    files,
  };
};

/**
 * 导入课程包：还原课程数据 + 写入磁盘文件
 * 返回新生成的 course 对象和 category 信息
 */
export const importCoursePack = async (
  pack: CoursePack,
  existingCategories: Array<{ id: string; name: string }>,
): Promise<{
  course: any;
  category: CoursePack['category'];
  progress: Record<string, boolean>;
  isNewCategory: boolean;
}> => {
  // 生成新 ID，避免与已有数据冲突
  const newCourseId = `course_${Date.now()}`;
  const course = JSON.parse(JSON.stringify(pack.course));
  const oldCourseId = course.id;
  course.id = newCourseId;

  // 检查分类是否已存在
  const existingCat = existingCategories.find(c => c.name === pack.category.name);
  const categoryId = existingCat?.id || pack.category.id;
  const isNewCategory = !existingCat;
  course.categoryId = categoryId;

  // ID 映射（旧 ID → 新 ID），避免进度/引用冲突
  const idMap = new Map<string, string>();
  const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const remapModules = (modules: any[], prefix: string) => {
    return modules.map((m: any) => {
      const newModId = genId(prefix);
      idMap.set(m.id, newModId);
      return { ...m, id: newModId };
    });
  };

  // 重映射所有 module/lecture/item 的 ID
  course.modules = (course.modules || []).map((m: any) => {
    const newModId = genId('mod');
    idMap.set(m.id, newModId);
    return {
      ...m,
      id: newModId,
      lectures: (m.lectures || []).map((l: any) => {
        const newId = genId('lec');
        idMap.set(l.id, newId);
        return { ...l, id: newId };
      }),
    };
  });

  course.assignmentModules = (course.assignmentModules || []).map((m: any) => {
    const newModId = genId('amod');
    idMap.set(m.id, newModId);
    return {
      ...m,
      id: newModId,
      items: (m.items || []).map((i: any) => {
        const newId = genId('ai');
        idMap.set(i.id, newId);
        return { ...i, id: newId };
      }),
    };
  });

  course.personalModules = (course.personalModules || []).map((m: any) => {
    const newModId = genId('pmod');
    idMap.set(m.id, newModId);
    return {
      ...m,
      id: newModId,
      items: (m.items || []).map((i: any) => {
        const newId = genId('pi');
        idMap.set(i.id, newId);
        return { ...i, id: newId };
      }),
    };
  });

  course.customSections = (course.customSections || []).map((s: any) => {
    const newSectionId = genId('csec');
    idMap.set(s.id, newSectionId);
    return {
      ...s,
      id: newSectionId,
      modules: (s.modules || []).map((m: any) => {
        const newModId = genId('cm');
        idMap.set(m.id, newModId);
        return {
          ...m,
          id: newModId,
          items: (m.items || []).map((i: any) => {
            const newId = genId('ci');
            idMap.set(i.id, newId);
            return { ...i, id: newId };
          }),
        };
      }),
    };
  });

  // 重映射进度
  const newProgress: Record<string, boolean> = {};
  for (const [oldId, val] of Object.entries(pack.progress || {})) {
    const newId = idMap.get(oldId);
    if (newId && val) newProgress[newId] = true;
  }

  // 写入磁盘文件
  for (const file of pack.files) {
    const parts = file.relativePath.split('/');
    if (parts.length < 3) continue;

    const [sectionOrCustom, oldModId, ...fileNameParts] = parts;
    const fileName = fileNameParts.join('/');
    const newModId = idMap.get(oldModId) || oldModId;

    let destDir: string;
    if (sectionOrCustom.startsWith('custom_')) {
      // 自定义分区文件 → personal 目录下
      destDir = await getModulePath(categoryId, newCourseId, 'personal', newModId);
    } else {
      // 标准分区
      const sectionKey = Object.entries(SECTION_NAMES).find(([_, v]) => v === sectionOrCustom)?.[0] as SectionType | undefined;
      if (!sectionKey) continue;
      destDir = await getModulePath(categoryId, newCourseId, sectionKey, newModId);
    }

    await ensureDirectory(destDir);
    const destPath = await window.electronAPI.pathJoin(destDir, fileName);

    // 将 base64 内容写入文件
    try {
      // base64 → UTF-8 文本，对于非文本文件可能需要特殊处理
      const content = atob(file.contentBase64);
      await window.electronAPI.writeFile(destPath, content);

      // 更新 lecture.materials / item.link 为新的绝对路径
      updatePathInCourse(course, oldModId, newModId, fileName, destPath);
    } catch (e) {
      console.warn(`[Import] 写入文件失败: ${file.relativePath}`, e);
    }
  }

  // 确保废弃字段初始化
  if (!course.assignments) course.assignments = [];

  return { course, category: { ...pack.category, id: categoryId }, progress: newProgress, isNewCategory };
};

/** 更新课程数据中的文件路径引用 */
function updatePathInCourse(course: any, oldModId: string, newModId: string, fileName: string, destPath: string) {
  const update = (items: any[], field: string) => {
    for (const item of items) {
      if (item[field] === fileName || (item[field] && item[field].endsWith('/' + fileName))) {
        item[field] = destPath;
      }
    }
  };

  for (const m of (course.modules || [])) {
    if (m.id === newModId) update(m.lectures || [], 'materials');
  }
  for (const m of (course.assignmentModules || [])) {
    if (m.id === newModId) update(m.items || [], 'link');
  }
  for (const m of (course.personalModules || [])) {
    if (m.id === newModId) update(m.items || [], 'link');
  }
  for (const s of (course.customSections || [])) {
    for (const m of (s.modules || [])) {
      if (m.id === newModId) update(m.items || [], 'link');
    }
  }
}
