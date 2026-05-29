import { useEffect } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CreateEncuestaProvider } from '@/context/createEncuestaContext';
import { checkVersion } from '@/lib/versionCheck';
import { setupNotificationListeners } from '@/lib/notifications';
import { useT } from '@/lib/i18n';
import 'react-native-reanimated';

function BackToHome() {
  return (
    <Pressable onPress={() => router.back()} style={styles.backBtn}>
      <Text style={styles.backArrow}>←</Text>
    </Pressable>
  );
}

const backToHomeOptions = {
  headerLeft: () => <BackToHome />,
};

export default function RootLayout() {
  const { t } = useT();

  useEffect(() => {
    console.log('[LAYOUT] RootLayout mounted');
    setupNotificationListeners();
    checkVersion().then((status) => {
      if (status === 'update_required') router.replace('/update-required');
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CreateEncuestaProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: t('login'), headerShown: false }} />
        <Stack.Screen name="complete-profile" options={{ title: t('profileTitle'), ...backToHomeOptions }} />
        <Stack.Screen name="groups" options={{ headerTitle: '' }} />
        <Stack.Screen name="profile" options={{ title: t('myProfile'), ...backToHomeOptions }} />
        <Stack.Screen name="vote/[groupId]" options={{ title: t('appName'), ...backToHomeOptions }} />
        <Stack.Screen name="create-encuesta" options={{ headerShown: false }} />
        <Stack.Screen name="crear-grupo" options={{ title: t('newGroup'), ...backToHomeOptions }} />
        <Stack.Screen name="grupo/[id]" options={{ title: t('groups'), ...backToHomeOptions }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="update-required" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
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
    color: '#1F6FEB',
  },
});
