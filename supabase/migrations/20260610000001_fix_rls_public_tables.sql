-- Fix: enable RLS on encuestas_votos and app_config
-- Supabase detected these as "Table publicly accessible" vulnerabilities

-- ===== encuestas_votos =====
alter table public.encuestas_votos enable row level security;

drop policy if exists "encuestas_votos_select_authenticated" on public.encuestas_votos;
create policy "encuestas_votos_select_authenticated"
on public.encuestas_votos
for select
to authenticated
using (true);

-- ===== app_config =====
-- Before enabling RLS, drop any previous disable if exists
-- (the old migration 20260606000001 may have disabled it)
alter table public.app_config enable row level security;

drop policy if exists "app_config_select_public" on public.app_config;
create policy "app_config_select_public"
on public.app_config
for select
to anon, authenticated
using (true);
