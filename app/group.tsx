import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { useSettings } from '../contexts/SettingsContext';
import { Track, PlaybackOrigin } from '../types';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import { TrackActionSheet } from '../components/TrackActionSheet';
import { normalizeForSearch } from '../utils/stringUtils';
import { formatDuration } from '../utils/timeUtils';
import { SortBar } from '../components/SortBar';
import { SortModal } from '../components/SortModal';
import Animated, { useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 48) / 2; // 16 padding on sides + 16 gap
const HERO_HEIGHT = 300;
const HEADER_HEIGHT = 100; // Approximate height of top bar

export default function GroupDetailScreen() {
  const router = useRouter();
  const { themeColor, sortPreferences, setSortPreference } = useSettings();
  const { title, type, id, f } = useLocalSearchParams<{ title: string; type: 'artist' | 'album' | 'playlist'; id?: string; f?: string }>();
  const { library, playTrack, currentTrack, isPlaying, togglePlayPause, favorites, playlists, addToPlaylist, removeFromPlaylist, removeTrack, history } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(f === 'true');
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>(type === 'artist' ? 'albums' : 'songs');
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  // Determine the correct sort scope
  // For Artists, we distinguish between the "Songs" tab and "Albums" tab using a composite key if needed,
  // or just use 'artist_detail' for both (simplest for now, or refine to 'artist_detail_songs' later if requested).
  // Given the user wants separation from MAIN page, 'artist_detail' is sufficient to be separate from 'artists' tab.
  // However, within Artist view, we have tabs. Let's map:
  // type=artist -> activeTab=songs -> use 'artist_detail' (treating it as song list) ??
  // Actually, 'artist_detail' usually implies the list of songs. 
  // Let's stick to the requested scope keys: artist_detail, album_detail, playlist_detail.
  // But wait, Artist view has TWO tabs: Songs and Albums. Sharing one sort pref for both might be weird (Sorting albums by 'Track Count' vs songs by 'Duration').
  // The 'SortPreference' object has 'option', 'order', 'viewMode'.
  // If we share 'artist_detail' for both tabs, switching tabs might show weird sort options.
  // Ideally: 'artist_detail_songs' and 'artist_detail_albums'.
  // But the previous Context update only added `artist_detail`. 
  // Let's use `artist_detail` for the Artist's SONG list. The Album list in Artist view is less commonly sorted, 
  // but if we need to sort it, we might collision.
  // Let's look at `SettingsContext` update: I added `artist_detail`, `album_detail`, `playlist_detail`.
  // I'll map:
  // - Album View -> `album_detail`
  // - Playlist View -> `playlist_detail`
  // - Artist View -> if activeTab is 'songs' -> `artist_detail`. if activeTab is 'albums' -> we might need to fallback or share.
  //   Let's use `artist_detail` for the songs. For albums tab in artist view, let's use `artist_detail` but maybe the options conflict?
  //   Yes, 'Track Count' is valid for Albums, 'Recently Played' for songs.
  //   Constraint: I can't easily change SettingsContext again without another file write.
  //   Workaround: I will cast the key to `any` or string in setSortPreference if I need a dynamic key, 
  //   BUT `SettingsContext` types are `Record<string, ...>`. So I can actually use ANY string key!
  //   Great! I will use `artist_detail_songs` and `artist_detail_albums`.
  
  const getSortScope = () => {
      if (type === 'album') return 'album_detail';
      if (type === 'playlist') return 'playlist_detail';
      if (type === 'artist') return activeTab === 'albums' ? 'artist_detail_albums' : 'artist_detail_songs';
      return 'songs'; // Fallback
  };

  const sortScope = getSortScope();
  const sortOption = sortPreferences[sortScope]?.option || 'Alphabetical';
  const sortOrder = sortPreferences[sortScope]?.order || 'ASC';
  const viewMode = sortPreferences[sortScope]?.viewMode || 'list';
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Selection Mode State
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const isSelectionMode = selectedTracks.length > 0;

  // Action Sheet State
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);

  // Animation State
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });

  // Sync state if param changes
  useEffect(() => {
    if (f === 'true') setShowFavoritesOnly(true);
  }, [f]);

  const loadPlaylistTracks = async () => {
    if (type === 'playlist' && id) {
      const tracks = await import('../utils/database').then(m => m.getPlaylistTracks(id));
      setPlaylistTracks(tracks);
    }
  };

  // For playlists, we need to load tracks from DB
  useEffect(() => {
    loadPlaylistTracks();
  }, [type, id]);

  const toggleSelectTrack = (trackId: string) => {
    setSelectedTracks(prev => 
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  };

  const handleBulkAddToPlaylist = () => {
    if (selectedTracks.length === 0) return;
    
    Alert.alert(
      "Add to Playlist",
      `Select a playlist to add ${selectedTracks.length} songs:`,
      [
        ...playlists.map(p => ({
          text: p.title,
          onPress: async () => {
            await addToPlaylist(p.id, selectedTracks);
            setSelectedTracks([]);
          }
        })),
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleSingleTrackAction = (track: Track) => {
    setActiveTrack(track);
    setActionSheetVisible(true);
  };

  const handleActionSheetAddToPlaylist = async (playlistId: string) => {
    if (activeTrack) {
      await addToPlaylist(playlistId, [activeTrack.id]);
      setActionSheetVisible(false);
    }
  };

  const handleActionSheetRemoveFromPlaylist = async () => {
    if (activeTrack && type === 'playlist' && id) {
      await removeFromPlaylist(id, [activeTrack.id]);
      await loadPlaylistTracks(); // Refresh list
      setActionSheetVisible(false);
    }
  };

  const handleActionSheetRemoveFromLibrary = () => {
    if (!activeTrack) return;
    
    Alert.alert(
      "Remove from Library",
      `Are you sure you want to delete "${activeTrack.title}"? This will also delete the file from your device.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            await removeTrack(activeTrack.id);
            setActionSheetVisible(false);
          } 
        }
      ]
    );
  };

  const goToArtist = (artist: string) => {
    setActionSheetVisible(false);
    router.push({
      pathname: '/group',
      params: { title: artist, type: 'artist' }
    });
  };

  const goToAlbum = (album: string) => {
    setActionSheetVisible(false);
    router.push({
      pathname: '/group',
      params: { title: album, type: 'album' }
    });
  };

  // Derive activeGroup from title and type params using the full library
  const activeGroup = useMemo(() => {
    if (!title || !type) return null;
    let tracks: Track[] = [];
    if (type === 'artist') tracks = library.filter(track => track.artist === title);
    else if (type === 'album') tracks = library.filter(track => track.album === title);
    else if (type === 'playlist') tracks = playlistTracks;
    
    return { title, tracks, type };
  }, [library, title, type, playlistTracks]);

  const handleBack = () => {
    router.back();
  };

  const artistAlbums = useMemo(() => {
    if (!activeGroup || activeGroup.type !== 'artist') return [];
    
    const albumsMap: Record<string, Track[]> = {};
    activeGroup.tracks.forEach(track => {
      if (showFavoritesOnly && !favorites.includes(track.id)) return;
      
      const album = track.album || 'Unknown Album';
      if (!albumsMap[album]) albumsMap[album] = [];
      albumsMap[album].push(track);
    });

    let allAlbums = Object.entries(albumsMap).map(([name, tracks]) => ({
      name,
      tracks,
      id: `album-${name}`,
      type: 'album'
    }));

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const normalizedQuery = normalizeForSearch(searchQuery);
      const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 0);
      
      allAlbums = allAlbums.filter(album => {
        const name = normalizeForSearch(album.name);
        return keywords.every(k => name.includes(k));
      });
    }

    if (sortOption === 'Track Count') {
        allAlbums.sort((a, b) => b.tracks.length - a.tracks.length);
    } else {
        allAlbums.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    if (sortOrder === 'DESC') {
      allAlbums.reverse();
    }
    return allAlbums;
  }, [activeGroup, showFavoritesOnly, favorites, sortOption, sortOrder, searchQuery]);

  const filteredTracks = useMemo(() => {
    if (!activeGroup) return [];
    let filtered = activeGroup.tracks;

    if (showFavoritesOnly) {
      filtered = filtered.filter(track => favorites.includes(track.id));
    }

    if (searchQuery.trim() !== '') {
      const normalizedQuery = normalizeForSearch(searchQuery);
      const keywords = normalizedQuery.split(/\s+/).filter(k => k.length > 0);

      filtered = filtered.filter(track => {
        const title = normalizeForSearch(track.title);
        const artist = normalizeForSearch(track.artist);
        const album = normalizeForSearch(track.album || '');
        
        return keywords.every(k => title.includes(k) || artist.includes(k) || album.includes(k));
      });
    }

    // Sorting Logic
    if (activeGroup.type === 'artist' && activeTab === 'songs' && sortOption === 'Recently Played') {
         filtered.sort((a, b) => {
           const indexA = history.indexOf(a.id);
           const indexB = history.indexOf(b.id);
           if (indexA !== -1 && indexB !== -1) return indexA - indexB;
           if (indexA !== -1) return -1; 
           if (indexB !== -1) return 1;  
           return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
         });
    } else if (type === 'album') {
      filtered.sort((a, b) => {
        if (a.trackNumber && b.trackNumber) return a.trackNumber - b.trackNumber;
        if (a.trackNumber) return -1;
        if (b.trackNumber) return 1;
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });
    } else {
      filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }

    if (sortOrder === 'DESC') {
      filtered.reverse();
    }

    return filtered;
  }, [activeGroup, searchQuery, showFavoritesOnly, favorites, activeTab, sortOption, history, sortOrder]);

  const groupArtwork = activeGroup?.tracks.find(t => t.artwork)?.artwork;

  // Parallax / Cover Styles
  const heroAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(scrollY.value, [-HERO_HEIGHT, 0, HERO_HEIGHT], [-HERO_HEIGHT / 2, 0, 0], Extrapolation.CLAMP)
        }
      ],
    };
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [HERO_HEIGHT - 100, HERO_HEIGHT], [0, 1], Extrapolation.CLAMP);
    return {
      backgroundColor: `rgba(18, 18, 18, ${opacity})`,
    };
  });

  if (!activeGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No group selected</Text>
        <TouchableOpacity onPress={handleBack}>
          <Text style={[styles.backButton, { color: themeColor }]}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleTrackPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      router.push('/player');
    } else {
      const origin: PlaybackOrigin = { 
        type: activeGroup.type as any, 
        title: activeGroup.title,
        favoritesOnly: showFavoritesOnly
      };
      await playTrack(track, filteredTracks, activeGroup.title, origin);
    }
  };

  const handlePlayAll = async () => {
    if (showSongsList) {
      if (filteredTracks.length === 0) return;
      const origin: PlaybackOrigin = { type: activeGroup.type as any, title: activeGroup.title };
      await playTrack(filteredTracks[0], filteredTracks, origin.title, origin);
    } else {
      // Artist > Albums tab
      if (artistAlbums.length === 0) return;
      const allTracks = artistAlbums.flatMap(a => a.tracks);
      const origin: PlaybackOrigin = { type: 'artist', title: activeGroup.title };
      await playTrack(allTracks[0], allTracks, origin.title, origin);
    }
  };

  const handleShuffleAll = async () => {
    if (showSongsList) {
      if (filteredTracks.length === 0) return;
      const origin: PlaybackOrigin = { type: activeGroup.type as any, title: activeGroup.title };
      const randomIndex = Math.floor(Math.random() * filteredTracks.length);
      await playTrack(filteredTracks[randomIndex], filteredTracks, origin.title, origin);
    } else {
      // Artist > Albums tab - Shuffle the albums themselves
      if (artistAlbums.length === 0) return;
      const shuffledAlbums = [...artistAlbums].sort(() => Math.random() - 0.5);
      const allTracks = shuffledAlbums.flatMap(a => a.tracks);
      const origin: PlaybackOrigin = { type: 'artist', title: activeGroup.title };
      await playTrack(allTracks[0], allTracks, origin.title, origin);
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      await togglePlayPause();
    } else {
      const origin: PlaybackOrigin = { 
        type: activeGroup.type as any, 
        title: activeGroup.title,
        favoritesOnly: showFavoritesOnly
      };
      await playTrack(track, filteredTracks, activeGroup.title, origin);
    }
  };

  const handleAlbumPress = (album: { name: string, tracks: Track[] }) => {
    router.push({
      pathname: '/group',
      params: { title: album.name, type: 'album' }
    });
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    const isSelected = selectedTracks.includes(item.id);

    if (viewMode === 'grid') {
      return (
        <TouchableOpacity 
          style={[styles.gridItem, isCurrent && { borderColor: themeColor, borderWidth: 1 }]} 
          onPress={() => isSelectionMode ? toggleSelectTrack(item.id) : handleTrackPress(item)}
          onLongPress={() => toggleSelectTrack(item.id)}
        >
          <View style={styles.gridArtworkContainer}>
            {item.artwork ? (
              <Image source={{ uri: item.artwork }} style={styles.gridArtwork} />
            ) : (
              <View style={[styles.gridArtwork, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="musical-note" size={40} color="#555" />
              </View>
            )}
            {isSelected && (
              <View style={styles.selectedOverlay}>
                <Ionicons name="checkmark-circle" size={32} color={themeColor} />
              </View>
            )}
            {isCurrent && isPlaying && (
              <View style={[styles.selectedOverlay, { backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                 <Ionicons name="play" size={32} color={themeColor} />
              </View>
            )}
          </View>
          <Text style={[styles.gridTitle, isCurrent && { color: themeColor }]} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.gridSubtitle} numberOfLines={1}>{item.artist}</Text>
        </TouchableOpacity>
      );
    }

    const isCondensed = viewMode === 'condensed';
    return (
      <View style={[
        styles.item, 
        isCondensed && styles.itemCondensed,
        isCurrent && [styles.activeItem, { borderLeftColor: themeColor }], 
        isSelected && [styles.selectedItem, { borderColor: themeColor, backgroundColor: `${themeColor}1A` }]
      ]}>
        <TouchableOpacity 
          style={styles.itemContent} 
          onPress={() => isSelectionMode ? toggleSelectTrack(item.id) : handleTrackPress(item)}
          onLongPress={() => toggleSelectTrack(item.id)}
        >
          {!isCondensed && (
            <View style={styles.artworkPlaceholder}>
              {item.artwork ? (
                <Image source={{ uri: item.artwork }} style={styles.artwork} key={item.artwork} />
              ) : (
                <Ionicons name="musical-note" size={24} color="#555" />
              )}
              {isSelected && (
                <View style={styles.selectedOverlay}>
                  <Ionicons name="checkmark-circle" size={24} color={themeColor} />
                </View>
              )}
            </View>
          )}
          {isCondensed && isSelected && (
             <Ionicons name="checkmark-circle" size={20} color={themeColor} style={{ marginRight: 10 }} />
          )}

          <View style={styles.info}>
            <Text style={[styles.title, isCurrent && { color: themeColor }]} numberOfLines={1} ellipsizeMode="middle">{item.title}</Text>
            <Text style={styles.artist} numberOfLines={1} ellipsizeMode="middle">
              {item.artist} {isCondensed ? `• ${formatDuration(item.duration)}` : `• ${formatDuration(item.duration)}`}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.sideButtons}>
          {!isCondensed && (
            <TouchableOpacity 
              style={styles.sideButton}
              onPress={() => handleSingleTrackAction(item)}
            >
              <Ionicons name="ellipsis-vertical" size={20} color="#888" />
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={styles.sideButton}
            onPress={() => handleSideButtonPress(item)}
          >
            {isCurrent ? (
              <Ionicons 
                name={isPlaying ? "pause-circle" : "play-circle"} 
                size={isCondensed ? 24 : 30} 
                color={themeColor} 
              />
            ) : (
              <Ionicons 
                name="play-circle-outline" 
                size={isCondensed ? 24 : 30} 
                color="#888" 
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAlbumItem = ({ item }: { item: { name: string, tracks: Track[] } }) => {
    const coverArt = item.tracks.find(t => t.artwork)?.artwork;
    
    if (viewMode === 'grid') {
      return (
        <TouchableOpacity 
          style={styles.gridItem}
          onPress={() => handleAlbumPress(item)}
        >
          <View style={styles.gridArtworkContainer}>
            {coverArt ? (
              <Image source={{ uri: coverArt }} style={styles.gridArtwork} />
            ) : (
              <View style={[styles.gridArtwork, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="disc" size={40} color="#555" />
              </View>
            )}
          </View>
          <Text style={styles.gridTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.gridSubtitle} numberOfLines={1}>{item.tracks.length} songs</Text>
        </TouchableOpacity>
      );
    }

    const isCondensed = viewMode === 'condensed';
    return (
      <TouchableOpacity 
        style={[styles.albumItem, isCondensed && styles.albumItemCondensed]} 
        onPress={() => handleAlbumPress(item)}
      >
        <View style={[styles.albumIcon, isCondensed && styles.albumIconCondensed]}>
          {coverArt ? (
            <Image source={{ uri: coverArt }} style={styles.artwork} key={coverArt} />
          ) : (
            <Ionicons name="disc" size={isCondensed ? 20 : 24} color="#fff" />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.albumTitle} numberOfLines={1} ellipsizeMode="middle">{item.name}</Text>
          <Text style={styles.albumSubtitle}>{item.tracks.length} songs</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  const getSortOptions = () => {
      if (activeTab === 'songs') return [{ label: 'Alphabetical', value: 'Alphabetical' }, { label: 'Recently Played', value: 'Recently Played' }];
      if (activeTab === 'albums') return [{ label: 'Alphabetical', value: 'Alphabetical' }, { label: 'Track Count', value: 'Track Count' }];
      return [{ label: 'Alphabetical', value: 'Alphabetical' }];
  };

  // Determine which list to show
  // If searching in Artist mode, show filtered Songs, otherwise show the active tab (Songs or Albums)
  const showSongsList = activeTab === 'songs' || type !== 'artist';

  return (
    <View style={styles.container}>
      {/* Background Hero */}
      <Animated.View style={[styles.heroContainer, heroAnimatedStyle]}>
        {groupArtwork ? (
          <Image 
            source={{ uri: groupArtwork }} 
            style={styles.heroImage} 
            blurRadius={activeGroup.type === 'artist' ? 20 : 0} 
          />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={activeGroup.type === 'artist' ? 'person' : 'disc'} size={80} color="#555" />
          </View>
        )}
        <View style={styles.heroOverlay} />
        <View style={styles.heroTextContent}>
          <Text style={styles.heroTitle} numberOfLines={2}>{activeGroup.title}</Text>
          <Text style={[styles.heroSubtitle, { color: themeColor }]}>
            {activeGroup.type?.toUpperCase()} • {activeGroup.tracks.length} SONGS
          </Text>
        </View>
      </Animated.View>

      {/* Fixed Top Header (Back / Search) */}
      <Animated.View style={[styles.header, headerAnimatedStyle, isSelectionMode && { backgroundColor: themeColor, opacity: 1 }]}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity onPress={() => setSelectedTracks([])} style={styles.iconButton}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.selectionTitle}>{selectedTracks.length} Selected</Text>
            <TouchableOpacity onPress={handleBulkAddToPlaylist} style={styles.iconButton}>
              <Ionicons name="add-circle" size={30} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={handleBack} style={styles.backIcon}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            
            <SearchBar 
              value={searchQuery}
              onChangeText={setSearchQuery}
              onClear={() => setSearchQuery('')}
              placeholder={`Search ${activeGroup.type}...`}
              containerStyle={styles.headerSearchBar}
            />
            
            <TouchableOpacity 
              onPress={() => setShowFavoritesOnly(!showFavoritesOnly)} 
              style={styles.favoriteToggle}
            >
              <Ionicons 
                name={showFavoritesOnly ? "heart" : "heart-outline"} 
                size={24} 
                color={showFavoritesOnly ? themeColor : "#fff"} 
              />
            </TouchableOpacity>
          </>
        )}
      </Animated.View>

      {/* Main List */}
      <Animated.FlatList
        data={(showSongsList ? filteredTracks : artistAlbums) as any}
        renderItem={showSongsList ? renderTrackItem : (({ item }: any) => renderAlbumItem({ item })) as any}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.listContent, { paddingTop: HERO_HEIGHT }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        ListHeaderComponent={
          // Tabs and SortBar should be part of the scrollable content, appearing right after the hero spacer
          activeGroup.type === 'artist' ? (
             <View style={styles.controlsContainer}>
               <View style={styles.tabs}>
                  <TouchableOpacity 
                    style={[styles.tab, activeTab === 'songs' && [styles.activeTab, { borderBottomColor: themeColor }]]}
                    onPress={() => setActiveTab('songs')}
                  >
                    <Text style={[styles.tabText, activeTab === 'songs' && styles.activeTabText]}>Songs</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.tab, activeTab === 'albums' && [styles.activeTab, { borderBottomColor: themeColor }]]}
                    onPress={() => setActiveTab('albums')}
                  >
                    <Text style={[styles.tabText, activeTab === 'albums' && styles.activeTabText]}>Albums</Text>
                  </TouchableOpacity>
                </View>
                <SortBar 
                  currentSort={sortOption} 
                  onPress={() => setSortModalVisible(true)} 
                  viewMode={viewMode}
                  onViewModeChange={(mode) => setSortPreference(sortScope as any, sortOption, sortOrder, mode)}
                  sortOrder={sortOrder}
                  onToggleSortOrder={() => setSortPreference(sortScope as any, sortOption, sortOrder === 'ASC' ? 'DESC' : 'ASC', viewMode)}
                  onPlayAll={handlePlayAll}
                  onShuffleAll={handleShuffleAll}
                />
             </View>
          ) : null
        }
        key={viewMode} // Force re-render when viewMode changes to update numColumns
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between', paddingHorizontal: 16 } : undefined}
      />

      {currentTrack && (
        <TouchableOpacity 
          style={styles.miniPlayer} 
          onPress={() => router.push('/player')}
          activeOpacity={0.9}
        >
          <View style={styles.miniArtworkContainer}>
             {currentTrack.artwork ? (
               <Image source={{ uri: currentTrack.artwork }} style={styles.miniArtwork} key={currentTrack.artwork} />
             ) : (
               <Ionicons name="musical-note" size={20} color="#aaa" />
             )}
          </View>
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>
          <TouchableOpacity onPress={togglePlayPause} style={styles.miniControls}>
            <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      <TrackActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        track={activeTrack}
        playlists={playlists}
        onAddToPlaylist={handleActionSheetAddToPlaylist}
        onGoToArtist={() => activeTrack && goToArtist(activeTrack.artist)}
        onGoToAlbum={() => activeTrack && activeTrack.album && goToAlbum(activeTrack.album)}
        onRemoveFromPlaylist={type === 'playlist' ? handleActionSheetRemoveFromPlaylist : undefined}
        onRemoveFromLibrary={handleActionSheetRemoveFromLibrary}
      />

      <SortModal 
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        options={getSortOptions()}
        currentValue={sortOption}
        onSelect={(option) => setSortPreference(sortScope as any, option, sortOrder, viewMode)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ... existing styles ...
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  heroContainer: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroTextContent: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'absolute',
    top: 30, // SafeArea spacing
    left: 0,
    right: 0,
    zIndex: 100,
  },
  backIcon: {
    marginRight: 10,
  },
  headerSearchBar: {
    flex: 1,
    marginRight: 10,
  },
  favoriteToggle: {
    padding: 5,
  },
  selectionBar: {
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  selectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  iconButton: {
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20, // Negative margin to overlap slightly or just appear attached
    paddingTop: 10,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    marginRight: 20,
    paddingBottom: 8,
    paddingTop: 5,
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#fff',
  },
  listContent: {
    paddingBottom: 100,
    // Note: paddingTop is set dynamically in the FlatList
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0, 
    padding: 8,
    backgroundColor: '#121212', 
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  itemCondensed: {
    marginBottom: 0,
    padding: 4,
    height: 50,
  },
  activeItem: {
    backgroundColor: '#282828',
    borderLeftWidth: 3,
  },
  selectedItem: {
    borderWidth: 1,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artworkPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  info: {
    flex: 1,
    marginLeft: 15,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  artist: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
  sideButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideButton: {
    padding: 10,
  },
  albumItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#121212', // Critical
    paddingHorizontal: 16,
  },
  albumItemCondensed: {
    paddingVertical: 8,
    borderBottomWidth: 0,
    marginBottom: 4,
    borderRadius: 8,
  },
  albumIcon: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    overflow: 'hidden',
  },
  albumIconCondensed: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  albumTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  albumSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  // Grid Styles
  gridItem: {
    width: GRID_ITEM_WIDTH,
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 10,
  },
  gridArtworkContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#333',
  },
  gridArtwork: {
    width: '100%',
    height: '100%',
  },
  gridTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  gridSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  backButton: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  miniPlayer: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    backgroundColor: '#282828',
    padding: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  miniArtworkContainer: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  miniArtwork: {
    width: '100%',
    height: '100%',
  },
  miniInfo: {
    flex: 1,
    marginLeft: 12,
  },
  miniTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  miniArtist: {
    color: '#aaa',
    fontSize: 12,
  },
  miniControls: {
    paddingHorizontal: 10,
  }
});