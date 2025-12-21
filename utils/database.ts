import * as SQLite from 'expo-sqlite';
import { Track } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export const initDatabase = async () => {
  if (db) return db;
  
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
      lrc TEXT
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
  `);

  // Migration: Add lrc column if it doesn't exist (for existing users)
  const tableInfo = await db.getAllAsync<any>("PRAGMA table_info(tracks)");
  const hasLrc = tableInfo.some(column => column.name === 'lrc');
  if (!hasLrc) {
    try {
      await db.execAsync("ALTER TABLE tracks ADD COLUMN lrc TEXT");
    } catch (e) {
      console.log("Migration (lrc column) already applied or failed:", e);
    }
  }
  
  return db;
};

export const insertTracks = async (tracks: Track[]) => {
  const database = await initDatabase();
  
  // Batch insert for performance
  // We use "INSERT OR REPLACE" to handle updates
  await database.withTransactionAsync(async () => {
    for (const track of tracks) {
      await database.runAsync(
        `INSERT OR REPLACE INTO tracks (id, title, artist, album, uri, artwork, duration, lrc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [track.id, track.title, track.artist, track.album || 'Unknown', track.uri, track.artwork || null, 0, track.lrc || null]
      );
    }
  });
};

export const getAllTracks = async (): Promise<Track[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT * FROM tracks ORDER BY title ASC');
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    uri: row.uri,
    artwork: row.artwork,
    lrc: row.lrc || undefined
  }));
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
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    uri: row.uri,
    artwork: row.artwork,
    lrc: row.lrc || undefined
  }));
};

export const clearLibrary = async () => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM tracks');
};

export const deleteTrack = async (id: string) => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM tracks WHERE id = ?', [id]);
};

export const trackExists = async (id: string): Promise<boolean> => {
  const database = await initDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM tracks WHERE id = ?',
    [id]
  );
  return (row?.count ?? 0) > 0;
};

export const getTrackById = async (id: string): Promise<Track | null> => {
  const database = await initDatabase();
  const row = await database.getFirstAsync<any>('SELECT * FROM tracks WHERE id = ?', [id]);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    uri: row.uri,
    artwork: row.artwork,
    lrc: row.lrc || undefined
  };
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
      await database.runAsync(
        'INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, orderIndex) VALUES (?, ?, ?)',
        [playlistId, trackId, nextOrder++]
      );
    }
  });
};

export const removeFromPlaylist = async (playlistId: string, trackIds: string[]) => {
  const database = await initDatabase();
  await database.withTransactionAsync(async () => {
    for (const trackId of trackIds) {
      await database.runAsync(
        'DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?',
        [playlistId, trackId]
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
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    uri: row.uri,
    artwork: row.artwork,
    lrc: row.lrc || undefined
  }));
};

export const deletePlaylist = async (playlistId: string) => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM playlists WHERE id = ?', [playlistId]);
};

export const insertFolder = async (uri: string) => {
  const database = await initDatabase();
  await database.runAsync(
    'INSERT OR IGNORE INTO added_folders (uri, addedAt) VALUES (?, ?)',
    [uri, Date.now()]
  );
};

export const getFolders = async (): Promise<string[]> => {
  const database = await initDatabase();
  const rows = await database.getAllAsync<any>('SELECT uri FROM added_folders');
  return rows.map(row => row.uri);
};
