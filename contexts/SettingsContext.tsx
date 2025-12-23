import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tab = 'songs' | 'artists' | 'albums' | 'playlists';
export type ViewMode = 'list' | 'grid' | 'condensed';

export type SortPreference = {
  option: string;
  order: 'ASC' | 'DESC';
  viewMode: ViewMode;
};

type SettingsContextType = {
  defaultTab: Tab;
  setDefaultTab: (tab: Tab) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  sortPreferences: Record<Tab, SortPreference>;
  setSortPreference: (tab: Tab, option: string, order: 'ASC' | 'DESC', viewMode: ViewMode) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY_DEFAULT_TAB = '@goodmusic_default_tab';
const STORAGE_KEY_THEME_COLOR = '@goodmusic_theme_color';
const STORAGE_KEY_SORT_PREFS = '@goodmusic_sort_prefs';
const DEFAULT_THEME_COLOR = '#1DB954';

const DEFAULT_SORT_PREFS: Record<Tab, SortPreference> = {
  songs: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  artists: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  albums: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
  playlists: { option: 'Alphabetical', order: 'ASC', viewMode: 'list' },
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [defaultTab, setDefaultTabState] = useState<Tab>('songs');
  const [themeColor, setThemeColorState] = useState<string>(DEFAULT_THEME_COLOR);
  const [sortPreferences, setSortPreferencesState] = useState<Record<Tab, SortPreference>>(DEFAULT_SORT_PREFS);

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
            // Migrate old prefs if they don't have viewMode
            const migrated = { ...DEFAULT_SORT_PREFS };
            Object.keys(parsed).forEach(key => {
                const k = key as Tab;
                migrated[k] = {
                    ...DEFAULT_SORT_PREFS[k],
                    ...parsed[k]
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

  const setSortPreference = async (tab: Tab, option: string, order: 'ASC' | 'DESC', viewMode: ViewMode) => {
    const newPrefs = { ...sortPreferences, [tab]: { option, order, viewMode } };
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
