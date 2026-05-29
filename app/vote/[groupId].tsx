import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { fetchProfile } from '@/lib/profile';
import { Image } from 'expo-image';
import * as Contacts from 'expo-contacts';
import { router, useLocalSearchParams } from 'expo-router';
import { normalizeContactPhone } from '@/lib/phoneNormalize';
import { loadCache, saveCache } from '@/lib/encuestasCache';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Encuesta = {
  id: string;
  titulo: string;
  owner: string;
  owner_nick: string;
  finalizada: boolean;
  multiopcion: boolean;
  votantes: number;
  personas_votadas: number;
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
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!groupId) return;
      setIsLoading(true);
      setErrorMessage('');

      try {
        const { data: e, error: eErr } = await supabase
          .from('encuestas')
          .select('id, titulo, owner, owner_nick, finalizada, multiopcion, votantes, personas_votadas')
          .eq('id', groupId)
          .single();

        if (eErr || !e) {
          setErrorMessage(eErr?.message ?? t('pollNotFound'));
          return;
        }
        setEncuesta(e);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const profile = await fetchProfile(user.id);
          setEsOwner(profile?.phone === e.owner);
        }

        const { data: ops, error: oErr } = await supabase
          .from('encuestas_opciones')
          .select('id, opcion_texto, total_votos')
          .eq('id_encuesta', groupId);

        if (oErr) {
          setErrorMessage(oErr.message);
          return;
        }
        let sorted = ops ?? [];
        if (e.finalizada) {
          sorted.sort((a, b) => b.total_votos - a.total_votos || a.opcion_texto.localeCompare(b.opcion_texto));
        }
        setOpciones(sorted);

        if (user) {
          const { data: voted } = await supabase
            .from('encuestas_ha_votado')
            .select('id_encuesta')
            .eq('id_encuesta', groupId)
            .eq('user_id', user.id)
            .maybeSingle();
          setHaVotado(!!voted);
        }
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : t('error'));
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

    setIsSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setHaVotado(true);
    setSuccessMessage(t('voteRegistered'));

    const { data: ops } = await supabase
      .from('encuestas_opciones')
      .select('id, total_votos')
      .eq('id_encuesta', groupId);

    if (ops) {
      setOpciones((prev) =>
        prev.map((o) => ({
          ...o,
          total_votos: ops.find((r) => r.id === o.id)?.total_votos ?? o.total_votos,
        }))
      );
    }

    const { data: e } = await supabase
      .from('encuestas')
      .select('id, titulo, owner, owner_nick, finalizada, multiopcion, votantes, personas_votadas')
      .eq('id', groupId)
      .single();

    if (e) {
      setEncuesta(e);
      if (e.finalizada) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('encuestas_lecturas').upsert(
            { id_encuesta: e.id, user_id: user.id },
            { onConflict: 'id_encuesta,user_id' }
          );
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user?.id)
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
    }
  };

  const toggleVotantes = async () => {
    if (showVotantes) {
      setShowVotantes(false);
      return;
    }
    if (votantes.length === 0) {
      if (!groupId) return;
      setVotantesLoading(true);
      const { data, error } = await supabase
        .from('encuestas_usuarios')
        .select('phone_usuario, nick_usuario')
        .eq('id_encuesta', groupId)
        .order('nick_usuario', { ascending: true });
      let list: Votante[] = (data ?? []).map((v) => ({ ...v, avatar_url: null }));
      if (!error && encuesta && !list.some((v) => v.phone_usuario === encuesta.owner)) {
        list = [{ phone_usuario: encuesta.owner, nick_usuario: encuesta.owner_nick, avatar_url: null }, ...list];
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
    }
    if (Object.keys(contactNames).length === 0) {
      await loadContactNames();
    }
    setShowVotantes(true);
  };

  const displayName = (v: Votante) => {
    if (v.nick_usuario) return v.nick_usuario;
    const contactName = contactNames[v.phone_usuario];
    if (contactName) return contactName;
    return v.phone_usuario;
  };

  const hasVoted = haVotado;
  const showVoteUI = encuesta && !encuesta.finalizada && !hasVoted;

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
          {t('createdBy')} {encuesta.owner_nick} · {encuesta.votantes} {t('voters')}{encuesta.votantes !== 1 ? 's' : ''}
          {encuesta.multiopcion ? ` · ${t('multioption')}` : ''}
        </Text>

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
            ) : (
              votantes.map((v) => {
                return (
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
                );
              })
            )}
          </View>
        )}

        {encuesta.finalizada && (
          <Text style={styles.votedNotice}>{t('thisPollClosed')}</Text>
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
                      <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                        {op.opcion_texto}
                      </Text>
                      {isWinner && (
                        <View style={styles.winnerBadge}>
                          <Text style={styles.winnerBadgeText}>{t('winner')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {!showVoteUI && (
                    <View style={styles.optionStats}>
                      <View style={styles.barBg}>
                        <View style={[styles.barFill, isWinner && styles.barFillWinner, { width: `${pct}%` }]} />
                      </View>
                      <Text style={[styles.voteCount, isWinner && styles.voteCountWinner]}>{op.total_votos} {op.total_votos !== 1 ? t('votes') : t('vote')}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

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
            <Text style={styles.leaveButtonText}>{t('leavePoll')}</Text>
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
                    const { error } = await supabase.rpc('eliminar_encuesta_finalizada', { p_id_encuesta: groupId });
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
            <Text style={styles.finalizadaDeleteButtonText}>
              {isDeleting ? t('eliminating') : t('deletePoll')}
            </Text>
          </Pressable>
        )}

        {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}
        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </View>
    </ScrollView>

      <Modal visible={!!expandedAvatar} transparent animationType="fade" onRequestClose={() => setExpandedAvatar(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setExpandedAvatar(null)}>
          {expandedAvatar && (
            <Image source={{ uri: expandedAvatar }} style={styles.modalImage} contentFit="contain" />
          )}
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
  successText: {
    marginTop: 14,
    color: '#0F8A3E',
    fontWeight: '600',
    textAlign: 'center',
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
});
