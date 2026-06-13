import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, Animated, FlatList, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { fetchProfile, isProfileComplete } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useCreateEncuesta, type EncuestaContactPick } from '@/context/createEncuestaContext';
import { savePushToken } from '@/lib/notifications';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { ensureImageDownloaded, deleteEncuestaImageCache, getEncuestaImagePath } from '@/lib/encuestaImage';
import { useT } from '@/lib/i18n';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';
import { GlassView } from '@/lib/GlassView';
import { getUserId, getProfileWithCache } from '@/lib/offline';
import { processQueue } from '@/lib/offlineQueue';

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
  abierta: boolean;
  link_uuid: string | null;
};

type Tab = 'activas' | 'grupos' | 'votadas' | 'finalizadas';

type Grupo = {
  id: string;
  nombre: string;
  imagen_url: string | null;
};

const TAB_ORDER: Tab[] = ['activas', 'grupos', 'votadas', 'finalizadas'];

export default function GroupsScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
  const [encuestaImageUris, setEncuestaImageUris] = useState<Record<string, string>>({});
  const [encuestaIdsWithImage, setEncuestaIdsWithImage] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [tab, setTab] = useState<Tab>((tabParam as Tab) || 'activas');
  const [bottomMenuHeight, setBottomMenuHeight] = useState(0);
  const mountedRef = useRef(true);
  const loadingGruposRef = useRef(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    router.setParams({ tab });
  }, [tab]);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  const TAB_INDEX: Record<Tab, number> = { activas: 0, grupos: 1, votadas: 2, finalizadas: 3 };
  const indicAnim = useRef(new Animated.Value(TAB_INDEX[tab])).current;
  const [tabBarWidth, setTabBarWidth] = useState(0);

  const onTabBarLayout = useCallback((e: any) => {
    const w = e.nativeEvent.layout.width;
    setTabBarWidth(w);
    indicAnim.setValue((TAB_INDEX[tab] / TAB_ORDER.length) * w + 4);
  }, [tab, indicAnim]);

  useEffect(() => {
    if (tabBarWidth > 0) {
      const target = (TAB_INDEX[tab] / TAB_ORDER.length) * tabBarWidth + 4;
      Animated.spring(indicAnim, {
        toValue: target,
        useNativeDriver: true,
        damping: 16,
        stiffness: 180,
      }).start();
    }
  }, [tab, tabBarWidth, indicAnim]);

  const headerTitle = useMemo(() => {
    const map: Record<Tab, string> = {
      activas: t('headerActive'),
      grupos: t('headerGroups'),
      votadas: t('headerVoted'),
      finalizadas: t('headerFinished'),
    };
    return map[tab];
  }, [tab, t]);

  const loadEncuestas = useCallback(async () => {
    setErrorMessage('');

    const userId = await getUserId();
    if (!userId) {
      const cached = await loadCache();
      if (mountedRef.current && cached?.encuestas?.length) {
        setIsLoading(false);
        return;
      }
      if (mountedRef.current) {
        setIsLoading(false);
        router.replace('/');
      }
      return;
    }

    const profile = await getProfileWithCache(userId);
    if (mountedRef.current && profile) {
      setAvatarUrl(profile.avatar_url ?? null);
      setUserNick(profile.nick ?? '');
      setUserPhone(profile.phone ?? '');
    }
    if (!profile) {
      const cached = await loadCache();
      if (mountedRef.current && cached?.encuestas?.length) {
        setIsLoading(false);
        return;
      }
      if (mountedRef.current) {
        setIsLoading(false);
        router.replace('/complete-profile');
      }
      return;
    }
    if (!isProfileComplete(profile)) {
      const cached = await loadCache();
      if (mountedRef.current && cached?.encuestas?.length) {
        setIsLoading(false);
        return;
      }
      if (mountedRef.current) {
        setIsLoading(false);
        router.replace('/complete-profile');
      }
      return;
    }

    void savePushToken(userId).catch(() => {});

    try {
      const { data, error } = await supabase
        .from('encuestas')
        .select('id, titulo, owner, owner_nick, finalizada, votantes, multiopcion, personas_a_votar, personas_votadas, created_at, finalizada_at, abierta, link_uuid')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const [haVotadoRes, leidasRes, eliminadasRes] = await Promise.all([
        supabase.from('encuestas_ha_votado').select('id_encuesta').eq('user_id', userId),
        supabase.from('encuestas_lecturas').select('id_encuesta').eq('user_id', userId),
        supabase.from('encuestas_eliminadas').select('id_encuesta').eq('user_id', userId),
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

      let encuestaImagesMap: Record<string, { r2_key: string; r2_url: string }> = {};
      const encuestaIds = encuestasFiltradas.map((e) => e.id);
      if (encuestaIds.length > 0) {
        const { data: imagesData } = await supabase
          .from('encuesta_imagenes')
          .select('id_encuesta, r2_key, r2_url')
          .in('id_encuesta', encuestaIds);
        if (imagesData) {
          const uriMap: Record<string, string> = {};
          const idsWithImage: string[] = [];
          await Promise.all(imagesData.map(async (img) => {
            encuestaImagesMap[img.id_encuesta] = { r2_key: img.r2_key, r2_url: img.r2_url };
            idsWithImage.push(img.id_encuesta);
            const cachedUri = await getEncuestaImagePath(img.r2_key);
            if (cachedUri) uriMap[img.id_encuesta] = cachedUri;
            ensureImageDownloaded(img.r2_key, img.r2_url).then(localUri => {
              if (mountedRef.current && localUri) setEncuestaImageUris(prev => ({ ...prev, [img.id_encuesta]: localUri }));
            }).catch(() => {});
          }));
          if (mountedRef.current) {
            setEncuestaImageUris(uriMap);
            setEncuestaIdsWithImage(new Set(idsWithImage));
          }
        }
      }

      if (mountedRef.current) {
        setVotedEncuestaIds(new Set(haVotadoRes.data?.map((v) => v.id_encuesta) ?? []));
        setLeidas(new Set(leidasRes.data?.map((l) => l.id_encuesta) ?? []));
        setOwnerAvatars(avatarMap);
        setEncuestas(encuestasFiltradas);
        setIsLoading(false);
        setIsOffline(false);
        void saveCache({
          encuestas: encuestasFiltradas,
          votedIds: haVotadoRes.data?.map((v) => v.id_encuesta) ?? [],
          leidas: leidasRes.data?.map((l) => l.id_encuesta) ?? [],
          ownerAvatars: avatarMap,
          encuestaImages: encuestaImagesMap,
          profile,
        });
        void processQueue();
      }
    } catch {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsOffline(true);
        const cached = await loadCache();
        if (cached) {
          setEncuestas(cached.encuestas);
          setVotedEncuestaIds(new Set(cached.votedIds));
          setLeidas(new Set(cached.leidas));
          setOwnerAvatars(cached.ownerAvatars);
          if (cached.grupos) setGrupos(cached.grupos);
        }
      }
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
        if (cached.encuestaImages) {
          const uriMap: Record<string, string> = {};
          const idsWithImage: string[] = [];
          await Promise.all(Object.entries(cached.encuestaImages).map(async ([encId, img]) => {
            idsWithImage.push(encId);
            const localUri = await getEncuestaImagePath(img.r2_key);
            if (localUri) uriMap[encId] = localUri;
          }));
          if (mountedRef.current) {
            setEncuestaImageUris(uriMap);
            setEncuestaIdsWithImage(new Set(idsWithImage));
          }
        }
        setIsLoading(false);
      }
      void loadEncuestas();
      void loadGrupos();
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

  const { setAll, setFormData } = useCreateEncuesta();

  const crearEncuestaDesdeGrupo = async (grupoId: string) => {
    if (isOffline) { Alert.alert(t('offline'), t('offlineCannotCreate')); return; }
    const { data: miembros } = await supabase.from('grupos_miembros').select('phone, nick').eq('id_grupo', grupoId);
    if (!miembros?.length) return;
    const picks: EncuestaContactPick[] = miembros.map((m, i) => ({
      key: `grupo-${grupoId}-${i}`,
      name: m.nick || m.phone,
      phone: m.phone,
    }));
    setAll(picks);
    setFormData({ skipContacts: true });
    router.push('/create-encuesta');
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

  const deleteEncuesta = (id: string, titulo: string, isHide: boolean) => {
    Alert.alert(t('deletePoll'), `${isHide ? t('confirmHideText') : t('confirmDeleteText')} "${titulo}"`, [
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
          if (isHide) {
            const userId = await getUserId();
            if (userId) {
              await supabase.from('encuestas_eliminadas').insert({ id_encuesta: id, user_id: userId });
            }
          } else {
            const { data: imgData } = await supabase
              .from('encuesta_imagenes')
              .select('r2_key')
              .eq('id_encuesta', id)
              .maybeSingle();
            if (imgData?.r2_key) {
              deleteEncuestaImageCache(imgData.r2_key).catch(() => {});
              supabase.functions.invoke('r2-delete', { body: { key: imgData.r2_key } }).catch(() => {});
            }
            await supabase.from('encuestas').delete().eq('id', id);
          }
        },
      },
    ]);
  };

  const loadGrupos = useCallback(async (forceRefresh = false) => {
    if (loadingGruposRef.current) return;
    loadingGruposRef.current = true;

    const userId = await getUserId();
    if (!userId) { loadingGruposRef.current = false; setLoadingGrupos(false); return; }

    if (!forceRefresh) {
      const cached = await loadCache();
      if (cached?.grupos && cached.grupos.length > 0) {
        setGrupos(cached.grupos);
        setLoadingGrupos(false);
      } else {
        setLoadingGrupos(true);
      }
    } else {
      setLoadingGrupos(true);
    }

    const { data } = await supabase.from('grupos').select('id, nombre, imagen_url').eq('user_id', userId).order('created_at', { ascending: false });
    if (data) {
      setGrupos(data);
      const cached = await loadCache();
      if (cached) {
        cached.grupos = data;
        await saveCache(cached);
      }
    }
    setLoadingGrupos(false);
    loadingGruposRef.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      const loadProfile = async () => {
        const userId = await getUserId();
        if (!userId) return;
        const profile = await fetchProfile(userId);
        if (profile) {
          setAvatarUrl(profile.avatar_url ?? null);
          setUserNick(profile.nick ?? '');
          setUserPhone(profile.phone ?? '');
          setOwnerAvatars((prev) => ({ ...prev, [profile.phone ?? '']: profile.avatar_url ?? null }));
        }
      };
      void loadProfile();
      void loadEncuestas();
      if (tab === 'grupos') void loadGrupos(true);
      const poll = setInterval(() => {
        if (tab === 'activas' || tab === 'votadas') void loadEncuestas();
        if (tab === 'grupos') void loadGrupos();
      }, 30000);
      return () => clearInterval(poll);
    }, [tab, loadGrupos, loadEncuestas])
  );

  const markAsRead = async (encuestaId: string) => {
    if (leidas.has(encuestaId)) return;
    const userId = await getUserId();
    if (!userId) return;
    setLeidas((prev) => new Set(prev).add(encuestaId));
    await supabase.from('encuestas_lecturas').upsert(
      { id_encuesta: encuestaId, user_id: userId },
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
      <View style={[styles.customHeader, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => {
            if (isOffline) { Alert.alert(t('offline'), t('offlineCannotCreate')); return; }
            router.push('/create-encuesta');
          }}>
            <View style={styles.headerNewBtn}>
              <MaterialIcons name="add" size={24} color="#FFF" />
            </View>
          </Pressable>
          <Text style={styles.headerAppName}>{t('appName')}</Text>
        </View>

        <Text style={styles.headerTabTitle}>{headerTitle}</Text>

        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.push('/profile')}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatar, styles.headerAvatarPlaceholder]}>
                <MaterialIcons name="person" size={20} color="#FFF" />
              </View>
            )}
          </Pressable>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {isOffline && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={14} color="#FFF" />
          <Text style={styles.offlineBannerText}>{t('offline')}</Text>
        </View>
      )}

      {tab === 'grupos' ? (
        <>
          {loadingGrupos && grupos.length === 0 ? (
            <Text style={styles.helper}>{t('loadingGroups')}</Text>
          ) : (
            <FlatList
              data={grupos}
              keyExtractor={(g) => g.id}
              contentContainerStyle={[styles.listContent, { paddingBottom: (bottomMenuHeight || 150) }]}
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
              contentContainerStyle={[styles.listContent, { paddingBottom: (bottomMenuHeight || 150) }]}
              renderItem={({ item }) => {
                const isUnread = item.finalizada && !leidas.has(item.id);
                const canDelete = item.owner === userPhone;
                const canHide = tab === 'votadas' && !canDelete;
                return (
                  <Swipeable
                    overshootRight={false}
                    renderRightActions={() =>
                      (canDelete || canHide) ? (
                        <Pressable
                          style={styles.deleteAction}
                          onPress={() => deleteEncuesta(item.id, item.titulo, !canDelete)}>
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
                        {encuestaImageUris[item.id] != null ? (
                          <Image source={{ uri: encuestaImageUris[item.id]! }} style={styles.cardAvatar} />
                        ) : encuestaIdsWithImage.has(item.id) ? (
                          <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                            <MaterialIcons name="image" size={24} color="#FFF" />
                          </View>
                        ) : ownerAvatars[item.owner] != null ? (
                          <Image source={{ uri: ownerAvatars[item.owner]! }} style={styles.cardAvatar} />
                        ) : (
                          <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                            <MaterialIcons name="person" size={24} color="#FFF" />
                          </View>
                        )}
                        <View style={styles.cardTextWrap}>
                          <Text style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}>{item.titulo}</Text>
                          <Text style={styles.cardMeta}>
                            {item.owner_nick} · {item.abierta ? `${item.personas_votadas} ${t('votedLabel')}` : `${item.personas_votadas}/${item.votantes} ${t('votedLabel')}`}
                            {item.multiopcion ? ` · ${t('multiLabel')}` : ''}
                            {item.abierta ? ` · ${t('openSurvey')}` : ''}
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

      <GlassView
        onLayout={(e) => setBottomMenuHeight(e.nativeEvent.layout.height)}
        style={[styles.bottomMenu, { paddingBottom: insets.bottom + 8 }]}
      >
        <View style={styles.newSurveySection}>
          <Pressable
            style={styles.newSurveyBtn}
            onPress={() => {
              if (isOffline) { Alert.alert(t('offline'), t('offlineCannotCreate')); return; }
              router.push(tab === 'grupos' ? '/crear-grupo' : '/create-encuesta');
            }}>
            <MaterialIcons name="add" size={20} color="#FFF" />
            <Text style={styles.newSurveyBtnText}>
              {tab === 'grupos' ? t('newGroup') : t('newPoll')}
            </Text>
          </Pressable>
        </View>
        <View style={styles.tabBarDivider} />
        <View style={styles.tabBar} onLayout={onTabBarLayout}>
          {tabBarWidth > 0 && (
            <Animated.View
              style={[
                styles.tabPill,
                {
                  width: tabBarWidth / TAB_ORDER.length - 8,
                  transform: [{ translateX: indicAnim }],
                },
              ]}
            />
          )}
          <Pressable style={styles.tab} onPress={() => setTab('activas')}>
            <View style={styles.tabIconWrap}>
              <MaterialIcons name="radio-button-unchecked" size={24} color={tab === 'activas' ? '#007AFF' : '#8E8E93'} />
              {activas.length > 0 && <View style={styles.tabBadgeOver}><Text style={styles.tabBadgeText}>{activas.length}</Text></View>}
            </View>
            <Text style={[styles.tabLabel, tab === 'activas' && styles.tabLabelActive]}>{t('tabActive')}</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setTab('grupos')}>
            <MaterialIcons name="people" size={24} color={tab === 'grupos' ? '#007AFF' : '#8E8E93'} />
            <Text style={[styles.tabLabel, tab === 'grupos' && styles.tabLabelActive]}>{t('tabGroups')}</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setTab('votadas')}>
            <MaterialIcons name="how-to-vote" size={24} color={tab === 'votadas' ? '#007AFF' : '#8E8E93'} />
            <Text style={[styles.tabLabel, tab === 'votadas' && styles.tabLabelActive]}>{t('tabVoted')}</Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setTab('finalizadas')}>
            <View style={styles.tabIconWrap}>
              <MaterialIcons name="check-circle" size={24} color={tab === 'finalizadas' ? '#007AFF' : '#8E8E93'} />
              {noLeidasCount > 0 && <View style={[styles.tabBadgeOver, styles.tabBadgeRed]}><Text style={styles.tabBadgeText}>{noLeidasCount}</Text></View>}
            </View>
            <Text style={[styles.tabLabel, tab === 'finalizadas' && styles.tabLabelActive]}>{t('tabFinished')}</Text>
          </Pressable>
        </View>
      </GlassView>
    </View>
  );
}

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: { alignItems: 'center', gap: 2 },
    headerNewBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.headerNewBtn,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerAppName: { fontSize: 9, color: colors.headerAppName, letterSpacing: 0.3 },
    headerSpacer: { height: 9 },
    headerTabTitle: { fontSize: 28, fontWeight: '700', flexShrink: 1, textAlign: 'center', color: colors.text },
    newSurveyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginHorizontal: 16,
      marginBottom: 8,
    },
    newSurveySection: {
      marginTop: 8,
    },
    bottomMenu: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
    },
    tabBarDivider: {
      height: 1,
      backgroundColor: colors.tabDivider,
      marginHorizontal: 16,
    },
    tabBar: {
      flexDirection: 'row',
      paddingTop: 6,
      paddingBottom: 4,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    tabPill: {
      position: 'absolute',
      top: 6,
      bottom: 6,
      borderRadius: 24,
      backgroundColor: colors.tabPill,
      borderWidth: 0.5,
      borderColor: colors.tabPillBorder,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1.5 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
    },
    newSurveyBtnText: { color: '#FFF', fontWeight: '600', fontSize: 16 },
    search: {
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.searchBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.background,
    },
    headerAvatar: { width: 36, height: 36, borderRadius: 18 },
    headerAvatarPlaceholder: { backgroundColor: colors.headerAvatarPlaceholder, alignItems: 'center', justifyContent: 'center' },
    headerAvatarInitial: { color: '#FFF', fontSize: 14, fontWeight: '700' },
    helper: { color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
    offlineBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.offlineBanner, paddingVertical: 6 },
    offlineBannerText: { color: colors.offlineBannerText, fontSize: 12, fontWeight: '600' },
    errorText: { color: colors.errorText, textAlign: 'center', marginTop: 12, paddingHorizontal: 16 },
    listContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 10, paddingTop: 4 },
    card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.cardBg },
    cardUnread: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    cardAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    cardAvatarPlaceholder: { backgroundColor: colors.headerAvatarPlaceholder, alignItems: 'center', justifyContent: 'center' },
    cardAvatarInitial: { color: '#FFF', fontSize: 16, fontWeight: '700' },
    cardTextWrap: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
    cardTitleUnread: { fontWeight: '800' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.unreadDot, marginLeft: 8 },
    cardMeta: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    empty: { textAlign: 'center', color: colors.textTertiary, marginTop: 40, fontSize: 15 },
    tabLabel: { fontSize: 12, fontWeight: '500', color: colors.tabInactive, marginTop: 2 },
    tabLabelActive: { color: colors.tabActive, fontWeight: '600' },
    tabIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    tabBadgeOver: { position: 'absolute', top: -6, right: -10, backgroundColor: colors.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    tabBadgeRed: { backgroundColor: colors.badgeRed },
    tabBadgeText: { color: colors.badgeText, fontSize: 11, fontWeight: '700' },
    cardHeaderMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    grupoEncuestaBtn: { alignItems: 'center', justifyContent: 'center', paddingLeft: 12, paddingVertical: 4, minWidth: 56 },
    grupoEncuestaLabel: { fontSize: 10, color: colors.primary, marginTop: 2, fontWeight: '500' },
    deleteAction: { backgroundColor: colors.deleteBg, justifyContent: 'center', alignItems: 'center', width: 72, marginLeft: 8, borderRadius: 12 },
    deleteActionText: { fontSize: 22 },
  });
}
