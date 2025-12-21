import * as FileSystem from 'expo-file-system/legacy';
import { insertTracks, getAllTracks, deleteTrack } from './database';
import { Track } from '../types';
import { scanFolder } from './fileScanner';

export const syncLibrary = async () => {
  try {
    const tracks: Track[] = [];
    const internalMusicDir = FileSystem.documentDirectory + 'music/';

    // Ensure the directory exists
    const dirInfo = await FileSystem.getInfoAsync(internalMusicDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(internalMusicDir, { intermediates: true });
    }

    // 1. Scan the internal app storage
    const internalTracks = await scanFolder(internalMusicDir);
    tracks.push(...internalTracks);

    // 2. Cleanup non-existent files from DB
    const dbTracks = await getAllTracks();
    const foundUris = new Set(tracks.map(t => t.uri));
    
    for (const dbTrack of dbTracks) {
      if (!foundUris.has(dbTrack.uri)) {
        await deleteTrack(dbTrack.id);
      }
    }

    // 3. Batch Upsert new/updated tracks
    await insertTracks(tracks);
    
    return tracks;
  } catch (e) {
    console.error("Library Sync Error:", e);
    return [];
  }
};

