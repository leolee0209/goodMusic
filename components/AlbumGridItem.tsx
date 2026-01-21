import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 48) / 2;

interface AlbumGridItemProps {
  name: string;
  trackCount: number;
  artwork?: string;
  viewMode: 'list' | 'grid' | 'condensed';
  onPress: () => void;
  type?: 'album' | 'artist';
  subtitle?: string;
}

export const AlbumGridItem: React.FC<AlbumGridItemProps> = ({
  name,
  trackCount,
  artwork,
  viewMode,
  onPress,
  type = 'album',
  subtitle
}) => {
  const icon = type === 'artist' ? 'person' : 'disc';
  const defaultSubtitle = subtitle || `${trackCount} songs`;

  if (viewMode === 'grid') {
    return (
      <TouchableOpacity style={styles.gridItem} onPress={onPress}>
        <View style={styles.gridArtworkContainer}>
          {artwork ? (
            <Image source={{ uri: artwork }} style={styles.gridArtwork} />
          ) : (
            <View style={styles.gridArtworkPlaceholder}>
              <Ionicons name={icon} size={40} color="#555" />
            </View>
          )}
        </View>
        <Text style={styles.gridTitle} numberOfLines={1}>{name}</Text>
        <Text style={styles.gridSubtitle} numberOfLines={1}>{defaultSubtitle}</Text>
      </TouchableOpacity>
    );
  }

  const isCondensed = viewMode === 'condensed';
  return (
    <TouchableOpacity
      style={[styles.listItem, isCondensed && styles.listItemCondensed]}
      onPress={onPress}
    >
      <View style={[styles.icon, isCondensed && styles.iconCondensed]}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.iconImage} />
        ) : (
          <Ionicons name={icon} size={isCondensed ? 20 : 24} color="#fff" />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <Text style={styles.subtitle}>{defaultSubtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#666" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Grid styles
  gridItem: {
    width: GRID_ITEM_WIDTH,
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 10,
  },
  gridArtworkContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#333',
  },
  gridArtwork: {
    width: '100%',
    height: '100%',
  },
  gridArtworkPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#333',
  },
  gridTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  gridSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },

  // List styles
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  listItemCondensed: {
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
    overflow: 'hidden',
  },
  iconCondensed: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 10,
  },
  iconImage: {
    width: '100%',
    height: '100%',
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
