import React, { useState, useRef } from 'react';
import { X, Minus, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';

interface FloatingChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const FloatingChatWindow: React.FC<FloatingChatWindowProps> = ({ isOpen, onClose, title = 'AI 助手', children }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [size] = useState({ w: 400, h: 550 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  if (!isOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: position.x, startPosY: position.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPosition({
      x: dragRef.current.startPosX + (e.clientX - dragRef.current.startX),
      y: Math.max(0, dragRef.current.startPosY + (e.clientY - dragRef.current.startY)),
    });
  };
  const handlePointerUp = () => { dragRef.current = null; };

  const style: React.CSSProperties = isMaximized
    ? { position: 'fixed', inset: 0, zIndex: 9999 }
    : { position: 'fixed', left: position.x, top: position.y, width: size.w, height: isMinimized ? 'auto' : size.h, zIndex: 9999 };

  return (
    <div style={{ ...style, background: 'var(--t-bg-main)', borderColor: 'var(--t-border)', boxShadow: 'var(--t-shadow)' }} className={`flex flex-col rounded-xl border overflow-hidden ${isMaximized ? 'rounded-none' : ''}`}>
      {/* Title Bar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-move select-none shrink-0"
        style={{ background: 'var(--t-header-bg)', borderColor: 'var(--t-border)' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--t-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 rounded hover:bg-gray-200 transition-colors">
            <Minus className="w-3 h-3 text-gray-500" />
          </button>
          <button onClick={() => setIsMaximized(!isMaximized)} className="p-1 rounded hover:bg-gray-200 transition-colors">
            {isMaximized ? <Minimize2 className="w-3 h-3 text-gray-500" /> : <Maximize2 className="w-3 h-3 text-gray-500" />}
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-red-100 transition-colors">
            <X className="w-3 h-3 text-gray-500 hover:text-red-500" />
          </button>
        </div>
      </div>
      {/* Content */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
};
