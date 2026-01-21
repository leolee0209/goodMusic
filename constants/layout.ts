import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const LAYOUT = {
  // Hero/Header
  HERO_HEIGHT: 300,
  
  // Grid
  GRID_PADDING: 16,
  GRID_GAP: 16,
  GRID_COLUMNS: 2,
  get GRID_ITEM_WIDTH() {
    return (width - (this.GRID_PADDING * 2) - (this.GRID_GAP * (this.GRID_COLUMNS - 1))) / this.GRID_COLUMNS;
  },
  
  // Mini Player
  MINI_PLAYER_BOTTOM: 20,
  MINI_PLAYER_HORIZONTAL: 10,
  
  // Selection Toolbar
  SELECTION_TOOLBAR_BOTTOM: 80,
  
  // List
  LIST_BOTTOM_PADDING: 100,
  
  // Timing
  DEBOUNCE_DELAY: 300,
  PLAYER_SETUP_DELAY: 100,
  BATCH_DELAY: 10,
  TRACK_VERIFY_DELAY: 2000,
} as const;
