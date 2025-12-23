import * as LegacyFileSystem from 'expo-file-system/legacy';
import { Paths } from 'expo-file-system';

const DOC_DIR = Paths.document.uri + (Paths.document.uri.endsWith('/') ? '' : '/');
const LOG_FILE_PATH = DOC_DIR + 'app_logs.txt';
const MAX_LOG_SIZE = 1024 * 1024; // 1MB

export const logToFile = async (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;

  // Keep console output for development debugging
  if (level === 'ERROR') {
      console.error(message);
  } else {
      console.log(message);
  }

  try {
    const fileInfo = await LegacyFileSystem.getInfoAsync(LOG_FILE_PATH);
    if (fileInfo.exists) {
        // Simple size check rotation
        if (fileInfo.size > MAX_LOG_SIZE) {
            await LegacyFileSystem.deleteAsync(LOG_FILE_PATH);
            await LegacyFileSystem.writeAsStringAsync(LOG_FILE_PATH, "[SYSTEM] Log rotated due to size limit.\n" + logEntry);
        } else {
            const currentContent = await LegacyFileSystem.readAsStringAsync(LOG_FILE_PATH);
            await LegacyFileSystem.writeAsStringAsync(LOG_FILE_PATH, currentContent + logEntry);
        }
    } else {
        await LegacyFileSystem.writeAsStringAsync(LOG_FILE_PATH, logEntry);
    }
  } catch (error) {
    console.error("Failed to write to log file:", error);
  }
};

export const getLogContent = async () => {
    try {
        const info = await LegacyFileSystem.getInfoAsync(LOG_FILE_PATH);
        if (!info.exists) return "";
        return await LegacyFileSystem.readAsStringAsync(LOG_FILE_PATH);
    } catch (e) {
        console.error("Failed to read logs:", e);
        return "";
    }
};

export const clearLogs = async () => {
    try {
        await LegacyFileSystem.deleteAsync(LOG_FILE_PATH, { idempotent: true });
    } catch (e) {
        console.error("Failed to clear logs:", e);
    }
};
