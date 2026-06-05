import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

serve(async (req) => {
  const secret = Deno.env.get('REPORT_DELETE_SECRET');
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Not configured' }), { status: 500 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const encuesta_id = url.searchParams.get('id');

  if (token !== secret || !encuesta_id) {
    return new Response(JSON.stringify({ error: 'Invalid or missing token/id' }), { status: 403 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase env vars not configured' }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: images } = await supabase
    .from('encuesta_imagenes')
    .select('r2_key')
    .eq('id_encuesta', encuesta_id);

  if (images) {
    for (const img of images) {
      supabase.functions.invoke('r2-delete', { body: { key: img.r2_key } }).catch(() => {});
    }
  }

  const { error } = await supabase.from('encuestas').delete().eq('id', encuesta_id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response('Encuesta borrada OK', { status: 200 });
});
