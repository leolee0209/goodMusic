import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { DUMMY_PLAYLIST } from '../constants/dummyData';
import { Track } from '../types';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';

type Tab = 'songs' | 'artists' | 'albums';

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const { playTrack, currentTrack, isPlaying, setPlaylist, togglePlayPause, favorites, refreshLibrary, library, importLocalFolder, pickAndImportFiles } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Handle incoming search query from Group screen
  useEffect(() => {
    if (params.q) {
      setSearchQuery(params.q);
    }
  }, [params.q]);

  // Unified Grouping & Search Logic
  const groupedLibrary = useMemo(() => {
    // baseSongs is for the 'Songs' tab and general display
    let baseSongs = [...library];

    if (showFavoritesOnly) {
      baseSongs = baseSongs.filter(track => favorites.includes(track.id));
    }

    const lowerQuery = searchQuery.toLowerCase().trim();
    const isSearching = lowerQuery !== '';

    // ALWAYS use the full library (unfiltered by search) for the Artist/Album map construction
    // so the tabs remain populated, UNLESS we are specifically searching.
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

    // Songs: search in title, artist, or album
    let songs = isSearching 
      ? baseSongs.filter(track => 
          track.title.toLowerCase().includes(lowerQuery) || 
          track.artist.toLowerCase().includes(lowerQuery) ||
          (track.album && track.album.toLowerCase().includes(lowerQuery))
        )
      : baseSongs;

    // Artists/Albums: Filtered by name ONLY when searching
    let artists = Object.entries(artistsMap).map(([name, tracks]) => ({ name, tracks, id: `artist-${name}` }));
    let albums = Object.entries(albumsMap).map(([name, tracks]) => ({ name, tracks, id: `album-${name}` }));

    if (isSearching) {
      artists = artists.filter(a => a.name.toLowerCase().includes(lowerQuery));
      albums = albums.filter(a => a.name.toLowerCase().includes(lowerQuery));
    }

    return {
      songs,
      artists,
      albums
    };
  }, [library, searchQuery, showFavoritesOnly, favorites]);

  // Initial Load
  useEffect(() => {
    if (library.length === 0) {
       setPlaylist(DUMMY_PLAYLIST);
    }
  }, []);

  const handleTrackPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      router.push('/player');
    } else {
      const title = showFavoritesOnly ? 'Favorites' : (searchQuery ? `Search: ${searchQuery}` : 'All Songs');
      await playTrack(track, groupedLibrary.songs, title);
      router.push('/player');
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      await togglePlayPause();
    } else {
      const title = showFavoritesOnly ? 'Favorites' : (searchQuery ? `Search: ${searchQuery}` : 'All Songs');
      await playTrack(track, groupedLibrary.songs, title);
    }
  };

  const handleGroupPress = (group: { name: string, tracks: Track[] }, type: 'artist' | 'album') => {
    router.push({
      pathname: '/group',
      params: { title: group.name, type }
    });
  };

  const renderSongItem = ({ item }: { item: Track }) => {
    const isCurrent = currentTrack?.id === item.id;
    return (
      <View style={[styles.item, isCurrent && styles.activeItem]}>
        <TouchableOpacity 
          style={styles.itemContent} 
          onPress={() => handleTrackPress(item)}
        >
          <View style={styles.artworkPlaceholder}>
             {item.artwork ? (
               <Image source={{ uri: item.artwork }} style={styles.artwork} />
             ) : (
               <Ionicons name="musical-note" size={24} color="#555" />
             )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, isCurrent && styles.activeText]} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
          </View>
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

  const handleImportPress = () => {
    Alert.alert(
      "Import Music",
      "Add music to your library:",
      [
        { text: "Select Files (Multiple)", onPress: pickAndImportFiles },
        { text: "Scan Documents / Folder", onPress: importLocalFolder },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <SearchBar 
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
          containerStyle={styles.mainSearchBar}
        />
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={refreshLibrary} style={styles.iconButton}>
            <Ionicons name="refresh-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleImportPress} style={styles.iconButton}>
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFavoritesOnly(!showFavoritesOnly)} style={styles.iconButton}>
            <Ionicons 
              name={showFavoritesOnly ? "heart" : "heart-outline"} 
              size={24} 
              color={showFavoritesOnly ? "#1DB954" : "#fff"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs - Hidden when searching for a unified feel, or keep them for filtering */}
      {!isSearching && (
        <View style={styles.tabs}>
          {(['songs', 'artists', 'albums'] as Tab[]).map(tab => (
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
      
      {/* Content */}
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
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No results for "{searchQuery}"</Text>
              </View>
            }
          />
        ) : (
          <>
            {activeTab === 'songs' && (
              <FlatList
                data={groupedLibrary.songs}
                renderItem={renderSongItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{showFavoritesOnly ? "No favorite songs yet" : "No songs found"}</Text>
                  </View>
                }
              />
            )}

            {activeTab === 'artists' && (
              <FlatList
                data={groupedLibrary.artists}
                renderItem={({ item }) => renderGroupItem({ item, type: 'artist' })}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
              />
            )}

            {activeTab === 'albums' && (
              <FlatList
                data={groupedLibrary.albums}
                renderItem={({ item }) => renderGroupItem({ item, type: 'album' })}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
              />
            )}
          </>
        )}
      </View>

      {/* Mini Player */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mainSearchBar: {
    flex: 1,
    marginRight: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
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
  },
  tab: {
    marginRight: 20,
    paddingBottom: 5,
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
  },
  sectionHeader: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 1,
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
  sideButton: {
    padding: 10,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  groupIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    overflow: 'hidden',
  },
  groupTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  groupSubtitle: {
    color: '#888',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
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