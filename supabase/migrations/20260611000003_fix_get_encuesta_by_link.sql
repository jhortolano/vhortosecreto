-- Fix: return personas_votadas and votantes from get_encuesta_by_link
drop function if exists public.get_encuesta_by_link(text);

create function public.get_encuesta_by_link(p_link_uuid text)
returns table (
  id uuid,
  titulo text,
  owner text,
  owner_nick text,
  finalizada boolean,
  multiopcion boolean,
  abierta boolean,
  personas_votadas int,
  votantes int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select e.id, e.titulo, e.owner, e.owner_nick, e.finalizada, e.multiopcion, e.abierta, e.personas_votadas, e.votantes
  from public.encuestas e
  where e.link_uuid = p_link_uuid and e.abierta = true;
end;
$$;

grant execute on function public.get_encuesta_by_link(text) to authenticated;
