import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMusic } from '../contexts/MusicContext';
import { useSettings } from '../contexts/SettingsContext';
import { Playlist, Track } from '../types';
import { BottomSheet } from './BottomSheet';

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
  onRemoveFromLibrary,
}) => {
  const { themeColor } = useSettings();
  const { refreshTrackMetadata } = useMusic();
  
  if (!track) return null;

  const handleRefreshMetadata = () => {
      onClose();
      // Small delay to allow modal to close smoothly
      setTimeout(() => refreshTrackMetadata(track.id), 300);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} showHandle={true}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{track.artist}</Text>
      </View>

      <ScrollView style={styles.scrollContent}>
        <View style={styles.actions}>
                <TouchableOpacity style={styles.actionItem} onPress={onGoToArtist}>
                  <Ionicons name="person-outline" size={24} color="#fff" />
                  <Text style={styles.actionText}>Go to Artist</Text>
                </TouchableOpacity>

                {track.album && track.album !== 'Unknown Album' && (
                  <TouchableOpacity style={styles.actionItem} onPress={onGoToAlbum}>
                    <Ionicons name="disc-outline" size={24} color="#fff" />
                    <Text style={styles.actionText}>Go to Album</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity style={styles.actionItem} onPress={handleRefreshMetadata}>
                  <Ionicons name="refresh-circle-outline" size={24} color="#fff" />
                  <Text style={styles.actionText}>Refresh Metadata</Text>
                </TouchableOpacity>

                {playlists.length > 0 && (
                  <View style={styles.playlistSection}>
                    <Text style={styles.sectionTitle}>Add to Playlist</Text>
                    {playlists.map(playlist => (
                      <TouchableOpacity 
                        key={playlist.id} 
                        style={styles.playlistItem}
                        onPress={() => onAddToPlaylist(playlist.id)}
                      >
                        <Ionicons name="list-outline" size={22} color={themeColor} />
                        <Text style={styles.playlistText}>{playlist.title}</Text>
                        <Ionicons name="add" size={20} color="#666" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {onRemoveFromPlaylist && (
                  <TouchableOpacity style={styles.actionItem} onPress={onRemoveFromPlaylist}>
                    <Ionicons name="remove-circle-outline" size={24} color="#ff4444" />
                    <Text style={[styles.actionText, { color: '#ff4444' }]}>Remove from Playlist</Text>
                  </TouchableOpacity>
                )}

                {onRemoveFromLibrary && (
                  <TouchableOpacity style={styles.actionItem} onPress={onRemoveFromLibrary}>
                    <Ionicons name="trash-outline" size={24} color="#ff4444" />
                    <Text style={[styles.actionText, { color: '#ff4444' }]}>Delete from Library</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
            
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={[styles.cancelText, { color: themeColor }]}>Cancel</Text>
            </TouchableOpacity>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  scrollContent: {
    maxHeight: 400,
  },
  actions: {
    paddingVertical: 10,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 15,
  },
  playlistSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 20,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  playlistText: {
    color: '#ccc',
    fontSize: 15,
    marginLeft: 15,
    flex: 1,
  },
  cancelButton: {
    marginTop: 10,
    paddingVertical: 15,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
