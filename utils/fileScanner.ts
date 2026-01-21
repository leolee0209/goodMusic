import { Buffer } from 'buffer';
import { Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as mm from 'music-metadata-browser';
import { createTrackFromMetadata, getFilePathComponents, readLrcFile } from '../services/libraryService';
import { Track } from '../types';
import { getTrackById, insertTracks } from './database';
import { logToFile } from './logger';
import { toRelativePath } from './pathUtils';

const CACHE_DIR = Paths.cache.uri + (Paths.cache.uri.endsWith('/') ? '' : '/');
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'];

// LRU Cache for album art to prevent memory issues
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}

export const createAlbumArtCache = () => new LRUCache<string, string>(100);

// Helper to extract metadata using music-metadata

export const parseMetadata = async (uri: string, fileName: string, albumArtCache: LRUCache<string, string> | Map<string, string>) => {

  try {
    // Validate file exists before reading
    const fileInfo = await LegacyFileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }
    
    let readLength = 512 * 1024; // Default fallback: 512KB
    let formatLabel = 'UNKNOWN';
    
    // Step 1: Peek header to determine exact metadata size
    try {
      const headerContent = await LegacyFileSystem.readAsStringAsync(uri, {
        encoding: LegacyFileSystem.EncodingType.Base64,
        length: 16,
        position: 0
      });
      const headerBuffer = Buffer.from(headerContent, 'base64');
      
      // ID3v2 (MP3)
      if (headerBuffer.slice(0, 3).toString() === 'ID3') {
        formatLabel = 'MP3/ID3v2';
        const tagSize = ((headerBuffer[6] & 0x7f) << 21) | ((headerBuffer[7] & 0x7f) << 14) | ((headerBuffer[8] & 0x7f) << 7) | (headerBuffer[9] & 0x7f);
        readLength = Math.min(tagSize + 10, 10 * 1024 * 1024); 
      } 
      // MPEG-4 (M4A/MP4) - Atom based
      else if (headerBuffer.slice(4, 8).toString() === 'ftyp') {
        formatLabel = 'MPEG-4';
        const ftypSize = headerBuffer.readUInt32BE(0);
        // Peek further to see if 'moov' follows 'ftyp' (common in optimized files)
        const nextHeader = await LegacyFileSystem.readAsStringAsync(uri, {
            encoding: LegacyFileSystem.EncodingType.Base64,
            length: 8,
            position: ftypSize
        });
        const nextBuffer = Buffer.from(nextHeader, 'base64');
        if (nextBuffer.slice(4, 8).toString() === 'moov') {
            const moovSize = nextBuffer.readUInt32BE(0);
            readLength = Math.min(ftypSize + moovSize, 10 * 1024 * 1024);
        } else {
            // moov is not at the start, read a bigger chunk as fallback
            readLength = 2 * 1024 * 1024;
        }
      }
      // FLAC
      else if (headerBuffer.slice(0, 4).toString() === 'fLaC') {
        formatLabel = 'FLAC';
        readLength = 1024 * 1024; // FLAC tags are usually in the first 1MB
      }
    } catch (e) {
        await logToFile(`Header peek failed for ${fileName}: ${e}`, 'WARN');
    }

    // Step 2: Read the determined length
    const fileContent = await LegacyFileSystem.readAsStringAsync(uri, {
      encoding: LegacyFileSystem.EncodingType.Base64,
      length: readLength,
      position: 0
    });

    const buffer = Buffer.from(fileContent, 'base64');

    // Determine MIME based on extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    let mimeType = 'audio/mpeg'; // default
    if (ext === 'm4a' || ext === 'mp4') mimeType = 'audio/mp4';
    if (ext === 'wav') mimeType = 'audio/wav';
    if (ext === 'flac') mimeType = 'audio/flac';
    if (ext === 'ogg') mimeType = 'audio/ogg';

    // Parse with cover extraction enabled
    const metadata = await mm.parseBuffer(buffer, mimeType, { 
      duration: true, 
      skipCovers: false, 
      skipPostHeaders: true 
    });
    
    const artist = metadata.common.artist || 'Unknown Artist';
    const album = metadata.common.album || 'Unknown Album';
    const title = metadata.common.title || Paths.basename(fileName, Paths.extname(fileName));
    const trackNumber = metadata.common.track.no || undefined;
    const duration = metadata.format.duration ? Math.floor(metadata.format.duration * 1000) : undefined;

    let artworkUri: string | undefined = undefined;

    // Artwork Logic
    if (album !== 'Unknown Album' && albumArtCache.has(album)) {
      artworkUri = albumArtCache.get(album);
    } else if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      if (pic.data) {
        try {
          const artworkCacheDir = CACHE_DIR + 'artworks/';
          const dirInfo = await LegacyFileSystem.getInfoAsync(artworkCacheDir);
          if (!dirInfo.exists) {
            await LegacyFileSystem.makeDirectoryAsync(artworkCacheDir, { intermediates: true });
          }

          const safeName = (album + '_' + artist).replace(/[^a-z0-9]/gi, '_').substring(0, 50);
          const artFileName = `art_${safeName}.jpg`; 
          const artUri = artworkCacheDir + artFileName;

          const base64Art = pic.data.toString('base64');
          await LegacyFileSystem.writeAsStringAsync(artUri, base64Art, {
            encoding: LegacyFileSystem.EncodingType.Base64
          });

          artworkUri = artUri;
          
          if (album !== 'Unknown Album') {
            albumArtCache.set(album, artUri);
          }
        } catch (err) {
          await logToFile(`Failed to save artwork for ${fileName}: ${err}`, 'WARN');
        }
      }
    } else {
        // Fallback: Check folder for artwork
        try {
            const dirPath = Paths.dirname(uri) + '/';
            const folderImages = ['cover.jpg', 'folder.jpg', 'front.jpg', 'artwork.jpg', 'cover.png', 'folder.png', 'front.png', 'artwork.png'];
            
            for (const imgName of folderImages) {
                const imgUri = dirPath + imgName;
                const info = await LegacyFileSystem.getInfoAsync(imgUri);
                if (info.exists) {
                    artworkUri = imgUri;
                    if (album !== 'Unknown Album') {
                        albumArtCache.set(album, artworkUri);
                    }
                    await logToFile(`Found folder artwork for ${fileName}: ${imgName}`);
                    break;
                }
            }
        } catch (e) {
            await logToFile(`Error scanning folder for artwork fallback: ${e}`, 'WARN');
        }
    }
    
    await logToFile(`Parsed ${fileName}: ${formatLabel} | ${title} - ${artist} | Dur: ${duration}ms | Art: ${!!artworkUri} | Read: ${Math.round(readLength/1024)}KB`);

    return {
      title,
      artist,
      album,
      artwork: artworkUri,
      trackNumber,
      duration
    };
  } catch (e) {
    await logToFile(`Metadata parse failed for ${fileName}: ${e}`, 'ERROR');
    return {
      title: Paths.basename(fileName, Paths.extname(fileName)),
      artist: 'Unknown Artist',
      album: 'Unknown Album'
    };
  }
};

export const discoverAudioFiles = async (folderUri: string): Promise<string[]> => {
  await logToFile(`[discoverAudioFiles] Starting discovery in: ${folderUri}`);
  const audioFiles: string[] = [];
  let directoriesScanned = 0;
  let filesChecked = 0;
  const visitedPaths = new Set<string>(); // Prevent infinite loops

  const walk = async (uri: string) => {
    try {
      // Prevent infinite recursion
      if (visitedPaths.has(uri)) {
        await logToFile(`[discoverAudioFiles] Already visited: ${uri}, skipping to prevent loop`, 'WARN');
        return;
      }
      visitedPaths.add(uri);
      
      directoriesScanned++;
      const info = await LegacyFileSystem.getInfoAsync(uri);
      if (!info.exists) {
        await logToFile(`[discoverAudioFiles] Path does not exist: ${uri}`, 'WARN');
        return;
      }
      
      if (!info.isDirectory) {
        await logToFile(`[discoverAudioFiles] Not a directory: ${uri}`, 'WARN');
        return;
      }

      const files = await LegacyFileSystem.readDirectoryAsync(uri);
      await logToFile(`[discoverAudioFiles] Scanning directory ${directoriesScanned}: ${uri} (${files.length} items)`);
      
      for (const file of files) {
        // CRITICAL: Properly encode the filename to handle special characters like #, %, space, etc.
        // encodeURIComponent handles: # % & + , / : ; = ? @ [ ] space and more
        const encodedFile = encodeURIComponent(file);
        const fullUri = uri + (uri.endsWith('/') ? '' : '/') + encodedFile;
        const lowerName = file.toLowerCase();
        filesChecked++;
        
        // First check: If it's an audio file extension, add it directly
        if (AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
          audioFiles.push(fullUri);
          // Log every 10 audio files found
          if (audioFiles.length % 10 === 0) {
            await logToFile(`[discoverAudioFiles] Found ${audioFiles.length} audio files so far...`);
          }
          continue; // Skip to next item
        }
        
        // If it has any extension, it's a file (not a directory) - skip it
        const extension = Paths.extname(file);
        if (extension) {
          // It's a non-audio file, skip
          continue;
        }
        
        // No extension - likely a directory
        // Use readDirectoryAsync as a reliable directory test
        // If it's a directory, this will succeed; if it's a file, it will throw
        try {
          await LegacyFileSystem.readDirectoryAsync(fullUri);
          // Success means it's a directory - recurse into it
          await walk(fullUri);
        } catch (e) {
          // Failed to read as directory - it's a file or inaccessible, skip it
          // Only log if it looks suspicious (no extension but not a directory)
          await logToFile(`[discoverAudioFiles] Skipped non-directory item without extension: ${file}`, 'WARN');
        }
      }
    } catch (e) {
      await logToFile(`[discoverAudioFiles] Error walking directory ${uri}: ${e}`, 'ERROR');
    }
  };

  await walk(folderUri);
  await logToFile(`[discoverAudioFiles] Discovery complete: ${audioFiles.length} audio files found, ${directoriesScanned} directories scanned, ${filesChecked} files checked`);
  return audioFiles;
};

export const scanFolder = async (folderUri: string, onTrackProcessed?: (track: Track) => void): Promise<Track[]> => {
  const tracks: Track[] = [];
  const albumArtCache = createAlbumArtCache();
  
  await logToFile(`Starting scanFolder for: ${folderUri}`);
  const filePaths = await discoverAudioFiles(folderUri);
  await logToFile(`Discovered ${filePaths.length} files in folder.`);
  
  for (const fullUri of filePaths) {
    try {
      const { fileName } = getFilePathComponents(fullUri);
      if (!fileName) continue;
      
      const lrcContent = await readLrcFile(fullUri);
      const stableId = toRelativePath(fullUri);
      
      const existingTrack = await getTrackById(stableId);
      let track: Track;

      if (existingTrack) {
        // Update LRC if found and different
        if (lrcContent && lrcContent !== existingTrack.lrc) {
          track = { ...existingTrack, lrc: lrcContent };
        } else {
          track = existingTrack;
        }
      } else {
        const metadata = await parseMetadata(fullUri, fileName, albumArtCache);
        track = createTrackFromMetadata(fullUri, metadata, lrcContent);
      }

      tracks.push(track);
      if (onTrackProcessed) onTrackProcessed(track);
    } catch (error) {
      await logToFile(`Error processing file in scanFolder: ${fullUri} - ${error}`, 'ERROR');
    }
  }

  // Insert all tracks to database
  if (tracks.length > 0) {
    try {
      await insertTracks(tracks);
      await logToFile(`scanFolder: Inserted ${tracks.length} tracks to database.`);
    } catch (e) {
      await logToFile(`scanFolder: Error inserting tracks: ${e}`, 'ERROR');
    }
  }

  await logToFile(`scanFolder completed. Processed ${tracks.length} tracks.`);
  return tracks;
};
