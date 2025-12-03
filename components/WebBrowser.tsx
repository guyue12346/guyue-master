import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Search, X, Plus, Globe, Layout } from 'lucide-react';

interface WebBrowserProps {
  initialUrl?: string;
}

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export const WebBrowser: React.FC<WebBrowserProps> = ({ initialUrl = 'https://www.bing.com' }) => {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { 
      id: '1', 
      url: initialUrl, 
      title: 'New Tab', 
      isLoading: false, 
      canGoBack: false, 
      canGoForward: false 
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [inputUrl, setInputUrl] = useState(initialUrl);
  
  const webviewRefs = useRef<{ [key: string]: any }>({});
  const lastUrlRef = useRef(initialUrl);
  
  // 用于存储新窗口处理函数的引用，这样事件监听器可以访问最新的状态
  const openNewTabRef = useRef<(url: string) => void>(() => {});
  
  // 打开新标签页的函数
  const openNewTab = useCallback((url: string) => {
    const newTabId = Date.now().toString();
    const newTab: BrowserTab = {
      id: newTabId,
      url: url,
      title: 'Loading...',
      isLoading: true,
      canGoBack: false,
      canGoForward: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    setInputUrl(url);
  }, []);
  
  // 保持 ref 与最新的函数同步
  useEffect(() => {
    openNewTabRef.current = openNewTab;
  }, [openNewTab]);

  // Handle external URL updates (e.g. from Bookmarks)
  useEffect(() => {
    if (initialUrl && initialUrl !== lastUrlRef.current) {
      // Check if we already have a tab with this URL to avoid duplicates?
      // For now, always open new tab as requested by "multi-open" nature
      const newTabId = Date.now().toString();
      const newTab: BrowserTab = {
        id: newTabId,
        url: initialUrl,
        title: 'Loading...',
        isLoading: true,
        canGoBack: false,
        canGoForward: false
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTabId);
      setInputUrl(initialUrl);
      lastUrlRef.current = initialUrl;
    }
  }, [initialUrl]);

  const handleAddTab = () => {
    const newTabId = Date.now().toString();
    const startPage = localStorage.getItem('linkmaster_browser_start_page') || 'https://www.bing.com';
    const newTab: BrowserTab = {
      id: newTabId,
      url: startPage,
      title: 'New Tab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTabId);
    setInputUrl(startPage);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== tabId);
    
    if (newTabs.length === 0) {
       const newId = Date.now().toString();
       const startPage = localStorage.getItem('linkmaster_browser_start_page') || 'https://www.bing.com';
       const defaultTab = { id: newId, url: startPage, title: 'New Tab', isLoading: false, canGoBack: false, canGoForward: false };
       setTabs([defaultTab]);
       setActiveTabId(newId);
       setInputUrl(startPage);
    } else {
      setTabs(newTabs);
      if (activeTabId === tabId) {
        const lastTab = newTabs[newTabs.length - 1];
        setActiveTabId(lastTab.id);
        setInputUrl(lastTab.url);
      }
    }
    delete webviewRefs.current[tabId];
  };

  const handleTabClick = (tab: BrowserTab) => {
    setActiveTabId(tab.id);
    // When switching, update the address bar to the tab's current URL (from state, or query webview?)
    // The tab state 'url' should be kept in sync via events
    setInputUrl(tab.url);
  };

  const updateTabState = (tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prev => prev.map(t => {
      if (t.id === tabId) {
        return { ...t, ...updates };
      }
      return t;
    }));
    
    // If updating the active tab, sync the address bar
    if (tabId === activeTabId && updates.url) {
      setInputUrl(updates.url);
    }
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let targetUrl = inputUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl;
      } else {
        targetUrl = `https://www.bing.com/search?q=${encodeURIComponent(targetUrl)}`;
      }
    }
    
    // Update the active webview
    const webview = webviewRefs.current[activeTabId];
    if (webview) {
      webview.loadURL(targetUrl);
    }
  };

  const handleReload = () => {
    const webview = webviewRefs.current[activeTabId];
    if (webview) webview.reload();
  };

  const handleGoBack = () => {
    const webview = webviewRefs.current[activeTabId];
    if (webview && webview.canGoBack()) webview.goBack();
  };

  const handleGoForward = () => {
    const webview = webviewRefs.current[activeTabId];
    if (webview && webview.canGoForward()) webview.goForward();
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex h-full bg-white">
      {/* Left Sidebar - Tabs */}
      <div className="w-60 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-100/50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">标签页</span>
          <button 
            onClick={handleAddTab}
            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-600 transition-colors"
            title="新建标签页"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                activeTabId === tab.id 
                  ? 'bg-white shadow-sm text-blue-600 border border-gray-200' 
                  : 'text-gray-600 hover:bg-gray-200/50'
              }`}
            >
              <Globe className={`w-4 h-4 shrink-0 ${activeTabId === tab.id ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className="flex-1 truncate font-medium" title={tab.title}>{tab.title || 'Loading...'}</span>
              <button
                onClick={(e) => handleCloseTab(e, tab.id)}
                className={`p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ${
                  tabs.length === 1 ? 'hidden' : ''
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Browser Toolbar */}
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-3 gap-3 shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-1">
            <button 
              onClick={handleGoBack}
              disabled={!activeTab?.canGoBack}
              className={`p-1.5 rounded-md transition-colors ${activeTab?.canGoBack ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleGoForward}
              disabled={!activeTab?.canGoForward}
              className={`p-1.5 rounded-md transition-colors ${activeTab?.canGoForward ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReload}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              {activeTab?.isLoading ? <X className="w-4 h-4 animate-pulse" /> : <RotateCw className="w-4 h-4" />}
            </button>
          </div>

          {/* Address Bar */}
          <form onSubmit={handleNavigate} className="flex-1 flex items-center">
            <div className="relative w-full group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {inputUrl.startsWith('https') ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" title="Secure" />
                ) : (
                  <Search className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full py-2 pl-9 pr-3 bg-gray-100 border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                placeholder="Search or enter website name"
              />
            </div>
          </form>
        </div>

        {/* Webviews Container */}
        <div className="flex-1 relative bg-white overflow-hidden">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`absolute inset-0 w-full h-full ${activeTabId === tab.id ? 'z-10 visible' : 'z-0 invisible'}`}
            >
              {/* 
                // @ts-ignore - webview tag is not standard HTML 
              */}
              <webview
                ref={(el: any) => {
                  if (el) {
                    webviewRefs.current[tab.id] = el;
                    
                    // Attach listeners only once
                    if (!el.dataset.listenersAttached) {
                      el.dataset.listenersAttached = 'true';
                      
                      el.addEventListener('did-start-loading', () => {
                        updateTabState(tab.id, { isLoading: true });
                      });
                      
                      el.addEventListener('did-stop-loading', () => {
                        updateTabState(tab.id, { 
                          isLoading: false,
                          title: el.getTitle(),
                          canGoBack: el.canGoBack(),
                          canGoForward: el.canGoForward(),
                          url: el.getURL() // Sync URL on stop
                        });
                      });

                      el.addEventListener('did-navigate', (e: any) => {
                         updateTabState(tab.id, { url: e.url });
                      });
                      
                      el.addEventListener('page-title-updated', (e: any) => {
                        updateTabState(tab.id, { title: e.title });
                      });

                      el.addEventListener('new-window', (e: any) => {
                        e.preventDefault();
                        // 在新标签页中打开链接，而不是跳出应用
                        openNewTabRef.current(e.url);
                      });
                    }
                  }
                }}
                src={tab.url}
                className="w-full h-full"
                partition="persist:webview"
                // @ts-ignore
                allowpopups="true"
                useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
