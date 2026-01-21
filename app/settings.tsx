import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet } from '../components/BottomSheet';
import { useMusic } from '../contexts/MusicContext';
import { Tab, useSettings } from '../contexts/SettingsContext';

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
    const { refreshLibrary, importLocalFolder, pickAndImportFiles, isScanning, scanMessage, scanProgress, rescanLyrics, refreshAllMetadata } = useMusic();
    const { defaultTab, setDefaultTab, themeColor, setThemeColor } = useSettings();

    const [showTabPicker, setShowTabPicker] = React.useState(false);

    const handleRefresh = async () => {
      await refreshLibrary();
    };

    const handleImportFolder = async () => {
      await importLocalFolder();
    };

    const handleImportFiles = async () => {
      await pickAndImportFiles();
    };

    const handleRefreshAllMetadata = () => {
      Alert.alert(
        "Reload All Metadata",
        "This will re-read tags and artwork for every track in your library. This may take a while if you have many songs. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => refreshAllMetadata() }
        ]
      );
    };

    const handleRescanLyrics = async () => {
      await rescanLyrics();
    };

    const openGithub = () => {
      Linking.openURL('https://github.com/leovigna/goodMusic');
    };

    const progressPercent = scanProgress.total > 0 
      ? (scanProgress.current / scanProgress.total) * 100 
      : 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {isScanning && (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingHeader}>
                <Text style={styles.loadingTitle}>
                  {scanMessage || (scanProgress.total === 0 ? "Discovering files..." : "Processing Library...")}
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
          <Text style={[styles.sectionTitle, { color: themeColor }]}>Import Music</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleRefresh}>
            <View style={styles.settingIcon}>
              <Ionicons name="sync-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Sync Library</Text>
              <Text style={styles.settingSubtext}>Scan folders for new music</Text>
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

          <TouchableOpacity style={styles.settingItem} onPress={handleImportFiles}>
            <View style={styles.settingIcon}>
              <Ionicons name="document-text-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Import Files</Text>
              <Text style={styles.settingSubtext}>Pick specific audio files to add</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColor }]}>Maintenance Utilities</Text>

          <TouchableOpacity style={styles.settingItem} onPress={handleRefreshAllMetadata}>
            <View style={styles.settingIcon}>
              <Ionicons name="library-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Reload All Metadata</Text>
              <Text style={styles.settingSubtext}>Re-read tags and artwork for all tracks</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleRescanLyrics}>
            <View style={styles.settingIcon}>
              <Ionicons name="musical-notes-outline" size={22} color={themeColor} />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Reload Lyrics</Text>
              <Text style={styles.settingSubtext}>Force update .lrc files from storage</Text>
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

      <BottomSheet 
        visible={showTabPicker} 
        onClose={() => setShowTabPicker(false)} 
        title="Select Default Tab" 
        showHandle={true}
        maxHeightPercent={60}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
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
        </ScrollView>
      </BottomSheet>
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
    paddingHorizontal: 20,
    paddingBottom: 100,
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
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#282828',
  },
  modalItemText: {
    color: '#fff',
    fontSize: 16,
  }
});
