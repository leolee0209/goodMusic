import React from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 100;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  maxHeightPercent?: number;
  showHandle?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  children,
  title,
  maxHeightPercent = 80,
  showHandle = true,
}) => {
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const context = useSharedValue({ y: 0 });
  const maxHeight = `${maxHeightPercent}%`;

  // Animate in when visible
  React.useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 300 });
    } else {
      translateY.value = SCREEN_HEIGHT;
    }
  }, [visible]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Only allow downward dragging
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (translateY.value > DISMISS_THRESHOLD || event.velocityY > 500) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 200 });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <GestureDetector gesture={gesture}>
              <Animated.View style={[styles.container, animatedStyle, { maxHeight: maxHeight as any }]}>
                {showHandle && (
                  <View style={styles.handleContainer}>
                    <View style={styles.handle} />
                  </View>
                )}
                {title && (
                  <View style={styles.titleContainer}>
                    <Text style={styles.title}>{title}</Text>
                  </View>
                )}
                {children}
              </Animated.View>
            </GestureDetector>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
  },
  titleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
