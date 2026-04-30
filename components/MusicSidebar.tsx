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
    <div className="theme-sidebar-surface w-60 flex flex-col h-full shrink-0 select-none">
      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <div className="theme-logo-mark !h-8 !w-8 !rounded-[14px]">
            <Music className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-tight" style={{ color: 'var(--t-text)' }}>Music</h2>
            <p className="text-[10px]" style={{ color: 'var(--t-text-muted)' }}>HiFi 无损播放器</p>
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
              className={`theme-list-item mb-1 w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${active ? 'theme-list-item-active font-medium' : ''}`}>
              <Icon className="w-4 h-4 shrink-0" style={{ color: active ? 'var(--t-accent)' : 'var(--t-text-muted)' }} />
              <span className="flex-1 text-sm truncate">{pl.name}</span>
              <span className={`tabular-nums rounded-full px-1.5 py-0.5 text-[11px] ${active ? 'theme-muted-badge' : ''}`} style={{ color: active ? undefined : 'var(--t-text-muted)' }}>{getTrackCount(pl)}</span>
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
                className={`theme-list-item mb-1 w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${isArtistsView || isArtistDetail ? 'theme-list-item-active font-medium' : ''}`}>
                <Users className="w-4 h-4 shrink-0" style={{ color: isArtistsView || isArtistDetail ? 'var(--t-accent)' : 'var(--t-text-muted)' }} />
                <span className="flex-1 text-sm truncate">艺术家</span>
                <span className={`tabular-nums rounded-full px-1.5 py-0.5 text-[11px] ${isArtistsView || isArtistDetail ? 'theme-muted-badge' : ''}`} style={{ color: isArtistsView || isArtistDetail ? undefined : 'var(--t-text-muted)' }}>{totalArtists}</span>
              </button>
              {/* Artist list when expanded */}
              {(isArtistsView || isArtistDetail) && (
                <div className="ml-2 mb-1 space-y-0.5 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {sortedArtists.map(([artist, count]) => {
                    const active = selectedPlaylist === `__artist__:${artist}`;
                    return (
                      <button key={artist} onClick={() => onSelectPlaylist(`__artist__:${artist}`)}
                        className={`theme-list-item w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all ${active ? 'theme-list-item-active font-medium' : ''}`}>
                        <span className="flex-1 text-xs truncate">{artist}</span>
                        <span className="text-[10px] tabular-nums" style={{ color: 'var(--t-text-muted)' }}>{count}</span>
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
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t-text-muted)' }}>歌单</span>
          <button onClick={() => { setIsCreating(true); setNewName(''); }} className="theme-icon-btn h-6 w-6 rounded-md" title="新建歌单">
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
                    className="theme-input min-w-0 flex-1 px-2 py-1 text-sm" />
                  <button onClick={handleRename} className="theme-icon-btn h-7 w-7 rounded-md" style={{ color: '#16a34a' }}><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="theme-icon-btn h-7 w-7 rounded-md"><X className="w-3.5 h-3.5" /></button>
                </div>
              );
            }

            return (
              <div key={pl.id} className="relative group">
                <button onClick={() => onSelectPlaylist(pl.id)}
                  className={`theme-list-item w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all ${active ? 'theme-list-item-active font-medium' : ''}`}>
                  <span style={{ color: pl.color || (active ? '#8b5cf6' : '#9ca3af') }}><Icon className="w-4 h-4 shrink-0" /></span>
                  <span className="flex-1 text-sm truncate">{pl.name}</span>
                  <span className={`tabular-nums rounded-full px-1.5 py-0.5 text-[11px] ${active ? 'theme-muted-badge' : ''}`} style={{ color: active ? undefined : 'var(--t-text-muted)' }}>{count}</span>
                  <div onClick={e => { e.stopPropagation(); setMenuId(menuId === pl.id ? null : pl.id); setCustomizingId(null); }}
                    className="theme-icon-btn h-6 w-6 rounded-md shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </div>
                </button>

                {/* Context menu */}
                {menuId === pl.id && (
                  <div ref={menuRef} className="theme-surface absolute right-0 top-full z-20 mt-1 min-w-[148px] rounded-2xl p-1">
                    <button onClick={() => { setEditingId(pl.id); setEditName(pl.name); setMenuId(null); }} className="theme-list-item w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                      <Pencil className="w-3.5 h-3.5" />重命名
                    </button>
                    <button onClick={() => { setCustomizingId(pl.id); setMenuId(null); }} className="theme-list-item w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                      <Palette className="w-3.5 h-3.5" />图标与颜色
                    </button>
                    {idx > 0 && (
                      <button onClick={() => { onReorderPlaylist(pl.id, 'up'); setMenuId(null); }} className="theme-list-item w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                        <ChevronUp className="w-3.5 h-3.5" />上移
                      </button>
                    )}
                    {idx < userPlaylists.length - 1 && (
                      <button onClick={() => { onReorderPlaylist(pl.id, 'down'); setMenuId(null); }} className="theme-list-item w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                        <ChevronDown className="w-3.5 h-3.5" />下移
                      </button>
                    )}
                    <div className="my-1 border-t" style={{ borderColor: 'var(--t-border-light)' }} />
                    <button onClick={() => { onDeletePlaylist(pl.id); setMenuId(null); }} className="theme-list-item w-full flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm" style={{ color: '#dc2626' }}>
                      <Trash2 className="w-3.5 h-3.5" />删除
                    </button>
                  </div>
                )}

                {/* Customize icon & color panel */}
                {customizingId === pl.id && (
                  <div className="theme-surface mx-2 mt-1 mb-2 space-y-3 rounded-2xl p-3">
                    <div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--t-text-muted)' }}>图标</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {PLAYLIST_ICONS.map(({ id, Icon: Ic }) => (
                          <button key={id} onClick={() => onUpdatePlaylist(pl.id, { icon: id })}
                            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${pl.icon === id ? 'theme-list-item-active' : 'theme-icon-btn'}`}>
                            <Ic className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-medium" style={{ color: 'var(--t-text-muted)' }}>颜色</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {PLAYLIST_COLORS.map(c => (
                          <button key={c} onClick={() => onUpdatePlaylist(pl.id, { color: c })}
                            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${pl.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setCustomizingId(null)} className="theme-secondary-btn px-3 py-1.5 text-xs">完成</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create new playlist inline */}
        {isCreating && (
          <div className="theme-surface mx-2 mt-1 mb-2 space-y-3 rounded-2xl p-3">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setIsCreating(false); }}
              placeholder="歌单名称..."
              className="theme-input w-full px-2.5 py-1.5 text-sm" />
            <div>
              <span className="text-[11px] font-medium" style={{ color: 'var(--t-text-muted)' }}>图标</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {PLAYLIST_ICONS.map(({ id, Icon: Ic }) => (
                  <button key={id} onClick={() => setNewIcon(id)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${newIcon === id ? 'theme-list-item-active' : 'theme-icon-btn'}`}>
                    <Ic className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[11px] font-medium" style={{ color: 'var(--t-text-muted)' }}>颜色</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {PLAYLIST_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleCreate} className="theme-primary-btn flex-1 py-1.5 text-xs font-medium">创建</button>
              <button onClick={() => setIsCreating(false)} className="theme-secondary-btn flex-1 py-1.5 text-xs">取消</button>
            </div>
          </div>
        )}

        {userPlaylists.length === 0 && !isCreating && (
          <p className="px-3 py-4 text-center text-xs" style={{ color: 'var(--t-text-muted)' }}>点击 + 创建你的第一个歌单</p>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-3 border-t text-[11px]" style={{ color: 'var(--t-text-muted)', borderColor: 'var(--t-border-light)' }}>
        共 {tracks.length} 首 · {tracks.filter(t => t.lossless).length} 首无损
      </div>
    </div>
  );
};
