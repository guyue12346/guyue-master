import React, { useRef, useState, useEffect } from 'react';
import { RotateCw, ArrowLeft, ArrowRight } from 'lucide-react';

interface PluginContainerProps {
  entryPath: string;
  pluginId: string;
}

export const PluginContainer: React.FC<PluginContainerProps> = ({ entryPath, pluginId }) => {
  const webviewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Construct file URL
  // entryPath is absolute path to index.html
  const src = `file://${entryPath}`;

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
    <div className="flex flex-col h-full bg-white">
      {/* Optional Toolbar for Plugin - maybe hidden if plugin wants full control? 
          Let's keep it minimal or hidden by default, but useful for debugging.
          For now, let's hide it to make it feel "native".
      */}
      
      <div className="flex-1 relative">
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
                  // Inject API bridge if needed
                  // el.executeJavaScript('window.guyue = ...');
                });
                
                // Open external links in browser
                el.addEventListener('new-window', (e: any) => {
                  e.preventDefault();
                  window.electronAPI.openPath(e.url);
                });
              }
            }
          }}
          src={src}
          className="w-full h-full"
          partition={`persist:plugin-${pluginId}`}
          // @ts-ignore
          allowpopups="true"
          webpreferences="contextIsolation=false, nodeIntegration=true" // Be careful with this in production! For plugins, maybe we want a preload script bridge.
        />
        
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 pointer-events-none">
            <RotateCw className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
};
