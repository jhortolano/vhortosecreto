import { supabase } from './supabase';
import { loadCache, saveCache } from './encuestasCache';
import { type Profile, fetchProfile } from './profile';

export async function checkOnline(): Promise<boolean> {
  try {
    const { error } = await supabase.auth.getUser();
    return !error;
  } catch {
    return false;
  }
}

export async function getUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user.id;
  } catch {}
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getProfileWithCache(userId: string): Promise<Profile | null> {
  try {
    const profile = await fetchProfile(userId);
    if (profile) {
      const cache = await loadCache();
      if (cache) {
        cache.profile = profile;
        await saveCache(cache);
      }
      return profile;
    }
  } catch {}
  const cached = await loadCache();
  return cached?.profile ?? null;
}

export async function getEncuestaUserPhone(): Promise<string | null> {
  const cache = await loadCache();
  return cache?.profile?.phone ?? null;
}
