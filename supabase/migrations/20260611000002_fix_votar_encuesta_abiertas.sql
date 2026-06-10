-- Fix: increment personas_votadas for open surveys
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
      update public.encuestas
      set
        personas_votadas = personas_votadas + 1,
        personas_a_votar = personas_votadas + 1
      where id = p_id_encuesta;
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
