import React, { useState, useRef, useEffect } from 'react';
import { MusicPlaylist, MusicTrack } from '../types';
import {
  Music, ListMusic, Plus, Check, X, ChevronUp, ChevronDown,
  MoreHorizontal, Pencil, Trash2, Palette, Disc3, Headphones,
  Radio, Star, Mic2, AudioLines, Guitar, Piano, Drum, Library,
  Users, ChevronRight, ChevronLeft
} from 'lucide-react';

// Icon options for playlists
const PLAYLIST_ICONS: { id: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'ListMusic', Icon: ListMusic },
  { id: 'Music', Icon: Music },
  { id: 'Headphones', Icon: Headphones },
  { id: 'Radio', Icon: Radio },
  { id: 'Star', Icon: Star },
  { id: 'Mic2', Icon: Mic2 },
  { id: 'AudioLines', Icon: AudioLines },
  { id: 'Guitar', Icon: Guitar },
  { id: 'Piano', Icon: Piano },
  { id: 'Drum', Icon: Drum },
  { id: 'Disc3', Icon: Disc3 },
  { id: 'Library', Icon: Library },
];

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = Object.fromEntries(PLAYLIST_ICONS.map(i => [i.id, i.Icon]));

// Color presets
const PLAYLIST_COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981',
  '#84cc16', '#eab308', '#f97316', '#ef4444', '#ec4899',
  '#a855f7', '#6b7280',
];

interface MusicSidebarProps {
  playlists: MusicPlaylist[];
  tracks: MusicTrack[];
  selectedPlaylist: string;
  onSelectPlaylist: (id: string) => void;
  onCreatePlaylist: (name: string, icon?: string, color?: string) => void;
  onRenamePlaylist: (id: string, name: string) => void;
  onDeletePlaylist: (id: string) => void;
  onUpdatePlaylist: (id: string, updates: Partial<MusicPlaylist>) => void;
  onReorderPlaylist: (id: string, direction: 'up' | 'down') => void;
}

export const MusicSidebar: React.FC<MusicSidebarProps> = ({
  playlists, tracks, selectedPlaylist,
  onSelectPlaylist, onCreatePlaylist, onRenamePlaylist, onDeletePlaylist,
  onUpdatePlaylist, onReorderPlaylist,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('ListMusic');
  const [newColor, setNewColor] = useState(PLAYLIST_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [customizingId, setCustomizingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  const getTrackCount = (pl: MusicPlaylist) => {
    if (pl.id === 'all') return tracks.length;
    return pl.trackIds.length;
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (name) { onCreatePlaylist(name, newIcon, newColor); setNewName(''); setNewIcon('ListMusic'); setNewColor(PLAYLIST_COLORS[0]); setIsCreating(false); }
  };

  const handleRename = () => {
    const name = editName.trim();
    if (name && editingId) { onRenamePlaylist(editingId, name); setEditingId(null); setEditName(''); }
  };

  const userPlaylists = playlists.filter(p => !p.isSystem);
  const systemPlaylists = playlists.filter(p => p.isSystem);

  return (
    <div className="w-60 bg-[#FAFAFA] border-r border-gray-200 flex flex-col h-full shrink-0 select-none">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
            <Music className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-800 leading-tight">Music</h2>
            <p className="text-[10px] text-gray-400">HiFi 无损播放器</p>
          </div>
        </div>
      </div>

      {/* Playlist list */}
      <div className="flex-1 overflow-y-auto px-2">
        {/* System playlists (全部音乐) */}
        {systemPlaylists.map(pl => {
          const active = pl.id === selectedPlaylist;
          const Icon = ICON_MAP[pl.icon] || Music;
          return (
            <button key={pl.id} onClick={() => onSelectPlaylist(pl.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all mb-1 ${active ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-600 hover:bg-white/60'}`}>
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-purple-500' : 'text-gray-400'}`} />
              <span className="flex-1 text-sm truncate">{pl.name}</span>
              <span className="text-[11px] text-gray-400 tabular-nums">{getTrackCount(pl)}</span>
            </button>
          );
        })}

        {/* Artists section */}
        {(() => {
          const isArtistsView = selectedPlaylist === '__artists__';
          const isArtistDetail = selectedPlaylist.startsWith('__artist__:');
          const artistCounts = new Map<string, number>();
          tracks.forEach(t => {
            const a = t.artist?.trim();
            if (a && a !== '未知艺术家') artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
          });
          const sortedArtists = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]);
          const totalArtists = sortedArtists.length;

          return (
            <>
              <button onClick={() => onSelectPlaylist(isArtistsView || isArtistDetail ? 'all' : '__artists__')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all mb-1 ${isArtistsView || isArtistDetail ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-600 hover:bg-white/60'}`}>
                <Users className={`w-4 h-4 shrink-0 ${isArtistsView || isArtistDetail ? 'text-purple-500' : 'text-gray-400'}`} />
                <span className="flex-1 text-sm truncate">艺术家</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{totalArtists}</span>
              </button>
              {/* Artist list when expanded */}
              {(isArtistsView || isArtistDetail) && (
                <div className="ml-2 mb-1 space-y-0.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {sortedArtists.map(([artist, count]) => {
                    const active = selectedPlaylist === `__artist__:${artist}`;
                    return (
                      <button key={artist} onClick={() => onSelectPlaylist(`__artist__:${artist}`)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-all ${active ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
                        <span className="flex-1 text-xs truncate">{artist}</span>
                        <span className="text-[10px] text-gray-400 tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* Section divider */}
        <div className="flex items-center justify-between px-2 py-2 mt-2">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">歌单</span>
          <button onClick={() => { setIsCreating(true); setNewName(''); }} className="p-0.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded transition-colors" title="新建歌单">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* User playlists */}
        <div className="space-y-0.5">
          {userPlaylists.map((pl, idx) => {
            const active = pl.id === selectedPlaylist;
            const Icon = ICON_MAP[pl.icon] || ListMusic;
            const count = getTrackCount(pl);

            if (editingId === pl.id) {
              return (
                <div key={pl.id} className="flex items-center gap-1 px-2 py-1.5">
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingId(null); }}
                    className="flex-1 text-sm bg-white border border-purple-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400 min-w-0" />
                  <button onClick={handleRename} className="p-0.5 text-green-500 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3.5 h-3.5" /></button>
                </div>
              );
            }

            return (
              <div key={pl.id} className="relative group">
                <button onClick={() => onSelectPlaylist(pl.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${active ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-600 hover:bg-white/60'}`}>
                  <span style={{ color: pl.color || (active ? '#8b5cf6' : '#9ca3af') }}><Icon className="w-4 h-4 shrink-0" /></span>
                  <span className="flex-1 text-sm truncate">{pl.name}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums">{count}</span>
                  <div onClick={e => { e.stopPropagation(); setMenuId(menuId === pl.id ? null : pl.id); setCustomizingId(null); }}
                    className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </div>
                </button>

                {/* Context menu */}
                {menuId === pl.id && (
                  <div ref={menuRef} className="absolute right-0 top-full z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                    <button onClick={() => { setEditingId(pl.id); setEditName(pl.name); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <Pencil className="w-3.5 h-3.5" />重命名
                    </button>
                    <button onClick={() => { setCustomizingId(pl.id); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <Palette className="w-3.5 h-3.5" />图标与颜色
                    </button>
                    {idx > 0 && (
                      <button onClick={() => { onReorderPlaylist(pl.id, 'up'); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                        <ChevronUp className="w-3.5 h-3.5" />上移
                      </button>
                    )}
                    {idx < userPlaylists.length - 1 && (
                      <button onClick={() => { onReorderPlaylist(pl.id, 'down'); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                        <ChevronDown className="w-3.5 h-3.5" />下移
                      </button>
                    )}
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={() => { onDeletePlaylist(pl.id); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />删除
                    </button>
                  </div>
                )}

                {/* Customize icon & color panel */}
                {customizingId === pl.id && (
                  <div className="mx-2 mt-1 mb-2 bg-white border border-gray-200 rounded-lg shadow-md p-3 space-y-3">
                    <div>
                      <span className="text-[11px] text-gray-400 font-medium">图标</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {PLAYLIST_ICONS.map(({ id, Icon: Ic }) => (
                          <button key={id} onClick={() => onUpdatePlaylist(pl.id, { icon: id })}
                            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${pl.icon === id ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                            <Ic className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-400 font-medium">颜色</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {PLAYLIST_COLORS.map(c => (
                          <button key={c} onClick={() => onUpdatePlaylist(pl.id, { color: c })}
                            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${pl.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setCustomizingId(null)} className="text-xs text-gray-400 hover:text-gray-600">完成</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create new playlist inline */}
        {isCreating && (
          <div className="mx-2 mt-1 mb-2 bg-white border border-gray-200 rounded-lg shadow-md p-3 space-y-3">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
              placeholder="歌单名称..."
              className="w-full text-sm bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400" />
            <div>
              <span className="text-[11px] text-gray-400 font-medium">图标</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {PLAYLIST_ICONS.map(({ id, Icon: Ic }) => (
                  <button key={id} onClick={() => setNewIcon(id)}
                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${newIcon === id ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                    <Ic className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-gray-400 font-medium">颜色</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PLAYLIST_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleCreate} className="flex-1 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 font-medium">创建</button>
              <button onClick={() => setIsCreating(false)} className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">取消</button>
            </div>
          </div>
        )}

        {userPlaylists.length === 0 && !isCreating && (
          <p className="text-xs text-gray-400 px-3 py-4 text-center">点击 + 创建你的第一个歌单</p>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-3 border-t border-gray-200/60 text-[11px] text-gray-400">
        共 {tracks.length} 首 · {tracks.filter(t => t.lossless).length} 首无损
      </div>
    </div>
  );
};
