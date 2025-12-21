import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { Track, PlaybackOrigin } from '../types';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import { TrackActionSheet } from '../components/TrackActionSheet';

export default function GroupDetailScreen() {
  const router = useRouter();
  const { title, type, id, f } = useLocalSearchParams<{ title: string; type: 'artist' | 'album' | 'playlist'; id?: string; f?: string }>();
  const { library, playTrack, currentTrack, isPlaying, togglePlayPause, favorites, playlists, addToPlaylist, removeFromPlaylist, removeTrack } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(f === 'true');
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>('songs');
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  // Selection Mode State
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const isSelectionMode = selectedTracks.length > 0;

  // Action Sheet State
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);

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
      const album = track.album || 'Unknown Album';
      if (!albumsMap[album]) albumsMap[album] = [];
      albumsMap[album].push(track);
    });

    return Object.entries(albumsMap).map(([name, tracks]) => ({
      name,
      tracks,
      id: `album-${name}`
    }));
  }, [activeGroup]);

  const filteredTracks = useMemo(() => {
    if (!activeGroup) return [];
    let filtered = activeGroup.tracks;

    if (showFavoritesOnly) {
      filtered = filtered.filter(track => favorites.includes(track.id));
    }

    if (searchQuery.trim() !== '') {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(track => 
        track.title.toLowerCase().includes(lowerQuery) || 
        track.artist.toLowerCase().includes(lowerQuery) ||
        (track.album && track.album.toLowerCase().includes(lowerQuery))
      );
    }

    // Sorting Logic
    if (type === 'album') {
      // Sort by track number if viewing a single album
      filtered.sort((a, b) => {
        if (a.trackNumber && b.trackNumber) return a.trackNumber - b.trackNumber;
        if (a.trackNumber) return -1;
        if (b.trackNumber) return 1;
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });
    } else {
      // Default to alphabetical for Artists, Playlists, and mixed views
      filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }

    return filtered;
  }, [activeGroup, searchQuery, showFavoritesOnly, favorites]);

  if (!activeGroup) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No group selected</Text>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.backButton}>Go Back</Text>
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
      router.push('/player');
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
    // Push new screen with params for animation and history
    router.push({
      pathname: '/group',
      params: { title: album.name, type: 'album' }
    });
  };

  const groupArtwork = activeGroup.tracks.find(t => t.artwork)?.artwork;

  const handleSearchGlobally = () => {
    // Navigate to index with the search query
    router.replace({
      pathname: '/',
      params: { q: searchQuery }
    });
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
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
            <Text style={[styles.title, isCurrent && styles.activeText]} numberOfLines={1} ellipsizeMode="middle">{item.title}</Text>
            <Text style={styles.artist} numberOfLines={1} ellipsizeMode="middle">{item.artist}</Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.sideButtons}>
          <TouchableOpacity 
            style={styles.sideButton}
            onPress={() => handleSingleTrackAction(item)}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.sideButton}
            onPress={() => handleSideButtonPress(item)}
          >
            {isCurrent ? (
              <Ionicons 
                name={isPlaying ? "pause-circle" : "play-circle"} 
                size={30} 
                color="#1DB954" 
              />
            ) : (
              <Ionicons 
                name="play-circle-outline" 
                size={30} 
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
    return (
      <TouchableOpacity style={styles.albumItem} onPress={() => handleAlbumPress(item)}>
        <View style={styles.albumIcon}>
          {coverArt ? (
            <Image source={{ uri: coverArt }} style={styles.artwork} />
          ) : (
            <Ionicons name="disc" size={24} color="#fff" />
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Hero Header */}
      <View style={styles.heroContainer}>
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
        
        {/* Floating Top Controls / Selection Bar */}
        {isSelectionMode ? (
          <View style={[styles.header, styles.selectionBar]}>
            <TouchableOpacity onPress={() => setSelectedTracks([])} style={styles.iconButton}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.selectionTitle}>{selectedTracks.length} Selected</Text>
            <TouchableOpacity onPress={handleBulkAddToPlaylist} style={styles.iconButton}>
              <Ionicons name="add-circle" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.header}>
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
                color={showFavoritesOnly ? "#1DB954" : "#fff"} 
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Hero Title Info */}
        <View style={styles.heroTextContent}>
          <Text style={styles.heroTitle} numberOfLines={2}>{activeGroup.title}</Text>
          <Text style={styles.heroSubtitle}>
            {activeGroup.type?.toUpperCase()} • {activeGroup.tracks.length} SONGS
          </Text>
        </View>
      </View>

      {activeGroup.type === 'artist' && (
        <View style={styles.tabs}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'songs' && styles.activeTab]}
            onPress={() => setActiveTab('songs')}
          >
            <Text style={[styles.tabText, activeTab === 'songs' && styles.activeTabText]}>Songs</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'albums' && styles.activeTab]}
            onPress={() => setActiveTab('albums')}
          >
            <Text style={[styles.tabText, activeTab === 'albums' && styles.activeTabText]}>Albums</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab === 'songs' ? (
        <FlatList
          data={filteredTracks}
          renderItem={renderTrackItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matches in this group</Text>
              {searchQuery.length > 0 && (
                <TouchableOpacity style={styles.globalSearchButton} onPress={handleSearchGlobally}>
                  <Ionicons name="globe-outline" size={20} color="#1DB954" />
                  <Text style={styles.globalSearchText}>Search Globally for "{searchQuery}"</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            searchQuery.length > 0 && filteredTracks.length > 0 ? (
              <TouchableOpacity style={styles.globalSearchFooter} onPress={handleSearchGlobally}>
                <Text style={styles.globalSearchFooterText}>Search for "{searchQuery}" in entire library</Text>
                <Ionicons name="arrow-forward" size={16} color="#1DB954" />
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={artistAlbums}
          renderItem={renderAlbumItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      {currentTrack && (
        <TouchableOpacity 
          style={styles.miniPlayer} 
          onPress={() => router.push('/player')}
          activeOpacity={0.9}
        >
          <View style={styles.miniArtworkContainer}>
             {currentTrack.artwork ? (
               <Image source={{ uri: currentTrack.artwork }} style={styles.miniArtwork} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  heroContainer: {
    height: 300,
    width: '100%',
    position: 'relative',
    marginBottom: 10,
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
    color: '#1DB954',
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
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
    backgroundColor: '#1DB954',
    justifyContent: 'space-between',
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
    borderBottomColor: '#1DB954',
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
    paddingHorizontal: 16,
    paddingBottom: 100,
    paddingTop: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
  },
  activeItem: {
    backgroundColor: '#282828',
    borderLeftWidth: 3,
    borderLeftColor: '#1DB954',
  },
  selectedItem: {
    backgroundColor: 'rgba(29, 185, 84, 0.1)',
    borderColor: '#1DB954',
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
  activeText: {
    color: '#1DB954',
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
  albumTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  albumSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
  },
  backButton: {
    color: '#1DB954',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    marginBottom: 20,
  },
  globalSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#333',
  },
  globalSearchText: {
    color: '#1DB954',
    marginLeft: 10,
    fontWeight: '600',
  },
  globalSearchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#222',
    marginTop: 10,
  },
  globalSearchFooterText: {
    color: '#1DB954',
    marginRight: 8,
    fontSize: 14,
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
