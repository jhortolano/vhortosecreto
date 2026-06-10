import { supabase } from '@/lib/supabase';
import { loadCache } from '@/lib/encuestasCache';

export type Profile = {
  id: string;
  email: string | null;
  phone: string | null;
  nick: string | null;
  avatar_url: string | null;
};

export function isProfileComplete(profile: Profile | null): boolean {
  if (!profile) return false;
  const phoneOk = !!profile.phone?.trim();
  const nickOk = !!profile.nick?.trim();
  return phoneOk && nickOk;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, phone, nick, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function routeAfterAuth(userId: string): Promise<'complete-profile' | 'groups'> {
  try {
    const profile = await fetchProfile(userId);
    return isProfileComplete(profile) ? 'groups' : 'complete-profile';
  } catch {
    const cached = await loadCache();
    if (cached?.profile && isProfileComplete(cached.profile)) return 'groups';
    return 'complete-profile';
  }
}
