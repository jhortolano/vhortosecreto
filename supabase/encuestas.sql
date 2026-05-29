-- Ejecutar en Supabase SQL Editor (tablas encuestas + opciones + participantes + RPC + RLS).

create table if not exists public.encuestas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  owner text not null,
  owner_nick text not null,
  finalizada boolean not null default false,
  votantes integer not null check (votantes >= 1),
  multiopcion boolean not null default false,
  personas_a_votar integer not null check (personas_a_votar >= 1),
  personas_votadas integer not null default 0 check (personas_votadas >= 0),
  created_at timestamptz not null default now(),
  constraint encuestas_personas_chk check (personas_votadas <= personas_a_votar)
);

-- añadir columna finalizada_at si no existe (para tablas ya creadas)
alter table public.encuestas add column if not exists finalizada_at timestamptz;

create table if not exists public.encuestas_opciones (
  id uuid primary key default gen_random_uuid(),
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  opcion_texto text not null,
  total_votos integer not null default 0 check (total_votos >= 0)
);

create index if not exists encuestas_opciones_encuesta_idx on public.encuestas_opciones (id_encuesta);

create table if not exists public.encuestas_usuarios (
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  phone_usuario text not null,
  nick_usuario text,
  primary key (id_encuesta, phone_usuario)
);

create index if not exists encuestas_usuarios_phone_idx on public.encuestas_usuarios (phone_usuario);
create index if not exists encuestas_owner_idx on public.encuestas (owner);

alter table public.encuestas enable row level security;
alter table public.encuestas_opciones enable row level security;
alter table public.encuestas_usuarios enable row level security;

-- Funcion helper security definer para evitar recursion en RLS
create or replace function public.is_encuesta_visible(p_id_encuesta uuid, p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.encuestas e
    where e.id = p_id_encuesta
      and (
        e.owner = p_phone
        or exists (
          select 1 from public.encuestas_usuarios eu
          where eu.id_encuesta = e.id and eu.phone_usuario = p_phone
        )
      )
  );
$$;

-- Visibilidad: creador o participante (por telefono en profiles del usuario actual)
drop policy if exists "encuestas_select_participantes" on public.encuestas;
create policy "encuestas_select_participantes"
on public.encuestas
for select
to authenticated
using (
  public.is_encuesta_visible(id, (select p.phone from public.profiles p where p.id = auth.uid()))
);

drop policy if exists "encuestas_update_owner" on public.encuestas;
create policy "encuestas_update_owner"
on public.encuestas
for update
to authenticated
using (owner = (select p.phone from public.profiles p where p.id = auth.uid()))
with check (owner = (select p.phone from public.profiles p where p.id = auth.uid()));

drop policy if exists "encuestas_delete_owner" on public.encuestas;
create policy "encuestas_delete_owner"
on public.encuestas
for delete
to authenticated
using (owner = (select p.phone from public.profiles p where p.id = auth.uid()));

drop policy if exists "encuestas_opciones_select" on public.encuestas_opciones;
create policy "encuestas_opciones_select"
on public.encuestas_opciones
for select
to authenticated
using (
  public.is_encuesta_visible(id_encuesta, (select p.phone from public.profiles p where p.id = auth.uid()))
);

drop policy if exists "encuestas_usuarios_select" on public.encuestas_usuarios;
create policy "encuestas_usuarios_select"
on public.encuestas_usuarios
for select
to authenticated
using (
  public.is_encuesta_visible(id_encuesta, (select p.phone from public.profiles p where p.id = auth.uid()))
);

-- Inserciones solo vía RPC (security definer); no hay políticas INSERT en tablas.

create or replace function public.create_encuesta_bundle(
  p_titulo text,
  p_multiopcion boolean,
  p_opciones text[],
  p_phones_participantes text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_owner_nick text;
  v_uid uuid;
  v_opciones text[];
  v_phones text[];
  v_n_ops int;
  v_n_parts int;
  v_votantes int;
  p_phone text;
  v_nick text;
  i int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select trim(p.phone), trim(p.nick)
  into v_owner, v_owner_nick
  from public.profiles p
  where p.id = auth.uid();

  if v_owner is null or length(v_owner) < 8 then
    raise exception 'profile_phone_missing';
  end if;

  if v_owner_nick is null or length(trim(v_owner_nick)) = 0 then
    raise exception 'profile_nick_missing';
  end if;

  if trim(coalesce(p_titulo, '')) = '' then
    raise exception 'titulo_vacio';
  end if;

  v_opciones := array(
    select trim(x)
    from unnest(coalesce(p_opciones, array[]::text[])) as x
    where trim(coalesce(x, '')) <> ''
  );

  v_n_ops := coalesce(cardinality(v_opciones), 0);
  if v_n_ops < 2 then
    raise exception 'min_dos_opciones';
  end if;

  v_phones := array(
    select distinct trim(x)
    from unnest(coalesce(p_phones_participantes, array[]::text[])) as x
    where trim(coalesce(x, '')) <> ''
  );

  -- Si el participante no tiene prefijo (+), se le añade el del creador
  if cardinality(v_phones) > 0 then
    for i in 1..cardinality(v_phones) loop
      if v_phones[i] not like '+%' then
        v_phones[i] := left(v_owner, length(v_owner) - length(v_phones[i])) || v_phones[i];
      end if;
    end loop;
  end if;

  -- Eliminar duplicados y quitar al creador de la lista de participantes
  v_phones := array(
    select distinct x
    from unnest(v_phones) as x
    where x is distinct from v_owner
  );

  v_n_parts := coalesce(cardinality(v_phones), 0);
  v_votantes := v_n_parts + 1;

  insert into public.encuestas (
    titulo, owner, owner_nick, finalizada, votantes, multiopcion, personas_a_votar, personas_votadas
  )
  values (
    trim(p_titulo),
    v_owner,
    v_owner_nick,
    false,
    v_votantes,
    coalesce(p_multiopcion, false),
    v_votantes,
    0
  )
  returning id into v_uid;

  for i in 1..v_n_ops loop
    insert into public.encuestas_opciones (id_encuesta, opcion_texto, total_votos)
    values (v_uid, v_opciones[i], 0);
  end loop;

  foreach p_phone in array v_phones loop
    select pr.nick into v_nick
    from public.profiles pr
    where pr.phone = p_phone
    limit 1;

    insert into public.encuestas_usuarios (id_encuesta, phone_usuario, nick_usuario)
    values (v_uid, p_phone, v_nick);
  end loop;

  return v_uid;
end;
$$;

grant execute on function public.create_encuesta_bundle(text, boolean, text[], text[]) to authenticated;

-- ============================================================
-- Votos anónimos (sin user_id) + control de quién ha votado
-- ============================================================

drop table if exists public.encuestas_votos cascade;

create table if not exists public.encuestas_votos (
  id uuid primary key default gen_random_uuid(),
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  opcion_id uuid not null references public.encuestas_opciones(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.encuestas_ha_votado (
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (id_encuesta, user_id)
);

alter table public.encuestas_ha_votado enable row level security;

drop policy if exists "encuestas_ha_votado_select_own" on public.encuestas_ha_votado;
create policy "encuestas_ha_votado_select_own"
on public.encuestas_ha_votado
for select
to authenticated
using (user_id = auth.uid());

-- RPC: votar (insertar voto anónimo)
create or replace function public.votar_encuesta(
  p_id_encuesta uuid,
  p_opcion_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_multiopcion boolean;
  v_phone text;
  v_encuesta_finalizada boolean;
  v_already_voted boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select p.phone into v_phone
  from public.profiles p
  where p.id = auth.uid();

  if v_phone is null then
    raise exception 'profile_incomplete';
  end if;

  select e.owner, e.multiopcion, e.finalizada
  into v_owner, v_multiopcion, v_encuesta_finalizada
  from public.encuestas e
  where e.id = p_id_encuesta;

  if v_owner is null then
    raise exception 'encuesta_not_found';
  end if;

  if v_encuesta_finalizada then
    raise exception 'encuesta_finalizada';
  end if;

  if v_owner <> v_phone and not exists (
    select 1 from public.encuestas_usuarios eu
    where eu.id_encuesta = p_id_encuesta and eu.phone_usuario = v_phone
  ) then
    raise exception 'no_autorizado';
  end if;

  if not v_multiopcion and coalesce(cardinality(p_opcion_ids), 0) > 1 then
    raise exception 'solo_un_voto';
  end if;

  -- comprobar si el usuario ya ha votado antes
  select exists(
    select 1 from public.encuestas_ha_votado
    where id_encuesta = p_id_encuesta and user_id = auth.uid()
  ) into v_already_voted;

  -- si no es multiopción y ya votó, rechazar
  if not v_multiopcion and v_already_voted then
    raise exception 'ya_votaste';
  end if;

  -- insertar voto anónimo (sin user_id)
  insert into public.encuestas_votos (id_encuesta, opcion_id)
  select p_id_encuesta, unnest(p_opcion_ids);

  -- actualizar total_votos en opciones
  update public.encuestas_opciones o
  set total_votos = (
    select count(*) from public.encuestas_votos v
    where v.id_encuesta = o.id_encuesta and v.opcion_id = o.id
  )
  where o.id_encuesta = p_id_encuesta;

  -- marcar como votante y contabilizar solo la primera vez
  if not v_already_voted then
    insert into public.encuestas_ha_votado (id_encuesta, user_id)
    values (p_id_encuesta, auth.uid())
    on conflict do nothing;

    update public.encuestas
    set
      personas_votadas = personas_votadas + 1,
      finalizada = case when personas_votadas + 1 >= personas_a_votar then true else finalizada end,
      finalizada_at = case when personas_votadas + 1 >= personas_a_votar then now() else finalizada_at end
    where id = p_id_encuesta and personas_votadas < personas_a_votar;
  end if;
end;
$$;

grant execute on function public.votar_encuesta(uuid, uuid[]) to authenticated;

-- ============================================================
-- Realtime: permitir que los clientes se suscriban a cambios
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'encuestas'
  ) then
    alter publication supabase_realtime add table public.encuestas;
  end if;
end;
$$;

-- ============================================================
-- Seguimiento de lecturas de encuestas finalizadas
-- ============================================================

create table if not exists public.encuestas_lecturas (
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  leida_at timestamptz not null default now(),
  primary key (id_encuesta, user_id)
);

alter table public.encuestas_lecturas enable row level security;

drop policy if exists "encuestas_lecturas_select_own" on public.encuestas_lecturas;
create policy "encuestas_lecturas_select_own"
on public.encuestas_lecturas
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "encuestas_lecturas_insert_own" on public.encuestas_lecturas;
create policy "encuestas_lecturas_insert_own"
on public.encuestas_lecturas
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "encuestas_lecturas_update_own" on public.encuestas_lecturas;
create policy "encuestas_lecturas_update_own"
on public.encuestas_lecturas
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'encuestas_lecturas'
  ) then
    alter publication supabase_realtime add table public.encuestas_lecturas;
  end if;
end;
$$;

-- ============================================================
-- Eliminación de encuestas por participante
-- ============================================================

create table if not exists public.encuestas_eliminadas (
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (id_encuesta, user_id)
);

alter table public.encuestas_eliminadas enable row level security;

drop policy if exists "encuestas_eliminadas_select_own" on public.encuestas_eliminadas;
create policy "encuestas_eliminadas_select_own"
on public.encuestas_eliminadas
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "encuestas_eliminadas_insert_own" on public.encuestas_eliminadas;
create policy "encuestas_eliminadas_insert_own"
on public.encuestas_eliminadas
for insert
to authenticated
with check (user_id = auth.uid());

-- RPC: salir de una encuesta activa (solo si no se ha votado)
create or replace function public.salir_encuesta(p_id_encuesta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_ha_votado boolean;
  v_finalizada boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select phone into v_phone from public.profiles where id = auth.uid();
  if v_phone is null then
    raise exception 'profile_incomplete';
  end if;

  select finalizada into v_finalizada from public.encuestas where id = p_id_encuesta;
  if v_finalizada then
    raise exception 'encuesta_finalizada';
  end if;

  select exists(
    select 1 from public.encuestas_ha_votado
    where id_encuesta = p_id_encuesta and user_id = auth.uid()
  ) into v_ha_votado;

  if v_ha_votado then
    raise exception 'ya_votaste_no_puedes_salir';
  end if;

  delete from public.encuestas_usuarios
  where id_encuesta = p_id_encuesta and phone_usuario = v_phone;

  update public.encuestas
  set
    votantes = votantes - 1,
    personas_a_votar = personas_a_votar - 1,
    finalizada = case when personas_votadas >= personas_a_votar - 1 then true else finalizada end,
    finalizada_at = case when personas_votadas >= personas_a_votar - 1 then now() else finalizada_at end
  where id = p_id_encuesta and votantes > 1;
end;
$$;

grant execute on function public.salir_encuesta(uuid) to authenticated;

-- RPC: eliminar encuesta finalizada del dispositivo del usuario
-- Si todos los participantes la han eliminado, se borra definitivamente
create or replace function public.eliminar_encuesta_finalizada(p_id_encuesta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finalizada boolean;
  v_total_votantes int;
  v_eliminados int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select finalizada, votantes into v_finalizada, v_total_votantes
  from public.encuestas where id = p_id_encuesta;

  if not v_finalizada then
    raise exception 'no_finalizada';
  end if;

  insert into public.encuestas_eliminadas (id_encuesta, user_id)
  values (p_id_encuesta, auth.uid())
  on conflict do nothing;

  select count(*) into v_eliminados
  from public.encuestas_eliminadas
  where id_encuesta = p_id_encuesta;

  if v_eliminados >= v_total_votantes then
    delete from public.encuestas where id = p_id_encuesta;
  end if;
end;
$$;

grant execute on function public.eliminar_encuesta_finalizada(uuid) to authenticated;

-- ============================================================
-- Grupos de contactos (privados por usuario)
-- ============================================================

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  imagen_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.grupos_miembros (
  id_grupo uuid not null references public.grupos(id) on delete cascade,
  phone text not null,
  nick text,
  primary key (id_grupo, phone)
);

alter table public.grupos enable row level security;
alter table public.grupos_miembros enable row level security;

drop policy if exists "grupos_select_own" on public.grupos;
create policy "grupos_select_own"
on public.grupos
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "grupos_insert_own" on public.grupos;
create policy "grupos_insert_own"
on public.grupos
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "grupos_delete_own" on public.grupos;
create policy "grupos_delete_own"
on public.grupos
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "grupos_miembros_select" on public.grupos_miembros;
create policy "grupos_miembros_select"
on public.grupos_miembros
for select
to authenticated
using (
  exists (select 1 from public.grupos where id = id_grupo and user_id = auth.uid())
);

drop policy if exists "grupos_miembros_insert" on public.grupos_miembros;
create policy "grupos_miembros_insert"
on public.grupos_miembros
for insert
to authenticated
with check (
  exists (select 1 from public.grupos where id = id_grupo and user_id = auth.uid())
);

-- RPC: crear grupo con miembros
create or replace function public.crear_grupo(
  p_nombre text,
  p_phones text[],
  p_imagen_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  p_phone text;
  v_nick text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if trim(coalesce(p_nombre, '')) = '' then
    raise exception 'nombre_vacio';
  end if;

  insert into public.grupos (user_id, nombre, imagen_url)
  values (auth.uid(), trim(p_nombre), p_imagen_url)
  returning id into v_id;

  foreach p_phone in array p_phones loop
    select pr.nick into v_nick
    from public.profiles pr
    where pr.phone = p_phone
    limit 1;

    insert into public.grupos_miembros (id_grupo, phone, nick)
    values (v_id, p_phone, v_nick);
  end loop;

  return v_id;
end;
$$;

grant execute on function public.crear_grupo(text, text[], text) to authenticated;

-- ============================================================
-- Push notifications
-- ============================================================

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
on public.push_tokens
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
on public.push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
on public.push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ============================================================
-- Config: versión mínima forzar actualización
-- ============================================================

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

insert into public.app_config (key, value) values ('min_version', '1.0.0')
on conflict (key) do nothing;
