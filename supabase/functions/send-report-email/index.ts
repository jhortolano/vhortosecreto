import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { SmtpClient } from 'https://deno.land/x/smtp@v0.7.0/mod.ts';

interface ReportPayload {
  encuesta_id: string;
  reported_by_user_id: string;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const smtpHost = Deno.env.get('SMTP_HOST');
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587');
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPass = Deno.env.get('SMTP_PASS');
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL') || 'topfcliga@gmail.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    return new Response(JSON.stringify({ error: 'SMTP env vars not configured' }), { status: 500 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const deleteSecret = Deno.env.get('REPORT_DELETE_SECRET');
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase env vars not configured' }), { status: 500 });
  }

  const supabaseProject = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  const deleteUrl = deleteSecret
    ? `https://${supabaseProject}.supabase.co/functions/v1/report-delete?token=${deleteSecret}&id=${encuesta_id}`
    : null;

  try {
    const { encuesta_id, reported_by_user_id } = await req.json() as ReportPayload;
    console.log('send-report-email called with:', { encuesta_id, reported_by_user_id });

    if (!encuesta_id || !reported_by_user_id) {
      console.error('Missing required fields');
      return new Response(JSON.stringify({ error: 'Missing encuesta_id or reported_by_user_id' }), { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: encuesta, error: encErr } = await supabase
      .from('encuestas')
      .select('*')
      .eq('id', encuesta_id)
      .single();

    if (encErr || !encuesta) {
      console.error('Encuesta not found:', encErr?.message);
      return new Response(JSON.stringify({ error: 'Encuesta not found' }), { status: 404 });
    }
    console.log('Found encuesta:', encuesta.titulo);

    const { data: opciones } = await supabase
      .from('encuestas_opciones')
      .select('opcion_texto, total_votos')
      .eq('id_encuesta', encuesta_id);
    console.log(`Found ${opciones?.length ?? 0} opciones`);

    const { data: participantes } = await supabase
      .from('encuestas_usuarios')
      .select('phone_usuario, nick_usuario')
      .eq('id_encuesta', encuesta_id);

    const { data: imagen } = await supabase
      .from('encuesta_imagenes')
      .select('r2_key')
      .eq('id_encuesta', encuesta_id)
      .maybeSingle();
    const imagenPublicUrl = imagen ? `https://pub-d4bbd152d3b44a2eb2871e942b645a09.r2.dev/${imagen.r2_key}` : null;

    const { data: reporter } = await supabase
      .from('profiles')
      .select('email, phone, nick')
      .eq('id', reported_by_user_id)
      .single();
    console.log('Reporter:', reporter?.email ?? 'unknown');

    let html = `
      <h1>Encuesta Reportada</h1>
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:700px;font-family:sans-serif;">
        <tr><th colspan="2" style="background:#C62828;color:#fff;text-align:center;">Datos del Reporte</th></tr>
        <tr><td><strong>Reportado por</strong></td><td>${reporter?.email ?? '?'} (${reporter?.nick ?? '?'}, tel: ${reporter?.phone ?? '?'})</td></tr>
        <tr><td><strong>ID Usuario</strong></td><td>${reported_by_user_id}</td></tr>
        <tr><td><strong>Fecha reporte</strong></td><td>${new Date().toISOString()}</td></tr>
        <tr><th colspan="2" style="background:#1F6FEB;color:#fff;text-align:center;">Datos de la Encuesta</th></tr>
        <tr><td><strong>ID</strong></td><td>${encuesta.id}</td></tr>
        <tr><td><strong>Título</strong></td><td>${encuesta.titulo}</td></tr>
        <tr><td><strong>Creador</strong></td><td>${encuesta.owner_nick} (${encuesta.owner})</td></tr>
        <tr><td><strong>Finalizada</strong></td><td>${encuesta.finalizada ? 'Sí' : 'No'}</td></tr>
        <tr><td><strong>Votantes</strong></td><td>${encuesta.votantes}</td></tr>
        <tr><td><strong>Han votado</strong></td><td>${encuesta.personas_votadas}</td></tr>
        <tr><td><strong>Multiopción</strong></td><td>${encuesta.multiopcion ? 'Sí' : 'No'}</td></tr>
        <tr><td><strong>Creada</strong></td><td>${encuesta.created_at}</td></tr>
        ${imagenPublicUrl ? `<tr><td><strong>Imagen URL</strong></td><td><a href="${imagenPublicUrl}">${imagenPublicUrl}</a></td></tr>` : ''}
        <tr><th colspan="2" style="background:#333;color:#fff;text-align:center;">Opciones</th></tr>
        ${(opciones ?? []).map((o: any) => `<tr><td>${o.opcion_texto}</td><td>${o.total_votos} votos</td></tr>`).join('')}
        <tr><th colspan="2" style="background:#333;color:#fff;text-align:center;">Participantes</th></tr>
        ${(participantes ?? []).map((p: any) => `<tr><td>${p.nick_usuario ?? '?'}</td><td>${p.phone_usuario}</td></tr>`).join('')}
      </table>
      ${deleteUrl ? `<p style="margin-top:24px;"><a href="${deleteUrl}" style="background:#C62828;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Eliminar esta encuesta</a></p>` : ''}
    `;

    console.log('Sending email via SMTP...');
    const client = new SmtpClient();
    await client.connectTLS({
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
    });
    await client.send({
      from: smtpUser,
      to: notifyEmail,
      subject: `Encuesta reportada: ${encuesta.titulo}`,
      content: 'html',
      html,
    });
    await client.close();
    console.log('Email sent successfully');

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('send-report-email error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { status: 500 });
  }
});
