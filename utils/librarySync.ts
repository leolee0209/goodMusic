import * as FileSystem from 'expo-file-system/legacy';
import { insertTracks, getAllTracks, deleteTrack, getTrackById, getAllTrackUris } from './database';
import { Track } from '../types';

export const syncLibrary = async (onTrackProcessed?: (track: Track) => void, onDiscovery?: (total: number) => void) => {
  try {
    const internalMusicDir = FileSystem.documentDirectory + 'music/';

    // Ensure the directory exists
    const dirInfo = await FileSystem.getInfoAsync(internalMusicDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(internalMusicDir, { intermediates: true });
    }

    // Phase 1: Discovery
    const filePaths = await import('./fileScanner').then(m => m.discoverAudioFiles(internalMusicDir));
    const totalFiles = filePaths.length;
    if (onDiscovery) onDiscovery(totalFiles);

    // Phase 2: Bulk check existence
    const existingUris = await getAllTrackUris();
    const tracks: Track[] = [];
    const albumArtCache = new Map<string, string>();

    // Concurrency control: process files in chunks
    const CHUNK_SIZE = 10;
    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + CHUNK_SIZE);
      
      await Promise.all(chunk.map(async (fullUri) => {
        try {
          const fileName = fullUri.split('/').pop() || "";
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          const dirPath = fullUri.substring(0, fullUri.lastIndexOf('/') + 1);
          
          let lrcContent = undefined;
          
          if (existingUris.has(fullUri)) {
            const existing = await getTrackById(fullUri);
            if (existing) {
              tracks.push(existing);
              if (onTrackProcessed) onTrackProcessed(existing);
              return;
            }
          }

          // It's a new track, parse metadata
          const metadata = await import('./fileScanner').then(m => (m as any).parseMetadata(fullUri, fileName, albumArtCache));
          
          // Try to find LRC
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          try {
            const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
            if (lrcInfo.exists) lrcContent = await FileSystem.readAsStringAsync(lrcUri);
          } catch (e) {}

          const newTrack: Track = {
            id: fullUri,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            uri: fullUri,
            artwork: metadata.artwork,
            lrc: lrcContent,
            trackNumber: metadata.trackNumber
          };

          tracks.push(newTrack);
          if (onTrackProcessed) onTrackProcessed(newTrack);
        } catch (e) {
          console.error("Error processing file in sync:", fullUri, e);
        }
      }));
    }

    // Phase 3: Cleanup missing files
    const dbTracks = await getAllTracks();
    const foundUris = new Set(filePaths);
    for (const dbTrack of dbTracks) {
      if (!foundUris.has(dbTrack.uri)) {
        await deleteTrack(dbTrack.id);
      }
    }

    // Phase 4: Final batch save
    await insertTracks(tracks);
    
    return tracks;
  } catch (e) {
    console.error("Library Sync Error:", e);
    return [];
  }
};