import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createAudioPlayer, AudioPlayer, AudioStatus, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, MusicContextType, RepeatMode } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTracks, initDatabase } from '../utils/database';
import { syncLibrary } from '../utils/librarySync';

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
  
  const [playlist, setPlaylistState] = useState<Track[]>([]);
  const [originalPlaylist, setOriginalPlaylist] = useState<Track[]>([]);
  
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);
  const [activeGroup, setActiveGroup] = useState<{ title: string; tracks: Track[] } | null>(null);
  
  const playerRef = useRef<AudioPlayer | null>(null);

  // We need refs to access latest state in event listeners
  const stateRef = useRef({ repeatMode, playlist, currentTrack, isShuffle });
  useEffect(() => {
    stateRef.current = { repeatMode, playlist, currentTrack, isShuffle };
  }, [repeatMode, playlist, currentTrack, isShuffle]);

  useEffect(() => {
    // 1. Configure Audio Mode
    const configureAudio = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers' 
        });
      } catch (e) {
        console.error("Error configuring audio:", e);
      }
    };
    configureAudio();

    // 2. Init Player
    const player = createAudioPlayer(null);
    playerRef.current = player;

    // 3. Setup Listener
    const listener = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      // Map seconds to millis for compatibility
      setPositionMillis(status.currentTime * 1000);
      setDurationMillis(status.duration * 1000);
      setIsPlaying(status.playing);
      
      if (status.didJustFinish) {
        handleTrackEnd();
      }
    });

    // 4. Load Data
    const loadLibrary = async () => {
      await initDatabase();
      const tracks = await getAllTracks();
      setPlaylist(tracks);
      setOriginalPlaylist(tracks);
    };
    loadLibrary();

    // 5. Load Preferences
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
        console.error("Error loading preferences:", e);
      }
    };
    loadPreferences();

    return () => {
      listener.remove();
      // player.remove() might be needed if supported to cleanup native resources
      // player.release() ? expo-audio documentation usually clarifies. 
      // Assuming GC handles it or remove() if method exists.
      // SharedObject typically has release() or similar?
      // createAudioPlayer docs say "doesn't release automatically".
      // But we keep it alive for app lifetime usually.
    };
  }, []);

  const handleTrackEnd = () => {
    const { repeatMode, playlist, currentTrack, isShuffle } = stateRef.current;
    
    if (repeatMode === 'one') {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
    } else {
      if (!currentTrack || playlist.length === 0) return;
      const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
      const nextIndex = (currentIndex + 1) % playlist.length;
      
      if (nextIndex === 0 && repeatMode !== 'all') {
         // Stop
         return; 
      }
      playTrackInternal(playlist[nextIndex]);
    }
  };

  // Internal helper to avoid circular dependency or stale state issues if needed
  // But playTrack is stable.
  const playTrackInternal = async (track: Track) => {
    try {
      if (!playerRef.current) return;
      playerRef.current.replace(track.uri);
      playerRef.current.play();
      setCurrentTrack(track);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing track:', error);
    }
  };

  const playTrack = async (track: Track) => {
    playTrackInternal(track);
  };

  const togglePlayPause = async () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
  };

  const seekTo = async (millis: number) => {
    if (playerRef.current) {
      // Convert millis to seconds
      await playerRef.current.seekTo(millis / 1000);
    }
  };

  const playNext = () => {
    if (!currentTrack || playlist.length === 0) return;
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    let nextIndex = currentIndex + 1;

    if (nextIndex >= playlist.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        setIsPlaying(false);
        return; 
      }
    }
    playTrack(playlist[nextIndex]);
  };

  const playPrev = () => {
    if (!currentTrack || playlist.length === 0) return;
    if (positionMillis > 3000) {
      seekTo(0);
      return;
    }
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = playlist.length - 1;
      } else {
        prevIndex = 0;
      }
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
        const shuffledOthers = shuffleArray(others);
        setPlaylistState([currentTrack, ...shuffledOthers]);
      } else {
         setPlaylistState(shuffleArray(originalPlaylist));
      }
    } else {
      setPlaylistState(originalPlaylist);
    }
  };
  
  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    const newMode = modes[(currentIndex + 1) % modes.length];
    setRepeatMode(newMode);
    AsyncStorage.setItem(STORAGE_KEY_REPEAT, newMode);
  };

  const toggleFavorite = (id: string) => {
    let newFavorites;
    if (favorites.includes(id)) {
      newFavorites = favorites.filter(favId => favId !== id);
    } else {
      newFavorites = [...favorites, id];
    }
    setFavorites(newFavorites);
    AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(newFavorites));
  };

  const toggleLyricsView = () => {
    const newValue = !showLyrics;
    setShowLyrics(newValue);
    AsyncStorage.setItem(STORAGE_KEY_SHOW_LYRICS, JSON.stringify(newValue));
  };

  const setPlaylist = (tracks: Track[]) => {
    setOriginalPlaylist(tracks);
    if (isShuffle) {
       setPlaylistState(shuffleArray(tracks));
    } else {
       setPlaylistState(tracks);
    }
  };

  const refreshLibrary = async () => {
    const syncedTracks = await syncLibrary();
    if (Array.isArray(syncedTracks) && syncedTracks.length > 0) {
       setPlaylist(syncedTracks);
       setOriginalPlaylist(syncedTracks);
    } else {
       const dbTracks = await getAllTracks();
       setPlaylist(dbTracks);
       setOriginalPlaylist(dbTracks);
    }
  };

  const importLocalFolder = async () => {
    if (Platform.OS === 'android') {
      try {
        const permissions = await (FileSystem as any).StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const uri = permissions.directoryUri;
          const tracks = await import('../utils/fileScanner').then(m => m.scanFolder(uri));
          
          if (tracks.length > 0) {
             await import('../utils/database').then(m => m.insertTracks(tracks));
             refreshLibrary();
          }
        }
      } catch (e) {
        console.warn("Permission rejected or error", e);
      }
    } else {
      refreshLibrary();
    }
  };

  const downloadDemoTrack = async () => {
    try {
      const uri = (FileSystem as any).documentDirectory + 'demosong.mp3';
      const lrcUri = (FileSystem as any).documentDirectory + 'demosong.lrc';
      
      await FileSystem.downloadAsync(
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        uri
      );
      
      const lrcContent = `[00:00.00] Demo Local Track
[00:05.00] This file is now on your device
[00:10.00] Testing the offline capability
[00:15.00] It works!`;
      await FileSystem.writeAsStringAsync(lrcUri, lrcContent);
      
      console.log("Demo track downloaded to:", uri);
      refreshLibrary();
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const pickAndImportFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'application/octet-stream'],
        multiple: true,
        copyToCacheDirectory: true
      });

      if (!result.canceled) {
        const destDir = (FileSystem as any).documentDirectory + 'Imported/';
        const dirInfo = await FileSystem.getInfoAsync(destDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        }

        for (const file of result.assets) {
          const destUri = destDir + file.name;
          await FileSystem.copyAsync({
            from: file.uri,
            to: destUri
          });
        }
        refreshLibrary();
      }
    } catch (e) {
      console.error("Pick and Import failed:", e);
    }
  };

  return (
    <MusicContext.Provider value={{
      currentTrack,
      isPlaying,
      positionMillis,
      durationMillis,
      isShuffle,
      repeatMode,
      favorites,
      showLyrics,
      playTrack,
      togglePlayPause,
      seekTo,
      playNext,
      playPrev,
      toggleShuffle,
      toggleRepeatMode,
      toggleFavorite,
      toggleLyricsView,
      refreshLibrary,
      importLocalFolder,
      downloadDemoTrack,
      pickAndImportFiles,
      playlist,
      setPlaylist,
      activeGroup,
      setActiveGroup,
    }}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = () => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};