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

    // Phase 2: Bulk check existence
    await logToFile('Phase 2: Processing files and checking database...');
    const existingUris = await getAllTrackUris();
    const tracks: Track[] = [];
    const albumArtCache = new Map<string, string>();

    // Concurrency control: process files in chunks
    const CHUNK_SIZE = 10;
    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + CHUNK_SIZE);
      await logToFile(`Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} (${chunk.length} files)...`);
      
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
          const metadata = await parseMetadata(fullUri, fileName, albumArtCache);
          
          // Try to find LRC
          const lrcUri = dirPath + nameWithoutExt + '.lrc';
          try {
            const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
            if (lrcInfo.exists) {
              lrcContent = await FileSystem.readAsStringAsync(lrcUri);
              await logToFile(`Found lyrics for: ${fileName}`);
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
            trackNumber: metadata.trackNumber
          };

          tracks.push(newTrack);
          if (onTrackProcessed) onTrackProcessed(newTrack);
        } catch (e) {
          await logToFile(`Error processing file in sync: ${fullUri} - ${e}`, 'ERROR');
        }
      }));
    }

    // Phase 3: Cleanup missing files
    await logToFile('Phase 3: Cleaning up missing files from database...');
    const dbTracks = await getAllTracks();
    const foundUris = new Set(filePaths);
    let deletedCount = 0;
    for (const dbTrack of dbTracks) {
      if (!foundUris.has(dbTrack.uri)) {
        await deleteTrack(dbTrack.id);
        deletedCount++;
      }
    }
    if (deletedCount > 0) await logToFile(`Deleted ${deletedCount} missing tracks from database.`);

    // Phase 4: Final batch save
    await logToFile(`Phase 4: Saving ${tracks.length} tracks to database...`);
    await insertTracks(tracks);
    
    await logToFile('Library sync completed successfully.');
    return tracks;
  } catch (e) {
    await logToFile(`Library Sync Error: ${e}`, 'ERROR');
    return [];
  }
};