import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../contexts/SettingsContext';

interface SortBarProps {
  currentSort: string;
  onPress: () => void;
}

export const SortBar: React.FC<SortBarProps> = ({ currentSort, onPress }) => {
  const { themeColor } = useSettings();
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={[styles.text, { color: themeColor }]}>Sort: {currentSort}</Text>
        <Ionicons name="chevron-down" size={16} color={themeColor} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: 'flex-end',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  }
});
