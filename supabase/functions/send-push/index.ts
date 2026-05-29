import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_API_URL = 'https://exp.host/--/api/v2/push/send';

interface NotificationPayload {
  type: 'new_encuesta' | 'encuesta_finalizada';
  encuesta_id: string;
  titulo: string;
  owner_nick?: string;
  exclude_phone?: string;
}

async function getParticipantPhones(supabase: any, encuestaId: string): Promise<string[]> {
  const { data: encuesta } = await supabase
    .from('encuestas')
    .select('owner')
    .eq('id', encuestaId)
    .single();

  const phones: string[] = [];
  if (encuesta?.owner) phones.push(encuesta.owner);

  const { data: usuarios } = await supabase
    .from('encuestas_usuarios')
    .select('phone_usuario')
    .eq('id_encuesta', encuestaId);

  if (usuarios) {
    for (const u of usuarios) {
      phones.push(u.phone_usuario);
    }
  }

  return [...new Set(phones)];
}

serve(async (req) => {
  try {
    console.log('Request received:', req.method);

    if (req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', message: 'send-push function is running' }), { status: 200 });
    }

    const payload: NotificationPayload = await req.json();
    console.log('Payload:', JSON.stringify(payload));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const phones = await getParticipantPhones(supabase, payload.encuesta_id);
    console.log('All phones:', JSON.stringify(phones));

    const filteredPhones = payload.exclude_phone
      ? phones.filter((p) => p !== payload.exclude_phone)
      : phones;
    console.log('Filtered phones:', JSON.stringify(filteredPhones));

    if (filteredPhones.length === 0) {
      console.log('No filtered phones, returning');
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .in('phone', filteredPhones);
    console.log('Profiles found:', profiles?.length ?? 0);

    if (!profiles?.length) {
      console.log('No profiles found for phones');
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const userIds = profiles.map((p: any) => p.id);
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);
    console.log('Tokens found:', tokens?.length ?? 0);

    if (!tokens?.length) {
      console.log('No push tokens found');
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    let title: string, body: string;
    if (payload.type === 'new_encuesta') {
      title = 'Nueva encuesta';
      body = `${payload.owner_nick || 'Alguien'} te ha invitado a votar: "${payload.titulo}"`;
    } else {
      title = 'Encuesta finalizada';
      body = `"${payload.titulo}" ha finalizado. ¡Ve los resultados!`;
    }

    const uniqueTokens = [...new Set(tokens.map((t: any) => t.token))];
    console.log('Sending to tokens:', JSON.stringify(uniqueTokens));

    const results = await Promise.allSettled(
      uniqueTokens.map(async (token: string) => {
        const resp = await fetch(EXPO_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: token,
            title,
            body,
            sound: 'default',
            priority: 'high',
            channelId: 'vhorto-notificaciones',
            _android: { channelId: 'vhorto-notificaciones' },
            data: { encuesta_id: payload.encuesta_id, type: payload.type },
          }),
        });
        const text = await resp.text();
        console.log('Expo API response for token', token, ':', resp.status, text);
        return { token, status: resp.status, body: text };
      })
    );

    console.log('All results:', JSON.stringify(results));

    return new Response(JSON.stringify({ sent: uniqueTokens.length }), { status: 200 });
  } catch (err) {
    console.error('Error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
