import { Pressable, Text, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useT } from '@/lib/i18n';

function BackToHome() {
  return (
    <Pressable onPress={() => router.push('/groups')} style={backStyles.btn}>
      <Text style={backStyles.arrow}>←</Text>
    </Pressable>
  );
}

const backToHomeOptions = {
  headerLeft: () => <BackToHome />,
};

export default function CreateEncuestaLayout() {
  const { t } = useT();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t('participants'), ...backToHomeOptions }} />
      <Stack.Screen name="form" options={{ title: t('newSurvey') }} />
    </Stack>
  );
}

const backStyles = StyleSheet.create({
  btn: { paddingHorizontal: 4, paddingVertical: 8 },
  arrow: { fontSize: 24, color: '#1F6FEB' },
});
