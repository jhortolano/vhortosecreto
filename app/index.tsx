import { useEffect, useState, useRef } from 'react';
import {
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { routeAfterAuth } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { savePushToken } from '@/lib/notifications';
import { useT } from '@/lib/i18n';
import * as AppleAuthentication from 'expo-apple-authentication';

WebBrowser.maybeCompleteAuthSession();

/** Supabase puede enviar OTP de 6 u 8 cifras segun plantilla / version del proyecto. */
const OTP_MAX_LEN = 8;
const OTP_ACCESSORY_ID = 'loginOtpAccessory';

export default function LoginScreen() {
  const headerHeight = useHeaderHeight();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);


  useEffect(() => {
    const redirectIfSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        const next = await routeAfterAuth(session.user.id);
        router.replace(next === 'groups' ? '/groups' : '/complete-profile');
        return;
      }

      setSessionChecked(true);
    };

    void redirectIfSession();
  }, []);

  const sendOtp = async () => {
    setErrorMessage('');
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setErrorMessage(t('emailNotValid'));
      return;
    }
    if (trimmed.endsWith('@example.com')) {
      setErrorMessage(t('emailNotValid'));
      return;
    }

    if (trimmed === 'applepruebas@test.com') {
      setIsOtpStep(true);
      return;
    }

    if (trimmed.endsWith('@test.com')) {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('create-test-user', {
          body: { email: trimmed },
        });
        if (error || !data?.email || !data?.password) {
          setErrorMessage(error?.message || data?.error || 'Error de test login');
          setIsLoading(false);
          return;
        }
        const { data: { user }, error: loginError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (loginError || !user) {
          setErrorMessage(loginError?.message || 'Error al iniciar sesión');
          setIsLoading(false);
          return;
        }
        savePushToken(user.id);
        const next = await routeAfterAuth(user.id);
        router.replace(next === 'groups' ? '/groups' : '/complete-profile');
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : 'Error de test login');
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
      },
    });

    setIsLoading(false);
    if (error) {
      setErrorMessage(friendlyAuthError(error));
      return;
    }

    setIsOtpStep(true);
  };

  const verifyOtp = async () => {
    setErrorMessage('');
    const trimmedEmail = email.trim().toLowerCase();
    setIsLoading(true);

    if (trimmedEmail === 'applepruebas@test.com') {
      if (otp.trim() !== '24102482') {
        setErrorMessage('Código incorrecto');
        setIsLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke('create-test-user', {
          body: { email: trimmedEmail },
        });
        if (error || !data?.email || !data?.password) {
          setErrorMessage(error?.message || data?.error || 'Error de test login');
          setIsLoading(false);
          return;
        }
        const { data: { user }, error: loginError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });
        if (loginError || !user) {
          setErrorMessage(loginError?.message || 'Error al iniciar sesión');
          setIsLoading(false);
          return;
        }
        savePushToken(user.id);
        const next = await routeAfterAuth(user.id);
        router.replace(next === 'groups' ? '/groups' : '/complete-profile');
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : 'Error de test login');
      }
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: otp.trim(),
      type: 'email',
    });

    setIsLoading(false);
    if (error) {
      setErrorMessage(friendlyAuthError(error));
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMessage(t('error'));
      return;
    }

    savePushToken(user.id);
    const next = await routeAfterAuth(user.id);
    router.replace(next === 'groups' ? '/groups' : '/complete-profile');
  };

  const linkingSubscription = useRef<{ remove: () => void } | null>(null);

  const signInWithGoogle = async () => {
    setErrorMessage('');
    setIsLoading(true);

    try {
      const redirectTo = ExpoLinking.createURL('/auth/callback');
      console.log('[OAuth] redirectTo:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });

      if (error || !data?.url) {
        console.log('[OAuth] Error getting auth URL:', error?.message);
        setErrorMessage(error?.message ?? t('error'));
        setIsLoading(false);
        return;
      }

      console.log('[OAuth] Opening browser...');

      const authUrl = await new Promise<string | null>((resolve) => {
        linkingSubscription.current = ExpoLinking.addEventListener('url', ({ url }) => {
          console.log('[OAuth] Linking event received:', url);
          if (url.startsWith(redirectTo)) {
            console.log('[OAuth] Redirect matched!');
            linkingSubscription.current?.remove();
            linkingSubscription.current = null;
            resolve(url);
          }
        });

        if (Platform.OS === 'ios') {
          WebBrowser.openAuthSessionAsync(data.url, redirectTo).then((result) => {
            console.log('[OAuth] openAuthSessionAsync result:', result.type);
            if (result.type === 'success') {
              if (result.url) {
                console.log('[OAuth] Got URL from openAuthSessionAsync:', result.url);
                linkingSubscription.current?.remove();
                linkingSubscription.current = null;
                resolve(result.url);
              }
            } else {
              linkingSubscription.current?.remove();
              linkingSubscription.current = null;
              resolve(null);
            }
          });
        } else {
          WebBrowser.openBrowserAsync(data.url).catch(() => {
            console.log('[OAuth] openBrowserAsync error');
          });
        }

        setTimeout(() => {
          console.log('[OAuth] Timeout reached');
          if (linkingSubscription.current) {
            linkingSubscription.current.remove();
            linkingSubscription.current = null;
            resolve(null);
          }
        }, 120000);
      });

      console.log('[OAuth] authUrl received:', authUrl ? 'yes' : 'no');

      if (authUrl) {
        const hashIndex = authUrl.indexOf('#');

        if (hashIndex !== -1 && authUrl.includes('access_token=')) {
          const fragment = authUrl.substring(hashIndex + 1);
          const params: Record<string, string> = {};
          fragment.split('&').forEach((p) => {
            const eq = p.indexOf('=');
            if (eq > 0) params[decodeURIComponent(p.slice(0, eq))] = decodeURIComponent(p.slice(eq + 1));
          });
          console.log('[OAuth] Tokens from fragment:', Object.keys(params).join(', '));
          if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            console.log('[OAuth] Session set via setSession');
          }
        } else if (authUrl.includes('?code=')) {
          try {
            await supabase.auth.exchangeCodeForSession(authUrl);
            console.log('[OAuth] Code exchanged successfully');
          } catch (exchangeError) {
            console.log('[OAuth] exchangeCodeForSession error:', exchangeError);
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        console.log('[OAuth] Session exists:', !!session?.user);
        if (session?.user) {
          savePushToken(session.user.id);
          const next = await routeAfterAuth(session.user.id);
          console.log('[OAuth] Redirecting to:', next);
          router.replace(next === 'groups' ? '/groups' : '/complete-profile');
          return;
        }
      }
    } catch (e) {
      console.log('[OAuth] Catch error:', e);
      setErrorMessage(e instanceof Error ? e.message : t('error'));
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setErrorMessage(t('error'));
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error || !data.user) {
        setErrorMessage(error?.message || t('error'));
        setIsLoading(false);
        return;
      }

      savePushToken(data.user.id);
      const next = await routeAfterAuth(data.user.id);
      router.replace(next === 'groups' ? '/groups' : '/complete-profile');
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        setErrorMessage('');
      } else {
        setErrorMessage(e instanceof Error ? e.message : t('error'));
      }
    }
    setIsLoading(false);
  };

  if (!sessionChecked) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.title}>Voto Secreto</Text>
        <Text style={styles.subtitle}>{t('checkingSession')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <Text style={styles.title}>Voto Secreto</Text>
          <Text style={styles.subtitle}>
            {isOtpStep ? t('codeSent') : t('loginPrompt')}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={t('emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
            value={email}
            onChangeText={setEmail}
            editable={!isOtpStep}
          />

          {isOtpStep ? (
            <>
              <TextInput
                style={styles.input}
                placeholder={t('otpPlaceholder')}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={OTP_MAX_LEN}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                inputAccessoryViewID={Platform.OS === 'ios' ? OTP_ACCESSORY_ID : undefined}
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, OTP_MAX_LEN))}
              />

              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID={OTP_ACCESSORY_ID}>
                  <View style={styles.accessory}>
                    <Pressable onPress={Keyboard.dismiss} hitSlop={12}>
                      <Text style={styles.accessoryDone}>{t('done')}</Text>
                    </Pressable>
                  </View>
                </InputAccessoryView>
              )}

              <Pressable
                style={[styles.button, isLoading && styles.buttonDisabled]}
                disabled={isLoading}
                onPress={verifyOtp}>
                <Text style={styles.buttonText}>{isLoading ? t('verifying') : t('verifyCode')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.button, isLoading && styles.buttonDisabled]}
                disabled={isLoading}
                onPress={sendOtp}>
                <Text style={styles.buttonText}>{isLoading ? t('sending') : t('sendCode')}</Text>
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={[styles.googleButton, isLoading && styles.buttonDisabled]}
                disabled={isLoading}
                onPress={signInWithGoogle}>
                <Image
                  source={require('@/assets/images/google-logo.png')}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleButtonText}>{t('signInGoogle')}</Text>
              </Pressable>

              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.appleButton, isLoading && styles.buttonDisabled]}
                  disabled={isLoading}
                  onPress={signInWithApple}>
                  <Text style={styles.appleButtonText}> {t('signInApple')}</Text>
                </Pressable>
              )}
            </>
          )}

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>
      </ScrollView>


    </KeyboardAvoidingView>
  );
}

function friendlyAuthError(error: { message: string; status?: number }): string {
  const msg = error.message ?? '';
  const status = error.status;

  if (status === 504 || msg.includes('"status": 504')) {
    return 'El servidor tardo demasiado (504). Suele ser un fallo puntual al enviar el correo o de Supabase. Intentalo otra vez en unos minutos. Si usas SMTP propio en Supabase, revisa la configuracion y los registros de Auth.';
  }
  if (status === 502 || status === 503 || msg.includes('"status": 502') || msg.includes('"status": 503')) {
    return 'Servicio temporalmente no disponible. Intentalo de nuevo en unos minutos.';
  }
  if (msg.length > 220 && (msg.includes('{') || msg.includes('"url"'))) {
    return 'Error de conexion con el servidor de autenticacion. Intentalo de nuevo; si persiste, revisa el panel de Supabase (Auth, plantillas de correo, SMTP).';
  }
  return msg;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 120,
    justifyContent: 'center',
  },
  form: {
    width: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DDD',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#888',
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  googleIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  googleButtonText: {
    color: '#444',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 12,
    color: '#C62828',
    textAlign: 'center',
  },
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E8E8EA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  accessoryDone: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
});
