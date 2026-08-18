import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ListMusic,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface Track {
  name: string;
  artist: string;
  url: string;
}

const DEFAULT_TRACKS: Track[] = [
  { name: '倒带', artist: '蔡依林', url: '/music/蔡依林 - 倒带 .ogg' },
  { name: '曾经的你', artist: '许巍', url: '/music/曾经的你.mp3' },
  { name: '小宇', artist: '张震岳', url: '/music/张震岳 - 小宇.mp3' },
];

const STORAGE_KEY = 'memory-music-settings-v2';
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.ogg'];

function hasSupportedAudioFormat(url: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname.toLowerCase();
    const extensionIndex = pathname.lastIndexOf('.');
    if (extensionIndex < 0) return true;
    const extension = pathname.slice(extensionIndex);
    return !extension || SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
  } catch {
    return false;
  }
}

interface StoredSettings {
  trackIndex?: number;
  muted?: boolean;
  volume?: number;
}

function readStoredSettings(): StoredSettings {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as StoredSettings : {};
  } catch {
    return {};
  }
}

function readMusicLibrary(): Track[] {
  try {
    const saved = localStorage.getItem('music_library');
    if (!saved) return DEFAULT_TRACKS;
    const customTracks = JSON.parse(saved) as Array<{ name?: unknown; url?: unknown }>;
    if (!Array.isArray(customTracks)) return DEFAULT_TRACKS;
    const merged = [...DEFAULT_TRACKS];
    customTracks.forEach((track) => {
      const name = typeof track.name === 'string' ? track.name.trim() : '';
      const url = typeof track.url === 'string' ? track.url.trim() : '';
      if (!name || !url) return;
      if (!merged.some((item) => item.url === url)) {
        merged.push({ name, artist: '自定义歌曲', url });
      }
    });
    return merged;
  } catch {
    return DEFAULT_TRACKS;
  }
}

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tracks, setTracks] = useState<Track[]>(() => readMusicLibrary());
  const [settings] = useState<StoredSettings>(() => readStoredSettings());
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [muted, setMuted] = useState(() => settings.muted ?? false);
  const [volume, setVolume] = useState(() => settings.volume ?? 0.72);
  const [loadError, setLoadError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const selectedTrackIndex = trackIndex < tracks.length ? trackIndex : 0;
  const currentTrack = tracks[selectedTrackIndex] ?? DEFAULT_TRACKS[0];

  useEffect(() => {
    const refreshLibrary = () => {
      setTracks(readMusicLibrary());
    };
    window.addEventListener('storage', refreshLibrary);
    window.addEventListener('music-library-updated', refreshLibrary);
    return () => {
      window.removeEventListener('storage', refreshLibrary);
      window.removeEventListener('music-library-updated', refreshLibrary);
    };
  }, []);

  const persistSettings = useCallback((next: StoredSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable in private browsing; playback still works.
    }
  }, []);

  const playAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || loadError) return;

    audio.play().then(() => {
      setIsPlaying(true);
      setAutoplayBlocked(false);
    }).catch(() => {
      // Browsers may block audible autoplay until the first user gesture.
      setAutoplayBlocked(true);
    });
  }, [loadError]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    persistSettings({ trackIndex: selectedTrackIndex, muted, volume });
  }, [muted, persistSettings, selectedTrackIndex, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoadError(false);
    audio.pause();
    audio.currentTime = 0;
    audio.src = currentTrack.url;
    audio.load();
    playAudio();
  }, [currentTrack.url, playAudio]);

  useEffect(() => {
    const retryPlayback = () => {
      if (autoplayBlocked) playAudio();
    };
    window.addEventListener('pointerdown', retryPlayback, { passive: true });
    window.addEventListener('keydown', retryPlayback);
    return () => {
      window.removeEventListener('pointerdown', retryPlayback);
      window.removeEventListener('keydown', retryPlayback);
    };
  }, [autoplayBlocked, playAudio]);

  const togglePlayback = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      playAudio();
    }
  };

  const chooseTrack = (index: number) => {
    setTrackIndex(index);
    setIsMenuOpen(false);
  };

  const addTrack = () => {
    const name = window.prompt('请输入新歌曲名称');
    if (!name?.trim()) return;
    const url = window.prompt('请输入 MP3 或 OGG 歌曲路径或云端链接');
    if (!url?.trim()) return;
    if (!hasSupportedAudioFormat(url.trim())) {
      window.alert('歌曲格式不支持，请使用 .mp3 或 .ogg 文件');
      return;
    }

    const savedTracks = (() => {
      try {
        const value = localStorage.getItem('music_library');
        return value ? JSON.parse(value) as Array<{ name: string; url: string }> : [];
      } catch {
        return [];
      }
    })();
    const newTrack = { name: name.trim(), url: url.trim() };
    const updatedTracks = [...savedTracks.filter((track) => track.url !== newTrack.url), newTrack];
    localStorage.setItem('music_library', JSON.stringify(updatedTracks));
    window.dispatchEvent(new Event('music-library-updated'));
    const updatedLibrary = readMusicLibrary();
    setTracks(updatedLibrary);
    const newIndex = updatedLibrary.findIndex((track) => track.url === newTrack.url);
    if (newIndex >= 0) setTrackIndex(newIndex);
  };

  const toggleMuted = () => {
    setMuted((value) => !value);
    if (audioRef.current) audioRef.current.muted = !muted;
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    setMuted(value === 0);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
  };

  return (
    <div className="music-player-container">
      <audio
        ref={audioRef}
        preload="auto"
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setTrackIndex((index) => (index + 1) % tracks.length)}
        onError={() => {
          setIsPlaying(false);
          setLoadError(true);
          if (selectedTrackIndex === 0 && tracks.length > 1) {
            setFallbackNotice(true);
            setTrackIndex(1);
          }
        }}
      />

      <div className="music-pill glass" aria-label="背景音乐控制">
        <button
          className={`music-btn ${isPlaying ? 'active' : ''}`}
          type="button"
          onClick={togglePlayback}
          aria-label={isPlaying ? '暂停音乐' : '播放音乐'}
          title={isPlaying ? '暂停音乐' : '播放音乐'}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <span className="music-divider" aria-hidden="true" />
        <button
          className={`music-btn ${muted ? '' : 'active'}`}
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? '开启声音' : '关闭声音'}
          title={muted ? '开启声音' : '关闭声音'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <button
          className={`music-btn ${isMenuOpen ? 'active' : ''}`}
          type="button"
          onClick={() => setIsMenuOpen((value) => !value)}
          aria-label="打开歌曲播放菜单"
          title="歌曲播放菜单"
          aria-expanded={isMenuOpen}
        >
          <ListMusic size={18} />
          <ChevronDown size={12} className="music-menu-chevron" />
        </button>
      </div>

      {isMenuOpen && (
        <section className="music-panel glass" aria-label="歌曲播放菜单">
          <div className="current-track-info">
            <span className="track-title-label">正在播放</span>
            <span className="track-text track-title">{currentTrack.name}</span>
            <span className="track-text track-artist">{currentTrack.artist}</span>
          </div>
          <div className="panel-controls">
            <button className="ctrl-btn main-play-btn" type="button" onClick={togglePlayback} aria-label={isPlaying ? '暂停音乐' : '播放音乐'}>
              {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
          </div>
          <label className="volume-control">
            {muted || volume === 0 ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label="音量"
            />
          </label>
          <div className="song-list-heading">
            <span className="song-list-title">歌曲列表</span>
            <button className="music-add-track" type="button" onClick={addTrack} title="新增歌曲" aria-label="新增歌曲">
              <Plus size={15} />
            </button>
          </div>
          <div className="song-list">
            {tracks.map((track, index) => (
              <button
                key={track.url}
                type="button"
                className={`song-item ${index === selectedTrackIndex ? 'active' : ''} ${index === selectedTrackIndex && loadError ? 'error' : ''}`}
                onClick={() => chooseTrack(index)}
              >
                <span className="song-details">
                  <span className="song-name">{track.name}</span>
                  <span className="song-artist-name">{track.artist}</span>
                </span>
                {index === selectedTrackIndex && isPlaying && (
                  <span className="music-waves" aria-label="播放中">
                    <i className="wave-bar" /><i className="wave-bar" /><i className="wave-bar" />
                  </span>
                )}
                {index === selectedTrackIndex && loadError && <span className="error-tag"><AlertCircle size={11} /> 缺少音频</span>}
              </button>
            ))}
          </div>
          {autoplayBlocked && !loadError && <p className="music-tip">点击页面任意位置即可开始播放</p>}
          {fallbackNotice && <p className="music-tip">《倒带》音频暂未找到，已切换到可用歌曲</p>}
          <p className="music-tip">支持 MP3 / OGG 音频格式</p>
          {loadError && <p className="music-tip">请确认《{currentTrack.name}》的音频路径可用</p>}
        </section>
      )}
    </div>
  );
}
