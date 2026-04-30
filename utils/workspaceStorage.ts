export const WORKSPACE_ROOT_DIR = '工作空间';
const PRIMARY_SECTION_DIR = '工作目录';
const CUSTOM_SECTION_DIR = '自定义目录';

export const sanitizeFileName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '_').trim();

const getWorkspaceRootPath = async (): Promise<string> => {
  const savedArchivePath = localStorage.getItem('linkmaster_archive_path');
  if (savedArchivePath) {
    try {
      const isValid = await window.electronAPI.ensureDir(savedArchivePath);
      if (isValid) {
        return await window.electronAPI.pathJoin(savedArchivePath, WORKSPACE_ROOT_DIR);
      }
    } catch (error) {
      console.error('Workspace archive path validation failed:', error);
    }
  }

  const userDataPath = await window.electronAPI.getUserDataPath();
  return await window.electronAPI.pathJoin(userDataPath, WORKSPACE_ROOT_DIR);
};

const getWorkspaceCategoryPath = async (categoryId: string): Promise<string> => {
  const rootPath = await getWorkspaceRootPath();
  return await window.electronAPI.pathJoin(rootPath, categoryId);
};

const getWorkspacePath = async (categoryId: string, workspaceId: string): Promise<string> => {
  const categoryPath = await getWorkspaceCategoryPath(categoryId);
  return await window.electronAPI.pathJoin(categoryPath, workspaceId);
};

const getWorkspaceSectionPath = async (
  categoryId: string,
  workspaceId: string,
  sectionId: string | null,
): Promise<string> => {
  const workspacePath = await getWorkspacePath(categoryId, workspaceId);
  if (!sectionId) {
    return await window.electronAPI.pathJoin(workspacePath, PRIMARY_SECTION_DIR);
  }
  return await window.electronAPI.pathJoin(workspacePath, CUSTOM_SECTION_DIR, sectionId);
};

export const getWorkspaceModulePath = async (
  categoryId: string,
  workspaceId: string,
  sectionId: string | null,
  moduleId: string,
): Promise<string> => {
  const sectionPath = await getWorkspaceSectionPath(categoryId, workspaceId, sectionId);
  return await window.electronAPI.pathJoin(sectionPath, moduleId);
};

export const createWorkspaceMarkdownFile = async (
  categoryId: string,
  workspaceId: string,
  sectionId: string | null,
  moduleId: string,
  fileName: string,
  content: string,
): Promise<string | null> => {
  try {
    const modulePath = await getWorkspaceModulePath(categoryId, workspaceId, sectionId, moduleId);
    const dirCreated = await window.electronAPI.ensureDir(modulePath);
    if (!dirCreated) return null;

    const normalizedName = sanitizeFileName(fileName).replace(/\.md$/i, '') + '.md';
    const filePath = await window.electronAPI.pathJoin(modulePath, normalizedName);
    const success = await window.electronAPI.writeFile(filePath, content);
    return success ? filePath : null;
  } catch (error) {
    console.error('Failed to create workspace markdown file:', error);
    return null;
  }
};

export const copyWorkspaceFileToModule = async (
  sourcePath: string,
  sourceName: string,
  categoryId: string,
  workspaceId: string,
  sectionId: string | null,
  moduleId: string,
): Promise<string | null> => {
  try {
    const modulePath = await getWorkspaceModulePath(categoryId, workspaceId, sectionId, moduleId);
    const dirCreated = await window.electronAPI.ensureDir(modulePath);
    if (!dirCreated) return null;

    const fileName = sanitizeFileName(sourceName) || sourceName;
    const destinationPath = await window.electronAPI.pathJoin(modulePath, fileName);
    const success = await window.electronAPI.copyFile(sourcePath, destinationPath);
    return success ? destinationPath : null;
  } catch (error) {
    console.error('Failed to copy workspace file:', error);
    return null;
  }
};
