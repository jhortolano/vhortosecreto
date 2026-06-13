import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, StyleSheet, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CreateEncuestaProvider } from '@/context/createEncuestaContext';
import { checkVersion } from '@/lib/versionCheck';
import { setupNotificationListeners, savePushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { processQueue } from '@/lib/offlineQueue';
import { MobileAds } from 'react-native-google-mobile-ads';
import UpdateRequiredScreen from '@/app/update-required';
import 'react-native-reanimated';
import { lightColors, darkColors } from '@/constants/colors';

function BackToHome() {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  return (
    <Pressable onPress={() => router.back()} style={styles.backBtn}>
      <Text style={[styles.backArrow, { color: colors.backArrow }]}>←</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  const { t } = useT();
  const colorScheme = useColorScheme();
  const [versionBlocked, setVersionBlocked] = useState(false);
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const headerTheme = useMemo(() => ({
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.backArrow,
    headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
  }), [colors]);

  const sharedHeader = { ...headerTheme };

  useEffect(() => {
    console.log('[LAYOUT] RootLayout mounted');
    setupNotificationListeners();
    checkVersion().then((status) => {
      if (status === 'update_required') {
        setVersionBlocked(true);
      }
    });
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) savePushToken(user.id).catch(() => {});
    }).catch(() => {});
    MobileAds().initialize().catch(() => {});
    void processQueue();
  }, []);

  if (versionBlocked) {
    return <UpdateRequiredScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CreateEncuestaProvider>
      <Stack screenOptions={headerTheme}>
        <Stack.Screen name="index" options={{ title: t('login'), headerShown: false }} />
        <Stack.Screen name="complete-profile" options={{ title: t('profileTitle'), headerLeft: () => <BackToHome /> }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: t('myProfile'), headerLeft: () => <BackToHome /> }} />
        <Stack.Screen name="vote/[groupId]" options={{ title: t('appName'), headerLeft: () => <BackToHome /> }} />
        <Stack.Screen name="create-encuesta" options={{ headerShown: false }} />
        <Stack.Screen name="crear-grupo" options={{ title: t('newGroup'), headerLeft: () => <BackToHome /> }} />
        <Stack.Screen name="grupo/[id]" options={{ title: t('groups'), headerLeft: () => <BackToHome /> }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="update-required" options={{ headerShown: false }} />
        <Stack.Screen name="open/[linkUuid]" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </CreateEncuestaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  backArrow: {
    fontSize: 24,
  },
});
