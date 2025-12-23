import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { useSettings, Tab } from '../contexts/SettingsContext';
import { Track, PlaybackOrigin } from '../types';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import { TrackActionSheet } from '../components/TrackActionSheet';
import { normalizeForSearch } from '../utils/stringUtils';
import { SortBar, ViewMode } from '../components/SortBar';
import { SortModal } from '../components/SortModal';
import { formatDuration } from '../utils/timeUtils';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 48) / 2; // 16 padding on sides + 16 gap

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; f?: string }>();
  const { playTrack, currentTrack, isPlaying, togglePlayPause, favorites, library, playlists, createPlaylist, addToPlaylist, removeTrack, history } = useMusic();
  const { defaultTab, themeColor } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  
  // Sort & View State
  const [sortOption, setSortOption] = useState('Alphabetical');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    if (!searchQuery && !params.q) {
        setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  // Reset sort when tab changes
  useEffect(() => {
    // Default sorts for tabs
    setSortOption('Alphabetical');
    setSortOrder('ASC');
  }, [activeTab]);

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

    let artists = Object.entries(artistsMap).map(([name, tracks]) => ({ name, tracks, id: `artist-${name}` }));
    let albums = Object.entries(albumsMap).map(([name, tracks]) => ({ name, tracks, id: `album-${name}` }));

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
       if (sortOption === 'Recently Played') {
         songs.sort((a, b) => {
           const indexA = history.indexOf(a.id);
           const indexB = history.indexOf(b.id);
           if (indexA !== -1 && indexB !== -1) return indexA - indexB;
           if (indexA !== -1) return -1; 
           if (indexB !== -1) return 1;  
           return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
         });
       } else {
         songs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
       }
    } else if (activeTab === 'albums') {
       if (sortOption === 'Track Count') {
         albums.sort((a, b) => b.tracks.length - a.tracks.length);
       } else {
         albums.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
       }
    } else {
       // Artists
       if (sortOption === 'Track Count') {
         artists.sort((a, b) => b.tracks.length - a.tracks.length);
       } else {
         artists.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
       }
    }

    // Apply Sort Order (Reverse if DESC)
    if (sortOrder === 'DESC') {
      if (activeTab === 'songs') songs.reverse();
      else if (activeTab === 'albums') albums.reverse();
      else if (activeTab === 'artists') artists.reverse();
    }

    return { songs, artists, albums };
  }, [library, searchQuery, showFavoritesOnly, favorites, activeTab, sortOption, sortOrder, history]);

  const handleTrackPress = async (track: Track) => {
    if (currentTrack?.id === track.id) {
      router.push('/player');
    } else {
      const origin: PlaybackOrigin = showFavoritesOnly 
        ? { type: 'favorites', title: 'Favorites', favoritesOnly: true } 
        : (searchQuery ? { type: 'search', title: `Search: ${searchQuery}`, searchQuery, favoritesOnly: showFavoritesOnly } : { type: 'all', title: 'All Songs', favoritesOnly: showFavoritesOnly });
      
      await playTrack(track, groupedLibrary.songs, origin.title, origin);
    }
  };

  const handlePlayAll = async () => {
    if (activeTab === 'songs') {
      if (groupedLibrary.songs.length === 0) return;
      await playTrack(groupedLibrary.songs[0], groupedLibrary.songs, 'All Songs');
    } else if (activeTab === 'artists' || activeTab === 'albums') {
      const groups = activeTab === 'artists' ? groupedLibrary.artists : groupedLibrary.albums;
      if (groups.length === 0) return;
      const allTracks = groups.flatMap(g => g.tracks);
      await playTrack(allTracks[0], allTracks, `All ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`);
    } else if (activeTab === 'playlists') {
      if (playlists.length === 0) return;
      const tracks = await import('../utils/database').then(m => m.getPlaylistTracks(playlists[0].id));
      if (tracks.length > 0) {
        await playTrack(tracks[0], tracks, playlists[0].title);
      }
    }
  };

  const handleShuffleAll = async () => {
    if (activeTab === 'songs') {
      if (groupedLibrary.songs.length === 0) return;
      const randomIndex = Math.floor(Math.random() * groupedLibrary.songs.length);
      await playTrack(groupedLibrary.songs[randomIndex], groupedLibrary.songs, 'Shuffle Songs');
    } else if (activeTab === 'artists' || activeTab === 'albums') {
      const groups = [...(activeTab === 'artists' ? groupedLibrary.artists : groupedLibrary.albums)];
      if (groups.length === 0) return;
      
      // Shuffle the groups themselves (Artists or Albums)
      for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [groups[i], groups[j]] = [groups[j], groups[i]];
      }
      
      const shuffledTracks = groups.flatMap(g => g.tracks);
      await playTrack(shuffledTracks[0], shuffledTracks, `Shuffle ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`);
    } else if (activeTab === 'playlists') {
      if (playlists.length === 0) return;
      const randomIndex = Math.floor(Math.random() * playlists.length);
      const playlist = playlists[randomIndex];
      const tracks = await import('../utils/database').then(m => m.getPlaylistTracks(playlist.id));
      if (tracks.length > 0) {
        const shuffled = [...tracks].sort(() => Math.random() - 0.5);
        await playTrack(shuffled[0], shuffled, playlist.title);
      }
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

  // --- RENDER FUNCTIONS ---

  const renderPlaylistItem = ({ item }: { item: any }) => {
    // Playlist only supports List for now, but we can respect Condensed
    const isCondensed = viewMode === 'condensed';
    return (
      <TouchableOpacity style={[styles.groupItem, isCondensed && styles.groupItemCondensed]} onPress={() => handlePlaylistItemPress(item)}>
        <View style={[styles.groupIcon, isCondensed && styles.groupIconCondensed]}>
          <Ionicons name="list" size={isCondensed ? 20 : 24} color={themeColor} />
        </View>
        <View style={styles.info}>
          <Text style={styles.groupTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.groupSubtitle}>Playlist</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  const renderSongItem = ({ item }: { item: Track }) => {
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
            <Text style={[styles.title, isCurrent && { color: themeColor }]} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>
              {item.artist} {isCondensed ? `• ${formatDuration(item.duration)}` : `• ${formatDuration(item.duration)}`}
            </Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.sideButtons}>
          {!isCondensed && (
             <TouchableOpacity style={styles.sideButton} onPress={() => handleSingleTrackAction(item)}>
               <Ionicons name="ellipsis-vertical" size={20} color="#888" />
             </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.sideButton} onPress={() => handleSideButtonPress(item)}>
            <Ionicons name={isCurrent && isPlaying ? "pause-circle" : "play-circle-outline"} size={isCondensed ? 24 : 30} color={isCurrent ? themeColor : "#888"} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderGroupItem = ({ item, type }: { item: { name: string, tracks: Track[] }, type: 'artist' | 'album' }) => {
    const coverArt = item.tracks.find(t => t.artwork)?.artwork;
    const subtitle = type === 'album' ? (item.tracks[0]?.artist || 'Unknown Artist') : `${item.tracks.length} songs`;
    
    if (viewMode === 'grid') {
      return (
        <TouchableOpacity 
          style={styles.gridItem}
          onPress={() => handleGroupPress({ name: item.name, tracks: item.tracks }, type)}
        >
          <View style={styles.gridArtworkContainer}>
            {coverArt ? (
              <Image source={{ uri: coverArt }} style={styles.gridArtwork} />
            ) : (
              <View style={[styles.gridArtwork, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name={type === 'artist' ? 'person' : 'disc'} size={40} color="#555" />
              </View>
            )}
          </View>
          <Text style={styles.gridTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.gridSubtitle} numberOfLines={1}>{subtitle}</Text>
        </TouchableOpacity>
      );
    }

    const isCondensed = viewMode === 'condensed';
    return (
      <TouchableOpacity 
        style={[styles.groupItem, isCondensed && styles.groupItemCondensed]} 
        onPress={() => handleGroupPress({ name: item.name, tracks: item.tracks }, type)}
      >
        <View style={[styles.groupIcon, isCondensed && styles.groupIconCondensed]}>
          {coverArt ? (
            <Image source={{ uri: coverArt }} style={styles.artwork} key={coverArt} />
          ) : (
            <Ionicons name={type === 'artist' ? 'person' : 'disc'} size={isCondensed ? 20 : 24} color="#fff" />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.groupTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.groupSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  const isSearching = searchQuery.trim().length > 0;
  
  const getSortOptions = () => {
      if (activeTab === 'songs') return [{ label: 'Alphabetical', value: 'Alphabetical' }, { label: 'Recently Played', value: 'Recently Played' }];
      if (activeTab === 'albums') return [{ label: 'Alphabetical', value: 'Alphabetical' }, { label: 'Track Count', value: 'Track Count' }];
      if (activeTab === 'artists') return [{ label: 'Alphabetical', value: 'Alphabetical' }, { label: 'Track Count', value: 'Track Count' }];
      return [{ label: 'Alphabetical', value: 'Alphabetical' }];
  };

  // Only allow ViewMode toggle in main tabs, not search
  const showViewOptions = !isSearching && activeTab !== 'playlists';

  return (
    <SafeAreaView style={styles.container}>
      {isSelectionMode ? (
        <View style={[styles.topBar, styles.selectionBar, { backgroundColor: themeColor }]}>
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
              <Ionicons name={showFavoritesOnly ? "heart" : "heart-outline"} size={24} color={showFavoritesOnly ? themeColor : "#fff"} />
            </TouchableOpacity>
          </View>
        </View>
      )}

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
            onViewModeChange={setViewMode}
            sortOrder={sortOrder}
            onToggleSortOrder={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
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

      {currentTrack && (
        <TouchableOpacity style={styles.miniPlayer} onPress={() => router.push('/player')} activeOpacity={0.9}>
          <View style={styles.miniArtworkContainer}>
             {currentTrack.artwork ? <Image source={{ uri: currentTrack.artwork }} style={styles.miniArtwork} key={currentTrack.artwork} /> : <Ionicons name="musical-note" size={20} color="#aaa" />}
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
      
      <SortModal 
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        options={getSortOptions()}
        currentValue={sortOption}
        onSelect={setSortOption}
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
  miniPlayer: { position: 'absolute', bottom: 20, left: 10, right: 10, backgroundColor: '#282828', padding: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', elevation: 8 },
  miniArtworkContainer: { width: 40, height: 40, borderRadius: 4, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  miniArtwork: { width: '100%', height: '100%' },
  miniInfo: { flex: 1, marginLeft: 12 },
  miniTitle: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  miniArtist: { color: '#aaa', fontSize: 12 },
  miniControls: { paddingHorizontal: 10 }
});