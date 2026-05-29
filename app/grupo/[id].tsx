import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as Contacts from 'expo-contacts';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Miembro = {
  phone: string;
  nick: string | null;
  avatar_url: string | null;
};

export default function GrupoDetailScreen() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [nombre, setNombre] = useState('');
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: grupo } = await supabase.from('grupos').select('nombre, imagen_url').eq('id', id).single();
    if (grupo) {
      setNombre(grupo.nombre);
      setImagenUrl(grupo.imagen_url);
    }
    const { data: miembrosData } = await supabase.from('grupos_miembros').select('phone, nick').eq('id_grupo', id);
    const phones = miembrosData?.map((m) => m.phone) ?? [];
    const { data: profiles } = await supabase.from('profiles').select('phone, avatar_url').in('phone', phones);
    const avatarMap: Record<string, string | null> = {};
    if (profiles) for (const p of profiles) avatarMap[p.phone] = p.avatar_url ?? null;
    setMiembros((miembrosData ?? []).map((m) => ({ ...m, avatar_url: avatarMap[m.phone] ?? null })));
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const eliminarMiembro = (phone: string) => {
    if (!id) return;
    Alert.alert(t('removeMember'), t('removeMemberText'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          await supabase.from('grupos_miembros').delete().eq('id_grupo', id).eq('phone', phone);
          const { count } = await supabase.from('grupos_miembros').select('*', { count: 'exact', head: true }).eq('id_grupo', id);
          if (count === 0) {
            await supabase.from('grupos').delete().eq('id', id);
            router.back();
          } else {
            void load();
          }
        },
      },
    ]);
  };

  const anyadirContacto = async () => {
    if (!id) return;
    setAdding(true);
    try {
      if (Platform.OS === 'web') { Alert.alert(t('webNotAvailable')); return; }
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert(t('permissionRequired')); return; }
      const { data: allContacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 0,
      });
      const phonesEnGrupo = new Set(miembros.map((m) => m.phone));
      const disponibles = allContacts.filter((c) => {
        const nums = c.phoneNumbers;
        if (!nums?.length) return false;
        const name = c.name?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
        for (const pn of nums) {
          const raw = pn.number ?? pn.digits ?? '';
          const phone = normalizeContactPhone(raw);
          if (phone.replace(/\D/g, '').length >= 8 && !phonesEnGrupo.has(phone)) return true;
        }
        return false;
      });
      if (disponibles.length === 0) { Alert.alert(t('noNewContacts')); return; }

      const opciones = disponibles.slice(0, 20).map((c) => {
        const name = c.name?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
        return { text: name, onPress: async () => {
          const nums = c.phoneNumbers!;
          for (const pn of nums) {
            const raw = pn.number ?? pn.digits ?? '';
            const phone = normalizeContactPhone(raw);
            if (phone.replace(/\D/g, '').length >= 8 && !phonesEnGrupo.has(phone)) {
              const { data: prof } = await supabase.from('profiles').select('nick').eq('phone', phone).maybeSingle();
              await supabase.from('grupos_miembros').insert({ id_grupo: id, phone, nick: prof?.nick ?? null });
              void load();
              return;
            }
          }
        }};
      });
      opciones.push({ text: t('cancel') } as any);
      Alert.alert(t('addMember'), t('selectContact'), opciones as any);
    } finally {
      setAdding(false);
    }
  };

  const borrarGrupo = () => {
    if (!id) return;
    Alert.alert(t('deleteGroup'), 'Se borrara el grupo y todos sus miembros.', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteAlert'), style: 'destructive', onPress: async () => {
        await supabase.from('grupos').delete().eq('id', id);
        router.back();
      }},
    ]);
  };

  if (loading) {
    return <View style={[styles.container, styles.centered]}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {imagenUrl ? (
          <Image source={{ uri: imagenUrl }} style={styles.headerImage} />
        ) : (
          <View style={[styles.headerImage, styles.headerPlaceholder]}>
            <Text style={styles.headerInitial}>{nombre[0].toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.headerTitle}>{nombre}</Text>
        <Text style={styles.headerCount}>{miembros.length} {miembros.length !== 1 ? t('members') : t('member')}</Text>
      </View>

      <FlatList
        data={miembros}
        keyExtractor={(m) => m.phone}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.miembroRow}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.miembroAvatar} />
            ) : (
              <View style={[styles.miembroAvatar, styles.miembroAvatarPlaceholder]}>
                <MaterialIcons name="person" size={24} color="#FFF" />
              </View>
            )}
            <View style={styles.miembroText}>
              <Text style={styles.miembroNombre}>{item.nick || item.phone}</Text>
              {item.nick && <Text style={styles.miembroPhone}>{item.phone}</Text>}
            </View>
            <Pressable onPress={() => eliminarMiembro(item.phone)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={styles.actions}>
        <Pressable style={styles.addBtn} onPress={anyadirContacto} disabled={adding}>
          <Text style={styles.addBtnText}>{adding ? t('searching') : t('addMember')}</Text>
        </Pressable>
        <Pressable style={styles.deleteGroupBtn} onPress={borrarGrupo}>
          <Text style={styles.deleteGroupBtnText}>{t('deleteGroup')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  headerImage: { width: 72, height: 72, borderRadius: 36, marginBottom: 8 },
  headerPlaceholder: { backgroundColor: '#1F6FEB', alignItems: 'center', justifyContent: 'center' },
  headerInitial: { color: '#FFF', fontSize: 28, fontWeight: '700' },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerCount: { fontSize: 14, color: '#666', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  miembroRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, padding: 12, backgroundColor: '#FAFAFA' },
  miembroAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  miembroAvatarPlaceholder: { backgroundColor: '#1F6FEB', alignItems: 'center', justifyContent: 'center' },
  miembroAvatarInitial: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  miembroText: { flex: 1 },
  miembroNombre: { fontSize: 16, fontWeight: '600' },
  miembroPhone: { fontSize: 13, color: '#888', marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 20 },
  actions: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#E0E0E0' },
  addBtn: { backgroundColor: '#1F6FEB', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
  deleteGroupBtn: { borderWidth: 1, borderColor: '#C62828', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  deleteGroupBtnText: { color: '#C62828', fontWeight: '600', fontSize: 16 },
});
