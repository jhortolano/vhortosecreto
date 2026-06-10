-- Encuestas abiertas: columnas, índices, RPCs

alter table public.encuestas add column if not exists abierta boolean not null default false;
alter table public.encuestas add column if not exists link_uuid text;
create unique index if not exists encuestas_link_uuid_idx on public.encuestas (link_uuid) where link_uuid is not null;

-- Recrear create_encuesta_bundle con parámetros de encuesta abierta
create or replace function public.create_encuesta_bundle(
  p_titulo text,
  p_multiopcion boolean,
  p_opciones text[],
  p_phones_participantes text[],
  p_imagen_key text default null,
  p_imagen_url text default null,
  p_abierta boolean default false,
  p_link_uuid text default null
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

  if coalesce(p_abierta, false) then
    v_votantes := 1;

    insert into public.encuestas (
      titulo, owner, owner_nick, finalizada, votantes, multiopcion, personas_a_votar,
      personas_votadas, abierta, link_uuid
    )
    values (
      trim(p_titulo),
      v_owner,
      v_owner_nick,
      false,
      v_votantes,
      coalesce(p_multiopcion, false),
      1,
      0,
      true,
      coalesce(p_link_uuid, gen_random_uuid()::text)
    )
    returning id into v_uid;
  else
    v_phones := array(
      select distinct trim(x)
      from unnest(coalesce(p_phones_participantes, array[]::text[])) as x
      where trim(coalesce(x, '')) <> ''
    );

    if cardinality(v_phones) > 0 then
      for i in 1..cardinality(v_phones) loop
        if v_phones[i] not like '+%' then
          v_phones[i] := left(v_owner, length(v_owner) - length(v_phones[i])) || v_phones[i];
        end if;
      end loop;
    end if;

    v_phones := array(
      select distinct trim(x)
      from unnest(v_phones) as x
      where trim(coalesce(x, '')) <> ''
    );

    v_n_parts := coalesce(cardinality(v_phones), 0);
    v_votantes := 1 + v_n_parts;

    insert into public.encuestas (titulo, owner, owner_nick, finalizada, votantes, multiopcion, personas_a_votar, personas_votadas)
    values (trim(p_titulo), v_owner, v_owner_nick, false, v_votantes, coalesce(p_multiopcion, false), v_votantes, 0)
    returning id into v_uid;

    insert into public.encuestas_usuarios (id_encuesta, phone_usuario, nick_usuario)
    values (v_uid, v_owner, v_owner_nick);

    for i in 1..v_n_parts loop
      p_phone := v_phones[i];

      v_nick := '';
      select trim(coalesce(nick, '')) into v_nick
      from public.profiles where phone = p_phone;
      if v_nick = '' then
        v_nick := 'Invitado';
      end if;

      insert into public.encuestas_usuarios (id_encuesta, phone_usuario, nick_usuario)
      values (v_uid, p_phone, v_nick);
    end loop;
  end if;

  for i in 1..v_n_ops loop
    insert into public.encuestas_opciones (id_encuesta, opcion_texto, total_votos)
    values (v_uid, v_opciones[i], 0);
  end loop;

  if p_imagen_key is not null and p_imagen_url is not null then
    insert into public.encuesta_imagenes (id_encuesta, r2_key, r2_url)
    values (v_uid, p_imagen_key, p_imagen_url);
  end if;

  return v_uid;
end;
$$;

grant execute on function public.create_encuesta_bundle(text, boolean, text[], text[], text, text, boolean, text) to authenticated;

-- Recrear votar_encuesta con soporte para encuestas abiertas
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
  v_encuesta_abierta boolean;
  v_already_voted boolean;
  v_personas_a_votar int;
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

  select e.owner, e.multiopcion, e.finalizada, e.abierta, e.personas_a_votar
  into v_owner, v_multiopcion, v_encuesta_finalizada, v_encuesta_abierta, v_personas_a_votar
  from public.encuestas e
  where e.id = p_id_encuesta;

  if v_owner is null then
    raise exception 'encuesta_not_found';
  end if;

  if v_encuesta_finalizada then
    raise exception 'encuesta_finalizada';
  end if;

  if not coalesce(v_encuesta_abierta, false) then
    if v_owner <> v_phone and not exists (
      select 1 from public.encuestas_usuarios eu
      where eu.id_encuesta = p_id_encuesta and eu.phone_usuario = v_phone
    ) then
      raise exception 'no_autorizado';
    end if;
  end if;

  if not v_multiopcion and coalesce(cardinality(p_opcion_ids), 0) > 1 then
    raise exception 'solo_un_voto';
  end if;

  select exists(
    select 1 from public.encuestas_ha_votado
    where id_encuesta = p_id_encuesta and user_id = auth.uid()
  ) into v_already_voted;

  if not v_multiopcion and v_already_voted then
    raise exception 'ya_votaste';
  end if;

  insert into public.encuestas_votos (id_encuesta, opcion_id)
  select p_id_encuesta, unnest(p_opcion_ids);

  update public.encuestas_opciones o
  set total_votos = (
    select count(*) from public.encuestas_votos v
    where v.id_encuesta = o.id_encuesta and v.opcion_id = o.id
  )
  where o.id_encuesta = p_id_encuesta;

  if not v_already_voted then
    insert into public.encuestas_ha_votado (id_encuesta, user_id)
    values (p_id_encuesta, auth.uid())
    on conflict do nothing;

    if coalesce(v_encuesta_abierta, false) then
      null;
    else
      update public.encuestas
      set
        personas_votadas = personas_votadas + 1,
        finalizada = case when personas_votadas + 1 >= personas_a_votar then true else finalizada end,
        finalizada_at = case when personas_votadas + 1 >= personas_a_votar then now() else finalizada_at end
      where id = p_id_encuesta and personas_votadas < personas_a_votar;
    end if;
  end if;
end;
$$;

grant execute on function public.votar_encuesta(uuid, uuid[]) to authenticated;

-- RPC: obtener encuesta por link_uuid (bypass RLS)
create or replace function public.get_encuesta_by_link(p_link_uuid text)
returns table (
  id uuid,
  titulo text,
  owner text,
  owner_nick text,
  finalizada boolean,
  multiopcion boolean,
  abierta boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select e.id, e.titulo, e.owner, e.owner_nick, e.finalizada, e.multiopcion, e.abierta
  from public.encuestas e
  where e.link_uuid = p_link_uuid and e.abierta = true;
end;
$$;

grant execute on function public.get_encuesta_by_link(text) to authenticated;

-- RPC: obtener opciones de encuesta (bypass RLS para encuestas abiertas)
create or replace function public.get_encuesta_opciones(p_id_encuesta uuid)
returns table (id uuid, opcion_texto text, total_votos int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select o.id, o.opcion_texto, o.total_votos
  from public.encuestas_opciones o
  where o.id_encuesta = p_id_encuesta;
end;
$$;

grant execute on function public.get_encuesta_opciones(uuid) to authenticated;

-- RPC: obtener imagen de encuesta (bypass RLS para encuestas abiertas)
create or replace function public.get_encuesta_imagen(p_id_encuesta uuid)
returns table (r2_key text, r2_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select i.r2_key, i.r2_url
  from public.encuesta_imagenes i
  where i.id_encuesta = p_id_encuesta;
end;
$$;

grant execute on function public.get_encuesta_imagen(uuid) to authenticated;

-- Eliminar visibilidad pública de encuestas abiertas (solo se accede vía link)
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
        or exists (
          select 1 from public.encuestas_ha_votado hv
          join public.profiles pr on pr.id = hv.user_id
          where hv.id_encuesta = e.id and pr.phone = p_phone
        )
      )
  );
$$;

-- Fix finalizar_encuesta_parcial para encuestas abiertas (personas_a_votar >= 1)
create or replace function public.finalizar_encuesta_parcial(p_id_encuesta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner text;
  v_phone text;
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

  select e.owner into v_owner
  from public.encuestas e
  where e.id = p_id_encuesta;

  if v_owner is null then
    raise exception 'encuesta_not_found';
  end if;

  if v_owner <> v_phone then
    raise exception 'solo_el_creador';
  end if;

  delete from public.encuestas_usuarios eu
  where eu.id_encuesta = p_id_encuesta
    and eu.phone_usuario not in (
      select pr.phone
      from public.encuestas_ha_votado ehv
      join public.profiles pr on pr.id = ehv.user_id
      where ehv.id_encuesta = p_id_encuesta
    );

  update public.encuestas
  set
    finalizada = true,
    finalizada_at = now(),
    votantes = greatest(personas_votadas, 1),
    personas_a_votar = greatest(personas_votadas, 1)
  where id = p_id_encuesta and not finalizada;
end;
$$;

grant execute on function public.finalizar_encuesta_parcial(uuid) to authenticated;
