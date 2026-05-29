import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { router } from 'expo-router';
import { useCreateEncuesta, type EncuestaContactPick } from '@/context/createEncuestaContext';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { useT } from '@/lib/i18n';

type Row = EncuestaContactPick;

export default function CreateEncuestaContactsScreen() {
  const { t } = useT();
  const headerHeight = useHeaderHeight();
  const { selected, toggle, clear } = useCreateEncuesta();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setRows(unique);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('error'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.phone.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const goForm = () => {
    router.push('/create-encuesta/form');
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
        <Pressable style={styles.secondary} onPress={cancel}>
          <Text style={styles.secondaryText}>{t('cancel')}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={goForm}>
          <Text style={styles.primaryText}>{t('next')}</Text>
        </Pressable>
      </View>
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
  secondary: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#1F6FEB', fontWeight: '600', fontSize: 16 },
});
