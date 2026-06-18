import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'encuestas_since_ad';
const FIRST_AD_KEY = 'first_ad_done';

let sessionAdDone = false;

export function resetSessionAdFlag(): void {
  sessionAdDone = false;
}

export async function getCounter(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? parseInt(raw, 10) : 0;
}

export async function incrementCounter(): Promise<number> {
  sessionAdDone = false;
  const current = await getCounter();
  const next = current + 1;
  await AsyncStorage.setItem(KEY, String(next));
  return next;
}

export async function resetCounter(): Promise<void> {
  await AsyncStorage.setItem(KEY, '0');
}

const FIRST_AD_AT = 5;
const ADS_EVERY = 2;

export async function needsAd(): Promise<boolean> {
  if (sessionAdDone) return false;
  const count = await getCounter();
  const firstDone = await AsyncStorage.getItem(FIRST_AD_KEY);
  if (!firstDone) {
    return count >= FIRST_AD_AT;
  }
  return count >= ADS_EVERY;
}

export async function markFirstAdDone(): Promise<void> {
  sessionAdDone = true;
  await AsyncStorage.setItem(FIRST_AD_KEY, 'true');
}
