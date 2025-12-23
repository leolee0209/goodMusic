import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';

export type ViewMode = 'list' | 'grid' | 'condensed';
export type SortOrder = 'ASC' | 'DESC';

interface SortBarProps {
  currentSort: string;
  onPress: () => void;
  sortOrder?: SortOrder;
  onToggleSortOrder?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onPlayAll?: () => void;
  onShuffleAll?: () => void;
}

export const SortBar: React.FC<SortBarProps> = ({ 
  currentSort, 
  onPress, 
  sortOrder, 
  onToggleSortOrder, 
  viewMode, 
  onViewModeChange,
  onPlayAll,
  onShuffleAll
}) => {
  const { themeColor } = useSettings();

  const getNextViewMode = (current: ViewMode): ViewMode => {
    if (current === 'list') return 'grid';
    if (current === 'grid') return 'condensed';
    return 'list';
  };

  const getViewIcon = (mode: ViewMode) => {
    switch (mode) {
      case 'grid': return 'grid';
      case 'condensed': return 'list'; // Smashed list
      case 'list': default: return 'list-outline';
    }
  };

  return (
    <View style={styles.container}>
      {/* Sort & View Controls (Now on Left) */}
      <View style={styles.controlGroup}>
        <TouchableOpacity style={styles.button} onPress={onPress}>
          <Text style={[styles.text, { color: themeColor }]}>{currentSort}</Text>
          <Ionicons name="chevron-down" size={16} color={themeColor} style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {sortOrder && onToggleSortOrder && (
          <TouchableOpacity style={[styles.button, styles.iconOnlyButton]} onPress={onToggleSortOrder}>
            <Ionicons 
              name={sortOrder === 'ASC' ? "arrow-up" : "arrow-down"} 
              size={16} 
              color={themeColor} 
            />
          </TouchableOpacity>
        )}

        {viewMode && onViewModeChange && (
          <TouchableOpacity 
            style={[styles.button, styles.viewButton]} 
            onPress={() => onViewModeChange(getNextViewMode(viewMode))}
          >
            <Ionicons name={getViewIcon(viewMode)} size={18} color={themeColor} />
            {viewMode === 'condensed' && (
              <Ionicons name="reorder-two" size={12} color={themeColor} style={styles.condensedOverlay} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Play/Shuffle Actions (Now on Right) */}
      {(onPlayAll || onShuffleAll) && (
        <View style={styles.actionGroup}>
           {onPlayAll && (
            <TouchableOpacity style={styles.iconButton} onPress={onPlayAll}>
              <Ionicons name="play" size={20} color={themeColor} />
            </TouchableOpacity>
           )}
           {onShuffleAll && (
            <TouchableOpacity style={styles.iconButton} onPress={onShuffleAll}>
              <Ionicons name="shuffle" size={20} color={themeColor} />
            </TouchableOpacity>
           )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  iconOnlyButton: {
    paddingHorizontal: 8,
  },
  iconButton: {
    padding: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
  },
  viewButton: {
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  condensedOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  }
});
