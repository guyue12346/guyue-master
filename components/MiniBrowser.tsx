import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, X } from 'lucide-react';

interface MiniBrowserProps {
  url: string;
  title?: string;
  onClose?: () => void;
}

export const MiniBrowser: React.FC<MiniBrowserProps> = ({ url, title, onClose }) => {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<any>(null);

  // Reset state when url prop changes
  useEffect(() => {
    setCurrentUrl(url);
  }, [url]);

  const handleReload = () => {
    if (webviewRef.current) webviewRef.current.reload();
  };

  const handleGoBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) webviewRef.current.goBack();
  };

  const handleGoForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) webviewRef.current.goForward();
  };

  return (
    <div className="flex flex-col h-full bg-white relative border-b border-gray-200">
       {/* Toolbar */}
       <div className="h-10 border-b border-gray-200 flex items-center px-2 gap-2 bg-gray-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button 
              onClick={handleGoBack}
              disabled={!canGoBack}
              className={`p-1 rounded-md transition-colors ${canGoBack ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleGoForward}
              disabled={!canGoForward}
              className={`p-1 rounded-md transition-colors ${canGoForward ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReload}
              className="p-1 rounded-md hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-500 truncate font-mono" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {currentUrl}
          </div>

          <button 
            onClick={() => window.electronAPI?.openPath(currentUrl)}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
            title="在默认浏览器中打开"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          
          {onClose && (
             <button onClick={onClose} className="p-1 rounded-md hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors">
               <X className="w-4 h-4" />
             </button>
          )}
       </div>

       {/* Webview */}
       <div className="flex-1 relative bg-white">
          {/* 
            // @ts-ignore 
          */}
          <webview
            ref={(el: any) => {
              if (el) {
                webviewRef.current = el;
                if (!el.dataset.listenersAttached) {
                  el.dataset.listenersAttached = 'true';
                  el.addEventListener('did-start-loading', () => setIsLoading(true));
                  el.addEventListener('did-stop-loading', () => {
                    setIsLoading(false);
                    setCanGoBack(el.canGoBack());
                    setCanGoForward(el.canGoForward());
                    setCurrentUrl(el.getURL());
                  });
                  el.addEventListener('new-window', (e: any) => {
                    e.preventDefault();
                    el.loadURL(e.url);
                  });
                }
              }
            }}
            src={url}
            className="w-full h-full"
            // @ts-ignore
            allowpopups="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
       </div>
    </div>
  );
};
