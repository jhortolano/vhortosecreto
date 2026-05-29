create extension if not exists "pgcrypto";

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  members_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_text text not null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.votes enable row level security;

drop policy if exists "groups_select_authenticated" on public.groups;
create policy "groups_select_authenticated"
on public.groups
for select
to authenticated
using (true);

drop policy if exists "votes_insert_authenticated" on public.votes;
create policy "votes_insert_authenticated"
on public.votes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "votes_update_own" on public.votes;
create policy "votes_update_own"
on public.votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into public.groups (name, members_count)
values
  ('Familia', 6),
  ('Trabajo', 12),
  ('Amigos', 8)
on conflict (name) do nothing;

-- Perfil de usuario (email viene de auth; teléfono, nick e imagen los completa el usuario)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  nick text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_format check (phone is null or length(trim(phone)) >= 8)
);

create unique index if not exists profiles_phone_unique on public.profiles (phone)
  where phone is not null;

create unique index if not exists profiles_nick_unique on public.profiles (lower(trim(nick)))
  where nick is not null and length(trim(nick)) > 0;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Encuestas: ejecuta supabase/encuestas.sql en el SQL Editor (Supabase no soporta \\ir en el editor web).
