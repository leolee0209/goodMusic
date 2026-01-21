import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PlaylistItemProps {
  title: string;
  themeColor: string;
  viewMode: 'list' | 'grid' | 'condensed';
  onPress: () => void;
}

export const PlaylistItem: React.FC<PlaylistItemProps> = ({
  title,
  themeColor,
  viewMode,
  onPress
}) => {
  const isCondensed = viewMode === 'condensed';

  return (
    <TouchableOpacity
      style={[styles.item, isCondensed && styles.itemCondensed]}
      onPress={onPress}
    >
      <View style={[styles.icon, isCondensed && styles.iconCondensed]}>
        <Ionicons name="list" size={isCondensed ? 20 : 24} color={themeColor} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle}>Playlist</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  itemCondensed: {
    padding: 8,
    borderBottomWidth: 0,
    marginBottom: 4,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  iconCondensed: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
  },
});
