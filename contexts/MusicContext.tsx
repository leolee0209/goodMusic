import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, MusicContextType, RepeatMode } from '../types';

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
  
  // 'playlist' is the Active Queue (what is actually being played, potentially shuffled)
  const [playlist, setPlaylistState] = useState<Track[]>([]);
  // 'originalPlaylist' keeps the source order (e.g. album order)
  const [originalPlaylist, setOriginalPlaylist] = useState<Track[]>([]);
  
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);
  
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    const configureAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        console.error("Error configuring audio:", e);
      }
    };
    configureAudio();

    // Load preferences
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
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const playTrack = async (track: Track) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      setCurrentTrack(track);
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
    } catch (error) {
      console.error('Error playing track:', error);
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPositionMillis(status.positionMillis);
      setDurationMillis(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      
      if (status.didJustFinish) {
        handleTrackEnd();
      }
    }
  };

  const handleTrackEnd = () => {
    if (repeatMode === 'one') {
      if (soundRef.current) {
        soundRef.current.replayAsync();
      }
    } else {
      playNext();
    }
  };

  const togglePlayPause = async () => {
    if (!soundRef.current) return;

    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  };

  const seekTo = async (millis: number) => {
    if (soundRef.current) {
      await soundRef.current.setPositionAsync(millis);
    }
  };

  const playNext = () => {
    if (!currentTrack || playlist.length === 0) return;
    
    const currentIndex = playlist.findIndex(t => t.id === currentTrack.id);
    let nextIndex = currentIndex + 1;

    // Handle end of playlist
    if (nextIndex >= playlist.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // Stop playback if not repeating
        setIsPlaying(false);
        return; 
      }
    }
    
    playTrack(playlist[nextIndex]);
  };

  const playPrev = () => {
    if (!currentTrack || playlist.length === 0) return;
    
    // If we are more than 3 seconds into the song, restart it instead
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
        // Wrap to start or stop? Usually prev at start goes to start of song.
        // If index is 0 and we hit prev (and pos < 3s), we usually go to last song if repeat all, else stay at 0.
        prevIndex = 0;
      }
    }
    playTrack(playlist[prevIndex]);
  };

  // Helper to shuffle array
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
      // Shuffle ON: Shuffle the ORIGINAL playlist, but keep current track first if playing
      if (currentTrack && originalPlaylist.length > 0) {
        const others = originalPlaylist.filter(t => t.id !== currentTrack.id);
        const shuffledOthers = shuffleArray(others);
        setPlaylistState([currentTrack, ...shuffledOthers]);
      } else {
         setPlaylistState(shuffleArray(originalPlaylist));
      }
    } else {
      // Shuffle OFF: Restore original order
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

  // When setting a new playlist (e.g. from Home), we reset everything
  const setPlaylist = (tracks: Track[]) => {
    setOriginalPlaylist(tracks);
    // If shuffle is currently on, we should probably shuffle this new list immediately?
    // Or respect the flag.
    if (isShuffle) {
       // Logic: if we just clicked a track to start this playlist, that track should be first.
       // But playTrack is called separately usually.
       // For now, just shuffle it all.
       setPlaylistState(shuffleArray(tracks));
    } else {
       setPlaylistState(tracks);
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
      playlist,
      setPlaylist,
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
