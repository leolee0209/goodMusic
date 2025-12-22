import * as FileSystem from 'expo-file-system/legacy';
import { insertTracks, getAllTracks, deleteTrack, getTrackById, getAllTrackUris } from './database';
import { Track } from '../types';
import { parseMetadata, discoverAudioFiles } from './fileScanner';
import { logToFile } from './logger';

export const syncLibrary = async (onTrackProcessed?: (track: Track) => void, onDiscovery?: (total: number) => void) => {
  await logToFile('Starting library sync...');
  try {
    const internalMusicDir = FileSystem.documentDirectory + 'music/';

    // Ensure the directory exists
    const dirInfo = await FileSystem.getInfoAsync(internalMusicDir);
    if (!dirInfo.exists) {
      await logToFile(`Music directory does not exist, creating: ${internalMusicDir}`);
      await FileSystem.makeDirectoryAsync(internalMusicDir, { intermediates: true });
    }

    // Phase 1: Discovery
    await logToFile(`Phase 1: Discovering files in ${internalMusicDir}`);
    const filePaths = await discoverAudioFiles(internalMusicDir);
    const totalFiles = filePaths.length;
    await logToFile(`Discovered ${totalFiles} audio files.`);
    if (onDiscovery) onDiscovery(totalFiles);

    // Phase 2: Processing
    await logToFile('Phase 2: Processing files and checking database...');
    
    // Optimization: Load all existing tracks into memory once (O(1) lookup vs O(N) DB queries)
    const allDbTracks = await getAllTracks();
    const existingTracksMap = new Map<string, Track>();
    allDbTracks.forEach(t => existingTracksMap.set(t.uri, t));
    
    const finalTracks: Track[] = [];
    const albumArtCache = new Map<string, string>();
    let tracksToInsert: Track[] = [];

    // Concurrency control: process files in chunks
    const CHUNK_SIZE = 5; // Slight increase as DB bottleneck is removed
    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + CHUNK_SIZE);
      
      // Yield to UI thread every few chunks to prevent freezing
      if (i % (CHUNK_SIZE * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      await Promise.all(chunk.map(async (fullUri) => {
        try {
          // Check memory cache first
          if (existingTracksMap.has(fullUri)) {
            const existing = existingTracksMap.get(fullUri)!;
            finalTracks.push(existing);
            if (onTrackProcessed) onTrackProcessed(existing);
            return;
          }

          // It's a new track, parse metadata
          const fileName = fullUri.split('/').pop() || "";
          const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
          const dirPath = fullUri.substring(0, fullUri.lastIndexOf('/') + 1);
          
          let lrcContent = undefined;
          const metadata = await parseMetadata(fullUri, fileName, albumArtCache);
          
          // Try to find LRC
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          try {
            const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
            if (lrcInfo.exists) {
              lrcContent = await FileSystem.readAsStringAsync(lrcUri);
            }
          } catch (e) {}

          const newTrack: Track = {
            id: fullUri,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            uri: fullUri,
            artwork: metadata.artwork,
            lrc: lrcContent,
            trackNumber: metadata.trackNumber,
            duration: metadata.duration
          };

          finalTracks.push(newTrack);
          tracksToInsert.push(newTrack);
          
          if (onTrackProcessed) onTrackProcessed(newTrack);
        } catch (e) {
          await logToFile(`Error processing file in sync: ${fullUri} - ${e}`, 'ERROR');
        }
      }));

      // Batch Insert: Save every 50 new tracks to DB to keep memory low
      if (tracksToInsert.length >= 50) {
        await insertTracks(tracksToInsert);
        tracksToInsert = [];
      }
    }

    // Save remaining new tracks
    if (tracksToInsert.length > 0) {
      await insertTracks(tracksToInsert);
    }

    // Phase 3: Cleanup missing files
    // Use the Set logic against our initial DB snapshot
    await logToFile('Phase 3: Cleaning up missing files from database...');
    const foundUris = new Set(filePaths);
    let deletedCount = 0;
    
    // We iterate the map we loaded at the start
    for (const [uri, track] of existingTracksMap.entries()) {
      if (!foundUris.has(uri)) {
        await deleteTrack(track.id);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) await logToFile(`Deleted ${deletedCount} missing tracks from database.`);
    
    await logToFile('Library sync completed successfully.');
    return finalTracks;
  } catch (e) {
    await logToFile(`Library Sync Error: ${e}`, 'ERROR');
    return [];
  }
};