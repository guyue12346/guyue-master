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

// 旧的目录名称（用于迁移）
const LEGACY_SECTION_NAMES: Record<string, string> = {
  resources: '学习资源'
};

export type SectionType = keyof typeof SECTION_NAMES;

// 安全的目录名称（去除特殊字符）
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
 * 获取学习方向目录路径
 */
export const getCategoryPath = async (categoryName: string): Promise<string> => {
  const learningRoot = await getLearningRootPath();
  return await window.electronAPI.pathJoin(learningRoot, sanitizeName(categoryName));
};

/**
 * 获取课程目录路径
 */
export const getCoursePath = async (categoryName: string, courseName: string): Promise<string> => {
  const categoryPath = await getCategoryPath(categoryName);
  return await window.electronAPI.pathJoin(categoryPath, sanitizeName(courseName));
};

/**
 * 迁移旧的目录名称到新名称
 * 例如：将"学习资源"迁移到"学习内容"
 */
export const migrateLegacySectionFolder = async (
  categoryName: string,
  courseName: string,
  section: SectionType
): Promise<boolean> => {
  const legacyName = LEGACY_SECTION_NAMES[section];
  if (!legacyName) return false; // 没有需要迁移的旧名称

  try {
    const coursePath = await getCoursePath(categoryName, courseName);
    const legacyPath = await window.electronAPI.pathJoin(coursePath, legacyName);
    const newPath = await window.electronAPI.pathJoin(coursePath, SECTION_NAMES[section]);

    // 检查旧文件夹是否存在
    const legacyFiles = await window.electronAPI.listDir(legacyPath);
    if (legacyFiles.length === 0) {
      // 旧文件夹不存在或为空，不需要迁移
      return false;
    }

    // 检查新文件夹是否存在
    const newFiles = await window.electronAPI.listDir(newPath);

    if (newFiles.length === 0) {
      // 新文件夹不存在，直接重命名旧文件夹
      console.log(`Migrating folder: ${legacyPath} -> ${newPath}`);
      const success = await window.electronAPI.renameFile(legacyPath, newPath);
      if (success) {
        console.log('Migration successful');
        return true;
      }
    } else {
      // 两个文件夹都存在，需要合并（移动旧文件夹的内容到新文件夹）
      console.log(`Both folders exist, merging: ${legacyPath} -> ${newPath}`);
      for (const file of legacyFiles) {
        const oldPath = file.path;
        const newFilePath = await window.electronAPI.pathJoin(newPath, file.name);
        // 检查目标是否已存在
        try {
          await window.electronAPI.renameFile(oldPath, newFilePath);
          console.log(`Moved: ${file.name}`);
        } catch (e) {
          console.warn(`Failed to move ${file.name}, may already exist`);
        }
      }
      // 尝试删除空的旧文件夹
      try {
        await window.electronAPI.deleteDir(legacyPath);
        console.log(`Deleted legacy folder: ${legacyPath}`);
      } catch (e) {
        console.warn('Failed to delete legacy folder');
      }
      return true;
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }
  return false;
};

/**
 * 获取资源类型目录路径（学习内容/学习练习/其它资源）
 * 会自动迁移旧的目录名称
 */
export const getSectionPath = async (
  categoryName: string,
  courseName: string,
  section: SectionType
): Promise<string> => {
  const coursePath = await getCoursePath(categoryName, courseName);
  const sectionPath = await window.electronAPI.pathJoin(coursePath, SECTION_NAMES[section]);

  // 尝试迁移旧的目录（只在首次访问时执行）
  if (LEGACY_SECTION_NAMES[section]) {
    const migrationKey = `migrated_${categoryName}_${courseName}_${section}`;
    if (!sessionStorage.getItem(migrationKey)) {
      sessionStorage.setItem(migrationKey, 'true');
      await migrateLegacySectionFolder(categoryName, courseName, section);
    }
  }

  return sectionPath;
};

/**
 * 获取章节目录路径
 */
export const getModulePath = async (
  categoryName: string, 
  courseName: string, 
  section: SectionType, 
  moduleName: string
): Promise<string> => {
  const sectionPath = await getSectionPath(categoryName, courseName, section);
  return await window.electronAPI.pathJoin(sectionPath, sanitizeName(moduleName));
};

/**
 * 获取文件完整路径
 */
export const getFilePath = async (
  categoryName: string, 
  courseName: string, 
  section: SectionType, 
  moduleName: string,
  fileName: string
): Promise<string> => {
  const modulePath = await getModulePath(categoryName, courseName, section, moduleName);
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
 * 重命名课程文件夹
 * 同时返回路径映射，用于更新模块中的文件路径
 */
export const renameCourseFolder = async (
  categoryName: string,
  oldCourseName: string,
  newCourseName: string
): Promise<{ success: boolean; oldPath: string; newPath: string }> => {
  const oldPath = await getCoursePath(categoryName, oldCourseName);
  const newPath = await getCoursePath(categoryName, newCourseName);

  console.log('Renaming course folder:', oldPath, '->', newPath);

  try {
    // 尝试重命名
    const success = await window.electronAPI.renameFile(oldPath, newPath);
    if (!success) {
      // 文件夹可能不存在，尝试创建新文件夹
      console.log('Course folder rename failed, creating new folder');
      await ensureDirectory(newPath);
    }
    return { success: true, oldPath, newPath };
  } catch (error) {
    console.error('Failed to rename course folder:', error);
    return { success: false, oldPath, newPath };
  }
};

/**
 * 删除章节文件夹及其所有内容
 */
export const deleteModuleFolder = async (
  categoryName: string, 
  courseName: string, 
  section: SectionType, 
  moduleName: string
): Promise<boolean> => {
  const modulePath = await getModulePath(categoryName, courseName, section, moduleName);
  console.log('Deleting module folder:', modulePath);
  return await deleteDirectory(modulePath);
};

/**
 * 删除资源文件（如果在学习模块目录内）
 */
export const deleteResourceFile = async (filePath: string): Promise<boolean> => {
  if (!filePath || !filePath.startsWith('/')) {
    // 不是本地文件路径（可能是URL），不需要删除
    return true;
  }
  
  const isInModule = await isFileInLearningModule(filePath);
  if (!isInModule) {
    // 文件不在学习模块目录内，不删除（可能是外部引用）
    console.log('File is not in learning module, skipping delete:', filePath);
    return true;
  }
  
  console.log('Deleting resource file:', filePath);
  return await deleteFile(filePath);
};
