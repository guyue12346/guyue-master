import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  customText?: string;
  minDuration?: number; // 最小显示时间（毫秒）
  theme?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ 
  onComplete, 
  customText = '有善始者实繁，能克终者盖寡',
  minDuration = 2500,
  theme = 'default',
}) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // 确保至少显示 minDuration 毫秒
    const timer = setTimeout(() => {
      setFadeOut(true);
      // 等待淡出动画完成后调用 onComplete
      setTimeout(onComplete, 800);
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration, onComplete]);

  return (
    <div 
      data-theme={theme}
      className={`theme-app-shell fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center px-8">
        {/* Logo or Icon */}
        <div className="mb-8 animate-pulse">
          <div className="theme-logo-mark w-24 h-24 mx-auto rounded-[30px]">
            <div className="theme-logo-glyph text-lg">
              <span>古</span>
              <span>月</span>
            </div>
          </div>
        </div>

        {/* Custom Text */}
        <h1 className="text-2xl md:text-3xl mb-4 animate-fade-in" style={{ color: 'var(--t-text)', fontFamily: 'var(--t-logo-font)' }}>
          {customText}
        </h1>
        <p className="text-sm tracking-[0.24em] uppercase" style={{ color: 'var(--t-text-muted)' }}>
          Guyue Master
        </p>

        {/* Loading Indicator */}
        <div className="flex justify-center items-center gap-2 mt-8">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', background: 'var(--t-accent)' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', background: 'var(--t-help-dot)' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', background: 'var(--t-list-active-text)' }}></div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
      `}</style>
    </div>
  );
};
