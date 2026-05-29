import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { fetchProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { uploadAvatarFromUri } from '@/lib/uploadAvatar';
import { useT } from '@/lib/i18n';

export default function ProfileScreen() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nick, setNick] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace('/');
        return;
      }

      try {
        const profile = await fetchProfile(user.id);
        if (profile) {
          setEmail(profile.email ?? '');
          setPhone(profile.phone ?? '');
          setNick(profile.nick ?? '');
          setAvatarUrl(profile.avatar_url ?? null);
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : t('errorLoadingProfile'));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const pickAvatar = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrorMessage(t('galleryPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingAvatar(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsUploadingAvatar(false);
      router.replace('/');
      return;
    }

    try {
      const newUrl = await uploadAvatarFromUri(user.id, result.assets[0].uri, result.assets[0].mimeType);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('id', user.id);

      if (error) {
        setErrorMessage(error.message);
      } else {
        setAvatarUrl(newUrl);
        setSuccessMessage(t('profileUpdated'));
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : t('errorLoadingImage'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const confirmPickAvatar = () => {
    Alert.alert(t('photoProfile'), t('chooseFromGallery'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('choose'), onPress: pickAvatar },
    ]);
  };

  const saveNick = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    const trimmed = nick.trim();
    if (!trimmed) {
      setErrorMessage(t('nickCannotBeEmpty'));
      return;
    }

    setIsSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsSaving(false);
      router.replace('/');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ nick: trimmed })
      .eq('id', user.id);

    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage(t('nickUpdated'));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Pressable style={styles.avatarWrap} onPress={confirmPickAvatar} disabled={isUploadingAvatar}>
          {isUploadingAvatar ? (
            <ActivityIndicator size="large" style={styles.avatar} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <MaterialIcons name="person" size={48} color="#FFF" />
            </View>
          )}
          <Text style={styles.avatarHint}>{t('tapToChangePhoto')}</Text>
        </Pressable>

        <Text style={styles.label}>{t('emailLabel')}</Text>
        <TextInput style={[styles.input, styles.inputDisabled]} value={email} editable={false} />

        <Text style={styles.label}>{t('phoneLabel')}</Text>
        <TextInput style={[styles.input, styles.inputDisabled]} value={phone} editable={false} />

        <Text style={styles.label}>{t('nickLabel')}</Text>
        <TextInput
          style={styles.input}
          value={nick}
          onChangeText={setNick}
          placeholder={t('nickPlaceholder')}
          autoCapitalize="none"
        />

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          disabled={isSaving}
          onPress={saveNick}>
          <Text style={styles.saveButtonText}>{isSaving ? t('saving') : t('saveNick')}</Text>
        </Pressable>

        {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}
        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <Pressable style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>{t('signOut')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: '#1F6FEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '700',
  },
  avatarHint: {
    marginTop: 8,
    color: '#1F6FEB',
    fontSize: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  inputDisabled: {
    backgroundColor: '#F5F5F5',
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successText: {
    marginTop: 14,
    color: '#0F8A3E',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    color: '#C62828',
    textAlign: 'center',
  },
  logoutButton: {
    marginTop: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 10,
    paddingVertical: 14,
  },
  logoutText: {
    color: '#C62828',
    fontWeight: '600',
    fontSize: 16,
  },
});
