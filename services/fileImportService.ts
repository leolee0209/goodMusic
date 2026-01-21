import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

const copyAndUpdateProgress = async (
  fromPath: string,
  toPath: string,
  index: number,
  onProgress: (current: number) => void
) => {
  await FileSystem.copyAsync({ from: fromPath, to: toPath });
  if ((index + 1) % 10 === 0) onProgress(index + 1);
};

export const importFilesFromAndroidFolder = async (
  musicDir: string,
  onProgress: (current: number) => void
): Promise<string[]> => {
  const uris: string[] = [];
  const permissions = await (FileSystem as any).StorageAccessFramework.requestDirectoryPermissionsAsync();
  
  if (!permissions.granted) return uris;

  const files = await (FileSystem as any).StorageAccessFramework.readDirectoryAsync(permissions.directoryUri);
  for (let i = 0; i < files.length; i++) {
    const fileName = decodeURIComponent(files[i]).split('/').pop();
    if (fileName) {
      const destUri = musicDir + fileName;
      await copyAndUpdateProgress(files[i], destUri, i, onProgress);
      uris.push(destUri);
    }
  }
  return uris;
};

export const importFilesFromIosFolder = async (
  musicDir: string,
  onProgress: (current: number) => void
): Promise<string[]> => {
  const uris: string[] = [];
  const result = await DocumentPicker.getDocumentAsync({ type: 'public.folder', copyToCacheDirectory: false });
  
  if (result.canceled || !result.assets?.[0]) return uris;

  const baseUri = result.assets[0].uri;
  const files = await FileSystem.readDirectoryAsync(baseUri);
  for (let i = 0; i < files.length; i++) {
    if (!files[i].startsWith('.')) {
      const srcUri = baseUri + (baseUri.endsWith('/') ? '' : '/') + files[i];
      const destUri = musicDir + files[i];
      await copyAndUpdateProgress(srcUri, destUri, i, onProgress);
      uris.push(destUri);
    }
  }
  return uris;
};

export const importFilesFromPicker = async (
  musicDir: string,
  onProgress: (current: number) => void
): Promise<string[]> => {
  const uris: string[] = [];
  const result = await DocumentPicker.getDocumentAsync({
    type: ['audio/*', 'application/octet-stream'],
    multiple: true,
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets) return uris;

  for (let i = 0; i < result.assets.length; i++) {
    const destUri = musicDir + result.assets[i].name;
    await copyAndUpdateProgress(result.assets[i].uri, destUri, i, onProgress);
    uris.push(destUri);
  }
  return uris;
};

export const ensureMusicDir = async (musicDir: string) => {
  const dirInfo = await FileSystem.getInfoAsync(musicDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(musicDir, { intermediates: true });
  }
};
