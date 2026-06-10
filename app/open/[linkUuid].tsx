import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { setDetailCache } from '@/lib/encuestaDetailCache';

export default function OpenVoteScreen() {
  const { t } = useT();
  const { linkUuid } = useLocalSearchParams<{ linkUuid: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!linkUuid) {
      setError(t('openSurveyLinkInvalid'));
      return;
    }
    (async () => {
      console.log('[open-vote] Resolving linkUuid:', linkUuid);
      const { data, error: rpcErr } = await supabase
        .rpc('get_encuesta_by_link', { p_link_uuid: linkUuid });
      console.log('[open-vote] RPC result:', JSON.stringify({ data, error: rpcErr }));
      if (rpcErr || !data || data.length === 0) {
        setError(t('openSurveyLinkInvalid'));
        return;
      }
      const enc = data[0];

      const [opsResult, imgResult] = await Promise.all([
        supabase.rpc('get_encuesta_opciones', { p_id_encuesta: enc.id }),
        supabase.rpc('get_encuesta_imagen', { p_id_encuesta: enc.id }),
      ]);

      const opciones = (opsResult.data ?? []).map((o: any) => ({ id: o.id, opcion_texto: o.opcion_texto, total_votos: o.total_votos }));
      const haVotado = false;

      await setDetailCache(enc.id, {
        encuesta: {
          id: enc.id,
          titulo: enc.titulo,
          owner: enc.owner,
          owner_nick: enc.owner_nick,
          finalizada: enc.finalizada,
          multiopcion: enc.multiopcion,
          votantes: enc.votantes ?? 1,
          personas_votadas: enc.personas_votadas ?? 0,
          abierta: true,
          link_uuid: linkUuid,
        },
        opciones,
        haVotado,
        votantes: [],
      });

      router.replace(`/vote/${enc.id}`);
    })().catch((err) => {
      console.log('[open-vote] Error:', err);
      setError(t('openSurveyLoadError'));
    });
  }, [linkUuid]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1F6FEB" />
      <Text style={styles.loadingText}>{t('loading')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    fontWeight: '700',
    color: '#C62828',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 17,
    color: '#C62828',
    textAlign: 'center',
    lineHeight: 24,
  },
});
