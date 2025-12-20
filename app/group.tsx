import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { Track } from '../types';
import { Ionicons } from '@expo/vector-icons';

export default function GroupDetailScreen() {
  const router = useRouter();
  const { activeGroup, playTrack, currentTrack, isPlaying, togglePlayPause } = useMusic();

  if (!activeGroup) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No group selected</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  const renderItem = ({ item }: { item: Track }) => {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{activeGroup.title}</Text>
      </View>

      <FlatList
        data={activeGroup.tracks}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
      />

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backIcon: {
    marginRight: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
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
