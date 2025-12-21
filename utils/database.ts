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
