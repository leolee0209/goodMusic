import { Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { Track } from '../types';
import { logToFile } from '../utils/logger';
import { toAbsoluteUri, toRelativePath } from '../utils/pathUtils';

// Import LRU cache creator to prevent memory leaks
let createAlbumArtCache: () => any;
import('../utils/fileScanner').then(module => {
  createAlbumArtCache = module.createAlbumArtCache;
});

export const readLrcFile = async (filePath: string): Promise<string | undefined> => {
  if (!filePath) return undefined;
  
  try {
    const dirPath = Paths.dirname(filePath);
    const fileName = Paths.basename(filePath);
    const fileNameWithoutExt = Paths.basename(filePath, Paths.extname(filePath));
    const lrcUri = Paths.join(dirPath, fileNameWithoutExt + '.lrc');

    const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
    if (lrcInfo.exists) {
      return await FileSystem.readAsStringAsync(lrcUri);
    }
  } catch (e) {
    await logToFile(`Error reading LRC for ${Paths.basename(filePath)}: ${e}`, 'WARN');
  }
  return undefined;
};

export const parseAndEnrichTrack = async (
  uri: string,
  metadata: any,
  albumArtCache?: any
): Promise<Track> => {
  const lrcContent = await readLrcFile(uri);
  return {
    id: toRelativePath(uri), // Use stable ID
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    uri,
    artwork: toAbsoluteUri(metadata.artwork),
    lrc: lrcContent,
    trackNumber: metadata.trackNumber,
    duration: metadata.duration
  };
};

export const updateTracksWithMetadata = async (
  tracks: Track[],
  updateMap: Map<string, Track>
): Promise<Track[]> => {
  return tracks.map(t => updateMap.get(t.id) || t);
};

export const refreshMetadataForTrack = async (
  track: Track,
  parseMetadata: any,
  albumArtCache?: any
): Promise<Track> => {
  const { fileName } = getFilePathComponents(track.uri);
  const cache = albumArtCache || createAlbumArtCache();
  const metadata = await parseMetadata(track.uri, fileName, cache);
  const lrcContent = await readLrcFile(track.uri);

  return {
    ...track,
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    artwork: toAbsoluteUri(metadata.artwork),
    lrc: lrcContent,
    trackNumber: metadata.trackNumber,
    duration: metadata.duration
  };
};

export const refreshLyricsForTrack = async (track: Track): Promise<Track | null> => {
  const lrcContent = await readLrcFile(track.uri);
  if (lrcContent && lrcContent !== track.lrc) {
    return { ...track, lrc: lrcContent };
  }
  return null;
};

export const buildMetadataUpdateBatch = async (
  tracks: Track[],
  parseMetadata: any,
  onProgress: (current: number) => void
): Promise<Track[]> => {
  if (tracks.length === 0) {
    onProgress(0);
    return [];
  }
  
  const updates: Track[] = [];
  // Lazy load to avoid circular dependency
  if (!createAlbumArtCache) {
    const module = await import('../utils/fileScanner');
    createAlbumArtCache = module.createAlbumArtCache;
  }
  const sharedCache = createAlbumArtCache();
  
  for (let i = 0; i < tracks.length; i++) {
    try {
      const updated = await refreshMetadataForTrack(tracks[i], parseMetadata, sharedCache);
      updates.push(updated);
    } catch (e) {
      await logToFile(`Failed to refresh metadata for ${tracks[i].uri}: ${e}`, 'WARN');
    }
    if ((i + 1) % 10 === 0 || i === tracks.length - 1) {
      onProgress(i + 1);
    }
  }
  return updates;
};

export const buildLyricsUpdateBatch = async (
  tracks: Track[],
  onProgress: (current: number) => void
): Promise<Track[]> => {
  if (tracks.length === 0) {
    onProgress(0);
    return [];
  }
  
  const updates: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    try {
      const updated = await refreshLyricsForTrack(tracks[i]);
      if (updated) updates.push(updated);
    } catch (e) {
      await logToFile(`Error rescanning lyrics for ${tracks[i].title}: ${e}`, 'WARN');
    }
    if ((i + 1) % 50 === 0 || i === tracks.length - 1) {
      onProgress(i + 1);
    }
  }
  return updates;
};

// Helper to extract file path components
export const getFilePathComponents = (fullUri: string) => {
  const fileName = Paths.basename(fullUri);
  const dirPath = Paths.dirname(fullUri);
  const nameWithoutExt = Paths.basename(fullUri, Paths.extname(fullUri));
  
  return {
    fileName,
    nameWithoutExt,
    dirPath
  };
};

// Helper to create track from metadata
export const createTrackFromMetadata = (
  uri: string,
  metadata: any,
  lrcContent?: string
): Track => {
  return {
    id: toRelativePath(uri),
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    uri,
    artwork: metadata.artwork,
    lrc: lrcContent,
    trackNumber: metadata.trackNumber,
    duration: metadata.duration
  };
};

// Helper to resolve artwork URIs and sort tracks
export const processTracksWithArtwork = (
  tracks: Track[],
  resolveArtwork: (uri: string | undefined) => string | undefined
): Track[] => {
  return tracks
    .map(t => ({ ...t, artwork: resolveArtwork(t.artwork) }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
};
