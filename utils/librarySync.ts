import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { insertTracks, clearLibrary } from './database';
import { Track } from '../types';
import { Platform } from 'react-native';
import { scanFolder } from './fileScanner';

export const syncLibrary = async () => {
  try {
    const tracks: Track[] = [];

    // 1. Media Library (OS Index)
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'granted') {
      let hasNextPage = true;
      let endCursor = '';

      while (hasNextPage) {
        const assets = await MediaLibrary.getAssetsAsync({
          mediaType: 'audio',
          first: 100,
          after: endCursor,
        });

        for (const asset of assets.assets) {
          tracks.push({
            id: asset.id, // Use asset ID
            title: asset.filename.replace(/\.[^/.]+$/, ""),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            uri: asset.uri,
            artwork: undefined,
          });
        }

        hasNextPage = assets.hasNextPage;
        endCursor = assets.endCursor;
      }
    }

    // 2. Local Documents (Imported Files)
    const docUri = (FileSystem as any).documentDirectory;
    if (docUri) {
      const docTracks = await scanFolder(docUri);
      tracks.push(...docTracks);
    }

    // 3. Batch Insert
    // We clear old data to avoid stale entries, or we could upsert.
    // For a "Sync", clearing might be safer to remove deleted files, 
    // but preserving ID3 cache would be better. 
    // For now, fast & simple: Clear & Replace.
    await clearLibrary();
    await insertTracks(tracks);
    
    return tracks;

  } catch (e) {
    console.error("Library Sync Error:", e);
    return [];
  }
};
