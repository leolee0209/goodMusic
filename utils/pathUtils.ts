import { Paths } from 'expo-file-system';

const DOC_DIR = Paths.document.uri + (Paths.document.uri.endsWith('/') ? '' : '/');
const CACHE_DIR = Paths.cache.uri + (Paths.cache.uri.endsWith('/') ? '' : '/');

/**
 * Converts an absolute URI to a relative path if it's inside the document or cache directory.
 */
export const toRelativePath = (uri: string | null | undefined): string => {
  if (!uri) return '';
  
  // Handle Document Directory
  if (uri.startsWith(DOC_DIR)) {
    return 'doc://' + uri.replace(DOC_DIR, '');
  }
  
  // Handle Cache Directory
  if (uri.startsWith(CACHE_DIR)) {
    return 'cache://' + uri.replace(CACHE_DIR, '');
  }

  // Handle Stale iOS Paths (for migration)
  if (uri.includes('/Containers/Data/Application/')) {
    if (uri.includes('/Documents/')) {
        return 'doc://' + uri.substring(uri.indexOf('/Documents/') + 11);
    }
    if (uri.includes('/Library/Caches/')) {
        return 'cache://' + uri.substring(uri.indexOf('/Library/Caches/') + 16);
    }
  }

  return uri;
};

/**
 * Converts a stored relative path back to an absolute URI.
 */
export const toAbsoluteUri = (path: string | null | undefined): string => {
  if (!path) return '';
  
  if (path.startsWith('doc://')) {
    return DOC_DIR + path.replace('doc://', '');
  }
  
  if (path.startsWith('cache://')) {
    return CACHE_DIR + path.replace('cache://', '');
  }

  // If it's already an absolute URI but stale, fix it
  if (path.startsWith('file:///')) {
     return toAbsoluteUri(toRelativePath(path));
  }

  return path;
};