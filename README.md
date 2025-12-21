# goodMusic

Music player built with Expo and React Native. **goodMusic** is designed for local music collections, featuring synced lyrics and library management.

## Features

### Playback
- **Modal Player:** Full-screen player with context breadcrumbs to return to search results, albums, or artists.
- **Synced Lyrics:** Support for `.lrc` files with highlighting and tap-to-seek.

### Library
- **Categorized Browsing:** Tabs for Songs, Artists, Albums, and Playlists.
- **Playlists:** Create and manage lists with SQLite storage.
- **Favorites:** Filter views to show only hearted tracks.
- **Search:** Results grouped by tracks, artists, and albums.

### Performance & Tools
- **Metadata Engine:** ID3 tag and artwork extraction via `music-metadata`.
- **Local Import:** Folder scanning and file picking.
