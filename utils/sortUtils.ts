import { Track } from '../types';

export type SortOption = 'Alphabetical' | 'Recently Played' | 'Track Count' | 'Track Number';
export type SortOrder = 'ASC' | 'DESC';

// Type guard to ensure sort option is valid for context
export const isSortOption = (value: string): value is SortOption => {
  return ['Alphabetical', 'Recently Played', 'Track Count', 'Track Number'].includes(value);
};

export interface Group {
  id: string;
  name: string;
  tracks: Track[];
  type: string;
}

/**
 * Sort tracks by the given option and order.
 */
export const sortTracks = (
  tracks: Track[],
  option: SortOption,
  order: SortOrder,
  history?: string[]
): Track[] => {
  const sorted = [...tracks];

  if (option === 'Recently Played' && history) {
    sorted.sort((a, b) => {
      const indexA = history.indexOf(a.id);
      const indexB = history.indexOf(b.id);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  } else {
    // Alphabetical
    sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }

  if (order === 'DESC') {
    sorted.reverse();
  }

  return sorted;
};

/**
 * Sort groups (artists/albums) by the given option and order.
 */
export const sortGroups = (
  groups: Group[],
  option: SortOption,
  order: SortOrder
): Group[] => {
  const sorted = [...groups];

  if (option === 'Track Count') {
    sorted.sort((a, b) => b.tracks.length - a.tracks.length);
  } else {
    // Alphabetical
    sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  if (order === 'DESC') {
    sorted.reverse();
  }

  return sorted;
};

/**
 * Sort tracks by track number (for album view).
 */
export const sortByTrackNumber = (tracks: Track[], order: SortOrder = 'ASC'): Track[] => {
  const sorted = [...tracks];
  
  sorted.sort((a, b) => {
    if (a.trackNumber && b.trackNumber) return a.trackNumber - b.trackNumber;
    if (a.trackNumber) return -1;
    if (b.trackNumber) return 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  if (order === 'DESC') {
    sorted.reverse();
  }

  return sorted;
};
export type SortOptionItem = { label: string; value: SortOption };

/**
 * Returns sort option items for a given list context.
 */
export const getSortOptionsFor = (context: 'songs' | 'albums' | 'artists'): SortOptionItem[] => {
  if (context === 'songs') return [
    { label: 'Alphabetical', value: 'Alphabetical' },
    { label: 'Recently Played', value: 'Recently Played' },
  ];
  if (context === 'albums') return [
    { label: 'Alphabetical', value: 'Alphabetical' },
    { label: 'Track Count', value: 'Track Count' },
  ];
  return [{ label: 'Alphabetical', value: 'Alphabetical' }];
};
