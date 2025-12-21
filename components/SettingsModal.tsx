import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMusic } from '../contexts/MusicContext';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ visible, onClose }) => {
  const { refreshLibrary, importLocalFolder, pickAndImportFiles } = useMusic();

  const handleRefresh = async () => {
    await refreshLibrary();
    onClose();
  };

  const handleImportFolder = async () => {
    await importLocalFolder();
    onClose();
  };

  const handleImportFiles = async () => {
    await pickAndImportFiles();
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Ionicons name="chevron-back" size={30} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={{ width: 30 }} /> 
          </View>

          <ScrollView style={styles.scrollContent}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Library Management</Text>
              
              <TouchableOpacity style={styles.settingItem} onPress={handleRefresh}>
                <View style={styles.settingIcon}>
                  <Ionicons name="refresh-outline" size={22} color="#1DB954" />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingText}>Refresh Library</Text>
                  <Text style={styles.settingSubtext}>Scan for new files and metadata</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem} onPress={handleImportFiles}>
                <View style={styles.settingIcon}>
                  <Ionicons name="document-text-outline" size={22} color="#1DB954" />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingText}>Import Files</Text>
                  <Text style={styles.settingSubtext}>Pick specific audio files to add</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingItem} onPress={handleImportFolder}>
                <View style={styles.settingIcon}>
                  <Ionicons name="folder-open-outline" size={22} color="#1DB954" />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingText}>Scan Folder</Text>
                  <Text style={styles.settingSubtext}>Select a directory to sync</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <View style={styles.settingItem}>
                <View style={styles.settingIcon}>
                  <Ionicons name="information-circle-outline" size={22} color="#888" />
                </View>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingText}>GoodMusic v1.0.0</Text>
                  <Text style={styles.settingSubtext}>A modern, fast, and beautiful music player.</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#121212',
  },
  modalContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 5,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 30,
  },
  sectionTitle: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  settingInfo: {
    flex: 1,
  },
  settingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  settingSubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
});
