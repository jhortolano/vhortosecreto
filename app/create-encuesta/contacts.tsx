import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Contacts from 'expo-contacts';
import { router, useFocusEffect } from 'expo-router';
import { useCreateEncuesta, type EncuestaContactPick } from '@/context/createEncuestaContext';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { supabase } from '@/lib/supabase';
import { needsAd, resetCounter, incrementCounter, markFirstAdDone } from '@/lib/adManager';
import { showRewardedAd } from '@/lib/rewardedAd';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { setDetailCache } from '@/lib/encuestaDetailCache';
import { fetchProfile } from '@/lib/profile';
import { useT } from '@/lib/i18n';
import { checkOnline } from '@/lib/offline';

type Row = EncuestaContactPick;

export default function CreateEncuestaContactsScreen() {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const { selected, toggle, formData, clear } = useCreateEncuesta();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [adLoading, setAdLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadContacts = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        setError(t('webNotAvailable'));
        setRows([]);
        return;
      }

      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setError(t('contactPermission'));
        setRows([]);
        return;
      }
      if (Platform.OS === 'ios' && perm.accessPrivileges === 'limited') {
        setError(t('contactPermissioniOS'));
      }

      let allContacts: Contacts.ExistingContact[] = [];
      if (Platform.OS === 'android') {
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const result = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            pageSize: 500,
            pageOffset: offset,
          });
          allContacts = allContacts.concat(result.data);
          hasMore = result.hasNextPage;
          offset += 500;
        }
      } else {
        const result = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize: 0,
        });
        allContacts = result.data;
      }

      const flat: Row[] = [];
      for (const c of allContacts) {
        const nums = c.phoneNumbers;
        if (!nums?.length) continue;
        const name =
          c.name?.trim() ||
          [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
          'Sin nombre';
        for (const pn of nums) {
          const raw = pn.number ?? pn.digits ?? '';
          const phone = normalizeContactPhone(raw);
          if (phone.replace(/\D/g, '').length < 8) continue;
          flat.push({
            key: `${c.id}-${pn.id ?? pn.label}-${raw}`,
            name,
            phone,
          });
        }
      }

      const seen = new Set<string>();
      const unique = flat.filter((r) => {
        if (seen.has(r.phone)) return false;
        seen.add(r.phone);
        return true;
      });

      unique.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      if (mountedRef.current) setRows(unique);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : t('error'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const crear = async () => {
    if (!(await checkOnline())) {
      Alert.alert(t('offline'), t('offlineCannotCreate'));
      return;
    }
    setError('');

    if (selected.length === 0) {
      setError(t('minParticipants'));
      return;
    }

    const phones = selected.map((contacto) => contacto.phone?.replace(/\s+/g, '') || '');
    for (const phone of phones) {
      if (!/^\+?[0-9]+$/.test(phone)) {
        setError('Alguno de los números de teléfono de los participantes no tiene un formato válido.');
        return;
      }
    }

    setSaving(true);

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
      p_titulo: formData.titulo,
      p_multiopcion: formData.multiopcion,
      p_opciones: formData.opciones,
      p_phones_participantes: phones,
      p_imagen_key: formData.imagenKey,
      p_imagen_url: formData.imagenUrl,
      p_abierta: false,
      p_link_uuid: null,
    });

    if (rpcError) {
      setSaving(false);
      const msg = rpcError.message;
      if (msg.includes('min_dos_opciones')) setError('Necesitas al menos dos opciones con texto.');
      else if (msg.includes('titulo_vacio')) setError('El titulo no puede estar vacio.');
      else if (msg.includes('profile_phone_missing') || msg.includes('profile_nick_missing'))
        setError('Completa tu perfil (telefono y nick) antes de crear encuestas.');
      else if (msg.includes('not_authenticated')) setError('Sesion no valida. Vuelve a iniciar sesion.');
      else setError('Ha ocurrido un error inesperado. Por favor, intentalo de nuevo.');
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
        const newEncuesta = {
          id: data,
          titulo: formData.titulo,
          owner: profile?.phone || '',
          owner_nick: profile?.nick || '',
          finalizada: false,
          votantes: selected.length + 1,
          multiopcion: formData.multiopcion,
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
          titulo: formData.titulo,
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

  const renderItem = ({ item }: { item: Row }) => {
    const isOn = selected.some((s) => s.key === item.key);
    return (
      <Pressable
        style={[styles.row, isOn && styles.rowSelected]}
        onPress={() => toggle(item)}>
        <View style={styles.rowText}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowPhone}>{item.phone}</Text>
        </View>
        <Text style={styles.check}>{isOn ? '✓' : ''}</Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
      <Pressable style={styles.flex} onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.hint}>{t('contactsHint')}</Text>
          <Text style={styles.count}>
            {t('selectedCount')} {selected.length} {selected.length === 1 ? t('contact') : t('contacts')}
          </Text>

          <TextInput
            style={styles.search}
            placeholder={t('searchByName')}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                !error ? <Text style={styles.empty}>{t('contactsWithPhone')}</Text> : null
              }
            />
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </Pressable>

      <View style={styles.footer}>
        <Pressable style={styles.secondary} onPress={cancel} disabled={saving}>
          <Text style={styles.secondaryText}>{t('cancel')}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={crear} disabled={saving || loading}>
          <Text style={styles.primaryText}>{saving ? t('creating') : t('createPoll')}</Text>
        </Pressable>
      </View>

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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  hint: { paddingHorizontal: 16, paddingTop: 8, color: '#555', fontSize: 14 },
  count: { paddingHorizontal: 16, paddingVertical: 6, fontWeight: '600', color: '#222' },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  loader: { marginTop: 24 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  rowSelected: { borderColor: '#1F6FEB', backgroundColor: '#EAF2FF' },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowPhone: { fontSize: 14, color: '#666', marginTop: 2 },
  check: { fontSize: 20, color: '#1F6FEB', width: 28, textAlign: 'right' },
  empty: { textAlign: 'center', color: '#888', marginTop: 24 },
  error: { color: '#C62828', paddingHorizontal: 16, marginBottom: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  primary: {
    flex: 1,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  primaryDisabled: { opacity: 0.6 },
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
});
