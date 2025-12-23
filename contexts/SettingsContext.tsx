import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tab = 'songs' | 'artists' | 'albums' | 'playlists';
export type SortOrder = 'ASC' | 'DESC';

export type SortPreference = {
  option: string;
  order: SortOrder;
};

export type SortPreferences = Record<Tab, SortPreference>;

type SettingsContextType = {
  defaultTab: Tab;
  setDefaultTab: (tab: Tab) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
  sortPreferences: SortPreferences;
  setSortPreference: (tab: Tab, option: string, order: SortOrder) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY_DEFAULT_TAB = '@goodmusic_default_tab';
const STORAGE_KEY_THEME_COLOR = '@goodmusic_theme_color';
const STORAGE_KEY_SORT_PREFS = '@goodmusic_sort_prefs';
const DEFAULT_THEME_COLOR = '#1DB954';

const DEFAULT_SORT_PREFS: SortPreferences = {
  songs: { option: 'Alphabetical', order: 'ASC' },
  artists: { option: 'Alphabetical', order: 'ASC' },
  albums: { option: 'Alphabetical', order: 'ASC' },
  playlists: { option: 'Alphabetical', order: 'ASC' },
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [defaultTab, setDefaultTabState] = useState<Tab>('songs');
  const [themeColor, setThemeColorState] = useState<string>(DEFAULT_THEME_COLOR);
  const [sortPreferences, setSortPreferencesState] = useState<SortPreferences>(DEFAULT_SORT_PREFS);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedTab = await AsyncStorage.getItem(STORAGE_KEY_DEFAULT_TAB);
        const storedColor = await AsyncStorage.getItem(STORAGE_KEY_THEME_COLOR);
        const storedSort = await AsyncStorage.getItem(STORAGE_KEY_SORT_PREFS);

        if (storedTab) setDefaultTabState(storedTab as Tab);
        if (storedColor) setThemeColorState(storedColor);
        if (storedSort) {
             setSortPreferencesState({ ...DEFAULT_SORT_PREFS, ...JSON.parse(storedSort) });
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

  const setSortPreference = async (tab: Tab, option: string, order: SortOrder) => {
    setSortPreferencesState(prev => {
        const newPrefs = { ...prev, [tab]: { option, order } };
        AsyncStorage.setItem(STORAGE_KEY_SORT_PREFS, JSON.stringify(newPrefs));
        return newPrefs;
    });
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
