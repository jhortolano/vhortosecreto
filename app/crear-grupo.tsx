import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Image } from 'expo-image';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { useHeaderHeight } from '@react-navigation/elements';
import { router } from 'expo-router';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';
import { checkOnline } from '@/lib/offline';

type ContactPick = {
  key: string;
  name: string;
  phone: string;
};

export default function CrearGrupoScreen() {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<'nombre' | 'miembros' | 'imagen'>('nombre');
  const [nombre, setNombre] = useState('');
  const [selected, setSelected] = useState<ContactPick[]>([]);
  const [imagenUri, setImagenUri] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ContactPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadContacts = async () => {
    if (Platform.OS === 'web') return;
    setLoading(true);
    setError('');

    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      setError(t('contactPermission'));
      setLoading(false);
      return;
    }

    if (Platform.OS === 'ios' && perm.accessPrivileges === 'limited') {
      setError(t('contactPermissioniOS'));
    }

    const { data: allContacts } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      pageSize: 0,
    });

    const flat: ContactPick[] = [];
    for (const c of allContacts) {
      const nums = c.phoneNumbers;
      if (!nums?.length) continue;
      const name = c.name?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
      for (const pn of nums) {
        const raw = pn.number ?? pn.digits ?? '';
        const phone = normalizeContactPhone(raw);
        if (phone.replace(/\D/g, '').length < 8) continue;
        flat.push({ key: `${c.id}-${pn.id ?? pn.label}-${raw}`, name, phone });
      }
    }

    const seen = new Set<string>();
    const unique = flat.filter((r) => { if (seen.has(r.phone)) return false; seen.add(r.phone); return true; });
    unique.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    setRows(unique);
    setLoading(false);
  };

  const goToMiembros = () => {
    if (!nombre.trim()) { setError(t('groupName')); return; }
    setError('');
    setStep('miembros');
    void loadContacts();
  };

  const toggleContact = (c: ContactPick) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.key === c.key);
      return exists ? prev.filter((s) => s.key !== c.key) : [...prev, c];
    });
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError(t('galleryPermission')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) setImagenUri(result.assets[0].uri);
    setStep('imagen');
  };

  const guardar = async () => {
    if (!(await checkOnline())) {
      Alert.alert(t('offline'), t('offlineCannotCreate'));
      return;
    }
    setError('');
    setSaving(true);

    const phones = selected.map((c) => c.phone.replace(/\s+/g, ''));
    let imagenUrl: string | null = null;

    if (imagenUri) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ext = 'jpg';
        const path = `${user.id}/grupos/${Date.now()}.${ext}`;
        const resp = await fetch(imagenUri);
        const buf = await resp.arrayBuffer();
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(path);
          imagenUrl = data.publicUrl;
        }
      }
    }

    const { error: rpcErr } = await supabase.rpc('crear_grupo', {
      p_nombre: nombre.trim(),
      p_phones: phones,
      p_imagen_url: imagenUrl,
    });

    setSaving(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    router.back();
  };

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q);
  });

  if (step === 'nombre') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <View style={styles.container}>
          <Text style={styles.title}>{t('groupName')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('groupNamePlaceholder')}
            value={nombre}
            onChangeText={setNombre}
            autoFocus
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primary} onPress={goToMiembros}><Text style={styles.primaryText}>{t('next')}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'miembros') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <Pressable style={styles.flex} onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            <Text style={styles.title}>{t('selectMembers')}</Text>
            <Text style={styles.count}>{t('selectedCount')} {selected.length}</Text>
            <TextInput
              style={styles.search}
              placeholder={t('search') + '...'}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(i) => i.key}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={styles.list}
                renderItem={({ item }) => {
                  const isOn = selected.some((s) => s.key === item.key);
                  return (
                    <Pressable style={[styles.row, isOn && styles.rowSel]} onPress={() => toggleContact(item)}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowName}>{item.name}</Text>
                        <Text style={styles.rowPhone}>{item.phone}</Text>
                      </View>
                      <Text style={styles.check}>{isOn ? '✓' : ''}</Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>{t('contactsWithPhone')}</Text> : null}
              />
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        </Pressable>
        <View style={styles.footer}>
          <Pressable style={styles.secondary} onPress={() => setStep('nombre')}><Text style={styles.secondaryText}>{t('back')}</Text></Pressable>
          <Pressable style={styles.primary} onPress={pickImage}><Text style={styles.primaryText}>{t('next')}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.container}>
          <Text style={styles.title}>{t('groupImageOptional')}</Text>

          <Pressable onPress={pickImage} style={styles.imagePicker}>
            {imagenUri ? (
              <Image source={{ uri: imagenUri }} style={styles.previewImage} />
            ) : (
              <View style={[styles.previewImage, styles.imagePlaceholder]}>
                <Text style={styles.imagePlaceholderText}>+</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.resumenTitle}>{nombre.trim()}</Text>
          <Text style={styles.resumenCount}>{selected.length} {t('members')}</Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.footer}>
            <Pressable style={styles.secondary} onPress={() => setStep('miembros')}><Text style={styles.secondaryText}>{t('back')}</Text></Pressable>
            <Pressable style={[styles.primary, saving && { opacity: 0.6 }]} disabled={saving} onPress={guardar}>
              <Text style={styles.primaryText}>{saving ? t('saving') : t('createGroup')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.profileInputBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, marginBottom: 16, color: colors.profileInputText, backgroundColor: colors.profileInputBg },
  count: { color: colors.textSecondary, marginBottom: 8 },
  search: { borderWidth: 1, borderColor: colors.profileInputBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 8, color: colors.profileInputText, backgroundColor: colors.profileInputBg },
  list: { paddingBottom: 100 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 8, backgroundColor: colors.cardBg },
  rowSel: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowPhone: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  check: { fontSize: 20, color: colors.primary, width: 28, textAlign: 'right' },
  empty: { textAlign: 'center', color: colors.textTertiary, marginTop: 24 },
  error: { color: colors.errorText, marginBottom: 12 },
  primary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
  primaryText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  secondary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: colors.primary, fontWeight: '600', fontSize: 16 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  imagePicker: { alignItems: 'center', marginBottom: 20 },
  previewImage: { width: 120, height: 120, borderRadius: 60 },
  imagePlaceholder: { backgroundColor: colors.barBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.borderOption, borderStyle: 'dashed' },
  imagePlaceholderText: { fontSize: 40, color: colors.textTertiary },
  resumenTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 4, color: colors.text },
  resumenCount: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  });
}
