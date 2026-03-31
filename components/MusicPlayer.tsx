import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { MusicTrack, MusicPlaylist, MusicRepeatMode } from '../types';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Repeat, Repeat1, Shuffle, Trash2, FileAudio, Music,
  FolderOpen, Plus, ListMusic, Edit3, Check, X, ChevronDown, ChevronUp,
  FileText, MoreHorizontal, Disc3, Maximize2, Minimize2,
  Settings, Mic2, Save, RotateCcw, AlertTriangle
} from 'lucide-react';

// ── helpers ──
const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const qualityLabel = (t: MusicTrack) => {
  const parts: string[] = [];
  if (t.lossless) parts.push('无损');
  parts.push(t.format);
  if (t.sampleRate) parts.push(`${(t.sampleRate / 1000).toFixed(1)}kHz`);
  if (t.bitDepth) parts.push(`${t.bitDepth}bit`);
  if (!t.lossless && t.bitrate) parts.push(`${t.bitrate}kbps`);
  return parts.join(' · ');
};

// ── Spectrum Visualizer ──
const SpectrumVisualizer: React.FC<{ analyser: AnalyserNode | null; isPlaying: boolean; height?: number }> = ({ analyser, isPlaying, height = 32 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (!analyser || !isPlaying || !canvasRef.current) { cancelAnimationFrame(rafRef.current); return; }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 32;
      const w = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * bufLen);
        const v = data[idx] / 255;
        const h = v * canvas.height;
        const grad = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - h);
        grad.addColorStop(0, 'rgba(168,85,247,0.6)');
        grad.addColorStop(1, 'rgba(139,92,246,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(i * w + 1, canvas.height - h, w - 2, h);
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, isPlaying]);
  return <canvas ref={canvasRef} width={192} height={height} className="opacity-80" />;
};

// ── Parsed LRC line ──
interface LrcLine { time: number; text: string }
function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
    if (m) lines.push({ time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

const MUSIC_AI_CONFIG_KEY = 'guyue_music_ai_config';

interface MusicAiConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const PROVIDER_PRESETS: Record<string, { label: string; baseUrl: string; defaultModel: string }> = {
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.5-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'whisper-1' },
  zenmux: { label: 'Zenmux', baseUrl: 'https://zenmux.ai/api/v1', defaultModel: 'whisper-1' },
};

function loadMusicAiConfig(): MusicAiConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(MUSIC_AI_CONFIG_KEY) || '');
    return { provider: saved.provider || 'gemini', apiKey: saved.apiKey || '', baseUrl: saved.baseUrl || '', model: saved.model || '' };
  } catch {
    return { provider: 'gemini', apiKey: '', baseUrl: '', model: '' };
  }
}
function saveMusicAiConfig(cfg: MusicAiConfig) {
  localStorage.setItem(MUSIC_AI_CONFIG_KEY, JSON.stringify(cfg));
}

// ── Lyrics Modal (standalone page) ──
const LyricsModal: React.FC<{
  track: MusicTrack;
  onUpdate: (updates: Partial<MusicTrack>) => void;
  onClose: () => void;
  currentProgress: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}> = ({ track, onUpdate, onClose, currentProgress, isPlaying, onSeek, onTogglePlay }) => {
  const [tab, setTab] = useState<'lyrics' | 'ai' | 'align' | 'settings'>('lyrics');
  const [lyricsText, setLyricsText] = useState(track.lyrics || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<MusicAiConfig>(loadMusicAiConfig);
  // Align mode state
  const [plainLines, setPlainLines] = useState<string[]>([]);
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [alignIdx, setAlignIdx] = useState(0);
  const [alignStarted, setAlignStarted] = useState(false);
  const alignScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLyricsText(track.lyrics || ''); }, [track.lyrics]);

  // Auto-scroll align view
  useEffect(() => {
    if (alignStarted && alignScrollRef.current && alignIdx > 0) {
      const el = alignScrollRef.current.children[alignIdx] as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [alignIdx, alignStarted]);

  const handleSaveLyrics = () => { onUpdate({ lyrics: lyricsText }); };

  const handleImportLyrics = async () => {
    const api = (window as any).electronAPI;
    if (!api?.musicImportLyrics) return;
    const text = await api.musicImportLyrics();
    if (text) { setLyricsText(text); onUpdate({ lyrics: text }); }
  };

  const handleAiLyrics = async () => {
    const api = (window as any).electronAPI;
    if (!api?.musicAiLyrics) return;
    const cfg = aiConfig;
    const preset = PROVIDER_PRESETS[cfg.provider];
    const baseUrl = cfg.baseUrl || preset?.baseUrl || '';
    const model = cfg.model || preset?.defaultModel || '';
    if (!cfg.apiKey) { alert('请先在设置中配置 API Key'); setTab('settings'); return; }
    setAiLoading(true);
    try {
      const result = await api.musicAiLyrics({ filePath: track.filePath, apiKey: cfg.apiKey, baseUrl, provider: cfg.provider, model, language: 'zh' });
      if (result.error) alert(`歌词识别失败：${result.error}`);
      else if (result.lrc) { setLyricsText(result.lrc); onUpdate({ lyrics: result.lrc }); setTab('lyrics'); }
    } catch (err: any) { alert(`歌词识别异常：${err.message || err}`); }
    finally { setAiLoading(false); }
  };

  const handleSaveConfig = () => { saveMusicAiConfig(aiConfig); };

  // Align mode
  const startAlign = () => {
    const raw = lyricsText || track.lyrics || '';
    const lines = raw.split('\n').map(l => l.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim()).filter(l => l.length > 0);
    if (lines.length === 0) { alert('请先导入或编辑歌词文本'); setTab('lyrics'); return; }
    setPlainLines(lines); setTimestamps([]); setAlignIdx(0); setAlignStarted(false); setTab('align');
  };

  const handleStartAlign = () => {
    onSeek(0);
    if (!isPlaying) onTogglePlay();
    setAlignStarted(true);
  };

  const handleStamp = () => {
    if (alignIdx >= plainLines.length) return;
    const newTs = [...timestamps, currentProgress];
    setTimestamps(newTs);
    const next = alignIdx + 1;
    setAlignIdx(next);
    if (next >= plainLines.length) {
      const lrc = newTs.map((t, i) => {
        const m = Math.floor(t / 60); const s = (t % 60).toFixed(2);
        return `[${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}]${plainLines[i]}`;
      }).join('\n');
      setLyricsText(lrc);
      onUpdate({ lyrics: lrc });
      setAlignStarted(false);
      setTab('lyrics');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-purple-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-800">歌词管理</h2>
              <p className="text-xs text-gray-400 truncate max-w-[300px]">{track.title} — {track.artist}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {([['lyrics', '歌词编辑'], ['ai', 'AI 识别'], ['align', '打轴对齐'], ['settings', 'API 设置']] as const).map(([key, label]) => (
            <button key={key} onClick={() => key === 'align' ? startAlign() : setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'lyrics' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button onClick={handleImportLyrics} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"><FileText className="w-4 h-4" />导入 LRC/文本</button>
                <button onClick={handleSaveLyrics} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-purple-500 rounded-lg hover:bg-purple-600"><Save className="w-4 h-4" />保存</button>
                {track.lyrics && <button onClick={() => { setLyricsText(''); onUpdate({ lyrics: '' }); }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4" />清除</button>}
              </div>
              <textarea value={lyricsText} onChange={e => setLyricsText(e.target.value)} placeholder="粘贴或编辑歌词...\n支持 LRC 格式 [mm:ss.xx]歌词内容\n也可以粘贴纯文本，之后用「打轴对齐」添加时间戳"
                className="w-full h-72 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400" />
              <p className="text-xs text-gray-400">提示：LRC 格式形如 <code className="bg-gray-100 px-1 rounded">[01:23.45]歌词内容</code>，也支持纯文本歌词（可用打轴模式添加时间戳）</p>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-5">
              <div className="bg-purple-50 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-purple-700">AI 歌词识别</h3>
                <p className="text-xs text-purple-600/70">使用 AI 模型自动识别音频中的歌词并生成带时间戳的 LRC 格式。Gemini 支持最大 2GB 文件，推荐用于无损音频。</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">当前模型</span><span className="text-gray-700 font-medium">{PROVIDER_PRESETS[aiConfig.provider]?.label || aiConfig.provider} / {aiConfig.model || PROVIDER_PRESETS[aiConfig.provider]?.defaultModel || '默认'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">API Key</span><span className="text-gray-700">{aiConfig.apiKey ? '✓ 已配置' : '✗ 未配置'}</span></div>
              </div>
              {!aiConfig.apiKey && <p className="text-xs text-orange-500">⚠ 请先在「API 设置」中配置 API Key</p>}
              <button onClick={handleAiLyrics} disabled={aiLoading || !aiConfig.apiKey}
                className="w-full flex items-center justify-center gap-2 py-3 bg-purple-500 text-white rounded-xl hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                {aiLoading ? <><Disc3 className="w-4 h-4 animate-spin" />识别中，请稍候...</> : <><Mic2 className="w-4 h-4" />开始 AI 识别</>}
              </button>
            </div>
          )}

          {tab === 'align' && (
            <div className="space-y-4">
              <div className="bg-orange-50 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-orange-700">打轴对齐模式</h3>
                <p className="text-xs text-orange-600/70">播放音乐时，在每句歌词开始演唱的瞬间点击「标记」按钮，自动为每行歌词添加时间戳。</p>
              </div>
              {plainLines.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">请先在「歌词编辑」中导入或输入歌词文本</p>
              ) : !alignStarted ? (
                <div className="text-center space-y-4 py-4">
                  <p className="text-sm text-gray-600">已载入 <span className="font-semibold text-orange-600">{plainLines.length}</span> 行歌词，准备好后点击开始</p>
                  <button onClick={handleStartAlign} className="px-6 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-medium transition-colors">
                    <Play className="w-4 h-4 inline mr-1.5" />从头开始打轴
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-orange-600 font-medium">进度: {alignIdx} / {plainLines.length}</span>
                    <span className="text-gray-400 tabular-nums">当前: {fmt(currentProgress)}</span>
                  </div>
                  <div ref={alignScrollRef} className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-50">
                    {plainLines.map((line, i) => (
                      <div key={i} className={`px-4 py-2 text-sm transition-all ${i === alignIdx ? 'bg-orange-100 text-orange-900 font-semibold' : i < alignIdx ? 'bg-green-50 text-green-700' : 'text-gray-500'}`}>
                        {i < alignIdx && <span className="text-[11px] text-green-500 font-mono mr-2">[{fmt(timestamps[i])}]</span>}
                        {i === alignIdx && <span className="text-orange-400 mr-2">▶</span>}
                        {line}
                      </div>
                    ))}
                  </div>
                  {alignIdx < plainLines.length && (
                    <button onClick={handleStamp} className="w-full py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-bold transition-colors">
                      ⏱ 标记当前时间 [{fmt(currentProgress)}]
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-5">
              <p className="text-xs text-gray-400">音乐 AI 歌词识别使用独立的 API 配置，与聊天模块分开。</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AI 提供商</label>
                  <div className="flex gap-2">
                    {Object.entries(PROVIDER_PRESETS).map(([key, { label }]) => (
                      <button key={key} onClick={() => setAiConfig(c => ({ ...c, provider: key, baseUrl: '', model: '' }))}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${aiConfig.provider === key ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input type="password" value={aiConfig.apiKey} onChange={e => setAiConfig(c => ({ ...c, apiKey: e.target.value }))}
                    placeholder="输入 API Key..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base URL <span className="text-gray-400 font-normal">(可选，留空用默认)</span></label>
                  <input type="text" value={aiConfig.baseUrl} onChange={e => setAiConfig(c => ({ ...c, baseUrl: e.target.value }))}
                    placeholder={PROVIDER_PRESETS[aiConfig.provider]?.baseUrl || ''}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">模型 <span className="text-gray-400 font-normal">(可选，留空用默认)</span></label>
                  <input type="text" value={aiConfig.model} onChange={e => setAiConfig(c => ({ ...c, model: e.target.value }))}
                    placeholder={PROVIDER_PRESETS[aiConfig.provider]?.defaultModel || ''}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
              <button onClick={handleSaveConfig} className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium"><Save className="w-4 h-4" />保存配置</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Fullscreen Lyrics View (NetEase-style) ──
const FullscreenLyrics: React.FC<{
  track: MusicTrack;
  cover?: string;
  lyrics: LrcLine[] | null;
  plainLyrics?: string;
  progress: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}> = ({ track, cover, lyrics, plainLyrics, progress, duration, isPlaying, onTogglePlay, onPrev, onNext, onSeek, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIdx = useMemo(() => {
    if (!lyrics) return -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (progress >= lyrics[i].time) return i;
    }
    return -1;
  }, [lyrics, progress]);

  useEffect(() => {
    if (currentIdx >= 0 && containerRef.current) {
      const el = containerRef.current.children[currentIdx] as HTMLElement;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIdx]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-gray-900 via-gray-900 to-black flex flex-col items-center">
      {/* Close */}
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/50 hover:text-white rounded-full hover:bg-white/10 transition z-10" title="退出全屏">
        <Minimize2 className="w-5 h-5" />
      </button>

      {/* Main content */}
      <div className="flex-1 flex items-center gap-16 px-16 max-w-6xl w-full min-h-0 pt-12">
        {/* Left: cover + info */}
        <div className="flex flex-col items-center gap-6 w-80 shrink-0">
          <div className={`w-64 h-64 rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/30 ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDuration: '4s' }}>
            {cover ? <img src={cover} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-purple-700 to-purple-900 flex items-center justify-center"><Music className="w-20 h-20 text-white/30" /></div>}
          </div>
          <div className="text-center space-y-1 w-full">
            <h2 className="text-xl font-bold text-white truncate">{track.title}</h2>
            <p className="text-sm text-white/50">{track.artist}{track.album !== '未知专辑' ? ` — ${track.album}` : ''}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${track.lossless ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white/40'}`}>{qualityLabel(track)}</span>
          </div>
        </div>

        {/* Right: lyrics scroll */}
        <div className="flex-1 h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 mask-gradient" ref={containerRef}>
          {lyrics && lyrics.length > 0 ? (
            lyrics.map((line, i) => (
              <div key={i} onClick={() => onSeek(line.time)} className={`py-2.5 px-4 cursor-pointer rounded-lg transition-all duration-300 ${i === currentIdx ? 'text-white text-xl font-semibold scale-105 bg-white/5' : 'text-white/30 text-base hover:text-white/50'}`}>
                {line.text || '♪'}
              </div>
            ))
          ) : plainLyrics ? (
            <pre className="text-white/40 whitespace-pre-wrap font-sans text-base leading-loose px-4">{plainLyrics}</pre>
          ) : (
            <div className="flex items-center justify-center h-full text-white/20 text-lg">暂无歌词</div>
          )}
        </div>
      </div>

      {/* Bottom: mini controls */}
      <div className="w-full pb-8 px-16 space-y-3">
        {/* Progress */}
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <span className="text-xs text-white/40 tabular-nums w-10 text-right">{fmt(progress)}</span>
          <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer relative group" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width * duration); }}>
            <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition" style={{ left: `calc(${duration ? (progress / duration) * 100 : 0}% - 6px)` }} />
          </div>
          <span className="text-xs text-white/40 tabular-nums w-10">{fmt(duration)}</span>
        </div>
        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <button onClick={onPrev} className="p-2 text-white/60 hover:text-white transition"><SkipBack className="w-5 h-5" /></button>
          <button onClick={onTogglePlay} className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-gray-900 hover:scale-105 transition-transform shadow-lg">
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>
          <button onClick={onNext} className="p-2 text-white/60 hover:text-white transition"><SkipForward className="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  );
};

// ── Track Detail Modal (full popup) ──
const TrackDetailModal: React.FC<{
  track: MusicTrack;
  cover?: string;
  playlists: MusicPlaylist[];
  isInPlaylist: (plId: string) => boolean;
  onTogglePlaylist: (plId: string) => void;
  onUpdate: (updates: Partial<MusicTrack>) => void;
  onOpenLyrics: () => void;
  onUploadCover: () => void;
  onRelink: () => void;
  onDelete: () => void;
  onClose: () => void;
  fileMissing?: boolean;
}> = ({ track, cover, playlists, isInPlaylist, onTogglePlaylist, onUpdate, onOpenLyrics, onUploadCover, onRelink, onDelete, onClose, fileMissing }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<MusicTrack>>({});

  useEffect(() => { setEditing(false); setDraft({}); }, [track.id]);

  const startEdit = () => { setEditing(true); setDraft({ title: track.title, artist: track.artist, album: track.album, lyricist: track.lyricist || '', composer: track.composer || '', singer: track.singer || '', band: track.band || '', genre: track.genre || '', year: track.year, comment: track.comment || '' }); };
  const saveEdit = () => { onUpdate(draft); setEditing(false); };
  const cancelEdit = () => { setEditing(false); setDraft({}); };
  const userPlaylists = playlists.filter(p => !p.isSystem);

  const Field = ({ label, field }: { label: string; field: keyof MusicTrack }) => (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-400 w-14 shrink-0 text-right">{label}</span>
      {editing ? <input className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-purple-400" value={(draft as any)[field] ?? ''} onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))} /> : <span className="text-gray-700 truncate">{(track as any)[field] || '—'}</span>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <span className="text-base font-semibold text-gray-800">歌曲详情</span>
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button onClick={saveEdit} className="px-3 py-1 text-sm text-white bg-purple-500 rounded-lg hover:bg-purple-600">保存</button>
                <button onClick={cancelEdit} className="px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">取消</button>
              </>
            ) : (
              <button onClick={startEdit} className="px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" />编辑</button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg ml-1"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* File missing warning */}
          {fileMissing && (
            <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <FileAudio className="w-5 h-5 text-red-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-700 font-medium">文件不存在或已移动</p>
                <p className="text-xs text-red-500 truncate">{track.filePath}</p>
              </div>
              <button onClick={onRelink} className="px-3 py-1 text-xs text-red-600 bg-red-100 rounded-lg hover:bg-red-200 shrink-0">重新定位</button>
            </div>
          )}

          <div className="flex gap-6">
            {/* Cover */}
            <div className="shrink-0">
              <div className="w-44 h-44 rounded-xl overflow-hidden bg-gray-100 shadow-lg relative group cursor-pointer" onClick={onUploadCover}>
                {cover ? <img src={cover} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center"><Music className="w-14 h-14 text-purple-300" /></div>}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">更换封面</span>
                </div>
              </div>
              <div className="mt-2 text-center">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${track.lossless ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{qualityLabel(track)}</span>
              </div>
            </div>

            {/* Info fields */}
            <div className="flex-1 space-y-2.5 min-w-0">
              <Field label="标题" field="title" />
              <Field label="歌手" field="artist" />
              <Field label="专辑" field="album" />
              <Field label="作词" field="lyricist" />
              <Field label="作曲" field="composer" />
              <Field label="演唱" field="singer" />
              <Field label="乐队" field="band" />
              <Field label="流派" field="genre" />
              <Field label="备注" field="comment" />
            </div>
          </div>

          {/* Playlists */}
          {userPlaylists.length > 0 && (
            <div className="mt-5 space-y-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">所属歌单</span>
              <div className="flex flex-wrap gap-2">
                {userPlaylists.map(pl => (
                  <label key={pl.id} className={`flex items-center gap-1.5 text-sm cursor-pointer rounded-lg px-3 py-1.5 border transition-colors ${isInPlaylist(pl.id) ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={isInPlaylist(pl.id)} onChange={() => onTogglePlaylist(pl.id)} className="accent-purple-500 rounded hidden" />
                    <ListMusic className="w-3.5 h-3.5" />
                    {pl.name}
                    {isInPlaylist(pl.id) && <Check className="w-3 h-3 text-purple-500" />}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Lyrics preview + manage */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">歌词</span>
              <button onClick={onOpenLyrics} className="text-xs text-purple-500 hover:text-purple-700 flex items-center gap-1"><Music className="w-3 h-3" />管理歌词</button>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors" onClick={onOpenLyrics}>
              {track.lyrics ? (
                <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed line-clamp-3">{track.lyrics}</pre>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">暂无歌词 — 点击管理</p>
              )}
            </div>
          </div>

          {/* File info */}
          <div className="mt-5 bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-400 space-y-1">
            <div className="flex justify-between"><span>文件路径</span><span className="text-gray-500 truncate max-w-[350px]" title={track.filePath}>{track.filePath}</span></div>
            <div className="flex justify-between"><span>格式</span><span className="text-gray-500">{track.format} {track.sampleRate ? `${(track.sampleRate/1000).toFixed(1)}kHz` : ''} {track.bitDepth ? `${track.bitDepth}bit` : ''}</span></div>
          </div>

          {/* Delete */}
          <div className="mt-5 flex justify-end">
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" />从库中移除</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Add-to-playlist popover (inline, for + button on each track) ──
const AddToPlaylistPopover: React.FC<{
  trackId: string;
  playlists: MusicPlaylist[];
  isInPlaylist: (plId: string, trackId: string) => boolean;
  onToggle: (plId: string, trackId: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}> = ({ trackId, playlists, isInPlaylist, onToggle, onClose, anchorRef }) => {
  const ref = useRef<HTMLDivElement>(null);
  const userPlaylists = playlists.filter(p => !p.isSystem);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 200) });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (userPlaylists.length === 0) {
    return (
      <div ref={ref} className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-2 px-3 text-xs text-gray-400" style={pos}>
        暂无自建歌单，请先创建歌单
      </div>
    );
  }

  return (
    <div ref={ref} className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]" style={pos}>
      <div className="px-3 py-1.5 text-xs text-gray-400 font-medium">添加到歌单</div>
      {userPlaylists.map(pl => {
        const inPl = isInPlaylist(pl.id, trackId);
        return (
          <button key={pl.id} onClick={() => { onToggle(pl.id, trackId); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-purple-50 text-gray-700">
            <ListMusic className="w-3.5 h-3.5 text-gray-400" />
            <span className="flex-1 text-left truncate">{pl.name}</span>
            {inPl && <Check className="w-3 h-3 text-purple-500" />}
          </button>
        );
      })}
    </div>
  );
};

// ── Main Export ──
export interface MusicPlayerProps {
  tracks: MusicTrack[];
  playlists: MusicPlaylist[];
  selectedPlaylist: string;
  coverCache: Map<string, string>;
  coverVersion: number;
  onUpdateTrack: (trackId: string, updates: Partial<MusicTrack>) => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleInPlaylist: (playlistId: string, trackId: string) => void;
  onLoadCover: (trackId: string, filePath: string) => void;
  onSetCover: (trackId: string, dataUri: string) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onReorderTracksInPlaylist: (playlistId: string, trackIds: string[]) => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  tracks, playlists, selectedPlaylist, coverCache, coverVersion,
  onUpdateTrack, onDeleteTrack, onToggleInPlaylist, onLoadCover, onSetCover,
  onAddFiles, onAddFolder, onReorderTracksInPlaylist,
}) => {
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => { try { return parseFloat(localStorage.getItem('guyue_music_volume') || '0.8'); } catch { return 0.8; } });
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<MusicRepeatMode>('off');
  const [isShuffled, setIsShuffled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailTrackId, setDetailTrackId] = useState<string | null>(null);
  const [addToPlTrackId, setAddToPlTrackId] = useState<string | null>(null);
  const addToPlBtnRef = useRef<HTMLButtonElement | null>(null);
  const [showFullscreenLyrics, setShowFullscreenLyrics] = useState(false);
  const [lyricsModalTrackId, setLyricsModalTrackId] = useState<string | null>(null);
  const [missingFiles, setMissingFiles] = useState<Set<string>>(new Set());

  const howlRef = useRef<Howl | null>(null);
  const progressTimer = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const seekingRef = useRef(false);

  // Check file existence for visible tracks
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.musicFileExists) return;
    const checkFiles = async () => {
      const missing = new Set<string>();
      for (const t of tracks) {
        const exists = await api.musicFileExists(t.filePath);
        if (!exists) missing.add(t.id);
      }
      setMissingFiles(missing);
    };
    checkFiles();
  }, [tracks]);

  // Derived
  const playlistTracks = useMemo(() => {
    if (selectedPlaylist === 'all') return tracks;
    const pl = playlists.find(p => p.id === selectedPlaylist);
    if (!pl) return tracks;
    if (!pl.isSystem) {
      return pl.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as MusicTrack[];
    }
    const idSet = new Set(pl.trackIds);
    return tracks.filter(t => idSet.has(t.id));
  }, [tracks, playlists, selectedPlaylist]);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return playlistTracks;
    const q = searchQuery.toLowerCase();
    return playlistTracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q));
  }, [playlistTracks, searchQuery]);

  const playQueue = useMemo(() => {
    if (!isShuffled) return filteredTracks;
    const arr = [...filteredTracks];
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }, [filteredTracks, isShuffled]);

  const currentTrack = useMemo(() => tracks.find(t => t.id === currentTrackId), [tracks, currentTrackId]);
  const detailTrack = useMemo(() => tracks.find(t => t.id === detailTrackId), [tracks, detailTrackId]);

  const parsedLyrics = useMemo(() => {
    if (!currentTrack?.lyrics) return null;
    const lines = parseLrc(currentTrack.lyrics);
    return lines.length > 0 ? lines : null;
  }, [currentTrack?.lyrics]);

  const isInPlaylist = useCallback((plId: string, trackId: string) => {
    const pl = playlists.find(p => p.id === plId);
    return pl ? pl.trackIds.includes(trackId) : false;
  }, [playlists]);

  // Lazy load covers
  useEffect(() => {
    filteredTracks.forEach(t => { if (!coverCache.has(t.id)) onLoadCover(t.id, t.filePath); });
  }, [filteredTracks, coverCache, onLoadCover]);

  // ── Playback engine ──
  const UNSUPPORTED_FORMATS = new Set(['DSF', 'DFF', 'APE', 'WMA', 'WV']);
  const playTrack = useCallback((track: MusicTrack) => {
    if (UNSUPPORTED_FORMATS.has(track.format.toUpperCase())) {
      alert(`${track.format.toUpperCase()} 格式暂不支持在线播放。\n建议使用工具将文件转换为 FLAC 或 WAV 格式。`);
      return;
    }
    if (howlRef.current) howlRef.current.unload();
    clearInterval(progressTimer.current);
    const h = new Howl({
      src: [`file://${track.filePath}`],
      html5: true,
      volume: isMuted ? 0 : volume,
      onplay: () => {
        setIsPlaying(true);
        setDuration(h.duration());
        progressTimer.current = window.setInterval(() => {
          if (!seekingRef.current) setProgress(h.seek() as number);
        }, 250);
      },
      onend: () => handleTrackEnd(),
      onloaderror: () => { console.error('Load error:', track.filePath); setIsPlaying(false); },
    });
    howlRef.current = h;
    setCurrentTrackId(track.id);
    setProgress(0);
    h.play();
    try {
      const ctx = Howler.ctx;
      if (ctx) {
        const a = ctx.createAnalyser();
        a.fftSize = 256;
        a.smoothingTimeConstant = 0.8;
        (Howler as any).masterGain.connect(a);
        analyserRef.current = a;
      }
    } catch {}
  }, [volume, isMuted]);

  const handleTrackEnd = useCallback(() => {
    clearInterval(progressTimer.current);
    setIsPlaying(false);
    const q = playQueue;
    const idx = q.findIndex(t => t.id === currentTrackId);
    if (repeatMode === 'one') {
      howlRef.current?.seek(0);
      howlRef.current?.play();
    } else if (idx < q.length - 1) {
      playTrack(q[idx + 1]);
    } else if (repeatMode === 'all' && q.length > 0) {
      playTrack(q[0]);
    }
  }, [playQueue, currentTrackId, repeatMode, playTrack]);

  const togglePlay = () => {
    if (!howlRef.current) { if (playQueue.length > 0) playTrack(playQueue[0]); return; }
    if (isPlaying) { howlRef.current.pause(); setIsPlaying(false); clearInterval(progressTimer.current); }
    else { howlRef.current.play(); }
  };

  const playNext = () => {
    const q = playQueue; const idx = q.findIndex(t => t.id === currentTrackId);
    if (idx < q.length - 1) playTrack(q[idx + 1]);
    else if (q.length > 0) playTrack(q[0]);
  };

  const playPrev = () => {
    if (howlRef.current && (howlRef.current.seek() as number) > 3) { howlRef.current.seek(0); setProgress(0); return; }
    const q = playQueue; const idx = q.findIndex(t => t.id === currentTrackId);
    if (idx > 0) playTrack(q[idx - 1]);
    else if (q.length > 0) playTrack(q[q.length - 1]);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!howlRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    howlRef.current.seek(pct * duration);
    setProgress(pct * duration);
  };

  const seekTo = (time: number) => {
    if (!howlRef.current) return;
    howlRef.current.seek(time);
    setProgress(time);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v); setIsMuted(false);
    if (howlRef.current) howlRef.current.volume(v);
    localStorage.setItem('guyue_music_volume', String(v));
  };

  const handleUploadCover = async (trackId: string) => {
    const api = (window as any).electronAPI;
    if (!api?.musicSelectCover) return;
    const dataUri = await api.musicSelectCover();
    if (dataUri) {
      onSetCover(trackId, dataUri);
      onUpdateTrack(trackId, { customCover: dataUri });
    }
  };

  const handleRelinkFile = async (trackId: string) => {
    const api = (window as any).electronAPI;
    if (!api?.musicRelinkFile) return;
    const newPath = await api.musicRelinkFile();
    if (newPath) {
      onUpdateTrack(trackId, { filePath: newPath });
      setMissingFiles(prev => { const next = new Set(prev); next.delete(trackId); return next; });
    }
  };

  const handleMoveTrack = (trackId: string, direction: 'up' | 'down') => {
    const pl = playlists.find(p => p.id === selectedPlaylist);
    if (!pl || pl.isSystem) return;
    const ids = [...pl.trackIds];
    const idx = ids.indexOf(trackId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
    onReorderTracksInPlaylist(pl.id, ids);
  };

  const playPlaylist = () => {
    if (filteredTracks.length > 0) playTrack(filteredTracks[0]);
  };

  const isUserPlaylist = !playlists.find(p => p.id === selectedPlaylist)?.isSystem && selectedPlaylist !== 'all';

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'Escape' && showFullscreenLyrics) setShowFullscreenLyrics(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => () => { howlRef.current?.unload(); clearInterval(progressTimer.current); }, []);

  const curCover = currentTrack ? (currentTrack.customCover || coverCache.get(currentTrack.id)) : undefined;
  const getCover = (t: MusicTrack) => t.customCover || coverCache.get(t.id);

  // ── Empty state ──
  if (tracks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-6">
        <div className="w-24 h-24 rounded-full bg-purple-50 flex items-center justify-center"><Music className="w-12 h-12 text-purple-300" /></div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-medium text-gray-600">开始你的音乐之旅</h3>
          <p className="text-sm">添加本地音乐文件，享受 HiFi 无损品质</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onAddFiles} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"><Plus className="w-4 h-4" />添加文件</button>
          <button onClick={onAddFolder} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"><FolderOpen className="w-4 h-4" />扫描文件夹</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Track list */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{playlists.find(p => p.id === selectedPlaylist)?.name || '全部音乐'}</h2>
                  <span className="text-xs text-gray-400">{filteredTracks.length} 首曲目</span>
                </div>
                {filteredTracks.length > 0 && (
                  <button onClick={playPlaylist} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-xs font-medium transition-colors" title="播放全部">
                    <Play className="w-3.5 h-3.5" />播放
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索曲目..." className="w-full pl-3 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400" />
                </div>
                <button onClick={onAddFiles} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors" title="添加文件"><Plus className="w-3.5 h-3.5" />添加</button>
                <button onClick={onAddFolder} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors" title="扫描文件夹"><FolderOpen className="w-3.5 h-3.5" />扫描</button>
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div className={`grid ${isUserPlaylist ? 'grid-cols-[40px_1fr_160px_120px_80px_100px]' : 'grid-cols-[40px_1fr_160px_120px_80px_72px]'} px-5 py-2 text-xs text-gray-400 font-medium border-b border-gray-50 select-none`}>
            <span>#</span><span>曲目</span><span className="hidden lg:block">专辑</span><span className="hidden md:block">品质</span><span className="text-right">时长</span><span />
          </div>

          {/* Track rows */}
          <div className="flex-1 overflow-y-auto">
            {filteredTracks.map((track, i) => {
              const active = track.id === currentTrackId;
              const cover = getCover(track);
              const isMissing = missingFiles.has(track.id);
              return (
                <div key={track.id} className={`group grid ${isUserPlaylist ? 'grid-cols-[40px_1fr_160px_120px_80px_100px]' : 'grid-cols-[40px_1fr_160px_120px_80px_72px]'} items-center px-5 py-2 cursor-pointer transition-colors ${isMissing ? 'opacity-50' : ''} ${active ? 'bg-purple-50/70' : 'hover:bg-gray-50'}`}
                  onDoubleClick={() => !isMissing && playTrack(track)}>
                  <div className="flex items-center justify-center">
                    {isMissing ? <span title="文件不存在"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /></span> : active && isPlaying ? <Disc3 className="w-4 h-4 text-purple-500 animate-spin" style={{ animationDuration: '3s' }} /> : <span className={`text-xs ${active ? 'text-purple-500 font-medium' : 'text-gray-400'}`}>{i + 1}</span>}
                  </div>
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                      {cover ? <img src={cover} className="w-full h-full object-cover" /> : <FileAudio className="w-4 h-4 text-gray-300" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm truncate ${active ? 'text-purple-600 font-medium' : 'text-gray-800'}`}>{track.title}</div>
                      <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 truncate hidden lg:block pr-2">{track.album}</span>
                  <span className="hidden md:block">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${track.lossless ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-400'}`}>{track.lossless ? '无损 ' : ''}{track.format}</span>
                  </span>
                  <span className="text-xs text-gray-500 text-right tabular-nums">{fmt(track.duration)}</span>
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUserPlaylist && (
                      <>
                        <button onClick={e => { e.stopPropagation(); handleMoveTrack(track.id, 'up'); }} className="p-0.5 text-gray-400 hover:text-purple-500" title="上移"><ChevronUp className="w-3 h-3" /></button>
                        <button onClick={e => { e.stopPropagation(); handleMoveTrack(track.id, 'down'); }} className="p-0.5 text-gray-400 hover:text-purple-500" title="下移"><ChevronDown className="w-3 h-3" /></button>
                      </>
                    )}
                    <button ref={addToPlTrackId === track.id ? addToPlBtnRef : undefined}
                      onClick={e => { e.stopPropagation(); addToPlBtnRef.current = e.currentTarget as HTMLButtonElement; setAddToPlTrackId(addToPlTrackId === track.id ? null : track.id); }}
                      className="p-1 text-gray-400 hover:text-purple-500" title="添加到歌单"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={e => { e.stopPropagation(); setDetailTrackId(track.id); }} className="p-1 text-gray-400 hover:text-purple-500" title="详情">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail modal */}
        {detailTrack && (
          <TrackDetailModal
            track={detailTrack}
            cover={getCover(detailTrack)}
            playlists={playlists}
            isInPlaylist={(plId) => isInPlaylist(plId, detailTrack.id)}
            onTogglePlaylist={(plId) => onToggleInPlaylist(plId, detailTrack.id)}
            onUpdate={(updates) => onUpdateTrack(detailTrack.id, updates)}
            onOpenLyrics={() => { setLyricsModalTrackId(detailTrack.id); }}
            onUploadCover={() => handleUploadCover(detailTrack.id)}
            onRelink={() => handleRelinkFile(detailTrack.id)}
            onDelete={() => { onDeleteTrack(detailTrack.id); setDetailTrackId(null); }}
            onClose={() => setDetailTrackId(null)}
            fileMissing={missingFiles.has(detailTrack.id)}
          />
        )}
      </div>

      {/* ── Now Playing Bar ── */}
      {currentTrack && (
        <div className="border-t border-gray-200 bg-white shrink-0">
          <div className="h-1 w-full bg-gray-100 cursor-pointer group relative" onClick={handleSeek}>
            <div className="h-full bg-gradient-to-r from-purple-400 to-purple-500 transition-all" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-purple-500 shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${duration ? (progress / duration) * 100 : 0}% - 6px)` }} />
          </div>
          <div className="flex items-center h-[72px] px-5">
            {/* Left: current track info */}
            <div className="flex items-center gap-3 w-64 shrink-0">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center shadow-sm cursor-pointer" onClick={() => setShowFullscreenLyrics(true)} title="查看歌词">
                {curCover ? <img src={curCover} className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-gray-300" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{currentTrack.title}</div>
                <div className="text-xs text-gray-400 truncate">{currentTrack.artist}</div>
              </div>
            </div>

            {/* Center: controls */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center gap-4">
                <button onClick={() => setIsShuffled(!isShuffled)} className={`p-1.5 rounded-full transition-colors ${isShuffled ? 'text-purple-500 bg-purple-50' : 'text-gray-400 hover:text-gray-600'}`} title="随机"><Shuffle className="w-4 h-4" /></button>
                <button onClick={playPrev} className="p-1.5 text-gray-600 hover:text-gray-800 rounded-full hover:bg-gray-100"><SkipBack className="w-5 h-5" /></button>
                <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center rounded-full bg-purple-500 text-white hover:bg-purple-600 shadow-md transition-all hover:scale-105">
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button onClick={playNext} className="p-1.5 text-gray-600 hover:text-gray-800 rounded-full hover:bg-gray-100"><SkipForward className="w-5 h-5" /></button>
                <button onClick={() => setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off')} className={`p-1.5 rounded-full transition-colors ${repeatMode !== 'off' ? 'text-purple-500 bg-purple-50' : 'text-gray-400 hover:text-gray-600'}`} title={repeatMode === 'one' ? '单曲循环' : repeatMode === 'all' ? '列表循环' : '不循环'}>
                  {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 tabular-nums">
                <span>{fmt(progress)}</span><span>/</span><span>{fmt(duration)}</span>
                {currentTrack.lossless && <span className="ml-2 px-1.5 py-px rounded bg-amber-50 text-amber-600 text-[10px]">{currentTrack.format} {currentTrack.sampleRate ? `${(currentTrack.sampleRate / 1000).toFixed(1)}kHz` : ''}</span>}
              </div>
            </div>

            {/* Right: fullscreen lyrics + spectrum + volume */}
            <div className="flex items-center gap-3 w-64 justify-end shrink-0">
              {currentTrack.lyrics && (
                <button onClick={() => setShowFullscreenLyrics(true)} className="p-1.5 text-gray-400 hover:text-purple-500 rounded-full hover:bg-purple-50" title="全屏歌词"><Maximize2 className="w-4 h-4" /></button>
              )}
              <SpectrumVisualizer analyser={analyserRef.current} isPlaying={isPlaying} height={28} />
              <button onClick={() => { setIsMuted(!isMuted); if (howlRef.current) howlRef.current.volume(isMuted ? volume : 0); }} className="p-1 text-gray-400 hover:text-gray-600">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={handleVolume} className="w-20 h-1 accent-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Add-to-playlist popover */}
      {addToPlTrackId && (
        <AddToPlaylistPopover
          trackId={addToPlTrackId}
          playlists={playlists}
          isInPlaylist={isInPlaylist}
          onToggle={onToggleInPlaylist}
          onClose={() => setAddToPlTrackId(null)}
          anchorRef={addToPlBtnRef}
        />
      )}

      {/* Fullscreen lyrics overlay */}
      {showFullscreenLyrics && currentTrack && (
        <FullscreenLyrics
          track={currentTrack}
          cover={curCover}
          lyrics={parsedLyrics}
          plainLyrics={currentTrack.lyrics && !parsedLyrics ? currentTrack.lyrics : undefined}
          progress={progress}
          duration={duration}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onPrev={playPrev}
          onNext={playNext}
          onSeek={seekTo}
          onClose={() => setShowFullscreenLyrics(false)}
        />
      )}

      {/* Lyrics modal */}
      {lyricsModalTrackId && (() => {
        const t = tracks.find(tr => tr.id === lyricsModalTrackId);
        if (!t) return null;
        return (
          <LyricsModal
            track={t}
            onUpdate={(updates) => onUpdateTrack(t.id, updates)}
            onClose={() => setLyricsModalTrackId(null)}
            currentProgress={progress}
            isPlaying={isPlaying}
            onSeek={seekTo}
            onTogglePlay={togglePlay}
          />
        );
      })()}
    </div>
  );
};
