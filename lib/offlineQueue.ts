import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getUserId } from './offline';
import { loadCache, saveCache } from './encuestasCache';

const QUEUE_KEY = 'offline_queue';

export type OfflineAction = {
  id: string;
  type: 'vote' | 'create_encuesta' | 'salir_encuesta';
  data: any;
  createdAt: number;
};

export async function getQueue(): Promise<OfflineAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export async function addToQueue(action: Omit<OfflineAction, 'id' | 'createdAt'>): Promise<void> {
  const queue = await getQueue();
  queue.push({ ...action, id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((a) => a.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function processQueue(): Promise<void> {
  const queue = await getQueue();
  if (queue.length === 0) return;

  for (const action of queue) {
    try {
      switch (action.type) {
        case 'vote':
          await processVote(action.data);
          break;
        case 'salir_encuesta':
          await processSalir(action.data);
          break;
        case 'create_encuesta':
          break;
      }
      await removeFromQueue(action.id);
    } catch {
      break;
    }
  }
}

async function processVote(data: { groupId: string; selectedOptionIds: string[] }) {
  const { groupId, selectedOptionIds } = data;
  const { error } = await supabase.rpc('votar_encuesta', {
    p_id_encuesta: groupId,
    p_opcion_ids: selectedOptionIds,
  });
  if (error) throw error;

  const { data: e } = await supabase
    .from('encuestas')
    .select('id, titulo, owner, owner_nick, finalizada, multiopcion, votantes, personas_votadas')
    .eq('id', groupId)
    .single();

  if (e?.finalizada) {
    const userId = await getUserId();
    if (userId) {
      await supabase.from('encuestas_lecturas').upsert(
        { id_encuesta: e.id, user_id: userId },
        { onConflict: 'id_encuesta,user_id' }
      );
    }
    supabase.functions.invoke('send-push', {
      body: { type: 'encuesta_finalizada', encuesta_id: e.id, titulo: e.titulo },
    }).catch(() => {});
  }

  const cached = await loadCache();
  if (cached) {
    if (!cached.votedIds.includes(groupId)) cached.votedIds.push(groupId);
    if (e) {
      const idx = cached.encuestas.findIndex((enc: any) => enc.id === groupId);
      if (idx >= 0) {
        cached.encuestas[idx] = e;
      }
    }
    await saveCache(cached);
  }
}

async function processSalir(data: { groupId: string }) {
  const { groupId } = data;
  const { error } = await supabase.rpc('salir_encuesta', { p_id_encuesta: groupId });
  if (error) throw error;
  const cached = await loadCache();
  if (cached) {
    cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
    await saveCache(cached);
  }
}
