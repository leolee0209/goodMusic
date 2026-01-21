import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Track } from '../types';

interface MiniPlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onTogglePlayPause: () => void | Promise<void>;
  onPress: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ track, isPlaying, onTogglePlayPause, onPress }) => {
  if (!track) return null;
  return (
    <TouchableOpacity 
      style={styles.miniPlayer} 
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={styles.miniArtworkContainer}>
        {track.artwork ? (
          <Image source={{ uri: track.artwork }} style={styles.miniArtwork} />
        ) : (
          <Ionicons name="musical-note" size={20} color="#aaa" />
        )}
      </View>
      <View style={styles.miniInfo}>
        <Text style={styles.miniTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.miniArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
      <TouchableOpacity onPress={onTogglePlayPause} style={styles.miniControls}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
});
