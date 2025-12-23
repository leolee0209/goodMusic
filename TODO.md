always run npx tsc after implementing.

features:
linux desktop version.
stat for total songs, total listening time, total listening track count, favorate artist, album, song, etc.

---

# System Architecture & Logic Flow

## 1. Core Concepts
- **Single Source of Truth**: The SQLite database (`music_library.db`) is the authority for all track metadata.
- **State Hydration**: The app reads from SQLite on startup to populate the React Context (`MusicContext`).
- **Relative Path Storage**: To survive app updates and OS sandbox path changes (especially on iOS), all file paths in the database are stored as **Relative Paths** (e.g., `doc://music/song.mp3`). They are converted to **Absolute Paths** (e.g., `file:///var/mobile/...`) only at runtime.

## 2. Data Flow Workflows

### A. Ingestion (Adding Music)
1.  **Import**: User selects files via `DocumentPicker` or scans a folder.
2.  **File Copy**: Files are copied to the app's internal storage (`FileSystem.documentDirectory + 'music/'`).
3.  **Scanning (`utils/fileScanner.ts`)**:
    *   **Size Check**: The file size is fetched (`FileSystem.getInfoAsync`) to ensure accurate duration parsing.
    *   **Metadata**: `music-metadata-browser` parses ID3/MP4 tags.
    *   **Artwork**: Embedded art is extracted and cached to `FileSystem.cacheDirectory`.
4.  **Database Insert (`utils/database.ts`)**:
    *   The absolute path is converted to a relative URI (`toRelativePath`).
    *   The track is inserted into the `tracks` table with the relative path as its unique `id`.

### B. Startup & Hydration
1.  **Initialization**: `MusicContext` mounts.
2.  **DB Load**: `database.getAllTracks()` is called.
3.  **Path Resolution**:
    *   The system iterates over raw DB rows.
    *   `toAbsoluteUri()` converts `doc://` and `cache://` prefixes back to valid system paths (`file://...`).
4.  **State Update**: The processed list is saved to the `library` state variable.

### C. Playback Logic
1.  **Trigger**: User selects a track.
2.  **Validation (`contexts/MusicContext.tsx`)**:
    *   `playTrack` calls `toRntpTrack`.
    *   **Safety Check**: `ensureFileUri` verifies the URI starts with `file://`.
    *   **Critical Check**: Logic ensures no `doc://` (relative) paths are passed to the native player.
3.  **Native Handoff**: The track object is passed to `react-native-track-player`.
4.  **Monitoring**: Event listeners log `PlaybackState` and `PlaybackError` to `log.txt` for debugging.

### D. Synchronization (`utils/librarySync.ts`)
1.  **Trigger**: `refreshLibrary` is called.
2.  **Discovery**: The `music/` folder is scanned for all current files.
3.  **Reconciliation**:
    *   **New Files**: Parsed and added to DB.
    *   **Missing Files**: If a file in the DB is no longer on disk, it is deleted from the DB.
4.  **Deduplication**: `database.removeDuplicates()` runs to clean up metadata-identical entries.

## 3. Database Schema
*   **`tracks`**: Stores metadata. `id` and `uri` are relative paths. `duration` is in milliseconds.
*   **`playlists`**: User-created collections.
*   **`playlist_tracks`**: Link table with `orderIndex`.
*   **`playback_history`**: Recent plays.

## 4. Debugging
*   Logs are written to a file accessible via the app (if UI implemented) or file inspection.
*   **Key Log Patterns**:
    *   `CRITICAL: Relative path passed to player!`: Indicates a failure in the Relative->Absolute conversion logic.
    *   `Native Player Error`: Indicates a codec or file accessibility issue at the OS level.

---

# Track Playing System

## 1. Selection & Queue Management (`playTrack` in `MusicContext`)
*   **Input**: Receives a `track` object and an optional `newQueue` (list of tracks).
*   **Queue Construction**:
    *   If `newQueue` is provided, it replaces the internal `originalPlaylist`.
    *   **Shuffle Logic**:
        *   If `isShuffle` is ON: The selected track is placed **first**, and the rest of the queue is randomized (`shuffleArray`).
        *   If `isShuffle` is OFF: The queue remains as-is (e.g., Album order). The player just needs to know *which index* to start at.
*   **Native Synchronization**:
    *   `TrackPlayer.reset()` clears the previous native queue.
    *   `TrackPlayer.add()` sends the new list of tracks (converted to native format via `toRntpTrack`) to the audio engine.
    *   `TrackPlayer.skip(index)` jumps to the selected track immediately.
    *   `TrackPlayer.play()` starts audio.

## 2. Playback Lifecycle
*   **Start**: Initiated by `TrackPlayer.play()`. The native OS service takes over (foreground service on Android, AudioSession on iOS).
*   **Progress**: `useProgress` hook polls the native player every 1 second (configurable) to update the UI slider/timer.
*   **Termination (End of Track)**:
    *   **Automatic**: When a track finishes, `react-native-track-player` automatically proceeds to the next track in its internal queue.
    *   **Repeat Logic**: The native player handles repeat modes (`Track`, `Queue`, `Off`) directly via `TrackPlayer.setRepeatMode`. The JS side just configures this preference.
*   **Fallbacks**:
    *   If a track fails to load (e.g., file deleted), `Event.PlaybackError` is fired. Currently, the app logs this but *does not* automatically skip to the next track (this is a potential improvement area).
    *   If the app is killed, `AppKilledPlaybackBehavior` is set to stop playback and remove the notification.

## 3. Switching Songs
*   **Next/Prev**:
    *   `playNext`: Calls `TrackPlayer.skipToNext()`.
    *   `playPrev`: If >3 seconds into song, `seekTo(0)` (restart). Otherwise, `skipToPrevious()`.
*   **Manual Selection**: Calling `playTrack` again completely rebuilds the native queue and resets the player state.