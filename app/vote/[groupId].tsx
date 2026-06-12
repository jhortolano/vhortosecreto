import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image as RNImage, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProfile } from '@/lib/profile';
import { Image } from 'expo-image';
import * as Contacts from 'expo-contacts';
import { router, useLocalSearchParams } from 'expo-router';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { ensureImageDownloaded, deleteEncuestaImageCache } from '@/lib/encuestaImage';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { getDetailCache, setDetailCache } from '@/lib/encuestaDetailCache';
import { getUserId } from '@/lib/offline';
import { addToQueue } from '@/lib/offlineQueue';
import QrDisplay from '@/lib/QrDisplay';

type Encuesta = {
  id: string;
  titulo: string;
  owner: string;
  owner_nick: string;
  finalizada: boolean;
  multiopcion: boolean;
  votantes: number;
  personas_votadas: number;
  abierta: boolean;
  link_uuid: string | null;
};

type Opcion = {
  id: string;
  opcion_texto: string;
  total_votos: number;
};

type Votante = {
  phone_usuario: string;
  nick_usuario: string | null;
  avatar_url: string | null;
  haVotado: boolean;
};

export default function VoteScreen() {
  const { t } = useT();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [encuesta, setEncuesta] = useState<Encuesta | null>(null);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [haVotado, setHaVotado] = useState(false);
  const [esOwner, setEsOwner] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [votantes, setVotantes] = useState<Votante[]>([]);
  const [showVotantes, setShowVotantes] = useState(false);
  const [votantesLoading, setVotantesLoading] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedAvatar, setExpandedAvatar] = useState<string | null>(null);
  const [encuestaImageUri, setEncuestaImageUri] = useState<string | null>(null);
  const [encuestaImageSize, setEncuestaImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [voteConfirmation, setVoteConfirmation] = useState<string[] | null>(null);

  useEffect(() => {
    const doNetworkLoad = async () => {
      if (!groupId) return null;
      const { data: e, error: eErr } = await supabase
        .from('encuestas')
        .select('id, titulo, owner, owner_nick, finalizada, multiopcion, votantes, personas_votadas, abierta, link_uuid')
        .eq('id', groupId)
        .single();
      if (eErr || !e) return null;

      const userId = await getUserId();
      if (userId) {
        const profile = await fetchProfile(userId);
        setEsOwner(profile?.phone === e.owner);
      }

      const [opsResult, votedResult, imgResult] = await Promise.all([
        supabase.from('encuestas_opciones').select('id, opcion_texto, total_votos').eq('id_encuesta', groupId),
        userId ? supabase.from('encuestas_ha_votado').select('id_encuesta').eq('id_encuesta', groupId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('encuesta_imagenes').select('r2_key, r2_url').eq('id_encuesta', groupId).maybeSingle(),
      ]);

      const ops = opsResult.data ?? [];
      const haVotadoActual = !!votedResult.data;

      let sorted = ops;
      if (e.finalizada) {
        sorted = [...ops].sort((a, b) => b.total_votos - a.total_votos || a.opcion_texto.localeCompare(b.opcion_texto));
      }

      let imagenLocalUri: string | null = null;
      let imagenR2Key: string | null = null;
      let imagenR2Url: string | null = null;
      let imgData = imgResult.data as { r2_key: string; r2_url: string } | null;
      // RLS blocks direct query for open surveys, fall back to security-definer RPC
      if (!imgData) {
        const { data: rpcImg } = await supabase.rpc('get_encuesta_imagen', { p_id_encuesta: groupId });
        imgData = (rpcImg as { r2_key: string; r2_url: string }[] | null)?.[0] ?? null;
      }
      if (imgData) {
        imagenR2Key = imgData.r2_key;
        imagenR2Url = imgData.r2_url;
        try {
          imagenLocalUri = await ensureImageDownloaded(imgData.r2_key, imgData.r2_url);
          setEncuestaImageUri(imagenLocalUri);
          RNImage.getSize(imagenLocalUri, (w, h) => setEncuestaImageSize({ width: w, height: h }), () => {});
        } catch {
          setImageError(true);
        }
      }

      void fetchVotantesData(e, haVotadoActual, sorted);

      return { encuesta: { ...e, imagenLocalUri, imagenR2Key, imagenR2Url }, opciones: sorted, haVotado: haVotadoActual, votantes: [] };
    };

    const load = async () => {
      if (!groupId) return;
      setIsLoading(true);
      setErrorMessage('');
      setImageError(false);

      const cached = await getDetailCache(groupId);
      if (cached) {
        setEncuesta(cached.encuesta);
        setOpciones(cached.opciones);
        setHaVotado(cached.haVotado);
        if (cached.encuesta?.imagenLocalUri) {
          setEncuestaImageUri(cached.encuesta.imagenLocalUri);
          RNImage.getSize(cached.encuesta.imagenLocalUri, (w, h) => setEncuestaImageSize({ width: w, height: h }), () => {});
        } else if (cached.encuesta?.imagenR2Key && cached.encuesta?.imagenR2Url) {
          ensureImageDownloaded(cached.encuesta.imagenR2Key, cached.encuesta.imagenR2Url).then((localUri) => {
            setEncuestaImageUri(localUri);
            RNImage.getSize(localUri, (w, h) => setEncuestaImageSize({ width: w, height: h }), () => {});
          }).catch(() => setImageError(true));
        }
        if (cached.votantes?.length) {
          setVotantes(cached.votantes);
        }
        setIsLoading(false);
      }

      try {
        const fresh = await doNetworkLoad();
        if (!fresh) {
          if (!cached) setErrorMessage(t('pollNotFound'));
          return;
        }
        setEncuesta(fresh.encuesta);
        setOpciones(fresh.opciones);
        setHaVotado(fresh.haVotado);
        // Preserve image data from cache if network returns null (RLS blocks for open surveys)
        if (cached?.encuesta?.imagenLocalUri && !fresh.encuesta.imagenLocalUri) {
          fresh.encuesta.imagenLocalUri = cached.encuesta.imagenLocalUri;
          fresh.encuesta.imagenR2Key = cached.encuesta.imagenR2Key;
          fresh.encuesta.imagenR2Url = cached.encuesta.imagenR2Url;
          setEncuestaImageUri(cached.encuesta.imagenLocalUri);
        }
        setDetailCache(groupId, fresh);
      } catch (e) {
        if (!cached) setErrorMessage(e instanceof Error ? e.message : t('error'));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [groupId]);

  const loadContactNames = async () => {
    if (Platform.OS === 'web') return;
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') return;

    const { data } = await Contacts.getContactsAsync({
      pageSize: 5000,
      pageOffset: 0,
    });

    const map: Record<string, string> = {};
    for (const c of data) {
      const name = c.name?.trim();
      if (!name) continue;
      const nums = c.phoneNumbers;
      if (!nums?.length) continue;
      for (const pn of nums) {
        const raw = pn.number ?? pn.digits ?? '';
        const phone = normalizeContactPhone(raw);
        if (phone && !map[phone]) map[phone] = name;
      }
    }
    setContactNames(map);
  };

  const toggleOption = (id: string) => {
    if (encuesta?.finalizada) return;
    setSuccessMessage('');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (encuesta?.multiopcion) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        if (next.has(id) && next.size === 1) {
          next.clear();
        } else {
          next.clear();
          next.add(id);
        }
      }
      return next;
    });
  };

  const submitVote = async () => {
    if (!groupId || selectedIds.size === 0) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsSaving(true);

    const { error } = await supabase.rpc('votar_encuesta', {
      p_id_encuesta: groupId,
      p_opcion_ids: Array.from(selectedIds),
    });

    if (error) {
      const isNetwork = !error.code || error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed to');
      if (isNetwork) {
        await addToQueue({
          type: 'vote',
          data: { groupId, selectedOptionIds: Array.from(selectedIds) },
        });
        const mainCache = await loadCache();
        if (mainCache && !mainCache.votedIds.includes(groupId)) {
          mainCache.votedIds.push(groupId);
          await saveCache(mainCache);
        }
        setDetailCache(groupId, {
          encuesta, opciones, haVotado: true,
          votantes: [],
        });
        setHaVotado(true);
        setIsSaving(false);
        setVoteConfirmation(opciones.filter((o) => selectedIds.has(o.id)).map((o) => o.opcion_texto));
        return;
      }
      setIsSaving(false);
      setErrorMessage(error.message);
      return;
    }

    setIsSaving(false);
    setHaVotado(true);
    setVoteConfirmation(opciones.filter((o) => selectedIds.has(o.id)).map((o) => o.opcion_texto));

    const { data: e } = await supabase
      .from('encuestas')
      .select('id, titulo, owner, owner_nick, finalizada, multiopcion, votantes, personas_votadas, abierta, link_uuid')
      .eq('id', groupId)
      .single();

    if (e) {
      setEncuesta(e);
      setDetailCache(groupId, { encuesta: e, opciones, haVotado: true, votantes: [] });

      const mainCache = await loadCache();
      if (mainCache) {
        const idx = mainCache.encuestas.findIndex((x: any) => x.id === groupId);
        if (idx !== -1) {
          mainCache.encuestas[idx] = { ...mainCache.encuestas[idx], ...e };
          await saveCache(mainCache);
        }
      }
    }

    if (e?.finalizada) {
      const userId = await getUserId();
      if (userId) {
        await supabase.from('encuestas_lecturas').upsert(
          { id_encuesta: e.id, user_id: userId },
          { onConflict: 'id_encuesta,user_id' }
        );
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', userId ?? '')
        .single();
      supabase.functions.invoke('send-push', {
        body: {
          type: 'encuesta_finalizada',
          encuesta_id: e.id,
          titulo: e.titulo,
          exclude_phone: profile?.phone || undefined,
        },
      }).catch(() => {});
    }
  };

  const toggleVotantes = () => {
    setShowVotantes(prev => !prev);
  };

  const handleShareLink = async () => {
    if (!encuesta?.link_uuid) return;
    const link = `https://vhortosecreto.vercel.app/open/${encuesta.link_uuid}`;
    try {
      await Share.share({ message: `${encuesta.titulo}\n\n${link}` });
    } catch {}
  };

  const handleCopyLink = async () => {
    if (!encuesta?.link_uuid) return;
    await Clipboard.setStringAsync(`https://vhortosecreto.vercel.app/open/${encuesta.link_uuid}`);
    setSuccessMessage(t('linkCopied'));
  };

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(''), 2500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const fetchVotantesData = async (encuestaData?: Encuesta, haVotadoActual?: boolean, opcionesData?: any[]) => {
    const enc = encuestaData ?? encuesta;
    const hv = haVotadoActual ?? haVotado;
    const ops = opcionesData ?? opciones;
    if (!groupId || !enc) return;
    setVotantesLoading(true);

    let list: Votante[] = [];

    if (enc.abierta) {
      const { data: votedData } = await supabase
        .rpc('get_encuesta_votantes', { p_id_encuesta: groupId });
      const rows = (votedData as { phone: string | null; nick: string | null }[] | null) ?? [];
      const phoneRows = rows.filter(r => r.phone);
      const webRows = rows.filter(r => r.nick && !r.phone);
      const phoneSet = new Set(phoneRows.map(v => v.phone));
      if (phoneSet.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('phone, nick, avatar_url')
          .in('phone', Array.from(phoneSet));
        list = (profiles ?? []).map(p => ({
          phone_usuario: p.phone,
          nick_usuario: p.nick,
          avatar_url: p.avatar_url,
          haVotado: true,
        }));
      }
      for (const w of webRows) {
        if (!list.some(v => v.phone_usuario === w.nick)) {
          list.push({ phone_usuario: w.nick!, nick_usuario: w.nick, avatar_url: null, haVotado: true });
        }
      }
    } else {
      const { data, error } = await supabase
        .from('encuestas_usuarios')
        .select('phone_usuario, nick_usuario')
        .eq('id_encuesta', groupId)
        .order('nick_usuario', { ascending: true });
      list = (data ?? []).map((v) => ({ ...v, avatar_url: null, haVotado: false }));
      if (!error && enc && !list.some((v) => v.phone_usuario === enc.owner)) {
        list = [{ phone_usuario: enc.owner, nick_usuario: enc.owner_nick, avatar_url: null, haVotado: false }, ...list];
      }

      const shouldShowVoters = hv || enc?.finalizada;
      if (shouldShowVoters) {
        const { data: votedPhonesData } = await supabase
          .rpc('get_encuesta_votantes', { p_id_encuesta: groupId });
        const votedPhones = new Set((votedPhonesData as { phone: string | null }[] | null)?.map(v => v.phone).filter(Boolean) ?? []);
        if (votedPhones.size > 0) {
          list = list.map(v => ({ ...v, haVotado: votedPhones.has(v.phone_usuario) }));
        }
      }
    }

    const phones = list.map((v) => v.phone_usuario);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('phone, avatar_url')
      .in('phone', phones);
    if (profiles) {
      const avatarMap = Object.fromEntries(profiles.map((p) => [p.phone, p.avatar_url]));
      list = list.map((v) => ({ ...v, avatar_url: avatarMap[v.phone_usuario] ?? null }));
    }
    setVotantes(list);
    setVotantesLoading(false);
    setDetailCache(groupId, {
      encuesta: enc,
      opciones: ops,
      haVotado: hv,
      votantes: list.map(v => ({ phone_usuario: v.phone_usuario, nick_usuario: v.nick_usuario ?? null, avatar_url: v.avatar_url ?? null, haVotado: v.haVotado })),
    });
    if (Object.keys(contactNames).length === 0) {
      await loadContactNames();
    }
  };

  const handleReport = () => {
    Alert.alert(t('reportConfirmTitle'), `${t('reportContentWarning')}\n\n${t('reportFakeWarning')}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('reportPoll'),
        style: 'destructive',
        onPress: async () => {
          if (!groupId) return;
          try {
            await supabase.from('encuestas').update({ reportada: true }).eq('id', groupId);
            const userId = await getUserId();
            if (userId) {
              await supabase.from('encuestas_reportes').insert({ id_encuesta: groupId, user_id: userId });
              await supabase.from('encuestas_eliminadas').insert({ id_encuesta: groupId, user_id: userId });
              supabase.functions.invoke('send-report-email', { body: { encuesta_id: groupId, reported_by_user_id: userId } }).catch(() => {});
            }
            const cached = await loadCache();
            if (cached) {
              cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
              await saveCache(cached);
            }
            setSuccessMessage(t('reportSent'));
            Alert.alert(t('reportPoll'), t('reportSent'), [
              {
                text: t('done'),
                onPress: () => router.replace('/groups'),
              },
            ]);
          } catch {
            setErrorMessage(t('error'));
          }
        },
      },
    ]);
  };

  const displayName = (v: Votante) => {
    if (v.nick_usuario) return v.nick_usuario;
    const contactName = contactNames[v.phone_usuario];
    if (contactName) return contactName;
    return v.phone_usuario;
  };

  const hasVoted = haVotado;
  const showVoteUI = encuesta && !encuesta.finalizada && !hasVoted;
  const canShowResults = encuesta?.finalizada || !hasVoted || ((encuesta?.personas_votadas ?? 0) >= 4 && ((encuesta?.personas_votadas ?? 0) / (encuesta?.votantes ?? 1)) >= 0.7);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
        <Text style={styles.helper}>{t('loadingPoll')}</Text>
      </View>
    );
  }

  if (!encuesta) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorMessage}>{errorMessage || t('pollNotFound')}</Text>
      </View>
    );
  }

  const totalVotos = opciones.reduce((sum, o) => sum + o.total_votos, 0);
  const maxVotos = encuesta.finalizada ? Math.max(...opciones.map(o => o.total_votos), 0) : 0;

  if (voteConfirmation) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.container, styles.centered]}>
          <View style={styles.confirmationIcon}>
            <MaterialIcons name="check-circle" size={64} color="#0F8A3E" />
          </View>
          <Text style={styles.confirmationTitle}>{t('voteRegistered')}</Text>
          <Text style={styles.confirmationVoted}>
            {t('youVoted')} {voteConfirmation.join(', ')}
          </Text>
          <Text style={styles.confirmationSecret}>{t('voteIsSecret')}</Text>
          <Pressable style={styles.confirmationCloseBtn} onPress={() => router.replace('/groups')}>
            <Text style={styles.confirmationCloseBtnText}>{t('close')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{encuesta.titulo}</Text>
          <Text style={[styles.statusBadge, encuesta.finalizada ? styles.statusClosed : styles.statusOpen]}>
            {encuesta.finalizada ? t('statusFinished') : t('statusActive')}
          </Text>
        </View>

        <Text style={styles.meta}>
          {t('createdBy')} {encuesta.owner_nick} · {encuesta.abierta ? `${encuesta.personas_votadas} ${t('voters')}${encuesta.personas_votadas !== 1 ? 's' : ''}` : `${encuesta.votantes} ${t('voters')}${encuesta.votantes !== 1 ? 's' : ''}`}
          {encuesta.multiopcion ? ` · ${t('multioption')}` : ''}
          {encuesta.abierta ? ` · ${t('openSurvey')}` : ''}
        </Text>

        {encuesta.abierta && encuesta.link_uuid && (
          <View style={styles.shareLinkRow}>
            <Pressable style={styles.shareLinkBtn} onPress={handleCopyLink}>
              <MaterialIcons name="content-copy" size={16} color="#1F6FEB" />
              <Text style={styles.shareLinkBtnText}>{t('copyLink')}</Text>
            </Pressable>
            <Pressable style={styles.shareLinkBtn} onPress={() => setShowQr(true)}>
              <MaterialIcons name="qr-code" size={16} color="#1F6FEB" />
              <Text style={styles.shareLinkBtnText}>QR</Text>
            </Pressable>
            <Pressable style={styles.shareLinkBtn} onPress={handleShareLink}>
              <MaterialIcons name="share" size={16} color="#1F6FEB" />
              <Text style={styles.shareLinkBtnText}>{t('share')}</Text>
            </Pressable>
          </View>
        )}

          <Pressable style={styles.votantesToggle} onPress={toggleVotantes}>
            <Text style={styles.votantesToggleText}>
              {showVotantes ? t('hideParticipants') : t('viewParticipants')}
            </Text>
            <Text style={styles.votantesArrow}>{showVotantes ? '▲' : '▼'}</Text>
          </Pressable>

        {showVotantes && (
          <View style={styles.votantesList}>
            {votantesLoading ? (
              <Text style={styles.votantesLoading}>{t('loadingParticipants')}</Text>
            ) : votantes.length === 0 ? (
              <Text style={styles.votantesEmpty}>{t('noParticipants')}</Text>
            ) : !encuesta.abierta && hasVoted && !encuesta.finalizada ? (
              <>
                <Text style={styles.votantesSectionTitle}>{t('pendingVoters')}</Text>
                {votantes.filter((v) => !v.haVotado).length === 0 ? (
                  <Text style={styles.votantesEmpty}>{t('allHaveVoted')}</Text>
                ) : (
                  votantes.filter((v) => !v.haVotado).map((v) => (
                    <View key={v.phone_usuario} style={styles.votantesRow}>
                      <Pressable onPress={() => { if (v.avatar_url) setExpandedAvatar(v.avatar_url); }}>
                        {v.avatar_url ? (
                          <Image source={{ uri: v.avatar_url }} style={styles.votantesAvatar} />
                        ) : (
                          <View style={[styles.votantesAvatar, styles.votantesAvatarPlaceholder]}>
                            <MaterialIcons name="person" size={22} color="#FFF" />
                          </View>
                        )}
                      </Pressable>
                      <Text style={styles.votantesNick}>{displayName(v)}</Text>
                    </View>
                  ))
                )}
                <Text style={styles.votantesSectionTitle}>{t('completedVoters')}</Text>
                {votantes.filter((v) => v.haVotado).map((v) => (
                  <View key={v.phone_usuario} style={styles.votantesRow}>
                    <Pressable onPress={() => { if (v.avatar_url) setExpandedAvatar(v.avatar_url); }}>
                      {v.avatar_url ? (
                        <Image source={{ uri: v.avatar_url }} style={styles.votantesAvatar} />
                      ) : (
                        <View style={[styles.votantesAvatar, styles.votantesAvatarPlaceholder]}>
                          <MaterialIcons name="person" size={22} color="#FFF" />
                        </View>
                      )}
                    </Pressable>
                    <Text style={styles.votantesNick}>{displayName(v)}</Text>
                  </View>
                ))}
              </>
            ) : (
              votantes.map((v) => (
                <View key={v.phone_usuario} style={styles.votantesRow}>
                  <Pressable onPress={() => { if (v.avatar_url) setExpandedAvatar(v.avatar_url); }}>
                    {v.avatar_url ? (
                      <Image source={{ uri: v.avatar_url }} style={styles.votantesAvatar} />
                    ) : (
                      <View style={[styles.votantesAvatar, styles.votantesAvatarPlaceholder]}>
                        <MaterialIcons name="person" size={22} color="#FFF" />
                      </View>
                    )}
                  </Pressable>
                  <Text style={styles.votantesNick}>{displayName(v)}</Text>
                </View>
              ))
            )}
          </View>
        )}

          {encuestaImageUri && (
            <Image
              source={{ uri: encuestaImageUri }}
              style={[styles.encuestaImage, encuestaImageSize && { aspectRatio: encuestaImageSize.width / encuestaImageSize.height }]}
              contentFit="contain"
            />
          )}
          {imageError && (
            <View style={styles.imageErrorContainer}>
              <MaterialIcons name="image-not-supported" size={32} color="#999" />
              <Text style={styles.imageErrorText}>{t('imageNotAvailable')}</Text>
            </View>
          )}

        {encuesta.finalizada && (
          <Text style={styles.votedNotice}>{t('thisPollClosed')}</Text>
        )}

        {hasVoted && !encuesta.finalizada && !canShowResults && (
          <View style={styles.hiddenNotice}>
            <Text style={styles.hiddenNoticeText}>{t('votesHidden')}</Text>
          </View>
        )}

        <View style={styles.optionsContainer}>
          {opciones.map((op) => {
            const isSelected = selectedIds.has(op.id);
            const isWinner = encuesta.finalizada && op.total_votos > 0 && op.total_votos === maxVotos;
            const pct = totalVotos > 0 ? Math.round((op.total_votos / totalVotos) * 100) : 0;
            return (
              <Pressable
                key={op.id}
                style={[
                  styles.option,
                  isSelected && styles.optionSelected,
                  isWinner && styles.optionWinner,
                  showVoteUI && styles.optionPressable,
                  !showVoteUI && styles.optionDisabled,
                ]}
                onPress={() => toggleOption(op.id)}
                disabled={!showVoteUI}>
                <View style={styles.optionContent}>
                  <View style={styles.optionTextRow}>
                    {showVoteUI && (
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    )}
                    <View style={styles.optionHeaderRow}>
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected, !showVoteUI && styles.optionTextDisabled]}>
                        {op.opcion_texto}
                      </Text>
                      {isWinner && encuesta.finalizada && (
                        <View style={styles.winnerBadge}>
                          <Text style={styles.winnerBadgeText}>{t('winner')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {!showVoteUI && (
          <View style={styles.insightsContainer}>
            {esOwner && encuesta?.abierta && !encuesta.finalizada && (
              <View style={styles.openOwnerBanner}>
                <MaterialIcons name="info-outline" size={20} color="#E65100" />
                <Text style={styles.openOwnerBannerText}>
                  Esta es una encuesta abierta. Debes finalizarla de forma manual para mostrar los resultados.
                </Text>
              </View>
            )}
            {(() => {
              const sorted = [...opciones].sort((a, b) => b.total_votos - a.total_votos);
              const first = sorted[0];
              const second = sorted[1];
              const third = sorted[2];
              const sinVotos = opciones.filter(o => o.total_votos === 0);
              const numOps = opciones.length;
              const cards: { icon: string; title: string; text: string }[] = [];

              if (first && second && first.total_votos > second.total_votos) {
                const diffPct = Math.round(((first.total_votos - second.total_votos) / second.total_votos) * 100);
                let text: string;
                if (diffPct >= 100) text = 'La opción líder tiene bastante más apoyo que las demás.';
                else if (diffPct >= 50) text = 'La opción líder va claramente por delante.';
                else if (diffPct >= 25) text = 'La opción líder tiene una ventaja notable sobre las demás.';
                else if (diffPct >= 10) text = 'La opción líder tiene una ligera ventaja sobre las demás.';
                else text = 'No hay una diferencia significativa entre las opciones.';
                cards.push({
                  icon: 'trending-up',
                  title: 'Tendencia actual',
                  text,
                });
              }

              if (sinVotos.length > 0) {
                cards.push({
                  icon: 'help-outline',
                  title: 'Sin votos',
                  text: `Actualmente hay ${sinVotos.length === 1 ? 'una opción que aún no ha recibido ningún voto' : `${sinVotos.length} opciones que aún no han recibido ningún voto`}.`,
                });
              }

              if (numOps >= 3) {
                const spread = first.total_votos - third.total_votos;
                const midGap = second.total_votos - third.total_votos;
                const totalV = totalVotos;
                const pctFirst = totalV > 0 ? (first.total_votos / totalV) * 100 : 0;

                if (first.total_votos >= third.total_votos * 2) {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'La distancia entre la primera y la última opción es considerable.',
                  });
                } else if (spread <= 1 && first.total_votos > third.total_votos) {
                  cards.push({
                    icon: 'whatshot',
                    title: 'Hito',
                    text: 'Las primeras opciones están muy igualadas.',
                  });
                } else if (second.total_votos === third.total_votos && spread > 1) {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'Hay un empate entre la segunda y tercera opción.',
                  });
                } else if (pctFirst < 35) {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'Ninguna opción acapara la mayoría, cualquiera puede ganar.',
                  });
                } else if (midGap >= 2 && spread > 2) {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'Hay una diferencia notable entre la segunda y tercera opción.',
                  });
                } else if (second.total_votos > third.total_votos && first.total_votos > second.total_votos + 1) {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'Se empieza a dibujar una clara jerarquía entre las opciones.',
                  });
                } else {
                  cards.push({
                    icon: 'auto-awesome',
                    title: 'Hito',
                    text: 'Los votos están bastante repartidos entre las opciones.',
                  });
                }
              }

              return cards.length > 0 ? (
                <View style={styles.insightsInner}>
                  <Text style={styles.insightsTitle}>Tendencias</Text>
                  {cards.map((card, i) => (
                    <View key={i} style={styles.insightCard}>
                      <MaterialIcons name={card.icon as any} size={22} color="#1F6FEB" />
                      <View style={styles.insightTextWrap}>
                        <Text style={styles.insightCardTitle}>{card.title}</Text>
                        <Text style={styles.insightCardText}>{card.text}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null;
            })()}
          </View>
        )}

        {showVoteUI && (
          <Pressable
            style={[styles.voteButton, (selectedIds.size === 0 || isSaving) && styles.voteButtonDisabled]}
            disabled={selectedIds.size === 0 || isSaving}
            onPress={submitVote}>
            <Text style={styles.voteButtonText}>
              {isSaving ? t('saving') : t('submitVote')}
            </Text>
          </Pressable>
        )}

        {!encuesta.finalizada && !haVotado && esOwner && encuesta.personas_votadas === 0 && (
          <Pressable
            style={styles.finalizadaDeleteButton}
            onPress={() => {
              Alert.alert(t('deletePoll'), t('confirmDeleteText'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!groupId) return;
                    setIsDeleting(true);
                    const { data: imgData } = await supabase
                      .from('encuesta_imagenes')
                      .select('r2_key')
                      .eq('id_encuesta', groupId)
                      .maybeSingle();
                    if (imgData?.r2_key) {
                      deleteEncuestaImageCache(imgData.r2_key).catch(() => {});
                      supabase.functions.invoke('r2-delete', { body: { key: imgData.r2_key } }).catch(() => {});
                    }
                    const { error } = await supabase.from('encuestas').delete().eq('id', groupId);
                    setIsDeleting(false);
                    if (error) { setErrorMessage(error.message); return; }
                    const cached = await loadCache();
                    if (cached) {
                      cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                      await saveCache(cached);
                    }
                    router.replace('/groups');
                  },
                },
              ]);
            }}>
            <Text style={styles.finalizadaDeleteButtonText}>{t('deletePoll')}</Text>
          </Pressable>
        )}

        {!encuesta.finalizada && !haVotado && !(esOwner && encuesta.personas_votadas === 0) && (
          <Pressable
            style={styles.leaveButton}
            onPress={() => {
              Alert.alert(t('leavePoll'), t('leavePollText'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('exit'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!groupId) return;
                    const { error } = await supabase.rpc('salir_encuesta', { p_id_encuesta: groupId });
                    if (error) {
                      const isNetwork = !error.code || error.message?.includes('fetch') || error.message?.includes('network');
                      if (isNetwork) {
                        await addToQueue({ type: 'salir_encuesta', data: { groupId } });
                        const cached = await loadCache();
                        if (cached) {
                          cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                          await saveCache(cached);
                        }
                        router.replace('/groups');
                        return;
                      }
                      setErrorMessage(error.message);
                      return;
                    }
                    const cached = await loadCache();
                    if (cached) {
                      cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                      await saveCache(cached);
                    }
                    router.replace('/groups');
                  },
                },
              ]);
            }}>
            <Text style={styles.leaveButtonText}>{t('leavePoll')}</Text>
          </Pressable>
        )}

        {hasVoted && esOwner && !encuesta.finalizada && (
          <Pressable
            style={styles.finalizeButton}
            onPress={() => {
              Alert.alert(t('finalizePoll'), t('finalizePollConfirm'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('finalizePoll'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!groupId) return;
                    const { error } = await supabase.rpc('finalizar_encuesta_parcial', { p_id_encuesta: groupId });
                    if (error) { setErrorMessage(error.message); return; }
                    const cached = await loadCache();
                    if (cached) {
                      cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                      await saveCache(cached);
                    }
                    const userId = await getUserId();
                    const { data: profile } = await supabase
                      .from('profiles')
                      .select('phone')
                      .eq('id', userId ?? '')
                      .single();
                    supabase.functions.invoke('send-push', {
                      body: {
                        type: 'encuesta_finalizada',
                        encuesta_id: groupId,
                        titulo: encuesta?.titulo || '',
                        exclude_phone: profile?.phone || undefined,
                      },
                    }).catch(() => {});
                    router.replace('/groups');
                  },
                },
              ]);
            }}>
            <Text style={styles.finalizeButtonText}>{t('finalizePoll')}</Text>
          </Pressable>
        )}

        {encuesta.finalizada && (
          <Pressable
            style={[styles.finalizadaDeleteButton, isDeleting && styles.deleteButtonDisabled]}
            disabled={isDeleting}
            onPress={() => {
              Alert.alert(t('deletePoll'), t('confirmDeleteText'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete'),
                  style: 'destructive',
                  onPress: async () => {
                    if (!groupId) return;
                    setIsDeleting(true);
                    const { data: imgData } = await supabase
                      .from('encuesta_imagenes')
                      .select('r2_key')
                      .eq('id_encuesta', groupId)
                      .maybeSingle();
                    const r2Key = imgData?.r2_key;
                    console.log('[delete] r2Key found:', !!r2Key);
                    const { error: rpcError } = await supabase.rpc('eliminar_encuesta_finalizada', { p_id_encuesta: groupId });
                    console.log('[delete] rpcError:', rpcError?.message);
                    if (!rpcError && r2Key) {
                      const { data: stillExists } = await supabase
                        .from('encuestas')
                        .select('id')
                        .eq('id', groupId)
                        .maybeSingle();
                      console.log('[delete] encuesta still exists:', !!stillExists);
                      if (!stillExists) {
                        console.log('[delete] deleting R2 image');
                        deleteEncuestaImageCache(r2Key).catch(() => {});
                        supabase.functions.invoke('r2-delete', { body: { key: r2Key } }).catch(() => {});
                      }
                    }
                    setIsDeleting(false);
                    const cached = await loadCache();
                    if (cached) {
                      cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                      await saveCache(cached);
                    }
                    router.replace('/groups');
                  },
                },
              ]);
            }}>
            <Text style={styles.finalizadaDeleteButtonText}>
              {isDeleting ? t('eliminating') : t('deletePoll')}
            </Text>
          </Pressable>
        )}

        {hasVoted && !encuesta.finalizada && !canShowResults && (
          <Pressable
            style={[styles.finalizadaDeleteButton, isDeleting && styles.deleteButtonDisabled]}
            disabled={isDeleting}
            onPress={() => {
              if (!groupId) return;
              Alert.alert(t('deletePoll'), esOwner ? t('confirmDeleteText') : t('confirmHideText'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete'),
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeleting(true);
                    if (esOwner) {
                      const { data: imgData } = await supabase
                        .from('encuesta_imagenes')
                        .select('r2_key')
                        .eq('id_encuesta', groupId)
                        .maybeSingle();
                      if (imgData?.r2_key) {
                        deleteEncuestaImageCache(imgData.r2_key).catch(() => {});
                        supabase.functions.invoke('r2-delete', { body: { key: imgData.r2_key } }).catch(() => {});
                      }
                      await supabase.from('encuestas').delete().eq('id', groupId);
                    } else {
                      const userId = await getUserId();
                      if (userId) {
                        await supabase.from('encuestas_eliminadas').insert({ id_encuesta: groupId, user_id: userId });
                      }
                    }
                    setIsDeleting(false);
                    const cached = await loadCache();
                    if (cached) {
                      cached.encuestas = cached.encuestas.filter((e: any) => e.id !== groupId);
                      await saveCache(cached);
                    }
                    router.replace('/groups');
                  },
                },
              ]);
            }}>
            <Text style={styles.finalizadaDeleteButtonText}>
              {isDeleting ? t('eliminating') : t('deletePoll')}
            </Text>
          </Pressable>
        )}

        <Pressable style={styles.reportButton} onPress={handleReport}>
          <Text style={styles.reportButtonText}>{t('reportPoll')}</Text>
        </Pressable>

        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </View>
    </ScrollView>

      {!!successMessage && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <MaterialIcons name="check-circle" size={24} color="#0F8A3E" />
            <Text style={styles.toastText}>{successMessage}</Text>
          </View>
        </View>
      )}

      <Modal visible={!!expandedAvatar} transparent animationType="fade" onRequestClose={() => setExpandedAvatar(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setExpandedAvatar(null)}>
          {expandedAvatar && (
            <Image source={{ uri: expandedAvatar }} style={styles.modalImage} contentFit="contain" />
          )}
        </Pressable>
      </Modal>
      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQr(false)}>
          <Pressable style={styles.qrModalBox} onPress={() => {}}>
            <QrDisplay
              value={`https://vhortosecreto.vercel.app/open/${encuesta?.link_uuid ?? ''}`}
              size={200}
            />
            <Text style={styles.qrModalText}>{encuesta?.titulo}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flexGrow: 1,
  },
  helper: {
    marginTop: 12,
    color: '#666',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  meta: {
    color: '#666',
    marginBottom: 16,
    fontSize: 14,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statusOpen: {
    color: '#0F8A3E',
    backgroundColor: '#E6F7EC',
  },
  statusClosed: {
    color: '#C62828',
    backgroundColor: '#FFEBEE',
  },
  votedNotice: {
    color: '#1F6FEB',
    fontWeight: '600',
    marginBottom: 12,
    fontSize: 14,
  },
  hiddenNotice: {
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: '#FFA000',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  hiddenNoticeText: {
    color: '#8D6E00',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  option: {
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 10,
    padding: 14,
  },
  optionDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.75,
  },
  optionPressable: {
    borderColor: '#1F6FEB',
  },
  optionSelected: {
    borderColor: '#1F6FEB',
    backgroundColor: '#EAF2FF',
  },
  optionWinner: {
    borderColor: '#0F8A3E',
    borderWidth: 2,
    backgroundColor: '#F0FFF4',
  },
  optionContent: {
    gap: 8,
  },
  optionTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#1F6FEB',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1F6FEB',
  },
  optionText: {
    fontSize: 16,
    color: '#222',
    flex: 1,
  },
  optionTextSelected: {
    color: '#1244A8',
    fontWeight: '600',
  },
  optionTextDisabled: {
    color: '#999',
  },
  optionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#E8E8E8',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#1F6FEB',
    borderRadius: 3,
  },
  barFillWinner: {
    backgroundColor: '#0F8A3E',
  },
  voteCount: {
    fontSize: 12,
    color: '#888',
    minWidth: 50,
    textAlign: 'right',
  },
  voteCountWinner: {
    color: '#0F8A3E',
    fontWeight: '700',
  },
  winnerBadge: {
    backgroundColor: '#0F8A3E',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  winnerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  insightsContainer: {
    marginBottom: 20,
  },
  openOwnerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: '#FFA000',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  openOwnerBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#8D6E00',
    lineHeight: 18,
    fontWeight: '500',
  },
  insightsInner: {
    gap: 10,
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FAFBFF',
  },
  insightTextWrap: {
    flex: 1,
    gap: 2,
  },
  insightCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F6FEB',
  },
  insightCardText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  voteButton: {
    backgroundColor: '#1F6FEB',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  toastOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  toastBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1B5E20',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  errorText: {
    marginTop: 12,
    color: '#C62828',
    fontWeight: '600',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#C62828',
    fontSize: 16,
  },
  shareLinkRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  shareLinkBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#1F6FEB',
    borderRadius: 10,
  },
  shareLinkBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F6FEB',
  },
  votantesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 10,
    marginBottom: 12,
  },
  votantesToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F6FEB',
  },
  votantesArrow: {
    fontSize: 12,
    color: '#1F6FEB',
  },
  votantesList: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
    gap: 6,
  },
  votantesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  votantesAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  votantesAvatarPlaceholder: {
    backgroundColor: '#1F6FEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  votantesAvatarInitial: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  votantesNick: {
    fontSize: 15,
    color: '#222',
  },
  votantesLoading: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  votantesEmpty: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  votantesSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
    marginTop: 8,
    marginBottom: 4,
  },
  leaveButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFA000',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#FFA000',
    fontWeight: '600',
    fontSize: 16,
  },
  finalizeButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#0F8A3E',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finalizeButtonText: {
    color: '#0F8A3E',
    fontWeight: '600',
    fontSize: 16,
  },
  finalizadaDeleteButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  finalizadaDeleteButtonText: {
    color: '#C62828',
    fontWeight: '600',
    fontSize: 16,
  },
  confirmationIcon: {
    marginBottom: 16,
  },
  confirmationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F8A3E',
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmationVoted: {
    fontSize: 16,
    color: '#222',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmationSecret: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 32,
  },
  confirmationCloseBtn: {
    backgroundColor: '#1F6FEB',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 10,
  },
  confirmationCloseBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: Dimensions.get('window').width * 0.7,
    height: Dimensions.get('window').width * 0.7,
    borderRadius: 16,
  },
  qrModalBox: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  qrModalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  encuestaImage: {
    width: '100%',
    borderRadius: 10,
    marginBottom: 12,
    minHeight: 120,
  },
  imageErrorContainer: {
    width: '100%',
    minHeight: 120,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageErrorText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  reportButton: {
    marginTop: 32,
    alignItems: 'center',
  },
  reportButtonText: {
    color: '#999',
    fontWeight: '400',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
