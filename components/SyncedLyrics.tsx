import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, LayoutChangeEvent, TouchableOpacity, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const LINE_HEIGHT = 60;

interface SyncedLyricsProps {
  lrc: string;
  positionMillis: number;
  onLinePress?: (time: number) => void;
  onToggle?: () => void;
}

interface LyricLine {
  time: number;
  text: string;
  isSynced: boolean;
}

const parseLrc = (lrc: string): LyricLine[] => {
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  let hasAnySynced = false;

  lines.forEach(line => {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
      const time = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        result.push({ time, text, isSynced: true });
        hasAnySynced = true;
      }
    } else if (line.trim()) {
      // Unsynced line
      result.push({ time: -1, text: line.trim(), isSynced: false });
    }
  });

  if (!hasAnySynced) {
      // If none are synced, we just return them as they are
      return result;
  }

  // If some are synced, sort and filter out non-synced ones for the auto-scroll logic
  return result.filter(l => l.isSynced).sort((a, b) => a.time - b.time);
};

export const SyncedLyrics: React.FC<SyncedLyricsProps> = ({ lrc, positionMillis, onLinePress, onToggle }) => {
  const lyrics = useMemo(() => parseLrc(lrc), [lrc]);
  const isSynced = useMemo(() => lyrics.some(l => l.isSynced), [lyrics]);
  
  const flatListRef = useRef<FlatList>(null);
  const isUserScrolling = useRef(false);
  const scrollY = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [hasScrolledInitial, setHasScrolledInitial] = useState(false);
  
  const verticalPadding = containerHeight > 0 ? (containerHeight - LINE_HEIGHT) / 2 : 0;
  
  const currentIndex = useMemo(() => {
    if (!isSynced) return -1;
    return lyrics.findIndex((line, index) => {
        const nextLine = lyrics[index + 1];
        return positionMillis >= line.time && (!nextLine || positionMillis < nextLine.time);
    });
  }, [lyrics, positionMillis, isSynced]);

  const scrollToCurrentIndex = useCallback(() => {
    if (currentIndex >= 0 && flatListRef.current && containerHeight > 0) {
      flatListRef.current.scrollToIndex({
        index: currentIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [currentIndex, containerHeight]);

  useEffect(() => {
    if (!isSynced) return;

    // 1. Initial Scroll Logic
    if (!hasScrolledInitial && containerHeight > 0 && currentIndex >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentIndex,
          animated: false,
          viewPosition: 0.5,
        });
        setHasScrolledInitial(true);
      }, 50);
      return;
    }

    // 2. Auto-Scroll Logic
    if (isUserScrolling.current || containerHeight === 0) return;

    const itemCenterY = verticalPadding + currentIndex * LINE_HEIGHT + LINE_HEIGHT / 2;
    const currentScrollY = scrollY.current;
    const isVisible = itemCenterY >= currentScrollY && itemCenterY <= (currentScrollY + containerHeight);

    if (isVisible) {
      scrollToCurrentIndex();
    }
  }, [currentIndex, scrollToCurrentIndex, containerHeight, verticalPadding, hasScrolledInitial, isSynced]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && height !== containerHeight) {
      setContainerHeight(height);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  const handleScrollBeginDrag = () => {
    isUserScrolling.current = true;
  };

  const handleScrollEndDrag = (e: any) => {
    if (e.nativeEvent.velocity?.y === 0) {
      isUserScrolling.current = false;
    }
  };

  const handleMomentumScrollBegin = () => {
    isUserScrolling.current = true;
  };

  const handleMomentumScrollEnd = () => {
    isUserScrolling.current = false;
  };

  const renderItem = ({ item, index }: { item: LyricLine; index: number }) => {
    const isActive = isSynced && index === currentIndex;
    return (
      <Pressable 
        style={styles.lineWrapper}
        onPress={onToggle}
      >
        <TouchableOpacity 
          onPress={() => {
              if (item.isSynced && onLinePress) {
                  onLinePress(item.time);
              } else {
                  onToggle?.();
              }
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
        >
          <Text
            style={[ 
              styles.line,
              isActive ? styles.activeLine : styles.inactiveLine,
              !isSynced && styles.unsyncedLine
            ]}
          >
            {item.text}
          </Text>
        </TouchableOpacity>
      </Pressable>
    );
  };

  return (
    <Pressable style={styles.container} onPress={onToggle} onLayout={handleLayout}>
      {containerHeight > 0 && (
        <FlatList
          ref={flatListRef}
          data={lyrics}
          renderItem={renderItem}
          keyExtractor={(_, index) => index.toString()}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View style={{ height: isSynced ? verticalPadding : 40 }} />}
          ListFooterComponent={<View style={{ height: isSynced ? verticalPadding : 40 }} />}
          getItemLayout={isSynced ? (data, index) => ({
            length: LINE_HEIGHT,
            offset: verticalPadding + LINE_HEIGHT * index,
            index,
          }) : undefined}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleMomentumScrollBegin}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          bounces={true}
        />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  lineWrapper: {
    minHeight: LINE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  line: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  unsyncedLine: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  activeLine: {
    color: '#fff',
    fontSize: 24,
    transform: [{ scale: 1.05 }],
  },
  inactiveLine: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
