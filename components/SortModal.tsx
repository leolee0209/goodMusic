import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useSettings } from '../contexts/SettingsContext';

interface SortModalProps {
  visible: boolean;
  onClose: () => void;
  options: { label: string; value: string }[];
  currentValue: string;
  onSelect: (value: string) => void;
}

export const SortModal: React.FC<SortModalProps> = ({ visible, onClose, options, currentValue, onSelect }) => {
  const { themeColor } = useSettings();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.content}>
              <Text style={styles.title}>Sort By</Text>
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
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { backgroundColor: '#282828', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { color: '#888', fontSize: 14, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  option: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  optionText: { color: '#fff', fontSize: 16 },
  cancelButton: { marginTop: 10, paddingVertical: 15, alignItems: 'center' },
  cancelText: { color: 'red', fontSize: 16, fontWeight: 'bold' }
});
