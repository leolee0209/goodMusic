import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { AnimatedStyle } from 'react-native-reanimated';
import SearchBar from './SearchBar';

interface HeaderBarProps {
  // Selection mode
  isSelectionMode: boolean;
  selectedCount: number;
  themeColor: string;
  onClearSelection: () => void;
  onAddToPlaylist: () => void;
  
  // Search
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  searchPlaceholder?: string;
  
  // Favorites
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  
  // Navigation (optional - for group screen)
  onBack?: () => void;
  
  // Actions (optional - for home screen)
  onSettings?: () => void;
  onCreatePlaylist?: () => void;
  
  // Styling (optional - for animations)
  style?: ViewStyle;
  animatedStyle?: AnimatedStyle<ViewStyle>;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  isSelectionMode,
  selectedCount,
  themeColor,
  onClearSelection,
  onAddToPlaylist,
  searchQuery,
  onSearchChange,
  onSearchClear,
  searchPlaceholder = 'Search...',
  showFavoritesOnly,
  onToggleFavorites,
  onBack,
  onSettings,
  onCreatePlaylist,
  style,
  animatedStyle
}) => {
  const Container = animatedStyle ? Animated.View : View;
  const containerStyle = animatedStyle 
    ? [styles.header, style, animatedStyle, isSelectionMode && { backgroundColor: themeColor, opacity: 1 }]
    : [styles.header, style, isSelectionMode && { backgroundColor: themeColor }];

  return (
    <Container style={containerStyle as any}>
      {isSelectionMode ? (
        <>
          <TouchableOpacity onPress={onClearSelection} style={styles.iconButton}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.selectionTitle}>{selectedCount} Selected</Text>
          <TouchableOpacity onPress={onAddToPlaylist} style={styles.iconButton}>
            <Ionicons name="add-circle" size={30} color="#fff" />
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Left action: Back, Settings, or nothing */}
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          {onSettings && (
            <TouchableOpacity onPress={onSettings} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          
          {/* Search bar */}
          <SearchBar 
            value={searchQuery}
            onChangeText={onSearchChange}
            onClear={onSearchClear}
            placeholder={searchPlaceholder}
            containerStyle={styles.searchBar}
          />
          
          {/* Right actions */}
          <View style={styles.rightActions}>
            {onCreatePlaylist && (
              <TouchableOpacity onPress={onCreatePlaylist} style={styles.iconButton}>
                <Ionicons name="add-outline" size={28} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onToggleFavorites} style={styles.iconButton}>
              <Ionicons 
                name={showFavoritesOnly ? "heart" : "heart-outline"} 
                size={24} 
                color={showFavoritesOnly ? themeColor : "#fff"} 
              />
            </TouchableOpacity>
          </View>
        </>
      )}
    </Container>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconButton: {
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 10,
  },
  selectionTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  searchBar: {
    flex: 1,
    marginHorizontal: 10,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
