import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Track } from '../types';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 48) / 2;

interface TrackListItemProps {
  track: Track;
  viewMode: 'list' | 'grid' | 'condensed';
  isCurrent: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  themeColor: string;
  onPress: () => void;
  onLongPress: () => void;
  onSidePress: () => void;
  onMorePress: () => void;
  showAlbum?: boolean;
}

export const TrackListItem: React.FC<TrackListItemProps> = ({
  track,
  viewMode,
  isCurrent,
  isSelected,
  isSelectionMode,
  themeColor,
  onPress,
  onLongPress,
  onSidePress,
  onMorePress,
  showAlbum = false
}) => {
  if (viewMode === 'grid') {
    return (
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.gridItem, isCurrent && { backgroundColor: themeColor + '15' }]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={styles.gridArtworkContainer}>
          {track.artwork ? (
            <Image source={{ uri: track.artwork }} style={styles.gridArtwork} />
          ) : (
            <View style={[styles.gridArtworkPlaceholder, { backgroundColor: themeColor + '30' }]}>
              <Ionicons name="musical-note" size={32} color={themeColor} />
            </View>
          )}
          {isSelected && (
            <View style={styles.gridSelectedOverlay}>
              <Ionicons name="checkmark-circle" size={32} color={themeColor} />
            </View>
          )}
        </View>
        <Text style={styles.gridTitle} numberOfLines={2}>{track.title}</Text>
        <Text style={styles.gridArtist} numberOfLines={1}>{track.artist}</Text>
      </TouchableOpacity>
    );
  }

  if (viewMode === 'condensed') {
    return (
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.condensedItem, isCurrent && { backgroundColor: themeColor + '08', borderLeftColor: themeColor, borderLeftWidth: 3 }]}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={styles.condensedLeft}>
          {isSelectionMode && (
            <View style={styles.checkboxContainer}>
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={20}
                color={isSelected ? themeColor : '#666'}
              />
            </View>
          )}
          <View style={styles.condensedInfo}>
            <Text style={[styles.condensedTitle, isCurrent && { color: themeColor }]} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.condensedSubtitle} numberOfLines={1}>
              {showAlbum ? `${track.artist} • ${track.album || 'Unknown'}` : track.artist}
            </Text>
          </View>
        </View>
        <View style={styles.condensedRight}>
          <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  // Default: list view
  return (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.trackItem, isCurrent && { backgroundColor: themeColor + '08', borderLeftColor: themeColor, borderLeftWidth: 3 }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.trackLeft}>
        {isSelectionMode && (
          <View style={styles.checkboxContainer}>
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={24}
              color={isSelected ? themeColor : '#666'}
            />
          </View>
        )}
        {track.artwork ? (
          <Image source={{ uri: track.artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artworkPlaceholder, { backgroundColor: themeColor + '20' }]}>
            <Ionicons name="musical-note" size={24} color={themeColor} />
          </View>
        )}
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, isCurrent && { color: themeColor }]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.trackSubtitle} numberOfLines={1}>
            {showAlbum ? `${track.artist} • ${track.album || 'Unknown'}` : track.artist}
          </Text>
        </View>
      </View>
      <View style={styles.trackRight}>
        <TouchableOpacity onPress={onMorePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={20} color="#888" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Grid styles
  gridItem: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  gridArtworkContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
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
  },
  gridSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  gridArtist: {
    fontSize: 12,
    color: '#888',
  },

  // Condensed styles
  condensedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 2,
    backgroundColor: '#121212',
  },
  condensedLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  condensedInfo: {
    flex: 1,
  },
  condensedTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  condensedSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  condensedRight: {
    marginLeft: 12,
  },

  // List styles
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 2,
    backgroundColor: '#121212',
  },
  trackLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
  },
  artworkPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 3,
  },
  trackSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  trackRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playingIndicator: {
    marginRight: 0,
  },
});
