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
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getAllTracks, initDatabase, addToHistory, getPlaybackHistory, removeDuplicates } from '../utils/database';
import { syncLibrary, ensureMusicDirectory } from '../utils/librarySync';
import { logToFile } from '../utils/logger';
import { toAbsoluteUri, toRelativePath } from '../utils/pathUtils';

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const STORAGE_KEY_SHUFFLE = '@goodmusic_shuffle';
const STORAGE_KEY_REPEAT = '@goodmusic_repeat';
const STORAGE_KEY_FAVORITES = '@goodmusic_favorites';
const STORAGE_KEY_SHOW_LYRICS = '@goodmusic_show_lyrics';

const MUSIC_DIR = Paths.document.uri + (Paths.document.uri.endsWith('/') ? '' : '/') + 'music/';

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
       // We only care if the Active Track has finally updated to match our Optimistic Track
       const isTitleMatch = activeTrack.title === optimisticTrack.title;
       const isUrlMatch = activeTrack.url === optimisticTrack.uri || 
                          (activeTrack.url as string)?.endsWith(optimisticTrack.uri);
       
       if (isTitleMatch || isUrlMatch) {
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
  const playerReadyPromise = useRef<Promise<void> | null>(null);

  // Helper to resolve artwork URIs (handles relative paths from DB)
  const resolveArtworkUri = (uri: string | null | undefined) => {
    if (!uri) return undefined;
    return toAbsoluteUri(uri);
  };

  // Helper to ensure URI has file:// prefix for RNTP
  const ensureFileUri = (uri: string) => {
      if (!uri) return uri;
      const absolute = toAbsoluteUri(uri);
      let result = absolute;
      if (result.startsWith('/') && !result.startsWith('file://')) {
          result = `file://${result}`;
      }
      return result;
  };

  // Helper to serialize Track to RNTP Track
  const toRntpTrack = (track: Track) => {
    const rntpTrack = {
      id: toRelativePath(track.id), // Ensure ID is stable
      url: ensureFileUri(track.uri),
      title: track.title,
      artist: track.artist,
      album: track.album || 'Unknown Album',
      artwork: resolveArtworkUri(track.artwork),
      duration: track.duration ? track.duration / 1000 : 0, 
      original: track 
    };
    logToFile(`Mapping track for RNTP: ${track.title} | URL: ${rntpTrack.url} | Dur: ${rntpTrack.duration}`);
    return rntpTrack;
  };

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
      await logToFile(`Action: Refreshing metadata for ${track.title} (${trackId})`);
      const { parseMetadata } = await import('../utils/fileScanner');
      const { insertTracks } = await import('../utils/database');
      
      const fileName = track.uri.split('/').pop() || "";
      const albumArtCache = new Map<string, string>();
      const metadata = await parseMetadata(track.uri, fileName, albumArtCache);
      
      let lrcContent = undefined;
      const dirPath = track.uri.substring(0, track.uri.lastIndexOf('/') + 1);
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
      const lrcUri = dirPath + nameWithoutExt + '.lrc';
      try {
         const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
         if (lrcInfo.exists) lrcContent = await FileSystem.readAsStringAsync(lrcUri);
      } catch(e) {
         await logToFile(`Error reading LRC for ${fileName}: ${e}`, 'WARN');
      }

      const updatedTrack: Track = {
        ...track,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: resolveArtworkUri(metadata.artwork),
        lrc: lrcContent,
        trackNumber: metadata.trackNumber,
        duration: metadata.duration
      };

      await insertTracks([updatedTrack]);
      
      setLibrary(prev => prev.map(t => t.id === trackId ? updatedTrack : t));
      setPlaylistState(prev => prev.map(t => t.id === trackId ? updatedTrack : t));
      setOriginalPlaylist(prev => prev.map(t => t.id === trackId ? updatedTrack : t));
      
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
      
      let processed = 0;
      setScanProgress({ current: 0, total: library.length });
      setIsScanning(true);
      
      const updates: Track[] = [];
      const albumArtCache = new Map<string, string>();

      for (const track of library) {
        try {
          const fileName = track.uri.split('/').pop() || "";
          const metadata = await parseMetadata(track.uri, fileName, albumArtCache);
          
          let lrcContent = undefined;
          const dirPath = track.uri.substring(0, track.uri.lastIndexOf('/') + 1);
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          try {
             const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
             if (lrcInfo.exists) lrcContent = await FileSystem.readAsStringAsync(lrcUri);
          } catch(e) {
             await logToFile(`Error reading LRC for ${fileName}: ${e}`, 'WARN');
          }

          const updatedTrack: Track = {
            ...track,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            artwork: resolveArtworkUri(metadata.artwork),
            lrc: lrcContent,
            trackNumber: metadata.trackNumber,
            duration: metadata.duration
          };
          
          updates.push(updatedTrack);
        } catch (e) {
           await logToFile(`Failed to refresh metadata for ${track.uri}: ${e}`, 'WARN');
        }
        
        processed++;
        if (processed % 10 === 0) setScanProgress(prev => ({ ...prev, current: processed }));
      }

      if (updates.length > 0) {
          await insertTracks(updates);
          await removeDuplicates(); // Clean up if any duplicates were created
          setLibrary(prev => {
              const updateMap = new Map(updates.map(u => [u.id, u]));
              return prev.map(t => updateMap.get(t.id) || t).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
          });
          await logToFile(`Full metadata refresh complete. Updated ${updates.length} tracks.`);
      }
      
      setIsScanning(false);
      setScanProgress({ current: 0, total: 0 });
    });
  };

  const rescanLyrics = async () => {
    queueTask(async () => {
      setScanMessage("Rescanning .lrc files...");
      await logToFile('Action: Rescanning lyrics for all tracks...');
      const { insertTracks } = await import('../utils/database');
      let updates: Track[] = [];
      let processed = 0;
      setScanProgress({ current: 0, total: library.length });
      setIsScanning(true);

      for (const track of library) {
        try {
          const fileName = track.uri.split('/').pop() || "";
          const dirPath = track.uri.substring(0, track.uri.lastIndexOf('/') + 1);
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          
          const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
          if (lrcInfo.exists) {
             const lrcContent = await FileSystem.readAsStringAsync(lrcUri);
             if (lrcContent !== track.lrc) {
                 const updated = { ...track, lrc: lrcContent };
                 updates.push(updated);
             }
          }
        } catch (e) {
           await logToFile(`Error rescanning lyrics for ${track.title}: ${e}`, 'WARN');
        }
        
        processed++;
        if (processed % 50 === 0) setScanProgress(prev => ({ ...prev, current: processed }));
      }

      if (updates.length > 0) {
          await insertTracks(updates);
          setLibrary(prev => {
              const updateMap = new Map(updates.map(u => [u.id, u]));
              return prev.map(t => updateMap.get(t.id) || t);
          });
          await logToFile(`Lyrics rescan complete. Updated ${updates.length} tracks.`);
      } else {
          await logToFile('Lyrics rescan complete. No updates found.');
      }
      setIsScanning(false);
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

  const setupPlayer = async () => {
    if (playerReadyPromise.current) return playerReadyPromise.current;

    playerReadyPromise.current = (async () => {
        try {
            await logToFile('Setup: Starting player initialization sequence...');
            
            let isInitialized = false;
            try {
                const state = await TrackPlayer.getState();
                isInitialized = state !== State.None;
                await logToFile(`Setup: Current player state is ${state}. Initialized: ${isInitialized}`);
            } catch (e) {
                await logToFile(`Setup: Player not initialized yet (verified by error: ${e})`);
            }

            if (!isInitialized) {
                await logToFile('Setup: Calling TrackPlayer.setupPlayer()...');
                await TrackPlayer.setupPlayer();
                await logToFile('Setup: TrackPlayer.setupPlayer() call returned.');
                
                // Small delay to ensure native side is fully ready
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            try {
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
                      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification
                  }
                });
                await logToFile('Setup: Capabilities updated.');
            } catch (optErr) {
                await logToFile(`Setup: updateOptions failed (non-critical): ${optErr}`, 'WARN');
            }

            const finalState = await TrackPlayer.getState();
            await logToFile(`Setup: Complete. Final Player State: ${finalState}`);
          } catch (e) {
            await logToFile(`Setup: CRITICAL FAILURE: ${e}`, 'ERROR');
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
          await ensureMusicDirectory();
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

  const playTrack = async (track: Track, newQueue?: Track[], title?: string, origin?: PlaybackOrigin) => {
    try {
      await logToFile(`PlayTrack: Request for "${track.title}" (ID: ${track.id})`);
      setOptimisticTrack(track);
      setIsTransitioning(true);

      // Add to history
      addToHistory(track.id).then(async () => {
          const hist = await getPlaybackHistory();
          setHistory(hist);
      });
      
      // 1. Ensure Player is ready
      await setupPlayer(); 
      
      // 2. Prepare the logical queue
      let finalQueue = newQueue ? [...newQueue] : [...originalPlaylist];
      
      // Edge case: Empty queue
      if (finalQueue.length === 0) {
        await logToFile('PlayTrack: Warn - Queue was empty, creating single-track queue.');
        finalQueue = [track];
      }

      // Update Context State
      if (newQueue) {
        setOriginalPlaylist(finalQueue);
        setQueueTitle(title || 'All Songs');
        setPlaybackOrigin(origin || null);
        await logToFile(`PlayTrack: Context updated with new queue of ${finalQueue.length} tracks.`);
      }

      // 3. Determine Playback Order (Shuffle Logic)
      let queueToPlay = [...finalQueue];
      let startIndex = 0;

      if (isShuffle) {
        await logToFile('PlayTrack: Shuffle is ON. Re-ordering queue.');
        // If shuffling, we want the clicked track to be first, and the rest randomized
        const others = queueToPlay.filter(t => t.id !== track.id);
        queueToPlay = [track, ...shuffleArray(others)];
        startIndex = 0;
      } else {
        // Normal order: find the index of the clicked track
        startIndex = queueToPlay.findIndex(t => t.id === track.id);
        if (startIndex === -1) {
          await logToFile(`PlayTrack: Warn - Track ${track.id} not found in queue. Prepending.`, 'WARN');
          queueToPlay = [track, ...queueToPlay];
          startIndex = 0;
        }
      }

      setPlaylistState(queueToPlay);
      
      // 4. Update Native Player
      await logToFile(`PlayTrack: Resetting native player...`);
      await TrackPlayer.reset();
      
      const rntpTracks = queueToPlay.map(toRntpTrack);
      await logToFile(`PlayTrack: Adding ${rntpTracks.length} tracks to native player.`);
      await TrackPlayer.add(rntpTracks);
      
      // 5. Skip to correct index
      // IMPORTANT: We must wait for 'add' to finish before skipping.
      if (startIndex > 0) {
        await logToFile(`PlayTrack: Skipping to index ${startIndex}.`);
        try {
            // Short delay to ensure native queue is ready
            await new Promise(resolve => setTimeout(resolve, 50));
            await TrackPlayer.skip(startIndex);
        } catch (e) {
            await logToFile(`PlayTrack: Skip failed initially: ${e}. Retrying after delay...`, 'WARN');
            await new Promise(resolve => setTimeout(resolve, 300));
            await TrackPlayer.skip(startIndex);
        }
      }

      // 6. Start Playback
      await applyRepeatMode(repeatMode);
      await TrackPlayer.play();
      await logToFile('PlayTrack: Play command sent.');

      // 7. Post-Play Verification
      setTimeout(async () => {
        try {
          const state = await TrackPlayer.getState();
          const queue = await TrackPlayer.getQueue();
          const current = await TrackPlayer.getActiveTrackIndex();
          await logToFile(`PlayTrack: Verification (+2000ms) - State: ${state}, QueueSize: ${queue.length}, CurrentIndex: ${current}`);
          
          if (state === State.Error || state === State.None) {
             await logToFile('PlayTrack: Player seems stuck in Error/None state. Attempting recovery...', 'WARN');
             await TrackPlayer.play(); 
          }
        } catch (e) {
           await logToFile(`PlayTrack: Post-play verification failed: ${e}`, 'WARN');
        }
      }, 2000);

    } catch (error) {
      setOptimisticTrack(null);
      setIsTransitioning(false);
      await logToFile(`PlayTrack: CRITICAL ERROR: ${error}`, 'ERROR');
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
        await logToFile('Task: Refreshing full library sync...');
        let processedCount = 0;
        
        const oldLibrarySize = library.length;
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
           
           if (sortedTracks.length === oldLibrarySize) {
              setScanMessage("Nothing to add");
              setIsScanning(true); // Force keep visible
              setTimeout(() => {
                setIsScanning(false);
                setScanMessage(null);
              }, 5000);
           } else {
              await logToFile(`Sync completed: ${sortedTracks.length} tracks updated.`);
           }
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
          await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
          
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
                    const destUri = MUSIC_DIR + fileName;
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
                  const destUri = MUSIC_DIR + fileName;
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
      const uri = MUSIC_DIR + 'demosong.mp3';
      const lrcUri = MUSIC_DIR + 'demosong.lrc';
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
            const dirInfo = await FileSystem.getInfoAsync(MUSIC_DIR);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
            
            const newFileUris: string[] = [];
            setScanProgress({ current: 0, total: result.assets.length });
            
            for (let i = 0; i < result.assets.length; i++) {
              const file = result.assets[i];
              const destUri = MUSIC_DIR + file.name;
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
      positionMillis: position * 1000, 
      durationMillis: duration * 1000, 
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
