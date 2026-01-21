import { useState } from 'react';

/**
 * Hook for managing track selection state in list/grid views.
 * Provides selection mode detection, toggle functionality, and bulk operations.
 */
export const useTrackSelection = () => {
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  const toggleSelectTrack = (trackId: string) => {
    setSelectedTracks(prev => 
      prev.includes(trackId) 
        ? prev.filter(id => id !== trackId) 
        : [...prev, trackId]
    );
  };

  const clearSelection = () => {
    setSelectedTracks([]);
  };

  const selectAll = (trackIds: string[]) => {
    setSelectedTracks(trackIds);
  };

  const isSelected = (trackId: string) => {
    return selectedTracks.includes(trackId);
  };

  return {
    selectedTracks,
    setSelectedTracks,
    isSelectionMode: selectedTracks.length > 0,
    toggleSelectTrack,
    clearSelection,
    selectAll,
    isSelected
  };
};
