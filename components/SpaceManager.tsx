import React, { Suspense, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const LearningManager = React.lazy(() => import('./LearningManager').then(m => ({ default: m.LearningManager })));
const WorkspaceManager = React.lazy(() => import('./WorkspaceManager').then(m => ({ default: m.WorkspaceManager })));

type SpaceView = 'learning' | 'workspace';

const STORAGE_KEY_APP_MODE = 'guyue_app_mode';
const STORAGE_KEY_SPACE_VIEW = 'guyue_space_view';

const normalizeSpaceView = (value: unknown): SpaceView => (value === 'workspace' ? 'workspace' : 'learning');

const getInitialSpaceView = (): SpaceView => {
  if (typeof window === 'undefined') return 'learning';

  try {
    const legacyMode = JSON.parse(localStorage.getItem(STORAGE_KEY_APP_MODE) || 'null');
    if (legacyMode === 'learning' || legacyMode === 'workspace') {
      return legacyMode;
    }
  } catch {
    // Ignore malformed legacy mode and fall through to the dedicated setting.
  }

  try {
    return normalizeSpaceView(JSON.parse(localStorage.getItem(STORAGE_KEY_SPACE_VIEW) || 'null'));
  } catch {
    return 'learning';
  }
};

export const SpaceManager: React.FC = () => {
  const [initialView] = useState<SpaceView>(() => getInitialSpaceView());
  const [activeView, setActiveView] = useState<SpaceView>(() => initialView);
  const [hasLearningMounted, setHasLearningMounted] = useState(() => initialView === 'learning');
  const [hasWorkspaceMounted, setHasWorkspaceMounted] = useState(() => initialView === 'workspace');
  const [learningInDetail, setLearningInDetail] = useState(false);
  const [workspaceInDetail, setWorkspaceInDetail] = useState(false);

  useEffect(() => {
    if (activeView === 'learning') setHasLearningMounted(true);
    if (activeView === 'workspace') setHasWorkspaceMounted(true);
    try {
      localStorage.setItem(STORAGE_KEY_SPACE_VIEW, JSON.stringify(activeView));
    } catch {
      // Persistence is optional; the active tab still works for the current session.
    }
  }, [activeView]);

  const shouldShowSwitcher = activeView === 'learning' ? !learningInDetail : !workspaceInDetail;

  return (
    <div className="relative h-full bg-white">
      {shouldShowSwitcher ? (
        <div className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center border-b border-slate-200 bg-white/95 px-2">
          {([
            ['learning', '学习'] as const,
            ['workspace', '工作'] as const,
          ]).map(([view, label]) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeView === view
                  ? 'border-blue-600 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <Suspense fallback={
        <div className="flex h-full items-center justify-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>加载空间模块中...</span>
        </div>
      }>
        {(hasLearningMounted || activeView === 'learning') && (
          <div className={activeView === 'learning' ? 'h-full' : 'hidden'}>
            <LearningManager onDetailStateChange={setLearningInDetail} />
          </div>
        )}

        {(hasWorkspaceMounted || activeView === 'workspace') && (
          <div className={activeView === 'workspace' ? 'h-full' : 'hidden'}>
            <WorkspaceManager onDetailStateChange={setWorkspaceInDetail} />
          </div>
        )}
      </Suspense>
    </div>
  );
};

export default SpaceManager;
