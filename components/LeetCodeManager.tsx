import React, { useState, useRef, useEffect } from 'react';
import { LeetCodeList } from './LeetCodeList';
import { LeetCodeListModal } from './LeetCodeListModal';
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink } from 'lucide-react';
import { LeetCodeList as ILeetCodeList, parseLeetCodeMarkdown } from '../utils/leetcodeParser';
import { LEETCODE_DATA } from './LeetCodeData';
import { LUOGU_9391_DATA } from './Luogu9391Data';
import { LEETCODE_HOT100_DATA } from './LeetCodeHot100Data';

const STORAGE_KEY_LISTS = 'leetcode_lists';
const STORAGE_KEY_PROGRESS = 'leetcode_progress';

export const LeetCodeManager: React.FC = () => {
  // addressBarUrl tracks the URL shown in the toolbar
  const [addressBarUrl, setAddressBarUrl] = useState('https://leetcode.cn/problemset/all/');
  // initialUrl is used for the webview src to prevent React from reloading the webview on state changes
  const [initialUrl] = useState('https://leetcode.cn/problemset/all/');
  
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<any>(null);

  // Data State
  const [lists, setLists] = useState<ILeetCodeList[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LISTS);
    let initialLists: ILeetCodeList[] = [];

    if (saved) {
      try {
        initialLists = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved lists', e);
      }
    }

    // Always regenerate the default list from current LEETCODE_DATA
    const categories = parseLeetCodeMarkdown(LEETCODE_DATA);
    const defaultList: ILeetCodeList = {
      id: 'default',
      title: '基础算法精讲',
      description: '灵茶山艾府 - 基础算法精讲 · 题目汇总',
      categories: categories,
      createdAt: Date.now(),
      rawMarkdown: LEETCODE_DATA,
      priority: 0
    };

    const luoguCategories = parseLeetCodeMarkdown(LUOGU_9391_DATA);
    const luoguList: ILeetCodeList = {
      id: 'luogu-9391',
      title: '能力全面提升综合题单',
      description: '洛谷 - 能力全面提升综合题单 · 题目汇总',
      categories: luoguCategories,
      createdAt: Date.now(),
      rawMarkdown: LUOGU_9391_DATA,
      priority: 1
    };

    const hot100Categories = parseLeetCodeMarkdown(LEETCODE_HOT100_DATA);
    const hot100List: ILeetCodeList = {
      id: 'leetcode-hot-100',
      title: 'LeetCode 热题 100',
      description: 'LeetCode 热题 100 · 题目汇总',
      categories: hot100Categories,
      createdAt: Date.now(),
      rawMarkdown: LEETCODE_HOT100_DATA,
      priority: 2
    };

    let finalLists: ILeetCodeList[] = [];

    if (initialLists.length > 0) {
      const defaultIndex = initialLists.findIndex(l => l.id === 'default');
      if (defaultIndex !== -1) {
        // Force update the default list with new data, but keep user's priority
        initialLists[defaultIndex] = {
          ...initialLists[defaultIndex],
          categories: defaultList.categories,
          rawMarkdown: defaultList.rawMarkdown,
          title: defaultList.title,
          description: defaultList.description,
          // priority: Keep existing priority
        };
      } else {
        initialLists.push(defaultList);
      }

      const luoguIndex = initialLists.findIndex(l => l.id === 'luogu-9391');
      if (luoguIndex !== -1) {
        // Force update the luogu list with new data, but keep user's priority
        initialLists[luoguIndex] = {
          ...initialLists[luoguIndex],
          categories: luoguList.categories,
          rawMarkdown: luoguList.rawMarkdown,
          title: luoguList.title,
          description: luoguList.description,
          // priority: Keep existing priority
        };
      } else {
        initialLists.push(luoguList);
      }

      const hot100Index = initialLists.findIndex(l => l.id === 'leetcode-hot-100');
      if (hot100Index !== -1) {
        // Force update the hot100 list with new data, but keep user's priority
        initialLists[hot100Index] = {
          ...initialLists[hot100Index],
          categories: hot100List.categories,
          rawMarkdown: hot100List.rawMarkdown,
          title: hot100List.title,
          description: hot100List.description,
          // priority: Keep existing priority
        };
      } else {
        initialLists.push(hot100List);
      }
      
      finalLists = initialLists;
    } else {
      finalLists = [defaultList, luoguList, hot100List];
    }

    // Sort by priority
    return finalLists.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
  });

  const [progress, setProgress] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROGRESS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved progress', e);
      }
    }
    return {};
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<ILeetCodeList | undefined>(undefined);

  // Persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LISTS, JSON.stringify(lists));
  }, [lists]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(progress));
  }, [progress]);

  // Handlers
  const handleSelectProblem = (url: string) => {
    setAddressBarUrl(url);
    if (webviewRef.current) {
      webviewRef.current.loadURL(url);
    }
  };

  const handleToggleProblem = (url: string) => {
    setProgress(prev => ({
      ...prev,
      [url]: !prev[url]
    }));
  };

  const handleAddList = () => {
    setEditingList(undefined);
    setIsModalOpen(true);
  };

  const handleEditList = (list: ILeetCodeList) => {
    setEditingList(list);
    setIsModalOpen(true);
  };

  const handleDeleteList = (id: string) => {
    if (confirm('确定要删除这个题单吗？')) {
      setLists(prev => prev.filter(l => l.id !== id));
    }
  };

  const handleSaveList = (listData: Partial<ILeetCodeList>) => {
    setLists(prev => {
      let newLists;
      if (editingList) {
        // Update existing
        const updatedList: ILeetCodeList = {
          ...editingList,
          ...listData,
          id: editingList.id, // Ensure ID doesn't change
          createdAt: editingList.createdAt // Ensure createdAt doesn't change
        } as ILeetCodeList;
        
        newLists = prev.map(l => l.id === updatedList.id ? updatedList : l);
      } else {
        // Add new
        const newList: ILeetCodeList = {
          id: Date.now().toString(),
          createdAt: Date.now(),
          title: listData.title || '未命名题单',
          categories: listData.categories || [],
          description: listData.description,
          rawMarkdown: listData.rawMarkdown,
          priority: listData.priority ?? 10
        };
        newLists = [...prev, newList];
      }
      // Sort by priority
      return newLists.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
    });
    setIsModalOpen(false);
  };

  // Webview Handlers
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
    <div className="flex h-full bg-white">
      {/* Left Sidebar: Problem List */}
      <LeetCodeList 
        lists={lists}
        progress={progress}
        onSelectProblem={handleSelectProblem}
        onToggleProblem={handleToggleProblem}
        onAddList={handleAddList}
        onDeleteList={handleDeleteList}
        onEditList={handleEditList}
      />

      {/* Right Content: Webview */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border-l border-gray-200">
        {/* Toolbar */}
        <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2 bg-gray-50/50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button 
              onClick={handleGoBack}
              disabled={!canGoBack}
              className={`p-1.5 rounded-md transition-colors ${canGoBack ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleGoForward}
              disabled={!canGoForward}
              className={`p-1.5 rounded-md transition-colors ${canGoForward ? 'hover:bg-gray-200 text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              onClick={handleReload}
              className="p-1.5 rounded-md hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-500 truncate font-mono">
            {addressBarUrl}
          </div>

          <button 
            onClick={() => window.open(addressBarUrl, '_blank')}
            className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
            title="在默认浏览器中打开"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* Webview Container */}
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
                    setAddressBarUrl(el.getURL());
                  });
                  el.addEventListener('new-window', (e: any) => {
                    e.preventDefault();
                    el.loadURL(e.url);
                  });
                }
              }
            }}
            src={initialUrl}
            className="w-full h-full"
            partition="persist:leetcode"
            // @ts-ignore
            allowpopups="true"
            useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
        </div>
      </div>

      {/* Modal */}
      <LeetCodeListModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveList}
        initialData={editingList}
      />
    </div>
  );
};
