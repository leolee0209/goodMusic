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
      duration INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_album ON tracks(album);
  `);
  
  return db;
};

export const insertTracks = async (tracks: Track[]) => {
  const database = await initDatabase();
  
  // Batch insert for performance
  // We use "INSERT OR REPLACE" to handle updates
  await database.withTransactionAsync(async () => {
    for (const track of tracks) {
      await database.runAsync(
        `INSERT OR REPLACE INTO tracks (id, title, artist, album, uri, artwork, duration) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [track.id, track.title, track.artist, track.album || 'Unknown', track.uri, track.artwork || null, 0]
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
    lrc: undefined // LRC is loaded lazily
  }));
};

export const clearLibrary = async () => {
  const database = await initDatabase();
  await database.runAsync('DELETE FROM tracks');
};
