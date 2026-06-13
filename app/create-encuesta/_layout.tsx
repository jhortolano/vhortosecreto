import { useMemo } from 'react';
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

export default function CreateEncuestaLayout() {
  const { t } = useT();
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const headerTheme = useMemo(() => ({
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.backArrow,
    headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
  }), [colors]);

  return (
    <Stack screenOptions={headerTheme}>
      <Stack.Screen name="index" options={{ title: t('newSurvey'), headerLeft: () => <BackToHome /> }} />
      <Stack.Screen name="contacts" options={{ title: t('participants'), headerLeft: () => <BackToHome /> }} />
    </Stack>
  );
}

const backStyles = StyleSheet.create({
  btn: { paddingHorizontal: 4, paddingVertical: 8 },
  arrow: { fontSize: 24 },
});
