import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, FlatList, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMusic } from '../contexts/MusicContext';
import { useSettings, Tab } from '../contexts/SettingsContext';

const THEME_COLORS = [
  '#1DB954', // Spotify Green
  '#FF5733', // Orange
  '#3357FF', // Blue
  '#FF33A8', // Pink
  '#A833FF', // Purple
  '#FFC300', // Yellow
  '#00C853', // Android Green
  '#2962FF', // Deep Blue
];

export default function SettingsScreen() {
  const router = useRouter();
  const { refreshLibrary, importLocalFolder, pickAndImportFiles, isScanning, scanProgress, rescanLyrics, refreshAllMetadata } = useMusic();
  const { defaultTab, setDefaultTab, themeColor, setThemeColor } = useSettings();
  const [showTabPicker, setShowTabPicker] = React.useState(false);

  const handleRefresh = async () => {
    await refreshLibrary();
  };

  const handleRescanLyrics = async () => {
    await rescanLyrics();
  };

  const handleRefreshAllMetadata = async () => {
    Alert.alert(
      "Refresh All Metadata",
      "This will re-scan every file in your library to update tags and artwork. This may take a while.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start", onPress: () => refreshAllMetadata() }
      ]
    );
  };

  const handleImportFolder = async () => {
    await importLocalFolder();
  };

  const handleImportFiles = async () => {
    await pickAndImportFiles();
  };

  const openGithub = () => {
    Linking.openURL('https://github.com/leolee0209/goodMusic');
  };

  const progressPercent = scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={30} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 30 }} /> 
      </View>

      <ScrollView style={styles.scrollContent}>
        {isScanning && (
          <View style={styles.loadingContainer}>
            <View style={styles.loadingHeader}>
              <Text style={styles.loadingTitle}>
                {scanProgress.total === 0 ? "Discovering files..." : "Processing Library..."}
              </Text>
              {scanProgress.total > 0 && (
                <Text style={[styles.loadingCount, { color: themeColor }]}>{scanProgress.current} / {scanProgress.total}</Text>
              )}
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%`, backgroundColor: themeColor }]} />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColor }]}>App Preferences</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowTabPicker(true)}>
            <View style={styles.settingIcon}>
              <Ionicons name="home-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Default Tab</Text>
              <Text style={styles.settingSubtext}>{defaultTab.charAt(0).toUpperCase() + defaultTab.slice(1)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>

          <View style={styles.settingItemColumn}>
            <View style={styles.settingHeaderRow}>
               <View style={styles.settingIcon}>
                <Ionicons name="color-palette-outline" size={22} color={themeColor} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingText}>Theme Color</Text>
              </View>
            </View>
            <View style={styles.colorGrid}>
              {THEME_COLORS.map(color => (
                <TouchableOpacity 
                  key={color} 
                  style={[styles.colorOption, { backgroundColor: color }, themeColor === color && styles.selectedColor]}
                  onPress={() => setThemeColor(color)}
                >
                  {themeColor === color && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColor }]}>Library Management</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleRefresh}>
            <View style={styles.settingIcon}>
              <Ionicons name="refresh-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Refresh Library</Text>
              <Text style={styles.settingSubtext}>Scan for new files</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleRefreshAllMetadata}>
            <View style={styles.settingIcon}>
              <Ionicons name="library-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Refresh All Metadata</Text>
              <Text style={styles.settingSubtext}>Re-read tags for all tracks</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleRescanLyrics}>
            <View style={styles.settingIcon}>
              <Ionicons name="musical-notes-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Rescan Lyrics</Text>
              <Text style={styles.settingSubtext}>Update .lrc files from storage</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleImportFiles}>
            <View style={styles.settingIcon}>
              <Ionicons name="document-text-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Import Files</Text>
              <Text style={styles.settingSubtext}>Pick specific audio files to add</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleImportFolder}>
            <View style={styles.settingIcon}>
              <Ionicons name="folder-open-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Add Folder</Text>
              <Text style={styles.settingSubtext}>Select a directory to sync</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColor }]}>About</Text>
          <TouchableOpacity style={styles.settingItem} onPress={openGithub}>
            <View style={styles.settingIcon}>
              <Ionicons name="logo-github" size={22} color="#fff" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>GoodMusic</Text>
              <Text style={styles.settingSubtext}>View source code on GitHub</Text>
            </View>
            <Ionicons name="open-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showTabPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTabPicker(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Default Tab</Text>
            {(['songs', 'artists', 'albums', 'playlists'] as Tab[]).map(tab => (
              <TouchableOpacity 
                key={tab} 
                style={styles.modalItem}
                onPress={() => { setDefaultTab(tab); setShowTabPicker(false); }}
              >
                <Text style={[styles.modalItemText, defaultTab === tab && { color: themeColor, fontWeight: 'bold' }]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
                {defaultTab === tab && <Ionicons name="checkmark" size={20} color={themeColor} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  loadingContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
  },
  loadingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingCount: {
    color: '#1DB954',
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1DB954',
  },
  section: {
    marginTop: 30,
  },
  sectionTitle: {
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
  settingItemColumn: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  settingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingLeft: 55, 
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColor: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalItemText: {
    color: '#ccc',
    fontSize: 16,
  }
});
