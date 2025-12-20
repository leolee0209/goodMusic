import { Track } from '../types';

const SAMPLE_LRC = `
[00:00.00] (Music Intro)
[00:05.00] Welcome to GoodMusic
[00:08.50] This is a demo track
[00:12.00] Testing the synced lyrics feature
[00:16.00] It should be highlighting lines
[00:20.00] As the music plays along
[00:25.00] Pause and play to test sync
[00:30.00] Seek bar implementation coming soon
[00:35.00] (Instrumental Break)
[00:45.00] Still here?
[00:48.00] Thanks for using the app!
`;

export const DUMMY_PLAYLIST: Track[] = [
  {
    id: '1',
    title: 'SoundHelix Song 1',
    artist: 'SoundHelix',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop',
    lrc: SAMPLE_LRC
  },
  {
    id: '2',
    title: 'SoundHelix Song 2',
    artist: 'SoundHelix',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    artwork: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=500&auto=format&fit=crop',
    lrc: `[00:00.00] Second song starting...\n[00:05.00] This is SoundHelix Song 2.\n[00:10.00] Just a simple test line.\n[00:15.00] For the synced lyrics feature.`
  },
  {
    id: '3',
    title: 'SoundHelix Song 3',
    artist: 'SoundHelix',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    artwork: 'https://images.unsplash.com/photo-1459749411177-042180ce673c?w=500&auto=format&fit=crop',
    lrc: `[00:00.00] Song number three.\n[00:05.00] We are shuffling now!\n[00:10.00] Testing repeat modes.`
  },
  {
    id: '4',
    title: 'SoundHelix Song 8',
    artist: 'SoundHelix',
    uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    artwork: 'https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=500&auto=format&fit=crop',
    lrc: `[00:00.00] Song number eight.\n[00:05.00] Almost at the end of the list.\n[00:10.00] Enjoy the music.`
  }
];
