-- RPC: obtener teléfonos de usuarios que han votado (bypass RLS)
-- Ejecutar DROP primero si la función ya existe con otro return type

drop function if exists get_encuesta_votantes(uuid) cascade;

create function public.get_encuesta_votantes(
  p_id_encuesta uuid
)
returns table (phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select pr.phone
  from public.encuestas_ha_votado hv
  join public.profiles pr on pr.id = hv.user_id
  where hv.id_encuesta = p_id_encuesta
    and pr.phone is not null;
end;
$$;

grant execute on function public.get_encuesta_votantes(uuid) to authenticated;
