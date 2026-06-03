import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TEST_PASSWORD = 'test1234';

serve(async (req) => {
  try {
    if (req.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const { email } = await req.json();
    console.log('create-test-user called for:', email);

    if (!email || !email.endsWith('@test.com')) {
      return new Response(JSON.stringify({ error: 'Email no válido' }), { status: 400 });
    }

    const nick = email.split('@')[0];
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Try to create the user - will fail if already exists
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (createError) {
      // User likely already exists - update password and check profile
      console.log('Create failed (user probably exists):', createError.message);

      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const existing = users?.users?.find((u: any) => u.email === email);
      if (!existing) {
        return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), { status: 500 });
      }

      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD });

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', existing.id)
        .maybeSingle();

      if (!profile) {
        const phone = `+34${Math.floor(100000000 + Math.random() * 900000000)}`;
        await supabaseAdmin.from('profiles').insert({ id: existing.id, email, phone, nick });
      }
    } else if (newUser?.user) {
      // New user created - create profile
      const phone = `+34${Math.floor(100000000 + Math.random() * 900000000)}`;
      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: newUser.user.id,
        email,
        phone,
        nick,
      });
      if (profileError) {
        console.error('Profile error:', profileError.message);
      }
    }

    return new Response(JSON.stringify({ email, password: TEST_PASSWORD }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('create-test-user error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
