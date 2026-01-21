import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSettings } from '../contexts/SettingsContext';
import { SortOption } from '../utils/sortUtils';
import { BottomSheet } from './BottomSheet';

interface SortModalProps {
  visible: boolean;
  onClose: () => void;
  options: { label: string; value: SortOption }[];
  currentValue: SortOption;
  onSelect: (value: SortOption) => void;
}

export const SortModal: React.FC<SortModalProps> = ({ visible, onClose, options, currentValue, onSelect }) => {
  const { themeColor } = useSettings();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort By" showHandle={true}>
      <View style={styles.optionsContainer}>
        {options.map((option) => (
          <TouchableOpacity 
            key={option.value} 
            style={styles.option} 
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
          >
            <Text style={[
              styles.optionText, 
              currentValue === option.value && { color: themeColor, fontWeight: 'bold' }
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  optionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  option: { 
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  optionText: { 
    color: '#fff',
    fontSize: 16,
  },
  cancelButton: { 
    marginTop: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelText: { 
    color: '#ff4444',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
