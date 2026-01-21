import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSettings } from '../contexts/SettingsContext';
import { Track } from '../types';
import { BottomSheet } from './BottomSheet';

interface QueueModalProps {
  visible: boolean;
  onClose: () => void;
  playlist: Track[];
  currentTrack: Track | null;
  onTrackSelect: (track: Track) => void;
}

export const QueueModal: React.FC<QueueModalProps> = ({ 
  visible, 
  onClose, 
  playlist, 
  currentTrack, 
  onTrackSelect 
}) => {
  const { themeColor } = useSettings();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Up Next" showHandle={true} maxHeightPercent={70}>
      <FlatList
            data={playlist}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const isCurrent = currentTrack?.id === item.id;
              return (
                <TouchableOpacity 
                  style={[styles.item, isCurrent && styles.activeItem]}
                  onPress={() => {
                    onTrackSelect(item);
                    onClose();
                  }}
                >
                  {item.artwork ? (
                    <Image source={{ uri: item.artwork }} style={styles.artwork} />
                  ) : (
                    <View style={[styles.artwork, styles.artworkPlaceholder]}>
                      <Ionicons name="musical-note" size={20} color="#777" />
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={[styles.title, isCurrent && { color: themeColor, fontWeight: 'bold' }]} numberOfLines={1} ellipsizeMode="middle">
                      {item.title}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1} ellipsizeMode="middle">
                      {item.artist}
                    </Text>
                  </View>
                  {isCurrent && (
                     <Ionicons name="stats-chart" size={16} color={themeColor} />
                  )}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  activeItem: {
    // Optional highlight background
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  artworkPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  artist: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
});