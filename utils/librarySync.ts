import * as FileSystem from 'expo-file-system/legacy';
import { createTrackFromMetadata, getFilePathComponents, readLrcFile } from '../services/libraryService';
import { Track } from '../types';
import { deleteTrack, getAllTracks, insertTracks, removeDuplicates } from './database';
import { createAlbumArtCache, discoverAudioFiles, parseMetadata } from './fileScanner';
import { logToFile } from './logger';

// Prevent concurrent syncs
let isSyncInProgress = false;

export const ensureMusicDirectory = async () => {
  const internalMusicDir = FileSystem.documentDirectory + 'music/';
  try {
    const dirInfo = await FileSystem.getInfoAsync(internalMusicDir);
    if (!dirInfo.exists) {
      await logToFile(`Music directory does not exist, creating: ${internalMusicDir}`);
      await FileSystem.makeDirectoryAsync(internalMusicDir, { intermediates: true });
    }

    const files = await FileSystem.readDirectoryAsync(internalMusicDir);
    if (files.length === 0) {
      await logToFile('Music directory is empty, creating placeholder file.');
      await FileSystem.writeAsStringAsync(internalMusicDir + 'PLACE_MUSIC_HERE.txt', 'Place your audio files (.mp3, .m4a, .wav, .flac) in this folder to sync them with the library.');
    }
  } catch (e) {
    await logToFile(`Error ensuring music directory: ${e}`, 'ERROR');
  }
};

export const syncLibrary = async (onTrackProcessed?: (track: Track) => void, onDiscovery?: (total: number) => void) => {
  // Prevent concurrent syncs
  if (isSyncInProgress) {
    await logToFile('Sync already in progress, skipping...', 'WARN');
    return [];
  }
  
  isSyncInProgress = true;
  const syncStartTime = Date.now();
  
  try {
    await logToFile('========================================');
    await logToFile('Starting library sync...');
    const internalMusicDir = FileSystem.documentDirectory + 'music/';
    await logToFile('Music directory path: ' + internalMusicDir);
    await ensureMusicDirectory();
    await logToFile('Music directory ensured.');

    // Phase 1: Discovery
    await logToFile(`Phase 1: Discovering files in ${internalMusicDir}`);
    const discoveryStart = Date.now();
    const filePaths = await discoverAudioFiles(internalMusicDir);
    const discoveryTime = Date.now() - discoveryStart;
    const totalFiles = filePaths.length;
    await logToFile(`Discovered ${totalFiles} audio files in ${discoveryTime}ms`);
    if (totalFiles > 0) {
      await logToFile(`First 5 files: ${filePaths.slice(0, 5).map(f => f.split('/').pop()).join(', ')}`);
    }
    if (onDiscovery) onDiscovery(totalFiles);

    // Phase 2: Processing
    await logToFile('Phase 2: Processing files and checking database...');
    
    // Optimization: Load all existing tracks into memory once (O(1) lookup vs O(N) DB queries)
    const dbLoadStart = Date.now();
    const allDbTracks = await getAllTracks();
    const dbLoadTime = Date.now() - dbLoadStart;
    await logToFile(`Loaded ${allDbTracks.length} existing tracks from DB in ${dbLoadTime}ms`);
    const existingTracksMap = new Map<string, Track>();
    // Use URI as key for faster lookup and duplicate prevention
    allDbTracks.forEach(t => existingTracksMap.set(t.uri, t));
    await logToFile('Built existing tracks lookup map.');
    
    const finalTracks: Track[] = [];
    const albumArtCache = createAlbumArtCache();
    let tracksToInsert: Track[] = [];
    const processedUris = new Set<string>(); // Prevent duplicate processing

    // Concurrency control: process files in chunks with better performance
    const CHUNK_SIZE = 10; // Increased for better performance
    await logToFile(`Processing ${totalFiles} files in chunks of ${CHUNK_SIZE}...`);
    let processedCount = 0;
    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + CHUNK_SIZE);
      const chunkStart = Date.now();
      
      // Yield to UI thread more frequently to prevent freezing
      if (i % (CHUNK_SIZE * 2) === 0) {
        await logToFile(`Progress: ${i}/${totalFiles} files (${Math.round(i/totalFiles*100)}%)`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await Promise.all(chunk.map(async (fullUri) => {
        try {
          // Prevent duplicate processing of same URI
          if (processedUris.has(fullUri)) {
            await logToFile(`Skipping duplicate URI: ${fullUri}`, 'WARN');
            return;
          }
          processedUris.add(fullUri);
          processedCount++;
          
          // Check memory cache first
          if (existingTracksMap.has(fullUri)) {
            const existing = existingTracksMap.get(fullUri)!;
            finalTracks.push(existing);
            if (onTrackProcessed) onTrackProcessed(existing);
            return;
          }

          // It's a new track, parse metadata
          const { fileName, dirPath } = getFilePathComponents(fullUri);
          if (!fileName) {
            await logToFile(`Invalid file path: ${fullUri}`, 'WARN');
            return;
          }
          
          const lrcContent = await readLrcFile(fullUri);
          const metadata = await parseMetadata(fullUri, fileName, albumArtCache);
          const newTrack = createTrackFromMetadata(fullUri, metadata, lrcContent);

          finalTracks.push(newTrack);
          tracksToInsert.push(newTrack);
          
          if (onTrackProcessed) onTrackProcessed(newTrack);
        } catch (e) {
          await logToFile(`Error processing file in sync: ${fullUri} - ${e}`, 'ERROR');
        }
      }));
      
      const chunkTime = Date.now() - chunkStart;
      await logToFile(`Chunk processed: ${chunk.length} files in ${chunkTime}ms (avg ${Math.round(chunkTime/chunk.length)}ms/file)`);

      // Batch Insert: Save every 30 new tracks to DB for better performance
      if (tracksToInsert.length >= 30) {
        await logToFile(`Batch inserting ${tracksToInsert.length} tracks...`);
        const batchStart = Date.now();
        try {
          await insertTracks(tracksToInsert);
          const batchTime = Date.now() - batchStart;
          await logToFile(`Batch insert completed in ${batchTime}ms`);
          tracksToInsert = [];
        } catch (e) {
          await logToFile(`Error in batch insert: ${e}`, 'ERROR');
          tracksToInsert = []; // Clear to prevent re-attempting failed batch
        }
      }
    }

    // Save remaining new tracks with error handling
    if (tracksToInsert.length > 0) {
      await logToFile(`Final batch: inserting ${tracksToInsert.length} tracks...`);
      const finalBatchStart = Date.now();
      try {
        await insertTracks(tracksToInsert);
        const finalBatchTime = Date.now() - finalBatchStart;
        await logToFile(`Final batch insert completed in ${finalBatchTime}ms`);
      } catch (e) {
        await logToFile(`Error in final batch insert: ${e}`, 'ERROR');
      }
    }

    await logToFile(`Total files processed: ${processedCount}/${totalFiles}`);
    await logToFile(`New tracks found: ${finalTracks.length - existingTracksMap.size}`);
    await logToFile(`Existing tracks: ${existingTracksMap.size}`);

    // Phase 3: Cleanup missing files
    // Use the Set logic against our initial DB snapshot
    await logToFile('Phase 3: Cleaning up missing files from database...');
    const cleanupStart = Date.now();
    const foundUris = new Set(filePaths);
    let deletedCount = 0;
    
    // We iterate the map we loaded at the start
    for (const [uri, track] of existingTracksMap.entries()) {
      if (!foundUris.has(uri)) {
        await logToFile(`Removing missing track: ${track.title} by ${track.artist} (${uri})`, 'WARN');
        await deleteTrack(track.id);
        deletedCount++;
      }
    }
    
    const cleanupTime = Date.now() - cleanupStart;
    if (deletedCount > 0) {
      await logToFile(`Deleted ${deletedCount} missing tracks from database in ${cleanupTime}ms`);
    } else {
      await logToFile(`No missing tracks to delete (${cleanupTime}ms)`);
    }
    
    // Phase 4: Deduplication
    await logToFile('Phase 4: Removing duplicates...');
    const dedupeStart = Date.now();
    await removeDuplicates();
    const dedupeTime = Date.now() - dedupeStart;
    await logToFile(`Deduplication completed in ${dedupeTime}ms`);

    const totalSyncTime = Date.now() - syncStartTime;
    await logToFile(`Library sync completed successfully in ${totalSyncTime}ms (${Math.round(totalSyncTime/1000)}s)`);
    await logToFile('========================================');
    return finalTracks;
  } catch (e) {
    await logToFile(`Library Sync Error: ${e}`, 'ERROR');
    return [];
  } finally {
    isSyncInProgress = false;
  }
};