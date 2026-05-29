import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

const AD_UNIT_ID = __DEV__
  ? 'ca-app-pub-3940256099942544/5224354917'
  : 'ca-app-pub-6861706201921698/5324761288';

export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve) => {
    const rewarded = RewardedAd.createForAdRequest(AD_UNIT_ID);

    const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewarded.show();
    });

    const unsubEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        resolve(true);
      },
    );

    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      resolve(false);
    });

    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      resolve(false);
    });

    rewarded.load();
  });
}
