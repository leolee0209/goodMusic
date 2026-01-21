import * as FileSystem from 'expo-file-system/legacy';
import { Track } from '../types';
import { logToFile } from '../utils/logger';
import { toAbsoluteUri } from '../utils/pathUtils';

export const readLrcFile = async (filePath: string): Promise<string | undefined> => {
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/') + 1);
  const fileName = filePath.split('/').pop() || '';
  const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
  const lrcUri = dirPath + nameWithoutExt + '.lrc';

  try {
    const lrcInfo = await FileSystem.getInfoAsync(lrcUri);
    if (lrcInfo.exists) {
      return await FileSystem.readAsStringAsync(lrcUri);
    }
  } catch (e) {
    await logToFile(`Error reading LRC for ${fileName}: ${e}`, 'WARN');
  }
  return undefined;
};

export const parseAndEnrichTrack = async (
  uri: string,
  metadata: any,
  albumArtCache: Map<string, string>
): Promise<Track> => {
  const lrcContent = await readLrcFile(uri);
  return {
    id: uri,
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
  parseMetadata: any
): Promise<Track> => {
  const fileName = track.uri.split('/').pop() || '';
  const albumArtCache = new Map<string, string>();
  const metadata = await parseMetadata(track.uri, fileName, albumArtCache);
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
  const updates: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    try {
      const updated = await refreshMetadataForTrack(tracks[i], parseMetadata);
      updates.push(updated);
    } catch (e) {
      await logToFile(`Failed to refresh metadata for ${tracks[i].uri}: ${e}`, 'WARN');
    }
    if ((i + 1) % 10 === 0) onProgress(i + 1);
  }
  return updates;
};

export const buildLyricsUpdateBatch = async (
  tracks: Track[],
  onProgress: (current: number) => void
): Promise<Track[]> => {
  const updates: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    try {
      const updated = await refreshLyricsForTrack(tracks[i]);
      if (updated) updates.push(updated);
    } catch (e) {
      await logToFile(`Error rescanning lyrics for ${tracks[i].title}: ${e}`, 'WARN');
    }
    if ((i + 1) % 50 === 0) onProgress(i + 1);
  }
  return updates;
};
