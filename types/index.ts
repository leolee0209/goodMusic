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
  playTrack: (track: Track) => Promise<void>;
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
  playlist: Track[];
  setPlaylist: (tracks: Track[]) => void;
  activeGroup: { title: string; tracks: Track[] } | null;
  setActiveGroup: (group: { title: string; tracks: Track[] } | null) => void;
}
