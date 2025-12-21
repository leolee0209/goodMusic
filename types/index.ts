export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  uri: string;
  artwork?: string;
  trackNumber?: number;
  lrc?: string; // Content of the LRC file
}

export type RepeatMode = 'none' | 'one' | 'all';

export type PlaybackOrigin = {
  type: 'all' | 'artist' | 'album' | 'playlist' | 'search' | 'favorites';
  title: string;
  searchQuery?: string;
  favoritesOnly?: boolean;
};

export interface Playlist {
  id: string;
  title: string;
  createdAt: number;
}

export interface MusicContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  favorites: string[];
  showLyrics: boolean;
  playTrack: (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (millis: number) => Promise<void>;
  playNext: () => void;
  playPrev: () => void;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  toggleFavorite: (id: string) => void;
  toggleLyricsView: () => void;
  refreshLibrary: () => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;
  importLocalFolder: () => Promise<void>;
  downloadDemoTrack: () => Promise<void>;
  pickAndImportFiles: () => Promise<void>;
  library: Track[];
  
  // Scan State
  isScanning: boolean;
  scanProgress: { current: number; total: number };
  playlist: Track[];
  setPlaylist: (tracks: Track[]) => void;
  queueTitle: string;
  playbackOrigin: PlaybackOrigin | null;
  
  // Playlists
  playlists: Playlist[];
  createPlaylist: (title: string) => Promise<string>;
  addToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  loadPlaylists: () => Promise<void>;
}
