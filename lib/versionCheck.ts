import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export type VersionStatus = 'ok' | 'update_required';

/**
 * Compara la versión actual de la app con la versión mínima
 * definida en Supabase (app_config.min_version).
 * Si la actual es menor, devuelve 'update_required'.
 */
export async function checkVersion(): Promise<VersionStatus> {
  try {
    const current = Constants.expoConfig?.version ?? '1.0.0';

    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'min_version')
      .single();

    if (error || !data) return 'ok';

    const minVersion = data.value;

    const currentParts = current.split('.').map(Number);
    const minParts = minVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
      const c = currentParts[i] || 0;
      const m = minParts[i] || 0;
      if (c > m) return 'ok';
      if (c < m) return 'update_required';
    }

    return 'ok';
  } catch {
    return 'ok';
  }
}
