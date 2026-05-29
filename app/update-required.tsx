import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/lib/i18n';

export default function UpdateRequiredScreen() {
  const { t } = useT();
  const openStore = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/idYOUR_APP_ID'
      : 'https://play.google.com/store/apps/details?id=com.anonymous.VhortoSecreto';
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

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FFF' },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  button: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
});
