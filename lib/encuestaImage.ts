import { Paths, File, Directory } from 'expo-file-system';

const R2_PUBLIC_BASE = 'https://pub-d4bbd152d3b44a2eb2871e942b645a09.r2.dev';

function imageLocalPath(r2Key: string): string {
  return `${Paths.document.uri}encuesta_imgs/${r2Key.replace(/\//g, '_')}`;
}

export async function getEncuestaImagePath(r2Key: string): Promise<string> {
  const path = imageLocalPath(r2Key);
  const file = new File(path);
  if (file.exists) return path;
  return '';
}

export async function downloadEncuestaImage(r2Key: string, r2Url: string): Promise<string> {
  const dir = new Directory(Paths.document, 'encuesta_imgs');
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }

  const localPath = imageLocalPath(r2Key);
  const file = new File(localPath);
  if (file.exists) return localPath;

  const urlsToTry = [r2Url];
  if (r2Url.includes('r2.cloudflarestorage.com')) {
    urlsToTry.push(`${R2_PUBLIC_BASE}/${r2Key}`);
  }

  let lastError: unknown;
  for (const url of urlsToTry) {
    try {
      const downloaded = await File.downloadFileAsync(url, new File(localPath));
      return downloaded.uri;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError ?? new Error('Failed to download image');
}

export async function deleteEncuestaImageCache(r2Key: string): Promise<void> {
  const file = new File(imageLocalPath(r2Key));
  if (file.exists) {
    file.delete();
  }
}

export async function ensureImageDownloaded(r2Key: string, r2Url: string): Promise<string> {
  const cached = await getEncuestaImagePath(r2Key);
  if (cached) return cached;
  return downloadEncuestaImage(r2Key, r2Url);
}
