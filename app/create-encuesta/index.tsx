import { useCreateEncuesta } from '@/context/createEncuestaContext';
import { fetchProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { needsAd, resetCounter, incrementCounter, markFirstAdDone } from '@/lib/adManager';
import { showRewardedAd } from '@/lib/rewardedAd';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { setDetailCache } from '@/lib/encuestaDetailCache';
import { resizeImage, imageUriToBase64 } from '@/lib/imageResize';
import { useHeaderHeight } from '@react-navigation/elements';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { checkOnline } from '@/lib/offline';
import { randomUUID } from 'expo-crypto';
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

export default function CreateEncuestaFormScreen() {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const { selected, setFormData, formData, clear } = useCreateEncuesta();
  const [titulo, setTitulo] = useState(formData.titulo);
  const [opciones, setOpciones] = useState<string[]>(formData.opciones.length > 1 ? formData.opciones : ['', '']);
  const [multiopcion, setMultiopcion] = useState(formData.multiopcion);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageKey, setImageKey] = useState<string | null>(formData.imagenKey);
  const [imageUrl, setImageUrl] = useState<string | null>(formData.imagenUrl);

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
      try {
        const resized = await resizeImage(result.assets[0].uri);
        setSelectedImageUri(resized);
      } catch {
        setSelectedImageUri(result.assets[0].uri);
      }
    }
  };

  const removeImage = () => {
    setSelectedImageUri(null);
    setImageKey(null);
    setImageUrl(null);
  };

  const uploadImageIfNeeded = async (): Promise<boolean> => {
    if (!selectedImageUri) return true;
    if (imageKey && imageUrl) return true;
    setUploadingImage(true);
    try {
      const resized = await resizeImage(selectedImageUri);
      const base64 = await imageUriToBase64(resized);
      const res = await supabase.functions.invoke('r2-upload', {
        body: { image_base64: base64 },
      });
      let uploadResult = res.data;
      const uploadError = res.error;
      if (uploadError) {
        setError(`Error al subir la imagen: ${uploadError.message}`);
        setUploadingImage(false);
        return false;
      }
      if (typeof uploadResult === 'string') {
        try { uploadResult = JSON.parse(uploadResult); } catch {}
      }
      if (!uploadResult?.key || !uploadResult?.url) {
        setError('Respuesta inválida del servidor de imágenes.');
        setUploadingImage(false);
        return false;
      }
      setImageKey(uploadResult.key);
      setImageUrl(uploadResult.url);
    } catch {
      setError('La imagen no se pudo subir por un problema temporal.');
      setUploadingImage(false);
      return false;
    }
    setUploadingImage(false);
    return true;
  };

  const validate = (): string | null => {
    const tit = titulo.trim();
    if (!tit) return 'Rellena el titulo de la votacion.';
    for (let i = 0; i < opciones.length; i++) {
      if (!opciones[i].trim()) return `Rellena la opcion ${i + 1}.`;
    }
    if (opciones.length < MIN_OPTIONS) return 'Debe haber al menos dos opciones.';
    return null;
  };

  const handleSelectParticipants = async () => {
    if (!(await checkOnline())) {
      Alert.alert(t('offline'), t('offlineCannotCreate'));
      return;
    }
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    const ok = await uploadImageIfNeeded();
    if (!ok) return;
    const tit = titulo.trim();
    setFormData({
      titulo,
      opciones: opciones.map((x) => x.trim()),
      multiopcion,
      imagenKey: imageKey,
      imagenUrl: imageUrl,
      skipContacts: false,
    });
    router.push('/create-encuesta/contacts' as any);
  };

  const handleOpenSurvey = async () => {
    if (!(await checkOnline())) {
      Alert.alert(t('offline'), t('offlineCannotCreate'));
      return;
    }
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    const ok = await uploadImageIfNeeded();
    if (!ok) return;

    setSaving(true);
    const tit = titulo.trim();
    const trimmedOps = opciones.map((x) => x.trim());
    const linkUuid = randomUUID();

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
      p_phones_participantes: [],
      p_imagen_key: imageKey,
      p_imagen_url: imageUrl,
      p_abierta: true,
      p_link_uuid: linkUuid,
    });

    if (rpcError) {
      setSaving(false);
      console.log('[createEncuesta] RPC error:', JSON.stringify(rpcError));
      const msg = rpcError.message;
      if (msg.includes('min_dos_opciones')) setError('Necesitas al menos dos opciones con texto.');
      else if (msg.includes('titulo_vacio')) setError('El titulo no puede estar vacio.');
      else if (msg.includes('profile_phone_missing') || msg.includes('profile_nick_missing'))
        setError('Completa tu perfil (telefono y nick) antes de crear encuestas.');
      else if (msg.includes('not_authenticated')) setError('Sesion no valida. Vuelve a iniciar sesion.');
      else setError(`Ha ocurrido un error inesperado: ${msg}`);
      return;
    }

    if (!data) {
      setSaving(false);
      setError(t('error'));
      return;
    }

    clear();
    await incrementCounter();

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const profile = await fetchProfile(currentUser.id);
      const cached = await loadCache();
      if (cached) {
        const newEncuesta = {
          id: data,
          titulo: tit,
          owner: profile?.phone || '',
          owner_nick: profile?.nick || '',
          finalizada: false,
          votantes: 1,
          multiopcion,
          personas_a_votar: 0,
          personas_votadas: 0,
          created_at: new Date().toISOString(),
          finalizada_at: null,
        };
        cached.encuestas.unshift(newEncuesta);
        cached.votedIds ??= [];
        cached.leidas ??= [];
        cached.ownerAvatars ??= {};
        await saveCache(cached);
        const { data: opcionesData } = await supabase
          .from('encuestas_opciones')
          .select('id, opcion_texto, total_votos')
          .eq('id_encuesta', data);
        if (opcionesData?.length) {
          setDetailCache(data, {
            encuesta: newEncuesta,
            opciones: opcionesData,
            haVotado: false,
            votantes: [],
          });
        }
      }
    }

    router.replace(`/create-encuesta/share?linkUuid=${linkUuid}&titulo=${encodeURIComponent(tit)}`);
  };

  const handleGroupSubmit = async () => {
    if (!(await checkOnline())) {
      Alert.alert(t('offline'), t('offlineCannotCreate'));
      return;
    }
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    const ok = await uploadImageIfNeeded();
    if (!ok) return;

    setSaving(true);
    const tit = titulo.trim();
    const trimmedOps = opciones.map((x) => x.trim());
    const phones = selected.map((c) => c.phone?.replace(/\s+/g, '') || '');

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
      p_imagen_key: imageKey,
      p_imagen_url: imageUrl,
      p_abierta: false,
      p_link_uuid: null,
    });

    if (rpcError) {
      setSaving(false);
      console.log('[createEncuesta] RPC error (group):', JSON.stringify(rpcError));
      const msg = rpcError.message;
      if (msg.includes('min_dos_opciones')) setError('Necesitas al menos dos opciones con texto.');
      else if (msg.includes('titulo_vacio')) setError('El titulo no puede estar vacio.');
      else if (msg.includes('profile_phone_missing') || msg.includes('profile_nick_missing'))
        setError('Completa tu perfil (telefono y nick) antes de crear encuestas.');
      else if (msg.includes('not_authenticated')) setError('Sesion no valida. Vuelve a iniciar sesion.');
      else setError(`Ha ocurrido un error inesperado: ${msg}`);
      return;
    }

    if (!data) {
      setSaving(false);
      setError(t('error'));
      return;
    }

    clear();
    await incrementCounter();

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const profile = await fetchProfile(currentUser.id);
      const cached = await loadCache();
      if (cached) {
        const newEncuesta = {
          id: data,
          titulo: tit,
          owner: profile?.phone || '',
          owner_nick: profile?.nick || '',
          finalizada: false,
          votantes: selected.length + 1,
          multiopcion,
          personas_a_votar: selected.length + 1,
          personas_votadas: 0,
          created_at: new Date().toISOString(),
          finalizada_at: null,
        };
        cached.encuestas.unshift(newEncuesta);
        cached.votedIds ??= [];
        cached.leidas ??= [];
        cached.ownerAvatars ??= {};
        await saveCache(cached);
        const { data: opcionesData } = await supabase
          .from('encuestas_opciones')
          .select('id, opcion_texto, total_votos')
          .eq('id_encuesta', data);
        if (opcionesData?.length) {
          setDetailCache(data, {
            encuesta: newEncuesta,
            opciones: opcionesData,
            haVotado: false,
            votantes: [],
          });
        }
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

  const cancel = () => {
    clear();
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
        <Text style={styles.label}>{t('pollTitle')}</Text>
        <TextInput
          style={styles.input}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Ej.: Donde cenamos el viernes"
        />

        {selectedImageUri ? (
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

        {formData.skipContacts || selected.length > 0 ? (
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={cancel} disabled={saving}>
              <Text style={styles.secondaryText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, saving && styles.primaryDisabled]}
              onPress={handleGroupSubmit}
              disabled={saving || uploadingImage}>
              <Text style={styles.primaryText}>{saving ? t('creating') : t('createPoll')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable
                style={styles.primaryOutline}
                onPress={handleSelectParticipants}
                disabled={saving || uploadingImage}>
                <Text style={styles.primaryOutlineText}>{t('selectParticipants')}</Text>
              </Pressable>
              <Pressable
                style={styles.primary}
                onPress={handleOpenSurvey}
                disabled={saving || uploadingImage}>
                <Text style={styles.primaryText}>{saving ? t('creating') : t('openSurvey')}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.cancelBtn} onPress={cancel} disabled={saving}>
              <Text style={styles.secondaryText}>{t('cancel')}</Text>
            </Pressable>
          </>
        )}
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
  primaryText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  primaryOutline: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1F6FEB',
  },
  primaryOutlineText: { color: '#1F6FEB', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#1F6FEB', fontWeight: '600', fontSize: 14 },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCC',
  },
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
  imagePreviewWrap: { alignItems: 'center', gap: 6, width: '100%' },
  imagePreview: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#F0F0F0' },
  imageRemoveText: { color: '#C62828', fontWeight: '600', fontSize: 13 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  uploadingText: { color: '#888', fontSize: 13 },
});
