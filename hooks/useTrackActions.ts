import { useState } from 'react';
import { Track } from '../types';

/**
 * Hook for managing track action sheet state and operations.
 * Centralizes action sheet visibility and active track management.
 */
export const useTrackActions = () => {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);

  const openActionSheet = (track: Track) => {
    setActiveTrack(track);
    setActionSheetVisible(true);
  };

  const closeActionSheet = () => {
    setActionSheetVisible(false);
    setActiveTrack(null);
  };

  return {
    actionSheetVisible,
    setActionSheetVisible,
    activeTrack,
    setActiveTrack,
    openActionSheet,
    closeActionSheet
  };
};
