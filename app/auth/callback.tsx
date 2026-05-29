import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useURL, createURL } from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { routeAfterAuth } from '@/lib/profile';

export default function AuthCallback() {
  const urlFromHook = useURL();
  const params = useLocalSearchParams();

  useEffect(() => {
    const setSessionFromUrl = async (url: string) => {
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1 && url.includes('access_token=')) {
        const fragment = url.substring(hashIndex + 1);
        const tokenParams: Record<string, string> = {};
        fragment.split('&').forEach((p) => {
          const eq = p.indexOf('=');
          if (eq > 0)
            tokenParams[decodeURIComponent(p.slice(0, eq))] = decodeURIComponent(p.slice(eq + 1));
        });
        if (tokenParams.access_token && tokenParams.refresh_token) {
          await supabase.auth.setSession({
            access_token: tokenParams.access_token,
            refresh_token: tokenParams.refresh_token,
          });
        }
      } else if (url.includes('?code=')) {
        await supabase.auth.exchangeCodeForSession(url);
      }
    };

    const redirectBasedOnSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const next = await routeAfterAuth(session.user.id);
        router.replace(next === 'groups' ? '/groups' : '/complete-profile');
        return true;
      }
      return false;
    };

    const processAuth = async () => {
      const url =
        urlFromHook ||
        (params.code ? createURL('/auth/callback') + '?code=' + params.code : null);

      if (url) {
        await setSessionFromUrl(url);
        if (await redirectBasedOnSession()) return;
      }

      // Wait a bit in case signInWithGoogle is processing the URL
      await new Promise((r) => setTimeout(r, 3000));
      if (await redirectBasedOnSession()) return;

      router.replace('/');
    };

    processAuth();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Completando inicio de sesion...</Text>
    </View>
  );
}
