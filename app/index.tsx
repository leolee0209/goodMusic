import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { DUMMY_PLAYLIST } from '../constants/dummyData';
import { Track, PlaybackOrigin } from '../types';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import { TrackActionSheet } from '../components/TrackActionSheet';

type Tab = 'songs' | 'artists' | 'albums' | 'playlists';

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; f?: string }>();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, favorites, library, playlists, createPlaylist, addToPlaylist, removeTrack } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Selection Mode State
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const isSelectionMode = selectedTracks.length > 0;

  // Action Sheet State
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);

  // Handle incoming search query or favorites filter
  useEffect(() => {
    if (params.q) {
      setSearchQuery(params.q);
      setActiveTab('songs');
    }
    if (params.f === 'true') {
      setShowFavoritesOnly(true);
    }
  }, [params.q, params.f]);

  const handleCreatePlaylist = () => {
    Alert.prompt(
      "New Playlist",
      "Enter a name for your playlist:",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create", onPress: (name: string | undefined) => name && createPlaylist(name) }
      ]
    );
  };

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

    const lowerQuery = searchQuery.toLowerCase().trim();
    const isSearching = lowerQuery !== '';
    const mappingSource = isSearching ? baseSongs : library;

    const artistsMap: Record<string, Track[]> = {};
    const albumsMap: Record<string, Track[]> = {};

    mappingSource.forEach(track => {
      const artist = track.artist || 'Unknown Artist';
      const album = track.album || 'Unknown Album';
      if (!artistsMap[artist]) artistsMap[artist] = [];
      artistsMap[artist].push(track);
      if (!albumsMap[album]) albumsMap[album] = [];
      albumsMap[album].push(track);
    });

    let songs = isSearching 
      ? baseSongs.filter(track => 
          track.title.toLowerCase().includes(lowerQuery) || 
          track.artist.toLowerCase().includes(lowerQuery) ||
          (track.album && track.album.toLowerCase().includes(lowerQuery))
        )
      : baseSongs;

    let artists = Object.entries(artistsMap).map(([name, tracks]) => ({ name, tracks, id: `artist-${name}` }));
    let albums = Object.entries(albumsMap).map(([name, tracks]) => ({ name, tracks, id: `album-${name}` }));

    if (isSearching) {
      artists = artists.filter(a => a.name.toLowerCase().includes(lowerQuery));
      albums = albums.filter(a => a.name.toLowerCase().includes(lowerQuery));
    }

    return { songs, artists, albums };
  }, [library, searchQuery, showFavoritesOnly, favorites]);

  const handleTrackPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      router.push('/player');
    } else {
      const origin: PlaybackOrigin = showFavoritesOnly 
        ? { type: 'favorites', title: 'Favorites', favoritesOnly: true } 
        : (searchQuery ? { type: 'search', title: `Search: ${searchQuery}`, searchQuery, favoritesOnly: showFavoritesOnly } : { type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
      
      await playTrack(track, groupedLibrary.songs, origin.title, origin);
      router.push('/player');
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      await togglePlayPause();
    } else {
      const origin: PlaybackOrigin = showFavoritesOnly 
        ? { type: 'favorites', title: 'Favorites', favoritesOnly: true } 
        : (searchQuery ? { type: 'search', title: `Search: ${searchQuery}`, searchQuery, favoritesOnly: showFavoritesOnly } : { type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
      
      await playTrack(track, groupedLibrary.songs, origin.title, origin);
    }
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

  const renderPlaylistItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity style={styles.groupItem} onPress={() => handlePlaylistItemPress(item)}>
        <View style={styles.groupIcon}>
          <Ionicons name="list" size={24} color="#1DB954" />
        </View>
        <View style={styles.info}>
          <Text style={styles.groupTitle}>{item.title}</Text>
          <Text style={styles.groupSubtitle}>Playlist</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  const renderSongItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    const isSelected = selectedTracks.includes(item.id);

    return (
      <View style={[styles.item, isCurrent && styles.activeItem, isSelected && styles.selectedItem]}>
        <TouchableOpacity 
          style={styles.itemContent} 
          onPress={() => isSelectionMode ? toggleSelectTrack(item.id) : handleTrackPress(item)}
          onLongPress={() => toggleSelectTrack(item.id)}
        >
          <View style={styles.artworkPlaceholder}>
             {item.artwork ? (
               <Image source={{ uri: item.artwork }} style={styles.artwork} />
             ) : (
               <Ionicons name="musical-note" size={24} color="#555" />
             )}
             {isSelected && (
               <View style={styles.selectedOverlay}>
                 <Ionicons name="checkmark-circle" size={24} color="#1DB954" />
               </View>
             )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, isCurrent && styles.activeText]} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.sideButtons}>
          <TouchableOpacity style={styles.sideButton} onPress={() => handleSingleTrackAction(item)}>
            <Ionicons name="ellipsis-vertical" size={20} color="#888" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideButton} onPress={() => handleSideButtonPress(item)}>
            <Ionicons name={isCurrent && isPlaying ? "pause-circle" : "play-circle-outline"} size={30} color={isCurrent ? "#1DB954" : "#888"} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroupItem = ({ item, type }: { item: { name: string, tracks: Track[] }, type: 'artist' | 'album' }) => {
    const coverArt = item.tracks.find(t => t.artwork)?.artwork;
    return (
      <TouchableOpacity style={styles.groupItem} onPress={() => handleGroupPress({ name: item.name, tracks: item.tracks }, type)}>
        <View style={styles.groupIcon}>
          {coverArt ? (
            <Image source={{ uri: coverArt }} style={styles.artwork} />
          ) : (
            <Ionicons name={type === 'artist' ? 'person' : 'disc'} size={24} color="#fff" />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.groupTitle}>{item.name}</Text>
          <Text style={styles.groupSubtitle}>{item.tracks.length} songs</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {isSelectionMode ? (
        <View style={[styles.topBar, styles.selectionBar]}>
          <TouchableOpacity onPress={() => setSelectedTracks([])} style={styles.iconButton}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.selectionTitle}>{selectedTracks.length} Selected</Text>
          <TouchableOpacity onPress={handleBulkAddToPlaylist} style={styles.iconButton}>
            <Ionicons name="add-circle" size={30} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <SearchBar 
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClear={() => setSearchQuery('')}
            containerStyle={styles.mainSearchBar}
          />
          <View style={styles.actionButtons}>
            <TouchableOpacity onPress={handleCreatePlaylist} style={styles.iconButton}>
              <Ionicons name="add-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFavoritesOnly(!showFavoritesOnly)} style={styles.iconButton}>
              <Ionicons name={showFavoritesOnly ? "heart" : "heart-outline"} size={24} color={showFavoritesOnly ? "#1DB954" : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isSearching && (
        <View style={styles.tabs}>
          {(['songs', 'artists', 'albums', 'playlists'] as Tab[]).map(tab => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
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
              if (item.type === 'header') return <Text style={styles.sectionHeader}>{item.title}</Text>;
              if (item.type === 'artist' || item.type === 'album') return renderGroupItem({ item, type: item.type });
              return renderSongItem({ item });
            }}
            keyExtractor={(item: any) => item.id || (item.type + item.title + item.name)}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <>
            {activeTab === 'songs' && (
              <FlatList data={groupedLibrary.songs} renderItem={renderSongItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            )}
            {activeTab === 'artists' && (
              <FlatList data={groupedLibrary.artists} renderItem={({ item }) => renderGroupItem({ item, type: 'artist' })} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            )}
            {activeTab === 'albums' && (
              <FlatList data={groupedLibrary.albums} renderItem={({ item }) => renderGroupItem({ item, type: 'album' })} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            )}
            {activeTab === 'playlists' && (
              <FlatList data={playlists} renderItem={renderPlaylistItem} keyExtractor={item => item.id} contentContainerStyle={styles.listContent} />
            )}
          </>
        )}
      </View>

      {currentTrack && (
        <TouchableOpacity style={styles.miniPlayer} onPress={() => router.push('/player')} activeOpacity={0.9}>
          <View style={styles.miniArtworkContainer}>
             {currentTrack.artwork ? <Image source={{ uri: currentTrack.artwork }} style={styles.miniArtwork} /> : <Ionicons name="musical-note" size={20} color="#aaa" />}
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
        onRemoveFromLibrary={handleActionSheetRemoveFromLibrary}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  selectionBar: { backgroundColor: '#1DB954', justifyContent: 'space-between' },
  selectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  mainSearchBar: { flex: 1, marginHorizontal: 10 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconButton: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  tab: { marginRight: 20, paddingBottom: 5 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#1DB954' },
  tabText: { color: '#888', fontSize: 16, fontWeight: '600' },
  activeTabText: { color: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  sectionHeader: { color: '#1DB954', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', marginTop: 20, marginBottom: 10, letterSpacing: 1 },
  item: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 8, borderRadius: 12, backgroundColor: '#1E1E1E' },
  activeItem: { backgroundColor: '#282828', borderLeftWidth: 3, borderLeftColor: '#1DB954' },
  selectedItem: { backgroundColor: 'rgba(29, 185, 84, 0.1)', borderColor: '#1DB954', borderWidth: 1 },
  itemContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  artworkPlaceholder: { width: 50, height: 50, borderRadius: 6, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' },
  selectedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  artwork: { width: '100%', height: '100%' },
  info: { flex: 1, marginLeft: 15 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  activeText: { color: '#1DB954' },
  artist: { color: '#aaa', fontSize: 14, marginTop: 2 },
  sideButtons: { flexDirection: 'row', alignItems: 'center' },
  sideButton: { padding: 10 },
  groupItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  groupIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 15, overflow: 'hidden' },
  groupTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  groupSubtitle: { color: '#888', fontSize: 14 },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#888', fontSize: 16 },
  miniPlayer: { position: 'absolute', bottom: 20, left: 10, right: 10, backgroundColor: '#282828', padding: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', elevation: 8 },
  miniArtworkContainer: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  miniArtwork: { width: '100%', height: '100%' },
  miniInfo: { flex: 1, marginLeft: 12 },
  miniTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  miniArtist: { color: '#aaa', fontSize: 12 },
  miniControls: { paddingHorizontal: 10 }
});
