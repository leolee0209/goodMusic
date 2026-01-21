import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlbumGridItem } from '../components/AlbumGridItem';
import { HeaderBar } from '../components/HeaderBar';
import { MiniPlayer } from '../components/MiniPlayer';
import { SelectionToolbar } from '../components/SelectionToolbar';
import { SortBar } from '../components/SortBar';
import { SortModal } from '../components/SortModal';
import { TrackActionSheet } from '../components/TrackActionSheet';
import { TrackListItem } from '../components/TrackListItem';
import { LAYOUT } from '../constants/layout';
import { useMusic } from '../contexts/MusicContext';
import { useSettings } from '../contexts/SettingsContext';
import { useBulkPlaylistAdd } from '../hooks/useBulkPlaylistAdd';
import { useTrackActions } from '../hooks/useTrackActions';
import { useTrackSelection } from '../hooks/useTrackSelection';
import { Track } from '../types';
import { buildPlaybackOrigin, playAll, playOrToggle, shuffleAndPlay } from '../utils/playbackUtils';
import { sortByTrackNumber, sortGroups, SortOption, sortTracks } from '../utils/sortUtils';
import { normalizeForSearch } from '../utils/stringUtils';

const HERO_HEIGHT = LAYOUT.HERO_HEIGHT;

export default function GroupDetailScreen() {
  const router = useRouter();
  const { themeColor, sortPreferences, setSortPreference } = useSettings();
  const { title, type, id, f } = useLocalSearchParams<{ title: string; type: 'artist' | 'album' | 'playlist'; id?: string; f?: string }>();
  const { library, playTrack, currentTrack, isPlaying, togglePlayPause, favorites, playlists, addToPlaylist, removeFromPlaylist, removeTrack, history } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(f === 'true');
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>(type === 'artist' ? 'albums' : 'songs');
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

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

  // Custom Hooks
  const { selectedTracks, setSelectedTracks, isSelectionMode, toggleSelectTrack, clearSelection, isSelected } = useTrackSelection();
  const { actionSheetVisible, setActionSheetVisible, activeTrack, setActiveTrack, openActionSheet, closeActionSheet } = useTrackActions();
  const { showPlaylistPicker } = useBulkPlaylistAdd();

  // Animation State
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(event => {
    scrollY.value = event.contentOffset.y;
  });
  const insets = useSafeAreaInsets();

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

  const handleBulkAddToPlaylist = () => {
    showPlaylistPicker(selectedTracks, clearSelection);
  };

  const handleActionSheetAddToPlaylist = async (playlistId: string) => {
    if (activeTrack) {
      await addToPlaylist(playlistId, [activeTrack.id]);
      closeActionSheet();
    }
  };

  const handleActionSheetRemoveFromPlaylist = async () => {
    if (activeTrack && type === 'playlist' && id) {
      await removeFromPlaylist(id, [activeTrack.id]);
      await loadPlaylistTracks(); // Refresh list
      closeActionSheet();
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

    allAlbums = sortGroups(allAlbums, sortOption, sortOrder);
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
      filtered = sortTracks(filtered, 'Recently Played', sortOrder, history);
    } else if (type === 'album' && sortOption === 'Track Number') {
      filtered = sortByTrackNumber(filtered, sortOrder);
    } else {
      if (sortOption === 'Recently Played') {
        filtered = sortTracks(filtered, 'Recently Played', sortOrder, history);
      } else {
        filtered = sortTracks(filtered, 'Alphabetical', sortOrder);
      }
    }

    return filtered;
  }, [activeGroup, searchQuery, showFavoritesOnly, favorites, activeTab, sortOption, history, sortOrder]);

  const groupArtwork = activeGroup?.tracks.find(t => t.artwork)?.artwork;

  // Parallax / Cover Styles
  const heroAnimatedStyle = useAnimatedStyle(() => {
    const translateY = -Math.min(scrollY.value, HERO_HEIGHT);
    const opacity = interpolate(scrollY.value, [0, HERO_HEIGHT * 0.6, HERO_HEIGHT], [1, 0.4, 0], Extrapolation.CLAMP);
    return {
      transform: [{ translateY }],
      opacity,
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
    const originType = activeGroup.type === 'artist' ? 'artist' : activeGroup.type === 'album' ? 'album' : 'playlist';
    const origin = buildPlaybackOrigin({ 
      type: originType, 
      title: activeGroup.title,
      favoritesOnly: showFavoritesOnly
    });
    await playOrToggle({ item: track, currentTrack, queue: filteredTracks, origin, togglePlayPause, playTrack });
  };

  const handlePlayAll = async () => {
    if (showSongsList) {
      const originType = activeGroup.type === 'artist' ? 'artist' : activeGroup.type === 'album' ? 'album' : 'playlist';
      const origin = buildPlaybackOrigin({ type: originType, title: activeGroup.title });
      await playAll({ tracks: filteredTracks, origin, playTrack });
    } else {
      const allTracks = artistAlbums.flatMap(a => a.tracks);
      const origin = buildPlaybackOrigin({ type: 'artist', title: activeGroup.title });
      await playAll({ tracks: allTracks, origin, playTrack });
    }
  };

  const handleShuffleAll = async () => {
    if (showSongsList) {
      const originType = activeGroup.type === 'artist' ? 'artist' : activeGroup.type === 'album' ? 'album' : 'playlist';
      const origin = buildPlaybackOrigin({ type: originType, title: activeGroup.title });
      await shuffleAndPlay({ tracks: filteredTracks, origin, playTrack });
    } else {
      const allTracks = artistAlbums.flatMap(a => a.tracks);
      const origin = buildPlaybackOrigin({ type: 'artist', title: activeGroup.title });
      await shuffleAndPlay({ tracks: allTracks, origin, playTrack });
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    const originType = activeGroup.type === 'artist' ? 'artist' : activeGroup.type === 'album' ? 'album' : 'playlist';
    const origin = buildPlaybackOrigin({ 
      type: originType, 
      title: activeGroup.title,
      favoritesOnly: showFavoritesOnly
    });
    await playOrToggle({ item: track, currentTrack, queue: filteredTracks, origin, togglePlayPause, playTrack });
  };

  const handleAlbumPress = (album: { name: string, tracks: Track[] }) => {
    router.push({
      pathname: '/group',
      params: { title: album.name, type: 'album' }
    });
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;

    return (
      <TrackListItem
        track={item}
        viewMode={viewMode}
        isCurrent={isCurrent}
        isSelected={isSelected(item.id)}
        isSelectionMode={isSelectionMode}
        themeColor={themeColor}
        onPress={() => isSelectionMode ? toggleSelectTrack(item.id) : handleTrackPress(item)}
        onLongPress={() => toggleSelectTrack(item.id)}
        onSidePress={() => handleSideButtonPress(item)}
        onMorePress={() => openActionSheet(item)}
        showAlbum={type === 'playlist' || type === 'artist'}
      />
    );
  };

  const renderAlbumItem = ({ item }: { item: { name: string, tracks: Track[] } }) => {
    const coverArt = item.tracks.find(t => t.artwork)?.artwork;
    
    return (
      <AlbumGridItem
        name={item.name}
        trackCount={item.tracks.length}
        artwork={coverArt}
        viewMode={viewMode}
        type="album"
        onPress={() => handleAlbumPress(item)}
      />
    );
  };

  const getSortOptions = (): { label: string; value: SortOption }[] => {
      if (activeTab === 'songs') {
        const base = [
          { label: 'Alphabetical', value: 'Alphabetical' as const },
          { label: 'Recently Played', value: 'Recently Played' as const },
        ];
        if (type === 'album') {
          return [...base, { label: 'Track Number', value: 'Track Number' as const }];
        }
        return base;
      }
      if (activeTab === 'albums') return [{ label: 'Alphabetical', value: 'Alphabetical' as const }, { label: 'Track Count', value: 'Track Count' as const }];
      return [{ label: 'Alphabetical', value: 'Alphabetical' as const }];
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
      <HeaderBar
        isSelectionMode={isSelectionMode}
        selectedCount={selectedTracks.length}
        themeColor={themeColor}
        onClearSelection={() => setSelectedTracks([])}
        onAddToPlaylist={handleBulkAddToPlaylist}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        searchPlaceholder={`Search ${activeGroup.type}...`}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
        onBack={handleBack}
        style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 100 }}
        animatedStyle={headerAnimatedStyle}
      />
      {/* Main List */}
      <Animated.FlatList
        data={(showSongsList ? filteredTracks : artistAlbums) as any}
        renderItem={showSongsList ? renderTrackItem : (({ item }: any) => renderAlbumItem({ item })) as any}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.listContent, { paddingTop: HERO_HEIGHT }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={styles.controlsContainer}>
            {activeGroup.type === 'artist' && (
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
            )}
            <SortBar 
              currentSort={sortOption} 
              onPress={() => setSortModalVisible(true)} 
              viewMode={viewMode}
              onViewModeChange={(mode) => setSortPreference(sortScope, sortOption, sortOrder, mode)}
              sortOrder={sortOrder}
              onToggleSortOrder={() => setSortPreference(sortScope, sortOption, sortOrder === 'ASC' ? 'DESC' : 'ASC', viewMode)}
              onPlayAll={handlePlayAll}
              onShuffleAll={handleShuffleAll}
            />
          </View>
        }
        key={viewMode} // Force re-render when viewMode changes to update numColumns
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between', paddingHorizontal: 16 } : undefined}
      />

      <MiniPlayer 
        track={currentTrack}
        isPlaying={!!isPlaying}
        onTogglePlayPause={togglePlayPause}
        onPress={() => router.push('/player')}
      />

      {isSelectionMode && (
        <SelectionToolbar
          selectedCount={selectedTracks.length}
          themeColor={themeColor}
          onAddToPlaylist={handleBulkAddToPlaylist}
          onCancel={clearSelection}
        />
      )}

      <TrackActionSheet
        visible={actionSheetVisible}
        onClose={closeActionSheet}
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
        onSelect={(option) => setSortPreference(sortScope, option, sortOrder, viewMode)}
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
    // Removed negative margin to avoid overlapping the hero/header
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
    width: LAYOUT.GRID_ITEM_WIDTH,
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
  },
  
  // Selection Toolbar
  selectionToolbar: { 
    position: 'absolute', 
    bottom: 80, 
    left: 16, 
    right: 16, 
    borderRadius: 12, 
    padding: 16,
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  selectionText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  selectionActions: { flexDirection: 'row', gap: 12 },
  toolbarButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbarButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});