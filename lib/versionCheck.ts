import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

export type VersionStatus = 'ok' | 'update_required';

export async function checkVersion(): Promise<VersionStatus> {
  try {
    const current = Constants.expoConfig?.version ?? '1.0.0';

    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'min_version')
      .single();

    if (error || !data) {
      console.warn('[versionCheck] no min_version in DB, skipping');
      return 'ok';
    }

    const minVersion = data.value;

    const currentParts = current.split('.').map(Number);
    const minParts = minVersion.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
      const c = currentParts[i] || 0;
      const m = minParts[i] || 0;
      if (c > m) {
        console.log('[versionCheck] ok, current > min');
        return 'ok';
      }
      if (c < m) {
        console.log(`[versionCheck] update required: ${current} < ${minVersion}`);
        return 'update_required';
      }
    }

    console.log('[versionCheck] ok, versions equal');
    return 'ok';
  } catch (err) {
    console.warn('[versionCheck] error (offline?), allowing', err);
    return 'ok';
  }
}
