import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import TrackPlayer, { State, useActiveTrack, useIsPlaying, useProgress } from 'react-native-track-player';
import {
  ensureMusicDir,
  importFilesFromAndroidFolder,
  importFilesFromIosFolder,
  importFilesFromPicker
} from '../services/fileImportService';
import {
  buildLyricsUpdateBatch,
  buildMetadataUpdateBatch,
  parseAndEnrichTrack,
  processTracksWithArtwork,
  refreshMetadataForTrack
} from '../services/libraryService';
import {
  addTracksInBatches,
  applyRepeatModeNative,
  ensurePlayerSetup,
  resetAndLoadQueue,
  resolveArtworkUri as resolveArtworkFromService,
  rotateQueue,
  toRntpTrack
} from '../services/playerService';
import { MusicContextType, PlaybackOrigin, Playlist, RepeatMode, Track } from '../types';
import { addToHistory, getAllTracks, getPlaybackHistory, initDatabase, removeDuplicates } from '../utils/database';
import { ensureMusicDirectory } from '../utils/librarySync';
import { logToFile } from '../utils/logger';
import { toAbsoluteUri, toRelativePath } from '../utils/pathUtils';

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const STORAGE_KEY_SHUFFLE = '@goodmusic_shuffle';
const STORAGE_KEY_REPEAT = '@goodmusic_repeat';
const STORAGE_KEY_FAVORITES = '@goodmusic_favorites';
const STORAGE_KEY_SHOW_LYRICS = '@goodmusic_show_lyrics';

const MUSIC_DIR = Paths.document.uri + (Paths.document.uri.endsWith('/') ? '' : '/') + 'music/';

const shuffleArray = (array: Track[]) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildQueueForTrack = (
  track: Track,
  incomingQueue: Track[] | undefined,
  originalQueue: Track[],
  isShuffle: boolean
) => {
  const baseQueue = incomingQueue?.length ? [...incomingQueue] : [...originalQueue];
  if (baseQueue.length === 0) return { queue: [track], startIndex: 0, logicalQueue: [track] };

  if (isShuffle) {
    const others = baseQueue.filter(t => t.id !== track.id);
    return { queue: [track, ...shuffleArray(others)], startIndex: 0, logicalQueue: baseQueue };
  }

  const startIndex = baseQueue.findIndex(t => t.id === track.id);
  if (startIndex === -1) {
    return { queue: [track, ...baseQueue], startIndex: 0, logicalQueue: baseQueue };
  }
  return { queue: baseQueue, startIndex, logicalQueue: baseQueue };
};

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
  const [history, setHistory] = useState<string[]>([]);
  const [optimisticTrack, setOptimisticTrack] = useState<Track | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Monitor active track to clear transitioning state
  useEffect(() => {
    if (isTransitioning && optimisticTrack && activeTrack) {
       // Simplify check using relative paths (ID in RNTP is set to relative path)
       const activeRelativeId = activeTrack.id; // already relative from toRntpTrack
       const optimisticRelativeId = toRelativePath(optimisticTrack.id);
       
       if (activeRelativeId === optimisticRelativeId) {
           setIsTransitioning(false);
           setOptimisticTrack(null);
       }
    }
  }, [activeTrack, optimisticTrack, isTransitioning]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);

  const updateQueue = useRef<Promise<void>>(Promise.resolve());

  const lastPlayRequestId = useRef<string>("");

  const resolveArtworkUri = (uri: string | null | undefined) => resolveArtworkFromService(uri);

  // Queue helpers now live in services/playerService

  const queueTask = (task: () => Promise<void>) => {
    updateQueue.current = updateQueue.current.then(async () => {
      setIsScanning(true);
      setScanMessage(null);
      try {
        await task();
      } finally {
        setIsScanning(false);
        setScanProgress({ current: 0, total: 0 });
      }
    });
  };

  const refreshTrackMetadata = async (trackId: string) => {
    const track = library.find(t => t.id === trackId);
    if (!track) return;

    try {
      setIsScanning(true);
      setScanMessage(`Updating ${track.title}...`);
      await logToFile(`Action: Refreshing metadata for ${track.title}`);
      const { parseMetadata, createAlbumArtCache } = await import('../utils/fileScanner');
      const { insertTracks } = await import('../utils/database');
      
      const albumArtCache = createAlbumArtCache();
      const updated = await refreshMetadataForTrack(track, parseMetadata, albumArtCache);
      await insertTracks([updated]);
      setLibrary(prev => prev.map(t => t.id === trackId ? updated : t));
      setPlaylistState(prev => prev.map(t => t.id === trackId ? updated : t));
      setOriginalPlaylist(prev => prev.map(t => t.id === trackId ? updated : t));
      await logToFile('Metadata refreshed successfully.');
    } catch (e) {
      await logToFile(`Error refreshing metadata: ${e}`, 'ERROR');
    } finally {
      setIsScanning(false);
      setScanMessage(null);
    }
  };

  const refreshAllMetadata = async () => {
    queueTask(async () => {
      setScanMessage("Reloading tags and artwork...");
      await logToFile('Action: Refreshing metadata for ALL tracks...');
      const { parseMetadata } = await import('../utils/fileScanner');
      const { insertTracks } = await import('../utils/database');
      
      setScanProgress({ current: 0, total: library.length });
      const updates = await buildMetadataUpdateBatch(
        library,
        parseMetadata,
        (current) => setScanProgress(prev => ({ ...prev, current }))
      );

      if (updates.length > 0) {
        await insertTracks(updates);
        await removeDuplicates();
        const updateMap = new Map(updates.map(u => [u.id, u]));
        const sorted = library
          .map(t => updateMap.get(t.id) || t)
          .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
        setLibrary(sorted);
        await logToFile(`Metadata refresh complete. Updated ${updates.length} tracks.`);
      }
      setScanProgress({ current: 0, total: 0 });
    });
  };

  const rescanLyrics = async () => {
    queueTask(async () => {
      setScanMessage("Rescanning .lrc files...");
      await logToFile('Action: Rescanning lyrics for all tracks...');
      const { insertTracks } = await import('../utils/database');

      setScanProgress({ current: 0, total: library.length });
      const updates = await buildLyricsUpdateBatch(
        library,
        (current) => setScanProgress(prev => ({ ...prev, current }))
      );

      if (updates.length > 0) {
        await insertTracks(updates);
        const updateMap = new Map(updates.map(u => [u.id, u]));
        setLibrary(prev => prev.map(t => updateMap.get(t.id) || t));
        await logToFile(`Lyrics rescan complete. Updated ${updates.length} tracks.`);
      } else {
        await logToFile('Lyrics rescan complete. No updates found.');
      }
      setScanProgress({ current: 0, total: 0 });
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

  const setupPlayer = async () => ensurePlayerSetup();

  useEffect(() => {
    setupPlayer().catch(e => logToFile(`App mount setupPlayer failed: ${e}`, 'ERROR'));

    const loadData = async () => {
      try {
          await logToFile('App Startup: Loading database and initial tracks...');
          await ensureMusicDirectory();
          await initDatabase();
          const tracks = await getAllTracks();
          
          const tracksWithResolvedArt = processTracksWithArtwork(tracks, resolveArtworkUri);

          setLibrary(tracksWithResolvedArt);
          setPlaylistState(tracksWithResolvedArt);
          setOriginalPlaylist(tracksWithResolvedArt);
          await loadPlaylists();
          
          const hist = await getPlaybackHistory();
          setHistory(hist);
          
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
            const absoluteFavs = parsedFavs.map((id: string) => toAbsoluteUri(id));
            setFavorites(absoluteFavs);
            await logToFile(`Loaded ${parsedFavs.length} favorites.`);
        }
        if (lyrics !== null) setShowLyrics(JSON.parse(lyrics));
      } catch (e) {
        await logToFile(`App Startup: loadPreferences failed: ${e}`, 'ERROR');
      }
    };
    loadPreferences();
  }, []);

  const updateHistory = (trackId: string) => {
    addToHistory(trackId).then(async () => {
      const hist = await getPlaybackHistory();
      setHistory(hist);
    });
  };

  const playTrack = async (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => {
    const requestId = track.id + Date.now();
    lastPlayRequestId.current = requestId;

    try {
      await logToFile(`PlayTrack: request for "${track.title}" (${requestId})`);
      setOptimisticTrack(track);
      setIsTransitioning(true);
      updateHistory(track.id);
      await setupPlayer();
      if (lastPlayRequestId.current !== requestId) return;

      const { queue, startIndex, logicalQueue } = buildQueueForTrack(track, newQueue, originalPlaylist, isShuffle);
      if (newQueue) {
        setOriginalPlaylist(logicalQueue);
        setQueueTitle(title || 'All Songs');
        setPlaybackOrigin(origin || null);
      }
      setPlaylistState(queue);
      if (lastPlayRequestId.current !== requestId) return;

      const rotated = rotateQueue(queue, startIndex).map(toRntpTrack);
      await resetAndLoadQueue({ tracks: rotated, repeatMode });

      setTimeout(async () => {
        if (lastPlayRequestId.current !== requestId) return;
        try {
          const currentTrack = await TrackPlayer.getActiveTrack();
          const currentId = currentTrack?.id;
          const targetId = toRelativePath(track.id);
          await logToFile(`PlayTrack verify: active ${currentId} target ${targetId}`);
        } catch (e) {
          await logToFile(`PlayTrack verify error: ${e}`, 'WARN');
        }
      }, 2000);
    } catch (error) {
      if (lastPlayRequestId.current === requestId) {
        setOptimisticTrack(null);
        setIsTransitioning(false);
        await logToFile(`PlayTrack: error ${error}`, 'ERROR');
      }
    }
  };

  const togglePlayPause = async () => {
    try {
        await setupPlayer();
        const state = await TrackPlayer.getState();
        await logToFile(`Playback: togglePlayPause called. Current state: ${state}`);
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
        const state = await TrackPlayer.getState();
        await logToFile(`Playback: seekTo ${millis}ms called. State: ${state}`);
        await TrackPlayer.seekTo(millis / 1000);
        await logToFile(`Playback: Seek to ${millis}ms successful`);
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

  const toggleShuffle = async () => {
    const newShuffleState = !isShuffle;
    setIsShuffle(newShuffleState);
    await logToFile(`Preference: Shuffle toggled ${newShuffleState ? 'ON' : 'OFF'}`);
    AsyncStorage.setItem(STORAGE_KEY_SHUFFLE, JSON.stringify(newShuffleState));
    
    if (activeTrack) {
      try {
        await setupPlayer();
        const currentId = toAbsoluteUri(activeTrack.id);
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
            
            // Optimization: Rotate new queue so current track is first
            const newIndex = newQueue.findIndex(t => t.id === currentId);
            const rotatedQueue = newIndex !== -1 
                ? [...newQueue.slice(newIndex), ...newQueue.slice(0, newIndex)]
                : newQueue;

            await addTracksInBatches(rotatedQueue.map(toRntpTrack), async () => {
                await TrackPlayer.play();
            });
            
            await logToFile('Native queue updated for shuffle change (Rotated).');
        } catch (e) {
            await logToFile(`Error updating queue for shuffle: ${e}`, 'ERROR');
        }
    }
  };
  
  const applyRepeatMode = async (mode: RepeatMode) => {
    try {
      await setupPlayer();
      await applyRepeatModeNative(mode);
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
    
    const relativeFavs = newFavs.map(fid => toRelativePath(fid));
    AsyncStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(relativeFavs));
    
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
        setScanMessage("Checking for new music...");
        const { syncLibrary } = await import('../utils/librarySync');
        const oldSize = library.length;
        
        const syncedTracks = await syncLibrary(
          (track) => setScanProgress(prev => ({ ...prev, current: prev.current + 1 })),
          (total) => setScanProgress({ current: 0, total })
        );

        if (Array.isArray(syncedTracks)) {
          const sorted = processTracksWithArtwork(syncedTracks, resolveArtworkUri);
          
          setLibrary(sorted);
          setPlaylistState(prev => prev.length === 0 ? sorted : prev);
          setOriginalPlaylist(prev => prev.length === 0 ? sorted : prev);
          
          if (sorted.length === oldSize) {
            setScanMessage("Nothing to add");
            setTimeout(() => setScanMessage(null), 5000);
          }
        }
        resolve();
      });
    });
  };

  const processAndAddFiles = async (fileUris: string[]) => {
    const { parseMetadata, createAlbumArtCache } = await import('../utils/fileScanner');
    const { insertTracks, removeDuplicates } = await import('../utils/database');
    const newTracks: Track[] = [];

    const existingUris = new Set(library.map(t => t.uri));
    const uniqueFiles = fileUris.filter(uri => !existingUris.has(uri));
    setScanProgress({ current: 0, total: uniqueFiles.length });

    // Use LRU cache instead of Map to prevent memory leaks
    const albumArtCache = createAlbumArtCache();

    try {
      for (let i = 0; i < uniqueFiles.length; i++) {
        try {
          const uri = uniqueFiles[i];
          const metadata = await parseMetadata(uri, uri.split('/').pop() || '', albumArtCache);
          const track = await parseAndEnrichTrack(uri, metadata);
          newTracks.push(track);
          if ((i + 1) % 5 === 0) setScanProgress(prev => ({ ...prev, current: i + 1 }));
        } catch (e) {
          await logToFile(`Failed to process ${uniqueFiles[i]}: ${e}`, 'WARN');
        }
      }

      if (newTracks.length > 0) {
        await insertTracks(newTracks);
        await removeDuplicates(); // Remove any duplicates
        const allTracks = await getAllTracks();
        const sorted = processTracksWithArtwork(allTracks, resolveArtworkUri);
        setLibrary(sorted);
        if (queueTitle === 'All Songs') {
          setPlaylistState(sorted);
          setOriginalPlaylist(sorted);
        }
        await logToFile(`Imported ${newTracks.length} tracks.`);
      }
    } catch (e) {
      await logToFile(`Error in processAndAddFiles: ${e}`, 'ERROR');
    } finally {
      setScanProgress({ current: 0, total: 0 });
    }
  };

  const importLocalFolder = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await ensureMusicDir(MUSIC_DIR);
          let fileUris: string[] = [];

          if (Platform.OS === 'android') {
            fileUris = await importFilesFromAndroidFolder(MUSIC_DIR, (current) =>
              setScanProgress(prev => ({ ...prev, current }))
            );
          } else {
            fileUris = await importFilesFromIosFolder(MUSIC_DIR, (current) =>
              setScanProgress(prev => ({ ...prev, current }))
            );
          }

          if (fileUris.length > 0) await processAndAddFiles(fileUris);
        } catch (e) {
          await logToFile(`Error in folder import: ${e}`, 'ERROR');
        }
        resolve();
      });
    });
  };

  const pickAndImportFiles = async () => {
    return new Promise<void>((resolve) => {
      queueTask(async () => {
        try {
          await ensureMusicDir(MUSIC_DIR);
          const fileUris = await importFilesFromPicker(MUSIC_DIR, (current) =>
            setScanProgress(prev => ({ ...prev, current }))
          );
          if (fileUris.length > 0) await processAndAddFiles(fileUris);
        } catch (e) {
          await logToFile(`Error in file picker import: ${e}`, 'ERROR');
        }
        resolve();
      });
    });
  };

  const mappedCurrentTrack: Track | null = optimisticTrack || (activeTrack ? {
    id: toAbsoluteUri(activeTrack.id), 
    title: activeTrack.title || 'Unknown Title',
    artist: activeTrack.artist || 'Unknown Artist',
    album: activeTrack.album,
    uri: activeTrack.url as string,
    artwork: activeTrack.artwork,
    duration: (activeTrack.duration || 0) * 1000, 
    lrc: (activeTrack as any).original?.lrc, 
    trackNumber: (activeTrack as any).original?.trackNumber
  } : null);

  return (
    <MusicContext.Provider value={{
      currentTrack: mappedCurrentTrack, 
      isPlaying: isTransitioning || playing || false, 
      positionMillis: isTransitioning ? 0 : position * 1000, 
      durationMillis: isTransitioning ? (mappedCurrentTrack?.duration || 0) : duration * 1000, 
      isShuffle, 
      repeatMode, 
      favorites, 
      history,
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
      refreshTrackMetadata,
      refreshAllMetadata,
      rescanLyrics,
      removeTrack, 
      importLocalFolder, 
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
      scanMessage,
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
