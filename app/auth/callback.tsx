import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { routeAfterAuth } from '@/lib/profile';

export default function AuthCallback() {
  const [url, setUrl] = useState<string | null>(null);

  const setSessionFromUrl = async (authUrl: string) => {
    const hashIndex = authUrl.indexOf('#');
    if (hashIndex !== -1 && authUrl.includes('access_token=')) {
      const fragment = authUrl.substring(hashIndex + 1);
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
    } else if (authUrl.includes('?code=')) {
      await supabase.auth.exchangeCodeForSession(authUrl);
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

  useEffect(() => {
    ExpoLinking.getInitialURL().then((initialUrl) => {
      if (initialUrl) setUrl(initialUrl);
    });

    const sub = ExpoLinking.addEventListener('url', ({ url }) => {
      setUrl(url);
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!url) return;

    const processAuth = async () => {
      await setSessionFromUrl(url);
      if (await redirectBasedOnSession()) return;

      await new Promise((r) => setTimeout(r, 3000));
      if (await redirectBasedOnSession()) return;

      router.replace('/');
    };

    processAuth();
  }, [url]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Completando inicio de sesion...</Text>
    </View>
  );
}
