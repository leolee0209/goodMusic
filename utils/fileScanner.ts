import * as LegacyLegacyFileSystem from 'expo-file-system/legacy';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { Track } from '../types';
import * as mm from 'music-metadata-browser';
import { Buffer } from 'buffer';
import { getTrackById } from './database';
import { logToFile } from './logger';

const CACHE_DIR = Paths.cache.uri + (Paths.cache.uri.endsWith('/') ? '' : '/');
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'];

// Helper to extract metadata using music-metadata

export const parseMetadata = async (uri: string, fileName: string, albumArtCache: Map<string, string>) => {

  try {
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
    const title = metadata.common.title || fileName.replace(/\.[^/.]+$/, "");
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
            const dirPath = uri.substring(0, uri.lastIndexOf('/') + 1);
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
            // Ignore folder scan errors
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
      title: fileName.replace(/\.[^/.]+$/, ""),
      artist: 'Unknown Artist',
      album: 'Unknown Album'
    };
  }
};

export const discoverAudioFiles = async (folderUri: string): Promise<string[]> => {
  const audioFiles: string[] = [];

  const walk = async (uri: string) => {
    try {
      const info = await LegacyFileSystem.getInfoAsync(uri);
      if (!info.exists || !info.isDirectory) return;

      const files = await LegacyFileSystem.readDirectoryAsync(uri);
      for (const file of files) {
        const fullUri = uri + (uri.endsWith('/') ? '' : '/') + file;
        const lowerName = file.toLowerCase();
        
        try {
          const fileInfo = await LegacyFileSystem.getInfoAsync(fullUri);
          if (fileInfo.isDirectory) {
            await walk(fullUri);
          } else if (AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
            audioFiles.push(fullUri);
          }
        } catch (e) {}
      }
    } catch (e) {}
  };

  await walk(folderUri);
  return audioFiles;
};

export const scanFolder = async (folderUri: string, onTrackProcessed?: (track: Track) => void): Promise<Track[]> => {
  const tracks: Track[] = [];
  const albumArtCache = new Map<string, string>();
  
  await logToFile(`Starting scanFolder for: ${folderUri}`);
  const filePaths = await discoverAudioFiles(folderUri);
  await logToFile(`Discovered ${filePaths.length} files in folder.`);
  
  for (const fullUri of filePaths) {
    try {
      const fileName = fullUri.split('/').pop() || "";
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
      const dirPath = fullUri.substring(0, fullUri.lastIndexOf('/') + 1);
      
      const lrcUri = dirPath + nameWithoutExt + '.lrc';
      let lrcContent = undefined;
      try {
        const lrcInfo = await LegacyFileSystem.getInfoAsync(lrcUri);
        if (lrcInfo.exists) {
          lrcContent = await LegacyFileSystem.readAsStringAsync(lrcUri);
        }
      } catch (e) {}

      const existingTrack = await getTrackById(fullUri);
      let track: Track;

      if (existingTrack) {
        if (!existingTrack.lrc && lrcContent) {
          existingTrack.lrc = lrcContent;
        }
        track = existingTrack;
      } else {
        const metadata = await parseMetadata(fullUri, fileName, albumArtCache);
        track = {
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
      }

      tracks.push(track);
      if (onTrackProcessed) onTrackProcessed(track);
    } catch (error) {
      await logToFile(`Error processing file in scanFolder: ${fullUri} - ${error}`, 'ERROR');
    }
  }

  await logToFile(`scanFolder completed. Processed ${tracks.length} tracks.`);
  return tracks;
};
