import TrackPlayer, {
    AppKilledPlaybackBehavior,
    Capability,
    RepeatMode as RNTPRepeatMode
} from 'react-native-track-player';
import { RepeatMode, Track } from '../types';
import { logToFile } from '../utils/logger';
import { toAbsoluteUri, toRelativePath } from '../utils/pathUtils';

const CHUNK_SIZE = 50;

export const ensureFileUri = (uri: string) => {
  if (!uri) return uri;
  const absolute = toAbsoluteUri(uri);
  if (absolute.startsWith('/') && !absolute.startsWith('file://')) {
    return `file://${absolute}`;
  }
  return absolute;
};

export const resolveArtworkUri = (uri: string | null | undefined) => {
  if (!uri) return undefined;
  return ensureFileUri(uri);
};

export const toRntpTrack = (track: Track) => ({
  id: toRelativePath(track.id),
  url: ensureFileUri(track.uri),
  title: track.title,
  artist: track.artist,
  album: track.album || 'Unknown Album',
  artwork: resolveArtworkUri(track.artwork),
  duration: track.duration ? track.duration / 1000 : 0,
  original: track
});

export const addTracksInBatches = async (
  tracks: any[],
  onInitialBatch?: () => Promise<void>
) => {
  for (let i = 0; i < tracks.length; i += CHUNK_SIZE) {
    const chunk = tracks.slice(i, i + CHUNK_SIZE);
    await TrackPlayer.add(chunk);
    if (i === 0 && onInitialBatch) await onInitialBatch();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

const updatePlayerOptions = async () => {
  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    progressUpdateEventInterval: 1,
    android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification }
  });
};

let playerInitialized = false;

export const ensurePlayerSetup = async () => {
  if (playerInitialized) {
    return;
  }
  try {
    await TrackPlayer.setupPlayer();
    await updatePlayerOptions();
    playerInitialized = true;
  } catch (e) {
    // If the player is already initialized, proceed to update options
    const msg = String(e);
    if (/initialized/i.test(msg)) {
      await updatePlayerOptions();
      playerInitialized = true;
      return;
    }
    await logToFile(`Setup: failed - ${e}`, 'ERROR');
    throw e;
  }
};

export const applyRepeatModeNative = async (mode: RepeatMode) => {
  if (mode === 'none') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Off);
  if (mode === 'all') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Queue);
  if (mode === 'one') await TrackPlayer.setRepeatMode(RNTPRepeatMode.Track);
};

export const rotateQueue = <T>(queue: T[], startIndex: number) => {
  if (startIndex <= 0) return queue;
  return [...queue.slice(startIndex), ...queue.slice(0, startIndex)];
};

export const resetAndLoadQueue = async (params: {
  tracks: any[];
  repeatMode: RepeatMode;
  onInitialBatch?: () => Promise<void>;
}) => {
  const { tracks, repeatMode, onInitialBatch } = params;
  await ensurePlayerSetup();
  await TrackPlayer.reset();
  await addTracksInBatches(tracks, async () => {
    await applyRepeatModeNative(repeatMode);
    if (onInitialBatch) await onInitialBatch();
    await TrackPlayer.play();
  });
};

export const getPlayerState = () => TrackPlayer.getState();
