import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const SUBDIR = 'supabase-auth';

function keyToFileName(key: string): string {
  return `${encodeURIComponent(key).replace(/%/g, '_')}.txt`;
}

let baseDirPromise: Promise<string> | null = null;

async function ensureBaseDir(): Promise<string> {
  if (!baseDirPromise) {
    baseDirPromise = (async () => {
      const root = FileSystem.documentDirectory;
      if (!root) {
        throw new Error('FileSystem.documentDirectory no disponible');
      }
      const base = `${root}${SUBDIR}/`;
      await FileSystem.makeDirectoryAsync(base, { intermediates: true });
      return base;
    })();
  }
  return baseDirPromise;
}

/**
 * Persistencia de sesión Supabase sin `@react-native-async-storage/async-storage`
 * (en algunos entornos Expo el módulo nativo legacy devuelve null).
 */
export const supabaseAuthStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    try {
      const base = await ensureBaseDir();
      const uri = `${base}${keyToFileName(key)}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        return null;
      }
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
      return;
    }
    const base = await ensureBaseDir();
    const uri = `${base}${keyToFileName(key)}`;
    await FileSystem.writeAsStringAsync(uri, value, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      return;
    }
    try {
      const root = FileSystem.documentDirectory;
      if (!root) return;
      const uri = `${root}${SUBDIR}/${keyToFileName(key)}`;
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignorar
    }
  },
};
