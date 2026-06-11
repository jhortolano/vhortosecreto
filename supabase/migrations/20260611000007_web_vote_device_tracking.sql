-- Track web voting devices to prevent double votes
-- Uses device_uuid (localStorage) + IP + User-Agent for logging

create table if not exists public.encuestas_web_voto_tracking (
  id bigint generated always as identity primary key,
  id_encuesta uuid not null references public.encuestas(id) on delete cascade,
  device_uuid text not null,
  user_web text not null,
  ip_address text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists encuestas_web_voto_tracking_device_unique
  on public.encuestas_web_voto_tracking (id_encuesta, device_uuid);

grant select, insert on public.encuestas_web_voto_tracking to service_role;

create or replace function public.votar_encuesta_web(
  p_id_encuesta uuid,
  p_opcion_ids uuid[],
  p_user_web text,
  p_device_uuid text default null,
  p_ip_address text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_multiopcion boolean;
  v_encuesta_finalizada boolean;
  v_encuesta_abierta boolean;
  v_already_voted boolean;
begin
  if p_user_web is null or trim(p_user_web) = '' then
    raise exception 'nick_required';
  end if;

  if coalesce(cardinality(p_opcion_ids), 0) = 0 then
    raise exception 'voto_requerido';
  end if;

  select e.multiopcion, e.finalizada, e.abierta
  into v_multiopcion, v_encuesta_finalizada, v_encuesta_abierta
  from public.encuestas e
  where e.id = p_id_encuesta;

  if v_encuesta_finalizada is null then
    raise exception 'encuesta_not_found';
  end if;

  if v_encuesta_finalizada then
    raise exception 'encuesta_finalizada';
  end if;

  if not coalesce(v_encuesta_abierta, false) then
    raise exception 'solo_encuestas_abiertas';
  end if;

  if not v_multiopcion and coalesce(cardinality(p_opcion_ids), 0) > 1 then
    raise exception 'solo_un_voto';
  end if;

  select exists(
    select 1 from public.encuestas_ha_votado
    where id_encuesta = p_id_encuesta and user_web = trim(p_user_web)
  ) into v_already_voted;

  if not v_multiopcion and v_already_voted then
    raise exception 'ya_votaste';
  end if;

  if p_device_uuid is not null then
    if exists (
      select 1 from public.encuestas_web_voto_tracking
      where id_encuesta = p_id_encuesta and device_uuid = p_device_uuid
    ) then
      raise exception 'ya_votaste';
    end if;
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
    insert into public.encuestas_ha_votado (id_encuesta, user_id, user_web)
    values (p_id_encuesta, null, trim(p_user_web));

    update public.encuestas
    set
      personas_votadas = personas_votadas + 1,
      personas_a_votar = personas_votadas + 1
    where id = p_id_encuesta;
  end if;

  if p_device_uuid is not null then
    insert into public.encuestas_web_voto_tracking (id_encuesta, device_uuid, user_web, ip_address, user_agent)
    values (p_id_encuesta, p_device_uuid, trim(p_user_web), p_ip_address, p_user_agent);
  end if;
end;
$$;

grant execute on function public.votar_encuesta_web(uuid, uuid[], text, text, text, text) to anon;
grant execute on function public.votar_encuesta_web(uuid, uuid[], text, text, text, text) to authenticated;

-- Check if a web device has already voted and return their nick + selected option ids
create or replace function public.get_encuesta_web_voto(
  p_id_encuesta uuid,
  p_device_uuid text
)
returns table (user_web text, opcion_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select t.user_web, array_agg(v.opcion_id) as opcion_ids
  from public.encuestas_web_voto_tracking t
  join public.encuestas_votos v on v.id_encuesta = t.id_encuesta
  where t.id_encuesta = p_id_encuesta and t.device_uuid = p_device_uuid
  group by t.user_web;
end;
$$;

grant execute on function public.get_encuesta_web_voto(uuid, text) to anon;
grant execute on function public.get_encuesta_web_voto(uuid, text) to authenticated;
