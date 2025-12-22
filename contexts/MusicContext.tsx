import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import TrackPlayer, { 
  Capability, 
  Event, 
  RepeatMode as RNTPRepeatMode, 
  State, 
  useActiveTrack, 
  useIsPlaying, 
  useProgress 
} from 'react-native-track-player';
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
  // RNTP Hooks
  const activeTrack = useActiveTrack();
  const { playing } = useIsPlaying();
  const { position, duration } = useProgress();

  // Local State
  const [library, setLibrary] = useState<Track[]>([]);
  const [playlist, setPlaylistState] = useState<Track[]>([]); // UI representation of queue
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

  // Helper to ensure URI has file:// prefix for RNTP
  const ensureFileUri = (uri: string) => {
      if (uri.startsWith('/') && !uri.startsWith('file://')) {
          return `file://${uri}`;
      }
      return uri;
  };

  // Helper to serialize Track to RNTP Track
  const toRntpTrack = (track: Track) => ({
    id: track.id,
    url: ensureFileUri(track.uri),
    title: track.title,
    artist: track.artist,
    album: track.album || 'Unknown Album',
    artwork: track.artwork ? ensureFileUri(track.artwork) : undefined,
    duration: track.duration ? track.duration / 1000 : 0, 
    original: track 
  });

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

  useEffect(() => {
    const setup = async () => {
      try {
        await logToFile('Setting up TrackPlayer...');
        const isSetup = await TrackPlayer.isServiceRunning().catch(() => false);
        if (!isSetup) {
            await TrackPlayer.setupPlayer();
        }
        
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
          ],
          progressUpdateEventInterval: 1
        });
        await logToFile('TrackPlayer setup complete.');
      } catch (e) {
        await logToFile(`Error setting up TrackPlayer: ${e}`, 'ERROR');
      }
    };
    setup();

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
        if (repeat !== null) {
            const mode = repeat as RepeatMode;
            setRepeatMode(mode);
            applyRepeatMode(mode);
        }
        if (favs !== null) setFavorites(JSON.parse(favs));
        if (lyrics !== null) setShowLyrics(JSON.parse(lyrics));
      } catch (e) {
        await logToFile(`Error loading preferences: ${e}`, 'ERROR');
      }
    };
    loadPreferences();
  }, []);

  const playTrack = async (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => {
    try {
      if (newQueue) {
        setOriginalPlaylist(newQueue);
        setQueueTitle(title || 'All Songs');
        setPlaybackOrigin(origin || null);
        
        let queueToPlay = newQueue;
        if (isShuffle) {
          const others = newQueue.filter(t => t.id !== track.id);
          queueToPlay = [track, ...shuffleArray(others)];
        }
        
        setPlaylistState(queueToPlay);
        
        await TrackPlayer.reset();
        await TrackPlayer.add(queueToPlay.map(toRntpTrack));
        await TrackPlayer.play();
      } else {
        const index = playlist.findIndex(t => t.id === track.id);
        if (index !== -1) {
            await TrackPlayer.skip(index);
            await TrackPlayer.play();
        } else {
             await TrackPlayer.reset();
             await TrackPlayer.add(toRntpTrack(track));
             await TrackPlayer.play();
        }
      }
      
      await logToFile(`Playing track: ${track.title}`);
    } catch (error) {
      await logToFile(`Error playing track: ${error}`, 'ERROR');
    }
  };

  const togglePlayPause = async () => {
    const state = await TrackPlayer.getState();
    if (state === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  };

  const seekTo = async (millis: number) => {
    await TrackPlayer.seekTo(millis / 1000);
  };

  const playNext = async () => {
    await TrackPlayer.skipToNext().catch(() => {});
  };

  const playPrev = async () => {
    if (position > 3) {
        await TrackPlayer.seekTo(0);
    } else {
        await TrackPlayer.skipToPrevious().catch(() => {});
    }
  };

  const shuffleArray = (array: Track[]) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  };

  const toggleShuffle = async () => {
    const newShuffleState = !isShuffle;
    setIsShuffle(newShuffleState);
    AsyncStorage.setItem(STORAGE_KEY_SHUFFLE, JSON.stringify(newShuffleState));
    
    if (activeTrack) {
        const currentId = activeTrack.id;
        const currentTrackObj = originalPlaylist.find(t => t.id === currentId);
        
        let newQueue = [];
        if (newShuffleState) {
             const others = originalPlaylist.filter(t => t.id !== currentId);
             newQueue = currentTrackObj ? [currentTrackObj, ...shuffleArray(others)] : shuffleArray(others);
        } else {
             newQueue = originalPlaylist;
        }
        
        setPlaylistState(newQueue);
        await TrackPlayer.reset();
        await TrackPlayer.add(newQueue.map(toRntpTrack));
        const newIndex = newQueue.findIndex(t => t.id === currentId);
        if (newIndex !== -1) await TrackPlayer.skip(newIndex);
        await TrackPlayer.play();
    }
  };
  
  const applyRepeatMode = async (mode: RepeatMode) => {
      if (mode === 'none') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Off);
      if (mode === 'all') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Queue);
      if (mode === 'one') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Track);
  };

  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
    applyRepeatMode(nextMode);
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

  const processAndAddFiles = async (fileUris: string[]) => {
    const albumArtCache = new Map<string, string>();
    const newTracks: Track[] = [];
    let processed = 0;
    
    const existingUris = new Set(library.map(t => t.uri));
    const uniqueFiles = fileUris.filter(uri => !existingUris.has(uri));

    setScanProgress({ current: 0, total: uniqueFiles.length });
    setIsScanning(true);

    try {
      const { parseMetadata } = await import('../utils/fileScanner');
      const { insertTracks } = await import('../utils/database');

      for (const uri of uniqueFiles) {
        try {
          const fileName = uri.split('/').pop() || "";
          const metadata = await parseMetadata(uri, fileName, albumArtCache);
          
          let lrcContent = undefined;
          const dirPath = uri.substring(0, uri.lastIndexOf('/') + 1);
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          try {
             const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
             if (lrcInfo.exists) lrcContent = await FileSystem.readAsStringAsync(lrcUri);
          } catch(e) {}

          const track: Track = {
            id: uri,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            uri: uri,
            artwork: metadata.artwork,
            lrc: lrcContent,
            trackNumber: metadata.trackNumber,
            duration: metadata.duration
          };

          newTracks.push(track);
          processed++;
          if (processed % 5 === 0) {
             setScanProgress(prev => ({ ...prev, current: processed }));
          }
        } catch (e) {
          await logToFile(`Failed to process imported file ${uri}: ${e}`, 'WARN');
        }
      }

      if (newTracks.length > 0) {
        await insertTracks(newTracks);
        setLibrary(prev => {
          const updated = [...prev, ...newTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
          return updated;
        });
        if (queueTitle === 'All Songs') {
             setPlaylistState(prev => isShuffle ? [...prev, ...newTracks] : [...prev, ...newTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })));
             setOriginalPlaylist(prev => [...prev, ...newTracks].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })));
        }
      }
    } catch (e) {
      await logToFile(`Error in processAndAddFiles: ${e}`, 'ERROR');
    } finally {
      setIsScanning(false);
      setScanProgress({ current: 0, total: 0 });
    }
  };

  const importLocalFolder = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await logToFile('Starting folder import...');
          const musicDir = FileSystem.documentDirectory + 'music/';
          await FileSystem.makeDirectoryAsync(musicDir, { intermediates: true });
          
          const newFileUris: string[] = [];

          if (Platform.OS === 'android') {
            const permissions = await (FileSystem as any).StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              const uri = permissions.directoryUri;
              const files = await (FileSystem as any).StorageAccessFramework.readDirectoryAsync(uri);
              setScanProgress({ current: 0, total: files.length });
              
              for (let i = 0; i < files.length; i++) {
                const fileUri = files[i];
                const fileName = decodeURIComponent(fileUri).split('/').pop();
                if (fileName) {
                    const destUri = musicDir + fileName;
                    await FileSystem.copyAsync({ from: fileUri, to: destUri });
                    newFileUris.push(destUri);
                }
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
                  const destUri = musicDir + fileName;
                  await FileSystem.copyAsync({ from: uri + (uri.endsWith('/') ? '' : '/') + fileName, to: destUri });
                  newFileUris.push(destUri);
                }
                if (i % 10 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
              }
            }
          }
          
          if (newFileUris.length > 0) {
              await processAndAddFiles(newFileUris);
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
      await processAndAddFiles([uri]);
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
            
            const newFileUris: string[] = [];
            setScanProgress({ current: 0, total: result.assets.length });
            
            for (let i = 0; i < result.assets.length; i++) {
              const file = result.assets[i];
              const destUri = destDir + file.name;
              await FileSystem.copyAsync({ from: file.uri, to: destUri });
              newFileUris.push(destUri);
              if (i % 10 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
            }
            
            if (newFileUris.length > 0) {
                await processAndAddFiles(newFileUris);
            }
          } else {
             await logToFile('File pick canceled by user.');
          }
        } catch (e) { await logToFile(`Pick and Import failed: ${e}`, 'ERROR'); }
        resolve();
      });
    });
  };

  const mappedCurrentTrack: Track | null = activeTrack ? {
    id: activeTrack.id || '',
    title: activeTrack.title || 'Unknown Title',
    artist: activeTrack.artist || 'Unknown Artist',
    album: activeTrack.album,
    uri: activeTrack.url as string,
    artwork: activeTrack.artwork,
    duration: (activeTrack.duration || 0) * 1000, 
    lrc: (activeTrack as any).original?.lrc, 
    trackNumber: (activeTrack as any).original?.trackNumber
  } : null;

  return (
    <MusicContext.Provider value={{
      currentTrack: mappedCurrentTrack, 
      isPlaying: playing || false, 
      positionMillis: position * 1000, 
      durationMillis: duration * 1000, 
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
      removeTrack, 
      importLocalFolder, 
      downloadDemoTrack, 
      pickAndImportFiles,
      library, 
      playlist, 
      setPlaylist, 
      queueTitle, 
      playbackOrigin, 
      playlists, 
      createPlaylist, 
      addToPlaylist, 
      removeFromPlaylist, 
      deletePlaylist, 
      loadPlaylists, 
      isScanning, 
      scanProgress,
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
