import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Track } from '../types';
import * as mm from 'music-metadata-browser';
import { Buffer } from 'buffer';
import { getTrackById } from './database';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'];

// Helper to extract metadata using music-metadata

const parseMetadata = async (uri: string, fileName: string, albumArtCache: Map<string, string>) => {

  try {

    // Optimization: Read first 3MB to catch larger artwork

    const fileContent = await FileSystem.readAsStringAsync(uri, {

      encoding: FileSystem.EncodingType.Base64,

      length: 3 * 1024 * 1024, // 3MB

      position: 0

    });

    

    const buffer = Buffer.from(fileContent, 'base64');

    

    // Determine MIME based on extension

    const ext = fileName.split('.').pop()?.toLowerCase();

    let mimeType = 'audio/mpeg'; // default

    if (ext === 'm4a' || ext === 'mp4') mimeType = 'audio/mp4';

    if (ext === 'wav') mimeType = 'audio/wav';

    if (ext === 'flac') mimeType = 'audio/flac';

    if (ext === 'ogg') mimeType = 'audio/ogg';



    // Parse with cover extraction enabled

    const metadata = await mm.parseBuffer(buffer, mimeType, { 

      duration: false, 

      skipCovers: false, // Enable covers

      skipPostHeaders: true 

    });

    

    const artist = metadata.common.artist || 'Unknown Artist';

    const album = metadata.common.album || 'Unknown Album';

    const title = metadata.common.title || fileName.replace(/\.[^/.]+$/, "");

    

    let artworkUri: string | undefined = undefined;



    // Artwork Logic

    if (album !== 'Unknown Album' && albumArtCache.has(album)) {

      // Use cached URI for this album

      artworkUri = albumArtCache.get(album);

    } else if (metadata.common.picture && metadata.common.picture.length > 0) {

      const pic = metadata.common.picture[0];

      if (pic.data) {

        try {

          // Create cache directory if needed

          const cacheDir = FileSystem.cacheDirectory + 'artworks/';

          const dirInfo = await FileSystem.getInfoAsync(cacheDir);

          if (!dirInfo.exists) {

            await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

          }



          // Generate unique filename (sanitize album name + timestamp/random)

          const safeName = (album + '_' + artist).replace(/[^a-z0-9]/gi, '_').substring(0, 50);

          const artFileName = `art_${safeName}.jpg`; // Assume jpg/png usually

          const artUri = cacheDir + artFileName;



          // Write buffer to file

          // music-metadata returns Buffer. convert to Base64 to write.

          const base64Art = pic.data.toString('base64');

          await FileSystem.writeAsStringAsync(artUri, base64Art, {

            encoding: FileSystem.EncodingType.Base64

          });



          artworkUri = artUri;

          

          // Cache it if album is valid

          if (album !== 'Unknown Album') {

            albumArtCache.set(album, artUri);

          }

        } catch (err) {

          console.warn("Failed to save artwork:", err);

        }

      }

    }

    

    console.log(`Parsed ${fileName}:`, { artist, album, hasArtwork: !!artworkUri });

    

    return {

      title,

      artist,

      album,

      artwork: artworkUri

    };

  } catch (e) {

    console.warn("Metadata parse failed for", fileName, e);

    return {

      title: fileName.replace(/\.[^/.]+$/, ""),

      artist: 'Unknown Artist',

      album: 'Unknown Album'

    };

  }

};



export const scanFolder = async (folderUri: string, onTrackProcessed?: (track: Track) => void): Promise<Track[]> => {



  const tracks: Track[] = [];



  const processedUris = new Set<string>();



  const albumArtCache = new Map<string, string>();







  const scanRecursive = async (uri: string) => {



    try {



      const info = await FileSystem.getInfoAsync(uri);



      if (!info.exists || !info.isDirectory) return;







      const files = await FileSystem.readDirectoryAsync(uri);



      const lrcMap = new Map<string, string>();



      const audioFiles: string[] = [];



      const subFolders: string[] = [];







      for (const file of files) {



        const fullUri = uri + (uri.endsWith('/') ? '' : '/') + file;



        const lowerName = file.toLowerCase();



        



        try {



          const fileInfo = await FileSystem.getInfoAsync(fullUri);



          if (fileInfo.isDirectory) {



            subFolders.push(fullUri);



          } else {



            if (lowerName.endsWith('.lrc')) {



              lrcMap.set(lowerName, fullUri);



            } else if (AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {



              audioFiles.push(file);



            }



          }



        } catch (e) {



          console.warn("Error getting file info:", fullUri, e);



        }



      }







      for (const fileName of audioFiles) {



        const fullUri = uri + (uri.endsWith('/') ? '' : '/') + fileName;



        if (processedUris.has(fullUri)) continue;



        processedUris.add(fullUri);







        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));



        const potentialLrcKey = (nameWithoutExt + '.lrc').toLowerCase();



        



        let lrcContent = undefined;



        const matchingLrcUri = lrcMap.get(potentialLrcKey);



        if (matchingLrcUri) {



          try {



            lrcContent = await FileSystem.readAsStringAsync(matchingLrcUri);



          } catch (e) {



            console.log("Failed to read LRC:", matchingLrcUri);



          }



        }







        const existingTrack = await getTrackById(fullUri);



        let track: Track;







        if (existingTrack) {



          if (!existingTrack.lrc && lrcContent) {



            existingTrack.lrc = lrcContent;



          }



          track = existingTrack;



        } else {



          const metadata = await parseMetadata(fullUri, fileName, albumArtCache);



          track = {



            id: fullUri,



            title: metadata.title,



            artist: metadata.artist,



            album: metadata.album,



            uri: fullUri,



            artwork: metadata.artwork,



            lrc: lrcContent



          };



        }







        tracks.push(track);



        if (onTrackProcessed) onTrackProcessed(track);



      }







      for (const subFolder of subFolders) {



        await scanRecursive(subFolder);



      }



    } catch (error) {



      console.error("Error scanning recursive:", uri, error);



    }



  };







  await scanRecursive(folderUri);



  return tracks;



};







// Remove the old scanFileSystemRecursively as it's now merged into scanRecursive inside scanFolder
