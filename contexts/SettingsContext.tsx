import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { SortOption, SortOrder } from '../utils/sortUtils';

export type Tab = 'songs' | 'artists' | 'albums' | 'playlists';
export type SortScope = Tab | 'artist_detail' | 'album_detail' | 'playlist_detail' | 'artist_detail_albums' | 'artist_detail_songs';
export type ViewMode = 'list' | 'grid' | 'condensed';

export type SortPreference = {
  option: SortOption;
  order: SortOrder;
  viewMode: ViewMode;
};

type SettingsContextType = {
  defaultTab: Tab;
  setDefaultTab: (tab: Tab) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  sortPreferences: Record<string, SortPreference>;
  setSortPreference: (scope: SortScope, option: SortOption, order: SortOrder, viewMode: ViewMode) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY_DEFAULT_TAB = '@goodmusic_default_tab';
const STORAGE_KEY_THEME_COLOR = '@goodmusic_theme_color';
const STORAGE_KEY_SORT_PREFS = '@goodmusic_sort_prefs';
const DEFAULT_THEME_COLOR = '#1DB954';

const DEFAULT_SORT_PREFS: Record<string, SortPreference> = {
  songs: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  artists: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  albums: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  playlists: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  artist_detail: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  artist_detail_albums: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  artist_detail_songs: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  album_detail: { option: 'Track Number', order: 'ASC', viewMode: 'list' },
  playlist_detail: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [defaultTab, setDefaultTabState] = useState<Tab>('songs');
  const [themeColor, setThemeColorState] = useState<string>(DEFAULT_THEME_COLOR);
  const [sortPreferences, setSortPreferencesState] = useState<Record<string, SortPreference>>(DEFAULT_SORT_PREFS);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedTab = await AsyncStorage.getItem(STORAGE_KEY_DEFAULT_TAB);
        const storedColor = await AsyncStorage.getItem(STORAGE_KEY_THEME_COLOR);
        const storedSortPrefs = await AsyncStorage.getItem(STORAGE_KEY_SORT_PREFS);

        if (storedTab) setDefaultTabState(storedTab as Tab);
        if (storedColor) setThemeColorState(storedColor);
        if (storedSortPrefs) {
            const parsed = JSON.parse(storedSortPrefs);
            // Migrate old prefs if they don't have viewMode or new keys
            const migrated = { ...DEFAULT_SORT_PREFS };
            Object.keys(parsed).forEach(key => {
                migrated[key] = {
                    ...DEFAULT_SORT_PREFS[key],
                    ...parsed[key]
                };
            });
            setSortPreferencesState(migrated);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    };
    loadSettings();
  }, []);

  const setDefaultTab = async (tab: Tab) => {
    setDefaultTabState(tab);
    await AsyncStorage.setItem(STORAGE_KEY_DEFAULT_TAB, tab);
  };

  const setThemeColor = async (color: string) => {
    setThemeColorState(color);
    await AsyncStorage.setItem(STORAGE_KEY_THEME_COLOR, color);
  };

  const setSortPreference = async (scope: SortScope, option: SortOption, order: 'ASC' | 'DESC', viewMode: ViewMode) => {
    const newPrefs = { ...sortPreferences, [scope]: { option, order, viewMode } };
    setSortPreferencesState(newPrefs);
    await AsyncStorage.setItem(STORAGE_KEY_SORT_PREFS, JSON.stringify(newPrefs));
  };

  return (
    <SettingsContext.Provider value={{ defaultTab, setDefaultTab, themeColor, setThemeColor, sortPreferences, setSortPreference }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
