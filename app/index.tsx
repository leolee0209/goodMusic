import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlbumGridItem } from '../components/AlbumGridItem';
import { HeaderBar } from '../components/HeaderBar';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlaylistItem } from '../components/PlaylistItem';
import { SelectionToolbar } from '../components/SelectionToolbar';
import { SortBar } from '../components/SortBar';
import { SortModal } from '../components/SortModal';
import { TrackActionSheet } from '../components/TrackActionSheet';
import { TrackListItem } from '../components/TrackListItem';
import { useMusic } from '../contexts/MusicContext';
import { Tab, useSettings } from '../contexts/SettingsContext';
import { useBulkPlaylistAdd } from '../hooks/useBulkPlaylistAdd';
import { useTrackActions } from '../hooks/useTrackActions';
import { useTrackSelection } from '../hooks/useTrackSelection';
import { Track } from '../types';
import { buildPlaybackOrigin, playAll, playOrToggle, shuffleAndPlay } from '../utils/playbackUtils';
import { getSortOptionsFor, sortGroups, sortTracks } from '../utils/sortUtils';
import { normalizeForSearch } from '../utils/stringUtils';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 48) / 2; // 16 padding on sides + 16 gap

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; f?: string }>();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, favorites, library, playlists, createPlaylist, addToPlaylist, removeTrack, history } = useMusic();
  const { defaultTab, themeColor, sortPreferences, setSortPreference } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  // Sort & View State
  const sortOption = sortPreferences[activeTab]?.option || 'Alphabetical';
  const sortOrder = sortPreferences[activeTab]?.order || 'ASC';
  const viewMode = sortPreferences[activeTab]?.viewMode || 'list';
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [createPlaylistVisible, setCreatePlaylistVisible] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  useEffect(() => {
    if (!searchQuery && !params.q) {
        setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  // Custom Hooks
  const { selectedTracks, setSelectedTracks, isSelectionMode, toggleSelectTrack, clearSelection, isSelected } = useTrackSelection();
  const { actionSheetVisible, setActionSheetVisible, activeTrack, setActiveTrack, openActionSheet, closeActionSheet } = useTrackActions();
  const { showPlaylistPicker } = useBulkPlaylistAdd();

  // Handle incoming search query or favorites filter
  useEffect(() => {
    if (params.q) {
      setSearchQuery(params.q);
    }
    if (params.f === 'true') {
      setShowFavoritesOnly(true);
    }
  }, [params.q, params.f]);

  const handleCreatePlaylist = () => {
    setNewPlaylistName('');
    setCreatePlaylistVisible(true);
  };

  const handleConfirmCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) {
      Alert.alert('Name required', 'Please enter a playlist name.');
      return;
    }
    await createPlaylist(name);
    setCreatePlaylistVisible(false);
  };

  const handleBulkAddToPlaylist = () => {
    showPlaylistPicker(selectedTracks, clearSelection);
  };

  const handleActionSheetAddToPlaylist = async (playlistId: string) => {
    if (activeTrack) {
      await addToPlaylist(playlistId, [activeTrack.id]);
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

  // Unified Grouping & Search Logic
  const groupedLibrary = useMemo(() => {
    let baseSongs = [...library];
    if (showFavoritesOnly) {
      baseSongs = baseSongs.filter(track => favorites.includes(track.id));
    }

    const isSearching = searchQuery.trim().length > 0;
    const normalizedQuery = normalizeForSearch(searchQuery);
    const keywords = isSearching ? normalizedQuery.split(/\s+/).filter(k => k.length > 0) : [];

    const artistsMap: Record<string, Track[]> = {};
    const albumsMap: Record<string, Track[]> = {};

    baseSongs.forEach(track => {
      const artist = track.artist || 'Unknown Artist';
      const album = track.album || 'Unknown Album';
      if (!artistsMap[artist]) artistsMap[artist] = [];
      artistsMap[artist].push(track);
      if (!albumsMap[album]) albumsMap[album] = [];
      albumsMap[album].push(track);
    });

    let songs = isSearching 
      ? baseSongs.filter(track => {
          const title = normalizeForSearch(track.title);
          const artist = normalizeForSearch(track.artist);
          const album = normalizeForSearch(track.album || '');
          return keywords.every(k => title.includes(k) || artist.includes(k) || album.includes(k));
        })
      : baseSongs;

    let artists = Object.entries(artistsMap).map(([name, tracks]) => ({ name, tracks, id: `artist-${name}`, type: 'artist' }));
    let albums = Object.entries(albumsMap).map(([name, tracks]) => ({ name, tracks, id: `album-${name}`, type: 'album' }));

    if (isSearching) {
      artists = artists.filter(a => {
          const name = normalizeForSearch(a.name);
          return keywords.every(k => name.includes(k));
      });
      albums = albums.filter(a => {
          const name = normalizeForSearch(a.name);
          return keywords.every(k => name.includes(k));
      });
    }

    // Sorting Logic
    if (activeTab === 'songs') {
      songs = sortTracks(songs, sortOption, sortOrder, history);
    } else if (activeTab === 'albums') {
      albums = sortGroups(albums, sortOption, sortOrder);
    } else {
      // Artists
      artists = sortGroups(artists, sortOption, sortOrder);
    }

    return { songs, artists, albums };
  }, [library, searchQuery, showFavoritesOnly, favorites, activeTab, sortOption, sortOrder, history]);

  const handleTrackPress = async (track: Track) => {
    const origin = showFavoritesOnly 
      ? buildPlaybackOrigin({ type: 'favorites', title: 'Favorites', favoritesOnly: true })
      : searchQuery 
        ? buildPlaybackOrigin({ type: 'search', title: `Search: ${searchQuery}`, searchQuery, favoritesOnly: showFavoritesOnly })
        : buildPlaybackOrigin({ type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
    await playOrToggle({ item: track, currentTrack, queue: groupedLibrary.songs, origin, togglePlayPause, playTrack });
  };

  const handlePlayAll = async () => {
    if (activeTab === 'songs') {
      const origin = buildPlaybackOrigin({ type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
      await playAll({ tracks: groupedLibrary.songs, origin, playTrack });
    } else if (activeTab === 'artists' || activeTab === 'albums') {
      const groups = activeTab === 'artists' ? groupedLibrary.artists : groupedLibrary.albums;
      const allTracks = groups.flatMap(g => g.tracks);
      const origin = buildPlaybackOrigin({ type: activeTab === 'artists' ? 'artist' : 'album', title: `All ${activeTab}` });
      await playAll({ tracks: allTracks, origin, playTrack });
    } else if (activeTab === 'playlists') {
      if (!playlists.length) return;
      const tracks = await import('../utils/database').then(m => m.getPlaylistTracks(playlists[0].id));
      const origin = buildPlaybackOrigin({ type: 'playlist', title: playlists[0].title });
      await playAll({ tracks, origin, playTrack });
    }
  };

  const handleShuffleAll = async () => {
    if (activeTab === 'songs') {
      const origin = buildPlaybackOrigin({ type: 'all', title: 'Shuffle Songs', favoritesOnly: showFavoritesOnly });
      await shuffleAndPlay({ tracks: groupedLibrary.songs, origin, playTrack });
    } else if (activeTab === 'artists' || activeTab === 'albums') {
      const groups = activeTab === 'artists' ? groupedLibrary.artists : groupedLibrary.albums;
      const allTracks = groups.flatMap(g => g.tracks);
      const origin = buildPlaybackOrigin({ type: activeTab === 'artists' ? 'artist' : 'album', title: `Shuffle ${activeTab}` });
      await shuffleAndPlay({ tracks: allTracks, origin, playTrack });
    } else if (activeTab === 'playlists') {
      if (!playlists.length) return;
      const randomIndex = Math.floor(Math.random() * playlists.length);
      const playlist = playlists[randomIndex];
      const tracks = await import('../utils/database').then(m => m.getPlaylistTracks(playlist.id));
      const origin = buildPlaybackOrigin({ type: 'playlist', title: playlist.title });
      await shuffleAndPlay({ tracks, origin, playTrack });
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    const origin = showFavoritesOnly 
      ? buildPlaybackOrigin({ type: 'favorites', title: 'Favorites', favoritesOnly: true })
      : searchQuery 
        ? buildPlaybackOrigin({ type: 'search', title: `Search: ${searchQuery}`, searchQuery, favoritesOnly: showFavoritesOnly })
        : buildPlaybackOrigin({ type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
    await playOrToggle({ item: track, currentTrack, queue: groupedLibrary.songs, origin, togglePlayPause, playTrack });
  };

  const handleGroupPress = (group: { name: string, tracks: Track[] }, type: 'artist' | 'album') => {
    router.push({
      pathname: '/group',
      params: { title: group.name, type }
    });
  };

  const handlePlaylistItemPress = async (playlist: any) => {
    router.push({
      pathname: '/group',
      params: { title: playlist.title, type: 'playlist', id: playlist.id }
    });
  };

  // --- RENDER FUNCTIONS ---

  const renderPlaylistItem = ({ item }: { item: any }) => (
    <PlaylistItem
      title={item.title}
      themeColor={themeColor}
      viewMode={viewMode}
      onPress={() => handlePlaylistItemPress(item)}
    />
  );

  const renderSongItem = ({ item }: { item: Track }) => {
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
        showAlbum={true}
      />
    );
  };

  const renderGroupItem = ({ item, type }: { item: { name: string, tracks: Track[] }, type: 'artist' | 'album' }) => {
    const coverArt = item.tracks.find(t => t.artwork)?.artwork;
    const subtitle = type === 'album' ? (item.tracks[0]?.artist || 'Unknown Artist') : undefined;
    
    return (
      <AlbumGridItem
        name={item.name}
        trackCount={item.tracks.length}
        artwork={coverArt}
        viewMode={viewMode}
        type={type}
        subtitle={subtitle}
        onPress={() => handleGroupPress({ name: item.name, tracks: item.tracks }, type)}
      />
    );
  };

  const isSearching = searchQuery.trim().length > 0;
  
  const getSortOptions = () => getSortOptionsFor(activeTab === 'songs' ? 'songs' : activeTab === 'albums' ? 'albums' : 'artists');

  // Only allow ViewMode toggle in main tabs, not search
  const showViewOptions = !isSearching && activeTab !== 'playlists';

  return (
    <SafeAreaView style={styles.container}>
      <HeaderBar
        isSelectionMode={isSelectionMode}
        selectedCount={selectedTracks.length}
        themeColor={themeColor}
        onClearSelection={() => setSelectedTracks([])}
        onAddToPlaylist={handleBulkAddToPlaylist}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        showFavoritesOnly={showFavoritesOnly}
        onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
        onSettings={() => router.push('/settings')}
        onCreatePlaylist={handleCreatePlaylist}
      />

      {!isSearching && (
        <View>
          <View style={styles.tabs}>
            {(['songs', 'artists', 'albums', 'playlists'] as Tab[]).map(tab => (
              <TouchableOpacity 
                key={tab} 
                style={[styles.tab, activeTab === tab && [styles.activeTab, { borderBottomColor: themeColor }]]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Sort Bar */}
          <SortBar 
            currentSort={sortOption} 
            onPress={() => setSortModalVisible(true)} 
            viewMode={viewMode}
            onViewModeChange={(mode) => setSortPreference(activeTab, sortOption, sortOrder, mode)}
            sortOrder={sortOrder}
            onToggleSortOrder={() => setSortPreference(activeTab, sortOption, sortOrder === 'ASC' ? 'DESC' : 'ASC', viewMode)}
            onPlayAll={handlePlayAll}
            onShuffleAll={handleShuffleAll}
          />
        </View>
      )}
      
      <View style={{ flex: 1 }}>
        {isSearching ? (
          <FlatList
            data={[
              ...(groupedLibrary.artists.length > 0 ? [{ type: 'header', title: 'Artists' }, ...groupedLibrary.artists.map(a => ({ ...a, type: 'artist' }))] : []),
              ...(groupedLibrary.albums.length > 0 ? [{ type: 'header', title: 'Albums' }, ...groupedLibrary.albums.map(a => ({ ...a, type: 'album' }))] : []),
              ...(groupedLibrary.songs.length > 0 ? [{ type: 'header', title: 'Songs' }, ...groupedLibrary.songs.map(s => ({ ...s, type: 'song' }))] : []),
            ]}
            renderItem={({ item }: any) => {
              if (item.type === 'header') return <Text style={[styles.sectionHeader, { color: themeColor }]}>{item.title}</Text>;
              if (item.type === 'artist' || item.type === 'album') return renderGroupItem({ item, type: item.type });
              return renderSongItem({ item });
            }}
            keyExtractor={(item: any) => item.id || (item.type + item.title + item.name)}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <>
            {activeTab === 'songs' && (
              <FlatList 
                key={`songs-${viewMode}`}
                data={groupedLibrary.songs} 
                renderItem={renderSongItem} 
                keyExtractor={item => item.id} 
                contentContainerStyle={styles.listContent}
                numColumns={viewMode === 'grid' ? 2 : 1}
                columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
              />
            )}
            {activeTab === 'artists' && (
              <FlatList 
                key={`artists-${viewMode}`}
                data={groupedLibrary.artists} 
                renderItem={({ item }) => renderGroupItem({ item, type: 'artist' })} 
                keyExtractor={item => item.id} 
                contentContainerStyle={styles.listContent}
                numColumns={viewMode === 'grid' ? 2 : 1}
                columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
              />
            )}
            {activeTab === 'albums' && (
              <FlatList 
                key={`albums-${viewMode}`}
                data={groupedLibrary.albums} 
                renderItem={({ item }) => renderGroupItem({ item, type: 'album' })} 
                keyExtractor={item => item.id} 
                contentContainerStyle={styles.listContent}
                numColumns={viewMode === 'grid' ? 2 : 1}
                columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
              />
            )}
            {activeTab === 'playlists' && (
              <FlatList 
                data={playlists} 
                renderItem={renderPlaylistItem} 
                keyExtractor={item => item.id} 
                contentContainerStyle={styles.listContent} 
              />
            )}
          </>
        )}
      </View>

      <MiniPlayer 
        track={currentTrack}
        isPlaying={!!isPlaying}
        onTogglePlayPause={togglePlayPause}
        onPress={() => router.push('/player')}
      />

      <Modal
        transparent
        visible={createPlaylistVisible}
        animationType="fade"
        onRequestClose={() => setCreatePlaylistVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreatePlaylistVisible(false)}>
          <View style={styles.createModalContent}>
            <Text style={styles.modalTitle}>New Playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor="#888"
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setCreatePlaylistVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleConfirmCreatePlaylist}>
                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
        onRemoveFromLibrary={handleActionSheetRemoveFromLibrary}
      />
      
      <SortModal 
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        options={getSortOptions()}
        currentValue={sortOption}
        onSelect={(option) => setSortPreference(activeTab, option, sortOrder, viewMode)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  selectionBar: { justifyContent: 'space-between' },
  selectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  mainSearchBar: { flex: 1, marginHorizontal: 10 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  tab: { marginRight: 20, paddingBottom: 5 },
  activeTab: { borderBottomWidth: 2 },
  tabText: { color: '#888', fontSize: 16, fontWeight: '600' },
  activeTabText: { color: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionHeader: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', marginTop: 20, marginBottom: 10, letterSpacing: 1 },
  
  // List View Styles
  item: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 8, borderRadius: 12, backgroundColor: '#1E1E1E' },
  itemCondensed: { marginBottom: 6, padding: 4, borderRadius: 8, height: 50 },
  activeItem: { backgroundColor: '#282828', borderLeftWidth: 3 },
  selectedItem: { borderWidth: 1 },
  itemContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  artworkPlaceholder: { width: 50, height: 50, borderRadius: 6, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' },
  selectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  artwork: { width: '100%', height: '100%' },
  info: { flex: 1, marginLeft: 15 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  artist: { color: '#aaa', fontSize: 14, marginTop: 2 },
  sideButtons: { flexDirection: 'row', alignItems: 'center' },
  sideButton: { padding: 10 },
  
  // Group List Styles
  groupItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  groupItemCondensed: { padding: 8, borderBottomWidth: 0, marginBottom: 4, backgroundColor: '#1E1E1E', borderRadius: 8 },
  groupIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 15, overflow: 'hidden' },
  groupIconCondensed: { width: 30, height: 30, borderRadius: 15, marginRight: 10 },
  groupTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  groupSubtitle: { color: '#888', fontSize: 14 },

  // Grid View Styles
  gridItem: { width: GRID_ITEM_WIDTH, marginBottom: 16, backgroundColor: '#1E1E1E', borderRadius: 12, padding: 10 },
  gridArtworkContainer: { width: '100%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 8, backgroundColor: '#333' },
  gridArtwork: { width: '100%', height: '100%' },
  gridTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  gridSubtitle: { color: '#888', fontSize: 12, marginTop: 2 },

  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#888', fontSize: 16 },
  
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
  
  miniPlayer: { position: 'absolute', bottom: 20, left: 10, right: 10, backgroundColor: '#282828', padding: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', elevation: 8 },
  miniArtworkContainer: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  miniArtwork: { width: '100%', height: '100%' },
  miniInfo: { flex: 1, marginLeft: 12 },
  miniTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  miniArtist: { color: '#aaa', fontSize: 12 },
  miniControls: { paddingHorizontal: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  createModalContent: { width: '100%', backgroundColor: '#1E1E1E', borderRadius: 14, padding: 20 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  modalInput: { backgroundColor: '#282828', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 10 },
  modalButton: { paddingVertical: 10, paddingHorizontal: 14 },
  modalButtonPrimary: { backgroundColor: '#fff', borderRadius: 8 },
  modalButtonText: { color: '#ccc', fontSize: 15, fontWeight: '600' },
  modalButtonPrimaryText: { color: '#000' },
});