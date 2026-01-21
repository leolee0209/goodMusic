import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Dimensions, Image, Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QueueModal } from '../components/QueueModal';
import { SyncedLyrics } from '../components/SyncedLyrics';
import { Toast } from '../components/Toast';
import { TrackActionSheet } from '../components/TrackActionSheet';
import { useMusic } from '../contexts/MusicContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTrackActions } from '../hooks/useTrackActions';

const { width } = Dimensions.get('window');

const formatTime = (millis: number) => {
  if (isNaN(millis) || millis < 0) return '0:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function PlayerScreen() {
  const router = useRouter();
  const { themeColor } = useSettings();
  const { 
    currentTrack, 
    isPlaying, 
    togglePlayPause, 
    playNext, 
    playPrev, 
    positionMillis, 
    durationMillis,
    seekTo,
    isShuffle,
    toggleShuffle,
    repeatMode,
    toggleRepeatMode,
    favorites,
    toggleFavorite,
    playlist,
    playTrack,
    showLyrics,
    toggleLyricsView,
    queueTitle,
    playbackOrigin,
    playlists,
    addToPlaylist
  } = useMusic();

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  
  // Custom Hooks
  const { actionSheetVisible, activeTrack, openActionSheet, closeActionSheet } = useTrackActions();

  // Toast State
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000); 
  };

  if (!currentTrack) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.text}>No track playing</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.closeButton, { color: themeColor }]}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const handleActionSheetAddToPlaylist = async (playlistId: string) => {
    if (activeTrack) {
      await addToPlaylist(playlistId, [activeTrack.id]);
      closeActionSheet();
      showToast("Added to playlist");
    }
  };

  const handleOriginPress = () => {
    if (!playbackOrigin) {
      router.back();
      return;
    }

    router.dismissAll();

    if (playbackOrigin.type === 'all' || playbackOrigin.type === 'favorites' || playbackOrigin.type === 'search') {
      router.replace({
        pathname: '/',
        params: {
          q: playbackOrigin.searchQuery,
          f: playbackOrigin.favoritesOnly ? 'true' : 'false'
        }
      });
    } else {
      router.push({
        pathname: '/group',
        params: { 
          title: playbackOrigin.title, 
          type: playbackOrigin.type,
          f: playbackOrigin.favoritesOnly ? 'true' : 'false'
        }
      });
    }
  };

  const goToArtist = () => {
    router.dismissAll();
    router.push({
      pathname: '/group',
      params: { title: currentTrack.artist, type: 'artist' }
    });
  };

  const goToAlbum = () => {
    if (currentTrack.album) {
      router.dismissAll();
      router.push({
        pathname: '/group',
        params: { title: currentTrack.album, type: 'album' }
      });
    }
  };

  const handleSlidingStart = () => {
    setIsSeeking(true);
  };

  const handleSlidingComplete = async (value: number) => {
    await seekTo(value);
    setIsSeeking(false);
  };

  const handleTogglePlayPause = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await togglePlayPause();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playNext();
  };

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playPrev();
  };

  const handleToggleShuffle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleShuffle();
    showToast(isShuffle ? "Shuffle Off" : "Shuffle On");
  };

  const handleToggleRepeat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleRepeatMode();
    // Logic for next mode
    const modes = ['none', 'all', 'one'];
    const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    
    let message = "Repeat Off";
    if (nextMode === 'all') message = "Repeat All";
    if (nextMode === 'one') message = "Repeat One";
    
    showToast(message);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this song: ${currentTrack.title} by ${currentTrack.artist}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const isFavorite = favorites.includes(currentTrack.id);

  const displayPosition = isSeeking ? seekValue : positionMillis;

  const getRepeatIcon = (): keyof typeof Ionicons.glyphMap => 'repeat';

  const getRepeatColor = () => {
    return repeatMode !== 'none' ? themeColor : '#fff';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header / Close */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <Ionicons name="chevron-down" size={30} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerTextContainer} onPress={handleOriginPress}>
          <Text style={styles.headerSubtitle}>PLAYING FROM</Text>
          <Text style={styles.headerQueueTitle} numberOfLines={1} ellipsizeMode="middle">
            {playbackOrigin?.title.toUpperCase() || 'ALL SONGS'}
            {playbackOrigin?.favoritesOnly && ' • FAVORITES'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleLyricsView} style={styles.headerIcon}>
          <Ionicons name="musical-notes" size={24} color={showLyrics ? themeColor : "#fff"} />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {showLyrics ? (
          currentTrack.lrc ? (
            <SyncedLyrics 
              lrc={currentTrack.lrc} 
              positionMillis={positionMillis} 
              onLinePress={(time) => seekTo(time)}
              onToggle={toggleLyricsView}
            />
          ) : (
            <Pressable 
              style={styles.noLyricsContainer} 
              onPress={toggleLyricsView}
            >
              <Ionicons name="musical-notes-outline" size={80} color="rgba(255,255,255,0.2)" />
              <Text style={styles.noLyricsText}>No lyrics found</Text>
              <Text style={styles.noLyricsSubtext}>Tap to show artwork</Text>
            </Pressable>
          )
        ) : (
          <Pressable 
            style={styles.contentTouchable} 
            onPress={toggleLyricsView}
          >
            <View style={styles.artworkContainer}>
              <Image source={{ uri: currentTrack.artwork }} style={styles.artwork} />
            </View>
          </Pressable>
        )}
      </View>

      {/* Controls Container */}
      <View style={styles.controlsContainer}>
        <View style={styles.trackInfoRow}>
          <View style={styles.trackInfo}>
            <TouchableOpacity onPress={goToAlbum}>
              <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="middle">{currentTrack.title}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goToArtist}>
              <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="middle">{currentTrack.artist}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.trackActions}>
            <TouchableOpacity onPress={() => openActionSheet(currentTrack)} style={styles.actionIcon}>
              <Ionicons name="add-outline" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toggleFavorite(currentTrack.id);
            }}>
              <Ionicons 
                name={isFavorite ? "heart" : "heart-outline"} 
                size={28} 
                color={isFavorite ? themeColor : "#fff"} 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.sliderContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={durationMillis || 1}
            value={displayPosition}
            minimumTrackTintColor={themeColor}
            maximumTrackTintColor="#333"
            thumbTintColor="#fff"
            onSlidingStart={handleSlidingStart}
            onValueChange={setSeekValue}
            onSlidingComplete={handleSlidingComplete}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
            <Text style={styles.timeText}>{formatTime(durationMillis)}</Text>
          </View>
        </View>

        {/* Main Controls */}
        <View style={styles.mainControls}>
          <TouchableOpacity onPress={handleToggleShuffle}>
            <Ionicons name="shuffle" size={24} color={isShuffle ? themeColor : "#fff"} />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handlePrev}>
            <Ionicons name="play-skip-back" size={35} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleTogglePlayPause} style={styles.playButton}>
            <Ionicons name={isPlaying ? "pause" : "play"} size={40} color="#000" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleNext}>
            <Ionicons name="play-skip-forward" size={35} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleToggleRepeat}>
            <View>
              <Ionicons name={getRepeatIcon()} size={24} color={getRepeatColor()} />
              {repeatMode === 'one' && (
                <View style={[styles.repeatOneBadge, { backgroundColor: themeColor }]}>
                  <Text style={styles.repeatOneText}>1</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#aaa" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowQueue(true)}>
            <Ionicons name="list" size={20} color="#aaa" />
          </TouchableOpacity>
        </View>
      </View>

      <QueueModal
        visible={showQueue}
        onClose={() => setShowQueue(false)}
        playlist={playlist}
        currentTrack={currentTrack}
        onTrackSelect={(track) => playTrack(track)}
      />
      
      <Toast visible={toastVisible} message={toastMessage} />

      <TrackActionSheet
        visible={actionSheetVisible}
        onClose={closeActionSheet}
        track={activeTrack}
        playlists={playlists}
        onAddToPlaylist={handleActionSheetAddToPlaylist}
        onGoToArtist={() => activeTrack && goToArtist()}
        onGoToAlbum={() => activeTrack && activeTrack.album && goToAlbum()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 60,
  },
  headerIcon: {
    width: 40,
    alignItems: 'center',
  },
  headerTextContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: 'bold',
  },
  headerQueueTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  contentTouchable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noLyricsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  noLyricsText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  noLyricsSubtext: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  artworkContainer: {
    width: width - 60,
    height: width - 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  artwork: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  controlsContainer: {
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  trackInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  trackInfo: {
    flex: 1,
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    padding: 5,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  trackArtist: {
    color: '#aaa',
    fontSize: 18,
    marginTop: 4,
  },
  sliderContainer: {
    marginBottom: 20,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -10,
  },
  timeText: {
    color: '#aaa',
    fontSize: 12,
  },
  mainControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  playButton: {
    width: 75,
    height: 75,
    backgroundColor: '#fff',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repeatOneBadge: {
    position: 'absolute',
    top: -2,
    right: -5,
    backgroundColor: '#1DB954',
    borderRadius: 6,
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repeatOneText: {
    color: '#000',
    fontSize: 8,
    fontWeight: 'bold',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  text: {
    color: '#fff',
  },
  closeButton: {
    color: '#1DB954',
    fontSize: 18,
    marginTop: 20,
  }
});