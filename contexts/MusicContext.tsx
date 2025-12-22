import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createAudioPlayer, AudioPlayer, AudioStatus, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, MusicContextType, RepeatMode, PlaybackOrigin, Playlist } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTracks, initDatabase } from '../utils/database';
import { syncLibrary } from '../utils/librarySync';
import { logToFile } from '../utils/logger';

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const STORAGE_KEY_SHUFFLE = '@goodmusic_shuffle';
const STORAGE_KEY_REPEAT = '@goodmusic_repeat';
const STORAGE_KEY_FAVORITES = '@goodmusic_favorites';
const STORAGE_KEY_SHOW_LYRICS = '@goodmusic_show_lyrics';

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  
  const [library, setLibrary] = useState<Track[]>([]);
  const [playlist, setPlaylistState] = useState<Track[]>([]);
  const [originalPlaylist, setOriginalPlaylist] = useState<Track[]>([]);
  const [queueTitle, setQueueTitle] = useState('All Songs');
  const [playbackOrigin, setPlaybackOrigin] = useState<PlaybackOrigin | null>(null);
  
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);

  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const playerRef = useRef<AudioPlayer | null>(null);
  const isTransitioning = useRef(false);

  const queueTask = (task: () => Promise<void>) => {
    updateQueue.current = updateQueue.current.then(async () => {
      setIsScanning(true);
      try {
        await task();
      } finally {
        setIsScanning(false);
        setScanProgress({ current: 0, total: 0 });
      }
    });
  };

  const removeTrack = async (trackId: string) => {
    const track = library.find(t => t.id === trackId);
    if (track) {
      try {
        await logToFile(`Removing track: ${track.title} (${trackId})`);
        await import('../utils/database').then(m => m.deleteTrack(trackId));
        const fileInfo = await FileSystem.getInfoAsync(track.uri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(track.uri);
        }
        await refreshLibrary();
      } catch (e) {
        await logToFile(`Error removing track: ${e}`, 'ERROR');
      }
    }
  };

  const stateRef = useRef({ repeatMode, playlist, currentTrack, isShuffle });
  useEffect(() => {
    stateRef.current = { repeatMode, playlist, currentTrack, isShuffle };
  }, [repeatMode, playlist, currentTrack, isShuffle]);

  useEffect(() => {
    const configureAudio = async () => {
      try {
        await logToFile('Configuring audio mode...');
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers' 
        });
      } catch (e) {
        await logToFile(`Error configuring audio: ${e}`, 'ERROR');
      }
    };
    configureAudio();

    const player = createAudioPlayer(null);
    playerRef.current = player;

    const listener = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (isTransitioning.current) return;
      setPositionMillis(status.currentTime * 1000);
      setDurationMillis(status.duration * 1000);
      setIsPlaying(status.playing);
      if (status.didJustFinish) {
        handleTrackEnd();
      }
    });

    const loadData = async () => {
      await logToFile('Loading initial data...');
      await initDatabase();
      const tracks = await getAllTracks();
      setLibrary(tracks);
      setPlaylistState(tracks);
      setOriginalPlaylist(tracks);
      await loadPlaylists();
      await logToFile(`Loaded ${tracks.length} tracks and playlists.`);
    };
    loadData();

    const loadPreferences = async () => {
      try {
        const shuffle = await AsyncStorage.getItem(STORAGE_KEY_SHUFFLE);
        const repeat = await AsyncStorage.getItem(STORAGE_KEY_REPEAT);
        const favs = await AsyncStorage.getItem(STORAGE_KEY_FAVORITES);
        const lyrics = await AsyncStorage.getItem(STORAGE_KEY_SHOW_LYRICS);
        if (shuffle !== null) setIsShuffle(JSON.parse(shuffle));
        if (repeat !== null) setRepeatMode(repeat as RepeatMode);
        if (favs !== null) setFavorites(JSON.parse(favs));
        if (lyrics !== null) setShowLyrics(JSON.parse(lyrics));
      } catch (e) {
        await logToFile(`Error loading preferences: ${e}`, 'ERROR');
      }
    };
    loadPreferences();

    return () => {
      listener.remove();
    };
  }, []);

  const handleTrackEnd = () => {
    const { repeatMode, playlist, currentTrack } = stateRef.current;
    if (repeatMode === 'one') {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
    } else {
      if (!currentTrack || playlist.length === 0) return;
      const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
      const nextIndex = (currentIndex + 1) % playlist.length;
      if (nextIndex === 0 && repeatMode !== 'all') return;
      playTrackInternal(playlist[nextIndex]);
    }
  };

  const playTrackInternal = async (track: Track) => {
    try {
      if (!playerRef.current) return;
      isTransitioning.current = true;
      setCurrentTrack(track);
      setIsPlaying(true);
      await logToFile(`Playing track: ${track.title}`);
      playerRef.current.replace(track.uri);
      if (playerRef.current && typeof (playerRef.current as any).setActiveForLockScreen === 'function') {
        (playerRef.current as any).setActiveForLockScreen(true, {
          title: track.title,
          artist: track.artist,
          albumTitle: track.album || 'Unknown Album',
          artworkUrl: track.artwork || undefined,
        });
      }
      playerRef.current.play();
      setTimeout(() => {
        isTransitioning.current = false;
      }, 200);
    } catch (error) {
      await logToFile(`Error playing track: ${error}`, 'ERROR');
      isTransitioning.current = false;
    }
  };

  const playTrack = async (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => {
    if (newQueue) {
      setOriginalPlaylist(newQueue);
      setQueueTitle(title || 'All Songs');
      setPlaybackOrigin(origin || null);
      if (isShuffle) {
        const others = newQueue.filter(t => t.id !== track.id);
        setPlaylistState([track, ...shuffleArray(others)]);
      } else {
        setPlaylistState(newQueue);
      }
    }
    playTrackInternal(track);
  };

  const togglePlayPause = async () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  };

  const seekTo = async (millis: number) => {
    if (playerRef.current) await playerRef.current.seekTo(millis / 1000);
  };

  const playNext = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
      if (repeatMode === 'all') nextIndex = 0;
      else { setIsPlaying(false); return; }
    }
    playTrack(playlist[nextIndex]);
  };

  const playPrev = () => {
    if (!currentTrack || playlist.length === 0) return;
    if (positionMillis > 3000) { seekTo(0); return; }
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === 'all') prevIndex = playlist.length - 1;
      else prevIndex = 0;
    }
    playTrack(playlist[prevIndex]);
  };

  const shuffleArray = (array: Track[]) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  };

  const toggleShuffle = () => {
    const newShuffleState = !isShuffle;
    setIsShuffle(newShuffleState);
    AsyncStorage.setItem(STORAGE_KEY_SHUFFLE, JSON.stringify(newShuffleState));
    if (newShuffleState) {
      if (currentTrack && originalPlaylist.length > 0) {
        const others = originalPlaylist.filter(t => t.id !== currentTrack.id);
        setPlaylistState([currentTrack, ...shuffleArray(others)]);
      } else setPlaylistState(shuffleArray(originalPlaylist));
    } else setPlaylistState(originalPlaylist);
  };
  
  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
    AsyncStorage.setItem(STORAGE_KEY_REPEAT, nextMode);
  };

  const toggleFavorite = (id: string) => {
    const newFavs = favorites.includes(id) ? favorites.filter(fid => fid !== id) : [...favorites, id];
    setFavorites(newFavs);
    AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(newFavs));
  };

  const toggleLyricsView = () => {
    const newValue = !showLyrics;
    setShowLyrics(newValue);
    AsyncStorage.setItem(STORAGE_KEY_SHOW_LYRICS, JSON.stringify(newValue));
  };

  const setPlaylist = (tracks: Track[]) => {
    setOriginalPlaylist(tracks);
    setPlaylistState(isShuffle ? shuffleArray(tracks) : tracks);
  };

  const loadPlaylists = async () => {
    const data = await import('../utils/database').then(m => m.getAllPlaylists());
    setPlaylists(data);
  };

  const createPlaylist = async (title: string) => {
    const id = await import('../utils/database').then(m => m.createPlaylist(title));
    await loadPlaylists();
    return id;
  };

  const addToPlaylist = async (playlistId: string, trackIds: string[]) => {
    await import('../utils/database').then(m => m.addTracksToPlaylist(playlistId, trackIds));
    await loadPlaylists();
  };

  const removeFromPlaylist = async (playlistId: string, trackIds: string[]) => {
    await import('../utils/database').then(m => m.removeFromPlaylist(playlistId, trackIds));
    await loadPlaylists();
  };

  const deletePlaylist = async (playlistId: string) => {
    await import('../utils/database').then(m => m.deletePlaylist(playlistId));
    await loadPlaylists();
  };

  const refreshLibrary = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        let processedCount = 0;
        
        const syncedTracks = await syncLibrary(
          (track) => {
            processedCount++;
            if (processedCount % 10 === 0) {
                setScanProgress(prev => ({ ...prev, current: processedCount }));
            }
          },
          (total) => {
            setScanProgress({ current: 0, total });
          }
        );

        if (Array.isArray(syncedTracks)) {
           const sortedTracks = [...syncedTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
           setLibrary(sortedTracks);
           setPlaylistState(prev => prev.length === 0 ? sortedTracks : prev);
           setOriginalPlaylist(prev => prev.length === 0 ? sortedTracks : prev);
        }
        resolve();
      });
    });
  };

  const importLocalFolder = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await logToFile('Starting folder import...');
          const musicDir = FileSystem.documentDirectory + 'music/';
          await FileSystem.makeDirectoryAsync(musicDir, { intermediates: true });
          if (Platform.OS === 'android') {
            const permissions = await (FileSystem as any).StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              const uri = permissions.directoryUri;
              const files = await (FileSystem as any).StorageAccessFramework.readDirectoryAsync(uri);
              setScanProgress({ current: 0, total: files.length });
              for (let i = 0; i < files.length; i++) {
                const fileUri = files[i];
                const fileName = decodeURIComponent(fileUri).split('/').pop();
                if (fileName) await FileSystem.copyAsync({ from: fileUri, to: musicDir + fileName });
                if (i % 10 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
              }
            }
          } else {
            const result = await DocumentPicker.getDocumentAsync({ type: 'public.folder', copyToCacheDirectory: false });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const uri = result.assets[0].uri;
              const files = await FileSystem.readDirectoryAsync(uri);
              setScanProgress({ current: 0, total: files.length });
              for (let i = 0; i < files.length; i++) {
                const fileName = files[i];
                if (!fileName.startsWith('.')) {
                  await FileSystem.copyAsync({ from: uri + (uri.endsWith('/') ? '' : '/') + fileName, to: musicDir + fileName });
                }
                if (i % 10 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
              }
            }
          }
          let syncCount = 0;
          const finalTracks = await syncLibrary(
            (track) => {
              syncCount++;
              if (syncCount % 10 === 0) {
                setScanProgress(prev => ({ ...prev, current: syncCount }));
              }
            },
            (total) => { setScanProgress({ current: 0, total }); }
          );
          if (finalTracks) {
            const sorted = [...finalTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
            setLibrary(sorted);
          }
        } catch (e) { await logToFile(`Folder import error: ${e}`, 'WARN'); }
        resolve();
      });
    });
  };

  const downloadDemoTrack = async () => {
    try {
      const uri = FileSystem.documentDirectory + 'music/demosong.mp3';
      const lrcUri = FileSystem.documentDirectory + 'music/demosong.lrc';
      await FileSystem.downloadAsync('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', uri);
      const lrcContent = `[00:00.00] Demo Local Track\n[00:05.00] This file is now on your device\n[00:10.00] Testing the offline capability\n[00:15.00] It works!`;
      await FileSystem.writeAsStringAsync(lrcUri, lrcContent);
      await refreshLibrary();
    } catch (e) { await logToFile(`Download failed: ${e}`, 'ERROR'); }
  };

  const pickAndImportFiles = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await logToFile('Picking files to import...');
          const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*', 'application/octet-stream'], multiple: true, copyToCacheDirectory: true });
          if (!result.canceled) {
            const destDir = FileSystem.documentDirectory + 'music/';
            const dirInfo = await FileSystem.getInfoAsync(destDir);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
            setScanProgress({ current: 0, total: result.assets.length });
            for (let i = 0; i < result.assets.length; i++) {
              const file = result.assets[i];
              await FileSystem.copyAsync({ from: file.uri, to: destDir + file.name });
              if (i % 10 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
            }
            let syncCount = 0;
            const finalTracks = await syncLibrary(
              (track) => {
                syncCount++;
                if (syncCount % 10 === 0) {
                    setScanProgress(prev => ({ ...prev, current: syncCount }));
                }
              },
              (total) => { setScanProgress({ current: 0, total }); }
            );
            if (finalTracks) {
              const sorted = [...finalTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
              setLibrary(sorted);
            }
          } else {
             await logToFile('File pick canceled by user.');
          }
        } catch (e) { await logToFile(`Pick and Import failed: ${e}`, 'ERROR'); }
        resolve();
      });
    });
  };

  return (
    <MusicContext.Provider value={{
      currentTrack, isPlaying, positionMillis, durationMillis, isShuffle, repeatMode, favorites, showLyrics,
      playTrack, togglePlayPause, seekTo, playNext, playPrev, toggleShuffle, toggleRepeatMode, toggleFavorite, toggleLyricsView,
      refreshLibrary, removeTrack, importLocalFolder, downloadDemoTrack, pickAndImportFiles,
      library, playlist, setPlaylist, queueTitle, playbackOrigin, playlists, createPlaylist, addToPlaylist, removeFromPlaylist, deletePlaylist, loadPlaylists, isScanning, scanProgress,
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) throw new Error('useMusic must be used within a MusicProvider');
  return context;
};
