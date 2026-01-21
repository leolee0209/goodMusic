import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SelectionToolbarProps {
  selectedCount: number;
  themeColor: string;
  onAddToPlaylist: () => void;
  onCancel: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  selectedCount,
  themeColor,
  onAddToPlaylist,
  onCancel
}) => {
  return (
    <View style={[styles.toolbar, { backgroundColor: themeColor }]}>
      <Text style={styles.selectionText}>{selectedCount} selected</Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onAddToPlaylist} style={styles.button}>
          <Ionicons name="add" size={24} color="#fff" />
          <Text style={styles.buttonText}>Add to Playlist</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.button}>
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  selectionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
