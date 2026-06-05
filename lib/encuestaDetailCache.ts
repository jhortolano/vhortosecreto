import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'encuesta_detail_';
const TTL = 300_000;

export type VotanteCache = {
  phone_usuario: string;
  nick_usuario: string | null;
  avatar_url: string | null;
  haVotado: boolean;
};

type DetailCache = {
  encuesta: any;
  opciones: any[];
  haVotado: boolean;
  votantes: VotanteCache[];
  fetchedAt: number;
};

export async function getDetailCache(groupId: string): Promise<DetailCache | null> {
  const raw = await AsyncStorage.getItem(PREFIX + groupId);
  if (!raw) return null;
  try {
    const parsed: DetailCache = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > TTL) {
      await AsyncStorage.removeItem(PREFIX + groupId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setDetailCache(groupId: string, data: Omit<DetailCache, 'fetchedAt'>): Promise<void> {
  await AsyncStorage.setItem(PREFIX + groupId, JSON.stringify({ ...data, fetchedAt: Date.now() }));
}
