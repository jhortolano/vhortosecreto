import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from './profile';

const KEY = 'encuestas_cache';

export interface EncuestaCache {
  encuestas: any[];
  votedIds: string[];
  leidas: string[];
  ownerAvatars: Record<string, string | null>;
  grupos?: { id: string; nombre: string; imagen_url: string | null }[];
  encuestaImages?: Record<string, { r2_key: string; r2_url: string }>;
  profile?: Profile;
}

export async function loadCache(): Promise<EncuestaCache | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCache(data: EncuestaCache): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
