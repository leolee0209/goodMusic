import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, SafeAreaView, TextInput, Dimensions, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { DUMMY_PLAYLIST } from '../constants/dummyData';
import { Track } from '../types';
import { Ionicons } from '@expo/vector-icons';

type Tab = 'songs' | 'artists' | 'albums';

export default function HomeScreen() {
  const router = useRouter();
  const { playTrack, currentTrack, isPlaying, setPlaylist, togglePlayPause, favorites, refreshLibrary, downloadDemoTrack, pickAndImportFiles, playlist, setActiveGroup, importLocalFolder } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Grouping Logic
  const groupedLibrary = useMemo(() => {
    const source = playlist.length > 0 ? playlist : [];
    
    let filtered = source;

    if (showFavoritesOnly) {
      filtered = filtered.filter(track => favorites.includes(track.id));
    }

    if (searchQuery.trim() !== '') {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(track => 
        track.title.toLowerCase().includes(lowerQuery) || 
        track.artist.toLowerCase().includes(lowerQuery)
      );
    }

    // Grouping
    const artists: Record<string, Track[]> = {};
    const albums: Record<string, Track[]> = {};

    filtered.forEach(track => {
      const artist = track.artist || 'Unknown Artist';
      const album = track.album || 'Unknown Album';
      
      if (!artists[artist]) artists[artist] = [];
      artists[artist].push(track);

      if (!albums[album]) albums[album] = [];
      albums[album].push(track);
    });

    return {
      songs: filtered,
      artists: Object.entries(artists).map(([name, tracks]) => ({ name, tracks, id: name })),
      albums: Object.entries(albums).map(([name, tracks]) => ({ name, tracks, id: name }))
    };
  }, [playlist, searchQuery, showFavoritesOnly, favorites]);

  // Initial Load
  useEffect(() => {
    if (playlist.length === 0) {
       setPlaylist(DUMMY_PLAYLIST);
    }
  }, []);

  const handleTrackPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      router.push('/player');
    } else {
      await playTrack(track);
      router.push('/player');
    }
  };

  const handleSideButtonPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      await togglePlayPause();
    } else {
      await playTrack(track);
    }
  };

  const handleGroupPress = (group: { name: string, tracks: Track[] }) => {
    setActiveGroup({ title: group.name, tracks: group.tracks });
    router.push('/group');
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
      <TouchableOpacity style={styles.groupItem} onPress={() => handleGroupPress({ name: item.name, tracks: item.tracks })}>
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
        {
          text: "Select Files (Multiple)",
          onPress: pickAndImportFiles
        },
        {
          text: "Scan Documents / Folder",
          onPress: () => {
             // For iOS, guide them. For Android, open picker.
             // But my importLocalFolder handles logic. 
             // On iOS it auto-scans docs. On Android it picks folder.
             // I'll just call it directly for now or add the helpful alert if I want.
             // Let's stick to the helpful alert logic I designed.
             importLocalFolder();
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Bar: Search & Actions */}
      <View style={styles.topBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>

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

      {/* Tabs */}
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
      
      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'songs' && (
          <FlatList
            data={groupedLibrary.songs}
            renderItem={renderSongItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            initialNumToRender={10}
            windowSize={5}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No songs found</Text>
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
            initialNumToRender={10}
          />
        )}

        {activeTab === 'albums' && (
          <FlatList
            data={groupedLibrary.albums}
            renderItem={({ item }) => renderGroupItem({ item, type: 'album' })}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            initialNumToRender={10}
          />
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
    marginTop: 10, // status bar spacing if needed, though SafeArea handles usually. 
    // But SafeAreaView on Android might need extra padding or standard header height.
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282828',
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 40,
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
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