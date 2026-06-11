-- Fix: exclude web voters (user_id is null) from delete count
create or replace function public.eliminar_encuesta_finalizada(p_id_encuesta uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_finalizada boolean;
  v_abierta boolean;
  v_total_posibles int;
  v_eliminados int;
  v_deleted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select finalizada, abierta into v_finalizada, v_abierta
  from public.encuestas where id = p_id_encuesta;

  if not v_finalizada then
    raise exception 'no_finalizada';
  end if;

  if v_abierta then
    select count(*) into v_total_posibles
    from (
      select p.id as user_id
      from public.encuestas e
      join public.profiles p on p.phone = e.owner
      where e.id = p_id_encuesta
      union
      select hv.user_id
      from public.encuestas_ha_votado hv
      where hv.id_encuesta = p_id_encuesta
        and hv.user_id is not null
    ) t;
  else
    select votantes into v_total_posibles
    from public.encuestas where id = p_id_encuesta;
  end if;

  insert into public.encuestas_eliminadas (id_encuesta, user_id)
  values (p_id_encuesta, auth.uid())
  on conflict do nothing;

  select count(*) into v_eliminados
  from public.encuestas_eliminadas
  where id_encuesta = p_id_encuesta;

  if v_eliminados >= v_total_posibles then
    delete from public.encuestas where id = p_id_encuesta;
    if found then
      v_deleted := true;
    end if;
  end if;

  return v_deleted;
end;
$$;

grant execute on function public.eliminar_encuesta_finalizada(uuid) to authenticated;
