import React, { useEffect, useRef, useState } from 'react';
import { X, Minus, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';

interface FloatingChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  allowMaximize?: boolean;
  children: React.ReactNode;
}

export const FloatingChatWindow: React.FC<FloatingChatWindowProps> = ({ isOpen, onClose, title = 'AI 助手', allowMaximize = true, children }) => {
  const minWidth = 360;
  const minHeight = 420;
  const windowMargin = 12;
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: Math.max(windowMargin, window.innerWidth - 420),
    y: 80,
  }));
  const [size, setSize] = useState({ w: 400, h: 550 });
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

  const clampPosition = (nextX: number, nextY: number, width = size.w, height = size.h) => ({
    x: Math.min(Math.max(windowMargin, nextX), Math.max(windowMargin, window.innerWidth - width - windowMargin)),
    y: Math.min(Math.max(windowMargin, nextY), Math.max(windowMargin, window.innerHeight - height - windowMargin)),
  });

  const clampSize = (nextWidth: number, nextHeight: number) => ({
    w: Math.min(Math.max(minWidth, nextWidth), Math.max(minWidth, window.innerWidth - position.x - windowMargin)),
    h: Math.min(Math.max(minHeight, nextHeight), Math.max(minHeight, window.innerHeight - position.y - windowMargin)),
  });

  useEffect(() => {
    const handleWindowResize = () => {
      if (isMaximized) return;
      setSize(prev => clampSize(prev.w, prev.h));
      setPosition(prev => clampPosition(prev.x, prev.y));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [isMaximized, position.x, position.y, size.h, size.w]);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMaximized || isResizing) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: position.x, startPosY: position.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPosition(
      clampPosition(
        dragRef.current.startPosX + (e.clientX - dragRef.current.startX),
        dragRef.current.startPosY + (e.clientY - dragRef.current.startY),
      )
    );
  };
  const handlePointerUp = () => { dragRef.current = null; };
  const stopTitleBarDrag = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: size.w,
      startHeight: size.h,
    };
    setIsResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizeRef.current) return;
      setSize(
        clampSize(
          resizeRef.current.startWidth + (moveEvent.clientX - resizeRef.current.startX),
          resizeRef.current.startHeight + (moveEvent.clientY - resizeRef.current.startY),
        )
      );
    };

    const handlePointerUp = () => {
      resizeRef.current = null;
      setIsResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const style: React.CSSProperties = isMaximized
    ? { position: 'fixed', inset: 0, zIndex: 9999 }
    : { position: 'fixed', left: position.x, top: position.y, width: size.w, height: isMinimized ? 'auto' : size.h, zIndex: 9999 };

  return (
    <div style={style} className={`theme-surface relative flex flex-col overflow-hidden ${isMaximized ? '!rounded-none' : ''}`}>
      {/* Title Bar */}
      <div
        className={`theme-header-bar flex items-center justify-between px-3 py-2 select-none shrink-0 ${isMaximized ? '' : 'cursor-move'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{title}</span>
        </div>
        <div className="flex items-center gap-1" onPointerDown={stopTitleBarDrag}>
          <button
            type="button"
            onPointerDown={stopTitleBarDrag}
            onClick={() => setIsMinimized(!isMinimized)}
            className="theme-icon-btn h-6 w-6 rounded-md"
          >
            <Minus className="w-3 h-3" />
          </button>
          {allowMaximize && (
            <button
              type="button"
              onPointerDown={stopTitleBarDrag}
              onClick={() => setIsMaximized(!isMaximized)}
              className="theme-icon-btn h-6 w-6 rounded-md"
            >
              {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          )}
          <button
            type="button"
            onPointerDown={stopTitleBarDrag}
            onClick={onClose}
            className="theme-icon-btn theme-icon-btn-danger h-6 w-6 rounded-md"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {/* Content */}
      {!isMinimized && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      )}
      {!isMinimized && !isMaximized && (
        <button
          type="button"
          onPointerDown={handleResizePointerDown}
          className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-end justify-end rounded-md text-gray-300 transition-colors hover:text-gray-500 cursor-se-resize"
          title="拖拽调整大小"
        >
          <span className="pointer-events-none mb-0.5 mr-0.5 block h-2.5 w-2.5 border-b-2 border-r-2 border-current opacity-70" />
        </button>
      )}
    </div>
  );
};
