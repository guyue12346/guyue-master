import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

const LeetCodeManager = React.lazy(() => import('./LeetCodeManager').then(m => ({ default: m.LeetCodeManager })));
const CodingPracticeManager = React.lazy(() => import('./CodingPracticeManager').then(m => ({ default: m.CodingPracticeManager })));

type PracticeView = 'leetcode' | 'coding';

const STORAGE_KEY_APP_MODE = 'guyue_app_mode';
const STORAGE_KEY_PRACTICE_VIEW = 'guyue_practice_view';

interface PracticeManagerProps {
  onCreateNote?: () => void;
  onOpenChat?: () => void;
}

const normalizePracticeView = (value: unknown): PracticeView => (value === 'coding' || value === 'coding-practice' ? 'coding' : 'leetcode');

const getInitialPracticeView = (): PracticeView => {
  if (typeof window === 'undefined') return 'leetcode';

  try {
    const legacyMode = JSON.parse(localStorage.getItem(STORAGE_KEY_APP_MODE) || 'null');
    if (legacyMode === 'coding-practice') return 'coding';
    if (legacyMode === 'leetcode') return 'leetcode';
  } catch {
    // Ignore malformed legacy mode and fall through to the dedicated setting.
  }

  try {
    return normalizePracticeView(JSON.parse(localStorage.getItem(STORAGE_KEY_PRACTICE_VIEW) || 'null'));
  } catch {
    return 'leetcode';
  }
};

export const PracticeManager: React.FC<PracticeManagerProps> = ({ onCreateNote, onOpenChat }) => {
  const [initialView] = useState<PracticeView>(() => getInitialPracticeView());
  const [activeView, setActiveView] = useState<PracticeView>(() => initialView);
  const [hasLeetCodeMounted, setHasLeetCodeMounted] = useState(() => initialView === 'leetcode');
  const [hasCodingMounted, setHasCodingMounted] = useState(() => initialView === 'coding');

  useEffect(() => {
    if (activeView === 'leetcode') setHasLeetCodeMounted(true);
    if (activeView === 'coding') setHasCodingMounted(true);
    try {
      localStorage.setItem(STORAGE_KEY_PRACTICE_VIEW, JSON.stringify(activeView));
    } catch {
      // Persistence is optional; the active tab still works for the current session.
    }
  }, [activeView]);

  const switchControl = useMemo(() => (
    <div className="flex items-center border border-slate-200 bg-white text-xs">
      {([
        ['leetcode', '题单'] as const,
        ['coding', 'Code'] as const,
      ]).map(([view, label]) => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          className={`px-3 py-1.5 transition-colors ${
            activeView === view
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  ), [activeView]);

  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>加载刷题模块中...</span>
      </div>
    }>
      {(hasLeetCodeMounted || activeView === 'leetcode') && (
        <div className={activeView === 'leetcode' ? 'h-full' : 'hidden'}>
          <LeetCodeManager
            onCreateNote={onCreateNote}
            onOpenChat={onOpenChat}
            toolbarSlot={switchControl}
          />
        </div>
      )}

      {(hasCodingMounted || activeView === 'coding') && (
        <div className={activeView === 'coding' ? 'flex h-full flex-col bg-white' : 'hidden'}>
          <div
            className="flex h-12 shrink-0 items-center justify-center border-b px-4"
            style={{ WebkitAppRegion: 'drag', background: 'var(--t-header-bg)', borderColor: 'var(--t-border)' } as React.CSSProperties}
          >
            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {switchControl}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CodingPracticeManager />
          </div>
        </div>
      )}
    </Suspense>
  );
};

export default PracticeManager;
