import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/useThemeColors';
import { lightColors } from '@/constants/colors';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { setDetailCache } from '@/lib/encuestaDetailCache';
import { ensureImageDownloaded } from '@/lib/encuestaImage';

export default function OpenVoteScreen() {
  const { t } = useT();
  const { linkUuid } = useLocalSearchParams<{ linkUuid: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!linkUuid) {
      setError(t('openSurveyLinkInvalid'));
      return;
    }
    (async () => {
      const { data, error: rpcErr } = await supabase
        .rpc('get_encuesta_by_link', { p_link_uuid: linkUuid });
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

      let imagenR2Key: string | null = null;
      let imagenR2Url: string | null = null;
      let imagenLocalUri: string | null = null;
      const imgRow = imgResult.data?.[0];
      if (imgRow) {
        imagenR2Key = imgRow.r2_key;
        imagenR2Url = imgRow.r2_url;
        try {
          imagenLocalUri = await ensureImageDownloaded(imgRow.r2_key, imgRow.r2_url);
        } catch {}
      }

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
          imagenLocalUri,
          imagenR2Key,
          imagenR2Url,
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

function createStyles(colors: typeof lightColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.errorText,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 17,
    color: colors.errorText,
    textAlign: 'center',
    lineHeight: 24,
  },
  });
}
