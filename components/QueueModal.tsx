import React from 'react';
import { View, Text, Modal, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { Track } from '../types';
import { Ionicons } from '@expo/vector-icons';

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
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Up Next</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
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
                  <Image source={{ uri: item.artwork }} style={styles.artwork} />
                  <View style={styles.info}>
                    <Text style={[styles.title, isCurrent && styles.activeText]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                  {isCurrent && (
                     <Ionicons name="stats-chart" size={16} color="#1DB954" />
                  )}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '70%',
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
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
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  activeText: {
    color: '#1DB954',
    fontWeight: 'bold',
  },
  artist: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 2,
  },
});
