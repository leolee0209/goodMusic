import * as SQLite from 'expo-sqlite';
import { Track } from '../types';
import { logToFile } from './logger';
import { normalizeForSearch } from './stringUtils';
import { toRelativePath, toAbsoluteUri } from './pathUtils';

let db: SQLite.SQLiteDatabase | null = null;

export const initDatabase = async () => {
  if (db) return db;
  
  await logToFile('Initializing database...');
  db = await SQLite.openDatabaseAsync('music_library.db');
  
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      uri TEXT NOT NULL,
      artwork TEXT,
      duration INTEGER,
      lrc TEXT,
      trackNumber INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_album ON tracks(album);

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlistId TEXT NOT NULL,
      trackId TEXT NOT NULL,
      orderIndex INTEGER NOT NULL,
      PRIMARY KEY (playlistId, trackId),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS added_folders (
      uri TEXT PRIMARY KEY NOT NULL,
      addedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playback_history (
      trackId TEXT PRIMARY KEY NOT NULL,
      playedAt INTEGER NOT NULL
    );
  `);

  // Migration: Add lrc column if it doesn't exist (for existing users)
  const tableInfo = await db.getAllAsync<any>("PRAGMA table_info(tracks)");
  const hasLrc = tableInfo.some(column => column.name === 'lrc');
  if (!hasLrc) {
    try {
      await logToFile('Adding lrc column to tracks table...');
      await db.execAsync("ALTER TABLE tracks ADD COLUMN lrc TEXT");
    } catch (e) {
      await logToFile(`Migration (lrc column) already applied or failed: ${e}`, 'WARN');
    }
  }

  const hasTrackNumber = tableInfo.some(column => column.name === 'trackNumber');
  if (!hasTrackNumber) {
    try {
      await logToFile('Adding trackNumber column to tracks table...');
      await db.execAsync("ALTER TABLE tracks ADD COLUMN trackNumber INTEGER");
    } catch (e) {
      await logToFile(`Migration (trackNumber column) already applied or failed: ${e}`, 'WARN');
    }
  }
  
  await logToFile('Database initialized.');
  return db;
};

export const insertTracks = async (tracks: Track[]) => {
  const database = await initDatabase();
  await logToFile(`Inserting/Updating ${tracks.length} tracks in database...`);
  
  await database.withTransactionAsync(async () => {
    for (const track of tracks) {
      // Store relative paths for persistence across app updates
      // We also ensure ID is stable by making it relative if it was a URI
      const stableId = toRelativePath(track.id);
      const relativeUri = toRelativePath(track.uri);
      const relativeArtwork = toRelativePath(track.artwork);
      
      await database.runAsync(
        `INSERT OR REPLACE INTO tracks (id, title, artist, album, uri, artwork, duration, lrc, trackNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [stableId, track.title, track.artist, track.album || 'Unknown', relativeUri, relativeArtwork || null, track.duration || 0, track.lrc || null, track.trackNumber || null]
      );
    }
  });
  await logToFile('Track insertion completed.');
};

const mapRowToTrack = (row: any): Track => ({
  // Restore absolute URIs for the current app session
  id: toAbsoluteUri(row.id),
  title: row.title,
  artist: row.artist,
  album: row.album,
  uri: toAbsoluteUri(row.uri),
  artwork: toAbsoluteUri(row.artwork),
  lrc: row.lrc || undefined,
  trackNumber: row.trackNumber || undefined,
  duration: row.duration || 0
});

export const getAllTracks = async (): Promise<Track[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM tracks ORDER BY title ASC');
  return rows.map(mapRowToTrack);
};

export const searchTracks = async (query: string): Promise<Track[]> => {
  const database = await initDatabase();
  const sanitizedQuery = `%${query}%`;
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM tracks 
     WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? 
     ORDER BY title ASC`,
    [sanitizedQuery, sanitizedQuery, sanitizedQuery]
  );
  return rows.map(mapRowToTrack);
};

export const clearLibrary = async () => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM tracks');
};

export const deleteTrack = async (id: string) => {
  const database = await initDatabase();
  const stableId = toRelativePath(id);
  await database.runAsync('DELETE FROM tracks WHERE id = ?', [stableId]);
};

export const trackExists = async (id: string): Promise<boolean> => {
  const database = await initDatabase();
  const stableId = toRelativePath(id);
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM tracks WHERE id = ?',
    [stableId]
  );
  return (row?.count ?? 0) > 0;
};

export const getAllTrackUris = async (): Promise<Set<string>> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT uri FROM tracks');
  return new Set(rows.map(row => toAbsoluteUri(row.uri)));
};

export const getTrackById = async (id: string): Promise<Track | null> => {
  const database = await initDatabase();
  const stableId = toRelativePath(id);
  const row = await database.getFirstAsync<any>('SELECT * FROM tracks WHERE id = ?', [stableId]);
  if (!row) return null;
  return mapRowToTrack(row);
};

export const getAllPlaylists = async () => {
  const database = await initDatabase();
  return await database.getAllAsync<any>('SELECT * FROM playlists ORDER BY createdAt DESC');
};

export const createPlaylist = async (title: string) => {
  const database = await initDatabase();
  const id = Date.now().toString();
  await database.runAsync(
    'INSERT INTO playlists (id, title, createdAt) VALUES (?, ?, ?)',
    [id, title, Date.now()]
  );
  return id;
};

export const addTracksToPlaylist = async (playlistId: string, trackIds: string[]) => {
  const database = await initDatabase();
  await database.withTransactionAsync(async () => {
    const lastOrderRow = await database.getFirstAsync<any>(
      'SELECT MAX(orderIndex) as maxOrder FROM playlist_tracks WHERE playlistId = ?',
      [playlistId]
    );
    let nextOrder = (lastOrderRow?.maxOrder ?? -1) + 1;

    for (const trackId of trackIds) {
      const stableId = toRelativePath(trackId);
      await database.runAsync(
        'INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, orderIndex) VALUES (?, ?, ?)',
        [playlistId, stableId, nextOrder++]
      );
    }
  });
};

export const removeFromPlaylist = async (playlistId: string, trackIds: string[]) => {
  const database = await initDatabase();
  await database.withTransactionAsync(async () => {
    for (const trackId of trackIds) {
      const stableId = toRelativePath(trackId);
      await database.runAsync(
        'DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?',
        [playlistId, stableId]
      );
    }
  });
};

export const getPlaylistTracks = async (playlistId: string): Promise<Track[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>(
    `SELECT t.* FROM tracks t
     JOIN playlist_tracks pt ON t.id = pt.trackId
     WHERE pt.playlistId = ?
     ORDER BY pt.orderIndex ASC`,
    [playlistId]
  );
  return rows.map(mapRowToTrack);
};

export const deletePlaylist = async (playlistId: string) => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM playlists WHERE id = ?', [playlistId]);
};

export const insertFolder = async (uri: string) => {
  const database = await initDatabase();
  const relativeUri = toRelativePath(uri);
  await database.runAsync(
    'INSERT OR IGNORE INTO added_folders (uri, addedAt) VALUES (?, ?)',
    [relativeUri, Date.now()]
  );
};

export const getFolders = async (): Promise<string[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT uri FROM added_folders');
  return rows.map(row => toAbsoluteUri(row.uri));
};

export const addToHistory = async (trackId: string) => {
  const database = await initDatabase();
  const now = Date.now();
  const stableId = toRelativePath(trackId);
  await database.runAsync(
    'INSERT OR REPLACE INTO playback_history (trackId, playedAt) VALUES (?, ?)',
    [stableId, now]
  );
  
  const rows = await database.getAllAsync<any>(
    'SELECT playedAt FROM playback_history ORDER BY playedAt DESC LIMIT 1 OFFSET 199'
  );
  
  if (rows.length > 0) {
    const cutoff = rows[0].playedAt;
    await database.runAsync('DELETE FROM playback_history WHERE playedAt < ?', [cutoff]);
  }
};

export const getPlaybackHistory = async (): Promise<string[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT trackId FROM playback_history ORDER BY playedAt DESC');
  return rows.map(row => toAbsoluteUri(row.trackId));
};

export const removeDuplicates = async () => {
  const database = await initDatabase();
  await logToFile('Maintenance: Checking for duplicates...');
  
  // Find duplicates based on Title + Artist + Album + Duration
  const duplicates = await database.getAllAsync<any>(`
    SELECT id, title, artist, album, duration, COUNT(*) as count
    FROM tracks
    GROUP BY title, artist, album, duration
    HAVING count > 1
  `);

  if (duplicates.length === 0) {
      await logToFile('Maintenance: No duplicates found.');
      return;
  }

  await logToFile(`Maintenance: Found ${duplicates.length} sets of duplicates. Cleaning up...`);
  
  await database.withTransactionAsync(async () => {
    for (const dup of duplicates) {
      // Get all IDs for this duplicate set
      const tracks = await database.getAllAsync<any>(
        `SELECT id FROM tracks WHERE title = ? AND artist = ? AND album = ? AND duration = ?`,
        [dup.title, dup.artist, dup.album, dup.duration]
      );
      
      // Keep the first one, delete the rest
      // We sort by ID length or lexicographically to be deterministic
      tracks.sort((a, b) => a.id.localeCompare(b.id));
      
      const toDelete = tracks.slice(1);
      for (const t of toDelete) {
        await database.runAsync('DELETE FROM tracks WHERE id = ?', [t.id]);
        await logToFile(`Maintenance: Deleted duplicate track ID: ${t.id}`);
      }
    }
  });
};