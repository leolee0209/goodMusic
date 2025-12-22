import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import TrackPlayer, { 
  Capability, 
  Event, 
  RepeatMode as RNTPRepeatMode, 
  State, 
  useActiveTrack, 
  useIsPlaying, 
  useProgress,
  AppKilledPlaybackBehavior
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
  const playerReadyPromise = useRef<Promise<void> | null>(null);

  // Helper to ensure URI has file:// prefix for RNTP
  const ensureFileUri = (uri: string) => {
      if (!uri) return uri;
      if (uri.startsWith('/') && !uri.startsWith('file://')) {
          return `file://${uri}`;
      }
      return uri;
  };

  /**
   * IMPORTANT: iOS absolute paths change across app launches (UUIDs change).
   * We need to fix stored URIs if they point to an old Caches/artworks directory.
   */
  const resolveArtworkUri = (uri: string | undefined) => {
    if (!uri) return undefined;
    if (Platform.OS !== 'ios') return ensureFileUri(uri);

    if (uri.includes('/Library/Caches/')) {
        const relativePath = uri.split('/Library/Caches/').pop();
        if (relativePath) {
            const resolved = FileSystem.cacheDirectory + relativePath;
            return resolved;
        }
    }
    return ensureFileUri(uri);
  };

  // Helper to serialize Track to RNTP Track
  const toRntpTrack = (track: Track) => ({
    id: track.id,
    url: ensureFileUri(track.uri),
    title: track.title,
    artist: track.artist,
    album: track.album || 'Unknown Album',
    artwork: resolveArtworkUri(track.artwork),
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
        await logToFile(`Action: Removing track - ${track.title} (${trackId})`);
        await import('../utils/database').then(m => m.deleteTrack(trackId));
        const fileInfo = await FileSystem.getInfoAsync(track.uri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(track.uri);
          await logToFile(`File deleted: ${track.uri}`);
        }
        await refreshLibrary();
      } catch (e) {
        await logToFile(`Error removing track: ${e}`, 'ERROR');
      }
    }
  };

  const setupPlayer = async () => {
    if (playerReadyPromise.current) return playerReadyPromise.current;

    playerReadyPromise.current = (async () => {
        try {
            await logToFile('Initializing TrackPlayer native service...');
            
            try {
                await TrackPlayer.setupPlayer({
                    waitForBuffer: true
                });
                await logToFile('TrackPlayer.setupPlayer() successful.');
            } catch (e: any) {
                // Check for "already initialized" errors which are safe to ignore
                const errorStr = String(e);
                if (errorStr.includes('already initialized') || errorStr.includes('already_initialized')) {
                    await logToFile('TrackPlayer was already initialized.');
                } else {
                    throw e;
                }
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
              progressUpdateEventInterval: 1,
              android: {
                  appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlayback
              }
            });
            await logToFile('TrackPlayer capabilities updated.');

            // Verify initialization by calling a simple method
            await TrackPlayer.getState();
            await logToFile('TrackPlayer verification successful.');
          } catch (e) {
            await logToFile(`Critical: TrackPlayer setup failed: ${e}`, 'ERROR');
            playerReadyPromise.current = null; 
            throw e;
          }
    })();

    return playerReadyPromise.current;
  };

  useEffect(() => {
    setupPlayer().catch(e => logToFile(`App mount setupPlayer failed: ${e}`, 'ERROR'));

    const loadData = async () => {
      try {
          await logToFile('App Startup: Loading database and initial tracks...');
          await initDatabase();
          const tracks = await getAllTracks();
          
          const tracksWithResolvedArt = tracks.map(t => ({
              ...t,
              artwork: resolveArtworkUri(t.artwork)
          }));

          setLibrary(tracksWithResolvedArt);
          setPlaylistState(tracksWithResolvedArt);
          setOriginalPlaylist(tracksWithResolvedArt);
          await loadPlaylists();
          await logToFile(`App Startup: Successfully loaded ${tracksWithResolvedArt.length} tracks.`);
      } catch (e) {
          await logToFile(`App Startup: loadData failed: ${e}`, 'ERROR');
      }
    };
    loadData();

    const loadPreferences = async () => {
      try {
        await logToFile('App Startup: Loading user preferences...');
        const shuffle = await AsyncStorage.getItem(STORAGE_KEY_SHUFFLE);
        const repeat = await AsyncStorage.getItem(STORAGE_KEY_REPEAT);
        const favs = await AsyncStorage.getItem(STORAGE_KEY_FAVORITES);
        const lyrics = await AsyncStorage.getItem(STORAGE_KEY_SHOW_LYRICS);
        if (shuffle !== null) setIsShuffle(JSON.parse(shuffle));
        if (repeat !== null) {
            const mode = repeat as RepeatMode;
            setRepeatMode(mode);
            await applyRepeatMode(mode);
        }
        if (favs !== null) {
            const parsedFavs = JSON.parse(favs);
            setFavorites(parsedFavs);
            await logToFile(`Loaded ${parsedFavs.length} favorites.`);
        }
        if (lyrics !== null) setShowLyrics(JSON.parse(lyrics));
      } catch (e) {
        await logToFile(`App Startup: loadPreferences failed: ${e}`, 'ERROR');
      }
    };
    loadPreferences();
  }, []);

  const playTrack = async (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => {
    try {
      await setupPlayer(); 

      if (newQueue) {
        await logToFile(`Action: playTrack with new queue - ${track.title} | Queue size: ${newQueue.length}`);
        setOriginalPlaylist(newQueue);
        setQueueTitle(title || 'All Songs');
        setPlaybackOrigin(origin || null);
        
        let queueToPlay = newQueue;
        if (isShuffle) {
          const others = newQueue.filter(t => t.id !== track.id);
          queueToPlay = [track, ...shuffleArray(others)];
          await logToFile(`Shuffle is ON: Shuffled queue for playback.`);
        }
        
        setPlaylistState(queueToPlay);
        
        await TrackPlayer.reset();
        await TrackPlayer.add(queueToPlay.map(toRntpTrack));
        await applyRepeatMode(repeatMode);
        await TrackPlayer.play();
      } else {
        await logToFile(`Action: playTrack (existing queue) - ${track.title}`);
        const index = playlist.findIndex(t => t.id === track.id);
        if (index !== -1) {
            await TrackPlayer.skip(index);
            await TrackPlayer.play();
        } else {
             await logToFile(`Track not in current playlist, resetting queue to single track.`);
             await TrackPlayer.reset();
             await TrackPlayer.add(toRntpTrack(track));
             await TrackPlayer.play();
        }
      }
    } catch (error) {
      await logToFile(`Error in playTrack: ${error}`, 'ERROR');
    }
  };

  const togglePlayPause = async () => {
    try {
        await setupPlayer();
        const state = await TrackPlayer.getState();
        if (state === State.Playing) {
          await TrackPlayer.pause();
          await logToFile('Playback: Paused');
        } else {
          await TrackPlayer.play();
          await logToFile('Playback: Playing');
        }
    } catch (e) {
        await logToFile(`Error togglePlayPause: ${e}`, 'ERROR');
    }
  };

  const seekTo = async (millis: number) => {
    try {
        await setupPlayer();
        await TrackPlayer.seekTo(millis / 1000);
        await logToFile(`Playback: Seek to ${millis}ms`);
    } catch (e) {
        await logToFile(`Error seekTo: ${e}`, 'ERROR');
    }
  };

  const playNext = async () => {
    try {
        await setupPlayer();
        await logToFile('Playback: Skip to Next');
        await TrackPlayer.skipToNext();
    } catch (e) {
        await logToFile(`Error playNext: ${e}`, 'WARN');
    }
  };

  const playPrev = async () => {
    try {
        await setupPlayer();
        if (position > 3) {
            await logToFile('Playback: Restarting current track');
            await TrackPlayer.seekTo(0);
        } else {
            await logToFile('Playback: Skip to Previous');
            await TrackPlayer.skipToPrevious();
        }
    } catch (e) {
        await logToFile(`Error playPrev: ${e}`, 'WARN');
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
    await logToFile(`Preference: Shuffle toggled ${newShuffleState ? 'ON' : 'OFF'}`);
    AsyncStorage.setItem(STORAGE_KEY_SHUFFLE, JSON.stringify(newShuffleState));
    
    if (activeTrack) {
        try {
            await setupPlayer();
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
            await logToFile('Native queue updated for shuffle change.');
        } catch (e) {
            await logToFile(`Error updating queue for shuffle: ${e}`, 'ERROR');
        }
    }
  };
  
  const applyRepeatMode = async (mode: RepeatMode) => {
      try {
          await setupPlayer();
          if (mode === 'none') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Off);
          if (mode === 'all') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Queue);
          if (mode === 'one') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Track);
          await logToFile(`Native Player: RepeatMode applied - ${mode}`);
      } catch (e) {
          await logToFile(`Error applyRepeatMode: ${e}`, 'ERROR');
      }
  };

  const toggleRepeatMode = () => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    setRepeatMode(nextMode);
    applyRepeatMode(nextMode);
    AsyncStorage.setItem(STORAGE_KEY_REPEAT, nextMode);
    logToFile(`Preference: RepeatMode changed to ${nextMode}`);
  };

  const toggleFavorite = (id: string) => {
    const isFav = favorites.includes(id);
    const newFavs = isFav ? favorites.filter(fid => fid !== id) : [...favorites, id];
    setFavorites(newFavs);
    AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(newFavs));
    logToFile(`Action: Favorite toggled for ${id} (${!isFav ? 'Added' : 'Removed'})`);
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
    await logToFile(`Action: Created playlist - ${title}`);
    await loadPlaylists();
    return id;
  };

  const addToPlaylist = async (playlistId: string, trackIds: string[]) => {
    await import('../utils/database').then(m => m.addTracksToPlaylist(playlistId, trackIds));
    await logToFile(`Action: Added ${trackIds.length} tracks to playlist ${playlistId}`);
    await loadPlaylists();
  };

  const removeFromPlaylist = async (playlistId: string, trackIds: string[]) => {
    await import('../utils/database').then(m => m.removeFromPlaylist(playlistId, trackIds));
    await logToFile(`Action: Removed ${trackIds.length} tracks from playlist ${playlistId}`);
    await loadPlaylists();
  };

  const deletePlaylist = async (playlistId: string) => {
    await import('../utils/database').then(m => m.deletePlaylist(playlistId));
    await logToFile(`Action: Deleted playlist ${playlistId}`);
    await loadPlaylists();
  };

  const refreshLibrary = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        await logToFile('Task: Refreshing full library sync...');
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
           const tracksWithResolvedArt = syncedTracks.map(t => ({
               ...t,
               artwork: resolveArtworkUri(t.artwork)
           }));
           const sortedTracks = [...tracksWithResolvedArt].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
           setLibrary(sortedTracks);
           setPlaylistState(prev => prev.length === 0 ? sortedTracks : prev);
           setOriginalPlaylist(prev => prev.length === 0 ? sortedTracks : prev);
           await logToFile(`Sync completed: ${sortedTracks.length} tracks updated.`);
        }
        resolve();
      });
    });
  };

  const processAndAddFiles = async (fileUris: string[]) => {
    const albumArtCache = new Map<string, string>();
    const newTracks: Track[] = [];
    let processed = 0;
    
    await logToFile(`Task: Processing ${fileUris.length} newly added files...`);
    const existingUris = new Set(library.map(t => t.uri));
    const uniqueFiles = fileUris.filter(uri => !existingUris.has(uri));
    await logToFile(`Found ${uniqueFiles.length} unique files to parse.`);

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
            artwork: resolveArtworkUri(metadata.artwork),
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
        await logToFile(`Successfully imported and added ${newTracks.length} tracks to library.`);
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
          await logToFile('Action: Starting folder import from device...');
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
          
        } catch (e) { await logToFile(`Critical Error in folder import: ${e}`, 'ERROR'); }
        resolve();
      });
    });
  };

  const downloadDemoTrack = async () => {
    try {
      await logToFile('Action: Downloading demo track...');
      const uri = FileSystem.documentDirectory + 'music/demosong.mp3';
      const lrcUri = FileSystem.documentDirectory + 'music/demosong.lrc';
      await FileSystem.downloadAsync('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', uri);
      const lrcContent = `[00:00.00] Demo Local Track\n[00:05.00] This file is now on your device\n[00:10.00] Testing the offline capability\n[00:15.00] It works!`;
      await FileSystem.writeAsStringAsync(lrcUri, lrcContent);
      await processAndAddFiles([uri]);
    } catch (e) { await logToFile(`Error downloading demo track: ${e}`, 'ERROR'); }
  };

  const pickAndImportFiles = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await logToFile('Action: Picking specific files to import...');
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
        } catch (e) { await logToFile(`Error in pickAndImportFiles: ${e}`, 'ERROR'); }
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
