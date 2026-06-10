import { useLocalSearchParams, router } from 'expo-router';
import { useT } from '@/lib/i18n';
import { Share, StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';

export default function ShareScreen() {
  const { t } = useT();
  const { linkUuid, titulo } = useLocalSearchParams<{ linkUuid: string; titulo: string }>();
  const deepLink = `https://vhortosecreto.vercel.app/open/${linkUuid}`;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${titulo || 'Votación'}\n\n${deepLink}`,
        url: deepLink,
      });
    } catch {}
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(deepLink);
  };

  const goHome = () => {
    router.replace('/groups');
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="link" size={48} color="#1F6FEB" />
      </View>
      <Text style={styles.title}>{t('surveyCreated')}</Text>
      <Text style={styles.subtitle}>{t('shareLinkHint')}</Text>

      <View style={styles.linkBox}>
        <Text style={styles.linkText} numberOfLines={2}>{deepLink}</Text>
      </View>

      <Pressable style={styles.copyBtn} onPress={handleCopy}>
        <MaterialIcons name="content-copy" size={18} color="#FFF" />
        <Text style={styles.copyBtnText}>{t('copyLink')}</Text>
      </Pressable>

      <Pressable style={styles.shareBtn} onPress={handleShare}>
        <MaterialIcons name="share" size={20} color="#FFF" />
        <Text style={styles.shareBtnText}>{t('share')}</Text>
      </Pressable>

      <Pressable style={styles.homeBtn} onPress={goHome}>
        <Text style={styles.homeBtnText}>{t('goHome')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  linkBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 16,
    width: '100%',
    marginBottom: 16,
  },
  linkText: { fontSize: 14, color: '#333', textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#555',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 12,
  },
  copyBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 24,
  },
  shareBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  homeBtn: { paddingVertical: 14 },
  homeBtnText: { color: '#1F6FEB', fontWeight: '600', fontSize: 15 },
});
