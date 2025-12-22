import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Tab = 'songs' | 'artists' | 'albums' | 'playlists';

type SettingsContextType = {
  defaultTab: Tab;
  setDefaultTab: (tab: Tab) => void;
  themeColor: string;
  setThemeColor: (color: string) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEY_DEFAULT_TAB = '@goodmusic_default_tab';
const STORAGE_KEY_THEME_COLOR = '@goodmusic_theme_color';
const DEFAULT_THEME_COLOR = '#1DB954';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [defaultTab, setDefaultTabState] = useState<Tab>('songs');
  const [themeColor, setThemeColorState] = useState<string>(DEFAULT_THEME_COLOR);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedTab = await AsyncStorage.getItem(STORAGE_KEY_DEFAULT_TAB);
        const storedColor = await AsyncStorage.getItem(STORAGE_KEY_THEME_COLOR);

        if (storedTab) setDefaultTabState(storedTab as Tab);
        if (storedColor) setThemeColorState(storedColor);
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

  return (
    <SettingsContext.Provider value={{ defaultTab, setDefaultTab, themeColor, setThemeColor }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
