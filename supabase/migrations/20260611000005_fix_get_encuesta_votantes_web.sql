-- Update get_encuesta_votantes to include web voters (user_web)
drop function if exists public.get_encuesta_votantes(uuid) cascade;

create function public.get_encuesta_votantes(
  p_id_encuesta uuid
)
returns table (phone text, nick text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select pr.phone, null::text as nick
  from public.encuestas_ha_votado hv
  join public.profiles pr on pr.id = hv.user_id
  where hv.id_encuesta = p_id_encuesta
    and pr.phone is not null
  union all
  select null::text, hv.user_web
  from public.encuestas_ha_votado hv
  where hv.id_encuesta = p_id_encuesta
    and hv.user_web is not null;
end;
$$;

grant execute on function public.get_encuesta_votantes(uuid) to authenticated;
grant execute on function public.get_encuesta_votantes(uuid) to anon;
