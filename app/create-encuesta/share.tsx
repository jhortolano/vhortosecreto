import { useMemo } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useT } from '@/lib/i18n';
import { Share, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import QrDisplay from '@/lib/QrDisplay';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';

export default function ShareScreen() {
  const { t } = useT();
  const { width } = useWindowDimensions();
  const { linkUuid, titulo } = useLocalSearchParams<{ linkUuid: string; titulo: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const deepLink = `https://vhortosecreto.vercel.app/open/${linkUuid}`;
  const qrSize = Math.min(width - 80, 240);

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
      <View style={styles.qrWrap}>
        <QrDisplay value={deepLink} size={qrSize} />
      </View>
      <Text style={styles.title}>{t('surveyCreated')}</Text>
      <Text style={styles.subtitle}>{t('shareLinkHint')}</Text>

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

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrWrap: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.textSection,
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
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 24,
  },
  shareBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  homeBtn: { paddingVertical: 14 },
  homeBtnText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  });
}
