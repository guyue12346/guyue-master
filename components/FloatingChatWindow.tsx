import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, SlidersHorizontal, X } from 'lucide-react';

interface FloatingChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const DEFAULT_SIZE = { width: 420, height: 520 };
const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;
const MAX_WIDTH = 840;
const MAX_HEIGHT = 960;
const SIZE_STORAGE_KEY = 'linkmaster_floating_chat_size';
const POSITION_STORAGE_KEY = 'linkmaster_floating_chat_position';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getViewportBounds = () => {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};

const clampSizeToViewport = (size: { width: number; height: number }, position: { x: number; y: number }) => {
  const { width, height } = getViewportBounds();
  const maxWidth = Math.max(MIN_WIDTH, width - position.x - 16);
  const maxHeight = Math.max(MIN_HEIGHT, height - position.y - 16);
  return {
    width: clamp(size.width, MIN_WIDTH, Math.min(maxWidth, MAX_WIDTH)),
    height: clamp(size.height, MIN_HEIGHT, Math.min(maxHeight, MAX_HEIGHT))
  };
};

const loadStoredSize = () => {
  if (typeof window === 'undefined') return DEFAULT_SIZE;
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return {
          width: clamp(parsed.width, MIN_WIDTH, MAX_WIDTH),
          height: clamp(parsed.height, MIN_HEIGHT, MAX_HEIGHT)
        };
      }
    }
  } catch (error) {
    console.warn('Failed to load floating chat size', error);
  }
  return DEFAULT_SIZE;
};

const clampPositionToViewport = (position: { x: number; y: number }, size: { width: number; height: number }) => {
  const { width, height } = getViewportBounds();
  const minX = 16;
  const minY = 16;
  const maxX = Math.max(width - size.width - 16, minX);
  const maxY = Math.max(height - size.height - 16, minY);
  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY)
  };
};

const loadStoredPosition = (size: { width: number; height: number }) => {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return clampPositionToViewport(parsed, size);
      }
    }
  } catch (error) {
    console.warn('Failed to load floating chat position', error);
  }

  const { width, height } = getViewportBounds();
  return clampPositionToViewport({
    x: width - size.width - 32,
    y: height - size.height - 80
  }, size);
};

export const FloatingChatWindow: React.FC<FloatingChatWindowProps> = ({
  isOpen,
  onClose,
  title = 'AI 助手',
  children
}) => {
  const initialSize = useMemo(() => loadStoredSize(), []);
  const [size, setSize] = useState(initialSize);
  const [position, setPosition] = useState(() => loadStoredPosition(initialSize));
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [isSizeEditorOpen, setIsSizeEditorOpen] = useState(false);
  const [sizeDraft, setSizeDraft] = useState(() => ({
    width: initialSize.width.toString(),
    height: initialSize.height.toString()
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
  }, [size]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    setSizeDraft({
      width: Math.round(size.width).toString(),
      height: Math.round(size.height).toString()
    });
  }, [size]);

  const clampPositionState = useCallback((next: { x: number; y: number }) => {
    return clampPositionToViewport(next, size);
  }, [size]);

  const handleDragMove = useCallback((event: MouseEvent) => {
    setPosition(() => {
      return clampPositionState({
        x: event.clientX - dragOffset.current.x,
        y: event.clientY - dragOffset.current.y,
      });
    });
  }, [clampPositionState]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  }, [handleDragMove]);

  const startDragging = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleHeaderMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    startDragging(event);
  };

  const handleWindowResize = useCallback(() => {
    const nextSize = clampSizeToViewport(size, position);
    const nextPosition = clampPositionToViewport(position, nextSize);
    setSize(nextSize);
    setPosition(nextPosition);
  }, [position, size]);

  useEffect(() => {
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleWindowResize]);

  const handleSizeDraftChange = (dimension: 'width' | 'height', value: string) => {
    setSizeDraft(prev => ({
      ...prev,
      [dimension]: value
    }));
  };

  const applySizeDraft = () => {
    const parsedWidth = parseInt(sizeDraft.width, 10);
    const parsedHeight = parseInt(sizeDraft.height, 10);
    const widthValue = clamp(Number.isFinite(parsedWidth) ? parsedWidth : size.width, MIN_WIDTH, MAX_WIDTH);
    const heightValue = clamp(Number.isFinite(parsedHeight) ? parsedHeight : size.height, MIN_HEIGHT, MAX_HEIGHT);
    const nextSize = clampSizeToViewport({ width: widthValue, height: heightValue }, position);
    setSize(nextSize);
    setIsSizeEditorOpen(false);
  };

  const closeSizeEditor = () => {
    setSizeDraft({
      width: Math.round(size.width).toString(),
      height: Math.round(size.height).toString()
    });
    setIsSizeEditorOpen(false);
  };

  const toggleSizeEditor = () => {
    setIsSizeEditorOpen(prev => {
      if (prev) {
        setSizeDraft({
          width: Math.round(size.width).toString(),
          height: Math.round(size.height).toString()
        });
      }
      return !prev;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] pointer-events-none">
      <div
        className={`absolute pointer-events-auto bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-3xl flex flex-col overflow-hidden transition-shadow relative ${
          isDragging ? 'cursor-grabbing ring-2 ring-blue-100' : 'cursor-default'
        }`}
        style={{
          width: size.width,
          height: size.height,
          left: position.x,
          top: position.y
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-gray-100 select-none cursor-grab"
          onMouseDown={handleHeaderMouseDown}
        >
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-inner">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-[11px] text-gray-400">小窗随行，记录同步</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSizeEditor}
              className="p-1.5 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="调节尺寸"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="关闭小窗"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-white">
          {children}
        </div>

        {isSizeEditorOpen && (
          <div className="absolute top-12 right-4 z-10 w-56 rounded-2xl border border-gray-200 bg-white shadow-xl p-4 text-sm">
            <p className="text-xs text-gray-500 mb-3">设置小窗尺寸（单位：px）</p>
            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                宽度
                <input
                  type="number"
                  min={MIN_WIDTH}
                  max={MAX_WIDTH}
                  value={sizeDraft.width}
                  onChange={(e) => handleSizeDraftChange('width', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applySizeDraft();
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-[11px] text-gray-400">范围：{MIN_WIDTH}-{MAX_WIDTH}</span>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                高度
                <input
                  type="number"
                  min={MIN_HEIGHT}
                  max={MAX_HEIGHT}
                  value={sizeDraft.height}
                  onChange={(e) => handleSizeDraftChange('height', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applySizeDraft();
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-[11px] text-gray-400">范围：{MIN_HEIGHT}-{MAX_HEIGHT}</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={closeSizeEditor}
                className="px-3 py-1.5 text-xs text-gray-500 rounded-lg hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={applySizeDraft}
                className="px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                应用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
