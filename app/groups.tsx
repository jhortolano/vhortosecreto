import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { fetchProfile, isProfileComplete } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useCreateEncuesta, type EncuestaContactPick } from '@/context/createEncuestaContext';
import { savePushToken } from '@/lib/notifications';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { useT } from '@/lib/i18n';

type Encuesta = {
  id: string;
  titulo: string;
  owner: string;
  owner_nick: string;
  finalizada: boolean;
  votantes: number;
  multiopcion: boolean;
  personas_a_votar: number;
  personas_votadas: number;
  created_at: string;
  finalizada_at: string | null;
};

type Tab = 'activas' | 'grupos' | 'votadas' | 'finalizadas';

type Grupo = {
  id: string;
  nombre: string;
  imagen_url: string | null;
};

export default function GroupsScreen() {
  const { t } = useT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: Tab }>();
  const [encuestas, setEncuestas] = useState<Encuesta[]>([]);
  const [votedEncuestaIds, setVotedEncuestaIds] = useState<Set<string>>(new Set());
  const [leidas, setLeidas] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userNick, setUserNick] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [ownerAvatars, setOwnerAvatars] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || 'activas');
  const mountedRef = useRef(true);

  useEffect(() => {
    router.setParams({ tab });
  }, [tab]);

  const headerTitle = useMemo(() => {
    const map: Record<Tab, string> = {
      activas: t('headerActive'),
      grupos: t('headerGroups'),
      votadas: t('headerVoted'),
      finalizadas: t('headerFinished'),
    };
    return map[tab];
  }, [tab, t]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerCenter}>
          <Text style={styles.headerAppName}>{t('appName')}</Text>
          <Text style={styles.headerTabTitle}>{headerTitle}</Text>
        </View>
      ),
      headerRight: () => (
        <Pressable onPress={() => router.push('/profile')}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
              <MaterialIcons name="person" size={20} color="#FFF" />
            </View>
          )}
        </Pressable>
      ),
      headerLeft: () => (
        <Pressable onPress={() => router.push('/create-encuesta')}>
          <View style={styles.headerNewBtn}>
            <MaterialIcons name="add" size={24} color="#FFF" />
          </View>
        </Pressable>
      ),
    });
  }, [navigation, avatarUrl, userNick, headerTitle, t]);

  const loadEncuestas = useCallback(async () => {
    setErrorMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (mountedRef.current) {
        setIsLoading(false);
        router.replace('/');
      }
      return;
    }

    try {
      const profile = await fetchProfile(user.id);
      if (mountedRef.current && profile) {
        setAvatarUrl(profile.avatar_url ?? null);
        setUserNick(profile.nick ?? '');
        setUserPhone(profile.phone ?? '');
      }
      if (!isProfileComplete(profile)) {
        if (mountedRef.current) {
          setIsLoading(false);
          router.replace('/complete-profile');
        }
        return;
      }

      if (mountedRef.current) {
        void savePushToken(user.id);
      }
    } catch (e) {
      if (mountedRef.current) {
        setIsLoading(false);
        setErrorMessage(e instanceof Error ? e.message : 'No se pudo validar el perfil.');
      }
      return;
    }

    const { data, error } = await supabase
      .from('encuestas')
      .select('id, titulo, owner, owner_nick, finalizada, votantes, multiopcion, personas_a_votar, personas_votadas, created_at, finalizada_at')
      .order('created_at', { ascending: false });

    const [haVotadoRes, leidasRes, eliminadasRes] = await Promise.all([
      supabase.from('encuestas_ha_votado').select('id_encuesta').eq('user_id', user.id),
      supabase.from('encuestas_lecturas').select('id_encuesta').eq('user_id', user.id),
      supabase.from('encuestas_eliminadas').select('id_encuesta').eq('user_id', user.id),
    ]);

    const eliminadas = new Set(eliminadasRes.data?.map((e) => e.id_encuesta) ?? []);

    const encuestasFiltradas = (data ?? []).filter((e) => !eliminadas.has(e.id));

    const uniqueOwners = [...new Set(encuestasFiltradas.map((e) => e.owner))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone, avatar_url')
      .in('phone', uniqueOwners);

    const avatarMap: Record<string, string | null> = {};
    if (profiles) {
      for (const p of profiles) avatarMap[p.phone] = p.avatar_url ?? null;
    }

    if (mountedRef.current) {
      setVotedEncuestaIds(new Set(haVotadoRes.data?.map((v) => v.id_encuesta) ?? []));
      setLeidas(new Set(leidasRes.data?.map((l) => l.id_encuesta) ?? []));
      setOwnerAvatars(avatarMap);
      if (!error) setEncuestas(encuestasFiltradas);
      if (error) setErrorMessage(error.message);
      setIsLoading(false);
      void saveCache({
        encuestas: encuestasFiltradas,
        votedIds: haVotadoRes.data?.map((v) => v.id_encuesta) ?? [],
        leidas: leidasRes.data?.map((l) => l.id_encuesta) ?? [],
        ownerAvatars: avatarMap,
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      const cached = await loadCache();
      if (cached && mountedRef.current) {
        setEncuestas(cached.encuestas as Encuesta[]);
        setVotedEncuestaIds(new Set(cached.votedIds));
        setLeidas(new Set(cached.leidas));
        setOwnerAvatars(cached.ownerAvatars);
        if (cached.grupos) setGrupos(cached.grupos);
        setIsLoading(false);
      }
      void loadEncuestas();
    };
    void init();

    const channel = supabase
      .channel(`encuestas_${Date.now()}_${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'encuestas' },
        () => {
          if (mountedRef.current) void loadEncuestas();
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [loadEncuestas]);

  const { setAll } = useCreateEncuesta();

  const crearEncuestaDesdeGrupo = async (grupoId: string) => {
    const { data: miembros } = await supabase.from('grupos_miembros').select('phone, nick').eq('id_grupo', grupoId);
    if (!miembros?.length) return;
    const picks: EncuestaContactPick[] = miembros.map((m, i) => ({
      key: `grupo-${grupoId}-${i}`,
      name: m.nick || m.phone,
      phone: m.phone,
    }));
    setAll(picks);
    router.push('/create-encuesta/form');
  };

  const deleteGrupo = (id: string, nombre: string) => {
    Alert.alert(t('deleteGroup'), `Se borrara "${nombre}".`, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteAlert'), style: 'destructive', onPress: async () => {
        setGrupos((prev) => prev.filter((g) => g.id !== id));
        const cached = await loadCache();
        if (cached && cached.grupos) {
          cached.grupos = cached.grupos.filter((g) => g.id !== id);
          await saveCache(cached);
        }
        await supabase.from('grupos').delete().eq('id', id);
      }},
    ]);
  };

  const deleteEncuesta = (id: string, titulo: string) => {
    Alert.alert(t('deletePoll'), `${t('confirmDeleteText')} "${titulo}"`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteAlert'),
        style: 'destructive',
        onPress: async () => {
          setEncuestas((prev) => prev.filter((e) => e.id !== id));
          const cached = await loadCache();
          if (cached) {
            cached.encuestas = cached.encuestas.filter((e: any) => e.id !== id);
            await saveCache(cached);
          }
          await supabase.from('encuestas').delete().eq('id', id);
        },
      },
    ]);
  };

  const loadGrupos = useCallback(async () => {
    setLoadingGrupos(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoadingGrupos(false); return; }
    const { data } = await supabase.from('grupos').select('id, nombre, imagen_url').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) {
      setGrupos(data);
      const cached = await loadCache();
      if (cached) {
        cached.grupos = data;
        await saveCache(cached);
      }
    }
    setLoadingGrupos(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadProfile = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const profile = await fetchProfile(user.id);
        if (profile) {
          setAvatarUrl(profile.avatar_url ?? null);
          setUserNick(profile.nick ?? '');
          setUserPhone(profile.phone ?? '');
          setOwnerAvatars((prev) => ({ ...prev, [profile.phone ?? '']: profile.avatar_url ?? null }));
        }
      };
      void loadProfile();
      if (tab === 'grupos') void loadGrupos();
      void loadEncuestas();
    }, [tab, loadGrupos, loadEncuestas])
  );

  const markAsRead = async (encuestaId: string) => {
    if (leidas.has(encuestaId)) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setLeidas((prev) => new Set(prev).add(encuestaId));
    await supabase.from('encuestas_lecturas').upsert(
      { id_encuesta: encuestaId, user_id: user.id },
      { onConflict: 'id_encuesta,user_id' }
    );
  };

  const activas = encuestas.filter((e) => !e.finalizada && !votedEncuestaIds.has(e.id));
  const votadas = encuestas.filter((e) => !e.finalizada && votedEncuestaIds.has(e.id));
  const finalizadas = [...encuestas.filter((e) => e.finalizada)].sort((a, b) => {
    const da = a.finalizada_at ?? a.created_at;
    const db = b.finalizada_at ?? b.created_at;
    return db.localeCompare(da);
  });

  const rawList = tab === 'activas' ? activas : tab === 'votadas' ? votadas : finalizadas;
  const q = search.trim().toLowerCase();
  const filtered = q ? rawList.filter((e) => e.titulo.toLowerCase().includes(q)) : rawList;
  const noLeidasCount = finalizadas.filter((e) => !leidas.has(e.id)).length;

  return (
    <View style={styles.container}>
      {tab === 'grupos' ? (
        <>
          <Pressable style={styles.newSurveyBtn} onPress={() => router.push('/crear-grupo')}>
            <MaterialIcons name="add" size={20} color="#FFF" />
            <Text style={styles.newSurveyBtnText}>{t('newGroup')}</Text>
          </Pressable>

          {loadingGrupos && grupos.length === 0 ? (
            <Text style={styles.helper}>{t('loadingGroups')}</Text>
          ) : (
            <FlatList
              data={grupos}
              keyExtractor={(g) => g.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Swipeable
                  overshootRight={false}
                  renderRightActions={() => (
                    <Pressable style={styles.deleteAction} onPress={() => deleteGrupo(item.id, item.nombre)}>
                      <Text style={styles.deleteActionText}>🗑</Text>
                    </Pressable>
                  )}>
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Pressable style={styles.cardHeaderMain} onPress={() => router.push(`/grupo/${item.id}?from=${tab}`)}>
                        {item.imagen_url ? (
                          <Image source={{ uri: item.imagen_url }} style={styles.cardAvatar} />
                        ) : (
                          <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                            <Text style={styles.cardAvatarInitial}>{item.nombre[0].toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.cardTextWrap}>
                          <Text style={styles.cardTitle}>{item.nombre}</Text>
                        </View>
                      </Pressable>
                      <Pressable style={styles.grupoEncuestaBtn} onPress={() => crearEncuestaDesdeGrupo(item.id)}>
                        <MaterialIcons name="how-to-vote" size={22} color="#1F6FEB" />
                        <Text style={styles.grupoEncuestaLabel}>{t('poll')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </Swipeable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>{t('noGroups')}</Text>}
            />
          )}
        </>
      ) : (
        <>
          <Pressable style={styles.newSurveyBtn} onPress={() => router.push('/create-encuesta')}>
            <MaterialIcons name="add" size={20} color="#FFF" />
            <Text style={styles.newSurveyBtnText}>{t('newPoll')}</Text>
          </Pressable>

          <TextInput
            style={styles.search}
            placeholder={t('searchPolls')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          {isLoading ? (
            <Text style={styles.helper}>{t('loadingPolls')}</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isUnread = item.finalizada && !leidas.has(item.id);
                const canDelete = item.owner === userPhone;
                return (
                  <Swipeable
                    overshootRight={false}
                    renderRightActions={() =>
                      canDelete ? (
                        <Pressable
                          style={styles.deleteAction}
                          onPress={() => deleteEncuesta(item.id, item.titulo)}>
                          <Text style={styles.deleteActionText}>🗑</Text>
                        </Pressable>
                      ) : null
                    }>
                    <Pressable
                      style={[styles.card, isUnread && styles.cardUnread]}
                      onPress={() => {
                        if (item.finalizada) markAsRead(item.id);
                        router.push(`/vote/${item.id}?from=${tab}`);
                      }}>
                      <View style={styles.cardHeader}>
                        {ownerAvatars[item.owner] != null ? (
                          <Image source={{ uri: ownerAvatars[item.owner]! }} style={styles.cardAvatar} />
                        ) : (
                          <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                            <MaterialIcons name="person" size={24} color="#FFF" />
                          </View>
                        )}
                        <View style={styles.cardTextWrap}>
                          <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}>{item.titulo}</Text>
                          <Text style={styles.cardMeta}>
                            {item.owner_nick} · {item.personas_votadas}/{item.votantes} {t('votedLabel')}
                            {item.multiopcion ? ` · ${t('multiLabel')}` : ''}
                          </Text>
                        </View>
                        {isUnread && <View style={styles.unreadDot} />}
                      </View>
                    </Pressable>
                  </Swipeable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  {q ? t('noResults') : tab === 'activas' ? t('noPending') : tab === 'votadas' ? t('noVoted') : t('noFinished')}
                </Text>
              }
            />
          )}
        </>
      )}

      {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        <Pressable style={styles.tab} onPress={() => setTab('activas')}>
          <View style={styles.tabIconWrap}>
            <MaterialIcons name="radio-button-unchecked" size={24} color={tab === 'activas' ? '#1F6FEB' : '#888'} />
            {activas.length > 0 && <View style={styles.tabBadgeOver}><Text style={styles.tabBadgeText}>{activas.length}</Text></View>}
          </View>
          <Text style={[styles.tabLabel, tab === 'activas' && styles.tabLabelActive]}>{t('tabActive')}</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('grupos')}>
          <MaterialIcons name="people" size={24} color={tab === 'grupos' ? '#1F6FEB' : '#888'} />
          <Text style={[styles.tabLabel, tab === 'grupos' && styles.tabLabelActive]}>{t('tabGroups')}</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('votadas')}>
          <MaterialIcons name="how-to-vote" size={24} color={tab === 'votadas' ? '#1F6FEB' : '#888'} />
          <Text style={[styles.tabLabel, tab === 'votadas' && styles.tabLabelActive]}>{t('tabVoted')}</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('finalizadas')}>
          <View style={styles.tabIconWrap}>
            <MaterialIcons name="check-circle" size={24} color={tab === 'finalizadas' ? '#1F6FEB' : '#888'} />
            {noLeidasCount > 0 && <View style={[styles.tabBadgeOver, styles.tabBadgeRed]}><Text style={styles.tabBadgeText}>{noLeidasCount}</Text></View>}
          </View>
          <Text style={[styles.tabLabel, tab === 'finalizadas' && styles.tabLabelActive]}>{t('tabFinished')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerNewBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F6FEB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  headerCenter: { alignItems: 'center' },
  headerAppName: { fontSize: 10, color: '#888', letterSpacing: 0.5 },
  headerTabTitle: { fontSize: 17, fontWeight: '700' },
  newSurveyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1F6FEB',
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
  },
  newSurveyBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
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
  headerAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 4 },
  headerAvatarPlaceholder: { backgroundColor: '#1F6FEB', alignItems: 'center', justifyContent: 'center' },
  headerAvatarInitial: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  helper: { color: '#666', textAlign: 'center', marginTop: 24 },
  errorText: { color: '#C62828', textAlign: 'center', marginTop: 12, paddingHorizontal: 16 },
  listContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 10, paddingTop: 4 },
  card: { borderWidth: 1, borderColor: '#E5E5E5', borderRadius: 12, padding: 14, backgroundColor: '#FAFAFA' },
  cardUnread: { borderColor: '#1F6FEB', backgroundColor: '#EAF2FF' },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  cardAvatarPlaceholder: { backgroundColor: '#1F6FEB', alignItems: 'center', justifyContent: 'center' },
  cardAvatarInitial: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cardTextWrap: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '600' },
  cardTitleUnread: { fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1F6FEB', marginLeft: 8 },
  cardMeta: { color: '#666', fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: { fontSize: 11, fontWeight: '500', color: '#888', marginTop: 2 },
  tabLabelActive: { color: '#1F6FEB', fontWeight: '600' },
  tabIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  tabBadgeOver: { position: 'absolute', top: -6, right: -10, backgroundColor: '#1F6FEB', borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeRed: { backgroundColor: '#C62828' },
  tabBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  tabUnderline: { position: 'absolute', top: 0, left: 8, right: 8, height: 3, backgroundColor: '#1F6FEB', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  cardHeaderMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  grupoEncuestaBtn: { alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingVertical: 4, minWidth: 56 },
  grupoEncuestaLabel: { fontSize: 10, color: '#1F6FEB', marginTop: 2, fontWeight: '500' },
  deleteAction: { backgroundColor: '#C62828', justifyContent: 'center', alignItems: 'center', width: 72, marginLeft: 8, borderRadius: 12 },
  deleteActionText: { fontSize: 22 },
});
