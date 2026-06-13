import { useMemo } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/lib/i18n';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';

export default function UpdateRequiredScreen() {
  const { t } = useT();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const openStore = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/id6774578274'
      : 'https://play.google.com/store/apps/details?id=com.termibululu.vhortosecreto';
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📦</Text>
      <Text style={styles.title}>{t('updateRequired')}</Text>
      <Text style={styles.subtitle}>{t('newVersionAvailable')}</Text>
      <Pressable style={styles.button} onPress={openStore}>
        <Text style={styles.buttonText}>{t('updateNow')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.background },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center', color: colors.text },
  subtitle: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  });
}
