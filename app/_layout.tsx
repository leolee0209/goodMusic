import { Buffer } from 'buffer';
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import TrackPlayer from 'react-native-track-player';
import { MusicProvider } from "../contexts/MusicContext";
import { SettingsProvider } from "../contexts/SettingsContext";

global.Buffer = global.Buffer || Buffer;

TrackPlayer.registerPlaybackService(() => require('../service').default);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <MusicProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{
            headerStyle: { backgroundColor: '#121212' },
            headerTintColor: '#fff',
            contentStyle: { backgroundColor: '#121212' },
            headerShown: false
          }}>
            <Stack.Screen name="index" options={{ title: "GoodMusic" }} />
            <Stack.Screen name="player" options={{ 
              presentation: 'modal',
              title: 'Now Playing'
            }} />
          </Stack>
        </MusicProvider>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}