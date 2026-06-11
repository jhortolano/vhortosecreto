-- Allow unauthenticated web voting for open surveys

-- 1. Alter encuestas_ha_votado to support web users (no auth.uid)
alter table public.encuestas_ha_votado
  drop constraint encuestas_ha_votado_pkey cascade;

alter table public.encuestas_ha_votado
  add column id bigint generated always as identity primary key;

alter table public.encuestas_ha_votado
  alter column user_id drop not null;

alter table public.encuestas_ha_votado
  add column user_web text default null;

create unique index if not exists encuestas_ha_votado_user_unique
  on public.encuestas_ha_votado (id_encuesta, user_id)
  where user_id is not null;

create unique index if not exists encuestas_ha_votado_web_unique
  on public.encuestas_ha_votado (id_encuesta, user_web)
  where user_web is not null;

-- 2. RPC for web voting (no auth required, stores nick in user_web)
create or replace function public.votar_encuesta_web(
  p_id_encuesta uuid,
  p_opcion_ids uuid[],
  p_user_web text
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
end;
$$;

grant execute on function public.votar_encuesta_web(uuid, uuid[], text) to anon;
grant execute on function public.votar_encuesta_web(uuid, uuid[], text) to authenticated;

-- Add RPC get_encuesta_by_link to anon access for web voting page
grant execute on function public.get_encuesta_by_link(text) to anon;
grant execute on function public.get_encuesta_imagen(uuid) to anon;
grant execute on function public.get_encuesta_opciones(uuid) to anon;
