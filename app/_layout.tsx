import { Stack } from "expo-router";
import { MusicProvider } from "../contexts/MusicContext";
import { StatusBar } from "expo-status-bar";
import { Buffer } from 'buffer';

global.Buffer = global.Buffer || Buffer;

export default function RootLayout() {
  return (
    <MusicProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: '#121212' },
        headerTintColor: '#fff',
        contentStyle: { backgroundColor: '#121212' }
      }}>
        <Stack.Screen name="index" options={{ title: "GoodMusic" }} />
        <Stack.Screen name="player" options={{ 
          presentation: 'modal',
          title: 'Now Playing',
          headerShown: false // We might want a custom header in the player
        }} />
      </Stack>
    </MusicProvider>
  );
}