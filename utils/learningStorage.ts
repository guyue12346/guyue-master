/**
 * 学习模块存储工具
 * 
 * 目录结构:
 * 归档目录/
 * └── 学习模块/
 *     └── [学习方向名称]/           # 如：机器学习、计算机基础
 *         └── [课程名称]/           # 如：Docker容器化技术实战
 *             ├── 课程资源/
 *             │   └── [章节名称]/   # 如：Module 1: Docker 基础概念
 *             │       └── files...
 *             ├── 课程练习/
 *             │   └── [章节名称]/
 *             │       └── files...
 *             └── 个人资源/
 *                 └── [章节名称]/
 *                     └── files...
 */

// 目录名称常量
export const LEARNING_ROOT_DIR = '学习模块';
export const SECTION_NAMES = {
  resources: '课程资源',
  assignments: '课程练习',
  personal: '个人资源'
} as const;

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
 * 获取资源类型目录路径（课程资源/课程练习/个人资源）
 */
export const getSectionPath = async (
  categoryName: string, 
  courseName: string, 
  section: SectionType
): Promise<string> => {
  const coursePath = await getCoursePath(categoryName, courseName);
  return await window.electronAPI.pathJoin(coursePath, SECTION_NAMES[section]);
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
