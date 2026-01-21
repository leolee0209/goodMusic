import { PlaybackOrigin, Track } from '../types';

/**
 * Builds a standardized PlaybackOrigin object for tracking playback context.
 */
export const buildPlaybackOrigin = (params: {
  type: 'all' | 'favorites' | 'search' | 'artist' | 'album' | 'playlist' | 'recent';
  title: string;
  favoritesOnly?: boolean;
  searchQuery?: string;
}): PlaybackOrigin => {
  return {
    type: params.type,
    title: params.title,
    favoritesOnly: params.favoritesOnly,
    searchQuery: params.searchQuery
  };
};

/**
 * Plays a track from a queue with proper origin tracking.
 */
export const playTracksFrom = async (
  tracks: Track[],
  startIndex: number,
  title: string,
  origin: PlaybackOrigin,
  playTrackFn: (track: Track, queue: Track[], title: string, origin: PlaybackOrigin) => Promise<void>
) => {
  if (tracks.length === 0) return;
  const trackToPlay = tracks[startIndex] || tracks[0];
  await playTrackFn(trackToPlay, tracks, title, origin);
};

/**
 * Toggle play/pause if the item is the current track, otherwise start playback from the given queue.
 */
export const playOrToggle = async (params: {
  item: Track;
  currentTrack: Track | null;
  queue: Track[];
  origin: PlaybackOrigin;
  togglePlayPause: () => Promise<void> | void;
  playTrack: (track: Track, queue: Track[], title: string, origin: PlaybackOrigin) => Promise<void>;
}) => {
  const { item, currentTrack, queue, origin, togglePlayPause, playTrack } = params;
  if (currentTrack?.id === item.id) {
    await togglePlayPause();
    return;
  }
  await playTrack(item, queue, origin.title, origin);
};

/**
 * Play first track from a list with a given origin.
 */
export const playAll = async (params: {
  tracks: Track[];
  origin: PlaybackOrigin;
  playTrack: (track: Track, queue: Track[], title: string, origin: PlaybackOrigin) => Promise<void>;
}) => {
  const { tracks, origin, playTrack } = params;
  if (!tracks.length) return;
  await playTrack(tracks[0], tracks, origin.title, origin);
};

/**
 * Shuffle a list and start playback from a random track.
 */
export const shuffleAndPlay = async (params: {
  tracks: Track[];
  origin: PlaybackOrigin;
  playTrack: (track: Track, queue: Track[], title: string, origin: PlaybackOrigin) => Promise<void>;
}) => {
  const { tracks, origin, playTrack } = params;
  if (!tracks.length) return;
  const randomIndex = Math.floor(Math.random() * tracks.length);
  await playTrack(tracks[randomIndex], tracks, origin.title, origin);
};

/**
 * Shuffles an array in place using Fisher-Yates algorithm.
 */
export const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Gets a random track from an array.
 */
export const getRandomTrack = (tracks: Track[]): Track | null => {
  if (tracks.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * tracks.length);
  return tracks[randomIndex];
};
