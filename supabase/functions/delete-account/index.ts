import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify token and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401 });
    }

    const userId = user.id;

    // Get user's phone
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('id', userId)
      .single();

    const phone = profile?.phone;

    // 1. Delete encuestas owned by user
    if (phone) {
      const { data: ownedEncuestas } = await supabaseAdmin
        .from('encuestas')
        .select('id')
        .eq('owner', phone);

      if (ownedEncuestas && ownedEncuestas.length > 0) {
        const ids = ownedEncuestas.map(e => e.id);
        await supabaseAdmin.from('encuestas_eliminadas').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas_lecturas').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas_ha_votado').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas_votos').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas_usuarios').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas_opciones').delete().in('id_encuesta', ids);
        await supabaseAdmin.from('encuestas').delete().in('id', ids);
      }

      // 2. Remove user from encuestas_usuarios (participant in others' polls)
      await supabaseAdmin.from('encuestas_usuarios').delete().eq('phone_usuario', phone);

      // 3. Remove user from grupos_miembros
      await supabaseAdmin.from('grupos_miembros').delete().eq('phone', phone);
    }

    // 4. Delete avatar from storage
    const { data: storageFiles } = await supabaseAdmin.storage
      .from('avatars')
      .list(userId);

    if (storageFiles && storageFiles.length > 0) {
      const files = storageFiles
        .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
        .map(f => `${userId}/${f.name}`);
      if (files.length > 0) {
        await supabaseAdmin.storage.from('avatars').remove(files);
      }
    }

    // 5. Delete push_tokens (cascaded, but explicit for safety)
    await supabaseAdmin.from('push_tokens').delete().eq('user_id', userId);

    // 6. Delete grupos (cascades to grupos_miembros)
    await supabaseAdmin.from('grupos').delete().eq('user_id', userId);

    // 7. Delete encuestas_ha_votado, lecturas, eliminadas for this user
    await supabaseAdmin.from('encuestas_ha_votado').delete().eq('user_id', userId);
    await supabaseAdmin.from('encuestas_lecturas').delete().eq('user_id', userId);
    await supabaseAdmin.from('encuestas_eliminadas').delete().eq('user_id', userId);

    // 8. Delete profile
    await supabaseAdmin.from('profiles').delete().eq('id', userId);

    // 9. Delete auth user (this should be last)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
