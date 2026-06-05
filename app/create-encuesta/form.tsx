import { useCreateEncuesta } from '@/context/createEncuestaContext';
import { fetchProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { needsAd, resetCounter, incrementCounter, markFirstAdDone } from '@/lib/adManager';
import { showRewardedAd } from '@/lib/rewardedAd';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { resizeImage, imageUriToBase64 } from '@/lib/imageResize';
import { useHeaderHeight } from '@react-navigation/elements';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 15;

function mapRpcError(message: string): string {
  if (message.includes('min_dos_opciones')) return 'Necesitas al menos dos opciones con texto.';
  if (message.includes('titulo_vacio')) return 'El titulo no puede estar vacio.';
  if (message.includes('profile_phone_missing') || message.includes('profile_nick_missing')) {
    return 'Completa tu perfil (telefono y nick) antes de crear encuestas.';
  }
  if (message.includes('not_authenticated')) return 'Sesion no valida. Vuelve a iniciar sesion.';
  console.error("Unhandled RPC error:", message);
  return "Ha ocurrido un error inesperado. Por favor, intentalo de nuevo.";
}

export default function CreateEncuestaFormScreen() {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const { selected, clear } = useCreateEncuesta();
  const [titulo, setTitulo] = useState('');
  const [opciones, setOpciones] = useState<string[]>(['', '']);
  const [multiopcion, setMultiopcion] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [error, setError] = useState('');

  const addOption = () => {
    if (opciones.length >= MAX_OPTIONS) return;
    setOpciones((o) => [...o, '']);
  };

  const removeLastOption = () => {
    if (opciones.length <= MIN_OPTIONS) return;
    setOpciones((o) => o.slice(0, -1));
  };

  const setOptionAt = (index: number, value: string) => {
    setOpciones((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('galleryPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPendingImageUri(result.assets[0].uri);
    }
  };

  const confirmImage = async () => {
    if (!pendingImageUri) return;
    try {
      const resized = await resizeImage(pendingImageUri);
      setSelectedImageUri(resized);
    } catch {
      setSelectedImageUri(pendingImageUri);
    }
    setPendingImageUri(null);
  };

  const cancelPendingImage = () => {
    setPendingImageUri(null);
  };

  const removeImage = () => {
    setSelectedImageUri(null);
  };

  const cancel = () => {
    clear();
    router.replace('/groups');
  };

  const crear = async () => {
    setError('');
    setSaving(true);

    const tit = titulo.trim();
    if (!tit) {
      setError('Rellena el titulo de la votacion.');
      setSaving(false);
      return;
    }
    for (let i = 0; i < opciones.length; i++) {
      if (!opciones[i].trim()) {
        setError(`Rellena la opcion ${i + 1}.`);
        setSaving(false);
        return;
      }
    }
    if (opciones.length < MIN_OPTIONS) {
      setError('Debe haber al menos dos opciones.');
      setSaving(false);
      return;
    }
    if (selected.length === 0) {
      setError(t('minParticipants'));
      setSaving(false);
      return;
    }
    const phones = selected.map((contacto) => {
      const num = contacto.phone || '';
      return num.replace(/\s+/g, '');
    });

    for (const phone of phones) {
      if (!/^\+?[0-9]+$/.test(phone)) {
        setError('Alguno de los números de teléfono de los participantes no tiene un formato válido (solo dígitos).');
        setSaving(false);
        return;
      }
    }

    const trimmedOps = opciones.map((x) => x.trim());

    let imagenKey: string | null = null;
    let imagenUrl: string | null = null;

    if (selectedImageUri) {
      setUploadingImage(true);
      try {
        const resized = await resizeImage(selectedImageUri);
        const base64 = await imageUriToBase64(resized);
        let res = await supabase.functions.invoke('r2-upload', {
          body: { image_base64: base64 },
        });
        let uploadResult = res.data;
        let uploadError = res.error;
        if (uploadError) {
          console.error('r2-upload invoke error:', uploadError);
          setSaving(false);
          setUploadingImage(false);
          setError(`Error al subir la imagen: ${uploadError.message}`);
          return;
        }
        if (typeof uploadResult === 'string') {
          try { uploadResult = JSON.parse(uploadResult); } catch { /* ignore */ }
        }
        console.log('r2-upload response:', JSON.stringify(uploadResult));
        if (!uploadResult?.key || !uploadResult?.url) {
          setSaving(false);
          setUploadingImage(false);
          setError('Respuesta inválida del servidor de imágenes.');
          return;
        }
        imagenKey = uploadResult.key;
        imagenUrl = uploadResult.url;
      } catch {
        setSaving(false);
        setUploadingImage(false);
        setError('Error al procesar la imagen.');
        return;
      }
      setUploadingImage(false);
    }

    if (await needsAd()) {
      await new Promise<void>((resolve) => {
        Alert.alert(
          t('adRequiredTitle'),
          t('adRequired'),
          [
            {
              text: t('watchAd'),
              onPress: async () => {
                setAdLoading(true);
                const rewarded = await showRewardedAd();
                setAdLoading(false);
                if (rewarded) {
                  await resetCounter();
                  await markFirstAdDone();
                }
                resolve();
              },
            },
            { text: t('cancel'), onPress: () => resolve() },
          ],
        );
      });
      if (await needsAd()) {
        setSaving(false);
        setError(t('mustWatchAd'));
        return;
      }
    }

    const { data, error: rpcError } = await supabase.rpc('create_encuesta_bundle', {
      p_titulo: tit,
      p_multiopcion: multiopcion,
      p_opciones: trimmedOps,
      p_phones_participantes: phones,
      p_imagen_key: imagenKey,
      p_imagen_url: imagenUrl,
    });

    if (rpcError) {
      setSaving(false);
      setError(mapRpcError(rpcError.message));
      return;
    }

    if (!data) {
      setSaving(false);
      setError(t('error'));
      return;
    }

    clear();
    await incrementCounter();

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      const profile = await fetchProfile(currentUser.id);
      const cached = await loadCache();
      if (cached) {
        cached.encuestas.unshift({
          id: data,
           titulo: tit,
          owner: profile?.phone || '',
          owner_nick: profile?.nick || '',
          finalizada: false,
          votantes: selected.length + 1,
          multiopcion: multiopcion,
          personas_a_votar: selected.length + 1,
          personas_votadas: 0,
          created_at: new Date().toISOString(),
          finalizada_at: null,
        });
        cached.votedIds ??= [];
        cached.leidas ??= [];
        cached.ownerAvatars ??= {};
        await saveCache(cached);
      }

      supabase.functions.invoke('send-push', {
        body: {
          type: 'new_encuesta',
          encuesta_id: data,
           titulo: tit,
          owner_nick: profile?.nick || undefined,
          exclude_phone: profile?.phone || undefined,
        },
      }).catch(() => {});
    }

    router.replace('/groups');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <Text style={styles.meta}>
          {t('participantsLabel')} {selected.length + 1}
        </Text>

        <Text style={styles.label}>{t('pollTitle')}</Text>
        <TextInput
          style={styles.input}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej.: Donde cenamos el viernes"
        />

        {pendingImageUri ? (
          <View style={styles.pendingImageContainer}>
            <Image source={{ uri: pendingImageUri }} style={styles.imagePreview} contentFit="cover" />
            <View style={styles.pendingImageActions}>
              <Pressable style={styles.pendingCancelBtn} onPress={cancelPendingImage}>
                <Text style={styles.pendingCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={styles.pendingConfirmBtn} onPress={confirmImage}>
                <Text style={styles.pendingConfirmText}>OK</Text>
              </Pressable>
            </View>
          </View>
        ) : selectedImageUri ? (
          <Pressable style={styles.imagePickerBtn} onPress={removeImage}>
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: selectedImageUri }} style={styles.imagePreview} contentFit="cover" />
              <Text style={styles.imageRemoveText}>{t('removeImage')}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.imagePickerBtn} onPress={pickImage}>
            <Text style={styles.imagePickerText}>{t('addImage')}</Text>
          </Pressable>
        )}
        {uploadingImage && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color="#1F6FEB" />
            <Text style={styles.uploadingText}>{t('sending')}</Text>
          </View>
        )}

        {opciones.map((op, i) => (
          <View key={`op-${i}`} style={styles.optionBlock}>
            <Text style={styles.label}>{t('option')} {i + 1}</Text>
            <TextInput
              style={styles.input}
              value={op}
              onChangeText={(v) => setOptionAt(i, v)}
              placeholder={`${t('option')} ${i + 1}`}
            />
          </View>
        ))}

        <View style={styles.rowBtns}>
          <Pressable
            style={[styles.smallBtn, opciones.length >= MAX_OPTIONS && styles.smallBtnDisabled]}
            disabled={opciones.length >= MAX_OPTIONS}
            onPress={addOption}>
            <Text style={styles.smallBtnText}>+</Text>
          </Pressable>
          <Pressable
            style={[styles.smallBtn, opciones.length <= MIN_OPTIONS && styles.smallBtnDisabled]}
            disabled={opciones.length <= MIN_OPTIONS}
            onPress={removeLastOption}>
            <Text style={styles.smallBtnText}>-</Text>
          </Pressable>
        </View>

        <Pressable style={styles.checkboxRow} onPress={() => setMultiopcion((m) => !m)}>
          <View style={[styles.box, multiopcion && styles.boxOn]} />
          <Text style={styles.checkboxLabel}>{t('allowMultiple')}</Text>
        </Pressable>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={cancel} disabled={saving}>
            <Text style={styles.secondaryText}>{t('cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primary, saving && styles.primaryDisabled]}
            onPress={crear}
            disabled={saving}>
            <Text style={styles.primaryText}>{saving ? t('creating') : t('createPoll')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {adLoading && (
        <View style={styles.overlay}>
          <View style={styles.overlayBox}>
            <ActivityIndicator size="large" color="#1F6FEB" />
            <Text style={styles.overlayText}>{t('waitingAd')}</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 120 },
  meta: { color: '#555', marginBottom: 16, fontSize: 14 },
  label: { fontWeight: '600', marginBottom: 6, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 14,
  },
  optionBlock: { marginBottom: 4 },
  rowBtns: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  smallBtn: {
    width: 52,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnDisabled: { opacity: 0.4 },
  smallBtnText: { fontSize: 24, fontWeight: '600', color: '#222' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  box: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#888',
    borderRadius: 4,
  },
  boxOn: { backgroundColor: '#1F6FEB', borderColor: '#1F6FEB' },
  checkboxLabel: { fontSize: 16, flex: 1 },
  error: { color: '#C62828', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  primary: {
    flex: 1,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#1F6FEB', fontWeight: '600', fontSize: 16 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  overlayBox: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
  },
  overlayText: { fontSize: 16, fontWeight: '600', color: '#333' },
  imagePickerBtn: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
    alignSelf: 'stretch',
  },
  imagePickerText: { color: '#1F6FEB', fontWeight: '600', fontSize: 14 },
  pendingImageContainer: {
    marginBottom: 14,
    alignItems: 'center',
    gap: 10,
  },
  pendingImageActions: {
    flexDirection: 'row',
    gap: 12,
  },
  pendingCancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  pendingCancelText: { color: '#888', fontWeight: '600', fontSize: 14 },
  pendingConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1F6FEB',
  },
  pendingConfirmText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  imagePreviewWrap: { alignItems: 'center', gap: 6, width: '100%' },
  imagePreview: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F0F0F0' },
  imageRemoveText: { color: '#C62828', fontWeight: '600', fontSize: 13 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  uploadingText: { color: '#888', fontSize: 13 },
});
