import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
  customText?: string;
  minDuration?: number; // 最小显示时间（毫秒）
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ 
  onComplete, 
  customText = '有善始者实繁，能克终者盖寡',
  minDuration = 2500 
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
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="text-center px-8">
        {/* Logo or Icon */}
        <div className="mb-8 animate-pulse">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl flex items-center justify-center">
            <svg 
              className="w-12 h-12 text-white" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" 
              />
            </svg>
          </div>
        </div>

        {/* Custom Text */}
        <h1 className="text-2xl md:text-3xl font-serif text-gray-800 mb-4 animate-fade-in">
          {customText}
        </h1>

        {/* Loading Indicator */}
        <div className="flex justify-center items-center gap-2 mt-8">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
