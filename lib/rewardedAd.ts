import { Alert, Platform } from 'react-native';
import { AdEventType, MobileAds, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

// TODO: cambiar a ID de producción al publicar en App Store (iOS no-fill temporalmente permite crear)
// Production IDs: Android ca-app-pub-6861706201921698/5324761288, iOS ca-app-pub-6861706201921698/2894547211
const AD_UNIT_ID = Platform.OS === 'ios'
  ? 'ca-app-pub-6861706201921698/2894547211'
  : (__DEV__
    ? 'ca-app-pub-3940256099942544/5224354917'
    : 'ca-app-pub-6861706201921698/5324761288');

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = MobileAds().initialize().then(() => {}).catch(() => {});
  }
  return initPromise;
}

function loadAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(AD_UNIT_ID);
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.warn('[rewardedAd] timeout');
        resolve(false);
      }
    }, 15000);

    const finish = (result: boolean) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      }
    };

    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      try { rewarded.show(); } catch (e) {
        console.warn('[rewardedAd] show error', e);
        finish(false);
      }
    });

    rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      finish(true);
    });

    rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      finish(false);
    });

    rewarded.addAdEventListener(AdEventType.ERROR, (e) => {
      const msg = e?.message || String(e);
      const isNoFill = msg.includes('no-fill') || msg.includes('No ad to show');
      console.warn('[rewardedAd] ERROR', msg);
      if (isNoFill) {
        Alert.alert('Anuncio no disponible', 'No hay anuncios para mostrar en este momento. Puedes crear la encuesta igualmente.');
        finish(true);
      } else {
        finish(false);
      }
    });

    rewarded.load();
  });
}

export async function showRewardedAd(): Promise<boolean> {
  await ensureInitialized();

  const result = await loadAd();
  if (!result) return false;

  return true;
}
