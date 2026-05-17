import type { MusicPlaylist, MusicTrack } from '../../../types';
import type { ToolRegistration } from '../toolRegistry';
import {
  loadAgentMusicPlaylists,
  loadAgentMusicTracks,
  loadAgentSelectedMusicPlaylist,
} from './localData';
import { normalizeLimit } from './toolUtils';

const fileNameFromPath = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;

const summarizeTrack = (track: MusicTrack) => ({
  id: track.id,
  title: track.title,
  artist: track.artist || '未知艺术家',
  album: track.album || null,
  duration: track.duration || 0,
  format: track.format || null,
  genre: track.genre || null,
  year: track.year || null,
  fileName: fileNameFromPath(track.filePath || ''),
  addedAt: track.addedAt,
  hasLyrics: Boolean(track.lyrics?.trim()),
  lossless: Boolean(track.lossless),
});

const playlistTrackCount = (playlist: MusicPlaylist, tracks: MusicTrack[]) =>
  playlist.id === 'all' ? tracks.length : playlist.trackIds.length;

export const MUSIC_TOOL_REGISTRATIONS: ToolRegistration[] = [
  {
    name: 'query_music_library',
    module: 'music',
    permission: { module: 'music', action: 'read' },
    tool: {
      name: 'query_music_library',
      description: '查询 Music 音乐模块中的歌曲、播放列表和当前选中的播放列表。只返回元信息，不播放、不修改文件。',
      inputSchema: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '按歌曲名、艺术家、专辑、流派或文件名筛选。' },
          playlistId: { type: 'string', description: '只查看某个播放列表中的歌曲。' },
          limit: { type: 'number', description: '最多返回歌曲数量，默认 30。' },
        },
      },
    },
    execute: async (args) => {
      const [tracks, playlists] = await Promise.all([
        loadAgentMusicTracks(),
        loadAgentMusicPlaylists(),
      ]);
      const selectedPlaylistId = loadAgentSelectedMusicPlaylist();
      const playlistMap = new Map(playlists.map(playlist => [playlist.id, playlist]));
      const requestedPlaylistId = typeof args.playlistId === 'string' ? args.playlistId.trim() : '';
      const activePlaylist = requestedPlaylistId ? playlistMap.get(requestedPlaylistId) : null;
      let filteredTracks = [...tracks];

      if (activePlaylist && activePlaylist.id !== 'all') {
        const allowed = new Set(activePlaylist.trackIds);
        filteredTracks = filteredTracks.filter(track => allowed.has(track.id));
      }

      if (typeof args.keyword === 'string' && args.keyword.trim()) {
        const keyword = args.keyword.trim().toLowerCase();
        filteredTracks = filteredTracks.filter(track => [
          track.title,
          track.artist,
          track.album,
          track.genre,
          fileNameFromPath(track.filePath || ''),
        ].some(value => String(value || '').toLowerCase().includes(keyword)));
      }

      filteredTracks.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      const limit = normalizeLimit(args.limit, 30, 100);

      return {
        success: true,
        totalTracks: tracks.length,
        totalPlaylists: playlists.length,
        selectedPlaylistId,
        selectedPlaylistName: playlistMap.get(selectedPlaylistId)?.name || null,
        playlists: playlists.map(playlist => ({
          id: playlist.id,
          name: playlist.name,
          icon: playlist.icon,
          color: playlist.color || null,
          isSystem: Boolean(playlist.isSystem),
          trackCount: playlistTrackCount(playlist, tracks),
        })),
        query: {
          keyword: typeof args.keyword === 'string' ? args.keyword.trim() : '',
          playlistId: requestedPlaylistId || null,
          returnedTracks: Math.min(filteredTracks.length, limit),
        },
        tracks: filteredTracks.slice(0, limit).map(summarizeTrack),
      };
    },
  },
];
