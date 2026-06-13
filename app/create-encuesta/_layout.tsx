import { Pressable, Text, StyleSheet, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { useT } from '@/lib/i18n';
import { lightColors, darkColors } from '@/constants/colors';

function BackToHome() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  return (
    <Pressable onPress={() => router.push('/groups')} style={backStyles.btn}>
      <Text style={[backStyles.arrow, { color: colors.backArrow }]}>←</Text>
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
      <Stack.Screen name="index" options={{ title: t('newSurvey'), ...backToHomeOptions }} />
      <Stack.Screen name="contacts" options={{ title: t('participants') }} />
    </Stack>
  );
}

const backStyles = StyleSheet.create({
  btn: { paddingHorizontal: 4, paddingVertical: 8 },
  arrow: { fontSize: 24 },
});
