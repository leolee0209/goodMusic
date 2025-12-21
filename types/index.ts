export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  uri: string;
  artwork?: string;
  lrc?: string; // Content of the LRC file
}

export type RepeatMode = 'none' | 'one' | 'all';

export interface MusicContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  favorites: string[];
  showLyrics: boolean;
  playTrack: (track: Track, newQueue?: Track[], title?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (millis: number) => Promise<void>;
  playNext: () => void;
  playPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleFavorite: (id: string) => void;
  toggleLyricsView: () => void;
  refreshLibrary: () => Promise<void>;
  importLocalFolder: () => Promise<void>;
  downloadDemoTrack: () => Promise<void>;
  pickAndImportFiles: () => Promise<void>;
  library: Track[];
  playlist: Track[];
  setPlaylist: (tracks: Track[]) => void;
  queueTitle: string;
}
