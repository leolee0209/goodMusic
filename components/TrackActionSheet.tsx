import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track, Playlist } from '../types';

interface TrackActionSheetProps {
  visible: boolean;
  onClose: () => void;
  track: Track | null;
  playlists: Playlist[];
  onAddToPlaylist: (playlistId: string) => void;
  onGoToArtist: () => void;
  onGoToAlbum: () => void;
  onRemoveFromPlaylist?: () => void;
  onRemoveFromLibrary?: () => void;
}

export const TrackActionSheet: React.FC<TrackActionSheetProps> = ({
  visible,
  onClose,
  track,
  playlists,
  onAddToPlaylist,
  onGoToArtist,
  onGoToAlbum,
  onRemoveFromPlaylist,
  onRemoveFromLibrary
}) => {
  if (!track) return null;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
            </View>
          </View>

          <ScrollView style={styles.optionsList}>
            <TouchableOpacity style={styles.option} onPress={onGoToArtist}>
              <Ionicons name="person-outline" size={22} color="#fff" />
              <Text style={styles.optionText}>Go to Artist</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={onGoToAlbum}>
              <Ionicons name="disc-outline" size={22} color="#fff" />
              <Text style={styles.optionText}>Go to Album</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {onRemoveFromPlaylist && (
              <TouchableOpacity style={styles.option} onPress={onRemoveFromPlaylist}>
                <Ionicons name="trash-outline" size={22} color="#ff4444" />
                <Text style={[styles.optionText, { color: '#ff4444' }]}>Remove from Playlist</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.option} onPress={onRemoveFromLibrary}>
              <Ionicons name="trash-outline" size={22} color="#ff4444" />
              <Text style={[styles.optionText, { color: '#ff4444' }]}>Remove from Library</Text>
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Add to Playlist</Text>
            
            {playlists.map(playlist => (
              <TouchableOpacity 
                key={playlist.id} 
                style={styles.option} 
                onPress={() => onAddToPlaylist(playlist.id)}
              >
                <Ionicons name="list-outline" size={22} color="#1DB954" />
                <Text style={styles.optionText}>{playlist.title}</Text>
              </TouchableOpacity>
            ))}
            
            {playlists.length === 0 && (
              <Text style={styles.emptyText}>No playlists created yet</Text>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  trackInfo: {
    alignItems: 'center',
  },
  trackTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  trackArtist: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 4,
  },
  optionsList: {
    paddingVertical: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 15,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 10,
  },
  sectionTitle: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    paddingVertical: 20,
  },
  cancelButton: {
    paddingVertical: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});