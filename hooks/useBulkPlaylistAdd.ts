import { Alert } from 'react-native';
import { useMusic } from '../contexts/MusicContext';

/**
 * Hook for handling bulk addition of tracks to playlists.
 * Provides a unified Alert-based playlist picker for selected tracks.
 */
export const useBulkPlaylistAdd = () => {
  const { playlists, addToPlaylist } = useMusic();

  const showPlaylistPicker = (selectedTracks: string[], onComplete?: () => void) => {
    if (selectedTracks.length === 0) return;

    const count = selectedTracks.length;
    const songText = count === 1 ? 'song' : 'songs';

    Alert.alert(
      'Add to Playlist',
      `Select a playlist to add ${count} ${songText}:`,
      [
        ...playlists.map(p => ({
          text: p.title,
          onPress: async () => {
            await addToPlaylist(p.id, selectedTracks);
            onComplete?.();
          }
        })),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return { showPlaylistPicker };
};
